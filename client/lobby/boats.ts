// Лодки у набережной. У южного причала стоит катер «Ласточка»: качается на волне, швартовы то провисают, то
// натягиваются, кранцы у стенки, мотор поднят. На нём катаются (shared/boat.ts): в поездке он идёт по общему с сервером
// пути — по тем же часам отрисовки, что и пассажиры, — с опущенным мотором и пенным следом, кренится в поворотах.
// Изредка через залив проходит рыбацкая лодка — тоже со следом; моторы слышно (сцена берёт motor() и launchMotor()).
// Твёрдость катера — невидимые боксы карты (shared/maps/lobby.ts); проходящая лодка — только на экране.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOAT_SEAT_AT, BOAT_SIT_LIFT, LAUNCH, ridePose, type BoatPose } from '../../shared/boat.ts';
import { TICK_RATE, WATER_Y } from '../../shared/constants.ts';
import { makeBoat, mergeColored, paint, place, type V3 } from '../render/kit.ts';

/** Мотор катера: поднят у причала, опущен в поездке (поворот вокруг крепления на транце), с за сколько поворачивается */
const MOTOR_UP = -1.1;
const MOTOR_TILT_S = 1.6;
/** Швартовы: тумба (шейка), где канат ложится на край причала; нос — к восточной тумбе, корма — к западной */
const MOORING: ReadonlyArray<{ post: V3; edge: V3 }> = [
  { post: [12, 0.38, 21.2], edge: [11.62, 0.235, 22.02] },
  { post: [4, 0.38, 21.2], edge: [4.42, 0.235, 22.02] },
];
/** Корпус: корма (транец) на +Z, нос на −Z, полуширина, сечений по длине */
const STERN_Z = 3.0;
const BOW_Z = -3.4;
const HALF_B = 1.15;
/** Нос и корма катера от середины, м (для следа и мотора) */
const LAUNCH_BOW = -BOW_Z;
const LAUNCH_STERN = STERN_Z;
const SECTIONS = 28;
/** Пол кокпита над водой и докуда он идёт (доля длины от кормы), дальше — носовая палуба */
const FLOOR_Y = 0.3;
const FOREDECK_T = 0.62;
const WHITE = 0xf4f2ec;
const NAVY = 0x2c4f86;
const STEEL = 0xc9cfd4;
const DARK = 0x2b2f33;
const TEAK = 0xa8784a;

/** Проходящая лодка: пауза между проходами, с; скорость у набережной и вдали (дальше 800 м), м/с; цвета корпуса */
const PASS_GAP: readonly [number, number] = [60, 150];
const PASS_FIRST: readonly [number, number] = [15, 45];
const PASS_SPEED = 5;
const PASS_FAR_SPEED = 12.5;
const PASS_COLORS = [0xe8e2d4, 0x5d8fb0, 0x6e9a62, 0xd9b44a];
/**
 * Пути через залив (x, z): с запада мимо сухогруза и маяка, вокруг восточного мыса — вдоль дальнего берега на восток;
 * с севера вдоль берега за набережной — мимо мыса с маячком на запад, в открытое море. Идут в обе стороны; концы —
 * в 1400 м, где море уже растворилось в дымке (туман набережной — до 1400 м), так что лодка не «выскакивает».
 * Второй путь обходит полосу аквапарка с запада (полоса — до x ≈ −96).
 */
const PASS_ROUTES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // южнее трассы регаты (она в бухте к востоку от x ≈ 18, z до ≈ 127)
  [[-1400, 160], [-1000, 115], [-640, 98], [-470, 100], [-320, 92], [-150, 80], [-50, 70], [-25, 130], [30, 165], [120, 200], [200, 320],
    [300, 470], [560, 480], [950, 420], [1350, 380]],
  [[-130, -1400], [-118, -1000], [-110, -700], [-106, -480], [-108, -220], [-112, -90], [-116, 0], [-116, 70], [-140, 170], [-200, 300],
    [-260, 420], [-420, 470], [-750, 480], [-1100, 520], [-1350, 560]],
];
/** Лодка (makeBoat): нос и корма от середины, м */
const PASS_BOW = 4;
const PASS_STERN = 3;

/** След: точек истории, через сколько секунд новая, сколько живут волны от носа и пена от винта */
const WAKE_N = 72;
const WAKE_STEP = 0.16;
const WAKE_LIFE = 11;
const FOAM_LIFE = 5;
/** Волны от носа расходятся под углом Кельвина (~19,5°): вбок на столько метров за метр пути */
const KELVIN = 0.354;

export class Boats {
  private readonly launch: THREE.Group;
  private readonly launchMotorMesh: THREE.Object3D;
  private readonly fenders: THREE.Object3D;
  private readonly cleats: THREE.Object3D[];
  private readonly ropes: Rope[];
  private readonly passer: Passer;
  private readonly launchWake: Wake;
  private readonly tmp = new THREE.Vector3();
  /** Поездка катера: идёт ли и с какого тика сервера (shared/boat.ts) */
  private riding = false;
  private rideAt = 0;
  private readonly pose: BoatPose = { x: LAUNCH.x, z: LAUNCH.z, yaw: LAUNCH.yaw };
  private readonly ahead: BoatPose = { x: 0, z: 0, yaw: 0 };
  /** Скорость катера, м/с (для звука мотора) */
  private speed = 0;
  private readonly motorPos = new THREE.Vector3();
  /** Насколько катер на экране сдвинут от своего места по пути (качка): на столько же двигаем пассажиров */
  readonly launchOffset = new THREE.Vector3();

