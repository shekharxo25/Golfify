import Phaser from 'phaser';
import { GhostPlayer } from '../../sim/game/GhostPlayer';
import { HoleSession } from '../../sim/game/HoleSession';
import { getHole, nextHole } from '../../sim/level/courses';
import type { Vec2 } from '../../sim/types';
import { applyEvents } from '../EventFx';
import { CONTEXT_KEY, type GameContext } from '../GameContext';
import { AimController, type AimState } from '../input/AimController';
import {
  CAM_FOLLOW_LERP,
  CAM_MIN_ZOOM,
  CAM_PAN_MARGIN,
  CAM_PLAY_ZOOM,
  CAM_READ_MS,
  CAM_READ_PAD,
  RESULT_DELAY_MS,
  SHAKE_MAX,
  VIEW_H,
  VIEW_W,
} from '../renderConfig';
import { COLORS } from '../theme';
import { Hud } from '../ui/Hud';
import { ResultPanel } from '../ui/ResultPanel';
import { AimView } from '../views/AimView';
import { BallView, GHOST_STYLE, PLAYER_STYLE } from '../views/BallView';
import { CourseView } from '../views/CourseView';
import { ElementView } from '../views/ElementView';
import { FxView } from '../views/FxView';

/**
 * One hole, start to finish: owns the HoleSession and drives every view from
 * it. The scene reads sim state and never writes to it — the only inputs the
 * sim takes from here are takeShot() and retry() (CLAUDE.md).
 */
export class PlayScene extends Phaser.Scene {
  private ctx!: GameContext;
  private session!: HoleSession;
  private ghost: GhostPlayer | null = null;
  private ghostRunning = false;

  private course!: CourseView;
  private elements!: ElementView;
  private ball!: BallView;
  private ghostBall: BallView | null = null;
  private aimView!: AimView;
  private fx!: FxView;
  private hud!: Hud;
  private result: ResultPanel | null = null;

  private aiming: AimState | null = null;
  private reading = true;
  private resultShown = false;
  private readonly pos: Vec2 = { x: 0, y: 0 };
  private readonly ghostPos: Vec2 = { x: 0, y: 0 };

  constructor() {
    super('play');
  }

