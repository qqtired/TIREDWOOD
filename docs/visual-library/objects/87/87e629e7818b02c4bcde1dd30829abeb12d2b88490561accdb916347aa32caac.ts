// Валун (Z_GOLEM) — босс 21-й волны: сгорбленный каменный голем из валунов. Голова-булыжник утоплена между плечами,
// длинные руки до колен с кулаками-глыбами, мох на макушке и плечах, сиреневые руны, на загривке — запасной камень.
// Бросок: подкидывает камень с загривка в руки, поднимает над головой и швыряет (камень пропадает из рук через 0,7 с —
// дальше его рисует крепость; новый камень вырастает на загривке). Землетрясение: кулаки вверх, дрожь — и удар
// в землю ровно к метке. Ядро открыто: светящийся камень выходит из груди, руны вокруг вспыхивают. Гибель —
// рассыпается на камни. Шесть частей: тело, руки (одной костью — бьют и бросают вместе), две ноги, свет (глаза,
// ядро и руны), камень.
import * as THREE from 'three';
import { TICK_RATE } from '../../../shared/constants.ts';
import { BOSS_OPEN_TICKS, BOSS_WARN_TICKS, ZS_ATTACK, ZS_BOSS_OPEN, ZS_QUAKE, ZS_THROW, Z_GOLEM } from '../../../shared/fort.ts';
import { colored, merge, type MobDef, type MobPart } from './kit.ts';
import {
  HIDE, attach, boulder, clamp01, lump, composeInto, heartbeat, jamDrip, jamSpot, keys, lerp, paint, smooth, win, wobble, type Geo, type V3,
} from './set-d-shapes.ts';

const WARN = BOSS_WARN_TICKS / TICK_RATE;
const OPEN = BOSS_OPEN_TICKS / TICK_RATE;
/** Камень срывается с рук: за ROCK_FLIGHT_TICKS (66) тиков до удара — через 0,7 с замаха (как на сервере ветки fort) */
const RELEASE = WARN - 66 / TICK_RATE;

// ------------------------------------------------------------ размеры

/** Ось плеч (кость рук) и тазобедренные суставы */
const SHOULDER: V3 = [0, 4.35, 0];
const HIP_X = 0.72;
const HIP_Y = 1.85;
const LEG_LEN = 1.85;
/** Плоскость глаз — кость света (глаза плоские, ядро и руны выходят из груди при растяжке по Z) */
const EYE: V3 = [0, 4.97, 0.93];
/** Запасной камень: на загривке и в руках (в осях рук) */
const ROCK_BACK: V3 = [0, 5.2, -0.78];
const ROCK_HELD: V3 = [0, -3.28, 0.25];
const STRIDE = 1.25;
const DUTY = 0.6;

const STONE = 0x8d9095;
const STONE_D = 0x575a61;
const STONE_L = 0xb9bbbd;
const MOSS = 0x6f9a4a;
const MOSS_L = 0x8db85c;
const RUNE = 0xb48cff;

// ------------------------------------------------------------ геометрия

/** Камень с перепадом тона сверху вниз и лёгкими пятнами */
function stone(rx: number, ry: number, rz: number, seed: number, at: V3, bump = 0.14, detail = 2, tone = 0): Geo {
  const g = boulder(rx, ry, rz, seed, bump, detail).translate(at[0], at[1], at[2]);
  const lo = new THREE.Color(STONE_D).offsetHSL(0, 0, tone * 0.5);
  const mid = new THREE.Color(STONE).offsetHSL(0, 0, tone);
  const hi = new THREE.Color(STONE_L).offsetHSL(0, 0, tone);
  return paint(g, (x, y, z, c) => {
    const k = clamp01((y - at[1]) / (ry * 2) + 0.5);
    c.copy(lo).lerp(mid, Math.min(1, k * 1.5)).lerp(hi, Math.max(0, k - 0.62) * 1.6);
    // впадины темнее, бугры светлее — камень, а не глина
    const dx = (x - at[0]) / rx;
    const dy = (y - at[1]) / ry;
    const dz = (z - at[2]) / rz;
    const n = Math.hypot(dx, dy, dz) || 1;
    const b = lump(dx / n, dy / n, dz / n, seed);
    c.offsetHSL(0, 0, b * 0.09);
    const speck = Math.sin(x * 7.1 + seed) * Math.sin(z * 6.3 - seed) * Math.sin(y * 5.7);
    if (speck > 0.6) c.offsetHSL(0, 0, -0.07);
  });
}

