// Избушка — финальный босс 50-й волны (концепт: concepts/final-a-fisher-hut.png). Рыбацкая изба Барона Варенья на огромных
// оранжевых лапах чайки: сруб из выветренных брёвен, крыша из дранки со мхом, каменная труба, сети с поплавками, связка
// вяленой рыбы, две бочки варенья на боку, сиреневый вымпел на коньке. Лицо — фасад: два окна светятся сиреневым
// (глаза), ставни сверху — веки, наличники над ними — брови, дверь — рот, верёвочная лестница из-под двери — язык.
// Внутри за дверью — печь: обычно тлеет оранжевым, «ядро открыто» — горит голубым (бить сюда).
// Ходит, как птица: обратное колено, стопа не скользит (шаг от пройденного пути), изба переваливается с лапы на лапу.
// Атаки (у каждой — 1,8 с предупреждения позой и красной меткой): пинок по участку стены, печные бомбы по ходу стены,
// топот (прыжок с волной), в 3-й фазе — «наседка»: запрыгивает на стену, садится и несёт бочки-яйца.
import * as THREE from 'three';
import { colored, merge } from '../../../client/fort/mobs/kit.ts';
import {
  HIDE, JAM, ball, clamp01, composeInto, heartbeat, jamDrip, jamSpot, keys, lathe, lerp, lump, paint, smooth, tube, win, wobble,
  type Geo, type V3,
} from '../../../client/fort/mobs/set-d-shapes.ts';
import { apply, jitter, legIK, type BossClip, type BossDef, type BossPart } from './bosskit.ts';

// ------------------------------------------------------------ состояния (на стенде; в игре — новые ZS_* в shared/fort.ts)

export const HS = { WALK: 0, APPEAR: 1, KICK: 2, BOMBS: 3, STOMP: 4, OPEN: 5, PHASE: 6, NEST: 7 } as const;
/** Предупреждение атаки — как у боссов крепости (BOSS_WARN_TICKS) */
export const HUT_WARN = 1.8;
/** «Наседка»: на сколько вперёд и вверх прыгает — до середины стены (на стенде) */
export const NEST_DZ = 6.2;
export const NEST_DY = 3.4;
/** Печные бомбы: когда вылетают (с) в 1-й и со 2-й фазы */
const BOMBS1 = [1.8, 2.15, 2.5];
const BOMBS2 = [1.8, 1.95, 2.1, 2.25, 2.4];

// ------------------------------------------------------------ размеры избы (метры, оси избы: пол — y = 0, фасад — +Z)

const W = 2.2;
const D = 1.9;
const LOG_R = 0.17;
const STEP = 0.33;
const COURSES = 9;
const RIDGE = 4.95;
const EAVE_X = 2.78;
const EAVE_Y = 2.7;
const ROOF_Z0 = -2.35;
const ROOF_Z1 = 2.5;
const DOOR = { x0: -0.62, x1: 0.62, y0: 0.04, y1: 1.92 } as const;
const WIN_Y0 = 2.02;
const WIN_Y1 = 2.8;
const WINS = [[-1.8, -0.92], [0.92, 1.8]] as const;
const CHIM = { x: -1.25, z: -0.75, top: 6.45 } as const;
const POLE: V3 = [0, RIDGE + 0.05, ROOF_Z1 - 0.12];
const POLE_TOP = 1.75;

/** Ноги: бедро в осях избы, длины звеньев, высота щиколотки над землёй (толщина стопы) */
const HIP_X = 1.2;
const HIP: V3 = [HIP_X, -0.35, -0.15];
const L1 = 2.6;
const L2 = 2.75;
const ANKLE = 0.32;
/** Где стоят лапы в покое (корень), высота пола избы над землёй в покое */
const FOOT_X = 1.45;
const BODY_Y = 5.25;
/** Шаг: полный цикл (левая + правая) за столько метров пути, доля опоры, высота подъёма лапы */
const CYCLE = 3.9;
const STANCE = 0.6;
const LIFT = 1.1;

// ------------------------------------------------------------ цвета

const LOG = 0x8b6c4c;
const LOG_DK = 0x6c5139;
const LOG_END = 0xc9a77c;
const SILL = 0x5a4232;
const SHINGLE = 0x7d6b5c;
const SHINGLE_DK = 0x5d4f45;
const MOSS = 0x6e8a3a;
const CREAM = 0xf0e4c8;
const SHUTTER = 0xa94a3c;
const DOOR_C = 0x6a4a33;
const IRON = 0x3c3a3e;
const STONE = 0xa29788;
const STONE_DK = 0x7c7268;
const ROPE = 0xc8ad7a;
const NET = 0x6b5a3e;
const FEATHER = 0xece6dc;
const FEATHER_DK = 0xbdb3a6;
const LEG = 0xf08b3a;
const LEG_DK = 0xcf6a24;
const CLAW = 0x3a2f2c;
const PURPLE = 0x7e2fa8;
const PURPLE_DK = 0x52206f;
const EYE = 0x9a50f0;
const CORE_LO = 0x0aa6c4;
const CORE_HI = 0x8af6ff;
const EMBER = 0xff8a2a;

// ------------------------------------------------------------ геометрия

const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number): Geo =>
  colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);

/** Бревно вдоль оси (ось 'x' или 'z') от a до b на высоте y, с торцами светлее */
function log(axis: 'x' | 'z', a: number, b: number, y: number, c: number, seed: number): Geo {
  const len = b - a;
  const tone = new THREE.Color(LOG).lerp(new THREE.Color(LOG_DK), 0.25 + 0.5 * Math.abs(Math.sin(seed * 12.9898)));
  const side = colored(new THREE.CylinderGeometry(LOG_R, LOG_R, len, 8, 1, true), tone.getHex());
  const capT = colored(new THREE.CircleGeometry(LOG_R, 8).rotateX(-Math.PI / 2).translate(0, len / 2, 0), LOG_END);
  const capB = colored(new THREE.CircleGeometry(LOG_R, 8).rotateX(Math.PI / 2).translate(0, -len / 2, 0), LOG_END);
  const p = merge([side, capT, capB]);
  // торцы — светлые срезы; брёвна чуть кривые: середина ниже на 1–2 см
  if (axis === 'x') p.rotateZ(Math.PI / 2).translate((a + b) / 2, y, c);
  else p.rotateX(Math.PI / 2).translate(c, y, (a + b) / 2);
  return p;
}

/** Промежутки [a, b] без вырезов cuts */
function spans(a: number, b: number, cuts: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  let out: Array<[number, number]> = [[a, b]];
  for (const [c0, c1] of cuts) {
    const next: Array<[number, number]> = [];
    for (const [s0, s1] of out) {
      if (c1 <= s0 || c0 >= s1) next.push([s0, s1]);
      else {
        if (c0 - s0 > 0.12) next.push([s0, c0]);
        if (s1 - c1 > 0.12) next.push([c1, s1]);
      }
    }
    out = next;
  }
  return out;
}

function wallsGeo(): Geo[] {
  const out: Geo[] = [];
  const over = 0.28;
  for (let i = 0; i < COURSES; i++) {
    const y = LOG_R + STEP * i;
    // фасад с дверью и окнами
    const cuts: Array<[number, number]> = [];
    if (y - LOG_R < DOOR.y1 && y + LOG_R > DOOR.y0) cuts.push([DOOR.x0 - 0.04, DOOR.x1 + 0.04]);
    if (y - LOG_R < WIN_Y1 && y + LOG_R > WIN_Y0) for (const [a, b] of WINS) cuts.push([a - 0.04, b + 0.04]);
    for (const [a, b] of spans(-W - over, W + over, cuts)) out.push(log('x', a, b, y, D, i * 3 + a));
    out.push(log('x', -W - over, W + over, y, -D, i * 7 + 1));
    // бока — на полбревна выше (перевязка углов)
    const ys = y + STEP / 2;
    if (ys + LOG_R < 3.15) {
      out.push(log('z', -D - over, D + over, ys, W, i * 5 + 2));
      out.push(log('z', -D - over, D + over, ys, -W, i * 11 + 3));
    }
  }
  // фронтон и задний щипец — вертикальные доски под крышей
  for (const zf of [D + 0.02, -D - 0.02]) {
    for (let k = -6; k <= 6; k++) {
      const x = k * 0.34;
      const top = RIDGE - 0.25 - (Math.abs(x) / EAVE_X) * (RIDGE - EAVE_Y);
      const h = top - 3.0;
      if (h < 0.1) continue;
      const tone = k % 2 ? 0x7a5c40 : 0x86674a;
      out.push(box(0.32, h, 0.08, x, 3.0 + h / 2, zf, tone));
    }
  }
  // круглое слуховое окно на фронтоне — тёмное, с крестом
  out.push(colored(new THREE.CircleGeometry(0.3, 12).translate(0, 3.85, D + 0.07), 0x2a1d22));
  out.push(colored(new THREE.TorusGeometry(0.32, 0.06, 4, 14).translate(0, 3.85, D + 0.08), CREAM));
  out.push(box(0.05, 0.6, 0.04, 0, 3.85, D + 0.1, CREAM), box(0.6, 0.05, 0.04, 0, 3.85, D + 0.1, CREAM));
  return out;
}

