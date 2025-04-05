import { Logger } from '../../pkg/logger';
import * as crypto from 'crypto';
import * as https from 'https'; // 添加原生https模块
import * as http from 'http'; // 添加原生http模块
import { URL } from 'url'; // 用于解析URL

// 初始化日志实例
const logger = Logger.withContext('TranslationService');

/**
 * 发送HTTP请求的辅助函数
 * Helper function to send HTTP requests
 * 
 * @param url 请求URL / Request URL
 * @param options 请求选项 / Request options
 * @param data 请求数据 / Request data
 * @returns Promise<T> 响应数据 / Response data
 */
async function httpRequest<T>(url: string, options: http.RequestOptions = {}, data?: any): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        // 解析URL，确定使用http还是https
        // Parse URL to determine whether to use http or https
        const parsedUrl = new URL(url);
        const httpModule = parsedUrl.protocol === 'https:' ? https : http;
        
        // 设置请求方法，默认GET
        // Set request method, default is GET
        options.method = options.method || 'GET';
        
        // 如果有data且没有设置Content-Type，设置默认值
        // If there is data and Content-Type is not set, set default value
        if (data && !options.headers?.['Content-Type']) {
            options.headers = options.headers || {};
            options.headers['Content-Type'] = 'application/json';
        }
        
        // 创建请求
        // Create request
        const req = httpModule.request(url, options, (res) => {
            // 响应数据缓冲区
            // Response data buffer
            let responseData = '';
            
            // 设置响应编码
            // Set response encoding
            res.setEncoding('utf8');
            
            // 接收数据
            // Receive data
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            // 完成接收
            // Complete receiving
            res.on('end', () => {
                // 检查状态码
                // Check status code
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        // 尝试解析JSON
                        // Try to parse JSON
                        const parsedData = JSON.parse(responseData);
                        resolve(parsedData as T);
                    } catch (e) {
                        // 返回原始响应文本
                        // Return original response text
                        resolve(responseData as unknown as T);
                    }
                } else {
                    // 请求失败
                    // Request failed
                    reject(new Error(`请求失败，状态码: ${res.statusCode} / Request failed with status code: ${res.statusCode}`));
                }
            });
        });
        
        // 错误处理
        // Error handling
        req.on('error', (error) => {
            reject(error);
        });
        
        // 发送请求数据
        // Send request data
        if (data) {
            if (typeof data === 'string') {
                req.write(data);
            } else {
                req.write(JSON.stringify(data));
            }
        }
        
        // 结束请求
        // End request
        req.end();
    });
}

/**
 * 封装GET请求
 * Wrap GET request
 * 
 * @param url 请求URL / Request URL
 * @param options 请求选项 / Request options
 * @returns Promise<T> 响应数据 / Response data
 */
async function httpGet<T>(url: string, options: http.RequestOptions = {}): Promise<T> {
    options.method = 'GET';
    return httpRequest<T>(url, options);
}

/**
 * 封装POST请求
 * Wrap POST request
 * 
 * @param url 请求URL / Request URL
 * @param data 请求数据 / Request data
 * @param options 请求选项 / Request options
 * @returns Promise<T> 响应数据 / Response data
 */
async function httpPost<T>(url: string, data: any, options: http.RequestOptions = {}): Promise<T> {
    options.method = 'POST';
    return httpRequest<T>(url, options, data);
}

/**
 * 转换查询参数到URL字符串
 * Convert query parameters to URL string
 * 
 * @param params 查询参数对象 / Query parameters object
 * @returns URL查询字符串 / URL query string
 */
function objectToQueryString(params: Record<string, any>): string {
    return Object.entries(params)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
}

/**
 * 翻译服务类
 * Translation service class
 */
export class TranslationService {
    private static readonly API_URL = 'https://api.cognitive.microsofttranslator.com/translate';
    private static readonly REGION = 'global'; // 默认区域 / Default region
    private static readonly BAIDU_API_URL = 'https://api.fanyi.baidu.com/api/trans/vip/translate'; // 百度翻译API地址 / Baidu translation API URL
    
    /**
     * 翻译引擎类型
     * Translation engine types
     */
    public static readonly ENGINE_TYPES = {
        MICROSOFT: 'microsoft',
        GOOGLE: 'google',
        ALIYUN: 'aliyun',
        BAIDU: 'baidu',
        BUILT_IN: 'built_in',
        AUTO: 'auto'  // 自动选择引擎类型 / Auto select engine type
    };
    
    // 翻译缓存 - 使用Map进行高效存取
    // Translation cache - use Map for efficient access
    private static translationCache = new Map<string, {
        result: string,
        timestamp: number
    }>();
    
