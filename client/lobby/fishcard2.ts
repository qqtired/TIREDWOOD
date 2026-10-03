// Карточка улова рыбалки 2.0 (выбирать нечего): картинка, категория цветом, имя, вес, цена — «+37 🪙 в рюкзак (7/10)»
// и из чего она (база · баркас · напиток), опыт («Идеально! ×2,4»), «Новый вид!» с бонусом или «Рекорд!», уникальный
// вид события ×1,5, сколько из всей коллекции в коллекции. Сорвалась крупная — «+N XP за борьбу». Сундук — своя карточка: трясётся,
// крышка отскакивает, сыплются монеты, сумма набегает; 200 — джекпот. Сама уходит через несколько секунд или
// при следующем забросе.
import { FISH, fmtWeight } from '../../shared/fishing.ts';
import { BARKAS_INCOME, COLLECTION_SIZE, RAIN_DEN, RAIN_NUM, RULE, T_CHEST, T_JUNK, TIER_CSS, TIER_NAMES, fmtCatch } from '../../shared/fishrules.ts';
import { BAG_ALE, BAG_BARKAS, BAG_BEER, BAG_RAIN } from '../../shared/fishprogress.ts';
import { ALE, BEER } from '../../shared/fishshop.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import type { Sound } from '../audio.ts';
import { COIN_HTML, setCoinText } from '../ui/coin.ts';
import { el, fishPic } from './fish2.ts';
import { mul, pct } from './fishfmt.ts';

type Land = Extract<ServerMsg, { t: 'fishLand' }>;

/** Сколько видна карточка, мс: рыба, сундук */
const SHOW_MS = 4800;
const CHEST_MS = 6500;
/** Сундук: трясётся, потом открывается; сумма набегает за */
const SHAKE_MS = 750;
const COUNT_MS = 1100;

/** Что пишут в бутылке (по весу) */
const NOTES = [
  'Кто нашёл — тому сегодня везёт!',
  'Привет с того берега! Вода тёплая',
  'Не забудь покормить чаек',
  'Если читаешь это — улыбнись 🙂',
  'Сапог не мой. Честно',
  'Клюёт лучше всего в дождь!',
];

export class CatchCard2 {
  private readonly card: HTMLElement;
  private readonly sound: Sound;
  private hideTimer = 0;
  private timers: number[] = [];

  constructor(parent: HTMLElement, sound: Sound) {
    this.sound = sound;
    this.card = el('div', 'fc2');
    parent.appendChild(this.card);
  }

  get shown(): boolean {
    return this.card.classList.contains('show');
  }

  show(m: Land): void {
    const r = RULE[m.sp];
    const f = FISH[m.sp];
    if (!r || !f) return;
    this.clear();
    const card = this.card;
    card.textContent = '';
    card.className = 'fc2';
    if (r.tier === T_CHEST) {
      this.chest(m);
      return;
    }
    const junk = r.tier === T_JUNK;
    card.style.setProperty('--tc', TIER_CSS[r.tier]);
    const head = card.appendChild(el('div', 'fc2-head'));
    head.appendChild(el('span', 'fc2-tier', junk ? 'находка' : TIER_NAMES[r.tier]));
    if (r.rain) head.appendChild(el('span', 'fc2-badge rain', '🎣 Уникальная · ×1,5'));
    if (m.fresh && !junk) setCoinText(head.appendChild(el('span', 'fc2-badge new')), `★ Новый вид! +${m.bonus} 🪙`);
    else if (m.fresh) head.appendChild(el('span', 'fc2-badge new', '★ Новая находка'));
    else if (m.record) head.appendChild(el('span', 'fc2-badge rec', '🏆 Рекорд!'));
    card.appendChild(fishPic(m.sp, 'fc2-pic'));
    const title = card.appendChild(el('div', 'fc2-title'));
    title.appendChild(el('b', '', f.name));
    title.appendChild(el('span', '', fmtCatch(m.g)));
    const sub = card.appendChild(el('div', 'fc2-sub'));
    if (f.id === 'bottle') sub.textContent = `В записке: «${NOTES[m.g % NOTES.length]}»`;
    else if (junk) sub.textContent = 'Хлам — в урну 🗑';
    else if (m.record) sub.textContent = `Прошлый рекорд — ${fmtWeight(m.best)}`;
    else if (!m.fresh) sub.textContent = `Рекорд — ${fmtWeight(m.best)} · ${r.note}`;
    else sub.textContent = r.note;
    if (m.bag !== undefined) {
      // fisheco: рыба — в рюкзак по цене поимки; ниже — из чего цена и сколько опыта
      if (m.bagFull) card.appendChild(el('div', 'fc2-price fe-bagfull', 'Рюкзак полон — рыбу пришлось отпустить'));
      else setCoinText(card.appendChild(el('div', 'fc2-price')), `+${m.price} 🪙 в рюкзак (${m.bag}/${m.cap})`);
      const why: string[] = [];
      const f = m.m ?? 0;
      if (f & BAG_BARKAS) why.push(`баркас ${mul(BARKAS_INCOME)}`);
      if (f & BAG_ALE) why.push(`эль ${pct(ALE.income)}`);
      else if (f & BAG_BEER) why.push(`пиво ${pct(BEER.income)}`);
      if (why.length && m.base !== undefined && !m.bagFull) card.appendChild(el('div', 'fe-why', `база ${m.base}${f & BAG_RAIN ? ` (дождь ${mul(RAIN_NUM / RAIN_DEN)} внутри)` : ''} · ${why.join(' · ')}`));
      if (m.xp) card.appendChild(el('div', 'fe-xp', m.perfect ? `+${m.xp} XP · Идеально! ×2,4` : `+${m.xp} XP`)).classList.toggle('perfect', !!m.perfect);
    } else if (m.price > 0) setCoinText(card.appendChild(el('div', 'fc2-price')), `+${m.price} 🪙`);
    if (!junk) {
      const col = card.appendChild(el('div', 'fc2-col'));
      col.appendChild(el('span', '', `Коллекция: ${m.got} из ${COLLECTION_SIZE}`));
      const bar = col.appendChild(el('i', ''));
      bar.appendChild(el('b', '')).style.width = `${Math.round((m.got / COLLECTION_SIZE) * 100)}%`;
      if (m.full) card.appendChild(el('div', 'fc2-full', '🎉 Коллекция собрана! Рыбацкий комплект — в гардеробе'));
    }
    this.open(m.full ? SHOW_MS + 2500 : SHOW_MS);
    if (m.price > 0 && !m.bagFull) this.later(250, () => this.sound.coins(null, Math.min(8, Math.max(2, Math.round(m.price / 4)))));
    if (m.fresh && !junk) this.later(450, () => this.sound.fishAlbum());
    if (m.full) this.later(900, () => this.sound.fanfare(null));
  }