function roofGeo(): Geo[] {
  const out: Geo[] = [];
  const dx = EAVE_X;
  const dy = RIDGE - EAVE_Y;
  const len = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  const depth = ROOF_Z1 - ROOF_Z0;
  const zc = (ROOF_Z0 + ROOF_Z1) / 2;
  for (const s of [-1, 1]) {
    // основа ската
    const slab = new THREE.BoxGeometry(len + 0.1, 0.16, depth).translate((s * len) / 2, 0, 0);
    slab.rotateZ(-ang * s).translate(0, RIDGE, zc);
    out.push(colored(slab, SHINGLE_DK));
    // ряды дранки чешуёй: каждый ряд — доски разной длины, со мхом пятнами
    const rows = 7;
    for (let r = 0; r < rows; r++) {
      const u = (r + 0.5) / rows;
      const cols = 9;
      for (let c = 0; c < cols; c++) {
        const zz = ROOF_Z0 + (c + 0.5) * (depth / cols) + (r % 2 ? 0.14 : -0.14);
        if (zz > ROOF_Z1 - 0.05 || zz < ROOF_Z0 + 0.05) continue;
        const wz = depth / cols - 0.04;
        const tile = new THREE.BoxGeometry(len / rows + 0.16, 0.07, wz);
        tile.rotateZ(0.06 * s);
        tile.translate(s * len * u, 0.11, 0);
        tile.rotateZ(-ang * s).translate(0, RIDGE, zz);
        const n = lump(c * 0.7, r * 0.9, s, 3.1);
        const hex = n > 0.35 ? MOSS : (c + r) % 3 === 0 ? 0x8a7866 : SHINGLE;
        out.push(paint(tile, (x, y, z, col) => {
          col.setHex(hex);
          const k = 0.08 * lump(x * 3, y * 3, z * 3, 1.7);
          col.offsetHSL(0, 0, k);
        }));
      }
    }
  }
  // конёк — бревно, причелины на фронтоне
  out.push(log('z', ROOF_Z0 - 0.1, ROOF_Z1 + 0.1, RIDGE + 0.12, 0, 9));
  for (const s of [-1, 1]) {
    const b = new THREE.BoxGeometry(len + 0.25, 0.2, 0.1).translate((s * len) / 2, 0, 0);
    b.rotateZ(-ang * s).translate(0, RIDGE + 0.05, ROOF_Z1 + 0.02);
    out.push(colored(b, CREAM));
  }
  return out;
}

function chimneyGeo(): Geo[] {
  const out: Geo[] = [];
  const h0 = 3.0;
  const rows = 9;
  const hh = (CHIM.top - h0) / rows;
  for (let r = 0; r < rows; r++) {
    // камни кладкой: по два на ряд со сдвигом
    for (let k = 0; k < 2; k++) {
      const off = r % 2 ? 0.22 : -0.22;
      const x = CHIM.x + (k ? 0.24 : -0.24) + off * 0.3;
      const hex = (r + k) % 3 === 0 ? STONE_DK : STONE;
      out.push(paint(new THREE.BoxGeometry(0.5, hh - 0.03, 0.9 - (r % 2) * 0.04).translate(x, h0 + hh * (r + 0.5), CHIM.z), (xx, yy, zz, c) => {
        c.setHex(hex);
        c.offsetHSL(0, 0, 0.05 * lump(xx * 4, yy * 4, zz * 4, r));
      }));
    }
  }
  // шапка трубы и чёрное жерло
  out.push(box(1.12, 0.16, 1.08, CHIM.x, CHIM.top + 0.08, CHIM.z, STONE_DK));
  out.push(box(0.6, 0.02, 0.56, CHIM.x, CHIM.top + 0.17, CHIM.z, 0x1d1618));
  // сажа и варенье подтекает из трубы
  out.push(jamDrip(0.5, 0.07).translate(CHIM.x + 0.45, CHIM.top + 0.04, CHIM.z + 0.3));
  return out;
}

function frontGeo(): Geo[] {
  const out: Geo[] = [];
  // окна: наличники (кремовые, резные), подоконник, крест-переплёт, занавески
  for (const [a, b] of WINS) {
    const cx = (a + b) / 2;
    const w = b - a;
    const h = WIN_Y1 - WIN_Y0;
    const cy = (WIN_Y0 + WIN_Y1) / 2;
    out.push(box(w + 0.24, 0.12, 0.14, cx, WIN_Y0 - 0.05, D + 0.12, CREAM));
    out.push(box(w + 0.36, 0.1, 0.32, cx, WIN_Y0 - 0.13, D + 0.2, CREAM));
    out.push(box(0.12, h + 0.1, 0.14, a - 0.06, cy, D + 0.12, CREAM), box(0.12, h + 0.1, 0.14, b + 0.06, cy, D + 0.12, CREAM));
    out.push(box(0.07, h, 0.06, cx, cy, D + 0.06, 0x3d2b22), box(w, 0.07, 0.06, cx, cy + 0.05, D + 0.06, 0x3d2b22));
    // занавески по краям — сиреневые
    out.push(box(0.2, h, 0.04, a + 0.12, cy, D - 0.05, PURPLE_DK), box(0.2, h, 0.04, b - 0.12, cy, D - 0.05, PURPLE_DK));
    // варенье «слёзы» из-под окна
    out.push(jamDrip(0.38 + 0.1 * (cx > 0 ? 1 : 0), 0.06).translate(cx - 0.2, WIN_Y0 - 0.17, D + 0.33));
    out.push(jamDrip(0.22, 0.05).translate(cx + 0.25, WIN_Y0 - 0.17, D + 0.33));
  }
  // дверной проём: косяки с аркой, порог, тёмное нутро и белёная печь в глубине
  out.push(box(0.16, DOOR.y1 + 0.1, 0.2, DOOR.x0 - 0.08, DOOR.y1 / 2, D + 0.1, SHUTTER), box(0.16, DOOR.y1 + 0.1, 0.2, DOOR.x1 + 0.08, DOOR.y1 / 2, D + 0.1, SHUTTER));
  const arch = new THREE.TorusGeometry(0.7, 0.1, 4, 12, Math.PI).scale(1, 0.45, 1).translate(0, DOOR.y1, D + 0.12);
  out.push(colored(arch, SHUTTER));
  out.push(box(1.5, 0.08, 0.5, 0, 0.0, D + 0.2, SILL));
  out.push(box(DOOR.x1 - DOOR.x0, DOOR.y1, 0.04, 0, DOOR.y1 / 2, D - 0.75, 0x23181a));
  out.push(box(0.04, DOOR.y1, 0.75, DOOR.x0 + 0.01, DOOR.y1 / 2, D - 0.37, 0x33241f), box(0.04, DOOR.y1, 0.75, DOOR.x1 - 0.01, DOOR.y1 / 2, D - 0.37, 0x33241f));
  out.push(box(1.0, 1.25, 0.3, 0, 0.66, D - 0.62, 0xe9dfcf));
  out.push(colored(new THREE.CircleGeometry(0.32, 12).translate(0, 0.74, D - 0.465), 0x1a1214));
  // варенье: пятна на брёвнах фасада и потёки с порога
  const spots: Array<[number, number]> = [[-1.6, 0.9], [1.4, 1.35], [-0.95, 0.35], [1.9, 0.5]];
  spots.forEach(([x, y], i) => out.push(jamSpot(0.2 + 0.05 * (i % 2), [x, y, D + LOG_R - 0.02], [0, 0, 1], i)));
  out.push(jamDrip(0.55, 0.08).translate(0.45, -0.02, D + 0.42), jamDrip(0.3, 0.06).translate(-1.3, -0.4, D + 0.33));
  return out;
}

