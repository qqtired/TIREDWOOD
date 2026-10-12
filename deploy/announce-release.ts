// prepare <release-id> <notes.txt> <manifest.json> — до заливки, без чтения настроек Telegram.
// send <release-dir> <current-symlink> <data-dir> --smoke-passed — только после успешного smoke.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { announceRelease, prepareReleaseNotes, type ReleaseNotes } from '../server/tgrelease.ts';

const [mode, first, second, third, proof] = process.argv.slice(2);
try {
  if (mode === 'prepare' && first && second && third && !proof) {
    const release = prepareReleaseNotes(first, readFileSync(second, 'utf8'));
    writeFileSync(third, JSON.stringify(release) + '\n', { flag: 'wx', mode: 0o600 });
    console.log('Текст обновления подготовлен');
  } else if (mode === 'send' && first && second && third) {
    const releaseDir = realpathSync(first);
    const currentDir = realpathSync(second);
    const manifest = JSON.parse(readFileSync(path.join(releaseDir, 'release-notes.json'), 'utf8')) as ReleaseNotes;
    const status = await announceRelease({
      dir: third, release: manifest,
      smokePassed: proof === '--smoke-passed' && path.basename(releaseDir) === manifest.releaseId,
      activeReleaseId: currentDir === releaseDir ? path.basename(currentDir) : '',
    });
    process.exitCode = status === 'sent' || status === 'already-sent' ? 0 : 1;
  } else {
    console.error('Нужны prepare <номер релиза> <файл текста> <файл результата> или send <релиз> <current> <данные> --smoke-passed');
    process.exitCode = 1;
  }
} catch {
  // Не печатаем исключения: путь или ответ внешнего сервиса может содержать закрытые данные.
  console.error(mode === 'prepare'
    ? 'Не удалось подготовить notes: нужен читаемый непустой текст до 3000 знаков и корректный номер релиза'
    : 'tg-release: отправки нет: файлы активного релиза или статус уведомления недоступны');
  process.exitCode = 1;
}
