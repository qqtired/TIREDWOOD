// Ферма на сервере: одна комната на 20 участков (design-v11 §18.1). Ходьба — та же физика и те же двоичные снимки,
// что на набережной; всё остальное — JSON. Сервер решает всё: посадку, полив, сбор, продажу, покупки, колодец.
// Клиент шлёт только намерения ({t:'farm', a:…}, shared/farmnet.ts); прогресс игрока — profile.farm (shared/farm.ts).
// Части режима, которые достраиваются отдельно (помощь, Фургон, заказы, Древо, достижения), — в своих файлах рядом:
// systems.ts (FarmSystems: вход, выход, раз в секунду, свои сообщения) и rewards.ts получают FarmCtx и не трогают
// этот файл.
import { randomInt } from 'node:crypto';
import {
  addFarmXp, bagCap, bagUsed, bedStage, convert, emptyFarm, enterDay, farmLevel, harvest, pigTick, plant, rollDay, sell, tutorialEvent,
  upgrade, water, wellFill, wellTake, wellTick, type FarmFail, type FarmProgress, type TutorialEvent,
} from '../../shared/farm.ts';
import {
  ACTIONS_PER_SEC, BED_CLICK_RANGE, FARM_DECOR, FARM_PLOTS, PIG_STORE, PLOT_CLICK_RANGE, REP_FIRST_ENTRY, TRUFFLE,
  WELL_SETS, WELL_TRY_MS,
} from '../../shared/farmdata.ts';
import { FARM_LAYOUT } from '../../shared/farmlayout.ts';
import { bedDist, buildFarmMap, nearTrough, nearUse, plotToWorld, type FarmObjectId } from '../../shared/farmmap.ts';
import type { FarmAction, FarmClientMsg, FarmEvent, FarmPlotView, FarmRosterRow, FarmServerMsg, FarmStatus } from '../../shared/farmnet.ts';
import { WELL_MAX_SAMPLES, wellShare } from '../../shared/farmwell.ts';
import { stepHeld } from '../../shared/lobby.ts';
import type { ClientMsg, RoomKind } from '../../shared/messages.ts';
import type { Outfit } from '../../shared/outfit.ts';
import { E_ALIVE, E_DASH, E_GROUNDED, SNAP_SELF_RESET, encodeEntities, encodeSnapshot, makeHeader, type EntitySnap } from '../../shared/protocol.ts';
import {
  BTN_DASH, BTN_FIRE, BTN_JUMP, BTN_RELOAD, BTN_USE, makeEvents, makeInput, makeState, type Input, type PlayerState, type StepEvents,
} from '../../shared/sim.ts';
import { CollisionWorld } from '../../shared/world.ts';
import type { Client, Room } from '../hub.ts';
import { InputQueue } from '../inputs.ts';
import type { Profile } from '../store.ts';
import { FarmPlots, type PlotSeat } from './plots.ts';
import { grantLevel } from './rewards.ts';
import { FarmSystems } from './systems.ts';
import type { FarmBossState } from '../../shared/farmboss.ts';

/** Снимок движения — раз в 2 тика (30 Гц), как на набережной */
const SNAP_EVERY = 2;
/** «Разовые» кнопки: в паузе связи не повторяем */
const ONE_SHOT = BTN_FIRE | BTN_JUMP | BTN_DASH | BTN_RELOAD | BTN_USE;
/** Вода ниже — назад на точку появления */
const FALL_Y = -5;

export interface FarmHooks {
  now(): number;
  outfitOf(p: Profile): Outfit;
  profileOf(pid: number): Profile | undefined;
  /** Жетоны игроку (дохода от фермы общий XP не даёт) и списание; оба сразу шлют баланс */
  credit(c: Client, n: number): void;
  spend(c: Client, n: number): boolean;
  /** Общий опыт игрока (сбор урожая, §3.3) */
  generalXp(c: Client, n: number): void;
  /** Вещь каталога в owned; false — уже есть */
  grantItem(c: Client, id: string): boolean;
  dirty(): void;
  /** Места на участках из State.farmPlots и запись обратно */
  seats(): readonly (PlotSeat | null)[] | undefined;
  saveSeats(seats: (PlotSeat | null)[]): void;
  /** Ферма заполнилась или освободилась — калитке на площади */
  status?(st: FarmStatus): void;
  /** Древо разлома: State.farmBoss (переживает перезапуск) и строка в общий чат */
  boss?(): unknown;
  saveBoss?(s: FarmBossState | null): void;
  announce?(text: string): void;
}

