// Игра «Крепость» на сервере: люди (тот же stepPlayer, что в пейнтболе, поверх — стволы крепости shared/fortgun.ts),
// выстрел от третьего лица по зомби с откатом к тому, что видел стрелок, урон и отхил, смерть и появление на террасе,
// фазы (сбор → волна → передышка → … → итоги → снова сбор), колокол, арсенал (золото, прокачка, стволы, гранаты,
// башни, ворота и кристалл — server/fort/arsenal.ts), жетоны по итогам (через хук), AFK, снимки 30 раз в секунду
// (хвост крепости — shared/fortnet.ts, за ним блок арсенала), состав и события. Всё, что даёт золото и жетоны, —
// только на сервере.
import { MAX_NAME, TICK_RATE } from '../../shared/constants.ts';
import { PB_AFK_TICKS } from '../../shared/economy.ts';
import {
  BREAK_TICKS, CRYSTAL_HP, END_TICKS, FORT_HP, FORT_MAX_HUMANS, FORT_REGEN_DELAY, FORT_REGEN_EVERY, FORT_RESPAWN_TICKS, FORT_SNAP_EVERY,
  FORT_WAVES, FT_BREAK, FT_END, FT_GATHER, FT_WAVE, GATE_HP, GATHER_TICKS, READY_TICKS, fortReward, type FortEvent, type FortPlayerRow,
  type FortResultRow, RALLY_TICKS, RALLY_COOLDOWN, RALLY_MITIGATION, waveRole, type FortStatus, type FtReward,
} from '../../shared/fort.ts';
import { waveBonus, type Loadout } from '../../shared/fortarsenal.ts';
import { BTN_FT_GRENADE, BTN_FT_HEAVY, armFort, fortAfter, fortBefore, gunInHands, makeFortStep } from '../../shared/fortgun.ts';
import { buildFort, outsideFort, type FortMap } from '../../shared/fortmap.ts';
import { encodeFortTail, fortTailSize, makeFortTail, type ZombieSnap } from '../../shared/fortnet.ts';
import { hash32, makeRng } from '../../shared/math.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import type { Outfit } from '../../shared/outfit.ts';
import { E_ADS, E_ALIVE, E_DASH, E_FIRING, E_GROUNDED, E_RELOAD, SNAP_SELF_RESET, encodeEntities, encodeSnapshot, makeHeader, type EntitySnap } from '../../shared/protocol.ts';
import {
  BTN_ADS, BTN_DASH, BTN_FIRE, BTN_JUMP, BTN_RELOAD, BTN_SHOULDER, BTN_USE, makeEvents, makeInput, makeState, stepPlayer, type Input, type StepEvents,
} from '../../shared/sim.ts';
import { sanitizeName } from '../../shared/text.ts';
import { CollisionWorld, makeRayHit } from '../../shared/world.ts';
import { InputQueue } from '../inputs.ts';
import type { Sink } from '../paintball/game.ts';
import { Arsenal, type FortRun } from './arsenal.ts';
import { Horde, type HordeHost, type HordeTarget, type Zombie } from './horde.ts';
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
  /** Забег по крепости (золото, прокачка, стволы — run.arsenal); вошёл заново в ту же игру — тот же забег */
  run: FortRun;
  /** Стволы и прокачка для шага (из run.arsenal), черновик шага, когда можно бросить следующую гранату */
  readonly load: Loadout = { heavy: 0, rate: 0, mag: 0 };
  readonly step = makeFortStep();
  grenReady = 0;
  /** Сбитые, сколько раз сбили его */
  kills = 0;
  deaths = 0;
  /** Отбитых волн с участием и «был в крепости с начала этой волны» */
  waves = 0;
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

  constructor(id: number, name: string, sink: Sink, seed: number, outfit: Outfit, run: FortRun) {
    this.id = id;
    this.name = name;
    this.sink = sink;
    this.seed = seed;
    this.outfit = outfit;
    this.run = run;
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
  /** Арсенал: золото и покупки, башни, гранаты, ступени ворот и кристалла */
  readonly arsenal: Arsenal;
  /**
   * Забеги этой игры по профилю (вышел и вернулся — забег тот же, ничего не выдаётся заново). Заглушка до кода агента
   * fort: он ведёт жизненный цикл p.run (создание, вход заново, выплата при выходе).
   */
  readonly runs = new Map<number, FortRun>();
  private readonly hooks: FortHooks;
  private events: FortEvent[] = [];
  private readonly targetList: HordeTarget[] = [];
  private readonly entityList: EntitySnap[] = [];
  private readonly zsnap: ZombieSnap[] = [];
  private readonly tail = makeFortTail();
  private readonly header = makeHeader();
  private readonly hit = makeRayHit();
  private readonly usedIds = new Set<number>();
  private rosterDirty = true;
  private rosterSentTick = -9999;
  private pendingAfk: FortPlayer[] = [];

  constructor(hooks: FortHooks = {}) {
    this.hooks = hooks;
    this.map = buildFort();
    this.world = new CollisionWorld(this.map);
    navCache ??= new FortNav(this.map);
    this.horde = new Horde(navCache, this, makeRng(hash32(Date.now() & 0xffff, 77)));
    this.arsenal = new Arsenal(this);
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
    // вошёл заново в ту же игру — тот же забег; опоздавшему — стартовые и 75 % от среднего заработка команды
    let run = this.runs.get(info.pid);
    if (!run) {
      run = this.arsenal.newRun(this.wave > 0);
      this.runs.set(info.pid, run);
    }
    const p = new FortPlayer(id, this.uniqueName(sanitizeName(info.nick) || `Игрок${id}`), sink, hash32(id, Date.now() & 0xffff), info.outfit, run);
    p.pid = info.pid;
    p.level = info.level ?? 1;
    this.arsenal.loadout(p, p.load);
    this.players.set(id, p);
    p.waveJoinTick = this.tick;
    // приветствие — строго первым, до снимков и событий
    sink.sendJson({ t: 'fort', id, tick: this.tick, seed: p.seed, phase: this.phase, phaseEnd: this.phaseEnd, wave: this.wave, players: this.roster() });
    this.spawn(p);
    if (this.phase === FT_WAVE && this.horde.raiseDefenders(this.players.size, this.tick)) {
      this.systemChat(`Орда усилена для ${this.horde.defenders} защитников · подкрепление через 3 с`);
    }
    this.rosterDirty = true;
    this.systemChat(`${p.name} поднимается на стены`);
    return p;
  }

  removePlayer(id: number): void {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.usedIds.delete(id);
    // Snapshot IDs can be reused by a new defender; prior damage belongs to the departed session.
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

  /** Новая игра: ворота и кристалл целы, башен нет, у всех стартовое золото и маркер, сбор 25 с. */
  newGame(): void {
    this.horde.clear();
    this.wave = 0;
    this.cleared = 0;
    this.gate = GATE_HP;
    this.world.setEnabled(this.map.gateBox, true);
    this.crystal = CRYSTAL_HP;
    this.rallyUntil = this.rallyReady = 0;
    this.arsenal.newGame();
    this.runs.clear();
    for (const p of this.players.values()) {
      p.run = this.arsenal.newRun(false);
      this.runs.set(p.pid, p.run);
      this.arsenal.loadout(p, p.load);
      p.kills = 0;
      p.deaths = 0;
      p.waves = 0;
      p.inWave = false;
      p.waveContribution = 0;
      p.grenReady = 0;
      this.spawn(p);
    }
    this.setPhase(FT_GATHER, this.tick + GATHER_TICKS);
    // новый арсенал — сразу, до снимка со сбросом предсказания
    this.flushRoster();
  }

  private setPhase(phase: number, end: number): void {
    this.phase = phase;
    this.phaseEnd = end;
    for (const p of this.players.values()) p.ready = false;
    this.rosterDirty = true;
    this.broadcast({ t: 'fphase', phase, end, wave: this.wave });
  }

  private startWave(): void {
    this.wave++;
    this.rallyUntil = this.rallyReady = 0;
    this.horde.startWave(this.wave, Math.max(1, this.players.size), this.tick);
    this.arsenal.onWaveStart();
    for (const p of this.players.values()) {
      p.inWave = true;
      p.waveJoinTick = this.tick;
      p.waveContribution = 0;
    }
    this.setPhase(FT_WAVE, this.tick);
    this.systemChat(this.wave === FORT_WAVES ? `🧟 Последняя волна — ${FORT_WAVES}-я! Держимся!` : `🧟 Волна ${this.wave} из ${FORT_WAVES}`);
    const role = waveRole(this.wave);
    this.systemChat(`${role.name}: ${role.hint}`);
    this.systemChat(`Орда: ${this.horde.defenders} защитников · ${this.horde.left} врагов. Колокол: щит строений на 8 с, перезарядка 30 с`);
  }

  private endWave(): void {
    this.cleared = this.wave;
    for (const p of this.players.values()) {
      if (p.inWave || p.waveContribution > 0 || this.tick - p.waveJoinTick >= 5 * TICK_RATE) p.waves++;
      p.inWave = false;
    }
    const clean = this.arsenal.downs === 0 && !this.arsenal.gateFell;
    this.arsenal.onWaveEnd();
    if (this.wave >= FORT_WAVES) {
      this.finish(true);
      return;
    }
    // передышка: все вылечены, сбитые встают сразу, кто оказался за стенами — снова на террасе
    for (const p of this.players.values()) {
      if (!p.alive || outsideFort(p.state.x, p.state.y, p.state.z)) this.spawn(p);
      else p.hp = FORT_HP;
    }
    this.setPhase(FT_BREAK, this.tick + BREAK_TICKS);
    this.systemChat(`✅ Волна ${this.wave} отбита! +${waveBonus(this.wave)} 💰 и общак волны${clean ? ' ×1,5 — чистая волна' : ''}`);
  }

  /** Итоги: таблица, лучший защитник, жетоны тем, кто дождался (решает fortReward). */
  private finish(win: boolean): void {
    this.setPhase(FT_END, this.tick + END_TICKS);
    let mvp: FortPlayer | null = null;
    if (this.players.size >= 2) {
      for (const p of this.players.values()) if (p.run.arsenal.killGold > 0 && (!mvp || p.run.arsenal.killGold > mvp.run.arsenal.killGold)) mvp = p;
    }
    const rows: FortResultRow[] = [];
    for (const p of this.players.values()) {
      const reward = fortReward({ waves: p.waves, kills: p.kills, win, mvp: p === mvp });
      const row: FortResultRow = { id: p.id, name: p.name, k: p.kills, d: p.deaths, pts: Math.round(p.run.arsenal.killGold), waves: p.waves, tokens: reward?.total ?? 0 };
      rows.push(row);
      if (reward) p.sink.sendJson({ t: 'fortReward', ...reward });
      this.hooks.result?.(p, row, reward, win, this.cleared);
    }
    rows.sort((a, b) => b.pts - a.pts || b.k - a.k);
    this.broadcast({ t: 'fend', win, wave: this.cleared, mvp: mvp ? mvp.id : 0, rows });
    this.systemChat(win ? `🏆 Крепость устояла! Все ${FORT_WAVES} волн отбиты` : `💥 Кристалл разбит на волне ${this.wave}. Новая игра — через несколько секунд`);
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
    armFort(st, p.load);
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
        // рука и зажатая G — как были: смена ствола и бросок гранаты — только по настоящему вводу
        if (q.starve > 90) idle.buttons &= BTN_ADS | BTN_SHOULDER | BTN_FT_HEAVY | BTN_FT_GRENADE;
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
    // стволы крепости поверх общего шага: движение — stepPlayer, оружие и лестницы — shared/fortgun.ts
    const m = fortBefore(p.step, p.state, inp, p.load);
    stepPlayer(p.state, m, this.world, true, p.seed, p.ev);
    fortAfter(p.step, p.state, p.ev, true, p.seed);
    if (p.ev.fired) {
      p.firingUntil = this.tick + 8;
      // выстрел: зомби откатываются к тому, что видел стрелок; урон, дробь, болт насквозь — арсенал
      this.arsenal.fire(p, inp);
    }
    if (p.step.ev.release) this.arsenal.throwGrenade(p, inp);
    // провалился сквозь мир (не должно быть) — на террасу
    if (p.state.y < -5) this.spawn(p);
  }

  private down(p: FortPlayer, zid: number): void {
    p.alive = false;
    p.hp = 0;
    p.deaths++;
    this.arsenal.onDown();
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
    this.arsenal.onGateFell();
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

  /** Лужи смолы (котлы на стенах) замедляют зомби */
  slow(x: number, z: number): number {
    return this.arsenal.slow(x, z);
  }

  killed(z: Zombie, by: number): void {
    const p = by ? this.players.get(by) : undefined;
    if (p) p.kills++;
    for (const q of this.players.values()) if ((z.damageBy.get(q.id) ?? 0) > 0) q.waveContribution++;
    // золото: 60 % — по урону (и вкладчикам башен), 40 % — в общак волны
    this.arsenal.onKill(z);
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
      const t = list[n] ?? (list[n] = { id: 0, x: 0, y: 0, z: 0 });
      t.id = p.id;
      t.x = p.state.x;
      t.y = p.state.y;
      t.z = p.state.z;
      n++;
    }
    list.length = n;
  }

  // ------------------------------------------------------------ стойки

  /**
   * {t:'use', id}: id < 1000 — номер стойки на карте (колокол; лавку, ворота, кристалл и башни клиент открывает
   * панелью сам), id ≥ 2000 — действие из панели арсенала (покупка — только рядом со своей стойкой).
   */
  use(p: FortPlayer, id: number): void {
    if (this.players.get(p.id) !== p || !p.alive || !Number.isSafeInteger(id)) return;
    const calm = this.phase === FT_GATHER || this.phase === FT_BREAK;
    if (id >= 1000) {
      this.arsenal.use(p, id);
      return;
    }
    const st = this.map.stations[id];
    if (!st || !this.atStation(p, st)) return;
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
        this.broadcast({ t: 'fphase', phase: this.phase, end: this.phaseEnd, wave: this.wave });
      }
      return;
    }
  }

  /** Стоит у стойки (как проверяет и клиент, с запасом 0,6 м) */
  atStation(p: FortPlayer, st: { x: number; y: number; z: number; r: number }): boolean {
    return Math.hypot(p.state.x - st.x, p.state.z - st.z) <= st.r + 0.6 && Math.abs(p.state.y - st.y) <= 1.6;
  }

  /** Новые ворота (куплены в передышку): полная прочность, створки снова в мире коллизий */
  raiseGate(hp: number): void {
    this.gate = hp;
    this.world.setEnabled(this.map.gateBox, true);
  }

  toast(p: FortPlayer, text: string): void {
    p.sink.sendJson({ t: 'toast', text });
  }

  // ------------------------------------------------------------ чат

  /** Команды из чата: /kill — снова на террасу (застрял за стенами), /help. */
  command(p: FortPlayer, text: string): void {
    const cmd = text.slice(1).split(/\s+/)[0].toLowerCase();
    if (cmd === 'kill') {
      if (p.alive) this.down(p, 0);
      return;
    }
    this.privateChat(p, 'Крепость: E у прилавка — лавка (1–9 — купить), E у ворот, кристалла и мест башен на стенах — их панель, 1/2 или колесо — маркер или тяжёлый ствол, G — граната (держи — дуга), лестницы — W лицом к стене, колокол — «готов», Q — плечо, R — перезарядка, M — звук. /kill — снова на террасу');
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
    }
    // гранаты летят всегда, башни бьют в волну
    this.arsenal.step();
    if (this.phase === FT_WAVE) {
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
      // байт armor в крепости не нужен под броню — в нём ствол в руках (0 маркер, 1 дробовик, 2 арбалет, 3 пулемёт)
      list.push({ id: p.id, flags, x: s.x, y: s.y, z: s.z, yaw: p.lastInput.yaw, pitch: p.lastInput.pitch, hp: Math.max(0, p.hp), armor: gunInHands(s, p.load) });
    }
    const ents = encodeEntities(list);
    const nz = this.horde.snap(this.zsnap);
    const body = new Uint8Array(ents.length + fortTailSize(nz) + Arsenal.tailBytes);
    body.set(ents);
    const t = this.tail;
    t.gate = this.gate;
    t.crystal = this.crystal;
    t.defenders = this.phase === FT_WAVE ? this.horde.defenders : this.players.size;
    t.rally = this.phase === FT_WAVE ? Math.max(0, this.rallyUntil - this.tick) : 0;
    t.rallyCd = this.phase === FT_WAVE ? Math.max(0, this.rallyReady - this.tick) : 0;
    // старые краскомёты и варенье ушли: башни и смола — в блоке арсенала после зомби
    t.turrets = 0;
    t.jams = 0;
    t.left = this.phase === FT_WAVE ? this.horde.left : 0;
    const end = encodeFortTail(body, ents.length, t, this.zsnap, nz);
    this.arsenal.encodeTail(body, end);
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

  /** Состав изменился снаружи (наряд, золото) — разослать в ближайший тик. */
  touchRoster(): void {
    this.rosterDirty = true;
  }

  /**
   * Состав — сейчас же: покупка сменила ствол или прокачку. Уходит раньше снимка со сбросом предсказания, поэтому
   * клиент переигрывает свои входы уже с новым арсеналом.
   */
  flushRoster(): void {
    for (const p of this.players.values()) this.arsenal.loadout(p, p.load);
    this.sendRoster();
  }

  roster(): FortPlayerRow[] {
    return [...this.players.values()].map((p) => ({
      id: p.id, pid: p.pid, level: p.level, name: p.name, o: p.outfit, pts: Math.floor(p.run.arsenal.gold), k: p.kills, d: p.deaths, ready: p.ready,
      ping: Math.round(p.ping), ar: this.arsenal.row(p),
    }));
  }

  private sendRoster(): void {
    this.rosterDirty = false;
    this.rosterSentTick = this.tick;
    this.broadcast({ t: 'froster', players: this.roster() });
  }
}

function sysLine(text: string): ServerMsg {
  return { t: 'chat', from: '', pid: 0, room: 'fort', team: -1, text, sys: true };
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
