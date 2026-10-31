// Надпись TIREDWOOD на горе за городом — как HOLLYWOOD над Лос-Анджелесом (выпуск 6). Девять огромных ярко-белых букв
// стоят на зелёном склоне лицом к колесу обозрения и площади: с верха колеса они выплывают над крышами города.
// Каждая буква — плита простого рубленого шрифта (экструзия контура, без текстур) на своих опорах: тёмные стойки под
// низом и раскосы сзади, уходящие в склон. Стоят чуть неровно — по земле холма: каждая на своей высоте, со своим
// поворотом и лёгким наклоном назад. Вся надпись склеена в два меша: белые буквы — без освещения и тумана (белое
// остаётся белым, даль его не выбеливает; объём — светло-серыми торцами и боковыми гранями в цветах вершин) и тёмные
// опоры. Тени выключены: две отрисовки на весь кадр.
// Буквы стоят на одной высоте холма (на его изолинии) — иначе на крутом склоне крайние ушли бы под крыши города, а по
// азимуту с колеса расставлены по углу зрения: строка оттуда ровная, буквы не наползают друг на друга. Чтобы за
// буквами была зелень, а не небо, к дальнему холму города добавлен широкий подъём (signHill): с верха колеса верх букв
// ниже его гребня. Раскладка и подъём не зависят от three.js и проверяются тестом.
import * as THREE from 'three';
import { pick } from '../../shared/layout.ts';
import { makeRng } from '../../shared/math.ts';
import { P3 } from '../../shared/plaza3/layout.ts';
import { WHEEL } from '../../shared/wheel.ts';
import { mergeColored, paint, place, staticMesh } from '../render/kit.ts';
import { skyHaze } from './backdrop.ts';

export type Ground = (x: number, z: number) => number;
type Pt = [number, number];

export const SIGN_WORD = 'TIREDWOOD';
/** Высота букв, м: у HOLLYWOOD — 14, здесь втрое выше, чтобы читалось с колеса за полкилометра */
export const LETTER_H = 45;
/**
 * Азимут (от севера к востоку) с колеса на середину надписи — правее мачты с красным огнём (она на 36°), чтобы мачта
 * стояла слева от первой буквы, — и высота склона, где буквы стоят, м (на таком склоне до них 500–570 м от колеса).
 */
export const SIGN_BEARING = (pick(54, () => P3.sign.bearingDeg) * Math.PI) / 180;
/** В plaza3 (флаг PLAZA3) надпись правее и выше по склону — в коридоре вида с точки появления (docs/plaza3/level/layout.json, sign) */
const LINE_Y = pick(37, () => P3.sign.lineY);
/** Толщина штриха и просвет между буквами, в высотах буквы; глубина плиты тоже */
const STROKE = 0.21;
const GAP = 0.17;
const DEPTH = 0.07;
/** Раскос уходит назад на столько высот буквы */
const BRACE_BACK = 0.42;
const STEEL = 0x33373b;
/**
 * Взгляд при посадке в колесо: на надпись, но со сдвигом на 28° к востоку — она идёт по левой части кадра от края до
 * желейки и не прячется за ней и за крышей кабинки; чуть вверх, чтобы над крышами города она выплывала в нижней части
 * кадра. yaw камеры — минус азимут.
 */
export const WHEEL_VIEW = { yaw: -(SIGN_BEARING + (28 * Math.PI) / 180), pitch: 0.14 };
/** Яркость граней неосвещённых букв: лицо — чисто белое, торцы и боковые грани — светло-серые (сверху светлее) */
const FACE_TONE = 1;
const BACK_TONE = 0.55;
const RIM_TONE = 0.68;
const RIM_SHADE = 0.18;

// ------------------------------------------------------------ холм под надписью

/**
 * С верха колеса (17 м) за буквами оказывается небо: холм за городом — пологий купол, над крышами его видно градуса
 * на полтора, а буквы в 4–5° высотой. Поэтому к рельефу добавлен подъём вдоль луча с колеса (азимут HILL_BEARING —
 * чуть восточнее надписи, чтобы и крайние буквы были на фоне склона): он растёт от HILL_FROM до HILL_TO метров от
 * колеса на HILL_UP метров и держится дальше гребнем; поперёк — колокол шириной HILL_SIDE (σ). Буквы стоят на его
 * склоне, за ними — зелёная гора.
 */
