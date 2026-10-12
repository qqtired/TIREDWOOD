// Только чтение после штатной остановки нового сервера.
// node deploy/check-record-rollback.ts <предыдущий-релиз> <DATA_DIR>
// Store до course-record-archives-v1 отбрасывает эти поля при следующем сохранении.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const [previous, dataDir] = process.argv.slice(2);
let allowed = false;
try {
  if (!previous || !dataDir || process.argv.length !== 4) throw new Error('arguments');
  const state = JSON.parse(readFileSync(path.join(dataDir, 'state.json'), 'utf8')) as Record<string, unknown>;
  if (!state || Array.isArray(state) || state.v !== 1 || !Array.isArray(state.profiles)) throw new Error('state');
  const archives = ['aquaArchive', 'regattaArchive', 'skillCourse'].some((key) => Object.hasOwn(state, key))
    || state.profiles.some((profile: unknown) => profile && typeof profile === 'object'
      && ['aquaBests', 'skillRecords'].some((key) => Object.hasOwn(profile, key)));
  allowed = !archives || readFileSync(path.join(previous, 'deploy/course-records.compat'), 'utf8').trim() === 'course-record-archives-v1';
} catch {
  // Нет читаемого основного файла — нельзя предполагать формат возможной recovery-копии.
  // Не печатаем JSON, путь или текст исключения: в них может быть прогресс игрока.
}

if (allowed) console.log('Откат разрешён: формат архивов совместим.');
else {
  console.error('Откат остановлен: нужен совместимый код/данные. Сохранение не изменено; службу не запускать.');
  process.exitCode = 1;
}
