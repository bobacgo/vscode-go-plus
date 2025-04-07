import { performance } from 'perf_hooks';

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
   * 默认时间格式
   * Default time format
   */
  private static readonly DEFAULT_TIME_FORMAT = 'yyyy-MM-dd HH:mm:ss.SSS';

  /**
   * 当前时间格式
   * Current time format
   */
  private static timeFormat: string = Logger.DEFAULT_TIME_FORMAT;

  /**
   * 是否启用时间戳
   * Whether to enable timestamp
   */
  private static enableTimestamp = true;

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
   * 设置时间格式
   * Set time format
   * @param format 时间格式字符串，如："yyyy-MM-dd HH:mm:ss.SSS"
   */
  public static setTimeFormat(format: string): void {
      this.timeFormat = format;
  }

  /**
   * 获取当前时间格式
   * Get current time format
   * @returns 当前时间格式
   */
  public static getTimeFormat(): string {
      return this.timeFormat;
  }

  /**
   * 启用或禁用时间戳
   * Enable or disable timestamp
   * @param enable 是否启用
   */
  public static enableTimeStamp(enable: boolean): void {
      this.enableTimestamp = enable;
  }

  /**
   * 格式化当前时间
   * Format current time
   * @returns 格式化后的时间字符串
   */
  private static formatTime(): string {
      if (!this.enableTimestamp) {
          return '';
      }

      const now = new Date();
      let formatted = this.timeFormat;

      // 年份替换 (year)
      formatted = formatted.replace(/yyyy/g, now.getFullYear().toString());
      formatted = formatted.replace(/yy/g, now.getFullYear().toString().slice(-2));

      // 月份替换 (month)
      const month = now.getMonth() + 1;
      formatted = formatted.replace(/MM/g, month < 10 ? `0${month}` : month.toString());
      formatted = formatted.replace(/M/g, month.toString());

      // 日期替换 (day)
      const day = now.getDate();
      formatted = formatted.replace(/dd/g, day < 10 ? `0${day}` : day.toString());
      formatted = formatted.replace(/d/g, day.toString());

      // 小时替换 (hour)
      const hours = now.getHours();
      formatted = formatted.replace(/HH/g, hours < 10 ? `0${hours}` : hours.toString());
      formatted = formatted.replace(/H/g, hours.toString());

      // 分钟替换 (minute)
      const minutes = now.getMinutes();
      formatted = formatted.replace(/mm/g, minutes < 10 ? `0${minutes}` : minutes.toString());
      formatted = formatted.replace(/m/g, minutes.toString());

      // 秒替换 (second)
      const seconds = now.getSeconds();
      formatted = formatted.replace(/ss/g, seconds < 10 ? `0${seconds}` : seconds.toString());
      formatted = formatted.replace(/s/g, seconds.toString());

      // 毫秒替换 (millisecond)
      const milliseconds = now.getMilliseconds();
      formatted = formatted.replace(/SSS/g, milliseconds.toString().padStart(3, '0'));

      return formatted;
  }

  /**
   * 构建日志前缀
   * Build log prefix
   * @param level 日志级别标识
   * @returns 格式化的日志前缀
   */
  private static buildLogPrefix(level: string): string {
      const timestamp = this.enableTimestamp ? `${this.formatTime()} ` : '';
      return `${timestamp}[${level}]`;
  }

  /**
   * 记录调试级别日志
   * @param message 日志消息
   * @param data 附加数据
   */
  public static debug(message: string, ...data: any[]): void {
      if (this.currentLevel <= LogLevel.DEBUG) {
          console.debug(`${this.buildLogPrefix('DEBUG')} ${message}`, ...data);
      }
  }

  /**
   * 记录信息级别日志
   * @param message 日志消息
   * @param data 附加数据
   */
  public static info(message: string, ...data: any[]): void {
      if (this.currentLevel <= LogLevel.INFO) {
          console.info(`${this.buildLogPrefix('INFO')} ${message}`, ...data);
      }
  }

  /**
   * 记录警告级别日志
   * @param message 日志消息
   * @param data 附加数据
   */
  public static warn(message: string, ...data: any[]): void {
      if (this.currentLevel <= LogLevel.WARN) {
          console.warn(`${this.buildLogPrefix('WARN')} ${message}`, ...data);
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
              console.error(`${this.buildLogPrefix('ERROR')} ${message}:`, error, ...data);
          } else {
              console.error(`${this.buildLogPrefix('ERROR')} ${message}`, ...data);
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
