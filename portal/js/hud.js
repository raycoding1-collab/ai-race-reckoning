// DOM overlay: crosshair, subtitles, chamber cards, fades and menus.

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      cross: $('crosshair'),
      sub: $('subtitle'),
      card: $('card'),
      cardNum: $('card-num'),
      cardTitle: $('card-title'),
      fade: $('fade'),
      fadeText: $('fade-text'),
      death: $('death'),
      fps: $('fps'),
      ring: $('restart-ring'),
      hurt: $('hurt'),
      timer: $('timer'),
    };
    this.typing = null;
    this.queue = [];
  }

  crosshair(blue, orange, gun) {
    const c = this.el.cross;
    c.classList.toggle('has-blue', blue);
    c.classList.toggle('has-orange', orange);
    c.classList.toggle('gun-none', gun === 'none');
    c.classList.toggle('gun-blue', gun === 'blue');
  }

  setGun(gun) { this.crosshair(false, false, gun); }

  chamber(index, title) {
    const { card, cardNum, cardTitle } = this.el;
    this.el.fade.classList.remove('white');
    cardNum.textContent = String(index).padStart(2, '0');
    cardTitle.textContent = title;
    card.classList.remove('show');
    void card.offsetWidth;
    card.classList.add('show');
    this.el.fade.classList.remove('on');
  }

  // Subtitles type out quickly and disappear soon after the line ends. When a
  // speaker is supplied the subtitle stays up exactly as long as it talks.
  say(text, opts = {}) {
    this.queue.push({ text, ...opts });
    if (!this.busy) this.next();
  }

  next() {
    clearTimeout(this.typing);
    const item = this.queue.shift();
    const sub = this.el.sub;
    if (!item) { this.busy = false; sub.classList.remove('show'); return; }
    this.busy = true;
    sub.textContent = '';
    sub.classList.toggle('show', !item.silent);
    const text = item.text;
    let typed = 0, spoken = !item.speak, done = false;
    const finish = () => {
      if (done || !spoken || typed < text.length) return;
      done = true;
      // short hold after the line, longer only for long lines
      this.typing = setTimeout(() => this.next(), item.speak ? 700 : 900 + text.length * 22);
    };
    if (item.speak) item.speak(text, () => { spoken = true; finish(); });
    const tick = () => {
      typed = Math.min(text.length, typed + 3);
      sub.textContent = text.slice(0, typed);
      if (typed % 9 === 0) item.blip?.();
      if (typed < text.length) this.typing = setTimeout(tick, 18);
      else finish();
    };
    tick();
  }

  clearSay() {
    clearTimeout(this.typing);
    this.typing = null;
    this.busy = false;
    this.queue = [];
    this.el.sub.classList.remove('show');
    this.onClear?.();
  }

  hurt(k) {
    if (Math.abs(k - (this.hurtK || 0)) < 0.01) return;
    this.hurtK = k;
    this.el.hurt.style.opacity = Math.min(1, k * 1.4).toFixed(2);
  }

  // neurotoxin countdown (null hides it)
  timer(sec) {
    const el = this.el.timer;
    if (sec === null) { if (!el.hidden) el.hidden = true; return; }
    el.hidden = false;
    const t = Math.max(0, Math.ceil(sec));
    const txt = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    if (el.textContent !== txt) el.textContent = txt;
    el.classList.toggle('low', sec < 30);
  }

  ending() {
    this.el.fadeText.innerHTML = '<strong>Escaped</strong><span>Momentum Test Chambers</span><em>An unofficial fan tribute to Valve\'s Portal.<br>Built from scratch: physics, portals, chambers, voice and sound.<br><br>Thank you for testing.</em>';
    this.el.fade.classList.add('on', 'white');
  }

  death(on) {
    this.el.death.classList.toggle('on', on);
  }

  complete(index, title) {
    this.el.fadeText.innerHTML = `<span>Chamber ${String(index).padStart(2, '0')}</span><strong>Complete</strong>`;
    this.el.fade.classList.add('on');
  }

  finished() {
    this.el.fadeText.innerHTML = '<span>All chambers</span><strong>Complete</strong><em>Thank you for testing.</em>';
    this.el.fade.classList.add('on');
  }

  fps(v, show) {
    this.el.fps.hidden = !show;
    if (show) this.el.fps.textContent = `${Math.round(v)} fps`;
  }

  restartProgress(k) {
    this.el.ring.hidden = k <= 0;
    this.el.ring.style.setProperty('--k', k);
  }
}
