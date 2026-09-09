import Phaser from 'phaser';
import { polyBounds, pointInPoly } from '../../sim/math/geom';
import { makeRng, nextFloat } from '../../sim/math/rng';
import type { Pt } from '../../sim/types';
import { desaturate, type SurfaceStyle } from '../theme';

/**
 * Surface texturing without image assets or render-target masks.
 *
 * Patterns are clipped to a polygon analytically: horizontal scanlines are
 * intersected with the polygon edges to get x-spans, and marks are drawn only
 * inside those spans. Compared with a geometry mask this costs nothing at
 * runtime (everything is baked into one static Graphics per hole) and it
 * cannot go wrong when the camera zooms.
 */

/** Pattern marks are seeded, so a hole textures identically on every load. */
const PATTERN_SEED = 0x9e3779b9;

export interface PaintOpts {
  greyscale: boolean;
}

const tint = (color: number, grey: boolean): number => (grey ? desaturate(color) : color);

/** x-intersections of the horizontal line at `y` with the polygon, sorted. */
export function spansAtY(poly: Pt[], y: number): number[] {
  const xs: number[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi === yj) continue;
    const lo = Math.min(yi, yj);
    const hi = Math.max(yi, yj);
    if (y < lo || y >= hi) continue;
    xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
  }
  xs.sort((a, b) => a - b);
  return xs;
}

export const toPhaserPoints = (poly: Pt[]): Phaser.Geom.Point[] =>
  poly.map((p) => new Phaser.Geom.Point(p[0], p[1]));

/** Fill a polygon and lay its surface pattern over the top. */
export function paintSurface(
  g: Phaser.GameObjects.Graphics,
  poly: Pt[],
  style: SurfaceStyle,
  opts: PaintOpts,
): void {
  g.fillStyle(tint(style.fill, opts.greyscale), 1);
  g.fillPoints(toPhaserPoints(poly), true, true);
  paintPattern(g, poly, style, opts);
}

export function paintPattern(
  g: Phaser.GameObjects.Graphics,
  poly: Pt[],
  style: SurfaceStyle,
  opts: PaintOpts,
): void {
  const color = tint(style.patternColor, opts.greyscale);
  switch (style.pattern) {
    case 'stripes':
      return bands(g, poly, style.gap, color, style.alpha);
    case 'hatch':
      return hatch(g, poly, style.gap, color, style.alpha);
    case 'waves':
      return waves(g, poly, style.gap, color, style.alpha);
    case 'tufts':
      return tufts(g, poly, style.gap, color, style.alpha);
    case 'speckle':
      return speckle(g, poly, style.gap, color, style.alpha);
    case 'chevrons':
      return; // Conveyors animate their chevrons; see ElementView.
  }
}

/** Mown bands: every other stripe gets a lighter overlay. */
function bands(g: Phaser.GameObjects.Graphics, poly: Pt[], gap: number, color: number, alpha: number): void {
  const b = polyBounds(poly);
  g.fillStyle(color, alpha);
  let band = 0;
  for (let y = Math.floor(b.minY / gap) * gap; y < b.maxY; y += gap, band++) {
    if (band % 2 === 1) continue;
    for (let sub = 0; sub < gap; sub += 4) {
      const yy = y + sub;
      if (yy < b.minY || yy > b.maxY) continue;
      const xs = spansAtY(poly, yy);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        g.fillRect(xs[i], yy, xs[i + 1] - xs[i], 4);
      }
    }
  }
}

/** 45-degree hatching, clipped by walking scanlines and drawing dashes. */
function hatch(g: Phaser.GameObjects.Graphics, poly: Pt[], gap: number, color: number, alpha: number): void {
  const b = polyBounds(poly);
  g.lineStyle(2.5, color, alpha);
  const step = 3;
  // Diagonals of the form x - y = k. Walk each, emitting the in-polygon parts.
  for (let k = Math.floor((b.minX - b.maxY) / gap) * gap; k < b.maxX - b.minY; k += gap) {
    let penDown = false;
    let sx = 0;
    let sy = 0;
    for (let y = b.minY; y <= b.maxY; y += step) {
      const x = k + y;
      const inside = x >= b.minX && x <= b.maxX && pointInPoly(x, y, poly);
      if (inside && !penDown) {
        penDown = true;
        sx = x;
        sy = y;
      } else if (!inside && penDown) {
        penDown = false;
        g.lineBetween(sx, sy, k + (y - step), y - step);
      }
    }
    if (penDown) g.lineBetween(sx, sy, k + b.maxY, b.maxY);
  }
}

/** Horizontal wave crests, drawn as short dashes so the clip stays exact. */
function waves(g: Phaser.GameObjects.Graphics, poly: Pt[], gap: number, color: number, alpha: number): void {
  const b = polyBounds(poly);
  const seg = 9;
  const amp = 3.5;
  g.lineStyle(2.5, color, alpha);
  for (let y = Math.floor(b.minY / gap) * gap + gap * 0.5; y < b.maxY; y += gap) {
    for (let x = b.minX; x < b.maxX; x += seg) {
      const x2 = Math.min(x + seg, b.maxX);
      const y1 = y + Math.sin(x / 26) * amp;
      const y2 = y + Math.sin(x2 / 26) * amp;
      if (!pointInPoly((x + x2) / 2, (y1 + y2) / 2, poly)) continue;
      g.lineBetween(x, y1, x2, y2);
    }
  }
}

/** Grass tufts: little seeded v-shapes on a jittered lattice. */
function tufts(g: Phaser.GameObjects.Graphics, poly: Pt[], gap: number, color: number, alpha: number): void {
  const b = polyBounds(poly);
  const rng = makeRng(PATTERN_SEED);
  g.lineStyle(2.5, color, alpha);
  for (let y = b.minY; y < b.maxY; y += gap) {
    for (let x = b.minX; x < b.maxX; x += gap) {
      const px = x + nextFloat(rng) * gap;
      const py = y + nextFloat(rng) * gap;
      const h = 5 + nextFloat(rng) * 5;
      const lean = (nextFloat(rng) - 0.5) * 6;
      if (!pointInPoly(px, py, poly)) continue;
      g.lineBetween(px, py, px + lean - 3, py - h);
      g.lineBetween(px, py, px + lean + 3, py - h * 0.8);
    }
  }
}

/** Sand grain: dense seeded dots. */
function speckle(g: Phaser.GameObjects.Graphics, poly: Pt[], gap: number, color: number, alpha: number): void {
  const b = polyBounds(poly);
  const rng = makeRng(PATTERN_SEED ^ 0x51);
  g.fillStyle(color, alpha);
  for (let y = b.minY; y < b.maxY; y += gap) {
    for (let x = b.minX; x < b.maxX; x += gap) {
      const px = x + nextFloat(rng) * gap;
      const py = y + nextFloat(rng) * gap;
      if (!pointInPoly(px, py, poly)) continue;
      g.fillCircle(px, py, 1.1 + nextFloat(rng) * 1.5);
    }
  }
}

/** Lattice points inside a polygon; used for animated conveyor chevrons. */
export function latticeInPoly(poly: Pt[], gap: number): Pt[] {
  const b = polyBounds(poly);
  const out: Pt[] = [];
  for (let y = b.minY + gap * 0.5; y < b.maxY; y += gap) {
    for (let x = b.minX + gap * 0.5; x < b.maxX; x += gap) {
      if (pointInPoly(x, y, poly)) out.push([x, y]);
    }
  }
  return out;
}
