// Зомби на экране: те же желейки, что и игроки (тело — профиль желейки), только зелёные-фиолетовые, с сонным глазом,
// зубастым ртом и руками-варежками, вытянутыми вперёд. Все зомби — инстансы: тело, лицо, левая и правая руки,
// приметы типа (повязка, ведро на голове, гребень, пузыри), пятно тени, полоска здоровья — дюжина вызовов отрисовки
// на всю орду. Положение — интерполяция снимков (30 в секунду) на «часах отрисовки», как у чужих игроков; походка,
// удары, лазание, вылезание из земли и вспышка от попадания — здесь же.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOSS_WARN_TICKS, ZK, ZS_ATTACK, ZS_CLIMB, ZS_DROP, ZS_TOP, Z_BLOATER, Z_BRUTE, Z_CLIMBER, Z_KINDS, Z_RUNNER, Z_WALKER, Z_BOSS, Z_FLYER, ZS_BOSS_OPEN, ZS_BOSS_GATE, ZS_BOSS_BOMB, ZS_BOSS_PULSE, ZS_FLY_DIVE,
  ZS_PLANT, ZS_SPIT, Z_ARMORED, Z_MEDIC, Z_SAPPER, Z_SHIELD, Z_SPITTER, Z_RAM, Z_GOLEM, ZS_CHARGE, ZS_CHARGE_WARN, ZS_HOWL,
  ZS_QUAKE, ZS_STOMP, ZS_THROW, isBossKind } from '../../shared/fort.ts';
import { ROCK_FLIGHT_TICKS } from '../../shared/fortkinds.ts';
import { FT_STRIDE } from '../../shared/fortaim.ts';
import { ZF_CREW, ZF_LIT, ZF_RAGE, ZF_SHIELD, ZF_TIER, type ZombieSnap } from '../../shared/fortnet.ts';
import { lerpAngle } from '../../shared/math.ts';
import { BODY_H, bodyProfile } from '../render/outfit3d.ts';
import { softDot } from '../render/textures.ts';
import type { Quality } from '../settings.ts';
import type { GroundQuery } from '../render/avatar.ts';
import { attackSignal } from './signals.ts';
import { Z_KRAKEN, Z_TENTACLE } from '../../shared/fort.ts';
import { Kraken3D } from './kraken3d.ts';

/** Инстансов на часть: живых не больше FORT_MAX_ALIVE, с запасом на тех, кто ещё не пропал из снимков */
const CAP = 72;
const HIST = 12;
/** Скачок больше этого между снимками — телепорт (застрявшего вернули в начало дороги): без «проезда» */
const TELEPORT = 4;
/** Вылезает из земли за столько секунд */
const RISE_S = 0.8;
/** Плечи (в осях тела до масштаба) */
const SHOULDER_Y = 0.92;
const SHOULDER_X = 0.44;
/** Полоска здоровья: видна ближе этого */
const BAR_DIST = 36;

const _m = new THREE.Matrix4();
const _arm = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _up = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _right = new THREE.Vector3();
const WHITE = new THREE.Color(0xffffff);

/** Масштаб желейки под хитбокс типа: высота и ширина */
function kindScale(kind: number): { sy: number; sxz: number } {
  const k = ZK[kind] ?? ZK[0];
  return { sy: (k.hcy + k.hry) / BODY_H, sxz: k.hrx / 0.5 };
}
const SCALES = Array.from({ length: Z_KINDS }, (_, i) => kindScale(i));

/** Что на экране на тике t: положение, курс, состояние, доля здоровья, счётчик ударов */
interface ZPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  st: number;
  hp: number;
  atk: number;
  wind: number;
  tx: number;
  ty: number;
  tz: number;
  stage: number;
  /** Признаки ZF_* и радиус метки из снимка */
  flags: number;
  r: number;
}

const scratch: ZPose = { x: 0, y: 0, z: 0, yaw: 0, st: 0, hp: 1, atk: 0, wind: 0, tx: 0, ty: 0, tz: 0, stage: 0, flags: 0, r: 0 };
/** Ступени: пояс (элита — золото, чемпион — медь с короной) */
const TIER_COLORS = [0xffffff, 0xffc83a, 0xff6a2a];

class Track {
  readonly id: number;
  kind = 0;
  private readonly tick = new Float64Array(HIST);
  private readonly x = new Float64Array(HIST);
  private readonly y = new Float64Array(HIST);
  private readonly z = new Float64Array(HIST);
  private readonly yaw = new Float64Array(HIST);
  private readonly st = new Uint8Array(HIST);
  private readonly hp = new Float32Array(HIST);
  private readonly atk = new Uint8Array(HIST);
  private readonly wind = new Uint16Array(HIST);
  private readonly tx = new Float32Array(HIST);
  private readonly ty = new Float32Array(HIST);
  private readonly tz = new Float32Array(HIST);
  private readonly stage = new Uint8Array(HIST);
  private readonly flags = new Uint8Array(HIST);
  private readonly rad = new Float32Array(HIST);
  private head = -1;
  private count = 0;
  /** Кадр, в котором последний раз был в снимке */
  seen = 0;
  /** Что на экране в этом кадре и где был в прошлом (для походки) */
  readonly r: ZPose = { ...scratch };
  lastX = NaN;
  lastZ = NaN;
  speed = 0;
  phase = Math.random() * 10;
  /** Вылезает из земли: время появления (−1 — уже давно тут) */
  born = -1;
  /** Счётчик ударов, который уже отыгран, и время начала замаха */
  lastAtk = -1;
  atkT = 9;
  flash = 0;
  dead = false;
  valid = false;

  constructor(id: number) {
    this.id = id;
  }

  push(tick: number, s: ZombieSnap): void {
    if (this.count > 0 && tick <= this.tick[this.head]) return;
    if (this.count > 0 && Math.hypot(s.x - this.x[this.head], s.z - this.z[this.head]) > TELEPORT) this.count = 0;
    this.kind = s.kind;
    this.head = (this.head + 1) % HIST;
    const h = this.head;
    this.tick[h] = tick;
    this.x[h] = s.x;
    this.y[h] = s.y;
    this.z[h] = s.z;
    this.yaw[h] = s.yaw;
    this.st[h] = s.state;
    this.hp[h] = s.hp;
    this.atk[h] = s.atk;
    this.wind[h] = s.wind ?? 0;
    this.tx[h] = s.tx ?? 0;
    this.ty[h] = s.ty ?? 0;
    this.tz[h] = s.tz ?? 0;
    this.stage[h] = s.stage ?? 0;
    this.flags[h] = s.flags ?? 0;
    this.rad[h] = s.r ?? 0;
    if (this.count < HIST) this.count++;
  }

