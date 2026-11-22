/* BLAM — Budgets, spending analysis & categories */
'use strict';
(function (B) {
  const { U, S, UI, Ch } = B;
  const V = B.views.budget = { month: null };

  function editCategory(c) {
    const isNew = !c;
    const groups = [...new Set(S.state.categories.map((x) => x.group))];
    UI.form({
      title: isNew ? 'New category' : `Edit category`,
      fields: [
        { key: 'name', label: 'Name', required: true, col: 3 },
        { key: 'group', label: 'Group', col: 3, list: groups, required: true },
        { key: 'type', label: 'Type', type: 'select', col: 3, options: [{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Transfer (excluded from totals)' }] },
        { key: 'budget', label: 'Monthly budget', type: 'money', col: 3, show: (v) => v.type === 'expense' },
      ],
      values: c || { type: 'expense', group: 'Other' },
      onSave: (v) => {
        if (S.state.categories.some((x) => x.name.toLowerCase() === v.name.trim().toLowerCase() && x.id !== v.id)) { UI.toast('A category with that name exists', 'warn'); return false; }
        const oldName = c?.name;
        v.name = v.name.trim();
        S.commit((s) => {
          if (isNew) s.categories.push({ ...v, id: U.uid(), budget: U.num(v.budget) });
          else {
            Object.assign(s.categories.find((x) => x.id === c.id), v, { budget: U.num(v.budget) });
            if (oldName !== v.name) {
              s.transactions.forEach((t) => { if (t.category === oldName) t.category = v.name; });
              s.recurring.forEach((r) => { if (r.category === oldName) r.category = v.name; });
              s.rules.forEach((r) => { if (r.category === oldName) r.category = v.name; });
            }
          }
        });
      },
      onDelete: isNew ? null : () => S.commit((s) => {
        s.categories = s.categories.filter((x) => x.id !== c.id);
        s.transactions.forEach((t) => { if (t.category === c.name) t.category = 'Miscellaneous'; });
      }),
    });
  }

  function autoBudget() {
    const months = [1, 2, 3].map((i) => U.shiftMonth(U.thisMonth(), -i));
    const flows = months.map((m) => S.monthFlow(m));
    let n = 0;
    S.commit((s) => {
      s.categories.filter((c) => c.type === 'expense').forEach((c) => {
        const avg = U.sum(flows, (f) => f.byCat[c.name] || 0) / 3;
        if (avg > 1) { c.budget = Math.ceil(avg / 10) * 10; n++; }
      });
    });
    UI.toast(`Set ${n} budgets from your 3-month average`);
  }

  V.render = (root) => {
    if (!V.month) V.month = U.thisMonth();
    const mk = V.month;
    const flow = S.monthFlow(mk);
    const expCats = S.state.categories.filter((c) => c.type === 'expense');
    const budgeted = U.sum(expCats, (c) => c.budget);
    const isCurrent = mk === U.thisMonth();
    const dim = new Date(+mk.slice(0, 4), +mk.slice(5, 7), 0).getDate();
    const dayN = isCurrent ? new Date().getDate() : dim;
    const groups = {};
    expCats.forEach((c) => { (groups[c.group] = groups[c.group] || []).push(c); });
    // uncategorized/unknown spending
    const known = new Set(expCats.map((c) => c.name));
    const unknown = Object.entries(flow.byCat).filter(([k, v]) => !known.has(k) && v > 0);

    const rows = Object.entries(groups).map(([g, cs]) => {
      const gSpent = U.sum(cs, (c) => flow.byCat[c.name] || 0);
      const gBud = U.sum(cs, (c) => c.budget);
      if (!gSpent && !gBud && !V.showAll) return '';
      return `<div class="budget-group">${U.esc(g)} <span class="muted" style="font-weight:500;letter-spacing:0;text-transform:none">· ${U.money(gSpent, 0)}${gBud ? ` of ${U.money(gBud, 0)}` : ''}</span></div>
        ${cs.filter((c) => V.showAll || c.budget || flow.byCat[c.name]).map((c) => {
          const spent = flow.byCat[c.name] || 0;
          const bud = U.num(c.budget);
          const left = bud - spent;
          const frac = bud ? spent / bud : 0;
          const col = !bud ? '#64748b' : frac > 1 ? null : frac > 0.85 ? '#f5b942' : '#2ecf8f';
          return `<div class="budget-row"><a href="#/transactions?category=${encodeURIComponent(c.name)}&month=${mk}" style="color:var(--text);text-decoration:none">${U.esc(c.name)}</a>
            <div>${Ch.progress(bud ? frac : 0, col)}</div>
            <div class="r"><input class="input budget-in" data-id="${c.id}" type="number" step="10" value="${bud || ''}" placeholder="—" style="padding:5px 8px;text-align:right"></div>
            <div class="r"><b class="amt">${U.money(spent, 0)}</b></div>
            <div class="r ${bud ? (left < 0 ? 'neg' : 'pos') : 'muted'}"><span class="amt">${bud ? U.money(left, 0) : '—'}</span></div>
            <div><button class="icon-btn" data-act="editCat" data-id="${c.id}">${UI.icon('edit', 14)}</button></div></div>`;
        }).join('')}`;
    }).join('');

    root.innerHTML = `
      ${UI.pageHead('Budget & Spending', 'Plan every dollar. Click any category to see its transactions.', `
        <div class="month-nav"><button class="icon-btn" data-act="prev">${UI.icon('chevl', 16)}</button><b>${U.monthLabel(mk, true)}</b><button class="icon-btn" data-act="next">${UI.icon('chevr', 16)}</button></div>
        ${UI.btn('Auto-budget', 'auto', { icon: 'bolt' })}${UI.btn('Category', 'addCat', { icon: 'plus', kind: 'primary' })}`)}
      <div class="grid g5">
        ${UI.kpi({ label: 'Income', value: U.m(flow.income, 0), accent: '#2ecf8f' })}
        ${UI.kpi({ label: 'Spent', value: U.m(flow.expense, 0), accent: '#f45b72', sub: isCurrent ? `${U.money(flow.expense / Math.max(1, dayN), 0)}/day so far` : '' })}
        ${UI.kpi({ label: 'Budgeted', value: U.m(budgeted, 0), accent: '#8b5cf6', sub: budgeted ? `${U.pct(flow.expense / budgeted, 0)} used · ${U.pct(dayN / dim, 0)} of month gone` : 'Use Auto-budget to start' })}
        ${UI.kpi({ label: 'Left to spend', value: budgeted ? U.mc(budgeted - flow.expense, 0) : '—', accent: '#14b8a6', sub: budgeted && isCurrent && dim > dayN ? `${U.money(Math.max(0, budgeted - flow.expense) / (dim - dayN), 0)}/day for ${dim - dayN} days` : '' })}
        ${UI.kpi({ label: 'Saved', value: U.mc(flow.net, 0), accent: '#f7931a', sub: flow.income ? `${U.pct(flow.savingsRate)} savings rate` : '' })}
      </div>
      <div class="grid g2 mt">
        ${UI.card({ title: 'Where it went', sub: U.monthLabel(mk, true), body: '<div id="cat-donut"></div>' })}
        ${UI.card({ title: 'Spending pace', sub: 'Cumulative spending vs. budget pace', body: '<div id="pace"></div>' })}
      </div>
      <div class="mt">${UI.card({ title: 'Category budgets', sub: 'Type a number to set a monthly budget', actions: `<label class="switch"><input type="checkbox" id="show-all" ${V.showAll ? 'checked' : ''}><span></span><em>Show all categories</em></label>`,
        body: `<div class="budget-row head"><div>Category</div><div>Progress</div><div class="r">Budget</div><div class="r">Spent</div><div class="r">Remaining</div><div></div></div>${rows || '<p class="muted">No spending or budgets this month.</p>'}
        ${unknown.length ? `<div class="budget-group">Other</div>${unknown.map(([k, v]) => `<div class="budget-row"><span>${U.esc(k)}</span><div></div><div></div><div class="r"><b class="amt">${U.money(v, 0)}</b></div><div></div><div></div></div>`).join('')}` : ''}` })}</div>
      <div class="mt">${UI.card({ title: '12-month spending by group', body: '<div id="trend"></div>' })}</div>`;

    // charts
    const groupColor = {};
    Object.keys(groups).forEach((g, i) => { groupColor[g] = Ch.PALETTE[i % Ch.PALETTE.length]; });
    Ch.donut(root.querySelector('#cat-donut'), { items: Object.entries(flow.byCat).filter(([, v]) => v > 0).map(([k, v], i) => ({ label: k, value: v, color: Ch.PALETTE[i % Ch.PALETTE.length] })), centerBottom: 'Spent', empty: 'No spending this month' });
    const tx = S.txnsInMonth(mk).filter((t) => S.categoryType(t.category) !== 'transfer' && S.categoryType(t.category) !== 'income' && !(S.categoryType(t.category) == null && t.amount > 0));
    const byDay = Array(dim + 1).fill(0);
    tx.forEach((t) => { byDay[U.parse(t.date).getDate()] -= t.amount; });
    let cum = 0; const actual = [];
    for (let d = 1; d <= dayN; d++) { cum += byDay[d]; actual.push({ x: `${mk}-${String(d).padStart(2, '0')}`, y: cum }); }
    const series = [{ name: 'Actual', color: '#f7931a', data: actual }];
    if (budgeted) series.push({ name: 'Budget pace', color: '#64748b', dashed: true, area: false, data: [{ x: `${mk}-01`, y: budgeted / dim }, { x: `${mk}-${dim}`, y: budgeted }] });
    Ch.line(root.querySelector('#pace'), { series, area: true, height: 230, yMin: 0 });
    const months = U.monthsRange(U.thisMonth(), 12);
    const mflows = months.map((m) => S.monthFlow(m));
    Ch.bar(root.querySelector('#trend'), {
      labels: months.map(U.monthShort), tipLabels: months.map((m) => U.monthLabel(m, true)), stacked: true, height: 260,
      series: Object.entries(groups).map(([g, cs]) => ({ name: g, color: groupColor[g], values: mflows.map((f) => U.sum(cs, (c) => f.byCat[c.name] || 0)) })).filter((s) => s.values.some((v) => v > 0)),
      onClick: (i) => { V.month = months[i]; B.rerender(); },
    });

    root.querySelectorAll('.budget-in').forEach((inp) => inp.addEventListener('change', () => {
      S.commit((s) => { s.categories.find((c) => c.id === inp.dataset.id).budget = U.num(inp.value); });
    }));
    root.querySelector('#show-all').addEventListener('change', (e) => { V.showAll = e.target.checked; B.rerender(); });
    UI.bind(root, {
      prev: () => { V.month = U.shiftMonth(mk, -1); B.rerender(); },
      next: () => { V.month = U.shiftMonth(mk, 1); B.rerender(); },
      auto: autoBudget,
      addCat: () => editCategory(null),
      editCat: (d) => editCategory(S.get('categories', d.id)),
    });
  };
  V.editCategory = editCategory;
})(window.BLAM);
