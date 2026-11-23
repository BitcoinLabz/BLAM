/* Offline tests for SimpleFIN bank sync (main process). Run: node test/simplefin.test.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const SF = require('../src/main/simplefin.js');

const realFetch = global.fetch;
let calls = [];
function mock(router) {
  calls = [];
  global.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    const r = router(url, opts) || { status: 500, body: '' };
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status || 200 });
  };
}
const b64 = (s) => Buffer.from(s).toString('base64');
const ACCESS = 'https://user123:s3cr%40t@bridge.example.org/simplefin';

const tests = {
  'parses a setup token (base64 claim URL)'() {
    const t = SF.parseToken(` ${b64('https://bridge.example.org/simplefin/claim/abc')}\n`);
    assert.deepStrictEqual(t, { kind: 'claim', url: 'https://bridge.example.org/simplefin/claim/abc' });
  },
  'accepts a pasted access URL'() {
    assert.strictEqual(SF.parseToken(ACCESS).kind, 'access');
  },
  'rejects junk and non-https tokens'() {
    assert.throws(() => SF.parseToken('hello world'), /setup token/);
    assert.throws(() => SF.parseToken(b64('http://insecure.example/claim')), /setup token/);
    assert.throws(() => SF.parseToken('https://no-creds.example/simplefin'), /credentials/);
  },
  'splits credentials out of the access URL into a Basic header'() {
    const a = SF.splitAccess(ACCESS);
    assert.strictEqual(a.base, 'https://bridge.example.org/simplefin');
    assert.strictEqual(a.auth, 'Basic ' + b64('user123:s3cr@t'));
    assert.strictEqual(a.host, 'bridge.example.org');
  },
  async 'claim POSTs once and returns the access URL'() {
    mock((u, o) => (o.method === 'POST' ? { body: `${ACCESS}\n` } : null));
    assert.strictEqual(await SF.claim('https://bridge.example.org/simplefin/claim/abc'), ACCESS);
  },
  async 'claim of a used token explains what to do'() {
    mock(() => ({ status: 403, body: 'Forbidden' }));
    await assert.rejects(SF.claim('https://x.example/claim/abc'), (e) => e.code === 'claimed' && /already used/.test(e.message));
  },
  async 'fetchAccounts sends auth header (no creds in URL) and start-date'() {
    mock(() => ({ body: { errors: ['Chase needs re-authentication'], accounts: [{ id: 'A1', name: 'Freedom', currency: 'USD', balance: '-512.40', 'balance-date': 1795000000, org: { name: 'Chase', domain: 'chase.com' }, transactions: [
      { id: 't1', posted: 1794900000, amount: '-12.34', description: 'STARBUCKS #123', payee: 'Starbucks' },
      { id: 't2', posted: 0, transacted_at: 1794950000, amount: '-5.00', description: 'PENDING', pending: true },
    ] }] } }));
    const r = await SF.fetchAccounts(ACCESS, { startDate: '2026-09-01' });
    assert.ok(!calls[0].url.includes('@'), 'credentials must not be in the URL');
    assert.ok(/start-date=\d+/.test(calls[0].url));
    assert.strictEqual(calls[0].opts.headers.Authorization, 'Basic ' + b64('user123:s3cr@t'));
    assert.deepStrictEqual(r.errors, ['Chase needs re-authentication']);
    const a = r.accounts[0];
    assert.strictEqual(a.balance, -512.4);
    assert.strictEqual(a.org, 'Chase');
    assert.strictEqual(a.transactions.length, 1, 'pending transactions are skipped');
    assert.strictEqual(a.transactions[0].payee, 'Starbucks');
    assert.strictEqual(a.transactions[0].amount, -12.34);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(a.transactions[0].date));
  },
  async 'maps HTTP errors to actionable messages'() {
    for (const [status, code] of [[403, 'revoked'], [402, 'payment'], [429, 'rate_limited'], [500, 'http']]) {
      mock(() => ({ status }));
      await assert.rejects(SF.fetchAccounts(ACCESS), (e) => e.code === code);
    }
  },
  async 'network failure is reported, not thrown raw'() {
    mock(() => { throw new TypeError('fetch failed'); });
    await assert.rejects(SF.fetchAccounts(ACCESS), (e) => e.code === 'network');
  },
  async 'fetchSince splits long ranges into 45-day windows and merges by id'() {
    mock((u) => {
      const q = new URL(u).searchParams;
      const end = +q.get('end-date');
      return { body: { errors: [], accounts: [{ id: 'A1', name: 'Chk', balance: '10', transactions: [{ id: `t${end}`, posted: end - 3600, amount: '-1', description: 'x' }, { id: 'dup', posted: end - 7200, amount: '-2', description: 'y' }] }] } };
    });
    const r = await SF.fetchSince(ACCESS, new Date(Date.now() - 90 * 86400e3).toISOString().slice(0, 10));
    assert.strictEqual(r.requests, 3, '91 days -> 3 windows of <=45 days');
    for (const c of calls) { const q = new URL(c.url).searchParams; assert.ok((+q.get('end-date') - +q.get('start-date')) / 86400 <= 45); }
    assert.strictEqual(r.accounts.length, 1);
    assert.strictEqual(r.accounts[0].transactions.filter((t) => t.id === 'dup').length, 1, 'duplicate ids merged');
    assert.strictEqual(r.accounts[0].transactions.length, 4);
  },
  'credential store encrypts, reports host, and clears'() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blam-sf-'));
    const fake = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'gnome_libsecret', encryptString: (s) => Buffer.from(s.split('').reverse().join('')), decryptString: (b) => b.toString().split('').reverse().join('') };
    const store = SF.createStore({ safeStorage: fake, dir: () => dir });
    assert.deepStrictEqual(store.status(), { connected: false, secure: true, keychain: true });
    store.save(ACCESS);
    const onDisk = fs.readFileSync(path.join(dir, 'simplefin.credential'), 'utf8');
    assert.ok(!onDisk.includes('s3cr'), 'plaintext secret must not be on disk');
    assert.strictEqual(store.load(), ACCESS);
    assert.deepStrictEqual(store.status(), { connected: true, host: 'bridge.example.org', secure: true });
    store.clear();
    assert.strictEqual(store.load(), null);
    const weak = SF.createStore({ safeStorage: { ...fake, getSelectedStorageBackend: () => 'basic_text' }, dir: () => dir });
    assert.strictEqual(weak.status().secure, false, 'basic_text backend is flagged as not secure');
    const none = SF.createStore({ safeStorage: { ...fake, isEncryptionAvailable: () => false }, dir: () => dir });
    assert.throws(() => none.save(ACCESS), (e) => e.code === 'no_secure_storage');
    none.save(ACCESS, { allowPlain: true });
    assert.strictEqual(none.load(), ACCESS);
    assert.strictEqual(none.status().secure, false, 'opt-in plain storage is reported as not secure');
    if (process.platform !== 'win32') assert.strictEqual(fs.statSync(path.join(dir, 'simplefin.credential')).mode & 0o777, 0o600);
    fs.rmSync(dir, { recursive: true, force: true });
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log('  ok  ', name); } catch (e) { failed++; console.log('  FAIL', name, '\n       ', e.message); }
  }
  global.fetch = realFetch;
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
