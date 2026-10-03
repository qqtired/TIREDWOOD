// Комната «набережная»: ходьба (та же физика, что в пейнтболе, только без стрельбы), столы дурака в кафе,
// скамейки, автоматы, эмоции и жесты вдвоём, фото у маяка, мяч на площади, рыбалка с мостков, примерочная, вход
// на склад, круг «Старт» у гаража, катер «Ласточка» (поездка по бухте), аквапарк, колесо обозрения. Снимки — 30 раз
// в секунду (мяч — в них же, целиком, после списка игроков).
import { AQUA_NEAR_X, AQUA_RESPAWN, addRecord, aquaFall, aquaMs, fmtAquaTime } from '../../shared/aqua.ts';
import { AQUA_QUEUE, AQUA_WAIT, AquaDyn, aquaClock } from '../../shared/aquadyn.ts';
import { BALL_BYTES, BALL_KICK_TICKS, makeBall, stepBall, touchBall, writeBall, type Ball } from '../../shared/ball.ts';
import { BARKAS_LANDING, SANYA_PRICE, barkasLanding, barkasWater } from '../../shared/barkas.ts';
import { BJ_TABLE } from '../../shared/blackjack.ts';
import { BOAT_FLOOR_Y, BOAT_PRICE, BOAT_RIDE_TICKS, BP_BOARD, BP_RIDE, LAUNCH, ridePose, seatAt, type BoatPose } from '../../shared/boat.ts';
import { HIDE_CAPACITY, HIDE_MIN } from '../../shared/hide.ts';
import { RG_GATHER_TICKS, RG_MAX } from '../../shared/regatta.ts';
import { COYOTE_TICKS, DROWN_Y, TICK_RATE, WATER_Y } from '../../shared/constants.ts';
import { FC_CHECK_EVERY, FC_SPAWN } from '../../shared/fight.ts';
import {
  FE_AWAY, FE_BACK, FE_BOARD, FE_HOME, FE_OUT, FERRY_AWAY, FERRY_FLOOR_Y, FERRY_HOME, FERRY_HOME_LANDING, FERRY_HOME_SPOTS, FERRY_LEVEL,
  ferryEta, ferryPose, ferrySeat, inFerry, type FerryPose,
} from '../../shared/ferry.ts';
import { FISH_NPCS } from '../../shared/fishplaces.ts';
import { FISH_XP_LEVELS, fishLevel } from '../../shared/fishprogress.ts';
import { RC_LAPS, RC_MAX_KARTS } from '../../shared/kart.ts';
import { JUKE_PRICE, JUKE_RATE_MS, JUKE_SERVER_R, JUKE_SONGS, JUKE_USE, fmtSongTime } from '../../shared/jukebox.ts';
import {
  ACT_BOAT, ACT_DANCE, ACT_DURAK, ACT_FERRY, ACT_FERRY_RIDE, ACT_FISH, ACT_LAUGH, ACT_NONE, ACT_REGATTA, ACT_RESPECT, ACT_RIDE, ACT_SIT, ACT_SLOT, ACT_WARDROBE, ACT_WAVE,
  ACT_WHEEL, EMOTE_TICKS, KART_CHECK_EVERY, KART_COUNT_TICKS, LOBBY_CAPACITY, LOBBY_SNAP_EVERY, PAIR_ACCEPT_RANGE, PAIR_ACTS, PAIR_ASK_TICKS, PAIR_TICKS, STOP_EMOTE,
  holdMask, isAboard, isFerry, isHeld,
  isPair, isRiding, pairReach, stepHeld,
} from '../../shared/lobby.ts';
import { BOAT_RACE_CIRCLE, HIDE_CIRCLE, KART_START, LOBBY_SEAT_COUNT, buildLobby, seatTable, type Interactable, type LobbyMap } from '../../shared/maps/lobby.ts';
import type { AquaRow, ClientMsg, KartStatus, LobbyEvent, LobbyPlayerInfo, RoomKind, ServerMsg } from '../../shared/messages.ts';
import { DEFAULT_OUTFIT, itemById, sameOutfit, withItem } from '../../shared/outfit.ts';
import { gearOnly } from '../../shared/fishstyle.ts';
import { RESPECT_COUNT_MS, RESPECT_TICKS, respectReach } from '../../shared/respect.ts';
import { E_ALIVE, E_DASH, E_GROUNDED, SNAP_SELF_RESET, encodeEntities, encodeSnapshot, makeHeader, type EntitySnap } from '../../shared/protocol.ts';
import { DEFAULT_TRACK, isRaceTrackId, nextRaceTrack, raceTrackName, type RaceTrackId } from '../../shared/racecourse.ts';
import { inStartCircle, START_DWELL_TICKS, START_ZONES, type StartZoneKind } from '../../shared/startzones.ts';
import { stormInput, stormPush } from '../../shared/stormdyn.ts';
import { pirateInput, piratePush } from '../../shared/pirates.ts';
import { pirateTailSize, writePirateTail } from '../../shared/piratenet.ts';
import {
  BTN_DASH, BTN_FIRE, BTN_JUMP, BTN_RELOAD, BTN_USE, makeEvents, makeInput, makeState, type Input, type PlayerState, type StepEvents,
} from '../../shared/sim.ts';
import { BIG_WIN_MULT, MACHINE_NAMES, SPIN_MS, SPIN_TICKS } from '../../shared/slots.ts';
import { WHEEL_EXIT, WHEEL_PERIOD, WHEEL_PRICE, CABIN_STEP, bottomCabin, seatAt as wheelSeatAt } from '../../shared/wheel.ts';
import { CollisionWorld } from '../../shared/world.ts';
import { FightGather } from '../fight/gather.ts';
import type { Client, Hub, Room } from '../hub.ts';
import { InputQueue } from '../inputs.ts';
import { AquaRuns } from './aqua.ts';
import { BoatRide } from './boat.ts';
import { FerryRide, sanyaHome } from './ferry.ts';
import { BlackjackHall } from './blackjack.ts';
import { LobbyEvents, type EventHost } from './events.ts';
import { Storm } from './storm.ts';
import { Pirates } from './pirates.ts';
import { ModeQueue, syncCircleMembers } from './modequeue.ts';
import { Regatta } from './regatta.ts';
import { DurakHall } from './durak.ts';
import { FishingHall, type FishingHost } from './fishing.ts';
import { FishingHall2 } from './fishing2.ts';
import { FishNpc, type NpcCtx, type NpcResult, type NpcWho } from './fishnpc.ts';
import { RouletteTable, atRoulette, type RouletteWho } from './roulette.ts';
import { Jukebox } from './jukebox.ts';
import { Weather, type WeatherMode } from './weather.ts';
import { SlotHall } from './slots.ts';
import { WheelRide } from './wheel.ts';

const ONE_SHOT = BTN_FIRE | BTN_JUMP | BTN_DASH | BTN_RELOAD | BTN_USE;
/** «Болеть» у табло — с одного игрока не чаще раза в 4 с */
const CHEER_MS = 4000;
/** Фото у маяка: отсчёт 3 с и вспышка — следующее не раньше чем через 4 с */
const PHOTO_TICKS = 4 * TICK_RATE;
/** Куда на причал ставят того, кто стоял в катере без места, когда тот отплыл (между скамейкой и столбиком таблички) */
const BOAT_DOCK_Z = 20.6;

/** Приглашение на жест вдвоём: кого позвал, какой жест, до какого тика ждёт */
interface PairAsk {
  to: number;
  k: number;
  until: number;
}

export class LobbyPlayer {
  /** Номер в снимке (1…250) */
  readonly slot: number;
  readonly client: Client;
  readonly state: PlayerState = makeState();
  readonly ev: StepEvents = makeEvents();
  readonly inq = new InputQueue();
  readonly lastInput: Input = makeInput();
  action = ACT_NONE;
  menuOpen = false;
  arg = 0;
  /** Тик, когда кончится эмоция (0 — сама не кончится) */
  actionUntil = 0;
  /** Куда смотрит сидящий или стоящий у автомата */
  heldYaw = 0;
  /** Раньше этого тика мяч не пнёт */
  kickAt = 0;
  selfReset = true;
  /** Аквапарк: время препятствий прошлого шага (shared/aquadyn.ts; от него едет стоящий на пароме) и толкнуло ли в нём */
  aquaT = 0;
  knocked = false;

  constructor(slot: number, client: Client) {
    this.slot = slot;
    this.client = client;
  }
}

export class LobbyRoom implements Room {
  readonly kind = 'lobby' as const;
  readonly map: LobbyMap;
  readonly world: CollisionWorld;
  readonly slots: SlotHall;
  readonly durak: DurakHall;
  readonly blackjack: BlackjackHall;
  readonly storm: Storm | null;
  readonly pirates: Pirates | null;
  readonly director: LobbyEvents;
  /** Круг сбора регаты у пирса и сама «Портовая регата» (null — флаг BOATRACE выключен) */
  private readonly boatQueue: ModeQueue<LobbyPlayer> | null;
  readonly regatta: Regatta | null;
  private readonly hideQueue: ModeQueue<LobbyPlayer> | null;
  private boatShown = '';
  private hideShown = '';
  readonly fishing: FishingHall;
  /** Рыбалка 2.0 (флаг сервера FISH2): null — старая рыбалка */
  readonly fishing2: FishingHall2 | null;
  /** Семён и Саня: задания, лавка, продажа улова (с рыбалкой 2.0); register — свои действия других модулей */
  readonly fishNpc: FishNpc | null;
  /** Рулетка рыбака (флаг сервера ROULETTE) */
  readonly roulette: RouletteTable | null;
  readonly weather: Weather;
  tick = 0;
  private readonly hub: Hub;
  private readonly players = new Map<number, LobbyPlayer>();
  private readonly byClient = new Map<Client, LobbyPlayer>();
  /** Кто сидит на месте: номер игрока в снимке, 0 — свободно */
  private readonly seats: number[] = new Array<number>(LOBBY_SEAT_COUNT).fill(0);
  private events: LobbyEvent[] = [];
  private readonly entityList: EntitySnap[] = [];
  private readonly header = makeHeader();
  private poolDirty = false;
  /** После джекпота банк не показываем, пока у всех не докрутятся барабаны */
  private poolHoldUntil = 0;
  private honorDirty = false;
  private honorSentTick = 0;
  /** Кто стоит в круге «Старт» — по порядку входа (Set хранит порядок) */
  private readonly circle = new Set<LobbyPlayer>();
  private readonly starts = new Map<LobbyPlayer, { armed: boolean; zone: StartZoneKind | null; since: number; shown: string }>();
  /** Тик конца отсчёта до гонки (0 — отсчёта нет) */
  private kartCountEnd = 0;
  private kartTrack: RaceTrackId = DEFAULT_TRACK;
  private kartShown = '';
  /** Табло: последние разосланные позиции картов строкой — шлём, только если поменялись */
  private kposShown = '';
  /** Приглашения на жест вдвоём — по номеру позвавшего (у каждого не больше одного) */
  private readonly asks = new Map<number, PairAsk>();
  /** До этого тика фотоаппарат у маяка занят (идёт отсчёт) */
  private photoUntil = 0;
  /** Мяч на площади — один на всех */
  readonly ball: Ball = makeBall();
  /** Катер «Ласточка»: места, посадка, поездка */
  readonly boat = new BoatRide();
  private readonly boatPose: BoatPose = { x: LAUNCH.x, z: LAUNCH.z, yaw: LAUNCH.yaw };
  private readonly seatTmp = { x: 0, z: 0 };
  /** Аквапарк «Волна»: у кого идёт забег (shared/aqua.ts) */
  readonly aqua = new AquaRuns();
  /** Аквапарк: подвижные площадки и толчки в шаге игрока (у каждого — по времени его входа) */
  readonly aquaDyn: AquaDyn;
  /** Лодка Семёна «Удалая»: рейсы к баркасу «Альбатрос» и обратно (shared/ferry.ts) */
  readonly ferry = new FerryRide();
  private readonly ferryPoseTmp: FerryPose = { x: FERRY_HOME.x, z: FERRY_HOME.z, yaw: FERRY_HOME.yaw };
  /** Колесо обозрения: кто в какой кабинке (shared/wheel.ts) */
  readonly wheel = new WheelRide();
  private readonly wheelTmp = { x: 0, y: 0, z: 0, yaw: 0 };
  private readonly now: () => number;
  /** Общие тики хаба для погоды: продолжаются даже при пустой набережной. */
  private weatherTick = 0;
  /** Круг у двери «Fight Club» (server/fight/gather.ts) — только если режим включён флагом */
  private readonly fc: FightGather<LobbyPlayer> | null;
  /** Включённая рыбалка — места, заброс и подсечка у обеих одинаковые */
  private readonly fish: FishingHall | FishingHall2;
  /** Музыкальный автомат на площади (флаг сервера JUKEBOX): null — его нет */
  readonly juke: Jukebox | null;