  /** wet — материал мокнет в дождь (настил и корпус катера) */
  constructor(scene: THREE.Scene, wet: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial) {
    const l = buildLaunch(wet);
    this.launch = l.group;
    this.launchMotorMesh = l.motor;
    this.fenders = l.fenders;
    this.cleats = l.cleats;
    this.launch.position.set(LAUNCH.x, WATER_Y, LAUNCH.z);
    this.launch.rotation.order = 'YXZ';
    this.launch.rotation.y = LAUNCH.yaw;
    scene.add(this.launch);
    this.launch.updateMatrixWorld(true);
    this.ropes = MOORING.map((m, i) => new Rope(scene, m.post, m.edge, this.cleats[i].getWorldPosition(this.tmp)));
    this.passer = new Passer(scene);
    this.launchWake = new Wake(scene, LAUNCH_BOW, LAUNCH_STERN, 4.3);
  }

  /** Где мотор проходящей лодки (null — никто не идёт). */
  motor(): THREE.Vector3 | null {
    return this.passer.active ? this.passer.motor : null;
  }

  /** Мотор катера в поездке и его ход, м/с (null — стоит у причала). */
  launchMotor(): { pos: THREE.Vector3; speed: number } | null {
    return this.riding ? { pos: this.motorPos, speed: this.speed } : null;
  }

  /** Поездка катера по статусу с сервера: идёт (с тика at) или катер у причала. */
  setRide(riding: boolean, at: number): void {
    if (riding && !this.riding) this.launchWake.clear();
    this.riding = riding;
    this.rideAt = at;
  }

  /** Куда смотрит нос катера на экране сейчас (по пути, без качки). */
  get launchYaw(): number {
    return this.riding ? this.pose.yaw : LAUNCH.yaw;
  }

  /** renderTick — часы отрисовки (тики сервера): по ним катер стоит там же, где на экране его пассажиры. */
  update(dt: number, t: number, renderTick: number): void {
    const b = this.launch;
    const p = this.pose;
    if (this.riding) {
      // по пути: нос вверх на ходу, крен в поворот, качка на волне
      const k = renderTick - this.rideAt;
      ridePose(k, p);
      ridePose(k + 6, this.ahead);
      this.speed = (Math.hypot(this.ahead.x - p.x, this.ahead.z - p.z) * TICK_RATE) / 6;
      let turn = this.ahead.yaw - p.yaw;
      turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;
      const v = Math.min(1, this.speed / 4.3);
      b.position.set(p.x, WATER_Y + 0.03 * v + Math.sin(t * 2.1) * 0.035 + Math.sin(t * 3.7 + 1) * 0.015, p.z);
      b.rotation.set(-0.035 * v + Math.sin(t * 1.7) * 0.012, p.yaw, THREE.MathUtils.clamp(turn * 1.6, -0.1, 0.1) + Math.sin(t * 1.3 + 0.5) * 0.018);
      this.launchOffset.set(0, b.position.y - WATER_Y, 0);
    } else {
      // у причала: покачивается, ходит вдоль причала на швартовых, чуть отходит от стенки и возвращается к кранцам
      p.x = LAUNCH.x;
      p.z = LAUNCH.z;
      p.yaw = LAUNCH.yaw;
      this.speed = 0;
      b.position.set(
        LAUNCH.x + Math.sin(t * 0.23) * 0.12 + Math.sin(t * 0.61 + 1) * 0.03,
        WATER_Y + Math.sin(t * 1.1) * 0.045 + Math.sin(t * 2.3 + 0.5) * 0.012,
        LAUNCH.z + Math.max(0, Math.sin(t * 0.31 + 2)) * 0.05,
      );
      b.rotation.set(Math.sin(t * 0.7 + 0.3) * 0.012, LAUNCH.yaw + Math.sin(t * 0.19) * 0.008, Math.sin(t * 0.9 + 1) * 0.035);
      this.launchOffset.set(b.position.x - LAUNCH.x, b.position.y - WATER_Y, b.position.z - LAUNCH.z);
    }
    // мотор: в поездке опущен (винт в воде), у причала поднят
    const m = this.launchMotorMesh;
    const want = this.riding ? 0 : MOTOR_UP;
    m.rotation.x += THREE.MathUtils.clamp(want - m.rotation.x, (-dt * -MOTOR_UP) / MOTOR_TILT_S, (dt * -MOTOR_UP) / MOTOR_TILT_S);
    b.updateMatrixWorld(true);
    // швартовы отданы и кранцы убраны, пока катер в поездке
    this.fenders.visible = !this.riding;
    for (let i = 0; i < this.ropes.length; i++) {
      this.ropes[i].visible = !this.riding;
      if (!this.riding) this.ropes[i].update(this.cleats[i].getWorldPosition(this.tmp));
    }
    // след и мотор: нос и корма по курсу
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    this.motorPos.set(p.x - fx * LAUNCH_STERN, WATER_Y + 0.4, p.z - fz * LAUNCH_STERN);
    if (this.riding && this.speed > 0.4) this.launchWake.push(p.x + fx * LAUNCH_BOW, p.z + fz * LAUNCH_BOW, fx, fz, t);
    this.launchWake.update(t, this.riding && this.speed > 0.4);
    this.passer.update(dt, t);
  }

