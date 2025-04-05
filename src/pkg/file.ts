import { Uri, workspace, window } from 'vscode';
import { InterfaceInfo } from "../types";
import * as path from "path";

import { Logger } from './logger';

import fs from 'fs';

const logger = Logger.withContext('pkg/file');


/**
 * 解析子URI
 * @param parent 父URI
 * @param childName 子名称
 * @returns 子URI
 */
export function parseChildURI(parent: Uri, childName: string): Uri {
	return process.platform === 'win32'
		? Uri.parse(parent.toString(true) + '\\' + childName)
		: Uri.parse(parent.toString(true) + '/' + childName);
}

/**
 * 查找工作区中的所有接口
 * 递归扫描工作区中的所有Go文件，提取接口信息
 * @param workspacePath 工作区路径
 * @returns 接口信息数组
 */
export async function findInterfaces(workspacePath: string): Promise<InterfaceInfo[]> {
	const interfaces: InterfaceInfo[] = [];

	/**
	 * 递归扫描目录
	 * @param dir 目录路径
	 */
	async function scanDirectory(dir: string) {
		const files = await fs.promises.readdir(dir);

		for (const file of files) {
			const fullPath = path.join(dir, file);
			const stat = await fs.promises.stat(fullPath);

			if (stat.isDirectory()) {
				await scanDirectory(fullPath);
			} else if (file.endsWith('.go')) {
				const content = await fs.promises.readFile(fullPath, 'utf-8');
				const lines = content.split('\n');

				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					const interfaceMatch = line.match(/type\s+(\w+)\s+interface\s*{/);

					if (interfaceMatch) {
						const interfaceName = interfaceMatch[1];
						const methods: string[] = [];
						const methodLineNumbers: Record<string, number> = {};
						let j = i + 1;

						// 提取接口中的方法
						while (j < lines.length && lines[j].trim() !== '}') {
							const methodLine = lines[j].trim();
							if (methodLine) {
								const methodMatch = methodLine.match(/(\w+)\s*\([^)]*\)/);
								if (methodMatch) {
									const methodName = methodMatch[1];
									methods.push(methodName);
									methodLineNumbers[methodName] = j + 1; // 存储方法行号
								}
							}
							j++;
						}

						interfaces.push({
							name: interfaceName,
							methods,
							filePath: fullPath,
							lineNumber: i + 1,
							methodLineNumbers,
							fullPath: fullPath // Add the fullPath property
						});
					}
				}
			}
		}
	}

	await scanDirectory(workspacePath);
	return interfaces;
}


/**
 * 获取目录大小
 * @param dirPath 目录路径
 * @returns 目录大小(字节)
 */
export function getDirectorySize(dirPath: string): number {
	try {
		if (!fs.existsSync(dirPath)) {
			return 0;
		}

		let totalSize = 0;
		const files = fs.readdirSync(dirPath, { withFileTypes: true });

		for (const file of files) {
			const fullPath = path.join(dirPath, file.name);

			// 跳过隐藏文件和某些特定目录
			if (file.name.startsWith('.') ||
				file.name === 'node_modules' ||
				file.name === 'vendor' ||
				file.name === '.git') {
				continue;
			}

			if (file.isDirectory()) {
				// 递归计算子目录大小
				totalSize += getDirectorySize(fullPath);
			} else if (file.isFile()) {
				// 获取文件大小
				try {
					const stats = fs.statSync(fullPath);
					totalSize += stats.size;
				} catch (error) {
					// 忽略无法访问的文件
				}
			}
		}

		return totalSize;
	} catch (error) {
		logger.error(`计算目录大小失败: ${dirPath}`, error);
		return 0;
	}
}