function platformGeo(): Geo[] {
  const out: Geo[] = [];
  // нижний венец-основание: толстые брусья крест-накрест, концы торчат
  out.push(box(2 * W + 0.7, 0.38, 2 * D + 0.4, 0, -0.2, 0, SILL));
  for (const x of [-W + 0.15, W - 0.15]) out.push(box(0.42, 0.42, 2 * D + 1.1, x, -0.35, 0, 0x4a3628));
  for (const z of [-D + 0.2, D - 0.2]) out.push(box(2 * W + 1.1, 0.36, 0.4, 0, -0.38, z, 0x4e3a2b));
  // мох у основания
  out.push(paint(new THREE.BoxGeometry(2 * W + 0.5, 0.08, 2 * D + 0.3).translate(0, 0.04, 0), (x, _y, z, c) => c.setHex(lump(x, 0, z, 2) > 0.1 ? MOSS : SILL)));
  // перья «юбкой» вокруг бёдер — сюда входят лапы
  for (const s of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = 0.62;
      const tuft = new THREE.ConeGeometry(0.26, 0.9, 5).rotateX(Math.PI).translate(0, -0.45, 0);
      tuft.rotateX(0.35 * Math.cos(a)).rotateZ(-0.35 * Math.sin(a));
      tuft.translate(s * HIP_X + r * Math.sin(a), HIP[1] - 0.05, HIP[2] + r * Math.cos(a));
      out.push(colored(tuft, i % 3 ? FEATHER : FEATHER_DK));
    }
  }
  return out;
}

/** Сети на правом скате и по правой стене, на краю — поплавки */
function netGeo(): Geo[] {
  const out: Geo[] = [];
  const dy = RIDGE - EAVE_Y;
  const onRoof = (u: number, z: number): V3 => [0.25 + u * (EAVE_X - 0.15), RIDGE + 0.28 - u * dy, z];
  const down = (v: number, z: number): V3 => [W + 0.42 + 0.04 * Math.sin(v * 4 + z), EAVE_Y - v * 1.9, z];
  const zs = [-1.6, -1.05, -0.5, 0.05, 0.6, 1.15];
  for (const z of zs) {
    const pts: V3[] = [];
    for (let k = 0; k <= 4; k++) pts.push(onRoof(k / 4, z + 0.05 * Math.sin(k)));
    for (let k = 1; k <= 4; k++) pts.push(down(k / 4, z + 0.08 * Math.sin(k + z)));
    out.push(colored(tube(pts, () => 0.03, 12, 3), NET));
  }
  for (let r = 0; r < 7; r++) {
    const pts: V3[] = [];
    const isRoof = r < 4;
    for (let k = 0; k <= 5; k++) {
      const z = -1.65 + (k / 5) * 2.85;
      pts.push(isRoof ? onRoof(0.12 + r * 0.26, z) : down(0.2 + (r - 4) * 0.33 + 0.05 * Math.sin(k * 2.1), z));
    }
    out.push(colored(tube(pts, () => 0.028, 10, 3), NET));
  }
  // поплавки: красные с белым поясом
  const floats: V3[] = [[W + 0.55, EAVE_Y - 2.0, -1.4], [W + 0.55, EAVE_Y - 2.05, 0.1], [W + 0.6, EAVE_Y - 1.95, 1.2], [-EAVE_X - 0.05, EAVE_Y - 0.55, ROOF_Z1 - 0.3]];
  floats.forEach(([x, y, z]) => {
    const f = new THREE.SphereGeometry(0.26, 10, 7).scale(1, 1.1, 1).translate(x, y, z);
    out.push(paint(f, (_x, yy, _z, c) => c.setHex(Math.abs(yy - y) < 0.07 ? 0xf6efe4 : yy > y ? 0xd8402e : 0xc23526)));
  });
  out.push(colored(tube([[-EAVE_X - 0.05, EAVE_Y - 0.05, ROOF_Z1 - 0.3], [-EAVE_X - 0.05, EAVE_Y - 0.3, ROOF_Z1 - 0.3]], () => 0.025, 2, 3), ROPE));
  return out;
}

/** Вяленая рыба на верёвке под левым свесом фасада (справа от двери, если смотреть на избу) */
function fishGeo(): Geo[] {
  const out: Geo[] = [];
  const a: V3 = [0.85, 1.95, D + 0.38];
  const b: V3 = [2.45, 1.75, D + 0.3];
  out.push(colored(tube([a, [1.65, 1.62, D + 0.4], b], () => 0.025, 8, 3), ROPE));
  for (let i = 0; i < 5; i++) {
    const u = (i + 0.5) / 5;
    const x = lerp(a[0], b[0], u);
    const y = lerp(a[1], b[1], u) - 0.18 * Math.sin(Math.PI * u) - 0.05;
    const z = D + 0.4;
    const fish = new THREE.SphereGeometry(1, 8, 6).scale(0.09, 0.27, 0.15).translate(0, -0.3, 0);
    const tail = new THREE.ConeGeometry(0.12, 0.16, 4).scale(0.4, 1, 1).translate(0, -0.6, 0);
    const g = merge([paint(fish, (_x, _y, zz, c) => c.setHex(zz > 0.04 ? 0xc9d2d4 : 0x8d9aa3)), colored(tail, 0x7d8a93)]);
    g.rotateZ(0.15 * (i % 2 ? 1 : -1)).translate(x, y, z);
    out.push(g);
  }
  return out;
}

/** Две бочки варенья, привязанные к левому боку */
function barrelsGeo(): Geo[] {
  const out: Geo[] = [];
  const prof: Array<[number, number]> = [[0.001, 0], [0.42, 0], [0.5, 0.3], [0.53, 0.55], [0.5, 0.8], [0.42, 1.1], [0.001, 1.1]];
  const at: V3[] = [[-W - 0.78, 1.55, 0.55], [-W - 0.8, 0.25, -0.5]];
  at.forEach(([x, y, z], i) => {
    const g = paint(lathe(prof, 10, 12), (_x, yy, _z, c) => {
      if (yy > 1.08) c.setHex(JAM);
      else if (Math.abs(yy - 0.15) < 0.05 || Math.abs(yy - 0.95) < 0.05 || Math.abs(yy - 0.55) < 0.04) c.setHex(IRON);
      else c.setHex(0x9a6a3e);
    });
    g.rotateZ(i ? 0.12 : -0.08).translate(x, y, z);
    out.push(g);
    out.push(jamDrip(0.45, 0.07).translate(x + 0.3, y + 1.05, z + 0.3), jamDrip(0.3, 0.06).translate(x - 0.25, y + 1.05, z + 0.32));
    out.push(colored(new THREE.TorusGeometry(0.56, 0.04, 3, 12).rotateX(Math.PI / 2).translate(x, y + 0.6, z), ROPE));
  });
  // верёвки к стене
  out.push(colored(tube([[-W - 0.2, 2.6, 1.1], [-W - 0.7, 2.25, 0.9], [-W - 0.9, 1.5, 0.6]], () => 0.03, 8, 3), ROPE));
  out.push(colored(tube([[-W - 0.2, 1.3, -1.3], [-W - 0.85, 0.9, -0.9], [-W - 1.0, 0.3, -0.5]], () => 0.03, 8, 3), ROPE));
  return out;
}

function poleGeo(): Geo[] {
  return [
    colored(new THREE.CylinderGeometry(0.06, 0.08, POLE_TOP, 6).translate(POLE[0], POLE[1] + POLE_TOP / 2, POLE[2]), 0x8a6a48),
    ball(0.1, 0xd9b26a, [POLE[0], POLE[1] + POLE_TOP + 0.05, POLE[2]], [1, 1, 1], 6, 4),
  ];
}

function bodyGeo(): Geo {
  return merge([...platformGeo(), ...wallsGeo(), ...roofGeo(), ...chimneyGeo(), ...frontGeo(), ...netGeo(), ...fishGeo(), ...barrelsGeo(), ...poleGeo()]);
}