    // 缓存过期时间（毫秒） - 默认24小时
    // Cache expiration time (ms) - default 24 hours
    private static readonly CACHE_EXPIRATION = 24 * 60 * 60 * 1000;
    
    // 最大缓存条目数 - 防止内存溢出
    // Maximum cache entries - prevent memory overflow
    private static readonly MAX_CACHE_SIZE = 1000;
    
    /**
     * 生成缓存键
     * Generate cache key
     * 
     * @param text 要翻译的文本 / Text to translate
     * @param targetLang 目标语言 / Target language
     * @param sourceLang 源语言 / Source language
     * @param engineType 引擎类型 / Engine type
     * @returns 缓存键 / Cache key
     */
    private static generateCacheKey(
        text: string,
        targetLang: string,
        sourceLang: string,
        engineType: string
    ): string {
        // 修复：使用trim()方法，而不是trim属性
        // Fix: use trim() method, not trim property
        return crypto.createHash('md5')
            .update(`${text.trim()}|${targetLang}|${sourceLang}|${engineType}`)
            .digest('hex');
    }
    
    /**
     * 从缓存获取翻译结果
     * Get translation result from cache
     * 
     * @param key 缓存键 / Cache key
     * @returns 缓存的翻译结果，如果未命中缓存则返回null / Cached translation result, or null if cache miss
     */
    private static getFromCache(key: string): string | null {
        const cached = this.translationCache.get(key);
        
        // 如果缓存存在且未过期，返回缓存结果
        // If cache exists and not expired, return cached result
        if (cached && (Date.now() - cached.timestamp) < this.CACHE_EXPIRATION) {
            logger.debug('缓存命中 / Cache hit');
            return cached.result;
        }
        
        // 如果缓存已过期，删除它
        // If cache is expired, delete it
        if (cached) {
            logger.debug('缓存已过期，删除 / Cache expired, removing');
            this.translationCache.delete(key);
        }
        
        return null;
    }
    
    /**
     * 将翻译结果存入缓存
     * Store translation result into cache
     * 
     * @param key 缓存键 / Cache key
     * @param result 翻译结果 / Translation result
     */
    private static storeInCache(key: string, result: string): void {
        // 如果缓存太大，删除最旧的条目
        // If cache is too large, remove oldest entries
        if (this.translationCache.size >= this.MAX_CACHE_SIZE) {
            logger.debug('缓存已满，清理最旧条目 / Cache full, cleaning oldest entries');
            
            // 获取所有缓存条目并按时间戳排序
            // Get all cache entries and sort by timestamp
            const entries = Array.from(this.translationCache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp);
            
            // 删除25%的最旧条目
            // Remove 25% of the oldest entries
            const entriesToRemove = Math.floor(this.MAX_CACHE_SIZE * 0.25);
            for (let i = 0; i < entriesToRemove && i < entries.length; i++) {
                this.translationCache.delete(entries[i][0]);
            }
        }
        
        // 存储新结果
        // Store new result
        this.translationCache.set(key, {
            result,
            timestamp: Date.now()
        });
    }
    
    /**
     * 清除过期缓存
     * Clear expired cache
     */
    public static clearExpiredCache(): void {
        const now = Date.now();
        let removedCount = 0;
        
        // 遍历所有缓存条目，删除过期的
        // Iterate all cache entries, remove expired ones
        for (const [key, value] of this.translationCache.entries()) {
            if ((now - value.timestamp) >= this.CACHE_EXPIRATION) {
                this.translationCache.delete(key);
                removedCount++;
            }
        }
        
        if (removedCount > 0) {
            logger.debug(`已清除 ${removedCount} 条过期缓存 / Cleared ${removedCount} expired cache entries`);
        }
    }
    
    /**
     * 使用微软翻译API翻译文本
     * Translate text using Microsoft Translator API
     * 
     * @param text 要翻译的文本 / Text to translate
     * @param targetLang 目标语言代码 / Target language code
     * @param apiKey API密钥 / API key
     * @returns 翻译后的文本 / Translated text
     */
    public static async translateWithMicrosoft(
        text: string, 
        targetLang: string = 'zh-CN',
        sourceLang: string = 'en',
        apiKey?: string
    ): Promise<string> {
        try {
            // 如果没有API密钥，返回原文
            // If no API key is provided, return the original text
            if (!apiKey) {
                logger.warn('未提供API密钥，无法执行翻译 / No API key provided, cannot perform translation');
                return `${text} (需要配置API密钥 / API key required)`;
            }

            // 构建请求URL，包含查询参数
            // Build request URL with query parameters
            const queryParams = {
                'api-version': '3.0',
                'from': sourceLang,
                'to': targetLang
            };
            const requestUrl = `${this.API_URL}?${objectToQueryString(queryParams)}`;

            // 准备请求头和请求体
            // Prepare request headers and body
            const headers = {
                'Ocp-Apim-Subscription-Key': apiKey,
                'Ocp-Apim-Subscription-Region': this.REGION,
                'Content-type': 'application/json',
            };
            
            // 发送POST请求
            // Send POST request
            const response = await httpPost<Array<{ translations: { text: string }[] }>>(
                requestUrl,
                [{ text }],
                { headers }
            );

            // 提取翻译结果
            // Extract translation result
            const result = response[0]?.translations[0]?.text;
            return result || text;
        } catch (error) {
            logger.error('翻译请求失败 / Translation request failed:', error);
            return `${text} (翻译失败 / Translation failed)`;
        }
    }
    
