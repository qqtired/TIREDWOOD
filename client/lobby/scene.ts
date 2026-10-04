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
import type { HideStatus } from '../../shared/hide.ts';
import { BOTS_RULE, botsWord } from '../../shared/solobots.ts';
import { START_ZONES, type GatherStatus } from '../../shared/startzones.ts';
import { emptyStorm } from '../../shared/storm.ts';
import { stormInput, stormPush } from '../../shared/stormdyn.ts';
import { AQUA_NEAR_X, AQUA_PIECES, aquaFall, aquaMs, fmtAquaTime, onFinish, onJetty } from '../../shared/aqua.ts';
import { AquaDyn, KNOCK_BAG, quantTick } from '../../shared/aquadyn.ts';
import { BOAT_FLOOR_Y, BOAT_PRICE, BOAT_RIDE_TICKS, BOAT_SEATS, BP_BOARD, BP_DOCK, BP_RIDE, LAUNCH, ridePose, seatAt, type BoatPose } from '../../shared/boat.ts';
import { barkasWater } from '../../shared/barkas.ts';
import {
  FE_AWAY, FE_BACK, FE_BOARD, FE_HOME, FE_OUT, FERRY_FLOOR_Y, FERRY_HOME, FERRY_LEVEL, FERRY_SEATS, ferryEta, ferryPose, ferrySeat, type FerryPose,
} from '../../shared/ferry.ts';
import { FISH_XP_LEVELS, fishLevel } from '../../shared/fishprogress.ts';
import { BJ_MAX_BET, BJ_TABLE, type BlackjackView } from '../../shared/blackjack.ts';
import type { SkillStatus } from '../../shared/skilltest.ts';
import { MAX_HUMANS, TICK_MS, TICK_RATE, WATER_Y } from '../../shared/constants.ts';
import { FE_BITE, FE_DONE, FE_EARLY, FE_HOOK, FE_LOST, FE_MISS, FE_OFF, FP_BITE, FP_CAST, FP_HOLD, FP_IDLE, FP_REEL, FP_WAIT } from '../../shared/fishing.ts';
import type { FortStatus } from '../../shared/fort.ts';
import {
  ACT_BILLIARDS, ACT_BOAT, ACT_DANCE, ACT_DURAK, ACT_FERRY, ACT_FERRY_RIDE, ACT_FISH, ACT_LAUGH, ACT_NONE, ACT_PLANE, ACT_REGATTA, ACT_RESPECT, ACT_RIDE, ACT_SIT, ACT_SLOT, ACT_TIRED,
  ACT_WARDROBE, ACT_WAVE, ACT_WHEEL, LEAVE_SEAT, LOBBY_MIN_DELAY, PAIR_ACTS, STOP_EMOTE, holdMask, isAboard, isFerry, isHeld, isPair, isRiding, pairReach,
} from '../../shared/lobby.ts';
import { BOAT_RACE_CIRCLE, HIDE_CIRCLE, KART_START, MACHINE_FRONT_Z, MACHINE_XS, PHOTO, SKILL_PORTAL, TABLE_SEATS, seatChair, seatTable, type Interactable } from '../../shared/maps/lobby.ts';
import { FISH_NPCS, FISH_SPOTS, ROULETTE_SPOT } from '../../shared/fishplaces.ts';
import { STATUE_AT, respectReach } from '../../shared/respect.ts';
import { RC_MAX_KARTS } from '../../shared/kart.ts';
import { DEFAULT_TRACK, nextRaceTrack, raceTrackLabel } from '../../shared/racecourse.ts';
import { clamp } from '../../shared/math.ts';
import type { AquaRow, BoatStatus, DurakSeatView, DurakTableView, FerryStatus, HonorInfo, LobbyPlayerInfo, PbStatus, ServerMsg } from '../../shared/messages.ts';
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
import { DurakTables3D, TORSO_R } from './durak3d.ts';
import { TOMATO_REACH_PX, TOMATO_REACH_TOUCH_PX, pickTomatoTarget, targetable, tomatoRadius, type PickPoint } from './tomatopick.ts';
import { DurakDecor } from './durakdecor.ts';
import { DurakHud } from './durakhud.ts';
import { BlackjackHud } from './blackjackhud.ts';
import { BilliardsClient } from './billiards.ts';
import { billiardsCover } from '../../shared/billiards.ts';
import { BlackjackTable3D } from './blackjack3d.ts';
import { SkillPortal } from '../skilltest/portal.ts';
import { Kraken } from './kraken.ts';
import { LobbyCritters } from './critters.ts';
import { Mermaid3D } from './mermaid.ts';
import { lobbyMermaidLayout } from '../../shared/mermaid.ts';
import { Storm3D } from './storm.ts';
import { Pirates3D } from './pirates.ts';
import { StartCircle } from './startcircles.ts';
import { Fish2Hud } from './fish2hud.ts';
import { FishHud } from './fishhud.ts';
import { FishingSpots } from './fishing.ts';
import { fishMasterCheer } from './fishgear.ts';
import { addFishPlaces3d } from './fishplaces3d.ts';
import { FishHouse3D } from './fishhouse.ts';
import { FishDrink } from './fishdrink.ts';
import { FishHolds } from './fishhold.ts';
import { FishJumps } from './fishjumps.ts';
import { setFishSnapRenderer } from './fishsnap.ts';
import { Roulette3D } from './roulette3d.ts';
import { RouletteHud } from './roulettehud.ts';
import { RAT_CENTER, RATS } from '../../shared/ratrace.ts';
import type { CritterVisit } from './critterbrain.ts';
import { RAT_CAT_APPROACH, RAT_CAT_SEAT, RatRace3D } from './ratrace3d.ts';
import { RatRaceHud, ratAcc } from './ratracehud.ts';
import { LobbyFolk } from './folk.ts';
import { Respects } from './respect.ts';
import { LobbyFx } from './fx.ts';
import { LobbyHud } from './hud.ts';
import { BOARD_POS } from './kartstart.ts';
import { LosersScreen } from './losers.ts';
import { PHOTO_COUNT_S, PHOTO_HEAR, PHOTO_KEEP, PHOTO_LENS, PhotoBooth, type PhotoPerson } from './photo.ts';
import { RegattaClient } from './regatta.ts';
import { PlaneClient } from './plane.ts';
import { SlotMachines3D } from './slots3d.ts';
import { LobbyJukebox } from './jukebox.ts';
import { JukeboxPanel } from '../ui/jukebox.ts';
import { jukeModels } from './jukebox3d.ts';
import { JUKE_PRICE } from '../../shared/jukebox.ts';
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
/** Блэкджек: ближе и круче, чтобы стол целиком ложился над нижней панелью, а карты у края не прятались под ней */
const BJ_CAM_D = 1.32;
const BJ_CAM_Y = 1.8;
const BJ_PITCH = (42 * Math.PI) / 180;
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
const _tp = new THREE.Vector3();
const _tq = new THREE.Vector3();
const _th = new THREE.Vector3();
const _tm = new THREE.Vector3();
const _tr = new THREE.Vector3();
/** Голоса моторов: лодки в заливе и катера «Ласточка» (номера картов — меньше) */
const BOAT_ENGINE = 9000;
const LAUNCH_ENGINE = 9001;
/** Катер у причала — пока статуса с сервера нет (в меню) */
const BOAT_DOCKED: BoatStatus = { ph: BP_DOCK, at: 0, n: 0, nick: '' };
/** Лодка «Удалая» у мостков Семёна — пока статуса с сервера нет */
const FERRY_DOCKED: FerryStatus = { ph: FE_HOME, at: 0, n: 0, c: 0 };

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
  private readonly decor: DurakDecor;
  private readonly dkHud: DurakHud;
  private readonly bjHud: BlackjackHud;
  private readonly blackjack3d: BlackjackTable3D;
  /** Бильярд в пристройке казино (флаг BILLIARDS): столы, панель, прицел */
  private readonly billiards: BilliardsClient;
  private readonly skillPortal: SkillPortal;
  private readonly kraken: Kraken;
  private skillStatus: SkillStatus | null = null;
  private readonly critters: LobbyCritters;
  /** Русалка у мостков: раз в ~5 минут выныривает у мест рыбалки (shared/mermaid.ts); отладка — __opus.mermaid() */
  readonly mermaid: Mermaid3D;
  private readonly storm3d: Storm3D;
  private readonly pirates3d: Pirates3D;
  private stormState = emptyStorm();
  private readonly pirateMe = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, slot: 0, pid: 0 };
  private outerMenu = false;
  private sentMenu: boolean | null = null;
  private readonly entryCircles = new Map<string, StartCircle>();
  /** Круг сбора регаты у пирса (null — регата выключена) и сама «Портовая регата» в бухте */
  private boatRaceStatus: GatherStatus | null = null;
  readonly rg: RegattaClient;
  /** Гидроплан «Стриж» (флаг сервера PLANE, client/lobby/plane.ts) */
  readonly plane: PlaneClient;
  private hideStatus: GatherStatus | HideStatus | null = null;
  private startZone: { kind: 'paintball' | 'fort' | null; left: number } = { kind: null, left: 0 };
  private readonly fishForCritters: {x:number;z:number}[] = [];
  private readonly critterOthers: {id:number;x:number;y:number;z:number}[] = [];
  private readonly photo: PhotoBooth;
  private readonly ball: LobbyBall;
  private readonly fishing: FishingSpots;
  private readonly fishHud: FishHud;
  /** Рыбалка 2.0: шкала вываживания, карточка улова, журнал, доска рекордов (без флага сервера молчит) */
  private readonly fish2: Fish2Hud;
  /** Музыкальный автомат на площади (флаг сервера JUKEBOX) */
  private readonly juke: LobbyJukebox;
  private readonly fishDrink: FishDrink;
  /** Сезон рыбалки: рыбы выпрыгивают у мест рыбалки (без сервера: ?fishseason или __opus.app.lobby.fishJumps.setDev(true)) */
  readonly fishJumps: FishJumps;
  /** Рыба в руках у желеек (рюкзак → «Взять в руки»; сервер рассылает fishHold) */
  private readonly fishHolds: FishHolds;
  /** Рулетка рыбака (флаг ROULETTE): стол и колесо в 3D */
  private readonly roulette3d: Roulette3D;
  /** Итог моей ставки: тост и звук — когда шарик остановится (после вращения у меня на экране) */
  private rlResult: Extract<ServerMsg, { t: 'rouletteResult' }> | null = null;
  /** Крутилось ли колесо в прошлом кадре — по смене обновляем плашку раунда */
  private rlSpun = false;
  /** Крысиные бега (флаг RATRACE): понтон, арена, крысы в 3D; окно ставки, плашка, кнопки «болеть» */
  private readonly rat3d: RatRace3D;
  private readonly ratHud: RatRaceHud;
  /** Кот-зритель у арены (пока ставки или забег) и когда болели в последние секунды — шум трибуны */
  private ratVisit: CritterVisit | null = null;
  private ratRunning = false;
  private readonly ratCheers: number[] = [];
  private readonly folk: LobbyFolk;
  /** Дом рыбака Семёна на конце пирса (есть всегда: он — часть пирса) */
  private readonly fishHouse: FishHouse3D;
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
  /** Над желейкой горит прицел помидора (курсор — рука, кольцо на панели) */
  private aimOn = false;
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
  /** Лодка Семёна «Удалая»: статус с сервера и где она на экране (по часам отрисовки — там же её пассажиры) */
  private ferry: FerryStatus = { ...FERRY_DOCKED };
  private readonly ferryPose: FerryPose = { ...FERRY_HOME };
  private ferryYaw = FERRY_HOME.yaw;
  /** Уровень рыбалки в прошлый раз (−1 — ещё не знаем): дошёл до FERRY_LEVEL — Семён зовёт в море */
  private fishLvl = -1;
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
  /** Где своя желейка последний раз стояла на опоре (как считает сервер): упал с баркаса — тост про матросов */
  private footX = Number.NaN;
  private footZ = Number.NaN;
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
    // корпус музыкального автомата твёрдый, только когда сервер с ним (флаг JUKEBOX: приходит «juke»)
    this.juke = new LobbyJukebox({
      sound: d.sound,
      send: (m) => d.net.send(m),
      toast: (text) => d.ui.toasts.show(text, 3400),
      myPid: () => d.ui.me().pid,
      tokens: () => d.ui.tokens.shown,
      ping: () => d.net.pingMs,
      onOpen: () => { d.input.releaseAll(); d.input.unlock(); },
      onClose: () => d.wantPointer(),
      setSolid: (on) => { for (const index of this.world.map.jukeBoxes) this.world.collision.setEnabled(index, on); },
      refreshShadows: () => d.renderer.refreshShadows(),
    });
    this.juke.reset(false);
    const col = this.world.collision;
    this.aquaDyn = new AquaDyn(col, this.world.map.aquaMovers);
    const dyn = this.aquaDyn;
    this.aquaHook = {
      before: (s, inp, prev) => {
        const storm = stormInput(s, inp, inp.viewTick, this.stormState, this.eventEligible);
        dyn.pre(s, inp.viewTick, Number.isNaN(prev) ? inp.viewTick : prev);
        return storm;
      },
      after: (s, inp, ev) => {
        dyn.post(s, ev, inp.viewTick);
        stormPush(s, col, inp.viewTick, this.stormState, this.eventEligible);
      },
    };
    this.ground = { groundBelow: (x, y, z) => Math.max(col.groundBelow(x, y, z), this.aqua.groundBelow(x, y, z)) };
    this.predictor = new Predictor(col, this.aquaHook);
    this.effects = new Effects(this.world.scene, this.world.collision);
    this.ball = new LobbyBall(this.world, this.effects, d.sound);
    this.hud = new LobbyHud(d.hudRoot);
    this.juke.attachPanel((actions) => new JukeboxPanel(this.hud.root, actions));
    this.juke.attachModels(jukeModels(this.world.scene));
    this.critters = new LobbyCritters(this.world.scene, {
      onPurr: (x, y, z, hiss) => d.sound.purr([x, y, z], hiss),
      onGullCry: (x, y, z) => d.sound.gullCry([x, y, z]),
      onWoof: (x, y, z) => d.sound.woof([x, y, z]),
      collision: col,
    });
    this.mermaid = new Mermaid3D(this.world.scene, {
      layout: lobbyMermaidLayout(this.world.map.boxes), effects: this.effects,
      onSplash: (x, y, z, dive) => d.sound.mermaidSplash([x, y, z], dive),
    });
    this.storm3d = new Storm3D(this.world.scene, this.hud.root, {
      climate: (force, lamps) => this.world.setStormClimate(force, lamps),
      strike: (s) => this.world.strike(s),
      rainbow: (on) => this.world.setStormRainbow(on),
      lamp: (enabled) => this.world.setLighthouseEnabled(enabled),
      sound: (kind) => d.sound.lobbyEvent(kind),
      light: () => d.net.send({ t: 'stormLight' }),
      self: () => d.ui.me().pid,
      lampPosition: this.world.lighthouse.lampAnchor.getWorldPosition(new THREE.Vector3()),
    });
    // молния ударила — гром: с задержкой по расстоянию, громкость по расстоянию, сбоку — где ударило
    this.world.onStrike((e) => d.sound.thunder(e.dist, e.pan, e.power, e.far));
    this.pirates3d = new Pirates3D(this.world.scene, this.hud.root, {
      sound: d.sound,
      lobbyFx: () => this.fx,
      fire: (down) => d.input.touchButton(0, down),
      quality: () => lobbyQuality(d.settings.quality),
    });
    for (const z of START_ZONES) {
      const circle = new StartCircle(this.world.scene, { ...z, color: z.kind === 'fort' ? 0xd9b465 : 0x6fc7b8, label: z.kind === 'fort' ? 'КРЕПОСТЬ' : 'ПЕЙНТБОЛ', subtitle: 'Встань на 3 секунды · E — сразу' });
      circle.setVisible(false); this.entryCircles.set(z.kind, circle);
    }
    for (const [kind, zone, label, color] of [['boatrace', BOAT_RACE_CIRCLE, 'ПОРТОВАЯ РЕГАТА', 0x57ccdb], ['hide', HIDE_CIRCLE, 'ПРЯТКИ: РЫБНЫЙ ДВОР', 0xd9b77b]] as const) {
      const circle = new StartCircle(this.world.scene, { ...zone, color, label, subtitle: kind === 'boatrace' ? 'Круг сбора · старт через 10 с' : 'Круг сбора · старт через 15 с' });
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
    this.decor = new DurakDecor(this.world.scene, this.world.map.tables, [0, 1]);
    this.dkHud = new DurakHud(this.hud.root);
    this.dkHud.onAct = (a, card, on) => {
      if (this.dkSeat >= 0) d.net.send({ t: 'durak', table: seatTable(this.dkSeat), a, card, on });
    };
    this.dkHud.onLeave = () => this.leaveTable(true);
    this.dkHud.balance = () => d.ui.me().tokens;
    const blackjackTable = this.world.map.tables[BJ_TABLE];
    this.blackjack3d = new BlackjackTable3D(this.world, d.sound, blackjackTable.x, blackjackTable.z);
    this.bjHud = new BlackjackHud(this.hud.root);
    this.bjHud.onAct = (a, rev, amount) => {
      if (this.blackjackSeated) d.net.send({ t: 'blackjack', table: BJ_TABLE, a, rev, amount });
    };
    this.bjHud.onLeave = () => this.leaveTable(true);
    for (const index of this.world.map.billiardsBoxes) this.world.collision.setEnabled(index, false);
    this.billiards = new BilliardsClient({
      scene: this.world.scene, hudRoot: this.hud.root, canvas: d.renderer.canvas, camera: () => this.world.camera,
      send: (msg) => d.net.send(msg), me: () => d.ui.me(), sound: d.sound,
      setSolid: (on) => {
        for (const index of this.world.map.billiardsBoxes) this.world.collision.setEnabled(index, on);
        // навес — укрытие от дождя, как крыши павильонов
        if (on) this.world.addCover(billiardsCover());
      },
      leave: () => { d.net.send({ t: 'unuse' }); this.billiards.setSeat(-1, -1); d.wantPointer(); },
      pointerFree: () => !d.input.locked && !d.input.blocked,
      refreshShadows: () => d.renderer.refreshShadows(),
    });
    this.skillPortal = new SkillPortal(this.world.scene, SKILL_PORTAL.x, SKILL_PORTAL.z);
    this.skillPortal.setVisible(false);
    this.kraken = new Kraken(this.world.scene, { onScare: (p) => d.sound.krakenScare([p.x, p.y, p.z]) });
    this.photo = new PhotoBooth(this.hud.root, d.overlay);
    this.photo.onBeep = () => d.sound.countBeep(false);
    this.fishing = new FishingSpots(this.world.scene, this.effects, this.fx, d.sound, this.me);
    addFishPlaces3d(this.world.scene);
    this.fishHouse = new FishHouse3D(this.world.scene);
    this.fishDrink = new FishDrink(this.me, d.sound);
    // картинка вида без нарисованной (кальмар) — снимок его 3D-модели общим рендером
    setFishSnapRenderer(d.renderer.gl);
    this.fishJumps = new FishJumps(this.world.scene, this.effects, d.sound, (x, z) => this.world.collision.groundBelow(x, 0, z) === -Infinity);
    this.fishHolds = new FishHolds(this.hud.root);
    this.fishHolds.onPutAway = () => d.net.send({ t: 'fishHold', n: -1 });
    this.roulette3d = new Roulette3D(this.world.scene);
    this.rat3d = new RatRace3D(this.world.scene);
    this.rat3d.onSqueak = (x, y, z) => d.sound.ratSqueak([x, y, z]);
    this.rat3d.onGate = () => { if (this.ratDist() < 20) d.sound.countBeep(true); };
    this.rat3d.onWinner = (rat, x, z) => {
      if (this.ratDist() > 30) return;
      this.fx.confetti(x, 0.5, z, 36, 0, 1, 0, 0.5, 3.2);
      d.sound.fanfare([x, 0.6, z]);
      void rat;
    };
    this.ratHud = new RatRaceHud(d.overlay, (msg) => d.net.send(msg), () => d.ui.me().tokens);
    this.ratHud.onOpen = () => { d.input.releaseAll(); d.input.unlock(); };
    this.ratHud.onClose = () => d.wantPointer();
    this.ratHud.onCheer = (rat) => d.net.send({ t: 'rat', a: 'cheer', rat });
    this.ratHud.running = () => this.rat3d.running;
    this.ratHud.standings = () => this.rat3d.standings();
    this.ratHud.resultOrder = () => this.rat3d.resultOrder();
    this.folk = new LobbyFolk(this.world.scene, this.world.collision, this.effects, this.fx, d.sound);
    this.respects = new Respects(this.world.scene, this.fx, d.sound);
    this.boatSign = new BoatSign(this.world.scene);
    this.boatBanner = new BoatBanner(this.world.scene);
    this.aqua = new AquaPark(this.world.scene, this.effects);
    this.rg = new RegattaClient({
      scene: this.world.scene, effects: this.effects, sound: d.sound, hudRoot: this.hud.root,
      toast: (text, ms) => d.ui.toasts.show(text, ms), send: (msg) => d.net.send(msg),
      tapUse: () => { d.input.tap('KeyE', true); d.input.tap('KeyE', false); },
      low: () => lobbyQuality(d.settings.quality) === 'low',
    });
    this.plane = new PlaneClient({
      scene: this.world.scene, sound: d.sound, hudRoot: this.hud.root, input: d.input,
      toast: (text, ms) => d.ui.toasts.show(text, ms), send: (msg) => d.net.send(msg), me: () => d.ui.me(),
      modal: (open) => { if (open) { d.input.releaseAll(); d.input.unlock(); } else d.wantPointer(); },
    });
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
    this.fish2.roulette.isSpinning = () => this.roulette3d.spinning;
    this.fish2.onBeer = () => this.fishDrink.start();
    // pointerdown, а не mousedown: на телефоне помидор бросают пальцем
    d.renderer.canvas.addEventListener('pointerdown', (e) => this.onCanvasDown(e));
    d.renderer.canvas.addEventListener('pointermove', (e) => this.onCanvasMove(e));
    d.renderer.canvas.addEventListener('pointerleave', () => this.clearAim());
    this.me.addTo(this.world.scene);
    window.addEventListener('wheel', (e) => {
      if (this.entered && d.input.locked && !d.input.blocked && !this.plane.flying) this.cam.zoomBy(e.deltaY);
    }, { passive: true });
  }

  /**
   * В примерочной и за столом дурака мышь отпущена — пауза при этом не нужна. Встал из-за стола (стол уже убран) —
   * мышь нужна сразу, не дожидаясь ответа сервера: не удался захват — пауза, а не курсор без камеры.
   */
  get wantsPointer(): boolean {
    const act = this.myAct;
    return !((this.wardrobeOpen && act === ACT_WARDROBE) || (act === ACT_DURAK && this.dkSeat >= 0) || act === ACT_BILLIARDS || this.fish2.modalOpen || this.juke.isOpen || this.plane.bannerOpen);
  }

  /** Меню примерочной — div, поэтому одной проверки native dialog для PTT недостаточно. */
  get voiceBlocked(): boolean { return this.outerMenu || this.wardrobeOpen || this.fish2.modalOpen; }

  /**
   * Телефон: у автомата — «крутить», с удочкой — «заброс», в поездке на катере — только осмотреться пальцем,
   * за столом и в примерочной — только верхние кнопки.
   */
  get touchMode(): TouchMode {
    const act = this.myAct;
    if (!this.hasSelf || act === ACT_DURAK || act === ACT_BILLIARDS || (act === ACT_WARDROBE && this.wardrobeOpen) || this.fish2.modalOpen || this.juke.isOpen || this.plane.bannerOpen) return 'none';
    if (this.rg.racing) return 'kart';
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

  /** В катере регаты: в паузе вместо «На набережную» — «Сойти на берег». */
  get racing(): boolean {
    return this.rg.racing;
  }

  quitRace(): void {
    this.rg.quit();
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

  /** Набег пиратов идёт и я свободен: ЛКМ — маркер или пушка, камера над плечом */
  private get raiding(): boolean {
    return this.eventEligible && this.pirates3d.phase === 'raid';
  }


  private resetAdditions(): void {
    this.sentMenu = null;
    this.skillStatus = this.boatRaceStatus = this.hideStatus = null;
    this.skillPortal.setVisible(false);
    for (const index of this.world.map.skillPortalBoxes) this.world.collision.setEnabled(index, false);
    for (const circle of this.entryCircles.values()) circle.setVisible(false);
    this.startZone = { kind: null, left: 0 };
    this.stormState = emptyStorm();
    this.storm3d.set(this.stormState);
    this.pirates3d.reset();
    this.storm3d.update(0, 0, this.pose, false);
  }

  private onGather(kind: 'boatrace' | 'hide', status: GatherStatus | HideStatus | null): void {
    if (kind === 'boatrace') this.boatRaceStatus = status as GatherStatus | null;
    else this.hideStatus = status as GatherStatus | HideStatus | null;
    const circle = this.entryCircles.get(kind)!;
    circle.setVisible(!!status);
    if (!status) return;
    circle.status({ ...status, left: status.phase === 'count' && 'left' in status ? status.left : undefined, max: 'max' in status ? status.max : 6,
      hint: kind === 'boatrace' && this.rg.phase !== 'idle' && status.phase === 'idle' ? 'Регата идёт · встань — поедешь следующим'
        : status.phase === 'idle' ? kind === 'hide' ? 'Нужно 2–8 игроков' : `1–6 игроков · ${BOTS_RULE}`
        : status.phase === 'count' ? kind === 'boatrace' ? `Сбор игроков · ${botsWord(status.n)}` : 'Сбор игроков' : 'Раунд идёт · дождись окончания' });
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
    this.juke.reset(true);
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
    this.decor.reset();
    this.dkHud.hide();
    this.bjHud.hide();
    this.blackjack3d.reset();
    this.billiards.reset();
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
    this.ratHud.reset();
    this.fishDrink.reset();
    this.fishHolds.reset();
    this.fishJumps.reset();
    this.myFishSpot = -1;
    this.aquaAt = 0;
    this.aquaFin = 0;
    this.aquaDone = null;
    this.lastVt = 0;
    this.aquaT0 = this.aquaT1 = 0;
    this.rg.reset();
    this.plane.reset();
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
    this.juke.reset(false);
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
    this.decor.reset();
    this.dkHud.hide();
    this.bjHud.hide();
    this.blackjack3d.reset();
    this.billiards.reset();
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
    this.ratHud.reset();
    this.fishDrink.reset();
    this.fishHolds.reset();
    this.fishJumps.reset();
    this.myFishSpot = -1;
    this.aquaAt = 0;
    this.aquaFin = 0;
    this.aquaDone = null;
    this.rg.reset();
    this.plane.reset();
    this.hud.setTimer(null);
    this.hud.setVisible(false);
    this.d.sound.setRain(0);
    this.d.sound.engineStop(BOAT_ENGINE);
    this.d.sound.engineStop(LAUNCH_ENGINE);
    this.setBoat(BOAT_DOCKED);
    this.setFerry(FERRY_DOCKED, true);
    this.fishLvl = -1;
  }

  // ------------------------------------------------------------ сеть: JSON

  onJson(msg: ServerMsg): void {
    switch (msg.t) {
      case 'redeemResult':
        this.wardrobe.giftResult(msg.result);
        return;
      case 'lobby':
        this.myId = msg.id;
        this.fishHolds.setMe(msg.id);
        this.d.input.yaw = msg.yaw;
        this.d.input.pitch = -0.12;
        this.setInfos(msg.players);
        this.pool = msg.pool;
        this.onPb(msg.pb);
        this.onHonor(msg.honor);
        msg.tables.forEach((v, t) => this.onTable(t, v));
        if (msg.blackjack) this.onBlackjack(msg.blackjack);
        // столы бильярда приходят следом отдельными сообщениями; нет их — флаг BILLIARDS выключен
        this.billiards.off();
        this.skillStatus = msg.skill ?? null;
        this.skillPortal.setVisible(!!msg.skill);
        for (const index of this.world.map.skillPortalBoxes) this.world.collision.setEnabled(index, !!msg.skill);
        if (msg.skill) this.skillPortal.status(msg.skill);
        this.entryCircles.get('paintball')!.setVisible(true);
        this.entryCircles.get('paintball')!.status({ hint: 'Встань на 3 секунды · E — сразу' });
        this.rg.setMyId(msg.id);
        this.rg.welcome(msg.regatta);
        this.plane.welcome(msg.plane);
        this.onGather('boatrace', msg.regatta?.q ?? null);
        this.onGather('hide', msg.hide ?? null);
        this.world.kartStart.update(msg.kart);
        // рыбалка 2.0 — до мест рыбалки: вываживание в 3D у неё своё
        if (this.fish2.lobby(msg.fish2 === 1, msg.ftop ?? null, msg.rain === 1)) this.d.renderer.refreshShadows();
        for (const index of this.world.map.fishPropsBoxes) this.world.collision.setEnabled(index, this.fish2.on);
        this.fishing.v2 = this.fish2.on;
        this.folk.setV2(this.fish2.on);
        this.rat3d.setOn(!!msg.ratrace);
        for (const index of this.world.map.ratBoxes) this.world.collision.setEnabled(index, !!msg.ratrace);
        this.ratHud.setMe(this.d.ui.me().pid);
        if (msg.ratrace) {
          this.rat3d.setView(msg.ratrace, this.d.net.pingMs / 2);
          this.ratHud.setView(msg.ratrace);
        }
        this.roulette3d.setOn(!!msg.roulette);
        this.rlResult = null;
        if (msg.roulette) {
          this.roulette3d.setView(msg.roulette, this.d.net.pingMs / 2);
          this.fish2.onRoulette(msg.roulette);
        }
        this.fishing.reset(msg.fish);
        this.world.setRain(msg.rain === 1, true, msg.wx);
        this.respects.setCount(msg.respects ?? 0);
        this.setBoat(msg.boat ?? BOAT_DOCKED);
        this.setFerry(msg.ferry ?? FERRY_DOCKED, true);
        this.fishLvl = fishLevel(this.d.ui.me().fishing?.xp ?? 0);
        this.setAquaTop(msg.aqua ?? []);
        this.losers.set(msg.losers ?? [], this.d.ui.me().pid);
        this.onFort(msg.fort ?? null);
        this.onFightSt(msg.fc ?? null);
        break;
      case 'juke':
      case 'jukeRes':
        this.juke.onMsg(msg);
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
      case 'ferry':
        this.setFerry(msg);
        break;
      case 'barkasHome':
        this.fish2.onBarkasHome(msg.ok, msg.message);
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
        this.world.setRain(msg.rain === 1, false, msg.wx);
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
          else if (e[0] === 'fishMaster') fishMasterCheer(e[1] === this.myId ? this.me : this.remotes.get(e[1])?.avatar, this.fx, this.d.sound);
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
      case 'bl':
      case 'blShot':
      case 'blAim':
      case 'blErr':
        this.billiards.onMessage(msg);
        break;
      case 'skillSt':
        this.skillStatus = msg;
        this.skillPortal.status(msg);
        break;
      case 'rgQ': this.rg.onJson(msg); this.onGather('boatrace', msg.v); break;
      case 'rg': case 'rgTop': case 'rgFin': this.rg.onJson(msg); if (msg.t === 'rg') this.onGather('boatrace', this.boatRaceStatus); break;
      case 'hideSt': this.onGather('hide', msg.v); break;
      case 'plane': case 'planePos': case 'planeMe': this.plane.onJson(msg); break;
      case 'startZone':
        this.startZone = msg;
        for (const kind of ['paintball', 'fort']) this.entryCircles.get(kind)!.status({ left: kind === msg.kind ? msg.left : 0, hint: 'Встань на 3 секунды · E — сразу' });
        break;
      case 'storm': this.stormState = msg.v; this.storm3d.set(msg.v); break;
      case 'pirates': this.pirates3d.set(msg.v); break;
      case 'pnow': this.pirates3d.snap(msg); break;
      case 'pfx': this.pirates3d.fxMsg(msg); break;
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
        this.checkFerryLevel(msg.progress.xp);
        break;
      case 'fishNpc':
        this.fish2.onNpc(msg);
        break;
      case 'fishLost':
        this.fish2.onLost(msg.tier, msg.xp);
        break;
      case 'roulette':
        this.roulette3d.setView(msg.v, this.d.net.pingMs / 2);
        this.fish2.onRoulette(msg.v);
        break;
      case 'rat':
        this.rat3d.setView(msg.v, this.d.net.pingMs / 2);
        this.ratHud.setView(msg.v);
        break;
      case 'ratResult':
        this.ratHud.onResult(msg);
        // итог пришёл, когда у меня забег уже добежал, — сказать сейчас
        if (!this.rat3d.running && this.rat3d.lastRace === msg.race) this.ratFinished(msg.race);
        break;
      case 'ratBet':
        this.ratHud.onBetReply(msg);
        this.d.ui.toasts.show(msg.ok ? `🐀 ${msg.text}` : msg.text, msg.ok ? 3500 : 4500);
        if (msg.ok) this.d.sound.chipStack(null, 3);
        break;
      case 'ratCheer':
        this.onRatCheer(msg.id, msg.rat);
        break;
      case 'rouletteResult':
        this.fish2.roulette.onResult(msg);
        this.rlResult = msg;
        break;
      case 'fishEvent':
        this.fish2.onEvent(msg.on, msg.until);
        break;
      case 'fishSeason':
        this.fishJumps.setSeason(msg.on);
        this.fish2.onSeason(msg.on, msg.endsAt);
        break;
      case 'fishHold':
        this.fishHolds.set(msg.id, msg.n, msg.sp, msg.g);
        if (msg.id === this.myId) this.fish2.setHeld(this.fishHolds.myN);
        break;
      case 'tokens':
        this.fish2.refreshBalance();
        this.bjHud.setBalance(this.d.ui.me().tokens);
        this.billiards.setBalance(this.d.ui.me().tokens);
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
    if (me.fishing) this.checkFerryLevel(me.fishing.xp);
    this.bjHud.setBalance(me.tokens);
    this.billiards.setBalance(me.tokens);
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
    // у баркаса матросы вытаскивают на палубу (и тех, кого под водой унесло за край — решает, где стоял), у аквапарка
    // сервер ставит на мостик старта (aquaFall — всё западнее площади, поэтому баркас проверяем раньше, как на сервере)
    if (mine) {
      this.d.ui.toasts.show(barkasWater(x, z) || barkasWater(this.footX, this.footZ) ? 'Плюх! 🌊 Матросы выудили тебя багром — снова на палубе'
        : aquaFall(x) ? 'Плюх! 🌊 Снова на мостике — ещё попытка' : 'Плюх! 🌊 Выбираемся обратно на площадь');
    }
  }

  /** Дорос до FERRY_LEVEL рыбалки — Семён зовёт в море (один раз, когда уровень сменился у нас на глазах). */
  private checkFerryLevel(xp: number): void {
    const lvl = fishLevel(xp);
    if (this.fishLvl >= 0 && this.fishLvl < FERRY_LEVEL && lvl >= FERRY_LEVEL) {
      this.d.ui.toasts.show('Семён берёт тебя в море! Лодка «Удалая» ждёт у его мостков — на баркас «Альбатрос»');
    }
    this.fishLvl = lvl;
  }

  // ------------------------------------------------------------ дурак

  /** Новый вид стола: карты и боты в 3D, свой стол — ещё и на панель. */
  private onTable(t: number, v: DurakTableView): void {
    if (t === BJ_TABLE) return;
    const now = performance.now();
    this.dkRecv[t] = now;
    this.tables3d.apply(t, v);
    this.decor.setView(t, v);
    if (this.dkSeat >= 0 && seatTable(this.dkSeat) === t) this.dkHud.setView(v, now);
  }

  private onBlackjack(view: BlackjackView): void {
    this.blackjack3d.setView(view);
    // панель показывает новый вид, когда карты в 3D долетят: не раскрываем очки раньше, чем карта упала на сукно
    this.bjHud.setHold(this.blackjack3d.busyUntil);
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
    this.decor.setMe(seat >= 0 && seatTable(seat) !== BJ_TABLE ? seatTable(seat) : -1);
    this.blackjack3d.setMe(seat >= 0 ? seatTable(seat) : -1, seat >= 0 ? seatChair(seat) : -1);
    if (seat < 0) {
      this.clearAim();
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

  /**
   * Кого заденет помидор от клика в точку экрана: центры корпусов сидящих соперников (игроки и боты, не я и не пустые
   * места) проецируем на экран и берём ближайшего в радиусе (мышь 110 px, палец 140 px; у ближних — по размеру силуэта).
   * Мерим по экрану, а не по мешу: целиться почти в центр не нужно. null — никого.
   */
  private tomatoAim(cx: number, cy: number, touch: boolean): (PickPoint & { body: number; cx: number; cy: number; size: number }) | null {
    if (this.dkSeat < 0) return null;
    const t = seatTable(this.dkSeat);
    const mine = seatChair(this.dkSeat);
    const v = this.tables3d.view(t);
    if (!v) return null;
    const rect = this.d.renderer.canvas.getBoundingClientRect();
    const cam = this.world.camera;
    cam.updateMatrixWorld();
    _tr.setFromMatrixColumn(cam.matrixWorld, 0);
    const base = touch ? TOMATO_REACH_TOUCH_PX : TOMATO_REACH_PX;
    const pts: Array<PickPoint & { body: number; cx: number; cy: number; size: number }> = [];
    const sx = (n: number): number => rect.left + ((n + 1) / 2) * rect.width;
    const sy = (n: number): number => rect.top + ((1 - n) / 2) * rect.height;
    for (let ch = 0; ch < TABLE_SEATS; ch++) {
      if (!targetable(v.seats[ch], ch, mine) || !this.tables3d.bodyEnds(t, ch, _tp, _th)) continue;
      const dist = _tp.distanceTo(cam.position);
      _tm.copy(_tp).lerp(_th, 0.5);
      _tq.copy(_tm).addScaledVector(_tr, TORSO_R);
      _tp.project(cam);
      _th.project(cam);
      _tm.project(cam);
      _tq.project(cam);
      if (_tp.z > 1 || _th.z > 1 || _tq.z > 1) continue;
      const body = Math.abs(_tq.x - _tm.x) * (rect.width / 2);
      const x = sx(_tp.x);
      const y = sy(_tp.y);
      const x2 = sx(_th.x);
      const y2 = sy(_th.y);
      pts.push({
        ch, body, x, y, x2, y2, cx: (x + x2) / 2, cy: (y + y2) / 2, size: Math.hypot(x2 - x, y2 - y),
        r: tomatoRadius(base, body, dist),
      });
    }
    const best = pickTomatoTarget(pts, cx, cy, mine);
    return best < 0 ? null : (pts.find((p) => p.ch === best) ?? null);
  }

  /** Клик по холсту за столом (кнопки и карты панели перехватывают клик раньше — сюда он не доходит): помидор в выбранного. */
  private onCanvasDown(e: MouseEvent): void {
    if (e.button !== 0 || !this.entered || this.dkSeat < 0 || this.d.input.locked || this.d.input.blocked) return;
    const hit = this.tomatoAim(e.clientX, e.clientY, TOUCH || (e as PointerEvent).pointerType === 'touch');
    if (!hit) return;
    const now = performance.now();
    if (!this.dkHud.tomatoReady(now)) {
      this.d.ui.toasts.show('Помидор ещё не созрел — подожди немного 🍅');
      return;
    }
    this.dkHud.tomatoSent(now);
    this.d.net.send({ t: 'durak', table: seatTable(this.dkSeat), a: 'tomato', on: hit.ch });
    if ((e as PointerEvent).pointerType !== 'touch') this.showAim(hit);
  }

  /** Наведение мыши: курсор-«рука» и кольцо с именем на той желейке, в которую полетит помидор. */
  private onCanvasMove(e: PointerEvent): void {
    if (this.dkSeat < 0 || !this.entered || e.pointerType === 'touch' || this.d.input.locked || this.d.input.blocked) {
      this.clearAim();
      return;
    }
    const hit = this.tomatoAim(e.clientX, e.clientY, false);
    if (!hit) {
      this.clearAim();
      return;
    }
    this.showAim(hit);
  }

  private showAim(hit: PickPoint & { body: number; cx: number; cy: number; size: number }): void {
    this.aimOn = true;
    this.d.renderer.canvas.style.cursor = 'pointer';
    this.dkHud.aim({ x: hit.cx, y: hit.cy, body: Math.max(hit.body, hit.size / 2), nick: this.tables3d.view(seatTable(this.dkSeat))?.seats[hit.ch]?.nick ?? '' });
  }

  private clearAim(): void {
    if (!this.aimOn) return;
    this.aimOn = false;
    this.d.renderer.canvas.style.cursor = '';
    this.dkHud.aim(null);
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

  /** Статус «Удалой»: её боксы — только у той стоянки, где она стоит (как на сервере); first — при входе, без гудка. */
  private setFerry(st: FerryStatus, first = false): void {
    this.ferry = { ph: st.ph, at: st.at, n: st.n, c: st.c };
    const home = st.ph === FE_HOME || st.ph === FE_BOARD;
    for (const i of this.world.map.ferryHomeBoxes) this.world.collision.setEnabled(i, home);
    for (const i of this.world.map.ferryAwayBoxes) this.world.collision.setEnabled(i, st.ph === FE_AWAY);
    this.world.barkas.setFerry(this.ferry, first);
  }

  /** «Удалая»: у стоянки — секунд до отхода, в рейсе — до прихода (куда идёт). */
  private ferrySecs(): number {
    const f = this.ferry;
    const tick = this.clock.renderTick;
    const s = (ticks: number): number => Math.max(0, Math.ceil(ticks / TICK_RATE));
    if (f.ph === FE_BOARD || f.ph === FE_AWAY) return s(f.at - tick);
    if (f.ph === FE_OUT) return s(ferryEta(f.ph, f.at, tick, true));
    if (f.ph === FE_BACK) return s(ferryEta(f.ph, f.at, tick, false));
    return 0;
  }

  /** Сколько секунд до отплытия (посадка) или до возвращения к причалу (поездка). */
  private boatSecs(): number {
    const b = this.boat;
    const end = b.ph === BP_RIDE ? b.at + BOAT_RIDE_TICKS : b.at;
    return Math.max(0, Math.ceil((end - this.clock.renderTick) / TICK_RATE));
  }

  // ------------------------------------------------------------ сеть: снимки

  onSnapshot(buf: ArrayBuffer, at: number): void {
    // катера регаты — отдельное сообщение (client/lobby/regatta.ts)
    if (this.rg.onBinary(buf)) return;
    if (this.myId < 0) return;
    const n = decodeSnapshot(buf, this.header, this.selfSnap, this.ents);
    if (n < 0) return;
    const h = this.header;
    this.clock.addSample(h.tick, at);
    // Данные отдачи входят в переигрывание неподтверждённых входов ниже.
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
        } else if (isFerry(action) && !isFerry(prev)) {
          // сел в лодку «Удалая» — тоже по носу
          input.yaw = this.ferryPose.yaw;
          input.pitch = -0.12;
        } else if (action === ACT_WHEEL && prev !== ACT_WHEEL) {
          // сел в кабинку колеса — взгляд на надпись TIREDWOOD на горе (чуть в сторону от желейки): при подъёме она
          // выплывает над крышами города; кабинка внизу снова через один оборот
          input.yaw = WHEEL_VIEW.yaw;
          input.pitch = WHEEL_VIEW.pitch;
          this.wheelUntil = this.clock.ready ? wheelArrival(Math.floor(arg / WHEEL_SEATS), Math.round(this.clock.renderTick)) : 0;
        }
      }
      // сошёл с катера регаты (сервер ставит у круга сбора) — лицом к площади, не к воде
      if (prev === ACT_REGATTA && action !== ACT_REGATTA) {
        const sp = this.world.map.boatraceSpawn;
        const c = this.world.map.spawn;
        input.yaw = Math.atan2(sp.x - c.x, sp.z - c.z);
        input.pitch = -0.12;
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
      // у бильярдного стола мышь — прицел и кнопки панели
      if (action === ACT_BILLIARDS) {
        input.releaseAll();
        input.unlock();
        // лицом к столу: запад (сторона 0) смотрит на восток
        input.yaw = arg % 2 === 0 ? -Math.PI / 2 : Math.PI / 2;
        input.pitch = -0.2;
        this.billiards.setSeat(Math.floor(arg / 2), arg % 2);
      } else if (prev === ACT_BILLIARDS) {
        this.billiards.setSeat(-1, -1);
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
    // пилот гидроплана: E — «сесть сейчас», Ctrl — медленнее
    if (this.plane.onKey(code, down, e)) return true;
    if (!down || e.repeat) return false;
    if (this.fish2.modalOpen) {
      if (code === 'Escape') {
        if (this.fish2.npcOpen) this.fish2.closeNpc();
        else this.fish2.closeBook();
      } else if (code === 'KeyJ' && this.fish2.bookOpen) this.fish2.closeBook();
      else if (code === 'KeyI' && this.fish2.npcOpen) this.fish2.closeNpc();
      if (MOVE_KEYS.has(code) || code === 'KeyE') e.preventDefault();
      return true;
    }
    // окно музыкального автомата: цифры, стрелки, Enter, Esc; шаг — не съедает (отошёл — окно закроется)
    if (this.juke.onKey(code, e)) return true;
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
    if (this.rg.racing) return this.rg.onKey(code);
    // рыба в руках: Esc — убрать
    if (code === 'Escape' && this.fishHolds.myN >= 0 && !this.fish2.bookOpen) {
      this.d.net.send({ t: 'fishHold', n: -1 });
      return true;
    }
    // журнал рыбака (рыбалка 2.0): J — открыть или закрыть, Esc — закрыть
    if (this.fish2.bookOpen && code === 'Escape') {
      this.fish2.closeBook();
      return true;
    }
    if (code === 'KeyJ' && this.fish2.on && this.hasSelf && act !== ACT_DURAK) {
      this.fish2.toggleBook();
      return true;
    }
    // рюкзак с уловом (fisheco): I — открыть или закрыть
    if (code === 'KeyI' && this.fish2.on && this.hasSelf && act !== ACT_DURAK) {
      this.fish2.toggleBag();
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
    if (act === ACT_BILLIARDS) {
      if (this.billiards.onKey(code, e)) return true;
      if (code === 'KeyE') {
        this.billiards.hud.escape();
        return true;
      }
      // в партии шаг не поднимает (снимается в тике); на тренировке — отошёл, мышь обратно сразу
      if (MOVE_KEYS.has(code) && !this.billiards.locked) {
        this.billiards.setSeat(-1, -1);
        this.d.wantPointer();
      }
      return false;
    }
    if (act === ACT_FISH) {
      // 1 / 2 — что делать с уловом; пробел — заброс и подсечка (в тике он снимается с прыжка)
      if (code === 'Digit1' || code === 'Digit2') {
        this.fishHud.choose(code === 'Digit1');
        return true;
      }
      if (code === 'Space') this.fishPress();
    }
    // у арены во время отсчёта и забега 1–6 — болеть за крысу (вместо эмоций)
    if (this.ratHud.cheerKey(code)) return true;
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
    if (this.dkHud.onKey(code)) return true;
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
    // у двери маяка в шторм: E, клик мышью или кнопка на телефоне — зажечь
    if (this.storm3d.canLight) {
      this.d.net.send({ t: 'stormLight' });
      return;
    }
    if (mouse) {
      if (act === ACT_FISH) this.fishPress();
      // клик по музыкальному автомату под подсказкой — окно выбора песни
      else if (this.target?.kind === 'juke' && !isHeld(act) && !this.raiding) this.juke.open();
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
    if (it?.kind === 'juke') this.juke.toggle();
    else if (it?.kind === 'fisher' && this.fish2.on) this.fish2.requestNpcOpen(FISH_NPCS[it.arg] ?? 'semyon');
    else if (it?.kind === 'ratrace') {
      this.d.net.send({ t: 'use', id: it.id });
      this.ratHud.open(this.d.ui.me().pid);
    }
    else if (it?.kind === 'banner') this.plane.openBanner();
    else if (it?.kind === 'roulette') {
      this.d.net.send({ t: 'use', id: it.id });
      this.fish2.openRoulette();
    }
    else if (it && usable(it.kind) && (it.kind !== 'kboard' || this.cheerable)) this.d.net.send({ t: 'use', id: it.id });
    // у статуи E (на телефоне — та же кнопка, на ней «F») — отдать честь
    else if (!it && this.respectHere) this.payRespect();
    else if (!it && this.eventEligible) {
      const cat = this.critters.nearestCat(this.pose);
      if (cat) this.critters.petCat(cat.id, this.clock.renderTick, this.time);
    }
  }

  /** До середины арены крысиных бегов, м (нет себя — далеко) */
  private ratDist(): number {
    const p = this.pose;
    return this.hasSelf ? Math.hypot(p.x - RAT_CENTER.x, p.z - RAT_CENTER.z) : 99;
  }

  /** Крысиные бега каждый кадр: плашка и кнопки «болеть» у арены, кот-зритель, итог моей ставки после финиша */
  private updateRats(): void {
    if (!this.rat3d.on) return;
    this.ratHud.setNear(this.ratDist());
    if (this.rat3d.catWanted) {
      const look = this.rat3d.lookPoint();
      if (!this.ratVisit) this.ratVisit = { path: RAT_CAT_APPROACH, seat: RAT_CAT_SEAT, look: { x: look.x, z: look.z } };
      this.ratVisit.look.x = look.x;
      this.ratVisit.look.z = look.z;
      this.critters.setVisit(0, this.ratVisit);
    } else if (this.ratVisit) {
      this.ratVisit = null;
      this.critters.setVisit(0, null);
    }
    const running = this.rat3d.running;
    if (this.ratRunning && !running) this.ratFinished(this.rat3d.lastRace);
    this.ratRunning = running;
  }

  /** Забег у меня добежал: тост с итогом моей ставки и монеты */
  private ratFinished(race: number): void {
    const r = this.ratHud.finishText(race);
    if (!r) return;
    this.d.ui.toasts.show(r.text, 6500);
    if (r.payout > 0) this.d.sound.coins(null, Math.min(8, 3 + Math.round(Math.log10(r.payout))));
  }

  /** Кто-то болеет за крысу: облачко над ним, крыса оживляется, трибуна шумит тем громче, чем больше болеют */
  private onRatCheer(slot: number, rat: number): void {
    const name = RATS[rat]?.name;
    if (!name) return;
    const av = slot === this.myId ? this.me : this.remotes.get(slot)?.avatar;
    const lines = [`Давай, ${name}!`, `Жми, ${name}!`, `${name}, вперёд!`, `Беги, ${name}!`, `Ну же, ${name}!`];
    av?.say(lines[Math.floor(Math.random() * lines.length)]);
    this.rat3d.cheer(rat);
    const now = performance.now();
    this.ratCheers.push(now);
    while (this.ratCheers.length && now - this.ratCheers[0] > 4000) this.ratCheers.shift();
    if (this.ratDist() < 30) this.d.sound.ratCrowd([RAT_CENTER.x, 0.8, RAT_CENTER.z], Math.min(1, this.ratCheers.length / 8));
    void ratAcc;
  }

  /** Рулетка каждый кадр: плашка раунда — только у стола; итог моей ставки — когда шарик лёг в лунку */
  private updateRoulette(): void {
    const p = this.pose;
    this.fish2.roulette.setNear(this.hasSelf && Math.hypot(p.x - ROULETTE_SPOT.x, p.z - ROULETTE_SPOT.z) <= 9 && Math.abs(p.y - ROULETTE_SPOT.y) < 3);
    const spin = this.roulette3d.spinning;
    if (spin !== this.rlSpun) { this.rlSpun = spin; this.fish2.roulette.refresh(); }
    const m = this.rlResult;
    if (!m || spin) return;
    this.rlResult = null;
    this.d.ui.toasts.show(RouletteHud.resultText(m), 6000);
    if (m.payout > 0) this.d.sound.coins(null, Math.min(8, 3 + Math.round(Math.log10(m.payout))));
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
      // рюкзак полон — заброс не уйдёт (сервер решил бы так же): сразу подсказка
      if (this.fish2.on && this.fish2.bagFull) {
        this.d.ui.toasts.show('Рюкзак полон — продай улов Семёну или Сане (I — рюкзак)', 3200);
        this.fishSentAt = now;
        return;
      }
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
    // у бильярдного стола пробел — замах; в партии и шаг не уводит от стола (выйти — Esc)
    if (this.action === ACT_BILLIARDS) buttons &= this.billiards.locked ? ~LEAVE_SEAT : ~BTN_JUMP;
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
    this.rg.tickInput(inp);
    this.plane.tickInput(inp);
    this.ball.tick(inp.seq, this.predictor.state, this.predictor.hold || (this.raiding ? 1 : 0));
    if (this.raiding && (buttons & BTN_FIRE)) this.pirates3d.localFire(inp.viewTick);
    this.onLocalEvents(ev);
    this.aquaLocal(inp.seq);
    const ps = this.predictor.state;
    if (ps.grounded === 1) {
      this.footX = ps.x;
      this.footZ = ps.z;
    }
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
    // пилот гидроплана: мышь ведёт нос в пределах самолёта
    this.plane.frameInput(dt, act);

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
    this.updateFerryPose();
    this.updateLocalPose(alpha);
    this.rg.frame(dt, this.clock.ready ? this.clock.renderTick : 0, alpha, this.world.camera.position);
    this.plane.frame(dt, this.clock.ready ? this.clock.renderTick : 0, alpha, this.world.camera.position, act);
    this.updateCamera(dt);
    const camPos = this.world.camera.position;
    this.wirePartner(this.me);
    this.fishDrink.update(dt, this.hasSelf && act === ACT_NONE);
    this.fishHolds.update(dt, (id) => (id === this.myId ? (this.hasSelf ? this.me : null) : this.remotes.get(id)?.avatar ?? null));
    this.me.update(this.hasSelf ? this.plane.avatarPose(this.myId, act === ACT_PLANE, this.rg.avatarPose(this.myId, act === ACT_REGATTA, this.pose)) : null, dt, this.time, this.ground, camPos, true);
    // у бильярдного стола камера прямо над своей головой — себя не рисуем, иначе шапка закрывает ближний борт
    if (act === ACT_BILLIARDS) this.me.root.visible = false;
    this.updateRemotes(dt);
    this.updateFishing(dt);
    this.fishForCritters.length = 0;
    for (let i = 0; i < FISH_SPOTS.length; i++) if (this.fishOcc[i] && this.fishing.phaseOf(i) === FP_HOLD) this.fishForCritters.push(FISH_SPOTS[i]);
    this.critterOthers.length = 0;
    for (const [id, r] of this.remotes) if (r.pose.valid) this.critterOthers.push({ id, x: r.pose.x, y: r.pose.y, z: r.pose.z });
    this.critters.update(this.clock.renderTick, this.time, camPos, { ...this.pose, speed: Math.hypot(this.predictor.state.vx, this.predictor.state.vz) }, this.fishForCritters, this.critterOthers);
    this.mermaid.update(this.clock.ready ? this.clock.renderTick : -1, dt, this.time, this.world.camera);
    this.storm3d.update(this.clock.renderTick, dt, this.pose, this.eventEligible, lobbyQuality(this.d.settings.quality) === 'low');
    const pm = this.pirateMe;
    pm.x = this.pose.x; pm.y = this.pose.y; pm.z = this.pose.z; pm.yaw = this.d.input.yaw; pm.pitch = this.d.input.pitch; pm.slot = this.myId; pm.pid = this.d.ui.me().pid;
    this.pirates3d.update(this.clock.ready ? this.clock.renderTick : 0, dt, this.world.camera, this.hasSelf ? pm : null, this.eventEligible, TOUCH);
    this.folk.update(dt, this.time, camPos, this.world.weather.rain);
    this.fishHouse.update(dt, this.time, camPos, this.world.weather.rain);
    this.fish2.updateVisuals(dt, this.time, camPos, this.hasSelf ? this.pose : null);
    this.fishJumps.update(dt, camPos, lobbyQuality(this.d.settings.quality) === 'low');
    this.roulette3d.update(dt);
    this.updateRoulette();
    this.rat3d.update(dt, this.time, camPos);
    this.updateRats();
    this.juke.update(dt, this.hasSelf ? this.pose : null, this.world.camera);
    this.respects.update(dt, this.time, this.respecting());
    const ps = this.predictor.state;
    this.ball.update(dt, alpha, ps.x, ps.z, this.clock.ready && this.hasSelf ? this.clock.renderTick - this.tickLag : null);
    this.tables3d.update(dt, this.time, camPos);
    this.decor.update(dt, this.time, camPos);
    this.blackjack3d.update(dt, this.time, camPos);
    this.billiards.update(dt, this.time, camPos);
    this.dkHud.tick(performance.now());
    this.bjHud.tick(performance.now());
    this.updateHud();

    this.effects.update(dt);
    this.updateSlots(dt, this.busySlots | (act === ACT_SLOT ? 1 << this.arg : 0));
    this.world.barkas.setListener(this.d.sound.kit, this.hasSelf ? this.pose : null);
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
    sound.setRain(this.world.effectiveRain, this.hasSelf ? this.world.shelter(this.pose.x, this.pose.y, this.pose.z) : 0);
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
    this.fishHouse.update(dt, this.time, cam.position, this.world.weather.rain);
    this.fish2.updateVisuals(dt, this.time, cam.position);
    this.roulette3d.update(dt);
    this.rat3d.update(dt, this.time, cam.position);
    this.respects.update(dt, this.time, 0);
    this.effects.update(dt);
    this.world.barkas.setListener(this.d.sound.kit, null);
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

  /** Где «Удалая» на экране: в рейсе — на пути по часам отрисовки, иначе у стоянки. Плывём — взгляд поворачивает с ней. */
  private updateFerryPose(): void {
    const f = this.ferry;
    const p = this.ferryPose;
    ferryPose(f.ph, f.at, this.clock.ready ? this.clock.renderTick : f.at, p);
    let turn = p.yaw - this.ferryYaw;
    turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;
    this.ferryYaw = p.yaw;
    if (this.hasSelf && this.myAct === ACT_FERRY_RIDE) this.d.input.yaw += turn;
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
    } else if (isFerry(act)) {
      // в лодке «Удалая»: в рейсе — на своей банке по пути лодки (часы те же, что у лодки на экране), у стоянки — где
      // посадил сервер; качается вместе с лодкой и смотрит по носу
      if (act === ACT_FERRY_RIDE && this.arg < FERRY_SEATS) {
        const at = ferrySeat(this.ferryPose, this.arg, this.seatTmp);
        pose.x = at.x;
        pose.y = FERRY_FLOOR_Y;
        pose.z = at.z;
      }
      const fo = this.world.barkas.ferry.offset;
      pose.x += fo.x;
      pose.y += fo.y;
      pose.z += fo.z;
      pose.yaw = this.ferryPose.yaw;
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
    // в катере регаты — камера погони (пролёт 0,6 с туда и обратно)
    if (this.rg.camera(cam, this.cam, dt, vfov(settings.fov))) return;
    // пилот гидроплана — камера за самолётом
    if (this.plane.camera(cam, dt, vfov(settings.fov))) return;
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
        const bj = seatTable(this.arg) === BJ_TABLE;
        const camD = bj ? BJ_CAM_D : TABLE_CAM_D;
        const camY = bj ? BJ_CAM_Y : TABLE_CAM_Y;
        const pitch = bj ? BJ_PITCH : TABLE_PITCH;
        const cx = tb.x + ux * camD;
        const cz = tb.z + uz * camD;
        const h = Math.cos(pitch);
        this.cam.fixed(cam, dt, cx, camY, cz, cx - ux * h, camY - Math.sin(pitch), cz - uz * h, TABLE_FOV, 'table');
      }
    } else if (act === ACT_BILLIARDS && this.billiards.cameraPose()) {
      const c = this.billiards.cameraPose()!;
      this.cam.fixed(cam, dt, c.px, c.py, c.pz, c.lx, c.ly, c.lz, c.fov, 'table');
    } else if (act === ACT_WARDROBE && this.wardrobeOpen) {
      this.cam.mirror(cam, dt, p.x, p.y, p.z, p.yaw, MIRROR_FOV);
    } else {
      this.cam.follow(cam, dt, isHeld(act) ? 'sit' : 'walk', p.x, p.y, p.z, input.yaw, input.pitch, this.world.collision, vfov(settings.fov), this.raiding ? 1 : 0);
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
      const ferry = isFerry(r.track.hp);
      if (ok) {
        if (pose.valid && dt > 0 && !aboard && !ferry && r.track.hp !== ACT_WHEEL) {
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
        } else if (ferry) {
          const fo = this.world.barkas.ferry.offset;
          pose.x += fo.x;
          pose.y += fo.y;
          pose.z += fo.z;
        }
      } else {
        pose.valid = false;
      }
      // действие — по последнему снимку (сидит, у автомата, эмоция)
      const av = r.avatar;
      if (av.action !== r.track.hp || av.arg !== r.track.armor) av.setAction(r.track.hp, r.track.armor);
      this.wirePartner(av);
      av.update(this.plane.avatarPose(r.track.id, r.track.hp === ACT_PLANE, this.rg.avatarPose(r.track.id, r.track.hp === ACT_REGATTA, ok ? pose : null)), dt, this.time, this.ground, camPos, false);
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
    hud.showEmotes(this.hasSelf && !isHeld(act) && !this.ratHud.cheering);
    const kd = this.kartDist();
    this.kartBeeps(kd <= KART_START.r);
    const fd = this.fcSt && this.hasSelf ? fightDist(this.pose.x, this.pose.y, this.pose.z) : Infinity;
    this.fightBeeps(fd);
    if (!this.hasSelf || act === ACT_WARDROBE) hud.setHint(null);
    else if (act === ACT_SLOT) hud.setHint(TOUCH ? ['🎰'] : ['ЛКМ', '/', 'Пробел'], `крутить · ставка ${STAKES[this.arg] ?? '?'} 🪙 · шаг — отойти`);
    else if (act === ACT_DURAK || act === ACT_BILLIARDS) hud.setHint(null);
    else if (act === ACT_FISH) this.hintFish();
    else if (act === ACT_BOAT) hud.setHint(TOUCH ? ['E'] : ['W', 'A', 'S', 'D'], `выйти из катера · отплытие через ${this.boatSecs()} с`);
    else if (act === ACT_RIDE) hud.setHint([], `Прогулка по бухте · ещё ${this.boatSecs()} с · ${TOUCH ? 'пальцем' : 'мышь'} — осмотреться`);
    else if (act === ACT_FERRY) hud.setHint(TOUCH ? ['E'] : ['W', 'A', 'S', 'D'], `выйти из лодки · отход через ${this.ferrySecs()} с`);
    else if (act === ACT_FERRY_RIDE) {
      hud.setHint([], `«Удалая» идёт ${this.ferry.ph === FE_BACK ? 'к Семёну' : 'к баркасу «Альбатрос»'} · ещё ${this.ferrySecs()} с · ${TOUCH ? 'пальцем' : 'мышь'} — осмотреться`);
    }
    else if (act === ACT_WHEEL) hud.setHint([], `Колесо обозрения · внизу через ${this.wheelSecs()} с · ${TOUCH ? 'пальцем' : 'мышь'} — осмотреться`);
    // в катере регаты подсказки — свои (client/lobby/regattahud.ts)
    else if (act === ACT_REGATTA || this.rg.racing) hud.setHint(null);
    // в самолёте подсказки — свои (client/lobby/plane.ts)
    else if (act === ACT_PLANE) hud.setHint(null);
    else if (isHeld(act)) hud.setHint(TOUCH ? ['E'] : ['W', 'A', 'S', 'D'], TOUCH ? 'встать · справа пальцем — осмотреться' : 'встать · мышь — осмотреться');
    else if (this.storm3d.hint) hud.setHint(this.storm3d.hint.keys, this.storm3d.hint.text);
    else if (this.pirates3d.hint) hud.setHint(this.pirates3d.hint.keys, this.pirates3d.hint.text);
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
    if (ph === FP_IDLE && this.fish2.on && this.fish2.bagFull) h.setHint(TOUCH ? [] : ['I'], 'Рюкзак полон — продай улов Семёну или Сане');
    else if (ph === FP_IDLE) h.setHint(cast, TOUCH ? 'Забросить' : `забросить · ${this.fish2.on ? 'J — журнал · I — рюкзак · ' : ''}E или шаг — уйти`);
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
      if (it.kind === 'roulette' && !this.roulette3d.group.visible) continue;
      if (it.kind === 'ratrace' && !this.rat3d.on) continue;
      if (it.kind === 'skill' && !this.skillStatus) continue;
      if (it.kind === 'boatrace' && !this.boatRaceStatus) continue;
      if (it.kind === 'hide' && !this.hideStatus) continue;
      if (it.kind === 'juke' && !this.juke.enabled) continue;
      if (it.kind === 'billiards' && (!this.billiards.on || this.myAct === ACT_BILLIARDS)) continue;
      if ((it.kind === 'plane' || it.kind === 'banner') && !this.plane.enabled) continue;
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
      this.hud.setHint([], it.kind === 'boat' ? this.boatBusyText() : it.kind === 'ferry' ? `В лодке мест нет · отход через ${this.ferrySecs()} с`
        : it.kind === 'slot' ? 'Автомат занят' : it.kind === 'fish' ? 'Здесь уже рыбачат' : 'Место занято');
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
        this.hud.setHint(['E'], chair?.away ? 'вернуться за стол блэкджека' : `блэкджек · бесплатно или ставка до ${BJ_MAX_BET}`);
        break;
      }
      case 'billiards':
        this.hud.setHint(['E'], this.billiards.hint(it.arg));
        break;
      case 'skill': {
        const s = this.skillStatus;
        this.hud.setHint(['E'], s?.phase === 'pre' ? `Выше облаков · сбор забега, старт через ${s.left} с — успевай!` : `Выше облаков · Небесная каланча · ${s?.n ?? 0}/${s?.max ?? 5} игроков${s?.phase === 'run' ? ' · идёт забег' : ''}`);
        break;
      }
      case 'boatrace':
      case 'hide': {
        const s = it.kind === 'boatrace' ? this.boatRaceStatus : this.hideStatus;
        if (!s) break;
        this.hud.setHint(it.kind === 'hide' && s.phase !== 'count' && s.phase !== 'idle' ? ['E'] : [], s.phase === 'count' && 'left' in s ? `Старт через ${s.left} с · в круге ${s.n}${it.kind === 'boatrace' ? ` · ${botsWord(s.n)}` : ''}`
          : it.kind === 'boatrace' && this.rg.phase !== 'idle' ? 'Регата идёт — стой в круге, поедешь в следующем заезде'
          : s.phase === 'idle' ? it.kind === 'hide' ? 'Встаньте в круг вдвоём · прятки 3 минуты' : `Встань в круг · 3 круга по бухте · ${BOTS_RULE}`
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
        this.hud.setHint(['E'], it.arg === 1 ? 'поговорить с Саней · продать улов, снасти, домой к Семёну' : 'поговорить с Дедом Семёном · продать улов, снасти, задания');
        break;
      case 'ferry':
        this.hintFerry(it.arg);
        break;
      case 'roulette':
        this.hud.setHint(['E'], this.fish2.roulette.hint());
        break;
      case 'ratrace':
        this.hud.setHint(['E'], this.ratHud.hint());
        break;
      case 'juke':
        this.hud.setHint(TOUCH ? ['E'] : ['E', '/', 'ЛКМ'], `музыкальный автомат · песни от ${JUKE_PRICE} 🪙`);
        break;
      case 'boat':
        if (this.boat.ph === BP_BOARD) this.hud.setHint(['E'], `сесть в катер — бесплатно · отплытие через ${this.boatSecs()} с`);
        else this.hud.setHint(['E'], `прокатиться на катере — ${BOAT_PRICE} 🪙, друзья садятся бесплатно`);
        break;
      case 'wheel':
        this.hud.setHint(['E'], `колесо обозрения — ${WHEEL_PRICE} 🪙 · один оборот, ${Math.round(WHEEL_PERIOD / TICK_RATE)} с`);
        break;
      case 'plane':
        this.hud.setHint(...this.plane.hint());
        break;
      case 'banner':
        this.hud.setHint(...this.plane.bannerHint());
        break;
      case 'fort': {
        const h = this.fortSt ? fortHint(this.fortSt) : null;
        if (h) this.hud.setHint(h.keys, h.text);
        break;
      }
    }
  }

  /**
   * Лодка «Удалая»: у мостков Семёна (arg 0) — сесть (с FERRY_LEVEL-го уровня рыбалки) или когда вернётся; у калитки
   * баркаса (arg 1) — сесть или позвонить в колокол.
   */
  private hintFerry(arg: number): void {
    const f = this.ferry;
    const tick = this.clock.renderTick;
    const secs = this.ferrySecs();
    if (arg === 1) {
      if (f.ph === FE_AWAY) this.hud.setHint(['E'], `сесть в лодку — к Семёну, бесплатно · отход через ${secs} с`);
      else if (f.ph === FE_OUT) this.hud.setHint([], `«Удалая» идёт сюда · будет через ${secs} с`);
      else if (f.c) this.hud.setHint([], `Гоша услышал колокол — «Удалая» будет через ${Math.max(1, Math.ceil(ferryEta(f.ph, f.at, tick, true) / TICK_RATE))} с`);
      else this.hud.setHint(['E'], 'позвонить в колокол — Гоша приведёт лодку «Удалая»');
      return;
    }
    if (f.ph !== FE_HOME && f.ph !== FE_BOARD) {
      this.hud.setHint([], `«Удалая» в море · вернётся к мосткам через ${Math.ceil(ferryEta(f.ph, f.at, tick, false) / TICK_RATE)} с`);
      return;
    }
    const xp = this.d.ui.me().fishing?.xp ?? 0;
    const lvl = fishLevel(xp);
    if (lvl < FERRY_LEVEL) {
      // новичку — понятно, почему нет и сколько осталось (E — Семён скажет то же)
      this.hud.setHint([], `Лодка к баркасу «Альбатрос» — с ${FERRY_LEVEL}-го уровня рыбалки · у тебя ${lvl}-й, ещё ${Math.max(0, FISH_XP_LEVELS[FERRY_LEVEL] - xp)} опыта`);
      return;
    }
    this.hud.setHint(['E'], f.ph === FE_BOARD ? `сесть в лодку «Удалая» · отход через ${secs} с` : 'сесть в лодку «Удалая» — на баркас «Альбатрос», бесплатно');
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
    if (it.kind === 'ferry') return this.ferry.n >= FERRY_SEATS && this.ferry.ph === (it.arg === 1 ? FE_AWAY : FE_BOARD);
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
      pos: [s.x, s.y, s.z], corrections: this.predictor.corrections, target: this.target?.kind ?? null, barkas: this.world.barkas.debug(),
      renderTick: this.clock.renderTick, delay: this.clock.delay, jitter: this.clock.jitter,
      remotes: this.remotes.size, queue: this.queueAvg, fps: this.fps, seq: this.seq,
      dkSeat: this.dkSeat, dkLocked: this.dkHud.locked, dkHand: this.dkHand?.cards.length ?? -1,
      blackjack: this.blackjack3d.view(), blackjackOpen: this.bjHud.visible, billiards: this.billiards.debug(), skill: this.skillStatus, kraken: this.kraken.debug(),
      boatrace: this.boatRaceStatus, regatta: this.rg.debug(), plane: this.plane.debug(), hide: this.hideStatus, startZone: this.startZone,
      storm: this.stormState, pirates: this.pirates3d.debug(), critters: this.critters.debug(),
      ask: this.ask?.k ?? -1, photoCard: this.photo.hasCard, ball: this.ball.debug(),
      fish: this.fishing.debug(), fishSpot: this.myFishSpot, fishCard: this.fishHud.hasCard, fish2: this.fish2.debug(),
      fishHold: this.fishHolds.of(this.myId), fishJumps: { on: this.fishJumps.on, flying: this.fishJumps.flying },
      weather: this.world.weather.debug(), folk: this.folk.debug(), boats: this.world.boats.debug(), respect: this.respects.debug(), mermaid: this.mermaid.debug(),
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
