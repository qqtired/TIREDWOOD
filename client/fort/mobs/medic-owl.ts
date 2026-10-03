// Сова-лекарь (Z_MEDIC, набор C). Круглые очки, белая шапочка с красным крестом (крест и сверху — видно со стены),
// сумка с крестом на животе. По земле прыгает обеими лапками, как птица. Лечение — «взмах»: крылья вверх и резко вниз,
// над головой вспыхивает и улетает зелёный светящийся крест. Сервер отдельного состояния для лечения не шлёт: перед
// лечением он ставит признак ZF_LIT, а на лечении двигает счётчик ударов. Поэтому «взмах» — в ZS_ATTACK и при anim.lit
// (необязательное поле, его может добавить договор). Гибель — падает навзничь, лапки вверх, и уходит в землю.
// Голова слита с телом (бюджет — 6 частей): тело, глаза, два крыла, лапки, зелёный крест.
import * as THREE from 'three';
import { ZS_ATTACK } from '../../../shared/fort.ts';
import { Z_MEDIC } from '../../../shared/fortkinds.ts';
import { merge, setBone, setBoneS, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import {
  attach, ellipsoid, eyeBalls, finish, limb, mix, paint, pupils, rnd, smooth, splat, spring, step, type Step,
} from './c-kit.ts';

interface Look {
  id: string;
  name: string;
  weight: number;
  feather: number;
  belly: number;
  wing: number;
  disc: number;
  frame: number;
}

const LOOKS: Look[] = [
  { id: 'medic-owl', name: 'Сова-лекарь', weight: 2, feather: 0xa8794a, belly: 0xf3e4c2, wing: 0x7a5233, disc: 0xf7ecd4, frame: 0xc9962e },
  { id: 'medic-owl-grey', name: 'Сова-лекарь (серая)', weight: 1, feather: 0x8e909f, belly: 0xeceaf2, wing: 0x63677a, disc: 0xf4f2f8, frame: 0x2e2a33 },
];

const HIP = 0.2;
const SHOULDER_X = 0.36;
const SHOULDER_Y = 0.98;
const RED = 0xd8333a;
const CAP = 0xfbf8f0;
/** Взмах лечения, с */
const HEAL_S = 1.0;

function bodyGeo(l: Look): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  // тело-яйцо: светлая грудка с «галочками» перьев
  p.push(paint(ellipsoid(0.4, 0.45, 0.36, 11, 9).translate(0, 0.62, 0), (x, y, z) => {
    const front = smooth(0.12, 0.26, z) * smooth(1.0, 0.8, y);
    const chevron = (((y + Math.abs(x) * 0.55) * 7) % 1 + 1) % 1 < 0.22 ? 0.35 : 0;
    return mix(l.feather, mix(l.belly, l.feather, chevron), front);
  }));
  p.push(paint(ellipsoid(0.31, 0.27, 0.29, 11, 8).translate(0, 1.24, 0.02), l.feather));
  // лицевой диск вокруг глаз, клюв, ушки-пёрышки
  for (const s of [-1, 1]) p.push(paint(ellipsoid(0.15, 0.15, 0.07, 7, 4).translate(s * 0.125, 1.27, 0.255), l.disc));
  p.push(paint(new THREE.ConeGeometry(0.045, 0.12, 6).rotateX(2.61).translate(0, 1.17, 0.33), 0xf0a830));
  for (const s of [-1, 1]) p.push(paint(new THREE.ConeGeometry(0.065, 0.18, 5).rotateZ(-s * 0.45).translate(s * 0.2, 1.47, 0), mix(l.feather, 0x000000, 0.25)));
  // круглые очки
  for (const s of [-1, 1]) p.push(paint(new THREE.TorusGeometry(0.112, 0.017, 3, 10).translate(s * 0.125, 1.27, 0.365), l.frame));
  p.push(paint(new THREE.BoxGeometry(0.05, 0.02, 0.02).translate(0, 1.29, 0.37), l.frame));
  // шапочка с крестом спереди и сверху
  p.push(paint(new THREE.CylinderGeometry(0.15, 0.17, 0.13, 10).rotateX(-0.12).translate(0, 1.5, 0.03), CAP));
  p.push(paint(new THREE.BoxGeometry(0.1, 0.03, 0.012).translate(0, 1.5, 0.205), RED), paint(new THREE.BoxGeometry(0.03, 0.1, 0.012).translate(0, 1.5, 0.205), RED));
  p.push(paint(new THREE.BoxGeometry(0.13, 0.012, 0.036).translate(0, 1.572, 0.02), RED), paint(new THREE.BoxGeometry(0.036, 0.012, 0.13).translate(0, 1.572, 0.02), RED));
  // сумка с крестом на животе и ремень через грудь
  p.push(paint(new THREE.BoxGeometry(0.22, 0.17, 0.09).translate(0.19, 0.5, 0.33), CAP));
  p.push(paint(new THREE.BoxGeometry(0.1, 0.03, 0.012).translate(0.19, 0.5, 0.378), RED), paint(new THREE.BoxGeometry(0.03, 0.1, 0.012).translate(0.19, 0.5, 0.378), RED));
  p.push(paint(limb([-0.26, 0.98, 0.21], [0.12, 0.58, 0.33], 0.018, 0.018, 4, false), 0x8a5a34));
  p.push(...pupils([[-0.125, 1.27, 0.344], [0.125, 1.27, 0.344]], 0.045));
  p.push(splat([-0.22, 0.45, 0.25], [-0.6, -0.2, 0.75], 0.1), splat([0.17, 1.38, 0.2], [0.5, 0.6, 0.6], 0.07));
  return merge(p).translate(0, -HIP, 0);
}

