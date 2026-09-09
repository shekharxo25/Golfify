import Phaser from 'phaser';
import { PACK_STAR_THRESHOLDS } from '../../sim/config';
import { PACKS } from '../../sim/level/courses';
import { CONTEXT_KEY, type GameContext } from '../GameContext';
import { DEPTH, VIEW_H, VIEW_W } from '../renderConfig';
import { COLORS } from '../theme';
import { Button } from '../ui/Button';
import { flag, padlock, pips, speaker, star } from '../ui/Icons';

/**
 * Course select: pick a pack, then a hole.
 *
 * Progress is shown as bars and pip clusters rather than numerals, so the menu
 * needs no font and no localisation — the same constraint the HUD works under.
 */
export class MenuScene extends Phaser.Scene {
  private ctx!: GameContext;
  private pack = 0;
  private readonly transient: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('menu');
  }

  create(data?: { pack?: number }): void {
    this.ctx = this.registry.get(CONTEXT_KEY) as GameContext;
    this.pack = Math.min(data?.pack ?? 0, PACKS.length - 1);
    this.cameras.main.setBackgroundColor(COLORS.void);
    this.drawChrome();
    this.drawPackCards();
    this.drawHoleGrid();
    this.cameras.main.fadeIn(220, 0x23, 0x20, 0x1d);
  }

  /** The parts that never change: backdrop, logo mark, mute control. */
  private drawChrome(): void {
    const g = this.add.graphics().setDepth(DEPTH.ground);
    g.fillStyle(COLORS.void, 1);
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    // A soft green disc behind the logo suggests a green without drawing one.
    g.fillStyle(COLORS.green, 0.16);
    g.fillCircle(VIEW_W / 2, 120, 210);

    const logo = this.add.graphics().setDepth(DEPTH.decals);
    logo.fillStyle(0x000000, 0.3);
    logo.fillEllipse(VIEW_W / 2 - 44, 152, 74, 24);
    logo.fillStyle(COLORS.ball, 1);
    logo.fillCircle(VIEW_W / 2 - 46, 128, 30);
    logo.fillStyle(COLORS.ballShade, 1);
    logo.fillCircle(VIEW_W / 2 - 38, 136, 22);
    logo.fillStyle(COLORS.ball, 1);
    logo.fillCircle(VIEW_W / 2 - 50, 122, 26);
    flag(logo, VIEW_W / 2 + 62, 118, 46);

    const muteBtn = new Button(this, VIEW_W - 56, 56, {
      radius: 26,
      icon: (ig, r) => speaker(ig, 0, 0, r, this.ctx.sfx.isMuted),
      onTap: () => {
        this.ctx.sfx.unlock();
        this.ctx.toggleMute();
        muteBtn.refresh();
        this.ctx.sfx.tap();
      },
    });
    muteBtn.setDepth(DEPTH.hud);
  }

  /** One card per pack: index, star progress, and a padlock when still shut. */
  private drawPackCards(): void {
    const g = this.add.graphics().setDepth(DEPTH.decals);
    const cardW = 300;
    const cardH = 132;
    const y = 300;

    for (let i = 0; i < PACKS.length; i++) {
      const x = VIEW_W / 2 + (i - (PACKS.length - 1) / 2) * (cardW + 22);
      const unlocked = this.ctx.save.isPackUnlocked(i);
      const active = i === this.pack && unlocked;
      const left = x - cardW / 2;

      g.fillStyle(COLORS.ink, active ? 1 : 0.6);
      g.fillRoundedRect(left, y - cardH / 2, cardW, cardH, 22);
      g.lineStyle(active ? 4 : 2, active ? COLORS.cream : COLORS.creamDim, active ? 0.8 : 0.25);
      g.strokeRoundedRect(left, y - cardH / 2, cardW, cardH, 22);

      if (unlocked) {
        pips(g, left + 46, y - 16, 26, i + 1);
        const earned = this.ctx.starsInPack(i);
        const max = this.ctx.maxStarsInPack(i);
        star(g, left + 40, y + 36, 15, earned > 0);
        this.progressBar(g, left + 66, y + 30, cardW - 106, earned / Math.max(1, max));
        // A flag per hole gives the pack a size at a glance.
        g.fillStyle(COLORS.cream, 0.5);
        for (let h = 0; h < PACKS[i].holes.length; h++) {
          g.fillCircle(left + 108 + h * 17, y - 16, 4.5);
        }
      } else {
        padlock(g, x, y - 12, 30);
        // How many more stars this pack costs, as a bar against the threshold.
        const need = PACK_STAR_THRESHOLDS[i] ?? 0;
        star(g, left + 40, y + 36, 15, false);
        this.progressBar(g, left + 66, y + 30, cardW - 106, need > 0 ? this.ctx.totalStars / need : 1);
      }

      const hit = this.add
        .zone(x, y, cardW, cardH)
        .setInteractive({ useHandCursor: true })
        .setDepth(DEPTH.hud);
      hit.on('pointerup', () => {
        this.ctx.sfx.unlock();
        if (!unlocked) {
          this.ctx.sfx.back();
          this.shake(g);
          return;
        }
        this.ctx.sfx.tap();
        this.scene.restart({ pack: i });
      });
    }
  }

  private progressBar(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    fraction: number,
  ): void {
    const t = Phaser.Math.Clamp(fraction, 0, 1);
    g.fillStyle(COLORS.voidDeep, 1);
    g.fillRoundedRect(x, y, w, 13, 6);
    g.fillStyle(COLORS.star, 1);
    if (t > 0) g.fillRoundedRect(x, y, Math.max(13, w * t), 13, 6);
  }

  /** Nine hole buttons: pip index, plus the stars already earned on each. */
  private drawHoleGrid(): void {
    for (const obj of this.transient) obj.destroy();
    this.transient.length = 0;

    const holes = PACKS[this.pack].holes;
    const cols = 3;
    const spacing = 172;
    const top = 560;
    const r = 62;

    for (let i = 0; i < holes.length; i++) {
      const hole = holes[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = VIEW_W / 2 + (col - 1) * spacing;
      const y = top + row * spacing;
      const earned = this.ctx.starsOf(hole.id);
      const index = i + 1;

      const btn = new Button(this, x, y, {
        radius: r,
        fill: earned > 0 ? COLORS.green : COLORS.ink,
        fillAlpha: earned > 0 ? 0.95 : 0.85,
        icon: (g) => {
          pips(g, 0, -12, 30, index);
          for (let s = 0; s < 3; s++) {
            star(g, (s - 1) * 24, 34, 10, s < earned);
          }
        },
        onTap: () => {
          this.ctx.sfx.unlock();
          this.ctx.sfx.tap();
          this.cameras.main.fadeOut(180, 0x23, 0x20, 0x1d);
          this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
            this.scene.start('play', { holeId: hole.id });
          });
        },
      });
      btn.setDepth(DEPTH.hud);
      this.transient.push(btn);
    }

    // Total-stars footer: one star and a bar toward the next unlock.
    const g = this.add.graphics().setDepth(DEPTH.hud);
    this.transient.push(g);
    const need = this.ctx.starsToUnlockNext;
    star(g, VIEW_W / 2 - 150, VIEW_H - 86, 20, this.ctx.totalStars > 0);
    const total = this.ctx.totalStars;
    const target = need > 0 ? total + need : Math.max(1, total);
    this.progressBar(g, VIEW_W / 2 - 118, VIEW_H - 94, 270, total / target);
    if (need > 0) padlock(g, VIEW_W / 2 + 176, VIEW_H - 88, 20);
  }

  /** Refusal feedback for a locked pack. */
  private shake(target: Phaser.GameObjects.Graphics): void {
    this.tweens.add({
      targets: target,
      x: { from: -6, to: 0 },
      duration: 90,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
    });
  }
}
