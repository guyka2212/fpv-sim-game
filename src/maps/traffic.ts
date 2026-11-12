import {
  CanvasTexture,
  Color,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const UP = new Vector3(0, 1, 0);
const G = 9.81;

export interface TrafficDef {
  /** Car model GLB (wheels named wheel_FL/FR/RL/RR, recolourable "livery"/"livery2" and "number" materials). */
  model: string;
  /** Driving line exported by blender/tracklib.py. */
  track: string;
  count: number;
  /** Real race pace: top speed (m/s), cornering grip (m/s²), braking and acceleration (m/s²). */
  topSpeed: number;
  grip: number;
  brake: number;
  accel: number;
  /** Lateral lanes (m from the centre line) the cars race in. */
  lanes: number[];
  /** Car body half extents (x, y, z) for collisions, y measured up from the road. */
  half: [number, number, number];
  wheelRadius: number;
  liveries: [number, number][];
  /** Engine note at full revs (Hz) and gears for the shift pattern. */
  engineHz: number;
  gears: number;
}

interface TrackData {
  width: number;
  start: number;
  points: number[][];
  bank: number[];
}

interface Car {
  root: Object3D;
  wheels: Object3D[];
  s: number;
  speed: number;
  skill: number;
  lane: number;
  laneTarget: number;
  pos: Vector3;
  vel: Vector3;
  quat: Quaternion;
  inv: Matrix4;
}

export interface CarHit {
  /** Push-out normal (world) and depth. */
  normal: Vector3;
  depth: number;
  carVel: Vector3;
}

const _p = new Vector3();
const _t = new Vector3();
const _r = new Vector3();
const _u = new Vector3();
const _m = new Matrix4();
const _l = new Vector3();

/** Race cars lapping a closed track along its driving line, with a simple pack/overtaking model. */
export class Traffic {
  readonly cars: Car[] = [];
  /** 0..1 share of real race pace (Settings → Race car speed). */
  pace = 0.75;
  private pts: Vector3[] = [];
  private tans: Vector3[] = [];
  private rights: Vector3[] = [];
  private bank: number[] = [];
  private vmax: number[] = [];
  private step = 2;
  private length = 0;

  private constructor(readonly def: TrafficDef) {}

  static async load(def: TrafficDef, parent: Object3D): Promise<Traffic> {
    const t = new Traffic(def);
    const [data, gltf] = await Promise.all([fetch(def.track).then((r) => r.json() as Promise<TrackData>), loader.loadAsync(def.model)]);
    t.buildTrack(data);
    t.spawnCars(gltf.scene, data.start, parent);
    return t;
  }

  private buildTrack(data: TrackData): void {
    this.pts = data.points.map((p) => new Vector3(p[0], p[1], p[2]));
    this.bank = data.bank;
    const n = this.pts.length;
    let len = 0;
    for (let i = 0; i < n; i++) len += this.pts[i].distanceTo(this.pts[(i + 1) % n]);
    this.length = len;
    this.step = len / n;
    for (let i = 0; i < n; i++) {
      const t = new Vector3().subVectors(this.pts[(i + 1) % n], this.pts[(i - 1 + n) % n]).setY(0).normalize();
      this.tans.push(t);
      this.rights.push(new Vector3().crossVectors(t, UP).normalize());
    }
    // Speed limit from curvature (banking adds grip), then braking / acceleration passes.
    const d = this.def;
    const lim: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = this.tans[(i - 3 + n) % n];
      const b = this.tans[(i + 3) % n];
      const ang = Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
      const k = ang / (6 * this.step);
      const grip = d.grip + G * Math.sin(Math.abs(this.bank[i]));
      lim.push(Math.min(d.topSpeed, Math.sqrt(grip / Math.max(k, 1e-5))));
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 2 * n; j > 0; j--) {
        const i = j % n;
        const prev = (i - 1 + n) % n;
        lim[prev] = Math.min(lim[prev], Math.sqrt(lim[i] ** 2 + 2 * d.brake * this.step));
      }
    }
    this.vmax = lim;
  }

  private spawnCars(model: Object3D, start: number, parent: Object3D): void {
    const d = this.def;
    model.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    for (let k = 0; k < d.count; k++) {
      const root = model.clone(true);
      const [c1, c2] = d.liveries[k % d.liveries.length];
      const num = String(((k * 37 + 3) % 98) + 1);
      const swap = new Map<Material, Material>();
      root.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        const old = m.material as MeshStandardMaterial;
        let mat = swap.get(old);
        if (!mat) {
          const name = old.name.toLowerCase();
          if (name === 'livery' || name === 'livery2' || name === 'number') {
            const c = old.clone();
            if (name === 'livery') c.color.setHex(c1);
            if (name === 'livery2') c.color.setHex(c2);
            if (name === 'number') {
              c.map = numberTexture(num, c1);
              c.color.set(0xffffff);
            }
            mat = c;
          } else mat = old;
          swap.set(old, mat);
        }
        m.material = mat;
      });
      const wheels = ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'].map((nm) => root.getObjectByName(nm)).filter((w): w is Object3D => !!w);
      // Grid: two by two behind the start line.
      const row = Math.floor(k / 2);
      const s = (start * this.step - 8 - row * 9 + this.length) % this.length;
      const lane = d.lanes[k % 2 === 0 ? 0 : d.lanes.length - 1];
      const car: Car = {
        root,
        wheels,
        s,
        speed: 0,
        skill: 0.93 + 0.07 * Math.random(),
        lane,
        laneTarget: lane,
        pos: new Vector3(),
        vel: new Vector3(),
        quat: new Quaternion(),
        inv: new Matrix4(),
      };
      this.cars.push(car);
      parent.add(root);
      this.place(car, 0);
    }
  }

  /** Speed limit at distance s along the lap. */
  private limitAt(s: number): number {
    const n = this.vmax.length;
    return this.vmax[Math.floor(s / this.step) % n];
  }

  update(dt: number): void {
    if (dt <= 0) return;
    const d = this.def;
    const L = this.length;
    for (const car of this.cars) {
      // Look ahead for the slowest point we need to brake for and the car in front.
      let target = this.limitAt(car.s) * car.skill * this.pace;
      let blocked = false;
      for (const o of this.cars) {
        if (o === car) continue;
        const gap = (o.s - car.s + L) % L;
        if (gap > 0 && gap < 14 + car.speed * 0.25 && Math.abs(o.lane - car.lane) < 2.4) {
          blocked = true;
          // Slipstream: close up but never through the car ahead.
          target = Math.min(target, o.speed + (gap - 8) * 0.8);
        }
      }
      if (blocked && car.lane === car.laneTarget) {
        // Pull out to the free lane furthest from the car ahead.
        const free = d.lanes.filter((ln) => !this.cars.some((o) => o !== car && Math.abs(o.lane - ln) < 2.4 && Math.abs(((o.s - car.s + L * 1.5) % L) - L / 2) < 12));
        if (free.length) car.laneTarget = free[Math.floor(Math.random() * free.length)];
      } else if (!blocked && Math.random() < dt * 0.15) {
        // Drift back toward the racing line sometimes.
        car.laneTarget = d.lanes[Math.floor(Math.random() * d.lanes.length)];
      }
      car.lane += Math.sign(car.laneTarget - car.lane) * Math.min(Math.abs(car.laneTarget - car.lane), dt * 2.2);
      const dv = target - car.speed;
      car.speed += dv > 0 ? Math.min(dv, d.accel * dt * (1 - car.speed / (d.topSpeed * 1.15))) : Math.max(dv, -d.brake * dt);
      car.speed = Math.max(0, car.speed);
      car.s = (car.s + car.speed * dt) % L;
      this.place(car, dt);
    }
  }

  private place(car: Car, dt: number): void {
    const n = this.pts.length;
    const f = car.s / this.step;
    const i = Math.floor(f) % n;
    const j = (i + 1) % n;
    const a = f - Math.floor(f);
    const bank = this.bank[i] * (1 - a) + this.bank[j] * a;
    _p.lerpVectors(this.pts[i], this.pts[j], a);
    _t.lerpVectors(this.tans[i], this.tans[j], a).normalize();
    _r.crossVectors(_t, UP).normalize();
    const cb = Math.cos(bank);
    const sb = Math.sin(bank);
    // Banked road: right edge higher by sin(bank).
    _p.addScaledVector(_r, car.lane * cb).addScaledVector(UP, car.lane * sb);
    _u.copy(UP).multiplyScalar(cb).addScaledVector(_r, -sb);
    _r.multiplyScalar(cb).addScaledVector(UP, sb);
    if (dt > 0) car.vel.subVectors(_p, car.pos).divideScalar(dt);
    car.pos.copy(_p);
    _m.makeBasis(_r, _u, _l.copy(_t).negate());
    car.quat.setFromRotationMatrix(_m);
    car.root.position.copy(car.pos);
    car.root.quaternion.copy(car.quat);
    car.root.updateMatrixWorld();
    car.inv.copy(car.root.matrixWorld).invert();
    const spin = (car.speed * dt) / this.def.wheelRadius;
    for (const w of car.wheels) w.rotation.x -= spin;
  }

  /** Contact between a sphere (drone) and the nearest car body, if any. */
  collide(pos: Vector3, radius: number): CarHit | null {
    const [hx, hy, hz] = this.def.half;
    for (const car of this.cars) {
      if (car.pos.distanceToSquared(pos) > 16) continue;
      _l.copy(pos).applyMatrix4(car.inv);
      _l.y -= hy;
      const dx = hx + radius - Math.abs(_l.x);
      const dy = hy + radius - Math.abs(_l.y);
      const dz = hz + radius - Math.abs(_l.z);
      if (dx <= 0 || dy <= 0 || dz <= 0) continue;
      // Push out along the shallowest axis.
      const n = new Vector3();
      let depth: number;
      if (dy <= dx && dy <= dz) {
        n.set(0, Math.sign(_l.y) || 1, 0);
        depth = dy;
      } else if (dx <= dz) {
        n.set(Math.sign(_l.x) || 1, 0, 0);
        depth = dx;
      } else {
        n.set(0, 0, Math.sign(_l.z) || 1);
        depth = dz;
      }
      n.applyQuaternion(car.quat);
      return { normal: n, depth, carVel: car.vel.clone() };
    }
    return null;
  }

  /** The closest cars to a point, nearest first, for engine sounds. */
  nearest(pos: Vector3, count: number): { car: Car; dist: number }[] {
    return this.cars
      .map((car) => ({ car, dist: car.pos.distanceTo(pos) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, count);
  }

  /** Engine note (Hz) for a car: revs climb through each gear and drop at the shift. */
  engineHz(car: Car): number {
    const d = this.def;
    const x = Math.min(0.999, car.speed / d.topSpeed) * d.gears;
    const gear = Math.floor(x);
    const rev = 0.55 + 0.45 * (x - gear) + gear * 0.012;
    return d.engineHz * rev;
  }

  dispose(): void {
    for (const car of this.cars) {
      car.root.removeFromParent();
      car.root.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        const mat = m.material as MeshStandardMaterial;
        if (/^(livery2?|number)$/i.test(mat.name)) {
          mat.map?.dispose();
          mat.dispose();
        }
      });
    }
  }
}

function numberTexture(num: string, color: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.font = 'bold 92px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = '#000000';
  g.strokeText(num, 64, 70);
  g.fillStyle = '#' + new Color(color).getHexString();
  g.fillText(num, 64, 70);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.flipY = false;
  return t;
}