  constructor(hub: Hub, roll?: () => number, now?: () => number, durakDeck?: () => number[], weather: WeatherMode = 'auto', blackjackDeck?: () => number[], eventOptions: { storm?: boolean; pirates?: boolean; devStorm?: boolean; devPirates?: boolean; jukebox?: boolean } = {}) {
    this.hub = hub;
    this.now = now ?? Date.now;
    this.weather = new Weather(Math.random, weather, 0, this.now);
    this.map = buildLobby();
    this.world = new CollisionWorld(this.map);
    if (!hub.skill) for (const box of this.map.skillPortalBoxes) this.world.setEnabled(box, false);
    this.ferryBoxes();
    this.regatta = hub.boatrace ? new Regatta({
      tick: () => this.tick,
      players: () => this.players.values(),
      board: (p, id) => {
        this.release(p);
        p.action = ACT_REGATTA;
        p.arg = id;
        p.actionUntil = 0;
        p.selfReset = true;
      },
      unboard: (p) => {
        if (p.action === ACT_REGATTA) {
          p.action = ACT_NONE;
          p.arg = 0;
        }
        const s = this.map.boatraceSpawn;
        this.placeNear(p, s.x, s.z, s.yaw);
      },
      follow: (p, s) => {
        const st = p.state;
        st.x = s.x;
        st.z = s.z;
        // на сиденье катера (на воде; в прыжке с трамплина — выше)
        st.y = WATER_Y + 0.6 + s.y;
        st.vx = st.vy = st.vz = 0;
        p.heldYaw = Math.atan2(-s.hx, -s.hz);
      },
      outfit: (p) => (p.client.profile ? hub.outfitOf(p.client.profile) : { ...DEFAULT_OUTFIT }),
      level: (p) => p.client.profile?.level ?? 1,
      send: (p, msg) => p.client.sink.sendJson(msg),
      broadcast: (msg) => this.broadcast(msg),
      toast: (p, text) => hub.toast(p.client, text),
      announce: (text) => hub.announce(text),
      settle: (pid, row) => hub.onRegattaResult(pid, row),
      record: (pid, nick, ticks) => {
        const place = hub.regattaRecord(pid, nick, ticks);
        if (place >= 0) this.broadcast({ t: 'rgTop', top: hub.regattaTop() });
        return place;
      },
      bestLap: (p) => p.client.profile?.stats.brBestLapHarbor ?? 0,
      queue: (n) => this.boatQueue?.take(n) ?? [],
    }) : null;
    this.juke = eventOptions.jukebox ? new Jukebox() : null;
    if (!this.juke) for (const box of this.map.jukeBoxes) this.world.setEnabled(box, false);
    this.boatQueue = this.regatta ? new ModeQueue({ center: BOAT_RACE_CIRCLE, min: 1, max: RG_MAX, ticks: RG_GATHER_TICKS,
      players: () => this.players.values(), inside: p => !p.client.ephemeral && !isHeld(p.action) && !p.menuOpen,
      nick: p => p.client.nick, position: p => p.state, idle: () => this.regatta!.phase === 'idle', start: players => this.regatta!.begin(players),
    }) : null;
    this.hideQueue = hub.hide ? new ModeQueue({ center: HIDE_CIRCLE, min: () => Math.max(1,HIDE_MIN-hub.hide!.humans), max: HIDE_CAPACITY, ticks: KART_COUNT_TICKS,
      players: () => this.players.values(), inside: p => !p.client.ephemeral && !isHeld(p.action) && !p.menuOpen,
      nick: p => p.client.nick, position: p => p.state, idle: () => !hub.hide!.active && hub.hide!.hasSpace(), start: players => hub.startHide(players.map(p => p.client)),
    }) : null;
    const eventHost: EventHost = {
      players: () => [...this.players.values()].map(p => ({ pid: p.client.pid, slot: p.slot, nick: p.client.nick, state: p.state, eligible: !p.client.ephemeral && !isHeld(p.action) && !p.menuOpen })),
      chat: text => hub.announce(text),
      award: (pid, tokens, stats) => {
        const profile = hub.profiles.byId(pid);
        if (!profile) return;
        if (tokens > 0) hub.profiles.credit(profile, tokens, 'mode');
        for (const key of ['stStorms','stLights','prRaids','prWins','prKos'] as const) profile.stats[key] += stats[key] ?? 0;
        hub.store.markDirty(); this.syncBlackjackBalance(pid);
      },
    };
    this.storm = eventOptions.storm ? new Storm({ ...eventHost, broadcast: v => this.broadcast({ t: 'storm', v }) }) : null;
    this.pirates = eventOptions.pirates ? new Pirates({ ...eventHost, broadcast: v => this.broadcast({ t: 'pirates', v }) }, this.map, this.world) : null;
    this.director = new LobbyEvents({ storm: this.storm, pirates: this.pirates, now: this.now, humans: () => this.humans,
      rain: () => this.weather.rain, meta: hub.store.state.lobbyEvents, devStorm: eventOptions.devStorm, devPirates: eventOptions.devPirates,
      save: meta => { hub.store.state.lobbyEvents = meta; hub.store.markDirty(); hub.store.flush(); },
    });
    if (!hub.fish2) for (const box of this.map.fishPropsBoxes) this.world.setEnabled(box, false);
    this.fc = hub.fight
      ? new FightGather<LobbyPlayer>({
        players: () => this.players.values(),
        toast: (c, text) => hub.toast(c, text),
        broadcast: (msg) => this.broadcast(msg),
        fight: () => hub.fight?.status() ?? null,
        start: (fighters, crowd, mode) => hub.startFight(fighters, crowd, mode),
        watch: (c) => hub.watchFight(c),
      })
      : null;
    this.aquaDyn = new AquaDyn(this.world, this.map.aquaMovers);
    this.slots = new SlotHall(hub.profiles, hub.store, roll, now);
    this.durak = new DurakHall({
      send: (slot, msg) => this.players.get(slot)?.client.sink.sendJson(msg),
      broadcast: (msg) => this.broadcast(msg),
      event: (e) => this.events.push(e),
      toast: (slot, text) => {
        const p = this.players.get(slot);
        if (p) hub.toast(p.client, text);
      },
      finished: (r) => hub.onDurakGame(r),
      balance: (pid) => hub.profiles.byId(pid)?.tokens ?? 0,
      reserve: (round, bets) => {
        const accepted = hub.profiles.reserveDurakBatch(round, bets);
        if (accepted) for (const bet of bets) this.syncBlackjackBalance(bet.pid);
        return accepted;
      },
      settle: (round, payouts) => {
        const accepted = hub.profiles.settleDurak(round, payouts);
        if (accepted) for (const payout of payouts) this.syncBlackjackBalance(payout.pid);
        return accepted;
      },
    }, { deck: durakDeck, allowedTables: [0, 1] });
    this.blackjack = new BlackjackHall({
      broadcast: (v) => this.broadcast({ t: 'blackjack', v }),
      toast: (slot, text) => {
        const p = this.players.get(slot);
        if (p) this.rejectBlackjack(p.client, text);
      },
      reserve: (pid, round, amount) => {
        const accepted = hub.profiles.reserveBlackjack(pid, round, amount);
        if (accepted) this.syncBlackjackBalance(pid);
        return accepted;
      },
      settle: (pid, round, wager, payout) => {
        const accepted = hub.profiles.settleBlackjack(pid, round, wager, payout);
        if (accepted) this.syncBlackjackBalance(pid);
        return accepted;
      },
    }, { deck: blackjackDeck });
    const fishHost: FishingHost = {
      event: (e) => this.events.push(e),
      who: (slot) => {
        const c = this.players.get(slot)?.client;
        return c?.profile ? { profile: c.profile, nick: c.nick, ping: c.ping } : null;
      },
      send: (slot, msg) => this.players.get(slot)?.client.sink.sendJson(msg),
      toast: (slot, text) => {
        const p = this.players.get(slot);
        if (p) hub.toast(p.client, text);
      },
      changed: (slot) => {
        const c = this.players.get(slot)?.client;
        if (!c?.profile) return;
        hub.tokens(c, c.profile.tokens);
        hub.sendMe(c);
        this.honorDirty = true;
      },
      announce: (text) => hub.announce(text),
    };
    this.fishing = new FishingHall(fishHost, hub.profiles, hub.store);
    this.fishing2 = hub.fish2
      ? new FishingHall2({
        ...fishHost, rain: () => this.weather.rain, top: (top) => this.broadcast({ t: 'fishTop', top }),
        outfit: (slot) => {
          const c = this.players.get(slot)?.client;
          if (c?.profile && !c.ephemeral) this.broadcast({ t: 'outfitOf', id: slot, o: hub.outfitOf(c.profile) });
        },
      }, hub.profiles, hub.store, this.now)
      : null;
    this.fish = this.fishing2 ?? this.fishing;
    this.fishNpc = this.fishing2 ? new FishNpc({
      now: this.now,
      limit: (key) => hub.limits.hit(`fishNpc:${key}`, 6, 1000),
      changed: (who) => {
        const c = hub.clientOf(who.profile.id);
        if (c) { hub.tokens(c, who.profile.tokens); hub.sendMe(c); }
        this.honorDirty = true;
      },
      rainState: () => {
        if (this.director.busy) return 'busy';
        if (this.weather.step(this.weatherTick)) this.publishWeather();
        return this.weather.rain ? 'on' : 'off';
      },
      startRain: () => {
        this.weather.startRain(this.weatherTick);
        this.publishWeather();
      },
    }, hub.profiles) : null;
    // Саня на баркасе: «Домой, к Семёну» — своё действие в разговоре (близость и частоту уже проверил FishNpc)
    this.fishNpc?.register('ferry', (ctx) => this.onSanyaFerry(ctx));
    this.roulette = hub.roulette ? new RouletteTable({
      now: this.now,
      nearby: () => [...this.players.values()].flatMap((p) => p.client.profile && !p.client.ephemeral && atRoulette(p.state.x, p.state.y, p.state.z) ? [this.rouletteWho(p)!] : []),
      send: (pid, msg) => hub.clientOf(pid)?.sink.sendJson(msg),
      broadcast: (msg) => this.broadcast(msg),
      toast: (pid, text) => {
        const c = hub.clientOf(pid);
        if (c) hub.toast(c, text);
      },
      announce: (text) => hub.announce(text),
      changed: (pid) => {
        const c = hub.clientOf(pid);
        if (c?.profile) { hub.tokens(c, c.profile.tokens); hub.sendMe(c); }
        this.honorDirty = true;
      },
    }, hub.profiles) : null;
  }

