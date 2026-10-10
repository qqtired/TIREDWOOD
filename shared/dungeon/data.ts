// «Подземелье»: числа режима. Источник — docs/survivors/design-data.json и level-data.json, перегоняются в
// gen-design.ts / gen-level.ts скриптом tools/survivors/gen-data.mjs (один и тот же .ts в node и в Vite).
// Здесь — типы нужных симуляции частей и удобные выборки. Чисел руками не пишем, кроме запасных значений
// для полей, которых в данных может не быть.
import { DESIGN_RAW } from './gen-design.ts';
import { LEVEL_RAW } from './gen-level.ts';

export type WeaponId = 'lantern' | 'embers' | 'pickaxe' | 'fireflies' | 'spark' | 'stalactites' | 'charges' | 'beam';
export type PassiveId = 'might' | 'cooldown' | 'area' | 'amount' | 'maxhp' | 'armor' | 'speed' | 'magnet';
export type MobKind =
  | 'rat' | 'bat' | 'slime' | 'slimelet' | 'shroom' | 'beetle' | 'spitter' | 'larva' | 'barrel' | 'shaman' | 'povidl';

/** Уровень оружия: все поля необязательные — у каждого вида свои */
export interface WeaponLevel {
  lv: number; dmg: number; cd?: number; angle?: number; range?: number; n?: number; pierce?: number; speed?: number;
  size?: number; radius?: number; spin?: number; on?: number; off?: number; jumps?: number; chains?: number;
  jumpRange?: number; warn?: number; maxOnFloor?: number; arm?: number; fuse?: number; stun?: number;
  length?: number; width?: number; up?: string;
}
export interface WeaponDef {
  id: WeaponId; name: string; kind: string; icon: string; desc: string; levels: WeaponLevel[];
  rehit?: number; falloff?: number;
}
export interface EvoDef {
  id: string; from: WeaponId; with: PassiveId; name: string; icon: string; desc: string;
  stats: {
    dmg: number; cd?: number; angle?: number; range?: number; cones?: number; burn?: number; n?: number; radius?: number;
    boulder?: { every: number; dmg: number; radius: number; warn: number; stun: number };
    beams?: number; period?: number; length?: number; width?: number; rings?: number[]; healEveryHits?: number;
  };
}
export interface PassiveDef {
  id: PassiveId; name: string; icon: string; max: number; per: number; text: string; dashCd?: number; xp?: number;
}
export interface MobDef {
  id: MobKind; name: string; short: string; tier: string; hp: number; speed: number; dmg: number; xp: number; radius: number;
  dashSpeed?: number; flying?: boolean; knockbackResist?: number; turnRate?: number;
  splitInto?: { id: MobKind; n: number };
  deathCloud?: { radius: number; time: number; slow: number };
  shield?: { arc: number; mul: number };
  spit?: { every: number; windup: number; warn: number; radius: number; puddle: number; slow: number };
  charge?: { every: number; warn: number; laneWidth: number; laneLength: number; speed: number; stunWall: number; recover: number; vulnMul: number };
  heal?: { every: number; warn: number; radius: number; frac: number };
  summon?: { every: number; warn: number; mob: MobKind; n: number };
  interrupt?: number;
}
export interface WaveEventDef { at: number; type: 'pack' | 'swarm' | 'ring' | 'elite' | 'horde' | 'boss'; mob: MobKind | null; n: number; text: string }
export interface WaveDef {
  w: number; dur: number; hpMul: number; dmgMul: number; minAlive: number; interval: number;
  mobs: Partial<Record<MobKind, number>>; elites: Partial<Record<MobKind, number>>; events: WaveEventDef[]; boss?: string;
}
export interface BossAttack { id: string; dmg: number; radius: number; n?: number; knockback?: number; puddle?: { time: number; slow: number; dps: number } }
export interface BossPhase { n: number; hpFrom: number; hpTo: number; attacks: BossAttack[]; summons: { mob: MobKind; every: number; n: number }; pause: number; speedMul?: number }
export interface BossDef {
  id: string; name: string; hp: number; contactDmg: number; speed: number; xp: number; enrageAt: number; phases: BossPhase[]; endlessGrowth: number;
}
export interface EndlessDef {
  hpMul: number; dmgPerWave: number; countGrowth: number; durations: { from: number; dur: number }[];
  minAlivePerWave: number; minAliveCap: number; maxAlive: number; mixes: { id: string; name: string; share: Partial<Record<MobKind, number>> }[];
  step11: number; bodyCap: { upTo20: number; after: number };
}
// eslint-free простые типы построек: берём как есть, недостающее — запасными значениями в props.ts
export interface Interactable { id: string; [k: string]: unknown }

