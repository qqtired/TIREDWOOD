// Прятки 2.0 «Рыбный двор» — сервер решает всё: роли, превращения, краску, попадания с компенсацией задержки,
// заражение, насмешки, очки и жетоны. Клиенту в снимке уходят предметы без признака «живой» (id случайные, общий список).
import { randomInt } from 'node:crypto';
import { EYE_HEIGHT } from '../../shared/constants.ts';
import {
  HIDE_CAPACITY, HIDE_COUNT_TICKS, HIDE_FINAL_TICKS, HIDE_MAX_REWIND, HIDE_MIN, HIDE_PODIUM_TICKS, HIDE_PREP_TICKS, HIDE_REJOIN_TICKS,
  HIDE_RESPAWN_TICKS, HIDE_RESULT_TICKS, HIDE_ROUNDS, HIDE_SEEK_TICKS, HIDE_SHOT_RANGE, HIDE_SHOT_TICKS, HIDE_TAKE_PREP_TICKS, HIDE_TAKE_RANGE,
  HIDE_TAKE_TICKS, HIDE_TOKENS, PAINT, PTS, TAUNT, hideHunterCount,
  type HideClientMsg, type HideEvent, type HidePhase, type HideResult, type HideRole, type HideRoundResult, type HideRow, type HideServerMsg,
  type HideShotKind, type HideStateMsg,
} from '../../shared/hide.ts';
import { HIDE_KIND, HIDE_YAW_STEPS, hideHits, hideKindIndex, type HideKind } from '../../shared/hideprops.ts';
import { HIDE_POOLS, HIDE_SLOTS, YARD } from '../../shared/hidemap.ts';
import { HidePhysics, hideFillProps, hideFits, hideMotionWorld, hideRayBody, hideStaticWorld, type HideBody } from '../../shared/hidephysics.ts';
import { viewDir } from '../../shared/math.ts';
import type { Outfit } from '../../shared/outfit.ts';
import { makeState, type Input, type PlayerState } from '../../shared/sim.ts';
import { makeRayHit } from '../../shared/world.ts';
import { InputQueue } from '../inputs.ts';
import { HideHistory } from './history.ts';
import { catchText, paintOutText, podiumBonus, roundLines, roundTokens, tauntPoints, type RoundStat } from './score.ts';

export interface HideSink { sendJson(msg: HideServerMsg): void }
interface PendingShot { aim: [number, number]; view: number; seq: number; at: number }

export interface HidePlayer {
  id: number; pid: number; nick: string; level: number; outfit: Outfit; sink: HideSink | null; connected: boolean; leftAt: number;
  state: PlayerState; input: InputQueue; physics: HidePhysics; reset: number; yaw: number; pitch: number; lastPacket: number; lastAction: number;
  role: HideRole; kind: HideKind; prop: number; propYaw: number; locked: boolean; hits: number; stains: number;
  paint: number; jam: boolean; lastShot: number; pending: PendingShot | null;
  takeAt: number; tauntAt: number; tauntCd: number; back: number;
  /** раунд, в котором участвует (0 — ждёт следующего) */
  round: number; rewardEligible: boolean; awarded: boolean;
  /** очки: за этот раунд и за матч; сколько раз начинал раунд ищущим в этом матче и когда последний раз */
  pts: number; score: number; startedHunter: number; lastHunterRound: number;
  // для честных наград и итогов раунда
  moved: number; chose: boolean; shots: number; lastHuntAt: number; finds: number; wasProp: boolean;
  caughtAt: number; survivedEnd: boolean; tauntPts: number; misses: number; paintOuts: number; lastMiss: HideKind | null; transforms: number;
  /** что из предметов уже отправлено этому игроку (id → строка) и для какого раунда — снимки идут дельтой */
  sent: Map<number, string>; sentEpoch: string;
}
interface Hooks { finished(pid: number, result: HideResult): void; rand?: (n: number) => number }

const START_KINDS: readonly HideKind[] = ['crate', 'barrel', 'bucket', 'sack', 'pot', 'churn'];
const SURVIVAL_EVERY = 60;
/** Анти-AFK: сколько метров надо пройти за раунд. Прячущемуся хватит пары шагов до предмета у колодца, ищущему — выйти из сарая. */
const PROP_MOVE = 1.5, HUNT_MOVE = 4;

export class HideGame {
  /** Неподвижный мир: лучи выстрелов, видимость */
  readonly world = hideStaticWorld();
  /** Мир движения: неподвижное + коробки всех предметов */
  readonly motion = hideMotionWorld();
  readonly players = new Map<number, HidePlayer>();
  tick = 0; round = 0; match = 0; phase: HidePhase = 'gather'; phaseEnd = 0; seekAt = 0;
  notice = 'Нужно 2–8 игроков';
  result: HideRoundResult | null = null;
  /** Предметы двора этого раунда (неподвижные) */
  decor: HideBody[] = [];
  private readonly hooks: Hooks;
  private readonly rand: (n: number) => number;
  private readonly history = new HideHistory();
  private readonly hit = makeRayHit();
  private readonly dir = { x: 0, y: 0, z: 0 };
  private readonly rewound: HideBody = { id: 0, kind: 'crate', x: 0, y: 0, z: 0, yaw: 0 };
  private readonly normal = { nx: 0, ny: 0, nz: 0 };
  private nextId = 1;
  private shotSerial = 0;
  private initialProps = 0;
  private finalSaid = false;
  private lastOneSaid = false;
  private anyCaught = false;
  private events: HideEvent[] = [];
  private rosterDirty = true;

