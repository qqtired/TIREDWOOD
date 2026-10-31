// «Ракушка», HUD: что показывать по снимку — чистые функции без DOM (их проверяет test/quiz-ui.test.ts).
// Плашка сверху, полосы внизу (роли, «Сыграем?»), строки дока «В игру», карточка «Тепло», ряд клавиш загадывающего.
// Разметку строкой кладёт hud.ts в слоты кита; чужой текст (ники, слова) — только через esc(). Тексты — «на ты», без эмодзи.
// Нельзя подключать kit/dom.ts и kit/icons.ts (import.meta.glob): этот файл грузят Node-тесты. Значки — через paint.ts.
import { COIN_HTML } from '../../../ui/coin.ts';
import { PRIO, escHtml as esc } from '../../../ui/kit/topcenter.ts';
import {
  QZ, QZ_MODES, type QuizMode, type QzLine, type QzMe, type QzMark, type QzRole, type QzView,
} from '../../../../shared/quiz/types.ts';
import { leftSec, mmss, nickTone, quizImgUrl } from './paint.ts';

export { esc };

/** Ключ плашки «Ракушки» в верх-центре (префикс режима qz-) */
export const PLATE_KEY = 'qz-plate';

/** «Мимо» у остальных тает за столько (у загадывающего держится MISS_UNDO_MS с «↩ Вернуть») */
export const MISS_GUESS_MS = 1800;
/** Строка «мимо» гаснет ещё столько после срока, потом уходит */
export const FADE_MS = 600;
/** Строк в доке «В игру» — не больше (неотмеченные с кнопками остаются) */
export const DOCK_ROWS = 6;
/** В карточке «Тепло» на виду — последние столько строк, остальные «ещё N» */
export const WARM_SHOWN = 5;

export const COIN_K = COIN_HTML.replace('class="coin"', 'class="k-coin"');

/** Клавиша-колпачок (как keyHtml кита): corner — в углу родителя */
export const keyCap = (k: string, corner?: 'tr' | 'tl', size: 'sm' | '' = 'sm'): string =>
  `<kbd class="k-key${size ? ` k-key--${size}` : ''}${corner ? ` k-key--${corner}` : ''}">${esc(k)}</kbd>`;

/** Картинка по id (значок кита или «тепло / мимо / угадал»); нет файла — пусто */
export const pic = (id: string, cls = ''): string => {
  const src = quizImgUrl(id);
  return src ? `<img${cls ? ` class="${cls}"` : ''} src="${src}" alt="" draggable="false">` : '';
};

/** Класс цвета ника: тот же хеш, что у чата (client/chat.ts) */
export const nickClass = (nick: string): string => `k-nick-${nickTone(nick) + 1}`;

export const plural = (n: number, one: string, few: string, many: string): string => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};

/** Глаголы ролей: «Затейник выбрал: загадывает Петя» */
const VERB: Record<QzRole, string> = { riddler: 'загадывает', drawer: 'рисует', host: 'ведёт', player: 'играет' };
/** Кнопки вызова: подпись по роли («Хочу рисовать» — как на табло) */
const LABEL: Record<QzRole, string> = { riddler: 'Загадываю!', drawer: 'Хочу рисовать', host: 'Веду я', player: 'Играю' };
/** Вопрос на полосе ролей, когда вызов открыт для всех */
const ASK: Record<QuizMode, [string, string]> = {
  riddle: ['Кто загадывает первым?', 'Кто загадывает?'],
  croc: ['Кто рисует первым?', 'Кто рисует?'],
  jeopardy: ['Своя игра:', 'Своя игра:'],
  whoofus: ['Играют все в ограде', 'Играют все в ограде'],
};

// ------------------------------------------------------------------ плашка сверху

/** Что отдать TopCenter.event */
export interface PlateSpec {
  key: string;
  prio: number;
  html: string;
  tone?: 'good' | 'danger' | 'special';
  lamp?: boolean;
}

export interface EvOpts {
  /** внутри кружка слева (готовая разметка <img>) */
  ic?: string;
  title: string;
  sub?: string;
  /** кольцо времени справа: доля 0…1, подпись, красное в последнюю минуту */
  ring?: { p: number; text: string; hurry: boolean };
  /** своё справа (кнопки голосования, «Сменить игру?») — в третьей колонке; рядом с кольцом не бывает */
  side?: string;
  /** строка кнопок под заголовком */
  actions?: string;
}

