// Панель стола дурака — HTML поверх 3D (мышь за столом отпущена):
// сверху — стол, режим, козырь, колода, бито и игроки по кругу (кто ходит, кто отбивается, сколько карт, таймер);
// до партии — режим, места, «Готов», боты и короткие правила; в партии — рука, кнопки «Беру» / «Бито» / «Пас» /
// «Перевести» и подсказка, что делать; справа — «Встать», реакции и помидор; итог партии; вопрос перед выходом.
import { TICK_MS } from '../../shared/constants.ts';
import {
  DK_REACT_TICKS, DK_TAKE_TICKS, DK_TOMATO_TICKS, DK_TURN_TICKS, MODE_NAMES, RANK_NAMES, REACTIONS, SUIT_SIGNS,
  canPass, canTake, canTransfer, fromView, movesFor, rankOf, suitOf, type Durak, type DurakMove, type DurakView,
} from '../../shared/durak.ts';
import type { DurakAct, DurakTableView } from '../../shared/messages.ts';
import { CARD_ATLAS, cardAtlasCanvas, tomatoSplatCanvas } from '../render/textures.ts';
import { TOUCH } from '../touch.ts';
import './durak.css';

const TURN_MS = DK_TURN_TICKS * TICK_MS;
const TAKE_MS = DK_TAKE_TICKS * TICK_MS;
const REACT_MS = DK_REACT_TICKS * TICK_MS;
const TOMATO_MS = DK_TOMATO_TICKS * TICK_MS;
/** Свой ход «улетел» на сервер: карта притушена, пока не придёт ответ (или не выйдет время) */
const PENDING_MS = 900;
/** Реакция у ника на панели и клякса помидора на экране — сколько живут (как анимации в CSS) */
const REACT_SHOW_MS = 2400;
const SPLAT_MS = 4200;
/** Рука: ширина карты и сколько места на всю руку (не шире экрана) */
const CARD_PX = 76;
const HAND_MAX_PX = 760;
/** Телефон (узкий или невысокий экран): карты мельче — как в CSS (@media max-width 560px / max-height 480px) */
const CARD_SMALL_PX = 58;
const SMALL_W = 560;
const SMALL_H = 480;
/** Невысокий экран: подсказка и кнопки — слева от руки (как в CSS), руке остаётся экран без этой колонки */
const SAY_COL_PX = 224;
/** Масти в руке: чёрная, красная, чёрная, красная — легче различать; козыри — последними */
const SUIT_ORDER = [0, 2, 1, 3];
const RULES = [
  'Цель — первым избавиться от карт. Последний с картами — <b>дурак</b> 🃏.',
  'Ходящий кладёт любую карту. Отбиваются старшей той же масти или козырем.',
  'Подкидывают все, кроме отбивающегося, — только достоинства, которые уже на столе. В отбое до 6 карт, в первом — до 5.',
  'Не отбиться — «Беру»: заберёшь всё со стола и пропустишь ход. Всё отбито — «Бито», отбивавшийся ходит следующим.',
  'Переводной: пока ничего не отбито, положи карту того же достоинства — отбиваться будет следующий.',
  'После отбоя все добирают из колоды до шести. Козырь — масть карты под колодой.',
  'Играть можно бесплатно. Для ставки выбери «Со ставкой» и подтверди готовность: жетоны списываются только перед раздачей.',
  'Банк получает только первый вышедший, если он поставил. Если первым вышел бесплатный игрок или бот, либо ничья — ставки возвращаются. Бесплатная игра не даёт жетонов или опыта.',
];

/** Положение карты в атласе (CSS background-position) */
function atlasPos(c: number): string {
  const A = CARD_ATLAS;
  const bx = ((c % A.cols) / (A.cols - 1)) * 100;
  const by = (Math.floor(c / A.cols) / (A.rows - 1)) * 100;
  return `${bx.toFixed(3)}% ${by.toFixed(3)}%`;
}

/** Карта текстом: «Д♥» с цветом масти (︎ — чтобы масть не стала цветным эмодзи). */
function cardText(c: number): string {
  const s = suitOf(c);
  return `<b class="${s >= 2 ? 'red' : 'black'}">${RANK_NAMES[rankOf(c)]}${SUIT_SIGNS[s]}︎</b>`;
}