  constructor(hooks: Hooks) { this.hooks = hooks; this.rand = hooks.rand ?? randomInt; }

  get humans(): number { let n = 0; for (const p of this.players.values()) if (p.connected) n++; return n; }
  get active(): boolean { return this.phase !== 'gather' || this.phaseEnd > 0; }
  get busy(): number { let n = 0; if (this.phase !== 'gather') for (const p of this.players.values()) if (p.connected && p.round === this.round && p.role !== 'spectator') n++; return n; }
  canRejoin(pid: number): boolean {
    return [...this.players.values()].some(p => p.pid === pid && !p.connected && p.role !== 'spectator' && this.tick - p.leftAt < HIDE_REJOIN_TICKS);
  }

  // ------------------------------------------------------------ вход и выход

  addHuman(info: { pid: number; nick: string; level: number; outfit: Outfit }, sink: HideSink): HidePlayer | null {
    const old = [...this.players.values()].find(p => p.pid === info.pid);
    if (old?.connected || this.humans >= HIDE_CAPACITY) return null;
    if (old) {
      // Возврат в окне: прежняя роль и место, но право на награду этого раунда не возвращается
      Object.assign(old, { connected: true, sink, nick: info.nick, outfit: info.outfit, level: info.level, lastPacket: this.tick, sentEpoch: '' });
      old.sent.clear(); old.input.reset(); old.reset++; this.rosterDirty = true;
      this.recount(); this.flush(); this.send(old);
      return old;
    }
    const p: HidePlayer = {
      ...info, id: this.nextId++, sink, connected: true, leftAt: 0,
      state: Object.assign(makeState(), this.hunterSpot(0), { grounded: 1 }), input: new InputQueue(), physics: new HidePhysics(this.motion),
      reset: 0, yaw: 0, pitch: 0, lastPacket: this.tick, lastAction: -9999,
      role: 'spectator', kind: 'crate', prop: 0, propYaw: 0, locked: false, hits: 0, stains: 0,
      paint: PAINT.max, jam: false, lastShot: -9999, pending: null, takeAt: 0, tauntAt: 0, tauntCd: 0, back: 0,
      round: 0, rewardEligible: false, awarded: false, pts: 0, score: 0, startedHunter: 0, lastHunterRound: -1,
      moved: 0, chose: false, shots: 0, lastHuntAt: -9999, finds: 0, wasProp: false,
      caughtAt: 0, survivedEnd: false, tauntPts: 0, misses: 0, paintOuts: 0, lastMiss: null, transforms: 0,
      sent: new Map(), sentEpoch: '',
    };
    this.players.set(p.id, p);
    // Поздний вход: в подготовке — прячется, в поиске — через 3 с выходит ищущим; между раундами ждёт
    if (this.phase === 'hide') { this.joinRound(p); this.makeProp(p, this.propCount()); }
    else if (this.phase === 'seek') { this.joinRound(p); this.makeCaught(p); }
    this.rosterDirty = true;
    this.recount(); this.flush(); this.send(p);
    return p;
  }

  removePlayer(id: number): void {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = false; p.sink = null; p.leftAt = this.tick; p.rewardEligible = false; p.pending = null;
    if (this.phase === 'gather' || this.phase === 'result' || this.phase === 'final' || p.role === 'spectator') this.players.delete(id);
    this.rosterDirty = true;
    this.recount();
  }

  onInputs(p: HidePlayer, inputs: Input[], count: number): void {
    if (!p.connected) return;
    p.lastPacket = this.tick;
    const valid = inputs.slice(0, Math.max(0, Math.min(count, inputs.length))).filter(i => Number.isFinite(i.yaw) && Number.isFinite(i.pitch));
    p.input.push(valid, valid.length);
  }

  // ------------------------------------------------------------ действия

  action(p: HidePlayer, msg: HideClientMsg): void {
    if (!p.connected || (this.phase !== 'hide' && this.phase !== 'seek')) return;
    if (msg.a === 'shoot') { this.requestShot(p, msg); return; }
    if (p.role !== 'prop' || this.tick - p.lastAction < 9) return;
    p.lastAction = this.tick;
    if (msg.a === 'take') this.take(p, msg.id);
    else if (msg.a === 'lock') { p.locked = !p.locked; p.chose = true; p.reset++; }
    else if (msg.a === 'rotate') this.rotate(p, msg.n);
    else if (msg.a === 'taunt') {
      if (this.phase !== 'seek') this.note(p, 'Насмешки — когда выйдут ищущие');
      else if (this.tick < p.tauntCd) this.note(p, `Ещё ${Math.ceil((p.tauntCd - this.tick) / 60)} с`);
      else this.taunt(p, false);
    }
    this.flush(); this.send(p);
  }

