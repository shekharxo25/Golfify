import {
  BALL_RADIUS,
  CAPTURE_SPEED,
  CUP_RADIUS,
  FIXED_STEP_S,
  LIP_OUT_COOLDOWN_MS,
  LIP_OUT_DEFLECT_RAD,
  LIP_OUT_SPEED_LOSS,
  MAX_SHOT_SPEED,
  PORTAL_COOLDOWN_MS,
  PORTAL_EXIT_CLEARANCE,
  STOP_SETTLE_MS,
} from '../config';
import { makeApproach, pathClosestTo, pathSample } from './path';
import { clampSpeed } from './response';
import { emit, type SimState } from './state';
import { inRegion, isInBounds, isWater } from './surfaces';
import type { World } from './world';

const approach = makeApproach();

/* ------------------------------------------------------------------ *
 * 6.11 Conveyors — constant acceleration while inside
 * ------------------------------------------------------------------ */

export function applyConveyors(w: World, st: SimState): void {
  if (w.conveyors.length === 0) return;
  const b = st.ball;
  for (let i = 0; i < w.conveyors.length; i++) {
    const c = w.conveyors[i];
    if (!inRegion(b.x, b.y, c.aabb, c.poly)) continue;
    b.vx += c.dx * c.accel * FIXED_STEP_S;
    b.vy += c.dy * c.accel * FIXED_STEP_S;
  }
  clampSpeed(st);
}

/* ------------------------------------------------------------------ *
 * 6.6 Boost pads — fire once per entry, never per step
 * ------------------------------------------------------------------ */

export function applyBoosts(w: World, st: SimState): void {
  if (w.boosts.length === 0) return;
  const b = st.ball;
  for (let i = 0; i < w.boosts.length; i++) {
    const pad = w.boosts[i];
    let touched = false;
    pathSample((x, y) => {
      if (inRegion(x, y, pad.aabb, pad.poly)) {
        touched = true;
        return true;
      }
      return false;
    });

    if (touched && !st.boostInside[i]) {
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const boosted = Math.min(speed * pad.mult, MAX_SHOT_SPEED);
      b.vx = pad.dx * boosted;
      b.vy = pad.dy * boosted;
      st.atRest = false;
      st.settleMs = 0;
      emit(st, { k: 'boost', i, x: b.x, y: b.y });
    }
    // Latch tracks containment at the end of the step, so leaving re-arms it.
    st.boostInside[i] = inRegion(b.x, b.y, pad.aabb, pad.poly);
  }
}

/* ------------------------------------------------------------------ *
 * 6.8 Portals
 * ------------------------------------------------------------------ */

export function applyPortals(w: World, st: SimState): void {
  if (w.portals.length === 0 || st.portalCooldownMs > 0) return;
  const b = st.ball;

  for (let i = 0; i < w.portals.length; i++) {
    const p = w.portals[i];
    let hitA = false;
    let hitB = false;
    let hx = 0;
    let hy = 0;

    pathSample((x, y) => {
      if ((x - p.a.x) ** 2 + (y - p.a.y) ** 2 <= p.a.r * p.a.r) {
        hitA = true;
        hx = x;
        hy = y;
        return true;
      }
      if ((x - p.b.x) ** 2 + (y - p.b.y) ** 2 <= p.b.r * p.b.r) {
        hitB = true;
        hx = x;
        hy = y;
        return true;
      }
      return false;
    });

    if (!hitA && !hitB) continue;

    const entry = hitA ? p.a : p.b;
    const exit = hitA ? p.b : p.a;
    // SPEC 6.8: speed preserved, direction rotated by the angle between the
    // two facings. Equal facings therefore pass the ball straight through,
    // which is the behaviour a level designer expects by default.
    const delta = exit.facing - entry.facing;
    const cs = Math.cos(delta);
    const sn = Math.sin(delta);
    const nvx = b.vx * cs - b.vy * sn;
    const nvy = b.vx * sn + b.vy * cs;
    const speed = Math.sqrt(nvx * nvx + nvy * nvy);

    let ux = 0;
    let uy = -1;
    if (speed > 1e-6) {
      ux = nvx / speed;
      uy = nvy / speed;
    }
    const clear = exit.r + BALL_RADIUS + PORTAL_EXIT_CLEARANCE;

    b.vx = nvx;
    b.vy = nvy;
    b.x = exit.x + ux * clear;
    b.y = exit.y + uy * clear;
    st.portalCooldownMs = PORTAL_COOLDOWN_MS;
    emit(st, { k: 'portal', i, fromA: hitA, x: hx, y: hy, ex: b.x, ey: b.y });
    return;
  }
}

