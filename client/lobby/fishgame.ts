// Шкала вываживания рыбалки 2.0 на экране (как в Stardew Valley): вертикальная шкала — рыба и зелёная зона, под ней —
// полоса прогресса. Играется у себя без задержки той же симуляцией, что у сервера (shared/fishreel.ts): держишь ЛКМ,
// пробел или палец — зона вверх. Переключения кнопки (номера тиков) уходят серверу сообщением reel — он повторяет
// вываживание своим сидом и решает, вытащил ли. Пока рыба в зоне — трещит катушка; рывок рыбы — шкала вздрагивает.
import { TICK_MS } from '../../shared/constants.ts';
import { REEL_P_MAX, reelRun, reelStart, reelView, type Reel } from '../../shared/fishreel.ts';
import { RULE, TIER_CSS, TIER_NAMES, T_JUNK, T_LEGEND, T_MYTH, reelStyleFor } from '../../shared/fishrules.ts';
import type { FishCastMods } from '../../shared/fishprogress.ts';
import type { ClientMsg } from '../../shared/messages.ts';
import type { Sound } from '../audio.ts';
import { TOUCH } from '../touch.ts';
import { el } from './fish2.ts';
import { dartParts } from './fishfmt.ts';
import { rodBonus } from '../../shared/fishprogress.ts';

/** Новые нажатия уходят серверу не чаще чем раз в столько тиков, без нажатий — раз в столько (сервер ждёт 4 с) */
const SEND_TOGGLES = 3;
const SEND_IDLE = 15;
/** Итог («Поймал!», «Сорвалась…») ещё виден, мс */
const END_SHOW_MS = 900;
/**
 * Часы шкалы — свои (performance.now), без потолка кадра: отставать от настоящего времени нельзя — сервер ждёт
 * отставших 4 с. Вкладка спала дольше — не догоняем (сервер уже решил, что сорвалась).
 */
const MAX_STEP_MS = 3000;
/** Режим рыбы на шкале: рывок (shared/fishreel.ts M_DART) */
const M_DART = 2;

const FISH_SVG =
  '<svg viewBox="0 0 40 24" width="40" height="24"><path d="M3 12c5-7 14-9 22-6l7-5-1 8 1 7-7-5c-8 3-17 1-22-6z" fill="currentColor"'
  + ' stroke="rgba(20,12,16,.75)" stroke-width="1.6" stroke-linejoin="round"/><circle cx="9" cy="10.5" r="1.7" fill="#1b1216"/></svg>';

type ReelMsg = Extract<ClientMsg, { t: 'reel' }>;

export class ReelGame {
  onSend: (msg: ReelMsg) => void = () => {};
  /** Кончилось у себя: true — вытащил (карточку пришлёт сервер), false — сорвалась */
  onEnd: (caught: boolean) => void = () => {};
  private readonly sound: Sound;
  private readonly root: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly zone: HTMLElement;
  private readonly fish: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly label: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly rainEl: HTMLElement;
  /** fisheco: откуда зона и рывки («Зона 30% → 36% (ур. 4 +10%, удочка +10%)», «рывки −5% блесна») и «Последний рывок!» */
  private readonly bonus: HTMLElement;
  private readonly standEl: HTMLElement;
  private wasStand = 0;
  private readonly result: HTMLElement;
  private readonly hold: HTMLElement | null = null;
  private readonly fingers = new Set<number>();
  private r: Reel | null = null;
  private toggles: number[] = [];
  private k = 0;
  private sent = 0;
  private sentTick = 0;
  private acc = 0;
  private lastNow = 0;
  /** Когда кончилось у себя (performance.now), 0 — идёт */
  private endAt = 0;
  private wasIn = false;
  private wasDart = false;
  private clickT = 0;

