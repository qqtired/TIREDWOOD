// «Ракушка», HUD «Своей игры»: что показывать игрокам за пультами, ведущему и залу по снимку (docs/quiz/tech.md §19).
// Чистые функции без DOM: плашка сверху, кнопка «Жму!», ответ и ставка, панель ведущего, финал. Разметку строкой кладут в
// слоты кита hud-jp.ts; чужой текст (ники, вопросы, ответы) — только через esc(). Тексты — «на ты», без эмодзи.
// Образец вида — lab/quiz/v2/js/others.js (JEOPARDY). Нельзя подключать kit/dom.ts и kit/icons.ts: файл грузят Node-тесты.
import { QZ_JP, type QzContent, type QzJpBoard, type QzMe, type QzView } from '../../../../shared/quiz/types.ts';
import { PRIO, escHtml as esc } from '../../../ui/kit/topcenter.ts';
import { PLATE_KEY, ev, keyCap, pic, plural, swapBtn, type PlateSpec } from './hud-model.ts';

const mk = (html: string, extra: Partial<PlateSpec> = {}): PlateSpec => ({ key: PLATE_KEY, prio: PRIO.mode, html, ...extra });
const nickOf = (jp: QzJpBoard, slot: number): string => esc(jp.players.find((p) => p.slot === slot)?.nick ?? jp.host?.nick ?? '');
const cut = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export const isHost = (jp: QzJpBoard, me: QzMe): boolean => jp.host?.slot === me.slot;
export const isPlayer = (me: QzMe): boolean => (me.jp?.pult ?? -1) >= 0;
/** Я участвую в финале: у игрока со счётом больше нуля сервер присылает ставку (0 — ещё не ставил) */
export const isFinalist = (me: QzMe): boolean => me.jp?.bet !== undefined;
export const myScore = (jp: QzJpBoard, me: QzMe): number => jp.players.find((p) => p.slot === me.slot)?.score ?? 0;

/** Никто не жмёт: «показать ответ» ждёт ведущего (сервер ставит 3 с: SHOW_AUTO_MS) */
export const showing = (jp: QzJpBoard): boolean => jp.step === 'buzz' && jp.total === QZ_JP.SHOW_AUTO_MS;

/** Текст вопроса из кусков содержимого (картинка и звук — пометкой, «говорит ведущий» сюда не входит) */
export function contentText(parts: readonly QzContent[]): string {
  const text = parts.flatMap((p) => (p.kind === 'text' && !p.say ? [p.value] : [])).join(' ').trim();
  const extra = [parts.some((p) => p.kind === 'image') ? 'картинка' : '', parts.some((p) => p.kind === 'audio') ? 'звук' : ''].filter(Boolean);
  return extra.length ? `${text}${text ? ' ' : ''}[${extra.join(', ')}]` : text;
}

// ------------------------------------------------------------------ плашка сверху

/** Карточки выбора пака (до трёх): клавиши 1–3, мой выбор подсвечен (mine — по моему последнему клику, сервер его не присылает); длинные названия обрезает CSS */
export function packButtons(jp: QzJpBoard, mine: number): string {
  return (jp.packs ?? []).map((p, i) => `<button type="button" class="qz-vopt${mine === i ? ' is-mine' : ''}" data-qz="pv" data-i="${i}" title="${esc(`${p.title} · ${p.sub}`)}">${keyCap(String(i + 1), 'tl')}<span>${esc(p.title)}</span>${p.n ? `<i>${p.n}</i>` : ''}</button>`).join('');
}

/** «Кот в мешке»: кнопка на каждого другого игрока */
export function giveButtons(jp: QzJpBoard, me: QzMe): string {
  return jp.players.filter((p) => p.slot !== me.slot && p.away === 0).map((p) => `<button type="button" class="k-btn k-btn--go k-btn--sm" data-qz="give" data-slot="${p.slot}">${esc(cut(p.nick, 14))}</button>`).join('');
}

/** B1: что дальше после ответа: «Следующий вопрос через 3 с»; клетки кончились — раунд сыгран или финал */
export function jpNext(jp: QzJpBoard, now: number): string {
  if (!jp.themes.some((t) => t.cells.some((c) => c > 0))) return jp.final ? 'Дальше — финал' : 'Раунд сыгран';
  const left = jp.endsAt > 0 ? Math.max(1, Math.ceil((jp.endsAt - now) / 1000)) : 0;
  return left ? `Следующий вопрос через ${left} с` : 'Следующий вопрос';
}

