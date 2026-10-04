// Гидроплан «Стриж» на сервере (shared/plane.ts): кто пилот, очередь, оплата, шаги самолёта по входам пилота
// (тот же бюджет шагов, что у регаты: пачка входов не ускоряет, пауза связи не останавливает), позиции всем
// на набережной 15 раз в секунду и точное состояние пилоту. Без пилота (вышел из игры) самолёт сам летит домой.
import { TICK_RATE } from '../../shared/constants.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import type { Outfit } from '../../shared/outfit.ts';
import {
  PL_DOCK, PL_FLY, PL_HOME, PL_LAND, PL_START, PLANE_AFK_TICKS, PLANE_FLY_TICKS, PLANE_HOLD_TICKS, PLANE_PRICE, PLANE_QUEUE_MAX, PLANE_SEND_EVERY,
  PLANE_TRIP_TICKS, makePlane, planeEta, planePosArray, startPlane, stepPlane, type PlaneState, type PlaneView,
} from '../../shared/plane.ts';
import { makeInput } from '../../shared/sim.ts';
import { StepBudget } from './regatta.ts';
import type { LobbyPlayer } from './room.ts';

export interface PlaneHost {
  tick(): number;
  players(): Iterable<LobbyPlayer>;
  /** Есть профиль и это не проверочный вход */
  can(p: LobbyPlayer): boolean;
  balance(p: LobbyPlayer): number;
  /** Списать жетоны (false — не хватает) */
  pay(p: LobbyPlayer, n: number): boolean;
  /** Посадить в самолёт (действие ACT_PLANE) и высадить на набережную у стоянки */
  board(p: LobbyPlayer): void;
  unboard(p: LobbyPlayer): void;
  /** Желейка пилота — там же, где самолёт (в пределах снимка) */
  follow(p: LobbyPlayer, s: PlaneState): void;
  outfit(p: LobbyPlayer): Outfit;
  level(p: LobbyPlayer): number;
  send(p: LobbyPlayer, msg: ServerMsg): void;
  broadcast(msg: ServerMsg): void;
  toast(p: LobbyPlayer, text: string): void;
  announce(text: string): void;
}

interface Waiting {
  pid: number;
  nick: string;
}

/** Тики → «2 мин» или «40 с» */
export function fmtWait(ticks: number): string {
  const s = Math.max(1, Math.ceil(ticks / TICK_RATE));
  return s < 90 ? `${s} с` : `${Math.round(s / 60)} мин`;
}

export class PlaneHall {
  readonly s: PlaneState = makePlane();
  pilot: LobbyPlayer | null = null;
  private pid = 0;
  private nick = '';
  private o: Outfit | null = null;
  private level = 1;
  private budget = new StepBudget();
  /** С какого входа пилота — домой («Сесть сейчас»); Infinity — не просил */
  private landAt = Infinity;
  private queue: Waiting[] = [];
  /** Подошла очередь: самолёт ждёт этого игрока до тика until */
  private hold: (Waiting & { until: number }) | null = null;
  private lastPh = PL_DOCK;
  private why: 'time' | 'land' | 'afk' | 'gone' = 'time';
  private dirty = true;
  private shown = '';
  private readonly idle = makeInput();
  private readonly host: PlaneHost;

  constructor(host: PlaneHost) {
    this.host = host;
  }

  /** Самолёт в деле (для «не перезапускать сервер, пока кто-то в режиме») */
  get busy(): number {
    return this.s.ph !== PL_DOCK && this.pilot ? 1 : 0;
  }

  isPilot(p: LobbyPlayer): boolean {
    return this.pilot === p;
  }

  /** E у самолёта: свободен — платишь и садишься; занят или ждёт другого — в очередь. */
  use(p: LobbyPlayer): void {
    if (!this.host.can(p) || this.pilot === p) return;
    const pid = p.client.pid;
    if (this.s.ph !== PL_DOCK || (this.hold && this.hold.pid !== pid)) {
      this.enqueue(p);
      return;
    }
    if (!this.host.pay(p, PLANE_PRICE)) {
      this.host.toast(p, `Полёт над городом — ${PLANE_PRICE} 🪙, а у тебя ${this.host.balance(p)}`);
      return;
    }
    this.hold = null;
    this.queue = this.queue.filter((q) => q.pid !== pid);
    this.board(p);
  }

