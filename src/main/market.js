/**
 * BLAM — market data (main process only).
 */
'use strict';

// ---------------------------------------------------------------------------
// Market data
//
// Sources, in order of preference:
//   Crypto  : CoinGecko (429-aware exponential backoff + short cooldown)
//   Quotes  : Yahoo query1 -> Yahoo query2 -> Yahoo with cookie+crumb handshake
//             -> Nasdaq public quote API (stocks/ETFs/funds, no key)
//             -> CoinGecko gold/silver-backed tokens (PAXG / KAG) for GC=F / SI=F
//   Dividends: Yahoo (same chain) -> Nasdaq dividend history (Nasdaq-listed only)
// Every symbol resolves to either a price or an { error } so the UI can show a
// per-holding "price unavailable" state instead of failing silently.
// ---------------------------------------------------------------------------
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 BLAM/1.0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class HttpError extends Error {
  constructor(status, retryAfter, body) {
    super(status === 429 ? 'Rate limited (HTTP 429)' : `HTTP ${status}`);
    this.status = status;
    this.retryAfter = retryAfter;
    this.body = body;
  }
}

async function request(url, { timeoutMs = 12000, headers = {}, as = 'json' } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', ...headers }, signal: ctrl.signal });
    if (!res.ok) {
      const ra = Number(res.headers.get('retry-after'));
      throw new HttpError(res.status, Number.isFinite(ra) ? ra : null, await res.text().catch(() => ''));
    }
    if (as === 'raw') return res;
    const text = await res.text();
    if (as === 'text') return text;
    try { return JSON.parse(text); } catch (_) { throw new Error(/crumb/i.test(text) ? 'Invalid Crumb' : 'Bad JSON response'); }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Timed out');
    throw e;
  } finally {
    clearTimeout(t);
  }
}
const getJSON = (url, opts) => request(url, opts);

const retryable = (e) => e && (e.status === 429 || e.status >= 500 || e.message === 'Timed out');

/** Retry with exponential backoff, honouring Retry-After on 429. */
async function withBackoff(fn, { tries = 3, baseMs = 1500, maxWaitMs = 20000 } = {}) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= tries - 1 || !retryable(e)) throw e;
      const wait = e.retryAfter ? e.retryAfter * 1000 : baseMs * 2 ** i;
      await sleep(Math.min(maxWaitMs, wait));
    }
  }
}

// ----------------------------------------------------------------- CoinGecko
let cgCooldownUntil = 0;
async function coingecko(url) {
  if (Date.now() < cgCooldownUntil) throw new Error('CoinGecko rate limit — retrying shortly');
  try {
    return await withBackoff(() => getJSON(url), { tries: 4, baseMs: 2000 });
  } catch (e) {
    if (e.status === 429) cgCooldownUntil = Date.now() + 60000;
    throw e;
  }
}

/** CoinGecko simple price (no API key required). Unknown ids come back as { error }. */
async function cryptoPrices(ids) {
  if (!ids || !ids.length) return {};
  const uniq = [...new Set(ids.filter(Boolean).map((s) => s.toLowerCase()))];
  const out = {};
  for (let i = 0; i < uniq.length; i += 50) {
    const chunk = uniq.slice(i, i + 50);
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(chunk.join(','))}&vs_currencies=usd&include_24hr_change=true`;
    try {
      const data = await coingecko(url);
      for (const id of chunk) {
        const v = data[id];
        out[id] = v && Number.isFinite(v.usd)
          ? { price: v.usd, change24h: v.usd_24h_change ?? null, source: 'CoinGecko' }
          : { error: `CoinGecko has no price for "${id}"` };
      }
    } catch (e) {
      for (const id of chunk) out[id] = { error: String(e.message || e) };
    }
  }
  return out;
}

async function cryptoSearch(q) {
  const data = await coingecko(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`);
  return (data.coins || []).slice(0, 12).map((c) => ({ id: c.id, symbol: c.symbol, name: c.name, rank: c.market_cap_rank }));
}

