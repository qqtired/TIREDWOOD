// Щупальце Кракена (Z_TENTACLE): пять звеньев — снизу толстое, к концу тоньше, а последнее — булава: раздутое, в
// крупных присосках, с завитком на кончике, который светится сиреневым (его видно издалека и в тумане). Спина
// фиолетовая в пятнах варенья, изнанка розовая. Корень — на воде (y = 0), основание уходит под воду; «перед» — +Z.
//
// Два режима.
// 1. «До булавы» — для крепости (rework/fort-kraken: в снимке щупальца — его булава, корень стоит в воде на своей полосе).
//    Крепость ставит модель корнем на воду над корнем щупальца, лицом к крепости, и передаёт, где булава:
//    anim.tipX/tipY/tipZ — центр булавы относительно корня в осях модели (м). Рука сама выгибается от корня к булаве
//    (тянется, как резиновая, на 10–20 м): поднята (покой, замах, всплытие) — подходит к булаве снизу, удар и лежит —
//    сверху, булава ложится вдоль удара; дрожит на замахе, шлёпается и пружинит на ударе, гибнет — булава падает в
//    воду, рука уходит на дно. anim.wind (с до конца состояния), если есть, точнее ставит взмах.
// 2. Сам по себе — стенд и всё, что не передаёт булаву: покачивается (ZS_TENT_IDLE и прочие), удар (ZS_TENT_SLAM, как
//    у крепости: 0–1,37 с поднимается из воды, откидывается, закручивается и дрожит — замах виден заранее; 1,37–1,6 с —
//    хлёсткий удар вперёд-вниз), лежит — «открыто», руби (ZS_TENT_REST), встаёт; появилось — вырастает из воды.
import * as THREE from 'three';
import { ZS_ATTACK, ZS_TENT_REST, ZS_TENT_SLAM, Z_TENTACLE } from '../../../shared/fort.ts';
import { merge, setBone, setBoneS, type BoneName, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import { jamDrop, jamSpot, paint, smooth, tube } from './sea-shapes.ts';

/** Длины звеньев и толщина в суставах (у основания каждого звена и у кончика); последнее звено — булава */
const LEN = [2.5, 2.2, 1.95, 1.75, 1.6] as const;
const RAD = [0.95, 0.8, 0.66, 0.53, 0.4, 0.22] as const;
/** Булава раздута посередине на столько, м */
const CLUB_BULGE = 0.22;
const BONES_T: readonly BoneName[] = ['body', 'head', 'armL', 'armR', 'tail'];
/** Основание под водой; при замахе щупальце выталкивает себя из воды */
const BASE_Y = -0.85;
/** Замах и удар (с от начала ZS_TENT_SLAM), как у крепости: метка 96 тиков, взмах — последние 14 */
const SLAM_AT = 1.37;
const SLAM_HIT = 1.6;

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
  const club = i === 4;
  const radius = (u: number) => r0 + (r1 - r0) * u + Math.sin(u * Math.PI) * (0.03 + (club ? CLUB_BULGE : 0));
  const prof: THREE.Vector2[] = [];
  // у нижнего звена под водой ещё ствол: на замахе оно приподнимается и откидывается, и над водой не должен
  // показаться закруглённый низ — щупальце растёт из глубины, а не стоит на воде
  const sink = i === 0 ? 1.4 : 0;
  for (const a of [-90, -62, -32, 0]) {
    const rad = (a * Math.PI) / 180;
    prof.push(new THREE.Vector2(Math.max(0.001, r0 * Math.cos(rad)), r0 * 0.85 * Math.sin(rad) - sink));
  }
  if (sink > 0) prof.push(new THREE.Vector2(r0, 0));
  for (const u of club ? [0.2, 0.4, 0.6, 0.8, 1] : [0.35, 0.7, 1]) prof.push(new THREE.Vector2(radius(u), L * u));
  prof.push(new THREE.Vector2(r1 * 0.94, L + 0.14));
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
  // присоски по изнанке (+Z): на звеньях — два столбика по две, на булаве — три ряда крупных
  for (const y of club ? [0.25, 0.5, 0.75] : [0.3, 0.7]) {
    for (const c of [-0.45, 0.45]) {
      const r = radius(y);
      const rs = (club ? 0.36 : 0.3) * (club ? Math.min(r, 0.45) : r);
      const sucker = new THREE.CylinderGeometry(rs, rs * 1.08, 0.09, 8, 1, false).rotateX(Math.PI / 2).rotateY(c);
      sucker.translate(Math.sin(c) * (r - 0.015), L * y, Math.cos(c) * (r - 0.015));
      const cx = Math.sin(c) * (r + 0.03);
      const cz = Math.cos(c) * (r + 0.03);
      const cy = L * y;
      parts.push(paint(sucker, (p, _n, o) => o.setHex(Math.hypot(p.x - cx, p.y - cy, p.z - cz) < rs * 0.55 ? SUCKER_IN : SUCKER)));
    }
  }
  // капли варенья с изнанки
  if (i >= 1 && i <= 3) parts.push(jamDrop(0.09 - i * 0.01, 0.25, 0x7a1f5c).translate(-Math.sin(0.9) * r0 * 0.9, L * 0.55, Math.cos(0.9) * r0 * 0.9));
  return merge(parts);
}