  private npcWho(p: LobbyPlayer): NpcWho | null {
    const c = p.client;
    if (!c.profile || c.ephemeral) return null;
    return { key: String(c.id), profile: c.profile, x: p.state.x, y: p.state.y, z: p.state.z, send: (msg) => c.sink.sendJson(msg) };
  }

  private rouletteWho(p: LobbyPlayer): RouletteWho | null {
    const c = p.client;
    if (!c.profile || c.ephemeral) return null;
    return { pid: c.profile.id, nick: c.nick, profile: c.profile, x: p.state.x, y: p.state.y, z: p.state.z };
  }

  get humans(): number {
    return this.players.size;
  }

  hasSpace(): boolean {
    return this.players.size < LOBBY_CAPACITY;
  }

  playerOf(c: Client): LobbyPlayer | undefined {
    return this.byClient.get(c);
  }

  seatOwner(seat: number): number {
    return this.seats[seat] ?? 0;
  }

  // ------------------------------------------------------------ вход/выход

  join(c: Client, from: RoomKind | null): boolean {
    if (!c.profile || this.byClient.has(c) || !this.hasSpace()) return false;
    // Цикл спит без игроков: истёкшее событие завершаем до приветствия вернувшемуся игроку.
    const weatherChanged = (!this.director.busy || this.weather.rain) && this.weather.step(this.weatherTick);
    if (weatherChanged) this.publishWeather();
    let slot = 1;
    while (this.players.has(slot) && slot < 250) slot++;
    if (this.players.has(slot)) return false;
    const p = new LobbyPlayer(slot, c);
    this.players.set(slot, p);
    this.byClient.set(c, p);
    const spot = from === 'paintball' ? this.map.gateSpawn : from === 'race' ? this.map.garageSpawn : from === 'hide' ? this.map.hideSpawn : from === 'skill' ? this.map.skillSpawn : from === 'fort' ? this.map.fortSpawn : from === 'fight' ? FC_SPAWN : this.map.spawn;
    this.placeNear(p, spot.x, spot.z, spot.yaw);
    this.starts.set(p, { armed: this.startZoneAt(p) === null, zone: null, since: 0, shown: '' });
    c.sink.sendJson({
      t: 'lobby', id: slot, tick: this.tick, yaw: spot.yaw, players: this.infos(), pool: Math.floor(this.hub.store.state.jackpot),
      pb: this.hub.pbStatus(), honor: this.hub.honor(), tables: this.durak.views(), blackjack: this.blackjack.view(), ...(this.hub.skill ? { skill: this.hub.skill.status() } : {}), kart: this.kartStatus(), fish: this.fish.views(),
      rain: this.weather.rain ? 1 : 0, ...(this.weather.rain ? { wx: this.weather.wire } : {}), respects: this.hub.store.state.respects, boat: this.boat.status(), ferry: this.ferry.status(), aqua: this.aquaRows(),
      losers: this.slots.losers.top, ...(this.hub.fort ? { fort: this.hub.fort.status() } : {}), ...(this.fc ? { fc: this.fc.status() } : {}),
      ...(this.fishing2 ? { fish2: 1, ftop: this.fishing2.board.top } : {}),
      ...(this.roulette ? { roulette: this.roulette.view() } : {}),
      ...(this.regatta && this.boatQueue ? { regatta: { v: this.regatta.view(), q: this.boatQueue.view(this.tick), top: this.hub.regattaTop() } } : {}),
      ...(this.hideQueue ? { hide: this.hideStatus()! } : {}),
    });
    if (this.fishing2 && from === null && !weatherChanged) c.sink.sendJson({ t: 'fishEvent', on: this.weather.rain, until: this.weather.eventUntil });
    if (this.storm) c.sink.sendJson({ t: 'storm', v: this.storm.view() });
    if (this.pirates) c.sink.sendJson({ t: 'pirates', v: this.pirates.view() });
    // музыкальный автомат: что играет и с какого места (вошедшему позже — то же место песни, что у всех)
    if (this.juke) {
      if (this.juke.step(this.now())) this.broadcastJuke();
      else c.sink.sendJson({ t: 'juke', v: this.juke.view(this.now()) });
    }
    const kpos = this.hub.race.positions();
    if (kpos) c.sink.sendJson({ t: 'kpos', p: kpos });
    // экран с чатом друзей из Telegram на крыше склада — всё, что на нём сейчас (дальше — только новое)
    if (this.hub.tg) c.sink.sendJson({ t: 'tg', ...this.hub.tg.view() });
    if (!c.ephemeral) this.broadcastRoster();
    return true;
  }

  leave(c: Client): void {
    const p = this.byClient.get(c);
    if (!p) return;
    this.release(p, true);
    this.aqua.drop(p.slot);
    this.circle.delete(p);
    this.boatQueue?.drop(p);
    this.hideQueue?.drop(p);
    this.starts.delete(p);
    if (!this.circle.size) { this.kartTrack = DEFAULT_TRACK; this.kartCountEnd = 0; }
    this.fc?.drop(p);
    this.byClient.delete(c);
    this.players.delete(p.slot);
    // номер освободился: его приглашения и приглашения ему — снимаем (номер может достаться другому)
    this.dropAsk(p.slot);
    for (const [from, a] of this.asks) if (a.to === p.slot) this.asks.delete(from);
    if (!c.ephemeral) this.broadcastRoster();
  }

  onRename(c: Client): void {
    // «Топ проигравших» — с новым ником, если он там есть (сменить ник можно и не с набережной)
    const losers = this.slots.losers.refresh();
    if (losers) this.broadcast({ t: 'losers', top: losers });
    // и на доске рекордов рыбалки 2.0
    this.fishing2?.renamed();
    this.blackjack.rename(c.pid, c.nick);
    if (!this.byClient.has(c)) return;
    this.broadcastRoster();
    this.durak.rename(c.pid, c.nick);
    // на доске рекордов аквапарка — новый ник
    const row = this.hub.store.state.aqua.find((r) => r.pid === c.pid);
    if (row && row.nick !== c.nick) {
      row.nick = c.nick;
      this.hub.store.markDirty();
      this.broadcast({ t: 'aquaTop', top: this.aquaRows() });
    }
    // и на доске бухты, и в заезде регаты
    const rg = this.hub.store.state.regatta.find((r) => r.pid === c.pid);
    if (rg && rg.nick !== c.nick) {
      rg.nick = c.nick;
      this.hub.store.markDirty();
      if (this.regatta) this.broadcast({ t: 'rgTop', top: this.hub.regattaTop() });
    }
    this.regatta?.refresh(this.byClient.get(c)!);
  }

  /** Наряд, который видят все, поменялся (колпак дурака надели или сняли). */
  outfitChanged(c: Client): void {
    const p = this.byClient.get(c);
    if (p && c.profile && !c.ephemeral) this.broadcast({ t: 'outfitOf', id: p.slot, o: this.hub.outfitOf(c.profile), level: c.profile.level });
    if (p) this.regatta?.refresh(p);
  }

  // ------------------------------------------------------------ сообщения

  onInputs(c: Client, inputs: Input[], count: number): void {
    const p = this.byClient.get(c);
    // на полосе аквапарка и в регате очередь длиннее: после лаг-спайка сервер проходит все шаги игрока, а не последние
    if (p) p.inq.push(inputs, count, p.action === ACT_REGATTA || aquaFall(p.state.x) ? AQUA_QUEUE : undefined);
  }

  onMessage(c: Client, msg: ClientMsg): void {
    const p = this.byClient.get(c);
    if (!p) return;
    switch (msg.t) {
      case 'lobbyMenu':
        if (typeof msg.open === 'boolean') p.menuOpen = msg.open;
        return;
      case 'stormLight':
        if (this.hub.limits.hit(`stormLight:${c.id}`, 4, 1000)) this.storm?.light(c.pid);
        return;
      case 'use':
        this.onUse(p, msg.id);
        return;
      case 'unuse':
        this.release(p);
        return;
      case 'emote':
        this.onEmote(p, msg.e);
        return;
      case 'pair':
        this.onPair(p, msg.k);
        return;
      case 'spin':
        this.onSpin(p);
        return;
      case 'respect':
        this.onRespect(p);
        return;
      case 'outfit':
        this.onOutfit(p, msg.o);
        return;
      case 'buy':
        this.onBuy(p, msg.item);
        return;
      case 'durak':
        if (p.action === ACT_DURAK && seatTable(p.arg) !== BJ_TABLE && msg.table === seatTable(p.arg)) this.durak.act(p.arg, p.slot, msg.a, msg.card, msg.on);
        return;
      case 'blackjack':
        if (c.ephemeral || p.action !== ACT_DURAK || msg.table !== BJ_TABLE || seatTable(p.arg) !== BJ_TABLE) this.rejectBlackjack(c, 'Сначала сядь за стол блэкджека.');
        else this.blackjack.act(p.arg, p.slot, msg.a, msg.rev, msg.amount);
        return;
      case 'kartTrack':
        this.chooseKartTrack(p, msg.track);
        return;
      case 'juke':
        this.onJuke(p, msg.song);
        return;
      case 'fish':
        if (p.action === ACT_FISH && this.hub.limits.hit(`fish:${c.id}`, 6, 1000)) this.fish.act(p.arg, p.slot, msg.a, msg.n, this.tick);
        return;
      case 'fishNpc': {
        const who = this.npcWho(p);
        if (who && this.fishNpc) this.fishNpc.handle(who, msg);
        return;
      }
      case 'fishBag': {
        const who = this.npcWho(p);
        if (who && this.fishNpc && msg.a === 'release') this.fishNpc.release(who, msg.n);
        return;
      }
      case 'roulette': {
        const who = this.rouletteWho(p);
        if (who && this.roulette && msg.a === 'bet' && this.hub.limits.hit(`roulette:${c.id}`, 4, 1000)) this.roulette.bet(who, msg.c);
        return;
      }
      case 'rg':
        if (msg.a === 'quit') this.regatta?.quit(p);
        return;
      case 'reel':
        // шкала вываживания: свой лимит (клиент шлёт до 20 в секунду, после замирания связи — пачкой)
        if (p.action === ACT_FISH && this.fishing2 && this.hub.limits.hit(`reel:${c.id}`, 60, 1000)) {
          this.fishing2.reel(p.arg, p.slot, msg.i, msg.k, msg.u, msg.d, this.tick);
        }
        return;
    }
  }

