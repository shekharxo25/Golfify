import type { DynSeg, World } from './world';

/**
 * Moving blocks and windmills (SPEC 6.9, 6.10).
 *
 * Every transform is a pure function of simulated time, and simulated time is
 * `stepCount * FIXED_STEP_MS` — an integer multiplied by a constant. That is
 * what makes a recorded shot replay identically days later: nothing here
 * depends on the render clock or on accumulated float error.
 */

const TAU = Math.PI * 2;

export function updateKinematics(w: World, timeMs: number): void {
  const timeS = timeMs / 1000;

  for (let i = 0; i < w.movers.length; i++) {
    const m = w.movers[i];
    // Sine ease: 0 at path[0], 1 at path[1], back again. One full period is a
    // there-and-back trip, which is what "oscillates along the path" means.
    const u = frac(timeMs / m.periodMs + m.phase);
    const ease = 0.5 - 0.5 * Math.cos(TAU * u);
    const spanX = m.p1.x - m.p0.x;
    const spanY = m.p1.y - m.p0.y;
    m.ox = spanX * ease;
    m.oy = spanY * ease;
    // d(ease)/dt = PI * sin(TAU*u) / periodSeconds
    const rate = (Math.PI * Math.sin(TAU * u) * 1000) / m.periodMs;
    m.vx = spanX * rate;
    m.vy = spanY * rate;

    for (let j = 0; j < m.segCount; j++) {
      const src = m.local[j];
      const dst = w.dynSegs[m.segStart + j].seg;
      dst.ax = src.ax + m.ox;
      dst.ay = src.ay + m.oy;
      dst.bx = src.bx + m.ox;
      dst.by = src.by + m.oy;
    }
  }

  for (let i = 0; i < w.windmills.length; i++) {
    const wm = w.windmills[i];
    wm.angle = wm.phase * TAU + wm.omega * timeS;
    const spacing = TAU / wm.bladeCount;
    for (let j = 0; j < wm.bladeCount; j++) {
      const a = wm.angle + spacing * j;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const dst = w.dynSegs[wm.segStart + j].seg;
      dst.ax = wm.cx + cos * wm.hubR;
      dst.ay = wm.cy + sin * wm.hubR;
      dst.bx = wm.cx + cos * wm.bladeLen;
      dst.by = wm.cy + sin * wm.bladeLen;
    }
  }
}

/**
 * Velocity of a kinematic surface at a contact point, in px/s. Collisions are
 * resolved in this frame and the result added back, which is what stops a
 * moving block from feeling dead on impact (SPEC 6.9).
 */
export function surfaceVelocity(
  w: World,
  ds: DynSeg,
  px: number,
  py: number,
  out: { x: number; y: number },
): void {
  if (ds.kind === 'mover') {
    const m = w.movers[ds.bodyIndex];
    out.x = m.vx;
    out.y = m.vy;
    return;
  }
  const wm = w.windmills[ds.bodyIndex];
  // v = omega x r, planar: omega * perp(p - c)
  out.x = -wm.omega * (py - wm.cy);
  out.y = wm.omega * (px - wm.cx);
}

/** Positive fractional part, stable for negative inputs. */
function frac(v: number): number {
  const f = v - Math.floor(v);
  return f;
}
