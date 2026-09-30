// Brush-written titles. Each character is drawn stroke by stroke in its proper
// order from the KanjiVG stroke centre lines: a broad, round-ended line runs
// along each stroke, roughened by a displacement filter like ink on paper.
// At rest (before the script runs, or with reduced motion) the characters are
// simply there, set in type.

const NS = 'http://www.w3.org/2000/svg';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

function el(name, attrs = {}) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function ensureFilter() {
  if (document.getElementById('brush-fx')) return;
  const svg = el('svg', { width: 0, height: 0, 'aria-hidden': 'true', style: 'position:absolute' });
  const f = el('filter', { id: 'brush-fx', x: '-8%', y: '-8%', width: '116%', height: '116%' });
  f.append(
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.09', numOctaves: '2', seed: '3', result: 'n' }),
    el('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: '2.2', xChannelSelector: 'R', yChannelSelector: 'G' })
  );
  svg.append(f);
  document.body.append(svg);
}

function buildChar(strokesD) {
  const wrap = document.createElement('span');
  wrap.className = 'han-svg';
  const svg = el('svg', { viewBox: '0 0 109 109', 'aria-hidden': 'true', focusable: 'false' });
  const g = el('g', { filter: 'url(#brush-fx)' });
  const strokes = strokesD.map((d) => {
    const p = el('path', { d, class: 'stk', pathLength: '1', 'stroke-dasharray': '1 1', 'stroke-dashoffset': '0' });
    g.append(p);
    return p;
  });
  svg.append(g);
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
      strokes.push(...s);
    });
    t.classList.add('drawn');
    t.append(holder);
    return { t, strokes, played: false };
  }).filter(Boolean);

  // measure once the paths are in the document
  items.forEach((it) => it.strokes.forEach((s) => {
    try { s.dataset.len = String(s.getTotalLength()); } catch { s.dataset.len = '40'; }
  }));

  const hide = (it) => it.strokes.forEach((s) => { s.style.transition = 'none'; s.style.strokeDashoffset = '1'; });
  const play = (it) => {
    if (it.played) return;
    it.played = true;
    let t = 0.1;
    it.strokes.forEach((s) => {
      const len = Number(s.dataset.len) || 40;
      const dur = Math.min(0.42, Math.max(0.14, len / 120));
      s.getBoundingClientRect();
      s.style.transition = `stroke-dashoffset ${dur.toFixed(2)}s cubic-bezier(.45,.05,.35,1) ${t.toFixed(2)}s`;
      s.style.strokeDashoffset = '0';
      t += dur + 0.05;
    });
  };
  if (reduceMotion.matches) return;

  // hide characters shortly before they come into view, write them when seen
  const near = new IntersectionObserver((es) => es.forEach((e) => {
    const it = items.find((x) => x.t === e.target);
    if (e.isIntersecting && it && !it.played && !it.hidden) { it.hidden = true; hide(it); }
  }), { rootMargin: '40% 0px 40% 0px' });
  const seen = new IntersectionObserver((es) => es.forEach((e) => {
    const it = items.find((x) => x.t === e.target);
    if (e.isIntersecting && it && !it.played) {
      if (!it.hidden) { it.hidden = true; hide(it); }
      requestAnimationFrame(() => requestAnimationFrame(() => play(it)));
    }
  }), { threshold: 0.5 });
  items.forEach((it) => { near.observe(it.t); seen.observe(it.t); });
}