/** Стёкла-глаза: сиреневое свечение за переплётом */
function eyesGeo(): Geo {
  const parts: Geo[] = [];
  for (const [a, b] of WINS) {
    const g = new THREE.PlaneGeometry(b - a - 0.04, WIN_Y1 - WIN_Y0 - 0.04).translate((a + b) / 2, (WIN_Y0 + WIN_Y1) / 2, D - 0.1);
    parts.push(paint(g, (_x, y, _z, c) => c.setHex(y > (WIN_Y0 + WIN_Y1) / 2 ? 0xb37cff : EYE)));
  }
  return merge(parts);
}

/** Ярость: в окнах — красные угли-зрачки */
function rageGeo(): Geo {
  const parts: Geo[] = [];
  for (const [a, b] of WINS) {
    const cx = (a + b) / 2 + (a < 0 ? 0.12 : -0.12);
    parts.push(colored(new THREE.CircleGeometry(0.2, 10).scale(1, 1.15, 1).translate(cx, (WIN_Y0 + WIN_Y1) / 2 - 0.03, D - 0.06), 0xff2a2a));
  }
  return merge(parts);
}

/** Ставень-веко: висит от петли вниз (0 — закрыто), доски, выцветшая красная краска */
function lidGeo(w: number): Geo {
  const h = WIN_Y1 - WIN_Y0 + 0.14;
  const parts: Geo[] = [];
  for (let k = 0; k < 3; k++) {
    const bw = w / 3;
    parts.push(paint(new THREE.BoxGeometry(bw - 0.02, h, 0.08).translate(-w / 2 + bw * (k + 0.5), -h / 2, 0.04), (x, y, z, c) => {
      c.setHex(SHUTTER);
      c.offsetHSL(0, -0.05 * k, 0.05 * lump(x * 5, y * 5, z, k));
    }));
  }
  parts.push(box(w, 0.08, 0.05, 0, -0.18, 0.1, 0x7a3329), box(w, 0.08, 0.05, 0, -h + 0.18, 0.1, 0x7a3329));
  parts.push(box(0.05, 0.12, 0.12, -w / 2 + 0.12, -0.04, 0.03, IRON), box(0.05, 0.12, 0.12, w / 2 - 0.12, -0.04, 0.03, IRON));
  return merge(parts);
}

/** Бровь-наличник: толстая резная доска над окном */
function browGeo(w: number): Geo {
  const b = new THREE.BoxGeometry(w + 0.35, 0.2, 0.2);
  const p = b.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setY(i, p.getY(i) + 0.08 * (1 - (x / ((w + 0.35) / 2)) ** 2));
  }
  b.computeVertexNormals();
  return merge([colored(b, 0x5a4030), box(0.18, 0.12, 0.08, 0, 0.1, 0.11, CREAM)]);
}

/** Дверь-рот: петли справа (+X), полотно влево, доски, железные полосы, кольцо */
function doorGeo(): Geo {
  const w = DOOR.x1 - DOOR.x0;
  const h = DOOR.y1 - DOOR.y0;
  const parts: Geo[] = [];
  for (let k = 0; k < 4; k++) {
    const bw = w / 4;
    parts.push(paint(new THREE.BoxGeometry(bw - 0.02, h, 0.1).translate(-bw * (k + 0.5), h / 2, 0), (x, y, z, c) => {
      c.setHex(DOOR_C);
      c.offsetHSL(0, 0, 0.04 * lump(x * 4, y * 3, z, k) + (k % 2 ? 0.02 : -0.02));
    }));
  }
  for (const y of [0.35, h - 0.4]) parts.push(box(w * 0.75, 0.1, 0.05, -w * 0.375 + 0.02, y, 0.07, IRON));
  parts.push(colored(new THREE.TorusGeometry(0.13, 0.03, 4, 10).translate(-w + 0.25, h * 0.48, 0.08), IRON));
  parts.push(jamSpot(0.16, [-w * 0.6, 0.25, 0.05], [0, 0, 1], 2));
  return merge(parts);
}

/** Верёвочная лестница под порогом — язык */
function ladderGeo(): Geo {
  const parts: Geo[] = [];
  const len = 2.3;
  for (const x of [-0.3, 0.3]) parts.push(colored(tube([[x, 0, 0], [x * 1.05, -len / 2, 0.04], [x, -len, 0]], () => 0.035, 6, 3), ROPE));
  for (let k = 1; k <= 6; k++) parts.push(box(0.7, 0.07, 0.1, 0, -k * (len / 6.3), 0.02, 0x8a6a48));
  return merge(parts);
}

/** Печь-сердце: голубой огонь (ядро открыто) */
function coreGeo(): Geo {
  const lo = new THREE.Color(CORE_LO);
  const hi = new THREE.Color(CORE_HI);
  const orb = paint(new THREE.SphereGeometry(0.42, 14, 10), (_x, y, z, c) => c.copy(lo).lerp(hi, clamp01(0.45 + y * 1.1 + z * 0.5)));
  const tongues: Geo[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    tongues.push(colored(new THREE.ConeGeometry(0.12, 0.5, 5).translate(0.28 * Math.sin(a), 0.42, 0.28 * Math.cos(a) * 0.5), 0x7af0ff));
  }
  return merge([orb, ...tongues]);
}

/** Тлеющая печь: оранжевые угли (видно, когда дверь приоткрыта) */
function emberGeo(): Geo {
  return merge([
    colored(new THREE.SphereGeometry(0.26, 10, 6).scale(1.2, 0.7, 0.6), EMBER),
    colored(new THREE.ConeGeometry(0.09, 0.3, 4).translate(-0.12, 0.2, 0), 0xffc061),
    colored(new THREE.ConeGeometry(0.08, 0.26, 4).translate(0.14, 0.18, 0), 0xffc061),
  ]);
}

/** Огонь в трубе — со 2-й фазы печь растоплена: оранжевые языки над жерлом */
function chimFireGeo(): Geo {
  const parts: Geo[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    parts.push(colored(new THREE.ConeGeometry(0.16, 0.7 - 0.12 * (i % 2), 5).translate(0.14 * Math.sin(a), 0.35, 0.14 * Math.cos(a)), i % 2 ? 0xffb347 : 0xff7a2a));
  }
  return merge(parts);
}

/** Вымпел: сиреневый треугольник с прорезью, крепится к шесту у левого края (x = 0), летит по +X */
function flagGeo(): Geo {
  const g = new THREE.BufferGeometry();
  const L = 1.8;
  const H = 0.6;
  const pos: number[] = [];
  const idx: number[] = [];
  const segs = 6;
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const half = (H / 2) * (1 - u * 0.85);
    pos.push(u * L, -half, 0, u * L, half, 0);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const p = g.toNonIndexed();
  // двусторонний: вторая сторона — копия с обратными треугольниками
  const back = p.clone();
  const bp = back.getAttribute('position');
  for (let i = 0; i < bp.count; i += 3) {
    const x = bp.getX(i + 1);
    const y = bp.getY(i + 1);
    const z = bp.getZ(i + 1);
    bp.setXYZ(i + 1, bp.getX(i + 2), bp.getY(i + 2), bp.getZ(i + 2));
    bp.setXYZ(i + 2, x, y, z);
  }
  back.computeVertexNormals();
  return merge([paint(p, (x, _y, _z, c) => c.setHex(x < 0.3 ? 0xb06ad8 : PURPLE)), paint(back, (x, _y, _z, c) => c.setHex(x < 0.3 ? 0xb06ad8 : PURPLE))]).translate(0, -0.35, 0);
}

// --- лапы

function thighGeo(): Geo {
  // «окорочок» в перьях: толстый вверху, к суставу сужается, внизу — бахрома перьев
  const prof: Array<[number, number]> = [[0.001, -L1 - 0.02], [0.3, -L1], [0.36, -2.4], [0.55, -1.9], [0.72, -1.2], [0.76, -0.4], [0.56, 0.1], [0.001, 0.15]];
  const body = paint(lathe(prof, 14, 12), (x, y, z, c) => {
    c.setHex(FEATHER);
    // перья чешуёй: тёмные «полосы» по рядам
    const row = Math.sin(y * 9 + Math.atan2(x, z) * 3);
    c.offsetHSL(0, 0, row > 0.6 ? -0.08 : 0);
  });
  const fringe: Geo[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const f = new THREE.ConeGeometry(0.14, 0.55, 4).rotateX(Math.PI).translate(0, -0.2, 0);
    f.rotateX(0.5 * Math.cos(a)).rotateZ(-0.5 * Math.sin(a)).translate(0.3 * Math.sin(a), -L1 + 0.35, 0.3 * Math.cos(a));
    fringe.push(colored(f, i % 2 ? FEATHER : FEATHER_DK));
  }
  return merge([body, ...fringe]);
}

