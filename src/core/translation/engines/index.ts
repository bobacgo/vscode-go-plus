/**
 * Translation engines index file.
 * 翻译引擎索引文件。
 */
import { MicrosoftTranslationEngine } from './microsoft';
import { GoogleTranslationEngine } from './google';
import { AliyunTranslationEngine } from './aliyun';
import { BaiduTranslationEngine } from './baidu';
import { VolcengineTranslationEngine } from './volcengine';

export {
    MicrosoftTranslationEngine,
    GoogleTranslationEngine,
    AliyunTranslationEngine,
    BaiduTranslationEngine,
    VolcengineTranslationEngine,
};

/**
 * Translation engine types enumeration.
 * 翻译引擎类型枚举。
 */
export const ENGINE_TYPES = {
    MICROSOFT: 'microsoft',
    GOOGLE: 'google',
    ALIYUN: 'aliyun',
    BAIDU: 'baidu',
    VOLCENGINE: 'volcengine',
    AUTO: 'auto'  // 自动选择引擎类型 / Auto select engine type
};

/**
 * Translation engine factory configuration interface.
 * 翻译引擎工厂配置接口。
 */
export interface TranslationEngineConfig {
    microsoftApiKey?: string;
    googleApiKey?: string;
    baiduAppId?: string;
    baiduSecretKey?: string;
    aliyunAccessKeyId?: string;
    aliyunAccessKeySecret?: string;
    volcengineAccessKeyId?: string;
    volcengineSecretAccessKey?: string;
}

/**
 * Creates a translation engine instance based on the specified type and configuration.
 * 根据指定的类型和配置创建翻译引擎实例。
 * 
 * @param type 引擎类型 / Engine type
 * @param config 引擎配置 / Engine configuration
 * @returns 翻译引擎实例 / Translation engine instance
 */
export function createTranslationEngine(type: string, config: TranslationEngineConfig) {
    switch (type) {
        case ENGINE_TYPES.MICROSOFT:
            return new MicrosoftTranslationEngine(config.microsoftApiKey);
        case ENGINE_TYPES.GOOGLE:
            return new GoogleTranslationEngine(config.googleApiKey);
        case ENGINE_TYPES.ALIYUN:
            return new AliyunTranslationEngine(config.aliyunAccessKeyId, config.aliyunAccessKeySecret);
        case ENGINE_TYPES.BAIDU:
            return new BaiduTranslationEngine(config.baiduAppId, config.baiduSecretKey);
        case ENGINE_TYPES.VOLCENGINE:
            return new VolcengineTranslationEngine(config.volcengineAccessKeyId, config.volcengineSecretAccessKey);
        default:
            return new BaiduTranslationEngine(config.baiduAppId, config.baiduSecretKey);
    }
}
