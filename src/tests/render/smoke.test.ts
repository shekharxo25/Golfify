// @vitest-environment jsdom
// The canvas stub must be installed before Phaser is imported; see its header.
import './support/canvasStub';
import Phaser from 'phaser';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BootScene } from '../../render/scenes/BootScene';
import { MenuScene } from '../../render/scenes/MenuScene';
import { PlayScene } from '../../render/scenes/PlayScene';
import { MAX_DRAG_DIST, MIN_DRAG_DIST } from '../../sim/config';
import type { GameContext } from '../../render/GameContext';
import { CONTEXT_KEY } from '../../render/GameContext';
import type { HoleSession } from '../../sim/game/HoleSession';
import { allHoles } from '../../sim/level/courses';

/**
 * Boots the real game in Phaser's HEADLESS mode and drives it through the menu
 * and every hole, including a full aim-drag-release on each.
 *
 * There is no renderer, so this proves nothing about how the game looks — it
 * proves that every scene, view, input handler and teardown path executes
 * without throwing, which neither the build nor the typecheck can show.
 */

let game: Phaser.Game;
let errors: string[] = [];
let clock = 0;
let wallStart = 0;

/**
 * Advance the game by whole frames on a synthetic clock.
 *
 * Two things make this work. Phaser's own requestAnimationFrame loop is stopped
 * first, because two clocks feeding TimeStep cancel out to a zero delta. And the
 * system clock is moved in lockstep with the frame clock, because since 3.60
 * Phaser's tweens measure their own delta from Date.now() rather than from the
 * frame delta — without that, no tween in the game ever completes here.
 *
 * In HEADLESS mode the frame callback is `headlessStep`: scenes, input and
 * tweens run, rendering is skipped.
 */
function pump(steps: number, dt = 16.667): void {
  for (let i = 0; i < steps; i++) {
    clock += dt;
    vi.setSystemTime(wallStart + clock);
    game.headlessStep(clock, dt);
  }
}

const sceneOf = <T extends Phaser.Scene>(key: string): T => game.scene.getScene(key) as T;

/** The private field PlayScene keeps its session in; read-only, for assertions. */
const sessionOf = (play: PlayScene): HoleSession =>
  (play as unknown as { session: HoleSession }).session;

/** A stand-in for Phaser.Input.Pointer carrying only what AimController reads. */
function fakePointer(x: number, y: number, isDown: boolean): Phaser.Input.Pointer {
  return { x, y, isDown } as Phaser.Input.Pointer;
}

/**
 * World -> screen, derived by probing the camera's own screen -> world mapping.
 *
 * The camera's matrix and worldView are only refreshed during rendering, which
 * HEADLESS skips, so neither can be read directly here. Sampling getWorldPoint
 * at three points recovers whatever transform the camera is actually applying,
 * which is by definition the one AimController will invert.
 */
function toScreen(cam: Phaser.Cameras.Scene2D.Camera, wx: number, wy: number): { x: number; y: number } {
  const o = cam.getWorldPoint(0, 0);
  const ox = o.x;
  const oy = o.y;
  const ux = cam.getWorldPoint(1, 0).x - ox;
  const uy = cam.getWorldPoint(0, 1).y - oy;
  return { x: (wx - ox) / ux, y: (wy - oy) / uy };
}

/**
 * Aim at a world point and hit it at the given power.
 *
 * The gesture is a pull-back, so the pointer has to end up on the far side of
 * the ball from the target — the same thing a player's thumb does.
 */
function puttToward(play: PlayScene, tx: number, ty: number, power: number): void {
  const ball = sessionOf(play).sim.state.ball;
  const cam = play.cameras.main;
  const to = toScreen(cam, tx, ty);
  const at = toScreen(cam, ball.x, ball.y);
  const len = Math.hypot(to.x - at.x, to.y - at.y) || 1;
  const reach = MIN_DRAG_DIST + power * (MAX_DRAG_DIST - MIN_DRAG_DIST);
  putt(play, (-(to.x - at.x) / len) * reach, (-(to.y - at.y) / len) * reach);
}

/** Drag from the ball outwards and release: one putt through the real input path. */
function putt(play: PlayScene, dragX: number, dragY: number): void {
  const cam = play.cameras.main;
  const ball = sessionOf(play).sim.state.ball;
  const { x: sx, y: sy } = toScreen(cam, ball.x, ball.y);
  const input = play.input;
  input.emit(Phaser.Input.Events.POINTER_DOWN, fakePointer(sx, sy, true));
  input.emit(Phaser.Input.Events.POINTER_MOVE, fakePointer(sx + dragX * 0.5, sy + dragY * 0.5, true));
  pump(2);
  input.emit(Phaser.Input.Events.POINTER_MOVE, fakePointer(sx + dragX, sy + dragY, true));
  pump(2);
  input.emit(Phaser.Input.Events.POINTER_UP, fakePointer(sx + dragX, sy + dragY, false));
}

