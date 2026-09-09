import { PACK_STAR_THRESHOLDS } from '../config';

/**
 * SPEC 8.1. Stars are the progression currency; the traditional golf name is
 * shown as an icon plus a number so the game needs no localisation.
 */
export function starsFor(strokes: number, par: number): number {
  if (strokes <= par - 1) return 3;
  if (strokes <= par) return 2;
  if (strokes <= par + 2) return 1;
  return 0;
}

export type ScoreName = 'ace' | 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'worse';

export function scoreName(strokes: number, par: number): ScoreName {
  if (strokes === 1) return 'ace';
  const rel = strokes - par;
  if (rel <= -2) return 'eagle';
  if (rel === -1) return 'birdie';
  if (rel === 0) return 'par';
  if (rel === 1) return 'bogey';
  if (rel === 2) return 'double';
  return 'worse';
}

/** How many packs the player has earned, given a star total (SPEC 8.2). */
export function packsUnlockedFor(totalStars: number): number {
  let n = 1;
  for (let i = 1; i < PACK_STAR_THRESHOLDS.length; i++) {
    if (totalStars >= PACK_STAR_THRESHOLDS[i]) n = i + 1;
  }
  return n;
}

/** Stars still needed to open the next locked pack, or 0 when all are open. */
export function starsToNextPack(totalStars: number): number {
  for (let i = 1; i < PACK_STAR_THRESHOLDS.length; i++) {
    if (totalStars < PACK_STAR_THRESHOLDS[i]) return PACK_STAR_THRESHOLDS[i] - totalStars;
  }
  return 0;
}
