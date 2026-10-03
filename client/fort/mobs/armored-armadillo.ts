// Броненосец в латах (Z_ARMORED «Чугунок», набор C). Здоровяк в чугунных кольцах-латах (как стопка чугунков), с
// наплечниками и бронированным хвостом. Голова без брони — розовая морда с длинным носом, большими ушами, высунутым
// языком и красным пером: туда и надо целиться (сервер не режет урон в голову). Ходит тяжело, руки вперёд, как все
// зомби; атака — молот двумя кулаками сверху. От удара втягивает голову в латы и закрывается руками; гибель —
// сворачивается в шар, откатывается и уходит в землю. Части: латы, голова, глаза, руки (одной частью), две ноги.
import * as THREE from 'three';
import { ZS_ATTACK } from '../../../shared/fort.ts';
import { Z_ARMORED } from '../../../shared/fortkinds.ts';
import { merge, setBoneS, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import {
  JAM_LIGHT, attach, ellipsoid, eyeBalls, finish, lathe, limb, mix, paint, paintFaces, pupils, rnd, smooth, splat, step,
  type Step,
} from './c-kit.ts';

interface Look {
  id: string;
  name: string;
  weight: number;
  iron: number;
  rim: number;
  skin: number;
  inner: number;
  plume: number;
}

const LOOKS: Look[] = [
  { id: 'armored-armadillo', name: 'Броненосец в латах', weight: 2, iron: 0x5d6971, rim: 0x9aa6ac, skin: 0xe6b49a, inner: 0xf29aa8, plume: 0xe2402e },
  { id: 'armored-armadillo-rust', name: 'Броненосец в латах (ржавый)', weight: 1, iron: 0x87553a, rim: 0xc98a55, skin: 0xd9a58c, inner: 0xf0909c, plume: 0x3a7fd9 },
];

const HIP = 0.62;
const HIP_X = 0.22;
const NECK = new THREE.Vector3(0, 1.4, 0.06);
const SHOULDER_Y = 1.3;
const ATTACK_PERIOD = 0.5;
/** Голова крупнее — в неё целятся */
const HEAD_S = 1.2;

/** Латы: пять колец с отогнутым нижним краем (как панцирь броненосца), сверху ворот */
function bodyGeo(l: Look): THREE.BufferGeometry {
  const bands: Array<[number, number]> = [[0.43, 0.5], [0.5, 0.67], [0.52, 0.84], [0.49, 1.01], [0.42, 1.18]];
  const prof: Array<[number, number]> = [[0, 0.5]];
  for (const [r, y0] of bands) prof.push([r + 0.045, y0], [r + 0.035, y0 + 0.04], [r - 0.015, y0 + 0.17]);
  prof.push([0.3, 1.38], [0.24, 1.43], [0, 1.43]);
  // кольцо: светлый отогнутый край (сегмент 0…0,04), тёмная грань, ступенька к следующему
  const torso = paintFaces(lathe(prof, 10), (x, y) => {
    if (y < 0.502 || y > 1.36) return mix(l.iron, 0x000000, 0.25);
    const k = (y - 0.5) / 0.17;
    const f = k - Math.floor(k);
    if (f < 0.012 || f > 0.988) return mix(l.iron, 0x000000, 0.3);
    return f < 0.25 ? l.rim : l.iron;
  });
  const p: THREE.BufferGeometry[] = [torso];
  for (const s of [-1, 1]) {
    p.push(paint(new THREE.SphereGeometry(0.21, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 1.05).translate(s * 0.46, 1.27, 0.0), (x, y) => (y < 1.31 ? l.rim : l.iron)));
  }
  // хвост в кольцах волочится сзади
  p.push(paintFaces(limb([0, 0.62, -0.38], [0, 0.07, -0.95], 0.15, 0.045, 8, false), (x, y) => ((Math.floor(y * 9) & 1) ? l.iron : l.rim)));
  p.push(splat([0.25, 0.93, 0.47], [0.45, 0.1, 0.89], 0.14, JAM_LIGHT), splat([-0.49, 0.7, 0.1], [-0.97, 0, 0.2], 0.12, JAM_LIGHT));
  return merge(p).translate(0, -HIP, 0);
}

const EYES: Array<readonly [number, number, number]> = [[-0.115, 0.21, 0.21], [0.115, 0.21, 0.21]];

/** Голова без брони: длинный нос пятачком, уши-лопухи, язык, красное перо */
function headGeo(l: Look): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(paint(ellipsoid(0.2, 0.19, 0.24, 10, 7).translate(0, 0.16, 0.06), l.skin));
  p.push(paint(limb([0, 0.13, 0.18], [0, 0.07, 0.47], 0.115, 0.065, 8, false), l.skin));
  p.push(paint(ellipsoid(0.07, 0.06, 0.05, 6, 4).translate(0, 0.07, 0.49), l.inner));
  for (const s of [-1, 1]) {
    p.push(paint(ellipsoid(0.065, 0.16, 0.03, 6, 4).rotateZ(-s * 0.4).translate(s * 0.15, 0.38, -0.02), (x, y, z) => (z > 0.0 && Math.abs(x) < 0.21 ? l.inner : l.skin)));
  }
  p.push(paint(ellipsoid(0.045, 0.016, 0.07, 5, 3).rotateY(0.5).rotateX(0.5).translate(0.05, 0.0, 0.42), 0xf06a8a));
  for (const a of [-0.35, 0.15]) p.push(paint(ellipsoid(0.035, 0.17, 0.05, 5, 3).rotateZ(a).rotateX(-0.35).translate(Math.sin(-a) * 0.08, 0.45, -0.08), l.plume));
  p.push(...pupils(EYES.map(([x, y, z]) => [x * 1.05, y, z + 0.045] as const), 0.03));
  return merge(p).scale(HEAD_S, HEAD_S, HEAD_S);
}

