// Крысиные бега (флаг RATRACE): окно ставки, одна плашка забега и вспышка выигрыша. Окно: шесть крыс (номер в цвете
// попоны, имя, характер, коэффициент забега и шанс, кто уже поставил — ник и сумма), фишки 10/50/100/500 и поле «своя
// сумма», как в блэкджеке, кнопка «Поставить». Ставку решает сервер (server/lobby/ratrace.ts): окно ждёт ответа —
// принята (закрывается) или нет (причина остаётся в окне). Без жетонов кнопка неактивна.
// Плашка — справа, у арены, одна на всё: что сейчас (приём ставок и сколько до старта / забег / кто победил), шесть
// строк (по номеру — кто на кого поставил; в забеге — по местам с полоской хода; на финише — места и выплаты), своя
// ставка и что нажать. Болеть — клавиши 1–6 (вместо эмоций), на телефоне — нажать на крысу в плашке; не чаще раза
// в 1,2 с. Подсказка внизу экрана — только «E — сделать ставку», без повтора отсчёта.
import type { ClientMsg, ServerMsg } from '../../shared/messages.ts';
import {
  RAT_ADD_MS, RAT_CHIPS, RAT_COUNT, RAT_MAX_BET, RAT_MAX_PAYOUT, RAT_MIN_BET, RAT_OPEN_MAX_MS, RAT_OPEN_MS, RAT_RTP, RATS, maxRatBet, ratChance,
  ratWin, ratWon, type RatBetView, type RatRaceView,
} from '../../shared/ratrace.ts';
import { TOUCH } from '../touch.ts';
import { setCoinText } from '../ui/coin.ts';
import { betsWord, ratBank } from './ratraceboard.ts';
import './ratrace.css';

type Outcome = Extract<ServerMsg, { t: 'ratResult' }>;
type BetReply = Extract<ServerMsg, { t: 'ratBet' }>;

const PICK_KEYS: Record<string, number> = {};
for (let i = 0; i < RAT_COUNT; i++) { PICK_KEYS[`Digit${i + 1}`] = i; PICK_KEYS[`Numpad${i + 1}`] = i; }
/** Сколько висит итог на плашке после финиша, мс */
const RESULT_MS = 10_000;
/** Вспышка «Ты выиграл» в середине экрана, мс */
const WIN_MS = 3200;
const CHEER_GAP_MS = 1200;
/** Плашка видна в NEAR_M от середины арены, болеть клавишами — в CHEER_M (сервер разрешает с 16 м) */
const NEAR_M = 14;
const CHEER_M = 13;
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
/** «1-я», «3-й»: место крысы с родом */
const placeOf = (rat: number, place: number): string => `${place}-${RATS[rat]?.fem ? 'я' : 'й'}`;

/** Кто поставил на крысу — строкой: «Tester2 50 · Tester3 30» (своя — «ты 60», первой) */
function bettors(bets: readonly RatBetView[], rat: number, me: number, max = 3): string {
  const list = bets.filter((b) => b.rat === rat).sort((a, b) => Number(b.pid === me) - Number(a.pid === me));
  const shown = list.slice(0, max).map((b) => `${b.pid === me ? 'ты' : b.nick} ${num(b.stake)}`);
  return list.length > max ? `${shown.join(' · ')} · +${list.length - max}` : shown.join(' · ');
}

interface Row {
  root: HTMLButtonElement;
  place: HTMLElement;
  name: HTMLElement;
  odds: HTMLElement;
  who: HTMLElement;
  bar: HTMLElement;
}

