// Бильярд набережной (флаг BILLIARDS): деревянный навес-пристройка к павильону автоматов и три стола «американки».
// Здесь только вид: навес на четырёх столбах с дощатым потолком и полом, вывеска «БИЛЬЯРД», стойки с киями, столы
// (сукно, резиновые борта, деревянная рама с прицельными ромбами, шесть луз с латунной окантовкой, ноги), над каждым
// столом — длинная лампа с тремя зелёными абажурами, шары (биток красный, 15 одинаковых кремовых с номерами), кий,
// короткая линия прицела и табличка. Где шары, куда смотрит кий и что на табличке — решает сцена по данным сервера.
// Статика склеена по материалам — на весь зал десяток вызовов отрисовки; шары стола — один InstancedMesh с атласом
// номеров, их мягкие тени — ещё один. Тени от солнца отбрасывают только сами столы (карта теней статичная: после
// setVisible сцене нужно пересчитать тени — renderer.refreshShadows()).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BL_CUSHION, BL_FOOT, BL_HALL, BL_HEAD, BL_HX, BL_HZ, BL_OUT_HX, BL_OUT_HZ, BL_POCKETS, BL_R, BL_RAILS, BL_SURFACE_Y, BL_TABLES,
} from '../../shared/billiards.ts';
import { glowSprite, mergeColored, paint } from '../render/kit.ts';
import { metalEnvTexture, plankTexture, softDot } from '../render/textures.ts';
import { TableSign, drawPoolBall, type SignModel } from './tablesign.ts';

const TAU = Math.PI * 2;
/** Сукно и центр шара по высоте */
const Y = BL_SURFACE_Y;
const BALL_Y = Y + BL_R;
/** Сукно тянется под резину до рамы: половины его размера */
const CX = BL_HX + BL_CUSHION;
const CZ = BL_HZ + BL_CUSHION;
/** Резина борта над сукном: верх и нос (нос — на высоте ~63 % шара, как у настоящих столов) */
const CUSH_TOP = 0.042;
const CUSH_NOSE = 0.036;
/** Деревянная рама: верх вровень с резиной, высота бруса, скругление кромки */
const RAIL_TOP = Y + CUSH_TOP;
const RAIL_H = 0.09;
const BEVEL = 0.006;
/** Низ царги (короба под рамой) */
const APRON_Y0 = 0.57;
/** Дыры луз на виде: центр чуть наружу от точки лузы (shared/billiards.ts), радиус; глубина «стакана» */
const CORNER_OFF = 0.012;
const CORNER_HOLE = 0.064;
const SIDE_OFF = 0.035;
const SIDE_HOLE = 0.056;
const POCKET_DEPTH = 0.12;
/** Абажуры лампы над столом: сдвиг вдоль стола, низ абажура, высота, планка */
const LAMP_DZ: readonly number[] = [-0.6, 0, 0.6];
const SHADE_Y0 = 2.0;
const SHADE_H = 0.15;
const BAR_Y = 2.25;
/** Табличка над столом — выше лампы, чтобы не путалась с абажурами; уже обычной: три стола рядом */
const SIGN_Y = 2.78;
const SIGN_W = 1.3;
/** Навес: стропила (их низ — под потолком), столбы по южному краю (у карты — такие же коробки 0,18 × 0,18) */
const RAFTER_H = 0.16;
const POSTS_X: readonly number[] = [-27.8, -22.25, -17.75, -12.8];
const POST_Z = -7.9;
const POST_W = 0.18;
const HEADER_Y = 3.55;
/** Стропила: над столбами и над серединами столов (на них висят лампы) */
const RAFTERS_X: readonly number[] = [...POSTS_X, ...BL_TABLES.map((t) => t.x)].sort((a, b) => a - b);
/** Крыша: на севере — под карнизом павильона, на юге — свес за балку */
const ROOF_N = BL_HALL.z0;
const ROOF_S = BL_HALL.z1 + 0.2;
const ROOF_X0 = BL_HALL.x0 - 0.1;
const ROOF_X1 = BL_HALL.x1 + 0.2;
const ROOF_T = 0.05;
/** Пол: южнее ковра павильона (он до z −15,7), чтобы не спорить с ним по глубине */
const FLOOR_Z0 = -15.7;
/** Линия прицела: длина и ширина, м */
const AIM_LEN = 0.4;
const AIM_W = 0.008;
/** Кий: длина; зазор от шара до наклейки при pull 0 и 1; наклон (приподнят комель) — обычный и предельный */
const CUE_LEN = 1.45;
const CUE_GAP0 = 0.015;
const CUE_GAP1 = 0.3;
const CUE_TILT = (6 * Math.PI) / 180;
const CUE_TILT_MAX = (30 * Math.PI) / 180;
/** Упавший шар: сколько секунд скатывается в лузу и насколько глубоко уходит */
const DROP_S = 0.26;
const DROP_DEPTH = 0.14;
/** Сдвиг за один вызов больше этого — перенос (шар поставили), а не качение */
const ROLL_MAX_STEP = 0.25;

/** Цвета */
const COL = {
  cushion: 0x1d6a45,
  rail: 0x6c341b,
  apron: 0x5c2b16,
  leg: 0x4e2513,
  foot: 0x2a1910,
  bottom: 0x3a2014,
  leather: 0x2a1a11,
  hole: 0x080605,
  brass: 0xc9a14c,
  ivory: 0xf1e8d2,
  beam: 0x7a5236,
  post: 0x6b452e,
  roof: 0x6b4a36,
  fascia: 0x2d5c42,
  trim: 0xeee0bd,
  floor: 0xd2a676,
  ceiling: 0xc99b6b,
  shade: 0x1b6a45,
  shadeIn: 0xffe3b0,
  bulb: 0xfff2cc,
  lampBar: 0x4a2716,
  rack: 0x5a3220,
} as const;

/** Луза на виде: центр дыры, радиус, «наружу» (единичный вектор в плане) */
interface Hole {
  x: number;
  z: number;
  r: number;
  ox: number;
  oz: number;
}

const HOLES: readonly Hole[] = BL_POCKETS.map((p) => {
  const sx = Math.sign(p.x);
  const sz = Math.sign(p.z);
  if (sz === 0) return { x: p.x + sx * SIDE_OFF, z: 0, r: SIDE_HOLE, ox: sx, oz: 0 };
  return { x: p.x + sx * CORNER_OFF, z: p.z + sz * CORNER_OFF, r: CORNER_HOLE, ox: sx * Math.SQRT1_2, oz: sz * Math.SQRT1_2 };
});

function holeAt(sx: number, sz: number): Hole {
  return HOLES.find((h) => Math.sign(h.x) === sx && Math.sign(h.z) === sz)!;
}