function shinGeo(): Geo {
  // голень чешуйчатая, оранжевая, с поперечными щитками; сверху — шар сустава
  const g = paint(new THREE.CylinderGeometry(0.31, 0.25, L2, 10, 8, false).translate(0, -L2 / 2, 0), (_x, y, z, c) => {
    const band = Math.abs(((y * 4) % 1 + 1) % 1 - 0.5) < 0.08;
    c.setHex(band && z > -0.05 ? LEG_DK : LEG);
  });
  const joint = paint(new THREE.SphereGeometry(0.37, 10, 7), (_x, y, _z, c) => c.setHex(y > 0.12 ? FEATHER_DK : LEG));
  const heel = colored(new THREE.SphereGeometry(0.3, 8, 6).translate(0, -L2, 0), LEG);
  return merge([g, joint, heel]);
}

function footGeo(): Geo {
  // стопа чайки: три пальца вперёд веером, перепонки между ними, задний палец, тёмные когти; щиколотка — в нуле
  const parts: Geo[] = [];
  const sole = -ANKLE;
  const toeLen = 1.45;
  const angs = [-0.55, 0, 0.55];
  const tips: V3[] = [];
  for (const a of angs) {
    const dir: [number, number] = [Math.sin(a), Math.cos(a)];
    const len = a === 0 ? toeLen : toeLen * 0.88;
    const pts: V3[] = [];
    for (let k = 0; k <= 4; k++) {
      const u = k / 4;
      pts.push([dir[0] * len * u, sole + 0.12 + 0.12 * Math.sin(Math.PI * u) - 0.05 * u, dir[1] * len * u]);
    }
    parts.push(paint(tube(pts, (u) => 0.15 - 0.07 * u, 8, 6), (_x, y, _z, c) => c.setHex(y > sole + 0.2 ? LEG : LEG_DK)));
    const tip: V3 = [dir[0] * (len + 0.02), sole + 0.07, dir[1] * (len + 0.02)];
    tips.push(tip);
    const claw = new THREE.ConeGeometry(0.075, 0.3, 5).rotateX(Math.PI / 2 + 0.35);
    claw.rotateY(a).translate(tip[0] + dir[0] * 0.08, tip[1] - 0.02, tip[2] + dir[1] * 0.08);
    parts.push(colored(claw, CLAW));
  }
  // перепонки: две пластины между пальцами, с вырезом по краю
  const webs: number[] = [];
  const base: V3 = [0, sole + 0.12, 0.1];
  for (let i = 0; i < 2; i++) {
    const p = tips[i];
    const q = tips[i + 1];
    const mid: V3 = [(p[0] + q[0]) * 0.4, sole + 0.1, (p[2] + q[2]) * 0.4];
    webs.push(...base, ...p, ...mid, ...base, ...mid, ...q);
  }
  const web = new THREE.BufferGeometry();
  web.setAttribute('position', new THREE.Float32BufferAttribute(webs, 3));
  web.computeVertexNormals();
  const webTop = colored(web, 0xe97d32);
  const webBot = webTop.clone();
  webBot.translate(0, -0.035, 0);
  const bp = webBot.getAttribute('position');
  for (let i = 0; i < bp.count; i += 3) {
    const x = bp.getX(i + 1);
    const y = bp.getY(i + 1);
    const z = bp.getZ(i + 1);
    bp.setXYZ(i + 1, bp.getX(i + 2), bp.getY(i + 2), bp.getZ(i + 2));
    bp.setXYZ(i + 2, x, y, z);
  }
  webBot.computeVertexNormals();
  parts.push(webTop, webBot);
  // задний палец и пятка
  parts.push(colored(tube([[0, sole + 0.2, 0], [0, sole + 0.12, -0.25], [0, sole + 0.06, -0.48]], (u) => 0.11 - 0.05 * u, 4, 5), LEG));
  parts.push(colored(new THREE.ConeGeometry(0.06, 0.2, 4).rotateX(-Math.PI / 2 - 0.3).translate(0, sole + 0.05, -0.58), CLAW));
  parts.push(colored(new THREE.SphereGeometry(0.26, 9, 6).scale(1, 0.85, 1.1).translate(0, sole + 0.2, 0.02), LEG));
  return merge(parts);
}

// ------------------------------------------------------------ части

const BONES = ['body', 'eyes', 'rage', 'lidL', 'lidR', 'browL', 'browR', 'door', 'ladder', 'core', 'ember', 'chim', 'flag',
  'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'] as const;

function buildParts(): BossPart[] {
  const winW = WINS[0][1] - WINS[0][0] + 0.1;
  return [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'eyes', geo: eyesGeo(), glow: true },
    { bone: 'rage', geo: rageGeo(), glow: true },
    { bone: 'lidL', geo: lidGeo(winW) },
    { bone: 'lidR', geo: lidGeo(winW) },
    { bone: 'browL', geo: browGeo(winW) },
    { bone: 'browR', geo: browGeo(winW) },
    { bone: 'door', geo: doorGeo() },
    { bone: 'ladder', geo: ladderGeo() },
    { bone: 'core', geo: coreGeo(), glow: true },
    { bone: 'ember', geo: emberGeo(), glow: true },
    { bone: 'chim', geo: chimFireGeo(), glow: true },
    { bone: 'flag', geo: flagGeo() },
    { bone: 'thighL', geo: thighGeo() },
    { bone: 'thighR', geo: thighGeo() },
    { bone: 'shinL', geo: shinGeo() },
    { bone: 'shinR', geo: shinGeo() },
    { bone: 'footL', geo: footGeo() },
    { bone: 'footR', geo: footGeo() },
  ];
}

// ------------------------------------------------------------ клипы стенда

const CLIPS: BossClip[] = [
  { id: 'idle', name: 'Стоит', st: HS.WALK, dur: 0, speed: 0, note: 'Дышит дверью, моргает ставнями, переминается и иногда скребёт землю лапой, как курица.' },
  { id: 'walk', name: 'Идёт', st: HS.WALK, dur: 0, speed: 1.8, note: 'Тяжёлый шаг птицы: колено назад, стопа стоит на месте, изба переваливается с лапы на лапу, лестница-язык болтается.' },
  { id: 'appear', name: 'Появление', st: HS.APPEAR, dur: 3.4, note: 'Сидела на берегу, как наседка: открывает ставни, зевает дверью, встряхивается и встаёт на лапы.' },
  { id: 'kick', name: 'Пинок по стене', st: HS.KICK, dur: 3.0, hits: [HUT_WARN], mark: 'wall', phase: 1,
    note: 'Готовит 1,8 с: переносит вес, заносит лапу назад и дважды скребёт землю. Участок стены под меткой — пробит. Уйди с участка.' },
  { id: 'bombs', name: 'Печные бомбы', st: HS.BOMBS, dur: 3.2, hits: [1.8, 2.15, 2.5], mark: 'walk', phase: 1,
    note: 'Приседает и раздувается, окна выпучены — три бочки из трубы по ходу стены (со 2-й фазы — пять). Метки на ходу стены — уйди.' },
  { id: 'open', name: 'Ядро открыто', st: HS.OPEN, dur: 3.0, phase: 1,
    note: 'После пинка и топота: дверь настежь, в печи голубой огонь — 3 с бей в дверь, урон ×3.' },
  { id: 'phase2', name: 'Фаза 2: растопила печь', st: HS.PHASE, dur: 2.6, stage: 2, phase: 2,
    note: 'На 66 % здоровья: трясётся, дверь хлопает, из трубы — огонь и дым. Бомб теперь пять, добавляется топот.' },
  { id: 'stomp', name: 'Топот', st: HS.STOMP, dur: 3.4, hits: [2.3], mark: 'ring', stage: 2, phase: 2,
    note: 'Глубоко приседает и дрожит — прыжок, волна по земле и по стене: всех со стены сбивает, ворота трещат. Прыгни в момент удара.' },
  { id: 'phase3', name: 'Фаза 3: ярость', st: HS.PHASE, dur: 2.6, stage: 3, rage: true, phase: 3,
    note: 'На 33 %: в окнах красные угли, брови злые, ходит быстрее.' },
  { id: 'nest', name: 'Наседка', st: HS.NEST, dur: 9.0, hits: [2.6, 3.7, 5.1, 6.5], mark: 'wall', stage: 3, rage: true, phase: 3,
    note: 'Ворочается 1,8 с — прыгает на стену, садится и ломает участок. Сидит 5 с с открытой дверью (голубая печь — бей!) и несёт три бочки-яйца во двор.' },
  { id: 'hit', name: 'Получил удар', phase: 4, st: HS.WALK, dur: 1.2, speed: 0, note: 'Вздрагивает, ставни захлопываются, дверь дребезжит, вспышка.' },
  { id: 'die', name: 'Гибель', phase: 4, st: HS.WALK, dur: 4.0, die: true, note: 'Лапы подгибаются, изба валится на спину, лапы кверху дёргаются, вымпел падает — и уходит в песок.' },
];

