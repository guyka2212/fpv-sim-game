import { Quaternion, Vector3 } from 'three';
import { DroneSpec, motorLayout } from '../drones/specs';
import { Battery } from './battery';
import { Motor } from './motor';
import { AIR_DENSITY, bodyDrag, groundEffect, inflowFactor, propWashIntensity } from './aero';

export const GRAVITY = 9.81;

/** Multipliers plugins can change (1 = real physics). Shared by every drone. */
export const PHYSICS_MODS = {
  /** Lift from the props (not the steering). */
  thrust: 1,
  /** Air drag on the body and props. */
  drag: 1,
  gravity: 1,
  /** Prop pitch speed: how fast the props can still push; above 1 raises the top speed. */
  propSpeed: 1,
  /** Battery drain (0 = never runs down). */
  battery: 1,
};
const INCH = 0.0254;

const _vBody = new Vector3();
const _force = new Vector3();
const _torque = new Vector3();
const _tmp = new Vector3();
const _tmp2 = new Vector3();
const _Iw = new Vector3();
const _dq = new Quaternion();
const _qInv = new Quaternion();

/** Rigid-body quadcopter. Angular velocity is in body frame, everything else world frame. */
export class QuadPhysics {
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  readonly quat = new Quaternion();
  readonly omega = new Vector3(); // body rates rad/s (x pitch, y yaw, z roll)
  readonly accel = new Vector3();

  readonly motors: Motor[];
  readonly battery: Battery;
  readonly wind = new Vector3();

  /** Distance from the drone to the ground straight below (set by the collision system). */
  groundDistance = Infinity;

  readonly propRadius: number;
  readonly pitchM: number;
  readonly hoverInduced: number;
  readonly rotorDrag: number;
  private readonly maxCurrent: number;
  private readonly omegaRef: number;
  private readonly I: Vector3;

  constructor(readonly spec: DroneSpec) {
    this.battery = new Battery(spec.battery.cells, spec.battery.chemistry, spec.battery.capacityMah, spec.battery.rInternal);
    this.propRadius = (spec.prop.diameterIn * INCH) / 2;
    this.pitchM = spec.prop.pitchIn * INCH;
    this.maxCurrent = spec.battery.maxCurrent;
    this.I = new Vector3(...spec.inertia);

    // Calibrate thrust so the drone hits its rated thrust-to-weight at nominal voltage.
    this.omegaRef = Motor.omegaMax(spec.motor.kv, this.battery.nominal);
    const tMax = (spec.mass * GRAVITY * spec.twRatio) / 4;
    const kT = tMax / (this.omegaRef * this.omegaRef);
    // Drag torque to thrust ratio grows with prop diameter.
    const kQ = kT * 0.012 * (spec.prop.diameterIn / 5) * (1 + (spec.prop.blades - 2) * 0.12);
    // Prop + bell inertia, scaled from a 5" tri-blade on a 22xx bell (~4e-6 kg*m^2).
    const propInertia = 4e-6 * Math.pow(spec.prop.diameterIn / 5, 3.5);
    // Motor torque constant (N*m/A) times the per-motor burst current.
    const motorTorque = (9.55 / spec.motor.kv) * spec.motor.peakAmps;

    this.motors = motorLayout(spec).map(
      (m) => new Motor(new Vector3(m.x, 0, m.z), m.cw, spec.motor.kv, spec.motor.tau, kT, kQ, propInertia, motorTorque),
    );

    const discArea = Math.PI * this.propRadius * this.propRadius;
    this.hoverInduced = Math.sqrt((spec.mass * GRAVITY) / 4 / (2 * AIR_DENSITY * discArea));
    // H-force: blades moving edgewise through the air drag the quad back.
    this.rotorDrag = 1.6e-5 * Math.pow(spec.prop.diameterIn / 5, 2) * (spec.mass / 0.65) ** 0.5;
  }

  reset(pos: Vector3, yaw = 0): void {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.accel.set(0, 0, 0);
    this.omega.set(0, 0, 0);
    this.quat.setFromAxisAngle(_tmp.set(0, 1, 0), yaw);
    for (const m of this.motors) m.reset();
    this.battery.reset();
  }

  /** Thrust per motor at full command for the present battery voltage. */
  maxMotorThrust(): number {
    const w = Motor.omegaMax(this.spec.motor.kv, this.battery.voltage);
    return this.motors[0].kT * w * w;
  }

  /** dThrust/dCommand for one motor around the given command, used by the mixer. */
  thrustGain(command: number): number {
    return 2 * this.maxMotorThrust() * Math.max(command, 0.2);
  }

  /** Yaw torque per unit motor command: drag torque slope plus the spin-up reaction kick. */
  yawGain(command: number): number {
    const m = this.motors[0];
    const wMax = Motor.omegaMax(this.spec.motor.kv, this.battery.voltage);
    const dragSlope = 2 * m.kQ * wMax * wMax * Math.max(command, 0.2);
    const reaction = Math.min((m.inertia * wMax) / this.spec.motor.tau, m.maxTorque) * 0.2;
    return dragSlope + reaction;
  }