const HILL_UP = pick(90, () => P3.sign.hillUp);
export const HILL_BEARING = (pick(62, () => P3.sign.hillBearingDeg) * Math.PI) / 180;
const HILL_FROM = 400;
const HILL_TO = 800;
const HILL_SIDE = 750;

/** Доля подъёма в точке (x, z): 0 у города и у колеса, 1 на гребне за надписью. */
export function signHillK(x: number, z: number): number {
  const dx = x - WHEEL.x;
  const dz = z - WHEEL.z;
  const along = dx * Math.sin(HILL_BEARING) - dz * Math.cos(HILL_BEARING);
  const across = dx * Math.cos(HILL_BEARING) + dz * Math.sin(HILL_BEARING);
  const t = Math.min(1, Math.max(0, (along - HILL_FROM) / (HILL_TO - HILL_FROM)));
  return t * t * (3 - 2 * t) * Math.exp(-0.5 * (across / HILL_SIDE) ** 2);
}

/** Добавка к высоте земли в точке (x, z), м. */
export function signHill(x: number, z: number): number {
  return HILL_UP * signHillK(x, z);
}

// ------------------------------------------------------------ шрифт

/** Часть буквы: внешний контур и дырки, в высотах буквы (низ — 0, верх — 1, слева — 0) */
interface Part {
  outer: Pt[];
  holes?: Pt[][];
}

export interface Glyph {
  /** Ширина буквы в высотах */
  w: number;
  parts: Part[];
  /** Где стоят опоры: по x от левого края, в высотах (под сплошным местом внизу буквы) */
  feet: number[];
}

function rect(x0: number, y0: number, x1: number, y1: number): Pt[] {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

/** Прямоугольник со скруглёнными углами, против часовой; радиусы: низ-слева, низ-справа, верх-справа, верх-слева. */
function rounded(x0: number, y0: number, x1: number, y1: number, r: [number, number, number, number], seg = 6): Pt[] {
  const out: Pt[] = [];
  const arc = (cx: number, cy: number, rad: number, a0: number): void => {
    if (rad <= 0) {
      out.push([cx, cy]);
      return;
    }
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
    }
  };
  arc(x0 + r[0], y0 + r[0], r[0], Math.PI);
  arc(x1 - r[1], y0 + r[1], r[1], Math.PI * 1.5);
  arc(x1 - r[2], y1 - r[2], r[2], 0);
  arc(x0 + r[3], y1 - r[3], r[3], Math.PI / 2);
  return out;
}

/** Наклонная перекладина: от x-низа до x-верха, шириной по горизонтали t. */
function slant(xb: number, xt: number, t: number): Pt[] {
  return [[xb - t / 2, 0], [xb + t / 2, 0], [xt + t / 2, 1], [xt - t / 2, 1]];
}

const S = STROKE;

/** Буквы слова: простой рубленый шрифт блоками, как у вывески над Голливудом. */
export function glyph(ch: string): Glyph {
  switch (ch) {
    case 'T': {
      const w = 0.66;
      const c = w / 2;
      return { w, parts: [{ outer: [[c - S / 2, 0], [c + S / 2, 0], [c + S / 2, 1 - S], [w, 1 - S], [w, 1], [0, 1], [0, 1 - S], [c - S / 2, 1 - S]] }], feet: [c - 0.05, c + 0.05] };
    }
    case 'I':
      return { w: S + 0.01, parts: [{ outer: rect(0, 0, S + 0.01, 1) }], feet: [(S + 0.01) / 2] };
    case 'R': {
      const w = 0.64;
      return {
        w,
        parts: [
          { outer: rect(0, 0, S, 1) },
          { outer: rounded(0, 0.4, w, 1, [0, 0.2, 0.24, 0]), holes: [rounded(S, 0.4 + 0.17, w - S, 1 - S, [0, 0.07, 0.07, 0])] },
          { outer: [[0.18, 0.44], [0.42, 0.44], [w, 0], [w - 0.25, 0]] },
        ],
        feet: [S / 2, w - 0.12],
      };
    }
    case 'E': {
      const w = 0.56;
      const m = 0.5;
      return {
        w,
        parts: [{ outer: [[0, 0], [w, 0], [w, S], [S, S], [S, m - S / 2], [w * 0.9, m - S / 2], [w * 0.9, m + S / 2], [S, m + S / 2], [S, 1 - S], [w, 1 - S], [w, 1], [0, 1]] }],
        feet: [0.12, w - 0.13],
      };
    }
    case 'D': {
      const w = 0.66;
      return { w, parts: [{ outer: rounded(0, 0, w, 1, [0, 0.32, 0.32, 0]), holes: [rounded(S, S, w - S, 1 - S, [0, 0.13, 0.13, 0])] }], feet: [0.12, 0.38] };
    }
    case 'W': {
      const w = 1;
      const t = S * 1.12;
      return { w, parts: [{ outer: slant(0.27, t / 2, t) }, { outer: slant(0.27, 0.5, t) }, { outer: slant(0.73, 0.5, t) }, { outer: slant(0.73, w - t / 2, t) }], feet: [0.27, 0.73] };
    }
    case 'O': {
      const w = 0.74;
      return { w, parts: [{ outer: rounded(0, 0, w, 1, [0.3, 0.3, 0.3, 0.3]), holes: [rounded(S, S, w - S, 1 - S, [0.12, 0.12, 0.12, 0.12])] }], feet: [0.26, 0.48] };
    }
    default:
      throw new Error(`нет буквы ${ch}`);
  }
}

