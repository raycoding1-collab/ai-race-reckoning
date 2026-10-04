// Announcer voice. Every line is pre-rendered with a neural voice and a
// facility-AI vocoder treatment (see voice/ and the generator notes in the
// README); clips are decoded once and played through Web Audio. If a line
// has no clip, the browser's own speech synthesiser is used instead.

const BASE = new URL('../voice/', import.meta.url);

export class Voice {
  constructor(audio) {
    this.audio = audio;
    this.enabled = true;
    this.volume = 0.9;
    this.cache = new Map();      // text -> Promise<AudioBuffer|null>
    this.current = null;
    this.token = 0;
    this.manifest = fetch(new URL('lines.json', BASE)).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    this.tts = typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  get ok() { return true; }

  // start downloading the clips a chamber will need
  preload(texts) {
    for (const t of texts) this.buffer(t);
  }

  buffer(text) {
    if (this.cache.has(text)) return this.cache.get(text);
    const p = this.manifest.then(async (m) => {
      const entry = m[text];
      if (!entry) return null;
      const res = await fetch(new URL(entry.file, BASE));
      const data = await res.arrayBuffer();
      const ctx = this.audio.ctx;
      if (!ctx) return data;                       // decode later, once audio is unlocked
      return await ctx.decodeAudioData(data);
    }).catch(() => null);
    this.cache.set(text, p);
    return p;
  }

  unlock() {
    if (this.tts && !this.unlocked) {
      this.unlocked = true;
      try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch { /* unsupported */ }
    }
  }

  say(text, done) {
    if (!this.enabled || this.volume <= 0) { done?.(false); return; }
    this.stop();
    const token = ++this.token;
    const end = () => { if (token === this.token) { this.current = null; done?.(true); } };
    this.buffer(text).then(async (buf) => {
      if (token !== this.token) return;
      const ctx = this.audio.ctx;
      if (buf instanceof ArrayBuffer && ctx) {
        buf = await ctx.decodeAudioData(buf).catch(() => null);
        this.cache.set(text, Promise.resolve(buf));
      }
      if (buf && ctx && !(buf instanceof ArrayBuffer)) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.value = this.volume;
        src.connect(g);
        g.connect(this.audio.master);
        if (this.audio.reverb) { const s = ctx.createGain(); s.gain.value = 0.18 * this.volume; g.connect(s).connect(this.audio.reverb); }
        src.onended = end;
        src.start();
        this.current = src;
      } else {
        this.speakFallback(text, end);
      }
    });
  }

  speakFallback(text, end) {
    if (!this.tts) { setTimeout(end, 1200 + text.length * 45); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = 1.3; u.rate = 0.95; u.volume = this.volume;
    u.onend = end; u.onerror = end;
    speechSynthesis.speak(u);
  }

  stop() {
    this.token++;
    try { this.current?.stop(); } catch { /* already stopped */ }
    this.current = null;
    if (this.tts) { try { speechSynthesis.cancel(); } catch { /* ignore */ } }
  }
}
