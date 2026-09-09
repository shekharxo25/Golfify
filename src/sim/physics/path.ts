import { BALL_RADIUS, MAX_RESOLUTIONS_PER_STEP } from '../config';

/**
 * The polyline the ball actually travelled during one fixed step: the start
 * point, every contact point, and the end point.
 *
 * Region triggers (water, boosts, portals, the cup) are sampled along this
 * polyline rather than at the end position. Without it a 13 px/step ball can
 * skip clean over a narrow water channel or clip the cup without ever having a
 * frame where its centre is inside.
 */

const MAX_POINTS = MAX_RESOLUTIONS_PER_STEP + 2;

const xs = new Float64Array(MAX_POINTS);
const ys = new Float64Array(MAX_POINTS);
let count = 0;

/** Sample spacing along the path. Half a ball radius is comfortably dense. */
const SAMPLE_SPACING = BALL_RADIUS * 0.5;

export function pathReset(x: number, y: number): void {
  count = 1;
  xs[0] = x;
  ys[0] = y;
}

export function pathPush(x: number, y: number): void {
  if (count >= MAX_POINTS) {
    xs[MAX_POINTS - 1] = x;
    ys[MAX_POINTS - 1] = y;
    return;
  }
  xs[count] = x;
  ys[count] = y;
  count++;
}

export function pathLength(): number {
  let total = 0;
  for (let i = 1; i < count; i++) {
    total += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }
  return total;
}

/**
 * Walk the step path, calling `visit` at the start point and then at least
 * every SAMPLE_SPACING pixels, ending on the final point. Returning true from
 * `visit` stops the walk (the trigger consumed the step).
 */
export function pathSample(visit: (x: number, y: number, t: number) => boolean): boolean {
  if (count === 0) return false;
  if (visit(xs[0], ys[0], 0)) return true;
  for (let i = 1; i < count; i++) {
    const x0 = xs[i - 1];
    const y0 = ys[i - 1];
    const x1 = xs[i];
    const y1 = ys[i];
    const segLen = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(segLen / SAMPLE_SPACING));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (visit(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, t)) return true;
    }
  }
  return false;
}

/**
 * Closest approach of the step path to a point, as squared distance plus the
 * position along the path where it happened. Used for cup capture, where the
 * ball can cross the cup entirely inside one step.
 */
export interface Approach {
  d2: number;
  x: number;
  y: number;
}

export function pathClosestTo(px: number, py: number, out: Approach): Approach {
  out.d2 = Infinity;
  out.x = xs[0];
  out.y = ys[0];
  if (count === 1) {
    out.d2 = (px - xs[0]) ** 2 + (py - ys[0]) ** 2;
    return out;
  }
  for (let i = 1; i < count; i++) {
    const ax = xs[i - 1];
    const ay = ys[i - 1];
    const ex = xs[i] - ax;
    const ey = ys[i] - ay;
    const l2 = ex * ex + ey * ey;
    let t = 0;
    if (l2 > 0) {
      t = ((px - ax) * ex + (py - ay) * ey) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
    }
    const cx = ax + ex * t;
    const cy = ay + ey * t;
    const d2 = (px - cx) ** 2 + (py - cy) ** 2;
    if (d2 < out.d2) {
      out.d2 = d2;
      out.x = cx;
      out.y = cy;
    }
  }
  return out;
}

export const makeApproach = (): Approach => ({ d2: Infinity, x: 0, y: 0 });
