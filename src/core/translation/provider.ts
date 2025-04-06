import * as vscode from 'vscode';
import { TranslationService } from './service';
import { Logger } from '../../pkg/logger';

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
    
    // 配置
    // Configuration
    private config = {
        microsoftApiKey: '',
        googleApiKey: '',
        aliyunAccessKeyId: '',
        aliyunAccessKeySecret: '',
        baiduAppId: '',
        baiduSecretKey: '',
        volcengineAccessKeyId: '',
        volcengineSecretAccessKey: '',
        sourceLang: 'en',
        targetLang: 'zh-CN',
        autoDetect: true,
        engineType: TranslationService.ENGINE_TYPES.BAIDU
    };
    
    // 已翻译注释的缓存
    // Cache of translated comments
    private translatedComments = new Map<string, boolean>();
    
    /**
     * 构造函数
     * Constructor
     */
    constructor(private context: vscode.ExtensionContext) {
        // 初始化配置
        // Initialize configuration
        this.loadConfig();
        
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
        const config = vscode.workspace.getConfiguration('gopp.translation');
        this.config = {
            microsoftApiKey: config.get('microsoftApiKey', ''),
            googleApiKey: config.get('googleApiKey', ''),
            baiduAppId: config.get('baiduAppId', ''),
            baiduSecretKey: config.get('baiduSecretKey', ''),
            aliyunAccessKeyId: config.get('aliyunAccessKeyId', ''),
            aliyunAccessKeySecret: config.get('aliyunAccessKeySecret', ''),
            volcengineAccessKeyId: config.get('volcengineAccessKeyId', ''),
            volcengineSecretAccessKey: config.get('volcengineSecretAccessKey', ''),
            sourceLang: config.get('sourceLanguage', 'en'),
            targetLang: config.get('targetLanguage', 'zh-CN'),
            autoDetect: config.get('autoDetectLanguage', true),
            engineType: config.get('engineType', TranslationService.ENGINE_TYPES.BAIDU)
        };
    }
    
    /**
     * 处理配置变更
     * Handle configuration change
     */
    private handleConfigChange(event: vscode.ConfigurationChangeEvent): void {
        if (event.affectsConfiguration('gopp.translation')) {
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
     * 翻译选中的文本
     * Translate selected text
     */
    public async translateSelection(): Promise<void> {
        if (!this.editor || !this.lastTranslatedRange) {
            logger.info('编辑器或上次翻译范围为空，无法翻译 / Editor or last translated range is null, cannot translate');
            return;
        }
        
        try {
            const text = this.editor.document.getText(this.lastTranslatedRange);
            if (!text) {
                logger.info('选中文本为空，无法翻译 / Selected text is empty, cannot translate');
                return;
            }
            
            logger.info(`翻译文本长度: ${text.length} / Translating text length`);
            
            // 确定源语言和目标语言
            // Determine source and target languages
            let sourceLang = this.config.sourceLang;
            let targetLang = this.config.targetLang;
            
            // 如果启用了自动检测
            // If auto-detection is enabled
            if (this.config.autoDetect) {
                const detectedLang = TranslationService.detectLanguage(text);
                logger.info(`检测到语言: ${detectedLang} / Detected language: ${detectedLang}`);
                
                // 更智能的语言检测逻辑
                // Smarter language detection logic
                if (detectedLang === 'zh-CN' || detectedLang === 'zh') {
                    // 如果检测到中文，就翻译成英文
                    // If Chinese is detected, translate to English
                    sourceLang = 'zh-CN';
                    targetLang = 'en';
                } else if (detectedLang === 'en' || detectedLang.startsWith('en-')) {
                    // 如果检测到英文，就翻译成中文
                    // If English is detected, translate to Chinese
                    sourceLang = 'en';
                    targetLang = 'zh-CN';
                } else {
                    // 其他语言，使用配置中的默认设置
                    // For other languages, use default settings from configuration
                    logger.info(`使用默认语言设置: ${sourceLang} -> ${targetLang} / Using default language settings`);
                }
                
                logger.info(`翻译方向: ${sourceLang} -> ${targetLang} / Translation direction`);
            }
            
            // 显示翻译状态信息
            // Show translation status message
            const statusMessage = vscode.window.setStatusBarMessage('正在翻译.../ Translating...');
            
            try {
                // 处理多行翻译 - 显示带有进度的通知
                // Handle multi-line translation - show notification with progress
                if (text.includes('\n') && text.length > 100) {
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: "翻译中... / Translating...",
                        cancellable: false
                    }, async (progress) => {
                        progress.report({ increment: 30, message: "处理文本... / Processing text..." });
                        
                        // 执行翻译
                        // Perform translation
                        const translatedText = await TranslationService.translate(
                            text,
                            targetLang,
                            sourceLang,
                            this.config.engineType,
                            {
                                microsoftApiKey: this.config.microsoftApiKey,
                                googleApiKey: this.config.googleApiKey,
                                baiduAppId: this.config.baiduAppId,
                                baiduSecretKey: this.config.baiduSecretKey,
                                aliyunAccessKeyId: this.config.aliyunAccessKeyId,
                                aliyunAccessKeySecret: this.config.aliyunAccessKeySecret,
                                volcengineAccessKeyId: this.config.volcengineAccessKeyId,
                                volcengineSecretAccessKey: this.config.volcengineSecretAccessKey
                            }
                        );
                        
                        progress.report({ increment: 60, message: "更新显示... / Updating display..." });
                        
                        // 为多行文本添加特殊显示
                        // Add special display for multi-line text
                        this.showTranslation(text, translatedText, true);
                        
                        // 记录日志
                        // Log
                        logger.info(`已翻译多行文本，长度: ${text.length} => ${translatedText.length} / Translated multi-line text`);
                        
                        progress.report({ increment: 10, message: "完成 / Done" });
                    });
                } else {
                    // 执行翻译 - 针对单行文本的常规处理
                    // Perform translation - regular handling for single-line text
                    const translatedText = await TranslationService.translate(
                        text,
                        targetLang,
                        sourceLang,
                        this.config.engineType,
                        {
                            microsoftApiKey: this.config.microsoftApiKey,
                            googleApiKey: this.config.googleApiKey,
                            baiduAppId: this.config.baiduAppId,
                            baiduSecretKey: this.config.baiduSecretKey,
                            aliyunAccessKeyId: this.config.aliyunAccessKeyId,
                            aliyunAccessKeySecret: this.config.aliyunAccessKeySecret,
                            volcengineAccessKeyId: this.config.volcengineAccessKeyId,
                            volcengineSecretAccessKey: this.config.volcengineSecretAccessKey
                        }
                    );
                    
                    // 显示翻译结果
                    // Display translation result
                    logger.info(`准备显示翻译结果，原文长度: ${text.length}，译文长度: ${translatedText.length} / Preparing to show translation result`);
                    this.showTranslation(text, translatedText, text.includes('\n'));
                    
                    // 记录日志
                    // Log
                    logger.info(`已翻译: "${text}" => "${translatedText}"`);
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
            logger.error('翻译失败 / Translation failed:', error);
            vscode.window.showErrorMessage(`翻译失败: ${error}`);
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
            logger.info('编辑器或上次翻译范围为空，无法显示翻译 / Editor or last translated range is null, cannot show translation');
            return;
        }
        
        // 确保翻译结果不为空
        // Ensure translation result is not empty
        if (!translatedText || translatedText === originalText) {
            translatedText = 'Translation failed';
            logger.warn('翻译结果为空或与原文相同 / Translation result is empty or same as original text');
        }
        
        // 确保显示时考虑多行情况
        // Make sure display handles multiline scenarios
        let displayText = ` → ${translatedText} `;
        
        logger.debug(`翻译结果: ${displayText} / Translation result`);

        // 创建装饰器，但使用临时的一次性装饰器，避免使用共享的静态装饰器
        // Create decoration, but use temporary one-time decorator to avoid shared static decorator
        const tempDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: displayText,
                color: new vscode.ThemeColor('editorCodeLens.foreground'),
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
        logger.info('应用翻译装饰器 / Applying translation decoration');
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
            TranslationService.clearExpiredCache();
        }
    }
    
    /**
     * 提供代码操作
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
        
        logger.info(`活动编辑器变更: ${editor.document.fileName} / Active editor changed`);
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
    private debouncedTranslateVisibleContent = this.debounce(() => {
        this.translateVisibleContent();
    }, 1000); // 1秒钟的防抖动延迟 / 1 second debounce delay

    /**
     * 防抖动函数，限制函数调用频率
     * Debounce function to limit function call frequency
     * 
     * @param func 要执行的函数 / Function to execute
     * @param wait 等待时间（毫秒） / Wait time (milliseconds)
     * @returns 防抖动后的函数 / Debounced function
     */
    private debounce(func: Function, wait: number): (...args: any[]) => void {
        let timeout: NodeJS.Timeout | null = null;
        
        return (...args: any[]) => {
            const later = () => {
                timeout = null;
                func(...args);
            };
            
            if (timeout) {
                clearTimeout(timeout);
            }
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * 处理窗口滚动事件
     * Handle editor scroll event
     */
    private handleEditorScroll(): void {
        if (!this.editor) return;
        
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
        
        // 检查是否启用了自动翻译
        // Check if auto translation is enabled
        const config = vscode.workspace.getConfiguration('gopp.translation');
        let autoTranslate = config.get('autoTranslateOnActiveEditor', true);
        
        logger.info(`自动翻译设置状态: ${autoTranslate} / Auto translation setting status`);
        
        // 如果未启用自动翻译，返回
        if (!autoTranslate) {
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
        
        logger.debug('开始翻译可见窗口的注释 / Starting to translate visible comments');
        
        // 显示状态信息
        // Show status message
        const statusMessage = vscode.window.setStatusBarMessage('正在翻译可见注释.../ Translating visible comments...');
        
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
            
            // 3. 翻译每个注释并显示结果
            // 3. Translate each comment and display results
            for (const comment of comments) {
                const commentText = comment.text.trim();
                if (!commentText) continue;
                
                // 检查该注释是否已经翻译过，如果已翻译则跳过
                // Check if this comment has already been translated, skip if so
                if (this.isCommentAlreadyTranslated(comment.range)) {
                    logger.debug(`注释已翻译，跳过: "${commentText.substring(0, 20)}..." / Comment already translated, skipping`);
                    continue;
                }
                
                logger.debug(`翻译注释: "${commentText.substring(0, 20)}..." / Translating comment`);
                
                // 执行翻译
                // Perform translation
                const translatedText = await TranslationService.translate(
                    commentText,
                    this.config.targetLang,
                    this.config.sourceLang,
                    this.config.engineType,
                    {
                        microsoftApiKey: this.config.microsoftApiKey,
                        googleApiKey: this.config.googleApiKey,
                        baiduAppId: this.config.baiduAppId,
                        baiduSecretKey: this.config.baiduSecretKey,
                        aliyunAccessKeyId: this.config.aliyunAccessKeyId,
                        aliyunAccessKeySecret: this.config.aliyunAccessKeySecret
                    }
                );
                
                // 4. 在注释下方显示翻译结果
                // 4. Display translation result below the comment
                this.showCommentTranslation(comment.range, translatedText);
                
                // 5. 标记该注释为已翻译
                // 5. Mark this comment as translated
                this.markCommentAsTranslated(comment.range);
                
                newlyTranslatedCount++;
                logger.debug('显示注释翻译 / Showing comment translation');
            }
            
            if (!dontClearDecorations && newlyTranslatedCount > 0) {
                vscode.window.showInformationMessage(`已翻译 ${newlyTranslatedCount} 条注释 / Translated ${newlyTranslatedCount} comments`);
            }
        } catch (error) {
            logger.error('翻译可见注释时出错 / Error translating visible comments:', error);
            if (!dontClearDecorations) {
                vscode.window.showErrorMessage(`翻译注释失败: ${error} / Failed to translate comments`);
            }
        } finally {
            statusMessage.dispose();
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
    private extractCommentsFromRange(document: vscode.TextDocument, range: vscode.Range): Array<{text: string, range: vscode.Range}> {
        const comments: Array<{text: string, range: vscode.Range}> = [];
        
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
        
        // 创建一次性装饰器，但保留显示
        // Create one-time decorator, but keep displaying
        const commentDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: ` → ${translatedText}`,
                fontStyle: 'italic',
                color: new vscode.ThemeColor('editorCodeLens.foreground')
            },
            // 确保在选择文本时不会消失
            // Ensure it doesn't disappear when selecting text
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
        
        // 应用装饰器 - 在注释末尾显示
        // Apply decorator - display at the end of comment
        this.editor.setDecorations(commentDecorationType, [{
            range: new vscode.Range(commentRange.end, commentRange.end),
            hoverMessage: new vscode.MarkdownString(`**原文 / Original**:\n${this.editor.document.getText(commentRange)}\n\n**翻译 / Translation**:\n${translatedText}`)
        }]);
        
        // 保存装饰器以便后续清理
        // Save decorator for later cleanup
        if (!this.commentDecorationTypes) {
            this.commentDecorationTypes = [];
        }
        this.commentDecorationTypes.push(commentDecorationType);
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
        
        // 确保在插件激活时，自动翻译设置默认为开启
        // Ensure auto translation is enabled by default when extension is activated
        const config = vscode.workspace.getConfiguration('gopp.translation');
        const currentValue = config.get('autoTranslateOnActiveEditor', false);
        
        // 如果当前设置为关闭，则设置为开启
        // If current setting is off, turn it on
        if (currentValue === false) {
            logger.info('初始化：启用自动翻译 / Initialization: enabling auto translation');
            config.update('autoTranslateOnActiveEditor', true, vscode.ConfigurationTarget.Global);
        }
        
        return provider;
    }
}