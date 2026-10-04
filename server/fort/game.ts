// Игра «Крепость» на сервере: люди (тот же stepPlayer, что в пейнтболе, поверх — стволы крепости shared/fortgun.ts),
// выстрел от третьего лица по зомби с откатом к тому, что видел стрелок, урон и отхил, смерть и появление на террасе,
// фазы (сбор → волна → передышка → … → итоги → снова сбор), колокол, арсенал (золото, прокачка, стволы, гранаты,
// башни, ворота и кристалл — server/fort/arsenal.ts), жетоны по итогам (через хук), AFK, снимки 30 раз в секунду
// (хвост крепости — shared/fortnet.ts, за ним блок арсенала), состав и события. Всё, что даёт золото и жетоны, —
// только на сервере.
import { MAX_NAME, TICK_RATE } from '../../shared/constants.ts';
import { PB_AFK_TICKS } from '../../shared/economy.ts';
import {
  CRYSTAL_HP, END_TICKS, FORT_HP, FORT_MAX_HUMANS, FORT_REGEN_DELAY, FORT_REGEN_EVERY, FORT_RESPAWN_TICKS, FORT_SNAP_EVERY, FORT_TOP,
  FORT_WAVES, FT_BREAK, FT_END, FT_GATHER, FT_WAVE, GATE_HP, GATHER_TICKS, READY_TICKS, ZK, type FortEvent, type FortPlayerRow,
  type FortResultRow, RALLY_TICKS, RALLY_COOLDOWN, RALLY_MITIGATION, Z_BOAT, type FortRunRec, type FortStatus, type FortWaveCard,
  type FtReward,
} from '../../shared/fort.ts';
import {
  CRATE_NONE, EARLY_BONUS, EV_FOG, EV_GOLD, EV_METEORS, EV_NONE, EV_SUPPLY, GOLD_MUL, breakSecondsAfter, isBossWave, isSuperWave, supplyGold,
  waveTokens,
} from '../../shared/fortwaves.ts';
import { FM_EARLY } from '../../shared/fortnet.ts';
import { namesLine, recView, wavesText, type FortRecIntro } from '../../shared/fortrecord.ts';
import { planWave, type LastEvent, type WavePlan } from './director.ts';
import { FortLedger, settle, type FortRun, type SettleFinal } from './ledger.ts';
import { BOAT_BOUNTY, GREN_BUY, waveBonus, type Loadout } from '../../shared/fortarsenal.ts';
import { BTN_FT_GRENADE, BTN_FT_HEAVY, armFort, fortAfter, fortBefore, gunInHands, makeFortStep } from '../../shared/fortgun.ts';
import { buildFort, outsideFort, type FortMap } from '../../shared/fortmap.ts';
import { encodeFortTail, fortTailSize, makeFortTail, type ZombieSnap } from '../../shared/fortnet.ts';
import { hash32, makeRng } from '../../shared/math.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import type { Outfit } from '../../shared/outfit.ts';
import { E_ADS, E_ALIVE, E_DASH, E_FIRING, E_GROUNDED, E_RELOAD, SNAP_SELF_RESET, encodeEntities, encodeSnapshot, makeHeader, type EntitySnap } from '../../shared/protocol.ts';
import {
  BTN_ADS, BTN_DASH, BTN_FIRE, BTN_JUMP, BTN_RELOAD, BTN_SHOULDER, BTN_USE, makeEvents, makeInput, makeState, stepPlayer, type Input, type StepEvents,
} from '../../shared/sim.ts';
import { sanitizeName } from '../../shared/text.ts';
import { CollisionWorld, makeRayHit } from '../../shared/world.ts';
import { InputQueue } from '../inputs.ts';
import type { Sink } from '../paintball/game.ts';
import { Arsenal } from './arsenal.ts';
import { WaveEvents, type EventHost } from './events.ts';
import { Horde, type HordeHost, type HordeTarget, type Zombie } from './horde.ts';
import { devBossHp } from './kraken.ts';
import { FortNav } from './nav.ts';
import { SURR_COOLDOWN_TICKS, SURR_VOTE_TICKS } from '../../shared/fortsurrender.ts';
import { Surrender, type SurrenderOutcome } from './surrender.ts';

export class FortPlayer {
  readonly id: number;
  name: string;
  readonly sink: Sink;
  readonly seed: number;
  readonly state = makeState();
  readonly ev: StepEvents = makeEvents();
  pid = 0;
  level = 1;
  outfit: Outfit;
  alive = false;
  hp = FORT_HP;
  hurtTick = -9999;
  respawnTick = 0;
  firingUntil = 0;
  /**
   * Всё нажитое в этой игре — учёт по профилю (ledger.ts): сбитые, волны, жетоны и арсенал (run.arsenal — золото,
   * прокачка, стволы). Ушёл и вернулся в ту же игру — получает свой забег обратно, а не новый бюджет.
   */
  run: FortRun;
  /** Стволы и прокачка для шага (из run.arsenal), черновик шага, когда можно бросить следующую гранату */
  readonly load: Loadout = { heavy: 0, rate: 0, mag: 0 };
  readonly step = makeFortStep();
  grenReady = 0;
  /** Сбитые, сколько раз сбили его, отбитых волн с участием — поля run */
  get kills(): number { return this.run.kills; }
  set kills(v: number) { this.run.kills = v; }
  get deaths(): number { return this.run.deaths; }
  set deaths(v: number) { this.run.deaths = v; }
  get waves(): number { return this.run.waves; }
  set waves(v: number) { this.run.waves = v; }
  /** «Был в крепости с начала этой волны» и вклад в неё */
  inWave = false;
  waveJoinTick = 0;
  waveContribution = 0;
  /** Ударил в колокол */
  ready = false;
  /** Свой рекорд крепости (волн): из профиля при входе, растёт после каждой отбитой волны, засчитанной ему */
  best = 0;
  readonly inq = new InputQueue();
  readonly lastInput: Input = makeInput();
  selfReset = true;
  ping = 0;
  idleTicks = 0;
  afkSent = false;

  constructor(id: number, name: string, sink: Sink, seed: number, outfit: Outfit, run: FortRun) {
    this.id = id;
    this.name = name;
    this.sink = sink;
    this.seed = seed;
    this.outfit = outfit;
    this.run = run;
  }
}

export interface FortHumanInfo {
  pid: number;
  nick: string;
  level?: number;
  outfit: Outfit;
  /** Свой рекорд крепости из профиля (волн) */
  best?: number;
}

