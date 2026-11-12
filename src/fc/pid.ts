/**
 * Rate PID for one axis. Output is an angular acceleration demand (rad/s^2), which the mixer
 * turns into motor commands through the frame's inertia, so the same gains suit every drone.
 */
export class AxisPid {
  private integral = 0;
  private prevGyro = 0;
  private prevSetpoint = 0;
  private dFiltered = 0;
  private ffFiltered = 0;

  constructor(
    public kp: number,
    public ki: number,
    public kd: number,
    public kff: number,
    public iLimit = 250,
  ) {}

  update(dt: number, setpoint: number, gyro: number, integrate: boolean): number {
    const err = setpoint - gyro;
    // Feed-forward on setpoint change, smoothed (~30 Hz) to hide stick steps.
    const ffRaw = (setpoint - this.prevSetpoint) / dt;
    this.prevSetpoint = setpoint;
    const aF = Math.min(1, dt * 2 * Math.PI * 30);
    this.ffFiltered += (ffRaw - this.ffFiltered) * aF;

    if (integrate) {
      // I-term relax: stop winding up while the sticks are moving (prevents bounce-back).
      const relax = Math.max(0, 1 - Math.abs(this.ffFiltered) / 15);
      this.integral = Math.max(-this.iLimit, Math.min(this.iLimit, this.integral + this.ki * err * relax * dt));
    } else {
      this.integral *= 0.9;
    }

    // D on measurement, low-passed (~80 Hz) like a real gyro D filter.
    const dRaw = (gyro - this.prevGyro) / dt;
    this.prevGyro = gyro;
    const aD = Math.min(1, dt * 2 * Math.PI * 80);
    this.dFiltered += (dRaw - this.dFiltered) * aD;

    return this.kp * err + this.integral - this.kd * this.dFiltered + this.kff * this.ffFiltered;
  }

  reset(gyro = 0): void {
    this.integral = 0;
    this.prevGyro = gyro;
    this.prevSetpoint = 0;
    this.dFiltered = 0;
    this.ffFiltered = 0;
  }
}
