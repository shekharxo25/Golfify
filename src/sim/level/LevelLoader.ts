import { BALL_RADIUS, CUP_RADIUS } from '../config';
import { pointInPoly, polyBounds } from '../math/geom';
import type {
  Bounds,
  ElementDef,
  HazardDef,
  HoleData,
  PolyDef,
  Pt,
  WallDef,
} from '../types';

/**
 * Parse and validate the level JSON of SPEC section 9. Pure TypeScript: the
 * editor, the test suite and the game all go through this one gate, so a
 * malformed hole fails loudly at load instead of subtly at play time.
 */

export class LevelError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'LevelError';
  }
}

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(o: Json, key: string, path: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new LevelError(`${path}.${key}`, 'expected a finite number');
  }
  return v;
}

function optNum(o: Json, key: string, path: string): number | undefined {
  return o[key] === undefined ? undefined : num(o, key, path);
}

function str(o: Json, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new LevelError(`${path}.${key}`, 'expected a non-empty string');
  }
  return v;
}

function pt(v: unknown, path: string): Pt {
  if (
    !Array.isArray(v) ||
    v.length !== 2 ||
    typeof v[0] !== 'number' ||
    typeof v[1] !== 'number' ||
    !Number.isFinite(v[0]) ||
    !Number.isFinite(v[1])
  ) {
    throw new LevelError(path, 'expected [x, y] with finite numbers');
  }
  return [v[0], v[1]];
}

function poly(v: unknown, path: string): Pt[] {
  if (!Array.isArray(v) || v.length < 3) {
    throw new LevelError(path, 'a polygon needs at least 3 points');
  }
  return v.map((p, i) => pt(p, `${path}[${i}]`));
}

function bounds(v: unknown, path: string): Bounds {
  if (!isObj(v)) throw new LevelError(path, 'expected an object');
  const b = {
    x: num(v, 'x', path),
    y: num(v, 'y', path),
    w: num(v, 'w', path),
    h: num(v, 'h', path),
  };
  if (b.w <= 0 || b.h <= 0) throw new LevelError(path, 'width and height must be positive');
  return b;
}

function wall(v: unknown, path: string): WallDef {
  if (!isObj(v)) throw new LevelError(path, 'expected an object');
  const a = pt(v.a, `${path}.a`);
  const b = pt(v.b, `${path}.b`);
  if (a[0] === b[0] && a[1] === b[1]) {
    throw new LevelError(path, 'zero-length wall segment');
  }
  const out: WallDef = { a, b };
  const r = optNum(v, 'restitution', path);
  if (r !== undefined) out.restitution = r;
  return out;
}

const HAZARD_TYPES = new Set(['sand', 'water', 'ice', 'rough']);

function hazard(v: unknown, path: string): HazardDef {
  if (!isObj(v)) throw new LevelError(path, 'expected an object');
  const type = str(v, 'type', path);
  if (!HAZARD_TYPES.has(type)) {
    throw new LevelError(`${path}.type`, `unknown hazard "${type}"`);
  }
  return { type: type as HazardDef['type'], poly: poly(v.poly, `${path}.poly`) };
}

function element(v: unknown, path: string): ElementDef {
  if (!isObj(v)) throw new LevelError(path, 'expected an object');
  const type = str(v, 'type', path);
  switch (type) {
    case 'boost': {
      const out = {
        type: 'boost' as const,
        poly: poly(v.poly, `${path}.poly`),
        dir: pt(v.dir, `${path}.dir`),
      } as ElementDef & { mult?: number };
      const m = optNum(v, 'mult', path);
      if (m !== undefined) {
        if (m <= 0) throw new LevelError(`${path}.mult`, 'must be positive');
        out.mult = m;
      }
      return out;
    }
    case 'bumper': {
      const r = optNum(v, 'r', path);
      if (r !== undefined && r <= 0) throw new LevelError(`${path}.r`, 'must be positive');
      const rest = optNum(v, 'restitution', path);
      return { type: 'bumper', c: pt(v.c, `${path}.c`), r, restitution: rest };
    }
    case 'portal': {
      const mouth = (m: unknown, mp: string) => {
        if (!isObj(m)) throw new LevelError(mp, 'expected an object');
        return {
          c: pt(m.c, `${mp}.c`),
          r: optNum(m, 'r', mp),
          facing: num(m, 'facing', mp),
        };
      };
      return {
        type: 'portal',
        a: mouth(v.a, `${path}.a`),
        b: mouth(v.b, `${path}.b`),
      };
    }
    case 'mover': {
      if (!Array.isArray(v.segs) || v.segs.length === 0) {
        throw new LevelError(`${path}.segs`, 'a mover needs at least one segment');
      }
      const p = v.path;
      if (!Array.isArray(p) || p.length !== 2) {
        throw new LevelError(`${path}.path`, 'expected [from, to]');
      }
      const periodMs = num(v, 'periodMs', path);
      if (periodMs <= 0) throw new LevelError(`${path}.periodMs`, 'must be positive');
      return {
        type: 'mover',
        segs: v.segs.map((s, i) => wall(s, `${path}.segs[${i}]`)),
        path: [pt(p[0], `${path}.path[0]`), pt(p[1], `${path}.path[1]`)],
        periodMs,
        phase: optNum(v, 'phase', path),
      };
    }
    case 'windmill': {
      const bladeCount = num(v, 'bladeCount', path);
      if (!Number.isInteger(bladeCount) || bladeCount < 1) {
        throw new LevelError(`${path}.bladeCount`, 'must be an integer >= 1');
      }
      const bladeLen = num(v, 'bladeLen', path);
      if (bladeLen <= 0) throw new LevelError(`${path}.bladeLen`, 'must be positive');
      return {
        type: 'windmill',
        c: pt(v.c, `${path}.c`),
        bladeLen,
        bladeCount,
        rpm: num(v, 'rpm', path),
        phase: optNum(v, 'phase', path),
      };
    }
    case 'conveyor': {
      const accel = optNum(v, 'accel', path);
      if (accel !== undefined && accel < 0) {
        throw new LevelError(`${path}.accel`, 'must be >= 0');
      }
      return {
        type: 'conveyor',
        poly: poly(v.poly, `${path}.poly`),
        dir: pt(v.dir, `${path}.dir`),
        accel,
      };
    }
    default:
      throw new LevelError(`${path}.type`, `unknown element "${type}"`);
  }
}

