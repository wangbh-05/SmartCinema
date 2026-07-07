/**
 * 简单的 HTTP 服务器
 * 用于开发和测试
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8080;

// MIME 类型映射
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 处理 OPTIONS 请求
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // 处理 GET 请求
    if (req.method === 'GET') {
        let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);

        // 安全检查：防止目录遍历
        const realPath = path.resolve(filePath);
        const realBase = path.resolve(__dirname);
        
        if (!realPath.startsWith(realBase)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
        }

        // 读取文件
        fs.readFile(filePath, (err, data) => {
            if (err) {
                // 返回 404
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end(`
                    <h1>404 Not Found</h1>
                    <p>请求的文件不存在: ${req.url}</p>
                    <hr>
                    <p><a href="/">返回首页</a></p>
                `, 'utf-8');
                return;
            }

            // 获取文件扩展名
            const ext = path.extname(filePath);
            const mimeType = mimeTypes[ext] || 'text/plain';

            // 返回文件
            res.writeHead(200, { 'Content-Type': mimeType });
            res.end(data);
        });
    } else {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
    }
});

server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║     SmartCinema 开发服务器运行中      ║
╚════════════════════════════════════════╝

📍 服务器地址: http://localhost:${PORT}
🌐 打开浏览器访问: http://localhost:${PORT}

按 Ctrl+C 停止服务器
    `);
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n\n✓ 服务器已关闭');
    process.exit(0);
});