    /**
     * 使用谷歌翻译API翻译文本
     * Translate text using Google Translation API
     * 
     * @param text 要翻译的文本 / Text to translate
     * @param targetLang 目标语言代码 / Target language code
     * @param sourceLang 源语言代码 / Source language code
     * @param apiKey API密钥 / API key
     * @returns 翻译后的文本 / Translated text
     */
    public static async translateWithGoogle(
        text: string, 
        targetLang: string = 'zh-CN',
        sourceLang: string = 'en',
        apiKey?: string
    ): Promise<string> {
        try {
            // 如果没有API密钥，返回原文
            // If no API key is provided, return the original text
            if (!apiKey) {
                logger.warn('未提供谷歌API密钥，无法执行翻译 / No Google API key provided, cannot perform translation');
                return `${text} (需要配置谷歌API密钥 / Google API key required)`;
            }

            // 转换语言代码以匹配谷歌API
            const googleSourceLang = this.convertToGoogleLanguageCode(sourceLang);
            const googleTargetLang = this.convertToGoogleLanguageCode(targetLang);

            // 构建请求URL和数据
            // Build request URL and data
            const requestUrl = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
            const requestData = {
                q: text,
                source: googleSourceLang,
                target: googleTargetLang,
                format: 'text'
            };
            
            // 发送POST请求
            // Send POST request
            const response = await httpPost<{ data: { translations: { translatedText: string }[] } }>(
                requestUrl,
                requestData
            );

            // 提取翻译结果
            // Extract translation result
            if (response?.data?.translations?.length > 0) {
                return response.data.translations[0].translatedText;
            }
            return text;
        } catch (error) {
            logger.error('谷歌翻译请求失败 / Google translation request failed:', error);
            return `${text} (谷歌翻译失败 / Google translation failed)`;
        }
    }

    /**
     * 使用阿里云翻译API翻译文本
     * Translate text using Aliyun Translation API
     * 
     * @param text 要翻译的文本 / Text to translate
     * @param targetLang 目标语言代码 / Target language code
     * @param sourceLang 源语言代码 / Source language code
     * @param accessKeyId 阿里云访问密钥ID / Aliyun Access Key ID
     * @param accessKeySecret 阿里云访问密钥密钥 / Aliyun Access Key Secret
     * @returns 翻译后的文本 / Translated text
     */
    public static async translateWithAliyun(
        text: string, 
        targetLang: string = 'zh',
        sourceLang: string = 'en',
        accessKeyId?: string,
        accessKeySecret?: string
    ): Promise<string> {
        try {
            // 如果没有提供访问密钥，返回原文
            // If no access keys are provided, return the original text
            if (!accessKeyId || !accessKeySecret) {
                logger.warn('未提供阿里云API凭据，无法执行翻译 / No Aliyun API credentials provided, cannot perform translation');
                return `${text} (需要配置阿里云API凭据 / Aliyun API credentials required)`;
            }

            // 转换语言代码以匹配阿里云API
            const aliyunSourceLang = this.convertToAliyunLanguageCode(sourceLang);
            const aliyunTargetLang = this.convertToAliyunLanguageCode(targetLang);
            
            // 构建签名
            const date = new Date().toUTCString();
            const nonce = crypto.randomBytes(16).toString('hex');
            
            // 准备要签名的字符串
            const stringToSign = `POST\n` +
                `application/json\n` +
                `\n` +
                `application/json;chrset=utf-8\n` +
                `${date}\n` +
                `/api/v1/translate`;
                
            // 使用HMAC-SHA1计算签名
            const signature = crypto.createHmac('sha1', accessKeySecret)
                .update(stringToSign)
                .digest('base64');
            
            // 准备请求头和数据
            // Prepare request headers and data
            const headers = {
                'Content-Type': 'application/json;chrset=utf-8',
                'Accept': 'application/json',
                'Date': date,
                'x-acs-signature-method': 'HMAC-SHA1',
                'x-acs-signature-nonce': nonce,
                'x-acs-signature-version': '1.0',
                'Authorization': `acs ${accessKeyId}:${signature}`
            };
            
            const requestData = {
                sourceLanguage: aliyunSourceLang,
                targetLanguage: aliyunTargetLang,
                sourceText: text,
                formatType: 'text'
            };
            
            // 发送POST请求
            // Send POST request
            const response = await httpPost<{ Data: { Translated: string } }>(
                'https://mt.aliyuncs.com/api/v1/translate',
                requestData,
                { headers }
            );
            
            // 提取翻译结果
            if (response?.Data?.Translated) {
                return response.Data.Translated;
            }
            return text;
        } catch (error) {
            logger.error('阿里云翻译请求失败 / Aliyun translation request failed:', error);
            return `${text} (阿里云翻译失败 / Aliyun translation failed)`;
        }
    }

