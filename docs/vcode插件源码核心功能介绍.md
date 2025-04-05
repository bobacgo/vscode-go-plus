# VS Code 插件源码核心功能介绍

VS Code 是一个轻量级但功能强大的源代码编辑器，支持通过插件扩展其功能。本文将深入介绍 VS Code 插件开发的核心概念和关键功能，帮助开发者构建高效、实用的插件。

## 插件结构

一个标准的 VS Code 插件通常包含以下文件结构：

```
myExtension/
    ├── .vscode/                  // VS Code 配置文件，包含启动和任务配置
    │   ├── launch.json           // 调试配置
    │   └── tasks.json            // 任务配置
    ├── src/                      // 源代码目录
    │   ├── extension.ts          // 插件入口文件
    │   ├── commands/             // 命令相关代码
    │   ├── providers/            // 各种功能提供器
    │   └── utils/                // 工具函数
    ├── package.json              // 插件的清单文件
    ├── tsconfig.json             // TypeScript 配置
    ├── webpack.config.js         // (可选) Webpack 配置用于打包
    ├── .eslintrc.json            // (可选) ESLint 配置
    ├── CHANGELOG.md              // 更新日志
    ├── README.md                 // 插件说明文档
    └── .vscodeignore             // 发布时忽略的文件
```

## 插件清单 (package.json)

`package.json` 文件是 VS Code 插件的核心配置文件，定义了插件的元数据、激活条件、贡献点等关键信息：

```json
{
    "name": "my-extension",
    "displayName": "My Extension",
    "description": "Detailed extension description",
    "version": "0.0.1",
    "publisher": "publisherName",
    "icon": "images/icon.png",
    "engines": {
        "vscode": "^1.60.0"
    },
    "categories": ["Other", "Programming Languages", "Snippets"],
    "keywords": ["keyword1", "keyword2"],
    "galleryBanner": {
        "color": "#C80000",
        "theme": "dark"
    },
    "activationEvents": [
        "onCommand:my-extension.helloWorld",
        "onLanguage:javascript",
        "onView:myCustomView",
        "workspaceContains:**/.myconfig"
    ],
    "main": "./dist/extension.js",
    "contributes": {
        "commands": [{
            "command": "my-extension.helloWorld",
            "title": "Hello World",
            "category": "My Extension",
            "icon": {
                "light": "images/light-icon.svg",
                "dark": "images/dark-icon.svg"
            }
        }],
        "configuration": {
            "title": "My Extension",
            "properties": {
                "myExtension.enableFeature": {
                    "type": "boolean",
                    "default": false,
                    "description": "Enable special feature"
                }
            }
        },
        "viewsContainers": {
            "activitybar": [{
                "id": "my-extension-view",
                "title": "My Extension",
                "icon": "images/view-icon.svg"
            }]
        },
        "views": {
            "my-extension-view": [{
                "id": "myCustomView",
                "name": "Custom View"
            }]
        },
        "menus": {
            "editor/context": [{
                "command": "my-extension.helloWorld",
                "group": "myGroup"
            }]
        },
        "keybindings": [{
            "command": "my-extension.helloWorld",
            "key": "ctrl+f10",
            "mac": "cmd+f10",
            "when": "editorTextFocus"
        }]
    },
    "scripts": {
        "vscode:prepublish": "npm run package",
        "compile": "webpack",
        "watch": "webpack --watch",
        "package": "webpack --mode production --devtool hidden-source-map",
        "test": "node ./out/test/runTest.js",
        "lint": "eslint src --ext ts"
    },
    "devDependencies": {
        "@types/vscode": "^1.60.0",
        "@types/node": "^14.0.0",
        "@typescript-eslint/eslint-plugin": "^5.0.0",
        "@typescript-eslint/parser": "^5.0.0",
        "eslint": "^8.0.0",
        "typescript": "^4.4.0",
        "webpack": "^5.0.0",
        "webpack-cli": "^4.0.0"
    },
    "dependencies": {
        "axios": "^0.24.0"
    },
    "extensionDependencies": [
        "vscode.git"
    ],
    "repository": {
        "type": "git",
        "url": "https://github.com/username/my-extension.git"
    }
}
```

## 插件生命周期

VS Code 插件生命周期主要由激活和停用两个阶段组成：

```typescript
// 插件激活时调用
// Called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
    console.log('插件已激活，版本:', context.extension.packageJSON.version);
    
    // 访问扩展内的资源
    // Access extension resources
    const resourcePath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'config.json');
    
    // 获取存储路径
    // Get storage paths
    const workspaceStoragePath = context.storageUri?.fsPath; // 工作区存储路径
    const globalStoragePath = context.globalStorageUri.fsPath; // 全局存储路径
    
    // 注册命令
    // Register a command
    let disposable = vscode.commands.registerCommand('my-extension.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World!');
    });
    
    // 添加到订阅列表，以便正确清理
    // Add to subscriptions for proper cleanup
    context.subscriptions.push(disposable);
    
    // 可以在此初始化各种服务和提供器
    // Initialize services and providers here
    registerProviders(context);
    setupStatusBar(context);
    initializeWebviewPanel(context);
    
    // 返回公共API（可选）
    // Return public API (optional)
    return {
        executeCustomFunction: () => {
            // 实现公共API功能
            // Implement public API functionality
        }
    };
}

// 插件停用时调用
// Called when your extension is deactivated
export function deactivate() {
    console.log('插件停用，正在清理资源...');
    
    // 清理不在 subscriptions 中的资源
    // Clean up resources not in subscriptions
    cleanupCustomResources();
    
    // 返回Promise以支持异步清理
    // Return Promise to support async cleanup
    return new Promise<void>((resolve) => {
        setTimeout(() => {
            console.log('异步清理完成');
            resolve();
        }, 1000);
    });
}
```

## 核心 API 功能

### 1. 命令 (Commands)

