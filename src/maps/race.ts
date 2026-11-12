import { BoxGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, Object3D, TorusGeometry, Vector3 } from 'three';
import type { GateShape } from './maps';

const _a = new Vector3();
const _b = new Vector3();

export type RaceEvent = { type: 'gate'; index: number } | { type: 'start' } | { type: 'lap'; time: number; best: boolean } | null;

/** Lap timing through ordered gates. A gate counts when crossed along its local -Z axis. */
export class Race {
  next = 0;
  lap = 0;
  lapStart = -1;
  lastLap = 0;
  best: number;
  readonly marker = new Group();
  private inverse: Matrix4[];

  constructor(
    readonly gates: Object3D[],
    readonly shape: GateShape,
    private readonly storageKey: string,
  ) {
    this.inverse = gates.map((g) => g.matrixWorld.clone().invert());
    let best = 0;
    try {
      best = Number(localStorage.getItem(storageKey) ?? 0);
    } catch {
      /* ignore */
    }
    this.best = best;
    this.buildMarker();
    this.placeMarker();
  }

  get active(): boolean {
    return this.gates.length > 0;
  }

  get running(): boolean {
    return this.lapStart >= 0;
  }

  reset(): void {
    this.next = 0;
    this.lap = 0;
    this.lapStart = -1;
    this.placeMarker();
  }

  private buildMarker(): void {
    const mat = new MeshBasicMaterial({ color: 0x39ff6a, transparent: true, opacity: 0.55, depthWrite: false });
    if (this.shape.kind === 'round') {
      this.marker.add(new Mesh(new TorusGeometry(this.shape.radius + 0.03, 0.012, 8, 48), mat));
    } else {
      const s = this.shape.half + 0.08;
      const t = 0.05;
      const bars: [number, number, number, number][] = [
        [2 * s, t, 0, s],
        [2 * s, t, 0, -s],
        [t, 2 * s, s, 0],
        [t, 2 * s, -s, 0],
      ];
      for (const [w, h, x, y] of bars) {
        const m = new Mesh(new BoxGeometry(w, h, t), mat);
        m.position.set(x, y, 0);
        this.marker.add(m);
      }
    }
    this.marker.renderOrder = 3;
  }

  private placeMarker(): void {
    const g = this.gates[this.next];
    if (!g) {
      this.marker.visible = false;
      return;
    }
    this.marker.visible = true;
    g.matrixWorld.decompose(this.marker.position, this.marker.quaternion, this.marker.scale);
    this.marker.scale.setScalar(1);
  }

  /** Check the segment from prev to cur against the next gate. */
  update(prev: Vector3, cur: Vector3, time: number): RaceEvent {
    if (!this.active) return null;
    const inv = this.inverse[this.next];
    _a.copy(prev).applyMatrix4(inv);
    _b.copy(cur).applyMatrix4(inv);
    if (!(_a.z > 0 && _b.z <= 0)) return null;
    const t = _a.z / (_a.z - _b.z);
    const x = _a.x + (_b.x - _a.x) * t;
    const y = _a.y + (_b.y - _a.y) * t;
    const inside = this.shape.kind === 'round' ? Math.hypot(x, y) < this.shape.radius : Math.abs(x) < this.shape.half && Math.abs(y) < this.shape.half;
    if (!inside) return null;

    const passed = this.next;
    this.next = (this.next + 1) % this.gates.length;
    this.placeMarker();
    if (passed !== 0) return { type: 'gate', index: passed };
    if (this.lapStart < 0) {
      this.lapStart = time;
      return { type: 'start' };
    }
    const lapTime = time - this.lapStart;
    this.lapStart = time;
    this.lap++;
    this.lastLap = lapTime;
    const best = this.best === 0 || lapTime < this.best;
    if (best) {
      this.best = lapTime;
      try {
        localStorage.setItem(this.storageKey, String(lapTime));
      } catch {
        /* ignore */
      }
    }
    return { type: 'lap', time: lapTime, best };
  }
}

export function formatTime(t: number): string {
  if (!t) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
