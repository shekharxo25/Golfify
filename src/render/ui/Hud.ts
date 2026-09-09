import Phaser from 'phaser';
import { DEPTH, HUD_MARGIN, PIP_GAP, PIP_R, VIEW_W } from '../renderConfig';
import { COLORS } from '../theme';
import { Button } from './Button';
import { flag, grid, pips, retry, speaker, strokeRow } from './Icons';

export interface HudCallbacks {
  onMenu: () => void;
  onRetry: () => void;
  onMute: () => void;
  isMuted: () => boolean;
}

/**
 * In-play readouts: strokes taken, the hole's par, and the three controls.
 *
 * Entirely icon-driven. Strokes are a row of pips that fills as you play, par
 * is a dice cluster beside a flag — no digits anywhere (CLAUDE.md).
 */
export class Hud {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly muteBtn: Button;
  private strokes = 0;
  private par = 0;
  private readonly readoutX: number;

  constructor(scene: Phaser.Scene, cb: HudCallbacks, leftHanded: boolean) {
    this.g = scene.add.graphics().setDepth(DEPTH.hud).setScrollFactor(0);

    // Left-handed players get the controls under their thumb and the readout
    // on the far side, mirrored (SPEC settings).
    const btnX = leftHanded ? HUD_MARGIN + 30 : VIEW_W - HUD_MARGIN - 30;
    this.readoutX = leftHanded ? VIEW_W - HUD_MARGIN - 150 : HUD_MARGIN;

    const r = 27;
    new Button(scene, btnX, HUD_MARGIN + 30, {
      radius: r,
      icon: (g, ir) => grid(g, 0, 0, ir),
      onTap: cb.onMenu,
    }).setDepth(DEPTH.hud);

    new Button(scene, btnX, HUD_MARGIN + 30 + r * 2.5, {
      radius: r,
      icon: (g, ir) => retry(g, 0, 0, ir),
      onTap: cb.onRetry,
    }).setDepth(DEPTH.hud);

    this.muteBtn = new Button(scene, btnX, HUD_MARGIN + 30 + r * 5, {
      radius: r,
      icon: (g, ir) => speaker(g, 0, 0, ir, cb.isMuted()),
      onTap: () => {
        cb.onMute();
        this.muteBtn.refresh();
      },
    });
    this.muteBtn.setDepth(DEPTH.hud);
  }

  set(strokes: number, par: number): void {
    if (strokes === this.strokes && par === this.par) return;
    this.strokes = strokes;
    this.par = par;
    this.redraw();
  }

  private redraw(): void {
    const g = this.g;
    const x = this.readoutX;
    const y = HUD_MARGIN + 18;
    g.clear();

    // Par plate: a flag and the target stroke count.
    g.fillStyle(COLORS.ink, 0.72);
    g.fillRoundedRect(x - 8, y - 20, 122, 46, 14);
    flag(g, x + 16, y + 3, 15);
    pips(g, x + 66, y + 3, 20, this.par);

    // Strokes taken, as a filling row of pips below the plate.
    const rowY = y + 52;
    strokeRow(g, x + 12, rowY, this.strokes, PIP_R, PIP_GAP, COLORS.cream);
    // Ghost pips for the strokes still inside par, so the player sees the budget.
    if (this.strokes < this.par) {
      g.fillStyle(COLORS.cream, 0.22);
      for (let i = this.strokes; i < this.par; i++) {
        const row = Math.floor(i / 6);
        const col = i % 6;
        g.fillCircle(x + 12 + col * PIP_GAP, rowY + row * PIP_GAP, PIP_R);
      }
    }
    // Over par: the overflow pips turn warning-coloured.
    if (this.strokes > this.par) {
      g.fillStyle(COLORS.power2, 1);
      for (let i = this.par; i < this.strokes; i++) {
        const row = Math.floor(i / 6);
        const col = i % 6;
        g.fillCircle(x + 12 + col * PIP_GAP, rowY + row * PIP_GAP, PIP_R);
      }
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
