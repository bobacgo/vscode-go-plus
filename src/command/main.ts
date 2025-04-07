import * as vscode from 'vscode';
import * as path from 'path';

/**
 * 注册运行和调试命令
 * Register run and debug commands
 * @param context 扩展上下文 (extension context)
 */
export function registerRunCommands(context: vscode.ExtensionContext) {
    // 存储文件参数的状态
    // Store file arguments state
    const fileArgsMap = context.workspaceState.get<{[key: string]: string}>('goFileArgsMap') || {};

    // 注册运行main函数命令
    // Register run main function command
    context.subscriptions.push(
        vscode.commands.registerCommand('gopp.runMain', async (fileUri: vscode.Uri) => {
            await runGoFile(fileUri, false, fileArgsMap);
        })
    );

    // 注册调试main函数命令
    // Register debug main function command
    context.subscriptions.push(
        vscode.commands.registerCommand('gopp.debugMain', async (fileUri: vscode.Uri) => {
            await runGoFile(fileUri, true, fileArgsMap);
        })
    );

    // 注册带参数运行main函数命令
    // Register run main function with args command
    context.subscriptions.push(
        vscode.commands.registerCommand('gopp.runMainWithArgs', async (fileUri: vscode.Uri) => {
            await runGoFileWithArgs(fileUri, false, fileArgsMap, context);
        })
    );

    // 注册带参数调试main函数命令
    // Register debug main function with args command
    context.subscriptions.push(
        vscode.commands.registerCommand('gopp.debugMainWithArgs', async (fileUri: vscode.Uri) => {
            await runGoFileWithArgs(fileUri, true, fileArgsMap, context);
        })
    );

    // 注册设置main函数参数命令
    // Register set main function args command
    context.subscriptions.push(
        vscode.commands.registerCommand('gopp.setMainArgs', async (fileUri: vscode.Uri) => {
            await setGoFileArgs(fileUri, fileArgsMap, context);
        })
    );
}

/**
 * 获取文件参数并运行
 * Get file arguments and run
 * @param fileUri 文件URI (file URI)
 * @param debug 是否进入调试模式 (debug mode or not)
 * @param fileArgsMap 文件参数映射 (file arguments mapping)
 * @param context 扩展上下文 (extension context)
 */
async function runGoFileWithArgs(
    fileUri: vscode.Uri,
    debug: boolean,
    fileArgsMap: {[key: string]: string},
    context: vscode.ExtensionContext
): Promise<void> {
    if (!fileUri) {
        vscode.window.showErrorMessage('无法运行文件: 未提供文件路径');
        return;
    }

    const filePath = fileUri.fsPath;
    // 获取已保存的参数或默认为空
    // Get saved args or default to empty
    const savedArgs = fileArgsMap[filePath] || '';

    // 弹出输入框让用户输入参数
    // Show input box for user to enter args
    const args = await vscode.window.showInputBox({
        prompt: '请输入运行参数 (Enter arguments)',
        value: savedArgs,
        placeHolder: '例如: -v --config=config.json (Example: -v --config=config.json)'
    });

    if (args === undefined) {
        // 用户取消了输入
        // User cancelled input
        return;
    }

    // 保存参数
    // Save arguments
    fileArgsMap[filePath] = args;
    await context.workspaceState.update('goFileArgsMap', fileArgsMap);

    // 运行文件
    // Run file
    await runGoFile(fileUri, debug, fileArgsMap);
}

/**
 * 设置Go文件运行参数
 * Set Go file run arguments
 * @param fileUri 文件URI (file URI)
 * @param fileArgsMap 文件参数映射 (file arguments mapping)
 * @param context 扩展上下文 (extension context)
 */
async function setGoFileArgs(
    fileUri: vscode.Uri,
    fileArgsMap: {[key: string]: string},
    context: vscode.ExtensionContext
): Promise<void> {
    if (!fileUri) {
        vscode.window.showErrorMessage('无法设置参数: 未提供文件路径');
        return;
    }

    const filePath = fileUri.fsPath;
    // 获取已保存的参数或默认为空
    // Get saved args or default to empty
    const savedArgs = fileArgsMap[filePath] || '';

    // 弹出输入框让用户输入参数
    // Show input box for user to enter args
    const args = await vscode.window.showInputBox({
        prompt: '请输入运行参数 (Enter arguments)',
        value: savedArgs,
        placeHolder: '例如: -v --config=config.json (Example: -v --config=config.json)'
    });

    if (args === undefined) {
        // 用户取消了输入
        // User cancelled input
        return;
    }

    // 保存参数
    // Save arguments
    fileArgsMap[filePath] = args;
    await context.workspaceState.update('goFileArgsMap', fileArgsMap);

    // 显示保存成功的消息
    // Show success message
    vscode.window.showInformationMessage('参数已保存，可直接点击Run/Debug按钮运行 (Args saved, click Run/Debug to execute)');
}

/**
 * 运行Go文件
 * Run Go file
 * @param fileUri 文件URI (file URI)
 * @param debug 是否进入调试模式 (debug mode or not)
 * @param fileArgsMap 文件参数映射 (file arguments mapping)
 */
async function runGoFile(
    fileUri: vscode.Uri,
    debug: boolean,
    fileArgsMap: {[key: string]: string} = {}
): Promise<void> {
    if (!fileUri) {
        vscode.window.showErrorMessage('无法运行文件: 未提供文件路径');
        return;
    }

    const filePath = fileUri.fsPath;
    const directory = path.dirname(filePath);
    const fileName = path.basename(filePath);

    // 获取参数 - 如果没有保存过参数，则使用空字符串
    // Get arguments - use empty string if no args saved
    const args = fileArgsMap[filePath] || '';

    // 创建终端
    // Create terminal
    const terminal = vscode.window.createTerminal('Go Run');

    // 切换到文件所在目录
    // Change to file directory
    terminal.sendText(`cd "${directory}"`);

    if (debug) {
        // 使用delve调试器进行调试
        // Use delve debugger for debugging
        const dlvArgs = args ? `-- ${args}` : '';
        terminal.sendText(`dlv debug --headless --listen=:2345 --api-version=2 ${dlvArgs}`);

        // 启动调试会话
        // Start debug session
        const debugConfig = {
            type: 'go',
            name: 'Attach to Process',
            request: 'attach',
            mode: 'remote',
            remotePath: filePath,
            port: 2345,
            host: '127.0.0.1',
            showLog: true,
            cwd: directory
        };

        vscode.debug.startDebugging(undefined, debugConfig);
    } else {
        // 直接运行
        // Run directly
        terminal.sendText(`go run "${fileName}" ${args}`);
    }

    terminal.show();
}
