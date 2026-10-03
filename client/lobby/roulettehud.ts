// Окно ставки рулетки рыбака (fisheco): сколько стоит весь улов, три цвета с шансом и выигрышем, подтверждение.
// Ставит сервер (server/lobby/roulette.ts); здесь — просьба, состояние стола для подсказки и свой итог тостом.
import { bagValue, emptyFishProgress, type FishProgress } from '../../shared/fishprogress.ts';
import type { ClientMsg, ServerMsg } from '../../shared/messages.ts';
import {
  ROULETTE_COLORS, ROULETTE_COLOR_NAMES, ROULETTE_MAX_PAYOUT, ROULETTE_PAYOUT, rouletteChance, rouletteWin, type RouletteColor, type RouletteView,
} from '../../shared/roulette.ts';
import { setCoinText } from '../ui/coin.ts';
import { el } from './fish2.ts';
import { num } from './fishfmt.ts';
import './fisheco.css';

const NAMES: Record<RouletteColor, string> = { red: 'Красное', black: 'Чёрное', green: 'Зеро' };

export class RouletteHud {
  onOpen: () => void = () => {};
  onClose: () => void = () => {};
  private readonly root: HTMLDialogElement;
  private readonly sum: HTMLElement;
  private readonly state: HTMLElement;
  private readonly picks = new Map<RouletteColor, HTMLButtonElement>();
  private readonly confirm: HTMLElement;
  private readonly confirmText: HTMLElement;
  private readonly yes: HTMLButtonElement;
  private readonly send: (msg: ClientMsg) => void;
  private progress: FishProgress = emptyFishProgress();
  private view: RouletteView | null = null;
  private viewAt = 0;
  private myPid = 0;
  private pick: RouletteColor | null = null;

  constructor(parent: HTMLElement, send: (msg: ClientMsg) => void) {
    this.send = send;
    this.root = el('dialog', 'fe-rl');
    this.root.setAttribute('aria-labelledby', 'fe-rl-title');
    const top = this.root.appendChild(el('div', 'fe-bag-top'));
    top.appendChild(el('h2', '', '🎡 Рулетка рыбака')).id = 'fe-rl-title';
    const x = top.appendChild(el('button', 'fn-close', '×'));
    x.type = 'button';
    x.setAttribute('aria-label', 'Закрыть рулетку');
    x.addEventListener('click', () => this.close());
    this.sum = this.root.appendChild(el('p', 'fe-rl-sum'));
    this.state = this.root.appendChild(el('p', 'fn-fine'));
    const row = this.root.appendChild(el('div', 'fe-rl-picks'));
    for (const c of ROULETTE_COLORS) {
      const b = row.appendChild(el('button', `fe-rl-pick ${c}`));
      b.type = 'button';
      b.addEventListener('click', () => { this.pick = c; this.render(); });
      this.picks.set(c, b);
    }
    this.confirm = this.root.appendChild(el('div', 'fe-rl-confirm'));
    this.confirmText = this.confirm.appendChild(el('p', ''));
    const btns = this.confirm.appendChild(el('div', 'fe-rl-btns'));
    this.yes = btns.appendChild(el('button', 'fn-action fe-warn', 'Поставить'));
    this.yes.type = 'button';
    this.yes.addEventListener('click', () => {
      if (!this.pick) return;
      this.send({ t: 'roulette', a: 'bet', c: this.pick });
      this.close();
    });
    const no = btns.appendChild(el('button', 'fn-action fn-dismiss', 'Отмена'));
    no.type = 'button';
    no.addEventListener('click', () => { this.pick = null; this.render(); });
    const cap = Number.isFinite(ROULETTE_MAX_PAYOUT) ? ` Выплата — не больше ${num(ROULETTE_MAX_PAYOUT)} 🪙.` : '';
    setCoinText(this.root.appendChild(el('p', 'fn-fine')), `Европейская рулетка: 37 лунок — 18 красных, 18 чёрных и зеро. Ставка — весь улов из рюкзака по его цене. Выиграл — жетоны сразу; проиграл — улов пропадает.${cap} Колесо крутится через 10 с после первой ставки или сразу, когда поставили все у стола.`);
    this.root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape') { e.preventDefault(); this.close(); }
    });
    this.root.addEventListener('keyup', (e) => e.stopPropagation());
    this.root.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.close(); });
    parent.appendChild(this.root);
    window.setInterval(() => { if (this.isOpen) this.render(); }, 500);
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

  /** Свой итог: строка и звук — снаружи (тостом) */
  static resultText(m: Extract<ServerMsg, { t: 'rouletteResult' }>): string {
    const what = `Выпало ${m.n} — ${ROULETTE_COLOR_NAMES[m.c]}`;
    return m.payout > 0 ? `🎡 ${what}. Ты выиграл ${num(m.payout)} 🪙!` : `🎡 ${what}. Улов (${num(m.stake)} 🪙) ушёл в море…`;
  }

  private left(): number {
    const v = this.view;
    return v ? Math.max(0, Math.ceil((v.left - (performance.now() - this.viewAt)) / 1000)) : 0;
  }

  private render(): void {
    const bag = this.progress.bag;
    const stake = bagValue(bag);
    const v = this.view;
    const mine = v?.bets.find((b) => b.pid === this.myPid);
    setCoinText(this.sum, bag.length ? `Ставка — весь улов: ${bag.length} рыб на ${num(stake)} 🪙` : 'Рюкзак пуст — ставить нечего. Поймай рыбу и возвращайся.');
    this.state.textContent = mine ? `Ты уже поставил на ${ROULETTE_COLOR_NAMES[mine.c]} (${num(mine.stake)} 🪙)` : v?.phase === 'spin' ? 'Колесо крутится — ставь в следующем раунде'
      : v?.phase === 'open' ? `Приём ставок: ${this.left()} с · ставок за столом: ${v.bets.length}` : 'Стол свободен — твоя ставка откроет раунд';
    const can = bag.length > 0 && !mine && v?.phase !== 'spin';
    for (const [c, b] of this.picks) {
      setCoinText(b, `${NAMES[c]} · ${(rouletteChance(c) * 100).toFixed(1).replace('.', ',')}% · выигрыш ${this.winText(stake, c)}`);
      b.disabled = !can;
      b.classList.toggle('on', this.pick === c);
    }
    this.confirm.hidden = !this.pick || !can;
    if (this.pick) setCoinText(this.confirmText, `Поставить весь улов (${num(stake)} 🪙) на ${ROULETTE_COLOR_NAMES[this.pick]}? Выигрыш — ${this.winText(stake, this.pick)}, проигрыш — улов пропадёт.`);
  }

  /** «1 200 🪙»; упёрлись в потолок — так и пишем, чтобы ставка на зеро не обещала лишнего */
  private winText(stake: number, c: RouletteColor): string {
    const win = rouletteWin(stake, c);
    return `${num(win)} 🪙${win < stake * ROULETTE_PAYOUT[c] ? ' (потолок)' : ''}`;
  }
}