  debug(): { passing: boolean; x: number; z: number; launch: { riding: boolean; x: number; z: number; yaw: number; speed: number } } {
    const p = this.passer;
    const l = this.pose;
    return {
      passing: p.active, x: Math.round(p.boat.position.x), z: Math.round(p.boat.position.z),
      launch: { riding: this.riding, x: +l.x.toFixed(2), z: +l.z.toFixed(2), yaw: +l.yaw.toFixed(3), speed: +this.speed.toFixed(2) },
    };
  }

  /** Для отладки: следующая лодка выходит сразу. */
  sendBoat(): void {
    this.passer.wait = 0;
  }
}

// ------------------------------------------------------------ катер

interface HullSec {
  t: number;
  hb: number;
  ys: number;
  yc: number;
  yk: number;
  z: number;
}

/** Сечение корпуса на доле длины t (0 — корма, 1 — форштевень): полуширина, высота борта, скулы и киля. */
function hullAt(t: number): HullSec {
  const k = Math.max(0, (t - 0.42) / 0.58);
  const hb = HALF_B * Math.pow(Math.max(0, 1 - Math.pow(k, 1.9)), 0.62) * (0.94 + 0.06 * Math.min(1, t / 0.15));
  return {
    t,
    hb,
    ys: 0.62 + 0.28 * t * t,
    yc: -0.05 + 0.25 * t * t,
    yk: -0.32 + 0.45 * smooth((t - 0.8) / 0.2),
    z: STERN_Z + (BOW_Z - STERN_Z) * t,
  };
}

/** Форштевень скошен: у носа ниже борта обшивка уходит к корме на столько метров за метр глубины */
const RAKE = 0.55;

/** Сдвиг к корме точки обшивки на высоте y (у самого носа — скошенный форштевень, дальше — ноль). */
function rake(h: HullSec, y: number): number {
  return (h.ys - y) * RAKE * smooth((h.t - 0.85) / 0.15);
}

/** Ряды обшивки сверху вниз: (сечение) → [x, y]; между соседними — полосы своего цвета */
const ROWS: ReadonlyArray<(h: HullSec) => readonly [number, number]> = [
  (h) => [h.hb, h.ys],
  (h) => [h.hb * 0.997, h.ys - 0.06],
  (h) => [h.hb * 0.99, h.ys - 0.15],
  (h) => [h.hb * 0.98, h.ys - 0.25],
  (h) => [h.hb * 0.86, h.yc],
  (h) => [0, h.yk],
];
/** Привальный брус, белый борт, синяя полоса, белый борт, днище */
const BANDS = [0x30363c, WHITE, NAVY, WHITE, 0x9c3a2e];

/** Сетка (секции × точки поперёк) из функции точки: индексы, нормали, один цвет. */
function grid(rows: number, cols: number, at: (i: number, j: number) => V3, color: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) pos.push(...at(i, j));
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return paint(g, color);
}

function tube(points: V3[], r: number, color: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return paint(new THREE.TubeGeometry(curve, points.length * 6, r, 6, false), color);
}

function boxAt(w: number, h: number, d: number, x: number, y: number, z: number, color: number, rx = 0, ry = 0): THREE.BufferGeometry {
  return place(paint(new THREE.BoxGeometry(w, h, d), color), x, y, z, ry, rx);
}

/**
 * Катер: корпус с полосой, кокпит с двумя пультами и ветровым стеклом, два кресла и диванчик (места — BOAT_SEAT_AT),
 * тент, мотор (отдельно: поднимается и опускается), леера, кранцы, название.
 */
