import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const fixtureModule = path.join(root, 'test/release-fixture.mjs');

async function run(fixture: Record<string, unknown>, expected: Record<string, string> = { EXPECT_FORTRESS: '1', EXPECT_FIGHT: '1', EXPECT_FISH2: '1' }) {
  const out = await mkdtemp(path.join(tmpdir(), 'opus-release-csp-test-'));
  try {
    let code: number;
    let output: string;
    try {
      const result = await exec(process.execPath, ['--import', fixtureModule, path.join(root, 'tools/release/csp-check.mjs')], {
        cwd: out, timeout: 20_000, maxBuffer: 256 * 1024,
        env: { ...process.env, EXPECT_FORTRESS: '', EXPECT_FIGHT: '', EXPECT_FISH2: '', ...expected, OUT: out, OPUS_RELEASE_FIXTURE: JSON.stringify({ kind: 'csp', ...fixture }) },
      });
      code = 0;
      output = result.stdout + result.stderr;
    } catch (error) {
      const e = error as Error & { code: number; stdout: string; stderr: string; killed?: boolean };
      assert.ok(!e.killed, 'release command must finish, not hang');
      code = e.code;
      output = e.stdout + e.stderr;
    }
    return { code, output, report: await readFile(path.join(out, 'result.json'), 'utf8').catch(() => null) };
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

test('CSP command rejects recorded failures instead of returning successful diagnostics', { concurrency: 4 }, async (t) => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['CSP violation', { csp: ['img-src'] }],
    ['browser resource error', { logs: [{ level: 'error', text: 'Failed to load resource: 404' }] }],
    ['runtime exception', { exception: 'TypeError: fixture failure' }],
    ['console error mentioning AudioContext', { console: [{ type: 'error', text: 'AudioContext fixture failure' }] }],
    ['wrong fortress flag', { flags: { fortress: false, fight: true, fish2: true } }],
    ['wrong fight flag', { flags: { fortress: true, fight: false, fish2: true } }],
    ['wrong fishing flag', { flags: { fortress: true, fight: true, fish2: false } }],
    ['missing canvas', { missingCanvas: true }],
    ['missing built script', { missingBuild: true }],
    ['missing app', { missingApp: true }],
    ['failed desktop join', { state: { screen: 'join', scene: null } }],
    ['broken primary image', { brokenImage: true }],
    ['navigation error', { navigationError: true }],
    ['late recorded browser error', { lateError: true }],
  ];
  await Promise.all(cases.map(([name, fixture]) => t.test(name, async () => {
    const result = await run(fixture);
    assert.notEqual(result.code, 0, `${name} must reject acceptance\n${result.output}`);
  })));
});

test('CSP command requires explicit valid expected service flags', { concurrency: 2 }, async (t) => {
  await Promise.all([
    t.test('missing flags', async () => assert.notEqual((await run({}, {})).code, 0)),
    t.test('malformed flag', async () => assert.notEqual((await run({}, { EXPECT_FORTRESS: 'yes', EXPECT_FIGHT: '1', EXPECT_FISH2: '1' })).code, 0)),
  ]);
});

test('CSP command accepts healthy desktop content and writes configured evidence', async () => {
  const result = await run({ logs: [{ level: 'info', text: 'fixture informational entry' }] });
  assert.equal(result.code, 0, result.output);
  assert.ok(result.report, 'machine-readable evidence must be written to OUT');
  assert.equal(JSON.parse(result.report).ok, true);
});

test('CSP command accepts explicit disabled modes', async () => {
  const result = await run({ flags: { fortress: false, fight: false, fish2: false } }, { EXPECT_FORTRESS: '0', EXPECT_FIGHT: '0', EXPECT_FISH2: '0' });
  assert.equal(result.code, 0, result.output);
});
