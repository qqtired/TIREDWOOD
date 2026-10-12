// Лодка Семёна «Удалая» (shared/ferry.ts): деревянная мотолодка 5 × 2,2 м под стать Семёну — старая, латаная, бойкая.
// Клинкерная обшивка выцветшей бирюзы с заплатками, имя на скуле от руки, будка мотора с трубой («тук-тук» — дымок),
// кранцы из покрышек, бухта каната, ведро, запасное весло, фонарь на шесте. За румпелем — моторист Гоша.
// В рейсе идёт по общему с сервером пути по часам отрисовки (как «Ласточка»): нос вверх на ходу, крен в поворот,
// пенный след. У стоянки покачивается; над ней — табличка «Отходим через N».
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOAT_SIT_LIFT } from '../../../shared/boat.ts';
import { TICK_RATE, WATER_Y } from '../../../shared/constants.ts';
import { FE_AWAY, FE_BACK, FE_BOARD, FE_HOME, FE_OUT, FERRY_GOSHA, FERRY_HOME, FERRY_SEAT_AT, ferryPose, type FerryPose } from '../../../shared/ferry.ts';
import type { FerryStatus } from '../../../shared/messages.ts';
import { glowSprite, mergeColored, paint, place, type V3 } from '../../render/kit.ts';
import { Wake } from '../boats.ts';
import { makePerson, type Person } from './people.ts';
import type { Smoke } from './smoke.ts';

const STERN_Z = 2.5;
const BOW_Z = -2.5;
const HALF_B = 1.08;
/** Пол над водой (как FERRY_FLOOR_Y) и планширь */
const FLOOR = 0.3;
const SECTIONS = 22;
const HULL = [0x5fa59c, 0x6aaea4, 0x579a92, 0x64a89e];
const PATCH = [0x7fbcae, 0x4f8f88, 0x8fc2b5];
const RUB = 0x5b4532;
const BOTTOM = 0x7a3b2c;
const WOOD = 0xa6835a;
const WOOD_DARK = 0x7d5f3e;
const ROPE = 0xc9b48a;

/** Сечение на доле длины t (0 — транец, 1 — форштевень): полуширина, высота борта, киль */
function sec(t: number): { hb: number; ys: number; yk: number; z: number } {
  const k = Math.max(0, (t - 0.42) / 0.58);
  return {
    hb: HALF_B * Math.pow(Math.max(0, 1 - Math.pow(k, 1.8)), 0.6) * (0.88 + 0.12 * Math.min(1, t / 0.2)),
    ys: 0.78 + 0.26 * t * t,
    yk: -0.36 + 0.42 * Math.max(0, (t - 0.82) / 0.18) ** 2,
    z: STERN_Z + (BOW_Z - STERN_Z) * t,
  };
}

function at(g: THREE.BufferGeometry, color: number, x: number, y: number, z: number, ry = 0, rx = 0): THREE.BufferGeometry {
  return place(paint(g, color), x, y, z, ry, rx);
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, ry = 0, rx = 0): THREE.BufferGeometry {
  return at(new THREE.BoxGeometry(w, h, d), color, x, y, z, ry, rx);
}

function rod(a: V3, b: V3, r: number, color: number, seg = 6): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()));
  g.translate(va.x, va.y, va.z);
  return paint(g, color);
}

