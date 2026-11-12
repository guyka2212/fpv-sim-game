import { CanvasTexture, Group, Quaternion, Scene, Sprite, SpriteMaterial, Vector3 } from 'three';
import { DroneModel } from '../drones/droneModel';
import { getDrone } from '../drones/specs';
import { getSkin } from '../progress/skins';
import type { QuadPhysics } from '../physics/quad';

/** Enough of a QuadPhysics for DroneModel.update: pose and spinning props. */
interface FakeQuad {
  pos: Vector3;
  quat: Quaternion;
  motors: { angle: number; omega: number }[];
}

interface Snapshot {
  at: number;
  p: Vector3;
  q: Quaternion;
  w: number;
}

interface Remote {
  id: number;
  name: string;
  droneId: string;
  skin: string;
  model: DroneModel | null;
  loading: boolean;
  label: Sprite;
  quad: FakeQuad;
  snaps: Snapshot[];
  seen: number;
}

const _q = new Quaternion();

function nameLabel(text: string): Sprite {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const font = '600 44px Rajdhani, "Segoe UI", sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 36;
  c.width = w;
  c.height = 64;
  ctx.font = font;
  ctx.fillStyle = 'rgba(8,11,16,0.72)';
  const r = 18;
  ctx.beginPath();
  ctx.roundRect(0, 4, w, 56, r);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, 33);
  const tex = new CanvasTexture(c);
  const mat = new SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true });
  const s = new Sprite(mat);
  // Constant size on screen, about 3.5% of its height.
  s.scale.set((0.035 * w) / 64, 0.035, 1);
  s.center.set(0.5, 0);
  s.renderOrder = 10;
  return s;
}

/**
 * The other pilots' drones. Live: states arrive at the server rate and are shown ~120 ms late,
 * interpolated, so they move smoothly. Replays set them directly.
 */
export class RemoteDrones {
  readonly group = new Group();
  private readonly list = new Map<number, Remote>();
  showNames = true;
  /** How far behind the newest state we draw (ms). */
  delay = 120;

  constructor(scene: Scene) {
    scene.add(this.group);
  }

  private get(id: number, name: string, droneId: string): Remote {
    let r = this.list.get(id);
    if (!r) {
      const label = nameLabel(name);
      this.group.add(label);
      r = {
        id,
        name,
        droneId,
        skin: 'stock',
        model: null,
        loading: false,
        label,
        quad: { pos: new Vector3(), quat: new Quaternion(), motors: [0, 1, 2, 3].map(() => ({ angle: 0, omega: 0 })) },
        snaps: [],
        seen: 0,
      };
      this.list.set(id, r);
    }
    if (r.name !== name && name) {
      r.name = name;
      this.group.remove(r.label);
      r.label.material.map?.dispose();
      r.label.material.dispose();
      r.label = nameLabel(name);
      this.group.add(r.label);
    }
    if (r.droneId !== droneId || (!r.model && !r.loading)) {
      r.droneId = droneId;
      this.loadModel(r);
    }
    return r;
  }

  private loadModel(r: Remote): void {
    r.loading = true;
    const want = r.droneId;
    DroneModel.load(getDrone(want)).then(
      (m) => {
        r.loading = false;
        if (r.droneId !== want || !this.list.has(r.id)) {
          m.dispose();
          return;
        }
        if (r.model) {
          this.group.remove(r.model.root);
          r.model.dispose();
        }
        r.model = m;
        m.applySkin(getSkin(r.skin));
        this.group.add(m.root);
      },
      () => (r.loading = false),
    );
  }

  /** A live state from the server. */
  push(id: number, name: string, droneId: string, p: number[], q: number[], w: number, skin = 'stock', now = performance.now()): void {
    const r = this.get(id, name, droneId);
    if (r.skin !== skin) {
      r.skin = skin;
      r.model?.applySkin(getSkin(skin));
    }
    r.snaps.push({ at: now, p: new Vector3(p[0], p[1], p[2]), q: new Quaternion(q[0], q[1], q[2], q[3]).normalize(), w });
    if (r.snaps.length > 30) r.snaps.splice(0, r.snaps.length - 30);
    r.seen = now;
  }

  /** Replays: put a drone exactly here. */
  set(id: number, name: string, droneId: string, p: Vector3, q: Quaternion, w: number): void {
    const r = this.get(id, name, droneId);
    r.snaps.length = 0;
    r.quad.pos.copy(p);
    r.quad.quat.copy(q);
    for (const m of r.quad.motors) m.omega = w;
    r.seen = performance.now();
  }

  remove(id: number): void {
    const r = this.list.get(id);
    if (!r) return;
    this.list.delete(id);
    if (r.model) {
      this.group.remove(r.model.root);
      r.model.dispose();
    }
    this.group.remove(r.label);
    r.label.material.map?.dispose();
    r.label.material.dispose();
  }

  clear(): void {
    for (const id of [...this.list.keys()]) this.remove(id);
  }

  /** Drop drones not heard from for a while (left, or out of a replay's range). */
  prune(olderThanMs: number, now = performance.now()): void {
    for (const r of [...this.list.values()]) if (now - r.seen > olderThanMs) this.remove(r.id);
  }

  /** Moves every drone to where it was `delay` ms ago and spins its props. */
  update(dt: number, now = performance.now()): void {
    const t = now - this.delay;
    for (const r of this.list.values()) {
      const s = r.snaps;
      if (s.length) {
        let i = s.length - 1;
        while (i > 0 && s[i - 1].at > t) i--;
        const b = s[i];
        const a = s[Math.max(0, i - 1)];
        const span = b.at - a.at;
        const k = span > 0 ? Math.min(1, Math.max(0, (t - a.at) / span)) : 1;
        r.quad.pos.lerpVectors(a.p, b.p, k);
        r.quad.quat.copy(_q.copy(a.q).slerp(b.q, k));
        const w = a.w + (b.w - a.w) * k;
        for (const m of r.quad.motors) m.omega = w;
      }
      for (let i = 0; i < 4; i++) {
        const m = r.quad.motors[i];
        m.angle += m.omega * dt * (i === 0 || i === 3 ? 1 : -1);
      }
      r.model?.update(r.quad as unknown as QuadPhysics, false);
      r.label.visible = this.showNames;
      r.label.position.copy(r.quad.pos);
      r.label.position.y += 0.35;
    }
  }

  /** Every drone as shown now, for recording. */
  *samples(): Generator<{ id: number; name: string; drone: string; p: Vector3; q: Quaternion; w: number }> {
    for (const r of this.list.values()) yield { id: r.id, name: r.name, drone: r.droneId, p: r.quad.pos, q: r.quad.quat, w: r.quad.motors[0].omega };
  }

  /** Positions for collisions: [id, position] of every drone shown. */
  *positions(): Generator<[number, Vector3, string]> {
    for (const r of this.list.values()) yield [r.id, r.quad.pos, r.droneId];
  }

  get count(): number {
    return this.list.size;
  }

  set visible(v: boolean) {
    this.group.visible = v;
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }
}
