// Интерфейс фермы (минимальный, фундамент): уровень фермы с полосой опыта, вода/сумка/колодец, шаг обучения Семечкина,
// подсказка у цели, окно посадки на грядке и окно Дядюшки Гриба. Полные окна (Семечкин, Фургон, заказы, «Хозяйство»,
// экран уровня, уведомления) — часть B2: client/farm/ui/. Всё мышью, Esc и × закрывают окна.
import { bagCap, bagUsed, canMax, capPay, cropOpen, farmLevel, farmLevelInfo, saleUnit, seedPrice, type FarmProgress } from '../../shared/farm.ts';
import { mskDay } from '../../shared/economy.ts';
import { CROPS, DAILY_CAP, FARM_LEVEL_NAMES, TRUFFLE, TRUFFLE_PRICE, WELL_SETS, cropById } from '../../shared/farmdata.ts';
import type { FarmObjectId } from '../../shared/farmmap.ts';
import type { FarmSysMsg } from '../../shared/farmsys.ts';
import { setCoinText } from '../ui/coin.ts';
import './farm.css';

const ICONS = import.meta.glob('../assets/farm/icons/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const farmIcon = (name: string): string => ICONS[`../assets/farm/icons/${name}.png`] ?? '';

/** Шаги обучения (design-v11 §1.4): одна фраза Семечкина на шаг */
const TUTORIAL = [
  'Семечкин: «Посади редис — первый пакетик дарю». Подойди к своей грядке и нажми E',
  'Семечкин: «Набери лейку у колодца» — встань у корыта и нажми E',
  'Семечкин: «Полей грядку» — E у растущей грядки',
  'Семечкин: «Созрело! Собери» — E у светящейся грядки',
  'Семечкин: «Отнеси Дядюшке Грибу» — он у лавки с весами',
  'Семечкин: «Посади ещё и загляни на доску заказов»',
];

/** Элемент с текстом; 🪙 рисуется значком жетона, как во всей игре */
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) setCoinText(e, text);
  return e;
};

