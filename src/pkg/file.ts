import { Uri, workspace, window } from 'vscode';
import {InterfaceInfo} from "../types";
import * as path from "path";

import { Logger } from './logger';

const logger = Logger.withContext('pkg/file');

var fs = require('fs');
var _openExplorer = require('open-file-explorer');

/**
 * 打开文件资源管理器
 * @param res 资源对象
 */
export function openExplorer(res: any) {
  let p = resolvePath(res.resourceUri);
  let stat = fs.lstatSync(p);

  if (stat.isFile()) {
    // trim right in order to get parent
    // node relative to the current file.
    p = getParentNode(p);
  }
  _openExplorer(p, (err: any) => {
    if (err) {
      console.log(err);
    }
  });
}

/**
 * 打开资源文件
 * @param resource 资源URI
 */
export function openResource(resource: Uri): void {
  if (process.platform === 'win32') {
    workspace.openTextDocument(Uri.file(resource.toString(true))).then(doc => {
      window.showTextDocument(doc);
    });
  } else {
    workspace.openTextDocument(Uri.parse(resource.toString(true))).then(doc => {
      window.showTextDocument(doc);
    });
  }
}

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
 * 解析资源路径
 * @param resource 资源URI
 * @returns 完整路径
 */
export function resolvePath(resource: Uri): string {
  try {
    // 对于Windows系统和其他系统分别处理
    const path = process.platform === 'win32' ? resource.toString(true) : resource.path;
    return path;
  } catch (error) {
    console.error('Error resolving path:', error);
    return '';
  }
}

/**
 * 获取父节点路径
 * @param path 当前路径
 * @returns 父节点路径
 */
export function getParentNode(path: string): string {
  let n = process.platform === 'win32' ? path.lastIndexOf('\\') : path.lastIndexOf('/');
  return path.substring(0, n);
}

/**
 * 递归遍历目录
 * @param currentDirPath 目录路径
 * @param callback 回调函数
 */
export function walkSync(currentDirPath: any, callback: any) {
  var fs = require('fs'),
    path = require('path');
  fs.readdirSync(currentDirPath, { withFileTypes: true }).forEach(function (dirent: any) {
    var filePath = path.join(currentDirPath, dirent.name);
    if (dirent.isFile()) {
      callback(filePath, dirent);
    } else if (dirent.isDirectory()) {
      walkSync(filePath, callback);
    }
  });
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
 * 查找匹配方法的接口
 * @param interfaces 接口信息数组
 * @param methodName 方法名称
 * @returns 匹配的接口信息或undefined
 */
export function findMatchingInterface(interfaces: InterfaceInfo[], methodName: string): InterfaceInfo | undefined {
  return interfaces.find(iface => iface.methods.includes(methodName));
}

/**
 * 查找目录中的所有 Go 文件
 * @param dir 目录路径
 * @returns Go 文件路径数组
 */
export async function findAllGoFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function scanDirectory(dir: string) {
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.go')) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      console.error(`Failed to scan directory ${dir}:`, err);
    }
  }

  await scanDirectory(dir);
  return files;
}

/**
 * 查找方法在文件中的行号
 * @param methodName 方法名称
 * @param structName 结构体名称
 * @param filePath 文件路径
 * @returns 方法行号
 */
export function findMethodLineNumber(methodName: string, structName: string, filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 匹配方法定义 func (receiver *StructName) MethodName(
      const methodMatch = line.match(new RegExp(`func\\s*\\(\\s*\\w+\\s+\\*?${structName}\\s*\\)\\s*${methodName}\\s*\\(`));
      if (methodMatch) {
        return i + 1;
      }
    }
  } catch (err) {
    console.error(`Failed to read file ${filePath}:`, err);
  }

  return 0;
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
