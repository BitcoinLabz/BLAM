/* BLAM — Transactions ledger, CSV import, bulk edit */
'use strict';
(function (B) {
  const { U, S, UI } = B;
  const V = { month: null, account: '', category: '', q: '', type: '', selected: new Set(), limit: 200 };

  const catOptions = (blank) => {
    const groups = {};
    S.state.categories.forEach((c) => { (groups[c.group] = groups[c.group] || []).push(c); });
    const opts = blank ? [{ value: '', label: blank }] : [];
    Object.entries(groups).forEach(([g, cs]) => cs.forEach((c) => opts.push({ value: c.name, label: `${g} › ${c.name}` })));
    return opts;
  };
  const accOptions = (blank) => [...(blank ? [{ value: '', label: blank }] : []), ...S.activeAccounts().map((a) => ({ value: a.id, label: `${a.name}${a.institution ? ` · ${a.institution}` : ''}` }))];

  function edit(t, defaults = {}) {
    if (!S.activeAccounts().length) { UI.toast('Add an account first', 'warn'); B.views.accounts.add(); return; }
    const isNew = !t?.id;
    const payees = [...new Set(S.state.transactions.map((x) => x.payee).filter(Boolean))].slice(-400);
    const v = isNew
      ? { date: U.today(), accountId: V.account || S.activeAccounts()[0].id, direction: 'out', amount: '', ...defaults }
      : { ...t, direction: t.amount >= 0 ? 'in' : 'out', amount: Math.abs(t.amount) };
    UI.form({
      title: isNew ? 'New transaction' : 'Edit transaction',
      wide: true,
      fields: [
        { key: 'direction', label: 'Type', type: 'select', col: 2, options: [{ value: 'out', label: 'Money out (expense)' }, { value: 'in', label: 'Money in (income / refund)' }] },
        { key: 'amount', label: 'Amount', type: 'money', col: 2, required: true },
        { key: 'date', label: 'Date', type: 'date', col: 2, required: true },
        { key: 'payee', label: 'Payee / description', col: 3, required: true, list: payees,
          onChange: (vals, form) => { const c = S.autoCategory(vals.payee); if (c) form.querySelector('[data-k="category"]').value = c; } },
        { key: 'accountId', label: 'Account', type: 'select', col: 3, options: accOptions() },
        { key: 'category', label: 'Category', type: 'select', col: 3, options: catOptions('Auto-detect') },
        { key: 'tags', label: 'Tags', col: 3, placeholder: 'tax-deductible, business…' },
        { key: 'note', label: 'Note', type: 'textarea', rows: 2, col: 6 },
        { key: 'makeRule', label: 'Learn', type: 'checkbox', checkLabel: 'Always use this category for this payee', col: 6 },
      ],
      values: v,
      onSave: (vals) => {
        const amount = Math.abs(U.num(vals.amount)) * (vals.direction === 'in' ? 1 : -1);
        const rec = { id: t?.id, date: vals.date, accountId: vals.accountId, payee: vals.payee.trim(), amount, category: vals.category || S.autoCategory(vals.payee) || (amount > 0 ? 'Other Income' : 'Miscellaneous'), note: vals.note, tags: vals.tags };
        if (vals.makeRule && rec.category && !S.state.rules.some((r) => r.pattern.toLowerCase() === rec.payee.toLowerCase())) {
          S.state.rules.push({ id: U.uid(), pattern: rec.payee, matchType: 'contains', category: rec.category });
        }
        if (isNew) S.addTransaction(rec); else S.updateTransaction(rec);
        UI.toast(isNew ? 'Transaction added' : 'Transaction updated');
      },
      onDelete: isNew ? null : () => { S.deleteTransaction(t.id); UI.toast('Transaction deleted'); },
    });
  }

  // ------------------------------------------------------------------ CSV import
  function guess(headers, patterns) {
    const i = headers.findIndex((h) => patterns.some((p) => p.test(h)));
    return i >= 0 ? String(i) : '';
  }

  async function importCsv(accountId) {
    if (!S.activeAccounts().length) { UI.toast('Add an account first', 'warn'); return; }
    const file = await U.openFile('.csv,.txt');
    if (!file) return;
    const rows = U.csvParse(file.content);
    if (rows.length < 2) { UI.toast('That file has no rows', 'error'); return; }
    const headers = rows[0].map((h) => h.trim());
    const data = rows.slice(1);
    const colOpts = [{ value: '', label: '— none —' }, ...headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }))];
    const map = {
      accountId: accountId || V.account || S.activeAccounts()[0].id,
      date: guess(headers, [/^date$/i, /posted|post date|transaction date|date/i]),
      payee: guess(headers, [/^description$/i, /payee|merchant|description|name|memo/i]),
      amount: guess(headers, [/^amount$/i, /amount/i]),
      debit: guess(headers, [/debit|withdraw/i]),
      credit: guess(headers, [/credit|deposit/i]),
      category: guess(headers, [/category/i]),
      flip: false, skipDupes: true,
    };
    if (map.debit && map.credit) map.amount = map.amount === map.debit || map.amount === map.credit ? '' : map.amount;

    const m = UI.modal({
      title: `Import ${file.name}`, xwide: true,
      body: `<div class="form-intro">Map the columns from your bank's CSV export. BLAM auto-categorizes using your rules and smart payee detection, and skips duplicates.</div>
        <div class="mapping-grid" id="map"></div><div class="preview-tbl" id="prev"></div>`,
      footer: `<span class="muted" id="imp-count"></span><span class="grow"></span><button class="btn ghost" data-c>Cancel</button><button class="btn primary" data-go>Import</button>`,
    });
    const sel = (k, label, opts) => `<div class="field"><label>${label}</label><select data-m="${k}">${opts.map((o) => `<option value="${U.esc(o.value)}" ${String(map[k]) === String(o.value) ? 'selected' : ''}>${U.esc(o.label)}</option>`).join('')}</select></div>`;
    m.body.querySelector('#map').innerHTML = [
      sel('accountId', 'Into account', accOptions()),
      sel('date', 'Date column', colOpts), sel('payee', 'Description column', colOpts),
      sel('amount', 'Amount column (signed)', colOpts), sel('debit', 'or Debit column', colOpts), sel('credit', 'or Credit column', colOpts),
      sel('category', 'Category column (optional)', colOpts),
      `<div class="field"><label>Options</label><label class="switch"><input type="checkbox" data-m="flip"><span></span><em>Flip signs</em></label><label class="switch"><input type="checkbox" data-m="skipDupes" checked><span></span><em>Skip duplicates</em></label></div>`,
    ].join('');

    const parse = () => {
      const out = [];
      for (const r of data) {
        const date = U.parseAnyDate(r[+map.date]);
        if (!date || map.date === '') continue;
        let amt = 0;
        if (map.amount !== '') amt = U.num(String(r[+map.amount]).replace(/[()]/g, (c) => (c === '(' ? '-' : '')));
        else amt = U.num(r[+map.credit]) - Math.abs(U.num(r[+map.debit]));
        if (map.flip) amt = -amt;
        if (!amt) continue;
        const payee = String(r[+map.payee] ?? '').replace(/\s+/g, ' ').trim() || 'Imported';
        let category = map.category !== '' ? String(r[+map.category] || '').trim() : '';
        if (category && !S.category(category)) category = '';
        out.push({ date, payee, amount: U.round(amt), category: category || S.autoCategory(payee) || '' });
      }
      return out;
    };
    const isDupe = (t) => S.state.transactions.some((x) => x.accountId === map.accountId && x.date === t.date && Math.abs(x.amount - t.amount) < 0.005 && (x.payee || '').toLowerCase() === t.payee.toLowerCase());
    const refresh = () => {
      const p = parse();
      const fresh = map.skipDupes ? p.filter((t) => !isDupe(t)) : p;
      m.foot.querySelector('#imp-count').textContent = `${fresh.length} to import${p.length - fresh.length ? ` · ${p.length - fresh.length} duplicates skipped` : ''}`;
      m.body.querySelector('#prev').innerHTML = `<table class="tbl"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="r">Amount</th></tr></thead><tbody>${fresh.slice(0, 12).map((t) => `<tr><td>${U.fmtDate(t.date)}</td><td>${U.esc(t.payee)}</td><td>${t.category ? UI.tag(t.category) : '<span class="muted">auto</span>'}</td><td class="r">${U.mc(t.amount)}</td></tr>`).join('')}</tbody></table>`;
      return fresh;
    };
    m.body.querySelector('#map').addEventListener('change', (e) => {
      const k = e.target.dataset.m; if (!k) return;
      map[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      refresh();
    });
    refresh();
    m.foot.querySelector('[data-c]').onclick = m.close;
    m.foot.querySelector('[data-go]').onclick = () => {
      const fresh = refresh();
      fresh.forEach((t) => S.addTransaction({ ...t, accountId: map.accountId, imported: true }, { silent: true }));
      S.commit(() => {});
      S.log(`Imported ${fresh.length} transactions from ${file.name}`, 'info');
      UI.toast(`Imported ${fresh.length} transactions`);
      m.close();
    };
  }

  function exportCsv(list) {
    const acc = Object.fromEntries(S.state.accounts.map((a) => [a.id, a.name]));
    const rows = [['Date', 'Account', 'Payee', 'Category', 'Amount', 'Note', 'Tags'], ...list.map((t) => [t.date, acc[t.accountId] || '', t.payee, t.category, t.amount, t.note || '', t.tags || ''])];
    U.download(`blam-transactions-${U.today()}.csv`, U.toCsv(rows), [{ name: 'CSV', extensions: ['csv'] }]).then((p) => p && UI.toast('Exported'));
  }

  function filtered() {
    const q = V.q.toLowerCase();
    return S.state.transactions.filter((t) =>
      (!V.month || U.monthKey(t.date) === V.month)
      && (!V.account || t.accountId === V.account)
      && (!V.category || t.category === V.category)
      && (!V.type || (V.type === 'in' ? t.amount > 0 : t.amount < 0))
      && (!q || `${t.payee} ${t.note || ''} ${t.category} ${t.tags || ''} ${t.amount}`.toLowerCase().includes(q))
    ).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  B.views.transactions = {
    add: (defaults) => edit(null, defaults),
    edit,
    importCsv,
    render(root, params) {
      if (V.month === null) V.month = U.thisMonth();
      if (params.category || params.account) {
        V.category = params.category || ''; V.account = params.account || ''; V.month = params.month ?? V.month;
        history.replaceState(null, '', '#/transactions');
      }
      const list = filtered();
      const flow = S.flow(list);
      const accs = Object.fromEntries(S.state.accounts.map((a) => [a.id, a]));
      const shown = list.slice(0, V.limit);
      V.selected = new Set([...V.selected].filter((id) => list.some((t) => t.id === id)));

      root.innerHTML = `
        ${UI.pageHead('Transactions', 'Every dollar in and out across all banks and cards.', `${UI.btn('Export', 'export', { icon: 'download' })}${UI.btn('Import CSV', 'import', { icon: 'upload' })}${UI.btn('Add transaction', 'add', { icon: 'plus', kind: 'primary' })}`)}
        <div class="toolbar">
          <div class="month-nav"><button class="icon-btn" data-act="prev">${UI.icon('chevl', 16)}</button><b>${V.month ? U.monthLabel(V.month, true) : 'All time'}</b><button class="icon-btn" data-act="next">${UI.icon('chevr', 16)}</button></div>
          <button class="btn sm ${V.month ? 'ghost' : ''}" data-act="all">All time</button>
          <div class="search-box">${UI.icon('search', 15)}<input class="input" id="q" placeholder="Search payee, note, amount…" value="${U.esc(V.q)}"></div>
          <select class="input" id="f-acc">${accOptions('All accounts').map((o) => `<option value="${o.value}" ${o.value === V.account ? 'selected' : ''}>${U.esc(o.label)}</option>`).join('')}</select>
          <select class="input" id="f-cat">${[{ value: '', label: 'All categories' }, ...S.state.categories.map((c) => ({ value: c.name, label: c.name }))].map((o) => `<option value="${U.esc(o.value)}" ${o.value === V.category ? 'selected' : ''}>${U.esc(o.label)}</option>`).join('')}</select>
          <div class="seg" id="f-type">${[['', 'All'], ['in', 'In'], ['out', 'Out']].map(([k, l]) => `<button data-t="${k}" class="${V.type === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        </div>
        <div class="grid g4">
          ${UI.kpi({ label: 'Income', value: U.m(flow.income), accent: '#2ecf8f' })}
          ${UI.kpi({ label: 'Spending', value: U.m(flow.expense), accent: '#f45b72' })}
          ${UI.kpi({ label: 'Net', value: U.mc(flow.net), accent: '#f7931a' })}
          ${UI.kpi({ label: 'Transactions', value: list.length.toLocaleString(), sub: `${list.filter((t) => S.categoryType(t.category) === 'transfer').length} transfers (excluded from totals)` })}
        </div>
        ${V.selected.size ? `<div class="callout info mt">${UI.icon('info')}<div style="display:flex;gap:10px;align-items:center;flex:1"><b>${V.selected.size} selected</b><select class="input" id="bulk-cat" style="width:240px">${catOptions('Set category…').map((o) => `<option value="${U.esc(o.value)}">${U.esc(o.label)}</option>`).join('')}</select><span class="grow"></span><button class="btn sm danger" data-act="bulkDel">${UI.icon('trash', 14)} Delete</button><button class="btn sm ghost" data-act="clearSel">Clear</button></div></div>` : ''}
        <div class="card flush mt"><div class="card-b tbl-wrap">
          ${list.length ? `<table class="tbl"><thead><tr><th style="width:30px"><input type="checkbox" id="sel-all" ${V.selected.size && V.selected.size === shown.length ? 'checked' : ''}></th><th>Date</th><th>Payee</th><th>Category</th><th>Account</th><th class="r">Amount</th><th></th></tr></thead><tbody>
          ${shown.map((t) => {
            const a = accs[t.accountId];
            return `<tr class="click" data-act="edit" data-id="${t.id}"><td><input type="checkbox" class="sel" data-id="${t.id}" ${V.selected.has(t.id) ? 'checked' : ''}></td>
              <td class="nowrap">${U.fmtDate(t.date)}</td>
              <td><b>${U.esc(t.payee)}</b>${t.note ? `<div class="sub">${U.esc(t.note)}</div>` : ''}${t.recurringId ? ` <span class="muted" title="Auto-posted">${UI.icon('bolt', 12)}</span>` : ''}</td>
              <td>${UI.tag(t.category || 'Uncategorized', S.categoryType(t.category) === 'income' ? '#2ecf8f' : S.categoryType(t.category) === 'transfer' ? '#64748b' : '#f7931a')}</td>
              <td><span class="muted">${a ? U.esc(a.name) : '—'}</span></td>
              <td class="r"><b>${U.mc(t.amount)}</b></td>
              <td class="r"><div class="row-actions"><button class="icon-btn" data-act="del" data-id="${t.id}">${UI.icon('trash', 14)}</button></div></td></tr>`;
          }).join('')}</tbody></table>
          ${list.length > V.limit ? `<div style="text-align:center;padding:14px"><button class="btn" data-act="more">Show more (${list.length - V.limit} remaining)</button></div>` : ''}`
          : UI.empty('list', 'No transactions here', 'Add one manually, import a CSV export from your bank, or set up recurring items to auto-post.', `${UI.btn('Import CSV', 'import', { icon: 'upload' })} ${UI.btn('Add transaction', 'add', { icon: 'plus', kind: 'primary' })}`)}
        </div></div>`;

      const rer = () => B.rerender();
      root.querySelector('#q').addEventListener('input', U.debounce((e) => { V.q = e.target.value; rer(); setTimeout(() => { const q = document.querySelector('#q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 0); }, 250));
      root.querySelector('#f-acc').addEventListener('change', (e) => { V.account = e.target.value; rer(); });
      root.querySelector('#f-cat').addEventListener('change', (e) => { V.category = e.target.value; rer(); });
      root.querySelector('#f-type').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { V.type = b.dataset.t; rer(); } });
      root.querySelector('#bulk-cat')?.addEventListener('change', (e) => {
        const cat = e.target.value; if (!cat) return;
        S.commit((s) => s.transactions.forEach((t) => { if (V.selected.has(t.id)) t.category = cat; }));
        UI.toast(`Re-categorized ${V.selected.size} transactions`); V.selected.clear();
      });
      root.addEventListener('change', (e) => {
        if (e.target.id === 'sel-all') { if (e.target.checked) shown.forEach((t) => V.selected.add(t.id)); else V.selected.clear(); rer(); }
        else if (e.target.classList.contains('sel')) { if (e.target.checked) V.selected.add(e.target.dataset.id); else V.selected.delete(e.target.dataset.id); rer(); }
      });
      root.addEventListener('click', (e) => { if (e.target.matches('input[type=checkbox]')) e.stopPropagation(); }, true);

      UI.bind(root, {
        add: () => edit(null),
        import: () => importCsv(V.account),
        export: () => exportCsv(list),
        prev: () => { V.month = U.shiftMonth(V.month || U.thisMonth(), -1); rer(); },
        next: () => { V.month = U.shiftMonth(V.month || U.thisMonth(), 1); rer(); },
        all: () => { V.month = V.month ? '' : U.thisMonth(); rer(); },
        more: () => { V.limit += 300; rer(); },
        edit: (d, el, e) => { if (e.target.closest('.row-actions') || e.target.matches('input')) return; edit(S.get('transactions', d.id)); },
        del: async (d) => { if (await UI.confirm('Delete this transaction? The account balance will be adjusted.')) S.deleteTransaction(d.id); },
        bulkDel: async () => { if (await UI.confirm(`Delete ${V.selected.size} transactions?`)) { [...V.selected].forEach((id) => S.deleteTransaction(id)); V.selected.clear(); } },
        clearSel: () => { V.selected.clear(); rer(); },
      });
    },
  };
})(window.BLAM);
