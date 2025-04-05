import * as vscode from 'vscode';
import { TranslationService } from './service';
import { Logger } from '../../pkg/logger';

// 初始化日志实例
// Initialize logger instance
const logger = Logger.withContext('TranslationWebView');

/**
 * 翻译配置WebView面板
 * Translation Settings WebView Panel
 */
export class TranslationWebViewPanel {
    // WebView面板
    // WebView panel
    private static currentPanel: TranslationWebViewPanel | undefined;
    
    // 视图类型
    // View type
    private static readonly viewType = 'translationSettings';
    
    // 面板实例
    // Panel instance
    private readonly panel: vscode.WebviewPanel;
    
    // 扩展上下文
    // Extension context
    private readonly extensionContext: vscode.ExtensionContext;
    
    // 当前配置
    // Current configuration
    private config: any;
    
    // 销毁事件
    // Dispose event
    private disposables: vscode.Disposable[] = [];
    
    /**
     * 当前配置面板是否存在
     * Check if current panel exists
     */
    public static isCurrentPanelActive(): boolean {
        return !!TranslationWebViewPanel.currentPanel;
    }
    
    /**
     * 创建或显示面板
     * Create or show panel
     * 
     * @param extensionContext 扩展上下文 / Extension context
     */
    public static createOrShow(extensionContext: vscode.ExtensionContext) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : vscode.ViewColumn.One;
            
        // 如果已经有面板，激活它
        // If panel exists, activate it
        if (TranslationWebViewPanel.currentPanel) {
            TranslationWebViewPanel.currentPanel.panel.reveal(column);
            return;
        }
        