/** Содержимое .k-event: узлы верхнего уровня TopCenter обновляет по одному, так что кнопки живут между тиками таймера */
export function ev(o: EvOpts): string {
  const p = Math.round(Math.min(1, Math.max(0, o.ring?.p ?? 0)) * 1000) / 1000;
  return `<span class="k-event-ic">${o.ic ?? ''}</span><span class="k-event-title">${o.title}</span>`
    + (o.sub ? `<span class="k-event-sub">${o.sub}</span>` : '')
    + (o.ring ? `<span class="k-event-timer qz-ring-wrap"><span class="k-ring k-ring--sm qz-ring${o.ring.hurry ? ' is-hurry' : ''}" style="--p:${p}"><b>${esc(o.ring.text)}</b></span></span>` : '')
    + (o.side ? `<span class="qz-side">${o.side}</span>` : '')
    + (o.actions ? `<span class="k-event-actions">${o.actions}</span>` : '');
}

/** «Сменить игру?» — маленькая кнопка на плашке, пока идёт игра: счёт «нажало / нужно» */
export function swapBtn(v: QzView, me: QzMe): string {
  if (v.phase !== 'game' || !v.swap || !me.canSwap) return '';
  const n = v.swap.n;
  return `<button type="button" class="k-btn k-btn--ghost k-btn--sm qz-swap${me.swap ? ' is-on' : ''}" data-qz="swap" title="Большинство сидящих за — новое голосование">Сменить игру?${n ? ` <b>${n}/${v.swap.need}</b>` : ''}</button>`;
}

/** «Пак понравился» на итогах «Своей игры»: только у тех, кто играл (место больше нуля); один раз на пак (отметку держит HUD, сервер тоже считает один раз) */
export function likeButton(v: QzView, me: QzMe, liked: ReadonlySet<string> = new Set()): string {
  const pack = v.phase === 'results' ? v.results?.pack : undefined;
  if (!pack || !me.result || me.result.place <= 0) return '';
  const done = liked.has(pack.id);
  return `<button type="button" class="k-btn k-btn--ghost k-btn--sm qz-swap${done ? ' is-on' : ''}" data-qz="like" data-pack="${esc(pack.id)}"${done ? ' disabled' : ''} title="Скажи спасибо автору пака">${pic('heart', 'k-ic')}${done ? 'Спасибо!' : 'Пак понравился'}</button>`;
}

/** Четыре кнопки голосования: значок режима и колпачок с цифрой; мой выбор подсвечен, серые не нажимаются */
export function voteButtons(v: QzView, me: QzMe): string {
  const vote = v.vote;
  if (!vote) return '';
  return vote.options.map((o, i) => {
    const m = QZ_MODES[i];
    if (!m) return '';
    const tip = o.off ? `${m.name}: ${o.off}` : `${i + 1} — ${m.name}`;
    return `<button type="button" class="qz-vbtn${me.vote === i ? ' is-mine' : ''}" data-qz="vote" data-i="${i}"${o.off ? ' disabled' : ''} title="${esc(tip)}" aria-label="${esc(m.name)}">${pic(m.icon, 'qz-vbtn-ic')}${keyCap(String(i + 1), 'tl')}</button>`;
  }).join('');
}

