/**
 * Every tunable number in the simulation. SPEC.md sections 5, 6 and 7.
 * Nothing in src/sim/ or src/render/ may hardcode a gameplay number: import it from here.
 */

/* ------------------------------------------------------------------ *
 * 5.1 Integration
 * ------------------------------------------------------------------ */

/**
 * Fixed physics step. SPEC quotes 8.333 ms; we use the exact 1000/120 so that
 * `stepCount * FIXED_STEP_MS` never drifts away from wall-clock over a long hole.
 * Both are 120 Hz; the exact form is strictly better and equally deterministic.
 */
export const FIXED_STEP_MS = 1000 / 120;
export const FIXED_STEP_S = FIXED_STEP_MS / 1000;
/** Spiral-of-death guard: never run more than this many steps for one rendered frame. */
export const MAX_STEPS_PER_FRAME = 8;

/* ------------------------------------------------------------------ *
 * 5.2 Ball
 * ------------------------------------------------------------------ */

export const BALL_RADIUS = 14;
/** Kept for future weight variants; currently unused by the solver. */
export const BALL_MASS = 1;
/** Below this speed the ball begins settling. */
export const STOP_SPEED = 25;
/** It must stay below STOP_SPEED this long before it is declared at rest. */
export const STOP_SETTLE_MS = 150;
export const MAX_SHOT_SPEED = 1600;
export const MIN_SHOT_SPEED = 180;

/* ------------------------------------------------------------------ *
 * 5.3 Surface damping — applied per fixed step as `velocity *= damping`
 * ------------------------------------------------------------------ */

export const DAMPING = {
  green: 0.992,
  rough: 0.984,
  sand: 0.955,
  ice: 0.9985,
  /** Conveyor rolls like green and adds a constant acceleration (6.11). */
  conveyor: 0.992,
  /** Water is entered, not rolled on; the value only matters for the entry frame. */
  water: 0.992,
} as const;

/* ------------------------------------------------------------------ *
 * 5.4 Collision response
 * ------------------------------------------------------------------ */

export const WALL_RESTITUTION = 0.72;
export const BUMPER_RESTITUTION = 1.35;
/** Below this approach speed along the normal the ball stops instead of bouncing. */
export const MIN_BOUNCE_SPEED = 40;
/** Shallower than this and the ball slides along the wall instead of reflecting. */
export const GRAZE_ANGLE_DEG = 12;
export const GRAZE_ANGLE_SIN = Math.sin((GRAZE_ANGLE_DEG * Math.PI) / 180);

/* ------------------------------------------------------------------ *
 * 5.5 Continuous collision
 * ------------------------------------------------------------------ */

/** Max collision resolutions inside one fixed step; after this, remaining motion is zeroed. */
export const MAX_RESOLUTIONS_PER_STEP = 4;
/** Ball is parked this far off a surface after a hit so the next sweep starts clean. */
export const COLLISION_SKIN = 0.06;
/** Sweeps shorter than this are treated as stationary. */
export const SWEEP_EPSILON = 1e-9;

/** Depenetration passes run after the sweep, as a guard against ever ending a step inside geometry. */
export const DEPENETRATION_PASSES = 3;
/**
 * A sleeping ball is simulated like any other, but if a step displaces it less
 * than this it is parked back where it was and stays asleep. Without it a
 * conveyor or a windmill blade pressing a resting ball into a wall would
 * oscillate the ball between "at rest" and "in motion" forever.
 */
export const WAKE_DISTANCE = 0.75;

/* ------------------------------------------------------------------ *
 * 5.6 Broadphase
 * ------------------------------------------------------------------ */

export const BROADPHASE_CELL = 128;

/* ------------------------------------------------------------------ *
 * 5.7 Determinism
 * ------------------------------------------------------------------ */

/** Base seed for a hole's PRNG; per-shot streams are derived from it. */
export const DEFAULT_SEED = 0x5eed_60_1f;
/** Seeded jitter added to a bumper reflection, in degrees (6.7). */
export const BUMPER_JITTER_DEG: number = 3;

