import { TranslationEngine, TranslationOptions, TranslationResult } from '../engine';
import { Logger } from '../../../pkg/logger';
// 导入阿里云翻译 SDK
// Import Aliyun translation SDK
import Alimt20181012, * as $Alimt20181012 from '@alicloud/alimt20181012';
import * as OpenApi from '@alicloud/openapi-client';

/**
 * Aliyun (Alibaba Cloud) translation engine implementation.
 * 阿里云翻译引擎实现。
 */
export class AliyunTranslationEngine implements TranslationEngine {
    readonly id = 'aliyun';
    readonly name = 'Aliyun Translator';

    private readonly logger = Logger.withContext('AliyunTranslationEngine');
    private readonly supportedLanguages: string[] = [
        'en', 'zh', 'zh-tw', 'ja', 'ko', 'fr', 'de', 'es', 'ru'
    ];
    
    // 阿里云翻译 SDK 客户端
    // Aliyun translation SDK client
    private aliyunClient: Alimt20181012 | null = null;
    
    constructor(
        private readonly accessKeyId?: string,
        private readonly accessKeySecret?: string
    ) {
        this.logger.debug('阿里云翻译引擎已初始化 / Aliyun translation engine initialized');
        if (this.accessKeyId && this.accessKeySecret) {
            this.initAliyunClient();
        }
    }

    /**
     * 初始化阿里云客户端
     * Initialize Aliyun client
     */
    private initAliyunClient(): void {
        try {
            // 创建配置
            // Create configuration
            const config = new OpenApi.Config({
                // 必填，您的 AccessKey ID
                // Required, your AccessKey ID
                accessKeyId: this.accessKeyId!,
                // 必填，您的 AccessKey Secret
                // Required, your AccessKey Secret
                accessKeySecret: this.accessKeySecret!,
                // Endpoint 请参考 https://api.aliyun.com/product/alimt
                // Endpoint, please refer to https://api.aliyun.com/product/alimt
                endpoint: 'mt.cn-hangzhou.aliyuncs.com'
            });

            // 创建客户端
            // Create client
            this.aliyunClient = new Alimt20181012(config);
            this.logger.info('阿里云翻译客户端初始化成功 / Aliyun translation client initialized successfully');
        } catch (error) {
            this.logger.error('阿里云翻译客户端初始化失败 / Aliyun translation client initialization failed:', error);
            this.aliyunClient = null;
        }
    }

