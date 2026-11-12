import { Vector3 } from 'three';

const RPM_TO_RADS = (2 * Math.PI) / 60;
/** Loaded motors reach roughly this fraction of KV * V. */
const LOADED_KV_FACTOR = 0.82;

/** One motor + prop. Thrust and drag torque scale with omega^2. */
export class Motor {
  omega = 0; // rad/s
  omegaDot = 0;
  angle = 0; // prop angle for rendering
  thrust = 0;
  /** Smoothed noise used for prop-wash turbulence. */
  wash = 0;
  private washTarget = 0;
  private washTimer = 0;

  constructor(
    readonly pos: Vector3, // body frame
    readonly cw: boolean, // spin direction viewed from above
    readonly kv: number,
    readonly tau: number,
    readonly kT: number, // N / (rad/s)^2
    readonly kQ: number, // N*m / (rad/s)^2
    readonly inertia: number, // prop + bell, kg*m^2
    readonly maxTorque: number, // what the motor can deliver to accelerate the prop, N*m
  ) {}

  /** Sign of the yaw reaction torque this motor puts on the frame (+y for CW props). */
  get yawSign(): number {
    return this.cw ? 1 : -1;
  }

  static omegaMax(kv: number, voltage: number): number {
    return kv * voltage * LOADED_KV_FACTOR * RPM_TO_RADS;
  }

  update(dt: number, command: number, voltage: number): void {
    const target = Math.max(0, Math.min(1, command)) * Motor.omegaMax(this.kv, voltage);
    // ESCs with active braking still spool down a bit slower than up.
    const tau = target > this.omega ? this.tau : this.tau * 1.25;
    const prev = this.omega;
    let dw = (target - this.omega) * Math.min(1, dt / tau);
    // The motor can only push so hard: torque limit caps prop acceleration.
    const drag = this.kQ * this.omega * this.omega;
    const maxUp = ((this.maxTorque - drag) / this.inertia) * dt;
    const maxDown = ((this.maxTorque + drag) / this.inertia) * dt;
    dw = Math.max(-maxDown, Math.min(Math.max(0, maxUp), dw));
    this.omega = Math.max(0, this.omega + dw);
    this.omegaDot = (this.omega - prev) / dt;
    this.angle = (this.angle + this.omega * dt * (this.cw ? -1 : 1)) % (Math.PI * 2);

    this.washTimer -= dt;
    if (this.washTimer <= 0) {
      this.washTimer = 0.015 + Math.random() * 0.02;
      this.washTarget = Math.random() * 2 - 1;
    }
    this.wash += (this.washTarget - this.wash) * Math.min(1, dt / 0.012);
  }

  get rpm(): number {
    return this.omega / RPM_TO_RADS;
  }

  reset(): void {
    this.omega = 0;
    this.omegaDot = 0;
    this.thrust = 0;
  }
}
