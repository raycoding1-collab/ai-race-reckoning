// Masthead, contents, theme, footnotes and the small interactive figures.
import { isNight } from './stage.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function toggleTheme() {
  const next = isNight() ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('way-theme', next); } catch { /* storage unavailable */ }
  document.querySelectorAll('[data-theme-toggle]').forEach((b) => b.setAttribute('aria-label', next === 'dark' ? 'Switch to day' : 'Switch to night'));
}

function initTheme() {
  document.querySelectorAll('[data-theme-toggle]').forEach((b) => {
    b.setAttribute('aria-label', isNight() ? 'Switch to day' : 'Switch to night');
    b.addEventListener('click', toggleTheme);
  });
}

function initMast() {
  const mast = document.querySelector('[data-mast]');
  if (!mast) return;
  const hero = document.querySelector('.hero');
  const num = mast.querySelector('[data-mast-num]');
  const title = mast.querySelector('[data-mast-title]');
  const bar = mast.querySelector('[data-progress]');
  const chapters = [...document.querySelectorAll('main .chapter')];

  new IntersectionObserver(([e]) => mast.classList.toggle('solid', !e.isIntersecting), { rootMargin: '-64px 0px 0px 0px' })
    .observe(hero);

  const live = new Set();
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => (e.isIntersecting ? live.add(e.target) : live.delete(e.target)));
    const c = chapters.filter((x) => live.has(x)).pop();
    num.textContent = c ? c.dataset.num : '';
    title.textContent = c ? c.dataset.title : '';
  }, { rootMargin: '-45% 0px -50% 0px' });
  chapters.forEach((c) => io.observe(c));

  let raf = 0;
  const update = () => {
    raf = 0;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
  };
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  update();
}

function initToc() {
  const toc = document.querySelector('[data-toc]');
  const open = document.querySelector('[data-toc-open]');
  const close = document.querySelector('[data-toc-close]');
  if (!toc || !open) return;
  const show = () => {
    toc.hidden = false;
    open.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    close.focus();
  };
  const hide = (focus = true) => {
    toc.hidden = true;
    open.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (focus) open.focus();
  };
  open.addEventListener('click', show);
  close.addEventListener('click', () => hide());
  toc.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) hide(false);
    else if (e.target === toc) hide();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !toc.hidden) hide(); });
}

function initFootnotes() {
  let pop = null;
  let shownAt = 0;
  const kill = () => { pop?.remove(); pop = null; };
  const show = (a) => {
    kill();
    const li = document.getElementById(`src-${a.dataset.fn}`);
    if (!li) return;
    pop = document.createElement('div');
    pop.className = 'fn-pop';
    pop.setAttribute('role', 'tooltip');
    const org = li.querySelector('.src-org')?.textContent || '';
    const t = li.querySelector('a')?.textContent || '';
    const b = document.createElement('b');
    b.textContent = `${a.dataset.fn} · ${org}`;
    pop.append(b, document.createTextNode(t));
    document.body.append(pop);
    const r = a.getBoundingClientRect();
    const w = pop.offsetWidth;
    const left = Math.max(12, Math.min(window.scrollX + r.left - w / 2, window.scrollX + document.documentElement.clientWidth - w - 12));
    pop.style.left = `${left}px`;
    pop.style.top = `${window.scrollY + r.bottom + 8}px`;
    shownAt = window.scrollY;
  };
  document.addEventListener('pointerover', (e) => {
    const a = e.target.closest?.('sup.fn a');
    if (a) show(a);
    else if (pop && !e.target.closest?.('.fn-pop')) kill();
  });
  document.addEventListener('focusin', (e) => {
    const a = e.target.closest?.('sup.fn a');
    if (a) show(a); else kill();
  });
  window.addEventListener('scroll', () => { if (pop && Math.abs(window.scrollY - shownAt) > 60) kill(); }, { passive: true });
}

