import * as vscode from 'vscode';
import { Logger } from '../../pkg/logger';
import { IssueManager } from './issue';

// 初始化日志实例
const logger = Logger.withContext('WorkspaceNavigator');

/**
 * 工作区导航器类
 * Workspace Navigator Class
 */
export class Home {
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
        
        // 显示图标和项目名称
        statusBarItem.text = `$(home) ${projectName}`;
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
            { label: '$(settings-gear) 设置', description: 'Go Studio 相关配置选项' },
            { label: '$(issue-opened) 报告问题', description: '创建 GitHub issue 报告问题或提出建议' }
        ];
        
        // 创建一个 Map 来存储额外数据
        const actionMap = new Map<string, { action: string }>();
        actionMap.set('$(history) 最近打开的项目', { action: 'recent' });
        actionMap.set('$(settings-gear) 设置', { action: 'settings' });
        actionMap.set('$(issue-opened) 报告问题', { action: 'issue' });
        
        // 显示 QuickPick 菜单
        const quickPick = vscode.window.createQuickPick();
        quickPick.items = options;
        
        // 设置标题 - 不再尝试动态获取快捷键
        // 由于没有可靠的API获取键盘快捷键，使用静态标题
        // Since there's no reliable API to get keyboard shortcuts, use a static title
        quickPick.placeholder = '请选择一个操作';
        quickPick.title = 'Go Studio 工作空间导航';
        quickPick.canSelectMany = false; // 只能选择一个选项
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
                case 'recent':
                    await vscode.commands.executeCommand('workbench.action.openRecent');
                    break;
                
                case 'settings':
                    // 跳转到设置页面
                    await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:gopp.gopp');
                    break;
                    
                case 'issue':
                    // 显示创建 Issue 表单
                    await IssueManager.showFeedbackForm();
                    break;
            }
        });
        
        // 显示菜单
        quickPick.show();
    }
}