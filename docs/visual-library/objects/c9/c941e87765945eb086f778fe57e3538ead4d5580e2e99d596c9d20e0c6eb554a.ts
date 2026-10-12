// Бобёр-подрывник (Z_SAPPER, набор C). Несёт на спине бочку на ремнях, фитиль искрит (glow). Бегом — короткими
// лапами, бочка подпрыгивает с запаздыванием. Закладка (ZS_PLANT, фитиль 3 с): закидывает бочку через голову к воротам,
// искра ползёт по фитилю, бобёр пятится и трясётся. Подрывник всегда гибнет вместе с бочкой, поэтому гибель (и ZS_BARREL —
// вспышка взрыва, если рендерер передаст её состоянием) — бочка раздувается и лопается, бобра подбрасывает кувырком.
// Голова слита с телом: на бочку и искру нужны свои части (бюджет — 6). Части: тело, глаза, две лапы, бочка, искра.
import * as THREE from 'three';
import { ZS_ATTACK, ZS_BARREL, ZS_PLANT } from '../../../shared/fort.ts';
import { Z_SAPPER } from '../../../shared/fortkinds.ts';
import { merge, setBone, setBoneS, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import {
  attach, attachS, ellipsoid, eyeBalls, finish, lathe, limb, mix, paint, paintFaces, pupils, rnd, smooth, splat,
  spring, step, type Step,
} from './c-kit.ts';

interface Look {
  id: string;
  name: string;
  weight: number;
  fur: number;
  belly: number;
  tail: number;
  hat: 'helmet' | 'cap';
  hatColor: number;
  wood: number;
}

const LOOKS: Look[] = [
  { id: 'sapper-beaver', name: 'Бобёр-подрывник', weight: 2, fur: 0x9a6235, belly: 0xdcab70, tail: 0x5a3b2b, hat: 'helmet', hatColor: 0xf4c430, wood: 0xb07a43 },
  { id: 'sapper-beaver-ginger', name: 'Бобёр-подрывник (рыжий)', weight: 1, fur: 0xbd7a3a, belly: 0xf0c890, tail: 0x6b4430, hat: 'cap', hatColor: 0xe0402f, wood: 0x9c6838 },
];

const HIP = 0.3;
const HIP_X = 0.15;
/** Бочка на спине (в осях тела, от бёдер) и её путь при закладке (в осях модели) */
/** Бочка на спине завалена на правое плечо: спереди торчит из-за плеча, силуэт «тащит бочку» */
const BACK = new THREE.Vector3(0.1, 0.56, -0.36);
const BACK_TILT = -0.42;
/** Бочка крупнее модели «по лекалу» — чтобы торчала из-за плеч и со стены было видно, кто несёт */
const BS = 1.18;
const LAND = new THREE.Vector3(0, 0.23 * BS + 0.01, 0.7);
const APEX = new THREE.Vector3(0, 1.85, 0.2);
/** Фитиль: от крышки до кончика (в осях бочки) */
const FUSE: Array<readonly [number, number, number]> = [[0.06, 0.22, 0], [0.13, 0.33, 0.02], [0.08, 0.43, 0.05]];
const FUSE_S = 3;
const TOSS = 0.45;

function bodyGeo(l: Look): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // туловище-груша: живот светлее
  parts.push(paint(ellipsoid(0.33, 0.37, 0.29, 11, 8).translate(0, 0.6, 0),
    (x, y, z) => mix(l.fur, l.belly, smooth(0.08, 0.22, z) * smooth(0.95, 0.75, y))));
  parts.push(paint(ellipsoid(0.235, 0.215, 0.23, 11, 8).translate(0, 1.08, 0.07), l.fur));
  parts.push(paint(ellipsoid(0.16, 0.105, 0.11, 7, 4).translate(0, 1.0, 0.25), l.belly));
  parts.push(paint(ellipsoid(0.055, 0.04, 0.035, 6, 4).translate(0, 1.065, 0.355), 0x3a2420));
  // зубы — главная примета бобра
  for (const s of [-1, 1]) parts.push(paint(new THREE.BoxGeometry(0.052, 0.085, 0.025).translate(s * 0.029, 0.905, 0.33), 0xfff4d8));
  for (const s of [-1, 1]) parts.push(paint(ellipsoid(0.06, 0.06, 0.035, 5, 3).translate(s * 0.17, 1.24, 0.0), mix(l.fur, 0x000000, 0.25)));
  // лапки держат ремни, ремни крест-накрест (патронташ)
  for (const s of [-1, 1]) {
    parts.push(paint(limb([s * 0.28, 0.78, 0.04], [s * 0.2, 0.6, 0.22], 0.065, 0.055, 6, false), l.fur));
    parts.push(paint(ellipsoid(0.065, 0.06, 0.06, 6, 4).translate(s * 0.2, 0.58, 0.24), mix(l.fur, 0x000000, 0.3)));
    parts.push(paint(new THREE.BoxGeometry(0.06, 0.46, 0.03).rotateZ(s * 0.62).rotateX(-0.3).translate(0, 0.66, 0.265), 0x4a2e1f));
  }
  // хвост-лопата волочится сзади, «чешуя» клеткой
  parts.push(paintFaces(ellipsoid(0.16, 0.045, 0.27, 8, 4).rotateX(0.32).translate(0, 0.14, -0.42),
    (x, y, z) => ((Math.floor(x * 18) + Math.floor(z * 14)) & 1 ? l.tail : mix(l.tail, 0x000000, 0.25))));
  if (l.hat === 'helmet') {
    parts.push(paint(new THREE.SphereGeometry(0.25, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.78, 1).translate(0, 1.2, 0.05), l.hatColor));
    parts.push(paint(new THREE.CylinderGeometry(0.3, 0.3, 0.025, 9).translate(0, 1.2, 0.08), mix(l.hatColor, 0x000000, 0.12)));
  } else {
    parts.push(paint(new THREE.SphereGeometry(0.245, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.9, 1).translate(0, 1.17, 0.04), l.hatColor));
    parts.push(paint(new THREE.CylinderGeometry(0.255, 0.255, 0.07, 9).translate(0, 1.18, 0.04), mix(l.hatColor, 0x000000, 0.25)));
    parts.push(paint(ellipsoid(0.075, 0.075, 0.075, 5, 4).translate(0, 1.42, 0.04), 0xfff4e8));
  }
  parts.push(...pupils([[-0.098, 1.13, 0.296], [0.098, 1.13, 0.296]], 0.027));
  parts.push(splat([0.13, 0.48, 0.27], [0.4, -0.1, 0.9], 0.1), splat([-0.19, 1.12, 0.12], [-0.85, 0.2, 0.45], 0.075));
  return merge(parts).translate(0, -HIP, 0);
}

