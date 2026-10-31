// «Ракушка», HUD «Крокодила» и «Кто из нас?», общий док строк и клавиши части 2 (docs/quiz/tech.md §22, §23).
// Чистые функции без DOM (их проверяет test/quiz-ui2.test.ts): плашка сверху, выбор слова, очередь «Хочу рисовать», полоса
// инструментов, свои вопросы; строки «В игру» чужих режимов; какая клавиша что шлёт. Тексты — «на ты», без эмодзи.
import type { QuizClientMsg } from '../../../../shared/quiz/net.ts';
import { parseWhoQuestion } from '../../../../shared/quiz/text.ts';
import { QZ, QZ_CROC, QZ_JP, QZ_WHO, type QzLine, type QzMe, type QzView } from '../../../../shared/quiz/types.ts';
import { placeAt } from '../../../../shared/quiz/venue.ts';
import { PRIO, escHtml as esc } from '../../../ui/kit/topcenter.ts';
import { DOCK_ROWS, FADE_MS, PLATE_KEY, ev, keyCap, pic, swapBtn, type DockModel, type DockRow, type PlateSpec } from './hud-model.ts';
import { betQuick, betModel, dropModel, hostPanel, isFinalist, isHost, isPlayer, jpPlate, showing } from './hud-jp-model.ts';
import { leftSec, mmss } from './paint.ts';

const mk = (html: string, extra: Partial<PlateSpec> = {}): PlateSpec => ({ key: PLATE_KEY, prio: PRIO.mode, html, ...extra });
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

// ------------------------------------------------------------------ «Крокодил»

const LEVELS = ['лёгкое', 'среднее', 'сложное'] as const;
const MULT = ['×1', '×1,5', '×2'] as const;

/** Я рисую: сервер ставит рисующего на его место, а в снимке — его слот */
export const isDrawer = (v: QzView, me: QzMe): boolean => v.croc?.drawer?.slot === me.slot;

/** Плашка «Крокодила»: кто рисует, слово, время (кольцо — тому, кто стоит спиной к табло: рисующему) */
export function crocPlate(v: QzView, me: QzMe, now: number): PlateSpec | null {
  const c = v.croc;
  if (!c) return null;
  const ic = pic('paint');
  const swap = swapBtn(v, me);
  const drawer = isDrawer(v, me);
  const left = leftSec(c.endsAt, now);
  const ring = { p: c.total > 0 ? (c.endsAt - now) / c.total : 0, text: mmss(left), hurry: left <= 10 };
  const who = esc(c.drawer?.nick ?? '');
  switch (c.step) {
    case 'words':
      return drawer
        ? mk(ev({ ic, title: 'Твоя очередь рисовать', sub: 'выбери слово — клик или 1–3', ring: { ...ring, hurry: left <= 3 } }), { lamp: true })
        : mk(ev({ ic, title: `<b>${who}</b> выбирает слово`, sub: `рисунок ${c.num} из ${c.of}`, side: swap }));
    case 'draw':
      if (drawer) return mk(ev({ ic, title: `Ты рисуешь: <b class="k-gold">${esc(v.croc && me.croc?.word ? me.croc.word : '')}</b>`, sub: `угадали ${c.guessed.length}`, ring }));
      if (me.croc?.got) return mk(ev({ ic, title: 'Ты угадал!', sub: `рисует ${who} · пока угадали ${c.guessed.length}`, side: swap }), { tone: 'good' });
      return mk(ev({ ic, title: `Рисует <b>${who}</b>`, sub: `слово: <span class="qz-mask">${esc(c.mask)}</span>`, side: swap })); // «пиши догадки» — строкой todoRow под плашкой (B2)
    case 'reveal': {
      // B1: итог рисунка (слово, кто угадал) — на табло; плашка говорит, что дальше
      const l = c.last;
      if (!l) return null;
      const end = l.end === 'swap' || l.end === 'empty';
      return mk(ev({ ic, title: crocNext(v, me), side: end ? undefined : swap }), l.guessed ? { tone: 'good' } : {});
    }
    default:
      return null;
  }
}

