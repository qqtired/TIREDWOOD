// Карточка улова рыбалки 2.0 — кит UI 2.0 (lab/ui «Рыбалка» → «Улов»), в низ-право (слот br): категория и одна пилюля
// («Новый вид!», «Рекорд!», «Уникальная ×1,5»), крупная картинка, имя и вес, две кнопки выбора с клавишами 1 и F, полоска
// времени на выбор и одна строка внизу (журнал «N из 52 · до награды ещё K», прошлый рекорд, награда, остров). Жетоны
// (бонус за новый вид) всплывают у бейджа сами, опыт — у кольца уровня рыбалки (onXp). Сорвалась крупная — «+N опыта за
// борьбу». Сундук — своя карточка: трясётся, крышка отскакивает, сыплются монеты, сумма набегает; клад Посейдона —
// своя картинка, лучи и крупный баннер по центру. Сама уходит через несколько секунд или при следующем забросе. Рыба —
// выбор (shared/fishrelease.ts): «В рюкзак» (1) или «Отпустить» (F, +50 % опыта, без жетонов); не выбрал — осталась в
// рюкзаке. Первые 0,75 с после вываживания кнопки притушены и не нажимаются (lockFor).
import { FISH, fmtWeight } from '../../shared/fishing.ts';
import { ISLE_LADDER, LADDER, GEAR_SLOTS, isleNextStep, nextStep, rewardLabel, stepLabel, stepNeed } from '../../shared/fishstyle.ts';
import { CHEST_ANNOUNCE, COLLECTION_SIZE, ISLE_SIZE, RULE, T_CHEST, T_JUNK, TIER_CSS, TIER_NAMES, fmtCatch, isPoseidon } from '../../shared/fishrules.ts';
import { LORD } from '../../shared/fishshop.ts';
import { CHOICE_TICKS, releaseXp } from '../../shared/fishrelease.ts';
import { TICK_RATE } from '../../shared/constants.ts';
import type { Slot } from '../../shared/outfit.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import type { Sound } from '../audio.ts';
import { TOUCH } from '../touch.ts';
import { COIN_HTML } from '../ui/coin.ts';
import { coinHtml, iconImg, keyHtml, meterHtml } from '../ui/kit/dom.ts';
import { species } from '../ui/fishrewards.ts';
import { el, fishPic } from './fish2.ts';
import { isleStepText, num, pct } from './fishfmt.ts';
import { poseidonPic } from './fishtreasure.ts';
import './fishkit.css';
import './fishrelease.css';

type Land = Extract<ServerMsg, { t: 'fishLand' }>;

/** Сколько видна карточка, мс: рыба, сундук */
const SHOW_MS = 4800;
const CHEST_MS = 6500;
/** Сундук: трясётся, потом открывается; сумма набегает за */
const SHAKE_MS = 750;
const COUNT_MS = 1100;
/** Рыба в руках ждёт выбора, мс (как сервер); после выбора карточка ещё видна */
const CHOICE_MS = (CHOICE_TICKS / TICK_RATE) * 1000;
const KEPT_MS = 900;
const FREED_MS = 2600;
/** Баннер «Сокровища Посейдона!» по центру, мс */
const HERO_MS = 3300;