/** Кончик-спираль: завиток к изнанке (+Z) на конце булавы; светится */
function curlGeo(): THREE.BufferGeometry {
  const L = LEN[4];
  const rho0 = 0.55;
  const pts: THREE.Vector3[] = [];
  const n = 18;
  const turn = Math.PI * 1.85;
  for (let k = 0; k < n; k++) {
    const psi = (k / (n - 1)) * turn;
    const rho = rho0 * (1 - 0.6 * (psi / turn));
    pts.push(new THREE.Vector3(0, L + 0.05 + rho * Math.sin(psi), rho0 - rho * Math.cos(psi)));
  }
  const g = tube(pts, (_i, u) => RAD[5] * (1 - 0.62 * u) + 0.02, 7, { capEnd: 1.2 });
  return paint(g, (p, _n, o) => o.setHex(p.z > rho0 * 1.3 ? 0xb88aff : GLOW));
}

// ------------------------------------------------------------ сам по себе (стенд)

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

/** Время замаха: по wind (с до конца удара), если крепость его передаёт, иначе — с начала состояния. ZS_ATTACK
 *  (stT обнуляется на каждом ударе) — короткий шлепок: удар к ~0,3 с */
function slamTime(a: MobAnim): number {
  if (a.st === ZS_ATTACK) return SLAM_AT - 0.08 + a.stT;
  const wind = (a as MobAnim & { wind?: number }).wind;
  return typeof wind === 'number' && Number.isFinite(wind) ? SLAM_HIT - wind : a.stT;
}