  /** Положение на тике t (интерполяция; новее последнего — стоим на последнем) в out. */
  sample(t: number, out: ZPose): boolean {
    if (this.count === 0) return false;
    let a = this.head;
    let b = -1;
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head - i + HIST) % HIST;
      if (this.tick[idx] <= t) {
        a = idx;
        break;
      }
      b = idx;
      a = idx;
    }
    if (b < 0 || a === b) {
      out.x = this.x[a];
      out.y = this.y[a];
      out.z = this.z[a];
      out.yaw = this.yaw[a];
    } else {
      const f = Math.min(1, Math.max(0, (t - this.tick[a]) / (this.tick[b] - this.tick[a] || 1)));
      out.x = this.x[a] + (this.x[b] - this.x[a]) * f;
      out.y = this.y[a] + (this.y[b] - this.y[a]) * f;
      out.z = this.z[a] + (this.z[b] - this.z[a]) * f;
      out.yaw = lerpAngle(this.yaw[a], this.yaw[b], f);
    }
    out.st = this.st[a];
    out.hp = this.hp[a];
    out.atk = this.atk[a];
    out.wind = Math.max(0, this.wind[a] - Math.max(0, t - this.tick[a]));
    out.tx = this.tx[a];
    out.ty = this.ty[a];
    out.tz = this.tz[a];
    out.stage = this.stage[a];
    out.flags = this.flags[a];
    out.r = this.rad[a];
    return true;
  }
}

