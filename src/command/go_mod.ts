import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { GoLibraryTreeData } from '../core/library/tree';
import { ModItem } from '../core/library/item';
import { Logger } from '../pkg/logger';
import { findInFiles } from '../pkg/go';

// 记录器
const logger = Logger.withContext('GoModCommands');

/**
 * 注册Go模块相关的命令
 * @param context 扩展上下文
 * @param modTreeProvider 模块树提供者
 */
export function registerGoModCommands(context: vscode.ExtensionContext, modTreeProvider: GoLibraryTreeData): void {

  // 在Go Library中显示活动文件
  context.subscriptions.push(
    vscode.commands.registerCommand('golibrary.showActiveFileInExplorer', async (resource: vscode.Uri) => {
      // 确保modTreeProvider存在
      if (!modTreeProvider) {
        logger.error('ModTreeProvider未初始化');
        return;
      }
      
      // 如果资源未提供，尝试从活动编辑器获取
      if (!resource && vscode.window.activeTextEditor && vscode.window.activeTextEditor.document) {
        resource = vscode.window.activeTextEditor.document.uri;
      }
      
      // 确保我们有资源并且是Go文件
      if (resource) {
        const filePath = resource.fsPath;
        if (filePath.endsWith('.go') || filePath.endsWith('go.mod')) {
          try {
            // 首先确保Explorer视图激活
            await vscode.commands.executeCommand('workbench.view.explorer');
            // 聚焦到Library视图
            await vscode.commands.executeCommand('golibrary.focus');
            // 打开文件
            vscode.commands.executeCommand('vscode.open', resource);
          } catch (error) {
            logger.error('在Library视图中显示文件时出错:', error);
          }
        }
      }
    })
  );

  logger.info('Go模块命令注册完成');
}

/**
 * 注册 Go Library 相关命令
 * @param context 扩展上下文
 * @param modTree 模块树实例
 */
export function registerGoModCommandsOld(context: vscode.ExtensionContext, modTree: any): void {
  // 创建 webview 面板
  context.subscriptions.push(
    vscode.commands.registerCommand('golibrary.market', () => {
      const panel = vscode.window.createWebviewPanel('GoPM', 'Go Packages Market', vscode.ViewColumn.One, {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'dist'))],
      });
      const onDiskPath = vscode.Uri.file(path.join(context.extensionPath, 'dist', 'assets/index.css'));
      const onDiskPath1 = vscode.Uri.file(path.join(context.extensionPath, 'dist', 'assets/index.js'));
      const cssPath = panel.webview.asWebviewUri(onDiskPath);
      const jsPath = panel.webview.asWebviewUri(onDiskPath1);

      panel.webview.html = getWebviewContent(jsPath, cssPath);

      setTimeout(() => {
        panel.webview.postMessage({ command: 'refactor' });
      }, 10000);

      panel.webview.onDidReceiveMessage(
        (message) => {
          switch (message.command) {
            case 0:
              vscode.window.showErrorMessage(message.payload);
              return;
          }
        },
        undefined,
        context.subscriptions
      );
    })
  );

  // 返回到编辑区
  context.subscriptions.push(
    vscode.commands.registerCommand('golibrary.blur', () => {
      vscode.commands.executeCommand('workbench.view.explorer');
    })
  );

  // 折叠所有
  context.subscriptions.push(
    vscode.commands.registerCommand('golibrary.collapse', () => {
      modTree.collapse();
    })
  );

  // 在文件中查找
  context.subscriptions.push(
    vscode.commands.registerCommand('golibrary.findInFiles', (resource: ModItem) => {
      if (resource && resource.resourceUri) {
        findInFiles(resource.resourceUri);
      }
    })
  );
}

/**
 * 获取 webview 内容
 * @param js JS 资源路径
 * @param css CSS 资源路径
 * @returns HTML 内容
 */
function getWebviewContent(js: vscode.Uri, css: vscode.Uri): string {
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <link
        rel="icon"
        type="image"
        href="https://pkg.go.dev/static/shared/icon/favicon.ico"
      />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Go Packages</title>
      <script type="module" crossorigin src="${js}"></script>
      <link rel="stylesheet" href="${css}">
    </head>
    <body>
      <div id="app"></div>
    </body>
  </html>
  `;
} 