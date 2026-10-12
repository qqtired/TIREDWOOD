// Барон Варенья (Z_BOSS) — главный босс войска: огромная фиолетовая желейка в короне набекрень, с усами и моноклем,
// в красной мантии с горностаем. В правой руке — половник-скипетр, на пузе — банка варенья, левая рука держит на ней
// крышку. Ходит подскоками (желе без ног). Атаки: шлепок половником по воротам, раскрутка половника и бросок варенья
// по людям, прыжок с плюхом (волна по стене). После удара — «ядро открыто»: рука снимает крышку, из банки поднимается
// светящееся ядро и бьётся, как сердце. Ярость — пар из-под короны, красные зрачки, злые брови, «жилка», дрожь.
// Гибель — тает в лужу варенья, ядро вылетает вверх. Шесть частей: тело, две руки, глаза, ядро, ярость.
import * as THREE from 'three';
import { TICK_RATE } from '../../../shared/constants.ts';
import { BOSS_OPEN_TICKS, BOSS_WARN_TICKS, ZS_ATTACK, ZS_BOSS_BOMB, ZS_BOSS_GATE, ZS_BOSS_OPEN, ZS_BOSS_PULSE, Z_BOSS } from '../../../shared/fort.ts';
import { colored, merge, type MobDef, type MobPart } from './kit.ts';
import {
  HIDE, JAM, JAM_HI, attach, ball, byHeight, clamp01, composeInto, heartbeat, jamDrip, jamSpot, keys, lathe, lerp, orient, paint,
  profileR, smooth, steamPuff, tube, win, wobble, type Geo, type V3,
} from './set-d-shapes.ts';

/** Замах любой атаки и «ядро открыто» — секунды (как на сервере) */
const WARN = BOSS_WARN_TICKS / TICK_RATE;
const OPEN = BOSS_OPEN_TICKS / TICK_RATE;

// ------------------------------------------------------------ размеры (метры, корень — между ног, лицом в +Z)

/** Профиль желейки (r, y) — как у игроков, только втрое больше */
const PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0.001, 0], [1.0, 0.0], [1.42, 0.2], [1.64, 0.7], [1.7, 1.5], [1.65, 2.4], [1.5, 3.25], [1.24, 4.0], [0.86, 4.65],
  [0.42, 5.1], [0.001, 5.3],
];
const PTS = 18;
const R = profileR(PROFILE, PTS);
/** Банка на пузе: низ, высота, ось (z), радиус */
const JAR = { y0: 0.72, h: 1.68, z: 1.22, r: 0.7 } as const;
const JAR_TOP = JAR.y0 + JAR.h;
/** Глаза: высота, разнос, середина между ними (кость глаз и «ярости») */
const EYE_Y = 4.33;
const EYE_X = 0.4;
const EC: V3 = [0, EYE_Y, Math.sqrt(R(EYE_Y) ** 2 - EYE_X * EYE_X) + 0.03];
/** Плечи: правое (половник) — −X, левое (крышка) — +X; рука до середины кулака */
const SR: V3 = [-1.42, 2.95, 0.12];
const ARM = 1.25;
/** Хват половника: угол ручки к руке (рука висит — ручка смотрит вперёд-вниз) */
const GRIP = -0.5;
/** Рука со скипетром-половником поднята так, что ручка стоит почти вертикально */
const CARRY = GRIP - Math.PI / 2 - 0.12;
const SL: V3 = [1.42, 2.95, 0.12];
/** Ядро: спрятано в банке и вышло наружу */
const CORE_IN: V3 = [0, JAR.y0 + 0.62, JAR.z];
const CORE_OUT: V3 = [0, 2.92, 1.62];

const PURPLE = 0x7a4cc4;
const GLOVE = 0xf7f2e6;
const GOLD = 0xf1bd45;
const GOLD_DARK = 0xc98f27;
const RED = 0xc02c3d;
/** Светящиеся глаза: насыщенный сиреневый (свечение кита высветляет его до бледно-сиреневого) */
const EYE = 0x9a50f0;
const WOOD = 0x8a5a34;

// ------------------------------------------------------------ геометрия

/** Точка на поверхности тела: азимут (0 — вперёд, + к его левой руке, +X), высота, отступ наружу */
function onBody(phi: number, y: number, out = 0): V3 {
  const r = R(y) + out;
  return [r * Math.sin(phi), y, r * Math.cos(phi)];
}
/** Нормаль тела в той же точке (по наклону профиля) */
function bodyNormal(phi: number, y: number): V3 {
  const dr = (R(y + 0.05) - R(y - 0.05)) / 0.1;
  return [Math.sin(phi), -dr, Math.cos(phi)];
}

