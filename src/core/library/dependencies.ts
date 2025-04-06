import { execSync } from 'child_process';
import { SplitMultipleJson } from "../../pkg/parser";
import { Logger } from '../../pkg/logger';

const logger = Logger.withContext('library/mod');


// 定义一个 TypeScript 接口来映射 Go 模块信息
// Define a TypeScript interface to map Go module information
// go list -m -json all
export interface DependencyCmdInfo {
    /*
        {
                "Path": "github.com/pkg/errors",
                "Version": "v0.9.1",
                "Time": "2020-01-14T19:47:44Z",
                "Indirect": true,
                "Dir": "/Users/lanjin/go/pkg/mod/github.com/pkg/errors@v0.9.1",
                "GoMod": "/Users/lanjin/go/pkg/mod/cache/download/github.com/pkg/errors/@v/v0.9.1.mod",
                "Sum": "h1:FEBLx1zS214owpjy7qsBeixbURkuhQAwrK5UwLGTwt4=",
                "GoModSum": "h1:bwawxfHBFNV+L2hUp1rHADufV3IMtnDRdf1r5NINEl0="
        }
    */

    Path: string; // 模块路径
    Version: string; // 模块版本
    Time: string; // 模块更新时间
    Indirect: true; // 是否为间接依赖
    Dir: string; // 模块本地目录
    GoMod: string; // 模块的 go.mod 文件路径
    GoVersion: string; // 使用的 Go 版本
    Sum: string; // 校验和
    GoModSum: string; // go.mod 文件的校验和
}

export class Dependencies {

    command: string = 'go list -m -json all'; // 当前工作空间目录所有模块总依赖

    cwd: string; // 工作空间目录

    constructor(workingDir: string) {
        this.cwd = workingDir;
    }

    /**
     * 执行命令
     * Execute command
     * @param cwd 工作目录
     * @returns Promise 包含模块信息的映射，key为包路径
     */
    public async execute(): Promise<DependencyCmdInfo[]> {
        try {
            const stdout = execSync(this.command, { cwd: this.cwd }).toString();
            if (!stdout) {
                logger.warn(`${this.command} 命令没有输出`);
                return;
            }
            const jsonObjects = SplitMultipleJson(stdout);
            return jsonObjects.map((jsonStr) => JSON.parse(jsonStr));
        } catch (error) {
            logger.error(`执行命令失败: ${error}`);
        }
    }
}
