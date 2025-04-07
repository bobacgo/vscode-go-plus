import { TranslationEngine, TranslationOptions, TranslationResult } from './engine';
import { httpClient } from '../../../pkg/http';
import { Logger } from '../../../pkg/logger';
import * as crypto from 'crypto';

/**
 * Volcengine (ByteDance) translation engine implementation.
 * 火山引擎翻译实现。
 */
export class VolcengineTranslationEngine implements TranslationEngine {
    readonly id = 'volcengine';
    readonly name = 'Volcengine Translator';

    private readonly apiUrl = 'https://open.volcengineapi.com';
    private readonly serviceName = 'translate';
    private readonly region = 'cn-north-1';
    private readonly logger = Logger.withContext('VolcengineTranslationEngine');
    private readonly supportedLanguages: string[] = [
        'zh', 'zh-Hant', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'pt', 'ar', 'it', 'hi'
    ];
    
    constructor(
        private readonly accessKeyId?: string,
        private readonly secretAccessKey?: string
    ) {
        this.logger.debug('火山引擎翻译已初始化 / Volcengine translation engine initialized');
    }

    /**
     * Checks if the engine supports the specified language pair.
     * 检查引擎是否支持指定的语言对。
     */
    supportsLanguagePair(from: string, to: string): boolean {
        return this.supportedLanguages.includes(this.convertToVolcengineLanguageCode(from)) && 
               this.supportedLanguages.includes(this.convertToVolcengineLanguageCode(to));
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
            if (!this.accessKeyId || !this.secretAccessKey) {
                this.logger.warn('未提供火山引擎API凭据，无法执行翻译 / No Volcengine API credentials provided, cannot perform translation');
                return {
                    text: `Volcengine API credentials required`,
                    from: options.from,
                    to: options.to
                };
            }

            // 转换语言代码以匹配火山引擎API
            const sourceLanguage = this.convertToVolcengineLanguageCode(options.from || 'auto');
            const targetLanguage = this.convertToVolcengineLanguageCode(options.to);

            // 构建请求体
            // Build request body
            const requestBody: {
                TargetLanguage: string;
                TextList: string[];
                SourceLanguage?: string;
            } = {
                TargetLanguage: targetLanguage,
                TextList: [text]
            };
            
            // 如果指定了源语言（不是自动检测），则添加到请求体
            if (sourceLanguage !== 'auto') {
                requestBody.SourceLanguage = sourceLanguage;
            }

            // 当前时间戳（秒）
            const timestamp = Math.floor(Date.now() / 1000);
            // ISO 8601格式的UTC时间
            const isoDate = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
            // 请求路径
            const path = '/';
            // 随机UUID，用于请求ID
            const requestId = this.generateUUID();
            
            // 构建请求头
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'Host': 'open.volcengineapi.com',
                'X-Date': isoDate,
                'X-Content-Sha256': this.sha256(JSON.stringify(requestBody)),
                'X-Request-Id': requestId
            };

            // 准备计算签名所需的信息
            const canonicalRequest = this.createCanonicalRequest(
                'POST',
                path,
                {},  // 无查询参数
                headers,
                JSON.stringify(requestBody)
            );
            
            // 计算签名
            const signature = this.generateSignature(
                this.secretAccessKey!,
                timestamp,
                this.region,
                this.serviceName,
                canonicalRequest
            );

            // 构建授权头
            const authHeader = `HMAC-SHA256 ` +
                `Credential=${this.accessKeyId}/${this.getCredentialScope(timestamp, this.region, this.serviceName)}, ` +
                `SignedHeaders=${this.getSignedHeaders(headers)}, ` +
                `Signature=${signature}`;
            
            // 将授权头添加到请求头
            headers.Authorization = authHeader;
            
            // 发送POST请求
            // Send POST request
            const endpoint = `${this.apiUrl}/?Action=TranslateText&Version=2020-06-01`;
            const response = await httpClient.Post<{
                TranslateTextResponse: {
                    ResponseMetadata: { RequestId: string },
                    TranslationList: { Translation: string }[]
                }
            }>(endpoint, requestBody, { headers });

            // 提取翻译结果
            // Extract translation result
            if (response?.TranslateTextResponse?.TranslationList?.length > 0) {
                return {
                    text: response.TranslateTextResponse.TranslationList[0].Translation,
                    from: options.from,
                    to: options.to,
                    raw: response
                };
            }
            
