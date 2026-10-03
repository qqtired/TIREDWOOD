import { makeBoatEvents, makeBoatState, type BoatState } from '../../shared/boatrace.ts';
import type { BoatCourse } from '../../shared/boatracemap.ts';
import { stepBoat } from '../../shared/boatracephysics.ts';
import { makeInput, type Input } from '../../shared/sim.ts';
interface Entry { seq: number; buttons: number; drive: boolean; state: BoatState }
export class BoatPredictor {
  readonly state = makeBoatState(); readonly events = makeBoatEvents(); readonly offset = { x: 0, z: 0 }; corrections = 0;
  private readonly course: BoatCourse; private readonly ring: Entry[] = []; private newest = 0;
  constructor(course: BoatCourse) { this.course = course; for (let i = 0; i < 256; i++) this.ring.push({ seq: -1, buttons: 0, drive: false, state: makeBoatState() }); }
  step(inp: Input, drive: boolean): void {
    stepBoat(this.state, inp, this.course, this.events, drive);
    const e = this.ring[inp.seq % 256]; e.seq = inp.seq; e.buttons = inp.buttons; e.drive = drive; Object.assign(e.state, this.state); this.newest = inp.seq;
  }
  accept(ack: number, state: BoatState, reset: boolean): void {
    const e = this.ring[ack % 256];
    if (!reset && e.seq === ack && (Object.keys(state) as Array<keyof BoatState>).every(k => e.state[k] === state[k])) return;
    const x = this.state.x, z = this.state.z; Object.assign(this.state, state); this.corrections++;
    const inp = makeInput(), ev = makeBoatEvents();
    for (let seq = Math.max(ack + 1, this.newest - 255); seq <= this.newest; seq++) {
      const r = this.ring[seq % 256]; if (r.seq !== seq) continue;
      inp.seq = seq; inp.buttons = r.buttons; stepBoat(this.state, inp, this.course, ev, r.drive); Object.assign(r.state, this.state);
    }
    const dx = this.state.x - x, dz = this.state.z - z;
    if (reset || Math.hypot(dx, dz) > 5) this.offset.x = this.offset.z = 0;
    else { this.offset.x -= dx; this.offset.z -= dz; }
  }
  decay(dt: number): void { const k = Math.exp(-dt * 12); this.offset.x *= k; this.offset.z *= k; }
}
