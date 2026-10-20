import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('.');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' };
http.createServer(async (req,res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (path !== root && !path.startsWith(root + sep)) throw new Error('Invalid path');
    const actual = path === root ? resolve(root, 'index.html') : path;
    res.writeHead(200, { 'Content-Type': `${types[extname(actual)] || 'text/plain'}; charset=utf-8`, 'Cache-Control':'no-store' });
    res.end(await readFile(actual));
  } catch { res.writeHead(404); res.end('Não encontrado'); }
}).listen(4173, '127.0.0.1', () => console.log('http://localhost:4173'));
