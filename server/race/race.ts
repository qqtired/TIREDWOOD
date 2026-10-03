// Гонка: до 6 картов на одной из трасс (racecourse.ts). Люди едут своим вводом (на клиенте — предсказание), боты — KartBot.
// Фазы: решётка 5 с → гонка → итоги 10 с → всех обратно на набережную. Гонка кончается, когда доехали все люди;
// через 30 с после первого финиша человека или после того, как доехали все боты; в крайнем случае через 5 минут.
// Сервер считает толчки, ящики с бонусами (шансы — по месту в гонке), банки варенья, краску, пузыри и хлопки,
// места и время кругов.
import { BOT_NAMES, TICK_RATE } from '../../shared/constants.ts';
import { raceReward, type RcReward } from '../../shared/economy.ts';
import {
  BUBBLE_TICKS,
  ITEM_BUBBLE,
  ITEM_CLAP,
  ITEM_JAM,
  ITEM_PAINT,
  ITEM_ROLL_TICKS,
  ITEM_TURBO,
  KART_R,
  PAINT_TICKS,
  RC_FINISH_WAIT,
  RC_GRID,
  RC_GRID_TICKS,
  RC_LAPS,
  RC_MAX_KARTS,
  RC_MAX_TICKS,
  RC_MIN_KARTS,
  RC_RACE,
  RC_RESULTS,
  RC_RESULTS_TICKS,
  RC_SNAP_EVERY,
  SLOW_TICKS,
  SPIN_TICKS,
  constrain,
  makeKartEvents,
  makeKartState,
  placeOnGrid,
  stepKart,
  type KartEvents,
  type KartState,
} from '../../shared/kart.ts';
import {
  KM_BUBBLE,
  encodeKartSnapshot,
  encodeKarts,
  encodeTraps,
  kartFlags,
  kartMisc,
  kartYaw,
  makeKartHeader,
  type KartSnap,
  type TrapSnap,
} from '../../shared/kartnet.ts';
import { DEFAULT_TRACK, buildRaceCourse, type RaceTrackId } from '../../shared/racecourse.ts';
import { hash32, makeRng } from '../../shared/math.ts';
import type { BoardKart, KartInfo, RaceEvent, RaceResultRow, ServerMsg } from '../../shared/messages.ts';
import { randomOutfit, type Outfit } from '../../shared/outfit.ts';
import { SNAP_SELF_RESET } from '../../shared/protocol.ts';
import { BTN_FIRE, BTN_JUMP, BTN_RELOAD, BTN_USE, makeInput, type Input } from '../../shared/sim.ts';
import { sanitizeName } from '../../shared/text.ts';
import { NO_GROUND, locate, locateAny, makeLoc, progress, type Track } from '../../shared/track.ts';
import { InputQueue } from '../inputs.ts';
import type { Sink } from '../paintball/game.ts';
import { KartBot, type BotView, type KartSkill } from './bot.ts';

/** Ящик снова на месте через 4 с */
const CRATE_RESPAWN_TICKS = 240;
const CRATE_R = 1.5;
/** Банка — в 2,4 м позади; живёт 45 с; не больше 10 на трассе; своя не трогает первую секунду */
const TRAP_BACK = 2.4;
const TRAP_LIFE = 45 * TICK_RATE;
const TRAP_MAX = 10;
const TRAP_R = 1.4;
const TRAP_OWN_SAFE = TICK_RATE;
const BUMP_BOUNCE = 0.4;
/** Флаг KE_ON снят столько тиков после возврата на трассу */
const RESPAWN_HIDE = 6;
/** «Болеют за вас» — не чаще раза в 2 с на всю гонку */
const CHEER_GAP = 2 * TICK_RATE;
/** Умения ботов по очереди: так в гонке с одним человеком есть кого обогнать */
const BOT_SKILLS: KartSkill[] = ['normal', 'easy', 'hard', 'normal', 'easy'];
/** Хлопок: радиус волны, м; кого задело — закрутка и замедление */
const CLAP_R = 8;
const CLAP_SPIN = 34;
const CLAP_SLOW = 70;
/**
 * Шансы бонусов по месту: [турбо, варенье, краска, пузырь, хлопок] для первого и для последнего места; между ними —
 * плавно. Лидеру — чем защищаться, отстающим — турбо и краска.
 */
