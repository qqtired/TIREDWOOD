// Игровая логика сервера: игроки, раунды, стрельба, автомат с бонусами, отхил, AWP на кресте, чат.
import {
  ARMOR_ABSORB, ASSIST_WINDOW_TICKS, AWP_RADIUS, AWP_RESPAWN_TICKS, BOT_NAMES, BASE_HEALTH, DROWN_Y, END_TICKS, EYE_HEIGHT, HEADSHOT_Y,
  HITBOX_CY, HITBOX_RX, HITBOX_RY, JAM_HEAL, JAM_RADIUS, JAM_RESPAWN_TICKS, MAX_HUMANS, MAX_NAME, MAX_REWIND_TICKS, PHASE_END, PHASE_PLAY,
  PHASE_WARMUP, REGEN_DELAY_TICKS, REGEN_PER_SEC, RESPAWN_TICKS, ROUND_TICKS, SCORE_LIMIT, SPAWN_PROTECT_TICKS, TEAM_NAMES, TICK_RATE,
  WARMUP_TICKS,
} from '../../shared/constants.ts';
import { tpsShotDir } from '../../shared/aim.ts';
import { PB_AFK_TICKS, paintballReward, type PbReward } from '../../shared/economy.ts';
import { buildPier } from '../../shared/maps/pier.ts';
import type { GameMap } from '../../shared/maps/types.ts';
import { hash32, makeRng } from '../../shared/math.ts';
import { randomOutfit, type Outfit } from '../../shared/outfit.ts';
import {
  AWP_LYING, E_ADS, E_ALIVE, E_DASH, E_FIRING, E_GROUNDED, E_PROTECTED, E_RELOAD, E_TEAM, PB_TAIL_BYTES, SNAP_SELF_RESET, encodeEntities,
  encodeSnapshot, makeHeader, type EntitySnap,
} from '../../shared/protocol.ts';
import {
  SLOT_ARMOR, SLOT_CHERRY, SLOT_DAMAGE, SLOT_HP, SLOT_SYMBOLS, type GameEvent, type PbStatus, type RosterEntry, type ServerMsg,
  type SlotBonus,
} from '../../shared/messages.ts';
import {
  AWP_SHOTS, BTN_ADS, BTN_DASH, BTN_FIRE, BTN_JUMP, BTN_RELOAD, BTN_SHOULDER, BTN_USE, MAG_SIZE, SHOT_RANGE, damageAt, makeEvents, makeInput,
  makeState, stepPlayer, type Input, type PlayerState, type StepEvents,
} from '../../shared/sim.ts';
import { sanitizeName } from '../../shared/text.ts';
import { CollisionWorld, makeRayHit, rayEllipsoid } from '../../shared/world.ts';
import { InputQueue } from '../inputs.ts';
import { BotBrain, type Skill } from './bot.ts';
import { History } from './lagcomp.ts';
import { NavGrid } from './nav.ts';

export interface Sink {
  sendBinary(data: Uint8Array): void;
  sendJson(msg: ServerMsg): void;
  close(code: number, reason: string): void;
}

export class Player {
  readonly id: number;
  name: string;
  team: 0 | 1;
  readonly sink: Sink | null;
  bot: BotBrain | null = null;
  readonly seed: number;
  readonly state: PlayerState = makeState();
  readonly ev: StepEvents = makeEvents();
  alive = false;
  hp = BASE_HEALTH;
  maxHp = BASE_HEALTH;
  armor = 0;
  dmgMult = 1;
  reels: number[] = [];
  bonus: SlotBonus | null = null;
  kills = 0;
  deaths = 0;
  assists = 0;
  streak = 0;
  respawnTick = 0;
  protectUntil = 0;
  firingUntil = 0;
  lastAttacker = 0;
  lastAttackTick = -9999;
  /** Когда последний раз терял здоровье: через REGEN_DELAY_TICKS без урона начинается отхил */
  hurtTick = -9999;
  readonly damageLog = new Map<number, number>();
  // ввод
  readonly inq = new InputQueue();
  readonly lastInput: Input = makeInput();
  selfReset = true;
  ping = 0;
  joinedTick = 0;
  /** Профиль человека (0 — бот) */
  pid = 0;
  level = 1;
  outfit: Outfit;
  /** Тиков в фазе боя в этом раунде — награда только за отыгранную минуту */
  playTicks = 0;
  /** Тиков подряд без нажатий и поворотов */
  idleTicks = 0;
  afkSent = false;

  constructor(id: number, name: string, team: 0 | 1, sink: Sink | null, seed: number, outfit: Outfit) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.sink = sink;
    this.seed = seed;
    this.outfit = outfit;
  }

  get isBot(): boolean {
    return this.bot !== null;
  }
}

interface JamJar {
  x: number;
  y: number;
  z: number;
  available: boolean;
  respawnAt: number;
}

