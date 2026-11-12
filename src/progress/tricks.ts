import { Vector3 } from 'three';
import type { QuadPhysics } from '../physics/quad';

const TAU = Math.PI * 2;

/** Points per trick; overwritten from Supabase game_config.trick_points when it loads. */
export const TRICK_POINTS = {
  flip: 100,
  roll: 100,
  multi_bonus: 50,
  power_loop: 300,
  split_s: 250,
  spin: 80,
  gap: 150,
  dive_base: 100,
  dive_per_m: 6,
  proximity_per_s: 70,
  inverted_per_s: 80,
  combo_step: 0.25,
  combo_max: 3,
  multiplayer_bonus: 1.25,
  /** Scales every trick's XP (a quick global difficulty knob). */
  xp_scale: 1,
};
const P = TRICK_POINTS;
const _up = new Vector3();

export interface TrickEvent {
  name: string;
  points: number;
  /** Combo multiplier applied (1 = no combo). */
  combo: number;
}

/** One axis of rotation being tracked: how far it turned since it started spinning. */
class Spin {
  acc = 0;
  quiet = 0;
  active = false;
  start = 0;
  altMin = 0;
  altMax = 0;
  speedSum = 0;
  frames = 0;

  /** Returns the finished rotation (radians, signed) when the spin stops, else null. */
  update(rate: number, dt: number, now: number, alt: number, speed: number): { turned: number; time: number; altSpan: number; altDrop: number; speed: number } | null {
    if (Math.abs(rate) > 1.5) {
      if (!this.active) {
        this.active = true;
        this.acc = 0;
        this.start = now;
        this.altMin = this.altMax = alt;
        this.speedSum = 0;
        this.frames = 0;
        this.altStart = alt;
      }
      this.quiet = 0;
    } else if (this.active) {
      this.quiet += dt;
    }
    if (!this.active) return null;
    this.acc += rate * dt;
    this.altMin = Math.min(this.altMin, alt);
    this.altMax = Math.max(this.altMax, alt);
    this.speedSum += speed;
    this.frames++;
    // A reversal ends the spin too (wobbles don't add up into a flip).
    if (this.quiet > 0.25 || (Math.sign(rate) !== Math.sign(this.acc) && Math.abs(rate) > 3)) {
      this.active = false;
      return { turned: this.acc, time: now - this.start, altSpan: this.altMax - this.altMin, altDrop: this.altStart - alt, speed: this.speedSum / Math.max(1, this.frames) };
    }
    return null;
  }

  altStart = 0;

  reset(): void {
    this.active = false;
    this.acc = 0;
    this.quiet = 0;
  }
}

/**
 * Recognises freestyle tricks from the drone's motion and scores them. Points wait 1.5 s before
 * they count, so a trick that ends in a crash is lost ("BAILED"). Tricks chained within 3 s build
 * a combo multiplier.
 */
export class TrickDetector {
  private pitch = new Spin();
  private roll = new Spin();
  private yaw = new Spin();
  private t = 0;
  private lastTrick = -10;
  private combo = 0;
  private pending: { at: number; points: number }[] = [];
  private halfRollAt = -10;
  private dive = { active: false, alt0: 0 };
  private prox = 0;
  private inverted = 0;
  private gap = 0;
  private gapCooldown = 0;
  /** Points multiplier (multiplayer pays a bit more). */
  bonus = 1;
  onTrick: (e: TrickEvent) => void = () => {};
  /** Points that survived (no crash right after): turn these into XP. */
  onBank: (points: number) => void = () => {};
  onBail: (lost: number) => void = () => {};

  reset(): void {
    this.pitch.reset();
    this.roll.reset();
    this.yaw.reset();
    this.pending = [];
    this.combo = 0;
    this.dive.active = false;
    this.prox = this.inverted = this.gap = 0;
  }

  /** The quad crashed or drowned: everything not banked yet is lost. */
  crash(): void {
    const lost = this.pending.reduce((s, p) => s + p.points, 0);
    this.pending = [];
    this.combo = 0;
    if (lost > 0) this.onBail(lost);
    this.reset();
  }

  private award(name: string, base: number): void {
    this.combo = this.t - this.lastTrick < 3 ? this.combo + 1 : 0;
    this.lastTrick = this.t;
    const mult = Math.min(P.combo_max, 1 + this.combo * P.combo_step);
    const points = Math.round(base * mult * this.bonus * P.xp_scale);
    this.pending.push({ at: this.t, points });
    this.onTrick({ name, points, combo: mult });
  }