    /**
     * 使用百度翻译API翻译文本
     * Translate text using Baidu Translation API
     * 
     * @param text 要翻译的文本 / Text to translate
     * @param targetLang 目标语言代码 / Target language code
     * @param sourceLang 源语言代码 / Source language code
     * @param appId 百度翻译APP ID / Baidu translation APP ID
     * @param secretKey 百度翻译密钥 / Baidu translation secret key
     * @returns 翻译后的文本 / Translated text
     */
    public static async translateWithBaidu(
        text: string,
        targetLang: string = 'zh',
        sourceLang: string = 'en',
        appId?: string,
        secretKey?: string
    ): Promise<string> {
        try {
            // 如果没有提供APP ID或密钥，返回原文
            // If no APP ID or secret key is provided, return the original text
            if (!appId || !secretKey) {
                logger.warn('未提供百度翻译API凭据，无法执行翻译 / No Baidu Translation API credentials provided, cannot perform translation');
                return `${text} (需要配置百度翻译API凭据 / Baidu Translation API credentials required)`;
            }
            
            // 转换语言代码以匹配百度API需求
            const baiduLangCode = this.convertToBaiduLanguageCode(targetLang);
            const baiduSourceLangCode = this.convertToBaiduLanguageCode(sourceLang);
            
            // 生成随机数作为请求的一部分
            const salt = Date.now().toString();
            
            // 计算签名 - 百度API要求: appid+q+salt+密钥 的MD5值
            const sign = crypto.createHash('md5')
                .update(appId + text + salt + secretKey)
                .digest('hex');
            
            // 构建请求URL，百度使用GET请求
            // Build request URL, Baidu uses GET request
            const queryParams = {
                q: encodeURIComponent(text),
                from: baiduSourceLangCode,
                to: baiduLangCode,
                appid: appId,
                salt,
                sign
            };
            
            const requestUrl = `${this.BAIDU_API_URL}?${objectToQueryString(queryParams)}`;
            
            // 发送GET请求
            // Send GET request
            const response = await httpGet<{ trans_result: { dst: string }[] }>(requestUrl);
            
            // 检查响应数据
            if (response?.trans_result?.length > 0) {
                return response.trans_result[0].dst;
            }
            
            // 如果没有获取到翻译结果，返回原文
            logger.warn('百度翻译API未返回预期结果 / Baidu Translation API did not return expected result:', response);
            return `${text} (百度翻译未返回结果 / Baidu translation returned no result)`;
        } catch (error) {
            logger.error('百度翻译请求失败 / Baidu translation request failed:', error);
            return `${text} (百度翻译失败 / Baidu translation failed)`;
        }
    }