/** Низ потолка навеса над точкой z (крыша — один скат с севера на юг) */
function roofUnder(z: number): number {
  return BL_HALL.roofY + ((z - BL_HALL.z0) * (BL_HALL.eaveY - BL_HALL.roofY)) / (BL_HALL.z1 - BL_HALL.z0);
}

// ------------------------------------------------------------ помощники геометрии

function canvas(w: number, h: number, read = false): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: read })!];
}

/** Мелкий шум по пикселям (ворс сукна, зерно краски) — один проход по ImageData, а не тысячи мелких прямоугольников. */
function noise(g: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number): void {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  let s = seed;
  for (let i = 0; i < d.length; i += 4) {
    s = (s * 16807) % 2147483647;
    const n = (s / 2147483647 - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

function canvasTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Покрасить (вершинные цвета) и сдвинуть. */
function part(g: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return paint(g, color).translate(x, y, z);
}

/** Коробка по двум углам. */
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): THREE.BufferGeometry {
  return part(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), color, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

/** Плоские нормали: грани ножек и брусьев остаются гранями. */
function flat(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  n.computeVertexNormals();
  return n;
}

/** Запечённая тень у пола: вершинные цвета темнеют книзу до k0 (как у боксов набережной). */
function groundShade(g: THREE.BufferGeometry, y0: number, y1: number, k0: number): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const c = g.getAttribute('color');
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0)));
    const k = k0 + (1 - k0) * t;
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  return g;
}

/** Вывернуть грани внутрь: стенки лузы и абажура видны изнутри. */
function inside(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(n.attributes)) {
    const a = n.getAttribute(name) as THREE.BufferAttribute;
    const s = a.itemSize;
    const arr = a.array;
    for (let i = 0; i + 2 < a.count; i += 3) {
      for (let k = 0; k < s; k++) {
        const t = arr[(i + 1) * s + k];
        arr[(i + 1) * s + k] = arr[(i + 2) * s + k];
        arr[(i + 2) * s + k] = t;
      }
    }
  }
  const nor = n.getAttribute('normal');
  for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
  return n;
}

/**
 * Брус на скате крыши: ширина w по x, высота h, от zA до zB; верх (или низ, если below) — на линии y(z).
 */
function slopeBox(x: number, w: number, h: number, zA: number, zB: number, y: (z: number) => number, color: number, below = false): THREE.BufferGeometry {
  const yA = y(zA);
  const yB = y(zB);
  const len = Math.hypot(zB - zA, yB - yA);
  const a = Math.atan2(yA - yB, zB - zA);
  const g = paint(new THREE.BoxGeometry(w, h, len), color).rotateX(a);
  // «вверх» бруса после поворота — (0, cos a, sin a): верх ложится на линию, низ — на линию при below
  const k = below ? h / 2 : -h / 2;
  return g.translate(x, (yA + yB) / 2 + k * Math.cos(a), (zA + zB) / 2 + k * Math.sin(a));
}

/** Скруглённый прямоугольник ±hx × ±hz (точки по кругу) */
function roundRect(hx: number, hz: number, r: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const corners: Array<[number, number, number]> = [
    [hx - r, hz - r, 0],
    [-hx + r, hz - r, Math.PI / 2],
    [-hx + r, -hz + r, Math.PI],
    [hx - r, -hz + r, (3 * Math.PI) / 2],
  ];
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cz + Math.sin(a) * r));
    }
  }
  return pts;
}

/** Дуга круга лузы между двумя точками на нём — через сторону via (угол). */
interface Arc {
  hole: Hole;
  r: number;
  a0: number;
  span: number;
}

function arcThrough(hole: Hole, r: number, x0: number, z0: number, x1: number, z1: number, via: number): Arc {
  const a0 = Math.atan2(z0 - hole.z, x0 - hole.x);
  const a1 = Math.atan2(z1 - hole.z, x1 - hole.x);
  const ccw = (((a1 - a0) % TAU) + TAU) % TAU;
  const toVia = (((via - a0) % TAU) + TAU) % TAU;
  return { hole, r, a0, span: toVia < ccw ? ccw : ccw - TAU };
}

/**
 * Дуги луз на прямоугольнике ±lx × ±lz: где круги дыр (радиус + grow) режут его стороны.
 * out — дуги снаружи прямоугольника (проём в раме), иначе — внутри (край сукна). Порядок — обход по контуру.
 */
function holeArcs(lx: number, lz: number, grow: number, out: boolean): Arc[] {
  const c = holeAt(1, 1);
  const s = holeAt(1, 0);
  const rc = c.r + grow;
  const rs = s.r + grow;
  const zc = c.z - Math.sqrt(rc * rc - (lx - c.x) ** 2);
  const xc = c.x - Math.sqrt(rc * rc - (lz - c.z) ** 2);
  const zs = Math.sqrt(rs * rs - (lx - s.x) ** 2);
  const arc = (sx: number, sz: number, x0: number, z0: number, x1: number, z1: number): Arc => {
    const h = holeAt(sx, sz);
    const via = out ? Math.atan2(h.oz, h.ox) : Math.atan2(-h.oz, -h.ox);
    return arcThrough(h, h.r + grow, x0, z0, x1, z1, via);
  };
  return [
    arc(1, -1, xc, -lz, lx, -zc),
    arc(1, 0, lx, -zs, lx, zs),
    arc(1, 1, lx, zc, xc, lz),
    arc(-1, 1, -xc, lz, -lx, zc),
    arc(-1, 0, -lx, zs, -lx, -zs),
    arc(-1, -1, -lx, -zc, -xc, -lz),
  ];
}

/** Контур из дуг: соседние дуги соединяются прямыми — сторонами прямоугольника. */
function arcOutline(arcs: readonly Arc[]): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (const { hole, r, a0, span } of arcs) {
    const n = Math.max(3, Math.ceil(Math.abs(span) / 0.14));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (span * i) / n;
      pts.push(new THREE.Vector2(hole.x + Math.cos(a) * r, hole.z + Math.sin(a) * r));
    }
  }
  return pts;
}

/**
 * Резина борта на отрезке (x0, z0)–(x1, z1) линии носа: профиль — нос, скошенный верх, спинка у рамы.
 * Концы срезаны к лузам: у спинки резина заходит к лузе дальше, чем у носа (губки сходятся к дыре).
 */
