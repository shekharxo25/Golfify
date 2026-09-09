import { HAZARD_STROKE_PENALTY } from '../config';
import { Simulation } from '../physics/simulation';
import type { SimEvent } from '../physics/state';
import type { HoleData, ShotInput } from '../types';
import { scoreName, starsFor, type ScoreName } from './scoring';

/**
 * One attempt at one hole: stroke count, the shot log that becomes the ghost,
 * and the phase the presentation layer keys off.
 *
 * Deliberately thin. All rules that affect the ball live in the solver; this
 * only counts and remembers.
 */

export type HolePhase =
  /** Camera is showing the whole hole; input is ignored. */
  | 'reading'
  /** Ball at rest, waiting for a drag. */
  | 'aiming'
  /** Shot is live. */
  | 'rolling'
  /** Sunk. Waiting for the player to advance. */
  | 'complete';

export interface HoleResult {
  holeId: string;
  par: number;
  strokes: number;
  stars: number;
  name: ScoreName;
  shots: ShotInput[];
}

export class HoleSession {
  readonly sim: Simulation;
  readonly hole: HoleData;

  strokes = 0;
  /** Penalty strokes so far, tracked separately for the scorecard. */
  penalties = 0;
  shots: ShotInput[] = [];
  phase: HolePhase = 'reading';

  constructor(hole: HoleData, seedOverride?: number) {
    this.hole = hole;
    this.sim = new Simulation(hole, seedOverride);
  }

  /** Leave the read-the-hole camera move and hand control to the player. */
  beginPlay(): void {
    if (this.phase === 'reading') this.phase = 'aiming';
  }

  get canAim(): boolean {
    return this.phase === 'aiming' && this.sim.state.atRest && !this.sim.state.sunk;
  }

  takeShot(angleRad: number, power: number): void {
    if (!this.canAim) return;
    this.shots.push(this.sim.shoot(angleRad, power));
    this.strokes++;
    this.phase = 'rolling';
  }

  /**
   * Advance physics by a render delta and return the events produced, so the
   * presentation layer can turn them into sound and particles.
   */
  update(deltaMs: number): SimEvent[] {
    if (this.phase === 'reading' || this.phase === 'complete') {
      // Kinematic elements keep turning even before the player takes control,
      // so the hole reads as alive during the camera move.
      this.sim.advance(deltaMs);
      return this.sim.drainEvents();
    }

    this.sim.advance(deltaMs);
    const events = this.sim.drainEvents();

    for (const e of events) {
      if (e.k === 'water' || e.k === 'oob') {
        this.strokes += HAZARD_STROKE_PENALTY;
        this.penalties += HAZARD_STROKE_PENALTY;
      }
    }

    if (this.sim.state.sunk) {
      this.phase = 'complete';
    } else if (this.phase === 'rolling' && this.sim.state.atRest) {
      this.phase = 'aiming';
    }
    return events;
  }

  retry(): void {
    this.sim.reset();
    this.strokes = 0;
    this.penalties = 0;
    this.shots = [];
    this.phase = 'reading';
  }

  get stars(): number {
    return starsFor(this.strokes, this.hole.par);
  }

  get relativeScore(): number {
    return this.strokes - this.hole.par;
  }

  result(): HoleResult {
    return {
      holeId: this.hole.id,
      par: this.hole.par,
      strokes: this.strokes,
      stars: this.stars,
      name: scoreName(this.strokes, this.hole.par),
      shots: this.shots.slice(),
    };
  }
}
