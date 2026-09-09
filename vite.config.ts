import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 8192,
    rollupOptions: {
      input: {
        main: 'index.html',
        editor: 'editor.html',
      },
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
});
