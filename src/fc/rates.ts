import type { RateProfile } from '../drones/specs';

/** Betaflight "Actual" rates: stick (-1..1) -> deg/s. */
export function actualRate(stick: number, r: RateProfile): number {
  const a = Math.abs(stick);
  const expof = a * (Math.pow(stick, 5) * r.expo + stick * (1 - r.expo));
  const stickMovement = Math.max(0, r.max - r.center);
  return stick * r.center + stickMovement * expof;
}
