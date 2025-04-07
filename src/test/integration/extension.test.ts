import * as assert from 'assert';
import * as vscode from 'vscode';

// 测试套件 Test suite
suite('Extension Test Suite', () => {
    // 测试运行前的准备 Before all tests
    suiteSetup(async () => {
    // 等待扩展激活 Wait for extension to activate
        await vscode.extensions.getExtension('gopp.gopp')?.activate();
    });

    // 测试用例：扩展是否正确激活 Test: Extension activation
    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('gopp.gopp'));
    });

    // 测试用例：命令是否正确注册 Test: Commands registration
    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('gopp.generateCode'));
        assert.ok(commands.includes('gopp.navigateToInterface'));
        assert.ok(commands.includes('gopp.workspaceNavigator'));
    });
});
