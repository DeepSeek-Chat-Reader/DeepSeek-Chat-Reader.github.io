import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'node:path';

// Builds src/app.html into dist/app.html as a single self-contained file.
// scripts/finalize.mjs then copies it to ./index.html (the deploy artifact).
export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      input: resolve(__dirname, 'src/app.html'),
    },
    // Inline all assets (fonts, images) as data URIs for true offline use
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
  },
  plugins: [viteSingleFile()],
  server: {
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
