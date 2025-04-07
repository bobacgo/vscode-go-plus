import { exec, execSync } from 'child_process';
import { Logger } from '../../pkg/logger';
import { SplitMultipleJson } from '../../pkg/parser';
import * as fs from 'fs';
import * as path from 'path';

import * as vscode from 'vscode';
import { WasmExecutor, GoWasmFunction } from '../../pkg/wasm';
import { DependencyCmdInfo } from './dependencies';


const logger = Logger.withContext('library/mod');

// Interface representing module information.
// 表示模块信息的接口。
// go list -m -json
export interface ModCmdInfo {
    /*
        {
            "Path": "github.com/bobacgo/kit",
            "Main": true,
            "Dir": "/Users/lanjin/Documents/work/code/kit",
            "GoMod": "/Users/lanjin/Documents/work/code/kit/go.mod",
            "GoVersion": "1.24.0"
        }
    */
    Path: string; // Module path 模块路径
    Main: boolean; // Indicates if it's the main module 是否是主模块
    Dir: string; // Directory of the module 模块所在目录
    GoMod: string; // Path to the go.mod file go.mod 文件路径
    GoVersion: string; // Go version used by the module 模块使用的 Go 版本
    FileInfo: ModFileInfo; // Module file information 模块文件信息
}

export interface ModSimpleInfo {
    Module: string; // Module name 模块名称
    Version: string; // Module version 模块版本
    Indirect: boolean; // Indicates if it's an indirect dependency 是否是间接依赖
}

// 解析 go.mod 文件的信息
export interface ModFileInfo {
    Module: string; // Module name 模块名称
    Go: string; // Go version used by the module 模块使用的 Go 版本
    Toolchain: string; // toolchain go1.21
    Require: ModSimpleInfo[]; // Required modules 依赖的模块
    Replace: ModSimpleInfo[]; // Replaced modules 替换的模块
    Exclude: ModSimpleInfo[]; // Excluded modules 排除的模块
    Tool: ModSimpleInfo[]; // Tool used for the module 模块使用的工具
}

export const enum ModType {
    /**
     * SDK - highest priority
     * SDK - 最高优先级
     */
    SDK = 'sdk',
    /**
     * Require - high priority
     * 直接依赖 - 高优先级
     */
    Require = 'require',
    /**
     * Replace - medium priority
     * 替换的依赖 - 中优先级
     */
    Replace = 'replace',
    /**
     * Tool - medium-low priority
     * 工具依赖 - 中低优先级
     */
    Tool = 'tool',
    /**
     * Exclude - low priority
     * 排除的依赖 - 低优先级
     */
    Exclude = 'exclude',
    /**
     * Indirect - lowest priority
     * 间接依赖 - 最低优先级
     */
    Indirect = 'indirect'
}

/**
 * Get the weight of a ModType for priority comparison
 * 获取ModType的权重用于优先级比较
 *
 * @param type The ModType to get weight for
 * @returns The weight value (higher means higher priority)
 */
export function getModTypeWeight(type: ModType): number {
    switch (type) {
    case ModType.SDK: return 100;
    case ModType.Require: return 80;
    case ModType.Replace: return 60;
    case ModType.Tool: return 40;
    case ModType.Exclude: return 20;
    case ModType.Indirect: return 0;
    default: return 0;
    }
}
export class GoModule {

    private command = 'go list -m -json';

    private commandModPath = 'go list -f "{{.Module.GoMod}}"';

    private workingDir: string; // Working directory 工作目录

    private ctx : vscode.ExtensionContext;

    constructor(ctx: vscode.ExtensionContext, workingDir: string) {
        this.ctx = ctx;
        this.workingDir = workingDir;
    }