// ------------------------------------------------------------ поза

const B = new THREE.Matrix4();
const M = new THREE.Matrix4();
const hipL = new THREE.Vector3();
const hipR = new THREE.Vector3();
const ankL = new THREE.Vector3();
const ankR = new THREE.Vector3();
const knee = new THREE.Vector3();
const BEND = new THREE.Vector3(0, 0, -1);
const bend = new THREE.Vector3();
const _v = new THREE.Vector3();

interface Foot { x: number; y: number; z: number; pitch: number }
const fL: Foot = { x: 0, y: 0, z: 0, pitch: 0 };
const fR: Foot = { x: 0, y: 0, z: 0, pitch: 0 };

/** Лапа по фазе шага u (0…1): опора — едет назад по земле, перенос — дугой вперёд */
function stepFoot(f: Foot, u: number, side: number, walk: number): void {
  const A = STANCE * CYCLE;
  let z: number;
  let y = 0;
  let pitch = 0;
  if (u < STANCE) {
    z = A / 2 - A * (u / STANCE);
  } else {
    const w = (u - STANCE) / (1 - STANCE);
    z = -A / 2 + A * (w * w * (3 - 2 * w));
    y = LIFT * Math.sin(Math.PI * w);
    pitch = 0.55 * Math.sin(Math.PI * w) - 0.25 * win(0, 0.15, 0.2, 0.4, w);
  }
  f.x = side * FOOT_X;
  f.z = lerp(side > 0 ? 0.15 : -0.15, z, walk);
  f.y = y * walk;
  f.pitch = pitch * walk;
}

