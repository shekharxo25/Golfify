import { closestOnSegment, type Segment } from '../math/geom';

/**
 * Swept-circle continuous collision (SPEC 5.5). At MAX_SHOT_SPEED the ball
 * covers ~13.3 px per fixed step against a 14 px radius, so discrete
 * point-in-geometry checks tunnel through thin walls. Everything here works on
 * the *swept* volume instead.
 *
 * Results are written into a caller-owned Hit to keep the inner loop
 * allocation-free — this runs ~5 million times in the tunnelling test.
 */
export interface Hit {
  /** Fraction of the displacement at which contact occurs, in [0, 1]. */
  t: number;
  /** Unit surface normal, oriented from the surface toward the ball. */
  nx: number;
  ny: number;
  /** Contact point on the surface. */
  px: number;
  py: number;
}

export const makeHit = (): Hit => ({ t: 1, nx: 0, ny: 0, px: 0, py: 0 });

const EPS = 1e-9;

/**
 * Sweep a circle of radius `r` from (cx, cy) along (dx, dy) against segment `s`.
 * Returns true and fills `out` when contact happens at t <= maxT.
 *
 * Three candidate contacts are considered and the earliest wins:
 *  - the segment's two offset faces (circle rolls onto the flat)
 *  - each endpoint (circle catches a corner)
 * A circle that already overlaps and is closing reports t = 0.
 */
export function sweepCircleSegment(
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  r: number,
  s: Segment,
  maxT: number,
  out: Hit,
): boolean {
  const near = closestOnSegment(cx, cy, s);
  const r2 = r * r;

  // --- already touching -------------------------------------------------
  if (near.d2 <= r2) {
    let nx = cx - near.x;
    let ny = cy - near.y;
    const l = Math.sqrt(nx * nx + ny * ny);
    if (l < EPS) {
      // Centre sits exactly on the segment: fall back to the face normal,
      // oriented against the direction of travel.
      const ex = s.bx - s.ax;
      const ey = s.by - s.ay;
      const el = Math.sqrt(ex * ex + ey * ey) || 1;
      nx = -ey / el;
      ny = ex / el;
      if (nx * dx + ny * dy > 0) {
        nx = -nx;
        ny = -ny;
      }
    } else {
      nx /= l;
      ny /= l;
    }
    if (nx * dx + ny * dy < 0) {
      out.t = 0;
      out.nx = nx;
      out.ny = ny;
      out.px = near.x;
      out.py = near.y;
      return true;
    }
    return false; // overlapping but separating — let depenetration handle it
  }

  let best = maxT;
  let found = false;

  // --- face contact -----------------------------------------------------
  const ex = s.bx - s.ax;
  const ey = s.by - s.ay;
  const el2 = ex * ex + ey * ey;
  if (el2 > EPS) {
    const el = Math.sqrt(el2);
    const nx = -ey / el;
    const ny = ex / el;
    const sd = (cx - s.ax) * nx + (cy - s.ay) * ny; // signed distance to the line
    const side = sd >= 0 ? 1 : -1;
    const ddn = dx * nx + dy * ny;
    // Only a motion closing on the plane can produce a face contact.
    if (ddn * side < -EPS) {
      const t = (side * r - sd) / ddn;
      if (t >= 0 && t < best) {
        const hx = cx + dx * t;
        const hy = cy + dy * t;
        const proj = ((hx - s.ax) * ex + (hy - s.ay) * ey) / el2;
        if (proj >= 0 && proj <= 1) {
          best = t;
          found = true;
          out.t = t;
          out.nx = nx * side;
          out.ny = ny * side;
          out.px = s.ax + ex * proj;
          out.py = s.ay + ey * proj;
        }
      }
    }
  }

  // --- endpoint contact -------------------------------------------------
  for (let i = 0; i < 2; i++) {
    const exx = i === 0 ? s.ax : s.bx;
    const eyy = i === 0 ? s.ay : s.by;
    const t = raySphere(cx, cy, dx, dy, exx, eyy, r);
    if (t >= 0 && t < best) {
      const hx = cx + dx * t;
      const hy = cy + dy * t;
      let nx = hx - exx;
      let ny = hy - eyy;
      const l = Math.sqrt(nx * nx + ny * ny);
      if (l < EPS) continue;
      nx /= l;
      ny /= l;
      if (nx * dx + ny * dy >= 0) continue; // grazing away from the corner
      best = t;
      found = true;
      out.t = t;
      out.nx = nx;
      out.ny = ny;
      out.px = exx;
      out.py = eyy;
    }
  }

  return found;
}

/**
 * Sweep a circle of radius `r` against a static circle (bumper, portal mouth)
 * of radius `cr`. Reduces to a ray/sphere test at the summed radius.
 */
export function sweepCircleCircle(
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  r: number,
  ox: number,
  oy: number,
  cr: number,
  maxT: number,
  out: Hit,
): boolean {
  const sum = r + cr;
  const mx = cx - ox;
  const my = cy - oy;
  const start2 = mx * mx + my * my;

  if (start2 <= sum * sum) {
    const l = Math.sqrt(start2);
    let nx = l > EPS ? mx / l : -dx;
    let ny = l > EPS ? my / l : -dy;
    const nl = Math.sqrt(nx * nx + ny * ny) || 1;
    nx /= nl;
    ny /= nl;
    if (nx * dx + ny * dy < 0) {
      out.t = 0;
      out.nx = nx;
      out.ny = ny;
      out.px = ox + nx * cr;
      out.py = oy + ny * cr;
      return true;
    }
    return false;
  }

  const t = raySphere(cx, cy, dx, dy, ox, oy, sum);
  if (t < 0 || t >= maxT) return false;
  const hx = cx + dx * t;
  const hy = cy + dy * t;
  let nx = hx - ox;
  let ny = hy - oy;
  const l = Math.sqrt(nx * nx + ny * ny);
  if (l < EPS) return false;
  nx /= l;
  ny /= l;
  out.t = t;
  out.nx = nx;
  out.ny = ny;
  out.px = ox + nx * cr;
  out.py = oy + ny * cr;
  return true;
}

/**
 * Earliest non-negative t where |(c + d·t) − e| = r, or -1.
 * Callers guarantee the start point is outside the sphere, so both roots share
 * a sign and the smaller one is the entry.
 */
export function raySphere(
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  ex: number,
  ey: number,
  r: number,
): number {
  const a = dx * dx + dy * dy;
  if (a < EPS) return -1;
  const mx = cx - ex;
  const my = cy - ey;
  const b = 2 * (mx * dx + my * dy);
  const c = mx * mx + my * my - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  const t0 = (-b - sq) / (2 * a);
  if (t0 >= 0) return t0;
  const t1 = (-b + sq) / (2 * a);
  return t1 >= 0 ? t1 : -1;
}
