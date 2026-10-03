// Щупальце Кракена (Z_TENTACLE): пять звеньев — снизу толстое, к кончику тоньше; спина фиолетовая в пятнах варенья,
// с изнанки розовые присоски, кончик свит спиралью и светится сиреневым (его видно издалека и в тумане).
// Корень — на воде (y = 0), основание уходит под воду; «перед» — +Z, туда оно и бьёт.
// Состояния: покачивается (ZS_TENT_IDLE и прочие), удар (ZS_TENT_SLAM: 0–1,3 с поднимается из воды, откидывается и
// дрожит — замах виден заранее; 1,3–1,5 с хлёсткий удар вперёд-вниз, дальше лежит), лежит после удара — «открыто»,
// руби (ZS_TENT_REST), встаёт, когда снова покачивается. Срубили — обмякает и уходит под воду. Появилось — вырастает.
import * as THREE from 'three';
import { ZS_ATTACK, ZS_TENT_REST, ZS_TENT_SLAM, Z_TENTACLE } from '../../../shared/fort.ts';
import { merge, setBone, setBoneS, type BoneName, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import { jamDrop, jamSpot, paint, smooth, tube } from './sea-shapes.ts';

/** Длины звеньев и толщина в суставах (у основания каждого звена и у кончика) */
const LEN = [2.0, 1.75, 1.55, 1.38, 1.2] as const;
const RAD = [0.78, 0.66, 0.54, 0.43, 0.31, 0.18] as const;
const BONES_T: readonly BoneName[] = ['body', 'head', 'armL', 'armR', 'tail'];
/** Основание под водой; при замахе щупальце выталкивает себя из воды */
const BASE_Y = -0.7;
/** Замах и удар (с от начала ZS_TENT_SLAM): круг метки у крепости — 1,5 с */
const SLAM_AT = 1.3;
const SLAM_HIT = 1.5;

const BACK = 0x8a4aa6;
const FRONT = 0xdc8fca;
const JAM = 0x4e1f66;
const SUCKER = 0xf6cde6;
const SUCKER_IN = 0xb0538f;
const GLOW = 0x9a63ff;

/** Позы суставов: наклон вперёд (+ — к цели), вбок */
const IDLE_P = [0.14, -0.22, -0.1, 0.3, 0.55] as const;
const IDLE_A = [0.05, 0.08, 0.1, 0.13, 0.18] as const;
const COCK_P = [-0.42, -0.24, -0.1, 0.32, 0.78] as const;
const SLAM_P = [0.18, 0.3, 0.42, 0.5, 0.25] as const;
const LIMP_P = [-0.35, -0.2, 0.15, 0.3, 0.5] as const;

function segmentGeo(i: number): THREE.BufferGeometry {
  const L = LEN[i];
  const r0 = RAD[i];
  const r1 = RAD[i + 1];
  const prof: THREE.Vector2[] = [];
  for (const a of [-90, -62, -32, 0]) {
    const rad = (a * Math.PI) / 180;
    prof.push(new THREE.Vector2(Math.max(0.001, r0 * Math.cos(rad)), r0 * 0.85 * Math.sin(rad)));
  }
  for (const u of [0.35, 0.7, 1]) prof.push(new THREE.Vector2(r0 + (r1 - r0) * u + Math.sin(u * Math.PI) * 0.025, L * u));
  prof.push(new THREE.Vector2(r1 * 0.94, L + 0.12));
  const spots = [r0 * -0.5, L * 0.3, -r0 * 0.75, r0 * 0.45, r0 * 0.6, L * 0.75, -r0 * 0.6, r0 * 0.4];
  const back = new THREE.Color();
  const front = new THREE.Color(FRONT);
  const jam = new THREE.Color(JAM);
  const body = paint(new THREE.LatheGeometry(prof, 12), (p, n, o) => {
    o.copy(back.setHex(BACK)).lerp(front, smooth(0.15, 0.7, n.z));
    const j = jamSpot(p, spots);
    if (j > 0) o.lerp(jam, smooth(0.1, 0.45, j));
  });
  const parts: THREE.BufferGeometry[] = [body];
  // присоски: два столбика по изнанке (+Z), в каждом по две
  for (const y of [0.3, 0.7]) {
    for (const c of [-0.45, 0.45]) {
      const r = r0 + (r1 - r0) * y;
      const rs = r * 0.3;
      const sucker = new THREE.CylinderGeometry(rs, rs * 1.08, 0.08, 8, 1, false).rotateX(Math.PI / 2).rotateY(c);
      sucker.translate(Math.sin(c) * (r - 0.015), L * y, Math.cos(c) * (r - 0.015));
      const cx = Math.sin(c) * (r + 0.025);
      const cz = Math.cos(c) * (r + 0.025);
      const cy = L * y;
      parts.push(paint(sucker, (p, _n, o) => o.setHex(Math.hypot(p.x - cx, p.y - cy, p.z - cz) < rs * 0.55 ? SUCKER_IN : SUCKER)));
    }
  }
  // капли варенья с изнанки
  if (i >= 1 && i <= 3) parts.push(jamDrop(0.07 - i * 0.008, 0.2, 0x7a1f5c).translate(-Math.sin(0.9) * r0 * 0.9, L * 0.55, Math.cos(0.9) * r0 * 0.9));
  return merge(parts);
}

/** Кончик-спираль: завиток к изнанке (+Z) поверх последнего звена; светится */
function curlGeo(): THREE.BufferGeometry {
  const L = LEN[4];
  const rho0 = 0.46;
  const pts: THREE.Vector3[] = [];
  const n = 18;
  const turn = Math.PI * 1.85;
  for (let k = 0; k < n; k++) {
    const psi = (k / (n - 1)) * turn;
    const rho = rho0 * (1 - 0.6 * (psi / turn));
    pts.push(new THREE.Vector3(0, L + 0.04 + rho * Math.sin(psi), rho0 - rho * Math.cos(psi)));
  }
  const g = tube(pts, (_i, u) => RAD[5] * (1 - 0.62 * u) + 0.015, 7, { capEnd: 1.2 });
  return paint(g, (p, _n, o) => o.setHex(p.z > rho0 * 1.3 ? 0xb88aff : GLOW));
}

const _root = new THREE.Matrix4();
const _loc = new THREE.Matrix4();
const P = new Float64Array(5);
const S = new Float64Array(5);
const Q = new Float64Array(5);

/** Покачивание в P/S на время t (ярость — быстрее и злее) */
function idle(a: MobAnim, out: Float64Array, side: Float64Array): void {
  const w = a.rage ? 1.95 : 1.3;
  const ph = a.seed * 6.28;
  for (let i = 0; i < 5; i++) {
    out[i] = IDLE_P[i] + (a.rage ? 0.05 * i : 0) + IDLE_A[i] * Math.sin(w * a.t - 0.9 * i + ph);
    side[i] = 0.07 * Math.sin(0.8 * w * a.t - 0.7 * i + ph * 1.7);
  }
}

function tentaclePose(a: MobAnim, out: MobPose): void {
  const st = a.st === ZS_ATTACK ? ZS_TENT_SLAM : a.st;
  idle(a, P, S);
  let baseY = BASE_Y;
  let grow = 1;
  let squash = 1;
  if (st === ZS_TENT_SLAM) {
    const T = a.stT;
    const cock = smooth(0, 0.55, T);
    const shiver = smooth(0.2, SLAM_AT, T) * (1 - smooth(SLAM_AT, SLAM_AT + 0.05, T));
    for (let i = 0; i < 5; i++) {
      const strike = smooth(SLAM_AT + 0.025 * i, SLAM_HIT - 0.06 + 0.015 * i, T);
      const cocked = P[i] + (COCK_P[i] - P[i]) * cock + 0.035 * shiver * Math.sin(a.t * 37 + i * 1.3);
      P[i] = cocked + (SLAM_P[i] - cocked) * strike * strike;
      S[i] = S[i] * (1 - cock) + 0.05 * shiver * Math.sin(a.t * 41 + i);
    }
    // выталкивает себя из воды на замахе и падает обратно при ударе
    baseY = BASE_Y + 0.5 * smooth(0, 1.1, T) - 0.8 * smooth(SLAM_AT, SLAM_HIT, T);
    grow = 1 + 0.06 * smooth(0.2, SLAM_AT, T) * (1 - smooth(SLAM_AT, SLAM_HIT, T));
    // шлепок: сплющилось и отпружинило
    const k = Math.max(0, T - SLAM_HIT);
    if (T > SLAM_HIT - 0.02) {
      squash = 1 - 0.12 * Math.exp(-k * 9) * Math.cos(k * 22);
      for (let i = 1; i < 5; i++) P[i] -= 0.06 * Math.exp(-k * 7) * Math.sin(k * 20);
    }
  } else if (st === ZS_TENT_REST) {
    // лежит без сил: проседает, дышит, кончик подёргивается, иногда пробует подняться
    const T = a.stT;
    const twitch = Math.sin(a.t * 6.5) * (Math.sin(a.t * 0.9 + a.seed * 5) > 0.55 ? 0.16 : 0.04);
    const tryUp = Math.max(0, Math.sin(a.t * 2.4 + a.seed * 3)) ** 6 * 0.06;
    for (let i = 0; i < 5; i++) {
      P[i] = SLAM_P[i] + (i === 2 ? 0.05 : i === 3 ? 0.07 : 0) * smooth(0, 0.8, T) - (i === 0 ? tryUp : 0) + (i === 4 ? twitch : 0);
      S[i] = 0.02 * Math.sin(a.t * 1.1 + i);
    }
    baseY = BASE_Y - 0.3;
    squash = 1 + 0.025 * Math.sin(a.t * 2.2);
  } else if (a.t > 1.3) {
    // снова встаёт после удара (начало покачивания) — от лежачей позы к стоячей
    const up = smooth(0, 0.9, a.stT);
    if (up < 1) for (let i = 0; i < 5; i++) P[i] = SLAM_P[i] + (P[i] - SLAM_P[i]) * up;
    baseY = BASE_Y - 0.3 * (1 - up);
  }
  // только что появилось — вырастает из воды, раскручиваясь
  if (a.t < 1.3 && a.die === 0) {
    const e = smooth(0, 1.3, a.t);
    baseY -= 7.5 * (1 - e);
    for (let i = 0; i < 5; i++) P[i] += (1 - e) * (0.25 + 0.15 * i);
  }
  if (a.hit > 0) {
    for (let i = 0; i < 5; i++) {
      P[i] -= 0.1 * a.hit * (0.5 + i * 0.2);
      S[i] += 0.06 * a.hit * Math.sin(a.t * 45 + i);
    }
  }
  // срубили: обмякает, валится назад и уходит под воду, кончик машет на прощание
  if (a.die > 0) {
    const d = smooth(0, 0.45, a.die);
    for (let i = 0; i < 5; i++) {
      P[i] = P[i] + (LIMP_P[i] - P[i]) * d + (i === 4 ? 0.35 * Math.sin(a.t * 9) * (1 - smooth(0.6, 0.9, a.die)) : 0);
      S[i] *= 1 - d;
    }
    baseY -= 9 * Math.pow(smooth(0.15, 1, a.die), 1.3);
    grow = 1 - 0.3 * a.die;
  }
  for (let i = 0; i < 5; i++) Q[i] = 0.12 * Math.sin(a.t * 0.7 + i * 0.8 + a.seed * 4);
  const size = (1 + (a.seed - 0.5) * 0.08) * grow;
  setBone(_root, 0, baseY, 0, 0, 0, 0, size);
  for (let i = 0; i < 5; i++) {
    const prev = i === 0 ? _root : out[BONES_T[i - 1]];
    const y = i === 0 ? 0 : LEN[i - 1];
    if (squash !== 1 && i === 2) setBoneS(_loc, 0, y, 0, P[i], Q[i], S[i], 1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    else setBone(_loc, 0, y, 0, P[i], Q[i], S[i]);
    out[BONES_T[i]].multiplyMatrices(prev, _loc);
  }
}

/** Где ложится удар: от корня вперёд (м) и высота изнанки над водой (м) — по позе в момент шлепка */
export const TENTACLE_SLAM = (() => {
  let z = 0;
  let y = BASE_Y - 0.3;
  let ang = 0;
  const zs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < 5; i++) {
    ang += SLAM_P[i];
    z += LEN[i] * Math.sin(ang);
    y += LEN[i] * Math.cos(ang);
    zs.push(z);
    ys.push(y);
  }
  return { reach: Math.round(((zs[2] + zs[4]) / 2) * 10) / 10, y: Math.round((Math.min(ys[3], ys[4]) - RAD[4]) * 10) / 10 };
})();

export const KRAKEN_TENTACLE: MobDef = {
  id: 'kraken-tentacle',
  name: 'Щупальце Кракена',
  kinds: [Z_TENTACLE],
  height: 7.2,
  parts: [
    { bone: 'body', geo: segmentGeo(0) },
    { bone: 'head', geo: segmentGeo(1) },
    { bone: 'armL', geo: segmentGeo(2) },
    { bone: 'armR', geo: segmentGeo(3) },
    { bone: 'tail', geo: segmentGeo(4) },
    { bone: 'tail', geo: curlGeo(), glow: true },
  ],
  pose: tentaclePose,
};