  private rejectBlackjack(c: Client, message: string): void {
    const v = this.blackjack.view();
    c.sink.sendJson({ t: 'blackjackError', message, rev: v.rev });
    c.sink.sendJson({ t: 'blackjack', v });
  }

  /** Settlement belongs to the profile, including after leaving this room or reusing its slot. */
  private syncBlackjackBalance(pid: number): void {
    for (const c of this.hub.clients) {
      if (c.closed || c.ephemeral || c.profile?.id !== pid) continue;
      this.hub.tokens(c, c.profile.tokens);
      this.hub.sendMe(c);
    }
  }

  private onUse(p: LobbyPlayer, id: unknown): void {
    const c = p.client;
    // в поездке на катере и на колесе — только смотреть по сторонам
    if (isRiding(p.action) || !this.hub.limits.hit(`use:${c.id}`, 4, 1000)) return;
    const it = typeof id === 'number' && Number.isInteger(id) ? this.map.interact[id] : undefined;
    if (!it) return;
    const s = p.state;
    if (Math.hypot(s.x - it.x, s.z - it.z) > it.r + 0.5 || Math.abs(s.y - it.y) >= 2) return;
    switch (it.kind) {
      case 'slot': {
        const mc = this.slots.machines[it.arg];
        if (mc.occupant !== 0 && mc.occupant !== p.slot) {
          this.hub.toast(c, 'Автомат занят — подожди или выбери другой');
          return;
        }
        this.release(p);
        this.slots.occupy(it.arg, p.slot, this.tick);
        this.hold(p, ACT_SLOT, it);
        return;
      }
      case 'seat': {
        const who = this.seats[it.arg];
        if (who !== 0 && who !== p.slot) {
          this.hub.toast(c, 'Место занято');
          return;
        }
        this.release(p);
        this.seats[it.arg] = p.slot;
        this.hold(p, ACT_SIT, it);
        return;
      }
      case 'durak':
      case 'blackjack': {
        if (c.ephemeral || this.seats[it.arg] === p.slot) return;
        const hall = seatTable(it.arg) === BJ_TABLE ? this.blackjack : this.durak;
        if (this.seats[it.arg] !== 0 || !hall.canSit(it.arg, c.pid)) {
          this.hub.toast(c, 'Место занято');
          return;
        }
        this.release(p);
        this.seats[it.arg] = p.slot;
        this.hold(p, ACT_DURAK, it);
        hall.sit(it.arg, p.slot, c.pid, c.nick);
        return;
      }
      case 'kiosk':
        this.release(p);
        this.hold(p, ACT_WARDROBE, it);
        return;
      case 'pb_gate':
        if (!this.hub.paintball.hasSpace()) {
          this.hub.toast(c, 'На складе нет мест — подожди немного');
          return;
        }
        this.hub.move(c, this.hub.paintball);
        return;
      case 'garage':
        this.chooseKartTrack(p, nextRaceTrack(this.kartTrack));
        return;
      case 'skill':
        if (!this.hub.skill) return;
        if (!this.hub.skill.hasSpace()) this.hub.toast(c, 'На полосе уже пять игроков — подожди свободное место.');
        else this.hub.move(c, this.hub.skill);
        return;
      case 'boatrace':
        if (this.regatta) this.hub.toast(c, this.regatta.phase === 'idle' ? 'Стой в круге — через 10 секунд катера на старте у арки.' : 'Регата идёт — стой в круге, поедешь в следующем заезде.');
        return;
      case 'hide':
        if (this.hub.hide?.active) {
          if (this.hub.hide.hasSpace()) this.hub.move(c, this.hub.hide);
          else this.hub.toast(c, 'В прятках уже восемь игроков — подожди свободное место.');
        } else if (this.hideQueue) this.hub.toast(c, 'Встаньте в круг хотя бы вдвоём — прятки начнутся автоматически.');
        return;
      case 'honor':
        return;
      case 'kboard':
        this.onCheer(p);
        return;
      case 'photo':
        this.onPhoto(p);
        return;
      case 'boat':
        this.onBoat(p);
        return;
      case 'ferry':
        this.onFerry(p, it.arg);
        return;
      case 'wheel':
        this.onWheel(p);
        return;
      case 'fort':
        // режим выключен флагом — точки как бы нет
        if (this.hub.fort) this.hub.enterFort(c);
        return;
      case 'fight':
        // режим выключен флагом — точки как бы нет
        this.fc?.use(p);
        return;
      case 'fish': {
        if (c.ephemeral) return;
        const who = this.fish.occupant(it.arg);
        if (who === p.slot) return;
        if (who !== 0) {
          this.hub.toast(c, 'Здесь уже рыбачат — выбери другое место');
          return;
        }
        this.release(p);
        this.fish.sit(it.arg, p.slot);
        this.hold(p, ACT_FISH, it);
        return;
      }
      case 'fisher': {
        // Семён (arg 0) или Саня (arg 1): окно разговора; близость, цены и уровни проверяет FishNpc
        const who = this.npcWho(p);
        if (!this.fishNpc || !who) return;
        this.release(p);
        this.fishNpc.handle(who, { t: 'fishNpc', a: 'open', npc: FISH_NPCS[it.arg] ?? 'semyon' });
        return;
      }
      case 'roulette':
        // окно ставки клиент открывает сам; здесь — только свежий вид стола
        if (this.roulette) c.sink.sendJson({ t: 'roulette', v: this.roulette.view() });
        return;
    }
  }

  /** Вызывается хабом один раз за его тик, независимо от числа игроков на набережной. */
  stepWeather(): void {
    this.weatherTick++;
    if ((!this.director.busy || this.weather.rain) && this.weather.step(this.weatherTick)) this.publishWeather();
  }

  private publishWeather(): void {
    this.broadcast({ t: 'weather', rain: this.weather.rain ? 1 : 0, ...(this.weather.rain ? { wx: this.weather.wire } : {}) });
    this.hub.fishEvent(this.weather.rain, this.weather.eventUntil);
  }

  /** E у катера: стоит — первый платит и садится за руль (30 с посадки); идёт посадка — садишься бесплатно. */
  private onBoat(p: LobbyPlayer): void {
    const c = p.client;
    const prof = c.profile;
    const b = this.boat;
    if (!prof || c.ephemeral || isAboard(p.action)) return;
    if (b.phase === BP_RIDE) {
      this.hub.toast(c, `Катер в поездке — вернётся через ${secs(b.at + BOAT_RIDE_TICKS - this.tick)} с`);
      return;
    }
    if (b.phase === BP_BOARD) {
      if (b.full) {
        this.hub.toast(c, 'В катере мест нет — дождись, пока он вернётся');
        return;
      }
      this.release(p);
      this.boardSeat(p, b.take(p.slot, this.tick));
      this.hub.toast(c, `Садись! Отплытие через ${secs(b.at - this.tick)} с`);
      this.boatChanged();
      return;
    }
    if (!this.hub.profiles.spend(prof, BOAT_PRICE)) {
      this.hub.toast(c, `Поездка на катере — ${BOAT_PRICE} 🪙, а у тебя ${prof.tokens}`);
      return;
    }
    this.hub.tokens(c, prof.tokens);
    this.honorDirty = true;
    this.release(p);
    this.boardSeat(p, b.start(p.slot, c.nick, this.tick));
    this.hub.toast(c, 'Катер твой, капитан! Отплытие через 30 с — зови друзей: им бесплатно');
    this.hub.announce(`🚤 ${c.nick} заводит катер «Ласточка»: отплытие через 30 с — садись бесплатно, E у причала`);
    this.boatChanged();
  }

  /**
   * E у лодки Семёна. У мостков (arg 0): стоит — садишься (с 3-го уровня рыбалки), первый запускает отсчёт; в море —
   * когда вернётся. У калитки баркаса (arg 1): лодка у борта — садишься, нет — звонишь в колокол, и она идёт за тобой.
   */
  private onFerry(p: LobbyPlayer, arg: number): void {
    const c = p.client;
    const prof = c.profile;
    const f = this.ferry;
    if (!prof || c.ephemeral || isFerry(p.action)) return;
    if (arg === 1) {
      if (f.phase === FE_AWAY) {
        this.ferryBoard(p, true);
        return;
      }
      const r = f.call(this.tick);
      const eta = secs(ferryEta(f.phase, f.at, this.tick, true));
      if (r === 'soon') {
        this.hub.toast(c, `Дзынь-дзынь! Гоша услышал — «Удалая» будет у борта через ${eta} с`);
        this.ferryChanged();
      } else this.hub.toast(c, `«Удалая» уже идёт к баркасу — будет через ${eta} с`);
      return;
    }
    if (f.phase !== FE_HOME && f.phase !== FE_BOARD) {
      this.hub.toast(c, `«Удалая» в море — вернётся к мосткам через ${secs(ferryEta(f.phase, f.at, this.tick, false))} с`);
      return;
    }
    const level = fishLevel(prof.fishing.xp);
    if (level < FERRY_LEVEL) {
      const need = Math.max(0, FISH_XP_LEVELS[FERRY_LEVEL] - prof.fishing.xp);
      this.hub.toast(c, `Семён: «Рано тебе в море, сынок — возьму с ${FERRY_LEVEL}-го уровня рыбалки». У тебя ${level}-й, ещё ${need} опыта — лови на мостках`);
      return;
    }
    this.ferryBoard(p, false);
  }

  /** Посадить на свободную банку лодки у стоянки (у баркаса — away): сидит лицом к носу, шаг — выйти. */
  private ferryBoard(p: LobbyPlayer, away: boolean): void {
    const c = p.client;
    const f = this.ferry;
    if (f.full) {
      this.hub.toast(c, 'В лодке мест нет — подожди следующий рейс');
      return;
    }
    this.release(p);
    const k = f.take(p.slot, this.tick);
    if (k < 0) return;
    const dock = away ? FERRY_AWAY : FERRY_HOME;
    const at = ferrySeat(dock, k, this.seatTmp);
    p.action = ACT_FERRY;
    p.arg = k;
    p.actionUntil = 0;
    p.heldYaw = dock.yaw;
    this.teleport(p, at.x, FERRY_FLOOR_Y, at.z);
    const left = secs(f.at - this.tick);
    this.hub.toast(c, away ? `Садись! Обратно к Семёну — отход через ${left} с` : `Садись! На «Альбатрос» — отход через ${left} с`);
    this.ferryChanged();
  }

  /**
   * Саня за SANYA_PRICE жетонов отправляет на пирс к Семёну (server/lobby/ferry.ts — sanyaHome): действие 'ferry' разговора
   * (server/lobby/fishnpc.ts). Отправил — barkasHome ok (клиент закрывает окно, тост), нет — причина в окне разговора.
   */
  private onSanyaFerry(ctx: NpcCtx): NpcResult {
    const prof = ctx.prof;
    const c = this.hub.clientOf(prof.id);
    const p = c ? this.playerOf(c) : undefined;
    if (ctx.npc !== 'sanya' || !c || !p || c.ephemeral) return 'Здесь так нельзя';
    if (isRiding(p.action)) return 'Сначала сойди на палубу';
    const r = sanyaHome(p.state, {
      spend: (n) => this.hub.profiles.spend(prof, n),
      move: () => {
        this.release(p);
        const [x, z] = FERRY_HOME_SPOTS[Math.floor(Math.random() * FERRY_HOME_SPOTS.length)];
        p.heldYaw = FERRY_HOME_LANDING.yaw;
        this.teleport(p, x, 0, z);
      },
    });
    // жетоны, профиль и доску почёта после обработчика обновляет FishNpc (host.changed)
    const message = r === 'ok' ? 'Саня свистнул знакомому катеру — и ты уже на мостках у Семёна'
      : r === 'far' ? 'Подойди к Сане на баркасе' : `Саня берёт ${SANYA_PRICE} 🪙, а у тебя ${prof.tokens}`;
    c.sink.sendJson({ t: 'barkasHome', ok: r === 'ok', message });
    return r === 'ok' ? { open: false } : message;
  }

