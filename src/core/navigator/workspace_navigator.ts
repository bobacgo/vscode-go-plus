import * as vscode from 'vscode';
import { Logger } from '../../pkg/logger';

// 初始化日志实例
const logger = Logger.withContext('WorkspaceNavigator');

/**
 * 工作区导航器类
 * Workspace Navigator Class
 */
export class WorkspaceNavigator {
    /**
     * 创建工作区导航器状态栏项
     * Create workspace navigator status bar item
     * @param context 扩展上下文 Extension context
     * @returns 状态栏项 Status bar item
     */
    public static createStatusBarItem(context: vscode.ExtensionContext): vscode.StatusBarItem {
        // 创建状态栏项目 - 放置在右侧
        const statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,  // 改为右侧对齐
            0  // 优先级为0，确保在右侧显示
        );
        
        // 设置状态栏项目属性 - 使用当前工作区名称
        this.updateStatusBarText(statusBarItem);
        
        // 当点击时触发工作空间导航命令
        statusBarItem.command = "gopp.workspaceNavigator";
        
        // 添加提示文字和快捷键信息
        statusBarItem.tooltip = "gopp 工作空间导航 (Ctrl+Shift+G W/ Cmd+Shift+G W)";
        
        // 显示状态栏项目
        statusBarItem.show();
        
        // 添加到订阅列表以便正确释放资源
        context.subscriptions.push(statusBarItem);
        
