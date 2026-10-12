// Пузырь «Жаба-помидор»: круглая томатная жаба с бородавками из варенья, широкой ухмылкой и розовым горловым
// пузырём, который то и дело надувается («ква!»). Передвигается прыжками: присела — оттолкнулась — задние лапы
// вытянуты, передние тянутся к земле. Гибель: надувается шаром, отрывается от земли, как воздушный шарик,
// дрожит — «пуф!»: брызги и облачко, а глаза ещё мгновение висят в воздухе, моргают и падают.
import * as THREE from 'three';
import { Z_BLOATER } from '../../../shared/fortkinds.ts';
import { ZS_ATTACK } from '../../../shared/fort.ts';
import { type MobAnim, type MobDef, type MobPose } from './kit.ts';
import {
  EYE, ball, blink, bump, clamp01, hide, jamOn, join, lerp, linkS, mix, seedFrac, seedScale, seg, smooth, taper,
} from './b-parts.ts';
import { splashGeo, splashPose } from './b-splash.ts';

const TOMATO = 0xf2683a;
const TOMATO_DARK = 0xd44f26;
const BELLY = 0xffc596;
const MOUTH = 0x5a1e22;
const SAC = 0xf7a6cf;
const SAC_HI = 0xffd3ea;
const SOCKET = 0x3a1650;

/** Центр тела над землёй и полуоси */
const BODY_Y = 0.77;
const RX = 0.68;
const RY = 0.6;
const RZ = 0.62;
/** Глаза на бугорках сверху (в осях тела) */
const EYE_X = 0.25;
const EYE_Y = 0.54;
const EYE_Z = 0.3;
/** Опоры лап в осях модели */
const ARM_Y = 0.5;
const ARM_Z = 0.3;
const HIP_Y = 0.37;
const HIP_Z = -0.22;

// ------------------------------------------------------------------ геометрия

function bodyGeo(): THREE.BufferGeometry {
  const shell = ball(1, 0, 0, 0, (_x, y, z) => (y < -0.1 && z > 0.05 ? mix(TOMATO, BELLY, clamp01((-0.1 - y) / 0.15 + 0.3)) : y > 0.32 ? TOMATO_DARK : TOMATO), RX, RY, RZ, 11, 8);
  // бугорки глаз и темные «веки» под светящимися глазами
  const bumps = [-1, 1].map((sx) => ball(0.15, sx * EYE_X, EYE_Y - 0.08, EYE_Z - 0.05, TOMATO, 1, 0.85, 1, 6, 4));
  const lids = [-1, 1].map((sx) => ball(0.118, sx * EYE_X, EYE_Y, EYE_Z + 0.005, SOCKET, 1, 1, 0.9, 6, 3));
  // широкая ухмылка по морде: дуга по передней поверхности
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i <= 6; i++) {
    const x = -0.44 + (0.88 * i) / 6;
    const y = 0.05 - 0.12 * (1 - (x / 0.44) ** 2);
    const k = 1 - (x / RX) ** 2 - (y / RY) ** 2;
    pts.push([x, y, RZ * Math.sqrt(Math.max(0.01, k)) + 0.004]);
  }
  const mouth = taper(pts, 0.018, 0.018, MOUTH, 6, 4, false);
  // бородавки из варенья
  const warts = [
    jamOn(0, 0, 0, RX, RY, RZ, 0.55, 2.7, 0.13, 0.14),
    jamOn(0, 0, 0, RX, RY, RZ, 0.9, -2.2, 0.1),
    jamOn(0, 0, 0, RX, RY, RZ, 0.45, -0.9, 0.08),
  ];
  return join([shell, ...bumps, ...lids, mouth, ...warts]);
}

function eyesGeo(): THREE.BufferGeometry {
  return join([-1, 1].map((sx) => ball(0.11, sx * EYE_X, 0, EYE_Z + 0.02, EYE, 1, 0.95, 0.9, 7, 5)));
}

/** Горловой пузырь: шар чуть впереди точки крепления — раздувается вперёд и вниз */
function sacGeo(): THREE.BufferGeometry {
  return join([
    ball(0.22, 0, -0.05, 0.1, (_x, y, z) => (y > 0.05 && z > 0.12 ? SAC_HI : SAC), 1.15, 0.9, 1, 8, 6),
  ]);
}

/** Передние лапы от плеч до земли, ладошки с тремя пальцами (в осях опоры плеч) */
function armsGeo(): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    list.push(taper([[sx * 0.3, 0, 0], [sx * 0.36, -0.22, 0.1], [sx * 0.38, -0.42, 0.17]], 0.085, 0.06, TOMATO, 5, 5, false));
    for (const [dx, dz] of [[-0.07, 0.07], [0, 0.09], [0.07, 0.06]] as const) {
      list.push(ball(0.045, sx * 0.38 + dx * sx, -0.445, 0.2 + dz, TOMATO_DARK, 1, 0.55, 1.2, 4, 3));
    }
  }
  return join(list);
}

/** Задние лапы: толстые бёдра по бокам, ступни-ласты впереди (в осях опоры бёдер) */
function legsGeo(): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    list.push(ball(0.25, sx * 0.5, -0.04, 0.05, TOMATO, 0.72, 0.8, 1.35, 7, 4));
    list.push(taper([[sx * 0.55, -0.18, 0.28], [sx * 0.6, -0.3, 0.32]], 0.07, 0.06, TOMATO, 2, 6, false));
    list.push(ball(0.1, sx * 0.62, -0.335, 0.4, TOMATO_DARK, 1.3, 0.3, 1.5, 6, 3));
  }
  return join(list);
}

// ------------------------------------------------------------------ поза

const _R = new THREE.Matrix4();

