// Набор B: общая хореография щитоносцев (черепаха, бобр). Кости: body — туловище от таза, head — голова на шее,
// extra — глаза (моргают), armL — обе руки от линии плеч (одна часть: экономим отрисовки), legL/legR — ноги,
// wingL/wingR — две половины щита. Пока щит цел (признак ZF_SHIELD), половины стоят вместе — это и есть щит: руки
// держат его за края, ходьба
// вперевалку, атака — удар щитом с выпадом, от попадания голова ныряет за щит. Щит разбит (признак снят, anim.flagT —
// секунды с этого) — половины разлетаются кувырком, падают плашмя и тают на земле (остаются там, где разбился, хоть моб
// и бежит дальше); моб отшатывается, вскидывает руки «ой!» и дальше бежит без щита в панике: часто семенит, руки
// над головой трясутся, голова втянута — теперь бей в тело. Без щита бьёт лапами сверху. Гибель — падает на спину, болтает лапами; щит
// (если цел) плашмя падает вперёд; потом всё уходит в землю.
import * as THREE from 'three';
import { ZS_ATTACK } from '../../../shared/fort.ts';
import { ZF_SHIELD } from '../../../shared/fortnet.ts';
import type { MobAnim, MobPose } from './kit.ts';
import { TAU, biped, blink, bump, clamp01, hide, link, linkS, pivotBone, seedFrac, seedScale, seg, smooth } from './b-parts.ts';

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
  /** Щит (кости обломков) от таза */
  shieldY: number;
  shieldZ: number;
  /** Насколько голова ныряет от попадания */
  duck: number;
  /** Линия плеч (кость рук) от таза */
  shoulderY: number;
  shoulderZ: number;
  /** Кисть от плеча вперёд, когда держит щит (для выпада: рука тянется за щитом) */
  reach: number;
  /** Центры двух половин в осях щита — вокруг них кувыркаются */
  shards: ReadonlyArray<readonly [number, number, number]>;
}

