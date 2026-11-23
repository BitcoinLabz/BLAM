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
  /** First header matching the highest-priority pattern (patterns are tried in order). */
  function guess(headers, patterns, exclude = []) {
    for (const p of patterns) {
      const i = headers.findIndex((h, k) => p.test(h) && !exclude.includes(String(k)));
      if (i >= 0) return String(i);
    }
    return '';
  }
  /** A column whose every non-empty value is Debit/Credit (e.g. Capital One 360 "Transaction Type"). */
  function guessSignCol(headers, data) {
    for (let i = 0; i < headers.length; i++) {
      const vals = data.map((r) => String(r[i] ?? '').trim().toLowerCase()).filter(Boolean);
      if (vals.length && vals.every((v) => /^(debit|credit|dr|cr)$/.test(v))) return String(i);
    }
    return '';
  }

  // ------------------------------------------------------------------ OFX / QFX / QBO import
  /** Match an OFX statement to a BLAM account: last-4 digits, previous imports from the same account, then type. */
  function guessOfxAccount(st, fallback) {
    const acc = S.activeAccounts();
    const last4 = st.acctId.replace(/\D/g, '').slice(-4);
    const prior = S.state.transactions.find((t) => t.extId && t.extId.startsWith(`ofx:${st.acctId}:`));
    return (prior && acc.find((a) => a.id === prior.accountId)?.id)
      || (last4 && acc.find((a) => String(a.last4 || '') === last4)?.id)
      || fallback
      || (st.credit ? acc.find((a) => S.accountKind(a) === 'credit') : acc.find((a) => S.accountKind(a) === 'cash'))?.id
      || acc[0]?.id;
  }

  function importOfx(file, statements, accountId) {
    if (!statements.length) { UI.toast('No bank statements found in that file', 'error'); return; }
    const plan = statements.map((st) => ({ st, accountId: guessOfxAccount(st, statements.length === 1 ? accountId || V.account : ''), balance: st.balance != null }));
    const label = (st) => `${st.credit ? 'Credit card' : (st.acctType || 'Bank').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} ···· ${U.esc(st.acctId.replace(/\D/g, '').slice(-4) || st.acctId)}${st.org ? ` · ${U.esc(st.org)}` : ''}`;
    const known = () => new Set(S.state.transactions.filter((t) => t.extId).map((t) => t.extId));
    const twinOf = (t, accId, claimed) => S.state.transactions.find((x) => !x.extId && !claimed.has(x.id) && x.accountId === accId && Math.abs(U.num(x.amount) - t.amount) < 0.005 && Math.abs(U.daysBetween(x.date, t.date)) <= 3);
    const preview = () => {
      const k = known();
      return plan.map((p) => {
        const claimed = new Set();
        let fresh = 0, dupes = 0, adopt = 0;
        for (const t of p.st.transactions) {
          if (k.has(`ofx:${p.st.acctId}:${t.fitid}`)) dupes++;
          else { const tw = twinOf(t, p.accountId, claimed); if (tw) { claimed.add(tw.id); adopt++; } else fresh++; }
        }
        return { fresh, dupes, adopt };
      });
    };
    const m = UI.modal({
      title: `Import ${file.name}`, xwide: true,
      body: `<div class="form-intro">Bank download (OFX / QFX / QBO). Each transaction carries a unique bank ID, so importing the same or an overlapping file again never creates duplicates, and the account balance can be set to exactly what the bank reports.</div><div id="ofx-plan"></div>`,
      footer: `<span class="muted" id="ofx-count"></span><span class="grow"></span><button class="btn ghost" data-c>Cancel</button><button class="btn primary" data-go>Import</button>`,
    });
    const render = () => {
      const pv = preview();
      m.body.querySelector('#ofx-plan').innerHTML = plan.map((p, i) => `<div class="card mt"><div class="card-b">
        <div class="mapping-grid">
          <div class="field"><label>Statement</label><div style="padding:9px 0"><b>${label(p.st)}</b><div class="sub">${p.st.transactions.length} transactions${p.st.transactions.length ? ` · ${U.fmtDate(p.st.transactions.reduce((a, t) => (t.date < a ? t.date : a), p.st.transactions[0].date))} – ${U.fmtDate(p.st.transactions.reduce((a, t) => (t.date > a ? t.date : a), p.st.transactions[0].date))}` : ''}</div></div></div>
          <div class="field"><label>Into account</label><select data-acc="${i}">${S.activeAccounts().map((a) => `<option value="${a.id}" ${a.id === p.accountId ? 'selected' : ''}>${U.esc(a.name)}</option>`).join('')}<option value="__new">+ New account from this statement</option></select></div>
          ${p.st.balance != null ? `<div class="field"><label>Balance</label><label class="switch"><input type="checkbox" data-bal="${i}" ${p.balance ? 'checked' : ''}><span></span><em>Set to bank balance ${U.money(p.st.credit ? -p.st.balance : p.st.balance)}${p.st.balanceDate ? ` (${U.fmtDate(p.st.balanceDate, { month: 'short', day: 'numeric' })})` : ''}</em></label></div>` : ''}
        </div>
        <p class="muted" style="margin:8px 0 0">${pv[i].fresh} new${pv[i].adopt ? ` · ${pv[i].adopt} already in BLAM (will be matched, not duplicated)` : ''}${pv[i].dupes ? ` · ${pv[i].dupes} already imported` : ''}</p>
      </div></div>`).join('');
      const tot = pv.reduce((a, x) => a + x.fresh, 0);
      m.foot.querySelector('#ofx-count').textContent = `${tot} new transaction${tot === 1 ? '' : 's'} to import`;
    };
    m.body.addEventListener('change', (e) => {
      const i = e.target.dataset.acc ?? e.target.dataset.bal;
      if (i == null) return;
      const p = plan[+i];
      if (e.target.dataset.bal != null) { p.balance = e.target.checked; return; }
      if (e.target.value === '__new') {
        const st = p.st;
        const acc = S.upsert('accounts', { name: `${st.org || (st.credit ? 'Credit card' : 'Bank')} ${st.credit ? 'card' : (st.acctType || 'account').toLowerCase()} ${st.acctId.replace(/\D/g, '').slice(-4)}`.trim(), type: st.credit ? 'credit' : /SAVINGS/.test(st.acctType) ? 'savings' : /MONEYMRKT/.test(st.acctType) ? 'money_market' : 'checking', last4: st.acctId.replace(/\D/g, '').slice(-4), institution: st.org, balance: 0 }, { silent: true });
        p.accountId = acc.id;
      } else p.accountId = e.target.value;
      render();
    });
    render();
    m.foot.querySelector('[data-c]').onclick = m.close;
    m.foot.querySelector('[data-go]').onclick = () => {
      let added = 0, matched = 0;
      S.commit((s) => {
        for (const p of plan) {
          const k = known();
          const claimed = new Set();
          const acc = s.accounts.find((a) => a.id === p.accountId);
          if (!acc) continue;
          if (p.st.acctId.replace(/\D/g, '').length >= 4 && !acc.last4) acc.last4 = p.st.acctId.replace(/\D/g, '').slice(-4);
          for (const t of [...p.st.transactions].sort((a, b) => a.date.localeCompare(b.date))) {
            const extId = `ofx:${p.st.acctId}:${t.fitid}`;
            if (k.has(extId)) continue;
            const tw = twinOf(t, acc.id, claimed);
            if (tw) { tw.extId = extId; claimed.add(tw.id); matched++; continue; }
            S.addTransaction({ date: t.date, accountId: acc.id, payee: t.payee, amount: t.amount, note: [t.memo, t.checkNum ? `Check #${t.checkNum}` : ''].filter(Boolean).join(' · '), extId, imported: true }, { silent: true });
            k.add(extId);
            added++;
          }
          if (p.balance && p.st.balance != null) { acc.balance = U.round(S.accountKind(acc) === 'credit' ? -p.st.balance : p.st.balance); acc.balanceSyncedAt = p.st.balanceDate || U.today(); }
        }
      });
      S.log(`Imported ${added} transactions from ${file.name}${matched ? ` (${matched} matched to existing)` : ''}`, 'info');
      UI.toast(`Imported ${added} transaction${added === 1 ? '' : 's'}${matched ? ` · ${matched} matched` : ''}`);
      m.close();
    };
  }

  async function importCsv(accountId) {
    if (!S.activeAccounts().length) { UI.toast('Add an account first', 'warn'); return; }
    const file = await U.openFile('.csv,.ofx,.qfx,.qbo,.txt');
    if (!file) return;
    const statements = U.parseOfx(file.content);
    if (statements) return importOfx(file, statements, accountId);
    const rows = U.csvParse(file.content);
    if (rows.length < 2) { UI.toast('That file has no rows', 'error'); return; }
    const headers = rows[0].map((h) => h.trim());
    const data = rows.slice(1);
    const colOpts = [{ value: '', label: '— none —' }, ...headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }))];
    const map = {
      accountId: accountId || V.account || S.activeAccounts()[0].id,
      date: guess(headers, [/^date$/i, /^transaction date$/i, /^trans(action)?\.? date$/i, /^posting date$/i, /^post(ed)? date$/i, /timestamp/i, /date/i]),
      payee: guess(headers, [/^description$/i, /^payee$/i, /^merchant( name)?$/i, /transaction description/i, /description/i, /payee|merchant|name/i, /memo/i]),
      amount: guess(headers, [/native amount \(in usd\)/i, /^native amount$/i, /^amount$/i, /transaction amount/i, /amount/i]),
      debit: guess(headers, [/^debit$/i, /debit|withdraw/i]),
      credit: guess(headers, [/^credit$/i, /^credits?$|deposit/i]),
      sign: guessSignCol(headers, data),
      category: guess(headers, [/^category$/i, /category/i]),
      flip: false, skipDupes: true,
    };
    if (map.debit && map.credit) map.amount = map.amount === map.debit || map.amount === map.credit ? '' : map.amount;
    // Amex (and some other card issuers) export charges as POSITIVE numbers. BLAM stores spending as negative.
    const isAmex = headers.some((h) => /appears on your statement as|extended details/i.test(h)) || /amex|american express/i.test(file.name);
    const looksPositiveSpend = () => {
      if (map.amount === '' || map.sign) return false;
      const acc = S.get('accounts', map.accountId);
      const amts = data.map((r) => U.parseAmount(r[+map.amount])).filter((x) => x);
      return acc && S.accountKind(acc) === 'credit' && amts.length >= 3 && amts.filter((x) => x > 0).length / amts.length > 0.6;
    };
    map.flip = isAmex || looksPositiveSpend();
    const flipNote = () => (map.flip && (isAmex || looksPositiveSpend()) ? `<div class="callout info" style="margin-top:10px">${UI.icon('info')}<div>Signs flipped automatically: this file lists charges as positive amounts${isAmex ? ' (American Express format)' : ''}. Untick <b>Flip signs</b> if purchases show as income below.</div></div>` : '');

    const m = UI.modal({
      title: `Import ${file.name}`, xwide: true,
      body: `<div class="form-intro">Map the columns from your bank's CSV export. BLAM auto-categorizes using your rules and smart payee detection, and skips duplicates.</div>
        <div class="mapping-grid" id="map"></div><div id="flipnote"></div><div class="preview-tbl" id="prev"></div>`,
      footer: `<span class="muted" id="imp-count"></span><span class="grow"></span><button class="btn ghost" data-c>Cancel</button><button class="btn primary" data-go>Import</button>`,
    });
    const sel = (k, label, opts) => `<div class="field"><label>${label}</label><select data-m="${k}">${opts.map((o) => `<option value="${U.esc(o.value)}" ${String(map[k]) === String(o.value) ? 'selected' : ''}>${U.esc(o.label)}</option>`).join('')}</select></div>`;
    m.body.querySelector('#map').innerHTML = [
      sel('accountId', 'Into account', accOptions()),
      sel('date', 'Date column', colOpts), sel('payee', 'Description column', colOpts),
      sel('amount', 'Amount column (signed)', colOpts), sel('debit', 'or Debit column', colOpts), sel('credit', 'or Credit column', colOpts),
      sel('sign', 'Debit/Credit type column', colOpts),
      sel('category', 'Category column (optional)', colOpts),
      `<div class="field"><label>Options</label><label class="switch"><input type="checkbox" data-m="flip" ${map.flip ? 'checked' : ''}><span></span><em>Flip signs</em></label><label class="switch"><input type="checkbox" data-m="skipDupes" checked><span></span><em>Skip duplicates</em></label></div>`,
    ].join('');

    const parse = () => {
      const out = [];
      for (const r of data) {
        const date = U.parseAnyDate(r[+map.date]);
        if (!date || map.date === '') continue;
        let amt = 0;
        if (map.amount !== '') amt = U.parseAmount(r[+map.amount]);
        else amt = Math.abs(U.parseAmount(r[+map.credit])) - Math.abs(U.parseAmount(r[+map.debit]));
        if (map.sign !== '') {
          const t = String(r[+map.sign] ?? '').trim().toLowerCase();
          if (t === 'debit' || t === 'dr') amt = -Math.abs(amt);
          else if (t === 'credit' || t === 'cr') amt = Math.abs(amt);
        }
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
      m.body.querySelector('#flipnote').innerHTML = flipNote();
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
        ${UI.pageHead('Transactions', 'Every dollar in and out across all banks and cards.', `${UI.btn('Export', 'export', { icon: 'download' })}${UI.btn('Import bank file', 'import', { icon: 'upload' })}${UI.btn('Add transaction', 'add', { icon: 'plus', kind: 'primary' })}`)}
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
          : UI.empty('list', 'No transactions here', 'Add one manually, import your bank\'s download (OFX, QFX, QBO or CSV), or set up recurring items to auto-post.', `${UI.btn('Import bank file', 'import', { icon: 'upload' })} ${UI.btn('Add transaction', 'add', { icon: 'plus', kind: 'primary' })}`)}
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
