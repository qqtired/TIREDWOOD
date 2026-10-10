// «Подземелье»: комната на одного игрока (инстанс). Создаётся при входе (server/dungeon/hall.ts), шагается из Hub.step,
// удаляется при выходе. Клиент играет симуляцию у себя и шлёт журнал ввода (dg_log); комната применяет события к своей
// копии и шагает её до шага клиента, но не дальше настенных часов. Конец волны и забега решает серверная копия:
// жетоны за волну — сразу (dg_wave), итог, рекорды и бонус за рекорд — в конце (dg_end). Пауза занятостью не считается.
import {
  DG_HZ, DG_LOG_MAX, DG_PAUSE_MAX_MS, DG_RECORD_COINS, DG_RUN_CAP, dgBossCoins, dgWaveCoins,
  type DgClientMsg, type DgEvent, type DgPay, type DgResult, type DgStage,
} from '../../shared/dungeon/api.ts';
import type { ClientMsg } from '../../shared/messages.ts';
import type { Client, Room } from '../hub.ts';
import type { DgSimApi, DgSimLike } from './simport.ts';

/**
 * Флаг сервера DUNGEON: '1' — режим включён, '0' — выключен, без переменной — только в разработке (--dev).
 * На боевом сайте переменной нет — до «да» владельца пещеры не видно.
 */
export function dungeonEnabled(v: string | undefined, dev: boolean): boolean {
  if (v === '1') return true;
  if (v === '0') return false;
  return dev;
}

/** Догон: не больше стольких шагов симуляции за тик хаба (60 Гц) — до 8 раз быстрее игры */
const STEPS_PER_TICK = 4;
/** Запас настенных часов, шагов: клиент может обогнать сервер на столько (джиттер сети, неровные кадры) */
const SLACK_TICKS = 3 * DG_HZ;
/** Закрытие забега (выход, тайм-аут): догоняем журнал, но не больше минуты игры за раз */
const FINAL_STEPS = 60 * DG_HZ;
/** Сколько последних сумм состояния клиента держим для сверки */
const CHECKS_KEEP = 16;
/** Не больше стольких принятых, но ещё не применённых событий (сервер отстаёт от клиента на секунды — обычно их десятки) */
const PENDING_MAX = 3000;
/** Забег засчитывается в «забегов», если отбита волна, герой погиб или игра шла хотя бы столько шагов */
export const RUN_MIN_TICKS = 30 * DG_HZ;

/** Что комнате нужно от зала (server/dungeon/hall.ts): симуляция, часы, профиль и рекорды */
export interface DgRoomHost {
  readonly api: DgSimApi;
  now(): number;
  seed(): number;
  /** Личные рекорды для приветствия */
  bests(c: Client): { best: number; bestMs: number; weekBest: number };
  /** Зачислить жетоны (уже с учётом потолка забега) */
  pay(c: Client, n: number): void;
  /** Забег закрыт: статистика, таблицы рекордов, журнал, строка в чат */
  settle(c: Client, r: DgResult, run: { coins: number; ticks: number; mismatches: number; bad: number }): { newBest: boolean; weekRank: number };
  /** Расхождение копий — в журнал сервера */
  mismatch(c: Client, tick: number, client: number, server: number): void;
  /** Комната опустела — убрать из зала */
  closed(room: DungeonRoom): void;
  /** Долго стоит на экране итогов — на набережную */
  toLobby(c: Client): void;
}

export class DungeonRoom implements Room {
  readonly kind = 'dungeon' as const;
  private readonly host: DgRoomHost;
  private client: Client | null = null;
  private closedRoom = false;
  private sim!: DgSimLike;
  private seed = 0;
  /** Принятые события журнала, которые ещё не применены (с head) */
  private events: DgEvent[] = [];
  private head = 0;
  /** Сколько событий журнала принято (номер следующего) */
  private received = 0;
  private lastT = 0;
  /** До какого шага дошёл клиент */
  private upto = 0;
  private checks: Array<{ tick: number; h: number }> = [];
  /** Часы забега: начало, сколько стояли на паузе, с какого момента пауза (0 — нет), когда клиент слышен последний раз */
  private startedAt = 0;
  private pausedMs = 0;
  private pauseAt = 0;
  private lastHeard = 0;
  private stage: DgStage = 'intro';
  private paidWaves = 0;
  private paidBosses = 0;
  private pay: DgPay = { waves: 0, bosses: 0, record: 0 };
  private coins = 0;
  private over = false;
  private mismatches = 0;
  private bad = 0;

  constructor(host: DgRoomHost) {
    this.host = host;
    this.reset();
  }

  get humans(): number {
    return this.client ? 1 : 0;
  }

  /** Держит ли забег сервер занятым (выкладка подождёт): идёт, не на паузе, связь есть */
  get busy(): number {
    const c = this.client;
    return c && !this.over && !this.pauseAt && !c.lostAt ? 1 : 0;
  }

  get tick(): number {
    return this.sim.tick;
  }