    public async execute(): Promise<ModCmdInfo[]> {
        return new Promise<ModCmdInfo[]>((resolve) => {
            exec(this.command, { cwd: this.workingDir }, async (error, stdout, stderr) => {
                if (error) {
                    logger.error(`执行命令失败: ${error.message}`);
                    resolve([]);
                    return;
                }

                if (stderr) {
                    logger.error(`命令错误输出: ${stderr}`);
                    resolve([]);
                    return;
                }

                if (!stdout) {
                    logger.warn(`${this.command} 命令没有输出`);
                    resolve([]);
                    return;
                }

                try {
                    // go list -m -json 的输出是多个JSON对象连接在一起，而不是一个数组
                    // 需要先分割成单独的JSON字符串，然后逐个解析
                    const jsonObjects = SplitMultipleJson(stdout);

                    // 创建解析任务数组
                    // Create array of parsing tasks
                    const parsePromises = jsonObjects.map(async (jsonStr) => {
                        try {
                            const modCmdInfo = JSON.parse(jsonStr) as ModCmdInfo;

                            // 解析 go.mod 文件
                            modCmdInfo.FileInfo = await this.parserModFile(modCmdInfo.GoMod);
                            return modCmdInfo;
                        } catch (err) {
                            logger.error('解析模块JSON错误:', err);
                            return null;
                        }
                    });

                    // 等待所有解析任务完成
                    // Wait for all parsing tasks to complete
                    const moduleInfos = (await Promise.all(parsePromises)).filter(mod => mod !== null);

                    logger.debug(`成功获取 ${moduleInfos.length} 个模块信息`);

                    resolve(moduleInfos);
                } catch (parseError) {
                    logger.error(`解析${this.command}输出错误: ${parseError}`);
                    resolve([]);
                }
            });
        });
    }

    /**
     * Get the go.mod path for a given Go file
     * 根据Go文件路径获取对应的go.mod文件路径
     *
     * @param goFilePath The path to the Go file
     * @returns Promise with the path to go.mod file or empty string if not found
     */
    public executeGoMod(goFilePath: string): string {
        try {
            // Get directory of the Go file
            // 获取Go文件所在目录
            const fileDir = path.dirname(goFilePath);

            // Execute the command synchronously
            // 同步执行命令
            const goModPath = execSync(this.commandModPath, {
                cwd: fileDir,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe']
            }).toString().trim();

            if (goModPath) {
                logger.debug(`找到go.mod路径: ${goModPath}`);
                return goModPath;
            } else {
                logger.warn(`无法找到文件 ${goFilePath} 对应的go.mod`);
                return '';
            }
        } catch (error) {
            logger.error(`获取go.mod路径失败: ${error}`);
            return '';
        }
    }

    public async parserModFile(goMod: string): Promise<ModFileInfo> {
        try {

            // Read file content and call the function
            // 读取文件内容并调用函数
            const content = fs.readFileSync(goMod, 'utf8');
            const result = await this.callGoFunction(this.ctx, content);

            // 检查是否为有效JSON
            // Check if it's valid JSON
            if (!result || result.trim() === '') {
                throw new Error('返回结果为空');
            }

            // 解析 JSON
            const rawData = JSON.parse(result);

            // 处理字段名大小写不一致的问题
            // Handle case inconsistency issues between field names
            const fileInfo: ModFileInfo = {
                Module: rawData.module || rawData.Module || '',
                Go: rawData.go || rawData.Go || '',
                Toolchain: rawData.toolchain || rawData.Toolchain || '',
                Require: this.normalizeArray(rawData.require || rawData.Require),
                Replace: this.normalizeArray(rawData.replace || rawData.Replace),
                Exclude: this.normalizeArray(rawData.exclude || rawData.Exclude),
                Tool: this.normalizeArray(rawData.tool || rawData.Tool)
            };
            return fileInfo;
        } catch (error) {
            logger.error(`解析 go.mod 文件失败 ${goMod}: ${error}`);
            return {
                Module: '',
                Go: '',
                Toolchain: '',
                Require: [],
                Replace: [],
                Exclude: [],
                Tool: []
            };
        }
    }

    // 标准化数组格式
    // Normalize array format
    private normalizeArray(arr: any[] | undefined): ModSimpleInfo[] {
        if (!arr || !Array.isArray(arr)) {
            return [];
        }

        return arr.map(item => ({
            Module: item.path || item.Path || '',
            Version: item.version || item.Version || '',
            Indirect: item.indirect || item.Indirect || false
        }));
    }

    private async callGoFunction(ctx: vscode.ExtensionContext, content: string): Promise<string> {
        try {
            // 使用枚举类型来指定函数名
            // Use enum type to specify function name
            return await WasmExecutor.callFunction<string>(
                ctx,
                GoWasmFunction.ParseModFunc,
                content
            );
        } catch (error) {
            logger.error(`WASM execution failed: ${error}`);
            throw error;
        }
    }
}

export interface ModInfo {
    Dir: string;                // 模块目录
    GoMod: string;              // go.mod 文件路径
    GoVersion: string;          // Go 版本
    Path: string;               // Mudule 完全名称
    Version: string;            // 模块版本
    Type: ModType;              // 是否间接依赖
    Time: string;               // 模块更新时间
    Size?: number;              // 模块大小(字节)
    BelongTos: string[];        // 模块所属
}
