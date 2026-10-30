import { QZ_JP, QZ_PACK, QZ_WHO, type QzContent, type QzPack, type QzQuestion, type QzUpFile } from './types.ts';

export class PackError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.name = 'PackError'; this.status = status; }
}
export interface ValidatedPack { pack: QzPack; files: QzUpFile[]; warnings: string[] }

/** Та же очистка, что у чата, но предел задаёт поле пака (вопрос может быть длиннее чата). */
export function cleanPackText(raw: unknown): string {
  return typeof raw === 'string' ? raw.normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim() : '';
}
export function blankPack(format: QzPack['source']['format'] = 'text'): QzPack {
  return { v: 1, title: '', author: '', kind: 'jeopardy', adult: false, tags: [], source: { format }, rounds: [] };
}
export function countPack(pack: QzPack): { rounds: number; themes: number; questions: number } {
  const themes = pack.rounds.reduce((n, r) => n + r.themes.length, 0);
  const questions = pack.kind === 'words' ? Object.values(pack.words ?? {}).reduce((n, a) => n + a.length, 0)
    : pack.kind === 'whoofus' ? pack.who?.length ?? 0 : pack.kind === 'riddles' ? pack.riddles?.length ?? 0
    : pack.rounds.reduce((n, r) => n + r.themes.reduce((m, t) => m + t.questions.length, 0), 0);
  return { rounds: pack.rounds.length, themes, questions };
}
export const fileName = (f: QzUpFile): string => `${f.sha256}.${f.ext}`;
export const PACK_FILE_RE = /^[a-f0-9]{64}\.(?:webp|png|jpg|gif|mp3|ogg|m4a)$/;
export const PACK_ID_RE = /^(?:[a-f0-9]{12}|b-[a-z0-9_-]+)$/;

function record(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PackError('Не получилось прочитать пак.');
  return raw as Record<string, unknown>;
}
function list(raw: unknown, max: number): unknown[] {
  if (!Array.isArray(raw) || raw.length > max) throw new PackError('В паке слишком много строк или неверный формат.');
  return raw;
}
function str(raw: unknown, max: number, required = false): string {
  if (typeof raw !== 'string') throw new PackError('Не получилось прочитать текст пака.');
  const s = cleanPackText(raw);
  if (s.length > max || (required && !s)) throw new PackError(`Текст должен быть ${required ? 'непустым и ' : ''}не длиннее ${max} знаков.`);
  return s;
}
function number(raw: unknown, min: number, max: number, integer = false): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < min || raw > max || (integer && !Number.isSafeInteger(raw))) {
    throw new PackError('Неверное число в паке.');
  }
  return raw;
}