export class RatRaceHud {
  onOpen: () => void = () => {};
  onClose: () => void = () => {};
  /** Болеть за крысу (сервер разошлёт всем) */
  onCheer: (rat: number) => void = () => {};
  /** Камера на трассу: включить или выключить (кнопка на телефоне) */
  onCam: () => void = () => {};
  /**
   * Из 3D: идёт ли забег у этого игрока и какой (номер; сервер к концу своего забега уже шлёт следующий), кто впереди,
   * итог прошлого забега, сколько пробежала крыса (доля круга)
   */
  running: () => boolean = () => false;
  playing: () => number = () => 0;
  standings: () => number[] | null = () => null;
  resultOrder: () => number[] | null = () => null;
  progress: (rat: number) => number = () => 0;
  /** Камера сейчас на трассе / можно ли её туда поставить */
  camOn: () => boolean = () => false;
  camAvail: () => boolean = () => false;
  private readonly send: (msg: ClientMsg) => void;
  private readonly balance: () => number;
  private readonly root: HTMLDialogElement;
  private readonly cards: Array<{ btn: HTMLButtonElement; mult: HTMLElement; chance: HTMLElement; who: HTMLElement }> = [];
  private readonly chipBtns: Array<{ btn: HTMLButtonElement; chip: number }> = [];
  private readonly amount: HTMLInputElement;
  private readonly limit: HTMLElement;
  private readonly go: HTMLButtonElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly state: HTMLElement;
  private readonly bank: HTMLElement;
  // плашка
  private readonly panel: HTMLElement;
  private readonly pState: HTMLElement;
  private readonly pTime: HTMLElement;
  private readonly pBar: HTMLElement;
  private readonly pBarFill: HTMLElement;
  private readonly pRows: Row[] = [];
  private readonly pMine: HTMLElement;
  private readonly pBank: HTMLElement;
  private readonly pKeys: HTMLElement;
  private readonly camBtn: HTMLButtonElement;
  private readonly win: HTMLElement;
  private readonly winSum: HTMLElement;
  private winTimer = 0;
  private panelKey = '';
  private view: RatRaceView | null = null;
  private viewAt = 0;
  /** Самый большой отсчёт в этом приёме ставок — для полоски времени */
  private openTotal = 0;
  private openRace = 0;
  private myPid = 0;
  private pick = -1;
  private draft = 0;
  private pending = 0;
  private error = '';
  private nearM = 99;
  private cheerAt = 0;
  /** Ставки забега, который бежит (из вида фазы run), — для итога: кто на кого ставил */
  private runBets: { race: number; bets: RatBetView[]; odds: number[] } | null = null;
  private outcome: Outcome | null = null;
  private resultAt = -1e9;
  private resultRace = 0;
  /** О каком забеге уже сказали */
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
    this.bank = this.root.appendChild(el('p', 'rr-bank'));
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
      const who = txt.appendChild(el('span', 'rr-who'));
      const odds = btn.appendChild(el('span', 'rr-odds'));
      const mult = odds.appendChild(el('b', 'rr-mult'));
      const chance = odds.appendChild(el('span', 'rr-chance'));
      btn.addEventListener('click', () => this.choose(i));
      this.cards.push({ btn, mult, chance, who });
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

