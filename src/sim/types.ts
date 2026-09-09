/** Domain types shared by the simulation, the loader and the renderer. */

export interface Vec2 {
  x: number;
  y: number;
}

/** JSON levels use tuples; everything internal uses Vec2. */
export type Pt = [number, number];

export type Surface = 'green' | 'rough' | 'sand' | 'ice' | 'water' | 'conveyor';

export type ElementType =
  | 'wall'
  | 'green'
  | 'rough'
  | 'sand'
  | 'water'
  | 'ice'
  | 'boost'
  | 'bumper'
  | 'portal'
  | 'mover'
  | 'windmill'
  | 'conveyor';

/* ------------------------------------------------------------------ *
 * Level JSON (SPEC section 9)
 * ------------------------------------------------------------------ */

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PolyDef {
  poly: Pt[];
}

export interface WallDef {
  a: Pt;
  b: Pt;
  /** Optional per-wall restitution override; defaults to WALL_RESTITUTION. */
  restitution?: number;
}

export interface HazardDef {
  type: 'sand' | 'water' | 'ice' | 'rough';
  poly: Pt[];
}

export interface BoostDef {
  type: 'boost';
  poly: Pt[];
  dir: Pt;
  mult?: number;
}

export interface BumperDef {
  type: 'bumper';
  c: Pt;
  r?: number;
  /** Optional override of BUMPER_RESTITUTION for a tamer or wilder bumper. */
  restitution?: number;
}

export interface PortalMouth {
  c: Pt;
  r?: number;
  /** Facing direction in radians; the ball's exit direction is rotated by the delta. */
  facing: number;
}

export interface PortalDef {
  type: 'portal';
  a: PortalMouth;
  b: PortalMouth;
}

export interface MoverDef {
  type: 'mover';
  /** Segments in local space, translated along `path`. */
  segs: WallDef[];
  path: [Pt, Pt];
  periodMs: number;
  phase?: number;
}

export interface WindmillDef {
  type: 'windmill';
  c: Pt;
  bladeLen: number;
  bladeCount: number;
  rpm: number;
  phase?: number;
}

export interface ConveyorDef {
  type: 'conveyor';
  poly: Pt[];
  dir: Pt;
  accel?: number;
}

export type ElementDef =
  | BoostDef
  | BumperDef
  | PortalDef
  | MoverDef
  | WindmillDef
  | ConveyorDef;

export interface HoleData {
  id: string;
  par: number;
  bounds: Bounds;
  tee: Pt;
  cup: Pt;
  greens: PolyDef[];
  walls: WallDef[];
  hazards: HazardDef[];
  elements: ElementDef[];
  /** Designer note surfaced in the editor / dev overlay only. Never shown in game. */
  hint?: string;
  /** Optional PRNG seed override so a hole's bumper jitter is stable and authored. */
  seed?: number;
}

export interface PackData {
  id: string;
  index: number;
  holes: HoleData[];
}

/* ------------------------------------------------------------------ *
 * Shots, saves, ghosts (SPEC 8.3, 8.4)
 * ------------------------------------------------------------------ */

export interface ShotInput {
  angleRad: number;
  power: number;
  /**
   * Fixed-step index at which the shot was taken. Required for exact replay on
   * holes with kinematic elements (movers, windmills), whose phase depends on
   * simulated time. Absent/0 on holes without them.
   */
  atStep?: number;
}

export interface HoleRecord {
  bestStrokes: number;
  stars: number;
  ghost: ShotInput[];
}

export interface SaveSettings {
  muted: boolean;
  leftHanded: boolean;
  /** Renders every surface through a luminance-only filter, for the greyscale test. */
  greyscale: boolean;
}

export interface SaveData {
  version: number;
  totalStars: number;
  packsUnlocked: number;
  holes: Record<string, HoleRecord>;
  settings: SaveSettings;
  savedAt: number;
}
