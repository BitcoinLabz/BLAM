/* BLAM — Bills, paychecks & recurring automation */
'use strict';
(function (B) {
  const { U, F, S, UI, A } = B;

  const KIND = { expense: { label: 'Bill / expense', color: '#f45b72', icon: 'card' }, income: { label: 'Income / paycheck', color: '#2ecf8f', icon: 'coins' }, transfer: { label: 'Transfer / savings', color: '#5b9cff', icon: 'repeat' }, loan: { label: 'Loan payment (auto-amortizing)', color: '#8b5cf6', icon: 'loan' } };

  function amountOf(r) {
    if (r.kind === 'loan') { const l = S.get('loans', r.loanId); return l ? F.loanPayment(l) + U.num(l.escrow) + (r.includeExtra === false ? 0 : U.num(l.extraMonthly)) : 0; }
    return U.num(r.amount);
  }

  function edit(r, defaults = {}) {
    if (!S.activeAccounts().length) { UI.toast('Add an account first', 'warn'); return; }
    const isNew = !r;
    const accs = S.activeAccounts().map((a) => ({ value: a.id, label: a.name }));
    const cats = S.state.categories.map((c) => ({ value: c.name, label: `${c.group} › ${c.name}` }));
    UI.form({
      title: isNew ? 'New recurring item' : `Edit ${r.name}`, wide: true,
      intro: 'Recurring items power BLAM\'s automation: when <b>Auto-post</b> is on, the transaction is created for you on its due date and account balances update. Loan payments also split principal and interest and reduce the loan balance automatically.',
      fields: [
        { key: 'kind', label: 'Type', type: 'select', col: 3, options: Object.entries(KIND).map(([value, k]) => ({ value, label: k.label })) },
        { key: 'name', label: 'Name', col: 3, required: true, placeholder: 'e.g. Netflix, Paycheck, Rent' },
        { key: 'loanId', label: 'Loan', type: 'select', col: 3, show: (v) => v.kind === 'loan', options: [{ value: '', label: 'Select loan…' }, ...S.state.loans.map((l) => ({ value: l.id, label: `${l.name} (${U.money(F.loanPayment(l))}/mo P&I)` }))] },
        { key: 'includeExtra', label: 'Extra principal', type: 'checkbox', col: 3, checkLabel: "Include the loan's extra monthly payment", show: (v) => v.kind === 'loan', default: true },
        { key: 'amount', label: 'Amount', type: 'money', col: 2, show: (v) => v.kind !== 'loan' },
        { key: 'frequency', label: 'Frequency', type: 'select', col: 2, options: Object.entries(U.FREQ).map(([value, f]) => ({ value, label: f.label })) },
        { key: 'nextDate', label: 'Next date', type: 'date', col: 2, required: true },
        { key: 'accountId', label: (v) => 'Account', type: 'select', col: 3, options: accs },
        { key: 'toAccountId', label: 'To account', type: 'select', col: 3, show: (v) => v.kind === 'transfer', options: [{ value: '', label: '— external —' }, ...accs] },
        { key: 'category', label: 'Category', type: 'select', col: 3, show: (v) => v.kind !== 'loan', options: cats },
        { key: 'propertyId', label: 'Property (optional)', type: 'select', col: 3, show: (v) => v.kind !== 'loan', options: [{ value: '', label: '— none —' }, ...S.state.properties.map((p) => ({ value: p.id, label: p.name }))] },
        { key: 'endDate', label: 'End date (optional)', type: 'date', col: 3 },
        { key: 'autoPost', label: 'Automation', type: 'checkbox', col: 3, checkLabel: 'Auto-post on due date' },
        { key: 'paused', label: 'Paused', type: 'checkbox', col: 3, checkLabel: 'Temporarily paused' },
      ].map((f) => (typeof f.label === 'function' ? { ...f, label: 'Account' } : f)),
      values: r || { kind: 'expense', frequency: 'monthly', nextDate: U.today(), accountId: accs[0].value, autoPost: true, includeExtra: true, category: 'Subscriptions', ...defaults },
      onSave: (v) => {
        if (v.kind === 'loan' && !v.loanId) { UI.toast('Choose a loan', 'warn'); return false; }
        if (v.kind !== 'loan' && !U.num(v.amount)) { UI.toast('Enter an amount', 'warn'); return false; }
        v.anchorDay = U.parse(v.nextDate).getDate();
        S.upsert('recurring', v);
        UI.toast(isNew ? 'Recurring item added' : 'Saved');
        if (v.autoPost && v.nextDate <= U.today()) A.runRecurring();
      },
      onDelete: isNew ? null : () => S.remove('recurring', r.id),
    });
  }

  function postNow(r) {
    const msg = A.postRecurring(r, U.today());
    S.commit((s) => {
      const x = s.recurring.find((y) => y.id === r.id);
      x.lastPosted = U.today();
      if (x.nextDate <= U.addDays(U.today(), 10)) x.nextDate = U.nextOccurrence(x.nextDate, x.frequency, x.anchorDay);
    });
    S.log(`Manually posted: ${msg}`);
    UI.toast(msg || 'Posted');
  }

  B.views.recurring = {
    add: (d) => edit(null, d),
    edit,
    render(root) {
      const s = S.state;
      const list = [...s.recurring].sort((a, b) => (a.paused - b.paused) || (a.nextDate || '').localeCompare(b.nextDate || ''));
      const monthly = (k) => U.sum(list.filter((r) => r.kind === k && !r.paused), (r) => U.toMonthly(amountOf(r), r.frequency));
      const inc = monthly('income'), exp = monthly('expense') + monthly('loan'), xfer = monthly('transfer');
      const upcoming = A.upcoming(30);
      const autoCount = list.filter((r) => r.autoPost && !r.paused).length;

      root.innerHTML = `
        ${UI.pageHead('Bills & Recurring', 'Paychecks, bills, subscriptions, savings transfers and loan payments — automated.', UI.btn('Add recurring', 'add', { icon: 'plus', kind: 'primary' }))}
        <div class="grid g4">
          ${UI.kpi({ label: 'Recurring income / mo', icon: 'coins', accent: '#2ecf8f', value: U.m(inc, 0) })}
          ${UI.kpi({ label: 'Fixed bills & loans / mo', icon: 'card', accent: '#f45b72', value: U.m(exp, 0), sub: `${U.ms(exp * 12)} per year` })}
          ${UI.kpi({ label: 'Auto-saving / mo', icon: 'repeat', accent: '#5b9cff', value: U.m(xfer, 0) })}
          ${UI.kpi({ label: 'Left after fixed costs', icon: 'target', accent: '#f7931a', value: U.mc(inc - exp - xfer, 0), sub: `${autoCount} item${autoCount === 1 ? '' : 's'} on autopilot` })}
        </div>
        <div class="grid g-21 mt">
          ${UI.card({ title: 'All recurring items', cls: 'flush', body: list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Type</th><th>Frequency</th><th>Next</th><th class="r">Amount</th><th class="r">Monthly</th><th>Auto</th><th></th></tr></thead><tbody>
            ${list.map((r) => {
              const k = KIND[r.kind] || KIND.expense;
              const amt = amountOf(r);
              const acc = S.get('accounts', r.accountId);
              return `<tr class="click" data-act="edit" data-id="${r.id}" style="${r.paused ? 'opacity:.5' : ''}">
                <td><div class="asset-cell"><div class="asset-ic" style="background:${k.color}">${UI.icon(k.icon, 15)}</div><div><b>${U.esc(r.name)}</b><div class="sub">${acc ? U.esc(acc.name) : '<span class="neg">No account</span>'}${r.kind === 'transfer' && r.toAccountId ? ` → ${U.esc(S.get('accounts', r.toAccountId)?.name || '')}` : ''}</div></div></div></td>
                <td>${UI.tag(r.kind === 'loan' ? 'Loan' : k.label.split(' ')[0], k.color)}</td>
                <td>${U.FREQ[r.frequency]?.label || r.frequency}</td>
                <td class="nowrap">${r.paused ? '<span class="muted">Paused</span>' : `${U.fmtDate(r.nextDate, { month: 'short', day: 'numeric' })}<div class="sub">${U.relDays(r.nextDate)}</div>`}</td>
                <td class="r">${U.mc(r.kind === 'income' ? amt : -amt)}</td>
                <td class="r muted"><span class="amt">${U.money(U.toMonthly(amt, r.frequency), 0)}</span></td>
                <td>${r.autoPost ? `<span class="pos" title="Auto-posts">${UI.icon('bolt', 15)}</span>` : '<span class="faint">manual</span>'}</td>
                <td class="r"><div class="row-actions"><button class="btn sm" data-act="post" data-id="${r.id}">Post now</button></div></td></tr>`;
            }).join('')}</tbody></table></div>`
            : UI.empty('repeat', 'Automate your money', 'Add paychecks, rent, bills, subscriptions, loan payments and savings transfers. BLAM posts them automatically on schedule.', UI.btn('Add recurring', 'add', { icon: 'plus', kind: 'primary' })) })}
          ${UI.card({ title: 'Next 30 days', sub: upcoming.length ? `${U.money(U.sum(upcoming.filter((u) => u.amount < 0), (u) => -u.amount), 0)} going out · ${U.money(U.sum(upcoming.filter((u) => u.amount > 0), (u) => u.amount), 0)} coming in` : '', body: upcoming.length ? `<div class="list">${upcoming.map((u) => {
            const d = U.parse(u.date);
            return `<div class="li"><div class="date-pill"><small>${d.toLocaleDateString('en-US', { month: 'short' })}</small><b>${d.getDate()}</b></div><div class="li-m"><div class="li-t">${U.esc(u.name)}</div><div class="li-s">${U.relDays(u.date)}${u.auto ? ' · auto' : ''}</div></div><div class="li-r">${u.amount ? U.mc(u.amount, 0) : ''}</div></div>`;
          }).join('')}</div>` : '<p class="muted">Nothing due.</p>' })}
        </div>`;

      UI.bind(root, {
        add: () => edit(null),
        edit: (d, el, e) => { if (!e.target.closest('.row-actions')) edit(S.get('recurring', d.id)); },
        post: (d) => postNow(S.get('recurring', d.id)),
      });
    },
  };
})(window.BLAM);
