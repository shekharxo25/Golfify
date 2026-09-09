import Phaser from 'phaser';
import { PORTAL_DEFAULT_RADIUS } from '../../sim/config';
import type { World } from '../../sim/physics/world';
import type { Pt } from '../../sim/types';
import { latticeInPoly } from '../gfx/pattern';
import { DEPTH } from '../renderConfig';
import { COLORS, desaturate } from '../theme';

/** How long a bumper stays lit after it is struck, in ms. */
const BUMPER_FLASH_MS = 220;
/** Conveyor chevrons scroll at this fraction of the belt's own accel, px/s. */
const BELT_SCROLL = 90;

/**
 * The parts of a hole that move. Cleared and redrawn every frame from the
 * world's live kinematic state — the sim has already advanced `dynSegs` to the
 * current step, so this view never has to know how a windmill works.
 */
export class ElementView {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly belts: { poly: Pt[]; dx: number; dy: number; marks: Pt[] }[];
  private readonly pads: { dx: number; dy: number; marks: Pt[] }[];
  private readonly bumperFlash: number[];
  private elapsed = 0;
  private readonly grey: boolean;

  constructor(scene: Phaser.Scene, private readonly world: World, greyscale: boolean) {
    this.grey = greyscale;
    this.g = scene.add.graphics().setDepth(DEPTH.elements);
    this.bumperFlash = new Array(world.bumpers.length).fill(0);
    this.belts = world.conveyors.map((c) => ({
      poly: c.poly,
      dx: c.dx,
      dy: c.dy,
      marks: latticeInPoly(c.poly, 44),
    }));
    // Lattices are point-in-polygon work; compute them once, not per frame.
    this.pads = world.boosts.map((b) => ({
      dx: b.dx,
      dy: b.dy,
      marks: latticeInPoly(b.poly, 40),
    }));
  }

  private tint(color: number): number {
    return this.grey ? desaturate(color) : color;
  }

  /** Light a bumper up; called from the sim's collision events. */
  hitBumper(index: number): void {
    if (index >= 0 && index < this.bumperFlash.length) {
      this.bumperFlash[index] = BUMPER_FLASH_MS;
    }
  }

  update(deltaMs: number): void {
    this.elapsed += deltaMs;
    for (let i = 0; i < this.bumperFlash.length; i++) {
      if (this.bumperFlash[i] > 0) this.bumperFlash[i] -= deltaMs;
    }
    const g = this.g;
    g.clear();
    this.drawBelts(g);
    this.drawBoostArrows(g);
    this.drawPortals(g);
    this.drawMovers(g);
    this.drawWindmills(g);
    this.drawBumpers(g);
  }

  /** Chevrons scrolling along the belt direction: the motion is the signage. */
  private drawBelts(g: Phaser.GameObjects.Graphics): void {
    const phase = ((this.elapsed / 1000) * BELT_SCROLL) % 44;
    g.lineStyle(4, this.tint(COLORS.conveyorArrow), 0.85);
    for (const belt of this.belts) {
      const ox = belt.dx * phase;
      const oy = belt.dy * phase;
      const px = -belt.dy;
      const py = belt.dx;
      for (const [mx, my] of belt.marks) {
        const cx = mx + ox;
        const cy = my + oy;
        // A chevron pointing down-belt: two strokes back from the tip.
        const tipX = cx + belt.dx * 9;
        const tipY = cy + belt.dy * 9;
        const backX = cx - belt.dx * 5;
        const backY = cy - belt.dy * 5;
        g.lineBetween(tipX, tipY, backX + px * 9, backY + py * 9);
        g.lineBetween(tipX, tipY, backX - px * 9, backY - py * 9);
      }
    }
  }

  /** Boost pads pulse a bank of arrows in their launch direction. */
  private drawBoostArrows(g: Phaser.GameObjects.Graphics): void {
    const pulse = 0.55 + 0.45 * Math.sin(this.elapsed / 150);
    for (const boost of this.pads) {
      const marks = boost.marks;
      const px = -boost.dy;
      const py = boost.dx;
      g.lineStyle(5, this.tint(COLORS.ink), 0.35 + 0.45 * pulse);
      for (const [mx, my] of marks) {
        const tipX = mx + boost.dx * 13;
        const tipY = my + boost.dy * 13;
        g.lineBetween(tipX, tipY, mx - boost.dx * 4 + px * 11, my - boost.dy * 4 + py * 11);
        g.lineBetween(tipX, tipY, mx - boost.dx * 4 - px * 11, my - boost.dy * 4 - py * 11);
      }
    }
  }