export interface FarmPlayer {
  c: Client;
  /** Номер в снимках (1–250) */
  id: number;
  state: PlayerState;
  inq: InputQueue;
  last: Input;
  ev: StepEvents;
  plot: number;
  selfReset: boolean;
  /** Ограничение частоты действий: окно в тиках и сколько в нём было */
  actTick: number;
  acts: number;
  /** Колодец: зерно идущей попытки и когда началась прошлая */
  fill: { seed: number; at: number } | null;
  lastFill: number;
}

/** Всё, что нужно частям режима (systems.ts, rewards.ts): прогресс, отправка, жетоны, опыт */
export interface FarmCtx {
  now(): number;
  rng(): number;
  readonly plots: FarmPlots;
  farm(p: FarmPlayer): FarmProgress;
  players(): Iterable<FarmPlayer>;
  byPid(pid: number): FarmPlayer | undefined;
  /** Прогресс любого фермера по pid (и спящего): чтобы полить его грядки */
  farmOfPid(pid: number): FarmProgress | undefined;
  sendMe(p: FarmPlayer): void;
  /** Любое сообщение фермы одному игроку или всем на ферме (null) — для своих сообщений частей (shared/farmsys.ts) */
  send(to: FarmPlayer | null, msg: FarmServerMsg): void;
  plotChanged(plot: number): void;
  ev(to: FarmPlayer | null, e: FarmEvent): void;
  fail(p: FarmPlayer, a: FarmAction, why: Extract<FarmEvent, { k: 'fail' }>['why']): void;
  /** Опыт фермы: уровни и награды за них */
  xp(p: FarmPlayer, n: number, why: string): void;
  credit(p: FarmPlayer, n: number): void;
  spend(p: FarmPlayer, n: number): boolean;
  grantItem(p: FarmPlayer, id: string): boolean;
  dirty(): void;
}

export class FarmRoom implements Room, FarmCtx {
  readonly kind = 'farm' as const;
  readonly world = new CollisionWorld(buildFarmMap());
  readonly plots: FarmPlots;
  tick = 0;
  private readonly hooks: FarmHooks;
  private readonly byClient = new Map<Client, FarmPlayer>();
  private readonly header = makeHeader();
  private readonly ents: EntitySnap[] = [];
  private spawnN = 0;
  private rosterDirty = false;
  /** Спит ли участок — по прошлой проверке (рассылка, когда меняется) */
  private readonly slept: boolean[] = Array.from({ length: FARM_PLOTS }, () => false);
  /** Части B1: помощь, Фургон, заказы, Древо (server/farm/systems.ts) */
  private readonly sys: FarmSystems;

  constructor(hooks: FarmHooks) {
    this.hooks = hooks;
    this.plots = new FarmPlots(hooks.seats());
    this.sys = new FarmSystems(this);
  }

  get humans(): number {
    return this.byClient.size;
  }

  now(): number {
    return this.hooks.now();
  }

  rng(): number {
    return randomInt(1 << 30) / (1 << 30);
  }

  /** Грубая проверка мест (точная — canEnter с pid в hub.enterFarm и в join) */
  hasSpace(): boolean {
    return this.humans < FARM_PLOTS;
  }

  canEnter(pid: number): boolean {
    return this.plots.canEnter(pid, this.now());
  }

  status(): FarmStatus {
    return { n: this.humans, max: FARM_PLOTS };
  }

  playerOf(c: Client): FarmPlayer | undefined {
    return this.byClient.get(c);
  }

  // ------------------------------------------------------------ вход и выход

