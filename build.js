const fs = require('fs');
const path = require('path');

// 简单的构建脚本：复制静态文件到 dist 目录
const srcDir = path.join(__dirname, 'src');
const distDir = path.join(__dirname, 'dist');

function copyDir(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// 清空并重建 dist
if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true });
fs.mkdirSync(distDir, { recursive: true });

// 复制 index.html
fs.copyFileSync(path.join(__dirname, 'index.html'), path.join(distDir, 'index.html'));

// 复制 src 目录
copyDir(srcDir, path.join(distDir, 'src'));

// 复制图标和启动图（如果存在）
const iconsDir = path.join(__dirname, 'icons');
const splashDir = path.join(__dirname, 'splash');
if (fs.existsSync(iconsDir)) copyDir(iconsDir, path.join(distDir, 'icons'));
if (fs.existsSync(splashDir)) copyDir(splashDir, path.join(distDir, 'splash'));

console.log('✅ Build complete! Files copied to dist/');