  private enqueue(p: LobbyPlayer): void {
    const pid = p.client.pid;
    let i = this.queue.findIndex((q) => q.pid === pid);
    if (i < 0) {
      if (this.queue.length >= PLANE_QUEUE_MAX) {
        this.host.toast(p, 'Очередь на самолёт полная — загляни чуть позже');
        return;
      }
      this.queue.push({ pid, nick: p.client.nick });
      i = this.queue.length - 1;
      this.dirty = true;
    }
    const who = this.s.ph === PL_DOCK ? `ждёт ${this.hold?.nick ?? 'пилота'} по очереди` : this.pilot ? `в полёте — летит ${this.nick}` : 'летит домой';
    this.host.toast(p, `Самолёт ${who}. Ты ${i + 1}-й в очереди — примерно через ${fmtWait(this.wait(i))}. Оплата ${PLANE_PRICE} 🪙 — при посадке`);
  }

  /** Сколько ждать стоящему в очереди под номером i (с нуля) */
  private wait(i: number): number {
    const now = this.s.ph === PL_DOCK ? (this.hold ? PLANE_TRIP_TICKS : 0) : planeEta(this.s);
    return now + i * PLANE_TRIP_TICKS;
  }

  private board(p: LobbyPlayer): void {
    this.pilot = p;
    this.pid = p.client.pid;
    this.nick = p.client.nick;
    this.o = this.host.outfit(p);
    this.level = this.host.level(p);
    this.budget = new StepBudget();
    this.landAt = Infinity;
    this.why = 'time';
    startPlane(this.s);
    this.lastPh = this.s.ph;
    this.host.board(p);
    this.host.follow(p, this.s);
    this.host.toast(p, `Пристегнись! Заводим мотор — разбег по воде. Полёт — ${Math.round(PLANE_FLY_TICKS / TICK_RATE / 60)} минуты`);
    this.host.announce(`✈ ${this.nick} поднимает в небо гидроплан «Стриж» — смотрите вверх!`);
    this.dirty = true;
  }

  /** «Сесть сейчас» от пилота: с его входа at — автопилот домой. */
  message(p: LobbyPlayer, msg: { a?: unknown; at?: unknown }): void {
    if (p !== this.pilot || msg.a !== 'land' || this.landAt !== Infinity) return;
    const at = typeof msg.at === 'number' && Number.isSafeInteger(msg.at) && msg.at > 0 ? msg.at : 0;
    this.landAt = at;
    this.why = 'land';
  }

  /** Входы пилота за тик (из обхода игроков комнаты). */
  consume(p: LobbyPlayer): void {
    if (p !== this.pilot) return;
    this.budget.run(p.inq, p.lastInput, (inp) => stepPlane(this.s, inp, inp.seq >= this.landAt));
  }

  /** Тик: без пилота — автопилот, смена фаз, очередь, позиции. Вызывать после обхода игроков. */
  step(): void {
    const tick = this.host.tick();
    if (this.pilot) {
      // пилот пропал (свёрнутая вкладка, обрыв) — автопилот домой
      if (this.s.ph === PL_FLY && this.budget.starve > PLANE_AFK_TICKS && this.landAt === Infinity) {
        this.landAt = 0;
        this.why = 'afk';
      }
    } else if (this.s.ph !== PL_DOCK) {
      stepPlane(this.s, this.idle, true);
    }
    if (this.s.ph !== this.lastPh) {
      const was = this.lastPh;
      this.lastPh = this.s.ph;
      this.phase(was, this.s.ph);
    }
    if (this.pilot) this.host.follow(this.pilot, this.s);
    if (this.s.ph === PL_DOCK) this.serve(tick);
    else if (tick % PLANE_SEND_EVERY === 0) this.send(tick);
    if (this.dirty) this.publish(tick);
  }

