// Липучка «Паучок-скалолаз»: круглое бирюзовое брюшко, жёлтая каска скалолаза, восемь длинных полосатых лапок
// и шесть сиреневых глаз. Лапки — две четвёрки «через одну» (как ходят пауки): пока одна стоит, другая шагает.
// На стене прижимается брюхом, лапки распластаны и перебирают вверх, голова запрокинута к защитникам;
// на гребне встаёт на дыбы и машет передними лапами; во двор прыгает на паутинке. Гибель — кверху лапками.
import * as THREE from 'three';
import { Z_CLIMBER } from '../../../shared/fortkinds.ts';
import { CLIMB_SPEED, ZS_ATTACK, ZS_CLIMB, ZS_DROP, ZS_TOP } from '../../../shared/fort.ts';
import { WALL_H, WALL_T } from '../../../shared/fortmap.ts';
import { setBoneS, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import {
  EYE, ball, bump, clamp01, hide, jamOn, join, link, linkS, paint, pivotBone, seedFrac, seedScale, seg, smooth, taper,
} from './b-parts.ts';

const TEAL = 0x3db7ae;
const TEAL_DARK = 0x22817c;
const TEAL_LIGHT = 0x8fe0d2;
const HELMET = 0xf5c02e;
const HELMET_DARK = 0xd99a16;
const FANG = 0xfff0d8;
const SILK = 0xf4ecff;
const SOCKET = 0x3a1650;

/** Центр тела (точка, вокруг которой фигура встаёт на стену) над землёй в обычной позе */
const P = 1.2;
/** Голова — от центра тела вперёд */
const HEAD_Z = 0.2;
/** Брюшко — назад */
const ABD_Z = -0.44;
const ABD_Y = 0.1;

// ------------------------------------------------------------------ геометрия

function bodyGeo(): THREE.BufferGeometry {
  // брюшко: бирюзовое, сверху три тёмные полосы-шеврона, снизу светлое
  const abd = ball(0.44, 0, ABD_Y, ABD_Z, (x, y, z) => {
    if (y < ABD_Y - 0.14) return TEAL_LIGHT;
    const band = (z - ABD_Z + 0.5 + Math.abs(x) * 0.55) * 4.2;
    return y > ABD_Y + 0.02 && band - Math.floor(band) < 0.36 && z < ABD_Z + 0.25 ? TEAL_DARK : TEAL;
  }, 0.95, 0.86, 1.06, 11, 8);
  // талия между брюшком и головой, паутинные бородавки сзади
  const waist = ball(0.17, 0, -0.02, -0.06, TEAL_DARK, 1, 0.8, 1.1, 6, 4);
  const spin = paint(new THREE.ConeGeometry(0.06, 0.12, 5).rotateX(-Math.PI / 2).translate(0, ABD_Y - 0.06, ABD_Z - 0.48), TEAL_DARK);
  const R = [0.418, 0.378, 0.466] as const;
  return join([
    abd, waist, spin,
    jamOn(0, ABD_Y, ABD_Z, R[0], R[1], R[2], 0.6, 2.4, 0.13, 0.14),
    jamOn(0, ABD_Y, ABD_Z, R[0], R[1], R[2], 0.42, -0.9, 0.1),
  ]);
}

function headGeo(): THREE.BufferGeometry {
  const head = ball(0.27, 0, 0, 0, (_x, y, z) => (y < -0.09 && z > 0 ? TEAL_LIGHT : TEAL), 1.05, 0.88, 1, 11, 8);
  // каска скалолаза: купол, козырёк, гребень
  const dome = paint(new THREE.SphereGeometry(0.24, 11, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.08, 0.9, 1.08).translate(0, 0.08, -0.01), (_x, y) => (y > 0.25 ? HELMET_DARK : HELMET));
  const brim = paint(new THREE.CylinderGeometry(0.275, 0.28, 0.035, 12, 1, true).scale(1.02, 1, 1.14).translate(0, 0.08, 0.02), HELMET_DARK);
  const ridge = paint(new THREE.BoxGeometry(0.05, 0.05, 0.4).translate(0, 0.29, -0.01), HELMET_DARK);
  // тёмные «глазницы» — светящиеся глаза на них читаются ярче
  const sockets = [-1, 1].map((sx) => ball(0.098, sx * 0.095, 0.0, 0.2, SOCKET, 1, 1.1, 0.7, 6, 3));
  // хелицеры-клычки
  const fangs = [-1, 1].map((sx) => paint(new THREE.ConeGeometry(0.038, 0.13, 5).rotateX(Math.PI + 0.35).translate(sx * 0.065, -0.17, 0.19), FANG));
  return join([head, dome, brim, ridge, ...sockets, ...fangs, jamOn(0, 0.08, -0.01, 0.259, 0.216, 0.259, 0.55, -2.2, 0.08)]);
}

function eyesGeo(): THREE.BufferGeometry {
  // два больших глаза и четыре маленьких — паучьи «фары»
  return join([
    ball(0.08, 0.095, 0.0, 0.225, EYE, 1, 1.1, 0.8, 7, 5),
    ball(0.08, -0.095, 0.0, 0.225, EYE, 1, 1.1, 0.8, 7, 5),
    ball(0.036, 0.17, 0.085, 0.17, EYE, 1, 1, 0.8, 5, 3),
    ball(0.036, -0.17, 0.085, 0.17, EYE, 1, 1, 0.8, 5, 3),
    ball(0.03, 0.055, 0.115, 0.225, EYE, 1, 1, 0.8, 5, 3),
    ball(0.03, -0.055, 0.115, 0.225, EYE, 1, 1, 0.8, 5, 3),
  ]);
}

/** Лапы одной четвёрки в координатах модели (стопы на y = 0): group 0 — Л1 П2 Л3 П4, group 1 — П1 Л2 П3 Л4 */
function legsGeo(group: 0 | 1): THREE.BufferGeometry {
  const footZ = [0.66, 0.22, -0.22, -0.62];
  const list: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const side = (i + group) % 2 === 0 ? 1 : -1;
    const zf = footZ[i];
    const hip: [number, number, number] = [side * 0.13, P - 0.04, 0.1 - i * 0.075];
    const knee: [number, number, number] = [side * 0.5, P + 0.32, zf * 0.6];
    const shin: [number, number, number] = [side * 0.78, P * 0.45, zf * 0.94];
    const foot: [number, number, number] = [side * 0.84, 0.035, zf];
    // полосатые «гетры» на голени
    list.push(taper([hip, knee, shin, foot], 0.058, 0.036, (_x, y) => (y < P * 0.62 && Math.floor(y * 5.5) % 2 === 0 ? TEAL_DARK : TEAL), 5, 5, false));
    list.push(ball(0.048, foot[0], foot[1], foot[2], TEAL_DARK, 1.15, 0.8, 1.3, 5, 3));
  }
  return join(list);
}

