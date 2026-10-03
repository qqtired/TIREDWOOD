// Игра «Крепость» на сервере: люди (тот же stepPlayer и маркер, что в пейнтболе), выстрел от третьего лица по зомби
// с откатом к тому, что видел стрелок, урон и отхил, смерть и появление на террасе, фазы (сбор → волна → передышка →
// … → итоги → снова сбор), колокол, лавка у стоек, краскомёты, лужи варенья, очки матча, жетоны по итогам (через хук),
// AFK, снимки 30 раз в секунду (хвост крепости — shared/fortnet.ts), состав и события. Всё, что даёт очки и жетоны, —
// только здесь.
import { EYE_HEIGHT, MAX_NAME, MAX_REWIND_TICKS, TICK_RATE } from '../../shared/constants.ts';
import { PB_AFK_TICKS } from '../../shared/economy.ts';
import {
  ANTIAIR_DMG, ANTIAIR_GROUND_DMG, ANTIAIR_PRICE, ANTIAIR_RANGE, BUY_ANTIAIR, BUY_CRYSTAL, BUY_FIX, BUY_GATE, BUY_JAM,
  BUY_MAGAZINE, BUY_TURRET, CRYSTAL_FIX, CRYSTAL_HP, CRYSTAL_PRICE, END_TICKS, FIX_HP, FIX_PRICE, FORT_MAGAZINE, MAGAZINE_PRICE,
  FORT_HP, FORT_MAX_ALIVE, FORT_MAX_HUMANS, FORT_REGEN_DELAY, FORT_REGEN_EVERY, FORT_RESPAWN_TICKS, FORT_SNAP_EVERY, FORT_TOP, FORT_WAVES, FT_BREAK,
  FT_END, FT_GATHER, FT_WAVE, GATE_HP, GATHER_TICKS, JAM_PRICE, JAM_R, JAM_SLOW, JAM_TICKS, LATE_PTS, NEWGATE_PRICE, READY_TICKS, START_PTS,
  TURRET_DMG, TURRET_EVERY, TURRET_PRICE, TURRET_RANGE, WAVE_PTS, ZK, type FortEvent, type FortPlayerRow, type FortResultRow,
  RALLY_TICKS, RALLY_COOLDOWN, RALLY_MITIGATION, Z_FLYER, fortBounty, type FortRunRec, type FortStatus, type FortWaveCard, type FtReward,
} from '../../shared/fort.ts';
import { EARLY_BONUS, EV_NONE, breakSecondsAfter, isBossWave, isSuperWave, waveTokens } from '../../shared/fortwaves.ts';
import { FM_EARLY } from '../../shared/fortnet.ts';
import { planWave, type LastEvent, type WavePlan } from './director.ts';
import { FortLedger, makeRun, settle, type FortRun, type SettleFinal } from './ledger.ts';
import { fortShopItems } from '../../shared/fortshop.ts';
import { afterFortWeapon, beforeFortWeapon } from '../../shared/fortweapon.ts';
import { FT_STRIDE, fortShotDir, nearestZombie, zombieHead } from '../../shared/fortaim.ts';
import { CHUTES, TURRET_MUZZLE, TURRET_SPOTS, buildFort, outsideFort, type FortMap } from '../../shared/fortmap.ts';
import { encodeFortTail, fortTailSize, makeFortTail, type ZombieSnap } from '../../shared/fortnet.ts';
import { hash32, makeRng } from '../../shared/math.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import type { Outfit } from '../../shared/outfit.ts';
import { E_ADS, E_ALIVE, E_DASH, E_FIRING, E_GROUNDED, E_RELOAD, SNAP_SELF_RESET, encodeEntities, encodeSnapshot, makeHeader, type EntitySnap } from '../../shared/protocol.ts';
import {
  BTN_ADS, BTN_DASH, BTN_FIRE, BTN_JUMP, BTN_RELOAD, BTN_SHOULDER, BTN_USE, MAG_SIZE, SHOT_RANGE, damageAt, makeEvents, makeInput, makeState,
  stepPlayer, type Input, type StepEvents,
} from '../../shared/sim.ts';
import { sanitizeName } from '../../shared/text.ts';
import { CollisionWorld, makeRayHit } from '../../shared/world.ts';
import { InputQueue } from '../inputs.ts';
import type { Sink } from '../paintball/game.ts';
import { Horde, type HordeHost, type HordeTarget, type Zombie } from './horde.ts';
import { devBossHp } from './kraken.ts';
import { FortNav } from './nav.ts';

export class FortPlayer {
  readonly id: number;
  name: string;
  readonly sink: Sink;
  readonly seed: number;
  readonly state = makeState();
  readonly ev: StepEvents = makeEvents();
  pid = 0;
  level = 1;
  outfit: Outfit;
  alive = false;
  hp = FORT_HP;
  hurtTick = -9999;
  respawnTick = 0;
  firingUntil = 0;
  /** Всё нажитое в этой игре — учёт по профилю (ledger.ts): ушёл и вернулся — получает обратно, а не новый бюджет */
  run: FortRun = makeRun(START_PTS);
  /** Очки матча (лавка), сбитые, сколько раз сбили его, очки за сбитых (для «лучшего защитника») — поля run */
  get pts(): number { return this.run.pts; }
  set pts(v: number) { this.run.pts = v; }
  get kills(): number { return this.run.kills; }
  set kills(v: number) { this.run.kills = v; }
  get deaths(): number { return this.run.deaths; }
  set deaths(v: number) { this.run.deaths = v; }
  get killPts(): number { return this.run.killPts; }
  set killPts(v: number) { this.run.killPts = v; }
  /** Отбитых волн с участием */
  get waves(): number { return this.run.waves; }
  set waves(v: number) { this.run.waves = v; }
  get magazine(): boolean { return this.run.magazine; }
  set magazine(v: boolean) { this.run.magazine = v; }
  /** «Был в крепости с начала этой волны» и вклад в неё */
  inWave = false;
  waveJoinTick = 0;
  waveContribution = 0;
  /** Ударил в колокол */
  ready = false;
  readonly inq = new InputQueue();
  readonly lastInput: Input = makeInput();
  selfReset = true;
  ping = 0;
  idleTicks = 0;
  afkSent = false;

