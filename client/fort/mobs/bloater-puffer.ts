// Пузырь «Рыба-фуга на ножках»: коралловый шар с кремовым брюхом, губами бантиком, плавниками и колючками,
// ковыляет на тонких ножках в жёлтых резиновых сапогах. От удара колючки топорщатся. Перед взрывом раздувается
// вдвое и дрожит, иглы встают дыбом — «пуф!»: шар исчезает в облачке, во все стороны летят брызги варенья,
// а сапоги ещё мгновение стоят сами по себе и падают.
import * as THREE from 'three';
import { Z_BLOATER } from '../../../shared/fortkinds.ts';
import { ZS_ATTACK } from '../../../shared/fort.ts';
import { type MobAnim, type MobDef, type MobPose } from './kit.ts';
import {
  EYE, TAU, ball, biped, bump, clamp01, hide, jamOn, join, linkS, mix, orient, paint, seedScale, seg, smooth, taper,
} from './b-parts.ts';
import { splashGeo, splashPose } from './b-splash.ts';

const CORAL = 0xff8656;
const CORAL_DARK = 0xe0603a;
const BELLY = 0xfff0d2;
const SPOT = 0xb4502e;
const FIN = 0xffc64a;
const LIPS = 0xff5d7a;
const SPIKE = 0xfff3cf;
const BOOT = 0xffd23c;
const BOOT_DARK = 0xd9a21a;
const LEG = 0xf7b08a;
const SOCKET = 0x3a1650;
const PUPIL = 0x1c0f24;

/** Центр шара над землёй и его полуоси */
const BODY_Y = 0.92;
const RX = 0.6;
const RY = 0.6;
const RZ = 0.63;
const HIP = 0.34;
const HIP_X = 0.2;
const EYE_Y = 0.3;

// ------------------------------------------------------------------ геометрия

function bodyGeo(): THREE.BufferGeometry {
  const shell = ball(1, 0, 0, 0, (x, y, z) => {
    if (y < -0.12 && z > -0.2) return mix(CORAL, BELLY, clamp01((-0.12 - y) / 0.12 + 0.4));
    const sp = Math.sin(x * 13) * Math.sin(y * 11 + 1) * Math.sin(z * 12);
    return sp > 0.55 ? SPOT : y > 0.3 ? CORAL_DARK : CORAL;
  }, RX, RY, RZ, 12, 9);
  // губы бантиком, плавники по бокам, гребень и хвост
  const lips = paint(new THREE.TorusGeometry(0.085, 0.045, 4, 9).scale(1.15, 0.9, 1).translate(0, -0.1, RZ - 0.02), LIPS);
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.quadraticCurveTo(0.12, 0.2, 0.3, 0.16);
  finShape.lineTo(0.24, 0.05);
  finShape.lineTo(0.3, -0.04);
  finShape.lineTo(0.22, -0.1);
  finShape.quadraticCurveTo(0.1, -0.1, 0, 0);
  const fin = new THREE.ExtrudeGeometry(finShape, { depth: 0.03, bevelEnabled: false, curveSegments: 3 });
  const fins = [-1, 1].map((sx) => paint(fin.clone().rotateY(sx > 0 ? -Math.PI / 2 + 0.5 : Math.PI / 2 - 0.5).translate(sx * (RX - 0.04), -0.02, 0.05), FIN));
  const tail = paint(fin.clone().scale(1.5, 1.6, 1).rotateY(Math.PI / 2).rotateX(0).translate(-0.015, 0.02, -RZ + 0.06), FIN);
  const sockets = [-1, 1].map((sx) => ball(0.125, sx * 0.22, EYE_Y, 0.4, SOCKET, 1, 1, 0.7, 6, 4));
  // зрачки (рыбы не моргают — зрачки живут на теле): смотрят чуть вниз и вперёд, глуповато врозь
  const pupils = [-1, 1].map((sx) => ball(0.045, sx * 0.235, EYE_Y - 0.015, 0.535, PUPIL, 1, 1.15, 0.5, 5, 3));
  return join([
    shell, lips, ...fins, tail, ...sockets, ...pupils,
    jamOn(0, 0, 0, RX, RY, RZ, 0.35, 2.6, 0.14, 0.15),
    jamOn(0, 0, 0, RX, RY, RZ, 1.0, -1.7, 0.11),
  ]);
}

function eyesGeo(): THREE.BufferGeometry {
  return join([-1, 1].map((sx) => ball(0.105, sx * 0.22, EYE_Y, 0.45, EYE, 1, 1.05, 0.75, 8, 6)));
}

