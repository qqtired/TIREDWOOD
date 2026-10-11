// Рулетка рыбака на ките UI 2.0 (эталон — lab/ui «Режимы» → «Рулетка рыбака на баркасе»; свой префикс классов rl-).
//  · Окно ставки (E у стола) — fishDialog из fishkit.ts, как окно ставки крыс и блэкджека: шаг 1 «Твоя ставка — весь улов
//    из рюкзака» (рыбы с ценой и сумма), шаг 2 «На что ставишь» (три крупных поля: красное / чёрное / зеро с клавишами 1–3,
//    множителем, шансом и выигрышем), золотая «Поставить», «Последние ставки», правила в подвале.
//    Ставит сервер (server/lobby/roulette.ts): окно по «Поставить» сразу закрывается, чтобы было видно стол и тост сервера
//    с причиной, если ставку не приняли («Подойди к столу», «Колесо уже крутится»).
//  · Плашка раунда у стола — плашка верх-центра (kit.top.event): приём ставок с отсчётом и твоя ставка, колесо крутится,
//    итог (после остановки шарика). Висит, только пока ты у стола.
//  · Твоя ставка — золотая плитка в ряду под бейджем (.k-tile--own); итог ставки — крупный баннер по центру (kit.top.hero).
import { FISH } from '../../shared/fishing.ts';
import { bagValue, emptyFishProgress, type BagFish, type FishProgress } from '../../shared/fishprogress.ts';
import type { ClientMsg, ServerMsg } from '../../shared/messages.ts';
import {
  ROULETTE_COLORS, ROULETTE_COLOR_NAMES, ROULETTE_MAX_PAYOUT, ROULETTE_OPEN_MS, ROULETTE_PAYOUT, rouletteChance, rouletteColor, rouletteWin,
  type RouletteColor, type RouletteLogRow, type RouletteView,
} from '../../shared/roulette.ts';
import { coinHtml, iconImg, keyHtml, meterHtml } from '../ui/kit/dom.ts';
import { PRIO, escHtml } from '../ui/kit/topcenter.ts';
import { fishPic, tierOf } from './fish2.ts';
import { fishCount, num } from './fishfmt.ts';
import { fishDialog, winHeadHtml, winIn, type FishKitUi } from './fishkit.ts';
import './roulettelog.css';

const NAMES: Record<RouletteColor, string> = { red: 'Красное', black: 'Чёрное', green: 'Зеро' };
/** Клавиши выбора поля: 1 — красное, 2 — чёрное, 3 — зеро */
const PICK_KEYS: Record<string, RouletteColor> = { Digit1: 'red', Digit2: 'black', Digit3: 'green', Numpad1: 'red', Numpad2: 'black', Numpad3: 'green' };
/** Сколько висит итог после остановки шарика, мс */
const RESULT_MS = 9000;
/** Сколько последних ставок показываем в окне ставки (на табло на баркасе — все десять) */
const RECENT_ROWS = 3;
/** Сколько рыб из улова показываем по одной — остальные одной строкой «+N рыб» */
const FISH_SHOWN = 3;
/** Приоритет плашки раунда в верх-центре: выше «прочего» (10) и лодки (35), ниже секундомера (40) */
const ROUND_PRIO = 36;
const KEY = 'roulette';
/** Итог твоей ставки (rouletteResult) */
type Outcome = Extract<ServerMsg, { t: 'rouletteResult' }>;

const ball = (n: number, c: RouletteColor): string => `<span class="rl-ball is-${c}">${n}</span>`;

export class RouletteHud {
  onOpen: () => void = () => {};
  onClose: () => void = () => {};
  /** Идёт ли вращение у этого игрока (даёт колесо в 3D): итог показываем после остановки шарика */
  isSpinning: () => boolean = () => false;
  private readonly dlg: HTMLDialogElement;
  private readonly win: HTMLElement;
  private readonly eyebrow: HTMLElement;
  private readonly fish: HTMLElement;
  private fishKey = '';
  private readonly state: HTMLElement;
  private readonly picks = new Map<RouletteColor, { btn: HTMLButtonElement; win: HTMLElement }>();
  private readonly go: HTMLButtonElement;
  private readonly goText: HTMLElement;
  private readonly others: HTMLElement;
  private readonly recent: HTMLElement;
  private log: readonly RouletteLogRow[] = [];
  /** Твоя ставка в ряду плиток под бейджем */
  private readonly tile: HTMLElement;
  private readonly tileCap: HTMLElement;
  private readonly tileSub: HTMLElement;
  private ownRow: HTMLElement | null = null;
  private roundKey = '';
  private tileKey = '';
  private readonly send: (msg: ClientMsg) => void;
  /** Слоты HUD кита и верх-центр: плашка раунда, плитка своей ставки, итог баннером */
  private readonly kit: FishKitUi;
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
  /** Для какого результата уже показали баннер «Выигрыш!» / «Улов ушёл в море…» */
  private heroKey = '';
  private lastGo = '';
  private lastStatus = '';
  /** Таймер четверти секунды: идёт, пока есть что показывать (у стола или своя ставка в раунде) */
  private timer = 0;

