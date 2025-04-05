package test

// Greeter 接口定义了基本的问候方法
type Greeter interface {
	// SayHello 返回问候语
	SayHello() string
	// SayGoodbye 返回告别语
	SayGoodbye() string
}

// EnglishGreeter 实现了 Greeter 接口
type EnglishGreeter struct{}

// SayHello 返回英文问候语
func (g *EnglishGreeter) SayHello() string {
	return "Hello!"
}

// SayGoodbye 返回英文告别语
func (g *EnglishGreeter) SayGoodbye() string {
	return "Goodbye!"
}

// ChineseGreeter 也实现了 Greeter 接口
type ChineseGreeter struct{}

// SayHello 返回中文问候语
func (g *ChineseGreeter) SayHello() string {
	return "你好！"
}

// SayGoodbye 返回中文告别语
func (g *ChineseGreeter) SayGoodbye() string {
	return "再见！"
}
