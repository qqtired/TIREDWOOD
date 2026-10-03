import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
const root = fileURLToPath(new URL('..', import.meta.url));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

test('real main returns400 for malformed percent/UTF-8 paths and remains healthy', { timeout: 20_000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'opus-http-regression-'));
  const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const address = reservation.address(); assert.ok(address && typeof address === 'object'); const port = address.port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const child = spawn(process.execPath, ['server/main.ts'], { cwd: root, env: {
    ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_DIR: dir,
    VOICE: '0', FORTRESS: '0', FIGHT: '0', SKILL: '0', BOATRACE: '0', HIDE: '0', STORM: '0', PIRATES: '0', FISH2: '0',
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  let exited = false, exitCode: number | null = null, stderr = '';
  child.stdout.resume(); child.stderr.on('data', b => { stderr = (stderr + b).slice(-3000); });
  child.on('exit', code => { exited = true; exitCode = code; });
  const request = (target: string) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'GET', path: target, timeout: 1000 }, res => {
      let body = ''; res.on('data', b => { body = (body + b).slice(0, 1200); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('timeout', () => req.destroy(new Error('temporary HTTP timeout'))); req.on('error', reject); req.end();
  });
  try {
    let ready = false;
    for (let i = 0; i < 80 && !exited; i++) {
      try { ready = (await request('/health')).status === 200; } catch { /* Wait for this isolated process. */ }
      if (ready) break; await sleep(50);
    }
    assert.ok(ready, `isolated main did not start, exit=${exitCode}`);
    for (const target of ['/%', '/%FF', '/%E0%A4%A', '/%C0%AF']) {
      const invalid = await request(target); assert.equal(invalid.status, 400, target);
      assert.equal((await request('/health')).status, 200, `healthy after ${target}`);
      assert.equal(exited, false, 'malformed request cannot terminate main');
    }
    assert.ok(!stderr.includes('URIError') && !stderr.includes('UnhandledPromiseRejection'));
  } finally {
    if (!exited) child.kill('SIGTERM');
    for (let i = 0; i < 40 && !exited; i++) await sleep(25);
    if (!exited) { child.kill('SIGKILL'); await once(child, 'exit'); }
    await rm(dir, { recursive: true, force: true });
  }
});
