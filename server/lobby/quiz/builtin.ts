import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseText } from '../../../shared/quiz/text.ts';
import { validatePack } from '../../../shared/quiz/pack.ts';
import type { QzPack } from '../../../shared/quiz/types.ts';
import type { QuizPacks } from './packs.ts';

/** Ошибка одного текста не мешает старту и остальным пакам. Файлы пишет ведущий. */
export function loadBuiltinPacks(dir: string | URL = new URL('./builtin/', import.meta.url), log: (message: string) => void = console.error): Array<{ id: string; pack: QzPack }> {
  const root = typeof dir === 'string' ? dir : fileURLToPath(dir);
  const result: Array<{ id: string; pack: QzPack }> = [];
  let names: string[];
  try { names = readdirSync(root); } catch { log('quiz: папка встроенных паков не найдена'); return result; }
  for (const name of names.sort()) {
    if (!/^[a-z0-9_-]+\.txt$/.test(name)) continue;
    try {
      const parsed = parseText(readFileSync(path.join(root, name), 'utf8'));
      if (parsed.errors) throw new Error('text');
      const { pack } = validatePack({ ...parsed.pack, author: 'Затейник', source: { format: 'builtin' } }, []);
      result.push({ id: `b-${name.slice(0, -4)}`, pack });
    } catch { log(`quiz: не удалось прочитать встроенный пак ${name}`); }
  }
  return result;
}
export function registerBuiltinPacks(store: QuizPacks, dir?: string | URL, log?: (message: string) => void): void {
  for (const { id, pack } of loadBuiltinPacks(dir, log)) store.registerBuiltin(id, pack);
}
