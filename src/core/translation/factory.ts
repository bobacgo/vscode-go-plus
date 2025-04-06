import { TranslationEngine } from './engine';
import { MicrosoftTranslationEngine } from './engines/microsoft';
import { GoogleTranslationEngine } from './engines/google';
import { BaiduTranslationEngine } from './engines/baidu';
import { AliyunTranslationEngine } from './engines/aliyun';
import { VolcengineTranslationEngine } from './engines/volcengine';
import { TencentTranslationEngine } from './engines/tencent';

export function createEngine(engineType: string, options: any): TranslationEngine {
    switch (engineType) {
        case 'microsoft':
            return new MicrosoftTranslationEngine(options.microsoftApiKey);
        case 'google':
            return new GoogleTranslationEngine(options.googleApiKey);
        case 'baidu':
            return new BaiduTranslationEngine(options.baiduAppId, options.baiduSecretKey);
        case 'aliyun':
            return new AliyunTranslationEngine(options.aliyunAccessKeyId, options.aliyunAccessKeySecret);
        case 'volcengine':
            return new VolcengineTranslationEngine(options.volcengineAccessKeyId, options.volcengineSecretAccessKey);
        case 'tencent':
            return new TencentTranslationEngine(options.tencentSecretId, options.tencentSecretKey);
        default:
            throw new Error(`Unknown translation engine type: ${engineType}`);
    }
}