/** Плашка сверху в игре: чей ход, кто отвечает, что делать. mine — мой голос за пак; null — нет такого режима */
export function jpPlate(v: QzView, me: QzMe, mine = -1, now = 0): PlateSpec | null {
  const jp = v.jp;
  if (!jp) return null;
  const ic = pic('bell');
  const swap = swapBtn(v, me);
  const host = isHost(jp, me);
  const j = me.jp;
  const q = jp.q ? `${esc(jp.q.theme)}${jp.q.price ? ` · <b>${jp.q.price}</b>` : ''}` : '';
  const nick = (slot: number): string => nickOf(jp, slot);
  const fin = jp.fin;
  switch (jp.step) {
    case 'setup':
      return host
        ? mk(ev({ ic, title: 'Ты ведёшь «Свою игру»', sub: 'выбери пак и темы', actions: '<button type="button" class="k-btn k-btn--go k-btn--sm" data-qz="winopen">Пак и темы</button><button type="button" class="k-btn k-btn--ghost k-btn--sm" data-qz="jpZat">Пусть ведёт Затейник</button>' }), { lamp: true })
        : mk(ev({ ic, title: `<b>${esc(jp.host?.nick ?? 'Ведущий')}</b> выбирает пак`, sub: 'темы и раунд — у ведущего', side: swap }));
    case 'packvote':
      return { key: PLATE_KEY, prio: PRIO.vote, html: ev({ ic, title: 'Какой пак?', actions: packButtons(jp, mine) }) };
    case 'pick':
      return jp.turn === me.slot && isPlayer(me)
        ? mk(ev({ ic, title: 'Твой ход', sub: 'выбери вопрос — клик по табло' }), { lamp: true })
        : mk(ev({ ic, title: `Ход: <b>${nick(jp.turn)}</b>`, sub: host ? 'ждём выбор клетки' : undefined, side: swap }));
    case 'cat':
      return j?.cat
        ? mk(ev({ ic, title: 'Кот в мешке!', sub: 'кому отдашь вопрос?', actions: giveButtons(jp, me) }), { lamp: true })
        : mk(ev({ ic, title: 'Кот в мешке', sub: `<b>${nick(jp.turn)}</b> выбирает, кому отдать`, side: swap }));
    case 'read':
      return mk(ev({ ic, title: q, sub: host ? 'читай вопрос вслух' : isPlayer(me) ? 'приготовься — кнопки скоро откроются' : 'читаем вопрос', side: swap }));
    case 'buzz':
      if (showing(jp)) return mk(ev({ ic, title: q, sub: host ? 'никто не жмёт — покажи ответ' : 'никто не жмёт', side: swap }));
      return mk(ev({ ic, title: q, sub: isPlayer(me) ? 'жми кнопку!' : 'кто успеет?', side: swap }));
    case 'answer':
      return jp.buzz?.slot === me.slot
        ? mk(ev({ ic, title: 'Ты отвечаешь' }), { lamp: true })
        : mk(ev({ ic, title: `<b>${esc(jp.buzz?.nick ?? '')}</b> отвечает`, sub: q || undefined, side: swap }), { lamp: true });
    case 'judge':
      return host
        ? mk(ev({ ic, title: 'Время вышло — реши', sub: jp.said ? `«${esc(cut(jp.said, 60))}»` : undefined }), { lamp: true })
        : mk(ev({ ic, title: 'Ведущий решает', sub: jp.buzz ? `ответ: <b>${esc(jp.buzz.nick)}</b>` : undefined, side: swap }));
    case 'wrong':
      return jp.buzz?.slot === me.slot && j?.canDispute
        ? mk(ev({ ic, title: 'Неверно', sub: 'не согласен — оспорь', actions: '<button type="button" class="k-btn k-btn--go k-btn--sm" data-qz="dispute">Оспорить</button>' }), { tone: 'danger' })
        : mk(ev({ ic, title: `Неверно: <b>${esc(jp.buzz?.nick ?? '')}</b>`, side: swap }), { tone: 'danger' });
    case 'dispute': {
      const d = jp.dispute;
      const sub = d ? `${esc(d.by.nick)}: «${esc(cut(jp.said, 50))}» · за ${d.yes} · против ${d.no}` : undefined;
      return j?.canJudgeDispute
        ? mk(ev({ ic, title: 'Засчитать ответ?', sub, actions: '<button type="button" class="k-btn k-btn--go k-btn--sm" data-qz="dv" data-ok="1">Засчитать</button><button type="button" class="k-btn k-btn--stop k-btn--sm" data-qz="dv" data-ok="0">Не засчитывать</button>' }), { lamp: true })
        : mk(ev({ ic, title: 'Игроки решают: засчитать?', sub, side: swap }));
    }
    case 'reveal':
      // B1: ответ — на табло; плашка говорит, что дальше
      return mk(ev({ ic, title: jpNext(jp, now), side: swap }), jp.verdict === 'yes' ? { tone: 'good' } : {});
    case 'fremove':
      return fin?.remover === me.slot
        ? mk(ev({ ic, title: 'Убери тему', sub: 'останется одна — по ней финал' }), { lamp: true })
        : mk(ev({ ic, title: 'Финал', sub: `<b>${nick(fin?.remover ?? 0)}</b> убирает тему`, side: swap }));
    case 'fbet':
      return isFinalist(me)
        ? mk(ev({ ic, title: 'Финал: тайная ставка', sub: `поставили ${fin?.bet.length ?? 0}` }), { lamp: true })
        : mk(ev({ ic, title: 'Финал', sub: 'игроки делают тайные ставки', side: swap }));
    case 'fanswer':
      return isFinalist(me) && !j?.fanswered
        ? mk(ev({ ic, title: 'Финал: твой ответ', sub: `ответили ${fin?.answered.length ?? 0} — пиши и отправляй` }), { lamp: true })
        : mk(ev({ ic, title: 'Финал', sub: `ответили ${fin?.answered.length ?? 0}`, side: swap }));
    case 'fjudge':
      return host ? mk(ev({ ic, title: 'Финал: оцени ответы' }), { lamp: true }) : mk(ev({ ic, title: 'Финал', sub: 'ведущий оценивает ответы', side: swap }));
    case 'freveal':
      return mk(ev({ ic, title: 'Финал: раскрываем ответы', side: swap }));
    default:
      return null;
  }
}

