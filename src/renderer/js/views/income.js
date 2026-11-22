/* BLAM — Dividends & passive income */
'use strict';
(function (B) {
  const { U, F, S, UI, Ch, A } = B;

  function editDividend(d) {
    const isNew = !d;
    const hold = S.state.holdings.filter((h) => h.assetClass !== 'crypto' || U.num(h.dividendYield));
    UI.form({
      title: isNew ? 'Log dividend / payout' : 'Edit payout',
      fields: [
        { key: 'holdingId', label: 'Holding', type: 'select', col: 3, options: [{ value: '', label: '— other —' }, ...hold.map((h) => ({ value: h.id, label: `${h.symbol} · ${h.name || ''}` }))] },
        { key: 'symbol', label: 'Symbol (if other)', col: 3, show: (v) => !v.holdingId },
        { key: 'date', label: 'Pay date', type: 'date', col: 3, required: true },
        { key: 'amount', label: 'Total amount', type: 'money', col: 3, required: true },
        { key: 'reinvested', label: 'Reinvested', type: 'checkbox', col: 3, checkLabel: 'DRIP / reinvested' },
        { key: 'accountId', label: 'Deposit to (optional)', type: 'select', col: 3, show: () => isNew, options: [{ value: '', label: "Don't record deposit" }, ...S.activeAccounts().map((a) => ({ value: a.id, label: a.name }))] },
      ],
      values: d || { date: U.today() },
      onSave: (v) => {
        const h = S.get('holdings', v.holdingId);
        v.symbol = h ? h.symbol : String(v.symbol || '').toUpperCase();
        v.amount = U.num(v.amount);
        const acc = v.accountId; delete v.accountId;
        S.upsert('dividends', v);
        if (isNew && acc) S.addTransaction({ date: v.date, accountId: acc, payee: `${v.symbol} dividend`, amount: v.amount, category: 'Dividends' });
      },
      onDelete: isNew ? null : () => S.remove('dividends', d.id),
    });
  }

  function editPassive(p) {
    const isNew = !p;
    UI.form({
      title: isNew ? 'Add passive income asset' : `Edit ${p.name}`, wide: true,
      intro: 'Track anything that pays you without trading hours for it: vending machines, notes, royalties, staking, a business you own, ATMs, mining rigs, annuities…',
      fields: [
        { key: 'name', label: 'Name', required: true, col: 3 },
        { key: 'type', label: 'Type', type: 'select', col: 3, options: UI.objOptions(S.PASSIVE_TYPES) },
        { key: 'value', label: 'Asset value (counts toward net worth)', type: 'money', col: 2, help: 'Leave 0 if the asset is tracked elsewhere' },
        { key: 'income', label: 'Income per payout', type: 'money', col: 2, required: true },
        { key: 'frequency', label: 'Paid', type: 'select', col: 2, options: Object.entries(U.FREQ).map(([value, f]) => ({ value, label: f.label })) },
        { key: 'expenses', label: 'Monthly costs', type: 'money', col: 2 },
        { key: 'startDate', label: 'Started', type: 'date', col: 2 },
        { key: 'endDate', label: 'Ends / matures', type: 'date', col: 2 },
        { key: 'notes', label: 'Notes', type: 'textarea', col: 6, rows: 2 },
      ],
      values: p || { type: 'other', frequency: 'monthly' },
      onSave: (v) => { v.value = U.num(v.value); v.income = U.num(v.income); S.upsert('passive', v); },
      onDelete: isNew ? null : () => S.remove('passive', p.id),
    });
  }

  B.views.income = {
    addPassive: () => editPassive(null),
    render(root) {
      const s = S.state;
      const pi = S.passiveIncome();
      const yearAgo = U.addDays(U.today(), -365);
      const ttm = s.dividends.filter((d) => d.date > yearAgo);
      const ttmTotal = U.sum(ttm, (d) => d.amount);
      const divHold = s.holdings.filter((h) => U.num(h.dividendYield) > 0);
      const fwdDiv = U.sum(divHold, (h) => S.holdingValue(h) * h.dividendYield / 100);
      const costDiv = U.sum(divHold, (h) => h.costBasis);
      const months = U.monthsRange(U.thisMonth(), 12);
      // forward projection: repeat each holding's last-12-month payout months, scaled to current yield
      const fwdMonths = months.map((m) => U.shiftMonth(m, 12));
      const proj = fwdMonths.map(() => 0);
      divHold.forEach((h) => {
        const pays = ttm.filter((d) => d.holdingId === h.id);
        const annual = S.holdingValue(h) * h.dividendYield / 100;
        if (pays.length) {
          const tot = U.sum(pays, (d) => d.amount) || 1;
          pays.forEach((d) => { const idx = fwdMonths.indexOf(U.shiftMonth(U.monthKey(d.date), 12)); if (idx >= 0) proj[idx] += annual * (d.amount / tot); });
        } else { const f = U.num(h.dividendFrequency) || 4; for (let i = 0; i < 12; i += 12 / f) proj[Math.floor(i)] += annual / f; }
      });
      const sources = [
        { label: 'Dividends', value: pi.dividends, color: '#3b82f6' },
        { label: 'Rental cash flow', value: Math.max(0, pi.rentals), color: '#0ea5e9' },
        { label: 'Passive assets', value: pi.passive, color: '#a3e635' },
        { label: 'Bank interest', value: pi.interest, color: '#22c55e' },
      ];
      const log = [...s.dividends].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);

      root.innerHTML = `
        ${UI.pageHead('Dividends & Passive Income', 'Money that shows up whether you work or not.', `${UI.btn('Sync dividends', 'sync', { icon: 'refresh' })}${UI.btn('Log payout', 'addDiv', { icon: 'plus' })}${UI.btn('Passive asset', 'addPassive', { icon: 'plus', kind: 'primary' })}`)}
        <div class="grid g4">
          ${UI.kpi({ cls: '', label: 'Passive income / month', icon: 'coins', accent: '#a3e635', value: U.m(pi.total, 0), sub: `${U.ms(pi.total * 12)} / year` })}
          ${UI.kpi({ label: 'Dividends (last 12 mo)', icon: 'chart', accent: '#3b82f6', value: U.m(ttmTotal, 0), sub: `${ttm.length} payouts received` })}
          ${UI.kpi({ label: 'Forward dividend income', icon: 'networth', accent: '#14b8a6', value: U.m(fwdDiv, 0), sub: `${U.money(fwdDiv / 12, 0)}/mo · ${U.money(fwdDiv / 365, 2)}/day` })}
          ${UI.kpi({ label: 'Yield on cost', icon: 'target', accent: '#f7931a', value: costDiv ? U.pct(fwdDiv / costDiv, 2) : '—', sub: `${divHold.length} income-paying holdings` })}
        </div>
        <div class="grid g-12 mt">
          ${UI.card({ title: 'Monthly passive income by source', body: '<div id="src"></div>' })}
          ${UI.card({ title: 'Dividend calendar', sub: 'Received (last 12 months) and projected (next 12)', body: '<div id="divbar"></div>' })}
        </div>
        <div class="grid g2 mt">
          ${UI.card({ title: 'Passive income assets', cls: 'flush', actions: UI.btn('', 'addPassive', { icon: 'plus' }), body: s.passive.length ? `<table class="tbl"><thead><tr><th>Asset</th><th class="r">Value</th><th class="r">Monthly</th><th class="r">Yield</th></tr></thead><tbody>${s.passive.map((p) => {
            const mo = U.toMonthly(p.income, p.frequency) - U.num(p.expenses);
            return `<tr class="click" data-act="editP" data-id="${p.id}"><td><b>${U.esc(p.name)}</b><div class="sub">${S.PASSIVE_TYPES[p.type] || ''} · ${U.FREQ[p.frequency]?.label || ''}</div></td><td class="r">${p.value ? U.m(p.value, 0) : '<span class="faint">—</span>'}</td><td class="r pos"><b class="amt">${U.money(mo, 0)}</b></td><td class="r">${p.value ? U.pct(mo * 12 / p.value) : '—'}</td></tr>`;
          }).join('')}</tbody><tfoot><tr><td>Total</td><td class="r">${U.m(U.sum(s.passive, (p) => p.value), 0)}</td><td class="r">${U.m(pi.passive, 0)}</td><td></td></tr></tfoot></table>` : UI.empty('leaf', 'No passive assets yet', 'Vending, royalties, notes, staking, a business…', UI.btn('Add one', 'addPassive', { icon: 'plus' })) })}
          ${UI.card({ title: 'Income-paying holdings', cls: 'flush', body: divHold.length ? `<table class="tbl"><thead><tr><th>Holding</th><th class="r">Yield</th><th class="r">Annual</th><th class="r">Monthly</th></tr></thead><tbody>${divHold.sort((a, b) => S.holdingValue(b) * b.dividendYield - S.holdingValue(a) * a.dividendYield).map((h) => {
            const an = S.holdingValue(h) * h.dividendYield / 100;
            return `<tr><td><b>${U.esc(h.symbol)}</b><div class="sub">${U.qty(h.quantity, 4)} × ${U.money(h.price)}${h.annualDividendPerShare ? ` · ${U.money(h.annualDividendPerShare, 4)}/sh TTM` : ''}</div></td><td class="r">${U.num(h.dividendYield).toFixed(2)}%</td><td class="r"><b class="amt">${U.money(an, 0)}</b></td><td class="r pos amt">${U.money(an / 12, 0)}</td></tr>`;
          }).join('')}</tbody></table>` : UI.empty('chart', 'No yields set', 'Set a dividend yield on holdings or run Sync dividends.') })}
        </div>
        <div class="mt">${UI.card({ title: 'Payout history', cls: 'flush', body: log.length ? `<div class="tbl-wrap" style="max-height:420px;overflow:auto"><table class="tbl"><thead><tr><th>Date</th><th>Symbol</th><th class="r">Per share</th><th class="r">Shares</th><th class="r">Amount</th><th></th></tr></thead><tbody>${log.map((d) => `<tr class="click" data-act="editD" data-id="${d.id}"><td>${U.fmtDate(d.date)}</td><td><b>${U.esc(d.symbol)}</b> ${d.auto ? UI.tag('synced', '#5b9cff') : ''} ${d.reinvested ? UI.tag('DRIP', '#a3e635') : ''}</td><td class="r muted">${d.perShare ? U.money(d.perShare, 4) : '—'}</td><td class="r muted">${d.shares ? U.qty(d.shares, 4) : '—'}</td><td class="r pos"><b class="amt">${U.money(d.amount)}</b></td><td></td></tr>`).join('')}</tbody></table></div>` : UI.empty('coins', 'No payouts logged', 'Use <b>Sync dividends</b> to pull your payout history automatically for stocks and ETFs, or log payouts manually.') })}</div>`;

      Ch.donut(root.querySelector('#src'), { items: sources, centerBottom: 'per month', size: 180 });
      const received = months.map((m) => U.sum(s.dividends.filter((d) => U.monthKey(d.date) === m), (d) => d.amount));
      Ch.bar(root.querySelector('#divbar'), {
        labels: [...months, ...fwdMonths].map(U.monthShort), tipLabels: [...months, ...fwdMonths].map((m) => U.monthLabel(m, true)), stacked: true, height: 240,
        series: [{ name: 'Received', color: '#3b82f6', values: [...received, ...Array(12).fill(0)] }, { name: 'Projected', color: 'rgba(59,130,246,.35)', values: [...Array(12).fill(0), ...proj] }],
      });

      UI.bind(root, {
        sync: () => A.syncDividends(),
        addDiv: () => editDividend(null),
        editD: (d) => editDividend(S.get('dividends', d.id)),
        addPassive: () => editPassive(null),
        editP: (d) => editPassive(S.get('passive', d.id)),
      });
    },
  };
})(window.BLAM);
