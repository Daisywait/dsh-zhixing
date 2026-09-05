import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readArchive, handoff } from './scripts/store.mjs';
import {initialize} from './lib/storage.js';
const root = fileURLToPath(new URL('./', import.meta.url));
await initialize(root);
const assets = new Map([['/', ['public/index.html','text/html']], ['/app.js',['public/app.js','text/javascript']], ['/style.css',['public/worktable.css','text/css']], ['/lucide.js',['public/lucide.js','text/javascript']]]);
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
  if (req.method !== 'GET') { res.writeHead(405); return res.end('Read-only dashboard'); }
  try {
    const route = new URL(req.url, 'http://127.0.0.1').pathname;
    let content, type;
    if (route === '/api/archive' || route === '/download/archive') { content = JSON.stringify(await readArchive(root), null, 2); type = 'application/json'; }
    else if (route === '/api/demo' || route === '/download/demo') { content = await readFile(new URL('./examples/demo.json', import.meta.url)); type = 'application/json'; }
    else if (route === '/api/handoff' || route === '/download/handoff') { content = handoff(await readArchive(root)); type = 'text/plain'; }
    else if (assets.has(route)) { const asset = assets.get(route); content = await readFile(new URL(asset[0], import.meta.url)); type = asset[1]; }
    else { res.writeHead(404); return res.end('Not found'); }
    if (route.startsWith('/download/')) {
      const file = route.endsWith('handoff') ? 'learning-handoff.md' : route.endsWith('demo') ? 'learning-demo.json' : 'learning-archive.json';
      res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    }
    res.writeHead(200, {'Content-Type':`${type}; charset=utf-8`}); res.end(content);
  } catch { res.writeHead(500); res.end('Archive unavailable. Check the archive file and server logs.'); }
});
let port = Number(process.env.LEARNING_LAB_PORT || 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid LEARNING_LAB_PORT');
let retries = 0;
server.on('error', e => { if (e.code === 'EADDRINUSE' && retries++ < 20 && port < 65535) server.listen(++port, '127.0.0.1'); else { console.error(e); process.exitCode = 1; } });
server.on('listening', () => console.log(`Learning Lab: http://127.0.0.1:${port}`));
server.listen(port, '127.0.0.1');
