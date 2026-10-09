import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      // Игра, лаборатория идей и отдельная примерочная; /lab/ управляется LAB.
      input: { index: 'index.html', lab: 'lab/index.html', fitting: 'lab/fitting-room/index.html' },
      output: {
        // Keep Three reusable across game updates, behind the dynamic startup import.
        codeSplitting: {
          groups: [{ name: 'three-vendor', test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
});
