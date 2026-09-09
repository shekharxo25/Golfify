import {
  FIXED_STEP_MS,
  MAX_STEPS_PER_FRAME,
  PREVIEW_BOUNCES,
  PREVIEW_STEPS,
  powerToSpeed,
} from '../config';
import { deriveSeed } from '../math/rng';
import type { HoleData, ShotInput, Vec2 } from '../types';
import { updateKinematics } from './kinematics';
import { cloneState, createState, type SimEvent, type SimState } from './state';
import { step } from './step';
import { buildWorld, type World } from './world';

/** Never accumulate more than one frame's worth of steps (tab restore, GC pause). */
const MAX_ACCUMULATOR_MS = FIXED_STEP_MS * MAX_STEPS_PER_FRAME;

export type PreviewEnd = 'steps' | 'bounces' | 'hazard' | 'sunk' | 'rest';

export interface PreviewPath {
  points: Vec2[];
  bounces: number;
  endedBy: PreviewEnd;
}

/**
 * Owns a hole's world, its mutable state and the fixed-timestep accumulator.
 *
 * The accumulator is the whole reason this class exists: render frames arrive
 * at whatever rate the device manages, physics always advances in 8.33 ms
 * increments, and `alpha` lets the renderer interpolate between the last two
 * states so 120 Hz physics still looks smooth at 60 fps.
 */
export class Simulation {
  readonly world: World;
  state: SimState;

  private accumulator = 0;
  private shotIndex = 0;

  constructor(hole: HoleData, seedOverride?: number) {
    this.world = buildWorld(hole);
    if (seedOverride !== undefined) this.world.seed = seedOverride >>> 0;
    this.state = createState(this.world, this.world.seed);
    updateKinematics(this.world, 0);
  }

  /** Back to the tee, step clock included. */
  reset(): void {
    this.state = createState(this.world, this.world.seed);
    this.accumulator = 0;
    this.shotIndex = 0;
    updateKinematics(this.world, 0);
  }

  get shotsTaken(): number {
    return this.shotIndex;
  }

  /** Interpolation factor in [0, 1) between prev and current physics state. */
  get alpha(): number {
    return this.accumulator / FIXED_STEP_MS;
  }

  /** Interpolated ball position for rendering. Never feed this back into the sim. */
  renderPosition(out: Vec2): Vec2 {
    const a = this.alpha;
    const s = this.state;
    out.x = s.prevX + (s.ball.x - s.prevX) * a;
    out.y = s.prevY + (s.ball.y - s.prevY) * a;
    return out;
  }

  /**
   * Feed a render delta in milliseconds. Returns the number of fixed steps run.
   * The delta is clamped, not queued: after a backgrounded tab the right
   * behaviour is to drop the missing time, not to fast-forward the ball.
   */
  advance(deltaMs: number): number {
    const dt = deltaMs > MAX_ACCUMULATOR_MS ? MAX_ACCUMULATOR_MS : deltaMs < 0 ? 0 : deltaMs;
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      this.accumulator -= FIXED_STEP_MS;
      step(this.world, this.state);
      steps++;
    }
    if (this.accumulator > MAX_ACCUMULATOR_MS) this.accumulator = 0;
    return steps;
  }

  /** Advance an exact number of fixed steps, bypassing the accumulator. */
  runSteps(n: number): void {
    for (let i = 0; i < n; i++) step(this.world, this.state);
  }

  /** Step until the ball settles or sinks. Returns the number of steps taken. */
  runToRest(maxSteps = 20000): number {
    let n = 0;
    while (n < maxSteps && !this.state.atRest && !this.state.sunk) {
      step(this.world, this.state);
      n++;
    }
    return n;
  }

  /**
   * Launch the ball. `angleRad` is the launch direction, i.e.
   * atan2(ballY - pointerY, ballX - pointerX) for a pull-back drag (SPEC 7.1).
   *
   * The PRNG is re-seeded from (hole seed, shot index) so that bumper jitter is
   * a pure function of which shot this is — the property that makes a ghost
   * recorded as [angle, power] pairs replay exactly.
   */
  shoot(angleRad: number, power: number): ShotInput {
    const st = this.state;
    const speed = powerToSpeed(power);
    st.rng.s = deriveSeed(this.world.seed, this.shotIndex);
    st.ball.vx = Math.cos(angleRad) * speed;
    st.ball.vy = Math.sin(angleRad) * speed;
    st.lastRest.x = st.ball.x;
    st.lastRest.y = st.ball.y;
    st.atRest = false;
    st.inFlight = true;
    st.settleMs = 0;
    st.bounces = 0;
    st.penalties = 0;
    st.cupCooldownMs = 0;
    const input: ShotInput = { angleRad, power, atStep: st.stepCount };
    this.shotIndex++;
    return input;
  }

  /** Replay a recorded shot. Identical to shoot() but takes the stored input. */
  replayShot(input: ShotInput): void {
    this.shoot(input.angleRad, input.power);
  }

  drainEvents(): SimEvent[] {
    const out = this.state.events;
    this.state.events = [];
    return out;
  }

  /**
   * Forward-simulate the shot the player is currently aiming, using the real
   * step function on a cloned state (SPEC 7.2). This is the direct payoff of
   * keeping the sim pure: the preview cannot disagree with the shot.
   */
  preview(angleRad: number, power: number): PreviewPath {
    const st = cloneState(this.state);
    const speed = powerToSpeed(power);
    st.rng.s = deriveSeed(this.world.seed, this.shotIndex);
    st.ball.vx = Math.cos(angleRad) * speed;
    st.ball.vy = Math.sin(angleRad) * speed;
    st.lastRest.x = st.ball.x;
    st.lastRest.y = st.ball.y;
    st.atRest = false;
    st.inFlight = true;
    st.settleMs = 0;
    st.bounces = 0;
    st.penalties = 0;
    st.cupCooldownMs = 0;

    const points: Vec2[] = [{ x: st.ball.x, y: st.ball.y }];
    let endedBy: PreviewEnd = 'steps';

    for (let i = 0; i < PREVIEW_STEPS; i++) {
      step(this.world, st);
      points.push({ x: st.ball.x, y: st.ball.y });
      if (st.sunk) {
        endedBy = 'sunk';
        break;
      }
      if (st.penalties > 0) {
        // Trim the reset-to-last-rest teleport; the preview should end at the hazard.
        points.pop();
        endedBy = 'hazard';
        break;
      }
      if (st.bounces >= PREVIEW_BOUNCES) {
        endedBy = 'bounces';
        break;
      }
      if (st.atRest) {
        endedBy = 'rest';
        break;
      }
    }

    // The preview advanced kinematic bodies into the future. Put them back, or
    // windmills visibly jitter while the player is aiming.
    if (!this.world.isStatic) {
      updateKinematics(this.world, this.state.stepCount * FIXED_STEP_MS);
    }

    return { points, bounces: st.bounces, endedBy };
  }
}

export { cloneState, createState } from './state';
export type { SimEvent, SimState } from './state';
