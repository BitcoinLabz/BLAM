/* BLAM — Net worth statement & reports */
'use strict';
(function (B) {
  const { U, F, S, UI, Ch } = B;
  const V = { year: null };

  function balanceSheet() {
    const s = S.state, t = S.totals();
    const sec = (title, rows, total, neg) => rows.length ? `<div class="budget-group">${title}</div>${rows.map(([l, v, sub]) => `<div class="stat-row"><span>${U.esc(l)}${sub ? ` <span class="faint">· ${U.esc(sub)}</span>` : ''}</span><b class="amt">${U.money(v, 0)}</b></div>`).join('')}<div class="stat-row" style="border-bottom:1px solid var(--border2)"><span><b style="color:var(--text)">Total ${title.toLowerCase()}</b></span><b class="amt ${neg ? 'neg' : ''}">${U.money(total, 0)}</b></div>` : '';
    const acc = S.activeAccounts();
    return `${sec('Cash & banking', acc.filter((a) => S.accountKind(a) === 'cash').map((a) => [a.name, a.balance, a.institution]), t.cash)}
      ${sec('Investments', [...s.holdings.map((h) => [`${h.symbol}`, S.holdingValue(h), S.ASSET_CLASSES[h.assetClass]?.label]), ...acc.filter((a) => S.accountKind(a) === 'invest').map((a) => [a.name, a.balance, a.institution])], t.holdings + t.investAccounts)}
      ${sec('Real estate', s.properties.map((p) => [p.name, p.currentValue, S.PROPERTY_TYPES[p.type]]), t.realEstate)}
      ${sec('Precious metals', s.metals.map((m) => [m.name, S.metalValue(m), `${U.qty(S.metalOz(m), 2)} ozt`]), t.metals)}
      ${sec('Other assets', [...s.passive.filter((p) => p.value).map((p) => [p.name, p.value, 'passive']), ...s.otherAssets.map((o) => [o.name, o.value, S.OTHER_ASSET_TYPES[o.type]])], t.passive + t.other)}
      ${sec('Liabilities', [...acc.filter((a) => S.accountKind(a) === 'credit' && a.balance > 0).map((a) => [a.name, a.balance, `${a.apr || 0}% APR`]), ...s.loans.filter((l) => !l.archived).map((l) => [l.name, l.balance, `${l.rate}%`])], t.liabilities, true)}
      <div class="stat-row" style="font-size:16px;padding-top:14px;border:0"><span><b style="color:var(--text)">NET WORTH</b></span><b class="amt ${t.netWorth >= 0 ? 'pos' : 'neg'}">${U.money(t.netWorth, 0)}</b></div>`;
  }

  function exportReport(year) {
    const rows = [['Month', 'Income', 'Expenses', 'Net', 'Savings rate']];
    for (let m = 1; m <= 12; m++) {
      const k = `${year}-${String(m).padStart(2, '0')}`;
      const f = S.monthFlow(k);
      rows.push([k, U.round(f.income), U.round(f.expense), U.round(f.net), f.income ? `${(f.savingsRate * 100).toFixed(1)}%` : '']);
    }
    rows.push([], ['Category', 'Total spent']);
    const yf = S.flow(S.state.transactions.filter((t) => t.date.startsWith(String(year))));
    Object.entries(yf.byCat).sort((a, b) => b[1] - a[1]).forEach(([c, v]) => rows.push([c, U.round(v)]));
    rows.push([], ['Net worth snapshots'], ['Date', 'Net worth', 'Assets', 'Liabilities']);
    S.state.snapshots.filter((x) => x.date.startsWith(String(year))).forEach((x) => rows.push([x.date, x.netWorth, x.assets, x.liabilities]));
    U.download(`blam-report-${year}.csv`, U.toCsv(rows), [{ name: 'CSV', extensions: ['csv'] }]).then((p) => p && UI.toast('Report exported'));
  }

  B.views.reports = {
    render(root) {
      const s = S.state;
      if (!V.year) V.year = new Date().getFullYear();
      const years = [...new Set([new Date().getFullYear(), ...s.transactions.map((t) => +t.date.slice(0, 4))])].sort((a, b) => b - a);
      const months = Array.from({ length: 12 }, (_, i) => `${V.year}-${String(i + 1).padStart(2, '0')}`);
      const flows = months.map((m) => S.monthFlow(m));
      const yTx = s.transactions.filter((t) => t.date.startsWith(String(V.year)));
      const yf = S.flow(yTx);
      const payees = {};
      yTx.filter((t) => t.amount < 0 && S.categoryType(t.category) !== 'transfer').forEach((t) => { payees[t.payee] = (payees[t.payee] || 0) - t.amount; });
      const topPayees = Object.entries(payees).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const snaps = s.snapshots;
      const first = snaps[0], last = snaps[snaps.length - 1];
      const yrs = first && last ? Math.max(0.01, U.daysBetween(first.date, last.date) / 365.25) : 0;

      root.innerHTML = `
        ${UI.pageHead('Net Worth & Reports', 'Your complete balance sheet, history and annual reports.', `<select class="input" id="yr" style="width:110px">${years.map((y) => `<option ${y === V.year ? 'selected' : ''}>${y}</option>`).join('')}</select>${UI.btn('Export CSV', 'export', { icon: 'download' })}${UI.btn('Print / PDF', 'print', { icon: 'report' })}`)}
        <div class="grid g4">
          ${UI.kpi({ label: `${V.year} income`, value: U.m(yf.income, 0), accent: '#2ecf8f' })}
          ${UI.kpi({ label: `${V.year} spending`, value: U.m(yf.expense, 0), accent: '#f45b72', sub: `${U.money(yf.expense / Math.max(1, flows.filter((f) => f.expense).length), 0)} avg / month` })}
          ${UI.kpi({ label: `${V.year} saved`, value: U.mc(yf.net, 0), accent: '#f7931a', sub: yf.income ? `${U.pct(yf.savingsRate)} savings rate` : '' })}
          ${UI.kpi({ label: 'Net worth growth', value: first && last && first !== last ? U.mc(last.netWorth - first.netWorth, 0) : '—', accent: '#8b5cf6', sub: first && last && first !== last && first.netWorth > 0 ? `${U.pct(F.cagr(first.netWorth, last.netWorth, yrs))} annualized since ${U.fmtDate(first.date, { month: 'short', year: 'numeric' })}` : 'Builds over time' })}
        </div>
        <div class="mt">${UI.card({ title: 'Net worth composition', sub: 'How each part of your wealth has moved', body: '<div id="comp"></div>' })}</div>
        <div class="grid g-32 mt">
          ${UI.card({ title: `${V.year} month by month`, cls: 'flush', body: `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Month</th><th class="r">Income</th><th class="r">Spending</th><th class="r">Net</th><th class="r">Savings rate</th></tr></thead><tbody>${months.map((m, i) => { const f = flows[i]; return `<tr><td>${U.monthLabel(m, true)}</td><td class="r pos amt">${f.income ? U.money(f.income, 0) : '—'}</td><td class="r amt">${f.expense ? U.money(f.expense, 0) : '—'}</td><td class="r">${f.income || f.expense ? U.mc(f.net, 0) : '—'}</td><td class="r">${f.income ? U.pct(f.savingsRate) : '—'}</td></tr>`; }).join('')}</tbody><tfoot><tr><td>Total</td><td class="r">${U.m(yf.income, 0)}</td><td class="r">${U.m(yf.expense, 0)}</td><td class="r">${U.mc(yf.net, 0)}</td><td class="r">${yf.income ? U.pct(yf.savingsRate) : ''}</td></tr></tfoot></table></div>` })}
          ${UI.card({ title: 'Balance sheet', sub: `As of ${U.fmtDate(U.today())}`, body: balanceSheet() })}
        </div>
        <div class="grid g2 mt">
          ${UI.card({ title: `${V.year} spending by category`, body: '<div id="ycat"></div>' })}
          ${UI.card({ title: `Top merchants · ${V.year}`, body: topPayees.length ? `<div class="list">${topPayees.map(([p, v], i) => `<div class="li"><div class="li-ic">${i + 1}</div><div class="li-m"><div class="li-t">${U.esc(p)}</div><div class="li-s">${yTx.filter((t) => t.payee === p).length} transactions</div></div><div class="li-r amt">${U.money(v, 0)}</div></div>`).join('')}</div>` : '<p class="muted">No spending recorded.</p>' })}
        </div>`;

      Ch.line(root.querySelector('#comp'), {
        height: 300,
        series: [
          { name: 'Net worth', color: '#f7931a', area: true, width: 2.6, data: snaps.map((x) => ({ x: x.date, y: x.netWorth })) },
          { name: 'Investments', color: '#3b82f6', data: snaps.map((x) => ({ x: x.date, y: x.investments || 0 })) },
          { name: 'Real estate', color: '#0ea5e9', data: snaps.map((x) => ({ x: x.date, y: x.realEstate || 0 })) },
          { name: 'Cash', color: '#2ecf8f', data: snaps.map((x) => ({ x: x.date, y: x.cash || 0 })) },
          { name: 'Debt', color: '#f45b72', dashed: true, data: snaps.map((x) => ({ x: x.date, y: x.liabilities || 0 })) },
        ],
      });
      Ch.donut(root.querySelector('#ycat'), { items: Object.entries(yf.byCat).filter(([, v]) => v > 0).map(([k, v], i) => ({ label: k, value: v, color: Ch.PALETTE[i % 12] })), centerBottom: `${V.year} spent` });
      root.querySelector('#yr').addEventListener('change', (e) => { V.year = +e.target.value; B.rerender(); });
      UI.bind(root, { export: () => exportReport(V.year), print: () => window.print() });
    },
  };
})(window.BLAM);