export interface FortHooks {
  /** Итог игры тому, кто дождался итогов: строка таблицы, жетоны (null — ни одной волны), победа, сколько волн отбито */
  result?(p: FortPlayer, row: FortResultRow, reward: FtReward | null, win: boolean, wave: number): void;
  /** Человек 90 с ничего не нажимал */
  afk?(p: FortPlayer): void;
  /**
   * Рекорды крепости (лучшие FORT_TOP забегов, по убыванию волн) и запись забега — после каждой отбитой волны, с номером
   * игры (rec.id): та же игра обновляет свою запись
   */
  top?(): readonly FortRunRec[];
  saveRun?(rec: FortRunRec): void;
  /** Свой рекорд защитника вырос (волн) — сразу в профиль */
  progress?(p: FortPlayer, wave: number): void;
  /** Строка всему серверу (рекорд крепости побит) */
  announce?(text: string): void;
}

/** Навигация считается один раз на процесс: карта у всех игр одна */
let navCache: FortNav | null = null;

export class FortGame implements HordeHost, EventHost {
  readonly map: FortMap;
  readonly world: CollisionWorld;
  readonly horde: Horde;
  /** События волны: метеоры, ящик припасов, лихорадка, туман (events.ts) */
  readonly waveEvents: WaveEvents;
  readonly players = new Map<number, FortPlayer>();
  readonly rng = makeRng(Date.now() & 0xffffffff);
  tick = 0;
  phase = FT_GATHER;
  phaseEnd = 0;
  /** Какая волна идёт (или была последней); сколько отбито в этой игре */
  wave = 0;
  cleared = 0;
  gate = GATE_HP;
  crystal = CRYSTAL_HP;
  rallyUntil = 0;
  rallyReady = 0;
  /** Зерно директора на эту игру, последнее событие, план идущей волны */
  seed = 1;
  lastEvent: LastEvent = { wave: -99, kind: EV_NONE };
  plan: WavePlan | null = null;
  /** Волну вызвали раньше (все в колокол в передышке): +10 % золота за неё */
  early = false;
  /** Карточка: в бою — идущей волны, в передышке и сборе — следующей */
  card: FortWaveCard | null = null;
  /** Разработка: /wave N, /gate, /event … в чате */
  debug = false;
  /**
   * Рекорды (shared/fortrecord.ts): номер игры (запись в таблице рекордов), рекорд крепости до этой игры (его и бьют),
   * было ли уже «рекорд побит» и «рекорд повторён» в этой игре
   */
  runId = 0;
  recBase: FortRunRec | null = null;
  private recTeamSaid = false;
  private recTieSaid = false;
  /** Арсенал: золото и покупки, башни, гранаты, ступени ворот и кристалла */
  readonly arsenal: Arsenal;
  /** Блок арсенала в хвосте снимка (FortTail.ext) */
  private readonly arTail = new Uint8Array(Arsenal.tailBytes);
  /** Разработка: событие следующей волны (/event) и «волна как для N защитников» (/wave W N) */
  private forceEvent = EV_NONE;
  private debugTeam = 0;
  private readonly hooks: FortHooks;
  private events: FortEvent[] = [];
  private readonly targetList: HordeTarget[] = [];
  private readonly entityList: EntitySnap[] = [];
  private readonly zsnap: ZombieSnap[] = [];
  private readonly tail = makeFortTail();
  private readonly header = makeHeader();
  private readonly hit = makeRayHit();
  private readonly usedIds = new Set<number>();
  private rosterDirty = true;
  private rosterSentTick = -9999;
  private pendingAfk: FortPlayer[] = [];
  /** Ушедшие из идущей игры — по номеру профиля (вернутся — получат свой забег) */
  private readonly ledger = new FortLedger();
  /** Белый флаг на террасе: голосование «сдаться» (surrender.ts) */
  private readonly surr = new Surrender();

  constructor(hooks: FortHooks = {}) {
    this.hooks = hooks;
    this.map = buildFort();
    this.world = new CollisionWorld(this.map);
    navCache ??= new FortNav(this.map);
    this.horde = new Horde(navCache, this, makeRng(hash32(Date.now() & 0xffff, 77)));
    this.arsenal = new Arsenal(this);
    this.waveEvents = new WaveEvents(this);
  }

  get humanCount(): number {
    return this.players.size;
  }

  // ------------------------------------------------------------ вход и выход

  addHuman(info: FortHumanInfo, sink: Sink): FortPlayer | null {
    if (this.players.size >= FORT_MAX_HUMANS) return null;
    let id = -1;
    for (let i = 1; i < 250; i++) {
      if (!this.usedIds.has(i)) {
        id = i;
        break;
      }
    }
    if (id < 0) return null;
    // в пустую крепость — новая игра со сбора
    if (this.players.size === 0) this.newGame();
    this.usedIds.add(id);
    // Вернулся в ту же игру — свой забег целиком (золото и прокачка — один раз за игру, ledger.ts). Новенький —
    // стартовое золото и 75 % от среднего заработка команды (arsenal.newRun).
    const back = this.ledger.take(info.pid);
    const run = back ?? this.arsenal.newRun(this.wave > 0);
    const p = new FortPlayer(id, this.uniqueName(sanitizeName(info.nick) || `Игрок${id}`), sink, hash32(id, Date.now() & 0xffff), info.outfit, run);
    p.pid = info.pid;
    p.level = info.level ?? 1;
    p.best = Math.max(0, Math.floor(info.best ?? 0), run.recWave);
    // свой рекорд до этой игры — при первом входе в неё (вернулся — тот же забег, тот же «до»)
    if (!back) run.best0 = p.best;
    this.arsenal.loadout(p, p.load);
    this.players.set(id, p);
    p.waveJoinTick = this.tick;
    // приветствие — строго первым, до снимков и событий
    sink.sendJson({ t: 'fort', id, tick: this.tick, seed: p.seed, phase: this.phase, phaseEnd: this.phaseEnd, wave: this.wave, players: this.roster(),
      ...(this.card ? { card: this.card } : {}), rec: this.recIntro(p) });
    this.spawn(p);
    this.sendSurrTo(p);
    if (this.phase === FT_WAVE && this.horde.raiseDefenders(this.players.size, this.tick)) {
      this.systemChat(`Орда усилена для ${this.horde.defenders} защитников · подкрепление через 3 с`);
    }
    this.rosterDirty = true;
    this.systemChat(back ? `${p.name} вернулся на стены` : `${p.name} поднимается на стены`);
    return p;
  }

