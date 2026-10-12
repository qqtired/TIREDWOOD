// «Однорукий бандит» перед раундом: дёрни рычаг (ЛКМ или E) — барабаны крутятся,
// выпавшие символы дают бонус на весь раунд. Результат решает сервер.
import { SLOT_SYMBOLS, type SlotBonus } from '../../shared/messages.ts';
import type { Sound } from '../audio.ts';
import { TOUCH } from '../touch.ts';

/** Как дёрнуть рычаг: мышью или клавишей, на телефоне — пальцем (или кнопкой «огонь») */
const PULL_HINT = TOUCH ? 'Дёрни рычаг — нажми на него или <b>💥</b>' : 'Дёрни рычаг — <b>ЛКМ</b> или <b>E</b>';

const CELL = 88;
const SPIN_CELLS = 26;

function describe(b: SlotBonus): string {
  const parts: string[] = [];
  if (b.hp) parts.push(`+${b.hp} HP`);
  if (b.armor) parts.push(`+${b.armor} брони`);
  if (b.dmg) parts.push(`+${Math.round(b.dmg * 100)}% урона`);
  return parts.join(' · ') || 'пусто';
}

export class SlotMachine {
  readonly root: HTMLElement;
  private readonly strips: HTMLElement[] = [];
  private readonly result: HTMLElement;
  private readonly lever: HTMLElement;
  private readonly bulbs: HTMLElement;
  private readonly sound: Sound;
  private state: 'hidden' | 'idle' | 'waiting' | 'spinning' | 'done' = 'hidden';
  private tickTimer = 0;
  private hideTimer = 0;
  private doneTimer = 0;
  private stopTimers: number[] = [];
  /** Автомат попросили убрать посреди прокрутки — уберём, когда покажем результат. */
  private hideAfterSpin = false;
  onPull: () => void = () => {};
  /** Барабаны остановились — теперь бонус можно показывать в интерфейсе. */
  onReveal: (reels: number[], bonus: SlotBonus) => void = () => {};

