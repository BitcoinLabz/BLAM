/* BLAM — automation engine: recurring auto-posting, loan amortized payments, live prices, dividend sync, reminders, snapshots. */
'use strict';
(function (B) {
  const { U, F, S } = B;
  const A = {};

  A.CRYPTO_IDS = {
    BTC: 'bitcoin', ETH: 'ethereum', STX: 'blockstack', SOL: 'solana', XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin',
    LTC: 'litecoin', DOT: 'polkadot', AVAX: 'avalanche-2', LINK: 'chainlink', MATIC: 'matic-network', POL: 'polygon-ecosystem-token',
    BNB: 'binancecoin', USDT: 'tether', USDC: 'usd-coin', ATOM: 'cosmos', XLM: 'stellar', HBAR: 'hedera-hashgraph',
    SUI: 'sui', NEAR: 'near', APT: 'aptos', ARB: 'arbitrum', OP: 'optimism', TON: 'the-open-network', SHIB: 'shiba-inu',
    PEPE: 'pepe', UNI: 'uniswap', AAVE: 'aave', CRO: 'crypto-com-chain', ALGO: 'algorand', XMR: 'monero', BCH: 'bitcoin-cash',
    ETC: 'ethereum-classic', FIL: 'filecoin', ICP: 'internet-computer', RNDR: 'render-token', RENDER: 'render-token', INJ: 'injective-protocol',
    TRX: 'tron', KAS: 'kaspa', SEI: 'sei-network', TAO: 'bittensor', WIF: 'dogwifcoin', BONK: 'bonk', JUP: 'jupiter-exchange-solana',
    ALEX: 'alexgo', WELSH: 'welshcorgicoin', SBTC: 'sbtc-2', PAXG: 'pax-gold', XAUT: 'tether-gold',
  };
  A.cryptoId = (h) => (h.coingeckoId || A.CRYPTO_IDS[String(h.symbol || '').toUpperCase()] || '').toLowerCase();

  const hasDesktop = () => !!window.blam?.isDesktop;

  // --------------------------------------------------------------- recurring
  A.LOAN_CATEGORY = { mortgage: 'Mortgage / Rent', heloc: 'Mortgage / Rent', auto: 'Auto Payment' };

  /** Post one occurrence of a recurring item on `date`. Returns a description. */
  A.postRecurring = (r, date) => {
    const s = S.state;
    if (r.kind === 'loan') {
      const loan = s.loans.find((l) => l.id === r.loanId);
      if (!loan) return null;
      const pmt = F.loanPayment(loan);
      const interest = U.num(loan.balance) * U.num(loan.rate) / 100 / 12;
      const extra = U.num(r.includeExtra === false ? 0 : loan.extraMonthly);
      const principal = Math.min(U.num(loan.balance), Math.max(0, pmt - interest) + extra);
      const total = U.round(Math.min(pmt + extra, U.num(loan.balance) + interest) + U.num(loan.escrow));
      S.addTransaction({
        date, accountId: r.accountId, payee: r.name || loan.name, amount: -total,
        category: r.category || A.LOAN_CATEGORY[loan.type] || 'Loan Payment', recurringId: r.id, loanId: loan.id,
        note: `Auto: principal ${U.money(principal)} · interest ${U.money(interest)}${U.num(loan.escrow) ? ` · escrow ${U.money(loan.escrow)}` : ''}`,
      }, { silent: true });
      loan.balance = U.round(Math.max(0, U.num(loan.balance) - principal));
      loan.nextPaymentDate = U.addMonths(date, 1, U.parse(loan.nextPaymentDate || date).getDate());
      (loan.payments = loan.payments || []).push({ date, principal: U.round(principal), interest: U.round(interest), escrow: U.num(loan.escrow) });
      if (loan.payments.length > 600) loan.payments.shift();
      return `${loan.name}: paid ${U.money(total)} (principal ${U.money(principal)})`;
    }
    if (r.kind === 'transfer') {
      const amt = Math.abs(U.num(r.amount));
      S.addTransaction({ date, accountId: r.accountId, payee: r.name, amount: -amt, category: r.category || 'Transfer', recurringId: r.id, note: 'Auto transfer out' }, { silent: true });
      if (r.toAccountId) {
        const to = s.accounts.find((a) => a.id === r.toAccountId);
        S.addTransaction({ date, accountId: r.toAccountId, payee: r.name, amount: amt, category: to && S.accountKind(to) === 'credit' ? 'Credit Card Payment' : (r.category || 'Transfer'), recurringId: r.id, note: 'Auto transfer in' }, { silent: true });
      }
      return `${r.name}: transferred ${U.money(amt)}`;
    }
    const amt = Math.abs(U.num(r.amount)) * (r.kind === 'income' ? 1 : -1);
    S.addTransaction({ date, accountId: r.accountId, payee: r.name, amount: amt, category: r.category, recurringId: r.id, propertyId: r.propertyId, note: 'Auto-posted' }, { silent: true });
    return `${r.name}: ${amt > 0 ? '+' : ''}${U.money(amt)}`;
  };

  A.runRecurring = () => {
    const s = S.state;
    if (!s.settings.autoPostRecurring) return [];
    const today = U.today();
    const posted = [];
    for (const r of s.recurring) {
      if (!r.autoPost || r.paused || !r.nextDate || !r.accountId || !s.accounts.some((a) => a.id === r.accountId)) continue;
      let guard = 0;
      while (r.nextDate <= today && guard++ < 120) {
        if (r.endDate && r.nextDate > r.endDate) { r.paused = true; break; }
        const msg = A.postRecurring(r, r.nextDate);
        if (msg) posted.push(msg);
        r.lastPosted = r.nextDate;
        r.nextDate = U.nextOccurrence(r.nextDate, r.frequency, r.anchorDay);
      }
    }
    if (posted.length) {
      posted.forEach((m) => S.log(m, 'auto'));
      S.commit(() => {});
      B.UI.toast(`Automation posted ${posted.length} recurring item${posted.length > 1 ? 's' : ''}`);
    }
    return posted;
  };

  // --------------------------------------------------------------- prices
  async function fetchQuotes(symbols) {
    if (hasDesktop()) return window.blam.quotes(symbols);
    const out = {};
    for (const sym of symbols) {
      try {
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`);
        const j = await r.json(); const m = j.chart.result[0].meta;
        out[sym] = { price: m.regularMarketPrice, change24h: m.chartPreviousClose ? ((m.regularMarketPrice - m.chartPreviousClose) / m.chartPreviousClose) * 100 : null, name: m.longName || m.shortName };
      } catch (e) { out[sym] = { error: 'Unavailable in browser preview' }; }
    }
    return out;
  }
  async function fetchCrypto(ids) {
    if (hasDesktop()) return window.blam.cryptoPrices(ids);
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`);
    const j = await r.json(); const out = {};
    for (const [k, v] of Object.entries(j)) out[k] = { price: v.usd, change24h: v.usd_24h_change };
    return out;
  }

  let refreshing = false;
  A.refreshPrices = async ({ quiet = false } = {}) => {
    if (refreshing) return;
    refreshing = true;
    document.body.classList.add('refreshing');
    const s = S.state;
    let ok = 0, fail = 0;
    const now = new Date().toISOString();
    try {
      const auto = s.holdings.filter((h) => h.autoPrice !== false);
      const cryptoH = auto.filter((h) => h.assetClass === 'crypto' && A.cryptoId(h));
      const secH = auto.filter((h) => h.assetClass !== 'crypto' && h.symbol);
      const metalSyms = Object.entries(S.METALS).filter(([k]) => s.metals.some((m) => m.metal === k) || ['gold', 'silver'].includes(k)).map(([, v]) => v.symbol);
      const offline = navigator.onLine === false;

      const [cp, qp] = offline ? [{}, {}] : await Promise.all([
        cryptoH.length ? fetchCrypto(cryptoH.map(A.cryptoId)).catch((e) => { console.warn(e); return {}; }) : {},
        (secH.length || metalSyms.length) ? fetchQuotes([...secH.map((h) => h.symbol.toUpperCase()), ...metalSyms]).catch((e) => { console.warn(e); return {}; }) : {},
      ]);
      const errors = [];
      S.commit((st) => {
        for (const h of st.holdings) {
          if (h.autoPrice === false) { delete h.priceError; continue; }
          const key = h.assetClass === 'crypto' ? A.cryptoId(h) : String(h.symbol || '').toUpperCase();
          if (!key) { h.priceError = h.assetClass === 'crypto' ? 'No CoinGecko ID — edit the holding or use Find coin' : 'No ticker symbol'; fail++; continue; }
          if (offline) continue; // keep last known state; the top bar shows we're offline
          const q = h.assetClass === 'crypto' ? cp[key] : qp[key];
          if (q && Number.isFinite(q.price)) {
            h.price = q.price; h.change24h = Number.isFinite(q.change24h) ? q.change24h : null; h.priceUpdated = now; h.priceSource = q.source || null; ok++;
            delete h.priceError;
            if (!h.name && q.name) h.name = q.name;
          } else {
            h.priceError = q?.error || 'No response from price service';
            errors.push(`${h.symbol}: ${h.priceError}`);
            fail++;
          }
        }
        let metalsOk = 0;
        for (const [k, v] of Object.entries(S.METALS)) {
          const q = qp[v.symbol];
          if (q && Number.isFinite(q.price)) {
            st.metalPrices[k] = q.price; st.metalPrices[`${k}Change`] = Number.isFinite(q.change24h) ? q.change24h : null; metalsOk++;
            if (s.metals.some((m) => m.metal === k)) ok++;
          } else if (!offline && s.metals.some((m) => m.metal === k)) { fail++; errors.push(`${v.label}: ${q?.error || 'unavailable'}`); }
        }
        if (metalsOk) st.metalPrices.updated = now;
        st.settings.lastPriceRefresh = now;
        st.settings.lastPriceStatus = { at: now, ok, fail: offline ? Math.max(1, fail) : fail, offline };
        if (ok) st.settings.lastPriceSuccess = now;
      });
      S.snapshot();
      if (errors.length) console.warn('[prices]', errors.join(' | '));
      if (!quiet) {
        if (offline) B.UI.toast('You appear to be offline — prices not updated', 'warn');
        else B.UI.toast(fail ? `Updated ${ok} prices · ${fail} unavailable` : `Updated ${ok} live prices`, fail && !ok ? 'error' : fail ? 'warn' : 'ok');
      }
      S.log(offline ? 'Price refresh skipped: offline' : `Price refresh: ${ok} updated${fail ? `, ${fail} unavailable` : ''}`, fail && !ok ? 'warn' : 'auto');
    } catch (e) {
      console.error(e);
      S.commit((st) => { st.settings.lastPriceRefresh = now; st.settings.lastPriceStatus = { at: now, ok: 0, fail: 1, offline: navigator.onLine === false }; });
      if (!quiet) B.UI.toast('Price refresh failed — check your connection', 'error');
    } finally {
      refreshing = false;
      document.body.classList.remove('refreshing');
    }
  };

  // Refresh as soon as the connection comes back.
  window.addEventListener('online', () => setTimeout(() => A.refreshPrices({ quiet: true }), 1500));
  window.addEventListener('offline', () => B.rerender && B.rerender());

  A.searchCrypto = async (q) => {
    if (hasDesktop()) return window.blam.cryptoSearch(q);
    const r = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`);
    const j = await r.json();
    return (j.coins || []).slice(0, 12).map((c) => ({ id: c.id, symbol: c.symbol, name: c.name, rank: c.market_cap_rank }));
  };

  // --------------------------------------------------------------- dividends
  A.syncDividends = async () => {
    const s = S.state;
    const targets = s.holdings.filter((h) => ['stock', 'etf', 'mutual_fund'].includes(h.assetClass) && h.symbol);
    if (!targets.length) { B.UI.toast('Add stocks or ETFs first', 'warn'); return; }
    if (!hasDesktop()) { B.UI.toast('Dividend sync runs in the desktop app', 'warn'); return; }
    let logged = 0, updated = 0;
    const failed = [];
    B.UI.toast(`Syncing dividends for ${targets.length} holding${targets.length === 1 ? '' : 's'}…`);
    for (const h of targets) {
      try {
        const hist = await window.blam.dividends(h.symbol.toUpperCase(), 2);
        const yearAgo = U.addDays(U.today(), -365);
        const ttm = U.sum(hist.filter((d) => d.date > yearAgo), (d) => d.amount);
        S.commit((st) => {
          const hh = st.holdings.find((x) => x.id === h.id);
          hh.annualDividendPerShare = U.round(ttm, 4);
          if (U.num(hh.price) > 0) hh.dividendYield = U.round((ttm / hh.price) * 100, 3);
          hh.dividendFrequency = hist.filter((d) => d.date > yearAgo).length;
          updated++;
          const since = hh.acquiredDate || (hh.createdAt || '').slice(0, 10) || U.today();
          for (const d of hist) {
            if (d.date < since || d.date > U.today()) continue;
            if (st.dividends.some((x) => x.holdingId === hh.id && x.date === d.date)) continue;
            st.dividends.push({ id: U.uid(), holdingId: hh.id, symbol: hh.symbol.toUpperCase(), date: d.date, perShare: d.amount, shares: U.num(hh.quantity), amount: U.round(d.amount * U.num(hh.quantity)), auto: true });
            logged++;
          }
        }, { silent: true });
      } catch (e) { failed.push(h.symbol); console.warn('[dividends]', h.symbol, String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
    }
    S.commit(() => {});
    S.log(`Dividend sync: ${updated} holdings updated, ${logged} payouts logged${failed.length ? `, unavailable: ${failed.join(', ')}` : ''}`, failed.length ? 'warn' : 'auto');
    if (failed.length && !updated) B.UI.toast(`Dividend data unavailable — check your connection (${failed.join(', ')})`, 'error');
    else B.UI.toast(`Dividends synced · ${logged} new payout${logged === 1 ? '' : 's'} logged${failed.length ? ` · ${failed.length} unavailable (${failed.join(', ')})` : ''}`, failed.length ? 'warn' : 'ok');
  };

  // --------------------------------------------------------------- reminders
  /** Everything due in the next `days` days: recurring bills, card due dates, loan payments. */
  A.upcoming = (days = 30) => {
    const s = S.state;
    const today = U.today(), end = U.addDays(today, days);
    const out = [];
    for (const r of s.recurring) {
      if (r.paused || !r.nextDate) continue;
      let d = r.nextDate, g = 0;
      while (d <= end && g++ < 60) {
        if (d >= today) {
          const loan = r.kind === 'loan' ? s.loans.find((l) => l.id === r.loanId) : null;
          const amt = loan ? F.loanPayment(loan) + U.num(loan.escrow) + U.num(loan.extraMonthly) : U.num(r.amount);
          out.push({ date: d, name: r.name, amount: r.kind === 'income' ? amt : -amt, kind: r.kind, auto: r.autoPost, source: 'recurring', id: r.id });
        }
        d = U.nextOccurrence(d, r.frequency, r.anchorDay);
      }
    }
    for (const a of S.activeAccounts()) {
      if (S.accountKind(a) !== 'credit' || !a.dueDay || U.num(a.balance) <= 0) continue;
      let d = U.iso(new Date(U.parse(today).getFullYear(), U.parse(today).getMonth(), Math.min(+a.dueDay, 28), 12));
      if (d < today) d = U.addMonths(d, 1, +a.dueDay);
      if (d <= end) out.push({ date: d, name: `${a.name} due`, amount: -(U.num(a.minPayment) || Math.max(25, U.num(a.balance) * 0.02)), kind: 'card', source: 'card', id: a.id, statement: U.num(a.balance) });
    }
    for (const l of s.loans) {
      if (l.archived || U.num(l.balance) <= 0) continue;
      if (s.recurring.some((r) => r.kind === 'loan' && r.loanId === l.id && !r.paused)) continue;
      const d = F.nextPaymentDate(l);
      if (d <= end) out.push({ date: d, name: `${l.name} payment`, amount: -(F.loanPayment(l) + U.num(l.escrow)), kind: 'loan', source: 'loan', id: l.id });
    }
    for (const p of s.properties) for (const u of (p.units || [])) {
      if (u.leaseEnd && u.leaseEnd >= today && u.leaseEnd <= U.addDays(today, Math.max(days, 60))) out.push({ date: u.leaseEnd, name: `Lease ends: ${u.tenant || 'Unit'} @ ${p.name}`, amount: 0, kind: 'lease', source: 'lease', id: p.id });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  };

  A.remind = () => {
    const s = S.state;
    if (!s.settings.notifications || s.settings.lastReminderDate === U.today()) return;
    const due = A.upcoming(U.num(s.settings.reminderDays) || 7).filter((x) => x.amount < 0 && !x.auto);
    s.settings.lastReminderDate = U.today();
    S.save();
    if (!due.length) return;
    const total = U.sum(due, (x) => -x.amount);
    const body = `${due.length} bill${due.length > 1 ? 's' : ''} due soon (${U.money(total, 0)}): ${due.slice(0, 3).map((d) => d.name).join(', ')}${due.length > 3 ? '…' : ''}`;
    if (window.blam?.notify) window.blam.notify('BLAM · Upcoming bills', body);
  };

  // --------------------------------------------------------------- scheduler
  let lastDay = null;
  A.tick = () => {
    const s = S.state;
    const today = U.today();
    if (today !== lastDay) {
      lastDay = today;
      A.runRecurring();
      S.snapshot();
      A.remind();
    }
    const mins = U.num(s.settings.autoRefreshMinutes);
    if (mins > 0 && s.holdings.length + s.metals.length > 0) {
      const last = s.settings.lastPriceRefresh ? new Date(s.settings.lastPriceRefresh).getTime() : 0;
      if (Date.now() - last > mins * 60000) A.refreshPrices({ quiet: true });
    }
  };
  A.start = () => {
    A.tick();
    setInterval(A.tick, 60000);
  };

  B.A = A;
})(window.BLAM);