命令是 VS Code 扩展的基础机制，用于执行特定功能：

```typescript
// 注册简单命令
// Register a simple command
const disposable1 = vscode.commands.registerCommand('extension.simpleCommand', () => {
    vscode.window.showInformationMessage('简单命令执行');
});

// 注册带参数的命令
// Register a command with parameters
const disposable2 = vscode.commands.registerCommand('extension.paramCommand', (uri: vscode.Uri, selections: readonly vscode.Selection[]) => {
    console.log(`命令在 ${uri.fsPath} 上执行，选中了 ${selections.length} 个区域`);
});

// 注册文本编辑器命令 (仅在编辑器活动时可用)
// Register a text editor command (only available when editor is active)
const disposable3 = vscode.commands.registerTextEditorCommand('extension.editorCommand', 
    (textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) => {
        // 直接操作编辑器
        // Directly manipulate the editor
        edit.insert(new vscode.Position(0, 0), 'Hello Editor!');
    }
);

// 执行内置命令
// Execute built-in commands
await vscode.commands.executeCommand('workbench.action.openSettings');

// 执行命令并获取结果
// Execute commands and get results
const result = await vscode.commands.executeCommand<string>('extension.commandWithReturn');
console.log(result); // 输出命令返回值

// 检查命令是否注册
// Check if a command is registered
const commandExists = await vscode.commands.getCommands().then(cmds => cmds.includes('myCommand'));
```

### 2. 用户界面 API

VS Code 提供了丰富的用户界面 API 用于展示信息和获取用户输入：

```typescript
// 基础通知
// Basic notifications
vscode.window.showInformationMessage('信息通知');
vscode.window.showWarningMessage('警告通知');
vscode.window.showErrorMessage('错误通知');

// 带按钮的通知
// Notifications with buttons
const choice = await vscode.window.showInformationMessage(
    '是否继续操作？', 
    { modal: true }, // 设置为模态对话框
    '是', '否', '取消'
);

if (choice === '是') {
    // 用户点击了"是"
    // User clicked "Yes"
}

// 长时间操作的进度提示
// Progress indication for long-running operations
await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification, // 或 ProgressLocation.Window
    title: '正在处理...',
    cancellable: true
}, async (progress, token) => {
    // 监听取消事件
    // Listen for cancellation
    token.onCancellationRequested(() => {
        console.log('用户取消了操作');
    });
    
    // 更新进度
    // Update progress
    progress.report({ increment: 0, message: '初始化...' });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    progress.report({ increment: 50, message: '处理中...' });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    progress.report({ increment: 50, message: '完成' });
});

// 输入框
// Input box
const input = await vscode.window.showInputBox({
    prompt: '请输入您的姓名',
    placeHolder: '姓名',
    value: '默认值',
    password: false, // 是否隐藏输入内容
    ignoreFocusOut: true, // 失去焦点时不关闭
    validateInput: (text) => {
        return text.length < 3 ? '姓名至少需要3个字符' : null;
    }
});

// 文件选择对话框
// File selection dialog
const fileUri = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: {
        'Images': ['png', 'jpg'],
        'All files': ['*']
    },
    title: '选择一张图片'
});

// 保存对话框
// Save dialog
const saveUri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file('/path/to/default/location.txt'),
    filters: {
        'Text files': ['txt'],
        'All files': ['*']
    },
    title: '保存文件'
});

// 快速选择
// Quick pick
const selection = await vscode.window.showQuickPick(
    ['选项1', '选项2', '选项3'],
    {
        placeHolder: '请选择一个选项',
        ignoreFocusOut: true,
        matchOnDescription: true,
        matchOnDetail: true,
        canPickMany: false // 设置为true允许多选
    }
);

// 带详细信息的快速选择
// Quick pick with details
const detailedSelection = await vscode.window.showQuickPick(
    [
        {
            label: '$(star) 选项1',  // 支持图标
            description: '这是第一个选项',
            detail: '选项1的详细说明内容'
        },
        {
            label: '$(heart) 选项2',
            description: '这是第二个选项',
            detail: '选项2的详细说明内容'
        }
    ],
    { placeHolder: '带详情的选择' }
);

// 状态栏项目
// Status bar item
const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left, // 对齐方式
    100 // 优先级，数字越大越靠右
);
statusBarItem.text = "$(star) 状态信息";
statusBarItem.tooltip = "这是一个状态栏项目";
statusBarItem.command = "extension.statusBarCommand";
statusBarItem.show();

// 创建输出通道
// Create output channel
const outputChannel = vscode.window.createOutputChannel("我的扩展");
outputChannel.appendLine("这是一条日志");
outputChannel.show();

// 创建Webview面板
// Create webview panel
const panel = vscode.window.createWebviewPanel(
    'myWebview', // 标识
    '网页视图', // 标题
    vscode.ViewColumn.One, // 显示位置
    {
        enableScripts: true, // 启用脚本
        retainContextWhenHidden: true // 隐藏时保留内容
    }
);
panel.webview.html = `
    <!DOCTYPE html>
    <html>
        <head>
            <meta charset="UTF-8">
            <title>自定义Webview</title>
        </head>
        <body>
            <h1>Hello from Webview!</h1>
            <script>
                // 向扩展发送消息
                // Send message to extension
                const vscode = acquireVsCodeApi();
                vscode.postMessage({ command: 'hello' });
            </script>
        </body>
    </html>
`;
// 接收Webview消息
// Receive webview messages
panel.webview.onDidReceiveMessage(message => {
    console.log('收到Webview消息:', message);
});
```

### 3. 工作区 API

工作区 API 允许访问和操作文件、编辑器和文档：

