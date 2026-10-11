// HUD фермы в слотах кита (lab/ui/screens/farm.js, «Ферма: обычный экран», v2 — компактно):
// слева-сверху одна карточка фермы — уровень кольцом опыта (.k-ring--mode: это уровень фермы, а не игрока), что откроет
// следующий уровень, Фургон и баффы Древа, кнопка «Хозяйство» (H) — и под ней одна карточка обучения Семечкина;
// справа-сверху под бейджем (уровень игрока и жетоны — только в бейдже) ряд плиток: лейка, колодец, сумка, «созрело»,
// «помощь». Подсказок в title нет — мышь в игре захвачена; всё нужное написано на самих плитках.
import { bagCap, bagUsed, canMax, farmLevelInfo, type FarmProgress } from '../../../shared/farm.ts';
import { helpView } from '../../../shared/farmhelp.ts';
import { BUFFS, FARM_LEVEL_NAMES, FARM_MAX_LEVEL, HELP_MIN_LEVEL, TUTORIAL_COINS, TUTORIAL_STEPS, TUTORIAL_XP, VAN_SLOTS_BY_LEVEL, WELL_SETS, cropById } from '../../../shared/farmdata.ts';
import { keyHtml } from '../../ui/kit/dom.ts';
import type { HudSlots } from '../../ui/kit/slots.ts';
import { C, TUTORIAL_TEXT, big, clockHour, fi, fmtLeft, iconUrl, mskHour, plural, popAt, wellView } from './common.ts';
import { levelOpens } from './levels.ts';

/** Не лезем в DOM, если разметка та же */
function put(node: HTMLElement, html: string): void {
  if (node.innerHTML !== html) node.innerHTML = html;
}

const TOGGLE = (node: HTMLElement, cls: string, on: boolean): void => {
  if (node.classList.contains(cls) !== on) node.classList.toggle(cls, on);
};

interface Tile {
  root: HTMLElement;
  img: HTMLImageElement;
  cap: HTMLElement;
  sub: HTMLElement;
  meter: HTMLElement | null;
}

/** Плитка кита: иконка на подложке, полоса внизу, подпись под ней из двух строк */
function tile(cls: string, icon: string, label: string, withMeter: string): Tile {
  const root = document.createElement('div');
  root.className = `k-tile ${cls}`;
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', label);
  root.innerHTML = `<span class="k-tile-face"><img src="${icon}" alt="" draggable="false">${withMeter ? `<span class="k-meter ${withMeter}" style="--v:0"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span>` : ''}</span><span class="k-tile-cap"><span></span><small></small></span>`;
  const q = <T extends HTMLElement>(s: string): T => root.querySelector<T>(s)!;
  return { root, img: q<HTMLImageElement>('img'), cap: q('.k-tile-cap > span'), sub: q('small'), meter: root.querySelector('.k-meter') };
}

function setMeter(t: Tile, v: number): void {
  const k = String(Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000);
  if (t.meter && t.meter.style.getPropertyValue('--v') !== k) t.meter.style.setProperty('--v', k);
}

export interface BarActions {
  openEstate(): void;
}

export class FarmBar {
  private readonly card = document.createElement('div');
  private readonly ring = document.createElement('span');
  private readonly name = document.createElement('b');
  private readonly xp = document.createElement('span');
  private readonly next = document.createElement('div');
  private readonly chips = document.createElement('div');
  private readonly quest = document.createElement('div');
  private readonly questHead = document.createElement('p');
  private readonly questText = document.createElement('div');
  private readonly questSteps = document.createElement('div');
  private readonly questPrize = document.createElement('span');
  private readonly row = document.createElement('div');
  private readonly can = tile('farm-water', iconUrl('watering-can'), 'Лейка', 'k-meter--info farm-wmeter');
  private readonly well = tile('farm-well', iconUrl('well'), 'Колодец', 'k-meter--info');
  private readonly bag = tile('farm-bag', iconUrl('bag'), 'Сумка', 'k-meter--good farm-bmeter');
  private readonly ripe = tile('k-tile--own farm-ripe', '', 'Созрело — собирай', '');
  private readonly help = tile('farm-help', iconUrl('help-hands'), 'Помощь соседям', 'farm-hmeter');
  private helpNear = false;
  private visible = false;
  private lastNext = '';