/* ------------------------------------------------------------------ *
 * 6.12 The cup, with the lip-out
 * ------------------------------------------------------------------ */

/** Returns true when the ball sank and the step should stop early. */
export function applyCup(w: World, st: SimState): boolean {
  if (st.sunk || st.cupCooldownMs > 0) return false;
  const b = st.ball;
  pathClosestTo(w.cup.x, w.cup.y, approach);
  if (approach.d2 > CUP_RADIUS * CUP_RADIUS) return false;

  const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (speed < CAPTURE_SPEED) {
    st.sunk = true;
    st.atRest = true;
    st.inFlight = false;
    st.settleMs = STOP_SETTLE_MS;
    b.x = w.cup.x;
    b.y = w.cup.y;
    b.vx = 0;
    b.vy = 0;
    emit(st, { k: 'sunk', x: w.cup.x, y: w.cup.y });
    return true;
  }

  // Too fast: it rides the rim and comes out. SPEC calls this the game's best
  // emotional beat, so it bends toward the cup rather than away from it.
  const toCupX = w.cup.x - approach.x;
  const toCupY = w.cup.y - approach.y;
  const side = b.vx * toCupY - b.vy * toCupX >= 0 ? 1 : -1;
  const a = side * LIP_OUT_DEFLECT_RAD;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  const nvx = b.vx * cs - b.vy * sn;
  const nvy = b.vx * sn + b.vy * cs;
  const keep = 1 - LIP_OUT_SPEED_LOSS;
  b.vx = nvx * keep;
  b.vy = nvy * keep;
  st.cupCooldownMs = LIP_OUT_COOLDOWN_MS;
  emit(st, { k: 'lipout', x: w.cup.x, y: w.cup.y, speed });
  return false;
}

/* ------------------------------------------------------------------ *
 * 6.4 Water and 6.2 out of bounds
 * ------------------------------------------------------------------ */

/** Cardinal probe offset used to keep a ball resting on a green edge in bounds. */
const EDGE_TOLERANCE = 2;

export function applyHazards(w: World, st: SimState): boolean {
  const b = st.ball;

  // Water is sampled along the whole step path: a fast ball can cross a narrow
  // channel between two frames without its centre ever landing inside.
  let wet = false;
  let wx = 0;
  let wy = 0;
  pathSample((x, y) => {
    if (isWater(w, x, y)) {
      wet = true;
      wx = x;
      wy = y;
      return true;
    }
    return false;
  });
  if (wet) {
    emit(st, { k: 'water', x: wx, y: wy });
    resetToLastRest(st);
    return true;
  }

  // Out of bounds is judged on the end position only, with a small cardinal
  // tolerance so a ball parked exactly on a polygon edge does not flicker.
  if (!isInBounds(w, b.x, b.y)) {
    if (
      !isInBounds(w, b.x + EDGE_TOLERANCE, b.y) &&
      !isInBounds(w, b.x - EDGE_TOLERANCE, b.y) &&
      !isInBounds(w, b.x, b.y + EDGE_TOLERANCE) &&
      !isInBounds(w, b.x, b.y - EDGE_TOLERANCE)
    ) {
      emit(st, { k: 'oob', x: b.x, y: b.y });
      resetToLastRest(st);
      return true;
    }
  }
  return false;
}

function resetToLastRest(st: SimState): void {
  const b = st.ball;
  b.x = st.lastRest.x;
  b.y = st.lastRest.y;
  b.vx = 0;
  b.vy = 0;
  st.atRest = true;
  st.inFlight = false;
  st.settleMs = STOP_SETTLE_MS;
  st.penalties++;
}