function suitText(s: number): string {
  return `<b class="${s >= 2 ? 'red' : 'black'}">${SUIT_SIGNS[s]}︎</b>`;
}

function esc(t: string): string {
  return t.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Кого ждёт стол (номера в партии): ходящего, отбивающегося или всех, кто ещё может подкинуть. */
function awaited(gv: DurakView): number[] {
  if (gv.waiting === 'lead') return [gv.attacker];
  if (gv.waiting === 'defend') return [gv.defender];
  if (gv.waiting !== 'throw' && gv.waiting !== 'take') return [];
  const list: number[] = [];
  for (let p = 0; p < gv.n; p++) if (p !== gv.defender && !gv.out.includes(p) && !gv.passed[p]) list.push(p);
  return list;
}

export class DurakHud {
  /** Действие за столом — на сервер */
  onAct: (a: DurakAct, card?: number, on?: number) => void = () => {};
  /** Встать из-за стола */
  onLeave: () => void = () => {};
  private readonly root: HTMLElement;
  private readonly topEl: HTMLElement;
  private readonly lobbyEl: HTMLElement;
  private readonly playEl: HTMLElement;
  private readonly sideEl: HTMLElement;
  private readonly resultEl: HTMLElement;
  private readonly confirmEl: HTMLElement;
  private readonly tomatoEl: HTMLElement;
  /** Последний HTML каждой части: одинаковый не перерисовываем (иначе клик может попасть между кадрами) */
  private readonly html = new Map<HTMLElement, string>();
  private table = -1;
  private chair = -1;
  private v: DurakTableView | null = null;
  private recvAt = 0;
  private cards: number[] = [];
  /** Состояние для проверки своих ходов (по виду и своей руке) и свой номер в партии */
  private g: Durak | null = null;
  private me = -1;
  private readonly moves = new Map<number, DurakMove[]>();
  private menuCard = -1;
  private pending = -1;
  private pendingUntil = 0;
  private reactAt = -1e9;
  private tomatoAt = -1e9;
  private confirmOpen = false;
  private rulesOpen = false;
  private resultKey = '';
  /** Краткий итог остаётся в лобби до следующей раздачи. */
  private resultSummary = '';

  constructor(parent: HTMLElement) {
    this.root = el('div', 'dk hidden');
    this.topEl = el('div', 'dk-top');
    this.lobbyEl = el('div', 'dk-lobby');
    this.playEl = el('div', 'dk-play');
    this.sideEl = el('div', 'dk-side');
    this.resultEl = el('div', 'dk-result');
    this.confirmEl = el('div', 'dk-confirm');
    this.sideEl.innerHTML =
      `<button class="dk-leave" data-a="leave">Встать <kbd>Esc</kbd></button>` +
      `<div class="dk-reacts">${REACTIONS.map((r, k) => `<button data-a="react" data-on="${k}" title="клавиша ${k + 1}"><kbd>${k + 1}</kbd>${r}</button>`).join('')}</div>` +
      `<div class="dk-tomato"></div>`;
    this.tomatoEl = this.sideEl.querySelector('.dk-tomato')!;
    this.confirmEl.innerHTML =
      `<div class="dk-cbox"><div class="dk-ct">Выйти из партии?</div><div class="dk-cs">Твои карты доиграет бот</div>` +
      `<div class="dk-cb"><button class="dk-btn warn" data-a="leave-yes">Выйти</button><button class="dk-btn" data-a="leave-no">Остаться</button></div></div>`;
    this.root.append(this.topEl, this.lobbyEl, this.playEl, this.sideEl, this.resultEl, this.confirmEl);
    this.root.style.setProperty('--atlas', `url(${cardAtlasCanvas().toDataURL('image/png')})`);
    this.root.style.setProperty('--splat', `url(${tomatoSplatCanvas().toDataURL('image/png')})`);
    this.root.addEventListener('click', (e) => this.onClick(e));
    // повернули телефон — рука под новую ширину
    window.addEventListener('resize', () => this.render());
    // кнопки не забирают фокус: иначе пробел или Enter нажмут «Беру» ещё раз
    this.root.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) e.preventDefault();
    });
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return this.table >= 0;
  }

  /** Сели за стол t на стул ch. */
  show(t: number, ch: number): void {
    if (t === this.table && ch === this.chair) return;
    this.table = t;
    this.chair = ch;
    this.cards = [];
    this.menuCard = -1;
    this.pending = -1;
    this.confirmOpen = false;
    this.rulesOpen = false;
    this.resultKey = '';
    this.resultSummary = '';
    this.root.classList.remove('hidden');
    this.render();
  }

  hide(): void {
    if (this.table < 0) return;
    this.table = -1;
    this.chair = -1;
    this.v = null;
    this.g = null;
    this.me = -1;
    this.root.classList.add('hidden');
    this.resultEl.classList.remove('show');
  }

  /** Новый вид своего стола (now — когда пришёл: от него считаем таймеры). */
  setView(v: DurakTableView, now: number): void {
    this.v = v;
    this.recvAt = now;
    this.pending = -1;
    this.render();
  }

  /** Своя рука с сервера. */
  setHand(cards: number[]): void {
    this.cards = cards;
    this.pending = -1;
    this.render();
  }

  /** Идёт партия, и у меня карты: шаг не поднимает, на выход — вопрос (карты доиграет бот). */
  get locked(): boolean {
    const v = this.v;
    const g = v?.game;
    return !!v && !!g && v.phase === 'play' && this.me >= 0 && !g.over && !g.out.includes(this.me);
  }

  /** Esc или E: сначала закрыть меню, правила, вопрос; потом — встать (из партии — через вопрос). */
  escape(): void {
    if (this.menuCard >= 0) {
      this.menuCard = -1;
      this.render();
    } else if (this.confirmOpen) {
      this.confirmOpen = false;
      this.render();
    } else if (this.rulesOpen) {
      this.rulesOpen = false;
      this.render();
    } else {
      this.askLeave();
    }
  }

  /** Клавиши: T — «Беру», B — «Бито» / «Пас». Не обработано — false. */
  onKey(code: string): boolean {
    if (this.table < 0 || this.confirmOpen || !this.g || this.me < 0 || this.v?.phase !== 'play') return false;
    if (code === 'KeyT' && canTake(this.g, this.me)) {
      this.onAct('take');
      return true;
    }
    if (code === 'KeyB' && canPass(this.g, this.me)) {
      this.onAct('pass');
      return true;
    }
    return false;
  }

  /** Реакция (клавиши 1–4). */
  react(k: number): void {
    const now = performance.now();
    if (now - this.reactAt < REACT_MS) return;
    this.reactAt = now;
    this.onAct('react', undefined, k);
  }

  /** Реакция игрока на стуле ch — всплывает у его ника (в партии — в полоске игроков, до неё — в местах). */
  showReact(ch: number, k: number): void {
    if (this.table < 0) return;
    const at = this.root.querySelector<HTMLElement>(`.dk-p[data-ch="${ch}"], .dk-lobby.show .dk-seat[data-ch="${ch}"]`);
    if (!at) return;
    const r = at.getBoundingClientRect();
    const box = this.root.getBoundingClientRect();
    const e = el('div', 'dk-rx');
    e.textContent = REACTIONS[k] ?? '';
    e.style.left = `${r.left - box.left + r.width / 2}px`;
    e.style.top = `${r.bottom - box.top}px`;
    this.root.appendChild(e);
    setTimeout(() => e.remove(), REACT_SHOW_MS);
  }

  /** Помидор прилетел в меня: клякса на весь экран, сползает и тает. */
  splat(): void {
    if (this.table < 0) return;
    const e = el('div', 'dk-splat');
    // чуть наклонить, но подтёки — вниз
    e.style.setProperty('--r', `${Math.round(Math.random() * 50 - 25)}deg`);
    e.style.left = `${40 + Math.random() * 20}%`;
    e.style.top = `${36 + Math.random() * 14}%`;
    this.root.appendChild(e);
    setTimeout(() => e.remove(), SPLAT_MS);
  }

  /** Можно бросить помидор (своя перезарядка совпадает с серверной). */
  tomatoReady(now: number): boolean {
    return now - this.tomatoAt >= TOMATO_MS;
  }

  tomatoSent(now: number): void {
    this.tomatoAt = now;
  }

  /** Раз в кадр: таймеры, полоски, перезарядка помидора. */
  tick(now: number): void {
    if (this.table < 0) return;
    const v = this.v;
    const left = v ? v.left - (now - this.recvAt) : 0;
    for (const t of this.root.querySelectorAll<HTMLElement>('[data-timer]')) t.textContent = clock(left);
    if (v?.phase === 'count') for (const c of this.root.querySelectorAll<HTMLElement>('[data-count]')) {
      c.textContent = String(Math.max(1, Math.ceil(left / 1000)));
    }
    if (v?.game) {
      const total = v.game.taking ? TAKE_MS : TURN_MS;
      const k = Math.max(0, Math.min(1, left / total));
      for (const b of this.root.querySelectorAll<HTMLElement>('[data-bar]')) b.style.width = `${(k * 100).toFixed(1)}%`;
      for (const a of this.root.querySelectorAll<HTMLElement>('[data-away]')) {
        const ms = Number(a.dataset.away) - (now - this.recvAt);
        a.textContent = String(Math.max(0, Math.ceil(ms / 1000)));
      }
    }
    if (this.pending >= 0 && now > this.pendingUntil) {
      this.pending = -1;
      this.render();
    }
    const wait = TOMATO_MS - (now - this.tomatoAt);
    const txt = wait > 0 ? `🍅 через ${Math.ceil(wait / 1000)} с` : TOUCH ? '🍅 нажми на желейку' : '🍅 клик по желейке';
    if (this.tomatoEl.textContent !== txt) {
      this.tomatoEl.textContent = txt;
      this.tomatoEl.classList.toggle('wait', wait > 0);
    }
  }

  // ------------------------------------------------------------ отрисовка

  private render(): void {
    if (this.table < 0) return;
    const v = this.v;
    const seat = v?.seats[this.chair];
    this.me = seat && seat.k === 1 ? seat.p : -1;
    this.g = null;
    this.moves.clear();
    const gv = v?.game ?? null;
    if (v && gv && this.me >= 0 && this.me < gv.n) {
      this.g = fromView(gv, this.me, this.cards);
      if (v.phase === 'play' && !gv.over) {
        for (const c of this.cards) {
          const ms = movesFor(this.g, this.me, c);
          if (ms.length) this.moves.set(c, ms);
        }
      }
    }
    if (this.menuCard >= 0 && !this.moves.has(this.menuCard)) this.menuCard = -1;
    this.renderResult();
    this.set(this.topEl, this.topHtml());
    const before = !v || v.phase === 'wait' || v.phase === 'count';
    const rematch = !!this.resultSummary && v?.phase !== 'play';
    this.root.classList.toggle('dk-rematch', rematch);
    this.lobbyEl.classList.toggle('show', before);
    this.playEl.classList.toggle('show', !before || rematch);
    this.playEl.classList.toggle('rematch', rematch);
    if (before) this.set(this.lobbyEl, this.lobbyHtml());
    if (rematch) this.set(this.playEl, this.rematchHtml());
    else if (!before) this.set(this.playEl, this.playHtml());
    this.confirmEl.classList.toggle('show', this.confirmOpen);
    this.tick(performance.now());
  }

  private set(e: HTMLElement, html: string): void {
    if (this.html.get(e) === html) return;
    this.html.set(e, html);
    e.innerHTML = html;
  }

  private topHtml(): string {
    const v = this.v;
    if (!v) return `<div class="dk-title">Стол ${this.table + 1}</div>`;
    const gv = v.game;
    let title = `Стол ${this.table + 1} · ${MODE_NAMES[v.mode]}`;
    if (v.bank) title += ` · банк ${v.bank} 🪙`;
    let html = `<div class="dk-title">${title}</div>`;
    if (gv) {
      // козырь — настоящей картой, под ней колода и бито числами
      const trump = gv.deck > 0
        ? `<i class="dk-tcard" style="background-position:${atlasPos(gv.trump)}" title="козырь"></i>`
        : suitText(suitOf(gv.trump));
      html = `<div class="dk-head">${html}<div class="dk-deck">козырь ${trump}<span>колода <b>${gv.deck}</b></span><span>бито <b>${gv.discard}</b></span></div></div>`;
    }
    if (!gv) return html;
    const wait = new Set(awaited(gv));
    const chips: string[] = [];
    for (let p = 0; p < gv.n; p++) {
      const ch = v.seats.findIndex((s) => s.p === p);
      const s = v.seats[ch];
      if (!s) continue;
      let ic = '';
      if (gv.over && gv.fool === p) ic += '🃏';
      else if (gv.out.includes(p)) ic += '🏁';
      else if (p === gv.attacker && !gv.over) ic += '⚔️';
      else if (p === gv.defender && !gv.over) ic += '🛡️';
      if (gv.passed[p] && !gv.out.includes(p)) ic += '✓';
      if (s.k === 2) ic += '🤖';
      const away = s.k === 1 && s.id === 0 && s.away > 0 ? `<span class="dk-away">💤<i data-away="${s.away}"></i></span>` : '';
      const cls = ['dk-p'];
      if (ch === this.chair) cls.push('me');
      if (wait.has(p)) cls.push('turn');
      if (gv.out.includes(p)) cls.push('out');
      if (gv.over && gv.fool === p) cls.push('fool');
      chips.push(
        `<div class="${cls.join(' ')}" data-ch="${ch}"><span class="dk-ic">${ic}</span><span class="dk-nick">${esc(s.nick)}</span>` +
        `<span class="dk-cnt">${gv.counts[p]}</span>${away}${wait.has(p) && v.phase === 'play' ? '<i class="dk-bar"><b data-bar></b></i>' : ''}</div>`,
      );
    }
    return html + `<div class="dk-players">${chips.join('')}</div>`;
  }

  private lobbyHtml(): string {
    const v = this.v;
    if (!v) return '';
    const mine = v.seats[this.chair];
    const chooser = v.modeBy >= 0 ? v.seats[v.modeBy] : null;
    const canMode = v.modeBy === this.chair;
    const modes = (['throw', 'transfer'] as const).map((m, i) =>
      `<button class="dk-mode${v.mode === m ? ' on' : ''}" data-a="mode" data-on="${i}"${canMode ? '' : ' disabled'}>${MODE_NAMES[m]}</button>`,
    ).join('');
    const note = canMode ? 'Режим выбираешь ты' : chooser && chooser.k === 1 ? `Режим выбирает ${esc(chooser.nick)}` : '';
    const seats = v.seats.map((s, ch) => {
      if (s.k === 0) return `<div class="dk-seat empty">свободно</div>`;
      const me = ch === this.chair ? ' me' : '';
      const mark = s.ready ? '<b class="ok">✓</b>' : '<b class="no">…</b>';
      return `<div class="dk-seat${me}" data-ch="${ch}">${s.k === 2 ? '🤖 ' : ''}${esc(s.nick)} ${mark}<small>${s.stake ? `ставка ${v.ante ?? 10}` : 'бесплатно'}</small></div>`;
    }).join('');
    const occupied = v.seats.filter((s) => s.k !== 0).length;
    const bots = v.seats.some((s) => s.k === 2);
    const ready = mine?.ready === true;
    let status: string;
    if (v.phase === 'count') status = `Начинаем через <b data-count>5</b>…`;
    else if (occupied < 2) status = 'Нужно хотя бы двое: позови друга или добавь бота';
    else status = this.resultSummary ? 'Каждый игрок подтверждает повтор отдельно' : 'Ждём, пока все нажмут «Готов»';
    const rules = this.rulesOpen ? `<ul class="dk-rules">${RULES.map((r) => `<li>${r}</li>`).join('')}</ul>` : '';
    // две колонки: слева — режим и места, справа — ставка, «Готов» и боты; стол за панелью остаётся виден
    return (
      `<div class="dk-lcol">` +
      `<div class="dk-lt">Дурак · стол ${this.table + 1}</div>` +
      (this.resultSummary ? `<div class="dk-note">${this.resultSummary}</div>` : '') +
      `<div class="dk-modes">${modes}</div>` +
      (note ? `<div class="dk-note">${note}</div>` : '') +
      `<div class="dk-seats">${seats}</div>` +
      `</div><div class="dk-lcol">` +
      this.stakeHtml(true) +
      `<div class="dk-lbtns">` +
      (this.resultSummary ? '' : `<button class="dk-btn big${ready ? ' on' : ''}" data-a="ready">${ready ? 'Готов ✓' : mine?.stake ? `Готов · ставка ${v.ante ?? 10}` : 'Готов · бесплатно'}</button>`) +
      `<button class="dk-btn" data-a="bot"${occupied >= 6 ? ' disabled' : ''}>+ бот</button>` +
      `<button class="dk-btn" data-a="unbot"${bots ? '' : ' disabled'}>− бот</button>` +
      `<button class="dk-btn ghost${this.rulesOpen ? ' on' : ''}" data-a="rules">Правила</button>` +
      `</div>` +
      `<div class="dk-status">${status}</div>` +
      `</div>` +
      rules
    );
  }

  private stakeHtml(anteControls: boolean): string {
    const v = this.v, mine = v?.seats[this.chair];
    if (!v || mine?.k !== 1) return '';
    const ante = v.ante ?? 10;
    const chooser = v.modeBy === this.chair;
    return `<div class="dk-stakes"><span>Участие</span>` +
      `<button class="dk-btn${mine.stake ? '' : ' on'}" data-a="stake" data-on="0" aria-pressed="${!mine.stake}">Бесплатно</button>` +
      `<button class="dk-btn${mine.stake ? ' on' : ''}" data-a="stake" data-on="1" aria-pressed="${!!mine.stake}">Со ставкой ${ante} 🪙</button>` +
      (anteControls ? `<div class="dk-ante"><span>Ставка стола</span>${[10,20,50].map(amount => `<button class="dk-btn${amount === ante ? ' on' : ''}" data-a="ante" data-on="${amount}" aria-pressed="${amount === ante}"${chooser ? '' : ' disabled'}>${amount}</button>`).join('')}</div>` : '') +
      `<small>Списание при раздаче. Бесплатный победитель не получает банк — ставки возвращаются.</small></div>`;
  }

  private rematchHtml(): string {
    const v = this.v;
    const mine = v?.seats[this.chair];
    if (!v || mine?.k !== 1 || mine.id === 0) return '';
    const ready = mine.ready;
    const humans = v.seats.filter((s) => s.k === 1 && s.id !== 0);
    const agreed = humans.filter((s) => s.ready).length;
    let status = `Подтвердили повтор: ${agreed} из ${humans.length}`;
    if (v.phase === 'count') status = 'Начинаем через <b data-count>5</b>…';
    else if (ready && v.phase === 'result' && agreed === humans.length) status = 'Повтор начнётся после показа итога';
    else if (v.phase === 'wait' && v.seats.filter((s) => s.k !== 0).length < 2) status = 'Позови друга или добавь бота';
    return (v.phase === 'result' ? this.stakeHtml(false) : '') + `<div class="dk-status" role="status">${status}</div>` +
      `<button class="dk-btn big${ready ? ' on' : ''}" data-a="ready" aria-pressed="${ready}">${ready ? 'Отменить готовность' : 'Повторить партию'}</button>`;
  }

  private playHtml(): string {
    const v = this.v;
    const gv = v?.game;
    if (!v || !gv) return '';
    const g = this.g;
    const me = this.me;
    const nick = (p: number): string => esc(v.seats.find((s) => s.p === p)?.nick ?? '?');
    let say = '';
    let timer = false;
    if (v.phase === 'result') {
      say = 'Партия окончена';
    } else if (me < 0 || !g) {
      say = 'Ты смотришь партию — сыграешь в следующей';
    } else if (gv.out.includes(me)) {
      say = 'Ты вышел 🏁 — ждём конца партии';
    } else {
      const w = gv.waiting;
      timer = w !== 'bito' && w !== 'took';
      if (w === 'lead' && gv.attacker === me) say = 'Твой ход — положи карту';
      else if (w === 'defend' && gv.defender === me) say = 'Отбивайся или «Беру»';
      else if (w === 'throw' && canPass(g, me)) say = me === gv.attacker ? 'Подкидывай или «Бито»' : 'Подкидывай или «Пас»';
      else if (w === 'take' && canPass(g, me)) say = `${nick(gv.defender)} берёт — подкидывай`;
      else if (w === 'take' && gv.defender === me) say = 'Берёшь — ждём, что подкинут';
      else if (w === 'bito') say = 'Бито!';
      else if (w === 'took') say = gv.defender === me ? 'Забираешь карты' : `${nick(gv.defender)} забирает карты`;
      else if (w === 'lead') say = `Ждём: ${nick(gv.attacker)}`;
      else if (w === 'defend') say = `Ждём: ${nick(gv.defender)}`;
      else say = 'Ждём, подкинут ли ещё';
    }
    // ход за мной — подсказка светится, чтобы не пропустить
    const mineTurn = !!g && me >= 0 && v.phase === 'play' && timer && !gv.out.includes(me) && (
      (gv.waiting === 'lead' && gv.attacker === me) || (gv.waiting === 'defend' && gv.defender === me) ||
      ((gv.waiting === 'throw' || gv.waiting === 'take') && canPass(g, me))
    );
    const sayHtml = `<div class="dk-say${mineTurn ? ' me' : ''}">${say}${timer ? ' <span class="dk-time" data-timer></span>' : ''}</div>`;
    if (me < 0 || !g || v.phase !== 'play') return sayHtml;

    const btns: string[] = [];
    if (canTake(g, me)) btns.push(`<button class="dk-btn warn" data-a="take">Беру<kbd>T</kbd></button>`);
    const tr = this.cards.filter((c) => canTransfer(g, me, c));
    if (tr.length) btns.push(`<button class="dk-btn" data-a="transfer-best">Перевести</button>`);
    if (canPass(g, me)) btns.push(`<button class="dk-btn ok" data-a="pass">${!gv.taking && me === gv.attacker ? 'Бито' : 'Пас'}<kbd>B</kbd></button>`);

    const ts = suitOf(gv.trump);
    const key = (c: number): number => (suitOf(c) === ts ? 4 : SUIT_ORDER.indexOf(suitOf(c))) * 9 + rankOf(c);
    const hand = [...this.cards].sort((a, b) => key(a) - key(b));
    const n = hand.length;
    const small = window.innerWidth <= SMALL_W || window.innerHeight <= SMALL_H;
    const cardPx = small ? CARD_SMALL_PX : CARD_PX;
    const handMax = Math.min(HAND_MAX_PX, window.innerWidth - 16 - (window.innerHeight <= SMALL_H ? SAY_COL_PX : 0));
    const step = n > 1 ? Math.min(cardPx + 4, (handMax - cardPx) / (n - 1)) : 0;
    const cardsHtml = hand.map((c, i) => {
      const ok = this.moves.has(c);
      const cls = ['dk-card', ok ? 'ok' : 'dim'];
      if (c === this.pending) cls.push('pending');
      if (c === this.menuCard) cls.push('sel');
      if (suitOf(c) === ts) cls.push('trump');
      const ml = i === 0 ? 0 : step - cardPx;
      // веер: крайние карты чуть наклонены и опущены
      const off = i - (n - 1) / 2;
      const rot = off * Math.min(2.6, 30 / Math.max(n, 1));
      const drop = off * off * Math.min(1.1, 14 / Math.max(n, 1));
      return `<button class="${cls.join(' ')}" data-card="${c}" style="background-position:${atlasPos(c)};margin-left:${ml.toFixed(1)}px;z-index:${i + 1};--r:${rot.toFixed(2)}deg;--y:${drop.toFixed(1)}px"></button>`;
    }).join('');
    let menu = '';
    if (this.menuCard >= 0) {
      const idx = hand.indexOf(this.menuCard);
      const left = idx * step + cardPx / 2;
      const items = (this.moves.get(this.menuCard) ?? []).map((m, i) => {
        const label = m.a === 'attack' ? (gv.table.length ? 'Подкинуть' : 'Ходить')
          : m.a === 'transfer' ? 'Перевести'
          : m.a === 'beat' ? `Отбить ${cardText(gv.table[m.on].a)}` : '';
        return `<button class="dk-btn" data-a="move" data-on="${i}">${label}</button>`;
      }).join('');
      menu = `<div class="dk-menu" style="left:${left.toFixed(1)}px">${items}</div>`;
    }
    return sayHtml + `<div class="dk-btns">${btns.join('')}</div>` + `<div class="dk-hand">${cardsHtml}${menu}</div>`;
  }

  private renderResult(): void {
    const v = this.v;
    if (v?.phase === 'play') this.resultSummary = '';
    const r = v?.phase === 'result' ? v.result : null;
    this.resultEl.classList.toggle('show', r !== null);
    if (!r || !v) {
      this.resultKey = '';
      return;
    }
    const fs = v.seats.find((s) => s.p === r.fool);
    const mineFool = fs !== undefined && v.seats.indexOf(fs) === this.chair;
    const title = r.fool < 0 ? 'Ничья!' : mineFool ? 'Ты дурак! 🃏' : `🃏 Дурак — ${esc(fs?.nick ?? '?')}`;
    const sub = r.fool >= 0 && r.ep ? (mineFool ? 'и с погонами — шестёрка в руке!' : 'и с погонами!') : r.fool < 0 ? 'Дураков нет' : '';
    const payout = r.payouts?.find(p => p.pid === v.seats[this.chair]?.pid);
    const money = payout ? `Ставка ${payout.wager} · возврат ${payout.payout}` : 'Бесплатная игра · без выплаты жетонов';
    this.resultSummary = title + (sub ? ` · ${sub}` : '') + ` · ${money}`;
    if (this.resultKey === this.resultSummary) return;
    this.resultKey = this.resultSummary;
    this.resultEl.innerHTML = `<div class="dk-rt">${title}</div>${sub ? `<div class="dk-rs">${sub}</div>` : ''}<div class="dk-rs">${money}</div>`;
  }

  // ------------------------------------------------------------ нажатия

  private onClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-a],[data-card]');
    if (!t || !this.root.contains(t) || (t as HTMLButtonElement).disabled) return;
    const card = t.dataset.card;
    if (card !== undefined) {
      this.clickCard(Number(card));
      return;
    }
    const on = Number(t.dataset.on ?? 0);
    switch (t.dataset.a) {
      case 'ante':
        this.onAct('ante', undefined, on);
        break;
      case 'stake':
        this.onAct('stake', undefined, on);
        break;
      case 'leave':
        this.askLeave();
        break;
      case 'leave-yes':
        this.confirmOpen = false;
        this.render();
        this.onLeave();
        break;
      case 'leave-no':
        this.confirmOpen = false;
        this.render();
        break;
      case 'react':
        this.react(on);
        break;
      case 'mode':
        this.onAct('mode', undefined, on);
        break;
      case 'ready':
        this.onAct('ready', undefined, this.v?.seats[this.chair]?.ready ? 0 : 1);
        break;
      case 'bot':
      case 'unbot':
        this.onAct(t.dataset.a);
        break;
      case 'rules':
        this.rulesOpen = !this.rulesOpen;
        this.render();
        break;
      case 'take':
        this.onAct('take');
        break;
      case 'pass':
        this.onAct('pass');
        break;
      case 'transfer-best':
        this.transferBest();
        break;
      case 'move': {
        const m = this.moves.get(this.menuCard)?.[on];
        this.menuCard = -1;
        if (m) this.send(m);
        else this.render();
        break;
      }
    }
  }

  private clickCard(c: number): void {
    const ms = this.moves.get(c);
    if (!ms) return;
    if (ms.length === 1) {
      this.menuCard = -1;
      this.send(ms[0]);
      return;
    }
    this.menuCard = this.menuCard === c ? -1 : c;
    this.render();
  }

  /** «Перевести»: картой не козырной масти, если есть такая. */
  private transferBest(): void {
    const g = this.g;
    if (!g) return;
    const ts = suitOf(g.trump);
    const list = this.cards.filter((c) => canTransfer(g, this.me, c)).sort((a, b) => Number(suitOf(a) === ts) - Number(suitOf(b) === ts));
    if (list.length) this.send({ a: 'transfer', card: list[0] });
  }

  private send(m: DurakMove): void {
    if (m.a === 'take' || m.a === 'pass') {
      this.onAct(m.a);
      return;
    }
    this.pending = m.card;
    this.pendingUntil = performance.now() + PENDING_MS;
    this.onAct(m.a, m.card, m.a === 'beat' ? m.on : undefined);
    this.render();
  }

  private askLeave(): void {
    if (this.locked) {
      this.confirmOpen = true;
      this.render();
    } else {
      this.onLeave();
    }
  }
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
