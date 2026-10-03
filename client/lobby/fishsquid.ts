// Дальневосточный кальмар — «царь морей» (вид kalmar, форма squid): модель кодом, в осях fishart.ts — длина вдоль X,
// кончик мантии — к +X (кальмар плывёт мантией вперёд), спина — +Y, вся длина со щупальцами ≈ 1.
// Мантия-торпеда с ромбом плавников, голова с большими глазами (блик в зрачке — добрый, не страшный), 8 рук и 2 длинных
// ловчих щупальца с булавами, присоски намёком. Окрас красно-бурый в точках-хроматофорах, брюхо светлое, по краю —
// перелив тонкой плёнки (розовый → сиреневый → бирюзовый) и светлая кайма; плавники полупрозрачные.
// Анимация — в вершинном шейдере, без лишних проходов и костей: руки и щупальца колышутся волной от основания к кончику,
// мантия «дышит», края плавников волнуются. Часы — одна uniform на всех кальмаров (тикает в onBeforeRender).
import * as THREE from 'three';

/** Анимация вершины: волна руки (0 у основания…1 у кончика), фаза руки, «дыхание» мантии, волна плавника */
type Anim = readonly [number, number, number, number];
/** Вид вершины: доля точек-хроматофоров, сила перелива по краю */
type Look = readonly [number, number];

const C = {
  back: 0xb3452c,
  dark: 0x87301f,
  belly: 0xf4cdbd,
  head: 0xbf5335,
  arm: 0xb0472f,
  armIn: 0xf2c3b0,
  tip: 0xe7957e,
  sucker: 0xfff1e8,
  fin: 0xbb4c32,
  finEdge: 0xf7b19b,
  eye: 0xeadaa8,
  iris: 0xc98f3a,
  pupil: 0x15161f,
  shine: 0xffffff,
} as const;

const STILL: Anim = [0, 0, 0, 0];
const PLAIN: Look = [0, 0.35];

// ------------------------------------------------------------ сборка геометрии

/** Набор вершин одной геометрии: позиция, цвет (с альфой — у плавников), анимация, вид; треугольники — индексами. */
class Build {
  readonly pos: number[] = [];
  readonly col: number[] = [];
  readonly anim: number[] = [];
  readonly look: number[] = [];
  readonly idx: number[] = [];
  private readonly alpha: boolean;

  constructor(alpha: boolean) {
    this.alpha = alpha;
  }

  get count(): number {
    return this.pos.length / 3;
  }

