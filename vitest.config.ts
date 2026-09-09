import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Under Node, "phaser" resolves to its unbundled source (package.json
      // "main"), which requires a WebGL debug package that is not installed.
      // Point the tests at the same prebuilt bundle the browser gets via the
      // "browser" field, so the render smoke test loads what ships.
      phaser: 'phaser/dist/phaser.js',
    },
  },
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    testTimeout: 120_000,
  },
});