function buildLaunch(wet: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial): {
  group: THREE.Group;
  cleats: THREE.Object3D[];
  motor: THREE.Object3D;
  fenders: THREE.Object3D;
} {
  const group = new THREE.Group();
  const secs = Array.from({ length: SECTIONS + 1 }, (_, i) => hullAt(i / SECTIONS));
  const parts: THREE.BufferGeometry[] = [];

  // --- обшивка: полосы по обоим бортам
  for (let b = 0; b < BANDS.length; b++) {
    for (const side of [-1, 1]) {
      parts.push(grid(SECTIONS + 1, 2, (i, j) => {
        const [x, y] = ROWS[b + j](secs[i]);
        return [x * side, y, secs[i].z + rake(secs[i], y)];
      }, BANDS[b]));
    }
  }
  // транец: веер из середины по контуру кормового сечения
  const s0 = secs[0];
  const ring: Array<readonly [number, number]> = [];
  for (let r = 0; r < ROWS.length; r++) ring.push([-ROWS[r](s0)[0], ROWS[r](s0)[1]]);
  for (let r = ROWS.length - 2; r >= 0; r--) ring.push([ROWS[r](s0)[0], ROWS[r](s0)[1]]);
  const tp: number[] = [0, (s0.ys + s0.yk) / 2, s0.z];
  for (const [x, y] of ring) tp.push(x, y, s0.z);
  const ti: number[] = [];
  for (let k = 1; k < ring.length; k++) ti.push(0, k, k + 1);
  ti.push(0, ring.length, 1);
  const transom = new THREE.BufferGeometry();
  transom.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  transom.setIndex(ti);
  transom.computeVertexNormals();
  parts.push(paint(transom, WHITE));

  // --- кокпит: пол, внутренние борта, планширь; носовая палуба со скатом к бортам и переборка перед ней
  const fore = Math.round(FOREDECK_T * SECTIONS);
  const aft = secs.slice(0, fore + 1);
  parts.push(grid(aft.length, 2, (i, j) => [(j ? 1 : -1) * (aft[i].hb - 0.06), FLOOR_Y, aft[i].z], TEAK));
  for (const side of [-1, 1]) {
    parts.push(grid(aft.length, 2, (i, j) => [side * (aft[i].hb - 0.06), j ? FLOOR_Y : aft[i].ys, aft[i].z], WHITE));
    parts.push(grid(aft.length, 2, (i, j) => [side * (aft[i].hb - j * 0.06), aft[i].ys + 0.004, aft[i].z], TEAK));
  }
  const bow = secs.slice(fore);
  parts.push(grid(bow.length, 5, (i, j) => {
    const u = j / 2 - 1;
    return [u * bow[i].hb, bow[i].ys + 0.05 * (1 - u * u) - 0.004, bow[i].z];
  }, WHITE));
  const sf = secs[fore];
  parts.push(grid(2, 2, (i, j) => [(j ? 1 : -1) * (sf.hb - 0.06), i ? sf.ys + 0.04 : FLOOR_Y, sf.z], WHITE));

  // --- два пульта (правый — с рулём, левый — с поручнем), между ними — проход на нос. Они же — боксы в карте
  // (shared/maps/lobby.ts): середина пультов — поперёк катера на месте кресел, по длине — z = 0
  const zc = 0;
  const [hx, hz] = BOAT_SEAT_AT[0];
  const bz = BOAT_SEAT_AT[2][1];
  for (const side of [-1, 1]) {
    parts.push(boxAt(0.62, 0.9, 0.6, side * hx, FLOOR_Y + 0.45, zc, WHITE));
    parts.push(boxAt(0.64, 0.06, 0.48, side * hx, FLOOR_Y + 0.92, zc + 0.04, DARK, -0.35));
  }
  parts.push(place(paint(new THREE.TorusGeometry(0.13, 0.016, 6, 18), DARK), hx, FLOOR_Y + 0.82, zc + 0.36, 0, -0.5));
  parts.push(boxAt(0.05, 0.12, 0.05, hx, FLOOR_Y + 0.78, zc + 0.32, DARK, -0.5));
  parts.push(boxAt(0.42, 0.03, 0.03, -hx, FLOOR_Y + 0.99, zc + 0.27, STEEL));
  // кресла и диванчик: подушка — на высоте BOAT_SIT_LIFT над полом (на неё садится желейка), спинки — к корме
  const seatTop = FLOOR_Y + BOAT_SIT_LIFT;
  const base = BOAT_SIT_LIFT - 0.08;
  for (const side of [-1, 1]) {
    parts.push(boxAt(0.48, base, 0.4, side * hx, FLOOR_Y + base / 2, hz, WHITE));
    parts.push(boxAt(0.54, 0.08, 0.46, side * hx, seatTop - 0.04, hz, NAVY));
    parts.push(boxAt(0.5, 0.38, 0.08, side * hx, seatTop + 0.2, hz + 0.24, NAVY, 0.14));
  }
  const sb = hullAt((STERN_Z - bz) / (STERN_Z - BOW_Z));
  const bw = 2 * (sb.hb - 0.14);
  parts.push(boxAt(bw, base, 0.44, 0, FLOOR_Y + base / 2, bz, WHITE));
  parts.push(boxAt(bw + 0.02, 0.08, 0.48, 0, seatTop - 0.04, bz, NAVY));
  parts.push(boxAt(bw, 0.34, 0.08, 0, seatTop + 0.18, bz + 0.27, NAVY, 0.12));

  // --- тент на двух дугах над пультами (кресла — уже за ним: сидящие желейки его не протыкают)
  const zf = hullAt(0.58).z;
  const zr = hullAt(0.42).z;
  for (const [z, t] of [[zf, 0.58], [zr, 0.42]] as const) {
    const h = hullAt(t);
    parts.push(tube([[-h.hb + 0.05, h.ys, z], [-h.hb + 0.12, 1.55, z], [-0.55, 1.95, z], [0.55, 1.95, z], [h.hb - 0.12, 1.55, z], [h.hb - 0.05, h.ys, z]], 0.016, STEEL));
  }
  parts.push(grid(2, 7, (i, j) => {
    const u = j / 3 - 1;
    return [u * 0.8, 1.98 - 0.2 * u * u, (i ? zr : zf) + (i ? 0.08 : -0.08)];
  }, NAVY));

  // --- мотор на транце: поднят (винт над водой), колпак наклонился внутрь
  const motor: THREE.BufferGeometry[] = [];
  motor.push(boxAt(0.42, 0.52, 0.6, 0, 0.46, 0.28, DARK));
  motor.push(boxAt(0.44, 0.08, 0.62, 0, 0.74, 0.28, WHITE));
  motor.push(boxAt(0.2, 0.36, 0.3, 0, 0.04, 0.24, DARK));
  motor.push(boxAt(0.11, 0.78, 0.2, 0, -0.5, 0.22, DARK));
  motor.push(boxAt(0.36, 0.02, 0.32, 0, -0.62, 0.24, DARK));
  // три лопасти винта вокруг вала (вал — вдоль корпуса)
  for (let k = 0; k < 3; k++) motor.push(paint(new THREE.BoxGeometry(0.05, 0.26, 0.015), 0x8a949b).translate(0, 0.13, 0).rotateZ((k * Math.PI * 2) / 3 + 0.3).translate(0, -0.8, 0.36));
  const motorMesh = new THREE.Mesh(mergeColored(motor));
  motorMesh.position.set(0, s0.ys - 0.02, s0.z + 0.06);
  motorMesh.rotation.x = MOTOR_UP;
  group.add(motorMesh);

  // --- кормовой флагшток с огнём, леера на носу со стойками
  parts.push(boxAt(0.03, 0.75, 0.03, s0.hb - 0.2, s0.ys + 0.38, s0.z - 0.12, STEEL));
  const rail: V3[] = [];
  for (const t of [0.66, 0.74, 0.82, 0.9, 0.96]) {
    const h = hullAt(t);
    rail.push([-(h.hb - 0.07), h.ys + 0.33, h.z]);
  }
  const tip = hullAt(0.985);
  rail.push([0, tip.ys + 0.33, tip.z + 0.08]);
  for (let k = rail.length - 2; k >= 0; k--) rail.push([-rail[k][0], rail[k][1], rail[k][2]]);
  parts.push(tube(rail, 0.014, STEEL));
  for (const t of [0.68, 0.8, 0.92]) {
    const h = hullAt(t);
    for (const side of [-1, 1]) parts.push(boxAt(0.024, 0.33, 0.024, side * (h.hb - 0.07), h.ys + 0.165, h.z, STEEL));
  }

  // --- утки для швартовых (левый борт — к причалу): на носу и на корме
  const cleats: THREE.Object3D[] = [];
  for (const t of [0.9, 0.04]) {
    const h = hullAt(t);
    const x = -(h.hb - 0.12);
    parts.push(boxAt(0.06, 0.05, 0.2, x, h.ys + 0.03, h.z, DARK));
    const c = new THREE.Object3D();
    c.position.set(x, h.ys + 0.06, h.z);
    group.add(c);
    cleats.push(c);
  }

  // --- кранцы вдоль левого борта на коротких концах (отдельно: в поездке их убирают на борт)
  const fenderParts: THREE.BufferGeometry[] = [];
  for (const t of [0.2, 0.4, 0.58]) {
    const h = hullAt(t);
    const x = -(h.hb + 0.1);
    fenderParts.push(place(paint(new THREE.CapsuleGeometry(0.1, 0.3, 4, 10), WHITE), x, h.ys - 0.42, h.z));
    fenderParts.push(boxAt(0.012, 0.2, 0.012, x + 0.02, h.ys - 0.1, h.z, 0xd8c9a3));
  }

  const hullMat = wet(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05, side: THREE.DoubleSide }));
  const hull = new THREE.Mesh(mergeColored(parts), hullMat);
  const fenders = new THREE.Mesh(mergeColored(fenderParts), hullMat);
  group.add(hull, fenders);
  motorMesh.material = hullMat;

  // ветровое стекло — над каждым пультом (посередине проход), бортовые огни (красный слева, зелёный справа), огонь на флагштоке
  const pane = new THREE.PlaneGeometry(0.66, 0.36).rotateX(-0.6);
  const glass = new THREE.Mesh(
    mergeGeometries([pane.clone().translate(-hx, FLOOR_Y + 1.1, zc - 0.25), pane.clone().translate(hx, FLOOR_Y + 1.1, zc - 0.25)], false)!,
    new THREE.MeshStandardMaterial({ color: 0xa8cde0, transparent: true, opacity: 0.35, roughness: 0.05, side: THREE.DoubleSide }),
  );
  group.add(glass);
  const lights: THREE.BufferGeometry[] = [];
  const nav = hullAt(0.84);
  lights.push(boxAt(0.04, 0.05, 0.1, -(nav.hb + 0.01), nav.ys - 0.03, nav.z, 0xff3a2a));
  lights.push(boxAt(0.04, 0.05, 0.1, nav.hb + 0.01, nav.ys - 0.03, nav.z, 0x3aff7a));
  lights.push(place(paint(new THREE.SphereGeometry(0.045, 8, 6), 0xfff4dc), s0.hb - 0.2, s0.ys + 0.78, s0.z - 0.12));
  group.add(new THREE.Mesh(mergeColored(lights), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));

  // название на обеих скулах
  const nameMat = new THREE.MeshStandardMaterial({ map: nameTexture('ЛАСТОЧКА'), transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
  group.add(new THREE.Mesh(mergeGeometries([nameplate(-1), nameplate(1)], false)!, nameMat));
  return { group, cleats, motor: motorMesh, fenders };
}

/** Надпись на скуле: плоскость вдоль борта (с развалом), читается слева направо снаружи. */
function nameplate(side: number): THREE.BufferGeometry {
  const t0 = 0.72;
  const t1 = 0.84;
  const at = (t: number, y: number): THREE.Vector3 => {
    const h = hullAt(t);
    // борт между нижним краем синей полосы и скулой: x по высоте — линейно
    const yTop = h.ys - 0.25;
    const k = Math.min(1, Math.max(0, (yTop - y) / Math.max(0.01, yTop - h.yc)));
    return new THREE.Vector3(side * h.hb * (0.98 - 0.12 * k), y, h.z);
  };
  const h = hullAt((t0 + t1) / 2);
  const y = (h.ys - 0.25 + h.yc) / 2;
  const a = at(t0, y);
  const b = at(t1, y);
  const top = at((t0 + t1) / 2, y + 0.1);
  const bot = at((t0 + t1) / 2, y - 0.1);
  // ось текста: справа налево по борту — к корме слева, к носу справа
  const x = (side < 0 ? a.clone().sub(b) : b.clone().sub(a)).normalize();
  const up = top.clone().sub(bot).normalize();
  const n = new THREE.Vector3().crossVectors(x, up).normalize();
  up.crossVectors(n, x);
  const m = new THREE.Matrix4().makeBasis(x, up, n);
  m.setPosition(a.clone().add(b).multiplyScalar(0.5).addScaledVector(n, 0.015));
  return new THREE.PlaneGeometry(0.9, 0.17).applyMatrix4(m);
}

function nameTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.font = 'italic 700 64px Rubik, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#21406e';
  ctx.fillText(text, 256, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------ швартов

/** Точек на канате: от тумбы до края причала и от края до утки */
const ROPE_A = 4;
const ROPE_B = 12;
const ROPE_SIDES = 5;
const ROPE_R = 0.02;

/** Канат: от тумбы ложится на край причала и висит до утки катера; провис — от запаса длины. */
class Rope {
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly nor: Float32Array;
  private readonly post: THREE.Vector3;
  private readonly edge: THREE.Vector3;
  /** Длина висячей части с запасом */
  private readonly slack: number;
  private readonly pts: THREE.Vector3[] = Array.from({ length: ROPE_A + ROPE_B }, () => new THREE.Vector3());
  private readonly mesh: THREE.Mesh;

  constructor(scene: THREE.Scene, post: V3, edge: V3, cleat: THREE.Vector3) {
    this.post = new THREE.Vector3(...post);
    this.edge = new THREE.Vector3(...edge);
    this.slack = this.edge.distanceTo(cleat) * 1.05;
    const n = this.pts.length;
    this.pos = new Float32Array(n * ROPE_SIDES * 3);
    this.nor = new Float32Array(n * ROPE_SIDES * 3);
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < ROPE_SIDES; k++) {
        const a = i * ROPE_SIDES + k;
        const b = i * ROPE_SIDES + ((k + 1) % ROPE_SIDES);
        idx.push(a, a + ROPE_SIDES, b, b, a + ROPE_SIDES, b + ROPE_SIDES);
      }
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ color: 0xd8c9a3, roughness: 0.9 }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.update(cleat);
  }

  set visible(v: boolean) {
    this.mesh.visible = v;
  }

  update(cleat: THREE.Vector3): void {
    const p = this.pts;
    // до края — почти натянут; дальше — парабола с провисом от запаса длины (ровно натянут — без провиса)
    for (let i = 0; i < ROPE_A; i++) {
      const t = i / ROPE_A;
      p[i].lerpVectors(this.post, this.edge, t);
      p[i].y -= 0.03 * 4 * t * (1 - t);
    }
    const d = this.edge.distanceTo(cleat);
    const sag = Math.sqrt((3 * d * Math.max(0, this.slack - d)) / 8);
    for (let i = 0; i < ROPE_B; i++) {
      const t = i / (ROPE_B - 1);
      p[ROPE_A + i].lerpVectors(this.edge, cleat, t);
      p[ROPE_A + i].y -= sag * 4 * t * (1 - t);
    }
    const tan = new THREE.Vector3();
    const side = new THREE.Vector3();
    const up = new THREE.Vector3();
    for (let i = 0; i < p.length; i++) {
      tan.subVectors(p[Math.min(p.length - 1, i + 1)], p[Math.max(0, i - 1)]).normalize();
      side.set(-tan.z, 0, tan.x);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      up.crossVectors(side, tan);
      for (let k = 0; k < ROPE_SIDES; k++) {
        const a = (k / ROPE_SIDES) * Math.PI * 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const nx = side.x * c + up.x * s;
        const ny = side.y * c + up.y * s;
        const nz = side.z * c + up.z * s;
        const o = (i * ROPE_SIDES + k) * 3;
        this.nor[o] = nx;
        this.nor[o + 1] = ny;
        this.nor[o + 2] = nz;
        this.pos[o] = p[i].x + nx * ROPE_R;
        this.pos[o + 1] = p[i].y + ny * ROPE_R;
        this.pos[o + 2] = p[i].z + nz * ROPE_R;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
  }
}

// ------------------------------------------------------------ лодка через залив

class Passer {
  readonly boat: THREE.Group;
  readonly motor = new THREE.Vector3();
  active = false;
  /** До следующего прохода, с */
  wait = PASS_FIRST[0] + Math.random() * (PASS_FIRST[1] - PASS_FIRST[0]);
  private curve: THREE.CatmullRomCurve3 | null = null;
  private len = 1;
  private u = 0;
  private readonly wake: Wake;
  private readonly mats: THREE.MeshStandardMaterial[] = [];
  private readonly at = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.boat = makeBoat(PASS_COLORS[0]);
    this.boat.rotation.order = 'YXZ';
    this.boat.visible = false;
    this.boat.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && this.mats.length === 0) this.mats.push(m);
    });
    scene.add(this.boat);
    this.wake = new Wake(scene);
  }

  update(dt: number, t: number): void {
    if (!this.active) {
      this.wait -= dt;
      if (this.wait <= 0) this.start();
      this.wake.update(t, false);
      return;
    }
    // вдали (в дымке) лодка идёт быстрее — иначе длинный путь тянулся бы минутами; у набережной — 5 м/с
    const far = THREE.MathUtils.smoothstep(Math.hypot(this.at.x, this.at.z - 10), 350, 800);
    this.u += ((PASS_SPEED + (PASS_FAR_SPEED - PASS_SPEED) * far) * dt) / this.len;
    if (this.u >= 1) {
      this.active = false;
      this.boat.visible = false;
      this.wait = PASS_GAP[0] + Math.random() * (PASS_GAP[1] - PASS_GAP[0]);
      this.wake.clear();
      return;
    }
    const c = this.curve!;
    c.getPointAt(this.u, this.at);
    c.getTangentAt(this.u, this.dir);
    const b = this.boat;
    b.position.set(this.at.x, WATER_Y + Math.sin(t * 1.6) * 0.05, this.at.z);
    b.rotation.set(Math.sin(t * 1.3) * 0.02 - 0.02, Math.atan2(this.dir.x, this.dir.z), Math.sin(t * 1.1 + 0.4) * 0.03);
    this.motor.set(this.at.x - this.dir.x * PASS_STERN, WATER_Y + 0.4, this.at.z - this.dir.z * PASS_STERN);
    this.wake.push(this.at.x + this.dir.x * PASS_BOW, this.at.z + this.dir.z * PASS_BOW, this.dir.x, this.dir.z, t);
    this.wake.update(t, true);
  }

  private start(): void {
    const route = PASS_ROUTES[Math.floor(Math.random() * PASS_ROUTES.length)];
    const pts = route.map(([x, z]) => new THREE.Vector3(x, 0, z));
    if (Math.random() < 0.5) pts.reverse();
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this.curve.arcLengthDivisions = 3000;
    this.len = this.curve.getLength();
    this.u = 0;
    this.curve.getPointAt(0, this.at);
    this.active = true;
    this.boat.visible = true;
    // корпус каждый раз своего цвета
    this.mats[0]?.color.set(PASS_COLORS[Math.floor(Math.random() * PASS_COLORS.length)]);
    this.wake.clear();
  }
}

