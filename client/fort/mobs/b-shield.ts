// Набор B: общая хореография щитоносцев (черепаха, бобр). Кости: body — туловище от таза, head — голова на шее,
// extra — глаза (моргают), prop — щит (его крепость может спрятать, когда щит разбит: ZF_SHIELD снят), legL/legR.
// Ходьба вперевалку, щит качается вместе с телом; атака — удар щитом с выпадом; от попадания голова ныряет
// за щит; гибель — падает на спину, болтает лапами, щит плашмя падает вперёд; потом всё уходит в землю.
import * as THREE from 'three';
import { ZS_ATTACK } from '../../../shared/fort.ts';
import type { MobAnim, MobPose } from './kit.ts';
import { TAU, biped, blink, bump, clamp01, link, linkS, pivotBone, seedFrac, seedScale, seg, smooth } from './b-parts.ts';

export interface ShieldRig {
  /** Тазобедренный сустав над землёй (= длина ноги до подошвы) и полуширина таза */
  hip: number;
  hipX: number;
  /** Шагов на 1,25 м (коротконогим — больше) */
  steps: number;
  /** Шея (кость head) от таза */
  neckY: number;
  neckZ: number;
  /** Глаза (кость extra) от шеи */
  eyeY: number;
  /** Щит (кость prop) от таза */
  shieldY: number;
  shieldZ: number;
  /** Насколько голова ныряет от попадания */
  duck: number;
}

const _R = new THREE.Matrix4();
const _S = new THREE.Matrix4();
/** Полувысота щита — вокруг нижнего края он падает вперёд */
const SHIELD_R = 0.45;

export function shieldPose(rig: ShieldRig, a: MobAnim, out: MobPose): void {
  const s = seedScale(a.seed);
  const duty = 0.52 + seedFrac(a.seed, 2) * 0.1;
  const n = rig.steps;
  const travel = (duty * 1.25) / n / s;
  const walk = smooth(clamp01(a.speed / 1));
  const t = a.t + a.seed * 9;
  const ph = a.gait * n;
  const tilt = (seedFrac(a.seed, 5) - 0.5) * 0.3;

  let lean = 0.04 + walk * 0.06;
  let roll = Math.sin(ph * TAU) * 0.08 * walk;
  let yaw = Math.sin(ph * TAU) * 0.06 * walk;
  let breathe = 1 + Math.sin(t * 2) * 0.015 * (1 - walk);
  let headY = 0;
  let headZ = Math.sin(ph * TAU * 2) * 0.03 * walk;
  let headRx = -0.05;
  let headRy = Math.sin(t * 0.75) * 0.45 * (1 - walk);
  let shieldZ = 0;
  let shieldRx = 0;
  let shieldRz = 0;
  let eyes = blink(t, a.seed);

  if (a.st === ZS_ATTACK) {
    // удар щитом: замах назад — выпад вперёд — назад; голова прячется на ударе
    const q = (a.stT / 0.6) % 1;
    const back = q < 0.3 ? smooth(q / 0.3) : 0;
    const thrust = q >= 0.3 && q < 0.45 ? smooth((q - 0.3) / 0.15) : q >= 0.45 ? 1 - smooth((q - 0.45) / 0.55) : 0;
    lean = 0.04 - 0.12 * back + 0.32 * thrust;
    shieldZ = -0.1 * back + 0.3 * thrust;
    shieldRx = -0.1 * thrust;
    headY = -rig.duck * 0.35 * thrust;
    headRy = 0;
    roll = yaw = 0;
  }

  // попадание: голова ныряет за щит, щит дрожит
  const h = a.hit;
  if (h > 0) {
    headY -= rig.duck * smooth(clamp01(h * 1.6));
    headZ -= 0.05 * h;
    shieldRz += Math.sin(a.t * 40) * 0.12 * h;
    lean -= 0.12 * h;
    breathe *= 1 - 0.05 * h;
    eyes = Math.min(eyes, 1 - 0.85 * h);
  }

  // гибель: на спину, болтает лапами, щит падает вперёд; потом уходит в землю
  const d = a.die;
  let rx = 0;
  let y = 0;
  let sc = s;
  let legsFree = true;
  let kick = 0;
  if (d > 0) {
    const fall = smooth(seg(d, 0.05, 0.35));
    rx = (-Math.PI / 2) * fall;
    y = bump(seg(d, 0, 0.2)) * 0.18 + 0.08 * fall - smooth(seg(d, 0.72, 1)) * 0.3;
    sc = s * (1 - 0.82 * smooth(seg(d, 0.7, 1)));
    kick = bump(seg(d, 0.3, 0.8));
    legsFree = false;
    lean = roll = yaw = 0;
    headY = -rig.duck * 0.5 * fall;
    headRx = 0.3 * fall;
    headRy = Math.sin(a.t * 9) * 0.4 * kick;
    eyes = 1 - 0.85 * seg(d, 0.25, 0.4);
  }

  pivotBone(_R, 0, 0, -0.28, 0, y, 0, rx, 0, 0, sc);
  let hy = rig.hip;
  if (legsFree) {
    hy = biped(out.legL, out.legR, _R, ph, duty, travel * walk, rig.hipX, rig.hip, 0, rig.hip, 0.25, 0.05);
  } else {
    const k = Math.sin(a.t * 16) * 0.55 * kick;
    linkS(out.legL, _R, rig.hipX, rig.hip, 0, -0.9 * smooth(seg(d, 0.1, 0.35)) + k, 0, 0.2, 1, 1, 1);
    linkS(out.legR, _R, -rig.hipX, rig.hip, 0, -0.9 * smooth(seg(d, 0.1, 0.35)) - k, 0, -0.2, 1, 1, 1);
  }
  linkS(out.body, _R, 0, hy, 0, lean, yaw, roll, 1, breathe, 1);
  link(out.head, out.body, 0, rig.neckY + headY, rig.neckZ + headZ, headRx, headRy, tilt, 1);
  linkS(out.extra, out.head, 0, rig.eyeY, 0, 0, 0, 0, 1, eyes, 1);
  if (d > 0) {
    // щит отдельно: заваливается вперёд вокруг нижнего края и ложится плашмя
    const f = smooth(seg(d, 0.08, 0.4));
    const phi = (f * f * Math.PI) / 2; // падает с ускорением
    const yb = (rig.shieldY + hy - SHIELD_R) * (1 - f) + 0.1 * f; // нижний край опускается на землю
    const shrink = 1 - 0.85 * smooth(seg(d, 0.7, 1));
    _S.makeScale(s, s, s);
    link(out.prop, _S, 0, yb + SHIELD_R * Math.cos(phi) - smooth(seg(d, 0.72, 1)) * 0.1, rig.shieldZ + SHIELD_R * Math.sin(phi), phi, 0, 0, shrink);
  } else {
    link(out.prop, out.body, 0, rig.shieldY, rig.shieldZ + shieldZ, shieldRx, 0, shieldRz, 1);
  }
}