/** Плашка сверху: одна на всю «Ракушку»; null — убрать. Время считается по часам сервера now */
export function plateSpec(v: QzView, me: QzMe, now: number, armed = false, liked?: ReadonlySet<string>): PlateSpec | null {
  const mode = QZ_MODES.find((m) => m.id === v.mode) ?? null;
  const modeIc = (): string => pic(mode?.icon ?? 'scroll');
  const mk = (html: string, extra: Partial<PlateSpec> = {}): PlateSpec => ({ key: PLATE_KEY, prio: PRIO.mode, html, ...extra });
  const swap = swapBtn(v, me);

  // F3: разминка с Затейником — у того, кто разминается; «Хватит» прямо на плашке, ответы — в чат «В игру»
  if (v.phase === 'idle' && v.warm && v.warm.who.slot === me.slot) {
    return mk(ev({ ic: pic('horn'), title: 'Разминка с Затейником', sub: `отвечай в чат ${keyCap('Enter')}`, side: '<button type="button" class="k-btn k-btn--ghost k-btn--sm" data-qz="warm" data-on="0">Хватит</button>' }));
  }

  if (v.phase === 'vote' && v.vote) {
    const vt = v.vote;
    if (vt.nobody) return mk(ev({ ic: pic('chat'), title: 'Никто не выбрал' }));
    if (vt.spin) return mk(ev({ ic: pic('roulette'), title: 'Ничья — колесо' }));
    if (vt.win >= 0) {
      const m = QZ_MODES[vt.win];
      // A1: победитель выбран кнопкой «Ещё раз!» — голосования не было, причины нет
      return mk(ev({ ic: pic(m?.icon ?? 'scroll'), title: `${vt.again ? 'Играем снова' : 'Играем'}: <b>${esc(m?.name ?? '')}</b>`, sub: vt.why && !vt.again ? esc(vt.why) : undefined }), { tone: 'good' });
    }
    // голосование — важнее прочего: видно и на паузе, кнопки нажимаются мышью
    return { key: PLATE_KEY, prio: PRIO.vote, html: ev({ ic: pic('scroll'), title: 'Во что играем?', side: voteButtons(v, me) }) };
  }

  const call = v.call;
  if (call && (v.phase === 'roles' || v.phase === 'game')) {
    const toMe = call.to?.slot === me.slot;
    const who = esc(call.to?.nick ?? '');
    if (call.by === 'open') {
      if (v.mode === 'riddle') return mk(ev({ ic: modeIc(), title: ASK.riddle[1] }));
      return mk(ev({ ic: modeIc(), title: `Играем: <b>${esc(mode?.name ?? '')}</b>`, sub: 'выбери роль внизу' }));
    }
    if (call.by === 'solver') {
      return toMe ? mk(ev({ ic: modeIc(), title: 'Твоя очередь загадывать' }), { lamp: true })
        : mk(ev({ ic: modeIc(), title: `Дальше загадывает <b>${who}</b>` }));
    }
    return toMe ? mk(ev({ ic: modeIc(), title: 'Загадываешь ты', sub: 'Затейник выбрал тебя' }), { lamp: true })
      : mk(ev({ ic: modeIc(), title: `Затейник выбрал: ${VERB[call.role]} <b>${who}</b>` }));
  }

  if (v.phase === 'roles') return mk(ev({ ic: modeIc(), title: `Играем: <b>${esc(mode?.name ?? '')}</b>` }), { tone: 'good' });

  const R = v.riddle;
  if (v.phase === 'game' && v.mode === 'riddle' && R) {
    const meRid = me.role === 'riddler';
    const rid = esc(R.riddler?.nick ?? '');
    switch (R.step) {
      case 'ask':
        return meRid
          ? mk(ev({ ic: pic('scroll'), title: 'Загадываешь ты', sub: 'придумай слово', actions: `<button type="button" class="k-btn k-btn--go k-btn--sm" data-qz="askopen">Придумать слово</button>` }), { lamp: true })
          : mk(ev({ ic: pic('scroll'), title: `<b>${rid}</b> придумывает слово`, side: swap }));
      case 'round': {
        if (!meRid) return mk(ev({ ic: pic('scroll'), title: `<b>${rid}</b> загадал`, side: swap }));
        // кольцо времени — только тому, кто стоит спиной к табло (загадывающему на сцене)
        const left = leftSec(R.endsAt, now);
        const word = me.word ? `: <b class="k-gold">${esc(me.word)}</b>` : '';
        return mk(ev({
          ic: pic('scroll'), title: `Ты загадал${word}`,
          ring: { p: R.total > 0 ? (R.endsAt - now) / R.total : 0, text: mmss(left), hurry: left <= QZ.HURRY_MS / 1000 },
          actions: `<button type="button" class="k-btn ${armed ? 'k-btn--go' : 'k-btn--ghost'} k-btn--sm" data-qz="giveup" title="Показать всем ответ и закончить загадку">${armed ? 'Точно открыть?' : 'Открыть ответ'}</button>${swap}`,
        }));
      }
      case 'check': {
        const c = R.checking;
        const sub = c ? `<b>${esc(c.nick)}</b> · «${esc(lineText(v, c.line))}»` : undefined;
        if (!meRid || !c) return mk(ev({ ic: pic('q-win'), title: 'Проверяем…', sub }), { lamp: true });
        const left = Math.max(0, Math.ceil((c.until - now) / 1000));
        return mk(ev({
          ic: pic('q-win'), title: 'Проверяем…', sub,
          ring: { p: (c.until - now) / QZ.CHECK_MS, text: String(left), hurry: false },
          actions: `<button type="button" class="k-btn k-btn--ghost k-btn--sm qz-cancel" data-qz="undo">Отменить${keyCap('Z', 'tr')}</button>`,
        }), { lamp: true });
      }
      case 'reveal': {
        // B1: итог (слово, кто угадал) — на табло; плашка говорит, что дальше
        const l = R.last;
        if (!l) return null;
        return mk(ev({ ic: pic(l.end === 'solved' ? 'q-win' : 'scroll'), title: riddleNext(v, me) }), l.end === 'solved' ? { tone: 'good', lamp: true } : {});
      }
      default:
        return null;
    }
  }

  if (v.phase === 'results' && v.results) {
    const r = me.result;
    const ic = pic(QZ_MODES.find((m) => m.id === v.results?.mode)?.icon ?? 'scroll');
    // ноль у всех — победителя и мест нет (сервер шлёт place 0, табло — «Без очков»)
    const none = (v.results.top[0]?.pts ?? 0) <= 0;
    // place 0 — ведущий, зритель без места или ноль у всех: в строке итога только жетоны, без места и очков
    if (r && r.place <= 0) {
      return mk(ev({ ic, title: r.tokens > 0 ? `Итоги: <b class="k-gold">+${r.tokens}</b> ${COIN_K}` : 'Игра окончена' }), { tone: r.tokens > 0 ? 'good' : undefined });
    }
    if (r) {
      const coins = r.tokens > 0 ? ` · +${r.tokens} ${COIN_K}` : '';
      return mk(ev({ ic, title: `Итоги: <b class="k-gold">${r.place}-е место</b>`, sub: `${r.pts} ${plural(r.pts, 'очко', 'очка', 'очков')}${coins}`, side: likeButton(v, me, liked) }), { tone: 'good' });
    }
    const top = v.results.top[0];
    return mk(ev({ ic, title: 'Игра окончена', sub: top && !none ? `Больше всех у ${esc(top.nick)}` : undefined }));
  }

  // «Своя игра», «Крокодил», «Кто из нас?»: их HUD — следующим заходом; здесь только название и «Сменить игру?»
  if (v.phase === 'game' && mode) return mk(ev({ ic: modeIc(), title: `<b>${esc(mode.name)}</b>`, side: swap }));
  return null;
}

