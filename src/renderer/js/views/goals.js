/* BLAM — Goals & financial independence planner */
'use strict';
(function (B) {
  const { U, F, S, UI, Ch } = B;
  const V = { fire: null };

  function goalCurrent(g) {
    const s = S.state;
    switch (g.linkType) {
      case 'account': return U.num(S.get('accounts', g.linkId)?.balance);
      case 'loanPaid': { const l = S.get('loans', g.linkId); return l ? U.num(l.originalPrincipal) - U.num(l.balance) : 0; }
      case 'holding': return U.num(S.get('holdings', g.linkId)?.quantity);
      case 'netWorth': return S.totals().netWorth;
      case 'passive': return S.passiveIncome().total;
      default: return U.num(g.current);
    }
  }

  function edit(g) {
    const isNew = !g;
    const s = S.state;
    UI.form({
      title: isNew ? 'New goal' : `Edit ${g.name}`, wide: true,
      fields: [
        { key: 'name', label: 'Goal', required: true, col: 4, placeholder: 'Emergency fund, house down payment, 1 BTC…' },
        { key: 'color', label: 'Color', type: 'color', col: 2 },
        { key: 'linkType', label: 'Track progress from', type: 'select', col: 3, options: [{ value: '', label: 'Manual amount' }, { value: 'account', label: 'An account balance' }, { value: 'holding', label: 'A holding quantity (e.g. BTC)' }, { value: 'loanPaid', label: 'Loan principal paid off' }, { value: 'netWorth', label: 'Net worth' }, { value: 'passive', label: 'Monthly passive income' }] },
        { key: 'linkId', label: 'Account', type: 'select', col: 3, show: (v) => v.linkType === 'account', options: s.accounts.map((a) => ({ value: a.id, label: a.name })) },
        { key: 'linkIdH', label: 'Holding', type: 'select', col: 3, show: (v) => v.linkType === 'holding', options: s.holdings.map((h) => ({ value: h.id, label: h.symbol })) },
        { key: 'linkIdL', label: 'Loan', type: 'select', col: 3, show: (v) => v.linkType === 'loanPaid', options: s.loans.map((l) => ({ value: l.id, label: l.name })) },
        { key: 'current', label: 'Current amount', type: 'number', col: 3, show: (v) => !v.linkType },
        { key: 'target', label: 'Target', type: 'number', col: 2, required: true },
        { key: 'unit', label: 'Unit', col: 2, placeholder: '$ (default), BTC…' },
        { key: 'targetDate', label: 'Target date', type: 'date', col: 2 },
        { key: 'notes', label: 'Notes', type: 'textarea', col: 6, rows: 2 },
      ],
      values: g ? { ...g, linkIdH: g.linkId, linkIdL: g.linkId } : { color: '#f7931a', targetDate: U.addMonths(U.today(), 12) },
      onSave: (v) => {
        if (v.linkType === 'holding') v.linkId = v.linkIdH;
        if (v.linkType === 'loanPaid') v.linkId = v.linkIdL;
        if (v.linkType === 'loanPaid' && !v.target) v.target = U.num(S.get('loans', v.linkId)?.originalPrincipal);
        delete v.linkIdH; delete v.linkIdL;
        v.target = U.num(v.target); v.current = U.num(v.current);
        S.upsert('goals', v);
      },
      onDelete: isNew ? null : () => S.remove('goals', g.id),
    });
  }

  function fireDefaults() {
    const s = S.state, t = S.totals();
    const months = U.monthsRange(U.shiftMonth(U.thisMonth(), -1), 6).map((m) => S.monthFlow(m));
    const avgExp = U.sum(months, (f) => f.expense) / 6;
    const avgNet = U.sum(months, (f) => f.net) / 6;
    const rentalEq = U.sum(s.properties.filter((p) => p.type !== 'primary'), (p) => U.num(p.currentValue) - U.num(S.loanForProperty(p)?.balance));
    return {
      annualExpenses: Math.round(avgExp * 12) || 60000,
      invested: Math.round(t.holdings + t.investAccounts + t.metals + t.cash + rentalEq + t.passive),
      monthly: Math.max(0, Math.round(avgNet)) || 1500,
      ret: U.num(s.settings.expectedReturn) || 7,
      swr: U.num(s.settings.safeWithdrawalRate) || 4,
      passive: Math.round(S.passiveIncome().total),
      age: s.settings.age || '',
    };
  }

  function fire(root) {
    const f = V.fire || (V.fire = fireDefaults());
    const el = root.querySelector('#fire');
    const needed = Math.max(0, f.annualExpenses - f.passive * 12);
    const fireNum = needed / (f.swr / 100);
    const months = F.monthsToTarget(f.invested, f.monthly, f.ret, fireNum);
    const coast = fireNum / Math.pow(1 + f.ret / 100, Math.max(1, 65 - (U.num(f.age) || 40)));
    const inp = (k, label, pre, post, step = 1) => `<div class="field" style="grid-column:span 2"><label>${label}</label><div class="inwrap ${pre ? 'has-pre' : ''} ${post ? 'has-post' : ''}">${pre ? `<span class="adorn">${pre}</span>` : ''}<input type="number" data-f="${k}" value="${f[k]}" step="${step}">${post ? `<span class="adorn r">${post}</span>` : ''}</div></div>`;
    el.innerHTML = `
      <div class="fgrid">${inp('annualExpenses', 'Annual spending', '$', '', 1000)}${inp('passive', 'Passive income / mo', '$', '', 50)}${inp('invested', 'Invested assets today', '$', '', 1000)}${inp('monthly', 'Monthly savings', '$', '', 100)}${inp('ret', 'Expected return', '', '%', 0.5)}${inp('swr', 'Safe withdrawal rate', '', '%', 0.25)}${inp('age', 'Your age (for Coast FI)', '', '', 1)}</div>
      <div class="grid g4 mt">
        ${UI.kpi({ label: 'FIRE number', value: U.m(fireNum, 0), sub: f.passive ? `After ${U.money(f.passive * 12, 0)}/yr passive income` : `${(100 / f.swr).toFixed(0)}× annual spending`, accent: '#f7931a' })}
        ${UI.kpi({ label: 'Progress', value: fireNum ? U.pct(Math.min(1, f.invested / fireNum)) : '100%', sub: `${U.money(Math.max(0, fireNum - f.invested), 0)} to go`, accent: '#14b8a6' })}
        ${UI.kpi({ label: 'Financially independent', value: months === Infinity ? 'Not on track' : months === 0 ? 'Now 🎉' : U.fmtDate(U.addMonths(U.today(), months), { month: 'short', year: 'numeric' }), sub: months === Infinity || months === 0 ? '' : `${Math.floor(months / 12)}y ${months % 12}m${f.age ? ` · age ${Math.floor(U.num(f.age) + months / 12)}` : ''}`, accent: '#2ecf8f' })}
        ${UI.kpi({ label: 'Coast FI number', value: U.m(coast, 0), sub: f.invested >= coast ? '<span class="pos">Reached — you could stop saving</span>' : 'Grows to FIRE by 65 with no new savings', accent: '#8b5cf6' })}
      </div>
      <div id="fire-chart" class="mt"></div>`;
    const horizon = Math.min(600, Math.max(120, (months === Infinity ? 360 : months + 60)));
    const pts = [];
    for (let m = 0; m <= horizon; m += 6) pts.push({ x: U.addMonths(U.today(), m), y: F.futureValue(f.invested, f.monthly, f.ret, m) });
    Ch.line(el.querySelector('#fire-chart'), { height: 250, series: [{ name: 'Projected portfolio', color: '#f7931a', area: true, data: pts }, { name: 'FIRE number', color: '#2ecf8f', dashed: true, data: [{ x: pts[0].x, y: fireNum }, { x: pts[pts.length - 1].x, y: fireNum }] }], markers: months !== Infinity && months > 0 ? [{ x: U.addMonths(U.today(), months), label: 'FI', color: '#2ecf8f' }] : [] });
    el.querySelectorAll('[data-f]').forEach((i) => i.addEventListener('change', () => { f[i.dataset.f] = i.dataset.f === 'age' ? i.value : U.num(i.value); if (i.dataset.f === 'age') S.state.settings.age = i.value; fire(root); }));
  }

  B.views.goals = {
    add: () => edit(null),
    render(root) {
      const goals = S.state.goals;
      root.innerHTML = `
        ${UI.pageHead('Goals & FIRE', 'Set targets and see exactly what it takes to reach them — including financial independence.', UI.btn('New goal', 'add', { icon: 'plus', kind: 'primary' }))}
        ${goals.length ? `<div class="grid g2">${goals.map((g) => {
          const cur = goalCurrent(g);
          const frac = g.target ? cur / g.target : 0;
          const unit = g.unit && g.unit !== '$' ? g.unit : null;
          const fmt = (v) => (unit ? `${U.qty(v, 4)} ${U.esc(unit)}` : g.linkType === 'passive' ? `${U.money(v, 0)}/mo` : U.money(v, 0));
          const monthsLeft = g.targetDate ? Math.max(1, Math.round(U.daysBetween(U.today(), g.targetDate) / 30.44)) : null;
          const need = monthsLeft && frac < 1 ? (g.target - cur) / monthsLeft : 0;
          return `<div class="card" data-act="edit" data-id="${g.id}" style="cursor:pointer"><div class="card-b" style="padding:18px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><h3 style="margin:0;font-size:16px">${U.esc(g.name)}</h3><div class="muted" style="margin-top:3px;font-size:12.5px">${g.targetDate ? `Target ${U.fmtDate(g.targetDate)}` : 'No deadline'}${g.linkType ? ` · ${UI.icon('bolt', 11)} auto-tracked` : ''}</div></div>
            <div style="text-align:right"><div class="big-num" style="font-size:24px;color:${g.color || '#f7931a'}">${U.pct(Math.min(frac, 9.99), 0)}</div></div></div>
            <div style="margin:14px 0 8px">${Ch.progress(frac, g.color)}</div>
            <div style="display:flex;justify-content:space-between" class="muted"><span><b class="amt" style="color:var(--text)">${fmt(cur)}</b> of ${fmt(g.target)}</span><span>${frac >= 1 ? '<span class="pos">Goal reached ✓</span>' : need ? `<span class="amt">${unit ? `${U.qty(need, 4)} ${U.esc(unit)}` : U.money(need, 0)}</span>/mo needed` : ''}</span></div>
          </div></div>`;
        }).join('')}</div>` : UI.card({ body: UI.empty('target', 'Set your first goal', 'Emergency fund, down payment, stack 1 BTC, pay off the truck — goals can track accounts, holdings and loans automatically.', UI.btn('New goal', 'add', { icon: 'plus', kind: 'primary' })) })}
        <div class="mt">${UI.card({ title: 'Financial independence (FIRE) calculator', sub: 'Pre-filled from your real data — adjust anything', actions: UI.btn('Reset', 'resetFire', { icon: 'refresh' }), body: '<div id="fire"></div>' })}</div>`;
      fire(root);
      UI.bind(root, { add: () => edit(null), edit: (d) => edit(S.get('goals', d.id)), resetFire: () => { V.fire = null; fire(root); } });
    },
  };
})(window.BLAM);
