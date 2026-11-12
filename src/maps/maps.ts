import type { TrafficDef } from './traffic';

export type GateShape = { kind: 'square'; half: number } | { kind: 'round'; radius: number };

export interface MapDef {
  id: string;
  name: string;
  description: string;
  file: string;
  /** Drone this map was built for. */
  forDrone: string;
  indoor: boolean;
  /** Sun elevation/azimuth in degrees. */
  sun: { elevation: number; azimuth: number; intensity: number };
  fog: { color: number; near: number; far: number };
  cameraFar: number;
  /** Steady wind (m/s, world x/z) and gust strength. */
  wind: { x: number; z: number; gust: number };
  gate?: GateShape;
  /** Video link range in metres before the picture breaks up. */
  videoRange: number;
  /** Race cars lapping the map. */
  traffic?: TrafficDef;
}

export const MAPS: MapDef[] = [
  {
    id: 'bando',
    name: 'The Bando',
    description: 'Abandoned three-storey concrete shell, skate park, stacked containers and a water tower. Gaps, dives and power loops.',
    file: '/models/maps/bando.glb',
    forDrone: 'freestyle5',
    indoor: false,
    sun: { elevation: 38, azimuth: 140, intensity: 2.6 },
    fog: { color: 0xc9d3dc, near: 120, far: 520 },
    cameraFar: 900,
    wind: { x: 1.5, z: -0.8, gust: 1.2 },
    videoRange: 900,
  },
  {
    id: 'racetrack',
    name: 'Race Field',
    description: 'MultiGP-style track: 12 gates with a dive gate, a ladder and hurdles. Timed laps, best lap saved.',
    file: '/models/maps/racetrack.glb',
    forDrone: 'racer5',
    indoor: false,
    sun: { elevation: 52, azimuth: 200, intensity: 2.8 },
    fog: { color: 0xcfe0ee, near: 150, far: 600 },
    cameraFar: 900,
    wind: { x: 0.8, z: 0.4, gust: 0.8 },
    gate: { kind: 'square', half: 0.8 },
    videoRange: 700,
  },
  {
    id: 'house',
    name: 'The House',
    description: 'Furnished house at real scale: living room, kitchen, hallway, bedroom, office. Six hoops make a whoop race line.',
    file: '/models/maps/house.glb',
    forDrone: 'tinywhoop',
    indoor: true,
    sun: { elevation: 30, azimuth: 120, intensity: 2.2 },
    fog: { color: 0xdfe8ef, near: 60, far: 220 },
    cameraFar: 300,
    wind: { x: 0, z: 0, gust: 0 },
    gate: { kind: 'round', radius: 0.31 },
    videoRange: 60,
  },
  {
    id: 'town',
    name: 'Old Town',
    description: 'Streets, a church with an open bell tower, a park with a pond and parked cars. Smooth cinematic lines.',
    file: '/models/maps/town.glb',
    forDrone: 'cinewhoop3',
    indoor: false,
    sun: { elevation: 24, azimuth: 250, intensity: 2.5 },
    fog: { color: 0xe6d9c8, near: 140, far: 520 },
    cameraFar: 900,
    wind: { x: -0.6, z: 1.0, gust: 0.8 },
    videoRange: 500,
  },
  {
    id: 'mountains',
    name: 'Alpine Valley',
    description: '1.8 km valley with a lake, pine forest, rock arches and snowy ridges. Long-range cruising and mountain surfing.',
    file: '/models/maps/mountains.glb',
    forDrone: 'longrange7',
    indoor: false,
    sun: { elevation: 34, azimuth: 160, intensity: 3.0 },
    fog: { color: 0xb8cbe0, near: 400, far: 2200 },
    cameraFar: 3200,
    wind: { x: 3.0, z: 1.5, gust: 2.5 },
    videoRange: 2500,
  },
  {
    id: 'mall',
    name: 'Skylight Mall',
    description: 'Three-storey mall open to the sky: a 112 m atrium with sky bridges and palm courts, and a round Dome Court whose roof is a giant open lattice ball you can fly straight through.',
    file: '/models/maps/mall.glb',
    forDrone: 'freestyle5',
    indoor: false,
    sun: { elevation: 62, azimuth: 160, intensity: 2.7 },
    fog: { color: 0xd6dde4, near: 160, far: 560 },
    cameraFar: 900,
    wind: { x: 0.6, z: -0.3, gust: 0.4 },
    videoRange: 700,
  },
  {
    id: 'f1',
    name: 'Grand Prix Circuit',
    description: '2.1 km road course with F1 cars racing laps. Chase them down the straight, through the esses and under the bridge.',
    file: '/models/maps/f1.glb',
    forDrone: 'racer5',
    indoor: false,
    sun: { elevation: 46, azimuth: 210, intensity: 2.9 },
    fog: { color: 0xcadbe8, near: 300, far: 1300 },
    cameraFar: 1800,
    wind: { x: 1.0, z: 0.5, gust: 0.9 },
    videoRange: 1400,
    traffic: {
      model: '/models/cars/f1car.glb',
      track: '/models/maps/f1.track.json',
      count: 10,
      topSpeed: 88,
      grip: 38,
      brake: 45,
      accel: 14,
      lanes: [-3.2, 0, 3.2],
      half: [1.0, 0.5, 2.85],
      wheelRadius: 0.35,
      liveries: [
        [0xd40000, 0xffd800],
        [0x0b1e4b, 0xe10600],
        [0x00a19b, 0xc8ccce],
        [0xff8000, 0x1a1a1a],
        [0x006f62, 0xcedc00],
        [0xf5f5f5, 0xe00000],
        [0x2253d6, 0xff1f8e],
        [0x1e41ff, 0xffffff],
        [0x37bedd, 0x111111],
        [0x6c0000, 0xffffff],
      ],
      engineHz: 620,
      gears: 8,
    },
  },
  {
    id: 'oval',
    name: 'Speedway',
    description: '1.7 km banked oval with a pack of stock cars drafting at full throttle. Hang off the bumper into turn one.',
    file: '/models/maps/oval.glb',
    forDrone: 'longrange7',
    indoor: false,
    sun: { elevation: 40, azimuth: 120, intensity: 2.9 },
    fog: { color: 0xcfdbe6, near: 350, far: 1500 },
    cameraFar: 2000,
    wind: { x: 1.5, z: -1.0, gust: 1.2 },
    videoRange: 1400,
    traffic: {
      model: '/models/cars/stockcar.glb',
      track: '/models/maps/oval.track.json',
      count: 16,
      topSpeed: 82,
      grip: 24,
      brake: 14,
      accel: 8,
      lanes: [-5, -1.5, 2, 5.5],
      half: [1.0, 0.68, 2.55],
      wheelRadius: 0.34,
      liveries: [
        [0xffd200, 0x111111],
        [0xe2231a, 0xffffff],
        [0x0047bb, 0xffd200],
        [0x111111, 0xe2231a],
        [0x00953b, 0xffffff],
        [0xff6a00, 0x0047bb],
        [0xffffff, 0x0047bb],
        [0x7a1fa2, 0xffd200],
      ],
      engineHz: 420,
      gears: 4,
    },
  },
  {
    id: 'lake',
    name: 'Crystal Lake',
    description: 'Summer lake in forested hills: an island lighthouse, a long pier, a boathouse open at both ends, sailboats, a diving tower and a stone arch bridge. Skim the water and thread the gaps.',
    file: '/models/maps/lake.glb',
    forDrone: 'freestyle5',
    indoor: false,
    sun: { elevation: 36, azimuth: 200, intensity: 2.8 },
    fog: { color: 0xc8d8e4, near: 200, far: 900 },
    cameraFar: 1300,
    wind: { x: 1.2, z: -0.6, gust: 1.0 },
    videoRange: 900,
  },
  {
    id: 'hollywood',
    name: 'Hollywood Hills',
    description: 'Palm-lined boulevard with a walk of stars, a movie palace you can fly into, a round tower and sound stages open at both ends. Up in the dry hills: the giant sign, cliff houses with pools and the observatory.',
    file: '/models/maps/hollywood.glb',
    forDrone: 'freestyle5',
    indoor: false,
    sun: { elevation: 34, azimuth: 235, intensity: 2.9 },
    fog: { color: 0xe0d2bc, near: 200, far: 900 },
    cameraFar: 1300,
    wind: { x: 0.8, z: 0.3, gust: 0.7 },
    videoRange: 1000,
  },
  {
    id: 'paris',
    name: 'Paris',
    description: 'A 200 m iron lattice tower to dive between the legs of and weave through, the Seine with arch bridges to fly under, the triumphal arch on its star roundabout, Haussmann boulevards and a glass pyramid.',
    file: '/models/maps/paris.glb',
    forDrone: 'freestyle5',
    indoor: false,
    sun: { elevation: 40, azimuth: 150, intensity: 2.7 },
    fog: { color: 0xd5dbe2, near: 220, far: 1000 },
    cameraFar: 1400,
    wind: { x: 1.0, z: 0.6, gust: 0.9 },
    videoRange: 1100,
  },
  {
    id: 'stadium',
    name: 'Stadium',
    description: 'Empty football stadium: dive the stands, thread the slot between the two tiers and out under the upper deck, and through the gap under the ring roof. Giant screens and floodlights.',
    file: '/models/maps/stadium.glb',
    forDrone: 'freestyle5',
    indoor: false,
    sun: { elevation: 50, azimuth: 210, intensity: 2.8 },
    fog: { color: 0xd0dce6, near: 200, far: 800 },
    cameraFar: 1100,
    wind: { x: 0.6, z: 0.3, gust: 0.6 },
    videoRange: 900,
  },
];

