// Панель бильярдного стола: ставка (фишки + своя сумма, как в блэкджеке), предложение и приём партии, ожидание
// соперника с тренировкой, ход с таймером, «Сдаться», итог. Счёт и банк — сверху, шкала силы — справа.
// Панель только показывает стол с сервера и шлёт действия; деньги, очереди и итог решает сервер.
import { BL_CHIPS, BL_MAX_BET, BL_RULES_FOUL, BL_RULES_SHORT, BL_TURN_TICKS, BL_WIN, blMaxBet, type BlTableView } from '../../shared/billiards.ts';
import { TICK_MS } from '../../shared/constants.ts';
import './billiards.css';

export type BlHudAction = { a: 'offer'; amount: number } | { a: 'cancel' } | { a: 'accept'; amount: number } | { a: 'rack' } | { a: 'resign' };

const TURN_MS = BL_TURN_TICKS * TICK_MS;

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

export class BilliardsHud {
  onAction: (act: BlHudAction) => void = () => {};
  onLeave: () => void = () => {};
  private readonly root = el('section', 'bl hidden');
  private readonly top = el('div', 'bl-top');
  private readonly banner = el('div', 'bl-banner');
  private readonly power = el('div', 'bl-power');
  private readonly powerFill = el('i');
  private readonly powerNum = el('em');
  private readonly titleEl = el('div', 'bl-title');
  private readonly noteEl = el('div', 'bl-note');
  private readonly status = el('p', 'bl-status');
  private readonly betRow = el('div', 'bl-row');
  private readonly goRow = el('div', 'bl-row');
  private readonly help = el('div', 'bl-help');
  private readonly input = document.createElement('input');
  private readonly limitEl = el('small', 'bl-limit');
  private readonly chipBtns: Array<{ btn: HTMLButtonElement; chip: number }> = [];
  private readonly goBtn = el('button', 'bl-go');
  private readonly whyEl = el('span', 'bl-why');
  private readonly cancelBtn = el('button', 'bj-button', 'Забрать ставку');
  private readonly rackBtn = el('button', 'bj-button', 'Расставить заново');
  private readonly resignBtn = el('button', 'bj-button', 'Сдаться');
  private readonly balanceEl = el('div', 'bl-balance');
  private readonly dialog = document.createElement('dialog');
  private view: BlTableView | null = null;
  private recvAt = 0;
  private table = -1;
  private side = -1;
  private myPid = 0;
  private balance = 0;
  private draft = 0;
  private lastAmount = 0;
  private bannerKey = '';
  private errUntil = 0;
  private go: (() => void) | null = null;
  /** Шары катятся у себя (анимация удара ещё идёт) */
  private animating = false;

