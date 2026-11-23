/* Offline tests for the market-data fallback chain. Run: node test/market.test.js */
'use strict';
const assert = require('assert');
const M = require('../src/main/market.js');

const realFetch = global.fetch;
let calls = [];
function mock(router) {
  calls = [];
  global.fetch = async (url, opts = {}) => {
    calls.push(url);
    const r = router(url, opts) || { status: 500, body: 'unrouted' };
    const body = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return new Response(body, { status: r.status || 200, headers: r.headers || {} });
  };
}
const chart = (price, pct) => ({ chart: { result: [{ meta: { regularMarketPrice: price, regularMarketChangePercent: pct, chartPreviousClose: 1, longName: 'Test' }, indicators: { quote: [{ close: [1, 2, price] }] } }] } });

const tests = {
  async 'uses yahoo query1 when healthy, with correct daily change'() {
    mock((u) => u.includes('query1') ? { body: chart(100, -1.5) } : null);
    const r = await M.quotes(['VOO']);
    assert.strictEqual(r.VOO.price, 100);
    assert.strictEqual(r.VOO.change24h, -1.5);
  },
  async 'falls back to prior close when regularMarketChangePercent is missing'() {
    mock(() => ({ body: { chart: { result: [{ meta: { regularMarketPrice: 110, chartPreviousClose: 50 }, indicators: { quote: [{ close: [90, 100, 110] }] } }] } } }));
    const r = await M.quotes(['X']);
    assert.ok(Math.abs(r.X.change24h - 10) < 1e-9, `got ${r.X.change24h}`);
  },
  async 'query1 429 -> query2 succeeds'() {
    mock((u) => u.includes('query1') ? { status: 429 } : u.includes('query2') ? { body: chart(50, 1) } : null);
    const r = await M.quotes(['SCHD']);
    assert.strictEqual(r.SCHD.price, 50);
  },
  async 'both hosts 401 Invalid Crumb -> cookie+crumb handshake'() {
    mock((u, o) => {
      if (u.startsWith('https://fc.yahoo.com')) return { status: 404, headers: { 'set-cookie': 'A3=abc; Domain=.yahoo.com; Secure' } };
      if (u.includes('getcrumb')) return o.headers.Cookie === 'A3=abc' ? { body: 'Cr8mb' } : { status: 401 };
      if (u.includes('crumb=Cr8mb') && o.headers.Cookie === 'A3=abc') return { body: chart(42, 0.5) };
      if (u.includes('/v8/finance/chart')) return { status: 401, body: '{"finance":{"error":{"code":"Unauthorized","description":"Invalid Crumb"}}}' };
      return null;
    });
    const r = await M.quotes(['AAPL']);
    assert.strictEqual(r.AAPL.price, 42);
  },
  async 'yahoo fully down -> nasdaq fallback, and yahoo is skipped afterwards'() {
    mock((u) => {
      if (u.includes('yahoo')) return { status: 429 };
      if (u.includes('api.nasdaq.com') && u.includes('assetclass=stocks')) return { body: { data: null, status: { bCodeMessage: [{ errorMessage: 'Symbol not exists.' }] } } };
      if (u.includes('api.nasdaq.com') && u.includes('assetclass=etf')) return { body: { data: { companyName: 'Vanguard', primaryData: { lastSalePrice: '$634.90', percentageChange: '-3.51%' } } } };
      return null;
    });
    const r = await M.quotes(['VOO']);
    assert.strictEqual(r.VOO.price, 634.9);
    assert.strictEqual(r.VOO.change24h, -3.51);
    assert.strictEqual(r.VOO.source, 'Nasdaq');
    const before = calls.filter((u) => u.includes('yahoo')).length;
    await M.quotes(['JEPI']);
    assert.strictEqual(calls.filter((u) => u.includes('yahoo')).length, before, 'yahoo should be in cooldown');
  },
  async 'gold falls back to PAXG via CoinGecko when yahoo is down'() {
    mock((u) => u.includes('coingecko') && u.includes('pax-gold') ? { body: { 'pax-gold': { usd: 3600, usd_24h_change: 0.4 } } } : u.includes('yahoo') ? { status: 403 } : null);
    const r = await M.quotes(['GC=F', 'PA=F']);
    assert.strictEqual(r['GC=F'].price, 3600);
    assert.ok(r['PA=F'].error, 'palladium has no fallback -> error');
  },
  async 'unknown symbol reports "Symbol not found" (fallback still tried, no crumb handshake)'() {
    mock((u) => u.includes('yahoo') ? { status: 404, body: '{"chart":{"error":{"code":"Not Found"}}}' } : u.includes('nasdaq') ? { body: { data: null } } : null);
    const r = await M.quotes(['ZZZZQQ']);
    assert.strictEqual(r.ZZZZQQ.error, 'Symbol not found');
    assert.ok(!calls.some((u) => u.includes('getcrumb') || u.includes('query2')));
  },
  async 'every source down -> per-symbol error, never throws'() {
    mock(() => { throw new TypeError('fetch failed'); });
    const r = await M.quotes(['VOO', 'GC=F']);
    assert.ok(r.VOO.error && r['GC=F'].error);
  },
  async 'coingecko 429 with Retry-After is retried'() {
    let n = 0;
    mock((u) => u.includes('coingecko') ? (++n < 2 ? { status: 429, headers: { 'retry-after': '0' } } : { body: { bitcoin: { usd: 60000, usd_24h_change: 1 } } }) : null);
    const r = await M.cryptoPrices(['bitcoin', 'nope']);
    assert.strictEqual(r.bitcoin.price, 60000);
    assert.ok(r.nope.error);
    assert.strictEqual(n, 2);
  },
  async 'coingecko persistent 429 -> errors + cooldown (no further calls)'() {
    mock((u) => u.includes('coingecko') ? { status: 429, headers: { 'retry-after': '0' } } : null);
    const r = await M.cryptoPrices(['bitcoin']);
    assert.ok(/429/.test(r.bitcoin.error));
    const n = calls.length;
    const r2 = await M.cryptoPrices(['bitcoin']);
    assert.ok(r2.bitcoin.error);
    assert.strictEqual(calls.length, n, 'should not call during cooldown');
  },
  async 'dividends fall back to nasdaq history'() {
    const d = new Date(Date.now() - 30 * 86400e3);
    const us = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
    mock((u) => u.includes('yahoo') ? { status: 500 } : u.includes('/dividends?assetclass=stocks') ? { body: { data: { dividends: { rows: [{ exOrEffDate: us, amount: '$0.27' }, { exOrEffDate: '01/01/2001', amount: '$9' }] } } } } : null);
    const h = await M.dividendHistory('O', 2);
    assert.deepStrictEqual(h.map((x) => x.amount), [0.27]);
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    M._state.reset();
    try { await fn(); console.log('  ok  ', name); } catch (e) { failed++; console.log('  FAIL', name, '\n       ', e.message); }
  }
  global.fetch = realFetch;
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
