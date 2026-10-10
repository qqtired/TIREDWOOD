// «Подземелье»: что отрисовка берёт из симуляции на каждом шаге. Сцена не лезет в поля DgSim напрямую — переходник
// (simview.ts для настоящей симуляции, mock.ts для стенда без неё) раз в шаг 30 Гц собирает DgView, а рисование
// между шагами интерполирует позиции по id. Координаты — тор 240 м (x — восток, z — юг), углы — yaw вокруг Y
// (0 — смотрит на +Z, как модели в GLB).
import type { DgStage } from '../../shared/dungeon/api.ts';
import type { HudBuff, HudCards, HudChest, HudItem } from './hudtypes.ts';

export type MobKind = 'rat' | 'bat' | 'slime' | 'slimelet' | 'shroom' | 'beetle' | 'spitter' | 'larva' | 'barrel' | 'shaman';

/** Что делает враг: ходит, бьёт, особое (плевок, таран, каст, нырок), оглушён */
export const ACT_WALK = 0;
export const ACT_ATTACK = 1;
export const ACT_SPECIAL = 2;
export const ACT_STUN = 3;
/** особое циклом (таран Бочара) */
export const ACT_LOOP = 4;

export interface VEnemy {
  id: number;
  kind: MobKind;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  hpMax: number;
  act: number;
  /** с какого шага идёт act (для фазы разового клипа) */
  actAt: number;
  elite: boolean;
  /** озверение 0…3 (пережил конец волны); дробная часть — вспышка в момент озверения */
  rage?: number;
}

export interface VHero {
  x: number;
  z: number;
  /** высота над полом (прыжок с гриба-батута) */
  y: number;
  /** куда смотрит (рад) */
  yaw: number;
  /** скорость, м/с (для бега/покоя) */
  speed: number;
  hp: number;
  hpMax: number;
  /** идёт рывок */
  dashing: boolean;
  /** неуязвим (мигает) */
  invuln: boolean;
  /** заряд Q 0…1 или −1 */
  qCharge: number;
  dead: boolean;
}

export interface VProj {
  id: number;
  /** ember — уголёк, pick — кирка, spit — плевок, boss_spit, firefly — светляк, rock — сталактит (падает), charge — шашка на полу */
  kind: 'ember' | 'pick' | 'spit' | 'firefly' | 'rock' | 'charge';
  x: number;
  z: number;
  /** высота над полом (дуга плевка) */
  y: number;
  yaw: number;
}

/** Метка на полу до удара: круг, полоса, сектор; t01 — заполнение (1 — сейчас ударит) */
export interface VTele {
  id: number;
  shape: 'circle' | 'strip' | 'sector';
  x: number;
  z: number;
  /** круг и сектор — радиус; полоса — длина */
  r: number;
  /** полоса — ширина; сектор — угол раствора, рад */
  w: number;
  yaw: number;
  t01: number;
  /** jam — сиреневая (плевки), red — опасно (таран, хвост), amber — своё (Q) */
  tone: 'jam' | 'red' | 'amber';
}

export interface VPuddle {
  id: number;
  kind: 'jam' | 'spore';
  x: number;
  z: number;
  r: number;
  /** доля оставшейся жизни 0…1 (тает) */
  life: number;
}

export type PickupKind = 'gem1' | 'gem5' | 'gem25' | 'stew' | 'magnet' | 'keg' | 'hourglass' | 'chest';

export interface VPickup {
  id: number;
  kind: PickupKind;
  x: number;
  z: number;
  /** сундук: нет — выпал из элиты (значок), 'map' — обычный сундук карты, 'isle' — сундук островка (модели) */
  src?: 'map' | 'isle';
}

export type BuildingKind = 'altar' | 'brazier' | 'chest' | 'spring' | 'lamppost' | 'minecart' | 'keg' | 'trampoline' | 'forge';

export interface VBuilding {
  id: number;
  kind: BuildingKind;
  x: number;
  z: number;
  yaw: number;
  /** готовность/состояние 0…1: алтарь — зарядка, родник — вода, сундук — 1 закрыт, жаровня — 1 стоит, фонарь — 1 горит */
  s: number;
  /** держат E: прогресс 0…1 (−1 — нет) */
  use: number;
  /** активна (сундук с цепями, бочка с фитилём …) */
  on: boolean;
}