/** B1: что дальше после рисунка (одна строка для плашки): следующий рисующий из очереди, иначе вызов, после шестого — итоги */
export function crocNext(v: QzView, me: QzMe): string {
  const c = v.croc;
  const l = c?.last;
  if (!c || !l) return '';
  if (l.end === 'swap') return 'Меняем игру';
  if (l.end === 'empty') return 'Все ушли';
  if (c.num >= QZ_CROC.TURNS_MAX) return 'Рисунки закончились — итоги';
  const q = c.queue[0];
  if (q) return q.slot === me.slot ? 'Дальше рисуешь ты' : `Дальше рисует <b>${esc(q.nick)}</b>`;
  return 'Кто рисует дальше?';
}

export interface WordsModel {
  sig: string;
  choices: readonly [string, string, string];
  /** сколько осталось выбрать, 0…1 */
  p: number;
}

/** Выбор из трёх слов (лёгкое, среднее, сложное): внизу по центру у рисующего, пока идут 10 с */
export function wordsModel(v: QzView, me: QzMe, now: number): WordsModel | null {
  const c = v.croc;
  if (!c || v.phase !== 'game' || c.step !== 'words' || !isDrawer(v, me) || !me.croc?.choices) return null;
  return { sig: me.croc.choices.join('|'), choices: me.croc.choices, p: c.total > 0 ? clamp01((c.endsAt - now) / c.total) : 0 };
}

export const wordsHtml = (m: WordsModel, picked = -1): string => `<div class="k-plate qo-words qz-words"><span class="qo-words-t">Что рисуешь?</span>${m.choices.map((w, i) =>
  `<button type="button" class="qo-word${picked === i ? ' is-on' : ''}" data-qz="crWord" data-i="${i}">${keyCap(String(i + 1), 'tl')}<b>${esc(w)}</b><span>${LEVELS[i]} · ${MULT[i]}</span></button>`).join('')}`
  + '<span class="k-meter k-meter--thin qz-words-meter" style="--v:1"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span></div>';

export interface QueueModel {
  sig: string;
  /** я в очереди: место 1…, иначе 0 */
  place: number;
  /** очередь полна — кнопки нет */
  full: boolean;
  html: string;
}

/** «Хочу рисовать» во время игры (F): пока в круге меньше шести рисунков; кто уже рисовал в этом круге — нет */
export function queueModel(v: QzView, me: QzMe): QueueModel | null {
  const c = v.croc;
  if (!c || v.phase !== 'game' || !me.croc || me.croc.drew || isDrawer(v, me) || (c.step !== 'words' && c.step !== 'draw' && c.step !== 'reveal')) return null;
  const place = c.queue.findIndex((p) => p.slot === me.slot) + 1;
  const full = c.of >= QZ_CROC.TURNS_MAX;
  if (!place && full) return null;
  const html = place
    ? `<div class="k-plate qo-line qz-queue"><span>Ты в очереди: <b>${place}-й</b></span><button type="button" class="k-btn k-btn--ghost" data-qz="crQueue" data-take="0">Передумал</button></div>`
    : `<div class="k-plate qo-line qz-queue"><span>Рисуют по кругу, до ${QZ_CROC.TURNS_MAX}</span><button type="button" class="k-btn k-btn--go" data-qz="crQueue" data-take="1">Хочу рисовать${keyCap('F', 'tr')}</button></div>`;
  return { sig: `${place}|${c.queue.length}|${full}`, place, full, html };
}

/** Что выбрано на полосе инструментов */
export interface ToolSel {
  color: number;
  width: number;
  erase: boolean;
  /** «Ракушка» 1.1, C6: ведёрко — клик по холсту заливает область выбранным цветом */
  fill?: boolean;
}

/** Толщины и цвета — из контракта; номер 8 у цвета — ластик */
export const toolOut = (s: ToolSel): { color: number; width: number; size: number; erase: boolean; fill: boolean } => ({ color: s.erase ? QZ_CROC.ERASER : s.color, width: s.width, size: s.width, erase: s.erase, fill: !s.erase && !!s.fill });

