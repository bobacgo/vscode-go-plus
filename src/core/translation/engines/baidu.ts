import { TranslationEngine, TranslationOptions, TranslationResult } from '../engine';
import { httpClient } from '../../../pkg/http';
import { Logger } from '../../../pkg/logger';
import * as crypto from 'crypto';

/**
 * Baidu translation engine implementation.
 * 百度翻译引擎实现。
 */
export class BaiduTranslationEngine implements TranslationEngine {
    readonly id = 'baidu';
    readonly name = 'Baidu Translator';

    private readonly apiUrl = 'https://api.fanyi.baidu.com/api/trans/vip/translate';
    private readonly logger = Logger.withContext('BaiduTranslationEngine');
    private readonly supportedLanguages: string[] = [
        'en', 'zh', 'jp', 'kor', 'fra', 'de', 'spa', 'ru'
    ];
    
    constructor(
        private readonly appId?: string,
        private readonly secretKey?: string
    ) {
        this.logger.debug('百度翻译引擎已初始化 / Baidu translation engine initialized');
    }

    /**
     * Checks if the engine supports the specified language pair.
     * 检查引擎是否支持指定的语言对。
     */
    supportsLanguagePair(from: string, to: string): boolean {
        return this.supportedLanguages.includes(this.convertToBaiduLanguageCode(from)) && 
               this.supportedLanguages.includes(this.convertToBaiduLanguageCode(to));
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
            // 如果没有提供APP ID或密钥，返回错误结果
            // If no APP ID or secret key is provided, return error result
            if (!this.appId || !this.secretKey) {
                this.logger.warn('未提供百度翻译API凭据，无法执行翻译 / No Baidu Translation API credentials provided, cannot perform translation');
                return {
                    text: `${text} (需要配置百度翻译API凭据 / Baidu Translation API credentials required)`,
                    from: options.from,
                    to: options.to
                };
            }
            
            // 转换语言代码以匹配百度API需求
            const baiduLangCode = this.convertToBaiduLanguageCode(options.to);
            const baiduSourceLangCode = this.convertToBaiduLanguageCode(options.from || 'en');
            
            // 生成随机数作为请求的一部分
            const salt = Date.now().toString();
            
            // 计算签名 - 百度API要求: appid+q+salt+密钥 的MD5值
            const sign = crypto.createHash('md5')
                .update(this.appId + text + salt + this.secretKey)
                .digest('hex');
            
            // 构建请求URL，百度使用GET请求
            // Build request URL, Baidu uses GET request
            const queryParams = {
                q: encodeURIComponent(text),
                from: baiduSourceLangCode,
                to: baiduLangCode,
                appid: this.appId,
                salt,
                sign
            };
            
            const requestUrl = `${this.apiUrl}?${httpClient.ObjectToQueryString(queryParams)}`;
            
            // 发送GET请求
            // Send GET request
            const response = await httpClient.Get<{ trans_result: { dst: string }[], from: string, to: string }>(requestUrl);
            
            // 检查响应数据
            if (response?.trans_result?.length > 0) {
                return {
                    text: response.trans_result[0].dst,
                    from: response.from,
                    to: response.to,
                    raw: response
                };
            }
            
            // 如果没有获取到翻译结果，返回原文
            this.logger.warn('百度翻译API未返回预期结果 / Baidu Translation API did not return expected result:', response);
            return {
                text: `${text} (百度翻译未返回结果 / Baidu translation returned no result)`,
                from: options.from,
                to: options.to
            };
        } catch (error) {
            this.logger.error('百度翻译请求失败 / Baidu translation request failed:', error);
            return {
                text: `${text} (百度翻译失败 / Baidu translation failed)`,
                from: options.from,
                to: options.to
            };
        }
    }

    /**
     * 将标准语言代码转换为百度API使用的语言代码
     * Convert standard language codes to Baidu API language codes
     */
    private convertToBaiduLanguageCode(langCode?: string): string {
        if (!langCode) return 'en';
        
        // 百度翻译API的语言代码映射
        const baiduLangMap: Record<string, string> = {
            'zh-CN': 'zh',
            'zh-TW': 'cht',
            'en': 'en',
            'ja': 'jp',
            'ko': 'kor',
            'fr': 'fra',
            'de': 'de',
            'es': 'spa',
            'ru': 'ru'
        };
        
        return baiduLangMap[langCode] || langCode;
    }
}