/**
 * B1: что дальше после итога загадки (одна строка для плашки): кто загадывает следующим или что будет. Итог (слово, кто
 * угадал) показывает табло. Очередь «Хочу загадать» идёт первой, потом угадавший, иначе выбирает Затейник.
 */
/** Сыграна последняя загадка игры: дальше итоги, в очередь вставать поздно */
function riddleOver(R: NonNullable<QzView['riddle']>): boolean {
  const l = R.last;
  return !!l && (l.end === 'solved' || l.end === 'timeout') && R.num >= R.of;
}

export function riddleNext(v: QzView, me: QzMe): string {
  const R = v.riddle;
  const l = R?.last;
  if (!R || !l) return '';
  if (l.end === 'swap') return 'Меняем игру';
  if (l.end === 'empty') return 'Все ушли';
  const who = (w: { slot: number; nick: string }): string => (w.slot === me.slot ? 'Дальше загадываешь ты' : `Дальше загадывает <b>${esc(w.nick)}</b>`);
  if (riddleOver(R)) return 'Дальше — итоги игры';
  const q = R.queue?.[0];
  if (q) return who(q);
  if (l.end === 'solved' && l.solver) return who(l.solver);
  return 'Дальше выберет Затейник';
}

/** Текст строки по номеру — для подписи «Проверяем…» (в плашке: «Оля · «пароход»») */
function lineText(v: QzView, id: number): string {
  return v.riddle?.lines.find((l) => l.id === id)?.text ?? '';
}

// ------------------------------------------------------------------ полосы внизу

/** Полоса внизу по центру: разметка меняется только при смене sig, время — отдельным узлом */
export interface BarSpec {
  sig: string;
  html: string;
  /** подпись для узла .qz-roles-time; пусто — без отсчёта */
  time: string;
  hurry: boolean;
}