const ERASE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.5 13.5 7l5 5L11 19.5H6.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 11.5l5 5M11 19.5h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const UNDO_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4.5 11.5 9 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 11.5h9a5 5 0 0 1 0 10h-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const FILL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 11.5 11 5l7 7-6.5 6.5a2 2 0 0 1-2.8 0l-4.2-4.2a2 2 0 0 1 0-2.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M4.6 12.4h12.6" stroke="currentColor" stroke-width="1.8"/><path d="M11 5 8.6 2.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M21 17.6c0 1.3-.8 2.2-1.8 2.2s-1.8-.9-1.8-2.2c0-1.1 1.8-3.3 1.8-3.3s1.8 2.2 1.8 3.3z" fill="currentColor"/></svg>';
const CLEAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12M10 7V5h4v2M8 7l1 12h6l1-12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Полоса инструментов рисующего: 8 цветов, 3 толщины, ластик, ведёрко (G), «Отмена» (Z), «Очистить». Узкая, вертикальная — справа у края */
export function toolsHtml(s: ToolSel): string {
  const colors = QZ_CROC.COLORS.map((c, i) => `<button type="button" class="qz-color${!s.erase && s.color === i ? ' is-on' : ''}" style="--c:${c}" data-qz="crColor" data-i="${i}" title="Цвет ${i + 1}" aria-label="Цвет ${i + 1}"></button>`).join('');
  const widths = QZ_CROC.WIDTHS.map((w, i) => `<button type="button" class="qz-width${s.width === i && !s.fill ? ' is-on' : ''}" data-qz="crWidth" data-i="${i}" title="Толщина" aria-label="Толщина ${i + 1}"><i style="--d:${w / 2 + 4}px"></i></button>`).join('');
  return `<div class="k-plate qz-tools"><div class="qz-tools-colors">${colors}</div><i class="qz-sep"></i>${widths}<i class="qz-sep"></i>`
    + `<button type="button" class="qz-tool${s.erase ? ' is-on' : ''}" data-qz="crErase" title="Ластик" aria-label="Ластик">${ERASE_SVG}</button>`
    + `<button type="button" class="qz-tool${s.fill && !s.erase ? ' is-on' : ''}" data-qz="crFill" title="Заливка — G" aria-label="Заливка">${FILL_SVG}${keyCap('G', 'tr')}</button>`
    + `<button type="button" class="qz-tool" data-qz="crUndo" title="Отмена — Z" aria-label="Отмена">${UNDO_SVG}${keyCap('Z', 'tr')}</button>`
    + `<button type="button" class="qz-tool" data-qz="crClear" title="Очистить холст" aria-label="Очистить">${CLEAR_SVG}</button>`
    + '<span class="qz-full" hidden>Холст полон</span></div>';
}

/** Полоса нужна рисующему, пока идёт рисунок */
export const toolsVisible = (v: QzView, me: QzMe): boolean => v.phase === 'game' && v.croc?.step === 'draw' && isDrawer(v, me);

// ------------------------------------------------------------------ «Кто из нас?»

