# Basic variables
# 基本变量定义
BINARY_NAME := cgo
OUTPUT_DIR := ../../resources/bin
SRC_FILE := ./main.go

# Target for WebAssembly
# WebAssembly 平台目标
.PHONY: build
build:
	@echo "Building $(BINARY_NAME) for wasm..."
	@mkdir -p $(OUTPUT_DIR)
	@GOOS=js GOARCH=wasm go build -ldflags="-s -w" -o $(OUTPUT_DIR)/$(BINARY_NAME).wasm $(SRC_FILE)
	@cp "$(shell go env GOROOT)/lib/wasm/wasm_exec.js" $(OUTPUT_DIR)/
	@echo "Build complete: $(OUTPUT_DIR)/$(BINARY_NAME).wasm"
