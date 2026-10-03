// Бой «Fight Club» на сервере: бойцы (люди и боты) и зрители в толпе, раунды и фазы, удары с откатом соперников
// к тому, что видел бьющий, захват и бросок, нокауты, гаснущий свет и урон в темноте, места и жетоны (через хук),
// снимки 30 раз в секунду, состав и события. Шаг бойца — shared/fightsim.ts, тот же, что предсказывает клиент.
import { MAX_REWIND_TICKS, TICK_RATE } from '../../shared/constants.ts';
import {
  FA_GRAB, FA_HOLD, FA_JAB, FA_NONE, FC_BLOCK_ARC, FC_BODY, FC_CROWD_SLOTS, FC_DARK_DPS, FC_END_TICKS, FC_ESCAPE_KB, FC_ESCAPE_STUN,
  FC_FFA_MAX_TICKS, FC_FILL, FC_FIGHTERS, FC_FIRST_INTRO_TICKS, FC_HOLD_DIST, FC_HOLD_UP, FC_INTRO_TICKS, FC_KO_LIE_TICKS, FC_MASH,
  FC_MAX_ROUNDS, FC_MODE_NAME, FC_PAUSE_TICKS, FC_THROW, FC_WINS, FP_END, FP_FIGHT, FP_INTRO, FP_PAUSE, MOVES, cornerSpot, crowdSpot,
  fightReward, makeZone, ringRadius, zoneAt, type FcEvent, type FcMode, type FcResultRow, type FcReward, type FcRosterRow, type Zone,
} from '../../shared/fight.ts';
import { FE_BLOCK, FE_FIGHTER, FE_HELD, FE_STUN, FX_BSTUN, FX_HOLDING, FX_INV, FX_WINDED, encodeFightTail, joinBody, type FightTailRow } from '../../shared/fightnet.ts';
import {
  BTN_BLOCK, GATE_FIGHT, GATE_FROZEN, GATE_WALK, applyHit, applyThrow, buildFightWorld, faces, freshFighter, hurt, inReach, makeFightEvents,
  makeFighter, makeHitOut, staminaPct, stepFighter, type FightEvents, type Fighter,
} from '../../shared/fightsim.ts';
import { sinCos } from '../../shared/math.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import type { Outfit } from '../../shared/outfit.ts';
import { DEFAULT_OUTFIT } from '../../shared/outfit.ts';
import { E_ALIVE, E_DASH, E_GROUNDED, E_TEAM, SNAP_SELF_RESET, encodeEntities, encodeSnapshot, makeHeader, type EntitySnap } from '../../shared/protocol.ts';
import { BTN_ADS, BTN_DASH, BTN_FIRE, BTN_JUMP, BTN_USE, makeInput, type Input } from '../../shared/sim.ts';
import type { CollisionWorld } from '../../shared/world.ts';
import { InputQueue } from '../inputs.ts';
import type { Sink } from '../paintball/game.ts';
import { FightBot } from './bots.ts';
import { FightHistory, makePast, type PastFighter } from './history.ts';

export interface FightHooks {
  /** Итог бойцу-человеку, дождавшемуся конца: жетоны и статистика */
  result(p: FcPlayer, row: FcResultRow, reward: FcReward): void;
  /** Итоги показаны: всех наверх */
  over(): void;
  announce?(text: string): void;
}

export interface FcHuman {
  pid: number;
  nick: string;
  level?: number;
  outfit: Outfit;
}

export interface FightOptions {
  /** Случайность ботов (подменяется в тестах) */
  rng?: () => number;
}

const BOT_NAMES = ['Синяк', 'Фингал', 'Шишка', 'Пломба', 'Мыло', 'Кулак', 'Пончик', 'Бублик'];
/** Цвета ботов: приглушённые, чтобы в полутьме читались силуэтами */
const BOT_COLORS = [3, 5, 7, 1, 11, 13, 2, 8];
/** Ударные кнопки, которые без ввода не повторяем */
const TAPS = BTN_FIRE | BTN_ADS | BTN_USE | BTN_JUMP | BTN_DASH | BTN_BLOCK;
const SNAP_EVERY = 2;
/** Эмоция зрителя — не чаще раза в полсекунды */
const EMOTE_GAP = 30;

