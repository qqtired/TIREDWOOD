// Музыкальный автомат на площади набережной (место, размеры и песни — shared/jukebox.ts). Тёплый ретро-автомат:
// ореховый корпус с аркой, медовая рама, две светящиеся трубки по арке, хромированная решётка динамика, окошко с
// пластинкой и эквалайзером, клавиши выбора, монетоприёмник, карточка песен и табличка с ценой.
// Играет: огни трубок шагают по долям (beat), по арке на каждую долю бежит волна света и вспыхивает; семь полос
// эквалайзера идут за bands; пластинка крутится; из решётки вылетают ноты и тают. Молчит: огни мягко дышат, по нижним
// лампам эквалайзера идёт тихая волна, пластинка стоит.
// Неподвижное склеено в четыре меша по материалу (они и отбрасывают тень, как остальная статика площади); цвета трубок
// считает шейдер, лампы эквалайзера и ноты — по одному InstancedMesh. В update() ничего не создаётся.
// Габарит — коробка JUKE_W × JUKE_D × JUKE_H (она же коллайдер); наружу выходят только ноты, ореолы огней и тёплое
// пятно на плитке (у них userData.fx).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { JUKEBOX, JUKE_D, JUKE_SONGS } from '../../shared/jukebox.ts';
import { glowTexture } from '../render/kit.ts';
import { metalEnvTexture } from '../render/textures.ts';

const HAS_DOM = typeof document !== 'undefined';
const TAU = Math.PI * 2;
const FONT = 'Rubik, system-ui, sans-serif';

// ------------------------------------------------------------ размеры (локально: лицо — на +Z, 0 — середина у пола)

/** Цоколь */
const FOOT_H = 0.075;
/** Корпус: полуширина контура (с фаской — 0,665), центр арки (верх с фаской — 2,04), задняя и передняя грани */
const BODY_HW = 0.65;
const BODY_BEVEL = 0.015;
const ARCH_Y = 1.375;
const BODY_Z0 = -0.375;
const BODY_Z1 = 0.215;
/** Рама-арка на лице: снаружи 0,64, проём 0,47 (с фасками); лицо рамы — FRAME_Z */
const FRAME_HO = 0.64;
const FRAME_HI = 0.47;
const FRAME_BEVEL = 0.012;
const FRAME_Z = 0.352;
/** Подоконник окошка: выше — пластинка и эквалайзер, ниже — карточка песен, клавиши и решётка */
const WIN_Y0 = 1.165;
/** Передняя грань нижней панели (под окошком) */
const PANEL_Z = 0.29;
/** Трубки: радиусы дуг, толщина, низ, сколько цветных отрезков на трубку */
const TUBES = [0.515, 0.595] as const;
const TUBE_T = 0.027;
const TUBE_Y0 = 0.17;
const TUBE_BANDS = 9;
/** Пластинка: 45 оборотов в минуту */
const REC_Y = 1.56;
const REC_R = 0.19;
const REC_Z = 0.232;
const REC_SPIN = (45 / 60) * TAU;
/** Эквалайзер: 7 столбиков по 6 ламп внизу окошка */
const EQ_N = 7;
const EQ_SEG = 6;
const EQ_DX = 0.105;
const EQ_Y0 = 1.205;
const EQ_DY = 0.022;
const EQ_Z = 0.246;
/** Решётка динамика */
const GR_HW = 0.4;
const GR_Y0 = 0.13;
const GR_Y1 = 0.82;
const GR_MID = 0.475;
/** Полка с клавишами: верх полки и высота её лица (на нём табличка с ценой) */
const LEDGE_Y = 0.94;
const LEDGE_H = 0.085;
/** Ноты */
const NOTES = 18;
const NOTE_LIFE = 2.6;
const NOTE_SIZE = 0.17;

// ------------------------------------------------------------ цвета

const WALNUT = 0x7a482a;
const WALNUT_DK = 0x42271a;
const BACK = 0x6a3e24;
const BURL = 0xc08a55;
const HONEY = 0xe2a04e;
const CHERRY = 0xb8352a;
const IVORY = 0xf4ead2;
const CLOTH = 0x5c2219;
const GOLD = 0xf2c463;
const CHROME = 0xffffff;
/** Огни трубок по кругу: янтарь, вишня, лимон, мята, небо, роза — как лампочки гирлянд на площади */
const PAL = [0xff9a3c, 0xff5440, 0xffd45a, 0x7ad46a, 0x63a8ff, 0xff86b8];
/** Лампы эквалайзера снизу вверх */
const EQ_COL = [0x86d86a, 0xb9de58, 0xf6d64c, 0xf8ac3e, 0xf47c38, 0xe8483a];
const NOTE_COL = [0xff6b5a, 0xffb347, 0x7ad46a, 0x6aa9ff, 0xff8fc1, 0xfff1c9];
const KEY_CAPS = [0xe8453a, 0xf5a33a, 0x5fae42, 0x3f8fd0];

const PAL_LIN = PAL.map((c) => new THREE.Color(c));
/** Молчит — огни наполовину уходят в тёплый янтарь: заиграла песня — трубки «просыпаются» во все цвета */
const AMBER = new THREE.Color(0xffa040);
const EQ_LIN = EQ_COL.map((c) => new THREE.Color(c));
const NOTE_LIN = NOTE_COL.map((c) => new THREE.Color(c));

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}


// ------------------------------------------------------------ геометрия

/** Покрасить цветом вершин с «запечённой» тенью у пола: у самого низа темнее (k0), выше 0,9 м — как есть. */
function tint(g: THREE.BufferGeometry, hex: number, k0 = 0.62): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const pos = src.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color(hex);
  for (let i = 0; i < pos.count; i++) {
    const k = k0 + (1 - k0) * smooth(0, 0.9, pos.getY(i));
    col[i * 3] = c.r * k;
    col[i * 3 + 1] = c.g * k;
    col[i * 3 + 2] = c.b * k;
  }
  src.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (src.getAttribute('uv')) src.deleteAttribute('uv');
  return src;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/** Цилиндр с осью вдоль Z (кнопки, шайбы, болты на лице) */
