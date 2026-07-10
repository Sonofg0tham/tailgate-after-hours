import { defineConfig } from 'vitest/config';

// Honour a PORT from the environment (used by preview tooling), fall back to
// the Vite default. strictPort stays off so a busy port never blocks dev.
export default defineConfig({
  // Relative asset paths so the same dist/ works from a domain root (Vercel)
  // or unzipped into a subdirectory (the itch.io artefact) without a rebuild.
  base: './',
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  build: {
    // Three.js alone is well past the default 500kB warning. Expected for a
    // 3D game, so raise the bar rather than silence warnings we would want
    // to hear about. Raised again at Phase 6: the full game (audio engine,
    // kiosk/settings UI, mission systems) minifies to ~690kB (~185kB gzip).
    chunkSizeWarningLimit: 750,
  },
  test: {
    // The input/collision maths is pure logic, so its tests need no DOM.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
