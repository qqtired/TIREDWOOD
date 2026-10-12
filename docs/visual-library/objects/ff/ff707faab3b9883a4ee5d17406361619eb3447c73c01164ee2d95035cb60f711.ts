// «Набег пиратов»: пираты-желейки — той же породы, что желейки игроков (яйцо-капля с бликом, большие глаза, ножки), в
// треуголках и банданах, с повязками на глазу, в тельняшках. Четыре матроса (лаймовый, апельсиновый, бирюзовый,
// розовый; выбор по seed) и капитан — жёлтый, крупнее, в красном камзоле и большой треуголке с пером, с бородой-клином и
// усами, с крюком вместо левой руки и деревянной ногой. Модели — по договору мобов крепости (client/fort/mobs/kit.ts):
// жёсткие части на костях, поза — матрицы костей относительно корня (ноги на y = 0, лицом по +Z). Рисует их
// PirateCrowd (piratecrowd.ts) инстансами. Кости: body — тело, шляпа, лицо; head — глаза (озираются, моргают);
// tail — глаза-спирали (оглушён); armL/armR, legL/legR; prop — ящик, extra — бочка; у матроса wingR — звёздочки над
// головой; у капитана wingL/wingR — второй ящик и вторая бочка (несёт сразу два), звёздочки — вместе со спиралями.
// Белёсые места (белые полосы тельняшки, пузо и жабо капитана) нужны тинту: краска стрелка ложится на них ярче.
import * as THREE from 'three';
import { colored, merge, setBone, setBoneS, setChild, setChildS, type MobAnim, type MobDef, type MobPart, type MobPose } from '../fort/mobs/kit.ts';
import { TAU, clamp01, jolt, legAt, newLeg, smooth, stepLen, walkAmount } from '../fort/mobs/set-a-shapes.ts';
import { curve, mergeColored, paint, tube } from '../fort/mobs/sea-shapes.ts';
import { BARREL, CRATE, barrelGeo, crateGeo } from './pirateloot.ts';

/** Вид (MobDef.kinds): матрос — четыре модели-варианта, выбор по seed */
export const PK_HAND = 1;
/** Капитан: одна модель, крупнее */
export const PK_CAPTAIN = 2;

/** Состояния (MobAnim.st) */
export const PS_IDLE = 0;
export const PS_RUN = 1;
/** Хватает добычу: stT 0 … ~0,6 с — наклон, обнял, поднял над головой */
export const PS_GRAB = 2;
export const PS_CARRY = 3;
/** Прыжок: stT 0 … 1 за ≈ 0,55 с (дугу высоты ставит контроллер) */
export const PS_JUMP = 4;
/** Заляпан краской: ошарашен, пошатывается, глаза-спирали, звёздочки (stT — секунд в состоянии) */
export const PS_STUN = 5;
/** Гребёт сидя (a.gait — фаза гребка 0…1, та же, что DinghyAnim.stroke) */
export const PS_ROW = 6;
/** Сидит в шлюпке, машет рукой */
export const PS_SEAT = 7;
export const PS_CHEER = 8;
export const PS_FLEE = 9;

/** Признаки (MobAnim.flags): что несёт. Капитан несёт два: оба бита — ящик и бочку, один бит — два одинаковых */
export const PF_CRATE = 1;
export const PF_BARREL = 2;

/** Сколько длится PS_GRAB, с */
export const GRAB_S = 0.6;

/**
 * Гребок (общий для гребцов и вёсел шлюпки): фаза p 0…1. sweep — рукояти вперёд (+1, к носу) / назад (−1), dip —
 * лопасть в воде (1) или над водой (0). Лопасть в воде, пока рукояти идут вперёд (гребут «от себя», лицом к носу).
 */
export function oarSweep(p: number): number {
  return Math.cos(p * TAU);
}
export function oarDip(p: number): number {
  return smooth((Math.sin(p * TAU) + 0.15) / 0.5) * smooth((0.98 - Math.abs(Math.cos(p * TAU))) * 4);
}

// ------------------------------------------------------------ профиль тела

/** Профиль желейки игрока (client/render/outfit3d.ts), высота 1,58 — делим на неё */
const PLAYER: ReadonlyArray<readonly [number, number]> = [
  [0.001, 0.0], [0.3, 0.0], [0.43, 0.07], [0.505, 0.25], [0.525, 0.55], [0.51, 0.84], [0.46, 1.09], [0.37, 1.31], [0.23, 1.49], [0.001, 1.58],
];
const DENSE = new THREE.SplineCurve(PLAYER.map(([r, y]) => new THREE.Vector2(r / 1.58, y / 1.58))).getPoints(400);

/** Радиус профиля (в долях высоты) на высоте u (0…1) — по боковой стороне */
function rN(u: number): number {
  if (u <= 0) return DENSE[0].x;
  for (let i = 1; i < DENSE.length; i++) {
    const a = DENSE[i - 1];
    const b = DENSE[i];
    if (b.y >= u && b.y > a.y && u >= a.y) return a.x + ((u - a.y) / (b.y - a.y)) * (b.x - a.x);
  }
  return 0;
}

/** Размеры: тело-яйцо высотой H (м), толщина fat к профилю игрока; бёдра, ноги, глаза, плечи */
interface Rig {
  H: number;
  fat: number;
  /** Низ тела над землёй стоя (= длина ножки) */
  hip: number;
  /** Высота глаз и рта в долях H */
  eyeU: number;
  mouthU: number;
  /** Плечи (доля H) и бёдра (м от оси) */
  shU: number;
  legX: number;
  /** Где сидит шляпа (доля H) и сколько она добавляет сверху, м */
  hatU: number;
  hatTop: number;
  /** Глаза: радиус белка, полуразнос */
  eyeR: number;
  eyeX: number;
}

const HAND: Rig = { H: 1.15, fat: 1.12, hip: 0.15, eyeU: 0.72, mouthU: 0.585, shU: 0.43, legX: 0.15, hatU: 0.885, hatTop: 0.2, eyeR: 0.092, eyeX: 0.118 };
const CAPT: Rig = { H: 1.5, fat: 1.12, hip: 0.19, eyeU: 0.735, mouthU: 0.6, shU: 0.43, legX: 0.2, hatU: 0.875, hatTop: 0.27, eyeR: 0.108, eyeX: 0.15 };

function rAt(rig: Rig, u: number): number {
  return rN(u) * rig.H * rig.fat;
}

/** Точка на поверхности тела: высота u, угол phi от лица (+Z) к левому боку (+X), отступ off наружу */
function onBody(rig: Rig, u: number, phi: number, off = 0): THREE.Vector3 {
  const r = rAt(rig, u) + off;
  return new THREE.Vector3(Math.sin(phi) * r, u * rig.H, Math.cos(phi) * r);
}