function disc(r: number, d: number, x: number, y: number, z: number, seg = 20): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r, r, d, seg).rotateX(Math.PI / 2).translate(x, y, z);
}

/** Прямоугольник с полукругом сверху (радиус — полуширина) */
function archShape(hw: number, y0: number, yc: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-hw, y0);
  s.lineTo(hw, y0);
  s.lineTo(hw, yc);
  s.absarc(0, yc, hw, 0, Math.PI, false);
  s.lineTo(-hw, y0);
  return s;
}

/** Рама-«подкова»: две стойки и арка между полуширинами hi и ho */
function horseshoe(ho: number, hi: number, y0: number, yc: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-ho, y0);
  s.lineTo(-hi, y0);
  s.lineTo(-hi, yc);
  s.absarc(0, yc, hi, Math.PI, 0, true);
  s.lineTo(hi, y0);
  s.lineTo(ho, y0);
  s.lineTo(ho, yc);
  s.absarc(0, yc, ho, 0, Math.PI, false);
  s.lineTo(-ho, y0);
  return s;
}

/** Выдавить контур от z0 до z1 с фаской bevel (контур раздаётся на bevel — задавай его меньше на столько же). */
function extrude(shape: THREE.Shape, z0: number, z1: number, bevel: number, seg = 32): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: z1 - z0 - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: seg,
  });
  return g.translate(0, 0, z0 + bevel);
}

/** Плоская фигура окошка с развёрткой 0..1 по её рамке */
function windowGeometry(hw: number, y0: number, z: number): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(archShape(hw, y0, ARCH_Y), 40);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  const top = ARCH_Y + hw;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + hw) / (2 * hw), (pos.getY(i) - y0) / (top - y0));
  return g.translate(0, 0, z);
}

/** Путь трубки: вверх по левой стойке, дугой через верх арки, вниз по правой; параметр — доля длины. */
class TubePath extends THREE.Curve<THREE.Vector3> {
  private readonly r: number;
  private readonly z: number;
  private readonly leg: number;
  private readonly arc: number;

  constructor(r: number, z: number) {
    super();
    this.r = r;
    this.z = z;
    this.leg = ARCH_Y - TUBE_Y0;
    this.arc = Math.PI * r;
  }

  getPoint(t: number, out = new THREE.Vector3()): THREE.Vector3 {
    let s = t * (2 * this.leg + this.arc);
    if (s <= this.leg) return out.set(-this.r, TUBE_Y0 + s, this.z);
    s -= this.leg;
    if (s <= this.arc) {
      const a = Math.PI - s / this.r;
      return out.set(Math.cos(a) * this.r, ARCH_Y + Math.sin(a) * this.r, this.z);
    }
    s -= this.arc;
    return out.set(this.r, ARCH_Y - s, this.z);
  }
}

/** Скруглённый прямоугольник — замкнутый путь для хромированной рамки решётки */
function roundRectPath(hw: number, y0: number, y1: number, r: number, z: number): THREE.CatmullRomCurve3 {
  const s = new THREE.Shape();
  s.moveTo(-hw + r, y0);
  s.lineTo(hw - r, y0);
  s.absarc(hw - r, y0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hw, y1 - r);
  s.absarc(hw - r, y1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hw + r, y1);
  s.absarc(-hw + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, y0 + r);
  s.absarc(-hw + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  const pts = s.getSpacedPoints(96).slice(0, -1).map((p) => new THREE.Vector3(p.x, p.y, z));
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal');
}

// ------------------------------------------------------------ холсты

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Шрифт размера size, уменьшенный, чтобы текст влез в maxW */
function fit(ctx: CanvasRenderingContext2D, text: string, size: number, maxW: number, weight = 700): void {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) ctx.font = `${weight} ${Math.floor((size * maxW) / w)}px ${FONT}`;
}

/** Атлас надписей: карточка песен, табличка с ценой, медальон на решётке */
const ATLAS_W = 1024;
const ATLAS_H = 512;
const CARD = { x: 0, y: 0, w: 1024, h: 160 };
const PRICE = { x: 0, y: 176, w: 320, h: 104 };
const MEDAL = { x: 336, y: 176, w: 160, h: 160 };

/** Монета-жетон: золотой кружок с ободком и звездой */
function coin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = '#9a6a12';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f7c948';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.84, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#c8901c';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.26 : r * 0.58;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.fill();
}

/** Нота ♫ на медальоне и в атласе нот: головки, штили и ребро (без шрифтов — одинаково везде) */
function beamedNotes(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.ellipse(x - 0.3 * s, y + 0.3 * s, 0.17 * s, 0.12 * s, -0.4, 0, TAU);
  ctx.ellipse(x + 0.3 * s, y + 0.2 * s, 0.17 * s, 0.12 * s, -0.4, 0, TAU);
  ctx.fill();
  ctx.fillRect(x - 0.16 * s, y - 0.38 * s, 0.07 * s, 0.68 * s);
  ctx.fillRect(x + 0.44 * s, y - 0.48 * s, 0.07 * s, 0.68 * s);
  ctx.beginPath();
  ctx.moveTo(x - 0.16 * s, y - 0.38 * s);
  ctx.lineTo(x + 0.51 * s, y - 0.48 * s);
  ctx.lineTo(x + 0.51 * s, y - 0.33 * s);
  ctx.lineTo(x - 0.16 * s, y - 0.23 * s);
  ctx.fill();
}