  constructor(parent: HTMLElement) {
    this.root.setAttribute('aria-label', 'Бильярд');
    this.status.setAttribute('role', 'status');
    this.power.append(this.powerFill, this.powerNum);

    const info = el('div', 'bl-info');
    info.append(this.titleEl, el('div', 'bl-rules', BL_RULES_SHORT), el('div', 'bl-rules', BL_RULES_FOUL), this.noteEl);

    const chips = el('div', 'bl-chips');
    BL_CHIPS.forEach((chip, i) => {
      const btn = el('button', `bj-chip c${chip}`);
      btn.type = 'button';
      btn.title = `+${chip} к ставке (${i + 1})`;
      btn.append(el('b', '', String(chip)));
      btn.addEventListener('click', () => this.setDraft(Math.min(blMaxBet(this.balance), this.draft + chip)));
      chips.append(btn);
      this.chipBtns.push({ btn, chip });
    });
    this.input.className = 'bj-input';
    this.input.inputMode = 'numeric';
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
    const reset = el('button', 'bj-button', 'Сбросить');
    reset.type = 'button';
    reset.addEventListener('click', () => this.setDraft(0));
    this.betRow.append(chips, this.input, reset, this.limitEl);

    for (const b of [this.goBtn, this.cancelBtn, this.rackBtn, this.resignBtn]) b.type = 'button';
    this.goBtn.addEventListener('click', () => this.go?.());
    this.cancelBtn.addEventListener('click', () => this.onAction({ a: 'cancel' }));
    this.rackBtn.addEventListener('click', () => this.onAction({ a: 'rack' }));
    this.resignBtn.addEventListener('click', () => this.dialog.showModal());
    this.goRow.append(this.goBtn, this.whyEl, this.cancelBtn, this.rackBtn, this.resignBtn);

    const act = el('div', 'bl-act');
    act.append(this.status, this.betRow, this.goRow, this.help);

    const side = el('div', 'bl-side');
    const leave = el('button', 'bj-button', 'Встать');
    leave.type = 'button';
    leave.append(el('kbd', '', 'Esc'));
    leave.addEventListener('click', () => this.escape());
    side.append(this.balanceEl, leave);

    const bar = el('div', 'bl-bar');
    bar.append(info, act, side);

    this.dialog.className = 'bj-dialog';
    const row = el('div', 'bj-actions-row');
    const stay = el('button', 'bj-button', 'Играть дальше');
    stay.dataset.bjAction = 'stay';
    stay.addEventListener('click', () => this.dialog.close());
    const give = el('button', 'bj-button', 'Сдаться');
    give.dataset.bjAction = 'leave-confirm';
    give.addEventListener('click', () => {
      this.dialog.close();
      this.onAction({ a: 'resign' });
    });
    row.append(stay, give);
    this.dialog.append(el('h2', '', 'Сдаться?'), el('p', '', 'Партия закончится сразу, банк уйдёт сопернику.'), row);

    this.root.append(this.top, this.banner, this.power, bar, this.dialog);
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
    this.titleEl.textContent = `Бильярд · стол ${table + 1}`;
    this.root.classList.remove('hidden');
    this.render();
  }

  hide(): void {
    this.table = -1;
    this.side = -1;
    if (this.dialog.open) this.dialog.close();
    this.input.blur();
    this.root.classList.add('hidden');
    this.setPower(null);
  }

  setView(v: BlTableView, now = performance.now()): void {
    if (v.table !== this.table) return;
    const prev = this.view;
    this.view = v;
    this.recvAt = now;
    if (v.offer && v.offer.by === this.side) this.lastAmount = v.offer.amount;
    if (v.phase === 'match' && v.bet) this.lastAmount = v.bet;
    // реванш: после итога в поле — прошлая ставка
    if (prev?.phase === 'result' && v.phase === 'open') this.setDraft(Math.min(this.lastAmount, blMaxBet(this.balance)), false);
    if (v.phase === 'result' && v.winner >= 0) this.showBanner(v);
    this.render();
  }

  setBalance(n: number): void {
    this.balance = n;
    this.render();
  }

  setAnimating(on: boolean): void {
    if (on === this.animating) return;
    this.animating = on;
    this.render();
  }

  /** Шкала силы: null — спрятать, иначе 0…1 */
  setPower(p: number | null): void {
    this.power.classList.toggle('on', p !== null);
    if (p === null) return;
    this.powerFill.style.height = `${Math.round(p * 100)}%`;
    this.powerNum.textContent = `${Math.round(p * 100)}%`;
  }

  error(text: string): void {
    this.noteEl.textContent = text;
    this.noteEl.classList.add('bl-err');
    this.errUntil = performance.now() + 3500;
  }

