import { DRONE_UNLOCK_LEVEL, getDrone, STARTER_DRONES } from '../drones/specs';
import { SKINS } from './skins';

/**
 * The Flight Path: tricks earn XP, XP raises your Pilot Level, and each level unlocks drones and
 * skins you then claim. The balance comes from the Supabase table game_config and the reward
 * levels from public.rewards (see account.ts loadConfig), so it is tuned there without a game
 * update; the values here are only the defaults until that loads (or offline).
 */
export const PATH = {
  maxLevel: 50,
  /** XP to reach level L = xpBase * (L-1) + xpGrowth * (L-1)^2 */
  xpBase: 3000,
  xpGrowth: 1005,
  /** Most XP that counts per day (the server enforces it). */
  perDayCap: 120000,
};

/** Total XP needed to reach a level (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  const n = Math.max(0, Math.min(PATH.maxLevel, level) - 1);
  return PATH.xpBase * n + PATH.xpGrowth * n * n;
}

export function levelForXp(xp: number): number {
  let lv = 1;
  while (lv < PATH.maxLevel && xp >= xpForLevel(lv + 1)) lv++;
  return lv;
}

/** Progress through the current level: XP into it, XP the level spans, 0..1. */
export function levelProgress(xp: number): { level: number; into: number; span: number; frac: number } {
  const level = levelForXp(xp);
  if (level >= PATH.maxLevel) return { level, into: 0, span: 0, frac: 1 };
  const base = xpForLevel(level);
  const span = xpForLevel(level + 1) - base;
  return { level, into: xp - base, span, frac: (xp - base) / span };
}

export type RewardKind = 'drone' | 'skin';

export interface Reward {
  /** "drone:whoop75" or "skin:toxic" (also the id in the database). */
  id: string;
  kind: RewardKind;
  ref: string;
  name: string;
  level: number;
}

function rewardName(kind: RewardKind, ref: string): string {
  return kind === 'drone' ? getDrone(ref).name : `${SKINS.find((s) => s.id === ref)?.name ?? ref} skin`;
}

/** Unlocks in level order (replaced by the database's list once it loads). */
export const REWARDS: Reward[] = [];

/** Sets the reward list; only drones and skins this version of the game knows are kept. */
export function setRewards(rows: { id: string; kind: string; ref: string; level: number }[]): void {
  const known = (kind: string, ref: string) => (kind === 'drone' ? ref in DRONE_UNLOCK_LEVEL : kind === 'skin' && SKINS.some((s) => s.id === ref));
  const list = rows
    .filter((r) => (r.kind === 'drone' || r.kind === 'skin') && known(r.kind, r.ref))
    .map((r) => ({ id: r.id, kind: r.kind as RewardKind, ref: r.ref, name: rewardName(r.kind as RewardKind, r.ref), level: r.level }))
    .sort((a, b) => a.level - b.level || a.kind.localeCompare(b.kind));
  if (!list.length) return;
  REWARDS.splice(0, REWARDS.length, ...list);
}

setRewards([
  ...Object.entries(DRONE_UNLOCK_LEVEL).map(([id, level]) => ({ id: `drone:${id}`, kind: 'drone', ref: id, level })),
  ...SKINS.filter((s) => s.level > 0).map((s) => ({ id: `skin:${s.id}`, kind: 'skin', ref: s.id, level: s.level })),
]);

export function rewardsAt(level: number): Reward[] {
  return REWARDS.filter((r) => r.level === level);
}

/** Free for everyone: the five starter drones and the stock skin. */
export function isFree(kind: RewardKind, ref: string): boolean {
  return kind === 'drone' ? STARTER_DRONES.includes(ref) : ref === 'stock';
}

export function unlockLevel(kind: RewardKind, ref: string): number {
  return REWARDS.find((r) => r.kind === kind && r.ref === ref)?.level ?? 0;
}