function pose(a: MobAnim, out: MobPose): void {
  const s = seedScale(a.seed);
  const walk = smooth(clamp01(a.speed / 0.8));
  const t = a.t + a.seed * 9;
  const n = 2; // прыжков на 1,25 м
  const S = 1.25 / n;
  const c = 0.42 + seedFrac(a.seed, 2) * 0.08; // доля на земле — свой ритм прыжков
  const ph = (a.gait * n) % 1;

  // прыжок: на земле лапы стоят (едут назад со скоростью земли), в воздухе — дуга
  let hop = 0;
  let squash = 1;
  let pitch = 0;
  let feetZ = 0;
  let legsRx = 0;
  let armsRx = 0;
  if (ph < c) {
    const u = ph / c;
    feetZ = (0.5 - u) * c * S / s;
    squash = 1 - 0.1 * bump(u) * walk;
    pitch = 0.08 * bump(u) * walk;
  } else {
    const u = (ph - c) / (1 - c);
    hop = 0.3 * 4 * u * (1 - u) * walk;
    feetZ = (-0.5 + smooth(u)) * c * S / s;
    squash = 1 + 0.07 * bump(u) * walk;
    pitch = (-0.25 + 0.45 * u) * walk;
    legsRx = -0.45 * bump(u) * walk;
    armsRx = -0.55 * smooth(u) * walk;
  }
  feetZ *= walk;

  // дыхание и «ква» горловым пузырём
  const croakP = 2.2 + a.seed * 1.4;
  const cq = (t % croakP) / croakP;
  let sac = 0.55 + 0.9 * (cq < 0.08 ? smooth(cq / 0.08) : 1 - smooth(clamp01((cq - 0.08) / 0.18))) + Math.sin(t * 2) * 0.03;
  let puff = 1 + Math.sin(t * 2) * 0.02 * (1 - walk);
  let eyes = blink(t, a.seed);
  let yaw = Math.sin(t * 0.6) * 0.15 * (1 - walk);
  let jitter = 0;
  let lift = 0;

  if (a.st === ZS_ATTACK) {
    // надувается и подпрыгивает на месте — сейчас рванёт
    const q = (a.stT / 0.5) % 1;
    puff = 1.12 + bump(q) * 0.12;
    sac = 1.15 + bump(q) * 0.3;
    hop = 0.12 * bump(q);
    jitter = 0.03;
    yaw = 0;
  }

  const h = a.hit;
  if (h > 0) {
    squash *= 1 - 0.15 * h;
    puff *= 1 + 0.08 * h;
    sac = Math.max(sac, 0.9 + 0.35 * h);
    eyes = Math.min(eyes, 1 - 0.7 * h);
    pitch -= 0.2 * h;
  }

  // гибель: шар, всплыл, дрожит — «пуф!»; глаза висят, моргают и падают
  const d = a.die;
  const POP = 0.36;
  let gone = false;
  if (d > 0) {
    const inflate = smooth(seg(d, 0, 0.3));
    puff = 1 + 0.62 * inflate;
    squash = 1 + 0.16 * inflate;
    sac = lerp(sac, 0.85, inflate);
    lift = 0.65 * smooth(seg(d, 0.08, POP));
    jitter = 0.05 * seg(d, 0.2, POP);
    hop = 0;
    pitch = -0.15 * inflate;
    legsRx = -0.3 * inflate;
    armsRx = -0.4 * inflate;
    feetZ = 0;
    yaw = 0;
    eyes = 1;
    gone = d >= POP;
  }

  const shake = jitter > 0 ? Math.sin(a.t * 87) * jitter : 0;
  _R.makeScale(s, s, s);
  const by = BODY_Y + hop + lift + (puff * squash - 1) * RY * 0.7;
  if (gone) {
    hide(out.body);
    hide(out.extra);
    hide(out.armL);
    hide(out.legL);
    // глаза висят, моргают дважды и падают
    const u = seg(d, POP, 0.62);
    const fall = smooth(seg(u, 0.5, 1));
    const bl = u < 0.5 ? (Math.sin(u * 2 * Math.PI * 2) > 0.7 ? 0.15 : 1) : 1;
    const sz = 1.3 * (1 - 0.92 * smooth(seg(d, 0.55, 0.7)));
    linkS(out.head, _R, 0, lerp(by + EYE_Y * 1.5, 0.12, fall * fall), EYE_Z * 0.3, 0, 0, 0, sz, sz * bl, sz);
  } else {
    linkS(out.body, _R, shake, by, 0, pitch, yaw, 0, puff, puff * squash, puff);
    linkS(out.head, out.body, 0, EYE_Y, 0, 0, 0, 0, 1, eyes, 1);
    linkS(out.extra, out.body, 0, -0.17, RZ - 0.2, 0, 0, 0, sac, sac, sac);
    linkS(out.armL, _R, 0, ARM_Y + hop + lift, ARM_Z + feetZ, armsRx, yaw * 0.5, 0, 1, 1, 1);
    linkS(out.legL, _R, 0, HIP_Y + hop + lift, HIP_Z + feetZ, legsRx, yaw * 0.5, 0, 1, 1, 1);
  }
  splashPose(out.prop, _R, d, POP, by, 1.05);
}

export const bloaterToad: MobDef = {
  id: 'bloater-toad',
  name: 'Жаба-помидор',
  kinds: [Z_BLOATER],
  weight: 1,
  height: 1.5,
  parts: [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'head', geo: eyesGeo(), glow: true },
    { bone: 'extra', geo: sacGeo() },
    { bone: 'armL', geo: armsGeo() },
    { bone: 'legL', geo: legsGeo() },
    { bone: 'prop', geo: splashGeo() },
  ],
  pose,
};
