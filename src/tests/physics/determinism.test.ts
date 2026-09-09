import { describe, expect, it } from 'vitest';
import { Simulation } from '../../sim/physics/simulation';
import { makeRng, nextFloat } from '../../sim/math/rng';
import { fixture, round6 } from '../helpers';
import { rectWalls } from '../../sim/math/geom';

/**
 * SPEC Phase 2 gate 1: the same {angle, power} produces a final position
 * identical to six decimal places across 1,000 runs.
 *
 * The interesting version of this test is the one that exercises the PRNG, so
 * the fixture is full of bumpers: if the seeded stream were not re-derived
 * per shot, the runs would diverge on the first jitter.
 */

const BUMPER_ARENA = fixture('bumpers', {
  bounds: [0, 0, 1200, 1200],
  walls: rectWalls(100, 100, 1000, 1000),
  tee: [600, 1000],
  cup: [1150, 1150],
  elements: [
    { type: 'bumper', c: [600, 700], r: 40 },
    { type: 'bumper', c: [420, 520], r: 30 },
    { type: 'bumper', c: [780, 520], r: 30 },
    { type: 'bumper', c: [600, 330], r: 26 },
  ],
});

function runShot(angleRad: number, power: number): { x: number; y: number; steps: number } {
  const sim = new Simulation(BUMPER_ARENA);
  sim.shoot(angleRad, power);
  const steps = sim.runToRest();
  return { x: sim.state.ball.x, y: sim.state.ball.y, steps };
}

describe('determinism', () => {
  it('reproduces the same final position over 1000 identical runs', () => {
    const angle = -Math.PI / 2 + 0.037;
    const power = 0.83;
    const first = runShot(angle, power);

    expect(first.steps).toBeGreaterThan(50);

    for (let i = 0; i < 1000; i++) {
      const run = runShot(angle, power);
      expect(round6(run.x)).toBe(round6(first.x));
      expect(round6(run.y)).toBe(round6(first.y));
      expect(run.steps).toBe(first.steps);
    }
  });

  it('is bit-identical, not merely equal to six places', () => {
    const a = runShot(-1.2, 0.61);
    const b = runShot(-1.2, 0.61);
    expect(b.x).toBe(a.x);
    expect(b.y).toBe(a.y);
  });

  it('gives different results for different shots', () => {
    const a = runShot(-Math.PI / 2, 0.8);
    const b = runShot(-Math.PI / 2 + 0.01, 0.8);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.5);
  });

  it('replays a multi-shot sequence identically', () => {
    const shots: [number, number][] = [
      [-Math.PI / 2 + 0.1, 0.9],
      [-1.9, 0.45],
      [-0.6, 0.32],
      [2.4, 0.7],
    ];
    const play = () => {
      const sim = new Simulation(BUMPER_ARENA);
      const trace: number[] = [];
      for (const [a, p] of shots) {
        sim.shoot(a, p);
        sim.runToRest();
        trace.push(sim.state.ball.x, sim.state.ball.y);
      }
      return trace;
    };
    expect(play()).toEqual(play());
  });

  it('derives independent per-shot PRNG streams', () => {
    const sim = new Simulation(BUMPER_ARENA);
    sim.shoot(-Math.PI / 2, 0.5);
    const seedShot0 = sim.state.rng.s;
    sim.runToRest();
    sim.shoot(-Math.PI / 2, 0.5);
    expect(sim.state.rng.s).not.toBe(seedShot0);
  });
});

describe('mulberry32', () => {
  it('is stable for a given seed', () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    for (let i = 0; i < 100; i++) expect(nextFloat(a)).toBe(nextFloat(b));
  });

  it('stays in [0, 1) and is reasonably uniform', () => {
    const rng = makeRng(99);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 100_000; i++) {
      const v = nextFloat(rng);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      buckets[Math.floor(v * 10)]++;
    }
    for (const b of buckets) expect(b).toBeGreaterThan(9000);
  });
});
