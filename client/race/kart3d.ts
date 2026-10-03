// Карт на трассе и эффекты гонки.
// Карт — группа в мировых осях: курс из снимка, тангаж по вертикальной скорости (трамплин, полёт), лёгкий крен
// в повороте. Корпус 1,7 × 1,15 м цвета карта: нос, понтоны, бамперы, номер; колёса крутятся по пройденному пути,
// передние поворачиваются за рулём. За рулём — желейка (Avatar, driving): стоит на сиденье в мировых осях, наклон
// карта копируется. Тень — мягкое пятно на опоре: в карту теней карт не попадает (тени статики считаются один раз).
// Всё, что «надето» на карт, — его дочерние объекты и рисуется в его кадре, без отставания: пузырь (переливается,
// лопается брызгами), трюк — бочка вокруг продольной оси, пружина подвески на приземлении.
// KartFx — два облака частиц на всех: яркое (искры заноса, пламя турбо, искры от стен) и мягкое (дымок шин,
// пыль, песок и трава из-под колёс, брызги, щепки ящика, варенье, краска) — и следы шин на асфальте (skids.ts).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DT, WATER_Y } from '../../shared/constants.ts';
import { BOOST_TURBO, KART_R, SPIN_TICKS, type KartState } from '../../shared/kart.ts';
import {
  KE_BOOST, KE_DRIFT, KE_DRIFT_R, KE_GHOST, KE_GROUND, KE_ON, KE_PAINT, KE_SLOW, KM_BUBBLE, KM_BURN, KM_SPARK, KM_TRICK, kartFlags, kartMisc,
  kartYaw, miscBoost,
} from '../../shared/kartnet.ts';
import type { Outfit } from '../../shared/outfit.ts';
import { E_ALIVE, E_GROUNDED } from '../../shared/protocol.ts';
import { SURF_GRASS, SURF_SAND, makeLoc, type TrackLoc } from '../../shared/track.ts';
import { Avatar, DRIVE_SQUASH, DRIVE_TURN, DRIVE_WHEEL, type AvatarPose, type GroundQuery } from '../render/avatar.ts';
import { glowTexture, paint } from '../render/kit.ts';
import * as tex from '../render/textures.ts';
import { SkidMarks } from './skids.ts';

/** Цвета картов по местам на решётке */
export const KART_COLORS: readonly number[] = [0xe5483b, 0x2f7fd8, 0xf2c230, 0x34b36a, 0x9a5fd8, 0xf07f2a];

/** Желейка за рулём меньше обычной */
const DRIVER_SCALE = 0.8;
/** Низ желейки на сиденье, в осях карта (−Z — вперёд, +X — вправо) */
const SEAT = new THREE.Vector3(0, 0.13, 0.12);
/** Колёса: отступ от оси карта, место по длине, радиус, ширина */
const FRONT = { x: 0.5, z: -0.56, r: 0.13, w: 0.13 } as const;
const REAR = { x: 0.56, z: 0.5, r: 0.145, w: 0.19 } as const;
/** Поворот передних колёс при полном руле, рад */
const WHEEL_STEER = 0.42;
/** Срез глушителя: отсюда пламя турбо */
const EXHAUST = new THREE.Vector3(0.38, 0.36, 0.96);
/** Асфальт лежит над опорой на 2 см */
const RIDE_Y = 0.02;
/** Кружение после банки — один оборот */
const SPIN_S = SPIN_TICKS * DT;
const MAX_PITCH = 0.42;
/** Крен в повороте на полной скорости (в заносе — больше), рад */
const ROLL = 0.05;
/** Тень видна, пока карт не выше стольких метров над опорой */
const SHADOW_H = 8;
/** Частиц в секунду: дымок из-под задних колёс в заносе, искры, пламя турбо, дымок мотора */
const SMOKE_RATE = 22;
const SPARK_RATE = 80;
/** Огоньки цвета заряда у задних колёс (пар в секунду) */
const FLARE_RATE = 36;
const FLAME_RATE = 60;
const EXHAUST_RATE = 3;
/** Пыль из-под задних колёс (частиц в секунду): трогается с места, у края дороги, на скорости */
const DUST_START = 26;
const DUST_EDGE = 16;
const DUST_FAST = 5;
const DUST_COLOR = 0xe6dccb;
/** Резкое торможение — замедление больше стольких м/с² (тормоз — 30, сброс скорости после турбо — 12) */
const SKID_DECEL = 16;
/** Боковое скольжение больше стольких м/с — тоже след */
const SKID_SLIP = 3.2;
/** Насколько тёмный след: занос, торможение */
const SKID_DRIFT_A = 0.62;
const SKID_BRAKE_A = 0.5;
/** Искры заноса: мини-турбо 1 — синие, 2 — оранжевые, 3 — фиолетовые; пламя — по уровню ускорения (4 — турбо) */
const SPARK_COLORS = [0xffffff, 0x5ab8ff, 0xff9a2e, 0xc77dff];
const FLAME_COLORS = [0xffffff, 0x7cc8ff, 0xff8a2a, 0xc77dff, 0xffb347];
/** Пузырь: радиус, высота середины над опорой; надувается и лопается за столько секунд */
const BUBBLE_R = 1.3;
const BUBBLE_Y = 0.62;
const BUBBLE_GROW_S = 0.28;
/** Трюк: бочка вокруг продольной оси за столько секунд */
const TRICK_S = 0.5;
/** Подвеска: жёсткость и демпфер пружины корпуса (визуально), на сколько м/с приземления — толчок */
const SUSP_K = 260;
const SUSP_C = 15;
/** Песок и трава из-под колёс: частиц в секунду на скорости и цвета */
const SPRAY_RATE = 34;
const SAND_COLOR = 0xe2c27e;
const GRASS_COLOR = 0x6fae4a;
/** Пробуксовка на старте: дым из-под задних колёс */
const BURN_RATE = 40;
/** Краска на корпусе — ярко-розовая (не совпадает ни с одним цветом карта) */
const PAINT_COLOR = 0xff3fb0;

const _v = new THREE.Vector3();
const _c = new THREE.Color();
const NO_FLOOR: GroundQuery = { groundBelow: () => -1000 };

const rnd = (a: number): number => (Math.random() * 2 - 1) * a;

// ------------------------------------------------------------ поза

