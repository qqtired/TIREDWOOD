// Нижняя панель блэкджека: фишки-ставки, крупные «Ещё» / «Хватит» / «Удвоить» / «Разделить» с клавишами, свои карты
// с суммой очков и кольцом таймера хода, полоска «дилер и все за столом» сверху и крупный итог по центру.
// Панель только показывает вид стола с сервера и отправляет действия с номером версии (rev): ничего не решает сама.
// Показ чуть отстаёт от сервера, пока в 3D летят карты (`setHold`), — чтобы не выдавать карты раньше, чем они упали.
import { BJ_BETS, BJ_TABLE, BJ_TURN_TICKS, type BlackjackAct, type BlackjackSeatView, type BlackjackView } from '../../shared/blackjack.ts';
import { TICK_MS } from '../../shared/constants.ts';
import { BJ_ATLAS, bjAtlasCanvas, bjAtlasPosition } from './bjcards.ts';
import './blackjack.css';

const TURN_MS = BJ_TURN_TICKS * TICK_MS;
const RULES = [
  'Набери больше дилера, но не больше 21. Туз — 1 или 11, картинки — 10. Играют шесть колод.',
  'Блэкджек (туз и десятка с первых двух карт) платит 3:2. Обычная победа — 1:1, ничья возвращает ставку.',
  'Дилер берёт карты до 17 и стоит на любых 17. Его вторая карта закрыта, пока не сходят все игроки.',
  '«Удвоить» — ещё такая же ставка, одна карта и стоп. «Разделить» — пара одного достоинства: две руки, один раз; разделённые тузы получают по одной карте.',
  'Можно играть бесплатно: ходы те же, но выигрыш и опыт не начисляются. Новая ставка всегда по твоему нажатию.',
];
const RESULT_WORD = { win: 'победа', loss: 'проигрыш', push: 'ничья', blackjack: 'блэкджек' } as const;
const CHIPS: readonly number[] = [0, ...BJ_BETS.filter((b) => b > 0)];
const ACTIONS = [
  { act: 'hit', label: 'Ещё', key: 'H', cls: 'hit' },
  { act: 'stand', label: 'Хватит', key: 'S', cls: 'stand' },
  { act: 'double', label: 'Удвоить', key: 'D', cls: 'double' },
  { act: 'split', label: 'Разделить', key: 'P', cls: 'split' },
] as const;
const KEY_ACTION: Record<string, BlackjackAct> = { KeyH: 'hit', KeyS: 'stand', KeyD: 'double', KeyP: 'split' };
const KEY_CHIP: Record<string, number> = { Digit0: 0, Digit1: 10, Digit2: 20, Digit3: 50, Numpad0: 0, Numpad1: 10, Numpad2: 20, Numpad3: 50 };

function element<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

function coins(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;
}

/** Карта в панели: кусочек общего атласа (c < 0 — рубашка). */
function cardEl(c: number, extra = ''): HTMLElement {
  const node = element('span', `bj-card${c < 0 ? ' back' : ''}${extra ? ` ${extra}` : ''}`);
  node.style.backgroundPosition = bjAtlasPosition(c);
  return node;
}

export class BlackjackHud {
  onAct: (action: BlackjackAct, rev: number, amount?: number) => void = () => {};
  onLeave: () => void = () => {};
  private readonly root = element('section', 'bj hidden');
  private readonly strip = element('div', 'bj-strip');
  private readonly banner = element('div', 'bj-banner');
  private readonly bar = element('div', 'bj-bar');
  private readonly me = element('div', 'bj-me');
  private readonly act = element('div', 'bj-act');
  private readonly status = element('p', 'bj-status');
  private readonly buttons = element('div', 'bj-buttons');
  private readonly balanceEl = element('span', 'bj-balance');
  private readonly rulesEl = element('div', 'bj-rules hidden');
  private readonly leaveDialog = document.createElement('dialog');
  /** Последний вид с сервера и тот, что уже показан (отстаёт, пока в 3D летят карты) */
  private view: BlackjackView | null = null;
  private shown: BlackjackView | null = null;
  private chair = -1;
  private table = -1;
  private balance = 0;
  private lastBet = -1;
  private recvAt = 0;
  private holdUntil = 0;
  private ready = true;
  private pending: { rev: number; at: number } | null = null;
  private error = '';
  private signature = '';
  private previousFocus: HTMLElement | null = null;
  private ringFg: SVGElement | null = null;
  private countdownEl: HTMLElement | null = null;
  /** Сколько карт было в моих руках в прошлой отрисовке: новые карты вылетают в панель с анимацией */
  private cardCounts: number[] = [];
  private atlasSet = false;

