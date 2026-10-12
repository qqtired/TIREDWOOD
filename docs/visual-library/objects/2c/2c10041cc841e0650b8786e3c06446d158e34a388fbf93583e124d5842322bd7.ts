// «Портовая регата» на набережной. Круг сбора у пирса (16, 18) → катера на решётке у арки (5 с отсчёта) → три круга
// по бухте → итоги 10 с (E — «Ещё!»: кто нажал, через 5 с снова на решётке) → остальные — на площадь. Всё в той же
// комнате: катера видят все, гонщик — тот же игрок набережной (действие ACT_REGATTA, его не поднять шагом).
// Ввод гонщика — его очередь входов набережной; шаги — по бюджету: в среднем не больше одного на тик (пачка входов
// не ускоряет), догадка в паузе связи потом не повторяется (долг закрывают опоздавшие входы той же паузы).
// Решает сервер: места, награда, рекорды. Ботами добиваем до 4 катеров, но только в заезде с одним человеком
// (shared/solobots.ts): вдвоём и больше — без ботов.
import { TICK_RATE } from '../../shared/constants.ts';
import { makeRng } from '../../shared/math.ts';
import { botsAllowed } from '../../shared/solobots.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import { DEFAULT_OUTFIT, type Outfit } from '../../shared/outfit.ts';
import {
  RG_AFK_TICKS, RG_AFTER_FIRST, RG_GRID_TICKS, RG_LIMIT_TICKS, RG_MAX, RG_MIN_BOATS, RG_REMATCH_TICKS, RG_RESULTS_TICKS, encodeRegatta,
  regattaReward, rgFlags, withRegattaSelf, type RgCityBoat, type RgEntry, type RgPhase, type RgRow, type RgView,
} from '../../shared/regatta.ts';
import { RG_COURSE, RG_LAPS, regattaCourse } from '../../shared/regattacourse.ts';
import {
  collideRgBoats, makeRgBoat, makeRgEvents, placeRgBoat, rgProgress, stepRgBoat, type RgBoat, type RgEvents,
} from '../../shared/regattaphysics.ts';
import { BTN_FIRE, BTN_FORWARD, BTN_RELOAD, BTN_USE, type Input } from '../../shared/sim.ts';
import type { InputQueue } from '../inputs.ts';
import { RG_BOT_NAMES, RgBot } from './regattabot.ts';
import type { LobbyPlayer } from './room.ts';

/** Бюджет шагов: +1 за тик, не больше 4 в запасе; входов за тик — не больше двух */
export const RG_BUDGET_CAP = 4;
/** Без входов дольше 8 тиков — шаг-догадка по последним кнопкам (без разовых), дольше 1,5 с — без кнопок */
const RG_STARVE = 8;
const RG_IDLE_STOP = 90;
const RG_ONE_SHOT = BTN_FIRE | BTN_RELOAD | BTN_USE;
/** Метка входа: не раньше прошлой и не дальше 2,5 с назад от тика сервера (как у аквапарка) */
const RG_LAG = 150;
/** Резинка ботов: дальше 40 м от ближайшего человека — ±5 % к потолку */
const RUBBER_M = 40;

/**
 * Шаги катера человека по его очереди входов. Пачка входов не ускоряет (бюджет), пауза связи не отнимает время
 * (догадки по последним кнопкам), а потом опоздавшие входы той же паузы только подтверждаются (долг): шагов
 * столько же, сколько прошло тиков. Вкладка спала (метки входов прыгнули вперёд) — долг прощается.
 */
export class StepBudget {
  budget = RG_BUDGET_CAP;
  debt = 0;
  starve = 0;
  /** Метка времени, до которой шаги уже сделаны (настоящими входами или догадками) */
  vt = -1;

  run(q: InputQueue, last: Input, step: (inp: Input, real: boolean) => void): void {
    this.budget = Math.min(this.budget + 1, RG_BUDGET_CAP);
    const items = q.items;
    if (items.length > 0) {
      this.starve = 0;
      q.starve = 0;
      while (this.debt > 0 && items.length > 0 && items[0].viewTick <= this.vt + 0.5) {
        this.take(q, last);
        this.debt--;
      }
      if (items.length > 0) this.debt = 0;
      let n = 0;
      while (items.length > 0 && n < 2 && this.budget >= 1) {
        step(this.take(q, last), true);
        this.budget--;
        n++;
      }
      return;
    }
    if (++this.starve <= RG_STARVE || this.budget < 1) return;
    const saved = last.buttons;
    last.buttons = this.starve > RG_IDLE_STOP ? 0 : saved & ~RG_ONE_SHOT;
    step(last, false);
    last.buttons = saved;
    this.budget--;
    this.debt++;
    this.vt += 1;
  }