function wingGeo(l: Look, side: number): THREE.BufferGeometry {
  // висит вниз от плеча; полоски на маховых, кончик темнее
  return paint(ellipsoid(0.075, 0.38, 0.23, 8, 6).translate(side * 0.02, -0.3, -0.02), (x, y) =>
    mix(((((y * 9) % 1) + 1) % 1 < 0.3 ? mix(l.wing, l.belly, 0.35) : l.wing), mix(l.wing, 0x000000, 0.3), smooth(-0.45, -0.66, y)));
}

function feetGeo(l: Look): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    p.push(paint(limb([s * 0.12, 0.03, 0.02], [s * 0.12, 0.26, 0], 0.05, 0.055, 6, false), mix(l.feather, 0x000000, 0.1)));
    for (const a of [-0.45, 0, 0.45]) p.push(paint(ellipsoid(0.028, 0.025, 0.085, 5, 3).rotateY(a).translate(s * 0.12 + Math.sin(a) * 0.06, 0.025, 0.07 + Math.cos(a) * 0.04), 0xf0a830));
  }
  return merge(p);
}

/** Зелёный крест лечения с искорками — светится сам */
function crossGeo(): THREE.BufferGeometry {
  const G = 0x2fd46a;
  return merge([
    paint(new THREE.BoxGeometry(0.11, 0.36, 0.11), G),
    paint(new THREE.BoxGeometry(0.36, 0.11, 0.11), G),
    ...[0, 2.1, 4.2].map((a) => paint(new THREE.OctahedronGeometry(0.05, 0).translate(Math.cos(a) * 0.32, Math.sin(a * 1.3) * 0.1, Math.sin(a) * 0.32), 0x8dffa0)),
  ]);
}

const _st: Step = { z: 0, lift: 0, stance: false };
const BONES_USED = ['body', 'head', 'wingL', 'wingR', 'legL', 'extra'] as const;
type AnimLit = MobAnim & { lit?: boolean };

function build(l: Look): MobDef {
  return {
    id: l.id,
    name: l.name,
    kinds: [Z_MEDIC],
    weight: l.weight,
    height: 1.58,
    parts: [
      { bone: 'body', geo: bodyGeo(l) },
      { bone: 'head', geo: merge(eyeBalls([[-0.125, 1.27 - HIP, 0.28], [0.125, 1.27 - HIP, 0.28]], 0.09, 1, 0.75)), glow: true },
      { bone: 'wingL', geo: wingGeo(l, -1) },
      { bone: 'wingR', geo: wingGeo(l, 1) },
      { bone: 'legL', geo: feetGeo(l) },
      { bone: 'extra', geo: crossGeo(), glow: true },
    ],
    pose: poseOwl,
  };
}