// ----------------------------------------------------------------- Yahoo
const yahoo = { cookie: null, crumb: null, crumbAt: 0, downUntil: 0 };

/** Cookie + crumb handshake (what finance.yahoo.com does in a browser). Cached for 1h. */
async function yahooCrumb(force) {
  if (!force && yahoo.crumb && Date.now() - yahoo.crumbAt < 3600e3) return yahoo;
  yahoo.crumb = null;
  let cookie = '';
  try {
    const res = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(10000) });
    const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
    cookie = set.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
  } catch (_) { /* fall through: crumb request will fail and report */ }
  if (!cookie) throw new Error('Yahoo cookie handshake failed');
  const crumb = (await request('https://query2.finance.yahoo.com/v1/test/getcrumb', { as: 'text', headers: { Cookie: cookie } })).trim();
  if (!crumb || crumb.length > 40 || /[<{\s]/.test(crumb)) throw new Error('Yahoo crumb unavailable');
  Object.assign(yahoo, { cookie, crumb, crumbAt: Date.now() });
  return yahoo;
}

/** GET a Yahoo v8 chart with host fallback and, if needed, the crumb handshake. */
async function yahooChart(symbol, query) {
  if (Date.now() < yahoo.downUntil) throw new Error('Yahoo Finance unavailable');
  const pathQ = `/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`;
  let lastErr;
  for (const host of ['query1', 'query2']) {
    try { return await getJSON(`https://${host}.finance.yahoo.com${pathQ}`); } catch (e) {
      lastErr = e;
      if (e.status === 404) throw new Error('Symbol not found');
    }
  }
  if (lastErr && (lastErr.status === 401 || lastErr.status === 403 || lastErr.status === 429 || /crumb/i.test(lastErr.message))) {
    for (const force of [false, true]) {
      try {
        const y = await yahooCrumb(force);
        return await getJSON(`https://query2.finance.yahoo.com${pathQ}&crumb=${encodeURIComponent(y.crumb)}`, { headers: { Cookie: y.cookie } });
      } catch (e) {
        lastErr = e;
        if (e.status === 404) throw new Error('Symbol not found');
      }
    }
    // Yahoo is refusing us: skip it for a few minutes so the fallback runs fast.
    yahoo.downUntil = Date.now() + 5 * 60e3;
  }
  throw lastErr || new Error('Yahoo Finance unavailable');
}

/** Yahoo Finance chart endpoint: works for stocks, ETFs, mutual funds, futures (GC=F etc). */
async function yahooQuote(symbol) {
  const data = await yahooChart(symbol, 'range=5d&interval=1d');
  const r = data?.chart?.result?.[0];
  if (!r) throw new Error(data?.chart?.error?.description || 'No data');
  const m = r.meta || {};
  const price = m.regularMarketPrice;
  if (!Number.isFinite(price)) throw new Error('No price');
  // NB: chartPreviousClose is the close *before the 5-day window*, not yesterday's close.
  let change = Number.isFinite(m.regularMarketChangePercent) ? m.regularMarketChangePercent : null;
  if (change == null) {
    const closes = (r.indicators?.quote?.[0]?.close || []).filter(Number.isFinite);
    const prev = m.previousClose ?? (closes.length >= 2 ? closes[closes.length - 2] : null);
    change = prev ? ((price - prev) / prev) * 100 : null;
  }
  return { price, change24h: change, currency: m.currency, name: m.longName || m.shortName || symbol, exchange: m.exchangeName, source: 'Yahoo Finance' };
}

