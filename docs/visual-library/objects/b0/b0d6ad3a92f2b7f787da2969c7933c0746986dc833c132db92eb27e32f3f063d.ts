// Таран (Z_RAM) — босс 14-й волны: бык-таран в латах. На лбу — бревно с железной оковкой (им бьёт ворота), рога,
// стальной налобник с прорезями для светящихся глаз, золотое кольцо в носу, полосатая попона войска Барона,
// на спине — банка варенья с ядром. Ноги парами по бокам — иноходь вперевалку, как у игрушечного быка.
// Прицел — опустил голову, роет копытом, фыркает паром; разгон — галоп; оглушён у ворот — ядро всплывает из банки
// на спине; топот — встаёт на дыбы и обрушивается; вой — голову вверх. Гибель — копытами кверху и в землю.
// Шесть частей: тело, голова, две пары ног, «лицо» (глаза и пар — одна светящаяся часть), ядро.
import * as THREE from 'three';
import { TICK_RATE } from '../../../shared/constants.ts';
import { BOSS_OPEN_TICKS, BOSS_WARN_TICKS, ZS_ATTACK, ZS_BOSS_OPEN, ZS_CHARGE, ZS_CHARGE_WARN, ZS_STOMP, Z_RAM } from '../../../shared/fort.ts';
import { colored, merge, type MobDef, type MobPart } from './kit.ts';
import {
  HIDE, JAM_HI, attach, ball, byHeight, clamp01, composeInto, heartbeat, jamDrip, jamSpot, keys, lerp, paint, smooth, steamPuff, tube, win,
  wobble, type Geo, type V3,
} from './set-d-shapes.ts';

/** Таран воет — сейчас выбегут шустрики (ZS_HOWL в shared/fort.ts ветки fort) */
const ZS_HOWL = 31;
const HOWL = 1;
const WARN = BOSS_WARN_TICKS / TICK_RATE;
const OPEN = BOSS_OPEN_TICKS / TICK_RATE;

// ------------------------------------------------------------ размеры (корень — на земле под серединой, лицом в +Z)

/** Шея: точка, вокруг которой качается голова */
const NECK: V3 = [0, 2.78, 0.95];
/** Середина между глазами — кость «лица» (глаза и пар) */
const EYE: V3 = [0, 3.42, 1.76];
/** Ноги: пара по бокам, середина между передней и задней; передняя и задняя — на ±LEG_DZ (все — под попоной) */
const LEG_X = 0.55;
const LEG_Z = -0.42;
const LEG_DZ = 0.87;
/** Верх ног под попоной: при шаге копыта ходят вперёд-назад, а верх стоит (сдвиг по высоте — нога «качается») */
const LEG_TOP = 1.4;
/** Банка с ядром на спине */
const JAR: V3 = [0, 3.02, -0.78];
const CORE_IN: V3 = [0, 3.2, -0.78];
const CORE_OUT: V3 = [0, 4.08, -0.78];
const STRIDE = 1.25;
/** Доля опоры в шаге и полуразмах копыт: копыто на земле едет назад ровно с ходом — не скользит */
const DUTY = 0.6;
const HALF = (DUTY * STRIDE) / 2;

const HIDE_C = 0x7e4a2b;
const HIDE_D = 0x5a331e;
const STEEL = 0x8a949b;
const STEEL_D = 0x5d656b;
const WOOD = 0x8a5a34;
const GOLD = 0xf1bd45;
const CLOTH = 0x5f3596;
const CLOTH_2 = 0x7d50c4;

// ------------------------------------------------------------ геометрия

