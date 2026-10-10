// «Подземелье»: состояние забега DgSim — всё, что нужно клиенту для отрисовки и серверу для итогов.
// Только простые объекты и массивы (без классов, замыканий, Map): забег можно копировать structuredClone.
// Координаты: x — восток (вправо на экране), z — юг (вниз на экране), метры, всегда в [0, 240) — тор.
// Разница двух точек — wrapD(b − a) из util.ts. Время — целые шаги симуляции (30 в секунду): поле t0/t1 —
// номер шага начала/конца, сравнивай с sim.t. «Направление» — единичный вектор (dx, dz), угол — Math.atan2(dz, dx).
import type { DgStage } from './api.ts';
import type { MobKind, PassiveId, WeaponId } from './data.ts';

export type { MobKind, PassiveId, WeaponId };

/** Состояние врага (что играть в анимации) */
export type MobState =
  | 'walk' // идёт к герою
  | 'hover' // мышь зависла между рывками
  | 'dash' // мышь в рывке / Бочар несётся тараном
  | 'wind' // замах: плевун поднял голову, Бочар топает перед тараном, шаман колдует, босс встаёт на дыбы
  | 'rest' // отдых после атаки
  | 'stun' // оглушён (Q, шашки, таран в стену)
  | 'cast' // шаман: лечение (кольцо на полу)
  | 'summon' // шаман/босс зовёт свиту
  | 'flee' // конец волны: уходит в нору (исчезнет через 1 с)
  // только босс:
  | 'dive' // ныряет под землю
  | 'under' // ползёт под землёй (бугор) — не уязвим, не цель
  | 'rise' // круг вынырка пульсирует, сейчас вынырнет
  | 'stuck' // голова застряла после вынырка — окно ×1,5 урона
  | 'roar' // рёв перехода фазы — неуязвим
  | 'tail'; // удар хвостом (сектор за спиной)

export interface DgMob {
  /** уникальный номер на весь забег */
  id: number;
  k: MobKind;
  /** 1 — элита/босс (рамка, полоса HP, стрелка у края экрана) */
  elite: 0 | 1;
  x: number;
  z: number;
  /** куда смотрит (единичный вектор) */
  dx: number;
  dz: number;
  /** скорость за последний шаг, м/с (для анимации бега) */
  vx: number;
  vz: number;
  /** отброс, м/с (затухает) */
  kx: number;
  kz: number;
  hp: number;
  hpMax: number;
  /** урон касанием (уже с множителем волны) */
  dmg: number;
  /** скорость, м/с (с множителями) */
  spd: number;
  /** радиус тела, м */
  r: number;
  st: MobState;
  /** шаг, с которого идёт состояние st */
  stT: number;
  /** шаг последнего попадания по нему (вспышка белым 60 мс), −1 — не били */
  hitT: number;
  /** 0 — жив; иначе шаг смерти (лежит в списке ещё ~0,5 с для анимации, без столкновений) */
  die: number;
  /** шагов до следующей особой атаки */
  cd: number;
  /** второй таймер особой атаки (шаман: призыв свиты; Бочар: капли варенья) */
  cd2: number;
  /** шагов до следующего удара касанием */
  touch: number;
  /** оглушён до шага (0 — нет) */
  stunT: number;
  /** горит до шага (0 — нет) и урон огня в секунду */
  burnT: number;
  burnD: number;
  /** часть отряда текущей волны (1) или свита/добавка/остаток прошлой волны (0) — для счётчика wave.left */
  sq: 0 | 1;
  /** озверение 0…3: пережил конец волны — +10 % скорости и урона за уровень (рисовать: красные глаза, пар, рамка) */
  rage: number;
  /** вспомогательная точка/направление (рывок, таран, цель нырка) */
  ax: number;
  az: number;
  /** мышь из налёта: летит прямо до шага (0 — обычная) */
  sw: number;
  /** HP в начале каста (шаман: сбить каст уроном) */
  castHp: number;
  /** босс под землёй: не цель и не получает урон */
  under: 0 | 1;
  /** получает ×1,5 урона до шага (стоп после тарана, застрявшая голова) */
  vulT: number;
  /** проверка «застрял»: шаг замера и расстояние до героя */
  chkT: number;
  chkD: number;
  /** когда снова можно задеть светляками и лучом маяка (шаг) */
  ffT: number;
  bmT: number;
  /** проклятый сундук: id постройки, за которой пришла элита (−1 — нет) */
  curse: number;
}