function selfPose(a: MobAnim, out: MobPose): void {
  const st = a.st === ZS_ATTACK ? ZS_TENT_SLAM : a.st;
  idle(a, P, S);
  for (let i = 0; i < 5; i++) Q[i] = 0.12 * Math.sin(a.t * 0.7 + i * 0.8 + a.seed * 4);
  let baseY = BASE_Y;
  let grow = 1;
  let squash = 1;
  if (st === ZS_TENT_SLAM) {
    const T = slamTime(a);
    const cock = smooth(0, 0.55, T);
    const shiver = smooth(0.2, SLAM_AT, T) * (1 - smooth(SLAM_AT, SLAM_AT + 0.05, T));
    for (let i = 0; i < 5; i++) {
      const strike = smooth(SLAM_AT + 0.025 * i, SLAM_HIT - 0.06 + 0.015 * i, T);
      const cocked = P[i] + (COCK_P[i] - P[i]) * cock + 0.035 * shiver * Math.sin(a.t * 37 + i * 1.3);
      P[i] = cocked + (SLAM_P[i] - cocked) * strike * strike;
      S[i] = S[i] * (1 - cock) + 0.05 * shiver * Math.sin(a.t * 41 + i);
    }
    // закручивается, как пружина: к крепости поворачивается фиолетовая спина — замах видно и спереди;
    // при ударе раскручивается обратно
    const twist = 0.95 * smooth(0.1, 1.0, T) * (1 - smooth(SLAM_AT - 0.05, SLAM_AT + 0.12, T));
    Q[0] += twist * (a.seed < 0.5 ? 1 : -1);
    Q[1] += 0.25 * twist * (a.seed < 0.5 ? 1 : -1);
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
    baseY -= 9.5 * (1 - e);
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
    baseY -= 11 * Math.pow(smooth(0.15, 1, a.die), 1.3);
    grow = 1 - 0.3 * a.die;
  }
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

// ------------------------------------------------------------ до булавы (крепость)

type ReachAnim = MobAnim & { tipX?: number; tipY?: number; tipZ?: number };

/** Длина руки без булавы и где на ней начинается каждое звено (доли) */
const ARM = LEN[0] + LEN[1] + LEN[2] + LEN[3];
const ARM_AT = [0, LEN[0] / ARM, (LEN[0] + LEN[1]) / ARM, (LEN[0] + LEN[1] + LEN[2]) / ARM, 1] as const;
/** Кривая руки: столько отрезков, точки и длина дуги до каждой */
const N = 24;
const PX = new Float64Array(N + 1);
const PY = new Float64Array(N + 1);
const PZ = new Float64Array(N + 1);
const CUM = new Float64Array(N + 1);
const _B = new THREE.Vector3();
const _C1 = new THREE.Vector3();
const _C2 = new THREE.Vector3();
const _E = new THREE.Vector3();
const _T = new THREE.Vector3();
const _A = new THREE.Vector3();
const _f = new THREE.Vector3();
const _h = new THREE.Vector3();
const _side = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _X = new THREE.Vector3();
const _Y = new THREE.Vector3();
const _Z = new THREE.Vector3();

/** Точка кривой на длине дуги s от основания */
function along(s: number, out: THREE.Vector3): void {
  let k = 1;
  while (k < N && CUM[k] < s) k++;
  const seg = CUM[k] - CUM[k - 1];
  const u = seg > 1e-9 ? Math.min(1, Math.max(0, (s - CUM[k - 1]) / seg)) : 0;
  out.set(PX[k - 1] + (PX[k] - PX[k - 1]) * u, PY[k - 1] + (PY[k] - PY[k - 1]) * u, PZ[k - 1] + (PZ[k] - PZ[k - 1]) * u);
}

function reachPose(a: MobAnim, tx: number, ty: number, tz: number, out: MobPose): void {
  const st = a.st === ZS_ATTACK ? ZS_TENT_SLAM : a.st;
  const T = slamTime(a);
  const size = 1 + (a.seed - 0.5) * 0.08;
  _T.set(tx, ty, tz);
  let baseY = BASE_Y;
  // срубили: булава падает в воду, рука обмякает и вся уходит на дно
  const d = a.die > 0 ? smooth(0, 0.6, a.die) : 0;
  if (a.die > 0) {
    _T.x *= 1 - 0.3 * d;
    _T.z *= 1 - 0.3 * d;
    _T.y += (-2.2 - _T.y) * d;
    const sink = 11 * Math.pow(smooth(0.2, 1, a.die), 1.3);
    baseY -= sink;
    _T.y -= sink;
  }
  // рамка: «вперёд» — к крепости и к булаве вбок; сторона — для покачивания и того, куда смотрят присоски
  _f.set(_T.x * 0.6, 0, Math.max(_T.z, 0) + 3).normalize();
  _side.set(_f.z, 0, -_f.x);
  if (a.hit > 0) _T.addScaledVector(_side, 0.5 * a.hit * Math.sin(a.t * 40));
  // к булаве — снизу (поднята: покой, замах, всплытие) или сверху (удар, лежит вдоль удара, чуть носом вниз)
  let down = 0;
  if (st === ZS_TENT_SLAM) down = smooth(SLAM_AT - 0.05, SLAM_HIT - 0.03, T);
  else if (st === ZS_TENT_REST) down = 1;
  down = Math.max(down, d);
  const flat = Math.hypot(_T.x, _T.z);
  _h.set(_T.x, 0, _T.z).multiplyScalar(1 / Math.max(flat, 2.5));
  const hl = Math.max(1e-6, Math.hypot(_h.x, _h.z));
  _A.set(_h.x * 0.35 * (1 - down), 1 - down, _h.z * 0.35 * (1 - down));
  if (hl > 0.2) _A.addScaledVector(_h, down / hl);
  else _A.addScaledVector(_f, down);
  _A.y -= 0.28 * down;
  _A.normalize();
  // замах: рука выгибается луком к крепости, булава заламывается назад — до самого взмаха
  const cock = st === ZS_TENT_SLAM ? smooth(0, 0.6, T) * (1 - smooth(SLAM_AT - 0.1, SLAM_AT + 0.05, T)) : 0;
  if (cock > 0) {
    _A.multiplyScalar(1 - 0.75 * cock).addScaledVector(_f, -0.85 * cock);
    _A.y += 0.5 * cock;
    _A.normalize();
  }
  // булава: на ударе сплющивается и пружинит
  let clubAx = 1;
  let clubRad = 1;
  if (st === ZS_TENT_REST || (st === ZS_TENT_SLAM && T > SLAM_HIT)) {
    const k = st === ZS_TENT_REST ? a.stT : T - SLAM_HIT;
    const b = Math.exp(-k * 8) * Math.cos(k * 20);
    clubAx = 1 - 0.2 * b;
    clubRad = 1 + 0.14 * b;
  }
  const club = LEN[4] * clubAx * size;
  // кривая Безье: основание → вверх → к булаве по подходу → конец булавы
  _B.set(0, baseY, 0);
  const dist = _B.distanceTo(_T);
  const rise = Math.max(-4, Math.min(10, _T.y - baseY)) * 0.55;
  _C1.set(_h.x * 0.12 * flat, baseY + rise, _h.z * 0.12 * flat).addScaledVector(_f, 2.4 * cock);
  _C2.copy(_T).addScaledVector(_A, -(club * 0.5 + 0.6 + 0.18 * dist));
  _E.copy(_T).addScaledVector(_A, club * 0.5);
  // живость: волна вбок и вверх вдоль руки (концы на месте), дрожь на замахе
  const live = (1 - 0.7 * down) * (1 - d) * (a.rage ? 1.4 : 1);
  const shiver = st === ZS_TENT_SLAM ? 0.14 * smooth(0.2, SLAM_AT - 0.1, T) * (1 - smooth(SLAM_AT - 0.1, SLAM_AT, T)) : 0;
  const w = a.rage ? 1.8 : 1.3;
  for (let k = 0; k <= N; k++) {
    const u = k / N;
    const v = 1 - u;
    const b0 = v * v * v;
    const b1 = 3 * u * v * v;
    const b2 = 3 * u * u * v;
    const b3 = u * u * u;
    const env = Math.sin(Math.PI * Math.min(1, u * 1.15));
    const lat = env * (0.4 * live * Math.sin(w * a.t - 3.2 * u + a.seed * 6) + shiver * Math.sin(a.t * 41 + u * 5));
    PX[k] = b0 * _B.x + b1 * _C1.x + b2 * _C2.x + b3 * _E.x + _side.x * lat;
    PY[k] = b0 * _B.y + b1 * _C1.y + b2 * _C2.y + b3 * _E.y + env * 0.18 * live * Math.sin(1.1 * w * a.t - 2.5 * u);
    PZ[k] = b0 * _B.z + b1 * _C1.z + b2 * _C2.z + b3 * _E.z + _side.z * lat;
    CUM[k] = k === 0 ? 0 : CUM[k - 1] + Math.hypot(PX[k] - PX[k - 1], PY[k] - PY[k - 1], PZ[k] - PZ[k - 1]);
  }
  // звенья по дуге: булава — последние club метров, остальное делят четыре звена по своим длинам (тянутся, тоньше)
  const total = CUM[N];
  const arm = Math.max(0.3 * ARM, total - club);
  for (let i = 0; i < 5; i++) {
    const s0 = i < 4 ? arm * ARM_AT[i] : arm;
    const s1 = i < 4 ? arm * ARM_AT[i + 1] : arm + club;
    along(s0, _p0);
    along(s1, _p1);
    _Y.subVectors(_p1, _p0);
    const len = _Y.length();
    if (len > 1e-5) _Y.multiplyScalar(1 / len);
    else _Y.set(0, 1, 0);
    const ax = Math.max(0.05, len / LEN[i]);
    // рука тоньше, когда тянется (но не верёвка); булава у крепости крупнее — в неё стреляют
    const rad = (i < 4 ? Math.min(1.12, Math.max(0.85, Math.pow(ax, -0.25))) : 1.25 * clubRad) * size;
    // присоски (+Z звена) — на внутреннюю сторону изгиба: у стоячего — к крепости, у лежащего — вниз
    _Z.crossVectors(_side, _Y);
    if (_Z.lengthSq() < 0.01) _Z.copy(_f).addScaledVector(_Y, -_f.dot(_Y));
    _Z.normalize();
    _X.crossVectors(_Y, _Z).normalize();
    const m = out[BONES_T[i]];
    m.makeBasis(_X.multiplyScalar(rad), _Y.multiplyScalar(ax), _Z.multiplyScalar(rad));
    m.setPosition(_p0);
  }
}

function tentaclePose(a: MobAnim, out: MobPose): void {
  const r = a as ReachAnim;
  if (Number.isFinite(r.tipX) && Number.isFinite(r.tipY) && Number.isFinite(r.tipZ)) reachPose(a, r.tipX as number, r.tipY as number, r.tipZ as number, out);
  else selfPose(a, out);
}

/** Где ложится удар в режиме «сам по себе»: от корня вперёд (м) и высота изнанки над водой (м) — по позе шлепка */
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
  height: 9,
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
