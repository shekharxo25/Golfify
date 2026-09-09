import { PACKS, DEV_PACK } from '../sim/level/courses';
import { LevelError, parseHole } from '../sim/level/LevelLoader';
import type { HoleData, Pt } from '../sim/types';
import { BALL_RADIUS, CUP_RADIUS } from '../sim/config';

/**
 * Hole inspector.
 *
 * A tool, not part of the game: it draws straight to a 2D canvas rather than
 * loading Phaser, and it validates through the same parseHole() the game and
 * the tests use, so anything it accepts is playable and anything it rejects
 * would have failed at load.
 */

const PALETTE = {
  bg: '#23201d',
  green: '#5c9a52',
  wall: '#c9bfae',
  sand: '#d9c188',
  water: '#3b6ea8',
  ice: '#9fd4e8',
  rough: '#3f6b3a',
  element: '#e0574a',
  cup: '#0d0c0a',
  tee: '#e9e3d8',
} as const;

const root = document.getElementById('editor');
if (root === null) throw new Error('#editor missing');

const holes: HoleData[] = [...PACKS.flatMap((p) => p.holes), ...DEV_PACK.holes];

root.innerHTML = `
  <aside>
    <h1>Holes</h1>
    <ul id="list"></ul>
  </aside>
  <main>
    <canvas id="stage" width="720" height="1280"></canvas>
    <section>
      <h2>Paste hole JSON to validate</h2>
      <textarea id="src" spellcheck="false"></textarea>
      <p id="status">Pick a hole, or paste JSON above.</p>
    </section>
  </main>
`;

const list = document.getElementById('list') as HTMLUListElement;
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const src = document.getElementById('src') as HTMLTextAreaElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const ctx = canvas.getContext('2d');
if (ctx === null) throw new Error('2d context unavailable');

for (const hole of holes) {
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.textContent = `${hole.id} · par ${hole.par}`;
  btn.addEventListener('click', () => {
    src.value = JSON.stringify(hole, null, 2);
    show(hole);
  });
  li.append(btn);
  list.append(li);
}

src.addEventListener('input', () => {
  if (src.value.trim() === '') return;
  try {
    show(parseHole(JSON.parse(src.value) as unknown));
  } catch (err) {
    fail(err);
  }
});

function fail(err: unknown): void {
  status.textContent =
    err instanceof LevelError || err instanceof Error ? err.message : 'invalid JSON';
  status.dataset.state = 'bad';
}

function show(hole: HoleData): void {
  status.textContent = `${hole.id} — valid · par ${hole.par}${hole.hint === undefined ? '' : ` · ${hole.hint}`}`;
  status.dataset.state = 'ok';
  draw(hole);
}

function path(g: CanvasRenderingContext2D, poly: Pt[]): void {
  g.beginPath();
  poly.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
}

function draw(hole: HoleData): void {
  const g = ctx as CanvasRenderingContext2D;
  const { w, h } = hole.bounds;
  canvas.width = w;
  canvas.height = h;
  g.fillStyle = PALETTE.bg;
  g.fillRect(0, 0, w, h);

  for (const green of hole.greens) {
    g.fillStyle = PALETTE.green;
    path(g, green.poly);
    g.fill();
  }
  for (const hazard of hole.hazards) {
    g.fillStyle = PALETTE[hazard.type];
    path(g, hazard.poly);
    g.fill();
  }
  for (const el of hole.elements) {
    g.fillStyle = PALETTE.element;
    g.strokeStyle = PALETTE.element;
    g.lineWidth = 6;
    if ('poly' in el) {
      path(g, el.poly);
      g.globalAlpha = 0.6;
      g.fill();
      g.globalAlpha = 1;
    } else if (el.type === 'bumper') {
      g.beginPath();
      g.arc(el.c[0], el.c[1], el.r ?? 26, 0, Math.PI * 2);
      g.fill();
    } else if (el.type === 'portal') {
      for (const mouth of [el.a, el.b]) {
        g.beginPath();
        g.arc(mouth.c[0], mouth.c[1], mouth.r ?? 30, 0, Math.PI * 2);
        g.stroke();
      }
    } else if (el.type === 'windmill') {
      g.beginPath();
      g.arc(el.c[0], el.c[1], el.bladeLen, 0, Math.PI * 2);
      g.stroke();
    } else if (el.type === 'mover') {
      for (const seg of el.segs) {
        g.beginPath();
        g.moveTo(seg.a[0], seg.a[1]);
        g.lineTo(seg.b[0], seg.b[1]);
        g.stroke();
      }
    }
  }

  g.strokeStyle = PALETTE.wall;
  g.lineWidth = 12;
  g.lineCap = 'round';
  for (const wall of hole.walls) {
    g.beginPath();
    g.moveTo(wall.a[0], wall.a[1]);
    g.lineTo(wall.b[0], wall.b[1]);
    g.stroke();
  }

  g.fillStyle = PALETTE.cup;
  g.beginPath();
  g.arc(hole.cup[0], hole.cup[1], CUP_RADIUS, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = PALETTE.tee;
  g.beginPath();
  g.arc(hole.tee[0], hole.tee[1], BALL_RADIUS, 0, Math.PI * 2);
  g.fill();
}

show(holes[0]);
src.value = JSON.stringify(holes[0], null, 2);