export interface DgBuff {
  /** fury — +50 % урона, haste — −30 % перезарядки, wind — +30 % скорости и рывок раз в 1 с, pull — притяжение опыта */
  id: 'fury' | 'haste' | 'wind' | 'pull';
  /** до шага */
  t1: number;
}

export interface DgHero {
  x: number;
  z: number;
  /** куда смотрит (последнее направление бега), единичный вектор */
  dx: number;
  dz: number;
  /** скорость за шаг, м/с (анимация бега) */
  vx: number;
  vz: number;
  /** отброс (таран, хвост, вынырок), м/с — затухает */
  kx: number;
  kz: number;
  hp: number;
  hpMax: number;
  level: number;
  /** опыт внутри уровня и сколько нужно до следующего */
  xp: number;
  xpNext: number;
  /** рывок: шагов до готовности и полная перезарядка (для круга на значке) */
  dashCd: number;
  dashCdMax: number;
  /** рывок идёт ещё столько шагов (0 — не в рывке); направление рывка */
  dashT: number;
  ddx: number;
  ddz: number;
  /** неуязвим до шага (рывок, после удара, после выбора карточки) */
  invT: number;
  /** Q: шагов до готовности и полная перезарядка */
  qCd: number;
  qCdMax: number;
  /** Q: сколько шагов держат заряд (0 — не заряжает); полный заряд — qFull шагов */
  qHold: number;
  qFull: number;
  /** шаг последнего полученного удара (вспышка красным) */
  hurtT: number;
  /** прыжок с гриба-батута: летит до шага jumpT1 из (jx0,jz0) в (jx1,jz1), начало jumpT0 (0 — не летит) */
  jumpT0: number;
  jumpT1: number;
  jx0: number;
  jz0: number;
  jx1: number;
  jz1: number;
  /** едет в вагонетке (id постройки) или −1 */
  ride: number;
  /** стоит в круге постройки (алтарь, проклятый сундук, кузня): id постройки, начало и конец отсчёта (−1 — нет).
   *  Круг на полу сжимается от useT0 к useT1; вышел из круга — сброс; в useT1 срабатывает (fx prop used) */
  useId: number;
  useT0: number;
  useT1: number;
  /** баффы алтаря */
  buffs: DgBuff[];
  /** множитель скорости сейчас (замедления: варенье, лужа, споры, заряд Q) — для подсказки и анимации */
  slow: number;
  /** шаг смерти (0 — жив) */
  dead: number;
}

export interface DgWeapon {
  id: WeaponId;
  lv: number;
  /** 1 — эволюция (Негасимый фонарь, Обвал, Маяк, Рой светляков) */
  evo: 0 | 1;
  /** шагов до следующего выстрела */
  cd: number;
  /** доп. таймер (глыба Обвала, повтор вспышки Фонаря) */
  t2: number;
}
export interface DgPassive {
  id: PassiveId;
  lv: number;
}

/** Снаряд героя: уголёк (летит в цель) или кирка (туда и обратно) */
export interface DgShot {
  id: number;
  k: 'ember' | 'pick';
  x: number;
  z: number;
  /** скорость, м/с — направление полёта */
  vx: number;
  vz: number;
  /** кирка: направление броска (единичный) и начальная скорость, м/с */
  dx: number;
  dz: number;
  v0: number;
  /** шаг вылета */
  t0: number;
  /** кирка: 0 — летит туда, 1 — возвращается; уголёк: id цели */
  ph: number;
  /** размер (кирка) */
  size: number;
  dmg: number;
  /** сколько ещё врагов пробьёт (уголёк) */
  pierce: number;
  /** кого уже задел (не бьёт дважды за проход) */
  hit: number[];
}

