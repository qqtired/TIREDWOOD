import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');

async function run(fixture: { body?: string; status?: number; unreachable?: boolean }, force = '0', notes: string | null = '• Тестовое обновление игры.') {
  const dir = await mkdtemp(path.join(tmpdir(), 'opus-release-deploy-test-'));
  const project = path.join(dir, 'game-opus');
  const bin = path.join(dir, 'bin');
  const calls = path.join(dir, 'calls');
  const npmCalls = path.join(dir, 'npm-calls');
  const notesFile = path.join(dir, 'notes.txt');
  try {
    for (const part of ['game-opus/server', 'game-opus/shared', 'game-opus/dist', 'game-opus/deploy', 'ssh', 'bin']) await mkdir(path.join(dir, part), { recursive: true });
    await copyFile(path.join(root, 'deploy.sh'), path.join(project, 'deploy.sh'));
    // Настоящий prepare и его runtime-импорты: health проверяется уже после корректной подготовки notes.
    for (const file of ['package.json', 'deploy/announce-release.ts', 'server/tgrelease.ts', 'server/tgfeed.ts', 'server/tgnet.ts', 'shared/messages.ts']) {
      await copyFile(path.join(root, file), path.join(project, file));
    }
    for (const file of ['package-lock.json', 'server/fixture', 'shared/fixture', 'dist/fixture', 'deploy/install.sh']) await writeFile(path.join(project, file), '{}');
    if (notes !== null) await writeFile(notesFile, notes);
    await writeFile(path.join(bin, 'npm'), '#!/bin/sh\nprintf "npm\\n" >> "$OPUS_RELEASE_NPM_CALLS"\nexit 0\n', { mode: 0o700 });
    await writeFile(path.join(bin, 'node'), '#!/bin/sh\nif [ "$1" = deploy/compress.ts ]; then exit 0; fi\nexec "$OPUS_TEST_NODE" "$@"\n', { mode: 0o700 });
    await writeFile(path.join(dir, 'ssh/connect.sh'), '#!/bin/sh\ncat >/dev/null\nprintf "connect\\n" >> "$OPUS_RELEASE_CALLS"\n', { mode: 0o700 });
    let code: number;
    let output: string;
    try {
      const result = await exec('/bin/sh', [path.join(project, 'deploy.sh')], {
        cwd: project, timeout: 10_000, maxBuffer: 256 * 1024,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, NODE_OPTIONS: `--import=${path.join(root, 'test/release-fixture.mjs')}`, OPUS_TEST_NODE: process.execPath,
          FORCE: force, RELEASE_NOTES_FILE: notes === null ? '' : notesFile, OPUS_RELEASE_NPM_CALLS: npmCalls,
          OPUS_RELEASE_CALLS: calls, OPUS_RELEASE_FIXTURE: JSON.stringify({ kind: 'health', body: '{}', ...fixture }) },
      });
      code = 0;
      output = result.stdout + result.stderr;
    } catch (error) {
      const e = error as Error & { code: number; stdout: string; stderr: string; killed?: boolean };
      assert.ok(!e.killed, 'deploy guard must finish, not hang');
      code = e.code;
      output = e.stdout + e.stderr;
    }
    return { code, output, calls: await readFile(calls, 'utf8').catch(() => ''), npmCalls: await readFile(npmCalls, 'utf8').catch(() => '') };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('deploy command refuses missing or empty notes before npm, health and mocked SSH', async (t) => {
  for (const notes of [null, '   \n']) await t.test(notes === null ? 'missing notes' : 'empty notes', async () => {
    const result = await run({ body: '{"ok":true,"busy":0}' }, '0', notes);
    assert.notEqual(result.code, 0, result.output);
    assert.equal(result.npmCalls, '', 'notes must be validated before checks/build');
    assert.equal(result.calls, '', 'notes must be validated before health/upload/install');
    assert.match(result.output, notes === null ? /RELEASE_NOTES_FILE/ : /Не удалось подготовить notes/);
  });
});

test('deploy command refuses unknown health before the mocked upload/install boundary', async (t) => {
  const cases: Array<[string, { body?: string; status?: number; unreachable?: boolean }]> = [
    ['unreachable', { unreachable: true }],
    ['HTTP error', { status: 503, body: '{"ok":true,"busy":0}' }],
    ['malformed JSON', { body: '<html>error</html>' }],
    ['missing healthy status', { body: '{"busy":0}' }],
    ['unhealthy', { body: '{"ok":false,"busy":0}' }],
    ['missing counter', { body: '{"ok":true}' }],
    ['negative counter', { body: '{"ok":true,"busy":-1}' }],
    ['fractional counter', { body: '{"ok":true,"busy":0.5}' }],
    ['string counter', { body: '{"ok":true,"busy":"0"}' }],
    ['null current counter', { body: '{"ok":true,"busy":null,"humans":0}' }],
  ];
  for (const [name, fixture] of cases) await t.test(name, async () => {
    const result = await run(fixture);
    assert.notEqual(result.code, 0, `${name} must stop deployment\n${result.output}`);
    assert.equal(result.calls, 'health\n', 'no upload or installation when health is unknown');
  });
});

test('deploy command still refuses a valid busy server', async () => {
  const result = await run({ body: '{"ok":true,"busy":2}' });
  assert.notEqual(result.code, 0, result.output);
  assert.equal(result.calls, 'health\n');
});

test('deploy command preserves healthy current and legacy idle behavior', async (t) => {
  for (const body of ['{"ok":true,"busy":0,"humans":5}', '{"ok":true,"humans":0}']) await t.test(body, async () => {
    const result = await run({ body });
    assert.equal(result.code, 0, result.output);
    assert.equal(result.calls, 'health\nconnect\nconnect\n');
  });
});

test('FORCE=1 explicitly bypasses health and keeps the deployment sequence', async () => {
  const result = await run({ unreachable: true }, '1');
  assert.equal(result.code, 0, result.output);
  assert.equal(result.calls, 'connect\nconnect\n');
});