  constructor(parent: HTMLElement, sound: Sound) {
    this.sound = sound;
    this.root = el('div', 'fr');
    this.label = this.root.appendChild(el('div', 'fr-label'));
    this.bar = this.root.appendChild(el('div', 'fr-bar'));
    this.bar.appendChild(el('div', 'fr-water'));
    this.zone = this.bar.appendChild(el('div', 'fr-zone'));
    this.fish = this.bar.appendChild(el('div', 'fr-fish'));
    this.fish.innerHTML = FISH_SVG;
    const prog = this.root.appendChild(el('div', 'fr-prog'));
    this.fill = prog.appendChild(el('i', ''));
    this.hint = this.root.appendChild(el('div', 'fr-hint', TOUCH ? 'Держи ↑ · отпусти ↓' : 'Держи ЛКМ или Пробел — зона вверх'));
    this.rainEl = this.root.appendChild(el('div', 'fr-rain', TOUCH ? '🎣 Виды события ×1,5' : '🎣 Событие · уникальные рыбы ×1,5'));
    this.bonus = this.root.appendChild(el('div', 'fe-reelbonus'));
    this.standEl = this.root.appendChild(el('div', 'fe-stand', 'Последний рывок!'));
    this.result = this.root.appendChild(el('div', 'fr-res'));
    if (TOUCH) {
      // телефон: держать можно где угодно на экране (кроме верхних кнопок) — и кнопкой 🎣
      const h = (this.hold = el('div', 'fr-hold'));
      h.addEventListener('pointerdown', (e) => {
        this.fingers.add(e.pointerId);
        e.preventDefault();
      });
      const up = (e: PointerEvent): void => {
        this.fingers.delete(e.pointerId);
      };
      h.addEventListener('pointerup', up);
      h.addEventListener('pointercancel', up);
      h.addEventListener('lostpointercapture', up);
      h.addEventListener('contextmenu', (e) => e.preventDefault());
      parent.appendChild(h);
    }
    parent.appendChild(this.root);
  }

  /** Шкала на экране (идёт или показывает итог) */
  get active(): boolean {
    return this.r !== null;
  }

  /** Идёт (итога ещё нет) */
  get running(): boolean {
    return this.r !== null && this.r.done === 0;
  }

  /** Прогресс 0…1 (для рыбы у поверхности в 3D) */
  get progress(): number {
    return this.r ? this.r.p / REEL_P_MAX : 0;
  }

  /** Подсёк: вид и сид от сервера; rain — идёт ли дождь (значок у шкалы). */
  start(sp: number, seed: number, rain: boolean, mods: Readonly<FishCastMods>): void {
    const rule = RULE[sp];
    if (!rule) return;
    const style = reelStyleFor(sp, mods);
    this.r = reelStart(style, seed);
    this.wasStand = 0;
    this.standEl.classList.remove('show');
    const base = rule.style.zone;
    // откуда зона шире: только то, что есть (у новичка без удочки строки нет)
    const why: string[] = [];
    if (mods.level) why.push(`ур. ${mods.level} +${(mods.level * 2.5).toLocaleString('ru-RU')}%`);
    if (mods.rod) why.push(`удочка +${Math.round(rodBonus(mods.rod) * 100)}%`);
    const zoneLine = why.length ? [`Зона ${Math.round(base)}% → ${Math.round(style.zone)}% (${why.join(', ')})`] : [];
    const lines = rule.tier < T_JUNK ? [...zoneLine, ...dartParts(mods)] : [];
    this.bonus.replaceChildren(...lines.map((s) => el('span', '', s)));
    this.toggles = [];
    this.k = 0;
    this.sent = 0;
    this.sentTick = 0;
    this.acc = 0;
    this.lastNow = performance.now();
    this.endAt = 0;
    this.wasIn = true;
    this.wasDart = false;
    this.fingers.clear();
    // вид — тайна до улова: на шкале только категория; хлам и сундук — «что-то тяжёлое»
    const odd = rule.tier >= T_JUNK;
    const css = odd ? TIER_CSS[T_JUNK] : TIER_CSS[rule.tier];
    this.root.style.setProperty('--tc', css);
    this.label.textContent = odd ? 'Что-то тяжёлое…' : `${cap(TIER_NAMES[rule.tier])} рыба${rule.tier >= T_LEGEND ? '!!' : rule.tier > 0 ? '!' : ''}`;
    this.root.classList.toggle('myth', rule.tier === T_MYTH);
    this.root.classList.toggle('legend', rule.tier === T_LEGEND);
    this.root.classList.remove('won', 'lost', 'dart', 'in');
    this.hint.classList.remove('gone');
    this.result.textContent = '';
    this.setRain(rain);
    this.root.classList.add('show');
    this.hold?.classList.add('show');
    this.render();
  }

  /** Окно вываживания — награда коллекции рыб (темы в client/ui/fishstyle.css); «wood» — обычное деревянное */
  theme(key: string): void {
    if (key === 'wood') delete this.root.dataset.frTheme;
    else this.root.dataset.frTheme = key;
  }

  setRain(rain: boolean): void {
    this.rainEl.classList.toggle('show', rain);
  }

