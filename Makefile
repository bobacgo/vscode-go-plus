# VSCode GO+ 扩展的构建和安装 Makefile
# Build and installation Makefile for VSCode GO+ extension

.PHONY: all package install clean publish compile watch

# 默认目标：打包并安装
# Default target: package and install
all: compile package install

# 编译扩展源代码
# Compile extension source code
compile:
	@echo "正在编译扩展源代码... (Compiling extension source code...)"
	npm run lint:fix && \
	npm run compile

# 开发模式：监视文件修改并自动重新编译
# Development mode: watch for file changes and recompile automatically
watch:
	@echo "启动开发模式，监视文件变化... (Starting development mode, watching for file changes...)"
	npm run watch

# 打包扩展
# Package the extension
package:
	@echo "开始打包扩展... (Packaging extension...)"
	vsce package

# 安装扩展到 VSCode
# Install extension to VSCode
install:
	@echo "正在安装扩展... (Installing extension...)"
	@VSIX_FILE=$$(ls -t *.vsix 2>/dev/null | head -1); \
	if [ -z "$$VSIX_FILE" ]; then \
		echo "❌ 未找到 vsix 文件，请先执行打包 (No vsix file found, please package first)"; \
		exit 1; \
	else \
		echo "正在安装 (Installing): $$VSIX_FILE"; \
		code --install-extension $$VSIX_FILE && \
		echo "✅ 安装成功！请重启 VSCode 来激活扩展 (Installation successful! Please restart VSCode to activate the extension)" || \
		echo "❌ 安装失败，请检查错误信息 (Installation failed, please check error messages)"; \
	fi

# 发布扩展到 VSCode 插件市场
# Publish extension to VSCode Marketplace
publish:
	@echo "正在发布扩展到插件市场... (Publishing extension to marketplace...)"
	@if git tag | grep -q "$$(node -p "require('./package.json').version" | xargs -I{} echo "v{}")"; then \
		echo "⚠️ 版本标签已存在，增加版本号... (Version tag exists, incrementing version...)"; \
		npm --no-git-tag-version version patch && \
		echo "更新到新版本 (Updated to new version): v$$(node -p "require('./package.json').version")" && \
		git add package.json package-lock.json && \
		git commit -m "chore: bump version to $$(node -p "require('./package.json').version")" && \
		git tag -a "v$$(node -p "require('./package.json').version")" -m "v$$(node -p "require('./package.json').version")"; \
	else \
		npm version patch; \
	fi
	git push --follow-tags
	@echo "✅ 发布流程已完成! (Publishing process completed!)"

# 清理构建文件
# Clean build artifacts
clean:
	@echo "清理构建文件... (Cleaning build artifacts...)"
	rm -f *.vsix
