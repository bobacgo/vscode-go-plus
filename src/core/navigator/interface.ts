import * as vscode from 'vscode';
import { Logger } from '../../pkg/logger';

const logger = Logger.withContext('navigator_interface');

/**
 * 查找接口的所有实现
 * Find all implementations of an interface
 * @param document 当前文档 (current document)
 * @param line 接口定义所在行 (interface definition line)
 * @param interfaceName 接口名称 (interface name)
 * @returns 实现位置数组 (implementation location array)
 */
export async function findImplementations(document: vscode.TextDocument, line: number, interfaceName: string): Promise<vscode.Location[]> {
    try {
        // 获取符号所在位置
        const lineText = document.lineAt(line).text;
        const symbolStart = lineText.indexOf(interfaceName);
        if (symbolStart === -1) {
            return [];
        }

        const position = new vscode.Position(line, symbolStart + Math.floor(interfaceName.length / 2));

        // 使用VSCode API获取实现
        const implementations = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeImplementationProvider',
            document.uri,
            position
        ) || [];

        logger.debug(`[实现查找] 接口: ${interfaceName}, 实现数: ${implementations.length}`);
        return implementations;
    } catch (error) {
        logger.error('查找接口实现时发生错误', error);
        return [];
    }
}

/**
 * 查找结构体实现的接口
 * Find interfaces implemented by a struct
 * @param document 当前文档 (current document)
 * @param line 结构体定义所在行 (struct definition line)
 * @param structName 结构体名称 (struct name)
 * @returns 接口位置数组 (interface location array)
 */
export async function findImplementedInterfaces(document: vscode.TextDocument, line: number, structName: string): Promise<vscode.Location[]> {
    try {
        // 获取符号所在位置
        const lineText = document.lineAt(line).text;
        const symbolStart = lineText.indexOf(structName);
        if (symbolStart === -1) {
            return [];
        }

        const position = new vscode.Position(line, symbolStart + Math.floor(structName.length / 2));

        // 使用标准API获取可能的实现
        const implementations = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeImplementationProvider',
            document.uri,
            position
        ) || [];

        // 筛选可能是接口的引用
        const interfaceLocations: vscode.Location[] = [];

        // 处理结果...
        for (const implementation of implementations) {
            try {
                // 读取实现文档
                const implDoc = await vscode.workspace.openTextDocument(implementation.uri);
                const implLine = implDoc.lineAt(implementation.range.start.line).text.trim();

                // 检查是否可能是接口定义
                if (implLine.includes('interface')) {
                    interfaceLocations.push(implementation);
                }
            } catch (error) {
                console.error('处理实现时发生错误:', error);
            }
        }

        logger.debug(`[接口查找] 结构体: ${structName}, 查找到接口数: ${interfaceLocations.length}`);
        return interfaceLocations;
    } catch (error) {
        logger.error('查找结构体实现的接口时发生错误', error);
        return [];
    }
}

/**
 * 查找方法实现的接口方法
 * Find interface methods implemented by a struct method
 * @param document 当前文档 (current document)
 * @param line 方法定义所在行 (method definition line)
 * @param methodName 方法名称 (method name)
 * @param receiver 接收器类型名称 (receiver type name)
 * @returns 接口方法位置数组 (interface method location array)
 */
export async function findMethodImplementedInterfaces(
    document: vscode.TextDocument,
    line: number,
    methodName: string,
): Promise<vscode.Location[]> {
    try {
        // 获取符号所在位置
        const lineText = document.lineAt(line).text;
        const symbolStart = lineText.indexOf(methodName);
        if (symbolStart === -1) {
            return [];
        }

        const position = new vscode.Position(line, symbolStart + Math.floor(methodName.length / 2));

        // 使用引用查找功能先找到可能相关的所有引用
        const allRefs = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeImplementationProvider',
            document.uri,
            position
        ) || [];

        // 过滤出可能是接口方法的引用
        const interfaceMethods: vscode.Location[] = [];

        for (const ref of allRefs) {
            // 不考虑当前文件的自引用
            if (ref.uri.toString() === document.uri.toString() && ref.range.start.line === line) {
                continue;
            }

            try {
                // 读取引用所在文档
                const refDoc = await vscode.workspace.openTextDocument(ref.uri);
                const refLine = refDoc.lineAt(ref.range.start.line).text.trim();

                // 检查是否是接口方法声明
                if (!refLine.startsWith('func') && refLine.includes(methodName) && !refLine.includes('struct')) {
                    // 向上查找接口声明
                    let lineIndex = ref.range.start.line;
                    let isInterface = false;

                    while (lineIndex >= 0) {
                        const checkLine = refDoc.lineAt(lineIndex).text.trim();
                        if (checkLine.includes('interface')) {
                            isInterface = true;
                            break;
                        }
                        if (checkLine.includes('struct') || checkLine.includes('func ')) {
                            break;
                        }
                        lineIndex--;
                    }

                    if (isInterface) {
                        interfaceMethods.push(ref);
                    }
                }
            } catch (error) {
                console.error('检查方法引用时发生错误:', error);
            }
        }

        logger.debug(`[方法实现查找] 方法: ${methodName}, 实现接口方法数: ${interfaceMethods.length}`);
        return interfaceMethods;
    } catch (error) {
        logger.error('查找方法实现的接口方法时发生错误', error);
        return [];
    }
}
