import { TranslationOptions, TranslationResult } from './engines/engine';
import { Logger } from '../../pkg/logger';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import {
    ENGINE_TYPES,
    TranslationEngineConfig,
    createTranslationEngine
} from './engines';

// 初始化日志实例
const logger = Logger.withContext('TranslationService');

/**
 * 翻译服务类
 * Translation service class
 */
export class TranslationService {

    // 翻译缓存 - 使用Map进行高效存取
    // Translation cache - use Map for efficient access
    private translationCache = new Map<string, {
        result: string,
        timestamp: number
    }>();

    // 缓存过期时间（毫秒） - 默认 31 天
    // Cache expiration time (ms) - default 31 days
    private readonly CACHE_EXPIRATION = 31 * 24 * 60 * 60 * 1000;

    // 最大缓存条目数 - 防止内存溢出
    // Maximum cache entries - prevent memory overflow
    private readonly MAX_CACHE_SIZE = 3000;

    private configKey = 'gopp.translation';
    private conf: TranslationEngineConfig;

    // 翻译引擎的权重配置
    // Weight configuration for translation engines
    private readonly ENGINE_WEIGHTS = {
        [ENGINE_TYPES.MICROSOFT]: 20,
        [ENGINE_TYPES.GOOGLE]: 10,
        [ENGINE_TYPES.VOLCENGINE]: 20,
        [ENGINE_TYPES.TENCENT]: 50
    };

    // 当前引擎计数器
    // Current engine counter
    private engineCounter = 0;

