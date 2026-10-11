// Крысиные бега (флаг RATRACE) на ките 2.0 — как на странице lab/ui «Режимы» → «Крысиные бега».
// Окно ставки — .k-scrim > .k-window.mo-bet-win в оболочке HUD: шесть карточек крыс (седло с номером в цвете попоны, имя,
// коэффициент, характер, шанс, кто уже поставил — ник и сумма), фишки 10/50/100/500 и поле суммы, как в блэкджеке,
// золотая кнопка «Поставить» с итогом «выиграешь». Ставку решает сервер (server/lobby/ratrace.ts): окно ждёт ответа —
// принята (закрывается) или нет (причина остаётся в окне). Без жетонов кнопка неактивна. Мышью и клавишами
// (1–6 — крыса, Enter — поставить, Esc — закрыть).
// У арены: плашка забега — событие в верх-центре (приём ставок с отсчётом / «Забег! Впереди …» / «Победила …»), под
// бейджем — своя ставка плиткой и шесть крыс списком (в забеге и на финише — по местам, своя — золотом), внизу —
// клавиши «1–6 болеть · C вид на трассу». Выигрыш — крупным баннером «Ты выиграл!». Болеть — клавиши 1–6 (вместо
// эмоций), на телефоне — нажать на крысу в списке; не чаще раза в 1,2 с. «E — ставка» — подсказка набережной.
import type { ClientMsg, ServerMsg } from '../../shared/messages.ts';
import {
  RAT_CHIPS, RAT_COUNT, RAT_MAX_BET, RAT_MAX_PAYOUT, RAT_MIN_BET, RAT_OPEN_MS, RATS, maxRatBet, ratChance,
  ratWin, ratWon, type RatBetView, type RatRaceView,
} from '../../shared/ratrace.ts';
import { TOUCH } from '../touch.ts';
import { uiIcon } from '../ui/kit/icons.ts';
import { coinHtml, h, meterHtml } from '../ui/kit/dom.ts';
import { coinText, esc, keysRow } from '../ui/kit/modes.ts';
import type { HudSlots } from '../ui/kit/slots.ts';
import { PRIO, type TopCenter } from '../ui/kit/topcenter.ts';
import { betsWord, ratBank } from './ratraceboard.ts';
import './ratrace.css';

type Outcome = Extract<ServerMsg, { t: 'ratResult' }>;
type BetReply = Extract<ServerMsg, { t: 'ratBet' }>;

const PICK_KEYS: Record<string, number> = {};
for (let i = 0; i < RAT_COUNT; i++) { PICK_KEYS[`Digit${i + 1}`] = i; PICK_KEYS[`Numpad${i + 1}`] = i; }
/** Сколько висит итог у арены после финиша, мс */
const RESULT_MS = 10_000;
const CHEER_GAP_MS = 1200;
/** Плашка и список видны в NEAR_M от середины арены, болеть клавишами — в CHEER_M (сервер разрешает с 16 м) */
const NEAR_M = 14;
const CHEER_M = 13;
/** Ключи верх-центра (префикс режима rr-) */
const EVENT = 'rr-race';
const HERO = 'rr-win';
const fmt = new Intl.NumberFormat('ru-RU');
const num = (n: number): string => fmt.format(n);
const pct = (p: number): string => `${Math.round(p * 100)}%`;

/** Винительный падеж: «поставить на Пулю», «болеть за Барона» */
const ACC: readonly string[] = ['Пулю', 'Соню', 'Барона', 'Шныря', 'Кексика', 'Ириску'];
export const ratAcc = (i: number): string => ACC[i] ?? RATS[i]?.name ?? '';
/** «1-я», «3-й»: место крысы с родом */
const placeOf = (rat: number, place: number): string => `${place}-${RATS[rat]?.fem ? 'я' : 'й'}`;
/** Седло с номером в цвете попоны (цвет — данные игры, как на крысе) */
const saddle = (i: number): string => `<span class="mo-saddle" style="--sd:${RATS[i].saddle}">${i + 1}</span>`;

