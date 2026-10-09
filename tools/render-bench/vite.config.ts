import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const hash = createHash('sha256');
for (const name of readdirSync(root).filter(n => /\.(ts|html|css|json)$/.test(n)).sort()) hash.update(name).update(readFileSync(path.join(root, name)));
const build = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), fingerprint: hash.digest('hex'), builtAt: new Date().toISOString() };

export default defineConfig({
  root,
  define: { __BENCH_BUILD__: JSON.stringify(build) },
  server: { host: '127.0.0.1', port: 5199, strictPort: true, fs: { allow: [path.resolve(root, '../..')] } },
  preview: { host: '127.0.0.1', port: 5199, strictPort: true },
  build: { outDir: 'dist', target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1800 },
});
