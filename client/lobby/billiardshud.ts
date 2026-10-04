// Бильярд: панель стола внизу и табло сверху — HTML поверх 3D (мышь у стола свободна).
// Панель: слева — какой стол и три строки правил (полные — по «?»); посередине крупно — что сейчас происходит
// («Тренировка», «Твой удар», «Бьёт …», «Шары катятся…», итог), под ним — последнее событие (забил, мимо, фол),
// ставка фишками и кнопка партии, управление «клавишами»; справа — жетоны, «Расставить», «Встать» (в партии — «Сдаться»).
// Табло: ты и соперник подписаны, у каждого свой цвет и кружок с буквой, счёт — числом и рядом из 8 шаров; чей удар —
// золотая подсветка, красный биток у кружка и полоска времени; посередине — «до 8» и банк. На тренировке — своё табло.
// Пока шары катятся, всё показано как до удара: счёт, событие и итог — когда шары остановились (без подсказок раньше).
// Панель только показывает стол с сервера и шлёт действия; деньги, очереди и итог решает сервер.
import { BL_CHIPS, BL_MAX_BET, BL_TURN_TICKS, BL_WIN, blMaxBet, type BlTableView } from '../../shared/billiards.ts';
import { TICK_MS } from '../../shared/constants.ts';
import { TOUCH } from '../touch.ts';
import { setCoinText } from '../ui/coin.ts';
import { ballImg, setBallVars, type BallKind } from './blball.ts';
import './billiards.css';

export type BlHudAction = { a: 'offer'; amount: number } | { a: 'cancel' } | { a: 'accept'; amount: number } | { a: 'rack' } | { a: 'resign' };

const TURN_MS = BL_TURN_TICKS * TICK_MS;
/** Последние секунды хода — красным */
const HURRY_MS = 8000;
/** Отказ сервера висит столько */
const ERR_MS = 3500;
/** Шаров в пирамиде (без битка) */
const RACK = 15;

/** Полные правила — по «?» */
const RULES: readonly string[] = [
  '«Американка»: 15 одинаковых шаров и красный биток. Бьёшь только битком — по любому шару, любой шар — в любую лузу.',
  `Забил — очко за каждый шар и бьёшь ещё. Не забил — ход сопернику. Кто первым забил ${BL_WIN}, тот выиграл.`,
  'Биток в лузе — фол: забитое этим ударом возвращается на стол, ход сопернику.',
  `На удар — ${Math.round(TURN_MS / 1000)} секунд, не успел — ход сопернику.`,
  'Партия на двоих: предложи (можно без ставки), второй принимает ту же ставку. Банк — обе ставки, победителю всё, комиссии нет.',
  'Тренировка — бесплатно и без таймера. «Расставить» (R) — новая пирамида.',
];
const CONTROLS = TOUCH
  ? 'Коснись сукна — прицел, тяни палец — сила, отпусти — удар.'
  : 'Курсор — прицел. Зажми ЛКМ и тяни — сила, отпусти — удар. ПКМ или Esc — отменить замах. Пробел — замах без мыши.';

type EventKind = 'foul' | 'good' | 'miss' | 'info' | 'warn' | 'err';
interface BlEvent {
  text: string;
  kind: EventKind;
  /** Картинка шара в начале строки */
  ball?: BallKind;
  /** Свежий фол этим ударом — ещё и крупно по центру */
  flash?: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10, h = n % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
}

/** «шар», «2 шара», «5 шаров» */
const ballsText = (n: number): string => (n === 1 ? 'шар' : `${n} ${plural(n, 'шар', 'шара', 'шаров')}`);

/** Буква в кружке игрока */
function initial(nick: string | undefined): string {
  const ch = Array.from((nick ?? '').trim())[0];
  return ch ? ch.toUpperCase() : '?';
}

/** Сколько шаров (кроме битка) уже в лузах */
function pottedCount(on: number): number {
  let n = 0;
  for (let i = 1; i <= RACK; i++) if (!(on & (1 << i))) n++;
  return n;
}