/** «Игры нет — Сыграем?»: сижу, внутри двое и больше, голосование ещё не открыли */
export function playBar(v: QzView, me: QzMe): BarSpec | null {
  if (v.phase !== 'idle' || !me.canPlay) return null;
  return {
    sig: 'play', time: '', hurry: false,
    html: `<div class="k-plate qz-turn qz-roles"><span class="qz-roles-t">Игры нет</span><button type="button" class="k-btn k-btn--go" data-qz="play">Сыграем?</button></div>`,
  };
}

/** Вызов роли: «Загадываю!» (F) мышью или клавишей; назначенному Затейником и угадавшему — ещё «Пропустить»; отсчёт до конца вызова */
export function rolesBar(v: QzView, me: QzMe, now: number): BarSpec | null {
  const call = v.call;
  if (!call || (v.phase !== 'roles' && v.phase !== 'game')) return null;
  // «Своя игра»: записавшийся «Играю» и ведущий остаются на полосе с «Передумал»; «Крокодил»: записавшийся — тоже
  const taken = call.taken ?? [];
  const queued = taken.some((t) => t.slot === me.slot);
  const hosting = v.mode === 'jeopardy' && me.role === 'host';
  if (!me.canTake && !queued && !hosting) return null;
  const toMe = call.to?.slot === me.slot;
  const roles = call.roles?.length ? call.roles : [call.role];
  let q = call.by === 'open' ? ASK[v.mode ?? 'riddle'][v.phase === 'roles' ? 0 : 1]
    : call.by === 'zat' ? 'Затейник выбрал тебя' : 'Твоя очередь';
  if (call.by === 'open' && taken.length) q += ` записались ${taken.length}`;
  // первая кнопка — «зелёная» с F; своя уже нажатая роль заменяется на «Передумал»
  const btns = roles.map((r, j) => {
    const mine = r === 'host' ? hosting : queued;
    if (mine) return `<button type="button" class="k-btn k-btn--ghost" data-qz="role" data-r="${r}" data-take="0">${r === 'host' ? 'Не веду' : 'Передумал'}</button>`;
    if (hosting || (queued && r === 'drawer')) return '';
    return `<button type="button" class="k-btn ${j === 0 ? 'k-btn--go' : 'k-btn--ghost'}" data-qz="role" data-r="${r}">${LABEL[r]}${j === 0 ? keyCap('F', 'tr') : ''}</button>`;
  }).join('');
  const skip = call.by !== 'open' && toMe ? `<button type="button" class="k-btn k-btn--ghost" data-qz="skip">Пропустить</button>` : '';
  const left = leftSec(call.endsAt, now);
  return {
    sig: `roles|${call.by}|${roles.join()}|${q}|${queued ? 1 : 0}${hosting ? 'h' : ''}`,
    time: call.endsAt > 0 ? mmss(left) : '',
    hurry: left <= 3,
    html: `<div class="k-plate qz-turn qz-roles${call.by === 'open' ? '' : ' qz-assigned'}"><span class="qz-roles-t">${esc(q)}</span>${btns}${skip}<span class="qz-roles-time"></span></div>`,
  };
}

// ------------------------------------------------------------------ «Ракушка» 1.1: «Ещё раз!», «Веду я», «Хочу загадать», разминка

/** A1: на итогах «Ещё раз!» (R) со счётом «2 из 3»; нажал — «Ждём остальных» и «Передумал» (тоже R) */
export function againBar(v: QzView, me: QzMe): BarSpec | null {
  const a = v.again;
  if (v.phase !== 'results' || !a || !me.canAgain) return null;
  const on = !!me.again;
  return {
    sig: `again|${on ? 1 : 0}`, time: `${a.n} из ${a.need}`, hurry: false,
    html: `<div class="k-plate qz-turn qz-roles qz-again${on ? ' is-on' : ''}"><span class="qz-roles-t">${on ? 'Ждём остальных' : 'Сыграем ещё раз?'}</span>`
      + `<button type="button" class="k-btn ${on ? 'k-btn--ghost' : 'k-btn--go'}" data-qz="again">${on ? 'Передумал' : 'Ещё раз!'}${keyCap('R', 'tr')}</button>`
      + '<span class="k-pill k-pill--gold k-pill--sm qz-roles-time"></span></div>',
  };
}