/** Поза карта на кадр: из снимка (чужие) или из своего состояния */
export interface KartPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  steer: number;
  /** KE_* */
  flags: number;
  /** Искры заноса 0–3 + 4 × уровень ускорения 0–4 + флаги KM_* (пузырь, трюк, пробуксовка) */
  misc: number;
}

export function makeKartPose(): KartPose {
  return { x: 0, y: 0, z: 0, yaw: 0, steer: 0, flags: 0, misc: 0 };
}

/** Поза из точного состояния (свой карт, предпросмотр): флаги — как в снимке сервера. */
export function poseFromState(s: KartState, on: boolean, painted: boolean, out: KartPose): KartPose {
  out.x = s.x;
  out.y = s.y;
  out.z = s.z;
  out.yaw = kartYaw(s);
  out.steer = s.steer;
  out.flags = kartFlags(s, on, painted);
  out.misc = kartMisc(s);
  return out;
}

/** Опора под точкой (RaceWorld.groundAt): для тени. loc — подсказка отрезка, у каждого карта своя. */
export interface KartGround {
  groundAt(x: number, z: number, loc: TrackLoc): number;
  /** Есть дорога с краем (у края — пыль; полуширина — в loc.hw); нет — без пыли у края */
  readonly roadHalf?: number;
}

// ------------------------------------------------------------ модель

interface Shared {
  front: THREE.BufferGeometry;
  rear: THREE.BufferGeometry;
  splat: THREE.Texture;
  shadowTex: THREE.Texture;
  shadowGeo: THREE.BufferGeometry;
  bubble: THREE.BufferGeometry;
}

let shared: Shared | null = null;

function res(): Shared {
  return (shared ??= {
    front: wheelGeometry(FRONT.r, FRONT.w),
    rear: wheelGeometry(REAR.r, REAR.w),
    splat: tex.splatAtlas(),
    shadowTex: tex.softDot('rgba(0,0,0,0.62)', 'rgba(0,0,0,0)'),
    shadowGeo: new THREE.PlaneGeometry(1.5, 2.1).rotateX(-Math.PI / 2),
    bubble: new THREE.SphereGeometry(1, 36, 22),
  });
}

/**
 * Мыльный пузырь: почти прозрачный в середине, к краю — радужная плёнка (оттенок бежит по высоте и времени) и блик
 * солнца. Без тумана и тонового отображения — как эффекты.
 */
function bubbleMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vY = position.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uAlpha;
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main() {
        vec3 n = normalize(vN);
        vec3 v = normalize(vV);
        float f = 1.0 - abs(dot(n, v));
        float rim = pow(f, 2.4);
        vec3 film = hue(f * 1.3 + vY * 0.45 + uTime * 0.22) * 0.7 + 0.3;
        float spec = pow(max(0.0, dot(reflect(-v, n), normalize(vec3(0.35, 0.9, 0.25)))), 48.0);
        float a = (0.06 + rim * 0.7) * uAlpha + spec * 0.85 * uAlpha;
        gl_FragColor = vec4(film * (0.55 + rim * 0.9) + spec, a);
      }`,
    transparent: true,
    depthWrite: false,
  });
}

/** Колесо (ось — X): шина, диск и по три спицы с обеих сторон — видно, что крутится. */
function wheelGeometry(r: number, w: number): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [
    paint(new THREE.CylinderGeometry(r, r, w, 20).rotateZ(Math.PI / 2), 0x1f1f22),
    paint(new THREE.CylinderGeometry(r * 0.6, r * 0.6, w + 0.012, 14).rotateZ(Math.PI / 2), 0xc4c8ce),
  ];
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      list.push(paint(new THREE.BoxGeometry(0.012, r * 1.1, 0.026).rotateX((k * Math.PI) / 3), 0x3a3e45).translate(sx * (w / 2 + 0.008), 0, 0));
    }
  }
  return mergeGeometries(list, false)!;
}

/** Корпус карта цвета color: рама, понтоны, нос-клин, бамперы, передняя панель, сиденье, мотор с глушителем. */
function bodyGeometry(color: number): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    list.push(paint(g, c).translate(x, y, z));
  };
  const frame = 0x2c2e33;
  const tube = 0x55595f;
  const seat = 0x1c1e22;
  const metal = 0xa3a8b0;
  const light = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.4).getHex();
  // рама: пол и оси
  box(0.8, 0.035, 1.36, 0, 0.075, -0.02, frame);
  box(0.96, 0.04, 0.05, 0, FRONT.r, FRONT.z, tube);
  box(1.04, 0.045, 0.06, 0, REAR.r, REAR.z, tube);
  // понтоны со светлой полосой сверху
  for (const s of [-1, 1]) {
    box(0.215, 0.17, 0.72, s * 0.468, 0.165, -0.06, color);
    box(0.22, 0.022, 0.7, s * 0.468, 0.258, -0.06, light);
  }
  // нос: клин, спереди ниже и уже
  const nose = new THREE.BoxGeometry(0.62, 0.2, 0.44);
  const p = nose.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) >= 0) continue;
    p.setX(i, p.getX(i) * 0.8);
    if (p.getY(i) > 0) p.setY(i, p.getY(i) - 0.12);
  }
  nose.computeVertexNormals();
  list.push(paint(nose, color).translate(0, 0.17, -0.64));
  // передний бампер — труба под носом
  box(0.7, 0.05, 0.05, 0, 0.11, -0.86, tube);
  // передняя панель (на ней номер) — верх наклонён к водителю; в неё уходит рулевая колонка
  box(0.36, 0.26, 0.025, 0, 0.36, -0.56, color, 0.35);
  // сиденье: подушка и спинка с наклоном назад
  box(0.5, 0.05, 0.62, 0, 0.105, 0.17, seat);
  box(0.5, 0.48, 0.06, 0, 0.38, 0.61, seat, 0.22);
  // мотор за сиденьем, глушитель справа
  box(0.32, 0.26, 0.2, 0.16, 0.3, 0.74, metal);
  box(0.36, 0.05, 0.24, 0.16, 0.45, 0.74, 0x6c7178);
  list.push(paint(new THREE.CylinderGeometry(0.065, 0.065, 0.24, 12).rotateX(Math.PI / 2), 0x9ea3aa).translate(EXHAUST.x, EXHAUST.y, EXHAUST.z - 0.13));
  // задний бампер
  box(1.2, 0.15, 0.13, 0, 0.17, 0.79, color);
  box(1.22, 0.022, 0.14, 0, 0.255, 0.79, light);
  return mergeGeometries(list, false)!;
}

/** Плоскость с одной из четырёх клякс атласа (2 × 2). */
function splatGeometry(w: number, h: number, variant: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute('uv');
  const ou = (variant % 2) * 0.5;
  const ov = Math.floor(variant / 2) * 0.5;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5 + ou, uv.getY(i) * 0.5 + ov);
  return g;
}

export class Kart3D {
  readonly id: number;
  readonly root = new THREE.Group();
  readonly avatar: Avatar;
  /** Скорость по кадрам, м/с (звук мотора, камера) */
  speed = 0;
  private readonly bodyNode = new THREE.Group();
  private readonly bodyGeo: THREE.BufferGeometry;
  private readonly numTex: THREE.Texture;
  private readonly wheels: THREE.Mesh[] = [];
  private readonly pivots: THREE.Group[] = [];
  private readonly wheelSpin = new THREE.Group();
  private readonly decals: THREE.Mesh[] = [];
  private readonly shadow: THREE.Mesh;
  private readonly shadowMat: THREE.MeshBasicMaterial;
  /** Материалы карта (кроме краски): у призрака — полупрозрачные */
  private readonly mats: THREE.MeshStandardMaterial[];
  private readonly loc: TrackLoc = makeLoc();
  private readonly wheelLoc: TrackLoc = makeLoc();
  private readonly pose: AvatarPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0 };
  private readonly vel = new THREE.Vector3();
  private readonly last = new THREE.Vector3();
  private hasPrev = false;
  /** Путь колёс, м (по нему крутятся) */
  private dist = 0;
  private pitch = 0;
  private roll = 0;
  private spinT = 0;
  private spinDir = 1;
  private wasSlow = false;
  private painted = false;
  private ghost = false;
  private wasBoost = false;
  private smokeAcc = 0;
  private sparkAcc = 0;
  private flareAcc = 0;
  private flameAcc = 0;
  private exhaustAcc = 0;
  private dustAcc = 0;
  /** Разгон по кадрам, м/с² (сглаженный): торможение — следы, старт с места — пыль */
  private accel = 0;
  /** Чередуем задние колёса для дымка и искр */
  private side = 0;
  /** Пузырь: сфера на карте, надут ли и сколько секунд надувается */
  private readonly bubble: THREE.Mesh;
  private readonly bubbleMat: THREE.ShaderMaterial;
  private bubbleOn = false;
  private bubbleT = 0;
  /** Трюк: сколько секунд ещё крутится и в какую сторону */
  private trickOn = false;
  private trickT = 0;
  private trickDir = 1;
  /** Подвеска: просадка корпуса, м, и её скорость; был ли на земле */
  private susp = 0;
  private suspV = 0;
  private wasGround = true;
  private sprayAcc = 0;
  private burnAcc = 0;

  /** id — номер в снимке, color — цвет корпуса, num — номер на панели */
  constructor(id: number, color: number, num: number) {
    this.id = id;
    const r = res();
    this.root.rotation.order = 'YXZ';

    const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.12 });
    const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
    this.numTex = tex.kartNumberTexture(num);
    const numMat = new THREE.MeshStandardMaterial({ map: this.numTex, alphaTest: 0.5, roughness: 0.5 });
    this.mats = [bodyMat, wheelMat, numMat];

    this.bodyGeo = bodyGeometry(color);
    const body = new THREE.Mesh(this.bodyGeo, bodyMat);
    body.receiveShadow = true;
    this.bodyNode.add(body);
    this.root.add(this.bodyNode);

    // колёса: передние — на шарнирах руля
    for (const [w, sx] of [[FRONT, -1], [FRONT, 1], [REAR, -1], [REAR, 1]] as const) {
      const m = new THREE.Mesh(w === FRONT ? r.front : r.rear, wheelMat);
      m.receiveShadow = true;
      if (w === FRONT) {
        const pivot = new THREE.Group();
        pivot.position.set(sx * w.x, w.r, w.z);
        pivot.add(m);
        this.pivots.push(pivot);
        this.root.add(pivot);
      } else {
        m.position.set(sx * w.x, w.r, w.z);
        this.root.add(m);
      }
      this.wheels.push(m);
    }

    // руль — в осях желейки (как её варежки): тот же масштаб, ступица, наклон и поворот обода
    const steer = new THREE.Group();
    steer.position.copy(SEAT);
    steer.scale.set(DRIVER_SCALE * DRIVE_SQUASH.xz, DRIVER_SCALE * DRIVE_SQUASH.y, DRIVER_SCALE * DRIVE_SQUASH.xz);
    const hub = new THREE.Group();
    hub.position.set(0, DRIVE_WHEEL.y, DRIVE_WHEEL.z);
    hub.rotation.x = -DRIVE_WHEEL.tilt;
    const wheelParts = [
      paint(new THREE.TorusGeometry(DRIVE_WHEEL.r, 0.03, 8, 28), 0x26282d),
      paint(new THREE.BoxGeometry(DRIVE_WHEEL.r * 2, 0.04, 0.025), 0x3a3d43),
      paint(new THREE.BoxGeometry(0.04, DRIVE_WHEEL.r, 0.025).translate(0, -DRIVE_WHEEL.r / 2, 0), 0x3a3d43),
      paint(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 14).rotateX(Math.PI / 2), color),
    ];
    this.wheelSpin.add(new THREE.Mesh(mergeGeometries(wheelParts, false)!, bodyMat));
    const column = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.028, 0.028, 0.34, 8).rotateX(Math.PI / 2).translate(0, 0, -0.17), 0x55595f), bodyMat);
    hub.add(this.wheelSpin, column);
    steer.add(hub);
    this.bodyNode.add(steer);

    // номер: на передней панели и на понтонах
    const front = new THREE.PlaneGeometry(0.2, 0.2).rotateY(Math.PI).rotateX(0.35).translate(0, 0.365, -0.576);
    this.bodyNode.add(new THREE.Mesh(front, numMat));
    for (const s of [-1, 1]) {
      const side = new THREE.PlaneGeometry(0.15, 0.15).rotateY((s * Math.PI) / 2).translate(s * 0.578, 0.168, -0.12);
      this.bodyNode.add(new THREE.Mesh(side, numMat));
    }

    // краска: кляксы на носу, понтонах, моторе и заднем бампере (видны, пока карт в краске; сзади — из погони)
    const paintMat = new THREE.MeshStandardMaterial({
      map: r.splat, color: PAINT_COLOR, transparent: true, depthWrite: false, roughness: 0.3,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    const noseSplat = splatGeometry(0.62, 0.62, 0).rotateX(-Math.PI / 2 - 0.266).translate(0, 0.226, -0.66);
    const sideL = splatGeometry(0.5, 0.36, 1).rotateY(-Math.PI / 2).translate(-0.579, 0.17, 0.12);
    const sideR = splatGeometry(0.5, 0.36, 2).rotateY(Math.PI / 2).translate(0.579, 0.17, -0.2);
    const podTop = splatGeometry(0.24, 0.5, 3).rotateX(-Math.PI / 2).translate(-0.468, 0.271, -0.12);
    const engineTop = splatGeometry(0.34, 0.26, 0).rotateX(-Math.PI / 2).translate(0.16, 0.477, 0.74);
    const rear = splatGeometry(0.5, 0.2, 2).translate(-0.24, 0.17, 0.857);
    for (const g of [noseSplat, sideL, sideR, podTop, engineTop, rear]) {
      const m = new THREE.Mesh(g, paintMat);
      m.visible = false;
      m.renderOrder = 2;
      this.decals.push(m);
      this.bodyNode.add(m);
    }

    this.shadowMat = new THREE.MeshBasicMaterial({
      map: r.shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    });
    this.shadow = new THREE.Mesh(r.shadowGeo, this.shadowMat);
    this.shadow.renderOrder = 1;
    this.shadow.visible = false;

    this.bubbleMat = bubbleMaterial();
    this.bubble = new THREE.Mesh(r.bubble, this.bubbleMat);
    this.bubble.position.set(0, BUBBLE_Y, 0);
    this.bubble.renderOrder = 5;
    this.bubble.visible = false;
    this.root.add(this.bubble);
    this.trickDir = id % 2 === 0 ? 1 : -1;

    this.avatar = new Avatar(id);
    this.avatar.driving = true;
    this.avatar.root.scale.setScalar(DRIVER_SCALE);
    this.avatar.root.rotation.order = 'YXZ';
    this.root.visible = false;
  }

  /** Водитель: ник (табличка над головой) и наряд желейки. */
  setDriver(name: string, outfit: Outfit, level = 1): void {
    this.avatar.setOutfit(outfit);
    this.avatar.setInfo(name, null, false, level);
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.root, this.shadow);
    this.avatar.addTo(scene);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root, this.shadow);
    this.avatar.dispose(scene);
    this.bodyGeo.dispose();
    this.numTex.dispose();
    for (const m of this.mats) m.dispose();
    (this.decals[0].material as THREE.Material).dispose();
    this.shadowMat.dispose();
    this.bubbleMat.dispose();
  }

  /**
   * Кадр. p — поза (null или без KE_ON — карт спрятан), ground — опора для тени,
   * fx — эффекты (null — без них), local — свой карт (над ним нет таблички).
   */
  update(p: KartPose | null, dt: number, time: number, ground: KartGround, fx: KartFx | null, camPos: THREE.Vector3, local: boolean): void {
    const on = p !== null && (p.flags & KE_ON) !== 0;
    this.root.visible = on;
    if (!p || !on) {
      this.shadow.visible = false;
      this.avatar.update(null, dt, time, NO_FLOOR, camPos, local);
      this.hasPrev = false;
      this.bubbleOn = false;
      this.bubble.visible = false;
      this.trickT = 0;
      if (fx) this.liftSkids(fx);
      return;
    }
    // скорость по кадрам; скачок (возврат на трассу) — с нуля
    if (this.hasPrev && dt > 0) {
      const vx = (p.x - this.last.x) / dt;
      const vy = (p.y - this.last.y) / dt;
      const vz = (p.z - this.last.z) / dt;
      if (vx * vx + vz * vz > 50 * 50) this.vel.set(0, 0, 0);
      else this.vel.lerp(_v.set(vx, vy, vz), Math.min(1, dt * 14));
    } else {
      this.vel.set(0, 0, 0);
    }
    this.last.set(p.x, p.y, p.z);
    this.hasPrev = true;

    const f = p.flags;
    const grounded = (f & KE_GROUND) !== 0;
    const drift = (f & KE_DRIFT) !== 0;
    const hx = -Math.sin(p.yaw);
    const hz = -Math.cos(p.yaw);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (dt > 0) this.accel += ((hs - this.speed) / dt - this.accel) * Math.min(1, dt * 12);
    this.speed = hs;

    // банка — один оборот на месте; краска — кляксы; призрак — полупрозрачный и мигает
    const slow = (f & KE_SLOW) !== 0;
    if (slow && !this.wasSlow) {
      this.spinT = SPIN_S;
      this.spinDir = p.steer > 0 ? 1 : -1;
    }
    this.wasSlow = slow;
    this.setPainted((f & KE_PAINT) !== 0);
    this.setGhost((f & KE_GHOST) !== 0, time);
    let spin = 0;
    if (this.spinT > 0) {
      this.spinT = Math.max(0, this.spinT - dt);
      const k = 1 - this.spinT / SPIN_S;
      spin = this.spinDir * Math.PI * 2 * (1 - (1 - k) * (1 - k));
    }
    const yaw = p.yaw + spin;

    // тангаж — по вертикальной скорости (подъём на трамплин, полёт), крен — по рулю.
    // Делитель не меньше 12 м/с: подскок с места чуть качает карт, а не ставит его на дыбы.
    const pitchT = THREE.MathUtils.clamp(Math.atan2(this.vel.y, Math.max(hs, 12)), -MAX_PITCH, MAX_PITCH);
    this.pitch += (pitchT - this.pitch) * Math.min(1, dt * 9);
    const rollT = grounded ? -p.steer * ROLL * Math.min(1, hs / 18) * (drift ? 1.8 : 1) : 0;
    this.roll += (rollT - this.roll) * Math.min(1, dt * 6);
    // трюк: бочка вокруг продольной оси (плавно разгоняется и тормозит)
    const trick = (p.misc & KM_TRICK) !== 0;
    if (trick && !this.trickOn) this.trickT = TRICK_S;
    this.trickOn = trick;
    let flip = 0;
    if (this.trickT > 0) {
      this.trickT = Math.max(0, this.trickT - dt);
      const k = 1 - this.trickT / TRICK_S;
      flip = this.trickDir * Math.PI * 2 * k * k * (3 - 2 * k);
    }
    // подвеска: на приземлении корпус проседает и пружинит
    if (grounded && !this.wasGround) this.suspV -= Math.min(1.5, Math.max(0, -this.vel.y) * 0.16 + 0.15);
    this.wasGround = grounded;
    this.suspV += (-SUSP_K * this.susp - SUSP_C * this.suspV) * Math.min(dt, 0.05);
    this.susp += this.suspV * Math.min(dt, 0.05);
    if (this.susp < -0.12) this.susp = -0.12;

    const root = this.root;
    root.position.set(p.x, p.y + RIDE_Y, p.z);
    root.rotation.set(this.pitch, yaw, this.roll + flip);
    // мотор потряхивает корпус; пружина подвески
    this.bodyNode.position.y = Math.sin(time * 52 + this.id * 2.1) * 0.004 + this.susp;
    root.updateMatrixWorld(true);

    // пузырь: надувается с перелётом, слегка дышит; пропал — лопается брызгами
    const bubble = (p.misc & KM_BUBBLE) !== 0;
    if (bubble && !this.bubbleOn) this.bubbleT = 0;
    if (!bubble && this.bubbleOn && fx) {
      _v.set(0, BUBBLE_Y, 0).applyMatrix4(root.matrixWorld);
      fx.bubblePop(_v.x, _v.y, _v.z);
    }
    this.bubbleOn = bubble;
    this.bubble.visible = bubble;
    if (bubble) {
      this.bubbleT += dt;
      const g = Math.min(1, this.bubbleT / BUBBLE_GROW_S);
      const over = 1 + Math.sin(g * Math.PI) * 0.18;
      const breath = 1 + Math.sin(time * 5.3 + this.id) * 0.025;
      this.bubble.scale.set(BUBBLE_R * g * over * breath, BUBBLE_R * g * over / breath, BUBBLE_R * g * over * breath);
      this.bubbleMat.uniforms.uTime.value = time + this.id * 1.7;
      this.bubbleMat.uniforms.uAlpha.value = g;
    }

    // колёса крутятся по пройденному пути (буксуют — быстро), передние поворачивают; руль — вслед
    this.dist = (this.dist + (this.vel.x * hx + this.vel.z * hz) * dt + ((p.misc & KM_BURN) !== 0 ? 9 * dt : 0)) % 1000;
    for (let k = 0; k < 4; k++) this.wheels[k].rotation.x = -this.dist / (k < 2 ? FRONT.r : REAR.r);
    for (const pv of this.pivots) pv.rotation.y = p.steer * WHEEL_STEER;
    this.wheelSpin.rotation.z = p.steer * DRIVE_TURN;

    // водитель на сиденье: тот же курс, наклон карта поверх
    _v.copy(SEAT).applyMatrix4(root.matrixWorld);
    const pose = this.pose;
    pose.x = _v.x;
    pose.y = _v.y + this.susp;
    pose.z = _v.z;
    pose.yaw = yaw;
    pose.flags = E_ALIVE | (grounded ? E_GROUNDED : 0);
    const av = this.avatar;
    av.steer = p.steer;
    av.hidden = this.ghost && Math.floor(time * 8) % 2 === 1;
    av.update(pose, dt, time, NO_FLOOR, camPos, local);
    av.root.rotation.x = this.pitch;
    av.root.rotation.z = this.roll + flip;

    // тень на опоре: выше — бледнее и шире
    const g = ground.groundAt(p.x, p.z, this.loc);
    const h = p.y - g;
    const sh = this.shadow;
    if (h > -0.5 && h < SHADOW_H) {
      const k = 1 - Math.max(0, h) / SHADOW_H;
      sh.visible = true;
      sh.position.set(p.x, g + 0.03, p.z);
      sh.rotation.y = yaw;
      sh.scale.setScalar(1 + (1 - k) * 0.6);
      this.shadowMat.opacity = k * (this.ghost ? 0.45 : 1);
    } else {
      sh.visible = false;
    }

    if (fx) {
      this.emit(p, dt, fx, grounded, drift, hx, hz, hs);
      this.wheelTrails(p, dt, fx, ground, grounded, drift, hx, hz, hs);
      this.spray(p, dt, fx, grounded, hx, hz, hs);
    }
  }

  /** Песок или трава из-под задних колёс на обочине; дым пробуксовки на старте. */
  private spray(p: KartPose, dt: number, fx: KartFx, grounded: boolean, hx: number, hz: number, hs: number): void {
    const m = this.root.matrixWorld;
    const surf = this.loc.surf;
    if (grounded && hs > 4 && (surf === SURF_SAND || surf === SURF_GRASS)) {
      const sand = surf === SURF_SAND;
      this.sprayAcc += dt * SPRAY_RATE * Math.min(1.5, hs / 12);
      while (this.sprayAcc >= 1) {
        this.sprayAcc -= 1;
        this.side ^= 1;
        _v.set(this.side ? REAR.x : -REAR.x, 0.08, REAR.z + 0.1).applyMatrix4(m);
        const up = sand ? 1.6 + Math.random() * 2.2 : 1.2 + Math.random() * 1.6;
        fx.grit(_v.x, _v.y, _v.z, this.vel.x * 0.25 - hx * 2.5 + rnd(1.4), up, this.vel.z * 0.25 - hz * 2.5 + rnd(1.4), sand ? SAND_COLOR : GRASS_COLOR);
        if (sand && Math.random() < 0.45) {
          fx.puff(_v.x, _v.y, _v.z, this.vel.x * 0.15 - hx + rnd(0.8), 0.6, this.vel.z * 0.15 - hz + rnd(0.8), 0xe9d7a8, 0.42, 0.7, 2, 0.9);
        }
      }
    } else this.sprayAcc = 0;
    if ((p.misc & KM_BURN) !== 0) {
      this.burnAcc += dt * BURN_RATE;
      while (this.burnAcc >= 1) {
        this.burnAcc -= 1;
        this.side ^= 1;
        _v.set(this.side ? REAR.x : -REAR.x, 0.05, REAR.z + 0.15).applyMatrix4(m);
        fx.puff(_v.x, _v.y + 0.1, _v.z, -hx * 1.5 + rnd(0.8), 0.6 + Math.random() * 0.6, -hz * 1.5 + rnd(0.8), 0xd8d4cc, 0.55, 0.7, 2.4, 0.8 + Math.random() * 0.4);
      }
    } else this.burnAcc = 0;
  }

  /**
   * Следы шин и пыль из-под задних колёс. След — в заносе, при резком торможении и в боковом скольжении, только
   * где колесо на той же опоре, что и карт (не над водой и не с трамплина). Пыль — трогается с места, у края
   * дороги (со стороны края) и немного на скорости.
   */
  private wheelTrails(p: KartPose, dt: number, fx: KartFx, ground: KartGround, grounded: boolean, drift: boolean, hx: number, hz: number, hs: number): void {
    const m = this.root.matrixWorld;
    // вбок: + — вправо по носу
    const slip = Math.abs(-this.vel.x * hz + this.vel.z * hx);
    const a = !grounded || hs < 4 ? 0 : drift ? SKID_DRIFT_A : this.accel < -SKID_DECEL ? SKID_BRAKE_A : slip > SKID_SLIP ? Math.min(0.45, 0.15 + slip * 0.05) : 0;
    for (let k = 0; k < 2; k++) {
      const key = this.id * 2 + k;
      if (a === 0) {
        fx.skids.lift(key);
        continue;
      }
      _v.set(k ? REAR.x : -REAR.x, 0, REAR.z).applyMatrix4(m);
      const g = ground.groundAt(_v.x, _v.z, this.wheelLoc);
      if (Math.abs(g - p.y) > 0.35) fx.skids.lift(key);
      else fx.skids.mark(key, _v.x, g + RIDE_Y + 0.012, _v.z, a);
    }

    // у края: loc — от тени (центр карта), lat + — вправо; у стены центр карта не ближе KART_R к краю
    const edge = ground.roadHalf === undefined ? -Infinity : Math.abs(this.loc.lat) + KART_R - this.loc.hw;
    let rate = 0;
    let alpha = 0;
    let only = -1;
    if (grounded && hs < 7 && this.accel > 4) {
      rate = DUST_START;
      alpha = 0.55;
    } else if (grounded && hs > 5 && edge > -0.3) {
      rate = DUST_EDGE;
      alpha = 0.45;
      only = this.loc.lat > 0 ? 1 : 0;
    } else if (grounded && hs > 17) {
      rate = DUST_FAST;
      alpha = 0.18;
    }
    if (rate === 0) {
      this.dustAcc = 0;
      return;
    }
    this.dustAcc += dt * rate;
    while (this.dustAcc >= 1) {
      this.dustAcc -= 1;
      this.side ^= 1;
      const k = only >= 0 ? only : this.side;
      _v.set(k ? REAR.x : -REAR.x, 0.06, REAR.z + 0.1).applyMatrix4(m);
      fx.puff(
        _v.x, _v.y, _v.z, this.vel.x * 0.2 - hx * 1.2 + rnd(1), 0.3 + Math.random() * 0.5, this.vel.z * 0.2 - hz * 1.2 + rnd(1),
        DUST_COLOR, alpha, 0.6, 2.2, 1 + Math.random() * 0.6,
      );
    }
  }

  private liftSkids(fx: KartFx): void {
    fx.skids.lift(this.id * 2);
    fx.skids.lift(this.id * 2 + 1);
  }

  private setPainted(on: boolean): void {
    if (on === this.painted) return;
    this.painted = on;
    for (const d of this.decals) d.visible = on;
  }

  private setGhost(on: boolean, time: number): void {
    if (on !== this.ghost) {
      this.ghost = on;
      for (const m of this.mats) {
        m.transparent = on;
        m.depthWrite = !on;
        m.opacity = 1;
        m.needsUpdate = true;
      }
    }
    if (on) {
      const a = 0.38 + Math.sin(time * 18) * 0.12;
      for (const m of this.mats) m.opacity = a;
    }
  }

  /** Искры и дымок заноса, пламя турбо, дымок мотора. */
  private emit(p: KartPose, dt: number, fx: KartFx, grounded: boolean, drift: boolean, hx: number, hz: number, hs: number): void {
    const m = this.root.matrixWorld;
    const vx = this.vel.x;
    const vz = this.vel.z;
    if (drift && grounded && hs > 3) {
      this.smokeAcc += dt * SMOKE_RATE;
      while (this.smokeAcc >= 1) {
        this.smokeAcc -= 1;
        this.side ^= 1;
        _v.set(this.side ? REAR.x : -REAR.x, 0.05, REAR.z + 0.08).applyMatrix4(m);
        fx.puff(_v.x, _v.y + 0.12, _v.z, vx * 0.25 + rnd(0.8), 0.5 + Math.random() * 0.6, vz * 0.25 + rnd(0.8), 0xe8e4dc, 0.34, 0.55, 1.6, 0.6 + Math.random() * 0.4);
      }
      const spark = p.misc & KM_SPARK;
      if (spark > 0) {
        // искры летят назад и наружу — туда, куда выносит зад карта
        const so = (p.flags & KE_DRIFT_R) !== 0 ? -1 : 1;
        const ox = -hz * so;
        const oz = hx * so;
        const color = SPARK_COLORS[spark];
        this.flareAcc += dt * FLARE_RATE;
        while (this.flareAcc >= 1) {
          this.flareAcc -= 1;
          for (const sx of [-1, 1]) {
            _v.set(sx * REAR.x, 0.07, REAR.z + 0.12).applyMatrix4(m);
            fx.glow(_v.x, _v.y, _v.z, vx, 0, vz, color, 0.5 + Math.random() * 0.2, 0.07, 0, 0);
          }
        }
        this.sparkAcc += dt * SPARK_RATE;
        while (this.sparkAcc >= 1) {
          this.sparkAcc -= 1;
          this.side ^= 1;
          _v.set(this.side ? REAR.x : -REAR.x, 0.03, REAR.z + 0.1).applyMatrix4(m);
          const back = 2 + Math.random() * 4;
          const out = 1 + Math.random() * 2;
          fx.glow(
            _v.x, _v.y, _v.z,
            vx * 0.7 - hx * back + ox * out + rnd(1), 1.5 + Math.random() * 3, vz * 0.7 - hz * back + oz * out + rnd(1),
            color, 0.15 + Math.random() * 0.08, 0.2 + Math.random() * 0.25, 9, 1,
          );
        }
      } else {
        this.sparkAcc = 0;
        this.flareAcc = 0;
      }
    } else {
      this.smokeAcc = 0;
      this.sparkAcc = 0;
      this.flareAcc = 0;
    }

    const boost = (p.flags & KE_BOOST) !== 0;
    const lvl = Math.min(BOOST_TURBO, miscBoost(p.misc));
    if (boost && lvl > 0) {
      const big = lvl >= 3;
      // в момент включения — вспышка
      this.flameAcc += (this.wasBoost ? 0 : 10) + dt * FLAME_RATE * (big ? 1.5 : 1);
      while (this.flameAcc >= 1) {
        this.flameAcc -= 1;
        _v.copy(EXHAUST).applyMatrix4(m);
        const sp = 3 + Math.random() * 3;
        fx.glow(
          _v.x, _v.y, _v.z, vx * 0.85 - hx * sp + rnd(0.5), 0.3 + rnd(0.5), vz * 0.85 - hz * sp + rnd(0.5),
          FLAME_COLORS[lvl], big ? 0.55 : 0.4, big ? 0.22 : 0.15, -1.5, 5,
        );
      }
    } else {
      this.flameAcc = 0;
      this.exhaustAcc += dt * EXHAUST_RATE;
      if (this.exhaustAcc >= 1) {
        this.exhaustAcc -= 1;
        _v.copy(EXHAUST).applyMatrix4(m);
        fx.puff(_v.x, _v.y, _v.z, vx * 0.6 - hx * 0.8, 0.4, vz * 0.6 - hz * 0.8, 0x8f8a84, 0.16, 0.25, 2.5, 0.9);
      }
    }
    this.wasBoost = boost;
  }
}

// ------------------------------------------------------------ частицы

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  a: number;
  size: number;
  grow: number;
  grav: number;
  drag: number;
  life: number;
  max: number;
}

/**
 * Облако частиц: точки с мягким пятном, у каждой свой размер (растёт к концу жизни), тяжесть и сопротивление.
 * Прозрачность — в цвете вершины. additive — складываются по яркости (искры, пламя) и гаснут; иначе — дымок:
 * быстро проявляется и тает.
 */
class Cloud {
  private readonly ps: Particle[] = [];
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly additive: boolean;
  private next = 0;
  private alive = 0;

  constructor(scene: THREE.Scene, max: number, map: THREE.Texture, additive: boolean, order: number) {
    this.additive = additive;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({
      size: 1, sizeAttenuation: true, map, vertexColors: true, transparent: true, depthWrite: false, fog: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !additive,
    });
    // свой размер у каждой точки
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float aSize;\n' + sh.vertexShader.replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
    };
    mat.customProgramCacheKey = () => 'kart-fx-size';
    const points = new THREE.Points(this.geo, mat);
    points.frustumCulled = false;
    points.renderOrder = order;
    scene.add(points);
    for (let i = 0; i < max; i++) {
      this.ps.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0, g: 0, b: 0, a: 0, size: 0, grow: 0, grav: 0, drag: 0, life: 0, max: 1 });
      this.pos[i * 3 + 1] = -1000;
    }
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, alpha: number, size: number, grow: number, life: number, grav: number, drag: number): void {
    const p = this.ps[this.next];
    this.next = (this.next + 1) % this.ps.length;
    _c.set(color);
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.r = _c.r;
    p.g = _c.g;
    p.b = _c.b;
    p.a = alpha;
    p.size = size;
    p.grow = grow;
    p.grav = grav;
    p.drag = drag;
    p.life = life;
    p.max = life;
    this.alive++;
  }

  update(dt: number): void {
    if (this.alive === 0) return;
    let alive = 0;
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i];
      const o = i * 3;
      const q = i * 4;
      if (p.life <= 0) {
        if (this.col[q + 3] !== 0) {
          this.col[q + 3] = 0;
          this.pos[o + 1] = -1000;
        }
        continue;
      }
      p.life -= dt;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vy = p.vy * drag - p.grav * dt;
      p.vz *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const k = Math.max(0, p.life / p.max);
      // искры к концу мерцают; дымок проявляется за первую восьмую жизни
      const a = this.additive ? Math.min(1, k * 1.8) * (k < 0.3 ? 0.5 + Math.random() * 0.5 : 1) : Math.min(1, (1 - k) * 8) * k;
      this.pos[o] = p.x;
      this.pos[o + 1] = p.y;
      this.pos[o + 2] = p.z;
      this.col[q] = p.r;
      this.col[q + 1] = p.g;
      this.col[q + 2] = p.b;
      this.col[q + 3] = a * p.a;
      this.size[i] = p.size * (1 + p.grow * (1 - k));
      alive++;
    }
    this.alive = alive;
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** Эффекты гонки: одно яркое облако и одно мягкое на всю сцену, следы шин. */
export class KartFx {
  readonly skids: SkidMarks;
  private readonly bright: Cloud;
  private readonly soft: Cloud;

  constructor(scene: THREE.Scene) {
    this.skids = new SkidMarks(scene);
    this.soft = new Cloud(scene, 1000, tex.softDot('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'), false, 3);
    this.bright = new Cloud(scene, 1200, glowTexture(), true, 4);
  }

  /** Новый заезд: старые следы шин долой */
  clear(): void {
    this.skids.clear();
  }

  /** Яркая точка (искра, язык пламени): размер, жизнь, тяжесть, сопротивление воздуха */
  glow(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, size: number, life: number, grav = 0, drag = 1): void {
    this.bright.emit(x, y, z, vx, vy, vz, color, 1, size, -0.5, life, grav, drag);
  }

  /** Облачко: прозрачность, размер, во сколько раз вырастет к концу, жизнь */
  puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, alpha: number, size: number, grow: number, life: number, grav = -0.6, drag = 2.2): void {
    this.soft.emit(x, y, z, vx, vy, vz, color, alpha, size, grow, life, grav, drag);
  }

  /** Брызги и крошки: мелкие, падают */
  private bits(x: number, y: number, z: number, n: number, color: number, speed: number, up: number, size: number): void {
    for (let i = 0; i < n; i++) {
      this.soft.emit(x, y, z, rnd(speed), up * (0.5 + Math.random()), rnd(speed), color, 0.95, size * (0.6 + Math.random() * 0.8), 0, 0.5 + Math.random() * 0.5, 14, 0.5);
    }
  }

  /** Удар о стену: веер искр от точки удара (n — от стены к карту), strength — скорость удара, м/с */
  wallHit(x: number, y: number, z: number, nx: number, nz: number, strength: number): void {
    const n = Math.min(32, 6 + Math.round(strength * 2));
    for (let i = 0; i < n; i++) {
      const sp = 2 + Math.random() * (2 + strength * 0.4);
      this.glow(x, y, z, nx * sp + rnd(2.5), 1 + Math.random() * 3, nz * sp + rnd(2.5), 0xffd9a0, 0.12, 0.25 + Math.random() * 0.3, 9, 1);
    }
    this.puff(x, y, z, nx, 0.6, nz, 0xcfc8bd, 0.35, 0.7, 1.4, 0.8);
  }

  /** Брызги из-под колёс на луже: вода — светлые капли и дымка, масло — тёмный дымок и чёрные брызги */
  slick(x: number, y: number, z: number, vx: number, vz: number, oil: boolean): void {
    const color = oil ? 0x1b1b21 : 0xe2f3ff;
    for (let i = 0; i < 3; i++) {
      this.soft.emit(x + rnd(0.6), y + 0.1, z + rnd(0.6), vx * 0.15 + rnd(1.6), 0.8 + Math.random() * 1.4, vz * 0.15 + rnd(1.6), color, oil ? 0.6 : 0.9, 0.26, 0.2, 0.45 + Math.random() * 0.3, 11, 1.1);
    }
    this.puff(x, y + 0.2, z, vx * 0.1, 0.5, vz * 0.1, oil ? 0x3a3a42 : 0xf4fbff, oil ? 0.4 : 0.35, 0.8, 1.6, 0.7);
  }

  /** Пыль из-под колёс (приземление, вылет за край) */
  dust(x: number, y: number, z: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.puff(x + rnd(0.8), y + 0.1, z + rnd(0.8), rnd(1.6), 0.4 + Math.random() * 0.6, rnd(1.6), 0xd9d2c4, 0.42, 0.8, 1.5, 0.8 + Math.random() * 0.4);
    }
  }

  /** Плюх в воду: столб брызг и белая пена */
  splash(x: number, z: number): void {
    this.bits(x, WATER_Y + 0.1, z, 46, 0xe6f6ff, 3.2, 7, 0.22);
    for (let i = 0; i < 6; i++) this.puff(x + rnd(0.8), WATER_Y + 0.2, z + rnd(0.8), rnd(1), 1 + Math.random(), rnd(1), 0xffffff, 0.55, 1.2, 1.3, 1.1);
  }

  /** Ящик разбит: щепки и золотые искры */
  cratePop(x: number, y: number, z: number): void {
    this.bits(x, y, z, 16, 0xb07a45, 3, 4, 0.16);
    for (let i = 0; i < 18; i++) this.glow(x, y, z, rnd(4), 1 + Math.random() * 3, rnd(4), 0xffd66a, 0.2, 0.45 + Math.random() * 0.3, 4, 2);
  }

  /** Наезд на банку: варенье и осколки */
  jamSplat(x: number, y: number, z: number): void {
    this.bits(x, y + 0.3, z, 22, 0xb3122e, 3, 5, 0.2);
    for (let i = 0; i < 8; i++) this.glow(x, y + 0.3, z, rnd(3), 1 + Math.random() * 2, rnd(3), 0xdff3ff, 0.1, 0.4, 9, 1);
  }

  /** Клякса краски прилетела */
  paintSplat(x: number, y: number, z: number): void {
    this.bits(x, y, z, 26, PAINT_COLOR, 3.5, 4, 0.2);
  }

  /** Песчинка или травинка из-под колеса: летит вверх-назад и падает */
  grit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number): void {
    this.soft.emit(x, y, z, vx, vy, vz, color, 0.95, 0.12 + Math.random() * 0.1, 0, 0.45 + Math.random() * 0.35, 12, 0.6);
  }

  /** Пузырь лопнул: радужные капли во все стороны и вспышка */
  bubblePop(x: number, y: number, z: number): void {
    const colors = [0x9fe8ff, 0xffc1f3, 0xfff3a8, 0xb9ffd0];
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const sp = 3 + Math.random() * 3;
      const cx = Math.cos(a) * Math.cos(b);
      const cz = Math.sin(a) * Math.cos(b);
      this.glow(x + cx * 1.2, y + Math.sin(b) * 1.2, z + cz * 1.2, cx * sp, Math.sin(b) * sp + 1.5, cz * sp, colors[i % colors.length], 0.16, 0.45 + Math.random() * 0.25, 6, 1.4);
    }
    this.puff(x, y, z, 0, 0.4, 0, 0xffffff, 0.35, 2.2, 1.2, 0.35, 0, 3);
  }

  /** Конфетти: разноцветные кусочки фонтаном (финиш, хлопок) */
  confetti(x: number, y: number, z: number, n: number, speed: number): void {
    const colors = [0xff4f6d, 0xffd23f, 0x3fc1ff, 0x5fe08a, 0xc77dff, 0xff9a2e];
    for (let i = 0; i < n; i++) {
      this.soft.emit(
        x + rnd(0.5), y, z + rnd(0.5), rnd(speed), speed * (0.6 + Math.random() * 0.8), rnd(speed), colors[i % colors.length], 1,
        0.16 + Math.random() * 0.1, 0, 1.4 + Math.random() * 0.8, 5, 1.6,
      );
    }
  }

  update(dt: number): void {
    this.skids.update(dt);
    this.soft.update(dt);
    this.bright.update(dt);
  }
}
