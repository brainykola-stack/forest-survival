/**
 * Процедурный звук на Web Audio: без внешних файлов, весь эмбиент синтезируется.
 * Днём — ветер и птицы, ночью — низкий гул и редкие шорохи.
 */

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private noiseBuffer: AudioBuffer | null = null;
  private windSrc: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private droneNodes: OscillatorNode[] = [];
  private droneGain: GainNode | null = null;
  private started = false;
  private nightLevel = 0;
  private musicTimer = 0;
  private ambienceTimer = 0;
  private musicVol = 0.55;
  private sfxVol = 0.8;

  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVol;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVol;
    this.sfxGain.connect(this.master);
    this.noiseBuffer = this.makeNoise(2.5);
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (this.musicGain) this.musicGain.gain.value = music;
    if (this.sfxGain) this.sfxGain.gain.value = sfx;
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5 + white * 0.25;
    }
    return buf;
  }

  startAmbience(): void {
    this.ensure();
    if (!this.ctx || this.started) return;
    this.started = true;
    const ctx = this.ctx;

    // Ветер: шум через полосовой фильтр с медленной модуляцией.
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 480;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.16;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    src.start();

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 240;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    this.windSrc = src;
    this.windFilter = filter;
    this.windGain = gain;

    // Ночной гул: две низкие расстроенные волны.
    const dg = ctx.createGain();
    dg.gain.value = 0;
    dg.connect(this.musicGain);
    for (const f of [48, 51.5, 72]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(dg);
      o.start();
      this.droneNodes.push(o);
    }
    this.droneGain = dg;
  }

  stopAmbience(): void {
    try {
      this.windSrc?.stop();
    } catch {
      /* already stopped */
    }
    for (const o of this.droneNodes) {
      try {
        o.stop();
      } catch {
        /* ignore */
      }
    }
    this.windSrc = null;
    this.droneNodes = [];
    this.started = false;
  }

  setNightLevel(level: number): void {
    this.nightLevel = Math.max(0, Math.min(1, level));
    if (!this.ctx) return;
    if (this.droneGain) this.droneGain.gain.setTargetAtTime(this.nightLevel * 0.09, this.ctx.currentTime, 1.2);
    if (this.windFilter) {
      const freq = 420 + (1 - this.nightLevel) * 320;
      this.windFilter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 2.0);
    }
    if (this.windGain) this.windGain.gain.setTargetAtTime(0.1 + this.nightLevel * 0.1, this.ctx.currentTime, 2.0);
  }

  update(dt: number): void {
    if (!this.ctx || !this.started) return;
    this.ambienceTimer -= dt;
    if (this.ambienceTimer <= 0) {
      this.ambienceTimer = 3 + Math.random() * 7;
      if (this.nightLevel < 0.5) this.birdCall();
      else this.nightShuffle();
    }
    this.musicTimer -= dt;
    if (this.musicTimer <= 0 && this.nightLevel > 0.6) {
      this.musicTimer = 18 + Math.random() * 16;
      this.heartbeat(0.5);
    }
  }

  private birdCall(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    const base = 1800 + Math.random() * 1400;
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * 1.6, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.16);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o.stop(t + 0.25);
  }

  private nightShuffle(): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900 + Math.random() * 1800;
    f.Q.value = 2.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    src.start(t);
    src.stop(t + 0.4);
  }

  private blip(freq: number, dur: number, type: OscillatorType, volume: number, slideTo?: number, pan = 0): void {
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(p);
    p.connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseHit(dur: number, freq: number, volume: number, q = 1.2): void {
    this.ensure();
    if (!this.ctx || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  uiClick(): void {
    this.blip(520, 0.06, 'square', 0.05, 720);
  }

  pickup(): void {
    this.blip(660, 0.09, 'triangle', 0.09, 990);
    setTimeout(() => this.blip(990, 0.1, 'triangle', 0.06, 1320), 55);
  }

  craft(): void {
    this.noiseHit(0.18, 1200, 0.09, 3);
    this.blip(300, 0.16, 'sawtooth', 0.04, 180);
  }

  chop(): void {
    this.noiseHit(0.14, 420, 0.14, 1.6);
    this.blip(150, 0.1, 'triangle', 0.06, 90);
  }

  footstep(surface: 'grass' | 'dirt' | 'stone' | 'water' = 'grass'): void {
    const table = { grass: 620, dirt: 380, stone: 900, water: 1400 };
    this.noiseHit(0.09, table[surface] * (0.85 + Math.random() * 0.3), 0.055, 0.9);
  }

  hit(): void {
    this.blip(120, 0.22, 'sawtooth', 0.14, 48);
    this.noiseHit(0.16, 260, 0.12, 0.7);
  }

  hurt(): void {
    this.blip(220, 0.2, 'square', 0.1, 90);
    this.noiseHit(0.22, 180, 0.1, 0.8);
  }

  build(): void {
    this.noiseHit(0.12, 700, 0.1, 2.2);
    this.blip(420, 0.1, 'triangle', 0.05, 300);
  }

  fireCrackle(): void {
    this.noiseHit(0.05 + Math.random() * 0.06, 1600 + Math.random() * 1500, 0.05, 4);
  }

  growl(pan = 0, volume = 1): void {
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    o.type = 'sawtooth';
    o2.type = 'sine';
    o.frequency.setValueAtTime(72, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 1.1);
    o2.frequency.setValueAtTime(36, t);
    o2.frequency.exponentialRampToValueAtTime(24, t + 1.1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11 * volume, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(g);
    o2.connect(g);
    g.connect(p);
    p.connect(this.sfxGain);
    o.start(t);
    o2.start(t);
    o.stop(t + 1.25);
    o2.stop(t + 1.25);
  }

  heartbeat(intensity = 1): void {
    this.ensure();
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    for (const [offset, vol] of [
      [0, 0.09],
      [0.22, 0.06],
    ] as Array<[number, number]>) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(58, t0 + offset);
      o.frequency.exponentialRampToValueAtTime(34, t0 + offset + 0.18);
      g.gain.setValueAtTime(0.0001, t0 + offset);
      g.gain.exponentialRampToValueAtTime(vol * intensity, t0 + offset + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.24);
      o.connect(g);
      g.connect(this.musicGain);
      o.start(t0 + offset);
      o.stop(t0 + offset + 0.3);
    }
  }

  /** Короткая музыкальная тема меню: медленный минорный пад. */
  startMenuMusic(): void {
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [146.83, 174.61, 220.0, 293.66];
    notes.forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.03, t + 2.2 + i * 0.2);
      g.gain.linearRampToValueAtTime(0.0001, t + 9);
      o.connect(g);
      g.connect(this.musicGain);
      o.start(t);
      o.stop(t + 9.5);
    });
  }

  dispose(): void {
    this.stopAmbience();
    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.started = false;
  }
}