  v(x: number, y: number, z: number, c: THREE.Color, a: number, an: Anim, lk: Look): number {
    this.pos.push(x, y, z);
    if (this.alpha) this.col.push(c.r, c.g, c.b, a);
    else this.col.push(c.r, c.g, c.b);
    this.anim.push(an[0], an[1], an[2], an[3]);
    this.look.push(lk[0], lk[1]);
    return this.count - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, this.alpha ? 4 : 3));
    g.setAttribute('aAnim', new THREE.Float32BufferAttribute(this.anim, 4));
    g.setAttribute('aLook', new THREE.Float32BufferAttribute(this.look, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

const _c = new THREE.Color();
const _t = new THREE.Vector3();
const _b = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * Трубка по точкам пути: сечение — эллипс (ra вдоль «верха» рамки, rb поперёк), рамка переносится вдоль пути от up0
 * (угол 0 — сторона up0). Конец — остриём в точку; start — закрыть и начало (иначе оно спрятано в голове).
 */
function tube(
  b: Build, pts: readonly THREE.Vector3[], up0: THREE.Vector3, m: number,
  rad: (i: number) => readonly [number, number],
  paint: (i: number, ang: number, out: THREE.Color) => number,
  anim: (i: number) => Anim,
  look: (i: number, ang: number) => Look,
  start = false,
): void {
  const n = pts.length;
  const first = b.count;
  const frameN = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const z = pts[Math.min(n - 1, i + 1)];
    _t.subVectors(z, a).normalize();
    if (i === 0) frameN.copy(up0);
    // перенос рамки: убрать из прошлой нормали составляющую вдоль пути
    frameN.addScaledVector(_t, -frameN.dot(_t)).normalize();
    _b.crossVectors(_t, frameN);
    const [ra, rb] = rad(i);
    for (let j = 0; j < m; j++) {
      const ang = (j / m) * Math.PI * 2;
      _p.copy(pts[i]).addScaledVector(frameN, Math.cos(ang) * ra).addScaledVector(_b, Math.sin(ang) * rb);
      const al = paint(i, ang, _c);
      b.v(_p.x, _p.y, _p.z, _c, al, anim(i), look(i, ang));
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < m; j++) {
      const j1 = (j + 1) % m;
      const a0 = first + i * m + j;
      const a1 = first + i * m + j1;
      const b0 = a0 + m;
      const b1 = a1 + m;
      b.tri(a0, a1, b0);
      b.tri(a1, b1, b0);
    }
  }
  // остриё: кончик чуть дальше последнего кольца
  const last = pts[n - 1];
  _t.subVectors(last, pts[n - 2]).normalize();
  const tipR = rad(n - 1)[0];
  const al = paint(n - 1, 0, _c);
  const tip = b.v(last.x + _t.x * tipR, last.y + _t.y * tipR, last.z + _t.z * tipR, _c, al, anim(n - 1), look(n - 1, 0));
  const lr = first + (n - 1) * m;
  for (let j = 0; j < m; j++) b.tri(lr + j, lr + ((j + 1) % m), tip);
  if (start) {
    _t.subVectors(pts[1], pts[0]).normalize();
    const r0 = rad(0)[0];
    const s0 = paint(0, Math.PI, _c);
    const cap = b.v(pts[0].x - _t.x * r0 * 0.3, pts[0].y - _t.y * r0 * 0.3, pts[0].z - _t.z * r0 * 0.3, _c, s0, anim(0), look(0, Math.PI));
    for (let j = 0; j < m; j++) b.tri(first + j, cap, first + ((j + 1) % m));
  }
}

/** Эллипсоид-«шарик» (глаза, присоски, голова) из широт и долгот. */
function blob(
  b: Build, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: number | THREE.Color,
  an: Anim, lk: Look, seg = 10, rings = 7,
): void {
  const first = b.count;
  const col = color instanceof THREE.Color ? color : _c.setHex(color);
  const c2 = col.clone();
  for (let i = 0; i <= rings; i++) {
    const th = (i / rings) * Math.PI;
    for (let j = 0; j < seg; j++) {
      const ph = (j / seg) * Math.PI * 2;
      b.v(cx + rx * Math.sin(th) * Math.cos(ph), cy + ry * Math.cos(th), cz + rz * Math.sin(th) * Math.sin(ph), c2, 1, an, lk);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      const a0 = first + i * seg + j;
      const a1 = first + i * seg + j1;
      b.tri(a0, a1, a0 + seg);
      b.tri(a1, a1 + seg, a0 + seg);
    }
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (b === a ? 1 : (x - a) / (b - a))));
  return t * t * (3 - 2 * t);
}

// ------------------------------------------------------------ части

/** Мантия: от воротника x 0,035 к кончику x 0,455; радиус и сечение (чуть выше, чем шире — нет: чуть шире). */
const MX0 = 0.035;
const MX1 = 0.455;
function mantleR(s: number): number {
  return 0.072 * Math.pow(Math.max(0, 1 - Math.pow(s, 2.4)), 0.55) * (0.9 + 0.1 * smooth(0, 0.18, s));
}

function mantle(b: Build): void {
  const n = 30;
  // два кольца до воротника — закруглённая кромка мантии, а не срез трубы
  const LIP = 2;
  const pts: THREE.Vector3[] = [new THREE.Vector3(MX0 - 0.007, 0, 0), new THREE.Vector3(MX0 - 0.004, 0, 0)];
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * 0.985;
    pts.push(new THREE.Vector3(MX0 + (MX1 - MX0) * s, 0, 0));
  }
  const back = new THREE.Color(C.back);
  const dark = new THREE.Color(C.dark);
  const belly = new THREE.Color(C.belly);
  const sOf = (i: number) => (Math.max(0, i - LIP) / (n - 1)) * 0.985;
  tube(b, pts, new THREE.Vector3(0, 1, 0), 24,
    (i) => {
      const r = mantleR(sOf(i)) * (i === 0 ? 0.8 : i === 1 ? 0.95 : 1);
      return [r * 0.97, r * 1.03];
    },
    (i, ang, out) => {
      const up = Math.cos(ang);
      out.copy(belly).lerp(back, smooth(-0.45, 0.35, up));
      // тёмная полоса по спине и чуть темнее к кончику
      if (up > 0.6) out.lerp(dark, smooth(0.6, 0.97, up) * 0.75);
      out.lerp(dark, smooth(0.7, 1, sOf(i)) * 0.25 * Math.max(0, up));
      return 1;
    },
    (i) => {
      const s = sOf(i);
      return [0, 0, smooth(0.02, 0.2, s) * (1 - smooth(0.62, 0.95, s)), 0];
    },
    (i, ang) => [Math.max(0, Math.min(1, 0.25 + Math.cos(ang) * 0.95)) * (1 - smooth(0.9, 1, sOf(i)) * 0.5), 1],
    true,
  );
}

