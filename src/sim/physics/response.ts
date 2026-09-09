import {
  BUMPER_JITTER_DEG,
  GRAZE_ANGLE_SIN,
  MIN_BOUNCE_SPEED,
  SPEED_CEILING,
} from '../config';
import { nextSigned } from '../math/rng';
import { emit, type SimState } from './state';

export interface Contact {
  t: number;
  nx: number;
  ny: number;
  px: number;
  py: number;
  restitution: number;
  /** Velocity of the surface at the contact point (movers, windmills). */
  svx: number;
  svy: number;
  kind: 'wall' | 'bumper' | 'mover' | 'windmill';
  index: number;
}

export const makeContact = (): Contact => ({
  t: 1,
  nx: 0,
  ny: 0,
  px: 0,
  py: 0,
  restitution: 0,
  svx: 0,
  svy: 0,
  kind: 'wall',
  index: -1,
});

const DEG = Math.PI / 180;

/**
 * Resolve one contact (SPEC 5.4).
 *
 * The whole thing happens in the surface's own reference frame: subtract the
 * surface velocity, reflect, add it back. That is what makes a moving block
 * transfer its momentum instead of feeling like a wall that happens to slide.
 */
export function respond(st: SimState, c: Contact): void {
  const b = st.ball;

  let vx = b.vx - c.svx;
  let vy = b.vy - c.svy;

  const vn = vx * c.nx + vy * c.ny;
  if (vn >= 0) return; // already separating

  const speed = Math.sqrt(vx * vx + vy * vy);
  const approach = -vn;
  // sin of the angle between the velocity and the wall plane
  const sinTheta = speed > 0 ? approach / speed : 0;

  // Tangential component, preserved by every branch.
  const tx = vx - c.nx * vn;
  const ty = vy - c.ny * vn;

  if (sinTheta < GRAZE_ANGLE_SIN) {
    // SPEC 5.4 graze rule: shallower than GRAZE_ANGLE_DEG, project onto the
    // wall tangent and keep rolling. Without this a ball running almost
    // parallel to a wall stutters against it and looks broken.
    vx = tx;
    vy = ty;
    emit(st, { k: 'graze', x: c.px, y: c.py, speed });
  } else if (approach < MIN_BOUNCE_SPEED) {
    // Too slow to bounce: kill the normal component, keep the roll.
    vx = tx;
    vy = ty;
  } else {
    let nx = c.nx;
    let ny = c.ny;
    if (c.kind === 'bumper' && BUMPER_JITTER_DEG !== 0) {
      // Seeded jitter only — never Math.random (SPEC 5.7, 6.7).
      const a = nextSigned(st.rng) * BUMPER_JITTER_DEG * DEG;
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      const rx = nx * cs - ny * sn;
      const ry = nx * sn + ny * cs;
      nx = rx;
      ny = ry;
    }
    const jvn = vx * nx + vy * ny;
    // Reflect only if the jittered normal still opposes the motion.
    if (jvn < 0) {
      const k = (1 + c.restitution) * jvn;
      vx -= k * nx;
      vy -= k * ny;
    } else {
      vx = tx;
      vy = ty;
    }
    st.bounces++;
    if (c.kind === 'bumper') {
      emit(st, { k: 'bumper', i: c.index, x: c.px, y: c.py, speed: approach });
    } else if (c.kind === 'wall') {
      emit(st, { k: 'wall', x: c.px, y: c.py, speed: approach });
    } else {
      emit(st, { k: 'mover', x: c.px, y: c.py, speed: approach });
    }
  }

  b.vx = vx + c.svx;
  b.vy = vy + c.svy;
  clampSpeed(st);
}

/**
 * Bumpers add energy and movers inject their own velocity, so a ball can be
 * pumped indefinitely. One ceiling, applied after every change of velocity,
 * keeps that bounded without changing how anything feels below the ceiling.
 */
export function clampSpeed(st: SimState): void {
  const b = st.ball;
  const s2 = b.vx * b.vx + b.vy * b.vy;
  if (s2 > SPEED_CEILING * SPEED_CEILING) {
    const s = Math.sqrt(s2);
    b.vx = (b.vx / s) * SPEED_CEILING;
    b.vy = (b.vy / s) * SPEED_CEILING;
  }
}