/** Плашка «Кто из нас?»: свои вопросы, голосование (вопрос — крупно, кольцо времени), раскрытие */
export function whoPlate(v: QzView, me: QzMe, now: number): PlateSpec | null {
  const w = v.who;
  if (!w) return null;
  const ic = pic('online');
  const swap = swapBtn(v, me);
  const inn = !!me.who?.in;
  const q = esc(w.q);
  switch (w.step) {
    case 'ask':
      return inn ? mk(ev({ ic, title: 'Свои вопросы', sub: `в очереди ${w.asked} · твоих ${me.who?.own ?? 0} из ${QZ_WHO.OWN_MAX}`, side: swap }))
        : mk(ev({ ic, title: 'Кто из нас?', sub: 'сидящие пишут свои вопросы', side: swap }));
    case 'vote': {
      if (!inn) return mk(ev({ ic, title: q, sub: `голосуют участники: ${w.voted} из ${w.players.length}`, side: swap }));
      const left = leftSec(w.endsAt, now);
      const mine = w.players.find((p) => p.slot === me.who?.vote);
      const sub = mine ? `твой голос: <b>${esc(mine.nick)}</b> · можно передумать` : `вопрос ${w.num} из ${w.of} · проголосовали ${w.voted} из ${w.players.length}`;
      const skip = `<button type="button" class="k-btn ${me.who?.skip ? 'k-btn--go' : 'k-btn--ghost'} k-btn--sm" data-qz="whoSkip" title="Большинство участников за — вопрос уходит без очков">Пропустить вопрос <b>${w.skip.n}/${w.skip.need}</b></button>`;
      return mk(ev({ ic, title: q, sub, ring: { p: w.total > 0 ? (w.endsAt - now) / w.total : 0, text: mmss(left), hurry: left <= 3 }, actions: skip }), { lamp: true });
    }
    case 'reveal': {
      const lead = w.leaders.map((l) => `<b>${esc(l.nick)}</b>`).join(', ');
      if (!w.leaders.length) return mk(ev({ ic, title: 'Никто не голосовал', side: swap }));
      const hit = inn && !!me.who?.vote && w.leaders.some((l) => l.slot === me.who?.vote);
      return mk(ev({ ic, title: hit ? 'Ты в теме! +1' : `Лидер: ${lead}`, sub: w.title ? `титул: ${esc(w.title)}` : undefined, side: swap }), hit ? { tone: 'good' } : {});
    }
    default:
      return null;
  }
}

/** Свои вопросы (шаг ask): сколько можно добавить ещё и что получится после правки сервера (живой вид) */
export interface AskModel {
  sig: string;
  own: number;
  left: number;
  asked: number;
}

export function askModel(v: QzView, me: QzMe): AskModel | null {
  const w = v.who;
  if (!w || v.phase !== 'game' || w.step !== 'ask' || !me.who?.in) return null;
  const own = me.who.own;
  return { sig: `${own}`, own, left: Math.max(0, QZ_WHO.OWN_MAX - own), asked: w.asked };
}

/** Вопрос и титул из того, что набрано (то же правило, что у сервера: «Кто из нас…», «?», титул через «=»); null — пусто или длинно */
export const whoPreview = (raw: string): { q: string; title: string } | null => (raw.trim() ? parseWhoQuestion(raw) : null);

/** «Кликни по желейке»: подсказка над полем чата в шаге vote */
export const whoHint = (v: QzView, me: QzMe): boolean => v.phase === 'game' && v.who?.step === 'vote' && !!me.who?.in;

// ------------------------------------------------------------------ B2: «что мне делать» — одна строка с клавишей

/** Ряд подсказок под полосой внизу: [клавиша] что делать. Кто не играет сейчас, всё равно видит, что можно */
export interface TodoSpec {
  sig: string;
  /** подсказки клавиш (ряд key-hint, прячется настройкой «Подсказки клавиш»); пусто — нет */
  html: string;
  /** кнопка «Браво!» рядом — мышью, пальцем или B (сидящему в кресле) */
  bravo: boolean;
}

const mo = (key: string, text: string): string => `<span class="mo-key">${keyCap(key, undefined, '')}<em>${esc(text)}</em></span>`;

/** Кнопка «Браво!» строки «что мне делать»: то же, что B */
export const bravoBtn = (): string => `<button type="button" class="k-btn k-btn--ghost k-btn--sm qz-bravo" data-qz="bravo">«Браво!»${keyCap('B', 'tr')}</button>`;

/**
 * Что делать роли без своей полосы: угадывающему — писать догадки (Enter), сидящему зрителю — кнопка «Браво!» (B).
 * Сесть за свободный пульт «Своей игры» подсказывает сам пульт, когда стоишь у него (index.ts pointHint).
 * queueBarOn — у угадывающего «Загадки» эту строку уже несёт полоса «Хочу загадать». null — нечего подсказывать.
 */
