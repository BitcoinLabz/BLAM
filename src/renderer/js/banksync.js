/* BLAM — bank sync engine (SimpleFIN). Credentials live in the main process; this module only sees data. */
'use strict';
(function (B) {
  const { U, S } = B;
  const Sync = {};
  const desktop = () => !!window.blam?.syncFetch;

  /** Best-guess BLAM account type from a bank account name. */
  Sync.guessType = (name) => {
    const n = String(name || '').toLowerCase();
    if (/mortgage|heloc|auto loan|car loan|student|personal loan|\bloan\b/.test(n)) return 'loan';
    if (/credit|card|visa|mastercard|amex|discover|sapphire|freedom|venture|quicksilver|platinum|rewards/.test(n)) return 'credit';
    if (/401|403b|\bira\b|roth|retire|pension|tsp/.test(n)) return 'retirement';
    if (/\bhsa\b|health savings/.test(n)) return 'hsa';
    if (/brokerage|invest|individual|trading/.test(n)) return 'brokerage';
    if (/money market/.test(n)) return 'money_market';
    if (/\bcd\b|certificate/.test(n)) return 'cd';
    if (/savings|reserve|hysa|high.yield/.test(n)) return 'savings';
    return 'checking';
  };
  const LOAN_TYPE = (name) => {
    const n = String(name || '').toLowerCase();
    if (/mortgage/.test(n)) return 'mortgage';
    if (/heloc/.test(n)) return 'heloc';
    if (/auto|car/.test(n)) return 'auto';
    if (/student/.test(n)) return 'student';
    return 'personal';
  };
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  Sync.links = () => S.state.syncLinks;
  Sync.link = (remoteId) => S.state.syncLinks.find((l) => l.remoteId === remoteId);
  Sync.connected = () => !!S.state.settings.bankSyncConnected;

  /** Refresh the cached connection flag from the main process. */
  Sync.refreshStatus = async () => {
    if (!desktop()) return { connected: false };
    const st = await window.blam.syncStatus();
    if (!!st.connected !== !!S.state.settings.bankSyncConnected) S.setting('bankSyncConnected', !!st.connected);
    Sync.status = st;
    return st;
  };

  /** Record or refresh a remote account in syncLinks. */
  function upsertLink(s, a) {
    let l = s.syncLinks.find((x) => x.remoteId === a.id);
    if (!l) { l = { remoteId: a.id, target: '', targetId: '', needsHistory: true, createdAt: new Date().toISOString() }; s.syncLinks.push(l); }
    Object.assign(l, { remoteName: a.name, org: a.org, currency: a.currency, bankBalance: a.balance, balanceDate: a.balanceDate || l.balanceDate || null });
    return l;
  }

  /** Create a BLAM account (or loan) for a remote account and link it. */
  Sync.createFor = (s, l) => {
    const type = Sync.guessType(l.remoteName);
    if (type === 'loan') {
      const loan = { id: U.uid(), name: l.remoteName, type: LOAN_TYPE(l.remoteName), lender: l.org, balance: Math.abs(U.num(l.bankBalance)), originalPrincipal: Math.abs(U.num(l.bankBalance)), rate: 0, termMonths: 360, payment: 0, escrow: 0, extraMonthly: 0, startDate: U.today(), nextPaymentDate: U.addMonths(U.today(), 1), synced: true, createdAt: new Date().toISOString(), notes: 'Created by bank sync — add the rate and term for payoff projections.' };
      s.loans.push(loan);
      Object.assign(l, { target: 'loan', targetId: loan.id });
      return loan;
    }
    const acc = { id: U.uid(), name: l.remoteName, type, institution: l.org, balance: 0, color: B.Ch.PALETTE[s.accounts.length % 12], synced: true, createdAt: new Date().toISOString() };
    s.accounts.push(acc);
    Object.assign(l, { target: 'account', targetId: acc.id, needsHistory: true });
    return acc;
  };

  /** Auto-link on first sight: exact name match to an existing account, else create one. */
  function autoLink(s, l) {
    const match = s.accounts.find((a) => !a.archived && !s.syncLinks.some((x) => x !== l && x.targetId === a.id) && (norm(a.name) === norm(l.remoteName) || (a.institution && norm(`${a.institution}${a.name}`) === norm(`${l.org}${l.remoteName}`))));
    if (match) { Object.assign(l, { target: 'account', targetId: match.id, needsHistory: true }); return 'linked'; }
    Sync.createFor(s, l);
    return 'created';
  }

  /** Change what a remote account feeds. Moving it removes the transactions it imported so they re-import cleanly. */
  Sync.setLink = (remoteId, value) => {
    S.commit((s) => {
      const l = s.syncLinks.find((x) => x.remoteId === remoteId);
      if (!l) return;
      if (l.target === 'account' && l.targetId) {
        const old = s.transactions.filter((t) => t.extId && t.extId.startsWith(`${remoteId}::`) && t.accountId === l.targetId);
        old.forEach((t) => {
          const a = s.accounts.find((x) => x.id === t.accountId);
          if (a) a.balance = U.round(U.num(a.balance) + (S.accountKind(a) === 'credit' ? 1 : -1) * U.num(t.amount));
        });
        const ids = new Set(old.map((t) => t.id));
        s.transactions = s.transactions.filter((t) => !ids.has(t.id));
        // An account that bank sync created and that is now empty would just be clutter.
        const prev = s.accounts.find((a) => a.id === l.targetId);
        if (prev && prev.synced && !s.transactions.some((t) => t.accountId === prev.id) && !s.recurring.some((r) => r.accountId === prev.id || r.toAccountId === prev.id)) {
          s.accounts = s.accounts.filter((a) => a.id !== prev.id);
        }
      }
      if (value === 'ignore') Object.assign(l, { target: 'ignore', targetId: '' });
      else if (value === 'new') Sync.createFor(s, l);
      else if (value.startsWith('loan:')) Object.assign(l, { target: 'loan', targetId: value.slice(5) });
      else if (value.startsWith('account:')) Object.assign(l, { target: 'account', targetId: value.slice(8), needsHistory: true });
      else Object.assign(l, { target: '', targetId: '' });
    });
  };

  /** Import one remote account's transactions into its linked BLAM account. Returns counts. */
  function importInto(s, l, remote) {
    const acc = s.accounts.find((a) => a.id === l.targetId);
    if (!acc) return { added: 0, matched: 0 };
    const known = new Set(s.transactions.filter((t) => t.extId).map((t) => t.extId));
    const claimed = new Set();
    let added = 0, matched = 0;
    for (const t of remote.transactions.sort((a, b) => a.date.localeCompare(b.date))) {
      const extId = `${remote.id}::${t.id}`;
      if (known.has(extId)) continue;
      // Adopt an existing manual / CSV-imported transaction instead of duplicating it.
      const twin = s.transactions.find((x) => !x.extId && !claimed.has(x.id) && x.accountId === acc.id && Math.abs(U.num(x.amount) - t.amount) < 0.005 && Math.abs(U.daysBetween(x.date, t.date)) <= 3);
      if (twin) { twin.extId = extId; claimed.add(twin.id); matched++; continue; }
      S.addTransaction({ date: t.date, accountId: acc.id, payee: t.payee, amount: t.amount, note: t.memo && t.memo !== t.payee ? t.memo : '', extId, synced: true }, { silent: true });
      known.add(extId);
      added++;
    }
    return { added, matched };
  }

  /** Set the BLAM balance to what the bank reports (credit cards / loans are stored as amount owed). */
  function reconcileBalance(s, l, remote) {
    if (l.target === 'loan') {
      const loan = s.loans.find((x) => x.id === l.targetId);
      if (loan) { loan.balance = U.round(Math.abs(remote.balance)); loan.balanceSyncedAt = remote.balanceDate || U.today(); }
      return;
    }
    const acc = s.accounts.find((a) => a.id === l.targetId);
    if (!acc) return;
    acc.balance = U.round(S.accountKind(acc) === 'credit' ? -remote.balance : remote.balance);
    acc.balanceSyncedAt = remote.balanceDate || U.today();
  }

  let running = null;
  /** Pull everything from SimpleFIN. Safe to call repeatedly; only one sync runs at a time. */
  Sync.run = ({ quiet = false } = {}) => {
    if (running) return running;
    running = (async () => {
      const st = S.state.settings;
      if (!desktop()) { if (!quiet) B.UI.toast('Bank sync runs in the desktop app', 'warn'); return null; }
      if (navigator.onLine === false) { if (!quiet) B.UI.toast('You appear to be offline', 'warn'); return null; }
      const days = U.num(st.bankSyncDays) || 45;
      const needHistory = !st.lastBankSync || S.state.syncLinks.some((l) => l.needsHistory && l.target === 'account');
      const startDate = needHistory ? U.addDays(U.today(), -days) : U.addDays(String(st.lastBankSync).slice(0, 10), -7);
      document.body.classList.add('syncing');
      const now = new Date().toISOString();
      let res;
      try { res = await window.blam.syncFetch({ startDate }); } finally { document.body.classList.remove('syncing'); }
      if (!res.ok) {
        S.commit((s) => {
          s.settings.lastBankSyncResult = { at: now, ok: false, error: res.error, code: res.code };
          if (res.code === 'not_connected' || res.code === 'revoked' || res.code === 'locked') s.settings.bankSyncConnected = res.code !== 'not_connected' && s.settings.bankSyncConnected;
        });
        S.log(`Bank sync failed: ${res.error}`, 'warn');
        if (!quiet) B.UI.toast(res.error, 'error', 6000);
        return res;
      }
      let added = 0, matched = 0, created = 0, linked = 0;
      S.commit((s) => {
        for (const remote of res.accounts) {
          const l = upsertLink(s, remote);
          if (!l.target) { const r = autoLink(s, l); if (r === 'created') created++; else linked++; }
          if (l.target === 'ignore') continue;
          if (l.target === 'account') { const r = importInto(s, l, remote); added += r.added; matched += r.matched; }
          reconcileBalance(s, l, remote);
          l.lastSync = now;
          l.needsHistory = false;
        }
        s.settings.lastBankSync = now;
        s.settings.lastBankSyncResult = { at: now, ok: true, added, matched, created, linked, accounts: res.accounts.length, errors: res.errors };
      });
      S.snapshot();
      S.log(`Bank sync: ${res.accounts.length} accounts, ${added} new transactions${matched ? `, ${matched} matched to existing` : ''}${created ? `, ${created} accounts created` : ''}${res.errors.length ? ` · ${res.errors.join('; ')}` : ''}`, res.errors.length ? 'warn' : 'auto');
      if (!quiet || added) B.UI.toast(`Bank sync · ${added} new transaction${added === 1 ? '' : 's'}${created ? ` · ${created} account${created === 1 ? '' : 's'} added` : ''}`, res.errors.length ? 'warn' : 'ok');
      return res;
    })().catch((e) => { console.error('[bank sync]', e); if (!quiet) B.UI.toast(`Bank sync failed: ${e.message}`, 'error'); return null; })
      .finally(() => { running = null; });
    return running;
  };

  Sync.connect = async (token, opts) => {
    const res = await window.blam.syncConnect(token, opts);
    if (!res.ok) return res;
    S.commit((s) => { s.settings.bankSyncConnected = true; s.settings.lastBankSync = null; });
    Sync.status = res;
    await Sync.run();
    return res;
  };

  Sync.disconnect = async ({ forget = false } = {}) => {
    await window.blam.syncDisconnect();
    S.commit((s) => {
      s.settings.bankSyncConnected = false;
      s.settings.lastBankSync = null;
      s.settings.lastBankSyncResult = null;
      if (forget) s.syncLinks = [];
    });
  };

  /** Called from the automation scheduler every minute. */
  Sync.tick = () => {
    const st = S.state.settings;
    const hours = U.num(st.bankSyncHours);
    if (!desktop() || !st.bankSyncConnected || hours <= 0 || running) return;
    const last = st.lastBankSyncResult?.at ? new Date(st.lastBankSyncResult.at).getTime() : 0;
    // After a failure wait at least an hour before retrying (SimpleFIN allows ~24 requests a day).
    const wait = st.lastBankSyncResult && !st.lastBankSyncResult.ok ? Math.max(1, hours / 2) : hours;
    if (Date.now() - last > wait * 3600e3) Sync.run({ quiet: true });
  };

  B.Sync = Sync;
})(window.BLAM);