function cosFall(u: number): number {
  return u >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * u);
}

function bodyGeo(): Geo {
  // желе: тело вращения со швом на спине и вмятиной-гнездом под банку
  let g: Geo = lathe(PROFILE, PTS, 26, Math.PI);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const w = cosFall(Math.abs(x) / 0.85) * cosFall(Math.abs(y - 1.7) / 1.05);
    const zt = JAR.z - 0.05;
    if (z > zt && w > 0) p.setZ(i, zt + (z - zt) * (1 - 0.8 * w));
  }
  g = mergeVerticesSafe(g);
  g.computeVertexNormals();
  return byHeight(g, [[0, 0x4a2780], [1.2, 0x633aa8], [3.0, 0x7a4cc4], [4.5, 0x9064d8], [5.3, 0xa477e4]]);
}

function mergeVerticesSafe(g: Geo): Geo {
  // склеить шов (у Lathe первый и последний столбец совпадают) — без шва нормали гладкие
  const pos = g.getAttribute('position');
  const map = new Map<string, number>();
  const remap: number[] = [];
  const unique: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let j = map.get(key);
    if (j === undefined) {
      j = unique.length / 3;
      map.set(key, j);
      unique.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    remap.push(j);
  }
  const index = g.index ? Array.from(g.index.array, (i) => remap[i]) : remap;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(unique, 3));
  out.setIndex(index);
  return out;
}

function mantleGeo(): Geo[] {
  // мантия по спине: внизу расходится складками, по краям и подолу — золотая кайма; спереди открыта
  const start = Math.PI - 1.35;
  const len = 2.7;
  const rows = 8;
  const cols = 14;
  const at = (i: number, j: number): V3 => {
    const y = 0.06 + (3.25 - 0.06) * (j / rows);
    const phi = start + (len * i) / cols;
    const k = 1 - y / 3.25;
    const r = R(y) + 0.07 + 0.2 * k * k + 0.05 * k * Math.cos(phi * 9);
    return [r * Math.sin(phi), y, r * Math.cos(phi)];
  };
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) pos.push(...at(i, j));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j;
      const b = (i + 1) * (rows + 1) + j;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const cape = new THREE.BufferGeometry();
  cape.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  cape.setIndex(idx);
  cape.computeVertexNormals();
  const trim: V3[] = [];
  for (let j = rows; j >= 0; j--) trim.push(at(0, j));
  for (let i = 1; i <= cols; i++) trim.push(at(i, 0));
  for (let j = 1; j <= rows; j++) trim.push(at(cols, j));
  return [byHeight(cape, [[0, 0x8a1a2d], [3.25, RED]]), colored(tube(trim, () => 0.07, 24, 3), GOLD)];
}

function collarGeo(): Geo[] {
  // горностай: белый валик с чёрными хвостиками
  const y = 3.36;
  const rc = R(y) + 0.06;
  const out: Geo[] = [colored(new THREE.TorusGeometry(rc, 0.21, 5, 20).rotateX(Math.PI / 2).translate(0, y, 0), 0xfbf7ec)];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const r = rc + 0.19;
    out.push(colored(new THREE.OctahedronGeometry(0.075).scale(0.8, 1.5, 0.8).translate(r * Math.sin(a), y - 0.04 + (i % 2) * 0.08, r * Math.cos(a)), 0x241a26));
  }
  return out;
}

