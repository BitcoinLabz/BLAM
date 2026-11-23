/* BLAM — Banks, credit cards & investment accounts */
'use strict';
(function (B) {
  const { U, F, S, UI, Ch } = B;

  const fields = () => [
    { key: 'name', label: 'Account name', required: true, col: 3, placeholder: 'e.g. Everyday Checking' },
    { key: 'institution', label: 'Institution', col: 3, placeholder: 'e.g. Chase', list: ['Chase', 'Bank of America', 'Wells Fargo', 'Capital One', 'Ally Bank', 'American Express', 'Discover', 'Citi', 'Fidelity', 'Vanguard', 'Charles Schwab', 'Robinhood', 'Coinbase', 'Crypto.com', 'Huntington', 'Fifth Third', 'Lake Michigan CU', 'PNC', 'US Bank', 'SoFi', 'Marcus'] },
    { key: 'type', label: 'Type', type: 'select', col: 3, options: UI.objOptions(S.ACCOUNT_TYPES) },
    { key: 'balance', label: 'Current balance', type: 'money', col: 3, required: true, help: 'For credit cards, enter the amount you owe.' },
    { key: 'apy', label: 'APY (interest earned)', type: 'percent', col: 2, show: (v) => S.ACCOUNT_TYPES[v.type]?.kind === 'cash' },
    { key: 'creditLimit', label: 'Credit limit', type: 'money', col: 2, show: (v) => S.ACCOUNT_TYPES[v.type]?.kind === 'credit' },
    { key: 'apr', label: 'APR', type: 'percent', col: 2, show: (v) => S.ACCOUNT_TYPES[v.type]?.kind === 'credit' },
    { key: 'dueDay', label: 'Payment due day', type: 'number', col: 2, min: 1, show: (v) => S.ACCOUNT_TYPES[v.type]?.kind === 'credit', help: 'Day of month (1–28)' },
    { key: 'minPayment', label: 'Minimum payment', type: 'money', col: 2, show: (v) => S.ACCOUNT_TYPES[v.type]?.kind === 'credit' },
    { key: 'last4', label: 'Last 4 digits', col: 2, placeholder: 'optional' },
    { key: 'color', label: 'Color', type: 'color', col: 2 },
    { key: 'notes', label: 'Notes', type: 'textarea', col: 6, rows: 2 },
    { key: 'archived', label: 'Archived', type: 'checkbox', checkLabel: 'Hide this account and exclude from totals', col: 6 },
  ];

  function edit(a) {
    const isNew = !a;
    UI.form({
      title: isNew ? 'Add bank account or card' : `Edit ${a.name}`,
      wide: true,
      fields: fields(),
      values: a || { type: 'checking', color: B.Ch.PALETTE[S.state.accounts.length % 12], balance: '' },
      onSave: (v) => {
        v.balance = U.num(v.balance);
        S.upsert('accounts', v);
        UI.toast(isNew ? 'Account added' : 'Account saved');
      },
      onDelete: isNew ? null : () => {
        const n = S.state.transactions.filter((t) => t.accountId === a.id).length;
        S.commit((s) => {
          s.accounts = s.accounts.filter((x) => x.id !== a.id);
          s.transactions = s.transactions.filter((t) => t.accountId !== a.id);
          // Don't leave automation or holdings pointing at an account that no longer exists.
          s.recurring.forEach((r) => {
            if (r.accountId === a.id) { r.accountId = ''; r.autoPost = false; }
            if (r.toAccountId === a.id) r.toAccountId = '';
          });
          s.holdings.forEach((h) => { if (h.accountId === a.id) h.accountId = ''; });
        });
        UI.toast(`Deleted account${n ? ` and ${n} transactions` : ''}`);
      },
    });
  }

  function reconcile(a) {
    UI.form({
      title: `Update balance · ${a.name}`,
      intro: 'Enter the balance shown by your bank. BLAM can record the difference as an adjustment transaction so your history stays accurate.',
      fields: [
        { key: 'balance', label: S.accountKind(a) === 'credit' ? 'Amount owed' : 'Actual balance', type: 'money', required: true, col: 3 },
        { key: 'adjust', label: 'Record adjustment', type: 'checkbox', checkLabel: 'Create adjustment transaction', col: 3 },
      ],
      values: { balance: a.balance, adjust: S.accountKind(a) !== 'invest' },
      submitLabel: 'Update',
      onSave: (v) => {
        const diff = U.num(v.balance) - U.num(a.balance);
        if (Math.abs(diff) < 0.005) return;
        if (v.adjust) {
          const amount = S.accountKind(a) === 'credit' ? -diff : diff;
          S.addTransaction({ date: U.today(), accountId: a.id, payee: 'Balance adjustment', amount, category: 'Transfer', note: 'Reconciliation' });
        } else {
          S.commit((s) => { s.accounts.find((x) => x.id === a.id).balance = U.num(v.balance); });
        }
        UI.toast('Balance updated');
      },
    });
  }

  function detail(a) {
    const tx = S.state.transactions.filter((t) => t.accountId === a.id).sort((x, y) => y.date.localeCompare(x.date));
    const months = U.monthsRange(U.thisMonth(), 6);
    const flows = months.map((m) => S.flow(tx.filter((t) => U.monthKey(t.date) === m)));
    const kind = S.accountKind(a);
    const m = UI.modal({
      title: `${a.name}${a.last4 ? ` ···· ${a.last4}` : ''}`, xwide: true,
      body: `<div class="grid g4">
        ${UI.kpi({ label: kind === 'credit' ? 'Owed' : 'Balance', value: U.m(a.balance), accent: a.color })}
        ${kind === 'credit' ? UI.kpi({ label: 'Utilization', value: a.creditLimit ? U.pct(a.balance / a.creditLimit) : '—', sub: a.creditLimit ? `${U.m(a.creditLimit - a.balance, 0)} available` : '' }) : UI.kpi({ label: 'APY', value: a.apy ? `${a.apy}%` : '—', sub: a.apy ? `≈ ${U.m(a.balance * a.apy / 100 / 12)}/mo interest` : '' })}
        ${UI.kpi({ label: 'In this month', value: U.m(flows[5].income, 0) })}
        ${UI.kpi({ label: 'Out this month', value: U.m(flows[5].expense, 0) })}
      </div>
      <div class="card mt"><div class="card-b"><div id="acc-flow"></div></div></div>
      <div class="card mt flush"><div class="card-b tbl-wrap" style="max-height:360px;overflow:auto">${tx.length ? `<table class="tbl"><thead><tr><th>Date</th><th>Payee</th><th>Category</th><th class="r">Amount</th></tr></thead><tbody>${tx.slice(0, 300).map((t) => `<tr><td class="nowrap">${U.fmtDate(t.date)}</td><td>${U.esc(t.payee)}${t.note ? `<div class="sub">${U.esc(t.note)}</div>` : ''}</td><td>${UI.tag(t.category || 'Uncategorized')}</td><td class="r">${U.mc(t.amount)}</td></tr>`).join('')}</tbody></table>` : UI.empty('list', 'No transactions', 'Add or import transactions for this account.')}</div></div>`,
      footer: `<button class="btn" data-x="rec">${UI.icon('check', 15)} Update balance</button><button class="btn" data-x="add">${UI.icon('plus', 15)} Transaction</button><button class="btn" data-x="imp">${UI.icon('upload', 15)} Import bank file</button><span class="grow"></span><button class="btn ghost" data-x="edit">${UI.icon('edit', 15)} Edit account</button>`,
    });
    Ch.bar(m.body.querySelector('#acc-flow'), { labels: months.map(U.monthShort), series: [{ name: 'In', color: '#2ecf8f', values: flows.map((f) => f.income) }, { name: 'Out', color: '#f45b72', values: flows.map((f) => f.expense) }], height: 180 });
    m.foot.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return;
      m.close();
      setTimeout(() => {
        if (x === 'rec') reconcile(a);
        if (x === 'add') B.views.transactions.add({ accountId: a.id });
        if (x === 'imp') B.views.transactions.importCsv(a.id);
        if (x === 'edit') edit(a);
      }, 200);
    });
  }

  function table(list, kind) {
    if (!list.length) return '';
    const head = kind === 'credit'
      ? '<th>Card</th><th class="r">Owed</th><th style="width:22%">Utilization</th><th class="r">APR</th><th class="r">Interest / mo</th><th class="r">Due</th><th></th>'
      : `<th>Account</th><th>Type</th>${kind === 'cash' ? '<th class="r">APY</th><th class="r">Interest / mo</th>' : ''}<th class="r">Balance</th><th></th>`;
    const rows = list.map((a) => {
      const name = `<div class="asset-cell"><div class="asset-ic" style="background:${a.color || '#64748b'}">${UI.icon(kind === 'credit' ? 'card' : 'bank', 16)}</div><div><b>${U.esc(a.name)}</b>${a.balanceSyncedAt ? ` <span class="tag" style="--tc:#14b8a6" title="Balance set from your bank's download file">bank ${U.esc(U.fmtDate(a.balanceSyncedAt, { month: 'short', day: 'numeric' }))}</span>` : ''}<div class="sub">${U.esc(a.institution || '')}${a.last4 ? ` ···· ${U.esc(a.last4)}` : ''}</div></div></div>`;
      const acts = `<td class="r"><div class="row-actions"><button class="icon-btn" data-act="rec" data-id="${a.id}" title="Update balance">${UI.icon('check', 15)}</button><button class="icon-btn" data-act="edit" data-id="${a.id}" title="Edit">${UI.icon('edit', 15)}</button></div></td>`;
      if (kind === 'credit') {
        const util = U.num(a.creditLimit) ? U.num(a.balance) / U.num(a.creditLimit) : 0;
        const col = util > 0.5 ? '#f45b72' : util > 0.3 ? '#f5b942' : '#2ecf8f';
        return `<tr class="click" data-act="open" data-id="${a.id}"><td>${name}</td><td class="r"><b>${U.m(a.balance)}</b></td>
          <td>${a.creditLimit ? `${Ch.progress(util, col, { small: true })}<div class="sub">${U.pct(util)} of ${U.money(a.creditLimit, 0)}</div>` : '<span class="muted">—</span>'}</td>
          <td class="r">${a.apr ? `${a.apr}%` : '—'}</td><td class="r ${a.apr && a.balance > 0 ? 'neg' : ''}">${U.m(U.num(a.balance) * U.num(a.apr) / 100 / 12)}</td>
          <td class="r">${a.dueDay ? `${ordinal(a.dueDay)}` : '—'}</td>${acts}</tr>`;
      }
      return `<tr class="click" data-act="open" data-id="${a.id}"><td>${name}</td><td>${UI.tag(S.ACCOUNT_TYPES[a.type]?.label || a.type, a.color)}</td>
        ${kind === 'cash' ? `<td class="r">${a.apy ? `${a.apy}%` : '—'}</td><td class="r pos">${a.apy ? U.m(U.num(a.balance) * a.apy / 100 / 12) : '—'}</td>` : ''}
        <td class="r"><b>${U.m(a.balance)}</b></td>${acts}</tr>`;
    }).join('');
    const total = U.sum(list, (a) => a.balance);
    const span = kind === 'credit' ? 1 : kind === 'cash' ? 4 : 2;
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td ${kind === 'credit' ? '' : `colspan="${span}"`}>Total</td><td class="r">${U.m(total)}</td>${kind === 'credit' ? '<td colspan="5"></td>' : '<td></td>'}</tr></tfoot></table></div>`;
  }
  const ordinal = (n) => { n = +n; const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

  B.views.accounts = {
    add: () => edit(null),
    edit,
    render(root) {
      const acc = S.activeAccounts();
      const cash = acc.filter((a) => S.accountKind(a) === 'cash');
      const credit = acc.filter((a) => S.accountKind(a) === 'credit');
      const inv = acc.filter((a) => S.accountKind(a) === 'invest');
      const archived = S.state.accounts.filter((a) => a.archived);
      const limit = U.sum(credit, (a) => a.creditLimit);
      const owed = U.sum(credit, (a) => a.balance);
      const interest = U.sum(credit, (a) => U.num(a.balance) * U.num(a.apr) / 100 / 12);
      const earned = U.sum(cash, (a) => U.num(a.balance) * U.num(a.apy) / 100 / 12);

      root.innerHTML = `
        ${UI.pageHead('Banks & Cards', 'Every checking, savings, credit card and investment account in one place.', `${UI.btn('Import bank file', 'import', { icon: 'upload' })}${UI.btn('Add account', 'add', { icon: 'plus', kind: 'primary' })}`)}
        ${acc.length ? `
        <div class="grid g4">
          ${UI.kpi({ label: 'Cash & savings', icon: 'bank', accent: '#2ecf8f', value: U.m(U.sum(cash, (a) => a.balance), 0), sub: earned ? `Earning ≈ ${U.m(earned)}/mo interest` : `${cash.length} accounts` })}
          ${UI.kpi({ label: 'Credit card debt', icon: 'card', accent: '#f45b72', value: U.m(owed, 0), sub: interest ? `<span class="neg">Costing ≈ ${U.money(interest)}/mo if carried</span>` : `${credit.length} cards` })}
          ${UI.kpi({ label: 'Credit utilization', icon: 'chart', accent: limit && owed / limit > 0.3 ? '#f5b942' : '#14b8a6', value: limit ? U.pct(owed / limit) : '—', sub: limit ? `${U.ms(limit - owed)} available of ${U.ms(limit)}` : 'Add credit limits' })}
          ${UI.kpi({ label: 'Retirement & brokerage', icon: 'networth', accent: '#6366f1', value: U.m(U.sum(inv, (a) => a.balance), 0), sub: `${inv.length} accounts` })}
        </div>
        ${cash.length ? `<div class="mt">${UI.card({ title: 'Checking & savings', cls: 'flush', body: table(cash, 'cash') })}</div>` : ''}
        ${credit.length ? `<div class="mt">${UI.card({ title: 'Credit cards', sub: 'Keep utilization under 30% for the best credit score impact', cls: 'flush', body: table(credit, 'credit') })}</div>` : ''}
        ${inv.length ? `<div class="mt">${UI.card({ title: 'Investment & retirement accounts', sub: 'Balances you track manually (cash or total value). Individual positions live in Crypto & Stocks.', cls: 'flush', body: table(inv, 'invest') })}</div>` : ''}
        ${archived.length ? `<p class="muted mt">${archived.length} archived account${archived.length > 1 ? 's' : ''}: ${archived.map((a) => `<a href="#" data-act="edit" data-id="${a.id}">${U.esc(a.name)}</a>`).join(', ')}</p>` : ''}
        ` : UI.card({ body: UI.empty('bank', 'Add your first account', 'Add checking, savings, credit cards, 401(k)s and exchanges, or import your bank\'s free download file (OFX / QFX / QBO / CSV). BLAM can create the account for you.', `${UI.btn('Import bank file', 'import', { icon: 'upload' })} ${UI.btn('Add account', 'add', { icon: 'plus', kind: 'primary' })}`) })}`;

      UI.bind(root, {
        add: () => edit(null),
        import: () => B.views.transactions.importCsv(),
        edit: (d) => edit(S.get('accounts', d.id)),
        rec: (d) => reconcile(S.get('accounts', d.id)),
        open: (d, el, e) => { if (!e.target.closest('.row-actions')) detail(S.get('accounts', d.id)); },
      });
    },
  };
})(window.BLAM);
