/**
 * Render-only palette and surface treatments. Nothing here affects the sim;
 * gameplay numbers live in src/sim/config.ts (CLAUDE.md).
 *
 * Every surface carries a PATTERN as well as a hue, because the greyscale
 * accessibility mode strips colour entirely and the surfaces must still read
 * apart (SPEC: "distinguishable without colour").
 */

import type { Surface } from '../sim/types';

export const COLORS = {
  /** Behind the course: the table the hole sits on. */
  void: 0x23201d,
  voidDeep: 0x1a1815,
  ink: 0x2d2a26,
  cream: 0xe9e3d8,
  creamDim: 0x9a9287,

  green: 0x5c9a52,
  greenLit: 0x6fb060,
  greenShade: 0x477a40,

  rough: 0x3f6b3a,
  roughTuft: 0x2e5230,

  sand: 0xd9c188,
  sandSpeck: 0xb39a5f,

  ice: 0x9fd4e8,
  iceHatch: 0xdff2fa,

  water: 0x3b6ea8,
  waterWave: 0x7fb2dd,
  waterDeep: 0x2a5080,

  conveyor: 0x7a6a86,
  conveyorArrow: 0xd9c9e6,

  wall: 0xc9bfae,
  wallEdge: 0x6f6559,

  ball: 0xfdfbf6,
  ballShade: 0xc8c2b6,
  ghost: 0x8fd0ff,

  cupRim: 0x1b1815,
  cupHole: 0x0d0c0a,
  flag: 0xd94f3d,

  bumper: 0xe0574a,
  bumperLit: 0xff8f7d,
  boost: 0xf0c04a,
  portalA: 0x8b5cf6,
  portalB: 0x36c2a8,
  mover: 0xb8a68f,
  windmill: 0xd0664f,

  aim: 0xfdfbf6,
  power0: 0x7fd66f,
  power1: 0xf0c04a,
  power2: 0xe0574a,

  star: 0xf6c964,
  starEmpty: 0x4a453e,
} as const;

/** How a surface is textured on top of its fill. */
export type PatternKind = 'stripes' | 'tufts' | 'speckle' | 'hatch' | 'waves' | 'chevrons';

export interface SurfaceStyle {
  fill: number;
  pattern: PatternKind;
  patternColor: number;
  /** Spacing between pattern marks, in world px. */
  gap: number;
  alpha: number;
}

export const SURFACE_STYLES: Record<Surface, SurfaceStyle> = {
  green: { fill: COLORS.green, pattern: 'stripes', patternColor: COLORS.greenLit, gap: 46, alpha: 0.35 },
  rough: { fill: COLORS.rough, pattern: 'tufts', patternColor: COLORS.roughTuft, gap: 26, alpha: 0.9 },
  sand: { fill: COLORS.sand, pattern: 'speckle', patternColor: COLORS.sandSpeck, gap: 17, alpha: 0.85 },
  ice: { fill: COLORS.ice, pattern: 'hatch', patternColor: COLORS.iceHatch, gap: 30, alpha: 0.75 },
  water: { fill: COLORS.water, pattern: 'waves', patternColor: COLORS.waterWave, gap: 26, alpha: 0.55 },
  conveyor: { fill: COLORS.conveyor, pattern: 'chevrons', patternColor: COLORS.conveyorArrow, gap: 40, alpha: 0.8 },
};

/** Luminance-only variant of a colour, for the greyscale setting. */
export function desaturate(color: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const l = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  return (l << 16) | (l << 8) | l;
}