  constructor(id: number, name: string, sink: Sink, seed: number, outfit: Outfit) {
    this.id = id;
    this.name = name;
    this.sink = sink;
    this.seed = seed;
    this.outfit = outfit;
  }
}

export interface FortHumanInfo {
  pid: number;
  nick: string;
  level?: number;
  outfit: Outfit;
}

export interface FortHooks {
  /** Итог игры тому, кто дождался итогов: строка таблицы, жетоны (null — ни одной волны), победа, сколько волн отбито */
  result?(p: FortPlayer, row: FortResultRow, reward: FtReward | null, win: boolean, wave: number): void;
  /** Человек 90 с ничего не нажимал */
  afk?(p: FortPlayer): void;
  /** Рекорды крепости (лучшие FORT_TOP забегов, по убыванию волн) и запись нового забега */
  top?(): readonly FortRunRec[];
  saveRun?(rec: FortRunRec): void;
  /** Свой лучший результат защитника (волн) — до этой выплаты */
  best?(p: FortPlayer): number;
}

interface Turret {
  owner: number;
  cd: number;
  aa: boolean;
}

/** Навигация считается один раз на процесс: карта у всех игр одна */
let navCache: FortNav | null = null;

export class FortGame implements HordeHost {
  readonly map: FortMap;
  readonly world: CollisionWorld;
  readonly horde: Horde;
  readonly players = new Map<number, FortPlayer>();
  readonly rng = makeRng(Date.now() & 0xffffffff);
  tick = 0;
  phase = FT_GATHER;
  phaseEnd = 0;
  /** Какая волна идёт (или была последней); сколько отбито в этой игре */
  wave = 0;
  cleared = 0;
  gate = GATE_HP;
  crystal = CRYSTAL_HP;
  rallyUntil = 0;
  rallyReady = 0;
  /** Зерно директора на эту игру, последнее событие, план идущей волны */
  seed = 1;
  lastEvent: LastEvent = { wave: -99, kind: EV_NONE };
  plan: WavePlan | null = null;
  /** Волну вызвали раньше (все в колокол в передышке): +10 % золота за неё */
  early = false;
  /** Карточка: в бою — идущей волны, в передышке и сборе — следующей */
  card: FortWaveCard | null = null;
  /** Разработка: /wave N в чате */
  debug = false;
  readonly turrets: Array<Turret | null> = TURRET_SPOTS.map(() => null);
  /** До какого тика лежит лужа на дороге под жёлобом (0 — нет) */
  readonly jams: number[] = CHUTES.map(() => 0);
  private readonly hooks: FortHooks;
  private events: FortEvent[] = [];
  private readonly targetList: HordeTarget[] = [];
  private readonly entityList: EntitySnap[] = [];
  private readonly zsnap: ZombieSnap[] = [];
  private readonly tail = makeFortTail();
  private readonly header = makeHeader();
  private readonly hit = makeRayHit();
  private readonly near = { t: 0 };
  private readonly pos = { x: 0, y: 0, z: 0 };
  private readonly tg = new Float64Array(FORT_MAX_ALIVE * FT_STRIDE);
  private readonly who: Zombie[] = [];
  private readonly dir = { dirX: 0, dirY: 0, dirZ: 0 };
  private readonly usedIds = new Set<number>();
  private rosterDirty = true;
  private rosterSentTick = -9999;
  private pendingAfk: FortPlayer[] = [];
  /** Ушедшие из идущей игры — по номеру профиля (вернутся — получат свой забег) */
  private readonly ledger = new FortLedger();

  constructor(hooks: FortHooks = {}) {
    this.hooks = hooks;
    this.map = buildFort();
    this.world = new CollisionWorld(this.map);
    navCache ??= new FortNav(this.map);
    this.horde = new Horde(navCache, this, makeRng(hash32(Date.now() & 0xffff, 77)));
  }

  get humanCount(): number {
    return this.players.size;
  }

  // ------------------------------------------------------------ вход и выход

  addHuman(info: FortHumanInfo, sink: Sink): FortPlayer | null {
    if (this.players.size >= FORT_MAX_HUMANS) return null;
    let id = -1;
    for (let i = 1; i < 250; i++) {
      if (!this.usedIds.has(i)) {
        id = i;
        break;
      }
    }
    if (id < 0) return null;
    // в пустую крепость — новая игра со сбора
    if (this.players.size === 0) this.newGame();
    this.usedIds.add(id);
    const p = new FortPlayer(id, this.uniqueName(sanitizeName(info.nick) || `Игрок${id}`), sink, hash32(id, Date.now() & 0xffff), info.outfit);
    p.pid = info.pid;
    p.level = info.level ?? 1;
    // Вернулся в ту же игру — свой забег целиком (стартовые очки — один раз за игру). Новенький — с очками за уже
    // отбитые волны, чтобы было с чем идти в лавку.
    const back = this.ledger.take(info.pid);
    p.run = back ?? makeRun(START_PTS + LATE_PTS * this.cleared);
    this.players.set(id, p);
    p.waveJoinTick = this.tick;
    // приветствие — строго первым, до снимков и событий
    sink.sendJson({ t: 'fort', id, tick: this.tick, seed: p.seed, phase: this.phase, phaseEnd: this.phaseEnd, wave: this.wave, players: this.roster(),
      ...(this.card ? { card: this.card } : {}) });
    this.spawn(p);
    if (this.phase === FT_WAVE && this.horde.raiseDefenders(this.players.size, this.tick)) {
      this.systemChat(`Орда усилена для ${this.horde.defenders} защитников · подкрепление через 3 с`);
    }
    this.rosterDirty = true;
    this.systemChat(back ? `${p.name} вернулся на стены` : `${p.name} поднимается на стены`);
    return p;
  }

