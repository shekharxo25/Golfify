import Phaser from 'phaser';
import { BALL_RADIUS, PREVIEW_DOT_GAP, PREVIEW_FADE_FAR, PREVIEW_FADE_NEAR } from '../../sim/config';
import type { PreviewPath } from '../../sim/physics/simulation';
import { AIM_ARROW_MAX, AIM_RING_RADIUS, DEPTH, PREVIEW_DOT_R } from '../renderConfig';
import { COLORS, desaturate } from '../theme';

/**
 * The aim affordance: pull-back line, power ring, launch arrow, and the
 * forward-simulated trajectory.
 *
 * The dots come straight from Simulation.preview(), which runs the real solver
 * on a cloned state — so what the player is shown cannot disagree with what
 * the ball will do (SPEC 7.2).
 */
export class AimView {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly grey: boolean;

  constructor(scene: Phaser.Scene, greyscale: boolean) {
    this.grey = greyscale;
    this.g = scene.add.graphics().setDepth(DEPTH.aim);
  }

  private tint(color: number): number {
    return this.grey ? desaturate(color) : color;
  }

  clear(): void {
    this.g.clear();
  }

  /** Green through amber to red, so power reads without a number. */
  private powerColor(power: number): number {
    const from = power < 0.5 ? COLORS.power0 : COLORS.power1;
    const to = power < 0.5 ? COLORS.power1 : COLORS.power2;
    const t = power < 0.5 ? power * 2 : (power - 0.5) * 2;
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(from),
      Phaser.Display.Color.ValueToColor(to),
      100,
      Math.round(t * 100),
    );
    return this.tint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
  }

  draw(
    ballX: number,
    ballY: number,
    pullX: number,
    pullY: number,
    angleRad: number,
    power: number,
    preview: PreviewPath,
  ): void {
    const g = this.g;
    g.clear();
    const color = this.powerColor(power);

    this.drawPreview(g, preview);

    // The pull-back: a dashed tether from the ball to where the finger is.
    g.lineStyle(3, this.tint(COLORS.aim), 0.35);
    dashedLine(g, ballX, ballY, pullX, pullY, 12, 9);

    // Power ring: an arc that fills clockwise from straight up.
    g.lineStyle(7, this.tint(COLORS.void), 0.55);
    g.strokeCircle(ballX, ballY, AIM_RING_RADIUS);
    g.lineStyle(6, color, 1);
    g.beginPath();
    g.arc(ballX, ballY, AIM_RING_RADIUS, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * power);
    g.strokePath();

    // Launch arrow, in the direction the ball will actually leave.
    const len = BALL_RADIUS + 14 + AIM_ARROW_MAX * power;
    const tipX = ballX + Math.cos(angleRad) * len;
    const tipY = ballY + Math.sin(angleRad) * len;
    g.lineStyle(6, color, 0.95);
    g.lineBetween(
      ballX + Math.cos(angleRad) * (BALL_RADIUS + 12),
      ballY + Math.sin(angleRad) * (BALL_RADIUS + 12),
      tipX,
      tipY,
    );
    const wing = 15;
    const spread = 2.5;
    g.fillStyle(color, 0.95);
    g.fillPoints(
      [
        new Phaser.Geom.Point(tipX, tipY),
        new Phaser.Geom.Point(tipX + Math.cos(angleRad + spread) * wing, tipY + Math.sin(angleRad + spread) * wing),
        new Phaser.Geom.Point(tipX + Math.cos(angleRad - spread) * wing, tipY + Math.sin(angleRad - spread) * wing),
      ],
      true,
      true,
    );
  }

  /** Evenly spaced dots along the predicted path, fading with distance. */
  private drawPreview(g: Phaser.GameObjects.Graphics, preview: PreviewPath): void {
    const pts = preview.points;
    if (pts.length < 2) return;

    let carried = 0;
    let drawn = 0;
    const total = pathLength(pts);
    let travelled = 0;

    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (segLen <= 0) continue;
      let d = PREVIEW_DOT_GAP - carried;
      while (d <= segLen) {
        const t = d / segLen;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const frac = total > 0 ? (travelled + d) / total : 0;
        const alpha = PREVIEW_FADE_NEAR + (PREVIEW_FADE_FAR - PREVIEW_FADE_NEAR) * frac;
        g.fillStyle(this.tint(COLORS.aim), alpha);
        g.fillCircle(x, y, PREVIEW_DOT_R);
        d += PREVIEW_DOT_GAP;
        drawn++;
      }
      carried = (carried + segLen) % PREVIEW_DOT_GAP;
      travelled += segLen;
    }
    if (drawn === 0) return;

    // Terminal marker: what the shot ends in, as a shape rather than a word.
    const end = pts[pts.length - 1];
    if (preview.endedBy === 'sunk') {
      g.lineStyle(4, this.tint(COLORS.power0), 0.9);
      g.strokeCircle(end.x, end.y, 18);
    } else if (preview.endedBy === 'hazard') {
      g.lineStyle(5, this.tint(COLORS.power2), 0.9);
      g.lineBetween(end.x - 10, end.y - 10, end.x + 10, end.y + 10);
      g.lineBetween(end.x + 10, end.y - 10, end.x - 10, end.y + 10);
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}

function pathLength(pts: { x: number; y: number }[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return total;
}

function dashedLine(
  g: Phaser.GameObjects.Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dash: number,
  gap: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len <= 0) return;
  const ux = dx / len;
  const uy = dy / len;
  for (let d = 0; d < len; d += dash + gap) {
    const e = Math.min(d + dash, len);
    g.lineBetween(x1 + ux * d, y1 + uy * d, x1 + ux * e, y1 + uy * e);
  }
}
