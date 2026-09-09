import { BALL_RADIUS, STOP_SETTLE_MS } from '../config';
import { makeRng, type RngState } from '../math/rng';
import type { Surface, Vec2 } from '../types';
import type { World } from './world';

/**
 * Everything the solver mutates lives here. The world is read-only during
 * simulation, so a full copy of SimState is a complete save point — which is
 * how the trajectory preview runs the real step function without touching the
 * live game (SPEC 7.2).
 */

export type SimEvent =
  | { k: 'wall'; x: number; y: number; speed: number }
  | { k: 'graze'; x: number; y: number; speed: number }
  | { k: 'bumper'; i: number; x: number; y: number; speed: number }
  | { k: 'mover'; x: number; y: number; speed: number }
  | { k: 'boost'; i: number; x: number; y: number }
  | { k: 'portal'; i: number; fromA: boolean; x: number; y: number; ex: number; ey: number }
  | { k: 'surface'; from: Surface; to: Surface; x: number; y: number }
  | { k: 'water'; x: number; y: number }
  | { k: 'oob'; x: number; y: number }
  | { k: 'lipout'; x: number; y: number; speed: number }
  | { k: 'sunk'; x: number; y: number }
  | { k: 'rest'; x: number; y: number };

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface SimState {
  ball: BallState;
  /** Position at the start of the current fixed step, for swept region tests. */
  prevX: number;
  prevY: number;
  /** Number of fixed steps simulated since the hole was loaded. */
  stepCount: number;
  atRest: boolean;
  settleMs: number;
  sunk: boolean;
  /** True while a shot is live: set by shoot(), cleared when the ball settles. */
  inFlight: boolean;
  /** Where a water or out-of-bounds penalty returns the ball to (SPEC 6.4). */
  lastRest: Vec2;
  surface: Surface;
  rng: RngState;
  portalCooldownMs: number;
  cupCooldownMs: number;
  /** Per-boost-pad entry latch, or the ball accelerates every step (SPEC 6.6). */
  boostInside: boolean[];
  /** Reflections in the current shot; the preview uses it to stop after N bounces. */
  bounces: number;
  /** Penalty strokes accrued by the current shot (water, out of bounds). */
  penalties: number;
  events: SimEvent[];
  collectEvents: boolean;
}

export function createState(world: World, seed: number): SimState {
  return {
    ball: { x: world.tee.x, y: world.tee.y, vx: 0, vy: 0, r: BALL_RADIUS },
    prevX: world.tee.x,
    prevY: world.tee.y,
    stepCount: 0,
    atRest: true,
    settleMs: STOP_SETTLE_MS,
    sunk: false,
    inFlight: false,
    lastRest: { x: world.tee.x, y: world.tee.y },
    surface: 'green',
    rng: makeRng(seed),
    portalCooldownMs: 0,
    cupCooldownMs: 0,
    boostInside: new Array(world.boosts.length).fill(false),
    bounces: 0,
    penalties: 0,
    events: [],
    collectEvents: true,
  };
}

/** Deep copy. Cheap enough to call once per aim frame for the preview. */
export function cloneState(s: SimState): SimState {
  return {
    ball: { x: s.ball.x, y: s.ball.y, vx: s.ball.vx, vy: s.ball.vy, r: s.ball.r },
    prevX: s.prevX,
    prevY: s.prevY,
    stepCount: s.stepCount,
    atRest: s.atRest,
    settleMs: s.settleMs,
    sunk: s.sunk,
    inFlight: s.inFlight,
    lastRest: { x: s.lastRest.x, y: s.lastRest.y },
    surface: s.surface,
    rng: { s: s.rng.s },
    portalCooldownMs: s.portalCooldownMs,
    cupCooldownMs: s.cupCooldownMs,
    boostInside: s.boostInside.slice(),
    bounces: s.bounces,
    penalties: s.penalties,
    events: [],
    collectEvents: false,
  };
}

export function emit(s: SimState, e: SimEvent): void {
  if (s.collectEvents) s.events.push(e);
}

export const ballSpeed = (s: SimState): number =>
  Math.sqrt(s.ball.vx * s.ball.vx + s.ball.vy * s.ball.vy);
