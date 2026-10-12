// «Выше облаков» на сервере: Небесная каланча, подъём к колоколу и лёгкий «забег» компании.
// Забег: первый вошедший открывает сбор (pre) — кто вошёл за это время, стоит на старте без движения (экран загрузки
// продлевает сбор через prestart.phaseEnd); старт всем разом; первый колокол — звук всем и строка в чат комнаты;
// после всех (или через 30 с после первого) — итоги (done), потом свободный подъём (none) и «Ещё забег» по E.
// Кто вошёл посреди забега — лезет со своим временем: места нет, рекорд и медаль считаются.
import { aquaClock } from '../../shared/aquadyn.ts';
import { makeSkillMap } from '../../shared/skillmap.ts';
import { SkillDynamics, inBell, onCheckpoint } from '../../shared/skillphysics.ts';
import {
  SKILL_AFTER_FIRST_TICKS, SKILL_AGAIN_TICKS, SKILL_CAPACITY, SKILL_COURSE, SKILL_GATHER_TICKS, SKILL_REJOIN_TICKS, SKILL_RESULTS_TICKS,
  makeSkillProgress, skillClock, skillMedal, skillMs, type SkillFinish, type SkillPeer, type SkillPhase, type SkillProgress,
  type SkillRaceView, type SkillRow, type SkillServerMsg,
} from '../../shared/skilltest.ts';
import { makeEvents, makeInput, makeState, type Input, type PlayerState } from '../../shared/sim.ts';
import type { Outfit } from '../../shared/outfit.ts';
import { CollisionWorld } from '../../shared/world.ts';
import { InputQueue } from '../inputs.ts';

export interface SkillSink { sendJson(msg: SkillServerMsg): void }

/**
 * Входы не приходят (лаг, вкладка свёрнута): столько тиков не додумываем шаги — догадка сервера на узком месте роняла
 * бы того, кто у себя допрыгнул (как на полосе аквапарка); дальше желейка падает и едет сама.
 */
const IDLE_WAIT = 90;

export interface SkillPlayer {
  id: number; pid: number; level: number; nick: string; outfit: Outfit; sink: SkillSink;
  state: PlayerState; input: InputQueue; progress: SkillProgress; yaw: number; prevTick: number;
  reset: number; lastAction: number; lastUse: number;
  /** Личный рекорд, мс (0 — не было) */
  best: number;
  /** Место на старте забега */
  slot: number;
}

/** Забег комнаты (один на всех). phaseEnd — его меняет и экран загрузки (prestart), поэтому объект живой. */
export interface SkillRace {
  id: number;
  phase: SkillPhase;
  phaseEnd: number;
  start: number;
  /** Тик первого колокола (0 — ещё не было) */
  firstAt: number;
  racers: Set<number>;
  rows: SkillRow[];
}

/** Карточка финиша без места: её собирает хаб (профиль, жетоны). */
export type SkillReward = Omit<SkillFinish, 'place'>;

export class SkillGame {
  readonly map = makeSkillMap();
  readonly world = new CollisionWorld(this.map);
  readonly dynamics = new SkillDynamics(this.map, this.world);
  readonly players = new Map<number, SkillPlayer>();
  readonly race: SkillRace = { id: 0, phase: 'none', phaseEnd: 0, start: 0, firstAt: 0, racers: new Set(), rows: [] };
  private readonly saved = new Map<number, { progress: SkillProgress; until: number; leftTick: number; leftMs: number }>();
  /** Вставшие на точку командой разработчика (/cp): их колокол — без наград и рекорда */
  private readonly dev = new Set<number>();
  private readonly now: () => number;
  private nextId = 1;
  private readonly ev = makeEvents();
  private readonly idle = makeInput();
  tick = 0;
  onAfk: (p: SkillPlayer) => void = () => {};
  /** Позвонил в колокол: профиль и жетоны (хаб). null — гость или без профиля. */
  onFinish: (p: SkillPlayer, ticks: number, falls: number, place: number) => SkillReward | null = () => null;
  /** Строка в чат комнаты */
  onChat: (text: string) => void = () => {};

  constructor(now: () => number = Date.now) { this.now = now; }

