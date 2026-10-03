// Липучка «Геккон-присоска»: бирюзовый геккон-хулиган ходит на задних лапах, на пальцах — оранжевые присоски.
// Большая голова с широкой улыбкой, выпученные светящиеся глаза (моргают), толстый хвост-противовес.
// На стене прижимается брюхом: руки вверх врастопырку, ноги лягушкой, перехватывается в такт подъёму и
// запрокидывает голову к защитникам. На гребне пританцовывает, во двор прыгает «звёздочкой».
// Гибель — плашмя лицом вниз, хвост торчит, потом расплывается.
import * as THREE from 'three';
import { Z_CLIMBER } from '../../../shared/fortkinds.ts';
import { CLIMB_SPEED, ZS_ATTACK, ZS_CLIMB, ZS_DROP, ZS_TOP } from '../../../shared/fort.ts';
import { type MobAnim, type MobDef, type MobPose } from './kit.ts';
import {
  EYE, TAU, ball, biped, blink, bump, clamp01, jamOn, join, lathe, link, linkS, mix, pivotBone, seedFrac, seedScale, seg,
  smooth, taper,
} from './b-parts.ts';

const TEAL = 0x3db7ae;
const CREAM = 0xf4ecc0;
const PAD = 0xff9a3c;
const MOUTH = 0x2b1630;
const SOCKET = 0x3a1650;

/** Тазобедренный сустав над землёй, нога до подошвы — столько же */
const HIP = 0.5;
const HIP_X = 0.15;
/** Плечи и шея — от таза */
const ARMS_Y = 0.47;
const NECK_Y = 0.6;
/** Глаза — в осях головы */
const EYE_X = 0.14;
const EYE_Y = 0.32;
const EYE_Z = 0.12;

// ------------------------------------------------------------------ геометрия

function bodyGeo(): THREE.BufferGeometry {
  const torso = lathe([[0.001, -0.12], [0.17, -0.1], [0.27, 0.0], [0.3, 0.15], [0.28, 0.3], [0.22, 0.44], [0.16, 0.56], [0.12, 0.64], [0.001, 0.68]], (_x, y, z) =>
    mix(TEAL, CREAM, smooth(clamp01((z - 0.08) / 0.1)) * (y < 0.5 ? 1 : 0)), 12);
  torso.scale(1, 1, 0.88);
  // хвост круто вниз и по земле назад, кончик колечком: на стене висит вдоль неё, а не торчит
  const tail = taper([[0, 0.04, -0.15], [0, -0.22, -0.27], [0, -0.4, -0.42], [0, -0.47, -0.64], [0, -0.4, -0.84], [0, -0.24, -0.88]], 0.15, 0.035,
    (_x, y, z) => (y < -0.4 && z > -0.8 ? mix(TEAL, CREAM, 0.35) : TEAL), 8, 5, false);
  const tip = ball(0.036, 0, -0.24, -0.88, TEAL, 1, 1, 1, 6, 3);
  return join([
    torso, tail, tip,
    jamOn(0, 0.18, 0, 0.29, 0.3, 0.26, 0.9, 2.6, 0.12, 0.13),
    jamOn(0, 0.18, 0, 0.29, 0.3, 0.26, 0.55, -1.2, 0.09),
  ]);
}

/** Точка на передней поверхности эллипсоида при заданных x, y (чуть наружу на push) */
function front(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, x: number, y: number, push: number): [number, number, number] {
  const k = 1 - ((x - cx) / rx) ** 2 - ((y - cy) / ry) ** 2;
  return [x, y, cz + rz * Math.sqrt(Math.max(0, k)) + push];
}

function headGeo(): THREE.BufferGeometry {
  const C = [0, 0.18, 0.05] as const;
  const R = [0.275, 0.225, 0.29] as const;
  const skull = ball(0.25, C[0], C[1], C[2], (_x, y, z) => (y < 0.1 && z > 0.12 ? mix(TEAL, CREAM, 0.6) : TEAL), 1.1, 0.9, 1.16, 11, 8);
  // широкая улыбка по морде
  const smile = taper([-0.17, -0.08, 0, 0.08, 0.17].map((x) => front(C[0], C[1], C[2], R[0], R[1], R[2], x, 0.1 - 0.05 * (1 - Math.abs(x) / 0.17), 0.006)), 0.014, 0.014, MOUTH, 6, 4, false);
  // тёмные веки: закрытый глаз — тёмная щёлка
  const lids = [-1, 1].map((sx) => ball(0.104, sx * EYE_X, EYE_Y - 0.01, EYE_Z - 0.01, SOCKET, 1, 1, 0.95, 6, 4));
  return join([skull, smile, ...lids, jamOn(C[0], C[1], C[2], R[0], R[1], R[2], 0.75, -2.4, 0.08)]);
}