function torsoGeo(): Geo[] {
  // туша: бочка и горб над плечами
  const barrel = new THREE.SphereGeometry(1, 16, 11).scale(1.15, 1.12, 1.4).translate(0, 2.05, -0.42);
  const hump = new THREE.SphereGeometry(1, 13, 9).scale(1.02, 0.95, 0.85).translate(0, 2.62, 0.42);
  const hide = (g: Geo) => byHeight(g, [[1.0, HIDE_D], [2.4, HIDE_C], [3.6, 0x9a6239]]);
  // попона: полосатая (цвета войска), золотой подол, пятно варенья
  const cape = paint(new THREE.CylinderGeometry(1.19, 1.25, 1.14, 20, 2, true).scale(1, 1, 1.23).translate(0, 1.55, -0.42), (x, _y, z, c) => {
    const a = Math.atan2(x, (z + 0.42) / 1.23);
    c.setHex(Math.floor((a + Math.PI) / (Math.PI / 5)) % 2 ? CLOTH : CLOTH_2);
  });
  const hem = colored(new THREE.CylinderGeometry(1.27, 1.27, 0.12, 20, 1, true).scale(1, 1, 1.23).translate(0, 1.0, -0.42), GOLD);
  // седло-латы вокруг банки и ремни
  const saddle = colored(new THREE.SphereGeometry(1, 12, 3, 0, Math.PI * 2, 0, 0.5).scale(1.02, 1.0, 1.15).translate(0, 2.17, -0.6), STEEL);
  const straps = [-0.3, -1.25].map((z) => colored(new THREE.TorusGeometry(1.0, 0.06, 3, 18).scale(1.16, 1.13, 1).translate(0, 2.05, z), 0x3d2a1c));
  // хвост задран крючком (злой бык), с кисточкой
  const tail = colored(tube([[0, 2.42, -1.66], [0, 2.7, -1.84], [0.06, 3.02, -1.84], [0.12, 3.22, -1.72]], (u) => 0.09 - u * 0.03, 8, 5), HIDE_D);
  const tuft = ball(0.17, 0x2e1c12, [0.14, 3.32, -1.62], [1, 1.4, 1], 6, 5);
  const spots: Geo[] = [jamSpot(0.32, [1.17, 1.45, -0.9], [1, 0, 0], 1), jamSpot(0.28, [-1.19, 1.25, 0.15], [-1, 0, 0.1], 2), jamSpot(0.26, [0.4, 2.9, -1.55], [0.3, 0.6, -0.7], 3)];
  return [hide(barrel), hide(hump), cape, hem, saddle, ...straps, tail, tuft, ...spots];
}

function backJarGeo(): Geo[] {
  // банка на спине: стекло, варенье (открыто сверху — оттуда всплывает ядро), обвязка
  const prof: Array<[number, number]> = [[0.001, 0], [0.36, 0], [0.42, 0.06], [0.44, 0.18], [0.44, 0.58], [0.4, 0.68], [0.34, 0.74], [0.34, 0.8], [0.37, 0.82], [0.37, 0.88], [0.33, 0.9]];
  const glass = paint(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14), (_x, y, _z, c) => c.setHex(y < 0.04 || y > 0.62 ? 0xcfe5ef : y > 0.4 ? 0x8e2766 : 0x5a1244));
  const inner = colored(new THREE.LatheGeometry([new THREE.Vector2(0.31, 0.89), new THREE.Vector2(0.31, 0.72), new THREE.Vector2(0.4, 0.62)], 14), 0xa8c8d8);
  const jamTop = paint(new THREE.CircleGeometry(0.42, 14).rotateX(-Math.PI / 2).translate(0, 0.6, 0), (x, _y, z, c) => c.setHex(Math.hypot(x, z) < 0.18 ? JAM_HI : 0x7a1d5a));
  const label = colored(new THREE.CylinderGeometry(0.447, 0.447, 0.24, 10, 1, true, -1.2, 2.4).translate(0, 0.32, 0), 0xf4e5c2);
  const drip = jamDrip(0.28, 0.06).translate(0.3, 0.82, 0.18);
  const out = [glass, inner, jamTop, label, drip];
  for (const g of out) g.translate(JAR[0], JAR[1], JAR[2]);
  return out;
}

