import { BR_COURSE, BR_GRID_TICKS, BR_LAPS, BR_LIMIT, BR_MAX, BR_RESULTS_TICKS, boatRaceReward, makeBoatEvents, makeBoatState, type BoatRacePhase, type BoatRacePeer, type BoatRaceResultRow, type BoatRaceReward, type BoatRaceServerMsg, type BoatRaceStatus } from '../../shared/boatrace.ts';
import { makeBoatCourse } from '../../shared/boatracemap.ts';
import { collideBoats, placeBoat, recoverBoat, stepBoat } from '../../shared/boatracephysics.ts';
import { DEFAULT_OUTFIT, type Outfit } from '../../shared/outfit.ts';
import { BTN_FORWARD, makeInput, type Input } from '../../shared/sim.ts';
import { progress } from '../../shared/track.ts';
import { InputQueue } from '../inputs.ts';
import { BoatBot } from './bot.ts';
export interface BoatSink { sendJson(msg: BoatRaceServerMsg): void }
export class BoatRacer {
  level = 1; id: number; pid: number; nick: string; outfit: Outfit; sink: BoatSink | null;
  readonly state = makeBoatState(); readonly ev = makeBoatEvents(); readonly inputs = new InputQueue();
  bot: BoatBot | null = null; reset = 0; finishTick = 0; finishPlace = 0; lapStart = 0; bestLap = 0;
  activeTicks = 0; lastAction = 0; settled = false; lastUse = -999; place = 1;
  constructor(id: number, pid: number, nick: string, outfit: Outfit, sink: BoatSink | null) { this.id = id; this.pid = pid; this.nick = nick; this.outfit = outfit; this.sink = sink; }
}
export interface BoatRaceHooks { result?(p: BoatRacer, row: BoatRaceResultRow, reward: BoatRaceReward | null): void; over?(): void; afk?(p: BoatRacer): void; announce?(text: string): void }
export interface BoatRaceOptions { minBoats?: number; wavePhase?: number }
export class BoatRace {
  readonly course = makeBoatCourse(); readonly racers = new Map<number, BoatRacer>();
  tick = 0; phase: BoatRacePhase = 'grid'; phaseEnd = 0; raceStart = 0; started = false; closed = false;
  private readonly hooks: BoatRaceHooks; private readonly options: BoatRaceOptions; private finishCount = 0;
  constructor(hooks: BoatRaceHooks = {}, options: BoatRaceOptions = {}) { this.hooks = hooks; this.options = options; this.tick = options.wavePhase ?? 0; }
  get humanCount(): number { return [...this.racers.values()].filter(p => !p.bot && p.sink).length; }
  addHuman(info: { pid: number; level?: number; nick: string; outfit: Outfit }, sink: BoatSink): BoatRacer | null {
    if (this.started || this.closed || this.racers.size >= BR_MAX || [...this.racers.values()].some(p => p.pid === info.pid)) return null;
    let id = 1; while (this.racers.has(id)) id++;
    const p = new BoatRacer(id, info.pid, info.nick, info.outfit, sink); p.level = info.level ?? 1; this.racers.set(id, p); placeBoat(p.state, this.course, id - 1); p.lastAction = this.tick; this.send(p); return p;
  }
  start(): void {
    if (this.started || this.closed) return;
    if (!this.humanCount) { this.closed = true; return; }
    const min = Math.max(1, Math.min(BR_MAX, this.options.minBoats ?? 4));
    while (this.racers.size < min) {
      let id = 1; while (this.racers.has(id)) id++;
      const p = new BoatRacer(id, 0, ['Чайка', 'Бриз', 'Капитан Пена', 'Лазурь', 'Маяк', 'Прибой'][id - 1], { ...DEFAULT_OUTFIT, c: id % 6 }, null);
      p.bot = new BoatBot(this.course, 18 + id % 3); placeBoat(p.state, this.course, id - 1); this.racers.set(id, p);
    }
    this.started = true; this.phase = 'grid'; this.phaseEnd = this.tick + BR_GRID_TICKS; this.raceStart = this.phaseEnd;
    for (const p of this.racers.values()) this.send(p);
  }
  removePlayer(id: number): void {
    const p = this.racers.get(id); if (!p) return;
    this.settle(p); this.racers.delete(id);
    if (this.started && !this.humanCount) this.closed = true;
  }
  onInputs(p: BoatRacer, inputs: Input[], count: number): void { p.inputs.push(inputs, Math.min(count, inputs.length)); }
  recover(p: BoatRacer): void {
    if (this.phase !== 'race' || p.state.done || this.tick - p.lastUse < 120) return;
    p.lastUse = this.tick; p.lastAction = this.tick; recoverBoat(p.state, this.course); p.reset++;
    p.inputs.ack = Math.max(p.inputs.ack, p.inputs.lastSeq); p.inputs.items.length = 0; this.send(p);
  }
  step(): void {
    if (this.closed || !this.started) return;
    this.tick++;
    if (this.phase === 'results') { if (this.tick >= this.phaseEnd) { this.closed = true; this.hooks.over?.(); } return; }
    if (this.phase === 'grid' && this.tick >= this.phaseEnd) { this.phase = 'race'; this.phaseEnd = this.tick + BR_LIMIT; this.raceStart = this.tick; }
    for (const p of this.racers.values()) {
      if (p.state.done) continue;
      let active = false;
      const n = p.bot ? 1 : p.inputs.due();
      for (let j = 0; j < Math.max(1, n); j++) {
        const inp = p.bot ? p.bot.input(p.state, this.tick) : n ? p.inputs.shift() : makeInput();
        if (inp.buttons) p.lastAction = this.tick;
        stepBoat(p.state, inp, this.course, p.ev, this.phase === 'race');
        if (p.ev.respawn) p.reset++;
        if ((inp.buttons & BTN_FORWARD) && Math.hypot(p.state.vx, p.state.vz) > 2) active = true;
        if (p.ev.lap || p.ev.finish) {
          if (p.lapStart) { const lap = this.tick - p.lapStart; p.bestLap = p.bestLap ? Math.min(p.bestLap, lap) : lap; }
          p.lapStart = this.tick;
        }
        if (p.ev.finish) { p.finishTick = this.tick; p.finishPlace = ++this.finishCount; this.settle(p); break; }
      }
      if (active && this.phase === 'race') p.activeTicks++;
      if (!p.bot && this.tick - p.lastAction > 90 * 60) this.hooks.afk?.(p);
    }
    const racers = [...this.racers.values()];
    if (this.phase === 'race') for (let i = 0; i < racers.length; i++) for (let j = i + 1; j < racers.length; j++) collideBoats(racers[i].state, racers[j].state);
    this.rank();
    const humans = racers.filter(p => !p.bot && p.sink), first = humans.reduce((min, p) => p.finishTick ? Math.min(min, p.finishTick) : min, Infinity);
    if (this.phase === 'race' && (this.tick >= this.phaseEnd || humans.every(p => p.state.done) || this.tick - first >= 45 * 60)) this.end();
    if (this.tick % 3 === 0) for (const p of this.racers.values()) this.send(p);
  }
  private rank(): void {
    const tr = this.course.track;
    const list = [...this.racers.values()].sort((a, b) => {
      if (a.finishPlace || b.finishPlace) return (a.finishPlace || 99) - (b.finishPlace || 99);
      return progress(tr, b.state.lap, b.state.cp, b.state.seg, 0) - progress(tr, a.state.lap, a.state.cp, a.state.seg, 0);
    });
    list.forEach((p, i) => p.place = i + 1);
  }
  row(p: BoatRacer): BoatRaceResultRow { return { id: p.id, pid: p.pid, nick: p.nick, bot: !!p.bot, pos: p.finishPlace || 0, finished: !!p.state.done, ticks: p.finishTick ? p.finishTick - this.raceStart : 0, bestLap: p.bestLap, respawns: p.state.respawns }; }
  private settle(p: BoatRacer): void {
    if (p.settled || p.bot) return; p.settled = true;
    const reward = p.state.done && p.activeTicks >= 20 * 60 ? boatRaceReward(p.finishPlace, p.activeTicks) : null;
    const row = this.row(p); this.hooks.result?.(p, row, reward);
    p.sink?.sendJson({ t: 'brReward', row, reward });
  }
  private end(): void {
    if (this.phase === 'results') return;
    this.phase = 'results'; this.phaseEnd = this.tick + BR_RESULTS_TICKS;
    const results = [...this.racers.values()].map(p => this.row(p)).sort((a, b) => (a.pos || 99) - (b.pos || 99));
    for (const p of this.racers.values()) { this.settle(p); p.sink?.sendJson({ t: 'brEnd', results }); }
  }
  status(): BoatRaceStatus { return { phase: this.phase, left: Math.max(0, Math.ceil((this.phaseEnd - this.tick) / 60)), n: this.racers.size, names: [...this.racers.values()].map(p => p.nick), laps: BR_LAPS, course: BR_COURSE }; }
  private peers(): BoatRacePeer[] { return [...this.racers.values()].map(p => ({ id: p.id, pid: p.pid, level: p.level, nick: p.nick, bot: !!p.bot, outfit: p.outfit, x: p.state.x, z: p.state.z, hx: p.state.hx, hz: p.state.hz, speed: Math.hypot(p.state.vx, p.state.vz), steer: p.state.steer, lap: p.state.lap, cp: p.state.cp, pos: p.place, boost: p.state.boost, ghost: p.state.ghost, done: p.state.done })); }
  send(p: BoatRacer): void { p.sink?.sendJson({ t: 'brState', course: BR_COURSE, tick: this.tick, id: p.id, ack: p.inputs.ack, phase: this.phase, phaseEnd: this.phaseEnd, reset: p.reset, state: { ...p.state }, bestLap: p.bestLap, lapStart: p.lapStart, raceStart: this.raceStart, peers: this.peers() }); }
}
