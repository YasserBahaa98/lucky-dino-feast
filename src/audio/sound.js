// All sounds are synthesized with WebAudio, so there are no audio files to download.
// To use a real "Fastooka!" recording later, drop public/fastooka.mp3 in place:
// it's picked up automatically and used instead of the synth voice.

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.voiceBuffer = null;
    this.musicOn = false;
  }

  /** Must be called from a user tap (browsers block audio until then). */
  unlock() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(comp);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 1;
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.2;
    this.musicBus.connect(this.master);

    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.loadVoice();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend();
      else ctx.resume();
    });
  }

  async loadVoice() {
    try {
      const res = await fetch(new URL('fastooka.mp3', document.baseURI));
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      this.voiceBuffer = await this.ctx.decodeAudioData(buf);
    } catch {
      /* no recording: use the synth voice */
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  get now() {
    return this.ctx.currentTime;
  }

  // ---------- building blocks ----------

  tone({ type = 'sine', f = 440, f2 = null, dur = 0.2, vol = 0.3, at = 0, attack = 0.01, dest = this.sfx, vibrato = 0 }) {
    if (!this.ctx) return;
    const t = this.now + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    if (vibrato) {
      const lfo = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      lfo.frequency.value = 9;
      lg.gain.value = vibrato;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.2, vol = 0.3, at = 0, filter = 'bandpass', f = 1000, f2 = null, q = 1, attack = 0.005, dest = this.sfx }) {
    if (!this.ctx) return;
    const t = this.now + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const fl = this.ctx.createBiquadFilter();
    fl.type = filter;
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    fl.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /** A squeaky cartoon vowel: sawtooth through two formant filters. */
  vowel({ at = 0, dur = 0.2, p1 = 500, p2 = 600, f1 = 700, f2 = 1200, vol = 0.35 }) {
    if (!this.ctx) return;
    const t = this.now + at;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(p1, t);
    o.frequency.linearRampToValueAtTime(p2, t + dur);
    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    out.gain.setValueAtTime(vol, t + dur * 0.7);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [ff, gain] of [[f1, 1], [f2, 0.6]]) {
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = ff;
      bp.Q.value = 6;
      const g = this.ctx.createGain();
      g.gain.value = gain * 3;
      o.connect(bp).connect(g).connect(out);
    }
    out.connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------- sound effects ----------

  fastooka() {
    if (!this.ctx) return;
    if (this.voiceBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.voiceBuffer;
      src.connect(this.sfx);
      src.start();
      return;
    }
    const k = 0.9 + Math.random() * 0.2;
    // "fa"
    this.noise({ at: 0, dur: 0.07, vol: 0.12, filter: 'highpass', f: 3000 });
    this.vowel({ at: 0.05, dur: 0.12, p1: 520 * k, p2: 600 * k, f1: 800, f2: 1250 });
    // "STOO"
    this.noise({ at: 0.17, dur: 0.07, vol: 0.14, filter: 'highpass', f: 4500 });
    this.noise({ at: 0.23, dur: 0.03, vol: 0.2, filter: 'bandpass', f: 3000, q: 2 });
    this.vowel({ at: 0.25, dur: 0.26, p1: 760 * k, p2: 640 * k, f1: 380, f2: 950, vol: 0.42 });
    // "ka!"
    this.noise({ at: 0.53, dur: 0.035, vol: 0.25, filter: 'bandpass', f: 1800, q: 3 });
    this.vowel({ at: 0.56, dur: 0.2, p1: 820 * k, p2: 560 * k, f1: 850, f2: 1350, vol: 0.4 });
    // little whistle on top, like a bird
    this.tone({ type: 'sine', f: 1800 * k, f2: 2600 * k, dur: 0.12, vol: 0.06, at: 0.6 });
  }

  chirp() {
    const k = 0.9 + Math.random() * 0.25;
    this.tone({ f: 1900 * k, f2: 2700 * k, dur: 0.08, vol: 0.12 });
    this.tone({ f: 2100 * k, f2: 3000 * k, dur: 0.09, vol: 0.1, at: 0.1 });
  }

  flap() {
    this.noise({ dur: 0.12, vol: 0.06, filter: 'lowpass', f: 700, f2: 300 });
  }

  toss() {
    this.noise({ dur: 0.3, vol: 0.12, filter: 'bandpass', f: 500, f2: 2200, q: 2 });
  }

  munch() {
    this.noise({ dur: 0.09, vol: 0.28, filter: 'bandpass', f: 700 + Math.random() * 300, q: 1.5 });
    this.tone({ type: 'triangle', f: 160, f2: 90, dur: 0.08, vol: 0.15 });
  }

  pop(k = 1) {
    this.tone({ type: 'sine', f: 320 * k, f2: 980 * k, dur: 0.12, vol: 0.3 });
  }

  gulp() {
    this.tone({ type: 'sine', f: 700, f2: 220, dur: 0.16, vol: 0.28 });
    this.tone({ type: 'sine', f: 900, f2: 1600, dur: 0.08, vol: 0.12, at: 0.15 });
  }

  boing() {
    this.tone({ type: 'sine', f: 180, f2: 520, dur: 0.35, vol: 0.32, vibrato: 30 });
  }

  whoosh() {
    this.noise({ dur: 0.55, vol: 0.18, filter: 'bandpass', f: 300, f2: 2500, q: 1.2, attack: 0.1 });
  }

  thwip() {
    this.tone({ type: 'sine', f: 300, f2: 1400, dur: 0.15, vol: 0.25 });
    this.tone({ type: 'sine', f: 1200, f2: 250, dur: 0.25, vol: 0.2, at: 0.3 });
  }

  huh() {
    this.tone({ type: 'triangle', f: 300, f2: 480, dur: 0.25, vol: 0.2 });
  }

  surprise() {
    this.tone({ type: 'square', f: 400, f2: 1100, dur: 0.15, vol: 0.12 });
  }

  sneezeIn(step) {
    this.vowel({ dur: 0.3, p1: 260 + step * 60, p2: 340 + step * 80, f1: 750, f2: 1200, vol: 0.25 });
  }

  choo() {
    this.noise({ dur: 0.45, vol: 0.4, filter: 'bandpass', f: 2500, f2: 800, q: 0.8 });
    this.vowel({ dur: 0.3, p1: 420, p2: 260, f1: 350, f2: 900, vol: 0.35 });
  }

  dinoHappy(type) {
    const base = type === 'longneck' ? 200 : type === 'trike' ? 300 : 250;
    this.vowel({ dur: 0.18, p1: base, p2: base * 1.5, f1: 600, f2: 1100, vol: 0.28 });
    this.vowel({ at: 0.2, dur: 0.25, p1: base * 1.4, p2: base * 1.9, f1: 700, f2: 1300, vol: 0.28 });
  }

  yawn(small = false) {
    const k = small ? 1.6 : 1;
    this.vowel({ dur: 0.6, p1: 260 * k, p2: 170 * k, f1: 750, f2: 1150, vol: 0.22 });
  }

  snore(small = false) {
    const k = small ? 1.5 : 1;
    this.noise({ dur: 0.7, vol: 0.07, filter: 'lowpass', f: 380 * k, f2: 220 * k, attack: 0.3 });
    this.tone({ type: 'triangle', f: 110 * k, f2: 80 * k, dur: 0.6, vol: 0.05, attack: 0.25 });
  }

  /** A small, soft "eep" from a lost baby. Gentle, never sad-sounding for long. */
  whimper() {
    this.vowel({ dur: 0.22, p1: 900, p2: 720, f1: 900, f2: 1500, vol: 0.12 });
  }

  /** Rising chime; i = ring number in a chain. */
  ring(i = 0) {
    const f = 660 * Math.pow(2, (i % 8) / 7);
    this.tone({ type: 'sine', f, dur: 0.35, vol: 0.2 });
    this.tone({ type: 'sine', f: f * 2, dur: 0.25, vol: 0.06, at: 0.04 });
  }

  egg() {
    [880, 1109, 1319, 1760].forEach((f, i) => this.tone({ type: 'triangle', f, dur: 0.3, vol: 0.16, at: i * 0.08 }));
    this.tone({ type: 'sine', f: 2640, dur: 0.5, vol: 0.05, at: 0.32, vibrato: 20 });
  }

  /** Soft patter of rain for a few seconds (no thunder: nothing scary). */
  rain(dur = 4) {
    this.noise({ dur, vol: 0.05, filter: 'highpass', f: 2500, attack: 1.2 });
  }

  happy() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone({ type: 'triangle', f, dur: 0.18, vol: 0.18, at: i * 0.07 }));
  }

  fanfare() {
    const notes = [523, 659, 784, 659, 784, 1046];
    notes.forEach((f, i) => this.tone({ type: 'triangle', f, dur: i === notes.length - 1 ? 0.6 : 0.16, vol: 0.22, at: i * 0.13 }));
    notes.forEach((f, i) => this.tone({ type: 'square', f: f / 2, dur: 0.12, vol: 0.05, at: i * 0.13 }));
    for (let i = 0; i < 8; i++) this.noise({ at: 0.8 + i * 0.05, dur: 0.05, vol: 0.12, filter: 'highpass', f: 5000 });
  }

  unlockJingle() {
    [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone({ type: 'sine', f, dur: 0.4, vol: 0.15, at: i * 0.09 }));
  }

  // ---------- music: a gentle ukulele-ish loop ----------

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const bpm = 100;
    const step = 60 / bpm / 2; // eighth notes
    // C  Am  F  G
    const chords = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
    const bass = [130.8, 110, 87.3, 98];
    const C = 523.3, D = 587.3, E = 659.3, G = 784, A = 880, c = 1046.5;
    const melody = [
      E, 0, G, 0, A, G, E, 0, C, 0, D, E, 0, 0, 0, 0,
      A, 0, c, 0, A, G, E, 0, G, 0, E, D, C, 0, 0, 0,
    ];
    let i = 0;
    let next = this.now + 0.1;
    const tick = () => {
      if (!this.musicOn) return;
      if (next < this.now) next = this.now + 0.05;
      while (next < this.now + 0.25) {
        const bar = Math.floor(i / 8) % 4;
        const s = i % 8;
        const at = next - this.now;
        if (s === 0 || s === 4) this.tone({ type: 'sine', f: bass[bar], dur: step * 3, vol: 0.5, at, dest: this.musicBus });
        if (s === 2 || s === 6 || s === 3 || s === 7) {
          chords[bar].forEach((f, k) => this.tone({ type: 'triangle', f, dur: step * 1.4, vol: 0.14, at: at + k * 0.012, dest: this.musicBus }));
        }
        const m = melody[i % melody.length];
        if (m) this.tone({ type: 'triangle', f: m, dur: step * 1.8, vol: 0.3, at, dest: this.musicBus });
        if (s % 2 === 1) this.noise({ at, dur: 0.04, vol: 0.08, filter: 'highpass', f: 7000, dest: this.musicBus });
        i++;
        next += step;
      }
      this.musicTimer = setTimeout(tick, 60);
    };
    tick();
  }
}