export const HUT: BossDef = {
  id: 'boss-hut',
  name: 'Избушка',
  height: 11.4,
  bones: BONES,
  parts: buildParts(),
  clips: CLIPS,
  pose(a, out) {
    const t = a.t;
    const T = a.stT;
    const st = a.st;
    const seed = a.seed;
    const stage = a.stage ?? 1;
    const sp = Math.abs(a.speed);
    const walk = st === HS.WALK ? clamp01(sp / 1.0) : 0;
    const path = a.path ?? a.gait * 1.25;
    const ph = (((path / CYCLE) % 1) + 1) % 1;

    // корпус: подъём, наклон вперёд (rx), поворот (ry), крен (rz), раздувание
    let px = 0;
    let py = 0;
    let pz = 0;
    let lean = 0;
    let twist = 0;
    let roll = 0;
    let sx = 1;
    let sy = 1;
    // лицо: веки (0 — открыты, 1 — закрыты), злость бровей, подъём бровей, дверь (рад), лестница
    let lid = 0.12;
    let angry = 0.12;
    let browUp = 0;
    let door = 0.05 + 0.04 * Math.sin(t * 1.3 + seed * 3);
    let ladder = 0.06 * Math.sin(t * 1.1);
    let eyeS = 1;
    let core = 0;
    let ember = 0;
    let flagK = 1;

    // лапы по шагу; позы атак правят их дальше
    stepFoot(fL, ph, 1, walk);
    stepFoot(fR, (ph + 0.5) % 1, -1, walk);

    if (st === HS.WALK) {
      const bob = Math.cos(2 * Math.PI * (2 * ph - 0.6));
      py = walk * (0.16 * bob - 0.06);
      roll = -0.065 * walk * Math.sin(2 * Math.PI * (ph - 0.05));
      twist = 0.05 * walk * Math.sin(2 * Math.PI * ph);
      lean = 0.045 * walk;
      door += 0.1 * walk * (0.5 + 0.5 * Math.sin(4 * Math.PI * ph));
      ladder += 0.22 * walk * Math.sin(2 * Math.PI * 2 * ph - 1.2);
      lid += 0.06 * walk * (0.5 + 0.5 * Math.cos(4 * Math.PI * ph));
      // на месте: дышит, переминается, раз в ~9 с скребёт землю правой лапой
      const idle = 1 - walk;
      sy += 0.014 * idle * Math.sin(t * 1.3 + seed * 5);
      roll += 0.02 * idle * Math.sin(t * 0.55 + seed * 2);
      const sc = (t + seed * 7) % 9;
      const scratch = idle * win(0, 0.3, 1.5, 1.8, sc);
      if (scratch > 0) {
        fR.y += 0.45 * scratch * Math.max(0, Math.sin(sc * 7));
        fR.z += scratch * (0.4 - 0.9 * smooth(0.2, 1.4, sc) + 0.25 * Math.sin(sc * 7));
        fR.pitch += 0.4 * scratch;
        roll -= 0.04 * scratch;
        lean -= 0.03 * scratch;
      }
    } else if (st === HS.APPEAR) {
      // сидит наседкой → открывает ставни → зевает дверью → встряхивается → встаёт → подскок
      const rise = smooth(1.5, 2.7, T);
      py = lerp(-BODY_Y + 1.35, 0, rise) + 0.35 * win(2.7, 2.9, 2.95, 3.25, T);
      lid = lerp(1, 0.12, smooth(0.3, 0.9, T));
      door = 0.05 + 0.9 * win(0.7, 1.0, 1.2, 1.5, T);
      const shake = win(1.15, 1.25, 1.45, 1.55, T);
      roll += 0.05 * shake * Math.sin(T * 40);
      px += 0.06 * shake * Math.sin(T * 33);
      lean = lerp(0.08, 0, rise) - 0.05 * win(2.6, 2.8, 2.9, 3.2, T);
      sy = 1 - 0.06 * win(2.55, 2.7, 2.75, 2.95, T) + 0.03 * win(2.75, 2.9, 3.0, 3.2, T);
      ladder = -1.2 * (1 - rise);
      fL.z = fR.z = lerp(0.6, 0.15, rise);
      flagK = 0.3 + 0.7 * rise;
    } else if (st === HS.KICK) {
      // вес на левую лапу, правая — назад, дважды скребёт; удар — вперёд-вверх к краю стены
      const W1 = HUT_WARN;
      const load = smooth(0, 0.45, T) * (1 - smooth(2.3, 2.9, T));
      roll = -0.08 * load;
      px = 0.35 * load;
      lean = keys(T, [[0, 0], [0.45, -0.06], [1.5, -0.12], [W1, -0.14], [W1 + 0.12, 0.18], [2.3, 0.12], [3.0, 0]]);
      py = keys(T, [[0, 0], [0.45, -0.15], [W1, -0.25], [W1 + 0.1, 0.1], [2.4, 0], [3.0, 0]]);
      const scr = win(0.5, 0.6, 1.25, 1.35, T) * Math.max(0, Math.sin((T - 0.5) * 7.5));
      fR.z = keys(T, [[0, fR.z], [0.45, -0.9], [1.4, -1.6], [W1, -2.3], [W1 + 0.12, 4.0], [2.2, 3.6], [3.0, -0.15]]) + 0.5 * scr;
      fR.y = keys(T, [[0, 0], [0.45, 0.8], [1.4, 1.0], [W1, 1.7], [W1 + 0.12, 3.9], [2.2, 3.6], [2.7, 0.6], [3.0, 0]]) - 0.6 * scr;
      fR.pitch = keys(T, [[0, 0], [0.45, 0.5], [W1, 0.9], [W1 + 0.12, -0.5], [2.3, -0.3], [3.0, 0]]);
      fL.z = 0.25;
      fL.y = 0;
      lid = keys(T, [[0, 0.12], [0.4, 0.5], [W1, 0.55], [W1 + 0.05, 0], [2.4, 0.05], [3.0, 0.12]]);
      angry = keys(T, [[0, 0.12], [0.4, 0.45], [W1, 0.5], [2.6, 0.3], [3.0, 0.12]]);
      door = keys(T, [[0, 0.05], [0.4, 0], [W1, 0], [W1 + 0.06, 1.1], [2.2, 0.9], [3.0, 0.05]]);
      ember = win(W1, W1 + 0.08, 2.3, 2.8, T);
      ladder = keys(T, [[0, 0], [W1, -0.3], [W1 + 0.15, 0.7], [2.6, -0.2], [3.0, 0]]);
    } else if (st === HS.BOMBS) {
      // присела и раздувается, трясётся; три выстрела из трубы — рывок вверх и хлопок двери
      const W1 = HUT_WARN;
      const squat = smooth(0, 0.6, T) * (1 - smooth(2.6, 3.1, T));
      const swell = smooth(0.3, W1, T) * (1 - smooth(1.8, 2.7, T));
      py = -0.7 * squat;
      sx = 1 + 0.07 * swell;
      sy = 1 - 0.05 * swell;
      const shake = smooth(0.6, W1, T) * (T < W1 ? 1 : 0);
      px += 0.05 * shake * jitter(t, seed);
      roll += 0.02 * shake * jitter(t + 3, seed);
      let kick = 0;
      for (const s of stage >= 2 ? BOMBS2 : BOMBS1) kick += Math.max(0, 1 - Math.abs(T - s - 0.05) / (stage >= 2 ? 0.08 : 0.12));
      py += 0.38 * kick;
      sy += 0.08 * kick;
      lean = -0.06 * swell - 0.06 * kick;
      lid = lerp(0.12, -0.1, swell);
      eyeS = 1 + 0.18 * swell;
      angry = 0.3;
      browUp = 0.12 * swell;
      door = 0.02 + 0.5 * kick;
      ember = clamp01(kick);
      fL.z = 0.35;
      fR.z = -0.35;
      ladder = -0.4 * squat + 0.5 * kick;
    } else if (st === HS.STOMP) {
      // глубокий присед и дрожь → прыжок обеими → удар → покачивается
      const W1 = HUT_WARN;
      const crouch = smooth(0, 1.2, T);
      const air = T > W1 && T < 2.3 ? Math.sin(Math.PI * (T - W1) / 0.5) : 0;
      const land = wobble(T - 2.3, 14, 4.5);
      py = T < W1 ? -1.35 * crouch : T < 2.3 ? lerp(-1.35, 0, smooth(W1, W1 + 0.15, T)) + 2.2 * air : -0.45 * Math.max(0, land) * (T < 2.6 ? 1 : 1) - 0.4 * (1 - smooth(2.3, 3.2, T));
      const shake = smooth(0.8, W1, T) * (T < W1 ? 1 : 0);
      px += 0.07 * shake * jitter(t, seed);
      roll += 0.03 * shake * jitter(t + 2, seed);
      sy = T < W1 ? 1 - 0.04 * crouch : T < 2.3 ? 1.05 : 1 - 0.1 * Math.max(0, land);
      sx = 1 + (1 - sy) * 0.6;
      lean = T < W1 ? 0.05 * crouch : T < 2.3 ? -0.08 : 0.06 * land;
      // лапы в прыжке поджаты вместе с корпусом
      const lift = T > W1 && T < 2.3 ? 2.2 * air * 0.85 : 0;
      fL.y = fR.y = lift;
      fL.z = 0.3;
      fR.z = -0.3;
      fL.pitch = fR.pitch = 0.5 * air;
      lid = T < W1 ? 0.6 * crouch : T < 2.3 ? 0 : 0.9 * win(2.3, 2.35, 2.45, 2.7, T);
      angry = 0.55;
      door = T < 2.3 ? 0 : 0.8 * win(2.3, 2.35, 2.5, 3.0, T);
      ladder = T < 2.3 ? -0.5 * air : 0.8 * land;
    } else if (st === HS.OPEN) {
      // оглушена: дверь настежь, голубая печь бьётся, веки полуприкрыты, качается
      core = win(0.1, 0.45, 2.55, 2.95, T);
      door = lerp(0.05, 1.85, smooth(0, 0.35, T) * (1 - smooth(2.6, 3.0, T)));
      lid = lerp(0.12, 0.6, core) + 0.15 * Math.sin(T * 2.4) * core;
      browUp = 0.15 * core;
      angry = lerp(0.12, -0.15, core);
      py = -0.35 * core;
      roll = 0.04 * Math.sin(T * 2.1) * core;
      lean = 0.05 * core;
      sy = 1 - 0.03 * core * (0.5 + 0.5 * Math.sin(T * 6));
      ladder = 0.25 * Math.sin(T * 2.1) * core;
      fL.z = 0.35;
      fR.z = -0.2;
    } else if (st === HS.PHASE) {
      // трясётся, дверь хлопает трижды, ставни трепещут, растёт ввысь — и злой прищур
      const shake = win(0, 0.15, 1.6, 2.0, T);
      px += 0.09 * shake * jitter(t, seed);
      pz += 0.05 * shake * jitter(t + 1.7, seed);
      roll += 0.04 * shake * jitter(t + 5, seed);
      door = 0.9 * shake * Math.max(0, Math.sin(T * 11));
      lid = shake > 0 ? 0.5 + 0.5 * Math.sin(T * 23) : 0.4;
      const tall = win(1.6, 1.9, 2.1, 2.5, T);
      sy = 1 + 0.08 * tall;
      py = 0.3 * tall;
      lean = -0.08 * tall;
      angry = lerp(0.2, 0.55, smooth(1.8, 2.4, T));
      ember = shake;
      ladder = 0.6 * shake * Math.sin(T * 9);
    } else if (st === HS.NEST) {
      // ворочается → прыжок на стену → садится (лапы поджаты) → несёт бочки → встаёт и спрыгивает назад
      const W1 = HUT_WARN;
      const jumpIn = smooth(W1, 2.6, T);
      const jumpOut = smooth(7.8, 8.7, T);
      const onWall = jumpIn * (1 - jumpOut);
      const arc = Math.sin(Math.PI * clamp01((T - W1) / 0.8)) * (T < 2.6 ? 1 : 0) + Math.sin(Math.PI * clamp01((T - 7.8) / 0.9)) * (T > 7.8 ? 1 : 0);
      pz = NEST_DZ * onWall;
      const sit = win(2.6, 2.9, 7.4, 7.8, T);
      py = NEST_DY * onWall + 2.2 * arc - 3.9 * sit;
      const wig = T < W1 ? smooth(0, 0.4, T) : 0;
      roll += 0.06 * wig * Math.sin(T * 9);
      twist += 0.08 * wig * Math.sin(T * 4.5);
      py += -0.4 * wig;
      // несёт: приподнимается и тужится
      let lay = 0;
      for (const s of [3.7, 5.1, 6.5]) lay += win(s - 0.5, s - 0.1, s, s + 0.25, T);
      py += 0.35 * lay;
      sy *= 1 - 0.06 * lay;
      sx *= 1 + 0.04 * lay;
      lid = T < W1 ? 0.5 : T < 2.6 ? 0 : 0.3 + 0.4 * lay;
      angry = 0.6;
      door = sit > 0 ? lerp(0.1, 1.7, sit) : 0.1;
      core = sit;
      ember = 0;
      ladder = -0.8 * arc + 0.3 * sit * Math.sin(T * 2);
      // лапы: на стене поджаты под избу
      fL.z = 0.3 + pz;
      fR.z = -0.1 + pz;
      fL.y = fR.y = NEST_DY * onWall + 1.8 * arc;
      fL.pitch = fR.pitch = 0.6 * arc + 0.3 * sit;
      flagK = 1 + sit;
    }

    // моргает (кроме атак, где веко ведёт поза)
    if (st === HS.WALK || st === HS.OPEN) {
      const bl = (t + seed * 5) % 4.3;
      lid = Math.max(lid, win(0, 0.06, 0.1, 0.18, bl));
    }
    // ярость: прищур, злые брови, дрожь
    const rage = a.rage && a.die <= 0;
    if (rage) {
      angry = Math.max(angry, 0.6);
      lid = Math.max(lid, 0.3);
      px += 0.025 * jitter(t * 0.7, seed + 4);
    }
    // удар: вздрогнула, ставни хлопнули, дверь дребезжит
    const hit = a.hit;
    if (hit > 0) {
      lean -= 0.06 * hit;
      px += 0.08 * hit * Math.sin(t * 55);
      lid = Math.max(lid, hit);
      door += 0.25 * hit * Math.abs(Math.sin(t * 40));
      sy -= 0.03 * hit;
    }

    // гибель: лапы подгибаются, валится на спину, лапы кверху дёргаются, уходит в песок
    const d = a.die;
    let legsUp = 0;
    let sink = 0;
    if (d > 0) {
      const buckle = smooth(0.05, 0.3, d);
      const fall = smooth(0.25, 0.55, d);
      legsUp = smooth(0.45, 0.62, d);
      sink = smooth(0.8, 1, d);
      px = 0.08 * (1 - buckle) * jitter(t, seed);
      py = lerp(0, -BODY_Y + 2.3, buckle) - 0.3 * wobble(d - 0.55, 40, 12) * (d > 0.55 ? 1 : 0);
      lean = lerp(0, -1.75, fall);
      roll = 0.12 * fall;
      twist = 0;
      lid = lerp(0.3, 1, smooth(0.1, 0.4, d));
      door = lerp(0.3, 1.4, smooth(0.25, 0.4, d));
      angry = -0.2;
      browUp = 0.2;
      ladder = lerp(0, -1.3, fall);
      flagK = 1 - smooth(0.5, 0.8, d);
      sy = 1;
      sx = 1;
    }

    // --- корпус
    composeInto(B, px, BODY_Y + py - sink * 4.2, pz, lean, twist, roll, sx, sy, sx);
    out.body.copy(B);
    // окна, угли ярости
    const eyePivot = (WIN_Y0 + WIN_Y1) / 2;
    composeInto(M, 0, eyePivot, D - 0.1, 0, 0, 0, eyeS, eyeS, 1);
    M.multiplyMatrices(B, M);
    out.eyes.copy(M);
    M.multiply(_t.makeTranslation(0, -eyePivot, -(D - 0.1)));
    out.eyes.copy(M);
    const rs = rage ? 1 + 0.15 * Math.sin(t * 9) : HIDE;
    composeInto(M, 0, 0, 0, 0, 0, 0, rs, rs, 1);
    out.rage.multiplyMatrices(out.eyes, M);
    if (!rage) out.rage.copy(B).multiply(_t.makeScale(HIDE, HIDE, HIDE));
    // веки и брови (L — окно со стороны +X)
    const lidOpen = -1.32;
    const lidA = lerp(lidOpen, 0, clamp01(lid));
    for (const [k, s] of [[1, 'L'], [0, 'R']] as const) {
      const [a0, b0] = WINS[k];
      const cx = (a0 + b0) / 2;
      const sgn = Math.sign(cx);
      composeInto(M, cx, WIN_Y1 + 0.1, D + 0.18, lidA, 0, 0);
      out[`lid${s}`].multiplyMatrices(B, M);
      const tilt = sgn * angry * 0.45;
      composeInto(M, cx, WIN_Y1 + 0.24 + 0.12 * browUp - 0.1 * clamp01(angry) - 0.05 * clamp01(lid), D + 0.26, 0, 0, tilt);
      out[`brow${s}`].multiplyMatrices(B, M);
    }
    // дверь-рот на петлях справа, лестница-язык под порогом
    composeInto(M, DOOR.x1, DOOR.y0, D + 0.05, 0, Math.max(0, door), 0);
    out.door.multiplyMatrices(B, M);
    composeInto(M, 0, -0.05, D + 0.32, ladder, 0, 0.05 * Math.sin(t * 0.9));
    out.ladder.multiplyMatrices(B, M);
    // печь: голубое ядро и угли
    const beat = heartbeat(t, 0.8);
    const cs = core > 0 ? lerp(0.4, 1.15, core) * (1 + 0.18 * beat * core) : HIDE;
    composeInto(M, 0, 0.78, D - 0.4 + 0.25 * core, 0, t * 1.4, 0, cs);
    out.core.multiplyMatrices(B, M);
    const es = ember > 0.01 && core < 0.5 ? 0.6 + 0.6 * ember + 0.1 * Math.sin(t * 17) : HIDE;
    composeInto(M, 0, 0.7, D - 0.45, 0, 0, 0, es);
    out.ember.multiplyMatrices(B, M);
    // огонь в трубе: со 2-й фазы
    const fire = stage >= 2 && d <= 0 ? 0.8 + 0.25 * Math.sin(t * 13) + 0.15 * Math.sin(t * 7.3) + (st === HS.BOMBS ? 0.5 * win(1.8, 1.85, 2.5, 2.8, T) : 0) : HIDE;
    composeInto(M, CHIM.x, CHIM.top + 0.18, CHIM.z, 0, t * 2, 0, fire, fire * (rage ? 1.4 : 1), fire);
    out.chim.multiplyMatrices(B, M);
    // вымпел полощется
    const wave = 0.35 * Math.sin(t * 5.2 + seed) + 0.12 * Math.sin(t * 11.7);
    const fk = Math.max(HIDE, flagK > 1 ? 1 : flagK);
    composeInto(M, POLE[0], POLE[1] + POLE_TOP - 0.02, POLE[2], 0, 2.4 + wave * flagK, 0.12 * Math.sin(t * 3.1), 1, fk, 1);
    out.flag.multiplyMatrices(B, M);

    // --- лапы: бёдра — от корпуса, щиколотки — по шагу (в мире корня), колено назад
    apply(B, HIP[0], HIP[1], HIP[2], hipL);
    apply(B, -HIP[0], HIP[1], HIP[2], hipR);
    if (legsUp > 0) {
      // на спине: лапы кверху (в осях избы — вниз, т. е. к небу), дёргаются
      const tw = 1 - smooth(0.75, 0.85, d);
      apply(B, HIP[0] + 0.3, HIP[1] - 4.3, HIP[2] + 0.6 + 0.4 * Math.sin(t * 13) * tw, _v);
      ankL.lerpVectors(_ft.set(fL.x, ANKLE, fL.z), _v, legsUp);
      apply(B, -HIP[0] - 0.3, HIP[1] - 4.2, HIP[2] + 0.5 + 0.4 * Math.sin(t * 11 + 1) * tw, _v);
      ankR.lerpVectors(_ft.set(fR.x, ANKLE, fR.z), _v, legsUp);
      bend.set(0, 0, -1).lerp(_v.set(0, 1, 0), legsUp).normalize();
    } else {
      ankL.set(fL.x, ANKLE + fL.y, fL.z);
      ankR.set(fR.x, ANKLE + fR.y, fR.z);
      bend.copy(BEND);
    }
    legIK(out.thighL, out.shinL, hipL, ankL, L1, L2, bend, knee);
    legIK(out.thighR, out.shinR, hipR, ankR, L1, L2, bend, knee);
    // стопы: на земле — ровно (поворот корпуса вокруг вертикали — частично), в переносе — пальцы вниз
    const footYaw = 0.5 * twist;
    if (legsUp > 0) {
      composeInto(M, 0, 0, 0, lean + 1.0 * legsUp, footYaw, roll, 1);
      M.setPosition(ankL);
      out.footL.copy(M);
      M.setPosition(ankR);
      out.footR.copy(M);
    } else {
      composeInto(out.footL, ankL.x, ankL.y, ankL.z, fL.pitch, footYaw + 0.08, 0);
      composeInto(out.footR, ankR.x, ankR.y, ankR.z, fR.pitch, footYaw - 0.08, 0);
    }
    if (sink > 0) {
      const k = sink * 4.2;
      for (const b of ['thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'] as const) out[b].elements[13] -= k;
    }
  },
};

const _t = new THREE.Matrix4();
const _ft = new THREE.Vector3();

/** Точки для эффектов стенда (в осях корня, без позы): жерло трубы, дверь, лапы */
export const HUT_POINTS = {
  chimney: [CHIM.x, BODY_Y + CHIM.top + 0.3, CHIM.z] as V3,
  door: [0, BODY_Y + 0.8, D + 0.4] as V3,
  /** Куда бьёт пинок (корень → вперёд) */
  kick: [-FOOT_X, 3.9, 4.0] as V3,
};