// ------------------------------------------------------------ раскладка по склону

export interface SignLetter {
  ch: string;
  /** Середина низа плиты спереди: x, z — на склоне, y — низ плиты, м */
  x: number;
  y: number;
  z: number;
  /** Поворот вокруг вертикали: лицо буквы (локальный +z) смотрит в (sin yaw, cos yaw) — на колесо */
  yaw: number;
  /** Наклон назад, рад */
  lean: number;
  /** Ширина, м */
  w: number;
  /** Высота плиты над землёй спереди, м */
  lift: number;
}

/** Где луч с колеса под азимутом bearing (рад, от севера к востоку) впервые поднимается на высоту h: точка и расстояние. */
function onRay(ground: Ground, bearing: number, h: number): { x: number; z: number; d: number } {
  const at = (d: number): Pt => [WHEEL.x + Math.sin(bearing) * d, WHEEL.z - Math.cos(bearing) * d];
  let hit = -1;
  for (let d = 300; d <= 1300; d += 4) {
    if (ground(...at(d)) >= h) {
      hit = d;
      break;
    }
  }
  // луч не дотянулся до этой высоты (рельеф поменяли) — ставим на самую высокую точку луча
  if (hit < 0) {
    hit = 300;
    for (let d = 304; d <= 1300; d += 4) if (ground(...at(d)) > ground(...at(hit))) hit = d;
  }
  let lo = hit - 4;
  let hi = hit;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (ground(...at(mid)) < h) lo = mid;
    else hi = mid;
  }
  const d = (lo + hi) / 2;
  const [x, z] = at(d);
  return { x, z, d };
}

/**
 * Места букв слева направо: с колеса они идут по углу зрения — ширина буквы и просвет между ними под одним и тем же
 * углом, как у плоской надписи (сам угол зависит от расстояния до холма в этом направлении, поэтому считаем по ходу).
 * b0 — азимут левого края; в ответе ещё азимут правого.
 */
function slots(ground: Ground, word: string, h: number, b0: number, lineY: number): { at: Array<{ ch: string; x: number; z: number; w: number }>; end: number } {
  const at: Array<{ ch: string; x: number; z: number; w: number }> = [];
  let beta = b0;
  let d = 560;
  for (const ch of word) {
    const w = glyph(ch).w * h;
    let p = { x: 0, z: 0, d };
    for (let k = 0; k < 4; k++) {
      p = onRay(ground, beta + Math.atan2(w / 2, d), lineY);
      d = p.d;
    }
    at.push({ ch, x: p.x, z: p.z, w });
    beta += 2 * Math.atan2(w / 2, d) + (GAP * h) / d;
  }
  return { at, end: beta - (GAP * h) / d };
}

/** Полная ширина слова, в высотах буквы. */
export function wordWidth(word = SIGN_WORD): number {
  let w = (word.length - 1) * GAP;
  for (const ch of word) w += glyph(ch).w;
  return w;
}

