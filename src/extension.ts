import * as vscode from 'vscode';
import { DisposeCodeLensProvider } from './provider/codelens';
import { goLibraryModule } from './core/library/integration';
import { Logger } from './pkg/logger';  // 新增日志模块导入
import { Home } from './core/home/home';  // 导入工作空间导航器模块
import { TranslationProvider } from './core/translation/provider';  // 导入翻译提供程序
import { DisposeCommands } from './command/commands';
import { GoLibraryTreeData } from './core/library/tree';  // 导入Go Library树视图数据模块

/*

          ,_---~~~~~----._
   _,,_,*^____      _____``*g*\"*,
  / __/ /'     ^.  /      \ ^@q   f
 [  @f | @))    |  | @))   l  0 _/
  \`/   \~____ / __ \_____/    \
   |           _l__l_           I
   }          [______]           I
   ]            | | |            |
   ]             ~ ~             |
   |                            |
    |                           |

 */

// 初始化日志实例
const logger = Logger.withContext('Extension');

// 定义状态栏项目
let workspaceNavigatorStatusBarItem: vscode.StatusBarItem;

// 记录deactivate函数
let goLibraryDeactivate: (() => void) | undefined;

// 添加一个Set来跟踪已注册的命令，避免重复注册
const registeredCommands = new Set<string>();

// 安全注册命令的辅助函数
function registerCommandSafely(context: vscode.ExtensionContext, commandId: string, handler: (...args: any[]) => any): void {
    // 规范化命令ID
    const normalizedId = commandId.startsWith('gopp.') ? `gopp.${commandId.substring(5)}` : commandId;

    // 检查命令是否已注册
    if (registeredCommands.has(normalizedId)) {
        console.warn(`跳过重复注册的命令: ${normalizedId} / Skipping duplicate command registration: ${normalizedId}`);
        return;
    }

    // 注册命令并记录
    const disposable = vscode.commands.registerCommand(normalizedId, handler);
    context.subscriptions.push(disposable);
    registeredCommands.add(normalizedId);
}

/**
 * 扩展激活函数
 * 当扩展被激活时，会调用此函数
 * @param context 扩展上下文
 */
export function activate(context: vscode.ExtensionContext) {
    logger.info('gopp is now active!');

    try {
        // 创建状态栏项目 - 使用新模块
        workspaceNavigatorStatusBarItem = Home.createStatusBarItem(context);

        context.subscriptions.push(
            DisposeCodeLensProvider(context),
            ...DisposeCommands(context) // 注册命令
        );

        // Go Library 树视图实例
        const goLibraryTreeData = new GoLibraryTreeData(context);

        // 激活Go Library模块
        goLibraryModule.activate(context).then(deactivateFunc => {
            goLibraryDeactivate = deactivateFunc;
            logger.info('Go Library模块激活成功');
        }).catch(err => {
            logger.error('Go Library模块激活失败:', err);
            vscode.window.showErrorMessage(`Go Library激活失败: ${err}`);
        });

        // 注册刷新模块树命令
        registerCommandSafely(context, 'golibrary.refresh', async () => {
            // 显示进度提示
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: '正在刷新 Go 模块树',
                    cancellable: false
                },
                async (progress) => {
                    progress.report({ increment: 0 });
                    try {
                        // 刷新树视图
                        await goLibraryTreeData.refreshModules();
                        progress.report({ increment: 100 });
                        vscode.window.showInformationMessage('Go 模块树刷新成功！');
                    } catch (error) {
                        vscode.window.showErrorMessage(`刷新 Go 模块树失败: ${error}`);
                    }
                }
            );
        });

        // 注册翻译提供程序
        TranslationProvider.register(context);
        logger.info('翻译功能已激活');

        logger.info('gopp全部模块激活完成');
    } catch (err) {
        logger.error('扩展激活失败:', err);
        vscode.window.showErrorMessage(`gopp激活失败: ${err}`);
    }
}

/**
 * 扩展停用函数
 * 当扩展被停用时，会调用此函数
 */
export function deactivate() {
    logger.info('正在停用gopp');

    // 调用Go Library的deactivate函数
    if (goLibraryDeactivate) {
        goLibraryDeactivate();
    }

    // 清理资源
    if (workspaceNavigatorStatusBarItem) {
        workspaceNavigatorStatusBarItem.dispose();
    }

    logger.info('gopp停用完成');
}
