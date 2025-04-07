import * as path from 'path';
import Mocha from 'mocha';
import glob from 'glob';

/**
 * 运行集成测试的入口函数 Entry point for running integration tests
 * @export
 * @returns {Promise<void>}
 */
export function run(): Promise<void> {
    // 创建测试的Mocha实例 Create the mocha test
    const mocha = new Mocha({
        ui: 'tdd',        // 测试风格：tdd (Test-Driven Development) Test style: tdd
        color: true,      // 彩色输出 Colored output
        timeout: 60000    // 超时设置为60秒 Timeout set to 60 seconds
    });

    const testsRoot = path.resolve(__dirname, '.');

    return new Promise<void>((resolve, reject) => {
    // 查找所有测试文件 Find all test files
        glob('**/**.test.js', { cwd: testsRoot }, (err: Error | null, files: string[]) => {
            if (err) {
                return reject(err);
            }

            // 将所有测试文件添加到mocha实例 Add all test files to mocha
            files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

            try {
                // 运行测试 Run the tests
                mocha.run((failures: number) => {
                    if (failures > 0) {
                        reject(new Error(`${failures} 测试失败 tests failed.`));
                    } else {
                        resolve();
                    }
                });
            } catch (err) {
                reject(err);
            }
        });
    });
}
