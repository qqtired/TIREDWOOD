// Шкала вываживания рыбалки 2.0 на экране (как в Stardew Valley): вертикальная шкала — рыба и зелёная зона, под ней —
// полоса прогресса. Играется у себя без задержки той же симуляцией, что у сервера (shared/fishreel.ts): держишь ЛКМ,
// пробел или палец — зона вверх. Переключения кнопки (номера тиков) уходят серверу сообщением reel — он повторяет
// вываживание своим сидом и решает, вытащил ли. Пока рыба в зоне — трещит катушка; рывок рыбы — шкала вздрагивает.
// Зона — плотный поплавок: ударилась о край шкалы — сплющилась у этого края (сила — по скорости удара, Reel.hit),
// в быстром полёте чуть вытянулась; фактура зоны — в fish2.css.
// 04.10 (вечер): под полосой улова — живой счёт ошибок и оценка («2 ошибки · Сойдёт ×1,25»), в итоге — оценка крупно;
// «натяжение лески» (зона прижата к верху дольше 0,7 с) — надпись у шкалы и строка в чат. Водка — рыбак пьян: шкала
// покачивается, рыба двоится, шкала моргает (пропадает на 0,2–0,3 с), «ик!» — это только на экране; задержка зоны
// и икота — в общей модели (shared/fishreel.ts), их считает и сервер. Стили нового — fishreel.css.
import { TICK_MS } from '../../shared/constants.ts';
import {
  BOUNCE_FULL, REEL_BAR, REEL_P_MAX, reelGrade, reelPulling, reelRun, reelSlack, reelStart, reelTaut, reelView, type Reel,
} from '../../shared/fishreel.ts';
import { RULE, TIER_CSS, TIER_NAMES, T_DIVINE, T_JUNK, T_LEGEND, T_MYTH, isFishTier, reelStyleFor } from '../../shared/fishrules.ts';
import type { FishCastMods } from '../../shared/fishprogress.ts';
import type { ClientMsg } from '../../shared/messages.ts';
import type { Sound } from '../audio.ts';
import { TOUCH } from '../touch.ts';
import { el } from './fish2.ts';
import { dartParts } from './fishfmt.ts';
import { rodBonus } from '../../shared/fishprogress.ts';
import { VODKA } from '../../shared/fishshop.ts';
import { errorsText, gradeClass, gradeMul, gradeName } from './fishgrade.ts';

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
/** Сжатие и растяжение зоны (squash & stretch): s — сила удара, 0…1 (скорость удара / BOUNCE_FULL) */
const SQUASH_Y = 0.22; // по высоте: scaleY = 1 − SQUASH_Y·s
const SQUASH_X = 0.08; // по ширине: scaleX = 1 + SQUASH_X·s
const STRETCH_Y = 0.06; // в быстром полёте (|zv| ≥ BOUNCE_FULL) зона вытянута по высоте на столько
/** Сплющенность гаснет по времени кадра, e^(−dt/τ): за 170 мс остаётся ≈ 5 % (не CSS-transition — при частых ударах он дёргается) */
const SQUASH_TAU_MS = 55;
/** Удар о дно сильнее этой доли «полной скорости» — на зоне вспыхивает блик (класс hit, fish2.css), столько мс */
const FLASH_MIN = 0.15;
const FLASH_MS = 120;
/** Слабее этой силы (≈ 60 ед./тик) — не удар, а зона прилипла к верху или легла: не деформируем */
const HIT_MIN = 0.03;
/** Натяжение лески: строка в чат — не чаще раза в столько мс */
const TAUT_TEXT = 'Леска слишком натянута, возможен обрыв!';
const TAUT_CHAT_MS = 4000;
/** Водка: моргание — раз в 3…6,5 с; шкала пропадает на 0,2…0,3 с (только на экране, модель не меняет) */
const BLINK_GAP_MS = [3000, 6500] as const;
const BLINK_MS = [200, 300] as const;
/** «ик!» видно столько мс */
const HIC_SHOW_MS = 650;
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const FISH_SVG =
  '<svg viewBox="0 0 40 24" width="40" height="24"><path d="M3 12c5-7 14-9 22-6l7-5-1 8 1 7-7-5c-8 3-17 1-22-6z" fill="currentColor"'
  + ' stroke="rgba(20,12,16,.75)" stroke-width="1.6" stroke-linejoin="round"/><circle cx="9" cy="10.5" r="1.7" fill="#1b1216"/></svg>';

