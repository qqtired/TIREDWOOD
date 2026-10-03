// Крысиные бега (флаг RATRACE): окно ставки, плашка забега и кнопки «болеть». Окно: шесть крыс (номер в цвете попоны,
// имя, характер, коэффициент забега и шанс), фишки 10/50/100/500 и поле «своя сумма», как в блэкджеке, кнопка «Поставить».
// Ставку решает сервер (server/lobby/ratrace.ts): окно ждёт ответа — принята (закрывается) или нет (причина остаётся
// в окне). Без жетонов кнопка неактивна. Плашка висит у арены: отсчёт, забег (кто впереди), итог и твой выигрыш.
// Кнопки «болеть» — у арены во время отсчёта и забега: клик или клавиши 1–6 (вместо эмоций), не чаще раза в 1,2 с.
import type { ClientMsg, ServerMsg } from '../../shared/messages.ts';
import {
  RAT_ADD_MS, RAT_CHIPS, RAT_COUNT, RAT_MAX_BET, RAT_MAX_PAYOUT, RAT_MIN_BET, RAT_OPEN_MAX_MS, RAT_OPEN_MS, RAT_RTP, RATS, maxRatBet, ratChance, ratWin, ratWon,
  type RatRaceView,
} from '../../shared/ratrace.ts';
import { setCoinText } from '../ui/coin.ts';
import './ratrace.css';

type Outcome = Extract<ServerMsg, { t: 'ratResult' }>;
type BetReply = Extract<ServerMsg, { t: 'ratBet' }>;

const PICK_KEYS: Record<string, number> = {};
for (let i = 0; i < RAT_COUNT; i++) { PICK_KEYS[`Digit${i + 1}`] = i; PICK_KEYS[`Numpad${i + 1}`] = i; }
/** Сколько висит итог на плашке после финиша, мс */
const RESULT_MS = 10_000;
const CHEER_GAP_MS = 1200;
const fmt = new Intl.NumberFormat('ru-RU');
const num = (n: number): string => fmt.format(n);
const pct = (p: number): string => `${(p * 100).toFixed(1).replace('.', ',')} %`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Винительный падеж: «поставить на Пулю», «болеть за Барона» */
const ACC: readonly string[] = ['Пулю', 'Соню', 'Барона', 'Шныря', 'Кексика', 'Ириску'];
export const ratAcc = (i: number): string => ACC[i] ?? RATS[i]?.name ?? '';

export class RatRaceHud {
  onOpen: () => void = () => {};
  onClose: () => void = () => {};
  /** Болеть за крысу (сервер разошлёт всем) */
  onCheer: (rat: number) => void = () => {};
  /** Из 3D: идёт ли забег у этого игрока, кто впереди, итог прошлого забега */
  running: () => boolean = () => false;
  standings: () => number[] | null = () => null;
  resultOrder: () => number[] | null = () => null;
  private readonly send: (msg: ClientMsg) => void;
  private readonly balance: () => number;
  private readonly root: HTMLDialogElement;
  private readonly cards: Array<{ btn: HTMLButtonElement; mult: HTMLElement; chance: HTMLElement }> = [];
  private readonly chipBtns: Array<{ btn: HTMLButtonElement; chip: number }> = [];
  private readonly amount: HTMLInputElement;
  private readonly limit: HTMLElement;
  private readonly go: HTMLButtonElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly state: HTMLElement;
  private readonly others: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly bHead: HTMLElement;
  private readonly bSub: HTMLElement;
  private readonly cheerBar: HTMLElement;
  private readonly cheerBtns: HTMLButtonElement[] = [];
  private bannerKey = '';
  private view: RatRaceView | null = null;
  private viewAt = 0;
  private myPid = 0;
  private pick = -1;
  private draft = 0;
  private pending = 0;
  private error = '';
  private near = false;
  private cheerNear = false;
  private cheerAt = 0;
  /** Моя ставка в идущем (или только что прошедшем) забеге — для итога */
  private myBet: { race: number; rat: number; stake: number } | null = null;
  private outcome: Outcome | null = null;
  private resultAt = -1e9;
  private resultRace = 0;
  /** О каком забеге уже сказали тостом */
  private toasted = 0;