export class BilliardsHud {
  onAction: (act: BlHudAction) => void = () => {};
  onLeave: () => void = () => {};
  /** Итог партии показан (шары остановились): победа или поражение — для звука */
  onResult: (won: boolean, bet: number) => void = () => {};
  private readonly root = el('section', 'bl hidden');
  private readonly board = el('div', 'bl-board');
  private readonly banner = el('div', 'bl-banner');
  private readonly flash = el('div', 'bl-flash');
  private readonly power = el('div', 'bl-power');
  private readonly powerFill = el('i');
  private readonly powerNum = el('em');
  private readonly rules = el('div', 'bl-rules');
  private readonly bar = el('div', 'bl-bar');
  private readonly tableEl = el('small', 'bl-id-sub');
  private readonly helpBtn = el('button', 'bl-help', '?');
  private readonly status = el('div', 'bl-status');
  private readonly eventEl = el('div', 'bl-event');
  private readonly actRow = el('div', 'bl-act');
  private readonly betBox = el('div', 'bl-bet');
  private readonly input = document.createElement('input');
  private readonly limitEl = el('small', 'bl-limit');
  private readonly chipBtns: Array<{ btn: HTMLButtonElement; chip: number }> = [];
  private readonly resetBtn = el('button', 'bl-reset', '✕');
  private readonly goBtn = el('button', 'bl-go');
  private readonly whyEl = el('span', 'bl-why');
  private readonly cancelBtn = el('button', 'bl-btn', 'Забрать ставку');
  private readonly keysEl = el('div', 'bl-keys');
  private readonly balanceEl = el('div', 'bl-balance');
  private readonly rackBtn = el('button', 'bl-btn bl-rack');
  private readonly exitBtn = el('button', 'bl-btn bl-exit');
  private readonly exitLabel = el('span');
  private readonly dialog = document.createElement('dialog');
  private readonly dialogText = el('p');
  /** Что показано (пока шары катятся — стол до удара) и что последним пришло с сервера */
  private view: BlTableView | null = null;
  private latest: BlTableView | null = null;
  private recvAt = 0;
  private table = -1;
  private side = -1;
  private myPid = 0;
  private balance = 0;
  private draft = 0;
  private lastAmount = 0;
  private bannerKey = '';
  private flashKey = '';
  private err = '';
  private errUntil = 0;
  private go: (() => void) | null = null;
  /** Шары катятся у себя (анимация удара ещё идёт) */
  private animating = false;
  /** Последний удар своего стола: номер, кто бил (−1 — тренировка), какие шары упали; note — строка сервера после него */
  private lastShot: { n: number; by: number; potted: number[]; note: string | null } | null = null;
  /** Счёт, под который нарисованы ряды шаров: новые забитые «прыгают» */
  private shownScore: [number, number] = [0, 0];
  private boardKey = '';
  private statusKey = '';
  private eventKey = '';
  private keysKey = '';
  /** Полоска времени хода у того, кто бьёт */
  private timeBar: HTMLElement | null = null;