const POOL_ITEMS = [ITEM_TURBO, ITEM_JAM, ITEM_PAINT, ITEM_BUBBLE, ITEM_CLAP];
const POOL_FIRST = [0, 45, 0, 35, 20];
const POOL_LAST = [50, 0, 25, 10, 15];

export class Kart {
  /** Номер в снимке: место на решётке + 1 */
  readonly id: number;
  readonly slot: number;
  name: string;
  pid = 0;
  level = 1;
  /** Цвет карта — место на решётке */
  readonly color: number;
  outfit: Outfit;
  /** Куда слать (null — бот или человек, ушедший после финиша) */
  sink: Sink | null;
  /** Человек ушёл, уже доехав: карт остаётся в таблице на своём месте, жетоны начислены при уходе */
  gone = false;
  bot: KartBot | null = null;
  readonly state: KartState = makeKartState();
  readonly ev: KartEvents = makeKartEvents();
  readonly inq = new InputQueue();
  readonly lastInput: Input = makeInput();
  selfReset = true;
  place = 0;
  /** Место на финише (0 — не доехал) и тик финиша */
  finishPlace = 0;
  finishTick = 0;
  lapStart = 0;
  /** Лучший круг, тиков (0 — не было) */
  bestLap = 0;
  paintT = 0;
  /** Пузырь: тиков ещё (0 — нет) */
  bubbleT = 0;
  hideT = 0;
  prog = 0;

  constructor(slot: number, name: string, sink: Sink | null, outfit: Outfit) {
    this.slot = slot;
    this.id = slot + 1;
    this.color = slot;
    this.name = name;
    this.sink = sink;
    this.outfit = outfit;
  }

  get isBot(): boolean {
    return this.bot !== null;
  }
}

export interface RaceHooks {
  /** Итог человеку: строка итогов и жетоны (null — не доехал) */
  result?(k: Kart, row: RaceResultRow, reward: RcReward | null): void;
  /** Итоги показаны — всех обратно */
  over?(): void;
  /** Строка в общий чат */
  announce?(text: string): void;
}

export interface RaceOptions {
  track?: RaceTrackId;
  seed?: number;
  /** Умение всех ботов (по умолчанию — по очереди обычный, лёгкий, сильный) */
  botSkill?: KartSkill;
  /** Случайное число 0…1 для бонусов из ящиков (подменяется в тестах) */
  roll?: () => number;
  /** Сколько картов на старте добирать ботами (тесты ставят меньше) */
  minKarts?: number;
}

interface Trap {
  id: number;
  x: number;
  y: number;
  z: number;
  owner: number;
  born: number;
}

export class Race {
  readonly track: Track;
  readonly trackId: RaceTrackId;
  tick = 0;
  phase = RC_GRID;
  phaseEnd = 0;
  started = false;
  /** Гонка кончилась (итоги показаны) или закрыта: люди ушли */
  closed = false;
  readonly karts = new Map<number, Kart>();
  readonly traps: Trap[] = [];
  /** Тик, когда ящик снова появится (0 — на месте) */
  readonly crateBack: number[];
  private readonly hooks: RaceHooks;
  private readonly rng: () => number;
  private readonly roll: () => number;
  private readonly botSkill: KartSkill | null;
  private readonly minKarts: number;
  private raceStart = 0;
  private finished = 0;
  /** Пошли последние 30 с */
  private waiting = false;
  private nextTrap = 1;
  private events: RaceEvent[] = [];
  private rosterDirty = true;
  private cheerTick = -CHEER_GAP;
  private readonly finishedNow: Kart[] = [];
  private readonly order: Kart[] = [];
  private readonly header = makeKartHeader();
  private readonly loc = makeLoc();
  private readonly botInput: Input = makeInput();
  private readonly idleInput: Input = makeInput();
  private readonly view: BotView = {
    racing: false, gridLeft: 0, place: 1, karts: 1, behind: Infinity, ahead: Infinity, near: Infinity, painted: false, bubble: false,
  };

  constructor(hooks: RaceHooks, opts: RaceOptions = {}) {
    this.hooks = hooks;
    this.trackId = opts.track ?? DEFAULT_TRACK;
    this.track = buildRaceCourse(this.trackId).track;
    const seed = opts.seed ?? Date.now() & 0xffffffff;
    this.rng = makeRng(seed);
    this.roll = opts.roll ?? this.rng;
    this.botSkill = opts.botSkill ?? null;
    this.minKarts = opts.minKarts ?? RC_MIN_KARTS;
    this.crateBack = this.track.crates.map(() => 0);
  }