  /** Для тестов и отладки */
  get state(): { seed: number; tick: number; stage: DgStage; upto: number; received: number; coins: number; over: boolean; paused: boolean } {
    return { seed: this.seed, tick: this.sim.tick, stage: this.sim.stage, upto: this.upto, received: this.received, coins: this.coins, over: this.over, paused: this.pauseAt > 0 };
  }

  hasSpace(): boolean {
    return !this.client && !this.closedRoom;
  }

  join(c: Client): boolean {
    if (!c.profile || !this.hasSpace()) return false;
    // комната одноразовая: забег создан вместе с ней, перед самым переходом
    this.client = c;
    this.hello();
    return true;
  }

  leave(c: Client): void {
    if (c !== this.client) return;
    // сначала итог: жетоны и рекорды — пока соединение ещё в комнате
    if (!this.over) this.finish('leave');
    this.client = null;
    this.closedRoom = true;
    this.host.closed(this);
  }

  /** Перезапуск сервера: закрыть забег с итогом по отбитым волнам */
  close(): void {
    if (this.client && !this.over) this.finish('leave');
  }

  onInputs(): void {
    // ввод «Подземелья» — только журналом dg_log
  }

  onMessage(c: Client, msg: ClientMsg): void {
    if (c !== this.client) return;
    const m = msg as DgClientMsg;
    switch (m.t) {
      case 'dg_log':
        this.onLog(c, m);
        return;
      case 'dg_pause':
        this.onPause(m.on === 1);
        return;
      case 'dg_again':
        // «Ещё раз» — только с экрана итогов
        if (!this.over) return;
        this.reset();
        this.hello();
        return;
    }
  }

  step(): void {
    const c = this.client;
    if (!c) return;
    const now = this.host.now();
    if (now - this.lastHeard >= DG_PAUSE_MAX_MS) {
      // пауза или тишина 10 минут (и экран итогов столько же): забег — в итог, игрока — на набережную
      if (!this.over) this.finish('timeout');
      this.host.toLobby(c);
      return;
    }
    if (!this.over) this.advance(Math.min(this.upto, this.allowed(now)), STEPS_PER_TICK);
  }

  // ------------------------------------------------------------ журнал

  private onLog(c: Client, m: Extract<DgClientMsg, { t: 'dg_log' }>): void {
    const { from, ev, upto, h } = m as { from: unknown; ev: unknown; upto: unknown; h: unknown };
    if (!Number.isSafeInteger(from) || (from as number) < 0 || !Array.isArray(ev) || ev.length > DG_LOG_MAX || !Number.isSafeInteger(upto) || (upto as number) < 0) return;
    this.lastHeard = this.host.now();
    if (this.over) {
      c.sink.sendJson({ t: 'dg_ack', n: this.received });
      return;
    }
    // пропуск в журнале — прислать заново с того, что есть; копия слишком отстала — тоже позже
    if ((from as number) > this.received || this.events.length - this.head + ev.length > PENDING_MAX) {
      c.sink.sendJson({ t: 'dg_ack', n: this.received, need: this.received });
      return;
    }
    for (let i = this.received - (from as number); i < ev.length; i++) {
      const e = cleanEvent(ev[i], this.lastT);
      if (e) {
        this.events.push(e);
        this.lastT = e.t;
      } else this.bad++;
      this.received++;
    }
    if ((upto as number) > this.upto) {
      this.upto = upto as number;
      if (typeof h === 'number' && Number.isFinite(h)) {
        this.checks.push({ tick: this.upto, h });
        if (this.checks.length > CHECKS_KEEP) this.checks.shift();
      }
    }
    c.sink.sendJson({ t: 'dg_ack', n: this.received });
  }

  private onPause(on: boolean): void {
    const now = this.host.now();
    this.lastHeard = now;
    if (on && !this.pauseAt) this.pauseAt = now;
    else if (!on && this.pauseAt) {
      this.pausedMs += now - this.pauseAt;
      this.pauseAt = 0;
    }
  }

  /** До какого шага разрешено шагать по настенным часам (паузы не в счёт) */
  private allowed(now: number): number {
    const ms = now - this.startedAt - this.pausedMs - (this.pauseAt ? now - this.pauseAt : 0);
    return Math.floor((ms * DG_HZ) / 1000) + SLACK_TICKS;
  }

  /** Шагать свою копию к шагу target, не больше max шагов */
  private advance(target: number, max: number): void {
    const api = this.host.api;
    const sim = this.sim;
    for (let n = 0; n < max && sim.tick < target && !this.over; n++) {
      while (this.head < this.events.length && this.events[this.head].t <= sim.tick) api.applyEvent(sim, this.events[this.head++]);
      api.step(sim);
      this.check();
      if (sim.stage !== this.stage) {
        this.stage = sim.stage;
        this.settleWaves();
        if (sim.stage === 'over') this.finish('death');
      }
    }
    if (this.head > 256 && this.head * 2 > this.events.length) {
      this.events = this.events.slice(this.head);
      this.head = 0;
    }
  }

