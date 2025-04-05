import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 获取资源URI
 * @param context 扩展上下文
 * @param resourceName 资源名称
 * @returns 资源URI
 */
export function getResourceUri(context: vscode.ExtensionContext, resourceName: string): vscode.Uri {
    // 尝试以下几个路径位置
    const possiblePaths = [
        path.join(context.extensionPath, 'resources', resourceName),
        path.join(context.extensionPath, 'out', 'resources', resourceName)
    ];
    
    // 检查文件是否存在并返回第一个找到的URI
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return vscode.Uri.file(p);
        }
    }
    
    // 如果都找不到，记录错误并使用第一个路径
    console.error(`Resource not found: ${resourceName}`);
    return vscode.Uri.file(possiblePaths[0]);
} 