  constructor(slots: HudSlots, act: BarActions) {
    const c = this.card;
    c.className = 'k-plate farm-card';
    this.ring.className = 'k-ring k-ring--sm k-ring--mode';
    this.ring.innerHTML = '<b>1</b>';
    const main = document.createElement('div');
    main.className = 'farm-card-main';
    this.name.className = 'farm-card-name';
    this.xp.className = 'farm-card-xp';
    main.append(this.name, this.xp);
    const estate = document.createElement('button');
    estate.type = 'button';
    estate.className = 'k-btn k-btn--icon k-btn--sm k-btn--ghost farm-card-estate';
    estate.setAttribute('aria-label', 'Хозяйство');
    estate.innerHTML = `${fi('basket')}${keyHtml('H', 'br', 'sm')}`;
    estate.addEventListener('click', () => act.openEstate());
    this.next.className = 'farm-card-next';
    this.chips.className = 'farm-card-chips';
    c.append(this.ring, main, estate, this.next, this.chips);

    const q = this.quest;
    q.className = 'k-plate farm-quest';
    this.questHead.className = 'k-eyebrow';
    this.questText.className = 'farm-quest-t';
    this.questSteps.className = 'farm-quest-steps';
    this.questSteps.innerHTML = '<i></i>'.repeat(TUTORIAL_STEPS);
    this.questPrize.className = 'k-pill k-pill--gold k-pill--sm farm-quest-prize';
    q.append(this.questHead, this.questText, this.questSteps, this.questPrize);

    this.row.className = 'k-tiles';
    // справа налево: первая плитка — у края экрана
    this.row.append(this.can.root, this.well.root, this.bag.root, this.ripe.root, this.help.root);
    // цвет режима для кольца, полос и плиток (--mode считается от ближайшего [data-mode])
    this.card.dataset.mode = this.quest.dataset.mode = this.row.dataset.mode = 'farm';
    this.card.hidden = this.quest.hidden = this.row.hidden = true;
    slots.tl.append(this.card, this.quest);
    slots.tr.append(this.row);
  }

  /** Ключ «E» и другие клавиши в тексте шага обучения — колпачками */
  private static caps(text: string): string {
    return text.replace(/\bE\b/g, keyHtml('E', undefined, 'sm'));
  }