  /** E у кассы колеса: 5 жетонов — садишься в нижнюю кабинку на один оборот. */
  private onWheel(p: LobbyPlayer): void {
    const c = p.client;
    const prof = c.profile;
    if (!prof || c.ephemeral) return;
    if (prof.tokens < WHEEL_PRICE) {
      this.hub.toast(c, `Колесо обозрения — ${WHEEL_PRICE} 🪙, а у тебя ${prof.tokens}`);
      return;
    }
    this.release(p);
    const i = this.wheel.board(p.slot, this.tick);
    if (i < 0) {
      const { dt } = bottomCabin(this.tick);
      this.hub.toast(c, `В нижней кабинке мест нет — следующая через ${secs(dt + CABIN_STEP)} с`);
      return;
    }
    this.hub.profiles.spend(prof, WHEEL_PRICE);
    this.hub.tokens(c, prof.tokens);
    this.honorDirty = true;
    const at = wheelSeatAt(i, this.tick, this.wheelTmp);
    p.action = ACT_WHEEL;
    p.arg = i;
    p.actionUntil = 0;
    p.heldYaw = at.yaw;
    this.teleport(p, at.x, at.y, at.z);
    this.hub.toast(c, `Поехали! Один оборот — ${Math.round(WHEEL_PERIOD / TICK_RATE)} с, внизу выйдешь сам`);
  }

  /** Посадить на место k катера у причала: сидит лицом к носу, шаг — выйти. */
  private boardSeat(p: LobbyPlayer, k: number): void {
    const at = seatAt(LAUNCH, k, this.seatTmp);
    p.action = ACT_BOAT;
    p.arg = k;
    p.actionUntil = 0;
    p.heldYaw = LAUNCH.yaw;
    this.teleport(p, at.x, BOAT_FLOOR_Y, at.z);
  }

  private boatChanged(): void {
    this.broadcast({ t: 'boat', ...this.boat.status() });
  }

  /**
   * Жест вдвоём (k: 0 — «дай пять», 1 — обняться). Если этот игрок уже звал тебя на тот же жест и стоит рядом —
   * это ответ: оба в жесте друг с другом. Иначе — приглашение ближайшему впереди: позвавший стоит с поднятой
   * рукой (или раскинув руки) 5 с, тому — «жми ту же клавишу». Шаг любого из двоих всё отменяет.
   */
  private onPair(p: LobbyPlayer, k: unknown): void {
    const c = p.client;
    // сидя нельзя; уже в жесте с кем-то — тоже (повторное нажатие его не сбивает)
    if (c.ephemeral || (k !== 0 && k !== 1) || isHeld(p.action) || (isPair(p.action) && p.arg !== 0)) return;
    if (!this.hub.limits.hit(`pair:${c.id}`, 2, 1000)) return;
    const s = p.state;
    let from: LobbyPlayer | null = null;
    let best = Infinity;
    for (const [slot, a] of this.asks) {
      const q = this.players.get(slot);
      if (a.to !== p.slot || a.k !== k || !q) continue;
      const d = Math.hypot(q.state.x - s.x, q.state.z - s.z);
      if (d <= PAIR_ACCEPT_RANGE && Math.abs(q.state.y - s.y) < 1.2 && d < best) {
        from = q;
        best = d;
      }
    }
    if (from) {
      this.startPair(from, p, k);
      return;
    }
    let to: LobbyPlayer | null = null;
    best = Infinity;
    for (const q of this.players.values()) {
      if (q === p || q.client.ephemeral || isHeld(q.action)) continue;
      const t = q.state;
      if (!pairReach(s.x, s.y, s.z, p.lastInput.yaw, t.x, t.y, t.z)) continue;
      const d = Math.hypot(t.x - s.x, t.z - s.z);
      if (d < best) {
        to = q;
        best = d;
      }
    }
    if (!to) {
      this.hub.toast(c, 'Подойди к кому-нибудь ближе и повернись к нему лицом');
      return;
    }
    this.dropAsk(p.slot);
    this.asks.set(p.slot, { to: to.slot, k, until: this.tick + PAIR_ASK_TICKS });
    p.action = PAIR_ACTS[k];
    p.arg = 0;
    p.actionUntil = this.tick + PAIR_ASK_TICKS;
    to.client.sink.sendJson({ t: 'pairAsk', id: p.slot, nick: c.nick, k });
  }

  /** Ответили: оба в жесте лицом друг к другу (поворачивает клиент), их приглашения — сняты. */
  private startPair(a: LobbyPlayer, b: LobbyPlayer, k: number): void {
    this.dropAsk(a.slot, b.slot);
    this.dropAsk(b.slot);
    const until = this.tick + PAIR_TICKS[k];
    for (const [p, q] of [[a, b], [b, a]]) {
      p.action = PAIR_ACTS[k];
      p.arg = q.slot;
      p.actionUntil = until;
    }
    this.events.push(['pair', k, a.slot, b.slot]);
  }

  /** Снять приглашение игрока from; тому, кого звал, — «приглашение снято» (кроме quiet — он только что ответил). */
  private dropAsk(from: number, quiet = 0): void {
    const a = this.asks.get(from);
    if (!a) return;
    this.asks.delete(from);
    if (a.to !== quiet) this.players.get(a.to)?.client.sink.sendJson({ t: 'pairOff', id: from });
  }

  /**
   * Раз в тик: приглашение живо, пока позвавший стоит с поднятой рукой (шаг, другая эмоция, место, вода — снимают),
   * но не дольше 5 с; жест вдвоём — пока партнёр в том же жесте с тобой.
   */
  private checkPairs(): void {
    for (const [slot, a] of this.asks) {
      const p = this.players.get(slot);
      if (!p || p.action !== PAIR_ACTS[a.k] || p.arg !== 0 || this.tick >= a.until) this.dropAsk(slot);
    }
    for (const p of this.players.values()) {
      if (!isPair(p.action) || p.arg === 0) continue;
      const q = this.players.get(p.arg);
      if (q && q.action === p.action && q.arg === p.slot) continue;
      p.action = ACT_NONE;
      p.arg = 0;
      p.actionUntil = 0;
    }
  }

  /** Фото у маяка: всем — «через 3 с вспышка» (отсчёт и снимок — у тех, кто рядом). Пока идёт отсчёт — занято. */
  private onPhoto(p: LobbyPlayer): void {
    const c = p.client;
    if (c.ephemeral) return;
    if (this.tick < this.photoUntil) {
      this.hub.toast(c, 'Уже снимаем — беги в кадр! 📸');
      return;
    }
    this.photoUntil = this.tick + PHOTO_TICKS;
    this.events.push(['photo', p.slot]);
  }

  /** «Болеть» у табло: желейка машет, гонщикам — «📣 ник болеет за вас на набережной». С одного — раз в 4 с. */
  private onCheer(p: LobbyPlayer): void {
    const c = p.client;
    if (c.ephemeral) return;
    if (!this.hub.race.cheerable) {
      this.hub.toast(c, 'Сейчас никто не едет — болеть можно, пока идёт гонка 🏁');
      return;
    }
    if (!this.hub.limits.hit(`cheer:${c.id}`, 1, CHEER_MS)) return;
    if (!isHeld(p.action)) {
      p.action = ACT_WAVE;
      p.arg = 0;
      p.actionUntil = this.tick + EMOTE_TICKS;
    }
    this.events.push(['cheer', p.slot]);
    this.hub.race.cheer(c.nick);
  }

  /**
   * «Press F to pay respects»: у статуи отдаёт честь 5 с (шаг прерывает), сколько угодно игроков сразу. Все видят
   * событие; счётчик у статуи растёт от одного игрока не чаще раза в 10 с.
   */
  private onRespect(p: LobbyPlayer): void {
    const c = p.client;
    if (!this.hub.limits.hit(`respect:${c.id}`, 2, 1000)) return;
    const s = p.state;
    if (isHeld(p.action) || isPair(p.action) || p.action === ACT_RESPECT || !respectReach(s.x, s.y, s.z)) return;
    p.action = ACT_RESPECT;
    p.arg = 0;
    p.actionUntil = this.tick + RESPECT_TICKS;
    const st = this.hub.store.state;
    if (!c.ephemeral && this.hub.limits.hit(`respectN:${c.pid}`, 1, RESPECT_COUNT_MS)) {
      st.respects++;
      this.hub.store.markDirty();
    }
    this.events.push(['respect', p.slot, st.respects]);
  }

  private onEmote(p: LobbyPlayer, e: unknown): void {
    if (!this.hub.limits.hit(`emote:${p.client.id}`, 2, 1000)) return;
    if (typeof e !== 'number' || !Number.isInteger(e) || e < ACT_WAVE || e > ACT_LAUGH || isHeld(p.action)) return;
    p.action = e;
    p.arg = 0;
    p.actionUntil = e === ACT_DANCE ? 0 : this.tick + EMOTE_TICKS;
  }

  private onSpin(p: LobbyPlayer): void {
    const c = p.client;
    const prof = c.profile;
    if (!prof || p.action !== ACT_SLOT) return;
    const r = this.slots.spin(p.slot, prof, this.tick);
    if (r === 'not_here') return;
    if (r === 'busy') {
      this.hub.toast(c, 'Автомат ещё крутится');
      return;
    }
    if (r === 'no_tokens') {
      this.hub.toast(c, 'Не хватает жетонов');
      return;
    }
    this.broadcast({ t: 'slotSpin', m: r.m, id: p.slot, nick: c.nick, reels: r.reels, win: r.win, line: r.line, jackpot: r.jackpot, item: r.item });
    this.hub.tokens(c, r.afterStake);
    this.hub.tokens(c, r.final, SPIN_MS);
    this.poolDirty = true;
    this.honorDirty = true;
    const name = MACHINE_NAMES[r.m];
    if (r.jackpot) {
      const thing = r.item ? ` и забирает «${itemById(r.item)?.name ?? r.item}»` : '';
      this.hub.announce(`🎰 ДЖЕКПОТ! ${c.nick} срывает ${r.win} 🪙 на автомате «${name}»${thing}!`, SPIN_TICKS);
      this.poolHoldUntil = this.tick + SPIN_TICKS;
      this.hub.later(SPIN_TICKS, () => {
        this.poolDirty = false;
        this.broadcast({ t: 'pool', n: Math.floor(this.hub.store.state.jackpot) });
        this.sendHonor();
        if (!c.closed) this.hub.sendMe(c);
      });
    } else if (r.win >= BIG_WIN_MULT * r.stake) {
      this.hub.announce(`🎰 ${c.nick} выигрывает ${r.win} 🪙 (×${Math.round(r.win / r.stake)}) на автомате «${name}»`, SPIN_TICKS);
    }
  }