export class FcPlayer {
  readonly id: number;
  readonly pid: number;
  level = 1;
  nick: string;
  outfit: Outfit;
  readonly bot: FightBot | null;
  sink: Sink | null;
  /** Дерётся в этом бою (иначе — зритель) */
  fighter: boolean;
  team = -1;
  /** Место в первом ряду толпы (−1 — нет) */
  slot = -1;
  readonly f: Fighter = makeFighter();
  readonly inq = new InputQueue();
  readonly last: Input = makeInput();
  readonly ev: FightEvents = makeFightEvents();
  kos = 0;
  dmg = 0;
  wins = 0;
  place = 0;
  /** Выбыл в этом раунде (в свалке — до конца) */
  out = false;
  koAt = 0;
  selfReset = true;
  emoteAt = -999;
  /** Стоял в толпе в прошлом тике (сменилось — разослать состав) */
  wasCrowd = false;

  constructor(id: number, pid: number, nick: string, outfit: Outfit, bot: FightBot | null, sink: Sink | null, fighter: boolean) {
    this.id = id;
    this.pid = pid;
    this.nick = nick;
    this.outfit = outfit;
    this.bot = bot;
    this.sink = sink;
    this.fighter = fighter;
  }
}

export class FightGame {
  readonly mode: FcMode;
  readonly players = new Map<number, FcPlayer>();
  readonly world: CollisionWorld = buildFightWorld();
  readonly zone: Zone = makeZone(5);
  ringR = 5;
  tick = 0;
  phase = FP_INTRO;
  phaseEnd = 0;
  round = 0;
  roundStart = 0;
  readonly wins = [0, 0];
  started = false;
  closed = false;
  /** Кто взял последний раунд: команда (дуэль, 2 на 2), номер бойца (свалка); −1 — ничья или ещё нет */
  lastWin = -1;
  private matchOver = false;
  private readonly hooks: FightHooks;
  private readonly rng: () => number;
  private readonly history = new FightHistory();
  private readonly past = makePast();
  private readonly hit = makeHitOut();
  private readonly header = makeHeader();
  private readonly botInput: Input = makeInput();
  private readonly idleInput: Input = makeInput();
  private readonly sc = { s: 0, c: 0 };
  private events: FcEvent[] = [];
  private rosterDirty = true;
  private nextId = 1;
  private fightersAtStart = 0;

  constructor(mode: FcMode, hooks: FightHooks, opts: FightOptions = {}) {
    this.mode = mode;
    this.hooks = hooks;
    this.rng = opts.rng ?? Math.random;
  }

  get humans(): number {
    let n = 0;
    for (const p of this.players.values()) if (!p.bot) n++;
    return n;
  }