    /**
     * Checks if the engine supports the specified language pair.
     * 检查引擎是否支持指定的语言对。
     */
    supportsLanguagePair(from: string, to: string): boolean {
        return this.supportedLanguages.includes(this.convertToAliyunLanguageCode(from)) && 
               this.supportedLanguages.includes(this.convertToAliyunLanguageCode(to));
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
            // 如果没有提供访问密钥，返回错误结果
            // If no access keys are provided, return error result
            if (!this.accessKeyId || !this.accessKeySecret) {
                this.logger.warn('未提供阿里云API凭据，无法执行翻译 / No Aliyun API credentials provided, cannot perform translation');
                return {
                    text: `${text} (需要配置阿里云API凭据 / Aliyun API credentials required)`,
                    from: options.from,
                    to: options.to
                };
            }

            // 如果客户端未初始化，尝试初始化
            // If client is not initialized, try to initialize it
            if (!this.aliyunClient) {
                this.initAliyunClient();
                if (!this.aliyunClient) {
                    return {
                        text: `${text} (阿里云翻译客户端初始化失败 / Aliyun translation client initialization failed)`,
                        from: options.from,
                        to: options.to
                    };
                }
            }

            // 转换语言代码以匹配阿里云API
            // Convert language codes to match Aliyun API
            const aliyunSourceLang = this.convertToAliyunLanguageCode(options.from || 'en');
            const aliyunTargetLang = this.convertToAliyunLanguageCode(options.to);
            
            // 为大文本分段翻译
            // Chunk translation for large text
            if (text.length > 5000) {
                return this.translateChunked(text, aliyunSourceLang, aliyunTargetLang, options);
            }
            
            // 创建请求
            // Create request
            const request = new $Alimt20181012.TranslateGeneralRequest({
                formatType: 'text',
                sourceLanguage: aliyunSourceLang,
                targetLanguage: aliyunTargetLang,
                sourceText: text,
                scene: 'general'
            });
            
            // 发送请求
            // Send request
            this.logger.debug(`开始翻译，源语言:${aliyunSourceLang}，目标语言:${aliyunTargetLang} / Start translation, source:${aliyunSourceLang}, target:${aliyunTargetLang}`);
            const response = await this.aliyunClient!.translateGeneral(request);
            
            // 处理响应
            // Process response
            if (response && response.body && response.body.data && response.body.data.translated) {
                this.logger.debug('阿里云翻译成功 / Aliyun translation successful');
                return {
                    text: response.body.data.translated,
                    from: options.from,
                    to: options.to,
                    raw: response.body
                };
            }
            
            // 如果没有翻译结果，返回原文
            // If no translation result, return original text
            this.logger.warn('阿里云翻译API未返回预期结果 / Aliyun Translation API did not return expected result');
            return {
                text: `${text} (阿里云翻译未返回结果 / Aliyun translation returned no result)`,
                from: options.from,
                to: options.to
            };
        } catch (error: any) {
            this.logger.error('阿里云翻译请求失败 / Aliyun translation request failed:', error);
            return {
                text: `${text} (阿里云翻译失败: ${error.message || error} / Aliyun translation failed)`,
                from: options.from,
                to: options.to
            };
        }
    }

    /**
     * 分段翻译大文本
     * Translate large text in chunks
     * 
     * @param text 要翻译的文本 / Text to translate
     * @param sourceLang 源语言 / Source language
     * @param targetLang 目标语言 / Target language
     * @param options 翻译选项 / Translation options
     * @returns 翻译结果 / Translation result
     */
    private async translateChunked(text: string, sourceLang: string, targetLang: string, options: TranslationOptions): Promise<TranslationResult> {
        // 分段大小 (每段最大2000个字符)
        // Chunk size (max 2000 characters per chunk)
        const chunkSize = 2000;
        const chunks: string[] = [];
        
        // 按行分段
        // Split by lines
        const lines = text.split('\n');
        let currentChunk = '';
        
        for (const line of lines) {
            // 如果当前行就超过了限制，需要单独切分这一行
            // If current line exceeds the limit, need to split this line separately
            if (line.length > chunkSize) {
                if (currentChunk) {
                    chunks.push(currentChunk);
                    currentChunk = '';
                }
                
                // 将长行按字符切分
                // Split long lines by characters
                let i = 0;
                while (i < line.length) {
                    chunks.push(line.substring(i, i + chunkSize));
                    i += chunkSize;
                }
            } else if (currentChunk.length + line.length + 1 > chunkSize) {
                // 当前块加上这行会超过限制，先保存当前块
                // Current chunk plus this line will exceed limit, save current chunk first
                chunks.push(currentChunk);
                currentChunk = line;
            } else {
                // 将行添加到当前块
                // Add line to current chunk
                currentChunk += (currentChunk ? '\n' : '') + line;
            }
        }
        
        // 添加最后一个块
        // Add the last chunk
        if (currentChunk) {
            chunks.push(currentChunk);
        }
        
        this.logger.info(`大文本被分为 ${chunks.length} 段进行翻译 / Large text is split into ${chunks.length} chunks for translation`);
        
        // 翻译所有块
        // Translate all chunks
        const translatedChunks: string[] = [];
        let hasError = false;
        
        // 使用Promise.all进行并行翻译，但限制并发数量
        // Use Promise.all for parallel translation, but limit concurrency
        const concurrencyLimit = 3; // 最多同时翻译3个块 / At most 3 chunks translating at the same time
        
        for (let i = 0; i < chunks.length; i += concurrencyLimit) {
            const chunkPromises = chunks.slice(i, i + concurrencyLimit).map(async (chunk, index) => {
                try {
                    const request = new $Alimt20181012.TranslateGeneralRequest({
                        formatType: 'text',
                        sourceLanguage: sourceLang,
                        targetLanguage: targetLang,
                        sourceText: chunk,
                        scene: 'general'
                    });
                    
                    const response = await this.aliyunClient!.translateGeneral(request);
                    
                    if (response?.body?.data?.translated) {
                        return {
                            index: i + index,
                            text: response.body.data.translated
                        };
                    }
                    
                    // 翻译失败，返回原文
                    // Translation failed, return original text
                    return {
                        index: i + index,
                        text: chunk
                    };
                } catch (error) {
                    this.logger.error(`块 ${i + index + 1}/${chunks.length} 翻译失败 / Chunk ${i + index + 1}/${chunks.length} translation failed:`, error);
                    hasError = true;
                    return {
                        index: i + index,
                        text: chunk // 出错时使用原文 / Use original text when error occurs
                    };
                }
            });
            
            // 等待这一批次的翻译完成
            // Wait for this batch to complete
            const results = await Promise.all(chunkPromises);
            
            // 将结果按照原始索引排序
            // Sort results by original index
            results.sort((a, b) => a.index - b.index);
            
            // 添加到翻译结果中
            // Add to translation results
            results.forEach(result => {
                translatedChunks[result.index] = result.text;
            });
        }
        
        // 合并所有翻译结果
        // Merge all translation results
        const translatedText = translatedChunks.join('\n');
        
        return {
            text: translatedText,
            from: options.from,
            to: options.to,
            raw: hasError ? { warning: '部分文本翻译失败 / Some text failed to translate' } : undefined
        };
    }

    /**
     * 将标准语言代码转换为阿里云API使用的语言代码
     * Convert standard language codes to Aliyun API language codes
     */
    private convertToAliyunLanguageCode(langCode?: string): string {
        if (!langCode) return 'en';
        
        // 阿里云翻译API的语言代码映射
        const aliyunLangMap: Record<string, string> = {
            'zh-CN': 'zh',
            'zh-TW': 'zh-tw',
            'en': 'en',
            'ja': 'ja',
            'ko': 'ko',
            'fr': 'fr',
            'de': 'de',
            'es': 'es',
            'ru': 'ru'
        };
        
        return aliyunLangMap[langCode] || langCode;
    }
}