/** A2: «Своя игра», выбор пака залом: можно стать ведущим самому — «Веду я» (F; у трибуны — E) */
export function hostBar(v: QzView, me: QzMe): BarSpec | null {
  if (v.phase !== 'game' || v.mode !== 'jeopardy' || v.jp?.step !== 'packvote' || !me.jp?.canHost) return null;
  return {
    sig: 'host', time: '', hurry: false,
    html: `<div class="k-plate qz-turn qz-roles"><span class="qz-roles-t">Хочешь вести сам?</span><button type="button" class="k-btn k-btn--go" data-qz="hostTake">Веду я${keyCap('F', 'tr')}</button></div>`,
  };
}

/** F3: игры нет, я один сижу — «Разминка с Затейником» (F). Идёт разминка — «Хватит» на плашке сверху */
export function warmBar(v: QzView, me: QzMe): BarSpec | null {
  if (v.phase !== 'idle' || !me.canWarm || v.warm) return null;
  return {
    sig: 'warm', time: '', hurry: false,
    html: `<div class="k-plate qz-turn qz-roles"><span class="qz-roles-t">Игры нет</span><button type="button" class="k-btn k-btn--go" data-qz="warm" data-on="1">Разминка с Затейником${keyCap('F', 'tr')}</button></div>`,
  };
}

/** A3: «Загадка» у всех, кто не загадывает: «Хочу загадать» (F) → очередь → «приготовь слово» → «Слово готово». Вызов открыт мне — полоса ролей */
export function queueBar(v: QzView, me: QzMe): BarSpec | null {
  const R = v.riddle;
  if (v.phase !== 'game' || v.mode !== 'riddle' || !R || me.role === 'riddler' || me.canTake) return null;
  if (R.step === 'reveal' && riddleOver(R)) return null; // последняя загадка сыграна — очередь уже не нужна
  const pos = me.queuePos ?? 0;
  if (!pos) {
    if ((R.queue?.length ?? 0) >= QZ.QUEUE_MAX) return null;
    const guessing = R.step === 'round' || R.step === 'check';
    return {
      sig: `queue|0|${guessing ? 1 : 0}`, time: '', hurry: false,
      html: `<div class="k-plate qz-turn qz-roles qz-queue2"><span class="qz-roles-t">${guessing ? `Пиши догадки${keyCap('Enter')}` : 'Хочешь загадать?'}</span>`
        + `<button type="button" class="k-btn k-btn--ghost" data-qz="queue" data-take="1">Хочу загадать${keyCap('F', 'tr')}</button></div>`,
    };
  }
  const prep = me.prep;
  const lead = prep ? `Слово готово: <b class="qz-word-t">${esc(prep.word)}</b> <i class="k-pill k-pill--gold k-pill--xs">${pos === 1 ? 'следующий' : `${pos}-й`}</i>`
    : pos === 1 ? 'Ты следующий — приготовь слово' : `Ты в очереди ${pos}-м — приготовь слово`;
  return {
    sig: `queue|${pos}|${prep ? prep.word : ''}`, time: '', hurry: false,
    html: `<div class="k-plate qz-turn qz-roles qz-queue2 is-on"><span class="qz-roles-t">${lead}</span>`
      + `<button type="button" class="k-btn ${prep ? 'k-btn--ghost' : 'k-btn--go'}" data-qz="prep">${prep ? 'Изменить' : 'Слово'}${keyCap('F', 'tr')}</button>`
      + '<button type="button" class="k-btn k-btn--ghost" data-qz="queue" data-take="0">Выйти из очереди</button></div>',
  };
}

// ------------------------------------------------------------------ загадывающий: ряд клавиш и «Подсказка»

/** Ряд клавиш загадывающего: до первой отметки «1 тепло · 2 мимо · 3 угадал», потом «Z отменить» (тускнеет, когда нечего). Пока идёт проверка — нет ряда */
export function keysRow(used: boolean, canUndo: boolean, hot = false): string {
  // C1: неотмеченных нет, а «тепло» свежее — вторым нажатием 1 оно станет «Горячо!»
  const hotKey = hot ? `<span class="mo-key">${keyCap('1', undefined, '')}<em>горячо</em></span>` : '';
  return used
    ? `${hotKey}<span class="mo-key${canUndo ? '' : ' is-off'}">${keyCap('Z', undefined, '')}<em>отменить</em></span>`
    : `<span class="mo-key">${keyCap('1', undefined, '')}<em>тепло</em></span><span class="mo-key">${keyCap('2', undefined, '')}<em>мимо</em></span><span class="mo-key">${keyCap('3', undefined, '')}<em>угадал</em></span>`;
}

