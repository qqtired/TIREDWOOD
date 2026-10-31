// Мобы и боссы крепости для страницы lab/fort-rework: какая модель, позы стенда (состояния сервера ZS_* или клипы GLB)
// и вердикт. Позы взяты из того, что модели реально обрабатывают в pose() (client/fort/mobs/*.ts) и из клипов
// осадных GLB (client/assets/fort/approved/PROVENANCE.json).
import type { Pose, StandEntry } from './stand.ts';
import { VERDICTS } from './verdicts.ts';

export type Verdict = 'keep' | 'polish' | 'redo';
export type Group = 'army' | 'sea' | 'boss' | 'siege';

export interface MobCard extends StandEntry {
  name: string;
  role: string;
  group: Group;
  /** кто делал (по истории git) */
  who: 'claude' | 'codex';
  commit: string;
  tris: number;
  verdict: Verdict;
  /** код для выбора (только у «доработать» и «переделать») */
  code?: string;
  /** коротко: что хорошо */
  good: string;
  /** что не так / что сделать */
  todo: string;
  /** подписи особых поз */
  extra?: Record<string, string>;
}

const RED = 0xff6043;
const ORANGE = 0xff8a2a;
const GREEN = 0x5fdc6a;
const LILAC = 0xd6b8ff;
const BLUE = 0x5fe3f0;

/** Обычный ближний бой: стоит, идёт, замах (держит), бьёт по воротам, получил удар, гибель */
function melee(speed: number, over: Record<string, Pose> = {}): Record<string, Pose> {
  return {
    idle: { st: 0, dur: 1.6 },
    walk: { st: 0, speed, dur: 2.6 },
    windup: { st: 1, mode: 'windup', dur: 1.2 },
    attack: { st: 1, mode: 'blow', blow: 0.8, dur: 2.4 },
    hit: { st: 0, mode: 'hit', dur: 2 },
    die: { st: 0, mode: 'die', dur: 1.9 },
    ...over,
  };
}
const CYCLE = ['idle', 'walk', 'windup', 'attack', 'hit', 'die'];
const SHIELD_CYCLE = ['idle', 'walk', 'windup', 'attack', 'hit', 'broken', 'die'];
const BLOATER_NAMES = { windup: 'Надувается', attack: 'Лопается у цели', die: 'Сбит' };

/** Осадные GLB: клипы по названию; dur подставляется по клипу, когда модели загрузились */
function clips(main: { windup: string; attack: string }, extra: string[]): Record<string, Pose> {
  const p: Record<string, Pose> = {
    idle: { st: 0, clip: 'idle', mode: 'loop', dur: 2 },
    walk: { st: 0, clip: 'walk', mode: 'loop', dur: 2.4 },
    windup: { st: 0, clip: main.windup, mode: 'hold', dur: 0 },
    attack: { st: 0, clip: main.attack, mode: 'hold', dur: 0 },
    hit: { st: 0, clip: 'hit', mode: 'hold', dur: 0 },
    die: { st: 0, clip: 'death', mode: 'die', dur: 0 },
  };
  for (const c of extra) p[c] = { st: 0, clip: c, mode: 'hold', dur: 0 };
  return p;
}

export const ANIM_NAMES: Record<string, string> = {
  idle: 'Стоит', walk: 'Идёт', windup: 'Готовит', attack: 'Атакует', hit: 'Удар', die: 'Гибель',
};

