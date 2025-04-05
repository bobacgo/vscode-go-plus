import * as vscode from 'vscode';
import { checkGo } from '../../pkg/go';
import { registerGoModCommands } from '../../command/go_mod';
import { GoLibraryTreeData } from './tree';
import { Logger } from '../../pkg/logger';

const logger = Logger.withContext('GoLibrary');

/**
 * Go Library Module Integration
 * Go Library 模块集成
 */
export const goLibraryModule = {
    activate: async (context: vscode.ExtensionContext): Promise<() => void> => {
        logger.info('Go Library 模块激活开始');
        
        checkGo();
        
        const modTreeProvider = new GoLibraryTreeData(context);
        modTreeProvider.watch();
        
        // 注册命令
        registerGoModCommands(context, modTreeProvider);
        
        // 设置上下文
        await vscode.commands.executeCommand('setContext', 'go.isExtensionActive', true);
        await vscode.commands.executeCommand('setContext', 'gomod.running', true);
        await vscode.commands.executeCommand('setContext', 'golibrary.running', true);
        
        // 返回停用函数
        return () => {
            vscode.commands.executeCommand('setContext', 'go.isExtensionActive', false);
            vscode.commands.executeCommand('setContext', 'gomod.running', false);
            vscode.commands.executeCommand('setContext', 'golibrary.running', false);
        };
    }
};

// 导出额外需要的类型和函数
export type { GoLibraryTreeData };
export { checkGo, registerGoModCommands };