/** Метка на полу: тревога до удара врага или тень своего удара (сталактит, глыба) */
export interface DgMark {
  id: number;
  /** форма: круг, полоса (таран), сектор (хвост), кольцо (лечение шамана, рёв) */
  k: 'circle' | 'lane' | 'sector' | 'ring';
  /** что это: spit, charge, burrow, rise, tail, cavein, heal, roar, stal, boulder, hole (нора кольца) */
  what: string;
  x: number;
  z: number;
  /** радиус (круг/сектор/кольцо) */
  r: number;
  /** направление полосы/сектора */
  dx: number;
  dz: number;
  /** полоса: длина и ширина; сектор: полный угол в градусах — в w */
  len: number;
  w: number;
  /** шаг появления и шаг удара (метку рисуем от t0 до t1, заполнение по (t − t0)/(t1 − t0)) */
  t0: number;
  t1: number;
  /** 1 — своё (герой бьёт врагов), 0 — враг бьёт героя */
  own: 0 | 1;
  /** откуда летит (плевок: позиция плевуна/босса для дуги) */
  fx: number;
  fz: number;
  /** урон и отброс в момент t1 (0 — только картинка) */
  dmg: number;
  kb: number;
  /** оглушение (своё), шагов */
  stun: number;
  /** оставить лужу после удара: секунды (0 — нет) */
  pud: number;
  /** id врага-источника или −1 */
  src: number;
}

/** Лужа/облако на полу: плевок (−40 %), варенье Бочара, споры грибника (−35 %), лужа босса (урон) */
export interface DgPuddle {
  id: number;
  k: 'spit' | 'jam' | 'spore' | 'boss';
  x: number;
  z: number;
  r: number;
  t0: number;
  t1: number;
  /** замедление героя (доля) */
  slow: number;
  /** урон в секунду герою */
  dps: number;
}

/** Осколок опыта: v — 1 (малый), 5 (кристалл), 25+ (друза) */
export interface DgGem {
  id: number;
  x: number;
  z: number;
  v: number;
  /** летит к герою (подобран магнитом/радиусом) */
  fly: 0 | 1;
}

/** Подбор на полу */
export interface DgItem {
  id: number;
  k: 'stew' | 'magnet' | 'keg' | 'hourglass' | 'chest' | 'bigchest';
  x: number;
  z: number;
  t0: number;
}

/** Шашка героя на полу (ловушка) */
export interface DgTrap {
  id: number;
  x: number;
  z: number;
  /** шаг броска; взведена с шага arm; взрывается сама в шаг end */
  t0: number;
  arm: number;
  end: number;
  dmg: number;
  r: number;
  stun: number;
}

/** Постройка карты */
export interface DgProp {
  id: number;
  /** altar, brazier, chest (проклятый), spring, lamp (фонарь-маяк), cart (вагонетка), keg (пороховая бочка), tramp (гриб-батут), forge */
  k: 'altar' | 'brazier' | 'chest' | 'spring' | 'lamp' | 'cart' | 'keg' | 'tramp' | 'forge';
  x: number;
  z: number;
  /**
   * Состояние: 0 — готова/стоит, 1 — занята/горит/едет/фитиль, 2 — использована/опрокинута/рассыпалась, 3 — нет (место пустует).
   * altar: 0 готов, 2 остывает до t1, 3 место пустует. brazier: 0 стоит, 2 опрокинута (до t1 — потом исчезает → 3).
   * chest: 0 закован, 1 проклятие идёт до t1 (элита curse), 3 нет. spring: 0 — не лечит, 1 — лечит сейчас (v — вода 0…1). lamp: 0 не горит (vx — заряд 0…1, пока стоишь рядом), 1 горит.
   * cart: 0 стоит (готова с шага t1), 1 едет (vx — скорость по x). keg: 0 целая, 1 фитиль до t1, 3 взорвалась.
   * tramp: 0 готов, 2 сжат до t1. forge: 0 готова, 3 погашена до волны v.
   */
  st: number;
  t0: number;
  t1: number;
  /** значение: вода родника 0…1, бафф алтаря (индекс), скорость вагонетки, волна готовности кузни, пачка бочки */
  v: number;
  /** вагонетка: скорость по x, м/с; заряд фонаря 0…1 */
  vx: number;
}

/** Вариант карточки улучшения */
export interface DgCard {
  /** w — оружие, p — пассивка, stew — похлёбка +30 HP, temper — закалка +2 % урона */
  k: 'w' | 'p' | 'stew' | 'temper';
  /** id оружия/пассивки ('' для stew/temper) */
  id: string;
  /** уровень после выбора (1 — новая вещь) */
  lv: number;
}