  private phase(was: number, ph: number): void {
    const p = this.pilot;
    this.dirty = true;
    if (was === PL_START && ph === PL_FLY && p) {
      this.host.toast(p, 'Летим! Мышь — куда лететь, Shift — быстрее, S — медленнее, колесо — камера, E — сесть раньше');
    } else if (was === PL_FLY && ph === PL_HOME && p) {
      this.host.toast(p, this.why === 'land' ? 'Летим домой — автопилот заходит на посадку' : this.why === 'afk' ? 'Пилот не отвечает — автопилот ведёт домой'
        : 'Время полёта вышло — автопилот ведёт домой, любуйся видом');
    } else if (ph === PL_DOCK) {
      if (p) {
        this.host.unboard(p);
        this.host.toast(p, 'Приводнились! Спасибо за полёт ✈');
      }
      this.pilot = null;
      this.pid = 0;
      this.nick = '';
      this.o = null;
      this.landAt = Infinity;
      // последняя позиция — у стоянки
      this.host.broadcast({ t: 'planePos', k: this.host.tick(), p: planePosArray(this.s) });
    }
  }

  /** Самолёт у стоянки: ждёт того, чья очередь (30 с), не дождался — следующего. */
  private serve(tick: number): void {
    if (this.hold && tick < this.hold.until) return;
    if (this.hold) {
      const late = this.byPid(this.hold.pid);
      if (late) this.host.toast(late, 'Самолёт не дождался — твоя очередь прошла. Нажми E у самолёта, чтобы встать снова');
      this.hold = null;
      this.dirty = true;
    }
    while (this.queue.length > 0) {
      const q = this.queue.shift()!;
      this.dirty = true;
      const p = this.byPid(q.pid);
      if (!p) continue;
      this.hold = { pid: q.pid, nick: q.nick, until: tick + PLANE_HOLD_TICKS };
      this.host.toast(p, `✈ Твоя очередь! Самолёт ждёт тебя ${PLANE_HOLD_TICKS / TICK_RATE} с — подойди к нему на западном краю площади и нажми E`);
      return;
    }
  }

  private byPid(pid: number): LobbyPlayer | undefined {
    for (const p of this.host.players()) if (p.client.pid === pid) return p;
    return undefined;
  }

  /** Игрок ушёл с набережной: из очереди; пилот — самолёт летит домой сам. */
  drop(p: LobbyPlayer): void {
    const pid = p.client.pid;
    const n = this.queue.length;
    this.queue = this.queue.filter((q) => q.pid !== pid);
    if (this.queue.length !== n) this.dirty = true;
    if (this.hold?.pid === pid) {
      this.hold = null;
      this.dirty = true;
    }
    if (this.pilot === p) {
      this.pilot = null;
      this.why = 'gone';
      this.dirty = true;
    }
  }

  /** Ник пилота сменился — в табличке и у всех */
  refresh(p: LobbyPlayer): void {
    if (p !== this.pilot) return;
    this.nick = p.client.nick;
    this.o = this.host.outfit(p);
    this.level = this.host.level(p);
    this.dirty = true;
  }

  view(tick = this.host.tick()): PlaneView {
    return {
      ph: this.s.ph, slot: this.pilot?.slot ?? 0, pid: this.pilot ? this.pid : 0, nick: this.pilot ? this.nick : '', o: this.pilot ? this.o : null,
      level: this.level, q: this.queue.map((q) => q.nick), hold: this.hold?.nick ?? '', hu: this.hold?.until ?? 0, k: tick, eta: planeEta(this.s),
    };
  }

  private publish(tick: number): void {
    this.dirty = false;
    const v = this.view(tick);
    const key = JSON.stringify({ ...v, k: 0, eta: 0 });
    if (key === this.shown) return;
    this.shown = key;
    this.host.broadcast({ t: 'plane', v });
  }

  /** Где самолёт — всем; пилоту — ещё и точное состояние после его последнего входа. */
  private send(tick: number): void {
    this.host.broadcast({ t: 'planePos', k: tick, p: planePosArray(this.s) });
    if (this.pilot) this.host.send(this.pilot, { t: 'planeMe', ack: this.pilot.inq.ack, s: { ...this.s } });
  }

  /** Отладка и тесты */
  debug(): { ph: number; t: number; x: number; y: number; z: number; pilot: string; queue: string[]; hold: string; landAt: number } {
    const s = this.s;
    return { ph: s.ph, t: s.t, x: s.x, y: s.y, z: s.z, pilot: this.pilot ? this.nick : '', queue: this.queue.map((q) => q.nick), hold: this.hold?.nick ?? '', landAt: this.landAt };
  }
}

export { PL_DOCK, PL_FLY, PL_HOME, PL_LAND, PL_START };
