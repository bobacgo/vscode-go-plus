import * as vscode from 'vscode';
import { Logger } from '../pkg/logger';
import { StructOption, StructField } from '../types';
import { Home } from '../core/home/home';
import { registerGenerateCommands } from './generate';
import { registerNavigationCommands } from './navigation';

const logger = Logger.withContext('Commands');


export function DisposeCommands(ctx : vscode.ExtensionContext) : Array<vscode.Disposable> {
    registerGenerateCommands(ctx); // 注册生成命令
    registerNavigationCommands(ctx); // 注册导航命令 TODO 移除
    return [
        registerCommandOpenFolder('gopp.openFolder'), // 打开最近项目
        registerCommandShowStructOptions('gopp.showStructOptions'), // 显示结构选项
        registerCommandGenerateStructTags('gopp.generateStructTags'), // 生成结构体标签
        registerCommandWorkspaceNavigator(ctx, 'gopp.workspaceNavigator'), // 工作空间导航器
        registerCommandFuncText('gopp.executeFunctionTest'), // 生成函数测试
    ];
}


/**
 * 注册命令以生成函数测试
 * Register command to generate function test
 * @param cmd 命令名称 (command name)
 */
function registerCommandFuncText(cmd : string) : vscode.Disposable {
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

/**
 * 注册命令以显示工作空间导航器
 * Register command to show workspace navigator
 * @param ctx 扩展上下文 (extension context)
 * @param cmd 命令名称 (command name)
 */
function registerCommandWorkspaceNavigator(ctx : vscode.ExtensionContext, cmd : string) : vscode.Disposable {
    return vscode.commands.registerCommand(cmd, async () => {
        await Home.showNavigationMenu(ctx);
    });
}
/**
 * 注册命令以生成结构体标签
 * Register command to generate struct tags
 * @param cmd 命令名称 (command name)
 */
function registerCommandGenerateStructTags(cmd : string) : vscode.Disposable {
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
 * 注册打开最近项目命令
 * Register command to open recent project
 * @param cmd 命令名称 (command name)
 */
function registerCommandOpenFolder(cmd : string) : vscode.Disposable {
    return vscode.commands.registerCommand(cmd, async (projectPath: string) => {
        try {
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectPath));
        } catch (err) {
            logger.error('打开最近项目失败:', err);
            vscode.window.showErrorMessage(`打开项目失败: ${err}`);
        }
    });
}

/**
 * 注册命令以显示结构选项
 * Register command to show struct options
 * @param cmd 命令名称 (command name)
 */
function registerCommandShowStructOptions(cmd : string) : vscode.Disposable {
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