export function layoutSign(ground: Ground, word = SIGN_WORD, h = LETTER_H, lineY = LINE_Y, mid = SIGN_BEARING): SignLetter[] {
  // ширина слова в углах известна только после первого прохода — второй ставит середину слова на азимут mid
  const first = slots(ground, word, h, mid - 0.2, lineY);
  const width = first.end - (mid - 0.2);
  const row = slots(ground, word, h, mid - width / 2, lineY).at;

  const rng = makeRng(61);
  const out: SignLetter[] = [];
  for (const { ch, x: cx, z: cz, w } of row) {
    // каждая буква смотрит на колесо — чуть вразнобой (по ветру и осадке опор)
    const yaw = Math.atan2(WHEEL.x - cx, WHEEL.z - cz) + (rng() - 0.5) * 0.05;
    // и стоит чуть ближе или дальше по склону
    const back = (rng() - 0.5) * 8;
    const x = cx - Math.sin(yaw) * back;
    const z = cz - Math.cos(yaw) * back;
    // низ плиты — над самой высокой точкой земли под её лицом, чтобы нигде не уходила в склон спереди
    let top = -Infinity;
    for (let k = -2; k <= 2; k++) {
      const lx = (k / 4) * w;
      top = Math.max(top, ground(x + lx * Math.cos(yaw), z - lx * Math.sin(yaw)));
    }
    const lift = h * (0.05 + 0.07 * rng());
    out.push({ ch, x, y: top + lift, z, yaw, lean: 0.01 + rng() * 0.03, w, lift });
  }
  return out;
}

/** Мировая точка в осях буквы: lx — вправо от середины, lz — вперёд (к колесу). */
function world(l: SignLetter, lx: number, lz: number): Pt {
  return [l.x + lx * Math.cos(l.yaw) + lz * Math.sin(l.yaw), l.z - lx * Math.sin(l.yaw) + lz * Math.cos(l.yaw)];
}

// ------------------------------------------------------------ геометрия

/** Контур против часовой (outer) или по часовой (дырка): так ждёт ExtrudeGeometry. */
function orient(pts: Pt[], ccw: boolean): Pt[] {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a > 0 === ccw ? pts : [...pts].reverse();
}

/** Плита части буквы: лицо в плоскости z = 0, толщина уходит назад; начало — середина низа буквы. */
function plate(part: Part, w: number, h: number): THREE.BufferGeometry {
  const v = (p: Pt): THREE.Vector2 => new THREE.Vector2(p[0] * h, p[1] * h);
  const shape = new THREE.Shape(orient(part.outer, true).map(v));
  for (const hole of part.holes ?? []) shape.holes.push(new THREE.Path(orient(hole, false).map(v)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: DEPTH * h, bevelEnabled: false, steps: 1 });
  g.translate(-(w * h) / 2, 0, -DEPTH * h);
  return g;
}

/**
 * Цвета плиты: лицо — чисто белое, задняя грань и торцы с боков и сверху/снизу — светло-серые (по нормали: сверху
 * светлее, снизу темнее). Освещения у букв нет, поэтому объём держится только на этих цветах вершин.
 */