/** Полоса обшивки между двумя кривыми (по сечениям): цвет каждой клетки — по функции (заплатки) */
function strip(secs: ReturnType<typeof sec>[], side: number, top: (s: ReturnType<typeof sec>) => [number, number], bot: (s: ReturnType<typeof sec>) => [number, number], color: (i: number) => number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < secs.length - 1; i++) {
    const a = secs[i];
    const b = secs[i + 1];
    const [ax0, ay0] = top(a);
    const [ax1, ay1] = bot(a);
    const [bx0, by0] = top(b);
    const [bx1, by1] = bot(b);
    const q: V3[] = [[side * ax0, ay0, a.z], [side * ax1, ay1, a.z], [side * bx0, by0, b.z], [side * bx1, by1, b.z]];
    for (const v of [q[0], q[1], q[2], q[2], q[1], q[3]]) pos.push(...v);
    c.setHex(color(i));
    for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Лодка целиком (без Гоши): группа с началом координат на воде посередине, нос — в −Z */
function buildBoat(wet: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial): { group: THREE.Group; tiller: THREE.Group; lamp: THREE.Vector3; exhaust: THREE.Vector3 } {
  const group = new THREE.Group();
  const secs = Array.from({ length: SECTIONS + 1 }, (_, i) => sec(i / SECTIONS));
  const parts: THREE.BufferGeometry[] = [];
  // клинкер: пять поясов внахлёст — нижний край каждого чуть наружу; заплатки — другим тоном
  const belts = 5;
  for (const side of [-1, 1]) {
    for (let b = 0; b < belts; b++) {
      const f0 = b / belts;
      const f1 = (b + 1) / belts;
      const y = (s: ReturnType<typeof sec>, f: number): number => s.ys + (0.02 - s.ys) * f;
      const x = (s: ReturnType<typeof sec>, f: number): number => s.hb * (1 - 0.12 * f * f);
      parts.push(strip(secs, side, (s) => [x(s, f0), y(s, f0)], (s) => [x(s, f1) + 0.018, y(s, f1)], (i) => {
        const h = (i * 7 + b * 13 + (side > 0 ? 5 : 0)) % 17;
        return h === 3 || h === 11 ? PATCH[(i + b) % PATCH.length] : HULL[(b + (i > 14 ? 1 : 0)) % HULL.length];
      }));
    }
    // ниже воды: днище до киля
    parts.push(strip(secs, side, (s) => [s.hb * 0.88, 0.02], (s) => [0, s.yk], () => BOTTOM));
    // привальный брус
    parts.push(strip(secs, side, (s) => [s.hb + 0.035, s.ys + 0.02], (s) => [s.hb + 0.035, s.ys - 0.07], () => RUB));
    // изнутри: светлая обшивка до пола
    parts.push(strip(secs.slice(0, SECTIONS - 2), side, (s) => [s.hb - 0.04, s.ys], (s) => [Math.max(0.1, s.hb - 0.1), FLOOR], () => 0xa98a60));
  }
  // транец
  const s0 = secs[0];
  const tr: number[] = [];
  const ring: Array<[number, number]> = [[-s0.hb, s0.ys], [-s0.hb * 0.88, 0.02], [0, s0.yk], [s0.hb * 0.88, 0.02], [s0.hb, s0.ys], [-s0.hb, s0.ys]];
  for (let k = 0; k < ring.length - 1; k++) tr.push(0, s0.ys * 0.5, STERN_Z, ring[k][0], ring[k][1], STERN_Z, ring[k + 1][0], ring[k + 1][1], STERN_Z);
  const trg = new THREE.BufferGeometry();
  trg.setAttribute('position', new THREE.Float32BufferAttribute(tr, 3));
  trg.computeVertexNormals();
  parts.push(paint(trg, HULL[2]));
  // пол по форме корпуса (с тёмными швами досок вдоль), носовая палуба по форме носа, три банки
  const foreT = 0.84;
  const fore = Math.round(foreT * SECTIONS);
  parts.push(strip(secs.slice(0, fore + 1), 1, (s) => [s.hb - 0.1, FLOOR], (s) => [-(s.hb - 0.1), FLOOR], () => 0x9a7a52));
  for (let k = -4; k <= 4; k++) parts.push(box(0.014, 0.006, 3.9, k * 0.14, FLOOR + 0.003, 0.3, 0x6d5338));
  parts.push(strip(secs.slice(fore), 1, (s) => [Math.max(0, s.hb - 0.06), FLOOR + 0.41], (s) => [-Math.max(0, s.hb - 0.06), FLOOR + 0.41], () => WOOD));
  const foreZ = secs[fore].z;
  const foreHb = secs[fore].hb;
  parts.push(box(2 * foreHb - 0.12, 0.41, 0.04, 0, FLOOR + 0.205, foreZ, WOOD_DARK));
  for (const z of [FERRY_SEAT_AT[0][1], FERRY_SEAT_AT[2][1], FERRY_SEAT_AT[4][1]]) {
    const hb = sec((STERN_Z - z) / (STERN_Z - BOW_Z)).hb;
    parts.push(box(2 * hb - 0.12, 0.05, 0.28, 0, FLOOR + BOAT_SIT_LIFT - 0.025, z + 0.03, WOOD));
    for (const s of [-1, 1]) parts.push(box(0.05, BOAT_SIT_LIFT - 0.05, 0.05, s * (hb - 0.25), FLOOR + (BOAT_SIT_LIFT - 0.05) / 2, z + 0.03, WOOD_DARK));
  }
  // будка мотора с трубой и крышкой
  parts.push(box(0.64, 0.55, 0.6, 0, FLOOR + 0.275, 1.75, 0x6f8f87));
  parts.push(box(0.7, 0.05, 0.66, 0, FLOOR + 0.57, 1.75, 0x5e4a36));
  parts.push(box(0.5, 0.06, 0.04, 0, FLOOR + 0.42, 1.44, 0x3a3f3e));
  const exhaust = new THREE.Vector3(0.22, FLOOR + 1.05, 1.95);
  parts.push(rod([0.22, FLOOR + 0.55, 1.95], [0.22, FLOOR + 1.0, 1.95], 0.035, 0x2c2f31));
  parts.push(at(new THREE.CylinderGeometry(0.07, 0.05, 0.05, 8), 0x2c2f31, 0.22, FLOOR + 1.03, 1.95));
  // сиденье Гоши на корме (левый борт)
  parts.push(box(0.5, 0.05, 0.42, FERRY_GOSHA[0], FLOOR + 0.42, FERRY_GOSHA[1] + 0.05, WOOD));
  parts.push(box(0.05, 0.42, 0.05, FERRY_GOSHA[0], FLOOR + 0.21, FERRY_GOSHA[1] + 0.05, WOOD_DARK));
  // руль за транцем
  parts.push(box(0.04, 0.85, 0.32, 0, 0.1, STERN_Z + 0.2, WOOD_DARK));
  parts.push(rod([0, 0.5, STERN_Z + 0.15], [0, 0.8, STERN_Z + 0.15], 0.03, WOOD_DARK));
  // кранцы-покрышки по бортам на верёвках
  for (const side of [-1, 1]) {
    for (const z of [-0.9, 0.7]) {
      const hb = sec((STERN_Z - z) / (STERN_Z - BOW_Z)).hb;
      parts.push(at(new THREE.TorusGeometry(0.17, 0.075, 8, 14), 0x1d1f21, side * (hb + 0.1), 0.38, z, Math.PI / 2));
      parts.push(rod([side * (hb + 0.02), 0.85, z], [side * (hb + 0.1), 0.5, z], 0.012, ROPE, 4));
    }
  }
  // бухта каната на носу, ведро, запасное весло вдоль левого борта
  for (let k = 0; k < 4; k++) parts.push(at(new THREE.TorusGeometry(0.2 - k * 0.035, 0.028, 5, 14).rotateX(Math.PI / 2), ROPE, 0.25, FLOOR + 0.42 + k * 0.028, -2.05));
  parts.push(at(new THREE.CylinderGeometry(0.13, 0.1, 0.24, 12, 1, true), 0x8d9aa0, 0.55, FLOOR + 0.12, 1.25));
  parts.push(at(new THREE.TorusGeometry(0.13, 0.01, 4, 12).rotateX(Math.PI / 2), 0x6c777c, 0.55, FLOOR + 0.24, 1.25));
  parts.push(rod([-0.78, FLOOR + 0.12, 1.3], [-0.62, FLOOR + 0.2, -1.2], 0.025, WOOD));
  parts.push(at(new THREE.BoxGeometry(0.03, 0.14, 0.42), WOOD, -0.6, FLOOR + 0.2, -1.38, 0.06));
  // шест с фонарём на носу
  const lamp = new THREE.Vector3(-0.42, 1.78, -2.0);
  parts.push(rod([-0.42, FLOOR + 0.4, -2.0], [-0.42, 1.65, -2.0], 0.03, WOOD_DARK));
  parts.push(at(new THREE.CylinderGeometry(0.06, 0.075, 0.05, 8), 0x2f3337, lamp.x, lamp.y - 0.13, lamp.z));
  parts.push(at(new THREE.CylinderGeometry(0.05, 0.065, 0.05, 8), 0x2f3337, lamp.x, lamp.y + 0.1, lamp.z));
  // кормовой флажок
  parts.push(rod([0.62, 0.85, 2.38], [0.62, 1.55, 2.38], 0.015, WOOD_DARK, 4));
  const mat = wet(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02, side: THREE.DoubleSide }));
  const hull = new THREE.Mesh(mergeColored(parts), mat);
  group.add(hull);
  const glow = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.045, 0.06, 0.18, 8).translate(lamp.x, lamp.y - 0.02, lamp.z), 0xffc77a), new THREE.MeshBasicMaterial({ vertexColors: true }));
  group.add(glow);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.2).translate(0.17, 0, 0), new THREE.MeshStandardMaterial({ color: 0xd8352b, roughness: 0.8, side: THREE.DoubleSide }));
  flag.position.set(0.62, 1.44, 2.38);
  flag.rotation.y = -Math.PI / 2;
  flag.name = 'flag';
  group.add(flag);
  // румпель: от головы руля над транцем вперёд к руке Гоши
  const tiller = new THREE.Group();
  tiller.position.set(0, 0.8, STERN_Z + 0.15);
  tiller.add(new THREE.Mesh(mergeColored([rod([0, 0, 0], [-0.3, 0.2, -0.55], 0.03, WOOD_DARK), at(new THREE.SphereGeometry(0.04, 6, 5), WOOD_DARK, -0.3, 0.2, -0.55)]), mat));
  group.add(tiller);
  // имя на скулах: плоскость по обводу борта в этом месте
  const tex = nameTexture();
  const nameMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  const sc = sec(0.74);
  const sa = sec(0.7);
  const sb = sec(0.78);
  const ang = Math.atan2(sa.hb - sb.hb, sa.z - sb.z);
  // обе надписи — одна сетка
  const planes = [-1, 1].map((side) =>
    new THREE.PlaneGeometry(0.9, 0.22).rotateY(side > 0 ? Math.PI / 2 + ang : -Math.PI / 2 - ang).translate(side * (sc.hb * 0.995 + 0.03), sc.ys - 0.2, sc.z),
  );
  group.add(new THREE.Mesh(mergeGeometries(planes, false)!, nameMat));
  return { group, tiller, lamp, exhaust };
}

function nameTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const c = canvas.getContext('2d')!;
  c.font = 'italic 700 78px Rubik, system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = 'rgba(30,40,40,.35)';
  c.fillText('Удалая', 259, 68);
  c.fillStyle = '#f7f0dc';
  c.fillText('Удалая', 256, 64);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Моторист Гоша: ватник, вязаная шапка, щетина */
function makeGosha(): Person {
  return makePerson({
    skin: 0xc0906f, coat: 0x4a4f45, sleeves: 0x4a4f45, trim: 0x2d302b, pants: 0x3b3f44, boots: 0x262a2c,
    hat: 'knit', hatColor: 0x2f4f7a, hatBand: 0x24406a, hair: 0x5a4a3c, brows: 0x4a3c30, mustache: 0x5a4a3c, seat: 0.42, build: 1.05,
  });
}

export class Ferry3D {
  readonly group: THREE.Group;
  private readonly tiller: THREE.Group;
  private readonly flag: THREE.Object3D;
  private readonly gosha: Person;
  private readonly lampGlow: THREE.Sprite;
  private readonly lampLocal: THREE.Vector3;
  private readonly exhaustLocal: THREE.Vector3;
  private readonly wake: Wake;
  private readonly banner: FerryBanner;
  /** Путь по часам отрисовки (без качки) и куда пойдёт через 0,1 с */
  readonly pose: FerryPose = { x: FERRY_HOME.x, z: FERRY_HOME.z, yaw: FERRY_HOME.yaw };
  private readonly ahead: FerryPose = { x: 0, z: 0, yaw: 0 };
  /** Насколько лодка на экране сдвинута от точки пути (качка): столько же — пассажирам */
  readonly offset = new THREE.Vector3();
  private st: FerryStatus = { ph: FE_HOME, at: 0, n: 0, c: 0 };
  speed = 0;
  private turn = 0;
  private puffT = 0;
  readonly motorPos = new THREE.Vector3();