function headGeo(): Geo {
  // голова (в осях шеи): лоб, налобник с прорезями, морда, ноздри, кольцо, рога, уши, бревно-таран
  const o = (p: V3): V3 => [p[0] - NECK[0], p[1] - NECK[1], p[2] - NECK[2]];
  const skull = byHeight(new THREE.SphereGeometry(1, 14, 10).scale(0.86, 0.8, 0.72).translate(0, 3.15, 1.08), [[2.4, HIDE_D], [3.9, HIDE_C]]);
  const muzzle = colored(new THREE.SphereGeometry(1, 12, 8).scale(0.62, 0.42, 0.4).translate(0, 2.62, 1.58), 0xd9a684);
  const nostrils = [-1, 1].map((s) => colored(new THREE.SphereGeometry(0.1, 6, 4).scale(1, 0.7, 0.5).translate(s * 0.2, 2.68, 1.95), 0x3a2220));
  const ring = colored(new THREE.TorusGeometry(0.2, 0.045, 4, 12).translate(0, 2.42, 1.96), GOLD);
  // налобник: щит с прорезями для глаз, ребро по середине, заклёпки
  const plate = new THREE.Shape();
  plate.moveTo(-0.6, 0.48);
  plate.quadraticCurveTo(0, 0.62, 0.6, 0.48);
  plate.lineTo(0.5, -0.12);
  plate.quadraticCurveTo(0.32, -0.5, 0, -0.56);
  plate.quadraticCurveTo(-0.32, -0.5, -0.5, -0.12);
  plate.lineTo(-0.6, 0.48);
  for (const s of [-1, 1]) {
    const h = new THREE.Path();
    h.absellipse(s * 0.32, 0.02, 0.19, 0.15, 0, Math.PI * 2, false, s * 0.25);
    plate.holes.push(h);
  }
  const plateGeo = new THREE.ExtrudeGeometry(plate, { depth: 0.08, bevelEnabled: false, curveSegments: 6 });
  plateGeo.rotateX(-0.12).translate(0, EYE[1] - 0.02, EYE[2] - 0.04);
  const ridge = colored(new THREE.BoxGeometry(0.1, 0.9, 0.08).rotateX(-0.12).translate(0, EYE[1] + 0.02, EYE[2] + 0.06), STEEL_D);
  const rivets = [[-0.48, 0.38], [0.48, 0.38], [-0.38, -0.2], [0.38, -0.2]].map(([x, y]) => ball(0.05, 0xc4ccd2, [x, EYE[1] + y, EYE[2] + 0.06], [1, 1, 0.6], 5, 4));
  // рога: из-за ушей наружу, вверх и вперёд
  const horns = [-1, 1].map((s) => paint(tube([[s * 0.66, 3.58, 0.95], [s * 1.06, 3.7, 1.0], [s * 1.26, 3.98, 1.16], [s * 1.18, 4.24, 1.36]], (u) => 0.18 - u * 0.14, 10, 6),
    (_x, y, _z, c) => c.setHex(y > 4.1 ? 0xb3a586 : 0xefe3c4)));
  const ears = [-1, 1].map((s) => paint(new THREE.ConeGeometry(0.17, 0.5, 6).rotateZ(s * 1.9).translate(s * 0.98, 3.24, 0.82), (x, _y, _z, c) => c.setHex(Math.abs(x) > 1.1 ? 0xd98f8a : HIDE_C)));
  // бревно-таран поверх налобника, железная оковка спереди, обручи, кожаные ремни; варенье на оковке
  const log = paint(new THREE.CylinderGeometry(0.3, 0.32, 1.3, 11, 3).rotateX(Math.PI / 2).translate(0, 4.0, 1.04), (x, y, z, c) => {
    const ring = Math.abs(Math.sin(z * 13)) < 0.18;
    c.setHex(ring ? 0x6e4527 : WOOD);
    if (y > 4.22 && Math.abs(x) < 0.1) c.setHex(0x9c6a40);
  });
  const cap = colored(new THREE.CylinderGeometry(0.37, 0.37, 0.3, 12).rotateX(Math.PI / 2).translate(0, 4.0, 1.72), STEEL_D);
  const capFace = colored(new THREE.SphereGeometry(0.37, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.3, 1).rotateX(Math.PI / 2).translate(0, 4.0, 1.86), STEEL);
  const bands = [0.67, 1.24].map((z) => colored(new THREE.TorusGeometry(0.33, 0.05, 3, 12).translate(0, 4.0, z), STEEL_D));
  const strap = colored(new THREE.TorusGeometry(0.62, 0.06, 3, 14, Math.PI).translate(0, 3.55, 0).rotateY(Math.PI / 2).translate(0, 0, 1.12), 0x3d2a1c);
  const drips = [jamDrip(0.34, 0.075).translate(0.36, 3.9, 1.78), jamDrip(0.22, 0.06).translate(-0.3, 4.28, 1.72)];
  const parts = [skull, muzzle, ...nostrils, ring, colored(plateGeo, STEEL), ridge, ...rivets, ...horns, ...ears, log, cap, capFace, ...bands, strap, ...drips];
  const g = merge(parts);
  const n = o([0, 0, 0]);
  return g.translate(n[0], n[1], n[2]);
}