/** Шапка мха: приплюснутая кочка */
function moss(r: number, at: V3, tilt = 0): Geo {
  const g = boulder(r, r * 0.32, r * 0.85, r * 10, 0.18, 1).rotateZ(tilt).translate(at[0], at[1], at[2]);
  return paint(g, (_x, y, _z, c) => c.setHex(y > at[1] + r * 0.1 ? MOSS_L : MOSS));
}

/** Руна-краска: зигзаг из трёх палочек, лежит на поверхности (нормаль n) */
function runeMark(at: V3, n: V3, size: number, hex = RUNE): Geo {
  const parts = [
    new THREE.BoxGeometry(size * 0.16, size, size * 0.1).rotateZ(0.35).translate(-size * 0.22, 0, 0),
    new THREE.BoxGeometry(size * 0.16, size * 0.8, size * 0.1).rotateZ(-0.6).translate(0, size * 0.05, 0),
    new THREE.BoxGeometry(size * 0.16, size, size * 0.1).rotateZ(0.35).translate(size * 0.22, 0, 0),
  ].map((g) => colored(g, hex));
  const g = merge(parts);
  // ось +Z рисунка — по нормали
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n[0], n[1], n[2]).normalize());
  return g.applyQuaternion(q).translate(at[0], at[1], at[2]);
}

function bodyGeo(): Geo {
  const parts: Geo[] = [
    // грудь-глыба (выдаётся вперёд дальше лица), таз, голова между плеч, тяжёлая бровь
    stone(1.62, 1.42, 1.25, 1, [0, 3.55, 0.05], 0.17, 3),
    // загривок-глыба: широкие сгорбленные плечи
    stone(1.55, 0.85, 1.0, 8, [0, 4.4, -0.3], 0.2, 2, 0.03),
    stone(1.15, 0.75, 0.92, 2, [0, 2.1, -0.08], 0.2, 2, -0.04),
    stone(0.74, 0.62, 0.56, 3, [0, 4.95, 0.38], 0.1, 2, 0.04),
    stone(0.8, 0.2, 0.3, 4, [0, 5.24, 0.78], 0.15, 1, -0.03),
    // челюсть-уступ под глазами
    stone(0.55, 0.22, 0.3, 5, [0, 4.62, 0.76], 0.15, 1, -0.05),
    // камешки на спине
    stone(0.45, 0.4, 0.35, 6, [0.7, 4.2, -1.0], 0.15, 1), stone(0.38, 0.35, 0.3, 7, [-0.75, 3.3, -1.05], 0.15, 1),
    // мох на макушке и груди
    moss(0.55, [0.05, 5.5, 0.35], 0.1), moss(0.4, [-0.8, 4.65, 0.55], -0.4), moss(0.35, [0.95, 2.75, 0.85], 0.6),
    // руны на боках груди
    runeMark([1.38, 3.85, 0.62], [0.85, 0.1, 0.5], 0.42), runeMark([-1.4, 3.4, 0.55], [-0.88, 0, 0.45], 0.4),
    // варенье: шлепок на груди сбоку и потёк
    jamSpot(0.32, [-0.78, 3.95, 1.0], [-0.45, 0.25, 0.85], 1),
    jamDrip(0.5, 0.08).translate(-0.62, 3.8, 1.12),
  ];
  return merge(parts);
}