  /**
   * Call every frame while flying. ground: distance to the ground below (m); ceiling: something
   * solid just above (flying under a bridge, through a gap); size: drone scale (arm length, m).
   */
  update(dt: number, q: QuadPhysics, armed: boolean, crashed: boolean, ground: number, ceiling: boolean, size: number): void {
    this.t += dt;
    // Bank points that survived 1.5 s.
    let banked = 0;
    while (this.pending.length && this.t - this.pending[0].at > 1.5) banked += this.pending.shift()!.points;
    if (banked) this.onBank(banked);

    const airMin = Math.max(0.35, size * 6);
    const airborne = armed && !crashed && ground > airMin;
    if (!airborne) {
      this.pitch.reset();
      this.roll.reset();
      this.yaw.reset();
      this.prox = this.inverted = 0;
      this.dive.active = false;
      return;
    }
    const alt = q.pos.y;
    const speed = q.vel.length();
    const w = q.omega;
    const now = this.t;

    const p = this.pitch.update(w.x, dt, now, alt, speed);
    const r = this.roll.update(w.z, dt, now, alt, speed);
    const y = this.yaw.update(w.y, dt, now, alt, speed);

    if (r) {
      const n = Math.floor(Math.abs(r.turned) / TAU + 0.12);
      if (n >= 1) this.award(n === 1 ? 'ROLL' : n === 2 ? 'DOUBLE ROLL' : `${n}x ROLL`, P.roll * n + (n > 1 ? P.multi_bonus * n : 0));
      else if (Math.abs(r.turned) > Math.PI * 0.8) this.halfRollAt = now;
    }
    if (p) {
      const turned = Math.abs(p.turned);
      const n = Math.floor(turned / TAU + 0.12);
      if (n >= 1) {
        if (p.time > 1.0 && p.altSpan > Math.max(2.5, size * 25) && p.speed > 5) {
          this.award(n === 1 ? 'POWER LOOP' : `${n}x POWER LOOP`, P.power_loop * n);
        } else {
          // Nose down first (negative about body x) is a front flip.
          const dir = p.turned < 0 ? 'FRONT FLIP' : 'BACK FLIP';
          this.award(n === 1 ? dir : n === 2 ? `DOUBLE ${dir}` : `${n}x ${dir}`, P.flip * n + (n > 1 ? P.multi_bonus * n : 0));
        }
      } else if (turned > Math.PI * 0.8 && now - this.halfRollAt < 1.5 && p.altDrop > Math.max(2, size * 20)) {
        this.award('SPLIT-S', P.split_s);
        this.halfRollAt = -10;
      }
    }
    if (y && !p && !r) {
      const n = Math.floor(Math.abs(y.turned) / TAU + 0.12);
      if (n >= 1) this.award(n === 1 ? '360 SPIN' : `${n * 360} SPIN`, P.spin * n);
    }

    // Dive: a long fall at speed, scored when you pull out.
    if (q.vel.y < -7) {
      if (!this.dive.active) this.dive = { active: true, alt0: alt };
    } else if (this.dive.active && q.vel.y > -2) {
      const drop = this.dive.alt0 - alt;
      this.dive.active = false;
      if (drop > 12) this.award(`DIVE ${Math.round(drop)} M`, Math.round(P.dive_base + drop * P.dive_per_m));
    }

    // Proximity: fast and close to the ground.
    const close = ground < Math.max(1.0, size * 14) && speed > 8;
    if (close) this.prox += dt;
    else if (this.prox > 0) {
      if (this.prox > 0.8) this.award(`PROXIMITY ${this.prox.toFixed(1)}s`, Math.round(P.proximity_per_s * this.prox));
      this.prox = 0;
    }

    // Inverted hang time.
    _up.set(0, 1, 0).applyQuaternion(q.quat);
    if (_up.y < -0.6) this.inverted += dt;
    else if (this.inverted > 0) {
      if (this.inverted > 1) this.award(`INVERTED ${this.inverted.toFixed(1)}s`, Math.round(P.inverted_per_s * this.inverted));
      this.inverted = 0;
    }

    // Gap: something solid just above while moving fast (bridges, doorways, arches).
    this.gapCooldown -= dt;
    if (ceiling && speed > 6) this.gap += dt;
    else if (this.gap > 0) {
      if (this.gap > 0.08 && this.gapCooldown <= 0) {
        this.award('GAP', P.gap);
        this.gapCooldown = 1.5;
      }
      this.gap = 0;
    }
  }
}
