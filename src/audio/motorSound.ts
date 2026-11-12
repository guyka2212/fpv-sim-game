import type { QuadPhysics } from '../physics/quad';

/**
 * Motor whine synthesised from the simulated RPM: one oscillator per motor at the
 * blade-pass frequency, plus filtered noise for prop wash and wind.
 */
export class MotorSound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  /** Drone sound level in replays (between the synth and the output). */
  private droneGain!: GainNode;
  /** Everything audible passes through here (also what video export records). */
  private out!: BiquadFilterNode;
  private music: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private oscs: { osc: OscillatorNode; gain: GainNode }[] = [];
  private noiseGain!: GainNode;
  private noiseFilter!: BiquadFilterNode;
  private crashGain!: GainNode;
  private engineVoices: { osc: OscillatorNode; sub: OscillatorNode; gain: GainNode }[] = [];
  private enginesOn = false;
  private lastMotor = 0;
  private lastEngines = 0;
  volume = 0.5;

  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5000;
    this.droneGain = ctx.createGain();
    this.master.connect(this.droneGain).connect(lp).connect(ctx.destination);
    this.out = lp;

    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(this.master);
      osc.start();
      this.oscs.push({ osc, gain });
    }

    // Looping white noise for wash and wind.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = 'bandpass';
    this.noiseFilter.Q.value = 0.7;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    noise.connect(this.noiseFilter).connect(this.noiseGain).connect(this.master);

    const crashFilter = ctx.createBiquadFilter();
    crashFilter.type = 'lowpass';
    crashFilter.frequency.value = 900;
    this.crashGain = ctx.createGain();
    this.crashGain.gain.value = 0;
    noise.connect(crashFilter).connect(this.crashGain).connect(this.master);
    noise.start();

    // Race car engines: a sawtooth with a square an octave down, through a growl filter.
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 2200;
    engineFilter.Q.value = 2;
    engineFilter.connect(this.master);
    for (let i = 0; i < 3; i++) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const sub = ctx.createOscillator();
      sub.type = 'square';
      const subGain = ctx.createGain();
      subGain.gain.value = 0.5;
      osc.connect(gain);
      sub.connect(subGain).connect(gain);
      gain.connect(engineFilter);
      osc.start();
      sub.start();
      this.engineVoices.push({ osc, sub, gain });
    }
  }

  /** Nearby race car engines (frequency in Hz with Doppler already applied, and loudness 0..1). */
  engines(voices: { hz: number; gain: number }[]): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Every setTargetAtTime queues an automation event; at hundreds of frames per second they
    // pile up faster than the audio thread drops them. 60 updates a second is plenty for sound.
    if (!voices.length && !this.enginesOn) return;
    if (t - this.lastEngines < 1 / 60) return;
    this.lastEngines = t;
    this.enginesOn = voices.length > 0;
    this.engineVoices.forEach((v, i) => {
      const e = voices[i];
      if (e) {
        v.osc.frequency.setTargetAtTime(e.hz, t, 0.03);
        v.sub.frequency.setTargetAtTime(e.hz / 2, t, 0.03);
      }
      v.gain.gain.setTargetAtTime(e ? e.gain * 0.25 : 0, t, 0.05);
    });
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.value = v;
  }

  update(quad: QuadPhysics, speed: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this.lastMotor < 1 / 60) return;
    this.lastMotor = t;
    const blades = quad.spec.prop.blades;
    // Smaller motors are louder relative to their size and higher pitched.
    const level = quad.spec.mass < 0.1 ? 0.05 : 0.07;
    quad.motors.forEach((m, i) => {
      const f = Math.max(20, (m.rpm / 60) * blades * 0.5);
      const load = Math.min(1, m.omega / 3500 + m.thrust / (quad.spec.mass * 9.81));
      this.oscs[i].osc.frequency.setTargetAtTime(f, t, 0.01);
      this.oscs[i].gain.gain.setTargetAtTime(m.omega > 5 ? level * (0.25 + 0.75 * load) : 0, t, 0.02);
    });
    const avgRpm = quad.motors.reduce((s, m) => s + m.rpm, 0) / 4;
    this.noiseFilter.frequency.setTargetAtTime(400 + avgRpm * 0.05 + speed * 30, t, 0.05);
    this.noiseGain.gain.setTargetAtTime(Math.min(0.25, avgRpm / 120000 + speed * 0.004), t, 0.05);
  }

  crash(strength: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.crashGain.gain.cancelScheduledValues(t);
    this.crashGain.gain.setValueAtTime(Math.min(1, strength), t);
    this.crashGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Replays: drone sound level, 0 = off. */
  setDroneLevel(v: number): void {
    if (this.ctx) this.droneGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  /** Plays music from `offset` seconds (replays and video export). */
  playMusic(buffer: AudioBuffer, offset: number, volume: number): void {
    this.stopMusic();
    if (!this.ctx || offset >= buffer.duration) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.out);
    src.start(0, offset);
    this.music = { src, gain };
  }

  setMusicVolume(v: number): void {
    if (this.music) this.music.gain.gain.value = v;
  }

  stopMusic(): void {
    if (!this.music) return;
    try {
      this.music.src.stop();
    } catch {
      // already ended
    }
    this.music.src.disconnect();
    this.music = null;
  }

  /** A stream of everything audible, for recording a video; call release() when done. */
  capture(): { stream: MediaStream; release: () => void } | null {
    if (!this.ctx) return null;
    const dest = this.ctx.createMediaStreamDestination();
    this.out.connect(dest);
    return { stream: dest.stream, release: () => this.out.disconnect(dest) };
  }

  silence(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const o of this.oscs) o.gain.gain.setTargetAtTime(0, t, 0.05);
    this.noiseGain.gain.setTargetAtTime(0, t, 0.05);
    for (const v of this.engineVoices) v.gain.gain.setTargetAtTime(0, t, 0.05);
  }
}