beforeAll(async () => {
  vi.useFakeTimers();
  wallStart = Date.now();
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  const host = document.createElement('div');
  host.id = 'game';
  document.body.append(host);

  game = new Phaser.Game({
    type: Phaser.HEADLESS,
    parent: 'game',
    width: 720,
    height: 1280,
    scene: [BootScene, MenuScene, PlayScene],
    audio: { noAudio: true },
    banner: false,
  });

  await new Promise<void>((resolve) => game.events.once(Phaser.Core.Events.READY, resolve));
  game.loop.stop();
  clock = 0;
});

afterAll(() => {
  game.destroy(true);
  vi.useRealTimers();
});

describe('render smoke', () => {
  it('boots through to the menu', () => {
    pump(60);
    expect(sceneOf('menu').scene.isActive()).toBe(true);
    expect(errors).toEqual([]);
  });

  it('runs a full aim, shot and settle on every hole', () => {
    for (const hole of allHoles()) {
      errors = [];
      game.scene.start('play', { holeId: hole.id });
      pump(1);
      const play = sceneOf<PlayScene>('play');
      expect(play.scene.isActive(), hole.id).toBe(true);

      // Let the opening camera move finish so the session leaves 'reading'.
      pump(140);
      const session = sessionOf(play);
      expect(session.hole.id).toBe(hole.id);
      expect(session.canAim, `${hole.id} should be aimable`).toBe(true);

      // A pull back down-screen: aims the ball up the hole at full power.
      putt(play, 0, 300);
      expect(session.strokes, `${hole.id} should have taken a stroke`).toBe(1);

      // Roll it out. Long enough to settle, sink, or take a hazard penalty.
      pump(420);
      expect(session.phase === 'aiming' || session.phase === 'complete', hole.id).toBe(true);
      expect(errors, hole.id).toEqual([]);
    }
  });

  it('sinks a hole, shows the result and records it', () => {
    errors = [];
    const hole = allHoles()[0];
    game.scene.start('play', { holeId: hole.id });
    pump(1);
    const play = sceneOf<PlayScene>('play');
    pump(140);
    const session = sessionOf(play);
    const cup = session.sim.world.cup;

    // Putt at the cup until it drops. A miss leaves the ball somewhere new, so
    // each attempt re-aims from wherever it came to rest.
    for (let attempt = 0; attempt < 24 && session.phase !== 'complete'; attempt++) {
      if (!session.canAim) {
        pump(30);
        continue;
      }
      const ball = session.sim.state.ball;
      const dist = Math.hypot(cup.x - ball.x, cup.y - ball.y);
      puttToward(play, cup.x, cup.y, Math.min(0.85, 0.16 + dist / 1400));
      pump(200);
    }

    expect(session.phase, 'should have sunk the ball').toBe('complete');
    expect(session.sim.state.sunk).toBe(true);

    // Let the result panel build itself, stars and all.
    pump(120);
    const ctx = game.registry.get(CONTEXT_KEY) as GameContext;
    const record = ctx.save.recordOf(hole.id);
    expect(record, 'the run should be saved').toBeDefined();
    expect(record?.bestStrokes).toBe(session.strokes);
    expect(record?.ghost.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  it('replays the saved ghost on a revisit', () => {
    errors = [];
    const hole = allHoles()[0];
    game.scene.start('play', { holeId: hole.id });
    pump(160);
    const play = sceneOf<PlayScene>('play');
    const ghost = (play as unknown as { ghost: unknown }).ghost;
    expect(ghost, 'a ghost should be loaded from the save').not.toBeNull();

    // The ghost only sets off once the player does.
    puttToward(play, sessionOf(play).sim.world.cup.x, sessionOf(play).sim.world.cup.y, 0.5);
    pump(240);
    expect(errors).toEqual([]);
  });

  it('returns to the menu and tears the hole down cleanly', () => {
    game.scene.start('play', { holeId: allHoles()[0].id });
    pump(60);
    game.scene.start('menu', { pack: 0 });
    pump(60);
    expect(sceneOf('menu').scene.isActive()).toBe(true);
    expect(errors).toEqual([]);
  });
});
