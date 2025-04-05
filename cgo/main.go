//go:build js && wasm
// +build js,wasm

package main

import (
	"encoding/json"
	"fmt"
	"syscall/js"

	"golang.org/x/mod/modfile"
)

// ParseMod parses a go.mod file and puts result into global buffer
// 解析 go.mod 文件并将结果存入全局缓冲区
func ParseMod(this js.Value, args []js.Value) any {
	var content string
	if len(args) == 0 {
		return createErrorJSON("no path provided")
	}
	content = args[0].String()

	// Check if file is empty
	// 检查文件是否为空
	if len(content) == 0 {
		return createErrorJSON("go.mod file is empty")
	}

	// Parse go.mod file
	// 解析 go.mod 文件
	modFile, err := modfile.Parse("go.mod", []byte(content), nil)
	if err != nil {
		return createErrorJSON(fmt.Sprintf("failed to parse go.mod: %s", err.Error()))
	}

	// Create result structure
	// 创建结果结构
	modInfo := createModInfo(modFile)

	// Marshal result to JSON
	// 将结果序列化为 JSON
	result, err := json.Marshal(modInfo)
	if err != nil {
		return createErrorJSON(fmt.Sprintf("failed to marshal result: %s", err.Error()))
	}

	return string(result)
}

// Encapsulate modFile parsing into a separate function to improve readability
// 将 modFile 解析封装到单独的函数中以提高可读性
func createModInfo(modFile *modfile.File) *ModFile {
	// Ensure module is specified
	// 确保指定了模块
	if modFile.Module == nil || modFile.Module.Mod.Path == "" {
		return &ModFile{} // Return empty structure
	}

	modInfo := &ModFile{
		Module: modFile.Module.Mod.Path,
	}

	// Set Go version if available
	// 设置 Go 版本（如果可用）
	if modFile.Go != nil {
		modInfo.Go = modFile.Go.Version
	}

	// Set toolchain if available
	// 设置工具链（如果可用）
	if modFile.Toolchain != nil {
		modInfo.Toolchain = modFile.Toolchain.Name
	}

	// Process required modules
	// 处理所需模块
	for _, req := range modFile.Require {
		modInfo.Require = append(modInfo.Require, Mod{
			Path:     req.Mod.Path,
			Version:  req.Mod.Version,
			Indirect: req.Indirect,
		})
	}

	// Process replaced modules
	// 处理替换的模块
	for _, rep := range modFile.Replace {
		modInfo.Replace = append(modInfo.Replace, Mod{
			Path:    rep.New.Path,
			Version: rep.New.Version,
		})
	}

	// Process excluded modules
	// 处理排除的模块
	for _, exc := range modFile.Exclude {
		modInfo.Exclude = append(modInfo.Exclude, Mod{
			Path:    exc.Mod.Path,
			Version: exc.Mod.Version,
		})
	}

	// Process tools
	// 处理工具
	for _, tool := range modFile.Tool {
		modInfo.Tool = append(modInfo.Tool, Mod{Path: tool.Path})
	}

	return modInfo
}

// createErrorJSON creates a JSON string containing error information
// createErrorJSON 创建包含错误信息的 JSON 字符串
func createErrorJSON(message string) string {
	errorObj := map[string]string{"error": message}
	errorJSON, _ := json.Marshal(errorObj)
	return string(errorJSON)
}

// Keep these types unchanged
// 保持这些类型不变
type Mod struct {
	Path     string `json:"path"`
	Version  string `json:"version"`
	Indirect bool   `json:"indirect"` // has "// indirect" comment
}

type ModFile struct {
	Module    string `json:"module"`    // module github.com/example/project
	Go        string `json:"go"`        // go 1.21
	Toolchain string `json:"toolchain"` // toolchain go1.21
	Require   []Mod  `json:"require"`   // require github.com/example/dependency v1.0.0
	Replace   []Mod  `json:"replace"`
	Exclude   []Mod  `json:"exclude"`
	Tool      []Mod  `json:"tool"` // google.golang.org/grpc/cmd/protoc-gen-go-grpc
}

func main() {
	done := make(chan int, 0)
	js.Global().Set("ParseModFunc", js.FuncOf(ParseMod))
	<-done
}
