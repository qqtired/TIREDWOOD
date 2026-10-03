// «Выше облаков» — Небесная каланча: пожарная каланча над облаками, путь в три витка вокруг неё (против часовой
// стрелки, если смотреть сверху) с вылазками наружу. Всё, что сталкивается, — прямоугольные боксы, как во всей игре:
// люльки мельницы остаются горизонтальными и едут по кругу, карусель — неподвижный «круг» из боксов, который
// поворачивает того, кто на нём стоит. Под каждым участком на 6 м вниз пусто — падение возвращает на точку.
import type { GameMap, MapBox, Vec3 } from './maps/types.ts';
import type { LineSchedule } from './skilltraps.ts';
import { RAM_PERIOD } from './skilltraps.ts';

/** Облака: следующее тает и возвращается на столько тиков позже предыдущего */
export const SKILL_CLOUD_STEP = 54;
/** Толщина ступени колокольни (бокс от верха вниз), м */
export const SKILL_STEP_THICK = 0.45;

/** Как выглядит бокс (картинка) — физике всё равно. */
export type SkillLook =
  | 'tower' | 'belfry' | 'post' | 'housing' | 'start' | 'roof' | 'deck' | 'plank' | 'pocket' | 'block' | 'stair'
  | 'cp' | 'pier' | 'mushroom' | 'gondola' | 'cart' | 'basket' | 'cloud' | 'disc' | 'step';

export interface SkillRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Верх */
  y: number;
}

export interface SkillPad {
  box: number;
  look: SkillLook;
  sec: number;
  /** Номер точки, если это площадка с флагом */
  cp?: number;
  /** Гриб: скорость отскока, м/с */
  bounce?: number;
}

/** Подвижная площадка: по отрезку (тележка, корзина шара) или по кругу (люлька мельницы). */
export interface SkillMover {
  box: number;
  look: SkillLook;
  sec: number;
  kind: 'line' | 'orbit';
  /** Размер: по x, по z, толщина */
  w: number;
  d: number;
  h: number;
  /** line: середина верха в начале хода; orbit: ось колеса (середина верха люльки — ось + смещение по кругу) */
  x: number;
  y: number;
  z: number;
  /** line: весь ход */
  dx: number;
  dy: number;
  dz: number;
  sched: LineSchedule;
  /** orbit: радиус, оборот (тики), сдвиг фазы (тики) */
  r: number;
  period: number;
  phase: number;
  /** Подбрасывает (тележка-батут), м/с */
  bounce?: number;
}

export interface SkillCloud {
  box: number;
  sec: number;
  phase: number;
  rect: SkillRect;
}

/** Ступень колокольни: s — где на пути лестницы (м), обвал идёт по s снизу вверх. */
export interface SkillStep {
  box: number;
  s: number;
  corner: boolean;
  rect: SkillRect;
}

export interface SkillDisc {
  cx: number;
  cz: number;
  top: number;
  r: number;
  /** Оборот, тики; угол растёт от +x к +z */
  period: number;
  boxes: number[];
}

/** Мешок-маятник: качается вдоль оси axis (туда и сбивает). */
export interface SkillSack {
  px: number;
  py: number;
  pz: number;
  len: number;
  amp: number;
  period: number;
  phase: number;
  axis: 'x' | 'z';
  r: number;
  sec: number;
}

/** Таран из стены: лицо корпуса (fx, fz), куда бьёт (dx, dz), ширина поперёк, высота, ход. */
export interface SkillRam {
  fx: number;
  fz: number;
  dx: number;
  dz: number;
  w: number;
  y0: number;
  y1: number;
  stroke: number;
  phase: number;
  sec: number;
}

/** Перекладина карусели: через ось, крутится навстречу диску. */
export interface SkillBar {
  y0: number;
  y1: number;
  /** Длина плеча от оси */
  len: number;
  r: number;
  period: number;
  dir: 1 | -1;
}

/** Столбик на диске карусели: радиус и угол на диске, толщина, высота. */
export interface SkillBumper {
  r0: number;
  a0: number;
  rad: number;
  y0: number;
  y1: number;
}

export interface SkillBox {
  x0: number; x1: number; y0: number; y1: number; z0: number; z1: number;
}

export interface SkillWind extends SkillBox {
  /** Куда дует (единичный вектор по земле) */
  dx: number;
  dz: number;
  phase: number;
  sec: number;
}