  constructor(parent: HTMLElement) {
    this.root.setAttribute('aria-label', 'Бильярд');
    setBallVars(this.root);
    this.power.append(this.powerFill, this.powerNum);
    this.status.setAttribute('role', 'status');
    this.eventEl.setAttribute('aria-live', 'polite');

    // слева: стол и коротко правила
    const id = el('div', 'bl-id');
    const head = el('div', 'bl-id-head');
    const titles = el('div', 'bl-id-titles');
    titles.append(el('b', 'bl-id-title', 'Бильярд'), this.tableEl);
    this.helpBtn.type = 'button';
    this.helpBtn.title = 'Правила';
    this.helpBtn.setAttribute('aria-label', 'Правила бильярда');
    this.helpBtn.setAttribute('aria-expanded', 'false');
    this.helpBtn.addEventListener('click', () => this.toggleRules());
    head.append(ballImg('ball8', 'bl-id-ball'), titles, this.helpBtn);
    const mini = el('ul', 'bl-mini');
    const rule = (kind: BallKind, text: string): HTMLLIElement => {
      const li = el('li');
      li.append(ballImg(kind, 'bl-mini-ball'), el('span', '', text));
      return li;
    };
    mini.append(
      rule('ball', 'Забил — бьёшь ещё'),
      rule('ball8', `Первым забил ${BL_WIN} — победа`),
      rule('cue', 'Биток в лузе — фол'),
    );
    id.append(head, mini);

    // посередине: ставка фишками и своя сумма (как в блэкджеке), кнопка партии
    const chips = el('div', 'bl-chips');
    BL_CHIPS.forEach((chip, i) => {
      const btn = el('button', `bj-chip c${chip}`);
      btn.type = 'button';
      btn.title = `+${chip} к ставке (${i + 1})`;
      btn.setAttribute('aria-label', `Добавить ${chip} к ставке`);
      btn.append(el('b', '', String(chip)));
      btn.addEventListener('click', () => this.setDraft(Math.min(blMaxBet(this.balance), this.draft + chip)));
      chips.append(btn);
      this.chipBtns.push({ btn, chip });
    });
    this.input.className = 'bj-input';
    this.input.inputMode = 'numeric';
    this.input.autocomplete = 'off';
    this.input.placeholder = 'сумма';
    this.input.setAttribute('aria-label', 'Своя сумма ставки');
    this.input.addEventListener('input', () => {
      const digits = this.input.value.replace(/\D/g, '').slice(0, 5);
      this.draft = Math.min(digits ? Number(digits) : 0, BL_MAX_BET);
      if (this.input.value !== digits) this.input.value = digits;
      this.render();
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') { e.preventDefault(); this.go?.(); }
      // Esc в поле — только выйти из поля (второй Esc — встать)
      if (e.code === 'Escape') this.input.blur();
      e.stopPropagation();
    });
    this.resetBtn.type = 'button';
    this.resetBtn.title = 'Сбросить ставку';
    this.resetBtn.setAttribute('aria-label', 'Сбросить ставку');
    this.resetBtn.addEventListener('click', () => this.setDraft(0));
    const amount = el('div', 'bl-amount');
    amount.append(this.input, this.resetBtn);
    this.betBox.append(chips, amount, this.limitEl);
    for (const b of [this.goBtn, this.cancelBtn, this.rackBtn, this.exitBtn]) b.type = 'button';
    this.goBtn.addEventListener('click', () => this.go?.());
    this.cancelBtn.addEventListener('click', () => this.onAction({ a: 'cancel' }));
    this.actRow.append(this.betBox, this.goBtn, this.cancelBtn, this.whyEl);
    const mid = el('div', 'bl-mid');
    mid.append(this.status, this.eventEl, this.actRow, this.keysEl);

    // справа: жетоны, «Расставить», «Встать» / «Сдаться»
    const side = el('div', 'bl-side');
    this.rackBtn.title = 'Расставить шары заново';
    this.rackBtn.append(el('span', '', '↻ Расставить'), el('kbd', '', 'R'));
    this.rackBtn.addEventListener('click', () => this.onAction({ a: 'rack' }));
    this.exitBtn.append(this.exitLabel, el('kbd', '', 'Esc'));
    this.exitBtn.addEventListener('click', () => this.escape());
    side.append(this.balanceEl, this.rackBtn, this.exitBtn);

    // правила целиком — над панелью, по «?»
    this.rules.hidden = true;
    this.rules.id = 'bl-rules';
    this.helpBtn.setAttribute('aria-controls', this.rules.id);
    const rulesHead = el('div', 'bl-rules-head');
    const close = el('button', 'bl-rules-x', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Закрыть правила');
    close.addEventListener('click', () => this.toggleRules(false));
    rulesHead.append(ballImg('ball8', 'bl-rules-ball'), el('b', '', 'Правила бильярда'), close);
    const list = el('ul');
    for (const text of RULES) list.append(el('li', '', text));
    this.rules.append(rulesHead, list, el('p', 'bl-rules-ctrl', CONTROLS));

    this.bar.append(this.rules, id, mid, side);

    this.dialog.className = 'bj-dialog bl-dialog';
    const row = el('div', 'bj-actions-row');
    const stay = el('button', 'bj-button', 'Играть дальше');
    stay.type = 'button';
    stay.dataset.bjAction = 'stay';
    stay.addEventListener('click', () => this.dialog.close());
    const give = el('button', 'bj-button', 'Сдаться');
    give.type = 'button';
    give.dataset.bjAction = 'leave-confirm';
    give.addEventListener('click', () => {
      this.dialog.close();
      this.onAction({ a: 'resign' });
    });
    row.append(stay, give);
    this.dialog.append(el('h2', '', 'Сдаться?'), this.dialogText, row);

    this.flash.addEventListener('animationend', () => this.flash.classList.remove('show'));
    this.root.append(this.board, this.banner, this.flash, this.power, this.bar, this.dialog);
    // кнопки не забирают фокус мышью: иначе пробел нажмёт их ещё раз вместо замаха
    this.root.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) e.preventDefault();
    });
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  get dialogOpen(): boolean {
    return this.dialog.open;
  }

  /** Фокус в поле суммы: клавиши — ему, не игре */
  get typing(): boolean {
    return document.activeElement === this.input;
  }

  show(table: number, side: number, myPid: number): void {
    this.table = table;
    this.side = side;
    this.myPid = myPid;
    this.view = this.latest = null;
    this.lastShot = null;
    this.boardKey = this.statusKey = this.eventKey = this.keysKey = '';
    this.shownScore = [0, 0];
    this.tableEl.textContent = `стол ${table + 1} · американка`;
    this.root.classList.remove('hidden');
    this.render();
  }

  hide(): void {
    this.table = -1;
    this.side = -1;
    if (this.dialog.open) this.dialog.close();
    this.toggleRules(false);
    this.input.blur();
    this.root.classList.add('hidden');
    this.flash.classList.remove('show');
    this.setPower(null);
  }

  setView(v: BlTableView, now = performance.now()): void {
    if (v.table !== this.table) return;
    const prev = this.latest;
    this.latest = v;
    this.recvAt = now;
    if (v.offer && v.offer.by === this.side) this.lastAmount = v.offer.amount;
    if (v.phase === 'match' && v.bet) this.lastAmount = v.bet;
    // реванш: после итога в поле — прошлая ставка
    if (prev?.phase === 'result' && v.phase === 'open') this.setDraft(Math.min(this.lastAmount, blMaxBet(this.balance)), false);
    // шары катятся — показываем стол до удара, новый вид — когда остановятся
    if (!this.animating || !this.view) this.view = v;
    this.render();
  }

  setBalance(n: number): void {
    this.balance = n;
    this.render();
  }

  setAnimating(on: boolean): void {
    if (on === this.animating) return;
    this.animating = on;
    if (!on && this.latest) this.view = this.latest;
    this.render();
  }

  /** Удар на своём столе (анимация пошла): кто бил и какие шары упадут — для строки события, когда шары остановятся. */
  shot(n: number, by: number, potted: number[]): void {
    this.lastShot = { n, by, potted, note: null };
  }

  /** Шкала силы: null — спрятать, иначе 0…1 */
  setPower(p: number | null): void {
    this.power.classList.toggle('on', p !== null);
    if (p === null) return;
    this.powerFill.style.height = `${Math.round(p * 100)}%`;
    this.powerNum.textContent = `${Math.round(p * 100)}%`;
  }

  error(text: string): void {
    this.err = text;
    this.errUntil = performance.now() + ERR_MS;
    this.renderEvent(performance.now());
  }

  /** Esc: закрыть вопрос или правила; в партии — спросить «сдаться?», иначе встать. */
  escape(): void {
    if (this.dialog.open) {
      this.dialog.close();
      return;
    }
    if (!this.rules.hidden) {
      this.toggleRules(false);
      return;
    }
    if (this.view?.phase === 'match' && this.mine()) this.askResign();
    else this.onLeave();
  }

  /** Клавиши панели: 1–4 — фишки, Enter — главная кнопка, R — расставить заново. true — съели. */
  onKey(code: string): boolean {
    if (!this.visible) return false;
    if (code === 'Escape') {
      this.escape();
      return true;
    }
    if (this.dialog.open) return true;
    const i = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    if (i && !this.betBox.hidden && !this.actRow.hidden) {
      const chip = BL_CHIPS[Number(i[1]) - 1];
      if (chip) this.setDraft(Math.min(blMaxBet(this.balance), this.draft + chip));
      return !!chip;
    }
    if (code === 'Enter' && this.go && !this.goBtn.disabled && !this.goBtn.hidden) {
      this.go();
      return true;
    }
    if (code === 'KeyR' && !this.rackBtn.hidden && !this.rackBtn.disabled) {
      this.onAction({ a: 'rack' });
      return true;
    }
    return false;
  }

  /** Раз в кадр: таймер, полоска хода, конец «шары катятся», снятие ошибки. */
  tick(now: number): void {
    if (!this.visible || !this.view) return;
    if (this.err && now > this.errUntil) this.err = '';
    this.root.classList.toggle('my-turn', this.myTurn(now));
    this.renderStatus(now);
    this.renderEvent(now);
    this.renderKeys(now);
    if (this.timeBar && this.latest) {
      const left = this.left(now);
      this.timeBar.style.width = `${((left / TURN_MS) * 100).toFixed(1)}%`;
      this.timeBar.parentElement?.classList.toggle('hurry', left < HURRY_MS);
    }
  }

  // ------------------------------------------------------------ состояние

  /** В партии ли я (сижу на одной из сторон). */
  private mine(): boolean {
    const v = this.view;
    return !!v && this.side >= 0 && v.seats[this.side]?.pid === this.myPid;
  }

  /** Шары ещё катятся: своя анимация или, без неё, время с сервера */
  private rolling(now: number): boolean {
    const l = this.latest;
    return this.animating || (!!l && l.rolling - (now - this.recvAt) > 0);
  }

  /** Сколько мс осталось на удар */
  private left(now: number): number {
    const l = this.latest;
    return l ? Math.min(TURN_MS, Math.max(0, l.left - (now - this.recvAt))) : 0;
  }

  private myTurn(now: number): boolean {
    const v = this.view;
    return !!v && v.phase === 'match' && v.turn === this.side && !this.rolling(now);
  }

  private nick(s: number): string {
    return this.view?.seats[s]?.nick ?? 'соперник';
  }

  private setDraft(n: number, render = true): void {
    this.draft = Math.max(0, Math.min(BL_MAX_BET, Math.floor(n)));
    this.input.value = this.draft ? String(this.draft) : '';
    if (render) this.render();
  }

  private toggleRules(on = this.rules.hidden === true): void {
    this.rules.hidden = !on;
    this.helpBtn.classList.toggle('on', on);
    this.helpBtn.setAttribute('aria-expanded', String(on));
  }

  private askResign(): void {
    const v = this.view;
    const opp = this.nick(1 - this.side);
    setCoinText(this.dialogText, v?.bet ? `Партия закончится сразу: победа и банк ${v.bet * 2} 🪙 — ${opp}.` : `Партия закончится сразу — победа достанется ${opp}.`);
    this.dialog.showModal();
  }

  // ------------------------------------------------------------ отрисовка

  private render(): void {
    const v = this.view;
    if (!this.visible || !v) return;
    const now = performance.now();
    this.root.classList.toggle('my-turn', this.myTurn(now));
    this.renderBoard(v);
    this.renderBar(v);
    this.renderStatus(now);
    this.renderEvent(now);
    this.renderKeys(now);
    if (v.phase === 'result' && v.winner >= 0) this.showBanner(v);
  }

  /** Табло сверху: в партии — ты, «до 8» и банк, соперник; до партии — тренировка. */
  private renderBoard(v: BlTableView): void {
    const me = this.side;
    const seat = (s: number): string => {
      const x = v.seats[s];
      return x ? `${x.nick}|${x.away > 0 ? 1 : 0}` : '-';
    };
    const key = [v.phase, v.score.join(':'), v.phase === 'match' ? v.turn : -1, v.bet, v.winner, seat(0), seat(1), me,
      v.phase === 'open' ? `${pottedCount(v.on)}|${v.offer ? `${v.offer.by}:${v.offer.amount}` : ''}` : ''].join('/');
    if (key === this.boardKey) return;
    this.boardKey = key;
    this.timeBar = null;
    if (v.phase === 'open') {
      this.board.className = 'bl-board train';
      this.board.replaceChildren(this.trainCard(v));
      this.shownScore = [0, 0];
      return;
    }
    this.board.className = 'bl-board match';
    this.board.replaceChildren(this.card(v, me), this.vsCard(v), this.card(v, 1 - me));
    this.shownScore = [v.score[0], v.score[1]];
  }

  private card(v: BlTableView, s: number): HTMLElement {
    const seat = v.seats[s];
    const isMe = s === this.side;
    const turn = v.phase === 'match' && v.turn === s;
    const won = v.phase === 'result' && v.winner === s;
    const lost = v.phase === 'result' && v.winner >= 0 && v.winner !== s;
    const cls = ['bl-card', isMe ? 'me' : 'opp'];
    if (turn) cls.push('turn');
    if (seat?.away) cls.push('away');
    if (won) cls.push('win');
    if (lost) cls.push('lose');
    const c = el('div', cls.join(' '));
    const ava = el('div', 'bl-ava', initial(seat?.nick));
    if (turn) ava.append(ballImg('cue', 'bl-ava-cue'));
    const who = el('div', 'bl-who');
    const tag = el('span', 'bl-tag', isMe ? 'ты' : 'соперник');
    if (seat?.away) {
      tag.textContent = 'отошёл';
      tag.classList.add('bad');
    }
    who.append(tag, el('b', 'bl-nick', seat?.nick ?? '—'));
    const score = v.score[s];
    const before = Math.min(this.shownScore[s], score);
    const slots = el('div', 'bl-slots');
    slots.setAttribute('aria-label', `забито ${score} из ${BL_WIN}`);
    for (let i = 0; i < BL_WIN; i++) {
      const on = i < score;
      const slot = el('i', on ? (i >= before ? 'on new' : 'on') : '');
      if (on && i >= before) slot.style.animationDelay = `${(i - before) * 110}ms`;
      slots.append(slot);
    }
    const sc = el('div', 'bl-score');
    sc.append(el('b', '', String(score)), el('small', '', `/${BL_WIN}`));
    c.append(ava, who, slots, sc);
    if (turn) {
      const bar = el('i', 'bl-time');
      const fill = el('b');
      bar.append(fill);
      c.append(bar);
      this.timeBar = fill;
    }
    if (won) c.append(el('span', 'bl-flag', 'победа'));
    return c;
  }

  private vsCard(v: BlTableView): HTMLElement {
    const vs = el('div', 'bl-vs');
    const text = el('div', 'bl-vs-text');
    const stake = el('span', 'bl-vs-stake');
    setCoinText(stake, v.bet ? `банк ${v.bet * 2} 🪙` : 'без ставки');
    text.append(el('b', '', `до ${BL_WIN} шаров`), stake);
    vs.append(ballImg('ball8', 'bl-vs-ball'), text);
    return vs;
  }

  private trainCard(v: BlTableView): HTMLElement {
    const me = this.side;
    const other = v.seats[1 - me];
    const offer = v.offer;
    const card = el('div', 'bl-train');
    const text = el('div', 'bl-train-text');
    const sub = el('span', 'bl-train-sub');
    if (offer && offer.by === me) setCoinText(sub, `ты зовёшь на партию${offer.amount ? ` · ставка ${offer.amount} 🪙` : ' без ставки'}`);
    else if (offer) setCoinText(sub, `${this.nick(offer.by)} зовёт на партию${offer.amount ? ` · ставка ${offer.amount} 🪙` : ' без ставки'}`);
    else sub.textContent = other ? `с ${other.nick} · без ставок и таймера` : 'без ставок и таймера';
    text.append(el('b', '', other ? 'Тренировка вдвоём' : 'Тренировка'), sub);
    const potted = pottedCount(v.on);
    const pot = el('div', 'bl-train-pot');
    const count = el('span', 'bl-train-count');
    count.append('в лузах ', el('b', '', String(potted)), ` из ${RACK}`);
    const slots = el('div', 'bl-slots small');
    for (let i = 0; i < RACK; i++) slots.append(el('i', i < potted ? 'on' : ''));
    pot.append(count, slots);
    card.append(ballImg('ball8', 'bl-train-ball'), text, pot);
    return card;
  }

  /** Кнопки и ставка по фазе стола. */
  private renderBar(v: BlTableView): void {
    setCoinText(this.balanceEl, `🪙 ${this.balance}`);
    this.balanceEl.title = 'Твои жетоны';
    const me = this.side;
    this.go = null;
    this.whyEl.textContent = '';
    let bet = false, go = false, cancel = false;
    if (v.phase === 'open') {
      const offer = v.offer;
      if (!offer) {
        bet = go = true;
        const can = this.draft <= this.balance;
        this.goLabel('bl-go', this.draft > 0 ? `Предложить партию · ${this.draft} 🪙` : 'Предложить партию без ставки');
        this.goBtn.disabled = !can;
        if (!can) this.whyEl.textContent = `у тебя ${this.balance} — не хватает`;
        const amount = this.draft;
        if (can) this.go = () => this.onAction({ a: 'offer', amount });
      } else if (offer.by === me) {
        if (offer.amount > 0) cancel = true;
        else {
          go = true;
          this.goLabel('bl-go ghost', 'Отменить предложение');
          this.goBtn.disabled = false;
          this.go = () => this.onAction({ a: 'cancel' });
        }
      } else {
        go = true;
        const can = offer.amount <= this.balance;
        this.goLabel('bl-go green', offer.amount ? `Принять · ${offer.amount} 🪙` : 'Принять партию');
        this.goBtn.disabled = !can;
        if (!can) setCoinText(this.whyEl, `нужно ${offer.amount} 🪙, у тебя ${this.balance}`);
        const amount = offer.amount;
        if (can) this.go = () => this.onAction({ a: 'accept', amount });
      }
    }
    this.betBox.hidden = !bet;
    this.goBtn.hidden = !go;
    this.cancelBtn.hidden = !cancel;
    this.actRow.hidden = !(bet || go || cancel);
    if (bet) {
      const cap = blMaxBet(this.balance);
      for (const { btn, chip } of this.chipBtns) btn.disabled = this.draft + chip > cap;
      this.resetBtn.disabled = this.draft === 0;
      this.limitEl.textContent = cap <= 0 ? 'жетонов нет' : `до ${cap}`;
      this.limitEl.title = cap <= 0 ? 'Жетонов нет — можно играть без ставки' : cap < BL_MAX_BET ? `Ставка до ${cap} — столько у тебя жетонов` : `Ставка до ${BL_MAX_BET} — лимит стола`;
      this.limitEl.classList.toggle('low', cap < BL_MAX_BET);
    }
    this.rackBtn.hidden = v.phase !== 'open';
    this.rackBtn.disabled = this.animating;
    const resign = v.phase === 'match' && this.mine();
    this.exitLabel.textContent = resign ? 'Сдаться' : 'Встать';
    this.exitBtn.classList.toggle('warn', resign);
    this.exitBtn.title = resign ? 'Сдаться — партия закончится, банк уйдёт сопернику' : 'Встать из-за стола';
  }

  private goLabel(cls: string, text: string): void {
    this.goBtn.className = cls;
    const label = el('span');
    setCoinText(label, text);
    this.goBtn.replaceChildren(label, el('kbd', '', 'Enter'));
  }

  /** Крупно — что сейчас происходит; рядом — время на удар. */
  private renderStatus(now: number): void {
    const v = this.view;
    if (!v) return;
    const me = this.side;
    let title = '', tone = '', sub = '', subTone = '', time = '', hurry = false;
    if (v.phase === 'open') {
      const offer = v.offer;
      const other = v.seats[1 - me];
      if (!offer) {
        title = other ? 'Тренировка вдвоём' : 'Тренировка';
        sub = other ? `предложи партию — ${other.nick} сможет принять` : 'бей сколько хочешь · или предложи партию';
      } else if (offer.by === me) {
        title = 'Ждём соперника';
        tone = 'gold';
        sub = `${offer.amount ? `ставка ${offer.amount} 🪙 уже в банке` : 'партия без ставки'} · пока можно тренироваться`;
      } else {
        title = `${this.nick(offer.by)} зовёт на партию`;
        tone = 'gold';
        sub = offer.amount ? `ставка ${offer.amount} 🪙 · банк ${offer.amount * 2}, победителю всё` : 'без ставки';
      }
    } else if (v.phase === 'match') {
      if (this.rolling(now)) title = 'Шары катятся…';
      else {
        const left = this.left(now);
        time = clock(left);
        hurry = left < HURRY_MS;
        if (v.turn === me) {
          title = 'Твой удар';
          tone = 'gold';
        } else title = `Бьёт ${this.nick(v.turn)}`;
      }
      const opp = v.seats[1 - me];
      if (opp?.away) {
        sub = `${opp.nick} отошёл — ждём ${clock(opp.away - (now - this.recvAt))}`;
        subTone = 'bad';
      }
    } else {
      const won = v.winner === me;
      title = won ? 'Победа!' : 'Поражение';
      tone = won ? 'good' : 'bad';
      sub = `${won && v.bet ? `+${v.bet * 2} 🪙 · ` : ''}сейчас расставим заново — можно реванш`;
    }
    const key = [title, tone, sub, subTone, time, hurry].join('|');
    if (key === this.statusKey) return;
    this.statusKey = key;
    const parts: HTMLElement[] = [el('span', `bl-st-title${tone ? ` ${tone}` : ''}`, title)];
    if (time) parts.push(el('span', `bl-clock${hurry ? ' hurry' : ''}`, time));
    if (sub) {
      const s = el('span', `bl-st-sub${subTone ? ` ${subTone}` : ''}`);
      setCoinText(s, sub);
      parts.push(s);
    }
    this.status.replaceChildren(...parts);
  }

  /** Строка события под статусом: что было последним ударом (или отказ сервера). */
  private renderEvent(now: number): void {
    const v = this.view;
    if (!v) return;
    const ev = this.eventOf(v, now);
    const key = ev ? `${ev.kind}|${ev.text}` : '';
    if (key === this.eventKey) return;
    this.eventKey = key;
    if (!ev) {
      this.eventEl.className = 'bl-event';
      this.eventEl.replaceChildren();
      return;
    }
    this.eventEl.className = `bl-event ${ev.kind}`;
    const parts: Node[] = [];
    if (ev.kind === 'foul') parts.push(el('b', 'bl-event-tag', 'фол'));
    if (ev.ball) parts.push(ballImg(ev.ball, 'bl-event-ball'));
    const text = el('span');
    setCoinText(text, ev.text);
    parts.push(text);
    this.eventEl.replaceChildren(...parts);
    // свежий фол — ещё и крупно по центру
    if (ev.flash) this.showFlash(`${v.table}:${v.shot}`, 'Фол!', 'биток в лузе');
  }

  private eventOf(v: BlTableView, now: number): BlEvent | null {
    if (this.err) return { text: this.err, kind: 'err' };
    if (this.rolling(now) && v.phase !== 'result') return null;
    const me = this.side;
    const shot = this.lastShot;
    if (shot && shot.n === v.shot) {
      // строка сервера в момент удара: сменилась (не успел, отошёл, вернулся) — показываем её
      if (shot.note === null) shot.note = v.note;
      if (shot.note === v.note) {
        const balls = shot.potted.filter((b) => b > 0).length;
        const foul = shot.potted.includes(0);
        if (v.phase === 'match' && shot.by >= 0) {
          const mineShot = shot.by === me;
          const who = mineShot ? 'Ты' : this.nick(shot.by);
          if (foul) {
            const back = balls ? ` · ${ballsText(balls)} ${balls === 1 ? 'вернулся' : 'вернулись'} на стол` : '';
            return { text: `${mineShot ? 'ты загнал' : `${who} загнал`} биток в лузу${back}`, kind: 'foul', flash: true };
          }
          if (balls) return { text: `${who} забил ${ballsText(balls)} — ${mineShot ? 'бей ещё!' : 'бьёт ещё'}`, kind: mineShot ? 'good' : 'info', ball: 'ball' };
          return { text: mineShot ? 'Мимо — ход соперника' : `${who} промахнулся — твой удар`, kind: 'miss' };
        }
        if (v.phase === 'open' && shot.by < 0) {
          if (pottedCount(v.on) === RACK) return { text: 'Все шары в лузах — «Расставить» (R)', kind: 'good', ball: 'ball' };
          if (foul) return { text: 'Биток в лузе — он снова в «доме»', kind: 'miss', ball: 'cue' };
          if (balls) return { text: `В лузе: ${ballsText(balls)}`, kind: 'good', ball: 'ball' };
          return null;
        }
      }
    }
    if (v.phase === 'result') return this.resultEvent(v);
    // без своего удара — строка сервера: начало партии, не успел, отошёл (до партии она про предложение — оно и так крупно)
    if (v.phase === 'open' || !v.note) return null;
    const text = this.personal(v.note);
    const kind: EventKind = text.startsWith('Фол') ? 'foul' : /не успел|отошёл|пропала связь|не вернулся/.test(text) ? 'warn' : 'info';
    return { text, kind };
  }

  /** Итог: почему кончилась партия и куда ушёл банк. */
  private resultEvent(v: BlTableView): BlEvent {
    const me = this.side;
    const won = v.winner === me;
    const opp = this.nick(1 - me);
    const why = v.why === 'resign' ? (won ? `${opp} сдался` : 'Ты сдался')
      : v.why === 'away' ? (won ? `${opp} не вернулся к столу` : 'Ты не вернулся вовремя')
        : `Счёт ${v.score[me]}:${v.score[1 - me]}`;
    const bank = v.bet ? ` · банк ${v.bet * 2} 🪙 — ${won ? 'тебе' : opp}` : '';
    return { text: why + bank, kind: won ? 'good' : 'info', ball: won ? 'ball8' : undefined };
  }

  /** Строка сервера — от первого лица, если она про меня («Ты не успел», «… — твой удар»). */
  private personal(note: string): string {
    const nick = this.view?.seats[this.side]?.nick;
    if (!nick) return note;
    let s = note;
    if (s.startsWith(`${nick} `)) s = `Ты ${s.slice(nick.length + 1)}`;
    else if (s.startsWith(`${nick}:`)) s = `Ты:${s.slice(nick.length + 1)}`;
    return s.split(`бьёт ${nick}`).join('твой удар').split(`разбивает ${nick}`).join('разбиваешь ты').split(`победа ${nick}`).join('победа твоя');
  }

  /** Управление «клавишами» — когда можно бить. */
  private renderKeys(now: number): void {
    const v = this.view;
    if (!v) return;
    const can = !this.rolling(now) && (v.phase === 'open' || (v.phase === 'match' && v.turn === this.side));
    const key = can ? 'on' : '';
    if (key === this.keysKey) return;
    this.keysKey = key;
    if (!can) {
      this.keysEl.replaceChildren();
      return;
    }
    if (TOUCH) {
      this.keysEl.replaceChildren(el('span', 'bl-k', 'Коснись сукна — прицел · тяни палец — сила · отпусти — удар'));
      return;
    }
    const k = (cap: HTMLElement, text: string): HTMLElement => {
      const s = el('span', 'bl-k');
      s.append(cap, el('span', '', text));
      return s;
    };
    this.keysEl.replaceChildren(
      k(el('i', 'bl-mouse'), 'прицел'),
      k(el('i', 'bl-mouse l'), 'зажми и тяни — сила'),
      k(el('kbd', '', 'Пробел'), 'замах'),
      k(el('i', 'bl-mouse r'), 'отмена'),
    );
  }

  private showBanner(v: BlTableView): void {
    const key = `${v.table}:${v.shot}:${v.winner}`;
    if (key === this.bannerKey || !this.mine()) return;
    this.bannerKey = key;
    const me = this.side;
    const won = v.winner === me;
    const bank = v.bet * 2;
    const score = `${v.score[me]}:${v.score[1 - me]}`;
    const sub = el('div', 'bl-banner-sub');
    if (won) setCoinText(sub, [v.why === 'resign' ? 'соперник сдался' : v.why === 'away' ? 'соперник не вернулся' : score, bank ? `+${bank} 🪙` : ''].filter(Boolean).join(' · '));
    else sub.textContent = v.why === 'resign' ? 'ты сдался' : v.why === 'away' ? 'не вернулся вовремя' : score;
    this.banner.className = `bl-banner ${won ? 'win' : 'loss'}`;
    this.banner.replaceChildren(el('div', 'bl-banner-title', won ? 'Победа!' : 'Поражение'), sub);
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    this.onResult(won, v.bet);
  }

  private showFlash(key: string, title: string, sub: string): void {
    if (key === this.flashKey) return;
    this.flashKey = key;
    this.flash.replaceChildren(el('div', 'bl-flash-title', title), el('div', 'bl-flash-sub', sub));
    this.flash.classList.remove('show');
    void this.flash.offsetWidth;
    this.flash.classList.add('show');
  }
}
