// Masthead and era ribbon, contents, day and night, footnotes, the kana chart
// and the era-name finder.
import { isNight } from './stage.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function toggleTheme() {
  const next = isNight() ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('nihon-theme', next); } catch { /* storage unavailable */ }
  labelTheme();
}

function labelTheme() {
  document.querySelectorAll('[data-theme-toggle]').forEach((b) =>
    b.setAttribute('aria-label', isNight() ? 'Show the day prints' : 'Show the night prints'));
}

function initTheme() {
  labelTheme();
  document.querySelectorAll('[data-theme-toggle]').forEach((b) => b.addEventListener('click', toggleTheme));
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', labelTheme);
}

function initMast() {
  const mast = document.querySelector('[data-mast]');
  if (!mast) return;
  const hero = document.querySelector('.hero');
  const num = mast.querySelector('[data-mast-num]');
  const title = mast.querySelector('[data-mast-title]');
  const ribbon = [...mast.querySelectorAll('[data-rb]')];
  const chapters = [...document.querySelectorAll('main .chapter')];

  // the bar turns solid as soon as the opening print has passed beneath it
  new IntersectionObserver(([e]) => mast.classList.toggle('solid', !e.isIntersecting),
    { rootMargin: `-${Math.ceil(mast.offsetHeight) + 8}px 0px 0px 0px` })
    .observe(hero);

  const live = new Set();
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => (e.isIntersecting ? live.add(e.target) : live.delete(e.target)));
    const c = chapters.filter((x) => live.has(x)).pop();
    num.textContent = c ? c.dataset.num : '';
    title.textContent = c ? c.dataset.title : '';
    ribbon.forEach((r) => r.classList.toggle('on', !!c && r.dataset.rb === c.id));
  }, { rootMargin: '-45% 0px -50% 0px' });
  chapters.forEach((c) => io.observe(c));
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

// ------------------------------------------------------------------ kana
function initKana() {
  const fig = document.querySelector('.kana');
  if (!fig) return;
  const src = fig.querySelector('[data-ks-src]');
  const kana = fig.querySelector('[data-ks-kana]');
  const rom = fig.querySelector('[data-ks-rom]');
  const cells = [...fig.querySelectorAll('.kana-cell')];
  const set = (b) => {
    cells.forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    src.textContent = b.dataset.src;
    kana.textContent = b.dataset.kana;
    rom.textContent = b.querySelector('.kc-rom').textContent;
    fig.classList.remove('morph');
    void fig.offsetWidth;
    fig.classList.add('morph');
  };
  cells.forEach((c) => {
    c.addEventListener('click', () => set(c));
    c.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') set(c); });
  });
  const start = cells.find((c) => c.dataset.kana === 'あ');
  if (start) start.setAttribute('aria-pressed', 'true');
}

// ------------------------------------------------------------------ eras
const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
const ANIMALS = ['rat', 'ox', 'tiger', 'rabbit', 'dragon', 'snake', 'horse', 'sheep', 'monkey', 'rooster', 'dog', 'boar'];

function eto(y) {
  const s = ((y - 4) % 10 + 10) % 10;
  const b = ((y - 4) % 12 + 12) % 12;
  return { ja: STEMS[s] + BRANCHES[b], animal: ANIMALS[b] };
}

