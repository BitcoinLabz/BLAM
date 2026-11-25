/* BLAM — storage for the phone / web version (no Electron). IndexedDB, with daily + safety backups. */
'use strict';
(function (B) {
  if (window.blam) return; // desktop app: the main process handles storage

  const DB = 'blam', STORE = 'kv', KEY = 'data', MAX_DAILY = 14, MAX_SAFETY = 10;
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const st = t.objectStore(STORE);
      let out;
      Promise.resolve(fn(st, (v) => { out = v; })).catch(reject);
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Storage aborted'));
    });
  };
  const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const today = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${today()}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

  async function keys() { return tx('readonly', async (st, done) => done(await req(st.getAllKeys()))); }
  async function prune(prefix, max) {
    const ks = (await keys()).filter((k) => String(k).startsWith(prefix)).sort();
    if (ks.length <= max) return;
    await tx('readwrite', (st) => { ks.slice(0, ks.length - max).forEach((k) => st.delete(k)); });
  }

  const Web = {
    available: () => typeof indexedDB !== 'undefined',
    async load() {
      // One-time move from the old localStorage fallback, if present.
      const raw = await tx('readonly', async (st, done) => done(await req(st.get(KEY))));
      if (raw == null) {
        try { const legacy = localStorage.getItem('blam-data'); if (legacy) { await Web.save(legacy); return legacy; } } catch (_) { /* private mode */ }
      }
      return raw ?? null;
    },
    async save(json) {
      JSON.parse(json); // never store something that can't be read back
      const daily = `backup-${today()}`;
      await tx('readwrite', async (st) => {
        st.put(json, KEY);
        if ((await req(st.getKey(daily))) === undefined) st.put(json, daily);
      });
      await prune('backup-', MAX_DAILY);
      return true;
    },
    /** Keep a copy before erase / restore / demo. */
    async safetyBackup(reason) {
      const cur = await tx('readonly', async (st, done) => done(await req(st.get(KEY))));
      if (!cur) return null;
      const k = `before-${String(reason || 'change').replace(/[^a-z]/gi, '')}-${stamp()}`;
      await tx('readwrite', (st) => { st.put(cur, k); });
      await prune('before-', MAX_SAFETY);
      return k;
    },
    async backups() {
      return (await keys()).filter((k) => /^(backup|before)-/.test(k)).sort().reverse();
    },
    async restoreBackup(k) { return tx('readonly', async (st, done) => done(await req(st.get(k)))); },
    /** The sync key lives apart from the data (never in exports or backups). */
    async getSecret(name) { return tx('readonly', async (st, done) => done((await req(st.get(`secret-${name}`))) ?? null)); },
    async setSecret(name, value) { await tx('readwrite', (st) => { if (value == null) st.delete(`secret-${name}`); else st.put(String(value), `secret-${name}`); }); },
    /** Ask the browser not to evict our data under storage pressure (installed PWAs usually get this). */
    async persist() {
      try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch (_) { return false; }
    },
    async estimate() {
      try { return navigator.storage?.estimate ? await navigator.storage.estimate() : null; } catch (_) { return null; }
    },
  };
  B.Web = Web;
})(window.BLAM);
