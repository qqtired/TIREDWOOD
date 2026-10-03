import { BJ_BETS, BJ_TABLE, cardName, isRed, type BlackjackAct, type BlackjackView } from '../../shared/blackjack.ts';
import './blackjack.css';

const RULES = [
  'Набери больше дилера, не превысив 21. Туз — 1 или 11; картинки — 10. Шуз: 6 колод по 52 карты.',
  'Дилер берёт до 17 и останавливается на любых 17, включая мягкие. Его вторая карта закрыта до хода дилера.',
  'Блэкджек из первых двух карт даёт прибыль 3:2; обычная победа — 1:1; ничья возвращает ставку.',
  '«Удвоить»: ещё одна такая же ставка, одна карта и стоп. «Разделить»: пара одного достоинства, ещё одна ставка и две руки.',
  'Разделить можно один раз. Разделённые тузы получают по одной карте. 21 после разделения — обычная победа, не блэкджек.',
  'Страховки и сдачи нет. Играть можно одному. Новая ставка всегда требует твоего нажатия.',
  'Можно играть бесплатно: все ходы доступны, но выигрыши и опыт не начисляются. Удвоение и разделение бесплатной руки тоже бесплатны.',
];
const RESULT_NAMES = { win: 'Победа', loss: 'Проигрыш', push: 'Ничья', blackjack: 'Блэкджек' } as const;
const PHASE_NAMES = { betting: 'Приём ставок', countdown: 'Скоро раздача', play: 'Ходы игроков', dealer: 'Ход дилера', result: 'Итог раунда' } as const;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  node.textContent = text;
  return node;
}

function card(c: number): HTMLElement {
  const node = element('span', `bj-card${c < 0 ? ' bj-card-back' : isRed(c) ? ' bj-card-red' : ''}`, c < 0 ? '◆' : cardName(c));
  node.setAttribute('aria-label', c < 0 ? 'Закрытая карта' : cardName(c));
  return node;
}

/** Read-only render of the server view. Every stake/action is sent once with its revision. */
export class BlackjackHud {
  onAct: (action: BlackjackAct, rev: number, amount?: number) => void = () => {};
  onLeave: () => void = () => {};
  private readonly root = element('section', 'bj hidden');
  private readonly panel = element('div', 'bj-panel');
  private readonly status = element('p', 'bj-status');
  private readonly content = element('div', 'bj-content');
  private readonly timer = element('span', 'bj-timer');
  private readonly balanceEl = element('span', 'bj-balance');
  private readonly rules = element('details', 'bj-rules');
  private readonly leaveDialog = document.createElement('dialog');
  private view: BlackjackView | null = null;
  private chair = -1;
  private table = -1;
  private balance = 0;
  private selected = 0;
  private lastBet = -1;
  private recvAt = 0;
  private pending: { rev: number; at: number } | null = null;
  private error = '';
  private signature = '';
  private previousFocus: HTMLElement | null = null;
  private lastResult: { text: string; net: number } | null = null;

  constructor(parent: HTMLElement) {
    this.root.setAttribute('aria-label', 'Блэкджек');
    this.status.setAttribute('role', 'status');
    const header = element('div', 'bj-header');
    header.append(element('h2', 'bj-title', 'Блэкджек'), this.timer, this.balanceEl);
    const leave = this.button('Встать · Esc', 'leave', () => this.escape());
    leave.classList.add('bj-leave');
    header.append(leave);
    const summary = element('summary', '', 'Правила · выплаты и действия');
    const list = element('ul');
    for (const text of RULES) list.append(element('li', '', text));
    this.rules.append(summary, list);
    this.panel.append(header, this.status, this.content, this.rules);
    this.root.append(this.panel);
    this.leaveDialog.className = 'bj-dialog';
    this.leaveDialog.setAttribute('aria-labelledby', 'bj-leave-title');
    const title = element('h2', '', 'Встать из-за стола?');
    title.id = 'bj-leave-title';
    const text = element('p', '', 'Сервер завершит текущую руку и рассчитает итог. Новых ставок без тебя не будет.');
    const buttons = element('div', 'bj-actions');
    buttons.append(this.button('Остаться', 'stay', () => this.leaveDialog.close()), this.button('Встать', 'leave-confirm', () => {
      this.leaveDialog.close();
      this.onLeave();
    }));
    this.leaveDialog.append(title, text, buttons);
    this.root.append(this.leaveDialog);
    parent.append(this.root);
  }

  get visible(): boolean { return this.table === BJ_TABLE; }
  get locked(): boolean {
    const mine = this.view?.seats[this.chair];
    return !!mine && !!mine.participating && (this.view?.phase === 'play' || this.view?.phase === 'dealer');
  }

  show(table: number, chair: number): void {
    if (this.table === table && this.chair === chair) return;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.table = table;
    this.chair = chair;
    this.pending = null;
    this.error = '';
    this.lastResult = null;
    this.signature = '';
    this.root.classList.toggle('hidden', !this.visible);
    this.render();
    this.root.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }

  hide(): void {
    this.leaveDialog.close();
    this.root.classList.add('hidden');
    this.table = this.chair = -1;
    this.view = null;
    this.pending = null;
    this.lastResult = null;
    this.signature = '';
    this.rules.open = false;
    if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
    this.previousFocus = null;
  }

  setView(view: BlackjackView, now = performance.now()): void {
    if (view.table !== BJ_TABLE || (this.view && view.rev < this.view.rev)) return;
    this.view = view;
    this.recvAt = now;
    if (this.pending && view.rev > this.pending.rev) {
      this.pending = null;
      this.error = '';
    }
    const mine = view.seats[this.chair];
    if (view.phase === 'result' && mine?.hands.length) {
      const payout = mine.hands.reduce((sum, hand) => sum + hand.payout, 0);
      const stake = mine.hands.reduce((sum, hand) => sum + hand.bet, 0);
      this.lastResult = { text: `Возврат ${payout} · ставка ${stake}`, net: payout - stake };
    }
    this.render();
  }

  setBalance(balance: number): void {
    if (this.balance === balance) return;
    this.balance = balance;
    this.render();
  }

  /** Only call for an explicit rejection/ack, never for a speculative client timeout. */
  onError(message = 'Сервер отклонил действие. Проверь состояние стола.'): void {
    this.pending = null;
    this.error = message;
    this.render();
  }

  escape(): void {
    if (this.leaveDialog.open) { this.leaveDialog.close(); return; }
    if (this.rules.open) { this.rules.open = false; return; }
    if (this.locked) this.leaveDialog.showModal();
    else this.onLeave();
  }

