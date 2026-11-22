/* BLAM — utilities: formatting, dates, CSV, misc helpers. */
'use strict';
window.BLAM = window.BLAM || {};

(function (B) {
  const U = {};
  let currency = 'USD';

  U.setCurrency = (c) => { currency = c || 'USD'; _fmt = {}; };
  let _fmt = {};
  function fmt(dp) {
    const k = currency + dp;
    if (!_fmt[k]) _fmt[k] = new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: dp, maximumFractionDigits: dp });
    return _fmt[k];
  }

  U.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  U.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.num = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : 0; };
  U.round = (v, dp = 2) => Math.round((v + Number.EPSILON) * 10 ** dp) / 10 ** dp;
  U.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  U.sum = (arr, fn = (x) => x) => arr.reduce((s, x) => s + (U.num(fn(x)) || 0), 0);

  /** Plain currency string. */
  U.money = (v, dp = 2) => fmt(dp).format(Number.isFinite(v) ? v : 0);
  /** Compact currency: $1.25M, $830K. */
  U.moneyShort = (v) => {
    const a = Math.abs(v || 0), s = v < 0 ? '-' : '';
    if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
    if (a >= 1e4) return `${s}$${(a / 1e3).toFixed(1)}K`;
    return U.money(v, a >= 1000 ? 0 : 2);
  };
  /** Currency wrapped for privacy-mode blurring. */
  U.m = (v, dp = 2) => `<span class="amt">${U.money(v, dp)}</span>`;
  U.ms = (v) => `<span class="amt">${U.moneyShort(v)}</span>`;
  /** Signed, colored currency. */
  U.mc = (v, dp = 2) => `<span class="amt ${v > 0.004 ? 'pos' : v < -0.004 ? 'neg' : ''}">${v > 0.004 ? '+' : ''}${U.money(v, dp)}</span>`;
  U.pct = (v, dp = 1) => `${(Number.isFinite(v) ? v * 100 : 0).toFixed(dp)}%`;
  U.pc = (v, dp = 2) => `<span class="${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}">${v > 0 ? '+' : ''}${U.pct(v, dp)}</span>`;
  U.qty = (v, dp = 8) => {
    const n = U.num(v);
    return n.toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) >= 1000 ? 2 : dp });
  };

  // ---------------- Dates (ISO 'YYYY-MM-DD', local) ----------------
  const p2 = (n) => String(n).padStart(2, '0');
  U.iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  U.today = () => U.iso(new Date());
  U.parse = (iso) => {
    if (!iso) return new Date(NaN);
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 12);
  };
  U.addDays = (iso, n) => { const d = U.parse(iso); d.setDate(d.getDate() + n); return U.iso(d); };
  U.addMonths = (iso, n, anchorDay) => {
    const d = U.parse(iso);
    const day = anchorDay || d.getDate();
    const t = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(day, last));
    return U.iso(t);
  };
  U.daysBetween = (a, b) => Math.round((U.parse(b) - U.parse(a)) / 86400000);
  U.monthKey = (iso) => String(iso).slice(0, 7);
  U.thisMonth = () => U.monthKey(U.today());
  U.shiftMonth = (key, n) => U.monthKey(U.addMonths(`${key}-01`, n));
  U.monthLabel = (key, long) => {
    const d = U.parse(`${key}-01`);
    return d.toLocaleDateString('en-US', { month: long ? 'long' : 'short', year: 'numeric' });
  };
  U.monthShort = (key) => U.parse(`${key}-01`).toLocaleDateString('en-US', { month: 'short' });
  U.fmtDate = (iso, opts) => {
    if (!iso) return '—';
    const d = U.parse(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-US', opts || { month: 'short', day: 'numeric', year: 'numeric' });
  };
  U.relDays = (iso) => {
    const n = U.daysBetween(U.today(), iso);
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    return n > 0 ? `in ${n} days` : `${-n} days ago`;
  };
  U.timeAgo = (ts) => {
    if (!ts) return 'never';
    const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };
  U.monthsRange = (endKey, count) => {
    const out = [];
    for (let i = count - 1; i >= 0; i--) out.push(U.shiftMonth(endKey, -i));
    return out;
  };

  // ---------------- Frequency helpers ----------------
  U.FREQ = {
    daily: { label: 'Daily', perYear: 365 },
    weekly: { label: 'Weekly', perYear: 52 },
    biweekly: { label: 'Every 2 weeks', perYear: 26 },
    semimonthly: { label: 'Twice a month', perYear: 24 },
    monthly: { label: 'Monthly', perYear: 12 },
    quarterly: { label: 'Quarterly', perYear: 4 },
    semiannual: { label: 'Every 6 months', perYear: 2 },
    yearly: { label: 'Yearly', perYear: 1 },
  };
  U.nextOccurrence = (iso, freq, anchorDay) => {
    switch (freq) {
      case 'daily': return U.addDays(iso, 1);
      case 'weekly': return U.addDays(iso, 7);
      case 'biweekly': return U.addDays(iso, 14);
      case 'semimonthly': {
        const d = U.parse(iso);
        if (d.getDate() < 15) { d.setDate(15); return U.iso(d); }
        return U.addMonths(U.iso(new Date(d.getFullYear(), d.getMonth(), 1, 12)), 1, 1);
      }
      case 'quarterly': return U.addMonths(iso, 3, anchorDay);
      case 'semiannual': return U.addMonths(iso, 6, anchorDay);
      case 'yearly': return U.addMonths(iso, 12, anchorDay);
      default: return U.addMonths(iso, 1, anchorDay);
    }
  };
  U.toMonthly = (amount, freq) => (U.num(amount) * (U.FREQ[freq]?.perYear || 12)) / 12;

  // ---------------- CSV ----------------
  U.csvParse = (text) => {
    const rows = [];
    let row = [], field = '', q = false;
    const s = String(text).replace(/^﻿/, '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some((x) => x.trim() !== '')) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some((x) => x.trim() !== '')) rows.push(row);
    return rows;
  };
  U.toCsv = (rows) => rows.map((r) => r.map((v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');

  /** Parse many common bank date formats into ISO. */
  U.parseAnyDate = (s) => {
    s = String(s || '').trim();
    let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${p2(+m[2])}-${p2(+m[3])}`;
    if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/))) {
      let y = +m[3]; if (y < 100) y += 2000;
      return `${y}-${p2(+m[1])}-${p2(+m[2])}`;
    }
    const d = new Date(s);
    return isNaN(d) ? null : U.iso(d);
  };

  U.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.by = (key, dir = 1) => (a, b) => {
    const va = typeof key === 'function' ? key(a) : a[key];
    const vb = typeof key === 'function' ? key(b) : b[key];
    return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
  };

  U.sha256 = async (text) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  U.download = async (name, content, filters) => {
    if (window.blam?.saveText) return window.blam.saveText({ defaultName: name, content, filters });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return name;
  };

  U.openFile = (accept) => {
    if (window.blam?.openText) {
      const ext = accept.replace(/\./g, '').split(',');
      return window.blam.openText({ filters: [{ name: 'Data', extensions: ext }] });
    }
    return new Promise((resolve) => {
      const i = document.createElement('input');
      i.type = 'file'; i.accept = accept;
      i.onchange = async () => {
        const f = i.files[0];
        resolve(f ? { name: f.name, content: await f.text() } : null);
      };
      i.click();
    });
  };

  B.U = U;
})(window.BLAM);
