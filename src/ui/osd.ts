import { PerspectiveCamera, Vector3 } from 'three';
import type { Sticks } from '../fc/flightController';
import { formatTime, Race } from '../maps/race';
import type { QuadPhysics } from '../physics/quad';

const $ = (id: string) => document.getElementById(id)!;
const shown = new Map<string, string>();
/** Sets an element's HTML only when it changed: no reparse or relayout for the same text. */
const put = (id: string, html: string) => {
  if (shown.get(id) === html) return;
  shown.set(id, html);
  $(id).innerHTML = html;
};
const DEG = 180 / Math.PI;
const MODE_NAMES: Record<string, string> = { acro: 'ACRO', angle: 'ANGL', horizon: 'HOR' };

const _f = new Vector3();
const _u = new Vector3();
const _r = new Vector3();

export interface OsdState {
  quad: QuadPhysics;
  sticks: Sticks;
  armed: boolean;
  mode: string;
  camera: string;
  flightTime: number;
  altitude: number;
  signal: number;
  race: Race | null;
  time: number;
  /** Where the pilot stands, for the home distance and arrow. */
  pilot: Vector3;
  /** The FPV camera, so the horizon can be drawn where it really is in the picture. */
  fpvCamera: PerspectiveCamera;
}

/** "Real FPV" display: a Betaflight OSD as it looks in DJI / Walksnail goggles. */
export class Osd {
  private msgUntil = 0;
  private acc = 0;
  private readonly ahi = document.getElementById('osd-ahi') as HTMLCanvasElement;
  /** Share of the screen the OSD uses (1 on a monitor; less in VR). */
  area = 1;

  show(on: boolean): void {
    $('osd').classList.toggle('hidden', !on);
  }

  message(text: string, kind: '' | 'warn' | 'bad' = '', seconds = 2.5, now = performance.now() / 1000): void {
    const el = $('osd-msg');
    el.textContent = text;
    el.className = kind;
    this.msgUntil = seconds > 0 ? now + seconds : Infinity;
  }

  /** True while a timed message is on screen. */
  get busy(): boolean {
    return this.msgUntil > 0;
  }

  /** Low-priority standing text, shown only when no timed message is up. */
  hint(text: string, kind: '' | 'warn' | 'bad' = ''): void {
    if (this.busy) return;
    const el = $('osd-msg');
    if (el.textContent !== text) el.textContent = text;
    el.className = kind;
  }

  clearMessage(): void {
    $('osd-msg').textContent = '';
    this.msgUntil = 0;
  }

  update(dt: number, s: OsdState): void {
    const now = performance.now() / 1000;
    if (this.msgUntil && now > this.msgUntil) this.clearMessage();

    this.drawAhi(s.fpvCamera);
    this.drawSticks(s.sticks);
    this.acc += dt;
    if (this.acc < 1 / 15) return;
    this.acc = 0;

    const q = s.quad;
    const b = q.battery;
    const st = s.sticks;
    const cell = b.cellVoltage;
    const lowV = q.spec.battery.chemistry === 'lipo' ? 3.5 : 3.1;
    const lowBatt = cell < lowV;
    const u = (t: string) => `<span class="u">${t}</span>`;
    put('osd-batt', `<span class="${lowBatt ? 'low' : ''}"><span class="ic">▮</span>${b.voltage.toFixed(1)}${u('V')}</span><br>` +
      `<span class="${lowBatt ? 'low' : ''}">${cell.toFixed(2)}${u('V')}</span>`);
    put('osd-mah', `<span class="${b.soc < 0.2 ? 'low' : ''}">${Math.round(b.usedMah)}${u('MAH')}</span><br>${b.current.toFixed(1)}${u('A')}`);
    put('osd-time', `<span class="ic">⏱</span>${formatTime(s.flightTime).replace(/\.\d+$/, '')}`);
    put('osd-signal', `<span class="${s.signal < 0.35 ? 'low' : ''}">LQ ${Math.round(s.signal * 100)}</span>`);
    put('osd-thr', `THR ${Math.round(st.throttle * 100)}`);
    put('osd-alt', `${s.altitude.toFixed(1)}${u('M')}<span class="ic" style="margin-left:.2em">▲</span>`);
    put('osd-speed', `${Math.round(q.vel.length() * 3.6)}${u('KM/H')}`);
    const dx = s.pilot.x - q.pos.x;
    const dz = s.pilot.z - q.pos.z;
    q.forward(_f);
    const rel = (Math.atan2(dx, -dz) - Math.atan2(_f.x, -_f.z)) * DEG;
    put('osd-home', `${Math.round(Math.hypot(dx, dz))}${u('M')}<span class="arrow" style="transform:rotate(${rel.toFixed(0)}deg)">⬆</span>`);
    put('osd-mode', MODE_NAMES[s.mode] ?? s.mode.toUpperCase());
    // Betaflight's warning line: one message at a time, blinking.
    const warn = !s.armed ? 'DISARMED' : lowBatt ? 'LOW BATTERY' : s.signal < 0.35 ? 'LQ LOW' : '';
    put('osd-arm', warn ? `<span class="blink ${warn === 'DISARMED' ? '' : 'low'}">${warn}</span>` : '');

    const r = s.race;
    if (r && r.active) {
      const cur = r.running ? s.time - r.lapStart : 0;
      put('osd-race', `LAP ${r.lap + (r.running ? 1 : 0)} ${r.running ? formatTime(cur) : '--:--.--'}<br>GATE ${r.next + 1}/${r.gates.length} BEST ${formatTime(r.best)}`);
    } else {
      put('osd-race', '');
    }
  }

