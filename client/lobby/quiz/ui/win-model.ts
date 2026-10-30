// «Ракушка», окно (docs/quiz/tech.md §21): что показывать на вкладках — чистые функции без DOM (их проверяет test/quiz-ui2.test.ts).
// «Играть» — четыре карточки режимов; «Пак и темы» — выбор ведущего «Своей игры»; «Паки» — каталог; «Загрузить» — разбор и
// проверка пака до отправки; «Рекорды». Чужой текст (названия, ники) — только через esc(). Тексты — «на ты».
import type { QuizClientMsg } from '../../../../shared/quiz/net.ts';
import { validatePack, PackError } from '../../../../shared/quiz/pack.ts';
import { countPack, parseAny } from '../../../../shared/quiz/text.ts';
import {
  QZ_JP, QZ_MODES, QZ_PACK, QZ_TOKENS, type QzMyRecs, type QzPack, type QzPackInfo, type QzPackKind, type QzPackOutline, type QzScoreRow, type QzTopRecs, type QzUpFile,
} from '../../../../shared/quiz/types.ts';
import { esc, plural } from './hud-model.ts';

export type WinTab = 'setup' | 'play' | 'packs' | 'upload' | 'records';

export interface TabSpec {
  id: WinTab;
  label: string;
  icon: string;
}

/** Вкладки по порядку; у ведущего «Своей игры» в шаге setup первая — «Пак и темы» */
export function tabsFor(setup: boolean): TabSpec[] {
  return [
    setup ? { id: 'setup', label: 'Пак и темы', icon: 'bell' } : { id: 'play', label: 'Играть', icon: 'bell' },
    { id: 'packs', label: 'Паки', icon: 'collection' },
    { id: 'upload', label: 'Загрузить', icon: 'ticket' },
    { id: 'records', label: 'Рекорды', icon: 'records' },
  ];
}

/** Какая вкладка открывается, если не просили конкретную; неизвестное имя — как «не просили» */
export function pickTab(want: string | undefined, setup: boolean): WinTab {
  const all = tabsFor(setup).map((t) => t.id);
  if (want === 'play' && setup) return 'setup';
  return all.find((id) => id === want) ?? all[0];
}

// ------------------------------------------------------------------ «Играть»

const LENGTH: Record<string, string> = {
  riddle: '5 загадок или 15 мин',
  jeopardy: 'раунд пака',
  croc: 'круг, до 6 рисунков',
  whoofus: '10 вопросов',
};

export interface ModeCard {
  id: string;
  name: string;
  icon: string;
  who: string;
  len: string;
}

/** Четыре карточки: сколько людей нужно и сколько длится игра */
export const modeCards = (): ModeCard[] => QZ_MODES.map((m) => ({ id: m.id, name: m.name, icon: m.icon, who: `от ${m.min} ${plural(m.min, 'человека', 'человек', 'человек')}`, len: LENGTH[m.id] ?? '' }));

// ------------------------------------------------------------------ «Пак и темы»

/** Что выбрал ведущий */
export interface SetupSel {
  /** id пака */
  pack: string;
  /** номер раунда в паке (не финал) */
  round: number;
  /** номера выбранных тем в раунде */
  themes: number[];
  final: boolean;
}

/** Раунды, из которых можно играть: обычные, с тремя темами и больше */
export const playableRounds = (o: QzPackOutline): number[] => o.rounds.flatMap((r, i) => (!r.final && r.themes.length >= QZ_JP.THEMES_MIN ? [i] : []));

export const hasFinal = (o: QzPackOutline): boolean => o.rounds.some((r) => r.final && r.themes.length > 0);

/** Первый подходящий раунд, первые шесть тем, финал — если он есть в паке */
export function defaultSetup(o: QzPackOutline): SetupSel | null {
  const round = playableRounds(o)[0];
  if (round === undefined) return null;
  return { pack: o.info.id, round, themes: o.rounds[round].themes.slice(0, QZ_JP.THEMES_MAX).map((_, i) => i), final: hasFinal(o) };
}

