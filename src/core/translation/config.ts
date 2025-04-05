import * as vscode from 'vscode';
import { TranslationService } from './service';

/**
 * 翻译配置管理类
 * Translation configuration management class
 */
export class TranslationConfig {
    // 默认翻译引擎
    // Default translation engine
    public static readonly DEFAULT_ENGINE = TranslationService.ENGINE_TYPES.BUILT_IN;
    
    // 默认源语言
    // Default source language
    public static readonly DEFAULT_SOURCE_LANG = 'en';
    
    // 默认目标语言
    // Default target language
    public static readonly DEFAULT_TARGET_LANG = 'zh-CN';
    
    // 启用注释双语对照
    // Enable bilingual comment translation
    public static readonly DEFAULT_ENABLE_BILINGUAL_COMMENTS = true;
    
    /**
     * 获取翻译配置
     * Get translation configuration
     * 
     * @returns 翻译配置 Translation configuration
     */
    public static getConfig(): {
        engineType: string;
        sourceLang: string;
        targetLang: string;
        autoDetect: boolean;
        enableBilingualComments: boolean;
        apiKeys: {
            microsoftApiKey: string;
            googleApiKey: string;
            baiduAppId: string;
            baiduSecretKey: string;
            aliyunAccessKeyId: string;
            aliyunAccessKeySecret: string;
        }
    } {
        const config = vscode.workspace.getConfiguration('goAssist.translation');
        
        return {
            engineType: config.get('engineType', this.DEFAULT_ENGINE),
            sourceLang: config.get('sourceLanguage', this.DEFAULT_SOURCE_LANG),
            targetLang: config.get('targetLanguage', this.DEFAULT_TARGET_LANG),
            autoDetect: config.get('autoDetectLanguage', true),
            enableBilingualComments: config.get('enableBilingualComments', this.DEFAULT_ENABLE_BILINGUAL_COMMENTS),
            apiKeys: {
                microsoftApiKey: config.get('microsoftApiKey', ''),
                googleApiKey: config.get('googleApiKey', ''),
                baiduAppId: config.get('baiduAppId', ''),
                baiduSecretKey: config.get('baiduSecretKey', ''),
                aliyunAccessKeyId: config.get('aliyunAccessKeyId', ''),
                aliyunAccessKeySecret: config.get('aliyunAccessKeySecret', ''),
            }
        };
    }
    
    /**
     * 更新翻译配置
     * Update translation configuration
     * 
     * @param config 配置项 Configuration item
     * @param value 配置值 Configuration value
     */
    public static async updateConfig(config: string, value: any): Promise<void> {
        await vscode.workspace.getConfiguration('goAssist.translation').update(config, value, vscode.ConfigurationTarget.Global);
    }
}
