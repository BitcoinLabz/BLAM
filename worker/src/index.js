/**
 * BLAM sync server — a dumb, end-to-end-encrypted mailbox.
 *
 *   GET    /v1/vault/:id[?rev=N]   -> 200 { rev, blob } | 204 (unchanged since N) | 404
 *   PUT    /v1/vault/:id            body { base, blob }  header X-Sync-Auth
 *                                   -> 200 { rev } | 409 { rev, blob } (someone else wrote first)
 *   DELETE /v1/vault/:id            header X-Sync-Auth -> 204
 *   GET    /v1/health               -> 200 { ok: true }
 *
 * :id and the auth token are both derived on the device from the sync key; the key itself and
 * the readable data never reach this server. Vaults not touched for 12 months are deleted daily.
 */
const MAX_BLOB = 1_900_000;            // characters of base64 (D1 rows are capped at ~2 MB)
const RETAIN_MS = 365 * 24 * 3600e3;   // 12 months
const TOUCH_MS = 7 * 24 * 3600e3;      // reads refresh the retention clock at most weekly
const ID_RE = /^[a-f0-9]{32}$/;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Auth',
  'Access-Control-Max-Age': '86400',
};
const json = (status, body) => new Response(body == null ? null : JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// Constant-time comparison of two hex strings.
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function handle(request, env, now = Date.now()) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (url.pathname === '/v1/health') return json(200, { ok: true });
  const m = url.pathname.match(/^\/v1\/vault\/([^/]+)$/);
  if (!m || !ID_RE.test(m[1])) return json(404, { error: 'not_found' });
  const id = m[1];
  const row = await env.DB.prepare('SELECT auth, rev, blob, updated FROM vaults WHERE id = ?').bind(id).first();

  if (request.method === 'GET') {
    if (!row) return json(404, { error: 'not_found' });
    if (now - row.updated > TOUCH_MS) await env.DB.prepare('UPDATE vaults SET updated = ? WHERE id = ?').bind(now, id).run();
    const since = Number(url.searchParams.get('rev'));
    if (Number.isFinite(since) && since === row.rev) return new Response(null, { status: 204, headers: cors });
    return json(200, { rev: row.rev, blob: row.blob });
  }

  const token = request.headers.get('X-Sync-Auth') || '';
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return json(401, { error: 'unauthorized' });
  const authHash = await sha256Hex(token);
  if (row && !same(row.auth, authHash)) return json(403, { error: 'forbidden' });

  if (request.method === 'DELETE') {
    if (row) await env.DB.prepare('DELETE FROM vaults WHERE id = ?').bind(id).run();
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method === 'PUT') {
    let body;
    try { body = await request.json(); } catch (_) { return json(400, { error: 'bad_json' }); }
    const blob = body && body.blob;
    const base = Number(body && body.base);
    if (typeof blob !== 'string' || !blob || !/^[A-Za-z0-9+/=]+$/.test(blob)) return json(400, { error: 'bad_blob' });
    if (blob.length > MAX_BLOB) return json(413, { error: 'too_large', max: MAX_BLOB });
    if (!row) {
      if (base !== 0) return json(409, { error: 'gone', rev: 0, blob: null });
      await env.DB.prepare('INSERT INTO vaults (id, auth, rev, blob, updated) VALUES (?, ?, 1, ?, ?)').bind(id, authHash, blob, now).run();
      return json(200, { rev: 1 });
    }
    if (base !== row.rev) return json(409, { error: 'conflict', rev: row.rev, blob: row.blob });
    // Compare-and-swap so two simultaneous writers can't both win.
    const res = await env.DB.prepare('UPDATE vaults SET rev = rev + 1, blob = ?, updated = ? WHERE id = ? AND rev = ?').bind(blob, now, id, row.rev).run();
    if (!res.meta || res.meta.changes !== 1) {
      const cur = await env.DB.prepare('SELECT rev, blob FROM vaults WHERE id = ?').bind(id).first();
      return json(409, { error: 'conflict', rev: cur ? cur.rev : 0, blob: cur ? cur.blob : null });
    }
    return json(200, { rev: row.rev + 1 });
  }
  return json(405, { error: 'method_not_allowed' });
}

export async function cleanup(env, now = Date.now()) {
  const res = await env.DB.prepare('DELETE FROM vaults WHERE updated < ?').bind(now - RETAIN_MS).run();
  return res.meta ? res.meta.changes : 0;
}

export default {
  async fetch(request, env) {
    try { return await handle(request, env); } catch (e) { return json(500, { error: 'server_error' }); }
  },
  async scheduled(_event, env) { await cleanup(env); },
};
