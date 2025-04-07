module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module'
  },
  plugins: [
    '@typescript-eslint',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // 缩进使用4个空格 Use 4 spaces for indentation
    'indent': ['error', 4],
    // 允许使用console Console is allowed
    'no-console': 'off',
    // 分号结尾 Semicolons are required
    'semi': ['error', 'always'],
    // 使用单引号 Use single quotes
    'quotes': ['error', 'single'],
    // 允许使用any类型 Allow any type in certain cases
    '@typescript-eslint/no-explicit-any': 'off', // 完全关闭any警告 Turn off any type warnings completely
    // 允许使用非空断言 Allow non-null assertions
    '@typescript-eslint/no-non-null-assertion': 'off',
    // 允许使用require语句 Allow require statements
    '@typescript-eslint/no-var-requires': 'off',
    // 关闭不必要的转义字符警告 Turn off unnecessary escape warnings
    'no-useless-escape': 'off',
    // 允许使用Function类型 Allow Function type
    '@typescript-eslint/ban-types': ['error', {
      'types': {
        'Function': false
      }
    }],
    // 允许定义未使用的变量 Allow unused vars in certain cases
    '@typescript-eslint/no-unused-vars': ['warn', {
      'argsIgnorePattern': '.*',  // 允许任何未使用的参数 Allow any unused parameters
      'varsIgnorePattern': '.*'   // 允许任何未使用的变量 Allow any unused variables
    }],
    // 禁止混合使用空格和制表符 Disallow mixed spaces and tabs
    'no-mixed-spaces-and-tabs': 'error',
    // 有关缩进和空格问题的规则增强 Enhanced rules for indentation and spacing issues
    'no-trailing-spaces': 'error',
    'eol-last': ['error', 'always']
  },
  // 添加自动修复配置 Add auto-fix configuration
  ignorePatterns: ['out/**', '**/*.d.ts', 'node_modules/**'],
  env: {
    node: true
  }
};
