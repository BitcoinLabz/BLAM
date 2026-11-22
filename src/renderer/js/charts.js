/* BLAM — zero-dependency SVG chart engine (line/area, bar, donut, sparkline) with interactive tooltips. */
'use strict';
(function (B) {
  const { U } = B;
  const Ch = {};
  const NS = 'http://www.w3.org/2000/svg';
  Ch.PALETTE = ['#F7931A', '#14B8A6', '#8B5CF6', '#3B82F6', '#EAB308', '#EC4899', '#22C55E', '#F43F5E', '#0EA5E9', '#A3E635', '#94A3B8', '#F97316'];

  function niceTicks(min, max, count = 5) {
    if (min === max) { const d = Math.abs(min) || 1; min -= d * 0.5; max += d * 0.5; }
    const span = max - min;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
    return { lo, hi, ticks };
  }

  const shortMoney = (v) => {
    const a = Math.abs(v), s = v < 0 ? '-' : '';
    if (a >= 1e9) return `${s}$${+(a / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `${s}$${+(a / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${s}$${+(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
    return `${s}$${Math.round(a)}`;
  };
  Ch.shortMoney = shortMoney;

  function tooltip(host) {
    let tip = host.querySelector('.chart-tip');
    if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; host.appendChild(tip); }
    return {
      show(html, x, y) {
        tip.innerHTML = html; tip.style.display = 'block';
        const hw = host.clientWidth, tw = tip.offsetWidth;
        let left = x + 14; if (left + tw > hw) left = x - tw - 14;
        tip.style.left = `${Math.max(0, left)}px`; tip.style.top = `${Math.max(0, y - 10)}px`;
      },
      hide() { tip.style.display = 'none'; },
    };
  }

  function observe(el, draw) {
    el._draw = draw;
    if (el._ro) return;
    let lastW = el.clientWidth;
    el._ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (Math.abs(w - lastW) > 4) { lastW = w; el._draw && el._draw(); }
    });
    el._ro.observe(el);
  }

  function svgEl(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  }

  // ------------------------------------------------------------------ LINE / AREA
  Ch.line = (el, opts) => {
    const draw = () => {
      const series = (opts.series || []).filter((s) => s.data && s.data.length);
      el.classList.add('chart');
      el.innerHTML = '';
      if (!series.length) { el.innerHTML = `<div class="chart-empty">${opts.empty || 'No data yet'}</div>`; return; }
      const W = Math.max(280, el.clientWidth || 600), H = opts.height || 260;
      const pad = { l: opts.yLabelWidth || 58, r: 14, t: 14, b: 26 };
      const isDate = opts.xType !== 'num';
      const xv = (d) => (isDate ? U.parse(d.x).getTime() : d.x);
      let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
      series.forEach((s) => s.data.forEach((d) => {
        const x = xv(d); if (x < xmin) xmin = x; if (x > xmax) xmax = x;
        if (d.y < ymin) ymin = d.y; if (d.y > ymax) ymax = d.y;
      }));
      if (opts.zeroBase !== false && ymin > 0 && opts.zeroBase) ymin = 0;
      if (opts.yMin != null) ymin = Math.min(ymin, opts.yMin);
      if (xmin === xmax) { xmin -= 86400000; xmax += 86400000; }
      const { lo, hi, ticks } = niceTicks(ymin, ymax, opts.ticks || 5);
      const sx = (x) => pad.l + ((x - xmin) / (xmax - xmin)) * (W - pad.l - pad.r);
      const sy = (y) => pad.t + (1 - (y - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
      const yFmt = opts.yFmt || shortMoney;

      const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart-svg' });
      const defs = svgEl('defs', {}, svg);
      // grid + y labels
      ticks.forEach((t) => {
        svgEl('line', { x1: pad.l, x2: W - pad.r, y1: sy(t), y2: sy(t), class: t === 0 ? 'grid zero' : 'grid' }, svg);
        const tx = svgEl('text', { x: pad.l - 8, y: sy(t) + 4, class: 'axis', 'text-anchor': 'end' }, svg);
        tx.textContent = yFmt(t);
      });
      // x labels
      const xCount = Math.max(2, Math.min(opts.xTicks || 6, Math.floor((W - pad.l) / 90)));
      for (let i = 0; i < xCount; i++) {
        const x = xmin + ((xmax - xmin) * i) / (xCount - 1);
        const tx = svgEl('text', { x: sx(x), y: H - 6, class: 'axis', 'text-anchor': i === 0 ? 'start' : i === xCount - 1 ? 'end' : 'middle' }, svg);
        tx.textContent = opts.xFmt ? opts.xFmt(x) : isDate ? new Date(x).toLocaleDateString('en-US', (xmax - xmin) > 400 * 86400000 ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric' }) : Math.round(x);
      }
      // markers (vertical reference lines)
      (opts.markers || []).forEach((m) => {
        const x = sx(isDate ? U.parse(m.x).getTime() : m.x);
        if (x < pad.l || x > W - pad.r) return;
        svgEl('line', { x1: x, x2: x, y1: pad.t, y2: H - pad.b, stroke: m.color || '#64748B', 'stroke-dasharray': '4 4', 'stroke-width': 1 }, svg);
        const t = svgEl('text', { x: x + 4, y: pad.t + 10, class: 'axis marker-label', fill: m.color || '#94A3B8' }, svg);
        t.textContent = m.label;
      });
      // series
      series.forEach((s, si) => {
        const color = s.color || Ch.PALETTE[si % Ch.PALETTE.length];
        const pts = s.data.map((d) => [sx(xv(d)), sy(d.y)]);
        const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
        if (s.area !== false && (opts.area || s.area)) {
          const gid = `g${Math.random().toString(36).slice(2, 8)}`;
          const g = svgEl('linearGradient', { id: gid, x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
          svgEl('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.32 }, g);
          svgEl('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0.01 }, g);
          const base = sy(Math.max(lo, Math.min(0, hi)));
          svgEl('path', { d: `${path}L${pts[pts.length - 1][0]},${base}L${pts[0][0]},${base}Z`, fill: `url(#${gid})` }, svg);
        }
        svgEl('path', { d: path, fill: 'none', stroke: color, 'stroke-width': s.width || 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': s.dashed ? '6 5' : 'none' }, svg);
        if (pts.length === 1) svgEl('circle', { cx: pts[0][0], cy: pts[0][1], r: 4, fill: color }, svg);
      });
      // hover layer
      const cross = svgEl('line', { y1: pad.t, y2: H - pad.b, class: 'crosshair', visibility: 'hidden' }, svg);
      const dots = series.map((s, si) => svgEl('circle', { r: 4.5, fill: s.color || Ch.PALETTE[si % Ch.PALETTE.length], stroke: '#0b0f17', 'stroke-width': 2, visibility: 'hidden' }, svg));
      const overlay = svgEl('rect', { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, fill: 'transparent' }, svg);
      el.appendChild(svg);
      if (opts.legend !== false && series.length > 1) {
        const lg = document.createElement('div'); lg.className = 'chart-legend';
        lg.innerHTML = series.map((s, i) => `<span><i style="background:${s.color || Ch.PALETTE[i % Ch.PALETTE.length]}${s.dashed ? ';opacity:.6' : ''}"></i>${U.esc(s.name)}</span>`).join('');
        el.appendChild(lg);
      }
      const tip = tooltip(el);
      overlay.addEventListener('mousemove', (ev) => {
        const rect = svg.getBoundingClientRect();
        const mx = ((ev.clientX - rect.left) / rect.width) * W;
        const xval = xmin + ((mx - pad.l) / (W - pad.l - pad.r)) * (xmax - xmin);
        let rows = [], cx = null;
        series.forEach((s, si) => {
          let best = null, bd = Infinity;
          for (const d of s.data) { const dd = Math.abs(xv(d) - xval); if (dd < bd) { bd = dd; best = d; } }
          if (!best) return;
          const px = sx(xv(best)), py = sy(best.y);
          if (cx === null) cx = px;
          dots[si].setAttribute('cx', px); dots[si].setAttribute('cy', py); dots[si].setAttribute('visibility', 'visible');
          rows.push({ s, d: best, color: s.color || Ch.PALETTE[si % Ch.PALETTE.length] });
        });
        if (cx === null) return;
        cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
        const head = rows[0].d.label || (isDate ? U.fmtDate(rows[0].d.x) : (opts.xFmt ? opts.xFmt(rows[0].d.x) : rows[0].d.x));
        const tf = opts.tipFmt || ((v) => U.money(v, Math.abs(v) >= 1000 ? 0 : 2));
        tip.show(`<div class="tip-h">${U.esc(head)}</div>${rows.map((r) => `<div class="tip-r"><i style="background:${r.color}"></i>${U.esc(r.s.name || '')}<b class="amt">${tf(r.d.y)}</b></div>`).join('')}`,
          (cx / W) * rect.width, ((ev.clientY - rect.top)));
      });
      overlay.addEventListener('mouseleave', () => { tip.hide(); cross.setAttribute('visibility', 'hidden'); dots.forEach((d) => d.setAttribute('visibility', 'hidden')); });
    };
    draw();
    observe(el, draw);
  };

  // ------------------------------------------------------------------ BAR
  Ch.bar = (el, opts) => {
    const draw = () => {
      el.classList.add('chart');
      el.innerHTML = '';
      const labels = opts.labels || [];
      const series = opts.series || [];
      if (!labels.length || !series.length) { el.innerHTML = `<div class="chart-empty">${opts.empty || 'No data yet'}</div>`; return; }
      const W = Math.max(280, el.clientWidth || 600), H = opts.height || 240;
      const pad = { l: opts.yLabelWidth || 58, r: 10, t: 12, b: 26 };
      let ymin = 0, ymax = 0;
      labels.forEach((_, i) => {
        if (opts.stacked) {
          let pos = 0, neg = 0;
          series.forEach((s) => { const v = s.values[i] || 0; if (v >= 0) pos += v; else neg += v; });
          ymax = Math.max(ymax, pos); ymin = Math.min(ymin, neg);
        } else series.forEach((s) => { const v = s.values[i] || 0; ymax = Math.max(ymax, v); ymin = Math.min(ymin, v); });
      });
      if (ymax === 0 && ymin === 0) ymax = 1;
      const { lo, hi, ticks } = niceTicks(ymin, ymax, 4);
      const sy = (y) => pad.t + (1 - (y - lo) / (hi - lo)) * (H - pad.t - pad.b);
      const yFmt = opts.yFmt || shortMoney;
      const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart-svg' });
      ticks.forEach((t) => {
        svgEl('line', { x1: pad.l, x2: W - pad.r, y1: sy(t), y2: sy(t), class: t === 0 ? 'grid zero' : 'grid' }, svg);
        const tx = svgEl('text', { x: pad.l - 8, y: sy(t) + 4, class: 'axis', 'text-anchor': 'end' }, svg); tx.textContent = yFmt(t);
      });
      const band = (W - pad.l - pad.r) / labels.length;
      const groupW = Math.min(band * 0.72, opts.maxBar || 64);
      const showEvery = Math.ceil(labels.length / Math.floor((W - pad.l) / 46));
      const tip = tooltip(el);
      labels.forEach((lab, i) => {
        const cx = pad.l + band * i + band / 2;
        if (i % showEvery === 0) { const tx = svgEl('text', { x: cx, y: H - 7, class: 'axis', 'text-anchor': 'middle' }, svg); tx.textContent = lab; }
        let posAcc = 0, negAcc = 0;
        series.forEach((s, si) => {
          const v = s.values[i] || 0;
          const color = s.color || Ch.PALETTE[si % Ch.PALETTE.length];
          let x, w, y0, y1;
          if (opts.stacked) {
            w = groupW; x = cx - w / 2;
            if (v >= 0) { y0 = posAcc; y1 = posAcc + v; posAcc = y1; } else { y0 = negAcc; y1 = negAcc + v; negAcc = y1; }
          } else {
            w = groupW / series.length; x = cx - groupW / 2 + w * si; y0 = 0; y1 = v;
          }
          const top = sy(Math.max(y0, y1)), bot = sy(Math.min(y0, y1));
          const r = svgEl('rect', { x: x + (opts.stacked ? 0 : 1), y: top, width: Math.max(1, w - (opts.stacked ? 0 : 2)), height: Math.max(0, bot - top), rx: Math.min(4, w / 4), fill: (s.colorFn ? s.colorFn(v) : color), class: 'bar' }, svg);
          r.dataset.i = i;
        });
        const hit = svgEl('rect', { x: pad.l + band * i, y: pad.t, width: band, height: H - pad.t - pad.b, fill: 'transparent' }, svg);
        hit.addEventListener('mousemove', (ev) => {
          const rect = svg.getBoundingClientRect();
          const tf = opts.tipFmt || ((v) => U.money(v, 0));
          const rows = series.map((s, si) => `<div class="tip-r"><i style="background:${s.colorFn ? s.colorFn(s.values[i] || 0) : (s.color || Ch.PALETTE[si % Ch.PALETTE.length])}"></i>${U.esc(s.name)}<b class="amt">${tf(s.values[i] || 0)}</b></div>`).join('');
          const total = opts.stacked && series.length > 1 ? `<div class="tip-r tip-total">Total<b class="amt">${tf(series.reduce((a, s) => a + (s.values[i] || 0), 0))}</b></div>` : '';
          tip.show(`<div class="tip-h">${U.esc(opts.tipLabels ? opts.tipLabels[i] : lab)}</div>${rows}${total}`, ((cx) / W) * rect.width, ev.clientY - rect.top);
          hit.setAttribute('fill', 'rgba(255,255,255,0.03)');
        });
        hit.addEventListener('mouseleave', () => { tip.hide(); hit.setAttribute('fill', 'transparent'); });
        if (opts.onClick) { hit.style.cursor = 'pointer'; hit.addEventListener('click', () => opts.onClick(i)); }
      });
      el.appendChild(svg);
      if (opts.legend !== false && series.length > 1) {
        const lg = document.createElement('div'); lg.className = 'chart-legend';
        lg.innerHTML = series.map((s, i) => `<span><i style="background:${s.color || Ch.PALETTE[i % Ch.PALETTE.length]}"></i>${U.esc(s.name)}</span>`).join('');
        el.appendChild(lg);
      }
    };
    draw();
    observe(el, draw);
  };

  // ------------------------------------------------------------------ DONUT
  Ch.donut = (el, opts) => {
    el.classList.add('chart', 'donut-wrap');
    let items = (opts.items || []).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
    const maxSeg = opts.max || 9;
    if (items.length > maxSeg) {
      const rest = items.slice(maxSeg - 1);
      items = [...items.slice(0, maxSeg - 1), { label: `Other (${rest.length})`, value: rest.reduce((a, b) => a + b.value, 0), color: '#475569' }];
    }
    const total = items.reduce((a, b) => a + b.value, 0);
    if (!total) { el.innerHTML = `<div class="chart-empty">${opts.empty || 'No data yet'}</div>`; return; }
    const size = opts.size || 210, th = opts.thickness || 26, R = size / 2, r = R - th;
    const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'donut-svg' });
    let a0 = -Math.PI / 2;
    const arcs = [];
    items.forEach((it, i) => {
      const frac = it.value / total;
      const a1 = a0 + frac * Math.PI * 2 - (items.length > 1 ? 0.012 : 0);
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const color = it.color || Ch.PALETTE[i % Ch.PALETTE.length];
      let d;
      if (items.length === 1) {
        d = `M${R},${R - R + 0.01} A${R - 0.01},${R - 0.01} 0 1 1 ${R - 0.01},${0.01} Z M${R},${th} A${r},${r} 0 1 0 ${R + 0.01},${th} Z`;
        svgEl('circle', { cx: R, cy: R, r: R - th / 2, fill: 'none', stroke: color, 'stroke-width': th }, svg);
      } else {
        const p = (ang, rad) => `${R + rad * Math.cos(ang)},${R + rad * Math.sin(ang)}`;
        d = `M${p(a0, R)} A${R},${R} 0 ${large} 1 ${p(a1, R)} L${p(a1, r)} A${r},${r} 0 ${large} 0 ${p(a0, r)} Z`;
        const path = svgEl('path', { d, fill: color, class: 'donut-seg' }, svg);
        arcs.push({ path, it, frac });
      }
      a0 += frac * Math.PI * 2;
    });
    const center = document.createElement('div');
    center.className = 'donut-center';
    const setCenter = (top, bottom) => { center.innerHTML = `<div class="dc-top amt">${top}</div><div class="dc-bot">${bottom}</div>`; };
    const defTop = opts.centerTop ?? U.moneyShort(total), defBot = opts.centerBottom ?? 'Total';
    setCenter(defTop, defBot);
    const ring = document.createElement('div'); ring.className = 'donut-ring'; ring.style.width = ring.style.height = `${size}px`;
    ring.appendChild(svg); ring.appendChild(center);
    el.innerHTML = '';
    el.appendChild(ring);
    if (opts.legend !== false) {
      const lg = document.createElement('div'); lg.className = 'donut-legend';
      lg.innerHTML = items.map((it, i) => `<div class="dl-row" data-i="${i}"><i style="background:${it.color || Ch.PALETTE[i % Ch.PALETTE.length]}"></i><span class="dl-l">${U.esc(it.label)}</span><span class="dl-v amt">${U.moneyShort(it.value)}</span><span class="dl-p">${((it.value / total) * 100).toFixed(1)}%</span></div>`).join('');
      el.appendChild(lg);
      lg.querySelectorAll('.dl-row').forEach((row) => {
        const i = +row.dataset.i;
        row.addEventListener('mouseenter', () => { arcs[i]?.path.classList.add('hot'); setCenter(U.moneyShort(items[i].value), U.esc(items[i].label)); });
        row.addEventListener('mouseleave', () => { arcs[i]?.path.classList.remove('hot'); setCenter(defTop, defBot); });
      });
    }
    arcs.forEach(({ path, it, frac }) => {
      path.addEventListener('mouseenter', () => { path.classList.add('hot'); setCenter(U.moneyShort(it.value), `${U.esc(it.label)} · ${(frac * 100).toFixed(1)}%`); });
      path.addEventListener('mouseleave', () => { path.classList.remove('hot'); setCenter(defTop, defBot); });
    });
  };

  // ------------------------------------------------------------------ SPARKLINE (string)
  Ch.spark = (values, color = '#F7931A', w = 120, h = 34) => {
    const v = (values || []).filter((x) => Number.isFinite(x));
    if (v.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
    const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
    const pts = v.map((y, i) => [(i / (v.length - 1)) * w, h - 3 - ((y - min) / span) * (h - 6)]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    const id = `sp${Math.random().toString(36).slice(2, 7)}`;
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="spark"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${d}L${w},${h}L0,${h}Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  };

  /** Horizontal progress bar markup. */
  Ch.progress = (frac, color, opts = {}) => {
    const f = U.clamp(frac || 0, 0, 1);
    const over = frac > 1;
    return `<div class="pbar ${opts.small ? 'sm' : ''}"><div class="pfill ${over ? 'over' : ''}" style="width:${(f * 100).toFixed(1)}%;${color ? `background:${color}` : ''}"></div></div>`;
  };

  B.Ch = Ch;
})(window.BLAM);