  constructor(scene: THREE.Scene, wet: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial) {
    const b = buildBoat(wet);
    this.group = b.group;
    this.group.name = 'ferry-udalaya';
    this.group.rotation.order = 'YXZ';
    this.tiller = b.tiller;
    this.flag = this.group.getObjectByName('flag')!;
    this.lampLocal = b.lamp;
    this.exhaustLocal = b.exhaust;
    this.gosha = makeGosha();
    this.gosha.group.position.set(FERRY_GOSHA[0], FLOOR, FERRY_GOSHA[1] + 0.12);
    this.group.add(this.gosha.group);
    this.lampGlow = glowSprite(0xffc27a, 1.5, 0.5);
    scene.add(this.lampGlow);
    scene.add(this.group);
    this.wake = new Wake(scene, 2.5, 2.5, 3.6);
    this.banner = new FerryBanner(scene);
  }

  setStatus(st: FerryStatus): void {
    const moving = st.ph === FE_OUT || st.ph === FE_BACK;
    const was = this.st.ph === FE_OUT || this.st.ph === FE_BACK;
    if (moving && (!was || st.at !== this.st.at)) this.wake.clear();
    this.st = { ...st };
  }

  get status(): FerryStatus {
    return this.st;
  }

  /** В рейсе (по часам отрисовки) */
  get moving(): boolean {
    return this.st.ph === FE_OUT || this.st.ph === FE_BACK;
  }

