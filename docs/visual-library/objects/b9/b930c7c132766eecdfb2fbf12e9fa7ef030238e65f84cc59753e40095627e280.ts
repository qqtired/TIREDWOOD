import { FarmLoot } from './ui/loot.ts';
// Интерфейс фермы на ките 2.0 (lab/ui/screens/farm.js): HUD лежит в слотах кита — карточка фермы и обучение слева-сверху,
// плитки справа-сверху (ui/bar.ts), окно посадки и подсказка E (ui/belt.ts, ui/prompt.ts); плашка Древа,
// тосты и баннер уровня идут через верх-центр кита (ui.top) — своей разметки наверху нет. Окна — нативные <dialog> с
// китовым .k-scrim (Семечкин, Гриб, «Заказы» с вкладками Фургон/доска, Хозяйство, доска фермы, новый уровень, итог Древа);
// Esc, × и клик мимо закрывают. Решает сервер: окно только просит ({t:'farm', a:…}) через FarmHudActions.
// Сцена передаёт прогресс, открывает окна предметов и посадки; правила и цены — из shared.
import { emptyFarm, type FarmProgress } from '../../shared/farm.ts';
import type { FarmObjectId } from '../../shared/farmmap.ts';
import type { FarmClientMsg, FarmEvent, FarmPlotView, FarmRosterRow } from '../../shared/farmnet.ts';
import type { FarmBossResult, FarmBossView, FarmSysMsg, FarmVanView } from '../../shared/farmsys.ts';
import { PRIO, type TopCenter } from '../ui/kit/topcenter.ts';
import type { HudSlots } from '../ui/kit/slots.ts';
import './farm.css';
import { FarmBar } from './ui/bar.ts';
import { BoardWin } from './ui/board.ts';
import { BossEndWin } from './ui/bossend.ts';
import { PlantWin } from './ui/belt.ts';
import { EstateWin } from './ui/estate.ts';
import { FarmNotify } from './ui/notify.ts';
import { GribWin } from './ui/grib.ts';
import { LevelWin } from './ui/levelup.ts';
import { OrdersWin } from './ui/orders.ts';
import { FarmPrompt } from './ui/prompt.ts';
import type { Prompt } from './ui/prompt-model.ts';
import { SeedsWin } from './ui/seeds.ts';
import { gotToast } from './ui/sys.ts';
import { FarmTree } from './ui/tree.ts';
import { iconUrl, type FarmHost, type FarmToast, type FarmWin } from './ui/common.ts';

export { farmIcon, fmtMin, iconUrl } from './ui/common.ts';
export type { FarmToast } from './ui/common.ts';

export interface FarmHudActions {
  sell(item: string, n: number): void;
  /** Окно закрылось (мышь — обратно игре) */
  closed(): void;
  /** Любое намерение фермы — convert, upgrade, van, order, look, tutorial, claimPlot, pig, plant, help */
  send?(m: FarmClientMsg): void;
  /** Живой баланс жетонов (иначе берём из последнего refresh) */
  tokens?(): number;
  /** Участки и состав фермы — для доски фермы */
  plots?(): readonly FarmPlotView[];
  roster?(): readonly FarmRosterRow[];
  /** Надеть вещи каталога («Надеть» на экране уровня): {t:'outfit'} с вещами, что уже куплены */
  wear?(ids: string[]): void;
  /** Отпустить мышь и клавиши перед окном (releaseAll + unlock) */
  free?(): void;
}

export class FarmHud {
  private readonly top: TopCenter;
  private readonly loot: FarmLoot;
  private readonly bar: FarmBar;
  private readonly prompt: FarmPrompt;
  private readonly plant: PlantWin;
  private readonly tree: FarmTree;
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
  private readonly orders: OrdersWin;
  private readonly estate: EstateWin;
  private readonly board: BoardWin;
  private readonly level: LevelWin;
  private readonly bossEnd: BossEndWin;