```typescript
// 获取当前打开的编辑器
// Get the currently opened editor
const editor = vscode.window.activeTextEditor;
if (editor) {
    const document = editor.document;
    const selection = editor.selection;
    const selectedText = document.getText(selection);
    
    // 获取文档内容
    // Get document content
    const fullText = document.getText();
    const lineText = document.lineAt(0).text;
    
    // 获取文档语言和URI
    // Get document language and URI
    const language = document.languageId;
    const uri = document.uri;
    
    // 检查是否是未保存文件
    // Check if unsaved file
    const isUntitled = document.isUntitled;
    
    // 获取选择的单词
    // Get selected word
    const wordRange = document.getWordRangeAtPosition(selection.active);
    const word = wordRange ? document.getText(wordRange) : '';
    
    // 执行编辑操作
    // Perform edit operations
    editor.edit(editBuilder => {
        // 插入文本
        // Insert text
        editBuilder.insert(new vscode.Position(0, 0), '插入的文本');
        
        // 替换文本
        // Replace text
        editBuilder.replace(
            new vscode.Range(0, 0, 0, 10),
            '替换的内容'
        );
        
        // 删除文本
        // Delete text
        editBuilder.delete(new vscode.Range(1, 0, 2, 0));
    });
    
    // 编辑器装饰器
    // Editor decorations
    const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 0, 0, 0.3)',
        border: '1px solid red',
        borderRadius: '3px'
    });
    
    editor.setDecorations(decorationType, [
        new vscode.Range(0, 0, 0, 10)
    ]);
    
    // 设置选择
    // Set selection
    editor.selections = [new vscode.Selection(0, 0, 0, 5)];
    
    // 显示某个位置
    // Reveal a position
    editor.revealRange(
        new vscode.Range(10, 0, 15, 0),
        vscode.TextEditorRevealType.InCenter
    );
}

// 打开文档
// Open a document
const document = await vscode.workspace.openTextDocument(vscode.Uri.file('/path/to/file.txt'));
vscode.window.showTextDocument(document);

// 创建新文档
// Create a new document
const newDocument = await vscode.workspace.openTextDocument({
    language: 'javascript',
    content: 'console.log("Hello World");'
});
vscode.window.showTextDocument(newDocument);

// 保存文档
// Save document
await document.save();

// 读取工作区文件
// Read workspace files
const files = await vscode.workspace.findFiles('**/*.js', '**/node_modules/**');
for (const file of files) {
    console.log(file.fsPath);
}

// 读取文件内容
// Read file content
const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file('/path/to/file.txt'));
const text = new TextDecoder().decode(fileContent);

// 写入文件内容
// Write file content
const encoder = new TextEncoder();
await vscode.workspace.fs.writeFile(
    vscode.Uri.file('/path/to/newfile.txt'), 
    encoder.encode('Hello World')
);

// 文件系统监视
// File system watcher
const watcher = vscode.workspace.createFileSystemWatcher('**/*.js');
watcher.onDidChange(uri => console.log(`文件更改: ${uri.fsPath}`));
watcher.onDidCreate(uri => console.log(`文件创建: ${uri.fsPath}`));
watcher.onDidDelete(uri => console.log(`文件删除: ${uri.fsPath}`));
```

### 4. 配置 API

VS Code 配置 API 允许读取和更新用户和工作区设置：

```typescript
// 读取插件配置
// Read extension configuration
const config = vscode.workspace.getConfiguration('myExtension');
const enableFeature = config.get<boolean>('enableFeature', false);
const serverUrl = config.get<string>('serverUrl', 'https://default.com');
const maxItems = config.get<number>('maxItems', 10);
const complexObject = config.get<object>('complexSetting', { key: 'value' });

// 检查配置是否存在
// Check if configuration exists
const hasConfig = config.has('specificSetting');

// 检查是否有特定作用域的设置
// Check if there's a setting in a specific scope
const hasUserSetting = config.inspect('enableFeature')?.globalValue !== undefined;
const hasWorkspaceSetting = config.inspect('enableFeature')?.workspaceValue !== undefined;

// 更新全局设置
// Update global settings
await config.update('enableFeature', true, vscode.ConfigurationTarget.Global);

// 更新工作区设置
// Update workspace settings
await config.update('maxItems', 20, vscode.ConfigurationTarget.Workspace);

// 更新工作区文件夹设置
// Update workspace folder settings
await config.update('serverUrl', 'https://new.com', vscode.ConfigurationTarget.WorkspaceFolder);

// 重置设置（删除用户定义的值）
// Reset setting (remove user-defined value)
await config.update('maxItems', undefined, vscode.ConfigurationTarget.Global);

// 监听配置变化
// Listen for configuration changes
vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('myExtension.enableFeature')) {
        console.log('enableFeature设置已更改');
        // 重新加载设置
        // Reload settings
        const newValue = vscode.workspace.getConfiguration('myExtension').get('enableFeature');
        console.log('新值:', newValue);
    }
});
```

### 5. 语言功能 API

语言功能 API 允许增强编辑器对特定语言的支持：

```typescript
// 代码补全提供器
// Completion provider
const completionProvider = vscode.languages.registerCompletionItemProvider(
    ['javascript', 'typescript'], // 支持的语言
    {
        provideCompletionItems(document, position, token, context) {
            // 创建基本补全项
            // Create basic completion item
            const simpleItem = new vscode.CompletionItem('console.log', vscode.CompletionItemKind.Method);
            simpleItem.detail = '日志输出';
            simpleItem.documentation = new vscode.MarkdownString('输出信息到控制台');
            
            // 创建带代码片段的补全项
            // Create completion item with snippet
            const snippetItem = new vscode.CompletionItem('forloop', vscode.CompletionItemKind.Snippet);
            snippetItem.insertText = new vscode.SnippetString('for (let ${1:i} = 0; ${1:i} < ${2:array}.length; ${1:i}++) {\n\t${0}\n}');
            snippetItem.documentation = new vscode.MarkdownString('For循环代码片段');
            
            // 创建带排序的补全项
            // Create completion item with sorting
            const sortedItem = new vscode.CompletionItem('important', vscode.CompletionItemKind.Keyword);
            sortedItem.sortText = '0'; // 低字母顺序字符串会排在前面
            
            // 创建带命令的补全项
            // Create completion item with command
            const commandItem = new vscode.CompletionItem('runCommand', vscode.CompletionItemKind.Event);
            commandItem.command = {
                command: 'extension.helloWorld',
                title: '运行命令'
            };
            
            return [simpleItem, snippetItem, sortedItem, commandItem];
        }
    },
    '.' // 触发字符
);

// 悬停提示提供器
// Hover provider
const hoverProvider = vscode.languages.registerHoverProvider('javascript', {
    provideHover(document, position, token) {
        const range = document.getWordRangeAtPosition(position);
        const word = document.getText(range);
        
        if (word === 'console') {
            return new vscode.Hover([
                '**控制台对象**',
                '用于在开发者工具中显示内容的对象',
                '```javascript',
                'console.log("Hello World")',
                '```'
            ]);
        }
    }
});

