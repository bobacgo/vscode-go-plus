import * as vscode from 'vscode';
import { IsInWorkspace, IsTestFile } from './pkg/cond';
import { findImplementations, findImplementedInterfaces, findMethodImplementedInterfaces } from './core/navigator/interface';
import { findReferences, getOtherReferenceLocation } from './core/navigator/reference';

/**
 * ▶ Run
 * 创建运行 Go Main 函数的 CodeLens
 * Create CodeLens for running Go Main function
 * @param range 代码范围 (code range)
 * @param uri 文档 URI (document URI)
 * @returns CodeLens 实例 (CodeLens instance)
 */
export function Run(range: vscode.Range, uri: vscode.Uri): vscode.CodeLens {
    return new vscode.CodeLens(range, {
        title: "▶ Run",
        command: 'gopp.runMain',
        arguments: [uri]
    });
}

/**
 * 🐞 Debug
 * 创建调试 Go Main 函数的 CodeLens
 * Create CodeLens for debugging Go Main function
 * @param range 代码范围 (code range)
 * @param uri 文档 URI (document URI)
 * @returns CodeLens 实例 (CodeLens instance)
 */
export function Debug(range: vscode.Range, uri: vscode.Uri): vscode.CodeLens {
    return new vscode.CodeLens(range, {
        title: "🐞 Debug",
        command: 'gopp.debugMain',
        arguments: [uri]
    });
}

/**
 * ⚙ Args
 * 创建设置运行参数的 CodeLens
 * Create CodeLens for setting run arguments
 * @param range 代码范围 (code range)
 * @param uri 文档 URI (document URI)
 * @returns CodeLens 实例 (CodeLens instance)
 */
export function Args(range: vscode.Range, uri: vscode.Uri): vscode.CodeLens {
    return new vscode.CodeLens(range, {
        title: "⚙ Args",
        command: 'gopp.setMainArgs',
        arguments: [uri]
    });
}

/**
 * Ⓖ - 生成按钮
 * Ⓖ - Generate button
 * @param document 当前文档 (current document)
 * @param lineNumber 匹配的行号 (matching line number)
 * @param range 匹配的范围 (matching range)
 * @param structName 结构体名称 (struct name)
 * @param structFields 结构体字段 (struct fields)
 * @param codeLenses CodeLens数组 (CodeLens array)
 */
export async function G(
    document: vscode.TextDocument, 
    lineNumber: number, 
    range: vscode.Range, 
    codeLenses: vscode.CodeLens[],
    structName?: string, 
    structFields?: any[]
) {
    if (!IsInWorkspace(document)) { // 如果不在工作空间中，则不显示按钮
        return;
    }

    if (structName && structName !== "") {  // 是一个结构体
        const filePath = document.uri.fsPath;
        const fields = structFields || []; // 防止 structFields 为 undefined
        const opts = [
            {
                label: '实现接口方法',
                description: '为结构体实现指定接口',
                command: 'gopp.generateInterfaceStubs',
                arguments: [structName, filePath, lineNumber + 1]
            },
            {
                label: '生成结构体标签',
                description: '为结构体字段生成标签',
                command: 'gopp.generateStructTags',
                arguments: [structName, filePath, lineNumber + 1, fields]
            },
            {
                label: '生成 Option 代码',
                description: '生成 Option 模式代码',
                command: 'gopp.generateOptionCode',
                arguments: [structName, filePath, lineNumber + 1, fields]
            }
        ];

        if (!IsTestFile(document)) { // 如果不是测试文件，则显示生成测试用例按钮
            opts.push({
                label: '生成单元测试',
                description: '为当前文件生成测试文件',
                command: 'go.test.generate.file',
                arguments: [structName, filePath, lineNumber + 1]
            });
        }

        addCodeLens(range, {
            title: 'Ⓖ',
            command: 'gopp.showStructOptions',
            arguments: [{
                type: 'struct',
                name: structName,
                filePath: filePath,
                line: lineNumber + 1,
                fields: fields.filter(f => f && f.isExported), // 添加安全检查
                options: opts
            }]
        }, codeLenses);
    } else if (!IsTestFile(document)) { // 不是结构体，也不是测试文件
        addCodeLens(range, {
            title: 'Ⓖ',
            command: 'gopp.executeFunctionTest', // 生成测试用例
            arguments: [{
                uri: document.uri,
                position: new vscode.Position(lineNumber, 0)
            }]
        }, codeLenses);
    }
}

/**
 * 目标类型枚举
 * Target type enumeration
 */
export const enum IToType {
    ToStruct,         // 查找接口被实现的类 (Find structs that implement an interface)
    ToInterface,      // 查找结构体实现的接口 (Find interfaces implemented by a struct)
    ToStructMethod,   // 查找结构体方法实现的接口方法 (Find interface methods implemented by a struct method)
}

