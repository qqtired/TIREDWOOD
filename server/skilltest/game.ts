import { aquaClock } from '../../shared/aquadyn.ts';
import { SKILL_CAPACITY, SKILL_CHECKPOINTS, SKILL_COURSE, SKILL_FALL_Y, SKILL_REJOIN_TICKS, type SkillPeer, type SkillProgress, type SkillServerMsg } from '../../shared/skilltest.ts';
import { makeSkillMap } from '../../shared/skillmap.ts';
import { SkillDynamics } from '../../shared/skillphysics.ts';
import { makeEvents, makeInput, makeState, type Input, type PlayerState } from '../../shared/sim.ts';
import type { Outfit } from '../../shared/outfit.ts';
import { CollisionWorld } from '../../shared/world.ts';
import { InputQueue } from '../inputs.ts';

export interface SkillSink { sendJson(msg: SkillServerMsg): void }
export interface SkillPlayer {
  id: number; pid: number; level: number; nick: string; outfit: Outfit; sink: SkillSink;
  state: PlayerState; input: InputQueue; progress: SkillProgress; yaw: number; prevTick: number;
  reset: number; lastAction: number; lastUse: number;
}
export class SkillGame {
  readonly map = makeSkillMap();
  readonly world = new CollisionWorld(this.map);
  readonly dynamics = new SkillDynamics(this.map, this.world);
  readonly players = new Map<number, SkillPlayer>();
  private readonly saved = new Map<number, { progress: SkillProgress; until: number; leftTick: number; leftMs: number }>();
  private readonly now: () => number;
  private nextId = 1;
  private readonly ev = makeEvents();
  tick = 0;
  onAfk: (p: SkillPlayer) => void = () => {};

  constructor(now: () => number = Date.now) { this.now = now; }