// 定义提供器
// Definition provider
const definitionProvider = vscode.languages.registerDefinitionProvider('javascript', {
    provideDefinition(document, position, token) {
        const wordRange = document.getWordRangeAtPosition(position);
        const word = document.getText(wordRange);
        
        if (word === 'myFunction') {
            // 返回模拟的定义位置
            // Return a mock definition location
            return new vscode.Location(
                document.uri,
                new vscode.Position(10, 0)
            );
        }
    }
});

// 代码操作提供器
// Code action provider
const codeActionProvider = vscode.languages.registerCodeActionsProvider('javascript', {
    provideCodeActions(document, range, context, token) {
        const actions = [];
        
        // 针对特定诊断信息提供修复
        // Provide fixes for specific diagnostics
        for (const diagnostic of context.diagnostics) {
            if (diagnostic.message.includes('未使用的变量')) {
                const action = new vscode.CodeAction('删除未使用的变量', vscode.CodeActionKind.QuickFix);
                action.edit = new vscode.WorkspaceEdit();
                action.edit.delete(document.uri, diagnostic.range);
                actions.push(action);
            }
        }
        
        // 添加重构操作
        // Add refactoring action
        const extractAction = new vscode.CodeAction('提取为函数', vscode.CodeActionKind.Refactor);
        extractAction.command = {
            command: 'extension.extractFunction',
            title: '提取为函数',
            arguments: [document, range]
        };
        actions.push(extractAction);
        
        return actions;
    }
});

// 文档符号提供器
// Document symbol provider
const symbolProvider = vscode.languages.registerDocumentSymbolProvider('javascript', {
    provideDocumentSymbols(document, token) {
        const symbols = [];
        
        // 模拟添加一些符号
        // Mock adding some symbols
        symbols.push(new vscode.DocumentSymbol(
            'MyClass',
            '类说明',
            vscode.SymbolKind.Class,
            new vscode.Range(0, 0, 10, 0),
            new vscode.Range(0, 0, 0, 10)
        ));
        
        // 添加子符号
        // Add child symbols
        symbols[0].children.push(new vscode.DocumentSymbol(
            'myMethod',
            '方法说明',
            vscode.SymbolKind.Method,
            new vscode.Range(2, 4, 5, 4),
            new vscode.Range(2, 4, 2, 12)
        ));
        
        return symbols;
    }
});

// 语义标记提供器
// Semantic token provider
const tokenTypes = ['class', 'function', 'variable'];
const tokenModifiers = ['declaration', 'readonly', 'async'];

const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);

const semanticTokensProvider = vscode.languages.registerDocumentSemanticTokensProvider('javascript', {
    provideDocumentSemanticTokens(document, token) {
        const builder = new vscode.SemanticTokensBuilder(legend);
        
        // 为特定单词添加语义标记
        // Add semantic tokens for specific words
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            if (line.text.includes('class')) {
                const index = line.text.indexOf('class');
                builder.push(i, index, 5, 0, 0); // 类声明
            }
        }
        
        return builder.build();
    }
}, legend);

// 代码格式化提供器
// Formatting provider
const formattingProvider = vscode.languages.registerDocumentFormattingEditProvider('javascript', {
    provideDocumentFormattingEdits(document, options, token) {
        const edits = [];
        
        // 示例：将每行缩进设置为4个空格
        // Example: Set indentation to 4 spaces for each line
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            if (line.text.startsWith('  ')) { // 检测2空格缩进
                edits.push(vscode.TextEdit.replace(
                    new vscode.Range(i, 0, i, 2),
                    '    ' // 替换为4空格缩进
                ));
            }
        }
        
        return edits;
    }
});

// 代码折叠范围提供器
// Folding range provider
const foldingProvider = vscode.languages.registerFoldingRangeProvider('javascript', {
    provideFoldingRanges(document, context, token) {
        const ranges = [];
        
        // 简单示例：为多行注释创建折叠区域
        // Simple example: Create folding regions for multi-line comments
        let commentStart = -1;
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i).text;
            if (line.includes('/*') && commentStart === -1) {
                commentStart = i;
            } else if (line.includes('*/') && commentStart !== -1) {
                ranges.push(new vscode.FoldingRange(commentStart, i, vscode.FoldingRangeKind.Comment));
                commentStart = -1;
            }
        }
        
        return ranges;
    }
});
```

### 6. 调试 API

调试 API 允许创建自定义调试器扩展：

```typescript
// 注册调试适配器工厂
// Register debug adapter factory
const factory = vscode.debug.registerDebugAdapterDescriptorFactory('myDebugger', {
    createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined) {
        // 返回调试适配器的描述信息
        // Return debug adapter descriptor
        return new vscode.DebugAdapterExecutable('path/to/debugAdapter.js', ['--arg1']);
        
        // 或者使用内联实现
        // Or use inline implementation
        // return new vscode.DebugAdapterInlineImplementation(new MyDebugAdapter());
    }
});

