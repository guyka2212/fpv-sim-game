import { Quaternion } from 'three';
import type { CameraMode } from '../camera/fpvCamera';

/**
 * A recording is the flight itself, not a video: drone pose, motor speeds, sticks and OSD values
 * sampled 60 times a second. Replays render a clean picture (no breakup when the video link was
 * weak), and the editor can switch the OSD, the camera and the sound afterwards.
 */
export const F = {
  t: 0,
  px: 1,
  py: 2,
  pz: 3,
  qx: 4,
  qy: 5,
  qz: 6,
  qw: 7,
  w0: 8, // motor speeds (rad/s), 4 of them
  thr: 12,
  yaw: 13,
  pitch: 14,
  roll: 15,
  armed: 16,
  mode: 17,
  volt: 18,
  mah: 19,
  flightTime: 20,
  alt: 21,
  crashed: 22,
  cam: 23,
} as const;
export const STRIDE = 24;
export const SAMPLE_HZ = 60;
export const FLIGHT_MODE_IDS = ['acro', 'horizon', 'angle'] as const;
export const MAX_SECONDS = 30 * 60;
/** Other pilots (multiplayer): t, position, rotation, motor speed, 20 times a second. */
export const OSTRIDE = 9;
export const OTHERS_HZ = 20;

export interface OtherTrack {
  id: number;
  name: string;
  drone: string;
  frames: Float32Array;
}

export interface OtherSample {
  id: number;
  name: string;
  drone: string;
  p: { x: number; y: number; z: number };
  q: { x: number; y: number; z: number; w: number };
  w: number;
}

export interface RecordEdits {
  /** Removed parts of the flight, [start, end] in seconds of the raw recording. */
  cuts: [number, number][];
  showOsd: boolean;
  camera: CameraMode;
  motorSound: boolean;
  motorVolume: number;
  music: { name: string; blob: Blob } | null;
  musicVolume: number;
  /** For multiplayer later: show the other pilots' names. */
  playerNames: boolean;
}

export interface RecordMeta {
  id: string;
  name: string;
  mapId: string;
  droneId: string;
  created: number;
  duration: number;
  edits: RecordEdits;
  /** Multiplayer: how many other pilots were recorded. */
  others?: number;
}

export function defaultEdits(camera: CameraMode): RecordEdits {
  return { cuts: [], showOsd: true, camera, motorSound: true, motorVolume: 1, music: null, musicVolume: 0.8, playerNames: true };
}

// ---------------------------------------------------------------- recorder

export class FlightRecorder {
  private buf = new Float32Array(STRIDE * SAMPLE_HZ * 60);
  private n = 0;
  private lastT = -1;
  private t0 = 0;
  private others = new Map<number, { name: string; drone: string; data: number[] }>();
  private lastOtherT = -1;
  active = false;
  mapId = '';
  droneId = '';
  camera: CameraMode = 'fpv';

  start(now: number, mapId: string, droneId: string, camera: CameraMode): void {
    this.n = 0;
    this.lastT = -1;
    this.others.clear();
    this.lastOtherT = -1;
    this.t0 = now;
    this.mapId = mapId;
    this.droneId = droneId;
    this.camera = camera;
    this.active = true;
  }

  /** Seconds recorded so far. */
  elapsed(now: number): number {
    return this.active ? now - this.t0 : 0;
  }

  get full(): boolean {
    return this.lastT >= MAX_SECONDS;
  }

  /** Adds a sample if 1/60 s has passed since the last one. `fill` writes the fields after t. */
  sample(now: number, fill: (row: Float32Array, o: number) => void): void {
    if (!this.active) return;
    const t = now - this.t0;
    if (this.lastT >= 0 && t - this.lastT < 1 / SAMPLE_HZ - 1e-4) return;
    if ((this.n + 1) * STRIDE > this.buf.length) {
      const bigger = new Float32Array(this.buf.length * 2);
      bigger.set(this.buf);
      this.buf = bigger;
    }
    const o = this.n * STRIDE;
    this.buf[o] = t;
    fill(this.buf, o);
    this.n++;
    this.lastT = t;
  }