type ReelMsg = Extract<ClientMsg, { t: 'reel' }>;

export class ReelGame {
  onSend: (msg: ReelMsg) => void = () => {};
  /** Кончилось у себя: true — вытащил (карточку пришлёт сервер), false — сорвалась */
  onEnd: (caught: boolean) => void = () => {};
  /** Строка в чат только себе («Леска слишком натянута, возможен обрыв!») */
  onWarn: (text: string) => void = () => {};
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
  /** Удар зоны о край на тиках этого кадра (их бывает несколько): сила самого сильного 0…1 и край — 1 дно, −1 верх */
  private hitPower = 0;
  private hitEdge = 1;
  /** Сплющенность зоны сейчас (0…1): от удара взлетает до его силы, дальше гаснет по времени кадра; край — у которого */
  private squash = 0;
  private squashEdge = 1;
  /** Сколько ещё мс горит блик удара о дно */
  private flashMs = 0;
  /** Живой счёт ошибок и оценка под полосой улова; сколько ошибок уже показано (−1 — ещё ничего) */
  private readonly gradeEl: HTMLElement;
  private shownErr = -1;
  /** Улов — рыба (у хлама и сундука опыта нет — и оценки нет) */
  private fishTier = false;
  private wasTaut = false;
  private tautChatAt = Number.NEGATIVE_INFINITY;
  /** Водка: двойник рыбы, «ик!», часы покачивания (мс), моргание — когда следующее и когда кончится (0 — глаза открыты) */
  private readonly ghost: HTMLElement;
  private readonly hicEl: HTMLElement;
  private lastHic = 0;
  private hicMs = 0;
  private drunkMs = 0;
  private blinkAt = 0;
  private blinkEnd = 0;

