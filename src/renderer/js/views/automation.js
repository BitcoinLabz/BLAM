/* BLAM — Automation center */
'use strict';
(function (B) {
  const { U, S, UI, A } = B;

  function editRule(r) {
    const isNew = !r;
    UI.form({
      title: isNew ? 'New categorization rule' : 'Edit rule',
      intro: 'Rules run on every new, imported or auto-posted transaction. The first matching rule wins.',
      fields: [
        { key: 'matchType', label: 'Match', type: 'select', col: 2, options: [{ value: 'contains', label: 'Payee contains' }, { value: 'regex', label: 'Regex' }] },
        { key: 'pattern', label: 'Text', col: 4, required: true, placeholder: 'e.g. KROGER' },
        { key: 'category', label: 'Set category to', type: 'select', col: 6, options: S.state.categories.map((c) => ({ value: c.name, label: `${c.group} › ${c.name}` })) },
        { key: 'applyExisting', label: 'Apply now', type: 'checkbox', col: 6, checkLabel: 'Also re-categorize existing matching transactions' },
      ],
      values: r || { matchType: 'contains' },
      onSave: (v) => {
        const apply = v.applyExisting; delete v.applyExisting;
        S.upsert('rules', v);
        if (apply) {
          let n = 0;
          S.commit((s) => s.transactions.forEach((t) => {
            let hit = false;
            try { hit = v.matchType === 'regex' ? new RegExp(v.pattern, 'i').test(t.payee) : String(t.payee).toLowerCase().includes(v.pattern.toLowerCase()); } catch (_) { /* bad regex */ }
            if (hit && t.category !== v.category) { t.category = v.category; n++; }
          }));
          UI.toast(`Rule saved · ${n} transactions updated`);
        }
      },
      onDelete: isNew ? null : () => S.remove('rules', r.id),
    });
  }

  B.views.automation = {
    render(root) {
      const s = S.state, st = s.settings;
      const autoRec = s.recurring.filter((r) => r.autoPost && !r.paused);
      const due = s.recurring.filter((r) => r.autoPost && !r.paused && r.nextDate <= U.today());
      const toggle = (k, label, sub) => `<div class="li"><div class="li-m"><div class="li-t">${label}</div><div class="li-s">${sub}</div></div><label class="switch"><input type="checkbox" data-set="${k}" ${st[k] ? 'checked' : ''}><span></span></label></div>`;

      root.innerHTML = `
        ${UI.pageHead('Automation', 'Let BLAM do the busywork. Everything runs locally while the app is open.')}
        <div class="grid g4">
          ${UI.kpi({ label: 'Recurring on autopilot', icon: 'repeat', accent: '#2ecf8f', value: autoRec.length, sub: `${s.recurring.length - autoRec.length} manual or paused` })}
          ${UI.kpi({ label: 'Live-priced assets', icon: 'bitcoin', accent: '#f7931a', value: s.holdings.filter((h) => h.autoPrice !== false).length + (s.metals.length ? 1 : 0), sub: `Refreshed ${U.timeAgo(st.lastPriceRefresh)}` })}
          ${UI.kpi({ label: 'Categorization rules', icon: 'list', accent: '#8b5cf6', value: s.rules.length, sub: '+ built-in smart payee detection' })}
          ${UI.kpi({ label: 'History snapshots', icon: 'networth', accent: '#14b8a6', value: s.snapshots.length, sub: 'Net worth saved daily' })}
        </div>
        <div class="grid g2 mt">
          ${UI.card({ title: 'Automations', body: `<div class="list">
            ${toggle('autoPostRecurring', 'Auto-post recurring items', 'Paychecks, bills, rent, transfers and loan payments post themselves on their due date — even catching up on days the app was closed.')}
            <div class="li"><div class="li-m"><div class="li-t">Live price refresh</div><div class="li-s">Crypto via CoinGecko · stocks, ETFs & metals via Yahoo Finance</div></div><select class="input" data-set="autoRefreshMinutes" style="width:150px">${[[0, 'Off'], [5, 'Every 5 min'], [15, 'Every 15 min'], [30, 'Every 30 min'], [60, 'Hourly'], [240, 'Every 4 hours']].map(([v, l]) => `<option value="${v}" ${+st.autoRefreshMinutes === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            ${toggle('notifications', 'Bill reminders', 'Desktop notification once a day for manual bills and card payments coming due.')}
            <div class="li"><div class="li-m"><div class="li-t">Remind me</div><div class="li-s">How far ahead to warn about bills</div></div><select class="input" data-set="reminderDays" style="width:150px">${[3, 5, 7, 10, 14].map((v) => `<option value="${v}" ${+st.reminderDays === v ? 'selected' : ''}>${v} days ahead</option>`).join('')}</select></div>
            <div class="li"><div class="li-m"><div class="li-t">Daily net-worth snapshot</div><div class="li-s">Always on — powers every history chart</div></div><span class="pos">${UI.icon('check')}</span></div>
            <div class="li"><div class="li-m"><div class="li-t">Daily backups</div><div class="li-s">${window.blam ? 'Rolling 30 days of backups in your data folder' : 'Available in the desktop app'}</div></div><span class="pos">${UI.icon('check')}</span></div>
          </div>` })}
          ${UI.card({ title: 'Run now', body: `<div class="list">
            <div class="li"><div class="li-ic">${UI.icon('repeat')}</div><div class="li-m"><div class="li-t">Post due recurring items</div><div class="li-s">${due.length ? `${due.length} item${due.length > 1 ? 's' : ''} due` : 'Nothing due right now'}</div></div><button class="btn sm" data-act="runRec">Run</button></div>
            <div class="li"><div class="li-ic">${UI.icon('refresh')}</div><div class="li-m"><div class="li-t">Refresh all prices</div><div class="li-s">Crypto, stocks, ETFs and metal spot prices</div></div><button class="btn sm" data-act="prices">Run</button></div>
            <div class="li"><div class="li-ic">${UI.icon('coins')}</div><div class="li-m"><div class="li-t">Sync dividends</div><div class="li-s">Pull payout history, trailing yield & log new payouts</div></div><button class="btn sm" data-act="divs">Run</button></div>
            <div class="li"><div class="li-ic">${UI.icon('leaf')}</div><div class="li-m"><div class="li-t">Revalue depreciating assets</div><div class="li-s">Applies annual % change to vehicles & other assets</div></div><button class="btn sm" data-act="reval">Run</button></div>
            <div class="li"><div class="li-ic">${UI.icon('networth')}</div><div class="li-m"><div class="li-t">Take net-worth snapshot</div><div class="li-s">Records today's totals</div></div><button class="btn sm" data-act="snap">Run</button></div>
          </div>` })}
        </div>
        <div class="grid g2 mt">
          ${UI.card({ title: 'Categorization rules', cls: 'flush', actions: UI.btn('Rule', 'addRule', { icon: 'plus' }), body: s.rules.length ? `<table class="tbl"><thead><tr><th>When payee</th><th>Category</th></tr></thead><tbody>${s.rules.map((r) => `<tr class="click" data-act="editRule" data-id="${r.id}"><td>${r.matchType === 'regex' ? 'matches' : 'contains'} <b>${U.esc(r.pattern)}</b></td><td>${UI.tag(r.category)}</td></tr>`).join('')}</tbody></table>` : UI.empty('list', 'No custom rules', 'Built-in detection already handles common merchants (Kroger, Shell, Netflix, DTE…). Add rules for anything else, or tick “Always use this category” when editing a transaction.', UI.btn('Add rule', 'addRule', { icon: 'plus' })) })}
          ${UI.card({ title: 'Activity log', body: s.log.length ? `<div style="max-height:380px;overflow:auto">${s.log.slice(0, 120).map((l) => `<div class="log-row"><time>${new Date(l.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time><span>${l.type === 'auto' ? `<span class="pos">${UI.icon('bolt', 12)}</span> ` : ''}${U.esc(l.msg)}</span></div>`).join('')}</div>` : '<p class="muted">Automation activity will appear here.</p>' })}
        </div>`;

      root.querySelectorAll('[data-set]').forEach((el) => el.addEventListener('change', () => {
        const k = el.dataset.set;
        S.setting(k, el.type === 'checkbox' ? el.checked : U.num(el.value));
        UI.toast('Saved');
      }));
      UI.bind(root, {
        runRec: () => { const n = A.runRecurring(); if (!n.length) UI.toast('Nothing due'); },
        prices: () => A.refreshPrices(),
        divs: () => A.syncDividends(),
        reval: () => B.views.assets.applyDepreciation(),
        snap: () => { S.snapshot(); S.commit(() => {}); UI.toast('Snapshot saved'); },
        addRule: () => editRule(null),
        editRule: (d) => editRule(S.get('rules', d.id)),
      });
    },
  };
})(window.BLAM);