/** Кусок геометрии повернуть лицом по нормали тела в точке (u, phi) и поставить туда (лицом был +Z) */
function stick(g: THREE.BufferGeometry, rig: Rig, u: number, phi: number, off = 0, tilt = 0): THREE.BufferGeometry {
  // наклон поверхности: профиль сужается кверху — нормаль смотрит чуть вверх
  const du = 0.01;
  const slope = (rAt(rig, u + du) - rAt(rig, u - du)) / (2 * du * rig.H);
  const pitch = Math.atan(slope);
  const p = onBody(rig, u, phi, off);
  return g.rotateZ(tilt).rotateX(pitch).rotateY(phi).translate(p.x, p.y, p.z);
}

const _c = new THREE.Color();

/**
 * Тело: токарное яйцо по рядам us (доли H), radial сегментов. face(u, phi) — цвет грани по центру (чёткие полосы)
 * или null — тогда цвет по вершине vert(u, phi, n) (плавный перелив и блик).
 */
function bodyLathe(rig: Rig, us: number[], radial: number, face: (u: number, phi: number, out: THREE.Color) => boolean, vert: (u: number, phi: number, y: number, out: THREE.Color) => void): THREE.BufferGeometry {
  const pts = [new THREE.Vector2(0.0005, 0)];
  for (const u of us) pts.push(new THREE.Vector2(Math.max(0.0005, u <= 0 ? rN(0) * rig.H * rig.fat : rAt(rig, u)), u * rig.H));
  pts.push(new THREE.Vector2(0.0005, rig.H));
  // начало вращения — на полсегмента левее: по лицу (+Z) проходит середина грани (пряжка, вырез — одной гранью)
  const g = new THREE.LatheGeometry(pts, radial, -Math.PI / radial).toNonIndexed();
  g.deleteAttribute('uv');
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let t = 0; t + 2 < pos.count; t += 3) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      cx += pos.getX(t + k) / 3;
      cy += pos.getY(t + k) / 3;
      cz += pos.getZ(t + k) / 3;
    }
    const flat = face(cy / rig.H, Math.atan2(cx, cz), _c);
    for (let k = 0; k < 3; k++) {
      if (!flat) vert(pos.getY(t + k) / rig.H, Math.atan2(pos.getX(t + k), pos.getZ(t + k)), pos.getY(t + k), _c);
      col[(t + k) * 3] = _c.r;
      col[(t + k) * 3 + 1] = _c.g;
      col[(t + k) * 3 + 2] = _c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Перелив желе: темнее снизу, светлее к макушке, блик слева сверху спереди */
function jellyVert(base: number, light: number, shine: number) {
  const lo = new THREE.Color(base);
  const hi = new THREE.Color(light);
  const sh = new THREE.Color(shine);
  return (u: number, phi: number, _y: number, out: THREE.Color): void => {
    out.copy(lo).lerp(hi, smooth((u - 0.45) / 0.5));
    // блик: пятно у левого виска (phi ≈ 0,6, u ≈ 0,8)
    const d = Math.hypot((phi - 0.62) * 0.55, u - 0.81);
    if (d < 0.12) out.lerp(sh, (1 - d / 0.12) * 0.85);
    // лёгкая тень под подбородком сзади
    if (u < 0.5) out.multiplyScalar(0.92);
  };
}

// ------------------------------------------------------------ лицо

/** Белок глаза с пупсиковым зрачком и бликом; центр глаза — в начале координат, смотрит по +Z */
function eyeGeo(r: number, look: number, pupil: number): THREE.BufferGeometry {
  const sclera = colored(new THREE.SphereGeometry(r, 7, 5).scale(1, 1.17, 0.5), 0xfbfbf6);
  const pr = r * 0.6;
  const pup = colored(new THREE.CircleGeometry(pr, 8).scale(1, 1.12, 1).translate(look * r * 0.18, -r * 0.1, r * 0.5 + 0.004), pupil);
  const glint = colored(new THREE.CircleGeometry(pr * 0.34, 5).translate(look * r * 0.18 + pr * 0.38, -r * 0.1 + pr * 0.42, r * 0.5 + 0.008), 0xffffff);
  return mergeColored([sclera, pup, glint]);
}

/**
 * Глаза на кости head (её начало — ось тела на высоте глаз): open — какие открыты (повязка закрывает другой),
 * brows — брови капитана (густые, тёмные).
 */
function eyesGeo(rig: Rig, open: { l: boolean; r: boolean }, brows = 0): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const y0 = rig.eyeU * rig.H;
  for (const s of [1, -1]) {
    if (s > 0 ? !open.l : !open.r) continue;
    const phi = Math.asin(rig.eyeX / rAt(rig, rig.eyeU)) * s;
    const g = eyeGeo(rig.eyeR, -s, 0x1b1d26);
    stick(g, rig, rig.eyeU, phi, -0.012).translate(0, -y0, 0);
    parts.push(g);
    if (brows) {
      const b = colored(new THREE.BoxGeometry(rig.eyeR * 1.9, rig.eyeR * 0.42, 0.05), brows);
      stick(b, rig, rig.eyeU + 0.1, phi * 1.05, -0.005, -s * 0.14).translate(0, -y0, 0);
      parts.push(b);
    }
  }
  return mergeColored(parts);
}

/** Плоская спираль (оглушён): белый кружок и тёмная завитушка; центр — начало, смотрит по +Z */
function spiralGeo(r: number): THREE.BufferGeometry {
  const disc = colored(new THREE.CircleGeometry(r, 10), 0xfbfbf6);
  const pos: number[] = [];
  const n = 18;
  const turns = 2.3;
  const w = r * 0.13;
  let prev: [number, number, number, number] | null = null;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = u * turns * TAU;
    const rr = r * (0.08 + 0.78 * u);
    const cx = Math.cos(a) * rr;
    const cy = Math.sin(a) * rr;
    const ix = Math.cos(a) * (rr - w);
    const iy = Math.sin(a) * (rr - w);
    if (prev) {
      const [px, py, pix, piy] = prev;
      pos.push(pix, piy, 0.004, px, py, 0.004, cx, cy, 0.004);
      pos.push(pix, piy, 0.004, cx, cy, 0.004, ix, iy, 0.004);
    }
    prev = [cx, cy, ix, iy];
  }
  const sp = new THREE.BufferGeometry();
  sp.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sp.computeVertexNormals();
  // нормали — строго вперёд (полоса плоская)
  const nor = sp.getAttribute('normal');
  for (let i = 0; i < nor.count; i++) nor.setXYZ(i, 0, 0, 1);
  return mergeColored([disc, colored(sp, 0x2a2333)]);
}

/** Глаза-спирали на месте открытых глаз (кость tail, начало — ось тела на высоте глаз) */
function dizzyGeo(rig: Rig, open: { l: boolean; r: boolean }): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const y0 = rig.eyeU * rig.H;
  for (const s of [1, -1]) {
    if (s > 0 ? !open.l : !open.r) continue;
    const phi = Math.asin(rig.eyeX / rAt(rig, rig.eyeU)) * s;
    const g = spiralGeo(rig.eyeR * 1.05);
    if (s < 0) g.rotateZ(Math.PI);
    stick(g, rig, rig.eyeU, phi, 0.012).translate(0, -y0, 0);
    parts.push(g);
  }
  return mergeColored(parts);
}

