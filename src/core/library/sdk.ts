import { execSync } from 'child_process';
import { Logger } from '../../pkg/logger';
import { ModInfo, ModType } from './mod';

const logger = Logger.withContext('library/sdk');

export class GoSDK {

    private command = 'go env';

    public execute(): ModInfo {
        try {
            const res  = execSync(this.command, { encoding: 'utf-8' });
            if (!res) {
                logger.warn(`${this.command} 命令没有输出`);
                return;
            }
            // Parse go env output and convert to ModInfo object
            // 解析 go env 输出并转换为 ModInfo 对象
            const lines = res.split('\n');
            const env: Record<string, string> = {};

            // 从每行提取键值对，增强匹配模式以支持更多格式
            // Extract key-value pairs from each line with enhanced pattern
            lines.forEach(line => {
                // 匹配标准的 KEY="VALUE" 格式
                const standardMatch = line.match(/^(\w+)="(.+)"$/);
                if (standardMatch) {
                    env[standardMatch[1]] = standardMatch[2];
                    return;
                }

                // 匹配 KEY='VALUE' 格式
                const singleQuoteMatch = line.match(/^(\w+)='(.+)'$/);
                if (singleQuoteMatch) {
                    env[singleQuoteMatch[1]] = singleQuoteMatch[2];
                    return;
                }

                // 匹配无引号的 KEY=VALUE 格式
                const noQuoteMatch = line.match(/^(\w+)=(.+)$/);
                if (noQuoteMatch) {
                    env[noQuoteMatch[1]] = noQuoteMatch[2];
                    return;
                }
            });

            // 去除前缀'go'并构造ModInfo对象
            // Remove 'go' prefix and construct ModInfo object
            return {
                Dir: env.GOROOT,
                GoMod: env.GOMOD,
                GoVersion: env.GOVERSION ? env.GOVERSION.replace(/^go/, '') : '',
                Path: env.GOPATH,
                Version: env.GOVERSION,
                Type: ModType.SDK,
                Time: null,
                BelongTos: []
            };
        } catch (error) {
            logger.error('go env error: ', error);
            return null;
        }
    }
}
