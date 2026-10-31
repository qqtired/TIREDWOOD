// Лагерь Барона с катапультой (К-4) — только вид. Модель кодом three.js по образцу крепости: всё, что двигается,
// — жёсткие части одного «скелета» (SkinnedMesh, у каждой вершины одна кость; флаг — цепочка из трёх костей с
// плавными весами). Цвета в вершинах, один атлас (матовое, полуглянец, глянец, стяг, клетка крышки банки).
//  • лагерь: две полосатые палатки армии Барона (круглая и двускатная) с вымпелами, стяг — шест с банкой варенья
//    в короне и флагом с банкой, частокол дугой (вход — к крепости), бочки, ящики, мешки, костёр с котлом варенья,
//    сундук, куча брёвен для стройки, камни-снаряды, утоптанная земля (прозрачная по краю наклейка);
//  • катапульта (противовесная, на колёсах): стадия 1 — рама и стойки, 2 — рычаг с противовесом и ворот с канатом,
//    3 — праща с камнем. Рычаг взведён назад, при замахе ворот дотягивает его ещё ниже (щелчки храповика, дрожь),
//    камень загорается красным; выстрел — рычаг бьёт вперёд и качается, праща хлёстом бросает камень по дуге
//    точно в цель к landAt, рама откатывается и приподнимает перёд; потом рычаг снова взводят;
//  • поджог: язычки растут у ближайшей к игроку горючей точки; сгорел — огонь бежит по лагерю, палатки и флаг
//    сгорают до каркаса, рычаг рушится, рама кренится, сундук распахивается со вспышкой золота, потом угли и дым;
//  • факел для руки игрока: палка с просмолённой обмоткой, живой огонь — в общем огне лагеря.
// Огонь — аддитивные квадраты (castle/fx.ts), пыль, дым и щепки — CastleFx. Настоящих ламп нет.
// Отрисовок: лагерь, наклейка земли, огонь, пыль и дым, щепки (+ факел, когда он в руке) — не больше 6.
// Время во всех методах — секунды по тем же часам, что t в update().
import * as THREE from 'three';
import type { F50Camp } from '../../../shared/fort50.ts';
import { Billboards, CastleFx, PLANK, SPLINTER } from '../castle/fx.ts';
import { fireAtlas } from '../castle/textures.ts';
import { dirtTexture } from '../textures.ts';

export type CampSound =
  | 'rise' // лагерь вырос
  | 'thud' // деталь катапульты встала на место, камень лёг в пращу
  | 'creak' // щелчок храповика ворота (замах и взвод)
  | 'whoosh' // праща бросила камень
  | 'bang' // рычаг ударил вперёд, рама откатилась
  | 'ignite' // начали поджигать
  | 'fizzle' // поджог сорван
  | 'roar' // лагерь вспыхнул
  | 'crack' // катапульта ломается
  | 'chest' // сундук распахнулся, золото
  | 'sink'; // лагерь убран

type V3 = readonly [number, number, number];
interface P3 {
  x: number;
  y: number;
  z: number;
}

// ------------------------------------------------------------ размеры (метры, лагерь: +Z — вход, к крепости)

/** Катапульта: центр рамы в лагере, колёса, ось рычага, длинное и короткое плечо, праща, камень */
const C: V3 = [0, 0, 0.6];
const WR = 0.42;
const WX = 1.0;
const WZ = 1.15;
const H = 3.1;
const L = 2.8;
const S = 0.95;
const SL = 0.8;
const STONE_R = 0.22;
/** Крюк каната на рычаге, начало каната на вороте (в осях катапульты) */
const HOOK = 2.0;
const WINCH: V3 = [0, 1.05, -1.32];
/** Углы рычага от вертикали назад: взведён, оттянут замахом, удар вперёд (рад) */
const DEG = Math.PI / 180;
const TH_READY = 116 * DEG;
const TH_WIND = 134 * DEG;
const TH_END = -55 * DEG;
/** Удар рычага, с; праща отпускает камень на этой доле удара */
const TS = 0.32;
const REL = 0.85;
/** После удара: качается, стоит, взводится (с) */
const OSC = 2.2;
const HOLD = 2.6;
const RETURN = 3.0;
/** Наведение: не дальше ±36° от оси лагеря, скорость поворота рад/с */
const AIM_MAX = 36 * DEG;
const AIM_SPEED = 0.5;
const G = 9.8;

/** Палатки, стяг, сундук, костёр, брёвна (центры в лагере) */
const TENT_A: V3 = [-2.5, 0, -2.1];
const TENT_B: V3 = [2.3, 0, -2.0];
const TENT_B_YAW = Math.atan2(0.616, 0.79); // конёк — по дуге частокола
const BANNER: V3 = [-3.3, 0, 2.3];
const FLAG_Y0 = 3.75;
const FLAG_Y1 = 4.75;
const FLAG_LEN = 1.6;
const POLE_TOP = 4.9;
const CHEST: V3 = [2.5, 0, 2.5];
const CHEST_YAW = -0.55;
const FIRE: V3 = [-3.0, 0, 0.35];
const PILE: V3 = [3.15, 0, -0.25];
/** Частокол: дуга вокруг O радиусом R, вход ±PAL_GAP от оси лагеря */
const PAL_O: V3 = [0, 0, -0.2];
const PAL_R = 4.5;
const PAL_GAP = 62 * DEG;

// ------------------------------------------------------------ палитра (армия Барона, тёплое дерево, сливочный холст)

const H3 = (hex: number) => new THREE.Color(hex);
const JAM = H3(0x7e2fa8);
const JAM_D = H3(0x52206f);
const JAM_L = H3(0xb06ad8);
const WOOD = H3(0x8a5a34);
const WOOD_L = H3(0xa8763f);
const WOOD_D = H3(0x5e3d22);
const END = H3(0xd9b07a);
const CANVAS = H3(0xf1e6cf);
const ROPE = H3(0xc9a46a);
const IRON = H3(0x3d3e44);
const STONE = H3(0xa39b8f);
const GOLD = H3(0xf1bd45);
const LEATHER = H3(0x6b4428);
const SACK = H3(0xd6c29a);
const DOOR = H3(0x3a1f4a);
const COAL = H3(0x3a2a20);

const FLAME = new THREE.Color(1, 0.8, 0.45);
const FLAME_HOT = new THREE.Color(1, 0.62, 0.28);
const HALO = new THREE.Color(1, 0.5, 0.2);
const EMBER = new THREE.Color(1, 0.55, 0.18);
const RED = new THREE.Color(1, 0.16, 0.08);
const GOLDF = new THREE.Color(1, 0.82, 0.32);
const SMOKE = H3(0x6f675f);
const SMOKE_L = H3(0xb3aca3);
const STEAM = H3(0xf4f1ec);
const DUST = H3(0xd8c4a2);
const CHAR = H3(0x2b2420);

// ------------------------------------------------------------ атлас: 512 × 256

/** Где в атласе что: развёртка точкой (u, v) для однотонного или прямоугольник (u0, v0, u1, v1) */
const UV_MATTE: readonly [number, number] = [0.0625, 0.5];
const UV_SEMI: readonly [number, number] = [0.1875, 0.5];
const UV_GLOSS: readonly [number, number] = [0.3125, 0.5];
const R_BANNER: readonly [number, number, number, number] = [0.38, 0.26, 0.995, 0.995];
const R_PLAQUE: readonly [number, number, number, number] = [0.58, 0.32, 0.8, 0.94];
const R_GINGHAM: readonly [number, number, number, number] = [0.38, 0.005, 0.62, 0.24];
type Surf = 'matte' | 'semi' | 'gloss' | readonly [number, number, number, number];

function atlas(): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  const W = 512;
  const Hh = 256;
  const make = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = Hh;
    return [c, c.getContext('2d')!] as const;
  };
  const [c, ctx] = make();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, Hh);
  // стяг (x 192…512, y 0…192): варенье, тёмная кайма, сливочная нить, банка в короне
  const bx = 192;
  const bw = 320;
  const bh = 192;
  ctx.fillStyle = '#7e2fa8';
  ctx.fillRect(bx, 0, bw, bh);
  for (let i = 0; i < 6; i++) {
    const g = ctx.createLinearGradient(bx + i * 54, 0, bx + i * 54 + 54, 0);
    g.addColorStop(0, 'rgba(40,10,60,0.16)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(40,10,60,0.16)');
    ctx.fillStyle = g;
    ctx.fillRect(bx + i * 54, 0, 54, bh);
  }
  ctx.strokeStyle = '#52206f';
  ctx.lineWidth = 16;
  ctx.strokeRect(bx + 8, 8, bw - 16, bh - 16);
  ctx.strokeStyle = '#f6ead2';
  ctx.lineWidth = 4;
  ctx.strokeRect(bx + 22, 22, bw - 44, bh - 44);
  // банка: сливочный контур, светлое варенье, золотая крышка, корона
  const jx = bx + bw / 2;
  const jy = 104;
  ctx.fillStyle = '#f6ead2';
  roundRect(ctx, jx - 40, jy - 40, 80, 96, 22);
  ctx.fill();
  ctx.fillStyle = '#b06ad8';
  roundRect(ctx, jx - 33, jy - 33, 66, 82, 17);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  roundRect(ctx, jx - 24, jy - 24, 10, 52, 5);
  ctx.fill();
  ctx.fillStyle = '#f6ead2';
  roundRect(ctx, jx - 22, jy + 4, 44, 24, 5);
  ctx.fill();
  ctx.fillStyle = '#7e2fa8';
  ctx.beginPath();
  ctx.arc(jx - 5, jy + 17, 6, 0, Math.PI * 2);
  ctx.arc(jx + 6, jy + 15, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f1bd45';
  roundRect(ctx, jx - 44, jy - 52, 88, 16, 5);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(jx - 30, jy - 54);
  ctx.lineTo(jx - 30, jy - 74);
  ctx.lineTo(jx - 15, jy - 62);
  ctx.lineTo(jx, jy - 80);
  ctx.lineTo(jx + 15, jy - 62);
  ctx.lineTo(jx + 30, jy - 74);
  ctx.lineTo(jx + 30, jy - 54);
  ctx.closePath();
  ctx.fill();
  // клетка крышки (x 192…320, y 192…256): варенье и сливки
  ctx.fillStyle = '#f6ead2';
  ctx.fillRect(192, 192, 128, 64);
  ctx.fillStyle = 'rgba(126,47,168,0.55)';
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(192 + i * 16, 192, 8, 64);
    ctx.fillRect(192, 192 + i * 8, 128, 4);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  // шероховатость (зелёный канал): матовое 0,9, полуглянец 0,5, глянец 0,14, ткань 0,92
  const [rc, rx] = make();
  rx.fillStyle = 'rgb(0,230,0)';
  rx.fillRect(0, 0, W, Hh);
  rx.fillStyle = 'rgb(0,128,0)';
  rx.fillRect(64, 0, 64, Hh);
  rx.fillStyle = 'rgb(0,36,0)';
  rx.fillRect(128, 0, 64, Hh);
  rx.fillStyle = 'rgb(0,235,0)';
  rx.fillRect(192, 0, 320, Hh);
  const rough = new THREE.CanvasTexture(rc);
  rough.colorSpace = THREE.NoColorSpace;
  return { map, rough };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ------------------------------------------------------------ сборка: вершины с костями

interface AddOpts {
  surf?: Surf;
  /** затенение у земли по высоте в позе привязки (по умолчанию да) */
  ao?: boolean;
  /** веса костей по точке: [кость0, кость1, вес1] (вес0 = 1 − вес1) */
  weights?: (x: number, y: number, z: number) => readonly [number, number, number];
}

class SkinBuilder {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly uv: number[] = [];
  readonly col: number[] = [];
  readonly si: number[] = [];
  readonly sw: number[] = [];
  readonly idx: number[] = [];

  add(g: THREE.BufferGeometry, color: THREE.Color, bone: number, o: AddOpts = {}): void {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const t = g.getAttribute('uv');
    const vc = g.getAttribute('color');
    const base = this.pos.length / 3;
    const surf = o.surf ?? 'matte';
    const ao = o.ao ?? true;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      this.pos.push(x, y, z);
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      if (typeof surf === 'string') {
        const s = surf === 'matte' ? UV_MATTE : surf === 'semi' ? UV_SEMI : UV_GLOSS;
        this.uv.push(s[0], s[1]);
      } else {
        const u = t ? t.getX(i) : 0.5;
        const v = t ? t.getY(i) : 0.5;
        this.uv.push(surf[0] + (surf[2] - surf[0]) * u, surf[1] + (surf[3] - surf[1]) * v);
      }
      const k = ao ? 0.58 + 0.42 * THREE.MathUtils.smoothstep(y, 0, 0.85) : 1;
      const r = vc ? vc.getX(i) : 1;
      const gg = vc ? vc.getY(i) : 1;
      const b = vc ? vc.getZ(i) : 1;
      this.col.push(color.r * r * k, color.g * gg * k, color.b * b * k);
      if (o.weights) {
        const [b0, b1, w1] = o.weights(x, y, z);
        this.si.push(b0, b1, 0, 0);
        this.sw.push(1 - w1, w1, 0, 0);
      } else {
        this.si.push(bone, 0, 0, 0);
        this.sw.push(1, 0, 0, 0);
      }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  }

  get triangles(): number {
    return this.idx.length / 3;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const Y = new THREE.Vector3(0, 1, 0);
const v3 = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);

/** Брус между точками (сечение w × d) */
function beam(a: V3, b: V3, w: number, d = w): THREE.BufferGeometry {
  const A = v3(a);
  const B = v3(b);
  const dir = B.clone().sub(A);
  const g = new THREE.BoxGeometry(w, dir.length(), d);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, dir.normalize()));
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}

/** Круглая палка между точками */
function rod(a: V3, b: V3, r: number, sides = 6, r2 = r): THREE.BufferGeometry {
  const A = v3(a);
  const B = v3(b);
  const dir = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r2, r, dir.length(), sides, 1, false);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, dir.normalize()));
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}

