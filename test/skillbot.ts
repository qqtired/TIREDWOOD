// Проверка достижимости «Выше облаков» настоящей физикой: бег к цели (взгляд — на цель каждый тик), прыжок в один из
// тиков, без рывка. Ловушки не мешают (неуязвимость через s.fireCd) — здесь проверяется геометрия и время подвижного.
import { PLAYER_HALF } from '../shared/constants.ts';
import type { SkillLink, SkillMap, SkillRect } from '../shared/skillmap.ts';
import { SkillDynamics, inBell, moverAt, type P3 } from '../shared/skillphysics.ts';
import { BTN_FORWARD, BTN_JUMP, copyState, makeEvents, makeInput, makeState, type PlayerState } from '../shared/sim.ts';
import { CollisionWorld } from '../shared/world.ts';

export interface LinkResult {
  ok: boolean;
  /** С какого тика старт и на каком тике прыжок (−1 — без прыжка), сколько тиков до цели */
  start: number;
  jump: number;
  ticks: number;
}

const p = { x: 0, y: 0, z: 0 };

function over(s: PlayerState, r: { x0: number; x1: number; z0: number; z1: number }): boolean {
  return s.x - PLAYER_HALF < r.x1 && s.x + PLAYER_HALF > r.x0 && s.z - PLAYER_HALF < r.z1 && s.z + PLAYER_HALF > r.z0;
}

export class SkillBot {
  readonly map: SkillMap;
  readonly world: CollisionWorld;
  readonly dyn: SkillDynamics;
  private readonly ev = makeEvents();

  constructor(map: SkillMap) {
    this.map = map;
    this.world = new CollisionWorld(map);
    this.dyn = new SkillDynamics(map, this.world);
  }

  private aim(link: SkillLink, t: number, out: P3): P3 {
    const to = link.to;
    if ('movers' in to) {
      this.nearestMover(to.movers, t, out);
      if (to.at) { out.x += to.at[0]; out.z += to.at[1]; }
      return out;
    }
    if ('disc' in to) { out.x = this.map.disc.cx; out.y = this.map.disc.top; out.z = this.map.disc.cz; return out; }
    if ('bell' in to) { out.x = 0; out.y = 65; out.z = 0; return out; }
    const r = to as SkillRect;
    out.x = (r.x0 + r.x1) / 2; out.y = r.y; out.z = (r.z0 + r.z1) / 2;
    return out;
  }

  reached(link: SkillLink, s: PlayerState): boolean {
    const to = link.to;
    const w = this.world;
    if ('bell' in to) return inBell(this.map, s);
    if ('movers' in to) {
      // тележка-батут подбрасывает сразу — на ней не постоять
      return to.movers.some((i) => {
        const m = this.map.movers[i];
        const b = m.box;
        const at = to.at;
        if (at && Math.hypot((w.minX[b] + w.maxX[b]) / 2 + at[0] - s.x, (w.minZ[b] + w.maxZ[b]) / 2 + at[1] - s.z) > 0.45) return false;
        return (s.grounded === 1 || m.bounce !== undefined) && Math.abs(s.y - w.maxY[b]) < 0.03 && over(s, { x0: w.minX[b], x1: w.maxX[b], z0: w.minZ[b], z1: w.maxZ[b] });
      });
    }
    if (s.grounded !== 1) return false;
    if ('disc' in to) {
      return this.map.disc.boxes.some((b) => Math.abs(s.y - w.maxY[b]) < 0.03 && over(s, { x0: w.minX[b], x1: w.maxX[b], z0: w.minZ[b], z1: w.maxZ[b] }));
    }
    const r = to as SkillRect;
    return Math.abs(s.y - r.y) < 0.01 && over(s, r);
  }

