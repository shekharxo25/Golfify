import { PACKS, packStars } from '../sim/level/courses';
import { starsToNextPack } from '../sim/game/scoring';
import { SaveManager } from '../sim/save/SaveManager';
import { Sfx } from './audio/Sfx';

/**
 * The one long-lived object the scenes share: persistence plus audio.
 *
 * Stored in Phaser's registry rather than a module singleton so the scenes
 * receive it explicitly and a test could construct one with a fake storage.
 */
export class GameContext {
  readonly save: SaveManager;
  readonly sfx: Sfx;

  constructor() {
    this.save = new SaveManager();
    this.sfx = new Sfx(this.save.settings.muted);
  }

  starsOf = (holeId: string): number => this.save.recordOf(holeId)?.stars ?? 0;

  bestOf(holeId: string): number | undefined {
    return this.save.recordOf(holeId)?.bestStrokes;
  }

  ghostOf(holeId: string) {
    return this.save.recordOf(holeId)?.ghost ?? [];
  }

  starsInPack(packIndex: number): number {
    return packStars(packIndex, this.starsOf);
  }

  maxStarsInPack(packIndex: number): number {
    return (PACKS[packIndex]?.holes.length ?? 0) * 3;
  }

  get totalStars(): number {
    return this.save.data.totalStars;
  }

  get starsToUnlockNext(): number {
    return starsToNextPack(this.totalStars);
  }

  toggleMute(): void {
    const muted = !this.save.settings.muted;
    this.save.updateSettings({ muted });
    this.sfx.setMuted(muted);
  }

  get greyscale(): boolean {
    return this.save.settings.greyscale;
  }

  get leftHanded(): boolean {
    return this.save.settings.leftHanded;
  }
}

export const CONTEXT_KEY = 'ctx';
