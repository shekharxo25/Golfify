import { describe, expect, it } from 'vitest';
import { MAX_SHOT_SPEED } from '../../sim/config';
import { step } from '../../sim/physics/step';
import { buildWorld } from '../../sim/physics/world';
import { createState } from '../../sim/physics/state';
import { deriveSeed } from '../../sim/math/rng';
import { goldenAngles, TUNNEL_BOX, tunnelFixture } from '../helpers';

/**
 * SPEC Phase 2 gate 3: 10,000 randomly-seeded max-power shots at a box of thin
 * walls, zero escapes.
 *
 * Containment is checked after *every* fixed step, not just at rest, and the
 * green covers the whole world so the out-of-bounds rescue cannot mask an
 * escape by teleporting the ball back inside.
 */

const SHOTS = 10_000;
const MIN_X = TUNNEL_BOX.x;
const MIN_Y = TUNNEL_BOX.y;
const MAX_X = TUNNEL_BOX.x + TUNNEL_BOX.w;
const MAX_Y = TUNNEL_BOX.y + TUNNEL_BOX.h;

describe('no tunnelling', () => {
  it('keeps 10000 max-power shots inside a thin-walled box', () => {
    const world = buildWorld(tunnelFixture());
    const angles = goldenAngles(SHOTS);
    const escapes: { shot: number; x: number; y: number; step: number }[] = [];
    let totalSteps = 0;

    for (let i = 0; i < SHOTS; i++) {
      const st = createState(world, deriveSeed(world.seed, i));
      st.collectEvents = false;
      st.rng.s = deriveSeed(world.seed, i);
      const a = angles[i];
      st.ball.vx = Math.cos(a) * MAX_SHOT_SPEED;
      st.ball.vy = Math.sin(a) * MAX_SHOT_SPEED;
      st.atRest = false;
      st.inFlight = true;
      st.settleMs = 0;

      for (let n = 0; n < 3000; n++) {
        step(world, st);
        totalSteps++;
        const b = st.ball;
        if (b.x < MIN_X || b.x > MAX_X || b.y < MIN_Y || b.y > MAX_Y) {
          escapes.push({ shot: i, x: b.x, y: b.y, step: n });
          break;
        }
        if (st.atRest || st.sunk) break;
      }
    }

    expect(escapes).toEqual([]);
    // If the balls all stopped in a handful of steps the test proved nothing.
    expect(totalSteps / SHOTS).toBeGreaterThan(200);
  });

  it('survives being fired straight into a corner at full power', () => {
    const world = buildWorld(tunnelFixture());
    for (const a of [Math.PI * 0.25, Math.PI * 0.75, -Math.PI * 0.25, -Math.PI * 0.75]) {
      const st = createState(world, 1);
      st.ball.x = 850;
      st.ball.y = 850;
      st.ball.vx = Math.cos(a) * MAX_SHOT_SPEED;
      st.ball.vy = Math.sin(a) * MAX_SHOT_SPEED;
      st.atRest = false;
      st.inFlight = true;
      st.settleMs = 0;
      for (let n = 0; n < 3000 && !st.atRest; n++) {
        step(world, st);
        expect(st.ball.x).toBeGreaterThanOrEqual(MIN_X);
        expect(st.ball.x).toBeLessThanOrEqual(MAX_X);
        expect(st.ball.y).toBeGreaterThanOrEqual(MIN_Y);
        expect(st.ball.y).toBeLessThanOrEqual(MAX_Y);
      }
      expect(st.atRest).toBe(true);
    }
  });

  it('never exceeds the speed ceiling, even in a bumper trap', () => {
    // Two bumpers 90 px apart with restitution 1.35: without a ceiling this
    // pumps energy into the ball on every pass.
    const world = buildWorld({
      ...tunnelFixture(),
      elements: [
        { type: 'bumper', c: [600, 1100], r: 30 },
        { type: 'bumper', c: [600, 1220], r: 30 },
      ],
    });
    const st = createState(world, 7);
    st.ball.x = 600;
    st.ball.y = 1160;
    st.ball.vx = 0;
    st.ball.vy = -MAX_SHOT_SPEED * 0.5;
    st.atRest = false;
    st.inFlight = true;
    st.settleMs = 0;
    for (let n = 0; n < 5000; n++) {
      step(world, st);
      const speed = Math.hypot(st.ball.vx, st.ball.vy);
      expect(speed).toBeLessThanOrEqual(MAX_SHOT_SPEED + 1e-6);
      if (st.atRest) break;
    }
  });
});
