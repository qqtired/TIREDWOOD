import { defineConfig } from 'vite';
import path from 'node:path';

const project = path.resolve(import.meta.dirname, '../..');
// Только собственный origin и локальные загруженные файлы. Blob нужен встроенным текстурам GLB.
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' blob:; worker-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
export default defineConfig({
  root: path.join(project, 'lab/fitting-room'),
  base: process.env.FITTING_BASE ?? '/fitting-room/',
  publicDir: false,
  server: { host: '127.0.0.1', port: 5220, strictPort: true, fs: { allow: [project] } },
  preview: { host: '127.0.0.1', port: 5220, strictPort: true, headers: { 'Content-Security-Policy': csp, 'X-Robots-Tag': 'noindex, nofollow' } },
  build: { outDir: path.join(project, 'dist-fitting-room'), target: 'es2022', sourcemap: false, emptyOutDir: false, chunkSizeWarningLimit: 1500,
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'three-vendor', test: /node_modules[\\/]three[\\/]/ }] } } } },
});
