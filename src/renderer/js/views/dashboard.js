/* BLAM — Dashboard */
'use strict';
(function (B) {
  const { U, F, S, UI, Ch, A } = B;
  B.views = B.views || {};

  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  function changeSince(days) {
    const snaps = S.state.snapshots;
    if (snaps.length < 2) return null;
    const target = U.addDays(U.today(), -days);
    let base = snaps[0];
    for (const s of snaps) { if (s.date <= target) base = s; else break; }
    if (base.date === U.today()) return null;
    const now = S.totals().netWorth;
    return { abs: now - base.netWorth, pct: base.netWorth ? (now - base.netWorth) / Math.abs(base.netWorth) : 0, since: base.date };
  }

  B.views.dashboard = {
    render(root) {
      const s = S.state;
      const t = S.totals();
      const pi = S.passiveIncome();
      const mk = U.thisMonth();
      const flow = S.monthFlow(mk);
      const ch30 = changeSince(30);
      const snaps = s.snapshots.slice(-60).map((x) => x.netWorth);
      const upcoming = A.upcoming(21).slice(0, 7);
      const dayChange = U.sum(s.holdings, (h) => F.holdingMetrics(h).dayChange);
      const totalBudget = U.sum(s.categories.filter((c) => c.type === 'expense'), (c) => c.budget);
      const cardUtil = (() => {
        const cards = S.activeAccounts().filter((a) => S.accountKind(a) === 'credit' && U.num(a.creditLimit) > 0);
        const lim = U.sum(cards, (a) => a.creditLimit);
        return lim ? U.sum(cards, (a) => a.balance) / lim : null;
      })();

      root.innerHTML = `
        ${UI.pageHead(`${greeting()}${s.settings.userName ? `, ${U.esc(s.settings.userName)}` : ''}`, `${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · Here's your complete financial picture.`,
          `${UI.btn('Refresh prices', 'refresh', { icon: 'refresh' })}${UI.btn('Add transaction', 'addTxn', { icon: 'plus', kind: 'primary' })}`)}

        <div class="grid g4">
          ${UI.kpi({ cls: 'hero', label: 'Net Worth', icon: 'networth', accent: '#f7931a', value: `<span class="amt">${U.money(t.netWorth, 0)}</span>`,
            sub: ch30 ? `${U.mc(ch30.abs, 0)} (${U.pc(ch30.pct)}) since ${U.fmtDate(ch30.since, { month: 'short', day: 'numeric' })}` : 'History builds automatically every day',
            spark: Ch.spark(snaps, '#f7931a', 200, 54) })}
          ${UI.kpi({ label: 'Investments today', icon: 'chart', accent: dayChange >= 0 ? '#2ecf8f' : '#f45b72', value: U.mc(dayChange, 0), sub: `${U.ms(t.holdings)} in crypto, stocks & ETFs` })}
          ${UI.kpi({ label: 'Passive income / mo', icon: 'coins', accent: '#a3e635', value: U.m(pi.total, 0), sub: `${U.ms(pi.total * 12)} per year from ${['dividends', 'rentals', 'passive', 'interest'].filter((k) => pi[k] > 0).length} sources` })}
        </div>
        <div class="grid g4 mt">
          ${UI.kpi({ label: 'Total assets', icon: 'leaf', accent: '#14b8a6', value: U.m(t.assets, 0), sub: `${U.ms(t.liquid)} liquid` })}
          ${UI.kpi({ label: 'Total debt', icon: 'loan', accent: '#f45b72', value: U.m(t.liabilities, 0), sub: `${U.ms(t.credit)} cards · ${U.ms(t.loans)} loans` })}
          ${UI.kpi({ label: `${U.monthShort(mk)} cash flow`, icon: 'repeat', accent: flow.net >= 0 ? '#2ecf8f' : '#f45b72', value: U.mc(flow.net, 0), sub: `${U.ms(flow.income)} in · ${U.ms(flow.expense)} out` })}
          ${UI.kpi({ label: 'Savings rate', icon: 'target', accent: '#8b5cf6', value: flow.income ? U.pct(flow.savingsRate) : '—', sub: totalBudget ? `${U.pct(flow.expense / totalBudget, 0)} of ${U.ms(totalBudget)} budget used` : (cardUtil != null ? `Card utilization ${U.pct(cardUtil)}` : 'Set budgets to track') })}
        </div>

        <div class="grid g-21 mt">
          ${UI.card({ title: 'Net worth over time', sub: 'Assets minus liabilities — snapshotted daily', actions: `<div class="seg" id="nw-range">${['3M', '6M', '1Y', 'ALL'].map((r) => `<button data-r="${r}" class="${r === (B.views.dashboard.range || '1Y') ? 'on' : ''}">${r}</button>`).join('')}</div>`, body: '<div id="nw-chart"></div>' })}
          ${UI.card({ title: 'Asset allocation', sub: `${t.breakdown.length} asset classes`, body: '<div id="alloc"></div>' })}
        </div>

        <div class="grid g-21 mt">
          ${UI.card({ title: 'Income vs spending', sub: 'Last 6 months · transfers excluded', actions: UI.btn('Budget', 'goBudget', { icon: 'chevr' }), body: '<div id="flow-chart"></div>' })}
          ${UI.card({ title: 'Coming up', sub: 'Next 21 days', actions: UI.btn('', 'goRecurring', { icon: 'chevr' }), body: upcoming.length ? `<div class="list">${upcoming.map(upRow).join('')}</div>` : UI.empty('calendar', 'Nothing scheduled', 'Add recurring bills and income to see what\'s coming.', UI.btn('Add recurring', 'addRecurring', { icon: 'plus' })) })}
        </div>

        <div class="grid g3 mt">
          ${UI.card({ title: 'Top holdings', actions: UI.btn('', 'goInv', { icon: 'chevr' }), cls: 'flush', body: topHoldings() })}
          ${UI.card({ title: 'Debt payoff', actions: UI.btn('', 'goLoans', { icon: 'chevr' }), body: debtSummary() })}
          ${UI.card({ title: `Spending · ${U.monthLabel(mk, true)}`, actions: UI.btn('', 'goBudget', { icon: 'chevr' }), body: spendCats(flow) })}
        </div>`;

      drawNW(root);
      Ch.donut(root.querySelector('#alloc'), { items: t.breakdown.map((b) => ({ label: b.label, value: b.value, color: b.color })), centerBottom: 'Total assets', size: 190 });
      const months = U.monthsRange(mk, 6);
      const flows = months.map((m) => S.monthFlow(m));
      Ch.bar(root.querySelector('#flow-chart'), {
        labels: months.map(U.monthShort), tipLabels: months.map((m) => U.monthLabel(m, true)),
        series: [{ name: 'Income', color: '#2ecf8f', values: flows.map((f) => f.income) }, { name: 'Spending', color: '#f45b72', values: flows.map((f) => f.expense) }],
        height: 230, onClick: (i) => { B.views.budget.month = months[i]; B.go('budget'); },
      });
      root.querySelector('#nw-range').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        B.views.dashboard.range = b.dataset.r;
        root.querySelectorAll('#nw-range button').forEach((x) => x.classList.toggle('on', x === b));
        drawNW(root);
      });

      UI.bind(root, {
        refresh: () => A.refreshPrices(),
        addTxn: () => B.views.transactions.add(),
        addRecurring: () => B.views.recurring.add(),
        goBudget: () => B.go('budget'), goRecurring: () => B.go('recurring'), goInv: () => B.go('investments'), goLoans: () => B.go('loans'),
      });
    },
  };

  function drawNW(root) {
    const range = B.views.dashboard.range || '1Y';
    const days = { '3M': 92, '6M': 183, '1Y': 366, ALL: 1e5 }[range];
    const from = U.addDays(U.today(), -days);
    const snaps = S.state.snapshots.filter((x) => x.date >= from);
    Ch.line(root.querySelector('#nw-chart'), {
      area: true, height: 270,
      series: [
        { name: 'Net worth', color: '#f7931a', data: snaps.map((x) => ({ x: x.date, y: x.netWorth })) },
        { name: 'Debt', color: '#f45b72', area: false, dashed: true, width: 1.5, data: snaps.map((x) => ({ x: x.date, y: x.liabilities })) },
      ],
      empty: 'Your net worth history starts today — check back tomorrow.',
    });
  }

  function upRow(u) {
    const d = U.parse(u.date);
    const icon = { income: 'coins', loan: 'loan', card: 'card', transfer: 'repeat', lease: 'users' }[u.kind] || 'calendar';
    return `<div class="li"><div class="date-pill"><small>${d.toLocaleDateString('en-US', { month: 'short' })}</small><b>${d.getDate()}</b></div>
      <div class="li-m"><div class="li-t">${U.esc(u.name)}</div><div class="li-s">${UI.icon(icon, 12)} ${U.relDays(u.date)}${u.auto ? ' · auto-posts' : ''}</div></div>
      <div class="li-r">${u.amount ? U.mc(u.amount, 0) : ''}</div></div>`;
  }

  function topHoldings() {
    const hs = S.state.holdings.map((h) => ({ h, m: F.holdingMetrics(h) })).sort((a, b) => b.m.value - a.m.value).slice(0, 6);
    if (!hs.length) return UI.empty('bitcoin', 'No holdings yet', 'Track crypto, stocks and ETFs with live prices.', UI.btn('Add holding', 'goInv', { icon: 'plus' }));
    return `<table class="tbl"><tbody>${hs.map(({ h, m }) => `<tr>
      <td><div class="asset-cell"><div class="asset-ic" style="background:${S.ASSET_CLASSES[h.assetClass]?.color}">${U.esc((h.symbol || '?').slice(0, 4))}</div><div><b>${U.esc(h.symbol)}</b><div class="sub">${U.qty(h.quantity, 4)}</div></div></div></td>
      <td class="r"><b>${U.m(m.value, 0)}</b><div class="sub">${h.change24h != null ? U.pc(h.change24h / 100) : U.pc(m.gainPct)}</div></td></tr>`).join('')}</tbody></table>`;
  }

  function debtSummary() {
    const loans = S.state.loans.filter((l) => !l.archived && U.num(l.balance) > 0);
    if (!loans.length) return UI.empty('loan', 'Debt free?', 'Add mortgages and loans to see payoff dates.', UI.btn('Add loan', 'goLoans', { icon: 'plus' }));
    return `<div class="list">${loans.map((l) => {
      const sm = F.loanSummary(l);
      return `<div class="li" style="display:block"><div style="display:flex;justify-content:space-between;margin-bottom:7px"><b>${U.esc(l.name)}</b><span class="muted">${sm.plan.neverPaysOff ? '<span class="neg">Payment too low</span>' : `Paid off ${U.fmtDate(sm.plan.payoffDate, { month: 'short', year: 'numeric' })}`}</span></div>
        ${Ch.progress(sm.progress, l.type === 'mortgage' ? '#0ea5e9' : '#8b5cf6', { small: true })}
        <div style="display:flex;justify-content:space-between;margin-top:6px" class="li-s"><span>${U.m(l.balance, 0)} left · ${U.pct(sm.progress, 0)} paid</span><span>${U.num(l.rate)}% APR</span></div></div>`;
    }).join('')}</div>`;
  }

  function spendCats(flow) {
    const cats = Object.entries(flow.byCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (!cats.length) return UI.empty('budget', 'No spending yet', 'Transactions you add or import show up here.');
    const max = cats[0][1];
    return `<div class="list">${cats.map(([c, v]) => {
      const bud = U.num(S.category(c)?.budget);
      return `<div class="li" style="display:block;padding:9px 0"><div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px"><span>${U.esc(c)}</span><b>${U.m(v, 0)}${bud ? `<span class="muted" style="font-weight:400"> / ${U.money(bud, 0)}</span>` : ''}</b></div>${Ch.progress(bud ? v / bud : v / max, bud && v > bud ? null : '#f7931a', { small: true })}</div>`;
    }).join('')}</div>`;
  }
})(window.BLAM);