export function todoRow(v: QzView, me: QzMe, queueBarOn = false): TodoSpec | null {
  if (v.phase !== 'game') return null;
  const chair = me.place >= 0 && placeAt(me.place)?.kind === 'chair';
  const row = (sig: string, html = ''): TodoSpec | null => (html || chair ? { sig: `${sig}|${chair ? 1 : 0}|${html ? 1 : 0}`, html, bravo: chair } : null);
  const jp = v.jp;
  if (v.mode === 'jeopardy' && jp && jp.step !== 'setup' && jp.step !== 'packvote' && !isHost(jp, me) && !isPlayer(me)) return row('jp');
  const s = v.riddle?.step;
  // «пиши догадки» у угадывающего с полосой «Хочу загадать» несёт полоса — здесь остаётся только «Браво!»
  if (v.mode === 'riddle' && v.riddle && me.role !== 'riddler' && (s === 'round' || s === 'check')) return row('riddle', queueBarOn ? '' : mo('Enter', 'пиши догадки'));
  if (v.mode === 'croc' && v.croc && !isDrawer(v, me) && v.croc.step === 'draw') return row('croc', me.croc?.got ? '' : mo('Enter', 'пиши догадки'));
  return null;
}

// ------------------------------------------------------------------ плашка режима: общий вход

/** Плашка «Своей игры», «Крокодила» и «Кто из нас?» в игре; null — оставить прежней (вызов роли, «Загадка»…) */
export function modePlate(v: QzView, me: QzMe, now: number, ctx: { pvMine: number }): PlateSpec | null {
  if (v.phase === 'roles' && v.mode === 'whoofus' && !v.call) {
    return mk(ev({ ic: pic('online'), title: 'Играют все, кто сидит', sub: `садись — нужно от ${QZ_WHO.MIN}, до ${QZ_WHO.MAX}` }), { tone: 'good' });
  }
  if (v.phase !== 'game' || v.call) return null;
  if (v.mode === 'jeopardy') return jpPlate(v, me, ctx.pvMine, now);
  if (v.mode === 'croc') return crocPlate(v, me, now);
  if (v.mode === 'whoofus') return whoPlate(v, me, now);
  return null;
}

/** Цифры заняты (голос за пак, ✓ / ✗, слово, тема): эмоции 1–7 в это время выключены */
export function digitsBusy(v: QzView, me: QzMe): boolean {
  if (v.phase !== 'game') return false;
  const jp = v.jp;
  if (v.mode === 'jeopardy' && jp) return jp.step === 'packvote' || (isHost(jp, me) && (jp.step === 'answer' || jp.step === 'judge')) || !!dropModel(v, me);
  if (v.mode === 'croc') return v.croc?.step === 'words' && isDrawer(v, me);
  return false;
}

// ------------------------------------------------------------------ док «В игру» других режимов

/** Строка живёт на экране столько, потом гаснет (в «Загадке» её убирает сервер, здесь — время) */
export const PLAIN_SHOW_MS = 30_000;

/** Строки «В игру» «Своей игры», «Крокодила», «Кто из нас?»: без кнопок, последние шесть; «✓ Петя угадал!» — строкой Затейника */
export function plainDock(lines: readonly QzLine[], me: QzMe, now: number): DockModel {
  const rows: DockRow[] = [];
  const sorted = [...lines].sort((a, b) => a.at - b.at || a.id - b.id);
  for (const l of sorted) {
    const age = now - l.at;
    if (age >= PLAIN_SHOW_MS + FADE_MS) continue;
    const got = l.kind === 'got';
    const text = got ? l.text.replace(/^✓\s*/, '') : l.text;
    rows.push({
      id: l.id, nick: l.nick, text, own: l.slot === me.slot, sys: l.kind === 'zat' || got, got, mark: '', buttons: false, caps: false, near: false, undo: false,
      fade: age >= PLAIN_SHOW_MS, sig: `${l.kind}|${l.slot === me.slot ? 1 : 0}|${l.nick}|${text}`,
    });
  }
  while (rows.length > DOCK_ROWS) rows.shift();
  return { rows, waiting: 0 };
}

