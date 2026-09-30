// The Hyakunin Isshu reader: one poem at a time, reachable from any "#poem-N"
// link. Without the script every poem is simply listed.

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function initAnthology() {
  const root = document.getElementById('anthology');
  if (!root) return;
  const arts = [...root.querySelectorAll('.poem')];
  const links = [...root.querySelectorAll('.pg')];
  let current = 1;

  function show(n, { scroll = false, focus = false } = {}) {
    n = Math.min(100, Math.max(1, n));
    current = n;
    arts.forEach((a) => a.classList.toggle('current', Number(a.dataset.n) === n));
    links.forEach((l) => (Number(l.dataset.n) === n ? l.setAttribute('aria-current', 'true') : l.removeAttribute('aria-current')));
    if (scroll) {
      const top = root.getBoundingClientRect().top + window.scrollY - 96;
      window.scrollTo({ top, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    }
    if (focus) {
      const h = arts[n - 1].querySelector('.poem-h');
      h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    }
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#poem-"]');
    if (!a) return;
    const n = Number(a.getAttribute('href').slice(6));
    if (!n) return;
    e.preventDefault();
    const inside = !!a.closest('#anthology');
    show(n, { scroll: !inside || window.innerWidth <= 900, focus: !inside });
    history.replaceState(null, '', `#poem-${n}`);
  });
  root.querySelector('[data-anth="prev"]')?.addEventListener('click', () => show(current > 1 ? current - 1 : 100));
  root.querySelector('[data-anth="next"]')?.addEventListener('click', () => show(current < 100 ? current + 1 : 1));
  root.querySelector('[data-anth="random"]')?.addEventListener('click', () => {
    let n = current;
    while (n === current) n = 1 + Math.floor(Math.random() * 100);
    show(n);
  });
  root.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight') show(current < 100 ? current + 1 : 1);
    if (e.key === 'ArrowLeft') show(current > 1 ? current - 1 : 100);
  });

  const m = /^#poem-(\d{1,3})$/.exec(location.hash);
  if (m) {
    show(Number(m[1]));
    requestAnimationFrame(() => show(Number(m[1]), { scroll: true }));
  } else {
    show(1);
  }
}