// ------------------------------------------------------------------ «Жму!» у игрока за пультом

export interface BuzzModel {
  /** вид кнопки: closed — кнопки ещё закрыты, open — жми, blocked — «Рано!», out — уже отвечал, wait — ждём */
  state: 'closed' | 'open' | 'blocked' | 'out' | 'wait';
  /** полоска: до открытия кнопок (closed) или сколько осталось нажать (open), 0…1 */
  p: number;
  note: string;
}

/** Кнопка «Жму!» (Пробел) внизу по центру: пока читают вопрос и пока кнопки открыты; null — не нужна */
export function buzzModel(v: QzView, me: QzMe, now: number): BuzzModel | null {
  const jp = v.jp;
  if (!jp || v.phase !== 'game' || !isPlayer(me) || (jp.step !== 'read' && jp.step !== 'buzz')) return null;
  const j = me.jp!;
  if (j.lockUntil > now) return { state: 'blocked', p: 0, note: 'Рано! Кнопка ждёт 1 с' };
  if (jp.step === 'read') return { state: 'closed', p: jp.total > 0 ? clamp01(1 - (jp.openAt - now) / jp.total) : 0, note: 'Пробел — когда загорится' };
  if (jp.out.includes(me.slot)) return { state: 'out', p: 0, note: 'ты уже отвечал — жмут остальные' };
  if (!j.canBuzz) return { state: 'wait', p: 0, note: showing(jp) ? 'никто не жмёт' : 'ждём' };
  return { state: 'open', p: jp.total > 0 ? clamp01((jp.endsAt - now) / jp.total) : 0, note: 'жми, пока не опередили' };
}

// ------------------------------------------------------------------ ответ, ставка, выбор темы (внизу по центру)

export interface AnswerModel {
  sig: string;
  /** jp — ответ на вопрос (поле открывается кнопкой), final — ответ в финале (поле сразу) */
  kind: 'jp' | 'final';
  note: string;
  /** сколько осталось, 0…1; подпись — mm:ss считает вид */
  p: number;
  /** ответ уже отправлен: поле убираем */
  sent: boolean;
}

