// Решения владельца по идеям лаборатории: DATA_DIR/lab.json. Отдельный файл: профили, их миграции и копии Store
// не затрагиваются, откат кода решения не теряет. Запись атомарная (временный файл → fsync → переименование),
// перед заменой прежний файл остаётся рядом как lab.prev.json.
import { closeSync, copyFileSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import path from 'node:path';
import {
  LAB_LOG_MAX, LAB_MAX_DECISIONS, emptyLabFile, normalizeLabFile,
  type LabDecision, type LabFile, type LabLogEntry, type LabStatus,
} from '../../shared/lab.ts';

/** Ошибка с кодом ответа: маршруты превращают её в JSON {ok:false, error}. */
export class LabError extends Error {
  readonly status: number;
  /** Через сколько секунд повторить (для 429) */
  retryAfter = 0;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface LabInput {
  status: LabStatus;
  note: string;
  title: string;
}

export class LabStore {
  readonly file: string;
  readonly prevFile: string;
  private readonly now: () => Date;
  private data: LabFile;

  constructor(dir: string, now: () => Date = () => new Date()) {
    this.file = path.join(dir, 'lab.json');
    this.prevFile = path.join(dir, 'lab.prev.json');
    this.now = now;
    this.data = emptyLabFile(now().toISOString());
  }

  /** Читает lab.json; нет файла — пусто, битый — откладывается в сторону и берётся lab.prev.json. */
  load(): void {
    const at = this.now().toISOString();
    for (const file of [this.file, this.prevFile]) {
      if (!existsSync(file)) continue;
      try {
        this.data = normalizeLabFile(JSON.parse(readFileSync(file, 'utf8')), at);
        if (file === this.prevFile) console.warn('lab: lab.json не прочитался, взят lab.prev.json');
        return;
      } catch {
        if (file === this.file) {
          // испорченное не затираем: кладём рядом, чтобы можно было разобрать руками
          try {
            renameSync(this.file, `${this.file}.corrupt-${at.replace(/[:.]/g, '-')}`);
          } catch {
            // не вышло — не страшно, следующая запись всё равно заменит файл
          }
        }
      }
    }
    this.data = emptyLabFile(at);
  }

  /** Всё, что видят посетители страницы (журнал — только в файле). */
  snapshot(): { updatedAt: string; decisions: Record<string, LabDecision> } {
    return { updatedAt: this.data.updatedAt, decisions: this.data.decisions };
  }

  get(id: string): LabDecision | undefined {
    return this.data.decisions[id];
  }

  get size(): number {
    return Object.keys(this.data.decisions).length;
  }

  /** Записывает решение. В память оно попадает, только если запись на диск удалась. */
  set(id: string, input: LabInput): LabDecision {
    const prev = this.data.decisions[id];
    if (!prev && this.size >= LAB_MAX_DECISIONS) throw new LabError(409, `Решений уже ${LAB_MAX_DECISIONS}: больше не помещается`);
    const title = input.title || prev?.title || id;
    // то же самое ещё раз (двойной тап) — файл не трогаем
    if (prev && prev.status === input.status && prev.note === input.note && prev.title === title) return prev;
    const at = this.now().toISOString();
    const decision: LabDecision = { title, status: input.status, note: input.note, at };
    const log: LabLogEntry[] = prev?.status === input.status ? this.data.log : [...this.data.log, { id, from: prev?.status ?? null, to: input.status, at }];
    this.commit({ version: 1, updatedAt: at, decisions: { ...this.data.decisions, [id]: decision }, log: log.slice(-LAB_LOG_MAX) });
    return decision;
  }

  /** Убирает решение (карточка вернётся к статусу по умолчанию). Нет такого — ничего не делает. */
  clear(id: string): boolean {
    const prev = this.data.decisions[id];
    if (!prev) return false;
    const at = this.now().toISOString();
    const decisions = { ...this.data.decisions };
    delete decisions[id];
    this.commit({ version: 1, updatedAt: at, decisions, log: [...this.data.log, { id, from: prev.status, to: 'reset' as const, at }].slice(-LAB_LOG_MAX) });
    return true;
  }

  private commit(next: LabFile): void {
    try {
      if (existsSync(this.file)) copyFileSync(this.file, this.prevFile);
      writeAtomic(this.file, `${JSON.stringify(next, null, 2)}\n`);
    } catch {
      throw new LabError(500, 'Не удалось сохранить, попробуй ещё раз');
    }
    this.data = next;
  }
}

function writeAtomic(file: string, text: string): void {
  const tmp = `${file}.tmp-${process.pid}`;
  const fd = openSync(tmp, 'w', 0o600);
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
}