  addHuman(info: { pid: number; level?: number; nick: string; outfit: Outfit; best?: number }, sink: SkillSink): SkillPlayer | null {
    if (this.players.size >= SKILL_CAPACITY || [...this.players.values()].some((p) => p.pid === info.pid)) return null;
    const saved = this.saved.get(info.pid);
    const elapsedMs = saved ? Math.max(0, this.now() - saved.leftMs) : 0;
    const restore = !!saved && saved.until > this.tick && elapsedMs < (SKILL_REJOIN_TICKS * 1000) / 60 && (saved.progress.checkpoint > 0 || saved.progress.startedAt !== null);
    const progress = restore ? { ...saved!.progress, racer: false } : makeSkillProgress(saved ? saved.progress.run + 1 : 1);
    // Хаб спит без людей: вернувшемуся время отсутствия засчитывается, уже отсчитанные с друзьями тики — нет.
    if (restore && progress.startedAt !== null && progress.finishedAt === null) {
      progress.startedAt -= Math.max(0, Math.floor((elapsedMs * 60) / 1000) - (this.tick - saved!.leftTick));
    }
    this.saved.delete(info.pid);
    const p: SkillPlayer = {
      id: this.nextId++, pid: info.pid, level: info.level ?? 1, nick: info.nick, outfit: info.outfit, sink, best: info.best ?? 0,
      state: makeState(), input: new InputQueue(), progress, yaw: -Math.PI / 2, prevTick: NaN, reset: 0, lastAction: this.tick, lastUse: -999, slot: 0,
    };
    const empty = this.players.size === 0;
    this.players.set(p.id, p);
    // Компания входит вместе: первый открывает сбор, вошедшие за время сбора стартуют вместе с ним.
    if (!restore && (this.race.phase === 'pre' || (empty && this.race.phase === 'none'))) {
      if (this.race.phase !== 'pre') this.openRace(SKILL_GATHER_TICKS);
      this.enlist(p);
    } else this.respawn(p, false);
    this.send(p);
    return p;
  }

  removePlayer(id: number): void {
    const p = this.players.get(id);
    if (!p) return;
    this.saved.set(p.pid, { progress: { ...p.progress }, until: this.tick + SKILL_REJOIN_TICKS, leftTick: this.tick, leftMs: this.now() });
    this.players.delete(id);
    this.race.racers.delete(p.pid);
    // Ограниченная память возвращений на процесс; профиль не трогаем.
    while (this.saved.size > 64) this.saved.delete(this.saved.keys().next().value!);
    if (this.players.size === 0) {
      this.race.phase = 'none';
      this.race.racers.clear();
    }
  }

  onInputs(p: SkillPlayer, inputs: Input[], count: number): void {
    p.input.push(inputs, Math.min(count, inputs.length), 120);
  }

  /** 0 — сначала, 1 — к точке, 2 — ещё забег. */
  use(p: SkillPlayer, id: number): void {
    if ((id !== 0 && id !== 1 && id !== 2) || this.tick - p.lastUse < 60) return;
    p.lastUse = this.tick;
    p.lastAction = this.tick;
    const race = this.race;
    if (id === 2) {
      if (race.phase === 'none' || race.phase === 'done') {
        this.openRace(SKILL_AGAIN_TICKS);
        // в новый забег — все, кто не лезет сейчас своим подъёмом, и тот, кто позвал
        for (const q of this.players.values()) {
          const busy = q.progress.startedAt !== null && q.progress.finishedAt === null;
          if (q === p || !busy) this.enlist(q);
        }
      } else if (race.phase === 'pre' && !race.racers.has(p.pid)) this.enlist(p);
      this.sendAll();
      return;
    }
    if (race.phase === 'pre' && race.racers.has(p.pid)) return; // на старте и так стоит
    if (id === 0) {
      race.racers.delete(p.pid);
      if (race.phase === 'pre') this.enlist(p);
      else {
        p.progress = makeSkillProgress(p.progress.run + 1);
        this.respawn(p, false);
      }
    } else this.respawn(p, p.progress.startedAt !== null && p.progress.finishedAt === null);
    this.send(p);
  }

  /** Только для проверок (сервер с --dev): встать на флажок n; время идёт, но награды и рекорда не будет. */
  devCheckpoint(p: SkillPlayer, n: number): void {
    if (!Number.isInteger(n) || n < 0 || n >= this.map.checkpoints.length) return;
    this.race.racers.delete(p.pid);
    p.progress = makeSkillProgress(p.progress.run + 1);
    p.progress.checkpoint = n;
    p.progress.startedAt = this.tick;
    this.dev.add(p.pid);
    this.respawn(p, false);
    this.send(p);
  }

  /** Только для проверок (--dev): поставить в точку; подъём без наград. */
  devTeleport(p: SkillPlayer, x: number, y: number, z: number): void {
    if (![x, y, z].every(Number.isFinite) || Math.abs(x) > 60 || Math.abs(z) > 60 || y < -5 || y > 80) return;
    this.dev.add(p.pid);
    this.race.racers.delete(p.pid);
    p.state = Object.assign(makeState(), { x, y, z });
    p.reset++;
    p.prevTick = NaN;
    p.input.ack = Math.max(p.input.ack, p.input.lastSeq);
    p.input.items.length = 0;
    this.send(p);
  }