function drawAtlas(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);
  // карточка песен: кремовая, красная кайма, 2 столбца × 4 строки
  const { x, y, w, h } = CARD;
  ctx.fillStyle = '#f6e8c8';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#b8352a';
  ctx.lineWidth = 6;
  ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
  ctx.fillStyle = '#b8352a';
  ctx.fillRect(x + w / 2 - 1, y + 14, 2, h - 28);
  ctx.textBaseline = 'middle';
  const rows = 4;
  const rowH = (h - 20) / rows;
  JUKE_SONGS.slice(0, 8).forEach((s, i) => {
    const col = Math.floor(i / rows);
    const row = i % rows;
    const cx = x + 18 + (col * w) / 2;
    const cy = y + 10 + rowH * (row + 0.5);
    ctx.fillStyle = '#b8352a';
    ctx.beginPath();
    ctx.arc(cx + 14, cy, 13, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff4dc';
    ctx.textAlign = 'center';
    ctx.font = `900 18px ${FONT}`;
    ctx.fillText(String(i + 1), cx + 14, cy + 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#4a2414';
    fit(ctx, `${s.emoji} ${s.title}`, 25, w / 2 - 60, 700);
    ctx.fillText(`${s.emoji} ${s.title}`, cx + 36, cy + 1);
  });
  // табличка: «10 [жетон] за песню»
  const p = PRICE;
  ctx.fillStyle = '#f6e8c8';
  roundRect(ctx, p.x + 2, p.y + 2, p.w - 4, p.h - 4, 14);
  ctx.fill();
  ctx.strokeStyle = '#b8352a';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#b8352a';
  ctx.textAlign = 'left';
  ctx.font = `900 64px ${FONT}`;
  ctx.fillText('10', p.x + 22, p.y + p.h / 2 + 3);
  coin(ctx, p.x + 140, p.y + p.h / 2, 30);
  ctx.fillStyle = '#4a2414';
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText('песня', p.x + 184, p.y + p.h / 2 + 2);
  // медальон: золотой обод, кремовое поле, красные ноты
  const m = MEDAL;
  const mx = m.x + m.w / 2;
  const my = m.y + m.h / 2;
  ctx.fillStyle = '#c8901c';
  ctx.beginPath();
  ctx.arc(mx, my, m.w / 2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f6e8c8';
  ctx.beginPath();
  ctx.arc(mx, my, m.w / 2 - 12, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#b8352a';
  beamedNotes(ctx, mx - 6, my + 4, 92);
}

/** Пластинка: чёрный винил с дорожками, красная наклейка с надписью (по ней видно, что крутится) */
function drawRecord(ctx: CanvasRenderingContext2D): void {
  const S = 512;
  const C = S / 2;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#16110f';
  ctx.beginPath();
  ctx.arc(C, C, C, 0, TAU);
  ctx.fill();
  for (let r = 96; r < 250; r += 3) {
    ctx.strokeStyle = `rgba(255,236,210,${(0.03 + 0.05 * (((r * 7) % 11) / 11)).toFixed(3)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(C, C, r, 0, TAU);
    ctx.stroke();
  }
  // гладкие промежутки между песнями
  for (const r of [140, 188, 226]) {
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(C, C, r, 0, TAU);
    ctx.stroke();
  }
  ctx.fillStyle = '#f2e4c4';
  ctx.beginPath();
  ctx.arc(C, C, 90, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#d4402c';
  ctx.beginPath();
  ctx.arc(C, C, 84, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f9d77a';
  ctx.beginPath();
  ctx.arc(C, C - 2, 70, Math.PI * 1.08, Math.PI * 1.92);
  ctx.lineTo(C, C - 2);
  ctx.fill();
  ctx.fillStyle = '#fff4dc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 22px ${FONT}`;
  ctx.fillText('TIREDWOOD', C, C + 30);
  ctx.font = `700 15px ${FONT}`;
  ctx.fillText('45 об/мин', C, C + 54);
  ctx.fillStyle = '#7a2014';
  ctx.font = `900 18px ${FONT}`;
  ctx.fillText('♪ НАБЕРЕЖНАЯ ♪', C, C - 34);
  ctx.fillStyle = '#16110f';
  ctx.beginPath();
  ctx.arc(C, C, 7, 0, TAU);
  ctx.fill();
}

/** Подсветка окошка изнутри: тёплое «солнце» за пластинкой и лучи */
function backTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  const cx = 128;
  const cy = 150;
  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 190);
  g.addColorStop(0, '#fff2d2');
  g.addColorStop(0.45, '#ffc977');
  g.addColorStop(1, '#c4642c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(255,248,226,0.16)';
  for (let i = 0; i < 18; i += 2) {
    const a0 = (i / 18) * TAU;
    const a1 = ((i + 1) / 18) * TAU;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 260, a0, a1);
    ctx.fill();
  }
  return toTex(c);
}

/** Стекло окошка: почти прозрачное, два косых блика */
function glassTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,250,240,0.16)');
  g.addColorStop(1, 'rgba(255,250,240,0.02)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(10, 120);
  ctx.lineTo(48, 0);
  ctx.lineTo(70, 0);
  ctx.lineTo(32, 120);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(40, 140);
  ctx.lineTo(84, 0);
  ctx.lineTo(92, 0);
  ctx.lineTo(48, 140);
  ctx.fill();
  return toTex(c);
}

/** Атлас нот: ♪ слева, ♫ справа — белые с тёмной обводкой (красит цвет инстанса), читаются и на светлой плитке */
function noteTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 128);
  const eighth = (stroke: boolean) => {
    ctx.beginPath();
    ctx.ellipse(52, 92, 22, 16, -0.4, 0, TAU);
    ctx.fill();
    if (stroke) ctx.stroke();
    ctx.beginPath();
    ctx.rect(66, 24, 9, 68);
    ctx.fill();
    if (stroke) ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(70, 22);
    ctx.bezierCurveTo(78, 40, 104, 44, 98, 74);
    ctx.bezierCurveTo(96, 58, 86, 52, 72, 50);
    ctx.closePath();
    ctx.fill();
    if (stroke) ctx.stroke();
  };
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#3a1a10';
  ctx.fillStyle = '#3a1a10';
  ctx.lineWidth = 12;
  eighth(true);
  ctx.save();
  ctx.translate(128, 0);
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#3a1a10';
  beamedOutline(ctx);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  eighth(false);
  ctx.save();
  ctx.translate(128, 0);
  beamedNotes(ctx, 64, 66, 96);
  ctx.restore();
  return toTex(c);
}