  private readonly stickL = document.querySelector<HTMLElement>('#stick-l i')!;
  private readonly stickR = document.querySelector<HTMLElement>('#stick-r i')!;

  /** Where both sticks are (Mode 2): left = yaw + throttle, right = roll + pitch. */
  private drawSticks(st: Sticks): void {
    const place = (dot: HTMLElement, x: number, y: number) => {
      // x, y in -1..1 (+y = up); the dot travels the whole box.
      dot.style.transform = `translate(${(x * 50).toFixed(1)}%, ${(-y * 50).toFixed(1)}%)`;
    };
    place(this.stickL, st.yaw, st.throttle * 2 - 1);
    place(this.stickR, st.roll, st.pitch);
  }

  /** Betaflight's crosshair, artificial horizon and AHI side bars (craft attitude, not camera). */
  private drawAhi(camera: PerspectiveCamera): void {
    const cv = this.ahi;
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    const c = cv.getContext('2d')!;
    c.clearRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H / 2;
    const ch = Math.max(10, H * 0.027); // one OSD character
    c.lineCap = 'butt';
    const stroke = (draw: () => void, width: number) => {
      c.strokeStyle = '#000';
      c.lineWidth = width + 3;
      c.beginPath();
      draw();
      c.stroke();
      c.strokeStyle = '#fff';
      c.lineWidth = width;
      c.beginPath();
      draw();
      c.stroke();
    };

    // Crosshair: the "-+-" in the middle of every Betaflight OSD.
    stroke(() => {
      c.moveTo(cx - ch * 1.6, cy);
      c.lineTo(cx - ch * 0.5, cy);
      c.moveTo(cx + ch * 0.5, cy);
      c.lineTo(cx + ch * 1.6, cy);
      c.moveTo(cx, cy - ch * 0.5);
      c.lineTo(cx, cy + ch * 0.5);
    }, 2);

    // Artificial horizon, drawn exactly on the real horizon in the FPV picture: project two
    // directions that lie on the horizon (level, 25° either side of the camera's heading)
    // through the camera. That accounts for pitch, roll, camera uptilt and lens FOV at once.
    const sx = W * 0.16 * this.area;
    camera.getWorldDirection(_f);
    _f.y = 0;
    if (_f.lengthSq() > 1e-6) {
      _f.normalize();
      _r.set(-_f.z, 0, _f.x); // level "right" direction
      const onScreen = (sign: number) => {
        _u.copy(_f).multiplyScalar(Math.cos(0.44)).addScaledVector(_r, sign * Math.sin(0.44));
        _u.multiplyScalar(1e5).add(camera.position).project(camera);
        return { x: cx + (_u.x * W) / 2, y: cy - (_u.y * H) / 2 };
      };
      const a = onScreen(-1);
      const b = onScreen(1);
      // The horizon line through a and b. Draw it around the point closest to the crosshair,
      // so it stays readable in steep banks, and always exactly on the real horizon.
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const n = Math.hypot(dx, dy);
      if (n > 1e-3) {
        dx /= n;
        dy /= n;
        const t = (cx - a.x) * dx + (cy - a.y) * dy;
        const px = a.x + dx * t;
        const py = a.y + dy * t;
        // Only inside the OSD area (all of the screen on a monitor, the middle in VR).
        const edge = (1 - this.area) / 2 + 0.1 * this.area;
        const mx = W * edge;
        const my = H * edge;
        if (px > mx && px < W - mx && py > my && py < H - my) {
          const gap = ch * 2.2;
          const len = W * 0.15 * this.area;
          c.save();
          c.translate(px, py);
          c.rotate(Math.atan2(dy, dx));
          stroke(() => {
            c.moveTo(-len, 0);
            c.lineTo(-gap, 0);
            c.moveTo(gap, 0);
            c.lineTo(len, 0);
            // Small ticks toward the ground, so up and down stay clear even inverted.
            c.moveTo(-len, 0);
            c.lineTo(-len, ch * 0.5);
            c.moveTo(len, 0);
            c.lineTo(len, ch * 0.5);
          }, 3);
          c.restore();
        }
      }
    }

    // AHI side bars: fixed ladders left and right with a centre mark.
    stroke(() => {
      for (const side of [-1, 1]) {
        const x = cx + side * sx;
        for (let k = -3; k <= 3; k++) {
          const y = cy + k * ch * 0.9;
          const len = k === 0 ? ch * 0.9 : ch * 0.45;
          c.moveTo(x, y);
          c.lineTo(x - side * len, y);
        }
      }
    }, 2);
  }
}
