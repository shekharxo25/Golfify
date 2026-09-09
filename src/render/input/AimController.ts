import Phaser from 'phaser';
import { AIM_GRAB_RADIUS, MIN_DRAG_DIST, dragToPower } from '../../sim/config';
import { CAM_MAX_ZOOM, CAM_MIN_ZOOM, CAM_PAN_MARGIN, TAP_MS, TAP_SLOP } from '../renderConfig';

export interface AimState {
  angleRad: number;
  power: number;
  /** Where the finger is, in world space, for drawing the pull-back tether. */
  pullX: number;
  pullY: number;
}

export interface AimHandlers {
  /** Current ball position in world space, or null while a shot is in flight. */
  ballAt: () => { x: number; y: number } | null;
  canAim: () => boolean;
  onAim: (state: AimState) => void;
  onRelease: (state: AimState) => void;
  onCancel: () => void;
  /** A tap that was neither an aim nor a pan — used to skip the opening camera move. */
  onTap: () => void;
}

type Mode = 'idle' | 'aim' | 'pan';

/**
 * Splits pointer input between aiming and camera panning.
 *
 * A pointerdown inside AIM_GRAB_RADIUS of the ball starts an aim; anywhere
 * else pans the camera (CLAUDE.md). Power comes from the drag length measured
 * in SCREEN pixels — the drag is computed in world space and multiplied by the
 * camera zoom, which is the same number and avoids a second projection — so
 * zooming in never changes how hard a given drag hits.
 */
export class AimController {
  private mode: Mode = 'idle';
  private downAt = 0;
  private downX = 0;
  private downY = 0;
  private panScrollX = 0;
  private panScrollY = 0;
  private readonly bounds: Phaser.Geom.Rectangle;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly h: AimHandlers,
    worldBounds: { minX: number; minY: number; maxX: number; maxY: number },
  ) {
    this.bounds = new Phaser.Geom.Rectangle(
      worldBounds.minX - CAM_PAN_MARGIN,
      worldBounds.minY - CAM_PAN_MARGIN,
      worldBounds.maxX - worldBounds.minX + CAM_PAN_MARGIN * 2,
      worldBounds.maxY - worldBounds.minY + CAM_PAN_MARGIN * 2,
    );

    const input = scene.input;
    input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private get cam(): Phaser.Cameras.Scene2D.Camera {
    return this.scene.cameras.main;
  }

  /** The aim vector: from the pointer back to the ball, i.e. a pull-back. */
  private stateFor(pointer: Phaser.Input.Pointer): AimState | null {
    const ball = this.h.ballAt();
    if (ball === null) return null;
    const world = this.cam.getWorldPoint(pointer.x, pointer.y);
    const dx = ball.x - world.x;
    const dy = ball.y - world.y;
    const screenDist = Math.hypot(dx, dy) * this.cam.zoom;
    return {
      angleRad: Math.atan2(dy, dx),
      power: dragToPower(screenDist),
      pullX: world.x,
      pullY: world.y,
    };
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    this.downAt = this.scene.time.now;
    this.downX = pointer.x;
    this.downY = pointer.y;

    const ball = this.h.ballAt();
    const world = this.cam.getWorldPoint(pointer.x, pointer.y);
    const near =
      ball !== null && Math.hypot(ball.x - world.x, ball.y - world.y) <= AIM_GRAB_RADIUS;

    if (near && this.h.canAim()) {
      this.mode = 'aim';
      const st = this.stateFor(pointer);
      if (st !== null) this.h.onAim(st);
      return;
    }
    this.mode = 'pan';
    this.panScrollX = this.cam.scrollX;
    this.panScrollY = this.cam.scrollY;
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (!pointer.isDown) return;
    if (this.mode === 'aim') {
      const st = this.stateFor(pointer);
      if (st !== null) this.h.onAim(st);
      return;
    }
    if (this.mode === 'pan') {
      const zoom = this.cam.zoom;
      this.cam.scrollX = this.panScrollX - (pointer.x - this.downX) / zoom;
      this.cam.scrollY = this.panScrollY - (pointer.y - this.downY) / zoom;
      this.clampCamera();
    }
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    const mode = this.mode;
    this.mode = 'idle';
    const travel = Math.hypot(pointer.x - this.downX, pointer.y - this.downY);
    const quick = this.scene.time.now - this.downAt < TAP_MS;

    if (mode === 'aim') {
      const st = this.stateFor(pointer);
      if (st === null) {
        this.h.onCancel();
        return;
      }
      // A short pull is a mis-grab, not a putt: cancel rather than dribble.
      const screenDist = travel;
      if (st.power <= 0 && screenDist < MIN_DRAG_DIST) {
        this.h.onCancel();
        if (quick) this.h.onTap();
        return;
      }
      this.h.onRelease(st);
      return;
    }
    if (mode === 'pan' && quick && travel < TAP_SLOP) this.h.onTap();
  }

  private onWheel(
    _pointer: Phaser.Input.Pointer,
    _over: unknown[],
    _dx: number,
    dy: number,
  ): void {
    const next = Phaser.Math.Clamp(this.cam.zoom * (dy > 0 ? 0.92 : 1.08), CAM_MIN_ZOOM, CAM_MAX_ZOOM);
    this.cam.setZoom(next);
    this.clampCamera();
  }

  /**
   * Keep the playfield (plus a margin) from sliding off the screen. When the
   * view is wider or taller than the hole — which it is on the short holes, and
   * on every hole once zoomed out — that axis is centred instead of clamped,
   * or the clamp would fight the player and shove the hole off-centre.
   */
  private clampCamera(): void {
    const cam = this.cam;
    const halfW = cam.width / (2 * cam.zoom);
    const halfH = cam.height / (2 * cam.zoom);
    const b = this.bounds;
    const cx =
      halfW * 2 >= b.width
        ? b.centerX
        : Phaser.Math.Clamp(cam.scrollX + halfW, b.x + halfW, b.right - halfW);
    const cy =
      halfH * 2 >= b.height
        ? b.centerY
        : Phaser.Math.Clamp(cam.scrollY + halfH, b.y + halfH, b.bottom - halfH);
    cam.setScroll(cx - halfW, cy - halfH);
  }

  destroy(): void {
    const input = this.scene.input;
    input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    input.off(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
  }
}
