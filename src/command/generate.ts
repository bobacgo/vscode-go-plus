import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { InterfaceInfo, StructField } from '../types';
import { findInterfaces } from '../pkg/file';

export function registerGenerateCommands(context: vscode.ExtensionContext) {
    // 修改多项选择命令的实现
    context.subscriptions.push(
        vscode.commands.registerCommand('gopp.generateOptions', async (structName: string, filePath: string, line: number) => {
            const isTestFile = filePath.endsWith('_test.go');

            // 根据文件类型提供不同的选项
            const options = isTestFile ? [
                { label: '实现接口方法', description: '为结构体实现指定接口', command: 'gopp.generateInterfaceStubs' },
                { label: '生成 Option 代码', description: '生成 Option 模式代码', command: 'gopp.generateOptionCode' }
            ] : [
                { label: '实现接口方法', description: '为结构体实现指定接口', command: 'gopp.generateInterfaceStubs' },
                { label: '生成单元测试', description: '为当前文件生成测试文件', command: 'go.test.generate.file' },
                { label: '生成 Option 代码', description: '生成 Option 模式代码', command: 'gopp.generateOptionCode' }
            ];

            const selection = await vscode.window.showQuickPick(options, {
                placeHolder: '选择要生成的代码类型'
            });

            if (selection) {
                await vscode.commands.executeCommand(selection.command, structName, filePath, line);
            }
        })
    );

    // 注册 Option 代码生成命令
    context.subscriptions.push(
        vscode.commands.registerCommand('gopp.generateOptionCode', async (structName: string, filePath: string, line: number, fields: StructField[]) => {
            // 弹出多选框让用户选择字段
            const selectedFields = await vscode.window.showQuickPick(
                fields.map(field => ({
                    label: field.name,
                    description: field.type,
                    picked: true, // 默认选中所有字段
                    field
                })),
                {
                    canPickMany: true,
                    placeHolder: `请选择要为 ${structName} 生成 Option 方法的字段`
                }
            );

            if (!selectedFields || selectedFields.length === 0) {
                return;
            }

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const document = editor.document;
            const edit = new vscode.WorkspaceEdit();

            const unselectedFields = fields.filter(field => !selectedFields.some(selected => selected.field.name === field.name));

            // 1. 生成 Option 函数类型
            const optionType = `type ${structName}Option func(*${structName}Options)`;

            // 2. 生成 Options 结构体
            const optionsStruct = `type ${structName}Options struct {
${selectedFields.map(({ field }) => `    ${field.name} ${field.type}`).join('\n')}
}`;

            // 3. 生成 With 方法
            const withMethods = selectedFields.map(({ field }) => `
func With${field.name.charAt(0).toUpperCase() + field.name.slice(1)}(value ${field.type}) ${structName}Option {
    return func(o *${structName}Options) {
        o.${field.name} = value
    }
}`).join('\n');

            // 4. 生成实际结构体
            const actualStruct = `type ${structName} struct {
    *${structName}Options
${unselectedFields.map(field => `    ${field.name} ${field.type}`).join('\n')}
}`;

            // 5. 生成 New 构造函数
            const newFunc = `func New${structName}(opts ...${structName}Option) *${structName} {
    options := &${structName}Options{}
    
    for _, opt := range opts {
        opt(options)
    }
    
    return &${structName}{
        ${structName}Options: options,
        // TODO: 初始化其他字段
    }
}`;

            // 在原结构体位置插入完整的代码
            const generatedCode = `${optionType}\n\n${optionsStruct}\n\n${withMethods}\n\n${actualStruct}\n\n${newFunc}\n`;

            // 替换原有结构体定义
            let structEndLine = line;
            const lines = document.getText().split('\n');
            while (structEndLine < lines.length && !lines[structEndLine].includes('}')) {
                structEndLine++;
            }

            const replaceRange = new vscode.Range(
                new vscode.Position(line - 1, 0),  // 包含 type Xxx struct { 这一行
                new vscode.Position(structEndLine + 1, 0)  // 包含结束的 }
            );

            edit.replace(document.uri, replaceRange, generatedCode);
            await vscode.workspace.applyEdit(edit);

            // 格式化插入的代码
            await vscode.commands.executeCommand('editor.action.formatDocument');
        })
    );

    const disposable = vscode.commands.registerCommand('gopp.generateInterfaceStubs',
        async (structName: string, filePath: string, line: number) => {
            // 查找所有接口
            let workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspacePath) {
                return;
            }

            const interfaces = await findInterfaces(workspacePath);
            const items = interfaces.map((iface: InterfaceInfo) => ({
                label: iface.name,
                description: iface.filePath,
                filePath: iface.filePath // Include filePath property
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: '选择目标接口',
                matchOnDescription: true
            });

            if (!selected) {
                return;
            }

            // 获取当前文档信息
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            try {
                // 获取当前目录的模块信息
                const modOutput = cp.execSync('go list -m', {
                    cwd: path.dirname(selected.filePath)
                }).toString().trim();

                // 获取接口所在包的导入路径
                const pkgOutput = cp.execSync('go list -f "{{.ImportPath}}"', {
                    cwd: path.dirname(selected.filePath)
                }).toString().trim();

                // 构造完整的接口路径（使用包的导入路径）
                const interfacePath = `${pkgOutput}.${selected.label}`;

                const receiverType = `*${structName}`;
                const cmd = `impl '${receiverType}' '${interfacePath}'`;

                console.log(`Package path: ${pkgOutput}`); // 调试输出
                console.log(`Interface path: ${interfacePath}`); // 调试输出
                console.log(`Executing command: ${cmd}`); // 调试输出

                const output = cp.execSync(cmd, {
                    cwd: path.dirname(editor.document.uri.fsPath),
                    env: { ...process.env, GO111MODULE: 'on' } // 确保启用了 Go modules
                }).toString();

                // 将生成的代码插入到当前光标位置
                const position = editor.selection.active;
                await editor.edit(editBuilder => {
                    editBuilder.insert(position, '\n' + output);
                });

                // 格式化插入的代码
                await vscode.commands.executeCommand('editor.action.formatDocument');

                // 刷新接口缓存
                if (workspacePath) {
                    await findInterfaces(workspacePath);
                }
            } catch (err) {
                // 增强错误信息
                const errorMsg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`生成接口实现失败: ${errorMsg}`);
                console.error('完整错误信息:', err);
                console.error('当前工作目录:', path.dirname(editor.document.uri.fsPath));
            }
        });

    context.subscriptions.push(disposable);
}