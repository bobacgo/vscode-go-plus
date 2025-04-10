import * as vscode from 'vscode';
import { registerCommandWorkspaceNavigator } from './home';
import {
    registerCommandGenerateOptions,
    registerCommandGenerateOptionCode,
    registerCommandGenerateInterfaceStubs,
    registerCommandShowStructOptions,
    registerCommandGenerateStructTags,
    registerCommandFuncTest
} from './generate';
import {
    registerCommandNavigateToInterface,
    registerCommandNavigateToInterfaceMethod,
    registerCommandListInterfaceImplementations,
    registerCommandListMethodImplementations
} from './interface';
import {
    registerCommandRunMain,
    registerCommandDebugMain,
    registerCommandSetMainArgs
} from './main';

export function DisposeCommands(ctx : vscode.ExtensionContext) : Array<vscode.Disposable> {
    return [
        // Home
        registerCommandWorkspaceNavigator(ctx, 'gopp.workspaceNavigator'), // 工作空间导航器

        // 注册各种生成命令
        registerCommandGenerateOptions('gopp.generateOptions'),
        registerCommandGenerateOptionCode('gopp.generateOptionCode'),
        registerCommandGenerateInterfaceStubs('gopp.generateInterfaceStubs'),
        registerCommandGenerateStructTags('gopp.generateStructTags'), // 生成结构体标签
        registerCommandShowStructOptions('gopp.showStructOptions'), // 显示结构选项
        registerCommandFuncTest('gopp.executeFunctionTest'), // 生成函数测试

        // 导航相关命令
        registerCommandNavigateToInterface('gopp.navigateToInterface'), // 跳转到接口定义
        registerCommandNavigateToInterfaceMethod('gopp.navigateToInterfaceMethod'), // 跳转到接口方法
        registerCommandListInterfaceImplementations('gopp.listInterfaceImplementations'), // 列出接口实现
        registerCommandListMethodImplementations('gopp.listMethodImplementations'), // 列出方法实现

        // main函数相关命令
        registerCommandRunMain(ctx, 'gopp.runMain'), // 运行main函数
        registerCommandDebugMain(ctx, 'gopp.debugMain'), // 调试main函数
        registerCommandSetMainArgs(ctx, 'gopp.setMainArgs'), // 设置main函数参数
    ];
}


