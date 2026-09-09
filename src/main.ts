import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from './render/renderConfig';
import { BootScene } from './render/scenes/BootScene';
import { MenuScene } from './render/scenes/MenuScene';
import { PlayScene } from './render/scenes/PlayScene';
import { COLORS } from './render/theme';

/**
 * Browser entry point. Everything the game draws is vector graphics and every
 * sound is synthesised, so there is no preload step and no asset manifest.
 */

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // Fixed logical resolution, letterboxed to the device (CLAUDE.md).
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: COLORS.void,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    // Graphics-heavy scene with sub-pixel motion: rounding would make the ball
    // stutter at low speed.
    roundPixels: false,
    powerPreference: 'high-performance',
  },
  input: {
    // One finger at a time: aiming and panning are both single-pointer.
    activePointers: 1,
  },
  scene: [BootScene, MenuScene, PlayScene],
});

// The HTML splash hides itself once the boot scene runs. If Phaser never gets
// that far, clear it anyway so the player is not left staring at a spinner.
window.setTimeout(() => {
  if (!game.isRunning) document.getElementById('boot')?.classList.add('gone');
}, 4000);