  /** The root may forward keys; button-focused Enter/Space keep native browser semantics. */
  onKey(event: KeyboardEvent): boolean {
    if (!this.visible || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return false;
    if (event.code === 'Escape') { this.escape(); return true; }
    if (this.leaveDialog.open || (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, button, summary'))) return false;
    const action = ({ KeyH: 'hit', KeyS: 'stand', KeyD: 'double', KeyP: 'split' } as const)[event.code as 'KeyH'];
    if (!action) return false;
    this.send(action);
    return true;
  }

  tick(now: number): void {
    if (!this.visible) return;
    const v = this.view;
    const left = v ? Math.max(0, Math.ceil((v.left - (now - this.recvAt)) / 1000)) : 0;
    this.timer.textContent = v && v.phase !== 'betting' ? `${left} с` : '';
    if (this.pending && now - this.pending.at > 5000) {
      this.status.textContent = 'Ожидаем подтверждение сервера. Не повторяем ставку автоматически.';
    }
  }

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
    if (!v || this.pending || !v.seats[this.chair]?.actions.includes(action)) return;
    if (action === 'bet' && ((amount !== 0 && !BJ_BETS.some((bet) => bet === amount)) || this.balance < (amount ?? Infinity))) return;
    if ((action === 'double' || action === 'split') && this.balance < (v.seats[this.chair].hands[v.hand]?.bet ?? Infinity)) return;
    this.pending = { rev: v.rev, at: performance.now() };
    this.error = '';
    if (action === 'bet') {
      this.lastBet = amount!;
      this.lastResult = null;
    }
    this.render();
    this.onAct(action, v.rev, amount);
  }

  private render(): void {
    if (!this.visible) return;
    const v = this.view;
    this.balanceEl.textContent = `Баланс ${this.balance}`;
    const mine = v?.seats[this.chair];
    const myTurn = v?.phase === 'play' && v.turn === this.chair;
    let status = !v ? 'Подключаемся к столу…' : PHASE_NAMES[v.phase];
    if (myTurn) status = `Твой ход${(mine?.hands.length ?? 0) > 1 ? ` · рука ${v!.hand + 1}` : ''}. Время вышло — стоп.`;
    else if (v?.phase === 'play') status = `Ходит ${v.seats[v.turn]?.nick || 'игрок'}`;
    if (this.pending) status = 'Отправлено · ждём подтверждение сервера…';
    if (this.error) status = this.error;
    this.status.textContent = status;
    this.panel.setAttribute('aria-busy', this.pending ? 'true' : 'false');
    const signature = JSON.stringify([v && { ...v, left: 0 }, this.balance, this.selected, this.lastBet, !!this.pending, this.lastResult]);
    if (signature === this.signature) { this.tick(performance.now()); return; }
    this.signature = signature;
    const focused = this.content.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.bjAction : undefined;
    this.content.replaceChildren();
    if (!v || !mine) return;
    const table = element('div', 'bj-table-summary');
    const dealer = element('div', 'bj-dealer');
    dealer.append(element('span', 'bj-label', `Дилер · ${v.dealerTotal === null ? '?' : v.dealerTotal}`));
    const dealerCards = element('div', 'bj-cards bj-cards-small');
    v.dealer.forEach((c) => dealerCards.append(card(c)));
    if (!v.dealer.length) dealerCards.append(element('span', 'bj-muted', 'Карты после ставки'));
    dealer.append(dealerCards);
    const seats = element('div', 'bj-seats');
    v.seats.forEach((seat, chair) => {
      if (!seat.k) return;
      const active = v.phase === 'play' && v.turn === chair;
      const seatEl = element('span', `bj-seat${chair === this.chair ? ' bj-seat-me' : ''}${active ? ' bj-seat-active' : ''}`);
      seatEl.textContent = `${active ? '▶ ' : ''}${chair === this.chair ? 'Ты' : seat.nick} · ${seat.bet ? `${seat.bet}` : seat.participating ? 'бесплатно' : 'смотрит'}`;
      seats.append(seatEl);
    });
    table.append(dealer, seats);
    this.content.append(table);
    if (mine.hands.length) {
      const hands = element('div', 'bj-hands');
      mine.hands.forEach((hand, index) => {
        const current = myTurn && v.hand === index;
        const handEl = element('div', `bj-hand${current ? ' bj-hand-active' : ''}`);
        const outcome = hand.result ? RESULT_NAMES[hand.result] : hand.status === 'bust' ? 'Перебор' : hand.status === 'stood' ? 'Стоп' : hand.status === 'blackjack' ? 'Блэкджек' : current ? 'Твой ход' : 'Ожидание';
        handEl.append(element('span', 'bj-label', `${mine.hands.length > 1 ? `Рука ${index + 1} · ` : ''}${hand.total}${hand.soft ? ' · мягкая' : ''} · ${outcome}`));
        const cards = element('div', 'bj-cards');
        hand.cards.forEach((c) => cards.append(card(c)));
        handEl.append(cards, element('span', 'bj-muted', `Ставка ${hand.bet}${hand.result ? ` · возврат ${hand.payout}` : ''}`));
        hands.append(handEl);
      });
      this.content.append(hands);
    }
    if (this.lastResult) {
      const { text, net } = this.lastResult;
      this.content.append(element('p', `bj-result${net > 0 ? ' bj-result-win' : ''}`, `${net > 0 ? '+' : ''}${net} жетонов · ${text}`));
    }
    const actions = element('div', 'bj-actions');
    const allowed = mine.actions;
    if (allowed.includes('bet')) {
      const stakes = element('div', 'bj-stakes');
      stakes.setAttribute('role', 'group');
      stakes.setAttribute('aria-label', 'Размер ставки');
      stakes.append(element('span', 'bj-label', 'Ставка'));
      for (const stake of [0, ...BJ_BETS.filter(bet => bet > 0)]) {
        const button = this.button(stake ? String(stake) : 'Бесплатно', `stake-${stake}`, () => { this.selected = stake; this.render(); }, !!this.pending);
        button.setAttribute('aria-pressed', String(stake === this.selected));
        stakes.append(button);
      }
      actions.append(stakes);
      const bet = this.button(this.selected ? `Поставить ${this.selected}` : 'Играть бесплатно', 'bet', () => this.send('bet', this.selected), !!this.pending || this.balance < this.selected);
      bet.classList.add('bj-primary');
      actions.append(bet);
      if (this.lastBet >= 0) actions.append(this.button(this.lastBet ? `Повторить ${this.lastBet}` : 'Повторить бесплатно', 'repeat', () => this.send('bet', this.lastBet), !!this.pending || this.balance < this.lastBet));
      if (this.balance < this.selected) this.content.append(element('p', 'bj-muted', 'Недостаточно жетонов для выбранной ставки.'));
    }
    if (allowed.includes('cancel')) actions.append(this.button(mine.bet ? `Отменить ставку ${mine.bet}` : 'Отменить участие', 'cancel', () => this.send('cancel'), !!this.pending));
    for (const [action, label] of [['hit', 'Ещё · H'], ['stand', 'Стоп · S'], ['double', 'Удвоить · D'], ['split', 'Разделить · P']] as const) {
      if (myTurn) {
        const extra = action === 'double' || action === 'split' ? mine.hands[v.hand]?.bet ?? 0 : 0;
        const button = this.button(extra ? label.replace(' · ', ` +${extra} · `) : label, action, () => this.send(action), !!this.pending || !allowed.includes(action) || this.balance < extra);
        if (extra && this.balance < extra) button.title = `Нужно ещё ${extra} жетонов`;
        actions.append(button);
      }
    }
    if (v.phase === 'result') actions.append(element('span', 'bj-muted', 'Сохраним место. После итога можно повторить ставку вручную.'));
    if (!myTurn && !allowed.includes('bet') && !mine.participating && v.phase !== 'result') actions.append(element('span', 'bj-muted', 'Ты за столом. Следующий раунд — после текущего.'));
    this.content.append(actions);
    if (focused) {
      const target = [...this.content.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.dataset.bjAction === focused && !button.disabled);
      target?.focus({ preventScroll: true });
    }
    this.tick(performance.now());
  }
}