  update(dt: number, t: number, renderTick: number, cam: THREE.Vector3, smoke: Smoke, rain: number): void {
    const st = this.st;
    const p = this.pose;
    ferryPose(st.ph, st.at, renderTick, p);
    ferryPose(st.ph, st.at, renderTick + 6, this.ahead);
    const moving = this.moving && renderTick >= st.at;
    this.speed = moving ? (Math.hypot(this.ahead.x - p.x, this.ahead.z - p.z) * TICK_RATE) / 6 : 0;
    let turn = this.ahead.yaw - p.yaw;
    turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;
    this.turn += (turn - this.turn) * Math.min(1, dt * 4);
    const g = this.group;
    const v = Math.min(1, this.speed / 3.6);
    if (moving) {
      g.position.set(p.x, WATER_Y + 0.04 * v + Math.sin(t * 2.3) * 0.04 + Math.sin(t * 3.9 + 1) * 0.015, p.z);
      g.rotation.set(-0.06 * v + Math.sin(t * 1.9) * 0.015, p.yaw, THREE.MathUtils.clamp(this.turn * 1.8, -0.12, 0.12) + Math.sin(t * 1.4 + 0.5) * 0.02);
    } else {
      // у стоянки: покачивается, чуть ходит на швартовых
      g.position.set(p.x + Math.sin(t * 0.27) * 0.05, WATER_Y + Math.sin(t * 1.2) * 0.04 + Math.sin(t * 2.5 + 0.5) * 0.012, p.z + Math.sin(t * 0.33 + 2) * 0.06);
      g.rotation.set(Math.sin(t * 0.8 + 0.3) * 0.015, p.yaw + Math.sin(t * 0.21) * 0.01, Math.sin(t * 1.0 + 1) * 0.03);
    }
    this.offset.set(g.position.x - p.x, g.position.y - WATER_Y, g.position.z - p.z);
    g.updateMatrixWorld(true);
    // румпель — против поворота, флажок треплет встречный ветер
    this.tiller.rotation.y = THREE.MathUtils.clamp(-this.turn * 6, -0.5, 0.5);
    this.flag.rotation.y = -Math.PI / 2 + Math.sin(t * (5 + v * 6)) * (0.18 + 0.2 * v);
    // фонарь на шесте
    this.lampGlow.position.copy(this.lampLocal).applyMatrix4(g.matrixWorld);
    this.lampGlow.material.opacity = (0.42 + 0.2 * rain) * (0.93 + 0.07 * Math.sin(t * 6.1));
    // мотор: дымок «тук-тук» — на ходу чаще и гуще, у стоянки с пассажирами — на холостых
    this.motorPos.copy(this.exhaustLocal).applyMatrix4(g.matrixWorld);
    const idle = st.ph === FE_BOARD || st.ph === FE_AWAY || moving;
    this.puffT -= dt;
    if (idle && this.puffT <= 0) {
      this.puffT = moving ? 0.22 - 0.08 * v : 0.42;
      smoke.puff(this.motorPos.x, this.motorPos.y, this.motorPos.z, 0x8b9296, moving ? 1.6 : 2.2, 0.18, 0.7, 0.9, moving ? 0.5 : 0.35);
    }
    // след: от носа по курсу
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    if (moving && this.speed > 0.4) this.wake.push(p.x + fx * 2.5, p.z + fz * 2.5, fx, fz, t);
    this.wake.update(t, moving && this.speed > 0.4);
    this.animateGosha(t, moving);
    this.banner.update(st, renderTick, t, g.position, cam);
  }

  /** Мотор для звука: где и как быстро идёт (null — заглушен: стоит без пассажиров) */
  motor(): { pos: THREE.Vector3; speed: number } | null {
    const st = this.st;
    if (this.moving) return { pos: this.motorPos, speed: this.speed };
    if (st.ph === FE_BOARD || st.ph === FE_AWAY) return { pos: this.motorPos, speed: 0 };
    return null;
  }