/** Можно ли начинать; иначе — что сказать ведущему */
export function setupReason(sel: SetupSel | null): string {
  if (!sel) return 'Выбери пак';
  if (sel.themes.length < QZ_JP.THEMES_MIN) return `Отметь от ${QZ_JP.THEMES_MIN} до ${QZ_JP.THEMES_MAX} тем`;
  if (sel.themes.length > QZ_JP.THEMES_MAX) return `Тем не больше ${QZ_JP.THEMES_MAX} — сними лишние`;
  return '';
}

/** Галочка у темы: ставим и снимаем; шестую сверху поставить нельзя (false — отказ) */
export function toggleTheme(sel: SetupSel, i: number): boolean {
  const at = sel.themes.indexOf(i);
  if (at >= 0) { sel.themes.splice(at, 1); return true; }
  if (sel.themes.length >= QZ_JP.THEMES_MAX) return false;
  sel.themes.push(i);
  sel.themes.sort((a, b) => a - b);
  return true;
}

export const startMsg = (sel: SetupSel): QuizClientMsg => ({ t: 'qz', a: 'jpStart', pack: sel.pack, round: sel.round, themes: [...sel.themes], final: sel.final });

// ------------------------------------------------------------------ «Паки»

export const KIND_NAME: Record<QzPackKind, string> = { jeopardy: 'Своя игра', words: 'Слова «Крокодила»', whoofus: 'Кто из нас?', riddles: 'Загадки' };
const KIND_ICON: Record<QzPackKind, string> = { jeopardy: 'bell', words: 'paint', whoofus: 'online', riddles: 'scroll' };
export const kindIcon = (k: QzPackKind): string => KIND_ICON[k] ?? 'scroll';

/** Что считаем у пака: «5 тем · 120 вопросов», у слов и «Кто из нас?» — только число записей */
export function packCount(p: Pick<QzPackInfo, 'kind' | 'themes' | 'questions'>): string {
  const q = p.kind === 'words' ? `${p.questions} ${plural(p.questions, 'слово', 'слова', 'слов')}` : `${p.questions} ${plural(p.questions, 'вопрос', 'вопроса', 'вопросов')}`;
  return p.kind === 'jeopardy' ? `${p.themes} ${plural(p.themes, 'тема', 'темы', 'тем')} · ${q}` : q;
}

/** Подпись пака в списке: «Автор · 5 тем · 120 вопросов» */
export const packSub = (p: QzPackInfo): string => [p.builtin ? 'встроенный' : p.author, packCount(p)].filter(Boolean).join(' · ');

/** Строка каталога разметкой: название, 18+, подпись, сколько сыграли и 👍; «Удалить» у своих (двумя нажатиями — armed) */
export function packRow(p: QzPackInfo, armed: boolean, pic: (id: string, cls?: string) => string): string {
  const del = p.canDel && !p.builtin ? `<button type="button" class="k-btn ${armed ? 'k-btn--stop' : 'k-btn--ghost'} k-btn--sm" data-w="del" data-id="${esc(p.id)}">${armed ? 'Точно удалить?' : 'Удалить'}</button>` : '';
  return `<div class="qw-row" data-id="${esc(p.id)}"><span class="qw-ic">${pic(kindIcon(p.kind))}</span>`
    + `<div class="qw-t"><b>${esc(p.title)}</b>${p.adult ? ' <span class="k-pill k-pill--bad k-pill--xs">18+</span>' : ''}<span class="k-faint">${esc(packSub(p))}</span></div>`
    + `<span class="qw-st"><span title="Сыграли">${p.plays}</span><span class="qw-heart" title="Понравилось">${pic('heart')}${p.likes}</span></span>${del}</div>`;
}

// ------------------------------------------------------------------ «Загрузить»

/** Что видно про пак до отправки */
export interface Draft {
  pack: QzPack;
  /** строки для показа игроку: предупреждения и ошибки по строкам текста */
  warnings: string[];
  errors: string[];
  /** отказ общей проверки (validatePack) или пустое название; пусто — можно отправлять */
  problem: string;
}

