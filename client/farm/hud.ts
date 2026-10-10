// Интерфейс фермы (часть B2): HUD с крупными карточками (client/farm/ui/bar.ts), окна Семечкина, Гриба, Фургона, доски
// заказов, «Хозяйства», доски фермы, меню посадки и экран нового уровня (client/farm/ui/*.ts), уведомления «У тебя созрело N».
// Всё мышью, Esc и × закрывают окна, клик мимо — тоже. Решает сервер: окно только просит ({t:'farm', a:…}) через FarmHudActions.
// Сцена (scene.ts) зовёт: setMe/refresh на каждый прогресс, object(E у предмета), openPlant(E у пустой грядки), onEvent(farmEv),
// onSys(сообщения B1), hotkey(клавиши, H — «Хозяйство»), setHint, close.
import { emptyFarm, type FarmProgress } from '../../shared/farm.ts';
import type { FarmObjectId } from '../../shared/farmmap.ts';
import type { FarmClientMsg, FarmEvent, FarmPlotView, FarmRosterRow } from '../../shared/farmnet.ts';
import type { FarmBossResult, FarmBossView, FarmSysMsg, FarmVanView } from '../../shared/farmsys.ts';
import './farm.css';
import { FarmBar } from './ui/bar.ts';
import { BoardWin } from './ui/board.ts';
import { BossEndWin } from './ui/bossend.ts';
import { EstateWin } from './ui/estate.ts';
import { FarmNotify } from './ui/notify.ts';
import { GribWin } from './ui/grib.ts';
import { LevelWin } from './ui/levelup.ts';
import { OrdersWin } from './ui/orders.ts';
import { PlantWin } from './ui/plant.ts';
import { SeedsWin } from './ui/seeds.ts';
import { gotToast } from './ui/sys.ts';
import { VanWin } from './ui/van.ts';
import { el, type FarmHost, type FarmWin } from './ui/common.ts';

export { farmIcon, fmtMin } from './ui/common.ts';

export interface FarmHudActions {
  plant(crop: string): void;
  sell(item: string, n: number): void;
  /** Окно закрылось (мышь — обратно игре) */
  closed(): void;
  /** B2 (новое): любое намерение фермы — convert, upgrade, van, order, look, tutorial, claimPlot, pig, plant на несколько грядок */
  send?(m: FarmClientMsg): void;
  /** B2: живой баланс жетонов (иначе берём из последнего refresh) */
  tokens?(): number;
  /** B2: участки и состав фермы — для доски фермы */
  plots?(): readonly FarmPlotView[];
  roster?(): readonly FarmRosterRow[];
  /** B2: общий тост игры (Toasts.show) для «созрело N», достижений, помощи */
  toast?(text: string, sub?: string, key?: string): void;
  /** B2: надеть вещи каталога («Надеть» на экране уровня): {t:'outfit'} с вещами, что уже куплены */
  wear?(ids: string[]): void;
  /** B2: отпустить мышь и клавиши перед окном (releaseAll + unlock) */
  free?(): void;
}

export class FarmHud {
  readonly root = el('div', 'hud fm hidden');
  private readonly bar: FarmBar;
  private readonly hint = el('div', 'fm-hint');
  private hintKey = '';
  private readonly act: FarmHudActions;
  private readonly notify: FarmNotify;
  private f: FarmProgress = emptyFarm(0);
  private plot = -1;
  private offset = 0;
  private tokensSeen = 0;
  private vanView: FarmVanView | null = null;
  private bossView: FarmBossView | null = null;
  private bossLast: FarmBossResult | null = null;
  private timer = 0;
  private cur: FarmWin | null = null;
  private readonly seeds: SeedsWin;
  private readonly grib: GribWin;
  private readonly van: VanWin;
  private readonly orders: OrdersWin;
  private readonly estate: EstateWin;
  private readonly board: BoardWin;
  private readonly plantWin: PlantWin;
  private readonly level: LevelWin;
  private readonly bossEnd: BossEndWin;

