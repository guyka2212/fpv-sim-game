import { Quaternion, Vector3 } from 'three';
import type { RateProfile } from '../drones/specs';
import type { QuadPhysics } from '../physics/quad';
import { AxisPid } from './pid';
import { actualRate } from './rates';

export type FlightMode = 'acro' | 'angle' | 'horizon';
export const FLIGHT_MODES: FlightMode[] = ['acro', 'angle', 'horizon'];

export interface Sticks {
  throttle: number; // 0..1
  yaw: number; // -1..1, + = right
  pitch: number; // -1..1, + = forward (nose down)
  roll: number; // -1..1, + = right
}

const DEG = Math.PI / 180;
const MOTOR_IDLE = 0.055;
const MAX_ANGLE = 55 * DEG;
const ANGLE_GAIN = 7; // rad/s per rad of attitude error

const _f = new Vector3();
const _qh = new Quaternion();
const _qd = new Quaternion();
const _qe = new Quaternion();
const _qa = new Quaternion();
const _axis = new Vector3();

/** Betaflight-style flight controller: rates -> rate PID -> mixer with airmode. */
export class FlightController {
  mode: FlightMode = 'acro';
  armed = false;
  rates: { rollPitch: RateProfile; yaw: RateProfile };

  readonly setpoint = new Vector3(); // body rad/s
  readonly motorOut = [0, 0, 0, 0];

  private pid: { x: AxisPid; y: AxisPid; z: AxisPid };
  private readonly mix: { x: number; y: number; z: number }[];

  constructor(private readonly quad: QuadPhysics) {
    this.rates = structuredClone(quad.spec.rates);
    // Slower motors need a softer loop, like a real tune on a 7" vs a 5". Keeping kp*tau
    // constant with D at 0.5 gives every quad roughly 0.8 damping on its motor lag.
    const k = 0.028 / quad.spec.motor.tau;
    this.pid = {
      x: new AxisPid(32 * k, 60 * k, 0.5, 1),
      y: new AxisPid(45 * k, 30 * k, 0.2, 0.8),
      z: new AxisPid(32 * k, 60 * k, 0.5, 1),
    };
    // Mixer columns in the same units as the physics so outputs are torques per unit command.
    let sx = 0;
    let sz = 0;
    for (const m of quad.motors) {
      sx += m.pos.z * m.pos.z;
      sz += m.pos.x * m.pos.x;
    }
    this.mix = quad.motors.map((m) => ({ x: -m.pos.z / sx, y: m.yawSign / 4, z: m.pos.x / sz }));
  }

  arm(): void {
    this.armed = true;
    this.reset();
  }

  disarm(): void {
    this.armed = false;
    this.motorOut.fill(0);
  }

  reset(): void {
    const w = this.quad.omega;
    this.pid.x.reset(w.x);
    this.pid.y.reset(w.y);
    this.pid.z.reset(w.z);
  }

  update(dt: number, s: Sticks): number[] {
    if (!this.armed) {
      this.motorOut.fill(0);
      return this.motorOut;
    }
    const quad = this.quad;
    this.computeSetpoint(s);

    const w = quad.omega;
    const integrate = s.throttle > 0.05;
    const ax = this.pid.x.update(dt, this.setpoint.x, w.x, integrate);
    const ay = this.pid.y.update(dt, this.setpoint.y, w.y, integrate);
    const az = this.pid.z.update(dt, this.setpoint.z, w.z, integrate);

    // Angular acceleration demand -> torque -> per-motor command delta.
    const [Ix, Iy, Iz] = quad.spec.inertia;
    const g = quad.thrustGain(Math.max(quad.averageCommand, s.throttle * 0.6));
    const gYaw = quad.yawGain(Math.max(quad.averageCommand, s.throttle * 0.6));
    const tx = (ax * Ix) / g;
    const ty = (ay * Iy) / gYaw;
    const tz = (az * Iz) / g;

    let lo = Infinity;
    let hi = -Infinity;
    const out = this.motorOut;
    for (let i = 0; i < 4; i++) {
      const m = this.mix[i];
      out[i] = tx * m.x + ty * m.y + tz * m.z;
      lo = Math.min(lo, out[i]);
      hi = Math.max(hi, out[i]);
    }

    // Airmode: keep full attitude authority by squeezing the mix and shifting throttle.
    const span = 1 - MOTOR_IDLE;
    const range = hi - lo;
    if (range > span) {
      const k = span / range;
      for (let i = 0; i < 4; i++) out[i] *= k;
      lo *= k;
      hi *= k;
    }
    let thr = MOTOR_IDLE + s.throttle * span;
    thr = Math.min(Math.max(thr, MOTOR_IDLE - lo), 1 - hi);
    for (let i = 0; i < 4; i++) out[i] = Math.min(1, Math.max(MOTOR_IDLE, thr + out[i]));
    return out;
  }

  private computeSetpoint(s: Sticks): void {
    const rp = this.rates.rollPitch;
    const yawRate = actualRate(s.yaw, this.rates.yaw) * DEG;
    const acroPitch = actualRate(s.pitch, rp) * DEG;
    const acroRoll = actualRate(s.roll, rp) * DEG;

    // Body axes: +x pitch (nose up), +y yaw (left), +z roll (left). Sticks are pilot-positive.
    let spx = -acroPitch;
    let spz = -acroRoll;
    const spy = -yawRate;

    if (this.mode !== 'acro') {
      const { x, z } = this.angleSetpoint(s);
      if (this.mode === 'angle') {
        spx = x;
        spz = z;
      } else {
        const h = Math.min(1, Math.max(Math.abs(s.pitch), Math.abs(s.roll)) * 1.4);
        spx = x + (spx - x) * h;
        spz = z + (spz - z) * h;
      }
    }
    this.setpoint.set(spx, spy, spz);
  }

  private angleSetpoint(s: Sticks): { x: number; z: number } {
    const q = this.quad.quat;
    _f.set(0, 0, -1).applyQuaternion(q);
    const heading = Math.atan2(-_f.x, -_f.z);
    _qh.setFromAxisAngle(_axis.set(0, 1, 0), heading);
    _qd.copy(_qh)
      .multiply(_qa.setFromAxisAngle(_axis.set(1, 0, 0), -s.pitch * MAX_ANGLE))
      .multiply(_qa.setFromAxisAngle(_axis.set(0, 0, 1), -s.roll * MAX_ANGLE));
    _qe.copy(q).invert().multiply(_qd);
    if (_qe.w < 0) _qe.set(-_qe.x, -_qe.y, -_qe.z, -_qe.w);
    const lim = 500 * DEG;
    const clamp = (v: number) => Math.max(-lim, Math.min(lim, v));
    return { x: clamp(2 * _qe.x * ANGLE_GAIN), z: clamp(2 * _qe.z * ANGLE_GAIN) };
  }
}
