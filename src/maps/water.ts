import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  Fog,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Ray,
  RingGeometry,
  Scene,
  Vector3,
} from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { CollisionWorld } from '../physics/collision';
import type { QuadPhysics } from '../physics/quad';
import { GRAVITY } from '../physics/quad';

const _p = new Vector3();
const _ray = new Ray();
const _down = new Vector3();

/** Vertical extent of the water at one point: the surface (top) and the solid floor under it. */
export interface WaterColumn {
  top: number;
  bottom: number;
}

/**
 * Every surface whose material starts with "water": lakes, rivers, ponds, pools and fountains.
 * They are left out of the collision world, so the drone goes in instead of bouncing off.
 */
export class WaterBodies {
  private readonly bvh: MeshBVH | null = null;
  /** Solid world: the lake bed or pool floor is the bottom of the water (the water meshes are thin sheets). */
  floor: CollisionWorld | null = null;

  /** Marks the water meshes of a map as not solid; call before building the collision world. */
  constructor(root: Object3D) {
    root.updateMatrixWorld(true);
    const meshes: Mesh[] = [];
    let nv = 0;
    let ni = 0;
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (!mats.every((m) => m.name.toLowerCase().startsWith('water'))) return;
      mesh.userData.noCollide = true;
      meshes.push(mesh);
      nv += mesh.geometry.attributes.position.count;
      ni += mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count;
    });
    if (!ni) return;
    const positions = new Float32Array(nv * 3);
    const indices = new Uint32Array(ni);
    let v = 0;
    let i = 0;
    for (const mesh of meshes) {
      const g = mesh.geometry;
      const pos = g.attributes.position;
      const base = v;
      for (let k = 0; k < pos.count; k++, v++) {
        _p.fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld);
        positions[v * 3] = _p.x;
        positions[v * 3 + 1] = _p.y;
        positions[v * 3 + 2] = _p.z;
      }
      if (g.index) for (let k = 0; k < g.index.count; k++) indices[i++] = base + g.index.getX(k);
      else for (let k = 0; k < pos.count; k++) indices[i++] = base + k;
    }
    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(positions, 3));
    geom.setIndex(new BufferAttribute(indices, 1));
    this.bvh = new MeshBVH(geom);
  }

  get any(): boolean {
    return this.bvh !== null;
  }

  /**
   * The water column at p: the first water surface at most `above` metres over p, looking down,
   * and the solid floor under that surface. Null where there is no water.
   */
  column(p: Vector3, above = 3, out: WaterColumn = { top: 0, bottom: 0 }): WaterColumn | null {
    if (!this.bvh) return null;
    _ray.origin.set(p.x, p.y + above, p.z);
    _ray.direction.set(0, -1, 0);
    const hit = this.bvh.raycastFirst(_ray, 2, 0, 400);
    // Only a face that looks up is a surface; a downward face is the underside of some water.
    if (!hit || !hit.face || hit.face.normal.y < 0.5) return null;
    out.top = hit.point.y;
    _p.set(p.x, out.top - 0.002, p.z);
    out.bottom = this.floor ? _p.y - this.floor.groundDistance(_p, 400) : -Infinity;
    return out;
  }
}

const SPRAY = 900;

/** Soft round dot for the droplets. */
function dotTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}

/** Churned water under the downwash: broken white streaks fading out toward the edge. */
function foamTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.translate(128, 128);
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.pow(Math.random(), 0.7) * 120;
    const len = 4 + Math.random() * 18;
    const fade = 1 - r / 125;
    ctx.strokeStyle = `rgba(255,255,255,${(0.15 + Math.random() * 0.5) * fade})`;
    ctx.lineWidth = 1 + Math.random() * 2.5;
    ctx.beginPath();
    // Streaks run around the centre, like water pushed out in a swirl.
    ctx.arc(0, 0, r, a, a + len / Math.max(r, 8));
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-128, -128, 256, 256);
  return new CanvasTexture(c);
}
const RINGS = 28;
const UNDERWATER = new Color(0x0d3a44);

interface Ring {
  mesh: Mesh;
  mat: MeshBasicMaterial;
  age: number;
  life: number;
  r: number;
  grow: number;
  alpha: number;
}

/**
 * What the props do to the water: a churned foam patch under the drone, rings running out
 * from it and spray blown sideways, all scaled by thrust and height. Also splashes, and the
 * murky view when the camera goes under.
 */