  join(c: Client, _from: RoomKind | null): boolean {
    const prof = c.profile;
    if (!prof || c.ephemeral || this.byClient.has(c)) return false;
    const now = this.now();
    if (!this.plots.canEnter(prof.id, now)) return false;
    const plot = this.plots.enter(prof.id, now);
    if (plot < 0) return false;
    this.hooks.saveSeats(this.plots.save());
    const f = (prof.farm ??= emptyFarm(now));
    this.lazy(f, now);
    if (enterDay(f, now)) f.rep += REP_FIRST_ENTRY;
    this.hooks.dirty();
    const sp = FARM_LAYOUT.spawns[this.spawnN++ % FARM_LAYOUT.spawns.length];
    const state = makeState();
    state.x = sp.x;
    state.z = sp.z;
    state.grounded = 1;
    const p: FarmPlayer = {
      c, id: this.freeId(), state, inq: new InputQueue(), last: makeInput(), ev: makeEvents(), plot, selfReset: true,
      actTick: 0, acts: 0, fill: null, lastFill: -Infinity,
    };
    p.last.yaw = sp.yaw;
    this.byClient.set(c, p);
    const msg: FarmServerMsg = { t: 'farm', id: p.id, plot, now, plots: this.plotViews(), me: f, roster: this.roster() };
    c.sink.sendJson(msg);
    this.plotChanged(plot);
    this.rosterDirty = true;
    this.hooks.status?.(this.status());
    this.sys.join(p);
    return true;
  }

  leave(c: Client): void {
    const p = this.byClient.get(c);
    if (!p) return;
    this.byClient.delete(c);
    this.sys.leave(p);
    this.plots.leave(c.pid, this.now());
    this.hooks.saveSeats(this.plots.save());
    this.plotChanged(p.plot);
    this.rosterDirty = true;
    this.hooks.status?.(this.status());
  }

  onRename(c: Client): void {
    const p = this.byClient.get(c);
    if (!p) return;
    this.rosterDirty = true;
    this.plotChanged(p.plot);
  }

  outfitChanged(c: Client): void {
    if (this.byClient.has(c)) this.rosterDirty = true;
  }

  private freeId(): number {
    const used = new Set([...this.byClient.values()].map((p) => p.id));
    for (let i = 1; i < 251; i++) if (!used.has(i)) return i;
    return 250;
  }

  /** Всё ленивое при входе и перед действиями: сутки, колодец, свин */
  private lazy(f: FarmProgress, now: number): void {
    rollDay(f, now);
    wellTick(f, now);
    pigTick(f, now);
  }

  // ------------------------------------------------------------ вид для клиентов

  farmOfPid(pid: number): FarmProgress | undefined {
    return this.hooks.profileOf(pid)?.farm;
  }

  plotView(i: number): FarmPlotView {
    const seat = this.plots.seats[i];
    const prof = seat ? this.hooks.profileOf(seat.pid) : undefined;
    const f = prof?.farm;
    if (!seat || !prof || !f) return { i, pid: 0, nick: '', level: 0, sleeping: false, beds: [], pig: false, bees: false, compost: false };
    return {
      i, pid: seat.pid, nick: prof.nick, level: farmLevel(f.xp), sleeping: this.plots.sleeping(i, this.now()),
      beds: f.beds.map((b) => ({ c: b.crop, p: b.plantedAt, r: b.ripeAt, w: b.watered, h: b.helpers.length })),
      pig: !!f.built.pig, bees: f.built.bees, compost: f.built.compost,
    };
  }

  private plotViews(): FarmPlotView[] {
    return Array.from({ length: FARM_PLOTS }, (_, i) => this.plotView(i));
  }

  private roster(): FarmRosterRow[] {
    const out: FarmRosterRow[] = [];
    for (const p of this.byClient.values()) {
      const prof = p.c.profile;
      if (prof) out.push({ id: p.id, pid: prof.id, nick: prof.nick, level: prof.level, o: this.hooks.outfitOf(prof), plot: p.plot });
    }
    return out;
  }

  private broadcast(msg: FarmServerMsg): void {
    for (const p of this.byClient.values()) p.c.sink.sendJson(msg);
  }

  send(to: FarmPlayer | null, msg: FarmServerMsg): void {
    if (to) to.c.sink.sendJson(msg);
    else this.broadcast(msg);
  }

  // ------------------------------------------------------------ FarmCtx

  farm(p: FarmPlayer): FarmProgress {
    return (p.c.profile!.farm ??= emptyFarm(this.now()));
  }

