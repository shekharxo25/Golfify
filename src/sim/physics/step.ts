import {
  COLLISION_SKIN,
  DEPENETRATION_PASSES,
  FIXED_STEP_MS,
  FIXED_STEP_S,
  MAX_RESOLUTIONS_PER_STEP,
  STOP_SETTLE_MS,
  STOP_SPEED,
  SWEEP_EPSILON,
  WAKE_DISTANCE,
} from '../config';
import type { Aabb } from '../math/geom';
import { closestOnSegment } from '../math/geom';
import { sweptCircleAabb } from './broadphase';
import { surfaceVelocity, updateKinematics } from './kinematics';
import { pathPush, pathReset } from './path';
import { clampSpeed, makeContact, respond, type Contact } from './response';
import { emit, type SimState } from './state';
import { findSurface } from './surfaces';
import { makeHit, sweepCircleCircle, sweepCircleSegment } from './sweep';
import { applyBoosts, applyConveyors, applyCup, applyHazards, applyPortals } from './triggers';
import type { World } from './world';

/**
 * One fixed 120 Hz step. This is the only function that advances the ball, and
 * it is pure with respect to (World, SimState): same inputs, same outputs,
 * every time, on every machine. The trajectory preview and the ghost replay
 * both call it directly (SPEC 7.2, 8.3).
 */

const contact: Contact = makeContact();
const scratchHit = makeHit();
const candidates: number[] = [];
const queryBox: Aabb = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const surfVel = { x: 0, y: 0 };

export function step(w: World, st: SimState): void {
  st.stepCount++;
  if (!w.isStatic) updateKinematics(w, st.stepCount * FIXED_STEP_MS);

  if (st.portalCooldownMs > 0) {
    st.portalCooldownMs = Math.max(0, st.portalCooldownMs - FIXED_STEP_MS);
  }
  if (st.cupCooldownMs > 0) {
    st.cupCooldownMs = Math.max(0, st.cupCooldownMs - FIXED_STEP_MS);
  }

  if (st.sunk) return;

  const b = st.ball;
  st.prevX = b.x;
  st.prevY = b.y;
  pathReset(b.x, b.y);

  const wasAtRest = st.atRest;
  const anchorX = b.x;
  const anchorY = b.y;

  const surf = findSurface(w, b.x, b.y);
  if (surf.surface !== st.surface) {
    emit(st, { k: 'surface', from: st.surface, to: surf.surface, x: b.x, y: b.y });
    st.surface = surf.surface;
  }

  applyConveyors(w, st);

  // SPEC 5.3: damping is a per-step multiplier, which is exactly why the step
  // must be fixed. Integrating this on a render delta is the classic way to
  // make a golf game feel different on every device.
  b.vx *= surf.damping;
  b.vy *= surf.damping;

  sweepMove(w, st);
  depenetrate(w, st);

  if (wasAtRest) {
    const dx = b.x - anchorX;
    const dy = b.y - anchorY;
    if (dx * dx + dy * dy < WAKE_DISTANCE * WAKE_DISTANCE) {
      b.x = anchorX;
      b.y = anchorY;
      b.vx = 0;
      b.vy = 0;
    } else {
      st.atRest = false;
      st.settleMs = 0;
    }
  }

  applyBoosts(w, st);
  applyPortals(w, st);
  if (applyCup(w, st)) return;
  if (applyHazards(w, st)) return;

  updateSettling(st);
}

/* ------------------------------------------------------------------ *
 * 5.5 Continuous collision, up to 4 resolutions per step
 * ------------------------------------------------------------------ */

function sweepMove(w: World, st: SimState): void {
  const b = st.ball;
  let remX = b.vx * FIXED_STEP_S;
  let remY = b.vy * FIXED_STEP_S;
  let resolutions = 0;

  for (;;) {
    if (remX * remX + remY * remY < SWEEP_EPSILON) return;

    if (!findEarliestContact(w, st, b.x, b.y, remX, remY, contact)) {
      b.x += remX;
      b.y += remY;
      pathPush(b.x, b.y);
      return;
    }

    if (resolutions >= MAX_RESOLUTIONS_PER_STEP) {
      // SPEC 5.5 step 6: after four resolutions the remaining motion is zeroed.
      // A ball wedged in a sharp corner would otherwise loop forever.
      return;
    }
    resolutions++;

    const t = contact.t;
    b.x += remX * t + contact.nx * COLLISION_SKIN;
    b.y += remY * t + contact.ny * COLLISION_SKIN;
    pathPush(b.x, b.y);

    respond(st, contact);

    const remain = 1 - t;
    remX = b.vx * FIXED_STEP_S * remain;
    remY = b.vy * FIXED_STEP_S * remain;
  }
}

