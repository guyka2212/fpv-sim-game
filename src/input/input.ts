import type { Sticks } from '../fc/flightController';
import { DjiRemote, QUEST_PAD_INDEX } from './djiSerial';
import { AxisBinding, ControllerProfile, defaultProfile, needsCalibration, PAD_BUTTONS, SwitchBinding, ThrottleStyle } from './profiles';

const STORAGE_KEY = 'flysim.controllers.v1';

export interface InputEvents {
  armToggle: boolean;
  /** Betaflight stick commands: throttle low + yaw right (arm) / left (disarm), held 1 s. */
  stickArm: boolean;
  stickDisarm: boolean;
  reset: boolean;
  camera: boolean;
  modeCycle: boolean;
  menu: boolean;
  /** Open the map (teleport). */
  mapView: boolean;
  /** Start / stop recording the flight. */
  record: boolean;
  /** Open the multiplayer chat box. */
  chat: boolean;
}

function loadProfiles(): Record<string, ControllerProfile> {
  try {
    const profiles: Record<string, ControllerProfile> = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    // One-time move to the new default: a centred stick means 50% throttle, not height hold.
    if (!localStorage.getItem(STORAGE_KEY + '.throttle50')) {
      for (const p of Object.values(profiles)) if (p.throttleStyle === 'center-hover') p.throttleStyle = 'full';
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
      localStorage.setItem(STORAGE_KEY + '.throttle50', '1');
    }
    return profiles;
  } catch {
    return {};
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function readCentered(gp: Gamepad, b: AxisBinding, deadband: number): number {
  const v = gp.axes[b.axis] ?? b.center;
  let out = v >= b.center ? (v - b.center) / Math.max(1e-3, b.max - b.center) : (v - b.center) / Math.max(1e-3, b.center - b.min);
  out = clamp(out, -1, 1);
  if (b.invert) out = -out;
  if (Math.abs(out) < deadband) return 0;
  return Math.sign(out) * ((Math.abs(out) - deadband) / (1 - deadband));
}

function readThrottle(gp: Gamepad, b: AxisBinding): number {
  const v = gp.axes[b.axis] ?? b.min;
  let out = clamp((v - b.min) / Math.max(1e-3, b.max - b.min), 0, 1);
  if (b.invert) out = 1 - out;
  return out;
}

function readSwitch(gp: Gamepad, s: SwitchBinding): boolean {
  let on: boolean;
  if (s.kind === 'button') on = (gp.buttons[s.index]?.value ?? 0) > s.threshold;
  else on = (gp.axes[s.index] ?? 0) > s.threshold;
  return s.invert ? !on : on;
}

/** Turns every supported controller (and the keyboard) into Sticks plus button events. */
export class InputManager {
  sticks: Sticks = { throttle: 0, yaw: 0, pitch: 0, roll: 0 };
  events: InputEvents = { armToggle: false, stickArm: false, stickDisarm: false, reset: false, camera: false, modeCycle: false, menu: false, mapView: false, record: false, chat: false };
  /** True when the throttle is in its "off" position for this controller, so arming is safe. */
  throttleLow = true;
  /**
   * Spring-centred throttle (gamepads, DJI-style): the stick asks for a climb rate instead of
   * a motor level, -1 (full down) .. 1 (full up). Null when the throttle is a direct motor level.
   */
  climbStick: number | null = null;
  /** Level of a mapped arm switch, or null when arming is a toggle button/key. */
  armSwitch: boolean | null = null;
  /** 0/1/2 position of a mapped mode switch, or null. */
  modeSwitch: number | null = null;

  /** Index of the gamepad in use, or -1 for keyboard. */
  activePad = -1;
  /** Throttle at which the drone hovers, used by the "center = hover" gamepad style. */
  hoverThrottle = 0.3;

  private profiles = loadProfiles();
  private prevButtons: boolean[] = [];
  private prevAxes = new Map<number, number[]>();
  private prevSwitchArm: boolean | null = null;
  private keys = new Set<string>();
  private keyEdges = new Set<string>();
  private kbThrottle = 0;
  private lastPadActivity = 0;
  private lastKeyActivity = 0;
  private stickCmdTimer = 0;
  private stickCmdFired = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (!this.keys.has(e.code)) this.keyEdges.add(e.code);
      this.keys.add(e.code);
      this.lastKeyActivity = performance.now();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    // Capture phase: a text box that took focus mid-press (the chat after T) must not hide the
    // release, or the key stays "held" (T would never open the chat again, W would keep climbing).
    window.addEventListener('keyup', (e) => this.keys.delete(e.code), true);
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('gamepadconnected', (e) => {
      if (this.activePad < 0) this.activePad = (e as GamepadEvent).gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if (this.activePad === (e as GamepadEvent).gamepad.index) this.activePad = -1;
    });
  }

  /** DJI RC-N1/N2/N3 read over USB serial (they are not USB joysticks). */
  readonly dji = new DjiRemote();

  /** Supplies the Quest Touch controllers while a VR session is running. */
  xrControllers: (() => { left: Gamepad | null; right: Gamepad | null }) | null = null;

  pads(): Gamepad[] {
    const list = Array.from(navigator.getGamepads?.() ?? []).filter((g): g is Gamepad => !!g);
    const quest = this.questPad();
    if (quest) list.push(quest);
    const dji = this.dji.asGamepad();
    if (dji) list.push(dji);
    return list;
  }

  pad(): Gamepad | null {
    if (this.activePad < 0) return null;
    return this.pads().find((p) => p.index === this.activePad) ?? null;
  }

  /**
   * Both Touch controllers as one "standard" gamepad: left stick throttle/yaw, right stick
   * pitch/roll (Mode 2), A/B/X/Y on the usual standard-mapping buttons.
   */
  private questPad(): Gamepad | null {
    const xr = this.xrControllers?.();
    if (!xr || (!xr.left && !xr.right)) return null;
    const { left, right } = xr;
    const axis = (g: Gamepad | null, i: number) => g?.axes[i] ?? 0;
    const btn = (g: Gamepad | null, i: number): GamepadButton => g?.buttons[i] ?? { pressed: false, touched: false, value: 0 };
    const buttons: GamepadButton[] = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    buttons[PAD_BUTTONS.arm] = btn(right, 4); // A
    buttons[PAD_BUTTONS.reset] = btn(right, 5); // B
    buttons[PAD_BUTTONS.camera] = btn(left, 4); // X
    buttons[PAD_BUTTONS.mode] = btn(left, 5); // Y
    buttons[PAD_BUTTONS.menu] = btn(left, 3); // left stick click
    buttons[7] = btn(right, 0); // right trigger, for the "trigger throttle" style
    return {
      id: 'Meta Quest Touch controllers',
      index: QUEST_PAD_INDEX,
      mapping: 'standard',
      connected: true,
      timestamp: performance.now(),
      axes: [axis(left, 2), axis(left, 3), axis(right, 2), axis(right, 3)],
      buttons,
      hapticActuators: [],
      vibrationActuator: null,
    } as unknown as Gamepad;
  }

  profileFor(gp: Gamepad): ControllerProfile {
    return this.profiles[gp.id] ?? defaultProfile(gp.id, gp.mapping);
  }

  saveProfile(id: string, p: ControllerProfile): void {
    this.profiles[id] = p;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profiles));
    } catch {
      /* storage unavailable: keep it for this session */
    }
  }

  resetProfile(id: string): void {
    delete this.profiles[id];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profiles));
    } catch {
      /* ignore */
    }
  }

  /** The controller in use has a guessed mapping that should be calibrated. */
  get uncalibrated(): boolean {
    const gp = this.pad();
    return !!gp && this.lastPadActivity >= this.lastKeyActivity && needsCalibration(this.profileFor(gp), gp.mapping);
  }

  /** Drop the keyboard's held throttle (on respawn). */
  resetThrottle(): void {
    this.kbThrottle = 0;
    if (this.activePad < 0 || this.lastKeyActivity > this.lastPadActivity) this.sticks.throttle = 0;
  }

  setThrottleStyle(style: ThrottleStyle): void {
    const gp = this.pad();
    if (!gp) return;
    this.saveProfile(gp.id, { ...this.profileFor(gp), throttleStyle: style });
  }

  poll(dt: number): void {
    const e = this.events;
    e.armToggle = e.stickArm = e.stickDisarm = e.reset = e.camera = e.modeCycle = e.menu = e.mapView = e.record = e.chat = false;

    // Switch to whichever pad was touched most recently (sticks moved or a button pressed).
    for (const gp of this.pads()) {
      const prev = this.prevAxes.get(gp.index);
      const moved = !!prev && gp.axes.some((v, i) => Math.abs(v - (prev[i] ?? v)) > 0.12);
      if (prev && (moved || gp.buttons.some((b) => b.pressed))) {
        this.activePad = gp.index;
        this.lastPadActivity = performance.now();
      }
      if (!prev || moved) this.prevAxes.set(gp.index, gp.axes.slice());
    }

    const gp = this.pad();
    const useKeyboard = !gp || this.lastKeyActivity > this.lastPadActivity;
    this.armSwitch = null;
    this.modeSwitch = null;
    this.climbStick = null;

    if (gp) this.readPad(gp, !useKeyboard);
    if (useKeyboard) {
      this.readKeyboard(dt);
      this.throttleLow = this.sticks.throttle < 0.06;
    } else {
      this.kbThrottle = this.sticks.throttle;
    }
    // Command keys work whatever is flying the drone.
    this.readKeyCommands();
    this.readStickCommands(dt);

    this.keyEdges.clear();
  }

  private readStickCommands(dt: number): void {
    const yaw = this.sticks.yaw;
    if (this.throttleLow && Math.abs(yaw) > 0.85) {
      this.stickCmdTimer += dt;
      if (this.stickCmdTimer > 0.8 && !this.stickCmdFired) {
        this.stickCmdFired = true;
        if (yaw > 0) this.events.stickArm = true;
        else this.events.stickDisarm = true;
      }
    } else {
      this.stickCmdTimer = 0;
      this.stickCmdFired = false;
    }
  }

  private readPad(gp: Gamepad, drive: boolean): void {
    const p = this.profileFor(gp);
    const s = this.sticks;
    if (drive) {
      s.yaw = readCentered(gp, p.yaw, p.deadband);
      s.pitch = readCentered(gp, p.pitch, p.deadband);
      s.roll = readCentered(gp, p.roll, p.deadband);
      s.throttle = this.readThrottleStyled(gp, p);
      this.throttleLow = this.isThrottleLow(gp, p);
    }

    const pressed = gp.buttons.map((b) => b.pressed);
    const edge = (i: number) => pressed[i] && !this.prevButtons[i];
    const e = this.events;

    if (p.arm) {
      if (p.arm.kind === 'axis') {
        this.armSwitch = readSwitch(gp, p.arm);
      } else {
        const on = readSwitch(gp, p.arm);
        if (on && !this.prevSwitchArm) e.armToggle = true;
        this.prevSwitchArm = on;
      }
    }
    // A / Cross always toggles arming on gamepads, even with a mapped switch.
    if (gp.mapping === 'standard' && edge(PAD_BUTTONS.arm) && !(p.arm?.kind === 'button' && p.arm.index === PAD_BUTTONS.arm)) {
      e.armToggle = true;
    }

    if (p.mode) {
      if (p.mode.kind === 'axis') {
        const v = gp.axes[p.mode.index] ?? 0;
        // 3-position switch: low / mid / high.
        const pos = v < -0.33 ? 0 : v > 0.33 ? 2 : 1;
        this.modeSwitch = p.mode.invert ? 2 - pos : pos;
      } else if (edge(p.mode.index)) {
        e.modeCycle = true;
      }
    }

    if (gp.mapping === 'standard') {
      if (edge(PAD_BUTTONS.reset)) e.reset = true;
      if (edge(PAD_BUTTONS.camera)) e.camera = true;
      if (!p.mode && edge(PAD_BUTTONS.mode)) e.modeCycle = true;
      if (edge(PAD_BUTTONS.menu)) e.menu = true;
      // Back / Select / View / Share: the map.
      if (edge(8)) e.mapView = true;
    }
    this.prevButtons = pressed;
  }

  private isThrottleLow(gp: Gamepad, p: ControllerProfile): boolean {
    if (p.throttleStyle === 'trigger' && gp.mapping === 'standard') return (gp.buttons[7]?.value ?? 0) < 0.06;
    const raw = readThrottle(gp, p.throttle);
    // A spring stick resting at center counts as "low": center means hover, not climb.
    if (p.throttleStyle === 'center-hover') return raw < 0.56;
    return raw < 0.06;
  }

  private readThrottleStyled(gp: Gamepad, p: ControllerProfile): number {
    if (p.throttleStyle === 'trigger' && gp.mapping === 'standard') {
      return clamp(gp.buttons[7]?.value ?? 0, 0, 1);
    }
    const raw = readThrottle(gp, p.throttle);
    if (p.throttleStyle === 'center-hover') {
      // Spring-centred stick: center holds height, up climbs, down descends.
      const c = raw * 2 - 1;
      this.climbStick = Math.abs(c) < p.deadband ? 0 : c;
      const h = this.hoverThrottle;
      return clamp(c >= 0 ? h + c * (1 - h) : h + c * h, 0, 1);
    }
    return raw;
  }

  private readKeyboard(dt: number): void {
    const k = this.keys;
    const s = this.sticks;
    const axis = (neg: string, pos: string) => (k.has(pos) ? 1 : 0) - (k.has(neg) ? 1 : 0);
    // Keyboard throttle holds its level: W/S ramp it, Shift punches to full.
    this.kbThrottle = clamp(this.kbThrottle + axis('KeyS', 'KeyW') * dt * 0.7, 0, 1);
    s.throttle = k.has('ShiftLeft') || k.has('ShiftRight') ? 1 : k.has('KeyX') ? 0 : this.kbThrottle;
    if (k.has('KeyX')) this.kbThrottle = 0;
    const smooth = (cur: number, target: number) => cur + (target - cur) * Math.min(1, dt * 12);
    s.yaw = smooth(s.yaw, axis('KeyA', 'KeyD'));
    s.pitch = smooth(s.pitch, axis('ArrowDown', 'ArrowUp'));
    s.roll = smooth(s.roll, axis('ArrowLeft', 'ArrowRight'));
  }

  private readKeyCommands(): void {
    const e = this.events;
    const ed = this.keyEdges;
    if (ed.has('Space') || ed.has('Enter')) e.armToggle = true;
    if (ed.has('KeyR')) e.reset = true;
    if (ed.has('KeyC')) e.camera = true;
    if (ed.has('KeyN')) e.modeCycle = true;
    if (ed.has('KeyM')) e.mapView = true;
    if (ed.has('KeyV')) e.record = true;
    if (ed.has('KeyT')) e.chat = true;
    if (ed.has('Escape') || ed.has('KeyP')) e.menu = true;
  }
}