/** Поле ответа: отвечающему на вопрос («Говори (V) или напиши») и игроку в финале; null — не нужно */
export function answerModel(v: QzView, me: QzMe, now: number): AnswerModel | null {
  const jp = v.jp;
  if (!jp || v.phase !== 'game') return null;
  const p = jp.total > 0 ? clamp01((jp.endsAt - now) / jp.total) : 0;
  if (jp.step === 'answer' && jp.buzz?.slot === me.slot && isPlayer(me)) {
    return { sig: `jp|${jp.q?.th}|${jp.q?.cell}`, kind: 'jp', note: jp.said ? `Ответ: «${cut(jp.said, 40)}»` : 'Говори (V) или напиши ответ', p, sent: !!jp.said };
  }
  if (jp.step === 'fanswer' && isFinalist(me)) {
    return { sig: 'fin', kind: 'final', note: me.jp?.fanswered ? 'Ответ отправлен — ждём остальных' : 'Ответь текстом — его увидит только ведущий', p, sent: !!me.jp?.fanswered };
  }
  return null;
}

export interface BetModel {
  sig: string;
  min: number;
  max: number;
  /** моя ставка (0 — не ставил) */
  bet: number;
}

/** Тайная ставка 1…счёт (финал, шаг fbet) */
export function betModel(v: QzView, me: QzMe): BetModel | null {
  const jp = v.jp;
  if (!jp || v.phase !== 'game' || jp.step !== 'fbet' || !isFinalist(me)) return null;
  const max = Math.max(1, myScore(jp, me));
  const bet = me.jp?.bet ?? 0;
  return { sig: `${max}|${bet}`, min: 1, max, bet };
}

/** Быстрые ставки: минимум, половина, всё */
export const betQuick = (m: BetModel, k: 'min' | 'half' | 'all'): number => (k === 'min' ? m.min : k === 'all' ? m.max : Math.max(m.min, Math.floor(m.max / 2)));

export interface DropModel {
  sig: string;
  themes: string[];
}

/** Убрать тему: кнопка на каждую оставшуюся (индекс — номер в списке fin.themes) */
export function dropModel(v: QzView, me: QzMe): DropModel | null {
  const jp = v.jp;
  if (!jp || v.phase !== 'game' || jp.step !== 'fremove' || !jp.fin || jp.fin.remover !== me.slot) return null;
  return { sig: jp.fin.themes.join('|'), themes: jp.fin.themes };
}

// ------------------------------------------------------------------ панель ведущего (справа внизу)

export interface HostModel {
  /** по ней вид решает, перерисовывать ли панель; время и счётчики сюда не входят */
  sig: string;
  html: string;
}

export interface HostState {
  /** сколько раз уже нажали «+5 с» на этом вопросе (дальше сервер не даёт) */
  moreUsed: number;
  /** «Завершить раунд» ждёт второго нажатия */
  endArmed: boolean;
}

/** «галочка» и «крестик» штрихами: глифов ✓ и ✗ в шрифте нет */
export const SVG_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
export const SVG_NO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const row = (html: string): string => `<div class="qz-host-row">${html}</div>`;
const btn = (cls: string, act: string, label: string, key = '', attrs = ''): string =>
  `<button type="button" class="k-btn ${cls} k-btn--sm" data-qz="${act}"${attrs}>${label}${key ? keyCap(key, 'tr') : ''}</button>`;

/** Панель ведущего-человека: вопрос, верный ответ и комментарий из пака, ✓ / ✗, «+5 с», «Показать ответ», просьбы на пульт,
 *  в финале — ответы игроков. null — ведёт Затейник или панель сейчас не нужна */
