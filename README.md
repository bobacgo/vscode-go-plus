# Go++

Go++ 是一个 Visual Studio Code 扩展，它提供了 Go 语言接口跳转功能，帮助开发者在实现类和接口之间快速导航，并集成了 Go Library 功能，方便管理和浏览 Go 模块依赖。

## 功能特性

- 在实现类的方法上方显示接口跳转链接
- 快速导航到接口定义
- 支持多个接口方法的跳转
- Go Library：可视化浏览和管理 Go 模块依赖
- main 函数的快速运行和调试

## 使用方法

### 接口导航

1. 安装并启用 Go++扩展
2. 在 Go 文件中定义接口和实现类
3. 当光标位于实现类的方法上时，会在方法上方显示接口跳转链接
4. 点击链接即可跳转到对应的接口定义

### Go Library

1. 在 VS Code 资源管理器中，查看 "Go Library" 面板
2. 浏览项目中的所有 Go 模块依赖
3. 支持直接跳转到模块源码
4. 可以执行 tidy 等模块管理操作

### 快捷键

| 描述                       | 快捷键               |
| -------------------------- | -------------------- |
| 聚焦 Go Library(包名搜索)  | Ctrl(⌘) + Shift + ' |
| 返回到之前的焦点           | Ctrl(⌘) + Shift + ' |
| 在编辑器中显示当前活动项目 | Ctrl(⌘) + Shift + / |
| 快速折叠 Go Library        | Ctrl(⌘) + Shift + . |

## 示例

```go
// 定义接口
type Greeter interface {
    SayHello() string
    SayGoodbye() string
}

// 实现类
type EnglishGreeter struct{}

// 实现方法时会显示接口跳转链接
func (g *EnglishGreeter) SayHello() string {
    return "Hello!"
}
```

## 要求

- Visual Studio Code 1.84.0 或更高版本
- Go 语言开发环境
- Go 扩展 (ms-vscode.go)

## 项目结构

```

```

## 已知问题

暂无已知问题。

## 发布说明

### 1.0.0

- 初始版本发布
- 支持接口跳转功能
- 集成 Go Library 功能
- 支持 main 函数的快速运行和调试

## 贡献

欢迎提交 Issue 和 Pull Request。

## 致谢

- [Go Library](https://github.com/r3inbowari/go-mod-explorer) - 感谢原作者提供了优秀的 Go 模块浏览工具

## 许可证

MIT

*注：查看英文文档请参阅 [README_EN.md](README_EN.md)*
