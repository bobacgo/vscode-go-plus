const path = require('path');
const { runTests } = require('vscode-test');

/**
 * 主入口函数 Main entry point for VSCode integration tests
 * @async
 */
async function main() {
  try {
    // 测试插件的根目录 Root directory of the extension
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    
    // 测试文件所在目录 Directory containing the test files
    const extensionTestsPath = path.resolve(__dirname, './integration/index');

    // 启动测试 Launch tests
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ['--disable-extensions'] // 禁用其他扩展以避免干扰 Disable other extensions to avoid interference
    });
  } catch (err) {
    console.error('测试运行失败 Failed to run tests:', err);
    process.exit(1);
  }
}

main();
