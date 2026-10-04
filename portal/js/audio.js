// Synthesised sound effects (WebAudio). No samples are shipped; everything is
// built from oscillators, filtered noise and a generated room reverb.

export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.holdNode = null;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    // generated impulse response for a hard concrete room
    const len = ctx.sampleRate * 1.6;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.28;
    this.reverb.connect(this.wet).connect(this.master);
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    this.dry.connect(this.reverb);
    // noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    this.startAmbience();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  get t() { return this.ctx.currentTime; }

  env(node, t0, a, peak, d, sustain = 0) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t0 + a + d);
    node.connect(g);
    return g;
  }

  osc(type, f0, f1, t0, dur, peak, dest = this.dry, a = 0.005) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    this.env(o, t0, a, peak, dur).connect(dest);
    o.start(t0); o.stop(t0 + a + dur + 0.05);
    return o;
  }

  noise(t0, dur, peak, type, f0, f1 = f0, q = 1, dest = this.dry, a = 0.003) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    s.connect(f);
    this.env(f, t0, a, peak, dur).connect(dest);
    s.start(t0, Math.random()); s.stop(t0 + a + dur + 0.05);
  }

  // ---------------------------------------------------------------------
  shoot(color) {
    if (!this.ctx) return;
    const t = this.t, hi = color === 'blue';
    this.osc('sawtooth', hi ? 1300 : 900, hi ? 260 : 180, t, 0.18, 0.12);
    this.osc('sine', hi ? 2400 : 1700, hi ? 600 : 400, t, 0.12, 0.08);
    this.noise(t, 0.16, 0.25, 'bandpass', hi ? 4000 : 2800, 600, 2);
  }
  portalOpen(color) {
    if (!this.ctx) return;
    const t = this.t + 0.04, hi = color === 'blue';
    this.noise(t, 0.6, 0.35, 'bandpass', 300, hi ? 2200 : 1600, 3);
    this.osc('sine', hi ? 180 : 140, hi ? 420 : 330, t, 0.5, 0.18, this.dry, 0.05);
  }
  portalFail() {
    if (!this.ctx) return;
    const t = this.t + 0.03;
    this.noise(t, 0.25, 0.3, 'lowpass', 1600, 200, 1);
    this.osc('square', 110, 70, t, 0.2, 0.06);
  }
  portalEnter() {
    if (!this.ctx) return;
    const t = this.t;
    this.noise(t, 0.35, 0.25, 'bandpass', 2600, 500, 1.5, this.dry, 0.02);
    this.osc('sine', 600, 180, t, 0.3, 0.07);
  }
  footstep() {
    if (!this.ctx) return;
    const t = this.t;
    this.noise(t, 0.07, 0.12 + Math.random() * 0.05, 'bandpass', 900 + Math.random() * 500, 400, 1.2);
    this.osc('sine', 120, 70, t, 0.05, 0.05);
  }
  land(speed) {
    if (!this.ctx) return;
    const t = this.t, k = Math.min(1, speed / 900);
    this.noise(t, 0.15 + k * 0.2, 0.2 + k * 0.4, 'lowpass', 1200, 150, 1);
    this.osc('sine', 90, 45, t, 0.2, 0.15 + k * 0.2);
    // long fall boot spring
    if (speed > 500) this.osc('triangle', 520, 380, t + 0.02, 0.25, 0.05);
  }
  jump() { if (this.ctx) this.noise(this.t, 0.08, 0.08, 'highpass', 1500, 2500, 0.7); }
  buttonDown() {
    if (!this.ctx) return;
    const t = this.t;
    this.osc('square', 140, 90, t, 0.12, 0.12);
    this.noise(t, 0.12, 0.25, 'lowpass', 900, 200, 1);
    this.osc('sine', 880, 880, t + 0.12, 0.25, 0.08);
    this.osc('sine', 1320, 1320, t + 0.22, 0.3, 0.06);
  }
  buttonUp() {
    if (!this.ctx) return;
    const t = this.t;
    this.osc('square', 100, 140, t, 0.1, 0.08);
    this.osc('sine', 660, 440, t + 0.08, 0.25, 0.06);
  }
  door(open) {
    if (!this.ctx) return;
    const t = this.t;
    this.noise(t, 0.9, 0.18, 'bandpass', open ? 300 : 500, open ? 700 : 250, 2, this.dry, 0.08);
    this.osc('sawtooth', 55, 50, t, 0.8, 0.05, this.dry, 0.08);
    this.osc('square', 220, 220, t + 0.85, 0.08, 0.05);
  }
  fizzle() {
    if (!this.ctx) return;
    const t = this.t;
    for (let i = 0; i < 6; i++) this.noise(t + i * 0.05, 0.12, 0.15, 'bandpass', 3000 + Math.random() * 3000, 800, 3);
    this.osc('sine', 1200, 200, t, 0.6, 0.06);
  }
  portalsReset() {
    if (!this.ctx) return;
    const t = this.t;
    this.osc('sine', 900, 300, t, 0.35, 0.08);
    this.osc('sine', 700, 220, t + 0.03, 0.35, 0.08);
  }
  pickup() {
    if (!this.ctx) return;
    const t = this.t;
    this.osc('sine', 220, 440, t, 0.15, 0.08);
    this.startHold();
  }
  drop() {
    if (!this.ctx) return;
    this.osc('sine', 440, 200, this.t, 0.15, 0.06);
    this.stopHold();
  }
  startHold() {
    if (!this.ctx || this.holdNode) return;
    const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = 68;
    o2.type = 'sine'; o2.frequency.value = 136.5;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = this.ctx.createGain(); g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.06, this.t + 0.2);
    o.connect(f); o2.connect(f); f.connect(g).connect(this.dry);
    o.start(); o2.start();
    this.holdNode = { o, o2, g };
  }
  stopHold() {
    if (!this.holdNode) return;
    const { o, o2, g } = this.holdNode;
    g.gain.setTargetAtTime(0.0001, this.t, 0.05);
    o.stop(this.t + 0.3); o2.stop(this.t + 0.3);
    this.holdNode = null;
  }
  impact(speed) {
    if (!this.ctx) return;
    const t = this.t, k = Math.min(1, speed / 700);
    this.noise(t, 0.12, 0.1 + k * 0.25, 'lowpass', 700, 120, 1);
    this.osc('sine', 160, 60, t, 0.15, 0.06 + k * 0.12);
  }
  death() {
    if (!this.ctx) return;
    const t = this.t;
    this.noise(t, 1.2, 0.4, 'lowpass', 3000, 80, 1);
    this.osc('sawtooth', 220, 30, t, 1.2, 0.15);
  }
  pelletLaunch() { if (this.ctx) { this.osc('sawtooth', 200, 800, this.t, 0.3, 0.06); this.noise(this.t, 0.3, 0.12, 'bandpass', 1500, 4000, 2); } }
  pelletBounce() { if (this.ctx) this.osc('triangle', 900 + Math.random() * 200, 500, this.t, 0.12, 0.05); }
  pelletExplode() { if (this.ctx) { this.noise(this.t, 0.6, 0.4, 'lowpass', 4000, 100, 1); this.osc('sine', 300, 40, this.t, 0.5, 0.15); } }
  receptacle() {
    if (!this.ctx) return;
    const t = this.t;
    [523, 659, 784, 1046].forEach((f, i) => this.osc('sine', f, f, t + i * 0.09, 0.4, 0.07));
  }
  faith() {
    if (!this.ctx) return;
    const t = this.t;
    this.noise(t, 0.4, 0.4, 'bandpass', 400, 2400, 1.5);
    this.osc('square', 80, 300, t, 0.25, 0.12);
  }
  chime() {
    if (!this.ctx) return;
    const t = this.t;
    this.osc('sine', 784, 784, t, 0.5, 0.06);
    this.osc('sine', 1175, 1175, t + 0.12, 0.6, 0.05);
  }
  turretShot() { if (this.ctx) { this.noise(this.t, 0.05, 0.22, 'bandpass', 2500, 900, 1.2); this.osc('square', 180, 90, this.t, 0.04, 0.05); } }
  turretAlert() { if (this.ctx) { this.osc('sine', 1400, 1400, this.t, 0.12, 0.08); this.osc('sine', 1900, 1900, this.t + 0.14, 0.18, 0.07); } }
  turretTip() { if (this.ctx) { this.osc('sine', 900, 120, this.t, 0.7, 0.08); this.noise(this.t, 0.3, 0.2, 'lowpass', 900, 150, 1); } }
  voiceBlip() { if (this.ctx) this.osc('sine', 500 + Math.random() * 300, 450, this.t, 0.035, 0.012); }
  complete() {
    if (!this.ctx) return;
    const t = this.t;
    [392, 523, 659, 784].forEach((f, i) => this.osc('triangle', f, f, t + i * 0.12, 0.5, 0.06));
  }
  startAmbience() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160;
    const g = ctx.createGain(); g.gain.value = 0.05;
    s.connect(f).connect(g).connect(this.master);
    s.start();
    const hum = ctx.createOscillator(); hum.frequency.value = 60;
    const hg = ctx.createGain(); hg.gain.value = 0.008;
    hum.connect(hg).connect(this.master);
    hum.start();
  }
}