  get humanCount(): number {
    let n = 0;
    for (const k of this.karts.values()) if (!k.isBot && !k.gone) n++;
    return n;
  }

  /** Человек садится в карт — только до старта. */
  addHuman(info: { pid: number; nick: string; level?: number; outfit: Outfit }, sink: Sink): Kart | null {
    if (this.started || this.closed || this.karts.size >= RC_MAX_KARTS) return null;
    const slot = this.freeSlot();
    const k = new Kart(slot, sanitizeName(info.nick) || `Игрок${slot + 1}`, sink, info.outfit);
    k.pid = info.pid;
    k.level = info.level ?? 1;
    placeOnGrid(k.state, this.track, slot);
    this.karts.set(k.id, k);
    // приветствие — первым сообщением, до снимков
    sink.sendJson({ t: 'race', track: this.trackId, id: k.id, tick: this.tick, phase: this.phase, phaseEnd: this.phaseEnd, karts: this.roster() });
    this.rosterDirty = true;
    return k;
  }

  private freeSlot(): number {
    for (let s = 0; s < RC_MAX_KARTS; s++) if (!this.karts.has(s + 1)) return s;
    return -1;
  }

  private addBot(n: number): void {
    const slot = this.freeSlot();
    if (slot < 0) return;
    const taken = new Set([...this.karts.values()].map((k) => k.name));
    const shift = Math.floor(this.rng() * BOT_NAMES.length);
    let name = BOT_NAMES[shift];
    for (let i = 0; i < BOT_NAMES.length && taken.has(name); i++) name = BOT_NAMES[(shift + i) % BOT_NAMES.length];
    const seed = hash32(slot + 77, Math.floor(this.rng() * 1e9));
    const k = new Kart(slot, name, null, randomOutfit(seed));
    k.bot = new KartBot(this.track, this.botSkill ?? BOT_SKILLS[n % BOT_SKILLS.length], seed);
    this.karts.set(k.id, k);
  }

  /**
   * Человек ушёл. Если он уже доехал, а гонка ещё идёт, карт остаётся в таблице: место ни к кому не переходит,
   * жетоны — сразу (итогов он не дождётся).
   */
  removeKart(id: number): void {
    const k = this.karts.get(id);
    if (!k || k.gone) return;
    if (!k.isBot && k.finishPlace && this.phase === RC_RACE) {
      // место доехавшего уже не меняется: places() держит финишировавших впереди по порядку финиша
      const [row, reward] = this.resultOf(k);
      this.pay(k, row, reward);
      if (reward) k.sink?.sendJson({ t: 'toast', text: `🏁 ${reward.pos}-е место · +${reward.total} 🪙` });
      k.gone = true;
      k.sink = null;
    } else {
      this.karts.delete(id);
      this.rosterDirty = true;
    }
    if (!k.isBot && this.humanCount === 0) this.closed = true;
  }

  /** Старт: боты до нужного числа, все на решётку, отсчёт 5 с. */
  start(): void {
    if (this.started || this.closed) return;
    this.started = true;
    for (let n = 0; this.karts.size < this.minKarts; n++) this.addBot(n);
    for (const k of this.karts.values()) {
      placeOnGrid(k.state, this.track, k.slot);
      k.selfReset = true;
    }
    this.phase = RC_GRID;
    this.phaseEnd = this.tick + RC_GRID_TICKS;
    this.rosterDirty = true;
  }

  onInputs(k: Kart, inputs: Input[], count: number): void {
    k.inq.push(inputs, count);
  }

  roster(): KartInfo[] {
    return [...this.karts.values()].map((k) => ({ id: k.id, pid: k.pid, level: k.level, nick: k.name, bot: k.isBot, o: k.outfit, color: k.color }));
  }

  /** Наряд человека поменялся — разослать в ближайший тик. */
  touchRoster(): void {
    this.rosterDirty = true;
  }

  /** Для табло у гаража: карты гонки */
  board(): BoardKart[] {
    return [...this.karts.values()].map((k) => ({ id: k.id, nick: k.name, color: k.color, bot: k.isBot }));
  }

