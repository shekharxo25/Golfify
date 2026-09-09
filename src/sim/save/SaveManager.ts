import { SAVE_KEY, SAVE_VERSION } from '../config';
import { packsUnlockedFor } from '../game/scoring';
import type { HoleRecord, SaveData, SaveSettings, ShotInput } from '../types';

/**
 * Versioned localStorage persistence (SPEC 8.4).
 *
 * Storage is injected so the module stays runnable in Node — src/sim must never
 * assume a browser. An unreadable or wrong-version save is discarded rather
 * than migrated: v1 has nothing worth rescuing, and silently half-loading a
 * save is worse than starting clean.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

function defaultSettings(): SaveSettings {
  return { muted: false, leftHanded: false, greyscale: false };
}

export function emptySave(): SaveData {
  return {
    version: SAVE_VERSION,
    totalStars: 0,
    packsUnlocked: 1,
    holes: {},
    settings: defaultSettings(),
    savedAt: 0,
  };
}

function resolveStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') {
      // Probe: Safari private mode throws on setItem rather than on access.
      const probe = `${SAVE_KEY}/probe`;
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    }
  } catch {
    /* fall through to memory */
  }
  return new MemoryStorage();
}

export class SaveManager {
  data: SaveData;
  private readonly storage: StorageLike;

  constructor(storage?: StorageLike) {
    this.storage = storage ?? resolveStorage();
    this.data = this.read();
  }

  private read(): SaveData {
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      if (raw === null) return emptySave();
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (parsed.version !== SAVE_VERSION || typeof parsed.holes !== 'object') {
        return emptySave();
      }
      const save = emptySave();
      save.holes = (parsed.holes ?? {}) as Record<string, HoleRecord>;
      save.settings = { ...defaultSettings(), ...(parsed.settings ?? {}) };
      save.savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
      this.recompute(save);
      return save;
    } catch {
      return emptySave();
    }
  }

  private recompute(save: SaveData = this.data): void {
    let stars = 0;
    for (const key of Object.keys(save.holes)) {
      const rec = save.holes[key];
      if (rec && typeof rec.stars === 'number') stars += rec.stars;
    }
    save.totalStars = stars;
    save.packsUnlocked = packsUnlockedFor(stars);
  }

  flush(): void {
    this.data.savedAt = Date.now();
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch (err) {
      console.warn('mini-golf: could not persist save', err);
    }
  }

  recordOf(holeId: string): HoleRecord | undefined {
    return this.data.holes[holeId];
  }

  /**
   * Store a completed hole. A run is only kept when it beats the stored one, so
   * the ghost always represents the player's personal best.
   * Returns true when this run became the new record.
   */
  recordHole(holeId: string, strokes: number, stars: number, ghost: ShotInput[]): boolean {
    const prev = this.data.holes[holeId];
    const improved = prev === undefined || strokes < prev.bestStrokes;
    if (improved) {
      this.data.holes[holeId] = { bestStrokes: strokes, stars, ghost: ghost.slice() };
      this.recompute();
    }
    this.flush();
    return improved;
  }

  isPackUnlocked(packIndex: number): boolean {
    return packIndex < this.data.packsUnlocked;
  }

  get settings(): SaveSettings {
    return this.data.settings;
  }

  updateSettings(patch: Partial<SaveSettings>): void {
    Object.assign(this.data.settings, patch);
    this.flush();
  }

  clear(): void {
    this.data = emptySave();
    try {
      this.storage.removeItem(SAVE_KEY);
    } catch {
      /* nothing to do */
    }
  }
}
