import { describe, expect, it } from 'vitest';
import { BALL_RADIUS, GRAZE_ANGLE_DEG } from '../../sim/config';
import { createState } from '../../sim/physics/state';
import { step } from '../../sim/physics/step';
import { buildWorld } from '../../sim/physics/world';
import { grazeFixture } from '../helpers';

/**
 * SPEC Phase 2 gate 4: a ball rolling at 5 degrees to a wall slides smoothly;
 * it does not stutter or stick.
 *
 * "Smoothly" is made concrete here as four measurable properties: it keeps
 * travelling along the wall, it never reverses along the wall, its speed only
 * ever decreases (damping, never a bounce), and no reflection event is
 * generated at all.
 */

const WALL_Y = 500;
const DEG = Math.PI / 180;

function slide(angleDeg: number, speed = 900) {
  const world = buildWorld(grazeFixture(WALL_Y));
  const st = createState(world, 3);
  st.ball.x = 100;
  st.ball.y = WALL_Y - BALL_RADIUS - 1;
  const a = angleDeg * DEG;
  st.ball.vx = Math.cos(a) * speed;
  st.ball.vy = Math.sin(a) * speed; // +y closes on the wall
  st.atRest = false;
  st.inFlight = true;
  st.settleMs = 0;

  const trace: { x: number; y: number; vx: number; vy: number; speed: number }[] = [];
  const events: string[] = [];
  for (let n = 0; n < 800 && !st.atRest; n++) {
    step(world, st);
    for (const e of st.events) events.push(e.k);
    st.events.length = 0;
    trace.push({
      x: st.ball.x,
      y: st.ball.y,
      vx: st.ball.vx,
      vy: st.ball.vy,
      speed: Math.hypot(st.ball.vx, st.ball.vy),
    });
  }
  return { trace, events, state: st };
}

describe('shallow-angle sliding', () => {
  it('slides along the wall at 5 degrees without reflecting', () => {
    expect(5).toBeLessThan(GRAZE_ANGLE_DEG);
    const { trace, events } = slide(5);

    expect(events).not.toContain('wall');
    expect(events).toContain('graze');
    expect(trace.length).toBeGreaterThan(200);

    // 1. It keeps moving along the wall, and never reverses.
    for (let i = 1; i < trace.length; i++) {
      expect(trace[i].x).toBeGreaterThan(trace[i - 1].x);
    }

    // 2. Speed decays monotonically: a reflection would show up as a step down
    //    bigger than damping, a stutter as a step *up*.
    for (let i = 1; i < trace.length; i++) {
      expect(trace[i].speed).toBeLessThanOrEqual(trace[i - 1].speed + 1e-9);
    }

    // 3. It never crosses the wall, and it does not bounce away from it.
    for (const t of trace) {
      expect(t.y).toBeLessThan(WALL_Y);
      expect(t.y).toBeGreaterThan(WALL_Y - BALL_RADIUS - 3);
    }

    // 4. Once in contact, the perpendicular velocity is gone and stays gone.
    const settled = trace.slice(20);
    for (const t of settled) {
      expect(Math.abs(t.vy)).toBeLessThan(1e-6);
    }
  });

  it('does not stick: it travels a realistic distance', () => {
    const { trace } = slide(5);
    const travelled = trace[trace.length - 1].x - 100;
    // 900 px/s on green rolls a long way; anything under a few hundred px
    // means the wall ate the shot.
    expect(travelled).toBeGreaterThan(700);
  });

  it('reflects properly at 20 degrees, above the graze threshold', () => {
    expect(20).toBeGreaterThan(GRAZE_ANGLE_DEG);
    const { events, trace } = slide(20);
    expect(events).toContain('wall');
    // A real bounce sends it back away from the wall.
    const minY = Math.min(...trace.map((t) => t.y));
    expect(minY).toBeLessThan(WALL_Y - BALL_RADIUS - 40);
  });

  it('stops instead of micro-bouncing when the approach is very slow', () => {
    // Below MIN_BOUNCE_SPEED the normal component is killed rather than
    // reflected, which is what stops the visible buzz against a wall.
    const { events, trace } = slide(45, 45);
    expect(events).not.toContain('wall');
    const yValues = trace.map((t) => t.y);
    for (let i = 1; i < yValues.length; i++) {
      expect(yValues[i]).toBeLessThan(WALL_Y);
    }
  });

  it('slides smoothly along a wall on ice too', () => {
    // Ice damping is 0.9985, so any per-step energy injection would compound
    // into a visible drift instead of dying out.
    const world = buildWorld({
      ...grazeFixture(WALL_Y),
      hazards: [
        {
          type: 'ice',
          poly: [
            [0, 0],
            [2000, 0],
            [2000, WALL_Y],
            [0, WALL_Y],
          ],
        },
      ],
    });
    const st = createState(world, 3);
    st.ball.x = 100;
    st.ball.y = WALL_Y - BALL_RADIUS - 1;
    st.ball.vx = Math.cos(4 * DEG) * 700;
    st.ball.vy = Math.sin(4 * DEG) * 700;
    st.atRest = false;
    st.inFlight = true;
    st.settleMs = 0;

    let prevSpeed = Infinity;
    for (let n = 0; n < 400; n++) {
      step(world, st);
      const speed = Math.hypot(st.ball.vx, st.ball.vy);
      expect(speed).toBeLessThanOrEqual(prevSpeed + 1e-9);
      expect(st.ball.y).toBeLessThan(WALL_Y);
      prevSpeed = speed;
      if (st.ball.x > 1900) break;
    }
  });
});