  players(): Iterable<FarmPlayer> {
    return this.byClient.values();
  }

  byPid(pid: number): FarmPlayer | undefined {
    for (const p of this.byClient.values()) if (p.c.pid === pid) return p;
    return undefined;
  }

  sendMe(p: FarmPlayer): void {
    p.c.sink.sendJson({ t: 'farmMe', now: this.now(), me: this.farm(p) } satisfies FarmServerMsg);
  }

  plotChanged(plot: number): void {
    if (plot >= 0 && plot < FARM_PLOTS) this.broadcast({ t: 'farmPlot', plot: this.plotView(plot) });
  }

  ev(to: FarmPlayer | null, e: FarmEvent): void {
    const msg: FarmServerMsg = { t: 'farmEv', e: [e] };
    if (to) to.c.sink.sendJson(msg);
    else this.broadcast(msg);
  }

  fail(p: FarmPlayer, a: FarmAction, why: Extract<FarmEvent, { k: 'fail' }>['why']): void {
    this.ev(p, { k: 'fail', a, why });
  }

  xp(p: FarmPlayer, n: number, why: string): void {
    if (!(n > 0)) return;
    const levels = addFarmXp(this.farm(p), n);
    this.ev(p, { k: 'xp', n: Math.round(n), why });
    for (const lv of levels) grantLevel(this, p, lv);
    if (levels.length) this.plotChanged(p.plot);
  }

  credit(p: FarmPlayer, n: number): void {
    if (n > 0) this.hooks.credit(p.c, n);
  }

  spend(p: FarmPlayer, n: number): boolean {
    return n <= 0 || this.hooks.spend(p.c, n);
  }

  grantItem(p: FarmPlayer, id: string): boolean {
    return this.hooks.grantItem(p.c, id);
  }

  dirty(): void {
    this.hooks.dirty();
  }

  /** Для FarmSystems (boss.ts): хранение Древа и общий чат */
  bossLoad(): unknown {
    return this.hooks.boss?.();
  }

  bossSave(s: FarmBossState | null): void {
    this.hooks.saveBoss?.(s);
  }

  announce(text: string): void {
    this.hooks.announce?.(text);
  }

  // ------------------------------------------------------------ сообщения

  onInputs(c: Client, inputs: Input[], count: number): void {
    this.byClient.get(c)?.inq.push(inputs, count);
  }

  onMessage(c: Client, msg: ClientMsg): void {
    const p = this.byClient.get(c);
    if (!p || msg.t !== 'farm' || typeof (msg as { a?: unknown }).a !== 'string') return;
    const m = msg as FarmClientMsg;
    if (this.tick - p.actTick >= 60) { p.actTick = this.tick; p.acts = 0; }
    if (++p.acts > ACTIONS_PER_SEC) { this.fail(p, m.a, 'rate'); return; }
    const now = this.now();
    const f = this.farm(p);
    this.lazy(f, now);
    switch (m.a) {
      case 'plant': return this.onPlant(p, f, m, now);
      case 'water': return this.onWater(p, f, m, now);
      case 'harvest': return this.onHarvest(p, f, m, now);
      case 'sell': return this.onSell(p, f, m, now);
      case 'convert': return this.onConvert(p, f, m);
      case 'upgrade': return this.onUpgrade(p, f, m, now);
      case 'fillStart': return this.onFillStart(p, f, now);
      case 'fillEnd': return this.onFillEnd(p, f, m, now);
      case 'pig': return this.onPig(p, f, now);
      case 'tutorial': return this.onTutorial(p, f, m);
      case 'look': return this.onLook(p, f, m);
      case 'claimPlot': return this.onClaimPlot(p, m, now);
      case 'help': return this.sys.help(p, m);
      case 'van': return this.sys.van(p, m);
      case 'order': return this.sys.order(p, m);
      case 'cone': return this.sys.cone(p, m);
    }
  }

  /** Все грядки из списка — у себя на участке и в пределах клика (с запасом на задержку сети) */
  private reach(p: FarmPlayer, beds: unknown): beds is number[] {
    if (!Array.isArray(beds) || beds.length === 0 || beds.length > 9) return false;
    const s = p.state;
    return beds.every((b) => Number.isInteger(b) && b >= 0 && b < 8 && bedDist(p.plot, b, s.x, s.z) <= BED_CLICK_RANGE + 1.5);
  }

