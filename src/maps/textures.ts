import { CanvasTexture, RepeatWrapping, SRGBColorSpace, Texture } from 'three';

// Procedural grayscale detail textures, multiplied with each material's base color.
// Map UVs are in metres, so `size` is how many metres one tile covers.

type Painter = (ctx: CanvasRenderingContext2D, n: number, rnd: () => number) => void;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function speckle(ctx: CanvasRenderingContext2D, n: number, rnd: () => number, count: number, min: number, max: number, size: number) {
  // Counts and sizes are tuned for a 256 px tile.
  const k = n / 256;
  count = Math.round(count * k * k);
  size *= k;
  for (let i = 0; i < count; i++) {
    const v = Math.floor(min + rnd() * (max - min));
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    const s = 1 + rnd() * size;
    ctx.fillRect(rnd() * n, rnd() * n, s, s);
  }
}

function blotches(ctx: CanvasRenderingContext2D, n: number, rnd: () => number, count: number, min: number, max: number, r: number) {
  for (let i = 0; i < count; i++) {
    const v = Math.floor(min + rnd() * (max - min));
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * (0.5 + rnd()));
    g.addColorStop(0, `rgba(${v},${v},${v},0.35)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g;
    const x = rnd() * n;
    const y = rnd() * n;
    // Draw with wrap so the tile stays seamless.
    for (const dx of [-n, 0, n]) {
      for (const dy of [-n, 0, n]) {
        ctx.save();
        ctx.translate(x + dx, y + dy);
        ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);
        ctx.restore();
      }
    }
  }
}

const base = (v: number): Painter => (ctx, n) => {
  ctx.fillStyle = `rgb(${v},${v},${v})`;
  ctx.fillRect(0, 0, n, n);
};

const PAINTERS: Record<string, { size: number; paint: Painter; bump?: number }> = {
  grass: {
    size: 3,
    paint: (ctx, n, r) => {
      base(205)(ctx, n, r);
      blotches(ctx, n, r, 30, 150, 255, n / 6);
      speckle(ctx, n, r, 9000, 140, 255, 2);
    },
  },
  dirt: {
    size: 4,
    paint: (ctx, n, r) => {
      base(210)(ctx, n, r);
      blotches(ctx, n, r, 40, 140, 255, n / 5);
      speckle(ctx, n, r, 6000, 120, 255, 3);
    },
  },
  asphalt: {
    size: 2,
    paint: (ctx, n, r) => {
      base(200)(ctx, n, r);
      speckle(ctx, n, r, 14000, 120, 255, 1.5);
      blotches(ctx, n, r, 12, 150, 230, n / 4);
    },
  },
  concrete: {
    size: 3,
    paint: (ctx, n, r) => {
      base(215)(ctx, n, r);
      blotches(ctx, n, r, 35, 160, 250, n / 5);
      speckle(ctx, n, r, 5000, 170, 245, 1.5);
      ctx.strokeStyle = 'rgba(90,90,90,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, n - 2, n - 2);
    },
  },
  rock: {
    size: 6,
    paint: (ctx, n, r) => {
      base(190)(ctx, n, r);
      blotches(ctx, n, r, 60, 110, 255, n / 6);
      speckle(ctx, n, r, 6000, 120, 250, 3);
    },
  },
  snow: {
    size: 6,
    paint: (ctx, n, r) => {
      base(240)(ctx, n, r);
      blotches(ctx, n, r, 20, 200, 255, n / 4);
    },
  },
  wood: {
    size: 1.2,
    paint: (ctx, n, r) => {
      base(210)(ctx, n, r);
      const planks = 8;
      for (let i = 0; i < planks; i++) {
        const v = 170 + Math.floor(r() * 70);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(0, (i * n) / planks, n, n / planks - 2);
        for (let k = 0; k < 40; k++) {
          ctx.fillStyle = `rgba(80,80,80,${0.08 + r() * 0.1})`;
          ctx.fillRect(r() * n, (i * n) / planks + r() * (n / planks), 20 + r() * 80, 1);
        }
      }
    },
  },
  tile: {
    size: 1.2,
    paint: (ctx, n, r) => {
      base(245)(ctx, n, r);
      speckle(ctx, n, r, 2000, 220, 255, 1);
      ctx.fillStyle = 'rgb(150,150,150)';
      const k = 4;
      for (let i = 0; i < k; i++) {
        ctx.fillRect(0, (i * n) / k, n, 3);
        ctx.fillRect((i * n) / k, 0, 3, n);
      }
    },
  },
  carpet: {
    size: 1,
    paint: (ctx, n, r) => {
      base(220)(ctx, n, r);
      speckle(ctx, n, r, 20000, 170, 255, 1);
    },
  },
  brick: {
    size: 2,
    paint: (ctx, n, r) => {
      base(150)(ctx, n, r);
      const rows = 12;
      const h = n / rows;
      for (let y = 0; y < rows; y++) {
        const off = (y % 2) * (n / 8);
        for (let x = -1; x < 4; x++) {
          const v = 190 + Math.floor(r() * 65);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(off + (x * n) / 4 + 2, y * h + 2, n / 4 - 4, h - 4);
        }
      }
    },
  },
  plaster: {
    size: 3,
    paint: (ctx, n, r) => {
      base(235)(ctx, n, r);
      blotches(ctx, n, r, 20, 200, 255, n / 4);
    },
  },
  metal: {
    size: 1.5,
    bump: 0.25,
    paint: (ctx, n, r) => {
      base(225)(ctx, n, r);
      // Brushed streaks.
      for (let i = 0; i < n * 3; i++) {
        const v = 190 + Math.floor(r() * 65);
        ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
        ctx.fillRect(r() * n, r() * n, 30 + r() * 120, 1);
      }
      blotches(ctx, n, r, 10, 180, 250, n / 4);
    },
  },
  paint: {
    size: 2,
    bump: 0.15,
    paint: (ctx, n, r) => {
      base(240)(ctx, n, r);
      blotches(ctx, n, r, 14, 215, 255, n / 5);
      speckle(ctx, n, r, 1500, 220, 255, 1);
    },
  },
  fabric: {
    size: 0.5,
    paint: (ctx, n, r) => {
      base(225)(ctx, n, r);
      for (let i = 0; i < n; i += 4) {
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(0, i, n, 2);
        ctx.fillRect(i, 0, 2, n);
      }
    },
  },
};

const ALIAS: Record<string, string> = {
  leaves: 'grass',
  stone: 'concrete',
  roof: 'concrete',
  plastic: 'paint',
  rubber: 'asphalt',
  sign: 'paint',
};
// Strength of the relief the normal map gives each surface.
const BUMP: Record<string, number> = {
  grass: 0.9, dirt: 1.0, asphalt: 0.7, concrete: 0.6, rock: 1.3, snow: 0.5, wood: 0.6, tile: 0.8,
  carpet: 0.5, brick: 1.2, plaster: 0.4, fabric: 0.4,
};
const SIZE = 512;

interface Detail {
  map: Texture;
  normal: Texture;
  bump: number;
}
const cache = new Map<string, Detail>();

export function surfaceTag(materialName: string): string {
  const tag = materialName.split('_')[0].toLowerCase();
  return ALIAS[tag] ?? tag;
}

/**
 * Detail colour and normal map for a material name like "grass_field" or "concrete_old", or null.
 * The normal map is the painted tile's brightness read as a height field.
 */
export function detail(materialName: string): Detail | null {
  const key = surfaceTag(materialName);
  const def = PAINTERS[key];
  if (!def) return null;
  let d = cache.get(key);
  if (!d) {
    const n = SIZE;
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    def.paint(ctx, n, rng(key.length * 9973 + key.charCodeAt(0)));
    const map = new CanvasTexture(c);
    map.colorSpace = SRGBColorSpace;
    const normal = new CanvasTexture(heightToNormal(ctx, n));
    for (const t of [map, normal]) {
      t.wrapS = t.wrapT = RepeatWrapping;
      t.anisotropy = 8;
      t.repeat.set(1 / def.size, 1 / def.size);
    }
    d = { map, normal, bump: def.bump ?? BUMP[key] ?? 0.5 };
    cache.set(key, d);
  }
  return d;
}

/** Detail texture only (kept for callers that do not want the normal map). */
export function detailTexture(materialName: string): Texture | null {
  return detail(materialName)?.map ?? null;
}

function heightToNormal(src: CanvasRenderingContext2D, n: number): HTMLCanvasElement {
  const h = src.getImageData(0, 0, n, n).data;
  const out = document.createElement('canvas');
  out.width = out.height = n;
  const octx = out.getContext('2d')!;
  const img = octx.createImageData(n, n);
  const at = (x: number, y: number) => h[(((y + n) % n) * n + ((x + n) % n)) * 4] / 255;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // Sobel gradient, wrapped so the tile stays seamless.
      const dx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const dy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const s = 2.0;
      let nx = -dx * s;
      let ny = dy * s;
      const len = Math.hypot(nx, ny, 1);
      nx /= len;
      ny /= len;
      const i = (y * n + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

let water: Texture | null = null;

/** Rippled water normal map (tiles every 6 m); scroll its offset to animate. */
export function waterNormal(): Texture {
  if (water) return water;
  const n = 256;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.createImageData(n, n);
  const r = rng(77);
  const waves = Array.from({ length: 14 }, () => ({ kx: Math.round((r() - 0.5) * 12), ky: Math.round((r() - 0.5) * 12), p: r() * Math.PI * 2, a: 0.3 + r() }));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let v = 0;
      for (const w of waves) v += w.a * Math.sin(((w.kx * x + w.ky * y) / n) * Math.PI * 2 + w.p);
      const g = Math.floor(128 + v * 18);
      const i = (y * n + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, g));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  water = new CanvasTexture(heightToNormal(ctx, n));
  water.wrapS = water.wrapT = RepeatWrapping;
  water.repeat.set(1 / 6, 1 / 6);
  return water;
}