// 注册调试配置提供器
// Register debug configuration provider
const configProvider = vscode.debug.registerDebugConfigurationProvider('myDebugger', {
    provideDebugConfigurations(folder: vscode.WorkspaceFolder | undefined, token?: vscode.CancellationToken) {
        return [
            {
                type: 'myDebugger',
                request: 'launch',
                name: '启动我的调试器',
                program: '${file}'
            }
        ];
    },
    
    resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken) {
        // 修改或验证调试配置
        // Modify or validate debug configuration
        if (!config.program) {
            config.program = '${file}';
        }
        return config;
    }
});

// 监听调试事件
// Listen for debug events
vscode.debug.onDidStartDebugSession(session => {
    console.log(`调试会话已启动: ${session.name}`);
});

vscode.debug.onDidTerminateDebugSession(session => {
    console.log(`调试会话已终止: ${session.name}`);
});

// 编程方式启动调试会话
// Start debug session programmatically
vscode.debug.startDebugging(
    vscode.workspace.workspaceFolders?.[0], 
    {
        type: 'myDebugger',
        request: 'launch',
        name: '程序化启动的调试会话',
        program: '/path/to/program.js'
    }
);
```

## 调试与发布

### 调试插件

VS Code 提供了强大的插件开发调试功能：

1. 按 F5 启动调试会话，这将打开一个新的 VS Code 窗口（插件开发主机）并加载你的插件
2. 设置断点并检查变量
3. 使用调试控制台执行表达式
4. 在 `launch.json` 中自定义调试配置：

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "运行插件",
            "type": "extensionHost",
            "request": "launch",
            "args": [
                "--extensionDevelopmentPath=${workspaceFolder}"
            ],
            "outFiles": [
                "${workspaceFolder}/dist/**/*.js"
            ],
            "preLaunchTask": "npm: compile",
            "env": {
                "VSCODE_DEBUG_MODE": "true"
            }
        },
        {
            "name": "运行插件测试",
            "type": "extensionHost",
            "request": "launch",
            "args": [
                "--extensionDevelopmentPath=${workspaceFolder}",
                "--extensionTestsPath=${workspaceFolder}/out/test/suite/index"
            ],
            "outFiles": [
                "${workspaceFolder}/out/**/*.js"
            ],
            "preLaunchTask": "npm: test-compile"
        }
    ]
}
```

### 打包与发布

使用 VS Code 扩展打包工具 (vsce) 打包和发布插件：

```bash
# 安装vsce
npm install -g @vscode/vsce

# 创建VSIX包
vsce package

# 发布到市场（需要Personal Access Token）
vsce publish

# 指定版本发布
vsce publish minor  # 增加次要版本
vsce publish major  # 增加主要版本
vsce publish patch  # 增加补丁版本

# 发布到特定目标
vsce publish --target win32-x64
```

#### VSIX 包相关操作

```bash
# 从VSIX安装插件
code --install-extension my-extension.vsix

# 检查VSIX包内容
vsce ls my-extension.vsix
```

#### 配置发布信息

在 `package.json` 中添加额外的发布相关信息：

