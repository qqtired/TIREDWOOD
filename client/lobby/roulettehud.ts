// Окно ставки рулетки рыбака (fisheco) и плашка раунда. Окно: твой улов (какие рыбы и сколько стоят — ставка всегда весь
// улов из рюкзака по его цене), три больших поля «красное / чёрное / зеро» с шансом и выигрышем, кнопка «Поставить».
// Ставит сервер (server/lobby/roulette.ts): окно по «Поставить» сразу закрывается, чтобы было видно стол и тост сервера
// с причиной, если ставку не приняли («Подойди к столу», «Колесо уже крутится»). Плашка раунда висит у стола, пока он
// идёт: приём ставок и твоя ставка, колесо крутится, итог (после остановки шарика) и твой выигрыш.
import { FISH } from '../../shared/fishing.ts';
import { bagValue, emptyFishProgress, type FishProgress } from '../../shared/fishprogress.ts';
import type { ClientMsg, ServerMsg } from '../../shared/messages.ts';
import {
  ROULETTE_COLORS, ROULETTE_COLOR_NAMES, ROULETTE_MAX_PAYOUT, ROULETTE_OPEN_MS, ROULETTE_PAYOUT, rouletteChance, rouletteColor, rouletteWin,
  type RouletteColor, type RouletteView,
} from '../../shared/roulette.ts';
import { setCoinText } from '../ui/coin.ts';
import { el, fishPic, tierOf } from './fish2.ts';
import { fishCount, num } from './fishfmt.ts';
import './fisheco.css';

const NAMES: Record<RouletteColor, string> = { red: 'Красное', black: 'Чёрное', green: 'Зеро' };
/** Клавиши выбора поля: 1 — красное, 2 — чёрное, 3 — зеро */
const PICK_KEYS: Record<string, RouletteColor> = { Digit1: 'red', Digit2: 'black', Digit3: 'green', Numpad1: 'red', Numpad2: 'black', Numpad3: 'green' };
/** Сколько висит итог после остановки шарика, мс */
const RESULT_MS = 9000;
/** Итог твоей ставки (rouletteResult) */
type Outcome = Extract<ServerMsg, { t: 'rouletteResult' }>;

export class RouletteHud {
  onOpen: () => void = () => {};
  onClose: () => void = () => {};
  /** Идёт ли вращение у этого игрока (даёт колесо в 3D): итог показываем после остановки шарика */
  isSpinning: () => boolean = () => false;
  private readonly root: HTMLDialogElement;
  private readonly fish: HTMLElement;
  private fishKey = '';
  private readonly sum: HTMLElement;
  private readonly state: HTMLElement;
  private readonly picks = new Map<RouletteColor, { btn: HTMLButtonElement; win: HTMLElement }>();
  private readonly go: HTMLButtonElement;
  private readonly others: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly bannerHead: HTMLElement;
  private readonly bannerSub: HTMLElement;
  private bannerKey = '';
  private readonly send: (msg: ClientMsg) => void;
  private progress: FishProgress = emptyFishProgress();
  private view: RouletteView | null = null;
  private viewAt = 0;
  private myPid = 0;
  private pick: RouletteColor | null = null;
  private near = false;
  /** Итог моей ставки и в каком раунде он пришёл */
  private outcome: Outcome | null = null;
  private outcomeRound = 0;
  private resultKey = '';
  private resultAt = 0;

