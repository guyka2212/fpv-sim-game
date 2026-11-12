import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { DRONES, getDrone } from '../drones/specs';
import { FlightController, Sticks } from '../fc/flightController';
import { actualRate } from '../fc/rates';
import { QuadPhysics, GRAVITY } from './quad';
import { Battery } from './battery';

const DT = 0.001;

function makeQuad(id = 'freestyle5') {
  const quad = new QuadPhysics(getDrone(id));
  quad.reset(new Vector3(0, 100, 0));
  const fc = new FlightController(quad);
  fc.arm();
  return { quad, fc };
}

function run(quad: QuadPhysics, fc: FlightController, sticks: Sticks, seconds: number) {
  for (let t = 0; t < seconds; t += DT) quad.step(DT, fc.update(DT, sticks));
}

/** Find the throttle that holds altitude, by bisection on 2 s of flight. */
function hoverThrottle(id: string): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const { quad, fc } = makeQuad(id);
    run(quad, fc, { throttle: mid, yaw: 0, pitch: 0, roll: 0 }, 1.5);
    if (quad.vel.y > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

describe('physics', () => {
  it('falls at g with motors off', () => {
    const quad = new QuadPhysics(getDrone('freestyle5'));
    quad.reset(new Vector3(0, 100, 0));
    for (let t = 0; t < 0.5; t += DT) quad.step(DT, [0, 0, 0, 0]);
    // 0.5 s of fall: v ~ g*t minus a little drag.
    expect(quad.vel.y).toBeLessThan(-GRAVITY * 0.5 * 0.97);
    expect(quad.vel.y).toBeGreaterThan(-GRAVITY * 0.5 * 1.001);
  });

  for (const spec of DRONES) {
    it(`${spec.id}: hover throttle matches thrust-to-weight`, () => {
      const thr = hoverThrottle(spec.id);
      // Thrust ~ command^2, so hover command ~ sqrt(1/TW), plus the idle offset and sag.
      const expected = Math.sqrt(1 / spec.twRatio);
      expect(thr).toBeGreaterThan(expected * 0.75);
      expect(thr).toBeLessThan(expected * 1.35);
    });
  }

  it('yaw stick right turns the quad clockwise from above', () => {
    const { quad, fc } = makeQuad();
    const thr = hoverThrottle('freestyle5');
    run(quad, fc, { throttle: thr, yaw: 0.5, pitch: 0, roll: 0 }, 0.4);
    expect(quad.omega.y).toBeLessThan(-1);
  });

  it('roll stick right rolls right and tracks the rate', () => {
    const { quad, fc } = makeQuad();
    const thr = hoverThrottle('freestyle5');
    run(quad, fc, { throttle: thr, yaw: 0, pitch: 0, roll: 0.5 }, 0.3);
    const target = (actualRate(0.5, getDrone('freestyle5').rates.rollPitch) * Math.PI) / 180;
    // Roll right = negative about body z.
    expect(quad.omega.z).toBeLessThan(-target * 0.9);
    expect(quad.omega.z).toBeGreaterThan(-target * 1.1);
  });

  it('settles after a stick snap without oscillating', () => {
    for (const spec of DRONES) {
      const { quad, fc } = makeQuad(spec.id);
      const thr = hoverThrottle(spec.id);
      run(quad, fc, { throttle: thr, yaw: 0, pitch: 1, roll: 0 }, 0.25);
      run(quad, fc, { throttle: thr, yaw: 0, pitch: 0, roll: 0 }, 0.3);
      expect(quad.omega.length(), spec.id).toBeLessThan(0.3);
    }
  });

  it('battery sag lowers max thrust', () => {
    const quad = new QuadPhysics(getDrone('freestyle5'));
    quad.reset(new Vector3(0, 100, 0));
    const fresh = quad.maxMotorThrust();
    for (let t = 0; t < 0.3; t += DT) quad.step(DT, [1, 1, 1, 1]);
    expect(quad.battery.current).toBeGreaterThan(80);
    expect(quad.maxMotorThrust()).toBeLessThan(fresh * 0.9);
  });

  it('battery voltage drops as it drains', () => {
    const b = new Battery(6, 'lipo', 1000, 0.03);
    const v0 = b.voltage;
    for (let i = 0; i < 1000; i++) b.update(0.1, 20);
    expect(b.usedMah).toBeCloseTo(555.6, 0);
    expect(b.voltage).toBeLessThan(v0 - 1);
  });

  it('angle mode self-levels', () => {
    const { quad, fc } = makeQuad();
    fc.mode = 'angle';
    const thr = hoverThrottle('freestyle5');
    run(quad, fc, { throttle: thr, yaw: 0, pitch: 1, roll: 0 }, 1);
    const up = quad.up(new Vector3());
    expect(Math.acos(up.y)).toBeGreaterThan(0.8); // ~55 deg
    run(quad, fc, { throttle: thr, yaw: 0, pitch: 0, roll: 0 }, 1);
    expect(quad.up(up).y).toBeGreaterThan(0.99);
  });

  it('reports realistic top speeds', () => {
    const speeds: Record<string, number> = {};
    for (const spec of DRONES) {
      const { quad, fc } = makeQuad(spec.id);
      quad.pos.y = 1000;
      fc.mode = 'angle';
      run(quad, fc, { throttle: 1, yaw: 0, pitch: 1, roll: 0 }, 12);
      speeds[spec.id] = Math.round(Math.hypot(quad.vel.x, quad.vel.z) * 3.6);
    }
    console.log('top speed (km/h, 55deg angle mode, full throttle)', speeds);
    expect(speeds.racer5).toBeGreaterThan(speeds.tinywhoop);
  });
});