export function fmtMin(min: number): string {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

export interface FarmHudActions {
  plant(crop: string): void;
  sell(item: string, n: number): void;
  /** Окно закрылось (мышь — обратно игре) */
  closed(): void;
}

export class FarmHud {
  readonly root = el('div', 'hud fm hidden');
  private readonly levelBox = el('div', 'fm-level');
  private readonly levelName = el('b');
  private readonly levelSub = el('small');
  private readonly bar = el('i');
  private readonly stock = el('div', 'fm-stock');
  private readonly water = el('span');
  private readonly bag = el('span');
  private readonly well = el('span');
  private readonly tut = el('div', 'fm-tut');
  private readonly hint = el('div', 'fm-hint');
  private readonly win = el('div', 'fm-win');
  private hintKey = '';
  private readonly act: FarmHudActions;
  /** Какое окно открыто: '' — никакое */
  open: '' | 'plant' | 'grib' = '';

  constructor(parent: HTMLElement, act: FarmHudActions) {
    this.act = act;
    const barBox = el('div', 'fm-bar');
    barBox.append(this.bar);
    this.levelBox.append(this.levelName, barBox, this.levelSub);
    this.stock.append(this.water, this.bag, this.well);
    this.win.hidden = true;
    this.root.append(this.levelBox, this.stock, this.tut, el('div', 'fm-cross'), this.hint, this.win);
    parent.appendChild(this.root);
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
    if (!v) this.close(false);
  }

  /** Свой прогресс: уровень, опыт, запасы, шаг обучения */
  setMe(f: FarmProgress, plot: number): void {
    const info = farmLevelInfo(f.xp);
    this.levelName.textContent = `Ферма · ур. ${info.level} · ${FARM_LEVEL_NAMES[info.level - 1]}`;
    this.bar.style.width = `${Math.round((info.into / info.need) * 100)}%`;
    this.levelSub.textContent = `${info.into} / ${info.need} XP${info.stars ? ` · ⭐ ${info.stars}` : ''} · участок №${plot + 1}`;
    this.water.textContent = `💧 ${Math.floor(f.water / 100)}/${canMax(f) / 100}`;
    this.bag.textContent = `👜 ${bagUsed(f)}/${bagCap(f)}`;
    this.well.textContent = `🪣 ${f.well.sets}/${WELL_SETS}`;
    this.tut.textContent = f.tutorial >= 0 && f.tutorial < TUTORIAL.length ? TUTORIAL[f.tutorial] : '';
  }

  setHint(keys: readonly string[] | null, text = ''): void {
    const key = keys ? `${keys.join('|')}#${text}` : '';
    if (key === this.hintKey) return;
    this.hintKey = key;
    this.hint.classList.toggle('show', keys !== null);
    if (!keys) return;
    this.hint.classList.toggle('info', keys.length === 0);
    this.hint.textContent = '';
    for (const k of keys) this.hint.appendChild(el('kbd', '', k));
    this.hint.appendChild(el('span', '', text));
  }

  // ------------------------------------------------------------ окна

  /** E у общего предмета: открыть его окно. false — окна нет (сцена покажет «скоро»). Новые окна B2 — здесь */
  object(id: FarmObjectId, f: FarmProgress, now: number): boolean {
    if (id === 'grib') { this.openGrib(f, now); return true; }
    return false;
  }

  /** Сообщения частей B1 (shared/farmsys.ts): Фургон, заказы, босс */
  onSys(_m: FarmSysMsg): void {}

  private frame(title: string, sub: string): HTMLElement {
    this.win.textContent = '';
    const x = el('button', 'fm-x', '×');
    x.type = 'button';
    x.title = 'Закрыть (Esc)';
    x.addEventListener('click', () => this.close());
    this.win.append(x, el('h3', '', title), el('p', 'fm-sub', sub));
    this.win.hidden = false;
    this.setHint(null);
    return this.win;
  }

  /** Посадка на пустую грядку: открытые культуры с ценой и временем; закрытые — с уровнем */
  openPlant(f: FarmProgress, tokens: number): void {
    this.open = 'plant';
    const level = farmLevel(f.xp);
    const w = this.frame('Что посадить?', 'Первая посадка каждой новой культуры — бесплатно');
    for (const c of CROPS) {
      const ok = cropOpen(c, level);
      if (!ok && c.level > level + 1) continue;
      const price = seedPrice(f, c);
      const row = el('button', 'fm-row');
      row.type = 'button';
      const icon = farmIcon(c.icon);
      if (icon) { const img = el('img', 'fm-ico'); img.src = icon; img.alt = ''; row.append(img); }
      row.append(el('b', '', c.name), el('em', '', ok ? `${fmtMin(c.min)} · ${price ? `${price} 🪙` : 'бесплатно'} · +${c.xp} XP` : `ур. ${c.level}`));
      row.disabled = !ok || price > tokens;
      if (ok && price > tokens) row.title = 'Не хватает жетонов';
      row.addEventListener('click', () => { this.act.plant(c.id); this.close(); });
      w.append(row);
    }
  }

  /** Дядюшка Гриб: урожай из сумки — по штуке или всё; потолок дня виден заранее */
  openGrib(f: FarmProgress, now: number): void {
    this.open = 'grib';
    this.renderGrib(f, now);
  }

  /** Обновить открытое окно Гриба после продажи */
  refresh(f: FarmProgress, now: number, tokens: number): void {
    if (this.open === 'grib') this.renderGrib(f, now);
    else if (this.open === 'plant') this.openPlant(f, tokens);
  }

  private renderGrib(f: FarmProgress, now: number): void {
    const sold = f.sold.day === mskDay(now) ? Math.floor(f.sold.coins) : 0;
    const w = this.frame('Дядюшка Гриб — скупка', `Сегодня продано на ${sold} / ${DAILY_CAP} 🪙 · после — ×0,25, но не дешевле посадки`);
    const items = Object.entries(f.bag).filter(([, n]) => n > 0);
    if (!items.length) w.append(el('p', 'fm-sub', 'Сумка пуста — собери урожай и приходи.'));
    for (const [id, n] of items) {
      const c = cropById(id);
      const unit = id === TRUFFLE ? TRUFFLE_PRICE : c ? saleUnit(f, c, now) : 0;
      const all = id === TRUFFLE ? n * TRUFFLE_PRICE : c ? Math.floor(capPay(sold, unit * n, c.seed / unit)) : 0;
      const row = el('div', 'fm-row');
      const icon = farmIcon(c?.icon ?? 'truffle');
      if (icon) { const img = el('img', 'fm-ico'); img.src = icon; img.alt = ''; row.append(img); }
      row.append(el('b', '', `${c?.product ?? 'Трюфель'} × ${n}`), el('em', '', `${Math.round(unit * 10) / 10} 🪙/шт`));
      const one = el('button', 'fm-btn', 'Продать 1');
      one.type = 'button';
      one.addEventListener('click', () => this.act.sell(id, 1));
      const every = el('button', 'fm-btn', `Всё · ${all} 🪙`);
      every.type = 'button';
      every.addEventListener('click', () => this.act.sell(id, n));
      row.append(one, every);
      w.append(row);
    }
  }

  close(notify = true): void {
    if (!this.open) return;
    this.open = '';
    this.win.hidden = true;
    this.win.textContent = '';
    if (notify) this.act.closed();
  }
}
