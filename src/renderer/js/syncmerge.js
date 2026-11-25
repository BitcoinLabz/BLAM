/* BLAM — sync merge: three-way, per-item merge of two copies of the data. Pure functions (also run under Node tests). */
'use strict';
(function (root) {
  // What gets synced, and how each collection's items are identified.
  const COLLECTIONS = {
    accounts: 'id', transactions: 'id', categories: 'name', rules: 'id', holdings: 'id', dividends: 'id',
    properties: 'id', loans: 'id', metals: 'id', passive: 'id', otherAssets: 'id', recurring: 'id', goals: 'id',
    snapshots: 'date',
  };
  const SINGLES = ['metalPrices'];
  // Settings that belong to one device only (never synced).
  const LOCAL_SETTINGS = new Set(['privacy', 'autoUpdate', 'lastPriceRefresh', 'lastPriceSuccess', 'lastPriceStatus', 'lastReminderDate',
    'onboarded', 'bankSyncConnected', 'bankSyncHours', 'bankSyncDays', 'lastBankSync', 'lastBankSyncResult', 'syncServer']);
  const SEP = '\u0001';

  /** Stable JSON (sorted keys) so the same content always hashes the same. */
  function canon(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  }
  /** 53-bit FNV-1a style hash, as a base36 string. Change detection only, not security. */
  function hash(v) {
    const s = canon(v);
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
    }
    return ((h2 & 0x1fffff) * 4294967296 + h1).toString(36);
  }

  /** Flatten the syncable part of the state into { unitKey: value }. */
  function units(state) {
    const out = {};
    for (const [col, key] of Object.entries(COLLECTIONS)) {
      for (const item of state[col] || []) {
        const k = item && item[key];
        if (k == null || k === '') continue;
        out[`${col}${SEP}${k}`] = item;
      }
    }
    for (const [k, v] of Object.entries(state.settings || {})) if (!LOCAL_SETTINGS.has(k)) out[`settings${SEP}${k}`] = v;
    for (const k of SINGLES) if (state[k] !== undefined) out[`single${SEP}${k}`] = state[k];
    return out;
  }
  const hashes = (u) => Object.fromEntries(Object.entries(u).map(([k, v]) => [k, hash(v)]));

  /** Keys whose local value differs from the last-synced base (added, edited or deleted). */
  function changedKeys(localUnits, base) {
    const out = [];
    const keys = new Set([...Object.keys(localUnits), ...Object.keys(base || {})]);
    for (const k of keys) {
      const h = k in localUnits ? hash(localUnits[k]) : null;
      if (h !== ((base || {})[k] ?? null)) out.push(k);
    }
    return out;
  }

  /**
   * Three-way merge. For each item: only one side changed -> take it; both changed -> the most recent
   * edit wins (mtimes), ties go to `tie` ('local' | 'remote'). Deletions count as edits.
   * Returns { units, picked } where picked[key] is 'L' or 'R'.
   */
  function mergeUnits(L, R, base = {}, mtL = {}, mtR = {}, tie = 'local') {
    const out = {}, picked = {};
    const keys = new Set([...Object.keys(L), ...Object.keys(R), ...Object.keys(base)]);
    for (const k of keys) {
      const lh = k in L ? hash(L[k]) : null, rh = k in R ? hash(R[k]) : null, bh = base[k] ?? null;
      const lc = lh !== bh, rc = rh !== bh;
      let side;
      if (!rc || lh === rh) side = 'L';
      else if (!lc) side = 'R';
      else {
        const lt = mtL[k] || 0, rt = mtR[k] || 0;
        side = rt > lt ? 'R' : lt > rt ? 'L' : (tie === 'remote' ? 'R' : 'L');
      }
      picked[k] = side;
      const src = side === 'L' ? L : R;
      if (k in src) out[k] = src[k];
    }
    return { units: out, picked };
  }

  const kindOf = (acc) => (['credit', 'line_of_credit'].includes(acc && acc.type) ? 'credit' : 'other');
  const effect = (t, acc) => (kindOf(acc) === 'credit' ? -1 : 1) * (Number(t.amount) || 0);

  /**
   * Balances are stored on accounts and loans but move with transactions/payments. After merging,
   * make each account's balance consistent with the merged transactions: start from the version of
   * the account we kept and add the effect of transactions that differ from that side's set.
   * Loans: union the payment history and subtract principal from payments the kept side hadn't seen.
   */
  function reconcile(merged, picked, L, R) {
    const txOf = (u) => Object.entries(u).filter(([k]) => k.startsWith(`transactions${SEP}`)).map(([, v]) => v);
    const sideTx = { L: txOf(L), R: txOf(R) };
    const mergedTx = txOf(merged);
    for (const [k, acc] of Object.entries(merged)) {
      if (!k.startsWith(`accounts${SEP}`)) continue;
      const side = picked[k] || 'L';
      const sum = (list) => list.filter((t) => t.accountId === acc.id).reduce((s, t) => s + effect(t, acc), 0);
      const delta = sum(mergedTx) - sum(sideTx[side]);
      if (Math.abs(delta) > 0.0049) merged[k] = { ...acc, balance: Math.round((Number(acc.balance || 0) + delta) * 100) / 100 };
    }
    for (const [k, loan] of Object.entries(merged)) {
      if (!k.startsWith(`loans${SEP}`)) continue;
      const other = (picked[k] === 'R' ? L : R)[k];
      if (!other || !Array.isArray(other.payments)) continue;
      const mine = Array.isArray(loan.payments) ? loan.payments : [];
      const seen = new Set(mine.map((p) => p.date));
      const extra = other.payments.filter((p) => !seen.has(p.date));
      if (!extra.length) continue;
      const principal = extra.reduce((s, p) => s + (Number(p.principal) || 0), 0);
      merged[k] = { ...loan, payments: [...mine, ...extra].sort((a, b) => String(a.date).localeCompare(String(b.date))), balance: Math.max(0, Math.round((Number(loan.balance || 0) - principal) * 100) / 100) };
    }
    return merged;
  }

  /** Write merged units back into a state object (keeps device-only settings and anything not synced). */
  function apply(state, merged) {
    const byCol = {};
    for (const [k, v] of Object.entries(merged)) {
      const i = k.indexOf(SEP);
      const col = k.slice(0, i);
      (byCol[col] = byCol[col] || []).push([k.slice(i + 1), v]);
    }
    for (const [col, key] of Object.entries(COLLECTIONS)) {
      const incoming = new Map((byCol[col] || []).map(([, v]) => [String(v[key]), v]));
      const kept = [];
      for (const item of state[col] || []) { const id = String(item[key]); if (incoming.has(id)) { kept.push(incoming.get(id)); incoming.delete(id); } }
      state[col] = [...kept, ...incoming.values()];
      if (col === 'snapshots') state[col].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    }
    const settings = {};
    for (const [k, v] of Object.entries(state.settings || {})) if (LOCAL_SETTINGS.has(k)) settings[k] = v;
    for (const [k, v] of byCol.settings || []) settings[k] = v;
    state.settings = { ...(state.settings || {}), ...settings };
    for (const k of SINGLES) { const hit = (byCol.single || []).find(([n]) => n === k); if (hit) state[k] = hit[1]; }
    return state;
  }

  /** Does this copy contain anything the user entered (vs. a fresh install)? */
  const hasUserData = (state) => ['accounts', 'transactions', 'holdings', 'properties', 'loans', 'metals', 'recurring', 'goals', 'passive', 'otherAssets'].some((c) => (state[c] || []).length);

  const api = { COLLECTIONS, LOCAL_SETTINGS, canon, hash, units, hashes, changedKeys, mergeUnits, reconcile, apply, hasUserData };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.BLAM = root.BLAM || {}).SyncMerge = api;
})(typeof window !== 'undefined' ? window : globalThis);
