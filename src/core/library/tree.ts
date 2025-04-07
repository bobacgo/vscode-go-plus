import { Logger } from '../../pkg/logger';
import { ModItem } from './item';

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { GoModule, ModCmdInfo } from './mod';
import { Dependencies, DependencyCmdInfo } from './dependencies';
import { getResourceUri } from '../../pkg/resource';

const logger = Logger.withContext('library/treedata');


// 定义标签枚举
// Define label enum
enum TreeLabel {
    Modules = 'Modules',
    Dependencies = 'Dependencies',
    IndirectDependencies = 'IndirectDependencies',
    Tools = 'Tools',
    Replaces = 'Replaces',
    Excludes = 'Excludes',
}


/**
 * 模块树实现，包含树数据提供者、文本文档内容提供者和定义提供者
 */
export class GoLibraryTreeData implements vscode.TreeDataProvider<ModItem>, vscode.DefinitionProvider {
    private _onDidChangeTreeData: vscode.EventEmitter<ModItem | undefined | null | void> = new vscode.EventEmitter<ModItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ModItem | undefined | null | void> = this._onDidChangeTreeData.event;


    // 缓存SDK项和模块项
    private _sdkItem: ModItem | undefined;
    private _dependencyItem: ModItem | undefined;
    private _indirectDependencyItem: ModItem | undefined;
    private _itemMap: Map<string, ModItem> = new Map<string, ModItem>();

    private _modCmdInfos: ModCmdInfo[] = [];
    private _depCmdInfos: DependencyCmdInfo[] = [];

    private _watcher: vscode.FileSystemWatcher | undefined;
    private _ctx: vscode.ExtensionContext;
    private _goModule: GoModule;

    /**
     * 树视图
     */
    private readonly _treeView: vscode.TreeView<ModItem> | undefined;

    /**
     * 构造函数
     * @param _context 扩展上下文
     */
    constructor(_context: vscode.ExtensionContext) {
        this._ctx = _context;
        this.initialize();

        // 创建树视图
        this._treeView = vscode.window.createTreeView('golibraries', {
            showCollapseAll: true,
            treeDataProvider: this
        });

        // 注册提供者
        _context.subscriptions.push(
            this._treeView,
            vscode.languages.registerDefinitionProvider(['go'] as vscode.DocumentSelector, this),
            // 添加文本编辑器变更事件监听
            // Add text editor change event listener
            vscode.window.onDidChangeActiveTextEditor(editor => {
                this.syncTreeWithEditor(editor);
            })
        );
    }

    /**
     * 初始化树视图数据
     * Initialize tree view data
     */
    private async initialize(): Promise<void> {
        try {
            // 加载SDK项
            this._sdkItem = ModItem.newGoSDKItem(this._ctx);

            // 创建工作区监视器
            this.createWatcher();

            // 加载模块项
            await this.refreshModules();
        } catch (error) {
            logger.error('初始化树视图数据失败', error);
        }
    }

