import * as vscode from 'vscode';
import * as path from 'path';

/**
 * 注册运行main函数命令
 * Register run main function command
 * @param ctx 扩展上下文 (extension context)
 * @param cmd 命令名称 (command name)
 */
export function registerCommandRunMain(ctx: vscode.ExtensionContext, cmd: string): vscode.Disposable {
    // 获取文件参数映射
    // Get file arguments mapping
    const fileArgsMap = ctx.workspaceState.get<{[key: string]: string}>('goFileArgsMap') || {};

    return vscode.commands.registerCommand(cmd, async (fileUri: vscode.Uri) => {
        await runGoFile(fileUri, false, fileArgsMap);
    });
}

/**
 * 注册调试main函数命令
 * Register debug main function command
 * @param ctx 扩展上下文 (extension context)
 * @param cmd 命令名称 (command name)
 */
export function registerCommandDebugMain(ctx: vscode.ExtensionContext, cmd: string): vscode.Disposable {
    // 获取文件参数映射
    // Get file arguments mapping
    const fileArgsMap = ctx.workspaceState.get<{[key: string]: string}>('goFileArgsMap') || {};

    return vscode.commands.registerCommand(cmd, async (fileUri: vscode.Uri) => {
        await runGoFile(fileUri, true, fileArgsMap);
    });
}

/**
 * 注册设置main函数参数命令
 * Register set main function arguments command
 * @param ctx 扩展上下文 (extension context)
 * @param cmd 命令名称 (command name)
 */
export function registerCommandSetMainArgs(ctx: vscode.ExtensionContext, cmd: string): vscode.Disposable {
    // 获取文件参数映射
    // Get file arguments mapping
    const fileArgsMap = ctx.workspaceState.get<{[key: string]: string}>('goFileArgsMap') || {};

    return vscode.commands.registerCommand(cmd, async (fileUri: vscode.Uri) => {
        await setGoFileArgs(fileUri, fileArgsMap, ctx);
    });
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
        prompt: 'Enter arguments',
        value: savedArgs,
        placeHolder: 'Example: -v --config=config.json'
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
    vscode.window.showInformationMessage('Args saved, click Run/Debug to execute');
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
    const dirName = path.basename(directory);


    // 获取参数 - 如果没有保存过参数，则使用空字符串
    // Get arguments - use empty string if no args saved
    const args = fileArgsMap[filePath] || '';

    if (debug) {
        // 使用VS Code内置Go调试器启动调试
        // Use VS Code's built-in Go debugger to start debugging
        const debugConfig = {
            type: 'go',
            name: 'Debug Go ' + dirName,
            request: 'launch',
            mode: 'debug',
            program: directory,
            // 使用正则表达式正确分割参数，保留引号内的空格和等号
            // Use regex to correctly split arguments, preserving spaces and equals signs within quotes
            args: parseArguments(args),
            cwd: directory
        };

        vscode.debug.startDebugging(undefined, debugConfig);
    } else {
        // 创建终端
        // Create terminal
        const terminal = vscode.window.createTerminal('Go Run ' + dirName);

        // 切换到文件所在目录
        // Change to file directory
        terminal.sendText(`cd "${directory}"`);

        // 优先使用go.mod支持的方式运行
        // Prioritize running with go.mod support
        terminal.sendText(`go run . ${args}`);

        terminal.show();
    }
}

/**
 * 解析命令行参数，正确处理引号和等号
 * Parse command line arguments, correctly handling quotes and equals signs
 * @param argsString 参数字符串 (argument string)
 * @returns 解析后的参数数组 (parsed argument array)
 */
function parseArguments(argsString: string): string[] {
    if (!argsString) return [];

    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let escapeNext = false;

    // 遍历字符串中的每个字符
    // Iterate through each character in the string
    for (let i = 0; i < argsString.length; i++) {
        const char = argsString[i];

        if (escapeNext) {
            current += char;
            escapeNext = false;
            continue;
        }

        if (char === '\\') {
            escapeNext = true;
            continue;
        }

        if (char === '"' || char === '\'') {
            inQuotes = !inQuotes;
            continue;
        }

        if (char === ' ' && !inQuotes) {
            if (current) {
                result.push(current);
                current = '';
            }
            continue;
        }

        current += char;
    }

    if (current) {
        result.push(current);
    }

    return result;
}