function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

/** Повернуть фигуру вокруг вертикали через точку (cx, cz) */
function yawAt(g: THREE.BufferGeometry, cx: number, cz: number, yaw: number): THREE.BufferGeometry {
  return g.translate(-cx, 0, -cz).rotateY(yaw).translate(cx, 0, cz);
}

/** Камень: многогранник с неровностями (детерминированно по seed) */
function rock(r: number, seed: number, detail = 0): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 0.82 + 0.3 * frac(Math.sin(Math.round(x * 97 + y * 57 + z * 31 + seed * 13) * 43758.5453));
    p.setXYZ(i, x * k, y * k * 0.86, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function frac(v: number): number {
  return v - Math.floor(v);
}

/** Полосатая фигура: цвет по треугольнику (номер сектора вокруг оси Y от центра cx, cz) */
function stripes(g: THREE.BufferGeometry, n: number, a: THREE.Color, b: THREE.Color, cx: number, cz: number, phase = 0): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const p = ng.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3 - cx;
    const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3 - cz;
    const s = Math.floor(((Math.atan2(x, z) + Math.PI) / (Math.PI * 2)) * n + phase);
    const c = s % 2 === 0 ? a : b;
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}

/** Бочка: пузатая клёпка и два обруча, крышка; lying — лёжа вдоль оси под углом lying */
function barrel(b: SkinBuilder, bone: number, x: number, y: number, z: number, r: number, h: number, color: THREE.Color, lying = 0, band = false): void {
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    prof.push(new THREE.Vector2(r * (0.86 + 0.14 * Math.sin(Math.PI * t)), t * h));
  }
  const list: Array<[THREE.BufferGeometry, THREE.Color, Surf]> = [
    [new THREE.LatheGeometry(prof, 10), color, 'matte'],
    [new THREE.CircleGeometry(r * 0.86, 10).rotateX(-Math.PI / 2).translate(0, h, 0), color.clone().multiplyScalar(0.78), 'matte'],
  ];
  for (const t of [0.16, 0.84]) {
    const rr = r * (0.86 + 0.14 * Math.sin(Math.PI * t)) + 0.016;
    list.push([new THREE.CylinderGeometry(rr, rr, 0.05, 10, 1, true).translate(0, t * h, 0), IRON, 'semi']);
  }
  if (band) list.push([new THREE.CylinderGeometry(r + 0.018, r + 0.018, 0.16, 10, 1, true).translate(0, h * 0.5, 0), JAM, 'matte']);
  for (const [g, c, surf] of list) {
    if (lying) g.translate(0, -h / 2, 0).rotateX(Math.PI / 2).rotateY(lying);
    g.translate(x, y + (lying ? r : 0), z);
    b.add(g, c, bone, { surf });
  }
}

// ------------------------------------------------------------ части лагеря

/** Точка, где может гореть: кость, смещение от кости (в позе привязки), размер огня */
interface Spot {
  bone: number;
  off: THREE.Vector3;
  size: number;
  ph: number;
  /** задержка вспышки от точки поджога, с (считается в burnt) */
  delay: number;
}

const B = {
  Root: 0,
  Cata: 1,
  Frame: 2,
  WFL: 3,
  WFR: 4,
  WRL: 5,
  WRR: 6,
  Uprights: 7,
  Winch: 8,
  Rope: 9,
  Arm: 10,
  Cw: 11,
  Sling: 12,
  Stone: 13,
  TentA: 14,
  TentAc: 15,
  TentAf: 16,
  PenA: 17,
  TentB: 18,
  TentBc: 19,
  TentBf: 20,
  PenB: 21,
  Banner: 22,
  Flag1: 23,
  Flag2: 24,
  Flag3: 25,
  PalL: 26,
  PalB: 27,
  PalR: 28,
  Props: 29,
  Chest: 30,
  Lid: 31,
  Coins: 32,
  Pot: 33,
  PileA: 34,
  PileB: 35,
  Count: 36,
} as const;
type B = (typeof B)[keyof typeof B];

/** Кости: родитель и точка привязки (в лагере; камень — в мире) */
const BONES: ReadonlyArray<readonly [number, V3]> = (() => {
  const cp = (x: number, y: number, z: number): V3 => [C[0] + x, y, C[2] + z];
  const t: Array<readonly [number, V3]> = [];
  t[B.Root] = [-1, [0, 0, 0]];
  t[B.Cata] = [B.Root, C];
  t[B.Frame] = [B.Cata, cp(0, WR, -WZ)];
  t[B.WFL] = [B.Frame, cp(-WX, WR, WZ)];
  t[B.WFR] = [B.Frame, cp(WX, WR, WZ)];
  t[B.WRL] = [B.Frame, cp(-WX, WR, -WZ)];
  t[B.WRR] = [B.Frame, cp(WX, WR, -WZ)];
  t[B.Uprights] = [B.Frame, cp(0, 0.82, 0)];
  t[B.Winch] = [B.Frame, cp(WINCH[0], WINCH[1], WINCH[2])];
  t[B.Rope] = [B.Frame, cp(WINCH[0], WINCH[1] + 0.12, WINCH[2])];
  t[B.Arm] = [B.Uprights, cp(0, H, 0)];
  t[B.Cw] = [B.Arm, cp(0, H - S, 0)];
  t[B.Sling] = [B.Arm, cp(0, H + L, 0)];
  t[B.Stone] = [-2, [0, 0, 0]];
  t[B.TentA] = [B.Root, TENT_A];
  t[B.TentAc] = [B.TentA, TENT_A];
  t[B.TentAf] = [B.TentA, TENT_A];
  t[B.PenA] = [B.TentAc, [TENT_A[0], 2.78, TENT_A[2]]];
  t[B.TentB] = [B.Root, TENT_B];
  t[B.TentBc] = [B.TentB, TENT_B];
  t[B.TentBf] = [B.TentB, TENT_B];
  const pb = new THREE.Vector3(1.12, 0, 0).applyAxisAngle(Y, TENT_B_YAW);
  t[B.PenB] = [B.TentBc, [TENT_B[0] + pb.x, 2.0, TENT_B[2] + pb.z]];
  t[B.Banner] = [B.Root, BANNER];
  t[B.Flag1] = [B.Banner, [BANNER[0] - 0.07, FLAG_Y1, BANNER[2]]];
  t[B.Flag2] = [B.Flag1, [BANNER[0] - 0.07 - 0.55, FLAG_Y1, BANNER[2]]];
  t[B.Flag3] = [B.Flag2, [BANNER[0] - 0.07 - 1.1, FLAG_Y1, BANNER[2]]];
  t[B.PalL] = [B.Root, PAL_O];
  t[B.PalB] = [B.Root, PAL_O];
  t[B.PalR] = [B.Root, PAL_O];
  t[B.Props] = [B.Root, [0, 0, -3.5]];
  t[B.Chest] = [B.Root, CHEST];
  const hinge = new THREE.Vector3(0, 0.5, -0.28).applyAxisAngle(Y, CHEST_YAW);
  t[B.Lid] = [B.Chest, [CHEST[0] + hinge.x, 0.5, CHEST[2] + hinge.z]];
  t[B.Coins] = [B.Chest, [CHEST[0], 0.5, CHEST[2]]];
  t[B.Pot] = [B.Root, FIRE];
  t[B.PileA] = [B.Root, PILE];
  t[B.PileB] = [B.PileA, [PILE[0], 0.2, PILE[2]]];
  return t;
})();

/** Через сколько после появления лагеря растёт часть (с) и сколько растёт */
const RISE: Partial<Record<B, number>> = {
  [B.PalB]: 0, [B.PalL]: 0.12, [B.PalR]: 0.22, [B.TentA]: 0.35, [B.TentB]: 0.5, [B.Props]: 0.6, [B.Pot]: 0.7,
  [B.PileA]: 0.75, [B.Banner]: 0.85, [B.Chest]: 0.95, [B.Cata]: 1.05,
};
const RISE_T = 0.55;

function buildCatapult(b: SkinBuilder): void {
  const cp = (x: number, y: number, z: number): V3 => [C[0] + x, y, C[2] + z];
  const F = B.Frame;
  // рама: два бруса по бокам на осях колёс, четыре поперечины, два внутренних бруса под стойки
  for (const sx of [-0.78, 0.78]) b.add(box(C[0] + sx - 0.1, 0.4, C[2] - 1.55, C[0] + sx + 0.1, 0.64, C[2] + 1.55), WOOD, F);
  for (const z of [-1.35, -0.4, 0.4, 1.35]) b.add(box(C[0] - 0.9, 0.64, C[2] + z - 0.1, C[0] + 0.9, 0.82, C[2] + z + 0.1), z === 1.35 ? WOOD_D : WOOD_L, F);
  for (const sx of [-0.42, 0.42]) b.add(box(C[0] + sx - 0.08, 0.82, C[2] - 1.25, C[0] + sx + 0.08, 0.96, C[2] + 1.25), WOOD, F);
  // торцы брусьев светлее (свежий срез) и железные скобы на углах
  for (const sx of [-0.78, 0.78]) for (const z of [-1.55, 1.55]) b.add(box(C[0] + sx - 0.09, 0.41, C[2] + z - 0.016, C[0] + sx + 0.09, 0.63, C[2] + z + 0.016), END, F);
  for (const sx of [-0.78, 0.78]) for (const z of [-1.35, 1.35]) b.add(box(C[0] + sx - 0.115, 0.58, C[2] + z - 0.12, C[0] + sx + 0.115, 0.7, C[2] + z + 0.12), IRON, F, { surf: 'semi' });
  // оси колёс
  for (const z of [-WZ, WZ]) b.add(rod(cp(-1.12, WR, z), cp(1.12, WR, z), 0.045, 6), IRON, F, { surf: 'semi' });
  // щиток с банкой Барона на передней поперечине
  const plaque = new THREE.PlaneGeometry(0.46, 0.4).translate(C[0], 0.73, C[2] + 1.488);
  b.add(plaque, new THREE.Color(1, 1, 1), F, { surf: R_PLAQUE, ao: false });
  b.add(box(C[0] - 0.25, 0.51, C[2] + 1.44, C[0] + 0.25, 0.95, C[2] + 1.468), GOLD, F, { surf: 'semi', ao: false });

  // колёса: обод, четыре спицы крестом, ступица
  const wheels: Array<[B, number, number]> = [[B.WFL, -WX, WZ], [B.WFR, WX, WZ], [B.WRL, -WX, -WZ], [B.WRR, WX, -WZ]];
  for (const [bone, x, z] of wheels) {
    const [px, , pz] = cp(x, 0, z);
    const rim = new THREE.TorusGeometry(WR - 0.045, 0.05, 4, 14).rotateY(Math.PI / 2).translate(px, WR, pz);
    b.add(rim, WOOD_D, bone, { ao: false });
    const tire = new THREE.TorusGeometry(WR + 0.008, 0.02, 3, 14).rotateY(Math.PI / 2).translate(px, WR, pz);
    b.add(tire, IRON, bone, { surf: 'semi', ao: false });
    for (let i = 0; i < 2; i++) {
      const a = (i * Math.PI) / 2 + 0.4;
      const dy = Math.cos(a) * (WR - 0.06);
      const dz = Math.sin(a) * (WR - 0.06);
      b.add(beam([px, WR - dy, pz - dz], [px, WR + dy, pz + dz], 0.045, 0.05), WOOD, bone, { ao: false });
    }
    b.add(new THREE.CylinderGeometry(0.085, 0.085, 0.16, 8).rotateZ(Math.PI / 2).translate(px, WR, pz), IRON, bone, { surf: 'semi', ao: false });
  }

  // стойки: с каждой стороны А-рама из двух ног, столб и подкос, сверху — подшипник с железом
  const U = B.Uprights;
  for (const sx of [-0.42, 0.42]) {
    b.add(beam(cp(sx, 0.94, -1.12), cp(sx, H + 0.02, -0.06), 0.13), WOOD, U);
    b.add(beam(cp(sx, 0.94, 1.12), cp(sx, H + 0.02, 0.06), 0.13), WOOD, U);
    b.add(beam(cp(sx, 0.94, 0), cp(sx, H - 0.1, 0), 0.12), WOOD_L, U);
    b.add(beam(cp(sx, 0.94, -0.62), cp(sx, 1.9, 0.5), 0.08), WOOD_D, U);
    b.add(box(C[0] + sx - 0.11, H - 0.13, C[2] - 0.13, C[0] + sx + 0.11, H + 0.12, C[2] + 0.13), WOOD_D, U);
    b.add(box(C[0] + sx - 0.12, H + 0.04, C[2] - 0.14, C[0] + sx + 0.12, H + 0.09, C[2] + 0.14), IRON, U, { surf: 'semi' });
    // подкос от бокового бруса рамы к столбу
    b.add(beam(cp(sx * 1.86, 0.64, 0), cp(sx, 1.85, 0), 0.08), WOOD_D, U);
  }
  b.add(rod(cp(-0.6, H, 0), cp(0.6, H, 0), 0.065, 8), IRON, U, { surf: 'semi' });

  // ворот у задней поперечины: две стойки, барабан с намотанным канатом, ручки крестом с обеих сторон
  for (const sx of [-0.55, 0.55]) b.add(box(C[0] + sx - 0.06, 0.82, C[2] + WINCH[2] - 0.07, C[0] + sx + 0.06, WINCH[1] + 0.08, C[2] + WINCH[2] + 0.07), WOOD_D, F);
  const W = B.Winch;
  const wc = cp(WINCH[0], WINCH[1], WINCH[2]);
  b.add(new THREE.CylinderGeometry(0.11, 0.11, 1.0, 8).rotateZ(Math.PI / 2).translate(wc[0], wc[1], wc[2]), WOOD_L, W);
  b.add(new THREE.CylinderGeometry(0.135, 0.135, 0.34, 8).rotateZ(Math.PI / 2).translate(wc[0], wc[1], wc[2]), ROPE, W);
  for (const sx of [-0.62, 0.62]) {
    b.add(box(wc[0] + sx - 0.025, wc[1] - 0.3, wc[2] - 0.025, wc[0] + sx + 0.025, wc[1] + 0.3, wc[2] + 0.025), WOOD_D, W);
    b.add(box(wc[0] + sx - 0.025, wc[1] - 0.025, wc[2] - 0.3, wc[0] + sx + 0.025, wc[1] + 0.025, wc[2] + 0.3), WOOD_D, W);
  }
  // канат: единичный по +Y от начала, длину и направление задаёт кость
  const rs = cp(WINCH[0], WINCH[1] + 0.12, WINCH[2]);
  b.add(new THREE.CylinderGeometry(0.024, 0.024, 1, 4, 1, true).translate(rs[0], rs[1] + 0.5, rs[2]), ROPE, B.Rope, { ao: false });

  // рычаг: брус с сужением к концу (поза привязки — стоит вертикально, длинное плечо вверх)
  const A = B.Arm;
  const y0 = H - S - 0.1;
  const arm = new THREE.BoxGeometry(0.22, L + S + 0.1, 0.22, 1, 3, 1).translate(C[0], (y0 + H + L) / 2, C[2]);
  const ap = arm.getAttribute('position');
  for (let i = 0; i < ap.count; i++) {
    const k = THREE.MathUtils.clamp((ap.getY(i) - H) / L, 0, 1);
    const s = 1 - 0.42 * k;
    ap.setX(i, C[0] + (ap.getX(i) - C[0]) * s);
    ap.setZ(i, C[2] + (ap.getZ(i) - C[2]) * s);
  }
  arm.computeVertexNormals();
  b.add(arm, WOOD_L, A, { ao: false });
  b.add(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 10).rotateZ(Math.PI / 2).translate(C[0], H, C[2]), IRON, A, { surf: 'semi', ao: false });
  for (const [y, w] of [[H + 1.0, 0.2], [H + HOOK, 0.17], [H - S + 0.08, 0.24]] as const) {
    b.add(box(C[0] - w / 2 - 0.012, y - 0.05, C[2] - w / 2 - 0.012, C[0] + w / 2 + 0.012, y + 0.05, C[2] + w / 2 + 0.012), IRON, A, { surf: 'semi', ao: false });
  }
  b.add(new THREE.TorusGeometry(0.07, 0.018, 4, 8).translate(C[0], H + HOOK, C[2] - 0.12), IRON, A, { surf: 'semi', ao: false });
  b.add(new THREE.ConeGeometry(0.05, 0.16, 5).translate(C[0], H + L + 0.08, C[2]), IRON, A, { surf: 'semi', ao: false });
  // лента цвета варенья у конца рычага — видно, как он ходит
  b.add(box(C[0] - 0.08, H + L - 0.42, C[2] - 0.08, C[0] + 0.08, H + L - 0.3, C[2] + 0.08), JAM, A, { ao: false });

  // противовес: петля, две железные полосы, ящик цвета варенья с тёмными досками, сверху — камни
  const K = B.Cw;
  const hy = H - S;
  b.add(rod(cp(-0.2, hy, 0), cp(0.2, hy, 0), 0.05, 6), IRON, K, { surf: 'semi', ao: false });
  for (const sx of [-0.18, 0.18]) b.add(beam(cp(sx, hy, 0), cp(sx * 1.55, hy - 0.22, 0), 0.04, 0.08), IRON, K, { surf: 'semi', ao: false });
  const bx0 = C[0] - 0.3;
  const bx1 = C[0] + 0.3;
  const bz0 = C[2] - 0.36;
  const bz1 = C[2] + 0.36;
  const by1 = hy - 0.2;
  const by0 = by1 - 0.85;
  b.add(box(bx0, by0, bz0, bx1, by1, bz1), JAM, K, { ao: false });
  for (const z of [-0.22, 0.22]) b.add(box(bx0 - 0.016, by0, C[2] + z - 0.045, bx1 + 0.016, by1, C[2] + z + 0.045), JAM_D, K, { ao: false });
  b.add(box(bx0 - 0.035, by0 - 0.02, bz0 - 0.02, bx1 + 0.035, by0 + 0.08, bz1 + 0.02), IRON, K, { surf: 'semi', ao: false });
  b.add(box(bx0 - 0.035, by1 - 0.08, bz0 - 0.02, bx1 + 0.035, by1 + 0.016, bz1 + 0.02), IRON, K, { surf: 'semi', ao: false });
  for (let i = 0; i < 3; i++) b.add(rock(0.16, 11 + i).translate(C[0] - 0.14 + i * 0.14, by1 + 0.04, C[2] + (i - 1) * 0.12), STONE, K, { surf: 'semi', ao: false });

  // праща: два шнура от конца рычага вниз к кожаному ложу (поза привязки — висит вдоль рычага)
  const P = B.Sling;
  const ty = H + L;
  for (const sx of [-0.2, 0.2]) b.add(rod(cp(0, ty, 0), cp(sx, ty - SL, 0), 0.014, 3), ROPE, P, { ao: false });
  b.add(box(C[0] - 0.24, ty - SL - 0.05, C[2] - 0.15, C[0] + 0.24, ty - SL + 0.01, C[2] + 0.15), LEATHER, P, { ao: false });
}