  constructor(parent: HTMLElement, act: FarmHudActions) {
    this.act = act;
    this.notify = new FarmNotify((text, sub, key) => this.toast(text, sub, key));
    this.bar = new FarmBar({
      openEstate: () => this.openEstate(),
      closeTutorial: () => act.send?.({ t: 'farm', a: 'tutorial', k: 'close' }),
    });
    this.root.append(this.bar.left, this.bar.right, el('div', 'fm-cross'), this.hint);
    parent.appendChild(this.root);

    const hud = this;
    const host: FarmHost = {
      get f() { return hud.f; },
      get now() { return hud.now(); },
      get tokens() { return hud.tokens(); },
      get plot() { return hud.plot; },
      send: (m) => act.send?.(m),
      plots: () => act.plots?.() ?? [],
      roster: () => act.roster?.() ?? [],
      sell: (item, n) => act.sell(item, n),
      plant: (crop) => act.plant(crop),
      toast: (text, sub, key) => this.toast(text, sub, key),
      wear: (ids) => (act.wear ? act.wear(ids) : this.toast('Надень обновки в примерочной на площади')),
      van: () => this.vanView,
      boss: () => this.bossView,
      bossLast: () => this.bossLast,
      closed: (win) => { if (this.cur === win) this.cur = null; act.closed(); },
    };
    this.seeds = new SeedsWin(this.root, host, { id: 'seeds', eyebrow: 'ФЕРМА · СЕМЕНА', title: 'Семечкин', intro: 'Всё про культуры: что растёт, сколько стоит и что откроется дальше.', avatar: '🧑‍🌾', accent: '#7bd88f' });
    this.grib = new GribWin(this.root, host, { id: 'grib', eyebrow: 'ФЕРМА · СКУПКА', title: 'Дядюшка Гриб', intro: 'Свежий урожай — по чести. Ненужное из кладовой — в опыт.', avatar: '🍄', accent: '#ffb36b' });
    this.van = new VanWin(this.root, host, { id: 'van', eyebrow: 'ФЕРМА · ФУРГОН', title: 'Фургон', intro: 'Целый ящик из сумки — и платят в полтора раза больше.', avatar: '🚚', accent: '#67d6c7' });
    this.orders = new OrdersWin(this.root, host, { id: 'orders', eyebrow: 'ФЕРМА · ЗАКАЗЫ', title: 'Доска заказов', intro: 'Три заказа на сегодня. Выполнил — забирай награду.', avatar: '📋', accent: '#ffd35a' });
    this.estate = new EstateWin(this.root, host, { id: 'estate', eyebrow: 'ФЕРМА · ХОЗЯЙСТВО', title: 'Хозяйство', intro: 'Улучшай грядки, инструменты и постройки. Клавиша H — открыть отовсюду.', avatar: '🧺', accent: '#7bd88f' });
    this.board = new BoardWin(this.root, host, { id: 'board', eyebrow: 'ФЕРМА · ДОСКА', title: 'Доска фермы', intro: 'Кто где живёт, кто спит и кому можно помочь.', avatar: '🪧', accent: '#ffd35a' });
    this.plantWin = new PlantWin(this.root, host, { id: 'plant', eyebrow: 'ФЕРМА · ГРЯДКА', title: 'Что посадить?', intro: '', avatar: '🌱', accent: '#7bd88f' });
    this.bossEnd = new BossEndWin(this.root, host, { id: 'bossend', eyebrow: 'ДРЕВО РАЗЛОМА · ИТОГ', title: 'Итог Древа', intro: '', avatar: '🌳', accent: '#7bd88f' });
    this.level = new LevelWin(this.root, host, { id: 'level', eyebrow: 'ФЕРМА · НОВЫЙ УРОВЕНЬ', title: 'Новый уровень', intro: '', avatar: '1', accent: '#ffd35a' });
  }

  /** Какое окно открыто: '' — никакое (сцена по этому отпускает мышь и не берёт ввод) */
  get open(): string {
    return this.cur?.isOpen ? this.cur.id : '';
  }

  private now(): number {
    return Date.now() + this.offset;
  }

  private tokens(): number {
    return this.act.tokens ? this.act.tokens() : this.tokensSeen;
  }