/** Ромб плавников у кончика мантии: тонкие, полупрозрачные, края волнуются. */
function fins(f: Build): void {
  const K = 12;
  const J = 5;
  const s0 = 0.45;
  const base = new THREE.Color(C.fin);
  const edge = new THREE.Color(C.finEdge);
  for (const side of [1, -1]) {
    const first = f.count;
    for (let k = 0; k <= K; k++) {
      const u = k / K;
      const s = s0 + (1 - s0) * u;
      const x = MX0 + (MX1 - MX0) * s;
      const zi = mantleR(Math.min(0.985, s)) * 0.98;
      // ромб: шире всего на 40 % длины плавника, к кончику мантии сходится в точку
      const zo = u < 0.4 ? zi + (0.15 - zi) * smooth(0, 1, Math.pow(u / 0.4, 0.8)) : 0.15 * Math.pow(1 - (u - 0.4) / 0.6, 0.9);
      const width = Math.max(zo, zi);
      for (let j = 0; j <= J; j++) {
        const v = j / J;
        const z = zi + (width - zi) * v;
        // край плавника чуть загнут вверх и тоньше по цвету
        const y = 0.006 + 0.014 * v * v - 0.004 * u;
        _c.copy(base).lerp(edge, smooth(0.1, 1, v) * 0.85);
        const alpha = 0.97 - 0.42 * smooth(0.2, 1, v);
        f.v(x, y, z * side, _c, alpha, [0, 0, 0, Math.pow(v, 1.4)], [0.35 * (1 - v), 0.8]);
      }
    }
    for (let k = 0; k < K; k++) {
      for (let j = 0; j < J; j++) {
        const a0 = first + k * (J + 1) + j;
        const a1 = a0 + 1;
        const b0 = a0 + J + 1;
        const b1 = b0 + 1;
        // обход — так, чтобы лицевая сторона у обоих плавников смотрела вверх
        if (side > 0) {
          f.tri(a0, a1, b0);
          f.tri(a1, b1, b0);
        } else {
          f.tri(a0, b0, a1);
          f.tri(a1, b0, b1);
        }
      }
    }
  }
}

/** Голова с большими глазами (золотисто-серебряный белок, тёмный зрачок с бликом) и воронка снизу. */
function head(b: Build): void {
  const headC = new THREE.Color(C.head);
  blob(b, -0.004, 0.002, 0, 0.054, 0.05, 0.056, headC, STILL, [0.55, 0.9], 14, 10);
  for (const s of [1, -1]) {
    const ex = -0.01;
    const ey = 0.016;
    const ez = 0.046 * s;
    // белок, тонкое золотое кольцо, большой зрачок, два блика — глаз добрый, «мультяшный»
    blob(b, ex, ey, ez, 0.03, 0.03, 0.022, C.eye, STILL, [0, 0.25], 16, 10);
    blob(b, ex - 0.002, ey, ez + 0.0095 * s, 0.0215, 0.0215, 0.0145, C.iris, STILL, [0, 0.2], 16, 10);
    blob(b, ex - 0.0025, ey - 0.0005, ez + 0.0115 * s, 0.019, 0.019, 0.0135, C.pupil, STILL, [0, 0.1], 16, 10);
    blob(b, ex - 0.0095, ey + 0.0085, ez + 0.0235 * s, 0.0058, 0.0058, 0.003, C.shine, STILL, [0, 0], 8, 5);
    blob(b, ex + 0.004, ey - 0.0065, ez + 0.0235 * s, 0.0026, 0.0026, 0.0015, C.shine, STILL, [0, 0], 6, 4);
  }
  // воронка (сифон) под головой
  const pts = [new THREE.Vector3(0.028, -0.036, 0), new THREE.Vector3(0.005, -0.043, 0), new THREE.Vector3(-0.022, -0.047, 0)];
  const belly = new THREE.Color(C.belly).lerp(new THREE.Color(C.head), 0.35);
  tube(b, pts, new THREE.Vector3(0, 1, 0), 10, (i) => [0.013 - i * 0.002, 0.012 - i * 0.0015],
    (_i, _a, out) => { out.copy(belly); return 1; }, () => STILL, () => PLAIN);
}