/** Общая проверка тем же validatePack, что у сервера; зовём после каждой правки (название, 18+, текст) */
export function checkDraft(d: Draft, files: readonly QzUpFile[] = []): Draft {
  d.problem = '';
  if (d.errors.length) return d;
  if (!d.pack.title.trim()) { d.problem = 'Напиши название пака'; return d; }
  try { validatePack(d.pack, files); } catch (e) { d.problem = e instanceof PackError ? e.message : 'Пак не прошёл проверку.'; }
  return d;
}

/** Живой вид текстового формата и CSV: разбор общим text.ts и проверка тем же validatePack, что у сервера */
export function draftFromText(text: string): Draft | null {
  if (!text.trim()) return null;
  const r = parseAny(text);
  const warnings: string[] = [], errors: string[] = [];
  r.lines.forEach((l, i) => {
    if (l.cls === 'err') errors.push(`Строка ${i + 1}: ${l.msg ?? 'не понял'}`);
    else if (l.cls === 'warn') warnings.push(`Строка ${i + 1}: ${l.msg ?? 'проверь'}`);
  });
  return checkDraft({ pack: r.pack, warnings, errors, problem: '' });
}

/** Итог разбора одной строкой: «2 раунда · 8 тем · 40 вопросов» */
export function packSummary(pack: QzPack): string {
  const c = countPack(pack);
  const parts: string[] = [];
  if (pack.kind === 'jeopardy') parts.push(`${c.rounds} ${plural(c.rounds, 'раунд', 'раунда', 'раундов')}`, `${c.themes} ${plural(c.themes, 'тема', 'темы', 'тем')}`);
  parts.push(packCount({ kind: pack.kind, themes: c.themes, questions: c.questions }).split(' · ').pop()!);
  return parts.join(' · ');
}

/** Кнопка «Сохранить на набережную»: серая с причиной или нажимается */
export function saveReason(level: number | null, draft: Draft | null, busy: boolean): string {
  if (level !== null && level < QZ_PACK.MIN_LEVEL) return `Загружать паки можно с ${QZ_PACK.MIN_LEVEL}-го уровня`;
  if (busy) return 'Идёт загрузка…';
  if (!draft) return 'Выбери файл или напиши пак';
  if (draft.errors.length) return 'Исправь ошибки в паке';
  return draft.problem;
}

// ------------------------------------------------------------------ «Рекорды»

export interface RecRow {
  label: string;
  value: string;
}

/** Свои цифры по режимам */
export function myRecs(m: QzMyRecs): RecRow[] {
  return [
    { label: 'Своя игра', value: `игр ${m.jpGames} · побед ${m.jpWins} · лучший счёт ${m.jpBest}` },
    { label: 'Загадка', value: `разгадано ${m.rdSolved} · загадано ${m.rdMade}` },
    { label: 'Крокодил', value: `угадано ${m.crGuessed} · нарисовано ${m.crDrawn}` },
    { label: 'Кто из нас?', value: `титулов ${m.whoTitles}` },
  ];
}

export interface TopList {
  title: string;
  unit: string;
  rows: QzScoreRow[];
}

/** Лучшие по набережной: четыре короткие таблицы */
export function topLists(t: QzTopRecs): TopList[] {
  return [
    { title: 'Своя игра', unit: 'побед', rows: t.jpWins },
    { title: 'Загадка', unit: 'разгадано', rows: t.rdSolved },
    { title: 'Крокодил', unit: 'угадано', rows: t.crGuessed },
    { title: 'Кто из нас?', unit: 'титулов', rows: t.whoTitles },
  ];
}

/** «Сегодня 120 из 400» — сколько жетонов за викторины */
export const dayLine = (coins: number): string => `Сегодня ${Math.max(0, Math.floor(coins))} из ${QZ_TOKENS.DAY_CAP}`;
