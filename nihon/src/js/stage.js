// The print behind the page: one scene per chapter, cross-faded as the reader
// descends, loaded only when needed, in the current theme. The opening scene is
// split into three depth layers that drift with the pointer and the scroll.

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const portraitMQ = matchMedia('(orientation: portrait)');

export function isNight() {
  return getComputedStyle(document.documentElement).getPropertyValue('--night').trim() === '1';
}

export function initStage() {
  const stage = document.querySelector('.stage');
  if (!stage) return;
  const scenes = new Map([...stage.querySelectorAll('.scene')].map((s) => [s.dataset.scene, s]));
  const sections = [...document.querySelectorAll('main [data-scene]')];
  const order = [...new Set(sections.map((s) => s.dataset.scene))];
  let current = null;

  function load(name, night = isNight()) {
    const sc = scenes.get(name);
    if (!sc) return;
    const wrap = sc.querySelector(`.scene-theme.${night ? 'night' : 'day'}`);
    const layered = wrap.querySelector('.layers') && !portraitMQ.matches;
    const pics = wrap.querySelectorAll(layered ? '.layer' : '.flat');
    pics.forEach((pic) => {
      if (pic.dataset.loaded) return;
      pic.dataset.loaded = '1';
      pic.querySelectorAll('source').forEach((s) => {
        if (s.dataset.srcset) s.srcset = s.dataset.srcset;
      });
      const img = pic.querySelector('img');
      const done = () => {
        const show = () => img.classList.add('ready');
        if (img.decode) img.decode().then(show, show);
        else show();
      };
      img.addEventListener('load', done, { once: true });
      if (name === 'hero') img.fetchPriority = 'high';
      img.src = img.dataset.src;
      if (img.complete && img.naturalWidth) done();
    });
  }

  function activate(name) {
    if (!scenes.has(name) || name === current) return;
    current = name;
    scenes.forEach((sc, n) => sc.classList.toggle('on', n === name));
    load(name);
    const i = order.indexOf(name);
    const next = order[i + 1];
    if (next) setTimeout(() => load(next), 1500);
  }

  // The section that crosses the middle of the screen chooses the painting.
  const visible = new Set();
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
      const pick = sections.filter((s) => visible.has(s)).pop();
      if (pick) activate(pick.dataset.scene);
    },
    { rootMargin: '-48% 0px -48% 0px' }
  );
  sections.forEach((s) => io.observe(s));
  activate(sections[0]?.dataset.scene || 'hero');

  // Theme changes: fetch the other palette's pictures for what is on screen.
  const refresh = () => {
    if (current) load(current);
    const i = order.indexOf(current);
    if (order[i + 1]) load(order[i + 1]);
  };
  new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', refresh);
  portraitMQ.addEventListener?.('change', refresh);

  initParallax(scenes.get('hero'));
}

function initParallax(hero) {
  if (!hero) return;
  const layers = hero.querySelectorAll('.layers');
  if (!layers.length) return;
  let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
  const fine = matchMedia('(pointer: fine)').matches;

  function tick() {
    raf = 0;
    if (reduceMotion.matches) return;
    x += (tx - x) * 0.06;
    y += (ty - y) * 0.06;
    const scroll = Math.min(window.scrollY / window.innerHeight, 1.5);
    const py = y - scroll * 2.2;
    layers.forEach((l) => {
      l.style.setProperty('--px', x.toFixed(3));
      l.style.setProperty('--py', py.toFixed(3));
    });
    if (Math.abs(tx - x) > 0.002 || Math.abs(ty - y) > 0.002) raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
  if (fine) {
    window.addEventListener('pointermove', (e) => {
      tx = (e.clientX / window.innerWidth - 0.5) * -2;
      ty = (e.clientY / window.innerHeight - 0.5) * -1.2;
      kick();
    }, { passive: true });
  }
  window.addEventListener('scroll', kick, { passive: true });
  kick();
}
