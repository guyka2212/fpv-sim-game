import type { Object3D, Scene, Vector3, WebGLRenderer } from 'three';
import type { World } from '../maps/world';
import { mapImage, type MapImage } from './mapView';

const $ = (id: string) => document.getElementById(id)!;
/** Metres of map from the drone to the edge of the mini map. */
const RANGE = 110;
const PIXELS = { small: 140, medium: 190, large: 250 } as const;

export type MiniMapCorner = 'tl' | 'tr' | 'bl' | 'br';
export type MiniMapSize = keyof typeof PIXELS;

/**
 * The corner mini map: the M map's top-down picture around the drone, turned so the way the drone
 * faces is always up, with the start and the other pilots on it.
 */
export class MiniMap {
  private readonly canvas = $('minimap') as HTMLCanvasElement;
  private readonly ctx = this.canvas.getContext('2d')!;
  private world: World | null = null;
  private image: MapImage | null = null;
  private readonly pic = new Image();
  private px = 0;
  private sinceDraw = 1;
  /** A colour per other pilot, picked at random the first time they show up. */
  private readonly colours = new Map<number, string>();
  private hue = Math.random() * 360;

  private colourOf(id: number): string {
    let c = this.colours.get(id);
    if (!c) {
      // Golden-angle steps from a random start: random, but never two alike side by side.
      this.hue = (this.hue + 137.508) % 360;
      c = `hsl(${Math.round(this.hue)}, 95%, 58%)`;
      this.colours.set(id, c);
    }
    return c;
  }

  /** Places it; called whenever the settings change. */
  configure(enabled: boolean, corner: MiniMapCorner, size: MiniMapSize): void {
    this.canvas.className = `mm-${corner}`;
    this.canvas.dataset.on = enabled ? '1' : '0';
    const css = PIXELS[size] ?? PIXELS.medium;
    const dpr = Math.min(2, window.devicePixelRatio);
    this.px = Math.round(css * dpr);
    this.canvas.width = this.canvas.height = this.px;
    this.canvas.style.width = this.canvas.style.height = `${css}px`;
    this.sinceDraw = 1;
  }

  show(on: boolean): void {
    this.canvas.style.display = on && this.canvas.dataset.on === '1' ? 'block' : 'none';
  }

  /** Call every flying frame (it redraws ~30 times a second). */
  update(
    dt: number,
    renderer: WebGLRenderer,
    scene: Scene,
    world: World,
    hide: Object3D[],
    drone: { x: number; z: number; yaw: number },
    start: Vector3,
    others: Iterable<[number, Vector3, string]>,
  ): void {
    if (this.canvas.dataset.on !== '1') return;
    if (this.world !== world) {
      // The picture is made once per map (and shared with the M map).
      this.world = world;
      this.colours.clear();
      this.image = mapImage(renderer, scene, world, hide);
      this.pic.src = this.image.url;
    }
    this.sinceDraw += dt;
    if (this.sinceDraw < 1 / 30 || !this.pic.complete || !this.image) return;
    this.sinceDraw = 0;

    const { ctx, px } = this;
    const im = this.image;
    const half = px / 2;
    const scale = half / RANGE; // canvas px per metre
    const toPic = this.pic.naturalWidth / im.size; // picture px per metre
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0b0e12';
    ctx.fillRect(0, 0, px, px);

    // World -> canvas: drone at the centre, heading up.
    ctx.translate(half, half);
    ctx.rotate(drone.yaw);
    ctx.scale(scale, scale);
    ctx.translate(-drone.x, -drone.z);
    ctx.drawImage(this.pic, im.x0, im.z0, this.pic.naturalWidth / toPic, this.pic.naturalHeight / toPic);

    const dot = (x: number, z: number, r: number, fill: string) => {
      ctx.beginPath();
      ctx.arc(x, z, r / scale, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 1.5 / scale;
      ctx.strokeStyle = '#000';
      ctx.stroke();
    };
    dot(start.x, start.z, 4, '#3ddc84');
    for (const [id, p] of others) dot(p.x, p.z, 5, this.colourOf(id));
    ctx.restore();

    // The drone: an arrow in the middle, always pointing up.
    ctx.save();
    ctx.translate(half, half);
    const a = px / 24;
    ctx.fillStyle = '#ff2d55';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1.5, px / 110);
    ctx.beginPath();
    ctx.moveTo(0, -a * 1.3);
    ctx.lineTo(a, a);
    ctx.lineTo(0, a * 0.45);
    ctx.lineTo(-a, a);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Rim and a north marker that turns with the map.
    ctx.lineWidth = Math.max(2, px / 70);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(half, half, half - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
    const nx = half + Math.sin(drone.yaw) * (half - px / 11);
    const ny = half - Math.cos(drone.yaw) * (half - px / 11);
    ctx.font = `700 ${Math.round(px / 11)}px Rajdhani, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.strokeText('N', nx, ny);
    ctx.fillStyle = '#ff6a1a';
    ctx.fillText('N', nx, ny);
  }
}
