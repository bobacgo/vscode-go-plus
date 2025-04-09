import * as vscode from 'vscode';
import { Logger } from '../pkg/logger';
import { Home } from '../core/home/home';  // 导入工作空间导航器模块

const logger = Logger.withContext('Home');

/**
 * 注册命令以显示工作空间导航器
 * Register command to show workspace navigator
 * @param ctx 扩展上下文 (extension context)
 * @param cmd 命令名称 (command name)
 */
export function registerCommandWorkspaceNavigator(ctx : vscode.ExtensionContext, cmd : string) : vscode.Disposable {
    return vscode.commands.registerCommand(cmd, async () => {
        await Home.showNavigationMenu(ctx);
    });
}
