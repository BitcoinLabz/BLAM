/* BLAM — Loans, mortgages, amortization & debt payoff planner */
'use strict';
(function (B) {
  const { U, F, S, UI, Ch } = B;
  const V = { strategy: 'avalanche', extra: null };
  const TYPE_COLOR = { mortgage: '#0ea5e9', heloc: '#14b8a6', auto: '#8b5cf6', student: '#eab308', personal: '#ec4899', business: '#f97316', medical: '#f43f5e', other: '#64748b' };

  function edit(l) {
    const isNew = !l;
    UI.form({
      title: isNew ? 'Add loan' : `Edit ${l.name}`, wide: true,
      intro: isNew ? 'Enter your original loan terms and today\'s balance. Leave the payment blank and BLAM calculates principal & interest from the terms.' : '',
      fields: [
        { key: 'name', label: 'Name', required: true, col: 3, placeholder: 'e.g. Home Mortgage' },
        { key: 'type', label: 'Type', type: 'select', col: 3, options: UI.objOptions(S.LOAN_TYPES) },
        { key: 'lender', label: 'Lender', col: 3 },
        { key: 'propertyId', label: 'Secured by property', type: 'select', col: 3, show: (v) => ['mortgage', 'heloc'].includes(v.type), options: [{ value: '', label: '— none —' }, ...S.state.properties.map((p) => ({ value: p.id, label: p.name }))] },
        { type: 'heading', label: 'Terms' },
        { key: 'originalPrincipal', label: 'Original amount', type: 'money', col: 2, required: true },
        { key: 'rate', label: 'Interest rate (APR)', type: 'percent', col: 2, required: true },
        { key: 'termMonths', label: 'Term', type: 'select', col: 2, options: [12, 24, 36, 48, 60, 72, 84, 96, 120, 180, 240, 300, 360, 480].map((n) => ({ value: n, label: n % 12 ? `${n} months` : `${n / 12} years (${n} mo)` })) },
        { key: 'startDate', label: 'Loan start date', type: 'date', col: 2 },
        { key: 'balance', label: 'Current balance', type: 'money', col: 2, required: true },
        { key: 'nextPaymentDate', label: 'Next payment date', type: 'date', col: 2 },
        { type: 'heading', label: 'Payment' },
        { key: 'payment', label: 'Principal & interest', type: 'money', col: 2, help: 'Blank = calculated' },
        { key: 'escrow', label: 'Escrow (tax/insurance/PMI)', type: 'money', col: 2 },
        { key: 'extraMonthly', label: 'Extra principal / month', type: 'money', col: 2 },
        { key: 'createRecurring', label: 'Automation', type: 'checkbox', col: 6, checkLabel: 'Auto-post this payment every month and reduce the balance automatically', show: () => isNew },
        { key: 'notes', label: 'Notes', type: 'textarea', rows: 2, col: 6 },
      ],
      values: l || { type: 'mortgage', termMonths: 360, startDate: U.today(), nextPaymentDate: U.addMonths(U.today(), 1), createRecurring: true },
      onSave: (v) => {
        ['originalPrincipal', 'rate', 'balance', 'escrow', 'extraMonthly'].forEach((k) => { v[k] = U.num(v[k]); });
        v.termMonths = +v.termMonths;
        v.payment = U.num(v.payment) || U.round(F.monthlyPayment(v.originalPrincipal, v.rate, v.termMonths));
        const mk = v.createRecurring; delete v.createRecurring;
        const saved = S.upsert('loans', v);
        if (v.propertyId) S.commit((s) => { const p = s.properties.find((x) => x.id === v.propertyId); if (p && !p.loanId) p.loanId = saved.id; });
        if (mk && S.activeAccounts().length) {
          S.upsert('recurring', { name: v.name, kind: 'loan', loanId: saved.id, accountId: S.activeAccounts().find((a) => S.accountKind(a) === 'cash')?.id || S.activeAccounts()[0].id, frequency: 'monthly', nextDate: v.nextPaymentDate || U.addMonths(U.today(), 1), anchorDay: U.parse(v.nextPaymentDate || U.today()).getDate(), autoPost: true, includeExtra: true });
          UI.toast('Loan added with auto-payment (change the account in Bills & Recurring)');
        } else UI.toast(isNew ? 'Loan added' : 'Loan saved');
      },
      onDelete: isNew ? null : () => S.commit((s) => {
        s.loans = s.loans.filter((x) => x.id !== l.id);
        s.recurring = s.recurring.filter((r) => r.loanId !== l.id);
        s.properties.forEach((p) => { if (p.loanId === l.id) p.loanId = ''; });
      }),
    });
  }

  // ---------------------------------------------------------------- loan detail / what-if
  function detail(l) {
    const st = { extra: U.num(l.extraMonthly), lump: 0, lumpDate: U.addMonths(U.today(), 1), rate: U.num(l.rate), view: 'yearly' };
    const md = UI.modal({
      title: l.name, xwide: true,
      body: `<div class="grid g4" id="ld-kpi"></div>
        <div class="card mt"><div class="card-h"><div><h3>What-if simulator</h3><p>See how extra payments, a lump sum or a refinance change your payoff</p></div></div><div class="card-b">
          <div class="fgrid">
            <div class="field" style="grid-column:span 2"><label>Extra principal / month</label><div class="inwrap has-pre"><span class="adorn">$</span><input type="number" id="w-extra" value="${st.extra}" step="25"></div><input type="range" id="w-extra-r" min="0" max="${Math.max(2000, Math.ceil(F.loanPayment(l) * 2 / 100) * 100)}" step="25" value="${st.extra}" style="width:100%;margin-top:8px;accent-color:#f7931a"></div>
            <div class="field" style="grid-column:span 1"><label>One-time lump sum</label><div class="inwrap has-pre"><span class="adorn">$</span><input type="number" id="w-lump" value="0" step="500"></div></div>
            <div class="field" style="grid-column:span 1"><label>Lump sum date</label><input type="date" id="w-lumpd" value="${st.lumpDate}"></div>
            <div class="field" style="grid-column:span 2"><label>Interest rate (refinance test)</label><div class="inwrap has-post"><input type="number" id="w-rate" value="${st.rate}" step="0.125"><span class="adorn r">%</span></div></div>
          </div>
          <div id="w-result" class="mt"></div>
          <div id="w-chart" class="mt"></div>
        </div></div>
        <div class="grid g2 mt">
          <div class="card"><div class="card-h"><div><h3>Principal vs. interest by year</h3></div></div><div class="card-b"><div id="w-pi"></div></div></div>
          <div class="card flush"><div class="card-h"><div><h3>Amortization schedule</h3></div><div class="card-a"><div class="seg" id="w-view"><button data-v="yearly" class="on">Yearly</button><button data-v="monthly">Monthly</button></div></div></div><div class="card-b tbl-wrap" style="max-height:340px;overflow:auto" id="w-table"></div></div>
        </div>`,
      footer: `<button class="btn" data-x="csv">${UI.icon('download', 15)} Export schedule</button><button class="btn" data-x="apply">${UI.icon('check', 15)} Save extra payment to loan</button><span class="grow"></span><button class="btn ghost" data-x="pay">${UI.icon('plus', 15)} Record payment</button><button class="btn ghost" data-x="edit">${UI.icon('edit', 15)} Edit loan</button>`,
    });
    let plan;
    const recompute = () => {
      const pmt = st.rate !== U.num(l.rate) ? F.monthlyPayment(l.balance, st.rate, Math.max(1, F.monthsToPayoff(l.balance, l.rate, F.loanPayment(l)))) : F.loanPayment(l);
      const start = F.nextPaymentDate(l);
      const base = F.amortize({ balance: l.balance, rate: l.rate, payment: F.loanPayment(l), start });
      plan = F.amortize({ balance: l.balance, rate: st.rate, payment: pmt, extra: st.extra, start, lumps: st.lump ? [{ date: st.lumpDate, amount: st.lump }] : [] });
      const saved = base.totalInterest - plan.totalInterest;
      const mSaved = base.months - plan.months;
      const sm = F.loanSummary(l);
      md.body.querySelector('#ld-kpi').innerHTML = [
        UI.kpi({ label: 'Balance', value: U.m(l.balance), sub: `${U.pct(sm.progress, 1)} of ${U.money(l.originalPrincipal || l.balance, 0)} paid`, accent: TYPE_COLOR[l.type] }),
        UI.kpi({ label: 'Monthly payment', value: U.m(F.loanPayment(l) + U.num(l.escrow) + U.num(l.extraMonthly)), sub: `P&I ${U.money(F.loanPayment(l))}${l.escrow ? ` + escrow ${U.money(l.escrow)}` : ''}${l.extraMonthly ? ` + extra ${U.money(l.extraMonthly)}` : ''}` }),
        UI.kpi({ label: 'Interest this month', value: U.m(sm.monthlyInterestNow), sub: `${U.pct(sm.monthlyInterestNow / F.loanPayment(l), 0)} of your P&I payment`, accent: '#f45b72' }),
        UI.kpi({ label: 'Payoff (current plan)', value: sm.plan.neverPaysOff ? '<span class="neg">Never</span>' : U.fmtDate(sm.plan.payoffDate, { month: 'short', year: 'numeric' }), sub: sm.plan.neverPaysOff ? 'Payment does not cover interest' : `${Math.floor(sm.plan.months / 12)}y ${sm.plan.months % 12}m · ${U.money(sm.plan.totalInterest, 0)} interest left`, accent: '#2ecf8f' }),
      ].join('');
      md.body.querySelector('#w-result').innerHTML = plan.neverPaysOff
        ? `<div class="callout warn">${UI.icon('info')}<div>At this payment the loan never pays off.</div></div>`
        : `<div class="grid g4">
          <div><div class="muted" style="font-size:12px">New payoff date</div><div class="big-num">${U.fmtDate(plan.payoffDate, { month: 'short', year: 'numeric' })}</div></div>
          <div><div class="muted" style="font-size:12px">Time saved</div><div class="big-num ${mSaved > 0 ? 'pos' : ''}">${mSaved > 0 ? `${Math.floor(mSaved / 12)}y ${mSaved % 12}m` : '—'}</div></div>
          <div><div class="muted" style="font-size:12px">Interest saved</div><div class="big-num ${saved > 1 ? 'pos' : saved < -1 ? 'neg' : ''} amt">${U.money(saved, 0)}</div></div>
          <div><div class="muted" style="font-size:12px">Total interest remaining</div><div class="big-num amt">${U.money(plan.totalInterest, 0)}</div></div></div>`;
      const thin = (rows) => rows.filter((r, i) => i % Math.max(1, Math.floor(rows.length / 120)) === 0 || i === rows.length - 1);
      Ch.line(md.body.querySelector('#w-chart'), {
        height: 250,
        series: [
          { name: 'Original schedule', color: '#64748b', dashed: true, data: [{ x: U.today(), y: l.balance }, ...thin(base.rows).map((r) => ({ x: r.date, y: r.balance }))] },
          { name: 'With your changes', color: '#f7931a', area: true, data: [{ x: U.today(), y: l.balance }, ...thin(plan.rows).map((r) => ({ x: r.date, y: r.balance }))] },
        ],
        markers: plan.neverPaysOff ? [] : [{ x: plan.payoffDate, label: 'Debt-free', color: '#2ecf8f' }],
      });
      const years = {};
      plan.rows.forEach((r) => { const y = r.date.slice(0, 4); years[y] = years[y] || { p: 0, i: 0, end: 0 }; years[y].p += r.principal + r.extra; years[y].i += r.interest; years[y].end = r.balance; });
      const ys = Object.keys(years);
      Ch.bar(md.body.querySelector('#w-pi'), { labels: ys.map((y) => `'${y.slice(2)}`), tipLabels: ys, stacked: true, height: 230, series: [{ name: 'Principal', color: '#2ecf8f', values: ys.map((y) => years[y].p) }, { name: 'Interest', color: '#f45b72', values: ys.map((y) => years[y].i) }] });
      md.body.querySelector('#w-table').innerHTML = st.view === 'yearly'
        ? `<table class="tbl"><thead><tr><th>Year</th><th class="r">Principal</th><th class="r">Interest</th><th class="r">End balance</th></tr></thead><tbody>${ys.map((y) => `<tr><td>${y}</td><td class="r amt">${U.money(years[y].p, 0)}</td><td class="r neg amt">${U.money(years[y].i, 0)}</td><td class="r amt"><b>${U.money(years[y].end, 0)}</b></td></tr>`).join('')}</tbody></table>`
        : `<table class="tbl"><thead><tr><th>#</th><th>Date</th><th class="r">Principal</th><th class="r">Interest</th><th class="r">Extra</th><th class="r">Balance</th></tr></thead><tbody>${plan.rows.map((r) => `<tr><td class="muted">${r.n}</td><td>${U.fmtDate(r.date, { month: 'short', year: 'numeric' })}</td><td class="r amt">${U.money(r.principal)}</td><td class="r neg amt">${U.money(r.interest)}</td><td class="r amt">${r.extra ? U.money(r.extra) : ''}</td><td class="r amt"><b>${U.money(r.balance)}</b></td></tr>`).join('')}</tbody></table>`;
    };
    const bindNum = (id, key, cb) => md.body.querySelector(id).addEventListener('input', (e) => { st[key] = id === '#w-lumpd' ? e.target.value : U.num(e.target.value); cb && cb(); recompute(); });
    bindNum('#w-extra', 'extra', () => { md.body.querySelector('#w-extra-r').value = st.extra; });
    md.body.querySelector('#w-extra-r').addEventListener('input', (e) => { st.extra = U.num(e.target.value); md.body.querySelector('#w-extra').value = st.extra; recompute(); });
    bindNum('#w-lump', 'lump'); bindNum('#w-lumpd', 'lumpDate'); bindNum('#w-rate', 'rate');
    md.body.querySelector('#w-view').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.view = b.dataset.v; md.body.querySelectorAll('#w-view button').forEach((x) => x.classList.toggle('on', x === b)); recompute(); });
    recompute();
    md.foot.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return;
      if (x === 'csv') {
        const rows = [['#', 'Date', 'Payment', 'Principal', 'Interest', 'Extra', 'Balance'], ...plan.rows.map((r) => [r.n, r.date, U.round(r.payment), U.round(r.principal), U.round(r.interest), U.round(r.extra), U.round(r.balance)])];
        U.download(`${l.name.replace(/\W+/g, '-')}-amortization.csv`, U.toCsv(rows), [{ name: 'CSV', extensions: ['csv'] }]);
        return;
      }
      if (x === 'apply') { S.commit((s) => { s.loans.find((y) => y.id === l.id).extraMonthly = st.extra; }); UI.toast(`Extra payment set to ${U.money(st.extra)}/mo`); md.close(); return; }
      md.close();
      setTimeout(() => { if (x === 'edit') edit(l); if (x === 'pay') recordPayment(l); }, 200);
    });
  }

  function recordPayment(l) {
    const interest = U.num(l.balance) * U.num(l.rate) / 100 / 12;
    UI.form({
      title: `Record payment · ${l.name}`,
      intro: `This month's interest is about <b>${U.money(interest)}</b>. Anything above that reduces your principal.`,
      fields: [
        { key: 'amount', label: 'Total paid (excluding escrow)', type: 'money', col: 3, required: true },
        { key: 'date', label: 'Date', type: 'date', col: 3 },
        { key: 'accountId', label: 'Paid from', type: 'select', col: 6, options: [{ value: '', label: "Don't record a transaction" }, ...S.activeAccounts().map((a) => ({ value: a.id, label: a.name }))] },
      ],
      values: { amount: U.round(F.loanPayment(l) + U.num(l.extraMonthly)), date: U.today() },
      onSave: (v) => {
        const principal = Math.min(U.num(l.balance), Math.max(0, U.num(v.amount) - interest));
        S.commit((s) => {
          const x = s.loans.find((y) => y.id === l.id);
          x.balance = U.round(U.num(x.balance) - principal);
          x.nextPaymentDate = U.addMonths(F.nextPaymentDate(x), 1);
          (x.payments = x.payments || []).push({ date: v.date, principal: U.round(principal), interest: U.round(interest) });
        });
        if (v.accountId) S.addTransaction({ date: v.date, accountId: v.accountId, payee: l.name, amount: -(U.num(v.amount) + U.num(l.escrow)), category: ['mortgage', 'heloc'].includes(l.type) ? 'Mortgage / Rent' : l.type === 'auto' ? 'Auto Payment' : 'Loan Payment', loanId: l.id });
        UI.toast(`Principal reduced by ${U.money(principal)}`);
      },
    });
  }

  // ---------------------------------------------------------------- multi-debt planner
  function allDebts() {
    const loans = S.state.loans.filter((l) => !l.archived && U.num(l.balance) > 0).map((l) => ({ id: l.id, name: l.name, balance: U.num(l.balance), rate: U.num(l.rate), minPayment: F.loanPayment(l), color: TYPE_COLOR[l.type] }));
    const cards = S.activeAccounts().filter((a) => S.accountKind(a) === 'credit' && U.num(a.balance) > 0).map((a) => ({ id: a.id, name: a.name, balance: U.num(a.balance), rate: U.num(a.apr), minPayment: U.num(a.minPayment) || Math.max(25, U.num(a.balance) * 0.02 + U.num(a.balance) * U.num(a.apr) / 1200), color: '#f43f5e' }));
    return [...cards, ...loans];
  }

  function planner(root) {
    const debts = allDebts();
    const el = root.querySelector('#planner');
    if (!debts.length) { el.innerHTML = UI.empty('check', 'No debt to plan', 'Add loans or credit cards with balances.'); return; }
    if (V.extra === null) V.extra = U.num(S.state.loans.reduce((a, l) => a + U.num(l.extraMonthly), 0)) || 200;
    const res = F.payoffPlan(debts, V.extra, V.strategy);
    const alt = F.payoffPlan(debts, V.extra, V.strategy === 'avalanche' ? 'snowball' : 'avalanche');
    const minOnly = F.payoffPlan(debts, 0, 'avalanche');
    const minBudget = U.sum(debts, (d) => d.minPayment);
    el.innerHTML = `
      <div class="toolbar">
        <div class="seg" id="strat">${[['avalanche', 'Avalanche (highest rate first)'], ['snowball', 'Snowball (smallest balance first)']].map(([k, l]) => `<button data-s="${k}" class="${V.strategy === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <span class="muted" style="margin-left:10px">Extra per month</span>
        <div class="inwrap has-pre" style="width:130px"><span class="adorn">$</span><input class="input" id="pl-extra" type="number" step="50" value="${V.extra}" style="padding-left:24px;min-width:0;width:100%"></div>
        <span class="muted">Total monthly budget: <b class="amt" style="color:var(--text)">${U.money(minBudget + V.extra, 0)}</b></span>
      </div>
      ${res.neverPaysOff ? `<div class="callout warn">${UI.icon('info')}<div>Your payments don't cover the interest on all debts. Increase the extra amount.</div></div>` : `
      <div class="grid g4">
        ${UI.kpi({ label: 'Debt-free date', value: U.fmtDate(res.payoffDate, { month: 'short', year: 'numeric' }), sub: `${Math.floor(res.months / 12)} years ${res.months % 12} months`, accent: '#2ecf8f' })}
        ${UI.kpi({ label: 'Total interest', value: U.m(res.totalInterest, 0), accent: '#f45b72', sub: minOnly.neverPaysOff ? '' : `vs ${U.money(minOnly.totalInterest, 0)} minimums only` })}
        ${UI.kpi({ label: 'Saved vs. minimums', value: minOnly.neverPaysOff ? '—' : U.m(minOnly.totalInterest - res.totalInterest, 0), sub: minOnly.neverPaysOff ? '' : `${minOnly.months - res.months} months sooner`, accent: '#f7931a' })}
        ${UI.kpi({ label: `vs. ${V.strategy === 'avalanche' ? 'snowball' : 'avalanche'}`, value: alt.neverPaysOff ? '—' : U.mc(alt.totalInterest - res.totalInterest, 0), sub: alt.neverPaysOff ? '' : `${alt.totalInterest - res.totalInterest >= 0 ? 'less' : 'more'} interest with this strategy`, accent: '#8b5cf6' })}
      </div>
      <div class="grid g-21 mt">
        <div><div id="pl-chart"></div></div>
        <div class="list">${res.debts.map((d, i) => `<div class="li"><div class="li-ic" style="background:${d.color}22;color:${d.color}"><b>${i + 1}</b></div><div class="li-m"><div class="li-t">${U.esc(d.name)}</div><div class="li-s">${U.money(d.balance, 0)} at ${d.rate}% · ${U.money(d.interest, 0)} interest</div></div><div class="li-r">${d.paidOff ? U.fmtDate(d.paidOff.date, { month: 'short', year: 'numeric' }) : '—'}<div class="li-s">${d.paidOff ? `month ${d.paidOff.month}` : ''}</div></div></div>`).join('')}</div>
      </div>`}`;
    if (!res.neverPaysOff) {
      const toPts = (r) => r.series.filter((x, i) => i % Math.max(1, Math.floor(r.series.length / 100)) === 0 || i === r.series.length - 1).map((x) => ({ x: U.addMonths(U.today(), x.month), y: x.total }));
      Ch.line(el.querySelector('#pl-chart'), { height: 260, series: [{ name: `Your plan (${V.strategy})`, color: '#f7931a', area: true, data: toPts(res) }, ...(minOnly.neverPaysOff ? [] : [{ name: 'Minimum payments only', color: '#64748b', dashed: true, data: toPts(minOnly) }])] });
    }
    el.querySelector('#strat').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { V.strategy = b.dataset.s; planner(root); } });
    el.querySelector('#pl-extra').addEventListener('change', (e) => { V.extra = U.num(e.target.value); planner(root); });
  }

  B.views.loans = {
    add: () => edit(null),
    render(root) {
      const loans = S.state.loans.filter((l) => !l.archived);
      const data = loans.map((l) => ({ l, sm: F.loanSummary(l) }));
      const debt = U.sum(loans, (l) => l.balance);
      const pay = U.sum(loans, (l) => F.loanPayment(l) + U.num(l.escrow) + U.num(l.extraMonthly));
      const intMo = U.sum(data, (d) => d.sm.monthlyInterestNow);
      const last = data.filter((d) => !d.sm.plan.neverPaysOff && U.num(d.l.balance) > 0).map((d) => d.sm.plan.payoffDate).sort().pop();
      const wRate = debt ? U.sum(loans, (l) => U.num(l.balance) * U.num(l.rate)) / debt : 0;

      root.innerHTML = `
        ${UI.pageHead('Loans & Payoff', 'Mortgages, auto, student and personal loans — see exactly when each will be paid off.', UI.btn('Add loan', 'add', { icon: 'plus', kind: 'primary' }))}
        ${loans.length ? `
        <div class="grid g4">
          ${UI.kpi({ label: 'Total loan debt', icon: 'loan', accent: '#f45b72', value: U.m(debt, 0), sub: `${loans.length} loans · ${wRate.toFixed(2)}% weighted rate` })}
          ${UI.kpi({ label: 'Monthly payments', icon: 'calendar', accent: '#8b5cf6', value: U.m(pay, 0), sub: `${U.ms(pay * 12)} per year` })}
          ${UI.kpi({ label: 'Interest this month', icon: 'bolt', accent: '#f5b942', value: U.m(intMo, 0), sub: `${U.money(intMo / 30, 2)} per day` })}
          ${UI.kpi({ label: 'All loans paid off', icon: 'check', accent: '#2ecf8f', value: last ? U.fmtDate(last, { month: 'short', year: 'numeric' }) : '—', sub: last ? `${Math.max(0, Math.round(U.daysBetween(U.today(), last) / 365.25 * 10) / 10)} years from now` : '' })}
        </div>
        <div class="grid g2 mt">${data.map(({ l, sm }) => `
          <div class="card loan-card">
            <div class="loan-top"><div><h4>${U.esc(l.name)}</h4><div class="muted" style="margin-top:3px">${UI.tag(S.LOAN_TYPES[l.type] || l.type, TYPE_COLOR[l.type])} ${U.esc(l.lender || '')}</div></div>
              <div class="card-a"><button class="btn sm" data-act="open" data-id="${l.id}">${UI.icon('chart', 14)} Payoff simulator</button><button class="icon-btn" data-act="edit" data-id="${l.id}">${UI.icon('edit', 15)}</button></div></div>
            <div class="loan-meta">
              <div><small>Balance</small><b class="amt">${U.money(l.balance, 0)}</b></div>
              <div><small>Rate</small><b>${U.num(l.rate)}%</b></div>
              <div><small>Payment</small><b class="amt">${U.money(sm.payment + U.num(l.escrow) + U.num(l.extraMonthly), 0)}</b></div>
              <div><small>Payoff</small><b class="${sm.plan.neverPaysOff ? 'neg' : 'pos'}">${sm.plan.neverPaysOff ? 'Never' : U.fmtDate(sm.plan.payoffDate, { month: 'short', year: 'numeric' })}</b></div>
            </div>
            ${Ch.progress(sm.progress, TYPE_COLOR[l.type])}
            <div style="display:flex;justify-content:space-between;margin:6px 0 10px" class="muted"><span>${U.pct(sm.progress, 1)} paid off</span><span>${sm.plan.neverPaysOff ? '' : `${Math.floor(sm.plan.months / 12)}y ${sm.plan.months % 12}m remaining`}</span></div>
            <div class="loan-chart" data-id="${l.id}"></div>
            ${sm.interestSaved > 1 ? `<div class="callout mt">${UI.icon('check')}<div>Your extra <b>${U.money(l.extraMonthly)}/mo</b> saves <b class="amt">${U.money(sm.interestSaved, 0)}</b> in interest and pays this off <b>${Math.floor(sm.monthsSaved / 12)}y ${sm.monthsSaved % 12}m</b> early.</div></div>`
              : !sm.plan.neverPaysOff && U.num(l.balance) > 0 ? `<div class="callout info mt">${UI.icon('info')}<div>Adding <b>${U.money(100)}/mo</b> would save <b class="amt">${U.money(Math.max(0, sm.base.totalInterest - F.amortize({ balance: l.balance, rate: l.rate, payment: sm.payment, extra: 100, start: sm.start }).totalInterest), 0)}</b> in interest.</div></div>` : ''}
          </div>`).join('')}</div>
        <div class="mt">${UI.card({ title: 'Debt payoff planner', sub: 'All loans and credit cards together — choose a strategy and extra monthly amount', body: '<div id="planner"></div>' })}</div>
        ` : UI.card({ body: UI.empty('loan', 'Add a mortgage or loan', 'See full amortization schedules, payoff dates, how much interest extra payments save, and a combined avalanche/snowball plan for all your debts.', UI.btn('Add loan', 'add', { icon: 'plus', kind: 'primary' })) })}${allDebts().length ? `<div class="mt">${UI.card({ title: 'Debt payoff planner', sub: 'Credit cards — choose a strategy and extra monthly amount', body: '<div id="planner"></div>' })}</div>` : ''}`;

      root.querySelectorAll('.loan-chart').forEach((el) => {
        const d = data.find((x) => x.l.id === el.dataset.id);
        if (!d || !d.sm.base.rows.length) return;
        const thin = (rows) => rows.filter((r, i) => i % Math.max(1, Math.floor(rows.length / 80)) === 0 || i === rows.length - 1).map((r) => ({ x: r.date, y: r.balance }));
        const series = [{ name: 'Scheduled', color: '#64748b', dashed: true, data: [{ x: U.today(), y: d.l.balance }, ...thin(d.sm.base.rows)] }];
        if (U.num(d.l.extraMonthly) > 0 || (d.l.lumps || []).length) series.push({ name: 'With extra payments', color: TYPE_COLOR[d.l.type], area: true, data: [{ x: U.today(), y: d.l.balance }, ...thin(d.sm.plan.rows)] });
        else { series[0] = { ...series[0], color: TYPE_COLOR[d.l.type], dashed: false, area: true, name: 'Balance' }; }
        Ch.line(el, { height: 170, series, ticks: 3, legend: series.length > 1 });
      });
      if (root.querySelector('#planner')) planner(root);
      UI.bind(root, { add: () => edit(null), edit: (d) => edit(S.get('loans', d.id)), open: (d) => detail(S.get('loans', d.id)) });
    },
  };
})(window.BLAM);