            // 如果没有翻译结果，返回原文
            this.logger.warn('火山引擎翻译API未返回预期结果 / Volcengine Translation API did not return expected result:', response);
            return {
                text: `${text} (火山引擎翻译未返回结果 / Volcengine translation returned no result)`,
                from: options.from,
                to: options.to
            };
        } catch (error) {
            this.logger.error('火山引擎翻译请求失败 / Volcengine translation request failed:', error);
            return {
                text: `${text} (火山引擎翻译失败 / Volcengine translation failed)`,
                from: options.from,
                to: options.to
            };
        }
    }

    /**
     * 将标准语言代码转换为火山引擎API使用的语言代码
     * Convert standard language codes to Volcengine API language codes
     */
    private convertToVolcengineLanguageCode(langCode?: string): string {
        if (!langCode) return 'auto';
        
        // 火山引擎翻译API的语言代码映射
        const volcengineLangMap: Record<string, string> = {
            'zh-CN': 'zh', 
            'zh-TW': 'zh-Hant',
            'en': 'en',
            'ja': 'ja',
            'ko': 'ko',
            'fr': 'fr',
            'de': 'de',
            'es': 'es',
            'ru': 'ru',
            'pt': 'pt',
            'it': 'it',
            'ar': 'ar',
            'hi': 'hi',
            'auto': 'auto'
        };
        
        return volcengineLangMap[langCode] || langCode;
    }

    /**
     * 创建规范请求字符串
     * Create canonical request string
     */
    private createCanonicalRequest(
        method: string,
        path: string,
        query: Record<string, string>,
        headers: Record<string, string>,
        payload: string
    ): string {
        // 将查询参数按键排序并格式化
        const canonicalQueryString = Object.keys(query)
            .sort()
            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`)
            .join('&');

        // 获取已签名的头部
        const signedHeaders = this.getSignedHeaders(headers);
        
        // 将头部按键排序并格式化
        const canonicalHeaders = Object.keys(headers)
            .map(key => key.toLowerCase())
            .sort()
            .map(key => `${key}:${headers[key]}`)
            .join('\n') + '\n';

        // 计算有效负载的哈希值
        const payloadHash = this.sha256(payload);
        
        // 构建规范请求
        return [
            method,
            path,
            canonicalQueryString,
            canonicalHeaders,
            signedHeaders,
            payloadHash
        ].join('\n');
    }

    /**
     * 获取已签名的头部
     * Get signed headers
     */
    private getSignedHeaders(headers: Record<string, string>): string {
        return Object.keys(headers)
            .map(key => key.toLowerCase())
            .sort()
            .join(';');
    }

    /**
     * 获取凭证范围
     * Get credential scope
     */
    private getCredentialScope(timestamp: number, region: string, service: string): string {
        const date = new Date(timestamp * 1000).toISOString().split('T')[0].replace(/-/g, '');
        return `${date}/${region}/${service}/request`;
    }

    /**
     * 生成签名
     * Generate signature
     */
    private generateSignature(
        secretKey: string,
        timestamp: number,
        region: string,
        service: string,
        canonicalRequest: string
    ): string {
        const date = new Date(timestamp * 1000).toISOString().split('T')[0].replace(/-/g, '');
        const credentialScope = this.getCredentialScope(timestamp, region, service);
        
        // 构建要签名的字符串
        const stringToSign = [
            'HMAC-SHA256',
            new Date(timestamp * 1000).toISOString().replace(/\.\d+Z$/, 'Z'),
            credentialScope,
            this.sha256(canonicalRequest)
        ].join('\n');
        
        // 派生签名密钥
        const kDate = this.hmacSha256('SDK' + secretKey, date);
        const kRegion = this.hmacSha256(kDate, region);
        const kService = this.hmacSha256(kRegion, service);
        const kSigning = this.hmacSha256(kService, 'request');
        
        // 计算签名
        return this.hmacSha256Hex(kSigning, stringToSign);
    }

    /**
     * 计算SHA256哈希值
     * Calculate SHA256 hash
     */
    private sha256(content: string): string {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * 计算HMAC-SHA256
     * Calculate HMAC-SHA256
     */
    private hmacSha256(key: string | Buffer, content: string): Buffer {
        return crypto.createHmac('sha256', key).update(content).digest();
    }

    /**
     * 计算HMAC-SHA256并返回十六进制字符串
     * Calculate HMAC-SHA256 and return hex string
     */
    private hmacSha256Hex(key: string | Buffer, content: string): string {
        return crypto.createHmac('sha256', key).update(content).digest('hex');
    }

    /**
     * 生成UUID
     * Generate UUID
     */
    private generateUUID(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}