function eyesGeo(): THREE.BufferGeometry {
  return join([-1, 1].map((sx) => ball(0.095, sx * EYE_X, 0, EYE_Z + 0.005, EYE, 1, 1, 1, 7, 5)));
}

/** Две руки на общей «перекладине» плеч: висят чуть вперёд, на кистях по три присоски */
function armsGeo(): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const wrist: [number, number, number] = [sx * 0.29, -0.33, 0.15];
    list.push(taper([[sx * 0.17, 0.02, 0], [sx * 0.29, -0.16, 0.06], wrist], 0.068, 0.05, TEAL, 5, 6, false));
    list.push(ball(0.065, wrist[0], wrist[1] - 0.02, wrist[2], TEAL, 1, 0.8, 1, 5, 3));
    for (const [dx, dy, dz] of [[-0.05, -0.07, 0.05], [0.0, -0.09, 0.02], [0.05, -0.065, 0.04]] as const) {
      list.push(ball(0.04, wrist[0] + dx * sx, wrist[1] + dy, wrist[2] + dz, PAD, 1, 0.8, 1, 5, 3));
    }
  }
  return join(list);
}

/** Нога от сустава: бедро-голень, плоская стопа и три присоски впереди */
function legGeo(): THREE.BufferGeometry {
  return join([
    taper([[0, 0.05, 0], [0, -0.2, 0.06], [0, -0.42, 0.01]], 0.088, 0.066, TEAL, 5, 6, false),
    ball(0.085, 0, -0.455, 0.06, TEAL, 1.1, 0.5, 1.45, 6, 4),
    ball(0.04, 0.075, -0.475, 0.17, PAD, 1, 0.6, 1, 5, 3),
    ball(0.04, 0, -0.475, 0.2, PAD, 1, 0.6, 1, 5, 3),
    ball(0.04, -0.075, -0.475, 0.17, PAD, 1, 0.6, 1, 5, 3),
  ]);
}

// ------------------------------------------------------------------ поза

const _R = new THREE.Matrix4();
const LEG_LEN = HIP;

