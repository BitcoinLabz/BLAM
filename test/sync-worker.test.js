/* Tests for the sync server (worker/src/index.js) against a SQLite D1 stand-in. Run: node test/sync-worker.test.js */
'use strict';
const assert = require('assert');
const { createD1 } = require('./helpers/d1-shim');

const ID = 'a'.repeat(32), AUTH = 'tok_' + 'x'.repeat(40), OTHER = 'tok_' + 'y'.repeat(40);
const req = (method, path, { body, auth } = {}) => new Request(`https://sync.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { 'X-Sync-Auth': auth } : {}) }, body: body ? JSON.stringify(body) : undefined });

(async () => {
  const { handle, cleanup } = await import('../worker/src/index.js');
  const env = { DB: createD1() };
  const call = async (...a) => { const r = await handle(req(...a), env); const t = await r.text(); return { status: r.status, body: t ? JSON.parse(t) : null, cors: r.headers.get('access-control-allow-origin') }; };
  const tests = {
    async 'unknown vault is 404, bad ids rejected'() {
      assert.strictEqual((await call('GET', `/v1/vault/${ID}`)).status, 404);
      assert.strictEqual((await call('GET', '/v1/vault/../../etc')).status, 404);
    },
    async 'create needs auth and base 0'() {
      assert.strictEqual((await call('PUT', `/v1/vault/${ID}`, { body: { base: 0, blob: 'QUJD' } })).status, 401);
      assert.strictEqual((await call('PUT', `/v1/vault/${ID}`, { body: { base: 3, blob: 'QUJD' }, auth: AUTH })).status, 409);
      const r = await call('PUT', `/v1/vault/${ID}`, { body: { base: 0, blob: 'QUJD' }, auth: AUTH });
      assert.deepStrictEqual([r.status, r.body.rev, r.cors], [200, 1, '*']);
    },
    async 'read, and 204 when unchanged'() {
      const r = await call('GET', `/v1/vault/${ID}`);
      assert.deepStrictEqual(r.body, { rev: 1, blob: 'QUJD' });
      assert.strictEqual((await call('GET', `/v1/vault/${ID}?rev=1`)).status, 204);
    },
    async 'wrong auth cannot overwrite or delete'() {
      assert.strictEqual((await call('PUT', `/v1/vault/${ID}`, { body: { base: 1, blob: 'WFla' }, auth: OTHER })).status, 403);
      assert.strictEqual((await call('DELETE', `/v1/vault/${ID}`, { auth: OTHER })).status, 403);
    },
    async 'stale base gets 409 with the current copy'() {
      assert.strictEqual((await call('PUT', `/v1/vault/${ID}`, { body: { base: 1, blob: 'REVG' }, auth: AUTH })).body.rev, 2);
      const c = await call('PUT', `/v1/vault/${ID}`, { body: { base: 1, blob: 'R0hJ' }, auth: AUTH });
      assert.deepStrictEqual([c.status, c.body.rev, c.body.blob], [409, 2, 'REVG']);
    },
    async 'rejects junk and oversize blobs'() {
      assert.strictEqual((await call('PUT', `/v1/vault/${ID}`, { body: { base: 2, blob: '<script>' }, auth: AUTH })).status, 400);
      assert.strictEqual((await call('PUT', `/v1/vault/${ID}`, { body: { base: 2, blob: 'A'.repeat(2_000_000) }, auth: AUTH })).status, 413);
    },
    async 'delete removes the vault'() {
      assert.strictEqual((await call('DELETE', `/v1/vault/${ID}`, { auth: AUTH })).status, 204);
      assert.strictEqual((await call('GET', `/v1/vault/${ID}`)).status, 404);
    },
    async 'cleanup deletes vaults idle for 12 months only'() {
      const B = 'b'.repeat(32), C = 'c'.repeat(32), now = Date.now();
      await handle(req('PUT', `/v1/vault/${B}`, { body: { base: 0, blob: 'QQ==' }, auth: AUTH }), env, now - 400 * 864e5);
      await handle(req('PUT', `/v1/vault/${C}`, { body: { base: 0, blob: 'QQ==' }, auth: AUTH }), env, now - 100 * 864e5);
      assert.strictEqual(await cleanup(env, now), 1);
      assert.strictEqual((await call('GET', `/v1/vault/${B}`)).status, 404);
      assert.strictEqual((await call('GET', `/v1/vault/${C}`)).status, 200);
    },
    async 'CORS preflight'() {
      const r = await handle(new Request('https://sync.test/v1/vault/' + ID, { method: 'OPTIONS' }), env);
      assert.strictEqual(r.status, 204);
      assert.ok(/X-Sync-Auth/.test(r.headers.get('access-control-allow-headers')));
    },
  };
  let failed = 0;
  for (const [n, fn] of Object.entries(tests)) { try { await fn(); console.log('  ok  ', n); } catch (e) { failed++; console.log('  FAIL', n, '\n       ', e.message); } }
  console.log(failed ? `\n${failed} failed` : '\nsync worker tests passed');
  process.exit(failed ? 1 : 0);
})();
