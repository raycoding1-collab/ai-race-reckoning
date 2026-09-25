import { initHero } from './hero.js';
import { initCharts } from './charts.js';
import { initLedger, initMast, initToc, initNotes, initReveal, initScrub } from './ui.js';

window.__reckoning = true;

const safely = (name, fn) => {
  const t = performance.now();
  try { fn(); } catch (err) { console.error(`${name} failed`, err); }
  performance.measure(`init:${name}`, { start: t, end: performance.now() });
};

// What is on screen first gets set up first; the rest waits for an idle moment.
safely('hero', () => {
  const canvas = document.querySelector('[data-hero]');
  const params = new URLSearchParams(location.search);
  // ?still=<seconds> renders one fixed frame (used to make the poster image).
  const still = params.get('still');
  const pitch = params.get('pitch');
  initHero(canvas, still != null ? { still: true, time: +still || 0, lights: +(params.get('lights') ?? still) || 0, scale: +(params.get('scale') || 1), pitch: pitch != null ? +pitch : undefined } : {});
});
safely('mast', initMast);
safely('toc', initToc);
safely('notes', initNotes);
safely('reveal', initReveal);
safely('ledger', initLedger);

const later = (fn) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 500 }) : setTimeout(fn, 50));
later(() => {
  safely('scrub', initScrub);
  safely('charts', initCharts);
});