    constructor(context: vscode.ExtensionContext) {
        const config = vscode.workspace.getConfiguration(this.configKey);
        this.updateConfig(config);

        // 订阅配置变更事件
        // Subscribe to configuration change events
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(this.handleConfigChange, this)
        );
    }

    /**
     * 处理配置变更事件
     * Handle configuration change events
     */
    private handleConfigChange(event: vscode.ConfigurationChangeEvent) {
        if (event.affectsConfiguration(this.configKey)) {
            const config = vscode.workspace.getConfiguration(this.configKey);
            this.updateConfig(config);
        }
    }

    /**
     * 更新配置
     * Update configuration
     *
     * @param config 新的配置 / New configuration
     */
    private updateConfig(config: vscode.WorkspaceConfiguration) {
        this.conf = {
            microsoftApiKey: config.microsoftApiKey,
            googleApiKey: config.googleApiKey,
            volcengineAccessKeyId: config.volcengineAccessKeyId,
            volcengineSecretAccessKey: config.volcengineSecretAccessKey,
            tencentSecretId: config.tencentSecretId,
            tencentSecretKey: config.tencentSecretKey,
            engineType: config.engineType,
        };
    }

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
    private generateCacheKey(
        text: string,
        targetLang: string,
        sourceLang: string,
        engineType: string
    ): string {
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
    private getFromCache(key: string): string | null {
        const cached = this.translationCache.get(key);

        // 如果缓存存在且未过期，返回缓存结果
        // If cache exists and not expired, return cached result
        if (cached && (Date.now() - cached.timestamp) < this.CACHE_EXPIRATION) {
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
    private storeInCache(key: string, result: string): void {
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
    public clearExpiredCache(): void {
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
     * 预处理多行文本
     * Preprocess multiline text
     *
     * @param text 原始文本 / Original text
     * @returns 处理后的文本 / Processed text
     */
    private preprocessMultilineText(text: string): string {
        // 修剪空白字符
        // Trim whitespace
        text = text.trim();

        // 全部是特殊字符号返回空字符串
        // If all are special characters, return empty string
        if (/^[^\w\s]+$/.test(text)) {
            return '';
        }

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
    public detectLanguage(text: string): string {
        // 简单检测：如果包含中文字符，假设是中文
        // Simple detection: if contains Chinese characters, assume it's Chinese
        const chinesePattern = /[\u4e00-\u9fa5]/;
        return chinesePattern.test(text) ? 'zh-CN' : 'en';
    }

    /**
     * 智能选择翻译引擎
     * Intelligently select translation engine based on available configurations and weights
     *
     * @param userSelectedEngine 用户选择的引擎 / User selected engine
     * @returns 实际使用的引擎 / Actual engine to use
     */
    public selectTranslationEngine(userSelectedEngine: string): string {
        // 如果不是自动模式，直接返回用户选择的引擎
        // If not in auto mode, directly return user selected engine
        if (userSelectedEngine !== ENGINE_TYPES.AUTO) {
            return userSelectedEngine;
        }

        // 收集已配置的引擎
        // Collect configured engines
        const configuredEngines = [];

        if (this.conf.microsoftApiKey) {
            configuredEngines.push({
                type: ENGINE_TYPES.MICROSOFT,
                weight: this.ENGINE_WEIGHTS[ENGINE_TYPES.MICROSOFT]
            });
        }
        if (this.conf.googleApiKey) {
            configuredEngines.push({
                type: ENGINE_TYPES.GOOGLE,
                weight: this.ENGINE_WEIGHTS[ENGINE_TYPES.GOOGLE]
            });
        }
        if (this.conf.tencentSecretId && this.conf.tencentSecretKey) {
            configuredEngines.push({
                type: ENGINE_TYPES.TENCENT,
                weight: this.ENGINE_WEIGHTS[ENGINE_TYPES.TENCENT]
            });
        }
        if (this.conf.volcengineAccessKeyId && this.conf.volcengineSecretAccessKey) {
            configuredEngines.push({
                type: ENGINE_TYPES.VOLCENGINE,
                weight: this.ENGINE_WEIGHTS[ENGINE_TYPES.VOLCENGINE]
            });
        }

        // 如果没有配置任何引擎，返回自动模式
        // If no engines configured, return auto mode
        if (configuredEngines.length === 0) {
            return ENGINE_TYPES.AUTO;
        }

        // 基于权重随机选择引擎
        // Choose engine randomly based on weights
        let totalWeight = 0;
        for (const engine of configuredEngines) {
            totalWeight += engine.weight;
        }

        const randomValue = this.engineCounter % totalWeight;
        this.engineCounter++;

        let cumulativeWeight = 0;
        for (const engine of configuredEngines) {
            cumulativeWeight += engine.weight;
            if (randomValue < cumulativeWeight) {
                return engine.type;
            }
        }

        // 默认返回第一个配置的引擎
        // Default to the first configured engine
        return configuredEngines[0].type;
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
    public async translate(
        text: string,
        targetLang = 'zh-CN',
        sourceLang = 'en',
    ): Promise<string> {
        // 预处理文本 - 处理多行文本
        // Preprocess text - handle multi-line text
        text = this.preprocessMultilineText(text);

        // 智能选择翻译引擎 / Intelligently select translation engine
        const actualEngineType = this.selectTranslationEngine(this.conf.engineType);

        // 生成缓存键并尝试从缓存获取结果
        // Generate cache key and try to get result from cache
        const cacheKey = this.generateCacheKey(text, targetLang, sourceLang, actualEngineType);
        const cachedResult = this.getFromCache(cacheKey);

        // 如果缓存命中，直接返回缓存结果
        // If cache hit, return cached result directly
        if (cachedResult !== null) {
            return cachedResult;
        }

        // 创建翻译引擎实例
        const engine = createTranslationEngine(actualEngineType, this.conf);

        // 执行翻译
        // Perform translation
        const options: TranslationOptions = {
            from: sourceLang,
            to: targetLang,
            cache: true,
            timeout: 10000 // 10秒超时
        };

        const result = await engine.translate(text, options);

        // 存入缓存
        // Store in cache
        this.storeInCache(cacheKey, result.text);

        if (result.text && this.conf.engineType === ENGINE_TYPES.AUTO) {
            return engine.icon + ' ' + result.text;
        }
        return result.text;
    }
}
