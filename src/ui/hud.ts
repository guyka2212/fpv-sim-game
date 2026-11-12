import { PerspectiveCamera, Vector3 } from 'three';
import type { DroneSpec } from '../drones/specs';
import type { Sticks } from '../fc/flightController';
import { formatTime, Race } from '../maps/race';
import type { MapDef } from '../maps/maps';
import type { QuadPhysics } from '../physics/quad';
import { GRAVITY } from '../physics/quad';

export interface HudState {
  quad: QuadPhysics;
  spec: DroneSpec;
  map: MapDef;
  camera: PerspectiveCamera;
  cameraMode: string;
  sticks: Sticks;
  armed: boolean;
  mode: string;
  flightTime: number;
  /** Height above whatever is straight below (m). */
  agl: number;
  /** Height above the spawn point (m). */
  altitude: number;
  signal: number;
  pilot: Vector3;
  race: Race | null;
  time: number;
}

const CYAN = '#5ff3ff';
const WARN = '#ffb43d';
const DEG = 180 / Math.PI;

const _f = new Vector3();
const _u = new Vector3();
const _r = new Vector3();
const _p = new Vector3();
const _fwd = new Vector3();

/**
 * Helmet-style HUD: a conformal horizon and pitch ladder in the middle, heading / speed /
 * altitude tapes around it, and four corner panels with drone, map, power and link data.
 * Drawn on a canvas over the FPV view, so it also shows in the headset.
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly panels: Record<'drone' | 'map' | 'power' | 'link', HTMLDivElement>;
  private textTimer = 0;
  private maxSpeed = 0;
  private lastFlightTime = 0;
  /** Share of the screen the HUD uses (1 on a monitor; less in VR, toward the sharp centre of the lenses). */
  area = 1;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.className = 'hidden';
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.root.appendChild(this.canvas);
    const panel = (cls: string, title: string) => {
      const d = document.createElement('div');
      d.className = `hud-panel ${cls}`;
      d.dataset.title = title;
      this.root.appendChild(d);
      return d;
    };
    this.panels = {
      drone: panel('tl', 'DRONE'),
      map: panel('tr', 'MAP'),
      power: panel('bl', 'POWER'),
      link: panel('br', 'LINK'),
    };
    parent.appendChild(this.root);
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
    if (on) this.maxSpeed = 0;
  }

  update(dt: number, s: HudState): void {
    // The canvas always covers the whole picture, so the horizon stays on the real horizon.
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const speed = s.quad.vel.length() * 3.6;
    if (s.flightTime < this.lastFlightTime) this.maxSpeed = 0; // new flight
    this.lastFlightTime = s.flightTime;
    this.maxSpeed = Math.max(this.maxSpeed, speed);

    this.draw(s, speed);
    this.textTimer -= dt;
    if (this.textTimer <= 0) {
      this.textTimer = 1 / 12;
      this.writePanels(s, speed);
    }
  }

  // ------------------------------------------------------------------ canvas

  private draw(s: HudState, speed: number): void {
    const c = this.ctx;
    const FW = this.canvas.width;
    const FH = this.canvas.height;
    const cx = FW / 2;
    const cy = FH / 2;
    // Tapes, ladder and bars fit in the HUD area (smaller in VR); W / H are its size.
    const W = FW * this.area;
    const H = FH * this.area;
    const unit = (Math.min(FW, FH) / 100) * (0.5 + 0.5 * this.area); // scales everything with the window
    c.clearRect(0, 0, FW, FH);
    c.lineWidth = Math.max(1.5, unit * 0.22);
    c.strokeStyle = CYAN;
    c.fillStyle = CYAN;
    c.shadowColor = CYAN;
    c.shadowBlur = unit * 0.8;
    c.font = `600 ${Math.round(unit * 2.1)}px "JetBrains Mono", ui-monospace, monospace`;
    c.textBaseline = 'middle';

    // Camera attitude (conformal: lines sit on the real horizon in the image).
    const cam = s.camera;
    cam.getWorldDirection(_f);
    _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const camPitch = Math.asin(Math.max(-1, Math.min(1, _f.y)));
    const roll = Math.atan2(_r.y, _u.y);
    const tanHalfV = Math.tan((cam.fov * Math.PI) / 360);
    const pxPerTan = FH / 2 / tanHalfV;
    const yFor = (angle: number) => Math.tan(Math.max(-1.45, Math.min(1.45, camPitch - angle))) * pxPerTan;

    // --- Horizon + pitch ladder, rotated with the roll.
    c.save();
    c.translate(cx, cy);
    c.rotate(-roll);
    c.beginPath();
    c.rect(-W * 0.3, -H * 0.36, W * 0.6, H * 0.72);
    c.clip();
    for (let deg = -90; deg <= 90; deg += 10) {
      const y = yFor((deg * Math.PI) / 180);
      if (Math.abs(y) > H * 0.36) continue;
      const half = deg === 0 ? W * 0.26 : unit * 9;
      const gap = unit * 5;
      c.globalAlpha = deg === 0 ? 1 : 0.75;
      c.setLineDash(deg < 0 ? [unit * 1.2, unit * 0.9] : []);
      c.beginPath();
      c.moveTo(-half, y);
      c.lineTo(-gap, y);
      c.moveTo(gap, y);
      c.lineTo(half, y);
      if (deg !== 0) {
        const tick = deg > 0 ? unit * 1.2 : -unit * 1.2;
        c.moveTo(-half, y);
        c.lineTo(-half, y + tick);
        c.moveTo(half, y);
        c.lineTo(half, y + tick);
      }
      c.stroke();
      if (deg !== 0) {
        c.textAlign = 'right';
        c.fillText(String(Math.abs(deg)), -half - unit, y);
        c.textAlign = 'left';
        c.fillText(String(Math.abs(deg)), half + unit, y);
      }
    }
    c.setLineDash([]);
    c.globalAlpha = 1;
    c.restore();

    // --- Roll arc with pointer.
    const arcR = unit * 30;
    c.beginPath();
    c.arc(cx, cy, arcR, Math.PI * 1.25, Math.PI * 1.75);
    c.stroke();
    for (const a of [-45, -30, -20, -10, 0, 10, 20, 30, 45]) {
      const t = ((a - 90) * Math.PI) / 180;
      const len = a % 30 === 0 ? unit * 2 : unit * 1.1;
      c.beginPath();
      c.moveTo(cx + Math.cos(t) * arcR, cy + Math.sin(t) * arcR);
      c.lineTo(cx + Math.cos(t) * (arcR - len), cy + Math.sin(t) * (arcR - len));
      c.stroke();
    }
    const rp = -Math.PI / 2 - roll;
    c.beginPath();
    c.moveTo(cx + Math.cos(rp) * (arcR - unit * 2.5), cy + Math.sin(rp) * (arcR - unit * 2.5));
    c.lineTo(cx + Math.cos(rp + 0.04) * (arcR - unit * 4.2), cy + Math.sin(rp + 0.04) * (arcR - unit * 4.2));
    c.lineTo(cx + Math.cos(rp - 0.04) * (arcR - unit * 4.2), cy + Math.sin(rp - 0.04) * (arcR - unit * 4.2));
    c.closePath();
    c.fill();

    // --- Center reticle.
    c.beginPath();
    c.arc(cx, cy, unit * 1.6, 0, Math.PI * 2);
    c.moveTo(cx - unit * 4.5, cy);
    c.lineTo(cx - unit * 2.4, cy);
    c.moveTo(cx + unit * 2.4, cy);
    c.lineTo(cx + unit * 4.5, cy);
    c.moveTo(cx, cy - unit * 2.4);
    c.lineTo(cx, cy - unit * 3.6);
    c.stroke();

    // --- Flight path marker: where the drone is actually going.
    if (speed > 3) {
      _p.copy(s.quad.pos).addScaledVector(s.quad.vel, 3).project(cam);
      if (_p.z < 1 && Math.abs(_p.x) < 0.95 && Math.abs(_p.y) < 0.95) {
        const fx = cx + (_p.x * FW) / 2;
        const fy = cy - (_p.y * FH) / 2;
        c.strokeStyle = '#a6ff7a';
        c.shadowColor = '#a6ff7a';
        c.beginPath();
        c.arc(fx, fy, unit * 1.3, 0, Math.PI * 2);
        c.moveTo(fx - unit * 3.2, fy);
        c.lineTo(fx - unit * 1.3, fy);
        c.moveTo(fx + unit * 1.3, fy);
        c.lineTo(fx + unit * 3.2, fy);
        c.moveTo(fx, fy - unit * 1.3);
        c.lineTo(fx, fy - unit * 2.6);
        c.stroke();
        c.strokeStyle = CYAN;
        c.shadowColor = CYAN;
      }
    }

    // --- Heading tape (top).
    s.quad.forward(_fwd);
    const heading = ((Math.atan2(_fwd.x, -_fwd.z) * DEG) % 360 + 360) % 360; // 0 = map north (-z), clockwise
    const tapeW = W * 0.36;
    const tapeY = cy - H / 2 + unit * 7;
    const pxPerDeg = tapeW / 90;
    c.save();
    c.beginPath();
    c.rect(cx - tapeW / 2, tapeY - unit * 4, tapeW, unit * 8);
    c.clip();
    c.textAlign = 'center';
    for (let d = Math.floor(heading - 50); d <= heading + 50; d++) {
      if (d % 5 !== 0) continue;
      const x = cx + (d - heading) * pxPerDeg;
      const major = d % 15 === 0;
      c.beginPath();
      c.moveTo(x, tapeY + unit * 2);
      c.lineTo(x, tapeY + (major ? unit * 0.2 : unit * 1.1));
      c.stroke();
      if (d % 30 === 0) {
        const n = ((d % 360) + 360) % 360;
        const label = ({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[n] ?? String(n / 10).padStart(2, '0');
        c.fillText(label, x, tapeY - unit * 1.4);
      }
    }
    c.restore();
    this.box(c, cx, tapeY + unit * 4.4, `${Math.round(heading).toString().padStart(3, '0')}°`, unit, 'center');

    // --- Speed tape (left) and altitude tape (right).
    // In VR the tapes sit a little further in, clear of the corner panels.
    const tapeX = W * (this.area < 1 ? 0.3 : 0.34);
    this.tape(c, cx - tapeX, cy, unit, speed, 10, 'km/h', 'left', 0);
    this.tape(c, cx + tapeX, cy, unit, s.agl, s.agl < 20 ? 1 : 5, 'AGL m', 'right', 1);
    // Vertical speed next to the altitude tape.
    const vs = s.quad.vel.y;
    c.textAlign = 'left';
    c.fillStyle = Math.abs(vs) > 15 ? WARN : CYAN;
    c.fillText(`${vs >= 0 ? '▲' : '▼'} ${Math.abs(vs).toFixed(1)} m/s`, cx + tapeX + unit * 2, cy + unit * 14.5);
    c.fillStyle = CYAN;

    // --- Bottom center: throttle, motors, G.
    const bx = cx;
    const by = cy + H / 2 - unit * 9;
    const barW = W * 0.2;
    c.textAlign = 'center';
    c.globalAlpha = 0.9;
    c.strokeRect(bx - barW / 2, by, barW, unit * 1.6);
    c.fillRect(bx - barW / 2, by, barW * s.sticks.throttle, unit * 1.6);
    c.globalAlpha = 1;
    c.fillText(`THR ${Math.round(s.sticks.throttle * 100)}%`, bx, by - unit * 1.6);
    const motors = s.quad.motors;
    const rpmMax = Math.max(1, ...motors.map((m) => m.rpm), s.spec.motor.kv * s.quad.battery.voltage * 0.82);
    motors.forEach((m, i) => {
      const x = bx - barW / 2 + (i + 0.5) * (barW / 4);
      const mh = unit * 4;
      const frac = Math.min(1, m.rpm / rpmMax);
      c.globalAlpha = 0.35;
      c.strokeRect(x - unit * 0.9, by + unit * 2.6, unit * 1.8, mh);
      c.globalAlpha = 1;
      c.fillRect(x - unit * 0.9, by + unit * 2.6 + mh * (1 - frac), unit * 1.8, mh * frac);
    });
    c.font = `600 ${Math.round(unit * 1.6)}px "JetBrains Mono", ui-monospace, monospace`;
    motors.forEach((_m, i) => c.fillText(`M${i + 1}`, bx - barW / 2 + (i + 0.5) * (barW / 4), by + unit * 7.9));
    const g = _p.copy(s.quad.accel).setY(s.quad.accel.y + GRAVITY).length() / GRAVITY;
    c.font = `600 ${Math.round(unit * 2.1)}px "JetBrains Mono", ui-monospace, monospace`;
    c.textAlign = 'left';
    c.fillStyle = g > 6 ? WARN : CYAN;
    c.fillText(`${g.toFixed(1)} G`, bx + barW / 2 + unit * 2, by + unit * 0.8);
    c.fillStyle = CYAN;
    c.textAlign = 'right';
    // Drone attitude (not the camera's, which includes the uptilt).
    _u.set(0, 1, 0).applyQuaternion(s.quad.quat);
    _r.set(1, 0, 0).applyQuaternion(s.quad.quat);
    const dronePitch = Math.asin(Math.max(-1, Math.min(1, _fwd.y))) * DEG;
    const droneRoll = Math.atan2(-_r.y, _u.y) * DEG;
    c.textAlign = 'center';
    c.fillText(`PITCH ${dronePitch.toFixed(0)}°   ROLL ${droneRoll.toFixed(0)}°   YAW ${Math.round(heading)}°`, bx, by - unit * 4.4);
    c.shadowBlur = 0;
  }

  /** Scrolling ladder tape with the current value boxed in the middle. */
  private tape(c: CanvasRenderingContext2D, x: number, cy: number, unit: number, value: number, step: number, label: string, side: 'left' | 'right', decimals: number): void {
    const half = unit * 12.5;
    const pxPerUnit = (unit * 3.2) / step;
    const dir = side === 'left' ? -1 : 1;
    c.save();
    c.beginPath();
    c.rect(x - unit * 10, cy - half, unit * 20, half * 2);
    c.clip();
    c.beginPath();
    c.moveTo(x, cy - half);
    c.lineTo(x, cy + half);
    c.stroke();
    c.textAlign = side === 'left' ? 'right' : 'left';
    const first = Math.floor((value - half / pxPerUnit) / step) * step;
    for (let v = first; v <= value + half / pxPerUnit; v += step) {
      if (v < 0) continue;
      const y = cy - (v - value) * pxPerUnit;
      const major = Math.round(v / step) % 2 === 0;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + dir * (major ? unit * 1.6 : unit * 0.8), y);
      c.stroke();
      if (major) {
        c.globalAlpha = 0.7;
        c.fillText(String(Math.round(v)), x + dir * unit * 2.4, y);
        c.globalAlpha = 1;
      }
    }
    c.restore();
    this.box(c, x - dir * unit * 1.2, cy, value.toFixed(decimals), unit, side === 'left' ? 'right' : 'left');
    c.textAlign = 'center';
    c.globalAlpha = 0.8;
    c.fillText(label, x, cy - half - unit * 1.8);
    c.globalAlpha = 1;
  }

  /** Value in a bracket box. */
  private box(c: CanvasRenderingContext2D, x: number, y: number, text: string, unit: number, align: 'left' | 'right' | 'center'): void {
    const tw = c.measureText(text).width + unit * 2;
    const bh = unit * 3.4;
    const left = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
    c.fillStyle = 'rgba(4,16,22,0.65)';
    c.fillRect(left, y - bh / 2, tw, bh);
    c.fillStyle = CYAN;
    c.strokeRect(left, y - bh / 2, tw, bh);
    c.textAlign = 'center';
    c.fillText(text, left + tw / 2, y + unit * 0.1);
  }

  // ------------------------------------------------------------------ corner panels

  private writePanels(s: HudState, speed: number): void {
    const q = s.quad;
    const b = q.battery;
    const spec = s.spec;
    const row = (k: string, v: string, cls = '') => `<div class="r ${cls}"><span>${k}</span><b>${v}</b></div>`;
    const bar = (frac: number, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%"></i></div>`;

    this.panels.drone.innerHTML =
      row('MODEL', spec.name) +
      row('CLASS', spec.className) +
      row('MOTORS', spec.motor.label) +
      row('PROPS', `${spec.prop.diameterIn}" ×${spec.prop.blades}`) +
      row('WEIGHT', `${Math.round(spec.mass * 1000)} g`) +
      row('T/W', `${spec.twRatio}:1`) +
      row('MODE', s.mode.toUpperCase()) +
      row('STATUS', s.armed ? 'ARMED' : 'DISARMED', s.armed ? 'ok' : 'bad');

    const wind = Math.hypot(q.wind.x, q.wind.z);
    const windFrom = ((Math.atan2(-q.wind.x, q.wind.z) * DEG) % 360 + 360) % 360;
    const r = s.race;
    const raceRows =
      r && r.active
        ? row('LAP', String(r.lap + (r.running ? 1 : 0))) +
          row('GATE', `${r.next + 1}/${r.gates.length}`) +
          row('LAP TIME', r.running ? formatTime(s.time - r.lapStart) : '--') +
          row('BEST', formatTime(r.best))
        : '';
    this.panels.map.innerHTML =
      row('MAP', s.map.name) +
      row('TYPE', s.map.gate ? 'RACE' : s.map.indoor ? 'INDOOR' : 'FREESTYLE') +
      row('WIND', wind < 0.2 ? 'CALM' : `${(wind * 3.6).toFixed(0)} km/h ${Math.round(windFrom)}°`) +
      row('FLIGHT', formatTime(s.flightTime).replace(/\.\d+$/, '')) +
      row('TOP SPD', `${Math.round(this.maxSpeed)} km/h`) +
      row('SPEED', `${Math.round(speed)} km/h`) +
      raceRows;

    const cell = b.cellVoltage;
    const low = spec.battery.chemistry === 'lipo' ? 3.5 : 3.1;
    const soc = b.soc;
    this.panels.power.innerHTML =
      row('PACK', spec.battery.label) +
      row('VOLT', `${b.voltage.toFixed(1)} V`, cell < low ? 'bad' : '') +
      row('CELL', `${cell.toFixed(2)} V`, cell < low ? 'bad' : '') +
      row('CURRENT', `${b.current.toFixed(1)} A`) +
      row('POWER', `${Math.round(b.voltage * b.current)} W`) +
      row('USED', `${Math.round(b.usedMah)} / ${spec.battery.capacityMah} mAh`, soc < 0.2 ? 'bad' : '') +
      bar(soc, soc < 0.2 ? 'bad' : soc < 0.4 ? 'warn' : '');

    const toPilot = _p.copy(s.pilot).sub(q.pos);
    const dist = Math.hypot(toPilot.x, toPilot.z);
    q.forward(_fwd);
    const homeRel = (Math.atan2(toPilot.x, -toPilot.z) - Math.atan2(_fwd.x, -_fwd.z)) * DEG;
    this.panels.link.innerHTML =
      row('LQ', `${Math.round(s.signal * 100)}%`, s.signal < 0.35 ? 'bad' : s.signal < 0.6 ? 'warn' : '') +
      bar(s.signal, s.signal < 0.35 ? 'bad' : '') +
      row('HOME', `${dist < 1000 ? Math.round(dist) + ' m' : (dist / 1000).toFixed(2) + ' km'} <i class="home" style="transform:rotate(${homeRel.toFixed(0)}deg)">▲</i>`) +
      row('AGL', `${s.agl.toFixed(1)} m`, s.agl < 1 && speed > 20 ? 'warn' : '') +
      row('ALT', `${s.altitude.toFixed(1)} m`) +
      row('CAM', `${s.cameraMode.toUpperCase()} ${spec.camera.uptiltDeg}°`) +
      row('VIDEO', `${spec.camera.fovDeg}° FOV`);
  }
}