  constructor(parent: HTMLElement, sound: Sound) {
    this.sound = sound;
    this.root = el('div', 'fr');
    this.label = this.root.appendChild(el('div', 'fr-label'));
    this.bar = this.root.appendChild(el('div', 'fr-bar'));
    this.bar.appendChild(el('div', 'fr-water'));
    this.zone = this.bar.appendChild(el('div', 'fr-zone'));
    // водка: двойник рыбы — под настоящей
    this.ghost = this.bar.appendChild(el('div', 'fr-fish fr-ghost'));
    this.ghost.innerHTML = FISH_SVG;
    this.fish = this.bar.appendChild(el('div', 'fr-fish'));
    this.fish.innerHTML = FISH_SVG;
    const prog = this.root.appendChild(el('div', 'fr-prog'));
    this.fill = prog.appendChild(el('i', ''));
    this.gradeEl = this.root.appendChild(el('div', 'fr-grade'));
    this.hicEl = this.root.appendChild(el('div', 'fr-hic', 'ик!'));
    // место под шкалой: подсказка, а поверх неё — срочное «Последний рывок!» и «Леска провисла — приподними зону!»
    // (видна, пока у шкалы класс slack: зона пролежала на дне дольше 0,7 с; подмотать — приподнять зону над дном,
    // короткое касание вслепую не считается). Срочные надписи не раздвигают колонку (fish2.css, .fr-slot): шкала не
    // прыгает, и низ колонки не наезжает на подсказку внизу экрана.
    const slot = this.root.appendChild(el('div', 'fr-slot'));
    this.standEl = slot.appendChild(el('div', 'fe-stand', 'Последний рывок!'));
    slot.appendChild(el('div', 'fe-slack', 'Леска провисла — приподними зону!'));
    slot.appendChild(el('div', 'fe-taut', 'Леска натянута — отпусти!'));
    this.hint = slot.appendChild(el('div', 'fr-hint', TOUCH ? 'Держи ↑ · отпусти ↓' : 'Держи ЛКМ или Пробел — зона вверх'));
    this.rainEl = this.root.appendChild(el('div', 'fr-rain', TOUCH ? '🎣 Виды события ×1,5' : '🎣 Событие · уникальные рыбы ×1,5'));
    this.bonus = this.root.appendChild(el('div', 'fe-reelbonus'));
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
    // водка — рыбак пьян на любой поклёвке (задержка зоны и икота — в модели, как у сервера)
    const drunk = mods.drink === 4;
    this.r = reelStart(style, seed, drunk);
    this.calm();
    this.wasStand = 0;
    this.standEl.classList.remove('show');
    const base = rule.style.zone;
    // откуда зона шире или уже: только то, что есть (у новичка без удочки строки нет)
    const why: string[] = [];
    if (mods.level) why.push(`ур. ${mods.level} +${(mods.level * 2.5).toLocaleString('ru-RU')}%`);
    if (mods.rod) why.push(`удочка +${Math.round(rodBonus(mods.rod) * 100)}%`);
    if (drunk && isFishTier(rule.tier)) why.push(`водка −${Math.round((1 - (VODKA.zone ?? 1)) * 100)}%`);
    const zoneLine = why.length ? [`Зона ${Math.round(base)}% → ${Math.round(style.zone)}% (${why.join(', ')})`] : [];
    const lines = isFishTier(rule.tier) ? [...zoneLine, ...dartParts(mods)] : [];
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
    const odd = !isFishTier(rule.tier);
    const css = odd ? TIER_CSS[T_JUNK] : TIER_CSS[rule.tier];
    this.root.style.setProperty('--tc', css);
    // божественная (кальмар) — не «рыба»: царь морей
    this.label.textContent = odd ? 'Что-то тяжёлое…' : rule.tier === T_DIVINE ? 'Божественный улов!!!'
      : `${cap(TIER_NAMES[rule.tier])} рыба${rule.tier >= T_LEGEND ? '!!' : rule.tier > 0 ? '!' : ''}`;
    this.root.classList.toggle('myth', rule.tier === T_MYTH || rule.tier === T_DIVINE);
    this.root.classList.toggle('divine', rule.tier === T_DIVINE);
    this.root.classList.toggle('legend', rule.tier === T_LEGEND);
    this.root.classList.remove('won', 'lost', 'dart', 'in', 'slack', 'taut', 'blink');
    this.root.classList.toggle('drunk', drunk);
    this.hint.classList.remove('gone');
    this.result.textContent = '';
    this.fishTier = !odd;
    this.gradeEl.hidden = odd;
    this.shownErr = -1;
    this.wasTaut = false;
    this.lastHic = this.r.hic;
    this.hicMs = 0;
    this.hicEl.classList.remove('show');
    this.drunkMs = 0;
    this.blinkAt = this.lastNow + between(BLINK_GAP_MS);
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
      this.knock(r);
    }
    if (r.done !== 0 || (this.toggles.length > this.sent && r.t - this.sentTick >= SEND_TOGGLES) || r.t - this.sentTick >= SEND_IDLE) this.send(r);
    if (r.done !== 0) this.finish(r.done === 1);
    if (!this.hint.classList.contains('gone') && r.t > 150 && this.toggles.length > 0) this.hint.classList.add('gone');
    this.render(dtMs);
  }

  /** Сервер сказал «сорвалась» (или ушёл с места) — показать и убрать. */
  stop(text = 'Сорвалась…'): void {
    if (!this.r) return;
    if (this.r.done === 0) {
      this.r.done = -1;
      this.endAt = performance.now();
      this.calm();
      this.root.classList.add('lost');
      this.result.textContent = text;
    }
  }

  /** Убрать сразу (вышли с набережной) */
  reset(): void {
    this.hide();
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
    const r = this.r;
    this.endAt = performance.now();
    this.calm();
    this.root.classList.add(caught ? 'won' : 'lost');
    // вытащил рыбу — ниже оценка крупно её цветом («Идеально · ×2,5 опыта»; сервер считает так же — она же в карточке);
    // сорвалась, пока леска была натянута, — оборвалась
    this.result.textContent = caught ? 'Поймал! 🎣' : r && reelTaut(r) ? 'Леска оборвалась!' : 'Сорвалась…';
    if (caught && r && this.fishTier) {
      const g = reelGrade(r.err);
      this.result.appendChild(el('small', gradeClass(g), `${gradeName(g)} · ${gradeMul(g)} опыта`));
    }
    this.onEnd(caught);
  }

  private hide(): void {
    this.r = null;
    this.calm();
    this.root.classList.remove('show');
    this.hold?.classList.remove('show');
    this.fingers.clear();
  }

  /** Звук и дрожь: рыба в зоне — трещит катушка; рывок — «тук» и шкала вздрагивает. */
  private feel(r: Reel): void {
    // катушка трещит и зона светится, только пока тянет: в провисшей леске рыба в зоне не идёт
    const pulling = reelPulling(r);
    if (pulling && ++this.clickT >= 5) {
      this.clickT = 0;
      this.sound.reelTick();
    }
    const dart = r.mode === M_DART;
    if (dart && !this.wasDart) this.sound.fishNibble(null);
    this.wasDart = dart;
    this.wasIn = pulling;
    if (r.stand === 1 && this.wasStand !== 1) {
      // легенды и мифик на 70 %: один цикл самого злого паттерна, рывки ×1,3
      this.standEl.classList.remove('show');
      void this.standEl.offsetWidth;
      this.standEl.classList.add('show');
      this.sound.fishNibble(null);
    } else if (r.stand !== 1 && this.wasStand === 1) this.standEl.classList.remove('show');
    this.wasStand = r.stand;
    // натяжение лески: надпись у шкалы (класс taut) и — раз за натяжение, не чаще раза в 4 с — строка в чат
    const taut = reelTaut(r);
    if (taut && !this.wasTaut && performance.now() - this.tautChatAt > TAUT_CHAT_MS) {
      this.tautChatAt = performance.now();
      this.onWarn(TAUT_TEXT);
    }
    this.wasTaut = taut;
    // водка: икнул — зону подбросило (модель), на экране «ик!» и «чпок»
    if (r.hic !== this.lastHic) {
      this.lastHic = r.hic;
      this.hicMs = HIC_SHOW_MS;
      this.hicEl.classList.remove('show');
      void this.hicEl.offsetWidth;
      this.hicEl.classList.add('show');
      this.sound.pop(null);
    }
  }

  /** Удар зоны о край на этом тике (Reel.hit): запоминаем самый сильный за кадр — рисует render(). */
  private knock(r: Reel): void {
    if (r.hit === 0) return;
    const s = Math.min(1, Math.abs(r.hit) / BOUNCE_FULL);
    if (s < HIT_MIN || s < this.hitPower) return;
    this.hitPower = s;
    this.hitEdge = r.hit > 0 ? 1 : -1;
  }

  private render(dtMs = 0): void {
    const r = this.r;
    if (!r) return;
    const v = reelView(r);
    // с 04.10 зона под шкалу не уходит (отскакивает от дна и ложится на него); видимую часть рисуем на всякий случай
    const z0 = Math.max(0, v.z0), z1 = Math.max(0, v.z1);
    this.zone.style.bottom = `${(z0 * 100).toFixed(2)}%`;
    this.zone.style.height = `${((z1 - z0) * 100).toFixed(2)}%`;
    this.zone.style.visibility = z1 > 0.004 ? '' : 'hidden';
    this.deform(r, dtMs);
    this.fish.style.bottom = `${(v.fish * 100).toFixed(2)}%`;
    const tilt = Math.max(-28, Math.min(28, -r.fv / 25));
    this.fish.style.transform = `translate(-50%, 50%) rotate(${tilt.toFixed(1)}deg)`;
    this.fill.style.width = `${(v.p * 100).toFixed(1)}%`;
    this.fill.style.background = `hsl(${Math.round(v.p * 120)} 72% 48%)`;
    this.root.classList.toggle('in', this.wasIn);
    this.root.classList.toggle('dart', this.wasDart);
    this.root.classList.toggle('low', v.p < 0.15);
    this.root.classList.toggle('slack', r.done === 0 && reelSlack(r));
    this.root.classList.toggle('taut', r.done === 0 && reelTaut(r));
    if (r.err !== this.shownErr) this.showErrors(r.err);
    if (r.drunk) this.drunkFx(r, dtMs);
  }

  /** Живой счёт: «2 ошибки · Сойдёт ×1,25»; новая ошибка — плашка вздрагивает красным */
  private showErrors(err: number): void {
    const g = reelGrade(err);
    const e = this.gradeEl;
    e.className = `fr-grade ${gradeClass(g)}`;
    e.replaceChildren(el('span', '', errorsText(err)), el('b', '', `${gradeName(g)} ${gradeMul(g)}`));
    if (this.shownErr >= 0 && err > this.shownErr) {
      void e.offsetWidth;
      e.classList.add('bump');
    }
    this.shownErr = err;
  }

  /**
   * Водка — только на экране (модель не трогает): колонка шкалы покачивается, рядом с рыбой — бледный двойник, шкала
   * моргает — на 0,2–0,3 с пропадает раз в 3–6,5 с, «ик!» гаснет.
   */
  private drunkFx(r: Reel, dtMs: number): void {
    const run = r.done === 0;
    this.drunkMs += dtMs;
    const s = this.drunkMs / 1000;
    const sway = run && !REDUCED;
    this.root.style.rotate = sway ? `${(2.4 * Math.sin(s * 2.1) + 0.9 * Math.sin(s * 3.7 + 1)).toFixed(2)}deg` : '';
    this.root.style.translate = sway ? `${(7 * Math.sin(s * 1.3 + 0.5)).toFixed(1)}px 0` : '';
    const dy = 4.5 * Math.sin(s * 1.7) + 1.5 * Math.sin(s * 4.3);
    const dx = 9 * Math.sin(s * 1.1 + 2);
    this.ghost.style.bottom = `${Math.min(100, Math.max(0, (r.f / REEL_BAR) * 100 + dy)).toFixed(2)}%`;
    this.ghost.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), 50%) rotate(${(-r.fv / 25 + 8 * Math.sin(s * 2.6)).toFixed(1)}deg)`;
    const now = this.lastNow;
    if (!run) this.blinkEnd = 0;
    else if (this.blinkEnd > 0 && now >= this.blinkEnd) {
      this.blinkEnd = 0;
      this.blinkAt = now + between(BLINK_GAP_MS);
    } else if (this.blinkEnd === 0 && now >= this.blinkAt) this.blinkEnd = now + between(BLINK_MS);
    this.root.classList.toggle('blink', this.blinkEnd > 0);
    this.hicMs = Math.max(0, this.hicMs - dtMs);
    if (this.hicMs === 0) this.hicEl.classList.remove('show');
  }

  /**
   * Зона — плотный поплавок (squash & stretch): удар о край сплющивает её у этого края и за ~170 мс отпускает, быстрый
   * полёт чуть вытягивает по высоте. Удар о дно посильнее — ещё и блик (класс hit на 120 мс). Звука нет.
   */
  private deform(r: Reel, dtMs: number): void {
    // сначала гасим прежнее за время кадра, потом применяем удар этого кадра — он виден в полную силу
    this.squash *= Math.exp(-Math.max(0, dtMs) / SQUASH_TAU_MS);
    this.flashMs = Math.max(0, this.flashMs - dtMs);
    if (this.hitPower > 0) {
      // новый удар не слабее остатка прежнего — край и сила переходят к нему
      if (this.hitPower >= this.squash) {
        this.squash = this.hitPower;
        this.squashEdge = this.hitEdge;
      }
      if (this.hitEdge === 1 && this.hitPower > FLASH_MIN) this.flashMs = FLASH_MS;
      this.hitPower = 0;
    }
    if (this.squash < 0.01) this.squash = 0;
    const fly = r.done === 0 ? Math.min(1, Math.abs(r.zv) / BOUNCE_FULL) : 0;
    const sy = (1 - SQUASH_Y * this.squash) * (1 + STRETCH_Y * fly);
    const sx = 1 + SQUASH_X * this.squash;
    // опора — у края удара, пока зона сплющена (дно — снизу, верх — сверху); одно вытягивание — от центра
    this.zone.style.transformOrigin = this.squash > 0.03 ? (this.squashEdge === 1 ? '50% 100%' : '50% 0%') : '50% 50%';
    this.zone.style.transform = Math.abs(sy - 1) < 0.001 && Math.abs(sx - 1) < 0.001 ? '' : `scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
    this.zone.classList.toggle('hit', this.flashMs > 0);
  }

  /** Зона ровная и без блика: шкала началась заново или бой кончился (в итоге зона не стоит сплющенной, шкала — ровно и не моргает) */
  private calm(): void {
    this.hitPower = 0;
    this.squash = 0;
    this.flashMs = 0;
    this.zone.style.transform = '';
    this.zone.classList.remove('hit');
    this.blinkEnd = 0;
    this.root.classList.remove('blink');
    this.root.style.rotate = '';
    this.root.style.translate = '';
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Случайное число в [lo, hi] */
function between([lo, hi]: readonly [number, number]): number {
  return lo + Math.random() * (hi - lo);
}