function legsGeo(side: number): Geo {
  // пара ног одного бока (иноходь): передняя и задняя; верх прячется под попоной
  const parts: Geo[] = [];
  for (const dz of [LEG_DZ, -LEG_DZ]) {
    parts.push(byHeight(new THREE.CylinderGeometry(0.26, 0.32, 1.15, 10).translate(0, 0.86, dz), [[0.3, HIDE_D], [1.4, HIDE_C]]));
    parts.push(colored(new THREE.CylinderGeometry(0.31, 0.36, 0.3, 10).translate(0, 0.15, dz + 0.04), 0x2e211b));
    parts.push(colored(new THREE.BoxGeometry(0.05, 0.31, 0.2).translate(0, 0.15, dz + 0.32), 0x15100d));
    parts.push(colored(new THREE.TorusGeometry(0.31, 0.07, 3, 10).rotateX(Math.PI / 2).translate(0, 0.33, dz + 0.02), 0xe9dcc0));
  }
  const g = merge(parts);
  void side;
  return g;
}

function faceGeo(): Geo {
  // глаза в прорезях налобника (плоские — не меняются, когда кость тянется по Z) и пар из ноздрей (тянется по Z)
  const parts: Geo[] = [];
  for (const s of [-1, 1]) {
    parts.push(colored(new THREE.SphereGeometry(1, 10, 6).scale(0.17, 0.13, 0.03).rotateZ(s * 0.25).translate(s * 0.32, 0.0, -0.03), EYE_C));
    // клубы пара растут от ноздрей вперёд; сжатые по Z — прячутся в морде
    const puffs: Array<[number, number, number, number]> = [[0.2, -0.8, 0.34, 0.11], [0.22, -0.84, 0.64, 0.16], [0.25, -0.9, 1.0, 0.21]];
    puffs.forEach(([x, y, z, r], i) => parts.push(steamPuff(r, [s * x, y, z], i + (s > 0 ? 0 : 1), i === 0 ? 1 : 2)));
  }
  return merge(parts);
}
const EYE_C = 0xa654f0;

function coreGeo(): Geo {
  const lo = new THREE.Color(0x0aa6c4);
  const hi = new THREE.Color(0x8af6ff);
  const orb = paint(new THREE.SphereGeometry(0.4, 14, 10), (_x, y, z, c) => c.copy(lo).lerp(hi, clamp01(0.4 + y * 1.1 + z * 0.5)));
  const sparks: Geo[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    sparks.push(colored(new THREE.OctahedronGeometry(0.09).scale(1, 1.6, 1).translate(0.62 * Math.sin(a), 0.18 * Math.cos(a * 2), 0.62 * Math.cos(a)), 0x7af0ff));
  }
  return merge([orb, ...sparks]);
}

function buildParts(): MobPart[] {
  return [
    { bone: 'body', geo: merge([...torsoGeo(), ...backJarGeo()]) },
    { bone: 'head', geo: headGeo() },
    { bone: 'legL', geo: legsGeo(1) },
    { bone: 'legR', geo: legsGeo(-1) },
    { bone: 'extra', geo: faceGeo(), glow: true },
    { bone: 'prop', geo: coreGeo(), glow: true },
  ];
}

// ------------------------------------------------------------ поза

const F = new THREE.Matrix4();
const L = new THREE.Matrix4();
const P = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _sh = new THREE.Matrix4();

/** Пара ног: смещение вдоль хода (stance/swing) и подъём копыт */
interface LegState { z: number; lift: number; tilt: number; reach: number }
const legA: LegState = { z: 0, lift: 0, tilt: 0, reach: 0 };
const legB: LegState = { z: 0, lift: 0, tilt: 0, reach: 0 };

