import { MathUtils, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { QuadPhysics } from '../physics/quad';

export type CameraMode = 'fpv' | 'chase' | 'los';
export const CAMERA_MODES: CameraMode[] = ['fpv', 'chase', 'los'];

const _q = new Quaternion();
const _off = new Vector3();
const _f = new Vector3();
const _target = new Vector3();

/** FPV camera with uptilt, a chase cam, and a line-of-sight view from the pilot spot. */
export class CameraRig {
  readonly camera = new PerspectiveCamera(90, 1, 0.01, 1000);
  mode: CameraMode = 'fpv';
  uptiltDeg = 30;
  fovDeg = 120; // horizontal
  readonly pilotPos = new Vector3();
  private chasePos = new Vector3();
  private chaseInit = false;

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.applyFov();
  }

  setRange(near: number, far: number): void {
    this.camera.near = near;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  applyFov(): void {
    const h = this.mode === 'fpv' ? this.fovDeg : this.mode === 'chase' ? 95 : 70;
    // FOV is specified for a 16:9 picture; narrower windows keep the same vertical FOV.
    const v = 2 * Math.atan(Math.tan(MathUtils.degToRad(h) / 2) / Math.max(this.camera.aspect, 16 / 9));
    this.camera.fov = MathUtils.radToDeg(v);
    this.camera.updateProjectionMatrix();
  }

  cycle(): CameraMode {
    this.mode = CAMERA_MODES[(CAMERA_MODES.indexOf(this.mode) + 1) % CAMERA_MODES.length];
    this.chaseInit = false;
    this.applyFov();
    return this.mode;
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    this.chaseInit = false;
    this.applyFov();
  }

  update(dt: number, quad: QuadPhysics, camPos: [number, number, number], scale: number): void {
    const cam = this.camera;
    if (this.mode === 'fpv') {
      cam.position.set(...camPos).applyQuaternion(quad.quat).add(quad.pos);
      _q.setFromAxisAngle(_off.set(1, 0, 0), MathUtils.degToRad(this.uptiltDeg));
      cam.quaternion.copy(quad.quat).multiply(_q);
      return;
    }
    if (this.mode === 'chase') {
      // Follow behind on the horizontal heading, drone-size aware.
      quad.forward(_f);
      _f.y = 0;
      if (_f.lengthSq() < 1e-4) _f.set(0, 0, -1);
      _f.normalize();
      const back = 1.4 * scale;
      _target.copy(quad.pos).addScaledVector(_f, -back);
      _target.y += 0.5 * scale;
      if (!this.chaseInit) {
        this.chasePos.copy(_target);
        this.chaseInit = true;
      }
      this.chasePos.lerp(_target, 1 - Math.exp(-dt * 6));
      cam.position.copy(this.chasePos);
      cam.lookAt(quad.pos);
      return;
    }
    cam.position.copy(this.pilotPos);
    cam.lookAt(quad.pos);
  }
}