/** Паутинка: тонкая нить от 0 до 1 по Y (растягивается позой) */
function threadGeo(): THREE.BufferGeometry {
  return paint(new THREE.CylinderGeometry(0.02, 0.02, 1, 4, 1, true).translate(0, 0.5, 0), SILK);
}

// ------------------------------------------------------------------ поза

const _R = new THREE.Matrix4();
const _spin = new THREE.Vector3();
const DROP_S = 0.5;
const DROP_RUN = WALL_T + 1 - 1.7;

function pose(a: MobAnim, out: MobPose): void {
  const s = seedScale(a.seed);
  const lean0 = (seedFrac(a.seed, 3) - 0.5) * 0.3;
  const n = a.seed < 0.5 ? 3 : 4; // шагов на 1,25 м — свой темп у особи
  const D = (0.5 * 1.25) / n / s; // путь стопы в опоре в осях модели (модель отмасштабирована ростом)
  const walk = smooth(clamp01(a.speed / 1.4));
  const t = a.t + a.seed * 9;

  let ph = a.gait * n; // фаза четвёрки A (у B — +0,5)
  let stride = walk; // размах шага
  let lift = 0.12;
  let k = 1; // сплющить лапы по высоте (на стене — распластаны)
  let spread = 1;
  // вся фигура: поворот вокруг точки (px, py, pz), сдвиг
  let px = 0, py = 0, pz = 0, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0;
  let bob = Math.sin(ph * Math.PI * 4) * 0.018 * walk + Math.sin(t * 2.1) * 0.012 * (1 - walk);
  let roll = Math.sin(ph * Math.PI * 2) * 0.04 * walk;
  let headRx = 0.08 + walk * 0.1;
  let headRy = Math.sin(t * 0.8) * 0.35 * (1 - walk);
  let thread = -1;

  if (a.st === ZS_ATTACK) {
    // встаёт на задние лапы и с размаху бьёт передними
    const q = (a.stT / 0.62) % 1;
    const up = q < 0.55 ? smooth(q / 0.55) : q < 0.68 ? 1 - smooth((q - 0.55) / 0.13) * 1.35 : -0.35 + smooth((q - 0.68) / 0.32) * 0.35;
    pz = -0.5;
    rx = -0.55 * up;
    headRx = -0.25 * up + 0.2;
    stride = 0;
    lift = 0;
  } else if (a.st === ZS_CLIMB) {
    // прижат к стене (она впереди, +Z): тело «носом» вверх, лапы распластаны и перебирают в такт подъёму
    py = P;
    y = 0.78 - P * s;
    z = 0.06;
    rx = -Math.PI / 2;
    ph = ((a.stT * CLIMB_SPEED) / 1.25) * n;
    stride = 1;
    lift = 0.16;
    k = 0.32;
    bob = Math.sin(ph * Math.PI * 4) * 0.02;
    roll = Math.sin(ph * Math.PI * 2) * 0.07;
    headRx = -0.55 + Math.sin(t * 1.7) * 0.12;
    headRy = Math.sin(t * 1.1) * 0.25;
  } else if (a.st === ZS_TOP) {
    // на гребне: на дыбы, передние лапы машут, голова крутится — высматривает, кого схватить
    pz = -0.5;
    rx = -0.5 - Math.sin(a.stT * 7) * 0.06;
    ph = a.stT * 3.2;
    stride = 0.35;
    lift = 0.22;
    headRx = 0.1;
    headRy = Math.sin(a.stT * 3.5) * 0.55;
    bob = Math.abs(Math.sin(a.stT * 7)) * 0.04;
  } else if (a.st === ZS_DROP) {
    // прыжок во двор на паутинке: лапы звездой, нос вниз
    const u = clamp01(a.stT / DROP_S);
    py = P;
    rx = 0.25 + 0.35 * u;
    stride = 0;
    lift = 0;
    k = 0.42;
    spread = 1.28;
    headRx = -0.45;
    roll = Math.sin(a.stT * 11) * 0.12;
    thread = u;
  }

  // вздрогнул: откинулся, лапы врастопырку
  const h = a.hit;
  if (h > 0) {
    rx -= 0.28 * h;
    k *= 1 - 0.12 * h;
    spread *= 1 + 0.08 * h;
    headRx -= 0.4 * h;
  }

  // гибель: подпрыгнул, перевернулся кверху лапками, подёргал ими и ушёл в землю
  const d = a.die;
  let sc = s;
  if (d > 0) {
    const flip = smooth(seg(d, 0, 0.3));
    px = 0; pz = 0;
    py = P;
    x = 0; z = 0;
    rx = 0;
    rz = Math.PI * flip;
    y = (0.48 - P) * s * flip + bump(seg(d, 0, 0.3)) * 0.55 - seg(d, 0.7, 1) * 0.35;
    ph = a.t * 6;
    stride = 0.3 * flip;
    lift = 0.2 * flip;
    k = 1 - 0.45 * flip;
    sc = s * (1 - 0.85 * smooth(seg(d, 0.68, 1)));
    headRx = 0.3 * flip;
    thread = -1;
  }

  pivotBone(_R, px, py, pz, x, y, z, rx, ry, rz, sc);
  // тело и голова
  link(out.body, _R, 0, P + bob, 0, 0, 0, roll + lean0 * 0.2, 1);
  link(out.head, out.body, 0, 0.03, HEAD_Z, headRx, headRy, lean0, 1);
  // четвёрки лап: в опоре стопа едет назад со скоростью земли, в переносе — вперёд и вверх
  const A = legPhase(ph, D * stride);
  linkS(out.legL, _R, 0, P * (1 - k) + k * lift * A.lift, A.z, 0, 0, 0, spread, k, spread);
  const B = legPhase(ph + 0.5, D * stride);
  linkS(out.legR, _R, 0, P * (1 - k) + k * lift * B.lift, B.z, 0, 0, 0, spread, k, spread);
  // паутинка во время прыжка: от бородавок к точке на гребне, откуда прыгнул
  if (thread >= 0) {
    const u = thread;
    const yRoot = WALL_H * (1 - u * u) + 1.2 * u * (1 - u);
    _spin.set(0, ABD_Y - 0.06, ABD_Z - 0.46).applyMatrix4(out.body);
    const dx = -_spin.x;
    const dy = WALL_H - yRoot + 0.55 - _spin.y;
    const dz = -DROP_RUN * u - _spin.z;
    const len = Math.max(0.05, Math.hypot(dx, dy, dz));
    setBoneS(out.extra, _spin.x, _spin.y, _spin.z, Math.acos(Math.max(-1, Math.min(1, dy / len))), Math.atan2(dx, dz), 0, 1, len, 1);
  } else {
    hide(out.extra);
  }
}

/** Стопа четвёрки: z — вдоль хода (опора — назад со скоростью земли), lift — подъём 0…1 */
const LEG = { z: 0, lift: 0 };
function legPhase(phase: number, travel: number): typeof LEG {
  const p = phase - Math.floor(phase);
  if (p < 0.5) {
    LEG.z = (0.5 - p / 0.5) * travel;
    LEG.lift = 0;
  } else {
    const u = (p - 0.5) / 0.5;
    LEG.z = (-0.5 + smooth(u)) * travel;
    LEG.lift = Math.sin(Math.PI * u);
  }
  return LEG;
}

export const climberSpider: MobDef = {
  id: 'climber-spider',
  name: 'Паучок-скалолаз',
  kinds: [Z_CLIMBER],
  weight: 1,
  height: 1.62,
  parts: [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'head', geo: headGeo() },
    { bone: 'head', geo: eyesGeo(), glow: true },
    { bone: 'legL', geo: legsGeo(0) },
    { bone: 'legR', geo: legsGeo(1) },
    { bone: 'extra', geo: threadGeo() },
  ],
  pose,
};
