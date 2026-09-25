// Page furniture: masthead, contents, running ledger, footnotes, reveals.

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const YEAR = 365 * 24 * 3600;

/* ---------------- running ledger ---------------- */

const RATES = {
  capex: 725e9 / YEAR, // $ per second, 2026 plans of the four companies
  power: 485e9 / YEAR, // kWh per second, data centers worldwide, 2025
  fakes: 8e6 / YEAR, // deepfakes shared per second, 2025
  jobs: (16000 * 12) / YEAR, // net US jobs displaced per second
};

const FORMAT = {
  usd: (v) => `$${Math.floor(v).toLocaleString('en-US')}`,
  kwh: (v) => `${Math.floor(v).toLocaleString('en-US')} kWh`,
  int: (v) => Math.floor(v).toLocaleString('en-US'),
};

export function initLedger() {
  const t0 = performance.now();
  const nodes = [...document.querySelectorAll('[data-ledger]')].map((n) => ({
    n, rate: RATES[n.dataset.ledger], f: FORMAT[n.dataset.format] || FORMAT.int, last: '',
  }));
  const next = document.querySelector('[data-ledger-next]');
  const minutes = document.querySelector('[data-ledger-minutes]');
  const tick = () => {
    if (document.hidden) return;
    const s = (performance.now() - t0) / 1000;
    for (const it of nodes) {
      const txt = it.f(s * it.rate);
      if (txt !== it.last) { it.n.textContent = txt; it.last = txt; }
    }
    if (next) {
      const v = s * RATES.jobs;
      const wait = Math.ceil((Math.floor(v) + 1 - v) / RATES.jobs);
      next.textContent = `at 16,000 a month · next in ${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}`;
    }
    if (minutes) {
      const m = Math.floor(s / 60);
      minutes.textContent = m < 1 ? 'less than a minute' : m === 1 ? '1 minute' : `${m} minutes`;
    }
  };
  tick();
  setInterval(tick, 100);
}

/* ---------------- masthead, progress, current chapter ---------------- */

export function initMast() {
  const mast = document.querySelector('[data-mast]');
  const bar = document.querySelector('[data-progress]');
  const num = document.querySelector('[data-mast-num]');
  const title = document.querySelector('[data-mast-title]');
  const hero = document.querySelector('.hero');
  const chapters = [...document.querySelectorAll('.chapter')];
  const tocLinks = new Map([...document.querySelectorAll('.toc-list a')].map((a) => [a.hash.slice(1), a]));
  let current = null;

  const update = () => {
    const y = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : 0);
    mast.classList.toggle('is-top', hero && y < hero.offsetHeight - 80);
    const line = innerHeight * 0.4;
    let found = null;
    for (const ch of chapters) { if (ch.getBoundingClientRect().top < line) found = ch; }
    if (found !== current) {
      current = found;
      num.textContent = found ? found.dataset.num : '';
      title.textContent = found ? found.dataset.title : '';
      tocLinks.forEach((a, id) => a.classList.toggle('is-current', found && id === found.id));
    }
  };
  let queued = false;
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; update(); }); } }, { passive: true });
  addEventListener('resize', update);
  requestAnimationFrame(update);

  // How far through each chapter the reader has been, shown in the contents.
  const readProgress = () => {
    chapters.forEach((ch) => {
      const a = tocLinks.get(ch.id);
      if (!a) return;
      const r = ch.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight * 0.5 - r.top) / r.height));
      const prev = parseFloat(a.style.getPropertyValue('--read') || 0);
      if (p > prev) a.style.setProperty('--read', p.toFixed(3));
    });
  };
  addEventListener('scroll', readProgress, { passive: true });
  requestAnimationFrame(readProgress);
}

/* ---------------- contents overlay ---------------- */

export function initToc() {
  const toc = document.querySelector('[data-toc]');
  const openBtn = document.querySelector('[data-toc-open]');
  const closeBtn = document.querySelector('[data-toc-close]');
  if (!toc || !openBtn) return;
  toc.querySelectorAll('.toc-list a').forEach((a, i) => a.style.setProperty('--i', i));
  let lastFocus = null;

  const open = () => {
    lastFocus = document.activeElement;
    toc.hidden = false;
    openBtn.setAttribute('aria-expanded', 'true');
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(() => { toc.classList.add('is-open'); closeBtn.focus({ preventScroll: true }); });
  };
  const close = (restore = true) => {
    toc.classList.remove('is-open');
    openBtn.setAttribute('aria-expanded', 'false');
    document.documentElement.style.overflow = '';
    setTimeout(() => { toc.hidden = true; }, REDUCED ? 0 : 300);
    if (restore && lastFocus) lastFocus.focus({ preventScroll: true });
  };
  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', () => close());
  toc.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) close(false);
  });
  document.addEventListener('keydown', (e) => {
    if (toc.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const f = [...toc.querySelectorAll('a, button')];
      const first = f[0];
      const lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    }
  });
}