  private take(p: HidePlayer, id: unknown): void {
    if (typeof id !== 'number' || !Number.isInteger(id)) return;
    if (this.tick < p.takeAt) { this.note(p, `Превращение через ${Math.ceil((p.takeAt - this.tick) / 60)} с`); return; }
    const target = this.bodies().find(b => b.id === id && b.id !== p.prop);
    if (!target) return;
    const dx = target.x - p.state.x, dz = target.z - p.state.z, dist = Math.hypot(dx, dz);
    if (dist > HIDE_TAKE_RANGE + 0.5) { this.note(p, 'Слишком далеко — подойди ближе'); return; }
    const ty = target.y + HIDE_KIND[target.kind].h / 2, oy = p.state.y + 0.4, dy = ty - oy, len = Math.hypot(dx, dy, dz);
    if (len > 0.4 && this.world.raycast(p.state.x, oy, p.state.z, dx / len, dy / len, dz / len, len - 0.3, this.hit, true, true)) { this.note(p, 'Не видно — подойди ближе'); return; }
    if (p.hits >= hideHits(target.kind)) { this.note(p, `Слишком заляпан для такого — нужен предмет покрепче`); return; }
    hideFillProps(this.motion, this.bodies(), p.prop);
    if (!hideFits(this.motion, p.state.x, p.state.y, p.state.z, target.kind, target.yaw)) { this.note(p, 'Не помещается здесь — отойди на свободное место'); return; }
    p.kind = target.kind; p.propYaw = target.yaw; p.stains = 0; p.chose = true; p.transforms++;
    p.takeAt = this.tick + (this.phase === 'hide' ? HIDE_TAKE_PREP_TICKS : HIDE_TAKE_TICKS);
    p.reset++;
    this.emit({ k: 'puff', x: r2(p.state.x), y: r2(p.state.y), z: r2(p.state.z) });
  }

  private rotate(p: HidePlayer, n: unknown): void {
    if (n !== 1 && n !== -1 && n !== 3 && n !== -3) return;
    const yaw = (p.propYaw + n + HIDE_YAW_STEPS) % HIDE_YAW_STEPS;
    hideFillProps(this.motion, this.bodies(), p.prop);
    if (!hideFits(this.motion, p.state.x, p.state.y, p.state.z, p.kind, yaw)) { this.note(p, 'Не повернуться — мешает'); return; }
    p.propYaw = yaw; p.chose = true; p.reset++;
  }

  private requestShot(p: HidePlayer, msg: Extract<HideClientMsg, { a: 'shoot' }>): void {
    const aim = msg.aim;
    if (!Array.isArray(aim) || aim.length !== 2 || !aim.every(v => typeof v === 'number' && Number.isFinite(v))) return;
    if (typeof msg.view !== 'number' || !Number.isFinite(msg.view) || typeof msg.seq !== 'number' || !Number.isInteger(msg.seq)) return;
    if (p.role !== 'hunter' || this.phase !== 'seek' || p.pending || this.tick - p.lastShot < HIDE_SHOT_TICKS) return;
    if (p.jam) { this.note(p, 'Краска кончилась — подожди, бак наполняется'); this.flush(); return; }
    p.lastShot = this.tick;
    p.pending = { aim: [aim[0], aim[1]], view: msg.view, seq: msg.seq, at: this.tick };
  }

