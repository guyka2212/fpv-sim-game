import type { AxisBinding, ControllerProfile, SwitchBinding } from './profiles';
import { detectKind, KIND_LABEL } from './profiles';

type StepKey = 'rest' | 'throttle' | 'yaw' | 'pitch' | 'roll' | 'range' | 'arm' | 'mode';

interface Step {
  key: StepKey;
  title: string;
  text: string;
  optional?: boolean;
}

export const WIZARD_STEPS: Step[] = [
  {
    key: 'rest',
    title: 'Rest position',
    text: 'Throttle stick fully DOWN (gamepads: just let go), other sticks centered, all switches OFF.',
  },
  { key: 'throttle', title: 'Throttle', text: 'Push the THROTTLE stick fully UP and hold it there.' },
  { key: 'yaw', title: 'Yaw', text: 'Push the YAW stick fully RIGHT and hold it.' },
  { key: 'pitch', title: 'Pitch', text: 'Push the PITCH stick fully UP (forward) and hold it.' },
  { key: 'roll', title: 'Roll', text: 'Push the ROLL stick fully RIGHT and hold it.' },
  { key: 'range', title: 'Full range', text: 'Move BOTH sticks around in big full circles a few times, then let go.' },
  {
    key: 'arm',
    title: 'Arm switch',
    text: 'Flip the switch (or press the button) you want to ARM with. Skip to use the A / Cross button or Space.',
    optional: true,
  },
  {
    key: 'mode',
    title: 'Flight mode switch',
    text: 'Flip the switch/button for flight mode (Acro / Angle / Horizon). Skip if you have none.',
    optional: true,
  },
];

export type Detection = { kind: 'axis'; index: number; sign: number; value: number } | { kind: 'button'; index: number } | null;

/** Step-by-step stick/switch mapper that works with any HID controller. */
export class CalibrationWizard {
  stepIndex = 0;
  detected: Detection = null;
  axes: number[] = [];
  buttons: number[] = [];

  private rest: number[] = [];
  private restButtons: number[] = [];
  private min: number[] = [];
  private max: number[] = [];
  private used = new Set<number>();
  private result: Partial<Record<StepKey, Detection>> = {};

  constructor(readonly padId: string) {}

  get step(): Step {
    return WIZARD_STEPS[this.stepIndex];
  }

  get done(): boolean {
    return this.stepIndex >= WIZARD_STEPS.length;
  }

  sample(gp: Gamepad): void {
    this.axes = gp.axes.slice();
    this.buttons = gp.buttons.map((b) => b.value);
    this.axes.forEach((v, i) => {
      this.min[i] = Math.min(this.min[i] ?? v, v);
      this.max[i] = Math.max(this.max[i] ?? v, v);
    });
    if (this.done) return;

    const key = this.step.key;
    if (key === 'rest' || key === 'range') {
      this.detected = null;
      return;
    }
    // Biggest movement from rest on an axis we haven't used yet.
    let best = -1;
    let bestDelta = 0;
    this.axes.forEach((v, i) => {
      if (this.used.has(i)) return;
      const d = v - (this.rest[i] ?? 0);
      if (Math.abs(d) > Math.abs(bestDelta)) {
        bestDelta = d;
        best = i;
      }
    });
    const switchStep = key === 'arm' || key === 'mode';
    if (switchStep) {
      const b = this.buttons.findIndex((v, i) => v > 0.5 && (this.restButtons[i] ?? 0) < 0.5);
      if (b >= 0) {
        this.detected = { kind: 'button', index: b };
        return;
      }
    }
    // Detections latch, so the user can let go of the stick to click Next.
    if (best >= 0 && Math.abs(bestDelta) > (switchStep ? 0.5 : 0.35)) {
      this.detected = { kind: 'axis', index: best, sign: Math.sign(bestDelta), value: this.axes[best] };
    }
  }

  /** Whether Next is allowed right now. */
  get canAdvance(): boolean {
    if (this.done) return false;
    const key = this.step.key;
    return key === 'rest' || key === 'range' || this.detected !== null;
  }

  next(): void {
    if (!this.canAdvance) return;
    const key = this.step.key;
    if (key === 'rest') {
      this.rest = this.axes.slice();
      this.restButtons = this.buttons.slice();
      this.min = this.axes.slice();
      this.max = this.axes.slice();
    } else if (key !== 'range') {
      this.result[key] = this.detected;
      if (this.detected?.kind === 'axis') this.used.add(this.detected.index);
    }
    this.detected = null;
    this.stepIndex++;
  }

  skip(): void {
    if (this.step?.optional) {
      this.detected = null;
      this.stepIndex++;
    }
  }

  back(): void {
    if (this.stepIndex === 0) return;
    this.stepIndex--;
    const key = this.step.key;
    const prev = this.result[key];
    if (prev?.kind === 'axis') this.used.delete(prev.index);
    delete this.result[key];
  }

  private axisBinding(key: StepKey, centered: boolean): AxisBinding {
    const d = this.result[key];
    if (!d || d.kind !== 'axis') throw new Error(`no axis for ${key}`);
    const i = d.index;
    const rest = this.rest[i] ?? 0;
    let min = this.min[i] ?? -1;
    let max = this.max[i] ?? 1;
    if (max - min < 0.2) {
      min = -1;
      max = 1;
    }
    let center = centered ? rest : (min + max) / 2;
    if (centered && (center - min < 0.05 || max - center < 0.05)) center = (min + max) / 2;
    return { axis: i, invert: d.sign < 0, min, center, max };
  }

  private switchBinding(key: StepKey): SwitchBinding | undefined {
    const d = this.result[key];
    if (!d) return undefined;
    if (d.kind === 'button') return { kind: 'button', index: d.index, threshold: 0.5, invert: false };
    const rest = this.rest[d.index] ?? 0;
    return { kind: 'axis', index: d.index, threshold: (rest + d.value) / 2, invert: d.value < rest };
  }

  buildProfile(base: ControllerProfile): ControllerProfile {
    const kind = base.kind ?? detectKind(this.padId);
    return {
      ...base,
      kind,
      label: KIND_LABEL[kind],
      throttle: this.axisBinding('throttle', false),
      yaw: this.axisBinding('yaw', true),
      pitch: this.axisBinding('pitch', true),
      roll: this.axisBinding('roll', true),
      arm: this.switchBinding('arm'),
      mode: this.switchBinding('mode'),
      calibrated: true,
    };
  }
}
