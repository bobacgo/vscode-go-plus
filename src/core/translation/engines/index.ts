/**
 * Translation engines index file.
 * 翻译引擎索引文件。
 */
import { MicrosoftTranslationEngine } from './microsoft';
import { GoogleTranslationEngine } from './google';
import { VolcengineTranslationEngine } from './volcengine';
import { TencentTranslationEngine } from './tencent';

export {
    MicrosoftTranslationEngine,
    GoogleTranslationEngine,
    VolcengineTranslationEngine,
    TencentTranslationEngine
};

/**
 * Translation engine types enumeration.
 * 翻译引擎类型枚举。
 */
export const ENGINE_TYPES = {
    MICROSOFT: 'microsoft',
    GOOGLE: 'google',
    VOLCENGINE: 'volcengine',
    TENCENT: 'tencent',
    AUTO: 'auto'  // 自动选择引擎类型 / Auto select engine type
};

/**
 * Translation engine factory configuration interface.
 * 翻译引擎工厂配置接口。
 */
export interface TranslationEngineConfig {
    microsoftApiKey?: string;
    googleApiKey?: string;
    volcengineAccessKeyId?: string;
    volcengineSecretAccessKey?: string;
    tencentSecretId?: string;
    tencentSecretKey?: string;
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
        case ENGINE_TYPES.VOLCENGINE:
            return new VolcengineTranslationEngine(config.volcengineAccessKeyId, config.volcengineSecretAccessKey);
        default:
            return new TencentTranslationEngine(config.tencentSecretId, config.tencentSecretKey);
    }
}
