// Charts for the reckoning. Each chart reads the JSON block inside its figure,
// renders an SVG at the figure's real width, and animates when it scrolls in.
// Colors come from CSS classes (f-accent, f-cool, ...) so they live in one place.

const NS = 'http://www.w3.org/2000/svg';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
let uid = 0;

function el(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

function txt(parent, x, y, str, cls, anchor = 'start') {
  const t = el('text', { x, y, class: cls || '', 'text-anchor': anchor }, parent);
  t.textContent = str;
  return t;
}

function svgRoot(w, h) {
  return el('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, 'aria-hidden': 'true', focusable: 'false' });
}

// Rounded rectangle with independent corner radii [tl, tr, br, bl].
function roundRect(x, y, w, h, r) {
  const [tl, tr, br, bl] = r.map((v) => Math.max(0, Math.min(v, w / 2, h / 2)));
  return `M${x + tl},${y}H${x + w - tr}${tr ? `A${tr},${tr} 0 0 1 ${x + w},${y + tr}` : ''}V${y + h - br}${br ? `A${br},${br} 0 0 1 ${x + w - br},${y + h}` : ''}H${x + bl}${bl ? `A${bl},${bl} 0 0 1 ${x},${y + h - bl}` : ''}V${y + tl}${tl ? `A${tl},${tl} 0 0 1 ${x + tl},${y}` : ''}Z`;
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function tween(ms, fn, done) {
  if (REDUCED || ms <= 0) { fn(1); if (done) done(); return () => {}; }
  let raf = 0;
  const t0 = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / ms);
    fn(easeOut(p));
    if (p < 1) raf = requestAnimationFrame(tick);
    else if (done) done();
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

const fmt = (v) => v.toLocaleString('en-US');

// Height left for a chart inside a sticky scrolly panel, after its caption,
// legend and notes. Outside a scrolly there is no limit.
function fitHeight(fig, body) {
  if (!fig.closest('.scrolly-graphic')) return Infinity;
  let chrome = 0;
  for (const c of fig.children) {
    if (c === body || c.tagName === 'SCRIPT') continue;
    const cs = getComputedStyle(c);
    if (cs.display === 'none') continue;
    chrome += c.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
  }
  // On narrow screens the step cards need the lower part of the screen.
  const room = innerWidth < 1000 ? innerHeight * 0.64 : innerHeight - 56 - 36;
  return Math.max(160, room - chrome);
}

/* ---------------- tooltip ---------------- */

const tipEl = () => document.querySelector('[data-tip]');
const COLOR_VAR = { accent: '--accent', accent2: '--accent-2', cool: '--cool', context: '--context' };

export function showTip(x, y, value, label, color) {
  const tip = tipEl();
  if (!tip) return;
  tip.replaceChildren();
  const v = document.createElement('span');
  v.className = 'tip-v';
  v.textContent = value;
  tip.appendChild(v);
  if (label) {
    const l = document.createElement('span');
    l.className = 'tip-l';
    if (color) {
      const k = document.createElement('i');
      k.className = 'tip-key';
      k.style.background = `var(${COLOR_VAR[color] || '--ink-3'})`;
      l.appendChild(k);
    }
    const s = document.createElement('span');
    s.textContent = label;
    l.appendChild(s);
    tip.appendChild(l);
  }
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let left = x + 14;
  let top = y - r.height - 12;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (top < 64) top = y + 18;
  tip.style.transform = `translate(${Math.max(8, left)}px, ${top}px)`;
}

export function hideTip() {
  const tip = tipEl();
  if (tip) tip.hidden = true;
}

// Hover, touch and keyboard all show the same readout.
function bindTip(node, get) {
  const show = (e) => {
    const info = get(e);
    if (!info) return hideTip();
    let x, y;
    if (e && 'clientX' in e && e.clientX) { x = e.clientX; y = e.clientY; } else {
      const r = (info.anchor || node).getBoundingClientRect();
      x = r.left + r.width / 2; y = r.top;
    }
    showTip(x, y, info.value, info.label, info.color);
    if (info.onHot) info.onHot(true);
  };
  const hide = () => { hideTip(); const info = get(null); if (info && info.onHot) info.onHot(false); };
  node.addEventListener('pointermove', show);
  node.addEventListener('pointerdown', show);
  node.addEventListener('pointerleave', hide);
  node.addEventListener('focus', show);
  node.addEventListener('blur', hide);
}

/* ---------------- legend ---------------- */

function legend(fig, items) {
  const box = fig.querySelector('[data-legend]');
  if (!box) return;
  box.replaceChildren();
  for (const it of items) {
    const k = document.createElement('span');
    k.className = 'key';
    const sw = document.createElement('i');
    sw.className = `sw c-${it.color}${it.dot ? ' sw-dot' : ''}`;
    k.appendChild(sw);
    const l = document.createElement('span');
    l.textContent = it.label;
    k.appendChild(l);
    if (it.value != null) {
      const b = document.createElement('b');
      b.textContent = it.value;
      k.appendChild(b);
    }
    box.appendChild(k);
  }
}

/* ---------------- unit grids (waffle, seats, survey) ---------------- */

function units(fig, d, opt) {
  const body = fig.querySelector('[data-body]');
  const n = d.groups.reduce((s, g) => s + g.v, 0);
  const owner = [];
  d.groups.forEach((g, gi) => { for (let i = 0; i < Math.round(g.v); i++) owner.push(gi); });
  const unitLabel = opt.unitLabel || ((g) => `${g.v}${opt.suffix || ''}`);
  legend(fig, d.groups.map((g) => ({ label: g.label, color: g.color, value: unitLabel(g) })));
  let cells = [];
  let entered = false;
  let hot = -1;

  function paint(animate) {
    cells.forEach((c, i) => {
      const g = d.groups[owner[i]];
      c.style.setProperty('--d', animate ? `${Math.round(i * opt.stagger)}ms` : '0ms');
      c.setAttribute('class', `cell mark ${entered ? `f-${g.color}` : 'f-empty'}${hot === owner[i] ? ' is-hot' : ''}`);
    });
  }

  function render(w) {
    const cols = opt.cols(w);
    const rows = Math.ceil(n / cols);
    const gap = opt.gap || 2;
    const size = Math.min(opt.max, (w - gap * (cols - 1)) / cols);
    const W = cols * size + gap * (cols - 1);
    const H = rows * size + gap * (rows - 1);
    const s = svgRoot(W, H);
    s.style.maxWidth = `${W}px`;
    cells = [];
    for (let i = 0; i < n; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const shape = opt.round
        ? el('circle', { cx: c * (size + gap) + size / 2, cy: r * (size + gap) + size / 2, r: size / 2 }, s)
        : el('rect', { x: c * (size + gap), y: r * (size + gap), width: size, height: size, rx: Math.min(3, size * 0.16) }, s);
      shape.dataset.i = i;
      cells.push(shape);
    }
    body.replaceChildren(s);
    body.classList.toggle('is-hovering', hot >= 0);
    paint(false);
    bindTip(s, (e) => {
      if (!e) { hot = -1; body.classList.remove('is-hovering'); paint(false); return null; }
      const t = e.target && e.target.dataset ? e.target.dataset.i : undefined;
      if (t === undefined || !entered) return null;
      const gi = owner[+t];
      const g = d.groups[gi];
      if (hot !== gi) { hot = gi; body.classList.add('is-hovering'); paint(false); }
      return { value: unitLabel(g), label: g.label, color: g.color };
    });
  }

  return {
    render,
    enter() { if (entered) return; entered = true; paint(true); },
  };
}

/* ---------------- capex: unit grid driven by scroll steps ---------------- */

function capex(fig, d) {
  const body = fig.querySelector('[data-body]');
  const readout = document.createElement('p');
  readout.className = 'readout';
  readout.innerHTML = '<span class="readout-v"></span><span class="readout-l"></span>';
  fig.querySelector('.viz-head').after(readout);
  const rv = readout.firstChild;
  const rl = readout.lastChild;
  let cells = [];
  let step = 0;
  let prev = 0;

  const state = {
    0: { v: '$0', l: 'Scroll to count', legend: [] },
    1: { v: '$410bn', l: 'spent in 2025', legend: [{ label: '2025 spending', color: 'context', value: '$410bn' }] },
    2: { v: '$725bn', l: 'planned for 2026', legend: [{ label: '2025 level', color: 'context', value: '$410bn' }, { label: 'Added for 2026', color: 'accent', value: '+$315bn' }] },
    3: { v: '$200bn', l: 'Amazon alone, 2026', legend: [{ label: 'Amazon', color: 'cool', value: '$200bn' }, { label: 'Alphabet, Microsoft and Meta', color: 'context', value: '$525bn' }] },
  };

  function classFor(i, s) {
    if (s >= 3) return i < d.amazon ? 'f-cool' : 'f-context';
    if (s >= 2) return i < d.base ? 'f-context' : 'f-accent';
    if (s >= 1) return i < d.base ? 'f-context' : 'f-empty';
    return 'f-empty';
  }

  function paint(animate) {
    const forward = step > prev;
    cells.forEach((c, i) => {
      let delay = 0;
      if (animate && forward) {
        if (step === 1) delay = i * 1.1;
        else if (step === 2) delay = Math.max(0, i - d.base) * 1.6;
        else if (step === 3) delay = (i < d.amazon ? i : i - d.amazon) * 0.6;
      }
      c.style.setProperty('--d', `${Math.round(delay)}ms`);
      c.setAttribute('class', `cell ${classFor(i, step)}`);
    });
    const st = state[step];
    rv.textContent = st.v;
    rl.textContent = st.l;
    legend(fig, st.legend);
  }

  function render(w) {
    const cols = w >= 620 ? 29 : 25;
    const rows = Math.ceil(d.total / cols);
    const gap = 2;
    const size = Math.min((w - gap * (cols - 1)) / cols, (fitHeight(fig, body) - gap * (rows - 1)) / rows);
    const W = cols * size + gap * (cols - 1);
    const H = rows * size + gap * (rows - 1);
    const s = svgRoot(W, H);
    s.style.maxWidth = `${W}px`;
    cells = [];
    for (let i = 0; i < d.total; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const rect = el('rect', { x: c * (size + gap), y: r * (size + gap), width: size, height: size, rx: Math.min(2.5, size * 0.18) }, s);
      rect.dataset.i = i;
      cells.push(rect);
    }
    body.replaceChildren(s);
    prev = step;
    paint(false);
    bindTip(s, (e) => {
      if (!e) return null;
      const t = e.target && e.target.dataset ? e.target.dataset.i : undefined;
      if (t === undefined || step === 0) return null;
      const i = +t;
      if (step >= 3) return i < d.amazon ? { value: '$200bn', label: 'Amazon, planned for 2026', color: 'cool' } : { value: '$525bn', label: 'Alphabet, Microsoft and Meta, 2026', color: 'context' };
      if (i < d.base) return { value: '$410bn', label: 'Spent by the four in 2025', color: 'context' };
      if (step >= 2) return { value: '+$315bn', label: 'Added for 2026', color: 'accent' };
      return null;
    });
  }

  return {
    render,
    step(n) { if (n === step) return; prev = step; step = n; paint(true); },
    enter() {},
  };
}

/* ---------------- deepfake dots, driven by scroll steps ---------------- */

function dots(fig, d) {
  const body = fig.querySelector('[data-body]');
  const readout = document.createElement('p');
  readout.className = 'readout';
  readout.innerHTML = '<span class="readout-v"></span><span class="readout-l"></span>';
  fig.querySelector('.viz-head').after(readout);
  const rv = readout.firstChild;
  const rl = readout.lastChild;
  const n = Math.round(d.steps[d.steps.length - 1].v / d.per);
  const lit = d.steps.map((s) => Math.round(s.v / d.per));
  let cells = [];
  let step = 0;
  let prev = 0;

  function paint(animate) {
    const k = step === 0 ? 0 : lit[step - 1];
    const from = step > prev && prev > 0 ? lit[prev - 1] : 0;
    cells.forEach((c, i) => {
      const delay = animate && step > prev && i >= from ? (i - from) * (step === 1 ? 14 : 2.2) : 0;
      c.style.setProperty('--d', `${Math.round(delay)}ms`);
      c.setAttribute('class', `cell ${i < k ? (step === 2 && i < lit[0] ? 'f-context' : 'f-accent') : 'f-empty'}`);
    });
    if (step === 0) { rv.textContent = '0'; rl.textContent = 'Scroll to count'; }
    else { const s = d.steps[step - 1]; rv.textContent = s.label; rl.textContent = `deepfakes shared in ${s.year}`; }
  }

  function render(w) {
    const cols = w >= 620 ? 25 : 20;
    const rows = Math.ceil(n / cols);
    const gap = w >= 620 ? 6 : 4;
    const size = Math.min(22, (w - gap * (cols - 1)) / cols, (fitHeight(fig, body) - gap * (rows - 1)) / rows);
    const W = cols * size + gap * (cols - 1);
    const H = rows * size + gap * (rows - 1);
    const s = svgRoot(W, H);
    s.style.maxWidth = `${W}px`;
    cells = [];
    for (let i = 0; i < n; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const dot = el('circle', { cx: c * (size + gap) + size / 2, cy: r * (size + gap) + size / 2, r: size / 2 }, s);
      dot.dataset.i = i;
      cells.push(dot);
    }
    body.replaceChildren(s);
    prev = step;
    paint(false);
    bindTip(s, (e) => {
      if (!e || step === 0) return null;
      const t = e.target && e.target.dataset ? e.target.dataset.i : undefined;
      if (t === undefined) return null;
      const i = +t;
      if (i < lit[0]) return { value: '500,000', label: 'Shared in 2023', color: step === 2 ? 'context' : 'accent' };
      if (step === 2) return { value: '8 million', label: 'Shared in 2025', color: 'accent' };
      return null;
    });
  }

  return {
    render,
    step(k) { if (k === step) return; prev = step; step = k; paint(true); },
    enter() {},
  };
}

/* ---------------- line with projection ---------------- */

function lineChart(fig, d) {
  const body = fig.querySelector('[data-body]');
  let entered = false;
  let reveal = null;
  let geom = null;

  function render(w) {
    const narrow = w < 560;
    const m = { t: 22, r: narrow ? 58 : 170, b: 30, l: 46 };
    const h = Math.round(Math.max(250, Math.min(380, w * 0.44)));
    const iw = w - m.l - m.r;
    const ih = h - m.t - m.b;
    const x = (v) => m.l + ((v - d.xMin) / (d.xMax - d.xMin)) * iw;
    const y = (v) => m.t + ih - (v / d.yMax) * ih;
    const s = svgRoot(w, h);

    d.yTicks.forEach((t, i) => {
      el('line', { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t), class: t === 0 ? 'axis' : 'grid' }, s);
      txt(s, m.l - 10, y(t) + 4, fmt(t), '', 'end');
      if (i === d.yTicks.length - 1) txt(s, m.l + 6, y(t) - 8, d.unit, '', 'start');
    });
    const years = narrow ? [2024, 2026, 2028, 2030] : [2024, 2025, 2026, 2027, 2028, 2029, 2030];
    years.forEach((yr) => txt(s, x(yr), h - 8, String(yr), '', 'middle'));

    const id = `clip${++uid}`;
    const clip = el('rect', { x: m.l - 12, y: 0, width: entered ? w : 0, height: h }, el('clipPath', { id }, el('defs', null, s)));
    const g = el('g', { 'clip-path': `url(#${id})` }, s);
    const P = d.points;
    const solid = P.filter((p) => !p.proj);
    const last = solid[solid.length - 1];
    const proj = P.filter((p) => p.proj);
    const area = (pts, fill) => el('path', { d: `M${x(pts[0].x)},${y(0)}${pts.map((p) => `L${x(p.x)},${y(p.y)}`).join('')}L${x(pts[pts.length - 1].x)},${y(0)}Z`, fill }, g);
    area(solid, 'var(--accent-wash)');
    area([last, ...proj], 'rgba(212, 120, 46, 0.045)');
    el('path', { d: `M${solid.map((p) => `${x(p.x)},${y(p.y)}`).join('L')}`, fill: 'none', class: 's-accent', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    el('path', { d: `M${x(last.x)},${y(last.y)}${proj.map((p) => `L${x(p.x)},${y(p.y)}`).join('')}`, fill: 'none', class: 's-accent', 'stroke-width': 2, 'stroke-dasharray': '2 6', 'stroke-linecap': 'round' }, g);

    const cross = el('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ih, class: 'axis', opacity: 0 }, s);
    const marks = P.map((p) => {
      const c = el('circle', { cx: x(p.x), cy: y(p.y), r: 4.5, class: 'f-accent', stroke: 'var(--bg)', 'stroke-width': 2, tabindex: 0, role: 'img', 'aria-label': `${p.x}${p.proj ? ', projected' : ''}: ${p.y} ${d.unit}` }, g);
      return c;
    });
    // direct labels: values at the points, the projection note at the end
    const lab = el('g', null, g);
    txt(lab, x(P[0].x) + 8, y(P[0].y) + 20, P[0].label, 't-val');
    txt(lab, x(P[1].x) + 8, y(P[1].y) - 12, P[1].label, 't-val');
    const endP = P[P.length - 1];
    txt(lab, x(endP.x) + 12, y(endP.y) + 5, `${endP.label}${narrow ? '' : ' TWh'}`, 't-val');
    if (!narrow && endP.note) {
      txt(lab, x(endP.x) + 12, y(endP.y) + 24, 'projected, 2030', 't-note');
      txt(lab, x(endP.x) + 12, y(endP.y) + 42, endP.note, 't-note');
    }

    const hit = el('rect', { x: m.l, y: m.t, width: iw + 12, height: ih, fill: 'transparent' }, s);
    body.replaceChildren(s);
    geom = { clip, w };
    const nearest = (cx) => {
      let best = 0;
      P.forEach((p, i) => { if (Math.abs(x(p.x) - cx) < Math.abs(x(P[best].x) - cx)) best = i; });
      return best;
    };
    const setHot = (i) => {
      marks.forEach((mk, j) => mk.setAttribute('r', j === i ? 6 : 4.5));
      if (i < 0) { cross.setAttribute('opacity', 0); return; }
      cross.setAttribute('x1', x(P[i].x)); cross.setAttribute('x2', x(P[i].x)); cross.setAttribute('opacity', 1);
    };
    const info = (i) => ({ value: `${P[i].label.replace('≈', 'about ')} ${d.unit}`, label: P[i].proj ? `${P[i].x}, IEA projection` : String(P[i].x), color: 'accent' });
    hit.addEventListener('pointermove', (e) => {
      if (!entered) return;
      const r = s.getBoundingClientRect();
      const i = nearest(e.clientX - r.left);
      setHot(i);
      const mr = marks[i].getBoundingClientRect();
      const inf = info(i);
      showTip(mr.left + mr.width / 2, mr.top, inf.value, inf.label, inf.color);
    });
    hit.addEventListener('pointerleave', () => { setHot(-1); hideTip(); });
    marks.forEach((mk, i) => {
      mk.addEventListener('focus', () => { setHot(i); const mr = mk.getBoundingClientRect(); const inf = info(i); showTip(mr.left + mr.width / 2, mr.top, inf.value, inf.label, inf.color); });
      mk.addEventListener('blur', () => { setHot(-1); hideTip(); });
    });
  }

  return {
    render,
    enter() {
      if (entered) return;
      entered = true;
      if (reveal) reveal();
      const target = geom.w;
      reveal = tween(1800, (p) => geom.clip.setAttribute('width', target * p));
    },
  };
}

/* ---------------- meter ---------------- */

function meter(fig, d) {
  const body = fig.querySelector('[data-body]');
  let entered = false;
  let fill = null;
  let W = 0;

  function render(w) {
    W = w;
    const h = 104;
    const ty = 44;
    const th = 14;
    const x = (v) => (v / 100) * w;
    const s = svgRoot(w, h);
    el('path', { d: roundRect(0, ty, w, th, [4, 4, 4, 4]), class: 'f-accent', opacity: 0.18 }, s);
    fill = el('path', { d: roundRect(0, ty, entered ? x(d.value) : 0, th, [0, 4, 4, 0]), class: 'f-accent mark', tabindex: 0, role: 'img', 'aria-label': d.valueLabel }, s);
    txt(s, x(d.value), ty - 12, d.valueLabel, 't-val', 'start');
    const narrow = w < 560;
    d.marks.forEach((mk, i) => {
      el('line', { x1: x(mk.v), x2: x(mk.v), y1: ty - 5, y2: ty + th + 6, stroke: 'var(--ink-2)', 'stroke-width': 1 }, s);
      const label = `${mk.label} · ${mk.sub}`;
      // On a narrow screen the later mark's label moves above the bar, left of the value.
      if (narrow && i === d.marks.length - 1) txt(s, x(mk.v) - 6, ty - 12, label, 't-note', 'end');
      else txt(s, x(mk.v), ty + th + 22, label, 't-note', narrow ? 'start' : mk.v > 15 ? 'end' : 'middle');
    });
    txt(s, 0, h - 2, '0%', '', 'start');
    txt(s, w, h - 2, '100%', '', 'end');
    body.replaceChildren(s);
    bindTip(fill, (e) => (e ? { value: `${d.value}%`, label: 'Share of Ireland’s metered electricity, 2025', color: 'accent', anchor: fill } : null));
  }

  return {
    render,
    enter() {
      if (entered) return;
      entered = true;
      const target = (d.value / 100) * W;
      tween(1400, (p) => fill.setAttribute('d', roundRect(0, 44, target * p, 14, [0, 4, 4, 0])));
    },
  };
}

/* ---------------- dumbbell (indexed) ---------------- */

function dumbbell(fig, d) {
  const body = fig.querySelector('[data-body]');
  legend(fig, [{ label: 'Baseline year = 100', color: 'context', dot: true }, { label: '2025', color: 'accent', dot: true }]);
  let entered = false;
  let parts = [];

  function render(w) {
    const narrow = w < 520;
    const m = { t: 6, r: 48, b: 28, l: narrow ? 96 : 150 };
    const rowH = 58;
    const h = m.t + d.rows.length * rowH + m.b;
    const iw = w - m.l - m.r;
    const x0 = d.xMin || 0;
    const x = (v) => m.l + ((v - x0) / (d.xMax - x0)) * iw;
    const s = svgRoot(w, h);
    d.xTicks.forEach((t) => {
      el('line', { x1: x(t), x2: x(t), y1: m.t, y2: h - m.b, class: t === 100 ? 'axis' : 'grid' }, s);
      txt(s, x(t), h - 8, String(t), '', 'middle');
    });
    parts = d.rows.map((r, i) => {
      const cy = m.t + i * rowH + rowH / 2;
      txt(s, 0, cy - 2, r.name, 't-name');
      txt(s, 0, cy + 15, `vs ${r.base}`, '');
      const conn = el('line', { x1: x(100), x2: entered ? x(r.v) : x(100), y1: cy, y2: cy, class: 's-context', 'stroke-width': 2, 'stroke-linecap': 'round' }, s);
      el('circle', { cx: x(100), cy, r: 5, class: 'f-context', stroke: 'var(--bg)', 'stroke-width': 2 }, s);
      const end = el('circle', { cx: entered ? x(r.v) : x(100), cy, r: 6, class: 'f-accent mark', stroke: 'var(--bg)', 'stroke-width': 2, tabindex: 0, role: 'img', 'aria-label': `${r.name}: ${r.v} in 2025, ${r.base} = 100` }, s);
      const val = txt(s, entered ? x(r.v) + 14 : x(100) + 14, cy + 5, String(r.v), 't-val');
      if (!entered) val.setAttribute('opacity', 0);
      bindTip(end, (e) => (e ? { value: `${r.v}`, label: `${r.name}, 2025 (${r.base} = 100)`, color: 'accent', anchor: end } : null));
      return { conn, end, val, from: x(100), to: x(r.v) };
    });
    body.replaceChildren(s);
  }

  return {
    render,
    enter() {
      if (entered) return;
      entered = true;
      tween(1500, (p) => parts.forEach((pt) => {
        const cx = pt.from + (pt.to - pt.from) * p;
        pt.conn.setAttribute('x2', cx);
        pt.end.setAttribute('cx', cx);
        pt.val.setAttribute('x', cx + 14);
        pt.val.setAttribute('opacity', p);
      }));
    },
  };
}

/* ---------------- 100% stacked bar ---------------- */

function stack(fig, d) {
  const body = fig.querySelector('[data-body]');
  legend(fig, d.groups.map((g) => ({ label: g.label, color: g.color, value: `${g.v}%` })));
  let entered = false;
  let segs = [];

  function render(w) {
    const h = 64;
    const by = 30;
    const bh = 24;
    const gap = 2;
    const avail = w - gap * (d.groups.length - 1);
    const s = svgRoot(w, h);
    let cx = 0;
    segs = d.groups.map((g, i) => {
      const sw = (g.v / 100) * avail;
      const r = [i === 0 ? 4 : 0, i === d.groups.length - 1 ? 4 : 0, i === d.groups.length - 1 ? 4 : 0, i === 0 ? 4 : 0];
      const path = el('path', { d: roundRect(cx, by, entered ? sw : 0, bh, r), class: `f-${g.color} mark`, tabindex: 0, role: 'img', 'aria-label': `${g.label}: ${g.v}%` }, s);
      const label = `${g.v}%`;
      const t = sw > label.length * 8 + 10 ? txt(s, cx, by - 10, label, 't-val') : null;
      if (t && !entered) t.setAttribute('opacity', 0);
      bindTip(path, (e) => (e ? { value: `${g.v}%`, label: g.label, color: g.color, anchor: path } : null));
      const seg = { path, t, x: cx, w: sw, r };
      cx += sw + gap;
      return seg;
    });
    body.replaceChildren(s);
  }

  return {
    render,
    enter() {
      if (entered) return;
      entered = true;
      tween(1500, (p) => {
        segs.forEach((sg, i) => {
          const local = Math.max(0, Math.min(1, p * segs.length - i * 0.6));
          sg.path.setAttribute('d', roundRect(sg.x, 30, sg.w * local, 24, sg.r));
          if (sg.t) sg.t.setAttribute('opacity', local);
        });
      }, () => segs.forEach((sg) => { sg.path.setAttribute('d', roundRect(sg.x, 30, sg.w, 24, sg.r)); if (sg.t) sg.t.setAttribute('opacity', 1); }));
    },
  };
}

/* ---------------- diverging bar ---------------- */

function diverge(fig, d) {
  const body = fig.querySelector('[data-body]');
  legend(fig, [{ label: d.neg.label, color: 'accent' }, { label: d.pos.label, color: 'cool' }]);
  let entered = false;
  let g = null;

  function render(w) {
    const h = 124;
    const by = 36;
    const bh = 24;
    const mid = w / 2;
    const k = (v) => (v / d.max) * (w / 2 - 4);
    const s = svgRoot(w, h);
    const neg = el('path', { d: roundRect(mid - (entered ? k(d.neg.v) : 0), by, entered ? k(d.neg.v) : 0, bh, [4, 0, 0, 4]), class: 'f-accent mark', tabindex: 0, role: 'img', 'aria-label': `${d.neg.label}: ${d.neg.v} million` }, s);
    const pos = el('path', { d: roundRect(mid + 1, by, entered ? k(d.pos.v) : 0, bh, [0, 4, 4, 0]), class: 'f-cool mark', tabindex: 0, role: 'img', 'aria-label': `${d.pos.label}: ${d.pos.v} million` }, s);
    el('line', { x1: mid, x2: mid, y1: by - 12, y2: by + bh + 12, class: 'axis' }, s);
    const ln = txt(s, mid - k(d.neg.v), by - 12, `${d.neg.v}m ${d.neg.label.toLowerCase()}`, 't-val', 'start');
    const lp = txt(s, mid + k(d.pos.v), by - 12, `${d.pos.v}m ${d.pos.label.toLowerCase()}`, 't-val', 'end');
    const ny = by + bh + 26;
    el('line', { x1: mid, x2: mid + k(d.net), y1: ny, y2: ny, stroke: 'var(--ink-2)', 'stroke-width': 1 }, s);
    el('line', { x1: mid + k(d.net), x2: mid + k(d.net), y1: ny - 5, y2: ny + 5, stroke: 'var(--ink-2)', 'stroke-width': 1 }, s);
    const nt = txt(s, mid + k(d.net), ny + 22, `Net +${d.net}m`, 't-strong', 'middle');
    [ln, lp, nt].forEach((t) => t.setAttribute('opacity', entered ? 1 : 0));
    bindTip(neg, (e) => (e ? { value: `${d.neg.v} million`, label: `${d.neg.label}, 2025–2030`, color: 'accent', anchor: neg } : null));
    bindTip(pos, (e) => (e ? { value: `${d.pos.v} million`, label: `${d.pos.label}, 2025–2030`, color: 'cool', anchor: pos } : null));
    body.replaceChildren(s);
    g = { neg, pos, labels: [ln, lp, nt], mid, kn: k(d.neg.v), kp: k(d.pos.v) };
  }

  return {
    render,
    enter() {
      if (entered) return;
      entered = true;
      tween(1500, (p) => {
        g.neg.setAttribute('d', roundRect(g.mid - g.kn * p, 36, g.kn * p, 24, [4, 0, 0, 4]));
        g.pos.setAttribute('d', roundRect(g.mid + 1, 36, g.kp * p, 24, [0, 4, 4, 0]));
        g.labels.forEach((t) => t.setAttribute('opacity', p));
      });
    },
  };
}

/* ---------------- horizontal bars ---------------- */

function bars(fig, d) {
  const body = fig.querySelector('[data-body]');
  let entered = false;
  let rows = [];
  const suffix = d.suffix || '';

  function render(w) {
    const narrow = w < 520;
    const m = { t: 4, r: 48, b: 28, l: narrow ? 116 : 156 };
    const rowH = 36;
    const bh = 18;
    const h = m.t + d.rows.length * rowH + m.b;
    const iw = w - m.l - m.r;
    const x = (v) => m.l + (v / d.max) * iw;
    const s = svgRoot(w, h);
    d.ticks.forEach((t) => {
      el('line', { x1: x(t), x2: x(t), y1: m.t, y2: h - m.b, class: t === 0 ? 'axis' : 'grid' }, s);
      txt(s, x(t), h - 8, `${t}${suffix}`, '', 'middle');
    });
    rows = d.rows.map((r, i) => {
      const y = m.t + i * rowH + (rowH - bh) / 2;
      txt(s, m.l - 12, y + bh / 2 + 4.5, r.name, 't-name', 'end');
      const bar = el('path', { d: roundRect(m.l, y, entered ? x(r.v) - m.l : 0, bh, [0, 4, 4, 0]), class: 'f-accent mark', tabindex: 0, role: 'img', 'aria-label': `${r.name}: ${r.v}${suffix}${d.unit ? ` ${d.unit}` : ''}` }, s);
      const val = txt(s, (entered ? x(r.v) : m.l) + 8, y + bh / 2 + 4.5, `${r.v}${suffix}`, 't-val');
      if (!entered) val.setAttribute('opacity', 0);
      bindTip(bar, (e) => (e ? { value: `${r.v}${suffix}${d.unit ? ` ${d.unit}` : ''}`, label: r.name, color: 'accent', anchor: bar } : null));
      return { bar, val, y, len: x(r.v) - m.l, x0: m.l };
    });
    body.replaceChildren(s);
  }

  return {
    render,
    enter() {
      if (entered) return;
      entered = true;
      tween(1400, (p) => rows.forEach((r, i) => {
        const local = Math.max(0, Math.min(1, p * 1.4 - i * 0.08));
        r.bar.setAttribute('d', roundRect(r.x0, r.y, r.len * local, 18, [0, 4, 4, 0]));
        r.val.setAttribute('x', r.x0 + r.len * local + 8);
        r.val.setAttribute('opacity', local);
      }), () => rows.forEach((r) => { r.bar.setAttribute('d', roundRect(r.x0, r.y, r.len, 18, [0, 4, 4, 0])); r.val.setAttribute('x', r.x0 + r.len + 8); r.val.setAttribute('opacity', 1); }));
    },
  };
}

/* ---------------- twenty-second timer ---------------- */

function timer(fig, d) {
  const body = fig.querySelector('[data-body]');
  const wrap = document.createElement('div');
  wrap.className = 'timer';
  const R = 86;
  const C = 2 * Math.PI * R;
  const s = el('svg', { viewBox: '0 0 200 200', 'aria-hidden': 'true' });
  el('circle', { cx: 100, cy: 100, r: R, class: 'timer-track' }, s);
  const arc = el('circle', { cx: 100, cy: 100, r: R, class: 'timer-arc', 'stroke-dasharray': C, 'stroke-dashoffset': C }, s);
  const num = txt(s, 100, 108, '0.0', 'timer-num', 'middle');
  txt(s, 100, 136, `of ${d.seconds} seconds`, 'timer-unit', 'middle');
  const copy = document.createElement('div');
  copy.className = 'timer-copy';
  const p = document.createElement('p');
  p.setAttribute('aria-live', 'polite');
  p.textContent = 'Press start and sit with it. Nothing else happens.';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn';
  btn.textContent = 'Start';
  copy.append(p, btn);
  wrap.append(s, copy);
  body.replaceChildren(wrap);
  let raf = 0;
  const hour = Math.round(3600 / d.seconds);

  btn.addEventListener('click', () => {
    if (raf) return;
    btn.classList.add('is-running');
    btn.textContent = 'Running';
    btn.disabled = true;
    p.classList.remove('timer-done');
    p.textContent = 'One target.';
    const t0 = performance.now();
    const tick = (now) => {
      const e = Math.min(d.seconds, (now - t0) / 1000);
      arc.setAttribute('stroke-dashoffset', C * (1 - e / d.seconds));
      num.textContent = e.toFixed(1);
      if (e < d.seconds) { raf = requestAnimationFrame(tick); return; }
      raf = 0;
      btn.classList.remove('is-running');
      btn.disabled = false;
      btn.textContent = 'Again';
      p.classList.add('timer-done');
      p.textContent = `That was one review. At this pace, a single officer could sign off on ${hour} targets in an hour.`;
    };
    raf = requestAnimationFrame(tick);
  });

  return { render() {}, enter() {} };
}

/* ---------------- registry ---------------- */

const FACTORIES = {
  capex,
  dots,
  line: lineChart,
  meter,
  dumbbell,
  stack,
  diverge,
  bars,
  timer,
  waffle: (fig, d) => units(fig, d, { cols: () => 10, max: 30, gap: 3, stagger: 9, suffix: '%' }),
  survey: (fig, d) => units(fig, d, { cols: () => 10, max: 26, gap: 5, round: true, stagger: 11, unitLabel: (g) => String(g.v) }),
  seats: (fig, d) => units(fig, d, { cols: (w) => (w >= 640 ? d.cols.wide : d.cols.narrow), max: 22, gap: 2, stagger: d.groups.reduce((s, g) => s + g.v, 0) > 120 ? 4 : 7, unitLabel: (g) => String(g.v) }),
};

export function initCharts() {
  const charts = [];
  document.querySelectorAll('figure[data-chart]').forEach((fig) => {
    const make = FACTORIES[fig.dataset.chart];
    const dataEl = fig.querySelector('script.viz-data');
    if (!make || !dataEl) return;
    let chart;
    try {
      chart = make(fig, JSON.parse(dataEl.textContent));
    } catch (err) {
      console.error('chart failed', fig.dataset.chart, err);
      return;
    }
    const body = fig.querySelector('[data-body]');
    let lastW = 0;
    const measure = () => {
      const w = Math.floor(body.getBoundingClientRect().width);
      if (w > 0 && Math.abs(w - lastW) > 1) { lastW = w; chart.render(w); }
    };
    // Draw each chart only when the reader gets within a screen or so of it.
    const start = () => {
      measure();
      new ResizeObserver(measure).observe(body);
      if (fig.closest('.scrolly-graphic')) {
        let lastH = innerHeight;
        addEventListener('resize', () => { if (Math.abs(innerHeight - lastH) > 40) { lastH = innerHeight; chart.render(lastW); } });
      }
    };
    charts.push({ fig, chart, start });
  });
  const near = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const c = charts.find((x) => x.fig === e.target);
      if (c) c.start();
      near.unobserve(e.target);
    });
  }, { rootMargin: '120% 0px 120% 0px' });
  charts.forEach((c) => near.observe(c.fig));

  // Figures outside a scrolly animate once when they come into view.
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const c = charts.find((x) => x.fig === e.target);
      if (c) c.chart.enter();
      io.unobserve(e.target);
    });
  }, { threshold: 0.35 });
  charts.forEach((c) => { if (!c.fig.closest('[data-scrolly]')) io.observe(c.fig); });

  // Scrolly figures follow the step closest to the reading line.
  const scrollies = [...document.querySelectorAll('[data-scrolly]')].map((sc) => ({
    el: sc,
    steps: [...sc.querySelectorAll('.step')],
    chart: charts.find((c) => sc.contains(c.fig))?.chart,
    active: -1,
    near: false,
  }));
  // Only scrollies near the screen are measured on scroll, so off-screen
  // chapters never need laying out.
  const nearIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => { const sc = scrollies.find((x) => x.el === e.target); if (sc) { sc.near = e.isIntersecting; if (sc.near) update(); } });
  }, { rootMargin: '50% 0px 50% 0px' });
  scrollies.forEach((sc) => nearIO.observe(sc.el));
  const update = () => {
    const line = innerHeight * (innerWidth < 1000 ? 0.8 : 0.62);
    scrollies.forEach((sc) => {
      if (!sc.near) return;
      let active = 0;
      sc.steps.forEach((st, i) => { if (st.getBoundingClientRect().top < line) active = i + 1; });
      if (active === sc.active) return;
      sc.active = active;
      sc.steps.forEach((st, i) => st.classList.toggle('is-active', i + 1 === active));
      if (sc.chart && sc.chart.step) sc.chart.step(active);
    });
  };
  let queued = false;
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; update(); }); } }, { passive: true });
  addEventListener('resize', update);

  document.addEventListener('pointerdown', (e) => { if (!e.target.closest || !e.target.closest('.viz-body')) hideTip(); });
  addEventListener('scroll', hideTip, { passive: true });
}