        // 监听工作区变化以更新状态栏文本
        context.subscriptions.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                this.updateStatusBarText(statusBarItem);
            })
        );
        
        return statusBarItem;
    }
    
    /**
     * 更新状态栏文本，显示当前项目名称
     * Update status bar text to show current project name
     * @param statusBarItem 状态栏项 Status bar item
     */
    private static updateStatusBarText(statusBarItem: vscode.StatusBarItem): void {
        // 获取当前工作区名称
        let projectName = "无项目";
        
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            // 取第一个工作区文件夹的名称
            projectName = vscode.workspace.workspaceFolders[0].name;
        }
        
        // 从配置获取图标设置
        const config = vscode.workspace.getConfiguration('goAssist');
        const icon = config.get('workspaceIcon', '$(project)');  // 默认使用项目图标
        
        // 显示图标和项目名称
        statusBarItem.text = `${icon} ${projectName}`;
    }

    /**
     * 显示工作空间导航菜单
     * Display workspace navigation menu
     * @param context 扩展上下文 Extension context
     */
    public static async showNavigationMenu(context: vscode.ExtensionContext): Promise<void> {
        logger.info('显示工作空间导航菜单');
        
        // 定义菜单选项
        const options: vscode.QuickPickItem[] = [
            { label: '$(history) 最近打开的项目', description: '查看并打开最近的项目' },
            { label: '$(folder) 打开文件夹', description: '选择并打开一个本地文件夹' },
            { label: '$(repo) 克隆 Git 仓库', description: '克隆远程 Git 仓库到本地' },
            { label: '$(remote) 连接远程主机', description: '通过 SSH 连接到远程主机' },
            { label: '$(settings-gear) 翻译设置', description: '配置翻译引擎和选项' }
        ];
        
        // 创建一个 Map 来存储额外数据
        const actionMap = new Map<string, { action: string }>();
        actionMap.set('$(history) 最近打开的项目', { action: 'recent' });
        actionMap.set('$(folder) 打开文件夹', { action: 'folder' });
        actionMap.set('$(repo) 克隆 Git 仓库', { action: 'git' });
        actionMap.set('$(remote) 连接远程主机', { action: 'remote' });
        actionMap.set('$(settings-gear) 翻译设置', { action: 'translation-settings' });
        
        // 显示 QuickPick 菜单
        const quickPick = vscode.window.createQuickPick();
        quickPick.items = options;
        
        // 设置标题 - 不再尝试动态获取快捷键
        // 由于没有可靠的API获取键盘快捷键，使用静态标题
        // Since there's no reliable API to get keyboard shortcuts, use a static title
        quickPick.placeholder = 'Go++ 工作空间导航 (Ctrl+Shift+G W / Cmd+Shift+G W)';
        // quickPick.placeholder = '选择一个操作';
        quickPick.matchOnDescription = true;
        
        // 设置为模态模式，模拟居中体验
        quickPick.ignoreFocusOut = true; // 防止点击外部时关闭
        
        // 处理用户选择
        quickPick.onDidAccept(async () => {
            const selected = quickPick.selectedItems[0];
            quickPick.hide();
            
            if (!selected) {
                return;
            }
            
            // 从 Map 中获取对应的操作
            const actionData = actionMap.get(selected.label);
            if (!actionData) {
                return;
            }
            
            // 根据选择执行操作
            switch (actionData.action) {
                case 'folder':
                    await vscode.commands.executeCommand('vscode.openFolder');
                    break;
                    
                case 'git':
                    await vscode.commands.executeCommand('git.clone');
                    break;
                    
                case 'remote':
                    const extension = vscode.extensions.getExtension('ms-vscode-remote.remote-ssh');
                    if (extension) {
                        await vscode.commands.executeCommand('remote-ssh.connectToHost');
                    } else {
                        vscode.window.showInformationMessage(
                            '需要安装 Remote SSH 扩展来使用此功能',
                            '安装扩展'
                        ).then(selected => {
                            if (selected === '安装扩展') {
                                vscode.commands.executeCommand('extension.open', 'ms-vscode-remote.remote-ssh');
                            }
                        });
                    }
                    break;
                    
                case 'recent':
                    await vscode.commands.executeCommand('workbench.action.openRecent');
                    break;
                
                case 'translation-settings':
                    // 打开翻译设置 Webview
                    await this.showTranslationSettingsWebview(context);
                    break;
            }
        });
        
        // 显示菜单
        quickPick.show();
    }

    /**
     * 显示翻译设置 Webview
     * Display translation settings Webview
     * @param context 扩展上下文 Extension context
     */
    private static async showTranslationSettingsWebview(context: vscode.ExtensionContext): Promise<void> {
        // 创建 Webview 面板
        const panel = vscode.window.createWebviewPanel(
            'translationSettings', // 标识符
            '翻译设置', // 标题
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false }, // 显示在旁边的较小窗口
            {
                enableScripts: true, // 允许运行 JavaScript
                retainContextWhenHidden: true // 隐藏时保留上下文
            }
        );

        // 设置 Webview 的 HTML 内容
        panel.webview.html = this.getTranslationSettingsHtml();

        // 处理 Webview 消息
        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'saveSettings':
                        // 保存设置到配置文件
                        const config = vscode.workspace.getConfiguration('goAssist');
                        const translateConfig = vscode.workspace.getConfiguration('goAssist.translation');
                        config.update('translationEngine', message.data.engine, vscode.ConfigurationTarget.Global);
                        config.update('apiKey', message.data.apiKey, vscode.ConfigurationTarget.Global);
                        translateConfig.update('enableBilingualComments', message.data.enableBilingualComments, vscode.ConfigurationTarget.Global);
                        translateConfig.update('autoTranslateOnActiveEditor', message.data.autoTranslateOnActiveEditor, vscode.ConfigurationTarget.Global);
                        
                        vscode.window.showInformationMessage('翻译设置已保存！');
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
    }

    /**
     * 获取翻译设置 Webview 的 HTML 内容
     * Get HTML content for translation settings Webview
     * @returns HTML 字符串 HTML string
     */
    private static getTranslationSettingsHtml(): string {
        // 从配置中获取当前设置
        const config = vscode.workspace.getConfiguration('goAssist');
        const translateConfig = vscode.workspace.getConfiguration('goAssist.translation');
        const currentEngine: string = config.get('translationEngine', 'built_in'); // 默认使用内置引擎
        const currentApiKey = config.get('apiKey', '');
        const enableBilingualComments: boolean = translateConfig.get('enableBilingualComments', true);
        const autoTranslateOnActiveEditor: boolean = translateConfig.get('autoTranslateOnActiveEditor', false);

        // 翻译引擎选项及获取密钥链接
        const engineOptions = [
            { value: 'microsoft', label: 'Microsoft Translator', link: 'https://portal.azure.com/' },
            { value: 'google', label: 'Google Translate', link: 'https://console.cloud.google.com/' },
            { value: 'aliyun', label: 'Aliyun Translate', link: 'https://www.aliyun.com/product/ai/alimt' },
            { value: 'baidu', label: 'Baidu Translate', link: 'https://fanyi-api.baidu.com/' },
            { value: 'built_in', label: 'Built-in Translator', link: '' },
            { value: 'auto', label: 'Auto Select', link: '' }
        ];

        // 生成引擎选项 HTML
        const engineOptionsHtml = engineOptions.map(option => `
            <option value="${option.value}" ${currentEngine === option.value ? 'selected' : ''}>
                ${option.label}
            </option>
        `).join('');

        // 获取密钥链接 HTML
        const getKeyLinkHtml = engineOptions
            .filter(option => option.link)
            .map(option => `
                <div id="${option.value}-link" style="display: none; margin-top: 10px;">
                    <a href="${option.link}" target="_blank">获取 ${option.label} 的 API 密钥 (Get API Key for ${option.label})</a>
                </div>
            `).join('');

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>翻译设置</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    label { display: block; margin-top: 10px; }
                    input, select { width: 100%; padding: 8px; margin-top: 5px; }
                    button { margin-top: 20px; padding: 10px 15px; background-color: #007acc; color: white; border: none; cursor: pointer; }
                    button:hover { background-color: #005a9e; }
                    a { color: #007acc; text-decoration: none; }
                    a:hover { text-decoration: underline; }
                    .checkbox-container { display: flex; align-items: center; margin-top: 15px; }
                    .checkbox-container input[type="checkbox"] { width: auto; margin-right: 10px; }
                    .info-text { color: #666; font-size: 12px; margin-top: 5px; }
                </style>
            </head>
            <body>
                <h1>翻译设置</h1>
                <label for="engine">翻译引擎 (Translation Engine):</label>
                <select id="engine">
                    ${engineOptionsHtml}
                </select>
                ${getKeyLinkHtml}
                <label for="apiKey">API 密钥 (API Key):</label>
                <input type="text" id="apiKey" value="${currentApiKey}" />
                
                <div class="checkbox-container">
                    <input type="checkbox" id="enableBilingualComments" ${enableBilingualComments ? 'checked' : ''} disabled>
                    <label for="enableBilingualComments">使用内联装饰器显示翻译 (Display translation with inline decorator)</label>
                </div>
                
                <div class="checkbox-container">
                    <input type="checkbox" id="autoTranslateOnActiveEditor" ${autoTranslateOnActiveEditor ? 'checked' : ''}>
                    <label for="autoTranslateOnActiveEditor">激活编辑器时自动翻译 (Auto translate when editor is activated)</label>
                </div>
                
                <p class="info-text">翻译结果将在选中文本后方以装饰形式显示，不会修改原文件内容。</p>
                <p class="info-text">Translation results will be displayed as decorations after the selected text without modifying file content.</p>
                
                <button id="saveButton">保存设置 (Save Settings)</button>
                <script>
                    const vscode = acquireVsCodeApi();
                    const engineSelect = document.getElementById('engine');
                    const saveButton = document.getElementById('saveButton');
                    const enableBilingualComments = document.getElementById('enableBilingualComments');
                    const autoTranslateOnActiveEditor = document.getElementById('autoTranslateOnActiveEditor');

                    // 显示对应的获取密钥链接
                    engineSelect.addEventListener('change', function() {
                        const selectedEngine = engineSelect.value;
                        document.querySelectorAll('[id$="-link"]').forEach(function(link) {
                            link.style.display = 'none';
                        });
                        
                        const selectedLink = document.getElementById(selectedEngine + '-link');
                        if (selectedLink) {
                            selectedLink.style.display = 'block';
                        }
                    });

                    // 初始化显示当前引擎的链接
                    engineSelect.dispatchEvent(new Event('change'));

                    saveButton.addEventListener('click', function() {
                        const engine = engineSelect.value;
                        const apiKey = document.getElementById('apiKey').value;
                        // 总是为true，因为只使用装饰器方式
                        // Always true as we only use decorator method
                        const bilingual = true;
                        const autoTranslate = autoTranslateOnActiveEditor.checked;
                        
                        vscode.postMessage({
                            command: 'saveSettings',
                            data: { 
                                engine, 
                                apiKey,
                                enableBilingualComments: bilingual,
                                autoTranslateOnActiveEditor: autoTranslate
                            }
                        });
                    });
                </script>
            </body>
            </html>
        `;
    }
}