  private near(p: FarmPlayer, id: FarmObjectId): boolean {
    return nearUse(id, p.state.x, p.state.z, 1.5);
  }

  private tutorial(p: FarmPlayer, f: FarmProgress, ev: TutorialEvent): void {
    const r = tutorialEvent(f, ev);
    if (!r) return;
    this.ev(p, { k: 'tut', step: r.step, xp: r.xp, coins: r.coins });
    this.credit(p, r.coins);
    this.xp(p, r.xp, 'обучение');
  }

  private done(p: FarmPlayer, plotChanged: boolean): void {
    this.dirty();
    this.sendMe(p);
    if (plotChanged) this.plotChanged(p.plot);
  }

  private failed(p: FarmPlayer, a: FarmAction, r: { ok: false; why: FarmFail }): void {
    this.fail(p, a, r.why);
  }

  private onPlant(p: FarmPlayer, f: FarmProgress, m: Extract<FarmClientMsg, { a: 'plant' }>, now: number): void {
    if (!this.reach(p, m.beds) || typeof m.crop !== 'string') return this.fail(p, 'plant', 'far');
    const r = plant(f, m.beds, m.crop, now, (n) => this.spend(p, n));
    if (!r.ok) return this.failed(p, 'plant', r);
    this.ev(null, { k: 'plant', plot: p.plot, beds: r.beds, crop: m.crop, paid: r.paid });
    this.tutorial(p, f, 'plant');
    this.done(p, true);
  }

  private onWater(p: FarmPlayer, f: FarmProgress, m: Extract<FarmClientMsg, { a: 'water' }>, now: number): void {
    if (!this.reach(p, m.beds)) return this.fail(p, 'water', 'far');
    const r = water(f, m.beds, now);
    if (!r.ok) return this.failed(p, 'water', r);
    this.ev(null, { k: 'water', plot: p.plot, beds: r.beds, by: p.c.pid });
    this.sys.on(p, { k: 'water', beds: r.beds });
    this.tutorial(p, f, 'water');
    this.done(p, true);
  }

  private onHarvest(p: FarmPlayer, f: FarmProgress, m: Extract<FarmClientMsg, { a: 'harvest' }>, now: number): void {
    if (!this.reach(p, m.beds)) return this.fail(p, 'harvest', 'far');
    const r = harvest(f, m.beds, now, () => this.rng());
    if (!r.ok) return this.failed(p, 'harvest', r);
    const h = r.r;
    this.ev(null, { k: 'harvest', plot: p.plot, items: h.items, xp: h.xp, gx: h.generalXp, bagFull: h.bagFull });
    if (h.generalXp > 0) this.hooks.generalXp(p.c, h.generalXp);
    this.xp(p, h.xp, 'урожай');
    this.sys.on(p, { k: 'harvest', items: h.items, xp: h.xp });
    this.tutorial(p, f, 'harvest');
    this.done(p, true);
  }

  private onSell(p: FarmPlayer, f: FarmProgress, m: Extract<FarmClientMsg, { a: 'sell' }>, now: number): void {
    if (!this.near(p, 'grib')) return this.fail(p, 'sell', 'far');
    if (typeof m.item !== 'string') return this.fail(p, 'sell', 'item');
    const r = sell(f, m.item, m.n, now);
    if (!r.ok) return this.failed(p, 'sell', r);
    if (m.item === TRUFFLE) f.counters.truffleSold = (f.counters.truffleSold ?? 0) + r.n;
    this.credit(p, r.coins);
    this.ev(p, { k: 'sold', item: m.item, n: r.n, coins: r.coins });
    this.sys.on(p, { k: 'sold', item: m.item, n: r.n, coins: r.coins });
    this.tutorial(p, f, 'sell');
    this.done(p, false);
  }