function buildStone(b: SkinBuilder): void {
  b.add(rock(STONE_R, 5, 1), STONE, B.Stone, { surf: 'semi', ao: false });
}

/** Круглая палатка: стенка и крыша в полоску, фестоны, вход, вымпел; каркас для пепелища */
function buildTentA(b: SkinBuilder): void {
  const [x, , z] = TENT_A;
  const c = B.TentAc;
  const n = 14;
  const wall = new THREE.CylinderGeometry(1.0, 1.0, 1.0, n, 1, true).translate(x, 0.5, z);
  b.add(stripes(wall, n, JAM, CANVAS, x, z), new THREE.Color(1, 1, 1), c);
  const roof = new THREE.ConeGeometry(1.12, 1.45, n, 1, true).translate(x, 1.0 + 0.725, z);
  b.add(stripes(roof, n, JAM, CANVAS, x, z), new THREE.Color(1, 1, 1), c);
  // фестоны: треугольники вниз от края крыши
  const sc: number[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const r = 1.125;
    sc.push(x + Math.sin(a1) * r, 1.0, z + Math.cos(a1) * r, x + Math.sin(a0) * r, 1.0, z + Math.cos(a0) * r, x + Math.sin(am) * r, 0.82, z + Math.cos(am) * r);
  }
  const scal = new THREE.BufferGeometry();
  scal.setAttribute('position', new THREE.Float32BufferAttribute(sc, 3));
  scal.computeVertexNormals();
  b.add(scal, JAM_D, c);
  // вход — к середине лагеря: тёмный проём и откинутые полы
  const toC = Math.atan2(-x, -z);
  const door = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.3, 0.02, 0), new THREE.Vector3(0.3, 0.02, 0), new THREE.Vector3(0, 0.92, 0)]);
  door.computeVertexNormals();
  door.translate(0, 0, 1.018).rotateY(toC).translate(x, 0, z);
  b.add(door, DOOR, c);
  for (const s of [-1, 1]) {
    const flap = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(s * 0.3, 0.02, 0), new THREE.Vector3(s * 0.46, 0.05, -0.02), new THREE.Vector3(s * 0.02, 0.9, 0)]);
    const pts = flap.getAttribute('position');
    if (s < 0) {
      // обход против часовой снаружи
      const a = [pts.getX(0), pts.getY(0), pts.getZ(0)];
      pts.setXYZ(0, pts.getX(1), pts.getY(1), pts.getZ(1));
      pts.setXYZ(1, a[0], a[1], a[2]);
    }
    flap.computeVertexNormals();
    flap.translate(0, 0, 1.03).rotateY(toC).translate(x, 0, z);
    b.add(flap, CANVAS, c);
  }
  // растяжки внутрь лагеря и колышки
  for (const a of [toC - 0.9, toC + 0.9, toC + Math.PI * 0.62]) {
    const top: V3 = [x + Math.sin(a) * 1.12, 1.0, z + Math.cos(a) * 1.12];
    const peg: V3 = [x + Math.sin(a) * 1.55, 0.02, z + Math.cos(a) * 1.55];
    b.add(rod(top, peg, 0.012, 3), ROPE, c, { ao: false });
    b.add(rod(peg, [peg[0], 0.16, peg[2]], 0.025, 4), WOOD_D, c);
  }
  // каркас: центральный столб с шаром и стойки стенки (внутри холста — видны, когда холст сгорит)
  const f = B.TentAf;
  b.add(rod([x, 0, z], [x, 2.62, z], 0.05, 6), WOOD_D, f);
  b.add(new THREE.SphereGeometry(0.07, 6, 4).translate(x, 2.66, z), GOLD, f, { surf: 'semi' });
  for (let i = 0; i < 4; i++) {
    const a = toC + 0.6 + (i * Math.PI) / 2;
    b.add(rod([x + Math.sin(a) * 0.96, 0, z + Math.cos(a) * 0.96], [x + Math.sin(a) * 0.96, 1.02, z + Math.cos(a) * 0.96], 0.035, 4), WOOD_D, f);
  }
  // вымпел: древко и треугольник на ветру
  const p = B.PenA;
  b.add(rod([x, 2.45, z], [x, 3.02, z], 0.018, 4), WOOD_D, p, { ao: false });
  pennant(b, p, x, 3.0, z, 0.5, JAM_L);
}

/** Вымпел: двусторонний треугольник от древка по −X */
function pennant(b: SkinBuilder, bone: number, x: number, y: number, z: number, len: number, color: THREE.Color): void {
  const a = new THREE.Vector3(x, y, z);
  const c = new THREE.Vector3(x, y - 0.24, z);
  const t = new THREE.Vector3(x - len, y - 0.1, z);
  for (const pts of [[a, c, t], [a, t, c]]) {
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    g.computeVertexNormals();
    b.add(g, color, bone, { ao: false });
  }
}

/** Двускатная палатка: скаты в полоску, торцы, вход в переднем торце, шесты с шарами, вымпел */
function buildTentB(b: SkinBuilder): void {
  const [x, , z] = TENT_B;
  const c = B.TentBc;
  const hl = 1.1;
  const hw = 0.85;
  const rh = 1.75;
  const list: Array<[THREE.BufferGeometry, THREE.Color]> = [];
  const tri = (p: number[][], color: THREE.Color) => {
    const g = new THREE.BufferGeometry().setFromPoints(p.map((q) => new THREE.Vector3(q[0], q[1], q[2])));
    g.computeVertexNormals();
    list.push([g, color]);
  };
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = -hl + (i * 2 * hl) / n;
    const e = a + (2 * hl) / n;
    const col = i % 2 === 0 ? JAM : CANVAS;
    // скат к +z и к −z (обход против часовой снаружи)
    tri([[a, 0.02, hw], [e, 0.02, hw], [e, rh, 0]], col);
    tri([[a, 0.02, hw], [e, rh, 0], [a, rh, 0]], col);
    tri([[e, 0.02, -hw], [a, 0.02, -hw], [a, rh, 0]], col);
    tri([[e, 0.02, -hw], [a, rh, 0], [e, rh, 0]], col);
  }
  // торцы: сливочные, у переднего (+x) — тёмный вход и откинутые полы цвета варенья
  tri([[hl, 0.02, hw], [hl, 0.02, -hw], [hl, rh, 0]], CANVAS);
  tri([[-hl, 0.02, -hw], [-hl, 0.02, hw], [-hl, rh, 0]], CANVAS);
  tri([[hl + 0.018, 0.02, 0.36], [hl + 0.018, 0.02, -0.36], [hl + 0.018, 1.2, 0]], DOOR);
  tri([[hl + 0.03, 0.02, 0.36], [hl + 0.06, 0.04, 0.52], [hl + 0.03, 1.15, 0.03]], JAM_D);
  tri([[hl + 0.03, 0.02, -0.36], [hl + 0.03, 1.15, -0.03], [hl + 0.06, 0.04, -0.52]], JAM_D);
  // кромка конька цвета варенья
  list.push([box(-hl - 0.02, rh - 0.03, -0.05, hl + 0.02, rh + 0.03, 0.05), JAM_D]);
  // растяжки по оси конька
  for (const s of [-1, 1]) {
    list.push([rod([s * (hl + 0.02), 2.0, 0], [s * 1.55, 0.02, 0], 0.012, 3), ROPE]);
    list.push([rod([s * 1.55, 0.02, 0], [s * 1.55, 0.16, 0], 0.025, 4), WOOD_D]);
  }
  for (const [g, col] of list) b.add(yawAt(g.translate(x, 0, z), x, z, TENT_B_YAW), col, c);
  // каркас: два шеста с шарами, конёк
  const f = B.TentBf;
  for (const s of [-1, 1]) {
    b.add(yawAt(rod([s * (hl + 0.02), 0, 0], [s * (hl + 0.02), 2.0, 0], 0.04, 5).translate(x, 0, z), x, z, TENT_B_YAW), WOOD_D, f);
    b.add(yawAt(new THREE.SphereGeometry(0.06, 6, 4).translate(s * (hl + 0.02), 2.04, 0).translate(x, 0, z), x, z, TENT_B_YAW), GOLD, f, { surf: 'semi' });
  }
  b.add(yawAt(rod([-hl, rh - 0.06, 0], [hl, rh - 0.06, 0], 0.035, 5).translate(x, 0, z), x, z, TENT_B_YAW), WOOD_D, f);
  const pb = new THREE.Vector3(hl + 0.02, 0, 0).applyAxisAngle(Y, TENT_B_YAW);
  pennant(b, B.PenB, x + pb.x, 2.0, z + pb.z, 0.42, JAM_L);
}