  private take(q: InputQueue, last: Input): Input {
    const inp = q.items.shift()!;
    q.ack = inp.seq;
    last.seq = inp.seq;
    last.buttons = inp.buttons;
    last.yaw = inp.yaw;
    last.pitch = inp.pitch;
    last.viewTick = inp.viewTick;
    if (inp.viewTick > this.vt) this.vt = inp.viewTick;
    return inp;
  }
}

export interface RgHost {
  tick(): number;
  players(): Iterable<LobbyPlayer>;
  /** Посадить в катер (действие ACT_REGATTA, аргумент — номер катера) и снять с катера на площадь у круга */
  board(p: LobbyPlayer, id: number): void;
  unboard(p: LobbyPlayer): void;
  /** Желейка гонщика — там же, где катер (голос, «кто где») */
  follow(p: LobbyPlayer, s: RgBoat): void;
  outfit(p: LobbyPlayer): Outfit;
  level(p: LobbyPlayer): number;
  send(p: LobbyPlayer, msg: ServerMsg): void;
  broadcast(msg: ServerMsg): void;
  toast(p: LobbyPlayer, text: string): void;
  announce(text: string): void;
  /** Итог заезда в профиль: статистика, лучший круг, жетоны (pid — и для ушедших) */
  settle(pid: number, row: RgRow): void;
  /** Круг на доску рекордов бухты: место (−1 — не попал) */
  record(pid: number, nick: string, ticks: number): number;
  /** Свой лучший круг регаты по профилю (тики, 0 — ещё нет) */
  bestLap(p: LobbyPlayer): number;
  /** Кого взять из круга сбора в новый заезд */
  queue(n: number): LobbyPlayer[];
}

interface Racer {
  id: number;
  p: LobbyPlayer | null;
  pid: number;
  nick: string;
  o: Outfit;
  level: number;
  bot: RgBot | null;
  botSeq: number;
  readonly s: RgBoat;
  readonly ev: RgEvents;
  readonly budget: StepBudget;
  /** Метка последнего входа (зажатая) */
  t: number;
  active: number;
  idle: number;
  /** Тик финиша на сервере (0 — нет) */
  finish: number;
  place: number;
  again: boolean;
  reset: number;
  /** Лучшее место на доске бухты за заезд (−1 — не попал) */
  rec: number;
}

export class Regatta {
  readonly course = regattaCourse();
  phase: RgPhase = 'idle';
  private racers: Racer[] = [];
  /** Сошедшие с этого заезда: строка в итогах остаётся */
  private gone: RgRow[] = [];
  private rows: RgRow[] = [];
  private end = 0;
  private start = 0;
  private stop = 0;
  private firstFinish = 0;
  private rematchAt = 0;
  private shown = '';
  private dirty = true;
  /** Номер заезда: у катера в точном состоянии — клиент по нему понимает, что катер новый (без сверки) */
  private round = 0;
  private readonly host: RgHost;
  private readonly rnd: () => number;
  private readonly city: RgCityBoat[] = [];

  constructor(host: RgHost, rnd: () => number = makeRng((Date.now() & 0x7fffffff) | 1)) {
    this.host = host;
    this.rnd = rnd;
  }

  /** Людей в заезде */
  get humans(): number {
    let n = 0;
    for (const r of this.racers) if (r.p) n++;
    return n;
  }

  has(p: LobbyPlayer): boolean {
    return this.racers.some(r => r.p === p);
  }

  private racerOf(p: LobbyPlayer): Racer | undefined {
    return this.racers.find(r => r.p === p);
  }

  /** Новый заезд: люди — на решётку по порядку, боты — до четырёх катеров, но только если человек один. */
  begin(players: LobbyPlayer[]): void {
    const tick = this.host.tick();
    const humans = players.slice(0, RG_MAX);
    if (!humans.length) return;
    this.racers = [];
    this.gone = [];
    this.rows = [];
    this.round = (this.round + 1) & 0xffff;
    for (const p of humans) this.racers.push(this.racer(this.racers.length, p, null));
    // соло: один бот слабый, второй средний, третий сильный; вдвоём и больше — ботов нет
    const bots = botsAllowed(humans.length) ? Math.max(0, RG_MIN_BOATS - humans.length) : 0;
    const levels = [0, 1, 2];
    const names = [...RG_BOT_NAMES].sort(() => this.rnd() - 0.5);
    for (let i = 0; i < bots; i++) {
      const id = this.racers.length;
      const level = levels[i] ?? 1;
      const r = this.racer(id, null, new RgBot(this.course, level, makeRng(Math.floor(this.rnd() * 1e9) | 1)));
      r.nick = names[i % names.length];
      r.o = { ...DEFAULT_OUTFIT, c: (id * 3 + 2) % 10 };
      this.racers.push(r);
    }
    for (const r of this.racers) {
      placeRgBoat(r.s, this.course, r.id);
      if (r.p) {
        this.host.board(r.p, r.id);
        this.host.follow(r.p, r.s);
      }
    }
    this.phase = 'grid';
    this.start = tick + RG_GRID_TICKS;
    this.end = this.start;
    this.stop = 0;
    this.firstFinish = 0;
    this.rematchAt = 0;
    this.rank();
    this.dirty = true;
  }