    // плашка забега: справа, кликам по миру не мешает (на телефоне крысу в ней можно нажать — болеть)
    this.panel = overlay.appendChild(el('div', 'rr-panel'));
    this.panel.hidden = true;
    this.panel.setAttribute('role', 'status');
    const head = this.panel.appendChild(el('div', 'rr-pHead'));
    head.appendChild(el('span', 'rr-pTitle', '🐀 Крысиные бега'));
    this.camBtn = head.appendChild(el('button', 'rr-pCam', '🎥'));
    this.camBtn.type = 'button';
    this.camBtn.title = 'Камера на трассу';
    this.camBtn.setAttribute('aria-label', 'Камера на трассу');
    this.camBtn.addEventListener('click', () => this.onCam());
    const stateRow = this.panel.appendChild(el('div', 'rr-pStateRow'));
    this.pState = stateRow.appendChild(el('b', 'rr-pState'));
    this.pTime = stateRow.appendChild(el('span', 'rr-pTime'));
    this.pBar = this.panel.appendChild(el('div', 'rr-pBar'));
    this.pBarFill = this.pBar.appendChild(el('i', ''));
    const list = this.panel.appendChild(el('div', 'rr-pList'));
    for (let i = 0; i < RAT_COUNT; i++) {
      const root = list.appendChild(el('button', 'rr-pRow'));
      root.type = 'button';
      root.tabIndex = -1;
      root.style.setProperty('--saddle', RATS[i].saddle);
      const place = root.appendChild(el('span', 'rr-pPlace'));
      const no = root.appendChild(el('span', 'rr-pNo', String(i + 1)));
      if (RATS[i].saddle === '#e8b923') no.classList.add('dark');
      const name = root.appendChild(el('span', 'rr-pName', RATS[i].name));
      const odds = root.appendChild(el('span', 'rr-pOdds'));
      const who = root.appendChild(el('span', 'rr-pWho'));
      const bar = root.appendChild(el('i', 'rr-pProg'));
      root.title = `Болеть за ${ratAcc(i)} — клавиша ${i + 1}`;
      root.addEventListener('click', () => this.cheer(i));
      this.pRows.push({ root, place, name, odds, who, bar });
    }
    const foot = this.panel.appendChild(el('div', 'rr-pFoot'));
    this.pMine = foot.appendChild(el('div', 'rr-pMine'));
    this.pBank = foot.appendChild(el('div', 'rr-pBank'));
    this.pKeys = foot.appendChild(el('div', 'rr-pKeys'));
    // вспышка выигрыша — в середине экрана
    this.win = overlay.appendChild(el('div', 'rr-win'));
    this.win.hidden = true;
    this.win.setAttribute('role', 'status');
    this.win.appendChild(el('span', 'rr-winHead', 'Ты выиграл!'));
    this.winSum = this.win.appendChild(el('b', 'rr-winSum'));
    window.setInterval(() => this.tick(), 200);
  }

  get isOpen(): boolean { return this.root.open; }

  /** Плашка у арены видна */
  get panelShown(): boolean { return !this.panel.hidden; }

  /** Рядом с ареной: итоги и подтверждения — в плашке, тосты не нужны */
  get near(): boolean { return this.nearM <= NEAR_M; }

  /** Болеть можно: у арены идёт приём ставок или забег (тогда клавиши 1–6 — за крыс, а не эмоции) */
  get cheering(): boolean {
    const v = this.view;
    return !!v && this.nearM <= CHEER_M && !this.panel.hidden && (v.phase === 'open' || v.phase === 'run' || this.running());
  }

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
    this.panel.hidden = true;
    this.win.hidden = true;
    this.panelKey = '';
    this.nearM = 99;
    this.pending = 0;
  }

  setView(v: RatRaceView): void {
    const prev = this.view;
    this.view = v;
    this.viewAt = performance.now();
    if (v.phase === 'run') this.runBets = { race: v.race, bets: v.bets, odds: v.odds };
    if (v.phase === 'open' && (this.openRace !== v.race || v.left > this.openTotal)) {
      if (this.openRace !== v.race) this.openTotal = 0;
      this.openRace = v.race;
      this.openTotal = Math.max(this.openTotal, v.left);
    }
    // новый забег открылся (или новые коэффициенты) — старый выбор крысы больше не значит того же
    if (prev && prev.race !== v.race) this.pick = -1;
    if (this.isOpen) this.render();
    this.renderPanel();
  }

  setMe(pid: number): void { this.myPid = pid; }

  /** Сколько до середины арены, м: плашка видна в 14 м, клавиши 1–6 болеют в 13 м */
  setNear(dist: number): void {
    const was = this.nearM <= NEAR_M, cheer = this.nearM <= CHEER_M;
    this.nearM = dist;
    if (was !== this.nearM <= NEAR_M || cheer !== this.nearM <= CHEER_M) this.renderPanel();
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

  /** Свой итог: покажем после финиша у этого игрока (плашка, вспышка или тост) */
  onResult(m: Outcome): void {
    this.outcome = m;
  }

  /**
   * Забег race кончился у этого игрока (или итог пришёл позже): что сказать тостом вдали от арены (null — не ставил
   * или уже сказали). У арены итог крупно в плашке, выигрыш — вспышкой в середине экрана.
   */
  finishText(race: number): { text: string; payout: number } | null {
    if (this.resultRace !== race) { this.resultAt = performance.now(); this.resultRace = race; }
    const o = this.outcome;
    if (!o || o.race !== race || this.toasted === race) return null;
    this.toasted = race;
    if (o.payout > 0 && this.near) this.flashWin(o.payout);
    this.panelKey = '';
    this.renderPanel();
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

  /** Кто-то болеет за крысу — строка в плашке вспыхивает */
  pulse(rat: number): void {
    const r = this.pRows[rat];
    if (!r || this.panel.hidden) return;
    r.root.classList.remove('rr-hit');
    void r.root.offsetWidth;
    r.root.classList.add('rr-hit');
  }

  /** Подсказка у точки ставки: только что сделает E (отсчёт и ставки — в плашке и на табло) */
  hint(): string {
    const v = this.view;
    if (!v) return 'крысиные бега';
    if (this.mine()) return 'твоя ставка';
    if (v.phase === 'run' || this.running()) return 'ставка на следующий забег';
    return 'сделать ставку';
  }

  private left(): number {
    const v = this.view;
    return v ? Math.max(0, Math.ceil((v.left - (performance.now() - this.viewAt)) / 1000)) : 0;
  }

  private mine(): RatBetView | undefined {
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
    if (!this.cheering) return;
    const now = performance.now();
    if (now - this.cheerAt < CHEER_GAP_MS) return;
    this.cheerAt = now;
    this.onCheer(i);
    this.pulse(i);
  }

  private flashWin(payout: number): void {
    setCoinText(this.winSum, `+${num(payout)} 🪙`);
    this.win.hidden = false;
    this.win.classList.remove('rr-show');
    void this.win.offsetWidth;
    this.win.classList.add('rr-show');
    window.clearTimeout(this.winTimer);
    this.winTimer = window.setTimeout(() => { this.win.hidden = true; }, WIN_MS);
  }

  private tick(): void {
    if (this.isOpen) this.render();
    this.renderPanel();
  }

  private render(): void {
    const v = this.view;
    const bal = this.balance();
    const mine = this.mine();
    const odds = v?.odds ?? [];
    const fav = odds.length ? odds.indexOf(Math.min(...odds)) : -1;
    const busy = this.pending > performance.now();
    const bets = v && v.phase !== 'idle' ? v.bets : [];
    this.cards.forEach((c, i) => {
      const m = odds[i];
      c.mult.textContent = m ? `×${m}` : '×?';
      c.chance.textContent = m ? `шанс ${pct(ratChance(m))}${i === fav ? ' · фаворит' : ''}` : '';
      const on = mine ? mine.rat === i : this.pick === i;
      c.btn.classList.toggle('on', on);
      c.btn.setAttribute('aria-pressed', String(on));
      c.btn.disabled = !!mine || v?.phase === 'run' || busy;
      // кто уже поставил на эту крысу — ник и сумма (своя — «ты»)
      const who = bettors(bets, i, this.myPid, 4);
      c.who.textContent = who ? `ставки: ${who}` : '';
      c.who.hidden = !who;
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
    // наверху окна — что сейчас и сколько в банке
    const n = bets.length;
    setCoinText(this.bank, v?.phase === 'open' ? `Старт через ${this.left()} с · банк ${num(ratBank(bets))} 🪙 · ${n} ${betsWord(n)}`
      : v?.phase === 'run' || this.running() ? 'Забег идёт — ставки на следующий забег откроются после финиша'
        : 'Ставок пока нет — первая откроет приём на 15 с');
  }

  // ------------------------------------------------------------ плашка

  /** Что сейчас у этого игрока: приём ставок, забег (по своим часам), итог (10 с после финиша) или ничего */
  private phase(): 'open' | 'run' | 'result' | '' {
    const v = this.view;
    if (!v) return '';
    if (this.standings()) return 'run';
    if (v.phase === 'open') return 'open';
    if (this.resultOrder() && performance.now() - this.resultAt < RESULT_MS) return 'result';
    if (v.phase === 'run' || this.running()) return 'run';
    return '';
  }

  private renderPanel(): void {
    const v = this.view;
    const ph = this.near && v ? this.phase() : '';
    const st = ph === 'run' ? this.standings() : null;
    const res = ph === 'result' ? this.resultOrder() : null;
    const left = ph === 'open' ? this.left() : 0;
    const camOn = this.camOn(), camAvail = this.camAvail();
    // в забеге полоски хода меняются всё время — их обновляем без ключа
    if (st) for (const rat of st) this.pRows[rat].bar.style.transform = `scaleX(${Math.max(0, Math.min(1, this.progress(rat))).toFixed(3)})`;
    const key = `${ph}|${left}|${st?.join('') ?? ''}|${res?.join('') ?? ''}|${v?.race}|${v?.bets.length}|${this.runBets?.race ?? 0}|${v?.last?.race ?? 0}|${this.outcome?.race ?? 0}|${camOn}|${camAvail}|${this.myPid}|${this.balance() >= RAT_MIN_BET}`;
    if (key === this.panelKey) return;
    this.panelKey = key;
    this.panel.hidden = !ph;
    if (!ph || !v) return;
    this.panel.className = `rr-panel rr-${ph}`;
    // ставки и коэффициенты: текущего забега (приём, забег) или прошедшего (итог)
    const run = this.runBets;
    const last = v.last && v.last.race === this.resultRace ? v.last : null;
    const pastBets = run && run.race === this.resultRace ? run.bets : [];
    const runRace = this.playing() || v.race;
    const bets = ph === 'open' ? v.bets : ph === 'run' ? (run && run.race === runRace ? run.bets : v.phase === 'run' ? v.bets : []) : pastBets;
    const odds = ph === 'result' ? (last?.odds ?? run?.odds ?? v.odds) : ph === 'run' ? (run?.odds ?? v.odds) : v.odds;
    const order = st ?? res ?? [0, 1, 2, 3, 4, 5];
    const mineRat = bets.find((b) => b.pid === this.myPid)?.rat ?? -1;
    // заголовок и время
    if (ph === 'open') {
      this.pState.textContent = 'Приём ставок';
      this.pTime.textContent = `старт через ${left} с`;
      const frac = this.openTotal > 0 ? Math.max(0, Math.min(1, (left * 1000) / this.openTotal)) : 0;
      this.pBarFill.style.transform = `scaleX(${frac.toFixed(3)})`;
      this.pBar.classList.toggle('rr-hot', left <= 5);
    } else if (ph === 'run') {
      this.pState.textContent = st ? `Забег! Впереди ${RATS[st[0]].name}` : 'Забег!';
      this.pTime.textContent = '';
    } else {
      this.pState.textContent = `🏁 ${res ? ratWon(res[0]) : 'Финиш'}${res && odds[res[0]] ? ` ×${odds[res[0]]}` : ''}!`;
      this.pTime.textContent = '';
    }
    this.pBar.hidden = ph !== 'open';
    // строки: по номеру (приём) или по местам (забег, итог); своя крыса — золотом
    const wins = last?.wins ?? [];
    order.forEach((rat, k) => {
      const r = this.pRows[rat];
      r.root.style.setProperty('--k', String(k));
      r.root.classList.toggle('rr-mine', rat === mineRat);
      r.root.classList.toggle('rr-lead', ph !== 'open' && k === 0);
      r.root.classList.toggle('rr-lost', ph === 'result' && k > 0);
      r.place.textContent = ph === 'open' ? '' : String(k + 1);
      r.odds.textContent = odds[rat] ? `×${odds[rat]}` : '';
      if (ph === 'result' && k === 0) {
        // победители — с выигрышем
        const paid = bets.filter((b) => b.rat === rat).map((b) => {
          const w = wins.find((x) => x.nick === b.nick)?.payout ?? 0;
          return `${b.pid === this.myPid ? 'ты' : b.nick} +${num(w)}`;
        });
        const extra = run && run.race === this.resultRace ? [] : wins.map((w) => `${w.nick} +${num(w.payout)}`);
        r.who.textContent = [...paid, ...extra].slice(0, 3).join(' · ');
      } else r.who.textContent = bettors(bets, rat, this.myPid, 2);
      if (ph !== 'run') r.bar.style.transform = 'scaleX(0)';
    });
    // низ: своя ставка или итог, банк, клавиши
    const o = this.outcome && this.outcome.race === this.resultRace ? this.outcome : null;
    this.pMine.className = 'rr-pMine';
    if (ph === 'result' && o) {
      if (o.payout > 0) {
        this.pMine.classList.add('rr-won');
        setCoinText(this.pMine, `Ты выиграл ${num(o.payout)} 🪙!`);
      } else {
        const place = res ? res.indexOf(o.rat) + 1 : 0;
        setCoinText(this.pMine, `${RATS[o.rat].name} — ${placeOf(o.rat, place)}. Ставка ${num(o.stake)} 🪙 не сыграла`);
      }
    } else if (ph === 'result') {
      this.pMine.textContent = wins.length ? `Выиграли: ${wins.slice(0, 3).map((w) => w.nick).join(', ')}${wins.length > 3 ? '…' : ''}` : 'Никто не угадал';
    } else if (mineRat >= 0) {
      const my = bets.find((b) => b.pid === this.myPid)!;
      const place = st ? st.indexOf(mineRat) + 1 : 0;
      setCoinText(this.pMine, st
        ? `Твоя ${RATS[mineRat].name} — ${placeOf(mineRat, place)} · ставка ${num(my.stake)} 🪙`
        : `Твоя ставка: ${RATS[mineRat].name} · ${num(my.stake)} 🪙 → выиграешь ${num(ratWin(my.stake, odds[mineRat] ?? 0))} 🪙`);
      this.pMine.classList.add('rr-bet');
    } else if (ph === 'open') {
      this.pMine.textContent = this.balance() >= RAT_MIN_BET ? 'Ты ещё не поставил — E у арены' : 'Нет жетонов на ставку — можно болеть';
    } else this.pMine.textContent = 'Ставка — на следующий забег';
    const n = bets.length;
    if (ph === 'result') {
      const paid = wins.reduce((a, w) => a + w.payout, 0);
      setCoinText(this.pBank, wins.length ? `Выплачено ${num(paid)} 🪙 · ставок было: ${n || wins.length}` : n ? `Ставок было: ${n}` : '');
    } else setCoinText(this.pBank, n ? `Банк ${num(ratBank(bets))} 🪙 · ${n} ${betsWord(n)}` : 'Ставок пока нет');
    this.pKeys.textContent = '';
    if (ph === 'result') this.keyHint('E', 'ставка на следующий забег');
    else {
      if (TOUCH) this.pKeys.appendChild(el('span', '', 'Нажми на крысу — болеть'));
      else this.keyHint('1–6', 'болеть');
      if (camAvail && !TOUCH) this.keyHint('C', camOn ? 'обычный вид' : 'вид на трассу');
    }
    this.camBtn.hidden = !TOUCH || !camAvail;
    this.camBtn.classList.toggle('rr-on', camOn);
  }

  private keyHint(key: string, text: string): void {
    const s = this.pKeys.appendChild(el('span', ''));
    s.appendChild(el('kbd', '', key));
    s.append(` ${text}`);
  }
}