/* ---------------- footnote popovers ---------------- */

export function initNotes() {
  const pop = document.querySelector('[data-notepop]');
  if (!pop) return;
  let openFor = null;

  const place = (a) => {
    const r = a.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    let left = Math.min(Math.max(12, r.left + r.width / 2 - pr.width / 2), innerWidth - pr.width - 12);
    let top = r.bottom + 10;
    if (top + pr.height > innerHeight - 12) top = Math.max(12, r.top - pr.height - 10);
    pop.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  };

  const close = () => {
    if (!openFor) return;
    openFor.classList.remove('is-open');
    openFor.setAttribute('aria-expanded', 'false');
    openFor = null;
    pop.hidden = true;
  };

  const open = (a) => {
    const n = a.dataset.fn;
    const li = document.getElementById(`s${n}`);
    if (!li) return;
    if (openFor) close();
    pop.replaceChildren();
    const head = document.createElement('span');
    head.className = 'note-pop-n';
    head.textContent = `Source ${n}`;
    const body = document.createElement('div');
    body.className = 'note-pop-src';
    body.append(...[...li.childNodes].map((c) => c.cloneNode(true)));
    const foot = document.createElement('div');
    foot.className = 'note-pop-foot';
    const all = document.createElement('a');
    all.href = `#s${n}`;
    all.textContent = 'All sources';
    all.addEventListener('click', () => {
      close();
      li.classList.add('is-flash');
      setTimeout(() => li.classList.remove('is-flash'), 1800);
    });
    const x = document.createElement('a');
    x.href = '#';
    x.textContent = 'Close';
    x.addEventListener('click', (e) => { e.preventDefault(); const f = openFor; close(); if (f) f.focus(); });
    foot.append(all, x);
    pop.append(head, body, foot);
    pop.hidden = false;
    place(a);
    openFor = a;
    a.classList.add('is-open');
    a.setAttribute('aria-expanded', 'true');
  };

  document.querySelectorAll('sup.fn a').forEach((a) => {
    a.setAttribute('aria-haspopup', 'dialog');
    a.setAttribute('aria-expanded', 'false');
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (openFor === a) close(); else open(a);
    });
  });
  document.addEventListener('pointerdown', (e) => {
    if (openFor && !pop.contains(e.target) && !e.target.closest('sup.fn')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openFor) { const f = openFor; close(); f.focus(); }
  });
  addEventListener('scroll', () => { if (openFor) place(openFor); }, { passive: true });
  addEventListener('resize', close);
}

/* ---------------- reveals and the Dune line ---------------- */

export function initReveal() {
  const items = document.querySelectorAll('[data-reveal]');
  if (REDUCED || !('IntersectionObserver' in window)) { items.forEach((n) => n.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  items.forEach((n) => io.observe(n));
}

export function initScrub() {
  document.querySelectorAll('[data-scrub] p').forEach((p) => {
    const text = p.textContent.trim();
    p.setAttribute('aria-label', text);
    p.replaceChildren(...text.split(/\s+/).flatMap((w, i) => {
      const s = document.createElement('span');
      s.className = 'w';
      s.setAttribute('aria-hidden', 'true');
      s.textContent = w;
      return i ? [document.createTextNode(' '), s] : [s];
    }));
    const words = [...p.querySelectorAll('.w')];
    if (REDUCED) { words.forEach((w) => w.classList.add('on')); return; }
    let near = false;
    let lit = -1;
    const update = () => {
      if (!near) return;
      const r = p.getBoundingClientRect();
      const prog = (innerHeight * 0.8 - r.top) / (r.height + innerHeight * 0.35);
      const k = Math.round(Math.min(1, Math.max(0, prog)) * words.length);
      if (k === lit) return;
      lit = k;
      words.forEach((w, i) => w.classList.toggle('on', i < k));
    };
    new IntersectionObserver((es) => { near = es[0].isIntersecting; update(); }, { rootMargin: '30% 0px 30% 0px' }).observe(p);
    addEventListener('scroll', update, { passive: true });
  });
}