  /**
   * Выстрел краской. Луч из серверных глаз ищущего по направлению, которое прислал клиент; прячущиеся откатываются к
   * тику, который он видел (не дальше 0,4 с). Предметы двора и стены не двигаются — их не откатываем.
   */
  private fire(p: HidePlayer, shot: PendingShot): void {
    p.pending = null; p.shots++; p.lastHuntAt = this.tick;
    const ox = p.state.x, oy = p.state.y + EYE_HEIGHT, oz = p.state.z;
    viewDir(shot.aim[0], Math.max(-1.2, Math.min(1.2, shot.aim[1])), this.dir);
    const { x: dx, y: dy, z: dz } = this.dir;
    let rewind = this.tick - shot.view;
    if (!(rewind >= 0)) rewind = 0;
    if (rewind > HIDE_MAX_REWIND) rewind = HIDE_MAX_REWIND;
    const t = this.tick - rewind;
    let best = HIDE_SHOT_RANGE, target: HideBody | null = null, victim: HidePlayer | null = null;
    let nx = 0, ny = 0, nz = 0;
    for (const b of this.decor) {
      const d = hideRayBody(ox, oy, oz, dx, dy, dz, b, best, this.normal);
      if (d < best) { best = d; target = b; victim = null; nx = this.normal.nx; ny = this.normal.ny; nz = this.normal.nz; }
    }
    for (const q of this.players.values()) {
      if (q.role !== 'prop' || q.round !== this.round) continue;
      let body: HideBody | null = this.rewound;
      if (rewind > 0) { if (!this.history.sample(q.prop, t, this.rewound)) body = null; }
      else Object.assign(this.rewound, { id: q.prop, kind: q.kind, x: q.state.x, y: q.state.y, z: q.state.z, yaw: q.propYaw });
      if (!body) continue;
      const d = hideRayBody(ox, oy, oz, dx, dy, dz, body, best, this.normal);
      if (d < best) { best = d; target = { ...body }; victim = q; nx = this.normal.nx; ny = this.normal.ny; nz = this.normal.nz; }
    }
    let kind: HideShotKind = target ? (victim ? 'prop' : 'decor') : 'air';
    let dist = best;
    if (this.world.raycast(ox, oy, oz, dx, dy, dz, best, this.hit, true)) {
      kind = 'world'; dist = this.hit.t; target = null; victim = null; nx = this.hit.nx; ny = this.hit.ny; nz = this.hit.nz;
    }
    const to: [number, number, number] = [r2(ox + dx * dist), r2(oy + dy * dist), r2(oz + dz * dist)];
    this.emit({ k: 'shot', id: ++this.shotSerial, by: p.id, from: [r2(ox), r2(oy), r2(oz)], to, n: [r2(nx), r2(ny), r2(nz)], hit: kind, prop: target?.id ?? 0, size: target ? HIDE_KIND[target.kind].size : 0 });
    if (victim) {
      p.paint = Math.min(PAINT.max, p.paint + PAINT.hit); p.jam = false;
      victim.hits++; victim.stains++;
      this.award(p, PTS.hit, 'попадание');
      if (victim.hits >= hideHits(victim.kind)) this.caught(victim, p);
      return;
    }
    if (kind === 'decor' && target) { p.misses++; p.lastMiss = target.kind; }
    p.paint -= kind === 'decor' ? PAINT.decor : PAINT.world;
    if (p.paint <= 0) {
      p.paint = 0; p.jam = true; p.paintOuts++;
      this.emit({ k: 'feed', text: paintOutText(p.nick, kind === 'decor' && target ? target.kind : p.lastMiss) });
    }
  }

  private caught(q: HidePlayer, by: HidePlayer): void {
    this.anyCaught = true;
    q.caughtAt = this.tick - this.seekAt;
    this.emit({ k: 'catch', x: r2(q.state.x), y: r2(q.state.y), z: r2(q.state.z), kind: q.kind, who: q.id, by: by.id, text: catchText(q.kind, q.nick, by.nick) });
    by.finds++;
    this.award(by, PTS.catch, 'поймал');
    this.makeCaught(q);
    const left = this.liveProps();
    if (!left.length) this.finish('hunters');
    else if (left.length === 1 && !this.lastOneSaid) { this.lastOneSaid = true; this.emit({ k: 'feed', text: '⏳ Остался последний прячущийся — ему очки вдвойне!' }); }
  }

  /**
   * Насмешка. Обязательная — только лёгкая дрожь предмета (без звука и нот): заметит тот, кто смотрит прямо на него.
   * Своя (Z, раз в 15 с) — ещё и тихий звук из тайника (точка с разбросом до 0,7 м), очки за дерзость рядом с ищущим;
   * в общую ленту о ней больше не пишем — ищущему это подсказка.
   */
  private taunt(p: HidePlayer, forced: boolean): void {
    if (!forced) {
      let near = Infinity;
      for (const q of this.players.values()) if (q.role === 'hunter' && q.connected && q.round === this.round) near = Math.min(near, Math.hypot(q.state.x - p.state.x, q.state.z - p.state.z));
      const loud = near <= TAUNT.near[1] ? 2 : near <= TAUNT.near[0] ? 1 : 0;
      const pts = Math.min(tauntPoints(near), TAUNT.cap - p.tauntPts);
      if (pts > 0) { p.tauntPts += pts; this.award(p, pts, loud === 2 ? 'наглая насмешка' : loud === 1 ? 'дерзкая насмешка' : 'насмешка'); }
      p.tauntCd = this.tick + TAUNT.cd;
      const a = this.rand(360) * Math.PI / 180, r = this.rand(71) / 100;
      this.emit({ k: 'taunt', x: r2(p.state.x + Math.cos(a) * r), y: r2(p.state.y + HIDE_KIND[p.kind].h * 0.6), z: r2(p.state.z + Math.sin(a) * r), s: this.rand(TAUNT.sounds), loud });
    }
    this.emit({ k: 'wiggle', id: p.prop });
    p.tauntAt = this.tick + (this.inFinal() ? TAUNT.final : TAUNT.every);
  }

  private award(p: HidePlayer, n: number, why: string): void {
    p.pts += n;
    p.sink?.sendJson({ t: 'hide_ev', e: [{ k: 'pts', n, why }] });
  }