  /** Бойцов (людей и ботов) в этом бою */
  get fighters(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.fighter) n++;
    return n;
  }

  // ------------------------------------------------------------ состав

  /** Человек: бойцом (если бой ещё не начался и есть место) или зрителем. */
  addHuman(h: FcHuman, sink: Sink, fighter: boolean): FcPlayer | null {
    if (this.closed || this.nextId > 31) return null;
    const asFighter = fighter && !this.started && this.fighters < FC_FIGHTERS[this.mode];
    const p = new FcPlayer(this.nextId++, h.pid, h.nick, h.outfit, null, sink, asFighter);
    p.level = h.level ?? 1;
    this.players.set(p.id, p);
    if (!asFighter) p.slot = this.freeSlot();
    this.rosterDirty = true;
    if (this.started) this.sendInit(p);
    return p;
  }

  private addBot(i: number): FcPlayer {
    const skill = 0.55 + this.rng() * 0.4;
    const name = `Бот ${BOT_NAMES[i % BOT_NAMES.length]}`;
    const outfit: Outfit = { ...DEFAULT_OUTFIT, c: BOT_COLORS[i % BOT_COLORS.length], h: i % 3 === 0 ? 'none' : DEFAULT_OUTFIT.h };
    const p = new FcPlayer(this.nextId++, 0, name, outfit, new FightBot(this.rng, skill), null, true);
    this.players.set(p.id, p);
    this.rosterDirty = true;
    return p;
  }

  removePlayer(id: number): void {
    const p = this.players.get(id);
    if (!p) return;
    if (p.fighter && this.started && !p.f.ko) {
      p.f.hp = 0;
      p.f.ko = 1;
      this.onKo(p, null);
    }
    this.release(p);
    this.players.delete(id);
    this.rosterDirty = true;
  }

  private freeSlot(): number {
    const used = new Set<number>();
    for (const p of this.players.values()) if (p.slot >= 0) used.add(p.slot);
    // сначала — места посередине длинных сторон (лучше видно), потом остальные
    for (let k = 0; k < FC_CROWD_SLOTS; k++) {
      const s = (k * 5) % FC_CROWD_SLOTS;
      if (!used.has(s)) return s;
    }
    return 0;
  }

  /** Старт: боты добирают бойцов, команды, ринг, первый раунд. */
  start(): void {
    if (this.started || this.closed) return;
    this.started = true;
    let botI = Math.floor(this.rng() * BOT_NAMES.length);
    while (this.fighters < FC_FILL[this.mode]) this.addBot(botI++);
    let i = 0;
    for (const p of this.players.values()) {
      if (!p.fighter) continue;
      p.team = this.mode === 'ffa' ? -1 : i % 2;
      i++;
    }
    this.fightersAtStart = i;
    this.ringR = ringRadius(this.mode, i);
    this.round = 0;
    this.newRound(FC_FIRST_INTRO_TICKS);
    for (const p of this.players.values()) if (p.sink) this.sendInit(p);
  }

  private newRound(intro: number): void {
    this.round++;
    let i = 0;
    const n = this.fighters;
    for (const p of this.players.values()) {
      if (!p.fighter) continue;
      const c = cornerSpot(this.mode, i++, n, this.ringR);
      freshFighter(p.f, c.x, c.z, c.yaw);
      p.out = false;
      p.slot = -1;
      p.selfReset = true;
    }
    this.phase = FP_INTRO;
    this.phaseEnd = this.tick + intro;
    this.roundStart = this.phaseEnd;
    zoneAt(this.ringR, this.mode === 'ffa', 0, this.zone);
    this.lastWin = -1;
    this.rosterDirty = true;
    this.sendPhase();
  }

  private sendInit(p: FcPlayer): void {
    p.sink?.sendJson({
      t: 'fcInit', id: p.id, mode: this.mode, ring: this.ringR, tick: this.tick, phase: this.phase, phaseEnd: this.phaseEnd, round: this.round,
      wins: [this.wins[0], this.wins[1]], roster: this.roster(),
    });
  }

  roster(): FcRosterRow[] {
    const rows: FcRosterRow[] = [];
    for (const p of this.players.values()) {
      rows.push({ id: p.id, level: p.level, nick: p.nick, o: p.outfit, bot: !!p.bot, team: p.team, fighter: p.fighter, slot: this.inCrowd(p) ? p.slot : -1, kos: p.kos, wins: p.wins });
    }
    return rows;
  }

  touchRoster(): void {
    this.rosterDirty = true;
  }

  /** Стоит в толпе: зритель или выбывший, отлежавшийся после нокаута */
  inCrowd(p: FcPlayer): boolean {
    return !p.fighter || (p.out && this.tick - p.koAt >= FC_KO_LIE_TICKS);
  }

  /** В ринге и держится на ногах (можно бить, можно толкаться) */
  private live(p: FcPlayer): boolean {
    return p.fighter && !p.f.ko;
  }

  canHurt(a: FcPlayer, v: FcPlayer): boolean {
    return this.mode !== 'team' || a.team !== v.team;
  }

  // ------------------------------------------------------------ ввод

  onInputs(p: FcPlayer, inputs: Input[], count: number): void {
    p.inq.push(inputs, count);
  }

  emote(p: FcPlayer, k: unknown): void {
    if (typeof k !== 'number' || !Number.isInteger(k) || k < 1 || k > 6) return;
    if (this.tick - p.emoteAt < EMOTE_GAP) return;
    // бойцу в ринге посреди раунда не до эмоций
    if (p.fighter && !this.inCrowd(p) && this.phase === FP_FIGHT && !p.f.ko) return;
    p.emoteAt = this.tick;
    this.events.push(['emote', p.id, k]);
  }

  // ------------------------------------------------------------ тик

  step(): void {
    if (this.closed) return;
    this.tick++;
    if (!this.started) return;
    const t = this.tick;
    if (this.phase === FP_INTRO && t >= this.phaseEnd) {
      this.phase = FP_FIGHT;
      this.roundStart = t;
      this.phaseEnd = 0;
      this.sendPhase();
    } else if (this.phase === FP_PAUSE && t >= this.phaseEnd) {
      if (this.matchOver) this.finish();
      else this.newRound(FC_INTRO_TICKS);
    } else if (this.phase === FP_END && t >= this.phaseEnd) {
      this.closed = true;
      this.hooks.over();
      return;
    }
    if (this.phase === FP_FIGHT) zoneAt(this.ringR, this.mode === 'ffa', t - this.roundStart, this.zone);
    const gate = this.phase === FP_FIGHT ? GATE_FIGHT : this.phase === FP_INTRO ? GATE_FROZEN : GATE_WALK;

    for (const p of this.players.values()) {
      if (!p.fighter || this.inCrowd(p)) continue;
      if (p.bot) {
        p.bot.think(p, this, t, this.botInput);
        this.simulate(p, this.botInput, gate);
      } else this.processHuman(p, gate);
    }
    this.carryHeld();
    this.separate();
    if (this.phase === FP_FIGHT) {
      this.darkness();
      // нокаут без автора (ушёл, упал как-то ещё) — тоже нокаут
      for (const p of this.players.values()) if (p.fighter && p.f.ko && !p.out) this.onKo(p, null);
      this.checkRound();
    }
    this.history.record(t, this.historyList());
    this.crowdCheck();
    if (t % SNAP_EVERY === 0) this.sendSnapshots();
    if (this.rosterDirty) {
      this.rosterDirty = false;
      this.broadcast({ t: 'fcRoster', roster: this.roster() });
    }
  }

  private *historyList(): Generator<{ id: number; f: Fighter; live: boolean }> {
    for (const p of this.players.values()) if (p.fighter && !this.inCrowd(p)) yield { id: p.id, f: p.f, live: !p.f.ko };
  }

  private processHuman(p: FcPlayer, gate: number): void {
    const q = p.inq;
    const n = q.due();
    for (let i = 0; i < n; i++) {
      const inp = q.shift();
      this.simulate(p, inp, gate);
      p.last.seq = inp.seq;
      p.last.buttons = inp.buttons;
      p.last.yaw = inp.yaw;
    }
    if (n === 0) {
      q.starve++;
      // долго нет ввода (вкладка свернулась, лаг): по последнему вводу без ударных кнопок, потом стоим
      if (q.starve > 8) {
        const idle = this.idleInput;
        idle.buttons = q.starve > 90 ? 0 : p.last.buttons & ~TAPS;
        idle.yaw = p.last.yaw;
        idle.viewTick = this.tick;
        this.simulate(p, idle, gate);
      }
    }
  }

  private simulate(p: FcPlayer, inp: Input, gate: number): void {
    const ev = p.ev;
    stepFighter(p.f, inp, this.world, this.ringR, gate, ev);
    if (ev.strike) this.strike(p, ev.strike, inp.viewTick);
    if (ev.grab) this.tryGrab(p, inp.viewTick);
    if (ev.throwAt) this.doThrow(p, ev.throwAt);
    if (ev.shove) this.events.push(['shove', p.id]);
    if (p.f.held && p.f.mash >= FC_MASH) this.escape(p);
  }

  /** Тик, к которому откатываем соперников: что бьющий видел у себя (не дальше MAX_REWIND_TICKS назад). */
  private rewindTo(viewTick: number): number {
    const t = this.tick;
    if (!(viewTick > 0)) return t;
    return Math.max(t - MAX_REWIND_TICKS, Math.min(t, viewTick));
  }

  /** Где был v в тик vt (нет в истории — где сейчас). */
  private pastOf(v: FcPlayer, vt: number): PastFighter {
    const o = this.past;
    if (vt >= this.tick || !this.history.sample(v.id, vt, o)) {
      o.x = v.f.s.x;
      o.y = v.f.s.y;
      o.z = v.f.s.z;
      o.yaw = v.f.yaw;
      o.block = v.f.block === 1;
      o.inv = v.f.inv > 0;
    }
    return o;
  }

  /** Удар стал активным: всех соперников в секторе (как их видел бьющий) — бьём; блок и уклон — тогда или сейчас. */
  private strike(a: FcPlayer, kind: number, viewTick: number): void {
    const m = MOVES[kind];
    const af = a.f;
    const vt = this.rewindTo(viewTick);
    for (const v of this.players.values()) {
      if (v === a || !this.live(v) || this.inCrowd(v) || !this.canHurt(a, v) || v.f.held === a.id) continue;
      const then = this.pastOf(v, vt);
      if (!inReach(af.s.x, af.s.y, af.s.z, af.yaw, then.x, then.y, then.z, m.reach, m.arc)) continue;
      if (v.f.inv > 0 || then.inv) {
        this.events.push(['dodge', v.id]);
        continue;
      }
      const vf = v.f;
      const blocked = (vf.block === 1 && faces(vf.yaw, af.s.x - vf.s.x, af.s.z - vf.s.z, FC_BLOCK_ARC)) ||
        (then.block && faces(then.yaw, af.s.x - then.x, af.s.z - then.z, FC_BLOCK_ARC));
      let dx = vf.s.x - af.s.x;
      let dz = vf.s.z - af.s.z;
      let d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.05) {
        sinCos(af.yaw, this.sc);
        dx = -this.sc.s;
        dz = -this.sc.c;
        d = 1;
      }
      dx /= d;
      dz /= d;
      applyHit(vf, kind, dx, dz, blocked, this.hit);
      a.dmg += this.hit.dmg;
      if (vf.grab && vf.act !== FA_HOLD) this.release(v);
      const x = vf.s.x - dx * 0.38;
      const z = vf.s.z - dz * 0.38;
      this.events.push(['hit', a.id, v.id, kind, this.hit.res, this.hit.dmg, r2(x), r2(vf.s.y + 0.95), r2(z)]);
      if (vf.ko) this.onKo(v, a);
    }
  }

  /** Захват стал активным: ближайший соперник в секторе (не уклоняется и никем не пойман) — в руках. */
  private tryGrab(a: FcPlayer, viewTick: number): void {
    const m = MOVES[FA_GRAB];
    const af = a.f;
    const vt = this.rewindTo(viewTick);
    let best: FcPlayer | null = null;
    let bestD = Infinity;
    for (const v of this.players.values()) {
      if (v === a || !this.live(v) || this.inCrowd(v) || !this.canHurt(a, v) || v.f.held) continue;
      const then = this.pastOf(v, vt);
      if (!inReach(af.s.x, af.s.y, af.s.z, af.yaw, then.x, then.y, then.z, m.reach, m.arc)) continue;
      if (v.f.inv > 0 || then.inv) {
        this.events.push(['dodge', v.id]);
        continue;
      }
      const d = (then.x - af.s.x) ** 2 + (then.z - af.s.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    if (!best || af.act !== FA_GRAB) return;
    af.act = FA_HOLD;
    af.actT = 0;
    af.grab = best.id;
    const vf = best.f;
    if (vf.grab) this.release(best);
    vf.held = a.id;
    vf.mash = 0;
    vf.stun = 0;
    vf.act = FA_NONE;
    vf.actT = 0;
    vf.block = 0;
    vf.buf = 0;
    vf.s.dashT = 0;
    this.events.push(['grab', a.id, best.id]);
  }

  private doThrow(a: FcPlayer, id: number): void {
    const v = this.players.get(id);
    if (!v || v.f.held !== a.id) return;
    sinCos(a.f.yaw, this.sc);
    applyThrow(v.f, -this.sc.s, -this.sc.c);
    a.dmg += FC_THROW.dmg;
    this.events.push(['throw', a.id, v.id]);
    if (v.f.ko) this.onKo(v, a);
  }

  /** Пойманный нажал достаточно — вырвался: обоих расталкивает, державший шатается. */
  private escape(v: FcPlayer): void {
    const a = this.players.get(v.f.held);
    v.f.held = 0;
    v.f.mash = 0;
    if (!a) return;
    let dx = v.f.s.x - a.f.s.x;
    let dz = v.f.s.z - a.f.s.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    dx /= d;
    dz /= d;
    if (a.f.grab === v.id) {
      a.f.grab = 0;
      hurt(a.f, 0, -dx * FC_ESCAPE_KB * 0.6, -dz * FC_ESCAPE_KB * 0.6, 0, FC_ESCAPE_STUN);
    }
    hurt(v.f, 0, dx * FC_ESCAPE_KB, dz * FC_ESCAPE_KB, 2.5, 0);
    this.events.push(['escape', v.id, a.id]);
  }

  /** Державшего ударили или он выбыл — пойманный падает. */
  private release(holder: FcPlayer): void {
    const id = holder.f.grab;
    if (!id) return;
    holder.f.grab = 0;
    if (holder.f.act === FA_HOLD) {
      holder.f.act = FA_NONE;
      holder.f.actT = 0;
    }
    const v = this.players.get(id);
    if (v && v.f.held === holder.id) {
      v.f.held = 0;
      v.f.mash = 0;
      v.f.s.vy = 2;
      v.f.s.grounded = 0;
    }
  }

  /** Пойманный — в руках у державшего: перед ним и чуть выше. */
  private carryHeld(): void {
    for (const v of this.players.values()) {
      const vf = v.f;
      if (!vf.held) continue;
      const a = this.players.get(vf.held);
      if (!a || !a.fighter || a.f.ko || a.f.grab !== v.id || a.f.act !== FA_HOLD) {
        vf.held = 0;
        vf.mash = 0;
        vf.s.grounded = 0;
        continue;
      }
      sinCos(a.f.yaw, this.sc);
      let x = a.f.s.x - this.sc.s * FC_HOLD_DIST;
      let z = a.f.s.z - this.sc.c * FC_HOLD_DIST;
      const lim = this.ringR - 0.42;
      const r = Math.sqrt(x * x + z * z);
      if (r > lim) {
        x *= lim / r;
        z *= lim / r;
      }
      vf.s.x = x;
      vf.s.z = z;
      vf.s.y = a.f.s.y + FC_HOLD_UP;
      vf.s.vx = a.f.s.vx;
      vf.s.vz = a.f.s.vz;
      vf.s.vy = 0;
      vf.s.grounded = 0;
    }
  }

  /** Желейки не проходят друг сквозь друга: кто ближе FC_BODY — расталкиваем. */
  private separate(): void {
    const list: Fighter[] = [];
    for (const p of this.players.values()) if (this.live(p) && !this.inCrowd(p) && !p.f.held) list.push(p.f);
    const lim = this.ringR - 0.42;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].s;
        const b = list[j].s;
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        if (Math.abs(b.y - a.y) > 1.2) continue;
        const d2 = dx * dx + dz * dz;
        if (d2 >= FC_BODY * FC_BODY) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-4) {
          dx = 1;
          dz = 0;
          d = 1;
        } else {
          dx /= d;
          dz /= d;
        }
        const push = (FC_BODY - Math.min(d, FC_BODY)) * 0.25;
        a.x -= dx * push;
        a.z -= dz * push;
        b.x += dx * push;
        b.z += dz * push;
      }
    }
    for (const f of list) {
      const s = f.s;
      const r = Math.sqrt(s.x * s.x + s.z * s.z);
      if (r > lim) {
        s.x *= lim / r;
        s.z *= lim / r;
      }
    }
  }

  /** Темнота бьёт тех, кто за краем света. */
  private darkness(): void {
    const dps = FC_DARK_DPS[this.zone.stage] ?? 0;
    for (const p of this.players.values()) {
      if (!this.live(p) || this.inCrowd(p)) continue;
      const f = p.f;
      const r = Math.sqrt(f.s.x * f.s.x + f.s.z * f.s.z);
      if (dps === 0 || r <= this.zone.r) {
        f.dark = 0;
        continue;
      }
      f.dark += dps;
      while (f.dark >= TICK_RATE && !f.ko) {
        f.dark -= TICK_RATE;
        hurt(f, 1, f.s.vx, f.s.vz, 0, 0);
      }
      if (f.ko) this.onKo(p, null);
    }
  }

  private onKo(v: FcPlayer, by: FcPlayer | null): void {
    if (v.out) return;
    v.out = true;
    v.koAt = this.tick;
    if (by && by !== v) by.kos++;
    this.release(v);
    this.events.push(['ko', v.id, by ? by.id : 0]);
    this.rosterDirty = true;
  }

  /** Раунд кончился? Дуэль и команды — одна сторона легла; свалка — остался один. */
  private checkRound(): void {
    if (this.mode === 'ffa') {
      this.checkFfa();
      return;
    }
    const alive = [0, 0];
    const present = [0, 0];
    for (const p of this.players.values()) {
      if (!p.fighter || p.team < 0) continue;
      present[p.team]++;
      if (!p.f.ko) alive[p.team]++;
    }
    // сторона ушла совсем — бой окончен
    if (present[0] === 0 || present[1] === 0) {
      const w = present[0] > 0 ? 0 : present[1] > 0 ? 1 : -1;
      if (w >= 0) this.wins[w] = Math.max(this.wins[w], FC_WINS);
      this.endRound(w, true);
      return;
    }
    if (alive[0] > 0 && alive[1] > 0) return;
    const w = alive[0] > 0 ? 0 : alive[1] > 0 ? 1 : -1;
    if (w >= 0) {
      this.wins[w]++;
      for (const p of this.players.values()) if (p.fighter && p.team === w) p.wins++;
    }
    this.endRound(w, (w >= 0 && this.wins[w] >= FC_WINS) || this.round >= FC_MAX_ROUNDS);
  }

  private endRound(winner: number, over: boolean): void {
    this.lastWin = winner;
    this.matchOver = over;
    this.phase = FP_PAUSE;
    this.phaseEnd = this.tick + FC_PAUSE_TICKS;
    this.rosterDirty = true;
    this.sendPhase();
  }

  private checkFfa(): void {
    let alive = 0;
    const fresh: FcPlayer[] = [];
    for (const p of this.players.values()) {
      if (!p.fighter) continue;
      if (!p.f.ko) alive++;
      else if (p.place === 0) fresh.push(p);
    }
    // выбывшие в одном тике делят лучшее из своих мест
    for (const p of fresh) p.place = alive + 1;
    const timeUp = this.tick - this.roundStart >= FC_FFA_MAX_TICKS;
    if (alive > 1 && !timeUp) return;
    const rest = [...this.players.values()].filter((p) => p.fighter && !p.f.ko);
    rest.sort((a, b) => b.f.hp - a.f.hp);
    rest.forEach((p, i) => {
      p.place = i > 0 && p.f.hp === rest[i - 1].f.hp ? rest[i - 1].place : i + 1;
    });
    const champ = rest[0] ?? null;
    if (champ) champ.wins++;
    this.lastWin = champ ? champ.id : -1;
    this.finish();
  }

  /** Итоги: места, жетоны людям (через хук), таблица всем. */
  private finish(): void {
    this.phase = FP_END;
    this.phaseEnd = this.tick + FC_END_TICKS;
    const fighters = [...this.players.values()].filter((p) => p.fighter);
    let winTeam = -1;
    if (this.mode !== 'ffa') {
      winTeam = this.wins[0] > this.wins[1] ? 0 : this.wins[1] > this.wins[0] ? 1 : -1;
      for (const p of fighters) p.place = winTeam < 0 ? 0 : p.team === winTeam ? 1 : 2;
      this.lastWin = winTeam;
    }
    const rows: FcResultRow[] = [];
    for (const p of fighters) {
      const won = this.mode === 'ffa' ? p.place === 1 : winTeam >= 0 && p.team === winTeam;
      const row: FcResultRow = { id: p.id, nick: p.nick, bot: !!p.bot, team: p.team, place: p.place, kos: p.kos, dmg: p.dmg, won, tokens: 0 };
      if (!p.bot) {
        const reward = fightReward({ mode: this.mode, won, place: p.place, fighters: this.fightersAtStart, kos: p.kos, dmg: p.dmg });
        row.tokens = reward.total;
        p.sink?.sendJson({ t: 'fcReward', ...reward });
        this.hooks.result(p, row, reward);
      }
      rows.push(row);
    }
    rows.sort((a, b) => (a.place || 99) - (b.place || 99) || b.kos - a.kos || b.dmg - a.dmg);
    this.broadcast({ t: 'fcEnd', mode: this.mode, rows });
    this.sendPhase();
    // у ботов «Бот» уже в имени
    const champs = rows.filter((r) => r.won).map((r) => r.nick);
    this.hooks.announce?.(champs.length
      ? `🧼 Из подвала «Чайки» победителем вышел${champs.length > 1 ? 'и' : ''} ${champs.join(' и ')} (${FC_MODE_NAME[this.mode]}). Подробности — никому.`
      : '🧼 В подвале «Чайки» ничья. Подробности — никому.');
  }

  /** Отлежавшиеся после нокаута встают в толпу (каждому своё место); кто встал или вернулся — в состав. */
  private crowdCheck(): void {
    for (const p of this.players.values()) {
      const c = this.inCrowd(p);
      if (c && p.slot < 0) p.slot = this.freeSlot();
      if (c === p.wasCrowd) continue;
      p.wasCrowd = c;
      this.rosterDirty = true;
    }
  }

  // ------------------------------------------------------------ рассылка

  private sendPhase(): void {
    this.broadcast({ t: 'fcPhase', phase: this.phase, phaseEnd: this.phaseEnd, round: this.round, wins: [this.wins[0], this.wins[1]], win: this.lastWin });
  }

  broadcast(msg: ServerMsg): void {
    for (const p of this.players.values()) p.sink?.sendJson(msg);
  }

  /** Статус для картона у двери на набережной: раунд и счёт (свалка — сколько ещё на ногах) */
  status(): { mode: FcMode; round: number; score: number[]; names: string[] } {
    const names: string[] = [];
    let alive = 0;
    for (const p of this.players.values()) {
      if (!p.fighter) continue;
      names.push(p.nick);
      if (!p.f.ko) alive++;
    }
    return { mode: this.mode, round: this.round, score: this.mode === 'ffa' ? [alive] : [this.wins[0], this.wins[1]], names };
  }

  private sendSnapshots(): void {
    const list: EntitySnap[] = [];
    const rows: FightTailRow[] = [];
    for (const p of this.players.values()) {
      const f = p.f;
      if (this.inCrowd(p)) {
        const c = crowdSpot(Math.max(0, p.slot), this.ringR);
        list.push({ id: p.id, flags: E_ALIVE | E_GROUNDED | (p.team === 1 ? E_TEAM : 0), x: c.x, y: 0, z: c.z, yaw: c.yaw, pitch: 0, hp: f.hp, armor: 0 });
        rows.push({ act: FA_NONE, actT: 0, xf: 0 });
        continue;
      }
      const s = f.s;
      // нокаутированный лежит лужицей: без E_ALIVE
      let flags = (f.ko ? 0 : E_ALIVE) | FE_FIGHTER;
      if (s.grounded) flags |= E_GROUNDED;
      if (s.dashT > 0) flags |= E_DASH;
      if (p.team === 1) flags |= E_TEAM;
      if (f.block) flags |= FE_BLOCK;
      if (f.stun > 0) flags |= FE_STUN;
      if (f.held) flags |= FE_HELD;
      list.push({ id: p.id, flags, x: s.x, y: s.y, z: s.z, yaw: f.yaw, pitch: 0, hp: f.hp, armor: staminaPct(f) });
      let xf = 0;
      if (f.inv > 0) xf |= FX_INV;
      if (f.grab) xf |= FX_HOLDING;
      if (f.bstun > 0) xf |= FX_BSTUN;
      if (f.st < MOVES[FA_JAB].cost) xf |= FX_WINDED;
      rows.push({ act: f.act, actT: f.actT, xf });
    }
    const entities = encodeEntities(list);
    const h = this.header;
    h.tick = this.tick;
    h.phase = this.phase;
    h.phaseEnd = this.phaseEnd;
    h.scoreA = this.wins[0];
    h.scoreB = this.wins[1];
    h.pickups = this.round;
    const evMsg: ServerMsg | null = this.events.length ? { t: 'fcEv', k: this.tick, e: this.events } : null;
    for (const p of this.players.values()) {
      if (!p.sink) continue;
      const self = p.fighter && !this.inCrowd(p) ? p.f : null;
      h.ack = p.inq.ack;
      h.queue = p.inq.length;
      h.flags = p.selfReset ? SNAP_SELF_RESET : 0;
      if (self) p.selfReset = false;
      p.sink.sendBinary(encodeSnapshot(h, self ? self.s : null, joinBody(entities, encodeFightTail(this.zone, self, rows))));
      if (evMsg) p.sink.sendJson(evMsg);
    }
    this.events = [];
  }
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
