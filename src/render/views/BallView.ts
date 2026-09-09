import Phaser from 'phaser';
import { BALL_RADIUS, MAX_SHOT_SPEED } from '../../sim/config';
import { DEPTH, SQUASH_MAX, SQUASH_RECOVER_MS, TRAIL_MIN_SPEED, TRAIL_POINTS } from '../renderConfig';
import { COLORS, desaturate } from '../theme';

export interface BallStyle {
  body: number;
  shade: number;
  alpha: number;
  depth: number;
  /** Ghosts draw no shadow, so they read as a replay rather than a second ball. */
  shadow: boolean;
}

export const PLAYER_STYLE: BallStyle = {
  body: COLORS.ball,
  shade: COLORS.ballShade,
  alpha: 1,
  depth: DEPTH.ball,
  shadow: true,
};

export const GHOST_STYLE: BallStyle = {
  body: COLORS.ghost,
  shade: COLORS.ghost,
  alpha: 0.42,
  depth: DEPTH.ghost,
  shadow: false,
};

/**
 * The ball: body, contact shadow, motion trail and impact squash.
 *
 * Squash is purely cosmetic and lives entirely here — the collision that
 * caused it was resolved by the solver several fixed steps ago. The renderer
 * is told "you were hit, this hard, along this normal" and deforms a circle.
 */
export class BallView {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly trail: { x: number; y: number }[] = [];
  private squash = 0;
  private squashAngle = 0;
  private readonly grey: boolean;

  constructor(
    scene: Phaser.Scene,
    private readonly style: BallStyle,
    greyscale: boolean,
  ) {
    this.grey = greyscale;
    this.g = scene.add.graphics().setDepth(style.depth);
  }

  private tint(color: number): number {
    return this.grey ? desaturate(color) : color;
  }

  /** Register an impact: `speed` scales the deformation, `angle` orients it. */
  impact(speed: number, angle: number): void {
    const amount = Math.min(1, speed / MAX_SHOT_SPEED);
    if (amount * SQUASH_MAX > this.squash) {
      this.squash = amount * SQUASH_MAX;
      this.squashAngle = angle;
    }
  }

  reset(): void {
    this.trail.length = 0;
    this.squash = 0;
  }

  setVisible(visible: boolean): void {
    this.g.setVisible(visible);
  }

  update(x: number, y: number, speed: number, deltaMs: number): void {
    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - (deltaMs / SQUASH_RECOVER_MS) * SQUASH_MAX);
    }

    if (speed > TRAIL_MIN_SPEED) {
      this.trail.push({ x, y });
      while (this.trail.length > TRAIL_POINTS) this.trail.shift();
    } else if (this.trail.length > 0) {
      this.trail.shift();
    }

    const g = this.g;
    g.clear();
    this.drawTrail(g);

    if (this.style.shadow) {
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(x + 3, y + 7, BALL_RADIUS * 2.05, BALL_RADIUS * 1.7);
    }

    // Squash along the impact normal, stretch across it: constant area.
    const sx = 1 - this.squash;
    const sy = 1 + this.squash;
    g.save();
    g.translateCanvas(x, y);
    g.rotateCanvas(this.squashAngle);
    g.scaleCanvas(sx, sy);
    g.fillStyle(this.tint(this.style.shade), this.style.alpha);
    g.fillCircle(0, 0, BALL_RADIUS);
    g.fillStyle(this.tint(this.style.body), this.style.alpha);
    g.fillCircle(0, -1.2, BALL_RADIUS - 1.2);
    g.fillStyle(this.tint(COLORS.cream), this.style.alpha * 0.85);
    g.fillCircle(-BALL_RADIUS * 0.3, -BALL_RADIUS * 0.34, BALL_RADIUS * 0.3);
    g.restore();
  }

  private drawTrail(g: Phaser.GameObjects.Graphics): void {
    for (let i = 0; i < this.trail.length; i++) {
      const t = (i + 1) / this.trail.length;
      const p = this.trail[i];
      g.fillStyle(this.tint(this.style.body), this.style.alpha * 0.3 * t);
      g.fillCircle(p.x, p.y, BALL_RADIUS * (0.35 + 0.5 * t));
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
