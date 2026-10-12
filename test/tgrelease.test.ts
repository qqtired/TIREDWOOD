import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { announceRelease, prepareReleaseNotes, RELEASE_STATE_DIR } from '../server/tgrelease.ts';
import type { TgFetch } from '../server/tgfeed.ts';

const dirs: string[] = [];
after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const release = { releaseId: '20261012-123456', notes: '• На острове появился новый маршрут.\n• Исправлена посадка в лодку.' };
// Только выдуманные тестовые настройки, рабочие данные не читаются.
const token = '123456:FAKE-release-test-token';
function fixture(config = true): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-tgrelease-'));
  dirs.push(dir);
  if (config) {
    writeFileSync(path.join(dir, 'tg-token'), token);
    writeFileSync(path.join(dir, 'tg-chat.json'), JSON.stringify({ id: -1001 }));
  }
  return dir;
}
const success = (): Response => new Response(JSON.stringify({ ok: true, result: { message_id: 123 } }), { status: 200 });

test('release notes: пустой или слишком длинный текст блокирует подготовку; текст остаётся явно заданным', () => {
  assert.throws(() => prepareReleaseNotes(release.releaseId, ' \n '), /текст/);
  assert.throws(() => prepareReleaseNotes(release.releaseId, 'а'.repeat(3001)), /3000/);
  assert.throws(() => prepareReleaseNotes('../bad', release.notes), /релиза/);
  assert.deepEqual(prepareReleaseNotes(release.releaseId, `\ufeff${release.notes}\r\n`), release);
});

test('telegram release: успешный активный релиз отправляет подготовленные notes; повтор после перезапуска не дублирует', async () => {
  const dir = fixture();
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: TgFetch = async (url, init) => { calls.push({ url, init }); return success(); };
  const logs: string[] = [];
  const options = { dir, release, smokePassed: true, activeReleaseId: release.releaseId, fetch, log: (s: string) => logs.push(s) };
  assert.equal(await announceRelease(options), 'sent');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://api.telegram.org/bot${token}/sendMessage`);
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.chat_id, -1001);
  assert.match(body.text, /TIREDWOOD/);
  assert.ok(body.text.includes(release.notes));
  assert.ok(body.text.includes('https://game.tired.solutions'));
  assert.equal(body.parse_mode, undefined, 'notes передаются обычным текстом');
  const saved = JSON.parse(readFileSync(path.join(dir, RELEASE_STATE_DIR, `${release.releaseId}.json`), 'utf8'));
  assert.equal(saved.releaseId, release.releaseId);
  assert.equal(saved.status, 'sent');
  assert.equal(await announceRelease({ ...options }), 'already-sent');
  assert.equal(calls.length, 1);
  assert.ok(!logs.join('\n').includes(token));
  assert.ok(!logs.join('\n').includes('-1001'));
});

test('telegram release: failed smoke или другой активный релиз не отправляет и не создаёт отметку', async () => {
  const dir = fixture();
  let calls = 0;
  const fetch: TgFetch = async () => { calls++; return success(); };
  const options = { dir, release, fetch, log: () => {} };
  assert.equal(await announceRelease({ ...options, smokePassed: false, activeReleaseId: release.releaseId }), 'not-verified');
  assert.equal(await announceRelease({ ...options, smokePassed: true, activeReleaseId: '20261012-111111' }), 'not-verified');
  assert.equal(calls, 0);
  assert.equal(existsSync(path.join(dir, RELEASE_STATE_DIR)), false);
});

test('telegram release: нет токена, связанного чата или настройка повреждена — понятный пропуск без отправки', async () => {
  for (const setup of ['none', 'token-only', 'bad-chat', 'bad-token']) {
    const dir = fixture(false);
    if (setup !== 'none') writeFileSync(path.join(dir, 'tg-token'), setup === 'bad-token' ? 'invalid' : token);
    if (setup === 'bad-chat' || setup === 'bad-token') writeFileSync(path.join(dir, 'tg-chat.json'), setup === 'bad-chat' ? '{bad' : '{"id":-1001}');
    let calls = 0;
    const logs: string[] = [];
    const result = await announceRelease({ dir, release, smokePassed: true, activeReleaseId: release.releaseId,
      fetch: async () => { calls++; return success(); }, log: (s) => logs.push(s) });
    assert.equal(result, 'unconfigured');
    assert.equal(calls, 0);
    assert.equal(logs.length, 1);
    assert.equal(existsSync(path.join(dir, RELEASE_STATE_DIR)), false);
  }
});

