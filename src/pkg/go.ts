import * as vscode from 'vscode';
import { exec } from 'child_process';



/**
 * 获取Go环境变量设置
 * @returns GOROOT变量前缀
 */
export function cdGO(): string {
  const workSpaceConfig = vscode.workspace.getConfiguration('go');
  const slash = process.platform === 'win32' ? '\\' : '/';
  return workSpaceConfig.get('goroot') !== null ? `cd ${workSpaceConfig.get('goroot')}${slash}bin &&` : '';
}

/**
 * 检查Go环境
 */
export function checkGo() {
  let command = cdGO() + 'go version';
  exec(command, (error, stdout, stderr) => {
    if (error !== null) {
      errorRestart('The "go" command is not available. Run "go version" on your terminal to check.');
    }
  });
}

/**
 * 显示错误重启提示
 * @param msg 错误消息
 */
export function errorRestart(msg: string) {
  vscode.window.showErrorMessage(msg, 'Restart').then((selected) => {
    switch (selected) {
      case 'Restart':
        vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  });
}

/**
 * 在文件中查找
 * @param res 资源URI
 */
export function findInFiles(res: vscode.Uri | undefined): void {
  if (res === undefined) {
    return;
  }
  let p = require('./file').resolvePath(res);
  vscode.commands.executeCommand('workbench.action.findInFiles', {
    query: '',
    isRegex: true,
    triggerSearch: true,
    focusResults: true,
    filesToExclude: '',
    filesToInclude: p,
  });
} 