export class WaterFx {
  readonly group = new Group();
  private readonly pos = new Float32Array(SPRAY * 3);
  private readonly vel = new Float32Array(SPRAY * 3);
  private readonly life = new Float32Array(SPRAY);
  private readonly sprayGeom = new BufferGeometry();
  private readonly spray: Points;
  private next = 0;
  private readonly rings: Ring[] = [];
  private ringTimer = 0;
  private readonly foam: Mesh;
  private readonly foamMat: MeshBasicMaterial;
  private readonly col: WaterColumn = { top: 0, bottom: 0 };
  private readonly col2: WaterColumn = { top: 0, bottom: 0 };
  private underwater = false;
  private savedFog: { color: Color; near: number; far: number } | null = null;
  private savedBg: Color | null = null;

  constructor(private readonly water: WaterBodies, private readonly scene: Scene) {
    this.pos.fill(-1e5);
    this.sprayGeom.setAttribute('position', new BufferAttribute(this.pos, 3));
    const sprayMat = new PointsMaterial({ color: 0xf2fbff, size: 0.075, map: dotTexture(), transparent: true, opacity: 0.85, depthWrite: false });
    this.spray = new Points(this.sprayGeom, sprayMat);
    this.spray.frustumCulled = false;
    this.group.add(this.spray);

    const ringGeom = new RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < RINGS; i++) {
      const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new Mesh(ringGeom, mat);
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, age: 1, life: 1, r: 1, grow: 1, alpha: 0 });
    }
    this.foamMat = new MeshBasicMaterial({ color: 0xffffff, map: foamTexture(), transparent: true, opacity: 0, depthWrite: false });
    this.foam = new Mesh(new CircleGeometry(1, 40).rotateX(-Math.PI / 2), this.foamMat);
    this.foam.visible = false;
    this.foam.renderOrder = 1;
    this.group.add(this.foam);
  }

  /**
   * Prop wash on the surface below the drone. `thrust` is total thrust over weight, `reach` the
   * height in metres where the wash stops reaching the water, `solidGround` the distance down to
   * the first solid surface (water hidden under the ground gets no wash).
   */
  update(dt: number, quad: QuadPhysics, thrust: number, reach: number, span: number, solidGround = Infinity): void {
    let intensity = 0;
    let washR = 0;
    const hit = _p;
    if (thrust > 0.05) {
      // Where the downwash (body -Y) meets the water.
      _down.set(0, -1, 0).applyQuaternion(quad.quat);
      const c = this.water.column(quad.pos, 0.2, this.col);
      if (c && quad.pos.y > c.top && quad.pos.y - c.top < solidGround + 0.05 && _down.y < -0.25) {
        const h = quad.pos.y - c.top;
        const t = h / -_down.y;
        hit.copy(quad.pos).addScaledVector(_down, t);
        const slant = t;
        const c2 = this.water.column(hit, 0.5, this.col2);
        if (slant < reach && c2 && Math.abs(c2.top - c.top) < 0.05) {
          const fall = 1 - slant / reach;
          intensity = Math.min(1.6, thrust) * fall * (0.6 + 0.4 * fall);
          hit.y = c.top;
          // The downwash spreads as it falls: a wider, weaker patch from higher up.
          washR = span * 1.5 + slant * 0.55;
        }
      }
    }

    if (intensity > 0.02) {
      // Spray: droplets blown out radially from the downwash ring, falling back.
      const n = Math.floor(intensity * 1400 * dt * Math.min(2, 0.5 + span * 3)) + (Math.random() < (intensity * 900 * dt) % 1 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const i = this.next;
        this.next = (this.next + 1) % SPRAY;
        const a = Math.random() * Math.PI * 2;
        const r0 = washR * (0.55 + Math.random() * 0.6);
        const out = (1.5 + Math.random() * 4.5) * intensity;
        this.pos[i * 3] = hit.x + Math.cos(a) * r0;
        this.pos[i * 3 + 1] = hit.y + 0.02;
        this.pos[i * 3 + 2] = hit.z + Math.sin(a) * r0;
        this.vel[i * 3] = Math.cos(a) * out + quad.vel.x * 0.3;
        this.vel[i * 3 + 1] = (0.4 + Math.random() * 1.8) * intensity;
        this.vel[i * 3 + 2] = Math.sin(a) * out + quad.vel.z * 0.3;
        this.life[i] = 0.5 + Math.random() * 0.7;
      }
      // Rings running outward, more often the harder the props blow.
      this.ringTimer -= dt;
      if (this.ringTimer <= 0) {
        this.ringTimer = 0.09 + 0.25 / (1 + intensity * 4);
        this.spawnRing(hit, washR * 0.7, 1.4 + intensity * 2.5, 0.18 + 0.32 * Math.min(1, intensity), 1.2);
      }
      this.foam.visible = true;
      this.foam.position.set(hit.x, hit.y + 0.012, hit.z);
      const fr = washR * (1.1 + Math.random() * 0.08);
      this.foam.scale.set(fr, 1, fr);
      this.foam.rotation.y += dt * (2 + intensity * 6);
      this.foamMat.opacity = Math.min(0.9, intensity * 1.1) * (0.85 + Math.random() * 0.3);
    } else {
      this.foam.visible = false;
    }

    // Integrate the droplets.
    let alive = false;
    for (let i = 0; i < SPRAY; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -1e5;
        continue;
      }
      alive = true;
      this.vel[i * 3 + 1] -= GRAVITY * dt;
      const drag = Math.exp(-1.5 * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    if (alive || intensity > 0) this.sprayGeom.attributes.position.needsUpdate = true;

    for (const r of this.rings) {
      if (r.age >= r.life) continue;
      r.age += dt;
      if (r.age >= r.life) {
        r.mesh.visible = false;
        continue;
      }
      const t = r.age / r.life;
      const rad = r.r + r.grow * r.age;
      r.mesh.scale.set(rad, 1, rad);
      r.mat.opacity = r.alpha * (1 - t) * (1 - t);
    }
  }

  /** Splash where the drone hits the water: a burst of spray and a big ring. */
  splash(p: Vector3, top: number, speed: number, span: number): void {
    const s = Math.min(1.5, 0.3 + speed / 8);
    const n = Math.floor(120 * s);
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % SPRAY;
      const a = Math.random() * Math.PI * 2;
      const out = (0.5 + Math.random() * 3) * s;
      this.pos[i * 3] = p.x + Math.cos(a) * span * 0.5;
      this.pos[i * 3 + 1] = top + 0.02;
      this.pos[i * 3 + 2] = p.z + Math.sin(a) * span * 0.5;
      this.vel[i * 3] = Math.cos(a) * out;
      this.vel[i * 3 + 1] = (1.5 + Math.random() * 3.5) * s;
      this.vel[i * 3 + 2] = Math.sin(a) * out;
      this.life[i] = 0.7 + Math.random() * 0.8;
    }
    _p.set(p.x, top, p.z);
    this.spawnRing(_p, span, 2.0 * s, 0.7, 1.6);
    this.spawnRing(_p, span * 0.5, 1.2 * s, 0.5, 2.2);
  }

  private spawnRing(p: Vector3, r: number, grow: number, alpha: number, life: number): void {
    const ring = this.rings.reduce((a, b) => (b.age / b.life > a.age / a.life ? b : a));
    ring.age = 0;
    ring.life = life;
    ring.r = r;
    ring.grow = grow;
    ring.alpha = alpha;
    ring.mesh.visible = true;
    ring.mesh.position.set(p.x, p.y + 0.01 + Math.random() * 0.004, p.z);
    ring.mesh.scale.set(r, 1, r);
    ring.mat.opacity = alpha;
  }

  /** Murky blue view while the camera is under water. */
  setCamera(cam: Vector3): void {
    const c = this.water.column(cam, 60, this.col);
    const under = !!c && cam.y < c.top && cam.y > c.bottom;
    if (under === this.underwater) return;
    this.underwater = under;
    const fog = this.scene.fog as Fog | null;
    if (under && fog) {
      this.savedFog = { color: fog.color.clone(), near: fog.near, far: fog.far };
      this.savedBg = this.scene.background instanceof Color ? this.scene.background.clone() : null;
      fog.color.copy(UNDERWATER);
      fog.near = 0;
      fog.far = 9;
      if (this.scene.background instanceof Color) this.scene.background.copy(UNDERWATER);
    } else if (!under) this.restoreFog();
  }

  private restoreFog(): void {
    const fog = this.scene.fog as Fog | null;
    if (fog && this.savedFog) {
      fog.color.copy(this.savedFog.color);
      fog.near = this.savedFog.near;
      fog.far = this.savedFog.far;
    }
    if (this.savedBg && this.scene.background instanceof Color) this.scene.background.copy(this.savedBg);
    this.savedFog = null;
    this.savedBg = null;
  }

  /** Clear spray and rings (respawn) and leave the underwater view. */
  reset(): void {
    this.life.fill(0);
    this.pos.fill(-1e5);
    this.sprayGeom.attributes.position.needsUpdate = true;
    for (const r of this.rings) {
      r.age = r.life;
      r.mesh.visible = false;
    }
    this.foam.visible = false;
    if (this.underwater) this.restoreFog();
    this.underwater = false;
  }

  dispose(): void {
    this.reset();
    this.sprayGeom.dispose();
    (this.spray.material as PointsMaterial).dispose();
    for (const r of this.rings) r.mat.dispose();
    this.rings[0]?.mesh.geometry.dispose();
    this.foamMat.map?.dispose();
    this.foamMat.dispose();
    (this.spray.material as PointsMaterial).map?.dispose();
    this.foam.geometry.dispose();
  }
}
