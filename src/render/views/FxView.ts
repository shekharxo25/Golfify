import Phaser from 'phaser';
import { makeRng, nextFloat } from '../../sim/math/rng';
import { DEPTH, RIPPLE_LIFE_MS, SPARK_LIFE_MS } from '../renderConfig';
import { COLORS, desaturate } from '../theme';

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  color: number;
}

interface Ring {
  x: number;
  y: number;
  life: number;
  max: number;
  from: number;
  to: number;
  color: number;
  width: number;
}

/**
 * Short-lived visual feedback for collision events.
 *
 * Deliberately a hand-rolled particle list rather than Phaser's emitters: the
 * bursts are a handful of dots each, they must be driven by discrete sim
 * events rather than a continuous emission rate, and this keeps the whole
 * effect layer to one Graphics object.
 */
export class FxView {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly sparks: Spark[] = [];
  private readonly rings: Ring[] = [];
  /** Effects are cosmetic, so an unseeded stream would be fine — seeded is free. */
  private readonly rng = makeRng(0xc0ffee);
  private readonly grey: boolean;

  constructor(scene: Phaser.Scene, greyscale: boolean) {
    this.grey = greyscale;
    this.g = scene.add.graphics().setDepth(DEPTH.fx);
  }

  private tint(color: number): number {
    return this.grey ? desaturate(color) : color;
  }

  private burst(x: number, y: number, count: number, speed: number, color: number, r = 3): void {
    for (let i = 0; i < count; i++) {
      const a = nextFloat(this.rng) * Math.PI * 2;
      const s = speed * (0.4 + nextFloat(this.rng) * 0.6);
      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: SPARK_LIFE_MS,
        max: SPARK_LIFE_MS,
        r: r * (0.6 + nextFloat(this.rng) * 0.8),
        color,
      });
    }
  }

  /** A directional spray, used where the impact has an obvious normal. */
  private fan(x: number, y: number, angle: number, count: number, speed: number, color: number): void {
    for (let i = 0; i < count; i++) {
      const a = angle + (nextFloat(this.rng) - 0.5) * 1.6;
      const s = speed * (0.4 + nextFloat(this.rng) * 0.6);
      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: SPARK_LIFE_MS,
        max: SPARK_LIFE_MS,
        r: 2 + nextFloat(this.rng) * 2,
        color,
      });
    }
  }

  wallHit(x: number, y: number, strength: number, angle: number): void {
    this.fan(x, y, angle, 3 + Math.round(strength * 6), 90 + strength * 180, COLORS.cream);
  }

  bumperHit(x: number, y: number, strength: number): void {
    this.burst(x, y, 6 + Math.round(strength * 8), 130 + strength * 220, COLORS.bumperLit, 3.5);
    this.rings.push({
      x,
      y,
      life: 340,
      max: 340,
      from: 12,
      to: 52,
      color: COLORS.bumperLit,
      width: 5,
    });
  }

  boost(x: number, y: number): void {
    this.burst(x, y, 10, 220, COLORS.boost, 3);
  }

  portal(x: number, y: number, entering: boolean): void {
    const color = entering ? COLORS.portalA : COLORS.portalB;
    this.rings.push({ x, y, life: 420, max: 420, from: 34, to: 4, color, width: 4 });
    this.burst(x, y, 8, 140, color, 2.6);
  }

  splash(x: number, y: number): void {
    this.burst(x, y, 14, 160, COLORS.waterWave, 3.5);
    this.rings.push({ x, y, life: RIPPLE_LIFE_MS, max: RIPPLE_LIFE_MS, from: 8, to: 62, color: COLORS.waterWave, width: 4 });
    this.rings.push({ x, y, life: RIPPLE_LIFE_MS * 0.7, max: RIPPLE_LIFE_MS * 0.7, from: 4, to: 38, color: COLORS.cream, width: 2 });
  }

  sunk(x: number, y: number): void {
    this.burst(x, y, 22, 260, COLORS.star, 4);
    this.rings.push({ x, y, life: 560, max: 560, from: 16, to: 96, color: COLORS.star, width: 6 });
  }

  lipOut(x: number, y: number): void {
    this.rings.push({ x, y, life: 300, max: 300, from: 22, to: 40, color: COLORS.cream, width: 3 });
  }

  oob(x: number, y: number): void {
    this.burst(x, y, 10, 130, COLORS.creamDim, 3);
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    const g = this.g;
    g.clear();

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= deltaMs;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.94;
      s.vy *= 0.94;
      const t = s.life / s.max;
      g.fillStyle(this.tint(s.color), t * 0.9);
      g.fillCircle(s.x, s.y, s.r * (0.4 + t * 0.6));
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= deltaMs;
      if (r.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const t = 1 - r.life / r.max;
      const radius = r.from + (r.to - r.from) * t;
      g.lineStyle(r.width * (1 - t * 0.6), this.tint(r.color), (1 - t) * 0.85);
      g.strokeCircle(r.x, r.y, Math.max(1, radius));
    }
  }

  clear(): void {
    this.sparks.length = 0;
    this.rings.length = 0;
    this.g.clear();
  }

  destroy(): void {
    this.g.destroy();
  }
}