  private onOutfit(p: LobbyPlayer, o: unknown): void {
    const c = p.client;
    const prof = c.profile;
    if (!prof || !this.hub.limits.hit(`outfit:${c.id}`, 5, 1000)) return;
    // вне примерочной — только снасти и значок из журнала рыбака (shared/fishstyle.ts), одежда — как была
    const kiosk = p.action === ACT_WARDROBE;
    const before = prof.outfit;
    this.hub.profiles.setOutfit(prof, kiosk ? o : gearOnly(before, o));
    if (!kiosk && sameOutfit(before, prof.outfit)) return;
    if (!c.ephemeral) this.broadcast({ t: 'outfitOf', id: p.slot, o: this.hub.outfitOf(prof) });
    this.hub.sendMe(c);
  }

  private onBuy(p: LobbyPlayer, itemId: unknown): void {
    const c = p.client;
    const prof = c.profile;
    if (!prof || c.ephemeral || p.action !== ACT_WARDROBE || !this.hub.limits.hit(`buy:${c.id}`, 2, 1000)) return;
    const r = this.hub.profiles.buy(prof, itemId);
    if (r === 'ok') {
      const item = itemById(itemId as string)!;
      this.hub.profiles.setOutfit(prof, withItem(prof.outfit, item));
      this.broadcast({ t: 'outfitOf', id: p.slot, o: this.hub.outfitOf(prof) });
      this.hub.sendMe(c);
      this.hub.toast(c, `Куплено: ${item.name}`);
      this.honorDirty = true;
      return;
    }
    const why = { owned: 'Это уже твоё', not_for_sale: 'Эту вещь нельзя купить', no_tokens: 'Не хватает жетонов', unknown: '' }[r];
    if (why) this.hub.toast(c, why);
  }

  // ------------------------------------------------------------ места

  private hold(p: LobbyPlayer, action: number, it: Interactable): void {
    p.action = action;
    p.arg = it.arg;
    p.actionUntil = 0;
    p.heldYaw = it.yaw;
    this.teleport(p, it.x, it.y, it.z);
  }

  /** Встать: освободить автомат, место, место рыбалки или в катере (эмоции не трогает). В поездке — только force (вышел из игры). */
  private release(p: LobbyPlayer, force = false): void {
    if (!isHeld(p.action) || (isRiding(p.action) && !force)) return;
    if (p.action === ACT_REGATTA) this.regatta?.drop(p, 'left');
    else if (isAboard(p.action)) {
      this.boat.leave(p.slot);
      this.boatChanged();
    } else if (isFerry(p.action)) {
      this.ferry.leave(p.slot);
      this.ferryChanged();
    } else if (p.action === ACT_WHEEL) this.wheel.leave(p.slot);
    else if (p.action === ACT_SLOT) this.slots.release(p.slot);
    else if (p.action === ACT_SIT || p.action === ACT_DURAK) {
      if (this.seats[p.arg] === p.slot) this.seats[p.arg] = 0;
      if (p.action === ACT_DURAK) (seatTable(p.arg) === BJ_TABLE ? this.blackjack : this.durak).stand(p.arg, p.slot);
    } else if (p.action === ACT_FISH) {
      this.fish.stand(p.arg, p.slot);
    }
    p.action = ACT_NONE;
    p.arg = 0;
  }

  /** Поставить в точку «стоя на полу»: такое состояние не меняется от шага без кнопок, клиент не дёргается. */
  private teleport(p: LobbyPlayer, x: number, y: number, z: number): void {
    const st = p.state;
    Object.assign(st, makeState());
    st.x = x;
    st.y = y;
    st.z = z;
    st.grounded = 1;
    st.coyote = COYOTE_TICKS;
    st.prevButtons = p.lastInput.buttons;
    p.selfReset = true;
  }

  private placeNear(p: LobbyPlayer, x: number, z: number, yaw: number): void {
    p.heldYaw = yaw;
    this.teleport(p, x + (Math.random() - 0.5) * 1.6, 0, z + (Math.random() - 0.5) * 1.6);
  }

  // ------------------------------------------------------------ тик

  step(): void {
    this.tick++;
    this.director.step(this.tick);
    for (const p of this.players.values()) {
      this.processPlayer(p);
      if (p.actionUntil !== 0 && this.tick >= p.actionUntil) {
        p.action = ACT_NONE;
        p.arg = 0;
        p.actionUntil = 0;
      }
    }
    this.regatta?.step();
    this.checkPairs();
    // музыкальный автомат: песня доиграла — следующая (раз в треть секунды; время — по часам, не по тикам)
    if (this.juke && this.tick % 10 === 0 && this.juke.step(this.now())) this.broadcastJuke();
    this.stepBoat();
    this.stepFerry();
    this.stepWheel();
    this.stepBall();
    this.fish.step(this.tick);
    this.roulette?.step();
    this.durak.step(this.tick);
    this.blackjack.step(this.tick);
    this.stepStartZones();
    // «Топ проигравших»: итог вращения — на экран, когда докрутились барабаны (поменялся топ — всем)
    const losers = this.slots.losers.step(this.tick);
    if (losers) this.broadcast({ t: 'losers', top: losers });
    if (this.tick % KART_CHECK_EVERY === 0) this.kartStep();
    if (this.tick % KART_CHECK_EVERY === 0 && this.boatQueue) {
      this.boatQueue.step(this.tick);
      const v = this.boatQueue.view(this.tick), key = JSON.stringify(v);
      if (key !== this.boatShown) { this.boatShown = key; this.broadcast({ t: 'rgQ', v }); }
    }
    if (this.tick % KART_CHECK_EVERY === 0 && this.hideQueue) {
      this.hideQueue.step(this.tick);
      const v = this.hideStatus()!, key = JSON.stringify(v);
      if (key !== this.hideShown) { this.hideShown = key; this.broadcast({ t: 'hideSt', v }); }
    }
    if (this.fc && this.tick % FC_CHECK_EVERY === 0) this.fc.step(this.tick);
    if (this.tick % LOBBY_SNAP_EVERY === 0) this.sendSnapshots();
    if (this.tick % TICK_RATE === 0) {
      if (this.poolDirty && this.tick >= this.poolHoldUntil) {
        this.poolDirty = false;
        this.broadcast({ t: 'pool', n: Math.floor(this.hub.store.state.jackpot) });
      }
      if (this.honorDirty && this.tick - this.honorSentTick >= 60 * TICK_RATE) this.sendHonor();
      this.slotAfk();
    }
  }

  /** Катер: отплытие, поездка (пассажиров везёт сервер — по общему пути, клиенты рисуют катер по нему же), возврат. */
  private stepBoat(): void {
    const b = this.boat;
    const r = b.step(this.tick);
    if (r === 'cancel') this.boatChanged();
    else if (r === 'depart') this.depart();
    else if (r === 'arrive') this.arrive();
    if (b.phase !== BP_RIDE) return;
    const pose = ridePose(this.tick - b.at, this.boatPose);
    for (let k = 0; k < b.seats.length; k++) {
      const p = this.players.get(b.seats[k]);
      if (!p) continue;
      const at = seatAt(pose, k, this.seatTmp);
      const s = p.state;
      s.x = at.x;
      s.y = BOAT_FLOOR_Y;
      s.z = at.z;
      s.vx = s.vy = s.vz = 0;
      p.heldYaw = pose.yaw;
    }
  }

  /** «Удалая»: отход, рейс (пассажиров везёт сервер по общему пути, клиенты рисуют лодку по нему же), приход. */
  private stepFerry(): void {
    const f = this.ferry;
    const r = f.step(this.tick);
    if (r === 'depart' || r === 'leave') this.ferryDepart(r === 'leave');
    else if (r === 'arrive' || r === 'home') this.ferryArrive(r === 'arrive');
    if (r) {
      this.ferryBoxes();
      this.ferryChanged();
    }
    if (f.phase !== FE_OUT && f.phase !== FE_BACK) return;
    const pose = ferryPose(f.phase, f.at, this.tick, this.ferryPoseTmp);
    for (let k = 0; k < f.seats.length; k++) {
      const p = this.players.get(f.seats[k]);
      if (!p) continue;
      const at = ferrySeat(pose, k, this.seatTmp);
      const s = p.state;
      s.x = at.x;
      s.y = FERRY_FLOOR_Y;
      s.z = at.z;
      s.vx = s.vy = s.vz = 0;
      p.heldYaw = pose.yaw;
    }
  }

  /** Отошли: сидящие — в рейсе; кто стоял в лодке без места — на мостки у Семёна или на палубу баркаса. */
  private ferryDepart(fromBarkas: boolean): void {
    const f = this.ferry;
    const dock = fromBarkas ? FERRY_AWAY : FERRY_HOME;
    for (const p of this.players.values()) {
      if (f.seatOf(p.slot) >= 0) {
        p.action = ACT_FERRY_RIDE;
        continue;
      }
      const s = p.state;
      if (!inFerry(dock, s.x, s.z, s.y)) continue;
      this.release(p);
      this.ferryLand(p, fromBarkas, Math.floor(Math.random() * 6));
      this.hub.toast(p.client, fromBarkas ? 'Лодка ушла, а места у тебя не было — ты на палубе' : 'Лодка ушла, а места у тебя не было — ты на мостках');
    }
  }

  /** Пришли: пассажиров высаживают на палубу баркаса или на мостки у Семёна (каждого — на своё место, без толкотни). */
  private ferryArrive(atBarkas: boolean): void {
    const f = this.ferry;
    for (let k = 0; k < f.seats.length; k++) {
      const p = this.players.get(f.seats[k]);
      if (!p) continue;
      p.action = ACT_NONE;
      p.arg = 0;
      this.ferryLand(p, atBarkas, k);
      this.hub.toast(p.client, atBarkas ? 'Приплыли на «Альбатрос»! Места рыбалки — вдоль бортов, Саня — у кормы' : 'Приплыли к Семёну!');
    }
    f.seats.fill(0);
  }

  /** Поставить на точку высадки k: на палубу баркаса или на мостки у стоянки лодки. */
  private ferryLand(p: LobbyPlayer, barkas: boolean, k: number): void {
    const [x, z] = barkas ? barkasLanding(k) : FERRY_HOME_SPOTS[k % FERRY_HOME_SPOTS.length];
    p.heldYaw = barkas ? BARKAS_LANDING.yaw : FERRY_HOME_LANDING.yaw;
    this.teleport(p, x, 0, z);
  }

  /** Боксы лодки — только у той стоянки, где она стоит (в рейсе — ни у одной). */
  private ferryBoxes(): void {
    const ph = this.ferry.phase;
    for (const i of this.map.ferryHomeBoxes) this.world.setEnabled(i, ph === FE_HOME || ph === FE_BOARD);
    for (const i of this.map.ferryAwayBoxes) this.world.setEnabled(i, ph === FE_AWAY);
  }

  private ferryChanged(): void {
    this.broadcast({ t: 'ferry', ...this.ferry.status() });
  }