// ------------------------------------------------------------ пенный след

/**
 * След лодки: от носа под углом расходятся две волны (белые гребни тают за WAKE_LIFE), за кормой — пена от винта
 * (тает за FOAM_LIFE). Строится каждый кадр из истории: где был нос и куда смотрел.
 */
class Wake {
  private readonly hx = new Float32Array(WAKE_N);
  private readonly hz = new Float32Array(WAKE_N);
  private readonly hdx = new Float32Array(WAKE_N);
  private readonly hdz = new Float32Array(WAKE_N);
  private readonly ht = new Float32Array(WAKE_N);
  /** Пройденный путь в точке (для узора пены) */
  private readonly hs = new Float32Array(WAKE_N);
  private count = 0;
  private head = 0;
  private lastT = -1e9;
  private dist = 0;
  /** Живая точка (нос сейчас) — нулевая в построении */
  private nowX = 0;
  private nowZ = 0;
  private nowDx = 0;
  private nowDz = 1;
  private nowT = 0;
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly w: Float32Array;
  private readonly mesh: THREE.Mesh;
  private readonly uTime = { value: 0 };
  /** Нос и корма лодки от середины, её ход (как быстро расходятся волны) */
  private readonly bow: number;
  private readonly stern: number;
  private readonly speed: number;