/** Иноходь: фаза пары 0…1 — опора (доля duty: копыта едут назад вместе с землёй), потом перенос вперёд с подъёмом */
function pace(phase: number, half: number, liftH: number, duty: number, out: LegState): void {
  const p = ((phase % 1) + 1) % 1;
  if (p < duty) {
    out.z = half - (p / duty) * 2 * half;
    out.lift = 0;
  } else {
    const k = (p - duty) / (1 - duty);
    out.z = -half + k * k * (3 - 2 * k) * 2 * half;
    out.lift = liftH * Math.sin(Math.PI * k);
  }
  out.tilt = 0;
  out.reach = 0;
}

/** Кость пары ног: от рамки ног; копыта сдвинуты на s.z (верх ног на месте), передняя нога поднята на tilt */
function setLegs(out: THREE.Matrix4, frame: THREE.Matrix4, side: number, s: LegState): void {
  composeInto(_t, side * LEG_X, s.lift, LEG_Z, 0, 0, 0);
  out.multiplyMatrices(frame, _t);
  if (s.z !== 0) {
    // сдвиг: z' = z + s.z·(1 − y / LEG_TOP) — копыта остаются плоско на земле, верх не вылезает из-под попоны
    _sh.set(1, 0, 0, 0, 0, 1, 0, 0, 0, -s.z / LEG_TOP, 1, s.z, 0, 0, 0, 1);
    out.multiply(_sh);
  }
  if (s.reach !== 0) {
    // передняя нога вперёд (назад), задняя стоит: z' = z + reach·(z + LEG_DZ)
    _sh.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1 + s.reach, s.reach * LEG_DZ, 0, 0, 0, 1);
    out.multiply(_sh);
  }
  if (s.tilt !== 0) {
    // подъём передней ноги: y' = y + k·(z + LEG_DZ) — заднее копыто стоит, задняя нога не кренится и не торчит из-под попоны
    const k = Math.tan(s.tilt);
    _sh.set(1, 0, 0, 0, 0, 1, k, k * LEG_DZ, 0, 0, 1, 0, 0, 0, 0, 1);
    out.multiply(_sh);
  }
}