// Тексты вердиктов — после просмотра каждого на стенде (31.10).
export const MOBS: MobCard[] = [
  // ---------------------------------------------------------------- армия Барона: обычные
  {
    id: 'walker-mushroom', def: 'walker-mushroom', name: 'Грибник', role: 'Шаркун', group: 'army', who: 'claude', commit: '1026fd3a · 03.10', tris: 1406, height: 1.6,
    poses: melee(2.4), cycle: CYCLE, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'walker-scarecrow', def: 'walker-scarecrow', name: 'Огородное пугало', role: 'Шаркун', group: 'army', who: 'claude', commit: '1026fd3a · 03.10', tris: 1027, height: 1.68,
    poses: melee(2.4), cycle: CYCLE, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'walker-jelly', def: 'walker-jelly', name: 'Желейный зомби', role: 'Шаркун', group: 'army', who: 'claude', commit: '1026fd3a · 03.10', tris: 1258, height: 1.48,
    poses: melee(2.4), cycle: CYCLE, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'runner-hare', def: 'runner-hare', name: 'Заяц-хулиган', role: 'Шустрик', group: 'army', who: 'claude', commit: '3cdb030b · 03.10', tris: 1416, height: 1.3,
    poses: melee(5.4), cycle: CYCLE, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'runner-lizard', def: 'runner-lizard', name: 'Ящерка-бегунок', role: 'Шустрик', group: 'army', who: 'claude', commit: '3cdb030b · 03.10', tris: 1228, height: 1.22,
    poses: melee(5.4), cycle: CYCLE, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'brute-troll', def: 'brute-troll', name: 'Тролль-лесоруб', role: 'Бугай', group: 'army', who: 'claude', commit: '3cdb030b · 03.10', tris: 1499, height: 2.3,
    poses: melee(1.6), cycle: CYCLE, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'brute-bear', def: 'brute-bear', name: 'Медведь в шлеме-кастрюле', role: 'Бугай', group: 'army', who: 'claude', commit: '3cdb030b · 03.10', tris: 1490, height: 2.36,
    poses: melee(1.6), cycle: CYCLE, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'climber-spider', def: 'climber-spider', name: 'Паучок-скалолаз', role: 'Липучка', group: 'army', who: 'claude', commit: '7e3e7bb1 · 03.10', tris: 1481, height: 1.62,
    poses: melee(3.2, { windup: { st: 2, speed: 1.4, dur: 2.4 }, climb: { st: 2, speed: 1.4, dur: 2.4 }, top: { st: 3, speed: 2, dur: 2 }, drop: { st: 4, mode: 'hold', dur: 1.2 } }),
    cycle: CYCLE, extra: { climb: 'Лезет', top: 'На стене', drop: 'Прыжок во двор' }, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'climber-gecko', def: 'climber-gecko', name: 'Геккон-присоска', role: 'Липучка', group: 'army', who: 'claude', commit: '7e3e7bb1 · 03.10', tris: 1460, height: 1.55,
    poses: melee(3.2, { windup: { st: 2, speed: 1.4, dur: 2.4 }, climb: { st: 2, speed: 1.4, dur: 2.4 }, top: { st: 3, speed: 2, dur: 2 }, drop: { st: 4, mode: 'hold', dur: 1.2 } }),
    cycle: CYCLE, extra: { climb: 'Лезет', top: 'На стене', drop: 'Прыжок во двор' }, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'flyer-bat', def: 'flyer-bat', name: 'Летучая мышь', role: 'Крылатка', group: 'army', who: 'claude', commit: '787454f0 · 03.10', tris: 1444, height: 1.35,
    poses: flyer(), cycle: CYCLE, extra: { recover: 'Выход из пике' }, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'flyer-crow', def: 'flyer-crow', name: 'Ворона-разбойница', role: 'Крылатка', group: 'army', who: 'claude', commit: '787454f0 · 03.10', tris: 1452, height: 1.3,
    poses: flyer(), cycle: CYCLE, extra: { recover: 'Выход из пике' }, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'bloater-puffer', def: 'bloater-puffer', was: { def: 'v1:bloater-puffer', poses: melee(1.9, { windup: { st: 1, mode: 'hold', dur: 1.6 } }) }, name: 'Рыба-фуга на ножках', role: 'Пузырь', group: 'army', who: 'claude', commit: '8cef5dbd · 03.10', tris: 1490, height: 1.5,
    poses: bloater(), cycle: CYCLE, extra: BLOATER_NAMES, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'bloater-toad', def: 'bloater-toad', was: { def: 'v1:bloater-toad', poses: melee(1.9, { windup: { st: 1, mode: 'hold', dur: 1.6 } }) }, name: 'Жаба-помидор', role: 'Пузырь', group: 'army', who: 'claude', commit: '8cef5dbd · 03.10', tris: 1510, height: 1.5,
    poses: bloater(), cycle: CYCLE, extra: BLOATER_NAMES, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'shield-turtle', def: 'shield-turtle', was: { def: 'v1:shield-turtle', poses: melee(2.0, shieldPosesV1()), cycle: CYCLE }, name: 'Черепаха-латник', role: 'Щитоносец', group: 'army', who: 'claude', commit: '7afe6da3 · 03.10', tris: 1490, height: 1.62,
    poses: melee(2.0, shieldPoses()), cycle: SHIELD_CYCLE, extra: { broken: 'Щит разбит', bare: 'Бьёт без щита' }, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'shield-beaver', def: 'shield-beaver', was: { def: 'v1:shield-beaver', poses: melee(2.0, shieldPosesV1()), cycle: CYCLE }, name: 'Бобр с дверью', role: 'Щитоносец', group: 'army', who: 'claude', commit: '7afe6da3 · 03.10', tris: 1526, height: 1.6,
    poses: melee(2.0, shieldPoses()), cycle: SHIELD_CYCLE, extra: { broken: 'Щит разбит', bare: 'Бьёт без щита' }, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'spitter-snail', def: 'spitter-snail', name: 'Улитка-плевун', role: 'Плевальщик', group: 'army', who: 'claude', commit: '46afaa8d · 03.10', tris: 1482, height: 1.62,
    poses: melee(2.2, { windup: { st: 13, mode: 'hold', dur: 1.6, ring: [1.6, 0xff4f6a] } }), cycle: CYCLE, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'sapper-beaver', def: 'sapper-beaver', name: 'Бобёр-подрывник', role: 'Подрывник', group: 'army', who: 'claude', commit: '46afaa8d · 03.10', tris: 1465, height: 1.38,
    poses: melee(4.6, { windup: { st: 14, mode: 'hold', dur: 3, ring: [3.5, ORANGE] }, barrel: { st: 30, mode: 'hold', dur: 2 } }),
    cycle: CYCLE, extra: { barrel: 'Бочка' }, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'medic-owl', def: 'medic-owl', was: { def: 'v1:medic-owl', poses: melee(2.0, { windup: { st: 1, mode: 'hold', dur: 1.6, ring: [6, GREEN] } }) }, name: 'Сова-лекарь', role: 'Лекарь', group: 'army', who: 'claude', commit: '46afaa8d · 03.10', tris: 1390, height: 1.58,
    poses: melee(2.0, {
      windup: { st: 0, flags: 64, mode: 'hold', dur: 0.6 },
      attack: { st: 0, flags: 64, flagsFor: 0.5, dur: 1.6, ring: [6, GREEN] },
      slap: { st: 1, mode: 'blow', blow: 0.5, dur: 2 },
    }), cycle: CYCLE, extra: { windup: 'Готовит лечение', attack: 'Лечит', slap: 'Бьёт крылом' }, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'armored-armadillo', def: 'armored-armadillo', name: 'Броненосец в латах', role: 'Чугунок', group: 'army', who: 'claude', commit: '46afaa8d · 03.10', tris: 1448, height: 1.87,
    poses: melee(1.8), cycle: CYCLE, verdict: 'keep', good: '', todo: '',
  },
  // ---------------------------------------------------------------- море
  {
    id: 'sea-boat', def: 'sea-boat', name: 'Шлюпка Барона', role: 'Лодка десанта', group: 'sea', who: 'claude', commit: '464f5f12 · 03.10', tris: 1486, height: 2.55, span: 4,
    poses: {
      idle: { st: 16, dur: 2, stage: 4 }, walk: { st: 16, speed: 4, dur: 2.6, stage: 4 }, windup: { st: 17, mode: 'hold', dur: 2.4, stage: 3 },
      attack: { st: 18, speed: 2, mode: 'hold', dur: 2.4, stage: 0 }, hit: { st: 16, mode: 'hit', dur: 2, stage: 4 }, die: { st: 16, mode: 'die', dur: 1.9, stage: 4 },
    },
    cycle: CYCLE, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'crew-crab', def: 'crew-crab', was: { def: 'v1:crew-crab' }, name: 'Краб-абордажник', role: 'Экипаж лодки', group: 'sea', who: 'claude', commit: '464f5f12 · 03.10', tris: 1289, height: 1.52,
    poses: melee(2.4, { climb: { st: 2, speed: 1.4, dur: 2.4, flags: 8 }, hop: { st: 15, mode: 'hold', dur: 1 } }), cycle: CYCLE, extra: { climb: 'Лезет', hop: 'Прыжок с лодки' }, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'kraken-tentacle', def: 'kraken-tentacle', name: 'Щупальце Кракена', role: 'Супер-босс (часть)', group: 'sea', who: 'claude', commit: '464f5f12 · 03.10', tris: 1987, height: 9,
    poses: {
      idle: { st: 24, dur: 2 }, walk: { st: 24, dur: 2 }, windup: { st: 25, mode: 'hold', dur: 1.5, ring: [2.6, RED] }, attack: { st: 26, mode: 'hold', dur: 2.5, ring: [2.6, BLUE] },
      hit: { st: 24, mode: 'hit', dur: 2 }, die: { st: 24, mode: 'die', dur: 1.9 },
    },
    cycle: ['idle', 'windup', 'attack', 'hit', 'die'], verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'kraken', def: 'kraken', name: 'Кракен', role: 'Супер-босс', group: 'sea', who: 'claude', commit: '464f5f12 · 03.10', tris: 4779, height: 5.2, span: 7,
    poses: {
      idle: { st: 0, dur: 2, lift: 2 }, walk: { st: 0, dur: 2, lift: 2 }, windup: { st: 27, mode: 'hold', dur: 2, lift: 2 }, attack: { st: 28, mode: 'hold', dur: 1.8, lift: 2, ring: [3, 0xff4f9a] },
      hit: { st: 11, mode: 'hit', dur: 2, lift: 2 }, die: { st: 0, mode: 'die', dur: 1.9, lift: 2 }, open: { st: 11, mode: 'hold', dur: 3, lift: 2, ring: [4, BLUE] },
    },
    cycle: ['idle', 'windup', 'attack', 'open', 'hit', 'die'], extra: { open: 'Голова открыта' }, verdict: 'keep', good: '', todo: '',
  },
  // ---------------------------------------------------------------- боссы
  {
    id: 'boss-baron', def: 'boss-baron', name: 'Барон Варенья', role: 'Босс', group: 'boss', who: 'claude', commit: '42e53ad7 · 03.10', tris: 5852, height: 5.5,
    poses: boss(2.5, { windup: { st: 8, mode: 'hold', dur: 1.8, ring: [6, RED] }, attack: { st: 1, mode: 'blow', blow: 0.8, dur: 2.4 },
      bomb: { st: 9, mode: 'hold', dur: 1.8, ring: [3, RED] }, pulse: { st: 10, mode: 'hold', dur: 1.8, ring: [10, RED] }, rage: { st: 0, speed: 3.1, rage: true, dur: 2.6 } }),
    cycle: [...CYCLE.slice(0, 4), 'open', 'hit', 'die'], extra: { bomb: 'Бомба', pulse: 'Волна', open: 'Ядро открыто', rage: 'Ярость' }, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'boss-ram', def: 'boss-ram', name: 'Таран', role: 'Босс', group: 'boss', who: 'claude', commit: '42e53ad7 · 03.10', tris: 5313, height: 4.3,
    poses: boss(2.6, { windup: { st: 19, mode: 'hold', dur: 1.8, ring: [1.8, RED] }, attack: { st: 20, speed: 15, mode: 'hold', dur: 1.2 },
      stomp: { st: 21, mode: 'hold', dur: 1.8, ring: [7, RED] }, howl: { st: 31, mode: 'hold', dur: 1 } }),
    cycle: [...CYCLE.slice(0, 4), 'open', 'hit', 'die'], extra: { stomp: 'Топот', howl: 'Вой', open: 'Ядро открыто' }, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'boss-golem', def: 'boss-golem', name: 'Валун', role: 'Босс', group: 'boss', who: 'claude', commit: '42e53ad7 · 03.10', tris: 5238, height: 6.1,
    poses: boss(1.9, { windup: { st: 22, mode: 'hold', dur: 1.8, ring: [3, RED] }, attack: { st: 1, mode: 'blow', blow: 0.8, dur: 2.4 },
      quake: { st: 23, mode: 'hold', dur: 1.8, ring: [9, RED] } }),
    cycle: [...CYCLE.slice(0, 4), 'open', 'hit', 'die'], extra: { quake: 'Землетрясение', open: 'Ядро открыто' }, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'boss-pumpkin', def: 'boss-pumpkin', name: 'Король-Тыква', role: 'Босс', group: 'boss', who: 'claude', commit: '1ab75eed · 03.10', tris: 5336, height: 4,
    poses: boss(2.0, { windup: { st: 33, mode: 'hold', dur: 1.8, ring: [2.5, RED] }, attack: { st: 34, speed: 9, mode: 'hold', dur: 1.6 },
      summon: { st: 32, mode: 'hold', dur: 1.8, ring: [5, ORANGE] }, spit: { st: 35, mode: 'hold', dur: 1.8, ring: [3, RED] } }),
    cycle: [...CYCLE.slice(0, 4), 'open', 'hit', 'die'], extra: { summon: 'Тыквята', spit: 'Семечки', open: 'Ядро открыто' }, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'boss-weaver', def: 'boss-weaver', name: 'Ткачиха', role: 'Босс', group: 'boss', who: 'claude', commit: '1ab75eed · 03.10', tris: 5128, height: 3.8,
    poses: boss(2.4, { windup: { st: 38, mode: 'hold', dur: 1.8, ring: [4, RED] }, attack: { st: 41, mode: 'hold', dur: 1.8, ring: [3, RED] },
      climb: { st: 36, speed: 1.5, dur: 2.4 }, web: { st: 39, mode: 'hold', dur: 1.8, ring: [3, LILAC] }, brood: { st: 40, mode: 'hold', dur: 1.8, ring: [4, ORANGE] }, over: { st: 42, mode: 'hold', dur: 2 } }),
    cycle: [...CYCLE.slice(0, 4), 'open', 'hit', 'die'], extra: { climb: 'Лезет', web: 'Паутина', brood: 'Кладка', over: 'Через стену', open: 'Ядро открыто' }, verdict: 'keep', good: '', todo: '',
  },
  {
    id: 'boss-leshy', def: 'boss-leshy', was: { def: 'v1:boss-leshy' }, name: 'Леший', role: 'Босс', group: 'boss', who: 'claude', commit: '1ab75eed · 03.10', tris: 4966, height: 6.8,
    poses: boss(1.8, { windup: { st: 44, mode: 'hold', dur: 1.8, ring: [3.2, RED] }, attack: { st: 45, mode: 'hold', dur: 1.8, ring: [8, GREEN] },
      sink: { st: 46, mode: 'hold', dur: 1.5 }, rise: { st: 48, mode: 'hold', dur: 1.5, ring: [3, RED] } }),
    cycle: [...CYCLE.slice(0, 4), 'open', 'hit', 'die'], extra: { attack: 'Лечит армию', sink: 'Под землю', rise: 'Вылезает', open: 'Ядро открыто' }, verdict: 'keep', good: '', todo: '',
  },
  // ---------------------------------------------------------------- осада (GLB, 12.10)
  ...siege(),
];