  /** Кадр: held — держит ли игрок кнопку (мышь, пробел, кнопка 🎣); палец на экране — сам. */
  update(held: boolean): void {
    const r = this.r;
    if (!r) return;
    const now = performance.now();
    const dtMs = now - this.lastNow;
    this.lastNow = now;
    if (r.done !== 0) {
      if (now - this.endAt > END_SHOW_MS) this.hide();
      return;
    }
    const want = held || this.fingers.size > 0;
    if (want !== ((this.toggles.length & 1) === 1)) this.toggle(r.t);
    this.acc += Math.min(dtMs, MAX_STEP_MS);
    while (this.acc >= TICK_MS && r.done === 0) {
      this.acc -= TICK_MS;
      this.k = reelRun(r, this.toggles, r.t + 1, this.k);
      this.feel(r);
    }
    if (r.done !== 0 || (this.toggles.length > this.sent && r.t - this.sentTick >= SEND_TOGGLES) || r.t - this.sentTick >= SEND_IDLE) this.send(r);
    if (r.done !== 0) this.finish(r.done === 1);
    if (!this.hint.classList.contains('gone') && r.t > 150 && this.toggles.length > 0) this.hint.classList.add('gone');
    this.render();
  }

  /** Сервер сказал «сорвалась» (или ушёл с места) — показать и убрать. */
  stop(text = 'Сорвалась…'): void {
    if (!this.r) return;
    if (this.r.done === 0) {
      this.r.done = -1;
      this.endAt = performance.now();
      this.root.classList.add('lost');
      this.result.textContent = text;
    }
  }

  /** Убрать сразу (вышли с набережной) */
  reset(): void {
    this.r = null;
    this.root.classList.remove('show');
    this.hold?.classList.remove('show');
    this.fingers.clear();
  }

  /** Переключение кнопки с тика t; в тот же тик второй раз — отмена (если ещё не ушло) или со следующего. */
  private toggle(t: number): void {
    const n = this.toggles.length;
    if (n > 0 && this.toggles[n - 1] >= t) {
      if (n > this.sent) this.toggles.pop();
      else this.toggles.push(this.toggles[n - 1] + 1);
      return;
    }
    this.toggles.push(t);
  }

  private send(r: Reel): void {
    let j = this.sent;
    while (j < this.toggles.length && this.toggles[j] <= r.t) j++;
    const msg: ReelMsg = { t: 'reel', i: this.sent, k: this.toggles.slice(this.sent, j), u: r.t };
    if (r.done !== 0) msg.d = 1;
    this.sent = j;
    this.sentTick = r.t;
    this.onSend(msg);
  }

  private finish(caught: boolean): void {
    this.endAt = performance.now();
    this.root.classList.add(caught ? 'won' : 'lost');
    this.result.textContent = caught ? 'Поймал! 🎣' : 'Сорвалась…';
    this.onEnd(caught);
  }

  private hide(): void {
    this.r = null;
    this.root.classList.remove('show');
    this.hold?.classList.remove('show');
    this.fingers.clear();
  }

  /** Звук и дрожь: рыба в зоне — трещит катушка; рывок — «тук» и шкала вздрагивает. */
  private feel(r: Reel): void {
    if (r.inZone && ++this.clickT >= 5) {
      this.clickT = 0;
      this.sound.reelTick();
    }
    const dart = r.mode === M_DART;
    if (dart && !this.wasDart) this.sound.fishNibble(null);
    this.wasDart = dart;
    this.wasIn = r.inZone;
    if (r.stand === 1 && this.wasStand !== 1) {
      // легенды и мифик на 70 %: один цикл самого злого паттерна, рывки ×1,3
      this.standEl.classList.remove('show');
      void this.standEl.offsetWidth;
      this.standEl.classList.add('show');
      this.sound.fishNibble(null);
    } else if (r.stand !== 1 && this.wasStand === 1) this.standEl.classList.remove('show');
    this.wasStand = r.stand;
  }

  private render(): void {
    const r = this.r;
    if (!r) return;
    const v = reelView(r);
    this.zone.style.bottom = `${(v.z0 * 100).toFixed(2)}%`;
    this.zone.style.height = `${((v.z1 - v.z0) * 100).toFixed(2)}%`;
    this.fish.style.bottom = `${(v.fish * 100).toFixed(2)}%`;
    const tilt = Math.max(-28, Math.min(28, -r.fv / 25));
    this.fish.style.transform = `translate(-50%, 50%) rotate(${tilt.toFixed(1)}deg)`;
    this.fill.style.width = `${(v.p * 100).toFixed(1)}%`;
    this.fill.style.background = `hsl(${Math.round(v.p * 120)} 72% 48%)`;
    this.root.classList.toggle('in', this.wasIn);
    this.root.classList.toggle('dart', this.wasDart);
    this.root.classList.toggle('low', v.p < 0.15);
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