```json
{
    "repository": {
        "type": "git",
        "url": "https://github.com/username/repository.git"
    },
    "bugs": {
        "url": "https://github.com/username/repository/issues"
    },
    "homepage": "https://github.com/username/repository#readme",
    "license": "MIT",
    "qna": "marketplace", // 或指向自定义URL
    "badges": [
        {
            "url": "https://img.shields.io/
            badge/version/v1.0.0-blue",
                        "href": "https://github.com/username/repository",
                        "description": "版本"
                    },
                    {
                        "url": "https://img.shields.io/badge/license-MIT-green",
                        "href": "https://github.com/username/repository/blob/master/LICENSE",
                        "description": "许可"
                    }
                ],
                "extensionDependencies": [
                    "publisher.required-extension"
                ],
                "extensionPack": [
                    "publisher.recommended-extension"
                ],
                "markdown": "github", // 或 "standard"
                "galleryBanner": {
                    "color": "#C80000",
                    "theme": "dark"
                }
            }
            ```

            ## 高级功能

            ### WebView API

            WebView API 允许创建自定义 UI，完全使用 HTML/CSS/JavaScript：

            ```typescript
            // 创建并显示WebView面板
            // Create and show WebView panel
            function createWebViewPanel(context: vscode.ExtensionContext) {
                const panel = vscode.window.createWebviewPanel(
                    'myWebView',           // 唯一ID
                    '我的WebView',          // 显示的标题
                    vscode.ViewColumn.One, // 显示在哪一列
                    {
                        enableScripts: true,                // 启用JavaScript
                        retainContextWhenHidden: true,      // 隐藏时保留内容
                        localResourceRoots: [               // 允许加载的本地资源
                            vscode.Uri.joinPath(context.extensionUri, 'media')
                        ]
                    }
                );
                
                // 设置HTML内容
                // Set HTML content
                panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);
                
                // 处理来自WebView的消息
                // Handle messages from WebView
                panel.webview.onDidReceiveMessage(
                    message => {
                        switch (message.command) {
                            case 'alert':
                                vscode.window.showInformationMessage(message.text);
                                return;
                            case 'getData':
                                // 向WebView发送数据
                                // Send data to WebView
                                panel.webview.postMessage({ command: 'dataResponse', data: [1, 2, 3] });
                                return;
                        }
                    },
                    undefined,
                    context.subscriptions
                );
                
                // 处理面板关闭事件
                // Handle panel close event
                panel.onDidDispose(
                    () => {
                        // 清理资源
                        // Clean up resources
                    },
                    null,
                    context.subscriptions
                );
                
                return panel;
            }

            // 获取WebView内容
            // Get WebView content
            function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
                // 创建可在Webview中使用的URI
                // Create URI that can be used in the Webview
                const scriptUri = webview.asWebviewUri(
                    vscode.Uri.joinPath(extensionUri, 'media', 'script.js')
                );
                const styleUri = webview.asWebviewUri(
                    vscode.Uri.joinPath(extensionUri, 'media', 'style.css')
                );
                
                // 使用nonce以提高安全性
                // Use nonce for improved security
                const nonce = getNonce();
                
                return `<!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                    <link href="${styleUri}" rel="stylesheet">
                    <title>我的WebView</title>
                </head>
                <body>
                    <h1>自定义WebView</h1>
                    <button id="alertButton">显示通知</button>
                    <button id="getDataButton">获取数据</button>
                    <div id="dataContainer"></div>
                    
                    <script nonce="${nonce}" src="${scriptUri}"></script>
                </body>
                </html>`;
            }

            // 生成nonce
            // Generate nonce
            function getNonce() {
                let text = '';
                const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                for (let i = 0; i < 32; i++) {
                    text += possible.charAt(Math.floor(Math.random() * possible.length));
                }
                return text;
            }
            ```

            配套的 `script.js` 文件内容：

            ```javascript
            // 获取VS Code API
            // Acquire VS Code API
            const vscode = acquireVsCodeApi();

            // 为按钮添加点击事件
            // Add click event to buttons
            document.getElementById('alertButton').addEventListener('click', () => {
                vscode.postMessage({
                    command: 'alert',
                    text: '这是来自WebView的消息'
                });
            });

            document.getElementById('getDataButton').addEventListener('click', () => {
                vscode.postMessage({
                    command: 'getData'
                });
            });

            // 监听来自扩展的消息
            // Listen for messages from the extension
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'dataResponse':
                        const container = document.getElementById('dataContainer');
                        container.innerHTML = `收到数据: ${JSON.stringify(message.data)}`;
                        break;
                }
            });

            // 状态持久化示例
            // State persistence example
            const previousState = vscode.getState() || { count: 0 };
            let count = previousState.count;

            // 更新状态
            // Update state
            function updateState() {
                vscode.setState({ count: count });
            }
            ```

            ### TreeView API

            TreeView API 允许创建自定义树视图：

            ```typescript
            // 定义树视图数据提供器
            // Define tree view data provider
            class MyTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
                private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | void> = new vscode.EventEmitter<TreeItem | undefined | void>();
                readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event;
                
                private items: TreeItem[] = [];
                
                constructor() {
                    this.refresh();
                }
                
                refresh(): void {
                    // 生成示例数据
                    // Generate example data
                    this.items = [
                        new TreeItem('Group 1', [
                            new TreeItem('Item 1.1'),
                            new TreeItem('Item 1.2'),
                        ]),
                        new TreeItem('Group 2', [
                            new TreeItem('Item 2.1'),
                            new TreeItem('Item 2.2', [
                                new TreeItem('Item 2.2.1')
                            ]),
                        ])
                    ];
                    
                    this._onDidChangeTreeData.fire();
                }
                
                getTreeItem(element: TreeItem): vscode.TreeItem {
                    return element;
                }
                
                getChildren(element?: TreeItem): Thenable<TreeItem[]> {
                    if (element) {
                        return Promise.resolve(element.children);
                    } else {
                        return Promise.resolve(this.items);
                    }
                }
                
                getParent(element: TreeItem): TreeItem | undefined {
                    return element.parent;
                }
            }

            // 定义树节点项
            // Define tree item
            class TreeItem extends vscode.TreeItem {
                parent?: TreeItem;
                
                constructor(
                    public readonly label: string,
                    public readonly children: TreeItem[] = [],
                    public readonly collapsibleState: vscode.TreeItemCollapsibleState = 
                        children.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
                ) {
                    super(label, collapsibleState);
                    
                    this.tooltip = `Tooltip for ${label}`;
                    
                    // 为叶子节点设置图标
                    // Set icon for leaf nodes
                    if (children.length === 0) {
                        this.iconPath = new vscode.ThemeIcon('file');
                        this.command = {
                            command: 'extension.openTreeItem',
                            title: '打开项',
                            arguments: [label]
                        };
                    } else {
                        this.iconPath = new vscode.ThemeIcon('folder');
                    }
                    
                    // 设置父子关系
                    // Set parent-child relationship
                    children.forEach(child => child.parent = this);
                }
            }

            // 注册树视图
            // Register tree view
            function registerTreeView(context: vscode.ExtensionContext) {
                const treeDataProvider = new MyTreeDataProvider();
                
                // 创建树视图
                // Create tree view
                const treeView = vscode.window.createTreeView('myTreeView', {
                    treeDataProvider: treeDataProvider,
                    showCollapseAll: true,
                    canSelectMany: false
                });
                
                // 注册与树视图相关的命令
                // Register commands related to tree view
                context.subscriptions.push(
                    vscode.commands.registerCommand('extension.refreshTree', () => {
                        treeDataProvider.refresh();
                    }),
                    
                    vscode.commands.registerCommand('extension.openTreeItem', (label) => {
                        vscode.window.showInformationMessage(`Clicked on ${label}`);
                    })
                );
                
                // 监听选择变化
                // Listen for selection changes
                treeView.onDidChangeSelection(e => {
                    if (e.selection.length > 0) {
                        console.log(`Selected: ${e.selection[0].label}`);
                    }
                });
                
                // 可编程方式选择项目
                // Select items programmatically
                treeView.reveal(treeDataProvider.getChildren().then(items => items[0]),
                    { select: true, focus: true });
                    
                return treeView;
            }
            ```

            在 `package.json` 中配置树视图：

            ```json
            {
                "contributes": {
                    "views": {
                        "explorer": [
                            {
                                "id": "myTreeView",
                                "name": "My Tree View"
                            }
                        ]
                    },
                    "menus": {
                        "view/title": [
                            {
                                "command": "extension.refreshTree",
                                "when": "view == myTreeView",
                                "group": "navigation"
                            }
                        ],
                        "view/item/context": [
                            {
                                "command": "extension.openTreeItem",
                                "when": "viewItem == fileItem"
                            }
                        ]
                    }
                }
            }
            ```

            ### 任务 API

            任务 API 允许创建和管理 VS Code 任务：

            ```typescript
            // 任务提供器
            // Task provider
            function registerTaskProvider(context: vscode.ExtensionContext) {
                const taskProvider = vscode.tasks.registerTaskProvider('myTaskType', {
                    provideTasks: (token?: vscode.CancellationToken) => {
                        const tasks: vscode.Task[] = [];
                        
                        // 创建基本任务
                        // Create basic task
                        const basicTask = new vscode.Task(
                            { type: 'myTaskType', task: 'basic' },
                            vscode.TaskScope.Workspace,
                            'Basic Task',
                            'My Extension',
                            new vscode.ShellExecution('echo "Running basic task"'),
                            ['$myTaskOutput']
                        );
                        tasks.push(basicTask);
                        
                        // 创建带问题匹配器的任务
                        // Create task with problem matcher
                        const lintTask = new vscode.Task(
                            { type: 'myTaskType', task: 'lint' },
                            vscode.TaskScope.Workspace,
                            'Lint Task',
                            'My Extension',
                            new vscode.ShellExecution('echo "Running lint task"'),
                            ['$eslint-stylish']
                        );
                        lintTask.group = vscode.TaskGroup.Build;
                        lintTask.presentationOptions = {
                            reveal: vscode.TaskRevealKind.Silent,
                            panel: vscode.TaskPanelKind.Dedicated,
                            clear: true
                        };
                        tasks.push(lintTask);
                        
                        // 创建带自定义执行的任务
                        // Create task with custom execution
                        const customTask = new vscode.Task(
                            { type: 'myTaskType', task: 'custom' },
                            vscode.TaskScope.Workspace,
                            'Custom Task',
                            'My Extension',
                            new vscode.CustomExecution(async (resolvedDefinition: vscode.TaskDefinition): Promise<vscode.Pseudoterminal> => {
                                return new CustomTerminal();
                            })
                        );
                        tasks.push(customTask);
                        
                        return tasks;
                    },
                    resolveTask: (task: vscode.Task, token?: vscode.CancellationToken) => {
                        // 解析任务定义
                        // Resolve task definition
                        return task;
                    }
                });
                
                context.subscriptions.push(taskProvider);
                
                // 注册执行任务命令
                // Register execute task command
                context.subscriptions.push(
                    vscode.commands.registerCommand('extension.executeTask', async () => {
                        const tasks = await vscode.tasks.fetchTasks({ type: 'myTaskType' });
                        if (tasks.length > 0) {
                            await vscode.tasks.executeTask(tasks[0]);
                        }
                    })
                );
                
                // 监听任务结束事件
                // Listen for task end events
                context.subscriptions.push(
                    vscode.tasks.onDidEndTaskProcess(e => {
                        if (e.execution.task.name === 'Basic Task' && e.exitCode === 0) {
                            vscode.window.showInformationMessage('Basic task completed successfully!');
                        }
                    })
                );
            }

            // 自定义终端实现
            // Custom terminal implementation
            class CustomTerminal implements vscode.Pseudoterminal {
                private writeEmitter = new vscode.EventEmitter<string>();
                private closeEmitter = new vscode.EventEmitter<number>();
                
                onDidWrite: vscode.Event<string> = this.writeEmitter.event;
                onDidClose: vscode.Event<number> = this.closeEmitter.event;
                
                open(initialDimensions: vscode.TerminalDimensions | undefined): void {
                    this.writeEmitter.fire('Starting custom task...\r\n');
                    
                    setTimeout(() => {
                        this.writeEmitter.fire('Processing...\r\n');
                        
                        setTimeout(() => {
                            this.writeEmitter.fire('Custom task completed!\r\n');
                            this.closeEmitter.fire(0);
                        }, 2000);
                    }, 1000);
                }
                
                close(): void {
                    // 处理关闭请求
                    // Handle close request
                }
            }
            ```

            ### 文件系统 API

            使用文件系统 API 创建自定义文件系统提供器：

            ```typescript
            // 内存文件系统提供器示例
            // Memory file system provider example
            class MemFileSystemProvider implements vscode.FileSystemProvider {
                // 存储文件内容
                // Store file contents
                private files = new Map<string, Uint8Array>();
                
                // 事件触发器
                // Event emitters
                private readonly _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
                readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._onDidChangeFile.event;
                
                // 读取文件
                // Read file
                async readFile(uri: vscode.Uri): Promise<Uint8Array> {
                    const data = this.files.get(uri.toString());
                    if (!data) {
                        throw vscode.FileSystemError.FileNotFound(uri);
                    }
                    return data;
                }
                
                // 写入文件
                // Write file
                async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): Promise<void> {
                    const exists = this.files.has(uri.toString());
                    
                    if (!exists && !options.create) {
                        throw vscode.FileSystemError.FileNotFound(uri);
                    } else if (exists && !options.overwrite) {
                        throw vscode.FileSystemError.FileExists(uri);
                    }
                    
                    this.files.set(uri.toString(), content);
                    
                    this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
                }
                
                // 删除文件
                // Delete file
                async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
                    if (this.files.has(uri.toString())) {
                        this.files.delete(uri.toString());
                        this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
                    } else {
                        throw vscode.FileSystemError.FileNotFound(uri);
                    }
                }
                
                // 创建目录（此简化示例中不需要实际实现）
                // Create directory (no real implementation needed in this simplified example)
                async createDirectory(uri: vscode.Uri): Promise<void> {
                    // 内存文件系统中无需创建目录
                    // No need to create directories in memory file system
                }
                
                // 读取目录内容
                // Read directory contents
                async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
                    const result: [string, vscode.FileType][] = [];
                    
                    // 查找所有在此目录下的文件
                    // Find all files under this directory
                    const prefix = uri.toString();
                    for (const [key] of this.files) {
                        if (key.startsWith(prefix) && key !== prefix) {
                            const path = key.substring(prefix.length);
                            if (!path.includes('/')) {
                                result.push([path, vscode.FileType.File]);
                            }
                        }
                    }
                    
                    return result;
                }
                
                // 获取文件状态
                // Get file stats
                async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
                    if (this.files.has(uri.toString())) {
                        return {
                            type: vscode.FileType.File,
                            ctime: Date.now(),
                            mtime: Date.now(),
                            size: this.files.get(uri.toString())!.length,
                            permissions: undefined
                        };
                    }
                    
                    // 假设是目录
                    // Assume it's a directory
                    return {
                        type: vscode.FileType.Directory,
                        ctime: Date.now(),
                        mtime: Date.now(),
                        size: 0,
                        permissions: undefined
                    };
                }
                
                // 重命名（移动）文件
                // Rename (move) file
                async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
                    if (!this.files.has(oldUri.toString())) {
                        throw vscode.FileSystemError.FileNotFound(oldUri);
                    }
                    
                    if (this.files.has(newUri.toString()) && !options.overwrite) {
                        throw vscode.FileSystemError.FileExists(newUri);
                    }
                    
                    const data = this.files.get(oldUri.toString())!;
                    this.files.delete(oldUri.toString());
                    this.files.set(newUri.toString(), data);
                    
                    this._onDidChangeFile.fire([
                        { type: vscode.FileChangeType.Deleted, uri: oldUri },
                        { type: vscode.FileChangeType.Created, uri: newUri }
                    ]);
                }
                
                // 监视文件变化（不需要实际实现，因为我们直接触发事件）
                // Watch file changes (no real implementation needed as we directly trigger events)
                watch(_resource: vscode.Uri): vscode.Disposable {
                    return {
                        dispose: () => {}
                    };
                }
            }

            // 注册文件系统提供器
            // Register file system provider
            function registerFileSystemProvider(context: vscode.ExtensionContext) {
                const memFsProvider = new MemFileSystemProvider();
                
                // 注册文件系统
                // Register file system
                const disposable = vscode.workspace.registerFileSystemProvider('memfs', memFsProvider, {
                    isCaseSensitive: true,
                    isReadonly: false
                });
                
                context.subscriptions.push(disposable);
                
                // 注册创建内存文件的命令
                // Register command to create memory file
                context.subscriptions.push(
                    vscode.commands.registerCommand('extension.createMemoryFile', async () => {
                        const fileName = await vscode.window.showInputBox({
                            prompt: '输入文件名'
                        });
                        
                        if (fileName) {
                            const uri = vscode.Uri.parse(`memfs:/${fileName}`);
                            
                            try {
                                // 创建示例文件
                                // Create example file
                                const content = new TextEncoder().encode('Hello from in-memory file system!');
                                await memFsProvider.writeFile(uri, content, { create: true, overwrite: true });
                                
                                // 打开文件
                                // Open file
                                const doc = await vscode.workspace.openTextDocument(uri);
                                await vscode.window.showTextDocument(doc);
                                
                                vscode.window.showInformationMessage(`Created and opened ${fileName}`);
                            } catch (err) {
                                vscode.window.showErrorMessage(`Error creating file: ${err}`);
                            }
                        }
                    })
                );
            }
            ```

            ## 最佳实践与注意事项

            ### 插件性能优化

            ```typescript
            // 1. 延迟加载功能以减少激活时间
            // Delayed loading of features to reduce activation time
            export function activate(context: vscode.ExtensionContext) {
                console.log('Extension activated with minimal setup');
                
                // 仅注册核心命令
                // Only register core commands
                const disposable = vscode.commands.registerCommand('extension.quickAction', () => {
                    // 快速响应的操作
                    // Quick response action
                });
                context.subscriptions.push(disposable);
                
                // 延迟加载其它功能
                // Delay loading other features
                let langFeatures: vscode.Disposable[] | undefined;
                
                context.subscriptions.push(
                    vscode.commands.registerCommand('extension.advancedFeature', async () => {
                        // 按需加载语言特性
                        // Load language features on demand
                        if (!langFeatures) {
                            langFeatures = await loadLanguageFeatures();
                            context.subscriptions.push(...langFeatures);
                        }
                        
                        // 执行高级功能
                        // Execute advanced feature
                        vscode.window.showInformationMessage('高级功能已加载');
                    })
                );
            }

            // 2. 使用节流和防抖以减少不必要的操作
            // Throttle and debounce to reduce unnecessary operations
            function createThrottledFunction(func: Function, delay: number): (...args: any[]) => void {
                let lastCall = 0;
                return (...args: any[]) => {
                    const now = Date.now();
                    if (now - lastCall >= delay) {
                        lastCall = now;
                        func(...args);
                    }
                };
            }

            function createDebouncedFunction(func: Function, delay: number): (...args: any[]) => void {
                let timer: NodeJS.Timeout | null = null;
                return (...args: any[]) => {
                    if (timer) {
                        clearTimeout(timer);
                    }
                    timer = setTimeout(() => {
                        func(...args);
                context.subscriptions.push(
                    vscode.workspace.onDidChangeTextDocument(event => {
                        heavyProcessing(event.document);
                    })
                );
                */
                
                // 正确做法：使用防抖
                // Correct approach: Use debounce
                const debouncedProcessing = createDebouncedFunction((document: vscode.TextDocument) => {
                    heavyProcessing(document);
                }, 500);
                
                context.subscriptions.push(
                    vscode.workspace.onDidChangeTextDocument(event => {
                        debouncedProcessing(event.document);
                    })
                );
            }