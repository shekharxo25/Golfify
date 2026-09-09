import { DAMPING } from '../config';
import type { Aabb } from '../math/geom';
import { pointInPoly } from '../math/geom';
import type { Pt, Surface } from '../types';
import type { World } from './world';

/** AABB reject before the crossing test — most regions are far from the ball. */
export function inRegion(x: number, y: number, aabb: Aabb, poly: Pt[]): boolean {
  if (x < aabb.minX || x > aabb.maxX || y < aabb.minY || y > aabb.maxY) return false;
  return pointInPoly(x, y, poly);
}

export interface SurfaceInfo {
  surface: Surface;
  damping: number;
}

const GREEN_INFO: SurfaceInfo = { surface: 'green', damping: DAMPING.green };

/**
 * Which surface the ball centre is over (SPEC 5.3). Regions are pre-sorted by
 * priority in buildWorld, so the first containment hit is the answer: water
 * beats sand beats ice beats conveyor beats rough beats the plain green.
 */
export function findSurface(w: World, x: number, y: number): SurfaceInfo {
  for (let i = 0; i < w.surfaces.length; i++) {
    const s = w.surfaces[i];
    if (inRegion(x, y, s.aabb, s.poly)) return s;
  }
  return GREEN_INFO;
}

/**
 * Out of bounds is "outside every playable region" (SPEC 6.2). Hazards count as
 * in bounds because they carry their own penalty; rough placed outside the
 * green polygon therefore works as a designed run-off area.
 */
export function isInBounds(w: World, x: number, y: number): boolean {
  for (let i = 0; i < w.greens.length; i++) {
    if (inRegion(x, y, w.greenAabbs[i], w.greens[i])) return true;
  }
  for (let i = 0; i < w.surfaces.length; i++) {
    const s = w.surfaces[i];
    if (inRegion(x, y, s.aabb, s.poly)) return true;
  }
  return false;
}

export function isWater(w: World, x: number, y: number): boolean {
  for (let i = 0; i < w.surfaces.length; i++) {
    const s = w.surfaces[i];
    if (s.surface === 'water' && inRegion(x, y, s.aabb, s.poly)) return true;
  }
  return false;
}