  /** Одна попытка: старт в t0, прыжок на тике jump (−1 — без прыжка). */
  attempt(link: SkillLink, t0: number, jump: number, maxTicks = 420): number {
    const s = makeState();
    if (link.from !== undefined) {
      moverAt(this.map.movers[link.from], t0, p);
      s.x = p.x; s.y = p.y; s.z = p.z;
    } else {
      s.x = link.x; s.y = link.y; s.z = link.z;
    }
    s.grounded = 1;
    s.fireCd = 1e6;
    const inp = makeInput();
    const startY = s.y;
    let prev = NaN;
    let via = link.via;
    for (let i = 0; i < maxTicks; i++) {
      const t = t0 + i;
      this.me.x = s.x; this.me.y = s.y; this.me.z = s.z;
      this.aim(link, t, p);
      if (via) {
        // сначала к грибу (пока не подбросит) или в поток (пока не поднимет выше цели), потом — к цели
        const done = link.how === 'bounce' ? this.ev.bounced : link.how === 'lift' ? s.y > p.y + 0.6 : Math.hypot(via[0] - s.x, via[1] - s.z) < 0.3;
        if (done) via = undefined;
        else { p.x = via[0]; p.z = via[1]; }
      }
      inp.seq = i + 1;
      inp.viewTick = t;
      this.steer(s, p.x, p.z, inp);
      if (i === jump) inp.buttons |= BTN_JUMP;
      this.dyn.step(s, inp, prev, this.ev);
      prev = t;
      if (this.reached(link, s)) return i + 1;
      if (s.y < startY - 8 || !Number.isFinite(s.x + s.y + s.z)) return -1;
    }
    return -1;
  }

  /** Ближайшая по высоте ног (а потом по земле) из подвижных площадок — к ней и идём. */
  protected readonly me = { x: 0, y: 0, z: 0 };
  protected nearestMover(list: number[], t: number, out: P3): P3 {
    let best = Infinity;
    const q = { x: 0, y: 0, z: 0 };
    for (const i of list) {
      moverAt(this.map.movers[i], t, q);
      const d = Math.abs(q.y - this.me.y) * 4 + Math.hypot(q.x - this.me.x, q.z - this.me.z);
      if (d < best) { best = d; out.x = q.x; out.y = q.y; out.z = q.z; }
    }
    return out;
  }

  /** Как человек: на земле — бег к цели, в воздухе — поправка скорости к нужной (без кругов вокруг цели). */
  steer(s: PlayerState, x: number, z: number, inp: { yaw: number; buttons: number }): void {
    const dx = x - s.x, dz = z - s.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    inp.buttons = 0;
    if (s.grounded === 1) {
      // на земле трение тормозит само: у цели — отпустить, чтобы не проскочить
      const speed = Math.sqrt(s.vx * s.vx + s.vz * s.vz);
      if (dist > 0.15 + 0.07 * speed) { inp.yaw = Math.atan2(-dx, -dz); inp.buttons = BTN_FORWARD; }
      return;
    }
    const want = dist > 1e-6 ? Math.min(8.4, dist * 4) / dist : 0;
    const ex = dx * want - s.vx, ez = dz * want - s.vz;
    if (ex * ex + ez * ez > 0.09) { inp.yaw = Math.atan2(-ex, -ez); inp.buttons = BTN_FORWARD; }
  }

  /** Найти хоть один способ пройти переход. */
  check(link: SkillLink): LinkResult {
    const starts = link.at ?? [0];
    const jumps = link.how === 'jump' ? [...Array.from({ length: 70 }, (_, i) => i), -1] : [-1, ...Array.from({ length: 70 }, (_, i) => i)];
    for (const t0 of starts) {
      for (const j of jumps) {
        const n = this.attempt(link, t0, j);
        if (n > 0) return { ok: true, start: t0, jump: j, ticks: n };
      }
    }
    return { ok: false, start: -1, jump: -1, ticks: 0 };
  }
}

export interface LegLog {
  name: string;
  /** Тик начала ожидания, сколько ждал, тик прыжка (−1 — без), тик прихода */
  at: number;
  wait: number;
  jump: number;
  end: number;
}

/**
 * Весь маршрут с включёнными ловушками: перед каждым переходом бот подходит к его началу, ждёт подходящий момент
 * (перебор), идёт/прыгает; сбило или упал — другой момент. Не вышло — шаг назад (другой момент прошлого перехода).
 */
export class SkillRouteBot extends SkillBot {
  steps = 0;
  budget = 40_000_000;
  log: ((text: string) => void) | null = null;

