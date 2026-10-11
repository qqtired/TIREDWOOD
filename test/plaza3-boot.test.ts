// Браузер узнаёт раскладку набережной (флаг PLAZA3) до сборки площади (docs/plaza3/tech-foundation.md §1.2, риск 1):
// входной client/main.ts статически не тянет shared/layout.ts (иначе площадь соберётся раньше ответа /health);
// client/layout-boot.ts берёт раскладку из /health, при молчании сервера — последнюю известную; сверка me.lay
// перезагружает вкладку один раз, без петли.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PLAZA_KEY, bootLayout, layoutReload, type BootEnv } from '../client/layout-boot.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Статические импорты файла (без import type, без динамических import() и без CSS) — пути от корня */
function staticImports(file: string): string[] {
  const src = readFileSync(path.join(root, file), 'utf8');
  const out: string[] = [];
  const re = /^\s*(?:import|export)\s+(?!type\b)(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"]/gm;
  for (const m of src.matchAll(re)) {
    const spec = m[1];
    if (!spec.startsWith('.') || spec.endsWith('.css')) continue;
    const to = path.relative(root, path.resolve(path.dirname(path.join(root, file)), spec));
    if (existsSync(path.join(root, to))) out.push(to);
  }
  return out;
}

test('входной client/main.ts статически не доходит до shared/layout.ts (игра — только через import())', () => {
  const seen = new Set<string>();
  const queue = ['client/main.ts'];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    queue.push(...staticImports(f));
  }
  assert.ok(seen.has('client/layout-boot.ts'), 'загрузчик раскладки — во входе');
  assert.ok(!seen.has('client/app.ts'), 'игра — за динамическим import()');
  const shared = [...seen].filter((f) => f.startsWith('shared/'));
  assert.deepEqual(shared, [], `вход тянет модули shared/ (раскладка выберется раньше /health): ${shared.join(', ')}`);
});

function memStore(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}

const answer = (body: unknown): BootEnv['fetch'] => async () => ({ json: async () => body });

test('раскладка до загрузки игры: /health решает, молчит — последняя известная, иначе 2', async () => {
  const g = globalThis as { __opusPlaza?: unknown };
  try {
    const st = memStore();
    assert.equal(await bootLayout({ fetch: answer({ ok: true, plaza: 3 }), storage: st, timeoutMs: 1000 }), 3);
    assert.equal(g.__opusPlaza, 3);
    assert.equal(st.getItem(PLAZA_KEY), '3', 'запомнили');
    // старый сервер без поля plaza — старая площадь
    assert.equal(await bootLayout({ fetch: answer({ ok: true }), storage: st, timeoutMs: 1000 }), 2);
    assert.equal(g.__opusPlaza, 2);
    // сервер не ответил: последняя известная из хранилища
    const down: BootEnv['fetch'] = async () => {
      throw new Error('нет связи');
    };
    assert.equal(await bootLayout({ fetch: down, storage: memStore({ [PLAZA_KEY]: '3' }), timeoutMs: 1000 }), 3);
    assert.equal(await bootLayout({ fetch: down, storage: null, timeoutMs: 1000 }), 2);
    // завис: ждём не дольше timeoutMs
    const hang: BootEnv['fetch'] = (_u, init) => new Promise((_ok, fail) => init.signal?.addEventListener('abort', () => fail(new Error('abort'))));
    const t0 = Date.now();
    assert.equal(await bootLayout({ fetch: hang, storage: memStore({ [PLAZA_KEY]: '3' }), timeoutMs: 30 }), 3);
    assert.ok(Date.now() - t0 < 1000, 'не ждём сервер дольше тайм-аута');
  } finally {
    delete g.__opusPlaza;
  }
});

test('сверка me.lay: другая раскладка — запомнить и перезагрузиться один раз, совпала — сбросить флаг', () => {
  const local = memStore({ [PLAZA_KEY]: '2' });
  const session = memStore();
  assert.equal(layoutReload(2, 2, local, session), false, 'совпало — ничего');
  assert.equal(layoutReload(3, 2, local, session), true, 'сервер перезапущен с PLAZA3 — перезагрузка');
  assert.equal(local.getItem(PLAZA_KEY), '3', 'после перезагрузки /health может молчать — раскладка уже запомнена');
  assert.equal(layoutReload(3, 2, local, session), false, 'второй раз подряд не перезагружаемся (нет петли)');
  assert.equal(layoutReload(3, 3, local, session), false);
  assert.equal(layoutReload(2, 3, local, session), true, 'следующая смена флага — снова одна перезагрузка');
  assert.equal(layoutReload(3, 2, local, null), false, 'без sessionStorage не рискуем зациклиться');
});