/** Снайперская AWP: лежит на кресте, у кого-то в руках или ждёт возвращения. */
export interface AwpSpot {
  x: number;
  y: number;
  z: number;
  /** Лежит на месте — можно подобрать */
  lying: boolean;
  holder: Player | null;
  /** Когда вернётся на крест (пока не лежит и ни у кого не в руках) */
  respawnAt: number;
}

/** Отхил: по 1 HP раз в столько тиков */
const REGEN_EVERY = Math.round(TICK_RATE / REGEN_PER_SEC);

export interface HumanInfo {
  pid: number;
  nick: string;
  level?: number;
  outfit: Outfit;
}

export interface GameHooks {
  /** Итог раунда для человека, отыгравшего минуту: жетоны и статистика */
  roundEnd?(p: Player, r: PbReward, won: boolean, mvp: boolean): void;
  /** Человек 90 с ничего не нажимал */
  afk?(p: Player): void;
}

export class Game {
  readonly map: GameMap;
  readonly world: CollisionWorld;
  readonly nav: NavGrid;
  readonly history = new History();
  readonly players = new Map<number, Player>();
  readonly rng = makeRng(Date.now() & 0xffffffff);
  tick = 0;
  phase = PHASE_WARMUP;
  phaseEnd = 0;
  readonly scores: [number, number] = [0, 0];
  botsPerTeam = 4;
  botSkill: Skill = 'normal';
  readonly jars: JamJar[];
  /** Снайперская AWP на кресте (null — на карте её нет) */
  readonly awp: AwpSpot | null;
  private events: GameEvent[] = [];
  private rosterDirty = true;
  private rosterSentTick = -9999;
  private restartReadyTick = 0;
  private delayedChat: Array<{ at: number; msg: ServerMsg }> = [];
  private readonly entityList: EntitySnap[] = [];
  private readonly header = makeHeader();
  private readonly tmpPos = { x: 0, y: 0, z: 0 };
  private readonly hit = makeRayHit();
  private botNameIdx = 0;
  private usedIds = new Set<number>();
  private roundStartedOnce = false;
  private readonly hooks: GameHooks;
  private readonly targets = new Float64Array(3 * 256);
  private readonly targetPlayers: Player[] = [];
  private readonly dir = { dirX: 0, dirY: 0, dirZ: 0 };
  private pendingAfk: Player[] = [];

  constructor(hooks: GameHooks = {}) {
    this.hooks = hooks;
    this.map = buildPier();
    this.world = new CollisionWorld(this.map);
    this.nav = new NavGrid(this.map, this.world);
    this.jars = this.map.pickups.map((p) => ({ x: p.x, y: p.y, z: p.z, available: true, respawnAt: 0 }));
    const a = this.map.awp;
    this.awp = a ? { x: a.x, y: a.y, z: a.z, lying: true, holder: null, respawnAt: 0 } : null;
  }

