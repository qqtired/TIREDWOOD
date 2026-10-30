import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { arcDay } from '../../../shared/arcade/rewards.ts';
import { countPack, fileName, PACK_FILE_RE, PACK_ID_RE, PackError, validatePack, type ValidatedPack } from '../../../shared/quiz/pack.ts';
import { QZ_PACK, type QzPack, type QzPackInfo, type QzPackKind, type QzPackOutline, type QzUpFile } from '../../../shared/quiz/types.ts';

type Entry = Omit<QzPackInfo, 'canDel' | 'liked'> & { authorPid: number; likedBy: number[]; deleted?: boolean; pendingDelete?: boolean };
export interface QuizDraft { id: string; authorPid: number; exp: number; pack: QzPack; files: QzUpFile[]; bytes: number }
export interface QuizPacksOptions { dataDir: string; admins?: Iterable<number>; now?: () => number; onError?: (error: unknown) => void }
export function quizAdmins(raw: string | undefined): number[] {
  return [...new Set((raw ?? '').split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s)).map(Number).filter(n => Number.isSafeInteger(n) && n > 0))];
}
export function quizWriteAtomic(file: string, data: string | Uint8Array): void {
  const tmp = `${file}.tmp`, fd = openSync(tmp, 'w', 0o600);
  try { writeFileSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, file);
}

