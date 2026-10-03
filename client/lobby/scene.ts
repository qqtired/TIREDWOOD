// Набережная: своя желейка с предсказанием (та же физика, что в пейнтболе, только без стрельбы), чужие — по снимкам
// с интерполяцией, камера от третьего лица, подсказки «E — …», эмоции и жесты вдвоём, облачка чата, места, автоматы,
// примерочная, столы дурака (карты в 3D, панель стола, помидоры и реакции), круг «Старт» у гаража картинга, фото у маяка,
// рыбалка с мостков (удочки в 3D, «Подсекай!», карточка улова), рыбаки у маяка (только у себя), доска почёта
// с «Последними входами» на обороте, мотор лодки, что проходит по заливу, и катер «Ласточка»: посадка у причала,
// прогулка по бухте (катер и пассажиры — по общему пути из shared/boat.ts), табличка с отсчётом; аквапарк «Волна»
// к западу от площади: надувная полоса с паромами, лифтом, тонущими подушками, вертушкой и мешками (их время в физике —
// метка своего входа, на экране — то же время), секундомер забега по своим шагам, доска рекордов; колесо обозрения
// у кафе (кабинки и пассажиры — по общим часам из shared/wheel.ts).
// В меню (ещё не вошли или связь пропала) — облёт площади по кругу.
import * as THREE from 'three';
import { BALL_BYTES } from '../../shared/ball.ts';
import type { BoatRaceStatus } from '../../shared/boatrace.ts';
import type { HideStatus } from '../../shared/hide.ts';
import { START_ZONES, type GatherStatus } from '../../shared/startzones.ts';
import { emptyStorm, STORM_GOAL } from '../../shared/storm.ts';
import { stormInput, stormPush } from '../../shared/stormdyn.ts';
import { emptyPirates, emptyPirateTail, pirateInput, piratePush } from '../../shared/pirates.ts';
import { readPirateTail } from '../../shared/piratenet.ts';
import { AQUA_NEAR_X, AQUA_PIECES, aquaFall, aquaMs, fmtAquaTime, onFinish, onJetty } from '../../shared/aqua.ts';
import { AquaDyn, KNOCK_BAG, quantTick } from '../../shared/aquadyn.ts';
import { BOAT_FLOOR_Y, BOAT_PRICE, BOAT_RIDE_TICKS, BOAT_SEATS, BP_BOARD, BP_DOCK, BP_RIDE, LAUNCH, ridePose, seatAt, type BoatPose } from '../../shared/boat.ts';
import { BJ_TABLE, type BlackjackView } from '../../shared/blackjack.ts';
import type { SkillStatus } from '../../shared/skilltest.ts';
import { MAX_HUMANS, TICK_MS, TICK_RATE, WATER_Y } from '../../shared/constants.ts';
import { FE_BITE, FE_DONE, FE_EARLY, FE_HOOK, FE_LOST, FE_MISS, FE_OFF, FP_BITE, FP_CAST, FP_HOLD, FP_IDLE, FP_REEL, FP_WAIT } from '../../shared/fishing.ts';
import type { FortStatus } from '../../shared/fort.ts';
import {
  ACT_BOAT, ACT_DANCE, ACT_DURAK, ACT_FISH, ACT_LAUGH, ACT_NONE, ACT_RESPECT, ACT_RIDE, ACT_SIT, ACT_SLOT, ACT_TIRED, ACT_WARDROBE, ACT_WAVE, ACT_WHEEL,
  LEAVE_SEAT, LOBBY_MIN_DELAY, PAIR_ACTS, STOP_EMOTE, holdMask, isAboard, isHeld, isPair, isRiding, pairReach,
} from '../../shared/lobby.ts';
import { BOAT_RACE_CIRCLE, HIDE_CIRCLE, KART_START, MACHINE_FRONT_Z, MACHINE_XS, PHOTO, SKILL_PORTAL, TABLE_SEATS, seatChair, seatTable, type Interactable } from '../../shared/maps/lobby.ts';
import { FISH_SPOTS } from '../../shared/fishplaces.ts';
import { STATUE_AT, respectReach } from '../../shared/respect.ts';
import { RC_MAX_KARTS } from '../../shared/kart.ts';
import { DEFAULT_TRACK, nextRaceTrack, raceTrackLabel } from '../../shared/racecourse.ts';
import { clamp } from '../../shared/math.ts';
import type { AquaRow, BoatStatus, DurakSeatView, DurakTableView, HonorInfo, LobbyPlayerInfo, PbStatus, ServerMsg } from '../../shared/messages.ts';
import type { Outfit } from '../../shared/outfit.ts';
import { E_ALIVE, E_DASH, E_GROUNDED, SNAP_HAS_SELF, SNAP_SELF_RESET, decodeSnapshot, encodeInputs, makeHeader, type EntitySnap } from '../../shared/protocol.ts';
import { BTN_FIRE, BTN_JUMP, makeInput, makeState, type Input, type StepEvents } from '../../shared/sim.ts';
import { SPIN_MS, STAKES } from '../../shared/slots.ts';
import { WHEEL_PERIOD, WHEEL_PRICE, WHEEL_SEATS, seatAt as wheelSeatAt, wheelArrival } from '../../shared/wheel.ts';
import { ClockSync } from '../net.ts';
import { Predictor, type StepHook } from '../predict.ts';
import { RemoteTrack, type RemoteSample } from '../remote.ts';
import { Avatar, FIVE_HIT, HUG_HOLD, tickAvatarShared, type AvatarPose } from '../render/avatar.ts';
import { Effects } from '../render/effects.ts';
import type { Scene, SceneDeps } from '../scene.ts';
import type { Quality } from '../settings.ts';
import { TOUCH, type TouchMode } from '../touch.ts';
import { Wardrobe } from '../ui/wardrobe.ts';
import { FortGate, fortHint } from '../fort/lobbygate.ts';
import { FC_CIRCLE, type FcStatus } from '../../shared/fight.ts';
import { FC_HINT_R, FightDoor, fightDist, fightHint } from '../fight/door.ts';
import { AquaPark } from './aquapark.ts';
import { LobbyBall } from './ball.ts';
import { BoatBanner } from './boatbanner.ts';
import { BoatSign } from './boatsign.ts';
import { LobbyCamera } from './camera.ts';
import { DurakTables3D } from './durak3d.ts';
import { DurakHud } from './durakhud.ts';
import { BlackjackHud } from './blackjackhud.ts';
import { BlackjackTable3D } from './blackjack3d.ts';
import { SkillPortal } from '../skilltest/portal.ts';
import { Kraken } from './kraken.ts';
import { LobbyCritters } from './critters.ts';
import { Storm3D } from './storm.ts';
import { Pirates3D } from './pirates.ts';
import { StartCircle } from './startcircles.ts';
import { Fish2Hud } from './fish2hud.ts';
import { FishHud } from './fishhud.ts';
import { FishingSpots } from './fishing.ts';
import { addFishPlaces3d } from './fishplaces3d.ts';
import { FishDrink } from './fishdrink.ts';
import { LobbyFolk } from './folk.ts';
import { Respects } from './respect.ts';
import { LobbyFx } from './fx.ts';
import { LobbyHud } from './hud.ts';
import { BOARD_POS } from './kartstart.ts';
import { LosersScreen } from './losers.ts';
import { PHOTO_COUNT_S, PHOTO_HEAR, PHOTO_KEEP, PHOTO_LENS, PhotoBooth, type PhotoPerson } from './photo.ts';
import { SlotMachines3D } from './slots3d.ts';
import { TgScreen } from './tgscreen.ts';
import { WHEEL_VIEW } from './tiredwood.ts';
import { FerrisWheel } from './wheel.ts';
import { LobbyWorld, type LobbyQuality } from './world.ts';

/**
 * «Авто» подбирает разрешение само; если его уже пришлось снизить (slow), гасим и точечные лампы.
 * На телефоне — ступенью ниже: без ламп, а если и так тяжело — ещё и тени помельче, капель меньше.
 */
export function lobbyQuality(q: Quality, slow = false): LobbyQuality {
  if (q !== 'auto') return q;
  if (TOUCH) return slow ? 'low' : 'medium';
  return slow ? 'medium' : 'high';
}

const EMOTE_KEYS: Record<string, number> = { Digit1: ACT_WAVE, Digit2: ACT_DANCE, Digit3: ACT_TIRED, Digit4: ACT_LAUGH };
/** Жесты вдвоём: 5 — «дай пять», 6 — обняться (номер жеста) */
const PAIR_KEYS: Record<string, number> = { Digit5: 0, Digit6: 1 };
/** Приглашение на жест вдвоём: значок, что предлагают, клавиша ответа; висит 5 с, как и на сервере */
const PAIR_ASKS = [['🖐', 'предлагает дать пять', '5'], ['🤗', 'хочет обняться', '6']] as const;
const PAIR_ASK_MS = 5000;
/** Клавиши, которыми встают (в примерочной по ним же возвращаем мышь — пока идёт жест). Shift не поднимает, как и на сервере */
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
/** Взгляд вверх-вниз за спиной: ниже — камера упирается в пол */
const PITCH_MIN = -1.2;
const PITCH_MAX = 0.55;
/** Поле зрения неподвижной камеры у автомата, по вертикали */
const FIXED_FOV = 46;
/** Примерочная: желейка в двух метрах — шире, чтобы влезла целиком */
const MIRROR_FOV = 68;
/**
 * Камера у автомата: сзади и чуть правее, высоко — взгляд на барабаны проходит над головой желейки
 * (сбоку она всё равно заслоняет полавтомата). Смещение от центра автомата и от его передней грани.
 */
const SLOT_CAM_DX = 0.35;
const SLOT_CAM_Y = 3.0;
const SLOT_CAM_DZ = 3.2;
const REELS_Y = 1.3;
/** Эмоции не чаще (сервер пускает 2 в секунду) */
const EMOTE_GAP_MS = 450;
/**
 * Камера за столом дурака — из-за своей головы (своя желейка спрятана): стол крупно над рукой внизу экрана,
 * соперники с веерами карт — целиком.
 */
const TABLE_CAM_D = 1.65;
const TABLE_CAM_Y = 2.05;
const TABLE_PITCH = (33 * Math.PI) / 180;
const TABLE_FOV = 52;
/** Клик по желейке за столом — помидор: не дальше стольких пикселей от головы */
const TOMATO_PICK_PX = 80;
const TOMATO_COLOR = 0xd42a1c;
/** Подсказка про гонку — в круге «Старт» и на столько метров вокруг */
const KART_HINT_M = 1.4;
/** Что кричат у табло гонки */
const CHEERS = ['Давай!', 'Жми!', 'Вперёд!', 'Ура-а!', 'Газу!'];

interface Remote {
  track: RemoteTrack;
  avatar: Avatar;
  pose: AvatarPose & { valid: boolean };
  /** Путь с прошлого шага (для звука) */
  steps: number;
  /** Когда последний раз быстро падал и когда отпружинил (батуты) */
  fallAt: number;
  bounceAt: number;
}

const _v = new THREE.Vector3();
const _hand = new THREE.Vector3();
const _head = new THREE.Vector3();
/** Голоса моторов: лодки в заливе и катера «Ласточка» (номера картов — меньше) */
const BOAT_ENGINE = 9000;
const LAUNCH_ENGINE = 9001;
/** Катер у причала — пока статуса с сервера нет (в меню) */
const BOAT_DOCKED: BoatStatus = { ph: BP_DOCK, at: 0, n: 0, nick: '' };

