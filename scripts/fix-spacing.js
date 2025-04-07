const fs = require('fs');
const path = require('path');
const glob = require('glob');

/**
 * 修复文件中的混合空格和制表符问题
 * Fix mixed spaces and tabs issues in files
 * @param {string} filePath - 文件路径 File path
 */
function fixSpacingInFile(filePath) {
    console.log(`Processing: ${filePath}`);
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // 替换制表符为4个空格 Replace tabs with 4 spaces
    const fixedContent = content.replace(/\t/g, '    ');
    
    if (content !== fixedContent) {
        fs.writeFileSync(filePath, fixedContent, 'utf8');
        console.log(`Fixed: ${filePath}`);
    }
}

/**
 * 递归查找并修复所有TypeScript文件
 * Recursively find and fix all TypeScript files
 */
function fixAllFiles() {
    const rootDir = path.resolve(__dirname, '..');
    const files = glob.sync('**/*.{ts,tsx}', { 
        cwd: rootDir, 
        ignore: ['node_modules/**', 'out/**'] 
    });
    
    files.forEach(file => {
        fixSpacingInFile(path.join(rootDir, file));
    });
    
    console.log('All files processed!');
}

fixAllFiles();