  /** Открыть сбор забега. */
  private openRace(ticks: number): void {
    const race = this.race;
    race.id++;
    race.phase = 'pre';
    race.phaseEnd = this.tick + ticks;
    race.start = 0;
    race.firstAt = 0;
    race.racers.clear();
    race.rows = [];
  }

  /** В забег: заново, на свою клетку старта. */
  private enlist(p: SkillPlayer): void {
    const taken = new Set([...this.players.values()].filter((q) => q !== p && this.race.racers.has(q.pid)).map((q) => q.slot));
    let slot = 0;
    while (taken.has(slot) && slot < this.map.slots.length - 1) slot++;
    p.slot = slot;
    this.race.racers.add(p.pid);
    p.progress = makeSkillProgress(p.progress.run + 1, true);
    this.respawn(p, false);
  }

  respawn(p: SkillPlayer, fall: boolean): void {
    const onSlot = this.race.phase === 'pre' && this.race.racers.has(p.pid);
    const cp = this.map.checkpoints[p.progress.checkpoint];
    const at = onSlot ? this.map.slots[p.slot] : { x: cp.px, y: cp.y, z: cp.pz, yaw: cp.yaw };
    p.state = Object.assign(makeState(), { x: at.x, y: at.y, z: at.z, grounded: 1 });
    p.yaw = at.yaw;
    p.reset++;
    p.prevTick = NaN;
    // Упал — накопленные шаги выбрасываем и подтверждаем: клиент не переиграет их с новой точки.
    p.input.ack = Math.max(p.input.ack, p.input.lastSeq);
    p.input.items.length = 0;
    if (fall) p.progress.falls++;
  }

  /** Только ноги, посчитанные сервером, двигают подъём: точки, колокол, падения. vt — время шага игрока. */
  checkProgress(p: SkillPlayer, vt: number): void {
    const s = p.state;
    const progress = p.progress;
    const kill = this.map.checkpoints[progress.checkpoint].kill;
    if (s.y < kill || !Number.isFinite(s.x + s.y + s.z) || Math.abs(s.x) > 60 || Math.abs(s.z) > 60) {
      this.respawn(p, progress.startedAt !== null && progress.finishedAt === null);
      return;
    }
    const racer = this.race.racers.has(p.pid);
    if (racer && this.race.phase === 'pre') return;
    if (progress.finishedAt !== null) return;
    if (progress.startedAt === null) {
      const st = this.map.start;
      if (s.x >= st.x0 && s.x <= st.x1 && s.z >= st.z0 && s.z <= st.z1) return;
      progress.startedAt = vt;
    }
    for (let i = this.map.checkpoints.length - 1; i > progress.checkpoint; i--) {
      if (onCheckpoint(this.map, s, i)) {
        progress.checkpoint = i;
        break;
      }
    }
    if (inBell(this.map, s)) this.finish(p, vt);
  }

  private finish(p: SkillPlayer, vt: number): void {
    const progress = p.progress;
    const race = this.race;
    const ticks = Math.max(1, Math.round(vt - (progress.startedAt ?? vt)));
    progress.finishedAt = (progress.startedAt ?? vt) + ticks;
    const racing = race.phase === 'run' && race.racers.has(p.pid);
    const place = racing ? race.rows.filter((r) => r.place > 0).length + 1 : 0;
    if (racing) race.rows.push({ pid: p.pid, nick: p.nick, ticks, falls: progress.falls, place, medal: skillMedal(ticks) });
    const first = place === 1;
    if (first) {
      race.firstAt = this.tick;
      race.phaseEnd = this.tick + SKILL_AFTER_FIRST_TICKS;
    }
    const time = skillClock(ticks);
    this.onChat(first && race.racers.size > 1 ? `${p.nick} первым позвонил в колокол — ${time}!` : `${p.nick} позвонил в колокол — ${time}${first ? '!' : ''}`);
    for (const q of this.players.values()) q.sink.sendJson({ t: 'skill_bell', pid: p.pid, nick: p.nick, ticks, first });
    const reward = this.dev.has(p.pid) ? null : this.onFinish(p, ticks, progress.falls, place);
    const ms = skillMs(ticks);
    const card: SkillReward = reward ?? {
      ticks, falls: progress.falls, medal: skillMedal(ticks), best: p.best > 0 ? Math.min(p.best, ms) : ms, newBest: p.best <= 0 || ms < p.best,
      tokens: 0, medalUp: false, clean: false, daily: false,
    };
    if (!this.dev.has(p.pid)) p.best = card.best;
    p.sink.sendJson({ t: 'skill_finish', ...card, place });
    this.send(p);
  }