/** Руки одной частью: обе висят от линии плеч, кулаки-латные рукавицы */
function armsGeo(l: Look): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    p.push(paint(limb([s * 0.47, 0.02, 0], [s * 0.5, -0.36, 0.04], 0.1, 0.09, 7, false), l.iron));
    p.push(paint(ellipsoid(0.12, 0.13, 0.13, 7, 5).translate(s * 0.5, -0.45, 0.06), (x, y, z) => (z > 0.13 ? l.rim : mix(l.iron, 0x000000, 0.15))));
  }
  return merge(p);
}

function legGeo(l: Look): THREE.BufferGeometry {
  return merge([
    paint(limb([0, 0.02, 0], [0, -0.5, 0.02], 0.135, 0.11, 8, false), (x, y) => (y < -0.3 ? l.iron : mix(l.skin, 0x000000, 0.08))),
    paint(new THREE.SphereGeometry(0.1, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, -0.27, 0.1), l.rim),
    paint(ellipsoid(0.135, 0.08, 0.2, 8, 4).translate(0, -0.55, 0.07), (x, y, z) => (z > 0.18 ? l.rim : mix(l.iron, 0x000000, 0.2))),
  ]);
}

const _st: Step = { z: 0, lift: 0, stance: false };
const BONES_USED = ['body', 'head', 'armL', 'legL', 'legR'] as const;

function build(l: Look): MobDef {
  return {
    id: l.id,
    name: l.name,
    kinds: [Z_ARMORED],
    weight: l.weight,
    height: 1.87,
    parts: [
      { bone: 'body', geo: bodyGeo(l) },
      { bone: 'head', geo: headGeo(l) },
      { bone: 'head', geo: merge(eyeBalls(EYES, 0.062)).scale(HEAD_S, HEAD_S, HEAD_S), glow: true },
      { bone: 'armL', geo: armsGeo(l) },
      { bone: 'legL', geo: legGeo(l) },
      { bone: 'legR', geo: legGeo(l) },
    ],
    pose: poseArmadillo,
  };
}