export class QuizPacks {
  readonly dir: string;
  private now: () => number;
  private admins: Set<number>;
  private onError: (error: unknown) => void;
  private entries = new Map<string, Entry>();
  private builtins = new Map<string, QzPack>();
  private drafts = new Map<string, QuizDraft>();
  private playing = new Set<string>();
  private canLike = new Map<string, Set<number>>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private trashBytes = 0;
  constructor(opts: QuizPacksOptions) {
    this.dir = path.join(opts.dataDir, 'quiz'); this.now = opts.now ?? Date.now;
    this.admins = new Set(opts.admins); this.onError = opts.onError ?? (() => console.error('quiz: не удалось сохранить каталог паков'));
    const catalog = path.join(this.dir, 'catalog.json');
    if (existsSync(catalog)) {
      const raw: unknown = JSON.parse(readFileSync(catalog, 'utf8'));
      if (!Array.isArray(raw)) throw new Error('quiz: повреждён каталог паков');
      for (const item of raw) {
        const e = item as Entry;
        if (!e || !PACK_ID_RE.test(e.id) || !Number.isFinite(e.bytes) || e.bytes < 0 || !Array.isArray(e.likedBy)
          || !Number.isSafeInteger(e.authorPid) || !Number.isFinite(e.at)) throw new Error('quiz: повреждена запись каталога');
        this.entries.set(e.id, e);
      }
    }
    // Сначала проверяем весь каталог и записи восстановления. Ошибка чтения не меняет исходные данные.
    const names = (dir: string): string[] => existsSync(path.join(this.dir, dir)) ? readdirSync(path.join(this.dir, dir)) : [];
    const up = names('up'), stored = names('packs'), trashed = names('trash');
    this.trashBytes = existsSync(path.join(this.dir, 'trash')) ? directoryBytes(path.join(this.dir, 'trash')) : 0;
    let recovered = false;
    for (const id of stored) if (/^[a-f0-9]{12}$/.test(id) && !this.entries.has(id)) {
      const meta = JSON.parse(readFileSync(path.join(this.dir, 'packs', id, 'meta.json'), 'utf8')) as { entry: Entry };
      if (meta.entry.id !== id) throw new Error('quiz: повреждена запись пака');
      this.entries.set(id, meta.entry); recovered = true;
    }
    for (const name of ['packs', 'up', 'trash']) mkdirSync(path.join(this.dir, name), { recursive: true });
    // Билеты живут только в памяти. После перезапуска незаконченное сохраняем в корзине.
    for (const id of up) if (/^[a-f0-9]{12}$/.test(id)) this.trash('up', id);
    if (recovered) this.changed();
    for (const e of this.entries.values()) {
      if (e.pendingDelete && !e.builtin) this.remove(e);
      else if (!e.builtin && !e.deleted && !existsSync(path.join(this.dir, 'packs', e.id)) && trashed.some(n => n.startsWith(`${e.id}-`))) {
        // Перезапуск после переноса в корзину, до отложенного flush.
        e.deleted = true; this.changed();
      }
    }
  }
  isAdmin(pid: number): boolean { return this.admins.has(pid); }
  private changed(): void {
    this.dirty = true;
    if (!this.timer) { this.timer = setTimeout(() => { this.timer = null; try { this.flush(); } catch (e) { this.onError(e); } }, 1000); this.timer.unref(); }
  }
  flush(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.dirty) return;
    quizWriteAtomic(path.join(this.dir, 'catalog.json'), JSON.stringify([...this.entries.values()])); this.dirty = false;
  }
  close(): void { this.flush(); }
  /** Удалённые записи сохраняют дневную квоту. Их байты остаются на диске в trash до уборки владельцем. */
  usedBytes(): number {
    return [...this.entries.values()].filter(e => !e.builtin && !e.deleted).reduce((n, e) => n + e.bytes, 0)
      + [...this.drafts.values()].reduce((n, d) => n + d.bytes, 0) + this.trashBytes;
  }
  uploadsToday(pid: number, now = this.now()): number {
    return [...this.entries.values()].filter(e => !e.builtin && e.authorPid === pid && arcDay(e.at) === arcDay(now)).length;
  }
  uploadsLeft(pid: number, now = this.now()): number {
    return Math.max(0, QZ_PACK.DAY_UPLOADS - this.uploadsToday(pid, now) - [...this.drafts.values()].filter(d => d.authorPid === pid).length);
  }
  checkUpload(pid: number, level: number, now = this.now()): void {
    if (!Number.isSafeInteger(pid) || pid <= 0 || !Number.isFinite(level) || level < QZ_PACK.MIN_LEVEL) throw new PackError('Загружать паки можно с 3-го уровня', 403);
    if (this.uploadsLeft(pid, now) <= 0) throw new PackError('Сегодня уже 5 паков — завтра ещё', 429);
    if (this.usedBytes() >= QZ_PACK.TOTAL_BYTES) throw new PackError('Для новых паков пока нет места.', 413);
  }
  registerBuiltin(id: string, raw: QzPack): void {
    if (!/^b-[a-z0-9_-]+$/.test(id)) throw new PackError('Неверное имя встроенного пака.');
    const { pack } = validatePack({ ...raw, author: 'Затейник', source: { format: 'builtin' } }, []);
    const prev = this.entries.get(id);
    this.builtins.set(id, pack);
    this.entries.set(id, { id, title: pack.title, author: 'Затейник', kind: pack.kind, adult: pack.adult, ...countPack(pack),
      bytes: 0, at: 0, plays: prev?.plays ?? 0, likes: prev?.likedBy.length ?? 0, builtin: true, authorPid: 0, likedBy: prev?.likedBy ?? [] });
    this.changed();
  }
  private present(e: Entry): boolean { return !e.deleted && (!e.builtin || this.builtins.has(e.id)); }
  private info(e: Entry, pid: number): QzPackInfo {
    const { authorPid, likedBy, deleted: _deleted, pendingDelete: _pending, ...info } = e;
    return { ...info, likes: likedBy.length, canDel: !e.builtin && (authorPid === pid || this.isAdmin(pid)), liked: likedBy.includes(pid) };
  }
  list(pid: number, q = '', kind?: QzPackKind): { list: QzPackInfo[]; total: number; admin: boolean } {
    const search = q.trim().toLocaleLowerCase('ru');
    const list = [...this.entries.values()].filter(e => this.present(e) && (!kind || e.kind === kind)
      && (!search || `${e.title} ${e.author}`.toLocaleLowerCase('ru').includes(search)))
      .sort((a, b) => Number(b.builtin) - Number(a.builtin) || b.likedBy.length - a.likedBy.length || b.at - a.at || a.id.localeCompare(b.id));
    return { list: list.slice(0, 50).map(e => this.info(e, pid)), total: list.length, admin: this.isAdmin(pid) };
  }
  all(kind?: QzPackKind): Array<{ id: string; pack: QzPack; plays: number }> {
    return [...this.entries.values()].filter(e => this.present(e) && (!kind || kind === e.kind)).map(e => ({ id: e.id, pack: this.get(e.id)!, plays: e.plays }));
  }
  get(id: string): QzPack | null {
    const e = this.entries.get(id); if (!e || !this.present(e)) return null;
    if (e.builtin) return structuredClone(this.builtins.get(id)!);
    return JSON.parse(readFileSync(path.join(this.dir, 'packs', id, 'pack.json'), 'utf8')) as QzPack;
  }
  outline(id: string, pid: number): QzPackOutline | null {
    const pack = this.get(id), e = this.entries.get(id);
    return pack && e ? { info: this.info(e, pid), rounds: pack.rounds.map(r => ({ name: r.name, final: r.final,
      themes: r.themes.map(t => ({ name: t.name, prices: t.questions.map(q => q.price) })) })) } : null;
  }
  begin(pid: number, exp: number, validated: ValidatedPack, now = this.now()): QuizDraft {
    this.expire(now);
    this.checkUpload(pid, QZ_PACK.MIN_LEVEL, now);
    if (exp <= now) throw new PackError('Билет истёк — получи новый.', 401);
    const { pack, files } = validated, json = JSON.stringify(pack), bytes = Buffer.byteLength(json) + files.reduce((n, f) => n + f.size, 0);
    if (this.usedBytes() + bytes > QZ_PACK.TOTAL_BYTES) throw new PackError('Для новых паков пока нет места.', 413);
    let id: string;
    do { id = randomBytes(6).toString('hex'); } while (this.entries.has(id) || this.drafts.has(id) || existsSync(path.join(this.dir, 'up', id)));
    const dir = path.join(this.dir, 'up', id); mkdirSync(dir);
    const draft = { id, authorPid: pid, exp, pack: structuredClone(pack), files: structuredClone(files), bytes };
    quizWriteAtomic(path.join(dir, 'pack.json'), json); this.drafts.set(id, draft);
    return structuredClone(draft);
  }
  draft(id: string): QuizDraft | undefined { const d = this.drafts.get(id); return d ? structuredClone(d) : undefined; }
  need(id: string): string[] {
    const d = this.drafts.get(id); if (!d) throw new PackError('Пак не найден.', 404);
    return d.files.filter(f => !existsSync(path.join(this.dir, 'up', id, fileName(f)))).map(fileName);
  }
  put(id: string, name: string, bytes: Uint8Array): number {
    const d = this.drafts.get(id), f = d?.files.find(f => fileName(f) === name);
    if (!f) throw new PackError('Файл не найден в списке пака.', 404);
    quizWriteAtomic(path.join(this.dir, 'up', id, name), bytes); return this.need(id).length;
  }
  done(id: string, pid: number, now = this.now()): QzPackInfo {
    const d = this.drafts.get(id);
    if (!d || d.authorPid !== pid) throw new PackError('Пак не найден.', 404);
    if (this.need(id).length) throw new PackError('Пришли все файлы пака.');
    if (this.uploadsToday(pid, now) >= QZ_PACK.DAY_UPLOADS) throw new PackError('Сегодня уже 5 паков — завтра ещё', 429);
    const e: Entry = { id, title: d.pack.title, author: d.pack.author, kind: d.pack.kind, adult: d.pack.adult, ...countPack(d.pack),
      bytes: d.bytes, at: now, plays: 0, likes: 0, builtin: false, authorPid: pid, likedBy: [] };
    quizWriteAtomic(path.join(this.dir, 'up', id, 'meta.json'), JSON.stringify({ entry: e, files: d.files }));
    renameSync(path.join(this.dir, 'up', id), path.join(this.dir, 'packs', id));
    this.drafts.delete(id); this.entries.set(id, e); this.changed(); return this.info(e, pid);
  }
  expire(now = this.now()): void { for (const d of this.drafts.values()) if (now >= d.exp) { this.trash('up', d.id); this.drafts.delete(d.id); } }
  private trash(from: 'packs' | 'up', id: string): void {
    const dir = path.join(this.dir, from, id); if (!existsSync(dir)) return;
    let target = path.join(this.dir, 'trash', `${id}-${this.now()}`), i = 0;
    while (existsSync(target)) target = path.join(this.dir, 'trash', `${id}-${this.now()}-${++i}`);
    const bytes = directoryBytes(dir); renameSync(dir, target); this.trashBytes += bytes;
  }
  private remove(e: Entry): void { this.trash('packs', e.id); e.deleted = true; e.pendingDelete = false; this.changed(); }
  delete(id: string, pid: number): 'deleted' | 'pending' {
    const e = this.entries.get(id);
    if (!e || !this.present(e)) throw new PackError('Пак не найден.', 404);
    if (e.builtin || (e.authorPid !== pid && !this.isAdmin(pid))) throw new PackError('Удалить пак может автор или владелец.', 403);
    if (this.playing.has(id)) { e.pendingDelete = true; this.changed(); return 'pending'; }
    this.remove(e); return 'deleted';
  }
  /** Начало/конец использования. played отдельно вызывается ровно при первом вопросе. */
  setPlaying(id: string, on: boolean, participants: readonly number[] = []): void {
    const e = this.entries.get(id); if (!e || !this.present(e)) return;
    if (on) this.playing.add(id);
    else {
      this.playing.delete(id); const likes = this.canLike.get(id) ?? new Set<number>();
      for (const pid of participants) if (pid > 0) likes.add(pid); this.canLike.set(id, likes);
      if (e.pendingDelete) this.remove(e);
    }
  }
  played(id: string): void { const e = this.entries.get(id); if (e && this.present(e)) { e.plays++; this.changed(); } }
  like(id: string, pid: number): boolean {
    const e = this.entries.get(id);
    if (!e || !this.present(e) || !this.canLike.get(id)?.has(pid) || e.likedBy.includes(pid)) return false;
    e.likedBy.push(pid); e.likes = e.likedBy.length; this.changed(); return true;
  }
  media(id: string, name: string): { path: string; size: number } | null {
    if (!PACK_ID_RE.test(id) || !PACK_FILE_RE.test(name)) return null;
    const e = this.entries.get(id); if (!e || e.builtin || !this.present(e)) return null;
    const meta = JSON.parse(readFileSync(path.join(this.dir, 'packs', id, 'meta.json'), 'utf8')) as { files: QzUpFile[] };
    if (!meta.files.some(f => fileName(f) === name)) return null;
    const file = path.join(this.dir, 'packs', id, name);
    try { const st = statSync(file); return st.isFile() ? { path: file, size: st.size } : null; } catch { return null; }
  }
}

function directoryBytes(dir: string): number {
  return readdirSync(dir, { withFileTypes: true }).reduce((n, item) => {
    const file = path.join(dir, item.name);
    return n + (item.isDirectory() ? directoryBytes(file) : item.isFile() ? statSync(file).size : 0);
  }, 0);
}
