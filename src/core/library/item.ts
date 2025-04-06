import { formatPkgSize } from '../../pkg/format';
import { ModInfo as ModData, ModInfo } from './mod';

import {
	Uri,
	TreeItem,
	MarkdownString,
	TreeItemCollapsibleState} from 'vscode';
import * as vscode from 'vscode';
import { parseChildURI } from '../../pkg/file';
import { getResourceUri } from '../../pkg/resource';
import { Logger } from '../../pkg/logger';
import { GoSDK } from './sdk';

const logger = Logger.withContext('library/item');


/**
 * 模块项，可以是模块、包或文件
 */
export class ModItem extends TreeItem {

	public isDir: boolean; // 是否目录

	public modData?: ModData;

	constructor(lable: string, uri: Uri, isDir: boolean) {
		const collapsibleState = isDir ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None
		super(uri, collapsibleState)

		this.isDir = isDir;
		this.label = lable;
		if (!isDir) {
			this.command = {
				command: 'vscode.open',
				arguments: [uri],
				title: 'Open Resource',
			};
		}

	}

	/**
	 * 更新提示信息
	 */
	public updateTooltip(): void {
		if (this.modData) {
			this.tooltip = this.generateTooltip();
		}
	}

	/**
	 * 生成悬停提示信息
	 * @returns 格式化的悬停提示
	 */
	public generateTooltip(): string | MarkdownString {
		if (!this.modData) {
			return '';
		}

		const md = new MarkdownString();

		// 添加标题
		md.appendMarkdown(`## ${this.modData.Path}\n\n`);
		// 添加版本信息
		if (this.modData.Version) {
			md.appendMarkdown(`**Version:** ${this.modData.Version}\n\n`);
		}
		// 添加Go版本信息
		if (this.modData.GoVersion) {
			md.appendMarkdown(`**Go Version:** ${this.modData.GoVersion}\n\n`);
		}
		// 添加包大小信息(如果有)
		if (this.modData.Size !== undefined && this.modData.Size > 0) {
			md.appendMarkdown(`**Size:** ${formatPkgSize(this.modData.Size)}\n\n`);
		}
		// 添加目录信息
		if (this.modData.Dir) {
			md.appendMarkdown(`**Directory:** ${this.modData.Dir}\n\n`);
		}
		// 添加更新时间信息
		if (this.modData.Time) {
			md.appendMarkdown(`**Update Time:** ${this.modData.Time}\n\n`);
		}
		if (this.modData.BelongTos) {
			md.appendMarkdown(`**Belong To:** ${this.modData.BelongTos.join('\n\n')}\n\n`);
		}
		return md;
	}

	/**
	 * 获取项目的唯一ID
	 * @param item 树项
	 * @returns 唯一ID
	 */
	public static getItemId(item: ModItem): string {
		if (item.resourceUri) {
			return item.resourceUri.toString();
		}

		if (item.label) {
			return typeof item.label === 'string' ? item.label : item.label.label;
		}

		return `item-${Math.random()}`;
	}

	public static newGoSDKItem(ctx: vscode.ExtensionContext): ModItem {
		const gosdk = new GoSDK;
		const src = gosdk.execute()

		// 创建SDK项目
		const sdkUri = Uri.parse(src.Dir);
		const srcUri = parseChildURI(sdkUri, 'src');
		const label = "Go SDK " + src.GoVersion
		const sdk = new ModItem(label, srcUri, true);

		sdk.modData = src;
		sdk.description = src.Dir;
		sdk.iconPath = getResourceUri(ctx, 'icons/go.svg');
		sdk.updateTooltip();
		return sdk;
	}


	/**
	 * 创建普通模块项（依赖项）
	 * @param ctx 上下文
	 * @param info 模块信息
	 * @returns 新的模块项
	 */
	public static newModItem(ctx: vscode.ExtensionContext, info: ModInfo): ModItem {
		const mod = new ModItem(info.Path, Uri.parse(info.Dir), true);
		mod.modData = info;
		mod.description = info.Version;
		mod.iconPath = getResourceUri(ctx, info.Type + '.svg');
		mod.updateTooltip()
		return mod;
	}
} 