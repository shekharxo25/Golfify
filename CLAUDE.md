# Absurd Mini Golf

Top-down 2D mini golf for web. Pull back to aim, release to shoot.
Full specification in SPEC.md — read the relevant section before implementing.

## Stack
TypeScript (strict) · Vite · Phaser 3 · Vitest · localStorage
No React. No ECS. No 3D.

## CRITICAL: physics are custom, not a library
Do NOT install or use Matter.js, Box2D, Planck, or Phaser Arcade Physics.
Physics live in src/sim/physics/ as pure TypeScript. Reasons: determinism
across framerates, replayable ghosts from input arrays, and testability.

Requirements that are non-negotiable:
- Fixed timestep 120Hz with an accumulator. Never integrate on render delta.
- Continuous collision (swept circle vs segment). At max speed the ball moves
  13px/step against a 14px radius — discrete checks WILL tunnel through walls.
- No Math.random() in the physics path. Use the seeded mulberry32 PRNG.
- Max 4 collision resolutions per step, then zero remaining motion.

## Architecture rule
- src/sim/    Pure TypeScript. NEVER import Phaser. Must run in Node.
- src/render/ Phaser only. Reads sim state, never mutates it.
One-way flow: sim emits typed events, render subscribes.
(Enforced by a `no-restricted-imports` ESLint rule scoped to src/sim.)

## Conventions
- All tunable numbers in src/sim/config.ts. No magic numbers in systems.
  Render-only numbers live in src/render/theme.ts and src/render/renderConfig.ts.
- Logical resolution 720x1280 portrait. Phaser.Scale.FIT.
- Drag within 70px of the ball = aim. Drag elsewhere = camera pan.
- Measure drag power in SCREEN space so zoom doesn't affect shot strength.
- No text in gameplay. Icons and animation only.
- Surfaces must be distinguishable without colour (patterns, not just hues).

## Commands
npm run dev · npm run build · npm run test · npm run lint

## Working style
- ONE phase from SPEC.md section 12 at a time. Stop at the gate.
- Physics changes require passing tests in src/tests/physics/ before done.
- Run test + build before declaring any phase complete.
- Files over ~250 lines get split.
- Do not add features not in SPEC.md. Ask first.
