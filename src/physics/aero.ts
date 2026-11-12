import { Vector3 } from 'three';

export const AIR_DENSITY = 1.225;

/**
 * Thrust drops as air flows into the prop disc faster (climbing / fast forward flight)
 * and rises a little when descending. vAxial is airspeed along the thrust axis
 * (positive = flowing in from above, i.e. climbing). pitchSpeed = omega * pitch / 2pi.
 */
export function inflowFactor(vAxial: number, pitchSpeed: number): number {
  if (pitchSpeed < 1) return 1;
  const f = 1 - vAxial / pitchSpeed;
  return Math.max(0.05, Math.min(1.25, f));
}

/** Cheeseman-Bennett ground effect. height = distance from rotor plane to ground. */
export function groundEffect(height: number, propRadius: number): number {
  if (!isFinite(height) || height > propRadius * 4) return 1;
  const z = Math.max(height, propRadius * 0.6);
  const r = propRadius / (4 * z);
  return Math.min(1.35, 1 / (1 - r * r));
}

/**
 * How badly the props are sitting in their own downwash (0..1). Peaks when descending
 * along the thrust axis at around the hover induced velocity: vortex ring state.
 */
export function propWashIntensity(vAxial: number, inducedHover: number): number {
  if (vAxial >= 0 || inducedHover <= 0) return 0;
  const r = -vAxial / inducedHover;
  if (r < 0.2 || r > 2.2) return 0;
  // Smooth bump centred near 0.9x induced velocity.
  const x = (r - 0.9) / 0.6;
  return Math.exp(-x * x);
}

/** Quadratic per-axis body drag, written into out (body frame). */
export function bodyDrag(vBody: Vector3, cdA: [number, number, number], out: Vector3): Vector3 {
  const speed = vBody.length();
  const k = -0.5 * AIR_DENSITY * speed;
  return out.set(k * cdA[0] * vBody.x, k * cdA[1] * vBody.y, k * cdA[2] * vBody.z);
}
