import type { HoleData, PackData } from '../types';
import { parseHole } from './LevelLoader';
import dev from './packs/dev.json';
import pack1 from './packs/pack1.json';
import pack2 from './packs/pack2.json';

/**
 * The shipped course. Every hole goes through parseHole at module load, so a
 * broken level breaks the build's test run rather than a player's session.
 *
 * Pack ordering is the teaching order. SPEC 8.2 asks for one new element type
 * per pack; with twelve element types and two packs in the prototype, the split
 * is by behaviour instead — pack 1 is everything static, pack 2 is everything
 * that moves — and the teaching-by-isolation rule is kept per *hole*: the first
 * hole to use an element uses only that element.
 */

interface RawPack {
  id: string;
  index: number;
  holes: unknown[];
}

function loadPack(raw: RawPack): PackData {
  return {
    id: raw.id,
    index: raw.index,
    holes: raw.holes.map((h, i) => parseHole(h, `${raw.id}[${i}]`)),
  };
}

export const PACKS: PackData[] = [
  loadPack(pack1 as RawPack),
  loadPack(pack2 as RawPack),
];

/** Not part of progression: the every-element hole used by the Phase 4 gate. */
export const DEV_PACK: PackData = loadPack(dev as RawPack);

export const PACK_NAMES = ['Sunday Course', 'Impossible Nine'] as const;

const HOLE_INDEX = new Map<string, { pack: number; hole: number; data: HoleData }>();
for (const pack of [...PACKS, DEV_PACK]) {
  pack.holes.forEach((h, i) => HOLE_INDEX.set(h.id, { pack: pack.index, hole: i, data: h }));
}

export function getHole(id: string): HoleData {
  const found = HOLE_INDEX.get(id);
  if (found === undefined) throw new Error(`unknown hole "${id}"`);
  return found.data;
}

export function findHole(id: string): { pack: number; hole: number } | undefined {
  const found = HOLE_INDEX.get(id);
  return found === undefined ? undefined : { pack: found.pack, hole: found.hole };
}

export function allHoles(): HoleData[] {
  return PACKS.flatMap((p) => p.holes);
}

/** The next hole in course order, or undefined at the end of the last pack. */
export function nextHole(id: string): HoleData | undefined {
  const at = findHole(id);
  if (at === undefined || at.pack >= PACKS.length) return undefined;
  const pack = PACKS[at.pack];
  if (at.hole + 1 < pack.holes.length) return pack.holes[at.hole + 1];
  const next = PACKS[at.pack + 1];
  return next?.holes[0];
}

export function packStars(packIndex: number, starsOf: (holeId: string) => number): number {
  const pack = PACKS[packIndex];
  if (pack === undefined) return 0;
  return pack.holes.reduce((sum, h) => sum + starsOf(h.id), 0);
}
