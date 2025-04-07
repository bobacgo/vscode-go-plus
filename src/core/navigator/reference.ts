import * as vscode from 'vscode';
import { Logger } from '../../pkg/logger';

const logger = Logger.withContext('CodeLens');

/**
 * 查找引用
 * Find references
 * @param document 当前文档 (current document)
 * @param line 行号 (line number)
 * @param symbol 符号名称 (symbol name)
 * @returns 引用位置数组 (reference location array)
 */
export async function findReferences(document: vscode.TextDocument, line: number, symbol: string): Promise<vscode.Location[]> {
    try {
        // 获取符号所在位置
        const lineText = document.lineAt(line).text;
        const symbolStart = lineText.indexOf(symbol);
        if (symbolStart === -1) {
            return [];
        }

        const position = new vscode.Position(line, symbolStart + Math.floor(symbol.length / 2));

        // 获取所有引用
        // 获取所有引用
        const refs = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            document.uri,
            position
        ) || [];

        // 过滤掉自身的引用
        // Filter out self-reference
        return refs.filter(ref =>
            ref.uri.toString() !== document.uri.toString() ||
            !ref.range.contains(position)
        );
    } catch (error) {
        logger.error('查找引用时发生错误', error);
        return [];
    }
}


/**
 * 获取不是当前位置的引用位置
 * Get reference location that is not the current position
 * @param refs 引用位置数组 (reference location array)
 * @param currentLine 当前行 (current line)
 * @param currentUri 当前文档URI (current document URI)
 * @returns 其他引用位置 (other reference location)
 */
export function getOtherReferenceLocation(
    refs: vscode.Location[],
    currentLine: number,
    currentUri: vscode.Uri
): vscode.Location | undefined {
    return refs.find(ref =>
        ref.uri.toString() !== currentUri.toString() ||
        ref.range.start.line !== currentLine
    );
}