  /** The other pilots right now (at most 20 times a second). */
  sampleOthers(now: number, list: Iterable<OtherSample>): void {
    if (!this.active) return;
    const t = now - this.t0;
    if (this.lastOtherT >= 0 && t - this.lastOtherT < 1 / OTHERS_HZ - 1e-4) return;
    this.lastOtherT = t;
    for (const o of list) {
      let tr = this.others.get(o.id);
      if (!tr) this.others.set(o.id, (tr = { name: o.name, drone: o.drone, data: [] }));
      tr.drone = o.drone;
      tr.data.push(t, o.p.x, o.p.y, o.p.z, o.q.x, o.q.y, o.q.z, o.q.w, o.w);
    }
  }

  /** Ends the recording; null if it is too short to keep. */
  stop(): { frames: Float32Array; duration: number; others: OtherTrack[] } | null {
    this.active = false;
    if (this.n < SAMPLE_HZ / 2) return null;
    const frames = this.buf.slice(0, this.n * STRIDE);
    const others = [...this.others.entries()]
      .filter(([, o]) => o.data.length >= OSTRIDE * 2)
      .map(([id, o]) => ({ id, name: o.name, drone: o.drone, frames: new Float32Array(o.data) }));
    return { frames, duration: frames[(this.n - 1) * STRIDE], others };
  }
}

// ---------------------------------------------------------------- playback helpers

const _qa = new Quaternion();
const _qb = new Quaternion();

/** Interpolated sample at time t (seconds) into out (STRIDE floats). */
export function sampleAt(frames: Float32Array, t: number, out: Float32Array): Float32Array {
  const n = frames.length / STRIDE;
  let lo = 0;
  let hi = n - 1;
  if (t <= frames[0]) hi = 0;
  else if (t >= frames[(n - 1) * STRIDE]) lo = hi = n - 1;
  else {
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (frames[mid * STRIDE] <= t) lo = mid;
      else hi = mid;
    }
  }
  const a = lo * STRIDE;
  const b = hi * STRIDE;
  const span = frames[b] - frames[a];
  // A jump (reset, teleport) between two samples: don't slide across it.
  const jump = Math.hypot(frames[b + F.px] - frames[a + F.px], frames[b + F.py] - frames[a + F.py], frames[b + F.pz] - frames[a + F.pz]) > 30;
  const k = span > 0 && !jump ? (t - frames[a]) / span : 0;
  for (let i = 0; i < STRIDE; i++) out[i] = frames[a + i] + (frames[b + i] - frames[a + i]) * k;
  // Discrete fields come from the nearer sample; the rotation is slerped.
  const near = k < 0.5 ? a : b;
  for (const f of [F.armed, F.mode, F.crashed, F.cam]) out[f] = frames[near + f];
  _qa.set(frames[a + F.qx], frames[a + F.qy], frames[a + F.qz], frames[a + F.qw]);
  _qb.set(frames[b + F.qx], frames[b + F.qy], frames[b + F.qz], frames[b + F.qw]);
  _qa.slerp(_qb, k);
  out[F.qx] = _qa.x;
  out[F.qy] = _qa.y;
  out[F.qz] = _qa.z;
  out[F.qw] = _qa.w;
  return out;
}

/** Where another pilot was at time t; false if they were not there then. */
export function otherAt(f: Float32Array, t: number, out: Float32Array): boolean {
  const n = f.length / OSTRIDE;
  if (!n || t < f[0] - 0.1 || t > f[(n - 1) * OSTRIDE] + 0.1) return false;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (f[mid * OSTRIDE] <= t) lo = mid;
    else hi = mid;
  }
  const a = lo * OSTRIDE;
  const b = hi * OSTRIDE;
  // A gap means they left (or the round ended) in between.
  if (f[b] - f[a] > 1) return false;
  const k = f[b] > f[a] ? Math.min(1, Math.max(0, (t - f[a]) / (f[b] - f[a]))) : 0;
  for (let i = 0; i < OSTRIDE; i++) out[i] = f[a + i] + (f[b + i] - f[a + i]) * k;
  _qa.set(f[a + 4], f[a + 5], f[a + 6], f[a + 7]);
  _qb.set(f[b + 4], f[b + 5], f[b + 6], f[b + 7]);
  _qa.slerp(_qb, k);
  out[4] = _qa.x;
  out[5] = _qa.y;
  out[6] = _qa.z;
  out[7] = _qa.w;
  return true;
}