/** Разрезать склеенную часть на куски по центру треугольника: pick → номер куска 0…n−1 */
export function splitTris(geo: THREE.BufferGeometry, n: number, pick: (x: number, y: number, z: number) => number): THREE.BufferGeometry[] {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute('position');
  const names = ['position', 'normal', 'color'];
  const bins: number[][][] = Array.from({ length: n }, () => names.map(() => []));
  for (let i = 0; i < pos.count; i += 3) {
    const k = pick((pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3);
    names.forEach((name, a) => {
      const attr = g.getAttribute(name);
      for (let v = i; v < i + 3; v++) for (let c = 0; c < 3; c++) bins[k][a].push(attr.getComponent(v, c));
    });
  }
  return bins.map((b) => {
    const out = new THREE.BufferGeometry();
    names.forEach((name, a) => out.setAttribute(name, new THREE.Float32BufferAttribute(b[a], 3)));
    return out;
  });
}

const _R = new THREE.Matrix4();
const _S = new THREE.Matrix4();
const _T = new THREE.Matrix4();
/** Полувысота щита — вокруг нижнего края он падает вперёд */
const SHIELD_R = 0.45;
/** Обломки летят, лежат и тают столько секунд */
const BREAK_S = 1.5;
/** Отшатнулся после поломки щита, с */
const STAGGER_S = 0.5;
const G = 9.8;
/** Разлёт обломков: скорость (м/с, в осях модели: +Z — вперёд), вращение (рад/с), поворот на земле (лёг плашмя) */
const FLY: ReadonlyArray<{ v: readonly [number, number, number]; w: readonly [number, number, number]; flat: number }> = [
  { v: [-1.7, 2.6, 1.1], w: [3.5, 1.5, 7.5], flat: 0.5 },
  { v: [1.6, 2.9, 0.7], w: [-4.5, -2, -6.5], flat: -0.7 },
];
const SHARD_BONES = ['wingL', 'wingR'] as const;

/** Обломок i в полёте и на земле: t — секунд с поломки, walked — сколько моб с тех пор пробежал (в осях модели) */
function shardPose(out: THREE.Matrix4, rig: ShieldRig, i: number, t: number, s: number, walked: number): void {
  if (t >= BREAK_S) {
    hide(out);
    return;
  }
  const f = FLY[i];
  const [cx, cy, cz] = rig.shards[i];
  const y0 = rig.hip + rig.shieldY + cy;
  const ground = 0.06 - 0.06 * smooth(seg(t, 1.05, BREAK_S));
  const land = (f.v[1] + Math.sqrt(f.v[1] * f.v[1] + 2 * G * (y0 - 0.06))) / G;
  const tf = Math.min(t, land);
  const x = cx + f.v[0] * tf;
  const y = Math.max(ground, y0 + f.v[1] * tf - (G / 2) * tf * tf);
  // на земле — там, где упал: моб убежал вперёд, обломки остаются позади
  const z = rig.shieldZ + cz + f.v[2] * tf - walked;
  const k = smooth(seg(t, land - 0.12, land + 0.04));
  const rx = f.w[0] * tf * (1 - k) - (Math.PI / 2) * k;
  const ry = f.w[1] * tf * (1 - k) + f.flat * k;
  const rz = f.w[2] * tf * (1 - k);
  const shrink = 1 - smooth(seg(t, 1.05, BREAK_S)) * 0.97;
  _S.makeScale(s, s, s);
  link(out, _S, x, y, z, rx, ry, rz, shrink);
  out.multiply(_T.makeTranslation(-cx, -cy, -cz));
}

export function shieldPose(rig: ShieldRig, a: MobAnim, out: MobPose): void {
  const s = seedScale(a.seed);
  const intact = ((a.flags ?? 0) & ZF_SHIELD) !== 0;
  const ft = intact ? 99 : (a.flagT ?? 99);
  const stagger = intact ? 0 : bump(clamp01(ft / STAGGER_S));
  const scared = intact ? 0 : smooth(clamp01(ft / 0.3));
  const duty = 0.52 + seedFrac(a.seed, 2) * 0.1;
  // без щита семенит чаще и мельче — бежит, а не шагает
  const n = rig.steps + (intact ? 0 : 1);
  const travel = (duty * 1.25) / n / s;
  const walk = smooth(clamp01(a.speed / 1));
  const t = a.t + a.seed * 9;
  const ph = a.gait * n;
  const tilt = (seedFrac(a.seed, 5) - 0.5) * 0.3;
  const swing = Math.sin(ph * TAU);

  let lean = 0.04 + walk * (0.06 + 0.12 * scared);
  let roll = swing * (0.08 - 0.03 * scared) * walk;
  let yaw = swing * 0.06 * walk;
  let breathe = 1 + Math.sin(t * 2) * 0.015 * (1 - walk);
  let headY = -rig.duck * 0.4 * scared;
  let headZ = Math.sin(ph * TAU * 2) * 0.03 * walk;
  let headRx = -0.05;
  let headRy = Math.sin(t * 0.75) * 0.45 * (1 - walk) * (1 - scared) + Math.sin(t * 5.3) * 0.3 * scared * (1 - walk);
  let shieldZ = 0;
  let shieldRx = 0;
  let shieldRz = 0;
  let eyes = intact ? blink(t, a.seed) : 1;
  // руки (обе вместе): 0 — держат щит за края; + — опускаются вниз и назад, − — поднимаются вперёд и вверх;
  // spread — разведены в стороны, reach — тянутся вперёд
  let arms = 0;
  let spread = 1;
  let reach = 0;
  if (!intact) {
    // без щита: на бегу — паника, руки над головой и трясутся в такт шагам; стоя — опущены, подрагивают
    arms = (1.05 + 0.08 * Math.sin(t * 2.3)) * (1 - walk) + (-2.1 + 0.35 * Math.sin(ph * TAU * 2)) * walk;
    spread = 1.1 + 0.15 * walk;
  }

  if (a.st === ZS_ATTACK) {
    const q = (a.stT / 0.6) % 1;
    if (intact) {
      // удар щитом: замах назад — выпад вперёд — назад; голова прячется на ударе, руки тянутся за щитом
      const back = q < 0.3 ? smooth(q / 0.3) : 0;
      const thrust = q >= 0.3 && q < 0.45 ? smooth((q - 0.3) / 0.15) : q >= 0.45 ? 1 - smooth((q - 0.45) / 0.55) : 0;
      lean = 0.04 - 0.12 * back + 0.32 * thrust;
      shieldZ = -0.1 * back + 0.3 * thrust;
      shieldRx = -0.1 * thrust;
      headY = -rig.duck * 0.35 * thrust;
      reach = shieldZ;
    } else {
      // без щита: обе лапы над головой — и хлоп сверху вниз
      const up = q < 0.35 ? smooth(q / 0.35) : 0;
      const down = q >= 0.35 && q < 0.5 ? smooth((q - 0.35) / 0.15) : q >= 0.5 ? 1 - smooth((q - 0.5) / 0.5) : 0;
      arms = q < 0.35 ? 1.05 - 3.1 * up : -2.05 + 2.75 * smooth(seg(q, 0.35, 0.5)) + 0.35 * smooth(seg(q, 0.5, 1));
      spread = 1 + 0.15 * up;
      lean = 0.04 - 0.14 * up + 0.3 * down;
      headY -= rig.duck * 0.2 * down;
    }
    headRy = 0;
    roll = yaw = 0;
  }

  // щит сломан: отшатнулся, руки вверх «ой!», голова втянулась
  if (stagger > 0) {
    lean -= 0.3 * stagger;
    arms = arms * (1 - stagger) - 2.3 * stagger;
    spread += 0.3 * stagger;
    headY -= rig.duck * 0.5 * stagger;
    headRx += 0.25 * stagger;
  }

  // попадание: голова ныряет (за щит, если он цел), щит дрожит
  const h = a.hit;
  if (h > 0) {
    headY -= rig.duck * smooth(clamp01(h * 1.6));
    headZ -= 0.05 * h;
    shieldRz += Math.sin(a.t * 40) * 0.12 * h;
    lean -= 0.12 * h;
    breathe *= 1 - 0.05 * h;
    eyes = Math.min(eyes, 1 - 0.85 * h);
    if (!intact) arms -= 0.6 * h;
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
    // руки отпустили щит, раскинуты и болтаются
    arms = arms * (1 - fall) - 1.2 * fall + Math.sin(a.t * 14) * 0.4 * kick;
    spread = spread * (1 - fall) + 1.35 * fall;
    reach = 0;
  }

  pivotBone(_R, 0, 0, -0.28, 0, y, 0, rx, 0, 0, sc);
  let hy = rig.hip;
  if (legsFree) {
    hy = biped(out.legL, out.legR, _R, ph, duty, travel * walk, rig.hipX, rig.hip, 0, rig.hip, 0.25 + 0.05 * scared, 0.05);
  } else {
    const k = Math.sin(a.t * 16) * 0.55 * kick;
    linkS(out.legL, _R, rig.hipX, rig.hip, 0, -0.9 * smooth(seg(d, 0.1, 0.35)) + k, 0, 0.2, 1, 1, 1);
    linkS(out.legR, _R, -rig.hipX, rig.hip, 0, -0.9 * smooth(seg(d, 0.1, 0.35)) - k, 0, -0.2, 1, 1, 1);
  }
  linkS(out.body, _R, 0, hy, 0, lean, yaw, roll, 1, breathe, 1);
  link(out.head, out.body, 0, rig.neckY + headY, rig.neckZ + headZ, headRx, headRy, tilt, 1);
  linkS(out.extra, out.head, 0, rig.eyeY, 0, 0, 0, 0, 1, eyes, 1);
  // руки от линии плеч (поворот вокруг неё — у обеих рук сразу); на выпаде кисти тянутся вперёд за щитом
  const rk = 1 + reach / Math.max(0.1, rig.reach);
  linkS(out.armL, out.body, 0, rig.shoulderY, rig.shoulderZ, arms, 0, 0, spread, 1, rk);

  if (!intact) {
    // разбит: обломки летят и лежат, где упали (пройденный с поломки путь — назад), потом тают
    const walked = d > 0 ? 0 : (Math.max(0, a.speed) * Math.min(ft, BREAK_S)) / s;
    for (let i = 0; i < 2; i++) shardPose(out[SHARD_BONES[i]], rig, i, ft, s, walked);
    return;
  }
  // щит цел: две половины вместе — один щит в руках
  const shield = out.wingL;
  if (d > 0) {
    // щит отдельно: заваливается вперёд вокруг нижнего края и ложится плашмя
    const f = smooth(seg(d, 0.08, 0.4));
    const phi = (f * f * Math.PI) / 2; // падает с ускорением
    const yb = (rig.shieldY + hy - SHIELD_R) * (1 - f) + 0.1 * f; // нижний край опускается на землю
    const shrink = 1 - 0.85 * smooth(seg(d, 0.7, 1));
    _S.makeScale(s, s, s);
    link(shield, _S, 0, yb + SHIELD_R * Math.cos(phi) - smooth(seg(d, 0.72, 1)) * 0.1, rig.shieldZ + SHIELD_R * Math.sin(phi), phi, 0, 0, shrink);
  } else {
    link(shield, out.body, 0, rig.shieldY, rig.shieldZ + shieldZ, shieldRx, 0, shieldRz, 1);
  }
  out.wingR.copy(shield);
}
