import { ExtensionContext, workspace } from 'vscode';

/**
 * 配置管理器类，负责管理扩展配置
 */
export class Config_manager {
  /**
   * 扩展上下文
   */
  private _context: ExtensionContext;

  /**
   * 构造函数
   * @param context 扩展上下文
   */
  constructor(context: ExtensionContext) {
    this._context = context;
  }

  /**
   * 获取自动显示配置
   * @returns 是否自动显示
   */
  public get autoReveal(): boolean {
    return workspace.getConfiguration('golibrary').get('autoReveal', true);
  }

  /**
   * 获取聚焦模式配置
   * @returns 是否聚焦模式
   */
  public get focusMode(): boolean {
    return workspace.getConfiguration('golibrary').get('focusMode', true);
  }

  /**
   * 获取调试模式配置
   * @returns 是否启用调试模式
   */
  public get debugMode(): boolean {
    return workspace.getConfiguration('golibrary').get('debugMode', false);
  }

  /**
   * 获取包含提示配置
   * @returns 是否包含提示
   */
  public get includeHints(): boolean {
    return workspace.getConfiguration('golibrary').get('includeHints', true);
  }

  /**
   * 获取排序方式配置
   * @returns 排序方式
   */
  public get sortBy(): 'name' | 'type' | 'none' {
    return workspace.getConfiguration('golibrary').get('sortBy', 'type') as 'name' | 'type' | 'none';
  }

  /**
   * 获取下载超时配置
   * @returns 下载超时时间（秒）
   */
  public get downloadTimeout(): number {
    return workspace.getConfiguration('golibrary').get('downloadTimeout', 30);
  }

  /**
   * 从全局存储获取值
   * @param key 键
   * @param defaultValue 默认值
   * @returns 存储的值
   */
  public getGlobalValue<T>(key: string, defaultValue: T): T {
    return this._context.globalState.get<T>(key, defaultValue);
  }

  /**
   * 将值存储到全局存储
   * @param key 键
   * @param value 值
   */
  public setGlobalValue<T>(key: string, value: T): Thenable<void> {
    return this._context.globalState.update(key, value);
  }

  /**
   * 订阅配置更改事件
   * @param callback 回调函数
   */
  public onConfigChange(callback: () => void): void {
    workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('golibrary')) {
        callback();
      }
    });
  }
} 