function beamedOutline(ctx: CanvasRenderingContext2D): void {
  // та же ♫, только толще: обводка под белой заливкой
  ctx.save();
  ctx.fillStyle = '#3a1a10';
  ctx.translate(64, 66);
  ctx.scale(1.13, 1.13);
  ctx.translate(-64, -66);
  beamedNotes(ctx, 64, 66, 96);
  ctx.restore();
}

// ------------------------------------------------------------ шейдеры

const TUBE_VERT_PARS = /* glsl */ `attribute float aT;
attribute float aRow;
varying float vT;
varying float vRow;
varying float vCore;
`;

const TUBE_VERT = /* glsl */ `#include <begin_vertex>
vT = aT;
vRow = aRow;
vCore = abs( normalize( normalMatrix * normal ).z );`;

/** Огни трубок — общее для самих трубок и ореола: цвет отрезка по доле длины t и ряду, волна на долю */
const TUBE_LIGHT = /* glsl */ `uniform vec3 uPal[ 6 ];
uniform vec3 uAmber;
uniform float uWarm;
uniform float uFlow;
uniform float uLevel;
uniform float uWave;
uniform float uPulse;
// цвет отрезка, на стыке — короткий переход к следующему; молчит — наполовину тёплый янтарь
vec3 jukeColor( float t, float row, out float f ) {
	float u = t * ${TUBE_BANDS.toFixed(1)} + row * 0.5 - uFlow;
	float i = floor( u );
	f = u - i;
	vec3 a = uPal[ int( floor( mod( i + 0.5, 6.0 ) ) ) ];
	vec3 b = uPal[ int( floor( mod( i + 1.5, 6.0 ) ) ) ];
	return mix( mix( a, b, smoothstep( 0.8, 1.0, f ) ), uAmber, uWarm );
}
// волна на долю: от низа стоек к верху арки
float jukeWave( float t ) {
	float h = 1.0 - abs( t * 2.0 - 1.0 );
	return uPulse * ( 1.0 - smoothstep( 0.0, 0.16, abs( h - uWave ) ) );
}
`;

const TUBE_FRAG_PARS = /* glsl */ `${TUBE_LIGHT}
varying float vT;
varying float vRow;
varying float vCore;
vec3 jukeTube() {
	float f;
	vec3 col = jukeColor( vT, vRow, f );
	// стыки отрезков чуть темнее — читается как ряд ламп в трубке
	float lamp = 0.74 + 0.26 * smoothstep( 0.0, 0.12, f ) * ( 1.0 - smoothstep( 0.86, 1.0, f ) );
	float wave = jukeWave( vT );
	vec3 c = col * ( uLevel * lamp + wave * 0.35 );
	// стекло: середина трубки светлее и теплее, края — гуще цветом
	return mix( c * 0.66, c + vec3( 0.1, 0.075, 0.04 ) * ( uLevel + wave ), vCore );
}
`;