  get averageCommand(): number {
    const wMax = Motor.omegaMax(this.spec.motor.kv, this.battery.voltage);
    let s = 0;
    for (const m of this.motors) s += m.omega;
    return s / 4 / wMax;
  }

  step(dt: number, commands: number[]): void {
    const spec = this.spec;
    const voltage = this.battery.voltage;

    _qInv.copy(this.quat).invert();
    // Airspeed in body frame.
    _vBody.copy(this.vel).sub(this.wind).applyQuaternion(_qInv);

    const ge = groundEffect(this.groundDistance, this.propRadius);
    const washK = spec.ducted ? 0.35 : 1;
    const wash = propWashIntensity(_vBody.y, this.hoverInduced) * washK;

    _force.set(0, 0, 0);
    _torque.set(0, 0, 0);

    let omegaSum = 0;
    let powerFrac = 0;
    let yawGyro = 0; // angular momentum of all props about body y

    for (let i = 0; i < 4; i++) {
      const m = this.motors[i];
      m.update(dt, commands[i], voltage);
      const w2 = m.omega * m.omega;
      const pitchSpeed = (m.omega * this.pitchM) / (2 * Math.PI);
      // Local inflow at this motor includes the rotation of the frame.
      const vLocal = _vBody.y + (this.omega.z * m.pos.x - this.omega.x * m.pos.z);
      let t = m.kT * w2 * inflowFactor(vLocal, pitchSpeed * PHYSICS_MODS.propSpeed) * ge;
      t *= 1 - 0.18 * wash + 0.32 * wash * m.wash;
      m.thrust = t;

      _force.y += t * PHYSICS_MODS.thrust;
      // r x (0, T, 0) = (-rz*T, 0, rx*T)
      _torque.x += -m.pos.z * t;
      _torque.z += m.pos.x * t;
      // Yaw: aerodynamic drag torque plus reaction to spinning the prop up or down.
      _torque.y += m.yawSign * (m.kQ * w2 + m.inertia * m.omegaDot);

      omegaSum += m.omega;
      yawGyro += -m.yawSign * m.inertia * m.omega;
      const r = m.omega / this.omegaRef;
      powerFrac += r * r * r;
    }

    // Gyroscopic precession from the spinning props: tau = -omega x H, H = (0, yawGyro, 0).
    _tmp.set(0, yawGyro, 0);
    _torque.sub(_tmp2.copy(this.omega).cross(_tmp));

    // Drag: body shape plus rotor H-force in the rotor plane.
    _force.addScaledVector(bodyDrag(_vBody, spec.cdA, _tmp), PHYSICS_MODS.drag);
    _force.x -= this.rotorDrag * omegaSum * _vBody.x * PHYSICS_MODS.drag;
    _force.z -= this.rotorDrag * omegaSum * _vBody.z * PHYSICS_MODS.drag;

    // Aerodynamic rotational damping.
    const w = this.omega;
    _torque.x -= 2e-4 * spec.mass * w.x;
    _torque.y -= 3e-4 * spec.mass * w.y;
    _torque.z -= 2e-4 * spec.mass * w.z;

    // Battery draw: idle electronics + motors (power ~ omega^3).
    this.battery.update(dt * PHYSICS_MODS.battery, 0.4 * (spec.battery.cells / 6) + (this.maxCurrent * powerFrac) / 4);

    // Linear: rotate body force to world, add gravity.
    _force.applyQuaternion(this.quat);
    this.accel.copy(_force).divideScalar(spec.mass);
    this.accel.y -= GRAVITY * PHYSICS_MODS.gravity;
    this.vel.addScaledVector(this.accel, dt);
    this.pos.addScaledVector(this.vel, dt);

    // Angular: Euler's equations, I*wdot = tau - w x (I w).
    _Iw.set(w.x * this.I.x, w.y * this.I.y, w.z * this.I.z);
    _torque.sub(_tmp.copy(w).cross(_Iw));
    w.x += (_torque.x / this.I.x) * dt;
    w.y += (_torque.y / this.I.y) * dt;
    w.z += (_torque.z / this.I.z) * dt;

    this.integrateRotation(dt);
  }

  /** Coast without motors (used while crashed); still applies gravity and drag. */
  stepPassive(dt: number): void {
    this.step(dt, [0, 0, 0, 0]);
  }

  private integrateRotation(dt: number): void {
    const w = this.omega;
    const angle = w.length() * dt;
    if (angle < 1e-12) return;
    _tmp.copy(w).normalize();
    _dq.setFromAxisAngle(_tmp, angle);
    this.quat.multiply(_dq).normalize();
  }

  /** Body up axis in world. */
  up(out: Vector3): Vector3 {
    return out.set(0, 1, 0).applyQuaternion(this.quat);
  }

  forward(out: Vector3): Vector3 {
    return out.set(0, 0, -1).applyQuaternion(this.quat);
  }
}