  /** Для табло: по KPOS_STRIDE чисел на карт — номер, отрезок, круг, место, финишировал; по местам. */
  positions(): number[] {
    const out: number[] = [];
    // до первого тика мест ещё нет — по решётке
    const place = (k: Kart): number => k.place || k.slot + 1;
    const list = [...this.karts.values()].sort((a, b) => place(a) - place(b) || a.id - b.id);
    for (const k of list) out.push(k.id, k.state.seg, Math.min(RC_LAPS, k.state.lap), place(k), k.state.done ? 1 : 0);
    return out;
  }

  /** За гонщиков болеют на набережной: всем в гонке — строка и аплодисменты. Не чаще раза в 2 с. */
  cheer(nick: string): boolean {
    if (!this.started || this.closed || this.phase === RC_RESULTS || this.tick - this.cheerTick < CHEER_GAP) return false;
    this.cheerTick = this.tick;
    this.broadcast({ t: 'cheer', nick });
    return true;
  }

  /** Для табло у гаража: круг лидера и люди в гонке */
  status(): { lap: number; names: string[] } {
    let lap = 0;
    const names: string[] = [];
    for (const k of this.karts.values()) {
      lap = Math.max(lap, Math.min(RC_LAPS, k.state.lap));
      if (!k.isBot && !k.gone) names.push(k.name);
    }
    return { lap, names };
  }

  broadcast(msg: ServerMsg): void {
    for (const k of this.karts.values()) k.sink?.sendJson(msg);
  }

  // ------------------------------------------------------------ тик

  step(): void {
    if (!this.started || this.closed) return;
    this.tick++;
    const tick = this.tick;
    if (this.phase === RC_GRID && tick >= this.phaseEnd) {
      this.phase = RC_RACE;
      this.raceStart = tick;
      this.phaseEnd = tick + RC_MAX_TICKS;
    } else if (this.phase === RC_RACE && (tick >= this.phaseEnd || this.humansDone())) {
      this.finishRace();
    } else if (this.phase === RC_RESULTS && tick >= this.phaseEnd) {
      this.closed = true;
      this.hooks.over?.();
      return;
    }
    const canDrive = this.phase === RC_RACE;

    for (const k of this.karts.values()) {
      if (k.paintT > 0) k.paintT--;
      if (k.bubbleT > 0 && --k.bubbleT === 0) this.events.push(['pop', k.id, 0]);
      if (k.hideT > 0) k.hideT--;
      if (k.bot) {
        this.botViewOf(k);
        k.bot.update(k.state, this.view, tick, this.botInput);
        this.simulate(k, this.botInput, canDrive);
        k.lastInput.buttons = this.botInput.buttons;
      } else this.processHuman(k, canDrive);
    }
    this.bumps();
    this.pickCrates();
    this.trapsStep();
    this.places();
    if (tick % RC_SNAP_EVERY === 0) this.sendSnapshots();
    if (this.rosterDirty) {
      this.rosterDirty = false;
      this.broadcast({ t: 'rroster', karts: this.roster() });
    }
  }

  private humansDone(): boolean {
    let any = false;
    for (const k of this.karts.values()) {
      if (k.isBot) continue;
      if (!k.state.done) return false;
      any = true;
    }
    return any;
  }

  private botsDone(): boolean {
    let any = false;
    for (const k of this.karts.values()) {
      if (!k.isBot) continue;
      if (!k.finishPlace) return false;
      any = true;
    }
    return any;
  }

  private processHuman(k: Kart, canDrive: boolean): void {
    const q = k.inq;
    const n = q.due();
    for (let i = 0; i < n; i++) {
      const inp = q.shift();
      this.simulate(k, inp, canDrive);
      k.lastInput.seq = inp.seq;
      k.lastInput.buttons = inp.buttons;
    }
    if (n === 0) {
      q.starve++;
      // Долго нет ввода (вкладка свернулась, лаг) — по последнему вводу без разовых кнопок, потом без кнопок
      if (q.starve > 8) {
        const idle = this.idleInput;
        idle.buttons = q.starve > 90 ? 0 : k.lastInput.buttons & ~(BTN_FIRE | BTN_USE | BTN_RELOAD | BTN_JUMP);
        this.simulate(k, idle, canDrive);
      }
    }
  }

