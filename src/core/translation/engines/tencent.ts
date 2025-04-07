import { TranslationEngine, TranslationOptions, TranslationResult } from './engine';
import { Logger } from '../../../pkg/logger';
import { Client } from 'tencentcloud-sdk-nodejs-tmt/tencentcloud/services/tmt/v20180321/tmt_client';

/**
 * Tencent Cloud Translator engine implementation using official SDK.
 * 使用官方 SDK 实现的腾讯云翻译引擎。
 */
export class TencentTranslationEngine implements TranslationEngine {
    readonly id = 'tencent';
    readonly name = 'Tencent Translator';
    readonly icon = 'T'

    private readonly logger = Logger.withContext('TencentTranslationEngine');
    private readonly client: Client;
    
    // 腾讯翻译支持的语言列表
    // List of languages supported by Tencent Translator
    private readonly supportedLanguages: string[] = [
        'zh', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'es', 'it', 'de', 
        'tr', 'ru', 'pt', 'vi', 'id', 'th', 'ms', 'ar', 'hi'
    ];
    
    constructor(
        private readonly secretId?: string,
        private readonly secretKey?: string
    ) {
        this.logger.debug('腾讯翻译引擎已初始化 / Tencent translation engine initialized');
        
        // 初始化 SDK 客户端
        // Initialize SDK client
        if (this.secretId && this.secretKey) {
            try {              
                // 实例化客户端配置对象
                // Instantiate client configuration object
                const clientConfig = {
                    credential: {
                        secretId: this.secretId,
                        secretKey: this.secretKey,
                    },
                    region: "ap-guangzhou",
                    profile: {
                        httpProfile: {
                            endpoint: "tmt.tencentcloudapi.com",
                        },
                    },
                };
                
                // 实例化 TMT 客户端
                // Instantiate TMT client
                this.client = new Client(clientConfig);
                this.logger.info('腾讯翻译 SDK 客户端初始化成功 / Tencent translation SDK client initialized successfully');
            } catch (error) {
                this.logger.error('腾讯翻译 SDK 客户端初始化失败 / Tencent translation SDK client initialization failed:', error);
                this.client = null;
            }
        } else {
            this.client = null;
        }
    }

    /**
     * 检查引擎是否支持指定的语言对
     * Checks if the engine supports the specified language pair
     */
    supportsLanguagePair(from: string, to: string): boolean {
        return this.supportedLanguages.includes(this.convertToTencentLanguageCode(from)) && 
               this.supportedLanguages.includes(this.convertToTencentLanguageCode(to));
    }

    /**
     * 获取此引擎支持的语言列表
     * Gets the list of supported languages by this engine
     */
    async getSupportedLanguages(): Promise<string[]> {
        return Promise.resolve(this.supportedLanguages);
    }

    /**
     * 根据指定的选项翻译给定的文本
     * Translates the given text according to the specified options
     */
    async translate(text: string, options: TranslationOptions): Promise<TranslationResult> {
        try {
            // 如果没有API密钥或客户端初始化失败，返回错误结果
            // If no API key provided or client initialization failed, return error result
            if (!this.client) {
                this.logger.warn('腾讯云翻译客户端未初始化，无法执行翻译 / Tencent Cloud translation client not initialized');
                return {
                    text: `Tencent Cloud API credentials required`,
                    from: options.from,
                    to: options.to
                };
            }

            // 转换语言代码以匹配腾讯云API
            // Convert language codes to match Tencent Cloud API
            const targetLanguage = this.convertToTencentLanguageCode(options.to);

            // 构建请求参数
            // Build request parameters
            const params = {
                SourceText: text,
                Source: "auto",
                Target: targetLanguage,
                ProjectId: 0  // 默认项目ID / Default project ID
            };

            // 使用 SDK 发送请求
            // Send request using SDK
            const data = await this.client.TextTranslate(params);
            
            // 提取翻译结果
            // Extract translation result
            if (data && data.TargetText) {
                return {
                    text: data.TargetText,
                    from: options.from,
                    to: options.to,
                    raw: data
                };
            }
            
            // 如果没有翻译结果，返回原文
            // If no translation result, return original text
            this.logger.warn('腾讯云翻译API未返回预期结果 / Tencent Cloud Translation API did not return expected result:', data);
            return {
                text: `Tencent Cloud translation returned no result`,
                from: options.from,
                to: options.to
            };
        } catch (error) {
            this.logger.error('腾讯云翻译请求失败 / Tencent Cloud translation request failed:', error);
            return {
                text: `${(error as Error).message} / Tencent Cloud translation failed`,
                from: options.from,
                to: options.to
            };
        }
    }

    /**
     * 将标准语言代码转换为腾讯云API使用的语言代码
     * Convert standard language codes to Tencent Cloud API language codes
     */
    private convertToTencentLanguageCode(langCode?: string): string {
        if (!langCode) return 'auto';
        
        // 腾讯云翻译API的语言代码映射
        // Tencent Cloud Translation API language code mapping
        const tencentLangMap: Record<string, string> = {
            'zh-CN': 'zh',
            'zh-TW': 'zh-TW',
            'en': 'en',
            'ja': 'ja',
            'ko': 'ko',
            'fr': 'fr',
            'es': 'es',
            'it': 'it',
            'de': 'de',
            'tr': 'tr',
            'ru': 'ru',
            'pt': 'pt',
            'vi': 'vi',
            'id': 'id',
            'th': 'th',
            'ms': 'ms',
            'ar': 'ar',
            'hi': 'hi',
            'auto': 'auto'
        };
        
        return tencentLangMap[langCode] || langCode;
    }
}
