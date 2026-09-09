import { describe, expect, it } from 'vitest';
import { rectWalls } from '../../sim/math/geom';
import { Simulation } from '../../sim/physics/simulation';
import { fixture } from '../helpers';

/**
 * SPEC Phase 2 gate 2: identical results when the render loop runs at 30, 60
 * and 144 fps.
 *
 * The accumulator is what earns this. Every frame rate consumes the same
 * 8.333 ms steps in the same order — only the grouping differs — so the
 * trajectories are bit-identical rather than merely close.
 */

const ARENA = fixture('frames', {
  bounds: [0, 0, 1200, 1600],
  walls: [
    ...rectWalls(100, 100, 1000, 1400),
    { a: [300, 800], b: [900, 820] },
    { a: [200, 400], b: [500, 300] },
  ],
  tee: [600, 1350],
  cup: [1150, 1550],
  elements: [
    { type: 'bumper', c: [600, 1000], r: 34 },
    {
      type: 'windmill',
      c: [600, 560],
      bladeLen: 160,
      bladeCount: 3,
      rpm: 14,
      phase: 0.25,
    },
    {
      type: 'mover',
      segs: [
        { a: [350, 250], b: [510, 250] },
        { a: [510, 250], b: [510, 290] },
        { a: [510, 290], b: [350, 290] },
        { a: [350, 290], b: [350, 250] },
      ],
      path: [
        [0, 0],
        [180, 0],
      ],
      periodMs: 2100,
    },
  ],
});

function playAt(fps: number): {
  x: number;
  y: number;
  steps: number;
  frames: number;
  warmSteps: number;
} {
  const dt = 1000 / fps;
  const sim = new Simulation(ARENA);

  // Let the kinematic elements spin up for a second before the shot, so the
  // test also covers time accumulated while the player is aiming.
  let warm = 0;
  while (warm < 1000) {
    sim.advance(dt);
    warm += dt;
  }
  const stepsBeforeShot = sim.state.stepCount;

  sim.shoot(-Math.PI / 2 + 0.14, 0.94);
  let frames = 0;
  while (!sim.state.atRest && !sim.state.sunk && frames < 20000) {
    sim.advance(dt);
    frames++;
  }
  return {
    x: sim.state.ball.x,
    y: sim.state.ball.y,
    steps: sim.state.stepCount - stepsBeforeShot,
    frames,
    warmSteps: stepsBeforeShot,
  };
}

describe('frame-rate independence', () => {
  it('produces identical trajectories at 30, 60 and 144 fps', () => {
    const at30 = playAt(30);
    const at60 = playAt(60);
    const at144 = playAt(144);

    expect(at30.steps).toBeGreaterThan(100);

    expect(at60.x).toBe(at30.x);
    expect(at60.y).toBe(at30.y);
    expect(at144.x).toBe(at30.x);
    expect(at144.y).toBe(at30.y);
    expect(at60.steps).toBe(at30.steps);
    expect(at144.steps).toBe(at30.steps);

    // Sanity: the frame rates really did differ in how they were driven.
    expect(at144.frames).toBeGreaterThan(at30.frames * 2);
  });

  it('matches a run driven by exact fixed steps', () => {
    // Same total number of fixed steps, fed all at once instead of frame by
    // frame: the accumulator must be the only difference between the two.
    const byFrames = playAt(60);

    const sim = new Simulation(ARENA);
    sim.runSteps(byFrames.warmSteps);
    sim.shoot(-Math.PI / 2 + 0.14, 0.94);
    sim.runToRest();

    expect(sim.state.ball.x).toBe(byFrames.x);
    expect(sim.state.ball.y).toBe(byFrames.y);
  });

  it('drops backlog instead of desyncing after a long stall', () => {
    const sim = new Simulation(ARENA);
    sim.shoot(-Math.PI / 2, 0.5);
    // A backgrounded tab hands back one enormous delta. The right answer is to
    // clamp it, not to fast-forward the ball across the hole.
    const steps = sim.advance(30_000);
    expect(steps).toBeLessThanOrEqual(8);
  });
});