/** Приметы типа: вершинные цвета, в осях тела (макушка — BODY_H, лицом в −Z) */
function extrasGeometry(kind: number): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const col = (g: THREE.BufferGeometry, hex: number) => {
    const ng = g.index ? g.toNonIndexed() : g;
    const c = new THREE.Color(hex);
    const n = ng.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    ng.deleteAttribute('uv');
    return ng;
  };
  switch (kind) {
    case Z_WALKER:
      // повязка набекрень
      parts.push(col(new THREE.TorusGeometry(0.335, 0.05, 6, 20).rotateX(Math.PI / 2 + 0.25).translate(0, 1.33, 0.02), 0xf2ecd8));
      parts.push(col(new THREE.BoxGeometry(0.1, 0.16, 0.05).rotateZ(0.5).translate(0.2, 1.3, 0.33), 0xf2ecd8));
      break;
    case Z_RUNNER:
      // красная повязка с хвостиками
      parts.push(col(new THREE.TorusGeometry(0.39, 0.055, 6, 20).rotateX(Math.PI / 2).translate(0, 1.2, 0), 0xe0492f));
      parts.push(col(new THREE.BoxGeometry(0.05, 0.06, 0.32).rotateX(-0.6).translate(0.08, 1.12, 0.48), 0xe0492f));
      parts.push(col(new THREE.BoxGeometry(0.05, 0.06, 0.28).rotateX(-0.3).translate(-0.06, 1.14, 0.46), 0xe0492f));
      break;
    case Z_BRUTE:
      // ведро на голове и наплечники-доски
      parts.push(col(new THREE.CylinderGeometry(0.25, 0.32, 0.3, 14).translate(0, 1.52, 0.02), 0x8b939b));
      parts.push(col(new THREE.TorusGeometry(0.255, 0.02, 4, 14).rotateX(Math.PI / 2).translate(0, 1.66, 0.02), 0x5f666d));
      for (const s of [-1, 1]) parts.push(col(new THREE.BoxGeometry(0.34, 0.07, 0.42).rotateZ(-s * 0.35).translate(s * 0.42, 1.06, 0), 0x7a5232));
      break;
    case Z_CLIMBER:
      // гребень по спине
      for (let i = 0; i < 4; i++) parts.push(col(new THREE.ConeGeometry(0.07, 0.2, 5).rotateX(0.5).translate(0, 1.38 - i * 0.24, 0.36 + i * 0.06), 0xf2c230));
      break;
    case Z_BLOATER:
      // пузыри по бокам
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.4;
        const y = 0.45 + (i % 3) * 0.22;
        parts.push(col(new THREE.SphereGeometry(0.07 + (i % 2) * 0.03, 8, 6).translate(Math.cos(a) * 0.5, y, Math.sin(a) * 0.5), 0xffd04a));
      }
      break;
    case Z_FLYER:
      // Ушки и клыки; сами крылья анимируются отдельно.
      for (const side of [-1, 1]) {
        parts.push(col(new THREE.ConeGeometry(0.13, 0.42, 5).rotateZ(-side * 0.28).translate(side * 0.23, 1.52, 0), 0x6b327f));
        parts.push(col(new THREE.ConeGeometry(0.045, 0.16, 5).rotateZ(Math.PI).translate(side * 0.09, 0.88, -0.47), 0xffedd0));
      }
      break;
    case Z_SHIELD:
      // кожаный шлем с заклёпкой; сам щит — отдельно (пока цел)
      parts.push(col(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.05, 0.7, 1.05).translate(0, 1.3, 0), 0x6e4a2c));
      parts.push(col(new THREE.SphereGeometry(0.05, 6, 5).translate(0, 1.52, -0.12), 0xb8b0a0));
      break;
    case Z_SPITTER:
      // надутые щёки и банка варенья за спиной
      for (const s of [-1, 1]) parts.push(col(new THREE.SphereGeometry(0.15, 10, 8).translate(s * 0.27, 1.0, -0.3), 0xa6dd78));
      parts.push(col(new THREE.CylinderGeometry(0.17, 0.17, 0.34, 12).translate(0, 0.95, 0.42), 0xb02a48));
      parts.push(col(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 12).translate(0, 1.15, 0.42), 0xf2ecd8));
      break;
    case Z_SAPPER:
      // бочка с порохом в руках: обручи и фитиль
      parts.push(col(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 14).rotateZ(Math.PI / 2).translate(0, 0.68, -0.58), 0x8a5a34));
      for (const x of [-0.2, 0.2]) parts.push(col(new THREE.TorusGeometry(0.305, 0.025, 4, 16).rotateY(Math.PI / 2).translate(x, 0.68, -0.58), 0x4a4f55));
      parts.push(col(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 4).rotateZ(0.5).translate(0.07, 1.02, -0.58), 0x3a2a1a));
      parts.push(col(new THREE.SphereGeometry(0.07, 8, 6).translate(0.14, 1.13, -0.58), 0xffd04a));
      break;
    case Z_MEDIC:
      // белая шапочка с красным крестом и сумка через плечо
      parts.push(col(new THREE.CylinderGeometry(0.27, 0.3, 0.18, 14).translate(0, 1.45, 0), 0xf6f2e8));
      parts.push(col(new THREE.BoxGeometry(0.16, 0.05, 0.03).translate(0, 1.46, -0.29), 0xd8333a));
      parts.push(col(new THREE.BoxGeometry(0.05, 0.16, 0.03).translate(0, 1.46, -0.29), 0xd8333a));
      parts.push(col(new THREE.BoxGeometry(0.26, 0.22, 0.12).translate(0.38, 0.55, 0), 0xf6f2e8));
      parts.push(col(new THREE.BoxGeometry(0.1, 0.03, 0.02).translate(0.38, 0.56, -0.07), 0xd8333a));
      parts.push(col(new THREE.BoxGeometry(0.03, 0.1, 0.02).translate(0.38, 0.56, -0.07), 0xd8333a));
      break;
    case Z_ARMORED:
      // кастрюля на голове (с ручкой) и нагрудник
      parts.push(col(new THREE.CylinderGeometry(0.34, 0.31, 0.32, 16).translate(0, 1.48, 0), 0x596267));
      parts.push(col(new THREE.TorusGeometry(0.34, 0.025, 4, 16).rotateX(Math.PI / 2).translate(0, 1.64, 0), 0x8c969b));
      parts.push(col(new THREE.BoxGeometry(0.34, 0.05, 0.07).translate(0.48, 1.52, 0), 0x2f2a26));
      parts.push(col(new THREE.BoxGeometry(0.62, 0.5, 0.1).translate(0, 0.72, -0.4), 0x9aa3a8));
      for (const x of [-0.2, 0.2]) parts.push(col(new THREE.SphereGeometry(0.035, 6, 5).translate(x, 0.88, -0.46), 0x4a4f55));
      break;
    case Z_BOSS:
      // Тяжёлый панцирь, золотая корона и наплечники отличают Барона от обычного бугая.
      parts.push(col(new THREE.TorusGeometry(0.28, 0.045, 6, 18).rotateX(Math.PI / 2).translate(0, 1.53, 0), 0xc49b52));
      for (let i = 0; i < 7; i++) {
        const a = i * Math.PI * 2 / 7;
        parts.push(col(new THREE.ConeGeometry(0.055, 0.2, 4).translate(Math.sin(a) * 0.27, 1.66, Math.cos(a) * 0.27), 0xf3ca73));
      }
      for (const side of [-1, 1]) {
        parts.push(col(new THREE.BoxGeometry(0.38, 0.2, 0.52).rotateZ(-side * 0.22).translate(side * 0.43, 1.04, 0), 0x3a3047));
        parts.push(col(new THREE.ConeGeometry(0.075, 0.3, 5).rotateZ(-side * 0.5).translate(side * 0.48, 1.25, 0.05), 0xa8a2b1));
        parts.push(col(new THREE.BoxGeometry(0.2, 0.46, 0.12).rotateZ(side * 0.16).translate(side * 0.26, 0.71, -0.36), 0x493650));
        parts.push(col(new THREE.BoxGeometry(0.07, 0.42, 0.08).rotateZ(side * 0.16).translate(side * 0.23, 0.72, -0.44), 0xb58a44));
      }
      break;
    case Z_RAM:
      // кабан-таран: железный лоб с бревном-тараном, закрученные рога, клыки, пятак, доски на спине
      parts.push(col(new THREE.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.2).scale(1.15, 0.7, 1.1).translate(0, 1.3, -0.04), 0x5a5f66));
      parts.push(col(new THREE.CylinderGeometry(0.12, 0.14, 0.5, 10).rotateX(Math.PI / 2).translate(0, 1.36, -0.56), 0x8a5a34));
      parts.push(col(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 10).rotateX(Math.PI / 2).translate(0, 1.36, -0.82), 0x4a4f55));
      for (const z of [-0.42, -0.66]) parts.push(col(new THREE.TorusGeometry(0.135, 0.022, 4, 12).translate(0, 1.36, z), 0x4a4f55));
      for (const side of [-1, 1]) {
        parts.push(col(new THREE.TorusGeometry(0.15, 0.055, 6, 14, Math.PI * 1.45).rotateY(Math.PI / 2).rotateX(-0.4).translate(side * 0.36, 1.32, -0.02), 0xe8dcc0));
        parts.push(col(new THREE.ConeGeometry(0.045, 0.2, 6).rotateX(-0.25).translate(side * 0.15, 0.95, -0.47), 0xf6efe0));
        parts.push(col(new THREE.SphereGeometry(0.03, 6, 5).translate(side * 0.05, 1.0, -0.58), 0x3a2418));
      }
      parts.push(col(new THREE.SphereGeometry(0.12, 12, 8).scale(1.2, 0.8, 0.6).translate(0, 1.0, -0.5), 0xc08a62));
      parts.push(col(new THREE.BoxGeometry(0.64, 0.5, 0.08).rotateX(-0.2).translate(0, 0.9, 0.47), 0x8a5a34));
      for (const y of [0.76, 1.02]) parts.push(col(new THREE.BoxGeometry(0.68, 0.05, 0.1).rotateX(-0.2).translate(0, y, 0.49), 0x4a4f55));
      break;
    case Z_GOLEM: {
      // валун: каменные плиты на плечах и спине, мох, тяжёлые брови
      const stones = [[0.5, 1.04, 0.0, 0.22], [-0.5, 1.0, 0.04, 0.21], [0, 1.56, 0.08, 0.19], [0.24, 0.8, 0.52, 0.2],
        [-0.26, 0.6, 0.53, 0.18], [0.0, 1.16, 0.5, 0.2], [0.44, 0.44, 0.38, 0.16], [-0.46, 0.48, 0.36, 0.16],
        [0.3, 1.36, -0.22, 0.12], [-0.34, 0.2, -0.36, 0.13]] as const;
      const greys = [0x6f716a, 0x7d7f77, 0x5f615b];
      stones.forEach(([x, y, z, r], i) => parts.push(col(new THREE.DodecahedronGeometry(r, 0).rotateY(i).translate(x, y, z), greys[i % 3])));
      for (const [x, y, z] of [[0.12, 1.6, 0.02], [-0.4, 1.12, 0.02], [0.44, 1.14, -0.02], [0.02, 1.24, 0.47]] as const) {
        parts.push(col(new THREE.SphereGeometry(0.12, 8, 6).scale(1.1, 0.35, 1).translate(x, y, z), 0x6f9a4a));
      }
      parts.push(col(new THREE.BoxGeometry(0.5, 0.08, 0.12).rotateZ(0.06).translate(0, 1.29, -0.4), 0x55574f));
      break;
    }
  }
  return parts.length ? mergeGeometries(parts, false) : null;
}

