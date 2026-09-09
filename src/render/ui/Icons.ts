import Phaser from 'phaser';
import { COLORS } from '../theme';

/**
 * Vector icon vocabulary. The game shows no text during play (CLAUDE.md), so
 * every affordance and every readout has to be a shape drawn here.
 *
 * Each function draws into a Graphics centred on (0, 0) at a nominal radius of
 * `r`, so icons compose into buttons without per-call layout maths.
 */

export function star(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, filled: boolean): void {
  const pts: Phaser.Geom.Point[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.44;
    pts.push(new Phaser.Geom.Point(x + Math.cos(a) * rad, y + Math.sin(a) * rad));
  }
  if (filled) {
    g.fillStyle(COLORS.star, 1);
    g.fillPoints(pts, true, true);
    g.lineStyle(2, COLORS.ink, 0.4);
    g.strokePoints(pts, true, true);
  } else {
    g.lineStyle(3, COLORS.starEmpty, 1);
    g.strokePoints(pts, true, true);
  }
}

/** Golf-hole flag, used as the "hole" glyph and on the pack cards. */
export function flag(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number = COLORS.cream): void {
  g.lineStyle(Math.max(2, r * 0.16), color, 1);
  g.lineBetween(x - r * 0.3, y + r, x - r * 0.3, y - r);
  g.fillStyle(COLORS.flag, 1);
  g.fillPoints(
    [
      new Phaser.Geom.Point(x - r * 0.3, y - r),
      new Phaser.Geom.Point(x + r * 0.85, y - r * 0.62),
      new Phaser.Geom.Point(x - r * 0.3, y - r * 0.24),
    ],
    true,
    true,
  );
}

export function chevron(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, dir: 1 | -1, color: number = COLORS.cream): void {
  g.lineStyle(Math.max(3, r * 0.3), color, 1);
  g.beginPath();
  g.moveTo(x - r * 0.35 * dir, y - r * 0.6);
  g.lineTo(x + r * 0.4 * dir, y);
  g.lineTo(x - r * 0.35 * dir, y + r * 0.6);
  g.strokePath();
}

/** Circular arrow: retry. */
export function retry(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number = COLORS.cream): void {
  g.lineStyle(Math.max(3, r * 0.26), color, 1);
  g.beginPath();
  g.arc(x, y, r * 0.66, Phaser.Math.DegToRad(50), Phaser.Math.DegToRad(340));
  g.strokePath();
  const a = Phaser.Math.DegToRad(50);
  const hx = x + Math.cos(a) * r * 0.66;
  const hy = y + Math.sin(a) * r * 0.66;
  g.fillStyle(color, 1);
  g.fillPoints(
    [
      new Phaser.Geom.Point(hx + r * 0.3, hy - r * 0.1),
      new Phaser.Geom.Point(hx - r * 0.16, hy - r * 0.34),
      new Phaser.Geom.Point(hx - r * 0.06, hy + r * 0.32),
    ],
    true,
    true,
  );
}

/** Grid of nine squares: back to the course list. */
export function grid(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number = COLORS.cream): void {
  const cell = r * 0.42;
  const gap = r * 0.62;
  g.fillStyle(color, 1);
  for (let iy = -1; iy <= 1; iy++) {
    for (let ix = -1; ix <= 1; ix++) {
      g.fillRect(x + ix * gap - cell / 2, y + iy * gap - cell / 2, cell, cell);
    }
  }
}

export function speaker(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, muted: boolean, color: number = COLORS.cream): void {
  g.fillStyle(color, 1);
  g.fillPoints(
    [
      new Phaser.Geom.Point(x - r * 0.7, y - r * 0.28),
      new Phaser.Geom.Point(x - r * 0.3, y - r * 0.28),
      new Phaser.Geom.Point(x + r * 0.15, y - r * 0.7),
      new Phaser.Geom.Point(x + r * 0.15, y + r * 0.7),
      new Phaser.Geom.Point(x - r * 0.3, y + r * 0.28),
      new Phaser.Geom.Point(x - r * 0.7, y + r * 0.28),
    ],
    true,
    true,
  );
  if (muted) {
    g.lineStyle(Math.max(3, r * 0.2), COLORS.power2, 1);
    g.lineBetween(x + r * 0.35, y - r * 0.4, x + r * 0.8, y + r * 0.4);
    g.lineBetween(x + r * 0.8, y - r * 0.4, x + r * 0.35, y + r * 0.4);
  } else {
    g.lineStyle(Math.max(2, r * 0.14), color, 1);
    for (let i = 1; i <= 2; i++) {
      g.beginPath();
      g.arc(x + r * 0.25, y, r * (0.2 + i * 0.24), Phaser.Math.DegToRad(-55), Phaser.Math.DegToRad(55));
      g.strokePath();
    }
  }
}

export function padlock(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number = COLORS.creamDim): void {
  g.lineStyle(Math.max(3, r * 0.2), color, 1);
  g.beginPath();
  g.arc(x, y - r * 0.22, r * 0.42, Math.PI, Math.PI * 2);
  g.strokePath();
  g.fillStyle(color, 1);
  g.fillRoundedRect(x - r * 0.6, y - r * 0.2, r * 1.2, r * 0.95, r * 0.18);
}

/**
 * Dice-style pip cluster for the numbers 1..9, so hole indices and stroke
 * counts read at a glance without a font.
 */
export function pips(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, n: number, color: number = COLORS.cream): void {
  const count = Math.max(0, Math.min(9, n));
  const layout = PIP_LAYOUTS[count];
  const step = r * 0.62;
  const dot = Math.max(2, r * 0.19);
  g.fillStyle(color, 1);
  for (const [cx, cy] of layout) {
    g.fillCircle(x + cx * step, y + cy * step, dot);
  }
}

/** Pip positions on a 3x3 lattice, in units of one cell. */
const PIP_LAYOUTS: [number, number][][] = [
  [],
  [[0, 0]],
  [[-1, -1], [1, 1]],
  [[-1, -1], [0, 0], [1, 1]],
  [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [1, 1]],
  [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
  [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
];

/** A stroke-count pip row, filling left to right and wrapping into a second row. */
export function strokeRow(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  count: number,
  radius: number,
  gap: number,
  color: number = COLORS.cream,
): void {
  const perRow = 6;
  g.fillStyle(color, 1);
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    g.fillCircle(x + col * gap, y + row * gap, radius);
  }
}
