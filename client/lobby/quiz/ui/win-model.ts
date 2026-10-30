// «Ракушка», окно (docs/quiz/tech.md §21): что показывать на вкладках — чистые функции без DOM (их проверяет test/quiz-ui2.test.ts).
// «Играть» — четыре карточки режимов; «Пак и темы» — выбор ведущего «Своей игры»; «Паки» — каталог; «Загрузить» — разбор и
// проверка пака до отправки; «Рекорды». Чужой текст (названия, ники) — только через esc(). Тексты — «на ты».
// «Ракушка» 1.1: «Сыграть» (заказ пака на следующую игру и строка заказа), «Загрузить» тремя шагами (откуда → проверка → сохранить),
// ссылка из библиотеки SIGame (F5) и плашка «загружать пока может только …».
import type { QuizClientMsg } from '../../../../shared/quiz/net.ts';
import { validatePack, PackError } from '../../../../shared/quiz/pack.ts';
import { countPack, parseAny } from '../../../../shared/quiz/text.ts';
import {
  QZ_JP, QZ_MODES, QZ_PACK, QZ_TOKENS, type QzMe, type QzMyRecs, type QzOrder, type QzPack, type QzPackInfo, type QzPackKind, type QzPackOutline, type QzScoreRow, type QzTopRecs,
  type QzUpFile,
} from '../../../../shared/quiz/types.ts';
import { esc, plural } from './hud-model.ts';
import { fmtSize } from './siq.ts';
import type { FetchProgress } from './upload.ts';

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

/** Кнопка «Сыграть» у пака: '' — можно нажать; 'wait' — отправили, ждём подтверждение сервера; 'done' — пак уже заказан */
export type PlayState = '' | 'wait' | 'done';

/** Что можно заказать кнопкой «Сыграть»: «Своя игра», слова «Крокодила», «Кто из нас?» (у «Загадок» кнопки нет) */
export const canOrder = (kind: QzPackKind): boolean => kind === 'jeopardy' || kind === 'words' || kind === 'whoofus';

/** Строка каталога разметкой: название, 18+, подпись, сколько сыграли и 👍; «Сыграть» (любому игроку) и «Удалить» у своих (двумя нажатиями — armed) */
export function packRow(p: QzPackInfo, armed: boolean, pic: (id: string, cls?: string) => string, play: PlayState = ''): string {
  const del = p.canDel && !p.builtin ? `<button type="button" class="k-btn ${armed ? 'k-btn--stop' : 'k-btn--ghost'} k-btn--sm" data-w="del" data-id="${esc(p.id)}">${armed ? 'Точно удалить?' : 'Удалить'}</button>` : '';
  const go = !canOrder(p.kind) ? ''
    : play === 'done' ? '<span class="k-pill k-pill--gold qw-ordered">Заказан</span>'
    : `<button type="button" class="k-btn k-btn--go k-btn--sm qw-play" data-w="play" data-id="${esc(p.id)}"${play === 'wait' ? ' disabled' : ''}>${play === 'wait' ? 'Заказываю…' : 'Сыграть'}</button>`;
  return `<div class="qw-row${play === 'done' ? ' is-ordered' : ''}" data-id="${esc(p.id)}"><span class="qw-ic">${pic(kindIcon(p.kind))}</span>`
    + `<div class="qw-t"><b>${esc(p.title)}</b>${p.adult ? ' <span class="k-pill k-pill--bad k-pill--xs">18+</span>' : ''}<span class="k-faint">${esc(packSub(p))}</span></div>`
    + `<span class="qw-st"><span title="Сыграли">${p.plays}</span><span class="qw-heart" title="Понравилось">${pic('heart')}${p.likes}</span></span>${go}${del}</div>`;
}

// ------------------------------------------------------------------ «Сыграть»: заказ пака на следующую игру

/** Когда пойдёт заказанный пак — по виду (сервер: следующая игра этого вида; сыгранный заказ снимается) */
const ORDER_WHEN: Partial<Record<QzPackKind, string>> = {
  jeopardy: 'будет первым в следующей «Своей игре»',
  words: 'слова из него — в следующем «Крокодиле»',
  whoofus: 'вопросы из него — первыми в следующем «Кто из нас?»',
};
export const orderWhen = (kind: QzPackKind): string => ORDER_WHEN[kind] ?? '';

export interface OrderRow {
  id: string;
  title: string;
  kind: QzPackKind;
  /** кто заказал: «ты» у своего заказа, иначе ник */
  who: string;
  mine: boolean;
  when: string;
}