  removePlayer(id: number): void {
    const p = this.players.get(id);
    if (!p) return;
    // жетоны за отбитые волны — сразу при выходе; забег — в книгу: вернётся в эту же игру — продолжит с ним
    this.payout(p, null, false);
    if (this.phase !== FT_END) this.ledger.stash(p.pid, p.run);
    this.players.delete(id);
    this.usedIds.delete(id);
    // Snapshot IDs can be reused by a new defender; ownership and prior damage belong to the departed session.
    for (const turret of this.turrets) if (turret?.owner === id) turret.owner = 0;
    for (const zombie of this.horde.zombies) zombie.damageBy.delete(id);
    this.rosterDirty = true;
    if (this.players.size > 0) this.systemChat(`${p.name} ушёл из крепости`);
  }

  private uniqueName(name: string): string {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 100; i++) {
      const n = `${name.slice(0, MAX_NAME - 2)}${i}`;
      if (!taken.has(n.toLowerCase())) return n;
    }
    return name;
  }

  // ------------------------------------------------------------ фазы

  /** Новая игра: ворота и кристалл целы, лавка пуста, у всех стартовые очки, сбор 25 с. */
  newGame(): void {
    this.horde.clear();
    this.ledger.clear();
    this.wave = 0;
    this.cleared = 0;
    this.seed = Math.floor(this.rng() * 0x7fffffff) + 1;
    this.lastEvent = { wave: -99, kind: EV_NONE };
    this.plan = null;
    this.early = false;
    this.gate = GATE_HP;
    this.world.setEnabled(this.map.gateBox, true);
    this.crystal = CRYSTAL_HP;
    this.rallyUntil = this.rallyReady = 0;
    this.turrets.fill(null);
    this.jams.fill(0);
    for (const p of this.players.values()) {
      p.run = makeRun(START_PTS);
      p.inWave = false;
      p.waveContribution = 0;
      this.spawn(p);
    }
    this.card = this.planFor(1).card;
    this.setPhase(FT_GATHER, this.tick + GATHER_TICKS);
  }

  private setPhase(phase: number, end: number): void {
    this.phase = phase;
    this.phaseEnd = end;
    for (const p of this.players.values()) p.ready = false;
    this.rosterDirty = true;
    this.broadcast({ t: 'fphase', phase, end, wave: this.wave, ...(this.card ? { card: this.card } : {}) });
  }

  /** План волны w для нынешнего числа защитников (директор: то же зерно — тот же план) */
  private planFor(w: number, humans = this.players.size): WavePlan {
    return planWave(w, Math.max(1, humans), this.seed, this.lastEvent);
  }

  private startWave(): void {
    this.wave++;
    this.rallyUntil = this.rallyReady = 0;
    const w = this.wave;
    const last = this.lastEvent;
    const plan = planWave(w, Math.max(1, this.players.size), this.seed, last);
    this.plan = plan;
    if (plan.event !== EV_NONE) this.lastEvent = { wave: w, kind: plan.event };
    this.horde.startWave(plan, this.tick, (n) => planWave(w, n, this.seed, last));
    for (let i = 0; i < this.jams.length; i++) if (this.jams[i] === -1) this.jams[i] = this.tick + JAM_TICKS;
    for (const p of this.players.values()) {
      p.inWave = true;
      p.waveJoinTick = this.tick;
      p.waveContribution = 0;
    }
    this.card = { ...plan.card, ...(this.early ? { early: true } : {}) };
    this.setPhase(FT_WAVE, this.tick);
    const boss = plan.boss >= 0 ? ` · 👑 ${ZK[plan.boss].name}${plan.bossTier ? ` ${roman(plan.bossTier + 1)}` : ''}` : '';
    this.systemChat(w === FORT_WAVES ? `🧟 Последняя волна — ${FORT_WAVES}-я! Держимся!` : `🧟 Волна ${w} · ${plan.card.title}${boss}`);
    if (this.early) this.systemChat(`🔔 Волну вызвали раньше: +${Math.round(EARLY_BONUS * 100)} % золота за неё`);
  }

  /** Множитель награды за сбитых в этой волне (вызвали раньше) */
  get goldMul(): number {
    return this.early ? 1 + EARLY_BONUS : 1;
  }

  private endWave(): void {
    this.cleared = this.wave;
    for (const p of this.players.values()) {
      if (p.inWave || p.waveContribution > 0 || this.tick - p.waveJoinTick >= 5 * TICK_RATE) {
        p.pts += WAVE_PTS;
        p.waves++;
        p.run.tokWaves += waveTokens(this.wave);
      }
      p.inWave = false;
    }
    if (this.wave >= FORT_WAVES) {
      this.finish(true);
      return;
    }
    // передышка: все вылечены, сбитые встают сразу, кто оказался за стенами — снова на террасе
    for (const p of this.players.values()) {
      if (!p.alive || outsideFort(p.state.x, p.state.y, p.state.z)) this.spawn(p);
      else p.hp = FORT_HP;
    }
    this.jams.fill(0);
    this.early = false;
    this.plan = null;
    const next = this.planFor(this.wave + 1);
    this.card = next.card;
    const sec = breakSecondsAfter(this.wave);
    this.setPhase(FT_BREAK, this.tick + sec * TICK_RATE);
    const ahead = isSuperWave(this.wave + 1) ? ` · ⚠ дальше супер-босс: ${next.card.title}!`
      : isBossWave(this.wave + 1) ? ` · ⚠ дальше босс: ${next.card.title}` : '';
    this.systemChat(`✅ Волна ${this.wave} отбита! +${WAVE_PTS} очков. Передышка ${sec} с — лавка открыта${ahead}`);
  }

  /**
   * Итоги: таблица, лучший защитник, рекорд крепости (новый — +15 🪙 каждому в итогах), остаток жетонов тем, кто
   * дождался (за волны — то, что ещё не платили), забег — в таблицу рекордов.
   */
  private finish(win: boolean): void {
    this.card = null;
    this.plan = null;
    this.setPhase(FT_END, this.tick + END_TICKS);
    let mvp: FortPlayer | null = null;
    if (this.players.size >= 2) {
      for (const p of this.players.values()) if (p.killPts > 0 && (!mvp || p.killPts > mvp.killPts)) mvp = p;
    }
    const before = this.hooks.top?.() ?? [];
    const prev = before[0]?.wave ?? 0;
    const record = this.cleared > prev;
    const rows: FortResultRow[] = [];
    for (const p of this.players.values()) rows.push(this.payout(p, { mvp: p === mvp, record, win }, win)!);
    rows.sort((a, b) => b.pts - a.pts || b.k - a.k);
    if (this.cleared > 0 && this.players.size > 0) {
      this.hooks.saveRun?.({ wave: this.cleared, names: [...this.players.values()].map((p) => p.name).slice(0, FORT_MAX_HUMANS), at: Date.now(), n: this.players.size });
    }
    const top = (this.hooks.top?.() ?? []).slice(0, FORT_TOP);
    this.broadcast({ t: 'fend', win, wave: this.cleared, mvp: mvp ? mvp.id : 0, rows, top: [...top], record, prev });
    this.systemChat(win ? `🏆 Крепость устояла! Все ${FORT_WAVES} волн отбиты`
      : `💥 Кристалл разбит на волне ${this.wave}${record && this.cleared > 0 ? ` · 🏆 новый рекорд крепости: ${this.cleared}!` : prev ? ` · рекорд крепости — ${prev}` : ''}. Новая игра — через несколько секунд`);
  }

  /**
   * Выплата по забегу (ledger.settle): при выходе — за отбитые волны и сбитых, что ещё не платили; в итогах — ещё
   * бонусы. Хук result считает игру в статистике профиля только при первой выплате (row.again). При выходе без
   * единой волны и сбитого — ничего (null).
   */
  private payout(p: FortPlayer, final: SettleFinal | null, win: boolean): FortResultRow | null {
    const run = p.run;
    const kNew = run.kills - run.paidKills;
    const reward = settle(run, final);
    if (!final && !reward && kNew <= 0) return null;
    const row: FortResultRow = { id: p.id, name: p.name, k: p.kills, d: p.deaths, pts: p.killPts, waves: p.waves, tokens: reward?.total ?? 0, again: run.payouts > 0, kNew,
      best: this.hooks.best?.(p) ?? 0 };
    run.paidKills = run.kills;
    run.payouts++;
    // в итогах — панель наград; при выходе — короткая надпись (игрок уже уходит на набережную)
    if (reward && final) p.sink.sendJson({ t: 'fortReward', ...reward });
    else if (reward) p.sink.sendJson({ t: 'toast', text: `🏰 Крепость: +${reward.total} 🪙 за отбитые волны (${p.waves}) и сбитых` });
    this.hooks.result?.(p, row, reward, win, this.cleared);
    return row;
  }

  // ------------------------------------------------------------ люди

  private spawn(p: FortPlayer): void {
    let best = this.map.spawns[0];
    let bestScore = -Infinity;
    for (const s of this.map.spawns) {
      let minD = 20;
      for (const q of this.players.values()) {
        if (q === p || !q.alive) continue;
        minD = Math.min(minD, Math.hypot(q.state.x - s.x, q.state.z - s.z));
      }
      const score = minD + this.rng() * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    const st = p.state;
    Object.assign(st, makeState());
    st.x = best.x;
    st.y = best.y;
    st.z = best.z;
    st.ammo = p.magazine ? FORT_MAGAZINE : MAG_SIZE;
    st.prevButtons = p.lastInput.buttons;
    p.alive = true;
    p.hp = FORT_HP;
    p.hurtTick = -9999;
    p.selfReset = true;
    this.events.push(['spawn', p.id, r2(st.x), r2(st.y), r2(st.z), r2(best.yaw)]);
  }

  onInputs(p: FortPlayer, inputs: Input[], count: number): void {
    p.inq.push(inputs, count);
  }

  private processHuman(p: FortPlayer): void {
    const q = p.inq;
    const n = q.due();
    for (let i = 0; i < n; i++) {
      const inp = q.shift();
      const last = p.lastInput;
      if (inp.buttons !== last.buttons || Math.abs(inp.yaw - last.yaw) > 1e-4 || Math.abs(inp.pitch - last.pitch) > 1e-4) p.idleTicks = 0;
      this.simulate(p, inp);
      last.seq = inp.seq;
      last.buttons = inp.buttons;
      last.yaw = inp.yaw;
      last.pitch = inp.pitch;
      last.viewTick = inp.viewTick;
    }
    if (n === 0) {
      q.starve++;
      // долго нет ввода (вкладка свернулась, лаг) — двигаем по последнему вводу без «разовых» кнопок
      if (q.starve > 8 && p.alive) {
        const idle = p.lastInput;
        const saved = idle.buttons;
        idle.buttons = saved & ~(BTN_FIRE | BTN_JUMP | BTN_DASH | BTN_RELOAD | BTN_USE);
        if (q.starve > 90) idle.buttons &= BTN_ADS | BTN_SHOULDER;
        this.simulate(p, idle);
        idle.buttons = saved;
      }
    }
    if (++p.idleTicks >= PB_AFK_TICKS && !p.afkSent) {
      p.afkSent = true;
      this.pendingAfk.push(p);
    }
  }

  private simulate(p: FortPlayer, inp: Input): void {
    if (!p.alive) {
      p.state.prevButtons = inp.buttons;
      return;
    }
    const extraReload = beforeFortWeapon(p.state, inp, p.magazine);
    stepPlayer(p.state, inp, this.world, true, p.seed, p.ev);
    afterFortWeapon(p.state, p.ev, p.magazine, extraReload);
    if (p.ev.fired) {
      p.firingUntil = this.tick + 8;
      this.fire(p, inp);
    }
    // провалился сквозь мир (не должно быть) — на террасу
    if (p.state.y < -5) this.spawn(p);
  }

  /**
   * Выстрел: зомби откатываются к тому, что видел стрелок (viewTick, не больше MAX_REWIND_TICKS); направление —
   * от камеры над плечом (shared/fortaim.ts). Друг в друга краска не летит.
   */
  private fire(p: FortPlayer, inp: Input): void {
    const s = p.state;
    let rewind = this.tick - inp.viewTick;
    if (!(rewind >= 0)) rewind = 0;
    if (rewind > MAX_REWIND_TICKS) rewind = MAX_REWIND_TICKS;
    const t = this.tick - rewind;
    const tg = this.tg;
    let n = 0;
    for (const z of this.horde.zombies) {
      if (!z.alive) continue;
      const pos = this.pos;
      if (rewind > 0) {
        if (!this.horde.sample(z, t, pos)) continue;
      } else {
        pos.x = z.x;
        pos.y = z.y;
        pos.z = z.z;
      }
      const o = n * FT_STRIDE;
      tg[o] = pos.x;
      tg[o + 1] = pos.y;
      tg[o + 2] = pos.z;
      tg[o + 3] = z.kind;
      this.who[n] = z;
      n++;
    }
    const side = (inp.buttons & BTN_SHOULDER) !== 0 ? -1 : 1;
    fortShotDir(s, p.ev.aimYaw, p.ev.aimPitch, p.ev.spread, p.seed, s.shots, side, (inp.buttons & BTN_ADS) !== 0, this.world, tg, n, this.dir);
    const dx = this.dir.dirX;
    const dy = this.dir.dirY;
    const dz = this.dir.dirZ;
    const ox = s.x;
    const oy = s.y + EYE_HEIGHT;
    const oz = s.z;
    let best = SHOT_RANGE;
    let kind = 2;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    if (this.world.raycast(ox, oy, oz, dx, dy, dz, SHOT_RANGE, this.hit, true)) {
      best = this.hit.t;
      kind = 0;
      nx = this.hit.nx;
      ny = this.hit.ny;
      nz = this.hit.nz;
    }
    const i = nearestZombie(ox, oy, oz, dx, dy, dz, best, tg, n, this.near);
    if (i >= 0) {
      best = this.near.t;
      kind = 1;
    }
    const ex = ox + dx * best;
    const ey = oy + dy * best;
    const ez = oz + dz * best;
    this.events.push(['shot', p.id, r2(ox), r2(oy), r2(oz), r2(ex), r2(ey), r2(ez), kind, nx, ny, nz]);
    if (i >= 0) {
      const z = this.who[i];
      const head = zombieHead(z.kind, ey, tg[i * FT_STRIDE + 1]);
      this.horde.damage(z, damageAt(best, head), p.id, head, ex, ey, ez, ox, oz);
    }
  }

  private down(p: FortPlayer, zid: number): void {
    p.alive = false;
    p.hp = 0;
    p.deaths++;
    p.respawnTick = this.tick + FORT_RESPAWN_TICKS;
    this.events.push(['pdown', p.id, zid]);
    this.rosterDirty = true;
  }

  /** Отхил: FORT_REGEN_DELAY без урона — по 1 HP раз в FORT_REGEN_EVERY тиков. */
  private regen(): void {
    for (const p of this.players.values()) {
      if (!p.alive || p.hp >= FORT_HP) continue;
      const since = this.tick - p.hurtTick - FORT_REGEN_DELAY;
      if (since >= 0 && since % FORT_REGEN_EVERY === 0) p.hp = Math.min(FORT_HP, Math.ceil(p.hp) + 1);
    }
  }

  // ------------------------------------------------------------ для орды (HordeHost)

  gateUp(): boolean {
    return this.gate > 0;
  }

  hitGate(dmg: number): void {
    if (this.gate <= 0) return;
    this.gate -= this.structureDamage(dmg);
    if (this.gate > 0) return;
    this.gate = 0;
    this.world.setEnabled(this.map.gateBox, false);
    this.events.push(['gate', 0, 0]);
    this.systemChat('🚪 Ворота пали! Зомби во дворе — к кристаллу!');
  }

  private structureDamage(dmg: number): number {
    return this.phase === FT_WAVE && this.rallyUntil > this.tick ? dmg * (1 - RALLY_MITIGATION) : dmg;
  }

  hitCrystal(dmg: number): void {
    this.crystal = Math.max(0, this.crystal - this.structureDamage(dmg));
  }

  targets(): readonly HordeTarget[] {
    return this.targetList;
  }

  hitPlayer(zid: number, pid: number, dmg: number): void {
    const p = this.players.get(pid);
    if (!p || !p.alive) return;
    p.hp -= dmg;
    p.hurtTick = this.tick;
    this.events.push(['phit', zid, pid, dmg]);
    if (p.hp <= 0.5) this.down(p, zid);
  }

  traceAttack(ox: number, oy: number, oz: number, tx: number, ty: number, tz: number, out: { x: number; y: number; z: number }): boolean {
    const dx = tx - ox;
    const dy = ty - oy;
    const dz = tz - oz;
    const d = Math.hypot(dx, dy, dz);
    out.x = tx;
    out.y = ty;
    out.z = tz;
    if (d < 1e-6 || !this.world.raycast(ox, oy, oz, dx / d, dy / d, dz / d, Math.max(0, d - 0.02), this.hit, true)) return false;
    out.x = ox + dx / d * this.hit.t;
    out.y = oy + dy / d * this.hit.t;
    out.z = oz + dz / d * this.hit.t;
    return true;
  }

  slow(x: number, z: number): number {
    for (let i = 0; i < CHUTES.length; i++) {
      if (this.jams[i] <= this.tick) continue;
      const c = CHUTES[i];
      if (Math.hypot(x - c.px, z - c.pz) < JAM_R) return JAM_SLOW;
    }
    return 1;
  }

  killed(z: Zombie, by: number): void {
    const p = by ? this.players.get(by) : undefined;
    const pts = Math.round(fortBounty(z.kind, z.tier, this.wave, z.crew) * this.goldMul);
    if (p) p.kills++;
    const team = [...this.players.values()];
    if (!team.length) return;
    // One bounty per enemy. 60% follows actual damage; 40% supports every current defender.
    const contributors = team.filter((q) => (z.damageBy.get(q.id) ?? 0) > 0);
    const effort = contributors.length ? Math.floor(pts * 0.6) : 0;
    const totalDamage = contributors.reduce((n, q) => n + z.damageBy.get(q.id)!, 0);
    let assigned = 0;
    for (const q of contributors) {
      const share = Math.floor(effort * z.damageBy.get(q.id)! / totalDamage);
      q.pts += share;
      q.killPts += share;
      q.waveContribution++;
      assigned += share;
    }
    // Rounding leftovers rotate by enemy ID, so the same seat never owns all small bounties.
    for (let i = 0; i < pts - assigned; i++) team[(z.id + i) % team.length].pts++;
    this.rosterDirty = true;
  }

  event(e: FortEvent): void {
    this.events.push(e);
  }

  private buildTargets(): void {
    const list = this.targetList;
    let n = 0;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const t = list[n] ?? (list[n] = { id: 0, x: 0, y: 0, z: 0, air: false });
      t.id = p.id;
      t.x = p.state.x;
      t.y = p.state.y;
      t.z = p.state.z;
      t.air = p.state.grounded === 0;
      n++;
    }
    list.length = n;
  }

  // ------------------------------------------------------------ краскомёты

  /** Каждый построенный краскомёт раз в TURRET_EVERY тиков бьёт ближайшего видимого зомби в TURRET_RANGE. */
  private stepTurrets(): void {
    for (let i = 0; i < this.turrets.length; i++) {
      const t = this.turrets[i];
      if (!t) continue;
      if (t.cd > 0) {
        t.cd--;
        continue;
      }
      const spot = TURRET_SPOTS[i];
      const ox = spot.x;
      const oy = spot.y + TURRET_MUZZLE;
      const oz = spot.z;
      let best: Zombie | null = null;
      let bd = Infinity;
      for (const z of this.horde.zombies) {
        if (!z.alive) continue;
        const k = ZK[z.kind];
        const tx = z.x - ox;
        const ty = z.y + k.hcy - oy;
        const tz = z.z - oz;
        const d = Math.hypot(tx, ty, tz);
        const sky = z.kind === Z_FLYER;
        if (d >= (t.aa && sky ? ANTIAIR_RANGE : TURRET_RANGE) || d < 1e-3) continue;
        const priority = t.aa && sky ? d - 100 : d;
        if (priority >= bd) continue;
        if (this.world.raycast(ox, oy, oz, tx / d, ty / d, tz / d, Math.max(0, d - k.hrx), this.hit, true)) continue;
        best = z;
        bd = priority;
      }
      if (!best) continue;
      t.cd = TURRET_EVERY;
      const ey = best.y + ZK[best.kind].hcy;
      this.events.push(['tshot', i, best.id, r2(best.x), r2(ey), r2(best.z)]);
      this.horde.damage(best, t.aa ? best.kind === Z_FLYER ? ANTIAIR_DMG : ANTIAIR_GROUND_DMG : TURRET_DMG,
        this.players.has(t.owner) ? t.owner : 0, false, best.x, ey, best.z, ox, oz);
    }
  }

  // ------------------------------------------------------------ лавка

  /** Existing use protocol: map station IDs or the fixed central-shop action IDs. */
  use(p: FortPlayer, id: number): void {
    if (this.players.get(p.id) !== p || !p.alive || !Number.isSafeInteger(id)) return;
    const calm = this.phase === FT_GATHER || this.phase === FT_BREAK;
    if (id >= 1000) {
      const shop = this.map.stations.find((st) => st.kind === 'shop')!;
      if (!this.atStation(p, shop)) return this.toast(p, 'Подойди к лавке на террасе');
      const item = fortShopItems(this.shopState(p)).find((i) => i.id === id);
      if (!item) return;
      if (item.reason) return this.toast(p, item.reason);
      this.purchase(p, item.buy, item.arg, calm);
      return;
    }
    const st = this.map.stations[id];
    if (!st || !this.atStation(p, st)) return;
    if (st.kind === 'shop') return;
    if (st.kind === 'bell') {
      if (this.phase === FT_WAVE) {
        if (this.tick < this.rallyReady) return this.toast(p, `Щит восстанавливается: ${Math.ceil((this.rallyReady - this.tick) / TICK_RATE)} с`);
        this.rallyUntil = this.tick + RALLY_TICKS;
        this.rallyReady = this.tick + RALLY_COOLDOWN;
        this.events.push(['bell', p.id]);
        this.systemChat('🔔 Щит на 8 с: ворота и кристалл получают вдвое меньше урона. Игроки уходят с меток!');
        return;
      }
      if (!calm) return;
      if (p.ready) return;
      p.ready = true;
      this.rosterDirty = true;
      this.events.push(['bell', p.id]);
      const all = [...this.players.values()].every((q) => q.ready);
      if (all) {
        this.phaseEnd = Math.min(this.phaseEnd, this.tick + READY_TICKS);
        // в передышке — «вызвали раньше»: +10 % золота за следующую волну всем
        if (this.phase === FT_BREAK && !this.early) {
          this.early = true;
          this.events.push(['early', Math.round(EARLY_BONUS * 100)]);
        }
        if (this.card) this.card = { ...this.card, ...(this.early ? { early: true } : {}) };
        this.broadcast({ t: 'fphase', phase: this.phase, end: this.phaseEnd, wave: this.wave, ...(this.card ? { card: this.card } : {}) });
      }
      return;
    }
    const buy = st.kind === 'gate' ? this.gate > 0 ? BUY_FIX : BUY_GATE
      : st.kind === 'crystal' ? BUY_CRYSTAL : st.kind === 'turret' ? BUY_TURRET : BUY_JAM;
    this.purchase(p, buy, st.arg, calm);
  }

  private atStation(p: FortPlayer, st: { x: number; y: number; z: number; r: number }): boolean {
    return Math.hypot(p.state.x - st.x, p.state.z - st.z) <= st.r + 0.6 && Math.abs(p.state.y - st.y) <= 1.6;
  }

  private shopState(p: FortPlayer) {
    let turrets = 0;
    let jams = 0;
    this.turrets.forEach((t, i) => { if (t) turrets |= (1 << i) | (t.aa ? 1 << (i + 4) : 0); });
    this.jams.forEach((t, i) => { if (t === -1 || t > this.tick) jams |= 1 << i; });
    return { phase: this.phase, pts: p.pts, gate: this.gate, crystal: this.crystal, turrets, jams, mag: p.magazine };
  }

  private purchase(p: FortPlayer, buy: number, arg: number, calm: boolean): void {
    if (this.phase === FT_END) return;
    switch (buy) {
      case BUY_FIX:
        if (this.gate <= 0 || this.gate >= GATE_HP) return this.toast(p, 'Ворота не нуждаются в починке');
        if (!this.pay(p, FIX_PRICE)) return;
        this.gate = Math.min(GATE_HP, this.gate + FIX_HP);
        this.events.push(['gate', 1, p.id]);
        break;
      case BUY_GATE:
        if (!calm || this.gate > 0) return this.toast(p, 'Новые ворота ставят в передышку после разрушения');
        if (!this.pay(p, NEWGATE_PRICE)) return;
        this.gate = GATE_HP;
        this.world.setEnabled(this.map.gateBox, true);
        this.events.push(['gate', 2, p.id]);
        break;
      case BUY_CRYSTAL:
        if (this.crystal >= CRYSTAL_HP) return this.toast(p, 'Кристалл цел');
        if (!this.pay(p, CRYSTAL_PRICE)) return;
        this.crystal = Math.min(CRYSTAL_HP, this.crystal + CRYSTAL_FIX);
        break;
      case BUY_TURRET:
        if (this.turrets[arg]) return this.toast(p, 'Краскомёт тут уже стоит');
        if (!this.pay(p, TURRET_PRICE)) return;
        this.turrets[arg] = { owner: p.id, cd: TURRET_EVERY, aa: false };
        this.systemChat(`🎯 ${p.name} ставит краскомёт на башню`);
        break;
      case BUY_JAM:
        if (this.jams[arg] === -1 || this.jams[arg] > this.tick) return this.toast(p, 'Варенье уже подготовлено');
        if (!this.pay(p, JAM_PRICE)) return;
        this.jams[arg] = calm ? -1 : this.tick + JAM_TICKS;
        break;
      case BUY_MAGAZINE:
        if (!calm || p.magazine) return;
        if (!this.pay(p, MAGAZINE_PRICE)) return;
        p.magazine = true;
        p.state.ammo = FORT_MAGAZINE;
        p.state.reloadT = 0;
        p.selfReset = true;
        break;
      case BUY_ANTIAIR: {
        const t = this.turrets[arg];
        if (!calm || !t || t.aa) return;
        if (!this.pay(p, ANTIAIR_PRICE)) return;
        t.aa = true;
        break;
      }
      default: return;
    }
    this.events.push(['buy', p.id, buy, arg]);
    this.rosterDirty = true;
  }

  private pay(p: FortPlayer, price: number): boolean {
    if (p.pts < price) {
      this.toast(p, `Нужно ${price} очков — у тебя ${p.pts}`);
      return false;
    }
    p.pts -= price;
    this.rosterDirty = true;
    return true;
  }

  private toast(p: FortPlayer, text: string): void {
    p.sink.sendJson({ t: 'toast', text });
  }

  // ------------------------------------------------------------ чат

  /** Команды из чата: /kill — снова на террасу (застрял за стенами), /help. */
  command(p: FortPlayer, text: string): void {
    const [cmd, arg] = text.slice(1).split(/\s+/);
    if (cmd.toLowerCase() === 'kill') {
      if (p.alive) this.down(p, 0);
      return;
    }
    if (this.debug && cmd.toLowerCase() === 'wave') {
      this.jumpTo(Number(arg));
      return;
    }
    if (this.debug && cmd.toLowerCase() === 'hp') {
      if (devBossHp(this.horde, Number(arg))) this.systemChat(`🛠 Разработка: боссам — ${Number(arg)} % HP`);
      return;
    }
    this.privateChat(p, 'Крепость: E у стоек — лавка (ворота, кристалл, краскомёты, варенье), колокол — «готов», Q — плечо, R — перезарядка, M — звук, Esc → «На набережную» — выйти. /kill — снова на террасу');
  }

  /** Разработка: передышка перед волной w (3 с), орда убрана; очки и жетоны не начисляются */
  jumpTo(w: number): void {
    if (!Number.isInteger(w) || w < 1 || w > FORT_WAVES || this.phase === FT_END) return;
    this.horde.clear();
    this.wave = w - 1;
    this.cleared = w - 1;
    this.early = false;
    this.plan = null;
    this.card = this.planFor(w).card;
    this.setPhase(FT_BREAK, this.tick + 3 * TICK_RATE);
    this.systemChat(`🛠 Разработка: дальше волна ${w}`);
  }

  systemChat(text: string): void {
    this.broadcast(sysLine(text));
  }

  private privateChat(p: FortPlayer, text: string): void {
    p.sink.sendJson(sysLine(text));
  }

  broadcast(msg: ServerMsg): void {
    for (const p of this.players.values()) p.sink.sendJson(msg);
  }

  // ------------------------------------------------------------ тик

  step(): void {
    this.tick++;
    const tick = this.tick;
    if ((this.phase === FT_GATHER || this.phase === FT_BREAK) && tick >= this.phaseEnd) this.startWave();
    else if (this.phase === FT_END && tick >= this.phaseEnd) this.newGame();

    for (const p of this.players.values()) {
      this.processHuman(p);
      if (!p.alive && tick >= p.respawnTick) this.spawn(p);
    }
    this.regen();

    if (this.phase === FT_WAVE) {
      this.buildTargets();
      this.horde.step();
      this.stepTurrets();
      if (this.crystal <= 0) this.finish(false);
      else if (this.horde.cleared) this.endWave();
    }

    if (tick % FORT_SNAP_EVERY === 0) this.sendSnapshots();
    if (this.rosterDirty && tick - this.rosterSentTick > 12) this.sendRoster();
    else if (tick - this.rosterSentTick > 2 * TICK_RATE) this.sendRoster();

    if (this.pendingAfk.length) {
      const list = this.pendingAfk;
      this.pendingAfk = [];
      for (const p of list) if (this.players.get(p.id) === p) this.hooks.afk?.(p);
    }
  }

  /** Для арки на набережной */
  status(): FortStatus {
    const names = [...this.players.values()].map((p) => p.name);
    const timed = this.phase === FT_GATHER || this.phase === FT_BREAK || this.phase === FT_END;
    return {
      phase: this.phase,
      wave: this.wave,
      humans: names.length,
      names: names.slice(0, 6),
      left: timed ? Math.max(0, Math.ceil((this.phaseEnd - this.tick) / TICK_RATE)) : 0,
    };
  }

  private sendSnapshots(): void {
    const list = this.entityList;
    list.length = 0;
    const tick = this.tick;
    for (const p of this.players.values()) {
      const s = p.state;
      let flags = 0;
      if (p.alive) flags |= E_ALIVE;
      if (s.grounded) flags |= E_GROUNDED;
      if (s.dashT > 0) flags |= E_DASH;
      if (s.reloadT > 0) flags |= E_RELOAD;
      if (p.lastInput.buttons & BTN_ADS) flags |= E_ADS;
      if (p.firingUntil > tick) flags |= E_FIRING;
      list.push({ id: p.id, flags, x: s.x, y: s.y, z: s.z, yaw: p.lastInput.yaw, pitch: p.lastInput.pitch, hp: Math.max(0, p.hp), armor: 0 });
    }
    const ents = encodeEntities(list);
    const nz = this.horde.snap(this.zsnap);
    const body = new Uint8Array(ents.length + fortTailSize(this.zsnap, nz, this.tail.ext?.length ?? 0));
    body.set(ents);
    const t = this.tail;
    t.gate = this.gate;
    t.crystal = this.crystal;
    t.defenders = this.phase === FT_WAVE ? this.horde.defenders : this.players.size;
    t.rally = this.phase === FT_WAVE ? Math.max(0, this.rallyUntil - this.tick) : 0;
    t.rallyCd = this.phase === FT_WAVE ? Math.max(0, this.rallyReady - this.tick) : 0;
    t.turrets = 0;
    for (let i = 0; i < this.turrets.length; i++) if (this.turrets[i]) t.turrets |= (1 << i) | (this.turrets[i]!.aa ? 1 << (i + 4) : 0);
    t.jams = 0;
    for (let i = 0; i < this.jams.length; i++) if (this.jams[i] === -1 || this.jams[i] > tick) t.jams |= 1 << i;
    t.left = this.phase === FT_WAVE ? this.horde.left : 0;
    t.wave = this.wave;
    t.event = this.phase === FT_WAVE ? this.plan?.event ?? EV_NONE : EV_NONE;
    t.mods = this.early ? FM_EARLY : 0;
    encodeFortTail(body, ents.length, t, this.zsnap, nz);
    const h = this.header;
    h.tick = tick;
    h.phase = this.phase;
    h.phaseEnd = this.phaseEnd;
    h.scoreA = this.wave;
    h.scoreB = this.cleared;
    h.pickups = 0;
    const evMsg: ServerMsg | null = this.events.length ? { t: 'fev', k: tick, e: this.events } : null;
    for (const p of this.players.values()) {
      h.ack = p.inq.ack;
      h.queue = p.inq.length;
      h.flags = p.selfReset ? SNAP_SELF_RESET : 0;
      p.selfReset = false;
      p.sink.sendBinary(encodeSnapshot(h, p.state, body));
      if (evMsg) p.sink.sendJson(evMsg);
    }
    this.events = [];
  }

  /** Состав изменился снаружи (наряд) — разослать в ближайший тик. */
  touchRoster(): void {
    this.rosterDirty = true;
  }

  roster(): FortPlayerRow[] {
    return [...this.players.values()].map((p) => ({
      id: p.id, pid: p.pid, level: p.level, name: p.name, o: p.outfit, pts: p.pts, k: p.kills, d: p.deaths, ready: p.ready, ping: Math.round(p.ping), mag: p.magazine,
    }));
  }

  private sendRoster(): void {
    this.rosterDirty = false;
    this.rosterSentTick = this.tick;
    this.broadcast({ t: 'froster', players: this.roster() });
  }
}

/** 2 → II, 3 → III … (круг босса) */
function roman(n: number): string {
  const r = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  return r[n] ?? String(n);
}

function sysLine(text: string): ServerMsg {
  return { t: 'chat', from: '', pid: 0, room: 'fort', team: -1, text, sys: true };
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
