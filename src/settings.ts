import type { CameraMode } from './camera/fpvCamera';
import type { GraphicsQuality } from './render/pipeline';
import type { RateProfile } from './drones/specs';
import type { FlightMode } from './fc/flightController';
import { isAndroidApp } from './platform/android';

const KEY = 'flysim.settings.v1';

export interface Settings {
  droneId: string;
  mapId: string;
  flightMode: FlightMode;
  cameraMode: CameraMode;
  /** Per-drone overrides; missing = use the drone's own values. */
  uptilt: Record<string, number>;
  fov: Record<string, number>;
  rates: Record<string, { rollPitch: RateProfile; yaw: RateProfile }>;
  analog: boolean;
  volume: number;
  autoReset: boolean;
  wind: boolean;
  /** Size of the goggle screen in degrees. */
  vrScreenFov: number;
  /** Share of the goggle screen (%) the OSD / HUD use in VR, toward the sharp centre of the lenses. */
  vrOsdArea: number;
  /** Desktop app: show the game in the headset through native OpenXR (FlySimXR.exe). */
  nativeXr: boolean;
  /** On-screen display: "Real FPV" (Betaflight OSD) or "Iron Man style" (helmet HUD). */
  hudStyle: 'helmet' | 'betaflight';
  graphics: GraphicsQuality;
  /** Frame rate limit while flying; 0 = unlimited. */
  fpsCap: number;
  /** Desktop app: wait for the monitor's refresh (no tearing, but capped at its rate). */
  vsync: boolean;
  showFps: boolean;
  /** Show where both sticks are on screen. */
  showSticks: boolean;
  /** Race cars on the F1 and Speedway maps, as % of real race pace. */
  carSpeed: number;
  /** Name other pilots see in multiplayer ('' = not chosen yet). */
  username: string;
  /** Multiplayer chat: messages on screen, T to type. */
  chat: boolean;
  /** Corner mini map while flying: on/off, which corner, how big. */
  miniMap: boolean;
  miniMapCorner: 'tl' | 'tr' | 'bl' | 'br';
  miniMapSize: 'small' | 'medium' | 'large';
  /** Chosen skin per drone id. */
  skins: Record<string, string>;
}

export const DEFAULT_SETTINGS: Settings = {
  droneId: 'freestyle5',
  mapId: 'bando',
  flightMode: 'acro',
  cameraMode: 'fpv',
  uptilt: {},
  fov: {},
  rates: {},
  analog: false,
  volume: 0.5,
  autoReset: true,
  wind: true,
  vrScreenFov: 48,
  vrOsdArea: 78,
  nativeXr: true,
  hudStyle: 'betaflight',
  // Phone GPUs: start lighter; Settings can raise it.
  graphics: isAndroidApp ? 'medium' : 'high',
  fpsCap: 0,
  vsync: false,
  showFps: true,
  showSticks: true,
  carSpeed: 70,
  username: '',
  chat: true,
  miniMap: true,
  miniMapCorner: 'tr',
  miniMapSize: 'medium',
  skins: {},
};

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings last for this session */
  }
}