function armsGeo(): Geo {
  // обе руки одной костью: ось плеч в начале координат; руки висят почти до колен, кулаки-глыбы
  const parts: Geo[] = [];
  for (const s of [-1, 1]) {
    const sh = (p: V3): V3 => [s * p[0], p[1] - SHOULDER[1], p[2]];
    parts.push(stone(0.72, 0.68, 0.72, 10 + s, sh([1.4, 4.42, -0.02]), 0.18, 2, 0.03));
    parts.push(stone(0.44, 0.7, 0.46, 12 + s, sh([1.52, 3.45, 0.04]), 0.18, 1));
    parts.push(stone(0.5, 0.78, 0.5, 14 + s, sh([1.55, 2.4, 0.14]), 0.16, 2, -0.03));
    parts.push(stone(0.64, 0.58, 0.66, 16 + s, sh([1.5, 1.3, 0.25]), 0.16, 2, 0.04));
    parts.push(moss(0.45, sh([1.4, 4.98, 0.0]), -s * 0.3));
    parts.push(moss(0.3, sh([1.6, 2.95, 0.3]), -s * 0.5));
    parts.push(runeMark(sh([1.5 + 0.43, 3.5, 0.2]), [s * 0.95, 0, 0.3], 0.34));
  }
  parts.push(jamDrip(0.4, 0.075).translate(1.15, 4.62 - SHOULDER[1], 0.45));
  return merge(parts);
}

function legGeo(s: number): Geo {
  // нога: глыба-бедро и плоская ступня с тремя пальцами; в осях тазобедренного сустава
  const hip = (p: V3): V3 => [s * p[0] - s * HIP_X, p[1] - HIP_Y, p[2]];
  return merge([
    stone(0.58, 0.88, 0.62, 20 + s, hip([0.72, 1.05, -0.05]), 0.12, 2, -0.02),
    stone(0.64, 0.27, 0.78, 22 + s, hip([0.76, 0.25, 0.18]), 0.12, 1, -0.05),
    stone(0.2, 0.17, 0.22, 24 + s, hip([0.45, 0.17, 0.92]), 0.2, 1), stone(0.22, 0.18, 0.24, 25 + s, hip([0.76, 0.18, 0.98]), 0.2, 1),
    stone(0.2, 0.17, 0.22, 26 + s, hip([1.07, 0.17, 0.92]), 0.2, 1),
  ]);
}

function lightGeo(): Geo {
  // кость в плоскости глаз: глаза — плоские щёлки (растяжка по Z их не меняет); ядро и руны лежат впереди (+Z) и
  // при сжатии по Z уходят внутрь груди
  const parts: Geo[] = [];
  for (const s of [-1, 1]) {
    parts.push(colored(new THREE.SphereGeometry(1, 10, 6).scale(0.24, 0.14, 0.025).rotateZ(-s * 0.3).translate(s * 0.29, 0, 0.0), EYE_C));
  }
  const coreAt: V3 = [0, 3.42 - EYE[1], 0.52];
  const lo = new THREE.Color(0x0aa6c4);
  const hi = new THREE.Color(0x8af6ff);
  parts.push(paint(new THREE.SphereGeometry(0.56, 14, 10).translate(coreAt[0], coreAt[1], coreAt[2]), (_x, y, z, c) => c.copy(lo).lerp(hi, clamp01(0.45 + (y - coreAt[1]) * 1.1 + (z - coreAt[2]) * 0.6))));
  // руны вокруг ядра (на поверхности груди, когда ядро вышло)
  const runes: Array<[number, number, number]> = [[0.78, 3.8, 1.14], [-0.78, 3.8, 1.14], [0.42, 2.98, 1.18], [-0.42, 2.98, 1.18]];
  for (const [x, y, z] of runes) parts.push(runeMark([x, y - EYE[1], z - EYE[2] + 0.17], [x * 0.4, 0, 1], 0.3, 0x56e3f0));
  return merge(parts);
}
const EYE_C = 0xa654f0;