        // 创建面板
        // Create panel
        const panel = vscode.window.createWebviewPanel(
            TranslationWebViewPanel.viewType,
            '翻译设置',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionContext.extensionUri, 'media')
                ]
            }
        );
        
        // 创建面板实例
        // Create panel instance
        TranslationWebViewPanel.currentPanel = new TranslationWebViewPanel(panel, extensionContext);
    }
    
    /**
     * 构造函数
     * Constructor
     * 
     * @param panel WebView面板 / WebView panel
     * @param extensionContext 扩展上下文 / Extension context
     */
    private constructor(panel: vscode.WebviewPanel, extensionContext: vscode.ExtensionContext) {
        this.panel = panel;
        this.extensionContext = extensionContext;
        
        // 加载配置
        // Load configuration
        this.loadConfig();
        
        // 设置WebView内容
        // Set WebView content
        this.update();
        
        // 销毁时处理
        // Handle dispose
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        
        // WebView消息处理
        // Handle WebView messages
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'saveConfig':
                        await this.saveConfig(message.config);
                        return;
                        
                    case 'testConnection':
                        await this.testConnection(message.engineType);
                        return;
                        
                    case 'openSettings':
                        await vscode.commands.executeCommand('workbench.action.openSettings', 'goAssist.translation');
                        return;
                }
            },
            null,
            this.disposables
        );
        
        // 监听配置变更
        // Listen to configuration changes
        vscode.workspace.onDidChangeConfiguration(
            e => {
                if (e.affectsConfiguration('goAssist.translation')) {
                    this.loadConfig();
                    this.update();
                }
            },
            null,
            this.disposables
        );
    }
    
    /**
     * 加载配置
     * Load configuration
     */
    private loadConfig() {
        const config = vscode.workspace.getConfiguration('goAssist.translation');
        
        this.config = {
            engineType: config.get('engineType', TranslationService.ENGINE_TYPES.AUTO),
            sourceLanguage: config.get('sourceLanguage', 'en'),
            targetLanguage: config.get('targetLanguage', 'zh-CN'),
            autoDetectLanguage: config.get('autoDetectLanguage', true),
            microsoftApiKey: config.get('microsoftApiKey', ''),
            googleApiKey: config.get('googleApiKey', ''),
            baiduAppId: config.get('baiduAppId', ''),
            baiduSecretKey: config.get('baiduSecretKey', ''),
            aliyunAccessKeyId: config.get('aliyunAccessKeyId', ''),
            aliyunAccessKeySecret: config.get('aliyunAccessKeySecret', '')
        };
    }
    
    /**
     * 保存配置
     * Save configuration
     * 
     * @param newConfig 新配置 / New configuration
     */
    private async saveConfig(newConfig: any) {
        try {
            const config = vscode.workspace.getConfiguration('goAssist.translation');
            
            // 更新配置
            // Update configuration
            for (const [key, value] of Object.entries(newConfig)) {
                await config.update(key, value, vscode.ConfigurationTarget.Global);
            }
            
            // 重新加载配置
            // Reload configuration
            this.loadConfig();
            this.update();
            
            vscode.window.showInformationMessage('翻译设置已保存');
        } catch (error) {
            logger.error('保存配置失败:', error);
            vscode.window.showErrorMessage(`保存配置失败: ${error}`);
        }
    }
    
    /**
     * 测试连接
     * Test connection
     * 
     * @param engineType 引擎类型 / Engine type
     */
    private async testConnection(engineType: string) {
        try {
            const testText = 'Hello, world!';
            
            // 显示进度
            // Show progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `正在测试连接...`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 30, message: "初始化翻译引擎..." });
                
                // 执行翻译
                // Perform translation
                const translationConfig = {
                    microsoftApiKey: this.config.microsoftApiKey,
                    googleApiKey: this.config.googleApiKey,
                    baiduAppId: this.config.baiduAppId,
                    baiduSecretKey: this.config.baiduSecretKey,
                    aliyunAccessKeyId: this.config.aliyunAccessKeyId,
                    aliyunAccessKeySecret: this.config.aliyunAccessKeySecret
                };
                
                progress.report({ increment: 30, message: "发送翻译请求..." });
                
                const result = await TranslationService.translate(
                    testText,
                    'zh-CN',
                    'en',
                    engineType,
                    translationConfig
                );
                
                progress.report({ increment: 40, message: "解析结果..." });
                
                // 检查结果
                // Check result
                if (result.includes('API key required') || 
                    result.includes('failed') || 
                    result.includes('error')) {
                    // 发送结果到WebView
                    // Send result to WebView
                    this.panel.webview.postMessage({
                        command: 'testResult',
                        success: false,
                        message: `测试失败: ${result}`,
                        engineType
                    });
                    
                    vscode.window.showErrorMessage(`测试失败: ${result}`);
                } else {
                    // 发送结果到WebView
                    // Send result to WebView
                    this.panel.webview.postMessage({
                        command: 'testResult',
                        success: true,
                        message: `测试成功! "${testText}" → "${result}"`,
                        engineType
                    });
                    
                    vscode.window.showInformationMessage(`测试成功! "${testText}" → "${result}"`);
                }
            });
        } catch (error) {
            logger.error('测试连接失败:', error);
            
            // 发送错误到WebView
            // Send error to WebView
            this.panel.webview.postMessage({
                command: 'testResult',
                success: false,
                message: `测试连接失败: ${error}`,
                engineType
            });
            
            vscode.window.showErrorMessage(`测试连接失败: ${error}`);
        }
    }
    
    /**
     * 更新WebView内容
     * Update WebView content
     */
    private update() {
        this.panel.title = '翻译设置';
        this.panel.webview.html = this.getWebviewContent();
    }
    
    /**
     * 获取WebView内容
     * Get WebView content
     * 
     * @returns WebView HTML
     */
    private getWebviewContent() {
        return `<!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>翻译设置</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                    margin: 0;
                }
                
                h1 {
                    font-size: 1.5em;
                    margin-bottom: 20px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding-bottom: 10px;
                }
                
                .container {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                    max-width: 800px;
                    margin: 0 auto;
                }
                
                .section {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 5px;
                    padding: 15px;
                    margin-bottom: 10px;
                }
                
                .section-title {
                    font-size: 1.2em;
                    margin-bottom: 15px;
                    font-weight: bold;
                }
                
                .form-group {
                    margin-bottom: 15px;
                }
                
                label {
                    display: block;
                    margin-bottom: 5px;
                }
                
                select, input[type="text"], input[type="password"] {
                    width: 100%;
                    padding: 8px;
                    box-sizing: border-box;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 2px;
                }
                
                input[type="checkbox"] {
                    margin-right: 5px;
                }
                
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 12px;
                    border-radius: 2px;
                    cursor: pointer;
                    margin-right: 10px;
                }
                
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .engine-item {
                    padding: 10px;
                    margin-bottom: 10px;
                    border-radius: 3px;
                    border: 1px solid var(--vscode-panel-border);
                    display: flex;
                    align-items: center;
                    position: relative;
                }
                
                .engine-item.active {
                    border-color: var(--vscode-focusBorder);
                    background-color: var(--vscode-editor-selectionBackground);
                }
                
                .engine-icon {
                    width: 24px;
                    height: 24px;
                    margin-right: 10px;
                    text-align: center;
                    line-height: 24px;
                    font-size: 14px;
                }
                
                .engine-info {
                    flex-grow: 1;
                }
                
                .engine-title {
                    font-weight: bold;
                    margin-bottom: 3px;
                }
                
                .engine-description {
                    font-size: 0.9em;
                    opacity: 0.8;
                }
                
                .engine-actions {
                    margin-left: 10px;
                }
                
                .test-result {
                    font-size: 0.9em;
                    margin-top: 5px;
                    padding: 5px;
                    border-radius: 2px;
                }
                
                .test-success {
                    background-color: var(--vscode-testing-iconPassed);
                    color: var(--vscode-editor-background);
                }
                
                .test-error {
                    background-color: var(--vscode-testing-iconFailed);
                    color: var(--vscode-editor-background);
                }
                
                .tab-container {
                    display: flex;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    margin-bottom: 20px;
                }
                
                .tab {
                    padding: 10px 15px;
                    cursor: pointer;
                    background-color: transparent;
                    border: none;
                    color: var(--vscode-foreground);
                    opacity: 0.7;
                }
                
                .tab.active {
                    border-bottom: 2px solid var(--vscode-focusBorder);
                    opacity: 1;
                }
                
                .tab-content {
                    display: none;
                }
                
                .tab-content.active {
                    display: block;
                }
                
                .settings-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                
                .actions {
                    display: flex;
                    justify-content: flex-end;
                    margin-top: 20px;
                    gap: 10px;
                }
                
                .status-badge {
                    display: inline-block;
                    padding: 2px 8px;
                    border-radius: 10px;
                    font-size: 0.8em;
                    margin-left: 10px;
                }
                
                .status-configured {
                    background-color: var(--vscode-testing-iconPassed);
                    color: var(--vscode-editor-background);
                }
                
                .status-unconfigured {
                    background-color: var(--vscode-testing-iconQueued);
                    color: var(--vscode-editor-background);
                }
                
                .help-text {
                    font-size: 0.9em;
                    opacity: 0.8;
                    margin-top: 5px;
                }

                .password-field {
                    position: relative;
                }

                .password-field button {
                    position: absolute;
                    right: 5px;
                    top: 8px;
                    background: none;
                    border: none;
                    color: var(--vscode-foreground);
                    opacity: 0.7;
                    padding: 0;
                    margin: 0;
                }

                .password-field button:hover {
                    opacity: 1;
                    background: none;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="settings-header">
                    <h1>翻译设置</h1>
                </div>
                
                <div class="tab-container">
                    <button class="tab active" data-tab="engines">翻译引擎</button>
                    <button class="tab" data-tab="options">语言选项</button>
                </div>
                
                <div id="engines" class="tab-content active">
                    <div class="section">
                        <div class="section-title">当前翻译引擎</div>
                        
                        <div class="form-group">
                            <label for="engineType">默认翻译引擎</label>
                            <select id="engineType" name="engineType">
                                <option value="auto" ${this.config.engineType === 'auto' ? 'selected' : ''}>自动选择</option>
                                <option value="microsoft" ${this.config.engineType === 'microsoft' ? 'selected' : ''}>微软翻译</option>
                                <option value="google" ${this.config.engineType === 'google' ? 'selected' : ''}>谷歌翻译</option>
                                <option value="baidu" ${this.config.engineType === 'baidu' ? 'selected' : ''}>百度翻译</option>
                                <option value="aliyun" ${this.config.engineType === 'aliyun' ? 'selected' : ''}>阿里云翻译</option>
                                <option value="built_in" ${this.config.engineType === 'built_in' ? 'selected' : ''}>内置翻译</option>
                            </select>
                        </div>
                        
                        <div class="engine-list">
                            <div class="engine-item ${this.config.engineType === 'auto' ? 'active' : ''}" data-engine="auto">
                                <div class="engine-icon">🔄</div>
                                <div class="engine-info">
                                    <div class="engine-title">自动选择</div>
                                    <div class="engine-description">智能选择最佳可用引擎</div>
                                </div>
                                <div class="engine-actions">
                                    <button onclick="testConnection('auto')">测试</button>
                                </div>
                            </div>
                            
                            <div class="engine-item ${this.config.engineType === 'microsoft' ? 'active' : ''}" data-engine="microsoft">
                                <div class="engine-icon">🔤</div>
                                <div class="engine-info">
                                    <div class="engine-title">微软翻译
                                        <span class="status-badge ${this.config.microsoftApiKey ? 'status-configured' : 'status-unconfigured'}">
                                            ${this.config.microsoftApiKey ? '已配置' : '未配置'}
                                        </span>
                                    </div>
                                    <div class="engine-description">使用微软翻译API（需要API密钥）</div>
                                </div>
                                <div class="engine-actions">
                                    <button onclick="testConnection('microsoft')">测试</button>
                                </div>
                            </div>
                            
                            <div class="engine-item ${this.config.engineType === 'google' ? 'active' : ''}" data-engine="google">
                                <div class="engine-icon">🌐</div>
                                <div class="engine-info">
                                    <div class="engine-title">谷歌翻译
                                        <span class="status-badge ${this.config.googleApiKey ? 'status-configured' : 'status-unconfigured'}">
                                            ${this.config.googleApiKey ? '已配置' : '未配置'}
                                        </span>
                                    </div>
                                    <div class="engine-description">使用谷歌翻译API（需要API密钥）</div>
                                </div>
                                <div class="engine-actions">
                                    <button onclick="testConnection('google')">测试</button>
                                </div>
                            </div>
                            
                            <div class="engine-item ${this.config.engineType === 'baidu' ? 'active' : ''}" data-engine="baidu">
                                <div class="engine-icon">🀄</div>
                                <div class="engine-info">
                                    <div class="engine-title">百度翻译
                                        <span class="status-badge ${this.config.baiduAppId && this.config.baiduSecretKey ? 'status-configured' : 'status-unconfigured'}">
                                            ${this.config.baiduAppId && this.config.baiduSecretKey ? '已配置' : '未配置'}
                                        </span>
                                    </div>
                                    <div class="engine-description">使用百度翻译API（需要APP ID和密钥）</div>
                                </div>
                                <div class="engine-actions">
                                    <button onclick="testConnection('baidu')">测试</button>
                                </div>
                            </div>
                            
                            <div class="engine-item ${this.config.engineType === 'aliyun' ? 'active' : ''}" data-engine="aliyun">
                                <div class="engine-icon">☁️</div>
                                <div class="engine-info">
                                    <div class="engine-title">阿里云翻译
                                        <span class="status-badge ${this.config.aliyunAccessKeyId && this.config.aliyunAccessKeySecret ? 'status-configured' : 'status-unconfigured'}">
                                            ${this.config.aliyunAccessKeyId && this.config.aliyunAccessKeySecret ? '已配置' : '未配置'}
                                        </span>
                                    </div>
                                    <div class="engine-description">使用阿里云翻译API（需要AccessKey ID和密钥）</div>
                                </div>
                                <div class="engine-actions">
                                    <button onclick="testConnection('aliyun')">测试</button>
                                </div>
                            </div>
                            
                            <div class="engine-item ${this.config.engineType === 'built_in' ? 'active' : ''}" data-engine="built_in">
                                <div class="engine-icon">📔</div>
                                <div class="engine-info">
                                    <div class="engine-title">内置翻译</div>
                                    <div class="engine-description">使用内置离线翻译功能（无需配置）</div>
                                </div>
                                <div class="engine-actions">
                                    <button onclick="testConnection('built_in')">测试</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="section">
                        <div class="section-title">API凭据配置</div>
                        
                        <div class="form-group">
                            <label for="microsoftApiKey">微软翻译API密钥</label>
                            <div class="password-field">
                                <input type="password" id="microsoftApiKey" name="microsoftApiKey" value="${this.config.microsoftApiKey}" placeholder="输入微软翻译API密钥...">
                                <button type="button" onclick="toggleVisibility('microsoftApiKey')">👁️</button>
                            </div>
                            <div class="help-text">微软翻译API密钥可在Azure门户获取</div>
                        </div>
                        
                        <div class="form-group">
                            <label for="googleApiKey">谷歌翻译API密钥</label>
                            <div class="password-field">
                                <input type="password" id="googleApiKey" name="googleApiKey" value="${this.config.googleApiKey}" placeholder="输入谷歌翻译API密钥...">
                                <button type="button" onclick="toggleVisibility('googleApiKey')">👁️</button>
                            </div>
                            <div class="help-text">谷歌翻译API密钥可在Google Cloud Console获取</div>
                        </div>
                        
                        <div class="form-group">
                            <label for="baiduAppId">百度翻译APP ID</label>
                            <input type="text" id="baiduAppId" name="baiduAppId" value="${this.config.baiduAppId}" placeholder="输入百度翻译APP ID...">
                        </div>
                        
                        <div class="form-group">
                            <label for="baiduSecretKey">百度翻译密钥</label>
                            <div class="password-field">
                                <input type="password" id="baiduSecretKey" name="baiduSecretKey" value="${this.config.baiduSecretKey}" placeholder="输入百度翻译密钥...">
                                <button type="button" onclick="toggleVisibility('baiduSecretKey')">👁️</button>
                            </div>
                            <div class="help-text">百度翻译API凭据可在百度翻译开放平台获取</div>
                        </div>
                        
                        <div class="form-group">
                            <label for="aliyunAccessKeyId">阿里云AccessKey ID</label>
                            <input type="text" id="aliyunAccessKeyId" name="aliyunAccessKeyId" value="${this.config.aliyunAccessKeyId}" placeholder="输入阿里云AccessKey ID...">
                        </div>
                        
                        <div class="form-group">
                            <label for="aliyunAccessKeySecret">阿里云AccessKey Secret</label>
                            <div class="password-field">
                                <input type="password" id="aliyunAccessKeySecret" name="aliyunAccessKeySecret" value="${this.config.aliyunAccessKeySecret}" placeholder="输入阿里云AccessKey Secret...">
                                <button type="button" onclick="toggleVisibility('aliyunAccessKeySecret')">👁️</button>
                            </div>
                            <div class="help-text">阿里云API凭据可在阿里云控制台获取</div>
                        </div>
                    </div>
                </div>
                
                <div id="options" class="tab-content">
                    <div class="section">
                        <div class="section-title">语言设置</div>
                        
                        <div class="form-group">
                            <label for="sourceLanguage">默认源语言</label>
                            <select id="sourceLanguage" name="sourceLanguage">
                                <option value="en" ${this.config.sourceLanguage === 'en' ? 'selected' : ''}>英语</option>
                                <option value="zh-CN" ${this.config.sourceLanguage === 'zh-CN' ? 'selected' : ''}>中文</option>
                                <option value="ja" ${this.config.sourceLanguage === 'ja' ? 'selected' : ''}>日语</option>
                                <option value="ko" ${this.config.sourceLanguage === 'ko' ? 'selected' : ''}>韩语</option>
                                <option value="fr" ${this.config.sourceLanguage === 'fr' ? 'selected' : ''}>法语</option>
                                <option value="de" ${this.config.sourceLanguage === 'de' ? 'selected' : ''}>德语</option>
                                <option value="es" ${this.config.sourceLanguage === 'es' ? 'selected' : ''}>西班牙语</option>
                                <option value="ru" ${this.config.sourceLanguage === 'ru' ? 'selected' : ''}>俄语</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label for="targetLanguage">默认目标语言</label>
                            <select id="targetLanguage" name="targetLanguage">
                                <option value="en" ${this.config.targetLanguage === 'en' ? 'selected' : ''}>英语</option>
                                <option value="zh-CN" ${this.config.targetLanguage === 'zh-CN' ? 'selected' : ''}>中文</option>
                                <option value="ja" ${this.config.targetLanguage === 'ja' ? 'selected' : ''}>日语</option>
                                <option value="ko" ${this.config.targetLanguage === 'ko' ? 'selected' : ''}>韩语</option>
                                <option value="fr" ${this.config.targetLanguage === 'fr' ? 'selected' : ''}>法语</option>
                                <option value="de" ${this.config.targetLanguage === 'de' ? 'selected' : ''}>德语</option>
                                <option value="es" ${this.config.targetLanguage === 'es' ? 'selected' : ''}>西班牙语</option>
                                <option value="ru" ${this.config.targetLanguage === 'ru' ? 'selected' : ''}>俄语</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="autoDetectLanguage" name="autoDetectLanguage" ${this.config.autoDetectLanguage ? 'checked' : ''}>
                                自动检测源语言
                            </label>
                            <div class="help-text">启用后，将自动检测文本语言并适当调整翻译方向</div>
                        </div>
                    </div>
                </div>
                
                <div class="actions">
                    <button onclick="openSettings()">在设置中编辑</button>
                    <button onclick="saveConfig()">保存配置</button>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                // 切换标签页
                const tabs = document.querySelectorAll('.tab');
                const tabContents = document.querySelectorAll('.tab-content');
                
                tabs.forEach(tab => {
                    tab.addEventListener('click', () => {
                        const tabName = tab.getAttribute('data-tab');
                        
                        // 更新活动标签
                        tabs.forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        
                        // 更新活动内容
                        tabContents.forEach(content => {
                            if (content.id === tabName) {
                                content.classList.add('active');
                            } else {
                                content.classList.remove('active');
                            }
                        });
                    });
                });
                
                // 引擎项点击处理
                document.querySelectorAll('.engine-item').forEach(item => {
                    item.addEventListener('click', (e) => {
                        if (e.target.tagName !== 'BUTTON') {
                            const engineType = item.getAttribute('data-engine');
                            document.getElementById('engineType').value = engineType;
                            
                            // 更新活动状态
                            document.querySelectorAll('.engine-item').forEach(i => {
                                i.classList.remove('active');
                            });
                            item.classList.add('active');
                        }
                    });
                });
                
                // 测试连接
                function testConnection(engineType) {
                    vscode.postMessage({
                        command: 'testConnection',
                        engineType: engineType
                    });
                }
                
                // 切换密码可见性
                function toggleVisibility(elementId) {
                    const element = document.getElementById(elementId);
                    element.type = element.type === 'password' ? 'text' : 'password';
                }
                
                // 保存配置
                function saveConfig() {
                    const config = {
                        engineType: document.getElementById('engineType').value,
                        sourceLanguage: document.getElementById('sourceLanguage').value,
                        targetLanguage: document.getElementById('targetLanguage').value,
                        autoDetectLanguage: document.getElementById('autoDetectLanguage').checked,
                        microsoftApiKey: document.getElementById('microsoftApiKey').value,
                        googleApiKey: document.getElementById('googleApiKey').value,
                        baiduAppId: document.getElementById('baiduAppId').value,
                        baiduSecretKey: document.getElementById('baiduSecretKey').value,
                        aliyunAccessKeyId: document.getElementById('aliyunAccessKeyId').value,
                        aliyunAccessKeySecret: document.getElementById('aliyunAccessKeySecret').value
                    };
                    
                    vscode.postMessage({
                        command: 'saveConfig',
                        config: config
                    });
                }
                
                // 在设置中编辑
                function openSettings() {
                    vscode.postMessage({
                        command: 'openSettings'
                    });
                }
                
                // 接收消息
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.command) {
                        case 'testResult':
                            handleTestResult(message);
                            break;
                    }
                });
                
                // 处理测试结果
                function handleTestResult(message) {
                    const engineItem = document.querySelector(\`.engine-item[data-engine="\${message.engineType}"]\`);
                    
                    // 移除旧的测试结果
                    const oldResult = engineItem.querySelector('.test-result');
                    if (oldResult) {
                        oldResult.remove();
                    }
                    
                    // 创建新的测试结果
                    const resultElement = document.createElement('div');
                    resultElement.className = \`test-result \${message.success ? 'test-success' : 'test-error'}\`;
                    resultElement.textContent = message.message;
                    
                    // 添加到引擎项
                    engineItem.querySelector('.engine-info').appendChild(resultElement);
                    
                    // 10秒后移除
                    setTimeout(() => {
                        resultElement.remove();
                    }, 10000);
                }
            </script>
        </body>
        </html>`;
    }
    
    /**
     * 销毁面板
     * Dispose panel
     */
    private dispose() {
        TranslationWebViewPanel.currentPanel = undefined;
        
        // 清理资源
        // Clean up resources
        this.panel.dispose();
        
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}

/**
 * 打开翻译设置面板
 * Open translation settings panel
 * 
 * @param context 扩展上下文 / Extension context
 */
export function openTranslationSettingsPanel(context: vscode.ExtensionContext) {
    TranslationWebViewPanel.createOrShow(context);
}
