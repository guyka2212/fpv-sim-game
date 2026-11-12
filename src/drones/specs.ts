import catalog from './catalog.json';
// Drone definitions. All units SI (kg, m, s, A, V) unless the name says otherwise.
// Body frame (matches three.js and the exported GLB): +x right, +y up, -z forward.

export type Chemistry = 'lipo' | 'liion';

export interface RateProfile {
  center: number; // deg/s at stick center (Actual rates "center sensitivity")
  max: number; // deg/s at full stick
  expo: number; // 0..1
}

export interface DroneSpec {
  id: string;
  name: string;
  className: string;
  description: string;
  model: string;
  defaultMap: string;

  mass: number;
  inertia: [number, number, number]; // Ixx (pitch), Iyy (yaw), Izz (roll)
  /** Half-distances of the motor layout: motors sit at (±armX, 0, ±armZ). */
  armX: number;
  armZ: number;
  propsOut: boolean;
  ducted: boolean;

  twRatio: number; // static thrust-to-weight at nominal voltage
  motor: {
    kv: number;
    tau: number; // spool-up time constant (s)
    peakAmps: number; // per-motor burst current, sets how hard it can spin the prop up
    label: string; // e.g. "2207 1850KV"
  };
  prop: {
    diameterIn: number;
    pitchIn: number;
    blades: number;
  };
  battery: {
    cells: number;
    chemistry: Chemistry;
    capacityMah: number;
    rInternal: number; // whole pack, ohms
    maxCurrent: number; // burst draw at full throttle, all motors (A)
    label: string;
  };
  /** Body-axis drag areas Cd*A (m^2) for x (side), y (top), z (front). */
  cdA: [number, number, number];

  camera: {
    uptiltDeg: number;
    fovDeg: number; // horizontal
    pos: [number, number, number];
  };
  rates: { rollPitch: RateProfile; yaw: RateProfile };

  collisionRadius: number;
  /** Lowest point of the model below the frame (batteries slung underneath). */
  bottomY?: number;
  /** Impact speed (m/s, along the contact normal) that breaks the quad. */
  crashSpeed: number;
  restitution: number;
}