  create(data: { holeId: string }): void {
    this.ctx = this.registry.get(CONTEXT_KEY) as GameContext;
    const hole = getHole(data.holeId);
    this.session = new HoleSession(hole);
    this.aiming = null;
    this.reading = true;
    this.resultShown = false;
    this.result = null;
    this.ghostRunning = false;

    const grey = this.ctx.greyscale;
    this.cameras.main.setBackgroundColor(COLORS.voidDeep);
    this.course = new CourseView(this, this.session.sim.world, grey);
    this.elements = new ElementView(this, this.session.sim.world, grey);
    this.fx = new FxView(this, grey);
    this.aimView = new AimView(this, grey);
    this.ball = new BallView(this, PLAYER_STYLE, grey);

    const ghostShots = this.ctx.ghostOf(hole.id);
    if (ghostShots.length > 0) {
      this.ghost = new GhostPlayer(hole, ghostShots);
      this.ghostBall = new BallView(this, GHOST_STYLE, grey);
    } else {
      this.ghost = null;
      this.ghostBall = null;
    }

    this.hud = new Hud(
      this,
      {
        onMenu: () => this.toMenu(),
        onRetry: () => this.restartHole(),
        onMute: () => this.ctx.toggleMute(),
        isMuted: () => this.ctx.sfx.isMuted,
      },
      this.ctx.leftHanded,
    );
    this.hud.set(0, hole.par);

    this.setUpCamera();

    new AimController(
      this,
      {
        ballAt: () => (this.session.canAim ? this.session.sim.state.ball : null),
        canAim: () => this.session.canAim && !this.reading,
        onAim: (st) => {
          this.ctx.sfx.unlock();
          this.aiming = st;
        },
        onRelease: (st) => this.shoot(st),
        onCancel: () => {
          this.aiming = null;
          this.aimView.clear();
        },
        onTap: () => this.skipReading(),
      },
      this.session.sim.world.bounds,
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.cameras.main.fadeIn(200, 0x1a, 0x18, 0x15);
  }

  /** Frame the whole hole, then dolly in to the tee so the player can read it. */
  private setUpCamera(): void {
    const b = this.session.sim.world.bounds;
    const cam = this.cameras.main;
    cam.setBounds(
      b.minX - CAM_PAN_MARGIN,
      b.minY - CAM_PAN_MARGIN,
      b.maxX - b.minX + CAM_PAN_MARGIN * 2,
      b.maxY - b.minY + CAM_PAN_MARGIN * 2,
    );

    const fit = Math.min(
      VIEW_W / (b.maxX - b.minX + CAM_READ_PAD * 2),
      VIEW_H / (b.maxY - b.minY + CAM_READ_PAD * 2),
    );
    const readZoom = Phaser.Math.Clamp(fit, CAM_MIN_ZOOM, CAM_PLAY_ZOOM);
    const midX = (b.minX + b.maxX) / 2;
    const midY = (b.minY + b.maxY) / 2;
    cam.setZoom(readZoom);
    cam.centerOn(midX, midY);

    const tee = this.session.sim.world.tee;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: CAM_READ_MS,
      delay: 280,
      ease: 'Cubic.easeInOut',
      onUpdate: (tween) => {
        if (!this.reading) return;
        const t = tween.getValue() ?? 0;
        cam.setZoom(Phaser.Math.Linear(readZoom, CAM_PLAY_ZOOM, t));
        cam.centerOn(Phaser.Math.Linear(midX, tee.x, t), Phaser.Math.Linear(midY, tee.y, t));
      },
      onComplete: () => this.skipReading(),
    });
  }

  /** Cut the opening camera move short and hand control to the player. */
  private skipReading(): void {
    if (!this.reading) return;
    this.reading = false;
    const cam = this.cameras.main;
    const tee = this.session.sim.world.tee;
    cam.setZoom(CAM_PLAY_ZOOM);
    cam.centerOn(tee.x, tee.y);
    this.session.beginPlay();
  }

  private shoot(st: AimState): void {
    if (!this.session.canAim || this.reading) return;
    this.session.takeShot(st.angleRad, st.power);
    this.ctx.sfx.putt(st.power);
    this.ball.impact(140, st.angleRad);
    this.aiming = null;
    this.aimView.clear();
    // The ghost sets off with the player's first stroke, so a personal best
    // reads as a rival rather than as a cutscene.
    if (this.ghost !== null && !this.ghostRunning) {
      this.ghostRunning = true;
      this.ghost.reset();
    }
  }

  override update(_time: number, delta: number): void {
    const events = this.session.update(delta);
    const st = this.session.sim.state;
    const speed = Math.hypot(st.ball.vx, st.ball.vy);
    const heading = Math.atan2(st.ball.vy, st.ball.vx);

    applyEvents(
      events,
      {
        fx: this.fx,
        sfx: this.ctx.sfx,
        ball: this.ball,
        elements: this.elements,
        shake: (s) => this.cameras.main.shake(120, SHAKE_MAX * s),
      },
      heading,
    );

    this.elements.update(delta);
    this.fx.update(delta);

    this.session.sim.renderPosition(this.pos);
    this.ball.setVisible(!st.sunk);
    this.ball.update(this.pos.x, this.pos.y, speed, delta);

    this.updateGhost(delta);
    this.updateAim();
    this.followBall(delta);
    this.hud.set(this.session.strokes, this.session.hole.par);

    if (this.session.phase === 'complete' && !this.resultShown) {
      this.resultShown = true;
      this.time.delayedCall(RESULT_DELAY_MS, () => this.showResult());
    }
  }

  private updateGhost(delta: number): void {
    const ghost = this.ghost;
    const view = this.ghostBall;
    if (ghost === null || view === null) return;
    if (!this.ghostRunning) {
      view.setVisible(false);
      return;
    }
    ghost.advance(delta);
    ghost.renderPosition(this.ghostPos);
    const gs = ghost.sim.state;
    view.setVisible(!gs.sunk);
    view.update(this.ghostPos.x, this.ghostPos.y, Math.hypot(gs.ball.vx, gs.ball.vy), delta);
  }

  private updateAim(): void {
    const a = this.aiming;
    if (a === null) {
      this.aimView.clear();
      return;
    }
    if (!this.session.canAim) return;
    const ball = this.session.sim.state.ball;
    const preview = this.session.sim.preview(a.angleRad, a.power);
    this.aimView.draw(ball.x, ball.y, a.pullX, a.pullY, a.angleRad, a.power, preview);
  }

  /** Follow the ball while it rolls; leave the camera where the player put it while aiming. */
  private followBall(delta: number): void {
    if (this.reading || this.aiming !== null) return;
    if (this.session.phase !== 'rolling' && !this.session.sim.state.sunk) return;
    const cam = this.cameras.main;
    // Frame-rate independent lerp: the same easing at 60 and 144 fps.
    const t = 1 - Math.pow(1 - CAM_FOLLOW_LERP, delta / 16.6667);
    cam.centerOn(
      Phaser.Math.Linear(cam.midPoint.x, this.pos.x, t),
      Phaser.Math.Linear(cam.midPoint.y, this.pos.y, t),
    );
  }

  private showResult(): void {
    const res = this.session.result();
    const improved = this.ctx.save.recordHole(res.holeId, res.strokes, res.stars, res.shots);
    const follow = nextHole(res.holeId);
    this.result = new ResultPanel(this, res, improved, {
      hasNext: follow !== undefined,
      onRetry: () => this.restartHole(),
      onMenu: () => this.toMenu(),
      onStar: (i) => this.ctx.sfx.star(i),
      onNext: () => {
        if (follow === undefined) return;
        this.ctx.sfx.tap();
        this.scene.restart({ holeId: follow.id });
      },
    });
  }

  private restartHole(): void {
    this.ctx.sfx.back();
    this.scene.restart({ holeId: this.session.hole.id });
  }

  private toMenu(): void {
    this.ctx.sfx.back();
    this.cameras.main.fadeOut(200, 0x1a, 0x18, 0x15);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('menu', { pack: this.session.hole.id.startsWith('p2') ? 1 : 0 });
    });
  }

  /** A scene restart reuses this instance, so every view has to be torn down. */
  private teardown(): void {
    this.result?.destroy();
    this.hud.destroy();
    this.aimView.destroy();
    this.ball.destroy();
    this.ghostBall?.destroy();
    this.fx.destroy();
    this.elements.destroy();
    this.course.destroy();
  }
}