  hide(): void {
    this.clear();
    this.card.classList.remove('show');
  }

  /** Сорвалась эпическая и выше после 3 с борьбы: утешительный опыт (вид — тайна, только категория). */
  lost(tier: number, xp: number): void {
    this.clear();
    const card = this.card;
    card.textContent = '';
    card.className = 'fc2 fe-lost';
    card.style.setProperty('--tc', TIER_CSS[tier] ?? TIER_CSS[0]);
    card.appendChild(el('div', 'fc2-head')).appendChild(el('span', 'fc2-tier', `${TIER_NAMES[tier] ?? ''} рыба`));
    card.appendChild(el('div', 'fc2-title')).appendChild(el('b', '', 'Сорвалась!'));
    card.appendChild(el('div', 'fe-xp', `+${xp} XP за борьбу`));
    card.appendChild(el('div', 'fc2-sub', 'За долгую схватку с крупной рыбой опыт остаётся'));
    this.open(3200);
  }

  /** Сундук: трясётся → крышка отскакивает, монеты, сумма набегает с нуля. */
  private chest(m: Land): void {
    const card = this.card;
    const jackpot = m.coins >= 200;
    card.classList.add('chest');
    if (jackpot) card.classList.add('jackpot');
    card.style.setProperty('--tc', TIER_CSS[T_CHEST]);
    card.appendChild(el('div', 'fc2-head')).appendChild(el('span', 'fc2-tier', jackpot ? 'сундук · джекпот!' : 'сундук'));
    const box = card.appendChild(el('div', 'fc2-box'));
    box.appendChild(fishPic(m.sp, 'fc2-chest'));
    box.appendChild(el('div', 'fc2-lid'));
    const coins = box.appendChild(el('div', 'fc2-coins'));
    for (let i = 0; i < (jackpot ? 22 : 12); i++) {
      const c = coins.appendChild(el('i', ''));
      c.innerHTML = COIN_HTML;
      c.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 220)}px`);
      c.style.setProperty('--dy', `${Math.round(-60 - Math.random() * 110)}px`);
      c.style.animationDelay = `${SHAKE_MS + Math.round(Math.random() * 260)}ms`;
    }
    card.appendChild(el('div', 'fc2-title')).appendChild(el('b', '', jackpot ? 'Сундук с сокровищем!' : 'Сундук со дна!'));
    const sum = card.appendChild(el('div', 'fc2-price big'));
    setCoinText(sum, '+0 🪙');
    card.appendChild(el('div', 'fc2-sub', jackpot ? 'Двести жетонов — такое бывает раз на тысячи поклёвок' : 'Сундук — сверх улова: 3 % поклёвок'));
    this.open(CHEST_MS);
    this.sound.fishNibble(null);
    this.later(SHAKE_MS, () => {
      card.classList.add('open');
      this.sound.coins(null, jackpot ? 8 : Math.min(8, 3 + Math.round(m.coins / 40)));
      if (jackpot) this.sound.slotWin(true);
      const t0 = performance.now();
      const step = (): void => {
        const k = Math.min(1, (performance.now() - t0) / COUNT_MS);
        setCoinText(sum, `+${Math.round(m.coins * (1 - (1 - k) * (1 - k)))} 🪙`);
        if (k < 1) this.timers.push(requestAnimationFrame(step) * -1);
      };
      step();
    });
  }

  private open(ms: number): void {
    const card = this.card;
    card.classList.remove('show');
    void card.offsetWidth;
    card.classList.add('show');
    this.hideTimer = window.setTimeout(() => card.classList.remove('show'), ms);
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
