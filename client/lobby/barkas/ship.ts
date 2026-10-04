// Баркас «Альбатрос»: солидный сейнер в море к юго-западу от маяка (shared/barkas.ts). Тёмно-бирюзовый корпус
// с кремовой полосой и кирпичной ватерлинией, лакированный планширь, задранный нос с якорем. Кремовая рубка с красной
// крышей, мачта с марсом и огнями, труба с дымком, тент над рулеткой, трюмный люк с сетью, барабан, жёлтая А-рама
// с блоком и буем, брашпиль, рында, прилавок Сани с вывеской «Бизнесмен», ведро матроса, калитка к лодке с колоколом,
// гирлянда сигнальных флажков.
// Всё неподвижное склеено в несколько сеток (общие материалы), огни — светящаяся сетка и ореолы. Твёрдое — невидимые
// боксы карты (barkasBoxes); здесь только картинка.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BARKAS, BARKAS_AFRAME, BARKAS_AWNING, BARKAS_BAK_Y, BARKAS_BELL, BARKAS_CRATES, BARKAS_DRUM, BARKAS_GATE, BARKAS_HATCH, BARKAS_HOUSE,
  BARKAS_RAIL_H, BARKAS_RAIL_T, BARKAS_RYNDA, BARKAS_WINDLASS, SANYA_STALL, barkasHalf,
} from '../../../shared/barkas.ts';
import { mergeColored, paint, place, staticMesh, type V3 } from '../../render/kit.ts';
import { makeFish3D } from '../fishart.ts';
import { Halos, type Halo } from './halos.ts';

const CZ = BARKAS.z;
const STERN = BARKAS.stern;
const STEM = BARKAS.bow;
const TEAL = 0x1f5a5e;
const CREAM = 0xeee4cb;
const RED = 0xa8452f;
const VARNISH = 0x8a5a32;
const DECK_A = 0xb08a5c;
const DECK_B = 0xa27d52;
const SEAM = 0x5e4630;
const HOUSE = 0xece3cd;
const ROOF = 0xb8433a;
const WHITE = 0xf2efe6;
const DARK = 0x2c3136;
const YELLOW = 0xe9b62f;
const ORANGE = 0xe8642c;
const NET = 0x55704c;
const BRASS = 0xc9a24a;
const ROPE = 0xc9b48a;

/** Высота борта (верх фальшборта) в сечении x: у бака выше, к форштевню задирается */
function railY(x: number): number {
  const bak = smooth((-67.4 - x) / 1.2) * 0.45;
  const rise = x < -68.6 ? 0.45 * ((-68.6 - x) / (-68.6 - STEM)) ** 2 : 0;
  return BARKAS_RAIL_H + bak + rise;
}

/** Высота палубы в сечении x: бак — на ступень выше */
function deckY(x: number): number {
  return x <= -68 ? BARKAS_BAK_Y : 0;
}

function smooth(k: number): number {
  const c = Math.max(0, Math.min(1, k));
  return c * c * (3 - 2 * c);
}

function at(g: THREE.BufferGeometry, color: number, x: number, y: number, z: number, ry = 0, rx = 0): THREE.BufferGeometry {
  return place(paint(g, color), x, y, z, ry, rx);
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, ry = 0, rx = 0): THREE.BufferGeometry {
  return at(new THREE.BoxGeometry(w, h, d), color, x, y, z, ry, rx);
}

function cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, color: number, seg = 10): THREE.BufferGeometry {
  return at(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z);
}

/** Труба-цилиндр между двумя точками */
function rod(a: V3, b: V3, r: number, color: number, seg = 6): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, len / 2, 0));
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
  g.translate(va.x, va.y, va.z);
  return paint(g, color);
}

/** Сетка (ряды × точки) из функции точки: индексы, нормали, один цвет */
function grid(rows: number, cols: number, pt: (i: number, j: number) => V3, color: number | ((i: number, j: number) => number)): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      pos.push(...pt(i, j));
      c.setHex(typeof color === 'number' ? color : color(i, j));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** Холст с надписью: белые буквы с тенью, прозрачный фон */