/** Открытый выбор — мир стоит, пока не выбрана карточка (событие pick) */
export interface DgChoice {
  /** level — новый уровень, forge — кузня (только свои оружия) */
  why: 'level' | 'forge';
  cards: DgCard[];
  /** какой по счёту выбор подряд и сколько ещё ждёт (для «2 из 3») */
  n: number;
  left: number;
}

/** Строка сундука: что выпало */
export interface DgChestRow {
  /** w/p — уровень вещи, evo — эволюция (id эволюции), gold — всё собрано: 50 опыта и +30 HP */
  k: 'w' | 'p' | 'evo' | 'gold';
  id: string;
  lv: number;
}
/** Сундук-барабан на экране: мир стоит, пока клиент не закроет его событием pick (любой i) */
export interface DgChest {
  /** small — элита, big — босс, curse — проклятый */
  kind: 'small' | 'big' | 'curse';
  rows: DgChestRow[];
  t0: number;
}

/** Объявление события волны (стрелка у края, баннер) */
export interface DgAlert {
  /** pack — стая, swarm — налёт, ring — кольцо, elite — элита, horde — Орда, boss — босс, curse — проклятый сундук */
  k: 'pack' | 'swarm' | 'ring' | 'elite' | 'horde' | 'boss' | 'curse';
  /** откуда (для стрелки): точка на карте */
  x: number;
  z: number;
  /** вид врага (элита/босс) */
  mob: string;
  t0: number;
  t1: number;
}

/** Босс: фаза и что делает (сам червь — враг k='povidl' в mobs с тем же id) */
export interface DgBoss {
  id: number;
  /** 1, 2, 3 */
  phase: number;
  /** вариант: 0 — Старый Повидл, 1 — Повидл II, 2 — Близнецы, 3 — Повидл III */
  kind: number;
  /** текущая атака и её шаг: burrow, spit, tail, cavein, summon, roar, pause */
  act: string;
  step: number;
  actT: number;
  /** шаг следующего призыва личинок */
  sumT: number;
  /** номер атаки по кругу */
  rot: number;
  /** ярость (паузы вдвое короче) */
  rage: 0 | 1;
  /** масштаб модели (Близнецы 0,75) */
  scale: number;
}

/** Волна */
export interface DgWave {
  /** номер текущей (или следующей в передышке) волны */
  n: number;
  stage: DgStage;
  /** шаг начала стадии и конец (таймер волны/передышки; 0 — без таймера, бой с боссом) */
  t0: number;
  t1: number;
  /** отряд: всего, ещё не убито (вместе с невышедшими), вышло */
  total: number;
  left: number;
  spawned: number;
  /** босс-волна */
  boss: 0 | 1;
  /** Орда (спавн ×2) */
  horde: 0 | 1;
  /** множители HP и урона врагов волны, доп. HP сверх 300 живых */
  hpMul: number;
  dmgMul: number;
  minAlive: number;
  /** невышедшие по видам (индексы MOB_KINDS) и доля вышедших по графику */
  pend: number[];
  prog: number;
  /** события волны: шаг, тип, вид, число, сделано */
  ev: { at: number; type: string; mob: string; n: number; done: 0 | 1 }[];
  /** смесь бесконечных волн (id) */
  mix: string;
  /** долг: HP невышедших врагов прошлых волн (предел 300 живых, конец таймера) — добавляется новым врагам */
  debt: number;
  /** живых остатков прошлых волн (озверевших) — для HUD «+N с прошлой волны» */
  old: number;
  /** волна кончилась зачисткой (передышка после «Зачистка!»): 1, по таймеру — 0 */
  swept: 0 | 1;
}