export function hostPanel(v: QzView, me: QzMe, st: HostState): HostModel | null {
  const jp = v.jp;
  if (!jp || v.phase !== 'game' || !isHost(jp, me) || jp.step === 'setup' || jp.step === 'packvote') return null;
  const h = me.jp?.host;
  const parts: string[] = [];
  const sig: string[] = [jp.step, String(jp.q?.th), String(jp.q?.cell), String(st.moreUsed), st.endArmed ? 'e' : '', jp.said];
  if (jp.q) {
    parts.push(`<p class="k-eyebrow">${esc(jp.q.theme)}${jp.q.price ? ` · ${jp.q.price}` : ''}</p>`);
    parts.push(`<p class="qz-host-q">${esc(contentText(jp.q.content))}</p>`);
  }
  if (h && jp.q && (jp.step === 'read' || jp.step === 'buzz' || jp.step === 'answer' || jp.step === 'judge')) {
    if (h.say.length) parts.push(`<p class="qz-host-say"><span class="k-faint">читай вслух:</span> ${esc(h.say.join(' '))}</p>`);
    if (h.catTheme) parts.push(`<p class="qz-host-say"><span class="k-faint">тема «кота»:</span> ${esc(h.catTheme)}</p>`);
    const rest = h.answers.slice(1);
    parts.push(`<div class="qz-host-a"><span class="k-faint">Ответ</span><b>${esc(h.answers[0] ?? '— нет ответа в паке —')}</b>`
      + (rest.length ? `<span class="k-faint">принимается: ${esc(rest.join(', '))}</span>` : '')
      + (h.wrong.length ? `<span class="qz-host-wrong">не принимается: ${esc(h.wrong.join(', '))}</span>` : '')
      + (h.comment ? `<span class="k-faint">${esc(cut(h.comment, 140))}</span>` : '') + '</div>');
    sig.push(h.answers.join('/'), h.wrong.join('/'), h.comment);
  }
  if (jp.said && (jp.step === 'answer' || jp.step === 'judge')) parts.push(`<p class="qz-host-said">Игрок: <b>«${esc(jp.said)}»</b></p>`);
  switch (jp.step) {
    case 'read':
      parts.push(row(btn('k-btn--go', 'jpOpen', 'Открыть кнопки', 'Пробел')));
      break;
    case 'buzz':
      parts.push(showing(jp) ? row(btn('k-btn--go', 'jpShow', 'Показать ответ', 'R')) : '<p class="k-faint qz-host-wait">кнопки открыты — жмут игроки</p>');
      break;
    case 'answer':
    case 'judge':
      parts.push(row(btn('k-btn--go', 'jpJudge', 'Верно', '1', ' data-ok="1"') + btn('k-btn--stop', 'jpJudge', 'Неверно', '2', ' data-ok="0"')));
      if (jp.step === 'answer') parts.push(row(btn('k-btn--ghost', 'jpMore', '+5 с', '', st.moreUsed >= QZ_JP.MORE_MAX ? ' disabled' : '')));
      break;
    case 'fjudge': {
      const list = me.jp?.fanswers ?? [];
      parts.push(`<div class="qz-host-fin">${list.map((a) => `<div class="qz-host-fa"><span><b>${esc(a.nick)}</b> ${esc(a.text || '— нет ответа —')}</span>`
        + `<span class="qz-host-ok"><button type="button" class="k-btn k-btn--go k-btn--sm${a.ok === 'yes' ? ' is-on' : ''}" data-qz="fjudge" data-slot="${a.slot}" data-ok="1" aria-label="Верно">${SVG_OK}</button>`
        + `<button type="button" class="k-btn k-btn--stop k-btn--sm${a.ok === 'no' ? ' is-on' : ''}" data-qz="fjudge" data-slot="${a.slot}" data-ok="0" aria-label="Неверно">${SVG_NO}</button></span></div>`).join('')}</div>`);
      sig.push(list.map((a) => `${a.slot}${a.ok}${a.text}`).join('|'));
      break;
    }
    default:
      if (jp.step === 'pick' || jp.step === 'cat') parts.push(`<p class="k-faint qz-host-wait">ждём: ${nickOf(jp, jp.turn)}</p>`);
  }
  for (const a of v.jp?.asks ?? []) {
    parts.push(`<div class="qz-host-ask"><span><b>${esc(a.nick)}</b> просит пульт</span><span>`
      + `<button type="button" class="k-btn k-btn--go k-btn--sm" data-qz="seat" data-slot="${a.slot}" data-ok="1">Посадить</button>`
      + `<button type="button" class="k-btn k-btn--ghost k-btn--sm" data-qz="seat" data-slot="${a.slot}" data-ok="0">Не надо</button></span></div>`);
    sig.push(`ask${a.slot}`);
  }
  if (jp.round && !jp.fin) parts.push(row(`<button type="button" class="k-btn ${st.endArmed ? 'k-btn--stop' : 'k-btn--ghost'} k-btn--sm" data-qz="jpEnd" title="Закончить раунд для всех">${st.endArmed ? 'Точно завершить?' : 'Завершить раунд'}</button>`));
  return { sig: sig.join('~'), html: `<div class="k-plate qz-host">${parts.join('')}</div>` };
}

/** «Рано!» и подобное: сколько игроков за пультами — для подписи на вызове ролей */
export const playersText = (n: number): string => `${n} ${plural(n, 'игрок', 'игрока', 'игроков')}`;
