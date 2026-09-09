import { BALL_RADIUS } from '../sim/config';
import { rectPoly, rectWalls } from '../sim/math/geom';
import type { ElementDef, HazardDef, HoleData, Pt, WallDef } from '../sim/types';

/**
 * Synthetic holes for the physics gate tests. These bypass parseHole on
 * purpose: they are geometry fixtures, not levels, and several of them are
 * deliberately unplayable (no reachable cup) so the ball keeps rolling.
 */

export interface FixtureOptions {
  bounds?: [number, number, number, number];
  tee?: Pt;
  cup?: Pt;
  walls?: WallDef[];
  hazards?: HazardDef[];
  elements?: ElementDef[];
  /** Green polygon; defaults to the whole bounds so nothing is out of bounds. */
  green?: Pt[];
  seed?: number;
}

export function fixture(id: string, o: FixtureOptions = {}): HoleData {
  const [bx, by, bw, bh] = o.bounds ?? [0, 0, 2000, 2000];
  return {
    id,
    par: 3,
    bounds: { x: bx, y: by, w: bw, h: bh },
    tee: o.tee ?? [200, 200],
    cup: o.cup ?? [bx + bw - 100, by + bh - 100],
    greens: [{ poly: o.green ?? rectPoly(bx, by, bw, bh) }],
    walls: o.walls ?? [],
    hazards: o.hazards ?? [],
    elements: o.elements ?? [],
    seed: o.seed ?? 0x1234_5678,
  };
}

/** Box of zero-width walls with a few thin interior barriers to tunnel through. */
export const TUNNEL_BOX = { x: 400, y: 400, w: 900, h: 900 };

export function tunnelFixture(): HoleData {
  const outer = rectWalls(TUNNEL_BOX.x, TUNNEL_BOX.y, TUNNEL_BOX.w, TUNNEL_BOX.h);
  const inner: WallDef[] = [
    { a: [500, 700], b: [900, 700] },
    { a: [800, 900], b: [1200, 900] },
    { a: [700, 460], b: [700, 650] },
    { a: [1000, 1000], b: [1000, 1250] },
    { a: [450, 1000], b: [640, 1180] },
  ];
  return fixture('tunnel', {
    walls: [...outer, ...inner],
    tee: [600, 1150],
    // Far outside the box, so the cup can never end a shot early.
    cup: [1850, 1850],
  });
}

/** One long horizontal wall at y = wallY, ball starting just above it. */
export function grazeFixture(wallY = 500): HoleData {
  return fixture('graze', {
    walls: [{ a: [0, wallY], b: [2000, wallY] }],
    tee: [100, wallY - BALL_RADIUS - 1],
    cup: [1900, 1900],
  });
}

export function boxFixture(x: number, y: number, w: number, h: number, o: FixtureOptions = {}) {
  return fixture(o.seed !== undefined ? `box${o.seed}` : 'box', {
    ...o,
    walls: [...rectWalls(x, y, w, h), ...(o.walls ?? [])],
  });
}

/** Deterministic angle sweep: golden-ratio stride avoids axis-aligned clustering. */
export function goldenAngles(n: number): number[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(i * golden);
  return out;
}

export const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;