    public async refreshModules(): Promise<void> {
        try {
            logger.debug('开始刷新模块');
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                logger.debug('没有打开的工作区文件夹');
                this.refresh();
                return;
            }

            // 遍历工作区文件夹
            for (const folder of workspaceFolders) {
                await this.loadModulesFromFolder(folder.uri.fsPath);
            }

            // 刷新视图
            this.refresh();
        } catch (error) {
            logger.error('刷新模块失败', error);
        }
    }

    /**
     * 从文件夹加载模块
     * Load modules from folder
     *
     * @param folderPath 文件夹路径
     */
    private async loadModulesFromFolder(folderPath: string): Promise<void> {
        try {

            this._itemMap.clear();

            // 加载模块信息 TODO 多个工作区有问题
            this._goModule = new GoModule(this._ctx, folderPath);
            this._modCmdInfos = await this._goModule.execute();
            if (this._modCmdInfos.length === 0) {
                logger.debug(`文件夹 ${folderPath} 中未找到模块`);
                return;
            }
            // 获取所有依赖项
            this._depCmdInfos = await new Dependencies(folderPath).execute();
            if (this._depCmdInfos.length === 0) {
                logger.debug(`文件夹 ${folderPath} 中未找到依赖项`);
                return;
            }

            if (this._depCmdInfos.length > 0) {
                // 创建依赖项
                let uri = vscode.Uri.file(TreeLabel.Dependencies).with({scheme: 'modules'});
                let item = new ModItem(TreeLabel.Dependencies, uri, true);
                item.iconPath = getResourceUri(this._ctx, 'icons/dependency.svg');
                const dependencies =  this._depCmdInfos.filter((dep) => !dep.Indirect);
                item.description = (dependencies.length - this._modCmdInfos.length).toString();
                this._dependencyItem = item;
                this._itemMap.set(item.resourceUri.fsPath, item);

                // 创建间接依赖项
                uri = vscode.Uri.file(TreeLabel.IndirectDependencies).with({scheme: 'modules'});
                const indirectsDeps = this._depCmdInfos.filter((dep) => dep.Indirect);
                item = new ModItem(TreeLabel.IndirectDependencies, uri, true);
                item.iconPath = getResourceUri(this._ctx, 'icons/indirect.svg');
                item.description = indirectsDeps.length.toString();
                this._indirectDependencyItem = item;
                this._itemMap.set(item.resourceUri.fsPath, item);
            }
        } catch (error) {
            logger.error(`从文件夹 ${folderPath} 加载模块失败`, error);
        }
    }

    /**
     * 创建工作区监视器
     * Create workspace watcher
     */
    public createWatcher(): void {
        if (this._watcher) {
            this._watcher.dispose();
        }

        // 监视 go.mod 文件变化
        this._watcher = vscode.workspace.createFileSystemWatcher('**/go.mod');

        // 当 go.mod 文件变化时，刷新模块
        this._watcher.onDidChange(() => this.refreshModules());
        this._watcher.onDidCreate(() => this.refreshModules());
        this._watcher.onDidDelete(() => this.refreshModules());
    }


    /**
     * 刷新树视图
     * Refresh tree view
     */
    public refresh(): void {
        logger.debug('刷新树视图');
        this._onDidChangeTreeData.fire();
    }

    /**
     * 刷新特定项
     * Refresh specific item
     */
    public refreshItem(item: ModItem): void {
        logger.debug(`刷新节点: ${item.label}`);
        this._onDidChangeTreeData.fire(item);
    }

    /**
     * 监视工作区
     * Watch workspace
     */
    public watch(): void {
        logger.debug('开始监视工作区');
        this.createWatcher();
    }

    /**
     * 获取树项
     * @param element 元素
     */
    public getTreeItem(element: ModItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    /**
     * 获取父项
     * @param element 元素
     */
    public getParent(element: ModItem): ModItem | null {
        // 检查元素是否有有效的资源URI
        // Check if element has valid resource URI
        if (!element || !element.resourceUri) {
            return null;
        }
        // 如果是根级别的特殊节点，直接返回null
        // If it's a root-level special node, return null
        if ([this._sdkItem.label, TreeLabel.Modules, TreeLabel.Dependencies, TreeLabel.IndirectDependencies,
            TreeLabel.Tools, TreeLabel.Replaces, TreeLabel.Excludes].includes(element.label as TreeLabel)) {
            return null;
        }

        // 获取父目录路径
        // Get parent directory path
        const parentPath = path.dirname(element.resourceUri.fsPath);

        // 根节点没有父节点
        // Root node has no parent
        if (parentPath === element.resourceUri.fsPath) {
            return null;
        }

        // root 节点
        const depIimes =  this._depCmdInfos.filter(dep => dep.Dir === parentPath);
        if (depIimes.length > 0) {
            if (depIimes[0].Indirect) { // 间接依赖
                return this._indirectDependencyItem;
            } else { // 直接依赖
                return this._dependencyItem;
            }
        }
        // root 节点
        if (parentPath === this._sdkItem.resourceUri.fsPath) {
            return this._sdkItem;
        }

        // 字节点
        if (this.isDepChildren(parentPath)) { // 依赖项的子项
            return this._itemMap.get(parentPath);
        } else { // 可能是sdk
            const fsPath = path.join(this._sdkItem.resourceUri.fsPath, parentPath);
            if (!fs.existsSync(fsPath)) {
                return null;
            }
            return this._itemMap.get(fsPath);
        }
    }

    /**
     * 判断是否是依赖项的子项
     * @param element 元素
     */
    public isDepChildren(fsPath: string): boolean {
        return this._depCmdInfos.filter(dep => fsPath.startsWith(dep.Dir)).length > 0;
    }

    /**
     * 获取树视图的根项
     * @returns 根项数组
     */
    private getRootItem(): ModItem[] {
        const rootItems: ModItem[] = [];

        if (this._sdkItem) {
            rootItems.push(this._sdkItem);
        }

        if (this._modCmdInfos.length > 0) {
            const uri = vscode.Uri.file(TreeLabel.Modules).with({scheme: 'modules'});
            let item = this._itemMap.get(uri.fsPath);
            if (!item) {
                item = new ModItem(TreeLabel.Modules, uri, true);
                item.iconPath = getResourceUri(this._ctx, 'icons/module.svg');
                item.description = this._modCmdInfos.length.toString();
                this._itemMap.set(item.resourceUri.fsPath, item);
            }
            rootItems.push(item);
        }

        if (this._dependencyItem) {
            rootItems.push(this._dependencyItem);
        }
        if (this._indirectDependencyItem) {
            rootItems.push(this._indirectDependencyItem);
        }

        const modfileInfos =  this._modCmdInfos.map(mod => mod.FileInfo);
        // 获取所有工具，并按 module 字段去重
        // Get all tools and deduplicate by module field
        const tools = modfileInfos.flatMap(info => info.Tool).
            filter((tool, index, self) => index === self.findIndex(t => t.Module === tool.Module));
        if (tools.length > 0) {
            const uri = vscode.Uri.file(TreeLabel.Tools).with({scheme: 'modules'});
            let item = this._itemMap.get(uri.fsPath);
            if (!item) {
                item = new ModItem(TreeLabel.Tools, uri, true);
                item.iconPath = getResourceUri(this._ctx, 'icons/tool.svg');
                item.description = tools.length.toString();
                this._itemMap.set(item.resourceUri.fsPath, item);
            }
            rootItems.push(item);
        }

        // 获取所有替换项，并按 module 字段去重
        // Get all replaces and deduplicate by module field
        const replaces = modfileInfos.flatMap(info => info.Replace).
            filter((replace, index, self) => index === self.findIndex(t => t.Module === replace.Module));
        if (replaces.length > 0) {
            const uri = vscode.Uri.file(TreeLabel.Replaces).with({scheme: 'modules'});
            let item = this._itemMap.get(uri.fsPath);
            if (!item) {
                item = new ModItem(TreeLabel.Replaces, uri, true);
                item.iconPath = getResourceUri(this._ctx, 'icons/replace.svg');
                item.description = replaces.length.toString();
                this._itemMap.set(item.resourceUri.fsPath, item);
            }
            rootItems.push(item);

        }
        // 获取所有排除项，并按 module 字段去重
        // Get all excludes and deduplicate by module field
        const excludes = modfileInfos.flatMap(info => info.Exclude).
            filter((exclude, index, self) => index === self.findIndex(t => t.Module === exclude.Module));
        if (excludes.length > 0) {
            const uri = vscode.Uri.file(TreeLabel.Excludes).with({scheme: 'modules'});
            let item = this._itemMap.get(uri.fsPath);
            if (!item) {
                item = new ModItem(TreeLabel.Excludes, uri, true);
                item.iconPath = getResourceUri(this._ctx, 'icons/exclude.svg');
                item.description = excludes.length.toString();
                this._itemMap.set(item.resourceUri.fsPath, item);
            }
            rootItems.push(item);
        }
        return rootItems;
    }

    /**
     * 获取子项
     * @param element 元素
     */
    public async getChildren(element?: ModItem): Promise<ModItem[]> {
        if (!element) { // 根节点
            return this.getRootItem();
        }
        if (element.label === TreeLabel.Modules) {
            return this._modCmdInfos.map(mod => {
                let item = this._itemMap.get(mod.GoMod);
                if (item) {
                    return item;
                }
                item = new ModItem(mod.Path, vscode.Uri.file(mod.GoMod), false);
                const directLen = mod.FileInfo.Require.filter(r => !r.Indirect).length;
                item.description = directLen + ' go' + mod.FileInfo.Go;
                item.iconPath = vscode.ThemeIcon.File;

                this._itemMap.set(mod.GoMod, item);
                return item;
            });
        }
        if (element.label === TreeLabel.Dependencies) {
            const modules = this._modCmdInfos.map(m => m.Path);
            return this._depCmdInfos.filter(d => !d.Indirect && !modules.includes(d.Path)).
                map(dep => {
                    let item = this._itemMap.get(dep.Dir);
                    if (item) {
                        return item;
                    }
                    item = new ModItem(dep.Path, vscode.Uri.parse(dep.Dir), true);
                    item.iconPath = vscode.ThemeIcon.Folder;
                    item.description = dep.Version;
                    this._itemMap.set(dep.Dir, item);
                    return item;
                });
        }
        if (element.label === TreeLabel.IndirectDependencies) {
            const modules = this._modCmdInfos.map(m => m.Path);
            return this._depCmdInfos.filter(d => d.Indirect && !modules.includes(d.Path)).
                map(dep => {
                    const item = this._itemMap.get(dep.Dir);
                    if (item) {
                        return item;
                    }
                    const modItem = new ModItem(dep.Path, vscode.Uri.file(dep.Dir), true);
                    modItem.iconPath = vscode.ThemeIcon.Folder;
                    modItem.description = dep.Version;
                    this._itemMap.set(dep.Dir, modItem);
                    return modItem;
                });
        }
        if (element.label === TreeLabel.Tools) {
            return this._modCmdInfos.flatMap(m => m.FileInfo.Tool).
                filter((tool, index, self) => self.indexOf(tool) === index). // 去重
                map(tool => {
                    const item = this._itemMap.get(tool.Module);
                    if (item) {
                        return item;
                    }
                    const modItem = new ModItem(tool.Module, vscode.Uri.file(tool.Module), false);
                    modItem.iconPath = vscode.ThemeIcon.File;
                    modItem.description = tool.Version;
                    modItem.command = null;
                    this._itemMap.set(tool.Module, modItem);
                    return modItem;
                }
                );
        }
        if (element.label === TreeLabel.Replaces) {
            return this._modCmdInfos.flatMap(m => m.FileInfo.Replace).
                filter((replace, index, self) => self.indexOf(replace) === index). // 去重
                map(replace => {
                    const item = this._itemMap.get(replace.Module);
                    if (item) {
                        return item;
                    }
                    const modItem = new ModItem(replace.Module, vscode.Uri.file(replace.Module), false);
                    modItem.iconPath = vscode.ThemeIcon.File;
                    modItem.description = replace.Version;
                    modItem.command = null;
                    this._itemMap.set(replace.Module, modItem);
                    return modItem;
                }
                );
        }
        if (element.label === TreeLabel.Excludes) {
            return this._modCmdInfos.flatMap(m => m.FileInfo.Exclude).
                filter((exclude, index, self) => self.indexOf(exclude) === index). // 去重
                map(exclude => {
                    const item = this._itemMap.get(exclude.Module);
                    if (item) {
                        return item;
                    }
                    const modItem = new ModItem(exclude.Module, vscode.Uri.file(exclude.Module), false);
                    modItem.iconPath = vscode.ThemeIcon.File;
                    modItem.description = exclude.Version;
                    modItem.command = null;
                    this._itemMap.set(exclude.Module, modItem);
                    return modItem;
                }
                );
        }

        return this.getDirectoryChildren(element.resourceUri.fsPath);
    }

    /**
     * 从目录中读取项目
     * @param dirPath 目录路径
     */
    private getDirectoryChildren(dirPath: string): ModItem[] {
        try {
            if (!dirPath || !fs.existsSync(dirPath)) {
                logger.warn(`目录不存在: ${dirPath}`);
                return [];
            }

            // 读取目录内容
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });

            // 创建子节点
            const children: ModItem[] = [];

            for (const entry of entries) {
                const childPath = path.join(dirPath, entry.name);
                let item = this._itemMap.get(childPath);
                if (!item) {
                    if (entry.isDirectory() && !entry.name.startsWith('.')) {
                        item = new ModItem(entry.name, vscode.Uri.file(childPath), true);
                        item.iconPath = vscode.ThemeIcon.Folder;
                        this._itemMap.set(childPath, item);
                        children.push(item);
                    } else if (entry.isFile() && !entry.name.startsWith('.')) {
                        item = new ModItem(entry.name, vscode.Uri.file(childPath), false);
                        item.iconPath = vscode.ThemeIcon.File;
                        // item.contextValue = entry.name.endsWith('.go') ? 'gofile' : 'file';
                        this._itemMap.set(childPath, item);
                        children.push(item);
                    }
                } else {
                    // 如果已经存在，则直接使用
                    // If it already exists, use it directly
                    children.push(item);
                }
            }

            // 目录排在前面，文件排在后面
            return children.sort((a, b) => {
                // 目录排在前面，文件排在后面
                // Directories first, then files
                return (b.isDir === true ? 1 : 0) - (a.isDir === true ? 1 : 0);
            });
        } catch (error) {
            logger.error(`读取目录出错: ${dirPath}`, error);
            return [];
        }
    }

    /**
     * 提供定义位置
     * Provide definition position
     *
     * @param document 文档
     * @param position 位置
     * @param token 取消令牌
     */
    public provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
        logger.debug('开始查找定义位置');

        try {
            // 获取光标所在位置的单词
            // Get word at cursor position
            const wordRange = document.getWordRangeAtPosition(position);
            if (!wordRange) {
                return null;
            }

            const lineText = document.lineAt(position.line).text;
            const importRegex = /import\s+(?:"([^"]+)"|'([^']+)')/;
            const lineImport = importRegex.exec(lineText);

            // 检查是否在导入语句内
            // Check if inside import statement
            if (!lineImport && !this.isInsideMultiLineImport(document, position)) {
                return null;
            }

            // 获取包路径
            // Get package path
            const packagePath = this.extractPackagePath(document, position);
            if (!packagePath) {
                return null;
            }

            // 尝试聚焦到依赖项
            // Try to focus on dependency
            this.safelyFocusOnDependency(packagePath);
        } catch (error) {
            logger.error('查找定义位置时出错', error);
        }

        return null;
    }

    /**
     * 检查位置是否在多行导入语句内
     * Check if position is inside multi-line import
     */
    private isInsideMultiLineImport(document: vscode.TextDocument, position: vscode.Position): boolean {
        // 从当前行向上查找 import ( 开始
        // Look upward for import ( start
        let startLine = position.line;
        while (startLine >= 0) {
            const line = document.lineAt(startLine).text.trim();
            if (line.includes('import (')) {
                break;
            }
            if (line === ')') {
                return false;
            }
            startLine--;
        }

        if (startLine < 0) {
            return false;
        }

        // 从当前行向下查找 ) 结束
        // Look downward for ) end
        let endLine = position.line;
        while (endLine < document.lineCount) {
            const line = document.lineAt(endLine).text.trim();
            if (line === ')') {
                return true;
            }
            endLine++;
        }

        return false;
    }

    /**
     * 提取包路径
     * Extract package path
     */
    private extractPackagePath(document: vscode.TextDocument, position: vscode.Position): string | null {
        const line = document.lineAt(position.line).text;

        // 单行导入
        // Single line import
        const singleImportMatch = /import\s+(?:[^\s]+\s+)?["']([^"']+)["']/.exec(line);
        if (singleImportMatch && this.isPositionInRange(position, line.indexOf(singleImportMatch[1]), singleImportMatch[1].length)) {
            // 先规范化包路径，删除多余的斜线
            // Normalize package path, remove extra slashes
            return singleImportMatch[1].replace(/\/+/g, '/');
        }

        // 多行导入中的一行
        // Line in multi-line import
        const multiImportMatch = /^\s*(?:[^\s]+\s+)?["']([^"']+)["']/.exec(line);
        if (multiImportMatch && this.isInsideMultiLineImport(document, position)) {
            // 先规范化包路径，删除多余的斜线
            // Normalize package path, remove extra slashes
            return multiImportMatch[1].replace(/\/+/g, '/');
        }

        return null;
    }

    /**
     * 检查位置是否在指定范围内
     * Check if position is in specified range
     */
    private isPositionInRange(position: vscode.Position, startIndex: number, length: number): boolean {
        const startPosition = new vscode.Position(position.line, startIndex);
        const endPosition = new vscode.Position(position.line, startIndex + length);
        const range = new vscode.Range(startPosition, endPosition);
        return range.contains(position);
    }

    /**
     * 安全地聚焦到依赖项
     * Safely focus on dependency
     */
    private async safelyFocusOnDependency(packagePath: string): Promise<void> {
        if (!this._treeView || !packagePath) {
            return;
        }

        logger.debug(`尝试聚焦依赖: ${packagePath}`);

        const cmdInfo =  this._modCmdInfos.find(mod => packagePath.startsWith(mod.Path));
        if (cmdInfo) { // 项目源码路径不处理
            return;
        }

        // 关闭所有展开项
        // Close all expanded items
        if (this._treeView.visible) {
            await vscode.commands.executeCommand('workbench.actions.treeView.golibraries.collapseAll');
        }

        let rootPath = '';

        const depCmdInfo = this._depCmdInfos.find(dep => packagePath.startsWith(dep.Path));
        if (depCmdInfo) {
            let rootLevel = TreeLabel.Dependencies;
            if (depCmdInfo.Indirect) {
                rootLevel = TreeLabel.IndirectDependencies;
            }
            const url = vscode.Uri.file(rootLevel).with({scheme: 'modules'});
            const rootDepItem = this._itemMap.get(url.fsPath);
            if (!rootDepItem) {
                return;
            }
            await this._treeView.reveal(rootDepItem, { select: true, focus: false, expand: 1 });

            const depItem = this._itemMap.get(depCmdInfo.Dir);
            await this._treeView?.reveal(depItem, { select: true, focus: false, expand: 1 });

            // 移除包路径的前缀(依赖路径)，获取相对路径
            // Remove dependency path prefix to get relative path
            packagePath = packagePath.startsWith(depCmdInfo.Path)
                ? packagePath.slice(depCmdInfo.Path.length)
                : packagePath;
            rootPath = depCmdInfo.Dir;
        } else {
            const sdkPath = path.join(this._sdkItem.resourceUri.fsPath, packagePath);
            if (!fs.existsSync(sdkPath)) {
                return;
            }
            rootPath = this._sdkItem.resourceUri.fsPath;
            await this._treeView.reveal(this._sdkItem, { select: true, focus: false, expand: 1 });
        }

        // 获取路径中所有的子目录路径
        // Get all subdirectory paths
        const relativePathParts = packagePath.split('/').filter(Boolean);

        // 构建完整路径序列
        // Build complete path sequence
        for (let i = 0; i < relativePathParts.length; i++) {
            const subPath = '/' + relativePathParts.slice(0, i + 1).join('/');
            const fsPath = path.join(rootPath, subPath);
            const item = this._itemMap.get(fsPath);
            if (item) {
                await this._treeView?.reveal(item, { select: true, focus: false, expand: 1 });
            }
        }
    }

    /**
     * 同步树视图与编辑器
     * Synchronize tree view with editor
     *
     * @param editor 活跃的文本编辑器
     */
    private syncTreeWithEditor(editor?: vscode.TextEditor): void {
        if (!editor || !this._treeView || !this._treeView.visible) {
            return;
        }

        try {
            const uri = editor.document.uri;
            const filePath = uri.fsPath;

            // 只处理 Go 文件
            // Only process Go files
            if (!filePath.endsWith('.go')) {
                return;
            }

            logger.debug(`同步树视图与编辑器: ${filePath}`);

            // 查找文件对应的树节点并聚焦
            // Find corresponding tree node and focus on it
            this.revealFileInTree(filePath);
        } catch (error) {
            logger.error('同步树视图与编辑器失败', error);
        }
    }

    /**
     * 在树视图中显示文件
     * Reveal file in tree view
     *
     * @param filePath 文件路径
     */
    private async revealFileInTree(filePath: string): Promise<void> {
        // 先检查是否在工作区项目中
        // First check if file is in workspace project
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        // 查找路径匹配的模块项
        // Find module item matching the path
        for (const mod of this._modCmdInfos) {
            if (filePath.startsWith(path.dirname(mod.GoMod))) {
                // 这是项目中的文件，先展开模块节点
                // This is a file in the project, first expand module node
                const uri = vscode.Uri.file(TreeLabel.Modules).with({scheme: 'modules'});
                const modulesItem = this._itemMap.get(uri.fsPath);
                if (modulesItem) {
                    await this._treeView!.reveal(modulesItem, { select: false, focus: false, expand: 1 });
                }

                // 查找项目中的文件节点
                // Find file node in project
                const relativePath = filePath.substring(path.dirname(mod.GoMod).length).split(path.sep).filter(Boolean);
                await this.revealTreePath(path.dirname(mod.GoMod), relativePath);
                return;
            }
        }

        // 查找依赖项中的文件
        // Find file in dependencies
        for (const dep of this._depCmdInfos) {
            if (filePath.startsWith(dep.Dir)) {
                // 是依赖中的文件
                // It's a file in dependency
                const rootNode = dep.Indirect ? this._indirectDependencyItem : this._dependencyItem;
                if (rootNode) {
                    await this._treeView!.reveal(rootNode, { select: false, focus: false, expand: 1 });

                    // 先定位到依赖项根节点
                    // First locate dependency root node
                    const depItem = this._itemMap.get(dep.Dir);
                    if (depItem) {
                        await this._treeView!.reveal(depItem, { select: false, focus: false, expand: 1 });

                        // 然后按相对路径定位
                        // Then locate by relative path
                        const relativePath = filePath.substring(dep.Dir.length).split(path.sep).filter(Boolean);
                        await this.revealTreePath(dep.Dir, relativePath);
                    }
                }
                return;
            }
        }

        // 可能是标准库中的文件
        // Might be a file in standard library
        if (this._sdkItem && filePath.startsWith(this._sdkItem.resourceUri.fsPath)) {
            await this._treeView!.reveal(this._sdkItem, { select: false, focus: false, expand: 1 });

            const relativePath = filePath.substring(this._sdkItem.resourceUri.fsPath.length).split(path.sep).filter(Boolean);
            await this.revealTreePath(this._sdkItem.resourceUri.fsPath, relativePath);
        }
    }

    /**
     * 按路径层次展开并定位树节点
     * Expand and locate tree nodes by path hierarchy
     *
     * @param basePath 基础路径
     * @param pathParts 路径部分
     */
    private async revealTreePath(basePath: string, pathParts: string[]): Promise<void> {
        if (!this._treeView || pathParts.length === 0) {
            return;
        }

        let currentPath = basePath;

        // 逐层定位
        // Locate level by level
        for (let i = 0; i < pathParts.length; i++) {
            currentPath = path.join(currentPath, pathParts[i]);
            const item = this._itemMap.get(currentPath);

            if (item) {
                // 最后一个路径部分选中但不展开
                // Select but don't expand the last path part
                const isLastPart = i === pathParts.length - 1;
                const expand = isLastPart ? 0 : 1;
                await this._treeView.reveal(item, { select: isLastPart, focus: isLastPart, expand });
            } else {
                // 如果找不到节点，可能需要先展开父节点以加载下一级节点
                // If node not found, may need to expand parent node to load next level nodes
                break;
            }
        }
    }

}
