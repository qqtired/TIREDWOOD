// Перенос lab/quiz/js/packtext.js без DOM. Результат пригоден и для живого вида, и для загрузки.
import { blankPack, cleanPackText, countPack } from './pack.ts';
import { QZ_WHO, type QzPack, type QzQuestion, type QzRound, type QzTheme } from './types.ts';
export { countPack };
export type TextClass = 'kw' | 'q' | 'fin' | 'cmt' | 'blank' | 'err' | 'warn';
export interface TextLine { cls: TextClass; msg?: string }
export interface TextPackResult { pack: QzPack; lines: TextLine[]; errors: number; warnings: number }

export const answersOf = (s: string): string[] => s.replace(/\(\s*принимается\s*:[^)]*\)/gi, ' ').split('/').map(x => x.trim()).filter(Boolean);
function splitQA(body: string): { q: string; a: string } | null {
  let k = body.indexOf(' = '), len = 3;
  if (k < 0) { k = body.indexOf('='); len = 1; }
  return k < 0 ? null : { q: body.slice(0, k).trim(), a: body.slice(k + len).trim() };
}
function tidy(pack: QzPack): void {
  for (const r of pack.rounds) r.themes = r.themes.filter(t => t.questions.length);
  pack.rounds = pack.rounds.filter(r => r.themes.length);
}
function summary(pack: QzPack, lines: TextLine[]): TextPackResult {
  return { pack, lines, errors: lines.filter(l => l.cls === 'err').length, warnings: lines.filter(l => l.cls === 'warn').length };
}

/** Общая нормализация собственного вопроса и строки пака. Слишком длинное не обрезается незаметно. */
export function parseWhoQuestion(raw: string): { q: string; title: string } | null {
  const pair = splitQA(cleanPackText(raw));
  let q = pair?.q ?? cleanPackText(raw);
  if (!q) return null;
  if (!/^кто из нас(?:\s|[?.,!]|$)/i.test(q)) q = `Кто из нас ${q}`;
  if (!q.endsWith('?')) q += '?';
  const title = pair?.a || q.replace(/^кто из нас\s*/i, '').replace(/\?$/, '').slice(0, QZ_WHO.TITLE_MAX);
  if (q.length > QZ_WHO.Q_MAX || title.length > QZ_WHO.TITLE_MAX || !title) return null;
  return { q, title };
}

