// Brush-written titles. Each character is drawn stroke by stroke in its proper
// order, from Make Me a Hanzi stroke outlines and median lines: a wide line runs
// along each stroke's median, clipped to the stroke's outline. At rest (before
// the script runs, or with reduced motion) the characters are simply there.

const NS = 'http://www.w3.org/2000/svg';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let uid = 0;

function el(name, attrs = {}) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function ensureFilter() {
  if (document.getElementById('ink-fx')) return;
  const svg = el('svg', { width: 0, height: 0, 'aria-hidden': 'true', style: 'position:absolute' });
  const f = el('filter', { id: 'ink-fx', x: '-5%', y: '-5%', width: '110%', height: '110%' });
  f.append(
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.035', numOctaves: '2', seed: '7', result: 'n' }),
    el('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: '9', xChannelSelector: 'R', yChannelSelector: 'G' })
  );
  svg.append(f);
  document.body.append(svg);
}

function buildChar(d) {
  const id = `w${uid++}`;
  const wrap = document.createElement('span');
  wrap.className = 'han-svg';
  const svg = el('svg', { viewBox: '0 0 1024 1024', 'aria-hidden': 'true', focusable: 'false' });
  const defs = el('defs');
  const g = el('g', { transform: 'translate(0 900) scale(1 -1)', filter: 'url(#ink-fx)' });
  const strokes = [];
  d.s.forEach((outline, i) => {
    const cp = el('clipPath', { id: `${id}-${i}` });
    cp.append(el('path', { d: outline }));
    defs.append(cp);
    const pts = d.m[i];
    const [x0, y0] = pts[0];
    const [x1, y1] = pts[1] || pts[0];
    // extend the median a little backwards so the brush covers the stroke's start
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const ext = [x0 - ((x1 - x0) / len) * 40, y0 - ((y1 - y0) / len) * 40];
    const path = 'M' + [ext, ...pts].map((p) => p.join(' ')).join(' L');
    let L = 0;
    for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    const s = el('path', {
      d: path, class: 'stk', 'clip-path': `url(#${id}-${i})`, 'stroke-width': '190',
      pathLength: '1', 'stroke-dasharray': '1 1', 'stroke-dashoffset': '0',
    });
    s.dataset.len = String(L + 40);
    g.append(s);
    strokes.push(s);
  });
  svg.append(defs, g);
  wrap.append(svg);
  return { wrap, strokes };
}

export function initWriting() {
  const node = document.getElementById('stroke-data');
  if (!node) return;
  let data;
  try { data = JSON.parse(node.textContent); } catch { return; }
  const targets = [...document.querySelectorAll('.han-write[data-write]')];
  if (!targets.length) return;
  ensureFilter();

  const items = targets.map((t) => {
    const chars = [...t.dataset.write];
    if (!chars.every((c) => data[c])) return null;
    const holder = document.createElement('span');
    holder.className = 'han-svgs';
    holder.setAttribute('aria-hidden', 'true');
    const strokes = [];
    chars.forEach((c) => {
      const { wrap, strokes: s } = buildChar(data[c]);
      holder.append(wrap);
      strokes.push(s);
    });
    t.textContent = '';
    t.append(holder);
    return { t, strokes: strokes.flat(), state: 'rest' };
  }).filter(Boolean);

  if (reduceMotion.matches) return;

  const hide = (it) => {
    it.strokes.forEach((s) => { s.style.transition = 'none'; s.setAttribute('stroke-dashoffset', '1'); });
    it.state = 'hidden';
  };
  const play = (it) => {
    if (it.state !== 'hidden') return;
    it.state = 'played';
    // force the hidden state to apply before transitions start
    it.t.getBoundingClientRect();
    let t = 0;
    it.strokes.forEach((s) => {
      const dur = Math.min(0.36, Math.max(0.13, Number(s.dataset.len) / 2600));
      s.style.transition = `stroke-dashoffset ${dur}s cubic-bezier(.45,.05,.35,1) ${t}s`;
      s.setAttribute('stroke-dashoffset', '0');
      t += dur + 0.045;
    });
  };

  // Prepare just before a title scrolls in, write it once it is in view.
  const near = new IntersectionObserver((es) => es.forEach((e) => {
    const it = items.find((i) => i.t === e.target);
    if (e.isIntersecting && it.state === 'rest') hide(it);
  }), { rootMargin: '0px 0px 30% 0px' });
  const seen = new IntersectionObserver((es) => es.forEach((e) => {
    const it = items.find((i) => i.t === e.target);
    if (!e.isIntersecting) return;
    if (it.state === 'rest') hide(it);
    setTimeout(() => play(it), it.t.closest('.hero') ? 500 : 150);
  }), { threshold: 0.35 });
  items.forEach((it) => { near.observe(it.t); seen.observe(it.t); });
}
