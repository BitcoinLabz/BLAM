/* BLAM — financial math engine: amortization, payoff strategies, real-estate & investment metrics. */
'use strict';
(function (B) {
  const { U } = B;
  const F = {};

  /** Standard fixed-rate payment (P&I). rate = annual %, n = months. */
  F.monthlyPayment = (principal, ratePct, n) => {
    principal = U.num(principal); n = Math.max(1, U.num(n));
    const r = U.num(ratePct) / 100 / 12;
    if (r === 0) return principal / n;
    return (principal * r) / (1 - Math.pow(1 + r, -n));
  };

  /** Months remaining for a balance at a given payment. Infinity if never repaid. */
  F.monthsToPayoff = (balance, ratePct, payment) => {
    const r = U.num(ratePct) / 100 / 12;
    if (balance <= 0) return 0;
    if (r === 0) return Math.ceil(balance / payment);
    if (payment <= balance * r) return Infinity;
    return Math.ceil(-Math.log(1 - (balance * r) / payment) / Math.log(1 + r));
  };

  /**
   * Full amortization schedule.
   * @param {object} o { balance, rate, payment, extra, start (ISO of next payment), lumps: [{date, amount}], maxMonths }
   */
  F.amortize = (o) => {
    let bal = U.num(o.balance);
    const r = U.num(o.rate) / 100 / 12;
    const pay = U.num(o.payment);
    const extra = U.num(o.extra);
    const lumps = (o.lumps || []).filter((l) => U.num(l.amount) > 0);
    const maxMonths = o.maxMonths || 720;
    let date = o.start || U.addMonths(U.today(), 1);
    const anchor = U.parse(date).getDate();
    const rows = [];
    let totalInterest = 0, totalPaid = 0;

    if (bal <= 0) return { rows, totalInterest: 0, totalPaid: 0, months: 0, payoffDate: U.today(), neverPaysOff: false };
    if (pay + extra <= bal * r + 0.005) {
      return { rows, totalInterest: Infinity, totalPaid: Infinity, months: Infinity, payoffDate: null, neverPaysOff: true };
    }

    for (let n = 1; n <= maxMonths && bal > 0.005; n++) {
      const interest = bal * r;
      let principal = Math.min(pay - interest, bal);
      if (principal < 0) principal = 0;
      bal -= principal;
      let ex = Math.min(extra, bal);
      // lump sums falling in this payment's month
      const mk = U.monthKey(date);
      const lump = U.sum(lumps.filter((l) => U.monthKey(l.date) === mk), (l) => l.amount);
      ex += Math.min(lump, bal - ex);
      bal -= ex;
      const paid = interest + principal + ex;
      totalInterest += interest; totalPaid += paid;
      rows.push({ n, date, payment: interest + principal, interest, principal, extra: ex, balance: Math.max(0, bal) });
      date = U.addMonths(date, 1, anchor);
    }
    const last = rows[rows.length - 1];
    return { rows, totalInterest, totalPaid, months: rows.length, payoffDate: last ? last.date : U.today(), neverPaysOff: bal > 0.005 };
  };

  /** Next scheduled payment date on/after today for a loan. */
  F.nextPaymentDate = (loan) => {
    if (loan.nextPaymentDate && loan.nextPaymentDate >= U.today()) return loan.nextPaymentDate;
    const base = loan.nextPaymentDate || loan.firstPaymentDate || (loan.startDate ? U.addMonths(loan.startDate, 1) : U.addMonths(U.today(), 1));
    const anchor = U.parse(base).getDate();
    let d = base, guard = 0;
    while (d < U.today() && guard++ < 1000) d = U.addMonths(d, 1, anchor);
    return d;
  };

  F.loanPayment = (loan) => U.num(loan.payment) || F.monthlyPayment(loan.originalPrincipal || loan.balance, loan.rate, loan.termMonths || 360);

  /** Summary comparing current plan (with extra) against baseline (no extra). */
  F.loanSummary = (loan) => {
    const payment = F.loanPayment(loan);
    const start = F.nextPaymentDate(loan);
    const base = F.amortize({ balance: loan.balance, rate: loan.rate, payment, start });
    const plan = F.amortize({ balance: loan.balance, rate: loan.rate, payment, extra: loan.extraMonthly, start, lumps: loan.lumps });
    const orig = U.num(loan.originalPrincipal) || U.num(loan.balance);
    return {
      payment,
      start,
      base,
      plan,
      interestSaved: base.neverPaysOff ? 0 : Math.max(0, base.totalInterest - plan.totalInterest),
      monthsSaved: base.neverPaysOff ? 0 : Math.max(0, base.months - plan.months),
      progress: orig > 0 ? U.clamp(1 - U.num(loan.balance) / orig, 0, 1) : 0,
      monthlyInterestNow: U.num(loan.balance) * U.num(loan.rate) / 100 / 12,
    };
  };

  /**
   * Multi-debt payoff simulation (avalanche / snowball / custom order).
   * debts: [{ id, name, balance, rate, minPayment }]
   */
  F.payoffPlan = (debts, extraBudget, strategy = 'avalanche', maxMonths = 600) => {
    const ds = debts.filter((d) => U.num(d.balance) > 0).map((d) => ({
      ...d, bal: U.num(d.balance), r: U.num(d.rate) / 100 / 12, min: Math.max(U.num(d.minPayment), 0), paidOff: null, interest: 0,
    }));
    const totalBudget = U.sum(ds, (d) => d.min) + U.num(extraBudget);
    const order = () => {
      const act = ds.filter((d) => d.bal > 0.005);
      if (strategy === 'snowball') return act.sort((a, b) => a.bal - b.bal);
      if (strategy === 'custom') return act.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
      return act.sort((a, b) => b.r - a.r || a.bal - b.bal);
    };
    const series = [{ month: 0, total: U.sum(ds, (d) => d.bal) }];
    let month = 0, totalInterest = 0;
    let date = U.addMonths(U.today(), 0);
    while (ds.some((d) => d.bal > 0.005) && month < maxMonths) {
      month++;
      date = U.addMonths(U.today(), month);
      ds.forEach((d) => { if (d.bal > 0) { const i = d.bal * d.r; d.bal += i; d.interest += i; totalInterest += i; } });
      let budget = totalBudget;
      ds.forEach((d) => { if (d.bal > 0) { const p = Math.min(d.min, d.bal); d.bal -= p; budget -= p; } });
      for (const d of order()) {
        if (budget <= 0.005) break;
        const p = Math.min(budget, d.bal);
        d.bal -= p; budget -= p;
      }
      ds.forEach((d) => { if (d.bal <= 0.005 && !d.paidOff) { d.bal = 0; d.paidOff = { month, date }; } });
      series.push({ month, total: U.sum(ds, (d) => d.bal), date });
      if (month > 3 && series[month].total >= series[month - 1].total && series[month].total > 0) {
        // payments don't cover interest — will never pay off
        return { neverPaysOff: true, series, totalInterest: Infinity, months: Infinity, debts: ds };
      }
    }
    return {
      neverPaysOff: ds.some((d) => d.bal > 0.005),
      months: month,
      payoffDate: date,
      totalInterest,
      series,
      debts: ds.sort((a, b) => (a.paidOff?.month ?? 1e9) - (b.paidOff?.month ?? 1e9)),
      monthlyBudget: totalBudget,
    };
  };

  // ---------------- Real estate ----------------
  F.propertyMetrics = (p, loan) => {
    const units = (p.units || []).length ? p.units : null;
    const grossRent = units ? U.sum(units, (u) => u.rent) : U.num(p.rentMonthly);
    const vacancy = U.num(p.vacancyRate) / 100;
    const effRent = grossRent * (1 - vacancy);
    const e = p.expenses || {};
    const opex = U.num(e.taxes) + U.num(e.insurance) + U.num(e.hoa) + U.num(e.maintenance) + U.num(e.management) + U.num(e.utilities) + U.num(e.other)
      + (U.num(e.managementPct) ? effRent * U.num(e.managementPct) / 100 : 0)
      + (U.num(e.capexPct) ? grossRent * U.num(e.capexPct) / 100 : 0);
    const debtService = loan ? F.loanPayment(loan) + U.num(loan.escrow) : 0;
    const noiMonthly = effRent - opex;
    const cashFlow = noiMonthly - debtService;
    const value = U.num(p.currentValue);
    const loanBal = loan ? U.num(loan.balance) : 0;
    const invested = U.num(p.downPayment) + U.num(p.closingCosts) + U.num(p.rehabCosts);
    const isRental = ['rental', 'multifamily', 'commercial', 'str'].includes(p.type);
    return {
      grossRent, effRent, opex, debtService, noiMonthly, cashFlow,
      noiAnnual: noiMonthly * 12,
      capRate: value > 0 ? (noiMonthly * 12) / value : 0,
      cashOnCash: invested > 0 ? (cashFlow * 12) / invested : null,
      equity: value - loanBal,
      ltv: value > 0 ? loanBal / value : 0,
      appreciation: U.num(p.purchasePrice) > 0 ? (value - U.num(p.purchasePrice)) / U.num(p.purchasePrice) : 0,
      grm: grossRent > 0 ? value / (grossRent * 12) : null,
      dscr: debtService > 0 ? noiMonthly / debtService : null,
      onePct: U.num(p.purchasePrice) > 0 ? grossRent / U.num(p.purchasePrice) : 0,
      isRental,
      loanBal,
    };
  };

  // ---------------- Investments ----------------
  F.holdingMetrics = (h) => {
    const value = U.num(h.quantity) * U.num(h.price);
    const cost = U.num(h.costBasis);
    const gain = value - cost;
    return { value, cost, gain, gainPct: cost > 0 ? gain / cost : 0, dayChange: h.change24h != null ? value - value / (1 + h.change24h / 100) : 0 };
  };

  /** Future value of a stream: present value pv, monthly contribution pmt, annual return %. */
  F.futureValue = (pv, pmt, ratePct, months) => {
    const r = U.num(ratePct) / 100 / 12;
    if (r === 0) return pv + pmt * months;
    return pv * Math.pow(1 + r, months) + pmt * ((Math.pow(1 + r, months) - 1) / r);
  };

  /** Months until pv grows to target with monthly contributions. */
  F.monthsToTarget = (pv, pmt, ratePct, target) => {
    if (pv >= target) return 0;
    for (let m = 1; m <= 1200; m++) if (F.futureValue(pv, pmt, ratePct, m) >= target) return m;
    return Infinity;
  };

  /** Simple CAGR between two values over years. */
  F.cagr = (start, end, years) => (start > 0 && years > 0 ? Math.pow(end / start, 1 / years) - 1 : 0);

  B.F = F;
})(window.BLAM);
