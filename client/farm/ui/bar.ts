// HUD фермы: крупные карточки со значком, подписью словами и полоской заполнения (по просьбе владельца: «понятно, что это
// лейка и сколько в ней воды»). Слева — карточка уровня и мелкие чипы (помощь, Фургон, «Хозяйство», созрело, баффы) и шаг
// обучения; справа — «Лейка», «Сумка», «Колодец» (жетоны рисует общий HUD игры, в комнате фермы он выровнен под них стилем).
// У каждой карточки при наведении — подсказка, что это и как пополнить (data-tip). Время — от серверных часов.
import { bagCap, bagUsed, canMax, farmLevel, farmLevelInfo, type FarmProgress } from '../../../shared/farm.ts';
import { helpView } from '../../../shared/farmhelp.ts';
import { BUFFS, FARM_LEVEL_NAMES, FARM_MAX_LEVEL, HELP_MIN_LEVEL, TUTORIAL_STEPS, VAN_SLOTS_BY_LEVEL, WELL_SETS } from '../../../shared/farmdata.ts';
import { TUTORIAL_TEXT, btn, big, clockHour, el, fmtLeft, icon, mskHour, msToNextHour, wellView } from './common.ts';

/** Не лезем в DOM, если текст тот же */
function put(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

interface HudCard {
  root: HTMLElement;
  value: HTMLElement;
  sub: HTMLElement;
  bar: HTMLElement;
  fill: HTMLElement;
}

/** Большая карточка: значок слева, подпись, «4 из 10», полоска, пояснение */
function card(cls: string, iconName: string, fallback: string, label: string, tip: string): HudCard {
  const root = el('div', `fm-hc ${cls}`);
  root.dataset.tip = tip;
  root.append(icon(iconName, fallback, 'fm-hc-ico'));
  const main = root.appendChild(el('div', 'fm-hc-main'));
  main.append(el('small', 'fm-hc-label', label));
  const value = main.appendChild(el('b', 'fm-hc-value'));
  const bar = main.appendChild(el('div', 'fm-hc-bar'));
  const fill = bar.appendChild(el('i'));
  const sub = main.appendChild(el('small', 'fm-hc-sub'));
  return { root, value, sub, bar, fill };
}

export interface BarActions {
  openEstate(): void;
  closeTutorial(): void;
}

export class FarmBar {
  /** Слева сверху: уровень, чипы, шаг обучения */
  readonly left = el('div', 'fm-left');
  /** Справа сверху: лейка, сумка, колодец */
  readonly right = el('div', 'fm-right');
  private readonly lvNum = el('b', 'fm-lv-num');
  private readonly lvName = el('b', 'fm-lv-name');
  private readonly lvEyebrow = el('small', 'fm-lv-eyebrow');
  private readonly lvFill = el('i');
  private readonly lvXp = el('span');
  private readonly can = card('can', 'watering-can', '💧', 'Лейка', 'Лейка: заряды воды для полива, один заряд на грядку. Полив ускоряет рост на 20 %. Кончилась — встань у корыта колодца и нажми E.');
  private readonly bag = card('bag', 'bag', '🎒', 'Сумка', 'Сумка: сюда падает урожай и трюфели. Полная? Продай Дядюшке Грибу или сдай ящик в Фургон. Побольше сумку — в «Хозяйстве».');
  private readonly well = card('well', 'well', '⛲', 'Колодец', 'Колодец: наборы воды для лейки. Одна попытка у корыта тратит один набор, новый набор появляется раз в 15 минут (копится и пока тебя нет).');
  private readonly pips = el('div', 'fm-pips');
  private readonly help = el('div', 'fm-chip-hud help');
  private readonly helpText = el('span');
  private readonly van = el('div', 'fm-chip-hud van');
  private readonly vanText = el('span');
  private readonly ripe = el('div', 'fm-chip-hud ripe');
  private readonly buffs = el('div', 'fm-buffs');
  private readonly tut = el('div', 'fm-tut');
  private readonly tutHead = el('small');
  private readonly tutText = el('p');
  private readonly tutDots = el('div', 'fm-dots');
  private lastKey = '';

  constructor(act: BarActions) {
    // карточка уровня: значок-венок с номером, название, полоска опыта со звёздочкой
    const lv = el('div', 'fm-lv');
    lv.dataset.tip = 'Уровень фермы растёт от опыта: собирай урожай, выполняй заказы, сдавай ящики Фургону. Новый уровень открывает культуры и улучшения.';
    const badge = lv.appendChild(el('div', 'fm-lv-badge'));
    badge.append(icon('level-badge', '🏅', 'fm-lv-img'), this.lvNum);
    const main = lv.appendChild(el('div', 'fm-lv-main'));
    const bar = el('div', 'fm-hc-bar big');
    bar.append(this.lvFill);
    const xp = el('div', 'fm-lv-xp');
    xp.append(icon('xp-star', '⭐', 'fm-xp-ico'), this.lvXp);
    main.append(this.lvEyebrow, this.lvName, bar, xp);
    // чипы: помощь, Фургон, Хозяйство
    this.help.dataset.tip = 'Очки помощи соседям: полив чужой грядки стоит заряд лейки и одно очко. Очки восстанавливаются раз в 10 минут.';
    this.help.append(icon('help-hands', '🤝', 'fm-chip-ico'), this.helpText);
    this.van.dataset.tip = 'Фургон открыт в чётные часы по Москве, один час. Сдавай ему ящик урожая целиком — платит в полтора раза больше Гриба.';
    this.van.append(icon('van', '🚚', 'fm-chip-ico'), this.vanText);
    this.ripe.dataset.tip = 'На твоих грядках созрел урожай — подойди и нажми E.';
    const estate = btn('fm-chip-hud estate', '');
    estate.dataset.tip = 'Хозяйство: улучшения грядок, инструментов и построек, кладовая, убранство, достижения.';
    estate.append(icon('basket', '🧺', 'fm-chip-ico'), el('span', '', 'Хозяйство'), el('kbd', '', 'H'));
    estate.addEventListener('click', () => act.openEstate());
    const chips = el('div', 'fm-chiprow');
    chips.append(this.help, this.van, estate, this.ripe);
    // шаг обучения
    const x = btn('fm-tut-x', '×', () => act.closeTutorial());
    x.title = 'Убрать подсказки (вернуть можно у Семечкина)';
    this.tut.append(x, this.tutHead, this.tutText, this.tutDots);
    this.left.append(lv, chips, this.buffs, this.tut);
    // правая сторона
    this.well.root.querySelector('.fm-hc-bar')?.replaceWith(this.pips);
    for (let i = 0; i < WELL_SETS; i++) this.pips.append(icon('bucket', '🪣', 'fm-pip'));
    this.right.append(this.can.root, this.bag.root, this.well.root);
  }

  /** Перерисовать числа и подписи: свой прогресс, участок, серверное время */
  update(f: FarmProgress, plot: number, now: number): void {
    const info = farmLevelInfo(f.xp);
    put(this.lvNum, String(info.level));
    put(this.lvName, FARM_LEVEL_NAMES[info.level - 1]);
    put(this.lvEyebrow, `ФЕРМА · УЧАСТОК ${plot + 1}`);
    this.lvFill.style.width = `${Math.round((info.into / info.need) * 100)}%`;
    put(this.lvXp, info.level >= FARM_MAX_LEVEL
      ? `${big(info.into)} / ${big(info.need)} опыта · ⭐ ${info.stars}`
      : `${big(info.into)} / ${big(info.need)} опыта`);

    const max = canMax(f) / 100;
    const w = Math.floor(f.water / 100);
    put(this.can.value, `${w} из ${max}`);
    put(this.can.sub, w <= 0 ? 'пусто — к колодцу' : w >= max ? 'полная лейка' : 'зарядов воды');
    this.can.fill.style.width = `${Math.min(100, (f.water / canMax(f)) * 100)}%`;
    this.can.root.classList.toggle('low', w <= 0);

    const used = bagUsed(f);
    const cap = bagCap(f);
    put(this.bag.value, `${used} из ${cap}`);
    put(this.bag.sub, used >= cap ? 'полна — продай' : 'мест занято');
    this.bag.fill.style.width = `${Math.min(100, (used / cap) * 100)}%`;
    this.bag.root.classList.toggle('low', used >= cap * 0.9);

    const wv = wellView(f, now);
    put(this.well.value, `${wv.sets} из ${WELL_SETS}`);
    put(this.well.sub, wv.nextAt ? `набор через ${fmtLeft(wv.nextAt - now)}` : 'полный колодец');
    [...this.pips.children].forEach((p, i) => p.classList.toggle('off', i >= wv.sets));
    this.well.root.classList.toggle('low', wv.sets <= 0);

    const level = farmLevel(f.xp);
    const hv = helpView(f, now);
    this.help.hidden = level < HELP_MIN_LEVEL;
    put(this.helpText, `Помощь ${hv.points} из ${hv.max}${hv.resetAt ? ` · ${fmtLeft(hv.resetAt - now)}` : ''}`);
    this.van.hidden = level < VAN_SLOTS_BY_LEVEL[0].level;
    const open = mskHour(now) % 2 === 0;
    put(this.vanText, open ? `Фургон до ${clockHour(mskHour(now) + 1)}` : `Фургон в ${clockHour(mskHour(now) + 1)} · ${fmtLeft(msToNextHour(now))}`);
    this.van.classList.toggle('open', open);

    const n = f.beds.filter((b) => b.crop && now >= b.ripeAt).length;
    this.ripe.hidden = n === 0;
    put(this.ripe, `🌱 Созрело: ${n}`);

    // баффы Древа: значок с таймером
    const bf = f.buffs.filter((b) => b.until > now);
    const key = bf.map((b) => b.kind).join();
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.buffs.textContent = '';
      for (const b of bf) {
        const c = el('div', 'fm-chip-hud buff');
        c.dataset.tip = `Бафф Древа: ${BUFFS[b.kind].name}`;
        c.append(el('span', '', b.kind === 'xp' ? '✨' : b.kind === 'price' ? '💰' : '⏩'), el('span', 'fm-buff-t'));
        this.buffs.append(c);
      }
    }
    [...this.buffs.children].forEach((c, i) => put(c.lastElementChild as HTMLElement, `${BUFFS[bf[i].kind].name} · ${fmtLeft(bf[i].until - now)}`));

    // шаг обучения
    const t = f.tutorial;
    const on = t >= 0 && t < TUTORIAL_STEPS;
    this.tut.hidden = !on;
    if (on) {
      put(this.tutHead, `СЕМЕЧКИН · ШАГ ${t + 1} ИЗ ${TUTORIAL_STEPS}`);
      put(this.tutText, TUTORIAL_TEXT[t]);
      if (this.tutDots.childElementCount !== TUTORIAL_STEPS) for (let i = 0; i < TUTORIAL_STEPS; i++) this.tutDots.append(el('i'));
      [...this.tutDots.children].forEach((d, i) => { d.classList.toggle('done', i < t); d.classList.toggle('cur', i === t); });
    }
  }

  setVisible(v: boolean): void {
    this.left.hidden = !v;
    this.right.hidden = !v;
  }
}
