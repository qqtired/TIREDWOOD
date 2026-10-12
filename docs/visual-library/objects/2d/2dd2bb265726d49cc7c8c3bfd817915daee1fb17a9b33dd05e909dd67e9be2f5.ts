import { STORM_CALM, STORM_MAX, STORM_RAINBOW, STORM_RANK, STORM_REACH_SLACK, STORM_WARN, emptyStorm, stormReach, stormReward, type StormView } from '../../shared/storm.ts';
import type { EventHost, LargeEvent } from './events.ts';
export interface StormHooks extends EventHost { broadcast(view: StormView): void }
export class Storm implements LargeEvent {
  private readonly host: StormHooks;
  private state = emptyStorm();
  private tick = 0;
  private paid = false;
  private readonly seen = new Set<number>();
  constructor(host: StormHooks) { this.host = host; }
  get active(): boolean { return this.state.phase !== 'idle'; }
  view(): StormView { return { ...this.state, winners: this.state.winners.map(w => ({ ...w })) }; }
  start(tick: number, id: string): void {
    if (this.active) return;
    this.tick = tick; this.paid = false; this.seen.clear();
    this.state = { ...emptyStorm(), id, phase: 'warn', start: tick, end: tick + STORM_WARN };
    this.host.chat('⛈ Идёт шторм! Через минуту погаснет свет — зажги маяк!'); this.send();
  }
  step(tick: number): void {
    this.tick = tick;
    if (this.state.phase === 'warn' && tick >= this.state.end) {
      this.state.phase = 'storm'; this.state.start = tick; this.state.waveStart = tick; this.state.end = tick + STORM_MAX;
      this.host.chat('⛈ Шторм! Свет погас — беги к двери маяка: E или клик. Пена предупреждает волну!'); this.send();
    }
    if (this.state.phase === 'storm') {
      for (const p of this.host.players()) if (p.eligible && !this.seen.has(p.pid)) {
        this.seen.add(p.pid); this.host.award(p.pid, 0, { stStorms: 1 });
      }
      if (tick >= this.state.end) this.calm(false);
    }
    if (this.state.phase === 'calm') {
      if (!this.paid && tick >= this.state.rankEnd) this.finishRewards();
      if (tick >= this.state.rainbowEnd) { this.state.phase = 'idle'; this.send(); }
    }
    if (this.active && tick % 60 === 0) this.send();
  }
  /** Called for an explicit E/action command only. Position and live participation are server-owned. */
  light(pid: number): boolean {
    const v = this.state;
    if (v.phase !== 'storm' && !(v.phase === 'calm' && v.rankEnd > this.tick && v.winners.length)) return false;
    const p = this.host.players().find(p => p.pid === pid && p.eligible);
    if (!p || v.winners.some(w => w.pid === pid) || !stormReach(p.state.x, p.state.y, p.state.z, STORM_REACH_SLACK)) return false;
    if (!this.seen.has(pid)) { this.seen.add(pid); this.host.award(pid, 0, { stStorms: 1 }); }
    const place = v.winners.length + 1;
    v.winners.push({ pid, nick: p.nick, place, tokens: stormReward(place) });
    if (place === 1) {
      this.host.award(pid, 0, { stLights: 1 });
      this.host.chat(`⚓ Маяк зажёг ${p.nick}! Остальным ещё 10 секунд.`); this.calm(true);
    } else this.send();
    return true;
  }
  private calm(won: boolean): void {
    const v = this.state;
    v.phase = 'calm'; v.start = this.tick; v.end = this.tick + STORM_CALM;
    v.rankEnd = won ? this.tick + STORM_RANK : this.tick; v.rainbowEnd = this.tick + STORM_RAINBOW;
    if (!won) this.host.chat('⛈ Шторм стих сам. Маяк так и не зажгли — без наград.');
    this.send();
  }
  private finishRewards(): void {
    this.paid = true;
    const present = new Set(this.host.players().filter(p => p.eligible).map(p => p.pid));
    for (const w of this.state.winners) {
      if (present.has(w.pid)) this.host.award(w.pid, w.tokens, {}); else w.tokens = 0;
    }
    if (this.state.winners.length) this.host.chat(`⚓ Успели к маяку: ${this.state.winners.map(w => `${w.nick} +${w.tokens}`).join(', ')}`);
    this.send();
  }
  private send(): void { this.host.broadcast(this.view()); }
}
