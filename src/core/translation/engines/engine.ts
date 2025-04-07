/**
 * TranslationResult represents the result of a translation operation.
 * TranslationResult 表示翻译操作的结果。
 */
export interface TranslationResult {
    text: string;         // Translated text / 翻译后的文本
    from?: string;        // Source language (optional) / 源语言（可选）
    to?: string;          // Target language (optional) / 目标语言（可选）
    raw?: any;            // Raw response data from the translation service / 翻译服务的原始响应数据
}

/**
 * TranslationOptions defines the configuration options for a translation request.
 * TranslationOptions 定义翻译请求的配置选项。
 */
export interface TranslationOptions {
    from?: string;        // Source language (optional) / 源语言（可选）
    to: string;           // Target language / 目标语言
    timeout?: number;     // Request timeout in milliseconds / 请求超时时间（毫秒）
    cache?: boolean;      // Whether to use cache / 是否使用缓存
}

/**
 * TranslationEngine defines the interface for all translation service implementations.
 * TranslationEngine 定义所有翻译服务实现的接口。
 */
export interface TranslationEngine {
    /**
     * The unique identifier of the translation engine.
     * 翻译引擎的唯一标识符。
     */
    readonly id: string;

    /**
     * The display name of the translation engine.
     * 翻译引擎的显示名称。
     */
    readonly name: string;

    /**
     * The icon URL or path of the translation engine.
     */
    readonly icon: string; // Icon URL or path / 图标 URL 或路径

    /**
     * Translates the given text according to the specified options.
     * 根据指定的选项翻译给定的文本。
     * 
     * @param text - The text to translate / 要翻译的文本
     * @param options - Translation options / 翻译选项
     * @returns A promise that resolves to the translation result / 解析为翻译结果的 Promise
     */
    translate(text: string, options: TranslationOptions): Promise<TranslationResult>;

    /**
     * Checks if the engine supports the specified language pair.
     * 检查引擎是否支持指定的语言对。
     * 
     * @param from - Source language / 源语言
     * @param to - Target language / 目标语言
     * @returns Whether the language pair is supported / 是否支持该语言对
     */
    supportsLanguagePair(from: string, to: string): boolean;

    /**
     * Gets the list of supported languages by this engine.
     * 获取此引擎支持的语言列表。
     * 
     * @returns A promise that resolves to an array of language codes / 解析为语言代码数组的 Promise
     */
    getSupportedLanguages(): Promise<string[]>;
}