  constructor(scene: THREE.Scene, bow = PASS_BOW, stern = PASS_STERN, speed = PASS_SPEED) {
    this.bow = bow;
    this.stern = stern;
    this.speed = speed;
    const verts = 3 * (WAKE_N + 1) * 2;
    this.pos = new Float32Array(verts * 3);
    this.w = new Float32Array(verts * 3);
    const idx: number[] = [];
    for (let strip = 0; strip < 3; strip++) {
      const base = strip * (WAKE_N + 1) * 2;
      for (let i = 0; i < WAKE_N; i++) {
        const a = base + i * 2;
        // лицом вверх: соседняя точка истории — позади, вершина 0 — слева от курса
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aW', new THREE.BufferAttribute(this.w, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, wakeMaterial(this.uTime));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  clear(): void {
    this.count = 0;
    this.head = 0;
    this.lastT = -1e9;
    this.dist = 0;
    this.mesh.visible = false;
  }

  push(x: number, z: number, dx: number, dz: number, t: number): void {
    if (this.count > 0) this.dist += Math.hypot(x - this.nowX, z - this.nowZ);
    this.nowX = x;
    this.nowZ = z;
    this.nowDx = dx;
    this.nowDz = dz;
    this.nowT = t;
    if (t - this.lastT < WAKE_STEP) return;
    this.lastT = t;
    const i = this.head;
    this.hx[i] = x;
    this.hz[i] = z;
    this.hdx[i] = dx;
    this.hdz[i] = dz;
    this.ht[i] = t;
    this.hs[i] = this.dist;
    this.head = (this.head + 1) % WAKE_N;
    this.count = Math.min(WAKE_N, this.count + 1);
  }

  update(t: number, live: boolean): void {
    this.uTime.value = t % 1000;
    if (this.count < 2) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    // точки от новой к старой: сначала живая (нос сейчас), потом история
    const n = Math.min(WAKE_N, this.count) + 1;
    for (let k = 0; k <= WAKE_N; k++) {
      const kk = Math.min(k, n - 1);
      let x: number;
      let z: number;
      let dx: number;
      let dz: number;
      let age: number;
      let s: number;
      if (kk === 0) {
        x = this.nowX;
        z = this.nowZ;
        dx = this.nowDx;
        dz = this.nowDz;
        age = live ? 0 : t - this.nowT;
        s = this.dist;
      } else {
        const i = (this.head - kk + WAKE_N * 2) % WAKE_N;
        x = this.hx[i];
        z = this.hz[i];
        dx = this.hdx[i];
        dz = this.hdz[i];
        age = t - this.ht[i];
        s = this.hs[i];
      }
      // вправо от курса
      const rx = -dz;
      const rz = dx;
      const fade = Math.max(0, 1 - age / WAKE_LIFE);
      const armA = 0.55 * fade * fade * Math.min(1, age / 0.25) * (k < n ? 1 : 0);
      const off = 0.5 + age * this.speed * KELVIN;
      const band = 0.3 + 0.12 * age;
      const foamFade = Math.max(0, 1 - age / FOAM_LIFE);
      const foamA = 0.75 * foamFade * foamFade * (k < n ? 1 : 0);
      const fw = 0.6 + 0.3 * age;
      const sx = x - dx * (this.bow + this.stern);
      const sz = z - dz * (this.bow + this.stern);
      // левая волна, правая волна, пена за кормой
      this.vert(0, k, x - rx * (off + band), z - rz * (off + band), -1, s, armA);
      this.vert(0, k, x - rx * (off - band), z - rz * (off - band), 1, s, armA, 1);
      this.vert(1, k, x + rx * (off - band), z + rz * (off - band), -1, s, armA);
      this.vert(1, k, x + rx * (off + band), z + rz * (off + band), 1, s, armA, 1);
      this.vert(2, k, sx - rx * fw, sz - rz * fw, -1, s, foamA);
      this.vert(2, k, sx + rx * fw, sz + rz * fw, 1, s, foamA, 1);
    }
    this.geo.attributes.position.needsUpdate = true;
    (this.geo.attributes.aW as THREE.BufferAttribute).needsUpdate = true;
  }

  private vert(strip: number, k: number, x: number, z: number, across: number, s: number, a: number, e = 0): void {
    const v = (strip * (WAKE_N + 1) + k) * 2 + e;
    this.pos[v * 3] = x;
    this.pos[v * 3 + 1] = WATER_Y + 0.025;
    this.pos[v * 3 + 2] = z;
    this.w[v * 3] = across;
    this.w[v * 3 + 1] = s;
    this.w[v * 3 + 2] = a;
  }
}

function wakeMaterial(uTime: THREE.IUniform<number>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime },
    vertexShader: /* glsl */ `
      attribute vec3 aW;
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        vW = aW;
        vec4 mvPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vW;
      #include <fog_pars_fragment>
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float edge = 1.0 - vW.x * vW.x;
        float n = vnoise(vec2(vW.y * 1.4, vW.x * 2.5 + uTime * 0.4)) * 0.6 + vnoise(vec2(vW.y * 3.7 - uTime * 0.3, vW.x * 6.0)) * 0.4;
        float a = vW.z * smoothstep(0.3, 0.7, n * 0.8 + edge * 0.45);
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(0.9, 0.93, 0.94), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}

function smooth(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}
