import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { QuadPhysics } from '../physics/quad';
import { levelForXp, PATH, xpForLevel } from './flightPath';
import { TrickDetector, type TrickEvent } from './tricks';

/** Enough of a quad for the trick detector, flown by setting its rates directly. */
function fakeQuad() {
  return { pos: new Vector3(0, 20, 0), vel: new Vector3(0, 0, -5), quat: new Quaternion(), omega: new Vector3() };
}

function fly(det: TrickDetector, q: ReturnType<typeof fakeQuad>, seconds: number, rates: [number, number, number], opts: { ground?: number; ceiling?: boolean; crashed?: boolean } = {}) {
  const dt = 1 / 120;
  const axisX = new Vector3(1, 0, 0);
  const axisY = new Vector3(0, 1, 0);
  const axisZ = new Vector3(0, 0, 1);
  const dq = new Quaternion();
  for (let t = 0; t < seconds; t += dt) {
    q.omega.set(rates[0], rates[1], rates[2]);
    // Turn the attitude too, so "inverted" can be seen.
    dq.setFromAxisAngle(axisX, rates[0] * dt);
    q.quat.multiply(dq);
    dq.setFromAxisAngle(axisY, rates[1] * dt);
    q.quat.multiply(dq);
    dq.setFromAxisAngle(axisZ, rates[2] * dt);
    q.quat.multiply(dq);
    q.pos.addScaledVector(q.vel, dt);
    det.update(dt, q as unknown as QuadPhysics, true, !!opts.crashed, opts.ground ?? 20, !!opts.ceiling, 0.08);
  }
}

function record() {
  const det = new TrickDetector();
  const tricks: TrickEvent[] = [];
  let banked = 0;
  let lost = 0;
  det.onTrick = (e) => tricks.push(e);
  det.onBank = (p) => (banked += p);
  det.onBail = (p) => (lost += p);
  return { det, tricks, get banked() { return banked; }, get lost() { return lost; } };
}

describe('tricks', () => {
  it('a quick 360 on the pitch axis is a flip, banked after 1.5 s', () => {
    const r = record();
    const q = fakeQuad();
    fly(r.det, q, 0.65, [-10, 0, 0]);
    fly(r.det, q, 0.5, [0, 0, 0]);
    expect(r.tricks.map((t) => t.name)).toEqual(['FRONT FLIP']);
    expect(r.banked).toBe(0);
    fly(r.det, q, 1.6, [0, 0, 0]);
    expect(r.banked).toBe(100);
  });

  it('two rolls in one go are a double roll, and a second trick soon after builds a combo', () => {
    const r = record();
    const q = fakeQuad();
    fly(r.det, q, 1.3, [0, 0, 10]);
    fly(r.det, q, 0.4, [0, 0, 0]);
    fly(r.det, q, 0.65, [10, 0, 0]);
    fly(r.det, q, 0.4, [0, 0, 0]);
    expect(r.tricks.map((t) => t.name)).toEqual(['DOUBLE ROLL', 'BACK FLIP']);
    expect(r.tricks[1].combo).toBeGreaterThan(1);
  });

  it('crashing before the points are banked loses them', () => {
    const r = record();
    const q = fakeQuad();
    fly(r.det, q, 0.65, [0, 0, -10]);
    fly(r.det, q, 0.4, [0, 0, 0]);
    r.det.crash();
    fly(r.det, q, 2, [0, 0, 0]);
    expect(r.banked).toBe(0);
    expect(r.lost).toBe(100);
  });

  it('wobbles and on-the-ground spins earn nothing', () => {
    const r = record();
    const q = fakeQuad();
    for (let i = 0; i < 6; i++) {
      fly(r.det, q, 0.15, [6, 0, 0]);
      fly(r.det, q, 0.15, [-6, 0, 0]);
    }
    fly(r.det, q, 0.7, [-10, 0, 0], { ground: 0.1 });
    fly(r.det, q, 2, [0, 0, 0]);
    expect(r.tricks).toEqual([]);
  });

  it('flying fast under something counts as a gap', () => {
    const r = record();
    const q = fakeQuad();
    q.vel.set(0, 0, -12);
    fly(r.det, q, 0.3, [0, 0, 0], { ceiling: true, ground: 3 });
    fly(r.det, q, 0.2, [0, 0, 0], { ground: 3 });
    expect(r.tricks.map((t) => t.name)).toContain('GAP');
  });
});

describe('flight path levels', () => {
  it('uses the configured curve (defaults match the database)', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(4004)).toBe(1);
    expect(levelForXp(4005)).toBe(2);
    expect(xpForLevel(10)).toBe(108405);
    expect(xpForLevel(50)).toBe(2560005);
    expect(levelForXp(xpForLevel(50))).toBe(50);
    expect(levelForXp(1e9)).toBe(50);
  });

  it('follows changes from Supabase', () => {
    const saved = { ...PATH };
    Object.assign(PATH, { xpBase: 250, xpGrowth: 50, maxLevel: 60 });
    expect(levelForXp(300)).toBe(2);
    expect(levelForXp(1e12)).toBe(60);
    Object.assign(PATH, saved);
  });
});