  /** Итоги забега: кто не дошёл — в табличке без места. */
  private closeRace(): void {
    const race = this.race;
    for (const p of this.players.values()) {
      if (race.racers.has(p.pid) && !race.rows.some((r) => r.pid === p.pid)) race.rows.push({ pid: p.pid, nick: p.nick, ticks: 0, falls: p.progress.falls, place: 0, medal: 0 });
    }
    race.phase = 'done';
    race.phaseEnd = this.tick + SKILL_RESULTS_TICKS;
    this.sendAll();
  }

  private stepRace(): void {
    const race = this.race;
    if (race.phase === 'pre' && this.tick >= race.phaseEnd) {
      if (race.racers.size === 0) {
        race.phase = 'none';
        return;
      }
      race.phase = 'run';
      race.start = race.phaseEnd;
      race.phaseEnd = 0;
      for (const p of this.players.values()) if (race.racers.has(p.pid)) p.progress.startedAt = race.start;
      this.sendAll();
    } else if (race.phase === 'run') {
      const left = [...this.players.values()].filter((p) => race.racers.has(p.pid) && p.progress.finishedAt === null).length;
      if (race.racers.size === 0) race.phase = 'none';
      else if (left === 0 || (race.firstAt > 0 && this.tick >= race.phaseEnd)) this.closeRace();
    } else if (race.phase === 'done' && this.tick >= race.phaseEnd) {
      race.phase = 'none';
      this.sendAll();
    }
  }

  step(): void {
    this.tick++;
    const now = this.now();
    for (const [pid, saved] of this.saved) if (saved.until <= this.tick || now - saved.leftMs >= (SKILL_REJOIN_TICKS * 1000) / 60) this.saved.delete(pid);
    this.stepRace();
    const race = this.race;
    for (const p of this.players.values()) {
      const racer = race.racers.has(p.pid);
      // на сборе кнопки не действуют до старта; после старта — до старта по часам самого игрока
      this.dynamics.lockUntil = racer && race.phase === 'pre' ? race.phaseEnd : racer && race.phase === 'run' ? race.start : 0;
      const n = p.input.due();
      if (n) {
        for (let i = 0; i < n; i++) {
          if (!p.input.length) break;
          const inp = p.input.shift();
          inp.viewTick = aquaClock(inp.viewTick, Number.isFinite(p.prevTick) ? p.prevTick : 0, this.tick);
          if (inp.buttons || Math.abs(inp.yaw - p.yaw) > 0.02) p.lastAction = this.tick;
          p.yaw = inp.yaw;
          this.dynamics.step(p.state, inp, p.prevTick, this.ev);
          p.prevTick = inp.viewTick;
          this.checkProgress(p, inp.viewTick);
        }
      } else if (++p.input.starve <= IDLE_WAIT) {
        // ждём настоящие входы; точки и колокол — по тому, где стоит сейчас
        this.checkProgress(p, Number.isFinite(p.prevTick) ? p.prevTick : this.tick);
      } else {
        // Без входов дольше 1,5 с (вкладка спит) желейка всё равно падает и ездит, время идёт.
        const idle = this.idle;
        idle.buttons = 0;
        idle.yaw = p.yaw;
        idle.viewTick = this.tick;
        this.dynamics.step(p.state, idle, p.prevTick, this.ev);
        p.prevTick = this.tick;
        this.checkProgress(p, this.tick);
      }
      if (this.tick - p.lastAction >= 5 * 60 * 60) this.onAfk(p);
    }
    if (this.tick % 6 === 0) this.sendAll();
  }

  raceView(): SkillRaceView {
    const r = this.race;
    return { id: r.id, phase: r.phase, phaseEnd: r.phaseEnd, start: r.start, racers: r.racers.size, rows: r.rows.map((x) => ({ ...x })) };
  }

  peers(): SkillPeer[] {
    return [...this.players.values()].map((p) => {
      const pr = p.progress;
      const ticks = pr.startedAt === null ? 0 : (pr.finishedAt ?? this.tick) - pr.startedAt;
      return {
        id: p.id, pid: p.pid, level: p.level, nick: p.nick, outfit: p.outfit, x: p.state.x, y: p.state.y, z: p.state.z, yaw: p.yaw,
        grounded: p.state.grounded, checkpoint: pr.checkpoint, finished: pr.finishedAt !== null, racer: this.race.racers.has(p.pid),
        ticks: Math.max(0, ticks), knock: p.state.fireCd, vt: Number.isFinite(p.prevTick) ? p.prevTick : this.tick,
      };
    });
  }

  private sendAll(): void {
    for (const p of this.players.values()) this.send(p);
  }

  send(p: SkillPlayer): void {
    p.sink.sendJson({
      t: 'skill_state', course: SKILL_COURSE, tick: this.tick, id: p.id, ack: p.input.ack, state: { ...p.state }, reset: p.reset,
      progress: { ...p.progress }, peers: this.peers(), race: this.raceView(), best: p.best,
    });
  }
}
