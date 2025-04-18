import * as vscode from 'vscode';
import { TranslationService } from './service';
import { Logger } from '../../pkg/logger';
import { IsGoFile } from '../../pkg/cond';
import { debounce } from '../../pkg/util';
import { RequestQueue } from '../../pkg/queue';

// 初始化日志实例
const logger = Logger.withContext('TranslationProvider');

/**
 * 翻译提供程序类
 * Translation provider class
 */
export class TranslationProvider implements vscode.CodeActionProvider {
    // 用于显示翻译的装饰器
    // Decorator for displaying translation
    private static readonly decorationType = vscode.window.createTextEditorDecorationType({
        after: {
            margin: '0 0 0 1em',
            contentText: '',  // 初始为空，会在设置装饰器时动态设置
            fontStyle: 'italic',
            color: new vscode.ThemeColor('editorCodeLens.foreground')
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });

    // 当前的装饰器
    // Current decorations
    private decorations: vscode.DecorationOptions[] = [];

    // 当前编辑器
    // Current editor
    private editor?: vscode.TextEditor;

    // 最后一次翻译的选择范围
    // Last translated selection range
    private lastTranslatedRange?: vscode.Range;

    private configKey = 'gopp.translation';
    // 配置
    // Configuration
    private config = {
        sourceLang: 'en',
        targetLang: 'zh',
        autoDetect: true,
        autoTranslateOnActiveEditor: false,
    };

    private TranslationService: TranslationService;

    // 已翻译注释的缓存
    // Cache of translated comments
    private translatedComments = new Map<string, boolean>();

    // 翻译请求队列
    // Translation request queue
    private translationQueue: RequestQueue;

    // 最大并发翻译请求数
    // Maximum number of concurrent translation requests
    private readonly MAX_CONCURRENT_TRANSLATIONS = 3;

    // 添加一个翻译操作锁，防止重复调用
    // Add a translation operation lock to prevent duplicate calls
    private translationInProgress = false;

    /**
     * 构造函数
     * Constructor
     */
    constructor(context: vscode.ExtensionContext) {
        // 初始化配置
        // Initialize configuration
        this.loadConfig();

        // 初始化翻译服务
        this.TranslationService = new TranslationService(context);

        // 初始化请求队列
        // Initialize request queue
        this.translationQueue = new RequestQueue(this.MAX_CONCURRENT_TRANSLATIONS, {
            requestsPerSecond: 5 // 限制每秒最多处理5个请求
            // Rate limit to a maximum of 5 requests per second
        });

        // 订阅选择变更事件
        // Subscribe to selection change events
        context.subscriptions.push(
            vscode.window.onDidChangeTextEditorSelection(this.handleSelectionChange, this)
        );

        // 订阅配置变更事件
        // Subscribe to configuration change events
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(this.handleConfigChange, this)
        );

        // 订阅活动编辑器变更事件
        // Subscribe to active editor change events
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(this.handleActiveEditorChange, this)
        );

