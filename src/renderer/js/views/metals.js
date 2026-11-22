/* BLAM — Precious metals stack */
'use strict';
(function (B) {
  const { U, S, UI, Ch, A } = B;

  function edit(m) {
    const isNew = !m;
    UI.form({
      title: isNew ? 'Add to your stack' : `Edit ${m.name}`, wide: true,
      fields: [
        { key: 'metal', label: 'Metal', type: 'select', col: 2, options: UI.objOptions(S.METALS) },
        { key: 'form', label: 'Form', type: 'select', col: 2, options: ['coin', 'bar', 'round', 'junk silver', 'jewelry', 'other'] },
        { key: 'name', label: 'Description', col: 2, required: true, placeholder: 'American Eagle 1 oz', list: ['American Gold Eagle 1 oz', 'Gold Buffalo 1 oz', 'Canadian Maple Leaf 1 oz', 'Krugerrand 1 oz', 'American Silver Eagle 1 oz', '10 oz Silver Bar', '100 oz Silver Bar', '1 kilo Silver Bar', 'Generic Silver Round 1 oz', '90% Junk Silver ($1 FV)', 'PAMP Suisse 1 oz Gold Bar'] },
        { key: 'quantity', label: 'Quantity (pieces)', type: 'number', col: 2, required: true },
        { key: 'weight', label: 'Pure metal per piece', type: 'number', col: 2, suffix: 'ozt', help: 'e.g. 1, 10, 32.15 (kilo), 0.715 per $1 FV junk silver' },
        { key: 'costBasis', label: 'Total cost paid', type: 'money', col: 2 },
        { key: 'location', label: 'Storage location', col: 3, placeholder: 'Home safe, bank box, vault…' },
        { key: 'purchaseDate', label: 'Purchased', type: 'date', col: 3 },
        { key: 'notes', label: 'Notes', type: 'textarea', col: 6, rows: 2 },
      ],
      values: m || { metal: 'silver', form: 'coin', weight: 1, purchaseDate: U.today() },
      onSave: (v) => { v.quantity = U.num(v.quantity); v.weight = U.num(v.weight) || 1; v.costBasis = U.num(v.costBasis); S.upsert('metals', v); },
      onDelete: isNew ? null : () => S.remove('metals', m.id),
    });
  }

  function setSpot() {
    UI.form({
      title: 'Spot prices (per troy oz)',
      intro: 'Spot prices update automatically from COMEX futures. Set them manually here if you\'re offline.',
      fields: Object.entries(S.METALS).map(([k, v]) => ({ key: k, label: `${v.label}${v.unit === 'lb' ? ' (per lb)' : ''}`, type: 'money', col: 2 })),
      values: S.state.metalPrices,
      onSave: (v) => S.commit((s) => { Object.keys(S.METALS).forEach((k) => { s.metalPrices[k] = U.num(v[k]); }); s.metalPrices.updated = new Date().toISOString(); }),
    });
  }

  B.views.metals = {
    add: () => edit(null),
    render(root) {
      const s = S.state;
      const mp = s.metalPrices;
      const total = U.sum(s.metals, S.metalValue);
      const cost = U.sum(s.metals, (m) => m.costBasis);
      const byMetal = Object.entries(S.METALS).map(([k, v]) => {
        const items = s.metals.filter((m) => m.metal === k);
        return { k, ...v, oz: U.sum(items, S.metalOz), value: U.sum(items, S.metalValue), cost: U.sum(items, (m) => m.costBasis), count: items.length };
      });
      const ratio = mp.gold && mp.silver ? mp.gold / mp.silver : null;

      root.innerHTML = `
        ${UI.pageHead('Precious Metals', `Physical gold, silver, platinum and more — valued at live spot.${mp.updated ? ` Spot updated ${U.timeAgo(mp.updated)}.` : ''}`, `${UI.btn('Spot prices', 'spot', { icon: 'edit' })}${UI.btn('Refresh', 'refresh', { icon: 'refresh' })}${UI.btn('Add metal', 'add', { icon: 'plus', kind: 'primary' })}`)}
        <div class="grid g5">
          ${UI.kpi({ label: 'Stack value', icon: 'gem', accent: '#eab308', value: U.m(total, 0), sub: cost ? `${U.mc(total - cost, 0)} (${U.pc((total - cost) / cost)})` : '' })}
          ${byMetal.filter((b) => b.k !== 'copper').map((b) => UI.kpi({ label: b.label, accent: b.color, value: `${U.qty(b.oz, 3)} <span style="font-size:14px;color:var(--muted)">ozt</span>`, sub: `Spot ${mp[b.k] ? U.money(mp[b.k]) : '—'} ${mp[`${b.k}Change`] != null ? U.pc(mp[`${b.k}Change`] / 100) : ''}` })).join('')}
        </div>
        ${ratio ? `<div class="callout info mt">${UI.icon('info')}<div>Gold/silver ratio is <b>${ratio.toFixed(1)}</b> — it takes ${ratio.toFixed(1)} oz of silver to buy 1 oz of gold. Historically, a ratio above 80 has been viewed as silver being cheap relative to gold.</div></div>` : ''}
        <div class="grid g-21 mt">
          ${UI.card({ title: 'Your stack', cls: 'flush', body: s.metals.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Pure oz</th><th class="r">Melt value</th><th class="r">Cost</th><th class="r">Gain</th></tr></thead><tbody>${s.metals.map((m) => {
            const v = S.metalValue(m), meta = S.METALS[m.metal];
            return `<tr class="click" data-act="edit" data-id="${m.id}"><td><div class="asset-cell"><div class="asset-ic" style="background:${meta?.color}">${(meta?.label || '?').slice(0, 2).toUpperCase()}</div><div><b>${U.esc(m.name)}</b><div class="sub">${U.esc(m.form || '')}${m.location ? ` · ${U.esc(m.location)}` : ''}</div></div></div></td><td class="r">${U.qty(m.quantity, 2)}</td><td class="r">${U.qty(S.metalOz(m), 3)}</td><td class="r"><b>${U.m(v)}</b></td><td class="r muted">${U.m(m.costBasis)}</td><td class="r">${m.costBasis ? U.mc(v - m.costBasis) : '—'}</td></tr>`;
          }).join('')}</tbody><tfoot><tr><td>Total</td><td></td><td></td><td class="r">${U.m(total)}</td><td class="r">${U.m(cost)}</td><td class="r">${U.mc(total - cost)}</td></tr></tfoot></table></div>` : UI.empty('gem', 'Track your stack', 'Add coins, bars and rounds. BLAM values them at live spot from COMEX futures.', UI.btn('Add metal', 'add', { icon: 'plus', kind: 'primary' })) })}
          ${UI.card({ title: 'Allocation by metal', body: '<div id="m-alloc"></div>' })}
        </div>`;
      Ch.donut(root.querySelector('#m-alloc'), { items: byMetal.map((b) => ({ label: b.label, value: b.value, color: b.color })), size: 180 });
      UI.bind(root, { add: () => edit(null), edit: (d) => edit(S.get('metals', d.id)), spot: setSpot, refresh: () => A.refreshPrices() });
    },
  };
})(window.BLAM);