/** Пятиконечная звёздочка (две стороны), лицом по +Z */
function starGeo(r: number, hex: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const at = (i: number) => {
    const a = (i / 10) * TAU + Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    return [Math.cos(a) * rr, Math.sin(a) * rr];
  };
  for (const z of [0.012, -0.012]) {
    for (let i = 0; i < 10; i++) {
      const [ax, ay] = at(i);
      const [bx, by] = at(i + 1);
      if (z > 0) pos.push(0, 0, z * 1.6, ax, ay, z, bx, by, z);
      else pos.push(0, 0, z * 1.6, bx, by, z, ax, ay, z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return colored(g, hex);
}

/** Хоровод из трёх звёздочек над головой (кость крутится вокруг Y) */
function starsGeo(ring: number, size: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const hues = [0xffd84a, 0xfff1a0, 0xffb648];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    parts.push(starGeo(size, hues[i]).rotateY(a + Math.PI / 2).translate(Math.cos(a) * ring, Math.sin(i * 2.1) * 0.04, -Math.sin(a) * ring));
  }
  return mergeColored(parts);
}

/** Рот-ухмылка: тёмная «D» на поверхности, зуб (белый или золотой), язык; tilt — кривизна ухмылки */
function mouthGeo(rig: Rig, w: number, tooth: number, tilt: number): THREE.BufferGeometry {
  const mouth = colored(new THREE.SphereGeometry(1, 8, 2, 0, TAU, Math.PI / 2, Math.PI / 2).scale(w, w * 0.62, 0.03), 0x5b1f27);
  const tongue = colored(new THREE.SphereGeometry(1, 5, 2).scale(w * 0.45, w * 0.24, 0.02).translate(w * 0.12, -w * 0.38, 0.012), 0xe8707e);
  const t = colored(new THREE.BoxGeometry(w * 0.26, w * 0.24, 0.02).translate(-w * 0.32, -w * 0.11, 0.016), tooth);
  return stick(mergeColored([mouth, tongue, t]), rig, rig.mouthU, 0.05, -0.006, tilt);
}

// ------------------------------------------------------------ руки, ноги, сабля

/** Рука-варежка вниз от плеча: рукав (цвет sleeve до доли cuffK), кисть-варежка с пальцем */
function armGeo(skin: number, sleeve: number, cuff: number, side: 1 | -1, k = 1): THREE.BufferGeometry {
  // трубка без торцов: верх прячется в теле, низ — в варежке
  const arm = paint(new THREE.CylinderGeometry(0.06 * k, 0.064 * k, 0.26 * k, 6, 2, true).translate(0, -0.13 * k, 0), (p, _n, o) => o.setHex(p.y > -0.17 * k ? sleeve : cuff), true);
  const mitt = colored(new THREE.SphereGeometry(0.088 * k, 6, 4).scale(1, 0.95, 0.9).translate(0, -0.3 * k, 0.01), skin);
  const thumb = colored(new THREE.SphereGeometry(0.038 * k, 4, 3).translate(side * 0.06 * k, -0.27 * k, 0.05 * k), skin);
  return mergeColored([arm, mitt, thumb]);
}

/** Сабля в варежке (в осях руки: варежка на y = −0,3, клинок по +Z): рукоять, гарда, изогнутый клинок */
function sabreGeo(k = 1, guard = 0xe1b84a): THREE.BufferGeometry {
  const y0 = -0.3 * k;
  const grip = colored(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 5, 1, true).rotateX(Math.PI / 2).translate(0, y0, 0.0), 0x4a2c1a);
  const pommel = colored(new THREE.SphereGeometry(0.03, 4, 3).translate(0, y0, -0.09), guard);
  const cross = colored(new THREE.BoxGeometry(0.03, 0.15, 0.03).translate(0, y0 + 0.01, 0.085), guard);
  const pos: number[] = [];
  const n = 6;
  const L = 0.62 * k;
  const pt = (i: number) => {
    const u = i / n;
    const z = 0.1 + u * L;
    const y = y0 + 0.11 * u * u * k;
    const w = 0.046 * (1 - u * 0.7);
    return [z, y, w] as const;
  };
  for (let i = 0; i < n; i++) {
    const [z0, yc0, w0] = pt(i);
    const [z1, yc1, w1] = pt(i + 1);
    for (const x of [0.007, -0.007]) {
      const a = [x, yc0 - w0, z0];
      const b = [x, yc0 + w0, z0];
      const c = [x, yc1 - w1, z1];
      const d = [x, yc1 + w1, z1];
      if (x > 0) pos.push(...a, ...c, ...b, ...b, ...c, ...d);
      else pos.push(...a, ...b, ...c, ...b, ...d, ...c);
    }
  }
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  blade.computeVertexNormals();
  return mergeColored([grip, pommel, cross, paint(blade, (p, _n, o) => o.setHex(p.y > y0 + 0.11 * Math.pow((p.z - 0.1) / L, 2) * k + 0.012 ? 0xf4f7fb : 0xc3ccd8))]);
}

/** Ножка-сапожок вниз от бедра: голенище и сапог носком вперёд */
function bootGeo(len: number, boot: number, cuff: number, k = 1): THREE.BufferGeometry {
  return mergeColored([
    colored(new THREE.CylinderGeometry(0.06 * k, 0.065 * k, len * 0.55, 5, 1, true).translate(0, -len * 0.25, 0), cuff),
    colored(new THREE.SphereGeometry(1, 6, 4).scale(0.085 * k, 0.07 * k, 0.125 * k).translate(0, -len + 0.065 * k, 0.03 * k), boot),
  ]);
}

/** Деревянная нога капитана: точёная, к низу тоньше, с тёмным кольцом */
function pegGeo(len: number): THREE.BufferGeometry {
  return mergeColored([
    colored(new THREE.CylinderGeometry(0.075, 0.07, len * 0.3, 6, 1, true).translate(0, -len * 0.12, 0), 0x2b2230),
    colored(new THREE.CylinderGeometry(0.055, 0.03, len * 0.75, 6, 1, true).translate(0, -len * 0.62, 0), 0xb07a46),
    colored(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 6, 1, false).translate(0, -len + 0.03, 0), 0x5a3a22),
  ]);
}

