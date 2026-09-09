import Phaser from 'phaser';
import type { HoleResult } from '../../sim/game/HoleSession';
import { DEPTH, STAR_POP_MS, VIEW_H, VIEW_W } from '../renderConfig';
import { COLORS } from '../theme';
import { Button } from './Button';
import { chevron, flag, grid, pips, retry, star, strokeRow } from './Icons';

export interface ResultCallbacks {
  onRetry: () => void;
  onNext: () => void;
  onMenu: () => void;
  onStar: (index: number) => void;
  /** False on the last hole of the last pack, which hides the "next" control. */
  hasNext: boolean;
}

/**
 * The post-hole card: stars earned, strokes taken against par, and where to go
 * next. Stars pop in one at a time — the reveal is the reward, so it is paced
 * rather than shown all at once.
 */
export class ResultPanel {
  private readonly root: Phaser.GameObjects.Container;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly starG: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, result: HoleResult, improved: boolean, cb: ResultCallbacks) {
    this.root = scene.add.container(0, 0).setDepth(DEPTH.overlay).setScrollFactor(0);
    this.g = scene.add.graphics();
    this.starG = scene.add.graphics();
    this.root.add([this.g, this.starG]);

    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;
    const w = 520;
    const h = 420;

    const g = this.g;
    g.fillStyle(COLORS.voidDeep, 0.78);
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.fillStyle(COLORS.ink, 0.5);
    g.fillRoundedRect(cx - w / 2, cy - h / 2 + 8, w, h, 30);
    g.fillStyle(COLORS.void, 0.98);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 30);
    g.lineStyle(3, COLORS.cream, 0.16);
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 30);

    // Empty star sockets; the filled ones land on top as they pop.
    for (let i = 0; i < 3; i++) {
      star(g, cx + (i - 1) * 96, cy - 96, 40, false);
    }

    // Strokes against par, both as pip clusters.
    flag(g, cx - 96, cy + 34, 20);
    pips(g, cx - 30, cy + 34, 26, result.par);
    g.fillStyle(COLORS.cream, 0.3);
    g.fillRect(cx + 8, cy + 12, 3, 44);
    strokeRow(g, cx + 40, cy + 20, Math.min(result.strokes, 12), 8, 22, COLORS.cream);

    if (improved) {
      // New personal best: a pulsing ring rather than a "NEW RECORD" label.
      const ring = scene.add.graphics();
      ring.lineStyle(4, COLORS.star, 0.9);
      ring.strokeRoundedRect(cx - w / 2 - 6, cy - h / 2 - 6, w + 12, h + 12, 34);
      this.root.add(ring);
      scene.tweens.add({
        targets: ring,
        alpha: { from: 0.9, to: 0.25 },
        duration: 900,
        yoyo: true,
        repeat: -1,
      });
    }

    this.popStars(scene, result.stars, cx, cy - 96, cb.onStar);
    this.addControls(scene, cx, cy + h / 2 - 62, cb);

    this.root.setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, duration: 220, ease: 'Quad.easeOut' });
  }

  private popStars(
    scene: Phaser.Scene,
    count: number,
    cx: number,
    cy: number,
    onStar: (i: number) => void,
  ): void {
    for (let i = 0; i < count; i++) {
      scene.time.delayedCall(160 + i * STAR_POP_MS, () => {
        const s = scene.add.graphics();
        star(s, 0, 0, 40, true);
        s.setPosition(cx + (i - 1) * 96, cy);
        s.setScale(0);
        this.root.add(s);
        scene.tweens.add({ targets: s, scale: 1, duration: 300, ease: 'Back.easeOut' });
        onStar(i);
      });
    }
  }

  private addControls(scene: Phaser.Scene, cx: number, y: number, cb: ResultCallbacks): void {
    const buttons: Button[] = [];
    buttons.push(
      new Button(scene, cx - (cb.hasNext ? 110 : 70), y, {
        radius: 34,
        icon: (g, r) => grid(g, 0, 0, r),
        onTap: cb.onMenu,
      }),
    );
    buttons.push(
      new Button(scene, cx + (cb.hasNext ? 0 : 70), y, {
        radius: 34,
        icon: (g, r) => retry(g, 0, 0, r),
        onTap: cb.onRetry,
      }),
    );
    if (cb.hasNext) {
      buttons.push(
        new Button(scene, cx + 110, y, {
          radius: 40,
          icon: (g, r) => chevron(g, -2, 0, r, 1, COLORS.void),
          onTap: cb.onNext,
          fill: COLORS.cream,
          fillAlpha: 1,
          ring: COLORS.void,
        }),
      );
    }
    for (const b of buttons) {
      b.setDepth(DEPTH.overlay + 1);
      this.root.add(b);
    }
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