function findEarliestContact(
  w: World,
  st: SimState,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  out: Contact,
): boolean {
  const r = st.ball.r;
  let best = 1;
  let found = false;

  // --- static walls, via the uniform grid --------------------------------
  sweptCircleAabb(cx, cy, dx, dy, r, queryBox);
  w.grid.query(queryBox, candidates);
  for (let i = 0; i < candidates.length; i++) {
    const idx = candidates[i];
    const wall = w.walls[idx];
    if (!sweepCircleSegment(cx, cy, dx, dy, r, wall.seg, best, scratchHit)) continue;
    if (found && scratchHit.t >= best) continue;
    best = scratchHit.t;
    found = true;
    out.t = scratchHit.t;
    out.nx = scratchHit.nx;
    out.ny = scratchHit.ny;
    out.px = scratchHit.px;
    out.py = scratchHit.py;
    out.restitution = wall.restitution;
    out.svx = 0;
    out.svy = 0;
    out.kind = 'wall';
    out.index = idx;
  }

  // --- kinematic segments (movers, windmills) ----------------------------
  // Few enough to test exhaustively; keeping them out of the grid means the
  // grid never has to be rebuilt mid-hole.
  for (let i = 0; i < w.dynSegs.length; i++) {
    const ds = w.dynSegs[i];
    if (!sweepCircleSegment(cx, cy, dx, dy, r, ds.seg, best, scratchHit)) continue;
    if (found && scratchHit.t >= best) continue;
    best = scratchHit.t;
    found = true;
    surfaceVelocity(w, ds, scratchHit.px, scratchHit.py, surfVel);
    out.t = scratchHit.t;
    out.nx = scratchHit.nx;
    out.ny = scratchHit.ny;
    out.px = scratchHit.px;
    out.py = scratchHit.py;
    out.restitution = ds.restitution;
    out.svx = surfVel.x;
    out.svy = surfVel.y;
    out.kind = ds.kind;
    out.index = i;
  }

  // --- bumpers -----------------------------------------------------------
  for (let i = 0; i < w.bumpers.length; i++) {
    const bp = w.bumpers[i];
    if (!sweepCircleCircle(cx, cy, dx, dy, r, bp.x, bp.y, bp.r, best, scratchHit)) continue;
    if (found && scratchHit.t >= best) continue;
    best = scratchHit.t;
    found = true;
    out.t = scratchHit.t;
    out.nx = scratchHit.nx;
    out.ny = scratchHit.ny;
    out.px = scratchHit.px;
    out.py = scratchHit.py;
    out.restitution = bp.restitution;
    out.svx = 0;
    out.svy = 0;
    out.kind = 'bumper';
    out.index = i;
  }

  return found;
}

/* ------------------------------------------------------------------ *
 * Depenetration
 * ------------------------------------------------------------------ */

/**
 * Safety net: after the sweep, guarantee the ball is not inside anything. The
 * sweep alone is correct for a ball that starts outside geometry, but a mover
 * or a blade can rotate *into* a stationary ball, and float error at a shallow
 * corner can leave a fraction of a pixel of overlap. This is also what lets a
 * windmill knock a resting ball out of the way.
 */
function depenetrate(w: World, st: SimState): void {
  const b = st.ball;
  const r = b.r;
  const r2 = r * r;

  for (let pass = 0; pass < DEPENETRATION_PASSES; pass++) {
    let moved = false;

    queryBox.minX = b.x - r - 1;
    queryBox.minY = b.y - r - 1;
    queryBox.maxX = b.x + r + 1;
    queryBox.maxY = b.y + r + 1;
    w.grid.query(queryBox, candidates);
    for (let i = 0; i < candidates.length; i++) {
      if (pushOutOfSegment(st, w.walls[candidates[i]].seg, r, r2, 0, 0)) moved = true;
    }

    for (let i = 0; i < w.dynSegs.length; i++) {
      const ds = w.dynSegs[i];
      const near = closestOnSegment(b.x, b.y, ds.seg);
      if (near.d2 >= r2) continue;
      surfaceVelocity(w, ds, near.x, near.y, surfVel);
      if (pushOutOfSegment(st, ds.seg, r, r2, surfVel.x, surfVel.y)) moved = true;
    }

    for (let i = 0; i < w.bumpers.length; i++) {
      const bp = w.bumpers[i];
      const sum = r + bp.r;
      let nx = b.x - bp.x;
      let ny = b.y - bp.y;
      const d2 = nx * nx + ny * ny;
      if (d2 >= sum * sum) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-9) {
        nx = 0;
        ny = -1;
      } else {
        nx /= d;
        ny /= d;
      }
      const push = sum - d + COLLISION_SKIN;
      b.x += nx * push;
      b.y += ny * push;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= vn * nx;
        b.vy -= vn * ny;
      }
      moved = true;
    }

    if (!moved) return;
  }
  clampSpeed(st);
}

function pushOutOfSegment(
  st: SimState,
  seg: { ax: number; ay: number; bx: number; by: number },
  r: number,
  r2: number,
  svx: number,
  svy: number,
): boolean {
  const b = st.ball;
  const near = closestOnSegment(b.x, b.y, seg);
  if (near.d2 >= r2) return false;

  let nx = b.x - near.x;
  let ny = b.y - near.y;
  const d = Math.sqrt(near.d2);
  if (d < 1e-9) {
    const ex = seg.bx - seg.ax;
    const ey = seg.by - seg.ay;
    const el = Math.hypot(ex, ey) || 1;
    nx = -ey / el;
    ny = ex / el;
  } else {
    nx /= d;
    ny /= d;
  }

  b.x += nx * (r - d + COLLISION_SKIN);
  b.y += ny * (r - d + COLLISION_SKIN);

  // Never leave the ball moving into the surface, and let a moving surface
  // impart its own normal velocity — that is the shove a blade should give.
  const vn = b.vx * nx + b.vy * ny;
  const svn = svx * nx + svy * ny;
  if (vn < svn) {
    const delta = svn - vn;
    b.vx += delta * nx;
    b.vy += delta * ny;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * 5.2 Settling
 * ------------------------------------------------------------------ */

function updateSettling(st: SimState): void {
  const b = st.ball;
  const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (speed >= STOP_SPEED) {
    st.settleMs = 0;
    return;
  }
  st.settleMs += FIXED_STEP_MS;
  if (st.settleMs < STOP_SETTLE_MS || st.atRest) return;

  b.vx = 0;
  b.vy = 0;
  st.atRest = true;
  st.settleMs = STOP_SETTLE_MS;
  st.lastRest.x = b.x;
  st.lastRest.y = b.y;
  st.inFlight = false;
  emit(st, { k: 'rest', x: b.x, y: b.y });
}