/** Крюк вместо левой кисти: красная манжета, серебряный крюк */
function hookGeo(k: number, sleeve: number, cuff: number): THREE.BufferGeometry {
  const arm = paint(new THREE.CylinderGeometry(0.06 * k, 0.064 * k, 0.26 * k, 6, 2, true).translate(0, -0.13 * k, 0), (p, _n, o) => o.setHex(p.y > -0.17 * k ? sleeve : cuff), true);
  const bell = colored(new THREE.CylinderGeometry(0.06 * k, 0.085 * k, 0.07 * k, 7, 1, false, 0, TAU).translate(0, -0.27 * k, 0), 0x6b4a2a);
  const pts = curve([[0, -0.29, 0], [0, -0.4, 0.02], [0, -0.47, 0.08], [0, -0.43, 0.15], [0, -0.36, 0.14]], 7).map((p) => p.multiplyScalar(k));
  const hook = paint(tube(pts, (_i, u) => (0.024 - 0.012 * u) * k, 4, { capEnd: 1.5 }), (_p, _n, o) => o.setHex(0xdfe6ee));
  return mergeColored([arm, bell, hook]);
}

// ------------------------------------------------------------ шляпы

/** Бандана: шапочка по макушке с белым кантом и горошинами, узел и хвостики сзади */
function bandanaGeo(rig: Rig, cloth: number, dot: number): THREE.BufferGeometry {
  const us = [0.77, 0.795, 0.87, 0.95];
  const pts = us.map((u) => new THREE.Vector2(rAt(rig, u) + 0.016, u * rig.H));
  pts.push(new THREE.Vector2(0.0005, rig.H + 0.016));
  const cap = paint(new THREE.LatheGeometry(pts, 12, -Math.PI / 12), (p, _n, o) => o.setHex(p.y < 0.79 * rig.H ? dot : cloth), true);
  const parts: THREE.BufferGeometry[] = [cap];
  // горошины
  for (const [u, phi] of [[0.85, 0.45], [0.91, -0.3], [0.84, -1.05], [0.92, 1.35], [0.87, 2.4], [0.88, -2.1]] as const) {
    parts.push(stick(colored(new THREE.CircleGeometry(0.036, 6), dot), rig, u, phi, 0.02));
  }
  const back = onBody(rig, 0.82, Math.PI, 0.025);
  parts.push(colored(new THREE.SphereGeometry(0.065, 5, 3).scale(1.2, 1, 0.8).translate(back.x, back.y, back.z), cloth));
  for (const s of [-1, 1]) {
    parts.push(colored(new THREE.ConeGeometry(0.055, 0.24, 4).scale(1, 1, 0.35).rotateZ(Math.PI + s * 0.5).rotateX(-0.35).translate(back.x + s * 0.07, back.y - 0.1, back.z - 0.03), cloth));
  }
  return mergeColored(parts);
}

/**
 * Треуголка (как tricorn из sea-shapes, но кант — чёткой золотой каймой): тулья-купол и поля, загнутые вверх тремя
 * стенками; один угол смотрит вперёд (+Z). R — до углов, h — высота стенок посередине сторон; seg кратно 3.
 */
