import * as vscode from 'vscode';

/**
 * 检查当前文档是否为Go文件
 * Check if the current document is a Go file
 */
export function IsGoFile(document: vscode.TextDocument): boolean {
    return document.languageId === 'go' && document.fileName.endsWith('.go');
}

/**
 * 检查当前文档是否在工作空间中
 */
export function IsInWorkspace(document: vscode.TextDocument) {
    return vscode.workspace.workspaceFolders?.some(folder => document.uri.fsPath.startsWith(folder.uri.fsPath)
    ) ?? false;
}

/**
 * 检查当前文档是否为测试文件
 */
export function IsTestFile(document: vscode.TextDocument): boolean {
    return document.fileName.endsWith('_test.go');
}

/**
 * 检查某一行是否在注解中
 */
export function IsInAnnotation(lines: string[], lineNumber: number): boolean {
    // 检查当前行之前的内容是否有注解开始标记
    for (let i = lineNumber; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.includes('*/')) {
            return false;
        }
        if (line.includes('/*') || line.startsWith('//')) {
            return true;
        }
        // 如果遇到空行或者其他代码，就停止向上查找
        if (line !== '' && !line.startsWith('//')) {
            break;
        }
    }
    return false;
}