/** Строки «В игру» текущего режима (у «Загадки» свой док с отметками — hud-model.ts dockModel) */
export function modeLines(v: QzView): readonly QzLine[] {
  return v.mode === 'jeopardy' ? v.jp?.lines ?? [] : v.mode === 'croc' ? v.croc?.lines ?? [] : v.mode === 'whoofus' ? v.who?.lines ?? [] : [];
}

// ------------------------------------------------------------------ клавиши части 2 и текст из чата

/** Что делать по клавише: письмо серверу, выбор пака (mine), «Отмена» мазка или «Хочу рисовать» */
export interface KeyHit {
  msg?: QuizClientMsg;
  mine?: number;
  undo?: true;
  /** C6: G — ведёрко вкл/выкл */
  fill?: true;
}

const DIGIT: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, Numpad5: 4 };

/**
 * Клавиши «Своей игры» и «Крокодила»: 1–3 пак, Пробел — «Жму!» (ведущему — открыть кнопки), 1 / 2 — ✓ / ✗ ведущего,
 * R — показать ответ, 1–5 — убрать тему в финале; «Крокодил»: 1–3 слово, Z — отмена мазка, F — «Хочу рисовать». null — клавиша не наша.
 */
export function keyHit(v: QzView, me: QzMe, code: string): KeyHit | null {
  if (v.phase !== 'game') return null;
  const n = DIGIT[code];
  const jp = v.jp;
  if (v.mode === 'jeopardy' && jp) {
    const host = isHost(jp, me);
    if (jp.step === 'packvote' && n !== undefined && n < 3) return { msg: { t: 'qz', a: 'jpPv', i: n }, mine: n };
    if (code === 'Space' && host && jp.step === 'read') return { msg: { t: 'qz', a: 'jpOpen' } };
    if (code === 'Space' && isPlayer(me) && (jp.step === 'read' || jp.step === 'buzz')) return { msg: { t: 'qz', a: 'jpBuzz' } };
    if (host && (jp.step === 'answer' || jp.step === 'judge') && (n === 0 || n === 1)) return { msg: { t: 'qz', a: 'jpJudge', ok: n === 0 } };
    if (host && code === 'KeyR' && showing(jp)) return { msg: { t: 'qz', a: 'jpShow' } };
    const drop = dropModel(v, me);
    if (drop && n !== undefined && n < drop.themes.length) return { msg: { t: 'qz', a: 'jpDrop', th: n } };
  }
  const c = v.croc;
  if (v.mode === 'croc' && c) {
    if (isDrawer(v, me)) {
      if (c.step === 'words' && n !== undefined && n < 3) return { msg: { t: 'qz', a: 'crWord', i: n } };
      if (c.step === 'draw' && code === 'KeyZ') return { undo: true };
      if (c.step === 'draw' && code === 'KeyG') return { fill: true };
    } else if (code === 'KeyF' && queueModel(v, me) && !me.croc?.queued) return { msg: { t: 'qz', a: 'role', take: true, r: 'drawer' } };
  }
  return null;
}

/** Текст из чата «В игру» (Enter): отвечающему в «Своей игре» — это ответ, игроку в финале — ответ финала, остальным — реплика */
export function lineMsg(v: QzView | null, me: QzMe | null, text: string): QuizClientMsg {
  const jp = v?.phase === 'game' ? v.jp : null;
  if (jp && me) {
    if (jp.step === 'answer' && jp.buzz?.slot === me.slot && isPlayer(me)) return { t: 'qz', a: 'jpAns', text: text.slice(0, QZ_JP.ANSWER_MAX) };
    if (jp.step === 'fanswer' && isFinalist(me) && !me.jp?.fanswered) return { t: 'qz', a: 'jpFans', text: text.slice(0, QZ_JP.ANSWER_MAX) };
  }
  return { t: 'qz', a: 'say', text: text.slice(0, QZ.LINE_MAX) };
}

export { betModel, betQuick, hostPanel };