  constructor(overlay: HTMLElement, send: (msg: ClientMsg) => void, balance: () => number) {
    this.send = send;
    this.balance = balance;
    this.root = el('dialog', 'rr-dlg');
    this.root.setAttribute('aria-labelledby', 'rr-title');
    const top = this.root.appendChild(el('div', 'rr-top'));
    top.appendChild(el('h2', '', '🐀 Крысиные бега')).id = 'rr-title';
    const x = top.appendChild(el('button', 'rr-close', '×'));
    x.type = 'button';
    x.title = 'Закрыть · Esc';
    x.setAttribute('aria-label', 'Закрыть окно ставки');
    x.addEventListener('click', () => this.close());
    this.root.appendChild(el('div', 'rr-step', '1. На кого ставишь — ставка на победителя'));
    const grid = this.root.appendChild(el('div', 'rr-rats'));
    RATS.forEach((def, i) => {
      const btn = grid.appendChild(el('button', 'rr-rat'));
      btn.type = 'button';
      btn.style.setProperty('--saddle', def.saddle);
      btn.setAttribute('aria-pressed', 'false');
      const no = btn.appendChild(el('span', 'rr-no', String(i + 1)));
      if (def.saddle === '#e8b923') no.classList.add('dark');
      const txt = btn.appendChild(el('span', 'rr-ratText'));
      txt.appendChild(el('b', 'rr-name', def.name));
      txt.appendChild(el('span', 'rr-trait', def.trait));
      const odds = btn.appendChild(el('span', 'rr-odds'));
      const mult = odds.appendChild(el('b', 'rr-mult'));
      const chance = odds.appendChild(el('span', 'rr-chance'));
      btn.addEventListener('click', () => this.choose(i));
      this.cards.push({ btn, mult, chance });
    });
    this.root.appendChild(el('div', 'rr-step', '2. Сколько'));
    const row = this.root.appendChild(el('div', 'rr-amountRow'));
    const chips = row.appendChild(el('div', 'rr-chips'));
    for (const chip of RAT_CHIPS) {
      const btn = chips.appendChild(el('button', `rr-chip c${chip}`, `+${chip}`));
      btn.type = 'button';
      btn.setAttribute('aria-label', `Добавить ${chip} к ставке`);
      btn.addEventListener('click', () => this.setDraft(this.draft + chip));
      this.chipBtns.push({ btn, chip });
    }
    const field = row.appendChild(el('label', 'rr-field'));
    this.amount = field.appendChild(el('input', 'rr-input'));
    this.amount.type = 'text';
    this.amount.inputMode = 'numeric';
    this.amount.autocomplete = 'off';
    this.amount.maxLength = String(RAT_MAX_BET).length;
    this.amount.placeholder = 'своя сумма';
    this.amount.setAttribute('aria-label', 'Сумма ставки в жетонах');
    field.appendChild(el('i', 'rr-coin', '🪙'));
    this.amount.addEventListener('input', () => {
      const digits = this.amount.value.replace(/\D/g, '').slice(0, 4);
      if (this.amount.value !== digits) this.amount.value = digits;
      this.draft = digits ? Number(digits) : 0;
      this.error = '';
      this.render();
    });
    this.resetBtn = row.appendChild(el('button', 'rr-reset', 'Сбросить'));
    this.resetBtn.type = 'button';
    this.resetBtn.addEventListener('click', () => this.setDraft(0));
    this.limit = this.root.appendChild(el('p', 'rr-limit'));
    this.go = this.root.appendChild(el('button', 'rr-go'));
    this.go.type = 'button';
    this.go.addEventListener('click', () => this.submit());
    this.state = this.root.appendChild(el('p', 'rr-state'));
    this.others = this.root.appendChild(el('p', 'rr-fine rr-others'));
    setCoinText(this.root.appendChild(el('p', 'rr-fine')),
      `Коэффициенты на забег фиксированы: ×3, ×4, ×5, ×7, ×12, ×25 — сервер раздаёт их крысам перед каждым забегом. Шанс крысы — ровно по её коэффициенту, возврат на любую ставку ${pct(RAT_RTP)}. Победителя тянет сервер. Ставка ${RAT_MIN_BET}–${num(RAT_MAX_BET)} 🪙, одна на забег, выплата до ${num(RAT_MAX_PAYOUT)} 🪙. Первая ставка — ${RAT_OPEN_MS / 1000} с до старта, каждый новый игрок — ещё +${RAT_ADD_MS / 1000} с (всего не больше ${RAT_OPEN_MAX_MS / 1000} с). Клавиши: 1–6 — крыса, Enter — поставить, Esc — закрыть.`);
    this.root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape') { e.preventDefault(); this.close(); return; }
      if (e.target === this.amount && e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      const k = PICK_KEYS[e.code];
      if (k !== undefined) { e.preventDefault(); this.choose(k); return; }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); this.submit(); }
    });
    this.root.addEventListener('keyup', (e) => e.stopPropagation());
    this.root.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.close(); });
    overlay.appendChild(this.root);
    // плашка забега: в слое меню, кликам не мешает
    this.banner = overlay.appendChild(el('div', 'rr-banner'));
    this.banner.hidden = true;
    this.banner.setAttribute('role', 'status');
    this.bHead = this.banner.appendChild(el('b', ''));
    this.bSub = this.banner.appendChild(el('span', ''));
    // кнопки «болеть»
    this.cheerBar = overlay.appendChild(el('div', 'rr-cheer'));
    this.cheerBar.hidden = true;
    this.cheerBar.appendChild(el('span', 'rr-cheerTitle', 'Болеть:'));
    RATS.forEach((def, i) => {
      const b = this.cheerBar.appendChild(el('button', 'rr-cheerBtn'));
      b.type = 'button';
      b.style.setProperty('--saddle', def.saddle);
      b.title = `Болеть за ${ratAcc(i)} — клавиша ${i + 1}`;
      b.appendChild(el('kbd', '', String(i + 1)));
      b.appendChild(el('span', '', def.name));
      b.addEventListener('click', () => this.cheer(i));
      this.cheerBtns.push(b);
    });
    window.setInterval(() => this.tick(), 250);
  }

  get isOpen(): boolean { return this.root.open; }

  /** Видны ли кнопки «болеть» (тогда клавиши 1–6 — за крыс, а не эмоции) */
  get cheering(): boolean { return !this.cheerBar.hidden; }

  open(pid: number): void {
    this.myPid = pid;
    this.error = '';
    if (this.draft <= 0) this.draft = Math.min(maxRatBet(this.balance()), 10);
    this.amount.value = this.draft ? String(this.draft) : '';
    this.render();
    if (!this.root.open) {
      this.root.showModal();
      this.onOpen();
      (this.cards[Math.max(0, this.pick)]?.btn ?? this.go).focus({ preventScroll: true });
    }
  }

  close(): void {
    if (!this.root.open) return;
    this.root.close();
    this.onClose();
  }

  /** Вход и выход из сцены: всё спрятать молча (мышь не трогаем) */
  reset(): void {
    if (this.root.open) this.root.close();
    this.banner.hidden = true;
    this.cheerBar.hidden = true;
    this.bannerKey = '';
    this.near = false;
    this.cheerNear = false;
    this.pending = 0;
  }

  setView(v: RatRaceView): void {
    const prev = this.view;
    this.view = v;
    this.viewAt = performance.now();
    const mine = v.bets.find((b) => b.pid === this.myPid);
    if (mine && v.phase !== 'idle') this.myBet = { race: v.race, rat: mine.rat, stake: mine.stake };
    // новый забег открылся (или новые коэффициенты) — старый выбор крысы больше не значит того же
    if (prev && prev.race !== v.race) this.pick = -1;
    if (this.isOpen) this.render();
    this.renderBanner();
  }

  setMe(pid: number): void { this.myPid = pid; }

  /** Рядом ли с ареной: плашка видна в 14 м, кнопки «болеть» — в 13 м (сервер разрешает с 16 м) */
  setNear(dist: number): void {
    const near = dist <= 14;
    const cheer = dist <= 13;
    if (near !== this.near || cheer !== this.cheerNear) {
      this.near = near;
      this.cheerNear = cheer;
      this.renderBanner();
    }
  }

  onBetReply(m: BetReply): void {
    this.pending = 0;
    if (m.ok) {
      this.error = '';
      this.close();
    } else {
      this.error = m.text;
      if (this.isOpen) this.render();
    }
  }

  /** Свой итог: покажем после финиша у этого игрока (плашка и тост) */
  onResult(m: Outcome): void {
    this.outcome = m;
  }

  /** Забег race кончился у этого игрока (или итог пришёл позже): что сказать тостом (null — не ставил или уже сказали) */
  finishText(race: number): { text: string; payout: number } | null {
    if (this.resultRace !== race) { this.resultAt = performance.now(); this.resultRace = race; }
    const o = this.outcome;
    if (!o || o.race !== race || this.toasted === race) return null;
    this.toasted = race;
    const text = o.payout > 0
      ? `🏁 ${ratWon(o.winner)}! Ты выиграл ${num(o.payout)} 🪙`
      : `🏁 ${ratWon(o.winner)}. Ставка на ${ratAcc(o.rat)} (${num(o.stake)} 🪙) не сыграла`;
    return { text, payout: o.payout };
  }

  /** Клавиши 1–6 у арены во время отсчёта и забега — болеть */
  cheerKey(code: string): boolean {
    if (!this.cheering) return false;
    const k = PICK_KEYS[code];
    if (k === undefined) return false;
    this.cheer(k);
    return true;
  }

  hint(): string {
    const v = this.view;
    if (!v) return 'крысиные бега';
    if (v.phase === 'open') return `крысиные бега · старт через ${this.left()} с · ставок: ${v.bets.length}`;
    if (v.phase === 'run' || this.running()) return 'крысиные бега · забег идёт — ставка на следующий';
    return 'крысиные бега · сделать ставку';
  }

  private left(): number {
    const v = this.view;
    return v ? Math.max(0, Math.ceil((v.left - (performance.now() - this.viewAt)) / 1000)) : 0;
  }

  private mine(): RatRaceView['bets'][number] | undefined {
    return this.view?.bets.find((b) => b.pid === this.myPid);
  }

  private choose(i: number): void {
    if (i < 0 || i >= RAT_COUNT) return;
    this.pick = i;
    this.error = '';
    this.render();
  }

  private setDraft(n: number): void {
    this.draft = Math.max(0, Math.min(maxRatBet(this.balance()), n));
    this.amount.value = this.draft ? String(this.draft) : '';
    this.error = '';
    this.render();
  }

  /** Почему сейчас нельзя поставить (пусто — можно) */
  private blocker(): string {
    const v = this.view;
    const bal = this.balance();
    if (!v) return 'Ипподром ещё не ответил';
    if (this.mine()) return '';
    if (v.phase === 'run') return 'Забег идёт — ставь на следующий';
    if (bal < RAT_MIN_BET) return `Нет жетонов на ставку — нужно хотя бы ${RAT_MIN_BET} 🪙`;
    if (this.pick < 0) return 'Выбери крысу';
    if (this.draft < RAT_MIN_BET) return `Ставка — от ${RAT_MIN_BET} 🪙`;
    if (this.draft > RAT_MAX_BET) return `Ставка — не больше ${num(RAT_MAX_BET)} 🪙`;
    if (this.draft > bal) return `Не хватает жетонов: у тебя ${num(bal)} 🪙`;
    return '';
  }

  private submit(): void {
    const v = this.view;
    if (!v || this.pending > performance.now() || this.mine() || this.blocker()) return;
    this.pending = performance.now() + 4000;
    this.error = '';
    this.send({ t: 'rat', a: 'bet', rat: this.pick, amount: this.draft, race: v.race });
    this.render();
  }

  private cheer(i: number): void {
    const now = performance.now();
    if (now - this.cheerAt < CHEER_GAP_MS) return;
    this.cheerAt = now;
    this.onCheer(i);
    const b = this.cheerBtns[i];
    b.classList.remove('hit');
    void b.offsetWidth;
    b.classList.add('hit');
  }

  private tick(): void {
    if (this.isOpen) this.render();
    this.renderBanner();
  }

  private render(): void {
    const v = this.view;
    const bal = this.balance();
    const mine = this.mine();
    const odds = v?.odds ?? [];
    const fav = odds.length ? odds.indexOf(Math.min(...odds)) : -1;
    const busy = this.pending > performance.now();
    this.cards.forEach((c, i) => {
      const m = odds[i];
      c.mult.textContent = m ? `×${m}` : '×?';
      c.chance.textContent = m ? `шанс ${pct(ratChance(m))}${i === fav ? ' · фаворит' : ''}` : '';
      const on = mine ? mine.rat === i : this.pick === i;
      c.btn.classList.toggle('on', on);
      c.btn.setAttribute('aria-pressed', String(on));
      c.btn.disabled = !!mine || v?.phase === 'run' || busy;
    });
    const cap = maxRatBet(bal);
    for (const { btn, chip } of this.chipBtns) btn.disabled = !!mine || busy || this.draft + chip > cap;
    this.amount.readOnly = !!mine || busy;
    this.resetBtn.disabled = !!mine || busy || this.draft === 0;
    setCoinText(this.limit, bal < RAT_MIN_BET ? `У тебя ${num(bal)} 🪙 — а на ставку нужно хотя бы ${RAT_MIN_BET} 🪙` : `От ${RAT_MIN_BET} до ${num(cap)} 🪙 · у тебя ${num(bal)} 🪙${cap < RAT_MAX_BET ? '' : ' · лимит стола'}`);
    const why = this.blocker();
    const can = !why && !mine && !busy;
    this.go.disabled = !can;
    this.go.classList.toggle('ready', can);
    if (mine) setCoinText(this.go, `Ставка сделана: ${RATS[mine.rat].name} · ${num(mine.stake)} 🪙`);
    else if (busy) this.go.textContent = 'Ставим…';
    else if (this.pick >= 0 && this.draft >= RAT_MIN_BET && odds[this.pick]) {
      const win = ratWin(this.draft, odds[this.pick]);
      setCoinText(this.go, `Поставить ${num(this.draft)} 🪙 на ${ratAcc(this.pick)} · выиграешь ${num(win)} 🪙`);
    } else setCoinText(this.go, why || 'Поставить');
    const status = this.error ? this.error
      : mine ? (v?.phase === 'open' ? `Ты поставил на ${ratAcc(mine.rat)} — старт через ${this.left()} с` : `Ты поставил на ${ratAcc(mine.rat)} — забег идёт`)
        : v?.phase === 'run' || this.running() ? 'Забег идёт — ставь на следующий'
          : v?.phase === 'open' ? `Приём ставок: старт через ${this.left()} с`
            : `Ипподром свободен — твоя ставка откроет забег: старт через ${RAT_OPEN_MS / 1000} с`;
    setCoinText(this.state, status);
    this.state.classList.toggle('err', !!this.error);
    const rest = (v?.bets ?? []).filter((b) => b.pid !== this.myPid);
    setCoinText(this.others, rest.length ? `Ставки: ${rest.map((b) => `${b.nick} — ${RATS[b.rat].name} (${num(b.stake)} 🪙)`).join('; ')}` : '');
    this.others.hidden = rest.length === 0;
  }

  private renderBanner(): void {
    const v = this.view;
    const now = performance.now();
    let cls = '', head = '', sub = '';
    const showCheer = !!v && this.cheerNear && (v.phase === 'open' || this.running() || v.phase === 'run');
    if (this.near && v) {
      const mine = this.mine();
      const my = mine ? `Твоя ставка: ${RATS[mine.rat].name} · ${num(mine.stake)} 🪙` : '';
      const st = this.standings();
      const res = this.resultOrder();
      if (st) {
        cls = 'run';
        head = `🐀 Забег! Впереди ${RATS[st[0]].name}`;
        const myBet = this.myBet && this.myBet.race === this.resultRaceGuess() ? this.myBet : null;
        sub = myBet ? `Твоя ставка: ${RATS[myBet.rat].name} — ${st.indexOf(myBet.rat) + 1}-е место` : 'Болей: 1–6 или кнопки внизу';
      } else if (v.phase === 'open') {
        cls = 'open';
        head = `🐀 Старт через ${this.left()} с`;
        sub = my || `Ставок: ${v.bets.length} · E у арены — поставить`;
      } else if (res && now - this.resultAt < RESULT_MS) {
        cls = 'res';
        head = `🏁 ${ratWon(res[0])}!`;
        const o = this.outcome;
        sub = o && this.resultRace === o.race
          ? (o.payout > 0 ? `Ты выиграл ${num(o.payout)} 🪙!` : `Твоя ставка: ${RATS[o.rat].name} — ${res.indexOf(o.rat) + 1}-е место`)
          : `2-е место — ${RATS[res[1]].name}, 3-е — ${RATS[res[2]].name}`;
      }
    }
    const key = `${cls}|${head}|${sub}|${showCheer}`;
    if (key === this.bannerKey) return;
    this.bannerKey = key;
    this.banner.hidden = !cls;
    this.banner.className = `rr-banner ${cls}`;
    this.bHead.textContent = head;
    setCoinText(this.bSub, sub);
    this.cheerBar.hidden = !showCheer;
  }

  /** Номер забега, который сейчас бежит у этого игрока: идущий на сервере или только что рассчитанный */
  private resultRaceGuess(): number {
    const v = this.view;
    if (!v) return 0;
    return v.phase === 'run' ? v.race : (v.last?.race ?? v.race);
  }
}