/** Восемь рук венчиком и два ловчих щупальца с булавами; присоски — бусинками с внутренней стороны. */
function arms(b: Build): void {
  const armC = new THREE.Color(C.arm);
  const inC = new THREE.Color(C.armIn);
  const tipC = new THREE.Color(C.tip);
  const sucker = new THREE.Color(C.sucker);
  const X0 = -0.024;
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    const dy = Math.cos(a);
    const dz = Math.sin(a);
    // спинные руки короче брюшных
    const L = 0.17 + 0.05 * (1 - dy) / 2;
    const K = 13;
    const phase = i * 1.73 + 0.4;
    const pts: THREE.Vector3[] = [];
    const radAt: number[] = [];
    for (let k = 0; k <= K; k++) {
      const t = k / K;
      const spread = 0.026 + 0.042 * Math.sin(Math.min(1, t * 1.2) * Math.PI / 2) - 0.016 * t * t * t;
      // кончики чуть закручены наружу и вниз — мультяшный «венчик»
      pts.push(new THREE.Vector3(X0 - L * t, dy * spread - 0.012 * t * t, dz * spread));
      radAt.push(0.0158 * Math.pow(1 - 0.86 * t, 1.1) + 0.0012);
    }
    const out = new THREE.Vector3(0, dy, dz);
    tube(b, pts, out, 9, (k) => [radAt[k], radAt[k] * 1.15],
      (k, ang, o) => {
        const t = k / K;
        o.copy(inC).lerp(armC, smooth(-0.35, 0.45, Math.cos(ang)));
        o.lerp(tipC, smooth(0.65, 1, t) * 0.55);
        return 1;
      },
      (k) => [Math.pow(k / K, 1.3), phase, 0, 0],
      (k, ang) => [Math.max(0, Math.cos(ang)) * 0.85 * (1 - k / K * 0.6), 0.75],
    );
    // присоски: два ряда вдоль внутренней стороны
    for (let k = 2; k <= K - 2; k++) {
      const t = k / K;
      const p = pts[k];
      const r = radAt[k];
      const side = k % 2 ? 0.45 : -0.45;
      // внутрь — к оси венчика (−dy, −dz), вбок — поперёк руки (−dz, dy)
      const inw = Math.cos(side) * r * 0.95;
      const lat = Math.sin(side) * r * 0.95;
      blob(b, p.x, p.y - dy * inw - dz * lat, p.z - dz * inw + dy * lat, r * 0.42, r * 0.42, r * 0.42,
        sucker, [Math.pow(t, 1.3), phase, 0, 0], [0, 0.2], 6, 4);
    }
  }
  // ловчие щупальца: между брюшными руками, длинные, с булавами
  for (const s of [1, -1]) {
    const a = Math.PI + 0.42 * s;
    const dy = Math.cos(a);
    const dz = Math.sin(a);
    const L = 0.53;
    const K = 26;
    const phase = 2.6 + s * 1.1;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= K; k++) {
      const t = k / K;
      const spread = 0.018 + 0.03 * Math.sin(t * Math.PI / 2);
      pts.push(new THREE.Vector3(X0 - L * t, dy * spread + 0.012 * Math.sin(t * Math.PI * 1.4) - 0.01 * t, dz * spread));
    }
    const CLUB = 0.78;
    const out = new THREE.Vector3(0, dy, dz);
    const rad = (k: number): readonly [number, number] => {
      const t = k / K;
      if (t < CLUB) return [0.0064 - 0.0018 * t, 0.0064 - 0.0018 * t];
      const u = (t - CLUB) / (1 - CLUB);
      const bump = Math.sin(Math.PI * Math.min(1, u * 1.05));
      return [0.005 + 0.0045 * bump, 0.005 + 0.0135 * Math.pow(Math.max(0, bump), 0.8)];
    };
    tube(b, pts, out, 9, rad,
      (k, ang, o) => {
        const t = k / K;
        o.copy(inC).lerp(armC, smooth(-0.35, 0.45, Math.cos(ang)));
        if (t > CLUB) o.lerp(tipC, 0.35);
        return 1;
      },
      (k) => [1.45 * Math.pow(k / K, 1.15), phase, 0, 0],
      (k, ang) => [Math.max(0, Math.cos(ang)) * 0.8, 0.8 * (k / K > CLUB ? 1 : 0.7)],
    );
    // присоски булавы: три ряда по внутренней стороне
    for (let k = Math.ceil(CLUB * K) + 1; k < K - 1; k++) {
      const t = k / K;
      const [ra, rb] = rad(k);
      for (const w of [-0.6, 0, 0.6]) {
        const p = pts[k];
        blob(b, p.x, p.y - dy * ra * 0.85 - dz * w * rb, p.z - dz * ra * 0.85 + dy * w * rb, 0.0032, 0.0032, 0.0032,
          sucker, [1.45 * Math.pow(t, 1.15), phase, 0, 0], [0, 0.2], 6, 4);
      }
    }
  }
}

