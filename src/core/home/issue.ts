import * as vscode from 'vscode';
import * as https from 'https';
import { Logger } from '../../pkg/logger';

/*
    将通用的 Issue 管理改为专门的插件功能反馈管理
    增加了反馈类型选择（问题、建议或疑问）
    简化了仓库配置，直接指定插件的仓库信息
    更改了相关函数和变量名称，以反映这是功能反馈而非通用 Issue
    优化了错误处理，特别是对于未设置 GitHub 令牌的情况，提供了直接设置的链接
    改进了反馈模板，更适合插件功能反馈的场景
*/


// 初始化日志实例 
// Initialize logger instance
const logger = Logger.withContext('IssueReporter');

// 插件 GitHub 仓库配置
// Extension GitHub repository configuration
const GITHUB_REPO = {
    issueLabels: ['user-feedback']  // 用户反馈标签 (User feedback labels)
};

// GitHub API 配置
// GitHub API configuration
const GITHUB_API = {
    host: 'api.github.com',
    repoPath: '',  // 将在初始化时设置 / Will be set during initialization
    issuesPath: '/issues',
    searchPath: '/search/issues',
    userAgent: 'VSCode-GoPlus-Extension',
    headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'VSCode-GoPlus-Extension'
    }
};

/**
 * Issue 接口定义
 * Issue interface definition
 */
export interface Issue {
    id: number;
    number: number;
    title: string;
    body: string;
    created_at: string;
    html_url: string;
    state: string;
    labels: { name: string }[];
}

/**
 * Issue 创建请求接口
 * Issue creation request interface
 */
export interface IssueCreateRequest {
    title: string;
    body: string;
    labels?: string[];
}

/**
 * Issue 管理类 - 专门用于处理插件功能反馈
 * Issue Manager Class - Specifically for handling extension feedback
 */
export class IssueManager {
    private static githubToken?: string;
    private static repoFullName: string = 'bobacgo/vscode-go-plus';  // 默认仓库全名 / Default repo full name

    /**
     * 初始化 Issue 管理器
     * Initialize Issue Manager
     * @param context 扩展上下文 Extension context
     */
    public static async initialize(): Promise<void> {
        // 从扩展信息获取仓库信息
        // Get repository info from extension info
        this.loadRepoInfoFromExtension();
    }

    /**
     * 从扩展信息加载仓库信息
     * Load repository information from extension info
     */
    private static loadRepoInfoFromExtension(): void {
        try {
            // 获取当前扩展
            // Get current extension
            const extension = vscode.extensions.getExtension('gopp.gopp');

            if (extension) {
                const packageJson = extension.packageJSON;

                if (packageJson.repository && packageJson.repository.url) {
                    // 从仓库 URL 提取仓库全名
                    // Extract repository full name from repository URL
                    const repoUrl = packageJson.repository.url;
                    const match = repoUrl.match(/github\.com[\/:]([^\/]+\/[^\/\.]+)(\.git)?$/i);

                    if (match && match.length >= 2) {
                        this.repoFullName = match[1];
                        
                        // 更新 API 路径
                        // Update API path
                        GITHUB_API.repoPath = `/repos/${this.repoFullName}`;
                        logger.info(`从扩展信息获取到仓库信息: ${this.repoFullName}`);
                        return;
                    }
                }
            }
        } catch (error: any) {
            logger.error(`加载仓库信息时出错: ${error}`);
        }
    }

    /**
     * 获取 GitHub 令牌
     * Get GitHub token
     * @returns GitHub 令牌 (GitHub token)
     */
    private static async getGitHubToken(): Promise<string> {
        // 如果已经有令牌，直接返回
        // If we already have a token, return it directly
        if (this.githubToken) {
            return this.githubToken;
        }

        try {
            // 尝试从 VS Code 认证 API 获取 GitHub 令牌
            // Try to get GitHub token from VS Code authentication API
            const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
            
            if (session) {
                this.githubToken = session.accessToken;
                logger.info('成功获取 GitHub 令牌');
                return this.githubToken;
            }
        } catch (error: any) {
            logger.error(`获取 GitHub 令牌失败: ${error}`);
        }

        throw new Error('无法获取 GitHub 令牌。请确保您已登录 GitHub 账号。');
    }

