// import * as vscode from 'vscode';
// import { Logger} from '../pkg/logger';

// const logger = Logger.withContext('GoDefinitionProvider');

// /**
//  * 拦截用户跳转行为
//  */
// class GoDefinitionProvider implements vscode.DefinitionProvider {
//   /**
//    * 提供定义位置
//    * @param document 文档
//    * @param position 位置
//    * @param token 取消令牌
//    */
//   public provideDefinition(
//     document: vscode.TextDocument,
//     position: vscode.Position,
//     token: vscode.CancellationToken
//   ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
//     logger.debug(`开始查找定义位置`);

//     // 检查是否按住了命令键
//     // VS Code 的 defineProvider 本身就是设计为当按住 Cmd/Ctrl 键时触发的
//     // 所以这里不需要额外检查，系统会自动处理

//     // 提取光标所在行的文本
//     const line = document.lineAt(position.line);
//     const text = line.text;

//     logger.debug(`当前行文本: ${text}`);

//     // 检查是否在import语句中 - 扩展匹配模式，支持带缩进和别名的导入
//     const importMatch = text.match(/import\s+(?:[\w_]+\s+)?["']([^"']+)["']/);
//     const simpleImportMatch = text.match(/^\s*(?:[\w_]+\s+)?["']([^"']+)["']/);

//     let importPath = '';
//     if (importMatch) {
//       // 标准导入语句 import "package"
//       importPath = importMatch[1];
//       logger.debug(`匹配到标准导入语句: ${importPath}`);
//     } else if (simpleImportMatch) {
//       // 简单导入字符串 "package"（多行导入块的一部分）
//       importPath = simpleImportMatch[1];
//       logger.debug(`匹配到简单导入字符串: ${importPath}`);
//     } else {
//       // 检查光标是否在字符串引号内
//       const lineText = line.text;
//       const character = position.character;

//       let inString = false;
//       let startQuote = -1;
//       let endQuote = -1;
//       let stringContent = '';

//       for (let i = 0; i < lineText.length; i++) {
//         if ((lineText[i] === '"' || lineText[i] === "'") && (i === 0 || lineText[i-1] !== '\\')) {
//           if (!inString) {
//             inString = true;
//             startQuote = i;
//           } else {
//             inString = false;
//             endQuote = i;

//             // 如果光标在这对引号之间
//             if (character > startQuote && character < endQuote) {
//               stringContent = lineText.substring(startQuote + 1, endQuote);
//               logger.debug(`光标在字符串内: "${stringContent}"`);

//               // 检查是否是包路径格式
//               if (stringContent.includes('/') && !stringContent.startsWith('./') && !stringContent.startsWith('../')) {
//                 logger.debug(`可能是包路径: ${stringContent}`);
//                 importPath = stringContent;
//                 break;
//               }
//             }
//           }
//         }
//       }

//       if (!importPath) {
//         logger.debug(`行文本不匹配import模式: ${text}`);
//         return undefined;
//       }
//     }

//     // 获取当前文件路径
//     const currentFilePath = document.uri.fsPath;

//     // 查找当前文件所属的模块
//     const modFilePath = this._fileModuleMapper.getFileModule(currentFilePath);
//     if (modFilePath) {
//       logger.debug(`当前文件 ${currentFilePath} 属于模块: ${modFilePath}`);
//       logger.debug(`优化后定位，将优先从当前模块的依赖中查找`);

//       // 优先从当前模块的依赖中查找
//       const result = this.provideDefinitionForPackagePath(importPath, modFilePath);
//       return result;
//     } else {
//       logger.debug(`当前文件 ${currentFilePath} 未映射到任何模块，将在所有模块中查找`);
//       logger.debug(`未优化定位，需要搜索所有模块的依赖`);

//       // 如果找不到所属模块，回退到原来的行为
//       const result = this.provideDefinitionForPackagePath(importPath);
//       logger.debug(`全局搜索结果: ${JSON.stringify(result)}`);
//       return result;
//     }
//   }
// }
