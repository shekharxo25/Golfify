import {
  BALL_RADIUS,
  BOOST_DEFAULT_MULT,
  BUMPER_DEFAULT_RADIUS,
  BUMPER_RESTITUTION,
  CONVEYOR_DEFAULT_ACCEL,
  DAMPING,
  DEFAULT_SEED,
  MOVER_RESTITUTION,
  PORTAL_DEFAULT_RADIUS,
  WALL_RESTITUTION,
  WINDMILL_HUB_RADIUS,
} from '../config';
import type { Aabb, Segment } from '../math/geom';
import { boundsToAabb, polyBounds } from '../math/geom';
import type { HoleData, Pt, Surface, Vec2 } from '../types';
import { SegmentGrid } from './broadphase';

/* ------------------------------------------------------------------ *
 * Bodies
 * ------------------------------------------------------------------ */

export interface WallBody {
  seg: Segment;
  restitution: number;
}

export interface BumperBody {
  x: number;
  y: number;
  r: number;
  restitution: number;
}

export interface PortalMouthBody {
  x: number;
  y: number;
  r: number;
  facing: number;
}

export interface PortalBody {
  a: PortalMouthBody;
  b: PortalMouthBody;
}

export interface MoverBody {
  /** Segment geometry as authored, i.e. positioned at path[0]. */
  local: Segment[];
  p0: Vec2;
  p1: Vec2;
  periodMs: number;
  phase: number;
  /** Current offset from the authored position, refreshed by updateKinematics. */
  ox: number;
  oy: number;
  /** Current linear velocity in px/s. */
  vx: number;
  vy: number;
  /** Index into World.dynSegs of the first segment owned by this body. */
  segStart: number;
  segCount: number;
}

export interface WindmillBody {
  cx: number;
  cy: number;
  bladeLen: number;
  bladeCount: number;
  hubR: number;
  /** Angular velocity in rad/s. */
  omega: number;
  phase: number;
  /** Current blade-0 angle in radians, refreshed by updateKinematics. */
  angle: number;
  segStart: number;
  segCount: number;
}

/** A wall segment owned by a kinematic body. Coordinates are rewritten per step. */
export interface DynSeg {
  seg: Segment;
  restitution: number;
  kind: 'mover' | 'windmill';
  bodyIndex: number;
}

/* ------------------------------------------------------------------ *
 * Regions
 * ------------------------------------------------------------------ */

export interface SurfaceRegion {
  surface: Surface;
  poly: Pt[];
  aabb: Aabb;
  damping: number;
  /** Higher wins when two regions overlap. */
  priority: number;
}

export interface BoostRegion {
  poly: Pt[];
  aabb: Aabb;
  dx: number;
  dy: number;
  mult: number;
}

export interface ConveyorRegion {
  poly: Pt[];
  aabb: Aabb;
  dx: number;
  dy: number;
  accel: number;
}

/* ------------------------------------------------------------------ *
 * World
 * ------------------------------------------------------------------ */

export interface World {
  hole: HoleData;
  bounds: Aabb;
  tee: Vec2;
  cup: Vec2;
  seed: number;
  greens: Pt[][];
  greenAabbs: Aabb[];
  surfaces: SurfaceRegion[];
  boosts: BoostRegion[];
  conveyors: ConveyorRegion[];
  walls: WallBody[];
  grid: SegmentGrid;
  bumpers: BumperBody[];
  portals: PortalBody[];
  movers: MoverBody[];
  windmills: WindmillBody[];
  dynSegs: DynSeg[];
  /** True when the hole has no time-dependent geometry. */
  isStatic: boolean;
}

const SURFACE_PRIORITY: Record<Surface, number> = {
  water: 5,
  sand: 4,
  ice: 3,
  conveyor: 2,
  rough: 1,
  green: 0,
};

const mkSeg = (a: Pt, b: Pt): Segment => ({ ax: a[0], ay: a[1], bx: b[0], by: b[1] });

function normDir(d: Pt): { dx: number; dy: number } {
  const l = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
  return l > 0 ? { dx: d[0] / l, dy: d[1] / l } : { dx: 1, dy: 0 };
}

/**
 * Turn validated hole JSON into the flat, index-addressed structures the solver
 * walks every step. Called once per hole load, never during simulation.
 */
