import Phaser from 'phaser';
import { CONTEXT_KEY, GameContext } from '../GameContext';
import { FADE_MS, VIEW_H, VIEW_W } from '../renderConfig';
import { COLORS } from '../theme';

/**
 * Constructs the shared context, dismisses the HTML boot splash and hands over
 * to the menu. No asset loading happens because the game ships no assets —
 * every visual is drawn and every sound is synthesised.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    this.registry.set(CONTEXT_KEY, new GameContext());
    this.cameras.main.setBackgroundColor(COLORS.void);

    // Hand the splash over from the DOM to the canvas without a flash of colour.
    const splash = document.getElementById('boot');
    if (splash !== null) {
      splash.classList.add('gone');
      window.setTimeout(() => splash.remove(), 400);
    }

    const mark = this.add.graphics();
    mark.fillStyle(COLORS.ball, 1);
    mark.fillCircle(VIEW_W / 2, VIEW_H / 2, 26);
    this.tweens.add({
      targets: mark,
      alpha: 0,
      duration: FADE_MS,
      delay: 120,
      onComplete: () => this.scene.start('menu'),
    });
  }
}