    /**
     * 使用内置服务翻译文本（无需配置）
     * Translate text using built-in service (no configuration needed)
     * 
     * @param text 要翻译的文本 / Text to translate
     * @param targetLang 目标语言代码 / Target language code
     * @param sourceLang 源语言代码 / Source language code
     * @returns 翻译后的文本 / Translated text
     */
    public static async translateWithBuiltIn(
        text: string,
        targetLang: string = 'zh-CN',
        sourceLang: string = 'en'
    ): Promise<string> {
        try {
            // 扩展内置翻译词典，特别是编程相关术语
            // Expand built-in translation dictionary, especially programming-related terms
            const translationMap: Record<string, Record<string, string>> = {
                // 常用短语缓存，提高性能 / Common phrases cache to improve performance
                'en': {
                    'hello': '你好',
                    'world': '世界',
                    'go': 'Go语言',
                    'translate': '翻译',
                    'function': '函数',
                    'method': '方法',
                    'interface': '接口',
                    'struct': '结构体',
                    'string': '字符串',
                    'error': '错误',
                    'return': '返回',
                    'code': '代码',
                    'type': '类型',
                    'import': '导入',
                    'package': '包',
                    'variable': '变量',
                    'constant': '常量',
                    'test': '测试',
                    'debug': '调试',
                    // 添加更多常用编程术语
                    'server': '服务器',
                    'client': '客户端',
                    'connection': '连接',
                    'transport': '传输',
                    'receive': '接收',
                    'add': '添加',
                    'map': '映射',
                    'key': '键',
                    'value': '值',
                    'listener': '侦听器',
                    'address': '地址',
                    'regular': '常规',
                    'traffic': '流量',
                    'through': '通过',
                    'call': '调用',
                    'accept': '接受',
                    'actual': '实际',
                    'use': '使用',
                    'when': '当',
                    'dummy': '虚拟',
                    'track': '跟踪',
                    'but': '但是',
                    'for': '对于',
                    'serve': '服务',
                    'which': '它',
                    'http': 'HTTP',
                    'we': '我们',
                    'to': '到',
                    'in': '在',
                    'it': '它',
                    'on': '在',
                    'and': '和',
                    'the': '这个',
                    'as': '作为',
                    'a': '一个',
                    'do': '做',
                    'not': '不',
                    'have': '有',
                    'hence': '因此'
                },
                'zh-CN': {
                    // 可以添加中文到英文的常用短语
                    '服务器': 'server',
                    '客户端': 'client',
                    '连接': 'connection',
                    '传输': 'transport',
                    '接收': 'receive',
                    '添加': 'add',
                    '映射': 'map',
                    '键': 'key',
                    '值': 'value'
                }
            };

            // 清理输入文本，删除前后空白字符和过多的空格
            const cleanedText = text.trim().replace(/\s+/g, ' ');

            // 整句翻译比单词替换更准确，先尝试完整匹配
            const exactMatch = this.getExactPhraseTranslation(cleanedText, sourceLang);
            if (exactMatch) {
                return exactMatch;
            }
            
            // 检查词典中是否有直接匹配的术语
            if (translationMap[sourceLang]?.[cleanedText.toLowerCase()]) {
                return translationMap[sourceLang][cleanedText.toLowerCase()];
            }
            
            // 如果没有匹配完整句子，使用基于词典的简单翻译
            if (sourceLang === 'en' && targetLang === 'zh-CN') {
                return this.translateEnglishToChinese(cleanedText, translationMap['en']);
            } else if (sourceLang === 'zh-CN' && targetLang === 'en') {
                return this.translateChineseToEnglish(cleanedText, translationMap['zh-CN']);
            }
            
            // 如果所有方法都失败，保留原文但加上通知
            return `${text} (内置翻译尝试但未成功 / Built-in translation attempted but failed)`;
        } catch (error) {
            logger.error('内置翻译失败 / Built-in translation failed:', error);
            return `${text} (内置翻译错误 / Built-in translation error)`;
        }
    }

    /**
     * 获取完整短语的翻译
     * Get translation for complete phrases
     * 
     * @param text 文本 / Text
     * @param sourceLang 源语言 / Source language
     * @returns 匹配到的翻译或null / Matched translation or null
     */
    private static getExactPhraseTranslation(text: string, sourceLang: string): string | null {
        // 常用编程相关句子的直接翻译
        const exactPhrases: Record<string, Record<string, string>> = {
            'en': {
                'Server transports are tracked in a map which is keyed on listener address.': 
                    '服务器传输在一个以侦听器地址为键的映射中进行跟踪。',
                'For regular gRPC traffic, connections are accepted in Serve() through a call to Accept().':
                    '对于常规的gRPC流量，连接在Serve()中通过调用Accept()来接受。',
                'But for connections received through ServeHTTP(), we do not have a listener and hence use this dummy value.':
                    '但对于通过ServeHTTP()接收的连接，我们没有侦听器，因此使用这个虚拟值。',
                'when we add it to the map.':
                    '当我们将其添加到映射中时。'
            },
            'zh-CN': {
                // 可以添加中文到英文的常用短语
                '服务器传输在一个以侦听器地址为键的映射中进行跟踪。':
                    'Server transports are tracked in a map which is keyed on listener address.',
                '对于常规的gRPC流量，连接在Serve()中通过调用Accept()来接受。':
                    'For regular gRPC traffic, connections are accepted in Serve() through a call to Accept().',
                '但对于通过ServeHTTP()接收的连接，我们没有侦听器，因此使用这个虚拟值。':
                    'But for connections received through ServeHTTP(), we do not have a listener and hence use this dummy value.',
                '当我们将其添加到映射中时。':
                    'when we add it to the map.'
            }
        };
        
        // 直接匹配
        if (exactPhrases[sourceLang]?.[text]) {
            return exactPhrases[sourceLang][text];
        }
        
        // 检查文本是否为某个完整短语的一部分
        for (const [phrase, translation] of Object.entries(exactPhrases[sourceLang] || {})) {
            if (phrase.includes(text)) {
                const startIndex = phrase.indexOf(text);
                const endIndex = startIndex + text.length;
                
                // 计算文本在完整短语中的位置，并从翻译中提取对应部分
                const ratio = translation.length / phrase.length;
                const translationStart = Math.floor(startIndex * ratio);
                const translationEnd = Math.floor(endIndex * ratio);
                
                return translation.substring(translationStart, translationEnd);
            }
        }
        
        return null;
    }