  private note(p: HidePlayer, text: string): void { p.sink?.sendJson({ t: 'hide_ev', e: [{ k: 'note', text }] }); }

  // ------------------------------------------------------------ ход матча

  private recount(): void {
    if (this.phase !== 'gather') return;
    if (this.humans < HIDE_MIN) this.phaseEnd = 0;
    else if (!this.phaseEnd) this.phaseEnd = this.tick + HIDE_COUNT_TICKS;
  }

  private startMatch(): void {
    this.match++; this.round = 0;
    for (const p of this.players.values()) { p.score = 0; p.startedHunter = 0; p.lastHunterRound = -1; }
    this.startRound();
  }

  private startRound(): void {
    const players = [...this.players.values()].filter(p => p.connected).sort((a, b) => a.pid - b.pid);
    if (players.length < HIDE_MIN) { this.toGather(); return; }
    this.round++;
    this.phase = 'hide'; this.phaseEnd = this.tick + HIDE_PREP_TICKS; this.seekAt = 0; this.result = null;
    this.finalSaid = false; this.lastOneSaid = false; this.anyCaught = false; this.history.clear();
    this.notice = 'Прячьтесь! Наведитесь на предмет и нажмите E';
    this.layout();
    // ищущие на старте — те, кто реже начинал ищущим в этом матче
    const order = players.map(p => ({ p, k: this.rand(1000) })).sort((a, b) => a.p.startedHunter - b.p.startedHunter || a.p.lastHunterRound - b.p.lastHunterRound || a.k - b.k).map(e => e.p);
    const hunters = new Set(order.slice(0, hideHunterCount(players.length)));
    for (const p of this.players.values()) if (!p.connected) this.players.delete(p.id);
    let h = 0, s = 0;
    for (const p of players) {
      this.joinRound(p);
      if (hunters.has(p)) { p.startedHunter++; p.lastHunterRound = this.round; this.makeHunter(p, h++, PAINT.max); }
      else this.makeProp(p, s++);
    }
    this.initialProps = s;
    this.rosterDirty = true;
    this.broadcast();
  }

  private joinRound(p: HidePlayer): void {
    Object.assign(p, {
      round: this.round, rewardEligible: true, awarded: false, pts: 0, moved: 0, chose: false, shots: 0, lastHuntAt: -9999, finds: 0,
      wasProp: false, caughtAt: 0, survivedEnd: false, tauntPts: 0, misses: 0, paintOuts: 0, lastMiss: null, transforms: 0,
      hits: 0, stains: 0, locked: false, pending: null, jam: false, paint: PAINT.max,
    });
    p.input.reset(); p.reset++;
  }

  private makeHunter(p: HidePlayer, slot: number, paint: number): void {
    p.role = 'hunter'; p.prop = 0; p.locked = false; p.paint = paint; p.jam = false; p.pending = null; p.lastShot = -9999;
    p.state = Object.assign(makeState(), this.hunterSpot(slot), { grounded: 1 });
    p.reset++;
  }

  private makeProp(p: HidePlayer, slot: number): void {
    p.role = 'prop'; p.wasProp = true; p.prop = this.newId(); p.locked = false; p.hits = 0; p.stains = 0;
    p.takeAt = 0; p.tauntCd = 0; p.tauntAt = this.phase === 'seek' ? this.tick + TAUNT.firstMin : 0;
    const spots = YARD.propSpawns;
    hideFillProps(this.motion, this.bodies(), p.prop);
    let placed = false;
    for (let i = 0; i < spots.length * START_KINDS.length && !placed; i++) {
      const [x, z] = spots[(slot + i) % spots.length], kind = START_KINDS[(slot + Math.floor(i / spots.length) + this.rand(START_KINDS.length)) % START_KINDS.length];
      const yaw = this.rand(4) * 6;
      if (!hideFits(this.motion, x, 0, z, kind, yaw)) continue;
      p.kind = kind; p.propYaw = yaw; p.state = Object.assign(makeState(), { x, y: 0, z, grounded: 1 }); placed = true;
    }
    if (!placed) { p.kind = 'bucket'; p.propYaw = 0; p.state = Object.assign(makeState(), { x: YARD.well.x, y: YARD.well.h, z: YARD.well.z, grounded: 1 }); }
    p.reset++;
  }

  private makeCaught(p: HidePlayer): void {
    p.role = 'caught'; p.back = this.tick + HIDE_RESPAWN_TICKS; p.prop = 0; p.locked = false; p.pending = null;
    p.reset++;
  }

  private hunterSpot(slot: number): { x: number; y: number; z: number } {
    const [x, z] = YARD.hunterSpawns[slot % YARD.hunterSpawns.length];
    return { x, y: 0, z };
  }

  private newId(): number {
    const used = new Set([...this.decor.map(b => b.id), ...[...this.players.values()].map(p => p.prop)]);
    // случайный id; занят — следующий свободный (даже с плохим rand цикл конечен)
    let id = 10000 + this.rand(990000);
    while (used.has(id)) id = id >= 999999 ? 10000 : id + 1;
    return id;
  }