  /** Перерисовать числа и подписи: свой прогресс, участок, серверное время */
  update(f: FarmProgress, plot: number, now: number): void {
    if (!this.visible) return;
    const info = farmLevelInfo(f.xp);
    const level = info.level;

    // --- карточка фермы
    const ringB = this.ring.querySelector('b')!;
    if (ringB.textContent !== String(level)) ringB.textContent = String(level);
    this.ring.style.setProperty('--p', (Math.round((info.into / info.need) * 1000) / 1000).toFixed(3));
    put(this.name, FARM_LEVEL_NAMES[level - 1]);
    put(this.xp, `<b class="farm-xp">${big(info.into)}</b> / ${big(info.need)}${level >= FARM_MAX_LEVEL ? ` · ${fi('xp-star')}${info.stars}` : ''} · участок ${plot + 1}`);
    this.card.classList.toggle('is-max', level >= FARM_MAX_LEVEL);

    const nx = level >= FARM_MAX_LEVEL ? '' : this.nextHtml(level + 1);
    if (nx !== this.lastNext) {
      this.lastNext = nx;
      this.next.hidden = nx === '';
      this.next.innerHTML = nx;
    }

    const chips: string[] = [];
    if (level >= VAN_SLOTS_BY_LEVEL[0].level) {
      const open = mskHour(now) % 2 === 0;
      chips.push(open
        ? `<span class="k-pill k-pill--good k-pill--sm">${fi('van')}Фургон здесь · до ${clockHour(mskHour(now) + 1)}</span>`
        : `<span class="k-pill k-pill--sm">${fi('van')}Фургон в ${clockHour(mskHour(now) + 1)}</span>`);
    }
    for (const b of f.buffs) {
      if (b.until <= now) continue;
      chips.push(`<span class="k-pill k-pill--gold k-pill--sm">${fi('life-fruit')}${BUFFS[b.kind].name} · ${fmtLeft(b.until - now)}</span>`);
    }
    put(this.chips, chips.join(''));
    this.chips.hidden = chips.length === 0;

    // --- обучение
    const t = f.tutorial;
    const on = t >= 0 && t < TUTORIAL_STEPS;
    this.quest.hidden = !on;
    if (on) {
      put(this.questHead, `Семечкин · шаг ${t + 1} из ${TUTORIAL_STEPS}`);
      put(this.questText, FarmBar.caps(TUTORIAL_TEXT[t]));
      const steps = this.questSteps.children;
      for (let i = 0; i < steps.length; i++) {
        TOGGLE(steps[i] as HTMLElement, 'is-done', i < t);
        TOGGLE(steps[i] as HTMLElement, 'is-cur', i === t);
      }
      put(this.questPrize, `+${TUTORIAL_XP[t]} опыта${t === TUTORIAL_STEPS - 1 ? ` · ${C()}${TUTORIAL_COINS}` : ''}`);
    }

    // --- плитки
    const max = canMax(f) / 100;
    const w = Math.floor(f.water / 100);
    const empty = w <= 0;
    TOGGLE(this.can.root, 'k-tile--warn', empty);
    put(this.can.cap, empty ? 'Пусто' : `<span class="farm-w">${w}</span> / ${max}`);
    put(this.can.sub, empty ? 'лейка' : w >= max ? 'полная' : 'зарядов');
    setMeter(this.can, f.water / canMax(f));

    const wv = wellView(f, now);
    TOGGLE(this.well.root, 'k-tile--own', t === 1 && empty);
    TOGGLE(this.well.root, 'k-tile--warn', wv.sets <= 0 && empty);
    put(this.well.cap, `${wv.sets} / ${WELL_SETS}`);
    put(this.well.sub, wv.nextAt ? `+1 через ${fmtLeft(wv.nextAt - now)}` : 'вёдра полны');
    setMeter(this.well, wv.sets / WELL_SETS);

    const used = bagUsed(f);
    const cap = bagCap(f);
    TOGGLE(this.bag.root, 'k-tile--warn', used >= cap * 0.9);
    put(this.bag.cap, `<span class="farm-b">${used}</span> / ${cap}`);
    put(this.bag.sub, used >= cap ? 'полна' : 'сумка');
    setMeter(this.bag, used / cap);

    const ripeCrops = f.beds.filter((b) => b.crop && now >= b.ripeAt);
    const n = ripeCrops.length;
    this.ripe.root.hidden = n === 0;
    if (n > 0) {
      const src = iconUrl(cropById(ripeCrops[0].crop)?.icon ?? '');
      if (this.ripe.img.getAttribute('src') !== src) this.ripe.img.src = src;
      put(this.ripe.cap, `<span class="farm-r">${n}</span> ${plural(n, 'грядка', 'грядки', 'грядок')}`);
      put(this.ripe.sub, 'созрело');
    }

    const hv = helpView(f, now);
    // помощь: показываем, пока тратишь очки или стоишь у чужой грядки
    const showHelp = level >= HELP_MIN_LEVEL && (this.helpNear || hv.points < hv.max);
    this.help.root.hidden = !showHelp;
    if (showHelp) {
      put(this.help.cap, `<span class="farm-h">${hv.points}</span> / ${hv.max}`);
      put(this.help.sub, hv.resetAt ? `помощь · ${fmtLeft(hv.resetAt - now)}` : 'помощь');
      setMeter(this.help, hv.points / hv.max);
    }
  }

  /** «Ур. 6 откроет [клубника][гриб] · Грядка 4» — одной строкой */
  private nextHtml(level: number): string {
    const o = levelOpens(level);
    const icons = o.crops.slice(0, 3).map((c) => fi(c.icon)).join('');
    const words: string[] = o.upgrades.map((u) => (u.kind === 'bed' ? `грядку ${u.step}` : u.name));
    if (o.van) words.push('ящик Фургона');
    const head = `<span class="k-dim">Ур. ${level} откроет</span>`;
    if (!icons && !words.length) return `${head}${fi('ui:straw-hat')}<span class="k-dim">новую награду</span>`;
    return `${head}${icons}${words.length ? `<span class="k-dim">${icons ? 'и ' : ''}${words.join(', ')}</span>` : ''}`;
  }

  /** Сосед рядом: плитка «помощь» видна всегда */
  setHelpNear(v: boolean): void {
    this.helpNear = v;
  }

  /** «+35» у карточки фермы (опыт фермы за сбор) */
  popXp(n: number): void {
    popAt(this.card, `+${n}`, 'k-pop--xp');
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.card.hidden = !v;
    this.row.hidden = !v;
    if (!v) this.quest.hidden = true;
  }
}
