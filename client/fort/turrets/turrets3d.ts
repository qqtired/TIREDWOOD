// Башни на стенах крепости (агент fort-turrets): игрушечные модели четырёх типов по ступеням облика (models.ts), инстансы
// на все места, анимации и свои частицы (fx.ts). Что стоит на месте — из хвоста снимка (set), выстрелы — по событиям
// сервера (fire). Поворот к цели — пружина с инерцией: баллиста ведёт зомби по номеру из события, жаровня — последнего
// подожжённого, пушка и котёл — точку выстрела; без цели башня спокойно осматривается. Постройка — вырастает из стены
// с пылью; улучшение — вспышка и подскок, облик меняется в верхней точке; звёзды на щитке — уровень внутри ступени.
// Кадр без new: матрицы и векторы — модульные заготовки.
import * as THREE from 'three';
import { TOWER_MAX_LEVEL, TW_BALLISTA, TW_CANNON, TW_TAR } from '../../../shared/fortarsenal.ts';
import { TOWER_SPOTS, type TowerSpot } from '../../../shared/fortmap.ts';
import { softDot } from '../../render/textures.ts';
import type { Quality } from '../../settings.ts';
import { ringTexture } from '../textures.ts';
import { CELL_FLASH, CELL_SOFT, CELL_SPARK, TurretFx } from './fx.ts';
import { BatchPool, C, Part, PartPool, dayEnvTexture, turretMaterial } from './kit.ts';
import {
  PENNANT_COLORS, STAGES, STAR_COLORS, ballGeometry, boltGeometry, bubbleGeometry, buildModel, crankGeometry, pennantGeometry, stageOf,
  starGeometry, starsOf, streamGeometry, stringGeometry, type TurretModel,
} from './models.ts';

/** Башни чуть крупнее «натуры»: со двора и с террасы их видно над зубцами */
export const TURRET_SCALE = 1.2;
/** Ветер: вымпелы смотрят туда же, куда флаги замка */
const WIND_YAW = 0.9;
const BUILD_S = 1.35;
/** Постройка: сколько секунд башня поднимается из стены */
const RISE_S = 0.62;
const UP_S = 0.95;
const GONE_S = 0.5;
const STREAM_SEGS = 9;
const BUBBLES = 3;
/** Дальше этого от камеры — без дымков, искр и пара в простое */
const FAR2 = 45 * 45;
const CONFETTI = [C.red, C.yellow, C.blue, C.green, C.pink, C.cream] as const;
/** Вымпел: I — треугольный, II–IV — «ласточкин хвост» (одна геометрия), длиннее и шире со ступенью */
const PENNANT_SCALE = [[1, 1], [1, 1], [0.74 / 0.64, 0.35 / 0.32], [0.78 / 0.64, 0.37 / 0.32]] as const;
/** Деталей в пачке на одно место (с запасом: котёл со струёй и пузырями — около двадцати) */
const PARTS_PER_SPOT = 26;

const _mR = new THREE.Matrix4();
const _mT = new THREE.Matrix4();
const _mG = new THREE.Matrix4();
const _mA = new THREE.Matrix4();
const _mB = new THREE.Matrix4();
const _mC = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _col = new THREE.Color();
const _col2 = new THREE.Color();
const _frustum = new THREE.Frustum();
const _sphere = new THREE.Sphere();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export type Where = (zid: number, out: THREE.Vector3) => boolean;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (u: number): number => 1 - (1 - u) * (1 - u);
const easeInOut = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));
function easeOutBack(u: number): number {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
}
function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function rnd(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** Состояние одного места на стене */
interface SpotVis {
  readonly def: TowerSpot;
  readonly root: THREE.Matrix4;
  readonly rootYaw: number;
  readonly seed: number;
  type: number;
  level: number;
  /** Что показано сейчас (тип −1 — пусто; ступень меняется в верхней точке подскока улучшения) */
  shownType: number;
  shownStage: number;
  shownLevel: number;
  /** Время с начала постройки / улучшения / сноса (−1 — нет) */
  build: number;
  up: number;
  gone: number;
  far: boolean;
  /** Видна ли камере (вне кадра — без матриц и частиц простоя: меньше вызовов отрисовки) */
  seen: boolean;
  // прицел: поворот и наклон — пружины
  yaw: number;
  yawV: number;
  pitch: number;
  pitchV: number;
  wantYaw: number;
  wantPitch: number;
  aimAt: number;
  tx: number;
  ty: number;
  tz: number;
  zid: number;
  hurry: number;
  // выстрел
  shotAt: number;
  shots: number;
  recoil: number;
  recoilV: number;
  kick: number;
  kickV: number;
  wheel: number;
  // баллиста: на каждый лук — время с выстрела, изгиб плеч и его скорость
  readonly bowT: Float32Array;
  readonly flex: Float32Array;
  readonly flexV: Float32Array;
  crank: number;
  // пушка: какой ствол бил
  barrel: number;
  // смола
  pour: number;
  tarLevel: number;
  tpx: number;
  tpz: number;
  readonly bub: Float32Array;
  // жаровня
  flare: number;
  // таймеры частиц простоя
  emberAt: number;
  steamAt: number;
  wispAt: number;
  dustAt: number;
}

export class Turrets3D {
  readonly spots: SpotVis[] = [];
  private readonly scene: THREE.Scene;
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly env: THREE.Texture | null;
  private readonly pool: BatchPool;
  private readonly clothPool: PartPool;
  private readonly cloth: THREE.MeshStandardMaterial;
  private readonly fx: TurretFx;
  private readonly models: Array<TurretModel | undefined> = [];
  private readonly cap: number;
  // общие детали
  private readonly bolt: Part;
  private readonly string: Part;
  private readonly crankPart: Part;
  private readonly ball: Part;
  private readonly bubble: Part;
  private readonly stream: Part;
  private readonly star: Part;
  private readonly pennants: Part[] = [];
  private readonly shadow: THREE.InstancedMesh;
  private readonly ring: THREE.InstancedMesh;
  private readonly uTime = { value: 0 };
  private time = 0;
  private where: Where | null = null;
  /** Камера сцены: башни вне кадра не рисуем (null — рисуем все) */
  camera: THREE.Camera | null;
  /** После reset: первое setAll() — то, что уже стоит (вошли посреди игры), без анимаций постройки */
  private silent = true;
  /** 0 — низкое качество (без пузырей, пара и дымков), 1 — среднее, 2 — высокое */
  private detail = 2;

  constructor(scene: THREE.Scene, quality: Quality = 'high', spots: readonly TowerSpot[] = TOWER_SPOTS, camera: THREE.Camera | null = null) {
    this.scene = scene;
    this.camera = camera;
    this.cap = spots.length;
    this.env = dayEnvTexture();
    this.mat = turretMaterial(this.env);
    this.pool = new BatchPool(scene, this.mat, this.cap * PARTS_PER_SPOT);
    this.cloth = this.clothMaterial();
    this.clothPool = new PartPool(scene, this.cloth);
    this.fx = new TurretFx(scene, this.mat);
    const cap = this.cap;
    this.bolt = new Part(boltGeometry(), cap * 2);
    this.string = new Part(stringGeometry(), cap * 4);
    this.crankPart = new Part(crankGeometry(), cap);
    this.ball = new Part(ballGeometry(), cap * 2);
    this.bubble = new Part(bubbleGeometry(), cap * BUBBLES);
    this.stream = new Part(streamGeometry(), cap * STREAM_SEGS);
    this.star = new Part(starGeometry(), cap * 3);
    this.pennants.push(new Part(pennantGeometry(0), cap), new Part(pennantGeometry(1), cap));
    // пятно-тень и пунктирный круг пустого места
    const hasDoc = typeof document !== 'undefined';
    this.shadow = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: hasDoc ? softDot('rgba(40,28,16,0.5)') : null, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
      cap,
    );
    this.shadow.renderOrder = 1;
    this.ring = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: hasDoc ? ringTexture() : null, transparent: true, depthWrite: false, color: 0xfff1c8 }),
      cap,
    );
    for (const m of [this.shadow, this.ring]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    spots.forEach((def, i) => {
      const rootYaw = Math.atan2(-def.nx, -def.nz);
      const root = new THREE.Matrix4().compose(
        new THREE.Vector3(def.x, def.y, def.z),
        new THREE.Quaternion().setFromAxisAngle(Y_AXIS, rootYaw),
        new THREE.Vector3(TURRET_SCALE, TURRET_SCALE, TURRET_SCALE),
      );
      this.spots.push({
        def, root, rootYaw, seed: i * 1.7 + 0.3, type: -1, level: 0, shownType: -1, shownStage: 0, shownLevel: 0, build: -1, up: -1, gone: -1, far: false, seen: true,
        yaw: 0, yawV: 0, pitch: 0, pitchV: 0, wantYaw: 0, wantPitch: 0, aimAt: -99, tx: 0, ty: 0, tz: 0, zid: -1, hurry: 0,
        shotAt: -99, shots: 0, recoil: 0, recoilV: 0, kick: 0, kickV: 0, wheel: 0,
        bowT: new Float32Array([99, 99]), flex: new Float32Array([-0.2, -0.2]), flexV: new Float32Array(2), crank: 0,
        barrel: 0, pour: -1, tarLevel: 1, tpx: 0, tpz: 0, bub: new Float32Array([0.1, 0.45, 0.8]),
        flare: 0, emberAt: 0, steamAt: 0, wispAt: 0, dustAt: 0,
      });
    });
    this.setQuality(quality);
  }

  /** Ткань вымпелов: волна бежит от древка к хвосту (вершинный шейдер), цвет — из инстанса */
  private clothMaterial(): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.82, metalness: 0 });
    const uTime = this.uTime;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