        // 订阅文档变更事件
        // Subscribe to document change events
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(this.handleDocumentChange, this)
        );

        // 订阅编辑器可见范围变更事件
        // Subscribe to editor visible ranges change events
        context.subscriptions.push(
            vscode.window.onDidChangeTextEditorVisibleRanges(() => this.handleEditorScroll())
        );

        // 如果已经有活动编辑器，则立即处理
        // If there's already an active editor, process it immediately
        if (vscode.window.activeTextEditor) {
            this.handleActiveEditorChange(vscode.window.activeTextEditor);
        }

        // 注册当前可视窗口注释翻译命令
        // Register visible comments translation command
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'gopp.translateVisibleComments',
                () => this.translateVisibleComments()
            )
        );
    }

    /**
     * 加载配置
     * Load configuration
     */
    private loadConfig(): void {
        const config = vscode.workspace.getConfiguration(this.configKey);
        this.config = {
            sourceLang: config.sourceLanguage,
            targetLang: config.targetLanguage,
            autoDetect: config.autoDetectLanguage,
            autoTranslateOnActiveEditor: config.autoTranslateOnActiveEditor,
        };
    }

    /**
     * 处理配置变更
     * Handle configuration change
     */
    private handleConfigChange(event: vscode.ConfigurationChangeEvent): void {
        if (event.affectsConfiguration(this.configKey)) {
            this.loadConfig();
        }
    }

    /**
     * 处理选择变更
     * Handle selection change
     */
    private async handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent): Promise<void> {
        this.editor = event.textEditor;

        // 不清除现有装饰，允许保留翻译结果
        // Don't clear existing decorations, allow translation results to remain

        // 如果没有选中文本，直接返回
        // If no text is selected, return
        if (event.selections[0].isEmpty) {
            return;
        }

        // 存储选择范围用于代码操作
        // Store selection range for code actions
        this.lastTranslatedRange = event.selections[0];
    }

    /**
     * 清除装饰
     * Clear decorations
     */
    public clearDecorations(): void {
        if (this.editor) {
            this.editor.setDecorations(TranslationProvider.decorationType, []);
            this.decorations = [];

            // 清理注释装饰器
            // Clean up comment decorations
            if (this.commentDecorationTypes) {
                for (const decorationType of this.commentDecorationTypes) {
                    decorationType.dispose();
                }
                this.commentDecorationTypes = [];
            }

            // 清除已翻译注释缓存
            // Clear translated comments cache
            this.translatedComments.clear();
        }
    }

    /**
     * 自动检测语言并确定翻译方向
     * Auto detect language and determine translation direction
     * @param text 需要检测的文本 (text to detect)
     * @returns 源语言和目标语言 (source and target language)
     */
    private detectLanguageDirection(text: string): { sourceLang: string, targetLang: string } {
        // 默认使用配置的语言
        // Default to configured languages
        let sourceLang = this.config.sourceLang;
        let targetLang = this.config.targetLang;

        // 如果启用了自动检测
        // If auto-detection is enabled
        if (this.config.autoDetect) {
            const detectedLang = this.TranslationService.detectLanguage(text);
            // 更智能的语言检测逻辑
            // Smarter language detection logic
            if (detectedLang === 'zh-CN' || detectedLang === 'zh') {
                // 如果检测到中文，就翻译成英文
                // If Chinese is detected, translate to English
                sourceLang = 'zh';
                targetLang = 'en';
            } else if (detectedLang === 'en' || detectedLang.startsWith('en-')) {
                // 如果检测到英文，就翻译成中文
                // If English is detected, translate to Chinese
                sourceLang = 'en';
                targetLang = 'zh';
            } else {
                // 其他语言，使用配置中的默认设置
                // For other languages, use default settings from configuration
                logger.info(`使用默认语言设置: ${sourceLang} -> ${targetLang} / Using default language settings`);
            }

            logger.info(`翻译方向: ${sourceLang} -> ${targetLang} / Translation direction`);
        }

        return { sourceLang, targetLang };
    }

    /**
     * 翻译选中的文本
     * Translate selected text
     */
    public async translateSelection(): Promise<void> {
        if (!this.editor || !this.lastTranslatedRange) {
            logger.info('编辑器或上次翻译范围为空，无法翻译 / Editor or last translated range is null, cannot translate');
            return;
        }

        // 如果已经在进行翻译，则忽略此次调用
        // If translation is already in progress, ignore this call
        if (this.translationInProgress) {
            logger.info('翻译操作正在进行中，忽略重复调用 / Translation operation in progress, ignoring duplicate call');
            return;
        }

        this.translationInProgress = true;

        try {
            const text = this.editor.document.getText(this.lastTranslatedRange);
            if (!text) {
                logger.info('选中文本为空，无法翻译 / Selected text is empty, cannot translate');
                return;
            }

            // 使用提取的方法检测语言方向
            // Use extracted method to detect language direction
            const { sourceLang, targetLang } = this.detectLanguageDirection(text);

            // 显示翻译状态信息
            // Show translation status message
            const statusMessage = vscode.window.setStatusBarMessage('Translating...');

            try {
                // 处理多行翻译 - 显示带有进度的通知
                // Handle multi-line translation - show notification with progress
                if (text.includes('\n') && text.length > 100) {
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: 'Translating...',
                        cancellable: false
                    }, async (progress) => {
                        progress.report({ increment: 30, message: 'Processing text...' });

                        // 执行翻译
                        // Perform translation
                        const translatedText = await this.TranslationService.translate(
                            text,
                            targetLang,
                            sourceLang
                        );

                        progress.report({ increment: 60, message: '更新显示... / Updating display...' });

                        // 为多行文本添加特殊显示
                        // Add special display for multi-line text
                        this.showTranslation(text, translatedText, true);

                        progress.report({ increment: 10, message: '完成 / Done' });
                    });
                } else {
                    // 执行翻译 - 针对单行文本的常规处理
                    // Perform translation - regular handling for single-line text
                    const translatedText = await this.TranslationService.translate(
                        text,
                        targetLang,
                        sourceLang,
                    );

                    // 显示翻译结果
                    // Display translation result
                    this.showTranslation(text, translatedText, text.includes('\n'));
                }

                // 定期清理过期缓存
                // Periodically clear expired cache
                this.checkAndClearExpiredCache();
            } finally {
                // 清除状态消息
                // Clear status message
                statusMessage.dispose();
            }
        } catch (error) {
            logger.error('Translation failed:', error);
            vscode.window.showErrorMessage(`翻译失败: ${error}`);
        } finally {
            // 无论成功或失败，都释放锁
            // Release lock regardless of success or failure
            this.translationInProgress = false;
        }
    }

    /**
     * 显示翻译结果
     * Show translation result
     *
     * @param originalText 原文 / Original text
     * @param translatedText 翻译后的文本 / Translated text
     * @param isMultiline 是否多行 / Is multiline
     */
    private showTranslation(originalText: string, translatedText: string, isMultiline: boolean): void {
        if (!this.editor || !this.lastTranslatedRange) {
            logger.debug('编辑器或上次翻译范围为空，无法显示翻译');
            return;
        }

        // 确保翻译结果不为空
        // Ensure translation result is not empty
        if (!translatedText) {
            translatedText = 'Translation failed';
            logger.warn('翻译结果为空');
        }

        if (translatedText === originalText) {
            logger.debug('翻译结果与原文相同，跳过显示');
            return;
        }

        // 确保显示时考虑多行情况
        // Make sure display handles multiline scenarios
        const displayText = ` ${translatedText} `;

        logger.debug(`翻译结果: ${displayText} / Translation result`);

        // 创建装饰器，但使用临时的一次性装饰器，避免使用共享的静态装饰器
        // Create decoration, but use temporary one-time decorator to avoid shared static decorator
        const tempDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: displayText,
                color: this.faintColor(),
                fontStyle: 'italic', // 斜体
            },
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });

        this.decorations = [{
            range: this.lastTranslatedRange,
            hoverMessage: new vscode.MarkdownString(`**Translation**:\n\n${translatedText}`)
        }];

        // 应用装饰器
        // Apply decoration
        this.editor.setDecorations(tempDecorationType, this.decorations);

        // 确保自动翻译的范围可见，但不改变光标位置
        // Ensure auto-translated range is visible, but don't change cursor position
        this.editor.revealRange(
            this.lastTranslatedRange,
            vscode.TextEditorRevealType.InCenterIfOutsideViewport
        );

        logger.info('翻译装饰器应用成功 / Translation decoration applied successfully');
    }

    /**
     * 计数器用于控制清理过期缓存的频率
     * Counter to control the frequency of clearing expired cache
     */
    private static cacheCleanupCounter = 0;

    /**
     * 检查并清理过期缓存
     * Check and clear expired cache
     */
    private checkAndClearExpiredCache(): void {
        // 每10次翻译操作清理一次过期缓存
        // Clear expired cache every 10 translation operations
        TranslationProvider.cacheCleanupCounter = (TranslationProvider.cacheCleanupCounter + 1) % 10;
        if (TranslationProvider.cacheCleanupCounter === 0) {
            this.TranslationService.clearExpiredCache();
        }
    }

    /**
     * 提供代码操作 (小灯泡💡)
     * Provide code actions
     */
    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range
    ): vscode.CodeAction[] {
        // 如果选择为空，不提供任何操作
        // If selection is empty, provide no actions
        if (range.isEmpty) {
            return [];
        }

        // 创建翻译代码操作
        // Create translation code action
        const translateAction = new vscode.CodeAction(
            'Translate',
            vscode.CodeActionKind.RefactorRewrite
        );

        translateAction.command = {
            title: '翻译选中文本',
            command: 'gopp.translateSelection'
        };

        // 设置高优先级，使其在小灯泡菜单中更靠前显示
        // Set high priority to make it appear higher in the lightbulb menu
        translateAction.isPreferred = true;

        return [translateAction];
    }

    /**
     * 处理活动编辑器变更
     * Handle active editor change
     *
     * @param editor 新的活动编辑器 / New active editor
     */
    private handleActiveEditorChange(editor: vscode.TextEditor | undefined): void {
        if (!editor) {
            logger.info('编辑器为空，无法处理活动编辑器变更 / Editor is null, cannot handle active editor change');
            return;
        }

        this.editor = editor;

        // 延迟一点时间再执行，确保编辑器已完全加载
        // Delay execution a bit to ensure editor is fully loaded
        setTimeout(() => {
            this.translateVisibleContent();
        }, 500);
    }

    /**
     * 处理文档内容变更
     * Handle document content change
     *
     * @param event 文档变更事件 / Document change event
     */
    private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
        // 只处理当前活动编辑器中的文档变更
        // Only handle document changes in the current active editor
        if (this.editor && event.document === this.editor.document) {
            logger.debug(`文档内容变更: ${event.document.fileName} / Document content changed`);

            // 清除已翻译注释缓存，因为文档内容变更可能导致注释位置变化
            // Clear translated comments cache as document content changes may cause comment positions to change
            this.translatedComments.clear();

            // 使用防抖动处理，避免频繁翻译
            // Use debounce to avoid frequent translations
            this.debouncedTranslateVisibleContent();
        }
    }

    /**
     * 防抖动的翻译可见内容函数
     * Debounced function to translate visible content
     */
    private debouncedTranslateVisibleContent = debounce(() => {
        // 确保不在翻译过程中再次调用
        // Ensure not calling again while translation is in progress
        if (!this.translationInProgress) {
            this.translateVisibleContent();
        } else {
            logger.info('忽略防抖动调用，因为翻译正在进行中 / Ignoring debounced call as translation is in progress');
        }
    }, 5000); // 5秒钟的防抖动延迟 / 5 second debounce delay

    /**
     * 处理窗口滚动事件
     * Handle editor scroll event
     */
    private handleEditorScroll(): void {
        if (!this.editor) return;

        // 如果已经在进行翻译，不要再次触发
        // If translation is already in progress, don't trigger again
        if (this.translationInProgress) {
            logger.debug('滚动时忽略翻译，因为翻译正在进行中 / Ignoring translation on scroll as translation is in progress');
            return;
        }

        // 使用防抖动技术处理滚动事件
        // Use debounce technique to handle scroll events
        this.debouncedTranslateVisibleContent();
    }

    /**
     * 翻译当前可见的内容
     * Translate currently visible content
     */
    private translateVisibleContent(): void {
        if (!this.editor) {
            logger.info('编辑器为空，无法翻译当前可见内容 / Editor is null, cannot translate visible content');
            return;
        }

        // 如果已经在进行翻译，则忽略此次调用
        // If translation is already in progress, ignore this call
        if (this.translationInProgress) {
            logger.info('翻译操作正在进行中，忽略重复调用 / Translation operation in progress, ignoring duplicate call');
            return;
        }

        // 检查是否为Go文件
        // Check if the file is a Go file
        if (!IsGoFile(this.editor.document)) {
            logger.info('当前文件不是Go文件，跳过翻译 / Current file is not a Go file, skipping translation');
            return;
        }

        // 检查是否启用了自动翻译
        // Check if auto translation is enabled
        // 如果未启用自动翻译，返回
        if (!this.config.autoTranslateOnActiveEditor) {
            logger.info('自动翻译未启用，不执行翻译 / Auto translation not enabled, not performing translation');
            return;
        }

        // 不清除现有装饰，允许保留先前的翻译结果
        // Don't clear existing decorations to keep previous translation results

        // 获取可见范围
        // Get visible ranges
        const visibleRanges = this.editor.visibleRanges;
        if (visibleRanges.length === 0) {
            logger.info('没有可见范围，无法翻译 / No visible ranges, cannot translate');
            return;
        }

        // 仅翻译注释
        // Only translate comments
        this.translateVisibleComments(/* dontClearDecorations */ true);
    }


    /**
     * 翻译当前可视窗口的注释
     * Translate comments in the visible editor area
     *
     * @param dontClearDecorations 不清除现有装饰 / Don't clear existing decorations
     */
    public async translateVisibleComments(dontClearDecorations = false): Promise<void> {
        if (!this.editor) {
            return;
        }

        // 如果已经在进行翻译，则忽略此次调用
        // If translation is already in progress, ignore this call
        if (this.translationInProgress) {
            logger.info('翻译操作正在进行中，忽略重复调用 / Translation operation in progress, ignoring duplicate call');
            return;
        }

        this.translationInProgress = true;
        logger.debug('开始翻译可见窗口的注释 / Starting to translate visible comments');

        // 显示状态信息
        // Show status message
        const statusMessage = vscode.window.setStatusBarMessage('Translating visible comments...');

        try {
            // 清除现有装饰 (除非指定不清除)
            // Clear existing decorations (unless specified not to)
            if (!dontClearDecorations) {
                this.clearDecorations();
            }

            // 1. 获取可视范围内的文本
            // 1. Get text within visible range
            const visibleRange = this.editor.visibleRanges[0];
            logger.debug(`可见范围: 行${visibleRange.start.line}-${visibleRange.end.line} / Visible range`);

            // 2. 提取注释及其范围
            // 2. Extract comments and their ranges
            const comments = this.extractCommentsFromRange(this.editor.document, visibleRange);

            // 统计新翻译的注释数
            // Count newly translated comments
            let newlyTranslatedCount = 0;

            // 过滤掉已翻译的注释，只保留需要翻译的
            // Filter out already translated comments, keep only those that need translation
            const untranslatedComments = comments.filter(comment => {
                const commentText = comment.text.trim();
                if (!commentText) return false;
                return !this.isCommentAlreadyTranslated(comment.range);
            });

            // 如果没有需要翻译的注释，提前返回
            // Return early if there are no comments to translate
            if (untranslatedComments.length === 0) {
                return;
            }

            // 更新状态栏信息
            // Update status bar message
            statusMessage.dispose();
            const queueStatusMessage = vscode.window.setStatusBarMessage(
                `ʕ◔ϖ◔ʔ queueing ${untranslatedComments.length}`
            );

            // 串行处理每个注释的翻译，确保不会同时发送太多请求
            // Process translations serially to ensure we don't send too many requests at once
            for (let i = 0; i < untranslatedComments.length; i++) {
                const comment = untranslatedComments[i];
                const commentText = comment.text.trim();

                queueStatusMessage.dispose();
                const progressMessage = vscode.window.setStatusBarMessage(
                    `ʕ◔ϖ◔ʔ Translating ${i+1}/${untranslatedComments.length}`
                );

                // 使用提取的方法检测语言方向
                // Use extracted method to detect language direction
                const { sourceLang, targetLang } = this.detectLanguageDirection(commentText);
                try {

                    // 执行翻译 - 通过队列控制请求频率
                    // Perform translation - control request rate through queue
                    const translatedText = await this.translationQueue.enqueue(async () => {
                        return await this.TranslationService.translate(
                            commentText,
                            targetLang,
                            sourceLang,
                        );
                    });

                    // 检查翻译结果是否为空
                    // Check if translation result is empty
                    if (!translatedText || translatedText === commentText) {
                        logger.warn('Translation result is empty or same as original, skipping display');
                        continue;
                    }

                    // 显示翻译结果
                    // Display translation result
                    this.showCommentTranslation(comment.range, translatedText);

                    // 标记该注释为已翻译
                    // Mark this comment as translated
                    this.markCommentAsTranslated(comment.range);

                    newlyTranslatedCount++;
                } catch (error) {
                    logger.error('Failed to translate comment:', error);

                    // 如果因为请求限制失败，增加延迟后重试
                    // If failed due to request limit, add delay and retry
                    if (error.toString().includes('RequestLimitExceeded')) {
                        logger.info('Request rate limit detected, pausing before retry');
                        await new Promise(resolve => setTimeout(resolve, 2000)); // 暂停2秒后重试 / Pause for 2 seconds before retry

                        // 重试一次
                        // Retry once
                        try {
                            const translatedText = await this.translationQueue.enqueue(async () => {
                                return await this.TranslationService.translate(
                                    commentText,
                                    targetLang,
                                    sourceLang,
                                );
                            });

                            if (translatedText && translatedText !== commentText) {
                                this.showCommentTranslation(comment.range, translatedText);
                                this.markCommentAsTranslated(comment.range);
                                newlyTranslatedCount++;
                            }
                        } catch (retryError) {
                            logger.error('Retry translation failed:', retryError);
                        }
                    }
                } finally {
                    progressMessage.dispose();
                }

                // 每个注释之间增加一个小延迟，进一步确保不会超出API速率限制
                // Add a small delay between comments to further ensure we don't exceed API rate limits
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            queueStatusMessage.dispose();

            if (!dontClearDecorations && newlyTranslatedCount > 0) {
                vscode.window.showInformationMessage(`ok ${newlyTranslatedCount}`);
            }
        } catch (error) {
            logger.error('Error translating visible comments:', error);
            if (!dontClearDecorations) {
                vscode.window.showErrorMessage('Failed to translate comments');
            }
        } finally {
            statusMessage.dispose();
            this.translationInProgress = false;
        }
    }

    /**
     * 从文档范围中提取注释
     * Extract comments from document range
     *
     * @param document 文档 / Document
     * @param range 范围 / Range
     * @returns 注释列表（文本和范围） / List of comments (text and range)
     */
    private extractCommentsFromRange(document: vscode.TextDocument, range: vscode.Range): Array<{ text: string, range: vscode.Range }> {
        const comments: Array<{ text: string, range: vscode.Range }> = [];

        // 简化：只检测单行注释和块注释的起止行
        // Simplified: only check for single-line comments and beginning/end of block comments
        const startLine = range.start.line;
        const endLine = range.end.line;

        logger.debug(`扫描行范围: ${startLine}-${endLine} / Scanning line range`);

        let inBlockComment = false;
        let blockCommentStart = 0;
        let blockCommentText = '';

        for (let i = startLine; i <= endLine; i++) {
            const line = document.lineAt(i).text;

            // 处理块注释
            // Handle block comments
            if (line.includes('/*') && !inBlockComment) {
                inBlockComment = true;
                blockCommentStart = i;
                blockCommentText = line.substring(line.indexOf('/*') + 2);
                continue;
            }

            if (inBlockComment) {
                if (line.includes('*/')) {
                    inBlockComment = false;
                    blockCommentText += '\n' + line.substring(0, line.indexOf('*/'));

                    const commentRange = new vscode.Range(
                        new vscode.Position(blockCommentStart, document.lineAt(blockCommentStart).text.indexOf('/*')),
                        new vscode.Position(i, line.indexOf('*/') + 2)
                    );

                    comments.push({
                        text: blockCommentText.trim(),
                        range: commentRange
                    });

                    blockCommentText = '';
                } else {
                    blockCommentText += '\n' + line;
                }
                continue;
            }

            // 处理单行注释
            // Handle single-line comments
            const lineCommentIndex = line.indexOf('//');
            if (lineCommentIndex >= 0) {
                const commentText = line.substring(lineCommentIndex + 2).trim();
                if (commentText) {
                    const commentRange = new vscode.Range(
                        new vscode.Position(i, lineCommentIndex),
                        new vscode.Position(i, line.length)
                    );

                    comments.push({
                        text: commentText,
                        range: commentRange
                    });
                }
            }
        }

        return comments;
    }

    /**
     * 显示注释翻译
     * Show comment translation
     *
     * @param commentRange 注释范围 / Comment range
     * @param translatedText 翻译文本 / Translated text
     */
    private showCommentTranslation(commentRange: vscode.Range, translatedText: string): void {
        if (!this.editor) return;

        logger.debug(`显示翻译结果: "${translatedText.substring(0, 20)}..." / Showing translation result`);

        const originalLines = this.editor.document.getText(commentRange).split('\n');
        const translatedLines = translatedText.split('\n');

        // 确保原文和译文行数一致
        // Ensure the number of original and translated lines match
        const lineCount = Math.min(originalLines.length, translatedLines.length);

        for (let i = 0; i < lineCount; i++) {
            // 找到当前行末尾的确切位置
            // Find the exact end position of the current line
            const currentLineNumber = commentRange.start.line + i;
            const currentLine = this.editor.document.lineAt(currentLineNumber);
            const lineEndPos = currentLine.range.end;

            // 创建只包含行末位置的范围
            // Create a range that only includes the end position of the line
            const decorationRange = new vscode.Range(lineEndPos, lineEndPos);

            const lineDecorationType = vscode.window.createTextEditorDecorationType({
                after: {
                    contentText: ` ${translatedLines[i]}`,
                    fontStyle: 'italic',
                    color: this.faintColor(),
                },
                rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
            });

            // 应用装饰器 - 确保在行尾显示而不是插入到最后一个字符前
            // Apply decorator - ensure it's shown at the end of line and not inserted before the last character
            this.editor.setDecorations(lineDecorationType, [{
                range: decorationRange,
                hoverMessage: new vscode.MarkdownString(`**Original**:\n${originalLines[i]}\n\n**Translation**:\n${translatedLines[i]}`)
            }]);

            // 保存装饰器以便后续清理
            // Save decorator for later cleanup
            if (!this.commentDecorationTypes) {
                this.commentDecorationTypes = [];
            }
            this.commentDecorationTypes.push(lineDecorationType);
        }
    }

    /**
     * 检查注释是否已经翻译
     * Check if comment is already translated
     *
     * @param range 注释范围 / Comment range
     * @returns 是否已翻译 / Whether already translated
     */
    private isCommentAlreadyTranslated(range: vscode.Range): boolean {
        if (!this.editor) return false;

        // 创建一个唯一键来标识注释
        // Create a unique key to identify the comment
        const document = this.editor.document;
        const commentText = document.getText(range);
        const key = `${document.fileName}:${range.start.line}:${range.start.character}:${commentText.substring(0, 100)}`;

        // 检查是否在已翻译缓存中
        // Check if in translated cache
        return this.translatedComments.has(key);
    }

    /**
     * 标记注释为已翻译
     * Mark comment as translated
     *
     * @param range 注释范围 / Comment range
     */
    private markCommentAsTranslated(range: vscode.Range): void {
        if (!this.editor) return;

        // 创建一个唯一键来标识注释
        // Create a unique key to identify the comment
        const document = this.editor.document;
        const commentText = document.getText(range);
        const key = `${document.fileName}:${range.start.line}:${range.start.character}:${commentText.substring(0, 100)}`;

        // 将注释标记为已翻译
        // Mark comment as translated
        this.translatedComments.set(key, true);
    }

    // 存储注释装饰器类型
    // Store comment decoration types
    private commentDecorationTypes: vscode.TextEditorDecorationType[] = [];

    /**
     * 注册提供程序
     * Register provider
     */
    public static register(context: vscode.ExtensionContext): TranslationProvider {
        const provider = new TranslationProvider(context);

        // 注册代码操作提供程序
        // Register code action provider
        context.subscriptions.push(
            vscode.languages.registerCodeActionsProvider(
                { scheme: 'file' },  // 适用于所有文件 / Apply to all files
                provider
            )
        );

        // 注册翻译命令
        // Register translation command
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'gopp.translateSelection',
                () => provider.translateSelection()
            )
        );

        // 注册配置
        // Register configuration
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'gopp.configureTranslation',
                async () => {
                    // 打开设置页面
                    // Open settings page
                    await vscode.commands.executeCommand(
                        'workbench.action.openSettings',
                        'goAssist.translation'
                    );
                }
            )
        );

        // 注册切换自动翻译命令
        // Register toggle auto translate command
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'gopp.toggleAutoTranslate',
                async () => {
                    // 切换自动翻译设置
                    // Toggle auto translation setting
                    const config = vscode.workspace.getConfiguration('gopp.translation');
                    const currentValue = config.get('autoTranslateOnActiveEditor', false);

                    logger.info(`切换自动翻译: ${currentValue} -> ${!currentValue} / Toggling auto translation`);

                    await config.update('autoTranslateOnActiveEditor', !currentValue, vscode.ConfigurationTarget.Global);

                    // 显示通知
                    // Show notification
                    vscode.window.showInformationMessage(
                        !currentValue
                            ? '已启用自动翻译当前编辑窗口 / Auto translation enabled'
                            : '已禁用自动翻译 / Auto translation disabled'
                    );

                    // 如果启用了自动翻译，立即翻译当前编辑器内容
                    // If auto translation is enabled, immediately translate current editor content
                    if (!currentValue && vscode.window.activeTextEditor) {
                        logger.info('自动翻译已启用，立即翻译当前编辑器内容 / Auto translation enabled, immediately translating current editor content');
                        provider.translateVisibleContent();
                    }
                }
            )
        );
        return provider;
    }

    private faintColor(): string {
        return vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
            ? 'rgba(116, 127, 117, 0.4)'
            : 'rgba(48, 42, 42, 0.3)';
    }
}
