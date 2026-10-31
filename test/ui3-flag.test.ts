// Интерфейс 3.0 «Веранда v3» за флагом сервера UI3 (shared/ui3.ts, docs/ui3/brief.md): только явная 1; сервер отдаёт его в /health,
// браузер узнаёт до загрузки игры (client/layout-boot.ts), вывески v3 — вместе с HUD (client/ui/signs3.ts). Плюс разбор текста
// для перестроек HUD v3 (client/ui/hud3-text.ts). Главное и главный сценарий, крайних случаев нет.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { UI_KEY, bootLayout, type BootEnv } from '../client/layout-boot.ts';
import { emojiRuns, leadAmount, leadEmoji, newsNick } from '../client/ui/hud3-text.ts';
import { SIGNS3 } from '../client/ui/signs3.ts';
import { UI3 } from '../shared/ui3.ts';
import { setupHub } from './kit.ts';

/** UI3 в отдельном процессе с этим значением переменной (модуль читает её один раз, при импорте) */
function ui3With(value: string | undefined): string {
  const env = { ...process.env };
  delete env.UI3;
  if (value !== undefined) env.UI3 = value;
  const code = "import { UI3 } from './shared/ui3.ts'; console.log(String(UI3));";
  return execFileSync(process.execPath, ['--input-type=module', '-e', code], { env, encoding: 'utf8' }).trim();
}

test('флаг UI3: только явная 1; без него — HUD и вывески как раньше, /health отдаёт ui: 2', () => {
  assert.equal(ui3With('1'), 'true');
  assert.equal(ui3With(undefined), 'false');
  assert.equal(ui3With('true'), 'false');
  assert.equal(UI3, false, 'тесты идут без флага');
  assert.equal(SIGNS3, UI3, 'вывески v3 — вместе с HUD v3');
  assert.equal(setupHub().hub.health().ui, 2);
});

const answer = (body: unknown): BootEnv['fetch'] => async () => ({ json: async () => body });

test('браузер узнаёт интерфейс до загрузки игры: /health решает, сервер молчит — последний известный', async () => {
  const g = globalThis as { __opusUi?: unknown; __opusPlaza?: unknown };
  const m = new Map<string, string>();
  const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  try {
    await bootLayout({ fetch: answer({ ok: true, plaza: 3, ui: 3 }), storage: st, timeoutMs: 1000 });
    assert.equal(g.__opusUi, 3);
    assert.equal(st.getItem(UI_KEY), '3', 'запомнили');
    await bootLayout({ fetch: answer({ ok: true, plaza: 3 }), storage: st, timeoutMs: 1000 });
    assert.equal(g.__opusUi, 2, 'сервер без поля ui — прежний интерфейс');
    st.setItem(UI_KEY, '3');
    const down: BootEnv['fetch'] = async () => {
      throw new Error('нет связи');
    };
    await bootLayout({ fetch: down, storage: st, timeoutMs: 1000 });
    assert.equal(g.__opusUi, 3);
  } finally {
    delete g.__opusUi;
    delete g.__opusPlaza;
  }
});

test('HUD v3: сумма награды, ник в новости, значок системной строки, эмодзи подряд — одним блоком', () => {
  assert.deepEqual(leadAmount('+20 🪙 за улов'), { num: '+20', len: 4 });
  assert.equal(leadAmount('+1 200 ')?.num, '+1 200');
  assert.equal(leadAmount('Уровень 5!'), null);
  assert.equal(newsNick('Tester7 вытащил Рыбу-молот'), 'Tester7');
  assert.equal(newsNick('Сезон рыбалки закончился'), null);
  assert.deepEqual(leadEmoji('🎣 Сезон рыбалки закончился.'), { icon: '🎣', len: 3 });
  assert.equal(leadEmoji('Бой! Первые до 50 побеждают'), null);
  assert.deepEqual(emojiRuns('Пастила: ❤️ ❤️ 🛡️ — +30 HP'), [
    { text: 'Пастила: ', run: false },
    { text: '❤️❤️🛡️', run: true },
    { text: ' — +30 HP', run: false },
  ]);
  assert.ok(!emojiRuns('🏆 Tester538 выиграл').some((p) => p.run), 'один эмодзи — не блок');
});
