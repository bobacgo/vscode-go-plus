import * as fs from 'fs';
import * as vscode from 'vscode';
import { runInThisContext } from 'vm';
import { Logger } from './logger';
import { getResourceUri } from './resource';

const logger = Logger.withContext('pkg/wasm');

/**
 * Enumeration of Go WASM exported function names
 * Go WASM 导出函数名枚举
 */
export enum GoWasmFunction {
    // Parse go.mod file to JSON
    // 解析 go.mod 文件为 JSON
    ParseModFunc = 'ParseModFunc',

    // Parse AST
    // 解析 AST
    ParseAst = 'ParseAst',

    // Format Go code
    // 格式化 Go 代码
    FormatCode = 'FormatCode'
}

/**
 * WASM utilities for loading and executing WebAssembly modules
 * WASM 工具类，用于加载和执行 WebAssembly 模块
 */
export class WasmExecutor {
    // Cache for wasm instances to improve performance
    // 缓存 wasm 实例以提高性能
    private static instance: WebAssembly.Instance | null = null;
    private static initialized = false;

    // Constants for paths
    // 路径常量
    private static readonly WASM_EXEC_PATH = 'bin/wasm_exec.js';
    private static readonly WASM_MODULE_PATH = 'bin/cgo.wasm';

    /**
     * Initialize and run a WASM module
     * 初始化并运行WASM模块
     *
     * @param ctx Extension context 扩展上下文
     * @returns Promise that resolves when the WASM module is initialized
     */
    public static async initWasm(ctx: vscode.ExtensionContext): Promise<void> {
        // Check if Go runtime is available, load it if not
        // 检查Go运行时是否可用，如果不可用则加载
        if (!(globalThis as any).Go) {
            const wasmExecCode = fs.readFileSync(getResourceUri(ctx, this.WASM_EXEC_PATH).fsPath, 'utf-8');
            runInThisContext(wasmExecCode);
        }

        // Check if module is already initialized
        // 检查模块是否已初始化
        if (WasmExecutor.initialized) {
            return;
        }

        const wasmUri = getResourceUri(ctx, this.WASM_MODULE_PATH);
        const wasmBytes = fs.readFileSync(wasmUri.fsPath);
        const go = new (globalThis as any).Go();

        // Use async instantiation for better performance
        // 使用异步实例化提高性能
        if (!WasmExecutor.instance) {
            try {
                const { instance } = await WebAssembly.instantiate(wasmBytes, go.importObject);
                WasmExecutor.instance = instance;

                // Run the WASM module to register functions
                // 运行WASM模块以注册函数
                go.run(instance);
                WasmExecutor.initialized = true;
            } catch (error) {
                logger.error(`Failed to instantiate WASM module: ${error}`);
                throw error;
            }
        }
    }

    /**
     * Call a function exposed by a WASM module
     * 调用WASM模块暴露的函数
     *
     * @param ctx Extension context 扩展上下文
     * @param functionName Name of the function to call 要调用的函数名称
     * @param args Arguments to pass to the function 要传递给函数的参数
     * @returns Result of the function call 函数调用结果
     */
    public static async callFunction<T>(
        ctx: vscode.ExtensionContext,
        functionName: GoWasmFunction,
        ...args: any[]
    ): Promise<T> {
        try {
            // Initialize WASM environment if not already done
            // 如果尚未初始化，则初始化WASM环境
            if (!WasmExecutor.initialized) {
                await this.initWasm(ctx);
            }

            // Get registered function from global object
            // 从全局对象中获取注册的函数
            const func = (globalThis as any)[functionName];
            if (typeof func !== 'function') {
                logger.warn(`Function ${functionName} not found in WASM module`);
                throw new Error(`Function ${functionName} not found`);
            }

            // Call the function with provided arguments
            // 使用提供的参数调用函数
            return func(...args) as T;
        } catch (error) {
            logger.error(`WASM execution failed: ${error}`);
            throw error;
        }
    }
}
