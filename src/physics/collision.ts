import { BufferAttribute, BufferGeometry, Matrix3, Mesh, Object3D, Quaternion, Ray, Vector3 } from 'three';
import { MeshBVH, type HitPointInfo } from 'three-mesh-bvh';
import type { QuadPhysics } from './quad';
import { motorLayout } from '../drones/specs';

const INCH = 0.0254;

interface ContactSphere {
  center: Vector3; // body frame
  radius: number;
}

export interface ContactResult {
  hit: boolean;
  impactSpeed: number;
}

const _p = new Vector3();
const _r = new Vector3();
const _n = new Vector3();
const _vc = new Vector3();
const _t = new Vector3();
const _rn = new Vector3();
const _tmp = new Vector3();
const _qInv = new Quaternion();
const _hit: HitPointInfo = { point: new Vector3(), distance: 0, faceIndex: 0 };
const _ray = new Ray();

/** Merges every mesh of a map into one BVH for sphere contacts and ground rays. */
export class CollisionWorld {
  readonly bvh: MeshBVH;

  constructor(root: Object3D) {
    root.updateMatrixWorld(true);
    // Count first, then fill typed arrays: no million-entry JS lists to garbage-collect.
    const meshes: Mesh[] = [];
    let nv = 0;
    let ni = 0;
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || mesh.userData.noCollide) return;
      meshes.push(mesh);
      const g = mesh.geometry;
      nv += g.attributes.position.count;
      ni += g.index ? g.index.count : g.attributes.position.count;
    });
    const positions = new Float32Array(nv * 3);
    const indices = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
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

  /** Distance straight down from p to the first surface (Infinity if none within maxDist). */
  groundDistance(p: Vector3, maxDist = 30): number {
    _ray.origin.copy(p);
    _ray.direction.set(0, -1, 0);
    const hit = this.bvh.raycastFirst(_ray, 2, 0, maxDist);
    return hit ? hit.distance : Infinity;
  }

  /** True if the segment a->b is blocked by geometry. */
  blocked(a: Vector3, b: Vector3): boolean {
    _ray.origin.copy(a);
    _ray.direction.subVectors(b, a);
    const len = _ray.direction.length();
    _ray.direction.divideScalar(len);
    return !!this.bvh.raycastFirst(_ray, 2, 0, len - 0.3);
  }

  closest(p: Vector3, maxDist: number): HitPointInfo | null {
    return this.bvh.closestPointToPoint(p, _hit, 0, maxDist);
  }
}

/** Rigid-body contact for a quad modelled as a few spheres (core + one per motor/duct). */
export class QuadContacts {
  readonly spheres: ContactSphere[];
  /** Height of the body origin above the ground when resting on its landing points. */
  readonly restHeight: number;
  /** Radius of a sphere around the body origin that holds every contact sphere. */
  readonly span: number;
  private readonly invInertia: Matrix3;

  constructor(private readonly quad: QuadPhysics) {
    const spec = quad.spec;
    const propR = (spec.prop.diameterIn * INCH) / 2;
    const motorR = spec.ducted ? propR * 1.12 : propR * 0.62;
    const coreR = Math.max(spec.armX * 0.5, 0.012);
    this.spheres = [{ center: new Vector3(0, coreR + Math.min(spec.bottomY ?? 0, 0) - 0.004, 0), radius: coreR }];
    for (const m of motorLayout(spec)) {
      this.spheres.push({ center: new Vector3(m.x, motorR - 0.008, m.z), radius: motorR });
    }
    this.restHeight = Math.max(...this.spheres.map((s) => s.radius - s.center.y)) + 0.001;
    this.span = Math.max(...this.spheres.map((s) => s.center.length() + s.radius));
    const [ix, iy, iz] = spec.inertia;
    this.invInertia = new Matrix3().set(1 / ix, 0, 0, 0, 1 / iy, 0, 0, 0, 1 / iz);
  }

  resolve(world: CollisionWorld, restitution: number, friction = 0.6): ContactResult {
    const quad = this.quad;
    const q = quad.quat;
    _qInv.copy(q).invert();
    let hit = false;
    let impact = 0;

    for (let iter = 0; iter < 2; iter++) {
      for (const s of this.spheres) {
        _r.copy(s.center).applyQuaternion(q); // lever arm, world
        _p.copy(quad.pos).add(_r);
        const h = world.closest(_p, s.radius);
        if (!h || h.distance >= s.radius) continue;
        hit = true;
        if (h.distance > 1e-6) _n.subVectors(_p, h.point).divideScalar(h.distance);
        else _n.set(0, 1, 0);
        // Push the whole body out of the surface.
        quad.pos.addScaledVector(_n, s.radius - h.distance);

        // Contact point velocity: v + w x r (w to world first).
        const wWorld = _tmp.copy(quad.omega).applyQuaternion(q);
        _vc.copy(wWorld).cross(_r).add(quad.vel);
        const vn = _vc.dot(_n);
        if (vn >= 0) continue;
        impact = Math.max(impact, -vn);

        // Effective mass along the normal, using body-frame inertia.
        const k = this.inverseMassAlong(_r, _n);
        const e = -vn > 0.6 ? restitution : 0;
        const j = (-(1 + e) * vn) / k;
        this.applyImpulse(_r, _tmp.copy(_n).multiplyScalar(j));

        // Coulomb friction along the sliding direction.
        const wWorld2 = _rn.copy(quad.omega).applyQuaternion(q);
        _vc.copy(wWorld2).cross(_r).add(quad.vel);
        _t.copy(_vc).addScaledVector(_n, -_vc.dot(_n));
        const vt = _t.length();
        if (vt > 1e-5) {
          _t.divideScalar(vt);
          const kt = this.inverseMassAlong(_r, _t);
          const jt = Math.min(friction * j, vt / kt);
          this.applyImpulse(_r, _tmp.copy(_t).multiplyScalar(-jt));
        }
      }
    }
    return { hit, impactSpeed: impact };
  }

  private inverseMassAlong(r: Vector3, dir: Vector3): number {
    // 1/m + dir . ((I^-1 (r x dir)) x r), with I in body frame.
    const q = this.quad.quat;
    const rxn = _rn.copy(r).cross(dir).applyQuaternion(_qInv);
    rxn.applyMatrix3(this.invInertia).applyQuaternion(q);
    return 1 / this.quad.spec.mass + rxn.cross(r).dot(dir);
  }

  private applyImpulse(r: Vector3, impulse: Vector3): void {
    const quad = this.quad;
    quad.vel.addScaledVector(impulse, 1 / quad.spec.mass);
    const dw = _rn.copy(r).cross(impulse).applyQuaternion(_qInv).applyMatrix3(this.invInertia);
    quad.omega.add(dw);
  }
}