/** Structural validation. Throws LevelError on the first problem found. */
export function parseHole(raw: unknown, label = 'hole'): HoleData {
  if (!isObj(raw)) throw new LevelError(label, 'expected an object');

  const id = str(raw, 'id', label);
  const path = `hole "${id}"`;

  const par = num(raw, 'par', path);
  if (!Number.isInteger(par) || par < 1 || par > 9) {
    throw new LevelError(`${path}.par`, 'expected an integer between 1 and 9');
  }

  const greensRaw = raw.greens;
  if (!Array.isArray(greensRaw) || greensRaw.length === 0) {
    throw new LevelError(`${path}.greens`, 'at least one green polygon is required');
  }
  const greens: PolyDef[] = greensRaw.map((g, i) => {
    if (!isObj(g)) throw new LevelError(`${path}.greens[${i}]`, 'expected an object');
    return { poly: poly(g.poly, `${path}.greens[${i}].poly`) };
  });

  const wallsRaw = Array.isArray(raw.walls) ? raw.walls : [];
  const hazardsRaw = Array.isArray(raw.hazards) ? raw.hazards : [];
  const elementsRaw = Array.isArray(raw.elements) ? raw.elements : [];

  const hole: HoleData = {
    id,
    par,
    bounds: bounds(raw.bounds, `${path}.bounds`),
    tee: pt(raw.tee, `${path}.tee`),
    cup: pt(raw.cup, `${path}.cup`),
    greens,
    walls: wallsRaw.map((w, i) => wall(w, `${path}.walls[${i}]`)),
    hazards: hazardsRaw.map((h, i) => hazard(h, `${path}.hazards[${i}]`)),
    elements: elementsRaw.map((e, i) => element(e, `${path}.elements[${i}]`)),
  };
  if (typeof raw.hint === 'string') hole.hint = raw.hint;
  if (typeof raw.seed === 'number') hole.seed = raw.seed >>> 0;

  validatePlayability(hole, path);
  return hole;
}

/** Semantic checks: things that parse but are not playable. */
export function validatePlayability(hole: HoleData, path = `hole "${hole.id}"`): void {
  const inAnyGreen = (p: Pt) => hole.greens.some((g) => pointInPoly(p[0], p[1], g.poly));

  if (!inAnyGreen(hole.tee)) {
    throw new LevelError(`${path}.tee`, 'the tee must sit inside a green polygon');
  }
  if (!inAnyGreen(hole.cup)) {
    throw new LevelError(`${path}.cup`, 'the cup must sit inside a green polygon');
  }

  const teeToCup = Math.hypot(hole.cup[0] - hole.tee[0], hole.cup[1] - hole.tee[1]);
  if (teeToCup < CUP_RADIUS + BALL_RADIUS * 2) {
    throw new LevelError(path, 'the tee is inside the cup');
  }

  const b = hole.bounds;
  for (const g of hole.greens) {
    const gb = polyBounds(g.poly);
    if (gb.minX < b.x || gb.minY < b.y || gb.maxX > b.x + b.w || gb.maxY > b.y + b.h) {
      throw new LevelError(`${path}.greens`, 'a green polygon extends outside bounds');
    }
  }
}

/** Deep clone via JSON, so a loaded hole can be mutated by the editor safely. */
export function cloneHole(hole: HoleData): HoleData {
  return JSON.parse(JSON.stringify(hole)) as HoleData;
}