  constructor(parent: HTMLElement) {
    this.root.setAttribute('aria-label', 'Блэкджек');
    this.root.style.setProperty('--bj-cols', String(BJ_ATLAS.cols));
    this.root.style.setProperty('--bj-rows', String(BJ_ATLAS.rows));
    this.status.setAttribute('role', 'status');

    const side = element('div', 'bj-side');
    const leave = this.button('Встать', 'leave', () => this.escape());
    leave.classList.add('bj-leave');
    leave.append(element('kbd', '', 'Esc'));
    const help = this.button('?', 'rules', () => this.rulesEl.classList.toggle('hidden'));
    help.classList.add('bj-help');
    help.title = 'Правила';
    side.append(this.balanceEl, leave, help);
    this.act.append(this.status, this.buttons);
    this.bar.append(this.me, this.act, side);

    const rulesTitle = element('b', '', 'Правила блэкджека');
    const list = element('ul');
    for (const text of RULES) list.append(element('li', '', text));
    this.rulesEl.append(rulesTitle, list);

    this.leaveDialog.className = 'bj-dialog';
    const title = element('h2', '', 'Встать из-за стола?');
    const text = element('p', '', 'Текущая раздача дойдёт до конца сама: сервер посчитает итог и выплатит выигрыш. Новых ставок без тебя не будет.');
    const row = element('div', 'bj-actions-row');
    row.append(this.button('Остаться', 'stay', () => this.leaveDialog.close()), this.button('Встать', 'leave-confirm', () => {
      this.leaveDialog.close();
      this.onLeave();
    }));
    this.leaveDialog.append(title, text, row);

    this.root.append(this.strip, this.banner, this.rulesEl, this.bar, this.leaveDialog);
    // кнопки не забирают фокус мышью: иначе пробел и Enter нажмут их ещё раз, а H / S / D остались бы без внимания
    this.root.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) e.preventDefault();
    });
    parent.append(this.root);
  }

  get visible(): boolean {
    return this.table === BJ_TABLE;
  }

  /** Идёт моя раздача: встать из-за стола — только через вопрос. */
  get locked(): boolean {
    const mine = this.view?.seats[this.chair];
    return !!mine && !!mine.participating && (this.view?.phase === 'play' || this.view?.phase === 'dealer');
  }

  show(table: number, chair: number): void {
    if (this.table === table && this.chair === chair) return;
    // картинка карт для панели кодируется при первой посадке, а не при загрузке набережной
    if (!this.atlasSet) {
      this.atlasSet = true;
      this.root.style.setProperty('--bj-atlas', `url(${bjAtlasCanvas().toDataURL('image/png')})`);
    }
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.table = table;
    this.chair = chair;
    this.pending = null;
    this.error = '';
    this.signature = '';
    this.shown = this.view;
    this.root.classList.toggle('hidden', !this.visible);
    this.render();
  }

  hide(): void {
    this.leaveDialog.close();
    this.root.classList.add('hidden');
    this.table = this.chair = -1;
    this.view = this.shown = null;
    this.pending = null;
    this.holdUntil = 0;
    this.cardCounts = [];
    this.signature = '';
    this.rulesEl.classList.add('hidden');
    this.banner.className = 'bj-banner';
    if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
    this.previousFocus = null;
  }

  /** Карты и фишки в 3D в воздухе до этого performance.now()-момента: до него показываем прошлый вид и держим кнопки. */
  setHold(until: number): void {
    this.holdUntil = Math.max(this.holdUntil, until);
  }

  setView(view: BlackjackView, now = performance.now()): void {
    if (view.table !== BJ_TABLE || (this.view && view.rev < this.view.rev)) return;
    this.view = view;
    this.recvAt = now;
    if (this.pending && view.rev > this.pending.rev) {
      this.pending = null;
      this.error = '';
    }
    if (this.shown && view.rev > this.shown.rev && now < this.holdUntil) {
      // карты ещё летят: показываем прошлый вид, новый — когда упадут (повтор той же версии с новым таймером — сразу)
    } else {
      this.shown = view;
    }
    this.render();
  }

  setBalance(balance: number): void {
    if (this.balance === balance) return;
    this.balance = balance;
    this.render();
  }

  /** Только при явном отказе сервера, не по таймауту. */
  onError(message = 'Сервер отклонил действие. Проверь состояние стола.'): void {
    this.pending = null;
    this.error = message;
    this.render();
  }

  escape(): void {
    if (this.leaveDialog.open) {
      this.leaveDialog.close();
      return;
    }
    if (!this.rulesEl.classList.contains('hidden')) {
      this.rulesEl.classList.add('hidden');
      return;
    }
    if (this.locked) this.leaveDialog.showModal();
    else this.onLeave();
  }

  /** Клавиши: H / S / D / P — ходы, 0 / 1 / 2 / 3 — фишки (бесплатно, 10, 20, 50), R — повторить. */
  onKey(event: KeyboardEvent): boolean {
    if (!this.visible || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return false;
    if (event.code === 'Escape') {
      this.escape();
      return true;
    }
    const target = event.target;
    if (this.leaveDialog.open || (target instanceof HTMLElement && target.closest('input, textarea, select'))) return false;
    // ходы и ставки забирают клавишу только когда они сейчас возможны — иначе S / D (как шаг) по-прежнему встают из-за стола
    const allowed = this.shown?.seats[this.chair]?.actions ?? [];
    const action = KEY_ACTION[event.code];
    if (action && allowed.includes(action)) {
      this.send(action);
      return true;
    }
    if (!allowed.includes('bet')) return false;
    const chip = KEY_CHIP[event.code];
    if (chip !== undefined) {
      this.send('bet', chip);
      return true;
    }
    if (event.code === 'KeyR' && this.lastBet >= 0) {
      this.send('bet', this.lastBet);
      return true;
    }
    return false;
  }

  /** Раз в кадр: кольцо таймера, секунды до раздачи, готовность после полёта карт. */
  tick(now: number): void {
    if (!this.visible) return;
    const ready = now >= this.holdUntil;
    if (this.view !== this.shown && ready) {
      this.shown = this.view;
      this.render();
    } else if (ready !== this.ready) {
      this.render();
    }
    const v = this.view;
    const left = v ? Math.max(0, v.left - (now - this.recvAt)) : 0;
    if (this.ringFg) {
      const k = Math.max(0, Math.min(1, left / TURN_MS));
      this.ringFg.style.strokeDashoffset = String(100 * (1 - k));
      this.ringFg.classList.toggle('low', left < 5000);
    }
    if (this.countdownEl) this.countdownEl.textContent = String(Math.max(0, Math.ceil(left / 1000)));
    if (this.pending && now - this.pending.at > 5000) this.status.textContent = 'Ждём подтверждение сервера…';
  }

  // ------------------------------------------------------------ отправка

  private button(label: string, action: string, callback: () => void, disabled = false): HTMLButtonElement {
    const button = element('button', 'bj-button', label);
    button.type = 'button';
    button.dataset.bjAction = action;
    button.disabled = disabled;
    button.addEventListener('click', callback);
    return button;
  }

  private send(action: BlackjackAct, amount?: number): void {
    const v = this.view;
    if (!v || this.pending || v !== this.shown || performance.now() < this.holdUntil) return;
    const mine = v.seats[this.chair];
    if (!mine?.actions.includes(action)) return;
    if (action === 'bet') {
      if ((amount !== 0 && !BJ_BETS.some((bet) => bet === amount)) || this.balance < (amount ?? Infinity)) return;
    }
    if ((action === 'double' || action === 'split') && this.balance < (mine.hands[v.hand]?.bet ?? Infinity)) return;
    this.pending = { rev: v.rev, at: performance.now() };
    this.error = '';
    if (action === 'bet') this.lastBet = amount!;
    this.render();
    this.onAct(action, v.rev, amount);
  }

  // ------------------------------------------------------------ отрисовка

  private render(): void {
    if (!this.visible) return;
    const v = this.shown;
    const now = performance.now();
    this.ready = now >= this.holdUntil;
    const mine = v?.seats[this.chair];
    this.balanceEl.textContent = `🪙 ${this.balance}`;
    const signature = JSON.stringify([v && { ...v, left: 0 }, this.balance, this.lastBet, !!this.pending, this.error, this.ready, v !== this.view]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.ringFg = null;
    this.countdownEl = null;
    this.panelState(v, mine);
    this.renderStrip(v);
    this.renderHands(v, mine);
    this.renderBanner(v, mine);
    this.renderActions(v, mine);
    this.tick(now);
  }

  private panelState(v: BlackjackView | null, mine: BlackjackSeatView | undefined): void {
    const myTurn = !!v && v.phase === 'play' && v.turn === this.chair;
    this.root.classList.toggle('my-turn', myTurn);
    this.panelStatus(v, mine, myTurn);
  }

  /** Строка состояния над кнопками. */
  private panelStatus(v: BlackjackView | null, mine: BlackjackSeatView | undefined, myTurn: boolean): void {
    this.status.replaceChildren();
    const say = (text: string, cls = ''): void => {
      this.status.append(element('span', cls, text));
    };
    if (this.error) return say(this.error, 'bad');
    if (this.pending) return say('Отправлено · ждём сервер…');
    if (!v || !mine) return say('Подключаемся к столу…');
    if (v !== this.view || !this.ready) {
      const next = this.view?.phase;
      return say(next === 'dealer' || next === 'result' ? 'Дилер открывает карты…' : 'Раздаём карты…');
    }
    const countdown = (): void => {
      this.countdownEl = element('b', 'bj-count');
      this.status.append(this.countdownEl);
    };
    switch (v.phase) {
      case 'betting':
        return say(mine.participating ? 'Ставка принята' : 'Сделай ставку — и начнём');
      case 'countdown':
        if (mine.participating) {
          say(mine.bet > 0 ? `Ставка ${mine.bet} · раздача через ` : 'Играешь бесплатно · раздача через ');
          countdown();
          return;
        }
        say('Скоро раздача — успей поставить · ');
        countdown();
        return;
      case 'play':
        if (myTurn) return say(mine.hands.length > 1 ? `Твой ход · рука ${v.hand + 1} из ${mine.hands.length}` : 'Твой ход', 'turn');
        if (!mine.participating) return say(`Раунд идёт · ходит ${v.seats[v.turn]?.nick || 'игрок'}`);
        return say(`Ходит ${v.seats[v.turn]?.nick || 'игрок'}…`);
      case 'dealer':
        return say('Дилер открывает карты…');
      case 'result':
        say('Новый раунд через ');
        countdown();
        this.status.append(element('span', '', ' с'));
        return;
    }
  }

  private renderStrip(v: BlackjackView | null): void {
    this.strip.replaceChildren();
    if (!v) return;
    const dealer = element('span', 'bj-pill dealer');
    const dn = v.dealer.length;
    const up = v.dealer[0];
    dealer.textContent = dn
      ? v.dealerTotal === null ? `Дилер · ${up === undefined || up < 0 ? '?' : cardValue(up)} + ?` : `Дилер · ${v.dealerTotal}${v.dealerTotal > 21 ? ' перебор' : ''}`
      : 'Дилер';
    if (v.dealerTotal !== null && v.dealerTotal > 21) dealer.classList.add('bad');
    this.strip.append(dealer);
    v.seats.forEach((seat, c) => {
      if (!seat.k) return;
      const active = v.phase === 'play' && v.turn === c;
      const pill = element('span', `bj-pill${c === this.chair ? ' me' : ''}${active ? ' turn' : ''}${seat.away ? ' away' : ''}`);
      const who = c === this.chair ? 'Ты' : seat.nick || 'Игрок';
      let tail: string;
      if (v.phase === 'result' && seat.hands.length) {
        const net = seat.hands.reduce((s, h) => s + h.payout - h.bet, 0);
        const free = seat.hands.every((h) => h.bet === 0);
        tail = free ? seat.hands.map((h) => (h.result ? RESULT_WORD[h.result] : '')).join(' / ') : net === 0 ? 'ничья' : coins(net);
        const won = net > 0 || (free && seat.hands.some((h) => h.result === 'win' || h.result === 'blackjack'));
        if (won) pill.classList.add('good');
        else if (net < 0) pill.classList.add('bad');
      } else if (seat.hands.length) {
        tail = seat.hands.map((h) => (h.status === 'bust' ? `${h.total}✕` : h.status === 'blackjack' ? '21!' : String(h.total))).join(' / ');
      } else {
        tail = seat.participating ? (seat.bet > 0 ? `ставка ${seat.bet}` : 'бесплатно') : 'смотрит';
      }
      pill.textContent = `${active ? '▶ ' : ''}${who} · ${tail}`;
      this.strip.append(pill);
    });
  }

  private renderHands(v: BlackjackView | null, mine: BlackjackSeatView | undefined): void {
    this.me.replaceChildren();
    if (!v || !mine) return;
    if (!mine.hands.length) {
      this.cardCounts = [];
      this.me.append(element('p', 'bj-hint', 'Твои карты появятся здесь'));
      return;
    }
    const known = this.cardCounts;
    this.cardCounts = mine.hands.map((hand) => hand.cards.length);
    mine.hands.forEach((hand, h) => {
      const active = v.phase === 'play' && v.turn === this.chair && v.hand === h;
      const box = element('div', `bj-hand${active ? ' on' : ''}${hand.status === 'bust' ? ' bust' : ''}${hand.status === 'blackjack' ? ' natural' : ''}`);
      const cards = element('div', 'bj-cards');
      const before = known[h] ?? 0;
      hand.cards.forEach((c, i) => cards.append(cardEl(c, i >= before ? 'new' : '')));
      const total = element('div', 'bj-total');
      total.append(element('b', '', String(hand.total)));
      if (active) {
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('class', 'bj-ring');
        svg.setAttribute('viewBox', '0 0 64 64');
        const bg = document.createElementNS(NS, 'circle');
        const fg = document.createElementNS(NS, 'circle');
        for (const circle of [bg, fg]) {
          circle.setAttribute('cx', '32');
          circle.setAttribute('cy', '32');
          circle.setAttribute('r', '29');
        }
        bg.setAttribute('class', 'bg');
        fg.setAttribute('class', 'fg');
        fg.setAttribute('pathLength', '100');
        svg.append(bg, fg);
        total.append(svg);
        this.ringFg = fg;
      }
      let note = '';
      if (v.phase === 'result' && hand.result) note = RESULT_WORD[hand.result];
      else if (hand.status === 'bust') note = 'перебор';
      else if (hand.status === 'blackjack') note = 'блэкджек!';
      else if (hand.status === 'stood') note = 'хватит';
      else if (hand.soft) note = 'мягкая';
      const meta = element('div', 'bj-meta');
      meta.append(element('span', 'bj-note', note || (active ? 'твой ход' : '')));
      if (hand.bet > 0) meta.append(element('span', 'bj-stake', `🪙 ${hand.bet}`));
      else meta.append(element('span', 'bj-stake', 'бесплатно'));
      box.append(cards, total, meta);
      this.me.append(box);
    });
  }

  private renderBanner(v: BlackjackView | null, mine: BlackjackSeatView | undefined): void {
    const hands = mine?.hands ?? [];
    if (!v || v.phase !== 'result' || !hands.length || v !== this.view) {
      this.banner.className = 'bj-banner';
      this.banner.replaceChildren();
      return;
    }
    const net = hands.reduce((s, h) => s + h.payout - h.bet, 0);
    const free = hands.every((h) => h.bet === 0);
    const natural = hands.some((h) => h.result === 'blackjack');
    const win = hands.some((h) => h.result === 'win' || h.result === 'blackjack');
    const bust = hands.every((h) => h.status === 'bust');
    const dealerNatural = v.dealer.length === 2 && v.dealerTotal === 21;
    let title: string;
    let tone: string;
    if (natural) {
      title = 'Блэкджек!';
      tone = 'gold';
    } else if (hands.length > 1) {
      title = net > 0 ? 'Победа!' : net < 0 ? 'Проигрыш' : 'Поровну';
      tone = net > 0 ? 'win' : net < 0 ? 'loss' : 'push';
    } else if (win) {
      title = 'Победа!';
      tone = 'win';
    } else if (hands[0].result === 'push') {
      title = 'Ничья';
      tone = 'push';
    } else if (bust) {
      title = 'Перебор!';
      tone = 'loss';
    } else {
      title = dealerNatural ? 'У дилера блэкджек' : 'Проигрыш';
      tone = 'loss';
    }
    const sub = free ? 'играли бесплатно' : net !== 0 ? `${coins(net)} 🪙` : hands.length > 1 ? '0 🪙' : 'ставка вернулась';
    const detail = hands.length > 1 ? hands.map((h, i) => `рука ${i + 1}: ${h.result ? RESULT_WORD[h.result] : '—'}`).join(' · ') : '';
    const key = `${title}|${sub}|${detail}`;
    if (this.banner.dataset.key === key && this.banner.classList.contains('show')) return;
    this.banner.dataset.key = key;
    this.banner.className = `bj-banner show ${tone}`;
    this.banner.replaceChildren(element('div', 'bj-banner-title', title), element('div', 'bj-banner-sub', sub));
    if (detail) this.banner.append(element('div', 'bj-banner-detail', detail));
    if (natural) {
      for (let i = 0; i < 14; i++) {
        const spark = element('i', 'bj-spark', i % 3 ? '🪙' : '✨');
        spark.style.setProperty('--x', `${Math.round((i / 13) * 100)}%`);
        spark.style.setProperty('--d', `${(i % 5) * 0.08}s`);
        spark.style.setProperty('--r', `${(i * 47) % 40 - 20}deg`);
        this.banner.append(spark);
      }
    }
  }

  private renderActions(v: BlackjackView | null, mine: BlackjackSeatView | undefined): void {
    this.buttons.replaceChildren();
    if (!v || !mine || v !== this.view || !this.ready) return;
    const live = !this.pending;
    const allowed = mine.actions;
    const myTurn = v.phase === 'play' && v.turn === this.chair;
    if (allowed.includes('bet')) {
      const row = element('div', 'bj-chips');
      for (const stake of CHIPS) {
        const chip = element('button', stake ? `bj-chip c${stake}` : 'bj-free');
        chip.type = 'button';
        chip.dataset.bjAction = `stake-${stake}`;
        chip.disabled = !live || this.balance < stake;
        chip.setAttribute('aria-label', stake ? `Поставить ${stake}` : 'Играть бесплатно');
        chip.append(element('b', '', stake ? String(stake) : 'Бесплатно'), element('kbd', '', String(BJ_BETS.indexOf(stake))));
        chip.addEventListener('click', () => this.send('bet', stake));
        row.append(chip);
      }
      this.buttons.append(row);
      if (this.lastBet >= 0) {
        const again = element('button', 'bj-button again');
        again.type = 'button';
        again.dataset.bjAction = 'repeat';
        again.disabled = !live || this.balance < this.lastBet;
        again.append(document.createTextNode(this.lastBet ? `↻ Повторить ${this.lastBet}` : '↻ Повторить бесплатно'), element('kbd', '', 'R'));
        again.addEventListener('click', () => this.send('bet', this.lastBet));
        this.buttons.append(again);
      }
    }
    if (allowed.includes('cancel')) {
      const cancel = this.button(mine.bet > 0 ? `Убрать ставку ${mine.bet}` : 'Не играть этот раунд', 'cancel', () => this.send('cancel'), !live);
      cancel.classList.add('cancel');
      this.buttons.append(cancel);
    }
    if (myTurn) {
      for (const { act, label, key, cls } of ACTIONS) {
        if (!allowed.includes(act) && (act === 'double' || act === 'split')) continue;
        const extra = act === 'double' || act === 'split' ? mine.hands[v.hand]?.bet ?? 0 : 0;
        const enough = this.balance >= extra;
        const btn = element('button', `bj-act-btn ${cls}`);
        btn.type = 'button';
        btn.dataset.bjAction = act;
        btn.disabled = !live || !allowed.includes(act) || !enough;
        btn.append(element('span', 'bj-act-label', label), element('kbd', '', key));
        if (extra) btn.append(element('small', '', `+${extra} 🪙`));
        if (extra && !enough) btn.title = `Не хватает жетонов: нужно ещё ${extra}`;
        btn.addEventListener('click', () => this.send(act));
        this.buttons.append(btn);
      }
    }
  }
}

/** Очки открытой карты для строки «Дилер · 8 + ?». */
function cardValue(c: number): number {
  const rank = c % 13;
  return rank === 0 ? 11 : Math.min(rank + 1, 10);
}
