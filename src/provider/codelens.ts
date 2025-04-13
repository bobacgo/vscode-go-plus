import * as vscode from 'vscode';
import { IsGoFile } from '../pkg/cond';
import { G, I, R, Run, Debug, Args, IToType } from '../codelens';
import { cleanupDebugBinaries } from '../core/run/debug_binary';
import { GoFileParser } from '../pkg/parser';
import { Logger } from '../pkg/logger';
import { time } from '../pkg/go/time';

// 创建专属于 CodeLensProvider 的日志记录器
const logger = Logger.withContext('CodeLensProvider');

/**
 * Go CodeLens提供程序
 * Go CodeLens Provider
 * 提供在Go代码中展示接口实现关系和Main函数的CodeLens功能
 * Provides CodeLens for interface implementation relationships and Main function in Go code
 */
class GoCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
    private isEnabled = true;  // 添加启用状态标志
    private isEditing = false; // 添加编辑状态标志
    private editingTimer: NodeJS.Timeout | null = null; // 添加编辑定时器

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
        watcher.onDidChange((uri) => this.handleFileChange(uri));
        watcher.onDidCreate((uri) => this.handleFileChange(uri));
        watcher.onDidDelete((uri) => this.handleFileChange(uri));

        vscode.workspace.onDidChangeTextDocument((e) => {
            if (IsGoFile(e.document)) {
                // 标记为编辑中状态
                // Mark as editing state
                this.isEditing = true;

                // 清除之前的编辑定时器
                // Clear previous editing timer
                if (this.editingTimer) {
                    clearTimeout(this.editingTimer);
                }

                // 不立即删除缓存，而是标记版本需要更新
                // Don't immediately delete cache, but mark version for update
                const cacheKey = e.document.uri.toString();
                const cachedData = this.cache.get(cacheKey);

                // 如果有缓存，我们更新偏移量而不是删除缓存
                // If there is cache, update offsets instead of deleting cache
                if (cachedData) {
                    this.updateCodeLensPositions(e.document, cachedData.codeLenses, e.contentChanges);

                    // 更新缓存中的版本号，但保留调整过位置的 CodeLens
                    // Update version in cache, but keep the CodeLenses with adjusted positions
                    this.cache.set(cacheKey, {
                        version: e.document.version,
                        codeLenses: cachedData.codeLenses
                    });
                }

                // 设置新的编辑定时器，编辑结束后再彻底刷新
                // Set new editing timer, completely refresh after editing finishes
                this.editingTimer = setTimeout(() => {
                    this.isEditing = false;
                    this.debounceUpdate();
                }, 2000); // 编辑停止2秒后彻底刷新 (complete refresh 2 seconds after editing stops)
            }
        });

        // 当用户切换活动编辑器（例如切换打开的文件）时触发
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
        }, 1500);
    }

    // 添加文件监听处理函数
    // Add file watcher handler
    private handleFileChange(uri?: vscode.Uri) {
        // 如果当前正在编辑，不立即更新
        // If currently editing, don't update immediately
        if (this.isEditing) {
            return;
        }

        // 如果提供了URI，清除该文件的缓存
        // If URI is provided, clear cache for that file
        if (uri) {
            this.cache.delete(uri.toString());
        }

        // 使用防抖函数延迟更新
        // Use debounce function to delay update
        this.debounceUpdate();
    }

    private isFirstRun = true; // 添加第一次运行标志
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

        // 如果当前正在编辑，返回上次的结果避免闪烁
        // If currently editing, return previous results to avoid flickering
        if (this.isEditing) {
            const cachedData = this.cache.get(document.uri.toString());
            if (cachedData) {
                return cachedData.codeLenses;
            }
        }

        // 检查Go语言服务器是否准备就绪
        // Check if Go language server is ready
        if (this.isFirstRun){
            await time.sleep(4000); // 等待1秒钟 (wait for 1 second)
            this.isFirstRun = false;
        }

        // 检查缓存
        // Check cache
        const cacheKey = document.uri.toString();
        const cachedData = this.cache.get(cacheKey);
        if (cachedData && cachedData.version === document.version) {
            logger.debug('使用缓存的 CodeLens');
            return cachedData.codeLenses;
        }

        const codeLenses : vscode.CodeLens[] = [];

        if (!IsGoFile(document)) { // 如果不是Go文件，则不显示CodeLens
            return [];
        }

        logger.debug('====== 开始生成 CodeLens ======');
        logger.debug(`文档路径: ${document.uri.fsPath}`);

        try {

            // 处理 Main 函数
            // Process Main function
            const parser = new GoFileParser(document);
            const lines = parser.getLines();

            const mainFunctionLine = parser.findMainFunction();
            if (mainFunctionLine >= 0) {
                const range = new vscode.Range(mainFunctionLine, 0, mainFunctionLine, lines[mainFunctionLine].length);

                // 添加Run CodeLens - 使用上次保存的参数运行
                // Add Run CodeLens - run with previously saved args
                codeLenses.push(Run(range, document.uri));

                // 添加Debug CodeLens - 使用上次保存的参数调试
                // Add Debug CodeLens - debug with previously saved args
                codeLenses.push(Debug(range, document.uri));

                // 添加Args CodeLens - 设置运行参数
                // Add Args CodeLens - set run arguments
                codeLenses.push(Args(range, document.uri));
            }

            // 处理其他Go语言元素
            // Process other Go language elements

            // 处理 const 全局常量
            // 显示 r
            parser.onConstFunc = async (i, constName) => {
                const range = new vscode.Range(i, 0, i, lines[i].length);
                await R(document, constName, i, range, codeLenses);
            };

            // 处理 var 全局变量
            // 显示 r
            parser.onValFunc = async (i, varName) => {
                const range = new vscode.Range(i, 0, i, lines[i].length);
                await R(document, varName, i, range, codeLenses);
            };

            // 处理 func - 在测试文件中不显示函数的测试生成按钮
            // 显示 r、g
            parser.onFuncFunc = async (i, funcName) => {
                const range = new vscode.Range(i, 0, i, lines[i].length);
                G(document, i, range, codeLenses); // 生成测试用例
                await R(document, funcName, i, range, codeLenses);
            };

            // 处理 interface
            // 显示 r、i
            parser.onInterfaceFunc = async (i, interfaceName) => {
                const range = new vscode.Range(i, 0, i, lines[i].length);
                await I(document, interfaceName, IToType.ToStruct, i, range, codeLenses); // 接口到结构体
                await R(document, interfaceName, i, range, codeLenses);
            };

            // 处理 interface 包含的方法
            // 显示 r、i
            parser.onInterfaceMethodFunc = async (i, methodName, interfaceName) => {
                const range = new vscode.Range(i, 0, i, lines[i].length);
                await I(document, methodName, IToType.ToStruct, i, range, codeLenses); // 接口方法到结构体方法
                await R(document, methodName, i, range, codeLenses);
            };

            // 处理 struct
            // 显示 r、i、g
            parser.onStructFunc = async (i, structName) => {
                const range = new vscode.Range(i, 0, i, lines[i].length);

                const structFields = parser.getStructFields(i); // 解析结构体字段
                G(document, i, range, codeLenses, structName, structFields); // 生成测试用例
                await I(document, structName, IToType.ToInterface, i, range, codeLenses); // 结构体到接口
                await R(document, structName, i, range, codeLenses);
                // 解析结构体字段
            };

            // 处理 struct 包含的方法
            // 显示 r、i、g
            parser.onStructMethodFunc = async (i, methodName, structName, receiverName) => {
                const range = new vscode.Range(i, 0, i, lines[i].length);
                G(document, i, range, codeLenses); // 生成测试用例
                await I(document, methodName, IToType.ToStructMethod, i, range, codeLenses); // 结构体方法到接口方法
                await R(document, methodName, i, range, codeLenses);
            };

            parser.scan();

            // 如果没有生成任何 CodeLens，记录原因
            // If no CodeLens were generated, log the reason
            if (codeLenses.length === 0) {
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

            logger.debug(`生成完成，共生成 ${codeLenses.length} 个 CodeLens`);
            logger.debug('====== CodeLens 生成结束 ======');

            // 保存到缓存
            // Save to cache
            this.cache.set(cacheKey, {
                version: document.version,
                codeLenses: codeLenses
            });

            return codeLenses;
        } catch (error) {
            logger.error('生成 CodeLens 时发生错误', error);
            return [];
        }
    }

    /**
     * 根据文档变更更新 CodeLens 位置
     * Update CodeLens positions based on document changes
     * @param document 文档 (document)
     * @param codeLenses CodeLens数组 (CodeLens array)
     * @param changes 文档变更 (document changes)
     */
    private updateCodeLensPositions(
        document: vscode.TextDocument,
        codeLenses: vscode.CodeLens[],
        changes: readonly vscode.TextDocumentContentChangeEvent[]
    ): void {
        // 按照变更发生的顺序应用偏移量
        // Apply offsets in the order changes occurred
        for (const change of changes) {
            const startLine = change.range.start.line;
            const endLine = change.range.end.line;
            const newLines = (change.text.match(/\n/g) || []).length;
            const linesAdded = newLines - (endLine - startLine);

            // 对每个 CodeLens 应用偏移量
            // Apply offset to each CodeLens
            for (const lens of codeLenses) {
                const lensLine = lens.range.start.line;

                // 只调整在变更行之后的 CodeLens
                // Only adjust CodeLenses after the change line
                if (lensLine > endLine) {
                    // 创建新的范围，保持列位置不变，仅调整行号
                    // Create new range, keep column position unchanged, only adjust line number
                    lens.range = new vscode.Range(
                        lensLine + linesAdded, lens.range.start.character,
                        lensLine + linesAdded, lens.range.end.character
                    );
                }
            }
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