/** Стяг: шест на камнях, сверху банка варенья с клетчатой крышкой и короной, флаг с банкой на трёх костях */
function buildBanner(b: SkinBuilder): void {
  const [x, , z] = BANNER;
  const k = B.Banner;
  b.add(rod([x, 0, z], [x, POLE_TOP, z], 0.07, 8, 0.055), WOOD_D, k);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26;
    b.add(rock(0.17 + (i % 2) * 0.05, 30 + i).translate(x + Math.sin(a) * 0.22, 0.08, z + Math.cos(a) * 0.22), STONE, k, { surf: 'semi' });
  }
  // банка: стекло с вареньем (глянец), этикетка, клетчатая крышка, шнурок, корона
  const prof: THREE.Vector2[] = [];
  const jr = 0.3;
  const jh = 0.56;
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    const r = t < 0.12 ? jr * (0.75 + 2 * t) : t > 0.82 ? jr * (1 - (t - 0.82) * 1.6) : jr;
    prof.push(new THREE.Vector2(Math.max(0.05, r), t * jh));
  }
  const jy = POLE_TOP - 0.02;
  b.add(new THREE.LatheGeometry(prof, 12).translate(x, jy, z), JAM, k, { surf: 'gloss', ao: false });
  b.add(new THREE.CylinderGeometry(jr + 0.016, jr + 0.016, 0.11, 12, 1, true).translate(x, jy + 0.24, z), CANVAS, k, { ao: false });
  const lidY = jy + jh;
  b.add(stripes(new THREE.CylinderGeometry(0.27, 0.33, 0.12, 16, 1, true).translate(x, lidY - 0.02, z), 16, JAM, CANVAS, x, z), new THREE.Color(1, 1, 1), k, { ao: false });
  b.add(new THREE.CircleGeometry(0.27, 12).rotateX(-Math.PI / 2).translate(x, lidY + 0.04, z), new THREE.Color(1, 1, 1), k, { surf: R_GINGHAM, ao: false });
  b.add(new THREE.TorusGeometry(0.31, 0.018, 3, 12).rotateX(Math.PI / 2).translate(x, lidY - 0.035, z), CANVAS, k, { ao: false });
  b.add(new THREE.CylinderGeometry(0.17, 0.17, 0.09, 10, 1, true).translate(x, lidY + 0.09, z), GOLD, k, { surf: 'semi', ao: false });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.add(new THREE.ConeGeometry(0.045, 0.13, 4).translate(x + Math.sin(a) * 0.15, lidY + 0.19, z + Math.cos(a) * 0.15), GOLD, k, { surf: 'semi', ao: false });
  }
  // флаг: сетка 6 × 2 от шеста по −X, ласточкин хвост на конце, веса — между соседними костями цепочки
  const cols = 6;
  const rows = 2;
  const pts: number[] = [];
  const uvs: number[] = [];
  const x0 = x - 0.07;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      let d = (i / cols) * FLAG_LEN;
      if (i === cols && j === 1) d -= 0.32;
      pts.push(x0 - d, FLAG_Y1 - (j / rows) * (FLAG_Y1 - FLAG_Y0), z);
      uvs.push(i / cols, 1 - j / rows);
    }
  }
  const front: number[] = [];
  const back: number[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const bb = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      front.push(a, c, bb, bb, c, d);
      back.push(a, bb, c, bb, d, c);
    }
  }
  const weights = (px: number): readonly [number, number, number] => {
    const d = x0 - px;
    if (d <= 0.55) return [B.Flag1, B.Flag2, d / 0.55];
    if (d <= 1.1) return [B.Flag2, B.Flag3, (d - 0.55) / 0.55];
    return [B.Flag3, B.Flag3, 0];
  };
  for (const [ix, sign] of [[front, 1], [back, -1]] as const) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array((pts.length / 3) * 3).fill(0).map((_, i) => (i % 3 === 2 ? sign : 0)), 3));
    g.setIndex(ix);
    b.add(g, new THREE.Color(1, 1, 1), B.Flag1, { surf: R_BANNER, ao: false, weights: (px) => weights(px) });
  }
  // кольца на шесте
  for (const yy of [FLAG_Y0 + 0.02, FLAG_Y1 - 0.02]) b.add(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 8).translate(x, yy, z), IRON, k, { surf: 'semi', ao: false });
}

/** Частокол: заострённые колья дугой (три кости — левая, задняя, правая), обвязка, лоскуты цвета варенья */
function buildPalisade(b: SkinBuilder): void {
  const a0 = PAL_GAP;
  const a1 = Math.PI * 2 - PAL_GAP;
  const n = 44;
  const boneAt = (a: number) => (a < Math.PI * 0.83 ? B.PalR : a > Math.PI * 1.17 ? B.PalL : B.PalB);
  /** точка обвязки у кола i: на высоте 0,9 м, с внутренней стороны кола */
  const rail: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / (n - 1);
    const r1 = frac(Math.sin(i * 12.9898) * 43758.5453);
    const r2 = frac(Math.sin(i * 78.233) * 12543.1234);
    const bone = boneAt(a);
    const sx = Math.sin(a);
    const sz = Math.cos(a);
    const x = PAL_O[0] + sx * PAL_R;
    const z = PAL_O[2] + sz * PAL_R;
    const h = 1.5 + r1 * 0.38;
    const r = 0.085 + r2 * 0.03;
    // наклон наружу: на высоте y ось кола сдвинута на lean · y
    const lean = 0.07 + r2 * 0.05;
    const top: V3 = [x + sx * lean * h, h, z + sz * lean * h];
    b.add(rod([x, -0.05, z], top, r, 6), WOOD.clone().multiplyScalar(0.88 + r1 * 0.24), bone);
    const dir = v3(top).sub(new THREE.Vector3(x, -0.05, z)).normalize();
    const tip = new THREE.ConeGeometry(r, 0.3, 6).translate(0, 0.15, 0);
    tip.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, dir));
    b.add(tip.translate(top[0], top[1], top[2]), END, bone, { ao: false });
    const rr = PAL_R + lean * 0.9 - r - 0.03;
    rail.push([PAL_O[0] + sx * rr, 0.9, PAL_O[2] + sz * rr]);
    if (i % 9 === 4) {
      // лоскут цвета варенья снаружи и обмотка
      const ry = h * 0.74;
      const ro = PAL_R + lean * ry + r + 0.03;
      const rag = new THREE.BoxGeometry(0.17, 0.24, 0.012).rotateY(a).translate(PAL_O[0] + sx * ro, ry - 0.1, PAL_O[2] + sz * ro);
      b.add(rag, JAM, bone, { ao: false });
      b.add(new THREE.CylinderGeometry(r + 0.022, r + 0.022, 0.06, 6, 1, true).translate(x + sx * lean * ry, ry, z + sz * lean * ry), JAM_D, bone, { ao: false });
    }
  }
  // обвязка: жерди через три кола
  for (let i = 0; i + 3 < n; i += 3) {
    const am = a0 + ((a1 - a0) * (i + 1.5)) / (n - 1);
    b.add(rod(rail[i], rail[i + 3], 0.035, 4), WOOD_D, boneAt(am));
  }
}

/** Бочки, ящики, мешки у задней стенки, камни-снаряды у катапульты */
function buildProps(b: SkinBuilder): void {
  const p = B.Props;
  barrel(b, p, -1.0, 0, -3.5, 0.32, 0.82, WOOD, 0, true);
  barrel(b, p, -0.35, 0, -3.95, 0.3, 0.76, WOOD_L);
  barrel(b, p, -0.62, 0, -2.98, 0.27, 0.66, WOOD, 1.2, true);
  const crate = (x: number, y: number, z: number, s: number, yaw: number, col: THREE.Color) => {
    b.add(yawAt(box(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2), x, z, yaw), col, p);
    // планки крест-накрест на двух гранях
    for (const sgn of [-1, 1]) {
      b.add(yawAt(box(x - s / 2 - 0.018, y + 0.04, z - 0.05, x + s / 2 + 0.018, y + s - 0.04, z + 0.05), x, z, yaw + (sgn > 0 ? 0 : Math.PI / 2)), WOOD_D, p);
    }
  };
  crate(0.4, 0, -3.8, 0.7, 0.25, WOOD_L);
  crate(0.44, 0.7, -3.82, 0.45, 0.6, WOOD);
  crate(0.92, 0, -3.2, 0.55, -0.3, WOOD);
  for (const [x, z, s] of [[0.05, -3.12, 1], [-0.2, -2.82, 0.85]] as const) {
    b.add(new THREE.SphereGeometry(0.27 * s, 8, 6).scale(1, 0.75, 0.85).rotateY(0.4).translate(x, 0.2 * s, z), SACK, p);
    b.add(new THREE.CylinderGeometry(0.06 * s, 0.09 * s, 0.12 * s, 5).translate(x, 0.42 * s, z), SACK.clone().multiplyScalar(0.85), p);
  }
  // камни для катапульты — горкой у входа
  const st: Array<[number, number, number, number]> = [[1.55, 0.16, 2.55, 0.2], [1.85, 0.15, 2.4, 0.18], [1.7, 0.15, 2.85, 0.19], [1.68, 0.4, 2.6, 0.18], [1.35, 0.13, 2.82, 0.15]];
  st.forEach(([x, y, z, r], i) => b.add(rock(r, 40 + i).translate(x, y, z), STONE, p, { surf: 'semi' }));
}

/** Сундук Барона: окованный, золотые уголки и замок, крышка на петлях, внутри горка золота */
function buildChest(b: SkinBuilder): void {
  const [x, , z] = CHEST;
  const put = (g: THREE.BufferGeometry) => yawAt(g.translate(x, 0, z), x, z, CHEST_YAW);
  const c = B.Chest;
  b.add(put(box(-0.45, 0, -0.28, 0.45, 0.5, 0.28)), WOOD_D, c);
  for (const sx of [-0.28, 0.28]) b.add(put(box(sx - 0.035, 0, -0.298, sx + 0.035, 0.516, 0.298)), JAM_D, c);
  // железные уголки, золотая кромка и замок
  for (const sx of [-0.45, 0.45]) for (const sz of [-0.28, 0.28]) b.add(put(box(sx - 0.035, 0, sz - 0.035, sx + 0.035, 0.518, sz + 0.035)), IRON, c, { surf: 'semi' });
  b.add(put(box(-0.47, 0.44, 0.27, 0.47, 0.5, 0.298)), GOLD, c, { surf: 'semi', ao: false });
  b.add(put(box(-0.09, 0.22, 0.282, 0.09, 0.44, 0.318)), GOLD, c, { surf: 'semi', ao: false });
  // золото внутри: горка и монеты
  const k = B.Coins;
  b.add(put(new THREE.SphereGeometry(0.3, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.35, 0.42, 0.75).translate(0, 0.47, 0)), GOLD, k, { surf: 'gloss', ao: false });
  for (let i = 0; i < 4; i++) {
    const coin = new THREE.CylinderGeometry(0.05, 0.05, 0.012, 8).rotateX(0.5 + i * 0.4).rotateZ(i * 0.7).translate(-0.24 + i * 0.16, 0.6 + (i % 2) * 0.03, -0.05 + (i % 3) * 0.05);
    b.add(put(coin), GOLD, k, { surf: 'gloss', ao: false });
  }
  // крышка: полукруглая, петли сзади (кость — на оси петель)
  const l = B.Lid;
  const lid = new THREE.CylinderGeometry(0.28, 0.28, 0.9, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0.5, 0);
  b.add(put(lid), WOOD, l, { ao: false });
  for (const sx of [-0.28, 0.28]) b.add(put(new THREE.CylinderGeometry(0.298, 0.298, 0.07, 8, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).translate(sx, 0.5, 0)), JAM_D, l, { ao: false });
  b.add(put(box(-0.06, 0.6, 0.2, 0.06, 0.72, 0.27)), GOLD, l, { surf: 'semi', ao: false });
}

/** Костёр с котлом варенья на треноге */
function buildPot(b: SkinBuilder): void {
  const [x, , z] = FIRE;
  const k = B.Pot;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.add(rock(0.11, 60 + i).translate(x + Math.sin(a) * 0.42, 0.06, z + Math.cos(a) * 0.42), STONE, k, { surf: 'semi' });
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    b.add(rod([x + Math.sin(a) * 0.3, 0.05, z + Math.cos(a) * 0.3], [x - Math.sin(a) * 0.12, 0.14, z - Math.cos(a) * 0.12], 0.05, 6), BARK(), k);
  }
  for (let i = 0; i < 4; i++) b.add(rock(0.06, 70 + i).translate(x + (i - 1.5) * 0.08, 0.06, z + ((i % 2) - 0.5) * 0.1), COAL, k);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.add(rod([x + Math.sin(a) * 0.62, 0, z + Math.cos(a) * 0.62], [x, 1.3, z], 0.025, 4), WOOD_D, k);
  }
  b.add(rod([x, 1.3, z], [x, 0.78, z], 0.01, 3), IRON, k, { surf: 'semi' });
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    prof.push(new THREE.Vector2(0.06 + 0.22 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5), t * 0.34));
  }
  b.add(new THREE.LatheGeometry(prof, 10).translate(x, 0.42, z), IRON, k, { surf: 'semi', ao: false });
  b.add(new THREE.TorusGeometry(0.28, 0.025, 3, 10).rotateX(Math.PI / 2).translate(x, 0.76, z), IRON, k, { surf: 'semi', ao: false });
  b.add(new THREE.CircleGeometry(0.26, 10).rotateX(-Math.PI / 2).translate(x, 0.72, z), JAM, k, { surf: 'gloss', ao: false });
  b.add(new THREE.SphereGeometry(0.04, 5, 3).translate(x + 0.08, 0.725, z - 0.05), JAM_L, k, { surf: 'gloss', ao: false });
  // половник в котле
  b.add(rod([x - 0.12, 0.66, z + 0.05], [x - 0.34, 1.05, z + 0.12], 0.016, 4), WOOD_L, k, { ao: false });
}

const BARK = () => H3(0x6b4a2c);

