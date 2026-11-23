/* BLAM — Crypto, stocks, ETFs & securities portfolio */
'use strict';
(function (B) {
  const { U, F, S, UI, Ch, A } = B;
  const V = { cls: '', sort: 'value', dir: -1 };

  function edit(h, defaults = {}) {
    const isNew = !h;
    const vals = h ? { ...h, avgCost: U.num(h.quantity) ? U.round(U.num(h.costBasis) / U.num(h.quantity), 6) : '' } : { assetClass: 'crypto', autoPrice: true, acquiredDate: U.today(), ...defaults };
    UI.form({
      title: isNew ? 'Add holding' : `Edit ${h.symbol}`, wide: true,
      fields: [
        { key: 'assetClass', label: 'Asset class', type: 'select', col: 2, options: UI.objOptions(S.ASSET_CLASSES) },
        { key: 'symbol', label: 'Ticker / symbol', col: 2, required: true, placeholder: 'BTC, AAPL, VOO…',
          onChange: (v, form) => {
            const sym = String(v.symbol || '').toUpperCase();
            const idEl = form.querySelector('[data-k="coingeckoId"]');
            if (v.assetClass === 'crypto' && idEl && !idEl.value && A.CRYPTO_IDS[sym]) idEl.value = A.CRYPTO_IDS[sym];
          } },
        { key: 'name', label: 'Name', col: 2, placeholder: 'auto-filled on refresh' },
        { key: 'coingeckoId', label: 'CoinGecko ID', col: 3, show: (v) => v.assetClass === 'crypto', help: 'Auto-detected for 50+ major coins. Use <b>Find coin</b> on the portfolio page for anything else.' },
        { key: 'accountId', label: 'Held at (optional)', type: 'select', col: 3, options: [{ value: '', label: '— not linked —' }, ...S.activeAccounts().filter((a) => S.accountKind(a) === 'invest').map((a) => ({ value: a.id, label: a.name }))] },
        { type: 'heading', label: 'Position' },
        { key: 'quantity', label: 'Quantity / shares', type: 'number', col: 2, required: true },
        { key: 'avgCost', label: 'Average cost per unit', type: 'money', col: 2, help: 'or enter total cost →' },
        { key: 'costBasis', label: 'Total cost basis', type: 'money', col: 2 },
        { key: 'price', label: 'Current price', type: 'money', col: 2, help: 'Updated automatically when live pricing is on' },
        { key: 'autoPrice', label: 'Live pricing', type: 'checkbox', col: 2, checkLabel: 'Auto-update price' },
        { key: 'acquiredDate', label: 'First acquired', type: 'date', col: 2 },
        { type: 'heading', label: 'Income' },
        { key: 'dividendYield', label: 'Dividend / staking yield', type: 'percent', col: 3, help: 'Auto-filled by Dividend Sync for stocks & ETFs' },
        { key: 'drip', label: 'DRIP', type: 'checkbox', col: 3, checkLabel: 'Dividends are reinvested' },
        { key: 'notes', label: 'Notes', type: 'textarea', col: 6, rows: 2 },
      ],
      values: vals,
      onSave: (v) => {
        v.symbol = v.symbol.trim().toUpperCase();
        v.quantity = U.num(v.quantity);
        const costTyped = U.num(v.costBasis) !== U.num(vals.costBasis);
        const avgTyped = U.num(v.avgCost) !== U.num(vals.avgCost);
        if (!costTyped && (avgTyped || !U.num(v.costBasis)) && U.num(v.avgCost)) v.costBasis = U.round(U.num(v.avgCost) * v.quantity);
        v.costBasis = U.num(v.costBasis);
        if (!U.num(v.price) && v.quantity) v.price = v.costBasis / v.quantity;
        if (v.assetClass === 'crypto' && !v.coingeckoId) v.coingeckoId = A.CRYPTO_IDS[v.symbol] || '';
        delete v.avgCost;
        S.upsert('holdings', v);
        UI.toast(isNew ? `${v.symbol} added` : `${v.symbol} saved`);
        if (v.autoPrice) A.refreshPrices({ quiet: true });
      },
      onDelete: isNew ? null : () => S.remove('holdings', h.id),
    });
  }

  function trade(h) {
    UI.form({
      title: `Trade ${h.symbol}`,
      intro: `You hold <b>${U.qty(h.quantity)}</b> ${U.esc(h.symbol)} with an average cost of <b>${U.money(U.num(h.costBasis) / (U.num(h.quantity) || 1))}</b>. Sells use average-cost accounting and record realized gain.`,
      fields: [
        { key: 'side', label: 'Side', type: 'select', col: 2, options: [{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }] },
        { key: 'quantity', label: 'Quantity', type: 'number', col: 2, required: true },
        { key: 'price', label: 'Price per unit', type: 'money', col: 2, required: true },
        { key: 'fees', label: 'Fees', type: 'money', col: 2 },
        { key: 'date', label: 'Date', type: 'date', col: 2 },
        { key: 'accountId', label: 'Cash account (optional)', type: 'select', col: 2, options: [{ value: '', label: "Don't record cash" }, ...S.activeAccounts().map((a) => ({ value: a.id, label: a.name }))], help: 'Debits/credits the cash' },
      ],
      values: { side: 'buy', price: h.price, date: U.today() },
      submitLabel: 'Record trade',
      onSave: (v) => {
        const q = U.num(v.quantity), p = U.num(v.price), fee = U.num(v.fees);
        if (v.side === 'sell' && q > U.num(h.quantity) + 1e-9) { UI.toast('Cannot sell more than you hold', 'warn'); return false; }
        let realized = 0;
        S.commit((s) => {
          const x = s.holdings.find((y) => y.id === h.id);
          if (v.side === 'buy') { x.quantity = U.num(x.quantity) + q; x.costBasis = U.round(U.num(x.costBasis) + q * p + fee); }
          else {
            const avg = U.num(x.costBasis) / U.num(x.quantity);
            realized = q * p - fee - q * avg;
            x.costBasis = U.round(U.num(x.costBasis) - avg * q);
            x.quantity = U.num(x.quantity) - q;
            x.realized = U.round(U.num(x.realized) + realized);
          }
          (x.trades = x.trades || []).push({ date: v.date, side: v.side, quantity: q, price: p, fees: fee, realized: U.round(realized) });
        });
        if (v.accountId) S.addTransaction({ date: v.date, accountId: v.accountId, payee: `${v.side === 'buy' ? 'Buy' : 'Sell'} ${U.qty(q)} ${h.symbol}`, amount: v.side === 'buy' ? -(q * p + fee) : q * p - fee, category: 'Investing' });
        UI.toast(v.side === 'sell' ? `Sold · realized ${realized >= 0 ? 'gain' : 'loss'} ${U.money(realized)}` : 'Buy recorded');
      },
    });
  }

  async function findCoin() {
    const m = UI.modal({ title: 'Find a coin on CoinGecko', body: `<div class="search-box">${UI.icon('search', 15)}<input class="input" id="cq" placeholder="Search name or symbol (e.g. Stacks, PEPE)"></div><div class="list mt" id="cres"></div>` });
    const input = m.body.querySelector('#cq');
    setTimeout(() => input.focus(), 50);
    input.addEventListener('input', U.debounce(async () => {
      const q = input.value.trim(); if (q.length < 2) return;
      const res = m.body.querySelector('#cres');
      res.innerHTML = '<p class="muted">Searching…</p>';
      try {
        const coins = await A.searchCrypto(q);
        res.innerHTML = coins.map((c) => `<div class="li click" style="cursor:pointer" data-id="${U.esc(c.id)}" data-sym="${U.esc(c.symbol)}" data-name="${U.esc(c.name)}"><div class="asset-ic" style="background:#f7931a">${U.esc(c.symbol.slice(0, 4).toUpperCase())}</div><div class="li-m"><div class="li-t">${U.esc(c.name)}</div><div class="li-s">${U.esc(c.id)}</div></div><div class="li-r muted">${c.rank ? `#${c.rank}` : ''}</div></div>`).join('') || '<p class="muted">No matches</p>';
      } catch (e) { res.innerHTML = '<p class="neg">Search unavailable — check your connection.</p>'; }
    }, 350));
    m.body.addEventListener('click', (e) => {
      const row = e.target.closest('[data-id]'); if (!row) return;
      m.close();
      setTimeout(() => edit(null, { assetClass: 'crypto', coingeckoId: row.dataset.id, symbol: row.dataset.sym.toUpperCase(), name: row.dataset.name }), 200);
    });
  }

  B.views.investments = {
    add: (d) => edit(null, d),
    edit,
    render(root) {
      const s = S.state;
      const all = s.holdings.map((h) => ({ h, m: F.holdingMetrics(h) }));
      const list = all.filter((x) => !V.cls || x.h.assetClass === V.cls);
      const total = U.sum(list, (x) => x.m.value);
      const cost = U.sum(list, (x) => x.m.cost);
      const gain = total - cost;
      const day = U.sum(list, (x) => x.m.dayChange);
      const income = U.sum(list, (x) => x.m.value * U.num(x.h.dividendYield) / 100);
      const realized = U.sum(list, (x) => x.h.realized);
      const sortFns = { value: (x) => x.m.value, gain: (x) => x.m.gain, gainPct: (x) => x.m.gainPct, symbol: (x) => x.h.symbol, day: (x) => x.h.change24h ?? -999, yield: (x) => U.num(x.h.dividendYield) };
      list.sort(U.by(sortFns[V.sort] || sortFns.value, V.dir));
      const classes = Object.keys(S.ASSET_CLASSES).filter((k) => s.holdings.some((h) => h.assetClass === k));
      const th = (k, label, r) => `<th class="${r ? 'r' : ''}" style="cursor:pointer" data-act="sort" data-k="${k}">${label}${V.sort === k ? (V.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`;
      const stale = s.holdings.some((h) => h.autoPrice !== false) && (!s.settings.lastPriceSuccess || Date.now() - new Date(s.settings.lastPriceSuccess) > 3600e3);
      const unavailable = s.holdings.filter((h) => h.autoPrice !== false && h.priceError);

      root.innerHTML = `
        ${UI.pageHead('Crypto & Stocks', 'Live-priced portfolio across crypto, stocks, ETFs, funds and bonds.', `${UI.btn('Find coin', 'find', { icon: 'search' })}${UI.btn('Refresh prices', 'refresh', { icon: 'refresh' })}${UI.btn('Add holding', 'add', { icon: 'plus', kind: 'primary' })}`)}
        ${unavailable.length ? `<div class="callout warn" style="margin-bottom:16px">${UI.icon('info')}<div><b>${unavailable.length} price${unavailable.length === 1 ? '' : 's'} unavailable:</b> ${unavailable.slice(0, 6).map((h) => `${U.esc(h.symbol)} <span class="faint">(${U.esc(h.priceError)})</span>`).join(', ')}${unavailable.length > 6 ? '…' : ''}. Values use the last known price. Check the ticker / CoinGecko ID, or turn off live pricing to enter prices manually.</div></div>` : ''}
        ${stale && !unavailable.length ? `<div class="callout info" style="margin-bottom:16px">${UI.icon('info')}<div>Prices were last updated ${U.timeAgo(s.settings.lastPriceSuccess)}. BLAM refreshes automatically every ${s.settings.autoRefreshMinutes || 15} minutes while open.</div></div>` : ''}
        <div class="grid g5">
          ${UI.kpi({ label: 'Portfolio value', icon: 'chart', accent: '#f7931a', value: U.m(total, 0), sub: `${list.length} positions` })}
          ${UI.kpi({ label: 'Today', icon: 'bolt', accent: day >= 0 ? '#2ecf8f' : '#f45b72', value: U.mc(day, 0), sub: total ? U.pc(day / (total - day)) : '' })}
          ${UI.kpi({ label: 'Unrealized gain', icon: 'networth', accent: gain >= 0 ? '#2ecf8f' : '#f45b72', value: U.mc(gain, 0), sub: cost ? U.pc(gain / cost) : '' })}
          ${UI.kpi({ label: 'Cost basis', icon: 'coins', accent: '#64748b', value: U.m(cost, 0), sub: realized ? `Realized: ${U.mc(realized, 0)}` : '' })}
          ${UI.kpi({ label: 'Est. annual income', icon: 'leaf', accent: '#a3e635', value: U.m(income, 0), sub: total ? `${U.pct(income / total, 2)} portfolio yield` : '' })}
        </div>
        <div class="chip-row mt">${['', ...classes].map((k) => `<span class="chip ${V.cls === k ? 'on' : ''}" data-act="cls" data-k="${k}">${k ? S.ASSET_CLASSES[k].label : 'All assets'} · ${U.moneyShort(U.sum(all.filter((x) => !k || x.h.assetClass === k), (x) => x.m.value))}</span>`).join('')}</div>
        <div class="card flush mt"><div class="card-b tbl-wrap">${list.length ? `<table class="tbl"><thead><tr>
          ${th('symbol', 'Asset')}<th class="r">Quantity</th><th class="r">Price</th>${th('day', '24h', 1)}${th('value', 'Value', 1)}<th class="r">Avg cost</th>${th('gain', 'Gain / loss', 1)}${th('gainPct', 'Return', 1)}<th class="r">Weight</th>${th('yield', 'Yield', 1)}<th></th></tr></thead><tbody>
          ${list.map(({ h, m }) => `<tr class="click" data-act="edit" data-id="${h.id}">
            <td><div class="asset-cell"><div class="asset-ic" style="background:${S.ASSET_CLASSES[h.assetClass]?.color}">${U.esc((h.symbol || '?').slice(0, 4))}</div><div><b>${U.esc(h.symbol)}</b><div class="sub">${U.esc(h.name || S.ASSET_CLASSES[h.assetClass]?.label)}</div></div></div></td>
            <td class="r">${U.qty(h.quantity)}</td>
            <td class="r">${U.money(h.price, U.num(h.price) < 1 ? 4 : 2)}${h.autoPrice === false ? '<div class="sub">manual</div>' : h.priceError ? `<div class="sub"><span class="tag" style="--tc:var(--warn)" title="${U.esc(h.priceError)}${h.priceUpdated ? ` · last live price ${U.esc(U.timeAgo(h.priceUpdated))}` : ''}">price unavailable</span></div>` : ''}</td>
            <td class="r">${h.change24h != null && !h.priceError ? U.pc(h.change24h / 100) : '<span class="faint">—</span>'}</td>
            <td class="r"><b>${U.m(m.value)}</b></td>
            <td class="r muted">${U.num(h.quantity) ? U.money(m.cost / h.quantity, m.cost / h.quantity < 1 ? 4 : 2) : '—'}</td>
            <td class="r">${U.mc(m.gain)}</td>
            <td class="r">${U.pc(m.gainPct)}</td>
            <td class="r">${total ? U.pct(m.value / total) : '—'}</td>
            <td class="r">${h.dividendYield ? `${U.num(h.dividendYield).toFixed(2)}%` : '<span class="faint">—</span>'}</td>
            <td class="r"><div class="row-actions"><button class="btn sm" data-act="trade" data-id="${h.id}">Trade</button></div></td></tr>`).join('')}
          </tbody><tfoot><tr><td>Total</td><td></td><td></td><td class="r">${U.mc(day, 0)}</td><td class="r">${U.m(total)}</td><td></td><td class="r">${U.mc(gain)}</td><td class="r">${cost ? U.pc(gain / cost) : ''}</td><td class="r">100%</td><td class="r">${total ? `${(income / total * 100).toFixed(2)}%` : ''}</td><td></td></tr></tfoot></table>`
          : UI.empty('bitcoin', 'Build your portfolio', 'Add Bitcoin, Stacks, ETH, stocks, ETFs or anything with a ticker. Prices update live from CoinGecko and Yahoo Finance.', `${UI.btn('Find coin', 'find', { icon: 'search' })} ${UI.btn('Add holding', 'add', { icon: 'plus', kind: 'primary' })}`)}
        </div></div>
        ${list.length ? `<div class="grid g2 mt">
          ${UI.card({ title: 'Allocation', sub: V.cls ? S.ASSET_CLASSES[V.cls].label : 'By asset class', body: '<div id="inv-alloc"></div>' })}
          ${UI.card({ title: 'Gain / loss by position', body: '<div id="inv-gain"></div>' })}
        </div>` : ''}`;

      if (list.length) {
        const items = V.cls
          ? list.map((x, i) => ({ label: x.h.symbol, value: x.m.value, color: Ch.PALETTE[i % 12] }))
          : Object.entries(S.ASSET_CLASSES).map(([k, c]) => ({ label: c.label, value: U.sum(all.filter((x) => x.h.assetClass === k), (x) => x.m.value), color: c.color }));
        Ch.donut(root.querySelector('#inv-alloc'), { items, centerBottom: 'Portfolio' });
        const g = [...list].sort((a, b) => b.m.gain - a.m.gain).slice(0, 14);
        Ch.bar(root.querySelector('#inv-gain'), { labels: g.map((x) => x.h.symbol), series: [{ name: 'Gain / loss', values: g.map((x) => x.m.gain), colorFn: (v) => (v >= 0 ? '#2ecf8f' : '#f45b72') }], height: 240, legend: false });
      }

      UI.bind(root, {
        add: () => edit(null, V.cls ? { assetClass: V.cls } : {}),
        find: findCoin,
        refresh: () => A.refreshPrices(),
        cls: (d) => { V.cls = d.k; B.rerender(); },
        sort: (d) => { if (V.sort === d.k) V.dir *= -1; else { V.sort = d.k; V.dir = d.k === 'symbol' ? 1 : -1; } B.rerender(); },
        edit: (d, el, e) => { if (!e.target.closest('.row-actions')) edit(S.get('holdings', d.id)); },
        trade: (d) => trade(S.get('holdings', d.id)),
      });
    },
  };
})(window.BLAM);
