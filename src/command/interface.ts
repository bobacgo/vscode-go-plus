import * as vscode from 'vscode';
import * as path from 'path';
import { InterfaceInfo, ImplementationInfo, MethodImplementationInfo } from '../types';

/**
 * 注册命令以跳转到接口定义
 * Register command to navigate to interface definition
 * @param cmd 命令名称 (command name)
 */
export function registerCommandNavigateToInterface(cmd: string): vscode.Disposable {
    return vscode.commands.registerCommand(cmd, async (interfaceInfo: InterfaceInfo) => {
        const uri = vscode.Uri.file(interfaceInfo.filePath);
        const document = await vscode.workspace.openTextDocument(uri);
        const position = new vscode.Position(interfaceInfo.lineNumber - 1, 0);

        await vscode.window.showTextDocument(document, {
            selection: new vscode.Range(position, position)
        });
    });
}

/**
 * 注册命令以跳转到接口方法
 * Register command to navigate to interface method
 * @param cmd 命令名称 (command name)
 */
export function registerCommandNavigateToInterfaceMethod(cmd: string): vscode.Disposable {
    return vscode.commands.registerCommand(cmd, async (interfaceInfo: InterfaceInfo, methodName: string) => {
        const uri = vscode.Uri.file(interfaceInfo.filePath);
        const document = await vscode.workspace.openTextDocument(uri);

        // 如果有方法行号映射，使用它
        if (interfaceInfo.methodLineNumbers && interfaceInfo.methodLineNumbers[methodName]) {
            const methodLineNumber = interfaceInfo.methodLineNumbers[methodName];
            const position = new vscode.Position(methodLineNumber - 1, 0);

            await vscode.window.showTextDocument(document, {
                selection: new vscode.Range(position, position)
            });
            return;
        }

        // 如果没有行号映射，则通过解析文件内容查找方法位置
        const text = document.getText();
        const lines = text.split('\n');

        // 先找到接口定义的位置
        let methodFound = false;
        let i = interfaceInfo.lineNumber - 1;

        // 从接口定义开始查找目标方法
        while (i < lines.length && !methodFound) {
            const line = lines[i].trim();
            if (line === '}') {
                break; // 接口定义结束
            }

            const methodMatch = line.match(/(\w+)\s*\(/);
            if (methodMatch && methodMatch[1] === methodName) {
                methodFound = true;
                const position = new vscode.Position(i, 0);
                await vscode.window.showTextDocument(document, {
                    selection: new vscode.Range(position, position)
                });
                break;
            }

            i++;
        }

        // 如果没有找到方法，则跳转到接口定义
        if (!methodFound) {
            const position = new vscode.Position(interfaceInfo.lineNumber - 1, 0);
            await vscode.window.showTextDocument(document, {
                selection: new vscode.Range(position, position)
            });
        }
    });
}

/**
 * 注册命令以列出接口实现
 * Register command to list interface implementations
 * @param cmd 命令名称 (command name)
 */
export function registerCommandListInterfaceImplementations(cmd: string): vscode.Disposable {
    return vscode.commands.registerCommand(cmd, async (interfaceInfo: InterfaceInfo, implementations: ImplementationInfo[]) => {
        if (implementations.length === 0) {
            vscode.window.showInformationMessage(`No implementations found for interface ${interfaceInfo.name}`);
            return;
        }

        // 创建快速选择项
        const items = implementations.map(impl => ({
            label: impl.structName,
            description: path.basename(impl.filePath),
            detail: `Line: ${impl.lineNumber}`,
            implementation: impl
        }));

        // 显示快速选择菜单
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Select an implementation of ${interfaceInfo.name}`
        });

        if (selected) {
            // 跳转到选中的实现
            const impl = selected.implementation;
            const uri = vscode.Uri.file(impl.filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const position = new vscode.Position(impl.lineNumber - 1, 0);

            await vscode.window.showTextDocument(document, {
                selection: new vscode.Range(position, position)
            });
        }
    });
}

/**
 * 注册命令以列出方法实现
 * Register command to list method implementations
 * @param cmd 命令名称 (command name)
 */
export function registerCommandListMethodImplementations(cmd: string): vscode.Disposable {
    return vscode.commands.registerCommand(cmd, async (methodName: string, implementations: MethodImplementationInfo[]) => {
        if (implementations.length === 0) {
            vscode.window.showInformationMessage(`No implementations found for method ${methodName}`);
            return;
        }

        // 创建快速选择项
        const items = implementations.map(impl => ({
            label: `${impl.structName}.${methodName}`,
            description: path.basename(impl.filePath),
            detail: `Line: ${impl.lineNumber}`,
            implementation: impl
        }));

        // 显示快速选择菜单
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Select an implementation of method ${methodName}`
        });

        if (selected) {
            // 跳转到选中的实现
            const impl = selected.implementation;
            const uri = vscode.Uri.file(impl.filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const position = new vscode.Position(impl.lineNumber - 1, 0);

            await vscode.window.showTextDocument(document, {
                selection: new vscode.Range(position, position)
            });
        }
    });
}
