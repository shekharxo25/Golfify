import Phaser from 'phaser';
import { COLORS } from '../theme';

export type IconDraw = (g: Phaser.GameObjects.Graphics, r: number) => void;

export interface ButtonOpts {
  radius: number;
  /** Draws the glyph centred on (0, 0). */
  icon: IconDraw;
  onTap: () => void;
  fill?: number;
  fillAlpha?: number;
  ring?: number;
  /** HUD buttons pin to the screen; in-world buttons scroll with the camera. */
  fixed?: boolean;
}

/**
 * A round icon button.
 *
 * Presses are animated rather than labelled: the whole point of the icon-only
 * UI is that feedback comes from motion, so every button dips on press and
 * springs back on release.
 */
export class Button extends Phaser.GameObjects.Container {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly opts: ButtonOpts;
  private enabled = true;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: ButtonOpts) {
    super(scene, x, y);
    this.opts = opts;
    this.g = scene.add.graphics();
    this.add(this.g);
    this.redraw(false);

    this.setSize(opts.radius * 2, opts.radius * 2);
    this.setInteractive(
      new Phaser.Geom.Circle(0, 0, opts.radius + 6),
      Phaser.Geom.Circle.Contains,
    );
    if (opts.fixed !== false) this.setScrollFactor(0);

    this.on('pointerdown', () => {
      if (!this.enabled) return;
      this.redraw(true);
      scene.tweens.add({ targets: this, scale: 0.88, duration: 70, ease: 'Quad.easeOut' });
    });
    this.on('pointerout', () => {
      this.redraw(false);
      scene.tweens.add({ targets: this, scale: 1, duration: 110, ease: 'Back.easeOut' });
    });
    this.on('pointerup', () => {
      this.redraw(false);
      scene.tweens.add({ targets: this, scale: 1, duration: 160, ease: 'Back.easeOut' });
      if (this.enabled) opts.onTap();
    });

    scene.add.existing(this);
  }

  /** Re-run the icon callback, e.g. after a mute toggle changes the glyph. */
  refresh(): void {
    this.redraw(false);
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.4);
    return this;
  }

  private redraw(pressed: boolean): void {
    const { radius, fill, fillAlpha, ring, icon } = this.opts;
    const g = this.g;
    g.clear();
    g.fillStyle(COLORS.ink, 0.45);
    g.fillCircle(0, pressed ? 2 : 5, radius);
    g.fillStyle(fill ?? COLORS.ink, fillAlpha ?? 0.9);
    g.fillCircle(0, 0, radius);
    g.lineStyle(2.5, ring ?? COLORS.cream, pressed ? 0.5 : 0.25);
    g.strokeCircle(0, 0, radius);
    icon(g, radius * 0.55);
  }
}