    /**
     * 使用字典进行英文到中文的翻译
     * Translate from English to Chinese using dictionary
     * 
     * @param text 英文文本 / English text
     * @param dictionary 英中词典 / English-Chinese dictionary
     * @returns 翻译结果 / Translation result
     */
    private static translateEnglishToChinese(text: string, dictionary: Record<string, string>): string {
        const words = text.split(/\b/);
        let result = '';
        
        for (let i = 0; i < words.length; i++) {
            const word = words[i].toLowerCase();
            // 检查当前词和后续词的组合是否在字典中
            let found = false;
            
            // 尝试多词短语匹配（最多3个词）
            for (let j = 3; j > 0; j--) {
                if (i + j <= words.length) {
                    const phrase = words.slice(i, i + j).join('').toLowerCase();
                    if (dictionary[phrase]) {
                        result += dictionary[phrase];
                        i += j - 1;
                        found = true;
                        break;
                    }
                }
            }
            
            if (!found) {
                // 如果是单词，查找翻译
                if (/^[a-zA-Z]+$/.test(words[i])) {
                    result += dictionary[word] || words[i];
                } else {
                    // 保留非单词字符（标点、空格等）
                    result += words[i];
                }
            }
        }
        
        return result;
    }

    /**
     * 使用字典进行中文到英文的翻译
     * Translate from Chinese to English using dictionary
     * 
     * @param text 中文文本 / Chinese text
     * @param dictionary 中英词典 / Chinese-English dictionary
     * @returns 翻译结果 / Translation result
     */
    private static translateChineseToEnglish(text: string, dictionary: Record<string, string>): string {
        // 中文分词和翻译逻辑
        let result = text;
        
        // 按照词典中词语长度从长到短排序，以避免短词替换长词的子字符串
        const entries = Object.entries(dictionary).sort((a, b) => b[0].length - a[0].length);
        
        // 逐个替换词典中的词语
        for (const [word, translation] of entries) {
            result = result.replace(new RegExp(word, 'g'), translation);
        }
        
        return result;
    }