export const DRONES: DroneSpec[] = [
  {
    id: 'freestyle5',
    name: 'Freestyle 5"',
    className: '5" Freestyle',
    description:
      'The classic. True-X 225 mm carbon frame, 2207 motors on 6S, 5.1" tri-blades and a digital HD air unit. Punchy, precise, built for gaps, dives and power loops.',
    model: '/models/drones/freestyle5.glb',
    defaultMap: 'bando',
    mass: 0.65,
    inertia: [0.0022, 0.0035, 0.0017],
    armX: 0.0795,
    armZ: 0.0795,
    propsOut: true,
    ducted: false,
    twRatio: 10,
    motor: { kv: 1850, tau: 0.028, peakAmps: 45, label: '2207 1850KV' },
    prop: { diameterIn: 5.1, pitchIn: 4.3, blades: 3 },
    battery: { cells: 6, chemistry: 'lipo', capacityMah: 1100, rInternal: 0.035, maxCurrent: 140, label: '6S 1100mAh LiPo' },
    cdA: [0.012, 0.024, 0.009],
    camera: { uptiltDeg: 30, fovDeg: 118, pos: [0, 0.012, -0.06] },
    rates: {
      rollPitch: { center: 70, max: 670, expo: 0.54 },
      yaw: { center: 70, max: 520, expo: 0.4 },
    },
    collisionRadius: 0.15,
    crashSpeed: 9,
    restitution: 0.25,
  },
  {
    id: 'racer5',
    name: 'Racer 5"',
    className: '5" Racer',
    description:
      'Low-profile race frame with thin arms, 2306 motors and a light 6S pack. Around 13:1 thrust-to-weight, steep camera angle, made for MultiGP gates.',
    model: '/models/drones/racer5.glb',
    defaultMap: 'racetrack',
    mass: 0.48,
    inertia: [0.0014, 0.0024, 0.0011],
    armX: 0.0778,
    armZ: 0.0778,
    propsOut: false,
    ducted: false,
    twRatio: 13,
    motor: { kv: 1950, tau: 0.024, peakAmps: 50, label: '2306 1950KV' },
    prop: { diameterIn: 5.0, pitchIn: 4.8, blades: 3 },
    battery: { cells: 6, chemistry: 'lipo', capacityMah: 1000, rInternal: 0.032, maxCurrent: 160, label: '6S 1000mAh LiPo' },
    cdA: [0.009, 0.02, 0.0065],
    camera: { uptiltDeg: 42, fovDeg: 120, pos: [0, 0.01, -0.055] },
    rates: {
      rollPitch: { center: 100, max: 750, expo: 0.3 },
      yaw: { center: 90, max: 550, expo: 0.3 },
    },
    collisionRadius: 0.15,
    crashSpeed: 8,
    restitution: 0.25,
  },
  {
    id: 'tinywhoop',
    name: 'Tiny Whoop 65',
    className: 'Tiny Whoop',
    description:
      '65 mm ducted 1S micro with 0802 motors and 31 mm four-blade props. Weighs about as much as a few coins and bounces off walls. Fly it around the house.',
    model: '/models/drones/tinywhoop.glb',
    defaultMap: 'house',
    mass: 0.028,
    inertia: [1.1e-5, 1.9e-5, 1.0e-5],
    armX: 0.023,
    armZ: 0.023,
    propsOut: false,
    ducted: true,
    twRatio: 3.6,
    motor: { kv: 19000, tau: 0.02, peakAmps: 4.5, label: '0802 19000KV' },
    prop: { diameterIn: 1.22, pitchIn: 0.9, blades: 4 },
    battery: { cells: 1, chemistry: 'lipo', capacityMah: 300, rInternal: 0.07, maxCurrent: 12, label: '1S 300mAh LiPo' },
    cdA: [0.0011, 0.0035, 0.0011],
    camera: { uptiltDeg: 12, fovDeg: 120, pos: [0, 0.024, -0.036] },
    rates: {
      rollPitch: { center: 80, max: 800, expo: 0.5 },
      yaw: { center: 80, max: 600, expo: 0.4 },
    },
    collisionRadius: 0.042,
    bottomY: -0.009,
    crashSpeed: 999,
    restitution: 0.45,
  },
  {
    id: 'cinewhoop3',
    name: 'Cinewhoop 3"',
    className: '3" Cinewhoop',
    description:
      '3" ducted cinewhoop carrying a GoPro. Heavy, smooth and safe around people and buildings. Low rates, gentle moves, cinematic shots.',
    model: '/models/drones/cinewhoop3.glb',
    defaultMap: 'town',
    mass: 0.4,
    inertia: [0.0012, 0.0019, 0.0011],
    armX: 0.0495,
    armZ: 0.0495,
    propsOut: false,
    ducted: true,
    twRatio: 5,
    motor: { kv: 2850, tau: 0.03, peakAmps: 25, label: '1506 2850KV' },
    prop: { diameterIn: 3.0, pitchIn: 2.5, blades: 5 },
    battery: { cells: 6, chemistry: 'lipo', capacityMah: 660, rInternal: 0.06, maxCurrent: 70, label: '6S 660mAh LiPo' },
    cdA: [0.016, 0.04, 0.016],
    camera: { uptiltDeg: 15, fovDeg: 110, pos: [0, 0.034, -0.088] },
    rates: {
      rollPitch: { center: 50, max: 420, expo: 0.5 },
      yaw: { center: 50, max: 300, expo: 0.5 },
    },
    collisionRadius: 0.1,
    crashSpeed: 10,
    restitution: 0.35,
  },
  {
    id: 'longrange7',
    name: 'Long Range 7"',
    className: '7" Long Range',
    description:
      '315 mm long-range cruiser with 2807 1300KV motors, 7" bi-blades, a 6S Li-ion pack and GPS. Efficient and stable for mountain surfing and big distances.',
    model: '/models/drones/longrange7.glb',
    defaultMap: 'mountains',
    mass: 0.95,
    inertia: [0.0055, 0.0095, 0.0045],
    armX: 0.1114,
    armZ: 0.1114,
    propsOut: true,
    ducted: false,
    twRatio: 6,
    motor: { kv: 1300, tau: 0.045, peakAmps: 40, label: '2807 1300KV' },
    prop: { diameterIn: 7.0, pitchIn: 3.5, blades: 2 },
    battery: { cells: 6, chemistry: 'liion', capacityMah: 4000, rInternal: 0.12, maxCurrent: 45, label: '6S 4000mAh Li-ion' },
    cdA: [0.016, 0.034, 0.012],
    camera: { uptiltDeg: 22, fovDeg: 112, pos: [0, 0.015, -0.07] },
    rates: {
      rollPitch: { center: 50, max: 520, expo: 0.5 },
      yaw: { center: 50, max: 380, expo: 0.45 },
    },
    collisionRadius: 0.2,
    bottomY: -0.047,
    crashSpeed: 7,
    restitution: 0.2,
  },
];

// ---------------------------------------------------------------- Flight Path drones

/** One drone of src/drones/catalog.json (also read by blender/drones/catalog.py for its model). */
interface CatalogDrone {
  id: string;
  name: string;
  family: 'whoop' | 'cinewhoop' | 'toothpick' | 'freestyle' | 'racer' | 'longrange' | 'cinelifter';
  className: string;
  description: string;
  map: string;
  /** Pilot level that unlocks it on the Flight Path. */
  level: number;
  armMm: number;
  propIn: number;
  pitchIn: number;
  blades: number;
  mass: number;
  kv: number;
  motor: string;
  stator: [number, number];
  /** Per-motor burst current when the stator-size estimate doesn't fit (heavy props on tiny motors). */
  amps?: number;
  cells: number;
  mAh: number;
  chem: Chemistry;
  tw: number;
  uptilt: number;
  fov: number;
  rates: keyof typeof RATE_PRESETS;
}

