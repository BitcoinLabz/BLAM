#!/usr/bin/env node
/**
 * Run the BLAM sync server locally (for development and tests): node scripts/sync-dev-server.js [port]
 * Uses the real worker code with a SQLite stand-in for Cloudflare D1.
 */
'use strict';
const http = require('http');
const { createD1 } = require('../test/helpers/d1-shim');

(async () => {
  const worker = await import('../worker/src/index.js');
  const env = { DB: createD1(process.env.SYNC_DB || ':memory:') };
  const port = Number(process.argv[2] || 8787);
  http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : body });
    const r = await worker.default.fetch(request, env);
    if (process.env.SYNC_LOG) { let base = ''; try { base = body ? JSON.parse(body).base : ''; } catch (_) { /* not json */ } console.log(new Date().toISOString().slice(11, 23), req.method, req.url.slice(0, 60), 'base=' + base, '->', r.status, (req.headers['user-agent'] || '').slice(0, 24)); }
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  }).listen(port, '127.0.0.1', () => console.log(`BLAM sync dev server on http://127.0.0.1:${port}`));
})();
