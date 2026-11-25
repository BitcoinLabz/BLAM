/* BLAM — end-to-end encrypted sync between your devices. The server only ever sees encrypted data. */
'use strict';
(function (B) {
  const { U, S, UI, SyncMerge: M } = B;
  const Sync = {};
  const DISCOVERY = 'https://bitcoinlabz.github.io/BLAM/sync.json'; // published by CI with the server address
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';               // Crockford base32: no I, L, O, U

  // ------------------------------------------------------------------ key & crypto
  /** 120-bit random key -> 24 characters. */
  Sync.newKey = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(15));
    let bits = '', out = '';
    for (const b of bytes) bits += b.toString(2).padStart(8, '0');
    for (let i = 0; i < 120; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
    return out;
  };
  /** Accept "k7q2-x9m4 …", fix look-alikes (O->0, I/L->1). Returns 24 chars or null. */
  Sync.normalizeKey = (text) => {
    const k = String(text || '').toUpperCase().replace(/[OI L]/g, (c) => ({ O: '0', I: '1', L: '1', ' ': '' }[c])).replace(/[^0-9A-Z]/g, '');
    return k.length === 24 && [...k].every((c) => ALPHABET.includes(c)) ? k : null;
  };
  Sync.formatKey = (k) => String(k).match(/.{1,4}/g).join('-');

  const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

  /** Everything is derived from the key: vault id (public), write token (proves you own it), AES key (never leaves). */
  async function derive(key) {
    const raw = new TextEncoder().encode(key);
    const ikm = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveBits', 'deriveKey']);
    const salt = new TextEncoder().encode('BLAM sync v1');
    const bits = async (info, n) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(info) }, ikm, n * 8));
    const id = hex(await bits('vault-id', 16));
    const auth = b64(await bits('write-token', 30)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const aes = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('encryption') }, ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return { id, auth, aes };
  }
  const gzip = async (bytes) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const gunzip = async (bytes) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  async function seal(k, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = await gzip(new TextEncoder().encode(JSON.stringify(obj)));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(k.id) }, k.aes, plain));
    const out = new Uint8Array(iv.length + ct.length); out.set(iv); out.set(ct, iv.length);
    return b64(out);
  }
  async function open(k, blob) {
    const bytes = unb64(blob);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: new TextEncoder().encode(k.id) }, k.aes, bytes.subarray(12));
    return JSON.parse(new TextDecoder().decode(await gunzip(new Uint8Array(plain))));
  }

  // ------------------------------------------------------------------ storage & network
  const keyStore = {
    get: () => (window.blam?.syncKeyGet ? window.blam.syncKeyGet() : B.Web ? B.Web.getSecret('syncKey') : null),
    set: (k) => (window.blam?.syncKeySet ? window.blam.syncKeySet(k) : B.Web?.setSecret('syncKey', k)),
    clear: () => (window.blam?.syncKeyClear ? window.blam.syncKeyClear() : B.Web?.setSecret('syncKey', null)),
  };
  async function http(method, url, { body, auth } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) headers['X-Sync-Auth'] = auth;
    if (window.blam?.syncHttp) {
      const r = await window.blam.syncHttp({ url, method, headers, body: body == null ? undefined : JSON.stringify(body) });
      return { status: r.status, data: r.text ? JSON.parse(r.text) : null, error: r.error };
    }
    try {
      const r = await fetch(url, { method, headers, body: body == null ? undefined : JSON.stringify(body), cache: 'no-store' });
      const t = await r.text();
      return { status: r.status, data: t ? JSON.parse(t) : null };
    } catch (e) { return { status: 0, data: null, error: e.message }; }
  }
  const st = () => S.state.sync;
  /** The sync server: a per-device override (Settings → Advanced), else the address BLAM publishes. */
  Sync.server = async () => {
    if (S.state.settings.syncServer) return S.state.settings.syncServer.replace(/\/+$/, '');
    if (st().server && st().serverAt && Date.now() - st().serverAt < 24 * 3600e3) return st().server;
    const r = await http('GET', `${DISCOVERY}?t=${Date.now()}`);
    if (r.status === 200 && r.data?.url) { st().server = r.data.url.replace(/\/+$/, ''); st().serverAt = Date.now(); S.save(); return st().server; }
    return st().server || null;
  };

  // ------------------------------------------------------------------ the sync cycle
  let keys = null, running = null, again = false, applying = false;
  let gen = 0; // bumps when sync is turned on/off, so a sync already in flight can't write afterwards
  const now = () => Date.now();

  /** Stamp edit times for anything that changed locally since the last sync ("most recent edit wins"). */
  function stamp(localUnits) {
    const s = st();
    s.mtimes = s.mtimes || {};
    for (const k of M.changedKeys(localUnits, s.base)) if (!s.mtimes[k] || s.mtimes[k] < (s.lastSyncMs || 0)) s.mtimes[k] = now();
  }
  function applyMerged(mergedUnits) {
    applying = true;
    try {
      S.commit((state) => { M.apply(state, mergedUnits); }, { silent: false });
    } finally { setTimeout(() => { applying = false; }, 50); }
  }

  /** One round: pull, merge, push. Retries if another device wrote in between. */
  async function cycle({ tie = 'local' } = {}) {
    const myGen = gen, k = keys;
    const alive = () => { if (myGen !== gen || !st().on || keys !== k) throw Object.assign(new Error('cancelled'), { code: 'cancelled' }); };
    const server = await Sync.server();
    if (!server) throw Object.assign(new Error('The sync server isn\'t set up yet.'), { code: 'no_server' });
    const url = `${server}/v1/vault/${k.id}`;
    let remote = null; // { rev, data }
    for (let attempt = 0; attempt < 4; attempt++) {
      const s = st();
      // 1. Pull (cheap when nothing changed: 204).
      const got = await http('GET', `${url}${s.rev ? `?rev=${s.rev}` : ''}`);
      alive();
      if (got.status === 0) throw Object.assign(new Error('Can\'t reach the sync server. Changes will sync when you\'re back online.'), { code: 'offline' });
      if (got.status === 200) remote = { rev: got.data.rev, data: await open(k, got.data.blob) };
      else if (got.status === 404) {
        // We had synced before and the copy is gone: deleted from another device, or expired after 12 months unused.
        // Never silently re-upload; stop and tell the user.
        if (s.rev) throw Object.assign(new Error('The synced copy was deleted (sync was turned off on another device, or it went unused for 12 months). Sync is off on this device. Your data here is safe; turn sync on again to start fresh.'), { code: 'gone' });
        remote = { rev: 0, data: null };
      }
      else if (got.status === 204) remote = null;
      else throw new Error(`Sync server error (${got.status})`);

      // 2. Merge against whatever the user has right now.
      const L = M.units(S.state);
      stamp(L);
      let merged = L, changedFromRemote = 0;
      const remoteRev = remote ? remote.rev : s.rev;
      alive();
      if (remote && remote.data) {
        const R = remote.data.units || {};
        const r = M.mergeUnits(L, R, s.base || {}, s.mtimes || {}, remote.data.mtimes || {}, tie);
        M.reconcile(r.units, r.picked, L, R);
        merged = r.units;
        changedFromRemote = Object.keys(r.picked).filter((k) => r.picked[k] === 'R' && M.hash(L[k] ?? null) !== M.hash(r.units[k] ?? null)).length;
        for (const [k, t] of Object.entries(remote.data.mtimes || {})) if (!s.mtimes[k] || s.mtimes[k] < t) s.mtimes[k] = t;
        if (changedFromRemote) applyMerged(merged);
      }
      const mergedHashes = M.hashes(merged);
      const remoteHashes = remote && remote.data ? M.hashes(remote.data.units || {}) : (remote ? {} : s.base || {});
      const needPush = !remote ? M.changedKeys(merged, s.base).length > 0 : (remote.rev === 0 || M.canon(mergedHashes) !== M.canon(remoteHashes));
      if (!needPush) {
        s.rev = remoteRev; s.base = mergedHashes; s.lastSyncMs = now(); s.lastSync = new Date().toISOString(); s.lastError = null;
        S.save();
        return { pulled: changedFromRemote, pushed: 0 };
      }
      // 3. Push (compare-and-swap on the revision we merged with).
      const keep = Object.fromEntries(Object.entries(s.mtimes || {}).filter(([k]) => k in merged));
      const blob = await seal(k, { v: 1, units: merged, mtimes: keep, at: new Date().toISOString() });
      if (blob.length > 1_900_000) throw Object.assign(new Error('Your data is too large to sync (over ~1.9 MB compressed).'), { code: 'too_large' });
      alive();
      const put = await http('PUT', url, { body: { base: remoteRev || 0, blob }, auth: k.auth });
      if (put.status === 200) {
        s.rev = put.data.rev; s.base = mergedHashes; s.mtimes = keep; s.lastSyncMs = now(); s.lastSync = new Date().toISOString(); s.lastError = null;
        S.save();
        return { pulled: changedFromRemote, pushed: M.changedKeys(merged, remoteHashes).length };
      }
      if (put.status === 409 && put.data?.error === 'gone' && s.rev) throw Object.assign(new Error('The synced copy was deleted on another device. Sync is off on this device. Your data here is safe.'), { code: 'gone' });
      if (put.status === 409) { s.rev = 0; continue; } // someone else wrote first: pull again and re-merge
      if (put.status === 403) throw Object.assign(new Error('This sync key doesn\'t match the data on the server.'), { code: 'forbidden' });
      if (put.status === 0) throw Object.assign(new Error('Can\'t reach the sync server. Changes will sync when you\'re back online.'), { code: 'offline' });
      throw new Error(`Sync server error (${put.status})`);
    }
    throw new Error('Sync kept conflicting. It will try again shortly.');
  }

  /** Run a sync now (coalesces overlapping requests). */
  Sync.run = ({ quiet = true, tie } = {}) => {
    if (!st().on || !keys) return Promise.resolve(null);
    if (running) { again = true; return running; }
    running = (async () => {
      document.body.classList.add('syncing');
      try {
        const r = await cycle({ tie });
        if (r.pulled && !quiet) UI.toast(`Synced · ${r.pulled} change${r.pulled === 1 ? '' : 's'} from your other device`);
        else if (r.pulled) UI.toast(`Synced ${r.pulled} change${r.pulled === 1 ? '' : 's'} from your other device`, 'ok', 2500);
        else if (!quiet) UI.toast('Everything is in sync');
        return r;
      } catch (e) {
        if (e.code === 'cancelled') return null;
        if (e.code === 'gone') { await Sync.disable({ internal: true }).catch(() => {}); st().lastError = e.message; S.save(); UI.toast(e.message, 'warn', 9000); return null; }
        const first = st().lastError !== e.message;
        st().lastError = e.message; st().lastErrorCode = e.code || 'error'; S.save();
        if (!quiet || (first && e.code !== 'offline')) UI.toast(e.message, e.code === 'offline' ? 'warn' : 'error', 5000);
        return null;
      } finally {
        document.body.classList.remove('syncing');
        running = null;
        if (B.views?.settings?.syncCard) B.views.settings.syncCard();
        if (again) { again = false; setTimeout(() => Sync.run(), 500); }
      }
    })();
    return running;
  };

  // ------------------------------------------------------------------ turning it on / off
  Sync.isOn = () => !!st().on;
  Sync.key = async () => keyStore.get();

  /** First device: create a key and upload this device's data. */
  Sync.enable = async () => {
    const server = await Sync.server();
    if (!server) throw new Error('The sync server isn\'t set up yet.');
    const health = await http('GET', `${server}/v1/health`);
    if (health.status !== 200) throw new Error('Can\'t reach the sync server right now. Check your connection and try again.');
    const key = Sync.newKey();
    gen++;
    keys = await derive(key);
    await keyStore.set(key);
    Object.assign(st(), { on: true, rev: 0, base: {}, mtimes: {}, keySaved: false, lastError: null });
    S.save();
    await cycle();
    return key;
  };

  /** Another device: join with an existing key. mode: 'replace' (take the synced data) or 'merge'. */
  Sync.join = async (text, mode = 'auto') => {
    const key = Sync.normalizeKey(text);
    if (!key) throw new Error('That doesn\'t look like a sync key. It\'s 24 letters and numbers, like K7Q2-X9M4-….');
    const server = await Sync.server();
    if (!server) throw new Error('The sync server isn\'t set up yet.');
    const k = await derive(key);
    const got = await http('GET', `${server}/v1/vault/${k.id}`);
    if (got.status === 404) throw new Error('No synced data was found for that key. Check it, or turn on sync on your other device first.');
    if (got.status !== 200) throw new Error(got.status === 0 ? 'Can\'t reach the sync server right now.' : `Sync server error (${got.status})`);
    let remote;
    try { remote = await open(k, got.data.blob); } catch (_) { throw new Error('That key can\'t unlock the synced data. Check it and try again.'); }
    const replace = mode === 'replace' || (mode === 'auto' && !M.hasUserData(S.state));
    gen++;
    keys = k;
    await keyStore.set(key);
    if (replace) {
      // Fresh device: take everything from the synced copy (drops this device's default categories etc.), keep its own settings.
      applyMerged(remote.units || {});
      Object.assign(st(), { on: true, rev: got.data.rev, base: M.hashes(remote.units || {}), mtimes: remote.mtimes || {}, keySaved: true, lastError: null, lastSync: new Date().toISOString(), lastSyncMs: now() });
      S.state.settings.onboarded = true;
      S.save();
      return { replaced: true };
    }
    Object.assign(st(), { on: true, rev: 0, base: {}, mtimes: {}, keySaved: true, lastError: null });
    S.save();
    await cycle({ tie: 'remote' });
    return { replaced: false };
  };

  /** Turn off on this device; optionally delete the encrypted copy from the server too. */
  Sync.disable = async ({ deleteServer = false, internal = false } = {}) => {
    gen++;
    if (running && !internal) await running.catch(() => {}); // let an in-flight sync stop first (not when called from inside it)
    if (deleteServer && keys) {
      const server = await Sync.server();
      const r = await http('DELETE', `${server}/v1/vault/${keys.id}`, { auth: keys.auth });
      if (r.status !== 204) throw new Error('Couldn\'t delete the data from the server. Check your connection and try again.');
    }
    await keyStore.clear();
    keys = null;
    Object.assign(st(), { on: false, rev: 0, base: {}, mtimes: {}, lastError: null });
    S.save();
  };

  // ------------------------------------------------------------------ automatic syncing
  Sync.start = async () => {
    if (!S.state.sync) S.state.sync = { on: false };
    if (!st().on) return;
    const key = await keyStore.get();
    if (!key) { st().on = false; st().lastError = 'Sync key missing on this device. Turn sync on again with your key.'; S.save(); return; }
    keys = await derive(key);
    Sync.run();
  };
  // A few seconds after you change something.
  S.on(U.debounce(() => { if (!applying && Sync.isOn()) Sync.run(); }, 3000));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.run(); });
  window.addEventListener('online', () => Sync.run());
  setInterval(() => { if (document.visibilityState === 'visible') Sync.run(); }, 30000);

  Sync._test = { derive, seal, open, state: () => ({ keys: !!keys, gen, running: !!running }) };
  B.Sync = Sync;
})(window.BLAM);