  private onConvert(p: FarmPlayer, f: FarmProgress, m: Extract<FarmClientMsg, { a: 'convert' }>): void {
    if (!this.near(p, 'grib')) return this.fail(p, 'convert', 'far');
    const r = convert(f, m.res, m.n);
    if (!r.ok) return this.failed(p, 'convert', r);
    this.xp(p, r.xp, 'ресурсы');
    this.sys.on(p, { k: 'convert' });
    this.done(p, false);
  }

  private onUpgrade(p: FarmPlayer, f: FarmProgress, m: Extract<FarmClientMsg, { a: 'upgrade' }>, now: number): void {
    const r = upgrade(f, m.id, now, (n) => this.spend(p, n));
    if (!r.ok) return this.failed(p, 'upgrade', r);
    this.ev(p, { k: 'upgrade', id: r.u.id });
    this.sys.on(p, { k: 'upgrade', id: r.u.id });
    this.done(p, r.u.kind === 'bed' || r.u.kind === 'pig' || r.u.kind === 'bees' || r.u.kind === 'compost');
  }

  private onFillStart(p: FarmPlayer, f: FarmProgress, now: number): void {
    if (!nearTrough(p.state.x, p.state.z, 1.5)) return this.fail(p, 'fillStart', 'far');
    if (now - p.lastFill < WELL_TRY_MS) return this.fail(p, 'fillStart', 'rate');
    if (!wellTake(f, now)) return this.fail(p, 'fillStart', 'well');
    p.lastFill = now;
    p.fill = { seed: randomInt(1 << 30), at: now };
    this.ev(p, { k: 'fill', seed: p.fill.seed });
    this.done(p, false);
  }