  addHuman(info: { pid: number; level?: number; nick: string; outfit: Outfit }, sink: SkillSink): SkillPlayer | null {
    if (this.players.size >= SKILL_CAPACITY || [...this.players.values()].some(p => p.pid === info.pid)) return null;
    const saved = this.saved.get(info.pid);
    const elapsedMs = saved ? Math.max(0, this.now() - saved.leftMs) : 0;
    const restore = saved && saved.until > this.tick && elapsedMs < SKILL_REJOIN_TICKS * 1000 / 60;
    const progress = restore ? { ...saved.progress } : { checkpoint: 0, startedAt: null, finishedAt: null, falls: 0, run: 1 };
    // Hub sleeps when empty. Rejoining must include that real absence, without double-counting
    // ticks already simulated while friends remained in the room. Completed times stay frozen.
    if (restore && progress.startedAt !== null && progress.finishedAt === null) {
      progress.startedAt -= Math.max(0, Math.floor(elapsedMs * 60 / 1000) - (this.tick - saved.leftTick));
    }
    this.saved.delete(info.pid);
    const p: SkillPlayer = { ...info, level: info.level ?? 1, id: this.nextId++, sink, state: makeState(), input: new InputQueue(), progress, yaw: -Math.PI / 2, prevTick: NaN, reset: 0, lastAction: this.tick, lastUse: -999 };
    this.players.set(p.id, p);
    this.respawn(p, false);
    this.send(p);
    return p;
  }
  removePlayer(id: number): void {
    const p = this.players.get(id); if (!p) return;
    this.saved.set(p.pid, { progress: { ...p.progress }, until: this.tick + SKILL_REJOIN_TICKS, leftTick: this.tick, leftMs: this.now() });
    this.players.delete(id);
    // Bounded process-local rejoin state; no profile migration and no persisted reward claim.
    while (this.saved.size > 64) this.saved.delete(this.saved.keys().next().value!);
  }
  onInputs(p: SkillPlayer, inputs: Input[], count: number): void {
    p.input.push(inputs, Math.min(count, inputs.length), 120);
  }
  use(p: SkillPlayer, id: number): void {
    if ((id !== 0 && id !== 1) || this.tick - p.lastUse < 60) return;
    p.lastUse = this.tick; p.lastAction = this.tick;
    if (id === 0) p.progress = { checkpoint: 0, startedAt: null, finishedAt: null, falls: 0, run: p.progress.run + 1 };
    this.respawn(p, id === 1 && p.progress.finishedAt === null);
    this.send(p);
  }
  respawn(p: SkillPlayer, fall: boolean): void {
    const cp = SKILL_CHECKPOINTS[p.progress.checkpoint];
    p.state = Object.assign(makeState(), { x: cp.x, y: cp.y, z: cp.z, grounded: 1 });
    p.reset++; p.prevTick = NaN;
    // Drop already buffered motion after a fall; ACK it so the client cannot replay it from the new checkpoint.
    p.input.ack = Math.max(p.input.ack, p.input.lastSeq);
    p.input.items.length = 0;
    if (fall) p.progress.falls++;
  }
  /** Only server-simulated feet on the NEXT safe deck can advance a run. */
  checkProgress(p: SkillPlayer): void {
    const s = p.state, progress = p.progress;
    if (s.y < SKILL_FALL_Y || !Number.isFinite(s.x + s.y + s.z) || Math.abs(s.z) > 60 || s.x < -20 || s.x > 270) { this.respawn(p, progress.finishedAt === null); return; }
    if (progress.finishedAt !== null) return;
    if (progress.startedAt === null && s.x > 3) progress.startedAt = this.tick;
    const next = SKILL_CHECKPOINTS[progress.checkpoint + 1];
    if (!next || !s.grounded || Math.abs(s.y - next.y) > 0.05 || Math.abs(s.x - next.x) > 2.8 || Math.abs(s.z) > 3.8) return;
    // An untouched start deck is not a completed run even if a developer relocates the player.
    if (progress.startedAt === null) return;
    progress.checkpoint++;
    if (progress.checkpoint === SKILL_CHECKPOINTS.length - 1) progress.finishedAt = this.tick;
  }
  step(): void {
    this.tick++;
    const now = this.now();
    for (const [pid, saved] of this.saved) if (saved.until <= this.tick || now - saved.leftMs >= SKILL_REJOIN_TICKS * 1000 / 60) this.saved.delete(pid);
    for (const p of this.players.values()) {
      const n = p.input.due();
      if (n) for (let i = 0; i < n; i++) {
        if (!p.input.length) break;
        const inp = p.input.shift();
        inp.viewTick = aquaClock(inp.viewTick, Number.isFinite(p.prevTick) ? p.prevTick : 0, this.tick);
        if (inp.buttons || Math.abs(inp.yaw - p.yaw) > 0.02) p.lastAction = this.tick;
        p.yaw = inp.yaw;
        this.dynamics.step(p.state, inp, p.prevTick, this.ev); p.prevTick = inp.viewTick;
        this.checkProgress(p);
      } else {
        // Disconnected/tab-hidden players still obey gravity and moving hazards; timers never stop.
        const idle = makeInput(); idle.yaw = p.yaw; idle.viewTick = this.tick;
        this.dynamics.step(p.state, idle, p.prevTick, this.ev); p.prevTick = this.tick;
        this.checkProgress(p);
      }
      if (this.tick - p.lastAction >= 5 * 60 * 60) this.onAfk(p);
    }
    if (this.tick % 6 === 0) for (const p of this.players.values()) this.send(p);
  }
  peers(): SkillPeer[] {
    return [...this.players.values()].map(p => ({ id: p.id, pid: p.pid, level: p.level, nick: p.nick, outfit: p.outfit, x: p.state.x, y: p.state.y, z: p.state.z, yaw: p.yaw, grounded: p.state.grounded, checkpoint: p.progress.checkpoint, finished: p.progress.finishedAt !== null }));
  }
  send(p: SkillPlayer): void {
    p.sink.sendJson({ t: 'skill_state', course: SKILL_COURSE, tick: this.tick, id: p.id, ack: p.input.ack, state: { ...p.state }, reset: p.reset, progress: { ...p.progress }, peers: this.peers() });
  }
}