/** Проверка недоверенного JSON. Возвращает новую копию только разрешённых полей; ошибка — PackError. */
export function validatePack(raw: unknown, rawFiles: unknown = []): ValidatedPack {
  const source = record(raw);
  if (source.v !== 1 || !['jeopardy', 'words', 'whoofus', 'riddles'].includes(String(source.kind))) throw new PackError('Неизвестный формат пака.');
  const warnings: string[] = [];
  const files: QzUpFile[] = [];
  const byName = new Map<string, QzUpFile>();
  let bytes = 0;
  for (const value of list(rawFiles, QZ_PACK.JSON_BYTES)) {
    const f = record(value);
    if (typeof f.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(f.sha256) || typeof f.ext !== 'string'
      || (f.kind !== 'image' && f.kind !== 'audio')) throw new PackError('Неверное имя файла пака.');
    const allowed: readonly string[] = f.kind === 'image' ? QZ_PACK.IMAGE_EXT : QZ_PACK.AUDIO_EXT;
    if (!allowed.includes(f.ext)) throw new PackError('Этот вид файла не поддерживается.');
    const max = f.kind === 'image' ? QZ_PACK.IMAGE_BYTES : QZ_PACK.AUDIO_BYTES;
    if (typeof f.size === 'number' && f.size > max) throw new PackError('Файл слишком большой.', 413);
    const file: QzUpFile = { sha256: f.sha256, ext: f.ext as QzUpFile['ext'], kind: f.kind,
      size: number(f.size, 1, max, true) };
    if (f.kind === 'audio') file.sec = number(f.sec, 0, QZ_PACK.AUDIO_SEC);
    if (byName.has(fileName(file))) throw new PackError('Файл указан дважды.');
    byName.set(fileName(file), file); files.push(file); bytes += file.size;
  }
  if (bytes > QZ_PACK.BYTES) throw new PackError('Файлы пака — не больше 30 МБ.', 413);
  const meta = record(source.source);
  if (!['text', 'csv', 'siq', 'builtin'].includes(String(meta.format))) throw new PackError('Неизвестный источник пака.');
  const pack = blankPack(meta.format as QzPack['source']['format']);
  pack.kind = source.kind as QzPack['kind'];
  pack.title = str(source.title, QZ_PACK.TITLE, true);
  pack.author = str(source.author ?? '', QZ_PACK.TITLE);
  if (source.adult !== undefined && typeof source.adult !== 'boolean') throw new PackError('Неверная отметка 18+.');
  pack.adult = source.adult === true;
  pack.tags = list(source.tags ?? [], QZ_PACK.QUESTIONS).map(t => str(t, QZ_PACK.TITLE, true));
  if (meta.name !== undefined) pack.source.name = str(meta.name, QZ_PACK.TITLE);
  const contents = (raw: unknown): QzContent[] => {
    const result: QzContent[] = [];
    for (const value of list(raw ?? [], QZ_PACK.QUESTIONS)) {
      const c = record(value);
      if (c.kind === 'video' || c.kind === 'html') { warnings.push(c.kind === 'video' ? 'Видео пропущено.' : 'Веб-страница пропущена.'); continue; }
      if (c.kind === 'text') {
        const value = str(c.value, QZ_PACK.TEXT);
        if (value) result.push({ kind: 'text', value, ...(c.say === true ? { say: true } : {}) });
      } else if (c.kind === 'image' || c.kind === 'audio') {
        if (typeof c.url === 'string' || (typeof c.file === 'string' && /^(?:https?:|data:|blob:|\/\/)/i.test(c.file))) {
          warnings.push('Картинки и звуки по ссылкам не показываем.'); continue;
        }
        const f = typeof c.file === 'string' && PACK_FILE_RE.test(c.file) ? byName.get(c.file) : undefined;
        if (!f || f.kind !== c.kind) throw new PackError('Файл вопроса не найден в списке файлов.');
        if (c.kind === 'image') result.push({ kind: 'image', file: fileName(f) });
        else {
          number(c.sec, 0, QZ_PACK.AUDIO_SEC);
          if (c.sec !== f.sec) throw new PackError('Длина звука не совпадает со списком файлов.');
          result.push({ kind: 'audio', file: fileName(f), sec: f.sec! });
        }
      } else throw new PackError('Неизвестное содержимое вопроса.');
    }
    return result;
  };
  let questions = 0;
  if (pack.kind === 'jeopardy') {
    pack.rounds = list(source.rounds, QZ_PACK.QUESTIONS).map(value => {
      const r = record(value);
      if (typeof r.final !== 'boolean') throw new PackError('Укажи, какой раунд — финал.');
      const final = r.final;
      return { name: str(r.name, QZ_PACK.TITLE, true), final, themes: list(r.themes, QZ_PACK.QUESTIONS).map(value => {
        const t = record(value);
        const qs = list(t.questions, final ? 1 : QZ_PACK.QUESTIONS);
        if (!qs.length) throw new PackError('В теме нет вопросов.');
        return { name: str(t.name, QZ_PACK.THEME, true), questions: qs.map(value => {
          if (++questions > QZ_PACK.QUESTIONS) throw new PackError('В паке — не больше 600 вопросов.');
          const q = record(value);
          if (!['simple', 'cat', 'auction', 'noRisk', 'forAll', 'other'].includes(String(q.type))) throw new PackError('Неизвестный тип вопроса.');
          const question: QzQuestion = { price: number(q.price, final ? 0 : 1, final ? 0 : Number.MAX_SAFE_INTEGER, true),
            type: q.type as QzQuestion['type'], content: contents(q.content), reveal: contents(q.reveal),
            answers: list(q.answers ?? [], QZ_PACK.ANSWERS).map(a => str(a, QZ_PACK.ANSWER, true)),
            wrong: list(q.wrong ?? [], QZ_PACK.ANSWERS).map(a => str(a, QZ_PACK.ANSWER, true)),
            comment: str(q.comment ?? '', QZ_PACK.COMMENT) };
          if (!question.content.length) throw new PackError('Вопрос пустой.');
          if (q.catTheme !== undefined) question.catTheme = str(q.catTheme, QZ_PACK.THEME);
          return question;
        }) };
      }) };
    });
    if (!pack.rounds.some(r => !r.final && r.themes.length >= QZ_JP.THEMES_MIN)) throw new PackError('Нужен обычный раунд хотя бы с тремя темами.');
  } else if (pack.kind === 'words') {
    const w = record(source.words);
    pack.words = { easy: [], mid: [], hard: [] };
    for (const level of ['easy', 'mid', 'hard'] as const) pack.words[level] = list(w[level] ?? [], QZ_PACK.WORDS).map(v => str(v, QZ_PACK.WORD, true));
    const n = Object.values(pack.words).reduce((n, a) => n + a.length, 0);
    if (!n || n > QZ_PACK.WORDS) throw new PackError('В паке должно быть от 1 до 2000 слов.');
  } else if (pack.kind === 'whoofus') {
    pack.who = list(source.who, QZ_PACK.QUESTIONS).map(value => {
      const q = record(value);
      return { q: str(q.q, QZ_WHO.Q_MAX, true), ...(q.title !== undefined ? { title: str(q.title, QZ_WHO.TITLE_MAX) } : {}) };
    });
    if (!pack.who.length) throw new PackError('В паке нет вопросов.');
  } else {
    pack.riddles = list(source.riddles, QZ_PACK.QUESTIONS).map(value => {
      const r = record(value);
      return { story: str(r.story, QZ_PACK.TEXT, true), answer: str(r.answer, QZ_PACK.ANSWER, true) };
    });
    if (!pack.riddles.length) throw new PackError('В паке нет загадок.');
  }
  return { pack, files, warnings };
}