    /**
     * 创建新的功能反馈
     * Create new feature feedback
     * @param feedback 反馈信息 (Feedback information)
     * @returns 创建的 Issue (Created issue)
     */
    public static async createFeedback(feedback: IssueCreateRequest): Promise<Issue | null> {
        try {
            // 确保 repoPath 已正确设置
            // Ensure repoPath is correctly set
            if (!GITHUB_API.repoPath || !this.repoFullName) {
                throw new Error('仓库路径未正确配置，请检查扩展的 repository.url 配置。');
            }

            // 获取 GitHub 令牌
            // Get GitHub token
            const token = await this.getGitHubToken();

            // 验证反馈数据
            // Validate feedback data
            this.validateFeedback(feedback);

            const options = {
                hostname: GITHUB_API.host,
                port: 443,
                path: `${GITHUB_API.repoPath}${GITHUB_API.issuesPath}`,
                method: 'POST',
                headers: {
                    ...GITHUB_API.headers,
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json'
                }
            };

            // 确保添加用户反馈标签并去重
            // Ensure user feedback labels are added and deduplicated
            if (!feedback.labels) {
                feedback.labels = [];
            }
            feedback.labels.push(...GITHUB_REPO.issueLabels);
            feedback.labels = [...new Set(feedback.labels)]; // 去重标签 / Deduplicate labels

            const result = await this.makeRequest<Issue>(options, JSON.stringify(feedback));
            logger.info(`成功提交反馈 #${result.number}: ${result.title}`);
            return result;
        } catch (error: any) {
            logger.error(`提交反馈失败: ${error}`);
            throw error;
        }
    }

    /**
     * 验证反馈数据
     * Validate feedback data
     * @param feedback 反馈信息 (Feedback information)
     */
    private static validateFeedback(feedback: IssueCreateRequest): void {
        if (!feedback.title || feedback.title.trim() === '') {
            throw new Error('反馈标题不能为空。');
        }

        if (!feedback.body || feedback.body.trim() === '') {
            throw new Error('反馈内容不能为空。');
        }

        if (feedback.title.length > 256) {
            throw new Error('反馈标题过长，请限制在 256 个字符以内。');
        }
    }

    /**
     * 搜索 Issues
     * Search issues
     * @param query 搜索查询 (Search query)
     * @returns 匹配的 Issues (Matching issues)
     */
    public static async searchIssues(query: string): Promise<Issue[]> {
        try {
            // 构建搜索查询
            // Build search query
            const encodedQuery = encodeURIComponent(`repo:${this.repoFullName} ${query}`);
            
            // 尝试获取令牌，但不强制要求
            // Try to get token, but don't require it
            let token = '';
            try {
                token = await this.getGitHubToken();
            } catch (e) {
                // 搜索可以在没有令牌的情况下进行，只是可能会受到 API 速率限制
                // Searching can be done without a token, just might be rate-limited
                logger.warn('未能获取 GitHub 令牌，搜索可能受限');
            }
            
            const options = {
                hostname: GITHUB_API.host,
                port: 443,
                path: `${GITHUB_API.searchPath}?q=${encodedQuery}`,
                method: 'GET',
                headers: {
                    ...GITHUB_API.headers,
                    'Authorization': token ? `token ${token}` : ''
                }
            };

            const result = await this.makeRequest<{ items: Issue[] }>(options);
            logger.info(`找到 ${result.items.length} 个匹配的 Issues`);
            return result.items;
        } catch (error: any) {
            logger.error(`搜索 Issues 失败: ${error}`);
            return [];
        }
    }