  private racer(id: number, p: LobbyPlayer | null, bot: RgBot | null): Racer {
    return {
      id, p, pid: p?.client.pid ?? 0, nick: p?.client.nick ?? '', o: p ? this.host.outfit(p) : { ...DEFAULT_OUTFIT }, level: p ? this.host.level(p) : 1,
      bot, botSeq: 0, s: makeRgBoat(), ev: makeRgEvents(), budget: new StepBudget(), t: 0, active: 0, idle: 0, finish: 0, place: id + 1, again: false,
      reset: this.round, rec: -1,
    };
  }

  /** Гонка идёт для входа с меткой t (так же решает предсказание клиента). */
  private drive(t: number): boolean {
    return this.start > 0 && t >= this.start && (this.stop === 0 || t < this.stop) && this.phase !== 'idle';
  }

  /** Входы гонщика за тик (из обхода игроков комнаты). */
  consume(p: LobbyPlayer): void {
    const r = this.racerOf(p);
    if (!r) return;
    const tick = this.host.tick();
    r.budget.run(p.inq, p.lastInput, (inp, real) => {
      // метка входа: не назад и не дальше окна (подсунуть время можно только в его пределах)
      let t = real && inp.viewTick > r.t ? inp.viewTick : r.t;
      if (t < tick - RG_LAG) t = tick - RG_LAG;
      if (t > tick) t = tick;
      r.t = t;
      const before = r.s.prevButtons;
      stepRgBoat(r.s, inp, this.course, r.ev, this.drive(t));
      // догадка сервера в паузе связи — тоже «стоит»
      r.idle = real && inp.buttons !== 0 ? 0 : r.idle + 1;
      if (real && this.phase === 'results' && (inp.buttons & ~before & BTN_USE) !== 0) this.vote(r);
      this.after(r, inp);
    });
  }

  /** После шага: на ходу ли, круг, финиш, рекорды. */
  private after(r: Racer, inp: Input): void {
    const s = r.s;
    const ev = r.ev;
    if (this.phase === 'race' && !s.done && (inp.buttons & BTN_FORWARD) !== 0 && Math.hypot(s.vx, s.vz) > 2) r.active++;
    if (ev.lapTicks > 0 && r.p) {
      const place = this.host.record(r.pid, r.nick, ev.lapTicks);
      if (place >= 0 && (r.rec < 0 || place < r.rec)) r.rec = place;
      if (place === 0) this.host.announce(`🚤 ${r.nick} проходит круг регаты за ${fmt(ev.lapTicks)} — рекорд бухты!`);
      else if (place > 0) this.host.toast(r.p, `Круг ${fmt(ev.lapTicks)} — ${place + 1}-е место на доске бухты!`);
    }
    if (ev.finish) {
      r.finish = this.host.tick();
      if (!this.firstFinish && r.p) this.firstFinish = r.finish;
      this.rank();
      if (r.p) {
        // свой лучший круг — по профилю до итогов (в профиль его запишут на итогах)
        const prev = this.host.bestLap(r.p);
        this.host.send(r.p, { t: 'rgFin', place: r.place, ticks: s.rt, best: s.best, record: r.rec, pb: s.best > 0 && (prev === 0 || s.best < prev) });
      }
      this.dirty = true;
    }
  }

  private vote(r: Racer): void {
    if (r.again || !r.p) return;
    r.again = true;
    const tick = this.host.tick();
    if (!this.rematchAt) this.rematchAt = tick + RG_REMATCH_TICKS;
    if (this.end < this.rematchAt) this.end = this.rematchAt;
    this.dirty = true;
  }