/**
 * Ⓘ - 接口实现按钮
 * Ⓘ - Interface implementation button
 * @param document 当前文档 (current document)
 * @param name 接口名称、接口方法名称、结构体名称、结构体方法名称 (interface/method/struct name)
 * @param to 目标类型 (ITargetType)
 * @param lineNumber 匹配的行号 (matching line number)
 * @param range 匹配的范围 (matching range)
 * @param codeLenses CodeLens数组 (CodeLens array)
 * @param receiverName 接收器名称 (receiver name)
 */
export async function I(
    document: vscode.TextDocument, 
    name: string, 
    to: IToType, 
    lineNumber: number, 
    range: vscode.Range, 
    codeLenses: vscode.CodeLens[],
    receiverName?: string
) {
    let locations : vscode.Location[] = [];
    if (to === IToType.ToStruct) {  // 查找接口被实现的类
        locations = await findImplementations(document, lineNumber, name);
    } else if (to === IToType.ToInterface) { // 查找结构体实现的接口
        locations = await findImplementedInterfaces(document, lineNumber, name);
    } else if (to === IToType.ToStructMethod) { // 查找结构体方法实现的接口方法
        locations = await findMethodImplementedInterfaces(document, lineNumber, name);
    }
    
    if (locations.length > 0) {
        if (locations.length === 1) {
            // 如果只有一个实现，点击直接跳转
            addCodeLens(range, {
                title: 'Ⓘ',
                command: 'editor.action.goToLocations',
                arguments: [
                    document.uri,
                    new vscode.Position(lineNumber, 0),
                    locations,
                    'goto',
                    'No implementations found'
                ]
            }, codeLenses);
        } else {
            // 多个实现时，显示数量并提供列表
            addCodeLens(range, {
                title: `Ⓘ ${locations.length}`,
                command: 'editor.action.showReferences',
                arguments: [document.uri, new vscode.Position(lineNumber, 0), locations]
            }, codeLenses);
        }
    }
}

/**
 * Ⓡ - 引用按钮
 * Ⓡ - References button
 * @param document 当前文档 (current document)
 * @param matchTxt 匹配的文本 (matching text)
 * @param lineNumber 匹配的行号 (matching line number)
 * @param range 匹配的范围 (matching range)
 * @param codeLenses CodeLens数组 (CodeLens array)
 */
export async function R(
    document: vscode.TextDocument, 
    matchTxt: string, 
    lineNumber: number, 
    range: vscode.Range,
    codeLenses: vscode.CodeLens[]
) {
    const refs = await findReferences(document, lineNumber, matchTxt);
    if (refs.length > 0) {
        if (refs.length === 1) {
            const otherRef = getOtherReferenceLocation(refs, lineNumber, document.uri);
            if (otherRef) {
                addCodeLens(range, {
                    title: 'Ⓡ',
                    command: 'editor.action.goToLocations',
                    arguments: [
                        document.uri,
                        new vscode.Position(lineNumber, 0),
                        [otherRef],
                        'goto',
                        'No other references'
                    ]
                }, codeLenses);
            }
        } else {
            addCodeLens(range, {
                title: `Ⓡ ${refs.length}`,
                command: 'editor.action.showReferences',
                arguments: [document.uri, new vscode.Position(lineNumber, 0), refs]
            }, codeLenses);
        }
    }
}

/**
 * 检查是否存在相同类型的 CodeLens
 * Check if CodeLens of the same type exists
 * @param range 范围 (range)
 * @param type 类型 ('Ⓖ'|'Ⓡ'|'Ⓘ') (type)
 * @param codeLenses CodeLens数组 (CodeLens array)
 * @returns 是否存在 (exists or not)
 */
function hasCodeLensType(range: vscode.Range, type: 'Ⓖ'|'Ⓡ'|'Ⓘ', codeLenses: vscode.CodeLens[]): boolean {
    return codeLenses.some(lens => 
        lens.range.isEqual(range) && 
        lens.command?.title.startsWith(type)
    );
}

/**
 * 安全地添加 CodeLens
 * Safely add CodeLens
 * @param range 范围 (range)
 * @param lens CodeLens 配置 (CodeLens configuration)
 * @param codeLenses CodeLens数组 (CodeLens array)
 */
function addCodeLens(
    range: vscode.Range, 
    lens: {
        title: string;
        command: string;
        arguments?: any[];
    },
    codeLenses: vscode.CodeLens[]
) {
    const type = lens.title.charAt(0) as 'Ⓖ'|'Ⓡ'|'Ⓘ';
    if (!hasCodeLensType(range, type, codeLenses)) {
        codeLenses.push(new vscode.CodeLens(range, lens));
    }
}