  /** Раскладка предметов двора: каждый слот с вероятностью ~78%, вид — из его набора, без наложений. */
  private layout(): void {
    this.decor = [];
    const order = HIDE_SLOTS.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = this.rand(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    for (const i of order) {
      const slot = HIDE_SLOTS[i];
      if (this.rand(100) >= 78) continue;
      const pool = [...(HIDE_POOLS[slot.pool] ?? [])];
      for (let k = pool.length - 1; k > 0; k--) { const j = this.rand(k + 1); [pool[k], pool[j]] = [pool[j], pool[k]]; }
      hideFillProps(this.motion, this.decor, -1);
      const kind = pool.find(kind => hideFits(this.motion, slot.x, slot.y, slot.z, kind, slot.yaw));
      if (kind) this.decor.push({ id: this.newId(), kind, x: slot.x, y: slot.y, z: slot.z, yaw: slot.yaw });
    }
  }

  private startSeek(): void {
    this.phase = 'seek'; this.seekAt = this.tick; this.phaseEnd = this.tick + HIDE_SEEK_TICKS;
    for (const p of this.players.values()) if (p.role === 'prop' && p.round === this.round) {
      p.tauntAt = this.tick + TAUNT.firstMin + this.rand(TAUNT.firstMax - TAUNT.firstMin);
    }
    this.notice = 'Ищущие вышли! Каждые 30 с прячущиеся обязаны крякнуть';
    this.emit({ k: 'door' });
    this.broadcast();
  }

  private inFinal(): boolean { return this.phase === 'seek' && this.phaseEnd - this.tick <= HIDE_FINAL_TICKS; }

  liveProps(): HidePlayer[] { return [...this.players.values()].filter(p => p.role === 'prop' && p.round === this.round); }
  private propCount(): number { return this.liveProps().length; }

  private finish(winner: HideRoundResult['winner']): void {
    if (this.phase !== 'seek') return;
    const inRound = [...this.players.values()].filter(p => p.round === this.round);
    if (winner !== 'cancelled') {
      const huntActive = inRound.some(p => (p.role === 'hunter' || p.role === 'caught') && p.connected && p.moved >= HUNT_MOVE && p.shots > 0 && this.tick - p.lastHuntAt <= 1800);
      const prepared = inRound.some(p => p.wasProp && p.connected && p.moved >= PROP_MOVE && p.chose);
      if (!huntActive || !prepared) winner = 'cancelled';
    }
    if (winner === 'hunters') { for (const p of inRound) if ((p.role === 'hunter' || p.role === 'caught') && p.connected) p.pts += PTS.teamWin; }
    else if (winner === 'props') { for (const p of inRound) if (p.role === 'prop') { p.pts += PTS.survive; p.survivedEnd = true; } }
    const seekTicks = this.tick - this.seekAt;
    const last = this.round >= HIDE_ROUNDS;
    for (const p of inRound) p.score += p.pts;
    const ranked = inRound.filter(p => p.connected).sort((a, b) => b.score - a.score);
    const rows: HideRoundResult['rows'] = [];
    for (const p of inRound) {
      let tokens = 0;
      const participated = p.connected && p.rewardEligible && p.moved >= (p.wasProp ? PROP_MOVE : HUNT_MOVE) && (p.chose || p.shots > 0);
      if (winner !== 'cancelled' && participated && !p.awarded) {
        p.awarded = true;
        tokens = seekTicks >= HIDE_TOKENS.minSeekTicks ? roundTokens(p.pts) : 0;
        if (last) tokens += podiumBonus(ranked.indexOf(p), ranked.length);
        const hunter = p.role === 'hunter' || p.role === 'caught';
        this.hooks.finished(p.pid, { round: this.round, role: hunter ? 'hunter' : 'prop', won: hunter ? winner === 'hunters' : winner === 'props', found: p.finds, survived: p.survivedEnd, reward: tokens });
      }
      rows.push({ id: p.id, nick: p.nick, pts: p.pts, score: p.score, tokens });
    }
    rows.sort((a, b) => b.score - a.score);
    const stats: RoundStat[] = inRound.map(p => ({ nick: p.nick, wasProp: p.wasProp, kind: p.kind, caught: p.wasProp && (p.role === 'caught' || p.role === 'hunter'), caughtAt: p.caughtAt, survivedEnd: p.survivedEnd, finds: p.finds, tauntPts: p.tauntPts, misses: p.misses, paintOuts: p.paintOuts, lastMiss: p.lastMiss, transforms: p.transforms }));
    this.result = { winner, round: this.round, last, lines: roundLines(stats, winner), rows };
    this.phase = 'result'; this.phaseEnd = this.tick + HIDE_RESULT_TICKS;
    this.notice = winner === 'hunters' ? 'Ищущие нашли всех!' : winner === 'props' ? 'Прячущиеся продержались!' : 'Раунд без наград';
    for (const p of this.players.values()) p.pending = null;
    this.broadcast();
  }

  private toGather(): void {
    this.phase = 'gather'; this.phaseEnd = 0; this.round = 0; this.result = null; this.decor = [];
    this.notice = 'Нужно 2–8 игроков';
    for (const [id, p] of this.players) {
      if (!p.connected) { this.players.delete(id); continue; }
      p.role = 'spectator'; p.prop = 0; p.round = 0; p.pending = null;
      p.state = Object.assign(makeState(), this.hunterSpot(0), { grounded: 1 }); p.reset++;
    }
    this.rosterDirty = true;
    this.recount();
    this.broadcast();
  }

  // ------------------------------------------------------------ тик

  /** Все тела для движения и выстрелов: предметы двора и живые прячущиеся (без признака, кто есть кто). */
  private bodies(): HideBody[] {
    const list = this.decor.slice();
    for (const p of this.players.values()) if (p.role === 'prop' && p.round === this.round) list.push({ id: p.prop, kind: p.kind, x: p.state.x, y: p.state.y, z: p.state.z, yaw: p.propYaw });
    return list;
  }

  step(): void {
    this.tick++;
    for (const [id, p] of this.players) {
      if (p.connected || this.tick - p.leftAt < HIDE_REJOIN_TICKS) continue;
      // Не вернулся: прячущийся исчезает (не пойман), ищущий просто уходит
      this.players.delete(id); this.rosterDirty = true;
    }
    if (this.phase === 'gather') { if (this.phaseEnd && this.tick >= this.phaseEnd) this.startMatch(); }
    else if (this.phase === 'hide') { if (this.tick >= this.phaseEnd) this.startSeek(); }
    else if (this.phase === 'result') {
      if (this.humans < HIDE_MIN) this.toGather();
      else if (this.tick >= this.phaseEnd) {
        if (this.round >= HIDE_ROUNDS) { this.phase = 'final'; this.phaseEnd = this.tick + HIDE_PODIUM_TICKS; this.notice = 'Итоги матча'; this.broadcast(); }
        else this.startRound();
      }
    } else if (this.phase === 'final') {
      if (this.tick >= this.phaseEnd) { if (this.humans >= HIDE_MIN) this.startMatch(); else this.toGather(); }
    }
    this.move();
    if (this.phase === 'seek') this.seekTick();
    this.flush();
    if (this.tick % 6 === 0) this.broadcast();
  }

  private move(): void {
    const playing = this.phase === 'hide' || this.phase === 'seek';
    const bodies = this.bodies();
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      const ph = p.physics;
      ph.mover = playing && p.round === this.round ? (p.role === 'prop' ? 'prop' : p.role === 'hunter' && this.phase === 'seek' ? 'hunter' : 'still') : 'still';
      ph.kind = p.kind; ph.yaw = p.propYaw; ph.locked = p.locked; ph.props = bodies; ph.ownId = p.role === 'prop' ? p.prop : 0;
      const n = p.input.due();
      for (let i = 0; i < n && p.input.length; i++) {
        const inp = p.input.shift();
        const oldYaw = p.yaw, oldPitch = p.pitch, x = p.state.x, z = p.state.z;
        p.yaw = inp.yaw; p.pitch = Math.max(-1.2, Math.min(1.2, inp.pitch));
        ph.step(p.state, inp);
        const moved = Math.hypot(p.state.x - x, p.state.z - z);
        p.moved += moved;
        if (p.role === 'hunter' && this.phase === 'seek' && (moved > 0.02 || Math.abs(p.yaw - oldYaw) > 0.02 || Math.abs(p.pitch - oldPitch) > 0.02)) p.lastHuntAt = this.tick;
        if (p.role === 'prop') {
          const own = bodies.find(b => b.id === p.prop);
          if (own) { own.x = p.state.x; own.y = p.state.y; own.z = p.state.z; }
        }
      }
      if (p.pending && (p.input.ack >= p.pending.seq || this.tick - p.pending.at >= 10)) {
        if (this.phase === 'seek' && p.role === 'hunter') this.fire(p, p.pending); else p.pending = null;
        // выстрел закончил раунд — остальных подвинем в следующем тике
        if (!playing || this.phase === 'result') break;
      }
    }
    if (this.phase === 'seek') this.history.record(this.tick, this.liveProps().map(p => ({ id: p.prop, kind: p.kind, x: p.state.x, y: p.state.y, z: p.state.z, yaw: p.propYaw })));
  }

