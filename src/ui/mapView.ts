import { Box3, FloatType, Object3D, OrthographicCamera, RGBAFormat, Scene, Vector3, WebGLRenderTarget, WebGLRenderer } from 'three';
import type { Spot } from '../maps/maps';
import type { World } from '../maps/world';

const $ = (id: string) => document.getElementById(id)!;
const SIZE = 1024;

/** A top-down picture of a map and the square of the world it covers (three.js x / z). */
export interface MapImage {
  url: string;
  x0: number;
  z0: number;
  size: number;
}

export interface MapMark {
  name: string;
  x: number;
  z: number;
  yaw?: number;
}

const images = new WeakMap<World, MapImage>();

/**
 * Renders the map straight down with an orthographic camera into a float target and tone-maps it
 * in JS, once per map. Fog and the given objects (the drone) are hidden while it draws.
 */
export function mapImage(renderer: WebGLRenderer, scene: Scene, world: World, hide: Object3D[]): MapImage {
  const cached = images.get(world);
  if (cached) return cached;
  const geom = world.collision.bvh.geometry;
  geom.computeBoundingBox();
  const box = geom.boundingBox ?? new Box3(new Vector3(-200, 0, -200), new Vector3(200, 50, 200));
  const c = box.getCenter(new Vector3());
  const size = Math.min(2400, Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 1.02);
  const cam = new OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 1, box.max.y - box.min.y + 400);
  cam.position.set(c.x, box.max.y + 200, c.z);
  cam.up.set(0, 0, -1);
  cam.lookAt(c.x, box.min.y, c.z);
  cam.updateMatrixWorld();

  const rt = new WebGLRenderTarget(SIZE, SIZE, { type: FloatType, format: RGBAFormat });
  const fog = scene.fog;
  const vis = hide.map((o) => o.visible);
  scene.fog = null;
  hide.forEach((o) => (o.visible = false));
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  const px = new Float32Array(SIZE * SIZE * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, px);
  renderer.setRenderTarget(prev);
  scene.fog = fog;
  hide.forEach((o, i) => (o.visible = vis[i]));
  rt.dispose();

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  const exposure = world.exposure * 1.05;
  for (let y = 0; y < SIZE; y++) {
    // The target is stored bottom-up.
    const src = (SIZE - 1 - y) * SIZE * 4;
    const dst = y * SIZE * 4;
    for (let x = 0; x < SIZE * 4; x += 4) {
      for (let k = 0; k < 3; k++) {
        const v = 1 - Math.exp(-px[src + x + k] * exposure);
        img.data[dst + x + k] = Math.pow(Math.max(0, v), 1 / 2.2) * 255;
      }
      img.data[dst + x + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const out = { url: canvas.toDataURL('image/jpeg', 0.85), x0: c.x - size / 2, z0: c.z - size / 2, size };
  images.set(world, out);
  return out;
}

/** Spot in Blender map coordinates -> three.js world x / z. */
export function spotToWorld(s: Spot): MapMark {
  return { name: s.name, x: s.x, z: -s.y, yaw: s.yaw === undefined ? undefined : (s.yaw * Math.PI) / 180 };
}

/** Full-screen map with the drone, the start and named spots. Click anywhere to teleport. */
export class MapView {
  private image: MapImage | null = null;
  private marks: MapMark[] = [];
  private drone = { x: 0, z: 0, yaw: 0 };
  private readonly img = $('mapview-img') as HTMLImageElement;
  private readonly over = $('mapview-marks') as HTMLCanvasElement;
  private onPick: ((m: MapMark) => void) | null = null;

  constructor() {
    this.over.addEventListener('click', (e) => {
      if (!this.image || !this.onPick) return;
      const r = this.over.getBoundingClientRect();
      const u = (e.clientX - r.left) / r.width;
      const v = (e.clientY - r.top) / r.height;
      this.onPick({ name: 'Map', x: this.image.x0 + u * this.image.size, z: this.image.z0 + v * this.image.size, yaw: this.drone.yaw });
    });
    window.addEventListener('resize', () => this.isOpen && this.draw());
  }

  get isOpen(): boolean {
    return !$('mapview').classList.contains('hidden');
  }

  open(
    renderer: WebGLRenderer,
    scene: Scene,
    world: World,
    title: string,
    marks: MapMark[],
    drone: { x: number; z: number; yaw: number },
    hide: Object3D[],
    onPick: (m: MapMark) => void,
  ): void {
    this.image = mapImage(renderer, scene, world, hide);
    this.marks = marks;
    this.drone = drone;
    this.onPick = onPick;
    $('mapview-title').textContent = title;
    this.img.src = this.image.url;
    const list = $('mapview-spots');
    list.innerHTML = '';
    for (const m of marks) {
      const b = document.createElement('button');
      b.textContent = m.name;
      b.addEventListener('click', () => this.onPick?.(m));
      list.appendChild(b);
    }
    $('mapview').classList.remove('hidden');
    requestAnimationFrame(() => this.draw());
  }

  close(): void {
    $('mapview').classList.add('hidden');
    this.onPick = null;
  }

  private draw(): void {
    const im = this.image;
    if (!im) return;
    const r = this.img.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio);
    this.over.width = Math.round(r.width * dpr);
    this.over.height = Math.round(r.height * dpr);
    this.over.style.width = `${r.width}px`;
    this.over.style.height = `${r.height}px`;
    const ctx = this.over.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const toPx = (x: number, z: number) => [((x - im.x0) / im.size) * r.width, ((z - im.z0) / im.size) * r.height];
    ctx.font = '600 13px Rajdhani, sans-serif';
    ctx.textBaseline = 'middle';
    this.marks.forEach((m, i) => {
      const [px, py] = toPx(m.x, m.z);
      ctx.fillStyle = i === 0 ? '#3ddc84' : '#ff6a1a';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeText(m.name, px + 10, py);
      ctx.fillStyle = '#fff';
      ctx.fillText(m.name, px + 10, py);
    });
    // The drone: an arrow pointing where it faces (yaw 0 = north = up).
    const [dx, dy] = toPx(this.drone.x, this.drone.z);
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(-this.drone.yaw);
    ctx.fillStyle = '#ff2d55';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
