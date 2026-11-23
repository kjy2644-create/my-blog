'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const config = require('./config');
const { buildSite } = require('./index');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function createDevServer(distDir, basePath = '') {
  const root = path.resolve(distDir);

  const send = (req, res, status, body, headers = {}) => {
    res.writeHead(status, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  };

  const sendNotFound = async (req, res) => {
    try {
      const body = await fs.promises.readFile(path.join(root, '404.html'));
      send(req, res, 404, body, { 'Content-Type': MIME_TYPES['.html'] });
    } catch {
      send(req, res, 404, '페이지를 찾을 수 없습니다.');
    }
  };

  return http.createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(req, res, 405, '허용되지 않는 요청입니다.', { Allow: 'GET, HEAD' });
      return;
    }

    // 앞의 슬래시를 합쳐 //host 형태의 외부 리다이렉트를 막는다.
    const rawPath = req.url.split(/[?#]/, 1)[0].replace(/^\/+/, '/');
    let pathname;
    try {
      pathname = decodeURIComponent(rawPath);
    } catch {
      send(req, res, 400, '잘못된 주소입니다.');
      return;
    }
    if (pathname.includes('\0')) {
      send(req, res, 400, '잘못된 주소입니다.');
      return;
    }

    if (basePath) {
      if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) {
        await sendNotFound(req, res);
        return;
      }
      pathname = pathname.slice(basePath.length) || '/';
    }

    let target = path.resolve(root, `.${pathname}`);
    if (target !== root && !target.startsWith(root + path.sep)) {
      await sendNotFound(req, res);
      return;
    }

    try {
      const stat = await fs.promises.stat(target);
      if (stat.isDirectory()) {
        if (!rawPath.endsWith('/')) {
          send(req, res, 301, '', { Location: `${rawPath}/` });
          return;
        }
        target = path.join(target, 'index.html');
      }
      const body = await fs.promises.readFile(target);
      const type = MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream';
      send(req, res, 200, body, { 'Content-Type': type, 'Content-Length': body.length });
    } catch {
      await sendNotFound(req, res);
    }
  });
}

if (require.main === module) {
  try {
    const { outDir, postCount } = buildSite();
    const port = Number(process.env.PORT) || 4000;
    const server = createDevServer(outDir, config.basePath);
    server.on('error', (error) => {
      console.error(
        error.code === 'EADDRINUSE'
          ? `포트 ${port}이 이미 사용 중입니다. PORT=4001 node src/build/serve.js 처럼 다른 포트를 지정하세요.`
          : `서버 오류: ${error.message}`,
      );
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`글 ${postCount}편 빌드 완료: http://127.0.0.1:${port}${config.basePath}/`);
    });
  } catch (error) {
    console.error(`빌드 실패: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { createDevServer };