const RATE_PRESETS = {
  whoop: { rollPitch: { center: 80, max: 800, expo: 0.5 }, yaw: { center: 80, max: 600, expo: 0.4 } },
  cine: { rollPitch: { center: 50, max: 420, expo: 0.5 }, yaw: { center: 50, max: 300, expo: 0.5 } },
  freestyle: { rollPitch: { center: 70, max: 670, expo: 0.54 }, yaw: { center: 70, max: 520, expo: 0.4 } },
  racer: { rollPitch: { center: 100, max: 750, expo: 0.3 }, yaw: { center: 90, max: 550, expo: 0.3 } },
  lr: { rollPitch: { center: 50, max: 520, expo: 0.5 }, yaw: { center: 50, max: 380, expo: 0.45 } },
};

/**
 * Physics spec from the catalog's real-world numbers, scaled from the hand-tuned starter drones:
 * inertia from mass and arm length, drag from frame size, battery sag and current from the pack.
 */
function fromCatalog(c: CatalogDrone): DroneSpec {
  const arm = c.armMm / 1000;
  const ducted = c.family === 'whoop' || c.family === 'cinewhoop';
  const s = arm / 0.0795; // relative to the Freestyle 5"
  const propR = (c.propIn * 0.0254) / 2;
  // Burst current grows with stator volume: 0802 ~4.5 A, 2207 ~45 A (fits the starter drones).
  const statorVol = c.stator[0] * c.stator[0] * c.stator[1];
  const lipo = c.chem === 'lipo';
  return {
    id: c.id,
    name: c.name,
    className: c.className,
    description: c.description,
    model: `/models/drones/${c.id}.glb`,
    defaultMap: c.map,
    mass: c.mass,
    inertia: [0.52 * c.mass * arm * arm, 0.85 * c.mass * arm * arm, 0.42 * c.mass * arm * arm],
    armX: arm,
    armZ: arm,
    propsOut: c.family === 'freestyle' || c.family === 'longrange' || c.family === 'toothpick',
    ducted,
    twRatio: c.tw,
    motor: { kv: c.kv, tau: Math.max(0.02, 0.014 + c.propIn * 0.0028), peakAmps: c.amps ?? 0.15 * Math.pow(statorVol, 0.7), label: c.motor },
    prop: { diameterIn: c.propIn, pitchIn: c.pitchIn, blades: c.blades },
    battery: {
      cells: c.cells,
      chemistry: c.chem,
      capacityMah: c.mAh,
      rInternal: (lipo ? 0.0065 : 0.02) * c.cells * Math.pow(1000 / c.mAh, 0.8),
      maxCurrent: (c.mAh / 1000) * (lipo ? 120 : 12),
      label: `${c.cells}S ${c.mAh}mAh ${lipo ? 'LiPo' : 'Li-ion'}`,
    },
    cdA: [0.012 * s * s * (ducted ? 1.4 : 1), 0.024 * s * s * (ducted ? 1.6 : 1), 0.009 * s * s * (ducted ? 1.5 : 1)],
    camera: { uptiltDeg: c.uptilt, fovDeg: c.fov, pos: [0, Math.max(0.008, 0.012 * s), -Math.max(0.02, 0.75 * arm)] },
    rates: structuredClone(RATE_PRESETS[c.rates]),
    collisionRadius: arm * 1.41 + propR * (ducted ? 1.1 : 0.6),
    bottomY: c.family === 'longrange' ? -0.03 * s : c.family === 'cinelifter' ? -0.12 : undefined,
    crashSpeed: c.family === 'whoop' ? 999 : c.mass < 0.2 ? 11 : c.mass > 1.5 ? 6.5 : 8.5,
    restitution: c.family === 'whoop' ? 0.45 : ducted ? 0.35 : 0.25,
  };
}

/** The five drones everyone has; the rest unlock on the Flight Path. */
export const STARTER_DRONES = DRONES.map((d) => d.id);
/** Pilot level that unlocks each Flight Path drone. */
export const DRONE_UNLOCK_LEVEL: Record<string, number> = {};
for (const c of catalog as unknown as CatalogDrone[]) {
  DRONES.push(fromCatalog(c));
  DRONE_UNLOCK_LEVEL[c.id] = c.level;
}

export function getDrone(id: string): DroneSpec {
  return DRONES.find((d) => d.id === id) ?? DRONES[0];
}

/** Motor positions in body frame, Betaflight order: RR, FR, RL, FL. */
export function motorLayout(spec: DroneSpec): { x: number; z: number; cw: boolean; name: string }[] {
  // Betaflight default (props in): RR CW, FR CCW, RL CCW, FL CW. Props out flips every motor.
  const flip = spec.propsOut;
  return [
    { x: spec.armX, z: spec.armZ, cw: !flip, name: 'RR' },
    { x: spec.armX, z: -spec.armZ, cw: flip, name: 'FR' },
    { x: -spec.armX, z: spec.armZ, cw: flip, name: 'RL' },
    { x: -spec.armX, z: -spec.armZ, cw: !flip, name: 'FL' },
  ];
}
