/* BLAM — Other assets: vehicles, business equity, collectibles… */
'use strict';
(function (B) {
  const { U, S, UI, Ch } = B;

  function edit(a) {
    const isNew = !a;
    UI.form({
      title: isNew ? 'Add asset' : `Edit ${a.name}`,
      fields: [
        { key: 'name', label: 'Name', required: true, col: 4 },
        { key: 'type', label: 'Type', type: 'select', col: 2, options: UI.objOptions(S.OTHER_ASSET_TYPES) },
        { key: 'value', label: 'Current value', type: 'money', col: 2, required: true },
        { key: 'costBasis', label: 'What you paid', type: 'money', col: 2 },
        { key: 'depreciation', label: 'Annual change', type: 'percent', col: 2, help: 'e.g. -12 for a vehicle' },
        { key: 'acquired', label: 'Acquired', type: 'date', col: 3 },
        { key: 'valuedOn', label: 'Value as of', type: 'date', col: 3 },
        { key: 'notes', label: 'Notes', type: 'textarea', rows: 2, col: 6 },
      ],
      values: a || { type: 'vehicle', valuedOn: U.today() },
      onSave: (v) => { v.value = U.num(v.value); S.upsert('otherAssets', v); },
      onDelete: isNew ? null : () => S.remove('otherAssets', a.id),
    });
  }

  /** Apply annual appreciation/depreciation pro-rata since valuedOn. */
  function applyDepreciation() {
    let n = 0;
    S.commit((s) => s.otherAssets.forEach((a) => {
      if (!U.num(a.depreciation) || !a.valuedOn) return;
      const days = U.daysBetween(a.valuedOn, U.today());
      if (days < 1) return;
      a.value = U.round(U.num(a.value) * Math.pow(1 + U.num(a.depreciation) / 100, days / 365));
      a.valuedOn = U.today(); n++;
    }));
    UI.toast(n ? `Revalued ${n} assets` : 'Nothing to revalue (set an annual change % on assets)');
  }

  B.views.assets = {
    add: () => edit(null),
    applyDepreciation,
    render(root) {
      const list = S.state.otherAssets;
      const total = U.sum(list, (a) => a.value);
      root.innerHTML = `
        ${UI.pageHead('Other Assets', 'Vehicles, business equity, collectibles, equipment and money owed to you.', `${UI.btn('Revalue', 'reval', { icon: 'refresh' })}${UI.btn('Add asset', 'add', { icon: 'plus', kind: 'primary' })}`)}
        ${list.length ? `<div class="grid g-21">
          ${UI.card({ title: `${list.length} assets · ${U.money(total, 0)}`, cls: 'flush', body: `<table class="tbl"><thead><tr><th>Asset</th><th>Type</th><th class="r">Annual change</th><th class="r">Paid</th><th class="r">Value</th></tr></thead><tbody>${list.map((a) => `<tr class="click" data-act="edit" data-id="${a.id}"><td><b>${U.esc(a.name)}</b>${a.notes ? `<div class="sub">${U.esc(a.notes)}</div>` : ''}</td><td>${UI.tag(S.OTHER_ASSET_TYPES[a.type] || a.type)}</td><td class="r">${a.depreciation ? U.pc(a.depreciation / 100, 1) : '—'}</td><td class="r muted">${a.costBasis ? U.m(a.costBasis, 0) : '—'}</td><td class="r"><b>${U.m(a.value, 0)}</b><div class="sub">${a.valuedOn ? `as of ${U.fmtDate(a.valuedOn)}` : ''}</div></td></tr>`).join('')}</tbody></table>` })}
          ${UI.card({ title: 'By type', body: '<div id="oa"></div>' })}
        </div>` : UI.card({ body: UI.empty('leaf', 'Nothing here yet', 'Add vehicles, a business you own, collectibles, jewelry or loans you\'ve made to others so your net worth is complete.', UI.btn('Add asset', 'add', { icon: 'plus', kind: 'primary' })) })}`;
      if (list.length) {
        const by = {};
        list.forEach((a) => { by[a.type] = (by[a.type] || 0) + U.num(a.value); });
        Ch.donut(root.querySelector('#oa'), { items: Object.entries(by).map(([k, v], i) => ({ label: S.OTHER_ASSET_TYPES[k] || k, value: v, color: Ch.PALETTE[i] })), size: 180 });
      }
      UI.bind(root, { add: () => edit(null), edit: (d) => edit(S.get('otherAssets', d.id)), reval: applyDepreciation });
    },
  };
})(window.BLAM);