/** Заказы из снимка (по одному на вид) строками по порядку «Своя игра», слова, «Кто из нас?»; mySlot — чтобы свой заказ назвать «ты» */
export function orderRows(orders: readonly QzOrder[] | null | undefined, mySlot: number): OrderRow[] {
  const rows: OrderRow[] = [];
  for (const kind of ['jeopardy', 'words', 'whoofus'] as const) {
    const o = orders?.find((x) => x.kind === kind);
    if (o) rows.push({ id: o.id, title: o.title, kind, who: o.by.slot === mySlot ? 'ты' : o.by.nick, mine: o.by.slot === mySlot, when: orderWhen(kind) });
  }
  return rows;
}

/** Строка заказа вверху «Паков» (тост кита: свой — золотой): «Заказан: «Кино 90-х» — Tired» и когда пойдёт; заказов нет — одна подсказка, как заказать */
export function ordersHtml(rows: readonly OrderRow[], pic: (id: string, cls?: string) => string): string {
  if (!rows.length) return '<p class="qw-orders-hint k-faint">Нажми «Сыграть» у пака — он пойдёт в следующую игру</p>';
  return rows.map((r) => `<div class="k-toast ${r.mine ? 'k-toast--reward' : 'k-toast--good'} qw-order" data-id="${esc(r.id)}"><span class="k-toast-ic">${pic(kindIcon(r.kind))}</span>`
    + `<span class="k-toast-title">Заказан: «${esc(r.title)}» — ${esc(r.who)}</span><span class="k-toast-sub">${esc(r.when)}</span></div>`).join('');
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

// ------------------------------------------------------------------ «Загрузить»: три шага (откуда → проверка → сохранить)

type Pic = (id: string, cls?: string) => string;

/** Откуда взять пак (шаг 1): ссылка из библиотеки SIGame, файл или текст */
export type UploadWay = 'link' | 'file' | 'text';
export const UPLOAD_WAYS: ReadonlyArray<{ id: UploadWay; label: string }> = [
  { id: 'link', label: 'Ссылка SIGame' }, { id: 'file', label: 'Файл' }, { id: 'text', label: 'Текстом' },
];

/** Можно ли мне загружать: сервер сказал «нет» (QUIZ_UPLOADERS, уровень) — вместо шагов одна плашка с его строкой; поля нет — форма открыта */
export function uploadGate(me: Pick<QzMe, 'canUpload' | 'uploadWhy'> | null | undefined): { open: boolean; why: string } {
  if (me?.canUpload !== false) return { open: true, why: '' };
  return { open: false, why: me.uploadWhy?.trim() || 'Загружать паки сейчас нельзя' };
}

/** Плашка вместо формы: слова сервера, что играть можно любой пак, и переход к «Пакам» */
export const lockHtml = (why: string, pic: Pic): string =>
  `<div class="k-cell qw-lock">${pic('lock', 'qw-lock-ic')}<b class="k-row-title">${esc(why)}</b><span class="k-dim">Сыграть можно любой пак — во вкладке «Паки»</span><button type="button" class="k-btn k-btn--go" data-w="tab" data-tab="packs">К пакам</button></div>`;

/** Номер пака в ссылке библиотеки — тот же разбор, что у сервера (server/lobby/quiz/fetch.ts) */
const GUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

export type LinkCheck = { ok: true; url: string; name: string } | { ok: false; why: string };

/** Ссылка из поля: до билета и запроса проверяем то же, что проверит сервер, и говорим по-человечески. Без «https://» дописываем сами,
 *  «http://» поднимаем до https. name — имя файла, если ссылка прямая на .siq (иначе пусто) */
export function sigameLink(raw: string): LinkCheck {
  const text = raw.trim();
  if (!text) return { ok: false, why: 'Вставь ссылку на пак из библиотеки SIGame' };
  let url: URL;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`); } catch { return { ok: false, why: 'Это не похоже на ссылку — скопируй её из адресной строки' }; }
  if (url.protocol === 'http:') url.protocol = 'https:';
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || !QZ_PACK.FETCH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    return { ok: false, why: `Можно только паки из библиотеки SIGame (${QZ_PACK.FETCH_HOSTS[0]})` };
  }
  const direct = /\.siq$/i.test(url.pathname);
  if (!direct && !GUID.test(url.href)) return { ok: false, why: 'В ссылке нет номера пака — открой пак в библиотеке и скопируй адрес страницы' };
  let name = '';
  if (direct) { try { name = decodeURIComponent(url.pathname.split('/').pop() ?? ''); } catch { name = url.pathname.split('/').pop() ?? ''; } }
  return { ok: true, url: url.href, name };
}

/** Откуда взялся пак в шаге «Проверка» */
export interface PackSource {
  kind: 'file' | 'sigame' | 'text';
  name: string;
}
export const sourceNote = (s: PackSource): string => (s.kind === 'sigame' ? 'из библиотеки SIGame' : s.kind === 'file' && s.name ? `из файла ${s.name}` : '');

/** «Скачиваю пак… 3,4 из 12 МБ» — строка шага «Проверка», пока пак качается */
export function fetchText(p: FetchProgress): string {
  if (p.wait > 0) return `Сервер просит подождать — ${p.wait} с`;
  if (p.phase === 'ticket') return 'Готовлюсь скачать пак…';
  return p.got > 0 ? `Скачиваю пак… ${fmtSize(p.got)}${p.total > 0 ? ` из ${fmtSize(p.total)}` : ''}` : 'Скачиваю пак…';
}

const ROUNDS_SHOWN = 4;
const THEMES_SHOWN = 8;

/** Шаг «Проверка»: раунды и темы «Своей игры» пилюлями кита — по ним видно, тот ли пак скачался. У слов и «Кто из нас?» только число записей (в строке итога) */
export function packOutlineHtml(pack: QzPack): string {
  if (pack.kind !== 'jeopardy' || !pack.rounds.length) return '';
  const rounds = pack.rounds.slice(0, ROUNDS_SHOWN).map((r) => {
    const more = r.themes.length - THEMES_SHOWN;
    return `<div class="qw-round"><b>${esc(r.name || 'Раунд')}</b>${r.themes.slice(0, THEMES_SHOWN).map((t) => `<span class="k-pill k-pill--xs">${esc(t.name)}</span>`).join('')}${more > 0 ? `<span class="k-faint">ещё ${more}</span>` : ''}</div>`;
  });
  const rest = pack.rounds.length - ROUNDS_SHOWN;
  return `<div class="qw-rounds">${rounds.join('')}${rest > 0 ? `<span class="k-faint">…и ещё ${rest} ${plural(rest, 'раунд', 'раунда', 'раундов')}</span>` : ''}</div>`;
}

/** Шаг 3: что показать и можно ли нажимать. why — почему кнопки серые (пусто — можно); play — есть ли «Сохранить и сыграть»
 *  (виды, которые не заказать, — одна кнопка «Сохранить»); hint — что делает каждая кнопка. Уровень решает сервер (canUpload), его слово главнее */
export interface SaveGate {
  why: string;
  play: boolean;
  main: string;
  only: string;
  hint: string;
}
export function saveGate(o: { canUpload: boolean | undefined; level: number | null; draft: Draft | null; busy: '' | 'parse' | 'save'; fetching: boolean }): SaveGate {
  const lvl = o.canUpload === undefined ? o.level : null;
  const kind = o.draft?.pack.kind ?? null;
  const play = !kind || canOrder(kind);
  let why: string;
  if (lvl !== null && lvl < QZ_PACK.MIN_LEVEL) why = saveReason(lvl, o.draft, !!o.busy);
  else if (o.fetching) why = 'Скачиваю пак…';
  else if (o.busy) why = o.busy === 'parse' ? 'Разбираю пак…' : 'Идёт загрузка…';
  else if (!o.draft) why = 'Сначала выбери, откуда взять пак';
  else why = saveReason(null, o.draft, false);
  const hint = !kind ? 'Пак увидят все игроки. «Сохранить и сыграть» ещё и поставит его в следующую игру.'
    : play ? `«Сохранить и сыграть»: ${orderWhen(kind)}. «Только сохранить»: пак просто появится в списке.`
    : 'Пак появится в списке паков.';
  return { why, play, main: play ? 'Сохранить и сыграть' : 'Сохранить', only: 'Только сохранить', hint };
}

/** Что с заказом только что сохранённого пака: ждём подтверждение сервера, заказан, не вышло, не заказывали */
export type OrderStep = 'wait' | 'yes' | 'fail' | 'no';
export interface Saved {
  id: string;
  title: string;
  kind: QzPackKind;
  order: OrderStep;
}

/** Итог шага 3 (тост кита): «Готово: «Кино 90-х» сохранён» и что с заказом; не вышло — красный тон; кнопка к «Пакам» */
export function savedHtml(s: Saved, pic: Pic): string {
  const line = s.order === 'yes' ? `Заказан — ${orderWhen(s.kind)}`
    : s.order === 'wait' ? 'Заказываю…'
    : s.order === 'fail' ? 'Заказать не вышло — нажми «Сыграть» у пака во вкладке «Паки»'
    : 'Теперь он есть среди паков';
  return `<div class="qw-done"><div class="k-toast ${s.order === 'fail' ? 'k-toast--warn' : 'k-toast--good'}"><span class="k-toast-ic">${pic(kindIcon(s.kind))}</span>`
    + `<span class="k-toast-title">Готово: «${esc(s.title)}» сохранён</span><span class="k-toast-sub">${esc(line)}</span></div>`
    + `<button type="button" class="k-btn k-btn--ghost k-btn--sm" data-w="tab" data-tab="packs">Смотреть в «Паках»</button></div>`;
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
