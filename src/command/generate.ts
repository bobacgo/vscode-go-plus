import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { InterfaceInfo, StructOption, StructField } from '../types';
import { findInterfaces } from '../pkg/file';

/**
 * 注册命令以生成选项菜单
 * Register command to generate options menu
 * @param cmd 命令名称 (command name)
 */
export function registerCommandGenerateOptions(cmd: string): vscode.Disposable {
    return vscode.commands.registerCommand(cmd, async (structName: string, filePath: string, line: number) => {
        const isTestFile = filePath.endsWith('_test.go');

        // 根据文件类型提供不同的选项
        const options = isTestFile ? [
            { label: 'Implement Interface Methods', description: 'Implement specified interface for struct', command: 'gopp.generateInterfaceStubs' },
            { label: 'Generate Option Pattern Code', description: 'Generate Option pattern code', command: 'gopp.generateOptionCode' }
        ] : [
            { label: 'Implement Interface Methods', description: 'Implement specified interface for struct', command: 'gopp.generateInterfaceStubs' },
            { label: 'Generate Unit Tests', description: 'Generate test file for current file', command: 'go.test.generate.file' },
            { label: 'Generate Option Pattern Code', description: 'Generate Option pattern code', command: 'gopp.generateOptionCode' }
        ];

        const selection = await vscode.window.showQuickPick(options, {
            placeHolder: '选择要生成的代码类型'
        });

        if (selection) {
            await vscode.commands.executeCommand(selection.command, structName, filePath, line);
        }
    });
}

/**
 * 注册命令以生成Option代码
 * Register command to generate Option code
 * @param cmd 命令名称 (command name)
 */
export function registerCommandGenerateOptionCode(cmd: string): vscode.Disposable {
    return vscode.commands.registerCommand(cmd, async (structName: string, filePath: string, line: number, fields: StructField[]) => {
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
    
    for (_, opt := range opts) {
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
    });
}

/**
 * 注册命令以生成接口实现
 * Register command to generate interface implementations
 * @param cmd 命令名称 (command name)
 */
export function registerCommandGenerateInterfaceStubs(cmd: string): vscode.Disposable {
    return vscode.commands.registerCommand(cmd, async (structName: string, filePath: string, line: number) => {
        // 查找所有接口
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
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
}

/**
 * 注册命令以显示结构选项
 * Register command to show struct options
 * @param cmd 命令名称 (command name)
 */
export function registerCommandShowStructOptions(cmd : string) : vscode.Disposable {
    return vscode.commands.registerCommand(cmd, async (args) => {
        const items: StructOption[] = args.options.map((option: any) => ({
            label: option.label,
            command: option.command,
            args: option.arguments
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择操作'
        });

        if (selected) {
            await vscode.commands.executeCommand(selected.command, ...selected.args);
        }
    });
}

/**
 * 注册命令以生成结构体标签
 * Register command to generate struct tags
 * @param cmd 命令名称 (command name)
 */
export function registerCommandGenerateStructTags(cmd : string) : vscode.Disposable {
    return vscode.commands.registerCommand(cmd, async (structName: string, filePath: string, line: number, fields: StructField[]) => {
        // 1. 弹出输入框让用户输入标签名称
        const tagName = await vscode.window.showInputBox({
            prompt: '请输入标签名称（例如：json, xml, yaml）',
            placeHolder: 'json'
        });

        if (!tagName) {
            return;
        }

        // 2. 询问值格式
        const formatType = await vscode.window.showQuickPick(
            [
                { label: '驼峰格式', value: 'camel' },
                { label: '下划线格式', value: 'snake' }
            ],
            { placeHolder: '请选择字段值格式' }
        );

        if (!formatType) {
            return;
        }

        // 2. 生成带标签的字段
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const changes: vscode.TextEdit[] = [];

            // 仅处理导出字段
            for (const field of fields.filter(f => f.isExported)) {
                const line = field.line;
                const lineText = document.lineAt(line).text;
                const currentTags = lineText.match(/`.*`$/);

                // 根据选择的格式转换字段名
                const tagValue = formatType.value === 'camel'
                    ? field.name.charAt(0).toLowerCase() + field.name.slice(1)
                    : field.name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');

                const newTag = `${tagName}:"${tagValue}"`;

                if (currentTags) {
                    // 检查是否已存在相同的标签
                    const existingTags = currentTags[0].slice(1, -1);
                    const tagExists = new RegExp(`${tagName}:"[^"]*"`).test(existingTags);

                    if (!tagExists) {
                        // 已有其他标签，添加新标签
                        const updatedTags = `\`${existingTags} ${newTag}\``;
                        changes.push(vscode.TextEdit.replace(
                            new vscode.Range(line, lineText.lastIndexOf('`') - 1, line, lineText.length),
                            updatedTags
                        ));
                    }
                } else {
                    // 没有标签，添加新标签
                    changes.push(vscode.TextEdit.insert(
                        new vscode.Position(line, lineText.length),
                        ' `' + newTag + '`'
                    ));
                }
            }

            // 应用所有修改
            const edit = new vscode.WorkspaceEdit();
            edit.set(document.uri, changes);
            await vscode.workspace.applyEdit(edit);
        }
    });
}

/**
 * 注册命令以生成函数测试
 * Register command to generate function test
 * @param cmd 命令名称 (command name)
 */
export function registerCommandFuncTest(cmd : string) : vscode.Disposable {
    return vscode.commands.registerCommand(cmd, async (args) => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            // 先定位到函数/方法
            await vscode.window.showTextDocument(args.uri);
            editor.selection = new vscode.Selection(args.position, args.position);
            // 调用 Go 插件的测试生成命令
            await vscode.commands.executeCommand('go.test.generate.function');
        }
    });
}