export interface SkillUpdraft {
  x: number;
  z: number;
  r: number;
  y0: number;
  /** Выше поток слабеет и на y1 + 1,5 сходит на нет */
  y1: number;
  vmax: number;
}

export interface SkillCheckpoint extends SkillRect {
  /** Куда ставить и куда смотреть */
  px: number;
  pz: number;
  yaw: number;
  /** Ниже — падение, возврат на эту точку */
  kill: number;
  sec: number;
}

/** Куда переход: прямоугольник, подвижная площадка (любая из; at — встать в этой точке от её середины), карусель, колокол. */
export type SkillTarget = SkillRect | { movers: number[]; at?: [number, number] } | { disc: true } | { bell: true };

/** Переход пути: test/skill-reach.test.ts проверяет его настоящей физикой (свободный бег, прыжок без рывка). */
export interface SkillLink {
  name: string;
  /** Откуда: точка на верхней грани (или на подвижной площадке from в момент старта) */
  x: number;
  z: number;
  y: number;
  from?: number;
  to: SkillTarget;
  how: 'walk' | 'jump' | 'bounce' | 'lift' | 'ride';
  /** С каких тиков пробовать (подвижное) */
  at?: number[];
  /** Сначала — сюда (гриб, восходящий поток), потом — к цели */
  via?: [number, number];
  /** Другой путь (не основной маршрут) */
  alt?: true;
  /** Без остановки: сразу с того места, куда пришёл прошлым переходом (облака, ступени) */
  flow?: true;
}

export interface SkillMap extends GameMap {
  pads: SkillPad[];
  movers: SkillMover[];
  clouds: SkillCloud[];
  steps: SkillStep[];
  disc: SkillDisc;
  sacks: SkillSack[];
  rams: SkillRam[];
  bar: SkillBar;
  bumpers: SkillBumper[];
  winds: SkillWind[];
  shelters: SkillBox[];
  updrafts: SkillUpdraft[];
  checkpoints: SkillCheckpoint[];
  bell: SkillBox;
  /** Галерея под колоколом */
  gallery: SkillRect;
  /** Крыша-старт: сошёл с неё — пошло время своего подъёма */
  start: SkillRect;
  slots: { x: number; y: number; z: number; yaw: number }[];
  links: SkillLink[];
  /** Длина пути лестницы, м */
  stairLength: number;
}

const EAST = -Math.PI / 2;
const NORTH = 0;
const WEST = Math.PI / 2;
const SOUTH = Math.PI;

export const SKILL_TOWER = { half: 6, top: 47, belfry: 4, gallery: 65 } as const;