  /** Тик гонки: боты, столкновения катеров, места, фазы. Вызывать после обхода игроков. */
  step(): void {
    if (this.phase === 'idle') return;
    const tick = this.host.tick();
    if (this.phase === 'grid' && tick >= this.start) {
      this.phase = 'race';
      this.end = this.start + RG_LIMIT_TICKS;
      this.dirty = true;
    }
    this.rubber();
    for (const r of this.racers) {
      if (!r.bot) continue;
      const inp = r.bot.input(r.s, ++r.botSeq, this.phase === 'grid' ? this.start - tick : 0);
      stepRgBoat(r.s, inp, this.course, r.ev, this.drive(tick), r.bot.topMul);
      this.after(r, inp);
    }
    for (let i = 0; i < this.racers.length; i++) {
      for (let j = i + 1; j < this.racers.length; j++) collideRgBoats(this.racers[i].s, this.racers[j].s);
    }
    this.rank();
    for (const r of this.racers) if (r.p) this.host.follow(r.p, r.s);
    if (this.phase === 'race') {
      for (const r of [...this.racers]) {
        if (r.p && !r.s.done && r.idle > RG_AFK_TICKS) {
          this.host.toast(r.p, 'Катер стоял 40 секунд — ты снова на набережной');
          this.drop(r.p, 'afk');
        }
      }
      const humans = this.racers.filter(r => r.p);
      if (!humans.length) {
        this.close();
        return;
      }
      if (humans.every(r => r.s.done) || tick >= this.end || (this.firstFinish > 0 && tick >= this.firstFinish + RG_AFTER_FIRST)) this.results();
    } else if (this.phase === 'results') {
      if (!this.racers.some(r => r.p)) this.close();
      else if (this.rematchAt > 0 && tick >= this.rematchAt) this.rematch();
      else if (tick >= this.end) this.close();
    }
    if (this.dirty) this.publish();
  }

  /** Боты далеко впереди людей — чуть медленнее, далеко позади — чуть быстрее. */
  private rubber(): void {
    const humans = this.racers.filter(r => r.p);
    for (const r of this.racers) {
      if (!r.bot) continue;
      if (!humans.length) {
        r.bot.rubber = 1;
        continue;
      }
      const me = rgProgress(r.s, this.course);
      let gap = Infinity;
      for (const h of humans) {
        const d = me - rgProgress(h.s, this.course);
        if (Math.abs(d) < Math.abs(gap)) gap = d;
      }
      r.bot.rubber = gap > RUBBER_M ? 0.95 : gap < -RUBBER_M ? 1.05 : 1;
    }
  }

  /** Места: финишировавшие — по своему времени, остальные — по пути. */
  private rank(): void {
    const prog = new Map<Racer, number>();
    for (const r of this.racers) prog.set(r, rgProgress(r.s, this.course));
    const list = [...this.racers].sort((a, b) => {
      if (a.s.done || b.s.done) {
        if (a.s.done && b.s.done) return a.s.rt - b.s.rt || a.finish - b.finish;
        return a.s.done ? -1 : 1;
      }
      return prog.get(b)! - prog.get(a)!;
    });
    list.forEach((r, i) => (r.place = i + 1));
  }

  private row(r: Racer, left: boolean): RgRow {
    return {
      id: r.id, pid: r.pid, nick: r.nick, bot: !!r.bot, pos: r.s.done ? r.place : 0, finished: !!r.s.done, ticks: r.s.done ? r.s.rt : 0,
      best: r.s.best, left, reward: 0,
    };
  }

  /** Гонка кончилась: итоги, награды людям, «Ещё!». */
  private results(): void {
    const tick = this.host.tick();
    this.phase = 'results';
    this.stop = tick;
    this.end = tick + RG_RESULTS_TICKS;
    this.rank();
    const rows = this.racers.map(r => this.row(r, false));
    for (const row of rows) {
      const r = this.racers.find(x => x.id === row.id)!;
      if (!r.p) continue;
      row.reward = regattaReward(row.pos, r.active, row.finished);
      this.host.settle(r.pid, row);
    }
    rows.sort((a, b) => (a.pos || 99) - (b.pos || 99) || this.placeOf(a.id) - this.placeOf(b.id));
    this.rows = [...rows, ...this.gone];
    const win = rows[0];
    if (win?.finished && rows.some(r => !r.bot)) this.host.announce(`🏁 Портовая регата: побеждает ${win.nick}${win.bot ? ' (бот)' : ''} — ${fmt(win.ticks)}`);
    this.dirty = true;
  }

  private placeOf(id: number): number {
    return this.racers.find(r => r.id === id)?.place ?? 99;
  }

  /** «Ещё!»: нажавшие — снова на решётку (и кто ждёт в круге), остальные — на площадь. */
  private rematch(): void {
    const keep = this.racers
      .filter(r => r.p && r.again)
      .sort((a, b) => a.place - b.place)
      .map(r => r.p!);
    for (const r of this.racers) if (r.p && !r.again) this.host.unboard(r.p);
    const extra = this.host.queue(RG_MAX - keep.length);
    if (keep.length + extra.length === 0) {
      this.close();
      return;
    }
    this.begin([...keep, ...extra]);
  }

