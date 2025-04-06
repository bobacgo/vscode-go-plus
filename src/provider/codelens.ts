import * as vscode from 'vscode';
import { IsGoFile, IsInAnnotation } from '../pkg/cond';
import { G, I, R, Run, Debug, Args, IToType } from '../codelens';
import { cleanupDebugBinaries } from '../core/run/debug_binary';
import { GoFileParser } from '../pkg/parser';
import { Logger } from '../pkg/logger';

// 创建专属于 CodeLensProvider 的日志记录器
const logger = Logger.withContext('CodeLensProvider');

/**
 * Go CodeLens提供程序
 * Go CodeLens Provider
 * 提供在Go代码中展示接口实现关系和Main函数的CodeLens功能
 * Provides CodeLens for interface implementation relationships and Main function in Go code
 */
class GoCodeLensProvider implements vscode.CodeLensProvider {
    private codeLenses: vscode.CodeLens[] = [];               // 存储CodeLens实例
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
    private isEnabled = true;  // 添加启用状态标志

    // 添加缓存相关属性
    private cache: Map<string, {
        version: number;
        codeLenses: vscode.CodeLens[];
    }> = new Map();

    /**
     * 构造函数
     * Constructor
     * @param context 扩展上下文 (extension context)
     */
    constructor(private context: vscode.ExtensionContext) {
        logger.debug('初始化 GoCodeLensProvider');
        
        // 添加文件监听器和防抖优化
        // Add file watcher with debounce optimization
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.go');
        
        // 当文件变化时更新监听
        // Update when files change
        watcher.onDidChange(() => this.debounceUpdate());
        watcher.onDidCreate(() => this.debounceUpdate());
        watcher.onDidDelete(() => this.debounceUpdate());
        
        // 文档变化监听优化
        // Document change listener optimization
        vscode.workspace.onDidChangeTextDocument((e) => {
            if (IsGoFile(e.document)) {
                this.cache.delete(e.document.uri.toString());
                this.debounceUpdate();
            }
        });
        
        // 活动编辑器变化时触发更新
        // Trigger update when active editor changes
        vscode.window.onDidChangeActiveTextEditor(() => {
            this._onDidChangeCodeLenses.fire();
        });
        
        context.subscriptions.push(watcher);

        // 定期清理缓存（可选）
        // Periodically clear cache (optional)
        setInterval(() => {
            this.cache.clear();
        }, 30 * 60 * 1000); // 30分钟清理一次 (clear every 30 minutes)
    }

    // 添加防抖函数
    // Add debounce function
    private updateTimeout: NodeJS.Timeout | null = null;
    private debounceUpdate() {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        this.updateTimeout = setTimeout(() => {
            this._onDidChangeCodeLenses.fire();
        }, 500);
    }

    /**
     * 提供CodeLens
     * Provide CodeLens
     * @param document 当前文本文档 (current text document)
     * @returns CodeLens数组 (CodeLens array)
     */
    public async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
        if (!this.isEnabled) {
            logger.debug('CodeLens 功能已禁用');
            return [];
        }

        // 检查缓存
        // Check cache
        const cacheKey = document.uri.toString();
        const cachedData = this.cache.get(cacheKey);
        if (cachedData && cachedData.version === document.version) {
            logger.debug('使用缓存的 CodeLens');
            return cachedData.codeLenses;
        }

        // 重置 CodeLens 数组
        // Reset CodeLens array
        this.codeLenses = [];

        if (!IsGoFile(document)) { // 如果不是Go文件，则不显示CodeLens
            return [];
        }

        logger.debug('====== 开始生成 CodeLens ======');
        logger.debug(`文档路径: ${document.uri.fsPath}`);

