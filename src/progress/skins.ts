/**
 * Skins recolour a drone's parts at runtime: motor bells, props, the TPU printed parts, the
 * battery, the ducts and (for the special finishes) the carbon frame. Every skin fits every drone.
 */
export type SkinPart = 'bell' | 'prop' | 'tpu' | 'battery' | 'duct' | 'carbon';

export interface Skin {
  id: string;
  name: string;
  /** Pilot level that unlocks it on the Flight Path (0 = everyone has it). */
  level: number;
  colors: Partial<Record<SkinPart, [number, number, number]>>;
  /** Polished metal bells, props and frame. */
  metal?: boolean;
  /** Props and ducts glow in the dark. */
  glow?: boolean;
}

export const SKINS: Skin[] = [
  { id: 'stock', name: 'Stock', level: 0, colors: {} },
  { id: 'midnight', name: 'Midnight', level: 1, colors: { bell: [0.05, 0.05, 0.06], prop: [0.08, 0.08, 0.1], tpu: [0.1, 0.1, 0.12], battery: [0.06, 0.06, 0.07], duct: [0.06, 0.06, 0.07] } },
  { id: 'toxic', name: 'Toxic', level: 2, colors: { bell: [0.35, 1.0, 0.1], prop: [0.35, 1.0, 0.1], tpu: [0.05, 0.05, 0.05], battery: [0.35, 1.0, 0.1], duct: [0.35, 1.0, 0.1] } },
  { id: 'sunset', name: 'Sunset', level: 3, colors: { bell: [1.0, 0.45, 0.05], prop: [1.0, 0.2, 0.35], tpu: [1.0, 0.6, 0.1], battery: [0.55, 0.1, 0.45], duct: [1.0, 0.35, 0.2] } },
  { id: 'ice', name: 'Ice', level: 5, colors: { bell: [0.75, 0.9, 1.0], prop: [0.85, 0.95, 1.0], tpu: [0.4, 0.75, 1.0], battery: [0.95, 0.97, 1.0], duct: [0.6, 0.85, 1.0] } },
  { id: 'racing-red', name: 'Racing Red', level: 7, colors: { bell: [0.85, 0.03, 0.05], prop: [0.95, 0.95, 0.95], tpu: [0.85, 0.03, 0.05], battery: [0.85, 0.03, 0.05], duct: [0.85, 0.03, 0.05] } },
  { id: 'ocean', name: 'Ocean', level: 8, colors: { bell: [0.02, 0.3, 0.6], prop: [0.05, 0.75, 0.85], tpu: [0.02, 0.45, 0.7], battery: [0.02, 0.2, 0.4], duct: [0.05, 0.55, 0.75] } },
  { id: 'bumblebee', name: 'Bumblebee', level: 10, colors: { bell: [0.05, 0.05, 0.05], prop: [1.0, 0.8, 0.05], tpu: [1.0, 0.8, 0.05], battery: [0.05, 0.05, 0.05], duct: [1.0, 0.8, 0.05] } },
  { id: 'camo', name: 'Field Camo', level: 13, colors: { bell: [0.28, 0.32, 0.18], prop: [0.42, 0.38, 0.25], tpu: [0.2, 0.25, 0.12], battery: [0.3, 0.27, 0.18], duct: [0.28, 0.32, 0.18] } },
  { id: 'neon-pink', name: 'Neon Pink', level: 18, colors: { bell: [1.0, 0.1, 0.6], prop: [1.0, 0.3, 0.8], tpu: [1.0, 0.1, 0.6], battery: [0.1, 0.05, 0.1], duct: [1.0, 0.1, 0.6] }, glow: true },
  { id: 'lava', name: 'Lava', level: 20, colors: { bell: [0.1, 0.03, 0.02], prop: [1.0, 0.25, 0.02], tpu: [0.9, 0.15, 0.02], battery: [0.12, 0.04, 0.02], duct: [1.0, 0.3, 0.02] }, glow: true },
  { id: 'arctic', name: 'Arctic', level: 22, colors: { bell: [0.95, 0.95, 0.97], prop: [0.95, 0.95, 0.97], tpu: [0.95, 0.95, 0.97], battery: [0.95, 0.95, 0.97], duct: [0.95, 0.95, 0.97], carbon: [0.85, 0.86, 0.88] } },
  { id: 'cyber', name: 'Cyber', level: 25, colors: { bell: [0.05, 0.95, 1.0], prop: [1.0, 0.1, 0.9], tpu: [0.05, 0.95, 1.0], battery: [0.08, 0.05, 0.15], duct: [1.0, 0.1, 0.9] }, glow: true },
  { id: 'galaxy', name: 'Galaxy', level: 29, colors: { bell: [0.35, 0.1, 0.75], prop: [0.55, 0.25, 1.0], tpu: [0.2, 0.05, 0.45], battery: [0.1, 0.03, 0.25], duct: [0.35, 0.1, 0.75], carbon: [0.12, 0.05, 0.25] } },
  { id: 'chrome', name: 'Chrome', level: 32, colors: { bell: [0.92, 0.92, 0.95], prop: [0.85, 0.86, 0.9], tpu: [0.8, 0.82, 0.86], battery: [0.75, 0.76, 0.8], duct: [0.85, 0.86, 0.9], carbon: [0.7, 0.72, 0.76] }, metal: true },
  { id: 'emerald', name: 'Emerald', level: 35, colors: { bell: [0.02, 0.6, 0.3], prop: [0.1, 0.85, 0.45], tpu: [0.02, 0.45, 0.22], battery: [0.02, 0.3, 0.15], duct: [0.02, 0.6, 0.3], carbon: [0.02, 0.25, 0.12] }, metal: true },
  { id: 'ghost', name: 'Ghost', level: 38, colors: { bell: [0.9, 0.95, 1.0], prop: [0.85, 0.95, 1.0], tpu: [0.7, 0.85, 1.0], battery: [0.9, 0.95, 1.0], duct: [0.75, 0.9, 1.0], carbon: [0.6, 0.7, 0.8] }, glow: true },
  { id: 'gold', name: 'Gold Rush', level: 43, colors: { bell: [1.0, 0.76, 0.2], prop: [1.0, 0.76, 0.2], tpu: [0.08, 0.08, 0.08], battery: [1.0, 0.76, 0.2], duct: [1.0, 0.76, 0.2], carbon: [0.85, 0.62, 0.15] }, metal: true },
  { id: 'diamond', name: 'Diamond', level: 47, colors: { bell: [0.75, 0.95, 1.0], prop: [0.85, 1.0, 1.0], tpu: [0.6, 0.9, 1.0], battery: [0.85, 0.95, 1.0], duct: [0.75, 0.95, 1.0], carbon: [0.7, 0.9, 1.0] }, metal: true, glow: true },
  { id: 'stealth', name: 'Stealth', level: 4, colors: { bell: [0.03, 0.03, 0.03], prop: [0.04, 0.04, 0.04], tpu: [0.03, 0.03, 0.03], battery: [0.03, 0.03, 0.03], duct: [0.03, 0.03, 0.03], carbon: [0.02, 0.02, 0.02] } },
  { id: 'mint', name: 'Mint', level: 6, colors: { bell: [0.55, 0.95, 0.8], prop: [0.6, 1.0, 0.85], tpu: [0.4, 0.85, 0.7], battery: [0.9, 0.98, 0.95], duct: [0.55, 0.95, 0.8] } },
  { id: 'pumpkin', name: 'Pumpkin', level: 9, colors: { bell: [0.1, 0.06, 0.02], prop: [1.0, 0.5, 0.05], tpu: [1.0, 0.45, 0.02], battery: [0.1, 0.06, 0.02], duct: [1.0, 0.5, 0.05] } },
  { id: 'hazard', name: 'Hazard', level: 11, colors: { bell: [1.0, 0.85, 0.0], prop: [0.05, 0.05, 0.05], tpu: [1.0, 0.85, 0.0], battery: [0.05, 0.05, 0.05], duct: [1.0, 0.85, 0.0] } },
  { id: 'fire-engine', name: 'Fire Engine', level: 14, colors: { bell: [0.95, 0.95, 0.95], prop: [0.9, 0.05, 0.03], tpu: [0.9, 0.05, 0.03], battery: [0.95, 0.95, 0.95], duct: [0.9, 0.05, 0.03] } },
  { id: 'sakura', name: 'Sakura', level: 16, colors: { bell: [1.0, 0.75, 0.85], prop: [1.0, 0.85, 0.92], tpu: [0.95, 0.6, 0.75], battery: [0.98, 0.95, 0.96], duct: [1.0, 0.75, 0.85] } },
  { id: 'royal', name: 'Royal', level: 23, colors: { bell: [1.0, 0.78, 0.2], prop: [0.35, 0.08, 0.6], tpu: [0.35, 0.08, 0.6], battery: [1.0, 0.78, 0.2], duct: [0.35, 0.08, 0.6] }, metal: true },
  { id: 'copper', name: 'Copper', level: 27, colors: { bell: [0.85, 0.45, 0.25], prop: [0.85, 0.45, 0.25], tpu: [0.6, 0.3, 0.15], battery: [0.75, 0.38, 0.2], duct: [0.85, 0.45, 0.25], carbon: [0.55, 0.28, 0.15] }, metal: true },
  { id: 'matrix', name: 'Matrix', level: 31, colors: { bell: [0.02, 0.05, 0.02], prop: [0.1, 1.0, 0.25], tpu: [0.05, 0.85, 0.2], battery: [0.02, 0.05, 0.02], duct: [0.1, 1.0, 0.25], carbon: [0.01, 0.04, 0.01] }, glow: true },
  { id: 'aurora', name: 'Aurora', level: 34, colors: { bell: [0.1, 0.9, 0.6], prop: [0.55, 0.25, 1.0], tpu: [0.1, 0.9, 0.6], battery: [0.05, 0.08, 0.2], duct: [0.55, 0.25, 1.0] }, glow: true },
  { id: 'rose-gold', name: 'Rose Gold', level: 37, colors: { bell: [0.95, 0.65, 0.6], prop: [0.95, 0.65, 0.6], tpu: [0.85, 0.55, 0.5], battery: [0.95, 0.75, 0.7], duct: [0.95, 0.65, 0.6], carbon: [0.75, 0.48, 0.44] }, metal: true },
  { id: 'sapphire', name: 'Sapphire', level: 40, colors: { bell: [0.1, 0.3, 0.95], prop: [0.2, 0.45, 1.0], tpu: [0.08, 0.2, 0.75], battery: [0.05, 0.12, 0.45], duct: [0.1, 0.3, 0.95], carbon: [0.05, 0.12, 0.4] }, metal: true, glow: true },
  { id: 'legend', name: 'Legend', level: 50, colors: { bell: [0.08, 0.08, 0.08], prop: [1.0, 0.42, 0.05], tpu: [1.0, 0.42, 0.05], battery: [0.08, 0.08, 0.08], duct: [1.0, 0.42, 0.05], carbon: [0.15, 0.08, 0.03] }, metal: true, glow: true },
];

export function getSkin(id: string | undefined): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}