    /**
     * 获取 Issues 列表
     * Get issues list
     * @param state Issues 状态 (Issues state)
     * @param limit 返回数量限制 (Return count limit)
     * @returns Issues 列表 (Issues list)
     */
    public static async getIssues(state: 'open' | 'closed' | 'all' = 'open', limit: number = 10): Promise<Issue[]> {
        try {
            // 尝试获取令牌，但不强制要求
            // Try to get token, but don't require it
            let token = '';
            try {
                token = await this.getGitHubToken();
            } catch (e) {
                logger.warn('未能获取 GitHub 令牌，获取 issues 可能受限');
            }
            
            const options = {
                hostname: GITHUB_API.host,
                port: 443,
                path: `${GITHUB_API.repoPath}${GITHUB_API.issuesPath}?state=${state}&per_page=${limit}`,
                method: 'GET',
                headers: {
                    ...GITHUB_API.headers,
                    'Authorization': token ? `token ${token}` : ''
                }
            };

            const result = await this.makeRequest<Issue[]>(options);
            logger.info(`获取到 ${result.length} 个 Issues`);
            return result;
        } catch (error: any) {
            logger.error(`获取 Issues 失败: ${error}`);
            return [];
        }
    }

    /**
     * 发起 HTTP 请求
     * Make HTTP request
     * @param options 请求选项 (Request options)
     * @param data 请求数据 (Request data)
     * @returns 响应数据 (Response data)
     */
    private static makeRequest<T>(options: https.RequestOptions, data?: string): Promise<T> {
        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const result = JSON.parse(responseData);

                        // 检查 API 错误
                        // Check API errors
                        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                            reject(new Error(`GitHub API 错误 (${res.statusCode}): ${result.message || JSON.stringify(result)}`));
                            return;
                        }