function footGeo(l: Look): THREE.BufferGeometry {
  return merge([
    paint(limb([0, 0.05 - HIP, 0], [0, -0.02, 0], 0.075, 0.075, 6, false), l.fur),
    paint(ellipsoid(0.095, 0.05, 0.16, 8, 4).translate(0, 0.05 - HIP, 0.05), 0x3e2b22),
  ]);
}

/** Бочка: клёпки (полосы по углу), два обруча, крышка; фиолетовая клякса; фитиль */
function barrelGeo(l: Look): THREE.BufferGeometry {
  const g = lathe([[0, -0.23], [0.165, -0.23], [0.18, -0.18], [0.193, -0.12], [0.205, 0], [0.193, 0.12], [0.18, 0.18], [0.165, 0.23], [0, 0.23]], 12);
  const barrel = paintFaces(g, (x, y, z) => {
    if (Math.abs(y) > 0.225) return mix(l.wood, 0x000000, 0.3);
    if (Math.abs(y) > 0.12 && Math.abs(y) < 0.18) return 0x4a4f55;
    const a = Math.atan2(x, z);
    return Math.floor((a / (Math.PI * 2)) * 12 + 12) % 2 ? l.wood : mix(l.wood, 0x000000, 0.14);
  });
  const fuse = [limb(FUSE[0], FUSE[1], 0.016, 0.014, 4, false), limb(FUSE[1], FUSE[2], 0.014, 0.012, 4, false)].map((f) => paint(f, 0x3a2a1a));
  return merge([barrel, ...fuse, splat([0.1, 0.0, 0.18], [0.5, 0, 0.87], 0.1)]).scale(BS, BS, BS);
}

/** Искра-звёздочка: ядро и три острых луча — светится сама */
function sparkGeo(): THREE.BufferGeometry {
  return merge([
    paint(new THREE.IcosahedronGeometry(0.045, 0), 0xffd04a),
    paint(new THREE.OctahedronGeometry(1, 0).scale(0.03, 0.12, 0.03), 0xff9a1e),
    paint(new THREE.OctahedronGeometry(1, 0).scale(0.12, 0.03, 0.03).rotateZ(0.5), 0xff9a1e),
    paint(new THREE.OctahedronGeometry(1, 0).scale(0.03, 0.03, 0.11).rotateX(0.4), 0xff7a10),
  ]);
}

const _b = new THREE.Matrix4();
const _st: Step = { z: 0, lift: 0, stance: false };
const _p = new THREE.Vector3();
const BONES_USED = ['body', 'head', 'legL', 'legR', 'prop', 'extra'] as const;