/** Ореол трубок: плоскость перед аркой, свет каждой точки — от ближайшего места трубок (сбоку плоскости не видно) */
const HALO_VERT = /* glsl */ `varying vec2 vP;
void main() {
	vP = position.xy;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

const HALO_FRAG = /* glsl */ `${TUBE_LIGHT}
uniform float uGlow;
varying vec2 vP;
vec3 jukeHalo( float r, float row ) {
	const float y0 = ${TUBE_Y0.toFixed(4)};
	const float yc = ${ARCH_Y.toFixed(4)};
	const float JPI = 3.14159265;
	float leg = yc - y0;
	float len = 2.0 * leg + JPI * r;
	float s;
	float d;
	if ( vP.y >= yc ) {
		vec2 q = vec2( vP.x, vP.y - yc );
		d = abs( length( q ) - r );
		s = leg + ( JPI - atan( q.y, q.x ) ) * r;
	} else {
		d = abs( abs( vP.x ) - r ) + max( y0 - vP.y, 0.0 ) * 2.0;
		s = vP.x < 0.0 ? vP.y - y0 : len - ( vP.y - y0 );
	}
	float t = clamp( s / len, 0.0, 1.0 );
	float f;
	vec3 col = jukeColor( t, row, f );
	// на самой трубке ореола нет (там видно её цвет), мягкий хвост — наружу от стекла
	float e = max( d - ${(TUBE_T * 0.7).toFixed(4)}, 0.0 );
	float g = smoothstep( ${(TUBE_T * 0.6).toFixed(4)}, ${(TUBE_T * 1.3).toFixed(4)}, d ) * exp( - e * e * 110.0 );
	// свет ламп, а не неон: ореол теплее самих огней
	return mix( col, uAmber, 0.55 ) * g * ( uLevel * 0.6 + jukeWave( t ) );
}
void main() {
	vec3 c = ( jukeHalo( ${TUBES[0].toFixed(4)}, 0.0 ) + jukeHalo( ${TUBES[1].toFixed(4)}, 1.0 ) ) * uGlow;
	gl_FragColor = vec4( c, 1.0 );
	#include <colorspace_fragment>
}`;

const NOTE_VERT = /* glsl */ `attribute float aGlyph;
attribute float aFade;
varying vec2 vUv;
varying float vFade;
varying vec3 vTint;
void main() {
	// спрайт: середина — по матрице инстанса, сама нота всегда лицом к камере (поворот и размер — из матрицы)
	vec4 mv = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
	mv.xy += mat2( instanceMatrix[ 0 ].xy, instanceMatrix[ 1 ].xy ) * position.xy;
	gl_Position = projectionMatrix * mv;
	vUv = vec2( ( uv.x + aGlyph ) * 0.5, uv.y );
	vFade = aFade;
	#ifdef USE_INSTANCING_COLOR
		vTint = instanceColor;
	#else
		vTint = vec3( 1.0 );
	#endif
}`;

const NOTE_FRAG = /* glsl */ `uniform sampler2D map;
varying vec2 vUv;
varying float vFade;
varying vec3 vTint;
void main() {
	vec4 t = texture2D( map, vUv );
	float a = t.a * vFade;
	if ( a < 0.02 ) discard;
	gl_FragColor = vec4( t.rgb * vTint, a );
	#include <colorspace_fragment>
}`;

// ------------------------------------------------------------ автомат

export class Jukebox3D {
  /** Весь автомат: стоит в JUKEBOX, лицом на юг */
  readonly group = new THREE.Group();
  private readonly record: THREE.Mesh;
  private readonly eq: THREE.InstancedMesh;
  private readonly notes: THREE.InstancedMesh;
  private readonly noteFade: THREE.InstancedBufferAttribute;
  private readonly noteGlyph: THREE.InstancedBufferAttribute;
  private readonly backMat: THREE.MeshBasicMaterial;
  private readonly floorMat: THREE.MeshBasicMaterial;
  private readonly tubeU = {
    uPal: { value: PAL_LIN },
    uAmber: { value: AMBER },
    uWarm: { value: 0.5 },
    uFlow: { value: 0 },
    uLevel: { value: 0.6 },
    uWave: { value: 0 },
    uPulse: { value: 0 },
    uGlow: { value: 0.1 },
  };
  // состояние анимации
  private time = 0;
  private play = 0;
  private beats = 0;
  private lastBeat = 0;
  private lastPos = 0;
  private flow = 0;
  private spin = 0;
  private angle = 0;
  private noteTimer = 0;
  private nextNote = 0;
  private shadowDirty = true;
  private readonly eqLvl = new Float32Array(EQ_N);
  private readonly nAge = new Float32Array(NOTES);
  private readonly nLife = new Float32Array(NOTES);
  private readonly nPos = new Float32Array(NOTES * 3);
  private readonly nVel = new Float32Array(NOTES * 3);
  private readonly nPh = new Float32Array(NOTES);

  constructor(scene: THREE.Scene) {
    const env = HAS_DOM ? metalEnvTexture() : null;
    const wood: THREE.BufferGeometry[] = [];
    const lacquer: THREE.BufferGeometry[] = [];
    const chrome: THREE.BufferGeometry[] = [];
    const dark: THREE.BufferGeometry[] = [];

    // --- корпус: цоколь, ореховый короб с аркой, медовая рама-подкова, нижняя панель
    wood.push(tint(box(1.33, FOOT_H, 0.76, 0, FOOT_H / 2, 0), WALNUT_DK, 0.7));
    wood.push(tint(extrude(archShape(BODY_HW, FOOT_H - 0.01 + BODY_BEVEL, ARCH_Y), BODY_Z0, BODY_Z1, BODY_BEVEL), WALNUT));
    lacquer.push(tint(extrude(horseshoe(FRAME_HO - FRAME_BEVEL, FRAME_HI + FRAME_BEVEL, FOOT_H + FRAME_BEVEL, ARCH_Y), BODY_Z1, FRAME_Z, FRAME_BEVEL, 40), HONEY, 0.7));
    wood.push(tint(box(FRAME_HI * 2 - 0.002, WIN_Y0 - FOOT_H, PANEL_Z - BODY_Z1, 0, (WIN_Y0 + FOOT_H) / 2, (PANEL_Z + BODY_Z1) / 2), WALNUT));
    // бока: светлые вставки «под корень ореха» с хромовыми планками; сзади — сервисная дверца и решётка вентиляции
    for (const s of [-1, 1]) {
      wood.push(tint(box(0.006, 0.92, 0.42, s * 0.668, 0.66, -0.06), BURL));
      for (const y of [0.18, 1.14]) chrome.push(tint(box(0.006, 0.018, 0.46, s * 0.671, y, -0.06), CHROME, 1));
    }
    wood.push(tint(box(0.8, 1.05, 0.006, 0, 0.72, BODY_Z0 - 0.003), BACK));
    for (let k = 0; k < 6; k++) dark.push(tint(box(0.5, 0.022, 0.006, 0, 0.98 + k * 0.045, BODY_Z0 - 0.008), 0x1c120c, 1));
    for (const sx of [-0.36, 0.36]) for (const y of [0.25, 1.2]) chrome.push(tint(disc(0.012, 0.006, sx, y, BODY_Z0 - 0.008, 10), CHROME, 1));
    // стальной поясок по цоколю спереди
    chrome.push(tint(box(1.2, 0.02, 0.008, 0, 0.04, 0.384), CHROME, 1));

    // --- окошко: тёплая подсветка изнутри, хромированный подоконник, ободок, тонарм и ось пластинки
    chrome.push(tint(box(FRAME_HI * 2, 0.022, 0.05, 0, WIN_Y0, FRAME_Z - 0.023), CHROME, 1));
    const bezel = new THREE.TubeGeometry(new TubePath(FRAME_HI + 0.004, FRAME_Z - 0.004), 90, 0.011, 6, false);
    chrome.push(tint(bezel, GOLD, 1));
    chrome.push(tint(disc(0.014, 0.03, 0, REC_Y, REC_Z + 0.012, 12), CHROME, 1));
    const armX0 = 0.31;
    const armY0 = 1.45;
    const armX1 = 0.1;
    const armY1 = 1.535;
    const armLen = Math.hypot(armX1 - armX0, armY1 - armY0);
    chrome.push(tint(disc(0.032, 0.02, armX0, armY0, REC_Z + 0.016, 16), GOLD, 1));
    chrome.push(tint(new THREE.CylinderGeometry(0.007, 0.007, armLen, 8).rotateZ(Math.atan2(armY1 - armY0, armX1 - armX0) - Math.PI / 2).translate((armX0 + armX1) / 2, (armY0 + armY1) / 2, REC_Z + 0.026), CHROME, 1));
    chrome.push(tint(box(0.04, 0.022, 0.016, armX1, armY1, REC_Z + 0.024).rotateZ(0), CHROME, 1));

    // --- трубки: две «подковы» по раме, внизу — золотые чашечки
    const tubeGeos: THREE.BufferGeometry[] = [];
    TUBES.forEach((r, row) => {
      const g = new THREE.TubeGeometry(new TubePath(r, FRAME_Z), 120, TUBE_T, 10, false);
      const uv = g.getAttribute('uv');
      const t = new Float32Array(uv.count);
      const rows = new Float32Array(uv.count).fill(row);
      for (let i = 0; i < uv.count; i++) t[i] = uv.getX(i);
      g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
      g.setAttribute('aRow', new THREE.BufferAttribute(rows, 1));
      g.deleteAttribute('uv');
      tubeGeos.push(g);
      for (const s of [-1, 1]) {
        chrome.push(tint(new THREE.CylinderGeometry(0.036, 0.04, 0.08, 16).translate(s * r, FOOT_H + 0.04, FRAME_Z - 0.004), GOLD, 1));
      }
    });

    // --- карточка песен в хромовой рамке, полка с клавишами, монетоприёмник
    for (const y of [1.008, 1.152]) chrome.push(tint(box(0.9, 0.01, 0.012, 0, y, PANEL_Z + 0.004), CHROME, 1));
    lacquer.push(tint(box(0.9, LEDGE_H, 0.157, 0, LEDGE_Y - LEDGE_H / 2, (BODY_Z1 + 0.372) / 2), CHERRY, 0.8));
    chrome.push(tint(new THREE.CylinderGeometry(0.006, 0.006, 0.9, 8).rotateZ(Math.PI / 2).translate(0, LEDGE_Y, 0.372), CHROME, 1));
    for (let k = 0; k < 8; k++) {
      const x = -0.43 + 0.031 + k * 0.072;
      lacquer.push(tint(box(0.062, 0.024, 0.09, x, LEDGE_Y + 0.012, 0.305), IVORY, 1));
      lacquer.push(tint(box(0.062, 0.03, 0.016, x, LEDGE_Y + 0.009, 0.358), KEY_CAPS[k % KEY_CAPS.length], 1));
    }
    chrome.push(tint(box(0.19, 0.012, 0.11, 0.33, LEDGE_Y + 0.006, 0.3), CHROME, 1));
    dark.push(tint(box(0.07, 0.004, 0.014, 0.33, LEDGE_Y + 0.0125, 0.3), 0x0c0806, 1));
    chrome.push(tint(disc(0.018, 0.006, 0.4, LEDGE_Y + 0.0125, 0.335, 14).rotateX(0), CHROME, 1));

    // --- решётка динамика: ткань, хромированная рамка, прутья, золотой медальон
    dark.push(tint(box(GR_HW * 2, GR_Y1 - GR_Y0, 0.004, 0, (GR_Y0 + GR_Y1) / 2, PANEL_Z + 0.002), CLOTH, 0.8));
    chrome.push(tint(new THREE.TubeGeometry(roundRectPath(GR_HW, GR_Y0, GR_Y1, 0.09, PANEL_Z + 0.01), 120, 0.013, 8, true), CHROME, 1));
    for (let k = -4; k <= 4; k++) {
      if (k === 0) continue;
      chrome.push(tint(new THREE.CylinderGeometry(0.008, 0.008, GR_Y1 - GR_Y0 - 0.03, 8).translate(k * 0.08, (GR_Y0 + GR_Y1) / 2, PANEL_Z + 0.012), CHROME, 1));
    }
    chrome.push(tint(new THREE.CylinderGeometry(0.008, 0.008, GR_HW * 2 - 0.03, 8).rotateZ(Math.PI / 2).translate(0, GR_MID, PANEL_Z + 0.016), CHROME, 1));
    chrome.push(tint(disc(0.095, 0.02, 0, GR_MID, PANEL_Z + 0.018, 32), GOLD, 1));

    // --- материалы и меши статики (они и отбрасывают тень)
    const woodMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });
    const lacquerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.08, envMap: env, envMapIntensity: 0.5 });
    const chromeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 1, envMap: env, envMapIntensity: 1.1 });
    const darkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    for (const [list, mat] of [[wood, woodMat], [lacquer, lacquerMat], [chrome, chromeMat], [dark, darkMat]] as const) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false)!, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.addStatic(mesh);
    }

    // трубки: цвет считает шейдер; этот меш рисуется всегда, когда автомат виден, — через него и просим обновить тени
    const tubeMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    tubeMat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, this.tubeU);
      s.vertexShader = TUBE_VERT_PARS + s.vertexShader.replace('#include <begin_vertex>', TUBE_VERT);
      s.fragmentShader = TUBE_FRAG_PARS + s.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( jukeTube(), opacity );');
    };
    tubeMat.customProgramCacheKey = () => 'juke-tube';
    const tubes = new THREE.Mesh(mergeGeometries(tubeGeos, false)!, tubeMat);
    tubes.frustumCulled = false;
    tubes.onBeforeRender = (renderer) => {
      if (!this.shadowDirty) return;
      this.shadowDirty = false;
      renderer.shadowMap.needsUpdate = true;
    };
    this.addStatic(tubes);

    // ореол огней: плоскость перед аркой чуть шире автомата
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 2.3).translate(0, 1.12, FRAME_Z + 0.04),
      new THREE.ShaderMaterial({
        uniforms: this.tubeU, vertexShader: HALO_VERT, fragmentShader: HALO_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    halo.renderOrder = 3;
    halo.userData.fx = true;
    this.addStatic(halo);

    // подсветка окошка и стекло
    this.backMat = new THREE.MeshBasicMaterial({ map: HAS_DOM ? backTexture() : null, toneMapped: false });
    this.addStatic(new THREE.Mesh(windowGeometry(FRAME_HI, WIN_Y0, BODY_Z1 + 0.003), this.backMat));
    const glass = new THREE.Mesh(
      windowGeometry(FRAME_HI, WIN_Y0, FRAME_Z - 0.022),
      new THREE.MeshBasicMaterial({ map: HAS_DOM ? glassTexture() : null, transparent: true, depthWrite: false }),
    );
    glass.renderOrder = 2;
    this.addStatic(glass);

    // пластинка (крутится) и надписи (карточка песен, цена, медальон) — холсты
    let atlas: THREE.CanvasTexture | null = null;
    let recTex: THREE.CanvasTexture | null = null;
    if (HAS_DOM) {
      const [ac, actx] = makeCanvas(ATLAS_W, ATLAS_H);
      const [rc, rctx] = makeCanvas(512, 512);
      drawAtlas(actx);
      drawRecord(rctx);
      atlas = toTex(ac);
      recTex = toTex(rc);
      // Rubik мог ещё не загрузиться: перерисовать, когда загрузится (один раз)
      const a = atlas;
      const r = recTex;
      document.fonts?.load(`700 25px ${FONT}`).then(() => document.fonts.load(`900 22px ${FONT}`)).then(() => {
        drawAtlas(actx);
        drawRecord(rctx);
        a.needsUpdate = true;
        r.needsUpdate = true;
      }).catch(() => {});
    }
    this.record = new THREE.Mesh(
      new THREE.CircleGeometry(REC_R, 56),
      new THREE.MeshStandardMaterial({ map: recTex, roughness: 0.3, metalness: 0.1, envMap: env, envMapIntensity: 0.7 }),
    );
    this.record.position.set(0, REC_Y, REC_Z);
    this.group.add(this.record);

    const signs: THREE.BufferGeometry[] = [];
    const sub = (g: THREE.BufferGeometry, r: { x: number; y: number; w: number; h: number }) => {
      const uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, (r.x + uv.getX(i) * r.w) / ATLAS_W, 1 - (r.y + (1 - uv.getY(i)) * r.h) / ATLAS_H);
      }
      return g;
    };
    signs.push(sub(new THREE.PlaneGeometry(0.88, 0.1375).translate(0, 1.08, PANEL_Z + 0.003), CARD));
    signs.push(sub(new THREE.PlaneGeometry(0.22, 0.0715).translate(0.29, LEDGE_Y - LEDGE_H / 2, 0.3735), PRICE));
    signs.push(sub(new THREE.CircleGeometry(0.078, 32).translate(0, GR_MID, PANEL_Z + 0.0285), MEDAL));
    this.addStatic(new THREE.Mesh(
      mergeGeometries(signs, false)!,
      new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.6 }),
    ));

    // эквалайзер: 7 × 6 ламп
    this.eq = new THREE.InstancedMesh(new THREE.BoxGeometry(0.082, 0.016, 0.012), new THREE.MeshBasicMaterial({ toneMapped: false }), EQ_N * EQ_SEG);
    for (let c = 0; c < EQ_N; c++) {
      for (let s = 0; s < EQ_SEG; s++) {
        _m.makeTranslation((c - (EQ_N - 1) / 2) * EQ_DX, EQ_Y0 + s * EQ_DY, EQ_Z);
        this.eq.setMatrixAt(c * EQ_SEG + s, _m);
        this.eq.setColorAt(c * EQ_SEG + s, _c.copy(EQ_LIN[s]).multiplyScalar(0.13));
      }
    }
    this.eq.matrixAutoUpdate = false;
    this.group.add(this.eq);

    // ноты: одним InstancedMesh, спрайты лицом к камере
    const noteGeo = new THREE.PlaneGeometry(1, 1);
    this.noteFade = new THREE.InstancedBufferAttribute(new Float32Array(NOTES), 1).setUsage(THREE.DynamicDrawUsage);
    this.noteGlyph = new THREE.InstancedBufferAttribute(new Float32Array(NOTES), 1);
    noteGeo.setAttribute('aFade', this.noteFade);
    noteGeo.setAttribute('aGlyph', this.noteGlyph);
    this.notes = new THREE.InstancedMesh(noteGeo, new THREE.ShaderMaterial({
      uniforms: { map: { value: HAS_DOM ? noteTexture() : null } },
      vertexShader: NOTE_VERT,
      fragmentShader: NOTE_FRAG,
      transparent: true,
      depthWrite: false,
    }), NOTES);
    this.notes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < NOTES; i++) {
      this.notes.setMatrixAt(i, ZERO);
      this.notes.setColorAt(i, NOTE_LIN[i % NOTE_LIN.length]);
    }
    this.notes.frustumCulled = false;
    this.notes.renderOrder = 4;
    this.notes.visible = false;
    this.notes.userData.fx = true;
    this.group.add(this.notes);

    // тёплое пятно на плитке перед автоматом
    this.floorMat = new THREE.MeshBasicMaterial({
      map: HAS_DOM ? glowTexture() : null, color: 0xffb060, transparent: true, opacity: 0.16, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2).rotateX(-Math.PI / 2).translate(0, 0.013, JUKE_D / 2 + 0.42), this.floorMat);
    floor.renderOrder = 2;
    floor.userData.fx = true;
    this.addStatic(floor);

    this.group.position.set(JUKEBOX.x, 0, JUKEBOX.z);
    // yaw: 0 — лицом на −Z; модель построена лицом на +Z
    this.group.rotation.y = JUKEBOX.yaw + Math.PI;
    this.group.updateMatrixWorld(true);
    scene.add(this.group);
    this.update(0, false, new Float32Array(EQ_N), 0);
  }

  setVisible(on: boolean): void {
    if (this.group.visible === on) return;
    this.group.visible = on;
    // тени статики не обновляются сами: показали — попросим обновить при первой отрисовке
    this.shadowDirty = true;
  }

  /** Каждый кадр. bands — 7 полос 0..1, beat — фаза доли 0..1 (0 — удар). */
  update(dt: number, playing: boolean, bands: Float32Array, beat: number): void {
    if (!this.group.visible) return;
    const d = Math.min(Math.max(dt, 0), 0.1);
    this.time += d;
    const t = this.time;
    this.play += ((playing ? 1 : 0) - this.play) * Math.min(1, d * 3);
    const p = this.play;
    const b = playing && beat >= 0 && beat <= 1 ? beat : 0;
    let newBeat = false;
    if (playing && b < this.lastBeat - 0.5) {
      this.beats++;
      newBeat = true;
    }
    this.lastBeat = b;
    // вспышка на долю; цвета трубок шагают на отрезок за первую четверть доли
    const hit = playing ? Math.exp(-b * 7) : 0;
    const pos = this.beats + smooth(0, 0.25, b);
    const step = pos - this.lastPos;
    this.lastPos = pos;
    if (playing) this.flow += step > 0 && step < 2 ? step : 0;
    else this.flow += d * 0.12;
    this.flow %= 6;
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.35);
    const level = (0.42 + 0.2 * breathe) * (1 - p) + (0.76 + 0.22 * hit) * p;
    const warm = 0.55 * (1 - p);
    const u = this.tubeU;
    u.uWarm.value = warm;
    u.uFlow.value = this.flow;
    u.uLevel.value = level;
    u.uWave.value = b;
    u.uPulse.value = p;


    // эквалайзер: быстро вверх, плавно вниз; молчит — тихая волна по нижним лампам
    for (let c = 0; c < EQ_N; c++) {
      const band = c < bands.length ? bands[c] : 0;
      const idle = 0.07 * (0.5 + 0.5 * Math.sin(t * 1.5 - c * 0.75));
      const target = p * Math.min(1, Math.max(0, band)) + (1 - p) * idle;
      const lvl = Math.max(target, this.eqLvl[c] - d * 1.6);
      this.eqLvl[c] = lvl;
      for (let s = 0; s < EQ_SEG; s++) {
        const lit = Math.min(1, Math.max(0, lvl * EQ_SEG - s));
        const k = 0.13 + lit * (0.95 + 0.3 * hit);
        const base = EQ_LIN[s];
        this.eq.setColorAt(c * EQ_SEG + s, _c.setRGB(base.r * k, base.g * k, base.b * k));
      }
    }
    if (this.eq.instanceColor) this.eq.instanceColor.needsUpdate = true;

    // пластинка: раскручивается и останавливается плавно
    this.spin += ((playing ? REC_SPIN : 0) - this.spin) * Math.min(1, d * 1.4);
    this.angle = (this.angle + this.spin * d) % TAU;
    this.record.rotation.z = -this.angle;

    // подсветка окошка и пятно на плитке
    this.backMat.color.setScalar(Math.min(1, (0.66 + 0.1 * breathe) * (1 - p) + (0.86 + 0.16 * hit) * p));
    this.floorMat.opacity = 0.1 + 0.12 * level;

    // ноты: на каждую долю — одна (иногда две); если долей нет — по таймеру
    if (playing) {
      this.noteTimer -= d;
      if (newBeat || this.noteTimer <= 0) {
        this.spawn();
        if (newBeat && Math.random() < 0.3) this.spawn();
        this.noteTimer = 0.9;
      }
    }
    this.stepNotes(d, hit);
  }

  private stepNotes(d: number, hit: number): void {
    const fade = this.noteFade.array as Float32Array;
    let alive = 0;
    for (let i = 0; i < NOTES; i++) {
      const life = this.nLife[i];
      if (life <= 0) continue;
      const age = this.nAge[i] + d;
      this.nAge[i] = age;
      if (age >= life) {
        this.nLife[i] = 0;
        fade[i] = 0;
        this.notes.setMatrixAt(i, ZERO);
        continue;
      }
      alive++;
      // вверх и вперёд, к концу медленнее, вбок — волной
      const slow = 1 - (0.4 * age) / life;
      const j = i * 3;
      this.nPos[j] += (this.nVel[j] + Math.sin(age * 3.1 + this.nPh[i]) * 0.12) * d;
      this.nPos[j + 1] += this.nVel[j + 1] * slow * d;
      this.nPos[j + 2] += this.nVel[j + 2] * slow * d;
      const grow = smooth(0, 0.25, age);
      fade[i] = grow * (1 - smooth(life - 0.9, life, age));
      const s = NOTE_SIZE * (0.55 + 0.45 * grow) * (1 + 0.12 * hit);
      _m.makeRotationZ(Math.sin(age * 2.3 + this.nPh[i]) * 0.35);
      _m.scale(_v.set(s, s, s));
      _m.setPosition(this.nPos[j], this.nPos[j + 1], this.nPos[j + 2]);
      this.notes.setMatrixAt(i, _m);
    }
    this.notes.instanceMatrix.needsUpdate = true;
    this.noteFade.needsUpdate = true;
    this.notes.visible = alive > 0;
  }

  /** Новая нота из решётки */
  private spawn(): void {
    const i = this.nextNote;
    this.nextNote = (i + 1) % NOTES;
    const j = i * 3;
    this.nAge[i] = 0;
    this.nLife[i] = NOTE_LIFE * (0.8 + Math.random() * 0.4);
    this.nPh[i] = Math.random() * TAU;
    this.nPos[j] = (Math.random() * 2 - 1) * 0.3;
    this.nPos[j + 1] = GR_Y0 + 0.15 + Math.random() * (GR_Y1 - GR_Y0 - 0.3);
    this.nPos[j + 2] = PANEL_Z + 0.06;
    this.nVel[j] = (Math.random() * 2 - 1) * 0.12;
    this.nVel[j + 1] = 0.42 + Math.random() * 0.22;
    this.nVel[j + 2] = 0.16 + Math.random() * 0.12;
    this.noteGlyph.setX(i, Math.random() < 0.5 ? 0 : 1);
    this.noteGlyph.needsUpdate = true;
    this.notes.setColorAt(i, NOTE_LIN[Math.floor(Math.random() * NOTE_LIN.length)]);
    if (this.notes.instanceColor) this.notes.instanceColor.needsUpdate = true;
  }

  private addStatic(o: THREE.Object3D): void {
    o.matrixAutoUpdate = false;
    o.updateMatrix();
    this.group.add(o);
  }
}
