import type { Bounds, Pt, Vec2 } from '../types';

export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export interface Aabb {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Even-odd crossing test. Points exactly on an edge are treated consistently
 * (the `>` / `<=` asymmetry makes the result stable) which matters because the
 * ball frequently rests on a polygon boundary.
 */
export function pointInPoly(px: number, py: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    if (yi > py !== yj > py) {
      const t = (py - yi) / (yj - yi);
      if (px < xi + t * (xj - xi)) inside = !inside;
    }
  }
  return inside;
}

export function polyBounds(poly: Pt[]): Aabb {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of poly) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function polyCentroid(poly: Pt[]): Vec2 {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const cr = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    a += cr;
    cx += (poly[j][0] + poly[i][0]) * cr;
    cy += (poly[j][1] + poly[i][1]) * cr;
  }
  if (Math.abs(a) < 1e-9) {
    const b = polyBounds(poly);
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function polySignedArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  }
  return a / 2;
}

/** Closest point on segment AB to P, plus the parametric position along AB. */
export function closestOnSegment(
  px: number,
  py: number,
  s: Segment,
): { x: number; y: number; t: number; d2: number } {
  const ex = s.bx - s.ax;
  const ey = s.by - s.ay;
  const l2 = ex * ex + ey * ey;
  let t = 0;
  if (l2 > 0) {
    t = ((px - s.ax) * ex + (py - s.ay) * ey) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  const x = s.ax + ex * t;
  const y = s.ay + ey * t;
  const dx = px - x;
  const dy = py - y;
  return { x, y, t, d2: dx * dx + dy * dy };
}

export function segmentAabb(s: Segment, pad = 0): Aabb {
  return {
    minX: Math.min(s.ax, s.bx) - pad,
    minY: Math.min(s.ay, s.by) - pad,
    maxX: Math.max(s.ax, s.bx) + pad,
    maxY: Math.max(s.ay, s.by) + pad,
  };
}

export function boundsToAabb(b: Bounds): Aabb {
  return { minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h };
}

export function aabbOverlap(a: Aabb, b: Aabb): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** Rectangle as a closed polygon, wound clockwise in screen space. */
export function rectPoly(x: number, y: number, w: number, h: number): Pt[] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

/** The four wall segments of an axis-aligned rectangle. */
export function rectWalls(x: number, y: number, w: number, h: number): { a: Pt; b: Pt }[] {
  const p = rectPoly(x, y, w, h);
  return [
    { a: p[0], b: p[1] },
    { a: p[1], b: p[2] },
    { a: p[2], b: p[3] },
    { a: p[3], b: p[0] },
  ];
}