// ------------------------------------------------------------ материалы

const U = { uSqTime: { value: 0 } };

const VERT_PARS = /* glsl */ `
attribute vec4 aAnim;
attribute vec2 aLook;
uniform float uSqTime;
varying vec3 vSqObj;
varying vec2 vSqLook;
`;

const VERT_MOVE = /* glsl */ `
vSqObj = position;
vSqLook = aLook;
{
  float sqW = aAnim.x;
  float sqT = uSqTime;
  // руки и щупальца: волна от основания к кончику, у каждой руки своя фаза
  transformed.y += sqW * 0.034 * sin(sqT * 1.7 + aAnim.y - sqW * 4.2);
  transformed.z += sqW * 0.028 * cos(sqT * 1.3 + aAnim.y * 1.37 - sqW * 3.6);
  transformed.x += sqW * 0.012 * sin(sqT * 0.9 + aAnim.y);
  // мантия дышит
  transformed.yz *= 1.0 + aAnim.z * 0.05 * sin(sqT * 2.4);
  // края плавников волнуются
  transformed.y += aAnim.w * 0.022 * sin(sqT * 3.2 + position.x * 22.0);
}
`;

const FRAG_PARS = /* glsl */ `
uniform float uSqTime;
varying vec3 vSqObj;
varying vec2 vSqLook;
float sqHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
`;

/** Точки-хроматофоры: тёмные пятнышки разного размера по спине и рукам */
const FRAG_SPOTS = /* glsl */ `
{
  vec3 sqQ = vSqObj * 58.0;
  vec3 sqI = floor(sqQ);
  vec3 sqF = fract(sqQ) - 0.5;
  vec3 sqJ = vec3(sqHash(sqI), sqHash(sqI + 3.1), sqHash(sqI + 7.7)) - 0.5;
  float sqD = length(sqF - sqJ * 0.45);
  float sqS = 0.15 + 0.16 * sqHash(sqI + 11.3);
  float sqSpot = (1.0 - smoothstep(sqS, sqS + 0.1, sqD)) * step(0.3, sqHash(sqI + 5.3));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.6, 0.33, 0.28), sqSpot * vSqLook.x);
}
`;

/** Перелив по краю (тонкая плёнка) и светлая кайма — край кажется полупрозрачным */
const FRAG_SHEEN = /* glsl */ `
{
  float sqNv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float sqFr = pow(1.0 - sqNv, 2.3);
  vec3 sqIr = 0.5 + 0.5 * cos(6.28318 * (sqFr * 0.9 + vSqObj.x * 0.8 + vec3(0.0, 0.33, 0.67) + uSqTime * 0.04));
  totalEmissiveRadiance += (sqIr * 0.55 + vec3(0.32, 0.2, 0.24)) * sqFr * vSqLook.y * 0.6;
}
`;

function squidShader(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSqTime = U.uSqTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_MOVE}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_SPOTS}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAG_SHEEN}`);
  };
  m.customProgramCacheKey = () => `squid1-${m.transparent ? 't' : 'o'}`;
  return m;
}

let mats: { body: THREE.MeshStandardMaterial; fins: THREE.MeshStandardMaterial } | null = null;

/** Материалы кальмара (общие на всех): тело и полупрозрачные плавники. */
export function squidMaterials(): { body: THREE.MeshStandardMaterial; fins: THREE.MeshStandardMaterial } {
  mats ??= {
    body: squidShader(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.04 })),
    fins: squidShader(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.3, metalness: 0.02, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    })),
  };
  return mats;
}

/** Часы анимации кальмаров: ставится в onBeforeRender их мешей (дёшево — одно число на кадр). */
export function tickSquid(): void {
  U.uSqTime.value = (performance.now() / 1000) % 3600;
}

/** Остановить или задать время анимации (снимок для картинки — всегда в одной позе). */
export function setSquidTime(t: number): void {
  U.uSqTime.value = t;
}

/**
 * Геометрия кальмара длиной ≈ 1: тело (в parts — как у остальных форм fishart.ts) и плавники отдельно (их и
 * возвращаем — рисуются полупрозрачными, как стекло бутылки).
 */
export function squidGeometry(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const body = new Build(false);
  mantle(body);
  head(body);
  arms(body);
  const fin = new Build(true);
  fins(fin);
  parts.push(body.geometry());
  return fin.geometry();
}