  private simulate(k: Kart, inp: Input, canDrive: boolean): void {
    const s = k.state;
    const ox = s.x;
    const oz = s.z;
    stepKart(s, inp, this.track, k.ev, canDrive);
    const ev = k.ev;
    if (ev.splash) this.events.push(['splash', k.id, round2(ox), round2(oz)]);
    if (ev.hit > 3) this.events.push(['hit', k.id, round2(ev.hit), round2(s.x), round2(s.z)]);
    if (ev.splash || ev.respawn) k.hideT = RESPAWN_HIDE;
    if (ev.used) this.useItem(k, ev.used);
    if (ev.lap) {
      if (s.lap > 1) {
        const t = this.tick - k.lapStart;
        if (k.bestLap === 0 || t < k.bestLap) k.bestLap = t;
      }
      k.lapStart = this.tick;
    }
    if (ev.finish) this.finishedNow.push(k);
  }

  private botViewOf(k: Kart): void {
    const v = this.view;
    v.racing = this.phase === RC_RACE;
    v.gridLeft = this.phase === RC_GRID ? this.phaseEnd - this.tick : 0;
    v.place = k.place || k.slot + 1;
    v.karts = this.karts.size;
    v.painted = k.paintT > 0;
    v.bubble = k.bubbleT > 0;
    v.behind = Infinity;
    v.ahead = Infinity;
    v.near = Infinity;
    const s = k.state;
    for (const o of this.karts.values()) {
      if (o === k) continue;
      const d = o.prog - k.prog;
      if (d > 0 && d < v.ahead) v.ahead = d;
      else if (d <= 0 && -d < v.behind) v.behind = -d;
      const t = o.state;
      if (!t.done && t.ghostT === 0 && o.bubbleT === 0 && Math.abs(t.y - s.y) < 1.5) {
        const r = Math.sqrt((t.x - s.x) * (t.x - s.x) + (t.z - s.z) * (t.z - s.z));
        if (r < v.near) v.near = r;
      }
    }
  }

  // ------------------------------------------------------------ бонусы

  /** Бонус из ящика: шансы плавно меняются от первого места к последнему; первому краска не выпадает (некого). */
  private rollItem(k: Kart): number {
    const n = this.karts.size;
    const place = k.place || n;
    const f = n > 1 ? (place - 1) / (n - 1) : 0;
    let sum = 0;
    const w: number[] = [];
    for (let i = 0; i < POOL_ITEMS.length; i++) {
      const x = place === 1 && POOL_ITEMS[i] === ITEM_PAINT ? 0 : POOL_FIRST[i] + (POOL_LAST[i] - POOL_FIRST[i]) * f;
      w.push(x);
      sum += x;
    }
    let r = this.roll() * sum;
    for (let i = 0; i < w.length; i++) {
      if (r < w[i]) return POOL_ITEMS[i];
      r -= w[i];
    }
    return ITEM_TURBO;
  }

  private useItem(k: Kart, item: number): void {
    this.events.push(['item', k.id, item]);
    const s = k.state;
    if (item === ITEM_JAM) {
      const x = s.x - s.hx * TRAP_BACK;
      const z = s.z - s.hz * TRAP_BACK;
      const loc = locateAny(this.track, x, z, this.loc);
      // над каналом или за краем причала банка тонет
      if (loc.ground === NO_GROUND || Math.abs(loc.lat) > loc.hw - 0.3) return;
      if (this.traps.length >= TRAP_MAX) {
        const old = this.traps.shift()!;
        this.events.push(['jam', old.id, 0]);
      }
      this.traps.push({ id: this.nextTrap, x, y: loc.ground, z, owner: k.id, born: this.tick });
      this.nextTrap = (this.nextTrap % 250) + 1;
    } else if (item === ITEM_PAINT) {
      let target: Kart | null = null;
      for (const o of this.karts.values()) if (o !== k && o.place === k.place - 1 && !o.state.done) target = o;
      if (target && this.absorb(target, k.id)) target = null;
      if (target) target.paintT = PAINT_TICKS;
      this.events.push(['paint', k.id, target ? target.id : 0]);
    } else if (item === ITEM_BUBBLE) {
      // физика уже сняла варенье и закрутку; краску снимает сервер
      k.bubbleT = BUBBLE_TICKS;
      k.paintT = 0;
    } else if (item === ITEM_CLAP) {
      const hit: number[] = [];
      for (const o of this.karts.values()) {
        const t = o.state;
        if (o === k || t.done || t.ghostT > 0 || Math.abs(s.y - t.y) > 1.5) continue;
        const dx = t.x - s.x;
        const dz = t.z - s.z;
        if (dx * dx + dz * dz > CLAP_R * CLAP_R || this.absorb(o, k.id)) continue;
        if (t.spinT < CLAP_SPIN) t.spinT = CLAP_SPIN;
        if (t.slowT < CLAP_SLOW) t.slowT = CLAP_SLOW;
        t.boostT = 0;
        t.boostLvl = 0;
        hit.push(o.id);
      }
      this.events.push(['clap', k.id, hit]);
    }
  }