function cushion(x0: number, z0: number, x1: number, z1: number): THREE.BufferGeometry {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const dx = (x1 - x0) / len;
  const dz = (z1 - z0) / len;
  const nx = x0 === x1 ? Math.sign(x0) : 0;
  const nz = x0 === x1 ? 0 : Math.sign(z0);
  // профиль: (отступ наружу от носа, высота над сукном)
  const prof: Array<[number, number]> = [
    [0.012, 0],
    [0, CUSH_NOSE],
    [0.008, CUSH_TOP],
    [BL_CUSHION, CUSH_TOP],
    [BL_CUSHION, 0],
  ];
  // насколько спинка заходит к лузе дальше носа: до круга дыры с зазором 4 мм, не больше 5 см
  const reach = (px: number, pz: number, ux: number, uz: number): number => {
    let best: Hole = HOLES[0];
    let bd = Infinity;
    for (const h of HOLES) {
      const d = Math.hypot(h.x - px, h.z - pz);
      if (d < bd) { bd = d; best = h; }
    }
    const wx = px + nx * BL_CUSHION - best.x;
    const wz = pz + nz * BL_CUSHION - best.z;
    const r = best.r + 0.004;
    const wu = wx * ux + wz * uz;
    const disc = wu * wu - (wx * wx + wz * wz) + r * r;
    if (disc < 0) return 0.03;
    return Math.min(0.05, Math.max(0, -wu - Math.sqrt(disc)));
  };
  const e0 = reach(x0, z0, -dx, -dz);
  const e1 = reach(x1, z1, dx, dz);
  const end = (px: number, pz: number, ux: number, uz: number, e: number): THREE.Vector3[] =>
    prof.map(([o, h]) => new THREE.Vector3(px + nx * o + ux * e * (o / BL_CUSHION), Y + h, pz + nz * o + uz * e * (o / BL_CUSHION)));
  const A = end(x0, z0, -dx, -dz, e0);
  const B = end(x1, z1, dx, dz, e1);
  const centre = new THREE.Vector3();
  for (const v of [...A, ...B]) centre.add(v);
  centre.divideScalar(A.length + B.length);
  const pos: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
    // грань наружу: нормаль смотрит от центра призмы
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const m = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3).sub(centre);
    if (n.dot(m) < 0) pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
    else pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  const k = prof.length;
  for (let i = 0; i < k; i++) {
    const j = (i + 1) % k;
    tri(A[i], A[j], B[j]);
    tri(A[i], B[j], B[i]);
  }
  for (let i = 1; i + 1 < k; i++) {
    tri(A[0], A[i], A[i + 1]);
    tri(B[0], B[i], B[i + 1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return paint(g, COL.cushion);
}

// ------------------------------------------------------------ текстуры

/** Сукно: тёмно-зелёное, светлее под абажурами и темнее к бортам, ворс, линия «дома» и точки. */
function feltTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 1024;
  const [c, g] = canvas(W, H, true);
  const sx = W / (2 * CX);
  const sz = H / (2 * CZ);
  const px = (x: number): number => (x + CX) * sx;
  const pz = (z: number): number => (z + CZ) * sz;
  g.fillStyle = '#1a6a45';
  g.fillRect(0, 0, W, H);
  // тёплые пятна света ламп
  for (const dz of LAMP_DZ) {
    const r = 0.62 * sx;
    const grad = g.createRadialGradient(px(0), pz(dz), 0, px(0), pz(dz), r);
    grad.addColorStop(0, 'rgba(255,224,150,0.13)');
    grad.addColorStop(1, 'rgba(255,224,150,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }
  // к бортам темнее
  const edge = 0.16;
  const vig = (x0: number, y0: number, x1: number, y1: number): void => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(4,28,16,0.38)');
    gr.addColorStop(1, 'rgba(4,28,16,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  };
  vig(0, 0, edge * sx, 0);
  vig(W, 0, W - edge * sx, 0);
  vig(0, 0, 0, edge * sz);
  vig(0, H, 0, H - edge * sz);
  // ворс
  noise(g, W, H, 10, 11);
  // линия «дома» и точки: дом, пирамида, центр
  g.fillStyle = 'rgba(236,232,206,0.22)';
  g.fillRect(px(-BL_HX), pz(BL_HEAD.z) - 1, px(BL_HX) - px(-BL_HX), 2);
  g.fillStyle = 'rgba(240,236,214,0.6)';
  for (const [x, z] of [[BL_HEAD.x, BL_HEAD.z], [BL_FOOT.x, BL_FOOT.z], [0, 0]]) {
    g.beginPath();
    g.arc(px(x), pz(z), 3.2, 0, TAU);
    g.fill();
  }
  return canvasTexture(c);
}

/** Атлас шаров 4 × 4: ячейка — равнопромежуточная развёртка шара; 0 — красный биток, 1–15 — крем с номерами. */
const ATLAS_CW = 256;
const ATLAS_CH = 128;
/** Поля ячейки (доля), чтобы в мипмапах не подтекал сосед */
const PAD_U = 3 / ATLAS_CW;
const PAD_V = 3 / ATLAS_CH;

function ballAtlas(): THREE.CanvasTexture {
  const [c, g] = canvas(ATLAS_CW * 4, ATLAS_CH * 4);
  for (let n = 0; n < 16; n++) {
    const x0 = (n % 4) * ATLAS_CW;
    const y0 = Math.floor(n / 4) * ATLAS_CH;
    if (n === 0) {
      g.fillStyle = '#c4242b';
      g.fillRect(x0, y0, ATLAS_CW, ATLAS_CH);
      continue;
    }
    g.fillStyle = '#efe4c7';
    g.fillRect(x0, y0, ATLAS_CW, ATLAS_CH);
    // номер на двух противоположных сторонах экватора в белом кружке
    for (const u of [0.25, 0.75]) {
      const cx = x0 + u * ATLAS_CW;
      const cy = y0 + ATLAS_CH / 2;
      g.beginPath();
      g.ellipse(cx, cy, 21, 20, 0, 0, TAU);
      g.fillStyle = '#fffbf2';
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(70,50,30,0.35)';
      g.stroke();
      g.fillStyle = '#17120d';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `800 ${n > 9 ? 21 : 25}px Rubik, system-ui, sans-serif`;
      g.fillText(String(n), cx, cy + 1);
      if (n === 6 || n === 9) g.fillRect(cx - 6, cy + 11, 12, 2);
    }
  }
  const t = canvasTexture(c);
  t.anisotropy = 4;
  return t;
}

/** Вывеска «БИЛЬЯРД»: крашеная доска — тёмно-зелёная, кремовые буквы и рамка, по краям шары. */
function boardTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 192;
  const [c, g] = canvas(W, H, true);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#236b4b');
  bg.addColorStop(1, '#174a34');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // доски щита
  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (const y of [H / 3, (2 * H) / 3]) g.fillRect(0, y, W, 2);
  g.strokeStyle = '#efdcae';
  g.lineWidth = 8;
  g.strokeRect(12, 12, W - 24, H - 24);
  g.lineWidth = 2.5;
  g.strokeRect(26, 26, W - 52, H - 52);
  drawPoolBall(g, 104, H / 2, 46, '#c4242b');
  drawPoolBall(g, W - 104, H / 2, 46, '#efe4c7', 8);
  g.fillStyle = '#f5d996';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 112px Rubik, system-ui, sans-serif`;
  g.letterSpacing = '10px';
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = 6;
  g.shadowOffsetY = 4;
  g.fillText('БИЛЬЯРД', W / 2 + 5, H / 2 + 6);
  g.shadowColor = 'transparent';
  g.letterSpacing = '0px';
  // крашеное дерево: лёгкое зерно
  noise(g, W, H, 12, 7);
  return canvasTexture(c);
}

/** Линия прицела: светлая полоса с мягкими краями, гаснет к дальнему концу (верх холста — у шара). */
function aimTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(16, 128);
  const across = g.createLinearGradient(0, 0, 16, 0);
  across.addColorStop(0, 'rgba(255,255,255,0)');
  across.addColorStop(0.3, 'rgba(255,255,255,1)');
  across.addColorStop(0.7, 'rgba(255,255,255,1)');
  across.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = across;
  g.fillRect(0, 0, 16, 128);
  g.globalCompositeOperation = 'destination-in';
  const along = g.createLinearGradient(0, 0, 0, 128);
  along.addColorStop(0, 'rgba(0,0,0,1)');
  along.addColorStop(0.55, 'rgba(0,0,0,0.55)');
  along.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = along;
  g.fillRect(0, 0, 16, 128);
  return canvasTexture(c);
}

// ------------------------------------------------------------ кий

/** Кий вдоль −z: наклейка в начале координат, комель — в −CUE_LEN. Участки: от кончика назад, радиусы, цвет. */
function cueGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const seg = (s0: number, s1: number, r0: number, r1: number, color: number): void => {
    // CylinderGeometry: верх (r0) после поворота смотрит в +z — к наклейке
    const g = new THREE.CylinderGeometry(r0, r1, s1 - s0, 10, 1, false).rotateX(Math.PI / 2).translate(0, 0, -(s0 + s1) / 2);
    parts.push(paint(g, color));
  };
  seg(0, 0.008, 0.0058, 0.006, 0x86aac4);
  seg(0.008, 0.028, 0.006, 0.0062, 0xf2ecdc);
  seg(0.028, 0.8, 0.0062, 0.0098, 0xe4c590);
  seg(0.8, 0.82, 0.0101, 0.0102, 0xc9a14c);
  seg(0.82, 1.05, 0.0102, 0.0118, 0x6e3418);
  seg(1.05, 1.32, 0.0118, 0.0135, 0x2b1c14);
  seg(1.32, 1.43, 0.0135, 0.0145, 0x6e3418);
  seg(1.43, CUE_LEN, 0.0145, 0.0142, 0x141210);
  return mergeColored(parts);
}

// ------------------------------------------------------------ стол (в осях стола: центр — (0, 0), пол — y = 0)

interface Buckets {
  /** Матовое с вершинными цветами: навес, резина бортов, стаканы луз */
  matte: THREE.BufferGeometry[];
  /** Лакированное дерево столов (бросает тени) */
  body: THREE.BufferGeometry[];
  /** Лакированное прочее: лампы, щит вывески, стойки с киями */
  decor: THREE.BufferGeometry[];
  /** Латунь */
  metal: THREE.BufferGeometry[];
  /** Светится: лампочки, нутро абажуров */
  glow: THREE.BufferGeometry[];
}

function tableParts(): Buckets & { cloth: THREE.BufferGeometry } {
  const b: Buckets = { matte: [], body: [], decor: [], metal: [], glow: [] };

  // сукно: прямоугольник до рамы, лузы вырезаны
  const cloth = new THREE.ShapeGeometry(new THREE.Shape(arcOutline(holeArcs(CX, CZ, 0, false))), 1).rotateX(-Math.PI / 2).translate(0, Y, 0);
  {
    const p = cloth.getAttribute('position');
    const uv = cloth.getAttribute('uv');
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + CX) / (2 * CX), 1 - (p.getZ(i) + CZ) / (2 * CZ));
  }

  // резина бортов между лузами
  for (const [x0, z0, x1, z1] of BL_RAILS) b.matte.push(cushion(x0, z0, x1, z1));

  // рама: брус со скруглённой кромкой; проёмы луз обтянуты кожей
  {
    const shape = new THREE.Shape(roundRect(BL_OUT_HX - BEVEL, BL_OUT_HZ - BEVEL, 0.05));
    shape.holes.push(new THREE.Path(arcOutline(holeArcs(CX + BEVEL, CZ + BEVEL, BEVEL, true))));
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: RAIL_H - 2 * BEVEL, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 2, curveSegments: 4, steps: 1,
    });
    g.rotateX(-Math.PI / 2).translate(0, RAIL_TOP - RAIL_H + BEVEL, 0);
    const rail = paint(g, COL.rail);
    const p = rail.getAttribute('position');
    const col = rail.getAttribute('color');
    const leather = new THREE.Color(COL.leather);
    for (let i = 0; i + 2 < p.count; i += 3) {
      const onHole = HOLES.some((h) => {
        for (let k = 0; k < 3; k++) {
          const d = Math.hypot(p.getX(i + k) - h.x, p.getZ(i + k) - h.z);
          if (Math.abs(d - h.r - BEVEL / 2) > BEVEL / 2 + 0.0015) return false;
        }
        return true;
      });
      if (onHole) for (let k = 0; k < 3; k++) col.setXYZ(i + k, leather.r, leather.g, leather.b);
    }
    b.body.push(rail);
  }

  // латунные окантовки луз на раме, кожаные стаканы и чёрное дно
  for (const a of holeArcs(CX, CZ, 0, true)) {
    const h = a.hole;
    const start = a.span >= 0 ? a.a0 : a.a0 + a.span;
    const len = Math.abs(a.span);
    // RingGeometry лежит в XY: после поворота к полу угол θ в плане становится −θ
    const ring = new THREE.RingGeometry(h.r + 0.003, h.r + 0.026, 24, 1, -(start + len), len).rotateX(-Math.PI / 2);
    b.metal.push(part(ring, COL.brass, h.x, RAIL_TOP + 0.0012, h.z));
  }
  for (const h of HOLES) {
    b.matte.push(part(inside(new THREE.CylinderGeometry(h.r, h.r * 0.9, POCKET_DEPTH, 20, 1, true)), COL.leather, h.x, Y - POCKET_DEPTH / 2, h.z));
    b.matte.push(part(new THREE.CircleGeometry(h.r * 0.9, 20).rotateX(-Math.PI / 2), COL.hole, h.x, Y - POCKET_DEPTH + 0.002, h.z));
  }

  // прицельные ромбы на раме: по 6 на длинных бортах, по 3 на коротких
  {
    const mid = (CX + BL_OUT_HX) / 2;
    const midZ = (CZ + BL_OUT_HZ) / 2;
    const diamond = (x: number, z: number, alongZ: boolean): void => {
      const g = new THREE.CircleGeometry(1, 4).scale(alongZ ? 0.0065 : 0.013, alongZ ? 0.013 : 0.0065, 1).rotateX(-Math.PI / 2);
      b.body.push(part(g, COL.ivory, x, RAIL_TOP + 0.0008, z));
    };
    const q = BL_HZ / 4;
    for (const sx of [-1, 1]) for (const k of [-3, -2, -1, 1, 2, 3]) diamond(sx * mid, k * q, true);
    for (const sz of [-1, 1]) for (const k of [-1, 0, 1]) diamond(k * (BL_HX / 2), sz * midZ, false);
  }

  // царга под рамой, нижний поясок, накладки над ногами (ниже стаканов луз), ноги
  {
    const ax = BL_OUT_HX - 0.022;
    const az = BL_OUT_HZ - 0.022;
    const t = 0.045;
    const top = RAIL_TOP - RAIL_H;
    b.body.push(box(-ax, APRON_Y0, -az, -ax + t, top, az, COL.apron));
    b.body.push(box(ax - t, APRON_Y0, -az, ax, top, az, COL.apron));
    b.body.push(box(-ax + t, APRON_Y0, -az, ax - t, top, -az + t, COL.apron));
    b.body.push(box(-ax + t, APRON_Y0, az - t, ax - t, top, az, COL.apron));
    // низ короба: закрывает стол снизу и выступает пояском
    b.body.push(box(-ax - 0.008, APRON_Y0 - 0.03, -az - 0.008, ax + 0.008, APRON_Y0, az + 0.008, COL.bottom));
    const lx = ax - 0.074;
    const lz = az - 0.074;
    for (const sx of [-1, 1]) {
      for (const z of [-lz, 0, lz]) {
        const x = sx * lx;
        b.body.push(box(x - 0.08, APRON_Y0 - 0.03, z - 0.08, x + 0.08, Y - POCKET_DEPTH - 0.006, z + 0.08, COL.apron));
        const legH = APRON_Y0 - 0.03 - 0.07;
        const leg = flat(paint(new THREE.CylinderGeometry(0.084, 0.064, legH, 4, 1).rotateY(Math.PI / 4), COL.leg));
        b.body.push(groundShade(leg.translate(x, 0.07 + legH / 2, z), 0, 0.5, 0.55));
        b.body.push(groundShade(box(x - 0.066, 0, z - 0.066, x + 0.066, 0.07, z + 0.066, COL.foot), 0, 0.07, 0.6));
      }
    }
  }
  return { ...b, cloth };
}

// ------------------------------------------------------------ зал: навес, лампы, вывеска, стойки

function buildCanopy(b: Buckets): void {
  const H = BL_HALL;
  // балка у павильона (под его карнизом) и южная балка на столбах
  b.matte.push(box(ROOF_X0, H.roofY - 0.2, ROOF_N, ROOF_X1, H.roofY, ROOF_N + 0.14, COL.beam));
  b.matte.push(box(ROOF_X0, HEADER_Y, POST_Z - 0.1, ROOF_X1, roofUnder(POST_Z + 0.1), POST_Z + 0.1, COL.beam));
  // столбы: цоколь, ствол, оголовок, подкосы к балке
  for (const x of POSTS_X) {
    b.matte.push(groundShade(box(x - POST_W / 2, 0, POST_Z - POST_W / 2, x + POST_W / 2, HEADER_Y, POST_Z + POST_W / 2, COL.post), 0, 1.2, 0.6));
    b.matte.push(groundShade(box(x - 0.13, 0, POST_Z - 0.13, x + 0.13, 0.12, POST_Z + 0.13, COL.beam), 0, 0.12, 0.6));
    b.matte.push(box(x - 0.12, HEADER_Y - 0.06, POST_Z - 0.12, x + 0.12, HEADER_Y, POST_Z + 0.12, COL.beam));
    for (const s of [-1, 1]) {
      if (x + s * 0.6 < ROOF_X0 || x + s * 0.6 > ROOF_X1) continue;
      const g = paint(new THREE.BoxGeometry(0.8, 0.07, 0.07), COL.beam).rotateZ(s * (Math.PI / 4));
      b.matte.push(g.translate(x + s * 0.3, HEADER_Y - 0.28, POST_Z));
    }
  }
  // стропила: от балки у павильона до свеса, верх — под досками потолка
  for (const x of RAFTERS_X) b.matte.push(slopeBox(x, 0.09, RAFTER_H, ROOF_N + 0.14, ROOF_S, roofUnder, COL.beam));
  // кровля поверх стропил, торцевые доски по скатам и лобовая доска с кремовым кантом на юге
  {
    const a = ROOF_X0 - 0.02;
    const c = ROOF_X1 + 0.02;
    const roof = slopeBox((a + c) / 2, c - a, ROOF_T, ROOF_N, ROOF_S, roofUnder, COL.roof, true);
    b.matte.push(roof);
    for (const x of [a - 0.015, c + 0.015]) b.matte.push(slopeBox(x, 0.03, 0.17, ROOF_N, ROOF_S, (z) => roofUnder(z) + ROOF_T + 0.02, COL.fascia));
    const yS = roofUnder(ROOF_S);
    b.matte.push(box(a - 0.03, yS - 0.1, ROOF_S, c + 0.03, yS + ROOF_T + 0.02, ROOF_S + 0.03, COL.fascia));
    b.matte.push(box(a - 0.03, yS + ROOF_T + 0.005, ROOF_S - 0.01, c + 0.03, yS + ROOF_T + 0.035, ROOF_S + 0.04, COL.trim));
  }
}

/** Лампа над столом (cx, cz): деревянная планка на двух латунных штангах, три зелёных абажура с лампочками. */
function buildLamp(b: Buckets, cx: number, cz: number, glows: Array<[number, number, number]>): void {
  b.decor.push(box(cx - 0.035, BAR_Y - 0.025, cz - 0.85, cx + 0.035, BAR_Y + 0.025, cz + 0.85, COL.lampBar));
  for (const s of [-1, 1]) b.metal.push(box(cx - 0.042, BAR_Y - 0.03, cz + s * 0.85 - 0.012, cx + 0.042, BAR_Y + 0.03, cz + s * 0.85 + 0.012, COL.brass));
  for (const dz of LAMP_DZ) {
    const z = cz + dz;
    const yc = SHADE_Y0 + SHADE_H / 2;
    b.decor.push(part(new THREE.CylinderGeometry(0.055, 0.17, SHADE_H, 24, 1, true), COL.shade, cx, yc, z));
    b.glow.push(part(inside(new THREE.CylinderGeometry(0.053, 0.166, SHADE_H - 0.004, 24, 1, true)), COL.shadeIn, cx, yc, z));
    const capY = SHADE_Y0 + SHADE_H;
    b.metal.push(part(new THREE.CylinderGeometry(0.03, 0.056, 0.03, 16), COL.brass, cx, capY + 0.015, z));
    const stem = BAR_Y - 0.025 - (capY + 0.03);
    b.metal.push(part(new THREE.CylinderGeometry(0.008, 0.008, stem, 6), COL.brass, cx, capY + 0.03 + stem / 2, z));
    b.metal.push(part(new THREE.TorusGeometry(0.17, 0.006, 6, 28).rotateX(Math.PI / 2), COL.brass, cx, SHADE_Y0, z));
    b.glow.push(part(new THREE.SphereGeometry(0.038, 12, 8), COL.bulb, cx, SHADE_Y0 + 0.05, z));
    glows.push([cx, SHADE_Y0 - 0.05, z]);
  }
  // штанги к стропилу — у концов планки, чтобы не резали табличку над столом
  for (const s of [-1, 1]) {
    const z = cz + s * 0.82;
    const top = roofUnder(z) - RAFTER_H;
    const h = top - (BAR_Y + 0.025);
    b.metal.push(part(new THREE.CylinderGeometry(0.006, 0.006, h, 6), COL.brass, cx, BAR_Y + 0.025 + h / 2, z));
    b.metal.push(part(new THREE.CylinderGeometry(0.03, 0.03, 0.014, 12), COL.brass, cx, top - 0.007, z));
  }
}

/** Вывеска «БИЛЬЯРД» под южной балкой посреди навеса: щит и подвесы — в общие вёдра, надпись с обеих сторон — свой меш. */
function buildBoard(b: Buckets): THREE.Mesh {
  const x = (POSTS_X[1] + POSTS_X[2]) / 2;
  const top = HEADER_Y - 0.07;
  const h = 0.64;
  const w = 3.0;
  const yc = top - h / 2;
  b.decor.push(box(x - w / 2, top - h, POST_Z - 0.025, x + w / 2, top, POST_Z + 0.025, COL.lampBar));
  for (const s of [-1, 1]) b.metal.push(part(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 6), COL.brass, x + s * (w / 2 - 0.25), top + 0.035, POST_Z));
  const tex = boardTexture();
  const face = (z: number, ry: number): THREE.BufferGeometry => new THREE.PlaneGeometry(w - 0.1, h - 0.09).rotateY(ry).translate(x, yc, z);
  return new THREE.Mesh(
    mergeGeometries([face(POST_Z + 0.0262, 0), face(POST_Z - 0.0262, Math.PI)], false)!,
    new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.75 }),
  );
}

/** Стойка для киёв на угловом столбе (x — ось столба, dir — куда смотрит стойка: +1 на восток, −1 на запад). */
function buildRack(b: Buckets, x: number, dir: number, cue: THREE.BufferGeometry): void {
  const f = x + dir * (POST_W / 2);
  const span = (d0: number, d1: number): [number, number] => [Math.min(f + dir * d0, f + dir * d1), Math.max(f + dir * d0, f + dir * d1)];
  const [b0, b1] = span(0, 0.025);
  b.decor.push(box(b0, 0.36, POST_Z - 0.22, b1, 1.78, POST_Z + 0.22, COL.rack));
  const [s0, s1] = span(0.025, 0.1);
  b.decor.push(box(s0, 0.42, POST_Z - 0.22, s1, 0.47, POST_Z + 0.22, COL.rack));
  const [t0, t1] = span(0.025, 0.085);
  b.decor.push(box(t0, 1.5, POST_Z - 0.22, t1, 1.54, POST_Z + 0.22, COL.rack));
  for (const k of [-0.15, -0.05, 0.05, 0.15]) {
    b.decor.push(cue.clone().rotateX(-Math.PI / 2).translate(f + dir * 0.06, 0.47 + CUE_LEN, POST_Z + k));
  }
}

// ------------------------------------------------------------ живое: шары, кий, прицел, табличка

interface TableVis {
  root: THREE.Group;
  balls: THREE.InstancedMesh;
  shadows: THREE.InstancedMesh;
  cue: THREE.Mesh;
  aim: THREE.Mesh;
  sign: TableSign;
  /** Шары в осях стола и на столе ли */
  x: Float32Array;
  z: Float32Array;
  on: boolean[];
  q: THREE.Quaternion[];
  /** Падение в лузу: сколько прошло (−1 — не падает), откуда и куда (центр дыры) */
  drop: Float32Array;
  dropFrom: Float32Array;
  dropTo: Float32Array;
  dropping: boolean;
  inited: boolean;
  cueOn: boolean;
  cueAng: number;
  cuePull: number;
  aimOn: boolean;
  aimAng: number;
}

const DEFAULT_SIGN: SignModel = {
  title: 'БИЛЬЯРД', sub: 'американка · до 8 шаров', stake: 'партия на двоих', seated: 0, seats: 2, state: 'свободно', tone: 'free',
};

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const ZERO = new THREE.Vector3(0, 0, 0);
const ONE = new THREE.Vector3(1, 1, 1);

export class Billiards3D {
  readonly group = new THREE.Group();
  private readonly tables: TableVis[] = [];

  constructor(scene: THREE.Scene) {
    this.group.name = 'billiards';
    this.group.visible = false;
    const env = metalEnvTexture();

    // --- статика зала: всё в мировых координатах, склеено по материалам
    const all: Buckets = { matte: [], body: [], decor: [], metal: [], glow: [] };
    const cloths: THREE.BufferGeometry[] = [];
    const glows: Array<[number, number, number]> = [];
    const proto = tableParts();
    for (const t of BL_TABLES) {
      for (const key of ['matte', 'body', 'metal'] as const) for (const g of proto[key]) all[key].push(g.clone().translate(t.x, 0, t.z));
      cloths.push(proto.cloth.clone().translate(t.x, 0, t.z));
      buildLamp(all, t.x, t.z, glows);
    }
    buildCanopy(all);
    const cue = cueGeometry();
    buildRack(all, POSTS_X[0], 1, cue);
    buildRack(all, POSTS_X[POSTS_X.length - 1], -1, cue);
    const board = buildBoard(all);

    const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const varnish = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, envMap: env, envMapIntensity: 0.35 });
    const brass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.85, envMap: env, envMapIntensity: 1.1 });
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const add = (list: THREE.BufferGeometry[], mat: THREE.Material, cast: boolean, receive: boolean): THREE.Mesh => {
      const m = new THREE.Mesh(mergeColored(list), mat);
      m.castShadow = cast;
      m.receiveShadow = receive;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      this.group.add(m);
      return m;
    };
    add(all.matte, matte, false, true).name = 'billiards-canopy';
    add(all.body, varnish, true, true).name = 'billiards-tables';
    add(all.decor, varnish, false, false);
    add(all.metal, brass, false, false);
    add(all.glow, glowMat, false, false);

    // сукно
    const feltTex = feltTexture();
    const felt = new THREE.Mesh(
      mergeGeometries(cloths, false)!,
      new THREE.MeshStandardMaterial({ map: feltTex, roughness: 0.95, emissive: 0xffffff, emissiveMap: feltTex, emissiveIntensity: 0.12 }),
    );
    felt.receiveShadow = true;
    felt.matrixAutoUpdate = false;
    felt.updateMatrix();
    this.group.add(felt);

    // доски: пол под навесом и потолок (одна текстура, развёртка в метрах)
    {
      const H = BL_HALL;
      const floor = paint(new THREE.PlaneGeometry(H.x1 - H.x0, H.z1 - FLOOR_Z0).rotateX(-Math.PI / 2), COL.floor)
        .translate((H.x0 + H.x1) / 2, 0.004, (FLOOR_Z0 + H.z1) / 2);
      const a = Math.atan2(roofUnder(ROOF_N) - roofUnder(ROOF_S), ROOF_S - ROOF_N);
      const len = Math.hypot(ROOF_S - ROOF_N, roofUnder(ROOF_N) - roofUnder(ROOF_S));
      const ceil = paint(new THREE.PlaneGeometry(ROOF_X1 - ROOF_X0, len).rotateX(Math.PI / 2 + a), COL.ceiling)
        .translate((ROOF_X0 + ROOF_X1) / 2, (roofUnder(ROOF_N) + roofUnder(ROOF_S)) / 2 - 0.002, (ROOF_N + ROOF_S) / 2);
      const uvm = (g: THREE.BufferGeometry, m: number): THREE.BufferGeometry => {
        const p = g.getAttribute('position');
        const uv = g.getAttribute('uv');
        for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / m, p.getZ(i) / m);
        return g;
      };
      const map = plankTexture();
      const boards = new THREE.Mesh(
        mergeGeometries([uvm(floor, 2.2), uvm(ceil, 2)], false)!,
        new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
      );
      boards.receiveShadow = true;
      boards.renderOrder = 1;
      boards.matrixAutoUpdate = false;
      boards.updateMatrix();
      this.group.add(boards);
    }

    this.group.add(board);

    // свет под абажурами
    const halo = glowSprite(0xffc27a, 0.85, 0.32);
    for (const [x, y, z] of glows) {
      const s = halo.clone();
      s.position.set(x, y, z);
      this.group.add(s);
    }

    // --- живое: шары (атлас номеров, ячейку выбирает атрибут aCell), их тени, кий, линия прицела, табличка
    const ballGeo = new THREE.SphereGeometry(BL_R, 24, 16);
    ballGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: 16 }, (_, i) => i)), 1));
    const ballMat = new THREE.MeshStandardMaterial({ map: ballAtlas(), roughness: 0.2, envMap: env, envMapIntensity: 0.9 });
    const f = (n: number): string => n.toFixed(6);
    ballMat.onBeforeCompile = (sh) => {
      sh.vertexShader = `attribute float aCell;\n${sh.vertexShader}`.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        {
          float cellCol = mod(aCell, 4.0);
          float cellRow = floor(aCell / 4.0 + 0.001);
          vMapUv = vec2(
            (cellCol + ${f(PAD_U)} + uv.x * ${f(1 - 2 * PAD_U)}) / 4.0,
            1.0 - (cellRow + ${f(PAD_V)} + (1.0 - uv.y) * ${f(1 - 2 * PAD_V)}) / 4.0);
        }`,
      );
    };
    ballMat.customProgramCacheKey = () => 'billiard-balls-v1';
    const shadowGeo = new THREE.PlaneGeometry(0.075, 0.075).rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: softDot('rgba(0,0,0,0.8)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false, opacity: 0.6,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
    const cueMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, envMap: env, envMapIntensity: 0.3 });
    const aimGeo = new THREE.PlaneGeometry(AIM_W, AIM_LEN).rotateX(-Math.PI / 2).translate(0, 0, AIM_LEN / 2);
    const aimMat = new THREE.MeshBasicMaterial({ map: aimTexture(), color: 0xfff6dc, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });

    BL_TABLES.forEach((t, ti) => {
      const root = new THREE.Group();
      root.position.set(t.x, 0, t.z);
      const balls = new THREE.InstancedMesh(ballGeo, ballMat, 16);
      balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      balls.frustumCulled = false;
      const shadows = new THREE.InstancedMesh(shadowGeo, shadowMat, 16);
      shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      shadows.frustumCulled = false;
      shadows.renderOrder = 2;
      const cueMesh = new THREE.Mesh(cue, cueMat);
      cueMesh.rotation.order = 'YXZ';
      cueMesh.visible = false;
      const aim = new THREE.Mesh(aimGeo, aimMat);
      aim.visible = false;
      aim.renderOrder = 3;
      const sign = new TableSign('billiards', ti * 1.7, SIGN_W);
      sign.place(0, SIGN_Y, 0);
      sign.set(DEFAULT_SIGN);
      root.add(balls, shadows, cueMesh, aim, sign.sprite);
      this.group.add(root);
      // номера смотрят вверх, каждый шар повёрнут по-своему
      const q = Array.from({ length: 16 }, (_, i) => {
        const up = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
        return up.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((i * 137.5 + ti * 61) % 360) * (Math.PI / 180)));
      });
      const tv: TableVis = {
        root, balls, shadows, cue: cueMesh, aim, sign,
        x: new Float32Array(16), z: new Float32Array(16), on: new Array<boolean>(16).fill(false), q,
        drop: new Float32Array(16).fill(-1), dropFrom: new Float32Array(32), dropTo: new Float32Array(32), dropping: false, inited: false,
        cueOn: false, cueAng: 0, cuePull: 0, aimOn: false, aimAng: 0,
      };
      this.tables.push(tv);
      this.writeBalls(tv);
    });

    scene.add(this.group);
  }

  /** Флаг BILLIARDS: зал виден, только когда включён. */
  setVisible(on: boolean): void {
    this.group.visible = on;
  }

  /**
   * Шары стола t: pos — [x, z] × 16 в осях стола, бит i в on — шар i на столе. snap — поставить как есть;
   * иначе сдвинутый шар поворачивается, будто прокатился, а снятый со стола скатывается в ближайшую лузу.
   */
  setBalls(t: number, pos: ArrayLike<number>, on: number, snap = false): void {
    const tb = this.tables[t];
    if (!tb) return;
    const first = !tb.inited;
    tb.inited = true;
    for (let i = 0; i < 16; i++) {
      const isOn = (on & (1 << i)) !== 0;
      if (isOn) {
        const nx = pos[2 * i] ?? 0;
        const nz = pos[2 * i + 1] ?? 0;
        tb.drop[i] = -1;
        if (!first && !snap && tb.on[i]) {
          const dx = nx - tb.x[i];
          const dz = nz - tb.z[i];
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > 1e-7 && d < ROLL_MAX_STEP) {
            // качение без проскальзывания: ось — поперёк движения, угол — путь / радиус
            _q.setFromAxisAngle(_ax.set(dz / d, 0, -dx / d), d / BL_R);
            tb.q[i].premultiply(_q).normalize();
          }
        }
        tb.x[i] = nx;
        tb.z[i] = nz;
        tb.on[i] = true;
      } else if (tb.on[i]) {
        tb.on[i] = false;
        if (!first && !snap) this.startDrop(tb, i);
      }
    }
    this.writeBalls(tb);
    this.placeCue(tb);
    this.placeAim(tb);
  }

  /** Кий стола t за битком по направлению удара ang (0 — к +z, π/2 — к +x); pull 0…1 — насколько оттянут. */
  setCue(t: number, visible: boolean, ang: number, pull: number): void {
    const tb = this.tables[t];
    if (!tb) return;
    tb.cueOn = visible;
    tb.cueAng = ang;
    tb.cuePull = Number.isFinite(pull) ? Math.min(1, Math.max(0, pull)) : 0;
    this.placeCue(tb);
  }

  /** Короткая линия прицела от битка по направлению ang (не траектория — только направление). */
  setAim(t: number, visible: boolean, ang: number): void {
    const tb = this.tables[t];
    if (!tb) return;
    tb.aimOn = visible;
    tb.aimAng = ang;
    this.placeAim(tb);
  }

  /** Табличка над столом t. */
  setSign(t: number, m: SignModel): void {
    this.tables[t]?.sign.set(m);
  }

  update(dt: number, time: number, camPos: THREE.Vector3): void {
    if (!this.group.visible) return;
    for (const tb of this.tables) {
      tb.sign.update(time, camPos);
      if (tb.dropping) this.stepDrops(tb, dt);
    }
  }

  /** Середина сукна стола t в мире. */
  tableCenter(t: number): THREE.Vector3 {
    const c = BL_TABLES[t] ?? BL_TABLES[0];
    return new THREE.Vector3(c.x, BL_SURFACE_Y, c.z);
  }

  // ------------------------------------------------------------ внутреннее

  private startDrop(tb: TableVis, i: number): void {
    const x = tb.x[i];
    const z = tb.z[i];
    let best = HOLES[0];
    let bd = Infinity;
    for (const h of HOLES) {
      const d = (h.x - x) ** 2 + (h.z - z) ** 2;
      if (d < bd) { bd = d; best = h; }
    }
    tb.drop[i] = 0;
    tb.dropFrom[2 * i] = x;
    tb.dropFrom[2 * i + 1] = z;
    tb.dropTo[2 * i] = best.x;
    tb.dropTo[2 * i + 1] = best.z;
    tb.dropping = true;
  }

  private stepDrops(tb: TableVis, dt: number): void {
    let any = false;
    for (let i = 0; i < 16; i++) {
      if (tb.drop[i] < 0) continue;
      tb.drop[i] += dt;
      if (tb.drop[i] >= DROP_S) tb.drop[i] = -1;
      else any = true;
    }
    tb.dropping = any;
    this.writeBalls(tb);
  }

  private writeBalls(tb: TableVis): void {
    for (let i = 0; i < 16; i++) {
      if (tb.on[i]) {
        tb.balls.setMatrixAt(i, _m.compose(_p.set(tb.x[i], BALL_Y, tb.z[i]), tb.q[i], ONE));
        tb.shadows.setMatrixAt(i, _m.compose(_p.set(tb.x[i], Y + 0.0008, tb.z[i]), _q.identity(), ONE));
      } else if (tb.drop[i] >= 0) {
        // скатывается к центру дыры и уходит вниз — быстрее, чем успевает задеть край сукна
        const p = tb.drop[i] / DROP_S;
        const k = 1 - (1 - Math.min(1, p * 1.7)) ** 2;
        const x = tb.dropFrom[2 * i] + (tb.dropTo[2 * i] - tb.dropFrom[2 * i]) * k;
        const z = tb.dropFrom[2 * i + 1] + (tb.dropTo[2 * i + 1] - tb.dropFrom[2 * i + 1]) * k;
        tb.balls.setMatrixAt(i, _m.compose(_p.set(x, BALL_Y - DROP_DEPTH * p * p, z), tb.q[i], ONE));
        tb.shadows.setMatrixAt(i, _m.compose(_p.set(x, Y + 0.0008, z), _q.identity(), _s.setScalar(Math.max(0, 1 - p * 3))));
      } else {
        _m.compose(ZERO, _q.identity(), ZERO);
        tb.balls.setMatrixAt(i, _m);
        tb.shadows.setMatrixAt(i, _m);
      }
    }
    tb.balls.instanceMatrix.needsUpdate = true;
    tb.shadows.instanceMatrix.needsUpdate = true;
  }

  private placeCue(tb: TableVis): void {
    const show = tb.cueOn && tb.on[0];
    tb.cue.visible = show;
    if (!show) return;
    const dx = Math.sin(tb.cueAng);
    const dz = Math.cos(tb.cueAng);
    const bx = tb.x[0];
    const bz = tb.z[0];
    const back = BL_R + CUE_GAP0 + (CUE_GAP1 - CUE_GAP0) * tb.cuePull;
    // наклон: комель приподнят на 6°, а если позади битка близко борт или шар — круче, чтобы кий прошёл над ними
    let tan = Math.tan(CUE_TILT);
    const ux = -dx;
    const uz = -dz;
    const tx = ux > 1e-6 ? (BL_HX - bx) / ux : ux < -1e-6 ? (-BL_HX - bx) / ux : Infinity;
    const tz = uz > 1e-6 ? (BL_HZ - bz) / uz : uz < -1e-6 ? (-BL_HZ - bz) / uz : Infinity;
    const toRail = Math.min(tx, tz) - back;
    const clear = (s: number, h: number): void => {
      tan = Math.max(tan, s > 0.02 ? h / s : Math.tan(CUE_TILT_MAX));
    };
    clear(toRail, RAIL_TOP + 0.012 - BALL_Y);
    for (let j = 1; j < 16; j++) {
      if (!tb.on[j]) continue;
      const rx = tb.x[j] - bx;
      const rz = tb.z[j] - bz;
      const along = rx * ux + rz * uz;
      const perp = Math.abs(rx * uz - rz * ux);
      if (along > 0 && perp < BL_R + 0.016) clear(along - back - BL_R * 0.5, 2 * BL_R + 0.012);
    }
    const tilt = Math.min(CUE_TILT_MAX, Math.atan(tan));
    tb.cue.position.set(bx - dx * back, BALL_Y + 0.003, bz - dz * back);
    tb.cue.rotation.set(tilt, tb.cueAng, 0, 'YXZ');
  }

  private placeAim(tb: TableVis): void {
    const show = tb.aimOn && tb.on[0];
    tb.aim.visible = show;
    if (!show) return;
    const d = BL_R + 0.006;
    tb.aim.position.set(tb.x[0] + Math.sin(tb.aimAng) * d, Y + 0.0015, tb.z[0] + Math.cos(tb.aimAng) * d);
    tb.aim.rotation.set(0, tb.aimAng, 0);
  }
}