function flyer(): Record<string, Pose> {
  const lift = 0;
  return {
    idle: { st: 0, dur: 1.6, lift }, walk: { st: 0, speed: 5.2, dur: 2.6, lift },
    windup: { st: 5, mode: 'hold', dur: 1.2, lift, ring: [1.6, RED] }, attack: { st: 6, mode: 'hold', dur: 0.8, ring: [1.6, RED] },
    recover: { st: 7, mode: 'hold', dur: 1, lift }, hit: { st: 0, mode: 'hit', dur: 2, lift }, die: { st: 0, mode: 'die', dur: 1.9, lift },
  };
}

function shieldPosesV1(): Record<string, Pose> {
  const f = 16;
  return {
    idle: { st: 0, dur: 1.6, flags: f }, walk: { st: 0, speed: 2, dur: 2.6, flags: f }, windup: { st: 1, mode: 'windup', dur: 1.2, flags: f },
    attack: { st: 1, mode: 'blow', blow: 0.8, dur: 2.4, flags: f }, hit: { st: 0, mode: 'hit', dur: 2, flags: f }, die: { st: 0, mode: 'die', dur: 1.9, flags: f },
    broken: { st: 0, speed: 2, dur: 2.6 },
  };
}

/** Щитоносцы (М-2): щит разбивают на ходу — признак ZF_SHIELD снимается через 0,5 с позы; без щита бьёт лапами */
function shieldPoses(): Record<string, Pose> {
  return { ...shieldPosesV1(), broken: { st: 0, speed: 2, dur: 3, flags: 16, flagsFor: 0.5 }, bare: { st: 1, mode: 'blow', blow: 0.8, dur: 2.4, flagT: 99 } };
}

