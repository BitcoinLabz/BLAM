/**
 * BLAM — SimpleFIN bank sync (main process only).
 *
 * Protocol (https://www.simplefin.org/protocol.html):
 *   1. The user creates a one-time *setup token* at their SimpleFIN server (e.g. SimpleFIN Bridge).
 *      It is base64 of a claim URL.
 *   2. POST to the claim URL once -> returns an *access URL* with Basic-auth credentials embedded.
 *   3. GET <access URL>/accounts?start-date=... -> accounts, balances and transactions.
 *
 * The access URL is a bearer credential. It never leaves this process: it is encrypted with
 * Electron safeStorage (OS keychain / DPAPI / libsecret) and written to userData. The renderer
 * only ever sees { connected, host, secure }.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const UA = 'BLAM/1.0 (+https://github.com/BitcoinLabz/BLAM)';

class SimpleFinError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

/** Accept a setup token (base64 claim URL) or an access URL pasted directly. */
function parseToken(input) {
  const raw = String(input || '').trim().replace(/\s+/g, '');
  if (!raw) throw new SimpleFinError('Paste your SimpleFIN setup token', 'empty');
  if (/^https:\/\//i.test(raw)) {
    const u = new URL(raw);
    if (!u.username || !u.password) throw new SimpleFinError('That URL has no credentials. Paste the setup token from SimpleFIN instead.', 'bad_token');
    return { kind: 'access', url: raw };
  }
  let decoded;
  try { decoded = Buffer.from(raw, 'base64').toString('utf8').trim(); } catch (_) { decoded = ''; }
  if (!/^https:\/\/\S+$/i.test(decoded)) throw new SimpleFinError("That doesn't look like a SimpleFIN setup token", 'bad_token');
  return { kind: 'claim', url: decoded };
}

/** Split an access URL into a credential-free base URL and an Authorization header. */
function splitAccess(accessUrl) {
  const u = new URL(accessUrl);
  if (u.protocol !== 'https:') throw new SimpleFinError('SimpleFIN access URL must use https', 'bad_token');
  const auth = 'Basic ' + Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString('base64');
  u.username = ''; u.password = '';
  return { base: u.toString().replace(/\/+$/, ''), auth, host: u.host };
}

async function http(url, { method = 'GET', headers = {}, timeoutMs = 30000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, headers: { 'User-Agent': UA, ...headers }, signal: ctrl.signal, ...(method === 'POST' ? { body: '' } : {}) });
    const text = await res.text();
    return { status: res.status, text };
  } catch (e) {
    if (e.name === 'AbortError') throw new SimpleFinError('SimpleFIN did not respond in time', 'timeout');
    throw new SimpleFinError(`Could not reach SimpleFIN (${e.cause?.code || e.message})`, 'network');
  } finally {
    clearTimeout(t);
  }
}