/** Кто поставил на крысу — строкой: «Tester2 50 · Tester3 30» (своя — «ты 60», первой) */
function bettors(bets: readonly RatBetView[], rat: number, me: number, max = 3): string {
  const list = bets.filter((b) => b.rat === rat).sort((a, b) => Number(b.pid === me) - Number(a.pid === me));
  const shown = list.slice(0, max).map((b) => `${b.pid === me ? 'ты' : b.nick} ${num(b.stake)}`);
  return list.length > max ? `${shown.join(' · ')} · +${list.length - max}` : shown.join(' · ');
}

export interface RatKit {
  slots: HudSlots;
  top: TopCenter;
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
  private readonly kit: RatKit | null;
  // окно ставки
  private readonly scrim: HTMLElement;
  private readonly win: HTMLElement;
  private readonly cards: Array<{ btn: HTMLButtonElement; mult: HTMLElement; chance: HTMLElement; who: HTMLElement }> = [];
  private readonly chipBtns: Array<{ btn: HTMLButtonElement; chip: number }> = [];
  private readonly amount: HTMLInputElement;
  private readonly limit: HTMLElement;
  private readonly go: HTMLButtonElement;
  private readonly goMain: HTMLElement;
  private readonly goSmall: HTMLElement;
  private readonly balPill: HTMLElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly state: HTMLElement;
  private readonly bank: HTMLElement;
  // у арены: плитка своей ставки и список крыс под бейджем, клавиши внизу
  private readonly tiles: HTMLElement;
  private readonly list: HTMLElement;
  private readonly rows: HTMLElement;
  private readonly camBtn: HTMLButtonElement;
  private readonly keys: HTMLElement;
  private shown = false;
  private panelKey = '';
  private keysKey = '';
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

