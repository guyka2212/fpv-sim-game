// Controller families and their default stick mappings.
// An axis binding reads gamepad.axes[index]; a centered axis maps [min..center..max] to -1..1,
// the throttle maps [min..max] to 0..1. `invert` flips the result.

export type ControllerKind = 'xbox' | 'playstation' | 'ps3' | 'radio' | 'dji' | 'quest' | 'generic';

export interface AxisBinding {
  axis: number;
  invert: boolean;
  min: number;
  center: number;
  max: number;
}

export interface SwitchBinding {
  kind: 'axis' | 'button';
  index: number;
  /** Axis value above this (or button pressed) = on. For axes with 3 positions, see `levels`. */
  threshold: number;
  invert: boolean;
}

/** How a self-centering throttle stick (gamepads) is read. */
export type ThrottleStyle = 'full' | 'center-hover' | 'trigger';

export interface ControllerProfile {
  kind: ControllerKind;
  label: string;
  throttle: AxisBinding;
  yaw: AxisBinding;
  pitch: AxisBinding;
  roll: AxisBinding;
  arm?: SwitchBinding;
  mode?: SwitchBinding;
  throttleStyle: ThrottleStyle;
  deadband: number;
  /** True when this profile came from the calibration wizard. */
  calibrated: boolean;
}

const ax = (axis: number, invert = false): AxisBinding => ({ axis, invert, min: -1, center: 0, max: 1 });

export function detectKind(id: string): ControllerKind {
  const s = id.toLowerCase();
  if (/meta quest touch/.test(s)) return 'quest';
  if (/xinput|xbox|045e|microsoft/.test(s)) return 'xbox';
  // Sony DS3 (0268) shows up with odd axes unless a driver remaps it.
  if (/054c.*0268|playstation\(r\)3|ps3|dshidmini/.test(s)) return 'ps3';
  if (/054c|dualsense|dualshock|wireless controller|sony/.test(s)) return 'playstation';
  if (/dji|2ca3/.test(s)) return 'dji';
  if (/radiomaster|edgetx|opentx|frsky|taranis|jumper|tbs|tango|mambo|betafpv|1209.*4f54|0483.*5710|joystick.*radio|elrs/.test(s))
    return 'radio';
  return 'generic';
}

export const KIND_LABEL: Record<ControllerKind, string> = {
  xbox: 'Xbox controller',
  playstation: 'PlayStation controller (PS4/PS5)',
  ps3: 'PlayStation 3 controller',
  radio: 'FPV radio (USB joystick)',
  dji: 'DJI remote controller',
  quest: 'Meta Quest Touch controllers',
  generic: 'Generic USB controller',
};

/**
 * Default profile for a pad. "standard" mapping pads (Xbox 360/One, PS4, PS5, and PS3/PS2
 * through most drivers/adapters) use Mode 2: left stick throttle/yaw, right stick pitch/roll.
 * Radios in EdgeTX/OpenTX USB joystick mode send channels AETR as axes 0-3, AUX on 4+.
 */
export function defaultProfile(id: string, mapping: string): ControllerProfile {
  const kind = detectKind(id);
  // DJI remotes read over USB serial arrive already in standard (Mode 2) layout.
  if (kind === 'radio' || mapping !== 'standard') {
    return {
      kind,
      label: KIND_LABEL[kind],
      roll: ax(0),
      pitch: ax(1),
      throttle: ax(2),
      yaw: ax(3),
      arm: { kind: 'axis', index: 4, threshold: 0.3, invert: false },
      mode: { kind: 'axis', index: 5, threshold: 0.3, invert: false },
      throttleStyle: 'full',
      deadband: 0.01,
      calibrated: false,
    };
  }
  return {
    kind,
    label: KIND_LABEL[kind],
    throttle: ax(1, true),
    yaw: ax(0),
    pitch: ax(3, true),
    roll: ax(2),
    // Spring-centred stick: untouched (center) = 50% throttle, down = 0%, up = 100%.
    throttleStyle: 'full',
    deadband: 0.06,
    calibrated: false,
  };
}

/** Whether a profile is probably right without running the wizard. */
export function needsCalibration(p: ControllerProfile, mapping: string): boolean {
  if (p.calibrated) return false;
  return p.kind === 'radio' || p.kind === 'ps3' || mapping !== 'standard';
}

// Buttons on "standard" mapping pads.
export const PAD_BUTTONS = {
  arm: 0, // A / Cross
  reset: 1, // B / Circle
  camera: 2, // X / Square
  mode: 3, // Y / Triangle
  menu: 9, // Start / Options
} as const;
