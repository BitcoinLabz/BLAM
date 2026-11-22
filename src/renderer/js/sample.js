/* BLAM — realistic demo dataset so every screen can be explored immediately. */
'use strict';
(function (B) {
  const { U, F, S } = B;

  // deterministic PRNG so the demo looks the same every time
  function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

  /** Balance remaining after `months` scheduled payments. */
  function remaining(principal, rate, term, months) {
    const pmt = F.monthlyPayment(principal, rate, term);
    const r = rate / 100 / 12;
    let b = principal;
    for (let i = 0; i < months; i++) b -= pmt - b * r;
    return U.round(Math.max(0, b));
  }
  const monthsSince = (iso) => {
    const a = U.parse(iso), b = new Date();
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  };
  const nextOn = (day) => {
    const t = U.parse(U.today());
    let d = U.iso(new Date(t.getFullYear(), t.getMonth(), day, 12));
    if (d <= U.today()) d = U.addMonths(d, 1, day);
    return d;
  };

  B.sampleData = () => {
    const rand = rng(42);
    const between = (a, b) => U.round(a + rand() * (b - a));
    const s = S.blank();
    s.settings.onboarded = true;
    s.settings.userName = 'Demo';
    const id = () => U.uid();

    // ---------------- accounts
    const chk = id(), sav = id(), amex = id(), sapph = id(), k401 = id(), cdc = id(), roth = id();
    s.accounts = [
      { id: chk, name: 'Everyday Checking', type: 'checking', institution: 'Chase', balance: 6842.17, color: '#3B82F6' },
      { id: sav, name: 'Emergency Fund', type: 'hysa', institution: 'Ally Bank', balance: 21500, apy: 3.8, color: '#22C55E' },
      { id: amex, name: 'Gold Card', type: 'credit', institution: 'American Express', balance: 1840.55, creditLimit: 15000, apr: 25.9, dueDay: 12, minPayment: 40, color: '#EAB308' },
      { id: sapph, name: 'Sapphire Preferred', type: 'credit', institution: 'Chase', balance: 624.1, creditLimit: 12000, apr: 22.49, dueDay: 22, minPayment: 25, color: '#0EA5E9' },
      { id: k401, name: '401(k)', type: 'retirement', institution: 'Fidelity', balance: 92450, color: '#6366F1' },
      { id: roth, name: 'Roth IRA', type: 'retirement', institution: 'Vanguard', balance: 38900, color: '#8B5CF6' },
      { id: cdc, name: 'Exchange Cash', type: 'crypto_exchange', institution: 'Crypto.com', balance: 410, color: '#F7931A' },
    ];

    // ---------------- holdings (prices refresh live on load)
    const H = (assetClass, symbol, name, quantity, costBasis, price, extra = {}) => ({ id: id(), assetClass, symbol, name, quantity, costBasis, price, autoPrice: true, acquiredDate: U.addMonths(U.today(), -14), ...extra });
    s.holdings = [
      H('crypto', 'BTC', 'Bitcoin', 0.85, 38200, 95000, { coingeckoId: 'bitcoin', accountId: cdc }),
      H('crypto', 'ETH', 'Ethereum', 6.2, 14100, 3400, { coingeckoId: 'ethereum', accountId: cdc }),
      H('crypto', 'STX', 'Stacks', 12500, 17900, 1.6, { coingeckoId: 'blockstack', accountId: cdc, dividendYield: 0 }),
      H('crypto', 'SOL', 'Solana', 42, 4150, 180, { coingeckoId: 'solana', accountId: cdc }),
      H('etf', 'VOO', 'Vanguard S&P 500 ETF', 42, 17250, 560, { dividendYield: 1.25 }),
      H('etf', 'SCHD', 'Schwab US Dividend Equity ETF', 310, 7900, 27.5, { dividendYield: 3.8 }),
      H('etf', 'JEPI', 'JPMorgan Equity Premium Income', 200, 11000, 57, { dividendYield: 7.4 }),
      H('stock', 'AAPL', 'Apple Inc.', 25, 3600, 230, { dividendYield: 0.45 }),
      H('stock', 'MSFT', 'Microsoft Corp.', 15, 5100, 420, { dividendYield: 0.75 }),
      H('stock', 'O', 'Realty Income Corp.', 150, 8400, 57, { dividendYield: 5.6 }),
    ];

    // ---------------- loans
    const mPrimary = id(), mRental = id(), auto = id(), student = id();
    s.loans = [
      { id: mPrimary, name: 'Home Mortgage', type: 'mortgage', lender: 'Rocket Mortgage', originalPrincipal: 256500, rate: 3.25, termMonths: 360, startDate: '2019-06-01', balance: remaining(256500, 3.25, 360, monthsSince('2019-07-01')), escrow: 512, extraMonthly: 0, nextPaymentDate: nextOn(1) },
      { id: mRental, name: 'Duplex Mortgage', type: 'mortgage', lender: 'Lake Michigan CU', originalPrincipal: 171000, rate: 6.875, termMonths: 360, startDate: '2021-09-01', balance: remaining(171000, 6.875, 360, monthsSince('2021-10-01')), escrow: 0, extraMonthly: 150, nextPaymentDate: nextOn(1) },
      { id: auto, name: 'Truck Loan', type: 'auto', lender: 'Ford Credit', originalPrincipal: 38000, rate: 5.9, termMonths: 60, startDate: '2024-03-15', balance: remaining(38000, 5.9, 60, monthsSince('2024-04-15')), escrow: 0, extraMonthly: 0, nextPaymentDate: nextOn(15) },
      { id: student, name: 'Student Loan', type: 'student', lender: 'Nelnet', originalPrincipal: 26000, rate: 4.53, termMonths: 120, startDate: '2018-11-01', balance: remaining(26000, 4.53, 120, monthsSince('2018-12-01')), escrow: 0, extraMonthly: 0, nextPaymentDate: nextOn(5) },
    ];

    // ---------------- real estate
    const home = id(), duplex = id(), lot = id();
    s.properties = [
      { id: home, name: 'Primary Home', address: '214 Oak Hollow Dr, Ypsilanti, MI', type: 'primary', purchaseDate: '2019-06-01', purchasePrice: 285000, currentValue: 368000, loanId: mPrimary, beds: 4, baths: 2.5, sqft: 2240, expenses: { hoa: 0, maintenance: 150 } },
      {
        id: duplex, name: 'Maple St Duplex', address: '88 Maple St, Ypsilanti, MI', type: 'multifamily', purchaseDate: '2021-09-01', purchasePrice: 228000, currentValue: 289000, loanId: mRental,
        downPayment: 57000, closingCosts: 6200, rehabCosts: 11800, vacancyRate: 5, sqft: 2100,
        expenses: { taxes: 318, insurance: 142, maintenance: 120, utilities: 65, capexPct: 5, managementPct: 0 },
        units: [
          { id: id(), name: 'Unit A', tenant: 'J. Martinez', rent: 1350, deposit: 1350, leaseEnd: U.addMonths(U.today(), 2) },
          { id: id(), name: 'Unit B', tenant: 'K. Thompson', rent: 1275, deposit: 1275, leaseEnd: U.addMonths(U.today(), 8) },
        ],
      },
      { id: lot, name: 'Florida Lot', address: 'Aqua Cir, Port Charlotte, FL', type: 'land', purchaseDate: '2024-02-10', purchasePrice: 29000, currentValue: 36500, expenses: { taxes: 48 } },
    ];

    // ---------------- metals
    s.metals = [
      { id: id(), metal: 'gold', name: 'American Gold Eagle 1 oz', form: 'coin', quantity: 3, weight: 1, costBasis: 7650 },
      { id: id(), metal: 'silver', name: 'American Silver Eagle 1 oz', form: 'coin', quantity: 120, weight: 1, costBasis: 3720 },
      { id: id(), metal: 'silver', name: '10 oz Silver Bar', form: 'bar', quantity: 5, weight: 10, costBasis: 1580 },
      { id: id(), metal: 'platinum', name: 'Platinum Maple Leaf 1 oz', form: 'coin', quantity: 2, weight: 1, costBasis: 2050 },
    ];
    s.metalPrices = { gold: 4000, silver: 48, platinum: 1550, palladium: 1400, copper: 5, updated: null };

    // ---------------- passive & other
    s.passive = [
      { id: id(), name: 'Vending Machines (2)', type: 'vending', value: 6200, income: 340, frequency: 'monthly', notes: 'Snack + drink, UPS breakroom route' },
      { id: id(), name: 'Private Note — 2nd lien', type: 'p2p', value: 20000, income: 175, frequency: 'monthly', notes: '10.5% interest-only, matures 2028' },
      { id: id(), name: 'STX Stacking Rewards', type: 'staking', value: 0, income: 95, frequency: 'monthly', notes: 'BTC rewards from stacking (value tracked in Crypto)' },
      { id: id(), name: 'Course / E-book Royalties', type: 'royalty', value: 0, income: 240, frequency: 'quarterly' },
    ];
    s.otherAssets = [
      { id: id(), name: '2022 Ford F-150', type: 'vehicle', value: 33500, notes: 'KBB private party' },
      { id: id(), name: 'Bitcoin Labz LLC (equity)', type: 'business', value: 25000 },
      { id: id(), name: 'Sports card collection', type: 'collectible', value: 3800 },
    ];

    // ---------------- recurring (next dates in the future so nothing back-posts)
    const R = (o) => ({ id: id(), autoPost: true, frequency: 'monthly', ...o });
    const payday = (() => { let d = '2026-01-02'; while (d <= U.today()) d = U.addDays(d, 14); return d; })();
    s.recurring = [
      R({ name: 'UPS Payroll', kind: 'income', amount: 2480, accountId: chk, category: 'Salary', frequency: 'biweekly', nextDate: payday }),
      R({ name: 'Duplex Rent — Unit A', kind: 'income', amount: 1350, accountId: chk, category: 'Rental Income', nextDate: nextOn(1), propertyId: duplex }),
      R({ name: 'Duplex Rent — Unit B', kind: 'income', amount: 1275, accountId: chk, category: 'Rental Income', nextDate: nextOn(1), propertyId: duplex }),
      R({ name: 'Home Mortgage', kind: 'loan', loanId: mPrimary, accountId: chk, nextDate: nextOn(1) }),
      R({ name: 'Duplex Mortgage', kind: 'loan', loanId: mRental, accountId: chk, nextDate: nextOn(1) }),
      R({ name: 'Truck Loan', kind: 'loan', loanId: auto, accountId: chk, nextDate: nextOn(15) }),
      R({ name: 'Student Loan', kind: 'loan', loanId: student, accountId: chk, nextDate: nextOn(5) }),
      R({ name: 'DTE Energy', kind: 'expense', amount: 142, accountId: chk, category: 'Electric', nextDate: nextOn(18), autoPost: false }),
      R({ name: 'Xfinity Internet', kind: 'expense', amount: 79.99, accountId: sapph, category: 'Internet', nextDate: nextOn(9) }),
      R({ name: 'Verizon Wireless', kind: 'expense', amount: 148, accountId: amex, category: 'Phone', nextDate: nextOn(20) }),
      R({ name: 'Progressive Auto', kind: 'expense', amount: 171, accountId: chk, category: 'Auto Insurance', nextDate: nextOn(3) }),
      R({ name: 'Netflix', kind: 'expense', amount: 17.99, accountId: amex, category: 'Subscriptions', nextDate: nextOn(11) }),
      R({ name: 'Spotify', kind: 'expense', amount: 11.99, accountId: amex, category: 'Subscriptions', nextDate: nextOn(7) }),
      R({ name: 'Planet Fitness', kind: 'expense', amount: 24.99, accountId: sapph, category: 'Health & Fitness', nextDate: nextOn(17) }),
      R({ name: 'Save to Emergency Fund', kind: 'transfer', amount: 500, accountId: chk, toAccountId: sav, category: 'Transfer', nextDate: nextOn(2) }),
      R({ name: 'Weekly Crypto DCA', kind: 'transfer', amount: 75, accountId: chk, toAccountId: cdc, category: 'Investing', frequency: 'weekly', nextDate: U.addDays(U.today(), 3) }),
    ];

    // ---------------- 7 months of transaction history
    const tx = [];
    const add = (date, accountId, payee, amount, category, extra = {}) => { if (date <= U.today()) tx.push({ id: id(), date, accountId, payee, amount: U.round(amount), category, ...extra }); };
    const start = U.addMonths(`${U.thisMonth()}-01`, -6);
    for (let d = start; d <= U.today(); d = U.addDays(d, 1)) {
      const dt = U.parse(d), dow = dt.getDay(), dom = dt.getDate();
      if (U.daysBetween('2026-01-02', d) % 14 === 0) add(d, chk, 'UPS Payroll Direct Dep', 2480, 'Salary');
      if (dom === 1) {
        add(d, chk, 'Rent — Unit A', 1350, 'Rental Income');
        add(d, chk, 'Rent — Unit B', 1275, 'Rental Income');
        add(d, chk, 'Rocket Mortgage', -(F.loanPayment(s.loans[0]) + 512), 'Mortgage / Rent');
        add(d, chk, 'Lake Michigan CU Mortgage', -(F.loanPayment(s.loans[1]) + 150), 'Mortgage / Rent');
      }
      if (dom === 2) add(d, chk, 'Transfer to Ally', -500, 'Transfer');
      if (dom === 3) add(d, chk, 'Progressive Insurance', -171, 'Auto Insurance');
      if (dom === 5) add(d, chk, 'Nelnet Student Loan', -F.loanPayment(s.loans[3]), 'Loan Payment');
      if (dom === 7) add(d, amex, 'Spotify', -11.99, 'Subscriptions');
      if (dom === 9) add(d, sapph, 'Xfinity', -79.99, 'Internet');
      if (dom === 11) add(d, amex, 'Netflix', -17.99, 'Subscriptions');
      if (dom === 15) add(d, chk, 'Ford Credit', -F.loanPayment(s.loans[2]), 'Auto Payment');
      if (dom === 17) add(d, sapph, 'Planet Fitness', -24.99, 'Health & Fitness');
      if (dom === 18) add(d, chk, 'DTE Energy', -between(98, 210), 'Electric');
      if (dom === 20) add(d, amex, 'Verizon Wireless', -148, 'Phone');
      if (dom === 22) add(d, chk, 'Consumers Energy Gas', -between(35, 140), 'Gas / Heat');
      if (dom === 25) add(d, chk, 'Ypsilanti Water', -between(55, 80), 'Water / Sewer');
      if (dom === 26) add(d, chk, 'Amex Payment', -between(1200, 2200), 'Credit Card Payment');
      if (dom === 6) add(d, chk, 'Ally Interest Paid', between(62, 70), 'Interest', { accountId: sav });
      if (dow === 6) add(d, amex, rand() > 0.5 ? 'Meijer' : 'Kroger', -between(95, 185), 'Groceries');
      if (dow === 3 && rand() > 0.4) add(d, sapph, 'Costco', -between(60, 240), 'Groceries');
      if (dow === 1 || dow === 4) add(d, sapph, rand() > 0.5 ? 'Speedway' : 'Shell', -between(48, 78), 'Fuel');
      if (rand() > 0.72) add(d, amex, ['Chipotle', 'Zingerman\'s Deli', 'Buffalo Wild Wings', 'Panera Bread', 'DoorDash', 'Jet\'s Pizza'][Math.floor(rand() * 6)], -between(14, 82), 'Dining Out');
      if (rand() > 0.8) add(d, amex, rand() > 0.5 ? 'Starbucks' : 'Biggby Coffee', -between(5, 11), 'Coffee');
      if (rand() > 0.88) add(d, sapph, ['Amazon', 'Target', 'Home Depot', 'Best Buy'][Math.floor(rand() * 4)], -between(18, 240), 'Shopping');
      if (rand() > 0.97) add(d, chk, 'Remerica Commission', between(3200, 9400), 'Commission');
      if (rand() > 0.96) add(d, chk, 'Duplex repair — plumbing/handyman', -between(85, 420), 'Rental Expense', { propertyId: duplex });
      if (rand() > 0.97) add(d, amex, ['AMC Theatres', 'Ticketmaster', 'Steam'][Math.floor(rand() * 3)], -between(20, 160), 'Entertainment');
      if (dow === 2) add(d, chk, 'Crypto.com Purchase', -75, 'Investing');
    }
    s.transactions = tx;

    // ---------------- dividends (last 12 months, quarterly; JEPI/O monthly)
    for (const h of s.holdings.filter((x) => x.dividendYield)) {
      const monthly = ['JEPI', 'O'].includes(h.symbol);
      const per = monthly ? 1 : 3;
      for (let i = per; i <= 12; i += per) {
        const date = U.addMonths(U.today(), -i);
        const amount = U.round((h.quantity * h.price * h.dividendYield / 100) / (12 / per) * (0.92 + rand() * 0.12));
        s.dividends.push({ id: id(), holdingId: h.id, symbol: h.symbol, date, amount, shares: h.quantity, perShare: U.round(amount / h.quantity, 4), reinvested: h.symbol === 'SCHD' });
      }
    }

    s.goals = [
      { id: id(), name: 'Emergency Fund (6 mo)', target: 30000, linkType: 'account', linkId: sav, targetDate: U.addMonths(U.today(), 14), color: '#22C55E' },
      { id: id(), name: 'Florida Build Fund', target: 150000, current: 41000, targetDate: '2028-06-01', color: '#0EA5E9', monthly: 1500 },
      { id: id(), name: '1 Whole Bitcoin', target: 1, current: 0.85, unit: 'BTC', targetDate: U.addMonths(U.today(), 10), color: '#F7931A' },
      { id: id(), name: 'Pay Off Truck', target: 38000, linkType: 'loanPaid', linkId: auto, targetDate: '2029-03-15', color: '#8B5CF6' },
    ];
    const budgets = { 'Mortgage / Rent': 3000, Groceries: 900, 'Dining Out': 350, Coffee: 60, Fuel: 450, Shopping: 400, Electric: 175, 'Gas / Heat': 120, 'Water / Sewer': 75, Internet: 80, Phone: 150, Subscriptions: 45, 'Health & Fitness': 40, 'Auto Payment': 735, 'Auto Insurance': 175, 'Loan Payment': 270, Entertainment: 150, 'Rental Expense': 300 };
    s.categories.forEach((c) => { if (budgets[c.name]) c.budget = budgets[c.name]; });
    s.rules = [{ id: id(), pattern: 'remerica', matchType: 'contains', category: 'Commission' }];
    return s;
  };

  /** Back-fill 18 months of believable net-worth history ending at today's totals. */
  B.sampleBackfill = () => {
    const rand = rng(7);
    const t = S.totals();
    const snaps = [];
    const n = 78; // weeks
    for (let i = n; i >= 1; i--) {
      const f = 1 - i / n;
      const date = U.addDays(U.today(), -i * 7);
      const crypto = t.crypto * (0.45 + 0.55 * f + Math.sin(i / 5) * 0.12 + (rand() - 0.5) * 0.08);
      const inv = (t.holdings - t.crypto + t.investAccounts) * (0.78 + 0.22 * f + (rand() - 0.5) * 0.03);
      const re = t.realEstate * (0.93 + 0.07 * f);
      const cash = t.cash * (0.7 + 0.3 * f + (rand() - 0.5) * 0.1);
      const debt = t.liabilities * (1.08 - 0.08 * f);
      const assets = crypto + inv + re + cash + t.metals * (0.75 + 0.25 * f) + t.passive + t.other * (1.06 - 0.06 * f);
      snaps.push({ date, netWorth: U.round(assets - debt), assets: U.round(assets), liabilities: U.round(debt), cash: U.round(cash), investments: U.round(inv + crypto), crypto: U.round(crypto), realEstate: U.round(re), debt: U.round(debt) });
    }
    S.commit((s) => { s.snapshots = snaps; });
    S.snapshot();
  };
})(window.BLAM);