function label(text: string, w: number, h: number, font: string, color: string, shadow = 'rgba(0,0,0,.35)'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  c.font = font;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = shadow;
  c.fillText(text, w / 2 + 3, h / 2 + 4);
  c.fillStyle = color;
  c.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Сечения корпуса по длине: от транца к форштевню (у носа гуще) */
function sections(): number[] {
  const xs: number[] = [];
  for (let x = STERN; x > -68; x -= 1.1) xs.push(x);
  for (let i = 0; i <= 18; i++) xs.push(-68 + (STEM + 68) * (i / 18));
  return xs;
}

/** Ряды обшивки сверху вниз: [доля полуширины, высота]; между соседними — полоса своего цвета */
const ROWS: ReadonlyArray<(x: number) => readonly [number, number]> = [
  (x) => [1, railY(x)],
  (x) => [1, railY(x) - 0.26],
  () => [0.99, -0.9],
  () => [0.975, -1.0],
  () => [0.9, -1.4],
  () => [0.6, -1.95],
  () => [0, -2.2],
];
const BANDS = [CREAM, TEAL, WHITE, RED, RED, RED];

export class BarkasShip {
  readonly group = new THREE.Group();
  /** Ореолы всех огней — один вызов отрисовки */
  private readonly halos: Halos;
  private readonly rynda: THREE.Group;
  private readonly gateBell: THREE.Group;
  private ryndaT = 9;
  private gateT = 9;
  private readonly buoy: THREE.Group;
  readonly funnelTop = new THREE.Vector3(-64.55, 4.25, 69.45);
  private readonly flagMat: THREE.MeshStandardMaterial;

  /** wet — материал мокнет в дождь; wind — время ветра (флажки трепещут, как на площади) */
  constructor(scene: THREE.Scene, wet: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial, wind: THREE.IUniform<number>) {
    this.group.name = 'barkas-albatros';
    const solid: THREE.BufferGeometry[] = [];
    const metal: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];
    this.hull(solid);
    this.deck(solid);
    this.house(solid, metal, glow);
    this.awning(solid, metal);
    this.fishery(solid, metal);
    this.bow(solid, metal);
    this.stern(solid, metal);
    const halos = this.lamps(metal, glow);
    // двусторонние: обшивка и полотна собраны из сеток, у которых лицо может смотреть внутрь
    const solidMat = wet(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02, side: THREE.DoubleSide }));
    const metalMat = wet(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.45, side: THREE.DoubleSide }));
    this.group.add(staticMesh(mergeColored(solid), solidMat, false));
    this.group.add(staticMesh(mergeColored(metal), metalMat, false));
    const glowMesh = staticMesh(mergeColored(glow), new THREE.MeshBasicMaterial({ vertexColors: true }), false);
    this.group.add(glowMesh);
    this.names();
    this.flagMat = this.flags(wind);
    this.halos = new Halos(halos);
    this.group.add(this.halos.mesh);
    // рында и колокол у калитки — отдельно: качаются
    this.rynda = this.bell(BARKAS_RYNDA.x - 0.12, BARKAS_RYNDA.y, BARKAS_RYNDA.z, 0.15, Math.PI / 2);
    this.gateBell = this.bell(BARKAS_BELL.x, BARKAS_BELL.y + 0.32, BARKAS_BELL.z, 0.09, -Math.PI / 2);
    this.buoy = this.hangingBuoy();
    this.fishOnStall();
    scene.add(this.group);
  }

  /** Боцман бьёт склянки — рында качается */
  ringRynda(): void {
    this.ryndaT = 0;
  }

  /** Позвонили в колокол у калитки */
  ringGate(): void {
    this.gateT = 0;
  }

  update(dt: number, t: number, rain: number): void {
    // фонари горят всегда (как гирлянды набережной), в дождь — ярче; чуть мерцают
    this.halos.update(t, rain);
    this.ryndaT += dt;
    this.gateT += dt;
    this.rynda.rotation.x = Math.sin(this.ryndaT * 11) * 0.5 * Math.exp(-this.ryndaT * 1.6) * (this.ryndaT < 4 ? 1 : 0);
    this.gateBell.rotation.x = Math.sin(this.gateT * 14) * 0.6 * Math.exp(-this.gateT * 2.2) * (this.gateT < 3 ? 1 : 0);
    // буй на блоке А-рамы покачивается на ветру
    this.buoy.rotation.x = Math.sin(t * 0.9) * 0.06;
    this.buoy.rotation.z = Math.sin(t * 0.7 + 1) * 0.05;
    void this.flagMat;
  }

  // ------------------------------------------------------------ корпус

  private hull(out: THREE.BufferGeometry[]): void {
    const xs = sections();
    const n = xs.length;
    const t = (x: number): number => (x - STERN) / (STEM - STERN);
    // скошенный форштевень: у носа ниже борта обшивка уходит к корме
    const rake = (x: number, y: number): number => (railY(x) - y) * 0.3 * smooth((t(x) - 0.9) / 0.1);
    for (let b = 0; b < BANDS.length; b++) {
      for (const side of [-1, 1]) {
        out.push(grid(n, 2, (i, j) => {
          const x = xs[i];
          const [k, y] = ROWS[b + j](x);
          return [x + rake(x, y), y, CZ + side * k * barkasHalf(x)];
        }, BANDS[b]));
      }
    }
    // транец: ниже палубы — сплошной, выше — фальшборт с проёмом калитки
    const ring: Array<readonly [number, number]> = [];
    for (let r = 1; r < ROWS.length; r++) ring.push([ROWS[r](STERN)[0] * barkasHalf(STERN), ROWS[r](STERN)[1]]);
    const pts: number[] = [STERN, -1.1, CZ];
    const ringPts: Array<[number, number]> = [[-BARKAS.half, 0], ...ring.map(([z, y]) => [-z, y] as [number, number])];
    for (let r = ring.length - 2; r >= 0; r--) ringPts.push([ring[r][0], ring[r][1]]);
    ringPts.push([BARKAS.half, 0]);
    for (const [z, y] of ringPts) pts.push(STERN, Math.min(y, 0), CZ + z);
    const idx: number[] = [];
    for (let k = 1; k < ringPts.length; k++) idx.push(0, k + 1, k);
    idx.push(0, 1, ringPts.length);
    const tr = new THREE.BufferGeometry();
    tr.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    tr.setIndex(idx);
    tr.computeVertexNormals();
    const trColor = (y: number): number => (y > -0.9 ? TEAL : y > -1.0 ? WHITE : RED);
    const flat = paint(tr, TEAL);
    // полосы на транце: перекрасить по высоте
    const pa = flat.getAttribute('position');
    const ca = flat.getAttribute('color');
    const c = new THREE.Color();
    for (let i = 0; i < pa.count; i += 3) {
      const y = (pa.getY(i) + pa.getY(i + 1) + pa.getY(i + 2)) / 3;
      c.setHex(trColor(y));
      for (let v = 0; v < 3; v++) ca.setXYZ(i + v, c.r, c.g, c.b);
    }
    out.push(flat);
    const T = BARKAS_RAIL_T;
    for (const [z0, z1] of [[CZ - BARKAS.half, BARKAS_GATE.z0], [BARKAS_GATE.z1, CZ + BARKAS.half]]) {
      out.push(box(T, BARKAS_RAIL_H - 0.26, z1 - z0, STERN - T / 2, (BARKAS_RAIL_H - 0.26) / 2, (z0 + z1) / 2, TEAL));
      out.push(box(T, 0.26, z1 - z0, STERN - T / 2, BARKAS_RAIL_H - 0.13, (z0 + z1) / 2, CREAM));
      out.push(box(T + 0.1, 0.05, z1 - z0 + 0.04, STERN - T / 2, BARKAS_RAIL_H + 0.025, (z0 + z1) / 2, VARNISH));
    }
    // фальшборт изнутри (светлый) и планширь (лак): по обводу, над палубой
    const inner = (x: number): number => Math.max(0.05, barkasHalf(x) - T);
    for (const side of [-1, 1]) {
      out.push(grid(n, 2, (i, j) => [xs[i], j ? railY(xs[i]) : deckY(xs[i]) - 0.01, CZ + side * inner(xs[i])], 0xe2dac4));
      out.push(grid(n, 2, (i, j) => [xs[i], railY(xs[i]) + 0.045, CZ + side * (j ? barkasHalf(xs[i]) + 0.03 : inner(xs[i]) - 0.03)], VARNISH));
      // шпигаты: тёмные прорези у палубы снаружи
      for (let x = -48; x > -67; x -= 2.2) out.push(box(0.36, 0.1, 0.03, x, 0.06, CZ + side * (BARKAS.half + 0.005), 0x16282a));
      // привальный брус над ватерлинией
      out.push(grid(n, 2, (i, j) => [xs[i], -0.5 + j * 0.09, CZ + side * (barkasHalf(xs[i]) * 0.993 + 0.03)], 0x173f42));
    }
  }

  private deck(out: THREE.BufferGeometry[]): void {
    // главная палуба: доски вдоль корабля
    const half = BARKAS.half - BARKAS_RAIL_T;
    const plank = 0.17;
    const n = Math.round((2 * half) / plank);
    for (let j = 0; j < n; j++) {
      const z0 = CZ - half + j * plank;
      const tone = j % 3 === 0 ? DECK_B : j % 3 === 1 ? DECK_A : 0xa9855a;
      out.push(grid(2, 2, (i, k) => [i ? -68 : STERN - BARKAS_RAIL_T, 0.002, z0 + k * plank], tone));
      out.push(grid(2, 2, (i, k) => [i ? -68 : STERN - BARKAS_RAIL_T, 0.004, z0 + k * 0.012], SEAM));
      // бак: доска от ступени до места, где обвод уже неё
      const need = Math.max(Math.abs(z0 - CZ), Math.abs(z0 + plank - CZ));
      let xf = -68;
      while (xf > STEM + 0.4 && barkasHalf(xf - 0.05) - BARKAS_RAIL_T >= need) xf -= 0.05;
      if (xf < -68.05) {
        out.push(grid(2, 2, (i, k) => [i ? xf : -68, BARKAS_BAK_Y + 0.002, z0 + k * plank], tone));
        out.push(grid(2, 2, (i, k) => [i ? xf : -68, BARKAS_BAK_Y + 0.004, z0 + k * 0.012], SEAM));
      }
    }
    // ступень на бак (лицом к корме) и её окантовка
    out.push(grid(2, 2, (i, j) => [-68, i * BARKAS_BAK_Y, CZ - half + j * 2 * half], 0x8c6a45));
    out.push(box(0.06, 0.03, 2 * half, -67.98, BARKAS_BAK_Y + 0.01, CZ, 0x6b5036));
  }

  // ------------------------------------------------------------ рубка, мачта, труба

  private house(out: THREE.BufferGeometry[], metal: THREE.BufferGeometry[], glow: THREE.BufferGeometry[]): void {
    const H = BARKAS_HOUSE;
    const w = H.x1 - H.x0;
    const d = H.z1 - H.z0;
    const cx = (H.x0 + H.x1) / 2;
    out.push(box(w, H.h, d, cx, H.h / 2, CZ, HOUSE));
    out.push(box(w + 0.02, 0.28, d + 0.02, cx, 0.14, CZ, TEAL));
    out.push(box(w + 0.6, 0.12, d + 0.6, cx, H.h + 0.06, CZ, ROOF));
    out.push(box(w + 0.64, 0.05, d + 0.64, cx, H.h + 0.005, CZ, 0x7e2c25));
    // окна: спереди три (смотрят на нос), по бокам по два, сзади дверь и окно; свет внутри — тёплый
    const win = (x: number, z: number, ww: number, hh: number, ry: number): void => {
      glow.push(at(new THREE.PlaneGeometry(ww, hh), 0xffd59a, x, 1.75, z, ry));
      out.push(at(new THREE.BoxGeometry(ww + 0.12, 0.06, 0.05), 0x5c6168, x, 1.75 - hh / 2 - 0.03, z, ry));
      out.push(at(new THREE.BoxGeometry(ww + 0.12, 0.06, 0.05), 0x5c6168, x, 1.75 + hh / 2 + 0.03, z, ry));
      out.push(at(new THREE.BoxGeometry(0.05, hh, 0.05), 0x5c6168, x, 1.75, z, ry));
    };
    for (const z of [-1.25, 0, 1.25]) win(H.x0 - 0.011, CZ + z, 1.0, 0.62, -Math.PI / 2);
    for (const side of [-1, 1]) for (const x of [-67.1, -65.2]) win(x, CZ + side * (d / 2 + 0.011), 0.9, 0.6, side < 0 ? Math.PI : 0);
    win(H.x1 + 0.011, CZ + 1.15, 0.8, 0.55, Math.PI / 2);
    // дверь сзади: тёмная, с иллюминатором и ручкой
    out.push(box(0.05, 1.85, 0.8, H.x1 + 0.02, 0.97, CZ - 0.55, 0x2f5f63));
    glow.push(at(new THREE.CircleGeometry(0.13, 14), 0xffd59a, H.x1 + 0.05, 1.5, CZ - 0.55, Math.PI / 2));
    metal.push(box(0.06, 0.04, 0.14, H.x1 + 0.06, 1.0, CZ - 0.25, BRASS));
    // спасательные круги на бортах рубки
    for (const side of [-1, 1]) {
      const ring = new THREE.TorusGeometry(0.3, 0.075, 8, 18);
      out.push(at(ring.clone(), ORANGE, -66.2, 1.3, CZ + side * (d / 2 + 0.08), side < 0 ? Math.PI : 0));
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        out.push(at(new THREE.BoxGeometry(0.1, 0.16, 0.17), WHITE, -66.2 + Math.cos(a) * 0.3, 1.3 + Math.sin(a) * 0.3, CZ + side * (d / 2 + 0.08), 0, 0));
      }
    }
    // поручни на крыше
    const top = H.h + 0.12;
    for (const [x0, z0, x1, z1] of [[H.x0 - 0.2, H.z0 - 0.2, H.x1 + 0.2, H.z0 - 0.2], [H.x0 - 0.2, H.z1 + 0.2, H.x1 + 0.2, H.z1 + 0.2], [H.x0 - 0.2, H.z0 - 0.2, H.x0 - 0.2, H.z1 + 0.2]] as const) {
      metal.push(rod([x0, top + 0.55, z0], [x1, top + 0.55, z1], 0.025, WHITE));
      metal.push(rod([x0, top + 0.28, z0], [x1, top + 0.28, z1], 0.018, WHITE));
      const len = Math.hypot(x1 - x0, z1 - z0);
      const k = Math.max(1, Math.round(len / 0.9));
      for (let i = 0; i <= k; i++) metal.push(rod([x0 + ((x1 - x0) * i) / k, top, z0 + ((z1 - z0) * i) / k], [x0 + ((x1 - x0) * i) / k, top + 0.55, z0 + ((z1 - z0) * i) / k], 0.022, WHITE));
    }
    // прожектор на крыше
    metal.push(cyl(0.16, 0.16, 0.22, -67.75, top + 0.32, CZ - 1.2, 0xd8d8d0, 12).rotateZ(0));
    metal.push(cyl(0.05, 0.05, 0.2, -67.75, top + 0.11, CZ - 1.2, DARK));
    glow.push(at(new THREE.CircleGeometry(0.13, 14), 0xfff1c8, -67.92, top + 0.32, CZ - 1.2, -Math.PI / 2));
    // мачта на передней кромке крыши: марс, рея, топовый огонь, антенна
    const mx = -67.25;
    out.push(cyl(0.07, 0.11, 6.6, mx, top + 3.3, CZ, 0xd9d2bf, 10));
    out.push(cyl(0.48, 0.48, 0.06, mx, 6.75, CZ, 0x7a5a3a, 14));
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      metal.push(rod([mx + Math.cos(a) * 0.46, 6.78, CZ + Math.sin(a) * 0.46], [mx + Math.cos(a) * 0.46, 7.25, CZ + Math.sin(a) * 0.46], 0.015, WHITE, 4));
    }
    metal.push(at(new THREE.TorusGeometry(0.46, 0.022, 4, 20).rotateX(Math.PI / 2), WHITE, mx, 7.25, CZ));
    out.push(at(new THREE.CylinderGeometry(0.035, 0.05, 2.6, 6).rotateX(Math.PI / 2), 0xd9d2bf, mx, 8.0, CZ));
    // ванты: от мачты к фальшборту у рубки
    for (const side of [-1, 1]) {
      metal.push(rod([mx, 7.9, CZ], [-66.4, railY(-66.4) + 0.05, CZ + side * (BARKAS.half - 0.08)], 0.012, 0x3a3e42, 4));
      metal.push(rod([mx, 7.9, CZ], [-68.8, railY(-68.8) + 0.05, CZ + side * (barkasHalf(-68.8) - 0.08)], 0.012, 0x3a3e42, 4));
    }
    // труба: кремовая с красной полосой и чёрным верхом
    const [fx, , fz] = [this.funnelTop.x, 0, this.funnelTop.z];
    out.push(cyl(0.3, 0.34, 1.3, fx, top + 0.65, fz, CREAM, 16));
    out.push(cyl(0.305, 0.315, 0.3, fx, top + 0.92, fz, RED, 16));
    out.push(cyl(0.29, 0.3, 0.22, fx, top + 1.21, fz, 0x1f2224, 16));
    // ходовые огни: зелёный — правый борт (север), красный — левый (юг), белый — на топе
    for (const [z, color] of [[H.z0 - 0.18, 0x47e07a], [H.z1 + 0.18, 0xff4a3a]] as const) {
      out.push(box(0.3, 0.26, 0.06, H.x0 + 0.3, top + 0.25, z, 0x2a2e33));
      glow.push(at(new THREE.SphereGeometry(0.075, 10, 8), color, H.x0 + 0.3, top + 0.27, z + (z < CZ ? -0.06 : 0.06)));
    }
    glow.push(at(new THREE.SphereGeometry(0.09, 10, 8), 0xfff6dc, mx, top + 6.66, CZ));
  }

  // ------------------------------------------------------------ тент над рулеткой

  private awning(out: THREE.BufferGeometry[], metal: THREE.BufferGeometry[]): void {
    const A = BARKAS_AWNING;
    for (const x of [A.x0, A.x1]) for (const z of [A.z0, A.z1]) metal.push(cyl(A.post, A.post, A.h, x, A.h / 2, z, WHITE, 8));
    // полотно: двускатное, полосами кремовый/красный, с фестонами по краям
    const stripes = 9;
    const ridge = 0.32;
    for (let s = 0; s < stripes; s++) {
      const x0 = A.x0 - 0.1 + ((A.x1 - A.x0 + 0.2) * s) / stripes;
      const x1 = A.x0 - 0.1 + ((A.x1 - A.x0 + 0.2) * (s + 1)) / stripes;
      const col = s % 2 ? 0xf1e7cf : 0xc8473b;
      for (const side of [-1, 1]) {
        out.push(grid(2, 2, (i, j) => [i ? x1 : x0, A.h + (j ? 0 : ridge), CZ + side * (j ? (A.z1 - A.z0) / 2 + 0.12 : 0)], col));
        // фестон: короткий фартук по краю
        out.push(grid(2, 2, (i, j) => [i ? x1 : x0, A.h - j * 0.2, CZ + side * ((A.z1 - A.z0) / 2 + 0.12)], col));
      }
    }
    for (const x of [A.x0 - 0.1, A.x1 + 0.1]) {
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([
        x, A.h, A.z0 - 0.12, x, A.h + ridge, CZ, x, A.h, A.z1 + 0.12,
      ], 3));
      tri.computeVertexNormals();
      out.push(paint(tri, 0xf1e7cf));
    }
    metal.push(rod([A.x0, A.h + ridge, CZ], [A.x1, A.h + ridge, CZ], 0.03, WHITE));
  }

  // ------------------------------------------------------------ промысловая палуба: люк, сеть, барабан, ящики

  private fishery(out: THREE.BufferGeometry[], metal: THREE.BufferGeometry[]): void {
    const K = BARKAS_HATCH;
    const kx = (K.x0 + K.x1) / 2;
    const kz = (K.z0 + K.z1) / 2;
    out.push(box(K.x1 - K.x0, K.h - 0.06, K.z1 - K.z0, kx, (K.h - 0.06) / 2, kz, 0x2f6a6c));
    out.push(box(K.x1 - K.x0 + 0.08, 0.06, K.z1 - K.z0 + 0.08, kx, K.h - 0.03, kz, 0x24302b));
    out.push(box(K.x1 - K.x0 - 0.1, 0.03, K.z1 - K.z0 - 0.1, kx, K.h + 0.005, kz, 0x3d5a46));
    // сеть на люке: складки, поплавки
    for (let i = 0; i < 9; i++) {
      const x = K.x0 + 0.3 + i * 0.27;
      out.push(at(new THREE.CylinderGeometry(0.09, 0.09, 1.6 - (i % 3) * 0.25, 8).rotateX(Math.PI / 2), NET, x, K.h + 0.06, kz + 0.25 - (i % 2) * 0.15));
      if (i % 2 === 0) out.push(at(new THREE.SphereGeometry(0.05, 8, 6), ORANGE, x, K.h + 0.14, kz - 0.55));
    }
    // барабан с сетью: ось вдоль Z, на двух стойках, красные щёки
    const R = BARKAS_DRUM;
    out.push(at(new THREE.CylinderGeometry(R.r * 0.92, R.r * 0.92, R.len - 0.2, 18).rotateX(Math.PI / 2), NET, R.x, R.y, R.z));
    for (let i = 0; i < 6; i++) out.push(at(new THREE.TorusGeometry(R.r * 0.93, 0.025, 5, 18), 0x6e8b5c, R.x, R.y, R.z - 0.8 + i * 0.32));
    for (const s of [-1, 1]) {
      metal.push(at(new THREE.CylinderGeometry(R.r + 0.14, R.r + 0.14, 0.06, 20).rotateX(Math.PI / 2), RED, R.x, R.y, R.z + s * (R.len / 2 - 0.06)));
      metal.push(rod([R.x - 0.45, 0, R.z + s * (R.len / 2 + 0.02)], [R.x, R.y, R.z + s * (R.len / 2 + 0.02)], 0.05, 0x3b4246));
      metal.push(rod([R.x + 0.45, 0, R.z + s * (R.len / 2 + 0.02)], [R.x, R.y, R.z + s * (R.len / 2 + 0.02)], 0.05, 0x3b4246));
    }
    // сеть с барабана — к Толику на колени
    out.push(grid(6, 2, (i, j) => {
      const k = i / 5;
      return [R.x - R.r * 0.9 - k * 1.25, R.y - 0.15 - Math.sin(k * Math.PI) * 0.55 - k * 0.05, R.z - 0.45 + j * 0.9];
    }, NET));
    // ящики со льдом и рыбой в северном углу у кормы
    const C = BARKAS_CRATES;
    for (let i = 0; i < 3; i++) {
      for (let lvl = 0; lvl < (i === 1 ? 2 : 3); lvl++) {
        const x = C.x0 + 0.25 + i * 0.47;
        out.push(crate(x, lvl * 0.28, (C.z0 + C.z1) / 2, 0.44, 0.27, 0.86, lvl === (i === 1 ? 1 : 2)));
      }
    }
    // бухты каната у фальшборта
    for (const [x, z] of [[-62.5, 64.95], [-50.9, 71.05]] as const) {
      for (let k = 0; k < 4; k++) out.push(at(new THREE.TorusGeometry(0.28 - k * 0.045, 0.035, 5, 16).rotateX(Math.PI / 2), ROPE, x, 0.04 + k * 0.035, z));
    }
    // ведро матроса Витька (он драит палубу рядом — BARKAS_CREW.vityok): оцинковка, вода, дужка
    const [bx, bz] = [-48.76, 65.02];
    metal.push(cyl(0.15, 0.115, 0.3, bx, 0.15, bz, 0xa4abae, 14));
    metal.push(at(new THREE.TorusGeometry(0.15, 0.012, 5, 16).rotateX(Math.PI / 2), 0x8d9497, bx, 0.3, bz));
    out.push(at(new THREE.CircleGeometry(0.14, 14).rotateX(-Math.PI / 2), 0x5d7f86, bx, 0.26, bz));
    metal.push(at(new THREE.TorusGeometry(0.15, 0.008, 4, 14, Math.PI), 0x6f7679, bx, 0.3, bz, 0.5, -0.35));
  }

  // ------------------------------------------------------------ бак: брашпиль, якорь, рында

  private bow(out: THREE.BufferGeometry[], metal: THREE.BufferGeometry[]): void {
    const W = BARKAS_WINDLASS;
    const wx = (W.x0 + W.x1) / 2;
    const y = BARKAS_BAK_Y;
    metal.push(box(W.x1 - W.x0, 0.12, W.z1 - W.z0, wx, y + 0.06, CZ, 0x3b4246));
    for (const s of [-1, 1]) metal.push(box(0.5, 0.5, 0.08, wx, y + 0.35, CZ + s * 0.5, 0x2f6a6c));
    metal.push(at(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 14).rotateX(Math.PI / 2), 0x4a5055, wx, y + 0.38, CZ));
    // якорная цепь: от брашпиля к клюзу
    const a: V3 = [W.x0, y + 0.3, CZ - 0.1];
    const b: V3 = [-73.25, y + 0.22, CZ - 0.55];
    for (let i = 0; i < 12; i++) {
      const k = i / 11;
      const p: V3 = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k + 0.02, a[2] + (b[2] - a[2]) * k];
      metal.push(at(new THREE.TorusGeometry(0.05, 0.016, 4, 8), 0x2d3033, p[0], p[1], p[2], Math.PI / 2 + (i % 2) * 0.3, (i % 2) * Math.PI / 2));
    }
    // якорь снаружи у клюза
    const ax = -73.05;
    const az = CZ - barkasHalf(ax) - 0.06;
    metal.push(rod([ax, -0.85, az], [ax, 0.15, az], 0.05, 0x2d3033));
    metal.push(rod([ax - 0.35, -0.75, az], [ax + 0.35, -0.75, az], 0.04, 0x2d3033));
    for (const s of [-1, 1]) metal.push(rod([ax, -0.85, az], [ax + s * 0.3, -0.62, az - 0.05], 0.05, 0x2d3033));
    metal.push(at(new THREE.TorusGeometry(0.08, 0.025, 4, 10), 0x2d3033, ax, 0.22, az, Math.PI / 2));
    // бухта на баке: в углу у южного борта между брашпилем и музыкальным автоматом (shared/jukebox.ts — JUKEBOX_BARKAS)
    for (let k = 0; k < 4; k++) out.push(at(new THREE.TorusGeometry(0.28 - k * 0.05, 0.035, 5, 16).rotateX(Math.PI / 2), ROPE, -71.62, y + 0.04 + k * 0.035, CZ + 1.32));
    // кронштейн рынды на передней стенке рубки
    metal.push(box(0.3, 0.05, 0.05, BARKAS_RYNDA.x - 0.12, BARKAS_RYNDA.y + 0.06, BARKAS_RYNDA.z, BRASS));
  }

  // ------------------------------------------------------------ корма: А-рама, калитка, прилавок Сани

  private stern(out: THREE.BufferGeometry[], metal: THREE.BufferGeometry[]): void {
    const F = BARKAS_AFRAME;
    const topX = F.x + 0.55;
    for (const z of [F.z0, F.z1]) {
      metal.push(rod([F.x, 0, z], [topX, F.h, z], 0.11, YELLOW, 10));
      metal.push(rod([F.x - 0.6, 0, z], [topX - 0.05, F.h - 0.6, z], 0.06, YELLOW, 8));
    }
    metal.push(rod([topX, F.h, F.z0 - 0.1], [topX, F.h, F.z1 + 0.1], 0.12, YELLOW, 10));
    // блок и трос с буем
    metal.push(cyl(0.14, 0.14, 0.12, topX, F.h - 0.25, CZ, 0x3a4044, 14).rotateZ(0));
    metal.push(rod([topX, F.h - 0.3, CZ], [topX, 3.05, CZ], 0.015, ROPE, 4));
    // спасательные круги на ножках
    for (const z of [F.z0, F.z1]) {
      out.push(at(new THREE.TorusGeometry(0.27, 0.07, 8, 18), ORANGE, F.x + 0.12, 1.55, z + (z < CZ ? -0.13 : 0.13)));
    }
    // калитка: столбики, створка открыта внутрь
    for (const z of [BARKAS_GATE.z0, BARKAS_GATE.z1]) out.push(box(0.14, 1.15, 0.14, STERN - 0.08, 0.575, z, VARNISH));
    out.push(box(0.75, 0.06, 0.05, STERN - 0.5, 0.85, BARKAS_GATE.z0 + 0.12, VARNISH, 0.25));
    out.push(box(0.75, 0.06, 0.05, STERN - 0.5, 0.35, BARKAS_GATE.z0 + 0.12, VARNISH, 0.25));
    // трап к лодке: две ступени снаружи транца
    for (const [y, dx] of [[-0.3, 0.1], [-0.65, 0.16]] as const) out.push(box(0.18, 0.05, 1.2, STERN + dx, y, CZ, 0x8a6b45));
    for (const s of [-1, 1]) metal.push(rod([STERN + 0.02, 0, CZ + s * 0.62], [STERN + 0.22, -0.75, CZ + s * 0.62], 0.025, 0x8a8f90));
    // прилавок Сани: ящики со льдом и рыбой
    const S = SANYA_STALL;
    const sx = (S.x0 + S.x1) / 2;
    for (let i = 0; i < 3; i++) {
      const z = S.z0 + 0.28 + i * 0.52;
      out.push(crate(sx, 0, z, S.x1 - S.x0, 0.46, 0.5, false));
      out.push(crate(sx, 0.46, z, S.x1 - S.x0, 0.46, 0.5, true));
    }
    // вывеска «Бизнесмен» (Саня — скупка улова) на южной ножке А-рамы, лицом к палубе
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.5), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.9, side: THREE.DoubleSide }));
    // висит на подкосе ножки (он западнее самой ножки и на высоте вывески — у x ≈ F.x): доска — перед подкосом
    const braceX = F.x - 0.6 + (0.55 - 0.05 + 0.6) * (1.95 / (F.h - 0.6));
    sign.position.set(braceX - 0.15, 2.25, F.z1 - 0.2);
    sign.rotation.y = -Math.PI / 2;
    sign.matrixAutoUpdate = false;
    sign.updateMatrix();
    this.group.add(sign);
    out.push(box(0.05, 0.58, 1.58, braceX - 0.12, 2.25, F.z1 - 0.2, 0x5a4632));
    // два хомута на подкосе
    for (const dz of [-0.5, 0.5]) metal.push(box(0.12, 0.04, 0.06, braceX - 0.05, 2.45, F.z1 - 0.2 + dz, 0x3a3f42));
  }

  // ------------------------------------------------------------ название, флажки, огни

  private names(): void {
    const tex = label('АЛЬБАТРОС', 1024, 192, '800 132px Rubik, system-ui, sans-serif', '#f6eed8');
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    // три надписи — одна сетка
    const planes: THREE.BufferGeometry[] = [];
    const add = (x: number, y: number, z: number, ry: number, w: number): void => {
      planes.push(new THREE.PlaneGeometry(w, w * 0.1875).rotateY(ry).translate(x, y, z));
    };
    // на скулах: борт у бака сужается — надпись повёрнута по нему
    const x0 = -71.3;
    const x1 = -69.1;
    const slope = Math.atan2(barkasHalf(x1) - barkasHalf(x0), x1 - x0);
    const xm = (x0 + x1) / 2;
    const hm = barkasHalf(xm) + 0.035;
    add(xm, 0.55, CZ - hm, Math.PI + slope, 2.4);
    add(xm, 0.55, CZ + hm, -slope, 2.4);
    // на транце (лицом на восток, к острову)
    add(STERN + 0.012, -0.45, CZ, Math.PI / 2, 3.2);
    const m = new THREE.Mesh(mergeGeometries(planes, false)!, mat);
    m.matrixAutoUpdate = false;
    this.group.add(m);
  }

  private flags(wind: THREE.IUniform<number>): THREE.MeshStandardMaterial {
    const mastTop: V3 = [-67.25, 9.15, CZ];
    const lines: Array<[V3, V3, number]> = [
      [[STEM + 0.05, railY(STEM) + 0.25, CZ], mastTop, 0.6],
      [mastTop, [BARKAS_AFRAME.x + 0.55, BARKAS_AFRAME.h, CZ], 1.2],
    ];
    const colors = [0xd8352b, 0xf2c230, 0x2f5fb3, 0xf4f1e8, 0x1d1f22, 0x3aa35a, 0xe8642c];
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    const tip: number[] = [];
    const phase: number[] = [];
    const rope: number[] = [];
    const c = new THREE.Color();
    let k = 0;
    for (const [a, b, sag] of lines) {
      const atT = (t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const steps = Math.round(len / 0.5);
      for (let i = 0; i < steps; i++) rope.push(...atT(i / steps), ...atT((i + 1) / steps));
      const n = Math.floor(len / 0.62);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const p = atT(t);
        const q = atT(t + 0.42 / len);
        c.setHex(colors[k % colors.length]);
        const tri = k % 3 === 2;
        k++;
        const ph = t * 23 + a[0];
        // флажок свисает с верёвки: верхняя кромка — по верёвке, низ — на 0,5 м ниже
        const quad: Array<[V3, number]> = tri
          ? [[p, 0], [q, 0], [[(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - 0.5, (p[2] + q[2]) / 2], 1]]
          : [[p, 0], [q, 0], [[q[0], q[1] - 0.42, q[2]], 1], [p, 0], [[q[0], q[1] - 0.42, q[2]], 1], [[p[0], p[1] - 0.42, p[2]], 1]];
        for (const [v, isTip] of quad) {
          pos.push(...v);
          nor.push(0, 0, 1);
          col.push(c.r, c.g, c.b);
          tip.push(isTip);
          phase.push(ph);
        }
      }
    }
    const lineMesh = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(rope, 3)), new THREE.LineBasicMaterial({ color: 0x2a2622 }));
    this.group.add(lineMesh);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = wind;
      shader.vertexShader = 'uniform float uWind;\nattribute float aTip;\nattribute float aPhase;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.z += (sin(uWind * 5.6 + aPhase) * 0.14 + 0.08) * aTip;
        transformed.x += (sin(uWind * 4.1 + aPhase * 1.3) * 0.08 + 0.12) * aTip;`,
      );
    };
    mat.customProgramCacheKey = () => 'barkas-flags';
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mat;
  }

  /** Фонари (оправа — в металл, стекло — в светящееся) и ореолы всех огней: топовый, ходовые, фонари, окна рубки */
  private lamps(metal: THREE.BufferGeometry[], glow: THREE.BufferGeometry[]): Halo[] {
    const H = BARKAS_HOUSE;
    const top = H.h + 0.12;
    const out: Halo[] = [];
    const add = (color: number, size: number, x: number, y: number, z: number, opacity: number): void => {
      out.push({ color, size, x, y, z, opacity });
    };
    add(0xfff3d6, 1.6, -67.25, top + 6.66, CZ, 0.55);
    add(0x47e07a, 1.0, H.x0 + 0.3, top + 0.27, H.z0 - 0.3, 0.55);
    add(0xff4a3a, 1.0, H.x0 + 0.3, top + 0.27, H.z1 + 0.3, 0.55);
    // фонари под тентом и рабочий свет на А-раме — тёплые, освещают палубу
    const A = BARKAS_AWNING;
    for (const z of [A.z0, A.z1]) {
      lantern(metal, glow, A.x1, A.h - 0.35, z);
      add(0xffc27a, 2.2, A.x1, A.h - 0.42, z, 0.5);
    }
    lantern(metal, glow, BARKAS_AFRAME.x + 0.5, BARKAS_AFRAME.h - 0.45, CZ - 0.7);
    add(0xffd9a0, 2.6, BARKAS_AFRAME.x + 0.5, BARKAS_AFRAME.h - 0.52, CZ - 0.7, 0.45);
    // окна рубки светятся и снаружи — чуть-чуть
    add(0xffcf8a, 3.4, H.x0 - 0.3, 1.75, CZ, 0.16);
    // фонарь у калитки (у колокола)
    lantern(metal, glow, STERN - 0.08, 1.35, BARKAS_GATE.z1);
    add(0xffc27a, 1.8, STERN - 0.08, 1.28, BARKAS_GATE.z1, 0.5);
    return out;
  }

  /** Колокол на подвесе: поворачивается вокруг крюка */
  private bell(x: number, y: number, z: number, r: number, ry: number): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.order = 'YXZ';
    g.rotation.y = ry;
    const parts: THREE.BufferGeometry[] = [];
    const prof = [new THREE.Vector2(0.001, -0.02), new THREE.Vector2(r * 0.55, -0.03), new THREE.Vector2(r * 0.7, -r * 0.6), new THREE.Vector2(r, -r * 1.3), new THREE.Vector2(r * 1.08, -r * 1.42), new THREE.Vector2(r * 0.95, -r * 1.4)];
    parts.push(paint(new THREE.LatheGeometry(prof, 16), BRASS));
    parts.push(at(new THREE.TorusGeometry(r * 0.25, r * 0.08, 5, 10), BRASS, 0, 0, 0));
    parts.push(at(new THREE.SphereGeometry(r * 0.22, 8, 6), 0x8a7240, 0, -r * 1.25, 0));
    parts.push(at(new THREE.CylinderGeometry(0.008, 0.008, 0.45, 4), ROPE, 0, -r * 1.45 - 0.22, 0));
    const m = new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.75 }));
    g.add(m);
    this.group.add(g);
    return g;
  }

  /** Оранжевый буй на тросе с блока А-рамы */
  private hangingBuoy(): THREE.Group {
    const g = new THREE.Group();
    g.position.set(BARKAS_AFRAME.x + 0.55, 3.05, CZ);
    const parts = [at(new THREE.SphereGeometry(0.32, 14, 10), ORANGE, 0, -0.3, 0), at(new THREE.CylinderGeometry(0.33, 0.33, 0.06, 14), WHITE, 0, -0.3, 0)];
    g.add(new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })));
    this.group.add(g);
    return g;
  }

  /** Рыба на прилавке Сани — несколько штук в ящиках со льдом (одной сеткой, материал общий с рыбой игры) */
  private fishOnStall(): void {
    const S = SANYA_STALL;
    const sx = (S.x0 + S.x1) / 2;
    const fish: THREE.Group[] = [];
    for (let i = 0; i < 4; i++) {
      const f = makeFish3D(i % 3, 400 + i * 150);
      f.scale.multiplyScalar(0.8);
      f.position.set(sx + (i % 2 ? 0.12 : -0.12), S.h + 0.03, S.z0 + 0.35 + i * 0.36);
      f.rotation.y = Math.PI / 2 + (i % 2 ? 0.25 : -0.2);
      f.updateMatrixWorld(true);
      fish.push(f);
    }
    const bodies = fish.map((f) => f.children[0] as THREE.Mesh);
    const merged = mergeGeometries(bodies.map((b) => b.geometry.clone().applyMatrix4(b.matrixWorld)), false);
    if (!merged) {
      for (const f of fish) this.group.add(f);
      return;
    }
    this.group.add(staticMesh(merged, bodies[0].material as THREE.Material, false));
  }
}

/** Фонарь «летучая мышь»: тёплое стекло в оправе на крюке (оправа — в металл, стекло — в светящееся) */
function lantern(metal: THREE.BufferGeometry[], glow: THREE.BufferGeometry[], x: number, y: number, z: number): void {
  metal.push(at(new THREE.CylinderGeometry(0.08, 0.1, 0.05, 8), 0x2f3337, x, y - 0.15, z));
  metal.push(at(new THREE.CylinderGeometry(0.06, 0.08, 0.06, 8), 0x2f3337, x, y + 0.12, z));
  metal.push(at(new THREE.TorusGeometry(0.06, 0.008, 4, 10, Math.PI), 0x2f3337, x, y + 0.17, z));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    metal.push(rod([x + Math.cos(a) * 0.075, y - 0.13, z + Math.sin(a) * 0.075], [x + Math.cos(a) * 0.06, y + 0.1, z + Math.sin(a) * 0.06], 0.008, 0x2f3337, 4));
  }
  glow.push(paint(new THREE.CylinderGeometry(0.055, 0.07, 0.22, 8).translate(x, y - 0.015, z), 0xffc77a));
}

/** Ящик: дно, рейки по бокам, лёд или рыба сверху (верхний ряд) */
function crate(x: number, y: number, z: number, w: number, h: number, d: number, top: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(w, 0.03, d, x, y + 0.015, z, 0x8e7556));
  for (let yy = y + 0.07; yy < y + h; yy += 0.11) {
    for (const s of [-1, 1]) {
      parts.push(box(w, 0.08, 0.025, x, yy, z + (s * d) / 2, 0x9b8263));
      parts.push(box(0.025, 0.08, d, x + (s * w) / 2, yy, z, 0x8e7556));
    }
  }
  if (top) parts.push(box(w - 0.06, 0.04, d - 0.06, x, y + h - 0.06, z, 0xdfeef2));
  return mergeColored(parts);
}

/** Вывеска Сани: доска, крупно «БИЗНЕСМЕН», ниже мелко «Саня · скупка улова» (шрифт загрузился — перерисовать) */
function signTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 170;
  const c = canvas.getContext('2d')!;
  const line = (text: string, weight: number, px: number, y: number, color: string): void => {
    c.font = `${weight} ${px}px Rubik, system-ui, sans-serif`;
    const w = c.measureText(text).width;
    // не шире доски: длинная строка — мельче
    if (w > 460) c.font = `${weight} ${Math.floor((px * 460) / w)}px Rubik, system-ui, sans-serif`;
    c.fillStyle = color;
    c.fillText(text, 256, y);
  };
  const draw = (): void => {
    c.fillStyle = '#2f5f63';
    c.fillRect(0, 0, 512, 170);
    c.strokeStyle = '#e9dfc4';
    c.lineWidth = 6;
    c.strokeRect(10, 10, 492, 150);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    line('БИЗНЕСМЕН', 800, 68, 70, '#f4ead0');
    line('Саня · скупка улова', 600, 32, 126, '#ffd36b');
  };
  draw();
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  document.fonts?.load('800 68px Rubik').then(() => {
    draw();
    t.needsUpdate = true;
  }).catch(() => {});
  return t;
}

/** Только для проверок формы (тест): обвод палубы в точке x и высота борта */
export const shipShape = { railY, deckY };