/** Кнопка «Подсказка 1/3» с колпачком H */
export function hintLabel(hintsLeft: number): string {
  const used = Math.max(0, QZ.HINTS - hintsLeft);
  return `<span class="k-row-line">Подсказка <span class="k-faint">${used}/${QZ.HINTS}</span></span>${keyCap('H', 'tr')}`;
}

// ------------------------------------------------------------------ док «В игру»

/** Строка дока */
export interface DockRow {
  id: number;
  /** что изменилось в строке — по нему hud-dock.ts решает, перерисовывать ли её */
  sig: string;
  nick: string;
  text: string;
  own: boolean;
  /** реплика Затейника — без ника, курсивом */
  sys: boolean;
  /** «Крокодил»: «Петя угадал!» — строка без ника с галочкой */
  got?: boolean;
  mark: QzMark;
  /** у загадывающего: кнопки 👍 👎 ✓ */
  buttons: boolean;
  /** колпачки 1/2/3 — у самой старой неотмеченной */
  caps: boolean;
  /** «похоже на ответ» (одна-две опечатки) */
  near: boolean;
  /** «↩ Вернуть» на строке «мимо» */
  undo: boolean;
  /** «мимо» вышел срок, строка гаснет (класс вешается на готовую строку — переход виден) */
  fade: boolean;
}

export interface DockModel {
  rows: DockRow[];
  /** неотмеченных больше пяти: «ещё N ждут отметки» (только у загадывающего) */
  waiting: number;
}

/**
 * Строки дока по строкам снимка. «Тепло» живёт в карточке, не в доке; свои догадки угадывающего — в плашке над чатом
 * (ownGuess), не здесь. «Мимо» у остальных тает за 1,8 с, у загадывающего держится 5 с с «↩ Вернуть». У загадывающего
 * не больше пяти неотмеченных с кнопками, остальные ждут (waiting).
 */
export function dockModel(lines: readonly QzLine[], me: QzMe, now: number, riddler: boolean, checking: boolean): DockModel {
  const near = new Set(me.near ?? []);
  const hold = riddler ? QZ.MISS_UNDO_MS : MISS_GUESS_MS;
  const sorted = [...lines].sort((a, b) => a.at - b.at || a.id - b.id);
  const unmarked = sorted.filter((l) => l.kind === 'guess' && l.mark === '' && !l.only);
  let oldest: QzLine | null = null;
  for (const l of unmarked) if (!oldest || l.at < oldest.at) oldest = l;
  const withBtn = new Set(riddler ? unmarked.slice(0, QZ.DOCK_UNMARKED).map((l) => l.id) : []);
  const rows: DockRow[] = [];
  for (const l of sorted) {
    if (l.only || l.kind === 'got' || l.mark === 'warm' || l.mark === 'hot') continue;
    if (!riddler && l.kind === 'guess' && l.slot === me.slot) continue;
    // неотмеченная сверх пяти — ждёт в очереди
    if (riddler && l.kind === 'guess' && l.mark === '' && !withBtn.has(l.id)) continue;
    let fade = false;
    if (l.mark === 'miss') {
      const age = now - l.markedAt;
      if (age >= hold + FADE_MS) continue;
      fade = age >= hold;
    }
    const buttons = withBtn.has(l.id) && l.slot !== me.slot;
    const caps = buttons && oldest?.id === l.id && !checking;
    const isNear = buttons && near.has(l.id);
    const undo = riddler && l.mark === 'miss' && !checking;
    rows.push({
      id: l.id, nick: l.nick, text: l.text, own: l.slot === me.slot, sys: l.kind === 'zat', mark: l.mark,
      buttons, caps, near: isNear, undo, fade,
      sig: `${l.mark}|${buttons ? 1 : 0}${caps ? 1 : 0}${isNear ? 1 : 0}${undo ? 1 : 0}|${l.slot === me.slot ? 1 : 0}|${l.nick}|${l.text}`,
    });
  }
  // не больше DOCK_ROWS: лишнее уходит сверху, но строки с кнопками остаются
  while (rows.length > DOCK_ROWS) {
    const i = rows.findIndex((r) => !r.buttons);
    rows.splice(i < 0 ? 0 : i, 1);
  }
  const waiting = riddler ? Math.max(0, unmarked.length - QZ.DOCK_UNMARKED) : 0;
  return { rows, waiting };
}