function crownGeo(): Geo {
  // корона: обод, пять зубцов с жемчугом, камни, бархатная шапочка внутри; сидит набекрень
  const parts: Geo[] = [
    paint(new THREE.CylinderGeometry(0.84, 0.78, 0.42, 18, 1, true).translate(0, 0.21, 0), (_x, y, _z, c) => c.setHex(y < 0.06 ? GOLD_DARK : GOLD)),
    colored(new THREE.SphereGeometry(0.8, 10, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 1).translate(0, 0.12, 0), 0xa3213a),
  ];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const r = 0.83;
    parts.push(colored(new THREE.ConeGeometry(0.17, 0.52, 5).rotateX(0.12).rotateY(a).translate(r * Math.sin(a), 0.63, r * Math.cos(a)), GOLD));
    parts.push(colored(new THREE.OctahedronGeometry(0.11, 0).translate(1.05 * r * Math.sin(a), 0.94, 1.05 * r * Math.cos(a)), 0xfff6e0));
    const b = a + Math.PI / 5;
    parts.push(colored(new THREE.OctahedronGeometry(0.11, 0).scale(1, 1.2, 0.55).rotateY(b).translate(0.85 * Math.sin(b), 0.22, 0.85 * Math.cos(b)), 0xe2364a));
  }
  parts.push(colored(new THREE.OctahedronGeometry(0.17, 0).scale(1, 1.25, 0.55).translate(0, 0.22, 0.86), 0xb45cff));
  // варенье капает с обода
  parts.push(jamDrip(0.32, 0.07).translate(0.5, 0.4, 0.67));
  const g = merge(parts);
  g.rotateX(-0.12);
  g.rotateZ(0.2);
  g.translate(-0.02, 4.78, -0.04);
  return g;
}

function faceGeo(): Geo[] {
  const out: Geo[] = [];
  // тяжёлые веки над светящимися глазами — надменный прищур
  for (const s of [-1, 1]) {
    const lid = new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.33, 0.2, 0.2);
    lid.rotateX(-0.42).rotateY(s * 0.4).translate(s * EYE_X, EYE_Y + 0.13, EC[2] - 0.05);
    out.push(colored(lid, 0x6a3eac));
  }
  // усы с закрученными кончиками
  for (const s of [-1, 1]) {
    const pts: V3[] = [[0, 3.99, 0.1], [0.27, 3.95, 0.13], [0.55, 3.97, 0.13], [0.78, 4.07, 0.12], [0.88, 4.2, 0.11], [0.83, 4.29, 0.1], [0.75, 4.23, 0.1]]
      .map(([phi, y, o]) => onBody(phi * s, y, o));
    out.push(colored(tube(pts, (u) => 0.05 + 0.12 * Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u * 0.55), 10, 5), 0x2c1a2e));
  }
  out.push(ball(0.1, 0x2c1a2e, onBody(0, 3.98, 0.15), [1.4, 0.9, 1], 8, 5));
  // ухмылка
  const mouth: V3[] = [onBody(-0.34, 3.72, 0.02), onBody(0, 3.66, 0.04), onBody(0.3, 3.71, 0.03), onBody(0.42, 3.79, 0.02)];
  out.push(colored(tube(mouth, () => 0.055, 8, 4), 0x3a1430));
  // монокль на правом глазу (−X) и цепочка
  const eyeAt = onBody(-EYE_X, EYE_Y, 0.04);
  out.push(colored(orient(new THREE.TorusGeometry(0.34, 0.045, 4, 14).rotateX(Math.PI / 2), eyeAt, bodyNormal(-EYE_X, EYE_Y)), GOLD));
  const chain: V3[] = [onBody(-0.66, 4.06, 0.05), onBody(-0.8, 3.82, 0.05), onBody(-0.9, 3.6, 0.07), onBody(-0.95, 3.46, 0.24)];
  out.push(colored(tube(chain, () => 0.03, 8, 3), GOLD));
  return out;
}