  constructor(parent: HTMLElement, sound: Sound) {
    this.sound = sound;
    this.root = document.createElement('div');
    this.root.className = 'slot';
    this.root.innerHTML = `
      <div class="slot-cabinet">
        <div class="slot-crown">
          <div class="slot-bulbs"></div>
          <div class="slot-title">Портовый<br><b>автомат</b></div>
        </div>
        <div class="slot-face">
          <div class="slot-window">
            <div class="reel"><div class="strip"></div></div>
            <div class="reel"><div class="strip"></div></div>
            <div class="reel"><div class="strip"></div></div>
            <div class="payline"></div>
          </div>
          <div class="slot-result">${PULL_HINT}</div>
          <div class="slot-legend">
            <span>❤️ +15 HP</span><span>🛡️ +20 брони</span><span>💥 +7% урона</span><span>🍒 всего понемногу</span>
            <em>Три одинаковых — джекпот!</em>
          </div>
        </div>
        <div class="slot-tray"></div>
      </div>
      <div class="lever" title="Дёрнуть">
        <div class="lever-slot"></div>
        <div class="lever-arm"><div class="lever-knob"></div></div>
        <div class="lever-hub"></div>
      </div>`;
    parent.appendChild(this.root);
    this.root.querySelectorAll<HTMLElement>('.strip').forEach((s) => this.strips.push(s));
    this.result = this.root.querySelector('.slot-result')!;
    this.lever = this.root.querySelector('.lever')!;
    this.bulbs = this.root.querySelector('.slot-bulbs')!;
    for (let i = 0; i < 14; i++) {
      const b = document.createElement('i');
      b.style.setProperty('--i', String(i));
      this.bulbs.appendChild(b);
    }
    this.lever.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.tryPull();
    });
    for (const s of this.strips) this.fillStrip(s, [Math.floor(Math.random() * 4)], false);
  }

  get visible(): boolean {
    return this.state !== 'hidden';
  }

  /** Разминка началась: показать автомат (reels — если уже крутили). */
  show(reels: number[]): void {
    clearTimeout(this.hideTimer);
    this.cancelSpin();
    this.hideAfterSpin = false;
    this.root.classList.add('show');
    this.root.classList.remove('jackpot', 'win', 'pulled');
    if (reels.length === 3) {
      this.state = 'done';
      this.strips.forEach((s, i) => this.fillStrip(s, [reels[i]], false));
      this.result.textContent = 'Бонус уже получен';
    } else {
      this.state = 'idle';
      this.result.innerHTML = PULL_HINT;
    }
  }

  /** Спрятать автомат. Если барабаны ещё крутятся — сначала дать им докрутиться. */
  hide(delay = 0): void {
    clearTimeout(this.hideTimer);
    const run = () => {
      if (this.state === 'spinning') {
        this.hideAfterSpin = true;
        return;
      }
      this.root.classList.remove('show');
      this.state = 'hidden';
      clearInterval(this.tickTimer);
    };
    if (delay > 0) this.hideTimer = window.setTimeout(run, delay);
    else run();
  }

  /** Выход из игры: убрать автомат сразу и забыть незаконченную прокрутку. */
  reset(): void {
    this.cancelSpin();
    this.hide();
  }

  private cancelSpin(): void {
    clearTimeout(this.doneTimer);
    for (const t of this.stopTimers) clearTimeout(t);
    this.stopTimers.length = 0;
    clearInterval(this.tickTimer);
    if (this.state === 'spinning') this.state = 'idle';
  }

  /** ЛКМ/E во время разминки. */
  tryPull(): boolean {
    if (this.state !== 'idle') return false;
    this.state = 'waiting';
    this.root.classList.add('pulled');
    this.sound.lever();
    this.result.textContent = 'Крутим…';
    this.onPull();
    return true;
  }

  /** Сервер прислал результат. auto — автомат дёрнули за игрока (опоздал или не успел). */
  spin(reels: number[], bonus: SlotBonus, auto: boolean): void {
    clearTimeout(this.hideTimer);
    this.cancelSpin();
    this.root.classList.add('show');
    this.root.classList.remove('jackpot', 'win');
    if (auto) this.root.classList.add('pulled');
    this.state = 'spinning';
    this.result.textContent = auto ? 'Автомат крутится сам…' : 'Крутим…';
    const base = auto ? 0.55 : 1.05;
    const step = auto ? 0.18 : 0.38;
    this.strips.forEach((s, i) => {
      this.fillStrip(s, [reels[i]], true);
      const dur = base + i * step;
      s.style.transition = 'none';
      s.style.transform = 'translateY(0)';
      void s.offsetWidth;
      s.style.transition = `transform ${dur}s cubic-bezier(0.12, 0.6, 0.18, 1.02)`;
      s.style.transform = `translateY(${-(SPIN_CELLS) * CELL}px)`;
      this.stopTimers.push(window.setTimeout(() => this.sound.reelStop(i), dur * 1000 - 40));
    });
    this.tickTimer = window.setInterval(() => this.sound.reelTick(), 55);
    const total = (base + 2 * step) * 1000;
    this.doneTimer = window.setTimeout(() => {
      clearInterval(this.tickTimer);
      this.stopTimers.length = 0;
      this.state = 'done';
      this.result.innerHTML = `${bonus.jackpot ? '<b class="jp">ДЖЕКПОТ!</b> ' : ''}${describe(bonus)}`;
      this.root.classList.add(bonus.jackpot ? 'jackpot' : 'win');
      this.sound.slotWin(bonus.jackpot);
      this.onReveal(reels, bonus);
      if (auto || this.hideAfterSpin) this.hide(auto ? 2600 : 1600);
      this.hideAfterSpin = false;
    }, total);
  }

  /** Лента символов: случайные, а последний — выпавший. */
  private fillStrip(s: HTMLElement, final: number[], spin: boolean): void {
    const cells: string[] = [];
    if (spin) {
      // первым идёт то, что было видно, — без «скачка» в начале
      const current = s.lastElementChild?.textContent ?? SLOT_SYMBOLS[0];
      cells.push(current);
      for (let i = 1; i < SPIN_CELLS; i++) cells.push(SLOT_SYMBOLS[Math.floor(Math.random() * 4)]);
    }
    cells.push(SLOT_SYMBOLS[final[0]]);
    s.innerHTML = cells.map((c) => `<div class="cell">${c}</div>`).join('');
    if (!spin) {
      s.style.transition = 'none';
      s.style.transform = 'translateY(0)';
    }
  }
}