  /** Esc: в партии — спросить «сдаться?», иначе встать. */
  escape(): void {
    if (this.dialog.open) {
      this.dialog.close();
      return;
    }
    if (this.view?.phase === 'match' && this.mine()) this.dialog.showModal();
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
    if (i && !this.betRow.classList.contains('hidden')) {
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

  /** Раз в кадр: таймер и снятие ошибки. */
  tick(now: number): void {
    if (!this.visible) return;
    if (this.errUntil && now > this.errUntil) {
      this.errUntil = 0;
      this.noteEl.classList.remove('bl-err');
      this.noteEl.textContent = this.view?.note ?? '';
    }
    const v = this.view;
    if (v?.phase === 'match') this.renderStatus(now);
  }

  /** В партии ли я (сижу на одной из сторон). */
  private mine(): boolean {
    const v = this.view;
    return !!v && this.side >= 0 && v.seats[this.side]?.pid === this.myPid;
  }

  private setDraft(n: number, render = true): void {
    this.draft = Math.max(0, Math.min(BL_MAX_BET, Math.floor(n)));
    this.input.value = this.draft ? String(this.draft) : '';
    if (render) this.render();
  }

  private showBanner(v: BlTableView): void {
    const key = `${v.table}:${v.shot}:${v.winner}`;
    if (key === this.bannerKey || !this.mine()) return;
    this.bannerKey = key;
    const won = v.winner === this.side;
    const bank = v.bet * 2;
    this.banner.className = `bl-banner ${won ? 'win' : 'loss'}`;
    this.banner.replaceChildren(
      el('div', 'bl-banner-title', won ? 'Победа!' : 'Поражение'),
      el('div', 'bl-banner-sub', won ? (bank ? `+${bank} 🪙` : `${v.score[this.side]}:${v.score[1 - this.side]}`) : v.why === 'resign' ? 'ты сдался' : v.why === 'away' ? 'не вернулся вовремя' : `${v.score[this.side]}:${v.score[1 - this.side]}`),
    );
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }

  private render(): void {
    const v = this.view;
    if (!this.visible || !v) return;
    if (!this.errUntil) this.noteEl.textContent = v.note;
    this.balanceEl.textContent = `${this.balance} 🪙`;
    const me = this.side, opp = 1 - me;
    this.root.classList.toggle('my-turn', v.phase === 'match' && v.turn === me && !this.animating);
    // сверху: счёт и банк в партии
    this.top.replaceChildren();
    if (v.phase !== 'open') {
      const pill = (s: number) => {
        const seat = v.seats[s];
        const p = el('div', `bl-pill${v.phase === 'match' && v.turn === s ? ' turn' : ''}${seat?.away ? ' away' : ''}`);
        p.append(el('span', '', s === me ? 'Ты' : seat?.nick ?? '—'), el('b', '', String(v.score[s])));
        return p;
      };
      this.top.append(pill(me), el('div', 'bl-bank', v.bet ? `банк ${v.bet * 2} 🪙 · до ${BL_WIN}` : `без ставки · до ${BL_WIN}`), pill(opp));
    }
    const show = (n: HTMLElement, on: boolean) => { n.hidden = !on; };
    this.go = null;
    this.whyEl.textContent = '';
    let bet = false, go = false, cancel = false, rack = false, resign = false;
    if (v.phase === 'open') {
      rack = true;
      const offer = v.offer;
      if (!offer) {
        bet = go = true;
        const can = this.draft <= this.balance;
        this.goBtn.className = 'bl-go';
        this.goBtn.textContent = this.draft > 0 ? `Предложить партию · ${this.draft} 🪙` : 'Предложить партию без ставки';
        this.goBtn.disabled = !can;
        if (!can) this.whyEl.textContent = `у тебя ${this.balance} 🪙 — не хватает`;
        const amount = this.draft;
        if (can) this.go = () => this.onAction({ a: 'offer', amount });
      } else if (offer.by === me) {
        cancel = offer.amount > 0;
        if (!cancel) { go = true; this.goBtn.className = 'bl-go'; this.goBtn.textContent = 'Отменить предложение'; this.goBtn.disabled = false; this.go = () => this.onAction({ a: 'cancel' }); }
      } else {
        go = true;
        const can = offer.amount <= this.balance;
        this.goBtn.className = 'bl-go green';
        this.goBtn.textContent = offer.amount ? `Принять · ${offer.amount} 🪙` : 'Принять партию';
        this.goBtn.disabled = !can;
        if (!can) this.whyEl.textContent = `нужно ${offer.amount} 🪙, у тебя ${this.balance}`;
        const amount = offer.amount;
        if (can) this.go = () => this.onAction({ a: 'accept', amount });
      }
    } else if (v.phase === 'match') {
      resign = this.mine();
    }
    show(this.betRow, bet);
    this.betRow.classList.toggle('hidden', !bet);
    show(this.goBtn, go);
    show(this.cancelBtn, cancel);
    show(this.rackBtn, rack);
    this.rackBtn.disabled = this.animating;
    show(this.resignBtn, resign);
    if (bet) {
      const cap = blMaxBet(this.balance);
      for (const { btn, chip } of this.chipBtns) btn.disabled = this.draft + chip > cap;
      this.limitEl.textContent = cap <= 0 ? 'жетонов нет — можно без ставки' : cap < BL_MAX_BET ? `до ${cap} — столько у тебя` : `до ${BL_MAX_BET} — лимит стола`;
      this.limitEl.classList.toggle('low', cap < BL_MAX_BET);
    }
    this.help.innerHTML = v.phase === 'result' ? '' : v.phase === 'match' && v.turn !== me
      ? 'Смотри удар соперника · <kbd>Esc</kbd> — сдаться'
      : 'Курсор — прицел · зажми <kbd>ЛКМ</kbd> и тяни — сила, отпусти — удар · <kbd>ПКМ</kbd> — отмена · <kbd>Пробел</kbd> — замах';
    this.renderStatus(performance.now());
  }

  private renderStatus(now: number): void {
    const v = this.view;
    if (!v) return;
    const me = this.side;
    const elapsed = now - this.recvAt;
    const parts: Array<[string, string]> = [];
    if (v.phase === 'open') {
      const offer = v.offer;
      const other = v.seats[1 - me];
      if (!offer) parts.push(['', other ? `Тренировка вдвоём с ${other.nick}. Предложи партию — второй примет` : 'Тренировка: бей сколько хочешь. Предложи партию — и жди соперника']);
      else if (offer.by === me) parts.push(['gold', offer.amount ? `Ставка ${offer.amount} 🪙 в банке — ждём соперника` : 'Ждём соперника, партия без ставки'], ['', ' · пока можно тренироваться']);
      else parts.push(['gold', `${v.seats[offer.by]?.nick ?? 'Соперник'} предлагает партию${offer.amount ? ` на ${offer.amount} 🪙 · банк ${offer.amount * 2}, победителю всё, комиссии нет` : ' без ставки'}`]);
    } else if (v.phase === 'match') {
      const rolling = this.animating || v.rolling - elapsed > 0;
      const left = Math.min(TURN_MS, Math.max(0, v.left - elapsed));
      const away = v.seats[1 - me]?.away;
      if (rolling) parts.push(['', 'Шары катятся…']);
      else if (v.turn === me) parts.push(['gold', 'Твой удар'], [left < 8000 ? 'bad' : '', ` · ${clock(left)}`]);
      else parts.push(['', `Бьёт ${v.seats[v.turn]?.nick ?? 'соперник'}`], [left < 8000 ? 'bad' : '', ` · ${clock(left)}`]);
      if (away) parts.push(['bad', ` · соперник отошёл, ждём ${clock(away - elapsed)}`]);
    } else {
      const won = v.winner === me;
      parts.push([won ? 'gold' : 'bad', won ? `Победа${v.bet ? ` · +${v.bet * 2} 🪙` : ''}` : 'Поражение'], ['', ' · сейчас расставим заново, можно реванш']);
    }
    const key = parts.map((p) => p.join('|')).join('/');
    if (this.status.dataset.key === key) return;
    this.status.dataset.key = key;
    this.status.replaceChildren(...parts.map(([cls, text]) => el('span', cls, text)));
  }
}
