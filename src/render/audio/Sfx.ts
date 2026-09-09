/**
 * Synthesised sound effects. No audio assets ship with the game, so every cue
 * is a short WebAudio envelope built at call time.
 *
 * The context is created lazily on the first user gesture — browsers refuse to
 * start one otherwise — and every method is a no-op while muted or before that
 * gesture arrives.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted: boolean;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  /** Call from a pointer/key handler; safe to call repeatedly. */
  unlock(): void {
    if (this.ctx !== null) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor === undefined) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master !== null && this.ctx !== null) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  private tone(
    type: OscillatorType,
    freq: number,
    endFreq: number,
    durS: number,
    gain: number,
  ): void {
    const ctx = this.ctx;
    if (ctx === null || this.master === null || this.muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + durS);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + durS);
    osc.connect(env);
    env.connect(this.master);
    osc.start(t);
    osc.stop(t + durS + 0.02);
  }

  /** Filtered noise burst, for anything that should sound like material. */
  private noise(durS: number, gain: number, cutoff: number): void {
    const ctx = this.ctx;
    if (ctx === null || this.master === null || this.muted) return;
    const t = ctx.currentTime;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * durS));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const env = ctx.createGain();
    env.gain.value = gain;
    src.connect(filter);
    filter.connect(env);
    env.connect(this.master);
    src.start(t);
  }

  putt(power: number): void {
    this.tone('triangle', 220 + power * 260, 120, 0.1, 0.28);
    this.noise(0.06, 0.16, 2400);
  }

  wall(strength: number): void {
    this.tone('square', 150 + strength * 120, 90, 0.06, 0.06 + strength * 0.1);
    this.noise(0.05, 0.05 + strength * 0.1, 1400);
  }

  bumper(strength: number): void {
    this.tone('sine', 520, 880, 0.14, 0.1 + strength * 0.14);
  }

  boost(): void {
    this.tone('sawtooth', 300, 1200, 0.2, 0.12);
  }

  portal(): void {
    this.tone('sine', 900, 240, 0.26, 0.13);
  }

  water(): void {
    this.noise(0.35, 0.22, 900);
    this.tone('sine', 340, 90, 0.3, 0.1);
  }

  sand(): void {
    this.noise(0.22, 0.12, 1600);
  }

  lipOut(): void {
    this.tone('triangle', 380, 300, 0.16, 0.12);
  }

  sunk(): void {
    // A rising major triad: the only "reward" cue in the game.
    this.tone('sine', 523, 523, 0.16, 0.16);
    window.setTimeout(() => this.tone('sine', 659, 659, 0.16, 0.15), 90);
    window.setTimeout(() => this.tone('sine', 784, 784, 0.34, 0.16), 180);
    this.noise(0.12, 0.08, 700);
  }

  star(index: number): void {
    this.tone('sine', 700 + index * 220, 900 + index * 220, 0.2, 0.12);
  }

  tap(): void {
    this.tone('triangle', 480, 620, 0.05, 0.09);
  }

  back(): void {
    this.tone('triangle', 420, 260, 0.08, 0.09);
  }
}
