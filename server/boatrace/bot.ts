import { BTN_BACK, BTN_FORWARD, BTN_LEFT, BTN_RIGHT, BTN_USE, makeInput, type Input } from '../../shared/sim.ts';
import type { BoatCourse } from '../../shared/boatracemap.ts';
import type { BoatState } from '../../shared/boatrace.ts';
import { locateAny, makeLoc, wrapSeg } from '../../shared/track.ts';
/** Bounded button-only pilot; uses the identical physics and gates as humans. */
export class BoatBot {
  private readonly course: BoatCourse;
  private readonly top: number;
  private readonly loc = makeLoc();
  constructor(course: BoatCourse, top = 20) { this.course = course; this.top = top; }
  input(s: BoatState, tick: number): Input {
    const tr = this.course.track, at = locateAny(tr, s.x, s.z, this.loc), speed = Math.hypot(s.vx, s.vz);
    let i = at.seg, ahead = 6 + speed * 0.5;
    while (ahead > 0) { ahead -= tr.len[i]; i = wrapSeg(tr, i + 1); }
    const dx = tr.px[i] - s.x, dz = tr.pz[i] - s.z;
    const angle = Math.atan2(s.hx * dz - s.hz * dx, s.hx * dx + s.hz * dz);
    const desired = Math.max(-1, Math.min(1, -angle * 2.7));
    let buttons = desired > s.steer + 0.035 ? BTN_LEFT : desired < s.steer - 0.035 ? BTN_RIGHT : 0;
    const bend = Math.max(Math.abs(tr.curv[i]), Math.abs(tr.curv[wrapSeg(tr, i + 5)]));
    const target = Math.min(this.top, bend > 0.02 ? 16 : 23);
    buttons |= speed > target + 0.8 ? BTN_BACK : speed < target ? BTN_FORWARD : 0;
    if (s.nitro && bend < 0.012 && Math.abs(angle) < 0.1) buttons |= BTN_USE;
    return { ...makeInput(), seq: tick, buttons, viewTick: tick };
  }
}