  /** Колесо: сидящих везёт по кабинкам (клиенты рисуют кабинки по тем же часам), приехавших вниз высаживает. */
  private stepWheel(): void {
    const w = this.wheel;
    for (const i of w.arrived(this.tick)) {
      const p = this.players.get(w.seats[i]);
      w.seats[i] = 0;
      if (!p || p.action !== ACT_WHEEL) continue;
      p.action = ACT_NONE;
      p.arg = 0;
      p.heldYaw = WHEEL_EXIT.yaw;
      // выходят по одному в ряд, чтобы не стоять друг в друге
      this.teleport(p, WHEEL_EXIT.x - 0.3 * (i % 2), 0.15, WHEEL_EXIT.z + 0.9 * (i % 4 >> 1) + 0.45 * (i % 2));
      this.hub.toast(p.client, 'Приехали! Как тебе вид сверху?');
    }
    for (let i = 0; i < w.seats.length; i++) {
      const p = this.players.get(w.seats[i]);
      if (!p) continue;
      const at = wheelSeatAt(i, this.tick, this.wheelTmp);
      const s = p.state;
      s.x = at.x;
      s.y = at.y;
      s.z = at.z;
      s.vx = s.vy = s.vz = 0;
      p.heldYaw = at.yaw;
    }
  }

  /** Отплыли: сидящие — в поездке, боксы катера убраны; кто стоял в катере без места — на причал. */
  private depart(): void {
    const b = this.boat;
    for (const i of this.map.boatBoxes) this.world.setEnabled(i, false);
    const a = this.map.boatArea;
    for (const p of this.players.values()) {
      if (b.seatOf(p.slot) >= 0) {
        p.action = ACT_RIDE;
        continue;
      }
      const s = p.state;
      // и подпрыгнувших в катере (выше палубы причала они не взлетают)
      if (s.x > a.x0 && s.x < a.x1 && s.z > a.z0 && s.z < a.z1 && s.y < 1.5) {
        this.release(p);
        this.teleport(p, Math.min(a.x1 - 1, Math.max(a.x0 + 1, s.x)), 0, BOAT_DOCK_Z);
        this.hub.toast(p.client, 'Катер отплыл, а места у тебя не было — ты на причале');
      }
    }
    this.boatChanged();
  }

  /** Вернулись: боксы катера на месте, пассажиры встают у своих мест (катер у причала — выходят сами). */
  private arrive(): void {
    const b = this.boat;
    for (const i of this.map.boatBoxes) this.world.setEnabled(i, true);
    for (let k = 0; k < b.seats.length; k++) {
      const p = this.players.get(b.seats[k]);
      if (!p) continue;
      const at = seatAt(LAUNCH, k, this.seatTmp);
      p.action = ACT_NONE;
      p.arg = 0;
      p.heldYaw = LAUNCH.yaw;
      this.teleport(p, at.x, BOAT_FLOOR_Y, at.z);
      this.hub.toast(p.client, 'Приплыли! Катер у причала — можно выходить');
    }
    b.seats.fill(0);
    this.boatChanged();
  }

  /** У автомата минуту не крутят — поднимаем (автомат свободен), за 10 с предупреждаем. */
  private slotAfk(): void {
    for (const a of this.slots.afk(this.tick)) {
      const p = this.players.get(a.who);
      if (!p) {
        this.slots.release(a.who);
        continue;
      }
      if (!a.kick) {
        this.hub.toast(p.client, 'Не крутишь — через 10 с автомат освободится');
        continue;
      }
      this.release(p);
      this.hub.toast(p.client, 'Автомат освобождён: ты минуту не крутил');
    }
  }

  private processPlayer(p: LobbyPlayer): void {
    // в катере регаты входы — катеру (server/lobby/regatta.ts)
    if (p.action === ACT_REGATTA) {
      if (this.regatta?.has(p)) this.regatta.consume(p);
      else {
        p.action = ACT_NONE;
        p.arg = 0;
      }
      return;
    }
    const q = p.inq;
    const n = q.due();
    for (let i = 0; i < n; i++) {
      const inp = q.shift();
      this.simulate(p, inp, aquaClock(inp.viewTick, p.aquaT, this.tick), true);
      const last = p.lastInput;
      last.seq = inp.seq;
      last.buttons = inp.buttons;
      last.yaw = inp.yaw;
      last.pitch = inp.pitch;
      last.viewTick = inp.viewTick;
    }
    if (n === 0 && ++q.starve > 8) {
      // На полосе аквапарка не додумываем: ждём настоящие входы — у них свои шаги и своё время препятствий, а догадка
      // по последнему входу на узком месте роняла бы в воду того, кто у себя допрыгнул. Через 1,5 с — как везде.
      if (q.starve <= AQUA_WAIT && aquaFall(p.state.x)) return;
      // Ввод не приходит (вкладка свёрнута, лаг): идём по последнему без «разовых» кнопок, через 1,5 с — стоим
      const idle = p.lastInput;
      const saved = idle.buttons;
      idle.buttons = q.starve > 90 ? 0 : saved & ~ONE_SHOT;
      this.simulate(p, idle, aquaClock(0, p.aquaT, this.tick), false);
      idle.buttons = saved;
    }
  }

  /**
   * Шаг игрока по входу. t — время препятствий аквапарка (метка входа, зажатая в окно); real — настоящий вход, а не
   * догадка сервера в паузе связи: только по настоящим идут забеги.
   */
  private simulate(p: LobbyPlayer, inp: Input, t: number, real: boolean): void {
    const original = inp;
    const eligible = !p.client.ephemeral && !isHeld(p.action) && !p.menuOpen;
    if (this.storm) inp = stormInput(p.state, inp, t, this.storm.view(), eligible);
    const knock = this.pirates?.knockOf(p.client.pid);
    if (knock) inp = pirateInput(p.state, inp, t, knock);
    if (real && eligible && (original.buttons & BTN_FIRE) && this.pirates?.view().phase === 'raid') this.pirates.swing(p.client.pid, original);
    const hold = holdMask(p.action);
    if (hold === 0 && p.action !== ACT_NONE && (inp.buttons & STOP_EMOTE) !== 0) {
      // эмоцию отменяет шаг, прыжок или рывок (жест вдвоём — у обоих: партнёра отпустит checkPairs)
      p.action = ACT_NONE;
      p.arg = 0;
      p.actionUntil = 0;
    }
    // встаёт только от нового нажатия: W, зажатый ещё на ходу, не поднимает (так же считает клиент); вокруг шага —
    // препятствия аквапарка по времени этого входа (так же считает предсказание клиента)
    const dyn = this.aquaDyn;
    dyn.pre(p.state, t, p.aquaT > 0 ? p.aquaT : t);
    if (stepHeld(p.state, hold, inp, this.world, false, 0, p.ev) === 0 && hold !== 0) this.release(p);
    dyn.post(p.state, p.ev, t);
    if (this.storm) stormPush(p.state, this.world, t, this.storm.view(), eligible);
    if (knock) piratePush(p.state, this.world, t, knock);
    p.aquaT = t;
    if (real) {
      // толкнуло — всем «бум» (себе клиент уже показал по предсказанию)
      if (dyn.knock !== 0 && !p.knocked && !p.client.ephemeral) this.events.push(['aqhit', round2(p.state.x), round2(p.state.z), p.slot]);
      p.knocked = dyn.knock !== 0;
      this.aquaStep(p, inp.seq, t);
    }
    if (p.state.y < DROWN_Y) this.drown(p);
  }

  /** Мяч: сначала кто его касается (пинок с одного — не чаще раза в BALL_KICK_TICKS), потом его полёт. */
  private stepBall(): void {
    const b = this.ball;
    for (const p of this.players.values()) {
      if (p.client.ephemeral) continue;
      // сидящий или у автомата не пинает — мяч от него просто отскакивает
      if (touchBall(b, p.state, !isHeld(p.action) && this.tick >= p.kickAt)) p.kickAt = this.tick + BALL_KICK_TICKS;
    }
    // всплеск мяча клиент видит в своём счёте сам — событие не нужно
    stepBall(b, this.world);
  }

  /** Плюх в воду: на место появления, а к западу от площади (у аквапарка) — на мостик у старта полосы. */
  private drown(p: LobbyPlayer): void {
    this.events.push(['splash', round2(p.state.x), round2(p.state.z), p.slot]);
    this.release(p, true);
    p.action = ACT_NONE;
    p.arg = 0;
    p.actionUntil = 0;
    if (this.aqua.drop(p.slot)) p.client.sink.sendJson({ t: 'aquaRun', a: 'stop' });
    // у баркаса матросы вытаскивают на палубу (аквапарком aquaFall считает всё западнее площади — баркас раньше)
    if (barkasWater(p.state.x, p.state.z)) {
      this.ferryLand(p, true, Math.floor(Math.random() * 6));
      return;
    }
    const s = aquaFall(p.state.x) ? AQUA_RESPAWN : this.map.spawn;
    this.placeNear(p, s.x, s.z, s.yaw);
  }

  // ------------------------------------------------------------ аквапарк

  /**
   * Забег после настоящего входа seq (метка времени t): старт (сошёл с мостика на запад), финиш, снят — по тому, где
   * игрок после шага. Старт уходит клиенту номером его же входа: секундомер идёт по его шагам.
   */
  private aquaStep(p: LobbyPlayer, seq: number, t: number): void {
    if (p.client.ephemeral) return;
    const s = p.state;
    const r = this.aqua.step(p.slot, s.x, s.y, s.z, s.grounded === 1, seq, t);
    if (!r) return;
    if (r.k === 'start') p.client.sink.sendJson({ t: 'aquaRun', a: 'start', at: seq });
    else if (r.k === 'stop') {
      p.client.sink.sendJson({ t: 'aquaRun', a: 'stop' });
      if (r.pause) this.hub.toast(p.client, 'Забег сброшен: игра вставала на паузу или подвисала — начни с мостика заново');
    } else this.aquaFinish(p, aquaMs(r.steps));
  }

  /** Финиш: время в профиль (лучшее и сколько раз прошёл) и на доску рекордов; рекорд полосы — в общий чат. */
  private aquaFinish(p: LobbyPlayer, ms: number): void {
    const c = p.client;
    const prof = c.profile;
    if (!prof) return;
    const st = prof.stats;
    const mine = st.aqBest === 0 || ms < st.aqBest;
    st.aqRuns++;
    if (mine) st.aqBest = ms;
    const state = this.hub.store.state;
    const was = state.aqua[0];
    const { top, place } = addRecord(state.aqua, { pid: prof.id, nick: c.nick, ms, at: this.now() });
    if (place >= 0) {
      state.aqua = top;
      this.broadcast({ t: 'aquaTop', top: this.aquaRows() });
    }
    this.hub.store.markDirty();
    this.hub.sendMe(c);
    c.sink.sendJson({ t: 'aquaRun', a: 'finish', ms, best: st.aqBest, place });
    const time = fmtAquaTime(ms);
    if (place === 0) {
      this.hub.toast(c, `🏆 Финиш: ${time} — рекорд полосы!`);
      this.hub.announce(`🏆 ${c.nick} проходит аквапарк за ${time} — новый рекорд полосы${was ? ` (был ${fmtAquaTime(was.ms)}, ${was.nick})` : ''}!`);
    } else {
      this.hub.toast(c, mine ? `🏁 Финиш: ${time} — твой лучший результат!` : `🏁 Финиш: ${time} · твой лучший — ${fmtAquaTime(st.aqBest)}`);
    }
  }

  private aquaRows(): AquaRow[] {
    return this.hub.store.state.aqua.map((r) => ({ pid: r.pid, nick: r.nick, ms: r.ms }));
  }