  /** Сверка суммы состояния с клиентской на том же шаге: расхождение — только в журнал */
  private check(): void {
    const tick = this.sim.tick;
    while (this.checks.length && this.checks[0].tick < tick) this.checks.shift();
    if (!this.checks.length || this.checks[0].tick !== tick) return;
    const { h } = this.checks.shift()!;
    const mine = this.host.api.dgHash(this.sim);
    if (mine >>> 0 === h >>> 0) return;
    if (++this.mismatches === 1 && this.client) this.host.mismatch(this.client, tick, h, mine);
  }

  // ------------------------------------------------------------ жетоны и итог

  /** Жетоны с потолком забега; гостю проверки — ничего */
  private credit(n: number): number {
    const c = this.client;
    if (!c || c.ephemeral) return 0;
    const add = Math.max(0, Math.min(n, DG_RUN_CAP - this.coins));
    if (add > 0) {
      this.coins += add;
      this.host.pay(c, add);
    }
    return add;
  }

  /** Отбитые волны и боссы по серверной копии, которых ещё не платили: жетоны сразу, dg_wave на каждую волну */
  private settleWaves(): void {
    const c = this.client;
    if (!c) return;
    const r = this.host.api.dgResult(this.sim);
    for (let w = this.paidWaves + 1; w <= r.waves; w++) {
      let coins = this.credit(dgWaveCoins(w));
      this.pay.waves += coins;
      // босс этой волны — в то же письмо
      if (w === r.waves) coins += this.payBosses(r.bosses);
      c.sink.sendJson({ t: 'dg_wave', wave: w, coins });
    }
    this.paidWaves = Math.max(this.paidWaves, r.waves);
    this.payBosses(r.bosses);
  }

  private payBosses(bosses: number): number {
    let sum = 0;
    while (this.paidBosses < bosses) {
      const b = this.credit(dgBossCoins(++this.paidBosses));
      this.pay.bosses += b;
      sum += b;
    }
    return sum;
  }

  /** Забег закрыт: смерть (по копии), выход, тайм-аут. Выход платит один раз — за отбитое, что ещё не оплачено */
  private finish(end: DgResult['end']): void {
    const c = this.client;
    if (this.over || !c) return;
    if (end !== 'death') {
      // журнал, который клиент уже прислал, — догнать (в пределах часов): отбитое до выхода засчитывается
      this.advance(Math.min(this.upto, this.allowed(this.host.now())), FINAL_STEPS);
      if (this.over) return;
    }
    this.over = true;
    this.lastHeard = this.host.now();
    this.settleWaves();
    // копия итога: чем кончился — решает сервер (смерть по копии, выход, тайм-аут)
    const r: DgResult = { ...this.host.api.dgResult(this.sim), end };
    const prevBest = c.profile?.stats.dgBest ?? 0;
    if (r.waves > prevBest) this.pay.record = this.credit(DG_RECORD_COINS);
    const { newBest, weekRank } = this.host.settle(c, r, { coins: this.coins, ticks: this.sim.tick, mismatches: this.mismatches, bad: this.bad });
    c.sink.sendJson({ t: 'dg_end', result: r, coins: this.coins, newBest, weekRank, pay: { ...this.pay } });
  }

  // ------------------------------------------------------------ новый забег

  private reset(): void {
    const now = this.host.now();
    this.seed = this.host.seed();
    this.sim = this.host.api.createRun(this.seed);
    this.events = [];
    this.head = 0;
    this.received = 0;
    this.lastT = 0;
    this.upto = 0;
    this.checks = [];
    this.startedAt = now;
    this.pausedMs = 0;
    this.pauseAt = 0;
    this.lastHeard = now;
    this.stage = this.sim.stage;
    this.paidWaves = 0;
    this.paidBosses = 0;
    this.pay = { waves: 0, bosses: 0, record: 0 };
    this.coins = 0;
    this.over = false;
    this.mismatches = 0;
    this.bad = 0;
  }

  private hello(): void {
    const c = this.client;
    if (c) c.sink.sendJson({ t: 'dg_hello', seed: this.seed, ...this.host.bests(c) });
  }
}

/** Событие журнала из JSON: только известные поля в своих пределах; t — не раньше прошлого. Иначе null */
export function cleanEvent(raw: unknown, lastT: number): DgEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const t = o.t;
  if (!Number.isSafeInteger(t) || (t as number) < lastT || (t as number) > 1e9) return null;
  const tt = t as number;
  const int = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  switch (o.k) {
    case 'mv':
      return int(o.x, -100, 100) && int(o.y, -100, 100) ? { t: tt, k: 'mv', x: o.x, y: o.y } : null;
    case 'q':
      return o.on === 0 || o.on === 1 ? { t: tt, k: 'q', on: o.on } : null;
    case 'pick':
      return int(o.i, 0, 9) ? { t: tt, k: 'pick', i: o.i } : null;
    case 'ban':
      return int(o.i, 0, 9) ? { t: tt, k: 'ban', i: o.i } : null;
    case 'dash':
    case 'use':
    case 'reroll':
    case 'go':
      return { t: tt, k: o.k };
    default:
      return null;
  }
}