function jarGeo(): Geo[] {
  // банка: стекло, внутри варенье до плеч, этикетка с ягодой, блики; горлышко открыто (крышку держит левая рука)
  const prof: Array<[number, number]> = [[0.001, 0], [0.55, 0], [0.66, 0.05], [0.7, 0.18], [0.7, 1.2], [0.66, 1.36], [0.55, 1.47],
    [0.49, 1.52], [0.49, 1.58], [0.54, 1.6], [0.54, 1.68], [0.49, 1.7]];
  const jamLow = new THREE.Color(0x5a1244);
  const jamUp = new THREE.Color(0x8e2766);
  const glass = paint(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14), (_x, y, _z, c) => {
    if (y < 0.05 || y > 1.27) c.setHex(y > 1.5 ? 0xbcd6e4 : 0xd6eaf3);
    else c.copy(jamLow).lerp(jamUp, y / 1.27);
  });
  // стенка изнутри над вареньем и само варенье сверху
  const inner = colored(new THREE.LatheGeometry([new THREE.Vector2(0.47, 1.69), new THREE.Vector2(0.47, 1.5), new THREE.Vector2(0.62, 1.36), new THREE.Vector2(0.66, 1.25)], 14), 0xa8c8d8);
  const jamTop = paint(new THREE.CircleGeometry(0.66, 14).rotateX(-Math.PI / 2).translate(0, 1.25, 0), (x, _y, z, c) => c.setHex(Math.hypot(x, z) < 0.3 ? JAM_HI : 0x7a1d5a));
  const label = colored(new THREE.CylinderGeometry(0.712, 0.712, 0.44, 10, 1, true, -1.15, 2.3).translate(0, 0.66, 0), 0xf4e5c2);
  const stripes = [0.46, 0.86].map((y) => colored(new THREE.CylinderGeometry(0.716, 0.716, 0.05, 10, 1, true, -1.15, 2.3).translate(0, y, 0), 0xc8323c));
  const berry = colored(new THREE.SphereGeometry(0.16, 8, 5).scale(1, 1.1, 0.35).translate(0, 0.64, 0.72), 0x6a1a8a);
  const leaf = colored(new THREE.SphereGeometry(0.08, 5, 3).scale(1.4, 0.6, 0.3).rotateZ(0.5).translate(0.1, 0.84, 0.715), 0x5aa04a);
  const shine = [colored(new THREE.BoxGeometry(0.07, 0.75, 0.02).rotateY(-0.62).translate(0.7 * Math.sin(-0.62) * 1.01, 0.62, 0.7 * Math.cos(-0.62) * 1.01), 0xffffff),
    colored(new THREE.BoxGeometry(0.05, 0.3, 0.02).rotateY(-0.42).translate(0.7 * Math.sin(-0.42) * 1.01, 1.0, 0.7 * Math.cos(-0.42) * 1.01), 0xffffff)];
  // варенье перелилось через горлышко
  const drips = [jamDrip(0.42, 0.075).translate(0.52 * Math.sin(0.4), 1.62, 0.52 * Math.cos(0.4) + 0.05),
    jamDrip(0.26, 0.06).translate(0.52 * Math.sin(-0.75), 1.62, 0.52 * Math.cos(-0.75) + 0.05)];
  const out = [glass, inner, jamTop, label, ...stripes, berry, leaf, ...shine, ...drips];
  for (const g of out) g.translate(0, JAR.y0, JAR.z);
  return out;
}

function spotsGeo(): Geo[] {
  // пятна варенья по бокам и на спине — примета войска
  const spots: Array<[number, number, number]> = [[2.15, 1.25, 0.34], [-2.4, 2.4, 0.3], [1.45, 3.95, 0.24], [-1.3, 0.6, 0.3]];
  return spots.map(([phi, y, r], i) => jamSpot(r, onBody(phi, y, -0.01), bodyNormal(phi, y), i));
}