  /** shell — оболочка HUD (#hud): окно ставки рядом со слоем кита; kit — слоты и верх-центр (без него — тесты) */
  constructor(shell: HTMLElement, send: (msg: ClientMsg) => void, balance: () => number, kit: RatKit | null = null) {
    this.send = send;
    this.balance = balance;
    this.kit = kit;
    // ---- окно ставки
    this.scrim = h('div', 'k-scrim rr-scrim');
    this.scrim.dataset.mode = 'rats';
    this.scrim.hidden = true;
    this.win = this.scrim.appendChild(h('section', 'k-window mo-bet-win'));
    this.win.tabIndex = -1;
    this.win.setAttribute('role', 'dialog');
    this.win.setAttribute('aria-label', 'Крысиные бега: ставка');
    const head = this.win.appendChild(h('header', 'k-win-head'));
    head.appendChild(h('span', 'k-win-portrait', `<img src="${uiIcon('rat')}" alt="">`));
    const titles = head.appendChild(h('div', 'k-win-titles'));
    this.bank = titles.appendChild(h('p', 'k-eyebrow'));
    titles.appendChild(h('h2', 'k-win-title')).textContent = 'Крысиные бега';
    const x = head.appendChild(h('div', 'k-win-tools')).appendChild(h('button', 'k-close', '<kbd class="k-key k-key--sm">Esc</kbd>'));
    x.type = 'button';
    x.setAttribute('aria-label', 'Закрыть окно ставки');
    x.addEventListener('click', () => this.close());
    const body = this.win.appendChild(h('div', 'k-win-body'));
    body.appendChild(h('p', 'mo-step', '<b>1</b>На кого ставишь'));
    const grid = body.appendChild(h('div', 'mo-rats'));
    RATS.forEach((def, i) => {
      const btn = grid.appendChild(h('button', 'k-cell mo-rat'));
      btn.type = 'button';
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = `${saddle(i)}<span class="mo-rat-name"></span><span class="mo-rat-x"></span><span class="mo-rat-trait"></span><span class="mo-rat-foot"></span><span class="mo-rat-who"></span>`;
      btn.querySelector('.mo-rat-name')!.textContent = def.name;
      btn.querySelector('.mo-rat-trait')!.textContent = def.trait;
      btn.addEventListener('click', () => this.choose(i));
      this.cards.push({ btn, mult: btn.querySelector('.mo-rat-x')!, chance: btn.querySelector('.mo-rat-foot')!, who: btn.querySelector('.mo-rat-who')! });
    });
    body.appendChild(h('p', 'mo-step', '<b>2</b>Сколько'));
    const bet = body.appendChild(h('div', 'k-bet'));
    const chips = bet.appendChild(h('div', 'k-bet-chips'));
    for (const chip of RAT_CHIPS) {
      const btn = chips.appendChild(h('button', `k-chip k-chip--${chip}`));
      btn.type = 'button';
      btn.textContent = String(chip);
      btn.setAttribute('aria-label', `Добавить ${chip} к ставке`);
      btn.addEventListener('click', () => this.setDraft(this.draft + chip));
      this.chipBtns.push({ btn, chip });
    }
    this.resetBtn = chips.appendChild(h('button', 'k-btn k-btn--ghost k-btn--sm rr-reset'));
    this.resetBtn.type = 'button';
    this.resetBtn.textContent = 'Сбросить';
    this.resetBtn.addEventListener('click', () => this.setDraft(0));
    const row = bet.appendChild(h('div', 'k-bet-row'));
    const field = row.appendChild(h('label', 'k-bet-amount'));
    field.append('Ставка');
    this.amount = field.appendChild(h('input', 'k-input k-bet-input'));
    this.amount.type = 'text';
    this.amount.inputMode = 'numeric';
    this.amount.autocomplete = 'off';
    this.amount.maxLength = String(RAT_MAX_BET).length;
    this.amount.placeholder = '0';
    this.amount.setAttribute('aria-label', 'Сумма ставки в жетонах');
    this.amount.addEventListener('input', () => {
      const digits = this.amount.value.replace(/\D/g, '').slice(0, 4);
      if (this.amount.value !== digits) this.amount.value = digits;
      this.draft = digits ? Number(digits) : 0;
      this.error = '';
      this.render();
    });
    this.go = row.appendChild(h('button', 'k-btn k-btn--gold k-btn--lg rr-go'));
    this.go.type = 'button';
    this.goMain = this.go.appendChild(h('span', ''));
    this.goSmall = this.go.appendChild(h('small', ''));
    this.go.insertAdjacentHTML('beforeend', '<kbd class="k-key k-key--tr">Enter</kbd>');
    this.go.addEventListener('click', () => this.submit());
    this.balPill = row.appendChild(h('span', 'k-pill k-pill--gold k-pill--lg'));
    this.state = bet.appendChild(h('p', 'rr-state'));
    this.limit = bet.appendChild(h('p', 'k-bet-note'));
    // клавиши в окне — только ему: ни ходьбы, ни эмоций, ни чата
    this.scrim.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape') { e.preventDefault(); this.close(); return; }
      if (e.target === this.amount && e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      const k = PICK_KEYS[e.code];
      if (k !== undefined) { e.preventDefault(); this.choose(k); return; }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); this.submit(); }
    });
    this.scrim.addEventListener('keyup', (e) => e.stopPropagation());
    // мимо окна — закрыть
    this.scrim.addEventListener('pointerdown', (e) => { if (e.target === this.scrim) this.close(); });
    shell.appendChild(this.scrim);

    // ---- у арены: плитка своей ставки и список крыс — под бейджем (слот tr), клавиши — внизу по центру
    const tr = kit?.slots.tr ?? shell;
    this.tiles = tr.appendChild(h('div', 'k-tiles rr-tiles'));
    this.tiles.hidden = true;
    this.list = tr.appendChild(h('div', 'k-plate mo-list mo-ratlist rr-list'));
    this.list.hidden = true;
    this.list.setAttribute('role', 'status');
    this.rows = this.list.appendChild(h('div', 'rr-rows'));
    // на телефоне по крысе в списке можно нажать — болеть
    this.rows.addEventListener('click', (e) => {
      const r = (e.target as Element).closest<HTMLElement>('[data-rat]');
      if (r) this.cheer(Number(r.dataset.rat));
    });
    this.camBtn = this.list.appendChild(h('button', 'k-btn k-btn--ghost k-btn--sm rr-cam'));
    this.camBtn.type = 'button';
    this.camBtn.hidden = true;
    this.camBtn.addEventListener('click', () => this.onCam());
    this.keys = h('div', 'k-plate mo-keys key-hint rr-keys');
    this.keys.hidden = true;
    kit?.slots.bc.prepend(this.keys);
    window.setInterval(() => this.tick(), 200);
  }

  get isOpen(): boolean { return !this.scrim.hidden; }

  /** Плашка у арены видна */
  get panelShown(): boolean { return this.shown; }

  /** Рядом с ареной: итоги и подтверждения — в плашке, тосты не нужны */
  get near(): boolean { return this.nearM <= NEAR_M; }

  /** Болеть можно: у арены идёт приём ставок или забег (тогда клавиши 1–6 — за крыс, а не эмоции) */
  get cheering(): boolean {
    const v = this.view;
    return !!v && this.nearM <= CHEER_M && this.shown && (v.phase === 'open' || v.phase === 'run' || this.running());
  }

  open(pid: number): void {
    this.myPid = pid;
    this.error = '';
    if (this.draft <= 0) this.draft = Math.min(maxRatBet(this.balance()), 10);
    this.amount.value = this.draft ? String(this.draft) : '';
    this.render();
    if (!this.isOpen) {
      this.scrim.hidden = false;
      this.win.classList.remove('is-in');
      void this.win.offsetWidth;
      this.win.classList.add('is-in');
      this.onOpen();
      // фокус — в окне (клавиши ему); на карточку — только если крыса уже выбрана, иначе рамка фокуса читается как выбор
      (this.pick >= 0 ? this.cards[this.pick].btn : this.win).focus({ preventScroll: true });
    }
  }

  close(): void {
    if (!this.isOpen) return;
    this.scrim.hidden = true;
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.onClose();
  }

  /** Вход и выход из сцены: всё спрятать молча (мышь не трогаем) */
  reset(): void {
    this.scrim.hidden = true;
    this.setShown(false);
    this.kit?.top.clearHero(HERO);
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

  /** Свой итог: покажем после финиша у этого игрока (плитка, баннер или тост) */
  onResult(m: Outcome): void {
    this.outcome = m;
  }

  /**
   * Забег race кончился у этого игрока (или итог пришёл позже): что сказать тостом вдали от арены (null — не ставил
   * или уже сказали). У арены итог — в плашке и плитке, выигрыш — крупным баннером «Ты выиграл!».
   */
  finishText(race: number): { text: string; payout: number } | null {
    if (this.resultRace !== race) { this.resultAt = performance.now(); this.resultRace = race; }
    const o = this.outcome;
    if (!o || o.race !== race || this.toasted === race) return null;
    this.toasted = race;
    if (o.payout > 0 && this.near) this.kit?.top.hero({ key: HERO, prio: PRIO.mode, tone: 'gold', title: 'Ты выиграл!', sub: `🪙+${num(o.payout)} жетонов` });
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

  /** Кто-то болеет за крысу — строка в списке вспыхивает */
  pulse(rat: number): void {
    const r = this.rows.querySelector<HTMLElement>(`[data-rat="${rat}"]`);
    if (!r || !this.shown) return;
    r.classList.remove('rr-hit');
    void r.offsetWidth;
    r.classList.add('rr-hit');
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
      c.btn.classList.toggle('is-on', on);
      c.btn.setAttribute('aria-pressed', String(on));
      c.btn.disabled = !!mine || v?.phase === 'run' || busy;
      // кто уже поставил на эту крысу — ник и сумма (своя — «ты»)
      const who = bettors(bets, i, this.myPid, 3);
      c.who.textContent = who ? `ставки: ${who}` : '';
    });
    const cap = maxRatBet(bal);
    for (const { btn, chip } of this.chipBtns) btn.disabled = !!mine || busy || this.draft + chip > cap;
    this.amount.readOnly = !!mine || busy;
    this.resetBtn.disabled = !!mine || busy || this.draft === 0;
    const balHtml = `${coinHtml()}${num(bal)}`;
    if (this.balPill.innerHTML !== balHtml) this.balPill.innerHTML = balHtml;
    coinText(this.limit, bal < RAT_MIN_BET
      ? `У тебя ${num(bal)} 🪙 — а на ставку нужно хотя бы ${RAT_MIN_BET} 🪙`
      : `от ${RAT_MIN_BET} до ${num(cap)} жетонов · одна ставка на забег · выплата до ${num(RAT_MAX_PAYOUT)}`);
    const why = this.blocker();
    const can = !why && !mine && !busy;
    this.go.disabled = !can;
    if (mine) {
      this.goMain.textContent = 'Ставка сделана';
      coinText(this.goSmall, `${RATS[mine.rat].name} · ${num(mine.stake)} 🪙`);
    } else if (busy) {
      this.goMain.textContent = 'Ставим…';
      this.goSmall.textContent = '';
    } else if (this.pick >= 0 && this.draft >= RAT_MIN_BET && odds[this.pick]) {
      this.goMain.textContent = 'Поставить';
      this.goSmall.textContent = `на ${ratAcc(this.pick)} · выиграешь ${num(ratWin(this.draft, odds[this.pick]))}`;
    } else {
      this.goMain.textContent = 'Поставить';
      coinText(this.goSmall, why);
    }
    this.goSmall.hidden = !this.goSmall.textContent && !this.goSmall.childElementCount;
    // строка состояния: причина отказа сервера (красным) или что сейчас с моей ставкой
    const status = this.error ? this.error
      : mine ? (v?.phase === 'open' ? `Ты поставил на ${ratAcc(mine.rat)} — старт через ${this.left()} с` : `Ты поставил на ${ratAcc(mine.rat)} — забег идёт`)
        : v?.phase === 'run' || this.running() ? 'Забег идёт — ставь на следующий' : '';
    coinText(this.state, status);
    this.state.hidden = !status;
    this.state.classList.toggle('is-err', !!this.error);
    // наверху окна — что сейчас и сколько в банке
    const n = bets.length;
    coinText(this.bank, v?.phase === 'open' ? `Ипподром · приём ставок · старт через ${this.left()} с · банк ${num(ratBank(bets))} 🪙 · ${n} ${betsWord(n)}`
      : v?.phase === 'run' || this.running() ? 'Ипподром · забег идёт — ставки на следующий'
        : `Ипподром · твоя ставка откроет забег: старт через ${RAT_OPEN_MS / 1000} с`);
  }

  // ------------------------------------------------------------ у арены

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

  /** Плашка, плитка, список и клавиши — вместе (у арены) */
  private setShown(on: boolean): void {
    if (on === this.shown && on) return;
    this.shown = on;
    this.tiles.hidden = this.list.hidden = !on;
    if (!on) {
      this.kit?.top.clear(EVENT);
      this.keys.hidden = true;
      this.keysKey = '';
    }
  }

  private renderPanel(): void {
    const v = this.view;
    const ph = this.near && v ? this.phase() : '';
    const st = ph === 'run' ? this.standings() : null;
    const res = ph === 'result' ? this.resultOrder() : null;
    const left = ph === 'open' ? this.left() : 0;
    const camOn = this.camOn(), camAvail = this.camAvail();
    this.renderKeys(ph, camOn, camAvail);
    const key = `${ph}|${left}|${st?.join('') ?? ''}|${res?.join('') ?? ''}|${v?.race}|${v?.bets.length}|${this.runBets?.race ?? 0}|${v?.last?.race ?? 0}|${this.outcome?.race ?? 0}|${camOn}|${camAvail}|${this.myPid}|${this.balance() >= RAT_MIN_BET}`;
    if (key === this.panelKey) return;
    this.panelKey = key;
    this.setShown(!!ph && !!v);
    if (!ph || !v) return;
    // ставки и коэффициенты: текущего забега (приём, забег) или прошедшего (итог)
    const run = this.runBets;
    const last = v.last && v.last.race === this.resultRace ? v.last : null;
    const pastBets = run && run.race === this.resultRace ? run.bets : [];
    const runRace = this.playing() || v.race;
    const bets = ph === 'open' ? v.bets : ph === 'run' ? (run && run.race === runRace ? run.bets : v.phase === 'run' ? v.bets : []) : pastBets;
    const odds = ph === 'result' ? (last?.odds ?? run?.odds ?? v.odds) : ph === 'run' ? (run?.odds ?? v.odds) : v.odds;
    const order = st ?? res ?? [0, 1, 2, 3, 4, 5];
    const myBet = bets.find((b) => b.pid === this.myPid);
    const mineRat = myBet?.rat ?? -1;
    const wins = last?.wins ?? [];
    const n = bets.length;
    const o = this.outcome && this.outcome.race === this.resultRace ? this.outcome : null;
    // плашка забега — событие в верх-центре
    const ic = `<span class="k-event-ic"><img src="${uiIcon('rat')}" alt=""></span>`;
    const bankText = n ? `банк ${num(ratBank(bets))} ${coinHtml()} · ${n} ${betsWord(n)}` : 'ставок пока нет';
    if (ph === 'open') {
      const frac = this.openTotal > 0 ? Math.max(0, Math.min(1, (left * 1000) / this.openTotal)) : 0;
      const sub = `${mineRat >= 0 ? `твоя — ${RATS[mineRat].name} · ` : ''}${bankText}`;
      this.kit?.top.event({ key: EVENT, prio: PRIO.mode, html: `${ic}<div class="k-event-title">Приём ставок</div><div class="k-event-sub">${sub}</div><div class="k-event-timer${left <= 5 ? ' is-hurry' : ''}">0:${String(left).padStart(2, '0')}</div>${meterHtml(frac, 'mode', 'k-meter--thin')}` });
    } else if (ph === 'run') {
      const place = st && mineRat >= 0 ? st.indexOf(mineRat) + 1 : 0;
      const sub = myBet ? `Твоя ${RATS[mineRat].name} — ${place ? placeOf(mineRat, place) : 'в забеге'} · ставка ${num(myBet.stake)}` : bankText;
      this.kit?.top.event({ key: EVENT, prio: PRIO.mode, html: `${ic}<div class="k-event-title">${st ? `Забег! Впереди ${esc(RATS[st[0]].name)}` : 'Забег!'}</div><div class="k-event-sub">${sub}</div>` });
    } else {
      const paid = wins.reduce((a, w) => a + w.payout, 0);
      const sub = wins.length ? `Выплачено ${num(paid)} ${coinHtml()} · ставок было ${n || wins.length}` : n ? `Никто не угадал · ставок было ${n}` : 'Ставок не было';
      const title = `${res ? ratWon(res[0]) : 'Финиш'}${res && odds[res[0]] ? ` ×${odds[res[0]]}` : ''}!`;
      this.kit?.top.event({ key: EVENT, prio: PRIO.mode, tone: 'good', lamp: true, html: `${ic}<div class="k-event-title">${esc(title)}</div><div class="k-event-sub">${sub}</div>` });
    }
    // своя ставка — плиткой под бейджем
    let tile = '';
    const face = `<span class="k-tile-face"><img src="${uiIcon('rat')}" alt=""></span>`;
    if (ph === 'result' && o) {
      tile = o.payout > 0
        ? `<div class="k-tile k-tile--own">${face}<span class="k-tile-cap"><span>сыграла!</span><small>${coinHtml()}+${num(o.payout)}</small></span></div>`
        : `<div class="k-tile k-tile--off">${face}<span class="k-tile-cap"><span>${esc(RATS[o.rat].name)} — ${res ? placeOf(o.rat, res.indexOf(o.rat) + 1) : '…'}</span><small>не сыграла</small></span></div>`;
    } else if (ph !== 'result' && myBet) {
      tile = `<div class="k-tile k-tile--own">${face}<span class="k-tile-cap"><span>${esc(RATS[mineRat].name)} ×${odds[mineRat] ?? '?'}</span><small>${num(myBet.stake)} → ${coinHtml()}${num(ratWin(myBet.stake, odds[mineRat] ?? 0))}</small></span></div>`;
    }
    this.tiles.innerHTML = tile;
    this.tiles.hidden = !tile;
    // шесть крыс: по номеру (приём) или по местам (забег, итог); своя — золотом
    const places = ph !== 'open';
    this.list.classList.toggle('has-places', places);
    this.rows.innerHTML = order.map((rat, k) => {
      let who: string;
      if (ph === 'result' && k === 0) {
        // победители — с выигрышем
        const paidRows = bets.filter((b) => b.rat === rat).map((b) => `${b.pid === this.myPid ? 'ты' : b.nick} +${num(wins.find((x) => x.nick === b.nick)?.payout ?? 0)}`);
        const extra = run && run.race === this.resultRace ? [] : wins.map((w) => `${w.nick} +${num(w.payout)}`);
        who = [...paidRows, ...extra].slice(0, 2).join(' · ');
      } else who = bettors(bets, rat, this.myPid, 2);
      const cls = `mo-row${rat === mineRat ? ' is-own' : ''}${ph === 'result' && k > 0 ? ' rr-lost' : ''}`;
      return `<div class="${cls}" data-rat="${rat}">${places ? `<span class="mo-pl${k === 0 ? ' is-lead' : ''}">${k + 1}</span>` : ''}${saddle(rat)}<b><span>${esc(RATS[rat].name)}</span><small>${esc(who || 'ставок нет')}</small></b><span class="mo-row-side">${odds[rat] ? `×${odds[rat]}` : ''}</span></div>`;
    }).join('');
    this.camBtn.hidden = !TOUCH || !camAvail || ph === 'result';
    this.camBtn.innerHTML = `<img class="k-ic" src="${uiIcon('camera')}" alt="">${camOn ? 'Обычный вид' : 'Вид на трассу'}`;
  }

  /** Клавиши внизу: болеть и камера (пока идёт приём ставок или забег и ты у арены) */
  private renderKeys(ph: string, camOn: boolean, camAvail: boolean): void {
    const on = (ph === 'open' || ph === 'run') && this.nearM <= CHEER_M;
    const key = on ? `${TOUCH}|${camOn}|${camAvail}` : '';
    if (key === this.keysKey) return;
    this.keysKey = key;
    this.keys.hidden = !on;
    if (!on) return;
    if (TOUCH) {
      this.keys.innerHTML = '<span class="mo-key"><em>Нажми на крысу в списке — болеть</em></span>';
      return;
    }
    const items: Array<[string, string]> = [['1–6', 'болеть за крысу']];
    if (camAvail) items.push(['C', camOn ? 'обычный вид' : 'вид на трассу']);
    this.keys.innerHTML = keysRow(items).innerHTML;
  }
}