// ----------------------------------------------------------------- Fallbacks
const nasdaqNum = (s) => {
  const n = parseFloat(String(s ?? '').replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** Nasdaq public quote API (no key). Queries each asset class in parallel; first answer wins. */
async function nasdaqQuote(symbol) {
  if (/[=^]/.test(symbol)) throw new Error('Not supported by Nasdaq');
  const one = async (cls) => {
    const j = await getJSON(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info?assetclass=${cls}`, { timeoutMs: 8000 });
    const p = j?.data?.primaryData;
    const price = nasdaqNum(p?.lastSalePrice);
    if (price == null) throw new Error(`Nasdaq: ${j?.status?.bCodeMessage?.[0]?.errorMessage || 'no data'}`);
    return { price, change24h: nasdaqNum(p.percentageChange), name: j.data.companyName || symbol, source: 'Nasdaq' };
  };
  try {
    return await Promise.any(['stocks', 'etf', 'mutualfunds'].map(one));
  } catch (agg) {
    throw (agg.errors || [])[0] || new Error('Not found on Nasdaq');
  }
}

/** Gold / silver spot via CoinGecko tokens backed 1:1 by a troy ounce (PAXG, KAG). */
const METAL_TOKENS = { 'GC=F': 'pax-gold', 'SI=F': 'kinesis-silver' };
async function metalTokenQuote(symbol) {
  const id = METAL_TOKENS[symbol];
  if (!id) throw new Error('No fallback source for this metal');
  const r = (await cryptoPrices([id]))[id];
  if (!r || r.error) throw new Error(r?.error || 'No price');
  return { ...r, source: `CoinGecko (${id}, approx. spot)` };
}

async function quoteWithFallback(symbol) {
  const errors = [];
  for (const fn of [yahooQuote, METAL_TOKENS[symbol] ? metalTokenQuote : nasdaqQuote]) {
    try { return await fn(symbol); } catch (e) { errors.push(String(e.message || e)); }
  }
  return { error: errors[0] === 'Symbol not found' ? 'Symbol not found' : `Price unavailable (${errors.join('; ')})` };
}

async function quotes(symbols) {
  const out = {};
  const uniq = [...new Set((symbols || []).filter(Boolean).map((s) => s.toUpperCase()))];
  // Small concurrency pool to be polite to the endpoints.
  const pool = 4;
  let idx = 0;
  async function worker() {
    while (idx < uniq.length) {
      const sym = uniq[idx++];
      out[sym] = await quoteWithFallback(sym);
    }
  }
  await Promise.all(Array.from({ length: Math.min(pool, uniq.length) }, worker));
  return out;
}

/** Dividend history (per-share amounts) for the last N years. */
async function dividendHistory(symbol, years = 2) {
  try {
    const data = await yahooChart(symbol, `range=${years}y&interval=1mo&events=div`);
    if (!data?.chart?.result?.[0]) throw new Error('No data');
    const divs = data.chart.result[0].events?.dividends || {};
    return Object.values(divs)
      .map((d) => ({ date: new Date(d.date * 1000).toISOString().slice(0, 10), amount: d.amount }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (yErr) {
    if (yErr.message === 'Symbol not found') throw yErr;
    for (const cls of ['stocks', 'etf']) {
      try {
        const j = await getJSON(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/dividends?assetclass=${cls}`, { timeoutMs: 10000 });
        const rows = j?.data?.dividends?.rows;
        if (!Array.isArray(rows)) continue;
        const since = new Date(Date.now() - years * 365 * 86400e3).toISOString().slice(0, 10);
        return rows.map((r) => {
          const m = String(r.exOrEffDate || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          return m ? { date: `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`, amount: nasdaqNum(r.amount) } : null;
        }).filter((d) => d && d.amount != null && d.date >= since).sort((a, b) => a.date.localeCompare(b.date));
      } catch (_) { /* try next */ }
    }
    throw yErr;
  }
}

module.exports = { cryptoPrices, cryptoSearch, quotes, quoteWithFallback, yahooQuote, nasdaqQuote, dividendHistory, _state: { yahoo, reset() { cgCooldownUntil = 0; Object.assign(yahoo, { cookie: null, crumb: null, crumbAt: 0, downUntil: 0 }); } } };