                        resolve(result as T);
                    } catch (error) {
                        reject(new Error(`解析响应失败: ${error}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`请求失败: ${error.message}`));
            });

            if (data) {
                req.write(data);
            }

            req.end();
        });
    }

    /**
     * 显示功能反馈表单
     * Show feature feedback form
     */
    public static async showFeedbackForm(): Promise<void> {
        this.initialize()
        // 获取系统信息作为反馈模板
        // Get system info as feedback template
        const extensionVersion = vscode.extensions.getExtension('gopp.gopp')?.packageJSON.version || 'unknown';
        const vscodeVersion = vscode.version;
        const os = process.platform;

        // 创建反馈类型选择
        // Create feedback type selection
        const feedbackType = await vscode.window.showQuickPick(
            [
                { label: '$(bug) 报告问题', description: '报告插件中的错误或异常', value: 'bug' },
                { label: '$(lightbulb) 功能建议', description: '提出新功能或改进建议', value: 'enhancement' },
                { label: '$(question) 使用疑问', description: '询问如何使用插件功能', value: 'question' }
            ],
            {
                title: '选择反馈类型',
                placeHolder: '您想要提交什么类型的反馈？',
                ignoreFocusOut: true
            }
        );

        if (!feedbackType) {
            return;
        }

        // 创建反馈标题输入框
        // Create feedback title input box
        const feedbackTitle = await vscode.window.showInputBox({
            title: feedbackType.label,
            placeHolder: '请输入反馈标题',
            prompt: '请简要描述您的反馈内容',
            ignoreFocusOut: true
        });

        if (!feedbackTitle) {
            return;
        }

        // 查找是否有类似反馈
        // Search for similar feedback
        const similarIssues = await this.searchIssues(`is:issue repo:${this.repoFullName} ${feedbackTitle}`);

        // 如果找到类似反馈，显示给用户
        // If similar feedback found, show them to user
        if (similarIssues.length > 0) {
            const selection = await vscode.window.showQuickPick(
                [
                    {
                        label: '$(new-file) 继续提交新的反馈',
                        description: '忽略类似反馈并创建新的',
                        id: 'create-new'
                    },
                    ...similarIssues.map(issue => ({
                        label: `#${issue.number}: ${issue.title}`,
                        description: `${new Date(issue.created_at).toLocaleDateString()} - ${issue.state}`,
                        id: issue.html_url
                    }))
                ],
                {
                    title: '发现可能类似的反馈，请选择操作',
                    placeHolder: '查看类似反馈或继续创建新的',
                    ignoreFocusOut: true
                }
            );

            if (!selection) {
                return;
            }

            // 如果用户选择了现有的反馈，打开它
            // If user selected existing feedback, open it
            if (selection.id !== 'create-new') {
                vscode.env.openExternal(vscode.Uri.parse(selection.id));
                return;
            }
        }

        // 根据反馈类型和标题自动生成内容模板
        // Automatically generate content template based on feedback type and title
        const feedbackBody = this.generateFeedbackBody(feedbackType.value, feedbackTitle, {
            extensionVersion,
            vscodeVersion,
            os
        });

        // 显示进度提示
        // Show progress notification
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '正在提交反馈...',
            cancellable: false
        }, async () => {
            try {
                // 创建新反馈
                // Create new feedback
                const labels = [feedbackType.value, 'user-feedback'];

                const newIssue = await this.createFeedback({
                    title: feedbackTitle,
                    body: feedbackBody,
                    labels: labels
                });

                if (newIssue) {
                    // 显示成功消息
                    // Show success message
                    const viewAction = '查看反馈';
                    const result = await vscode.window.showInformationMessage(
                        `感谢您的反馈！已成功提交 #${newIssue.number}`,
                        viewAction
                    );

                    if (result === viewAction) {
                        vscode.env.openExternal(vscode.Uri.parse(newIssue.html_url));
                    }
                }
            } catch (error: any) {
                // 根据错误类型显示不同的错误消息
                // Show different error messages based on error type
                if (error.message && error.message.includes('无法获取 GitHub 令牌')) {
                    const loginAction = '登录 GitHub';
                    const result = await vscode.window.showErrorMessage(
                        `提交反馈失败: 需要 GitHub 授权。请登录您的 GitHub 账号。`,
                        loginAction
                    );
                    
                    if (result === loginAction) {
                        // 触发 VSCode 的 GitHub 登录流程
                        // Trigger VSCode's GitHub login flow
                        vscode.commands.executeCommand('workbench.action.github.signin');
                    }
                } else {
                    vscode.window.showErrorMessage(`提交反馈失败: ${error}`);
                }
            }
        });
    }

    /**
     * 根据反馈类型和标题生成反馈内容
     * Generate feedback content based on feedback type and title
     * @param feedbackType 反馈类型 (Feedback type)
     * @param feedbackTitle 反馈标题 (Feedback title)
     * @param systemInfo 系统信息 (System information)
     * @returns 生成的反馈内容 (Generated feedback content)
     */
    private static generateFeedbackBody(
        feedbackType: string, 
        feedbackTitle: string, 
        systemInfo: {extensionVersion: string; vscodeVersion: string; os: string}
    ): string {
        const templates: {[key: string]: string} = {
            'bug': [
                `# ${feedbackTitle}`,
                '',
                '## 问题描述 (Problem Description)',
                `发现一个问题: ${feedbackTitle}`,
                '',
                '## 系统信息 (System Information)',
                '',
                `- 扩展版本 (Extension Version): ${systemInfo.extensionVersion}`,
                `- VSCode 版本 (VSCode Version): ${systemInfo.vscodeVersion}`,
                `- 操作系统 (Operating System): ${systemInfo.os}`
            ].join('\n'),
            
            'enhancement': [
                `# ${feedbackTitle}`,
                '',
                '## 功能建议 (Feature Suggestion)',
                `建议添加: ${feedbackTitle}`,
                '',
                '## 系统信息 (System Information)',
                '',
                `- 扩展版本 (Extension Version): ${systemInfo.extensionVersion}`,
                `- VSCode 版本 (VSCode Version): ${systemInfo.vscodeVersion}`,
                `- 操作系统 (Operating System): ${systemInfo.os}`
            ].join('\n'),
            
            'question': [
                `# ${feedbackTitle}`,
                '',
                '## 使用问题 (Usage Question)',
                `关于: ${feedbackTitle}`,
                '',
                '## 系统信息 (System Information)',
                '',
                `- 扩展版本 (Extension Version): ${systemInfo.extensionVersion}`,
                `- VSCode 版本 (VSCode Version): ${systemInfo.vscodeVersion}`,
                `- 操作系统 (Operating System): ${systemInfo.os}`
            ].join('\n')
        };
        
        return templates[feedbackType] || templates['bug'];
    }
}
