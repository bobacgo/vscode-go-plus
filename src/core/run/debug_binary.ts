import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../pkg/logger';
import { execSync } from 'child_process';

// 创建专属于 CodeLens 的日志记录器
const logger = Logger.withContext('CodeLens');



/**
 * 清理调试二进制文件
 * Clean up debug binary files
 */
export function cleanupDebugBinaries() {
    // 获取工作区文件夹路径
    // Get workspace folder paths
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return;
    }

    // 递归查找和删除调试二进制文件
    // Recursively find and delete debug binary files
    for (const folder of workspaceFolders) {
        findAndDeleteDebugFiles(folder.uri.fsPath);
    }

    // 显示清理完成通知
    // Show cleanup completion notification
    vscode.window.showInformationMessage('已清理调试临时文件 (Debug temporary files cleaned)');
}

/**
 * 递归查找并删除调试二进制文件
 * Recursively find and delete debug binary files
 * @param dirPath 目录路径 (directory path)
 */
function findAndDeleteDebugFiles(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
        return;
    }

    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                // 排除某些不应该搜索的目录
                // Exclude certain directories that shouldn't be searched
                if (!entry.name.startsWith('.') &&
                    !entry.name.startsWith('node_modules') &&
                    !entry.name.startsWith('vendor')) {
                    findAndDeleteDebugFiles(fullPath);
                }
            } else if (entry.isFile() && entry.name.startsWith('__debug_bin')) {
                try {
                    // 尝试移除文件权限保护
                    // Try to remove file protection
                    fs.chmodSync(fullPath, 0o666);
                    fs.unlinkSync(fullPath);
                    logger.debug(`成功删除调试文件: ${fullPath}`);
                } catch (err) {
                    // 如果普通删除失败，尝试使用命令行强制删除
                    // If normal deletion fails, try using command line to force delete
                    try {
                        execSync(`rm -f "${fullPath}"`);
                        logger.debug(`通过命令行成功删除: ${fullPath}`);
                    } catch (cmdErr) {
                        logger.error(`无法删除文件 ${fullPath}`, cmdErr);

                        // 通知用户有文件无法删除
                        // Notify user about files that couldn't be deleted
                        vscode.window.showWarningMessage(`无法删除调试文件: ${fullPath}`);
                    }
                }
            }
        }
    } catch (err) {
        logger.error(`读取目录失败 ${dirPath}`, err);
    }
}