  /** Portal mouths: counter-rotating rings, one per end, colour-paired. */
  private drawPortals(g: Phaser.GameObjects.Graphics): void {
    const spin = this.elapsed / 420;
    for (const portal of this.world.portals) {
      const ends = [
        { m: portal.a, color: COLORS.portalA, dir: 1 },
        { m: portal.b, color: COLORS.portalB, dir: -1 },
      ];
      for (const { m, color, dir } of ends) {
        const r = m.r || PORTAL_DEFAULT_RADIUS;
        g.fillStyle(this.tint(COLORS.voidDeep), 0.85);
        g.fillCircle(m.x, m.y, r);
        // Three arcs spun around the rim so the mouth reads as an opening.
        g.lineStyle(5, this.tint(color), 0.95);
        for (let i = 0; i < 3; i++) {
          const a0 = spin * dir + (i * Math.PI * 2) / 3;
          g.beginPath();
          g.arc(m.x, m.y, r - 3, a0, a0 + 1.15);
          g.strokePath();
        }
        // A stub along `facing` shows which way the ball will be spat out.
        g.lineStyle(4, this.tint(color), 0.6);
        g.lineBetween(
          m.x + Math.cos(m.facing) * (r - 6),
          m.y + Math.sin(m.facing) * (r - 6),
          m.x + Math.cos(m.facing) * (r + 12),
          m.y + Math.sin(m.facing) * (r + 12),
        );
        g.fillStyle(this.tint(color), 0.22);
        g.fillCircle(m.x, m.y, r * (0.35 + 0.1 * Math.sin(this.elapsed / 260)));
      }
    }
  }

  private drawMovers(g: Phaser.GameObjects.Graphics): void {
    for (const seg of this.world.dynSegs) {
      if (seg.kind !== 'mover') continue;
      const s = seg.seg;
      g.lineStyle(17, this.tint(COLORS.wallEdge), 1);
      g.lineBetween(s.ax, s.ay + 4, s.bx, s.by + 4);
      g.lineStyle(14, this.tint(COLORS.mover), 1);
      g.lineBetween(s.ax, s.ay, s.bx, s.by);
      g.lineStyle(2.5, this.tint(COLORS.cream), 0.35);
      g.lineBetween(s.ax, s.ay - 4, s.bx, s.by - 4);
    }
  }

  private drawWindmills(g: Phaser.GameObjects.Graphics): void {
    for (const seg of this.world.dynSegs) {
      if (seg.kind !== 'windmill') continue;
      const s = seg.seg;
      g.lineStyle(16, this.tint(COLORS.wallEdge), 0.85);
      g.lineBetween(s.ax, s.ay + 4, s.bx, s.by + 4);
      g.lineStyle(13, this.tint(COLORS.windmill), 1);
      g.lineBetween(s.ax, s.ay, s.bx, s.by);
      g.fillStyle(this.tint(COLORS.windmill), 1);
      g.fillCircle(s.bx, s.by, 7);
    }
    for (const wm of this.world.windmills) {
      g.fillStyle(this.tint(COLORS.ink), 1);
      g.fillCircle(wm.cx, wm.cy, wm.hubR + 5);
      g.fillStyle(this.tint(COLORS.cream), 0.9);
      g.fillCircle(wm.cx, wm.cy, wm.hubR - 2);
    }
  }

  private drawBumpers(g: Phaser.GameObjects.Graphics): void {
    for (let i = 0; i < this.world.bumpers.length; i++) {
      const b = this.world.bumpers[i];
      const lit = Math.max(0, this.bumperFlash[i]) / BUMPER_FLASH_MS;
      const breathe = 1 + 0.03 * Math.sin(this.elapsed / 400 + i);
      const r = b.r * breathe + lit * 4;
      g.fillStyle(this.tint(COLORS.ink), 0.5);
      g.fillCircle(b.x, b.y + 5, r);
      g.fillStyle(this.tint(lit > 0 ? COLORS.bumperLit : COLORS.bumper), 1);
      g.fillCircle(b.x, b.y, r);
      g.fillStyle(this.tint(COLORS.cream), 0.25 + lit * 0.6);
      g.fillCircle(b.x - r * 0.22, b.y - r * 0.26, r * 0.42);
      g.lineStyle(3, this.tint(COLORS.cream), 0.35 + lit * 0.5);
      g.strokeCircle(b.x, b.y, r - 2);
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