export class LobbyScene implements Scene {
  readonly kind = 'lobby' as const;
  readonly world: LobbyWorld;
  private readonly d: SceneDeps;
  private readonly hud: LobbyHud;
  private readonly effects: Effects;
  private readonly fx: LobbyFx;
  private readonly slots: SlotMachines3D;
  private readonly wardrobe: Wardrobe;
  private readonly tables3d: DurakTables3D;
  private readonly dkHud: DurakHud;
  private readonly bjHud: BlackjackHud;
  private readonly blackjack3d: BlackjackTable3D;
  private readonly skillPortal: SkillPortal;
  private readonly kraken: Kraken;
  private skillStatus: SkillStatus | null = null;
  private readonly critters: LobbyCritters;
  private readonly storm3d: Storm3D;
  private readonly pirates3d: Pirates3D;
  private stormState = emptyStorm();
  private pirateState = emptyPirates();
  private pirateTail = emptyPirateTail();
  private lastMopTick = -1e6;
  private outerMenu = false;
  private sentMenu: boolean | null = null;
  private readonly entryCircles = new Map<string, StartCircle>();
  private boatRaceStatus: GatherStatus | BoatRaceStatus | null = null;
  private hideStatus: GatherStatus | HideStatus | null = null;
  private startZone: { kind: 'paintball' | 'fort' | null; left: number } = { kind: null, left: 0 };
  private readonly defenders: {id:number;x:number;y:number;z:number;yaw:number;eligible:boolean}[] = [];
  private readonly fishForCritters: {x:number;z:number}[] = [];
  private readonly photo: PhotoBooth;
  private readonly ball: LobbyBall;
  private readonly fishing: FishingSpots;
  private readonly fishHud: FishHud;
  /** Рыбалка 2.0: шкала вываживания, карточка улова, журнал, доска рекордов (без флага сервера молчит) */
  private readonly fish2: Fish2Hud;
  private readonly fishDrink: FishDrink;
  private readonly folk: LobbyFolk;
  /** «Press F to pay respects» у статуи: свечи, огоньки, свет, плита со счётом, мелодия */
  private readonly respects: Respects;
  /** Кто на каком месте рыбалки (желейка) — каждый кадр */
  private readonly fishOcc: Array<Avatar | null> = FISH_SPOTS.map(() => null);
  /** Своё место рыбалки (до «ушёл с места» от сервера), −1 — не рыбачим */
  private myFishSpot = -1;
  private fishSentAt = 0;
  /** Цена последнего улова: продал — звон монет */
  private catchPrice = 0;
  /** Меня зовут на жест вдвоём: кто, какой, до какого времени (performance.now) */
  private ask: { id: number; k: number; until: number } | null = null;
  /** Отложено на кадр (по времени сцены): хлопок ладоней, вспышка у маяка */
  private later: Array<{ at: number; run: () => void }> = [];
  /** Свой стул за столом дурака (номер места), −1 — не за столом */
  private dkSeat = -1;
  /** Когда пришёл последний вид каждого стола (таймеры панели — от него) */
  private readonly dkRecv: number[] = [];
  /** Последняя своя рука: приходит раньше, чем снимок посадит за стол */
  private dkHand: { table: number; cards: number[] } | null = null;
  private readonly cam = new LobbyCamera();
  private readonly me = new Avatar(0, { gun: false });
  private readonly header = makeHeader();
  private readonly selfSnap = makeState();
  private readonly ents: EntitySnap[] = [];
  private readonly inputs: Input[] = [makeInput()];
  private readonly sample: RemoteSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, extra: 0 };
  private readonly remotes = new Map<number, Remote>();
  private readonly infos = new Map<number, LobbyPlayerInfo>();
  private readonly seen = new Set<number>();
  private readonly pose: AvatarPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0 };
  private clock = new ClockSync(LOBBY_MIN_DELAY);
  private predictor: Predictor;

  private entered = false;
  private myId = -1;
  private hasSelf = false;
  /** Своё действие и его аргумент — по серверу */
  private action = ACT_NONE;
  private arg = 0;
  /** Эмоцию по клавише показываем сразу; до этого времени снимок её не перебивает */
  private localUntil = 0;
  private emoteAt = 0;
  private wardrobeOpen = false;
  private spinSentAt = 0;
  private spinUntil = 0;
  /** Ближайший предмет, на который сейчас подсказка */
  private target: Interactable | null = null;
  /** Занятые другими: автоматы (биты) и места */
  private busySlots = 0;
  private readonly busySeats = new Set<number>();
  private readonly busyFish = new Set<number>();
  private pool = -1;
  private pbHumans = 0;
  /** «Крепость»: статус с сервера (null — режим выключен флагом: арки нет, точка молчит) и сама арка */
  private fortSt: FortStatus | null = null;
  private fortGate: FortGate | null = null;
  /** «Fight Club»: статус круга мелом (null — режим выключен флагом: двери нет, круг молчит), дверь и писк отсчёта */
  private fcSt: FcStatus | null = null;
  private fcDoor: FightDoor | null = null;
  private fcBeep = 0;
  /** Последняя секунда отсчёта, на которой пискнули (0 — не пищим) */
  private kartBeep = 0;
  /** Катер «Ласточка»: статус с сервера и где он на экране (по часам отрисовки — там же сидят его пассажиры) */
  private boat: BoatStatus = { ...BOAT_DOCKED };
  private readonly boatPose: BoatPose = { ...LAUNCH };
  /** Куда смотрел нос в прошлом кадре: в поездке взгляд поворачивает вместе с катером */
  private boatYaw = LAUNCH.yaw;
  private readonly boatSign: BoatSign;
  /** Над катером во время посадки: отсчёт и «Садись!» */
  private readonly boatBanner: BoatBanner;
  private readonly seatTmp = { x: 0, z: 0 };
  /**
   * Аквапарк «Волна»: полоса и доска рекордов; препятствия в шаге предсказания (по метке входа, как на сервере);
   * свой забег — номер своего входа на старте по серверу (0 — не бежим), на финише по своему предсказанию (0 — ещё нет)
   * и итог финиша от сервера
   */
  private readonly aqua: AquaPark;
  private readonly aquaDyn: AquaDyn;
  private readonly aquaHook: StepHook;
  private aquaTop: AquaRow[] = [];
  private aquaAt = 0;
  private aquaFin = 0;
  private aquaDone: { ms: number; sub: string; until: number } | null = null;
  /** Толкнуло в прошлом шаге предсказания (звук — только в первом) */
  private aquaKnocked = false;
  /** Метки времени своих входов: последняя посланная (не назад) и две последние — по ним препятствия на экране */
  private lastVt = 0;
  private aquaT0 = 0;
  private aquaT1 = 0;
  /** Опора под желейками для теней: настил и неподвижное — из мира, паромы и лифт — как на экране */
  private readonly ground: { groundBelow(x: number, y: number, z: number): number };
  /** «Топ проигравших» на стене павильона автоматов (отладка: __opus.app.lobby.losers.set(строки, свой pid)) */
  readonly losers: LosersScreen;
  /** Экран с чатом друзей из Telegram на крыше склада (отладка: __opus.app.active.tg.demo()) */
  readonly tg: TgScreen;
  /** Колесо обозрения; своя поездка — когда кабинка приедет вниз (тик, 0 — не едем) */
  private readonly ferris: FerrisWheel;
  private wheelUntil = 0;
  private readonly wheelTmp = { x: 0, y: 0, z: 0, yaw: 0 };

  // тики
  private seq = 0;
  private acc = 0;
  private queueAvg = 1;
  private stepDist = 0;
  /** Тик сервера минус мой вход, применённый в нём (по последнему снимку): так время чужих — в номерах моих входов */
  private tickLag = 0;

  // служебное
  private time = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 0;
  private lastFrameMs = 0;

  constructor(d: SceneDeps) {
    this.d = d;
    this.world = new LobbyWorld(d.renderer, lobbyQuality(d.settings.quality));
    for (const index of this.world.map.fishPropsBoxes) this.world.collision.setEnabled(index, false);
    for (const index of this.world.map.skillPortalBoxes) this.world.collision.setEnabled(index, false);
    const col = this.world.collision;
    this.aquaDyn = new AquaDyn(col, this.world.map.aquaMovers);
    const dyn = this.aquaDyn;
    this.aquaHook = {
      before: (s, inp, prev) => {
        const storm = stormInput(s, inp, inp.viewTick, this.stormState, this.eventEligible);
        const step = this.eventEligible ? pirateInput(s, storm, inp.viewTick, this.pirateTail.knock) : storm;
        dyn.pre(s, inp.viewTick, Number.isNaN(prev) ? inp.viewTick : prev);
        return step;
      },
      after: (s, inp, ev) => {
        dyn.post(s, ev, inp.viewTick);
        stormPush(s, col, inp.viewTick, this.stormState, this.eventEligible);
        if (this.eventEligible) piratePush(s, col, inp.viewTick, this.pirateTail.knock);
      },
    };
    this.ground = { groundBelow: (x, y, z) => Math.max(col.groundBelow(x, y, z), this.aqua.groundBelow(x, y, z)) };
    this.predictor = new Predictor(col, this.aquaHook);
    this.effects = new Effects(this.world.scene, this.world.collision);
    this.ball = new LobbyBall(this.world, this.effects, d.sound);
    this.hud = new LobbyHud(d.hudRoot);
    this.critters = new LobbyCritters(this.world.scene, {
      onPurr: (x, y, z, hiss) => d.sound.purr([x, y, z], hiss),
      onGullCry: (x, y, z) => d.sound.gullCry([x, y, z]),
    });
    this.storm3d = new Storm3D(this.world.scene, this.hud.root, {
      climate: (dark, rain, flash, lamps) => this.world.setStormClimate(dark, rain, flash, lamps),
      lamp: (enabled) => this.world.setLighthouseEnabled(enabled),
      sound: (kind) => d.sound.lobbyEvent(kind),
      light: () => d.net.send({ t: 'stormLight' }),
      lampPosition: this.world.lighthouse.lampAnchor.getWorldPosition(new THREE.Vector3()),
    });
    this.pirates3d = new Pirates3D(this.world.scene, this.hud.root, {
      swing: () => { d.input.touchButton(0, true); d.input.touchButton(0, false); },
      sound: (kind) => d.sound.lobbyEvent(kind),
    });
    this.pirates3d.attachMop(this.me.root);
    for (const z of START_ZONES) {
      const circle = new StartCircle(this.world.scene, { ...z, color: z.kind === 'fort' ? 0xd9b465 : 0x6fc7b8, label: z.kind === 'fort' ? 'КРЕПОСТЬ' : 'ПЕЙНТБОЛ', subtitle: 'Встань на 3 секунды · E — сразу' });
      circle.setVisible(false); this.entryCircles.set(z.kind, circle);
    }
    for (const [kind, zone, label, color] of [['boatrace', BOAT_RACE_CIRCLE, 'ГОНКИ НА КАТЕРАХ', 0x57ccdb], ['hide', HIDE_CIRCLE, 'ПРЯТКИ В ГОРОДЕ', 0xd9b77b]] as const) {
      const circle = new StartCircle(this.world.scene, { ...zone, color, label, subtitle: 'Круг сбора · старт через 15 с' });
      circle.setVisible(false); this.entryCircles.set(kind, circle);
    }
    this.hud.onTap = (code) => {
      d.input.tap(code, true);
      d.input.tap(code, false);
    };
    this.fx = new LobbyFx(this.world.scene, lobbyQuality(d.settings.quality));
    this.slots = new SlotMachines3D(this.world, d.sound, this.fx);
    this.slots.onJackpot = (nick, win) => this.hud.showJackpot(nick, win);
    this.wardrobe = new Wardrobe(this.hud.root);
    this.wardrobe.onWear = (o) => d.net.send({ t: 'outfit', o });
    this.wardrobe.onBuy = (item) => d.net.send({ t: 'buy', item });
    this.wardrobe.onRedeem = code => d.net.send({ t: 'redeem', code });
    this.wardrobe.onPreview = (o) => this.me.setOutfit(o);
    this.wardrobe.onClose = () => this.leaveWardrobe(true);
    this.tables3d = new DurakTables3D(this.world, d.sound, [0, 1]);
    this.dkHud = new DurakHud(this.hud.root);
    this.dkHud.onAct = (a, card, on) => {
      if (this.dkSeat >= 0) d.net.send({ t: 'durak', table: seatTable(this.dkSeat), a, card, on });
    };
    this.dkHud.onLeave = () => this.leaveTable(true);
    const blackjackTable = this.world.map.tables[BJ_TABLE];
    this.blackjack3d = new BlackjackTable3D(this.world.scene, blackjackTable.x, blackjackTable.z);
    this.bjHud = new BlackjackHud(this.hud.root);
    this.bjHud.onAct = (a, rev, amount) => {
      if (this.blackjackSeated) d.net.send({ t: 'blackjack', table: BJ_TABLE, a, rev, amount });
    };
    this.bjHud.onLeave = () => this.leaveTable(true);
    this.skillPortal = new SkillPortal(this.world.scene, SKILL_PORTAL.x, SKILL_PORTAL.z);
    this.skillPortal.setVisible(false);
    this.kraken = new Kraken(this.world.scene, { onScare: (p) => d.sound.krakenScare([p.x, p.y, p.z]) });
    this.photo = new PhotoBooth(this.hud.root, d.overlay);
    this.photo.onBeep = () => d.sound.countBeep(false);
    this.fishing = new FishingSpots(this.world.scene, this.effects, this.fx, d.sound, this.me);
    addFishPlaces3d(this.world.scene);
    this.fishDrink = new FishDrink(this.me, d.sound);
    this.folk = new LobbyFolk(this.world.scene, this.world.collision, this.effects, this.fx, d.sound);
    this.respects = new Respects(this.world.scene, this.fx, d.sound);
    this.boatSign = new BoatSign(this.world.scene);
    this.boatBanner = new BoatBanner(this.world.scene);
    this.aqua = new AquaPark(this.world.scene, this.effects);
    this.losers = new LosersScreen(this.world.scene);
    this.tg = new TgScreen(this.world.scene);
    this.ferris = new FerrisWheel(this.world.scene);
    this.me.honorAt = STATUE_AT;
    this.fishHud = new FishHud(this.hud.root, d.overlay);
    this.fishHud.onChoose = (keep) => d.net.send({ t: 'fish', a: keep ? 'keep' : 'sell' });
    this.fish2 = new Fish2Hud(this.hud.root, this.world.scene, d.sound, d.ui, (msg) => d.net.send(msg), d.overlay);
    this.fish2.onBookOpen = () => { d.input.releaseAll(); d.input.unlock(); };
    this.fish2.onBookClose = () => d.wantPointer();
    this.fish2.onNpcOpen = () => { d.input.releaseAll(); d.input.unlock(); };
    this.fish2.onNpcClose = () => d.wantPointer();
    this.fish2.onBeer = () => this.fishDrink.start();
    // pointerdown, а не mousedown: на телефоне помидор бросают пальцем
    d.renderer.canvas.addEventListener('pointerdown', (e) => this.onCanvasDown(e));
    this.me.addTo(this.world.scene);
    window.addEventListener('wheel', (e) => {
      if (this.entered && d.input.locked && !d.input.blocked) this.cam.zoomBy(e.deltaY);
    }, { passive: true });
  }

  /**
   * В примерочной и за столом дурака мышь отпущена — пауза при этом не нужна. Встал из-за стола (стол уже убран) —
   * мышь нужна сразу, не дожидаясь ответа сервера: не удался захват — пауза, а не курсор без камеры.
   */
  get wantsPointer(): boolean {
    const act = this.myAct;
    return !((this.wardrobeOpen && act === ACT_WARDROBE) || (act === ACT_DURAK && this.dkSeat >= 0) || this.fish2.modalOpen);
  }

  /** Меню примерочной — div, поэтому одной проверки native dialog для PTT недостаточно. */
  get voiceBlocked(): boolean { return this.outerMenu || this.wardrobeOpen || this.fish2.modalOpen; }

  /**
   * Телефон: у автомата — «крутить», с удочкой — «заброс», в поездке на катере — только осмотреться пальцем,
   * за столом и в примерочной — только верхние кнопки.
   */
  get touchMode(): TouchMode {
    const act = this.myAct;
    if (!this.hasSelf || act === ACT_DURAK || (act === ACT_WARDROBE && this.wardrobeOpen) || this.fish2.modalOpen) return 'none';
    if (act === ACT_SLOT) return 'slot';
    if (act === ACT_FISH) return 'fish';
    if (isRiding(act)) return 'ride';
    return 'walk';
  }

  /** Телефон: у статуи на кнопке действия — «F» (отдать честь), иначе — «E». */
  get touchUseIcon(): string {
    return this.target === null && this.respectHere ? 'F' : 'E';
  }

  /** Своё действие с учётом предсказания: шагнул — уже встал, не дожидаясь сервера. */
  private get myAct(): number {
    return isHeld(this.action) && this.predictor.hold === 0 ? ACT_NONE : this.action;
  }

  private get blackjackSeated(): boolean {
    return this.dkSeat >= 0 && seatTable(this.dkSeat) === BJ_TABLE;
  }

  /** Меню оболочки и диалоги сцены составляют один серверный признак. */
  setMenuOpen(open: boolean): void {
    this.outerMenu = open;
    this.syncMenu();
  }

  private syncMenu(): void {
    if (!this.entered || this.myId < 0) return;
    const open = this.outerMenu || this.wardrobeOpen || this.fish2.modalOpen;
    if (open === this.sentMenu) return;
    this.sentMenu = open;
    this.d.net.send({ t: 'lobbyMenu', open });
  }

  private get eventEligible(): boolean {
    return this.hasSelf && !this.outerMenu && !this.wardrobeOpen && !this.fish2.modalOpen && !isHeld(this.myAct);
  }

  private get raiding(): boolean {
    return this.eventEligible && this.pirateState.phase === 'raid' && this.pirateTail.visible;
  }

  private get nearStormLight(): boolean {
    const p = this.pose, v = this.stormState;
    return this.eventEligible && (v.phase === 'storm' || v.phase === 'calm' && this.clock.renderTick < v.rankEnd)
      && Math.hypot(p.x - STORM_GOAL.x, p.z - STORM_GOAL.z) <= STORM_GOAL.r && Math.abs(p.y - STORM_GOAL.y) <= .75;
  }

  private resetAdditions(): void {
    this.sentMenu = null;
    this.skillStatus = this.boatRaceStatus = this.hideStatus = null;
    this.skillPortal.setVisible(false);
    for (const index of this.world.map.skillPortalBoxes) this.world.collision.setEnabled(index, false);
    for (const circle of this.entryCircles.values()) circle.setVisible(false);
    this.startZone = { kind: null, left: 0 };
    this.stormState = emptyStorm(); this.pirateState = emptyPirates(); this.pirateTail = emptyPirateTail();
    this.storm3d.set(this.stormState); this.pirates3d.set(this.pirateState); this.pirates3d.setTail(this.pirateTail, 0);
    this.storm3d.update(0, 0, this.pose, false);
    this.pirates3d.update(0, 0, this.world.camera, false);
    this.lastMopTick = -1e6;
  }

  private onGather(kind: 'boatrace' | 'hide', status: GatherStatus | BoatRaceStatus | HideStatus | null): void {
    if (kind === 'boatrace') this.boatRaceStatus = status as GatherStatus | BoatRaceStatus | null;
    else this.hideStatus = status as GatherStatus | HideStatus | null;
    const circle = this.entryCircles.get(kind)!;
    circle.setVisible(!!status);
    if (!status) return;
    circle.status({ ...status, left: status.phase === 'count' && 'left' in status ? status.left : undefined, max: 'max' in status ? status.max : 6,
      hint: status.phase === 'idle' ? kind === 'hide' ? 'Нужно 2–8 игроков' : '1–6 игроков · можно с ботами'
        : status.phase === 'count' ? 'Сбор игроков' : 'Раунд идёт · дождись окончания' });
  }

  setQuality(q: Quality, slow = false): void {
    this.world.setQuality(lobbyQuality(q, slow));
    this.fx.setQuality(lobbyQuality(q, slow));
    this.kraken.setQuality(lobbyQuality(q, slow));
  }

  // ------------------------------------------------------------ вход и выход

  enter(): void {
    this.entered = true;
    this.resetAdditions();
    this.myId = -1;
    this.hasSelf = false;
    this.action = ACT_NONE;
    this.arg = 0;
    this.localUntil = 0;
    this.wardrobeOpen = false;
    this.spinUntil = 0;
    this.target = null;
    this.busySlots = 0;
    this.busySeats.clear();
    this.busyFish.clear();
    this.slots.reset();
    this.fx.clear();
    this.tables3d.reset();
    this.dkHud.hide();
    this.bjHud.hide();
    this.blackjack3d.reset();
    this.kraken.reset();
    this.dkSeat = -1;
    this.dkHand = null;
    this.me.hidden = false;
    this.clearAsk();
    this.later = [];
    this.photo.reset();
    this.ball.reset();
    this.fishing.reset(null);
    this.fishHud.reset();
    this.fish2.reset();
    this.fishDrink.reset();
    this.myFishSpot = -1;
    this.aquaAt = 0;
    this.aquaFin = 0;
    this.aquaDone = null;
    this.lastVt = 0;
    this.aquaT0 = this.aquaT1 = 0;
    this.seq = 0;
    this.acc = 0;
    this.queueAvg = 1;
    this.stepDist = 0;
    this.clock = new ClockSync(LOBBY_MIN_DELAY);
    this.predictor = new Predictor(this.world.collision, this.aquaHook);
    const me = this.d.ui.me();
    this.me.setOutfit(me.outfit);
    this.me.setInfo(me.nick, null, false, me.level);
    this.me.setAction(ACT_NONE, 0);
    this.cam.reset();
    this.hud.setVisible(true);
    if (this.wardrobe.isOpen) this.wardrobe.close();
    this.hud.setHint(null);
    this.d.ui.chat.setPlaceholder('Сообщение');
  }

  exit(): void {
    this.resetAdditions();
    this.entered = false;
    this.hasSelf = false;
    this.action = ACT_NONE;
    this.wardrobeOpen = false;
    if (this.wardrobe.isOpen) this.wardrobe.close();
    for (const r of this.remotes.values()) r.avatar.dispose(this.world.scene);
    this.remotes.clear();
    this.infos.clear();
    this.me.update(null, 0, this.time, this.world.collision, this.world.camera.position, true);
    this.slots.reset();
    this.fx.clear();
    this.tables3d.reset();
    this.dkHud.hide();
    this.bjHud.hide();
    this.blackjack3d.reset();
    this.kraken.reset();
    this.dkSeat = -1;
    this.dkHand = null;
    this.me.hidden = false;
    this.clearAsk();
    this.later = [];
    this.photo.reset();
    this.ball.reset();
    this.fishing.reset(null);
    this.fishHud.reset();
    this.fish2.reset();
    this.fishDrink.reset();
    this.myFishSpot = -1;
    this.aquaAt = 0;
    this.aquaFin = 0;
    this.aquaDone = null;
    this.hud.setTimer(null);
    this.hud.setVisible(false);
    this.d.sound.setRain(0);
    this.d.sound.engineStop(BOAT_ENGINE);
    this.d.sound.engineStop(LAUNCH_ENGINE);
    this.setBoat(BOAT_DOCKED);
  }

  // ------------------------------------------------------------ сеть: JSON

  onJson(msg: ServerMsg): void {
    switch (msg.t) {
      case 'redeemResult':
        this.wardrobe.giftResult(msg.result);
        return;
      case 'lobby':
        this.myId = msg.id;
        this.d.input.yaw = msg.yaw;
        this.d.input.pitch = -0.12;
        this.setInfos(msg.players);
        this.pool = msg.pool;
        this.onPb(msg.pb);
        this.onHonor(msg.honor);
        msg.tables.forEach((v, t) => this.onTable(t, v));
        if (msg.blackjack) this.onBlackjack(msg.blackjack);
        this.skillStatus = msg.skill ?? null;
        this.skillPortal.setVisible(!!msg.skill);
        for (const index of this.world.map.skillPortalBoxes) this.world.collision.setEnabled(index, !!msg.skill);
        if (msg.skill) this.skillPortal.status(msg.skill);
        this.entryCircles.get('paintball')!.setVisible(true);
        this.entryCircles.get('paintball')!.status({ hint: 'Встань на 3 секунды · E — сразу' });
        this.onGather('boatrace', msg.boatrace ?? null);
        this.onGather('hide', msg.hide ?? null);
        this.world.kartStart.update(msg.kart);
        // рыбалка 2.0 — до мест рыбалки: вываживание в 3D у неё своё
        if (this.fish2.lobby(msg.fish2 === 1, msg.ftop ?? null, msg.rain === 1)) this.d.renderer.refreshShadows();
        for (const index of this.world.map.fishPropsBoxes) this.world.collision.setEnabled(index, this.fish2.on);
        this.fishing.v2 = this.fish2.on;
        this.folk.setV2(this.fish2.on);
        this.fishing.reset(msg.fish);
        this.world.setRain(msg.rain === 1, true);
        this.respects.setCount(msg.respects ?? 0);
        this.setBoat(msg.boat ?? BOAT_DOCKED);
        this.setAquaTop(msg.aqua ?? []);
        this.losers.set(msg.losers ?? [], this.d.ui.me().pid);
        this.onFort(msg.fort ?? null);
        this.onFightSt(msg.fc ?? null);
        break;
      case 'fortSt':
        this.onFort(msg);
        break;
      case 'fcSt':
        this.onFightSt(msg);
        break;
      case 'boat':
        this.setBoat(msg);
        break;
      case 'aquaTop':
        this.setAquaTop(msg.top);
        break;
      case 'losers':
        this.losers.set(msg.top, this.d.ui.me().pid);
        break;
      case 'aquaRun':
        // старт — номер своего входа: секундомер идёт по своим шагам, как время у сервера
        this.aquaFin = 0;
        if (msg.a === 'start') {
          this.aquaAt = msg.at;
          this.aquaDone = null;
        } else if (msg.a === 'stop') {
          this.aquaAt = 0;
        } else {
          this.aquaAt = 0;
          const sub = msg.place === 0 ? 'Рекорд полосы!' : msg.ms === msg.best ? 'Твой лучший!' : `твой лучший — ${fmtAquaTime(msg.best)}`;
          this.aquaDone = { ms: msg.ms, sub, until: performance.now() + 5000 };
        }
        break;
      case 'tg':
        this.tg.set(msg.title, msg.lines);
        break;
      case 'tgUp':
        this.tg.add(msg.title, msg.lines);
        break;
      case 'weather':
        this.world.setRain(msg.rain === 1);
        this.fish2.weather(msg.rain === 1);
        break;
      case 'kart':
        this.world.kartStart.update(msg);
        break;
      case 'kpos':
        this.world.kartStart.board.setPositions(msg.p);
        break;
      case 'lroster':
        this.setInfos(msg.players);
        break;
      case 'outfitOf': {
        const info = this.infos.get(msg.id);
        if (info) { info.o = msg.o; if (msg.level !== undefined) info.level = msg.level; }
        if (msg.id === this.myId) this.showMyOutfit(msg.o);
        else this.remotes.get(msg.id)?.avatar.setOutfit(msg.o);
        if (msg.level !== undefined) (msg.id === this.myId ? this.me : this.remotes.get(msg.id)?.avatar)?.setLevel(msg.level);
        break;
      }
      case 'chat':
        if (msg.room === 'lobby' && !msg.sys) this.avatarOfPid(msg.pid)?.say(msg.text);
        break;
      case 'lev':
        for (const e of msg.e) {
          if (e[0] === 'splash') this.onSplash(e[1], e[2], e[3]);
          else if (e[0] === 'tomato') this.onTomato(e[1], e[2], e[3]);
          else if (e[0] === 'react') this.onReact(e[1], e[2], e[3]);
          else if (e[0] === 'cheer') this.onCheer(e[1]);
          else if (e[0] === 'pair') this.onPairStart(e[1], e[2], e[3]);
          else if (e[0] === 'fish') this.onFish(e[1], e[2], e[3], e[4]);
          else if (e[0] === 'respect') this.onRespect(e[1], e[2]);
          else if (e[0] === 'aqhit') this.onAquaHit(e[1], e[2], e[3]);
          else this.onPhoto(e[1]);
        }
        break;
      case 'pairAsk':
        this.onPairAsk(msg.id, msg.nick, msg.k);
        break;
      case 'pairOff':
        if (this.ask?.id === msg.id) this.clearAsk();
        break;
      case 'durak':
        this.onTable(msg.table, msg.v);
        break;
      case 'durakHand':
        this.dkHand = { table: msg.table, cards: msg.cards };
        if (this.dkSeat >= 0 && seatTable(this.dkSeat) === msg.table) this.dkHud.setHand(msg.cards);
        break;
      case 'blackjack':
        this.onBlackjack(msg.v);
        break;
      case 'blackjackError':
        this.bjHud.onError(msg.message);
        break;
      case 'skillSt':
        this.skillStatus = msg;
        this.skillPortal.status(msg);
        break;
      case 'brSt': this.onGather('boatrace', msg.v); break;
      case 'hideSt': this.onGather('hide', msg.v); break;
      case 'startZone':
        this.startZone = msg;
        for (const kind of ['paintball', 'fort']) this.entryCircles.get(kind)!.status({ left: kind === msg.kind ? msg.left : 0, hint: 'Встань на 3 секунды · E — сразу' });
        break;
      case 'storm': this.stormState = msg.v; this.storm3d.set(msg.v); break;
      case 'pirates': this.pirateState = msg.v; this.pirates3d.set(msg.v); break;
      case 'pb':
        this.onPb(msg);
        break;
      case 'honor':
        this.onHonor(msg);
        break;
      case 'pool':
        this.pool = msg.n;
        break;
      case 'slotSpin':
        this.onSpin(msg);
        break;
      case 'fishCatch':
        this.catchPrice = msg.price;
        this.fishHud.showCatch(msg);
        break;
      case 'fishReel':
        this.fish2.onReel(msg, this.myFishSpot);
        break;
      case 'fishLand':
        this.fish2.onLand(msg);
        break;
      case 'fishTop':
        this.fish2.setTop(msg.top);
        break;
      case 'fishProgress':
        this.fish2.onProgress(msg.progress, msg.now);
        break;
      case 'fishNpc':
        this.fish2.onNpc(msg);
        break;
      case 'fishEvent':
        this.fish2.onEvent(msg.on, msg.until);
        break;
      case 'tokens':
        this.fish2.refreshBalance();
        this.bjHud.setBalance(this.d.ui.me().tokens);
        break;
      case 'me':
        this.onMe();
        break;
    }
  }

  private setInfos(list: LobbyPlayerInfo[]): void {
    this.infos.clear();
    for (const p of list) this.infos.set(p.id, p);
    for (const [id, r] of this.remotes) {
      const info = this.infos.get(id);
      if (info) applyInfo(r.avatar, info);
    }
    const mine = this.infos.get(this.myId);
    if (mine) { this.showMyOutfit(mine.o); this.me.setLevel(mine.level ?? this.d.ui.me().level); }
  }

  /** Свой наряд с сервера; в примерочной на желейке — то, что в ней выбрано (с примеркой). */
  private showMyOutfit(o: Outfit): void {
    this.me.setOutfit(this.wardrobe.isOpen ? this.wardrobe.preview : o);
  }

  /**
   * Профиль с сервера (купили, переоделись): примерочной — целиком, иначе — наряд на свою желейку.
   * Наряд — как его видят все (из ростера: с колпаком дурака и погонами), профиль — если ростера ещё нет.
   */
  private onMe(): void {
    const me = this.d.ui.me();
    this.me.setInfo(me.nick, null, false, me.level);
    if (this.wardrobe.isOpen) this.wardrobe.update(me);
    else if (this.entered) this.me.setOutfit(this.infos.get(this.myId)?.o ?? me.outfit);
    this.fish2.onMe();
    this.bjHud.setBalance(me.tokens);
    // свой лучший на доске аквапарка
    this.setAquaTop(this.aquaTop);
  }

  /** Доска рекордов аквапарка: строки с сервера, своя подсвечена, внизу — свой лучший. */
  private setAquaTop(rows: AquaRow[]): void {
    this.aquaTop = rows;
    const me = this.d.ui.me();
    this.aqua.setTop(rows, me.pid, me.stats.aqBest);
  }

  private avatarOfPid(pid: number): Avatar | null {
    for (const info of this.infos.values()) {
      if (info.pid !== pid) continue;
      return info.id === this.myId ? this.me : (this.remotes.get(info.id)?.avatar ?? null);
    }
    return null;
  }

  /** Статус крепости: первый — ставим арку (и пересчитываем тени), дальше — обновляем табличку. */
  private onFort(st: FortStatus | null): void {
    this.fortSt = st;
    this.entryCircles.get('fort')!.setVisible(!!st);
    this.entryCircles.get('fort')!.status({ left: this.startZone.kind === 'fort' ? this.startZone.left : 0, hint: 'Встань на 3 секунды · E — сразу' });
    if (st && !this.fortGate) {
      this.fortGate = new FortGate(this.world.scene);
      this.d.renderer.refreshShadows();
    }
    this.fortGate?.setStatus(st);
  }

  /** Круг «Fight Club»: первый статус — ставим дверь в стене кафе, дальше — картон и мел. */
  private onFightSt(st: FcStatus | null): void {
    this.fcSt = st;
    if (st && !this.fcDoor) this.fcDoor = new FightDoor(this.world.scene);
    if (st) this.fcDoor?.setStatus(st);
  }

  private onPb(pb: PbStatus): void {
    this.pbHumans = pb.humans;
    this.world.gateScreen.update(pb);
  }

  /** Доска почёта: спереди — списки, сзади — «Последние входы» (пока сервер старый, без списка — пусто). */
  private onHonor(h: HonorInfo): void {
    this.world.honorBoard.update(h);
    this.world.recentBoard.set(h.recent ?? [], performance.now());
  }

  /** Чужого сбила вертушка или мешок: «пумф» и брызги пены (себя — уже по предсказанию, см. aquaLocal). */
  private onAquaHit(x: number, z: number, id: number): void {
    if (id === this.myId) return;
    const y = this.remotes.get(id)?.pose.y ?? 0;
    this.d.sound.ballKick([x, y + 0.8, z], 12);
    this.effects.burst(x, y + 0.8, z, 0xffffff, 14, 3.5, 0, 0.6, 0, 0.05);
  }

  /** Своё на полосе после шага предсказания: толкнуло — «пумф»; встал на финиш — секундомер встаёт (итог скажет сервер). */
  private aquaLocal(seq: number): void {
    const s = this.predictor.state;
    const k = this.aquaDyn.knock;
    if (k !== 0 && !this.aquaKnocked) {
      this.d.sound.ballKick(null, k === KNOCK_BAG ? 15 : 12);
      this.effects.burst(s.x, s.y + 0.8, s.z, 0xffffff, 14, 3.5, 0, 0.6, 0, 0.05);
    }
    this.aquaKnocked = k !== 0;
    if (this.aquaAt > 0 && this.aquaFin === 0 && s.grounded === 1 && onFinish(s.x, s.y, s.z)) this.aquaFin = seq;
  }

  /** Время препятствий аквапарка на экране: между метками двух последних своих входов — как своя желейка между ними. */
  private aquaDrawTick(alpha: number): number {
    if (this.hasSelf && this.aquaT1 > 0) return this.aquaT0 + (this.aquaT1 - this.aquaT0) * alpha;
    return this.clock.ready ? this.clock.renderTick : (performance.now() / 1000) * TICK_RATE;
  }

  private onSplash(x: number, z: number, id: number): void {
    const mine = id === this.myId;
    this.effects.waterSplash(x, z, true);
    this.d.sound.splash(mine ? null : [x, WATER_Y, z]);
    // у аквапарка сервер ставит упавшего на мостик старта
    if (mine) this.d.ui.toasts.show(aquaFall(x) ? 'Плюх! 🌊 Снова на мостике — ещё попытка' : 'Плюх! 🌊 Выбираемся обратно на площадь');
  }

  // ------------------------------------------------------------ дурак

  /** Новый вид стола: карты и боты в 3D, свой стол — ещё и на панель. */
  private onTable(t: number, v: DurakTableView): void {
    if (t === BJ_TABLE) return;
    const now = performance.now();
    this.dkRecv[t] = now;
    this.tables3d.apply(t, v);
    if (this.dkSeat >= 0 && seatTable(this.dkSeat) === t) this.dkHud.setView(v, now);
  }

  private onBlackjack(view: BlackjackView): void {
    this.blackjack3d.setView(view);
    this.bjHud.setView(view, performance.now());
    this.bjHud.setBalance(this.d.ui.me().tokens);
  }

  /** Желейка на стуле стола: бот, другой игрок или своя. */
  private seatAvatar(t: number, ch: number): Avatar | null {
    const s = this.tables3d.view(t)?.seats[ch];
    if (!s) return null;
    if (s.k === 2) return this.tables3d.botAvatar(t, ch);
    if (s.k !== 1 || s.id <= 0) return null;
    return s.id === this.myId ? this.me : (this.remotes.get(s.id)?.avatar ?? null);
  }

  /** Помидор со стула from в стул to: летит дугой, в конце — клякса на лице, брызги и хлюп. */
  private onTomato(t: number, from: number, to: number): void {
    const a = this.tables3d.headPos(t, from, new THREE.Vector3());
    const b = this.tables3d.headPos(t, to, new THREE.Vector3());
    this.d.sound.whoosh([a.x, a.y, a.z]);
    const mine = this.dkSeat >= 0 && seatTable(this.dkSeat) === t;
    this.tables3d.throwTomato(a, b, () => {
      this.seatAvatar(t, to)?.tomato();
      // в меня: своя желейка спрятана — клякса на экране
      if (mine && seatChair(this.dkSeat) === to) this.dkHud.splat();
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      const l = Math.hypot(dx, dz) || 1;
      this.effects.burst(b.x, b.y, b.z, TOMATO_COLOR, 26, 3.4, dx / l, 0.3, dz / l, 0.05);
      this.d.sound.tomatoSplat([b.x, b.y, b.z]);
    });
  }

  /** У табло болеют за гонщиков: желейка кричит, у табло — аплодисменты. */
  private onCheer(slot: number): void {
    const av = slot === this.myId ? this.me : this.remotes.get(slot)?.avatar;
    av?.say(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
    this.d.sound.applause([BOARD_POS.x, 1.6, BOARD_POS.z + 2]);
  }

  // ------------------------------------------------------------ вдвоём и фото у маяка

  /** Меня зовут на жест вдвоём: плашка «Ник предлагает дать пять — жми 5» на 5 с и «динь». */
  private onPairAsk(id: number, nick: string, k: number): void {
    const a = PAIR_ASKS[k];
    if (!a) return;
    this.ask = { id, k, until: performance.now() + PAIR_ASK_MS };
    this.hud.showAsk(a[0], nick, a[1], a[2], PAIR_ASK_MS);
    this.d.sound.pairAsk();
  }

  private clearAsk(): void {
    this.ask = null;
    this.hud.hideAsk();
  }

  /**
   * 5 / 6: ответить на приглашение (та же клавиша) или позвать того, кто перед тобой. Никого рядом — подсказка,
   * на сервер не шлём; позвал — рука поднята сразу, не дожидаясь снимка.
   */
  private pair(k: number): void {
    const now = performance.now();
    if (now - this.emoteAt < EMOTE_GAP_MS) return;
    this.emoteAt = now;
    if (this.ask?.k === k) {
      this.d.net.send({ t: 'pair', k });
      this.clearAsk();
      return;
    }
    if (!this.someoneInFront()) {
      this.d.ui.toasts.show('Подойди к кому-нибудь ближе и повернись к нему лицом', 2600);
      return;
    }
    this.d.net.send({ t: 'pair', k });
    this.me.setAction(PAIR_ACTS[k], 0);
    this.localUntil = now + 600;
  }

  /** Есть кого позвать: стоит ближе 2 м впереди и не сидит (то же правило, что на сервере). */
  private someoneInFront(): boolean {
    const p = this.pose;
    const yaw = this.d.input.yaw;
    for (const r of this.remotes.values()) {
      const q = r.pose;
      if (q.valid && !isHeld(r.avatar.action) && pairReach(p.x, p.y, p.z, yaw, q.x, q.y, q.z)) return true;
    }
    return false;
  }

  /** Жест вдвоём начался: в момент хлопка (или когда руки сомкнутся) — звук, звёздочки или сердечки между двумя. */
  private onPairStart(k: number, a: number, b: number): void {
    if (a === this.myId || b === this.myId) this.clearAsk();
    this.at(k === 0 ? FIVE_HIT : HUG_HOLD, () => {
      const pa = this.posOf(a);
      const pb = this.posOf(b);
      if (!pa || !pb) return;
      const x = (pa.x + pb.x) / 2;
      const y = Math.max(pa.y, pb.y);
      const z = (pa.z + pb.z) / 2;
      const mine = a === this.myId || b === this.myId;
      if (k === 0) {
        this.fx.sparkle(x, y + 1.5, z, 26);
        this.fx.icons(x, y + 1.6, z, 0, 7);
        this.d.sound.highFive(mine ? null : [x, y + 1.5, z]);
      } else {
        this.fx.icons(x, y + 1.35, z, 1, 6);
        this.d.sound.hug(mine ? null : [x, y + 1, z]);
      }
    });
  }

  /** Где стоит игрок по номеру в снимке (своя — по предсказанию), null — не видно. */
  private posOf(slot: number): { x: number; y: number; z: number } | null {
    if (slot === this.myId) return this.hasSelf ? this.pose : null;
    const r = this.remotes.get(slot);
    return r?.pose.valid ? r.pose : null;
  }

  /** Жест вдвоём: желейке — где стоит партнёр (повернуться к нему и шагнуть навстречу). */
  private wirePartner(av: Avatar): void {
    av.hasPartner = false;
    if (!isPair(av.action) || av.arg === 0) return;
    const p = this.posOf(av.arg);
    if (!p) return;
    av.partner.set(p.x, p.y, p.z);
    av.hasPartner = true;
  }

  /** У маяка нажали «фото»: нажавший зовёт «Улыбочку!», рядом — отсчёт; через 3 с — вспышка и снимок. */
  private onPhoto(slot: number): void {
    const av = slot === this.myId ? this.me : this.remotes.get(slot)?.avatar;
    av?.say('Улыбочку! 📸');
    if (this.photoDist() < PHOTO_HEAR) this.photo.startCount();
    this.at(PHOTO_COUNT_S, () => {
      this.world.photoFlash();
      this.d.sound.shutter([PHOTO.x, 1.5, PHOTO.z]);
      const d = this.photoDist();
      if (d < PHOTO_HEAR) this.photo.flash();
      if (d < PHOTO_KEEP) {
        const avs = [this.me, ...[...this.remotes.values()].map((r) => r.avatar)];
        for (const a of avs) a.photoPose(PHOTO_LENS);
        this.photo.capture(this.world, this.photoPeople());
        for (const a of avs) a.photoPose(null);
      }
    });
  }

  /** Своя желейка — до площадки перед маяком (Infinity — ещё не на набережной). */
  private photoDist(): number {
    return this.hasSelf ? Math.hypot(this.pose.x - PHOTO.spotX, this.pose.z - PHOTO.spotZ) : Infinity;
  }

  /** Кто где — для подписи под снимком. */
  private photoPeople(): PhotoPerson[] {
    const list: PhotoPerson[] = [];
    if (this.hasSelf && this.me.inWorld) list.push({ nick: this.d.ui.me().nick, x: this.pose.x, y: this.pose.y, z: this.pose.z });
    for (const [id, r] of this.remotes) {
      const nick = this.infos.get(id)?.nick;
      if (nick && r.pose.valid) list.push({ nick, x: r.pose.x, y: r.pose.y, z: r.pose.z });
    }
    return list;
  }

  /** Сделать через delay секунд — в кадре, перед отрисовкой (снимку у маяка это важно). */
  private at(delay: number, run: () => void): void {
    this.later.push({ at: this.time + delay, run });
  }

  private runLater(): void {
    if (this.later.length === 0 || this.later.every((l) => l.at > this.time)) return;
    const due = this.later.filter((l) => l.at <= this.time);
    this.later = this.later.filter((l) => l.at > this.time);
    for (const l of due) l.run();
  }

  private onReact(t: number, ch: number, k: number): void {
    // за своим столом — ещё и у ника на панели: над головами в кадр не всегда влезает
    if (this.dkSeat >= 0 && seatTable(this.dkSeat) === t) this.dkHud.showReact(ch, k);
    const av = this.seatAvatar(t, ch);
    if (!av) return;
    av.react(k);
    const p = this.tables3d.headPos(t, ch, _v);
    this.d.sound.pop([p.x, p.y + 0.8, p.z]);
  }

  /** Сели за стол или встали: панель, мышь, развернуть стол к себе. */
  private setTableSeat(seat: number): void {
    if (seat === this.dkSeat) return;
    this.dkSeat = seat;
    this.me.hidden = seat >= 0;
    this.tables3d.setMe(seat);
    this.blackjack3d.setMe(seat >= 0 ? seatTable(seat) : -1, seat >= 0 ? seatChair(seat) : -1);
    if (seat < 0) {
      this.dkHud.hide();
      this.bjHud.hide();
      return;
    }
    const t = seatTable(seat);
    if (t === BJ_TABLE) {
      this.dkHud.hide();
      this.bjHud.show(t, seatChair(seat));
      this.bjHud.setBalance(this.d.ui.me().tokens);
      const view = this.blackjack3d.view();
      if (view) this.bjHud.setView(view);
      return;
    }
    this.bjHud.hide();
    this.dkHud.show(t, seatChair(seat));
    const v = this.tables3d.view(t);
    if (v) this.dkHud.setView(v, this.dkRecv[t] ?? performance.now());
    if (this.dkHand?.table === t) this.dkHud.setHand(this.dkHand.cards);
  }

  /** Встать из-за стола: по кнопке и Esc / E просим сервер, шагом встанем сами. Мышь — сразу, пока идёт жест. */
  private leaveTable(send: boolean): void {
    if (send) this.d.net.send({ t: 'unuse' });
    this.setTableSeat(-1);
    this.d.wantPointer();
  }

  /** Клик по холсту за столом: ближайшая к курсору голова (кроме своей) — в неё помидор. */
  private onCanvasDown(e: MouseEvent): void {
    if (e.button !== 0 || !this.entered || this.dkSeat < 0 || this.d.input.locked || this.d.input.blocked) return;
    const t = seatTable(this.dkSeat);
    const mine = seatChair(this.dkSeat);
    const v = this.tables3d.view(t);
    if (!v) return;
    const rect = this.d.renderer.canvas.getBoundingClientRect();
    const cam = this.world.camera;
    let best = -1;
    let bestD = TOMATO_PICK_PX;
    for (let ch = 0; ch < TABLE_SEATS; ch++) {
      const s = v.seats[ch];
      if (ch === mine || !s || s.k === 0 || (s.k === 1 && s.id === 0)) continue;
      this.tables3d.headPos(t, ch, _v).project(cam);
      if (_v.z > 1) continue;
      const sx = rect.left + ((_v.x + 1) / 2) * rect.width;
      const sy = rect.top + ((1 - _v.y) / 2) * rect.height;
      const dd = Math.hypot(sx - e.clientX, sy - e.clientY);
      if (dd < bestD) {
        bestD = dd;
        best = ch;
      }
    }
    if (best < 0) return;
    const now = performance.now();
    if (!this.dkHud.tomatoReady(now)) {
      this.d.ui.toasts.show('Помидор ещё не созрел — подожди немного 🍅');
      return;
    }
    this.dkHud.tomatoSent(now);
    this.d.net.send({ t: 'durak', table: t, a: 'tomato', on: best });
  }

  /** Кто-то дёрнул рычаг: барабаны крутятся у всех, итог (монеты, салют) — когда встанут. */
  private onSpin(msg: Extract<ServerMsg, { t: 'slotSpin' }>): void {
    const mine = msg.id === this.myId;
    if (mine) this.spinUntil = performance.now() + SPIN_MS;
    this.slots.onSpin(msg, mine, mine ? this.me : (this.remotes.get(msg.id)?.avatar ?? null));
  }

  /** Статус катера: в поездке его боксов у причала нет (как на сервере), катер на экране идёт по пути. */
  private setBoat(st: BoatStatus): void {
    this.boat = { ph: st.ph, at: st.at, n: st.n, nick: st.nick };
    const away = st.ph === BP_RIDE;
    for (const i of this.world.map.boatBoxes) this.world.collision.setEnabled(i, !away);
    this.world.boats.setRide(away, st.at);
  }

  /** Сколько секунд до отплытия (посадка) или до возвращения к причалу (поездка). */
  private boatSecs(): number {
    const b = this.boat;
    const end = b.ph === BP_RIDE ? b.at + BOAT_RIDE_TICKS : b.at;
    return Math.max(0, Math.ceil((end - this.clock.renderTick) / TICK_RATE));
  }

  // ------------------------------------------------------------ сеть: снимки

  onSnapshot(buf: ArrayBuffer, at: number): void {
    if (this.myId < 0) return;
    const n = decodeSnapshot(buf, this.header, this.selfSnap, this.ents);
    if (n < 0) return;
    const h = this.header;
    this.clock.addSample(h.tick, at);
    // Данные отдачи входят в переигрывание неподтверждённых входов ниже.
    if (readPirateTail(buf, h.tail + BALL_BYTES, this.pirateTail) >= 0) this.pirates3d.setTail(this.pirateTail, h.tick);
    this.queueAvg += (h.queue - this.queueAvg) * 0.05;
    this.tickLag = h.tick - h.ack;

    let action = this.action;
    let arg = this.arg;
    let busy = 0;
    this.busySeats.clear();
    this.busyFish.clear();
    this.seen.clear();
    for (let i = 0; i < n; i++) {
      const e = this.ents[i];
      // на набережной байт hp — действие, armor — его аргумент
      if (e.id === this.myId) {
        action = e.hp;
        // без действия на полосе аквапарка в аргументе — отставание времени препятствий (для чужих глаз), не аргумент
        arg = e.hp === ACT_NONE ? 0 : e.armor;
        continue;
      }
      if (e.hp === ACT_SLOT) busy |= 1 << e.armor;
      else if (e.hp === ACT_SIT || e.hp === ACT_DURAK) this.busySeats.add(e.armor);
      else if (e.hp === ACT_FISH) this.busyFish.add(e.armor);
      const r = this.remotes.get(e.id) ?? this.addRemote(e.id);
      // упал в воду и вынырнул на площади — без «проезда» через полкарты
      if (r.track.lastTick > 0 && Math.hypot(e.x - r.track.lastX, e.z - r.track.lastZ) > 4) r.track.clear();
      r.track.push(h.tick, e);
      this.seen.add(e.id);
    }
    this.busySlots = busy;
    for (const [id, r] of this.remotes) {
      if (this.seen.has(id)) continue;
      r.avatar.dispose(this.world.scene);
      this.remotes.delete(id);
    }

    this.setAction(action, arg);
    if (h.flags & SNAP_HAS_SELF) {
      const hold = holdMask(action);
      // в поездке на катере и на колесе желейку везёт сервер — встаём как он, без сверки (на экране она — на своём месте)
      if (h.flags & SNAP_SELF_RESET || !this.hasSelf || isRiding(action)) {
        this.predictor.reset(this.selfSnap, h.ack, hold);
        this.stepDist = 0;
      } else {
        this.predictor.reconcile(h.ack, this.selfSnap, hold);
      }
      this.hasSelf = true;
    }
    // мяч — после сверки своей желейки: его пересчёт идёт по её поправленным тикам
    this.ball.onSnapshot(buf, h, this.ents, n, this.myId, this.predictor);
  }

  private addRemote(id: number): Remote {
    const avatar = new Avatar(id, { gun: false });
    avatar.honorAt = STATUE_AT;
    const info = this.infos.get(id);
    if (info) applyInfo(avatar, info);
    avatar.addTo(this.world.scene);
    const r: Remote = {
      track: new RemoteTrack(id),
      avatar,
      pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, valid: false },
      steps: 0,
      fallAt: -1,
      bounceAt: -1,
    };
    this.remotes.set(id, r);
    return r;
  }

  /** Своё действие по снимку: сели, встали, эмоция кончилась. */
  private setAction(action: number, arg: number): void {
    const prev = this.action;
    if (action !== prev || arg !== this.arg) {
      this.action = action;
      this.arg = arg;
      const { input } = this.d;
      if (isHeld(action)) {
        // сели: взгляд — куда смотрит место (сидя камера облетает отсюда, у автомата — на барабаны)
        this.localUntil = 0;
        const spot = this.spotOf(action, arg);
        if (spot) {
          input.yaw = spot.yaw;
          // с удочкой — чуть вниз, на поплавок
          input.pitch = action === ACT_SIT || action === ACT_DURAK ? -0.22 : action === ACT_FISH ? -0.14 : 0;
        } else if (isAboard(action) && !isAboard(prev)) {
          // сел в катер — взгляд вперёд, по носу
          input.yaw = this.boatPose.yaw;
          input.pitch = -0.12;
        } else if (action === ACT_WHEEL && prev !== ACT_WHEEL) {
          // сел в кабинку колеса — взгляд на надпись TIREDWOOD на горе (чуть в сторону от желейки): при подъёме она
          // выплывает над крышами города; кабинка внизу снова через один оборот
          input.yaw = WHEEL_VIEW.yaw;
          input.pitch = WHEEL_VIEW.pitch;
          this.wheelUntil = this.clock.ready ? wheelArrival(Math.floor(arg / WHEEL_SEATS), Math.round(this.clock.renderTick)) : 0;
        }
      }
      if (action === ACT_FISH) this.myFishSpot = arg;
      if (action === ACT_WARDROBE) {
        this.wardrobeOpen = true;
        input.unlock();
      } else if (prev === ACT_WARDROBE) {
        this.wardrobeOpen = false;
        // встали (сами или сервер освободил) — мышь обратно; уже захвачена или запрос в пути — ничего не делает
        this.d.wantPointer();
      }
      // за столом дурака мышь — для карт и кнопок
      if (action === ACT_DURAK) {
        input.unlock();
        this.setTableSeat(arg);
      } else if (prev === ACT_DURAK) {
        this.setTableSeat(-1);
        this.d.wantPointer();
      }
    }
    if (performance.now() >= this.localUntil && (this.me.action !== action || this.me.arg !== arg)) this.me.setAction(action, arg);
  }

  /** Точка, куда ставит действие: автомат, место, примерочная. */
  private spotOf(action: number, arg: number): Interactable | undefined {
    const kind =
      action === ACT_SLOT ? 'slot'
      : action === ACT_SIT ? 'seat'
      : action === ACT_DURAK ? (seatTable(arg) === BJ_TABLE ? 'blackjack' : 'durak')
      : action === ACT_WARDROBE ? 'kiosk'
      : action === ACT_FISH ? 'fish'
      : null;
    return kind ? this.world.map.interact.find((it) => it.kind === kind && it.arg === arg) : undefined;
  }

  // ------------------------------------------------------------ ввод

  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    if (!down || e.repeat) return false;
    if (this.fish2.modalOpen) {
      if (code === 'Escape') {
        if (this.fish2.npcOpen) this.fish2.closeNpc();
        else this.fish2.closeBook();
      } else if (code === 'KeyJ' && this.fish2.bookOpen) this.fish2.closeBook();
      if (MOVE_KEYS.has(code) || code === 'KeyE') e.preventDefault();
      return true;
    }
    const act = this.myAct;
    if (act === ACT_WARDROBE && this.wardrobeOpen) {
      if (code === 'Escape') {
        this.leaveWardrobe(true);
        return true;
      }
      // шаг поднимет и так (сервер считает так же) — а мышь забираем сейчас, пока идёт жест
      if (MOVE_KEYS.has(code)) this.leaveWardrobe(false);
      return false;
    }
    if (this.d.input.blocked) return false;
    // журнал рыбака (рыбалка 2.0): J — открыть или закрыть, Esc — закрыть
    if (this.fish2.bookOpen && code === 'Escape') {
      this.fish2.closeBook();
      return true;
    }
    if (code === 'KeyJ' && this.fish2.on && this.hasSelf && act !== ACT_DURAK) {
      this.fish2.toggleBook();
      return true;
    }
    if (code === 'KeyF' && this.photo.hasCard) {
      this.photo.save();
      return true;
    }
    if (code === 'KeyF' && this.respectHere) {
      this.payRespect();
      return true;
    }
    if (act === ACT_DURAK) return this.tableKey(code, e);
    if (act === ACT_FISH) {
      // 1 / 2 — что делать с уловом; пробел — заброс и подсечка (в тике он снимается с прыжка)
      if (code === 'Digit1' || code === 'Digit2') {
        this.fishHud.choose(code === 'Digit1');
        return true;
      }
      if (code === 'Space') this.fishPress();
    }
    const emote = EMOTE_KEYS[code];
    if (emote !== undefined) {
      if (!isHeld(act)) this.emote(emote);
      return true;
    }
    const pk = PAIR_KEYS[code];
    if (pk !== undefined) {
      if (!isHeld(act) && this.hasSelf) this.pair(pk);
      return true;
    }
    // у автомата пробел крутит барабаны (в тике он снимается с прыжка)
    if (code === 'Space' && act === ACT_SLOT) this.spin();
    return false;
  }

  /**
   * За столом: 1–4 — реакции, Esc и E — встать (из идущей партии — через вопрос), шаг — встать, если не играешь
   * (у играющего шаг снимается в тике).
   */
  private tableKey(code: string, e: KeyboardEvent): boolean {
    if (this.blackjackSeated) {
      if (code === 'Escape' || code === 'KeyE') {
        e.preventDefault();
        this.bjHud.escape();
        return true;
      }
      if (this.bjHud.onKey(e)) return true;
      if (MOVE_KEYS.has(code) && !this.bjHud.locked) this.leaveTable(false);
      return false;
    }
    const k = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code);
    if (k >= 0) {
      this.dkHud.react(k);
      return true;
    }
    if (code === 'Escape' || code === 'KeyE') {
      e.preventDefault();
      this.dkHud.escape();
      return true;
    }
    if (MOVE_KEYS.has(code) && !this.dkHud.locked) this.leaveTable(false);
    return false;
  }

  /** E — предмет под подсказкой (сидя — встать), ЛКМ — рычаг автомата, заброс и подсечка. */
  onUse(mouse: boolean): void {
    if (this.fish2.modalOpen) return;
    const act = this.myAct;
    if (act === ACT_SLOT) {
      this.spin();
      return;
    }
    if (mouse) {
      if (act === ACT_FISH) this.fishPress();
      return;
    }
    if (act === ACT_WARDROBE) {
      this.leaveWardrobe(true);
      return;
    }
    if (isHeld(act)) {
      // в поездке на катере и на колесе не встать — только у причала и внизу
      if (!isRiding(act)) this.d.net.send({ t: 'unuse' });
      return;
    }
    if (this.nearStormLight) { this.d.net.send({ t: 'stormLight' }); return; }
    if (this.startZone.kind) {
      const gate = this.world.map.interact.find(i => i.kind === (this.startZone.kind === 'paintball' ? 'pb_gate' : 'fort'));
      if (gate) { this.d.net.send({ t: 'use', id: gate.id }); return; }
    }
    const kart = this.world.kartStart.status;
    if (kart.phase === 'count' && kart.hostId === this.myId && this.kartDist() <= KART_START.r) {
      this.d.net.send({ t: 'kartTrack', track: nextRaceTrack(kart.track ?? DEFAULT_TRACK) });
      return;
    }
    const it = this.target;
    if (it?.kind === 'fisher' && this.fish2.on) this.fish2.requestNpcOpen();
    else if (it && usable(it.kind) && (it.kind !== 'kboard' || this.cheerable)) this.d.net.send({ t: 'use', id: it.id });
    // у статуи E (на телефоне — та же кнопка, на ней «F») — отдать честь
    else if (!it && this.respectHere) this.payRespect();
    else if (!it && this.eventEligible) {
      const cat = this.critters.nearestCat(this.pose);
      if (cat) this.critters.petCat(cat.id, this.clock.renderTick, this.time);
    }
  }

  /** Рядом со статуей, стоит сам по себе — можно отдать честь (то же правило, что на сервере). */
  private get respectHere(): boolean {
    const act = this.myAct;
    const p = this.pose;
    return this.hasSelf && !isHeld(act) && !isPair(act) && act !== ACT_RESPECT && respectReach(p.x, p.y, p.z);
  }

  /** F у статуи: честь отдаётся сразу у себя, свечи и мелодия — по событию сервера (у всех одинаково). */
  private payRespect(): void {
    const now = performance.now();
    if (now - this.emoteAt < EMOTE_GAP_MS) return;
    this.emoteAt = now;
    this.d.net.send({ t: 'respect' });
    this.me.setAction(ACT_RESPECT, 0);
    this.localUntil = now + 600;
  }

  /** Кто-то отдал честь: огонёк из его руки к подножию, «F» над головой, мелодия, счёт на плите. */
  private onRespect(slot: number, total: number): void {
    const p = slot === this.myId ? (this.hasSelf ? this.pose : null) : (this.remotes.get(slot)?.pose ?? null);
    if (!p || ('valid' in p && !p.valid)) {
      this.respects.setCount(total);
      return;
    }
    // рука у виска: чуть впереди и правее, к статуе
    const yaw = Math.atan2(-(STATUE_AT.x - p.x), -(STATUE_AT.z - p.z));
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    _hand.set(p.x + fx * 0.33 - fz * 0.3, p.y + 1.47, p.z + fz * 0.33 + fx * 0.3);
    _head.set(p.x, p.y + 2.35, p.z);
    this.respects.onRespect(_hand, _head, total);
  }

  /** Сколько желеек сейчас отдают честь (для света у статуи). */
  private respecting(): number {
    let n = this.hasSelf && this.myAct === ACT_RESPECT ? 1 : 0;
    for (const r of this.remotes.values()) if (r.avatar.action === ACT_RESPECT) n++;
    return n;
  }

  private emote(e: number): void {
    const now = performance.now();
    if (now - this.emoteAt < EMOTE_GAP_MS) return;
    this.emoteAt = now;
    this.d.net.send({ t: 'emote', e });
    this.me.setAction(e, 0);
    this.localUntil = now + 600;
  }

  /** Пробел / ЛКМ с удочкой: забросить или подсечь — с номером последнего события поплавка, которое мы видели. */
  private fishPress(): void {
    const now = performance.now();
    if (now - this.fishSentAt < 250) return;
    const spot = this.arg;
    const ph = this.fishing.phaseOf(spot);
    if (ph === FP_IDLE || (ph === FP_HOLD && this.fish2.on)) {
      // рыбалка 2.0: с рыбой в руках — сразу новый заброс (замах начнётся по событию сервера)
      if (ph === FP_IDLE && !this.fishing.castLocal(spot)) return;
      this.d.net.send({ t: 'fish', a: 'cast' });
      this.fish2.cast();
    } else if (ph === FP_WAIT || ph === FP_BITE) {
      this.fishing.jerk(spot);
      this.d.net.send({ t: 'fish', a: 'hook', n: this.fishing.lastN(spot) });
    } else {
      return;
    }
    this.fishSentAt = now;
  }

  /** Событие места рыбалки: в 3D — у всех; своё — ещё «Подсекай!», карточка улова и подсказки. */
  private onFish(kind: number, spot: number, a: number, b: number): void {
    this.fishing.onEvent(kind, spot, a, b);
    if (spot !== this.myFishSpot) return;
    const hud = this.fishHud;
    switch (kind) {
      case FE_BITE:
        hud.showBite(true);
        break;
      case FE_HOOK:
        hud.showBite(false);
        break;
      case FE_EARLY:
        hud.showBite(false);
        if (a === 1) this.d.ui.toasts.show('Рано! Это была проба — подсекай, когда поплавок уйдёт под воду', 3200);
        break;
      case FE_MISS:
        hud.showBite(false);
        this.d.ui.toasts.show('Не успел — рыба ушла 💨', 2600);
        break;
      case FE_DONE:
        // новинка в альбоме — «динь-динь», продал — звон монет
        if (hud.hideCatch(a === 1)) this.d.sound.fishAlbum();
        else if (a === 0 && this.catchPrice > 0) this.d.sound.coins(null, Math.min(8, this.catchPrice));
        break;
      case FE_LOST:
        this.fish2.lost();
        break;
      case FE_OFF:
        hud.reset();
        this.fish2.off();
        this.myFishSpot = -1;
        break;
    }
  }

  private spin(): void {
    const now = performance.now();
    if (now < this.spinUntil || now - this.spinSentAt < 400) return;
    this.spinSentAt = now;
    this.d.net.send({ t: 'spin' });
  }

  /** Выйти из примерочной: по «Готово» и Esc просим сервер, шагом встанем сами. Мышь — сразу, пока идёт жест. */
  private leaveWardrobe(send: boolean): void {
    // недосланный наряд — раньше, чем встанем: стоя сервер его не примет
    this.wardrobe.flush();
    if (send) this.d.net.send({ t: 'unuse' });
    this.wardrobeOpen = false;
    this.d.wantPointer();
  }

  // ------------------------------------------------------------ тик предсказания

  private tick(): void {
    const { input, net } = this.d;
    const inp = this.inputs[0];
    inp.seq = ++this.seq;
    let buttons = input.sample();
    if (this.fish2.modalOpen) buttons = 0;
    if (this.action === ACT_SLOT || this.action === ACT_FISH) buttons &= ~BTN_JUMP;
    // идёт партия, у меня карты — шаг и прыжок не поднимают из-за стола
    if (this.action === ACT_DURAK && (this.blackjackSeated ? this.bjHud.locked : this.dkHud.locked)) buttons &= ~LEAVE_SEAT;
    inp.buttons = buttons;
    inp.yaw = Math.fround(input.yaw);
    inp.pitch = Math.fround(input.pitch);
    // метка времени — часы отрисовки, округлённые как в протоколе и не назад: по ней препятствия аквапарка и здесь,
    // и на сервере (shared/aquadyn.ts)
    const vt = quantTick(this.clock.renderTick);
    inp.viewTick = vt > this.lastVt ? vt : this.lastVt;
    this.lastVt = inp.viewTick;
    this.aquaT0 = this.aquaT1 > 0 ? this.aquaT1 : inp.viewTick;
    this.aquaT1 = inp.viewTick;
    const held = this.predictor.hold !== 0;
    const ev = this.predictor.step(inp, false);
    this.ball.tick(inp.seq, this.predictor.state, this.predictor.hold || (this.raiding ? 1 : 0));
    if (this.raiding && (buttons & BTN_FIRE) && inp.viewTick - this.lastMopTick >= 30) {
      this.lastMopTick = inp.viewTick;
      this.pirates3d.swung(inp.viewTick);
    }
    this.onLocalEvents(ev);
    this.aquaLocal(inp.seq);
    // эмоцию отменяет шаг, прыжок или рывок — показываем сразу (сервер считает так же)
    if (!held && this.me.action !== ACT_NONE && !isHeld(this.me.action) && (buttons & STOP_EMOTE) !== 0) {
      this.me.setAction(ACT_NONE, 0);
      this.localUntil = performance.now() + 400;
    }
    net.sendBinary(encodeInputs(this.inputs, 0, 1, net.epoch));
  }

  private onLocalEvents(ev: StepEvents): void {
    const { sound } = this.d;
    const s = this.predictor.state;
    if (ev.jumped) sound.jump();
    if (ev.landed) sound.land(ev.landSpeed);
    if (ev.bounced) {
      sound.trampoline(null);
      this.world.bounceTrampoline(s.x, s.z, 1.3);
      this.aqua.bounce(s.x, s.z, 1.3);
    }
    if (ev.dashed) sound.dash();
    if (s.grounded) {
      this.stepDist += Math.hypot(s.vx, s.vz) / TICK_RATE;
      if (this.stepDist > 2.1) {
        this.stepDist = 0;
        sound.step(null);
      }
    }
  }

  // ------------------------------------------------------------ кадр

  frame(now: number, dtRaw: number): void {
    const { input, sound } = this.d;
    const dt = Math.min(0.1, dtRaw);
    this.time += dt;
    this.syncMenu();
    this.fpsFrames++;
    this.fpsTime += dtRaw;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    this.lastFrameMs = dtRaw * 1000;

    // У автомата мышь взгляд не крутит: отойдёшь — спиной к нему. За спиной — не ниже пола.
    const act = this.myAct;
    if (act === ACT_SLOT) {
      input.yaw = this.spotOf(ACT_SLOT, this.arg)?.yaw ?? input.yaw;
      input.pitch = 0;
    } else {
      input.pitch = clamp(input.pitch, PITCH_MIN, PITCH_MAX);
    }

    this.clock.update(now, dt * 1000);
    if (this.hasSelf && this.clock.ready) {
      // темп тиков подстраиваем по очереди на сервере: держим там ~1 вход в запасе
      const rate = clamp(1 - (this.queueAvg - 1.2) * 0.02, 0.97, 1.03);
      this.acc += dt * 1000 * rate;
      let n = 0;
      while (this.acc >= TICK_MS && n < 8) {
        this.acc -= TICK_MS;
        this.tick();
        n++;
      }
      if (this.acc > TICK_MS * 4) this.acc = 0;
    }
    const alpha = clamp(this.acc / TICK_MS, 0, 1);
    this.predictor.decay(dt);
    // препятствия аквапарка — до желеек: тени и чужие на паромах берут их положение на этом кадре
    this.aqua.update(dt, this.aquaDrawTick(alpha));

    this.updateBoatPose();
    this.updateLocalPose(alpha);
    this.updateCamera(dt);
    const camPos = this.world.camera.position;
    this.wirePartner(this.me);
    this.fishDrink.update(dt, this.hasSelf && act === ACT_NONE);
    this.me.update(this.hasSelf ? this.pose : null, dt, this.time, this.ground, camPos, true);
    this.updateRemotes(dt);
    this.updateFishing(dt);
    this.fishForCritters.length = 0;
    for (let i = 0; i < FISH_SPOTS.length; i++) if (this.fishOcc[i] && this.fishing.phaseOf(i) === FP_HOLD) this.fishForCritters.push(FISH_SPOTS[i]);
    this.critters.update(this.clock.renderTick, this.time, camPos, { ...this.pose, speed: Math.hypot(this.predictor.state.vx, this.predictor.state.vz) }, this.fishForCritters);
    this.storm3d.update(this.clock.renderTick, dt, this.pose, this.eventEligible, lobbyQuality(this.d.settings.quality) === 'low');
    this.defenders.length = 0;
    for (const [id, r] of this.remotes) if (r.pose.valid) this.defenders.push({ id, ...r.pose, eligible: !isHeld(r.avatar.action) });
    this.pirates3d.setDefenders(this.defenders, this.myId);
    this.pirates3d.update(this.clock.renderTick, dt, this.world.camera, this.eventEligible, TOUCH);
    this.folk.update(dt, this.time, camPos, this.world.weather.rain);
    this.fish2.updateVisuals(dt, this.time, camPos);
    this.respects.update(dt, this.time, this.respecting());
    const ps = this.predictor.state;
    this.ball.update(dt, alpha, ps.x, ps.z, this.clock.ready && this.hasSelf ? this.clock.renderTick - this.tickLag : null);
    this.tables3d.update(dt, this.time, camPos);
    this.dkHud.tick(performance.now());
    this.bjHud.tick(performance.now());
    this.updateHud();

    this.effects.update(dt);
    this.updateSlots(dt, this.busySlots | (act === ACT_SLOT ? 1 << this.arg : 0));
    this.world.update(dt, this.clock.renderTick);
    this.boatSign.update(this.boat, this.clock.renderTick);
    this.boatBanner.update(this.boat, this.clock.renderTick, this.time, this.world.boats.launchOffset, camPos);
    this.kraken.update(this.clock.renderTick, this.boat, { x: camPos.x, z: camPos.z, riding: isAboard(act), camera: this.world.camera });
    this.skillPortal.update(dt);
    this.ferris.update(this.clock.ready ? this.clock.renderTick : (performance.now() / 1000) * TICK_RATE, this.time);
    if (this.pool >= 0) this.world.jackpotBoard.update(this.pool, this.time);
    this.world.recentBoard.tick(performance.now());
    this.tg.update(this.time);
    this.fortGate?.update(this.time);
    this.fcDoor?.update(this.time);
    tickAvatarShared(this.time);
    this.world.camera.getWorldDirection(_v);
    sound.setListener(camPos.x, camPos.y, camPos.z, _v.x, _v.y, _v.z);
    sound.setRain(this.world.effectiveRain);
    this.boatSound();
    sound.tick(dt);
    if (this.ask && performance.now() > this.ask.until) this.clearAsk();
    this.photo.update(dt);
    this.runLater();
    this.world.render();
  }

  /** Фон меню: облёт площади по кругу. */
  idle(dt: number): void {
    this.time += dt;
    this.orbit();
    this.updateSlots(dt, 0);
    const cam = this.world.camera;
    this.critters.update(this.time * TICK_RATE, this.time, cam.position, { x: 1e6, y: 0, z: 1e6, speed: 0 });
    this.folk.update(dt, this.time, cam.position, this.world.weather.rain);
    this.fish2.updateVisuals(dt, this.time, cam.position);
    this.respects.update(dt, this.time, 0);
    this.effects.update(dt);
    this.world.update(dt);
    this.boatSign.update(this.boat, 0);
    this.boatBanner.update(this.boat, 0, this.time, this.world.boats.launchOffset, cam.position);
    this.aqua.update(dt, this.aquaDrawTick(0));
    this.ferris.update(this.clock.ready ? this.clock.renderTick : (performance.now() / 1000) * TICK_RATE, this.time);
    if (this.pool >= 0) this.world.jackpotBoard.update(this.pool, this.time);
    this.world.recentBoard.tick(performance.now());
    this.tg.update(this.time);
    tickAvatarShared(this.time);
    cam.getWorldDirection(_v);
    this.d.sound.setListener(cam.position.x, cam.position.y, cam.position.z, _v.x, _v.y, _v.z);
    this.d.sound.setRain(this.world.weather.rain);
    this.boatSound();
    this.world.render();
  }

  /** Мотор лодки в заливе — пока она идёт; мотор катера — пока он в поездке (на ходу — выше обороты). */
  private boatSound(): void {
    const { sound } = this.d;
    const m = this.world.boats.motor();
    if (m) sound.engine(BOAT_ENGINE, [m.x, m.y, m.z], 4, false, 0, 0.6);
    else sound.engineStop(BOAT_ENGINE);
    const l = this.world.boats.launchMotor();
    if (l) sound.engine(LAUNCH_ENGINE, [l.pos.x, l.pos.y, l.pos.z], 4 + l.speed * 1.5, false, 0, 0.5);
    else sound.engineStop(LAUNCH_ENGINE);
  }

  /** Автоматы и их эффекты; busy — занятые (биты): огни горят ровно, свободные зазывают. */
  private updateSlots(dt: number, busy: number): void {
    for (let m = 0; m < MACHINE_XS.length; m++) this.slots.setOccupied(m, ((busy >> m) & 1) === 1);
    this.slots.update(dt, this.time, this.world.camera.position);
    this.fx.update(dt);
  }

  /** Где катер на экране сейчас: в поездке — на пути по часам отрисовки, иначе у причала. Едем — взгляд поворачивает с ним. */
  private updateBoatPose(): void {
    const b = this.boatPose;
    if (this.boat.ph === BP_RIDE && this.clock.ready) ridePose(this.clock.renderTick - this.boat.at, b);
    else Object.assign(b, LAUNCH);
    let turn = b.yaw - this.boatYaw;
    turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;
    this.boatYaw = b.yaw;
    if (this.hasSelf && this.myAct === ACT_RIDE) this.d.input.yaw += turn;
  }

  private updateLocalPose(alpha: number): void {
    const s = this.predictor.state;
    const p = this.predictor.prev;
    const o = this.predictor.offset;
    const pose = this.pose;
    pose.x = p.x + (s.x - p.x) * alpha + o.x;
    pose.y = p.y + (s.y - p.y) * alpha + o.y;
    pose.z = p.z + (s.z - p.z) * alpha + o.z;
    const act = this.myAct;
    if (isAboard(act)) {
      // в катере: в поездке — на своём месте по пути катера (часы те же, что у катера на экране), у причала — где
      // посадил сервер; качается вместе с катером и смотрит по носу
      if (act === ACT_RIDE && this.arg < BOAT_SEATS) {
        const at = seatAt(this.boatPose, this.arg, this.seatTmp);
        pose.x = at.x;
        pose.y = BOAT_FLOOR_Y;
        pose.z = at.z;
      }
      const lo = this.world.boats.launchOffset;
      pose.x += lo.x;
      pose.y += lo.y;
      pose.z += lo.z;
      pose.yaw = this.boatPose.yaw;
      pose.pitch = 0;
    } else if (act === ACT_WHEEL && this.clock.ready) {
      // в кабинке колеса: на своём месте по тем же часам, по которым кабинка на экране
      const at = wheelSeatAt(this.arg, this.clock.renderTick, this.wheelTmp);
      pose.x = at.x;
      pose.y = at.y;
      pose.z = at.z;
      pose.yaw = at.yaw;
      pose.pitch = 0;
    } else {
      const spot = isHeld(act) ? this.spotOf(act, this.arg) : undefined;
      pose.yaw = spot ? spot.yaw : this.d.input.yaw;
      pose.pitch = spot ? 0 : this.d.input.pitch;
    }
    pose.flags = E_ALIVE | (s.grounded ? E_GROUNDED : 0) | (s.dashT > 0 ? E_DASH : 0);
  }

  private updateCamera(dt: number): void {
    const { input, settings } = this.d;
    const cam = this.world.camera;
    if (!this.hasSelf) {
      // ждём первый снимок
      this.orbit();
      return;
    }
    const p = this.pose;
    const act = this.myAct;
    if (act === ACT_SLOT) {
      const mx = MACHINE_XS[this.arg] ?? p.x;
      this.cam.fixed(cam, dt, mx + SLOT_CAM_DX, SLOT_CAM_Y, MACHINE_FRONT_Z + SLOT_CAM_DZ, mx, REELS_Y, MACHINE_FRONT_Z, FIXED_FOV);
    } else if (act === ACT_DURAK) {
      const tb = this.world.map.tables[seatTable(this.arg)];
      const it = this.spotOf(ACT_DURAK, this.arg);
      if (tb && it) {
        const l = Math.hypot(it.x - tb.x, it.z - tb.z) || 1;
        const ux = (it.x - tb.x) / l;
        const uz = (it.z - tb.z) / l;
        const cx = tb.x + ux * TABLE_CAM_D;
        const cz = tb.z + uz * TABLE_CAM_D;
        const h = Math.cos(TABLE_PITCH);
        this.cam.fixed(cam, dt, cx, TABLE_CAM_Y, cz, cx - ux * h, TABLE_CAM_Y - Math.sin(TABLE_PITCH), cz - uz * h, TABLE_FOV, 'table');
      }
    } else if (act === ACT_WARDROBE && this.wardrobeOpen) {
      this.cam.mirror(cam, dt, p.x, p.y, p.z, p.yaw, MIRROR_FOV);
    } else {
      this.cam.follow(cam, dt, isHeld(act) ? 'sit' : 'walk', p.x, p.y, p.z, input.yaw, input.pitch, this.world.collision, vfov(settings.fov));
    }
  }

  private updateRemotes(dt: number): void {
    const { sound } = this.d;
    const t = this.clock.renderTick;
    const camPos = this.world.camera.position;
    const s = this.sample;
    for (const r of this.remotes.values()) {
      const ok = r.track.sample(t, s);
      const pose = r.pose;
      // в катере сидит: шагов и батутов нет, качается вместе с катером; в кабинке колеса — тоже без шагов
      const aboard = isAboard(r.track.hp);
      if (ok) {
        if (pose.valid && dt > 0 && !aboard && r.track.hp !== ACT_WHEEL) {
          // шаги чужих — по пройденному пути
          if (s.flags & E_GROUNDED) {
            const moved = Math.hypot(s.x - pose.x, s.z - pose.z);
            if (moved < 2) {
              r.steps += moved;
              if (r.steps > 1.8) {
                r.steps = 0;
                sound.step([s.x, s.y, s.z], camPos.distanceTo(_v.set(s.x, s.y, s.z)));
              }
            }
          }
          // батут: только что падал — и уже летит вверх
          const vy = (s.y - pose.y) / dt;
          if (vy < -3) r.fallAt = this.time;
          else if (vy > 3 && this.time - r.fallAt < 0.25 && this.time - r.bounceAt > 0.4) {
            const tr = this.trampolineAt(s.x, s.y, s.z);
            if (tr) {
              r.bounceAt = this.time;
              this.world.bounceTrampoline(tr.x, tr.z, 1.1);
              this.aqua.bounce(tr.x, tr.z, 1.1);
              sound.trampoline([s.x, s.y, s.z]);
            }
          }
        }
        pose.x = s.x;
        pose.y = s.y;
        pose.z = s.z;
        pose.yaw = s.yaw;
        pose.pitch = s.pitch;
        pose.flags = s.flags;
        pose.valid = true;
        // на пароме, лифте или подушке аквапарка: время его препятствий отстаёт от снимка (сервер шлёт на сколько —
        // в аргументе действия) — рисуем его там, где он стоит на площадке, а она — как на экране сейчас
        if (r.track.hp === ACT_NONE && s.x < AQUA_NEAR_X && (s.flags & E_GROUNDED) !== 0) this.aqua.riderShift(pose, t - r.track.armor);
        if (aboard) {
          const lo = this.world.boats.launchOffset;
          pose.x += lo.x;
          pose.y += lo.y;
          pose.z += lo.z;
        }
      } else {
        pose.valid = false;
      }
      // действие — по последнему снимку (сидит, у автомата, эмоция)
      const av = r.avatar;
      if (av.action !== r.track.hp || av.arg !== r.track.armor) av.setAction(r.track.hp, r.track.armor);
      this.wirePartner(av);
      av.update(ok ? pose : null, dt, this.time, this.ground, camPos, false);
    }
  }

  /** Удочки: кто на каком месте рыбачит (своя — пока не отошли, по предсказанию). */
  private updateFishing(dt: number): void {
    const occ = this.fishOcc;
    occ.fill(null);
    if (this.hasSelf && this.myAct === ACT_FISH && this.arg < occ.length) occ[this.arg] = this.me;
    for (const r of this.remotes.values()) {
      const av = r.avatar;
      if (r.pose.valid && av.action === ACT_FISH && av.arg < occ.length) occ[av.arg] = av;
    }
    this.fishing.update(dt, this.time, occ);
    // рыбалка 2.0: шкала вываживания — держит ли ЛКМ, пробел или 🎣 (палец на экране шкала слушает сама)
    const fishing = this.hasSelf && this.myAct === ACT_FISH;
    const p = this.hasSelf ? this.pose : null;
    this.fish2.frame(fishing, this.d.input.isHeld(BTN_FIRE | BTN_JUMP), this.fishing, this.arg, p?.x ?? null, p?.z ?? null);
  }

  private trampolineAt(x: number, y: number, z: number): { x: number; z: number } | null {
    for (const tr of this.world.map.trampolines) {
      if (Math.hypot(x - tr.x, z - tr.z) < tr.r + 0.4 && Math.abs(y - tr.top) < 1) return tr;
    }
    // батут аквапарка — квадратный
    for (const p of AQUA_PIECES) {
      if (p.kind === 'tramp' && x > p.x0 - 0.4 && x < p.x1 + 0.4 && z > p.z0 - 0.4 && z < p.z1 + 0.4 && Math.abs(y - p.top) < 1) {
        return { x: (p.x0 + p.x1) / 2, z: (p.z0 + p.z1) / 2 };
      }
    }
    return null;
  }

  // ------------------------------------------------------------ подсказки и интерфейс

  private updateHud(): void {
    const { hud } = this;
    const act = this.myAct;
    this.target = null;
    // примерочная: открылась — панель с нарядом из профиля; закрылась — примерка снимается
    const dressing = act === ACT_WARDROBE && this.wardrobeOpen;
    if (dressing && !this.wardrobe.isOpen) this.wardrobe.open(this.d.ui.me());
    else if (!dressing && this.wardrobe.isOpen) this.me.setOutfit(this.wardrobe.close());
    hud.showEmotes(this.hasSelf && !isHeld(act));
    const kd = this.kartDist();
    this.kartBeeps(kd <= KART_START.r);
    const fd = this.fcSt && this.hasSelf ? fightDist(this.pose.x, this.pose.y, this.pose.z) : Infinity;
    this.fightBeeps(fd);
    if (!this.hasSelf || act === ACT_WARDROBE) hud.setHint(null);
    else if (act === ACT_SLOT) hud.setHint(TOUCH ? ['🎰'] : ['ЛКМ', '/', 'Пробел'], `крутить · ставка ${STAKES[this.arg] ?? '?'} 🪙 · шаг — отойти`);
    else if (act === ACT_DURAK) hud.setHint(null);
    else if (act === ACT_FISH) this.hintFish();
    else if (act === ACT_BOAT) hud.setHint(TOUCH ? ['E'] : ['W', 'A', 'S', 'D'], `выйти из катера · отплытие через ${this.boatSecs()} с`);
    else if (act === ACT_RIDE) hud.setHint([], `Прогулка по бухте · ещё ${this.boatSecs()} с · ${TOUCH ? 'пальцем' : 'мышь'} — осмотреться`);
    else if (act === ACT_WHEEL) hud.setHint([], `Колесо обозрения · внизу через ${this.wheelSecs()} с · ${TOUCH ? 'пальцем' : 'мышь'} — осмотреться`);
    else if (isHeld(act)) hud.setHint(TOUCH ? ['E'] : ['W', 'A', 'S', 'D'], TOUCH ? 'встать · справа пальцем — осмотреться' : 'встать · мышь — осмотреться');
    else if (this.nearStormLight) hud.setHint(['E'], this.stormState.phase === 'storm' ? 'зажечь маяк' : 'дойти до маяка · получить награду');
    else if (this.startZone.kind) hud.setHint(['E'], `Вход через ${Math.max(1, Math.ceil(this.startZone.left))} с · E — сразу`);
    else if (kd <= KART_START.r + KART_HINT_M) this.hintKart(kd <= KART_START.r);
    else if (fd <= FC_HINT_R) this.hintFight(fd);
    else if (this.aquaAt === 0 && onJetty(this.pose.x, this.pose.y, this.pose.z)) this.hintAqua();
    else this.hintNearest();
    this.aquaTimer();
    const { settings, net } = this.d;
    hud.setStats(settings.showStats ? `${this.fps} FPS · ${Math.round(net.pingMs)} мс · буфер ${this.clock.delay.toFixed(1)} т · кадр ${this.lastFrameMs.toFixed(1)} мс` : null);
  }

  /** На мостике аквапарка: как начать и какой рекорд полосы. */
  private hintAqua(): void {
    const r = this.aquaTop[0];
    this.hud.setHint([], `Аквапарк: сойди с мостика на запад — пойдёт время${r ? ` · рекорд ${fmtAquaTime(r.ms)}` : ''} · упал — снова здесь`);
  }

  /**
   * Секундомер аквапарка — по своим шагам, как время у сервера: от номера входа на старте (его прислал сервер) до
   * последнего своего входа, а встал на финиш — до входа, на котором встал (сервер насчитает столько же). После финиша
   * 5 с показывает итог.
   */
  private aquaTimer(): void {
    if (this.aquaAt > 0) this.hud.setTimer(fmtAquaTime(aquaMs(Math.max(0, (this.aquaFin > 0 ? this.aquaFin : this.seq) - this.aquaAt))));
    else if (this.aquaDone && performance.now() < this.aquaDone.until) this.hud.setTimer(fmtAquaTime(this.aquaDone.ms), true, this.aquaDone.sub);
    else this.hud.setTimer(null);
  }

  /** С удочкой: что сейчас нажимать (на телефоне — кнопка 🎣 и карточка улова). */
  private hintFish(): void {
    const ph = this.fishing.phaseOf(this.arg);
    const h = this.hud;
    const cast = TOUCH ? ['🎣'] : ['Пробел', '/', 'ЛКМ'];
    if (ph === FP_IDLE) h.setHint(cast, TOUCH ? 'Забросить' : `забросить · ${this.fish2.on ? 'J — журнал · ' : ''}E или шаг — уйти`);
    else if (ph === FP_CAST) h.setHint([], 'Заброс…');
    else if (ph === FP_WAIT) h.setHint([], TOUCH ? 'Ждём поклёвку' : 'Ждём поклёвку: поплавок уйдёт под воду — тогда жми Пробел');
    else if (ph === FP_BITE) h.setHint(cast, 'ПОДСЕКАЙ!');
    else if (ph === FP_REEL && this.fish2.on) h.setHint(TOUCH ? null : ['ЛКМ', '/', 'Пробел'], 'держи — зелёная зона вверх, отпусти — вниз · рыба в зоне — шкала растёт');
    else if (ph === FP_REEL) h.setHint([], 'Тянем! 🎣');
    else if (this.fish2.on) h.setHint(cast, `забросить снова${TOUCH ? '' : ' · J — журнал'}`);
    // на телефоне всё видно на самой карточке улова
    else h.setHint(TOUCH ? null : ['1', '/', '2'], 'в коллекцию или продать');
  }

  /** Своя желейка — до центра круга «Старт» по горизонтали (Infinity — ещё не на набережной). */
  private kartDist(): number {
    const p = this.pose;
    if (!this.hasSelf || Math.abs(p.y) > 2) return Infinity;
    return Math.hypot(p.x - KART_START.x, p.z - KART_START.z);
  }

  /** У круга «Старт»: встань — поедешь; в круге — сколько ждать; гонка идёт — следующий заезд после неё. */
  private hintKart(inside: boolean): void {
    const ks = this.world.kartStart;
    const st = ks.status;
    let text: string;
    if (st.phase === 'race' || st.phase === 'results') text = 'Гонка идёт — следующий заезд после неё';
    else if (st.phase !== 'count') text = 'Встань в круг — гонка начнётся сама';
    else if (!inside) text = `Встань в круг — старт через ${ks.left} с`;
    else if (st.names.indexOf(this.d.ui.me().nick) >= RC_MAX_KARTS) text = 'Мест нет — поедешь в следующий заезд';
    else text = `Старт через ${ks.left} с · гонщиков: ${Math.min(st.n, RC_MAX_KARTS)}`;
    const canChoose = inside && st.phase === 'count' && st.hostId === this.myId;
    const track = raceTrackLabel(st.track);
    this.hud.setHint(canChoose ? ['E'] : [], `${text} · ${track}${canChoose ? ' · сменить трассу' : st.phase === 'count' && st.hostNick ? ` · выбирает ${st.hostNick}` : ''}`);
  }

  /** Три последних секунды отсчёта — писк, только тем, кто стоит в круге. */
  private kartBeeps(inside: boolean): void {
    const ks = this.world.kartStart;
    const n = inside && ks.status.phase === 'count' ? ks.left : 0;
    if (n > 0 && n <= 3 && n !== this.kartBeep) this.d.sound.countBeep(false);
    this.kartBeep = n;
  }

  /** У двери «Fight Club»: что в круге мелом; E — хозяину (сменить режим) и всем, пока внизу бой (посмотреть). */
  private hintFight(d: number): void {
    const h = fightHint(this.fcSt!, this.d.ui.me().nick, d);
    if (!h) return this.hud.setHint(null);
    if (h.keys.length) this.target = this.world.map.interact.find((it) => it.kind === 'fight') ?? null;
    this.hud.setHint(h.keys, h.text);
  }

  /** Три последних секунды отсчёта у круга «Fight Club» — писк, только тем, кто в круге. */
  private fightBeeps(d: number): void {
    const st = this.fcSt;
    const n = st && st.phase === 'count' && d <= FC_CIRCLE.r ? st.left : 0;
    if (n > 0 && n <= 3 && n !== this.fcBeep) this.d.sound.countBeep(false);
    this.fcBeep = n;
  }

  /** Ближайший предмет в радиусе: впереди или совсем рядом. Свободные места и автоматы — в приоритете. */
  private hintNearest(): void {
    const p = this.pose;
    const fx = -Math.sin(this.d.input.yaw);
    const fz = -Math.cos(this.d.input.yaw);
    let free: Interactable | null = null;
    let freeD = Infinity;
    let taken: Interactable | null = null;
    let takenD = Infinity;
    for (const it of this.world.map.interact) {
      const dx = it.x - p.x;
      const dz = it.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > it.r || Math.abs(p.y - it.y) >= 2) continue;
      if (dist > 1 && (dx * fx + dz * fz) / dist <= 0.2) continue;
      // арка «Крепости» — только когда режим включён
      if (it.kind === 'fort' && !this.fortSt) continue;
      if (it.kind === 'fisher' && !this.fish2.on) continue;
      if (it.kind === 'skill' && !this.skillStatus) continue;
      if (it.kind === 'boatrace' && !this.boatRaceStatus) continue;
      if (it.kind === 'hide' && !this.hideStatus) continue;
      // круг «Fight Club» подсказывает сам (hintFight), без флага — молчит
      if (it.kind === 'fight') continue;
      if (this.isBusy(it)) {
        if (dist < takenD) {
          taken = it;
          takenD = dist;
        }
      } else if (dist < freeD) {
        free = it;
        freeD = dist;
      }
    }
    const it = free ?? taken;
    if (!it) {
      if (this.respectHere) this.hud.setHint(['F'], 'Press F to pay respects');
      else if (this.fish2.nearBoard(p.x, p.z)) this.hud.setHint(TOUCH ? [] : ['J'], TOUCH ? 'Рекорды рыбаков: сегодня и за всё время · 📖 — журнал' : 'журнал рыбака · на доске — рекорды: сегодня и за всё время');
      else {
        const cat = this.eventEligible ? this.critters.nearestCat(this.pose) : null;
        if (cat) this.hud.setHint(['E'], cat.label);
        else this.hud.setHint(null);
      }
      return;
    }
    if (it === taken) {
      this.hud.setHint([], it.kind === 'boat' ? this.boatBusyText() : it.kind === 'slot' ? 'Автомат занят' : it.kind === 'fish' ? 'Здесь уже рыбачат' : 'Место занято');
      return;
    }
    this.target = it;
    switch (it.kind) {
      case 'slot':
        this.hud.setHint(['E'], `сыграть (ставка ${STAKES[it.arg] ?? '?'})`);
        break;
      case 'seat':
        this.hud.setHint(['E'], 'сесть');
        break;
      case 'durak': {
        const ph = this.tables3d.view(seatTable(it.arg))?.phase;
        if (this.myReserved(it.arg)) this.hud.setHint(['E'], 'вернуться в партию — твои карты ждут');
        else this.hud.setHint(['E'], ph === 'play' || ph === 'result' ? 'сесть посмотреть' : 'сесть за стол (дурак)');
        break;
      }
      case 'blackjack': {
        const chair = this.blackjack3d.view()?.seats[seatChair(it.arg)];
        this.hud.setHint(['E'], chair?.away ? 'вернуться за стол блэкджека' : 'блэкджек · бесплатно или ставка 10 / 20 / 50');
        break;
      }
      case 'skill': {
        const s = this.skillStatus;
        this.hud.setHint(['E'], `Выше облаков · скилл-тест · ${s?.n ?? 0}/${s?.max ?? 5} игроков`);
        break;
      }
      case 'boatrace':
      case 'hide': {
        const s = it.kind === 'boatrace' ? this.boatRaceStatus : this.hideStatus;
        if (!s) break;
        this.hud.setHint(it.kind === 'hide' && s.phase !== 'count' && s.phase !== 'idle' ? ['E'] : [], s.phase === 'count' && 'left' in s ? `Старт через ${s.left} с · в круге ${s.n}`
          : s.phase === 'idle' ? it.kind === 'hide' ? 'Встаньте в круг вдвоём · прятки 3 минуты' : 'Встань в круг · 3 круга по бухте · можно с ботами'
          : it.kind === 'hide' ? 'Вернуться в прятки или наблюдать до следующего раунда' : 'Раунд идёт · подожди следующего старта');
        break;
      }
      case 'kiosk':
        this.hud.setHint(['E'], 'примерочная');
        break;
      case 'pb_gate':
        if (this.pbHumans >= MAX_HUMANS) this.hud.setHint([], 'Склад переполнен');
        else this.hud.setHint(['E'], 'в пейнтбол');
        break;
      case 'garage':
        if (this.world.kartStart.status.hostId === this.myId) {
          this.hud.setHint(['E'], `выбрать трассу · ${raceTrackLabel(this.world.kartStart.status.track)}`);
        } else this.hud.setHint([], this.world.kartStart.status.hostNick ? `Трассу выбирает ${this.world.kartStart.status.hostNick}` : 'Встань первым в круг — выбери трассу');
        break;
      case 'honor':
        this.hud.setHint([], 'Доска почёта');
        break;
      case 'recent':
        this.hud.setHint([], 'Последние входы: кто в игре и кто когда был');
        break;
      case 'kboard':
        if (this.cheerable) this.hud.setHint(['E'], 'болеть за гонщиков');
        else this.hud.setHint([], 'Табло гонки: в гонке здесь видно, кто где');
        break;
      case 'photo':
        this.hud.setHint(['E'], 'фото у маяка · 3 секунды, чтобы встать в кадр');
        break;
      case 'fish':
        this.hud.setHint(['E'], 'порыбачить');
        break;
      case 'fisher':
        this.hud.setHint(['E'], 'поговорить с Дедом Семёном · снасти и задания');
        break;
      case 'boat':
        if (this.boat.ph === BP_BOARD) this.hud.setHint(['E'], `сесть в катер — бесплатно · отплытие через ${this.boatSecs()} с`);
        else this.hud.setHint(['E'], `прокатиться на катере — ${BOAT_PRICE} 🪙, друзья садятся бесплатно`);
        break;
      case 'wheel':
        this.hud.setHint(['E'], `колесо обозрения — ${WHEEL_PRICE} 🪙 · один оборот, ${Math.round(WHEEL_PERIOD / TICK_RATE)} с`);
        break;
      case 'fort': {
        const h = this.fortSt ? fortHint(this.fortSt) : null;
        if (h) this.hud.setHint(h.keys, h.text);
        break;
      }
    }
  }

  /** Сколько секунд до низа своей кабинки колеса. */
  private wheelSecs(): number {
    return this.wheelUntil > 0 && this.clock.ready ? Math.max(0, Math.ceil((this.wheelUntil - this.clock.renderTick) / TICK_RATE)) : 0;
  }

  /** Катер не взять: он в поездке или в нём нет мест. */
  private boatBusyText(): string {
    const n = this.boatSecs();
    return this.boat.ph === BP_RIDE ? `Катер в поездке · вернётся через ${n} с` : `В катере мест нет · отплытие через ${n} с`;
  }

  /** Идёт гонка — у табло можно болеть */
  private get cheerable(): boolean {
    return this.world.kartStart.status.phase === 'race';
  }

  private isBusy(it: Interactable): boolean {
    if (it.kind === 'slot') return (this.busySlots & (1 << it.arg)) !== 0;
    if (it.kind === 'seat') return this.busySeats.has(it.arg);
    if (it.kind === 'fish') return this.busyFish.has(it.arg);
    if (it.kind === 'boat') return this.boat.ph === BP_RIDE || (this.boat.ph === BP_BOARD && this.boat.n >= BOAT_SEATS);
    // стул дурака: сидит человек, бот или чужая бронь отошедшего (на своё место из партии — можно вернуться)
    if (it.kind === 'durak') return this.busySeats.has(it.arg) || ((this.chairOf(it.arg)?.k ?? 0) !== 0 && !this.myReserved(it.arg));
    if (it.kind === 'blackjack') {
      const chair = this.blackjack3d.view()?.seats[seatChair(it.arg)];
      return this.busySeats.has(it.arg) || !!chair?.k && !(chair.away && chair.pid === this.d.ui.me().pid);
    }
    return false;
  }

  private chairOf(seat: number): DurakSeatView | undefined {
    return this.tables3d.view(seatTable(seat))?.seats[seatChair(seat)];
  }

  /** Своё место в идущей партии: отошёл, за меня ходит автопилот — можно сесть обратно. */
  private myReserved(seat: number): boolean {
    const s = this.chairOf(seat);
    return !!s && s.k === 1 && s.id === 0 && s.pid === this.d.ui.me().pid;
  }

  resize(w: number, h: number): void {
    this.world.resize(w, h);
  }

  debugState(): Record<string, unknown> {
    const s = this.predictor.state;
    return {
      id: this.myId, hasSelf: this.hasSelf, action: this.action, arg: this.arg, act: this.myAct, hold: this.predictor.hold,
      pos: [s.x, s.y, s.z], corrections: this.predictor.corrections, target: this.target?.kind ?? null,
      renderTick: this.clock.renderTick, delay: this.clock.delay, jitter: this.clock.jitter,
      remotes: this.remotes.size, queue: this.queueAvg, fps: this.fps, seq: this.seq,
      dkSeat: this.dkSeat, dkLocked: this.dkHud.locked, dkHand: this.dkHand?.cards.length ?? -1,
      blackjack: this.blackjack3d.view(), blackjackOpen: this.bjHud.visible, skill: this.skillStatus, kraken: this.kraken.debug(),
      boatrace: this.boatRaceStatus, hide: this.hideStatus, startZone: this.startZone,
      storm: this.stormState, pirates: { ...this.pirateState, visible: this.pirateTail.visible, actors: this.pirateTail.pirates.length }, critters: this.critters.debug(),
      ask: this.ask?.k ?? -1, photoCard: this.photo.hasCard, ball: this.ball.debug(),
      fish: this.fishing.debug(), fishSpot: this.myFishSpot, fishCard: this.fishHud.hasCard, fish2: this.fish2.debug(),
      weather: { ...this.world.weather }, folk: this.folk.debug(), boats: this.world.boats.debug(), respect: this.respects.debug(),
      boat: { ...this.boat, secs: this.boatSecs() }, aqua: { at: this.aquaAt, fin: this.aquaFin, top: this.aquaTop.length, done: this.aquaDone?.ms ?? 0, vt: this.aquaT1, knock: this.aquaDyn.knock },
      wheel: { until: this.wheelUntil, secs: this.wheelSecs() },
    };
  }

  private orbit(): void {
    const cam = this.world.camera;
    const a = 0.4 + this.time * 0.04;
    cam.position.set(Math.cos(a) * 34, 14, -6 + Math.sin(a) * 34);
    cam.lookAt(0, 3, -6);
    if (cam.fov !== 60) {
      cam.fov = 60;
      cam.updateProjectionMatrix();
    }
  }
}

function applyInfo(av: Avatar, info: LobbyPlayerInfo): void {
  av.setInfo(info.nick, null, false, info.level ?? 1);
  av.setOutfit(info.o);
}

/** Что можно нажать по E (доска почёта с обеих сторон — просто подсказка). */
function usable(kind: Interactable['kind']): boolean {
  return kind !== 'honor' && kind !== 'recent';
}

/** Обзор из настроек — по горизонтали для 16:9; камере нужен вертикальный. */
function vfov(h: number): number {
  return (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(h) / 2) / (16 / 9)) * 180) / Math.PI;
}
