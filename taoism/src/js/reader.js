// The Daodejing reader: one chapter at a time, reachable from any "#ddj-N" link
// on the page. Without the script every chapter is simply listed.

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function initReader() {
  const reader = document.getElementById('reader');
  if (!reader) return;
  const arts = [...reader.querySelectorAll('.ddj')];
  const links = [...reader.querySelectorAll('.rg')];
  let current = 0;

  function show(n, { scroll = false, focus = false } = {}) {
    n = Math.min(81, Math.max(1, n));
    current = n;
    arts.forEach((a) => a.classList.toggle('current', Number(a.dataset.ch) === n));
    links.forEach((l) => (Number(l.dataset.ch) === n ? l.setAttribute('aria-current', 'true') : l.removeAttribute('aria-current')));
    if (scroll) {
      const top = reader.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    }
    if (focus) {
      const h = arts[n - 1].querySelector('.ddj-h');
      if (h) {
        h.setAttribute('tabindex', '-1');
        h.focus({ preventScroll: true });
      }
    }
  }

  // Any link to a chapter, anywhere on the page, opens it here.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#ddj-"]');
    if (!a) return;
    const n = Number(a.getAttribute('href').slice(5));
    if (!n) return;
    e.preventDefault();
    const inReader = !!a.closest('#reader');
    show(n, { scroll: !inReader || window.innerWidth <= 900, focus: !inReader });
    history.replaceState(null, '', `#ddj-${n}`);
  });

  reader.querySelector('[data-reader="prev"]')?.addEventListener('click', () => show(current > 1 ? current - 1 : 81));
  reader.querySelector('[data-reader="next"]')?.addEventListener('click', () => show(current < 81 ? current + 1 : 1));
  reader.querySelector('[data-reader="random"]')?.addEventListener('click', () => {
    let n = current;
    while (n === current) n = 1 + Math.floor(Math.random() * 81);
    show(n);
  });
  const flow = reader.querySelector('[data-reader="flow"]');
  flow?.addEventListener('click', () => {
    const on = reader.classList.toggle('flow-h');
    flow.setAttribute('aria-pressed', String(on));
    flow.textContent = on ? 'Vertical Chinese' : 'Horizontal Chinese';
  });
  reader.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight') show(current < 81 ? current + 1 : 1);
    if (e.key === 'ArrowLeft') show(current > 1 ? current - 1 : 81);
  });

  const m = /^#ddj-(\d{1,2})$/.exec(location.hash);
  if (m) {
    show(Number(m[1]));
    requestAnimationFrame(() => show(Number(m[1]), { scroll: true }));
  } else {
    show(1);
  }
}
