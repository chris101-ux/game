import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: true, port: 5173 },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 4000,
  },
  optimizeDeps: {
    // Rapier ships an inlined wasm blob; pre-bundling it is slow and unnecessary.
    exclude: ['@dimforge/rapier3d-compat'],
  },
});