function initGloss() {
  document.querySelectorAll('.gloss').forEach((fig) => {
    fig.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
      fig.dataset.state = b.dataset.set;
      fig.querySelectorAll('.seg-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
  });
}

const SAY = {
  wood: 'Wood feeds fire, and its roots part the earth.',
  fire: 'Fire leaves earth in its ashes, and melts metal.',
  earth: 'Earth bears metal in its veins, and dams water.',
  metal: 'Metal gathers water, as dew on cold bronze, and cuts wood.',
  water: 'Water nourishes wood, and quenches fire.',
};

function initWuxing() {
  const fig = document.querySelector('.wuxing');
  if (!fig) return;
  const read = fig.querySelector('.wx-read');
  const base = read.textContent;
  const nodes = [...fig.querySelectorAll('.wx-node')];
  const set = (name) => {
    fig.classList.toggle('focus', !!name);
    nodes.forEach((n) => n.classList.toggle('active', n.dataset.phase === name));
    fig.querySelectorAll('.wx-feed, .wx-check').forEach((p) => p.classList.toggle('hot', p.dataset.from === name));
    read.textContent = name ? SAY[name] : base;
  };
  nodes.forEach((n) => {
    n.addEventListener('pointerenter', () => set(n.dataset.phase));
    n.addEventListener('focus', () => set(n.dataset.phase));
    n.addEventListener('click', () => set(n.dataset.phase));
    n.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(n.dataset.phase); } });
  });
  fig.querySelector('.wx-svg').addEventListener('pointerleave', () => set(null));
}

function initStories() {
  const root = document.querySelector('.stories');
  if (!root) return;
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
  const select = (i, focus) => {
    tabs.forEach((t, k) => {
      const on = k === i;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      panels[k].classList.toggle('current', on);
    });
    if (focus) tabs[i].focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(i));
    t.addEventListener('keydown', (e) => {
      const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (k) { e.preventDefault(); select((i + k + tabs.length) % tabs.length, true); }
      if (e.key === 'Home') { e.preventDefault(); select(0, true); }
      if (e.key === 'End') { e.preventDefault(); select(tabs.length - 1, true); }
    });
  });
  select(0);
}

function initBreath() {
  const btn = document.getElementById('breath-start');
  if (!btn) return;
  const fig = btn.closest('.breath');
  const ink = fig.querySelector('.breath-ink');
  const word = fig.querySelector('.breath-word');
  const clock = fig.querySelector('.breath-time');
  const rest = word.textContent;
  let timer = 0, running = false, t0 = 0;
  const SMALL = 'scale(1)', BIG = 'scale(1.62)';
  const stop = (done) => {
    running = false;
    clearTimeout(timer);
    ink.style.transitionDuration = '1.5s';
    ink.style.transform = SMALL;
    word.textContent = done ? 'Rest. The minute is over.' : rest;
    clock.textContent = '';
    btn.textContent = done ? 'Sit for another minute' : 'Sit for one minute';
  };
  const phase = (inhale) => {
    if (!running) return;
    const elapsed = (performance.now() - t0) / 1000;
    if (elapsed >= 60) { stop(true); return; }
    clock.textContent = `${Math.max(0, Math.ceil(60 - elapsed))} s`;
    const secs = inhale ? 4 : 6;
    ink.style.transitionDuration = `${secs}s`;
    ink.style.transform = inhale ? BIG : SMALL;
    word.textContent = inhale ? 'Breathe in' : 'Breathe out, slowly';
    timer = setTimeout(() => phase(!inhale), secs * 1000);
  };
  btn.addEventListener('click', () => {
    if (running) { stop(false); return; }
    running = true;
    t0 = performance.now();
    btn.textContent = 'Stop';
    if (reduceMotion.matches) ink.style.transition = 'none';
    phase(true);
  });
}

function initOracle() {
  const btn = document.getElementById('oracle-draw');
  if (!btn) return;
  const card = btn.closest('.oracle');
  const num = card.querySelector('[data-oracle-num]');
  const zh = card.querySelector('[data-oracle-zh]');
  const en = card.querySelector('[data-oracle-en]');
  const link = card.querySelector('[data-oracle-link]');
  btn.addEventListener('click', () => {
    const n = 1 + Math.floor(Math.random() * 81);
    const art = document.getElementById(`ddj-${n}`);
    if (!art) return;
    num.textContent = String(n);
    zh.textContent = [...art.querySelectorAll('.ddj-zh p')].map((p) => p.textContent).join('');
    const p = art.querySelector('.ddj-en p');
    en.textContent = p ? p.innerText || p.textContent : '';
    link.setAttribute('href', `#ddj-${n}`);
  });
}

function initReturn() {
  const a = document.getElementById('return-top');
  if (!a) return;
  a.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    history.replaceState(null, '', '#top');
  });
}

export function initUI() {
  initTheme();
  initMast();
  initToc();
  initFootnotes();
  initGloss();
  initWuxing();
  initStories();
  initBreath();
  initOracle();
  initReturn();
}