export function buildWorld(hole: HoleData): World {
  const bounds = boundsToAabb(hole.bounds);

  const greens = hole.greens.map((g) => g.poly);
  const greenAabbs = greens.map(polyBounds);

  const surfaces: SurfaceRegion[] = [];
  const boosts: BoostRegion[] = [];
  const conveyors: ConveyorRegion[] = [];
  const bumpers: BumperBody[] = [];
  const portals: PortalBody[] = [];
  const movers: MoverBody[] = [];
  const windmills: WindmillBody[] = [];

  for (const h of hole.hazards) {
    surfaces.push({
      surface: h.type,
      poly: h.poly,
      aabb: polyBounds(h.poly),
      damping: DAMPING[h.type],
      priority: SURFACE_PRIORITY[h.type],
    });
  }

  for (const el of hole.elements) {
    switch (el.type) {
      case 'boost': {
        const d = normDir(el.dir);
        boosts.push({
          poly: el.poly,
          aabb: polyBounds(el.poly),
          dx: d.dx,
          dy: d.dy,
          mult: el.mult ?? BOOST_DEFAULT_MULT,
        });
        break;
      }
      case 'bumper':
        bumpers.push({
          x: el.c[0],
          y: el.c[1],
          r: el.r ?? BUMPER_DEFAULT_RADIUS,
          restitution: el.restitution ?? BUMPER_RESTITUTION,
        });
        break;
      case 'portal':
        portals.push({
          a: {
            x: el.a.c[0],
            y: el.a.c[1],
            r: el.a.r ?? PORTAL_DEFAULT_RADIUS,
            facing: el.a.facing,
          },
          b: {
            x: el.b.c[0],
            y: el.b.c[1],
            r: el.b.r ?? PORTAL_DEFAULT_RADIUS,
            facing: el.b.facing,
          },
        });
        break;
      case 'mover':
        movers.push({
          local: el.segs.map((s) => mkSeg(s.a, s.b)),
          p0: { x: el.path[0][0], y: el.path[0][1] },
          p1: { x: el.path[1][0], y: el.path[1][1] },
          periodMs: el.periodMs,
          phase: el.phase ?? 0,
          ox: 0,
          oy: 0,
          vx: 0,
          vy: 0,
          segStart: 0,
          segCount: el.segs.length,
        });
        break;
      case 'windmill':
        windmills.push({
          cx: el.c[0],
          cy: el.c[1],
          bladeLen: el.bladeLen,
          bladeCount: el.bladeCount,
          hubR: WINDMILL_HUB_RADIUS,
          omega: (el.rpm / 60) * Math.PI * 2,
          phase: el.phase ?? 0,
          angle: 0,
          segStart: 0,
          segCount: el.bladeCount,
        });
        break;
      case 'conveyor': {
        const d = normDir(el.dir);
        const aabb = polyBounds(el.poly);
        conveyors.push({
          poly: el.poly,
          aabb,
          dx: d.dx,
          dy: d.dy,
          accel: el.accel ?? CONVEYOR_DEFAULT_ACCEL,
        });
        surfaces.push({
          surface: 'conveyor',
          poly: el.poly,
          aabb,
          damping: DAMPING.conveyor,
          priority: SURFACE_PRIORITY.conveyor,
        });
        break;
      }
    }
  }

  // Highest priority first, so findSurface returns on the first containment hit.
  surfaces.sort((a, b) => b.priority - a.priority);

  const walls: WallBody[] = hole.walls.map((w) => ({
    seg: mkSeg(w.a, w.b),
    restitution: w.restitution ?? WALL_RESTITUTION,
  }));

  const grid = new SegmentGrid(bounds, walls.length);
  for (let i = 0; i < walls.length; i++) {
    // Pad by the ball radius so a query centred on the ball cannot miss a
    // segment whose own AABB sits just outside the queried cells.
    grid.insertSegment(i, walls[i].seg, BALL_RADIUS + 1);
  }

  // Pre-allocate every kinematic segment; updateKinematics only rewrites numbers.
  const dynSegs: DynSeg[] = [];
  for (let i = 0; i < movers.length; i++) {
    movers[i].segStart = dynSegs.length;
    for (let j = 0; j < movers[i].segCount; j++) {
      dynSegs.push({
        seg: { ax: 0, ay: 0, bx: 0, by: 0 },
        restitution: MOVER_RESTITUTION,
        kind: 'mover',
        bodyIndex: i,
      });
    }
  }
  for (let i = 0; i < windmills.length; i++) {
    windmills[i].segStart = dynSegs.length;
    for (let j = 0; j < windmills[i].segCount; j++) {
      dynSegs.push({
        seg: { ax: 0, ay: 0, bx: 0, by: 0 },
        restitution: MOVER_RESTITUTION,
        kind: 'windmill',
        bodyIndex: i,
      });
    }
  }

  return {
    hole,
    bounds,
    tee: { x: hole.tee[0], y: hole.tee[1] },
    cup: { x: hole.cup[0], y: hole.cup[1] },
    seed: hole.seed ?? DEFAULT_SEED,
    greens,
    greenAabbs,
    surfaces,
    boosts,
    conveyors,
    walls,
    grid,
    bumpers,
    portals,
    movers,
    windmills,
    dynSegs,
    isStatic: movers.length === 0 && windmills.length === 0,
  };
}