/** Лицо: сонный глаз с веком, круглый глаз с маленьким зрачком, кривой рот с зубом */
function faceGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const col = (g: THREE.BufferGeometry, hex: number) => {
    const ng = g.index ? g.toNonIndexed() : g;
    const c = new THREE.Color(hex);
    const n = ng.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    ng.deleteAttribute('uv');
    return ng;
  };
  const ey = 1.17;
  const ez = -0.4;
  parts.push(col(new THREE.SphereGeometry(0.115, 12, 10).scale(1, 1.1, 0.55).translate(-0.14, ey, ez), 0xf6f2dc));
  parts.push(col(new THREE.SphereGeometry(0.09, 12, 10).scale(1, 1.0, 0.55).translate(0.14, ey - 0.02, ez), 0xf6f2dc));
  parts.push(col(new THREE.SphereGeometry(0.035, 8, 6).scale(1, 1, 0.5).translate(-0.12, ey + 0.01, ez - 0.06), 0x1a1a1a));
  parts.push(col(new THREE.SphereGeometry(0.03, 8, 6).scale(1, 1, 0.5).translate(0.16, ey - 0.04, ez - 0.05), 0x1a1a1a));
  // веко сонного глаза — сверху наполовину
  parts.push(col(new THREE.SphereGeometry(0.098, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.9, 0.6).rotateX(-0.25).translate(0.14, ey - 0.01, ez - 0.005), 0x3d4d3a));
  // рот: тёмная щель и один зуб
  parts.push(col(new THREE.BoxGeometry(0.24, 0.05, 0.05).rotateZ(-0.12).translate(0.01, 0.94, -0.43), 0x2a1416));
  parts.push(col(new THREE.BoxGeometry(0.05, 0.05, 0.03).translate(-0.05, 0.925, -0.455), 0xf6f2dc));
  return mergeGeometries(parts, false)!;
}

/** Дверь-щит щитоносца: три доски и две железные полосы, держит перед собой */
function shieldGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const col = (g: THREE.BufferGeometry, hex: number) => {
    const ng = g.index ? g.toNonIndexed() : g;
    const c = new THREE.Color(hex);
    const n = ng.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    ng.deleteAttribute('uv');
    return ng;
  };
  const browns = [0x9a6b42, 0x8a5a34, 0xa57548];
  for (let i = 0; i < 3; i++) parts.push(col(new THREE.BoxGeometry(0.3, 1.05 - (i % 2) * 0.06, 0.07).translate((i - 1) * 0.31, 0, 0), browns[i]));
  for (const y of [-0.3, 0.3]) parts.push(col(new THREE.BoxGeometry(0.98, 0.07, 0.09).translate(0, y, -0.01), 0x4a4f55));
  return mergeGeometries(parts, false)!;
}

/** Корона чемпиона: кольцо зубцов над головой */
function crownGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(0.24, 0.035, 5, 18).rotateX(Math.PI / 2)];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    parts.push(new THREE.ConeGeometry(0.05, 0.16, 4).translate(Math.sin(a) * 0.24, 0.08, Math.cos(a) * 0.24));
  }
  for (const p of parts) p.deleteAttribute('uv');
  return mergeGeometries(parts, false)!;
}

/** Рука-варежка: висит вниз от плеча (поворот вокруг X поднимает её вперёд) */
function armGeometry(): THREE.BufferGeometry {
  const arm = new THREE.CylinderGeometry(0.075, 0.085, 0.6, 8).translate(0, -0.3, 0);
  const mitt = new THREE.SphereGeometry(0.12, 10, 8).scale(1, 1.15, 0.9).translate(0, -0.66, 0);
  arm.deleteAttribute('uv');
  mitt.deleteAttribute('uv');
  return mergeGeometries([arm, mitt], false)!;
}

function inst(geo: THREE.BufferGeometry, mat: THREE.Material, colors: boolean): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, CAP);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (colors) {
    m.setColorAt(0, WHITE);
    m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  }
  m.count = 0;
  m.frustumCulled = false;
  return m;
}

export class Zombies3D {
  private readonly tracks = new Map<number, Track>();
  private readonly body: THREE.InstancedMesh;
  private readonly face: THREE.InstancedMesh;
  private readonly armL: THREE.InstancedMesh;
  private readonly armR: THREE.InstancedMesh;
  private readonly extras: Array<THREE.InstancedMesh | null> = [];
  private readonly shadow: THREE.InstancedMesh;
  private readonly barBg: THREE.InstancedMesh;
  private readonly barFill: THREE.InstancedMesh;
  private readonly wingL: THREE.InstancedMesh;
  private readonly wingR: THREE.InstancedMesh;
  private readonly core: THREE.InstancedMesh;
  private readonly shieldMesh: THREE.InstancedMesh;
  private readonly band: THREE.InstancedMesh;
  private readonly crown: THREE.InstancedMesh;
  private readonly warning: THREE.InstancedMesh;
  private readonly warningFill: THREE.InstancedMesh;
  /** Дорожка рывка Тарана (вся и заливка к удару) и камень в руках Валуна */
  private readonly lane: THREE.InstancedMesh;
  private readonly laneFill: THREE.InstancedMesh;
  private readonly held: THREE.InstancedMesh;
  /** Кракен: голова и щупальца — своя (временная) отрисовка */
  private readonly kraken: Kraken3D;
  private readonly bodyGeometries: readonly THREE.BufferGeometry[];
  private readonly ground?: GroundQuery;
  private detailDistance = Infinity;
  private wingHz = 60;
  private frame = 0;
  private time = 0;
  private readonly counts = new Array<number>(Z_KINDS).fill(0);
  /** Первые снимки после входа: кто уже стоит — не «вылезает» */
  private warm = 0;