  constructor(parent: HTMLElement, send: (msg: ClientMsg) => void) {
    this.send = send;
    this.root = el('dialog', 'fe-rl');
    this.root.setAttribute('aria-labelledby', 'fe-rl-title');
    const top = this.root.appendChild(el('div', 'fe-bag-top'));
    top.appendChild(el('h2', '', '🎡 Рулетка рыбака')).id = 'fe-rl-title';
    const x = top.appendChild(el('button', 'fn-close', '×'));
    x.type = 'button';
    x.title = 'Закрыть · Esc';
    x.setAttribute('aria-label', 'Закрыть рулетку');
    x.addEventListener('click', () => this.close());
    // 1. сколько: весь улов из рюкзака
    this.root.appendChild(el('div', 'fe-rl-step', '1. Твоя ставка — весь улов из рюкзака'));
    this.fish = this.root.appendChild(el('div', 'fe-rl-fish'));
    this.sum = this.root.appendChild(el('p', 'fe-rl-sum'));
    // 2. на что: три поля
    this.root.appendChild(el('div', 'fe-rl-step', '2. На что ставишь'));
    const row = this.root.appendChild(el('div', 'fe-rl-picks'));
    ROULETTE_COLORS.forEach((c, i) => {
      const btn = row.appendChild(el('button', `fe-rl-pick ${c}`));
      btn.type = 'button';
      btn.setAttribute('aria-pressed', 'false');
      btn.appendChild(el('span', 'fe-rl-key', String(i + 1)));
      btn.appendChild(el('b', 'fe-rl-pname', NAMES[c]));
      btn.appendChild(el('span', 'fe-rl-pmul', `×${ROULETTE_PAYOUT[c]}`));
      btn.appendChild(el('span', 'fe-rl-pchance', `шанс ${(rouletteChance(c) * 100).toFixed(1).replace('.', ',')}%`));
      const win = btn.appendChild(el('span', 'fe-rl-pwin'));
      btn.addEventListener('click', () => this.choose(c));
      this.picks.set(c, { btn, win });
    });
    // 3. поставить
    this.go = this.root.appendChild(el('button', 'fn-action fe-rl-go'));
    this.go.type = 'button';
    this.go.addEventListener('click', () => this.submit());
    this.state = this.root.appendChild(el('p', 'fe-rl-state'));
    this.others = this.root.appendChild(el('p', 'fn-fine fe-rl-others'));
    const cap = Number.isFinite(ROULETTE_MAX_PAYOUT) ? ` Выплата — не больше ${num(ROULETTE_MAX_PAYOUT)} 🪙.` : '';
    setCoinText(this.root.appendChild(el('p', 'fn-fine')), `Европейская рулетка: 37 лунок — 18 красных, 18 чёрных и зеро. Выиграл — жетоны сразу; проиграл — улов пропадает.${cap} Колесо крутится через ${ROULETTE_OPEN_MS / 1000} с после первой ставки или сразу, когда поставили все у стола. Клавиши: 1, 2, 3 — поле, Enter — поставить, Esc — закрыть.`);
    this.root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape') { e.preventDefault(); this.close(); return; }
      const c = PICK_KEYS[e.code];
      if (c) { e.preventDefault(); this.choose(c); return; }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); this.submit(); }
    });
    this.root.addEventListener('keyup', (e) => e.stopPropagation());
    this.root.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.close(); });
    parent.appendChild(this.root);
    // плашка раунда у стола: не мешает кликам (живёт в слое меню), только показывает
    this.banner = parent.appendChild(el('div', 'fe-rl-banner'));
    this.banner.hidden = true;
    this.banner.setAttribute('role', 'status');
    this.badge = this.banner.appendChild(el('div', 'fe-rl-badge'));
    const text = this.banner.appendChild(el('div', 'fe-rl-btext'));
    this.bannerHead = text.appendChild(el('b', ''));
    this.bannerSub = text.appendChild(el('span', ''));
    window.setInterval(() => this.tick(), 250);
  }

  get isOpen(): boolean { return this.root.open; }

  open(progress: FishProgress, pid: number): void {
    this.progress = progress;
    this.myPid = pid;
    this.pick = null;
    this.render();
    if (!this.root.open) {
      this.root.showModal();
      this.onOpen();
      this.picks.get('red')?.btn.focus({ preventScroll: true });
    }
  }

  setProgress(progress: FishProgress): void {
    this.progress = progress;
    if (this.isOpen) this.render();
  }

  setView(v: RouletteView): void {
    this.view = v;
    this.viewAt = performance.now();
    if (this.isOpen) this.render();
    this.renderBanner();
  }

  /** Рядом ли игрок со столом: плашка раунда видна только там */
  setNear(near: boolean): void {
    if (this.near === near) return;
    this.near = near;
    this.renderBanner();
  }

  /** Твой итог: выигрыш или проигрыш — плашка покажет его после остановки шарика */
  onResult(m: Outcome): void {
    this.outcome = m;
    this.outcomeRound = this.view?.round ?? 0;
  }

  /** Подсказка у стола */
  hint(): string {
    const v = this.view;
    if (v?.phase === 'open') return `рулетка · приём ставок ${this.left()} с · ставок: ${v.bets.length}`;
    if (v?.phase === 'spin') return 'рулетка · колесо крутится';
    return 'рулетка рыбака · ставка — весь улов';
  }

  close(): void {
    if (!this.root.open) return;
    this.root.close();
    this.onClose();
  }

  /** Свой итог текстом (тост): выигрыш или улов ушёл в море */
  static resultText(m: Outcome): string {
    const what = `Выпало ${m.n} — ${ROULETTE_COLOR_NAMES[m.c]}`;
    return m.payout > 0 ? `🎡 ${what}. Ты выиграл ${num(m.payout)} 🪙!` : `🎡 ${what}. Улов (${num(m.stake)} 🪙) ушёл в море…`;
  }

  private left(): number {
    const v = this.view;
    return v ? Math.max(0, Math.ceil((v.left - (performance.now() - this.viewAt)) / 1000)) : 0;
  }

  private mine(): RouletteView['bets'][number] | undefined {
    return this.view?.bets.find((b) => b.pid === this.myPid);
  }

  /** Можно ли сейчас ставить: есть улов, не ставил в этом раунде, колесо не крутится */
  private canBet(): boolean {
    return this.progress.bag.length > 0 && !this.mine() && this.view?.phase !== 'spin';
  }

  private choose(c: RouletteColor): void {
    if (this.progress.bag.length === 0) return;
    this.pick = c;
    this.render();
  }

  /** «Поставить»: просьба серверу, окно закрываем — увидишь стол, плашку со своей ставкой или тост с причиной отказа */
  private submit(): void {
    if (!this.pick || !this.canBet()) return;
    this.send({ t: 'roulette', a: 'bet', c: this.pick });
    this.close();
  }

  private tick(): void {
    if (this.isOpen) this.render();
    this.renderBanner();
  }

  private render(): void {
    const bag = this.progress.bag;
    const stake = bagValue(bag);
    const v = this.view;
    const mine = this.mine();
    // какие рыбы идут в ставку — картинки с ценой (пересобираем, только когда рюкзак поменялся)
    const key = bag.map((f) => f.n).join(',');
    if (key !== this.fishKey) {
      this.fishKey = key;
      this.fish.replaceChildren(...bag.map((f) => {
        const sp = FISH.findIndex((x) => x.id === f.f);
        const chip = el('div', 'fe-rl-chip');
        chip.style.setProperty('--tc', tierOf(sp).css);
        chip.title = `${FISH[sp]?.name ?? f.f} · ${num(f.p)} жетонов`;
        chip.appendChild(fishPic(sp, 'fe-rl-fpic'));
        chip.appendChild(el('span', '', num(f.p)));
        return chip;
      }));
    }
    this.fish.hidden = bag.length === 0;
    setCoinText(this.sum, bag.length ? `${fishCount(bag.length)} на ${num(stake)} 🪙 — всё это уйдёт на стол` : 'Рюкзак пуст — ставить нечего. Поймай рыбу и возвращайся.');
    const can = this.canBet();
    for (const [c, p] of this.picks) {
      setCoinText(p.win, bag.length ? `выиграешь ${this.winText(stake, c)}` : '');
      p.btn.disabled = bag.length === 0 || !!mine || v?.phase === 'spin';
      p.btn.classList.toggle('on', this.pick === c);
      p.btn.setAttribute('aria-pressed', String(this.pick === c));
    }
    this.go.disabled = !this.pick || !can;
    setCoinText(this.go, this.pick ? `Поставить весь улов на ${NAMES[this.pick].toLowerCase()}` : 'Выбери поле, на которое ставишь');
    this.go.classList.toggle('ready', !!this.pick && can);
    setCoinText(this.state, mine ? `Ты уже поставил на ${ROULETTE_COLOR_NAMES[mine.c]} (${num(mine.stake)} 🪙) — жди колесо`
      : v?.phase === 'spin' ? 'Колесо крутится — ставь в следующем раунде'
        : v?.phase === 'open' ? `Идёт приём ставок: ещё ${this.left()} с`
          : 'Стол свободен — твоя ставка откроет раунд');
    const rest = (v?.bets ?? []).filter((b) => b.pid !== this.myPid);
    setCoinText(this.others, rest.length ? `За столом: ${rest.map((b) => `${b.nick} — ${ROULETTE_COLOR_NAMES[b.c]} (${num(b.stake)} 🪙)`).join('; ')}` : '');
    this.others.hidden = rest.length === 0;
  }

  /** «1 200 🪙»; упёрлись в потолок — так и пишем, чтобы ставка на зеро не обещала лишнего */
  private winText(stake: number, c: RouletteColor): string {
    const win = rouletteWin(stake, c);
    return `${num(win)} 🪙${win < stake * ROULETTE_PAYOUT[c] ? ' (потолок)' : ''}`;
  }

  /** Плашка раунда у стола */
  private renderBanner(): void {
    const v = this.view;
    const now = performance.now();
    let cls = '';
    let head = '';
    let sub = '';
    let badge = '';
    if (this.near && v) {
      const mine = this.mine();
      const bet = mine ? `Твоя ставка: ${ROULETTE_COLOR_NAMES[mine.c]} · ${num(mine.stake)} 🪙` : '';
      if (this.isSpinning()) {
        cls = 'spin';
        head = '🎡 Колесо крутится…';
        sub = bet || (v.bets.length ? `Ставок за столом: ${v.bets.length}` : '');
      } else if (v.phase === 'open') {
        cls = 'open';
        head = `🎡 Приём ставок · ${this.left()} с`;
        sub = bet || `Ставок за столом: ${v.bets.length} · E — поставить`;
      } else if (v.n !== undefined && v.phase !== 'spin') {
        const rk = `${v.round}:${v.n}`;
        if (rk !== this.resultKey) { this.resultKey = rk; this.resultAt = now; }
        if (now - this.resultAt < RESULT_MS) {
          const col = rouletteColor(v.n);
          cls = `res ${col}`;
          badge = String(v.n);
          head = `Выпало ${v.n} — ${ROULETTE_COLOR_NAMES[col]}`;
          const o = this.outcome;
          sub = o && o.n === v.n && this.outcomeRound === v.round ? (o.payout > 0 ? `Ты выиграл ${num(o.payout)} 🪙!` : `Улов (${num(o.stake)} 🪙) ушёл в море…`) : '';
        }
      }
    }
    const key = `${cls}|${head}|${sub}|${badge}`;
    if (key === this.bannerKey) return;
    this.bannerKey = key;
    this.banner.hidden = !cls;
    this.banner.className = `fe-rl-banner ${cls}`;
    this.badge.hidden = !badge;
    this.badge.className = `fe-rl-badge ${cls.split(' ')[1] ?? ''}`;
    this.badge.textContent = badge;
    this.bannerHead.textContent = head;
    setCoinText(this.bannerSub, sub);
  }
}
