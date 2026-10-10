// «Подземелье» в хабе: набор инстансов (по комнате на игрока), жетоны и статистика профиля, таблицы рекордов и табличка
// у входа. Хаб держит один зал (null — режим выключен флагом DUNGEON) и зовёт его из своих общих мест: шаг, занятость,
// смена ника, перезапуск.
import { randomInt } from 'node:crypto';
import type { DgResult, DgStatus } from '../../shared/dungeon/api.ts';
import type { Client, Room } from '../hub.ts';
import type { Profiles } from '../profiles.ts';
import type { Store } from '../store.ts';
import { addDgRun, dgStatusOf, dgWeekStart, renameDg, weekRows } from './records.ts';
import { DungeonRoom, RUN_MIN_TICKS, type DgRoomHost } from './room.ts';
import { DG_SIM, type DgSimApi } from './simport.ts';

export interface DungeonHallHooks {
  store: Store;
  profiles: Profiles;
  now(): number;
  log(s: string): void;
  /** Перевести в комнату (Hub.move): force — без ограничения частоты */
  move(c: Client, room: Room, force: boolean): boolean;
  /** На набережную сразу (долго стоит на экране итогов) */
  toLobby(c: Client): void;
  /** Новый баланс клиенту */
  tokens(c: Client, n: number): void;
  /** Забег закрыт: профиль клиенту, доска почёта */
  settled(c: Client): void;
  announce(text: string): void;
  toast(c: Client, text: string): void;
  /** Симуляция (в тестах — подмена); по умолчанию — server/dungeon/simport.ts */
  sim?: DgSimApi;
  /** Зерно забега (в тестах — подмена) */
  seed?: () => number;
}

/** «12:05» из миллисекунд */
export function dgClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class DungeonHall implements DgRoomHost {
  readonly rooms = new Set<DungeonRoom>();
  readonly api: DgSimApi;
  private readonly h: DungeonHallHooks;

  constructor(hooks: DungeonHallHooks) {
    this.h = hooks;
    this.api = hooks.sim ?? DG_SIM;
  }

  /** Игроков в подземельях */
  get humans(): number {
    let n = 0;
    for (const r of this.rooms) n += r.humans;
    return n;
  }

  /** Идущих забегов (пауза и обрыв связи — не в счёт) */
  get busy(): number {
    let n = 0;
    for (const r of this.rooms) n += r.busy;
    return n;
  }

  /** E у пещеры (или /go dungeon): новый инстанс и переход в него. false — не вышло (частые переходы) */
  enter(c: Client, force = false): boolean {
    if (!c.profile) return false;
    const room = new DungeonRoom(this);
    this.rooms.add(room);
    if (this.h.move(c, room, force)) return true;
    this.rooms.delete(room);
    return false;
  }

  step(): void {
    if (this.rooms.size === 0) return;
    for (const r of [...this.rooms]) r.step();
  }

  /** Что у входа: топ-5 за всё время и за неделю */
  status(): DgStatus {
    const st = this.h.store.state;
    return dgStatusOf(st.dgTop, st.dgWeek, this.h.now());
  }

  /** Ник сменился — во всех строках рекордов */
  renamed(c: Client): void {
    if (!c.profile || c.ephemeral) return;
    const st = this.h.store.state;
    if (renameDg([st.dgTop, st.dgWeek?.top], c.pid, c.nick)) this.h.store.markDirty();
  }

  /** Перезапуск сервера: все забеги — в итог по отбитым волнам (жетоны и рекорды сохранятся до записи на диск) */
  shutdown(): void {
    for (const r of [...this.rooms]) r.close();
  }

  // ------------------------------------------------------------ для комнат (DgRoomHost)

  now(): number {
    return this.h.now();
  }

  seed(): number {
    return this.h.seed?.() ?? randomInt(1, 0x7fffffff);
  }

  bests(c: Client): { best: number; bestMs: number; weekBest: number } {
    const p = c.profile;
    if (!p || c.ephemeral) return { best: 0, bestMs: 0, weekBest: 0 };
    const week = weekRows(this.h.store.state.dgWeek, this.h.now()).find((r) => r.pid === p.id);
    return { best: p.stats.dgBest, bestMs: p.stats.dgBestMs, weekBest: week?.waves ?? 0 };
  }

  pay(c: Client, n: number): void {
    const p = c.profile;
    if (!p || c.ephemeral) return;
    this.h.profiles.credit(p, n, 'mode');
    this.h.tokens(c, p.tokens);
  }

  settle(c: Client, r: DgResult, run: { coins: number; ticks: number; mismatches: number; bad: number }): { newBest: boolean; weekRank: number } {
    const p = c.profile;
    if (!p || c.ephemeral) return { newBest: false, weekRank: 0 };
    const st = p.stats;
    const now = this.h.now();
    const state = this.h.store.state;
    if (r.waves > 0 || r.end === 'death' || run.ticks >= RUN_MIN_TICKS) st.dgRuns++;
    const newBest = r.waves > 0 && (r.waves > st.dgBest || (r.waves === st.dgBest && r.ms < st.dgBestMs));
    if (newBest) {
      st.dgBest = r.waves;
      st.dgBestMs = r.ms;
    }
    st.dgKills += Math.max(0, Math.floor(r.kills));
    st.dgBosses += Math.max(0, Math.floor(r.bosses));
    let weekRank = weekRows(state.dgWeek, now).findIndex((x) => x.pid === p.id) + 1;
    let weekUp = false;
    if (r.waves > 0) {
      const rec = { pid: p.id, nick: p.nick, waves: r.waves, ms: r.ms, at: now };
      state.dgTop = addDgRun(state.dgTop ?? [], rec).top;
      const week = addDgRun(weekRows(state.dgWeek, now), rec);
      state.dgWeek = { from: dgWeekStart(now), top: week.top };
      weekRank = week.rank;
      weekUp = week.improved;
    }
    this.h.store.markDirty();
    this.h.settled(c);
    const notes = [run.mismatches ? `расхождений с клиентом: ${run.mismatches}` : '', run.bad ? `битых событий: ${run.bad}` : ''].filter(Boolean).join(', ');
    this.h.log(`[подземелье] ${p.nick} (#${p.id}): отбито волн — ${r.waves} за ${dgClock(r.ms)}, ${r.end}, +${run.coins} 🪙${notes ? `; ${notes}` : ''}`);
    // вышел посреди забега — итог тостом (экран итогов он уже не увидит)
    if (r.end !== 'death' && run.coins > 0) this.h.toast(c, `🕯️ Подземелье: отбито волн — ${r.waves}, +${run.coins} 🪙 за забег`);
    // в общий чат: личный рекорд с 10-й волны или место в тройке недели (design.md §13)
    if (newBest && r.waves >= 10) this.h.announce(`🕯️ ${p.nick} отбил ${r.waves} волн в Подземелье — личный рекорд!`);
    else if (weekUp && weekRank >= 1 && weekRank <= 3) this.h.announce(`🕯️ ${p.nick}: ${r.waves} волн в Подземелье — ${weekRank}-е место недели`);
    return { newBest, weekRank };
  }

  mismatch(c: Client, tick: number, client: number, server: number): void {
    this.h.log(`[подземелье] ${c.nick} (#${c.pid}): копии разошлись на шаге ${tick} (клиент ${client >>> 0}, сервер ${server >>> 0})`);
  }

  closed(room: DungeonRoom): void {
    this.rooms.delete(room);
  }

  toLobby(c: Client): void {
    this.h.toLobby(c);
  }
}