/** Пузыри (М-1): у цели 0,6 с надувается на виду, потом хлопок; сбит — хлопок сразу */
function bloater(): Record<string, Pose> {
  return melee(1.9, { windup: { st: 1, mode: 'hold', dur: 0.8 }, attack: { st: 1, mode: 'hold', dur: 2, dieAt: 0.6 } });
}


function boss(speed: number, over: Record<string, Pose>): Record<string, Pose> {
  return {
    idle: { st: 0, dur: 1.8 }, walk: { st: 12, speed, dur: 2.8 }, hit: { st: 0, mode: 'hit', dur: 2 }, die: { st: 0, mode: 'die', dur: 1.9 },
    open: { st: 11, mode: 'hold', dur: 3, ring: [3, BLUE] },
    windup: { st: 0, dur: 1 }, attack: { st: 1, mode: 'blow', dur: 2.4 },
    ...over,
  };
}

/** Походка осадного GLB на стенде — со скоростью моба в игре (клип идёт по пути, полосы дорожки едут) */
function walkAt(p: Record<string, Pose>, speed: number, also: string[] = []): Record<string, Pose> {
  p.walk = { ...p.walk, speed };
  for (const k of also) p[k] = { st: 0, clip: k, mode: 'loop', dur: 2.4, speed };
  return p;
}