function tricornHat(R: number, h: number, felt: number, trim: number, seg: number, edge = 0.8): THREE.BufferGeometry {
  const rc = R * 0.46;
  const thick = 0.04 * R;
  const v = new THREE.Vector3();
  const at = (t: number, phi: number, under: number): THREE.Vector3 => {
    const c3 = Math.cos(3 * phi);
    const ro = R * (0.775 + 0.225 * c3);
    const ho = h * (0.55 - 0.45 * c3);
    const r = rc + (ro - rc) * t;
    return v.set(Math.sin(phi) * r, ho * Math.pow(t, 1.6) + 0.02 * R - under, Math.cos(phi) * r);
  };
  const cf = new THREE.Color(felt);
  const ct = new THREE.Color(trim);
  // ряды полей: войлок до edge, дальше кайма (двойной ряд на границе — цвет меняется резко); снизу — один ряд
  const top: Array<[number, THREE.Color]> = [[0, cf], [edge, cf], [edge, ct], [1, ct]];
  const bottom: Array<[number, THREE.Color]> = [[0, cf], [1, cf]];
  const band = (under: boolean): THREE.BufferGeometry => {
    const rows = under ? bottom : top;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    for (const [t, c] of rows) {
      for (let j = 0; j < seg; j++) {
        at(t, (j / seg) * TAU, under ? thick : 0);
        pos.push(v.x, v.y, v.z);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let k = 0; k < rows.length - 1; k++) {
      for (let j = 0; j < seg; j++) {
        const j2 = (j + 1) % seg;
        const a = k * seg + j;
        const b = (k + 1) * seg + j;
        const c = k * seg + j2;
        const d = (k + 1) * seg + j2;
        if (under) idx.push(a, c, b, c, d, b);
        else idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  // ободок края: под каймой снизу — тоже золото, чтобы снизу край читался
  const crown = colored(new THREE.SphereGeometry(rc * 1.04, seg, 2, 0, TAU, 0, Math.PI / 2).scale(1, (h * 1.3) / (rc * 1.04), 1), felt);
  const ribbon = colored(new THREE.CylinderGeometry(rc * 1.07, rc * 1.09, h * 0.28, seg, 1, true).translate(0, h * 0.16, 0), trim);
  return mergeColored([band(false), band(true), crown, ribbon]);
}

/** Треуголка на макушке (угол вперёд), набекрень */
function hatGeo(rig: Rig, R: number, h: number, felt: number, trim: number, seg: number, tilt: number): THREE.BufferGeometry {
  return tricornHat(R, h, felt, trim, seg).rotateX(-0.12).rotateZ(tilt).translate(0, rig.hatU * rig.H - 0.02, -0.01);
}

/** Перо капитана: красный плюмаж от левого угла шляпы назад и вверх */
function featherGeo(rig: Rig, hex: number): THREE.BufferGeometry {
  const y = rig.hatU * rig.H;
  const pts = curve([[0.3, y + 0.08, -0.05], [0.36, y + 0.24, -0.2], [0.3, y + 0.36, -0.42], [0.18, y + 0.36, -0.6]], 7);
  return paint(tube(pts, (_i, u) => 0.012 + 0.05 * Math.sin(Math.PI * Math.min(1, u * 1.1)), 5, { capEnd: 1, capStart: 1 }), (p, _n, o) => o.setHex(p.z < -0.5 ? 0xff9a7a : hex));
}

// ------------------------------------------------------------ модели

interface Look {
  id: string;
  name: string;
  skin: number;
  light: number;
  shine: number;
  /** Полосы тельняшки и низ (штаны) */
  stripe: number;
  pants: number;
  hat: 'tricorn' | 'bandana';
  felt: number;
  trim: number;
  /** Повязка на глаз: 1 — левый (+X), −1 — правый, 0 — нет */
  patch: number;
  sabre: boolean;
  earring: boolean;
  tilt: number;
}

const HANDS: readonly Look[] = [
  { id: 'pirate-lime', name: 'Пират лаймовый', skin: 0x79c23c, light: 0xb9ec7a, shine: 0xf2ffe0, stripe: 0x23408f, pants: 0x2a3560, hat: 'tricorn', felt: 0x24212c, trim: 0xe7b84a, patch: 1, sabre: true, earring: false, tilt: 0.12 },
  { id: 'pirate-orange', name: 'Пират апельсиновый', skin: 0xf08a2a, light: 0xffc06a, shine: 0xfff2dc, stripe: 0x23408f, pants: 0x5a3a26, hat: 'bandana', felt: 0xd8342c, trim: 0xfaf3e6, patch: 0, sabre: false, earring: true, tilt: 0 },
  { id: 'pirate-teal', name: 'Пират бирюзовый', skin: 0x27b3a6, light: 0x7fe6d6, shine: 0xe6fffb, stripe: 0xd23a32, pants: 0x2a3560, hat: 'tricorn', felt: 0x263a6e, trim: 0xe7b84a, patch: 0, sabre: true, earring: true, tilt: -0.14 },
  { id: 'pirate-pink', name: 'Пират розовый', skin: 0xec6fa6, light: 0xffb0d2, shine: 0xfff0f6, stripe: 0x23408f, pants: 0x3a2a40, hat: 'bandana', felt: 0x2f6fd0, trim: 0xfaf3e6, patch: -1, sabre: false, earring: false, tilt: 0 },
];

/** Ряды тела матроса: полосы тельняшки — ровно по рядам (чёткая граница) */
const HAND_US = [0, 0.06, 0.17, 0.23, 0.305, 0.38, 0.455, 0.53, 0.62, 0.72, 0.81, 0.89, 0.96];

function handBody(look: Look): THREE.BufferGeometry {
  const rig = HAND;
  const vert = jellyVert(look.skin, look.light, look.shine);
  const white = 0xf6f3ea;
  const body = bodyLathe(rig, HAND_US, 12, (u, phi, out) => {
    if (u < 0.17) {
      out.setHex(look.pants);
      return true;
    }
    if (u < 0.23) {
      // ремень с пряжкой спереди
      out.setHex(Math.abs(phi) < 0.22 ? 0xe7b84a : 0x4a2c1a);
      return true;
    }
    // тельняшка с вырезом-галочкой спереди
    const neck = 0.53 - 0.07 * Math.pow(Math.max(0, Math.cos(phi)), 6);
    if (u < neck) {
      out.setHex(Math.floor((u - 0.23) / 0.075) % 2 ? white : look.stripe);
      return true;
    }
    return false;
  }, vert);
  const parts: THREE.BufferGeometry[] = [body, mouthGeo(rig, 0.095, 0xfbf7ea, look.patch > 0 ? -0.18 : 0.18)];
  if (look.hat === 'tricorn') parts.push(hatGeo(rig, 0.56, 0.21, look.felt, look.trim, 9, look.tilt));
  else parts.push(bandanaGeo(rig, look.felt, look.trim));
  if (look.patch) {
    // повязка: чёрный кружок на глазу и ремешок наискосок вокруг головы
    const phi = Math.asin(rig.eyeX / rAt(rig, rig.eyeU)) * look.patch;
    parts.push(stick(colored(new THREE.SphereGeometry(1, 8, 4).scale(rig.eyeR * 1.15, rig.eyeR * 1.2, 0.035), 0x17161c), rig, rig.eyeU, phi, -0.004));
    const strap = colored(new THREE.TorusGeometry(rAt(rig, rig.eyeU + 0.03) + 0.006, 0.014, 3, 12).rotateX(Math.PI / 2).rotateZ(look.patch * 0.3).translate(0, (rig.eyeU + 0.04) * rig.H, 0), 0x17161c);
    parts.push(strap);
  }
  if (look.earring) {
    const s = look.patch > 0 ? -1 : 1;
    const p = onBody(rig, 0.62, s * 1.45, 0.01);
    parts.push(colored(new THREE.TorusGeometry(0.035, 0.009, 3, 5).rotateY(s * 1.45).translate(p.x, p.y - 0.04, p.z), 0xf0c24a));
  }
  return merge(parts);
}

/** Детали капитана на теле: камзол, жабо, ремень, борода, усы, рот, треуголка с пером */
const CAPT_US = [0, 0.05, 0.12, 0.2, 0.26, 0.33, 0.4, 0.47, 0.54, 0.6, 0.67, 0.74, 0.81, 0.87, 0.93, 0.975];
const CAPT_SKIN = 0xf5bf2a;
const COAT = 0xc8302c;
const GOLD = 0xe7b84a;

function captainBody(): THREE.BufferGeometry {
  const rig = CAPT;
  const vert = jellyVert(CAPT_SKIN, 0xffe27a, 0xfffbe6);
  const body = bodyLathe(rig, CAPT_US, 14, (u, phi, out) => {
    if (u > 0.6) return false;
    const a = Math.abs(phi);
    // подол и воротник — золотой кант; спереди — рубашка (одна грань), ремень с пряжкой
    if (u < 0.04 || (u > 0.54 && a > 0.3)) out.setHex(GOLD);
    else if (u > 0.2 && u < 0.26) out.setHex(a < 0.2 ? GOLD : 0x2a1c14);
    else if (u >= 0.26 && a < 0.2) out.setHex(0xf7f2e6);
    else out.setHex(COAT);
    return true;
  }, vert);
  const parts: THREE.BufferGeometry[] = [body];
  // золотой кант по краям камзола (трубки по поверхности)
  for (const s of [1, -1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 4; i++) pts.push(onBody(rig, 0.26 + (0.3 * i) / 4, s * (Math.PI / 14), 0.004));
    parts.push(paint(tube(pts, () => 0.022, 4), (_p, _n, o) => o.setHex(GOLD)));
  }
  // жабо: белые оборки под бородой
  for (const [u, s] of [[0.42, 0.06], [0.35, 0.052]] as const) parts.push(stick(colored(new THREE.SphereGeometry(1, 5, 3).scale(s * 1.4, s, s * 0.6), 0xfbf8ef), rig, u, 0, 0.0));
  // пуговицы по краю камзола
  for (const s of [1, -1]) for (const u of [0.3, 0.38, 0.46]) parts.push(stick(colored(new THREE.SphereGeometry(0.028, 4, 2), GOLD), rig, u, s * 0.38, 0.004));
  // рот, борода-клин и усы
  parts.push(mouthGeo(rig, 0.11, 0xf2c94a, -0.12));
  const chin = onBody(rig, rig.mouthU - 0.04, 0, 0.0);
  parts.push(colored(new THREE.ConeGeometry(0.15, 0.26, 7).scale(1, 1, 0.5).rotateX(Math.PI + 0.3).translate(chin.x, chin.y - 0.12, chin.z + 0.02), 0x4a2c18));
  for (const s of [1, -1]) {
    const m0 = onBody(rig, rig.mouthU + 0.045, s * 0.04, 0.012);
    const pts = curve([[m0.x, m0.y, m0.z], [m0.x + s * 0.09, m0.y - 0.02, m0.z - 0.01], [m0.x + s * 0.17, m0.y + 0.0, m0.z - 0.05], [m0.x + s * 0.19, m0.y + 0.06, m0.z - 0.07]], 6);
    parts.push(paint(tube(pts, (_i, u) => 0.032 * (1 - 0.7 * u) + 0.008, 4, { capEnd: 1 }), (_p, _n, o) => o.setHex(0x3b2416)));
  }
  parts.push(hatGeo(rig, 0.78, 0.26, 0x231f2b, GOLD, 12, 0.06));
  parts.push(featherGeo(rig, 0xe23a32));
  return merge(parts);
}

// ------------------------------------------------------------ поза

const _base = new THREE.Matrix4();
const _tmp = new THREE.Matrix4();
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const legL = newLeg();
const legR = newLeg();

/** Спрятать кость: крошечная внутри тела (договор: масштаб не меньше 0,02) */
function hide(m: THREE.Matrix4, y: number): void {
  setBone(m, 0, y, 0, 0, 0, 0, 0.02);
}

/** Плавная «ступенька» туда и обратно: 0 → 1 на [a, b], 1 → 0 на [c, d] */
function bump(x: number, a: number, b: number, c: number, d: number): number {
  return smooth((x - a) / (b - a)) * (1 - smooth((x - c) / (d - c)));
}

/** Ноша над головой: где стоит низ первой вещи (в осях тела) и что несёт */
interface Carry {
  /** Низ ноши над низом тела, м */
  top: number;
  /** Капитан: две вещи стопкой */
  two: boolean;
}

/**
 * Поза пирата (общая для матросов и капитана). Корень — ноги на y = 0, лицом по +Z. Без выделений памяти.
 */
function piratePose(rig: Rig, carry: Carry, captain: boolean, a: MobAnim, out: MobPose): void {
  const seed = a.seed;
  const st = a.st;
  const rage = captain && a.rage;
  const t = a.t * (rage ? 1.45 : 1) + seed * 11;
  const size = captain ? 1 : 0.95 + seed * 0.1;
  const H = rig.H;
  const flags = a.flags ?? 0;
  const holding = (flags & (PF_CRATE | PF_BARREL)) !== 0 && st !== PS_STUN && st !== PS_FLEE && a.die <= 0;
  const sitting = st === PS_ROW || st === PS_SEAT;

  // ---- походка: шаги без скольжения (как у мобов крепости), вразвалку
  const moving = st === PS_RUN || st === PS_CARRY || st === PS_FLEE || (st === PS_IDLE && a.speed > 0.05) || (st === PS_STUN && a.speed > 0.05);
  const cycles = st === PS_FLEE ? 4 : 3;
  const w = moving ? walkAmount(a.speed, st === PS_CARRY ? 1.6 : 2.2) : 0;
  const step = stepLen(cycles, 0.58, size) * (st === PS_CARRY ? 0.85 : 1);
  legAt(a.gait * cycles, 0.58, step, rig.hip, 0.05, legL);
  legAt(a.gait * cycles + 0.5, 0.58, step, rig.hip, 0.05, legR);
  const ph = a.gait * cycles * TAU;
  const stance = legL.down && legR.down ? Math.min(legL.hip, legR.hip) : legL.down ? legL.hip : legR.hip;

  let hipY = rig.hip + (stance - rig.hip) * w;
  let lift = 0;
  let lean = 0.1 * w;
  let roll = Math.sin(ph) * 0.11 * w;
  let yaw = 0;
  let sq = 0.018 * Math.sin(t * 2.3);
  let lx = legL.rx * w;
  let rx = legR.rx * w;
  let lsy = 1 + (legL.sy - 1) * w;
  let rsy = 1 + (legR.sy - 1) * w;
  let legFwd = 0;
  // руки: rx (минус — вперёд/вверх), rz (наружу), длина (тянется, как желе), плечо выше (руки над головой)
  let aLx = 0.12 - Math.sin(ph) * 0.65 * w;
  let aRx = 0.12 + Math.sin(ph) * 0.65 * w;
  let aLz = 0.22 + 0.06 * Math.sin(t * 1.3);
  let aRz = 0.22 + 0.06 * Math.sin(t * 1.5 + 1);
  let aLs = 1;
  let aRs = 1;
  let shUp = 0;
  // глаза: поворот (озирается), моргание, ширина
  let look = 0.32 * (bump((t * 0.31) % 2, 0.25, 0.4, 0.75, 0.9) - bump((t * 0.31) % 2, 1.2, 1.35, 1.7, 1.85));
  let blink = (t * 0.27) % 1 < 0.035 ? 0.12 : 1;
  let eyeS = 1;
  let dizzy = 0;
  let stars = 0;
  // ноша: 0 — на земле перед собой (хватает), 1 — над головой
  let lifted = 1;

  if (moving && st !== PS_FLEE) {
    // сабля (правая рука) — машет над головой на бегу
    if (st === PS_RUN) {
      aRx = -2.45 + 0.45 * Math.sin(ph * 0.5 + 0.6);
      aRz = 0.35 + 0.25 * Math.sin(ph * 0.5);
    }
  }

  if (st === PS_IDLE && w === 0) {
    roll = 0.035 * Math.sin(t * 1.1);
    lean = 0.02 * Math.sin(t * 0.8);
    if (captain) {
      // руки в боки: крюк и кулак на поясе
      aLx = -0.25;
      aLz = 0.75;
      aRx = -0.35 + 0.08 * Math.sin(t * 1.7);
      aRz = 0.55;
    }
  } else if (st === PS_GRAB) {
    // наклон, обнял ношу у земли, выпрямился и поднял над головой
    const u = clamp01(a.stT / GRAB_S);
    const bend = bump(u, 0, 0.3, 0.45, 0.85);
    lean = 0.55 * bend;
    sq = -0.12 * bend + 0.05 * bump(u, 0.55, 0.7, 0.8, 1);
    hipY = rig.hip - 0.03 * bend;
    lifted = smooth((u - 0.38) / 0.5);
    const reach = 1 - lifted;
    aLx = aRx = -1.15 * reach - 3.08 * lifted;
    aLz = aRz = 0.06 + 0.32 * reach;
    aLs = aRs = 1 + 0.25 * reach + (captain ? 0.15 : 0.32) * lifted;
    shUp = lifted;
    look = 0;
    lx = rx = -0.2 * bend;
  } else if (st === PS_JUMP) {
    // присел — вытянулся вверх — поджал ножки в воздухе — приземлился
    const u = clamp01(a.stT);
    const crouch = bump(u, 0, 0.12, 0.14, 0.24);
    const launch = bump(u, 0.12, 0.26, 0.45, 0.62);
    const tuck = bump(u, 0.3, 0.45, 0.72, 0.86);
    const land = bump(u, 0.82, 0.9, 0.92, 1);
    sq = -0.2 * crouch + 0.2 * launch - 0.04 * tuck - 0.16 * land;
    lean = 0.18 * crouch - 0.12 * launch + 0.1 * tuck;
    hipY = rig.hip - 0.05 * crouch - 0.04 * land;
    lx = rx = -0.9 * tuck;
    lsy = rsy = 1 - 0.25 * tuck;
    legFwd = 0.04 * tuck;
    aLx = aRx = 0.6 * crouch - 2.9 * launch - 1.6 * tuck;
    aLz = aRz = 0.25 + 1.0 * tuck + 0.2 * launch;
    eyeS = 1 + 0.12 * launch;
  } else if (st === PS_STUN) {
    // заляпан: шатается по кругу, руки висят, глаза-спирали, звёздочки
    const k = smooth(a.stT / 0.25);
    const wob = t * 4.2;
    lean = (0.13 * Math.sin(wob)) * k;
    roll = (0.13 * Math.cos(wob)) * k;
    yaw = 0.15 * Math.sin(wob * 0.5) * k;
    sq = -0.06 * k + 0.03 * Math.sin(wob * 2);
    aLx = 0.25 + 0.15 * Math.sin(wob + 1);
    aRx = 0.25 + 0.15 * Math.sin(wob + 2.5);
    aLz = 0.12 + 0.12 * Math.cos(wob);
    aRz = 0.12 - 0.12 * Math.cos(wob);
    dizzy = k;
    stars = k;
    look = 0;
  } else if (sitting) {
    // сидит на банке: низ тела на корне, ножки вперёд
    hipY = 0.02;
    lx = rx = -1.35;
    lsy = rsy = 1;
    legFwd = 0.08;
    lean = 0;
    roll = 0;
    if (st === PS_ROW) {
      // гребёт «от себя», лицом к носу: рукояти вперёд — руки вытянуты, назад — к груди, корпус качается в такт
      const p = a.gait;
      const sw = oarSweep(p);
      lean = 0.2 * sw;
      aLx = aRx = -1.22 - 0.3 * sw;
      aLs = aRs = 1.08 + 0.18 * sw;
      aLz = aRz = 0.18;
      sq = 0.03 * oarDip(p);
      look *= 0.4;
    } else {
      // машет рукой (левой; у капитана — крюком), другая на колене
      aLx = -2.7;
      aLz = 0.55 + 0.4 * Math.sin(t * 7);
      aRx = -0.75;
      aRz = 0.3;
      roll = 0.05 * Math.sin(t * 3.5);
    }
  } else if (st === PS_CHEER) {
    // подпрыгивает, руки вверх и машет
    const hop = (t * 2.3) % 1;
    const air = Math.sin(Math.PI * Math.min(1, hop / 0.6));
    lift = hop < 0.6 ? 0.13 * air : 0;
    sq = hop < 0.6 ? 0.08 * air : -0.12 * Math.sin(Math.PI * (hop - 0.6) / 0.4);
    aLx = -2.75 + 0.3 * Math.sin(t * 9);
    aRx = -2.75 + 0.3 * Math.sin(t * 9 + 2);
    aLz = aRz = 0.5 + 0.15 * Math.sin(t * 9 + 1);
    lx = rx = hop < 0.6 ? -0.25 * air : 0;
    blink = 1;
  } else if (st === PS_FLEE) {
    // в панике: быстрые мелкие шажки, руки вверх и машут, глаза круглые, оглядывается
    lean = 0.22 * w + 0.05;
    aLx = -2.55 + 0.55 * Math.sin(t * 15);
    aRx = -2.55 + 0.55 * Math.sin(t * 15 + 2.2);
    aLz = 0.55 + 0.2 * Math.sin(t * 13);
    aRz = 0.55 + 0.2 * Math.cos(t * 13);
    eyeS = 1.25;
    look = 0.45 * Math.sin(t * 2.6);
    blink = 1;
  }

  if (holding && st !== PS_GRAB) {
    // несёт на голове: плечи-желе съехали вверх, руки тянутся и держат ношу снизу по бокам; идёт вразвалку
    aLx = aRx = -3.08 + 0.05 * Math.sin(ph);
    aLz = 0.06 + 0.04 * Math.sin(ph);
    aRz = 0.06 - 0.04 * Math.sin(ph);
    aLs = aRs = captain ? 1.15 : 1.32;
    shUp = 1;
    lean *= 0.5;
  }
  if (rage && !holding && !sitting) {
    // злой капитан: размахивает саблей и крюком
    aRx = -2.6 + 0.6 * Math.sin(t * 6);
    aLx = -1.6 + 0.5 * Math.sin(t * 6 + 2);
    eyeS *= 0.85;
  }

  // ---- вздрогнул
  const j = jolt(a.hit);
  lean -= 0.3 * j;
  sq -= 0.14 * j;
  aLz += 0.5 * j;
  aRz += 0.5 * j;

  // ---- гибель: заляпан — шлёп на спину, расплющился лужей (лицом и полосатым пузом вверх) и впитался
  const d = a.die;
  const fall = smooth(d / 0.28);
  const melt = smooth((d - 0.08) / 0.4);
  const sink = smooth((d - 0.62) / 0.38);
  if (d > 0) {
    lean = lean * (1 - fall) - 1.5 * fall;
    roll *= 1 - fall;
    yaw *= 1 - fall;
    lift = 0;
    sq *= 1 - fall;
    aLx = aRx = -0.2 * melt + aLx * (1 - melt);
    aLz += (1.25 - aLz) * melt;
    aRz += (1.25 - aRz) * melt;
    lx = rx = -1.3 * fall;
    lsy = rsy = 1;
    look = 0;
    blink = 1;
    eyeS = 1;
    stars *= 1 - fall;
  }
  const gone = 1 - 0.7 * sink;
  setBoneS(_base, 0, -0.03 * sink, 0, 0, 0, 0, size * gone, size * gone, size * gone);
  // толщина лужи — по оси тела «спина–живот» (после падения она вертикальна), ширина и длина растут
  const thick = 1 - 0.86 * melt;
  const sx = (1 + 0.38 * melt) * (1 - sq * 0.5);
  const sy = (1 + 0.12 * melt) * (1 + sq);
  const rMax = rAt(rig, 0.35);

  // ---- кости
  const hy = (sitting ? hipY : hipY * (1 - fall)) + lift + rMax * thick * fall * 0.92;
  setChildS(out.body, _base, 0, hy, 0, lean, yaw, roll, sx, sy, thick * (1 - sq * 0.5));
  // голова-глаза: озирается и моргает; при оглушении — спирали вместо глаз
  const eyeY = rig.eyeU * H;
  if (dizzy > 0.02) {
    hide(out.head, eyeY);
    out.head.premultiply(out.body);
    setChildS(out.tail, out.body, 0, eyeY, 0, 0, 0.12 * Math.sin(t * 3), 0.25 * Math.sin(t * 6), dizzy, dizzy, dizzy);
  } else {
    setChildS(out.head, out.body, 0, eyeY, 0, 0, look, 0, eyeS, eyeS * blink, eyeS);
    hide(out.tail, eyeY);
    out.tail.premultiply(out.body);
  }
  // звёздочки над головой (у капитана — вместе со спиралями на tail)
  if (!captain) {
    if (stars > 0.02) setChild(out.wingR, out.body, 0, H + rig.hatTop + 0.12, 0, 0, t * 4.5, 0, stars);
    else {
      hide(out.wingR, H * 0.5);
      out.wingR.premultiply(out.body);
    }
  }
  // руки
  const shY = (rig.shU + 0.24 * shUp) * H;
  const shX = rAt(rig, rig.shU + 0.24 * shUp) - 0.045;
  setChildS(out.armL, out.body, shX, shY, 0.02, aLx, 0, aLz, 1, aLs * (1 - 0.3 * melt), 1);
  setChildS(out.armR, out.body, -shX, shY, 0.02, aRx, 0, -aRz, 1, aRs * (1 - 0.3 * melt), 1);
  // ноги — от корня (не сплющиваются с телом); упал — торчат вперёд и тают вместе с лужей
  const legY = sitting ? 0.06 : hipY * (1 - 0.55 * fall) + lift;
  setChildS(out.legL, _base, rig.legX, legY, legFwd, lx, 0, 0, 1, lsy * (1 - 0.4 * melt), 1);
  setChildS(out.legR, _base, -rig.legX, legY, legFwd, rx, 0, 0, 1, rsy * (1 - 0.4 * melt), 1);

  // ---- ноша
  const top = H + carry.top;
  const crate = (flags & PF_CRATE) !== 0;
  const barrel = (flags & PF_BARREL) !== 0;
  // где ноша над головой (в осях тела) и где на земле (в осях корня)
  const placeItem = (m: THREE.Matrix4, level: number, isBarrel: boolean, show: boolean): void => {
    if (!holding || !show) {
      hide(m, H * 0.5);
      m.premultiply(out.body);
      return;
    }
    // над головой: ящик плашмя, бочка лёжа поперёк
    const lev = level === 0 ? top : top + (isBarrel ? BARREL.r * 2 * 0.9 : CRATE.h) + 0.02;
    if (isBarrel) setChild(_tmp, out.body, 0, lev + BARREL.r * 0.9, 0, 0, 0, Math.PI / 2, 0.9);
    else setChild(_tmp, out.body, 0, lev, 0, 0, 0.05 * Math.sin(t * 2), 0, 0.9);
    if (lifted >= 1) {
      m.copy(_tmp);
      return;
    }
    // хватает: с земли перед собой — вверх
    _pa.setFromMatrixPosition(_tmp);
    if (isBarrel) setBone(m, 0, BARREL.h * 0.45 * 0.9, 0.62, 0, 0, Math.PI / 2, 0.9);
    else setBone(m, 0, 0, 0.62, 0, 0, 0, 0.9);
    _pb.setFromMatrixPosition(m);
    _pb.lerp(_pa, lifted);
    m.setPosition(_pb);
  };
  if (captain) {
    // два: оба бита — ящик внизу и бочка сверху; один — два одинаковых
    const both = crate && barrel;
    placeItem(out.prop, 0, false, crate);
    placeItem(out.extra, both ? 1 : 0, true, barrel);
    placeItem(out.wingL, 1, false, crate && !barrel);
    placeItem(out.wingR, 1, true, barrel && !crate);
  } else {
    placeItem(out.prop, 0, false, crate);
    placeItem(out.extra, 0, true, barrel && !crate);
  }
}

// ------------------------------------------------------------ сборка

/** Части строятся при первом обращении (а не при загрузке модуля): набережной они нужны только во время набега */
function lazyDef(base: Omit<MobDef, 'parts'>, build: () => MobPart[]): MobDef {
  let parts: MobPart[] | null = null;
  return {
    ...base,
    get parts(): MobPart[] {
      return (parts ??= build());
    },
  };
}

const HAND_CARRY: Carry = { top: 0.05, two: false };
const CAPT_CARRY: Carry = { top: 0.07, two: true };

function handParts(look: Look): MobPart[] {
  const open = { l: look.patch !== 1, r: look.patch !== -1 };
  const skin = look.skin;
  const parts: MobPart[] = [
    { bone: 'body', geo: handBody(look) },
    { bone: 'head', geo: eyesGeo(HAND, open) },
    { bone: 'tail', geo: dizzyGeo(HAND, open) },
    { bone: 'wingR', geo: starsGeo(0.3, 0.075), glow: true },
    { bone: 'armL', geo: armGeo(skin, skin, skin, 1) },
    { bone: 'armR', geo: look.sabre ? mergeColored([armGeo(skin, skin, skin, -1), sabreGeo()]) : armGeo(skin, skin, skin, -1) },
    { bone: 'legL', geo: bootGeo(HAND.hip, 0x4a2c1a, look.pants) },
    { bone: 'legR', geo: bootGeo(HAND.hip, 0x4a2c1a, look.pants) },
    { bone: 'prop', geo: crateGeo(true) },
    { bone: 'extra', geo: barrelGeo(true) },
  ];
  return parts;
}

function captainParts(): MobPart[] {
  const open = { l: true, r: true };
  const k = 1.25;
  return [
    { bone: 'body', geo: captainBody() },
    { bone: 'head', geo: eyesGeo(CAPT, open, 0x3b2416) },
    { bone: 'tail', geo: mergeColored([dizzyGeo(CAPT, open), starsGeo(0.36, 0.09).translate(0, CAPT.H * (1 - CAPT.eyeU) + CAPT.hatTop + 0.14, 0)]) },
    { bone: 'armL', geo: hookGeo(k, COAT, GOLD) },
    { bone: 'armR', geo: mergeColored([armGeo(CAPT_SKIN, COAT, GOLD, -1, k), sabreGeo(k, GOLD).translate(0, 0, 0)]) },
    { bone: 'legL', geo: bootGeo(CAPT.hip, 0x1d1a22, 0x2b2230, 1.2) },
    { bone: 'legR', geo: pegGeo(CAPT.hip) },
    { bone: 'prop', geo: crateGeo(true) },
    { bone: 'extra', geo: barrelGeo(true) },
    { bone: 'wingL', geo: crateGeo(true) },
    { bone: 'wingR', geo: barrelGeo(true) },
  ];
}

/** Четыре матроса (PK_HAND, веса поровну) и капитан (PK_CAPTAIN) */
export const PIRATE_DEFS: readonly MobDef[] = [
  ...HANDS.map((look) => lazyDef({
    id: look.id, name: look.name, kinds: [PK_HAND], weight: 1, height: 1.5,
    pose: (a: MobAnim, out: MobPose) => piratePose(HAND, HAND_CARRY, false, a, out),
  }, () => handParts(look))),
  lazyDef({
    id: 'pirate-captain', name: 'Капитан Мармелад', kinds: [PK_CAPTAIN], weight: 1, height: 1.95,
    pose: (a: MobAnim, out: MobPose) => piratePose(CAPT, CAPT_CARRY, true, a, out),
  }, captainParts),
];
