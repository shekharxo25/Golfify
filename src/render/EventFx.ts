import { MAX_SHOT_SPEED } from '../sim/config';
import type { SimEvent } from '../sim/physics/state';
import type { Sfx } from './audio/Sfx';
import type { BallView } from './views/BallView';
import type { ElementView } from './views/ElementView';
import type { FxView } from './views/FxView';

export interface FxTargets {
  fx: FxView;
  sfx: Sfx;
  ball: BallView;
  elements: ElementView;
  /** Camera shake, 0..1 of the configured maximum. */
  shake: (strength: number) => void;
}

/**
 * Turns the simulation's event stream into sound, particles and camera shake.
 *
 * Kept apart from PlayScene because it is a pure fan-out: one switch over the
 * event union, no state of its own. The sim decides what happened; this decides
 * only how it feels.
 */
export function applyEvents(events: SimEvent[], t: FxTargets, ballAngle: number): void {
  for (const e of events) {
    switch (e.k) {
      case 'wall': {
        const strength = Math.min(1, e.speed / MAX_SHOT_SPEED);
        t.fx.wallHit(e.x, e.y, strength, ballAngle + Math.PI);
        t.sfx.wall(strength);
        t.ball.impact(e.speed, ballAngle);
        if (strength > 0.45) t.shake(strength);
        break;
      }
      case 'graze':
        // Deliberately quiet: a graze is the ball behaving, not colliding.
        break;
      case 'bumper': {
        const strength = Math.min(1, e.speed / MAX_SHOT_SPEED);
        t.elements.hitBumper(e.i);
        t.fx.bumperHit(e.x, e.y, strength);
        t.sfx.bumper(strength);
        t.ball.impact(e.speed, ballAngle);
        t.shake(0.5 + strength * 0.5);
        break;
      }
      case 'mover': {
        const strength = Math.min(1, e.speed / MAX_SHOT_SPEED);
        t.fx.wallHit(e.x, e.y, strength, ballAngle + Math.PI);
        t.sfx.wall(strength);
        t.ball.impact(e.speed, ballAngle);
        t.shake(strength * 0.8);
        break;
      }
      case 'boost':
        t.fx.boost(e.x, e.y);
        t.sfx.boost();
        break;
      case 'portal':
        t.fx.portal(e.x, e.y, e.fromA);
        t.fx.portal(e.ex, e.ey, !e.fromA);
        t.sfx.portal();
        break;
      case 'surface':
        if (e.to === 'sand') t.sfx.sand();
        break;
      case 'water':
        t.fx.splash(e.x, e.y);
        t.sfx.water();
        t.ball.reset();
        break;
      case 'oob':
        t.fx.oob(e.x, e.y);
        t.sfx.back();
        t.ball.reset();
        break;
      case 'lipout':
        t.fx.lipOut(e.x, e.y);
        t.sfx.lipOut();
        break;
      case 'sunk':
        t.fx.sunk(e.x, e.y);
        t.sfx.sunk();
        t.shake(0.6);
        break;
      case 'rest':
        break;
    }
  }
}
