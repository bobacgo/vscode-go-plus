import { TranslationEngine, TranslationOptions, TranslationResult } from './engine';
import { Logger } from '../../../pkg/logger';
import { httpClient } from '../../../pkg/http';
import * as crypto from 'crypto';

/**
 * Tencent Cloud Translator engine implementation using direct API calls.
 * 使用直接API调用实现的腾讯云翻译引擎。
 */
export class TencentTranslationEngine implements TranslationEngine {
    readonly id = 'tencent';
    readonly name = 'Tencent Translator';
    readonly icon = 'Ⓣ'

    private readonly logger = Logger.withContext('TencentTranslationEngine');
    private readonly client: any;

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
        // 无需SDK初始化代码，直接使用API调用
        // No SDK initialization code needed, using direct API calls instead
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
            // 如果没有API密钥，返回错误结果
            // If no API key provided, return error result
            if (!this.secretId || !this.secretKey) {
                this.logger.warn('腾讯云API密钥未配置，无法执行翻译 / Tencent Cloud API credentials not configured');
                return {
                    text: 'Tencent Cloud API credentials required',
                    from: options.from,
                    to: options.to
                };
            }

            // 转换语言代码以匹配腾讯云API
            // Convert language codes to match Tencent Cloud API
            const sourceLanguage = this.convertToTencentLanguageCode(options.from);
            const targetLanguage = this.convertToTencentLanguageCode(options.to);

            // 构建API请求
            // Build API request
            const endpoint = 'tmt.tencentcloudapi.com';
            const service = 'tmt';
            const region = 'ap-guangzhou';
            const action = 'TextTranslate';
            const version = '2018-03-21';
            const timestamp = Math.round(Date.now() / 1000);
            // 请求体参数
            // Request body parameters
            const requestPayload = {
                SourceText: text,
                Source: sourceLanguage || 'auto',
                Target: targetLanguage,
                ProjectId: 0
            };

            // 准备签名所需数据
            // Prepare data for signature
            const requestMethod = 'POST';
            const canonicalUri = '/';
            const canonicalQueryString = '';
            const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${endpoint}\n`;
            const signedHeaders = 'content-type;host';

            // JSON格式化请求体
            // Format request body as JSON
            const requestPayloadStr = JSON.stringify(requestPayload);

            // 生成规范请求字符串
            // Generate canonical request string
            const hashedRequestPayload = crypto.createHash('sha256')
                .update(requestPayloadStr)
                .digest('hex');
            const canonicalRequest = [
                requestMethod,
                canonicalUri,
                canonicalQueryString,
                canonicalHeaders,
                signedHeaders,
                hashedRequestPayload
            ].join('\n');
            // 生成签名字符串
            // Generate string to sign
            const algorithm = 'TC3-HMAC-SHA256';
            const hashedCanonicalRequest = crypto.createHash('sha256')
                .update(canonicalRequest)
                .digest('hex');
            const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
            const credentialScope = `${date}/${service}/tc3_request`;
            const stringToSign = [
                algorithm,
                timestamp,
                credentialScope,
                hashedCanonicalRequest
            ].join('\n');
            // 计算签名
            // Calculate signature
            const secretDate = this.sign(date, `TC3${this.secretKey}`);
            const secretService = this.sign(service, secretDate);
            const secretSigning = this.sign('tc3_request', secretService);
            const signature = crypto.createHmac('sha256', secretSigning)
                .update(stringToSign)
                .digest('hex');
            // 构建授权头
            // Build authorization header
            const authorization = [
                `${algorithm} Credential=${this.secretId}/${credentialScope}`,
                `SignedHeaders=${signedHeaders}`,
                `Signature=${signature}`
            ].join(', ');
            // 使用自定义httpClient发送请求
            // Send request using custom httpClient
            const response = await httpClient.Post<any>(
                `https://${endpoint}`,
                requestPayload,
                {
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        'Host': endpoint,
                        'Authorization': authorization,
                        'X-TC-Action': action,
                        'X-TC-Timestamp': timestamp.toString(),
                        'X-TC-Version': version,
                        'X-TC-Region': region
                    }
                }
            );

            // 解析响应
            // Parse response
            const data = response.Response;

            // 处理错误
            // Handle error
            if (data.Error) {
                throw new Error(`${data.Error.Code}: ${data.Error.Message}`);
            }
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
                text: 'Tencent Cloud translation returned no result',
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
     * 生成HMAC-SHA256签名
     * Generate HMAC-SHA256 signature
     */
    private sign(str: string, key: string | Buffer): Buffer {
        return crypto.createHmac('sha256', key).update(str).digest();
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