export interface VBoss {
  /** id червя в симуляции (у Близнецов их два) */
  id: number;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  hpMax: number;
  /** что играть: idle, move, emerge, burrow, slam, spit, roar, death, under (под землёй) */
  anim: 'idle' | 'move' | 'emerge' | 'burrow' | 'slam' | 'spit' | 'roar' | 'death' | 'under';
  /** с какого шага идёт anim */
  animAt: number;
  phase: number;
  name: string;
  /** масштаб модели (Близнецы 0,75) */
  scale: number;
  /** босс в ярости (паузы между атаками короче) */
  rage: boolean;
}

/** События шага для эффектов и звука */
export type VFx =
  /** id = −1 — попали в босса, boss — какого именно (id червя) */
  | { k: 'hit'; id: number; boss?: number; x: number; z: number; dmg: number; big: boolean; blocked?: boolean }
  | { k: 'kill'; id: number; kind: MobKind; x: number; z: number; elite: boolean }
  | { k: 'pick'; kind: PickupKind; x: number; z: number }
  | { k: 'level'; level: number }
  | { k: 'dash'; x: number; z: number; tx: number; tz: number }
  | { k: 'q'; x: number; z: number; r: number; full: boolean }
  | { k: 'hurt'; dmg: number }
  | { k: 'cone'; x: number; z: number; yaw: number; angle: number; range: number; evo: boolean }
  | { k: 'chain'; pts: number[] }
  | { k: 'beam'; x: number; z: number; yaw: number; len: number; w: number }
  | { k: 'boom'; x: number; z: number; r: number; kind: 'rock' | 'charge' | 'keg' | 'boss' | 'spit' }
  | { k: 'shot'; w: 'ember' | 'pick' | 'spark' | 'stalactites' | 'charges' | 'fireflies' }
  | { k: 'elite'; kind: MobKind; name: string; x: number; z: number }
  | { k: 'wave'; wave: number; title: string; sub: string }
  | { k: 'waveWin'; wave: number }
  /** «Зачистка!»: перебиты все до таймера, xp — бонус опыта, дальше передышка */
  | { k: 'sweep'; wave: number; xp: number }
  /** таймер волны кончился: n живых озверели (ступень level) */
  | { k: 'rage'; n: number; level: number }
  | { k: 'event'; title: string }
  | { k: 'boss'; what: 'spawn' | 'roar' | 'burrow' | 'emerge' | 'slam' | 'spit' | 'phase' | 'death'; x: number; z: number }
  | { k: 'spawnFx'; x: number; z: number }
  | { k: 'use'; kind: BuildingKind; x: number; z: number }
  | { k: 'heal'; n: number }
  | { k: 'qfull' }
  | { k: 'atk'; what: string; x: number; z: number }
  | { k: 'death' };

/** Всё, что видно на шаге */
export interface DgView {
  tick: number;
  stage: DgStage;
  wave: number;
  timeLeft: number;
  squadLeft: number;
  squadTotal: number;
  hero: VHero;
  enemies: VEnemy[];
  projectiles: VProj[];
  teles: VTele[];
  puddles: VPuddle[];
  pickups: VPickup[];
  buildings: VBuilding[];
  /** все живые боссы (у Близнецов на 30-й волне — два), пусто — босса нет */
  bosses: VBoss[];
  /** крутящиеся лучи Маяка: из героя, направление yaw */
  rays: { yaw: number; len: number; w: number }[];
  fx: VFx[];
  level: number;
  xp01: number;
  kills: number;
  buffs: HudBuff[];
  weapons: HudItem[];
  passives: HudItem[];
  dash01: number;
  q01: number;
  /** открыт выбор карточек (мир стоит) */
  cards: HudCards | null;
  /** открыт сундук (мир стоит) */
  chest: HudChest | null;
  breather: { left: number; next: number; mobs: { id?: string; icon: string; name: string }[]; event: string } | null;
  /** живых врагов прошлых волн (озверевших) — «+N с прошлых волн» */
  old: number;
  /** передышка после «Зачистки!» */
  swept: boolean;
  /** до готовности рывка и Q, с */
  dashLeft: number;
  qLeft: number;
  alarm: boolean;
  /** отбито волн (для «Выйти (засчитать N волн)») */
  wavesDone: number;
  /** кто одолел героя (имя) */
  killedBy: string;
  chests: number;
}