function poseArmadillo(a: MobAnim, out: MobPose): void {
  const sd = a.seed;
  const t = a.t;
  const w = smooth(0.1, 0.9, a.speed);
  const scale = 0.92 + 0.16 * rnd(sd, 1);
  const tilt = (rnd(sd, 2) - 0.5) * 0.24;
  const hit = a.hit * a.hit * (3 - 2 * a.hit);
  const breathe = Math.sin(t * 1.8 + sd * 6.3);
  const ph = a.gait * Math.PI * 2;
  const lift = 0.13 * w;

  // тяжёлый шаг: корпус переваливается, просаживается в двойной опоре
  let lean = 0.06 + 0.06 * w;
  let roll = Math.sin(ph) * 0.06 * w;
  let yaw = Math.sin(ph) * 0.05 * w;
  let bob = -Math.abs(Math.cos(ph)) * 0.06 * w + 0.01 * breathe;
  let sy = 1 + 0.012 * breathe;
  let armRx = -1.2 + 0.08 * Math.sin(ph * 2) * w + 0.04 * breathe;
  let armS = 1;
  let headY = 0;
  let headZ = 0;
  let headRx = -0.05 + 0.05 * Math.sin(ph * 2 - 0.5) * w;
  let headRz = tilt + 0.04 * Math.sin(t * 0.8 + sd * 3);
  let headS = 1;

  if (a.st === ZS_ATTACK) {
    // молот двумя кулаками: замах над головой — удар вниз — назад
    const q = (a.stT % ATTACK_PERIOD) / ATTACK_PERIOD;
    const raise = smooth(0, 0.45, q) * (1 - smooth(0.45, 0.6, q));
    const slam = smooth(0.45, 0.6, q) * (1 - smooth(0.7, 1, q));
    armRx = -1.2 - 1.75 * raise + 0.35 * slam;
    lean += -0.15 * raise + 0.25 * slam;
    bob -= 0.05 * slam;
    headRx += -0.2 * raise + 0.15 * slam;
  }

  // удар: втягивает голову в латы, закрывается руками, сжимается
  lean += 0.18 * hit;
  sy -= 0.08 * hit;
  armRx = armRx * (1 - hit) + -2.0 * hit;
  headY -= 0.17 * hit;
  headZ -= 0.08 * hit;
  headS -= 0.2 * hit;

  // гибель: сворачивается в шар (голова, руки, ноги прячутся), откатывается назад и уходит в землю
  const d = a.die;
  const curl = smooth(0, 0.3, d);
  const rollT = smooth(0.25, 0.8, d);
  const sink = smooth(0.75, 1, d);
  headS *= 1 - 0.85 * curl;
  headY -= 0.3 * curl;
  armS = 1 - 0.85 * curl;
  sy *= 1 - 0.28 * curl;
  const ball = 1 + 0.06 * curl;
  lean = lean * (1 - curl) + 0.5 * curl - Math.PI * 1.6 * rollT;
  bob = bob * (1 - curl) - 0.12 * curl;
  roll *= 1 - curl;
  yaw *= 1 - curl;
  const back = -0.9 * rollT;

  setBoneS(out.body, 0, HIP + bob, back, lean, yaw, roll, ball, sy, ball);
  attach(out.head, out.body, NECK.x, NECK.y - HIP + headY, NECK.z + headZ, headRx, 0, headRz, Math.max(0.05, headS));
  attach(out.armL, out.body, 0, SHOULDER_Y - HIP, 0.02, armRx, 0, 0, Math.max(0.05, armS));
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1;
    const bone = i === 0 ? out.legL : out.legR;
    if (curl > 0) {
      attach(bone, out.body, s * HIP_X, 0.25 * curl, 0, -0.6 * curl, 0, 0, 1 - 0.7 * curl);
      continue;
    }
    // путь ступни делим на рост особи: весь скелет потом умножится на scale, а в мире ступня должна стоять
    step(a.gait + (i === 0 ? 0 : 0.5), 1.25 / scale, 0.6, lift, _st);
    // нога вращается в бедре к ступне и чуть тянется, чтобы ступня стояла на земле
    const hipY = HIP + bob;
    const fz = _st.z * w;
    const drop = hipY - _st.lift;
    const ang = Math.atan2(fz, drop);
    const len = Math.hypot(fz, drop) / HIP;
    setBoneS(bone, s * HIP_X, hipY, 0, -ang + 0.25 * hit, yaw * 0.5, 0, 1, Math.min(1.2, len), 1);
  }
  finish(out, BONES_USED, scale * (1 - 0.4 * sink), -0.8 * sink);
}

export const ARMORED_ARMADILLOS: MobDef[] = LOOKS.map(build);
