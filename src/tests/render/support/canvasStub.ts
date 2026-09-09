/**
 * A no-op 2D context for jsdom.
 *
 * Phaser probes canvas capabilities at *import* time (device/CanvasFeatures),
 * so this must be installed before Phaser is imported. Import it first in any
 * test that loads Phaser: ES module imports execute in source order, which is
 * what makes that ordering reliable.
 */

const base: Record<string, unknown> = {
  canvas: null,
  fillStyle: '',
  strokeStyle: '',
  globalAlpha: 1,
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  font: '',
  measureText: () => ({ width: 10 }),
  // Phaser's inverse-alpha probe reads pixels back and expects real bytes.
  getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) }),
  createLinearGradient: () => ({ addColorStop: () => undefined }),
  createRadialGradient: () => ({ addColorStop: () => undefined }),
  createPattern: () => null,
  getContextAttributes: () => ({ alpha: true }),
};

const ctx = new Proxy(base, {
  get: (target, prop) => (prop in target ? target[prop as string] : () => undefined),
  set: (target, prop, value) => {
    target[prop as string] = value;
    return true;
  },
});

HTMLCanvasElement.prototype.getContext = (() =>
  ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';

/**
 * jsdom does not decode images, so the base64 textures Phaser installs during
 * boot never fire `load` and the game never emits READY. This stub reports a
 * 1x1 image as soon as a src is assigned.
 */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 1;
  height = 1;
  naturalWidth = 1;
  naturalHeight = 1;
  complete = true;
  crossOrigin: string | null = null;
  private srcValue = '';

  get src(): string {
    return this.srcValue;
  }

  set src(value: string) {
    this.srcValue = value;
    queueMicrotask(() => this.onload?.());
  }
}

(window as unknown as { Image: unknown }).Image = FakeImage;
(globalThis as unknown as { Image: unknown }).Image = FakeImage;

export const CANVAS_STUBBED = true;