function shade(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.getAttribute('normal');
  const arr = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const nz = n.getZ(i);
    const v = nz > 0.5 ? FACE_TONE : nz < -0.5 ? BACK_TONE : RIM_TONE + RIM_SHADE * n.getY(i);
    arr[i * 3] = v;
    arr[i * 3 + 1] = v;
    arr[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('normal');
  return g;
}

/** Балка от a до b квадратного сечения w. */
function beam(a: THREE.Vector3, b: THREE.Vector3, w: number): THREE.BufferGeometry {
  const d = b.clone().sub(a);
  const g = new THREE.BoxGeometry(w, d.length(), w);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/**
 * Огни букв (флаг SOCIAL, shared/social.ts): горящая буква — насыщенное золото с оранжевой каймой сзади (кайма чёткая,
 * без размытого ореола: форма буквы не теряется), ещё не горящая — ровно такая, как без флага.
 */
const LIT_TINT: Pt3 = [1, 0.6, 0.08];
const RIM_COLOR: Pt3 = [0.9, 0.2, 0.02];
/** Толщина каймы, в высотах буквы; копий плиты вокруг буквы — по кругу */
const RIM_W = 0.04;
const RIM_DIRS = 8;
type Pt3 = [number, number, number];

export class Tiredwood {
  readonly letters: SignLetter[];
  private readonly ground: Ground;
  private readonly h: number;
  /** Огни букв: цвета вершин лицевого меша и места букв в них; кайма — копии лица, сдвинутые в плоскости буквы и назад */
  private lights: {
    color: THREE.BufferAttribute;
    base: Float32Array;
    ranges: Array<[number, number]>;
    /** Кайма собирается при первых огнях (флаг SOCIAL): без флага у надписи те же два меша, что и были */
    rim: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null;
    rimPos: THREE.BufferAttribute | null;
    /** Исходные позиции вершин лица (мир) */
    rimBase: Float32Array;
    faceIndex: THREE.BufferAttribute | null;
    scene: THREE.Scene;
  } | null = null;
  /** Сколько букв горит; −1 — огни выключены (флаг SOCIAL не включён): надпись белая, как была */
  private lit = -1;

  constructor(ground: Ground, h = LETTER_H) {
    this.ground = ground;
    this.h = h;
    this.letters = layoutSign(ground, SIGN_WORD, h);
  }

  /** Попадает ли (x, z) в место под надписью (с запасом margin): там не ставим дома, деревья и огоньки. */
  blocks(x: number, z: number, margin = 0): boolean {
    const back = this.h * (BRACE_BACK + DEPTH) + margin;
    for (const l of this.letters) {
      const dx = x - l.x;
      const dz = z - l.z;
      // в осях буквы: u — вдоль строки, v — вперёд, к колесу
      const u = dx * Math.cos(l.yaw) - dz * Math.sin(l.yaw);
      const v = dx * Math.sin(l.yaw) + dz * Math.cos(l.yaw);
      if (Math.abs(u) <= l.w / 2 + margin && v >= -back && v <= margin + 14) return true;
    }
    return false;
  }

  /** Склеенная надпись: буквы — один меш (неосвещённый белый), опоры — другой. far — материал далёкого (дождевая дымка). */
  build(scene: THREE.Scene, far: <T extends THREE.Material>(m: T) => T): THREE.Mesh[] {
    const h = this.h;
    const haze = new THREE.Color();
    const faces: THREE.BufferGeometry[] = [];
    const parts: THREE.BufferGeometry[] = [];
    const ranges: Array<[number, number]> = [];
    let verts = 0;
    for (const l of this.letters) {
      const g = glyph(l.ch);
      const from = verts;
      const cy = l.y + h / 2;
      // у тёмных опор дымка заложена в цвет, как у города; у белых букв её нет — даль их не выбеливает
      const k = skyHaze(haze, l.x, cy, l.z);
      const steel = new THREE.Color(STEEL).lerp(haze, k * 0.3);
      for (const p of g.parts) {
        const plank = place(shade(plate(p, g.w, h)), l.x, l.y, l.z, l.yaw, -l.lean);
        verts += plank.getAttribute('position').count;
        faces.push(plank);
      }
      ranges.push([from, verts]);
      // стойки: от земли под каждой опорой вверх за плиту (внутри плиты их не видно)
      const pw = 0.034 * h;
      const hi = 0.22 * h;
      for (const f of g.feet) {
        const lx = (f - g.w / 2) * h;
        const [fx, fz] = world(l, lx, -DEPTH * h * 0.5);
        const low = this.ground(fx, fz) - 3;
        const post = beam(new THREE.Vector3(lx, low - l.y, -DEPTH * h * 0.5), new THREE.Vector3(lx, hi, -DEPTH * h * 0.5), pw);
        parts.push(place(paint(post, steel), l.x, l.y, l.z, l.yaw));
        // раскос сзади: от стойки вверх-назад в склон (земля сзади выше, поэтому он короткий и пологий)
        const [bx, bz] = world(l, lx, -h * (DEPTH + BRACE_BACK));
        const by = this.ground(bx, bz) - 1.5;
        const brace = beam(new THREE.Vector3(lx, 0.3 * h, -DEPTH * h * 0.7), new THREE.Vector3(lx, by - l.y, -h * (DEPTH + BRACE_BACK)), pw * 0.7);
        parts.push(place(paint(brace, steel), l.x, l.y, l.z, l.yaw));
      }
    }
    // Буквы: непрозрачный белый без освещения, тумана и тонмаппинга — иначе тёплое низкое солнце и ACES дают кремовый
    // цвет, а далёкое в дымке выцветает, и белое на светлом небе теряется. Опоры — Lambert, как у города: дымка запечена.
    const white = far(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false }));
    const dark = far(new THREE.MeshLambertMaterial({ vertexColors: true, fog: false }));
    const face = staticMesh(mergeColored(faces), white, false);
    const meshes = [face, staticMesh(mergeColored(parts), dark, false)];
    scene.add(...meshes);
    const color = face.geometry.getAttribute('color') as THREE.BufferAttribute;
    this.lights = { color, base: Float32Array.from(color.array), ranges, rim: null, rimPos: null, rimBase: Float32Array.from(face.geometry.getAttribute('position').array as Float32Array), faceIndex: face.geometry.getIndex(), scene };
    return meshes;
  }

  /** Кайма: восемь копий лица букв вокруг, каждая сдвинута в плоскости буквы и назад за её плиту — выглядывает чёткой полосой */
  private buildRim(scene: THREE.Scene): { rim: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; rimPos: THREE.BufferAttribute } {
    const L = this.lights!;
    const nv = L.rimBase.length / 3;
    const g = new THREE.BufferGeometry();
    const rimPos = new THREE.BufferAttribute(new Float32Array(nv * 3 * RIM_DIRS), 3);
    rimPos.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', rimPos);
    const src = L.faceIndex;
    const ni = src ? src.count : nv;
    const idx = new Uint32Array(ni * RIM_DIRS);
    for (let k = 0; k < RIM_DIRS; k++) for (let j = 0; j < ni; j++) idx[k * ni + j] = (src ? src.getX(j) : j) + k * nv;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(RIM_COLOR[0], RIM_COLOR[1], RIM_COLOR[2]), fog: false, toneMapped: false });
    const rim = new THREE.Mesh(g, mat);
    rim.frustumCulled = false;
    rim.visible = false;
    scene.add(rim);
    return { rim, rimPos };
  }

  /** Кайму на места: у горящих букв копии разведены по кругу, у остальных лежат строго за плитой (не видны) */
  private placeRim(): void {
    const L = this.lights;
    if (!L?.rimPos) return;
    const p = L.rimPos.array as Float32Array;
    const b = L.rimBase;
    const nv = b.length / 3;
    const d = this.h * RIM_W;
    const back = this.h * DEPTH * 1.15;
    for (const [i, [from, to]] of L.ranges.entries()) {
      const l = this.letters[i];
      const lit = i < this.lit;
      const rx = Math.cos(l.yaw), rz = -Math.sin(l.yaw), fx = Math.sin(l.yaw), fz = Math.cos(l.yaw);
      for (let k = 0; k < RIM_DIRS; k++) {
        const a = (k / RIM_DIRS) * Math.PI * 2;
        const ox = lit ? Math.cos(a) * d : 0;
        const oy = lit ? Math.sin(a) * d : 0;
        const dx = rx * ox - fx * back, dy = oy, dz = rz * ox - fz * back;
        for (let v = from; v < to; v++) {
          const o = (k * nv + v) * 3;
          p[o] = b[v * 3] + dx;
          p[o + 1] = b[v * 3 + 1] + dy;
          p[o + 2] = b[v * 3 + 2] + dz;
        }
      }
    }
    L.rimPos.needsUpdate = true;
  }

  /**
   * Огни букв (флаг SOCIAL): n первых букв горят золотом с каймой, остальные — как без флага. −1 — вернуть всё как было.
   * Цветами вершин и копиями лица, без ламп и без смены видимости (шейдеры не пересобираются).
   */
  setLit(n: number): void {
    const L = this.lights;
    if (!L || n === this.lit) return;
    this.lit = n;
    const a = L.color.array as Float32Array;
    if (n >= 0 && !L.rim) Object.assign(L, this.buildRim(L.scene));
    L.rim!.visible = n >= 0;
    for (const [i, [from, to]] of L.ranges.entries()) {
      const tint = n >= 0 && i < n ? LIT_TINT : null;
      for (let v = from; v < to; v++) for (let c = 0; c < 3; c++) a[v * 3 + c] = L.base[v * 3 + c] * (tint ? tint[c] : 1);
    }
    L.color.needsUpdate = true;
    this.placeRim();
  }

  /** Сколько букв горит сейчас (−1 — огни выключены) */
  get litCount(): number {
    return this.lit;
  }

  /** Кайма чуть дышит; time — секунды мира, fast — все девять горят (празднуем) */
  tickLit(time: number, fast = false): void {
    const L = this.lights;
    if (!L?.rim || this.lit < 0) return;
    const k = 0.8 + 0.2 * Math.sin(time * (fast ? 4.2 : 1.6));
    L.rim.material.color.setRGB(RIM_COLOR[0] * k, RIM_COLOR[1] * k, RIM_COLOR[2] * k);
  }
}