float wPh = instanceMatrix[ 3 ].x * 0.37 + instanceMatrix[ 3 ].z * 0.61;
float wX = position.x;
float wA = uTime * 7.0 - wX * 7.5 + wPh;
float wB = uTime * 11.0 - wX * 13.0 + wPh * 1.7;
float wD = 0.075 * sin( wA ) - 0.5625 * wX * cos( wA ) + 0.025 * sin( wB ) - 0.325 * wX * cos( wB );
objectNormal = normalize( vec3( -wD, 0.0, 1.0 ) );`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed.z += sin( wA ) * 0.075 * wX + sin( wB ) * 0.025 * wX;
transformed.y += sin( uTime * 5.0 - wX * 6.0 + wPh ) * 0.02 * wX - 0.04 * wX * wX;`);
    };
    m.customProgramCacheKey = () => 'fort-turret-cloth';
    return m;
  }

  setQuality(q: Quality, slow = false): void {
    const tier = q === 'auto' ? (slow ? 'low' : 'high') : q;
    this.detail = tier === 'low' ? 0 : tier === 'medium' ? 1 : 2;
    this.fx.scale = tier === 'low' ? 0.45 : tier === 'medium' ? 0.75 : 1;
  }

  private model(type: number, stage: number): TurretModel {
    const k = type * STAGES + stage;
    let m = this.models[k];
    if (!m) {
      m = buildModel(type, stage, this.cap);
      this.models[k] = m;
    }
    return m;
  }

  // ------------------------------------------------------------ что стоит на местах

  /** Тип (−1 — пусто) и уровень на месте i: сам видит постройку, улучшение и снос */
  set(i: number, type: number, level: number): void {
    const s = this.spots[i];
    if (!s) return;
    const lv = Math.max(1, Math.min(TOWER_MAX_LEVEL, level || 1));
    s.type = type;
    s.level = type < 0 ? 0 : lv;
    if (type < 0) {
      if (s.shownType >= 0 && s.gone < 0) {
        if (this.silent) s.shownType = -1;
        else {
          s.gone = 0;
          s.build = s.up = -1;
          this.dust(s, 8, 0.9);
        }
      }
      return;
    }
    if (s.shownType !== type || s.gone >= 0) {
      s.gone = -1;
      s.shownType = type;
      s.shownStage = stageOf(lv);
      s.shownLevel = lv;
      s.up = -1;
      s.pour = -1;
      s.tarLevel = 1;
      s.bowT.fill(99);
      s.shots = 0;
      if (!this.silent) this.build(i);
      return;
    }
    if (lv > s.shownLevel) {
      s.shownLevel = lv;
      if (this.silent) s.shownStage = stageOf(lv);
      else this.upgrade(i);
    } else if (lv < s.shownLevel) {
      s.shownLevel = lv;
      s.shownStage = stageOf(lv);
    }
  }

  /** Все места разом (хвост снимка): первое после reset — без анимаций */
  setAll(types: readonly number[], levels: readonly number[]): void {
    for (let i = 0; i < this.spots.length; i++) this.set(i, types[i] ?? -1, levels[i] ?? 0);
    this.silent = false;
  }

  /** Постройка: вырастает из стены с пылью и каменной крошкой */
  build(i: number): void {
    const s = this.spots[i];
    if (!s || s.shownType < 0) return;
    s.build = 0;
    s.up = -1;
    s.yaw = s.wantYaw = 0;
    s.yawV = 0;
    s.dustAt = this.time + 0.06;
    this.dust(s, 14, 1.25);
    const n = Math.ceil(10 * this.fx.scale);
    for (let k = 0; k < n; k++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(1.5, 3.2);
      this.fx.chip(s.def.x + Math.cos(a) * 0.5, s.def.y + 0.1, s.def.z + Math.sin(a) * 0.5, Math.cos(a) * sp, rnd(3, 5.5), Math.sin(a) * sp, rnd(0.05, 0.09), rnd(0.9, 1.4), k % 3 ? C.stoneDark : C.wood, s.def.y);
    }
  }

  /** Улучшение: вспышка, подскок, облик меняется в верхней точке */
  upgrade(i: number): void {
    const s = this.spots[i];
    if (!s || s.shownType < 0) return;
    if (s.build >= 0) {
      s.shownStage = stageOf(s.shownLevel);
      return;
    }
    s.up = 0;
    const { x, y, z } = s.def;
    this.fx.spark(x, y + 1.0, z, 0, 0.4, 0, 1.6, 0.35, 0xfff0c0, 1.4, CELL_SOFT, 0, 0, 4);
    const n = Math.ceil(16 * this.fx.scale);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      this.fx.spark(x + Math.cos(a) * 0.6, y + 0.2, z + Math.sin(a) * 0.6, Math.cos(a) * 0.6, rnd(1.6, 2.6), Math.sin(a) * 0.6, rnd(0.12, 0.2), rnd(0.7, 1.1), k % 2 ? 0xffd35a : 0xfff4c0, 1.2, CELL_SPARK, -0.6, 0.8);
    }
  }

  // ------------------------------------------------------------ выстрелы

  /**
   * Выстрел башни на месте i в точку (x, y, z); NaN — точки нет (жаровня), тогда цель — зомби zid (−1 — прямо).
   * zid ещё и «кого вести дальше». Возвращает в out мировую точку, откуда летит снаряд: дуло, повёрнутое на цель.
   */
  fire(i: number, x: number, y: number, z: number, out: THREE.Vector3, zid = -1): THREE.Vector3 {
    const s = this.spots[i];
    if (!s || s.shownType < 0) {
      const d = s?.def ?? TOWER_SPOTS[0];
      return out.set(d.x, d.y + 1.5, d.z);
    }
    const m = this.model(s.shownType, s.shownStage);
    let have = Number.isFinite(x) && Number.isFinite(z);
    if (have) {
      s.tx = x;
      s.ty = Number.isFinite(y) ? y : 0;
      s.tz = z;
    } else if (zid >= 0 && this.where && this.where(zid, _v4)) {
      s.tx = _v4.x;
      s.ty = _v4.y + 0.9;
      s.tz = _v4.z;
      have = true;
    }
    if (have) {
      s.aimAt = this.time;
      this.wantFor(s, m, s.tx, s.ty, s.tz);
    }
    if (zid >= 0) s.zid = zid;
    // далеко от цели — довернуть рывком (снаряд вылетает из дула, а дуло уже почти на цели)
    const err = wrap(s.wantYaw - s.yaw);
    if (Math.abs(err) > 0.3) s.yaw = wrap(s.yaw + err * 0.75);
    if (m.gun) s.pitch += (s.wantPitch - s.pitch) * 0.7;
    s.hurry = 0.3;
    s.shotAt = this.time;
    const t = s.shownType;
    if (t === TW_BALLISTA) this.shootBallista(s, m, out);
    else if (t === TW_CANNON) this.shootCannon(s, m, out);
    else if (t === TW_TAR) this.shootTar(s, m, out);
    else this.shootBrazier(s, m, out);
    s.shots++;
    return out;
  }

  /** Смотреть на точку (x, y, z) — без выстрела (ещё 2,6 с после последнего вызова) */
  aim(i: number, x: number, y: number, z: number): void {
    const s = this.spots[i];
    if (!s) return;
    s.tx = x;
    s.ty = y;
    s.tz = z;
    s.zid = -1;
    s.aimAt = this.time;
  }

  /** Вести зомби zid (баллиста — свою цель, жаровня — подожжённого) */
  track(i: number, zid: number): void {
    const s = this.spots[i];
    if (!s) return;
    s.zid = zid;
    s.aimAt = this.time;
  }

  /** Мировая точка дула сейчас */
  muzzle(i: number, out: THREE.Vector3): THREE.Vector3 {
    const s = this.spots[i];
    if (!s || s.shownType < 0) {
      const d = s?.def ?? TOWER_SPOTS[0];
      return out.set(d.x, d.y + 1.5, d.z);
    }
    const m = this.model(s.shownType, s.shownStage);
    const bx = m.type === TW_CANNON ? m.barrels[s.barrel % m.barrels.length] : 0;
    return this.pointAt(s, m, m.gun ? 1 : 0, m.muzzle.x + bx, m.muzzle.y, m.muzzle.z, s.yaw, s.pitch, out);
  }

  /** Точка в системе turn (frame 0) или gun (frame 1) — в мир, при повороте yaw и наклоне pitch */
  private pointAt(s: SpotVis, m: TurretModel, frame: number, x: number, y: number, z: number, yaw: number, pitch: number, out: THREE.Vector3): THREE.Vector3 {
    _mA.makeRotationY(yaw).setPosition(0, m.turnY, 0);
    _mC.multiplyMatrices(s.root, _mA);
    if (frame === 1) {
      _mA.makeRotationX(pitch).setPosition(0, m.pivotY, m.pivotZ);
      _mC.multiply(_mA);
    }
    return out.set(x, y, z).applyMatrix4(_mC);
  }

  /** Куда смотреть на точку (x, y, z): поворот в системе места и наклон ствола по типу */
  private wantFor(s: SpotVis, m: TurretModel, x: number, y: number, z: number): void {
    const dx = x - s.def.x;
    const dz = z - s.def.z;
    s.wantYaw = wrap(Math.atan2(-dx, -dz) - s.rootYaw);
    const flat = Math.max(0.5, Math.hypot(dx, dz));
    const py = s.def.y + (m.turnY + m.pivotY) * TURRET_SCALE;
    let p = Math.atan2(y - py, flat);
    // пушка бьёт навесом: ствол приподнят тем выше, чем дальше цель
    if (m.type === TW_CANNON) p = Math.max(p, 0) + 0.12 + Math.min(0.4, flat * 0.011);
    s.wantPitch = Math.max(m.pitchMin, Math.min(m.pitchMax, p));
  }

  private shootBallista(s: SpotVis, m: TurretModel, out: THREE.Vector3): void {
    const b = s.shots % m.bows.length;
    s.bowT[b] = 0;
    s.flexV[b] += 9;
    s.recoilV += 2.6;
    const by = m.bows[b] + 0.06;
    this.pointAt(s, m, 1, 0, by, m.nockDrawn - 1.14, s.wantYaw, s.wantPitch, out);
    // хлопок тетивы: пыль у лука и вспышка у наконечника
    this.pointAt(s, m, 1, 0, by, m.armPivot.z, s.wantYaw, s.wantPitch, _v);
    this.fx.puff(_v.x, _v.y, _v.z, 0, 0.3, 0, 0.35, 1.4, 0.5, 0xf4ead8, 0.55);
    this.fx.spark(out.x, out.y, out.z, 0, 0, 0, 0.55, 0.12, 0xfff4d0, 0.8, CELL_FLASH, 0, 0, 3);
  }

  private shootCannon(s: SpotVis, m: TurretModel, out: THREE.Vector3): void {
    s.barrel = s.shots % m.barrels.length;
    s.recoilV += 6.5;
    s.kickV += 3.2;
    const bx = m.barrels[s.barrel];
    this.pointAt(s, m, 1, bx, m.muzzle.y, m.muzzle.z, s.wantYaw, s.wantPitch, out);
    this.pointAt(s, m, 1, bx, m.muzzle.y, m.muzzle.z - 1, s.wantYaw, s.wantPitch, _dir);
    _dir.sub(out);
    const fx = this.fx;
    // вспышка, огненный шар, дым клубами вдоль ствола, искры, пыж
    fx.spark(out.x, out.y, out.z, 0, 0, 0, 1.4, 0.13, 0xfff2c0, 1.6, CELL_FLASH, 0, 0, 5);
    fx.spark(out.x + _dir.x * 0.25, out.y + _dir.y * 0.25, out.z + _dir.z * 0.25, _dir.x * 3, _dir.y * 3, _dir.z * 3, 0.9, 0.22, 0xff9a3a, 1.3, CELL_SOFT, 0, 4, 3);
    // клубы дыма: вперёд по стволу и чуть в стороны, медленно всплывают
    const n = Math.ceil(11 * fx.scale);
    for (let k = 0; k < n; k++) {
      const sp = rnd(1.2, 5);
      fx.puff(out.x + _dir.x * 0.25, out.y + _dir.y * 0.25, out.z + _dir.z * 0.25, _dir.x * sp + rnd(-0.8, 0.8), _dir.y * sp + rnd(0, 0.8), _dir.z * sp + rnd(-0.8, 0.8), rnd(0.45, 0.75), rnd(1.2, 2), rnd(1.4, 2.3), k % 3 ? 0xf4f1ea : 0xd6cfc2, 0.88, 0.4, 2);
    }
    const ns = Math.ceil(8 * fx.scale);
    for (let k = 0; k < ns; k++) {
      fx.spark(out.x, out.y, out.z, _dir.x * rnd(4, 8) + rnd(-1.5, 1.5), _dir.y * rnd(4, 8) + rnd(0, 2), _dir.z * rnd(4, 8) + rnd(-1.5, 1.5), rnd(0.06, 0.1), rnd(0.3, 0.6), 0xffc860, 1.4, CELL_SPARK, 6, 1);
    }
    fx.chip(out.x, out.y, out.z, _dir.x * 3 + rnd(-0.5, 0.5), _dir.y * 3 + 2, _dir.z * 3 + rnd(-0.5, 0.5), 0.05, 1.2, 0xf4e2b8, 0, 0.4);
    // дымок из запального отверстия
    this.pointAt(s, m, 1, bx + m.fuse.x, m.fuse.y, m.fuse.z, s.wantYaw, s.wantPitch, _v);
    fx.puff(_v.x, _v.y, _v.z, 0, 0.8, 0, 0.18, 0.7, 0.8, 0xe8e2d8, 0.7);
  }

  private shootTar(s: SpotVis, m: TurretModel, out: THREE.Vector3): void {
    s.pour = 0;
    s.tpx = s.tx;
    s.tpz = s.tz;
    this.pointAt(s, m, 1, m.muzzle.x, m.muzzle.y, m.muzzle.z, s.wantYaw, -0.95, out);
  }

  private shootBrazier(s: SpotVis, m: TurretModel, out: THREE.Vector3): void {
    s.flare = 1;
    s.recoilV += 2;
    const frame = m.gun ? 1 : 0;
    this.pointAt(s, m, frame, m.muzzle.x, m.muzzle.y, m.muzzle.z, s.wantYaw, s.wantPitch, out);
    this.pointAt(s, m, frame, m.muzzle.x, m.muzzle.y, m.muzzle.z - 1, s.wantYaw, s.wantPitch, _dir);
    _dir.sub(out);
    const fx = this.fx;
    fx.spark(out.x, out.y, out.z, _dir.x * 2, 1, _dir.z * 2, 1.2, 0.25, 0xff9a3a, 1.4, CELL_SOFT, 0, 3, 3);
    const n = Math.ceil(10 * fx.scale);
    for (let k = 0; k < n; k++) {
      const sp = rnd(2.5, 6);
      fx.chip(out.x, out.y, out.z, _dir.x * sp + rnd(-1.6, 1.6), rnd(1.5, 4), _dir.z * sp + rnd(-1.6, 1.6), rnd(0.035, 0.06), rnd(0.8, 1.3), k % 2 ? C.ember : 0xffb347, 0, 1);
    }
    const ns = Math.ceil(14 * fx.scale);
    for (let k = 0; k < ns; k++) {
      fx.spark(out.x, out.y, out.z, _dir.x * rnd(2, 6) + rnd(-2, 2), rnd(1, 4), _dir.z * rnd(2, 6) + rnd(-2, 2), rnd(0.07, 0.12), rnd(0.4, 0.9), k % 2 ? 0xffb347 : 0xffe08a, 1.3, CELL_SPARK, 2, 1.2);
    }
  }

  /** Пыль кольцом у основания (бурая — видна и на светлом камне) */
  private dust(s: SpotVis, n0: number, r: number): void {
    const n = Math.ceil(n0 * this.fx.scale);
    const rr = r * 0.6 * TURRET_SCALE;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd(0, 0.4);
      const sp = rnd(0.9, 1.8);
      this.fx.puff(s.def.x + Math.cos(a) * rr, s.def.y + 0.15, s.def.z + Math.sin(a) * rr, Math.cos(a) * sp, rnd(0.25, 0.7), Math.sin(a) * sp, rnd(0.4, 0.65), rnd(1, 1.6), rnd(1, 1.6), k % 2 ? 0xb8a07a : 0xa88d66, 0.85, 0.12, 2.2);
    }
  }

  // ------------------------------------------------------------ кадр

  /** camPos — для экономии частиц у дальних башен; where(zid, out) — где сейчас зомби (вести цель) */
  update(dt: number, camPos: THREE.Vector3 | null, where?: Where): void {
    const step = Math.min(0.05, Math.max(0, dt));
    this.time += step;
    this.uTime.value = this.time;
    if (where) this.where = where;
    const cam = this.camera;
    if (cam) {
      // камеру к этому кадру уже повернули — матрицы свежие
      cam.updateMatrixWorld();
      _mA.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_mA);
    }
    this.pool.begin();
    this.clothPool.begin();
    this.fx.begin();
    let shadows = 0;
    let rings = 0;
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      if (cam) {
        _sphere.center.set(s.def.x, s.def.y + 1.1 * TURRET_SCALE, s.def.z);
        _sphere.radius = 2.2 * TURRET_SCALE;
        s.seen = _frustum.intersectsSphere(_sphere);
      } else s.seen = true;
      if (s.shownType < 0) {
        if (!s.seen) continue;
        const pulse = 1 + 0.035 * Math.sin(this.time * 2.4 + s.seed);
        _mA.makeScale(pulse, 1, pulse).setPosition(s.def.x, s.def.y + 0.03, s.def.z);
        this.ring.setMatrixAt(rings++, _mA);
        continue;
      }
      if (camPos) {
        const dx = camPos.x - s.def.x;
        const dy = camPos.y - s.def.y;
        const dz = camPos.z - s.def.z;
        s.far = dx * dx + dy * dy + dz * dz > FAR2;
      }
      this.animate(s, this.model(s.shownType, s.shownStage), step, this.where);
      if (s.shownType < 0 || !s.seen) continue;
      const m = this.model(s.shownType, s.shownStage);
      this.pose(s, m);
      // пятно-тень
      const r = m.shadowR * 2.3 * TURRET_SCALE * (s.build >= 0 ? clamp01(s.build / RISE_S) : 1) * (s.gone >= 0 ? 1 - s.gone / GONE_S : 1);
      _mA.makeScale(r, 1, r).setPosition(s.def.x, s.def.y + 0.025, s.def.z);
      this.shadow.setMatrixAt(shadows++, _mA);
    }
    this.pool.end();
    this.clothPool.end();
    this.fx.end(step);
    this.shadow.count = shadows;
    this.shadow.visible = shadows > 0;
    this.shadow.instanceMatrix.needsUpdate = true;
    this.ring.count = rings;
    this.ring.visible = rings > 0;
    this.ring.instanceMatrix.needsUpdate = true;
  }

  /** Время анимаций, прицел-пружина, отдача, изгиб плеч, смола */
  private animate(s: SpotVis, m: TurretModel, dt: number, where: Where | null): void {
    const t = this.time;
    if (s.build >= 0) {
      s.build += dt;
      // пока поднимается — из щели у основания валит пыль
      if (s.build < RISE_S && t > s.dustAt) {
        s.dustAt = t + 0.07;
        this.dust(s, 3, 1.1);
      }
      if (s.build > BUILD_S) s.build = -1;
    }
    if (s.up >= 0) {
      const before = s.up;
      s.up += dt;
      // смена облика в верхней точке подскока — под вспышкой; конфетти
      if (before < 0.31 && s.up >= 0.31) {
        const st = stageOf(s.shownLevel);
        const { x, y, z } = s.def;
        if (st !== s.shownStage) {
          s.shownStage = st;
          this.fx.spark(x, y + 1.2, z, 0, 0, 0, 2.6, 0.3, 0xffffff, 1.8, CELL_FLASH, 0, 0, 6);
        }
        this.fx.spark(x, y + 1.1, z, 0, 0.5, 0, 1.4, 0.4, 0xfff0c0, 1.2, CELL_SOFT, 0, 0, 3);
        const n = Math.ceil(14 * this.fx.scale);
        for (let k = 0; k < n; k++) {
          const a = rnd(0, Math.PI * 2);
          const sp = rnd(1.2, 2.6);
          this.fx.chip(x, y + 1.4, z, Math.cos(a) * sp, rnd(2.5, 4.5), Math.sin(a) * sp, rnd(0.035, 0.055), rnd(1.2, 1.8), CONFETTI[k % CONFETTI.length], y);
        }
      }
      if (before < 0.55 && s.up >= 0.55) this.dust(s, 8, 0.9);
      if (s.up > UP_S) s.up = -1;
    }
    if (s.gone >= 0) {
      s.gone += dt;
      if (s.gone > GONE_S) {
        s.gone = -1;
        s.shownType = -1;
        return;
      }
    }
    // ---- куда смотреть: живая цель, последняя точка выстрела или осмотр
    let have = false;
    if (s.zid >= 0 && where && t - s.aimAt < 4) {
      if (where(s.zid, _v)) {
        s.tx = _v.x;
        s.ty = _v.y + (_v.y > 2.5 ? 0.5 : 0.9);
        s.tz = _v.z;
        have = true;
      } else s.zid = -1;
    }
    if (!have && t - s.aimAt < 2.6) have = true;
    if (have) this.wantFor(s, m, s.tx, s.ty, s.tz);
    else {
      s.wantYaw = Math.sin(t * 0.23 + s.seed) * 0.62 + Math.sin(t * 0.61 + s.seed * 2.1) * 0.12;
      s.wantPitch = m.type === TW_CANNON ? 0.12 : m.type === TW_BALLISTA ? -0.04 + Math.sin(t * 0.4 + s.seed) * 0.05 : 0;
    }
    if (s.build >= 0 || s.gone >= 0) s.wantYaw = 0;
    const hurry = s.hurry > 0;
    s.hurry = Math.max(0, s.hurry - dt);
    const k = hurry ? 210 : have ? 46 : 7;
    const c = 2 * Math.sqrt(k) * (have ? 0.72 : 1);
    const maxV = hurry ? 14 : have ? 4.5 : 1.2;
    const sub = dt > 0.02 ? 2 : 1;
    const h = dt / sub;
    for (let n = 0; n < sub; n++) {
      s.yawV += (k * wrap(s.wantYaw - s.yaw) - c * s.yawV) * h;
      s.yawV = Math.max(-maxV, Math.min(maxV, s.yawV));
      s.yaw = wrap(s.yaw + s.yawV * h);
      s.pitchV += (k * (s.wantPitch - s.pitch) - c * s.pitchV) * h;
      s.pitch += s.pitchV * h;
      // отдача ствола вдоль оси и подброс дула
      s.recoilV += (-260 * s.recoil - 22 * s.recoilV) * h;
      s.recoil += s.recoilV * h;
      s.kickV += (-120 * s.kick - 14 * s.kickV) * h;
      s.kick += s.kickV * h;
    }
    s.recoil = Math.max(-0.05, Math.min(0.45, s.recoil));
    // баллиста: тетива, плечи, ворот
    if (m.type === TW_BALLISTA) {
      for (let b = 0; b < m.bows.length; b++) {
        s.bowT[b] += dt;
        const bt = s.bowT[b];
        const target = -0.2 + 0.26 * release(bt);
        s.flexV[b] += (180 * (target - s.flex[b]) - 9 * s.flexV[b]) * dt;
        s.flex[b] += s.flexV[b] * dt;
        if (bt > 0.1 && bt < 0.55) s.crank += dt * 11;
      }
    }
    // смола: уровень (льёт — убывает, потом подливают), пузыри
    if (m.type === TW_TAR) {
      if (s.pour >= 0) {
        s.pour += dt;
        if (s.pour > 0.3 && s.pour < 1.1) s.tarLevel = Math.max(0.2, s.tarLevel - dt * 1.1);
        if (s.pour > 1.9) s.pour = -1;
      } else s.tarLevel = Math.min(1, s.tarLevel + dt * 0.18);
      for (let b = 0; b < BUBBLES; b++) {
        s.bub[b] += dt * (0.7 + b * 0.13);
        if (s.bub[b] >= 1) s.bub[b] -= 1;
      }
    }
    s.flare = Math.max(0, s.flare - dt * 1.6);
  }

  /** Матрицы деталей места и постоянный огонь */
  private pose(s: SpotVis, m: TurretModel): void {
    const t = this.time;
    // корень: постройка (растёт из стены), подскок улучшения, снос
    let rise = 0;
    let sy = 1;
    let sxz = 1;
    let bright = 0;
    let flagK = 1;
    if (s.build >= 0) {
      // поднимается из стены (с лёгким перелётом), потом садится с приседанием; вымпел разворачивается последним
      const b = s.build;
      const u = clamp01(b / RISE_S);
      rise = -2.1 * (1 - riseEase(u));
      if (b < RISE_S) {
        sy = 1 + 0.12 * (1 - u);
        sxz = 1 - 0.07 * (1 - u);
      } else if (b < RISE_S + 0.32) {
        const w = Math.sin((Math.PI * (b - RISE_S)) / 0.32);
        sy = 1 - 0.13 * w;
        sxz = 1 + 0.07 * w;
      }
      flagK = clamp01((b - RISE_S - 0.1) / 0.4);
    }
    if (s.up >= 0) {
      const u = s.up;
      if (u < 0.12) {
        sy = 1 - 0.13 * (u / 0.12);
        sxz = 1 + 0.06 * (u / 0.12);
      } else if (u < 0.5) {
        const w = Math.sin((Math.PI * (u - 0.12)) / 0.38);
        rise = 0.6 * w;
        sy = 1 + 0.1 * w;
        sxz = 1 - 0.04 * w;
      } else if (u < 0.75) {
        const w = Math.sin((Math.PI * (u - 0.5)) / 0.25);
        sy = 1 - 0.11 * w;
        sxz = 1 + 0.06 * w;
      }
      bright = 1.3 * Math.max(0, 1 - Math.abs(u - 0.31) / 0.36);
    }
    if (s.gone >= 0) {
      const u = clamp01(s.gone / GONE_S);
      rise = -2.1 * u * u;
      sxz = 1 - 0.2 * u;
    }
    _mR.copy(s.root);
    if (rise !== 0 || sy !== 1 || sxz !== 1) {
      _mA.makeScale(sxz, sy, sxz).setPosition(0, rise, 0);
      _mR.multiply(_mA);
    }
    const col = _col.setScalar(1 + bright);
    const pool = this.pool;
    pool.put(m.base, _mR, col);
    // поворот; у пушки лафет откатывается назад и его снова накатывают
    _mA.makeRotationY(s.yaw).setPosition(0, m.turnY, 0);
    _mT.multiplyMatrices(_mR, _mA);
    const since = t - s.shotAt;
    let slide = 0;
    if (m.type === TW_CANNON && s.shots > 0 && since < 1) {
      slide = since < 0.08 ? 0.14 * easeOut(since / 0.08) : 0.14 * (1 - easeInOut(clamp01((since - 0.08) / 0.85)));
      _mA.makeTranslation(0, 0, slide);
      _mT.multiply(_mA);
    }
    pool.put(m.turn, _mT, col);
    // ствол: наклон, подброс, отдача вдоль +Z; котёл — наклоном слива
    const pitch = m.type === TW_TAR ? this.tilt(s) : s.pitch + s.kick * 0.5;
    if (m.gun) {
      _mA.makeRotationX(pitch).setPosition(0, m.pivotY, m.pivotZ);
      _mG.multiplyMatrices(_mT, _mA);
      if (s.recoil !== 0 && m.type !== TW_TAR) {
        _mA.makeTranslation(0, 0, s.recoil * (m.type === TW_CANNON ? 0.55 : 0.3));
        _mG.multiply(_mA);
      }
      pool.put(m.gun, _mG, col);
    }
    if (m.type === TW_BALLISTA) this.poseBallista(s, m, col);
    else if (m.type === TW_CANNON) this.poseCannon(s, m, col, t, since, slide);
    else if (m.type === TW_TAR) this.poseTar(s, m, col, t);
    else this.poseBrazier(s, m, col, t, since);
    // флагшток: вымпел по ветру и звёзды на щитке
    const frame = m.flagInBase ? _mR : _mT;
    _v.copy(m.flag).applyMatrix4(frame);
    const sway = Math.sin(t * 1.9 + s.seed) * 0.22 + Math.sin(t * 0.7 + s.seed * 3) * 0.1;
    _q.setFromAxisAngle(Y_AXIS, WIND_YAW + sway);
    const ps = PENNANT_SCALE[m.stage];
    _mA.compose(_v, _q, _s.set(Math.max(0.02, flagK) * TURRET_SCALE * ps[0], TURRET_SCALE * ps[1], TURRET_SCALE));
    _col2.setHex(PENNANT_COLORS[Math.max(0, Math.min(PENNANT_COLORS.length - 1, s.shownLevel - 1))]);
    this.clothPool.put(this.pennants[m.stage === 0 ? 0 : 1], _mA, _col2);
    const stars = starsOf(s.shownLevel);
    for (let k = 0; k < stars; k++) {
      const dx = stars === 1 ? 0 : stars === 2 ? (k ? 0.068 : -0.068) : k === 2 ? 0 : k ? 0.07 : -0.07;
      const dy = stars === 3 ? (k === 2 ? -0.07 : 0.045) : 0.02;
      let pop = 1;
      if (s.build >= 0) pop = clamp01((s.build - RISE_S - 0.3 - k * 0.08) / 0.15);
      else if (s.up >= 0 && k === stars - 1) {
        const u = s.up - 0.45;
        pop = u < 0 ? 0 : u < 0.2 ? 1.5 * (u / 0.2) : 1.5 - 0.5 * clamp01((u - 0.2) / 0.2);
      }
      if (pop <= 0.01) continue;
      _mA.makeScale(pop, pop, pop).setPosition(m.plaque.x + dx, m.plaque.y + dy, m.plaque.z);
      _mB.multiplyMatrices(frame, _mA);
      _col2.setHex(STAR_COLORS[m.stage]);
      if (bright > 0) _col2.multiplyScalar(1 + bright);
      pool.put(this.star, _mB, _col2);
    }
  }

  private poseBallista(s: SpotVis, m: TurretModel, col: THREE.Color): void {
    // ворот
    _mA.makeRotationX(s.crank).setPosition(0, 0, m.crankZ);
    _mB.multiplyMatrices(_mG, _mA);
    this.pool.put(this.crankPart, _mB, col);
    const px = m.armPivot.x;
    const pz = m.armPivot.z;
    for (let b = 0; b < m.bows.length; b++) {
      const by = m.bows[b];
      const th = s.flex[b];
      // правое плечо; левое — то же, повёрнутое на π вокруг Z
      _mA.makeRotationY(th).setPosition(px, by, pz);
      _mB.multiplyMatrices(_mG, _mA);
      this.pool.put(m.arm!, _mB, col);
      _mA.makeRotationZ(Math.PI);
      _mC.makeRotationY(th);
      _mA.multiply(_mC).setPosition(-px, by, pz);
      _mB.multiplyMatrices(_mG, _mA);
      this.pool.put(m.arm!, _mB, col);
      // тетива: от концов плеч к хвосту болта (взведена) или прямо между концами (спущена)
      const ct = Math.cos(th);
      const st = Math.sin(th);
      const tipX = m.armTip.x * ct + m.armTip.z * st;
      const tipZ = -m.armTip.x * st + m.armTip.z * ct;
      const bt = s.bowT[b];
      const nockZ = m.nockDrawn + (pz + tipZ - m.nockDrawn) * release(bt);
      const ny = by + 0.06;
      for (let sx = 1; sx >= -1; sx -= 2) {
        _v.set(sx * (px + tipX), by, pz + tipZ);
        _v2.set(0, ny, nockZ);
        this.segment(this.string, _mG, _v, _v2, 1, col);
      }
      // болт: после выстрела нет, к концу взвода въезжает сзади
      const load = bt < 0.55 ? 0 : clamp01((bt - 0.55) / 0.16);
      if (load > 0) {
        _mA.makeTranslation(0, ny, m.nockDrawn + (1 - easeOut(load)) * 0.42);
        _mB.multiplyMatrices(_mG, _mA);
        this.pool.put(this.bolt, _mB, col);
      }
    }
  }

  private poseCannon(s: SpotVis, m: TurretModel, col: THREE.Color, t: number, since: number, slide: number): void {
    // колёса катятся с откатом лафета
    const wp = m.wheelPos;
    const roll = s.wheel + slide / m.wheelR;
    _mA.makeRotationX(roll).setPosition(wp.x, wp.y, wp.z);
    _mB.multiplyMatrices(_mT, _mA);
    this.pool.put(m.wheel!, _mB, col);
    _mA.makeRotationZ(Math.PI);
    _mC.makeRotationX(-roll);
    _mA.multiply(_mC).setPosition(-wp.x, wp.y, wp.z);
    _mB.multiplyMatrices(_mT, _mA);
    this.pool.put(m.wheel!, _mB, col);
    const fired = s.shots > 0;
    const bx = m.barrels[s.barrel % m.barrels.length];
    // перезарядка: верхнее ядро подпрыгивает с ящика и ныряет в дуло; на ящике новое «вырастает»
    if (fired && since >= 0.75 && since < 1.2) {
      const u = (since - 0.75) / 0.45;
      _v.copy(m.pile).applyMatrix4(_mT);
      _v2.set(bx, m.muzzle.y, m.muzzle.z - 0.05).applyMatrix4(_mG);
      _v3.lerpVectors(_v, _v2, u);
      _v3.y += Math.sin(Math.PI * u) * 0.9;
      const sc = (u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1) * TURRET_SCALE;
      _mA.makeScale(sc, sc, sc).setPosition(_v3.x, _v3.y, _v3.z);
      this.pool.put(this.ball, _mA, col);
    }
    const back = !fired || since < 0.75 || since >= 1.6 ? 1 : since < 1.2 ? 0 : clamp01((since - 1.2) / 0.4);
    if (back > 0.01) {
      const sc = back < 1 ? Math.max(0, easeOutBack(back)) : 1;
      _mA.makeScale(sc, sc, sc).setPosition(m.pile.x, m.pile.y, m.pile.z);
      _mB.multiplyMatrices(_mT, _mA);
      this.pool.put(this.ball, _mB, col);
    }
    if (s.far || this.detail === 0 || !fired) return;
    // дымок из дула после выстрела
    if (since < 1.4 && t > s.wispAt) {
      s.wispAt = t + 0.12;
      _v.set(bx, m.muzzle.y + 0.05, m.muzzle.z + 0.05).applyMatrix4(_mG);
      this.fx.puff(_v.x, _v.y, _v.z, rnd(-0.1, 0.1), rnd(0.4, 0.7), rnd(-0.1, 0.1), 0.14, 0.55, 1.1, 0xe4dfd6, 0.45 * (1 - since / 1.4), 0.25, 1);
    }
    // фитиль у запала тлеет — скоро снова бить
    if (since > 1.5 && since < 2.6) {
      for (let k = 0; k < m.barrels.length; k++) {
        _v.set(m.barrels[k] + m.fuse.x, m.fuse.y + 0.02, m.fuse.z).applyMatrix4(_mG);
        this.fx.glow(_v.x, _v.y, _v.z, (0.16 + Math.random() * 0.08) * TURRET_SCALE, 1.3, 0xffb347, CELL_SPARK);
        if (this.detail > 1 && Math.random() < 0.3) this.fx.spark(_v.x, _v.y, _v.z, rnd(-0.6, 0.6), rnd(0.8, 1.6), rnd(-0.6, 0.6), 0.05, 0.3, 0xffd070, 1.2, CELL_SPARK, 4);
      }
    }
  }

  /** Наклон котла: вперёд за 0,3 с, держит (покачиваясь), возвращается с отскоком */
  private tilt(s: SpotVis): number {
    const p = s.pour;
    if (p < 0) return Math.sin(this.time * 2.1 + s.seed) * 0.015;
    if (p < 0.3) return -0.95 * easeOut(p / 0.3);
    if (p < 1.1) return -0.95 + Math.sin((p - 0.3) * 18) * 0.03;
    const u = clamp01((p - 1.1) / 0.6);
    return -0.95 * (1 - easeOutBack(u));
  }

  private poseTar(s: SpotVis, m: TurretModel, col: THREE.Color, t: number): void {
    // гладь смолы и пузыри
    const lvl = m.tarEmpty + (m.tarFull - m.tarEmpty) * s.tarLevel;
    const shrink = 0.82 + 0.18 * s.tarLevel;
    _mA.makeScale(shrink, 1, shrink).setPosition(0, lvl, 0);
    _mB.multiplyMatrices(_mG, _mA);
    this.pool.put(m.tarTop!, _mB, col);
    if (this.detail > 0 && s.pour < 0 && !s.far) {
      for (let b = 0; b < BUBBLES; b++) {
        const u = s.bub[b];
        if (u > 0.9) continue;
        const sc = u < 0.8 ? u / 0.8 : 1 + (u - 0.8) * 2.5;
        const a = s.seed * 3 + b * 2.1 + Math.floor(t * (0.7 + b * 0.13)) * 1.3;
        const r = 0.08 + (b % 2) * 0.12;
        _mA.makeScale(sc, sc, sc).setPosition(Math.cos(a) * r, lvl + 0.01, Math.sin(a) * r);
        _mB.multiplyMatrices(_mG, _mA);
        this.pool.put(this.bubble, _mB, col);
      }
    }
    // огонь под котлом
    this.fires(m, _mR, 0.9 + s.flare * 0.3, s.seed, t);
    // пар над котлом
    if (this.detail > 0 && !s.far && t > s.steamAt) {
      s.steamAt = t + rnd(0.45, 0.9) / this.fx.scale;
      _v.set(rnd(-0.15, 0.15), lvl + 0.15, rnd(-0.15, 0.15)).applyMatrix4(_mG);
      this.fx.puff(_v.x, _v.y, _v.z, rnd(-0.1, 0.1), rnd(0.5, 0.8), rnd(-0.1, 0.1), 0.22, 0.6, 1.6, 0xd9d4ca, 0.35, 0.2, 0.8);
    }
    // струя: парабола от носика через бруствер к цели у подножия стены; голова струи бежит вперёд, хвост — следом
    const p = s.pour;
    if (p >= 0.22 && p < 1.3) {
      const head = clamp01((p - 0.22) / 0.22);
      const tail = clamp01((p - 1.05) / 0.25);
      if (head <= tail) return;
      _v.copy(m.muzzle).applyMatrix4(_mG);
      const h0 = _v.y;
      const yT = 0.05;
      let ux = s.tpx - _v.x;
      let uz = s.tpz - _v.z;
      const D = Math.max(0.8, Math.hypot(ux, uz));
      ux /= D;
      uz /= D;
      // где бруствер: место — в def, бруствер — в port метрах по нормали; над ним — с запасом
      const { nx, nz } = s.def;
      const ahead = (_v.x - s.def.x) * nx + (_v.z - s.def.z) * nz;
      const xp = Math.max(0.3, Math.min(D - 0.4, (s.def.port - ahead) / Math.max(0.2, ux * nx + uz * nz)));
      const par = s.def.y + 1.05;
      let k = ((par - h0) * D - (yT - h0) * xp) / (xp * D * (D - xp));
      let a = (par - h0 + k * xp * xp) / xp;
      if (!(k > 0.05) || !Number.isFinite(a)) {
        k = (h0 - yT) / (D * D);
        a = 0;
      }
      let px = _v.x;
      let py = h0;
      let pz = _v.z;
      for (let i = 1; i <= STREAM_SEGS; i++) {
        const u0 = (i - 1) / STREAM_SEGS;
        const u = i / STREAM_SEGS;
        const x = D * Math.pow(u, 0.8);
        const qx = _v.x + ux * x;
        const qy = h0 + a * x - k * x * x;
        const qz = _v.z + uz * x;
        if (u > tail && u0 < head) {
          _v3.set(px, py, pz);
          _dir.set(qx, qy, qz);
          const w = (1.35 - 0.5 * u) * (1 + 0.12 * Math.sin(t * 31 + i * 1.7));
          this.segment(this.stream, null, _v3, _dir, w, col);
        }
        px = qx;
        py = qy;
        pz = qz;
      }
      if (this.detail > 0 && !s.far) {
        // капли срываются со струи, у цели — брызги
        if (Math.random() < 0.35) {
          const x = D * rnd(0.2, 0.8) * head;
          this.fx.chip(_v.x + ux * x, h0 + a * x - k * x * x, _v.z + uz * x, ux * rnd(0.5, 1.5) + rnd(-0.4, 0.4), rnd(-0.5, 0.5), uz * rnd(0.5, 1.5) + rnd(-0.4, 0.4), rnd(0.03, 0.05), 1, C.tar, 0.03);
        }
        if (head >= 1 && Math.random() < 0.6) this.fx.chip(s.tpx + rnd(-0.3, 0.3), 0.1, s.tpz + rnd(-0.3, 0.3), rnd(-1.5, 1.5), rnd(1.5, 3), rnd(-1.5, 1.5), rnd(0.04, 0.07), 0.6, C.tar, 0.03);
      }
    }
  }

  private poseBrazier(s: SpotVis, m: TurretModel, col: THREE.Color, t: number, since: number): void {
    // меха: сжимаются при плевке, потом набирают воздух; в простое — дышат
    const pump = since < 0.15 ? since / 0.15 : since < 0.9 ? 1 - easeInOut((since - 0.15) / 0.75) : 0;
    const breathe = Math.sin(t * 1.6 + s.seed) * 0.05;
    _mA.makeScale(1, 1 - 0.5 * pump + breathe, 1).setPosition(m.bellowsAt.x, m.bellowsAt.y, m.bellowsAt.z);
    _mB.multiplyMatrices(_mT, _mA);
    this.pool.put(m.bellows!, _mB, col);
    const frame = m.gun ? _mG : _mT;
    // челюсть дракончика: распахнута при плевке, в простое — пожёвывает
    if (m.jaw) {
      const open = since < 0.08 ? since / 0.08 : since < 0.35 ? 1 : since < 0.75 ? 1 - easeInOut((since - 0.35) / 0.4) : 0;
      const chew = Math.max(0, Math.sin(t * 0.9 + s.seed)) * 0.06;
      _mA.makeRotationX(-(0.6 * open + chew)).setPosition(m.jawPivot.x, m.jawPivot.y, m.jawPivot.z);
      _mB.multiplyMatrices(_mG, _mA);
      this.pool.put(m.jaw, _mB, col);
      if (open > 0.2) {
        _v.copy(m.muzzle).applyMatrix4(_mG);
        this.fx.glow(_v.x, _v.y, _v.z, (0.5 + open * 0.4) * TURRET_SCALE, 1.2 * open, 0xff8a3a);
        this.fx.flame(_v.x, _v.y - 0.1, _v.z, 0.35 * open * TURRET_SCALE, 0.5 * open * TURRET_SCALE, 1.3, 0xffb347);
      }
    }
    this.fires(m, frame, 1 + s.flare * 1.3, s.seed, t);
    if (s.far || this.detail === 0) return;
    // искры над огнём и редкий дымок
    const f = m.fires[0];
    if (t > s.emberAt) {
      s.emberAt = t + rnd(0.1, 0.22) / this.fx.scale;
      _v.set(f[0] + rnd(-0.12, 0.12), f[1] + 0.2, f[2] + rnd(-0.12, 0.12)).applyMatrix4(frame);
      this.fx.spark(_v.x, _v.y, _v.z, rnd(-0.3, 0.3), rnd(1.2, 2.2), rnd(-0.3, 0.3), rnd(0.05, 0.09), rnd(0.6, 1.1), Math.random() < 0.5 ? 0xffb347 : 0xffe08a, 1.3, CELL_SPARK, -0.2, 0.6);
    }
    if (this.detail > 1 && Math.random() < 0.05) {
      _v.set(f[0], f[1] + 0.7 * f[3], f[2]).applyMatrix4(frame);
      this.fx.puff(_v.x, _v.y, _v.z, rnd(-0.1, 0.1), 0.6, rnd(-0.1, 0.1), 0.25, 0.7, 1.4, 0x9e968c, 0.25, 0.3, 0.8);
    }
  }

  /** Языки пламени модели в системе frame: внешний оранжевый и внутренний жёлтый, ореол */
  private fires(m: TurretModel, frame: THREE.Matrix4, k: number, seed: number, t: number): void {
    for (let i = 0; i < m.fires.length; i++) {
      const f = m.fires[i];
      _v.set(f[0], f[1], f[2]).applyMatrix4(frame);
      const n1 = Math.sin(t * 13 + i * 2.1 + seed) * 0.14 + Math.sin(t * 23 + i * 5.3) * 0.08;
      const h = f[3] * k * (1 + n1) * TURRET_SCALE;
      const lean = Math.sin(t * 3.1 + i + seed) * 0.12;
      this.fx.flame(_v.x, _v.y, _v.z, h * 0.58, h, 1.25, 0xff7a2a, lean);
      this.fx.flame(_v.x, _v.y, _v.z, h * 0.34, h * 0.62, 1.2, 0xffe08a, lean * 0.6);
      if (i === 0) this.fx.glow(_v.x, _v.y + h * 0.3, _v.z, f[3] * 2.4 * k * TURRET_SCALE, 0.32, 0xff9a4a);
    }
  }

  /** Отрезок от a до b (в системе frame или в мире, если frame = null) деталью единичной длины вдоль +Y; w — толщина */
  private segment(p: Part, frame: THREE.Matrix4 | null, a: THREE.Vector3, b: THREE.Vector3, w: number, col: THREE.Color): void {
    _v4.subVectors(b, a);
    const len = _v4.length();
    if (len < 1e-4) return;
    _v4.multiplyScalar(1 / len);
    _q.setFromUnitVectors(Y_AXIS, _v4);
    _mA.compose(a, _q, _s.set(w, len, w));
    if (frame) _mB.multiplyMatrices(frame, _mA);
    else _mB.copy(_mA);
    this.pool.put(p, _mB, col);
  }

  // ------------------------------------------------------------ служебное

  /** Новая игра: башни прочь без анимации, частицы — тоже; следующее setAll() — тоже без анимаций */
  reset(): void {
    for (const s of this.spots) {
      s.type = -1;
      s.level = 0;
      s.shownType = -1;
      s.shownLevel = 0;
      s.build = s.up = s.gone = s.pour = -1;
      s.zid = -1;
      s.aimAt = s.shotAt = -99;
      s.shots = 0;
      s.recoil = s.recoilV = s.kick = s.kickV = 0;
    }
    this.fx.clear();
    this.silent = true;
  }

  /** Для отладки и тестов: вызовы отрисовки башен (без частиц), деталей в пачке, частицы, что показано */
  get info(): { draws: number; parts: number; particles: number; shown: number[]; stages: number[] } {
    return {
      draws: this.pool.draws + this.clothPool.draws + (this.shadow.count ? 1 : 0) + (this.ring.count ? 1 : 0),
      parts: this.pool.count,
      particles: this.fx.active,
      shown: this.spots.map((s) => s.shownType),
      stages: this.spots.map((s) => s.shownStage),
    };
  }

  dispose(): void {
    this.pool.dispose();
    this.clothPool.dispose();
    this.fx.dispose(this.scene);
    for (const m of [this.shadow, this.ring]) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.MeshBasicMaterial).map?.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
    for (const m of this.models) {
      if (!m) continue;
      for (const p of [m.base, m.turn, m.gun, m.arm, m.wheel, m.tarTop, m.jaw, m.bellows]) p?.geo.dispose();
    }
    for (const p of [this.bolt, this.string, this.crankPart, this.ball, this.bubble, this.stream, this.star, ...this.pennants]) p.geo.dispose();
    this.mat.dispose();
    this.cloth.dispose();
    this.env?.dispose();
  }
}

/** Подъём из стены: быстро, с небольшим перелётом вверх в конце */
function riseEase(u: number): number {
  const c1 = 1.15;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
}

/** Баллиста: насколько спущена тетива через bt секунд после выстрела (1 — спущена, 0 — взведена) */
function release(bt: number): number {
  return bt < 0.1 ? 1 : bt < 0.55 ? 1 - easeInOut((bt - 0.1) / 0.45) : 0;
}