  private seekTick(): void {
    if (this.inFinal() && !this.finalSaid) {
      this.finalSaid = true;
      for (const p of this.liveProps()) p.tauntAt = Math.min(p.tauntAt, this.tick + TAUNT.final);
      this.emit({ k: 'final' }); this.emit({ k: 'feed', text: '⏰ Финал! Насмешки каждые 10 секунд' });
    }
    const live = this.liveProps();
    for (const p of [...this.players.values()]) {
      if (p.round !== this.round) continue;
      if (p.role === 'caught' && this.tick >= p.back) { this.makeHunter(p, p.id, PAINT.infected); this.rosterDirty = true; }
      else if (p.role === 'prop' && this.tick >= p.tauntAt) this.taunt(p, true);
      else if (p.role === 'hunter' && this.tick - p.lastShot >= PAINT.regenDelay && p.paint < PAINT.max) {
        p.paint = Math.min(PAINT.max, p.paint + PAINT.regen / 60);
        if (p.jam && p.paint >= PAINT.unjam) p.jam = false;
      }
    }
    if ((this.tick - this.seekAt) % SURVIVAL_EVERY === 0) for (const p of live) p.pts += live.length === 1 ? 2 : 1;
    if (!live.length) { this.finish(this.anyCaught ? 'hunters' : 'cancelled'); return; }
    const hunters = [...this.players.values()].some(p => p.round === this.round && (p.role === 'hunter' || p.role === 'caught') && (p.connected || this.tick - p.leftAt < HIDE_REJOIN_TICKS));
    if (!hunters) { this.finish('cancelled'); return; }
    if (this.tick >= this.phaseEnd) this.finish('props');
  }