function rightArmGeo(): Geo {
  // рука в белой перчатке и половник: ручка из кулака, на конце — золотой черпак, полный варенья
  const arm = colored(new THREE.CapsuleGeometry(0.3, ARM - 0.4, 2, 8).translate(0, -(ARM - 0.4) / 2 - 0.05, 0), PURPLE);
  const cuff = colored(new THREE.TorusGeometry(0.31, 0.075, 3, 10).rotateX(Math.PI / 2).translate(0, -ARM + 0.4, 0), GOLD);
  const mitt = ball(0.4, GLOVE, [0, -ARM, 0.04], [1.05, 0.95, 1.1], 9, 6);
  // половник в своих осях: ручка вдоль +Y, черпак сзади (−Z) от верхнего конца, раскрыт вверх
  const L = 2.25;
  const BR = 0.62;
  const handle = colored(new THREE.CylinderGeometry(0.1, 0.1, L + 0.55, 6, 1).translate(0, (L - 0.55) / 2, 0), WOOD);
  const rings = [L - 0.2].map((y) => colored(new THREE.TorusGeometry(0.13, 0.05, 3, 8).rotateX(Math.PI / 2).translate(0, y, 0), GOLD));
  const knob = ball(0.15, GOLD, [0, -0.6, 0], [1, 1, 1], 6, 4);
  const neck = colored(tube([[0, L - 0.05, 0], [0, L + 0.2, -0.05], [0, L + 0.26, -0.22]], () => 0.09, 5, 4), GOLD);
  const bowlAt: V3 = [0, L + 0.24, -BR - 0.12];
  const bowl = colored(new THREE.SphereGeometry(BR, 11, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(bowlAt[0], bowlAt[1], bowlAt[2]), GOLD);
  const lip = colored(new THREE.TorusGeometry(BR, 0.06, 3, 12).rotateX(Math.PI / 2).translate(bowlAt[0], bowlAt[1], bowlAt[2]), GOLD_DARK);
  const jam = paint(new THREE.SphereGeometry(BR * 0.93, 9, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1).translate(bowlAt[0], bowlAt[1] - 0.03, bowlAt[2]),
    (_x, y, _z, c) => c.setHex(y > bowlAt[1] + 0.16 ? JAM_HI : JAM));
  const drips = [jamDrip(0.42, 0.08).translate(bowlAt[0] + 0.36, bowlAt[1] - 0.05, bowlAt[2] + 0.45)];
  const ladle = merge([handle, ...rings, knob, neck, bowl, lip, jam, ...drips]);
  // в руку: ручка под углом GRIP к «вперёд» при опущенной руке, хват — в кулаке
  ladle.rotateX(Math.PI / 2 - GRIP).translate(0, -ARM, 0.04);
  return merge([arm, cuff, mitt, ladle]);
}

/** Левая рука обнимает пузо и держит крышку банки; строим в осях тела, потом переносим в плечо */
function leftArmGeo(): Geo {
  const wrist: V3 = [0.42, 2.84, 1.52];
  const path: V3[] = [[SL[0], SL[1], SL[2]], [1.58, 2.77, 0.7], [1.2, 2.74, 1.24], [0.72, 2.8, 1.56], wrist];
  const arm = colored(tube(path, (u) => 0.28 - u * 0.03, 12, 7), PURPLE);
  const cuff = colored(orient(new THREE.TorusGeometry(0.28, 0.07, 3, 10).rotateX(Math.PI / 2), [0.5, 2.83, 1.55], [-0.94, 0.05, 0.33]), GOLD);
  // ладонь лежит на крышке
  const mitt = ball(0.42, GLOVE, [0.08, 2.86, 1.32], [1.15, 0.7, 1.05], 9, 6);
  // крышка: золотой кружок, сверху тряпичный «чепчик» в горошек, перевязанный бечёвкой
  const top = JAR_TOP;
  const lid = colored(new THREE.CylinderGeometry(0.57, 0.57, 0.12, 14).translate(0, top + 0.04, JAR.z), GOLD);
  const cloth = colored(new THREE.SphereGeometry(0.64, 12, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.32, 1).translate(0, top + 0.08, JAR.z), 0xd8333a);
  const skirt = colored(new THREE.CylinderGeometry(0.63, 0.72, 0.2, 12, 1, true).translate(0, top - 0.01, JAR.z), 0xd8333a);
  const twine = colored(new THREE.TorusGeometry(0.62, 0.03, 3, 10).rotateX(Math.PI / 2).translate(0, top + 0.05, JAR.z), 0xd8b47a);
  const dots: Geo[] = [];
  for (let i = 0; i < 4; i++) {
    const a = i * 1.6 + 0.6;
    const rr = 0.42 + (i % 2) * 0.1;
    dots.push(ball(0.09, 0xfff8ee, [rr * Math.sin(a), top + 0.1 + 0.2 * (1 - (rr / 0.64) ** 2), JAR.z + rr * Math.cos(a)], [1, 0.4, 1], 5, 3));
  }
  const g = merge([arm, cuff, mitt, lid, cloth, skirt, twine, ...dots]);
  return g.translate(-SL[0], -SL[1], -SL[2]);
}

function eyesGeo(): Geo {
  const parts: Geo[] = [];
  for (const s of [-1, 1]) {
    const e = new THREE.SphereGeometry(1, 10, 7).scale(0.26, 0.3, 0.12);
    const az = Math.atan2(s * EYE_X, EC[2]);
    e.rotateX(-0.5).rotateY(az).translate(s * EYE_X, EYE_Y, EC[2] - 0.02);
    parts.push(colored(e, EYE));
  }
  return merge(parts).translate(-EC[0], -EC[1], -EC[2]);
}

function coreGeo(): Geo {
  // ядро: светящийся бирюзовый шар («можно бить») и четыре искры вокруг
  const lo = new THREE.Color(0x0aa6c4);
  const hi = new THREE.Color(0x8af6ff);
  const orb = paint(new THREE.SphereGeometry(0.5, 14, 10), (_x, y, z, c) => c.copy(lo).lerp(hi, clamp01(0.4 + y * 0.9 + z * 0.4)));
  const sparks: Geo[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    sparks.push(colored(new THREE.OctahedronGeometry(0.1).scale(1, 1.6, 1).translate(0.78 * Math.sin(a), 0.22 * Math.cos(a * 2), 0.78 * Math.cos(a)), 0x7af0ff));
  }
  return merge([orb, ...sparks]);
}

function rageGeo(): Geo {
  // ярость: пар из-под короны, красные зрачки, злые брови, «жилка» на лбу
  const parts: Geo[] = [];
  for (const s of [-1, 1]) {
    const puffs: Array<[number, number, number, number]> = [[0.95, 5.0, 0.0, 0.25], [1.18, 5.4, -0.08, 0.33], [1.38, 5.86, -0.12, 0.36]];
    puffs.forEach(([x, y, z, r], i) => parts.push(steamPuff(r, [s * x, y, z], i * 2 + (s > 0 ? 0 : 1), 1)));
    const az = Math.atan2(s * EYE_X, EC[2]);
    const iris = new THREE.SphereGeometry(0.13, 8, 4).scale(1, 1.15, 0.4);
    iris.translate(0, -0.03, 0.13).rotateX(-0.5).rotateY(az).translate(s * EYE_X, EYE_Y, EC[2] - 0.02);
    parts.push(colored(iris, 0xff2a2a));
    const brow = new THREE.BoxGeometry(0.56, 0.13, 0.16).rotateZ(-s * 0.42);
    brow.translate(0, 0, 0.06).rotateX(-0.55).rotateY(az).translate(s * (EYE_X + 0.02), EYE_Y + 0.36, EC[2] - 0.12);
    parts.push(colored(brow, 0x24122f));
  }
  // «жилка» — красный значок злости на лбу сбоку
  const vein = onBody(0.62, 4.78, 0.05);
  const n = bodyNormal(0.62, 4.78);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const bit = new THREE.BoxGeometry(0.2, 0.07, 0.06).rotateZ(a + Math.PI / 4).translate(0.13 * Math.cos(a), 0.13 * Math.sin(a), 0);
    parts.push(colored(orient(bit.rotateX(Math.PI / 2), vein, n), 0xe3263a));
  }
  return merge(parts).translate(-EC[0], -EC[1], -EC[2]);
}