/** Что пишут в бутылке (по весу) */
const NOTES = [
  'Кто нашёл — тому сегодня везёт!',
  'Привет с того берега! Вода тёплая',
  'Не забудь покормить чаек',
  'Если читаешь это — улыбнись',
  'Сапог не мой. Честно',
  'Клюёт лучше всего в дождь!',
];

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class CatchCard2 {
  /** Кнопки выбора мышью (пока мышь свободна) или пальцем: в рюкзак, отпустить */
  onKeep: () => void = () => {};
  onRelease: () => void = () => {};
  /** Опыт за улов — всплывает у кольца уровня рыбалки (карточка его не пишет) */
  onXp: (xp: number) => void = () => {};
  private readonly card: HTMLElement;
  /** Слот --c: баннер клада Посейдона */
  private readonly centre: HTMLElement | null;
  private readonly sound: Sound;
  private hideTimer = 0;
  private timers: number[] = [];
  /** Улов, который ждёт выбора (null — выбирать нечего) */
  private choosing: Land | null = null;
  private hero: HTMLElement | null = null;

  constructor(slot: HTMLElement, sound: Sound, centre: HTMLElement | null = null) {
    this.sound = sound;
    this.centre = centre;
    this.card = el('article', 'k-panel fi-catch');
    this.card.dataset.mode = 'fishing';
    this.card.hidden = true;
    // карточка — над кнопками лодки в том же слоте
    slot.prepend(this.card);
  }

  get shown(): boolean {
    return !this.card.hidden;
  }

  /** Рыба в руках ждёт выбора: F — отпустить */
  get canRelease(): boolean {
    return this.choosing !== null && this.shown;
  }

  /** Рыба в руках легла в лайвел своей лодки (рюкзак был полон) */
  get inWell(): boolean {
    return this.choosing?.well !== undefined;
  }

  show(m: Land): void {
    const r = RULE[m.sp];
    const f = FISH[m.sp];
    if (!r || !f) return;
    this.clear();
    this.choosing = null;
    const card = this.card;
    card.className = 'k-panel fi-catch';
    card.textContent = '';
    if (r.tier === T_CHEST) {
      this.chest(m);
      return;
    }
    const junk = r.tier === T_JUNK;
    const isle = r.zone === 'isle';
    card.style.setProperty('--tc', TIER_CSS[r.tier]);
    card.classList.toggle('k-lamp', !!m.record && !m.fresh && !junk);
    // шапка: категория и одна пилюля — новый вид важнее рекорда, рекорд — уникальной (цена ×1,5)
    const badge = m.fresh && !junk ? '<span class="k-pill k-pill--gold k-pill--sm">Новый вид!</span>'
      : m.fresh ? '<span class="k-pill k-pill--gold k-pill--sm">Новая находка</span>'
        : m.record && !junk ? '<span class="k-pill k-pill--good k-pill--sm">Рекорд!</span>'
          : r.rain ? `<span class="k-pill k-pill--${isle ? 'special' : 'info'} k-pill--sm">${isle ? 'Туманная' : 'Уникальная'} ×1,5</span>` : '';
    card.insertAdjacentHTML('beforeend', `<header class="fi-catch-head"><span class="fi-tier">${junk ? 'находка' : TIER_NAMES[r.tier]}</span><span>${badge}</span></header>`);
    card.appendChild(el('div', 'fi-catch-art')).appendChild(fishPic(m.sp, ''));
    const name = card.appendChild(el('div', 'fi-catch-name'));
    name.appendChild(el('b', 'k-display', f.name));
    name.appendChild(el('span', '', fmtCatch(m.g)));
    if (m.bag !== undefined && !m.bagFull) this.choice(m, isle);
    card.appendChild(this.foot(m, f.id, junk));
    if (m.xp) this.onXp(m.xp);
    this.open(this.choosing ? CHOICE_MS + 1500 : m.full || m.rw ? SHOW_MS + 2500 : SHOW_MS);
    if (m.price > 0 && !m.bagFull) this.later(250, () => this.sound.coins(null, Math.min(8, Math.max(2, Math.round(m.price / 4)))));
    if (m.fresh && !junk) this.later(450, () => this.sound.fishAlbum());
    if (m.full) this.later(900, () => this.sound.fanfare(null));
  }

  /** Одна строка внизу: что важнее всего сейчас (рюкзак полон, находка, награда, рекорд, путь к следующей награде) */
  private foot(m: Land, id: string, junk: boolean): HTMLElement {
    const p = el('p', 'fi-catch-foot');
    const line = (icon: string, html: string): void => { p.innerHTML = `${icon}<span>${html}</span>`; };
    if (m.bagFull) {
      p.classList.add('is-bad');
      line(iconImg('warn', ''), 'Рюкзак полон — рыбу пришлось отпустить');
    } else if (id === 'bottle') line(iconImg('scroll', ''), `В записке: «${esc(NOTES[m.g % NOTES.length])}»`);
    else if (junk) line(iconImg('release', ''), m.price > 0 ? `Находка — в рюкзак: <b>+${m.price}</b> ${coinHtml()}` : 'Хлам — в урну');
    else if (m.rw?.length) line(iconImg('gift', ''), rewardHtml(m.rw, m.full));
    else if (m.record && !m.fresh) line(iconImg('records', ''), `Прошлый рекорд — <b>${esc(fmtWeight(m.best))}</b>`);
    else if (m.isle !== undefined) {
      const next = isleNextStep(m.isle);
      line(iconImg('lighthouse', ''), `Остров <b>${m.isle} из ${ISLE_SIZE}</b>${next ? ` · до ${esc(isleStepText(next))} ещё ${species(Math.min(next.need, ISLE_SIZE) - m.isle)}` : ''}`);
    } else {
      const next = nextStep(m.got);
      line(iconImg('journal', ''), `Журнал <b>${m.got} из ${COLLECTION_SIZE}</b>${next ? ` · до ${esc(stepLabel(next))} ещё ${species(stepNeed(next) - m.got)}` : ''}`);
    }
    return p;
  }

  hide(): void {
    this.clear();
    this.choosing = null;
    this.card.hidden = true;
    this.card.classList.remove('is-locked');
  }

  /** Кнопки выбора притушены и не нажимаются ещё ms (пауза после вываживания, CHOICE_LOCK_MS); потом оживают сами */
  lockFor(ms: number): void {
    if (ms <= 0) return;
    this.card.classList.add('is-locked');
    this.later(ms, () => this.card.classList.remove('is-locked'));
  }

  /**
   * Сервер убрал рыбу из рук (FE_DONE): отпущена — «Отпустил · опыт ×1,5», карточка ещё немного видна; в рюкзаке —
   * карточка уходит (плитка рюкзака покажет «+1»). Выбирать больше нечего.
   */
  done(freed: boolean): void {
    const m = this.choosing;
    if (!m) return;
    this.choosing = null;
    this.card.querySelector('.fi-catch-btns')?.remove();
    if (!freed) {
      this.hideIn(KEPT_MS);
      return;
    }
    const foot = this.card.querySelector<HTMLElement>('.fi-catch-foot');
    if (foot) foot.innerHTML = `${iconImg('release', '')}<span>Отпустил — опыт ×1,5, жетонов за неё нет</span>`;
    if (m.xp) this.onXp(releaseXp(m.xp) - m.xp);
    this.hideIn(FREED_MS);
  }

  /** Две кнопки выбора и полоска — сколько осталось (потом рыба остаётся в рюкзаке). */
  private choice(m: Land, isle: boolean): void {
    this.choosing = m;
    const well = m.well !== undefined;
    const row = this.card.appendChild(el('div', 'fi-catch-btns'));
    row.innerHTML = `<button type="button" class="k-btn k-btn--go k-btn--sm" data-keep>${well ? 'В лайвел' : 'В рюкзак'}<small>+${num(m.price)} ${coinHtml()} ${isle ? 'у Игната' : 'у Семёна'}</small>${TOUCH ? '' : keyHtml('1', 'tr')}</button>`
      + `<button type="button" class="k-btn k-btn--info k-btn--sm" data-release>Отпустить<small>опыт ×1,5</small>${TOUCH ? '' : keyHtml('F', 'tr')}</button>`
      + meterHtml(1, 'good', 'k-meter--thin fi-catch-timer');
    row.querySelector('[data-keep]')!.addEventListener('click', () => this.onKeep());
    row.querySelector('[data-release]')!.addEventListener('click', () => this.onRelease());
    // полоска тает за время выбора: сначала полная, со следующего кадра — к нулю
    const bar = row.querySelector<HTMLElement>('.fi-catch-timer')!;
    const fill = bar.querySelector<HTMLElement>('.k-meter-fill')!;
    fill.style.transition = `width ${CHOICE_MS}ms linear`;
    bar.querySelector<HTMLElement>('.k-meter-ghost')!.style.display = 'none';
    void bar.offsetWidth;
    bar.style.setProperty('--v', '0');
  }

  private hideIn(ms: number): void {
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => { this.card.hidden = true; }, ms);
  }

  /** Сорвалась эпическая и выше после 3 с борьбы: утешительный опыт (вид — тайна, только категория). */
  lost(tier: number, xp: number): void {
    this.clear();
    this.choosing = null;
    const card = this.card;
    card.className = 'k-panel fi-catch';
    card.style.setProperty('--tc', TIER_CSS[tier] ?? TIER_CSS[0]);
    card.innerHTML = `<header class="fi-catch-head"><span class="fi-tier">${esc(TIER_NAMES[tier] ?? '')} рыба</span></header>`
      + '<div class="fi-catch-lost">Сорвалась!</div>'
      + `<p class="fi-catch-sub">+${num(xp)} опыта за борьбу</p>`
      + '<p class="fi-catch-foot">За долгую схватку с крупной рыбой опыт остаётся</p>';
    this.onXp(xp);
    this.open(3200);
  }

  /** Сундук: трясётся → крышка отскакивает, монеты, сумма набегает с нуля. */
  private chest(m: Land): void {
    const card = this.card;
    // «Сокровища Посейдона» (fishtreasure.ts) — тот же сундук, но своя картинка, лучи, баннер по центру и дольше висит
    const poseidon = isPoseidon(m.coins);
    const big = !poseidon && m.coins >= CHEST_ANNOUNCE;
    card.classList.add('is-chest');
    card.classList.toggle('is-poseidon', poseidon);
    card.classList.toggle('k-lamp', poseidon);
    card.style.setProperty('--tc', TIER_CSS[T_CHEST]);
    card.insertAdjacentHTML('beforeend', `<header class="fi-catch-head"><span class="fi-tier">${big ? 'крупный сундук' : 'сундук'}</span><span>${poseidon ? '<span class="k-pill k-pill--gold k-pill--sm">Клад!</span>' : ''}</span></header>`);
    const art = card.appendChild(el('div', 'fi-catch-art is-chest'));
    const box = art.appendChild(el('div', 'fc2-box'));
    box.appendChild(poseidon ? poseidonPic('fc2-chest') : fishPic(m.sp, 'fc2-chest'));
    box.appendChild(el('div', 'fc2-lid'));
    const coins = box.appendChild(el('div', 'fc2-coins'));
    for (let i = 0; i < (poseidon ? 40 : big ? 16 : 12); i++) {
      const c = coins.appendChild(el('i', ''));
      c.innerHTML = COIN_HTML;
      c.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 220)}px`);
      c.style.setProperty('--dy', `${Math.round(-60 - Math.random() * 110)}px`);
      c.style.animationDelay = `${SHAKE_MS + Math.round(Math.random() * 260)}ms`;
    }
    const sum = card.appendChild(el('div', 'fi-catch-coins'));
    sum.innerHTML = `${coinHtml()}<span>+0</span>`;
    const sumN = sum.lastElementChild as HTMLElement;
    card.appendChild(el('p', 'fi-catch-sub', poseidon ? 'Весь сервер уже знает!' : 'Жетоны уже у тебя'));
    // в каждом пятом сундуке — пиво подводного владыки, уже выпито (сервер включил его сразу)
    const foot = card.appendChild(el('p', 'fi-catch-foot'));
    if (m.lord) foot.innerHTML = `${iconImg('gift', '')}<span><b>${esc(LORD.name)}</b> — выпито: цена ${pct(LORD.income).replace('%', ' %')} · ${Math.round(LORD.ms / 60_000)} мин</span>`;
    else if (!poseidon) foot.innerHTML = `<img src="${poseidonPic('').src}" alt=""><span>В редком сундуке — клад Посейдона: <b>1 500</b></span>`;
    if (poseidon) this.poseidonHero();
    this.open((poseidon ? CHEST_MS + 3500 : CHEST_MS) + (m.lord ? 2500 : 0));
    this.sound.fishNibble(null);
    this.later(SHAKE_MS, () => {
      card.classList.add('is-open');
      this.sound.coins(null, Math.min(8, 3 + Math.round(m.coins / 40)));
      if (poseidon) this.sound.slotWin(true);
      if (poseidon) this.later(700, () => this.sound.fanfare(null));
      const t0 = performance.now();
      const countMs = poseidon ? 2000 : COUNT_MS;
      const step = (): void => {
        const k = Math.min(1, (performance.now() - t0) / countMs);
        sumN.textContent = `+${num(Math.round(m.coins * (1 - (1 - k) * (1 - k))))}`;
        if (k < 1) this.timers.push(requestAnimationFrame(step) * -1);
      };
      step();
    });
  }

  /** «Сокровища Посейдона!» — крупный золотой баннер по центру (как на странице lab/ui), сам тает */
  private poseidonHero(): void {
    if (!this.centre) return;
    this.hero?.remove();
    const h = this.centre.appendChild(el('div', 'k-hero k-hero--gold is-play'));
    h.appendChild(el('p', 'k-hero-title is-sm', 'Сокровища Посейдона!'));
    this.hero = h;
    setTimeout(() => { if (this.hero === h) this.hero = null; h.remove(); }, HERO_MS);
  }

  private open(ms: number): void {
    const card = this.card;
    card.hidden = false;
    card.classList.remove('is-in');
    void card.offsetWidth;
    card.classList.add('is-in');
    this.hideTimer = window.setTimeout(() => { card.hidden = true; }, ms);
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clear(): void {
    clearTimeout(this.hideTimer);
    for (const t of this.timers) {
      if (t < 0) cancelAnimationFrame(-t);
      else clearTimeout(t);
    }
    this.timers = [];
  }
}

/** Что выдали за этот улов (rw): снасти уже в руках, одежда — в примерочной; вся коллекция — особо */
function rewardHtml(rw: readonly string[], full: boolean): string {
  const gear = rw.filter((id) => GEAR_SLOTS.includes(id[0] as Slot));
  const wear = rw.filter((id) => !GEAR_SLOTS.includes(id[0] as Slot));
  const set = [...LADDER, ...ISLE_LADDER].find((s) => s.set && s.items.every((id) => rw.includes(id)))?.set;
  const parts = [
    set ? `сет «${set}» — в примерочной` : wear.length ? `${wear.map(rewardLabel).join(', ')} — в примерочной` : '',
    gear.map(rewardLabel).join(', '),
  ].filter(Boolean);
  return `${full ? '<b>Вся коллекция!</b> ' : '<b>Награда:</b> '}${esc(parts.join('; '))}`;
}