function rockGeo(): Geo {
  // запасной камень: чуть рыжее, с мхом и пятном варенья
  const g = boulder(1.0, 0.86, 0.95, 31, 0.14, 2);
  const lo = new THREE.Color(0x6e6a5e);
  const hi = new THREE.Color(0xa59f8c);
  return merge([
    paint(g, (_x, y, _z, c) => c.copy(lo).lerp(hi, clamp01(0.5 + y * 0.6))),
    moss(0.42, [0.1, 0.78, -0.15], 0.2),
    jamSpot(0.3, [0.55, 0.3, 0.68], [0.6, 0.3, 0.7], 2),
  ]);
}

function buildParts(): MobPart[] {
  return [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'armL', geo: armsGeo() },
    { bone: 'legL', geo: legGeo(1) },
    { bone: 'legR', geo: legGeo(-1) },
    { bone: 'head', geo: lightGeo(), glow: true },
    { bone: 'prop', geo: rockGeo() },
  ];
}

// ------------------------------------------------------------ поза

const F = new THREE.Matrix4();
const L = new THREE.Matrix4();
const _a = new THREE.Matrix4();
const _b = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/** Нога: угол маха вокруг бедра и подъём ступни (stance — ступня едет назад вместе с землёй) */
function step(phase: number, walk: number, out: { a: number; lift: number }): void {
  const p = ((phase % 1) + 1) % 1;
  // опора — доля DUTY цикла: ступня едет назад ровно с ходом (не скользит)
  const half = ((DUTY * STRIDE) / 2) * walk;
  let z: number;
  if (p < DUTY) {
    z = half - (p / DUTY) * 2 * half;
    out.lift = 0;
  } else {
    const k = (p - DUTY) / (1 - DUTY);
    z = -half + k * k * (3 - 2 * k) * 2 * half;
    out.lift = 0.34 * walk * Math.sin(Math.PI * k);
  }
  out.a = -Math.asin(Math.max(-0.9, Math.min(0.9, z / LEG_LEN)));
}
const lgL = { a: 0, lift: 0 };
const lgR = { a: 0, lift: 0 };