function build(l: Look): MobDef {
  return {
    id: l.id,
    name: l.name,
    kinds: [Z_SAPPER],
    weight: l.weight,
    height: 1.38,
    parts: [
      { bone: 'body', geo: bodyGeo(l) },
      { bone: 'head', geo: merge(eyeBalls([[-0.095, 1.13 - HIP, 0.255], [0.095, 1.13 - HIP, 0.255]], 0.055)), glow: true },
      { bone: 'legL', geo: footGeo(l) },
      { bone: 'legR', geo: footGeo(l) },
      { bone: 'prop', geo: barrelGeo(l) },
      { bone: 'extra', geo: sparkGeo(), glow: true },
    ],
    pose: poseBeaver,
  };
}

/** Квадратичная кривая броска бочки */
function arc(s: number, out: THREE.Vector3): THREE.Vector3 {
  const u = 1 - s;
  return out.set(u * u * BACK.x, u * u * (BACK.y + HIP + 0.1) + 2 * u * s * APEX.y + s * s * LAND.y, u * u * BACK.z + 2 * u * s * APEX.z + s * s * LAND.z);
}

function poseBeaver(a: MobAnim, out: MobPose): void {
  const sd = a.seed;
  const t = a.t;
  const w = smooth(0.1, 1.2, a.speed);
  const run = smooth(2.5, 4.5, a.speed);
  const scale = 0.92 + 0.16 * rnd(sd, 1);
  const hit = a.hit * a.hit * (3 - 2 * a.hit);
  const breathe = Math.sin(t * 2.6 + sd * 6.3);
  const ph = a.gait * Math.PI * 2;
  const duty = 0.5 - 0.15 * run;
  // манера бега у каждого своя: выше или ниже поднимает лапы, сильнее или слабее подпрыгивает
  const style = 0.8 + 0.4 * rnd(sd, 4);
  const lift = (0.09 + 0.05 * run) * w * style;

  // бег: короткие лапы без скольжения, корпус подпрыгивает дважды за цикл и наклонён вперёд под тяжестью
  let lean = 0.08 + 0.18 * w + 0.08 * run + (rnd(sd, 3) - 0.5) * 0.08;
  let roll = Math.sin(ph) * 0.07 * w * style + (rnd(sd, 2) - 0.5) * 0.12;
  let yaw = 0.05 * Math.sin(t * 0.7 + sd * 4) * (1 - w);
  let bob = Math.abs(Math.sin(ph)) * (0.04 + 0.04 * run) * w * style + 0.008 * breathe;
  let bx = 0;
  let bz = 0;
  let sy = 1 + 0.015 * breathe - 0.1 * hit;
  lean -= 0.3 * hit;

  const planting = a.st === ZS_PLANT;
  const boomT = a.st === ZS_BARREL ? Math.min(1, a.stT / 1.2) : a.die;
  let footBack = 0;
  let barrelS = 1;
  let barrelSy = 1;
  let fuseK = 0;
  let sparkS = 0.8 + 0.35 * Math.abs(Math.sin(t * 31 + sd * 9)) + 0.15 * Math.sin(t * 13);
  let tossS = -1;

  if (planting) {
    const u = a.stT;
    tossS = smooth(0.06, TOSS, u);
    const throwLean = -0.3 * smooth(0, 0.1, u) * (1 - smooth(0.1, 0.25, u)) + 0.5 * smooth(0.12, 0.3, u) * (1 - smooth(0.35, 0.7, u));
    const fear = smooth(0.6, FUSE_S, u);
    lean = 0.05 + throwLean + 0.12 * smooth(0.6, 1, u) - 0.3 * hit;
    sy = 1 - 0.08 * smooth(0.5, 0.9, u) - 0.06 * fear + 0.01 * Math.sin(u * 50) * fear;
    bx = 0.02 * Math.sin(u * 47) * (0.3 + fear);
    yaw = 0.35 * Math.sin(u * 4.5) * smooth(0.6, 1, u);
    footBack = -0.16 * smooth(0.55, 1.1, u);
    bz = footBack;
    bob = 0.03 * Math.abs(Math.sin(u * 9)) * smooth(0.6, 1, u);
    roll = 0.05 * Math.sin(u * 9);
    fuseK = smooth(0.55, FUSE_S, u);
    barrelSy = 1 - 0.12 * Math.exp(-Math.max(0, u - TOSS) * 14) * (u > TOSS ? 1 : 0) + 0.025 * Math.sin(u * 38) * fear;
    barrelS = 1 + 0.06 * smooth(2.3, FUSE_S, u);
    sparkS *= 1 + 0.6 * fear;
  } else if (a.st === ZS_ATTACK) {
    // грызёт ворота: часто-часто клюёт вперёд
    const q = a.stT * 14;
    lean = 0.35 + 0.12 * Math.abs(Math.sin(q)) - 0.3 * hit;
    sy = 1 - 0.04 * Math.abs(Math.sin(q));
    bz = 0.06;
  }

  // взрыв: бочка раздувается и лопается, бобра подбрасывает кувырком (от бочки у ворот — назад на спину, от бочки
  // на спине — вперёд носом), он плюхается и уходит в землю
  let fly = 0;
  let spread = 0;
  let sink = 0;
  const blown = boomT > 0.12;
  if (boomT > 0) {
    const swell = smooth(0, 0.12, boomT);
    barrelS = blown ? 0.001 : 1 + 0.6 * swell;
    sparkS = blown ? 0.001 : sparkS * (1 + 2 * swell);
    const f = smooth(0.12, 0.72, boomT);
    const dir = planting ? -1 : 1;
    fly = Math.sin(f * Math.PI) * 1.5;
    spread = Math.sin(f * Math.PI) * 0.8 + 0.2 * f;
    bz += dir * 0.6 * f;
    lean = lean * (1 - f) + dir * Math.PI * 2.5 * f;
    roll *= 1 - f;
    const land = smooth(0.7, 0.8, boomT);
    sy *= 1 - 0.25 * land * (1 - smooth(0.8, 0.9, boomT) * 0.6);
    sink = smooth(0.8, 1, boomT);
  }

  setBoneS(out.body, bx, HIP + bob + fly, bz, lean, yaw, roll, 1 + 0.06 * hit, sy, 1 + 0.06 * hit);
  out.head.copy(out.body);

  // лапы: ступня стоит в мире, пока на земле; в полёте и при закладке — своё
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const bone = i === 0 ? out.legL : out.legR;
    // путь ступни делим на рост особи: весь скелет потом умножится на scale, а в мире ступня должна стоять
    step(a.gait + (i === 0 ? 0 : 0.5), 1.25 / scale, duty, lift, _st);
    const fz = _st.z * w;
    const fl = _st.lift;
    if (blown) {
      // в воздухе лапы растопырены и болтаются вместе с телом
      attach(bone, out.body, side * (HIP_X + 0.12 * spread), -0.05 * spread, 0.1 * spread, side * 0.4 * spread + Math.sin(t * 20 + i) * 0.3 * spread, 0, side * 0.6 * spread);
    } else {
      setBone(bone, side * HIP_X + bx * 0.3, HIP + fl, fz + footBack + (boomT > 0 ? bz : 0), -fl * 2.2 + 0.15 * hit, yaw * 0.5, 0);
    }
  }

  // бочка: на спине с запаздыванием, в закладке — летит дугой и стоит у ворот
  if (tossS > 0 && boomT === 0) {
    arc(tossS, _p);
    const spin = tossS * Math.PI * 2;
    setBoneS(out.prop, _p.x, _p.y, _p.z, -0.2 * (1 - tossS) + spin, 0, BACK_TILT * (1 - tossS), barrelS * (2 - barrelSy), barrelS * barrelSy, barrelS * (2 - barrelSy));
  } else if (planting && boomT > 0) {
    setBoneS(out.prop, 0, LAND.y, LAND.z, 0, 0, 0, barrelS, barrelS, barrelS);
  } else {
    const lag = Math.sin(a.gait * Math.PI * 4 - 1.1) * 0.035 * w + 0.03 * spring(1 - a.hit, 14, 5) * (a.hit > 0 ? 1 : 0);
    attachS(out.prop, out.body, BACK.x, BACK.y + lag, BACK.z, -0.2 - 0.12 * w + lag * 2, 0, BACK_TILT + lag, barrelS, barrelS, barrelS);
  }
  // искра: ползёт по фитилю от кончика к крышке
  const k = 1 - fuseK;
  const seg = k > 0.5 ? 1 : 0;
  const f = seg === 1 ? (k - 0.5) * 2 : k * 2;
  const p0 = FUSE[seg];
  const p1 = FUSE[seg + 1];
  _b.copy(out.prop);
  attach(out.extra, _b, (p0[0] + (p1[0] - p0[0]) * f) * BS, (p0[1] + (p1[1] - p0[1]) * f + 0.015) * BS, (p0[2] + (p1[2] - p0[2]) * f) * BS, t * 7, t * 5, 0, Math.max(0.001, sparkS));

  finish(out, BONES_USED, scale * (1 - 0.5 * sink), -0.6 * sink);
}

export const SAPPER_BEAVERS: MobDef[] = LOOKS.map(build);