  /** Подойти, подождать wait тиков, пройти. Возвращает тик прихода или −1. */
  private leg(link: SkillLink, s: PlayerState, t: number, wait: number, jump: number): number {
    const inp = makeInput();
    const startY = s.y;
    const floor = Math.min(startY, 'y' in link.to ? (link.to as SkillRect).y : startY) - 2.5;
    let prev = t - 1;
    const tick = (buttons: number | null, tx: number, tz: number): boolean => {
      inp.seq++;
      inp.viewTick = t;
      if (buttons === null) this.steer(s, tx, tz, inp);
      else inp.buttons = buttons;
      this.dyn.step(s, inp, prev, this.ev2);
      this.steps++;
      prev = t;
      t++;
      return s.fireCd === 0 && s.y > floor && Number.isFinite(s.x + s.y + s.z);
    };
    // подойти к началу перехода (если он не с подвижной площадки и не «без остановки»)
    if (link.from === undefined && !link.flow) {
      for (let i = 0; i < 300 && Math.hypot(link.x - s.x, link.z - s.z) > 0.25; i++) if (!tick(null, link.x, link.z)) return -1;
      for (let i = 0; i < 8; i++) if (!tick(0, 0, 0)) return -1;
    }
    for (let i = 0; i < wait; i++) if (!tick(0, 0, 0)) return -1;
    let via = link.via;
    for (let i = 0; i < 420; i++) {
      this.me.x = s.x; this.me.y = s.y; this.me.z = s.z;
      this.aimAt(link, t, p);
      if (via) {
        const done = link.how === 'bounce' ? this.ev2.bounced : link.how === 'lift' ? s.y > p.y + 0.6 : Math.hypot(via[0] - s.x, via[1] - s.z) < 0.3;
        if (done) via = undefined;
        else { p.x = via[0]; p.z = via[1]; }
      }
      inp.seq++;
      inp.viewTick = t;
      this.steer(s, p.x, p.z, inp);
      if (i === jump) inp.buttons |= BTN_JUMP;
      this.dyn.step(s, inp, prev, this.ev2);
      this.steps++;
      prev = t;
      t++;
      if (s.fireCd > 0 || s.y < floor || !Number.isFinite(s.x + s.y + s.z)) return -1;
      if (this.reached(link, s)) {
        // устоять пару тиков (облако не растаяло под ногами, ступень не осыпалась); «без остановки» — бежим дальше
        const springy = 'movers' in link.to && link.to.movers.some((m) => this.map.movers[m].bounce !== undefined);
        if (!link.flow && !springy && !('bell' in link.to)) for (let k = 0; k < 6; k++) if (!tick(0, 0, 0) || s.grounded !== 1) return -1;
        return t;
      }
    }
    return -1;
  }

  private readonly ev2 = makeEvents();

  aimAt(link: SkillLink, t: number, out: P3): P3 {
    const to = link.to;
    if ('movers' in to) {
      this.nearestMover(to.movers, t, out);
      if (to.at) { out.x += to.at[0]; out.z += to.at[1]; }
      return out;
    }
    if ('disc' in to) { out.x = this.map.disc.cx; out.y = this.map.disc.top; out.z = this.map.disc.cz; return out; }
    if ('bell' in to) { out.x = 0; out.y = 65; out.z = 0; return out; }
    const r = to as SkillRect;
    out.x = (r.x0 + r.x1) / 2; out.y = r.y; out.z = (r.z0 + r.z1) / 2;
    return out;
  }

  /** Пройти маршрут от состояния s в момент t. */
  run(route: SkillLink[], s0: PlayerState, t0: number, maxWait = 720): { ok: boolean; end: number; legs: LegLog[]; failed: string } {
    const legs: LegLog[] = [];
    let failed = '';
    const solve = (k: number, s: PlayerState, t: number): number => {
      if (k === route.length) return t;
      if (this.steps > this.budget) return -1;
      const link = route[k];
      const jumps = link.how === 'jump' ? Array.from({ length: 30 }, (_, i) => i) : [-1, 0, 4, 8];
      let tries = 0;
      for (let wait = 0; wait <= maxWait; wait += 4) {
        for (const j of jumps) {
          const st = copyState(makeState(), s);
          const end = this.leg(link, st, t, wait, j);
          if (end < 0) continue;
          legs[k] = { name: link.name, at: t, wait, jump: j, end };
          this.log?.(`${k} ${link.name}: t ${t} wait ${wait} jump ${j} → ${end} (steps ${this.steps})`);
          const fin = solve(k + 1, st, end);
          if (fin >= 0) return fin;
          // в цепочке «без остановки» другой момент не ищем — пусть решает переход перед цепочкой
          if (++tries >= (link.flow ? 1 : 3)) { if (!failed) failed = route[k + 1]?.name ?? ''; return -1; }
          break;
        }
      }
      if (!failed) failed = link.name;
      this.log?.(`${k} ${link.name}: FAIL from t ${t} at (${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)})`);
      return -1;
    };
    const end = solve(0, copyState(makeState(), s0), t0);
    return { ok: end >= 0, end, legs: legs.slice(0, route.length), failed };
  }
}