export function makeSkillMap(): SkillMap {
  const boxes: MapBox[] = [];
  const pads: SkillPad[] = [];
  const movers: SkillMover[] = [];
  const clouds: SkillCloud[] = [];
  const steps: SkillStep[] = [];
  const checkpoints: SkillCheckpoint[] = [];
  const links: SkillLink[] = [];

  const box = (min: Vec3, max: Vec3): number => {
    boxes.push({ min, max, mat: 'deck', color: 0xffffff });
    return boxes.length - 1;
  };
  const R = (x0: number, x1: number, z0: number, z1: number, y: number): SkillRect => ({ x0, x1, z0, z1, y });
  /** Площадка: верх r.y, толщина h */
  const pad = (r: SkillRect, look: SkillLook, sec: number, h = 0.8, extra: Partial<SkillPad> = {}): SkillRect => {
    pads.push({ box: box([r.x0, r.y - h, r.z0], [r.x1, r.y, r.z1]), look, sec, ...extra });
    return r;
  };
  const solid = (min: Vec3, max: Vec3, look: SkillLook, sec: number): void => {
    pads.push({ box: box(min, max), look, sec });
  };
  const cp = (r: SkillRect, sec: number, px: number, pz: number, yaw: number, kill: number, look: SkillLook = 'cp'): SkillRect => {
    pad(r, look, sec, 0.8, { cp: checkpoints.length });
    checkpoints.push({ ...r, px, pz, yaw, kill, sec });
    return r;
  };
  const link = (name: string, at: [number, number, number], to: SkillTarget, how: SkillLink['how'], ticks?: number[], from?: number, via?: [number, number], flow?: true): void => {
    links.push({ name, x: at[0], z: at[2], y: at[1], to, how, ...(ticks ? { at: ticks } : {}), ...(from !== undefined ? { from } : {}), ...(via ? { via } : {}), ...(flow ? { flow } : {}) });
  };
  const line = (look: SkillLook, sec: number, w: number, d: number, h: number, at: Vec3, by: Vec3, sched: LineSchedule, bounce?: number): number => {
    movers.push({
      box: box([at[0] - w / 2, at[1] - h, at[2] - d / 2], [at[0] + w / 2, at[1], at[2] + d / 2]), look, sec, kind: 'line', w, d, h,
      x: at[0], y: at[1], z: at[2], dx: by[0], dy: by[1], dz: by[2], sched, r: 0, period: 0, phase: 0, ...(bounce ? { bounce } : {}),
    });
    return movers.length - 1;
  };

  // ---------------------------------------------------------------- каланча
  // Низ 12×12 до террасы на +47 (терраса ловит сорвавшихся со ступеней), колокольня 8×8 до галереи на +65.
  solid([-6, -30, -6], [6, 47, 6], 'tower', 9);
  solid([-4, 47, -4], [4, 65, 4], 'belfry', 9);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) solid([sx * 3.6 - 0.2, 65, sz * 3.6 - 0.2], [sx * 3.6 + 0.2, 69.6, sz * 3.6 + 0.2], 'post', 9);

  // ---------------------------------------------------------------- 1. крыша депо (юг, на восток): 0 → 3
  const start = cp(R(-17, -7, 6.5, 17.5, 0), 0, -12, 12, EAST, -5, 'start');
  const isA = pad(R(-4.5, -0.5, 8.5, 13.5, 0), 'roof', 0, 1.2);
  const isB = pad(R(2.5, 6, 9, 13, 0.5), 'roof', 0, 1.2);
  const isC = pad(R(9.5, 13, 8.5, 13.5, 1), 'roof', 0, 1.2);
  pad(R(9.5, 13, 7.9, 8.5, 1.5), 'stair', 0, 0.6);
  pad(R(9.5, 13, 7.3, 7.9, 2.0), 'stair', 0, 0.6);
  pad(R(9.5, 13, 6.7, 7.3, 2.5), 'stair', 0, 0.6);
  // гриб-малыш на острове В: жёлтое подбрасывает — можно сразу на площадку с флагом
  pad(R(11.4, 12.8, 9.4, 10.8, 1.25), 'mushroom', 0, 0.25, { bounce: 12 });
  const cp1 = cp(R(8, 15, 1.9, 6.7, 3), 1, 11.5, 4.3, NORTH, -3);
  link('1: крыша → остров А', [-9, 0, 11], isA, 'jump');
  link('1: остров А → Б (+0,5)', [-2.5, 0, 11], isB, 'jump');
  link('1: остров Б → В (+0,5)', [4, 0.5, 11], isC, 'jump');
  link('1: лесенка на флаг 1', [10.5, 1, 9.5], cp1, 'walk');
  link('1: гриб-малыш на флаг 1', [12.1, 1, 12.6], cp1, 'bounce');
  links[links.length - 1].alt = true;

  // ---------------------------------------------------------------- 2. мельница (восток, на север): 3 → 10
  // Колесо в плоскости x–y: люльки 2,6×2,6 по кругу R 5,5 вокруг (14,5; 8,5), оборот 12 с. Внизу едут к каланче и вверх.
  const gondolas = [0, 1, 2, 3].map((i) => movers.length + i);
  for (let i = 0; i < 4; i++) {
    movers.push({
      box: box([0, 0, 0], [0, 0, 0]), look: 'gondola', sec: 1, kind: 'orbit', w: 2.6, d: 2.6, h: 0.5,
      x: 14.5, y: 8.5, z: 0, dx: 0, dy: 0, dz: 0, sched: { rest: 0, go: 1, stay: 0, back: 1, phase: 0 },
      r: 5.5, period: 720, phase: i * 180,
    });
  }
  const cp2 = cp(R(7, 13.5, -12, -1.9, 10), 2, 10, -8, WEST, 4);
  link('2: шаг в люльку внизу', [14.5, 3, 2.6], { movers: gondolas }, 'walk', [700, 710, 0, 10, 20]);
  link('2: из люльки на флаг 2', [0, 0, 0], cp2, 'walk', [215, 240, 270], 0);

  // ---------------------------------------------------------------- 3. маятники (север, на запад): 10 → 11,5
  pad(R(3, 7, -12.3, -10.7, 10), 'plank', 2, 0.5);
  const k1 = pad(R(0, 3, -13.1, -9.9, 10.5), 'pocket', 2, 0.6);
  pad(R(-4, 0, -12.3, -10.7, 10.5), 'plank', 2, 0.5);
  const k2 = pad(R(-7, -4, -13.1, -9.9, 11), 'pocket', 2, 0.6);
  pad(R(-11, -7, -12.3, -10.7, 11), 'plank', 2, 0.5);
  const sacks: SkillSack[] = [
    { px: 5, py: 17.2, pz: -11.5, len: 6, amp: 0.87, period: 216, phase: 0, axis: 'z', r: 0.85, sec: 2 },
    { px: -2, py: 17.7, pz: -11.5, len: 6, amp: 0.87, period: 216, phase: 72, axis: 'z', r: 0.85, sec: 2 },
    { px: -9, py: 18.2, pz: -11.5, len: 6, amp: 0.87, period: 216, phase: 144, axis: 'z', r: 0.85, sec: 2 },
  ];
  const cp3 = cp(R(-16, -11, -14, -8, 11.5), 3, -13.5, -11, SOUTH, 5.5);
  // от кармана к карману под одним мешком; на досках не постоишь — там проходит мешок
  link('3: флаг 2 → карман 1 (под мешком 1)', [8, 10, -11.5], k1, 'walk');
  link('3: карман 1 → карман 2 (под мешком 2)', [1.5, 10.5, -11.5], k2, 'walk');
  link('3: карман 2 → флаг 3 (под мешком 3)', [-5.5, 11, -11.5], cp3, 'walk');

  // ---------------------------------------------------------------- 4. поршни (запад, на юг): 11,5 → 17
  // Ступени-блоки +1 м; тараны бьют поперёк блока на всю ширину. Первый и третий бьют вместе, второй и четвёртый —
  // через полпериода: кто прошёл первый сразу после удара, проходит второй на его замахе.
  const blocks: SkillRect[] = [];
  const rams: SkillRam[] = [];
  for (let i = 0; i < 4; i++) {
    const zc = -5 + i * 4, top = 12.5 + i;
    blocks.push(pad(R(-14.5, -8.5, zc - 2, zc + 2, top), 'block', 3, 1.4));
    solid([-8.5, top - 1.4, zc - 1.25], [-6, top + 2.3, zc + 1.25], 'housing', 3);
    rams.push({ fx: -8.5, fz: zc, dx: -1, dz: 0, w: 2, y0: top + 0.25, y1: top + 1.45, stroke: 6, phase: i % 2 ? RAM_PERIOD / 2 : 0, sec: 3 });
  }
  pad(R(-14.5, -8.5, 9, 9.6, 16), 'stair', 3, 0.6);
  pad(R(-14.5, -8.5, 9.6, 10.2, 16.5), 'stair', 3, 0.6);
  const cp4 = cp(R(-16, -8, 10.2, 15, 17), 4, -12, 12.6, EAST, 11);
  // ждать можно только у краёв блока (полоса тарана — середина, 2 м)
  link('4: флаг 3 → блок 1 (+1)', [-12.5, 11.5, -9], blocks[0], 'jump');
  for (let i = 0; i < 3; i++) link(`4: блок ${i + 1} → ${i + 2} (+1)`, [-12.5, 12.5 + i, -3.45 + i * 4], blocks[i + 1], 'jump');
  link('4: блок 4 → флаг 4 по ступеням', [-11.5, 15.5, 8.55], cp4, 'walk');

  // ---------------------------------------------------------------- 5. облака (юг, на восток): 17 → 21,5
  // Восемь облаков зигзагом; каждое следующее тает и возвращается на CLOUD_STEP тиков позже предыдущего: кто
  // прыгает за волной в её темпе — успевает, кто медлит — тонет. Вперёд волны не убежишь: облака впереди ещё нет.
  for (let k = 0; k < 8; k++) {
    const x = -4.8 + k * 3, z = k % 2 === 0 ? 14.6 : 10.6, y = [17.5, 17.8, 18.3, 18.8, 19.3, 19.8, 20.3, 20.8][k];
    const rect = R(x - 1.4, x + 1.4, z - 1.4, z + 1.4, y);
    clouds.push({ box: box([rect.x0, y - 0.7, rect.z0], [rect.x1, y, rect.z1]), sec: 4, phase: k * SKILL_CLOUD_STEP, rect });
  }
  sacks.push({ px: 15.5, py: 28.6, pz: 8.1, len: 6, amp: 0.87, period: 216, phase: 40, axis: 'x', r: 0.85, sec: 4 });
  const cp5 = cp(R(9, 16, 2, 7, 21.5), 5, 12.5, 4.5, NORTH, 15.5);
  link('5: флаг 4 → облако 1', [-9, 17, 14.6], clouds[0].rect, 'jump', [10]);
  for (let k = 0; k < 7; k++) {
    const a = clouds[k].rect;
    link(`5: облако ${k + 1} → ${k + 2}`, [(a.x0 + a.x1) / 2, a.y, (a.z0 + a.z1) / 2], clouds[k + 1].rect, 'jump', [SKILL_CLOUD_STEP * (k + 1) + 10], undefined, undefined, true);
  }
  link('5: облако 8 → флаг 5', [16.2, 20.8, 10.6], cp5, 'jump', [SKILL_CLOUD_STEP * 8 + 20]);

  // ---------------------------------------------------------------- 6. ветер (восток, на север): 21,5 → 30
  // Порывы с открытого неба — к каланче. За парусом у восточного края настила тихо; в восходящем потоке — вверх.
  const w1 = pad(R(9, 13, -2, 2, 22), 'plank', 5, 0.5);
  const w2 = pad(R(9, 13, -9, -4.6, 22.5), 'plank', 5, 0.5);
  const w3 = pad(R(9, 13, -14, -11.6, 23), 'plank', 5, 0.5);
  const winds: SkillWind[] = [{ x0: 6, x1: 22, y0: 20.5, y1: 28, z0: -13.9, z1: 1.9, dx: -1, dz: 0, phase: 0, sec: 5 }];
  const shelters: SkillBox[] = [
    { x0: 6, x1: 13.6, y0: 20.5, y1: 26, z0: -1.2, z1: 1.2 },
    { x0: 6, x1: 13.6, y0: 20.5, y1: 26, z0: -7.9, z1: -5.7 },
    { x0: 6, x1: 13.6, y0: 20.5, y1: 26, z0: -13.5, z1: -12.1 },
  ];
  // поток шириной 3,6 м: внутри не разбежишься (до 3 м/с), выносит к флагу 6 (запад) или на северный уступ
  const updrafts: SkillUpdraft[] = [{ x: 11, z: -15.6, r: 1.8, y0: 20, y1: 31.5, vmax: 7 }];
  const cp6 = cp(R(3, 9.2, -19, -13, 30), 6, 6, -16, WEST, 24);
  pad(R(9.2, 14, -21, -17.8, 30), 'deck', 5, 0.8);
  link('6: флаг 5 → настил 1', [11, 21.5, 4], w1, 'walk');
  link('6: настил 1 → 2 (+0,5), тихо', [11, 22, 0], w2, 'jump', [10]);
  link('6: настил 2 → 3 (+0,5), тихо', [11, 22.5, -6], w3, 'jump', [10]);
  link('6: восходящий поток на флаг 6', [11, 23, -13], cp6, 'lift', undefined, undefined, [11, -15.6]);

  // ---------------------------------------------------------------- 7. батуты (север, серпантин): 30 → 40
  const tA = pad(R(-6, 3, -15, -11, 30), 'deck', 6, 0.8);
  pad(R(-8.6, -6, -14.3, -11.7, 30.3), 'mushroom', 6, 0.3, { bounce: 16.8 });
  const tB = pad(R(-10, 4, -20, -17, 34.5), 'deck', 6, 0.8);
  const cart = line('cart', 6, 2.6, 2.6, 0.3, [5.4, 34.8, -19], [0, 0, 2.6], { rest: 60, go: 90, stay: 60, back: 90, phase: 0 }, 17.5);
  const tC = pad(R(-10, 8, -14.5, -11, 40), 'deck', 6, 0.8);
  const cp7 = cp(R(-16, -10, -15, -9, 40), 7, -13, -12, WEST, 34);
  link('7: флаг 6 → ярус А', [4, 30, -14], tA, 'walk');
  link('7: ярус А → гриб → ярус Б', [-4, 30, -13], tB, 'bounce', undefined, undefined, [-7.3, -13]);
  link('7: ярус Б → тележка', [2.5, 34.5, -19], { movers: [cart] }, 'walk', [0, 20, 40]);
  link('7: тележка → ярус В', [0, 0, 0], tC, 'bounce', [150, 170, 190], cart);
  link('7: ярус В → флаг 7', [-7, 40, -12.5], cp7, 'walk');

  // ---------------------------------------------------------------- 8. карусель (вынос на запад): 40
  const inBridge = pad(R(-24, -16, -11.5, -8.6, 40), 'deck', 7, 0.8);
  const disc: SkillDisc = { cx: -21, cz: 0, top: 40, r: 7, period: 900, boxes: [] };
  for (const [a, b] of [[7.2, 0.85], [6.85, 2.37], [6.0, 4.07], [5.13, 5.13], [4.07, 6.0], [2.37, 6.85], [0.85, 7.2]]) {
    const i = box([disc.cx - a, disc.top - 0.8, disc.cz - b], [disc.cx + a, disc.top, disc.cz + b]);
    pads.push({ box: i, look: 'disc', sec: 7 });
    disc.boxes.push(i);
  }
  const bar: SkillBar = { y0: disc.top + 0.25, y1: disc.top + 1.0, len: 5.2, r: 0.22, period: 240, dir: -1 };
  const bumpers: SkillBumper[] = [0, 1, 2].map((i) => ({ r0: 6.1, a0: (i * 2 * Math.PI) / 3 + 0.5, rad: 0.5, y0: disc.top, y1: disc.top + 1.0 }));
  const outBridge = pad(R(-24, -16, 8.6, 11.5, 40), 'deck', 7, 0.8);
  const cp8 = cp(R(-16, -10, 8, 14, 40), 8, -13, 11, SOUTH, 34);
  link('8: флаг 7 → мостик', [-14, 40, -10], inBridge, 'walk');
  // на диске не постоишь: внутри метёт перекладина, у края ездят столбики — прыжок, перебежка, прыжок
  link('8: мостик → карусель', [-21, 40, -10.5], { disc: true }, 'jump');
  link('8: через карусель (прыжок через перекладину)', [-21, 40, -5.5], R(-22.5, -19.5, 4, 6.2, 40), 'jump', undefined, undefined, undefined, true);
  link('8: карусель → мостик', [-21, 40, 5.5], outBridge, 'jump', undefined, undefined, undefined, true);
  link('8: мостик → флаг 8', [-19, 40, 10], cp8, 'walk');

  // ---------------------------------------------------------------- 9. шары: две корзины через пропасть, 40 → 47
  const lowPier = pad(R(-16, -13, 14, 22, 40), 'pier', 8, 0.8);
  const baskets = [15.5, 19.5].map((z, i) => line('basket', 8, 2.8, 2.8, 0.6, [-11.5, 40, z], [14, 7, 0], { rest: 120, go: 330, stay: 120, back: 330, phase: i * 450 }));
  // над каждой корзиной на полпути — мешок над внутренней половиной (ближе к щели между корзинами): стой во внешней.
  // Было: мешки на 16,25 и 18,75, размах ±0,87, фаза 60 — безопасная полоса на корзине 0,46 м, а на опасной половине
  // два удара за подъём (63 тика касания). Стало: мешки ближе к щели (16,75 и 18,25), размах ±0,75, фаза 30 —
  // безопасная полоса 0,96 м, на опасной половине один короткий удар (≈18 тиков), первый — не раньше 3,4 с подъёма.
  sacks.push({ px: -4.5, py: 50.3, pz: 16.75, len: 6, amp: 0.75, period: 225, phase: 30, axis: 'x', r: 0.85, sec: 8 });
  sacks.push({ px: -4.5, py: 50.3, pz: 18.25, len: 6, amp: 0.75, period: 225, phase: 30, axis: 'x', r: 0.85, sec: 8 });
  const cp9 = cp(R(4, 7, 6, 21, 47), 9, 5.5, 12, NORTH, 41, 'pier');
  link('9: флаг 8 → причал', [-14.5, 40, 12.5], lowPier, 'walk');
  // в корзину — с той стороны, где не пролетает мешок
  link('9: причал → корзина 1', [-14.5, 40, 14.75], { movers: [baskets[0]], at: [0, -0.85] }, 'walk', [0, 40, 80]);
  link('9: корзина 1 → верхний причал', [0, 0, 0], cp9, 'walk', [450, 480, 520], baskets[0]);
  link('9: причал → корзина 2', [-14.5, 40, 20.25], { movers: [baskets[1]], at: [0, 0.85] }, 'walk', [450, 490, 530]);
  links[links.length - 1].alt = true;

  // ---------------------------------------------------------------- 10. колокольня: 4 марша по 8 ступеней вокруг
  // Кольцо 4…6 м от оси над террасой, вплотную к стене колокольни. Марши: восток (на север), север (на запад), запад
  // (на юг), юг (на восток); в каждом марше одной ступени нет — прыжок на +1 м. Обвал идёт по пути s снизу вверх.
  // Раньше между стеной и ступенями была щель 0,2 м, а ступень следующего марша (на +1 м) стояла впритык к углу:
  // кто бежал вдоль стены (центр ближе 4,62 м к оси), упирался в неё телом на подъёме на угловую площадку и застревал.
  // Теперь ступени вплотную к стене, марш — 8 ступеней по 1 м, углы 2×2: у стены тело не помещается рядом со ступенью
  // следующего марша, и на угол всегда можно подняться.
  const corners: Array<[number, number]> = [[5, 5], [5, -5], [-5, -5], [-5, 5]];
  const holes = [4, 3, 5, 2];
  let s = 1;
  let y = 47.5;
  const stepBox = (r: SkillRect, corner: boolean, at: number): void => {
    steps.push({ box: box([r.x0, r.y - SKILL_STEP_THICK, r.z0], [r.x1, r.y, r.z1]), s: at, corner, rect: r });
  };
  for (let f = 0; f < 4; f++) {
    const [cx, cz] = corners[f];
    stepBox(R(cx - 1, cx + 1, cz - 1, cz + 1, y), true, s);
    s += 1;
    for (let j = 0; j < 8; j++) {
      y += 0.5;
      const a = 4 - (j + 1), b = 4 - j, mid = s + j + 0.5;
      if (j === holes[f]) continue;
      if (f === 0) stepBox(R(4, 6, a, b, y), false, mid);
      else if (f === 1) stepBox(R(a, b, -6, -4, y), false, mid);
      else if (f === 2) stepBox(R(-6, -4, -b, -a, y), false, mid);
      else stepBox(R(-b, -a, 4, 6, y), false, mid);
    }
    s += 8 + 1;
    y += 0.5;
  }
  const stairLength = s;
  const gallery = R(-4, 4, -4, 4, SKILL_TOWER.gallery);
  const bell: SkillBox = { x0: -1, x1: 1, y0: 66.8, y1: 68.9, z0: -1, z1: 1 };
  link('10: причал → первая площадка', [5.5, 47, 8], steps[0].rect, 'walk');
  for (let i = 0; i + 1 < steps.length; i++) {
    const a = steps[i].rect, b = steps[i + 1].rect;
    const hole = b.y - a.y > 0.6;
    link(`10: ступень ${i + 1} → ${i + 2}${hole ? ' (дыра, +1)' : ''}`, [(a.x0 + a.x1) / 2, a.y, (a.z0 + a.z1) / 2], b, hole ? 'jump' : 'walk', undefined, undefined, undefined, true);
  }
  const last = steps[steps.length - 1].rect;
  link('10: последняя ступень → галерея', [(last.x0 + last.x1) / 2, last.y, (last.z0 + last.z1) / 2], gallery, 'walk', undefined, undefined, undefined, true);
  link('10: прыжок в колокол', [0, 65, 2.2], { bell: true }, 'jump');

  // ---------------------------------------------------------------- карта
  const slots = [0, 1, 2, 3, 4].map((i) => ({ x: -14, y: 0, z: 8.5 + i * 2.1, yaw: EAST }));
  return {
    name: 'Небесная каланча', boxes, pads, movers, clouds, steps, disc, sacks, rams, bar, bumpers, winds, shelters, updrafts,
    checkpoints, bell, gallery, start, slots, links, stairLength,
    spawns: [{ x: checkpoints[0].px, y: checkpoints[0].y, z: checkpoints[0].pz, yaw: checkpoints[0].yaw, team: 0 }],
    trampolines: [], pickups: [], deco: [], bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
  };
}