function poseOwl(a: MobAnim, out: MobPose): void {
  const sd = a.seed;
  const t = a.t;
  const w = smooth(0.1, 0.9, a.speed);
  const scale = 0.92 + 0.16 * rnd(sd, 1);
  const tilt = (rnd(sd, 2) - 0.5) * 0.2;
  const hit = a.hit * a.hit * (3 - 2 * a.hit);
  const breathe = Math.sin(t * 2 + sd * 6.3);

  // прыжки обеими лапками: два прыжка на цикл шага, в опоре лапки стоят в мире
  const hp = a.gait * 2;
  step(hp, 0.625 / scale, 0.45, 0, _st);
  const q = hp - Math.floor(hp);
  const air = _st.stance ? 0 : Math.sin(((q - 0.45) / 0.55) * Math.PI);
  const crouch = _st.stance ? Math.sin((q / 0.45) * Math.PI) : 0;
  let bodyY = HIP + (0.15 * air - 0.05 * crouch) * w + 0.006 * breathe;
  let feetY = (0.15 * air + 0.06 * air) * w;
  let feetZ = _st.z * w;
  let lean = 0.05 + 0.1 * w - 0.06 * air * w - 0.3 * hit;
  let roll = tilt + 0.05 * Math.sin(t * 0.9 + sd * 3) * (1 - w);
  let yaw = 0.25 * Math.sin(t * 0.45 + sd * 5) * (1 - w);
  let puff = 1 + 0.015 * breathe + 0.1 * hit - 0.06 * crouch * w;
  let wing = 0.12 + 0.35 * air * w + 0.8 * hit;
  let wingFwd = 0;
  let cross = 0;
  let crossY = 0;
  let crossSpin = t * 3;

  // лечение — «взмах»: крылья вверх (вспыхивает крест), резкий мах вниз, крест улетает вверх и гаснет
  const lit = (a as AnimLit).lit === true;
  if (a.st === ZS_ATTACK || lit) {
    const u = a.st === ZS_ATTACK ? a.stT % HEAL_S : 0.2 + 0.03 * Math.sin(t * 20);
    const up = smooth(0, 0.22, u);
    const down = smooth(0.24, 0.36, u);
    const settle = smooth(0.5, 0.95, u);
    wing = 0.12 + 2.25 * up - 1.6 * down - 0.65 * settle + 0.25 * spring(u - 0.36, 30, 7);
    wing = Math.max(0.1, wing);
    wingFwd = 0.35 * up - 0.5 * down * (1 - settle);
    bodyY += 0.08 * up - 0.1 * down * (1 - settle);
    lean += -0.12 * up + 0.22 * down * (1 - settle);
    puff += 0.06 * up;
    cross = smooth(0.02, 0.2, u) * (1 + 0.35 * Math.sin(Math.min(1, u / 0.36) * Math.PI)) * (1 - smooth(0.6, 0.98, u));
    crossY = 0.55 * smooth(0.36, 1, u);
    crossSpin = u * 9;
  }

  // гибель: навзничь как доска, крылья в стороны, подскок, лапки вверх — и в землю
  const d = a.die;
  const fall = smooth(0, 0.4, d);
  const bounce = Math.abs(Math.sin(smooth(0.4, 0.62, d) * Math.PI)) * 0.12;
  const sink = smooth(0.62, 1, d);
  lean = lean * (1 - fall) - (Math.PI / 2) * fall;
  bodyY = bodyY * (1 - fall) + (0.24 + bounce) * fall;
  wing = wing * (1 - fall) + 1.4 * fall;
  roll *= 1 - fall;
  yaw *= 1 - fall;

  setBoneS(out.body, 0, bodyY, 0, lean, yaw, roll, puff, puff * (1 - 0.04 * crouch * w), puff);
  out.head.copy(out.body);
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1;
    attach(i === 0 ? out.wingL : out.wingR, out.body, s * SHOULDER_X * puff, SHOULDER_Y - HIP, -0.02, -wingFwd, 0, s * wing);
  }
  if (fall > 0) {
    // лапки — вместе с телом (торчат вверх, когда лежит)
    attach(out.legL, out.body, 0, -HIP + 0.02, 0, 0.3 * Math.sin(t * 18) * fall * (1 - sink), 0, 0);
  } else {
    setBone(out.legL, 0, feetY, feetZ, -0.5 * air * w + 0.2 * hit, yaw * 0.6, 0);
  }
  if (cross > 0.001 && fall < 1) {
    attach(out.extra, out.body, 0, 1.86 - HIP + crossY, 0.02, 0, crossSpin, 0, cross * (1 - fall));
  } else {
    setBone(out.extra, 0, 1.4, 0, 0, 0, 0, 0.001);
  }
  finish(out, BONES_USED, scale * (1 - 0.45 * sink), -0.75 * sink);
}

export const MEDIC_OWLS: MobDef[] = LOOKS.map(build);