function pose(a: MobAnim, out: MobPose): void {
  const s = seedScale(a.seed);
  const duty = 0.5 + seedFrac(a.seed, 2) * 0.12; // свой темп: доля опоры
  const n = 2;
  const travel = (duty * 1.25) / n / s;
  const walk = smooth(clamp01(a.speed / 1.2));
  const run = smooth(clamp01((a.speed - 2.4) / 2));
  const t = a.t + a.seed * 9;
  const ph = a.gait * n;
  const tilt = (seedFrac(a.seed, 5) - 0.5) * 0.35;

  // вся фигура
  let px = 0, pz = 0, x = 0, y = 0, z = 0, rx = 0, ry = 0;
  let sc = s;
  // тело от таза
  let lean = 0.04 + walk * 0.1 + run * 0.16;
  let twist = Math.sin(ph * TAU) * 0.12 * walk;
  let roll = Math.sin(ph * TAU) * 0.05 * walk;
  let breathe = 1 + Math.sin(t * 2.2) * 0.018 * (1 - walk);
  // руки (перекладина плеч), голова, глаза
  let armsRx = -0.3 - run * 0.5 + Math.sin(t * 1.6) * 0.04;
  let armsRy = -twist * 1.6;
  let armsRz = 0;
  let armsSx = 1;
  let headRx = -lean * 0.7 + 0.05;
  let headRy = Math.sin(t * 0.7) * 0.4 * (1 - walk);
  let eyes = blink(t, a.seed);
  // ноги: обычная походка или своя поза
  let legsFree = true;
  let lRx = 0, lRz = 0, lSy = 1, rRx = 0, rRz = 0, rSy = 1, hy = HIP;

  if (a.st === ZS_ATTACK) {
    // шлёп обеими лапами-присосками сверху вниз
    const q = (a.stT / 0.6) % 1;
    const up = q < 0.45 ? smooth(q / 0.45) : q < 0.6 ? 1 - smooth((q - 0.45) / 0.15) * 1.5 : -0.5 + smooth((q - 0.6) / 0.4) * 0.5;
    armsRx = -0.5 - 2.4 * up;
    lean = -0.12 * up + (up < 0 ? -up * 0.5 : 0);
    headRx = 0.1 - lean * 0.5;
    headRy = 0;
    twist = roll = 0;
  } else if (a.st === ZS_CLIMB) {
    // прижат к стене брюхом: руки вверх врастопырку, ноги лягушкой, перехваты в такт подъёму
    const c = (a.stT * CLIMB_SPEED) / 0.62;
    const w = Math.sin(c * TAU);
    z = 0.1;
    lean = 0.12;
    twist = 0;
    roll = w * 0.07;
    armsRx = -2.75 + Math.abs(w) * 0.12;
    armsRz = w * 0.32;
    armsSx = 1.35;
    armsRy = 0;
    headRx = -0.8 + Math.sin(t * 1.3) * 0.12;
    headRy = Math.sin(t * 0.9) * 0.3;
    legsFree = false;
    hy = HIP + Math.sin(c * TAU * 2) * 0.025;
    lRx = -0.55 + w * 0.22;
    rRx = -0.55 - w * 0.22;
    lRz = 0.42;
    rRz = -0.42;
    lSy = 0.82 - Math.max(0, w) * 0.15;
    rSy = 0.82 - Math.max(0, -w) * 0.15;
  } else if (a.st === ZS_TOP) {
    // на гребне: пританцовывает, лапы вверх («бу!»), голова высматривает
    const b = Math.abs(Math.sin(a.stT * 7));
    legsFree = false;
    hy = HIP - 0.05 + b * 0.05;
    lRz = 0.22;
    rRz = -0.22;
    lRx = rRx = -0.1;
    lSy = rSy = 0.92;
    lean = -0.08;
    twist = 0;
    roll = Math.sin(a.stT * 7) * 0.06;
    armsRx = -2.3 + Math.sin(a.stT * 14) * 0.15;
    armsRz = Math.sin(a.stT * 7) * 0.35;
    armsSx = 1.3;
    armsRy = 0;
    headRx = -0.1;
    headRy = Math.sin(a.stT * 3.2) * 0.6;
  } else if (a.st === ZS_DROP) {
    // прыжок во двор звёздочкой
    const u = clamp01(a.stT / 0.5);
    legsFree = false;
    lean = 0.25 + u * 0.35;
    twist = roll = 0;
    armsRx = -2.55;
    armsRz = 0;
    armsSx = 1.5;
    armsRy = 0;
    headRx = -0.55;
    headRy = 0;
    lRx = rRx = 0.35;
    lRz = 0.6;
    rRz = -0.6;
    lSy = rSy = 0.9;
    eyes = 1;
  }

  // вздрогнул
  const h = a.hit;
  if (h > 0) {
    lean -= 0.35 * h;
    armsRx -= 1.1 * h;
    armsSx += 0.25 * h;
    headRx -= 0.45 * h;
    breathe *= 1 - 0.08 * h;
  }

  // гибель: оборот, плашмя лицом вниз (хвост торчит), лапы подёргались, расплылся и ушёл в землю
  const d = a.die;
  if (d > 0) {
    const fall = smooth(seg(d, 0.08, 0.42));
    pz = 0.25;
    ry = smooth(seg(d, 0, 0.3)) * Math.PI * 1.2;
    rx = (Math.PI / 2) * fall;
    y = bump(seg(d, 0, 0.3)) * 0.35 - smooth(seg(d, 0.72, 1)) * 0.3;
    sc = s * (1 - 0.82 * smooth(seg(d, 0.68, 1)));
    const tw = Math.sin(a.t * 30) * 0.25 * bump(seg(d, 0.4, 0.75));
    legsFree = false;
    lean = twist = roll = 0;
    armsRx = -2.0 * fall + tw;
    armsRz = tw;
    armsSx = 1.3;
    armsRy = 0;
    headRx = -0.3 * fall;
    headRy = 0;
    lRx = -0.3 * fall + tw;
    rRx = -0.3 * fall - tw;
    lRz = 0.3;
    rRz = -0.3;
    lSy = rSy = 1;
    hy = HIP;
    eyes = 1 - 0.88 * seg(d, 0.3, 0.45);
  }

  pivotBone(_R, px, 0, pz, x, y, z, rx, ry, 0, sc);
  if (legsFree) {
    hy = biped(out.legL, out.legR, _R, ph, duty, travel * walk, HIP_X, HIP, 0, LEG_LEN, 0.22);
  } else {
    linkS(out.legL, _R, HIP_X, hy, 0, lRx, 0, lRz, 1, lSy, 1);
    linkS(out.legR, _R, -HIP_X, hy, 0, rRx, 0, rRz, 1, rSy, 1);
  }
  linkS(out.body, _R, 0, hy, 0, lean, twist, roll, 1, breathe, 1);
  link(out.head, out.body, 0, NECK_Y, 0.03, headRx, headRy, tilt, 1);
  linkS(out.prop, out.head, 0, EYE_Y, 0, 0, 0, 0, 1, eyes, 1);
  linkS(out.armL, out.body, 0, ARMS_Y, 0.03, armsRx, armsRy, armsRz, armsSx, 1, 1);
}

export const climberGecko: MobDef = {
  id: 'climber-gecko',
  name: 'Геккон-присоска',
  kinds: [Z_CLIMBER],
  weight: 1,
  height: 1.55,
  parts: [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'head', geo: headGeo() },
    { bone: 'prop', geo: eyesGeo(), glow: true },
    { bone: 'armL', geo: armsGeo() },
    { bone: 'legL', geo: legGeo() },
    { bone: 'legR', geo: legGeo() },
  ],
  pose,
};