/** Cuts merged, sorted and clipped to the recording. */
export function normalizeCuts(cuts: [number, number][], duration: number): [number, number][] {
  const c = cuts
    .map(([a, b]) => [Math.max(0, Math.min(a, b)), Math.min(duration, Math.max(a, b))] as [number, number])
    .filter(([a, b]) => b - a > 0.05)
    .sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const cut of c) {
    const last = out[out.length - 1];
    if (last && cut[0] <= last[1]) last[1] = Math.max(last[1], cut[1]);
    else out.push([cut[0], cut[1]]);
  }
  return out;
}

/** Length after the cuts. */
export function editedDuration(duration: number, cuts: [number, number][]): number {
  return duration - normalizeCuts(cuts, duration).reduce((s, [a, b]) => s + b - a, 0);
}

/** Raw time -> time in the edited video. */
export function toEdited(t: number, cuts: [number, number][]): number {
  let e = t;
  for (const [a, b] of cuts) {
    if (t >= b) e -= b - a;
    else if (t > a) e -= t - a;
  }
  return e;
}

/** If t is inside a cut, the end of that cut; else t. */
export function skipCuts(t: number, cuts: [number, number][]): number {
  for (const [a, b] of cuts) if (t >= a && t < b) return b;
  return t;
}

/** First moment of the recording that is not cut. */
export function firstKept(cuts: [number, number][]): number {
  return skipCuts(0, cuts);
}

export function formatClock(s: number): string {
  s = Math.max(0, s);
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec.toFixed(1)}`;
}

// ---------------------------------------------------------------- storage (IndexedDB)

const DB = 'flysim-records';
let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore('meta', { keyPath: 'id' });
        d.createObjectStore('frames');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(stores: string[], mode: IDBTransactionMode, work: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(stores, mode);
        const req = work(t);
        t.oncomplete = () => resolve(req ? req.result : (undefined as T));
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export const records = {
  async list(): Promise<RecordMeta[]> {
    const all = await tx<RecordMeta[]>(['meta'], 'readonly', (t) => t.objectStore('meta').getAll());
    return all.sort((a, b) => b.created - a.created);
  },
  async frames(id: string): Promise<Float32Array> {
    const buf = await tx<ArrayBuffer>(['frames'], 'readonly', (t) => t.objectStore('frames').get(id));
    return new Float32Array(buf);
  },
  async add(meta: RecordMeta, frames: Float32Array, others: OtherTrack[] = []): Promise<void> {
    await tx(['meta', 'frames'], 'readwrite', (t) => {
      t.objectStore('meta').put(meta);
      t.objectStore('frames').put(frames.buffer.slice(frames.byteOffset, frames.byteOffset + frames.byteLength), meta.id);
      if (others.length) {
        t.objectStore('frames').put(
          others.map((o) => ({ id: o.id, name: o.name, drone: o.drone, buf: o.frames.buffer.slice(0) })),
          meta.id + '#others',
        );
      }
    });
  },
  async others(id: string): Promise<OtherTrack[]> {
    const v = await tx<{ id: number; name: string; drone: string; buf: ArrayBuffer }[] | undefined>(['frames'], 'readonly', (t) => t.objectStore('frames').get(id + '#others'));
    return (v ?? []).map((o) => ({ id: o.id, name: o.name, drone: o.drone, frames: new Float32Array(o.buf) }));
  },
  async save(meta: RecordMeta): Promise<void> {
    await tx(['meta'], 'readwrite', (t) => {
      t.objectStore('meta').put(meta);
    });
  },
  async remove(id: string): Promise<void> {
    await tx(['meta', 'frames'], 'readwrite', (t) => {
      t.objectStore('meta').delete(id);
      t.objectStore('frames').delete(id);
      t.objectStore('frames').delete(id + '#others');
    });
  },
};
