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
    cardNum.textContent = String(index).padStart(2, '0');
    cardTitle.textContent = title;
    card.classList.remove('show');
    void card.offsetWidth;
    card.classList.add('show');
    this.el.fade.classList.remove('on');
  }

  say(text, blip) {
    this.queue.push({ text, blip });
    if (!this.typing) this.next();
  }

  next() {
    const item = this.queue.shift();
    const sub = this.el.sub;
    if (!item) { this.typing = null; return; }
    sub.textContent = '';
    sub.classList.add('show');
    let i = 0;
    const words = item.text;
    const tick = () => {
      i += 2;
      sub.textContent = words.slice(0, i);
      if (i % 6 === 0) item.blip?.();
      if (i < words.length) this.typing = setTimeout(tick, 28);
      else this.typing = setTimeout(() => {
        if (this.queue.length) this.next();
        else { sub.classList.remove('show'); this.typing = null; }
      }, 2600 + words.length * 30);
    };
    tick();
  }

  clearSay() {
    clearTimeout(this.typing);
    this.typing = null;
    this.queue = [];
    this.el.sub.classList.remove('show');
  }

  hurt(k) {
    if (Math.abs(k - (this.hurtK || 0)) < 0.01) return;
    this.hurtK = k;
    this.el.hurt.style.opacity = Math.min(1, k * 1.4).toFixed(2);
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