// ------------------------------------------------------------------ карточка «Тепло»

export interface WarmModel {
  /** строки карточки: «Горячо!» первыми, потом «тепло» по времени отметки; shown — на виду, остальные «ещё N» */
  rows: Array<{ id: number; nick: string; text: string; hot: boolean; shown: boolean }>;
  /** сколько скрыто («ещё N») */
  more: number;
  hints: string[];
}

export function warmModel(v: QzView): WarmModel {
  const R = v.riddle;
  const byTime = (a: QzLine, b: QzLine): number => a.markedAt - b.markedAt || a.id - b.id;
  const lines = R?.lines ?? [];
  const hot = lines.filter((l) => l.mark === 'hot').sort(byTime);
  const warm = lines.filter((l) => l.mark === 'warm').sort(byTime);
  // на виду WARM_SHOWN строк: свежие «Горячо!», остальное место — свежие «тепло»
  const showHot = new Set(hot.slice(-WARM_SHOWN).map((l) => l.id));
  const showWarm = new Set(warm.slice(Math.max(0, warm.length - Math.max(0, WARM_SHOWN - showHot.size))).map((l) => l.id));
  const rows = [...hot, ...warm].map((l) => ({ id: l.id, nick: l.nick, text: l.text, hot: l.mark === 'hot', shown: showHot.has(l.id) || showWarm.has(l.id) }));
  return { rows, more: rows.filter((r) => !r.shown).length, hints: R?.hints ?? [] };
}

/** Карточка «Тепло» нужна всем внутри, пока угадывают (раунд и проверка) */
export function warmVisible(v: QzView): boolean {
  const s = v.riddle?.step;
  return v.phase === 'game' && v.mode === 'riddle' && (s === 'round' || s === 'check');
}

/** Загадывающий на раунде — ему нужны кнопки отметок, «Подсказка» и «✕» в «Тепло» */
export function isRiddling(v: QzView, me: QzMe): boolean {
  const s = v.riddle?.step;
  return me.role === 'riddler' && v.phase === 'game' && (s === 'round' || s === 'check');
}

// ------------------------------------------------------------------ моя последняя догадка (угадывающему)

/** Статус своей догадки живёт столько после последней перемены (как облачко над головой) */
export const OWN_SHOW_MS = 6000;
/** Длина текста в статусе — как у облачка, до ~40 знаков */
export const OWN_TEXT_MAX = 40;
/** Подпись отметки: тон тот же, что у облачка (новое / тепло / мимо / проверка / угадал) */
export const OWN_TAG: Record<QzMark, string> = { '': 'отправлено', warm: 'тепло', hot: 'горячо!', miss: 'мимо', check: 'проверяем…', win: 'угадал!' };

export interface OwnGuess {
  id: number;
  text: string;
  mark: QzMark;
  /** когда строка или её отметка менялись в последний раз (часы сервера) */
  at: number;
}

/**
 * Моя последняя догадка «В игру» с отметкой — из строк снимка (свои по номеру места, без новых полей протокола).
 * Сидящий в кресле не видит своё облачко (камера за спинкой), поэтому отметку показывает HUD. Загадывающему не нужно.
 */
export function ownGuess(v: QzView, me: QzMe): OwnGuess | null {
  const R = v.riddle;
  if (!R || v.phase !== 'game' || me.role === 'riddler') return null;
  let best: QzLine | null = null;
  for (const l of R.lines) if (l.slot === me.slot && l.kind === 'guess' && (!best || l.at > best.at || (l.at === best.at && l.id > best.id))) best = l;
  return best ? { id: best.id, text: best.text, mark: best.mark, at: Math.max(best.at, best.markedAt) } : null;
}

/** Текст для статуса: не длиннее OWN_TEXT_MAX */
export const ownText = (t: string): string => (t.length > OWN_TEXT_MAX ? `${t.slice(0, OWN_TEXT_MAX - 1).trimEnd()}…` : t);