  removePlayer(id: number): void {
    const p = this.players.get(id);
    if (!p) return;
    // жетоны за отбитые волны — сразу при выходе; забег — в книгу: вернётся в эту же игру — продолжит с ним
    this.payout(p, null, false);
    if (this.phase !== FT_END) this.ledger.stash(p.pid, p.run);
    this.players.delete(id);
    this.usedIds.delete(id);
    // Snapshot IDs can be reused by a new defender; prior damage belongs to the departed session.
    for (const zombie of this.horde.zombies) zombie.damageBy.delete(id);
    this.rosterDirty = true;
    if (this.players.size > 0) this.systemChat(`${p.name} ушёл из крепости`);
    // ушедший выбывает из подсчёта голосов: без него голосование может пройти или провалиться раньше срока
    const left = this.surr.leave(id, this.tick);
    if (left) this.surrenderStep(left.out);
  }

  private uniqueName(name: string): string {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 100; i++) {
      const n = `${name.slice(0, MAX_NAME - 2)}${i}`;
      if (!taken.has(n.toLowerCase())) return n;
    }
    return name;
  }

  // ------------------------------------------------------------ фазы

  /** Новая игра: ворота и кристалл целы, башен нет, у всех стартовое золото и маркер, сбор 25 с. */
  newGame(): void {
    this.waveEvents.stop();
    this.debugTeam = 0;
    this.horde.clear();
    this.ledger.clear();
    this.surr.reset();
    this.wave = 0;
    this.cleared = 0;
    // новая игра — новая строка в таблице рекордов; бьём рекорд, что был до неё
    this.runId = Math.max(Date.now(), this.runId + 1);
    this.recBase = (this.hooks.top?.() ?? [])[0] ?? null;
    this.recTeamSaid = this.recTieSaid = false;
    this.seed = Math.floor(this.rng() * 0x7fffffff) + 1;
    this.lastEvent = { wave: -99, kind: EV_NONE };
    this.plan = null;
    this.early = false;
    this.gate = GATE_HP;
    this.world.setEnabled(this.map.gateBox, true);
    this.crystal = CRYSTAL_HP;
    this.rallyUntil = this.rallyReady = 0;
    this.arsenal.newGame();
    for (const p of this.players.values()) {
      p.run = this.arsenal.newRun(false);
      p.run.best0 = p.best;
      this.arsenal.loadout(p, p.load);
      p.inWave = false;
      p.waveContribution = 0;
      p.grenReady = 0;
      this.spawn(p);
    }
    this.card = this.planFor(1).card;
    // рекорды новой игры (бьют уже, возможно, свой же рекорд прошлой игры) — до смены фазы: «Новая игра» с ними
    for (const p of this.players.values()) p.sink.sendJson({ t: 'frecNew', rec: this.recIntro(p) });
    this.setPhase(FT_GATHER, this.tick + GATHER_TICKS);
    // новый арсенал — сразу, до снимка со сбросом предсказания
    this.flushRoster();
  }

  private setPhase(phase: number, end: number): void {
    this.phase = phase;
    this.phaseEnd = end;
    for (const p of this.players.values()) p.ready = false;
    this.rosterDirty = true;
    this.broadcast({ t: 'fphase', phase, end, wave: this.wave, ...(this.card ? { card: this.card } : {}) });
  }

  /** План волны w для нынешнего числа защитников (директор: то же зерно — тот же план) */
  private planFor(w: number, humans = this.debugTeam || this.players.size): WavePlan {
    return planWave(w, Math.max(1, humans), this.seed, this.lastEvent);
  }

  private startWave(): void {
    this.wave++;
    this.rallyUntil = this.rallyReady = 0;
    const w = this.wave;
    const last = this.lastEvent;
    const plan = planWave(w, Math.max(1, this.debugTeam || this.players.size), this.seed, last);
    if (this.forceEvent !== EV_NONE) {
      plan.event = this.forceEvent;
      plan.card = { ...plan.card, event: this.forceEvent };
      this.forceEvent = EV_NONE;
    }
    this.plan = plan;
    if (plan.event !== EV_NONE) this.lastEvent = { wave: w, kind: plan.event };
    this.horde.startWave(plan, this.tick, (n) => planWave(w, n, this.seed, last));
    this.arsenal.onWaveStart();
    this.waveEvents.start(plan, this.tick);
    for (const p of this.players.values()) {
      p.inWave = true;
      p.waveJoinTick = this.tick;
      p.waveContribution = 0;
    }
    this.card = { ...plan.card, ...(this.early ? { early: true } : {}) };
    this.setPhase(FT_WAVE, this.tick);
    const boss = plan.boss >= 0 ? ` · 👑 ${ZK[plan.boss].name}${plan.bossTier ? ` ${roman(plan.bossTier + 1)}` : ''}` : '';
    this.systemChat(w === FORT_WAVES ? `🧟 Последняя волна — ${FORT_WAVES}-я! Держимся!` : `🧟 Волна ${w} · ${plan.card.title}${boss}`);
    if (this.early) this.systemChat(`🔔 Волну вызвали раньше: +${Math.round(EARLY_BONUS * 100)} % золота за неё`);
    const base = this.recBase?.wave ?? 0;
    if (base > 0 && w === base + 1) this.systemChat(`🏆 Волна ${w} — рекордная: отбейте её, и рекорд крепости ваш!`);
  }

  /** Множитель награды за сбитых в этой волне: вызвали раньше (+10 %), золотая лихорадка (×2) */
  get goldMul(): number {
    const rush = this.phase === FT_WAVE && this.plan?.event === EV_GOLD ? GOLD_MUL : 1;
    return (this.early ? 1 + EARLY_BONUS : 1) * rush;
  }

  /**
   * Ящик припасов подобран — припасы всей команде: каждому гранаты (арсенал, +GREN_BUY), а у кого подсумок полон —
   * золото (supplyGold). Возвращает надпись для чата.
   */
  grantSupply(_p: FortPlayer): string {
    const gold = supplyGold(this.wave);
    let grens = 0;
    let golds = 0;
    for (const q of this.players.values()) {
      if (this.arsenal.grantSupply(q)) grens++;
      else {
        this.arsenal.giveGold(q, gold, q.state.x, q.state.y + 2, q.state.z);
        golds++;
      }
    }
    this.rosterDirty = true;
    if (!golds) return `гранаты каждому (+${GREN_BUY})`;
    if (!grens) return `+${gold} золота каждому`;
    return `гранаты (+${GREN_BUY}), а у кого подсумок полон — +${gold} золота`;
  }

  supplyPicked(pid: number): void {
    const p = this.players.get(pid);
    if (!p) return;
    this.systemChat(`📦 ${p.name} подобрал припасы: ${this.grantSupply(p)}`);
  }

  private endWave(): void {
    this.waveEvents.stop();
    this.cleared = this.wave;
    const credited: FortPlayer[] = [];
    for (const p of this.players.values()) {
      if (p.inWave || p.waveContribution > 0 || this.tick - p.waveJoinTick >= 5 * TICK_RATE) {
        p.waves++;
        p.run.tokWaves += waveTokens(this.wave);
        credited.push(p);
      }
      p.inWave = false;
    }
    this.recordWave(credited);
    const clean = this.arsenal.downs === 0 && !this.arsenal.gateFell;
    this.arsenal.onWaveEnd();
    if (this.wave >= FORT_WAVES) {
      this.finish(true);
      return;
    }
    // передышка: все вылечены, сбитые встают сразу, кто оказался за стенами — снова на террасе
    for (const p of this.players.values()) {
      if (!p.alive || outsideFort(p.state.x, p.state.y, p.state.z)) this.spawn(p);
      else p.hp = FORT_HP;
    }
    this.early = false;
    this.plan = null;
    const next = this.planFor(this.wave + 1);
    this.card = next.card;
    const sec = breakSecondsAfter(this.wave);
    this.setPhase(FT_BREAK, this.tick + sec * TICK_RATE);
    const ahead = isSuperWave(this.wave + 1) ? ` · ⚠ дальше супер-босс: ${next.card.title}!`
      : isBossWave(this.wave + 1) ? ` · ⚠ дальше босс: ${next.card.title}` : '';
    this.systemChat(`✅ Волна ${this.wave} отбита! +${waveBonus(this.wave)} 💰 и общак волны${clean ? ' ×1,5 — чистая волна' : ''}. Передышка ${sec} с${ahead}`);
  }

  /**
   * Рекорды после отбитой волны (решает сервер). Забег — сразу в таблицу рекордов (одна запись на игру: если все уйдут
   * посреди игры или сервер упадёт, рекорд не пропадёт), ники — кому засчитана эта волна. Свой рекорд растёт у каждого,
   * кому засчитана волна, — сразу в профиль. Впервые за игру побили или повторили рекорд крепости — событие всем в
   * крепости (баннер и звук), побили — ещё и строка всему серверу; свой рекорд — событие ему. Рекорда до игры не было
   * (base 0) или своего не было — молча: бить нечего.
   */
  private recordWave(credited: FortPlayer[]): void {
    const w = this.cleared;
    if (w <= 0) return;
    const base = this.recBase?.wave ?? 0;
    const names = credited.map((p) => p.name).slice(0, FORT_MAX_HUMANS);
    if (credited.length) this.hooks.saveRun?.({ wave: w, names, at: Date.now(), n: credited.length, id: this.runId });
    if (base > 0 && w > base && !this.recTeamSaid) {
      this.recTeamSaid = true;
      this.broadcast({ t: 'frec', k: 'team', wave: w, prev: base });
      // строка всему серверу (её видят и здесь); без неё — только в крепости
      if (this.hooks.announce && names.length) this.hooks.announce(`🏆 Крепость: ${namesLine(names)} — новый рекорд, ${wavesText(w)} (прежний — ${base})! Бой ещё идёт`);
      else this.systemChat(`🏆 Новый рекорд крепости: ${wavesText(w)}! Прежний — ${base}. Держимся дальше!`);
    } else if (base > 0 && w === base && !this.recTieSaid) {
      this.recTieSaid = true;
      this.broadcast({ t: 'frec', k: 'tie', wave: w, prev: base });
      this.systemChat(`⚔️ Рекорд крепости повторён: ${wavesText(w)}! Ещё одна волна — и он ваш`);
    }
    for (const p of credited) {
      p.run.recWave = w;
      if (w > p.best) {
        p.best = w;
        this.hooks.progress?.(p, w);
      }
      if (w > p.run.best0) {
        p.sink.sendJson({ t: 'frec', k: 'me', wave: w, prev: p.run.best0, ...(p.run.recSaid ? {} : { first: true }) });
        p.run.recSaid = true;
      }
    }
  }

  /** Рекорды вошедшему: рекорд крепости сейчас (его ставит эта игра — live), рекорд до игры, свой до игры и в ней */
  private recIntro(p: FortPlayer): FortRecIntro {
    const top = (this.hooks.top?.() ?? [])[0];
    return { top: recView(top, !!top && top.id === this.runId && this.phase !== FT_END), base: this.recBase?.wave ?? 0, best: p.run.best0, my: p.run.recWave };
  }

  /**
   * Итоги: таблица, лучший защитник, рекорд крепости (побили тот, что был до игры, — +15 🪙 каждому в итогах), остаток
   * жетонов тем, кто дождался (за волны — то, что ещё не платили). Забег в таблице рекордов — с последней отбитой волны.
   */
  private finish(win: boolean, surr = false): void {
    this.surr.cancel();
    this.waveEvents.stop();
    this.card = null;
    this.plan = null;
    this.setPhase(FT_END, this.tick + END_TICKS);
    let mvp: FortPlayer | null = null;
    if (this.players.size >= 2) {
      for (const p of this.players.values()) if (p.run.arsenal.killGold > 0 && (!mvp || p.run.arsenal.killGold > mvp.run.arsenal.killGold)) mvp = p;
    }
    // рекорд — против того, что был до этой игры (сама игра уже стоит в таблице с последней отбитой волны)
    const prev = this.recBase?.wave ?? 0;
    const record = this.cleared > prev;
    const rows: FortResultRow[] = [];
    for (const p of this.players.values()) rows.push(this.payout(p, { mvp: p === mvp, record, win }, win)!);
    rows.sort((a, b) => b.pts - a.pts || b.k - a.k);
    const top = (this.hooks.top?.() ?? []).slice(0, FORT_TOP);
    this.broadcast({ t: 'fend', win, wave: this.cleared, mvp: mvp ? mvp.id : 0, rows, top: [...top], record, prev, run: this.runId, ...(surr ? { surr: true } : {}) });
    const mine = top.find((r) => r.id === this.runId);
    if (record && prev > 0 && mine) this.hooks.announce?.(`🏰 Новый рекорд крепости — ${wavesText(mine.wave)}: ${namesLine(mine.names)}`);
    if (surr) {
      // сдались голосованием у белого флага: отбитые волны — как при поражении, неотбитая текущая не в счёт
      this.systemChat(`🏳️ Сдались на волне ${this.cleared + 1}${record && this.cleared > 0 ? ` · 🏆 новый рекорд крепости: ${this.cleared}!` : prev ? ` · рекорд крепости — ${prev}` : ''}. Новая игра — через несколько секунд`);
      return;
    }
    this.systemChat(win ? `🏆 Крепость выстояла! Все ${FORT_WAVES} волн отбиты`
      : `💥 Кристалл разбит на волне ${this.wave}${record && this.cleared > 0 ? ` · 🏆 новый рекорд крепости: ${this.cleared}!` : prev ? ` · рекорд крепости — ${prev}` : ''}. Новая игра — через несколько секунд`);
  }

  /**
   * Выплата по забегу (ledger.settle): при выходе — за отбитые волны и сбитых, что ещё не платили; в итогах — ещё
   * бонусы. Хук result считает игру в статистике профиля только при первой выплате (row.again). При выходе без
   * единой волны и сбитого — ничего (null).
   */
  private payout(p: FortPlayer, final: SettleFinal | null, win: boolean): FortResultRow | null {
    const run = p.run;
    const kNew = run.kills - run.paidKills;
    const reward = settle(run, final);
    if (!final && !reward && kNew <= 0) return null;
    const row: FortResultRow = { id: p.id, name: p.name, k: p.kills, d: p.deaths, pts: Math.round(run.arsenal.killGold), waves: p.waves, tokens: reward?.total ?? 0, again: run.payouts > 0, kNew,
      best: run.best0, my: run.recWave };
    run.paidKills = run.kills;
    run.payouts++;
    // в итогах — панель наград; при выходе — короткая надпись (игрок уже уходит на набережную)
    if (reward && final) p.sink.sendJson({ t: 'fortReward', ...reward });
    else if (reward) p.sink.sendJson({ t: 'toast', text: `🏰 Крепость: +${reward.total} 🪙 за отбитые волны (${p.waves}) и сбитых` });
    this.hooks.result?.(p, row, reward, win, this.cleared);
    return row;
  }

  // ------------------------------------------------------------ люди

  private spawn(p: FortPlayer): void {
    let best = this.map.spawns[0];
    let bestScore = -Infinity;
    for (const s of this.map.spawns) {
      let minD = 20;
      for (const q of this.players.values()) {
        if (q === p || !q.alive) continue;
        minD = Math.min(minD, Math.hypot(q.state.x - s.x, q.state.z - s.z));
      }
      const score = minD + this.rng() * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    const st = p.state;
    Object.assign(st, makeState());
    st.x = best.x;
    st.y = best.y;
    st.z = best.z;
    armFort(st, p.load);
    st.prevButtons = p.lastInput.buttons;
    p.alive = true;
    p.hp = FORT_HP;
    p.hurtTick = -9999;
    p.selfReset = true;
    this.events.push(['spawn', p.id, r2(st.x), r2(st.y), r2(st.z), r2(best.yaw)]);
  }

  onInputs(p: FortPlayer, inputs: Input[], count: number): void {
    p.inq.push(inputs, count);
  }

  private processHuman(p: FortPlayer): void {
    const q = p.inq;
    const n = q.due();
    for (let i = 0; i < n; i++) {
      const inp = q.shift();
      const last = p.lastInput;
      if (inp.buttons !== last.buttons || Math.abs(inp.yaw - last.yaw) > 1e-4 || Math.abs(inp.pitch - last.pitch) > 1e-4) p.idleTicks = 0;
      this.simulate(p, inp);
      last.seq = inp.seq;
      last.buttons = inp.buttons;
      last.yaw = inp.yaw;
      last.pitch = inp.pitch;
      last.viewTick = inp.viewTick;
    }
    if (n === 0) {
      q.starve++;
      // долго нет ввода (вкладка свернулась, лаг) — двигаем по последнему вводу без «разовых» кнопок
      if (q.starve > 8 && p.alive) {
        const idle = p.lastInput;
        const saved = idle.buttons;
        idle.buttons = saved & ~(BTN_FIRE | BTN_JUMP | BTN_DASH | BTN_RELOAD | BTN_USE);
        // рука и зажатая G — как были: смена ствола и бросок гранаты — только по настоящему вводу
        if (q.starve > 90) idle.buttons &= BTN_ADS | BTN_SHOULDER | BTN_FT_HEAVY | BTN_FT_GRENADE;
        this.simulate(p, idle);
        idle.buttons = saved;
      }
    }
    if (++p.idleTicks >= PB_AFK_TICKS && !p.afkSent) {
      p.afkSent = true;
      this.pendingAfk.push(p);
    }
  }

  private simulate(p: FortPlayer, inp: Input): void {
    if (!p.alive) {
      p.state.prevButtons = inp.buttons;
      return;
    }
    // E у ящика припасов (кнопка «нажата сейчас», а не держится)
    if ((inp.buttons & BTN_USE) !== 0 && (p.state.prevButtons & BTN_USE) === 0 && this.phase === FT_WAVE) {
      this.waveEvents.use(p.id, p.state.x, p.state.y, p.state.z);
    }
    // стволы крепости поверх общего шага: движение — stepPlayer, оружие и лестницы — shared/fortgun.ts
    const m = fortBefore(p.step, p.state, inp, p.load);
    stepPlayer(p.state, m, this.world, true, p.seed, p.ev);
    fortAfter(p.step, p.state, p.ev, true, p.seed);
    if (p.ev.fired) {
      p.firingUntil = this.tick + 8;
      // выстрел: зомби откатываются к тому, что видел стрелок; урон, дробь, болт насквозь — арсенал
      this.arsenal.fire(p, inp);
    }
    if (p.step.ev.release) this.arsenal.throwGrenade(p, inp);
    // провалился сквозь мир (не должно быть) — на террасу
    if (p.state.y < -5) this.spawn(p);
  }

  private down(p: FortPlayer, zid: number): void {
    p.alive = false;
    p.hp = 0;
    p.deaths++;
    this.arsenal.onDown();
    p.respawnTick = this.tick + FORT_RESPAWN_TICKS;
    this.events.push(['pdown', p.id, zid]);
    this.rosterDirty = true;
  }

  /** Отхил: FORT_REGEN_DELAY без урона — по 1 HP раз в FORT_REGEN_EVERY тиков. */
  private regen(): void {
    for (const p of this.players.values()) {
      if (!p.alive || p.hp >= FORT_HP) continue;
      const since = this.tick - p.hurtTick - FORT_REGEN_DELAY;
      if (since >= 0 && since % FORT_REGEN_EVERY === 0) p.hp = Math.min(FORT_HP, Math.ceil(p.hp) + 1);
    }
  }

  // ------------------------------------------------------------ для орды (HordeHost)

  gateUp(): boolean {
    return this.gate > 0;
  }

  hitGate(dmg: number): void {
    if (this.gate <= 0) return;
    this.gate -= this.structureDamage(dmg);
    if (this.gate > 0) return;
    this.gate = 0;
    this.world.setEnabled(this.map.gateBox, false);
    this.arsenal.onGateFell();
    this.events.push(['gate', 0, 0]);
    this.systemChat('🚪 Ворота пали! Зомби во дворе — к кристаллу!');
  }

  private structureDamage(dmg: number): number {
    return this.phase === FT_WAVE && this.rallyUntil > this.tick ? dmg * (1 - RALLY_MITIGATION) : dmg;
  }

  hitCrystal(dmg: number): void {
    this.crystal = Math.max(0, this.crystal - this.structureDamage(dmg));
  }

  targets(): readonly HordeTarget[] {
    return this.targetList;
  }

  hitPlayer(zid: number, pid: number, dmg: number): void {
    const p = this.players.get(pid);
    if (!p || !p.alive) return;
    p.hp -= dmg;
    p.hurtTick = this.tick;
    this.events.push(['phit', zid, pid, dmg]);
    if (p.hp <= 0.5) this.down(p, zid);
  }

  traceAttack(ox: number, oy: number, oz: number, tx: number, ty: number, tz: number, out: { x: number; y: number; z: number }): boolean {
    const dx = tx - ox;
    const dy = ty - oy;
    const dz = tz - oz;
    const d = Math.hypot(dx, dy, dz);
    out.x = tx;
    out.y = ty;
    out.z = tz;
    if (d < 1e-6 || !this.world.raycast(ox, oy, oz, dx / d, dy / d, dz / d, Math.max(0, d - 0.02), this.hit, true)) return false;
    out.x = ox + dx / d * this.hit.t;
    out.y = oy + dy / d * this.hit.t;
    out.z = oz + dz / d * this.hit.t;
    return true;
  }

  /** Лужи смолы (котлы на стенах) замедляют зомби */
  slow(x: number, z: number): number {
    return this.arsenal.slow(x, z);
  }

  killed(z: Zombie, by: number): void {
    const p = by ? this.players.get(by) : undefined;
    if (p) p.kills++;
    for (const q of this.players.values()) if ((z.damageBy.get(q.id) ?? 0) > 0) q.waveContribution++;
    // потопленная лодка десанта — команде поровну (BOAT_BOUNTY); экипаж тонет — каждый как сбитый абордажник.
    // Остальные: 60 % — по урону (и вкладчикам башен), 40 % — в общак волны
    if (z.kind === Z_BOAT && !z.crew) this.arsenal.teamBounty(BOAT_BOUNTY * this.goldMul, z.x, z.y + 1.5, z.z);
    else this.arsenal.onKill(z);
    this.rosterDirty = true;
  }

  event(e: FortEvent): void {
    this.events.push(e);
  }

  private buildTargets(): void {
    const list = this.targetList;
    let n = 0;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const t = list[n] ?? (list[n] = { id: 0, x: 0, y: 0, z: 0, air: false });
      t.id = p.id;
      t.x = p.state.x;
      t.y = p.state.y;
      t.z = p.state.z;
      t.air = p.state.grounded === 0;
      n++;
    }
    list.length = n;
  }

  // ------------------------------------------------------------ стойки

  /**
   * {t:'use', id}: id < 1000 — номер стойки на карте (колокол; лавку, ворота, кристалл и башни клиент открывает
   * панелью сам), id ≥ 2000 — действие из панели арсенала (покупка — только рядом со своей стойкой).
   */
  use(p: FortPlayer, id: number): void {
    if (this.players.get(p.id) !== p || !p.alive || !Number.isSafeInteger(id)) return;
    const calm = this.phase === FT_GATHER || this.phase === FT_BREAK;
    if (id >= 1000) {
      this.arsenal.use(p, id);
      return;
    }
    const st = this.map.stations[id];
    if (!st || !this.atStation(p, st)) return;
    if (st.kind === 'flag') return this.useFlag(p);
    if (st.kind === 'bell') {
      if (this.phase === FT_WAVE) {
        if (this.tick < this.rallyReady) return this.toast(p, `Щит восстанавливается: ${Math.ceil((this.rallyReady - this.tick) / TICK_RATE)} с`);
        this.rallyUntil = this.tick + RALLY_TICKS;
        this.rallyReady = this.tick + RALLY_COOLDOWN;
        this.events.push(['bell', p.id]);
        this.systemChat('🔔 Щит на 8 с: ворота и кристалл получают вдвое меньше урона. Игроки уходят с меток!');
        return;
      }
      if (!calm) return;
      if (p.ready) return;
      p.ready = true;
      this.rosterDirty = true;
      this.events.push(['bell', p.id]);
      const all = [...this.players.values()].every((q) => q.ready);
      if (all) {
        this.phaseEnd = Math.min(this.phaseEnd, this.tick + READY_TICKS);
        // в передышке — «вызвали раньше»: +10 % золота за следующую волну всем
        if (this.phase === FT_BREAK && !this.early) {
          this.early = true;
          this.events.push(['early', Math.round(EARLY_BONUS * 100)]);
        }
        if (this.card) this.card = { ...this.card, ...(this.early ? { early: true } : {}) };
        this.broadcast({ t: 'fphase', phase: this.phase, end: this.phaseEnd, wave: this.wave, ...(this.card ? { card: this.card } : {}) });
      }
      return;
    }
  }

  // ------------------------------------------------------------ белый флаг: сдаться голосованием

  /**
   * E у белого флага (surrender.ts): первое нажатие просит нажать ещё раз (3 с), второе начинает голосование — одному
   * игроку оно сразу заканчивает игру. Можно во время волны и в передышке; в сборе и на итогах — нет.
   */
  private useFlag(p: FortPlayer): void {
    if (this.phase !== FT_WAVE && this.phase !== FT_BREAK) {
      if (this.phase === FT_GATHER) this.toast(p, 'Сдаться можно, когда начнётся первая волна');
      return;
    }
    const r = this.surr.press(p.id, p.name, [...this.players.keys()], this.tick);
    switch (r.k) {
      case 'ask':
        p.sink.sendJson({ t: 'fsurr', ...this.surr.view(this.tick), ask: r.until });
        return;
      case 'wait':
        this.toast(p, `Сдаться можно через ${Math.ceil(r.left / TICK_RATE)} с`);
        return;
      case 'busy':
        this.toast(p, 'Голосование уже идёт — Y за, N против');
        return;
      case 'started': {
        const v = this.surr.view(this.tick);
        this.systemChat(`🏳️ ${p.name} предлагает сдаться — голосуем ${Math.round(SURR_VOTE_TICKS / TICK_RATE)} с: Y — за, N — против (нужно ${v.need} из ${v.voters.length})`);
        this.sendSurr();
        return;
      }
      case 'ended':
        this.surrenderStep(r.out);
        return;
    }
  }

  /** {t:'fortVote', yes}: голос в голосовании «сдаться»; голосуют все люди в крепости, сбитые тоже */
  vote(p: FortPlayer, yes: boolean): void {
    if (this.players.get(p.id) !== p || this.phase === FT_END) return;
    const r = this.surr.vote(p.id, yes, this.tick);
    if (r) this.surrenderStep(r.out);
  }

  /** Состояние голосования изменилось (out — если оно этим кончилось): разослать, написать в чат, сдаться */
  private surrenderStep(out: SurrenderOutcome | null): void {
    if (!out) {
      this.sendSurr();
      return;
    }
    this.broadcast({ t: 'fsurr', ...out.view });
    const score = `за ${out.yes} из ${out.voters}`;
    if (out.result === 'passed') {
      // в одиночку голосования не было — только итог
      if (out.voters > 1) this.systemChat(`🏳️ Голосование: прошло — ${score}`);
      this.finish(false, true);
    } else {
      this.systemChat(`🏳️ Голосование: не прошло — ${score}, нужно ${out.need}. Снова сдаться можно через ${Math.round(SURR_COOLDOWN_TICKS / TICK_RATE)} с`);
    }
  }

  private sendSurr(): void {
    this.broadcast({ t: 'fsurr', ...this.surr.view(this.tick) });
  }

  /** Вошедшему: идёт голосование или действует перезарядка */
  private sendSurrTo(p: FortPlayer): void {
    const v = this.surr.view(this.tick);
    if (v.open || v.cd) p.sink.sendJson({ t: 'fsurr', ...v });
  }

  /** Стоит у стойки (как проверяет и клиент, с запасом 0,6 м) */
  atStation(p: FortPlayer, st: { x: number; y: number; z: number; r: number }): boolean {
    return Math.hypot(p.state.x - st.x, p.state.z - st.z) <= st.r + 0.6 && Math.abs(p.state.y - st.y) <= 1.6;
  }

  /** Новые ворота (куплены в передышку): полная прочность, створки снова в мире коллизий */
  raiseGate(hp: number): void {
    this.gate = hp;
    this.world.setEnabled(this.map.gateBox, true);
  }

  toast(p: FortPlayer, text: string): void {
    p.sink.sendJson({ t: 'toast', text });
  }

  // ------------------------------------------------------------ чат

  /** Команды из чата: /kill — снова на террасу (застрял за стенами), /help. */
  command(p: FortPlayer, text: string): void {
    const [cmd, arg] = text.slice(1).split(/\s+/);
    if (cmd.toLowerCase() === 'kill') {
      if (p.alive) this.down(p, 0);
      return;
    }
    if (this.debug && cmd.toLowerCase() === 'wave') {
      // /wave W [N] — к волне W; N — орда как для N защитников (проверить большие волны одному)
      const team = Number(text.slice(1).split(/\s+/)[2] ?? 0);
      this.debugTeam = Number.isInteger(team) && team >= 1 && team <= 6 ? team : 0;
      this.jumpTo(Number(arg));
      return;
    }
    if (this.debug && cmd.toLowerCase() === 'gate') {
      // разработка: снести ворота (проверить прорыв боссов)
      if (this.gate > 0) this.hitGate(1e9);
      return;
    }
    if (this.debug && cmd.toLowerCase() === 'event') {
      // разработка: событие следующей волны
      const kinds: Record<string, number> = { meteors: EV_METEORS, supply: EV_SUPPLY, gold: EV_GOLD, fog: EV_FOG };
      this.forceEvent = kinds[(arg ?? '').toLowerCase()] ?? EV_NONE;
      this.systemChat(this.forceEvent ? `🛠 Разработка: на следующей волне — ${arg}` : '🛠 /event meteors | supply | gold | fog');
      return;
    }
    if (this.debug && cmd.toLowerCase() === 'clear') {
      // разработка: волна отбита (орда убрана — в ближайший тик сработает «волна отбита»)
      if (this.phase === FT_WAVE) this.horde.clear();
      return;
    }
    if (this.debug && cmd.toLowerCase() === 'lose') {
      // разработка: кристалл разбит — итоги
      if (this.phase === FT_WAVE || this.phase === FT_BREAK) this.finish(false);
      return;
    }
    if (this.debug && cmd.toLowerCase() === 'hp') {
      // разработка: всем боссам и щупальцам N % HP (/hp 45 — ярость, /hp 0.05 — гибель)
      if (devBossHp(this.horde, Number(arg))) this.systemChat(`🛠 Разработка: боссам — ${Number(arg)} % HP`);
      return;
    }
    this.privateChat(p, 'Крепость: E у прилавка — лавка (1–9 — купить), E у ворот, кристалла и мест башен на стенах — их панель, 1/2 — маркер или тяжёлый ствол, колесо мыши — камера ближе/дальше, G — граната (держи — дуга), лестницы — W лицом к стене, колокол — «готов», белый флаг — сдаться (голосование: Y — за, N — против), Q — плечо, R — перезарядка, M — звук, Esc → «На набережную» — выйти. /kill — снова на террасу');
  }

  /** Разработка: передышка перед волной w (3 с), орда убрана; очки и жетоны не начисляются */
  jumpTo(w: number): void {
    if (!Number.isInteger(w) || w < 1 || w > FORT_WAVES || this.phase === FT_END) return;
    this.waveEvents.stop();
    this.horde.clear();
    this.wave = w - 1;
    this.cleared = w - 1;
    this.early = false;
    this.plan = null;
    this.card = this.planFor(w).card;
    this.setPhase(FT_BREAK, this.tick + 3 * TICK_RATE);
    this.systemChat(`🛠 Разработка: дальше волна ${w}`);
  }

  systemChat(text: string): void {
    this.broadcast(sysLine(text));
  }

  private privateChat(p: FortPlayer, text: string): void {
    p.sink.sendJson(sysLine(text));
  }

  broadcast(msg: ServerMsg): void {
    for (const p of this.players.values()) p.sink.sendJson(msg);
  }

  // ------------------------------------------------------------ тик

  step(): void {
    this.tick++;
    const tick = this.tick;
    if ((this.phase === FT_GATHER || this.phase === FT_BREAK) && tick >= this.phaseEnd) this.startWave();
    else if (this.phase === FT_END && tick >= this.phaseEnd) this.newGame();

    for (const p of this.players.values()) {
      this.processHuman(p);
      if (!p.alive && tick >= p.respawnTick) this.spawn(p);
    }
    this.regen();

    if (this.phase === FT_WAVE) {
      this.buildTargets();
      this.horde.step();
      this.waveEvents.step();
    }
    // гранаты летят всегда, башни бьют в волну
    this.arsenal.step();
    if (this.phase === FT_WAVE) {
      if (this.crystal <= 0) this.finish(false);
      else if (this.horde.cleared) this.endWave();
    }
    // голосование «сдаться»: вышло время — не прошло
    const timeUp = this.surr.step(tick);
    if (timeUp) this.surrenderStep(timeUp);

    if (tick % FORT_SNAP_EVERY === 0) this.sendSnapshots();
    if (this.rosterDirty && tick - this.rosterSentTick > 12) this.sendRoster();
    else if (tick - this.rosterSentTick > 2 * TICK_RATE) this.sendRoster();

    if (this.pendingAfk.length) {
      const list = this.pendingAfk;
      this.pendingAfk = [];
      for (const p of list) if (this.players.get(p.id) === p) this.hooks.afk?.(p);
    }
  }

  /** Для арки на набережной */
  status(): FortStatus {
    const names = [...this.players.values()].map((p) => p.name);
    const timed = this.phase === FT_GATHER || this.phase === FT_BREAK || this.phase === FT_END;
    // рекорд крепости — для таблички и подсказки у входа на набережной; live — его ставит игра, что идёт сейчас
    const top = (this.hooks.top?.() ?? [])[0];
    const rec = recView(top, !!top && top.id === this.runId && names.length > 0 && this.phase !== FT_END);
    return {
      phase: this.phase,
      wave: this.wave,
      humans: names.length,
      names: names.slice(0, 6),
      left: timed ? Math.max(0, Math.ceil((this.phaseEnd - this.tick) / TICK_RATE)) : 0,
      ...(rec ? { rec } : {}),
    };
  }

  private sendSnapshots(): void {
    const list = this.entityList;
    list.length = 0;
    const tick = this.tick;
    for (const p of this.players.values()) {
      const s = p.state;
      let flags = 0;
      if (p.alive) flags |= E_ALIVE;
      if (s.grounded) flags |= E_GROUNDED;
      if (s.dashT > 0) flags |= E_DASH;
      if (s.reloadT > 0) flags |= E_RELOAD;
      if (p.lastInput.buttons & BTN_ADS) flags |= E_ADS;
      if (p.firingUntil > tick) flags |= E_FIRING;
      // байт armor в крепости не нужен под броню — в нём ствол в руках (0 маркер, 1 дробовик, 2 арбалет, 3 пулемёт)
      list.push({ id: p.id, flags, x: s.x, y: s.y, z: s.z, yaw: p.lastInput.yaw, pitch: p.lastInput.pitch, hp: Math.max(0, p.hp), armor: gunInHands(s, p.load) });
    }
    const ents = encodeEntities(list);
    const nz = this.horde.snap(this.zsnap);
    // блок арсенала (башни, смола, ступени ворот и кристалла) — в хвост крепости отдельным блоком (FortTail.ext)
    this.arsenal.encodeTail(this.arTail, 0);
    this.tail.ext = this.arTail;
    const body = new Uint8Array(ents.length + fortTailSize(this.zsnap, nz, this.arTail.length));
    body.set(ents);
    const t = this.tail;
    t.gate = this.gate;
    t.crystal = this.crystal;
    t.defenders = this.phase === FT_WAVE ? this.horde.defenders : this.players.size;
    t.rally = this.phase === FT_WAVE ? Math.max(0, this.rallyUntil - this.tick) : 0;
    t.rallyCd = this.phase === FT_WAVE ? Math.max(0, this.rallyReady - this.tick) : 0;
    // старые краскомёты и варенье ушли: башни и смола — в блоке арсенала после зомби
    t.turrets = 0;
    t.jams = 0;
    t.left = this.phase === FT_WAVE ? this.horde.left : 0;
    t.wave = this.wave;
    t.event = this.phase === FT_WAVE ? this.plan?.event ?? EV_NONE : EV_NONE;
    t.mods = this.early ? FM_EARLY : 0;
    const ev = this.waveEvents;
    t.crate = this.phase === FT_WAVE ? ev.crate : CRATE_NONE;
    t.crateX = ev.crateX;
    t.crateZ = ev.crateZ;
    encodeFortTail(body, ents.length, t, this.zsnap, nz);
    const h = this.header;
    h.tick = tick;
    h.phase = this.phase;
    h.phaseEnd = this.phaseEnd;
    h.scoreA = this.wave;
    h.scoreB = this.cleared;
    h.pickups = 0;
    const evMsg: ServerMsg | null = this.events.length ? { t: 'fev', k: tick, e: this.events } : null;
    for (const p of this.players.values()) {
      h.ack = p.inq.ack;
      h.queue = p.inq.length;
      h.flags = p.selfReset ? SNAP_SELF_RESET : 0;
      p.selfReset = false;
      p.sink.sendBinary(encodeSnapshot(h, p.state, body));
      if (evMsg) p.sink.sendJson(evMsg);
    }
    this.events = [];
  }

  /** Состав изменился снаружи (наряд, золото) — разослать в ближайший тик. */
  touchRoster(): void {
    this.rosterDirty = true;
  }

  /**
   * Состав — сейчас же: покупка сменила ствол или прокачку. Уходит раньше снимка со сбросом предсказания, поэтому
   * клиент переигрывает свои входы уже с новым арсеналом.
   */
  flushRoster(): void {
    for (const p of this.players.values()) this.arsenal.loadout(p, p.load);
    this.sendRoster();
  }

  roster(): FortPlayerRow[] {
    return [...this.players.values()].map((p) => ({
      id: p.id, pid: p.pid, level: p.level, name: p.name, o: p.outfit, pts: Math.floor(p.run.arsenal.gold), k: p.kills, d: p.deaths, ready: p.ready,
      ping: Math.round(p.ping), ar: this.arsenal.row(p),
    }));
  }

  private sendRoster(): void {
    this.rosterDirty = false;
    this.rosterSentTick = this.tick;
    this.broadcast({ t: 'froster', players: this.roster() });
  }
}

/** 2 → II, 3 → III … (круг босса) */
function roman(n: number): string {
  const r = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  return r[n] ?? String(n);
}

function sysLine(text: string): ServerMsg {
  return { t: 'chat', from: '', pid: 0, room: 'fort', team: -1, text, sys: true };
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
