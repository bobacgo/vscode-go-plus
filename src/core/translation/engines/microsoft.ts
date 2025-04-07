import { TranslationEngine, TranslationOptions, TranslationResult } from '../engine';
import { httpClient } from '../../../pkg/http';
import { Logger } from '../../../pkg/logger';

/**
 * Microsoft translation engine implementation.
 * 微软翻译引擎实现。
 */
export class MicrosoftTranslationEngine implements TranslationEngine {
    readonly id = 'microsoft';
    readonly name = 'Microsoft Translator';

    private readonly apiUrl = 'https://api.cognitive.microsofttranslator.com/translate';
    private readonly region = 'global';
    private readonly logger = Logger.withContext('MicrosoftTranslationEngine');
    private readonly supportedLanguages: string[] = [
        'en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'pt', 'it', 'ar', 'hi'
    ];
    
    constructor(private readonly apiKey?: string) {
        this.logger.debug('微软翻译引擎已初始化 / Microsoft translation engine initialized');
    }

    /**
     * Checks if the engine supports the specified language pair.
     * 检查引擎是否支持指定的语言对。
     */
    supportsLanguagePair(from: string, to: string): boolean {
        return this.supportedLanguages.includes(from) && this.supportedLanguages.includes(to);
    }

    /**
     * Gets the list of supported languages by this engine.
     * 获取此引擎支持的语言列表。
     */
    async getSupportedLanguages(): Promise<string[]> {
        return Promise.resolve(this.supportedLanguages);
    }

    /**
     * Translates the given text according to the specified options.
     * 根据指定的选项翻译给定的文本。
     */
    async translate(text: string, options: TranslationOptions): Promise<TranslationResult> {
        try {
            // 如果没有API密钥，返回错误结果
            // If no API key is provided, return error result
            if (!this.apiKey) {
                this.logger.warn('未提供API密钥，无法执行翻译 / No API key provided, cannot perform translation');
                return {
                    text: `Microsoft API key required`,
                    from: options.from,
                    to: options.to
                };
            }

            // 构建请求URL，包含查询参数
            // Build request URL with query parameters
            const queryParams = {
                'api-version': '3.0',
                'from': options.from || 'en',
                'to': options.to
            };
            const requestUrl = `${this.apiUrl}?${httpClient.ObjectToQueryString(queryParams)}`;

            // 准备请求头和请求体
            // Prepare request headers and body
            const headers = {
                'Ocp-Apim-Subscription-Key': this.apiKey,
                'Ocp-Apim-Subscription-Region': this.region,
                'Content-type': 'application/json',
            };
            
            // 发送POST请求
            // Send POST request
            const response = await httpClient.Post<Array<{ translations: { text: string, to: string }[] }>>(
                requestUrl,
                [{ text }],
                { headers }
            );

            // 提取翻译结果
            // Extract translation result
            const result = response[0]?.translations[0]?.text;
            return {
                text: result || text,
                from: options.from,
                to: options.to,
                raw: response
            };
        } catch (error) {
            this.logger.error('翻译请求失败 / Translation request failed:', error);
            return {
                text: `${text} (翻译失败 / Translation failed)`,
                from: options.from,
                to: options.to
            };
        }
    }
}
