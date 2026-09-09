/**
 * mulberry32 — small, fast, seeded PRNG. The only source of randomness allowed
 * anywhere in the physics path (SPEC 5.7).
 *
 * State is a single uint32 so it can live inside SimState and be cloned for
 * trajectory previews without disturbing the live stream.
 */

export interface RngState {
  s: number;
}

export const makeRng = (seed: number): RngState => ({ s: seed >>> 0 });

/** Advance the stream and return a float in [0, 1). */
export function nextFloat(state: RngState): number {
  state.s = (state.s + 0x6d2b79f5) >>> 0;
  let t = state.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Symmetric float in [-1, 1). */
export const nextSigned = (state: RngState): number => nextFloat(state) * 2 - 1;

export const nextRange = (state: RngState, lo: number, hi: number): number =>
  lo + nextFloat(state) * (hi - lo);

/** Derive an independent, reproducible sub-stream (e.g. per shot index). */
export function deriveSeed(base: number, salt: number): number {
  let h = (base ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}