  // ------------------------------------------------------------ круг «Старт»

  private startZoneAt(p: LobbyPlayer): typeof START_ZONES[number] | null {
    return START_ZONES.find(zone => (zone.kind !== 'fort' || this.hub.fort !== null) &&
      inStartCircle(p.state, zone)) ?? null;
  }

  private stepStartZones(): void {
    for (const p of this.players.values()) {
      const dwell = this.starts.get(p);
      if (!dwell || p.client.ephemeral) continue;
      const zone = this.startZoneAt(p);
      const target = zone?.kind === 'fort' ? this.hub.fort : this.hub.paintball;
      const available = zone && !isHeld(p.action) && !p.menuOpen && target?.hasSpace();
      if (!available) {
        dwell.armed = !zone;
        dwell.zone = null; dwell.since = 0;
        if (dwell.shown) { p.client.sink.sendJson({ t: 'startZone', kind: null, left: 0 }); dwell.shown = ''; }
        continue;
      }
      if (!dwell.armed) continue;
      if (dwell.zone !== zone.kind) { dwell.zone = zone.kind; dwell.since = this.tick; }
      const left = Math.max(0, Math.ceil((START_DWELL_TICKS - (this.tick - dwell.since)) / TICK_RATE));
      const key = `${zone.kind}:${left}`;
      if (dwell.shown !== key) { p.client.sink.sendJson({ t: 'startZone', kind: zone.kind, left }); dwell.shown = key; }
      if (this.tick - dwell.since >= START_DWELL_TICKS) {
        dwell.armed = false; dwell.zone = null; dwell.shown = '';
        p.client.sink.sendJson({ t: 'startZone', kind: null, left: 0 });
        this.hub.move(p.client, target!);
      }
    }
  }

  private syncKartCircle(): void {
    syncCircleMembers(this.circle, this.players.values(), p =>
      !p.client.ephemeral && !isHeld(p.action) && !p.menuOpen && inStartCircle(p.state, KART_START));
    if (!this.circle.size) { this.kartTrack = DEFAULT_TRACK; this.kartCountEnd = 0; }
  }

  private chooseKartTrack(p: LobbyPlayer, track: unknown): void {
    if (!isRaceTrackId(track) || !this.hub.limits.hit(`kartTrack:${p.client.id}`, 4, 1000)) return;
    this.syncKartCircle();
    if (!this.hub.race.idle) { this.hub.toast(p.client, 'Гонка уже идёт. Трассу выберем перед следующим заездом.'); return; }
    if (!this.circle.has(p)) { this.hub.toast(p.client, 'Встань в круг старта у гаража.'); return; }
    const host = this.circle.values().next().value;
    if (host !== p) { this.hub.toast(p.client, `Трассу выбирает ${host?.client.nick ?? 'первый игрок в круге'}.`); return; }
    if (this.kartTrack !== track) {
      this.kartTrack = track;
      this.kartCountEnd = this.tick + KART_COUNT_TICKS;
      const status = this.kartStatus();
      this.kartShown = JSON.stringify(status);
      this.broadcast({ t: 'kart', ...status });
      this.hub.toast(p.client, `Выбрана трасса «${raceTrackName(track)}». E — сменить.`);
    }
  }

  /**
   * Кто в круге (кроме проверочного входа и сидящих), отсчёт и старт гонки. Пока гонка идёт, отсчёт не начинается:
   * в круге можно ждать следующий заезд. Табло — при каждом изменении (секунды отсчёта и гонки тоже меняют его).
   */
  private kartStep(): void {
    this.syncKartCircle();
    if (!this.hub.race.idle || this.circle.size === 0) this.kartCountEnd = 0;
    else if (this.kartCountEnd === 0) this.kartCountEnd = this.tick + KART_COUNT_TICKS;
    else if (this.tick >= this.kartCountEnd) {
      this.kartCountEnd = 0;
      const all = [...this.circle];
      for (const p of all.slice(RC_MAX_KARTS)) this.hub.toast(p.client, 'Мест нет — поедешь в следующий заезд');
      this.hub.startRace(all.slice(0, RC_MAX_KARTS).map((p) => p.client), this.kartTrack);
    }
    const st = this.kartStatus();
    const key = JSON.stringify(st);
    if (key !== this.kartShown) {
      this.kartShown = key;
      this.broadcast({ t: 'kart', ...st });
    }
    // табло: где карты — 10 раз в секунду, пока идёт гонка (стоят — не шлём)
    const pos = this.hub.race.positions();
    const pkey = pos ? pos.join(',') : '';
    if (pkey !== this.kposShown) {
      this.kposShown = pkey;
      if (pos) this.broadcast({ t: 'kpos', p: pos });
    }
  }

  kartStatus(): KartStatus {
    const race = this.hub.race.status();
    if (race) return race;
    const host = this.circle.values().next().value;
    const selection = { track: this.kartTrack, hostId: host?.slot ?? 0, hostNick: host?.client.nick ?? '' };
    if (this.kartCountEnd > 0) {
      const names = [...this.circle].map((p) => p.client.nick);
      return {
        phase: 'count', left: Math.max(0, Math.ceil((this.kartCountEnd - this.tick) / TICK_RATE)), n: names.length, names, lap: 0, laps: RC_LAPS, ...selection,
      };
    }
    return { phase: 'idle', left: 0, n: 0, names: [], lap: 0, laps: RC_LAPS, ...selection };
  }

  /** Круг сбора регаты у пирса (null — регата выключена) */
  boatStatus() { return this.boatQueue?.view(this.tick) ?? null; }
  hideStatus() {
    const queue = this.hideQueue?.view(this.tick);
    return queue?.phase === 'count' ? queue : this.hub.hide && (this.hub.hide.humans || this.hub.hide.active) ? this.hub.hide.status() : queue ?? null;
  }

  // ------------------------------------------------------------ рассылка

  private sendSnapshots(): void {
    const list = this.entityList;
    list.length = 0;
    for (const p of this.players.values()) {
      if (p.client.ephemeral) continue;
      const s = p.state;
      const held = isHeld(p.action);
      let flags = E_ALIVE;
      if (s.grounded) flags |= E_GROUNDED;
      if (s.dashT > 0) flags |= E_DASH;
      list.push({
        id: p.slot, flags, x: s.x, y: s.y, z: s.z, yaw: held ? p.heldYaw : p.lastInput.yaw, pitch: held ? 0 : p.lastInput.pitch,
        // на полосе аквапарка без действия вместо аргумента — на сколько тиков время его препятствий отстаёт
        // от снимка: другие рисуют его на пароме и лифте там, где он стоит у себя (client/lobby/scene.ts)
        hp: p.action, armor: p.action === ACT_NONE && s.x < AQUA_NEAR_X ? Math.max(0, Math.min(255, Math.round(this.tick - p.aquaT))) : p.arg,
      });
    }
    // мяч — сразу за списком, целиком: клиент считает его у себя и сверяется
    const ents = encodeEntities(list);
    const entities = new Uint8Array(ents.length + BALL_BYTES);
    entities.set(ents);
    writeBall(new DataView(entities.buffer), ents.length, this.ball);
    const h = this.header;
    h.tick = this.tick;
    const ev: ServerMsg | null = this.events.length ? { t: 'lev', e: this.events } : null;
    for (const p of this.players.values()) {
      h.ack = p.inq.ack;
      h.queue = p.inq.length;
      h.flags = p.selfReset ? SNAP_SELF_RESET : 0;
      p.selfReset = false;
      let tail = entities;
      if (this.pirates) {
        const raid = this.pirates.tail(p.client.pid);
        tail = new Uint8Array(entities.length + pirateTailSize(raid.pirates.length));
        tail.set(entities); writePirateTail(tail, entities.length, raid);
      }
      p.client.sink.sendBinary(encodeSnapshot(h, p.state, tail));
      if (ev) p.client.sink.sendJson(ev);
    }
    this.events = [];
    this.regatta?.send();
  }

  private infos(): LobbyPlayerInfo[] {
    const list: LobbyPlayerInfo[] = [];
    for (const p of this.players.values()) {
      const prof = p.client.profile;
      if (prof && !p.client.ephemeral) list.push({ id: p.slot, pid: prof.id, nick: prof.nick, o: this.hub.outfitOf(prof), level: prof.level });
    }
    return list;
  }

  private broadcastRoster(): void {
    this.broadcast({ t: 'lroster', players: this.infos() });
  }

  levelsChanged(): void { this.broadcastRoster(); }

  honorChanged(): void {
    this.honorDirty = true;
  }

  private sendHonor(): void {
    this.honorDirty = false;
    this.honorSentTick = this.tick;
    this.broadcast({ t: 'honor', ...this.hub.honor() });
  }

  broadcast(msg: ServerMsg): void {
    for (const p of this.players.values()) p.client.sink.sendJson(msg);
  }

  private broadcastJuke(): void {
    if (this.juke) this.broadcast({ t: 'juke', v: this.juke.view(this.now()) });
  }

  /**
   * Заказ песни у музыкального автомата: рядом ли, есть ли такая, своя уже ждёт, очередь, повтор — и только потом
   * списать 10 🪙. Любой отказ — ответом с причиной, жетоны не тронуты. В чат — «🎵 ник ставит «…»».
   */
  private onJuke(p: LobbyPlayer, song: unknown): void {
    const c = p.client;
    const prof = c.profile;
    const juke = this.juke;
    if (!juke || !prof || c.ephemeral) return;
    const no = (text: string): void => c.sink.sendJson({ t: 'jukeRes', ok: false, text });
    if (!this.hub.limits.hit(`juke:${c.id}`, 1, JUKE_RATE_MS)) return no('Не так быстро 🙂');
    const s = p.state;
    if (isHeld(p.action) || Math.abs(s.y) > 2 || Math.hypot(s.x - JUKE_USE.x, s.z - JUKE_USE.z) > JUKE_SERVER_R) return no('Подойди к музыкальному автомату');
    const now = this.now();
    if (juke.step(now)) this.broadcastJuke();
    const why = juke.check(prof.id, song, now);
    if (why === 'song') return no('Такой песни в автомате нет');
    if (why === 'mine') return no('Твоя песня уже в очереди — дождись её');
    if (why === 'full') return no('Очередь полная — подожди, пока доиграет следующая');
    const n = song as number;
    const title = JUKE_SONGS[n].title;
    if (why === 'same') return no(`«${title}» уже ${juke.cur?.song === n ? 'играет' : 'в очереди'} — выбери другую`);
    if (!this.hub.profiles.spend(prof, JUKE_PRICE)) return no(`Песня стоит ${JUKE_PRICE} 🪙, а у тебя ${prof.tokens}`);
    juke.add(prof.id, c.nick, n, now);
    this.hub.tokens(c, prof.tokens);
    this.honorDirty = true;
    this.broadcastJuke();
    const place = juke.queue.length;
    c.sink.sendJson({ t: 'jukeRes', ok: true, text: place === 0 ? `«${title}» — сейчас заиграет` : `«${title}» в очереди: ${place}-я, через ${fmtSongTime(juke.etaMs(place - 1, now) / 1000)}` });
    this.hub.announce(`🎵 ${c.nick} ставит «${title}»`);
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Тики → целые секунды, вверх (для «через N с») */
function secs(ticks: number): number {
  return Math.max(0, Math.ceil(ticks / TICK_RATE));
}
