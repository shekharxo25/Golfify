import Phaser from 'phaser';
import { BALL_RADIUS, CUP_RADIUS } from '../../sim/config';
import type { World } from '../../sim/physics/world';
import { DEPTH } from '../renderConfig';
import { COLORS, SURFACE_STYLES, desaturate } from '../theme';
import { paintSurface, toPhaserPoints } from '../gfx/pattern';

/**
 * Everything about a hole that never moves: greens, hazards, walls, the cup.
 *
 * Baked once into a small number of Graphics objects at load. Nothing here is
 * touched again during play, so the per-frame cost of a hole is the ball, the
 * aim line and whatever kinematic elements it happens to have.
 */
export class CourseView {
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly surfaces: Phaser.GameObjects.Graphics;
  private readonly cupG: Phaser.GameObjects.Graphics;
  private readonly walls: Phaser.GameObjects.Graphics;
  private readonly grey: boolean;

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
    greyscale: boolean,
  ) {
    this.grey = greyscale;
    this.ground = scene.add.graphics().setDepth(DEPTH.ground);
    this.surfaces = scene.add.graphics().setDepth(DEPTH.surfaces);
    this.cupG = scene.add.graphics().setDepth(DEPTH.cup);
    this.walls = scene.add.graphics().setDepth(DEPTH.walls);
    this.draw();
  }

  private tint(color: number): number {
    return this.grey ? desaturate(color) : color;
  }

  private draw(): void {
    this.drawGround();
    this.drawSurfaces();
    this.drawCup();
    this.drawWalls();
  }

  /** A dropped-shadow slab under the playfield, so the hole reads as an object. */
  private drawGround(): void {
    const b = this.world.bounds;
    const g = this.ground;
    g.fillStyle(this.tint(COLORS.voidDeep), 1);
    g.fillRect(b.minX - 400, b.minY - 400, b.maxX - b.minX + 800, b.maxY - b.minY + 800);

    for (const poly of this.world.greens) {
      g.fillStyle(0x000000, 0.32);
      g.fillPoints(toPhaserPoints(poly.map((p) => [p[0] + 7, p[1] + 12])), true, true);
    }
  }

  private drawSurfaces(): void {
    const g = this.surfaces;
    for (const poly of this.world.greens) {
      paintSurface(g, poly, SURFACE_STYLES.green, { greyscale: this.grey });
      g.lineStyle(3, this.tint(COLORS.greenShade), 0.9);
      g.strokePoints(toPhaserPoints(poly), true, true);
    }

    // Painted low to high priority so water reads on top of the sand it cuts into.
    const ordered = [...this.world.surfaces].sort((a, b) => a.priority - b.priority);
    for (const region of ordered) {
      if (region.surface === 'conveyor') {
        // The conveyor's belt plate is static; its chevrons animate elsewhere.
        paintSurface(g, region.poly, SURFACE_STYLES.conveyor, { greyscale: this.grey });
        g.lineStyle(2, this.tint(COLORS.ink), 0.5);
        g.strokePoints(toPhaserPoints(region.poly), true, true);
        continue;
      }
      const style = SURFACE_STYLES[region.surface];
      paintSurface(g, region.poly, style, { greyscale: this.grey });
      if (region.surface === 'water') {
        g.lineStyle(3, this.tint(COLORS.waterDeep), 1);
        g.strokePoints(toPhaserPoints(region.poly), true, true);
      }
    }

    for (const boost of this.world.boosts) {
      g.fillStyle(this.tint(COLORS.boost), 0.9);
      g.fillPoints(toPhaserPoints(boost.poly), true, true);
      g.lineStyle(3, this.tint(COLORS.ink), 0.55);
      g.strokePoints(toPhaserPoints(boost.poly), true, true);
    }
  }

  /** Cup: a dark well with a rim highlight, plus a flag to find it from afar. */
  private drawCup(): void {
    const { x, y } = this.world.cup;
    const g = this.cupG;
    g.fillStyle(this.tint(COLORS.cupRim), 1);
    g.fillCircle(x, y, CUP_RADIUS + 4);
    g.fillStyle(this.tint(COLORS.cupHole), 1);
    g.fillCircle(x, y, CUP_RADIUS);
    g.lineStyle(2.5, this.tint(COLORS.cream), 0.22);
    g.beginPath();
    g.arc(x, y, CUP_RADIUS - 1, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340));
    g.strokePath();

    // Flag: pole plus pennant, leaning slightly so it never looks stamped on.
    const poleH = 78;
    g.lineStyle(4, this.tint(COLORS.cream), 0.9);
    g.lineBetween(x, y - 4, x + 6, y - poleH);
    g.fillStyle(this.tint(COLORS.flag), 1);
    g.fillPoints(
      [
        new Phaser.Geom.Point(x + 6, y - poleH),
        new Phaser.Geom.Point(x + 52, y - poleH + 13),
        new Phaser.Geom.Point(x + 6, y - poleH + 26),
      ],
      true,
      true,
    );

    // Tee: a pale disc the ball starts on, so the opening read has an anchor.
    const t = this.world.tee;
    g.lineStyle(3, this.tint(COLORS.cream), 0.35);
    g.strokeCircle(t.x, t.y, BALL_RADIUS + 8);
    g.fillStyle(this.tint(COLORS.cream), 0.12);
    g.fillCircle(t.x, t.y, BALL_RADIUS + 8);
  }

  /** Walls are drawn as capsules: a dark base with a lit top face. */
  private drawWalls(): void {
    const g = this.walls;
    for (const wall of this.world.walls) {
      const s = wall.seg;
      g.lineStyle(15, this.tint(COLORS.wallEdge), 1);
      g.lineBetween(s.ax, s.ay + 4, s.bx, s.by + 4);
    }
    for (const wall of this.world.walls) {
      const s = wall.seg;
      g.lineStyle(12, this.tint(COLORS.wall), 1);
      g.lineBetween(s.ax, s.ay, s.bx, s.by);
      g.fillStyle(this.tint(COLORS.wall), 1);
      g.fillCircle(s.ax, s.ay, 6);
      g.fillCircle(s.bx, s.by, 6);
    }
    // A hairline along the top edge reads as a bevel and separates wall from green.
    for (const wall of this.world.walls) {
      const s = wall.seg;
      g.lineStyle(2.5, this.tint(COLORS.cream), 0.3);
      g.lineBetween(s.ax, s.ay - 3.5, s.bx, s.by - 3.5);
    }
  }

  destroy(): void {
    this.ground.destroy();
    this.surfaces.destroy();
    this.cupG.destroy();
    this.walls.destroy();
  }
}