/** Брёвна и доски для стройки катапульты: низ (A) и верх (B) — тают по стадиям */
function buildPile(b: SkinBuilder): void {
  const [x, , z] = PILE;
  const r = 0.12;
  for (const dx of [-0.25, 0, 0.25]) {
    b.add(new THREE.CylinderGeometry(r, r, 1.6, 8, 1, false).rotateX(Math.PI / 2).translate(x + dx, r, z), BARK(), B.PileA);
    for (const s of [-1, 1]) b.add(new THREE.CircleGeometry(r * 0.96, 8).rotateY(s > 0 ? 0 : Math.PI).translate(x + dx, r, z + s * 0.801), END, B.PileA);
  }
  for (const dx of [-0.125, 0.125]) {
    b.add(new THREE.CylinderGeometry(r, r, 1.5, 8, 1, false).rotateX(Math.PI / 2).translate(x + dx, r * 2.72, z + 0.05), BARK(), B.PileB);
    for (const s of [-1, 1]) b.add(new THREE.CircleGeometry(r * 0.96, 8).rotateY(s > 0 ? 0 : Math.PI).translate(x + dx, r * 2.72, z + 0.05 + s * 0.751), END, B.PileB);
  }
  b.add(box(x - 0.35, 0.56, z - 0.75, x - 0.05, 0.6, z + 0.6).rotateY(0), WOOD_L, B.PileB);
  b.add(box(x + 0.02, 0.6, z - 0.6, x + 0.3, 0.64, z + 0.7), WOOD, B.PileB);
}

/** Горючие точки: где растёт огонь при поджоге и что горит, когда лагерь вспыхнул */
function spots(): Spot[] {
  const out: Spot[] = [];
  const add = (bone: B, p: V3, size: number) => {
    const bb = BONES[bone][1];
    out.push({ bone, off: new THREE.Vector3(p[0] - bb[0], p[1] - bb[1], p[2] - bb[2]), size, ph: out.length * 1.73, delay: 0 });
  };
  const cp = (x: number, y: number, z: number): V3 => [C[0] + x, y, C[2] + z];
  // палатки
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    add(B.TentAc, [TENT_A[0] + Math.sin(a) * 0.9, 0.5 + (i % 2) * 0.7, TENT_A[2] + Math.cos(a) * 0.9], 1.0);
  }
  add(B.TentAc, [TENT_A[0], 2.1, TENT_A[2]], 1.15);
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Vector3(-0.8 + i * 0.55, 0.6 + (i % 2) * 0.6, i % 2 ? 0.35 : -0.35).applyAxisAngle(Y, TENT_B_YAW);
    add(B.TentBc, [TENT_B[0] + p.x, p.y, TENT_B[2] + p.z], 1.0);
  }
  // катапульта: рама, стойки, рычаг, противовес
  add(B.Frame, cp(-0.78, 0.75, 0.9), 0.85);
  add(B.Frame, cp(0.78, 0.75, -0.7), 0.85);
  add(B.Frame, cp(0, 0.95, -1.32), 0.8);
  add(B.Uprights, cp(-0.42, 1.9, 0.3), 0.8);
  add(B.Uprights, cp(0.42, 2.3, -0.3), 0.8);
  add(B.Arm, cp(0, H + 0.9, 0), 0.7);
  add(B.Cw, cp(0, H - S - 0.6, 0), 0.75);
  // частокол, ящики, брёвна, флаг
  for (let i = 0; i < 9; i++) {
    const a = PAL_GAP + 0.15 + ((Math.PI * 2 - 2 * PAL_GAP - 0.3) * i) / 8;
    const bone = a < Math.PI * 0.83 ? B.PalR : a > Math.PI * 1.17 ? B.PalL : B.PalB;
    add(bone, [PAL_O[0] + Math.sin(a) * PAL_R, 0.7 + (i % 3) * 0.25, PAL_O[2] + Math.cos(a) * PAL_R], 0.62);
  }
  add(B.Props, [0.4, 0.8, -3.8], 0.8);
  add(B.Props, [-0.8, 0.6, -3.4], 0.7);
  add(B.Props, [0.92, 0.45, -3.2], 0.6);
  add(B.PileA, [PILE[0], 0.35, PILE[2] - 0.3], 0.7);
  add(B.PileA, [PILE[0], 0.35, PILE[2] + 0.4], 0.6);
  add(B.Flag2, [BANNER[0] - 0.8, (FLAG_Y0 + FLAG_Y1) / 2, BANNER[2]], 0.55);
  return out;
}