export function parseText(text: string): TextPackResult {
  const src = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const pack = blankPack();
  const lines: TextLine[] = src.map(() => ({ cls: 'blank' }));
  let round: QzRound | null = null, theme: QzTheme | null = null, last: QzQuestion | null = null;
  let wordLevel: 'easy' | 'mid' | 'hard' = 'easy';
  const themeLines = new Map<QzTheme, number>(), roundLines = new Map<QzRound, number>();
  const mark = (i: number, cls: TextClass, msg?: string) => { lines[i] = { cls, ...(msg ? { msg } : {}) }; };
  const newRound = (name: string, final: boolean, line: number): QzRound => {
    const r = { name: name || (final ? 'Финал' : `Раунд ${pack.rounds.filter(r => !r.final).length + 1}`), final, themes: [] };
    pack.rounds.push(r); roundLines.set(r, line); theme = null; last = null; return r;
  };
  for (let i = 0; i < src.length; i++) {
    const s = src[i].trim();
    if (!s) continue;
    if (/^(#|\/\/)/.test(s)) { mark(i, 'cmt'); continue; }
    let m: RegExpExecArray | null;
    if ((m = /^(?:пак|название)\s*:\s*(.*)$/i.exec(s))) {
      pack.title = m[1].trim(); mark(i, pack.title ? 'kw' : 'err', pack.title ? undefined : 'Напиши название после «Пак:».');
    } else if ((m = /^авторы?\s*:\s*(.*)$/i.exec(s))) { pack.author = m[1].trim(); mark(i, 'kw'); }
    else if (/^(?:18\s*\+|возраст\s*:\s*18\s*\+?)$/i.test(s)) { pack.adult = true; mark(i, 'kw'); }
    else if ((m = /^слова\s*:\s*(л[её]гкие|средние|сложные)\s*$/i.exec(s))) {
      if (pack.rounds.length || pack.who) { mark(i, 'err', 'В одном паке — один вид игры.'); continue; }
      pack.kind = 'words'; pack.words ??= { easy: [], mid: [], hard: [] };
      wordLevel = /^л/i.test(m[1]) ? 'easy' : /^сред/i.test(m[1]) ? 'mid' : 'hard'; mark(i, 'kw');
    } else if (/^кто из нас\?\s*:?$/i.test(s)) {
      if (pack.rounds.length || pack.words) { mark(i, 'err', 'В одном паке — один вид игры.'); continue; }
      pack.kind = 'whoofus'; pack.who ??= []; mark(i, 'kw');
    } else if (pack.kind === 'words') { pack.words![wordLevel].push(s); mark(i, 'q'); }
    else if (pack.kind === 'whoofus' || /^кто из нас\s/i.test(s)) {
      if (pack.rounds.length) { mark(i, 'err', 'В одном паке — один вид игры.'); continue; }
      pack.kind = 'whoofus'; pack.who ??= [];
      const q = parseWhoQuestion(s);
      if (q) { pack.who.push(q); mark(i, 'q'); } else mark(i, 'err', 'Вопрос — до 120 знаков, титул — до 30.');
    } else if ((m = /^раунд(?=[\s:]|$)\s*:?\s*(.*)$/i.exec(s))) { round = newRound(m[1].trim(), false, i); mark(i, 'kw'); }
    else if ((m = /^финал(?=[\s:]|$)\s*:?\s*(.*)$/i.exec(s))) { round = newRound(m[1].trim(), true, i); mark(i, 'kw'); }
    else if ((m = /^тема\s*:\s*(.*)$/i.exec(s))) {
      if (!m[1].trim()) { theme = null; mark(i, 'err', 'Напиши название темы после «Тема:».'); continue; }
      round ??= newRound('', false, i);
      theme = { name: m[1].trim(), questions: [] }; round.themes.push(theme); themeLines.set(theme, i); last = null; mark(i, 'kw');
    } else if ((m = /^(?:комментарий|коммент)\s*:\s*(.*)$/i.exec(s))) {
      if (!last) mark(i, 'err', 'Комментарий пишут после вопроса, к которому он относится.');
      else { last.comment = m[1].trim(); mark(i, 'cmt'); }
    } else if ((m = /^(\d{1,6})\s+(.+)$/.exec(s)) || (m = /^\?\s*(.+)$/.exec(s))) {
      const hasPrice = m.length === 3, price = hasPrice ? Number(m[1]) : 0;
      const qa = splitQA(hasPrice ? m[2] : m[1]);
      if (!theme || !round) { mark(i, 'err', 'Сначала напиши тему: «Тема: Рыбы».'); continue; }
      if (!qa) { mark(i, 'err', 'Нет ответа: допиши « = ответ ».'); continue; }
      if (!qa.q) { mark(i, 'err', 'Нет вопроса перед «=».'); continue; }
      const answers = answersOf(qa.a);
      if (!answers.length) { mark(i, 'err', 'Нет ответа после «=».'); continue; }
      if (!round.final && (!hasPrice || price <= 0)) { mark(i, 'err', 'Нужна цена: число больше нуля.'); continue; }
      if (round.final && theme.questions.length) { mark(i, 'warn', 'В финале у темы один вопрос — этот не возьмём.'); continue; }
      last = { price: round.final ? 0 : price, type: 'simple', content: [{ kind: 'text', value: qa.q }], reveal: [], answers, wrong: [], comment: '' };
      theme.questions.push(last); mark(i, round.final ? 'fin' : 'q');
    } else mark(i, 'err', /^\d+\s*$/.test(s) ? 'После цены напиши вопрос и « = ответ ».' : 'Не понял строку. Начни с «Тема:», «Раунд:», цены или «?».');
  }
  for (const r of pack.rounds) {
    for (const t of r.themes) if (!t.questions.length) mark(themeLines.get(t)!, 'warn', 'В этой теме пока нет вопросов — её не возьмём.');
    if (!r.themes.length) mark(roundLines.get(r)!, 'warn', 'В этом раунде пока нет тем — его не возьмём.');
  }
  tidy(pack); return summary(pack, lines);
}

/** Кавычки, удвоенные кавычки, переводы строк внутри ячеек; line — номер строки файла с нуля. */
function splitCsv(text: string, delim: string): { rows: Array<{ cells: string[]; line: number }>; unclosed: boolean } {
  const rows: Array<{ cells: string[]; line: number }> = [];
  let cells: string[] = [], cell = '', quoted = false, line = 0, rowLine = 0;
  const endRow = () => { cells.push(cell); if (cells.some(c => c.trim())) rows.push({ cells, line: rowLine }); cells = []; cell = ''; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else { if (c === '\n') line++; cell += c; }
    } else if (c === '"' && !cell) quoted = true;
    else if (c === delim) { cells.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; endRow(); line++; rowLine = line; }
    else cell += c;
  }
  if (cell || cells.length) endRow();
  return { rows, unclosed: quoted };
}
const COLS: Record<string, string[]> = {
  round: ['раунд', 'round'], theme: ['тема', 'theme'], price: ['цена', 'стоимость', 'price'],
  question: ['вопрос', 'question'], answer: ['ответ', 'ответы', 'answer'],
  image: ['картинка', 'изображение', 'фото', 'image'], comment: ['комментарий', 'коммент', 'comment'],
};
export function parseCsv(text: string): TextPackResult {
  const src = String(text).replace(/^\uFEFF/, '');
  const first = src.split(/\r?\n/).find(l => l.trim()) ?? '';
  const count = (ch: string) => first.split(ch).length - 1;
  const delim = count('\t') ? '\t' : count(';') >= count(',') && count(';') ? ';' : ',';
  const { rows, unclosed } = splitCsv(src, delim);
  const lines: TextLine[] = Array.from({ length: src.split(/\r?\n/).length }, () => ({ cls: 'blank' }));
  const pack = blankPack('csv');
  let cols: Array<string | null> = ['round', 'theme', 'price', 'question', 'answer', 'image'];
  const named = (rows[0]?.cells ?? []).map(c => Object.keys(COLS).find(k => COLS[k].includes(c.trim().toLowerCase())) ?? null);
  let start = 0;
  if (named.filter(Boolean).length >= 2) { cols = named; start = 1; lines[rows[0].line] = { cls: 'kw' }; }
  const at = (cells: string[], key: string) => (cells[cols.indexOf(key)] ?? '').trim();
  let round: QzRound | null = null, theme: QzTheme | null = null;
  for (const { cells, line } of rows.slice(start)) {
    const put = (cls: TextClass, msg?: string) => { lines[line] = { cls, ...(msg ? { msg } : {}) }; };
    const rn = at(cells, 'round'), tn = at(cells, 'theme');
    if (rn && (!round || round.name !== rn)) { round = { name: rn, final: /^(финал|final)/i.test(rn), themes: [] }; pack.rounds.push(round); theme = null; }
    if (tn && (!theme || theme.name !== tn)) {
      if (!round) { round = { name: 'Раунд 1', final: false, themes: [] }; pack.rounds.push(round); }
      theme = { name: tn, questions: [] }; round.themes.push(theme);
    }
    const q = at(cells, 'question'), a = at(cells, 'answer'), priceRaw = at(cells, 'price');
    if (!q && !a && !priceRaw) { put('kw'); continue; }
    if (!theme || !round) { put('err', 'Нет темы: заполни столбец «Тема».'); continue; }
    if (!q) { put('err', 'Нет вопроса.'); continue; }
    if (!answersOf(a).length) { put('err', 'Нет ответа.'); continue; }
    const price = /^\d+$/.test(priceRaw) ? Number(priceRaw) : NaN;
    if (!round.final && !(price > 0 && Number.isSafeInteger(price))) { put('err', 'Нужна цена: число больше нуля.'); continue; }
    if (round.final && theme.questions.length) { put('warn', 'В финале у темы один вопрос — этот не возьмём.'); continue; }
    theme.questions.push({ price: round.final ? 0 : price, type: 'simple', content: [{ kind: 'text', value: q }], reveal: [],
      answers: answersOf(a), wrong: [], comment: at(cells, 'comment') });
    // CSV не содержит байтов картинки. Внешние адреса не превращаем в сетевые запросы.
    put(at(cells, 'image') ? 'warn' : round.final ? 'fin' : 'q', at(cells, 'image') ? 'Картинки по ссылке не показываем.' : undefined);
  }
  if (unclosed) lines[rows.at(-1)?.line ?? 0] = { cls: 'err', msg: 'В таблице не закрыты кавычки.' };
  tidy(pack); return summary(pack, lines);
}
export function parseAny(text: string): TextPackResult & { format: 'text' | 'csv' } {
  const src = String(text), head = src.split(/\r?\n/).find(l => l.trim()) ?? '', low = head.toLowerCase();
  const names = ['round', 'theme', 'price', 'question', 'answer'].filter(k => COLS[k].some(w => low.includes(w))).length;
  const csv = head.includes('\t') || (head.match(/;/g) ?? []).length >= 2 || (names >= 3 && head.includes(','));
  return { ...(csv ? parseCsv(src) : parseText(src)), format: csv ? 'csv' : 'text' };
}
