import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      // Две страницы: игра и лаборатория идей (/lab/, см. server/lab/http.ts)
      input: { index: 'index.html', lab: 'lab/index.html' },
      output: {
        // Keep Three reusable across game updates, behind the dynamic startup import.
        codeSplitting: {
          groups: [{ name: 'three-vendor', test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
});