test('telegram release: двусмысленный обрыв не считается доставкой и повтор не отправляет второй запрос', async () => {
  const dir = fixture();
  let calls = 0;
  const logs: string[] = [];
  const options = { dir, release, smokePassed: true, activeReleaseId: release.releaseId,
    fetch: async () => { calls++; throw new Error(`timeout https://api.telegram.org/bot${token}/sendMessage`); },
    log: (s: string) => logs.push(s) };
  assert.equal(await announceRelease(options), 'uncertain');
  assert.equal(await announceRelease(options), 'already-attempted');
  assert.equal(calls, 1);
  const state = readFileSync(path.join(dir, RELEASE_STATE_DIR, `${release.releaseId}.json`), 'utf8');
  assert.equal(JSON.parse(state).status, 'uncertain');
  assert.ok(!state.includes(token));
  assert.ok(!logs.join('\n').includes(token));
});

test('telegram release: одновременные вызовы используют одну попытку, явный отказ Telegram не считается доставкой', async () => {
  const dir = fixture();
  let calls = 0;
  const options = { dir, release, smokePassed: true, activeReleaseId: release.releaseId, log: () => {},
    fetch: async () => { calls++; return new Response('{"ok":false,"description":"forbidden"}', { status: 403 }); } };
  const results = await Promise.all([announceRelease(options), announceRelease(options)]);
  assert.deepEqual(results.sort(), ['already-attempted', 'failed']);
  assert.equal(calls, 1);
});

test('telegram release: Telegram offline — отдельный отказ; следующий релиз всё ещё может быть отправлен', async () => {
  const dir = fixture();
  const options = { dir, release, smokePassed: true, activeReleaseId: release.releaseId, log: () => {} };
  assert.equal(await announceRelease({ ...options,
    fetch: async () => { throw Object.assign(new Error('offline'), { connect: true }); } }), 'failed');
  const next = { releaseId: '20261012-234567', notes: '• Новая рыба у причала.' };
  let calls = 0;
  assert.equal(await announceRelease({ ...options, release: next, activeReleaseId: next.releaseId,
    fetch: async () => { calls++; return success(); } }), 'sent');
  assert.equal(calls, 1);
});

test('telegram release: зависший транспорт ограничен таймером, автоматического повтора нет', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dir = fixture();
  let calls = 0;
  const options = { dir, release, smokePassed: true, activeReleaseId: release.releaseId, log: () => {},
    fetch: async () => { calls++; return new Promise<Response>(() => {}); } };
  const pending = announceRelease(options);
  t.mock.timers.tick(20_000);
  assert.equal(await pending, 'uncertain');
  assert.equal(await announceRelease(options), 'already-attempted');
  assert.equal(calls, 1);
});

test('telegram release: отказ записи результата сохраняет отметку попытки и не допускает дубль', async () => {
  const dir = fixture();
  let calls = 0;
  const options = { dir, release, smokePassed: true, activeReleaseId: release.releaseId, log: () => {},
    fetch: async () => {
      calls++;
      mkdirSync(path.join(dir, RELEASE_STATE_DIR, `${release.releaseId}.json.tmp`));
      return success();
    } };
  assert.equal(await announceRelease(options), 'state-error');
  assert.equal(await announceRelease(options), 'already-attempted');
  assert.equal(calls, 1);
});

test('release notes CLI: сохраняет проверенный текст с id, пустой файл не порождает manifest', () => {
  const dir = fixture(false);
  const notesFile = path.join(dir, 'notes.txt');
  const manifest = path.join(dir, 'release-notes.json');
  const cli = new URL('../deploy/announce-release.ts', import.meta.url);
  const missing = spawnSync(process.execPath, [cli.pathname, 'prepare', release.releaseId, notesFile, manifest], { encoding: 'utf8' });
  assert.equal(missing.status, 1, 'отсутствующий файл не считается подготовленным текстом');
  assert.equal(existsSync(manifest), false);
  writeFileSync(notesFile, '   \n');
  let result = spawnSync(process.execPath, [cli.pathname, 'prepare', release.releaseId, notesFile, manifest], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(existsSync(manifest), false);
  writeFileSync(notesFile, release.notes);
  result = spawnSync(process.execPath, [cli.pathname, 'prepare', release.releaseId, notesFile, manifest], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(manifest, 'utf8')), release);
});