function initEras(eras) {
  const form = document.getElementById('eras-form');
  if (!form || !eras) return;
  const input = document.getElementById('eras-year');
  const outYear = document.querySelector('[data-eo-year]');
  const outEto = document.querySelector('[data-eo-eto]');
  const outNames = document.querySelector('[data-eo-names]');
  const outNote = document.querySelector('[data-eo-note]');
  const strip = document.querySelector('[data-eras-strip]');
  const now = new Date().getFullYear();
  const first = eras[0][1];

  // sequence of eras for a court: shared eras plus that court's own
  const seq = (court) => eras.filter((e) => e[2] === '' || e[2] === court);
  // eras followed by years without any era name
  const LAST = { '白雉': 655, '朱鳥': 687 };
  const endOf = (list, i) => LAST[list[i][0]] || (list[i + 1] ? list[i + 1][1] : Infinity);
  const north = seq('N');
  const south = seq('S');

  function inEffect(list, y) {
    // eras running at the start of year y, and those proclaimed during it
    let running = null;
    const started = [];
    list.forEach((e, i) => {
      const end = endOf(list, i);
      if (e[1] < y && end >= y) running = e;
      if (e[1] === y) started.push(e);
    });
    const res = [];
    if (running && !(started.length && running === started[0])) res.push(running);
    res.push(...started);
    return res;
  }

  const fmt = (e, y) => {
    const n = y - e[1] + 1;
    const label = n === 1 ? '元年' : String(n);
    return `<span lang="ja">${e[0]}${label}</span>${e[3] ? ` <span class="eo-rd">${e[3]} ${n}</span>` : ''}`;
  };

  function gapNote(y) {
    if (y < first) return 'There were no era names yet. The first, Taika, was proclaimed in 645.';
    if ((y >= 655 && y <= 685) || (y >= 687 && y <= 700)) {
      return 'No era name was in use this year. After Hakuchi ended in 654, Japan went without one until Taihō in 701, except for a few months of Shuchō in 686.';
    }
    return '';
  }

  function show(y) {
    outYear.textContent = y;
    const e = eto(y);
    outEto.textContent = e.ja;
    outEto.title = `Year of the ${e.animal}`;
    const gap = gapNote(y);
    let notes = [];
    if (gap) {
      outNames.innerHTML = '<span class="eo-none">No era name</span>';
      notes.push(gap);
    } else if (y >= 1331 && y <= 1392) {
      const n = inEffect(north, y).map((x) => fmt(x, y)).join(' · ');
      const s = inEffect(south, y).map((x) => fmt(x, y)).join(' · ');
      outNames.innerHTML = `<span class="eo-court">Northern Court</span> ${n}<br><span class="eo-court">Southern Court</span> ${s}`;
      notes.push('The Northern and Southern Courts each named their own eras.');
    } else {
      const list = inEffect(north, y);
      outNames.innerHTML = list.map((x) => fmt(x, y)).join(' · ');
      const started = list.filter((x) => x[1] === y);
      if (started.length) notes.push(`${started.map((x) => (x[3] || x[0])).join(' and ')} began in this year.`);
    }
    if (y < 1873 && y >= first) notes.push('Dates before 1873 follow the lunisolar calendar, so the Western year is approximate.');
    if (y > now) notes.push('A year still to come: counted as if the present era lasts.');
    outNote.textContent = notes.join(' ');
    // strip
    strip.querySelectorAll('rect.on').forEach((r) => r.classList.remove('on'));
    const cur = inEffect(north, y).pop();
    if (cur && !gap) strip.querySelector(`rect[data-e="${cur[0]}"]`)?.classList.add('on');
  }

  // proportional strip of all eras (north line and shared eras)
  const W = now + 1 - first;
  const rects = north.map((e, i) => {
    const end = Math.min(endOf(north, i), now + 1);
    const w = Math.max(0.6, end - e[1]);
    return `<rect data-e="${e[0]}" x="${e[1] - first}" y="0" width="${w}" height="24" class="${i % 2 ? 'odd' : 'even'}"><title>${e[0]} ${e[3] || ''} ${e[1]}</title></rect>`;
  }).join('');
  const ticks = [];
  for (let y = 700; y <= now; y += 100) {
    ticks.push(`<line x1="${y - first}" x2="${y - first}" y1="26" y2="31"/><text x="${y - first}" y="42">${y}</text>`);
  }
  strip.innerHTML = `<svg viewBox="-6 0 ${W + 12} 46" preserveAspectRatio="none" focusable="false">`
    + `<rect x="${655 - first}" y="0" width="${701 - 655}" height="24" class="gap"/>${rects}`
    + `<line class="strip-year" x1="0" x2="0" y1="-2" y2="28"/><g class="ticks">${ticks.join('')}</g></svg>`;
  // keep the marker a line at the right x
  const mk = strip.querySelector('.strip-year');
  const place = (y) => { mk.setAttribute('x1', String(y - first)); mk.setAttribute('x2', String(y - first)); };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const y = Math.round(Number(input.value));
    if (!Number.isFinite(y)) return;
    const yy = Math.max(600, Math.min(2100, y));
    input.value = String(yy);
    show(yy);
    place(Math.max(first, Math.min(now, yy)));
  });
  input.value = String(now);
  show(now);
  place(now);
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

export function initUI(data) {
  initTheme();
  initMast();
  initToc();
  initFootnotes();
  initKana();
  initEras(data?.eras);
  initReturn();
}