/** События шага для эффектов и звука (очищаются в начале каждого шага) */
export type DgFx =
  | { k: 'hit'; id: number; x: number; z: number; n: number; big: 0 | 1; w: string } // попадание, n — урон, w — чем
  | { k: 'die'; id: number; mob: string; x: number; z: number } // смерть врага
  | { k: 'hurt'; n: number; by: string } // герою попали
  | { k: 'lvl'; level: number } // новый уровень (вспышка, отталкивание)
  | { k: 'pick'; what: string; x: number; z: number } // подбор (gem, stew, magnet, keg, hourglass, chest)
  | { k: 'dash'; x: number; z: number; dx: number; dz: number } // рывок
  | { k: 'q'; x: number; z: number; r: number; full: 0 | 1 } // удар фонарём (Q)
  | { k: 'qfull' } // заряд Q полный («дзынь»)
  | { k: 'cone'; x: number; z: number; dx: number; dz: number; r: number; a: number; evo: 0 | 1 } // вспышка Фонаря, a — угол, °
  | { k: 'beam'; x: number; z: number; dx: number; dz: number; len: number; w: number } // Маячный луч
  | { k: 'chain'; pts: number[] } // Искра: x0,z0,x1,z1,… (от героя по целям)
  | { k: 'boom'; x: number; z: number; r: number; what: string } // взрыв (шашка, сталактит, глыба, бочка, бочонок)
  | { k: 'atk'; id: number; what: string } // враг начал атаку (замах): spit, charge, heal, summon, burrow, tail, cavein
  | { k: 'wave'; n: number; what: 'start' | 'clear' } // волна началась / засчитана (таймер кончился или зачистка)
  | { k: 'sweep'; n: number; xp: number } // «Зачистка!»: перебиты все живые до таймера, xp — бонус, дальше передышка 5 с
  | { k: 'rage'; n: number; level: number } // таймер кончился: n живых остались и озверели (до level)
  | { k: 'alert'; a: DgAlert } // объявление события
  | { k: 'phase'; id: number; phase: number } // босс сменил фазу
  | { k: 'prop'; id: number; what: string } // постройка: used, lit, tip, boom, roll, jump, land, curse, fail, forge
  | { k: 'heal'; n: number } // герой вылечился (родник, похлёбка, фартук)
  | { k: 'buff'; id: string } // бафф алтаря
  | { k: 'dead' }; // герой пал

export interface DgStats {
  kills: number;
  bosses: number;
  /** id оружия (или 'q', 'prop') → урон */
  dmg: Record<string, number>;
  killedBy: string;
  /** отбито волн и игровое время конца последней отбитой, мс */
  waves: number;
  ms: number;
  chests: number;
  lamps: number;
}

/** Ввод, накопленный событиями до шага */
export interface DgInput {
  mx: number;
  mz: number;
  q: 0 | 1;
  qPress: 0 | 1;
  dash: 0 | 1;
  use: 0 | 1;
}

export interface DgSim {
  /** версия формата */
  v: 1;
  seed: number;
  /** состояние ГПСЧ */
  rng: number;
  /** номер шага (растёт только когда мир идёт; выбор карточек и сундук его не двигают) */
  t: number;
  nextId: number;
  hero: DgHero;
  weapons: DgWeapon[];
  passives: DgPassive[];
  /** сколько раз взята «Закалка» */
  temper: number;
  mobs: DgMob[];
  bosses: DgBoss[];
  shots: DgShot[];
  marks: DgMark[];
  puddles: DgPuddle[];
  gems: DgGem[];
  items: DgItem[];
  traps: DgTrap[];
  props: DgProp[];
  alerts: DgAlert[];
  wave: DgWave;
  /** открытый выбор карточек (мир стоит) или null */
  choice: DgChoice | null;
  /** сундук-барабан на экране (мир стоит) или null */
  chest: DgChest | null;
  /** ждут выбора (уровни подряд) */
  pendLv: number;
  /** сколько выборов открыто подряд с последнего шага мира (для «2 из 3») */
  chN: number;
  /** перебросы и изгнания в запасе; изгнанные id */
  rerolls: number;
  banishes: number;
  banned: string[];
  /** первый выбор уровня уже был (правило «минимум 2 новых оружия») */
  firstPick: 0 | 1;
  /** готовые к эволюции оружия в порядке готовности */
  evoReady: string[];
  /** песочные часы: враги стоят до шага */
  freezeT: number;
  /** время в бою с боссом (для ярости) — шаг начала боя */
  bossT0: number;
  in: DgInput;
  stats: DgStats;
  /** события шага для эффектов (очищаются в начале шага); noFx — не копить (сервер) */
  fx: DgFx[];
  noFx: boolean;
  /** конец: running — идёт, death — пал */
  end: 'running' | 'death';
}