/** Утоптанная земля: неровный круг, к краю прозрачнее, под палатками и катапультой — темнее */
function buildDecal(tex: THREE.Texture): THREE.Mesh {
  const rings = [0, 1.6, 3.2, 4.6, 5.4, 6.2];
  const alpha = [1, 1, 0.95, 0.85, 0.45, 0];
  const n = 28;
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const dark = (x: number, z: number) => {
    let k = 1;
    for (const [cx, cz, r] of [[TENT_A[0], TENT_A[2], 1.4], [TENT_B[0], TENT_B[2], 1.4], [C[0], C[2], 2.0], [FIRE[0], FIRE[2], 0.8]] as const) {
      const d = Math.hypot(x - cx, z - cz) / r;
      if (d < 1) k *= 0.82 + 0.18 * d * d;
    }
    return k;
  };
  for (let j = 0; j < rings.length; j++) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wob = 1 + 0.08 * Math.sin(a * 3 + 1.1) + 0.05 * Math.sin(a * 5 + 0.3);
      const r = rings[j] * (j ? wob : 1);
      const x = PAL_O[0] + Math.sin(a) * r;
      const z = PAL_O[2] + 0.2 + Math.cos(a) * r;
      pos.push(x, 0.022, z);
      uv.push(x / 4, -z / 4);
      const k = dark(x, z);
      col.push(k, k, k, alpha[j]);
      if (j > 0) {
        const a0 = (j - 1) * n + i;
        const a1 = (j - 1) * n + ((i + 1) % n);
        const b0 = j * n + i;
        const b1 = j * n + ((i + 1) % n);
        idx.push(a0, b0, b1, a0, b1, a1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 3).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  const m = new THREE.MeshStandardMaterial({
    map: tex, color: 0xd9bf98, vertexColors: true, transparent: true, depthWrite: false, roughness: 1,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}

// ------------------------------------------------------------ плавности

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => THREE.MathUtils.smoothstep(v, a, b);
const lerp = THREE.MathUtils.lerp;
function backOut(t: number): number {
  const c1 = 1.9;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}
function bounceOut(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}
/** Храповик: n рывков, каждый — быстрый ход и пауза */
function ratchet(s: number, n: number): number {
  if (s >= 1) return 1;
  if (s <= 0) return 0;
  const i = Math.floor(s * n);
  const f = s * n - i;
  return (i + smooth(0, 0.42, f)) / n;
}

const FLAME_FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * abs(vCol.a);
  float cover = vCol.a < 0.0 ? 0.75 : (vUv.x < 0.5 ? 0.62 : 0.0);
  gl_FragColor = vec4(vCol.rgb * t.rgb * a, a * cover);
}`;

interface Ember {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  color: THREE.Color;
  /** золото: падает обратно; угли — поднимаются */
  gold: boolean;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const _e = new THREE.Euler();

export class Camp3D {
  /** Камень катапульты долетел до цели (пыль и удар делает игра) */
  onLand?: (x: number, y: number, z: number) => void;
  /** Звук: что и где (подключить к FortSfx) */
  onSound?: (kind: CampSound, x: number, y: number, z: number) => void;
  readonly triangles: number;
  readonly fx: CastleFx;
  readonly mesh: THREE.SkinnedMesh;
  private readonly scene: THREE.Scene;
  private readonly bones: THREE.Bone[] = [];
  private readonly bind: THREE.Vector3[] = [];
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly decal: THREE.Mesh;
  private readonly decalMat: THREE.MeshStandardMaterial;
  private readonly flames: Billboards;
  private readonly spots: Spot[];
  private readonly embers: Ember[] = [];
  private readonly textures: THREE.Texture[] = [];
  private torchObj: THREE.Group | null = null;
  private readonly torchGeo: THREE.BufferGeometry;
  private readonly torchMat: THREE.MeshStandardMaterial;
  private readonly fired = new Set<string>();

  private camp: F50Camp | null = null;
  private shownAt = -1e9;
  private goneAt = -1;
  private stage = 0;
  private readonly stageAt = [-1e9, -1e9, -1e9, -1e9];
  /** поворот лагеря (вход к крепости) и наведение катапульты */
  private yaw0 = 0;
  private aim = 0;
  private aimTo = 0;
  private wheelL = 0;
  private wheelR = 0;
  // выстрел
  private windStart = -1;
  private windFrom = TH_READY;
  private fireAt = 0;
  private fireStart = -1;
  private fireFrom = TH_WIND;
  private releaseAt = 0;
  private landAt = 0;
  private reloadAt = -1e9;
  private readonly to = new THREE.Vector3();
  private readonly relPos = new THREE.Vector3();
  private readonly relVel = new THREE.Vector3();
  private released = false;
  private stoneHad = false;
  private readonly stoneDrop = new THREE.Vector3();
  private landed = true;
  private trailAt = 0;
  // огонь
  private burnFrom = -1;
  private burnUntil = 0;
  private cancelAt = -1;
  private ignite = 0;
  private burntAt = -1;
  private quiet = false;
  private smokeAcc = 0;
  private emberAcc = 0;
  private steamAt = 0;
  private lastT = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const b = new SkinBuilder();
    buildCatapult(b);
    buildStone(b);
    buildTentA(b);
    buildTentB(b);
    buildBanner(b);
    buildPalisade(b);
    buildProps(b);
    buildChest(b);
    buildPot(b);
    buildPile(b);
    const { map, rough } = atlas();
    this.textures.push(map, rough);
    this.mat = new THREE.MeshStandardMaterial({ map, roughnessMap: rough, vertexColors: true, roughness: 1, metalness: 0 });
    this.mesh = new THREE.SkinnedMesh(b.build(), this.mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < B.Count; i++) {
      const bone = new THREE.Bone();
      const [parent, p] = BONES[i];
      const pp = parent >= 0 ? BONES[parent][1] : [0, 0, 0];
      bone.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
      this.bind.push(bone.position.clone());
      this.bones.push(bone);
    }
    for (let i = 0; i < B.Count; i++) {
      const parent = BONES[i][0];
      if (parent >= 0) this.bones[parent].add(this.bones[i]);
      else this.mesh.add(this.bones[i]);
    }
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.visible = false;

    const dirt = dirtTexture();
    dirt.wrapS = dirt.wrapT = THREE.RepeatWrapping;
    this.textures.push(dirt);
    this.decal = buildDecal(dirt);
    this.decalMat = this.decal.material as THREE.MeshStandardMaterial;
    this.decal.visible = false;

    this.fx = new CastleFx();
    const fire = fireAtlas();
    this.textures.push(fire);
    this.flames = new Billboards(260, fire, true, 2);
    this.flames.mesh.visible = false;
    // свой огонь — с предумноженной прозрачностью: язычки (клетка 0) закрывают фон (на фиолетовом холсте пламя
    // остаётся оранжевым, а не розовым), свечение (клетка 1) складывается; отрицательная прозрачность — свечение,
    // которое закрывает фон (красный знак замаха)
    const fm = this.flames.mesh.material as THREE.ShaderMaterial;
    fm.fragmentShader = FLAME_FRAG;
    fm.blendSrc = THREE.OneFactor;
    fm.blendDst = THREE.OneMinusSrcAlphaFactor;
    fm.needsUpdate = true;
    this.spots = spots();

    // факел: палка, железное кольцо, просмолённая обмотка (огонь — в общем огне лагеря)
    const tg = new SkinBuilder();
    tg.add(rod([0, -0.12, 0], [0, 0.6, 0], 0.028, 6, 0.032), WOOD_D, 0, { ao: false });
    tg.add(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 6, 1, true).translate(0, 0.5, 0), IRON, 0, { surf: 'semi', ao: false });
    tg.add(new THREE.CylinderGeometry(0.05, 0.058, 0.16, 7).translate(0, 0.62, 0), H3(0x3a2a1c), 0, { ao: false });
    const tgeo = tg.build();
    tgeo.deleteAttribute('skinIndex');
    tgeo.deleteAttribute('skinWeight');
    this.torchGeo = tgeo;
    this.torchMat = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.9 });

    this.triangles = b.triangles + (this.decal.geometry.index?.count ?? 0) / 3 + tg.triangles;
    scene.add(this.mesh, this.decal, this.flames.mesh, this.fx.dust.mesh, this.fx.chunks);
  }

  // ------------------------------------------------------------ состояние с сервера

  /**
   * Лагерь с сервера (или null — убран). Новый лагерь растёт из земли; новая стадия — детали катапульты встают на
   * место; burnt — сгорел (если лагерь пришёл уже сгоревшим, сразу остатки). instant — без анимации (вход в игру).
   */
  set(camp: F50Camp | null, now: number, instant = false): void {
    if (!camp) {
      if (this.camp && this.goneAt < 0) {
        this.goneAt = instant ? now - 10 : now;
        if (!instant) {
          const r = this.bones[B.Root].position;
          this.sound('sink', r.x, 0.5, r.z);
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            this.fx.puff(r.x + Math.sin(a) * 3.5, 0.3, r.z + Math.cos(a) * 3.5, 2, 1.2, 1.3, 0.5, 2.2, DUST, 0.5);
          }
        }
      }
      return;
    }
    const prev = this.camp;
    const fresh = !prev || this.goneAt >= 0 || prev.x !== camp.x || prev.z !== camp.z || prev.placed !== camp.placed;
    this.camp = { ...camp };
    if (fresh) {
      this.reset(camp, now, instant);
      this.stage = camp.stage;
      for (let s = 1; s <= 3; s++) this.stageAt[s] = instant ? now - 100 : now + 1.25 + (s - 1) * 0.45;
      if (!instant) this.sound('rise', camp.x, 0.5, camp.z);
    } else if (camp.stage > this.stage) {
      for (let s = this.stage + 1; s <= camp.stage; s++) this.stageAt[s] = instant ? now - 100 : now + (s - this.stage - 1) * 0.7;
      this.stage = camp.stage;
    } else this.stage = camp.stage;
    if (camp.burnt && this.burntAt < 0) this.burnt(now, instant || fresh);
  }

  private reset(camp: F50Camp, now: number, instant: boolean): void {
    this.shownAt = instant ? now - 100 : now;
    this.goneAt = -1;
    this.stage = 0;
    this.stageAt.fill(-1e9);
    this.fired.clear();
    this.windStart = -1;
    this.fireStart = -1;
    this.reloadAt = -1e9;
    this.landed = true;
    this.released = false;
    this.stoneHad = false;
    this.burnFrom = -1;
    this.cancelAt = -1;
    this.burntAt = -1;
    this.quiet = false;
    // вход лагеря — к стене своей стороны, чуть севернее середины (так цели ±36° от оси)
    const side = camp.x < 0 ? -1 : 1;
    const tx = side * 18 - camp.x;
    const tz = 2.5;
    this.yaw0 = Math.atan2(tx, tz);
    this.aim = 0;
    this.aimTo = 0;
    const root = this.bones[B.Root];
    root.position.set(camp.x, 0, camp.z);
    root.quaternion.setFromAxisAngle(Y, this.yaw0);
    this.mesh.visible = true;
    this.decal.visible = true;
    this.mat.color.setRGB(1, 1, 1);
    this.mat.emissive.setRGB(0, 0, 0);
    this.decalMat.color.set(0xd9bf98);
  }

  // ------------------------------------------------------------ катапульта

  /** Замах: ворот оттягивает рычаг к fireAt (щелчки, дрожь), камень загорается красным; to — куда целится */
  windup(now: number, fireAt: number, to?: P3): void {
    if (!this.camp || this.stage < 2 || this.burntAt >= 0) return;
    this.windFrom = this.armAngle(now);
    this.windStart = now;
    this.fireAt = Math.max(now + 0.3, fireAt);
    this.reloadAt = Math.min(this.reloadAt, now);
    if (to) this.aimAt(to);
    for (const k of [...this.fired]) if (k.startsWith('w')) this.fired.delete(k);
  }

  /** Выстрел: рычаг бьёт вперёд, праща бросает камень по дуге — к landAt он точно в to (тогда onLand) */
  fire(to: P3, now: number, landAt: number): void {
    if (!this.camp || this.stage < 2 || this.burntAt >= 0) return;
    this.fireFrom = this.armAngle(now);
    this.windStart = -1;
    this.fireStart = now;
    this.to.set(to.x, to.y, to.z);
    this.releaseAt = now + TS * REL;
    this.landAt = Math.max(this.releaseAt + 0.3, landAt);
    this.reloadAt = now + TS + HOLD + RETURN;
    this.released = false;
    this.landed = false;
    this.aimAt(to);
    for (const k of [...this.fired]) if (k.startsWith('f') || k.startsWith('r')) this.fired.delete(k);
  }

  private aimAt(to: P3): void {
    const root = this.bones[B.Root].position;
    const cx = root.x + Math.sin(this.yaw0) * C[2];
    const cz = root.z + Math.cos(this.yaw0) * C[2];
    let a = Math.atan2(to.x - cx, to.z - cz) - this.yaw0;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    this.aimTo = THREE.MathUtils.clamp(a, -AIM_MAX, AIM_MAX);
  }

  /** Угол рычага от вертикали назад (рад) в момент t */
  private armAngle(t: number): number {
    if (this.fireStart >= 0 && t >= this.fireStart && (this.windStart < 0 || this.windStart < this.fireStart)) {
      const tf = t - this.fireStart;
      if (tf < TS) {
        const k = tf / TS;
        return this.fireFrom + (TH_END - this.fireFrom) * k * k;
      }
      const t2 = tf - TS;
      if (t2 < OSC) return TH_END * Math.exp(-t2 / 0.5) * Math.cos((Math.PI * 2 * t2) / 1.0);
      if (t2 < HOLD) return TH_END * Math.exp(-OSC / 0.5) * Math.cos(Math.PI * 2 * OSC) * (1 - smooth(OSC, HOLD, t2));
      return TH_READY * ratchet((t2 - HOLD) / RETURN, 8);
    }
    if (this.windStart >= 0 && t >= this.windStart) {
      const s = clamp01((t - this.windStart) / Math.max(0.2, this.fireAt - 0.15 - this.windStart));
      return this.windFrom + (TH_WIND - this.windFrom) * ratchet(s, 6);
    }
    return TH_READY;
  }

  // ------------------------------------------------------------ огонь

  /** Поджигают: язычки у ближайшей к at горючей точки растут к until */
  burnStart(now: number, until: number, at?: { x: number; z: number }): void {
    if (!this.camp || this.burntAt >= 0) return;
    this.burnFrom = now;
    this.burnUntil = Math.max(now + 0.3, until);
    this.cancelAt = -1;
    this.mesh.updateMatrixWorld(true);
    const p = at ?? { x: this.bones[B.Root].position.x, z: this.bones[B.Root].position.z };
    let best = 0;
    let bd = Infinity;
    this.spots.forEach((s, i) => {
      this.spotPos(s, _v);
      const d = Math.hypot(_v.x - p.x, _v.z - p.z) + (_v.y > 1.6 ? 2 : 0);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    this.ignite = best;
    this.spotPos(this.spots[best], _v);
    this.sound('ignite', _v.x, _v.y, _v.z);
  }

  /** Поджог сорван: огонёк гаснет с дымком */
  burnCancel(): void {
    if (this.burnFrom < 0 || this.burntAt >= 0) return;
    this.cancelAt = this.lastT;
    this.spotPos(this.spots[this.ignite], _v);
    this.fx.puff(_v.x, _v.y + 0.2, _v.z, 3, 0.25, 0.5, 0.6, 1.6, SMOKE_L, 0.45);
    this.sound('fizzle', _v.x, _v.y, _v.z);
  }

  /** Лагерь сгорел: огонь бежит по лагерю, катапульта рушится, сундук распахивается со вспышкой золота */
  burnt(now: number, instant = false): void {
    if (!this.camp || this.burntAt >= 0) return;
    this.burntAt = instant ? now - 120 : now;
    this.quiet = instant;
    if (this.camp) this.camp.burnt = true;
    this.windStart = -1;
    const stone = this.bones[B.Stone];
    this.stoneHad = !instant && stone.scale.x > 0.5 && !(this.released && !this.landed);
    this.stoneDrop.copy(stone.position);
    this.mesh.updateMatrixWorld(true);
    const from = new THREE.Vector3();
    this.spotPos(this.spots[this.burnFrom >= 0 ? this.ignite : 10], from);
    for (const s of this.spots) {
      this.spotPos(s, _v);
      s.delay = Math.min(1.6, from.distanceTo(_v) * 0.17);
    }
    this.burnFrom = -1;
    if (!instant) this.sound('roar', from.x, from.y, from.z);
  }

  private spotPos(s: Spot, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(s.off).applyMatrix4(this.bones[s.bone].matrixWorld);
  }

  /** Сила огня точки через dt секунд после её вспышки */
  private static fireCurve(dt: number): number {
    if (dt <= 0) return 0;
    if (dt < 0.6) return dt / 0.6;
    if (dt < 6.5) return 1;
    if (dt < 12) return lerp(1, 0.22, (dt - 6.5) / 5.5);
    if (dt < 25) return lerp(0.22, 0.05, (dt - 12) / 13);
    return 0.05;
  }

  // ------------------------------------------------------------ факел

  /** Факел в руку игрока: рукоять в начале координат, огонь на +Y (~0,75 м); один на лагерь */
  torch(): THREE.Object3D {
    if (!this.torchObj) {
      const g = new THREE.Group();
      g.name = 'camp-torch';
      const m = new THREE.Mesh(this.torchGeo, this.torchMat);
      m.castShadow = true;
      g.add(m);
      this.torchObj = g;
    }
    return this.torchObj;
  }

  setQuality(tier: 'low' | 'medium' | 'high'): void {
    this.fx.scale = tier === 'low' ? 0.45 : tier === 'medium' ? 0.7 : 1;
  }

  /** Отрисовок сейчас (для стенда) */
  get draws(): number {
    let n = 0;
    if (this.mesh.visible) n++;
    if (this.decal.visible) n++;
    if (this.flames.mesh.visible && this.flames.count) n++;
    if (this.fx.dust.count) n++;
    if (this.fx.chunks.count) n++;
    if (this.torchObj?.parent) n++;
    return n;
  }

  info(): Record<string, unknown> {
    return {
      camp: this.camp, stage: this.stage, burnt: this.burntAt >= 0, arm: +(this.armAngle(this.lastT) / DEG).toFixed(1), aim: +(this.aim / DEG).toFixed(1),
      flames: this.flames.count, particles: this.fx.alive + this.embers.length, draws: this.draws, triangles: this.triangles,
    };
  }

  // ------------------------------------------------------------ кадр

  update(dt: number, t: number): void {
    this.lastT = t;
    if (this.camp || this.goneAt >= 0) this.pose(dt, t);
    this.mesh.updateMatrixWorld(true);
    this.updateFire(dt, t);
    this.fx.update(dt, t);
  }

  private once(key: string): boolean {
    if (this.fired.has(key)) return false;
    this.fired.add(key);
    return true;
  }

  private sound(kind: CampSound, x: number, y: number, z: number): void {
    if (!this.quiet) this.onSound?.(kind, x, y, z);
  }

  /** Мировая точка из точки привязки (в лагере) */
  private world(p: V3, out: THREE.Vector3): THREE.Vector3 {
    const r = this.bones[B.Root];
    return out.set(p[0], p[1], p[2]).applyQuaternion(r.quaternion).add(r.position);
  }

  private pose(dt: number, t: number): void {
    const bn = this.bones;
    const set = (i: number, ox = 0, oy = 0, oz = 0) => bn[i].position.set(this.bind[i].x + ox, this.bind[i].y + oy, this.bind[i].z + oz);
    for (let i = 0; i < B.Count; i++) {
      if (i === B.Root || i === B.Stone) continue;
      set(i);
      bn[i].quaternion.identity();
      bn[i].scale.setScalar(1);
    }
    const burnt = this.burntAt >= 0 ? t - this.burntAt : -1;

    // уход: лагерь оседает в землю
    const root = bn[B.Root];
    let gone = 0;
    if (this.goneAt >= 0) {
      gone = clamp01((t - this.goneAt) / 1.4);
      if (gone >= 1) {
        this.mesh.visible = false;
        this.decal.visible = false;
        this.camp = null;
        this.goneAt = -1;
        return;
      }
    }
    root.scale.set(1 + gone * 0.08, 1 - gone * 0.85, 1 + gone * 0.08);
    root.position.y = -gone * gone * 0.6;
    this.decal.position.set(root.position.x, 0, root.position.z);
    this.decal.quaternion.copy(root.quaternion);
    this.decalMat.opacity = 1 - gone;

    // рост из земли: часть за частью, с пылью
    for (const [k, delay] of Object.entries(RISE)) {
      const i = Number(k) as B;
      const s = clamp01((t - this.shownAt - delay) / RISE_T);
      const pal = i === B.PalL || i === B.PalB || i === B.PalR;
      if (s <= 0) bn[i].scale.setScalar(0);
      else if (s < 1) {
        if (pal) bn[i].position.y = this.bind[i].y - 1.9 * (1 - backOut(s));
        else bn[i].scale.set(0.55 + 0.45 * backOut(s), backOut(s), 0.55 + 0.45 * backOut(s));
      }
      if (s > 0 && t - this.shownAt < 30 && this.once(`rise${i}`)) {
        this.world(BONES[i][1], _v);
        const big = pal ? 3 : 2;
        this.fx.puff(_v.x, 0.25, _v.z, big, pal ? 2.2 : 0.9, 0.8, 0.55, 1.6, DUST, 0.5);
        this.fx.burst(_v.x, 0.1, _v.z, 3, H3(0x9b8160), [0.08, 0.06, 0.08], 2.2, 0, 1, 0, 1.4);
      }
    }

    // стадии стройки: брёвна тают, детали падают на место с отскоком, пылью и стуком
    const st = this.stage;
    const pileA = st >= 3 ? 1 - clamp01((t - this.stageAt[3]) / 0.5) : 1;
    const pileB = st >= 2 ? 1 - clamp01((t - this.stageAt[2]) / 0.5) : 1;
    bn[B.PileA].scale.multiplyScalar(pileA);
    bn[B.PileB].scale.multiplyScalar(pileB);
    const drop = (i: B, s: number, h: number, key: string) => {
      if (s <= 0) {
        bn[i].scale.setScalar(0);
        return;
      }
      if (s < 1) bn[i].position.y += h * (1 - bounceOut(s));
      if (s > 0.36 && this.once(key)) {
        bn[i].updateWorldMatrix(true, false);
        _v.set(0, 0, 0).applyMatrix4(bn[i].matrixWorld);
        this.fx.puff(_v.x, Math.max(0.3, _v.y - 0.6), _v.z, 3, 0.6, 0.6, 0.5, 1.3, DUST, 0.45);
        this.fx.burst(_v.x, Math.max(0.3, _v.y), _v.z, 4, SPLINTER, [0.04, 0.03, 0.18], 2.5);
        this.sound('thud', _v.x, _v.y, _v.z);
      }
    };
    const s1 = st >= 1 ? clamp01((t - this.stageAt[1]) / 0.65) : 0;
    const s2 = st >= 2 ? clamp01((t - this.stageAt[2]) / 0.75) : 0;
    const s3 = st >= 3 ? clamp01((t - this.stageAt[3]) / 0.6) : 0;
    drop(B.Frame, s1, 1.2, 'st1');
    drop(B.Uprights, s1 > 0 ? clamp01((t - this.stageAt[1] - 0.15) / 0.65) : 0, 2.2, 'st1u');
    drop(B.Arm, s2, 2.6, 'st2');
    drop(B.Winch, s2 > 0 ? clamp01((t - this.stageAt[2] - 0.2) / 0.5) : 0, 0.9, 'st2w');
    drop(B.Sling, s3, 0.8, 'st3');

    // ------------------------------------------------ катапульта: наведение, рычаг, отдача, праща
    const dYaw = THREE.MathUtils.clamp(this.aimTo - this.aim, -AIM_SPEED * dt, AIM_SPEED * dt);
    if (burnt < 0) this.aim += dYaw;
    this.wheelL += (dYaw * WX) / WR;
    this.wheelR -= (dYaw * WX) / WR;
    bn[B.Cata].quaternion.setFromAxisAngle(Y, this.aim);

    let th = this.armAngle(t);
    const tf = this.fireStart >= 0 && (this.windStart < 0 || this.windStart < this.fireStart) ? t - this.fireStart : -1;
    // дрожь замаха — растёт к выстрелу
    let shake = 0;
    if (this.windStart >= 0 && t >= this.windStart && burnt < 0) {
      const k = clamp01((t - this.windStart) / Math.max(0.2, this.fireAt - this.windStart));
      shake = k * k;
      th += Math.sin(t * 61) * 0.012 * shake;
      const step = Math.floor(clamp01((t - this.windStart) / Math.max(0.2, this.fireAt - 0.15 - this.windStart)) * 6);
      if (step < 6 && this.once(`w${step}`)) this.creak(st);
    }
    // взвод после выстрела — щелчки храповика
    if (tf > TS + HOLD && tf < TS + HOLD + RETURN) {
      const step = Math.floor(((tf - TS - HOLD) / RETURN) * 8);
      if (this.once(`r${step}`)) this.creak(st);
    }
    // отдача: рама откатывается и поднимает перёд, потом её подкатывают обратно
    let back = 0;
    let pitch = 0;
    if (tf >= 0 && tf < 6) {
      back = 0.24 * smooth(0.12, 0.34, tf) * (1 - smooth(2.6, 5.6, tf));
      pitch = 0.075 * Math.sin(Math.PI * clamp01((tf - 0.12) / 0.5)) + (tf > 0.62 ? 0.02 * Math.sin((tf - 0.62) * 17) * Math.exp(-(tf - 0.62) * 4) : 0);
      if (tf > TS && this.once('fbang')) {
        this.world([C[0], 0.4, C[2]], _v);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          _w.set(sx * WX, 0.1, sz * WZ).applyAxisAngle(Y, this.aim + this.yaw0).add(_v);
          this.fx.puff(_w.x, 0.15, _w.z, 2, 0.3, 0.6, 0.4, 1.2, DUST, 0.5);
        }
        this.sound('bang', _v.x, 2, _v.z);
      }
    }
    const roll = back / WR;
    bn[B.Frame].position.z -= back;
    bn[B.Frame].position.x += Math.sin(t * 47) * 0.006 * shake;
    bn[B.Frame].quaternion.setFromAxisAngle(_w.set(1, 0, 0), -pitch);
    bn[B.Uprights].quaternion.setFromAxisAngle(_w.set(0, 0, 1), Math.sin(t * 31) * 0.004 * shake);

    // поломка при пожаре: рычаг падает на раму, стойки валятся набок, рама кренится на сломанное колесо
    let brk = 0;
    if (burnt >= 0) {
      brk = clamp01((burnt - 1.5) / 0.8);
      const fall = brk * brk;
      if (brk > 0 && this.once('crack')) {
        this.world([C[0], H, C[2]], _v);
        this.fx.burst(_v.x, _v.y, _v.z, 14, SPLINTER, [0.05, 0.04, 0.3], 4.5, 0, 0.6, 0, 1.6);
        this.fx.burst(_v.x, _v.y - 1, _v.z, 6, PLANK, [0.12, 0.05, 0.4], 3, 0, 0.4, 0, 1.4);
        this.sound('crack', _v.x, _v.y, _v.z);
      }
      if (brk >= 1 && this.once('crash')) {
        this.world([C[0], 0.5, C[2] - 1.5], _v);
        this.fx.puff(_v.x, 0.4, _v.z, 6, 1.4, 1.2, 0.6, 2.2, SMOKE, 0.5);
        this.sound('thud', _v.x, 0.5, _v.z);
      }
      th = lerp(th, 109 * DEG, fall);
      bn[B.Arm].position.y -= (H - 1.05) * fall;
      bn[B.Arm].position.x += 0.25 * fall;
      const tilt = smooth(1.5, 2.6, burnt);
      bn[B.Uprights].quaternion.setFromAxisAngle(_w.set(0, 0, 1), -0.32 * tilt);
      bn[B.Frame].quaternion.multiply(_q.setFromAxisAngle(_w.set(0, 0, 1), 0.11 * tilt));
      bn[B.Frame].position.y -= 0.12 * tilt;
      bn[B.WFL].scale.set(1, 1 - 0.45 * tilt, 1);
      bn[B.WFL].quaternion.setFromAxisAngle(_w.set(0, 0, 1), 0.5 * tilt);
      bn[B.Rope].scale.setScalar(0);
      bn[B.Sling].scale.multiplyScalar(1 - smooth(1.0, 1.6, burnt));
    }
    bn[B.Arm].quaternion.multiply(_q.setFromAxisAngle(_w.set(1, 0, 0), -th));
    if (brk > 0) bn[B.Arm].quaternion.premultiply(_q.setFromAxisAngle(_w.set(0, 0, 1), -0.3 * brk * brk));

    // противовес висит отвесно, при ударе раскачивается
    let cwSwing = 0;
    if (tf >= 0 && tf < TS) cwSwing = 0.5 * Math.sin(Math.PI * (tf / TS));
    else if (tf >= TS && tf < 4) cwSwing = 0.35 * Math.exp(-(tf - TS) / 0.6) * Math.sin((tf - TS) * 6);
    bn[B.Cw].quaternion.setFromAxisAngle(_w.set(1, 0, 0), th + cwSwing + (brk > 0 ? 0.7 * brk : 0));

    // праща: в покое висит отвесно и чуть качается, при ударе отстаёт и хлещет вперёд
    let sling = th + Math.sin(t * 2.1) * 0.06 + Math.sin(t * 61) * 0.02 * shake;
    if (tf >= 0 && tf < TS) sling = th - 3.0 * (tf / TS) ** 2;
    else if (tf >= TS && tf < 4) sling = th - 3.0 * Math.exp(-(tf - TS) / 0.35) * Math.cos((tf - TS) * 9);
    bn[B.Sling].quaternion.setFromAxisAngle(_w.set(1, 0, 0), sling);

    // ворот крутится, пока тянет; канат — от барабана к крюку рычага
    const winding = (this.windStart >= 0 && t >= this.windStart) || (tf > TS + HOLD && tf < TS + HOLD + RETURN);
    bn[B.Winch].quaternion.setFromAxisAngle(_w.set(1, 0, 0), -th * 3.2);
    const ropeOn = st >= 2 && brk === 0 && !(tf >= 0 && tf < TS + HOLD);
    if (ropeOn) {
      const hy = H + HOOK * Math.cos(th);
      const hz = -HOOK * Math.sin(th) - 0.1;
      const dy = hy - (WINCH[1] + 0.12);
      const dz = hz - WINCH[2];
      const len = Math.hypot(dy, dz);
      bn[B.Rope].quaternion.setFromUnitVectors(Y, _w.set(0, dy / len, dz / len));
      bn[B.Rope].scale.set(1, len, 1);
      if (winding) bn[B.Rope].scale.x = bn[B.Rope].scale.z = 1.12;
    } else bn[B.Rope].scale.setScalar(0);

    // колёса: поворот на месте и откат
    bn[B.WFL].quaternion.multiply(_q.setFromAxisAngle(_w.set(1, 0, 0), this.wheelL - roll));
    bn[B.WRL].quaternion.setFromAxisAngle(_w.set(1, 0, 0), this.wheelL - roll);
    bn[B.WFR].quaternion.setFromAxisAngle(_w.set(1, 0, 0), this.wheelR - roll);
    bn[B.WRR].quaternion.setFromAxisAngle(_w.set(1, 0, 0), this.wheelR - roll);

    // ------------------------------------------------ лагерь в покое: вымпелы, флаг
    bn[B.PenA].quaternion.setFromAxisAngle(Y, 0.35 * Math.sin(t * 2.6) + 0.6);
    bn[B.PenB].quaternion.setFromAxisAngle(Y, 0.35 * Math.sin(t * 2.4 + 1.3) - 0.4);
    const wave = (i: B, k: number, a: number) => {
      bn[i].quaternion.setFromEuler(_e.set(0, a * Math.sin(t * 2.1 - k * 0.95) + (k === 0 ? 0.25 : 0), 0.05 * Math.sin(t * 1.3 + k)));
    };
    wave(B.Flag1, 0, 0.16);
    wave(B.Flag2, 1, 0.3);
    wave(B.Flag3, 2, 0.36);

    // ------------------------------------------------ пожар: холст и флаг сгорают, частокол оседает, сундук
    if (burnt >= 0) {
      const sp = this.spots;
      const burnCanvas = (i: B, d: number) => {
        const c = clamp01((burnt - d - 1.0) / 3.6);
        if (c >= 0.97) bn[i].scale.setScalar(0);
        else bn[i].scale.set(1 - 0.3 * c, 1 - 0.92 * c * c, 1 - 0.3 * c);
      };
      burnCanvas(B.TentAc, sp[0].delay);
      burnCanvas(B.TentBc, sp[6].delay);
      const fd = sp[sp.length - 1].delay;
      bn[B.Flag3].scale.multiplyScalar(1 - smooth(1.4, 2.2, burnt - fd));
      bn[B.Flag2].scale.multiplyScalar(1 - smooth(2.0, 2.8, burnt - fd));
      bn[B.Flag1].scale.multiplyScalar(1 - smooth(2.6, 3.4, burnt - fd));
      bn[B.Banner].quaternion.setFromAxisAngle(_w.set(0, 0, 1), -0.2 * smooth(4, 5.5, burnt));
      const sink = smooth(3, 9, burnt);
      for (const i of [B.PalL, B.PalB, B.PalR]) bn[i].scale.y *= 1 - 0.3 * sink;
      bn[B.Props].scale.y *= 1 - 0.3 * smooth(3, 8, burnt);
      bn[B.PileA].scale.y *= 1 - 0.35 * smooth(3, 8, burnt);
      bn[B.TentAf].scale.y *= 1 - 0.25 * smooth(4, 9, burnt);
      bn[B.TentBf].scale.y *= 1 - 0.2 * smooth(4, 9, burnt);
      // сундук: крышка распахивается с пружиной, золото вылетает
      const o = burnt - 1.0;
      if (o > 0) {
        const ang = -1.95 * (1 - Math.exp(-o * 7) * Math.cos(o * 11));
        bn[B.Lid].quaternion.setFromAxisAngle(_w.set(1, 0, 0).applyAxisAngle(Y, CHEST_YAW), ang);
        bn[B.Coins].scale.setScalar(1 - smooth(0.25, 1.6, o));
        if (this.once('chest') && !this.quiet) {
          this.world([CHEST[0], 0.75, CHEST[2]], _v);
          this.goldBurst(_v);
          this.sound('chest', _v.x, _v.y, _v.z);
        }
      }
    }

    // ------------------------------------------------ камень: в праще, в полёте, перезарядка
    const stone = bn[B.Stone];
    const swing = this.fireStart >= 0 && t >= this.fireStart && !this.released && !this.landed;
    if (swing && t >= this.releaseAt) {
      // праща отпустила: баллистика от точки отпуска точно в цель к landAt
      this.released = true;
      this.pouch(this.relPos);
      const T = Math.max(0.3, this.landAt - t);
      this.relVel.copy(this.to).sub(this.relPos).divideScalar(T);
      this.relVel.y += (G * T) / 2;
      this.releaseAt = t;
      this.sound('whoosh', this.relPos.x, this.relPos.y, this.relPos.z);
    }
    const loadedAt = Math.max(this.reloadAt, this.stageAt[3] + 0.3);
    if (this.released && !this.landed) {
      const tau = Math.min(t, this.landAt) - this.releaseAt;
      stone.position.copy(this.relPos).addScaledVector(this.relVel, tau);
      stone.position.y -= (G * tau * tau) / 2;
      stone.quaternion.setFromEuler(_e.set(tau * 7, tau * 2, tau * 4));
      stone.scale.setScalar(1);
      if (t >= this.landAt) {
        this.landed = true;
        stone.scale.setScalar(0);
        this.onLand?.(this.to.x, this.to.y, this.to.z);
      }
    } else if (burnt < 0 && st >= 3 && (swing || t >= loadedAt)) {
      // в праще; после перезарядки — вырастает с толчком
      this.pouch(stone.position);
      const pop = swing ? 1 : clamp01((t - loadedAt) / 0.25);
      stone.scale.setScalar(pop < 1 ? backOut(pop) : 1);
      stone.quaternion.copy(root.quaternion);
      if (!swing && pop < 1 && this.reloadAt > this.stageAt[3] + 0.3 && this.once(`reload${Math.round(this.reloadAt * 10)}`)) {
        this.sound('thud', stone.position.x, stone.position.y, stone.position.z);
      }
    } else if (burnt >= 0 && this.stoneHad) {
      // при пожаре камень вываливается из пращи и остаётся лежать
      stone.position.copy(this.stoneDrop);
      stone.position.y = Math.max(STONE_R * 0.8, this.stoneDrop.y - 4.9 * burnt * burnt);
      stone.scale.setScalar(1);
    } else stone.scale.setScalar(0);
    if (this.goneAt >= 0) stone.scale.multiplyScalar(1 - gone);
  }

  /** Где камень в праще (мир) */
  private pouch(out: THREE.Vector3): THREE.Vector3 {
    const sb = this.bones[B.Sling];
    sb.updateWorldMatrix(true, false);
    return out.set(0, -SL + 0.2, 0).applyMatrix4(sb.matrixWorld);
  }

  private creak(st: number): void {
    if (st < 2) return;
    this.world([C[0], WINCH[1], C[2] + WINCH[2]], _v);
    this.sound('creak', _v.x, _v.y, _v.z);
  }

  private goldBurst(p: THREE.Vector3): void {
    for (let i = 0; i < 34; i++) {
      if (this.embers.length > 90) this.embers.shift();
      const a = Math.random() * Math.PI * 2;
      const up = i < 12;
      const sp = up ? 2.5 + Math.random() * 2 : 1 + Math.random() * 1.6;
      this.embers.push({
        x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * sp * 0.45, vy: up ? 6 + Math.random() * 4 : 3 + Math.random() * 2.5, vz: Math.sin(a) * sp * 0.45,
        life: 0, max: up ? 1.6 + Math.random() * 0.6 : 1.2 + Math.random() * 0.5, size: 0.1 + Math.random() * 0.08, color: GOLDF, gold: !up,
      });
    }
  }

  // ------------------------------------------------------------ огонь, дым, искры

  private updateFire(dt: number, t: number): void {
    const F = this.flames;
    let n = 0;
    const max = F.max - 4;
    const put = (x: number, y: number, z: number, size: number, c: THREE.Color, a: number, cell: number, ph: number, stretch: number) => {
      if (n < max && size > 0.01 && Math.abs(a) > 0.01) F.set(n++, x, y, z, size, c, a, cell, ph, stretch);
    };
    const live = this.mesh.visible && this.camp !== null;
    const burnt = this.burntAt >= 0 ? t - this.burntAt : -1;
    let total = 0;

    if (live && burnt >= 0) {
      for (let i = 0; i < this.spots.length; i++) {
        const s = this.spots[i];
        const k = Camp3D.fireCurve(burnt - s.delay) * (0.85 + 0.15 * Math.sin(t * 7 + s.ph));
        if (k <= 0.01) continue;
        total += k;
        this.spotPos(s, _v);
        if (k < 0.12) {
          if (i % 3 === 0) {
            this.spotPos(s, _v);
            put(_v.x, Math.max(0.12, _v.y * 0.4), _v.z, 0.45, EMBER, 0.5 + 0.3 * Math.sin(t * 3 + s.ph), 1, -1, 1);
          }
          continue;
        }
        const sz = s.size * (0.35 + 0.65 * k);
        const low = k < 0.3;
        put(_v.x, _v.y + sz * 0.35, _v.z, sz, low ? EMBER : FLAME, low ? 0.75 : 0.95, 0, s.ph, 1.7);
        if (!low) put(_v.x + Math.sin(s.ph) * 0.18, _v.y + sz * 0.2, _v.z + Math.cos(s.ph) * 0.18, sz * 0.7, FLAME_HOT, 0.9, 0, s.ph + 2.1, 1.5);
        if (i % 2 === 0) put(_v.x, _v.y + 0.2, _v.z, sz * 2.6, HALO, 0.2 * k, 1, s.ph + 1, 1);
      }
      // дым и искры — по сумме огня
      const avg = total / this.spots.length;
      this.smokeAcc += dt * (avg > 0.02 ? 2 + 14 * avg : 0.6);
      while (this.smokeAcc > 1) {
        this.smokeAcc -= 1;
        const s = this.spots[Math.floor(Math.random() * this.spots.length)];
        this.spotPos(s, _v);
        const dark = avg > 0.3;
        this.fx.puff(_v.x, _v.y + 0.7, _v.z, 1, 0.3, dark ? 1.0 : 0.7, dark ? 1.5 : 0.8, dark ? 3.4 : 2.6, dark ? SMOKE : SMOKE_L, dark ? 0.42 : 0.3);
      }
      this.emberAcc += dt * 26 * avg;
      while (this.emberAcc > 1) {
        this.emberAcc -= 1;
        const s = this.spots[Math.floor(Math.random() * this.spots.length)];
        this.spotPos(s, _v);
        this.addEmber(_v.x, _v.y + 0.5, _v.z);
      }
      // угли светятся: тёплое свечение материала мерцает вместе с огнём; лагерь чернеет
      const ch = smooth(0.4, 6, burnt);
      this.mat.color.setRGB(lerp(1, 0.33, ch), lerp(1, 0.29, ch), lerp(1, 0.26, ch));
      const e = Math.min(0.045, avg * 0.06) * (0.8 + 0.2 * Math.sin(t * 9) * Math.sin(t * 5.3));
      this.mat.emissive.setRGB(e, e * 0.32, e * 0.05);
      this.decalMat.color.copy(_c.set(0xd9bf98).lerp(CHAR, ch * 0.75));
    } else if (live && this.burnFrom >= 0) {
      // поджигают: огонёк у точки поджога растёт
      const fade = this.cancelAt >= 0 ? 1 - clamp01((t - this.cancelAt) / 0.5) : 1;
      if (fade <= 0) this.burnFrom = -1;
      else {
        const k = clamp01((t - this.burnFrom) / (this.burnUntil - this.burnFrom)) * fade;
        const s = this.spots[this.ignite];
        this.spotPos(s, _v);
        const m = 1 + Math.floor(k * 3.5);
        for (let i = 0; i < m; i++) {
          const a = s.ph + i * 2.2;
          const r = 0.06 + 0.12 * i * k;
          put(_v.x + Math.sin(a) * r, _v.y + 0.08 + 0.12 * k, _v.z + Math.cos(a) * r, (0.14 + 0.5 * k) * (1 - i * 0.12), FLAME, 0.95, 0, a, 1.6);
        }
        put(_v.x, _v.y + 0.2, _v.z, 0.6 + 1.6 * k, HALO, 0.12 + 0.2 * k, 1, s.ph, 1);
        this.smokeAcc += dt * (1.5 + 5 * k);
        while (this.smokeAcc > 1) {
          this.smokeAcc -= 1;
          this.fx.puff(_v.x, _v.y + 0.4 + 0.3 * k, _v.z, 1, 0.1, 0.4 + 0.4 * k, 0.9, 2.2, SMOKE_L, 0.3 + 0.15 * k);
        }
        this.emberAcc += dt * 6 * k;
        while (this.emberAcc > 1) {
          this.emberAcc -= 1;
          this.addEmber(_v.x, _v.y + 0.3, _v.z);
        }
        const e = 0.02 * k * (0.8 + 0.2 * Math.sin(t * 11));
        this.mat.emissive.setRGB(e, e * 0.32, e * 0.05);
      }
    }
    if (live && this.burntAt < 0 && this.burnFrom < 0) this.mat.emissive.setRGB(0, 0, 0);

    // костёр под котлом и пар (пока лагерь цел)
    if (live && burnt < 0) {
      this.world([FIRE[0], 0.12, FIRE[2]], _v);
      const rise = this.bones[B.Pot].scale.y;
      if (rise > 0.5) {
        put(_v.x, _v.y + 0.08, _v.z, 0.26, FLAME, 0.9, 0, 3.3, 1.4);
        put(_v.x + 0.07, _v.y + 0.04, _v.z - 0.05, 0.18, FLAME_HOT, 0.85, 0, 5.1, 1.3);
        put(_v.x, _v.y + 0.12, _v.z, 0.9, HALO, 0.2, 1, 1.2, 1);
        if (t > this.steamAt) {
          this.steamAt = t + 0.55 + Math.random() * 0.4;
          this.fx.puff(_v.x, 0.85, _v.z, 1, 0.08, 0.32, 0.5, 2.0, STEAM, 0.3);
        }
      }
    }

    // камень: при замахе загорается красным (сейчас ударит), в полёте — огонь и дымный след
    const stone = this.bones[B.Stone];
    if (live && stone.scale.x > 0.5 && burnt < 0) {
      stone.updateMatrixWorld(true);
      _v.setFromMatrixPosition(stone.matrixWorld);
      const flying = this.fireStart >= 0 && this.released && !this.landed;
      const wind = this.windStart >= 0 && t >= this.windStart ? clamp01((t - this.windStart) / Math.max(0.2, this.fireAt - this.windStart)) : 0;
      if (flying) {
        put(_v.x, _v.y + 0.16, _v.z, 0.85, FLAME, 0.95, 0, 1.1, 1.5);
        put(_v.x, _v.y + 0.06, _v.z, 0.6, FLAME_HOT, 0.9, 0, 4.2, 1.3);
        put(_v.x, _v.y, _v.z, 2.2, RED, 0.4, 1, 2, 1);
        if (t > this.trailAt) {
          this.trailAt = t + 0.045;
          this.fx.puff(_v.x, _v.y, _v.z, 1, 0.05, 0.42, 0.15, 1.3, SMOKE_L, 0.42);
        }
      } else if (wind > 0) {
        const pulse = 0.5 + 0.5 * Math.sin(t * (6 + wind * 10));
        const a = (0.25 + 0.35 * pulse) * Math.min(1, wind * 3);
        put(_v.x, _v.y, _v.z, 1.0 + 0.8 * wind, RED, -a, 1, 0, 1);
        put(_v.x, _v.y + 0.1, _v.z, 0.12 + 0.35 * wind, FLAME, 0.9, 0, 2.7, 1.5);
        // красный знак «сейчас ударит» и спереди: над противовесом (камень со стены закрыт рамой)
        const cw = this.bones[B.Cw];
        _w.set(0, -0.55, 0).applyMatrix4(cw.matrixWorld);
        put(_w.x, _w.y, _w.z, 1.5 + 1.3 * wind, RED, -Math.min(0.85, a * 1.3), 1, 0, 1);
      }
    }

    // факел в руке: огонь на конце, изредка искры
    const torch = this.torchObj;
    if (torch?.parent && isShown(torch)) {
      torch.updateWorldMatrix(true, false);
      _v.set(0, 0.74, 0).applyMatrix4(torch.matrixWorld);
      put(_v.x, _v.y + 0.04, _v.z, 0.36, FLAME, 0.95, 0, 0.7, 1.6);
      put(_v.x + 0.03, _v.y, _v.z - 0.02, 0.24, FLAME_HOT, 0.9, 0, 3.9, 1.4);
      put(_v.x, _v.y + 0.05, _v.z, 1.1, HALO, 0.28, 1, 2.4, 1);
      if (Math.random() < dt * 5) this.addEmber(_v.x, _v.y + 0.12, _v.z);
      if (Math.random() < dt * 1.5) this.fx.puff(_v.x, _v.y + 0.35, _v.z, 1, 0.02, 0.18, 0.7, 1.2, SMOKE, 0.22);
    }

    // искры и золото
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.life += dt;
      if (e.life >= e.max) {
        this.embers.splice(i, 1);
        continue;
      }
      if (e.gold) {
        e.vy -= 9 * dt;
        if (e.y < 0.05 && e.vy < 0) {
          e.y = 0.05;
          e.vy = -e.vy * 0.35;
          e.vx *= 0.5;
          e.vz *= 0.5;
        }
      } else {
        e.vy += (e.color === GOLDF ? -1.5 : 0.6) * dt;
        e.vx += Math.sin(t * 3 + i) * 0.6 * dt;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.z += e.vz * dt;
      const k = 1 - e.life / e.max;
      put(e.x, e.y, e.z, e.size, e.color, Math.min(1, k * 1.5), 1, e.color === GOLDF ? i * 1.3 : -1, 1);
    }
    // вспышка золота над сундуком
    if (live && burnt >= 0 && !this.quiet) {
      const o = burnt - 1.0;
      if (o > 0 && o < 1.2) {
        this.world([CHEST[0], 0.8, CHEST[2]], _v);
        const k = o < 0.12 ? o / 0.12 : 1 - (o - 0.12) / 1.08;
        put(_v.x, _v.y, _v.z, 2.2 + o * 2.5, GOLDF, 0.85 * k, 1, -1, 1);
        put(_v.x, _v.y + 0.2, _v.z, 0.9, _c.set(1, 0.95, 0.7), k, 1, -1, 1);
      }
    }
    F.commit(n);
    F.uTime.value = t;
    F.mesh.visible = n > 0;
  }

  private addEmber(x: number, y: number, z: number): void {
    if (this.embers.length > 90) this.embers.shift();
    this.embers.push({
      x: x + (Math.random() - 0.5) * 0.3, y, z: z + (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5) * 0.6, vy: 1 + Math.random() * 1.4, vz: (Math.random() - 0.5) * 0.6,
      life: 0, max: 0.8 + Math.random() * 1.0, size: 0.05 + Math.random() * 0.05, color: EMBER, gold: false,
    });
  }

  dispose(): void {
    this.torchObj?.removeFromParent();
    this.scene.remove(this.mesh, this.decal, this.flames.mesh, this.fx.dust.mesh, this.fx.chunks);
    this.mesh.geometry.dispose();
    this.mesh.skeleton.dispose();
    this.mat.dispose();
    this.decal.geometry.dispose();
    this.decalMat.dispose();
    this.flames.mesh.geometry.dispose();
    (this.flames.mesh.material as THREE.Material).dispose();
    this.fx.dust.mesh.geometry.dispose();
    (this.fx.dust.mesh.material as THREE.ShaderMaterial).uniforms.map.value?.dispose();
    (this.fx.dust.mesh.material as THREE.Material).dispose();
    // огонь CastleFx не в сцене (у лагеря свой), но его тоже освобождаем
    this.fx.fire.mesh.geometry.dispose();
    (this.fx.fire.mesh.material as THREE.ShaderMaterial).uniforms.map.value?.dispose();
    (this.fx.fire.mesh.material as THREE.Material).dispose();
    this.fx.chunks.geometry.dispose();
    (this.fx.chunks.material as THREE.Material).dispose();
    this.fx.chunks.dispose();
    this.torchGeo.dispose();
    this.torchMat.dispose();
    for (const t of this.textures) t.dispose();
  }
}

/** Виден ли объект (он и все родители) */
function isShown(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

void _m;