export interface DesignData {
  hero: {
    hp: number; speed: number; pickupRadius: number; magnetPullSpeed: number; hitInvuln: number; contactHitCooldown: number;
    minDamageTaken: number; levelUpFlash: { heal: number; pushRadius: number; pushDist: number }; startWeapon: WeaponId;
    slots: { weapons: number; passives: number };
  };
  actives: {
    dash: { distance: number; time: number; invuln: number; cooldown: number; pitJump?: number };
    strike: {
      chargeTime: number; tap: { holdBelow: number; damage: number; radius: number; knockback: number };
      full: { damage: number; radius: number; knockback: number; stun: number }; chargeMoveMul: number; cooldown: number; levelScale: number;
    };
  };
  weapons: WeaponDef[];
  evolutions: EvoDef[];
  passives: PassiveDef[];
  xp: { base: number; perLevel: number; gems: { id: string; xp: number }[]; mergeOver: number };
  levelUp: {
    cards: number; rerolls: number; banishes: number; perBoss: { rerolls: number; banishes: number };
    weights: { ownedUpgrade: number; newWeapon: number; newPassive: number }; temper: { dmg: number; max: number };
    pickInvuln?: number;
  };
  mobs: MobDef[];
  mobRules: { maxAlive: number; spawnAheadShare: number };
  waves: WaveDef[];
  waveRules: { breather: number };
  boss: BossDef;
  endless: EndlessDef;
  interactables: Interactable[];
  terrain?: { jam?: { heroSlow: number }; water?: { slowAll: number } };
}

export interface Circle { t: 'c'; x: number; z: number; r: number; kind: string }
export interface Capsule { t: 's'; x0: number; z0: number; x1: number; z1: number; r: number; kind: string }
export type Shape = Circle | Capsule;
export interface Spot { id?: string; x: number; z: number; zone?: string; count?: number }
export interface LevelData {
  map: { L: number; heroSpawn: { x: number; z: number } };
  spawnRing: { inner: number; outer: number; aheadConeDeg: number; recycleDistance: number; retries: number };
  camera: { groundCornersFromHero: { topLeft: number[]; topRight: number[]; bottomLeft: number[]; bottomRight: number[] } };
  hazards: Shape[];
  obstacles: Shape[];
  buildings: { altar: Spot[]; spring: Spot[]; cursedChest: Spot[]; brazier: Spot[] };
  proposals: {
    lantern: Spot[]; minecart: { rails: number[][]; station: { x: number; z: number }; carts: number };
    powderKegs: Spot[]; mushroomTrampoline: Spot[]; forge: Spot[];
  };
}

export const D = DESIGN_RAW as unknown as DesignData;
export const LV = LEVEL_RAW as unknown as LevelData;

export const WEAPON_IDS: WeaponId[] = D.weapons.map((w) => w.id);
export const PASSIVE_IDS: PassiveId[] = D.passives.map((p) => p.id);

const weaponById = new Map<string, WeaponDef>(D.weapons.map((w) => [w.id, w]));
const passiveById = new Map<string, PassiveDef>(D.passives.map((p) => [p.id, p]));
const mobById = new Map<string, MobDef>(D.mobs.map((m) => [m.id, m]));
const evoById = new Map<string, EvoDef>(D.evolutions.map((e) => [e.id, e]));

export function weaponDef(id: string): WeaponDef {
  const w = weaponById.get(id);
  if (!w) throw new Error('dungeon: нет оружия ' + id);
  return w;
}
export function passiveDef(id: string): PassiveDef {
  const p = passiveById.get(id);
  if (!p) throw new Error('dungeon: нет пассивки ' + id);
  return p;
}
export function mobDef(id: string): MobDef {
  const m = mobById.get(id);
  if (!m) throw new Error('dungeon: нет врага ' + id);
  return m;
}
export function evoDef(id: string): EvoDef {
  const e = evoById.get(id);
  if (!e) throw new Error('dungeon: нет эволюции ' + id);
  return e;
}
/** Эволюция оружия (если есть в данных) */
export function evoOf(weapon: string): EvoDef | null {
  for (const e of D.evolutions) if (e.from === weapon) return e;
  return null;
}
/** Постройка из interactables по id */
export function inter(id: string): Interactable | null {
  for (const it of D.interactables) if (it.id === id) return it;
  return null;
}
/** Число из постройки или запасное */
export function interNum(id: string, key: string, def: number): number {
  const it = inter(id);
  const v = it ? it[key] : undefined;
  return typeof v === 'number' ? v : def;
}

/** Порядок видов врагов — для счётчиков отряда (индексы массивов) */
export const MOB_KINDS: MobKind[] = ['rat', 'bat', 'slime', 'slimelet', 'shroom', 'beetle', 'spitter', 'larva', 'barrel', 'shaman', 'povidl'];
export function mobIndex(k: MobKind): number {
  return MOB_KINDS.indexOf(k);
}
