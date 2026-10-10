import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, rmdir } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION } from '../shared/constants.ts';
import type { ServerMsg } from '../shared/messages.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

for (const recover of [true, false]) {
  test(`real main handles deferred persistence failure: ${recover ? 'pending profile survives recovery' : 'permanent fault exits within a bound'}`,
    { timeout: 20_000 }, async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'opus-storage-failure-'));
      const reservation = net.createServer();
      reservation.listen(0, '127.0.0.1');
      await once(reservation, 'listening');
      const address = reservation.address();
      assert.ok(address && typeof address === 'object');
      const port = address.port;
      await new Promise<void>(resolve => reservation.close(() => resolve()));
      const child = spawn(process.execPath, ['server/main.ts'], { cwd: root, env: {
        ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_DIR: dir,
        VOICE: '0', FORTRESS: '0', FIGHT: '0', SKILL: '0', BOATRACE: '0', HIDE: '0', STORM: '0', PIRATES: '0', FISH2: '0',
        GIFTS: '0', ROULETTE: '0', RATRACE: '0', LAB: '0', JUKEBOX: '0', BILLIARDS: '0', PLANE: '0', VOTEKICK: '0',
      }, stdio: ['ignore', 'pipe', 'pipe'] });
      let exited = false, ready = false, stdout = '', stderr = '';
      child.stdout.on('data', chunk => {
        stdout = (stdout + chunk).slice(-4000);
        ready ||= stdout.includes(`http://127.0.0.1:${port}`);
      });
      child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
      const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
        child.once('exit', (code, signal) => { exited = true; resolve({ code, signal }); });
      });
      let ws: WebSocket | undefined;
      try {
        for (let i = 0; i < 160 && !ready && !exited; i++) await sleep(25);
        assert.ok(ready && !exited, 'isolated main must start before injecting the storage fault');
        // A real filesystem error at the next atomic save; the live server has already loaded successfully.
        const obstruction = path.join(dir, 'state.json.tmp');
        await mkdir(obstruction);
        ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const closed = new Promise<number>(resolve => ws!.once('close', code => resolve(code)));
        const me = new Promise<Extract<ServerMsg, { t: 'me' }>>((resolve, reject) => {
          ws!.on('message', (data, binary) => {
            if (binary) return;
            const msg = JSON.parse(data.toString()) as ServerMsg;
            if (msg.t === 'me') resolve(msg);
            if (msg.t === 'error') reject(new Error(`hello rejected: ${msg.code}`));
          });
          ws!.once('error', reject);
        });
        await once(ws, 'open');
        ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, key: 'storage-process-fixture-key-0001', nick: 'Tester7' }));
        const profile = await me;
        assert.equal(profile.nick, 'Tester7');
        assert.equal(profile.tokens, 100);
        await assert.rejects(readFile(path.join(dir, 'state.json')), { code: 'ENOENT' }, 'the acknowledged profile is still pending');

        const closeCode = await closed;
        assert.equal(closeCode, 1012, 'storage failure must close the client for reconnect, not crash with 1006');
        if (recover) await rmdir(obstruction);

        for (let i = 0; i < 200 && !exited; i++) await sleep(25);
        assert.ok(exited, 'storage failure left main running after the retry deadline');
        const result = await exit;
        assert.deepEqual(result, { code: 1, signal: null }, 'storage failure requires a controlled nonzero restart');
        assert.doesNotMatch(stderr, /\n\s+at |UnhandledPromiseRejection|uncaughtException/, 'failure must be handled without an unhandled stack');
        if (recover) {
          const saved = JSON.parse(await readFile(path.join(dir, 'state.json'), 'utf8'));
          assert.equal(saved.profiles.length, 1, 'retry must persist the already acknowledged profile exactly once');
          assert.equal(saved.nextId, 2);
          assert.equal(saved.profiles[0].id, profile.pid);
          assert.equal(saved.profiles[0].nick, 'Tester7');
          assert.equal(saved.profiles[0].tokens, 100, 'retry must not replay a login bonus or lose the pending balance');
        } else {
          await assert.rejects(readFile(path.join(dir, 'state.json')), { code: 'ENOENT' });
        }
      } finally {
        ws?.terminate();
        if (!exited) child.kill('SIGTERM');
        for (let i = 0; i < 40 && !exited; i++) await sleep(25);
        if (!exited) child.kill('SIGKILL');
        await exit;
        await rm(dir, { recursive: true, force: true });
      }
    });
}
