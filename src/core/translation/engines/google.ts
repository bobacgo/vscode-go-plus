import { TranslationEngine, TranslationOptions, TranslationResult } from './engine';
import { httpClient } from '../../../pkg/http';
import { Logger } from '../../../pkg/logger';

/**
 * Google translation engine implementation.
 * 谷歌翻译引擎实现。
 */
export class GoogleTranslationEngine implements TranslationEngine {
    readonly id = 'google';
    readonly name = 'Google Translator';

    private readonly logger = Logger.withContext('GoogleTranslationEngine');
    private readonly supportedLanguages: string[] = [
        'en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'pt', 'it', 'ar', 'hi'
    ];
    
    constructor(private readonly apiKey?: string) {
        this.logger.debug('谷歌翻译引擎已初始化 / Google translation engine initialized');
    }

    /**
     * Checks if the engine supports the specified language pair.
     * 检查引擎是否支持指定的语言对。
     */
    supportsLanguagePair(from: string, to: string): boolean {
        return this.supportedLanguages.includes(this.convertToGoogleLanguageCode(from)) && 
               this.supportedLanguages.includes(this.convertToGoogleLanguageCode(to));
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
                this.logger.warn('未提供谷歌API密钥，无法执行翻译 / No Google API key provided, cannot perform translation');
                return {
                    text: `Google API key required`,
                    from: options.from,
                    to: options.to
                };
            }

            // 转换语言代码以匹配谷歌API
            const googleSourceLang = this.convertToGoogleLanguageCode(options.from || 'en');
            const googleTargetLang = this.convertToGoogleLanguageCode(options.to);

            // 构建请求URL和数据
            // Build request URL and data
            const requestUrl = `https://translation.googleapis.com/language/translate/v2?key=${this.apiKey}`;
            const requestData = {
                q: text,
                source: googleSourceLang,
                target: googleTargetLang,
                format: 'text'
            };
            
            // 发送POST请求
            // Send POST request
            const response = await httpClient.Post<{ data: { translations: { translatedText: string }[] } }>(
                requestUrl,
                requestData
            );

            // 提取翻译结果
            // Extract translation result
            if (response?.data?.translations?.length > 0) {
                return {
                    text: response.data.translations[0].translatedText,
                    from: options.from,
                    to: options.to,
                    raw: response
                };
            }
            return {
                text,
                from: options.from,
                to: options.to
            };
        } catch (error) {
            this.logger.error('谷歌翻译请求失败 / Google translation request failed:', error);
            return {
                text: `${text} (谷歌翻译失败 / Google translation failed)`,
                from: options.from,
                to: options.to
            };
        }
    }

    /**
     * 将标准语言代码转换为谷歌API使用的语言代码
     * Convert standard language codes to Google API language codes
     */
    private convertToGoogleLanguageCode(langCode?: string): string {
        if (!langCode) return 'en';
        
        // 谷歌翻译API的语言代码映射
        const googleLangMap: Record<string, string> = {
            'zh-CN': 'zh',
            'zh-TW': 'zh-TW',
            'en': 'en',
            'ja': 'ja',
            'ko': 'ko',
            'fr': 'fr',
            'de': 'de',
            'es': 'es',
            'ru': 'ru'
        };
        
        return googleLangMap[langCode] || langCode;
    }
}