  get humanCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (!p.isBot) n++;
    return n;
  }

  // ------------------------------------------------------------ вход/выход

  addHuman(info: HumanInfo, sink: Sink): Player | null {
    if (this.humanCount >= MAX_HUMANS) return null;
    const id = this.allocId();
    if (id < 0) return null;
    const name = this.uniqueName(sanitizeName(info.nick) || `Игрок${id}`);
    const team = this.pickTeamForHuman();
    const p = new Player(id, name, team, sink, hash32(id, Date.now() & 0xffff), info.outfit);
    p.pid = info.pid;
    p.level = info.level ?? 1;
    p.joinedTick = this.tick;
    this.players.set(id, p);
    // приветствие — строго первым сообщением, до снимков и событий
    sink.sendJson({
      t: 'welcome', id, tick: this.tick, team, seed: p.seed, phase: this.phase, phaseEnd: this.phaseEnd,
      roster: this.roster(), botSkill: this.botSkill,
    });
    if (!this.roundStartedOnce || this.humanCount === 1) {
      // Первый живой человек — начинаем свежий раунд
      this.balanceBots();
      this.startWarmup(true);
    } else {
      this.balanceBots();
      this.spawnPlayer(p);
      // опоздавшим автомат крутится сам — чтобы были с бонусами, как все
      if (this.phase !== PHASE_WARMUP) this.pullSlot(p, true);
    }
    this.rosterDirty = true;
    this.systemChat(`${name} заходит за ${TEAM_NAMES[team] === 'Черника' ? 'Чернику' : 'Мандарин'}`);
    return p;
  }

  removePlayer(id: number): void {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.usedIds.delete(id);
    if (!p.isBot) {
      this.systemChat(`${p.name} вышел`);
      this.balanceBots();
    }
    this.rosterDirty = true;
  }

  private allocId(): number {
    for (let i = 1; i < 250; i++) {
      if (!this.usedIds.has(i)) {
        this.usedIds.add(i);
        return i;
      }
    }
    return -1;
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

  private pickTeamForHuman(): 0 | 1 {
    const h = [0, 0];
    for (const p of this.players.values()) if (!p.isBot) h[p.team]++;
    if (h[0] !== h[1]) return h[0] < h[1] ? 0 : 1;
    return this.scores[0] <= this.scores[1] ? 0 : 1;
  }

  /** Добиваем команды ботами до botsPerTeam (или до размера большей команды людей). */
  balanceBots(): void {
    const humans = [0, 0];
    const bots: Player[][] = [[], []];
    for (const p of this.players.values()) {
      if (p.isBot) bots[p.team].push(p);
      else humans[p.team]++;
    }
    const target = this.botsPerTeam === 0 ? 0 : Math.max(this.botsPerTeam, humans[0], humans[1]);
    for (const team of [0, 1] as const) {
      const need = Math.max(0, target - humans[team]);
      while (bots[team].length > need) {
        const b = bots[team].pop()!;
        this.players.delete(b.id);
        this.usedIds.delete(b.id);
        this.rosterDirty = true;
      }
      while (bots[team].length < need) {
        const b = this.addBot(team);
        if (!b) break;
        bots[team].push(b);
      }
    }
  }

  private addBot(team: 0 | 1): Player | null {
    const id = this.allocId();
    if (id < 0) return null;
    const taken = new Set([...this.players.values()].map((p) => p.name));
    let name = BOT_NAMES[this.botNameIdx++ % BOT_NAMES.length];
    for (let i = 0; i < BOT_NAMES.length && taken.has(name); i++) name = BOT_NAMES[this.botNameIdx++ % BOT_NAMES.length];
    if (taken.has(name)) name = `${name}${id}`;
    const p = new Player(id, name, team, null, hash32(id, 777), randomOutfit(hash32(id, 99)));
    p.bot = new BotBrain(p, this, this.botSkill, hash32(id, this.tick));
    this.players.set(id, p);
    this.rosterDirty = true;
    if (this.phase === PHASE_WARMUP) p.bot.schedulePull(this.tick, this.phaseEnd);
    this.spawnPlayer(p);
    return p;
  }

  // ------------------------------------------------------------ раунды

  startWarmup(fresh: boolean): void {
    this.roundStartedOnce = true;
    this.phase = PHASE_WARMUP;
    this.phaseEnd = this.tick + WARMUP_TICKS;
    this.scores[0] = 0;
    this.scores[1] = 0;
    for (const j of this.jars) {
      j.available = true;
      j.respawnAt = 0;
    }
    this.resetAwp();
    for (const p of this.players.values()) {
      p.kills = 0;
      p.deaths = 0;
      p.assists = 0;
      p.streak = 0;
      p.playTicks = 0;
      p.reels = [];
      p.bonus = null;
      p.maxHp = BASE_HEALTH;
      p.dmgMult = 1;
      p.armor = 0;
      p.damageLog.clear();
      this.spawnPlayer(p);
      p.bot?.schedulePull(this.tick, this.phaseEnd);
    }
    this.rosterDirty = true;
    this.broadcast({ t: 'round', phase: this.phase, end: this.phaseEnd, scores: [0, 0], winner: -1, mvp: 0 });
    if (!fresh) this.systemChat('Новый раунд! Дёргай рычаг автомата 🎰');
  }

  private startPlay(): void {
    this.phase = PHASE_PLAY;
    this.phaseEnd = this.tick + ROUND_TICKS;
    for (const p of this.players.values()) {
      if (p.reels.length === 0) this.pullSlot(p, true);
    }
    this.broadcast({ t: 'round', phase: this.phase, end: this.phaseEnd, scores: [this.scores[0], this.scores[1]], winner: -1, mvp: 0 });
    this.systemChat('Бой! Первые до ' + SCORE_LIMIT + ' побеждают');
  }

  private endRound(winner: number): void {
    this.phase = PHASE_END;
    this.phaseEnd = this.tick + END_TICKS;
    // AWP — обратно на крест: у того, у кого была, снова маркер
    this.resetAwp();
    let mvp: Player | null = null;
    for (const p of this.players.values()) {
      if (!mvp || p.kills > mvp.kills || (p.kills === mvp.kills && (p.deaths < mvp.deaths || (p.deaths === mvp.deaths && p.assists > mvp.assists)))) {
        mvp = p;
      }
    }
    this.broadcast({ t: 'round', phase: this.phase, end: this.phaseEnd, scores: [this.scores[0], this.scores[1]], winner, mvp: mvp ? mvp.id : 0 });
    const w = winner < 0 ? 'Ничья!' : `Победа: ${TEAM_NAMES[winner]}!`;
    this.systemChat(`${w} Лучший — ${mvp ? mvp.name : '—'}`);
    this.rosterDirty = true;
    // Жетоны людям, отыгравшим минуту боя (если лучший — бот, бонус за лучшего не получает никто)
    for (const p of this.players.values()) {
      if (p.isBot || !p.sink) continue;
      const won = winner >= 0 && p.team === winner;
      const isMvp = mvp === p;
      const r = paintballReward({ playTicks: p.playTicks, kills: p.kills, won, mvp: isMvp });
      if (!r) continue;
      p.sink.sendJson({ t: 'pbReward', ...r });
      this.hooks.roundEnd?.(p, r, won, isMvp);
    }
  }

  restartRound(by: Player | null): boolean {
    if (this.tick < this.restartReadyTick) return false;
    this.restartReadyTick = this.tick + 3 * TICK_RATE;
    if (by) this.systemChat(`${by.name} перезапускает раунд`);
    this.startWarmup(false);
    return true;
  }

  // ------------------------------------------------------------ спавн

  spawnPlayer(p: Player): void {
    const spawns = this.map.spawns.filter((s) => s.team === p.team);
    let best = spawns[0];
    let bestScore = -Infinity;
    for (const s of spawns) {
      let minD = 60;
      let seen = false;
      for (const q of this.players.values()) {
        if (q === p || !q.alive) continue;
        const d = Math.hypot(q.state.x - s.x, q.state.z - s.z);
        if (q.team === p.team) {
          if (d < 1.2) minD = Math.min(minD, 0); // не спавнимся друг в друге
          continue;
        }
        if (d < minD) minD = d;
        if (d < 45 && !seen) {
          const ex = q.state.x;
          const ey = q.state.y + EYE_HEIGHT;
          const ez = q.state.z;
          const dx = s.x - ex;
          const dy = s.y + 1.2 - ey;
          const dz = s.z - ez;
          const len = Math.hypot(dx, dy, dz);
          if (!this.world.raycast(ex, ey, ez, dx / len, dy / len, dz / len, len, this.hit, true)) seen = true;
        }
      }
      const score = minD + this.rng() * 6 - (seen ? 25 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    const st = p.state;
    Object.assign(st, makeState());
    st.x = best.x + (this.rng() - 0.5) * 0.6;
    st.y = best.y;
    st.z = best.z + (this.rng() - 0.5) * 0.6;
    st.ammo = MAG_SIZE;
    st.prevButtons = p.lastInput.buttons;
    p.alive = true;
    p.maxHp = BASE_HEALTH + (p.bonus?.hp ?? 0);
    p.hp = p.maxHp;
    p.armor = p.bonus?.armor ?? 0;
    p.protectUntil = this.tick + SPAWN_PROTECT_TICKS;
    p.selfReset = true;
    p.damageLog.clear();
    p.lastAttacker = 0;
    p.bot?.onSpawn(best.yaw);
    this.events.push(['spawn', p.id, round2(st.x), round2(st.y), round2(st.z), round2(best.yaw)]);
  }

  // ------------------------------------------------------------ ввод людей

  onInputs(p: Player, inputs: Input[], count: number): void {
    p.inq.push(inputs, count);
  }

  private processHuman(p: Player): void {
    const q = p.inq;
    const n = q.due();
    for (let i = 0; i < n; i++) {
      const inp = q.shift();
      const last = p.lastInput;
      if (inp.buttons !== last.buttons || Math.abs(inp.yaw - last.yaw) > 1e-4 || Math.abs(inp.pitch - last.pitch) > 1e-4) p.idleTicks = 0;
      this.simulate(p, inp);
      p.lastInput.seq = inp.seq;
      p.lastInput.buttons = inp.buttons;
      p.lastInput.yaw = inp.yaw;
      p.lastInput.pitch = inp.pitch;
      p.lastInput.viewTick = inp.viewTick;
    }
    if (n === 0) {
      q.starve++;
      // Долго нет ввода (вкладка свернулась, лаг) — двигаем по последнему вводу без «разовых» кнопок
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

  private simulate(p: Player, inp: Input): void {
    if (!p.alive) {
      p.state.prevButtons = inp.buttons;
      return;
    }
    const canFire = this.phase === PHASE_PLAY;
    stepPlayer(p.state, inp, this.world, canFire, p.seed, p.ev);
    if (p.ev.fired) {
      if (p.protectUntil > this.tick) p.protectUntil = this.tick;
      p.firingUntil = this.tick + 8;
      this.fire(p, inp);
    }
    if (p.alive && p.state.y < DROWN_Y) this.drown(p);
  }

  // ------------------------------------------------------------ бой

  /**
   * Выстрел. Цели откатываются к моменту, который видел стрелявший. Человек целится от третьего лица:
   * направление считается по его камере (shared/aim.ts), бот — по своему взгляду.
   * Выстрел из AWP летит так же, но урон без спада с дистанцией: любое попадание сбивает.
   */
  private fire(p: Player, inp: Input): void {
    const s = p.state;
    const viewTick = p.isBot ? this.tick : inp.viewTick;
    let rewind = this.tick - viewTick;
    if (!(rewind >= 0)) rewind = 0;
    if (rewind > MAX_REWIND_TICKS) rewind = MAX_REWIND_TICKS;
    const t = this.tick - rewind;
    const tg = this.targets;
    const who = this.targetPlayers;
    let n = 0;
    for (const q of this.players.values()) {
      if (q === p || q.team === p.team || !q.alive) continue;
      const pos = this.tmpPos;
      if (rewind > 0) {
        if (!this.history.sample(q.id, t, pos)) continue;
      } else {
        pos.x = q.state.x;
        pos.y = q.state.y;
        pos.z = q.state.z;
      }
      tg[n * 3] = pos.x;
      tg[n * 3 + 1] = pos.y;
      tg[n * 3 + 2] = pos.z;
      who[n] = q;
      n++;
    }
    let dx = p.ev.dirX;
    let dy = p.ev.dirY;
    let dz = p.ev.dirZ;
    if (!p.isBot) {
      const side = (inp.buttons & BTN_SHOULDER) !== 0 ? -1 : 1;
      tpsShotDir(s, p.ev.aimYaw, p.ev.aimPitch, p.ev.spread, p.seed, s.shots, side, (inp.buttons & BTN_ADS) !== 0, this.world, tg, n, this.dir);
      dx = this.dir.dirX;
      dy = this.dir.dirY;
      dz = this.dir.dirZ;
    }
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
    let target: Player | null = null;
    let targetY = 0;
    for (let i = 0; i < n; i++) {
      const hitT = rayEllipsoid(ox, oy, oz, dx, dy, dz, tg[i * 3], tg[i * 3 + 1] + HITBOX_CY, tg[i * 3 + 2], HITBOX_RX, HITBOX_RY);
      if (hitT >= 0 && hitT < best) {
        best = hitT;
        target = who[i];
        targetY = tg[i * 3 + 1];
        kind = 1;
      }
    }
    const ex = ox + dx * best;
    const ey = oy + dy * best;
    const ez = oz + dz * best;
    const awp = p.ev.awp;
    if (awp) this.events.push(['snipe', p.id, round2(ox), round2(oy), round2(oz), round2(ex), round2(ey), round2(ez), kind, nx, ny, nz]);
    else this.events.push(['shot', p.id, round2(ox), round2(oy), round2(oz), round2(ex), round2(ey), round2(ez), kind, nx, ny, nz]);
    if (target) {
      const head = ey - targetY >= HEADSHOT_Y;
      if (awp) this.awpHit(target, p, head, ex, ey, ez);
      else this.damage(target, p, damageAt(best, head) * p.dmgMult, head, ex, ey, ez);
    }
  }

  private damage(v: Player, a: Player, amount: number, head: boolean, hx: number, hy: number, hz: number): void {
    if (!v.alive || this.tick < v.protectUntil) return;
    const absorbed = Math.min(v.armor, amount * ARMOR_ABSORB);
    v.armor -= absorbed;
    v.hp -= amount - absorbed;
    v.lastAttacker = a.id;
    v.lastAttackTick = this.tick;
    v.hurtTick = this.tick;
    v.damageLog.set(a.id, this.tick);
    v.bot?.onHurt(a);
    this.events.push(['hit', a.id, v.id, Math.round(amount), head ? 1 : 0, round2(hx), round2(hy), round2(hz)]);
    if (v.hp <= 0.5) this.kill(v, a, head, 'shot');
  }

  /** Попадание из AWP: сбивает сразу — ни броня, ни бонус здоровья не спасают; защита после появления — спасает. */
  private awpHit(v: Player, a: Player, head: boolean, hx: number, hy: number, hz: number): void {
    if (!v.alive || this.tick < v.protectUntil) return;
    v.lastAttacker = a.id;
    v.lastAttackTick = this.tick;
    v.hurtTick = this.tick;
    v.damageLog.set(a.id, this.tick);
    v.bot?.onHurt(a);
    this.events.push(['hit', a.id, v.id, Math.max(1, Math.ceil(v.hp)), head ? 1 : 0, round2(hx), round2(hy), round2(hz)]);
    this.kill(v, a, head, 'awp');
  }

  private kill(v: Player, killer: Player | null, head: boolean, how: string): void {
    v.alive = false;
    v.hp = 0;
    v.deaths++;
    v.streak = 0;
    v.respawnTick = this.tick + RESPAWN_TICKS;
    if (killer && killer !== v) {
      killer.kills++;
      killer.streak++;
      if (this.phase === PHASE_PLAY) this.scores[killer.team]++;
      for (const [id, at] of v.damageLog) {
        if (id === killer.id || this.tick - at > ASSIST_WINDOW_TICKS) continue;
        const helper = this.players.get(id);
        if (helper && helper.team === killer.team) helper.assists++;
      }
      if (killer.streak >= 3) this.events.push(['streak', killer.id, killer.streak]);
    }
    v.damageLog.clear();
    this.events.push(['kill', killer ? killer.id : 0, v.id, head ? 1 : 0, how]);
    this.rosterDirty = true;
    if (this.phase === PHASE_PLAY && killer && (this.scores[0] >= SCORE_LIMIT || this.scores[1] >= SCORE_LIMIT)) {
      this.endRound(this.scores[0] > this.scores[1] ? 0 : 1);
    }
  }

  private drown(p: Player): void {
    this.events.push(['splash', round2(p.state.x), round2(p.state.z), p.id]);
    const recent = this.tick - p.lastAttackTick < 5 * TICK_RATE ? this.players.get(p.lastAttacker) ?? null : null;
    this.kill(p, recent, false, 'drown');
  }

  /** Отхил: кто REGEN_DELAY_TICKS не терял здоровья, получает по 1 HP раз в REGEN_EVERY тиков до своего максимума. */
  private regen(): void {
    const tick = this.tick;
    for (const p of this.players.values()) {
      if (!p.alive || p.hp >= p.maxHp) continue;
      const since = tick - p.hurtTick - REGEN_DELAY_TICKS;
      // по целым: на экране здоровье (округлённое вверх) растёт ровно на 1
      if (since >= 0 && since % REGEN_EVERY === 0) p.hp = Math.min(p.maxHp, Math.ceil(p.hp) + 1);
    }
  }

  // ------------------------------------------------------------ AWP

  /** Начало и конец раунда: AWP снова лежит на кресте, у кого была — снова с маркером. */
  private resetAwp(): void {
    const a = this.awp;
    if (!a) return;
    if (a.holder) a.holder.state.awp = 0;
    a.holder = null;
    a.lying = true;
    a.respawnAt = 0;
  }

  /**
   * AWP за тик: ушла из рук (выстрелы кончились, лопнул, сменил команду, вышел) — через AWP_RESPAWN_TICKS снова
   * на кресте; лежит — подбирает человек, который в неё зашёл (только в бою; ботам не даём — было бы нечестно).
   */
  private stepAwp(): void {
    const a = this.awp;
    if (!a) return;
    const h = a.holder;
    if (h && (this.players.get(h.id) !== h || !h.alive || h.state.awp === 0)) {
      h.state.awp = 0;
      a.holder = null;
      a.respawnAt = this.tick + AWP_RESPAWN_TICKS;
    }
    if (!a.holder && !a.lying && this.tick >= a.respawnAt) {
      a.lying = true;
      this.events.push(['awp', 0, 0]);
      this.systemChat('🎯 AWP снова лежит на центральном контейнере');
    }
    if (!a.lying || this.phase !== PHASE_PLAY) return;
    for (const p of this.players.values()) {
      if (p.isBot || !p.alive) continue;
      const dx = p.state.x - a.x;
      const dz = p.state.z - a.z;
      if (dx * dx + dz * dz > AWP_RADIUS * AWP_RADIUS || Math.abs(p.state.y - a.y) > 1.2) continue;
      a.lying = false;
      a.holder = p;
      const s = p.state;
      s.awp = AWP_SHOTS;
      // магазин маркера — сразу полный: после AWP не перезаряжаться посреди боя
      s.ammo = MAG_SIZE;
      s.reloadT = 0;
      this.events.push(['awp', 1, p.id]);
      this.systemChat(`🎯 ${p.name} подобрал AWP`);
      break;
    }
  }

  // ------------------------------------------------------------ автомат

  onPull(p: Player): void {
    if (this.phase !== PHASE_WARMUP || p.reels.length > 0) return;
    this.pullSlot(p, false);
  }

  pullSlot(p: Player, auto: boolean): void {
    const reels = [this.rollSymbol(), this.rollSymbol(), this.rollSymbol()];
    const bonus = computeBonus(reels);
    p.reels = reels;
    p.bonus = bonus;
    p.maxHp = BASE_HEALTH + bonus.hp;
    p.dmgMult = 1 + bonus.dmg;
    if (p.alive) {
      p.hp = p.maxHp;
      p.armor = bonus.armor;
    }
    p.sink?.sendJson({ t: 'slot', reels, bonus, auto });
    this.rosterDirty = true;
    const line = `🎰 ${p.name}: ${reels.map((r) => SLOT_SYMBOLS[r]).join(' ')} — ${describeBonus(bonus)}`;
    // объявляем, когда барабаны у игрока докрутятся
    this.delayedChat.push({ at: this.tick + (auto ? 20 : 100), msg: sysLine(line) });
  }

  private rollSymbol(): number {
    const r = this.rng();
    if (r < 0.3) return SLOT_HP;
    if (r < 0.6) return SLOT_ARMOR;
    if (r < 0.85) return SLOT_DAMAGE;
    return SLOT_CHERRY;
  }

  // ------------------------------------------------------------ чат

  /** Команды пейнтбола из чата: /restart, /bots, /skill, /team, /kill, /help. */
  command(p: Player, text: string): void {
    const [cmd, ...args] = text.slice(1).split(/\s+/);
    switch (cmd.toLowerCase()) {
      case 'restart':
      case 'рестарт':
        if (!this.restartRound(p)) this.privateChat(p, 'Раунд только что перезапускали, подожди пару секунд');
        break;
      case 'bots':
      case 'боты': {
        const n = Number.parseInt(args[0] ?? '', 10);
        if (!Number.isFinite(n) || n < 0 || n > 7) {
          this.privateChat(p, 'Использование: /bots 0…7 — размер команды с ботами');
          break;
        }
        this.botsPerTeam = n;
        this.balanceBots();
        this.systemChat(n === 0 ? `${p.name} убрал ботов` : `${p.name}: команды добиты ботами до ${n}`);
        break;
      }
      case 'skill':
      case 'боты-уровень': {
        const s = (args[0] ?? '').toLowerCase();
        const map: Record<string, Skill> = { easy: 'easy', легко: 'easy', normal: 'normal', норм: 'normal', hard: 'hard', сложно: 'hard' };
        const skill = map[s];
        if (!skill) {
          this.privateChat(p, 'Использование: /skill easy | normal | hard');
          break;
        }
        this.botSkill = skill;
        for (const q of this.players.values()) q.bot?.setSkill(skill);
        this.systemChat(`${p.name}: боты теперь «${{ easy: 'лёгкие', normal: 'нормальные', hard: 'злые' }[skill]}»`);
        break;
      }
      case 'team':
      case 'команда': {
        const other = (1 - p.team) as 0 | 1;
        const h = [0, 0];
        for (const q of this.players.values()) if (!q.isBot) h[q.team]++;
        if (h[other] >= h[p.team]) {
          this.privateChat(p, 'Там уже больше людей — команды развалятся');
          break;
        }
        p.team = other;
        this.balanceBots();
        if (p.alive) {
          p.alive = false;
          p.respawnTick = this.tick + 30;
        }
        this.rosterDirty = true;
        this.systemChat(`${p.name} переходит в «${TEAM_NAMES[other]}»`);
        break;
      }
      case 'kill':
        if (p.alive) this.kill(p, null, false, 'self');
        break;
      case 'help':
      case 'помощь':
        this.privateChat(p, 'Команды: /restart — новый раунд, /bots N — боты до N в команде, /skill easy|normal|hard, /team — сменить команду, /kill — возродиться');
        break;
      default:
        this.privateChat(p, `Не знаю команду /${cmd}. Список: /help`);
    }
  }

  /** Системная строка внутри комнаты (в общий чат не уходит). */
  systemChat(text: string): void {
    this.broadcast(sysLine(text));
  }

  private privateChat(p: Player, text: string): void {
    p.sink?.sendJson(sysLine(text));
  }

  broadcast(msg: ServerMsg): void {
    for (const p of this.players.values()) p.sink?.sendJson(msg);
  }

  // ------------------------------------------------------------ тик

  step(): void {
    this.tick++;
    const tick = this.tick;

    // фазы
    if (tick >= this.phaseEnd) {
      if (this.phase === PHASE_WARMUP) this.startPlay();
      else if (this.phase === PHASE_PLAY) this.endRound(this.scores[0] === this.scores[1] ? -1 : this.scores[0] > this.scores[1] ? 0 : 1);
      else this.startWarmup(false);
    }

    // игроки
    for (const p of this.players.values()) {
      if (p.bot) {
        const inp = p.bot.update();
        if (this.phase === PHASE_WARMUP && p.reels.length === 0 && p.bot.wantsPull(tick)) this.pullSlot(p, false);
        this.simulate(p, inp);
        p.lastInput.buttons = inp.buttons;
        p.lastInput.yaw = inp.yaw;
        p.lastInput.pitch = inp.pitch;
      } else {
        this.processHuman(p);
        if (this.phase === PHASE_PLAY) p.playTicks++;
      }
      if (!p.alive && tick >= p.respawnTick && this.players.has(p.id)) this.spawnPlayer(p);
    }

    // банки варенья
    for (let i = 0; i < this.jars.length; i++) {
      const j = this.jars[i];
      if (!j.available) {
        if (tick >= j.respawnAt) {
          j.available = true;
          this.events.push(['jam', i, 0, 0]);
        }
        continue;
      }
      for (const p of this.players.values()) {
        if (!p.alive || p.hp >= p.maxHp) continue;
        const dx = p.state.x - j.x;
        const dz = p.state.z - j.z;
        if (dx * dx + dz * dz > JAM_RADIUS * JAM_RADIUS || Math.abs(p.state.y - j.y) > 1.2) continue;
        p.hp = Math.min(p.maxHp, p.hp + JAM_HEAL);
        j.available = false;
        j.respawnAt = tick + JAM_RESPAWN_TICKS;
        this.events.push(['jam', i, 1, p.id]);
        break;
      }
    }

    this.regen();
    this.stepAwp();

    this.history.record(tick, this.players.values());

    // отложенные сообщения чата
    if (this.delayedChat.length) {
      const due = this.delayedChat.filter((d) => d.at <= tick);
      if (due.length) {
        this.delayedChat = this.delayedChat.filter((d) => d.at > tick);
        for (const d of due) this.broadcast(d.msg);
      }
    }

    this.sendSnapshots();
    if (this.rosterDirty && tick - this.rosterSentTick > 12) this.sendRoster();
    else if (tick - this.rosterSentTick > 2 * TICK_RATE) this.sendRoster();

    // Уснувших отправляем на набережную (после рассылки, чтобы не менять состав посреди тика)
    if (this.pendingAfk.length) {
      const list = this.pendingAfk;
      this.pendingAfk = [];
      for (const p of list) if (this.players.get(p.id) === p) this.hooks.afk?.(p);
    }
  }

  /** Для экрана над воротами склада. */
  status(): PbStatus {
    const names: string[] = [];
    for (const p of this.players.values()) if (!p.isBot) names.push(p.name);
    return {
      phase: this.phase,
      left: Math.max(0, Math.ceil((this.phaseEnd - this.tick) / TICK_RATE)),
      scores: [this.scores[0], this.scores[1]],
      humans: names.length,
      names: names.slice(0, 8),
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
      if (p.team === 1) flags |= E_TEAM;
      if (s.grounded) flags |= E_GROUNDED;
      if (s.dashT > 0) flags |= E_DASH;
      if (s.reloadT > 0) flags |= E_RELOAD;
      if (p.lastInput.buttons & BTN_ADS) flags |= E_ADS;
      if (p.protectUntil > tick) flags |= E_PROTECTED;
      if (p.firingUntil > tick) flags |= E_FIRING;
      list.push({ id: p.id, flags, x: s.x, y: s.y, z: s.z, yaw: p.lastInput.yaw, pitch: p.lastInput.pitch, hp: Math.max(0, p.hp), armor: p.armor });
    }
    // хвост пейнтбола — сразу за списком: где AWP (лежит на кресте, у кого в руках или её нет)
    const ents = encodeEntities(list);
    const entities = new Uint8Array(ents.length + PB_TAIL_BYTES);
    entities.set(ents);
    const a = this.awp;
    entities[ents.length] = !a ? 0 : a.lying ? AWP_LYING : a.holder ? a.holder.id : 0;
    let pickups = 0;
    for (let i = 0; i < this.jars.length; i++) if (this.jars[i].available) pickups |= 1 << i;
    const h = this.header;
    h.tick = tick;
    h.phase = this.phase;
    h.phaseEnd = this.phaseEnd;
    h.scoreA = this.scores[0];
    h.scoreB = this.scores[1];
    h.pickups = pickups;
    const evMsg: ServerMsg | null = this.events.length ? { t: 'ev', k: tick, e: this.events } : null;
    for (const p of this.players.values()) {
      if (!p.sink) continue;
      h.ack = p.inq.ack;
      h.queue = p.inq.length;
      h.flags = p.selfReset ? SNAP_SELF_RESET : 0;
      p.selfReset = false;
      p.sink.sendBinary(encodeSnapshot(h, p.state, entities));
      if (evMsg) p.sink.sendJson(evMsg);
    }
    this.events = [];
  }

  /** Список игроков изменился снаружи (наряд) — разослать в ближайший тик. */
  touchRoster(): void {
    this.rosterDirty = true;
  }

  roster(): RosterEntry[] {
    return [...this.players.values()].map((p) => ({
      id: p.id, level: p.level, name: p.name, team: p.team, bot: p.isBot, k: p.kills, d: p.deaths, a: p.assists,
      ping: p.isBot ? 0 : Math.round(p.ping), reels: p.reels, maxHp: p.maxHp, dmg: Math.round((p.dmgMult - 1) * 100), o: p.outfit,
    }));
  }

  private sendRoster(): void {
    this.rosterDirty = false;
    this.rosterSentTick = this.tick;
    const players = this.roster();
    this.broadcast({ t: 'roster', players });
  }
}

// ------------------------------------------------------------ помощники

export function computeBonus(reels: number[]): SlotBonus {
  const c = [0, 0, 0, 0];
  for (const r of reels) c[r]++;
  const jackpot = reels.length === 3 && reels[0] === reels[1] && reels[1] === reels[2];
  if (jackpot) {
    switch (reels[0]) {
      case SLOT_HP: return { hp: 60, armor: 0, dmg: 0, jackpot };
      case SLOT_ARMOR: return { hp: 0, armor: 80, dmg: 0, jackpot };
      case SLOT_DAMAGE: return { hp: 0, armor: 0, dmg: 0.3, jackpot };
      default: return { hp: 35, armor: 35, dmg: 0.12, jackpot };
    }
  }
  return {
    hp: 15 * c[SLOT_HP] + 5 * c[SLOT_CHERRY],
    armor: 20 * c[SLOT_ARMOR] + 5 * c[SLOT_CHERRY],
    dmg: Math.round((0.07 * c[SLOT_DAMAGE] + 0.02 * c[SLOT_CHERRY]) * 100) / 100,
    jackpot,
  };
}

export function describeBonus(b: SlotBonus): string {
  const parts: string[] = [];
  if (b.hp) parts.push(`+${b.hp} HP`);
  if (b.armor) parts.push(`+${b.armor} брони`);
  if (b.dmg) parts.push(`+${Math.round(b.dmg * 100)}% урона`);
  return (b.jackpot ? 'ДЖЕКПОТ! ' : '') + (parts.join(', ') || 'пусто');
}

function sysLine(text: string): ServerMsg {
  return { t: 'chat', from: '', pid: 0, room: 'paintball', team: -1, text, sys: true };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
