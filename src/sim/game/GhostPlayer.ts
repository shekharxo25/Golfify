import { FIXED_STEP_MS, MAX_STEPS_PER_FRAME } from '../config';
import { Simulation } from '../physics/simulation';
import type { HoleData, ShotInput, Vec2 } from '../types';

/**
 * Replays a stored best run (SPEC 8.3).
 *
 * A ghost is an array of {angleRad, power, atStep} — a few dozen bytes — and
 * this class turns it back into motion by re-running the identical solver. It
 * keeps its own accumulator rather than using Simulation.advance() because a
 * shot has to be injected on an exact step boundary: `atStep` is the fixed-step
 * index at which the player released, and on a hole with a windmill, replaying
 * one step early is a different shot.
 */
export class GhostPlayer {
  readonly sim: Simulation;
  private accumulator = 0;
  private nextShot = 0;
  private readonly shots: ShotInput[];

  constructor(hole: HoleData, shots: ShotInput[], seedOverride?: number) {
    this.shots = shots;
    this.sim = new Simulation(hole, seedOverride);
  }

  get hasRun(): boolean {
    return this.shots.length > 0;
  }

  get finished(): boolean {
    return (
      this.sim.state.sunk ||
      (this.nextShot >= this.shots.length && this.sim.state.atRest && this.sim.shotsTaken > 0)
    );
  }

  get position(): Vec2 {
    return { x: this.sim.state.ball.x, y: this.sim.state.ball.y };
  }

  renderPosition(out: Vec2): Vec2 {
    return this.sim.renderPosition(out);
  }

  reset(): void {
    this.sim.reset();
    this.accumulator = 0;
    this.nextShot = 0;
  }

  advance(deltaMs: number): void {
    if (!this.hasRun || this.sim.state.sunk) return;
    const max = FIXED_STEP_MS * MAX_STEPS_PER_FRAME;
    this.accumulator += deltaMs > max ? max : deltaMs;
    let steps = 0;
    while (this.accumulator >= FIXED_STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      this.accumulator -= FIXED_STEP_MS;
      this.tick();
      steps++;
    }
  }

  /** One fixed step, injecting the next recorded shot first if it is due. */
  tick(): void {
    const st = this.sim.state;
    if (this.nextShot < this.shots.length && st.atRest && !st.sunk) {
      const shot = this.shots[this.nextShot];
      const due = shot.atStep ?? 0;
      if (st.stepCount >= due) {
        this.sim.replayShot(shot);
        this.nextShot++;
      }
    }
    this.sim.runSteps(1);
    this.sim.drainEvents();
  }

  /** Run the whole ghost headlessly. Used by the determinism tests. */
  runToCompletion(maxSteps = 200_000): number {
    let n = 0;
    while (n < maxSteps && !this.finished) {
      this.tick();
      n++;
    }
    return n;
  }
}
