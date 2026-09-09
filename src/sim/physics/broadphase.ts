import { BROADPHASE_CELL } from '../config';
import type { Aabb, Segment } from '../math/geom';
import { segmentAabb } from '../math/geom';

/**
 * Uniform grid over the hole (SPEC 5.6). Static wall segments are bucketed once
 * on load; queries take a swept AABB and return candidate indices.
 *
 * A stamp array gives de-duplication without allocating a Set per query, and
 * cells are visited in a fixed row-major order so the candidate list is
 * bit-identical between the live sim and a trajectory preview.
 */
export class SegmentGrid {
  readonly cell: number;
  private readonly originX: number;
  private readonly originY: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly buckets: number[][];
  private stamp: Int32Array;
  private queryId = 0;

  constructor(bounds: Aabb, count: number, cell: number = BROADPHASE_CELL) {
    this.cell = cell;
    // One cell of slack on every side so geometry on the boundary still buckets.
    this.originX = Math.floor(bounds.minX / cell) * cell - cell;
    this.originY = Math.floor(bounds.minY / cell) * cell - cell;
    this.cols = Math.max(1, Math.ceil((bounds.maxX - this.originX) / cell) + 2);
    this.rows = Math.max(1, Math.ceil((bounds.maxY - this.originY) / cell) + 2);
    this.buckets = new Array(this.cols * this.rows);
    this.stamp = new Int32Array(count).fill(-1);
  }

  private colOf(x: number): number {
    const c = Math.floor((x - this.originX) / this.cell);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private rowOf(y: number): number {
    const r = Math.floor((y - this.originY) / this.cell);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  insertSegment(index: number, seg: Segment, pad: number): void {
    const box = segmentAabb(seg, pad);
    const c0 = this.colOf(box.minX);
    const c1 = this.colOf(box.maxX);
    const r0 = this.rowOf(box.minY);
    const r1 = this.rowOf(box.maxY);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const k = r * this.cols + c;
        (this.buckets[k] ??= []).push(index);
      }
    }
  }

  /** Append unique candidate indices overlapping `box` to `out`. */
  query(box: Aabb, out: number[]): void {
    out.length = 0;
    const id = ++this.queryId;
    const c0 = this.colOf(box.minX);
    const c1 = this.colOf(box.maxX);
    const r0 = this.rowOf(box.minY);
    const r1 = this.rowOf(box.maxY);
    const stamp = this.stamp;
    for (let r = r0; r <= r1; r++) {
      const base = r * this.cols;
      for (let c = c0; c <= c1; c++) {
        const bucket = this.buckets[base + c];
        if (bucket === undefined) continue;
        for (let i = 0; i < bucket.length; i++) {
          const idx = bucket[i];
          if (stamp[idx] === id) continue;
          stamp[idx] = id;
          out.push(idx);
        }
      }
    }
  }

  /** Diagnostics for the dev overlay. */
  stats(): { cols: number; rows: number; occupied: number; maxBucket: number } {
    let occupied = 0;
    let maxBucket = 0;
    for (const b of this.buckets) {
      if (b !== undefined) {
        occupied++;
        if (b.length > maxBucket) maxBucket = b.length;
      }
    }
    return { cols: this.cols, rows: this.rows, occupied, maxBucket };
  }
}

/** AABB of a swept circle, written into a caller-owned box. */
export function sweptCircleAabb(
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  r: number,
  out: Aabb,
): Aabb {
  const x1 = cx + dx;
  const y1 = cy + dy;
  out.minX = Math.min(cx, x1) - r;
  out.minY = Math.min(cy, y1) - r;
  out.maxX = Math.max(cx, x1) + r;
  out.maxY = Math.max(cy, y1) + r;
  return out;
}