export const RAM: MobDef = {
  id: 'boss-ram',
  name: 'Таран',
  kinds: [Z_RAM],
  height: 4.3,
  parts: buildParts(),
  pose(a, out) {
    const t = a.t;
    const T = a.stT;
    const st = a.st;
    const seed = a.seed;
    const sp = Math.abs(a.speed);
    const walk = clamp01(sp / 1.2);
    /** Размах шага: в полную силу почти сразу — иначе на малой скорости копыта поедут */
    const stepW = clamp01(sp / 0.5);
    const g = a.speed < 0 ? 1 - a.gait : a.gait;
    let px = 0;
    let py = 0;
    let pz = 0;
    let pitch = 0;
    let twist = 0;
    let roll = 0;
    /** На дыбы: поворот всего тела вокруг задних копыт (рад, + — нос вверх) */
    let rear = 0;
    let hp = 0;
    let hy = 0;
    let hr = 0;
    let steam = 0;
    let core = 0;
    let eyeSy = 1;
    pace(g, HALF * stepW, 0.3 * stepW, DUTY, legA);
    pace(g + 0.5, HALF * stepW, 0.3 * stepW, DUTY, legB);

    if (st === ZS_CHARGE_WARN) {
      // прицел: голову вниз (бревно — в ворота), осел на задние, роет левым передним копытом, фыркает паром
      const aim = smooth(0, 0.3, T);
      hp = 0.32 * aim + 0.05 * smooth(1.45, WARN, T);
      pz = -0.18 * aim - 0.1 * smooth(1.45, WARN, T);
      pitch = 0.06 * aim;
      legA.z = 0;
      legA.lift = 0;
      legB.z = 0;
      legB.lift = 0;
      if (T > 0.3 && T < 1.5) {
        // роет: переднее копыто вверх-вперёд, удар в землю и загрёб назад — три раза
        const k = ((T - 0.3) / 0.4) % 1;
        const paw = win(0.3, 0.36, 1.42, 1.5, T);
        legA.tilt = paw * (k < 0.55 ? 0.3 * Math.sin(Math.PI * (k / 0.55)) : 0);
        legA.reach = paw * (k < 0.55 ? lerp(-0.03, 0.05, smooth(0, 0.3, k)) : lerp(0.05, -0.03, (k - 0.55) / 0.45));
        steam = win(0.45, 0.6, 0.85, 1.0, k);
        hr = 0.05 * Math.sin(k * Math.PI * 2);
      }
      if (T >= 1.5) steam = 0.6 + 0.4 * Math.sin(t * 30);
      roll = 0.015 * Math.sin(t * 24) * smooth(1.2, WARN, T);
    } else if (st === ZS_CHARGE) {
      // рывок: галоп по времени (на 15 м/с шаги по пути слились бы в дрожь), голова вниз, пар струёй
      const ph = t * 4.8 + seed;
      pace(ph, 0.7, 0.45, 0.45, legA);
      pace(ph + 0.42, 0.7, 0.45, 0.45, legB);
      pitch = 0.12;
      hp = 0.36;
      py = 0.16 * Math.abs(Math.sin(Math.PI * 2 * ph));
      steam = 0.55 + 0.45 * ((t * 3.3) % 1);
      roll = 0.03 * Math.sin(Math.PI * 2 * ph);
    } else if (st === ZS_BOSS_OPEN) {
      // оглушён: отскок от ворот, голова кругом, ядро всплывает из банки на спине
      const bump = wobble(T, 13, 4);
      pz = -0.35 * smooth(0, 0.18, T) * (1 - smooth(0.4, 1.2, T));
      pitch = -0.08 * bump;
      hp = 0.18 + 0.12 * Math.sin(T * 2.1);
      hr = 0.22 * Math.sin(T * 3.1) * smooth(0.1, 0.4, T);
      hy = 0.18 * Math.sin(T * 1.7);
      roll = 0.06 * Math.sin(T * 2.6) * smooth(0.1, 0.4, T);
      core = win(0.15, 0.55, OPEN - 0.5, OPEN - 0.08, T);
      eyeSy = 1 - 0.45 * core;
      legA.z = legB.z = 0;
      legA.lift = legB.lift = 0;
    } else if (st === ZS_STOMP) {
      // топот: встаёт на дыбы, молотит передними — и всей тушей вниз к удару
      rear = keys(T, [[0, 0], [1.05, 0.72], [1.42, 0.76], [1.72, -0.04], [WARN, -0.06]]);
      const flail = win(0.4, 0.7, 1.35, 1.5, T);
      legA.tilt = 0.25 * flail * Math.sin(t * 13);
      legB.tilt = -0.25 * flail * Math.sin(t * 13);
      legA.z = legB.z = 0;
      legA.lift = legB.lift = 0;
      hp = keys(T, [[0, 0], [1.0, -0.42], [1.42, -0.35], [1.72, 0.3], [WARN, 0.25]]);
      steam = win(0.6, 0.8, 1.5, 1.65, T) * (0.6 + 0.4 * Math.sin(t * 25));
      py = -0.12 * smooth(1.68, WARN, T);
    } else if (st === ZS_HOWL) {
      // вой: сел на задние, морду вверх, трясётся от рёва
      const up = smooth(0, 0.3, T) * (1 - smooth(HOWL - 0.15, HOWL + 0.1, T));
      rear = 0.2 * up;
      hp = -0.62 * up;
      hr = 0.03 * Math.sin(t * 40) * up;
      steam = 0;
      legA.z = legB.z = 0;
      legA.lift = legB.lift = 0;
    } else if (st === ZS_ATTACK) {
      // бодается: голову вниз — тычок вперёд
      const u = T % 0.8;
      hp = keys(u, [[0, 0], [0.3, -0.25], [0.45, 0.5], [0.8, 0]]);
      pz = keys(u, [[0, 0], [0.3, -0.2], [0.45, 0.35], [0.8, 0]]);
      legA.z = legB.z = 0;
      legA.lift = legB.lift = 0;
    } else {
      // шаг иноходью: тело переваливается, голова кивает; на месте — дышит, оглядывается, фыркает
      const s2 = Math.sin(2 * Math.PI * g);
      roll = 0.035 * walk * s2;
      py = 0.07 * walk * Math.abs(Math.cos(2 * Math.PI * g));
      hp = 0.06 * walk * Math.sin(4 * Math.PI * g) + 0.04 * (1 - walk) * Math.sin(t * 0.9 + seed * 5);
      hy = 0.18 * (1 - walk) * Math.sin(t * 0.45 + seed * 3);
      py += 0.02 * (1 - walk) * Math.sin(t * 1.6);
      const snort = (t + seed * 7) % 5.5;
      steam = Math.max(steam, 0.7 * win(0, 0.12, 0.35, 0.5, snort));
    }
    // ярость: дрожит, мотает головой, фыркает чаще
    if (a.rage) {
      px += 0.035 * Math.sin(t * 47 + seed * 9);
      roll += 0.02 * Math.sin(t * 39);
      hy += 0.06 * Math.sin(t * 9);
      const snort = (t * 1.6) % 1;
      if (st !== ZS_HOWL) steam = Math.max(steam, 0.8 * win(0, 0.15, 0.4, 0.6, snort));
    }
    // попадание: дёрнулся назад, голову вверх
    const hit = a.hit;
    if (hit > 0) {
      pz -= 0.12 * hit;
      hp -= 0.2 * hit;
      pitch -= 0.05 * hit;
    }
    // гибель: копытами кверху и в землю
    const d = a.die;
    let flip = 0;
    let sink = 0;
    let vanish = 1;
    if (d > 0) {
      flip = smooth(0.05, 0.45, d);
      sink = smooth(0.62, 1, d);
      vanish = Math.max(HIDE, 1 - smooth(0.8, 1, d));
      steam = 0;
      core = 0;
      const twitch = win(0.45, 0.5, 0.7, 0.8, d) * Math.sin(d * 90);
      legA.tilt = 0.25 * twitch;
      legB.tilt = -0.25 * twitch;
      legA.lift = legB.lift = 0;
      legA.z = legB.z = 0;
      hp = 0.3 * flip;
      rear = 0;
    }

    // рамка тела; на дыбы — поворот вокруг задних копыт
    composeInto(F, px, py, pz, pitch, twist, roll);
    if (rear !== 0) {
      composeInto(_t, 0, 0, LEG_Z - LEG_DZ, -rear, 0, 0);
      P.makeTranslation(0, 0, -(LEG_Z - LEG_DZ));
      _t.multiply(P);
      F.multiply(_t);
    }
    if (d > 0) {
      // перевернуться на спину вокруг продольной оси (середина туши) и уйти в землю
      composeInto(_t, 0, 1.9 - 1.9 * flip * 0.15 - 2.6 * sink, 0, 0, 0, Math.PI * flip, vanish);
      P.makeTranslation(0, -1.9, 0);
      _t.multiply(P);
      F.premultiply(_t);
      F.premultiply(P.makeTranslation(0, 0, 0));
    }
    out.body.copy(F);
    // ноги: при ходьбе — без наклона и подскока тела (копыта на земле), на дыбы и при гибели — вместе с тушей
    if (rear !== 0 || d > 0) L.copy(F);
    else {
      composeInto(L, px, 0, pz, 0, twist, 0);
      // туша подаётся вперёд-назад (прицел, бодание, отскок, удар) — верх ног идёт с ней, копыта стоят
      legA.z -= pz;
      legB.z -= pz;
    }
    if (rear !== 0) {
      // F уже содержит поворот на дыбы — пары ног повернутся вместе с ним вокруг задних копыт
      setLegs(out.legL, d > 0 ? F : L, 1, legA);
      setLegs(out.legR, d > 0 ? F : L, -1, legB);
    } else {
      setLegs(out.legL, L, 1, legA);
      setLegs(out.legR, L, -1, legB);
    }
    // голова и «лицо»
    attach(out.head, F, NECK[0], NECK[1], NECK[2], hp, hy, hr);
    const sz = steam > 0.02 ? 0.25 + steam : HIDE;
    attach(out.extra, out.head, EYE[0] - NECK[0], EYE[1] - NECK[1], EYE[2] - NECK[2], 0, 0, 0, 1, eyeSy, sz);
    // ядро
    const beat = heartbeat(t, 0.75);
    const cs = core > 0 ? lerp(0.55, 1.2, core) * (1 + 0.2 * beat * core) : HIDE;
    attach(out.prop, F, CORE_IN[0], lerp(CORE_IN[1], CORE_OUT[1], core) + 0.06 * Math.sin(t * 2.4) * core, CORE_IN[2], 0, t * 1.8, 0, cs);
  },
};
