// Ambient sound, off until asked for: a stream of filtered noise and, now and
// then, a few plucked notes of the pentatonic scale with a slide, in the manner
// of the guqin, the seven-string zither of scholars and recluses. Synthesized
// live with the Web Audio API; nothing is downloaded.

const SCALE = [0, 2, 4, 7, 9]; // gong shang jue zhi yu
const BASE = 110; // A2

function noiseBuffer(ctx, seconds) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02; // brownish
    d[i] = last * 3.5;
  }
  return b;
}

function impulse(ctx, seconds, decay) {
  const len = ctx.sampleRate * seconds;
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

function freq(step) {
  const oct = Math.floor(step / 5);
  const deg = ((step % 5) + 5) % 5;
  return BASE * Math.pow(2, oct + SCALE[deg] / 12);
}

export function initSound() {
  const btn = document.querySelector('[data-sound]');
  if (!btn) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { btn.hidden = true; return; }
  let ctx = null, master = null, verb = null, playing = false, timer = 0;

  function setup() {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    verb = ctx.createConvolver();
    verb.buffer = impulse(ctx, 4.5, 3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    verb.connect(wet).connect(master);

    // the stream: brown noise through a slowly wandering band-pass filter
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 6);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.16;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lg = ctx.createGain();
    lg.gain.value = 180;
    lfo.connect(lg).connect(bp.frequency);
    src.connect(bp).connect(g).connect(master);
    g.connect(verb);
    src.start();
    lfo.start();
  }

  function pluck(step, when, slideTo) {
    const f = freq(step);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, when);
    out.gain.linearRampToValueAtTime(0.22, when + 0.008);
    out.gain.exponentialRampToValueAtTime(0.0008, when + 4.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, when);
    lp.frequency.exponentialRampToValueAtTime(600, when + 2.5);
    [1, 2, 3, 5].forEach((h, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(f * h, when);
      if (slideTo != null) o.frequency.linearRampToValueAtTime(freq(slideTo) * h, when + 0.9);
      const og = ctx.createGain();
      og.gain.value = [1, 0.35, 0.16, 0.06][i];
      o.connect(og).connect(lp);
      o.start(when);
      o.stop(when + 4.4);
    });
    lp.connect(out);
    out.connect(master);
    out.connect(verb);
  }

  function phrase() {
    if (!playing) return;
    const now = ctx.currentTime + 0.1;
    let step = 5 + Math.floor(Math.random() * 5);
    const n = 2 + Math.floor(Math.random() * 4);
    let t = now;
    for (let i = 0; i < n; i++) {
      const slide = Math.random() < 0.25 ? step + (Math.random() < 0.5 ? 1 : -1) : null;
      pluck(step, t, slide);
      t += 0.45 + Math.random() * 1.1;
      step = Math.max(0, Math.min(12, step + [-2, -1, 1, 2, -1][Math.floor(Math.random() * 5)]));
    }
    timer = setTimeout(phrase, (t - now) * 1000 + 5000 + Math.random() * 9000);
  }

  btn.addEventListener('click', async () => {
    if (!ctx) setup();
    playing = !playing;
    btn.setAttribute('aria-pressed', String(playing));
    btn.setAttribute('aria-label', playing ? 'Stop ambient sound' : 'Play ambient sound');
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    if (playing) {
      await ctx.resume();
      master.gain.linearRampToValueAtTime(0.9, t + 2.5);
      phrase();
    } else {
      clearTimeout(timer);
      master.gain.linearRampToValueAtTime(0, t + 1.2);
      setTimeout(() => { if (!playing) ctx.suspend(); }, 1400);
    }
  });
}