  constructor(slots: HudSlots, top: TopCenter, act: FarmHudActions) {
    this.act = act;
    this.top = top;
    this.loot = new FarmLoot(slots);
    this.notify = new FarmNotify((t) => this.toast(t));
    this.bar = new FarmBar(slots, { openEstate: () => this.openEstate() });
    this.prompt = new FarmPrompt(slots);
    this.tree = new FarmTree(top, {
      boss: () => this.bossView,
      now: () => this.now(),
      mePid: () => act.plots?.()[this.plot]?.pid ?? -1,
      toast: (t) => this.toast(t),
    }, slots);

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
      toast: (t) => this.toast(t),
      wear: (ids) => (act.wear ? act.wear(ids) : this.toast({ tone: 'info', icon: 'ui:wardrobe', title: 'Надень обновки в примерочной на площади' })),
      van: () => this.vanView,
      boss: () => this.bossView,
      bossLast: () => this.bossLast,
      closed: (win) => { if (this.cur === win) this.cur = null; act.closed(); },
      goPlot: (plot) => this.goPlot(plot),
    };
    // окна — <dialog> в верхнем слое: родитель любой, кладём в body
    const body = document.body;
    this.plant = new PlantWin(body, host, { id: 'plant', eyebrow: 'Ферма · посадка', title: 'Что посадить?', portrait: 'seeds', size: 'lg' });
    this.seeds = new SeedsWin(body, host, { id: 'seeds', eyebrow: 'Ферма · семена', title: 'Семечкин', line: '«Первая посадка новой культуры — от меня в подарок!»', portrait: 'seeds', size: 'lg' });
    this.grib = new GribWin(body, host, { id: 'grib', eyebrow: 'Ферма · скупка', title: 'Дядюшка Гриб', line: '«Всё возьму! У Фургона свои ящики и опыт»', portrait: 'giant-mushroom' });
    this.orders = new OrdersWin(body, host, { id: 'orders', eyebrow: 'Ферма · заказы', title: 'Заказы', portrait: 'van', size: 'lg' });
    this.estate = new EstateWin(body, host, { id: 'estate', eyebrow: 'Ферма · участок', title: 'Хозяйство', portrait: 'basket', size: 'lg' });
    this.board = new BoardWin(body, host, { id: 'board', eyebrow: 'Ферма · доска', title: 'Доска фермы', line: 'Кто где живёт, кто спит и кому можно помочь', portrait: 'help-hands', size: 'lg', coins: false });
    this.bossEnd = new BossEndWin(body, host, { id: 'bossend', eyebrow: 'Древо разлома', title: 'Итог Древа', portrait: 'ui:rift-tree', size: 'sm', bare: 'k-window k-window--sm farm-treeend' });
    this.level = new LevelWin(body, host, { id: 'level', eyebrow: 'Ферма · новый уровень', title: 'Новый уровень', portrait: 'xp-star', bare: 'k-panel k-lamp farm-lvl +clear' });
    this.level.onShow = (level, name) => {
      top.hero({ key: 'farm-level', prio: PRIO.mode, tone: 'gold', title: `Уровень фермы ${level}!`, sub: name });
    };
  }

  /** Какое окно открыто: '' — никакое (сцена по этому отпускает мышь и не берёт ввод) */
  get open(): string {
    return this.cur?.isOpen ? this.cur.id : '';
  }

  harvest(e: Extract<FarmEvent, { k: 'harvest' }>): void { this.loot.show(e); }
  identityFailed(): void { this.estate.identityFailed(); }
  setTreeNear(near: boolean): void { this.tree.setNear(near); }
  private now(): number {
    return Date.now() + this.offset;
  }

  private tokens(): number {
    return this.act.tokens ? this.act.tokens() : this.tokensSeen;
  }

  /** Тост в верх-центр кита: иконка — имя файла фермы или «ui:id» */
  toast(t: FarmToast): void {
    // ключ всегда «farm…»: при выходе с фермы тосты с таким началом убираются (setVisible)
    this.top.toast({ key: t.key ?? 'farm', tone: t.tone, icon: iconUrl(t.icon), title: t.title, sub: t.sub });
  }

  setVisible(v: boolean): void {
    this.bar.setVisible(v);
    if (!v) this.loot.clear();
    this.prompt.setVisible(v);
    this.tree.setVisible(v);
    window.clearInterval(this.timer);
    if (v) {
      this.notify.reset();
      this.timer = window.setInterval(() => this.tick(), 1000);
    } else {
      this.level.reset();
      this.close(false);
      // свои тосты и герои фермы не должны висеть над площадью (только с префиксом — чужие остаются)
      this.top.clearToasts('farm');
      this.top.clearHero('farm-level');
    }
  }

  private tick(): void {
    const now = this.now();
    this.bar.update(this.f, this.plot, now);
    this.notify.check(this.f, now);
    this.tree.update();
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
    this.cur?.refresh();
  }

  /** Подсказка действия (E) внизу по центру; null — спрятать */
  setPrompt(p: Prompt | null): void {
    this.prompt.set(p);
  }

  /** «+35» у карточки фермы за сбор */
  popXp(n: number): void {
    this.bar.popXp(n);
  }

  /** Сосед рядом (его грядка под прицелом): плитка «помощь» видна всегда */
  setHelpNear(v: boolean): void {
    this.bar.setHelpNear(v);
  }

  /** E / ЛКМ у пустой грядки открывает сетку доступных семян. */
  openPlant(bed: number): void { this.show(this.plant, () => this.plant.showBed(bed)); }
  get plantBed(): number { return this.plant.targetBed; }
  plantFailed(text: string): boolean { return this.plant.failed(text); }

  // ------------------------------------------------------------ окна

  /** Открыть окно: прежнее закрывается тихо, мышь отпускается */
  private show(win: FarmWin, run: () => void): void {
    if (this.cur && this.cur !== win) this.cur.close(true);
    this.cur = win;
    this.prompt.set(null);
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
      case 'orders': this.show(this.orders, () => this.orders.open('board')); return true;
      case 'van': this.show(this.orders, () => this.orders.open('van')); return true;
      case 'farmBoard': case 'boss': this.show(this.board, () => this.board.open()); return true;
      default: return false;
    }
  }

  /** Окно Гриба (прежний вход) */
  openGrib(f: FarmProgress, now: number): void {
    this.object('grib', f, now);
  }

  openEstate(): void {
    this.show(this.estate, () => this.estate.open());
  }

  /** «Помочь» на доске фермы: окно закрыто, подскажи дорогу — у грядки соседа подсказка E сама предложит полить */
  private goPlot(plot: number): void {
    const p = this.act.plots?.()[plot];
    this.toast({ key: 'farm-go', tone: 'info', icon: 'help-hands', title: `Иди на участок ${plot + 1}${p?.nick ? ` — к ${p.nick}` : ''}`, sub: 'Встань у растущей грядки и нажми E — полить соседу' });
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
      case 'farmBoss':
        this.bossView = m.b;
        this.tree.onBoss(m.b);
        break;
      case 'farmBossEnd':
        this.bossLast = m.r;
        this.show(this.bossEnd, () => this.bossEnd.push(m.r));
        break;
      case 'farmGot': this.toast(gotToast(m.g)); break;
      case 'farmAway': this.notify.away(m.a, this.f, this.now()); break;
      case 'farmBossFx': this.tree.onFx(m); break;
    }
    this.cur?.refresh();
  }

  close(notify = true): void {
    this.cur?.close(!notify);
  }
}