function siege(): MobCard[] {
  const base = { group: 'siege' as const, who: 'codex' as const, commit: '69f2d650 · 12.10', verdict: 'polish' as Verdict, good: '', todo: '', cycle: CYCLE };
  return [
    // М-6…М-12 (31.10): «Стало» — r4-01, шаг по пути как в игре (полосы дорожки едут со скоростью моба); «Было» — v1
    { ...base, id: 'ropecrab', glb: 20, name: 'Канатник', role: 'Осада: канат на стену', tris: 3922, height: 1.25,
      was: { glbV1: true, poses: walkAt(clips({ windup: 'route_attach', attack: 'attack' }, ['open', 'recover']), 3.6) },
      poses: walkAt(clips({ windup: 'windup', attack: 'attack' }, ['route_attach', 'reel', 'open']), 3.6), extra: { route_attach: 'Бросает крюк', reel: 'Тянет канат', open: 'Стопор сорван', recover: 'Возвращается' } },
    { ...base, id: 'jampump', glb: 21, name: 'Смоливщик', role: 'Осада: лужа смолы', tris: 4058, height: 1.75,
      was: { glbV1: true, poses: walkAt(clips({ windup: 'windup', attack: 'attack' }, ['pump', 'open']), 2.8) },
      poses: walkAt(clips({ windup: 'windup', attack: 'attack' }, ['open']), 2.8), extra: { pump: 'Струя', open: 'Сопло открыто' } },
    { ...base, id: 'canopy', glb: 22, name: 'Зонтиковик', role: 'Осада: навес над соседями', tris: 3568, height: 1.84,
      was: { glbV1: true, poses: walkAt(clips({ windup: 'windup', attack: 'attack' }, ['canopy_break', 'cover_disabled']), 2.6) },
      poses: walkAt(clips({ windup: 'windup', attack: 'attack' }, ['canopy_break', 'walk_folded']), 2.6, ['walk_folded']), extra: { canopy_break: 'Навес сложен', cover_disabled: 'Без навеса', walk_folded: 'Идёт без навеса' } },
    { ...base, id: 'foreman', glb: 23, name: 'Старшина осады', role: 'Осада: распорка', tris: 4150, height: 1.96,
      was: { glbV1: true, poses: walkAt(clips({ windup: 'windup', attack: 'attack' }, ['device_set', 'open']), 2.8) },
      poses: walkAt(clips({ windup: 'windup', attack: 'attack' }, ['device_set', 'open']), 2.8), extra: { device_set: 'Ставит распорку', open: 'Замок открыт' } },
    { ...base, id: 'spring', glb: 28, name: 'Гриб-пружинка', role: 'Осада: трамплин на стену', tris: 3152, height: 1.36,
      was: { glbV1: true, poses: walkAt(clips({ windup: 'windup', attack: 'attack' }, ['deploy', 'spent']), 3.6) },
      poses: walkAt(clips({ windup: 'deploy', attack: 'attack' }, ['open']), 3.6), extra: { deploy: 'Встаёт', spent: 'Смят', open: 'Смят' } },
    { ...base, id: 'siegetower', glb: 26, name: 'Осадная башня', role: 'Осада: мост на стену', tris: 5312, height: 5.44,
      was: { glbV1: true, poses: walkAt(clips({ windup: 'deploy', attack: 'attack' }, ['open', 'spent']), 2.1) },
      poses: walkAt(clips({ windup: 'deploy', attack: 'attack' }, []), 2.1), extra: { open: 'Крепление открыто', spent: 'Мост сорван' } },
    { ...base, id: 'battery', glb: 27, name: 'Полевая батарея', role: 'Осада: залп по воротам', tris: 5732, height: 1.35, span: 3.4,
      poses: clips({ windup: 'windup', attack: 'attack' }, ['deploy', 'open', 'spent']), extra: { deploy: 'Разворачивается', open: 'Замок открыт', spent: 'Сорвано' } },
    { ...base, id: 'crabcrane', glb: 24, name: 'Краб-Кран', role: 'Босс осады', tris: 6552, height: 3.48, span: 5,
      poses: clips({ windup: 'hook_windup', attack: 'hook_swing' }, ['anchor_set', 'open', 'rage', 'spawn']), extra: { anchor_set: 'Опоры', open: 'Опора открыта', rage: 'Ярость', spawn: 'Появление' } },
    { ...base, id: 'miller', glb: 25, name: 'Мельничиха', role: 'Босс осады', tris: 5538, height: 4.2,
      was: { glbV1: true, poses: walkAt(clips({ windup: 'crank', attack: 'gust' }, ['jammed', 'open', 'rage', 'spawn']), 1.9) },
      poses: walkAt(clips({ windup: 'crank', attack: 'gust' }, ['deploy', 'open', 'spawn']), 1.9), extra: { deploy: 'Становится в упор', jammed: 'Муфта заклинила', open: 'Муфта заклинила', rage: 'Ярость', spawn: 'Появление' } },
  ];
}

for (const m of MOBS) {
  const v = VERDICTS[m.id];
  if (!v) continue;
  m.verdict = v[0] as Verdict;
  m.code = v[1] || undefined;
  m.good = v[2];
  m.todo = v[3];
}