  private onFillEnd(p: FarmPlayer, f: FarmProgress, m: Extract<FarmClientMsg, { a: 'fillEnd' }>, now: number): void {
    const fill = p.fill;
    if (!fill) return this.fail(p, 'fillEnd', 'well');
    p.fill = null;
    const s = Array.isArray(m.s) ? m.s.slice(0, WELL_MAX_SAMPLES).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)) : [];
    // закрыл окно, ни разу не наклонив ведро (отсчёты: [x, наклон, x, наклон…]) — набор колодца возвращается
    if (!s.some((v, i) => i % 2 === 1 && v > 0)) {
      f.well.sets = Math.min(WELL_SETS, f.well.sets + 1);
      this.ev(p, { k: 'filled', share: 0, add: 0 });
      return this.done(p, false);
    }
    const share = wellShare(fill.seed, s, now - fill.at);
    const add = wellFill(f, share);
    this.ev(p, { k: 'filled', share, add });
    this.tutorial(p, f, 'fill');
    this.done(p, false);
  }

  private onPig(p: FarmPlayer, f: FarmProgress, now: number): void {
    const pig = f.built.pig;
    if (!pig) return this.fail(p, 'pig', 'item');
    pigTick(f, now);
    const room = Math.max(0, bagCap(f) - bagUsed(f));
    const n = Math.min(pig.stored, room);
    if (n <= 0) return this.fail(p, 'pig', pig.stored > 0 ? 'bag' : 'empty');
    if (pig.stored >= PIG_STORE) pig.since = now;
    pig.stored -= n;
    f.bag[TRUFFLE] = (f.bag[TRUFFLE] ?? 0) + n;
    f.counters.truffles = (f.counters.truffles ?? 0) + n;
    this.sys.on(p, { k: 'pig' });
    this.done(p, false);
  }

  private onTutorial(p: FarmPlayer, f: FarmProgress, m: Extract<FarmClientMsg, { a: 'tutorial' }>): void {
    if (m.k === 'close' && f.tutorial >= 0 && f.tutorial < 6) f.tutorial = -1;
    else if (m.k === 'open' && f.tutorial < 0) f.tutorial = 0;
    else return;
    this.done(p, false);
  }

  private onLook(p: FarmPlayer, f: FarmProgress, m: Extract<FarmClientMsg, { a: 'look' }>): void {
    const kinds: Record<string, string> = { title: 'ti', frame: 'fr', can: 'tl', shovel: 'tl', fence: 'pl', decor: 'pl' };
    const kind = kinds[m.slot];
    if (!kind || typeof m.id !== 'string') return this.fail(p, 'look', 'item');
    if (m.id === '') delete f.look[m.slot];
    else {
      const d = FARM_DECOR.find((x) => x.id === m.id);
      if (!d || d.kind !== kind || !f.decor.includes(m.id)) return this.fail(p, 'look', 'item');
      f.look[m.slot] = m.id;
    }
    this.done(p, true);
  }

  private onClaimPlot(p: FarmPlayer, m: Extract<FarmClientMsg, { a: 'claimPlot' }>, now: number): void {
    const to = m.plot;
    if (!Number.isInteger(to) || to < 0 || to >= FARM_PLOTS) return this.fail(p, 'claimPlot', 'plot');
    const gate = plotToWorld(to, 0, FARM_LAYOUT.plotLocal.gate.z);
    if (Math.hypot(gate.x - p.state.x, gate.z - p.state.z) > PLOT_CLICK_RANGE + 1.5) return this.fail(p, 'claimPlot', 'far');
    const from = p.plot;
    if (!this.plots.move(p.c.pid, to, now)) return this.fail(p, 'claimPlot', 'plot');
    p.plot = to;
    this.hooks.saveSeats(this.plots.save());
    this.plotChanged(from);
    this.plotChanged(to);
    this.rosterDirty = true;
    this.sendMe(p);
  }

  // ------------------------------------------------------------ тик

  step(): void {
    this.tick++;
    for (const p of this.byClient.values()) this.stepPlayer(p);
    if (this.tick % SNAP_EVERY === 0) this.sendSnapshots();
    if (this.rosterDirty) {
      this.rosterDirty = false;
      this.broadcast({ t: 'farmRoster', list: this.roster() });
    }
    if (this.tick % 60 === 0) {
      const now = this.now();
      for (let i = 0; i < FARM_PLOTS; i++) {
        const s = this.plots.sleeping(i, now);
        if (s !== this.slept[i]) {
          this.slept[i] = s;
          this.plotChanged(i);
        }
      }
      this.sys.second(now);
    }
  }

  private stepPlayer(p: FarmPlayer): void {
    const q = p.inq;
    const n = q.due();
    for (let i = 0; i < n; i++) {
      const inp = q.shift();
      stepHeld(p.state, 0, inp, this.world, false, 0, p.ev);
      const last = p.last;
      last.seq = inp.seq;
      last.buttons = inp.buttons;
      last.yaw = inp.yaw;
      last.pitch = inp.pitch;
      last.viewTick = inp.viewTick;
    }
    if (n === 0 && ++q.starve > 8) {
      // ввода нет (вкладка свёрнута, лаг): идём по последнему, через 1,5 с — стоим
      const idle = p.last;
      const saved = idle.buttons;
      idle.buttons = q.starve > 90 ? 0 : saved & ~ONE_SHOT;
      stepHeld(p.state, 0, idle, this.world, false, 0, p.ev);
      idle.buttons = saved;
    }
    if (p.state.y < FALL_Y) {
      const sp = FARM_LAYOUT.spawns[0];
      Object.assign(p.state, makeState(), { x: sp.x, z: sp.z, grounded: 1 });
      p.selfReset = true;
    }
  }

  private sendSnapshots(): void {
    const list = this.ents;
    list.length = 0;
    for (const p of this.byClient.values()) {
      const s = p.state;
      let flags = E_ALIVE;
      if (s.grounded) flags |= E_GROUNDED;
      if (s.dashT > 0) flags |= E_DASH;
      list.push({ id: p.id, flags, x: s.x, y: s.y, z: s.z, yaw: p.last.yaw, pitch: p.last.pitch, hp: 0, armor: 0 });
    }
    const entities = encodeEntities(list);
    const h = this.header;
    h.tick = this.tick;
    for (const p of this.byClient.values()) {
      h.ack = p.inq.ack;
      h.queue = p.inq.length;
      h.flags = p.selfReset ? SNAP_SELF_RESET : 0;
      p.selfReset = false;
      p.c.sink.sendBinary(encodeSnapshot(h, p.state, entities));
    }
  }

  /** Для тестов и отладки: стадия грядки игрока */
  stageOf(c: Client, bed: number): number {
    const p = this.byClient.get(c);
    const b = p && this.farm(p).beds[bed];
    return b ? bedStage(b, this.now()) : -1;
  }
}