  constructor(parent: HTMLElement, send: (msg: ClientMsg) => void, kit: FishKitUi) {
    this.send = send;
    this.kit = kit;
    const { dlg, win } = fishDialog(parent, 'fi-win--auto rl-win');
    this.dlg = dlg;
    this.win = win;
    const cap = Number.isFinite(ROULETTE_MAX_PAYOUT) ? ` · выплата — не больше ${num(ROULETTE_MAX_PAYOUT)} ${coinHtml()}` : '';
    win.innerHTML = winHeadHtml({ portrait: iconImg('roulette', ''), eyebrow: 'Баркас · приём ставок', title: 'Рулетка рыбака' })
      + `<div class="k-win-body">`
      + `<section class="rl-sec"><p class="rl-step"><b>1</b>Твоя ставка — весь улов из рюкзака</p><div class="rl-stake"></div></section>`
      + `<section class="rl-sec"><p class="rl-step"><b>2</b>На что ставишь</p><div class="rl-fields"></div></section>`
      + `<button type="button" class="k-btn k-btn--gold k-btn--lg k-btn--wide rl-go"><span class="rl-go-t"></span>${keyHtml('Enter', 'tr')}</button>`
      + `<p class="rl-state"></p><p class="rl-others"></p>`
      + `<div class="k-well rl-last" hidden></div></div>`
      + `<footer class="k-win-foot"><span class="k-note rl-rules">37 лунок: 18 красных, 18 чёрных и зеро · проиграл — улов пропадает${cap}</span></footer>`;
    dlg.setAttribute('aria-label', 'Рулетка рыбака');
    this.eyebrow = win.querySelector<HTMLElement>('.k-eyebrow')!;
    this.fish = win.querySelector<HTMLElement>('.rl-stake')!;
    this.state = win.querySelector<HTMLElement>('.rl-state')!;
    this.others = win.querySelector<HTMLElement>('.rl-others')!;
    this.recent = win.querySelector<HTMLElement>('.rl-last')!;
    this.go = win.querySelector<HTMLButtonElement>('.rl-go')!;
    this.goText = win.querySelector<HTMLElement>('.rl-go-t')!;
    win.querySelector('.k-close')!.addEventListener('click', () => this.close());
    // 2. на что: три поля
    const fields = win.querySelector<HTMLElement>('.rl-fields')!;
    ROULETTE_COLORS.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `rl-field is-${c}`;
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = `${keyHtml(String(i + 1), 'tr', 'sm')}<span class="rl-field-name">${NAMES[c]}</span><span class="rl-field-x">×${ROULETTE_PAYOUT[c]}</span>`
        + `<span class="rl-field-ch">шанс ${(rouletteChance(c) * 100).toFixed(1).replace('.', ',')}%</span><span class="rl-field-win"></span>`;
      fields.appendChild(btn);
      btn.addEventListener('click', () => this.choose(c));
      this.picks.set(c, { btn, win: btn.querySelector<HTMLElement>('.rl-field-win')! });
    });
    // 3. поставить
    this.go.addEventListener('click', () => this.submit());
    dlg.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape') { e.preventDefault(); this.close(); return; }
      const c = PICK_KEYS[e.code];
      if (c) { e.preventDefault(); this.choose(c); return; }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); this.submit(); }
    });
    dlg.addEventListener('keyup', (e) => e.stopPropagation());
    // Esc и клик по затемнению (fishkit.ts) — событие cancel
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
    // твоя ставка: золотая плитка в ряду плиток под бейджем (общий .fi-tiles делает HUD рыбалки; нет его — свой ряд)
    this.tile = document.createElement('div');
    this.tile.className = 'k-tile k-tile--own rl-tile';
    this.tile.hidden = true;
    this.tile.innerHTML = `<span class="k-tile-face">${iconImg('roulette', '')}</span><span class="k-tile-cap"><span></span><small></small></span>`;
    this.tileCap = this.tile.querySelector<HTMLElement>('.k-tile-cap > span')!;
    this.tileSub = this.tile.querySelector<HTMLElement>('.k-tile-cap > small')!;
  }

  get isOpen(): boolean { return this.dlg.open; }

  /** Колесо поехало или встало — плашку обновляем сразу (а не по таймеру в четверть секунды), в один кадр с тостом и звуком */
  refresh(): void { this.renderRound(); }

  open(progress: FishProgress, pid: number): void {
    this.progress = progress;
    this.myPid = pid;
    this.pick = null;
    this.renderRecent();
    this.render();
    if (!this.dlg.open) {
      this.dlg.showModal();
      winIn(this.win);
      this.onOpen();
      this.picks.get('red')?.btn.focus({ preventScroll: true });
    }
    this.wake();
  }

  setProgress(progress: FishProgress): void {
    this.progress = progress;
    if (this.isOpen) this.render();
  }

  setView(v: RouletteView): void {
    this.view = v;
    this.viewAt = performance.now();
    if (this.isOpen) this.render();
    this.renderRound();
    this.wake();
  }

  /** Последние ставки с табло на баркасе (свежие сверху): короткий список в окне — как сыграли другие и ты сам */
  setLog(rows: readonly RouletteLogRow[]): void {
    this.log = rows;
    this.renderRecent();
  }

  /** Рядом ли игрок со столом: плашка раунда видна только там */
  setNear(near: boolean): void {
    if (this.near === near) return;
    this.near = near;
    this.renderRound();
    this.wake();
  }

  /** Ушли с набережной: окно закрыть, плашку раунда, баннер и плитку убрать, таймер остановить — в других комнатах ничего от стола */
  reset(): void {
    this.close();
    this.near = false;
    this.view = null;
    this.outcome = null;
    this.outcomeRound = 0;
    this.resultKey = '';
    this.heroKey = '';
    this.roundKey = '';
    this.tileKey = '';
    this.kit.top.clear(KEY);
    this.kit.top.clearHero(KEY);
    this.tile.hidden = true;
    this.tile.remove();
    if (this.timer) { window.clearInterval(this.timer); this.timer = 0; }
  }

  /** Таймер нужен, пока игрок у стола, открыто окно или своя ставка в раунде (останавливается в tick, когда показывать нечего) */
  private wake(): void {
    if (!this.timer && (this.near || this.isOpen || !!this.mine())) this.timer = window.setInterval(() => this.tick(), 250);
  }

  /** Твой итог: выигрыш или проигрыш — баннер покажет его после остановки шарика */
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
    if (!this.dlg.open) return;
    this.dlg.close();
    this.onClose();
  }

  /** Свой итог текстом (тост): выигрыш или улов ушёл в море */
  static resultText(m: Outcome): string {
    const what = `Выпало ${m.n} — ${ROULETTE_COLOR_NAMES[m.c]}`;
    return m.payout > 0 ? `${what}. Ты выиграл ${num(m.payout)} 🪙!` : `${what}. Улов (${num(m.stake)} 🪙) ушёл в море…`;
  }

  private left(): number {
    return Math.ceil(this.leftMs() / 1000);
  }

  private leftMs(): number {
    const v = this.view;
    return v ? Math.max(0, v.left - (performance.now() - this.viewAt)) : 0;
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
    this.renderRound();
    // не у стола, окно закрыто, плашки и плитки нет — таймер не нужен до следующего setNear / setView / open
    if (!this.near && !this.isOpen && this.tile.hidden && !this.roundKey.split('|')[0]) {
      window.clearInterval(this.timer);
      this.timer = 0;
    }
  }

  private renderRecent(): void {
    const rows = this.log.slice(0, RECENT_ROWS);
    this.recent.hidden = rows.length === 0;
    if (rows.length === 0) return;
    this.recent.innerHTML = `<p class="k-eyebrow">Последние ставки</p>${rows.map((r) => {
      const won = r.payout > 0;
      return `<div class="rl-last-row${r.pid === this.myPid ? ' is-own' : ''}">${ball(r.n, rouletteColor(r.n))}<b>${escHtml(r.nick)}</b>`
        + `<span>${ROULETTE_COLOR_NAMES[r.c]} · ${coinHtml()}${num(r.stake)}</span><span class="${won ? 'k-good' : 'k-bad'}">${won ? `+${num(r.payout)}` : `−${num(r.stake)}`}</span></div>`;
    }).join('')}`;
  }

  /** Шаг 1: рыбы улова (самые дорогие — по одной, остальные — одной строкой) и сумма. Пересобираем, только когда рюкзак поменялся */
  private renderFish(bag: readonly BagFish[], stake: number): void {
    const key = bag.map((f) => f.n).join(',');
    if (key === this.fishKey) return;
    this.fishKey = key;
    if (bag.length === 0) {
      this.fish.innerHTML = '<span class="rl-none">Рюкзак пуст — ставить нечего. Поймай рыбу и возвращайся.</span>';
      return;
    }
    const top = [...bag].sort((a, b) => b.p - a.p).slice(0, FISH_SHOWN);
    const rest = bag.filter((f) => !top.includes(f));
    this.fish.replaceChildren(...top.map((f) => {
      const sp = FISH.findIndex((x) => x.id === f.f);
      const chip = document.createElement('span');
      chip.className = 'rl-fish';
      chip.style.setProperty('--tc', tierOf(sp).css);
      chip.appendChild(fishPic(sp, 'rl-fpic'));
      chip.insertAdjacentHTML('beforeend', `<b>${escHtml(FISH[sp]?.name ?? f.f)}</b><span>${coinHtml()}${num(f.p)}</span>`);
      return chip;
    }));
    if (rest.length) {
      this.fish.insertAdjacentHTML('beforeend', `<span class="rl-fish is-more"><b>+${fishCount(rest.length)}</b><span>${coinHtml()}${num(bagValue(rest))}</span></span>`);
    }
    this.fish.insertAdjacentHTML('beforeend', `<span class="rl-stake-sum">${fishCount(bag.length)} на <b>${coinHtml()}${num(stake)}</b></span>`);
  }

  private render(): void {
    const bag = this.progress.bag;
    const stake = bagValue(bag);
    const v = this.view;
    const mine = this.mine();
    this.renderFish(bag, stake);
    this.eyebrow.textContent = v?.phase === 'open' ? `Баркас · приём ставок · ещё ${this.left()} с` : v?.phase === 'spin' ? 'Баркас · колесо крутится' : 'Баркас · стол свободен';
    const can = this.canBet();
    for (const [c, p] of this.picks) {
      const win = bag.length ? `выиграешь ${coinHtml()}${num(rouletteWin(stake, c))}${rouletteWin(stake, c) < stake * ROULETTE_PAYOUT[c] ? ' (потолок)' : ''}` : '';
      if (p.win.dataset.k !== win) {
        p.win.dataset.k = win;
        p.win.innerHTML = win;
      }
      p.btn.disabled = bag.length === 0 || !!mine || v?.phase === 'spin';
      p.btn.classList.toggle('is-on', this.pick === c);
      p.btn.setAttribute('aria-pressed', String(this.pick === c));
    }
    this.go.disabled = !this.pick || !can;
    const label = this.pick ? `Поставить весь улов на ${NAMES[this.pick].toLowerCase()}` : 'Выбери поле, на которое ставишь';
    if (label !== this.lastGo) {
      this.lastGo = label;
      this.goText.textContent = label;
    }
    const status = mine ? `Ты уже поставил на ${ROULETTE_COLOR_NAMES[mine.c]} (${num(mine.stake)} 🪙) — жди колесо`
      : v?.phase === 'spin' ? 'Колесо крутится — ставь в следующем раунде'
        : v?.phase === 'open' ? `Идёт приём ставок: ещё ${this.left()} с`
          : `Стол свободен — твоя ставка откроет раунд, колесо крутится через ${ROULETTE_OPEN_MS / 1000} с`;
    if (status !== this.lastStatus) {
      this.lastStatus = status;
      this.state.innerHTML = escHtml(status).replace('🪙', coinHtml());
    }
    const rest = (v?.bets ?? []).filter((b) => b.pid !== this.myPid);
    const others = rest.length ? `За столом: ${rest.map((b) => `${escHtml(b.nick)} — ${ROULETTE_COLOR_NAMES[b.c]} (${num(b.stake)} ${coinHtml()})`).join('; ')}` : '';
    if (this.others.innerHTML !== others) this.others.innerHTML = others;
    this.others.hidden = rest.length === 0;
    this.state.classList.toggle('is-own', !!mine);
  }

  /** Плашка раунда, плитка своей ставки и итог — по состоянию стола; зовём каждые 0,25 с и по событиям */
  private renderRound(): void {
    const v = this.view;
    const now = performance.now();
    const mine = this.mine();
    const spinning = this.isSpinning();
    let html = '';
    let good = false;
    let hero: { tone: 'gold' | 'lose'; title: string; sub: string; small?: boolean } | null = null;
    if (this.near && v) {
      const bet = mine ? `твоя — ${ROULETTE_COLOR_NAMES[mine.c]}, ${num(mine.stake)}` : '';
      const icon = `<span class="k-event-ic">${iconImg('roulette', '')}</span>`;
      if (spinning) {
        html = `${icon}<div class="k-event-title">Колесо крутится…</div><div class="k-event-sub">${escHtml(bet || (v.bets.length ? `ставок за столом: ${v.bets.length}` : 'ставки приняты'))}</div>`;
      } else if (v.phase === 'open') {
        const sec = this.left();
        html = `${icon}<div class="k-event-title">Приём ставок</div><div class="k-event-sub">${escHtml(bet ? `${bet} · ставок ${v.bets.length}` : `ставок: ${v.bets.length} · E — поставить`)}</div>`
          + `<div class="k-event-timer${sec <= 3 ? ' is-hurry' : ''}">0:${String(sec).padStart(2, '0')}</div>${meterHtml(this.leftMs() / ROULETTE_OPEN_MS, 'mode', 'k-meter--thin')}`;
      } else if (v.n !== undefined && v.phase !== 'spin') {
        const rk = `${v.round}:${v.n}`;
        if (rk !== this.resultKey) { this.resultKey = rk; this.resultAt = now; }
        if (now - this.resultAt < RESULT_MS) {
          const col = rouletteColor(v.n);
          const o = this.outcome;
          const mineOut = o && o.n === v.n && this.outcomeRound === v.round ? o : null;
          good = !!mineOut && mineOut.payout > 0;
          html = `<span class="k-event-ic">${ball(v.n, col)}</span><div class="k-event-title">Выпало ${v.n} — ${ROULETTE_COLOR_NAMES[col]}</div><div class="k-event-sub">Колесо остановилось</div>`;
          if (mineOut && this.heroKey !== rk) {
            this.heroKey = rk;
            hero = mineOut.payout > 0
              ? { tone: 'gold', title: 'Выигрыш!', sub: `+${num(mineOut.payout)} 🪙 за улов` }
              : { tone: 'lose', small: true, title: 'Улов ушёл в море…', sub: `${num(mineOut.stake)} 🪙 — в следующий раз повезёт` };
          }
        }
      }
    }
    // плашка раунда
    const rk = `${html}|${good}`;
    if (rk !== this.roundKey) {
      this.roundKey = rk;
      if (html) this.kit.top.event({ key: KEY, prio: ROUND_PRIO, html, tone: good ? 'good' : undefined, lamp: good });
      else this.kit.top.clear(KEY);
    }
    if (hero) this.kit.top.hero({ key: KEY, prio: PRIO.info + 5, tone: hero.tone, title: hero.title, sub: hero.sub, small: hero.small });
    // твоя ставка в ряду плиток: пока идёт раунд (приём ставок и колесо)
    const betOn = !!mine && !!v && (v.phase === 'open' || v.phase === 'spin' || spinning);
    const tk = `${betOn}|${mine?.c}|${mine?.stake}`;
    if (tk !== this.tileKey) {
      this.tileKey = tk;
      this.tile.hidden = !betOn;
      if (mine) {
        this.tileCap.textContent = ROULETTE_COLOR_NAMES[mine.c];
        this.tileSub.innerHTML = `улов ${coinHtml()}${num(mine.stake)}`;
      }
    }
    if (betOn) this.placeTile();
  }

  /** Плитка в общем ряду под бейджем (.fi-tiles) или в своём, если общего ещё нет */
  private placeTile(): void {
    const tr = this.kit.slots.tr;
    let row = tr.querySelector<HTMLElement>(':scope > .fi-tiles');
    if (row) {
      if (row.hidden) row.hidden = false;
    } else {
      if (!this.ownRow) {
        this.ownRow = document.createElement('div');
        this.ownRow.className = 'k-tiles rl-tiles';
        tr.append(this.ownRow);
      }
      row = this.ownRow;
    }
    if (this.tile.parentElement !== row) row.append(this.tile);
  }
}