  /** Заезд закрыт: все на площадь, вода пустая. */
  private close(): void {
    for (const r of this.racers) if (r.p) this.host.unboard(r.p);
    this.racers = [];
    this.gone = [];
    this.rows = [];
    this.phase = 'idle';
    this.start = this.stop = this.end = this.firstFinish = this.rematchAt = 0;
    this.dirty = true;
    this.publish();
  }

  /** Сошёл: вышел из игры (left), сам (quit) или стоял (afk). Строка в итогах остаётся. */
  drop(p: LobbyPlayer, why: 'left' | 'quit' | 'afk'): void {
    const r = this.racerOf(p);
    if (!r) return;
    this.racers = this.racers.filter(x => x !== r);
    r.p = null;
    const row = this.row(r, true);
    if (this.phase === 'race') {
      // ещё не получил итог: в профиль — заезд без награды, в итогах — «сошёл»
      this.host.settle(r.pid, row);
      this.gone.push(row);
    }
    if (why !== 'left') this.host.unboard(p);
    this.dirty = true;
    if (!this.racers.some(x => x.p)) this.close();
  }

  /** Сойти на берег по кнопке. */
  quit(p: LobbyPlayer): void {
    if (this.has(p)) this.drop(p, 'quit');
  }

  /** Ник или наряд поменялся — в табло и у всех. */
  refresh(p: LobbyPlayer): void {
    const r = this.racerOf(p);
    if (!r) return;
    r.nick = p.client.nick;
    r.o = this.host.outfit(p);
    r.level = this.host.level(p);
    this.dirty = true;
  }

  view(): RgView {
    return {
      phase: this.phase, end: this.end, start: this.start, stop: this.stop, laps: RG_LAPS, course: RG_COURSE,
      boats: this.racers.map((r): RgEntry => ({ id: r.id, slot: r.p?.slot ?? 0, pid: r.pid, nick: r.nick, bot: !!r.bot, o: r.o, level: r.level })),
      rows: this.rows, again: this.racers.filter(r => r.again).map(r => r.id), rematch: this.rematchAt,
    };
  }

  private publish(): void {
    this.dirty = false;
    const v = this.view();
    const key = JSON.stringify(v);
    if (key === this.shown) return;
    this.shown = key;
    this.host.broadcast({ t: 'rg', v });
  }

  /** Где катера — всем на набережной (раз в 2 тика), гонщику — ещё и точное состояние своего катера. */
  send(): void {
    if (this.phase === 'idle') return;
    const list = this.city;
    list.length = 0;
    for (const r of this.racers) {
      const s = r.s;
      list.push({
        id: r.id, slot: r.p?.slot ?? 0, x: s.x, z: s.z, y: s.y, hx: s.hx, hz: s.hz, speed: Math.hypot(s.vx, s.vz), steer: s.steer, fl: rgFlags(s),
        lap: s.lap, cp: s.cp, place: r.place, hits: s.hits,
      });
    }
    const common = encodeRegatta(this.host.tick(), list);
    for (const p of this.host.players()) {
      const r = this.racerOf(p);
      p.client.sink.sendBinary(r ? withRegattaSelf(common, p.inq.ack, r.reset, r.s) : common);
    }
  }

  /** Отладка и тесты */
  state(p: LobbyPlayer): RgBoat | null {
    return this.racerOf(p)?.s ?? null;
  }

  debug(): { phase: RgPhase; start: number; stop: number; end: number; boats: Array<{ id: number; nick: string; bot: boolean; lap: number; cp: number; done: number; place: number; x: number; z: number }> } {
    return {
      phase: this.phase, start: this.start, stop: this.stop, end: this.end,
      boats: this.racers.map(r => ({ id: r.id, nick: r.nick, bot: !!r.bot, lap: r.s.lap, cp: r.s.cp, done: r.s.done, place: r.place, x: r.s.x, z: r.s.z })),
    };
  }
}

/** Флаг BOATRACE: «1» — включена, «0» — выключена, без флага — как в разработке. */
export function regattaEnabled(v: string | undefined, dev: boolean): boolean {
  return v === '1' ? true : v === '0' ? false : dev;
}

/** Тики → «м:сс.сс» */
export function fmt(ticks: number): string {
  const cs = Math.round((ticks * 100) / TICK_RATE);
  return `${Math.floor(cs / 6000)}:${String(Math.floor((cs % 6000) / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}