  private animateGosha(t: number, moving: boolean): void {
    const g = this.gosha;
    g.head.rotation.set(0, 0, 0);
    g.torso.rotation.set(0, 0, 0);
    // руки: положительный rotation.x — вперёд, z у правой — наружу (+X)
    if (moving) {
      // правая рука на румпеле (он справа-спереди), левая на колене; смотрит вперёд, поглядывает по сторонам
      g.armR.rotation.set(0.75 + this.tiller.rotation.y * 0.3, 0, -0.12);
      g.armL.rotation.set(0.55, 0, 0.12);
      g.head.rotation.y = Math.sin(t * 0.37) * 0.35;
      g.torso.rotation.z = Math.sin(t * 2.3) * 0.02;
      return;
    }
    // у стоянки: сматывает швартов (руки ходят кругами), поглядывает на пассажиров, иногда машет «садись»
    const ph = t % 14;
    if (this.st.ph === FE_BOARD && ph > 9 && ph < 11.5) {
      const k = Math.sin(((ph - 9) / 2.5) * Math.PI);
      g.armR.rotation.set(2.6 * k, 0, 0.3 * k + Math.sin(t * 9) * 0.25 * k);
      g.armL.rotation.set(0.4, 0, 0.1);
      g.head.rotation.y = -0.6 * k;
      return;
    }
    const c = t * 3.1;
    g.armR.rotation.set(0.95 + Math.sin(c) * 0.25, 0, -0.2 + Math.cos(c) * 0.1);
    g.armL.rotation.set(0.9 + Math.sin(c + 0.4) * 0.12, 0, 0.22);
    g.head.rotation.x = 0.25;
    g.head.rotation.y = Math.sin(t * 0.25) * 0.4;
  }
}

/**
 * Над лодкой во время отсчёта — табличка «Отходим через N» (у баркаса — «К Семёну через N»). Смотрит в камеру, издалека
 * крупнее — читается с мостков и с палубы. Холст перерисовывается, только когда меняется текст.
 */
class FerryBanner {
  private readonly sprite: THREE.Sprite;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private key = '';
  private vis = 0;

  constructor(scene: THREE.Scene) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 200;
    this.ctx = canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, opacity: 0 }));
    this.sprite.center.set(0.5, 0);
    this.sprite.renderOrder = 6;
    this.sprite.visible = false;
    scene.add(this.sprite);
  }

  update(st: FerryStatus, tick: number, t: number, boat: THREE.Vector3, cam: THREE.Vector3): void {
    const counting = (st.ph === FE_BOARD || st.ph === FE_AWAY) && st.at > tick;
    const secs = Math.max(0, Math.ceil((st.at - tick) / TICK_RATE));
    const want = counting ? 1 : 0;
    this.vis += (want - this.vis) * 0.15;
    this.sprite.visible = this.vis > 0.02;
    if (!this.sprite.visible) return;
    const away = st.ph === FE_AWAY;
    const key = counting ? `${away ? 1 : 0}|${secs}|${st.n}` : this.key;
    if (key !== this.key) {
      this.key = key;
      this.draw(away ? 'К Семёну через' : 'Отходим через', secs, st.n, secs <= 3);
    }
    const d = cam.distanceTo(boat);
    const scale = 1.7 * Math.max(1, Math.min(4.5, d / 9));
    this.sprite.scale.set(scale, scale * (200 / 512), 1);
    this.sprite.position.set(boat.x, boat.y + 2.0 + Math.sin(t * 2) * 0.05, boat.z);
    this.sprite.material.opacity = this.vis;
  }

  private draw(title: string, secs: number, n: number, hot: boolean): void {
    const c = this.ctx;
    c.clearRect(0, 0, 512, 200);
    c.fillStyle = 'rgba(18, 52, 58, 0.88)';
    roundRect(c, 8, 8, 496, 184, 34);
    c.fill();
    c.strokeStyle = hot ? '#ffd35c' : '#f2e6c8';
    c.lineWidth = 6;
    c.stroke();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#f6eed8';
    c.font = '700 44px Rubik, system-ui, sans-serif';
    c.fillText(title, 256, 62);
    c.fillStyle = hot ? '#ffd35c' : '#ffffff';
    c.font = '800 84px Rubik, system-ui, sans-serif';
    c.fillText(`${secs} с`, 256, 136);
    c.font = '600 30px Rubik, system-ui, sans-serif';
    c.fillStyle = '#bfe3dc';
    c.fillText(`${n}/6`, 440, 152);
    this.tex.needsUpdate = true;
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

