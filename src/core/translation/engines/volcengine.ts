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
    readonly icon = 'V'

    private readonly apiUrl = 'https://open.volcengineapi.com';
    private readonly serviceName = 'translate';
    private readonly region = 'cn-north-1';
    private readonly logger = Logger.withContext('VolcengineTranslationEngine');
    private readonly supportedLanguages: string[] = [
        'zh', 'zh-Hant', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'pt', 'ar', 'it', 'hi'
    ];

    /**
     * 不参与加签过程的 header key
     * Header keys that don't participate in the signing process
     */
    private readonly HEADER_KEYS_TO_IGNORE = new Set([
        'authorization',
        'content-type',
        'content-length',
        'user-agent',
        'presigned-expires',
        'expect',
    ]);

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
                this.logger.warn('未提供火山引擎API凭据，无法执行翻译 / No Volcengine API credentials provided');
                return {
                    text: 'Volcengine API credentials required',
                    from: options.from,
                    to: options.to
                };
            }

            // 转换语言代码以匹配火山引擎API
            const targetLanguage = this.convertToVolcengineLanguageCode(options.to);
            const sourceLanguage = options.from ? this.convertToVolcengineLanguageCode(options.from) : undefined;

            // 构建请求体
            const requestBody: {
                TargetLanguage: string;
                TextList: string[];
                SourceLanguage?: string;
            } = {
                TargetLanguage: targetLanguage,
                TextList: [text]
            };

            if (sourceLanguage && sourceLanguage !== 'auto') {
                requestBody.SourceLanguage = sourceLanguage;
            }

            const bodyJson = JSON.stringify(requestBody);

            // 构建签名参数
            const signParams = {
                headers: {
                    // x-date header 是必传的，使用火山引擎格式的时间
                    'X-Date': this.getDateTimeNow(),
                    'Host': 'open.volcengineapi.com',
                    'Content-Type': 'application/json'
                },
                method: 'POST',
                query: {
                    Action: 'TranslateText',
                    Version: '2020-06-01',
                },
                pathName: '/',
                accessKeyId: this.accessKeyId,
                secretAccessKey: this.secretAccessKey,
                serviceName: this.serviceName,
                region: this.region,
                bodySha: this.hash(bodyJson)
            };

            // 正规化 query object, 防止串化后出现 query 值为 undefined 情况
            for (const [key, val] of Object.entries(signParams.query)) {
                if (val === undefined || val === null) {
                    // 修复类型错误，使用类型断言
                    (signParams.query as Record<string, string>)[key] = '';
                }
            }

            // 生成授权头
            const authorization = this.sign(signParams);

            // 构建请求头
            const headers = {
                ...signParams.headers,
                'Authorization': authorization,
            };

            // 发送请求
            const endpoint = `${this.apiUrl}/?${this.queryParamsToString(signParams.query)}`;

            // 如果文本为空，直接返回
            if (!text.trim()) {
                return {
                    text: '',
                    from: options.from,
                    to: options.to
                };
            }

            // 更新返回类型定义以匹配真实的响应格式
            const response = await httpClient.Post<{
                TranslationList?: { Translation: string; DetectedSourceLanguage?: string; Extra?: any }[];
                ResponseMetadata?: { RequestId: string; Action: string; Version: string; Service: string; Region: string };
                ResponseMetaData?: { RequestId: string; Action: string; Version: string; Service: string; Region: string };
            }>(endpoint, requestBody, { headers });

            // 提取翻译结果 - 更新处理逻辑以适应实际返回的数据结构
            if (response?.TranslationList?.length > 0) {
                const translation = response.TranslationList[0].Translation;

                // 如果翻译结果是空字符串但原始文本不是空的，可能是API限制或错误
                if (translation === '' && text.trim() !== '') {
                    this.logger.warn('火山引擎翻译返回了空结果 / Volcengine returned empty translation result');
                    return {
                        text: text, // 返回原始文本
                        from: options.from,
                        to: options.to,
                        raw: response
                    };
                }

                // 正常情况，返回翻译结果
                this.logger.debug('火山引擎翻译成功 / Volcengine translation successful');
                return {
                    text: translation || text, // 如果翻译为空则使用原文
                    from: options.from || response.TranslationList[0].Extra?.source_language,
                    to: options.to,
                    raw: response
                };
            }

            // 记录警告但使用更友好的消息格式
            this.logger.warn('火山引擎翻译API返回了结果但格式不符合预期 / Volcengine Translation API returned unexpected format:',
                JSON.stringify(response));

            return {
                text: 'Volcengine translation returned invalid format',
                from: options.from,
                to: options.to
            };
        } catch (error) {
            this.logger.error('火山引擎翻译请求失败:', error);
            return {
                text: 'Volcengine translation failed',
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
     * 创建规范请求字符串 - 按照火山引擎文档格式
     * Create canonical request string according to Volcengine documentation
     */
    private createCanonicalRequest(
        method: string,
        path: string,
        query: Record<string, string>,
        headers: Record<string, string>,
        payload: string
    ): string {
        // 使用新实现的 queryParamsToString 和 getSignHeaders 方法
        const canonicalQueryString = this.queryParamsToString(query);
        const [signedHeaders, canonicalHeaders] = this.getSignHeaders(headers);

        const payloadHash = this.hash(payload);

        return [
            method.toUpperCase(),
            path,
            canonicalQueryString,
            `${canonicalHeaders}\n`,
            signedHeaders,
            payloadHash
        ].join('\n');
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

    /**
     * 签名函数 - 完全按照火山引擎示例实现
     * Sign function - implemented exactly according to Volcengine example
     */
    private sign(params: any): string {
        const {
            headers = {},
            query = {},
            region = '',
            serviceName = '',
            method = '',
            pathName = '/',
            accessKeyId = '',
            secretAccessKey = '',
            needSignHeaderKeys = [],
            bodySha,
        } = params;

        const datetime = headers['X-Date'];
        const date = datetime.substring(0, 8); // YYYYMMDD

        // 创建正规化请求
        const [signedHeaders, canonicalHeaders] = this.getSignHeaders(headers, needSignHeaderKeys);

        const canonicalRequest = [
            method.toUpperCase(),
            pathName,
            this.queryParamsToString(query) || '',
            `${canonicalHeaders}\n`,
            signedHeaders,
            bodySha || this.hash(''),
        ].join('\n');

        const credentialScope = [date, region, serviceName, 'request'].join('/');

        // 创建签名字符串
        const stringToSign = ['HMAC-SHA256', datetime, credentialScope, this.hash(canonicalRequest)].join('\n');

        // 计算签名
        const kDate = this.hmac(secretAccessKey, date);
        const kRegion = this.hmac(kDate, region);
        const kService = this.hmac(kRegion, serviceName);
        const kSigning = this.hmac(kService, 'request');
        const signature = this.hmac(kSigning, stringToSign).toString('hex');

        this.logger.debug('生成火山引擎签名 / Generated Volcengine signature');

        return [
            'HMAC-SHA256',
            `Credential=${accessKeyId}/${credentialScope},`,
            `SignedHeaders=${signedHeaders},`,
            `Signature=${signature}`,
        ].join(' ');
    }

    /**
     * HMAC-SHA256 签名
     * HMAC-SHA256 signature
     */
    private hmac(secret: string | Buffer, s: string): Buffer {
        return crypto.createHmac('sha256', secret).update(s, 'utf8').digest();
    }

    /**
     * SHA256 哈希
     * SHA256 hash
     */
    private hash(s: string): string {
        return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
    }

    /**
     * 查询参数转字符串 - 火山引擎实现
     * Query parameters to string - Volcengine implementation
     */
    private queryParamsToString(params: Record<string, any>): string {
        return Object.keys(params)
            .sort()
            .map((key) => {
                const val = params[key];
                if (typeof val === 'undefined' || val === null) {
                    return undefined;
                }
                const escapedKey = this.uriEscape(key);
                if (!escapedKey) {
                    return undefined;
                }
                if (Array.isArray(val)) {
                    return `${escapedKey}=${val.map(this.uriEscape).sort().join(`&${escapedKey}=`)}`;
                }
                return `${escapedKey}=${this.uriEscape(val)}`;
            })
            .filter((v) => v)
            .join('&');
    }

    /**
     * 获取签名头 - 火山引擎实现
     * Get sign headers - Volcengine implementation
     */
    private getSignHeaders(originHeaders: Record<string, string>, needSignHeaders: string[] = []): [string, string] {
        const trimHeaderValue = (header: any) => {
            return header?.toString?.().trim().replace(/\s+/g, ' ') ?? '';
        };

        let h = Object.keys(originHeaders);

        // 根据 needSignHeaders 过滤
        if (Array.isArray(needSignHeaders) && needSignHeaders.length > 0) {
            const needSignSet = new Set([...needSignHeaders, 'x-date', 'host'].map((k) => k.toLowerCase()));
            h = h.filter((k) => needSignSet.has(k.toLowerCase()));
        }

        // 根据 ignore headers 过滤
        h = h.filter((k) => !this.HEADER_KEYS_TO_IGNORE.has(k.toLowerCase()));

        const signedHeaderKeys = h
            .slice()
            .map((k) => k.toLowerCase())
            .sort()
            .join(';');

        const canonicalHeaders = h
            .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1))
            .map((k) => `${k.toLowerCase()}:${trimHeaderValue(originHeaders[k])}`)
            .join('\n');

        return [signedHeaderKeys, canonicalHeaders];
    }

    /**
     * URI 编码 - 火山引擎实现
     * URI encoding - Volcengine implementation
     */
    private uriEscape(str: string): string {
        try {
            return encodeURIComponent(str)
                .replace(/[^A-Za-z0-9_.~\-%]+/g, escape)
                .replace(/[*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
        } catch (e) {
            return '';
        }
    }

    /**
     * 获取当前格式化日期时间 - 火山引擎格式
     * Get current formatted date time - Volcengine format
     */
    private getDateTimeNow(): string {
        const now = new Date();
        return now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    }
}