function buildParts(): MobPart[] {
  const body = merge([bodyGeo(), ...mantleGeo(), ...collarGeo(), crownGeo(), ...faceGeo(), ...jarGeo(), ...spotsGeo()]);
  return [
    { bone: 'body', geo: body },
    { bone: 'armR', geo: rightArmGeo() },
    { bone: 'armL', geo: leftArmGeo() },
    { bone: 'head', geo: eyesGeo(), glow: true },
    { bone: 'extra', geo: coreGeo(), glow: true },
    { bone: 'tail', geo: rageGeo() },
  ];
}

// ------------------------------------------------------------ поза

const F = new THREE.Matrix4();
const FS = new THREE.Matrix4();

export const BARON: MobDef = {
  id: 'boss-baron',
  name: 'Барон Варенья',
  kinds: [Z_BOSS],
  height: 5.5,
  parts: buildParts(),
  pose(a, out) {
    const t = a.t;
    const T = a.stT;
    const seed = a.seed;
    const sp = Math.abs(a.speed);
    const walk = clamp01(sp / 1.2);
    const g = a.speed < 0 ? 1 - a.gait : a.gait;
    let px = 0;
    let py = 0;
    let pz = 0;
    let lean = 0;
    let twist = 0;
    let roll = 0;
    let sx = 1;
    let sy = 1;
    // правая рука (половник): наклон вперёд-назад, поворот, отвод; по умолчанию — держит скипетром
    let arx = CARRY;
    let ary = 0;
    let arz = 0.42;
    let lid = 0;
    let eyeS = 1;
    let eyeSy = 1;
    let core = 0;
    const st = a.st;

    if (st === ZS_ATTACK) {
      const u = T % 1;
      arx = keys(u, [[0, CARRY], [0.4, -3.3], [0.55, -0.45], [1, CARRY]]);
      lean = keys(u, [[0, 0.05], [0.4, -0.1], [0.55, 0.28], [1, 0.05]]);
      sy = 1 - 0.1 * win(0.5, 0.56, 0.62, 0.85, u);
    } else if (st === ZS_BOSS_GATE) {
      // половник над головой, дрожит от натуги — и шлёп по воротам ровно к удару
      arx = keys(T, [[0, CARRY], [0.7, -2.7], [1.5, -2.85], [1.7, -0.3], [WARN, -0.12]]);
      arz = keys(T, [[0, 0.3], [0.7, -0.45], [1.5, -0.5], [1.7, 0.1], [WARN, 0.3]]);
      lean = keys(T, [[0, 0.05], [0.7, -0.12], [1.5, -0.18], [1.7, 0.3], [WARN, 0.34]]);
      sy = keys(T, [[0, 1], [0.7, 1.07], [1.5, 1.1], [1.7, 0.86], [WARN, 0.84]]);
      py = keys(T, [[0, 0], [0.7, 0.12], [1.5, 0.18], [1.7, 0]]);
      const strain = win(0.7, 1.0, 1.45, 1.55, T);
      px += 0.035 * Math.sin(t * 43) * strain;
      roll += 0.02 * Math.sin(t * 37) * strain;
      eyeSy = 1 - 0.3 * strain;
    } else if (st === ZS_BOSS_BOMB) {
      // раскрутка половника над головой (ровно три оборота) и бросок варенья
      const w = clamp01((T - 0.35) / 1.15);
      const spin = Math.PI * 2 * 3 * w * w * (3 - 2 * w);
      arx = keys(T, [[0, CARRY], [0.35, -2.75], [1.5, -2.75], [1.6, -3.45], [WARN, -1.0]]);
      arz = keys(T, [[0, 0.3], [0.35, 0.12], [1.5, 0.12], [WARN, 0.25]]);
      ary = -spin;
      twist = 0.12 * Math.sin(spin) * win(0.35, 0.5, 1.4, 1.5, T) + keys(T, [[1.5, 0], [1.6, -0.2], [WARN, 0.25]]);
      lean = keys(T, [[0, 0.05], [0.35, -0.05], [1.5, -0.06], [1.6, -0.12], [WARN, 0.24]]);
      sy = 1 + 0.04 * win(0.3, 0.5, 1.45, 1.6, T) - 0.08 * smooth(1.65, WARN, T);
      eyeS = 1 + 0.12 * win(0.3, 0.6, 1.4, 1.6, T);
    } else if (st === ZS_BOSS_PULSE) {
      // присел, прыгнул, плюхнулся — к удару волны
      const crouch = smooth(0, 0.85, T);
      const up = T < 0.85 ? 0 : T < 1.3 ? 1 - (1 - (T - 0.85) / 0.45) ** 2 : T < 1.72 ? 1 - ((T - 1.3) / 0.42) ** 2 : 0;
      py = 1.5 * up;
      const land = smooth(1.66, 1.76, T);
      sy = T < 0.85 ? 1 - 0.28 * crouch : T < 1.72 ? lerp(1.16, 1.06, smooth(1.3, 1.72, T)) : lerp(1.06, 0.66, land);
      if (T >= 0.85 && T < 1.0) sy = lerp(0.72, 1.16, smooth(0.85, 1.0, T));
      arx = keys(T, [[0, CARRY], [0.85, -2.6], [1.3, -3.0], [1.72, -2.2], [WARN, -0.9]]);
      arz = keys(T, [[0, 0.3], [0.85, -0.25], [1.72, -0.35], [WARN, 0.1]]);
      lean = keys(T, [[0, 0.05], [0.85, 0.12], [1.3, -0.06], [WARN, 0.08]]);
      eyeSy = T < 0.85 ? 1 - 0.4 * crouch : T < 1.72 ? 1.1 : 0.4;
    } else if (st === ZS_BOSS_OPEN) {
      // ядро открыто: шлепок отдаётся дрожью, рука снимает крышку, ядро поднимается и бьётся; сам — обмяк
      lid = win(0.08, 0.45, OPEN - 0.5, OPEN - 0.08, T);
      core = win(0.18, 0.62, OPEN - 0.55, OPEN - 0.1, T);
      const wob = wobble(T, 16, 4.5);
      sy = 1 - 0.18 * wob - 0.035 * core * (0.5 + 0.5 * Math.sin(T * 7));
      lean = 0.1 * core + 0.06 * wob;
      arx = lerp(CARRY, -0.28, smooth(0, 0.4, T) * (1 - smooth(OPEN - 0.5, OPEN, T)));
      arz = lerp(0.3, 0.1, core);
      eyeSy = 1 - 0.55 * core;
      roll = 0.04 * Math.sin(T * 2.3) * core;
    } else {
      // ходьба подскоками, на месте — дышит
      const s = Math.sin(Math.PI * g);
      const contact = (1 - s) ** 3;
      py = 0.24 * walk * s;
      sy = 1 - 0.09 * walk * contact + 0.05 * walk * s;
      lean = 0.05 * walk + 0.025 * walk * Math.cos(2 * Math.PI * g);
      roll = 0.035 * walk * Math.sin(2 * Math.PI * g);
      arx += 0.05 * walk * Math.sin(2 * Math.PI * g + 0.6) + 0.04 * (1 - walk) * Math.sin(t * 1.1 + seed * 4);
      sy += 0.018 * (1 - walk) * Math.sin(t * 1.7 + seed * 6);
    }
    if (st !== ZS_BOSS_PULSE && st !== ZS_BOSS_GATE && st !== ZS_ATTACK) {
      // моргает
      const bl = (t + seed * 5) % 3.7;
      eyeSy *= 1 - 0.85 * win(0, 0.05, 0.08, 0.14, bl);
    }
    // удар по Барону: вздрогнул, сжался, зажмурился
    const hit = a.hit;
    if (hit > 0) {
      sy -= 0.1 * hit;
      lean -= 0.12 * hit;
      eyeSy *= 1 - 0.7 * hit;
      px += 0.05 * hit * Math.sin(t * 60);
    }
    // ярость: дрожь, прищур
    if (a.rage) {
      px += 0.04 * Math.sin(t * 51 + seed * 9);
      pz += 0.03 * Math.sin(t * 43);
      roll += 0.02 * Math.sin(t * 37);
      eyeSy *= 0.85;
    }
    // гибель: вздрогнул, крышка слетела, ядро вылетело, растаял в лужу
    const d = a.die;
    let coreLift = 0;
    let coreScale = 1;
    let armS = 1;
    if (d > 0) {
      const shock = smooth(0, 0.15, d);
      const melt = smooth(0.18, 0.95, d);
      sy = lerp(lerp(1, 1.12, shock), 0.05, melt);
      sx = lerp(1, 1.6, melt);
      py = -0.15 * melt;
      lean = 0;
      roll = 0;
      lid = lerp(1, 1.5, shock);
      core = 1;
      coreLift = 3.2 * smooth(0.08, 0.6, d);
      coreScale = 1.2 * (1 - smooth(0.35, 0.65, d));
      arx = lerp(CARRY, -0.15, melt);
      arz = lerp(0.3, -1.2, melt);
      eyeS = lerp(1.3, 1, melt);
      eyeSy = lerp(1.3, 0.2, melt);
      armS = Math.max(HIDE, 1 - smooth(0.55, 1, d));
    } else {
      sx = 1 + (1 - sy) * 0.6;
    }

    // тело: рамка (без сплющивания) и рамка со сплющиванием
    composeInto(F, px, py, pz, lean, twist, roll);
    composeInto(FS, 0, 0, 0, 0, 0, 0, sx, sy, sx);
    FS.premultiply(F);
    out.body.copy(FS);
    // глаза и ярость — от середины между глазами
    attach(out.head, FS, EC[0], EC[1], EC[2], 0, 0, 0, eyeS, eyeS * eyeSy, eyeS);
    const rs = a.rage && d <= 0 ? 1 + 0.06 * Math.sin(t * 19) : HIDE;
    attach(out.tail, FS, EC[0], EC[1], EC[2], 0, 0, 0, rs, rs * (st === ZS_BOSS_OPEN ? lerp(1, 0.6, core) : 1), rs);
    // левая рука с крышкой — сплющивается вместе с банкой; открывает: отводит в сторону и вверх
    const lidWave = lid * 0.12 * Math.sin(t * 5);
    attach(out.armL, FS, SL[0], SL[1], SL[2], -0.3 * lid + lidWave, 0.75 * lid, -1.45 * lid, armS);
    // правая рука — без сплющивания, плечо идёт за телом
    attach(out.armR, F, SR[0] * sx, SR[1] * sy, SR[2] * sx, arx, ary, arz, armS);
    // ядро: в банке или снаружи, бьётся как сердце
    const beat = heartbeat(t, 0.8);
    const cs = (core > 0 ? lerp(0.5, 1.25, core) * (1 + 0.2 * beat * core) : HIDE) * coreScale;
    attach(out.extra, FS, lerp(CORE_IN[0], CORE_OUT[0], core), lerp(CORE_IN[1], CORE_OUT[1], core) + coreLift + 0.05 * Math.sin(t * 2.2) * core,
      lerp(CORE_IN[2], CORE_OUT[2], core), 0, t * 1.6, 0, Math.max(HIDE, cs));
  },
};
