import * as vscode from 'vscode';
import { StructField } from '../types';  // 添加类型导入
import { Logger } from './logger';
import { IsInAnnotation } from './cond';
import { sync } from './go/sync';

const logger = Logger.withContext('GoFileParser');


export class GoFileParser {

    private lines: string[];

    public onImportFunc: (line: number, importPath: string) => void;

    public onAnnotationFunc: (line: number, annotation: string) => void;

    public onConstFunc: (line: number, consts: string) => void;

    public onValFunc: (line: number, val: string) => void;

    public onFuncFunc: (line: number, funcName: string) => void;

    public onInterfaceFunc: (line: number, interfaceName: string) => void;

    public onInterfaceMethodFunc: (line: number, methodName: string, interfaceName: string) => void;

    public onStructFunc: (line: number, structName: string) => void;

    public onStructMethodFunc: (line: number, methodName: string, structName: string, receiverName: string) => void;

    constructor(document: vscode.TextDocument) {
        this.lines = document.getText().split('\n');
    }

    public async scan() {
        try {
            // 处理其他Go语言元素
            // Process other Go language elements
            const eg = sync.ErrorGroup(10);

            for (let i = 0; i < this.lines.length; i++) {
                eg.Go(() => {
                    const line = this.lines[i];

                    if (!line.trim()  // 跳过空行
                        || line.trim().startsWith('*/') // 跳过多行注释结束
                        || line.trim().startsWith('}') // 跳过闭合括号
                    ) {
                        return null;
                    }

                    // 处理 import
                    if (this.onImportFunc) {
                        const importPath = this.extractImport(i, line);
                        if (importPath) {
                            this.onImportFunc(i, importPath);
                            return null;
                        }
                    }

                    // 在注释内
                    if (IsInAnnotation(this.lines, i)) { // 跳过注解中的代码
                        if (this.onAnnotationFunc) {
                            this.onAnnotationFunc(i, line);
                        }
                        return null;
                    }

                    // 处理 const 全局常量
                    // 显示 r
                    if (this.onConstFunc) {
                        // 处理单行常量声明
                        const singleConstMatch = line.match(/^const\s+(\w+)/);
                        if (singleConstMatch) {
                            const constName = singleConstMatch[1];
                            this.onConstFunc(i, constName);
                            return null;
                        }

                        // 处理常量块声明开始
                        if (line.trim() === 'const (' || line.match(/^const\s+\(/)) {
                            this.processDeclarationBlock(i + 1, ')', this.onConstFunc);
                            return null;
                        }
                    }

                    // 处理 var 全局变量
                    // 显示 r
                    if (this.onValFunc) {
                        // 处理单行变量声明
                        const singleVarMatch = line.match(/^var\s+(\w+)/);
                        if (singleVarMatch) {
                            const varName = singleVarMatch[1];
                            this.onValFunc(i, varName);
                            return null;
                        }

                        // 处理变量块声明开始
                        if (line.trim() === 'var (' || line.match(/^var\s+\(/)) {
                            this.processDeclarationBlock(i + 1, ')', this.onValFunc);
                            return null;
                        }
                    }

                    // 处理 func - 在测试文件中不显示函数的测试生成按钮
                    // 显示 r、g
                    if (this.onFuncFunc) {
                        const matches = line.match(/^func\s+(\w+)\s*\(/);
                        if (matches) {
                            const funcName = matches[1];
                            // 跳过 main 函数 和 init 函数
                            if (funcName !== 'main' && funcName !== 'init') {
                                this.onFuncFunc(i, funcName);
                            }
                            return null;
                        }
                    }

                    // 处理 interface
                    // 显示 r、i
                    if (this.onInterfaceFunc) {
                        const matches = line.match(/^type\s+(\w+)\s+interface\s*{/);
                        if (matches) {
                            const interfaceName = matches[1];
                            this.onInterfaceFunc(i, interfaceName);
                            return null;
                        }
                    }

                    // 处理 interface 包含的方法
                    // 显示 r、i
                    if (this.onInterfaceMethodFunc) {
                        const interfaceMethod = this.extractInterfaceMethod(i, line, this.lines);
                        if (interfaceMethod) {
                            this.onInterfaceMethodFunc(i, interfaceMethod.methodName, interfaceMethod.interfaceName);
                            return null;
                        }
                    }

                    // 处理 struct
                    // 显示 r、i、g
                    if (this.onStructFunc) {
                        const matches = line.match(/^type\s+(\w+)\s+struct\s*{/);
                        if (matches) {
                            const structName = matches[1];
                            this.onStructFunc(i, structName);
                            return null;
                        }
                    }

                    // 处理 struct 包含的方法
                    // 显示 r、i、g
                    if (this.onStructMethodFunc) {
                        const matches = line.match(/^func\s*\((\w+)\s+\*?(\w+)\)\s+(\w+)\s*\(/);
                        if (matches) {
                            const receiverName = matches[1]; // 接收器名称
                            const structName = matches[2];  // 结构体名称
                            const structFuncName = matches[3]; // 方法名称

                            this.onStructMethodFunc(i, structFuncName, structName, receiverName);
                            return null;
                        }
                    }

                    // 处理无括号的结构体方法 (如 func (StructName) MethodName )
                    // 显示 r、i、g
                    if (this.onStructMethodFunc) {
                        const matches = line.match(/^func\s*\((\w+)\)\s+(\w+)\s*(?:\(|$)/);
                        if (matches && matches.length >= 3) {
                            const structName = matches[1];  // 结构体名称
                            const methodName = matches[2]; // 方法名称
                            this.onStructMethodFunc(i, methodName, structName, '');
                            return null;
                        }
                    }
                    return null;
                });
            }
            await eg.wait();
        } catch (error) {
            logger.error('生成 CodeLens 时发生错误', error);
        }
    }

    /**
     * 解析结构体字段信息
     */
    public getStructFields(structStartLine: number): StructField[] {
        const lines = this.getLines();
        let currentLine = structStartLine + 1;  // 跳过结构体定义行

        const fields: StructField[] = [];
        while (currentLine < lines.length && !lines[currentLine].includes('}')) {
            const line = lines[currentLine].trim();
            if (line && !line.startsWith('//')) {  // 跳过空行和注释
                const parts = line.split(/\s+/);
                if (parts.length >= 2) {
                    const fieldName = parts[0];
                    fields.push({
                        name: fieldName,
                        type: parts.slice(1).join(' '),
                        isExported: /^[A-Z]/.test(fieldName),
                        line: currentLine
                    });
                }
            }
            currentLine++;
        }

        return fields;
    }

    /**
     * 查找文档中的main函数
     * @param lines 文档的所有行
     * @returns main函数行号，如果没有找到则返回-1
     */
    public findMainFunction(): number {
        const lines = this.getLines();
        // 首先检查文件是否为main包
        let isMainPackage = false;
        for (let i = 0; i < Math.min(10, lines.length); i++) {
            const packageMatch = lines[i].match(/package\s+(\w+)/);
            if (packageMatch && packageMatch[1] === 'main') {
                isMainPackage = true;
                break;
            }
        }

        if (!isMainPackage) {
            return -1;
        }

        // 查找main函数定义
        for (let i = 0; i < lines.length; i++) {
            const mainFuncMatch = lines[i].match(/func\s+main\s*\(\s*\)\s*{/);
            if (mainFuncMatch) {
                return i;
            }
        }

        return -1;
    }


    /**
     * 获取当前行
     * @returns 所有行
     */
    public getLines(): string[] {
        return this.lines;
    }

    /**
     * Extracts import path from Go code
     * 从Go代码中提取导入路径
     * @param i Current line number 当前行号
     * @param line Current line content 当前行内容
     * @returns Import path or null if not found 返回导入路径，如果未找到则返回null
     */
    public extractImport(i: number, line: string): string {
        // Single line import
        // 单行导入
        const singleImportMatch = line.match(/^import\s+["']([^"']+)["']/);
        if (singleImportMatch) {
            return singleImportMatch[1];
        }

        // Import within parentheses
        // 括号内导入
        const inParenImportMatch = line.match(/^\s*["']([^"']+)["']/);
        if (inParenImportMatch) {
            // Check if we're inside an import block
            // 检查是否在import块内
            let lineIndex = i;
            while (lineIndex >= 0) {
                const prevLine = this.lines[lineIndex].trim();
                if (prevLine.startsWith('import (')) {
                    return inParenImportMatch[1];
                }
                if (prevLine.startsWith('import') && !prevLine.includes('(')) {
                    break;
                }
                lineIndex--;
            }
        }

        return null;
    }

    // 提取接口名称和方法名称
    private extractInterfaceMethod(i: number, line: string, lines: string[]) : {interfaceName: string, methodName: string} {
        const matches = line.match(/^\s*(\w+)\s*\([^)]*\)/);
        if (matches) {
            const methodName = matches[1];

            // 检查该行是否在接口定义内
            let isInInterface = false;
            let interfaceName = '';
            let startLine = i;

            while (startLine >= 0) {
                const checkLine = lines[startLine].trim();
                const interfaceMatch = checkLine.match(/type\s+(\w+)\s+interface\s*{/);
                if (interfaceMatch) {
                    isInInterface = true;
                    interfaceName = interfaceMatch[1];
                    break;
                }
                if (checkLine.includes('struct') || checkLine.includes('func')) {
                    break;
                }
                startLine--;
            }
            if (isInInterface) {
                return {
                    interfaceName: interfaceName,
                    methodName: methodName
                };
            }
        }
        return null;
    }

    /**
     * Process declaration blocks (const/var) and call the appropriate handler for each item
     * 处理声明块(常量/变量)并为每个项调用适当的处理函数
     * @param startLine Start line of the block content (after opening parenthesis)
     * @param endToken Token that marks the end of the block
     * @param handler Callback function to handle each declaration
     */
    private processDeclarationBlock(
        startLine: number,
        endToken: string,
        handler: (line: number, name: string) => void
    ): void {
        let currentLine = startLine;
        while (currentLine < this.lines.length) {
            const declarationLine = this.lines[currentLine].trim();
            if (declarationLine === endToken) {
                break; // 声明块结束
            }

            // 忽略空行和注释
            if (declarationLine && !declarationLine.startsWith('//')) {
                // 匹配声明名称 (可能包含或不包含类型和值)
                const match = declarationLine.match(/^(\w+)(?:\s|=|$)/);
                if (match) {
                    handler(currentLine, match[1]);
                }
            }
            currentLine++;
        }
    }
}

/**
 * 分割多个连接在一起的JSON对象
 * @param jsonText 包含多个JSON对象的文本
 * @returns 分割后的JSON字符串数组
 */
export function SplitMultipleJson(jsonText: string): string[] {
    const result: string[] = [];
    let braceCount = 0;
    let currentJson = '';

    for (let i = 0; i < jsonText.length; i++) {
        const char = jsonText[i];

        if (char === '{') {
            braceCount++;
            currentJson += char;
        } else if (char === '}') {
            braceCount--;
            currentJson += char;

            if (braceCount === 0) {
                // 找到一个完整的JSON对象
                result.push(currentJson);
                currentJson = '';
            }
        } else {
        // 只在已经开始一个JSON对象的情况下添加字符
            if (braceCount > 0) {
                currentJson += char;
            }
        }
    }

    return result;
}