  constructor(scene: THREE.Scene, ground?: GroundQuery) {
    this.ground = ground;
    const bodyGeo = new THREE.LatheGeometry(bodyProfile(), 22);
    bodyGeo.computeVertexNormals();
    this.bodyGeometries = [new THREE.LatheGeometry(bodyProfile(), 12), new THREE.LatheGeometry(bodyProfile(), 16), bodyGeo];
    this.body = inst(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0 }), true);
    this.face = inst(faceGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }), false);
    const armMat = new THREE.MeshStandardMaterial({ roughness: 0.45 });
    const ag = armGeometry();
    this.armL = inst(ag, armMat, true);
    this.armR = inst(ag, armMat, true);
    const extraMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1 });
    for (let k = 0; k < Z_KINDS; k++) {
      const g = extrasGeometry(k);
      this.extras.push(g ? inst(g, extraMat, false) : null);
    }
    this.shadow = inst(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: softDot('rgba(0,0,0,0.42)'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
      false,
    );
    this.shadow.renderOrder = 1;
    this.barBg = inst(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x1d1418, transparent: true, opacity: 0.7, depthWrite: false }), false);
    this.barFill = inst(new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }), true);
    this.barBg.renderOrder = 7;
    this.barFill.renderOrder = 8;
    const wing = new THREE.Shape();
    wing.moveTo(0, 0); wing.lineTo(0.48, 0.34); wing.lineTo(1.18, 0.12); wing.lineTo(0.99, -0.16);
    wing.lineTo(0.68, -0.08); wing.lineTo(0.48, -0.37); wing.lineTo(0.26, -0.19); wing.lineTo(0, -0.26); wing.closePath();
    const wingGeo = new THREE.ShapeGeometry(wing);
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x682d7c, roughness: 0.5, side: THREE.DoubleSide });
    this.wingL = inst(wingGeo.clone().scale(-1, 1, 1), wingMat, false);
    this.wingR = inst(wingGeo, wingMat, false);
    this.core = inst(new THREE.IcosahedronGeometry(0.15, 1), new THREE.MeshBasicMaterial(), true);
    this.shieldMesh = inst(shieldGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), false);
    const shiny = new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.55, emissive: 0x3a2400, emissiveIntensity: 0.5 });
    this.band = inst(new THREE.TorusGeometry(0.55, 0.065, 6, 28).rotateX(Math.PI / 2), shiny, true);
    this.crown = inst(crownGeometry(), shiny, true);
    this.warning = inst(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.86, depthWrite: false, depthTest: false, side: THREE.DoubleSide }), true);
    this.warningFill = inst(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.16, depthWrite: false, depthTest: false, side: THREE.DoubleSide }), true);
    this.warning.renderOrder = 5;
    this.warningFill.renderOrder = 4;
    const laneGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.lane = inst(laneGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false, depthTest: false, side: THREE.DoubleSide }), true);
    this.laneFill = inst(laneGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false, depthTest: false, side: THREE.DoubleSide }), true);
    this.lane.renderOrder = 4;
    this.laneFill.renderOrder = 5;
    this.held = inst(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x7d7f77, roughness: 0.9, flatShading: true }), false);
    this.held.count = 0;
    for (const m of [this.body, this.face, this.armL, this.armR]) m.castShadow = false;
    scene.add(this.body, this.face, this.armL, this.armR, this.shadow, this.barBg, this.barFill);
    for (const m of this.extras) if (m) scene.add(m);
    scene.add(this.wingL, this.wingR, this.core, this.shieldMesh, this.band, this.crown, this.warningFill, this.warning, this.lane, this.laneFill, this.held);
    this.kraken = new Kraken3D(scene);
  }

  setQuality(q: Quality, slow = false): void {
    const tier = q === 'auto' ? (slow ? 'low' : 'medium') : q;
    this.body.geometry = this.bodyGeometries[tier === 'low' ? 0 : tier === 'medium' ? 1 : 2];
    this.detailDistance = tier === 'low' ? 24 : tier === 'medium' ? 45 : Infinity;
    this.wingHz = tier === 'low' ? 20 : tier === 'medium' ? 30 : 60;
  }

  /** Снимок: зомби по списку; кого нет — пропали (сбиты или ушли в начало дороги — тогда вернутся). */
  push(tick: number, list: readonly ZombieSnap[], n: number): void {
    this.frame++;
    if (this.warm < 3) this.warm++;
    for (let i = 0; i < n; i++) {
      const s = list[i];
      let tr = this.tracks.get(s.id);
      if (!tr) {
        tr = new Track(s.id);
        // новый посреди игры — вылезает из земли (кроме тех, кто уже был, когда мы вошли)
        tr.born = this.warm >= 3 && s.kind !== Z_FLYER && !isBossKind(s.kind) ? this.time : -1;
        this.tracks.set(s.id, tr);
      }
      tr.push(tick, s);
      tr.seen = this.frame;
    }
    for (const [id, tr] of this.tracks) if (tr.seen !== this.frame) this.tracks.delete(id);
  }

  /** Сбит (событие zdie): прячем сразу, не дожидаясь, пока пропадёт из снимков */
  kill(id: number): void {
    const tr = this.tracks.get(id);
    if (tr) tr.dead = true;
  }

  hit(id: number): void {
    const tr = this.tracks.get(id);
    if (tr) tr.flash = 1;
  }

  /** Вид зомби по id (−1 — уже нет на экране) */
  kindOf(id: number): number {
    return this.tracks.get(id)?.kind ?? -1;
  }

  /** Где зомби на экране (ноги) — для звуков и эффектов */
  where(id: number, out: THREE.Vector3): boolean {
    const tr = this.tracks.get(id);
    if (!tr || !tr.valid) return false;
    out.set(tr.r.x, tr.r.y, tr.r.z);
    return true;
  }

  get count(): number {
    return this.tracks.size;
  }

  /** Для мини-карты: где зомби на экране и какого типа */
  dots(out: Array<{ x: number; z: number; kind: number }>): number {
    let n = 0;
    for (const tr of this.tracks.values()) {
      if (!tr.valid) continue;
      const d = out[n] ?? (out[n] = { x: 0, z: 0, kind: 0 });
      d.x = tr.r.x;
      d.z = tr.r.z;
      d.kind = tr.kind;
      n++;
    }
    return n;
  }

  /** Случайный зомби ближе r к точке (для стонов): тип или −1; где — в out */
  randomNear(x: number, z: number, r: number, out: THREE.Vector3): number {
    let pick = -1;
    let seen = 0;
    for (const tr of this.tracks.values()) {
      if (!tr.valid || Math.hypot(tr.r.x - x, tr.r.z - z) > r) continue;
      seen++;
      if (Math.random() * seen < 1) {
        pick = tr.kind;
        out.set(tr.r.x, tr.r.y + 1.2, tr.r.z);
      }
    }
    return pick;
  }

  clear(): void {
    this.tracks.clear();
    this.warm = 0;
    for (const m of [this.body, this.face, this.armL, this.armR, this.shadow, this.barBg, this.barFill]) m.count = 0;
    for (const m of this.extras) if (m) m.count = 0;
    for (const m of [this.wingL, this.wingR, this.core, this.shieldMesh, this.band, this.crown, this.warning, this.warningFill, this.lane, this.laneFill, this.held]) m.count = 0;
    this.kraken.clear();
  }

  /** Цели прицела — живые зомби на тике t (то же, к чему сервер откатит орду): x, y ног, z, тип. */
  targets(t: number, tg: Float64Array): number {
    let n = 0;
    for (const tr of this.tracks.values()) {
      if (tr.dead || n * FT_STRIDE + 3 >= tg.length) continue;
      if (!tr.sample(t, scratch)) continue;
      const o = n * FT_STRIDE;
      tg[o] = scratch.x;
      tg[o + 1] = scratch.y;
      tg[o + 2] = scratch.z;
      tg[o + 3] = tr.kind;
      n++;
    }
    return n;
  }

  /** Кадр: интерполяция на тике t, походка и позы, матрицы инстансов. */
  update(t: number, dt: number, time: number, cam: THREE.Camera): void {
    this.time = time;
    const camPos = cam.position;
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    let n = 0;
    let bars = 0;
    let faces = 0;
    let flyers = 0;
    let bosses = 0;
    let warnings = 0;
    let shields = 0;
    let bands = 0;
    let crowns = 0;
    let lanes = 0;
    let helds = 0;
    const counts = this.counts;
    counts.fill(0);
    for (const tr of this.tracks.values()) {
      const r = tr.r;
      tr.valid = !tr.dead && tr.sample(t, r);
      if (!tr.valid || n >= CAP) continue;
      // скорость по пройденному на экране (для походки)
      const moved = Number.isNaN(tr.lastX) ? 0 : Math.hypot(r.x - tr.lastX, r.z - tr.lastZ);
      tr.lastX = r.x;
      tr.lastZ = r.z;
      const v = dt > 0 && moved < 1.5 ? moved / dt : 0;
      tr.speed += (v - tr.speed) * Math.min(1, dt * 8);
      const kind = tr.kind;
      const k = ZK[kind] ?? ZK[0];
      const sc = SCALES[kind] ?? SCALES[0];
      tr.phase += dt * (tr.speed * (kind === Z_RUNNER ? 4.2 : kind === Z_BRUTE ? 1.9 : 3.1) + 0.6);
      tr.flash = Math.max(0, tr.flash - dt * 7);
      if (r.atk !== tr.lastAtk) {
        if (tr.lastAtk >= 0) tr.atkT = 0;
        tr.lastAtk = r.atk;
      }
      tr.atkT += dt;

      // поза: наклон, крен, подпрыгивание, руки
      const ph = tr.phase;
      const walk = Math.min(1, tr.speed / 1.5);
      let lean = 0.06 + walk * (kind === Z_RUNNER ? 0.32 : 0.1);
      let roll = Math.sin(ph) * (kind === Z_BRUTE ? 0.06 : 0.1) * walk;
      let bob = Math.abs(Math.sin(ph)) * 0.06 * walk;
      let armL = 1.45 + Math.sin(ph) * 0.2 * walk;
      let armR = 1.45 - Math.sin(ph) * 0.2 * walk;
      const st = r.st;
      if (st === ZS_ATTACK || tr.atkT < 0.45) {
        // замах: руки вверх, удар вниз, назад
        const a = tr.atkT;
        let arm = 1.45;
        if (a < 0.16) arm = 1.45 + (a / 0.16) * 1.15;
        else if (a < 0.26) arm = 2.6 - ((a - 0.16) / 0.1) * 1.8;
        else if (a < 0.45) arm = 0.8 + ((a - 0.26) / 0.19) * 0.65;
        armL = arm;
        armR = arm + 0.1;
        lean = 0.1 + (a > 0.16 && a < 0.35 ? 0.3 : 0);
        roll *= 0.3;
      }
      if (st === ZS_CLIMB) {
        armL = 2.75 + Math.sin(time * 9 + tr.id) * 0.35;
        armR = 2.75 - Math.sin(time * 9 + tr.id) * 0.35;
        lean = 0.18;
        roll = Math.sin(time * 9 + tr.id) * 0.08;
        bob = Math.abs(Math.sin(time * 9 + tr.id)) * 0.05;
      } else if (st === ZS_TOP) {
        armL = 2.5 + Math.sin(time * 7 + tr.id) * 0.3;
        armR = 2.5 + Math.cos(time * 7 + tr.id) * 0.3;
        lean = -0.1;
        roll = Math.sin(time * 3 + tr.id) * 0.06;
      } else if (st === ZS_DROP) {
        armL = 2.9;
        armR = 2.9;
        lean = 0.2;
      }
      if (kind === Z_FLYER) {
        bob = Math.sin(time * 5 + tr.id) * 0.07;
        lean = st === ZS_FLY_DIVE ? 0.6 : 0.08;
        armL = armR = 0.7;
      } else if (kind === Z_BOSS) {
        const winding = st === ZS_BOSS_GATE || st === ZS_BOSS_BOMB || st === ZS_BOSS_PULSE;
        const ready = 1 - Math.min(1, r.wind / BOSS_WARN_TICKS);
        armL = armR = winding ? 1.45 + ready * 1.45 : st === ZS_BOSS_OPEN ? 0.45 : 1.3;
        lean = st === ZS_BOSS_OPEN ? 0.18 : winding ? -ready * 0.09 : 0.04;
        bob *= 0.4;
      } else if (kind === Z_RAM) {
        const ready = 1 - Math.min(1, r.wind / BOSS_WARN_TICKS);
        if (st === ZS_CHARGE_WARN) {
          // роет землю: откидывается, подпрыгивает всё чаще
          lean = -0.1 - ready * 0.12;
          bob = Math.abs(Math.sin(time * (8 + ready * 10) + tr.id)) * 0.05 * (0.4 + ready);
          roll = Math.sin(time * 12 + tr.id) * 0.04 * ready;
          armL = armR = 0.9;
        } else if (st === ZS_CHARGE) {
          lean = 0.42;
          bob = Math.abs(Math.sin(time * 18 + tr.id)) * 0.06;
          armL = armR = 0.35;
        } else if (st === ZS_STOMP) {
          // встаёт на дыбы и с размаху вниз
          lean = -0.22 * ready;
          bob = ready * 0.12;
          armL = armR = 1.4 + ready * 1.5;
        } else if (st === ZS_HOWL) {
          lean = -0.38;
          roll = Math.sin(time * 26) * 0.03;
          armL = armR = 2.5;
        } else if (st === ZS_BOSS_OPEN) {
          // оглушён после удара
          lean = 0.28;
          roll = Math.sin(time * 3 + tr.id) * 0.08;
          armL = armR = 0.55;
        } else {
          lean = 0.08;
          armL = armR = 1.15;
        }
        bob *= 0.5;
      } else if (kind === Z_GOLEM) {
        const ready = 1 - Math.min(1, r.wind / BOSS_WARN_TICKS);
        if (st === ZS_THROW) {
          const lifting = r.wind > ROCK_FLIGHT_TICKS;
          armL = armR = lifting ? 2.95 : 0.85;
          lean = lifting ? -0.12 : 0.22;
        } else if (st === ZS_QUAKE) {
          armL = armR = 1.6 + ready * 1.35;
          lean = -0.1 * ready;
          bob = ready * 0.1;
        } else if (st === ZS_BOSS_OPEN) {
          lean = 0.2;
          armL = armR = 0.6;
        } else {
          armL = armR = 1.35;
          lean = 0.04;
        }
        bob *= 0.4;
      }
      // вылезает из земли
      let rise = 0;
      if (tr.born >= 0) {
        const e = (time - tr.born) / RISE_S;
        if (e >= 1) tr.born = -1;
        else rise = (1 - e) * (1 - e);
      }
      const sq = tr.flash;
      const tier = r.flags & ZF_TIER;
      const big = tier === 2 ? 1.12 : 1;
      const bloat = kind === Z_BLOATER ? Math.sin(time * 5 + tr.id) * 0.04 : 0;
      const sy = sc.sy * (1 - sq * 0.12 + bloat * 0.5) * big;
      const sxz = sc.sxz * (1 + sq * 0.08 + bloat) * (kind === Z_BLOATER ? 1.1 : 1) * big;
      if (kind === Z_SPITTER && st === ZS_SPIT) {
        // набирает воздух: откидывается назад, щёки раздуваются
        const u = 1 - Math.min(1, r.wind / 72);
        lean = -0.25 * u;
        armL = armR = 0.6;
      } else if (kind === Z_SAPPER) {
        armL = armR = st === ZS_PLANT ? 0.4 : 1.15;
        if (st === ZS_PLANT) lean = 0.45;
      } else if (kind === Z_SHIELD && (r.flags & ZF_SHIELD)) {
        armL = armR = 1.35;
        lean *= 0.6;
      }
      // наклон вперёд — к лицу (−Z): поворот вокруг X со знаком минус
      _e.set(-lean - rise * 0.5, r.yaw, roll);
      _q.setFromEuler(_e);
      _p.set(r.x, r.y + bob - rise * BODY_H * sy * 0.9, r.z);
      _s.set(sxz, sy, sxz);
      _m.compose(_p, _q, _s);
      // Кракен рисуется своим (голова и руки-щупальца), желейное тело и тень — пустые
      const kraken = kind === Z_KRAKEN || kind === Z_TENTACLE;
      if (kraken) {
        this.kraken.part(kind, r, sq, time);
        _m.makeScale(0, 0, 0);
      }
      this.body.setMatrixAt(n, _m);
      const boss = isBossKind(kind);
      if (boss || Math.hypot(r.x - camPos.x, r.z - camPos.z) < this.detailDistance) this.face.setMatrixAt(faces++, _m);
      _c.set(k.color).lerp(WHITE, sq * 0.75);
      if (boss && st === ZS_BOSS_OPEN) _c.lerp(_c2.set(0x6ce5e3), 0.4);
      else if (boss && (r.flags & ZF_RAGE)) _c.lerp(_c2.set(0xff4a3a), 0.22 + 0.14 * Math.sin(time * 9 + tr.id));
      if (kind === Z_MEDIC && (r.flags & ZF_LIT)) _c.lerp(_c2.set(0x9cff9a), 0.45 + 0.25 * Math.sin(time * 18));
      if (r.flags & ZF_CREW) _c.lerp(_c2.set(0x5b9bd5), 0.25);
      this.body.setColorAt(n, _c);
      _c2.set(k.color).multiplyScalar(0.82).lerp(WHITE, sq * 0.6);
      _arm.makeRotationX(armL).setPosition(-SHOULDER_X, SHOULDER_Y, -0.04);
      this.armL.setMatrixAt(n, _m2.multiplyMatrices(_m, _arm));
      this.armL.setColorAt(n, _c2);
      _arm.makeRotationX(armR).setPosition(SHOULDER_X, SHOULDER_Y, -0.04);
      this.armR.setMatrixAt(n, _m2.multiplyMatrices(_m, _arm));
      this.armR.setColorAt(n, _c2);
      const ex = this.extras[kind];
      if (ex) ex.setMatrixAt(counts[kind]++, _m);
      if (kind === Z_SHIELD && (r.flags & ZF_SHIELD)) {
        _arm.makeTranslation(0, 0.8, -0.62);
        this.shieldMesh.setMatrixAt(shields++, _m2.multiplyMatrices(_m, _arm));
      }
      if (tier > 0) {
        _arm.makeTranslation(0, 0.58, 0);
        this.band.setMatrixAt(bands, _m2.multiplyMatrices(_m, _arm));
        this.band.setColorAt(bands++, _c2.set(TIER_COLORS[tier]));
        if (tier === 2) {
          _arm.makeRotationY(time * 1.5).setPosition(0, BODY_H + 0.04, 0);
          this.crown.setMatrixAt(crowns, _m2.multiplyMatrices(_m, _arm));
          this.crown.setColorAt(crowns++, _c2.set(0xffc83a));
        }
      }
      if (kind === Z_FLYER) {
        const flutter = Math.sin(Math.floor(time * this.wingHz) / this.wingHz * 15 + tr.id) * 0.55;
        _arm.makeRotationZ(-flutter).setPosition(-0.36, 0.91, 0.04);
        this.wingL.setMatrixAt(flyers, _m2.multiplyMatrices(_m, _arm));
        _arm.makeRotationZ(flutter).setPosition(0.36, 0.91, 0.04);
        this.wingR.setMatrixAt(flyers++, _m2.multiplyMatrices(_m, _arm));
      } else if (boss) {
        _arm.makeRotationY(time * 1.4).setPosition(0, 0.73, -0.49);
        this.core.setMatrixAt(bosses, _m2.multiplyMatrices(_m, _arm));
        this.core.setColorAt(bosses++, _c.set(st === ZS_BOSS_OPEN ? 0x7ffff4 : (r.flags & ZF_RAGE) ? 0xff8055 : 0xbd72dc));
        if (kind === Z_GOLEM && st === ZS_THROW && r.wind > ROCK_FLIGHT_TICKS && helds < 4) {
          // камень над головой, пока поднимает
          const top = r.y + (k.hcy + k.hry) * (1 - rise) + 1.3;
          _p.set(r.x, top, r.z);
          _q.setFromEuler(_e.set(time * 0.7, time, 0));
          _s.set(1.6, 1.4, 1.6);
          this.held.setMatrixAt(helds++, _m2.compose(_p, _q, _s));
        }
      }
      const signal = attackSignal(st, r.wind, r.r);
      if (signal && (st === ZS_CHARGE_WARN || st === ZS_CHARGE)) {
        // дорожка рывка: от Тарана до цели, заливка растёт к удару (видна сквозь стены)
        const dx = r.tx - r.x;
        const dz = r.tz - r.z;
        const len = Math.hypot(dx, dz);
        if (len > 0.5 && lanes < 4) {
          _q.setFromAxisAngle(_up, Math.atan2(dx, dz));
          const w = signal.radius * 2;
          _p.set((r.x + r.tx) / 2, 0.07, (r.z + r.tz) / 2);
          _s.set(w, 1, len);
          this.lane.setMatrixAt(lanes, _m.compose(_p, _q, _s));
          const f = st === ZS_CHARGE ? 1 : Math.max(0.04, signal.progress);
          _p.set(r.x + dx * f * 0.5, 0.08, r.z + dz * f * 0.5);
          _s.set(w, 1, len * f);
          this.laneFill.setMatrixAt(lanes, _m.compose(_p, _q, _s));
          _c.set(signal.color);
          this.lane.setColorAt(lanes, _c);
          this.laneFill.setColorAt(lanes++, _c);
        }
      } else if (signal) {
        // Метка поверх поверхности остаётся читаемой и на низком качестве, в том числе на стене.
        const groundY = this.ground?.groundBelow(r.tx, r.ty, r.tz);
        const markY = Number.isFinite(groundY) ? groundY! : Math.max(0, r.ty - 0.8);
        _p.set(r.tx, markY + 0.06, r.tz);
        _q.identity();
        _s.set(signal.radius, 1, signal.radius);
        this.warning.setMatrixAt(warnings, _m.compose(_p, _q, _s));
        _s.set(signal.radius * Math.max(0.06, signal.progress), 1, signal.radius * Math.max(0.06, signal.progress));
        this.warningFill.setMatrixAt(warnings, _m.compose(_p, _q, _s));
        _c.set(signal.color);
        this.warning.setColorAt(warnings, _c);
        this.warningFill.setColorAt(warnings++, _c.set(signal.fill));
      }
      // тень на земле (на стене — на её верху: высота ног)
      const shR = k.r * 2.6 * (1 - rise * 0.6);
      _q.identity();
      const floor = kraken ? NaN : kind === Z_FLYER ? this.ground?.groundBelow(r.x, r.y, r.z) ?? 0 : r.y;
      _p.set(r.x, Number.isFinite(floor) ? floor + 0.03 : -1000, r.z);
      _s.set(shR, 1, shR);
      this.shadow.setMatrixAt(n, _m.compose(_p, _q, _s));
      // полоска здоровья над раненым
      if (r.hp < 0.999 && r.hp > 0) {
        const d = camPos.distanceTo(_p.set(r.x, r.y, r.z));
        if (d < BAR_DIST) {
          const top = r.y + (k.hcy + k.hry) + 0.32;
          const w = 0.5 + k.hrx * 0.7;
          _p.set(r.x, top, r.z);
          _s.set(w + 0.06, 0.13, 1);
          this.barBg.setMatrixAt(bars, _m.compose(_p, cam.quaternion, _s));
          _p.addScaledVector(_right, -w / 2);
          _s.set(w * r.hp, 0.08, 1);
          this.barFill.setMatrixAt(bars, _m.compose(_p, cam.quaternion, _s));
          _c.setRGB(1, 0.3, 0.25).lerp(_c2.setRGB(0.45, 0.95, 0.35), r.hp);
          this.barFill.setColorAt(bars, _c);
          bars++;
        }
      }
      n++;
    }
    for (const m of [this.body, this.armL, this.armR, this.shadow]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.face.count = faces;
    this.face.instanceMatrix.needsUpdate = true;
    this.wingL.count = this.wingR.count = flyers;
    this.core.count = bosses;
    this.shieldMesh.count = shields;
    this.band.count = bands;
    this.crown.count = crowns;
    this.warning.count = this.warningFill.count = warnings;
    this.lane.count = this.laneFill.count = lanes;
    this.held.count = helds;
    for (const m of [this.wingL, this.wingR, this.core, this.shieldMesh, this.band, this.crown, this.warning, this.warningFill, this.lane, this.laneFill, this.held]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    for (let kd = 0; kd < Z_KINDS; kd++) {
      const ex = this.extras[kd];
      if (!ex) continue;
      ex.count = counts[kd];
      ex.instanceMatrix.needsUpdate = true;
    }
    this.barBg.count = bars;
    this.barFill.count = bars;
    this.barBg.instanceMatrix.needsUpdate = true;
    this.barFill.instanceMatrix.needsUpdate = true;
    if (this.barFill.instanceColor) this.barFill.instanceColor.needsUpdate = true;
    this.kraken.flush();
  }
}
