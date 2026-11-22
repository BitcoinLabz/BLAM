/* BLAM — UI kit: icons, modal, dynamic forms, toasts, cards. */
'use strict';
(function (B) {
  const { U } = B;
  const UI = {};

  // ---------------------------------------------------------------- icons (stroke, 24px grid)
  const P = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    networth: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    bank: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 21h18"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
    budget: '<path d="M21 12a9 9 0 11-9-9v9z"/><path d="M15 3.5A9 9 0 0120.5 9H15z"/>',
    repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 013-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 01-3 3H3"/>',
    bitcoin: '<path d="M9 5v14M13 5v2M13 17v2"/><path d="M7 7h7.5a2.5 2.5 0 010 5H7h8a2.5 2.5 0 010 5H7"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
    coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.6-2.4-2.9-5.5-3"/>',
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    loan: '<path d="M12 2v20"/><path d="M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
    gem: '<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M9 3l3 18 3-18"/>',
    leaf: '<path d="M11 20A7 7 0 014 13c0-6 7-10 16-10 0 9-4 16-10 16"/><path d="M4 20c4-6 8-9 12-11"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.6 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.6-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    refresh: '<path d="M21 12a9 9 0 01-15.5 6.3L3 16"/><path d="M3 12a9 9 0 0115.5-6.3L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4.1M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1.1"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    upload: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    bell: '<path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    chevl: '<path d="M15 18l-6-6 6-6"/>',
    chevr: '<path d="M9 18l6-6-6-6"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    users: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    report: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  };
  UI.icon = (name, size = 18) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || P.info}</svg>`;

  // ---------------------------------------------------------------- toast
  UI.toast = (msg, type = 'ok', ms = 3200) => {
    let host = document.getElementById('toasts');
    if (!host) { host = document.createElement('div'); host.id = 'toasts'; document.body.appendChild(host); }
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `${UI.icon(type === 'error' ? 'x' : type === 'warn' ? 'info' : 'check', 16)}<span>${U.esc(msg)}</span>`;
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
  };

  // ---------------------------------------------------------------- modal
  UI.modal = ({ title, body, wide, xwide, footer, onClose }) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${wide ? 'wide' : ''} ${xwide ? 'xwide' : ''}" role="dialog">
      <div class="modal-h"><h3>${U.esc(title || '')}</h3><button class="icon-btn" data-close>${UI.icon('x')}</button></div>
      <div class="modal-b"></div>${footer ? `<div class="modal-f">${footer}</div>` : ''}</div>`;
    const b = back.querySelector('.modal-b');
    if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('in'));
    const close = () => { back.classList.remove('in'); setTimeout(() => back.remove(), 180); document.removeEventListener('keydown', esc); onClose && onClose(); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    back.querySelector('[data-close]').addEventListener('click', close);
    return { el: back, body: b, close, foot: back.querySelector('.modal-f') };
  };

  UI.confirm = (msg, { title = 'Are you sure?', ok = 'Delete', danger = true } = {}) => new Promise((resolve) => {
    let done = false;
    const m = UI.modal({
      title, body: `<p class="muted">${U.esc(msg)}</p>`,
      footer: `<button class="btn ghost" data-no>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${U.esc(ok)}</button>`,
      onClose: () => { if (!done) resolve(false); },
    });
    m.foot.querySelector('[data-no]').onclick = () => m.close();
    m.foot.querySelector('[data-yes]').onclick = () => { done = true; resolve(true); m.close(); };
  });

  // ---------------------------------------------------------------- forms
  /**
   * Schema-driven form.
   * field: { key, label, type: text|number|money|percent|date|select|textarea|checkbox|color|heading,
   *          options, required, placeholder, help, col: 1|2|3 (span of 6-col grid: 6=full,3=half,2=third), show(vals), step, min }
   */
  UI.form = ({ title, fields, values = {}, onSave, onDelete, submitLabel = 'Save', wide, intro }) => {
    const vals = JSON.parse(JSON.stringify(values));
    const get = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), vals);
    const set = (path, v) => {
      const ks = path.split('.'); let o = vals;
      ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
      o[ks[ks.length - 1]] = v;
    };
    const opt = (o) => (typeof o === 'object' ? o : { value: o, label: o });
    const html = fields.map((f, i) => {
      const span = f.col || 6;
      if (f.type === 'heading') return `<div class="f-heading" style="grid-column:span 6" data-fi="${i}">${U.esc(f.label)}${f.help ? `<small>${U.esc(f.help)}</small>` : ''}</div>`;
      const v = get(f.key) ?? f.default ?? '';
      const id = `f_${f.key.replace(/\./g, '_')}`;
      let input;
      switch (f.type) {
        case 'select':
          input = `<select id="${id}" data-k="${f.key}">${(typeof f.options === 'function' ? f.options(vals) : f.options).map(opt).map((o) => `<option value="${U.esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${U.esc(o.label)}</option>`).join('')}</select>`;
          break;
        case 'textarea':
          input = `<textarea id="${id}" data-k="${f.key}" rows="${f.rows || 3}" placeholder="${U.esc(f.placeholder || '')}">${U.esc(v)}</textarea>`;
          break;
        case 'checkbox':
          input = `<label class="switch"><input type="checkbox" id="${id}" data-k="${f.key}" ${v ? 'checked' : ''}><span></span><em>${U.esc(f.checkLabel || '')}</em></label>`;
          break;
        default: {
          const t = ['money', 'percent', 'number'].includes(f.type) ? 'number' : f.type || 'text';
          const pre = f.type === 'money' ? '<span class="adorn">$</span>' : '';
          const post = f.type === 'percent' ? '<span class="adorn r">%</span>' : f.suffix ? `<span class="adorn r">${U.esc(f.suffix)}</span>` : '';
          input = `<div class="inwrap ${pre ? 'has-pre' : ''} ${post ? 'has-post' : ''}">${pre}<input id="${id}" data-k="${f.key}" type="${t}" value="${U.esc(v)}" ${t === 'number' ? `step="${f.step || 'any'}"` : ''} ${f.min != null ? `min="${f.min}"` : ''} placeholder="${U.esc(f.placeholder || '')}" ${f.list ? `list="${id}_dl"` : ''} autocomplete="off">${post}</div>${f.list ? `<datalist id="${id}_dl">${f.list.map((x) => `<option value="${U.esc(x)}">`).join('')}</datalist>` : ''}`;
        }
      }
      return `<div class="field" style="grid-column:span ${span}" data-fi="${i}"><label for="${id}">${U.esc(f.label)}${f.required ? ' <b class="req">*</b>' : ''}</label>${input}${f.help ? `<small class="help">${f.help}</small>` : ''}</div>`;
    }).join('');
    const m = UI.modal({
      title, wide,
      body: `${intro ? `<div class="form-intro">${intro}</div>` : ''}<form class="fgrid" novalidate>${html}</form>`,
      footer: `${onDelete ? `<button class="btn danger ghost" data-del>${UI.icon('trash', 15)} Delete</button>` : ''}<span class="grow"></span><button class="btn ghost" data-close2>Cancel</button><button class="btn primary" data-save>${U.esc(submitLabel)}</button>`,
    });
    const form = m.body.querySelector('form');
    const read = () => {
      fields.forEach((f) => {
        if (f.type === 'heading') return;
        const el = form.querySelector(`[data-k="${f.key}"]`);
        if (!el) return;
        let v;
        if (f.type === 'checkbox') v = el.checked;
        else if (['money', 'percent', 'number'].includes(f.type)) v = el.value === '' ? '' : U.num(el.value);
        else v = el.value;
        set(f.key, v);
      });
    };
    const applyShow = () => {
      read();
      fields.forEach((f, i) => {
        if (!f.show) return;
        const box = form.querySelector(`[data-fi="${i}"]`);
        if (box) box.style.display = f.show(vals) ? '' : 'none';
      });
    };
    form.addEventListener('input', applyShow);
    form.addEventListener('change', applyShow);
    applyShow();
    fields.forEach((f) => f.onChange && form.querySelector(`[data-k="${f.key}"]`)?.addEventListener('change', () => { read(); f.onChange(vals, form, set); }));
    const save = async () => {
      read();
      for (const f of fields) {
        if (!f.required || (f.show && !f.show(vals))) continue;
        const v = get(f.key);
        if (v === '' || v == null) {
          const el = form.querySelector(`[data-k="${f.key}"]`);
          el?.classList.add('invalid'); el?.focus();
          UI.toast(`${f.label} is required`, 'warn');
          return;
        }
      }
      const r = await onSave(vals);
      if (r !== false) m.close();
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); save(); } });
    m.foot.querySelector('[data-save]').onclick = save;
    m.foot.querySelector('[data-close2]').onclick = m.close;
    if (onDelete) m.foot.querySelector('[data-del]').onclick = async () => {
      if (await UI.confirm('This cannot be undone.')) { await onDelete(vals); m.close(); }
    };
    setTimeout(() => form.querySelector('input:not([type=checkbox]),select,textarea')?.focus(), 60);
    return m;
  };

  // ---------------------------------------------------------------- building blocks
  UI.kpi = ({ label, value, sub, icon, accent, spark, cls = '' }) => `
    <div class="kpi ${cls}" ${accent ? `style="--accent:${accent}"` : ''}>
      <div class="kpi-top">${icon ? `<span class="kpi-ic">${UI.icon(icon, 16)}</span>` : ''}<span class="kpi-l">${label}</span></div>
      <div class="kpi-v">${value}</div>
      ${sub ? `<div class="kpi-s">${sub}</div>` : ''}
      ${spark ? `<div class="kpi-spark">${spark}</div>` : ''}
    </div>`;

  UI.card = ({ title, sub, actions = '', body = '', cls = '', id = '' }) => `
    <section class="card ${cls}" ${id ? `id="${id}"` : ''}>
      ${title ? `<header class="card-h"><div><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</div><div class="card-a">${actions}</div></header>` : ''}
      <div class="card-b">${body}</div>
    </section>`;

  UI.empty = (icon, title, text, action = '') => `
    <div class="empty"><div class="empty-ic">${UI.icon(icon, 28)}</div><h4>${U.esc(title)}</h4><p>${text}</p>${action}</div>`;

  UI.pageHead = (title, sub, actions = '') => `
    <div class="page-h"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="page-a">${actions}</div></div>`;

  UI.btn = (label, action, { icon, kind = 'ghost', data = '' } = {}) => `<button class="btn ${kind}" data-act="${action}" ${data}>${icon ? UI.icon(icon, 15) : ''}${label ? `<span>${label}</span>` : ''}</button>`;

  UI.tag = (text, color) => `<span class="tag" ${color ? `style="--tc:${color}"` : ''}>${U.esc(text)}</span>`;

  /** Bind [data-act] clicks inside root to handler map. */
  UI.bind = (root, handlers) => {
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || !root.contains(el)) return;
      const fn = handlers[el.dataset.act];
      if (fn) { e.preventDefault(); fn(el.dataset, el, e); }
    });
  };

  UI.objOptions = (obj) => Object.entries(obj).map(([value, v]) => ({ value, label: typeof v === 'string' ? v : v.label }));

  B.UI = UI;
})(window.BLAM);
