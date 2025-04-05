import { performance } from "perf_hooks";

/**
 * 日志级别枚举
 */
export enum LogLevel {
  DEBUG,
  INFO,
  WARN,
  ERROR
}

/**
 * 日志管理器类，提供结构化日志记录功能
 */
export class Logger {
  /**
   * 当前日志级别
   */
  private static currentLevel: LogLevel = LogLevel.DEBUG;

  /**
   * 设置日志级别
   * @param level 日志级别
   */
  public static setLogLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  /**
   * 获取当前日志级别
   * @returns 当前日志级别
   */
  public static getLogLevel(): LogLevel {
    return this.currentLevel;
  }

  /**
   * 记录调试级别日志
   * @param message 日志消息
   * @param data 附加数据
   */
  public static debug(message: string, ...data: any[]): void {
    if (this.currentLevel <= LogLevel.DEBUG) {
      console.log(`[DEBUG] ${message}`, ...data);
    }
  }

  /**
   * 记录信息级别日志
   * @param message 日志消息
   * @param data 附加数据
   */
  public static info(message: string, ...data: any[]): void {
    if (this.currentLevel <= LogLevel.INFO) {
      console.log(`[INFO] ${message}`, ...data);
    }
  }

  /**
   * 记录警告级别日志
   * @param message 日志消息
   * @param data 附加数据
   */
  public static warn(message: string, ...data: any[]): void {
    if (this.currentLevel <= LogLevel.WARN) {
      console.warn(`[WARN] ${message}`, ...data);
    }
  }

  /**
   * 记录错误级别日志
   * @param message 日志消息
   * @param error 错误对象
   * @param data 附加数据
   */
  public static error(message: string, error?: any, ...data: any[]): void {
    if (this.currentLevel <= LogLevel.ERROR) {
      if (error) {
        console.error(`[ERROR] ${message}:`, error, ...data);
      } else {
        console.error(`[ERROR] ${message}`, ...data);
      }
    }
  }

  /**
   * 创建带上下文的日志记录器
   * @param context 上下文名称
   * @returns 带上下文的日志记录方法
   */
  public static withContext(context: string): {
    debug: (message: string, ...data: any[]) => void;
    info: (message: string, ...data: any[]) => void;
    warn: (message: string, ...data: any[]) => void;
    error: (message: string, error?: any, ...data: any[]) => void;
  } {
    return {
      debug: (message: string, ...data: any[]) => {
        this.debug(`[${context}] ${message}`, ...data);
      },
      info: (message: string, ...data: any[]) => {
        this.info(`[${context}] ${message}`, ...data);
      },
      warn: (message: string, ...data: any[]) => {
        this.warn(`[${context}] ${message}`, ...data);
      },
      error: (message: string, error?: any, ...data: any[]) => {
        this.error(`[${context}] ${message}`, error, ...data);
      }
    };
  }

  /**
   * 记录性能日志
   * @param label 性能标签
   * @param action 要执行的操作
   * @returns 操作执行结果
   */
  public static async measurePerformance<T>(label: string, action: () => Promise<T>): Promise<T> {
    const startTime = performance.now();
    try {
      const result = await action();
      const endTime = performance.now();
      this.debug(`性能 [${label}]: ${Math.round(endTime - startTime)}ms`);
      return result;
    } catch (error) {
      const endTime = performance.now();
      this.error(`性能 [${label}] 失败: ${Math.round(endTime - startTime)}ms`, error);
      throw error;
    }
  }
} 