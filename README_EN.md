# Go++

Go++ is a Visual Studio Code extension that provides interface navigation functionality for Go language, helping developers quickly navigate between implementation classes and interfaces. It also integrates Go Library functionality for easy management and browsing of Go module dependencies.

## Features

- Display interface navigation links above implementation methods
- Quick navigation to interface definitions
- Support for multiple interface method navigation
- Go Library: Visually browse and manage Go module dependencies
- Quick run and debug of main functions

## Usage

### Interface Navigation

1. Install and enable the Go++ extension
2. Define interfaces and implementation classes in Go files
3. When the cursor is on an implementation method, interface navigation links will be displayed above the method
4. Click the link to jump to the corresponding interface definition

### Go Library

1. Look for the "Go Library" panel in the VS Code explorer view
2. Browse all Go module dependencies in your project
3. Support direct navigation to module source code
4. Execute module management operations like tidy

### Shortcuts

| Description                           | Keybinding           |
| ------------------------------------- | -------------------- |
| Focus the Go Library (package search) | Ctrl(⌘) + Shift + ' |
| Return to previous focus              | Ctrl(⌘) + Shift + ' |
| Reveal current active item in Editor  | Ctrl(⌘) + Shift + / |
| Quick Collapse Go Library             | Ctrl(⌘) + Shift + . |

## Example

```go
// Define interface
type Greeter interface {
    SayHello() string
    SayGoodbye() string
}

// Implementation class
type EnglishGreeter struct{}

// Interface navigation link will be displayed when implementing the method
func (g *EnglishGreeter) SayHello() string {
    return "Hello!"
}
```

## Requirements

- Visual Studio Code 1.84.0 or higher
- Go language development environment
- Go extension (ms-vscode.go)

## Project Structure

```

```

## Known Issues

No known issues.

## Release Notes

### 1.0.0

- Initial release
- Support for interface navigation
- Integration of Go Library functionality
- Support for quick run and debug of main functions

## Contributing

Issues and Pull Requests are welcome.

## Acknowledgements

- [Go Library](https://github.com/r3inbowari/go-mod-explorer) - Thanks to the original author for providing an excellent Go module browsing tool

## License

MIT

*Note: For Chinese documentation, please refer to [README.md](README.md)*