        try {

            // 处理 Main 函数
            // Process Main function
            const parser = new GoFileParser(document)
            const lines = parser.getLines()

            const mainFunctionLine = parser.findMainFunction();
            if (mainFunctionLine >= 0) {
                const range = new vscode.Range(mainFunctionLine, 0, mainFunctionLine, lines[mainFunctionLine].length);
                
                // 添加Run CodeLens - 使用上次保存的参数运行
                // Add Run CodeLens - run with previously saved args
                this.codeLenses.push(Run(range, document.uri));
                
                // 添加Debug CodeLens - 使用上次保存的参数调试
                // Add Debug CodeLens - debug with previously saved args
                this.codeLenses.push(Debug(range, document.uri));
                
                // 添加Args CodeLens - 设置运行参数
                // Add Args CodeLens - set run arguments
                this.codeLenses.push(Args(range, document.uri));
            }

            // 处理其他Go语言元素
            // Process other Go language elements

            // 处理 const 全局常量
            // 显示 r
            parser.onConstFunc = (i, constName) => {
                const range = new vscode.Range(i, 0, i, lines[i].length); 
                R(document, constName, i, range, this.codeLenses);
            }

            // 处理 var 全局变量
            // 显示 r
            parser.onValFunc = (i, varName) => {
                const range = new vscode.Range(i, 0, i, lines[i].length);
                R(document, varName, i, range, this.codeLenses);
            }

            // 处理 func - 在测试文件中不显示函数的测试生成按钮
            // 显示 r、g
            parser.onFuncFunc = (i, funcName) => {
                const range = new vscode.Range(i, 0, i, lines[i].length);
                R(document, funcName, i, range, this.codeLenses);
                G(document, i, range, this.codeLenses); // 生成测试用例
            }

            // 处理 interface
            // 显示 r、i
            parser.onInterfaceFunc = (i, interfaceName) => {
                const range = new vscode.Range(i, 0, i, lines[i].length);
                R(document, interfaceName, i, range, this.codeLenses);
                I(document, interfaceName, IToType.ToStruct, i, range, this.codeLenses); // 接口到结构体
            }

            // 处理 interface 包含的方法
            // 显示 r、i
            parser.onInterfaceMethodFunc = (i, methodName, interfaceName) => {
                const range = new vscode.Range(i, 0, i, lines[i].length);
                R(document, methodName, i, range, this.codeLenses);
                I(document, methodName, IToType.ToStruct, i, range, this.codeLenses, interfaceName); // 接口方法到结构体方法
            }

            // 处理 struct
            // 显示 r、i、g
            parser.onStructFunc = (i, structName) => {
                const range = new vscode.Range(i, 0, i, lines[i].length);
                R(document, structName, i, range, this.codeLenses);
                I(document, structName, IToType.ToInterface, i, range, this.codeLenses); // 结构体到接口
                // 解析结构体字段
                const structFields = parser.getStructFields(i); // 解析结构体字段
                G(document, i, range, this.codeLenses, structName, structFields); // 生成测试用例
            }

            // 处理 struct 包含的方法
            // 显示 r、i、g
            parser.onStructMethodFunc = (i, methodName, structName, receiverName) => {
                const range = new vscode.Range(i, 0, i, lines[i].length);
                R(document, methodName, i, range, this.codeLenses);
                I(document, methodName, IToType.ToStructMethod, i, range, this.codeLenses); // 结构体方法到接口方法
                G(document, i, range, this.codeLenses); // 生成测试用例
            }

            parser.scan();

            // 如果没有生成任何 CodeLens，记录原因
            // If no CodeLens were generated, log the reason
            if (this.codeLenses.length === 0) {
                logger.debug('未生成任何 CodeLens，可能的原因：');
                logger.debug('1. 文件中没有可用的结构体或方法');
                logger.debug('2. 所有定义都在注释中');
                logger.debug('3. 没有找到匹配的接口实现');
            }

            // 强制触发 VSCode 重新渲染
            // Force VSCode to re-render
            setImmediate(() => {
                this._onDidChangeCodeLenses.fire();
            });

            logger.debug(`生成完成，共生成 ${this.codeLenses.length} 个 CodeLens`);
            logger.debug('====== CodeLens 生成结束 ======');

            // 保存到缓存
            // Save to cache
            this.cache.set(cacheKey, {
                version: document.version,
                codeLenses: this.codeLenses
            });
            
            return this.codeLenses;
        } catch (error) {
            logger.error('生成 CodeLens 时发生错误', error);
            return [];
        }
    }
}

/**
 * 注册 CodeLens 提供程序
 * Register CodeLens provider
 * @param context 扩展上下文 (extension context)
 * @returns 可处置的对象 (disposable object)
 */
export function DisposeCodeLensProvider(context: vscode.ExtensionContext) : vscode.Disposable {
    // 配置文件类型
    // Configure file types
    const goFilePattern = {
        language: 'go',
        scheme: 'file'
    };

        // 注册调试会话终止事件，清理临时调试文件
    // Register debug session termination event to clean up temporary debug files
    vscode.debug.onDidTerminateDebugSession((session) => {
        cleanupDebugBinaries();
    });
    
    return vscode.languages.registerCodeLensProvider(
        goFilePattern,
        new GoCodeLensProvider(context)
    );
}