/** Колючки по всему шару, кроме морды и низа; основания утоплены — при раздувании иглы «вылезают» */
function spikesGeo(): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  const N = 40;
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.39996;
    const nx = Math.cos(a) * r;
    const nz = Math.sin(a) * r;
    if (y < -0.55) continue; // низ — ноги
    if (nz > 0.42 && y < 0.78 && Math.abs(nx) < 0.8) continue; // морда и глаза
    const len = 0.17 + (i % 3) * 0.03;
    const cone = new THREE.ConeGeometry(0.035, len, 4, 1, true).translate(0, len / 2, 0);
    list.push(paint(orient(cone, nx * RX * 0.86, y * RY * 0.86, nz * RZ * 0.86, nx / RX, y / RY, nz / RZ), SPIKE));
  }
  return join(list);
}

/** Тонкая ножка в жёлтом резиновом сапоге (от тазобедренного сустава вниз) */
function legGeo(): THREE.BufferGeometry {
  return join([
    taper([[0, 0.06, 0], [0, -0.2, 0.01]], 0.045, 0.04, LEG, 3, 6, false),
    paint(new THREE.CylinderGeometry(0.075, 0.085, 0.16, 7, 1, true).translate(0, -0.24, 0.0), BOOT),
    ball(0.09, 0, -0.3, 0.05, BOOT_DARK, 1.05, 0.5, 1.45, 7, 4),
  ]);
}

// ------------------------------------------------------------------ поза

const _R = new THREE.Matrix4();

function pose(a: MobAnim, out: MobPose): void {
  const s = seedScale(a.seed);
  const n = a.seed < 0.5 ? 3 : 4; // мелкие шажки — свой темп у особи
  const duty = 0.52;
  const travel = (duty * 1.25) / n / s;
  const walk = smooth(clamp01(a.speed / 1));
  const t = a.t + a.seed * 9;
  const ph = a.gait * n;

  let puff = 1 + Math.sin(t * 1.9) * 0.025 * (1 - walk); // дыхание
  let spikes = 1;
  let roll = Math.sin(ph * TAU) * 0.13 * walk;
  let yaw = Math.sin(ph * TAU) * 0.08 * walk;
  let pitch = 0.04 + walk * 0.06;
  let jitter = 0;
  let lift = 0;

  if (a.st === ZS_ATTACK) {
    // надувается и трясётся — сейчас рванёт
    const q = (a.stT / 0.5) % 1;
    puff = 1.12 + bump(q) * 0.14;
    spikes = 1.25 + bump(q) * 0.3;
    jitter = 0.04;
    roll = 0;
  }

  const h = a.hit;
  if (h > 0) {
    spikes += 0.6 * h;
    puff *= 1 + 0.1 * h;
    pitch -= 0.25 * h;
  }

  // гибель: раздувается и дрожит (0…0,34), «пуф!» — брызги и облачко, сапоги стоят и падают
  const d = a.die;
  const POP = 0.34;
  let gone = false;
  if (d > 0) {
    const inflate = smooth(seg(d, 0, 0.28));
    puff = 1 + 0.55 * inflate;
    spikes = 1 + 0.95 * inflate;
    jitter = 0.05 * seg(d, 0.18, POP);
    lift = 0.12 * inflate;
    roll = yaw = 0;
    pitch = -0.1 * inflate;
    gone = d >= POP;
  }

  const shake = jitter > 0 ? Math.sin(a.t * 91) * jitter : 0;
  _R.makeScale(s, s, s);
  // ноги: ковыляет; после взрыва — сапоги стоят сами и падают
  let hy = HIP;
  if (d > 0) {
    const fall = smooth(seg(d, 0.55, 0.8));
    const shrink = 1 - smooth(seg(d, 0.8, 1));
    linkS(out.legL, _R, HIP_X, HIP * shrink, 0, 0, 0, fall * 1.4, shrink, shrink, shrink);
    linkS(out.legR, _R, -HIP_X, HIP * shrink, 0, 0, 0, -fall * 1.3, shrink, shrink, shrink);
  } else {
    hy = biped(out.legL, out.legR, _R, ph, duty, travel * walk, HIP_X, HIP, 0, HIP, 0.25, 0.04);
  }
  const by = BODY_Y + (hy - HIP) + (puff - 1) * RY * 0.9 + lift;
  if (gone) {
    hide(out.body);
    hide(out.extra);
  } else {
    linkS(out.body, _R, shake, by, 0, pitch, yaw, roll, puff, puff * (1 - 0.02 * walk), puff);
    linkS(out.extra, out.body, 0, 0, 0, 0, 0, 0, spikes, spikes, spikes);
  }
  splashPose(out.prop, _R, d, POP, by, 1);
}

export const bloaterPuffer: MobDef = {
  id: 'bloater-puffer',
  name: 'Рыба-фуга на ножках',
  kinds: [Z_BLOATER],
  weight: 1,
  height: 1.5,
  parts: [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'body', geo: eyesGeo(), glow: true },
    { bone: 'extra', geo: spikesGeo() },
    { bone: 'legL', geo: legGeo() },
    { bone: 'legR', geo: legGeo() },
    { bone: 'prop', geo: splashGeo() },
  ],
  pose,
};
