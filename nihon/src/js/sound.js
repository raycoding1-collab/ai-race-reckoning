// Ambient sound, off until asked for: the sea breathing on a shore, and now and
// then a few notes of the koto in the in scale (miyako-bushi), with the pitch
// bends a player makes by pressing the string behind the bridge. Synthesized
// live with the Web Audio API; nothing is downloaded.

const SCALE = [0, 1, 5, 7, 8]; // the in scale: D E♭ G A B♭
const BASE = 146.83; // D3

function noiseBuffer(ctx, seconds) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
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
    master.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);
    verb = ctx.createConvolver();
    verb.buffer = impulse(ctx, 3.6, 3.0);
    const wet = ctx.createGain();
    wet.gain.value = 0.45;
    verb.connect(wet).connect(master);

    // the sea: noise through a low-pass filter that opens and closes like a swell
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 8);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.4;
    const swell = ctx.createGain();
    swell.gain.value = 0.12;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.08;
    lfo.connect(lfoGain).connect(swell.gain);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.09;
    const lg2 = ctx.createGain();
    lg2.gain.value = 260;
    lfo2.connect(lg2).connect(lp.frequency);
    src.connect(lp).connect(swell).connect(master);
    swell.connect(verb);
    src.start();
    lfo.start();
    lfo2.start();
  }

  function pluck(step, when, bend) {
    const f = freq(step);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, when);
    out.gain.linearRampToValueAtTime(0.2, when + 0.004);
    out.gain.exponentialRampToValueAtTime(0.0006, when + 3.2);
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.setValueAtTime(5200, when);
    bp.frequency.exponentialRampToValueAtTime(900, when + 1.4);
    // a plucked silk string: bright partials that die away quickly
    [1, 2, 3, 4, 6].forEach((h, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(f * h, when);
      if (bend) {
        // oshide: press the string to raise the pitch a step, then release
        o.frequency.setValueAtTime(f * h, when + 0.25);
        o.frequency.linearRampToValueAtTime(f * h * Math.pow(2, bend / 12), when + 0.45);
        o.frequency.linearRampToValueAtTime(f * h, when + 1.1);
      }
      const g = ctx.createGain();
      g.gain.setValueAtTime([1, 0.5, 0.28, 0.14, 0.06][i], when);
      g.gain.exponentialRampToValueAtTime(0.001, when + [3, 1.6, 1.1, 0.7, 0.4][i]);
      o.connect(g).connect(bp);
      o.start(when);
      o.stop(when + 3.3);
    });
    bp.connect(out);
    out.connect(master);
    out.connect(verb);
  }

  function phrase() {
    if (!playing) return;
    const now = ctx.currentTime + 0.1;
    let step = 5 + Math.floor(Math.random() * 5);
    const n = 3 + Math.floor(Math.random() * 4);
    let t = now;
    for (let i = 0; i < n; i++) {
      const bend = Math.random() < 0.2 ? (Math.random() < 0.5 ? 1 : 2) : 0;
      pluck(step, t, bend);
      // koto phrases often run down the scale and pause
      t += 0.32 + Math.random() * (i === n - 2 ? 1.4 : 0.6);
      step = Math.max(0, Math.min(13, step + [-1, -1, -2, 1, 2, -1][Math.floor(Math.random() * 6)]));
    }
    timer = setTimeout(phrase, (t - now) * 1000 + 6000 + Math.random() * 9000);
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