export const GOLEM: MobDef = {
  id: 'boss-golem',
  name: 'Валун',
  kinds: [Z_GOLEM],
  height: 6.1,
  parts: buildParts(),
  pose(a, out) {
    const t = a.t;
    const T = a.stT;
    const st = a.st;
    const seed = a.seed;
    const sp = Math.abs(a.speed);
    const walk = clamp01(sp / 1.0);
    const g = a.speed < 0 ? 1 - a.gait : a.gait;
    let px = 0;
    let py = 0;
    let pz = 0;
    let lean = 0;
    let twist = 0;
    let roll = 0;
    /** Руки: мах вокруг оси плеч (− — вперёд и вверх) */
    let arms = -0.08;
    /** Камень: 0 — на загривке, 1 — в руках; рост (0 — нет камня) */
    let held = 0;
    let rockS = 1;
    /** Ядро и руны: 0 — в груди, 1 — снаружи */
    let core = 0;
    let quiver = 0;
    // в бросках, ударах и «ядре» стоит на месте — ноги не шагают, даже если скорость пришла не нулевая
    const busy = st === ZS_THROW || st === ZS_QUAKE || st === ZS_BOSS_OPEN || st === ZS_ATTACK;
    const stepW = busy ? 0 : clamp01(sp / 0.5);
    step(g, stepW, lgL);
    step(g + 0.5, stepW, lgR);

    if (st === ZS_THROW) {
      // руки вверх, камень с загривка подлетает в руки, замах назад — бросок ровно когда камень срывается (0,7 с)
      arms = keys(T, [[0, -0.08], [0.25, -2.85], [RELEASE - 0.05, -3.12], [RELEASE + 0.14, -1.1], [1.2, -0.45], [WARN, -0.3]]);
      lean = keys(T, [[0, 0], [0.25, -0.06], [RELEASE - 0.05, -0.18], [RELEASE + 0.14, 0.24], [1.2, 0.12], [WARN, 0.05]]);
      py = keys(T, [[0, 0], [RELEASE - 0.05, 0.12], [RELEASE + 0.14, -0.1], [WARN, 0]]);
      held = smooth(0.12, 0.38, T);
      rockS = T < RELEASE + 0.02 ? 1 : smooth(1.1, WARN, T);
      if (T >= RELEASE + 0.02) held = 0;
    } else if (st === ZS_QUAKE) {
      // кулаки вверх, дрожит от натуги — и обоими в землю к удару
      arms = keys(T, [[0, -0.08], [0.9, -2.9], [1.5, -3.0], [1.74, -0.38], [WARN, -0.32]]);
      lean = keys(T, [[0, 0], [0.9, -0.12], [1.5, -0.16], [1.74, 0.34], [WARN, 0.36]]);
      py = keys(T, [[0, 0], [0.9, 0.16], [1.5, 0.2], [1.74, -0.38], [WARN, -0.42]]);
      quiver = win(0.9, 1.1, 1.45, 1.52, T);
    } else if (st === ZS_BOSS_OPEN) {
      // выдохся: ядро выходит из груди, руны горят; грудь вперёд, руки висят, плечи ходят
      const wob = wobble(T, 11, 4);
      core = win(0.15, 0.5, OPEN - 0.45, OPEN - 0.06, T);
      arms = lerp(-0.32, 0.05, smooth(0, 0.5, T)) + 0.04 * Math.sin(T * 4);
      lean = lerp(0.36, -0.1, smooth(0, 0.45, T)) * (1 - smooth(OPEN - 0.4, OPEN, T)) + 0.04 * wob;
      py = lerp(-0.4, 0, smooth(0, 0.4, T)) + 0.05 * Math.sin(T * 4.2) * core;
      roll = 0.03 * Math.sin(T * 1.9) * core;
    } else if (st === ZS_ATTACK) {
      // молотит двумя кулаками сверху
      const u = T % 1;
      arms = keys(u, [[0, -0.08], [0.42, -2.6], [0.58, -0.35], [1, -0.08]]);
      lean = keys(u, [[0, 0], [0.42, -0.1], [0.58, 0.28], [1, 0]]);
      py = keys(u, [[0, 0], [0.58, -0.2], [1, 0]]);
    } else {
      // тяжёлый шаг: при постановке ноги туша оседает и качается к опорной ноге, руки болтаются
      const c2 = Math.cos(4 * Math.PI * g);
      py = -0.09 * walk * (0.5 + 0.5 * c2) + 0.03 * (1 - walk) * Math.sin(t * 1.3 + seed * 4);
      roll = 0.025 * walk * Math.sin(2 * Math.PI * g);
      twist = 0.03 * walk * Math.sin(2 * Math.PI * g);
      lean = 0.08 * walk;
      arms = -0.08 - 0.12 * walk * Math.sin(4 * Math.PI * g) + 0.03 * (1 - walk) * Math.sin(t * 1.3 + seed * 4 + 0.5);
    }
    if (quiver > 0) {
      px += 0.05 * quiver * Math.sin(t * 47);
      roll += 0.02 * quiver * Math.sin(t * 41);
    }
    // ярость: каменная дрожь
    if (a.rage) {
      px += 0.035 * Math.sin(t * 43 + seed * 9);
      pz += 0.025 * Math.sin(t * 37);
      roll += 0.012 * Math.sin(t * 51);
    }
    const hit = a.hit;
    if (hit > 0) {
      lean -= 0.1 * hit;
      pz -= 0.1 * hit;
      arms -= 0.25 * hit;
    }
    // гибель: дрожь — и рассыпается: голова-грудь оседает и клонится, руки падают вперёд, ноги разъезжаются,
    // камень скатывается назад, глаза гаснут; потом всё уходит в землю
    const d = a.die;
    let apart = 0;
    let sink = 0;
    let fade = 1;
    if (d > 0) {
      apart = smooth(0.15, 0.6, d);
      sink = smooth(0.7, 1, d);
      fade = Math.max(HIDE, 1 - smooth(0.85, 1, d));
      const shake = 1 - smooth(0.1, 0.25, d);
      px += 0.08 * shake * Math.sin(d * 120);
      py = -2.2 * apart - 2.5 * sink;
      lean = 0.45 * apart;
      roll = 0.2 * apart;
      arms = lerp(arms, 0.6, apart);
      held = 0;
      core = 0;
    }

    composeInto(F, px, py, pz, lean, twist, roll, fade);
    out.body.copy(F);
    // руки
    if (d > 0) {
      // руки отваливаются вперёд и вниз отдельно
      composeInto(_a, px + 0.0, -1.6 * apart - 2.5 * sink, pz + 1.1 * apart, 0, 0, 0, fade);
      attach(out.armL, _a, SHOULDER[0], SHOULDER[1], SHOULDER[2], arms, 0, 0);
    } else attach(out.armL, F, SHOULDER[0], SHOULDER[1], SHOULDER[2], arms, 0, 0);
    // ноги — без наклона туловища (ступни на земле); при гибели разъезжаются
    composeInto(L, px, d > 0 ? -2.3 * sink : 0, pz, 0, twist, 0, fade);
    attach(out.legL, L, HIP_X + 0.5 * apart, HIP_Y + lgL.lift - 1.1 * apart, 0, lgL.a, 0, -0.5 * apart);
    attach(out.legR, L, -HIP_X - 0.5 * apart, HIP_Y + lgR.lift - 1.1 * apart, 0, lgR.a, 0, 0.5 * apart);
    // свет: глаза; ядро и руны выходят из груди растяжкой по Z (пульс — тоже по Z)
    const beat = heartbeat(t, 0.8);
    const cz = core > 0 ? lerp(0.35, 1, core) * (1 + 0.16 * beat * core) : HIDE;
    attach(out.head, F, EYE[0], EYE[1], EYE[2], 0, 0, 0, d > 0 ? 1 - smooth(0.2, 0.4, d) + HIDE : 1, d > 0 ? 1 - smooth(0.2, 0.4, d) + HIDE : 1, cz);
    // камень: на загривке (растёт заново после броска) или в руках; при гибели скатывается назад
    if (d > 0) {
      composeInto(_a, px, 5.2 - 4.5 * apart - 2.5 * sink, -0.78 - 1.6 * apart, -2.5 * apart, 0.4 * apart, 0, fade);
      out.prop.copy(_a);
    } else {
      composeInto(_a, ROCK_BACK[0], ROCK_BACK[1], ROCK_BACK[2], 0.2, 0.3, 0, 1);
      _a.premultiply(F);
      if (held > 0) {
        attach(_b, out.armL, ROCK_HELD[0], ROCK_HELD[1], ROCK_HELD[2], t * 0.6, 0, 0, 1);
        // дуга с загривка в руки: позиция — по прямой с подъёмом, поворот — свой
        _v.setFromMatrixPosition(_a);
        _w.setFromMatrixPosition(_b);
        _v.lerp(_w, held);
        _v.y += 1.2 * Math.sin(Math.PI * held);
        _q.setFromRotationMatrix(_b);
        out.prop.compose(_v, _q, _s.set(1, 1, 1));
      } else out.prop.copy(_a);
      if (rockS < 1) {
        // новый камень вырастает на загривке
        _s.set(Math.max(HIDE, rockS), Math.max(HIDE, rockS), Math.max(HIDE, rockS));
        out.prop.scale(_s);
      }
    }
  },
};