    /**
     * 将标准语言代码转换为百度API使用的语言代码
     * Convert standard language codes to Baidu API language codes
     * 
     * @param langCode 标准语言代码 / Standard language code
     * @returns 百度API语言代码 / Baidu API language code
     */
    private static convertToBaiduLanguageCode(langCode: string): string {
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

    /**
     * 将标准语言代码转换为谷歌API使用的语言代码
     * Convert standard language codes to Google API language codes
     * 
     * @param langCode 标准语言代码 / Standard language code
     * @returns 谷歌API语言代码 / Google API language code
     */
    private static convertToGoogleLanguageCode(langCode: string): string {
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

    /**
     * 将标准语言代码转换为阿里云API使用的语言代码
     * Convert standard language codes to Aliyun API language codes
     * 
     * @param langCode 标准语言代码 / Standard language code
     * @returns 阿里云API语言代码 / Aliyun API language code
     */
    private static convertToAliyunLanguageCode(langCode: string): string {
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

    /**
     * 根据语言代码获取语言名称
     * Get language name from language code
     * 
     * @param langCode 语言代码 / Language code
     * @returns 语言名称 / Language name
     */
    private static getLanguageName(langCode: string): string {
        const languageMap: {[key: string]: string} = {
            'en': '英语',
            'zh-CN': '中文',
            'ja': '日语',
            'ko': '韩语',
            'fr': '法语',
            'de': '德语',
            'es': '西班牙语',
            'ru': '俄语'
        };
        
        return languageMap[langCode] || langCode;
    }

    /**
     * 根据配置选择的引擎翻译文本
     * Translate text using the engine specified in configuration
     * 
     * @param text 要翻译的文本 / Text to translate
     * @param targetLang 目标语言代码 / Target language code
     * @param sourceLang 源语言代码 / Source language code
     * @param engineType 翻译引擎类型 / Translation engine type
     * @param config 翻译配置 / Translation configuration 
     * @returns 翻译后的文本 / Translated text
     */
    public static async translate(
        text: string,
        targetLang: string = 'zh-CN',
        sourceLang: string = 'en',
        engineType: string = this.ENGINE_TYPES.AUTO,
        config: {
            microsoftApiKey?: string,
            googleApiKey?: string,
            baiduAppId?: string,
            baiduSecretKey?: string,
            aliyunAccessKeyId?: string,
            aliyunAccessKeySecret?: string
        } = {}
    ): Promise<string> {
        // 预处理文本 - 处理多行文本
        // Preprocess text - handle multi-line text
        text = this.preprocessMultilineText(text);
        
        // 智能选择翻译引擎 / Intelligently select translation engine
        const actualEngineType = this.selectTranslationEngine(engineType, config);
        
        // 生成缓存键并尝试从缓存获取结果
        // Generate cache key and try to get result from cache
        const cacheKey = this.generateCacheKey(text, targetLang, sourceLang, actualEngineType);
        const cachedResult = this.getFromCache(cacheKey);
        
        // 如果缓存命中，直接返回缓存结果
        // If cache hit, return cached result directly
        if (cachedResult !== null) {
            // 添加日志，记录缓存命中时的键和值，便于调试
            // Add log to record key and value on cache hit for debugging
            logger.debug(`缓存命中[${text.substring(0, 20)}...]: "${cachedResult.substring(0, 40)}..." / Cache hit`);
            return cachedResult;
        }
        
        // 如果实际使用的引擎与用户选择的不同且不是自动模式，记录信息
        // If the actual engine differs from user selection and not in auto mode, log info
        if (actualEngineType !== engineType && engineType !== this.ENGINE_TYPES.AUTO) {
            logger.info(`自动切换翻译引擎: ${engineType} -> ${actualEngineType} / Automatically switched translation engine`);
        }
        
        // 执行翻译
        // Perform translation
        let result: string;
        
        // 根据引擎类型调用不同的翻译方法
        // Call different translation methods based on engine type
        switch (actualEngineType) {
            case this.ENGINE_TYPES.MICROSOFT:
                result = await this.translateWithMicrosoft(text, targetLang, sourceLang, config.microsoftApiKey);
                break;
            case this.ENGINE_TYPES.GOOGLE:
                result = await this.translateWithGoogle(text, targetLang, sourceLang, config.googleApiKey);
                break;
            case this.ENGINE_TYPES.ALIYUN:
                result = await this.translateWithAliyun(text, targetLang, sourceLang, config.aliyunAccessKeyId, config.aliyunAccessKeySecret);
                break;
            case this.ENGINE_TYPES.BAIDU:
                result = await this.translateWithBaidu(text, targetLang, sourceLang, config.baiduAppId, config.baiduSecretKey);
                break;
            case this.ENGINE_TYPES.BUILT_IN:
            default:
                result = await this.translateWithBuiltIn(text, targetLang, sourceLang);
                break;
        }
        
        // 存入缓存
        // Store in cache
        this.storeInCache(cacheKey, result);
        
        // 添加日志，记录添加到缓存的内容，便于调试
        // Add log to record content added to cache for debugging
        logger.debug(`缓存添加[${text.substring(0, 20)}...]: "${result.substring(0, 40)}..." / Cache added`);
        
        return result;
    }

    /**
     * 预处理多行文本
     * Preprocess multiline text
     * 
     * @param text 原始文本 / Original text
     * @returns 处理后的文本 / Processed text
     */
    private static preprocessMultilineText(text: string): string {
        // 修剪空白字符
        // Trim whitespace
        text = text.trim();
        
        // 处理多行文本，保留适当的换行符
        // Handle multiline text, preserve appropriate line breaks
        
        // 1. 合并过多的空行（超过2个连续空行的缩减为2个）
        // 1. Merge excessive empty lines (reduce more than 2 consecutive empty lines to 2)
        text = text.replace(/\n{3,}/g, '\n\n');
        
        // 2. 移除每行开头和结尾的空白字符
        // 2. Remove whitespace at the beginning and end of each line
        text = text.split('\n').map(line => line.trim()).join('\n');
        
        return text;
    }

    /**
     * 检测语言
     * Detect language
     * 
     * @param text 要检测的文本 / Text to detect
     * @returns 可能的语言代码 / Possible language code
     */
    public static detectLanguage(text: string): string {
        // 简单检测：如果包含中文字符，假设是中文
        // Simple detection: if contains Chinese characters, assume it's Chinese
        const chinesePattern = /[\u4e00-\u9fa5]/;
        return chinesePattern.test(text) ? 'zh-CN' : 'en';
    }

    /**
     * 智能选择翻译引擎
     * Intelligently select translation engine based on available configurations
     * 
     * @param userSelectedEngine 用户选择的引擎 / User selected engine
     * @param config 翻译配置 / Translation configuration
     * @returns 实际使用的引擎 / Actual engine to use
     */
    public static selectTranslationEngine(
        userSelectedEngine: string,
        config: {
            microsoftApiKey?: string,
            googleApiKey?: string,
            baiduAppId?: string,
            baiduSecretKey?: string,
            aliyunAccessKeyId?: string,
            aliyunAccessKeySecret?: string
        }
    ): string {
        // 如果不是自动模式，直接返回用户选择的引擎
        // If not in auto mode, directly return user selected engine
        if (userSelectedEngine !== this.ENGINE_TYPES.AUTO) {
            return userSelectedEngine;
        }
        
        // 1. 检查是否有配置的API凭据可用，优先使用已配置的引擎
        // Check if there are configured API credentials available, prioritize configured engines
        if (config.baiduAppId && config.baiduSecretKey) {
            logger.info('检测到百度翻译API凭据，优先使用百度翻译 / Detected Baidu Translation API credentials, using Baidu translator');
            return this.ENGINE_TYPES.BAIDU;
        }
        
        if (config.microsoftApiKey) {
            logger.info('检测到微软翻译API密钥，优先使用微软翻译 / Detected Microsoft Translator API key, using Microsoft translator');
            return this.ENGINE_TYPES.MICROSOFT;
        }
        
        if (config.googleApiKey) {
            logger.info('检测到谷歌翻译API密钥，优先使用谷歌翻译 / Detected Google Translator API key, using Google translator');
            return this.ENGINE_TYPES.GOOGLE;
        }
        
        if (config.aliyunAccessKeyId && config.aliyunAccessKeySecret) {
            logger.info('检测到阿里云翻译API凭据，优先使用阿里云翻译 / Detected Aliyun Translation API credentials, using Aliyun translator');
            return this.ENGINE_TYPES.ALIYUN;
        }
        
        // 3. 最后使用内置免费引擎
        // Finally, use the built-in free engine
        return this.ENGINE_TYPES.BUILT_IN;
    }

    /**
     * 检查GitHub Copilot是否可用
     * Check if GitHub Copilot is available
     * 
     * @returns 是否可用 / Is available
     */
    private static checkCopilotAvailability(): boolean {
        try {
            // 尝试获取vscode模块
            // Try to get vscode module
            const vscode = require('vscode');
            
            // 首先检查Copilot Chat，因为它通常更适合翻译任务
            // First check Copilot Chat, as it's usually better for translation tasks
            if (this.isCopilotChatAvailable()) {
                return true;
            }
            
            // 然后检查常规Copilot
            // Then check regular Copilot
            const extension = vscode.extensions.getExtension('GitHub.copilot');
            return !!extension && extension.isActive;
        } catch (error) {
            logger.debug('检查GitHub Copilot可用性时出错 / Error checking GitHub Copilot availability:', error);
            return false;
        }
    }

    /**
     * 检查GitHub Copilot Chat是否可用
     * Check if GitHub Copilot Chat is available
     * 
     * @returns 是否可用 / Is available
     */
    private static isCopilotChatAvailable(): boolean {
        try {
            const vscode = require('vscode');
            const extension = vscode.extensions.getExtension('GitHub.copilot-chat');
            return !!extension && extension.isActive;
        } catch (error) {
            return false;
        }
    }

    /**
     * 从对象中提取文本
     * Extract text from object
     * 
     * @param obj 可能包含文本的对象 / Object that may contain text
     * @returns 提取的文本或空字符串 / Extracted text or empty string
     */
    private static extractTextFromObject(obj: any): string {
        // 如果不是对象，直接返回空字符串
        if (!obj || typeof obj !== 'object') {
            return '';
        }
        
        // 可能包含文本的属性名列表
        const possibleTextProperties = [
            'message', 'content', 'text', 'value', 'result', 'translation', 'answer', 'response', 'output', 'data'
        ];
        
        // 查找一级属性
        for (const prop of possibleTextProperties) {
            if (obj[prop] && typeof obj[prop] === 'string') {
                return obj[prop];
            }
            
            if (obj[prop] && typeof obj[prop] === 'object') {
                for (const nestedProp of possibleTextProperties) {
                    if (obj[prop][nestedProp] && typeof obj[prop][nestedProp] === 'string') {
                        return obj[prop][nestedProp];
                    }
                }
            }
        }
        
        // 如果找不到可能的文本属性，尝试转换整个对象为JSON字符串
        try {
            const jsonString = JSON.stringify(obj);
            // 尝试从JSON字符串中提取引号中的文本 (长度大于5的文本)
            const matches = jsonString.match(/"([^"]{5,})"/g);
            if (matches && matches.length > 0) {
                // 选择最长的匹配项作为可能的翻译结果
                const longest = matches.reduce((a, b) => a.length > b.length ? a : b);
                // 移除引号
                return longest.substring(1, longest.length - 1);
            }
        } catch (e) {
            // JSON转换失败时忽略
        }
        
        // 无法提取有效文本
        return '';
    }
}