test('release CLI: prepare → архив deploy → распаковка → send читает manifest активного релиза без настроек бота', () => {
  const dir = fixture(false);
  const source = path.join(dir, 'source');
  const notesDir = path.join(dir, 'notes');
  const active = path.join(dir, release.releaseId);
  const data = path.join(dir, 'data');
  for (const folder of [source, notesDir, active, data]) mkdirSync(folder);
  for (const folder of ['server', 'shared', 'dist', 'deploy']) mkdirSync(path.join(source, folder));
  // Настоящие runtime-файлы и их транзитивные импорты; ни сервера, ни рабочих данных здесь нет.
  for (const file of ['deploy/announce-release.ts', 'server/tgrelease.ts', 'server/tgfeed.ts', 'server/tgnet.ts', 'shared/messages.ts']) {
    copyFileSync(new URL(`../${file}`, import.meta.url), path.join(source, file));
  }
  writeFileSync(path.join(source, 'package.json'), '{"type":"module"}');
  writeFileSync(path.join(source, 'package-lock.json'), '{}');
  writeFileSync(path.join(source, 'dist', 'index.html'), '<html>release fixture</html>');
  const notesFile = path.join(notesDir, 'notes.txt');
  writeFileSync(notesFile, release.notes);
  const prepared = spawnSync(process.execPath, [path.join(source, 'deploy/announce-release.ts'), 'prepare',
    release.releaseId, notesFile, path.join(notesDir, 'release-notes.json')], { encoding: 'utf8', timeout: 5000 });
  assert.equal(prepared.status, 0, prepared.stderr);
  const archive = path.join(dir, 'release.tar.gz');
  // Та же раскладка аргументов tar, что в deploy.sh: код из cwd, manifest из отдельной временной папки.
  const packed = spawnSync('tar', ['--no-xattrs', '-czf', archive, 'package.json', 'package-lock.json',
    'server', 'shared', 'dist', 'deploy', '-C', notesDir, 'release-notes.json'], {
    cwd: source, encoding: 'utf8', env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  assert.equal(packed.status, 0, packed.stderr);
  const unpacked = spawnSync('tar', ['-xzf', archive, '-C', active], { encoding: 'utf8' });
  assert.equal(unpacked.status, 0, unpacked.stderr);
  assert.deepEqual(JSON.parse(readFileSync(path.join(active, 'release-notes.json'), 'utf8')), release);
  const current = path.join(dir, 'current');
  symlinkSync(active, current);
  const args = [path.join(active, 'deploy/announce-release.ts'), 'send', active, current, data];
  const unverified = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 5000 });
  assert.equal(unverified.status, 1);
  assert.match(unverified.stdout, /not-verified/);
  // Пустой DATA_DIR: CLI проходит manifest/current/smoke guard и заканчивает без сетевой отправки.
  const sent = spawnSync(process.execPath, [...args, '--smoke-passed'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(sent.status, 1, sent.stderr);
  assert.match(sent.stdout, /unconfigured/);
  assert.equal(existsSync(path.join(data, RELEASE_STATE_DIR)), false);
});

test('deploy: без явных notes останавливается до проверок, сборки и загрузки', () => {
  const dir = fixture(false);
  const root = path.join(dir, 'project');
  const bin = path.join(dir, 'bin');
  mkdirSync(root); mkdirSync(bin); mkdirSync(path.join(dir, 'ssh'));
  copyFileSync(new URL('../deploy.sh', import.meta.url), path.join(root, 'deploy.sh'));
  // Даже при ошибке защиты этот тест может вызвать только локальные заглушки, не настоящий SSH.
  const touched = path.join(dir, 'external-command');
  const stub = '#!/bin/sh\nprintf called > "$TEST_TOUCHED"\nexit 99\n';
  for (const name of ['npm', 'node']) writeFileSync(path.join(bin, name), stub, { mode: 0o700 });
  writeFileSync(path.join(dir, 'ssh', 'connect.sh'), stub, { mode: 0o700 });
  const result = spawnSync('sh', [path.join(root, 'deploy.sh')], {
    encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RELEASE_NOTES_FILE: '', TEST_TOUCHED: touched },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /RELEASE_NOTES_FILE/);
  assert.equal(existsSync(touched), false);
});
