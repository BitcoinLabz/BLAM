/* BLAM — state store: persistence, schema, CRUD, derived totals. */
'use strict';
(function (B) {
  const { U, F } = B;
  const S = {};
  let state = null;
  const listeners = new Set();
  const SCHEMA_VERSION = 2;

  // ---------------------------------------------------------------- constants
  S.ACCOUNT_TYPES = {
    checking: { label: 'Checking', kind: 'cash' },
    savings: { label: 'Savings', kind: 'cash' },
    hysa: { label: 'High-Yield Savings', kind: 'cash' },
    money_market: { label: 'Money Market', kind: 'cash' },
    cd: { label: 'Certificate of Deposit', kind: 'cash' },
    cash: { label: 'Cash on Hand', kind: 'cash' },
    credit: { label: 'Credit Card', kind: 'credit' },
    line_of_credit: { label: 'Line of Credit', kind: 'credit' },
    brokerage: { label: 'Brokerage (cash)', kind: 'invest' },
    retirement: { label: 'Retirement (401k / IRA)', kind: 'invest' },
    hsa: { label: 'HSA', kind: 'invest' },
    crypto_exchange: { label: 'Crypto Exchange (cash)', kind: 'invest' },
    other: { label: 'Other', kind: 'cash' },
  };
  S.ASSET_CLASSES = {
    crypto: { label: 'Crypto', color: '#F7931A' },
    stock: { label: 'Stocks', color: '#3B82F6' },
    etf: { label: 'ETFs', color: '#14B8A6' },
    mutual_fund: { label: 'Mutual Funds', color: '#8B5CF6' },
    bond: { label: 'Bonds / Treasuries', color: '#64748B' },
    other: { label: 'Other Securities', color: '#EC4899' },
  };
  S.PROPERTY_TYPES = {
    primary: 'Primary Residence', rental: 'Long-term Rental', multifamily: 'Multi-family', str: 'Short-term Rental',
    vacation: 'Vacation Home', commercial: 'Commercial', land: 'Land / Lot',
  };
  S.LOAN_TYPES = {
    mortgage: 'Mortgage', heloc: 'HELOC', auto: 'Auto Loan', student: 'Student Loan', personal: 'Personal Loan',
    business: 'Business Loan', medical: 'Medical', other: 'Other',
  };
  S.METALS = {
    gold: { label: 'Gold', symbol: 'GC=F', color: '#EAB308' },
    silver: { label: 'Silver', symbol: 'SI=F', color: '#CBD5E1' },
    platinum: { label: 'Platinum', symbol: 'PL=F', color: '#93C5FD' },
    palladium: { label: 'Palladium', symbol: 'PA=F', color: '#A78BFA' },
    copper: { label: 'Copper', symbol: 'HG=F', color: '#F97316', unit: 'lb' },
  };
  S.PASSIVE_TYPES = {
    staking: 'Crypto Staking / Yield', interest: 'Interest / CDs', royalty: 'Royalties', business: 'Business / Side Hustle',
    p2p: 'Private Lending / Notes', affiliate: 'Affiliate / Digital', mining: 'Mining', annuity: 'Annuity / Pension', vending: 'Vending / ATMs', other: 'Other',
  };
  S.OTHER_ASSET_TYPES = {
    vehicle: 'Vehicle', business: 'Business Equity', collectible: 'Collectibles', jewelry: 'Jewelry', equipment: 'Equipment',
    receivable: 'Money Owed to Me', insurance: 'Cash-Value Life Insurance', other: 'Other',
  };

  const C = (name, group, type, budget = 0) => ({ id: U.uid(), name, group, type, budget });
  S.defaultCategories = () => [
    C('Salary', 'Income', 'income'), C('Commission', 'Income', 'income'), C('Business Income', 'Income', 'income'),
    C('Rental Income', 'Income', 'income'), C('Dividends', 'Income', 'income'), C('Interest', 'Income', 'income'),
    C('Crypto Income', 'Income', 'income'), C('Other Income', 'Income', 'income'),
    C('Mortgage / Rent', 'Housing', 'expense'), C('Property Tax', 'Housing', 'expense'), C('Home Insurance', 'Housing', 'expense'),
    C('HOA', 'Housing', 'expense'), C('Home Maintenance', 'Housing', 'expense'),
    C('Electric', 'Utilities', 'expense'), C('Gas / Heat', 'Utilities', 'expense'), C('Water / Sewer', 'Utilities', 'expense'),
    C('Internet', 'Utilities', 'expense'), C('Phone', 'Utilities', 'expense'),
    C('Auto Payment', 'Transportation', 'expense'), C('Fuel', 'Transportation', 'expense'), C('Auto Insurance', 'Transportation', 'expense'),
    C('Auto Maintenance', 'Transportation', 'expense'), C('Parking / Tolls', 'Transportation', 'expense'),
    C('Groceries', 'Food', 'expense'), C('Dining Out', 'Food', 'expense'), C('Coffee', 'Food', 'expense'),
    C('Shopping', 'Personal', 'expense'), C('Clothing', 'Personal', 'expense'), C('Health & Fitness', 'Personal', 'expense'),
    C('Medical', 'Personal', 'expense'), C('Personal Care', 'Personal', 'expense'),
    C('Entertainment', 'Lifestyle', 'expense'), C('Subscriptions', 'Lifestyle', 'expense'), C('Travel', 'Lifestyle', 'expense'),
    C('Gifts & Donations', 'Lifestyle', 'expense'),
    C('Childcare', 'Family', 'expense'), C('Education', 'Family', 'expense'), C('Pets', 'Family', 'expense'),
    C('Loan Payment', 'Debt', 'expense'), C('Credit Card Interest', 'Debt', 'expense'), C('Bank Fees', 'Debt', 'expense'),
    C('Taxes', 'Financial', 'expense'), C('Insurance (Life/Other)', 'Financial', 'expense'),
    C('Business Expense', 'Business', 'expense'), C('Marketing', 'Business', 'expense'), C('Rental Expense', 'Business', 'expense'),
    C('Investing', 'Savings & Investing', 'transfer'), C('Transfer', 'Transfers', 'transfer'), C('Credit Card Payment', 'Transfers', 'transfer'),
    C('Miscellaneous', 'Other', 'expense'),
  ];

  S.blank = () => ({
    version: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    settings: {
      currency: 'USD', userName: '', autoRefreshMinutes: 15, autoPostRecurring: true, notifications: true,
      reminderDays: 7, privacy: false, pinHash: null, lastPriceRefresh: null, lastReminderDate: null,
      onboarded: false, expectedReturn: 7, safeWithdrawalRate: 4, autoUpdate: true,
    },
    accounts: [], transactions: [], categories: S.defaultCategories(), rules: [],
    holdings: [], dividends: [], properties: [], loans: [], metals: [],
    metalPrices: { gold: 0, silver: 0, platinum: 0, palladium: 0, copper: 0, updated: null },
    passive: [], otherAssets: [], recurring: [], goals: [], snapshots: [], log: [],
  });

  /** Bring any saved data up to the current schema. Only ever adds; never drops user data. */
  function migrate(s) {
    const b = S.blank();
    // v2 data from 1.1.x may contain syncLinks / settings.bankSync* from the removed SimpleFIN feature.
    // They are left untouched (harmless) so nothing a user saved is ever dropped.
    for (const k of Object.keys(b)) if (s[k] === undefined) s[k] = b[k];
    s.settings = { ...b.settings, ...s.settings };
    s.metalPrices = { ...b.metalPrices, ...s.metalPrices };
    s.version = SCHEMA_VERSION;
    return s;
  }

  // ---------------------------------------------------------------- persistence
  /** Set when loading failed in a way where saving could destroy the user's data. */
  S.loadProblem = null;
  S.load = async () => {
    let raw = null;
    try {
      const res = window.blam ? await window.blam.load() : localStorage.getItem('blam-data');
      if (res && typeof res === 'object') {
        raw = res.raw;
        if (res.recoveredFrom) S.loadProblem = { recovered: true, msg: `Your data file was damaged, so BLAM restored the backup "${res.recoveredFrom}". The damaged file was kept as ${res.corruptCopy}.` };
        else if (res.unrecoverable) S.loadProblem = { readOnly: true, msg: `Your data file is damaged and no valid backup was found. It was kept as ${res.corruptCopy}. BLAM will not save until you restore a backup.` };
      } else raw = res;
    } catch (e) {
      console.error(e);
      S.loadProblem = { readOnly: true, msg: `BLAM could not read your data file (${e.message}). Saving is paused so nothing is overwritten — restart BLAM, or restore a backup in Settings.` };
    }
    try { state = raw ? JSON.parse(raw) : null; } catch (e) {
      console.error('Corrupt data', e);
      state = null;
      if (raw) S.loadProblem = { readOnly: true, msg: 'Your saved data could not be read. Saving is paused so nothing is overwritten — restore a backup in Settings.' };
    }
    state = migrate(state || S.blank());
    U.setCurrency(state.settings.currency);
    return state;
  };

  let saveTimer = null, saving = Promise.resolve();
  S.saveNow = () => {
    clearTimeout(saveTimer);
    if (S.loadProblem?.readOnly) return saving;
    const json = JSON.stringify(state);
    saving = saving.then(async () => {
      try {
        if (window.blam) await window.blam.save(json);
        else localStorage.setItem('blam-data', json);
      } catch (e) { console.error('Save failed', e); B.UI?.toast('Save failed: ' + e.message, 'error'); }
    });
    return saving;
  };
  S.save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(S.saveNow, 300); };

  /** Replace all data. `reason` (erase / restore / demo) keeps a safety copy of the current file first. */
  S.replaceAll = async (obj, reason) => {
    await saving;
    if (reason && window.blam?.safetyBackup && !S.loadProblem?.readOnly) await window.blam.safetyBackup(reason);
    if (S.loadProblem?.readOnly) S.loadProblem = null; // an explicit restore/erase is the user's decision
    state = migrate(obj);
    U.setCurrency(state.settings.currency);
    await S.saveNow();
    emit();
  };

  Object.defineProperty(S, 'state', { get: () => state });

  S.on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  function emit() { listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } }); }

  /** Run a mutation, persist, notify. */
  S.commit = (fn, { silent = false } = {}) => {
    const r = fn(state);
    S.save();
    if (!silent) emit();
    return r;
  };

  // ---------------------------------------------------------------- CRUD
  S.get = (col, id) => state[col].find((x) => x.id === id);
  S.upsert = (col, obj, opts) => S.commit((s) => {
    if (!obj.id) obj.id = U.uid();
    const i = s[col].findIndex((x) => x.id === obj.id);
    if (i >= 0) s[col][i] = { ...s[col][i], ...obj };
    else s[col].push({ createdAt: new Date().toISOString(), ...obj });
    return obj;
  }, opts);
  S.remove = (col, id, opts) => S.commit((s) => { s[col] = s[col].filter((x) => x.id !== id); }, opts);

  S.log = (msg, type = 'info') => {
    state.log.unshift({ ts: new Date().toISOString(), msg, type });
    if (state.log.length > 300) state.log.length = 300;
    S.save();
  };

  S.setting = (k, v) => {
    if (v === undefined) return state.settings[k];
    S.commit((s) => { s.settings[k] = v; });
    return v;
  };

  // ---------------------------------------------------------------- accounts & transactions
  S.accountKind = (a) => S.ACCOUNT_TYPES[a?.type]?.kind || 'cash';
  S.activeAccounts = () => state.accounts.filter((a) => !a.archived);
  S.category = (name) => state.categories.find((c) => c.name === name);
  S.categoryType = (name) => S.category(name)?.type || null;

  /** Apply a transaction's effect to its account balance (sign=+1 to apply, -1 to reverse). */
  function applyToAccount(s, t, sign) {
    const a = s.accounts.find((x) => x.id === t.accountId);
    if (!a) return;
    const amt = U.num(t.amount) * sign;
    // credit-type balances are stored as amount OWED (positive)
    if (S.accountKind(a) === 'credit') a.balance = U.round(U.num(a.balance) - amt);
    else a.balance = U.round(U.num(a.balance) + amt);
  }

  S.addTransaction = (t, opts) => S.commit((s) => {
    t.id = t.id || U.uid();
    t.amount = U.round(U.num(t.amount));
    if (!t.category) t.category = S.autoCategory(t.payee) || (t.amount > 0 ? 'Other Income' : 'Miscellaneous');
    s.transactions.push(t);
    applyToAccount(s, t, 1);
    return t;
  }, opts);

  S.updateTransaction = (t) => S.commit((s) => {
    const i = s.transactions.findIndex((x) => x.id === t.id);
    if (i < 0) return;
    applyToAccount(s, s.transactions[i], -1);
    t.amount = U.round(U.num(t.amount));
    s.transactions[i] = { ...s.transactions[i], ...t };
    applyToAccount(s, s.transactions[i], 1);
  });

  S.deleteTransaction = (id) => S.commit((s) => {
    const t = s.transactions.find((x) => x.id === id);
    if (!t) return;
    applyToAccount(s, t, -1);
    s.transactions = s.transactions.filter((x) => x.id !== id);
  });

  /** Auto-categorize from user rules then built-in keyword hints. */
  const HINTS = [
    [/payment thank you|autopay payment|autopay pymt|card payment|payment - thank you|online payment.*thank/i, 'Credit Card Payment'],
    [/kroger|meijer|aldi|walmart grocery|whole foods|trader joe|costco|sam'?s club|publix|safeway|grocery/i, 'Groceries'],
    [/starbucks|dunkin|tim hortons|coffee|biggby/i, 'Coffee'],
    [/mcdonald|chipotle|wendy|taco bell|burger|pizza|doordash|uber ?eats|grubhub|restaurant|grill|cafe|subway/i, 'Dining Out'],
    [/\bshell\b|\bbp |exxon|\bmobil\b|speedway|marathon|sunoco|chevron|citgo|circle k|fuel|gas station/i, 'Fuel'],
    [/netflix|spotify|hulu|disney|youtube|apple\.com|icloud|prime video|hbo|max\.com|patreon|chatgpt|openai|claude|anthropic/i, 'Subscriptions'],
    [/amazon|amzn|target|best buy|ebay|etsy|home depot|lowe'?s/i, 'Shopping'],
    [/dte|consumers energy|duke energy|electric|edison/i, 'Electric'],
    [/comcast|xfinity|spectrum|at&t internet|internet|fiber/i, 'Internet'],
    [/verizon|t-mobile|tmobile|at&t|cricket|mint mobile/i, 'Phone'],
    [/uber|lyft|parking|toll/i, 'Parking / Tolls'],
    [/payroll|direct dep|salary|paycheck|ups /i, 'Salary'],
    [/interest paid|interest earned/i, 'Interest'],
    [/service fee|monthly fee|maintenance fee|overdraft|nsf fee|atm fee|foreign transaction fee|late fee/i, 'Bank Fees'],
    [/dividend/i, 'Dividends'],
    [/geico|progressive|state farm|allstate|liberty mutual/i, 'Auto Insurance'],
    [/planet fitness|gym|la fitness|crunch/i, 'Health & Fitness'],
    [/cvs|walgreens|pharmacy|rite aid/i, 'Medical'],
    [/^(buy|sell) [a-z0-9]{2,10}$|crypto purchase/i, 'Investing'],
    [/coinbase|crypto\.com|kraken|robinhood|fidelity|schwab|vanguard|webull/i, 'Investing'],
    [/autopay/i, 'Credit Card Payment'],
    [/transfer|zelle|venmo/i, 'Transfer'],
  ];
  S.autoCategory = (payee) => {
    if (!payee) return null;
    for (const r of state.rules) {
      try {
        if (r.matchType === 'regex' ? new RegExp(r.pattern, 'i').test(payee) : payee.toLowerCase().includes(String(r.pattern).toLowerCase())) return r.category;
      } catch (_) { /* bad regex */ }
    }
    for (const [re, cat] of HINTS) if (re.test(payee) && S.category(cat)) return cat;
    return null;
  };

  S.txnsInMonth = (key, accountId) => state.transactions.filter((t) => U.monthKey(t.date) === key && (!accountId || t.accountId === accountId));

  /** Income / spending summary for a list of transactions. Transfers excluded. */
  S.flow = (txns) => {
    let income = 0, expense = 0;
    const byCat = {};
    for (const t of txns) {
      const type = S.categoryType(t.category);
      if (type === 'transfer') continue;
      const amt = U.num(t.amount);
      if (type === 'income' || (!type && amt > 0)) { income += amt; }
      else { expense += -amt; byCat[t.category || 'Uncategorized'] = (byCat[t.category || 'Uncategorized'] || 0) - amt; }
    }
    return { income, expense, net: income - expense, byCat, savingsRate: income > 0 ? (income - expense) / income : 0 };
  };
  S.monthFlow = (key) => S.flow(S.txnsInMonth(key));

  // ---------------------------------------------------------------- valuation
  S.holdingValue = (h) => U.num(h.quantity) * U.num(h.price);
  S.metalSpot = (metal) => U.num(state.metalPrices[metal]);
  S.metalValue = (m) => {
    const ozt = U.num(m.quantity) * U.num(m.weight || 1);
    const spot = S.metalSpot(m.metal);
    return spot > 0 ? ozt * spot : U.num(m.manualValue || m.costBasis);
  };
  S.metalOz = (m) => U.num(m.quantity) * U.num(m.weight || 1);
  S.loanForProperty = (p) => state.loans.find((l) => l.id === p.loanId || l.propertyId === p.id);

  S.totals = () => {
    const s = state;
    const acc = S.activeAccounts();
    const cash = U.sum(acc.filter((a) => S.accountKind(a) === 'cash'), (a) => a.balance);
    const investAccounts = U.sum(acc.filter((a) => S.accountKind(a) === 'invest'), (a) => a.balance);
    const credit = U.sum(acc.filter((a) => S.accountKind(a) === 'credit'), (a) => Math.max(0, U.num(a.balance)));
    const byClass = {};
    for (const h of s.holdings) byClass[h.assetClass] = (byClass[h.assetClass] || 0) + S.holdingValue(h);
    const holdings = U.sum(Object.values(byClass));
    const realEstate = U.sum(s.properties, (p) => p.currentValue);
    const metals = U.sum(s.metals, S.metalValue);
    const passive = U.sum(s.passive, (p) => p.value);
    const other = U.sum(s.otherAssets, (o) => o.value);
    const loans = U.sum(s.loans.filter((l) => !l.archived), (l) => l.balance);
    const mortgage = U.sum(s.loans.filter((l) => !l.archived && ['mortgage', 'heloc'].includes(l.type)), (l) => l.balance);
    const assets = cash + investAccounts + holdings + realEstate + metals + passive + other;
    const liabilities = credit + loans;
    const breakdown = [
      { key: 'cash', label: 'Cash & Banking', value: cash, color: '#22C55E' },
      ...Object.entries(byClass).map(([k, v]) => ({ key: k, label: S.ASSET_CLASSES[k]?.label || k, value: v, color: S.ASSET_CLASSES[k]?.color || '#999' })),
      { key: 'retirement', label: 'Retirement & Brokerage', value: investAccounts, color: '#6366F1' },
      { key: 'realEstate', label: 'Real Estate', value: realEstate, color: '#0EA5E9' },
      { key: 'metals', label: 'Precious Metals', value: metals, color: '#EAB308' },
      { key: 'passive', label: 'Passive Income Assets', value: passive, color: '#A3E635' },
      { key: 'other', label: 'Other Assets', value: other, color: '#94A3B8' },
    ].filter((x) => x.value > 0.005);
    return {
      cash, investAccounts, credit, byClass, holdings, crypto: byClass.crypto || 0, realEstate, metals, passive, other,
      loans, mortgage, assets, liabilities, netWorth: assets - liabilities, breakdown,
      liquid: cash + investAccounts + holdings + metals,
    };
  };

  /** Recurring monthly passive income from every source. */
  S.passiveIncome = () => {
    const s = state;
    const dividends = U.sum(s.holdings, (h) => S.holdingValue(h) * U.num(h.dividendYield) / 100) / 12;
    const rentals = U.sum(s.properties, (p) => {
      const m = F.propertyMetrics(p, S.loanForProperty(p));
      return m.isRental ? m.cashFlow : 0;
    });
    const passive = U.sum(s.passive, (p) => U.toMonthly(p.income, p.frequency || 'monthly'));
    const interest = U.sum(S.activeAccounts().filter((a) => S.accountKind(a) === 'cash'), (a) => U.num(a.balance) * U.num(a.apy) / 100) / 12;
    return { dividends, rentals, passive, interest, total: dividends + rentals + passive + interest };
  };

  /** Upsert today's net-worth snapshot (powers history charts). */
  S.snapshot = () => {
    const t = S.totals();
    const today = U.today();
    const snap = {
      date: today, netWorth: U.round(t.netWorth), assets: U.round(t.assets), liabilities: U.round(t.liabilities),
      cash: U.round(t.cash), investments: U.round(t.holdings + t.investAccounts), crypto: U.round(t.crypto),
      realEstate: U.round(t.realEstate), metals: U.round(t.metals), debt: U.round(t.liabilities),
    };
    const i = state.snapshots.findIndex((x) => x.date === today);
    if (i >= 0) state.snapshots[i] = snap; else state.snapshots.push(snap);
    state.snapshots.sort((a, b) => a.date.localeCompare(b.date));
    S.save();
    return snap;
  };

  B.S = S;
})(window.BLAM);
