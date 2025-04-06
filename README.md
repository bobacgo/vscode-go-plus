# Go++

中文文档 [README_zh.md](README_zh.md)

Go++ is a VS Code extension designed to enhance Go development workflow by improving interface navigation and dependency management, making your Go coding experience more productive and efficient.

## Core Features

- **Interface Navigation**: Automatically detect and provide visual links between struct methods and interfaces
- **Go Dependency Management**: Visualize project dependencies with source code browsing and version management
- **Quick Run & Debug**: One-click execution and debugging for main functions with parameter support
- **Code Translation**: Multi-engine comment translation for international development teams

## Usage

### Interface Navigation

When implementing interface methods, Go++ automatically displays corresponding interface links above the method. Click to navigate to the interface definition. Supports multiple interface implementations - all relevant interfaces are listed when a method implements several interfaces.

### Dependency Management

Expand the "Go Library" panel in the VS Code explorer to view:

- Direct/indirect dependencies
- Replaced and excluded modules
- Tools and standard library

Right-click menu supports operations like tidy, update, and source code download.

### Shortcuts

| Feature                             | Keybinding           |
| ----------------------------------- | -------------------- |
| Focus/Exit Go Library               | Ctrl(⌘) + Shift + ' |
| Reveal current dependency in editor | Ctrl(⌘) + Shift + / |
| Collapse Go Library                 | Ctrl(⌘) + Shift + . |

## Code Example

```go
// Interface definition
type Greeter interface {
    SayHello() string
    SayGoodbye() string
}

// Implementation
type EnglishGreeter struct{}

// Link to Greeter interface will appear here
func (g *EnglishGreeter) SayHello() string {
    return "Hello!"
}
```

## Requirements

- VS Code 1.84.0+
- Go development environment
- Go extension (ms-vscode.go)

## Technical Implementation

Go++ is built on these core technologies:

### Interface Navigation

- CodeLens API for displaying navigation buttons
- AST analysis for identifying interface implementations
- Multi-level caching to prevent redundant parsing

### Dependency Management

- Custom tree view for module relationship visualization
- WebAssembly acceleration for complex module parsing
- Smart path resolution supporting both GOMODCACHE and GOPATH

### Performance Optimizations

- Lazy loading to reduce initialization time
- Debouncing techniques for high-frequency operations
- File system watchers for minimal updates

## Project Structure

```
gopp/
├── docs/                    # Documentation
├── resources/               # Icons and resources
├── src/
│   ├── core/                # Core implementations
│   │   ├── library/         # Dependency management
│   │   ├── translation/     # Translation features
│   │   └── home/            # Settings UI
│   ├── pkg/                 # Utilities
│   └── extension.ts         # Entry point
└── test/                    # Test files
```

## Contributing

Issues and Pull Requests are welcome to improve Go++. For problem reporting, use the built-in feedback form (supports automatic environment info collection).

## License

MIT
