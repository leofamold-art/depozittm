const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const ROOT_DIR = __dirname;
const PASSWORD = process.env.DASH_PASSWORD || '1181';
const SESSION_SECRET = process.env.DASH_SESSION_SECRET || PASSWORD;
const SESSION_COOKIE = 'dash_auth';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

function setSecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function sendText(res, statusCode, text) {
    setSecurityHeaders(res);
    res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(text);
}

function base64UrlEncode(buf) {
    return Buffer.from(buf)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function base64UrlDecode(str) {
    const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(normalized + pad, 'base64');
}

function signSession(payloadJson) {
    const payload = base64UrlEncode(Buffer.from(payloadJson, 'utf8'));
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest();
    return `${payload}.${base64UrlEncode(sig)}`;
}

function verifySessionToken(token) {
    if (!token || typeof token !== 'string') return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;

    const [payload, sig] = parts;
    let expected = '';
    try {
        expected = base64UrlEncode(crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest());
    } catch {
        return false;
    }
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    if (!crypto.timingSafeEqual(a, b)) return false;

    let obj = null;
    try {
        obj = JSON.parse(base64UrlDecode(payload).toString('utf8'));
    } catch {
        return false;
    }

    const now = Math.floor(Date.now() / 1000);
    if (!obj || typeof obj !== 'object') return false;
    if (typeof obj.exp !== 'number') return false;
    if (obj.exp <= now) return false;
    return true;
}

function parseCookies(req) {
    const header = req.headers.cookie;
    const out = {};
    if (!header || typeof header !== 'string') return out;

    const parts = header.split(';');
    for (const part of parts) {
        const idx = part.indexOf('=');
        if (idx < 0) continue;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (!key) continue;
        out[key] = value;
    }
    return out;
}

function isHttps(req) {
    const xfProto = req.headers['x-forwarded-proto'];
    if (typeof xfProto === 'string' && xfProto.toLowerCase() === 'https') return true;
    if (process.env.VERCEL) return true;
    return false;
}

function setCookie(res, req, name, value, { maxAgeSeconds } = {}) {
    const parts = [];
    parts.push(`${name}=${value}`);
    parts.push('Path=/');
    parts.push('HttpOnly');
    parts.push('SameSite=Strict');
    if (isHttps(req)) parts.push('Secure');
    if (typeof maxAgeSeconds === 'number') parts.push(`Max-Age=${Math.floor(maxAgeSeconds)}`);
    res.setHeader('Set-Cookie', parts.join('; '));
}

function redirect(res, statusCode, location) {
    setSecurityHeaders(res);
    res.writeHead(statusCode, { Location: location, 'Cache-Control': 'no-store' });
    res.end();
}

function getLoginPageHtml(hasError) {
    const errorBlock = hasError
        ? '<div class="err">Неверный пароль</div>'
        : '';
    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Вход</title>
  <style>
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0d1520; color: #e0e6ed; }
    .wrap { height: 100%; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { 
      width: 100%; 
      max-width: 380px; 
      background: #1a2940; 
      border: 1px solid #2a3f55; 
      border-radius: 16px; 
      padding: 32px; 
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
    }
    h1 { margin: 0 0 24px; font-size: 20px; font-weight: 600; color: #fff; text-align: center; }
    .input-group { position: relative; margin-bottom: 20px; }
    input { 
      width: 100%; 
      padding: 12px 16px; 
      border-radius: 10px; 
      border: 2px solid #2a3f55; 
      background: #0d1520; 
      color: #fff; 
      font-size: 16px; 
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input:focus { border-color: #2196F3; box-shadow: 0 0 0 4px rgba(33, 150, 243, 0.15); }
    button { 
      width: 100%; 
      padding: 12px; 
      border: 0; 
      border-radius: 10px; 
      background: #2196F3; 
      color: #fff; 
      font-size: 16px; 
      font-weight: 600;
      cursor: pointer; 
      transition: background 0.2s, transform 0.1s;
    }
    button:hover { background: #1e88e5; }
    button:active { transform: scale(0.98); }
    .err { margin-top: 16px; color: #ff5252; font-size: 14px; text-align: center; font-weight: 500; }
  </style>
</head>
<body>
  <div class="wrap">
    <form class="card" method="POST" action="/login">
      <h1>Вход в дашборд</h1>
      <div class="input-group">
        <input id="password" name="password" type="password" placeholder="Введите пароль" autocomplete="current-password" autofocus required />
      </div>
      <button type="submit">Войти</button>
      ${errorBlock}
    </form>
  </div>
</body>
</html>`;
}

function readRequestBody(req, maxBytes) {
    return new Promise((resolve, reject) => {
        let total = 0;
        const chunks = [];

        req.on('data', (chunk) => {
            total += chunk.length;
            if (total > maxBytes) {
                reject(new Error('too_large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

function parseFormUrlEncoded(body) {
    const out = {};
    const params = new URLSearchParams(body);
    for (const [k, v] of params.entries()) out[k] = v;
    return out;
}

function createSessionToken() {
    const now = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ iat: now, exp: now + SESSION_TTL_SECONDS });
    return signSession(payload);
}

function isLoggedIn(req) {
    const cookies = parseCookies(req);
    return verifySessionToken(cookies[SESSION_COOKIE]);
}

function hasHiddenSegment(pathname) {
    const segments = pathname.split('/').filter(Boolean);
    return segments.some((s) => s.startsWith('.') && s.length > 1);
}

function resolveRequestPath(req) {
    const host = typeof req.headers.host === 'string' ? req.headers.host : 'localhost';
    const url = new URL(req.url || '/', `http://${host}`);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname.includes('\0')) return null;
    pathname = pathname.replace(/\\/g, '/');

    if (pathname === '/') pathname = '/index.html';
    if (pathname.endsWith('/')) pathname += 'index.html';

    if (hasHiddenSegment(pathname)) return null;

    const rootResolved = path.resolve(ROOT_DIR);
    const joined = path.join(ROOT_DIR, pathname.replace(/^\/+/, ''));
    const resolved = path.resolve(path.normalize(joined));

    const withinRoot = resolved === rootResolved || resolved.startsWith(rootResolved + path.sep);
    if (!withinRoot) return null;

    if (path.basename(resolved).toLowerCase() === 'server.js') return null;

    return resolved;
}

function handler(req, res) {
    const host = typeof req.headers.host === 'string' ? req.headers.host : 'localhost';
    const url = new URL(req.url || '/', `http://${host}`);
    const pathname = url.pathname || '/';

    if (req.method === 'GET' && pathname === '/login') {
        const hasError = url.searchParams.get('e') === '1';
        const html = getLoginPageHtml(hasError);
        setSecurityHeaders(res);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(html);
        return;
    }

    if (req.method === 'POST' && pathname === '/login') {
        readRequestBody(req, 2048)
            .then((body) => {
                const form = parseFormUrlEncoded(body);
                const password = typeof form.password === 'string' ? form.password : '';
                if (password !== PASSWORD) {
                    redirect(res, 302, '/login?e=1');
                    return;
                }

                const token = createSessionToken();
                setSecurityHeaders(res);
                setCookie(res, req, SESSION_COOKIE, token, { maxAgeSeconds: SESSION_TTL_SECONDS });
                res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store' });
                res.end();
            })
            .catch(() => sendText(res, 400, 'Bad Request'));
        return;
    }

    if (req.method === 'GET' && pathname === '/logout') {
        setSecurityHeaders(res);
        setCookie(res, req, SESSION_COOKIE, '', { maxAgeSeconds: 0 });
        res.writeHead(302, { Location: '/login', 'Cache-Control': 'no-store' });
        res.end();
        return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendText(res, 405, 'Method Not Allowed');
        return;
    }

    if (!isLoggedIn(req)) {
        redirect(res, 302, '/login');
        return;
    }

    let filePath = null;
    try {
        filePath = resolveRequestPath(req);
    } catch {
        sendText(res, 400, 'Bad Request');
        return;
    }

    if (!filePath) {
        sendText(res, 404, 'Not found');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            sendText(res, 404, 'Not found');
            return;
        }

        setSecurityHeaders(res);
        res.setHeader('Content-Type', ext === '.html' || ext === '.css' || ext === '.js' || ext === '.json'
            ? `${contentType}; charset=utf-8`
            : contentType);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Cache-Control', 'no-store');

        res.writeHead(200);
        if (req.method === 'HEAD') {
            res.end();
            return;
        }

        const stream = fs.createReadStream(filePath);
        stream.on('error', () => sendText(res, 500, 'Internal Server Error'));
        stream.pipe(res);
    });
}

function createServer() {
    return http.createServer(handler);
}

module.exports = handler;
module.exports.createServer = createServer;

if (require.main === module) {
    createServer().listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}