  /** Пузырь принимает ровно один удар бонусом (варенье, краска, хлопок) и лопается; от воды и стен не спасает. */
  private absorb(k: Kart, from: number): boolean {
    if (k.bubbleT <= 0) return false;
    k.bubbleT = 0;
    this.events.push(['pop', k.id, from]);
    return true;
  }

  private pickCrates(): void {
    const crates = this.track.crates;
    for (let c = 0; c < crates.length; c++) {
      if (this.crateBack[c] > 0) {
        if (this.tick < this.crateBack[c]) continue;
        this.crateBack[c] = 0;
      }
      const cr = crates[c];
      for (const k of this.karts.values()) {
        const s = k.state;
        if (s.item !== 0 || s.itemT !== 0 || s.ghostT > 0 || s.done) continue;
        const dx = s.x - cr.x;
        const dz = s.z - cr.z;
        if (dx * dx + dz * dz > CRATE_R * CRATE_R || Math.abs(s.y - cr.y) > 1.5) continue;
        s.item = this.rollItem(k);
        s.itemT = ITEM_ROLL_TICKS;
        this.crateBack[c] = this.tick + CRATE_RESPAWN_TICKS;
        this.events.push(['crate', c, k.id]);
        break;
      }
    }
  }

  private trapsStep(): void {
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const t = this.traps[i];
      if (this.tick - t.born >= TRAP_LIFE) {
        this.traps.splice(i, 1);
        this.events.push(['jam', t.id, 0]);
        continue;
      }
      for (const k of this.karts.values()) {
        const s = k.state;
        if (s.ghostT > 0 || s.done || (k.id === t.owner && this.tick - t.born < TRAP_OWN_SAFE)) continue;
        const dx = s.x - t.x;
        const dz = s.z - t.z;
        if (dx * dx + dz * dz > TRAP_R * TRAP_R || Math.abs(s.y - t.y) > 1.2) continue;
        const blocked = this.absorb(k, t.owner);
        if (!blocked) {
          s.slowT = SLOW_TICKS;
          s.spinT = SPIN_TICKS;
        }
        this.traps.splice(i, 1);
        this.events.push(['jam', t.id, blocked ? 0 : k.id]);
        break;
      }
    }
  }

  // ------------------------------------------------------------ толчки, места, финиш

  private bumps(): void {
    const list = this.order;
    list.length = 0;
    for (const k of this.karts.values()) list.push(k);
    const d0 = 2 * KART_R;
    for (let i = 0; i < list.length; i++) {
      const a = list[i].state;
      if (a.ghostT > 0 || a.done) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j].state;
        if (b.ghostT > 0 || b.done) continue;
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= d0 * d0 || Math.abs(a.y - b.y) >= 1) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-6) {
          // стоят в одной точке — раздвинуть поперёк курса
          dx = -a.hz;
          dz = a.hx;
          d = 1;
        }
        const nx = dx / d;
        const nz = dz / d;
        const push = (d0 - Math.min(d, d0)) / 2;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (vn < 0) {
          const imp = (-(1 + BUMP_BOUNCE) * vn) / 2;
          a.vx -= nx * imp;
          a.vz -= nz * imp;
          b.vx += nx * imp;
          b.vz += nz * imp;
          if (-vn > 3) this.events.push(['bump', round2(-vn), round2((a.x + b.x) / 2), round2((a.z + b.z) / 2)]);
        }
        constrain(a, this.track);
        constrain(b, this.track);
      }
    }
  }

  private places(): void {
    const tr = this.track;
    for (const k of this.karts.values()) {
      const s = k.state;
      locate(tr, s.x, s.z, s.seg, this.loc);
      k.prog = progress(tr, s.lap, s.cp, this.loc.seg, this.loc.t);
    }
    // финишировавшие в этом тике — по тому, кто дальше
    if (this.finishedNow.length) {
      this.finishedNow.sort((a, b) => b.prog - a.prog);
      let human = false;
      for (const k of this.finishedNow) {
        k.finishPlace = ++this.finished;
        k.finishTick = this.tick;
        this.events.push(['finish', k.id, k.finishPlace, this.raceMs(k)]);
        if (!k.isBot) human = true;
      }
      this.finishedNow.length = 0;
      if (!this.waiting && (human || this.botsDone())) {
        this.waiting = true;
        this.phaseEnd = Math.min(this.phaseEnd, this.tick + RC_FINISH_WAIT);
      }
    }
    const list = this.order;
    list.length = 0;
    for (const k of this.karts.values()) list.push(k);
    list.sort((a, b) => {
      if (a.finishPlace && b.finishPlace) return a.finishPlace - b.finishPlace;
      if (a.finishPlace || b.finishPlace) return a.finishPlace ? -1 : 1;
      return b.prog - a.prog || a.slot - b.slot;
    });
    list.forEach((k, i) => (k.place = i + 1));
  }

  /** Строка итогов карта и жетоны (только доехавшему человеку). */
  private resultOf(k: Kart): [RaceResultRow, RcReward | null] {
    const reward = !k.isBot && k.finishPlace ? raceReward(k.place) : null;
    const row: RaceResultRow = {
      track: this.trackId, id: k.id, nick: k.name, bot: k.isBot, place: k.finishPlace ? k.place : 0, time: this.raceMs(k),
      best: Math.round((k.bestLap * 1000) / TICK_RATE), tokens: reward ? reward.total : 0,
    };
    return [row, reward];
  }

  /** Итог человеку: жетоны — ему в окно итогов, строка и жетоны — хабу (в профиль). */
  private pay(k: Kart, row: RaceResultRow, reward: RcReward | null): void {
    if (reward) k.sink?.sendJson({ t: 'raceReward', ...reward });
    this.hooks.result?.(k, row, reward);
  }

  private raceMs(k: Kart): number {
    return k.finishTick ? Math.round(((k.finishTick - this.raceStart) * 1000) / TICK_RATE) : 0;
  }

  private finishRace(): void {
    this.phase = RC_RESULTS;
    this.phaseEnd = this.tick + RC_RESULTS_TICKS;
    this.places();
    const results = this.order.map((k) => this.resultOf(k));
    const rows = results.map(([row]) => row);
    this.broadcast({ t: 'raceEnd', track: this.trackId, results: rows });
    this.order.forEach((k, i) => {
      if (!k.isBot && !k.gone) this.pay(k, ...results[i]);
    });
    const podium = rows.filter((r) => r.place > 0).slice(0, 3);
    this.hooks.announce?.(
      podium.length
        ? `🏁 Гонка: ${podium.map((r) => `${r.place}. ${r.nick}${r.bot ? ' (бот)' : ''}`).join(', ')}`
        : '🏁 Гонка: никто не доехал до финиша',
    );
  }

  // ------------------------------------------------------------ снимки

  private sendSnapshots(): void {
    const list: KartSnap[] = [];
    for (const k of this.karts.values()) {
      const s = k.state;
      list.push({
        id: k.id, flags: kartFlags(s, k.hideT === 0, k.paintT > 0), x: s.x, y: s.y, z: s.z, yaw: kartYaw(s), steer: s.steer,
        lap: s.lap, place: k.place, misc: kartMisc(s) | (k.bubbleT > 0 ? KM_BUBBLE : 0),
      });
    }
    const traps: TrapSnap[] = this.traps.map((t) => ({ id: t.id, x: t.x, y: t.y, z: t.z }));
    const karts = encodeKarts(list);
    const trapBytes = encodeTraps(traps);
    let crates = 0;
    for (let c = 0; c < this.crateBack.length; c++) if (this.crateBack[c] === 0) crates |= 1 << c;
    const h = this.header;
    h.tick = this.tick;
    h.phase = this.phase;
    h.phaseEnd = this.phaseEnd;
    h.crates = crates;
    const evMsg: ServerMsg | null = this.events.length ? { t: 'rev', k: this.tick, e: this.events } : null;
    for (const k of this.karts.values()) {
      if (!k.sink) continue;
      h.ack = k.inq.ack;
      h.queue = k.inq.length;
      h.flags = k.selfReset ? SNAP_SELF_RESET : 0;
      k.selfReset = false;
      k.sink.sendBinary(encodeKartSnapshot(h, k.state, karts, trapBytes));
      if (evMsg) k.sink.sendJson(evMsg);
    }
    this.events = [];
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