/**
 * A named teleport spot on the map view. x / y are the Blender map coordinates (x east,
 * y north); the height is found by dropping onto whatever is there. yaw in degrees, 0 = north.
 */
export interface Spot {
  name: string;
  x: number;
  y: number;
  yaw?: number;
}

/** Teleport spots per map (the start point is always offered too). */
export const SPOTS: Record<string, Spot[]> = {
  bando: [{ name: 'Skate park', x: -35, y: -25, yaw: 20 }],
  town: [
    { name: 'Church tower', x: 30, y: -24, yaw: 0 },
    { name: 'Park pond', x: -30, y: 8, yaw: 0 },
  ],
  mountains: [
    { name: 'Lake jetty', x: -185, y: 84, yaw: -90 },
    { name: 'Rock arch east', x: 300, y: -60, yaw: 0 },
    { name: 'Rock arch north', x: 100, y: 360, yaw: 0 },
    { name: 'Rock arch west', x: -540, y: 110, yaw: 0 },
  ],
  mall: [
    { name: 'Atrium', x: 0, y: -2, yaw: -90 },
    { name: 'Dome Court', x: 110, y: -2, yaw: -90 },
  ],
  lake: [
    { name: 'Lighthouse island', x: 76, y: 44, yaw: 0 },
    { name: 'Diving tower', x: -90, y: -70, yaw: 0 },
    { name: 'Stone bridge', x: 330, y: 14, yaw: 90 },
  ],
  hollywood: [
    { name: 'Movie palace', x: -46, y: 13, yaw: 0 },
    { name: 'Hillside sign', x: 0, y: 228, yaw: 0 },
    { name: 'Observatory', x: 210, y: 268, yaw: 180 },
    { name: 'Sound stages', x: -215, y: -112, yaw: 180 },
  ],
  paris: [
    { name: 'Seine bridge', x: 0, y: -40, yaw: 90 },
    { name: 'Triumphal arch', x: 0, y: 272, yaw: 0 },
    { name: 'Glass pyramid', x: 240, y: 38, yaw: 0 },
    { name: 'Tower top deck', x: 0, y: -186, yaw: 0 },
  ],
  stadium: [
    { name: 'Roof', x: 0, y: 80, yaw: 180 },
    { name: 'Car park', x: 0, y: -125, yaw: 0 },
  ],
};

export function getMap(id: string): MapDef {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}