  // ------------------------------------------------------------ рассылка

  private emit(e: HideEvent): void { this.events.push(e); }

  private flush(): void {
    if (this.rosterDirty) {
      this.rosterDirty = false;
      const players = [...this.players.values()].map(p => ({ id: p.id, nick: p.nick, level: p.level, outfit: p.outfit }));
      for (const p of this.players.values()) if (p.connected) p.sink?.sendJson({ t: 'hide_roster', players });
    }
    if (!this.events.length) return;
    const e = this.events; this.events = [];
    for (const p of this.players.values()) if (p.connected) p.sink?.sendJson({ t: 'hide_ev', e });
  }

  /** Снимок игроку: предметы — дельтой к тому, что ему уже ушло (см. HideStateMsg). */
  view(p: HidePlayer): HideStateMsg {
    const blind = this.phase === 'hide' && p.role !== 'prop';
    const epoch = !blind && (this.phase === 'hide' || this.phase === 'seek' || this.phase === 'result') ? `${this.match}:${this.round}` : '';
    const full = p.sentEpoch !== epoch;
    if (full) { p.sent.clear(); p.sentEpoch = epoch; }
    const props: number[] = [], gone: number[] = [];
    if (epoch) {
      const list = this.bodies().sort((a, b) => a.id - b.id);
      const stains = new Map<number, number>();
      for (const q of this.players.values()) if (q.role === 'prop' && q.round === this.round && q.stains) stains.set(q.prop, Math.min(3, q.stains));
      const seen = new Set<number>();
      for (const b of list) {
        const row = [b.id, hideKindIndex(b.kind), Math.round(b.x * 100), Math.round(b.y * 100), Math.round(b.z * 100), b.yaw, stains.get(b.id) ?? 0];
        const key = row.join(',');
        seen.add(b.id);
        if (p.sent.get(b.id) !== key) { p.sent.set(b.id, key); props.push(...row); }
      }
      for (const id of p.sent.keys()) if (!seen.has(id)) { p.sent.delete(id); gone.push(id); }
    }
    const hunters: number[] = [];
    for (const q of this.players.values()) {
      if (q.role !== 'hunter' || q.round !== this.round || (this.phase !== 'hide' && this.phase !== 'seek')) continue;
      hunters.push(q.id, Math.round(q.state.x * 100), Math.round(q.state.y * 100), Math.round(q.state.z * 100), Math.round(q.yaw * 1000), Math.round(q.pitch * 1000));
    }
    const rows: HideRow[] = [...this.players.values()].map(q => ({ id: q.id, nick: q.nick, role: q.round !== this.round || q.role === 'spectator' ? 's' : q.role === 'hunter' ? 'h' : q.role === 'prop' ? 'p' : 'c', score: q.score + (this.phase === 'result' || this.phase === 'final' ? 0 : q.pts), pts: q.pts }));
    return {
      t: 'hide_state', tick: this.tick, phase: this.phase, phaseEnd: this.phaseEnd, round: this.round, match: this.match, seekAt: this.seekAt,
      self: {
        id: p.id, ack: p.input.ack, reset: p.reset, state: { ...p.state }, role: p.round === this.round ? p.role : 'spectator',
        kind: p.kind, prop: p.prop, yaw: p.propYaw, locked: p.locked, hits: p.hits, paint: Math.round(p.paint * 10) / 10, jam: p.jam,
        takeAt: p.takeAt, tauntCd: p.tauntCd, tauntAt: p.tauntAt, back: p.back,
      },
      full, p: props, gone, h: hunters, left: this.liveProps().length, total: this.initialProps, notice: this.notice, rows,
      res: this.phase === 'result' || this.phase === 'final' ? this.result : null,
    };
  }

  send(p: HidePlayer): void { p.sink?.sendJson(this.view(p)); }
  private broadcast(): void { this.flush(); for (const p of this.players.values()) if (p.connected) this.send(p); }
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