  private toast(text: string, sub = '', key = ''): void {
    this.act.toast?.(text, sub, key);
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
    this.bar.setVisible(v);
    window.clearInterval(this.timer);
    if (v) {
      this.notify.reset();
      this.timer = window.setInterval(() => this.tick(), 1000);
    } else this.close(false);
  }

  private tick(): void {
    const now = this.now();
    this.bar.update(this.f, this.plot, now);
    this.notify.check(this.f, now);
    this.cur?.tick();
  }

  /** Свой прогресс: уровень, опыт, запасы, шаг обучения */
  setMe(f: FarmProgress, plot: number): void {
    this.f = f;
    this.plot = plot;
    this.bar.update(f, plot, this.now());
  }

  /** Серверное время и жетоны пришли: поправить часы, перерисовать открытое окно, объявить созревшее и итог дня */
  refresh(f: FarmProgress, now: number, tokens: number): void {
    this.f = f;
    this.offset = now - Date.now();
    this.tokensSeen = tokens;
    this.bar.update(f, this.plot, now);
    this.notify.check(f, now);
    this.notify.checkCap(f, now);
    this.cur?.refresh();
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

  /** Открыть окно: прежнее закрывается тихо, мышь отпускается */
  private show(win: FarmWin, run: () => void): void {
    if (this.cur && this.cur !== win) this.cur.close(true);
    this.cur = win;
    this.setHint(null);
    run();
    this.act.free?.();
  }

  /** E у общего предмета: открыть его окно. false — окна нет (сцена покажет «скоро») */
  object(id: FarmObjectId, f: FarmProgress, now: number): boolean {
    this.f = f;
    this.offset = now - Date.now();
    switch (id) {
      case 'semechkin': this.show(this.seeds, () => this.seeds.open()); return true;
      case 'grib': this.show(this.grib, () => this.grib.open()); return true;
      case 'orders': this.show(this.orders, () => this.orders.open()); return true;
      case 'van': this.show(this.van, () => this.van.open()); return true;
      case 'farmBoard': case 'boss': this.show(this.board, () => this.board.open()); return true;
      default: return false;
    }
  }

  /** Посадка на пустую грядку bed (E): сетка культур. Без номера грядки — как раньше, сажаем туда, куда целится сцена */
  openPlant(f: FarmProgress, tokens: number, bed = -1): void {
    this.f = f;
    this.tokensSeen = tokens;
    this.show(this.plantWin, () => this.plantWin.openAt(bed));
  }

  /** Окно Гриба (прежний вход) */
  openGrib(f: FarmProgress, now: number): void {
    this.object('grib', f, now);
  }

  openEstate(): void {
    this.show(this.estate, () => this.estate.open());
  }

  /** Клавиши фермы сверх движения: H — «Хозяйство». true — съела */
  hotkey(code: string): boolean {
    if (this.open || code !== 'KeyH') return false;
    this.openEstate();
    return true;
  }

  /** События сервера, которые рисует HUD. true — событие съедено (сцена не показывает свой тост) */
  onEvent(e: FarmEvent): boolean {
    if (e.k !== 'level') return false;
    this.show(this.level, () => this.level.push({ level: e.level, items: e.items, coins: e.coins }));
    return true;
  }

  /** Сообщения частей B1 (shared/farmsys.ts): Фургон, Древо, итог Древа, награды, сводка при входе. farmBossFx рисует 3D (B3) */
  onSys(m: FarmSysMsg): void {
    switch (m.t) {
      case 'farmVan': this.vanView = m.v; break;
      case 'farmBoss': this.bossView = m.b; break;
      case 'farmBossEnd':
        this.bossLast = m.r;
        this.show(this.bossEnd, () => this.bossEnd.push(m.r));
        break;
      case 'farmGot': {
        const [title, sub] = gotToast(m.g);
        this.toast(title, sub, 'farm-got');
        break;
      }
      case 'farmAway': this.notify.away(m.a, this.f, this.now()); break;
      case 'farmBossFx': break;
    }
    this.cur?.refresh();
  }

  close(notify = true): void {
    this.cur?.close(!notify);
  }
}