/* ------------------------------------------------------------------ *
 * 6 Hole elements
 * ------------------------------------------------------------------ */

export const BOOST_DEFAULT_MULT = 1.8;
export const BUMPER_DEFAULT_RADIUS = 26;
export const CONVEYOR_DEFAULT_ACCEL = 900;
/** Portals ignore re-entry for this long, or the ball ping-pongs (6.8). */
export const PORTAL_COOLDOWN_MS = 200;
/** Ball emerges this far beyond the exit portal's rim so it cannot re-trigger. */
export const PORTAL_EXIT_CLEARANCE = 4;
export const PORTAL_DEFAULT_RADIUS = 30;

/** Blades start this far from the windmill hub so the centre is not a degenerate pile. */
export const WINDMILL_HUB_RADIUS = 12;
/** Moving blocks and windmill blades reflect like walls. */
export const MOVER_RESTITUTION = WALL_RESTITUTION;

/**
 * Hard ceiling on ball speed, applied once at the end of every step. Bumpers
 * add energy (e = 1.35) and movers inject their own velocity, so without this a
 * ball trapped between two bumpers accelerates without bound (Phase 4 gate).
 */
export const SPEED_CEILING = MAX_SHOT_SPEED;

/** Water / out of bounds: reset to the last resting position and add a stroke (6.4). */
export const HAZARD_STROKE_PENALTY = 1;

/* ------------------------------------------------------------------ *
 * 6.12 The cup
 * ------------------------------------------------------------------ */

export const CUP_RADIUS = 22;
export const CAPTURE_SPEED = 520;
/** A lip-out bleeds this fraction of speed and bends the path around the rim. */
export const LIP_OUT_SPEED_LOSS = 0.14;
/** How hard the rim bends a too-fast ball, in radians. */
export const LIP_OUT_DEFLECT_RAD = 0.30;
/** One lip-out per pass: the cup is inert for this long afterwards. */
export const LIP_OUT_COOLDOWN_MS = 260;

/* ------------------------------------------------------------------ *
 * 7.1 Aiming and shooting
 * ------------------------------------------------------------------ */

/** Screen-space, so camera zoom never changes how hard a given drag hits. */
export const MAX_DRAG_DIST = 260;
export const MIN_DRAG_DIST = 18;
/** World-space radius around the ball inside which a pointerdown means "aim". */
export const AIM_GRAB_RADIUS = 70;

/* ------------------------------------------------------------------ *
 * 7.2 Trajectory preview
 * ------------------------------------------------------------------ */

export const PREVIEW_STEPS = 90;
export const PREVIEW_BOUNCES = 2;
export const PREVIEW_DOT_GAP = 22;
export const PREVIEW_FADE_NEAR = 0.9;
export const PREVIEW_FADE_FAR = 0.15;

/* ------------------------------------------------------------------ *
 * 8 Progression
 * ------------------------------------------------------------------ */

export const PACK_SIZE = 9;
/** Star totals required to unlock packs 2..5 (8.2). Pack 1 is free. */
export const PACK_STAR_THRESHOLDS = [0, 12, 30, 54, 84] as const;
export const SAVE_VERSION = 1;
export const SAVE_KEY = 'absurd-mini-golf/save';

/* ------------------------------------------------------------------ *
 * Derived helpers
 * ------------------------------------------------------------------ */

/** Convert a normalised power [0,1] into a launch speed (7.1). */
export function powerToSpeed(power: number): number {
  const p = power < 0 ? 0 : power > 1 ? 1 : power;
  return MIN_SHOT_SPEED + p * (MAX_SHOT_SPEED - MIN_SHOT_SPEED);
}

/** Convert a screen-space drag distance into a normalised power (7.1). */
export function dragToPower(dragDist: number): number {
  const p = (dragDist - MIN_DRAG_DIST) / (MAX_DRAG_DIST - MIN_DRAG_DIST);
  return p < 0 ? 0 : p > 1 ? 1 : p;
}
