import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        // Keep Three reusable across game updates, behind the dynamic startup import.
        codeSplitting: {
          groups: [{ name: 'three-vendor', test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
});