/** Exchange a claim URL for an access URL. Each setup token works exactly once. */
async function claim(claimUrl) {
  const r = await http(claimUrl, { method: 'POST', headers: { 'Content-Length': '0' } });
  if (r.status === 403) throw new SimpleFinError('This setup token was already used or has expired. Create a new one in SimpleFIN and paste it here.', 'claimed');
  if (r.status !== 200) throw new SimpleFinError(`SimpleFIN rejected the setup token (HTTP ${r.status})`, 'claim_failed');
  const access = r.text.trim();
  if (!/^https:\/\/[^\s@]+:[^\s@]+@\S+$/i.test(access)) throw new SimpleFinError('SimpleFIN returned an unexpected response while claiming the token', 'claim_failed');
  return access;
}

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const isoDate = (unix) => {
  if (!unix) return null;
  const d = new Date(Number(unix) * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Normalise the SimpleFIN account set into plain data the renderer can use. */
function normalise(data) {
  const errors = [
    ...(Array.isArray(data.errors) ? data.errors.map(String) : []),
    ...(Array.isArray(data.errlist) ? data.errlist.map((e) => e?.msg || e?.message || String(e)) : []),
  ].filter(Boolean);
  const accounts = (data.accounts || []).map((a) => ({
    id: String(a.id),
    name: String(a.name || a.id),
    org: a.org ? String(a.org.name || a.org.domain || '') : '',
    orgDomain: a.org ? String(a.org.domain || '') : '',
    currency: String(a.currency || 'USD'),
    balance: num(a.balance),
    available: a['available-balance'] != null ? num(a['available-balance']) : null,
    balanceDate: isoDate(a['balance-date']),
    transactions: (a.transactions || []).map((t) => ({
      id: String(t.id),
      date: isoDate(t.posted || t.transacted_at),
      amount: num(t.amount),
      payee: String(t.payee || t.description || 'Bank transaction').replace(/\s+/g, ' ').trim(),
      description: String(t.description || '').replace(/\s+/g, ' ').trim(),
      memo: String(t.memo || '').replace(/\s+/g, ' ').trim(),
      pending: !!t.pending || !t.posted,
    })).filter((t) => t.date && !t.pending),
  }));
  return { errors, accounts };
}

const unixOf = (iso) => Math.floor(new Date(`${iso}T00:00:00`).getTime() / 1000);
const MAX_WINDOW_DAYS = 45; // SimpleFIN Bridge's recommended maximum range per request

/** GET /accounts for one date window. `startDate` / `endDate` are ISO dates. */
async function fetchAccounts(accessUrl, { startDate, endDate, balancesOnly } = {}) {
  const { base, auth } = splitAccess(accessUrl);
  const q = new URLSearchParams();
  if (balancesOnly) q.set('balances-only', '1');
  else {
    if (startDate) q.set('start-date', String(unixOf(startDate)));
    if (endDate) q.set('end-date', String(unixOf(endDate) + 86400));
  }
  const r = await http(`${base}/accounts${q.toString() ? `?${q}` : ''}`, { headers: { Authorization: auth, Accept: 'application/json' } });
  if (r.status === 403 || r.status === 401) throw new SimpleFinError('SimpleFIN access was revoked or has expired. Reconnect with a new setup token.', 'revoked');
  if (r.status === 402) throw new SimpleFinError('Your SimpleFIN subscription needs attention (HTTP 402). Check your SimpleFIN Bridge account.', 'payment');
  if (r.status === 429) throw new SimpleFinError('SimpleFIN rate limit reached. BLAM will try again later.', 'rate_limited');
  if (r.status !== 200) throw new SimpleFinError(`SimpleFIN error (HTTP ${r.status})`, 'http');
  let data;
  try { data = JSON.parse(r.text); } catch (_) { throw new SimpleFinError('SimpleFIN returned invalid data', 'bad_json'); }
  return normalise(data);
}

/**
 * Fetch everything since `startDate`, splitting long ranges into 45-day windows (newest first, so
 * balances come from the latest response) and merging transactions by id.
 */
async function fetchSince(accessUrl, startDate) {
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const windows = [];
  let end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const start = new Date(`${startDate || iso(new Date(Date.now() - 30 * 86400e3))}T12:00:00`);
  while (end >= start && windows.length < 6) {
    const s = new Date(Math.max(start.getTime(), end.getTime() - (MAX_WINDOW_DAYS - 1) * 86400e3));
    windows.push({ startDate: iso(s), endDate: iso(end) });
    end = new Date(s.getTime() - 86400e3);
  }
  const merged = new Map();
  const errors = new Set();
  for (const w of windows) {
    const r = await fetchAccounts(accessUrl, w);
    r.errors.forEach((e) => errors.add(e));
    for (const a of r.accounts) {
      const m = merged.get(a.id);
      if (!m) { merged.set(a.id, a); continue; }
      const seen = new Set(m.transactions.map((t) => t.id));
      m.transactions.push(...a.transactions.filter((t) => !seen.has(t.id)));
    }
  }
  return { errors: [...errors], accounts: [...merged.values()], requests: windows.length };
}

// ---------------------------------------------------------------- credential storage
function createStore({ safeStorage, dir }) {
  const file = () => path.join(dir(), 'simplefin.credential');
  const backend = () => {
    try { return typeof safeStorage.getSelectedStorageBackend === 'function' ? safeStorage.getSelectedStorageBackend() : 'os'; } catch (_) { return 'unknown'; }
  };
  // On Linux without a keyring Electron falls back to a hard-coded key ("basic_text"): not real protection.
  const secure = () => safeStorage.isEncryptionAvailable() && backend() !== 'basic_text';

  return {
    /** `allowPlain`: the user explicitly accepted storing without an OS keychain (file readable only by their account). */
    save(accessUrl, { allowPlain = false } = {}) {
      let blob;
      if (safeStorage.isEncryptionAvailable()) blob = safeStorage.encryptString(accessUrl);
      else if (allowPlain) blob = Buffer.from(`PLAIN1:${Buffer.from(accessUrl).toString('base64')}`);
      else throw new SimpleFinError('No OS keychain is available on this computer (on Linux, install GNOME Keyring or KWallet).', 'no_secure_storage');
      const tmp = `${file()}.tmp`;
      fs.writeFileSync(tmp, blob, { mode: 0o600 });
      fs.renameSync(tmp, file());
    },
    load() {
      if (!fs.existsSync(file())) return null;
      const buf = fs.readFileSync(file());
      if (buf.subarray(0, 7).toString() === 'PLAIN1:') return Buffer.from(buf.subarray(7).toString(), 'base64').toString('utf8');
      try { return safeStorage.decryptString(buf); } catch (_) {
        throw new SimpleFinError('Saved bank credentials could not be unlocked (the OS keychain changed). Reconnect SimpleFIN.', 'locked');
      }
    },
    clear() { try { fs.unlinkSync(file()); } catch (_) { /* already gone */ } },
    status() {
      if (!fs.existsSync(file())) return { connected: false, secure: secure(), keychain: safeStorage.isEncryptionAvailable() };
      const plain = fs.readFileSync(file()).subarray(0, 7).toString() === 'PLAIN1:';
      let host = '';
      try { host = splitAccess(this.load()).host; } catch (e) { return { connected: true, secure: !plain && secure(), error: e.message, code: e.code }; }
      return { connected: true, host, secure: !plain && secure() };
    },
  };
}

module.exports = { parseToken, splitAccess, claim, fetchAccounts, fetchSince, normalise, createStore, SimpleFinError };
