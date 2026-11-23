/* BLAM — Real estate holdings & rental properties */
'use strict';
(function (B) {
  const { U, F, S, UI, Ch } = B;
  const GRAD = ['#0ea5e9,#6366f1', '#f7931a,#f43f5e', '#14b8a6,#22c55e', '#8b5cf6,#ec4899', '#eab308,#f97316', '#3b82f6,#14b8a6'];
  const isRentalType = (t) => ['rental', 'multifamily', 'commercial', 'str'].includes(t);

  function edit(p) {
    const isNew = !p;
    UI.form({
      title: isNew ? 'Add property' : `Edit ${p.name}`, wide: true,
      fields: [
        { type: 'heading', label: 'Property' },
        { key: 'name', label: 'Name', required: true, col: 3, placeholder: 'e.g. Maple St Duplex' },
        { key: 'type', label: 'Type', type: 'select', col: 3, options: UI.objOptions(S.PROPERTY_TYPES) },
        { key: 'address', label: 'Address', col: 6 },
        { key: 'beds', label: 'Beds', type: 'number', col: 2 }, { key: 'baths', label: 'Baths', type: 'number', col: 2 }, { key: 'sqft', label: 'Sq ft', type: 'number', col: 2 },
        { type: 'heading', label: 'Value & financing' },
        { key: 'purchaseDate', label: 'Purchase date', type: 'date', col: 2 },
        { key: 'purchasePrice', label: 'Purchase price', type: 'money', col: 2 },
        { key: 'currentValue', label: 'Current value', type: 'money', col: 2, required: true, help: 'Zestimate, comps or appraisal' },
        { key: 'loanId', label: 'Mortgage', type: 'select', col: 3, options: [{ value: '', label: 'Owned free & clear / none' }, ...S.state.loans.map((l) => ({ value: l.id, label: `${l.name} · ${U.money(l.balance, 0)}` }))], help: 'Add the loan in Loans & Payoff first to link it' },
        { key: 'appreciation', label: 'Expected appreciation', type: 'percent', col: 3, help: 'Used for equity projections (default 3%)' },
        { key: 'downPayment', label: 'Down payment', type: 'money', col: 2, show: (v) => isRentalType(v.type) },
        { key: 'closingCosts', label: 'Closing costs', type: 'money', col: 2, show: (v) => isRentalType(v.type) },
        { key: 'rehabCosts', label: 'Rehab / improvements', type: 'money', col: 2, show: (v) => isRentalType(v.type) },
        { type: 'heading', label: 'Income', show: (v) => isRentalType(v.type), help: 'Multi-unit? Leave rent blank and add units from the property page.' },
        { key: 'rentMonthly', label: 'Monthly rent (total)', type: 'money', col: 3, show: (v) => isRentalType(v.type) },
        { key: 'vacancyRate', label: 'Vacancy allowance', type: 'percent', col: 3, show: (v) => isRentalType(v.type) },
        { type: 'heading', label: 'Monthly operating expenses', help: 'If your taxes & insurance are escrowed in the mortgage payment, leave them at 0 here to avoid double counting.' },
        { key: 'expenses.taxes', label: 'Property tax', type: 'money', col: 2 },
        { key: 'expenses.insurance', label: 'Insurance', type: 'money', col: 2 },
        { key: 'expenses.hoa', label: 'HOA', type: 'money', col: 2 },
        { key: 'expenses.maintenance', label: 'Maintenance', type: 'money', col: 2 },
        { key: 'expenses.utilities', label: 'Utilities (owner-paid)', type: 'money', col: 2 },
        { key: 'expenses.other', label: 'Other', type: 'money', col: 2 },
        { key: 'expenses.management', label: 'Management ($)', type: 'money', col: 2, show: (v) => isRentalType(v.type) },
        { key: 'expenses.managementPct', label: 'Management (% of rent)', type: 'percent', col: 2, show: (v) => isRentalType(v.type) },
        { key: 'expenses.capexPct', label: 'CapEx reserve (% of rent)', type: 'percent', col: 2, show: (v) => isRentalType(v.type) },
        { key: 'notes', label: 'Notes', type: 'textarea', col: 6, rows: 2 },
      ],
      values: p || { type: 'rental', vacancyRate: 5, appreciation: 3, expenses: {} },
      onSave: (v) => { v.currentValue = U.num(v.currentValue); S.upsert('properties', v); UI.toast(isNew ? 'Property added' : 'Property saved'); },
      onDelete: isNew ? null : () => S.commit((s) => {
        s.properties = s.properties.filter((x) => x.id !== p.id);
        s.loans.forEach((l) => { if (l.propertyId === p.id) l.propertyId = ''; });
        s.recurring.forEach((r) => { if (r.propertyId === p.id) r.propertyId = ''; });
      }),
    });
  }

  function editUnit(p, u) {
    const isNew = !u;
    UI.form({
      title: isNew ? `Add unit · ${p.name}` : `Edit ${u.name}`,
      fields: [
        { key: 'name', label: 'Unit', required: true, col: 2, placeholder: 'Unit A' },
        { key: 'tenant', label: 'Tenant', col: 4 },
        { key: 'rent', label: 'Monthly rent', type: 'money', col: 2, required: true },
        { key: 'deposit', label: 'Security deposit', type: 'money', col: 2 },
        { key: 'dueDay', label: 'Rent due day', type: 'number', col: 2 },
        { key: 'leaseStart', label: 'Lease start', type: 'date', col: 3 },
        { key: 'leaseEnd', label: 'Lease end', type: 'date', col: 3 },
        { key: 'phone', label: 'Phone', col: 3 }, { key: 'email', label: 'Email', col: 3 },
        { key: 'createRecurring', label: 'Automation', type: 'checkbox', col: 6, checkLabel: 'Create an auto-posting monthly rent income item', show: () => isNew },
      ],
      values: u || { name: `Unit ${String.fromCharCode(65 + (p.units || []).length)}`, dueDay: 1, createRecurring: false },
      onSave: (v) => {
        const mk = v.createRecurring; delete v.createRecurring;
        S.commit((s) => {
          const pp = s.properties.find((x) => x.id === p.id);
          pp.units = pp.units || [];
          if (isNew) pp.units.push({ ...v, id: U.uid(), rent: U.num(v.rent) });
          else Object.assign(pp.units.find((x) => x.id === u.id), v, { rent: U.num(v.rent) });
        });
        if (mk) setTimeout(() => B.views.recurring.add({ kind: 'income', name: `${p.name} — ${v.name} rent`, amount: U.num(v.rent), category: 'Rental Income', propertyId: p.id, nextDate: U.addMonths(U.iso(new Date(new Date().getFullYear(), new Date().getMonth(), +v.dueDay || 1, 12)), 1) }), 250);
        setTimeout(() => detail(S.get('properties', p.id)), mk ? 0 : 200);
      },
      onDelete: isNew ? null : () => { S.commit((s) => { const pp = s.properties.find((x) => x.id === p.id); pp.units = pp.units.filter((x) => x.id !== u.id); }); setTimeout(() => detail(S.get('properties', p.id)), 200); },
    });
  }

  function detail(p) {
    const loan = S.loanForProperty(p);
    const m = F.propertyMetrics(p, loan);
    const e = p.expenses || {};
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const ytd = S.state.transactions.filter((t) => t.propertyId === p.id && t.date >= yearStart);
    const ytdIn = U.sum(ytd.filter((t) => t.amount > 0), (t) => t.amount), ytdOut = -U.sum(ytd.filter((t) => t.amount < 0), (t) => t.amount);
    // equity projection: 10 years
    const appr = (U.num(p.appreciation) || 3) / 100;
    const sched = loan ? F.amortize({ balance: loan.balance, rate: loan.rate, payment: F.loanPayment(loan), extra: loan.extraMonthly, start: F.nextPaymentDate(loan) }).rows : [];
    const valPts = [], loanPts = [], eqPts = [];
    for (let y = 0; y <= 10; y++) {
      const date = U.addMonths(U.today(), y * 12);
      const val = U.num(p.currentValue) * Math.pow(1 + appr, y);
      const bal = y === 0 ? m.loanBal : (sched[y * 12 - 1]?.balance ?? 0);
      valPts.push({ x: date, y: val }); loanPts.push({ x: date, y: bal }); eqPts.push({ x: date, y: val - bal });
    }
    const row = (l, v, cls = '') => `<div class="stat-row"><span>${l}</span><b class="${cls}">${v}</b></div>`;
    const units = p.units || [];
    const md = UI.modal({
      title: p.name, xwide: true,
      body: `<p class="muted" style="margin-top:-6px">${U.esc(p.address || '')} · ${S.PROPERTY_TYPES[p.type]}${p.beds ? ` · ${p.beds} bd / ${p.baths || '?'} ba` : ''}${p.sqft ? ` · ${U.num(p.sqft).toLocaleString()} sq ft` : ''}</p>
        <div class="grid g4">
          ${UI.kpi({ label: 'Value', value: U.m(p.currentValue, 0), sub: p.purchasePrice ? `${U.pc(m.appreciation)} since purchase` : '' })}
          ${UI.kpi({ label: 'Equity', value: U.m(m.equity, 0), sub: `LTV ${U.pct(m.ltv)}`, accent: '#2ecf8f' })}
          ${m.isRental ? UI.kpi({ label: 'Cash flow / mo', value: U.mc(m.cashFlow, 0), sub: `${U.mc(m.cashFlow * 12, 0)} / yr`, accent: m.cashFlow >= 0 ? '#2ecf8f' : '#f45b72' }) : UI.kpi({ label: 'Monthly cost', value: U.m(m.opex + m.debtService, 0), sub: 'Mortgage + expenses' })}
          ${m.isRental ? UI.kpi({ label: 'Cap rate', value: U.pct(m.capRate, 2), sub: m.cashOnCash != null ? `Cash-on-cash ${U.pct(m.cashOnCash, 1)}` : '' }) : UI.kpi({ label: 'Mortgage', value: loan ? U.m(loan.balance, 0) : 'Free & clear', sub: loan ? `${loan.rate}% · ${U.money(F.loanPayment(loan), 0)}/mo P&I` : '' })}
        </div>
        <div class="grid g-21 mt">
          <div class="card"><div class="card-h"><div><h3>10-year equity projection</h3><p>${(appr * 100).toFixed(1)}% annual appreciation · scheduled loan paydown</p></div></div><div class="card-b"><div id="eq-chart"></div></div></div>
          <div class="card"><div class="card-h"><div><h3>${m.isRental ? 'Rental analysis' : 'Ownership costs'}</h3></div></div><div class="card-b">
            ${m.isRental ? row('Gross rent', U.m(m.grossRent)) + row(`Vacancy (${U.num(p.vacancyRate)}%)`, U.m(-(m.grossRent - m.effRent)), 'neg') : ''}
            ${row('Operating expenses', U.m(-m.opex), 'neg')}
            ${m.isRental ? row('Net operating income', U.m(m.noiMonthly)) : ''}
            ${loan ? row('Debt service (P&I + escrow)', U.m(-m.debtService), 'neg') : ''}
            ${m.isRental ? row('Cash flow', U.mc(m.cashFlow), m.cashFlow >= 0 ? 'pos' : 'neg') + row('DSCR', m.dscr != null ? m.dscr.toFixed(2) + 'x' : '—', m.dscr != null && m.dscr < 1.2 ? 'neg' : '') + row('Gross rent multiplier', m.grm ? m.grm.toFixed(1) : '—') + row('1% rule', U.pct(m.onePct, 2), m.onePct >= 0.01 ? 'pos' : '') : ''}
            ${row('YTD income / expenses (linked txns)', `${U.money(ytdIn, 0)} / ${U.money(ytdOut, 0)}`)}
          </div></div>
        </div>
        <div class="grid g2 mt">
          <div class="card"><div class="card-h"><div><h3>Expense breakdown</h3><p>Monthly</p></div></div><div class="card-b">
            ${[['Property tax', e.taxes], ['Insurance', e.insurance], ['HOA', e.hoa], ['Maintenance', e.maintenance], ['Utilities', e.utilities], ['Management', U.num(e.management) + (U.num(e.managementPct) ? m.effRent * e.managementPct / 100 : 0)], ['CapEx reserve', U.num(e.capexPct) ? m.grossRent * e.capexPct / 100 : 0], ['Other', e.other], ...(loan ? [['Mortgage P&I', F.loanPayment(loan)], ['Escrow', loan.escrow]] : [])].filter(([, v]) => U.num(v)).map(([l, v]) => row(l, U.m(v))).join('') || '<p class="muted">No expenses entered.</p>'}
          </div></div>
          ${m.isRental || units.length ? `<div class="card flush"><div class="card-h"><div><h3>Units & tenants</h3><p>${units.length} unit${units.length === 1 ? '' : 's'} · ${U.money(U.sum(units, (u) => u.rent), 0)}/mo</p></div><div class="card-a"><button class="btn sm" data-x="addUnit">${UI.icon('plus', 14)} Unit</button></div></div><div class="card-b">
            ${units.length ? `<table class="tbl"><thead><tr><th>Unit</th><th>Tenant</th><th class="r">Rent</th><th>Lease ends</th></tr></thead><tbody>${units.map((u) => {
              const days = u.leaseEnd ? U.daysBetween(U.today(), u.leaseEnd) : null;
              return `<tr class="click" data-x="unit" data-id="${u.id}"><td><b>${U.esc(u.name)}</b></td><td>${U.esc(u.tenant || 'Vacant')}${u.phone ? `<div class="sub">${U.esc(u.phone)}</div>` : ''}</td><td class="r amt">${U.money(u.rent, 0)}</td><td>${u.leaseEnd ? `${U.fmtDate(u.leaseEnd)} ${days != null && days < 60 ? UI.tag(days < 0 ? 'expired' : `${days}d`, days < 0 ? '#f45b72' : '#f5b942') : ''}` : '<span class="muted">Month-to-month</span>'}</td></tr>`;
            }).join('')}</tbody></table>` : '<p class="muted" style="padding:0 18px">Add units to track tenants, deposits and lease expirations.</p>'}
          </div></div>` : ''}
        </div>`,
      footer: `<button class="btn" data-x="txns">${UI.icon('list', 15)} Linked transactions</button><span class="grow"></span><button class="btn" data-x="edit">${UI.icon('edit', 15)} Edit property</button>`,
    });
    Ch.line(md.body.querySelector('#eq-chart'), {
      height: 240, area: false,
      series: [{ name: 'Value', color: '#0ea5e9', data: valPts }, { name: 'Equity', color: '#2ecf8f', data: eqPts, area: true }, ...(loan ? [{ name: 'Loan balance', color: '#f45b72', dashed: true, data: loanPts }] : [])],
    });
    md.el.addEventListener('click', (ev) => {
      const x = ev.target.closest('[data-x]'); if (!x) return;
      const act = x.dataset.x;
      md.close();
      setTimeout(() => {
        if (act === 'edit') edit(p);
        if (act === 'addUnit') editUnit(p, null);
        if (act === 'unit') editUnit(p, (p.units || []).find((u) => u.id === x.dataset.id));
        if (act === 'txns') { B.go('transactions'); }
      }, 200);
    });
  }

  B.views.realestate = {
    add: () => edit(null),
    render(root) {
      const ps = S.state.properties;
      const data = ps.map((p) => ({ p, loan: S.loanForProperty(p), m: F.propertyMetrics(p, S.loanForProperty(p)) }));
      const value = U.sum(data, (d) => d.p.currentValue);
      const debt = U.sum(data, (d) => d.m.loanBal);
      const rentals = data.filter((d) => d.m.isRental);
      const cf = U.sum(rentals, (d) => d.m.cashFlow);
      const noi = U.sum(rentals, (d) => d.m.noiAnnual);
      const rentalValue = U.sum(rentals, (d) => d.p.currentValue);
      const units = U.sum(ps, (p) => (p.units || []).length);
      const leases = A_leases(ps);

      root.innerHTML = `
        ${UI.pageHead('Real Estate', 'Homes, rentals, land and commercial — equity, cash flow and returns.', UI.btn('Add property', 'add', { icon: 'plus', kind: 'primary' }))}
        ${ps.length ? `
        <div class="grid g4">
          ${UI.kpi({ label: 'Portfolio value', icon: 'home', accent: '#0ea5e9', value: U.m(value, 0), sub: `${ps.length} propert${ps.length === 1 ? 'y' : 'ies'}${units ? ` · ${units} units` : ''}` })}
          ${UI.kpi({ label: 'Total equity', icon: 'networth', accent: '#2ecf8f', value: U.m(value - debt, 0), sub: value ? `Blended LTV ${U.pct(debt / value)}` : '' })}
          ${UI.kpi({ label: 'Rental cash flow / mo', icon: 'coins', accent: cf >= 0 ? '#a3e635' : '#f45b72', value: U.mc(cf, 0), sub: `${U.mc(cf * 12, 0)} per year` })}
          ${UI.kpi({ label: 'Portfolio cap rate', icon: 'chart', accent: '#8b5cf6', value: rentalValue ? U.pct(noi / rentalValue, 2) : '—', sub: rentals.length ? `NOI ${U.money(noi, 0)}/yr` : 'No rentals yet' })}
        </div>
        ${leases.length ? `<div class="callout warn mt">${UI.icon('calendar')}<div><b>Leases expiring soon:</b> ${leases.map((l) => `${U.esc(l.unit)} @ ${U.esc(l.prop)} (${U.fmtDate(l.date, { month: 'short', day: 'numeric' })})`).join(' · ')}</div></div>` : ''}
        <div class="grid g3 mt">${data.map(({ p, m }, i) => `
          <div class="prop-card" data-act="open" data-id="${p.id}">
            <div class="prop-hero" style="background:linear-gradient(135deg,${GRAD[i % GRAD.length].split(',').map((c) => c + '55').join(',')}),linear-gradient(180deg,#141a26,#0f141e)">${UI.tag(S.PROPERTY_TYPES[p.type] || p.type, m.isRental ? '#a3e635' : '#5b9cff')}<h4>${U.esc(p.name)}</h4><small>${U.esc(p.address || '')}</small></div>
            <div class="prop-stats">
              <div><small>Value</small><b class="amt">${U.moneyShort(p.currentValue)}</b></div>
              <div><small>Equity</small><b class="amt pos">${U.moneyShort(m.equity)}</b></div>
              ${m.isRental ? `<div><small>Cash flow</small><b class="amt ${m.cashFlow >= 0 ? 'pos' : 'neg'}">${U.money(m.cashFlow, 0)}</b></div>` : `<div><small>LTV</small><b>${U.pct(m.ltv, 0)}</b></div>`}
            </div>
          </div>`).join('')}</div>
        <div class="grid g2 mt">
          ${UI.card({ title: 'Equity vs. debt', body: '<div id="re-eq"></div>' })}
          ${rentals.length ? UI.card({ title: 'Rental scorecard', cls: 'flush', body: `<table class="tbl"><thead><tr><th>Property</th><th class="r">Cash flow</th><th class="r">Cap rate</th><th class="r">CoC</th><th class="r">DSCR</th></tr></thead><tbody>${rentals.map(({ p, m }) => `<tr class="click" data-act="open" data-id="${p.id}"><td><b>${U.esc(p.name)}</b></td><td class="r">${U.mc(m.cashFlow, 0)}</td><td class="r">${U.pct(m.capRate, 2)}</td><td class="r">${m.cashOnCash != null ? U.pct(m.cashOnCash, 1) : '—'}</td><td class="r ${m.dscr != null && m.dscr < 1.2 ? 'neg' : ''}">${m.dscr != null ? m.dscr.toFixed(2) + 'x' : '—'}</td></tr>`).join('')}</tbody></table>` }) : UI.card({ title: 'Value by property', body: '<div id="re-val"></div>' })}
        </div>` : UI.card({ body: UI.empty('home', 'Add your first property', 'Track your home, rentals, land and commercial properties. Link mortgages to see equity, LTV, cash flow and returns.', UI.btn('Add property', 'add', { icon: 'plus', kind: 'primary' })) })}`;

      if (ps.length) {
        Ch.bar(root.querySelector('#re-eq'), { labels: data.map((d) => d.p.name.length > 14 ? d.p.name.slice(0, 13) + '…' : d.p.name), tipLabels: data.map((d) => d.p.name), stacked: true, height: 240, series: [{ name: 'Equity', color: '#2ecf8f', values: data.map((d) => d.m.equity) }, { name: 'Loan', color: '#f45b72', values: data.map((d) => d.m.loanBal) }] });
        const rv = root.querySelector('#re-val');
        if (rv) Ch.donut(rv, { items: data.map((d, i) => ({ label: d.p.name, value: U.num(d.p.currentValue), color: Ch.PALETTE[i % 12] })) });
      }
      UI.bind(root, { add: () => edit(null), open: (d) => detail(S.get('properties', d.id)) });
    },
  };

  function A_leases(ps) {
    const out = [];
    const lim = U.addDays(U.today(), 75);
    ps.forEach((p) => (p.units || []).forEach((u) => { if (u.leaseEnd && u.leaseEnd <= lim) out.push({ prop: p.name, unit: u.name, date: u.leaseEnd }); }));
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
})(window.BLAM);
