// Помехи «Солнечного серпантина» и переезд: железнодорожный шлагбаум с мигалкой (на любой трассе — вместо пресса),
// круглый тюк сена на верёвках с деревянной П-рамы над улицей, прямоугольные тюки сена и красно-белые стопки шин.
// Движение — функции времени гонки rt, те же, что у физики (shared/hazards.ts): у всех одинаково и плавно на дробном
// rt. Кадр — без выделений памяти: векторы, кватернионы и цвета заготовлены, циклы по индексам.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TICK_RATE } from '../../shared/constants.ts';
import { GATE_WARN, gateTime, swingU, type Mover, type Solid } from '../../shared/hazards.ts';
import { makeRng } from '../../shared/math.ts';
import { locateAny, makeLoc, type Track, type TrackLoc } from '../../shared/track.ts';
import { buildGeo, glowSprite, paint, parts, staticMesh, type GeoParts, type V3 } from '../render/kit.ts';
import { softDot } from '../render/textures.ts';
import { face } from './geom.ts';

/** Что нужно помехам от мира */
export interface PropCtx {
  scene: THREE.Scene;
  /** Статика с вершинными цветами: мир склеит её в один меш с тенями */
  solid: THREE.BufferGeometry[];
  tr: Track;
  /** Пол под точкой: дорога, настил или земля */
  floor(x: number, z: number): number;
}

const TAU = Math.PI * 2;
const RED = 0xe0362c;
const PAINT = 0xf7f4ec;
const STEEL = 0x50555c;
const IRON = 0x2b2d31;
const PLATE = 0x1d1f23;
const CONCRETE = 0xbdb7ab;
const WOOD = 0xb07a45;
const WOOD_DARK = 0x8e5c30;
const STONE = 0xa39b8e;
const ROOF = 0xc9563d;
const ROPE = 0x7b4c27;

// ------------------------------------------------------------ шлагбаум: время

/** Стрела поднята */
const UP_A = Math.PI / 2;
/** Падение — последние 0,4 с предупреждения; подъём после открытия — 0,5 с */
const FALL_T = 0.4 * TICK_RATE;
const RISE_T = 0.5 * TICK_RATE;
/**
 * Падение по долям от 0,4 с: разгон до упора, отскок на ~9°, ещё на ~2°, к концу — лежит. Ускорение на всех участках
 * одно (~80 рад/с²), отскок гасит ~2/3 скорости — как тяжёлая стрела на резиновом упоре.
 */
const DROP = 0.5;
const HOP1 = 0.3;
const HOP2 = 0.14;
const HOP1_A = 0.15;
const HOP2_A = 0.03;
/** Подъём «с перелётом» за вертикаль на ~5° (easeOutBack) */
const RISE_BACK = 1.2;
/** Мигалка: тиков на полный цикл двух ламп (каждая ~2,3 раза в секунду) */
const FLASH_T = 26;

/** Падение стрелы: q 0…1 за последние 0,4 с предупреждения → угол над горизонтом */
function boomFall(q: number): number {
  if (q < DROP) {
    const k = q / DROP;
    return UP_A * (1 - k * k);
  }
  let r = q - DROP;
  if (r < HOP1) {
    const k = r / HOP1;
    return HOP1_A * 4 * k * (1 - k);
  }
  r -= HOP1;
  if (r < HOP2) {
    const k = r / HOP2;
    return HOP2_A * 4 * k * (1 - k);
  }
  return 0;
}

/** Подъём: быстро трогается, у вертикали чуть перелетает и садится */
function boomRise(q: number): number {
  const k = q - 1;
  return UP_A * (1 + (RISE_BACK + 1) * k * k * k + RISE_BACK * k * k);
}

/**
 * Угол стрелы над горизонтом в момент rt (можно дробный): π/2 — поднята, 0 — лежит поперёк. Фазы — как у физики
 * (gatePhase): лежит ровно тогда, когда твёрдая; падает последние 0,4 с предупреждения; поднимается, когда открылось.
 */
export function boomAngle(m: Mover, rt: number): number {
  const t = gateTime(m, rt);
  const w1 = m.period * 0.45 + GATE_WARN;
  if (t >= w1) return 0;
  const f = t - (w1 - FALL_T);
  if (f >= 0) return boomFall(f / FALL_T);
  // в первом цикле гонки стрела ещё не лежала — подниматься нечему
  if (t < RISE_T && rt + m.phase >= m.period) return boomRise(t / RISE_T);
  return UP_A;
}

/** Яркость двух ламп 0…1: мигают попеременно с начала предупреждения, пока стрела опущена */
export function lampLevels(m: Mover, rt: number, out: { a: number; b: number }): void {
  const t = gateTime(m, rt);
  const w0 = m.period * 0.45;
  if (t < w0) {
    out.a = 0;
    out.b = 0;
    return;
  }
  // синус ×3 с обрезкой: лампа вспыхивает и гаснет за ~1,5 тика, но не щелчком
  const s = Math.sin((TAU * (t - w0)) / FLASH_T) * 3;
  out.a = s > 1 ? 1 : s > 0 ? s : 0;
  out.b = s < -1 ? 1 : s < 0 ? -s : 0;
}

// ------------------------------------------------------------ общее

const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _col = new THREE.Color();
const _mat = new THREE.Matrix4();
const _lv = { a: 0, b: 0 };

type Put = (g: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => void;

/** Статика в своей рамке: frame переводит локальные координаты в мир; y — мировая высота */
function framePut(out: THREE.BufferGeometry[], frame: THREE.Matrix4): Put {
  return (g, color, x, y, z) => {
    g.translate(x, y, z);
    g.applyMatrix4(frame);
    out.push(paint(g, color));
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function canvasTexture(c: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Тень-полоса под лежащей стрелой: мягкие длинные края и мягкие концы */
function stripShadowTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 32;
  const [c, ctx] = canvas(W, H);
  const img = ctx.createImageData(W, H);
  const sm = (k: number): number => k * k * (3 - 2 * k);
  for (let y = 0; y < H; y++) {
    const v = sm(1 - Math.abs(((y + 0.5) / H) * 2 - 1));
    for (let x = 0; x < W; x++) {
      const u = sm(Math.min(1, Math.min(x + 0.5, W - x - 0.5) / (W * 0.14)));
      img.data[(y * W + x) * 4 + 3] = Math.round(255 * 0.42 * v * u);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c, false);
}

/** Торец круглого тюка: соломинки по кругу, спираль намотки, темнее к середине и у края */
function baleEndTexture(): THREE.CanvasTexture {
  const S = 256;
  const R = S / 2;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#c4953a';
  ctx.fillRect(0, 0, S, S);
  const g = ctx.createRadialGradient(R, R, 0, R, R, R);
  g.addColorStop(0, '#9c6f24');
  g.addColorStop(0.12, '#d6ab4a');
  g.addColorStop(0.68, '#eecb68');
  g.addColorStop(0.94, '#e3bb56');
  g.addColorStop(1, '#b4852c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(R, R, R, 0, TAU);
  ctx.fill();
  const rng = makeRng(611);
  for (let i = 0; i < 1500; i++) {
    const r = 8 + Math.sqrt(rng()) * (R - 11);
    const a = rng() * TAU;
    ctx.strokeStyle = rng() < 0.45 ? `rgba(140,96,28,${0.22 + rng() * 0.3})` : `rgba(255,238,165,${0.25 + rng() * 0.35})`;
    ctx.lineWidth = 1 + rng() * 1.3;
    ctx.beginPath();
    ctx.arc(R, R, r, a, a + (6 + rng() * 16) / r);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(112,74,22,0.55)';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  const turns = 6.5;
  for (let k = 0; k <= 1000; k++) {
    const q = k / 1000;
    const a = q * turns * TAU;
    const r = 9 + q * (R - 15);
    if (k === 0) ctx.moveTo(R + Math.cos(a) * r, R + Math.sin(a) * r);
    else ctx.lineTo(R + Math.cos(a) * r, R + Math.sin(a) * r);
  }
  ctx.stroke();
  return canvasTexture(c, true);
}

// ------------------------------------------------------------ шлагбаум

/** Ось стрелы над дорогой; высота стрелы у оси (к концу тоньше) и толщина; длина полосы */
const PIVOT_H = 1.1;
const BOOM_H = 0.3;
const BOOM_T = 0.16;
const STRIPE = 0.62;
/** Ось стрелы — за краем обочины (за стенкой); конец стрелы чуть не доходит до конца капсулы физики */
const POST_OUT = 0.85;
const TIP_IN = 0.06;
/** Корпус привода — перед стрелой, ближе к картам */
const HOUSING_Z = 0.3;
/** Мигалка и «андреевский крест»: высота над дорогой, разнос ламп */
const LAMP_H = 2.45;
const LAMP_DX = 0.27;
const CROSS_H = 3.25;
/** Цвета линзы в линейном пространстве: погашена — тёмно-вишнёвая, горит — чистый красный */
const LAMP_OFF = new THREE.Color(0.09, 0.012, 0.01);
const LAMP_ON = new THREE.Color(1, 0.035, 0.018);

interface GateVis {
  m: Mover;
  /** Стрела: начало координат — ось, X — от стойки к середине дороги */
  boom: THREE.Mesh;
  yaw: THREE.Quaternion;
  len: number;
  /** Ось стрелы на плане, направление к середине дороги, высота тени */
  px: number;
  pz: number;
  dx: number;
  dz: number;
  sy: number;
  shadow: THREE.Mesh;
  glowA: THREE.Sprite;
  glowB: THREE.Sprite;
}

/**
 * Переезд: у края дороги стойка с приводом, мигалкой из двух красных ламп и «андреевским крестом»; красно-белая
 * стрела от стойки до середины дороги (до конца капсулы физики). Мигалка — с начала предупреждения, последние 0,4 с
 * стрела падает с отскоком, лежит, пока шлагбаум твёрдый, и поднимается, когда открылся.
 */
export class CrossingGates {
  private readonly list: GateVis[] = [];
  private readonly lamps: THREE.InstancedMesh;

  constructor(c: PropCtx, gates: readonly Mover[]) {
    const boomMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05 });
    const shadowMat = new THREE.MeshBasicMaterial({
      map: stripShadowTexture(), color: 0x000000, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
    });
    const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const lens = new THREE.CylinderGeometry(0.15, 0.15, 0.04, 18).rotateX(Math.PI / 2);
    this.lamps = new THREE.InstancedMesh(lens, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), gates.length * 2);
    const loc = makeLoc();
    for (let k = 0; k < gates.length; k++) this.list.push(this.build(c, gates[k], k, loc, boomMat, shadowGeo, shadowMat));
    this.lamps.instanceMatrix.needsUpdate = true;
    this.lamps.computeBoundingSphere();
    c.scene.add(this.lamps);
  }

  private build(c: PropCtx, m: Mover, k: number, loc: TrackLoc, boomMat: THREE.Material, shadowGeo: THREE.BufferGeometry, shadowMat: THREE.Material): GateVis {
    locateAny(c.tr, m.cx, m.cz, loc);
    // стойка — у того края, к которому ближе капсула; стрела — до её дальнего конца
    const sd = loc.lat < 0 ? -1 : 1;
    const postLat = sd * (loc.hw + (sd < 0 ? loc.vl : loc.vr) + POST_OUT);
    const px = m.cx + m.ux * (postLat - loc.lat);
    const pz = m.cz + m.uz * (postLat - loc.lat);
    const len = Math.abs(postLat - (loc.lat - sd * (m.h + m.r - TIP_IN)));
    const road = c.floor(m.cx, m.cz);
    const ground = c.floor(px, pz);
    const pivotY = road + PIVOT_H;
    // рамка стойки: X — вправо по дороге, Z — навстречу картам (мигалка смотрит на них)
    const ry = Math.atan2(-m.uz, m.ux);
    const frame = new THREE.Matrix4().makeRotationY(ry).setPosition(px, 0, pz);
    const put = framePut(c.solid, frame);
    const zc = HOUSING_Z;
    // мачта чуть наружу от оси стрелы: поднятая стрела не сливается с ней
    const mx = sd * 0.16;
    // фундамент, корпус привода с красными поясом и крышкой, вал стрелы
    put(new THREE.BoxGeometry(0.8, 0.5, 0.78), CONCRETE, 0, ground - 0.03, zc);
    const hBot = Math.min(ground + 0.2, pivotY - 0.5);
    const hTop = pivotY + 0.3;
    put(new THREE.BoxGeometry(0.44, hTop - hBot, 0.36), PAINT, 0, (hTop + hBot) / 2, zc);
    put(new THREE.BoxGeometry(0.47, 0.12, 0.39), RED, 0, hBot + 0.3, zc);
    put(new THREE.BoxGeometry(0.5, 0.1, 0.42), RED, 0, hTop + 0.05, zc);
    put(new THREE.CylinderGeometry(0.07, 0.07, 0.26, 10).rotateX(Math.PI / 2), STEEL, 0, pivotY, zc - 0.25);
    // мачта с красными поясами
    const top = road + CROSS_H + 0.6;
    put(new THREE.CylinderGeometry(0.07, 0.08, top - hTop, 10), PAINT, mx, (top + hTop) / 2, zc);
    put(new THREE.CylinderGeometry(0.085, 0.085, 0.2, 10), RED, mx, hTop + 0.34, zc);
    put(new THREE.CylinderGeometry(0.085, 0.085, 0.2, 10), RED, mx, hTop + 0.78, zc);
    put(new THREE.ConeGeometry(0.1, 0.16, 10), RED, mx, top + 0.08, zc);
    // мигалка: чёрный щиток, белые кольца вокруг ламп, козырьки
    const ly = road + LAMP_H;
    const lz = zc + 0.12;
    put(new THREE.BoxGeometry(0.12, 0.12, 0.12), PLATE, mx, ly, zc + 0.04);
    put(new THREE.BoxGeometry(0.98, 0.42, 0.07), PLATE, mx, ly, lz);
    for (const s of [-1, 1]) {
      put(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 18).rotateX(Math.PI / 2), PAINT, mx + s * LAMP_DX, ly, lz + 0.05);
      put(new THREE.BoxGeometry(0.36, 0.035, 0.22), PLATE, mx + s * LAMP_DX, ly + 0.2, lz + 0.13);
    }
    // «андреевский крест»: белые доски с красной каймой, одна поверх другой
    for (const s of [-1, 1]) {
      const dz = s > 0 ? 0.02 : 0;
      put(new THREE.BoxGeometry(1.36, 0.26, 0.04).rotateZ(s * 0.56), RED, mx, road + CROSS_H, zc + 0.1 + dz);
      put(new THREE.BoxGeometry(1.24, 0.15, 0.04).rotateZ(s * 0.56), PAINT, mx, road + CROSS_H, zc + 0.115 + dz);
    }
    // линзы (инстансы, цвет — каждый кадр) и ореолы
    const glows: THREE.Sprite[] = [];
    for (let s = 0; s < 2; s++) {
      const x = mx + (s === 0 ? -1 : 1) * LAMP_DX;
      _v.set(x, ly, lz + 0.085).applyMatrix4(frame);
      _mat.makeRotationY(ry).setPosition(_v);
      this.lamps.setMatrixAt(k * 2 + s, _mat);
      this.lamps.setColorAt(k * 2 + s, LAMP_OFF);
      // ореол — обычным смешиванием: на светлой стене и небе он остаётся красным, а не выцветает в белый
      const glow = glowSprite(0xff2414, 1.25, 0);
      glow.material.blending = THREE.NormalBlending;
      glow.position.set(x, ly, lz + 0.22).applyMatrix4(frame);
      glow.visible = false;
      c.scene.add(glow);
      glows.push(glow);
    }

    // стрела: красно-белые полосы (у конца — красная), к концу тоньше; у оси — обойма, вал, противовес
    const dx = -sd * m.ux;
    const dz = -sd * m.uz;
    const list: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, color: number, x: number, y: number, z: number): void => {
      g.translate(x, y, z);
      list.push(paint(g, color));
    };
    const n = Math.max(2, Math.round((len - 0.22) / STRIPE));
    const w = (len - 0.22) / n;
    for (let i = 0; i < n; i++) {
      const x0 = 0.22 + i * w;
      const h = BOOM_H * (1 - (0.3 * (x0 + w / 2)) / len);
      add(new THREE.BoxGeometry(w + 0.003, h, BOOM_T), (n - 1 - i) % 2 === 0 ? RED : PAINT, x0 + w / 2, 0, 0);
    }
    add(new THREE.BoxGeometry(0.46, BOOM_H + 0.08, BOOM_T + 0.06), STEEL, 0.05, 0, 0);
    add(new THREE.CylinderGeometry(0.11, 0.11, BOOM_T + 0.16, 14).rotateX(Math.PI / 2), IRON, 0, 0, 0);
    add(new THREE.BoxGeometry(0.62, 0.09, 0.09), STEEL, -0.42, 0, 0);
    add(new THREE.BoxGeometry(0.26, 0.38, 0.24), 0x4a4e55, -0.66, 0, 0);
    const boom = new THREE.Mesh(mergeGeometries(list)!, boomMat);
    boom.position.set(px, pivotY, pz);
    boom.receiveShadow = true;
    c.scene.add(boom);
    const ryB = Math.atan2(-dz, dx);
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.y = ryB;
    shadow.renderOrder = 3;
    c.scene.add(shadow);
    return {
      m, boom, yaw: new THREE.Quaternion().setFromAxisAngle(AXIS_Y, ryB), len, px, pz, dx, dz, sy: road + 0.05, shadow,
      glowA: glows[0], glowB: glows[1],
    };
  }

  /** Положение стрел, тени под ними и мигалки на момент rt */
  set(rt: number): void {
    for (let i = 0; i < this.list.length; i++) {
      const g = this.list[i];
      const a = boomAngle(g.m, rt);
      _q.setFromAxisAngle(AXIS_Z, a);
      g.boom.quaternion.multiplyQuaternions(g.yaw, _q);
      // тень: длина — проекция стрелы на дорогу; поднятая — пятнышко у стойки
      const cos = Math.cos(a);
      const ext = g.len * cos + 0.5;
      const off = ext * 0.5 - 0.25;
      g.shadow.position.set(g.px + g.dx * off, g.sy, g.pz + g.dz * off);
      g.shadow.scale.set(ext, 1, 0.3 + 0.3 * cos);
      lampLevels(g.m, rt, _lv);
      this.lamp(i * 2, _lv.a, g.glowA);
      this.lamp(i * 2 + 1, _lv.b, g.glowB);
    }
    if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
  }

  private lamp(i: number, k: number, glow: THREE.Sprite): void {
    _col.copy(LAMP_OFF).lerp(LAMP_ON, k);
    this.lamps.setColorAt(i, _col);
    glow.visible = k > 0.02;
    glow.material.opacity = 0.6 * k;
  }
}

// ------------------------------------------------------------ тюк на П-раме

/** Тюк: длина вдоль дороги; зазор под ним внизу качания; на краях поднят */
const BALE_LEN = 1.5;
const BALE_SEG = 36;
const BALE_LOW = 0.2;
const BALE_RISE = 0.6;
/** Верх балки рамы над дорогой; блок под балкой; крюк над тюком */
const BEAM_H = 8.2;
const PULLEY = 0.62;
const HOOK_D = 0.62;
/** Тюк чуть закручивается на верёвке: амплитуда, рад; период — в периодах качания */
const TWIST = 0.12;
const TWIST_K = 1.6;
/** Столбы рамы — за краем обочины (за стенкой) */
const FRAME_OUT = 0.95;

interface SwingVis {
  m: Mover;
  /** Тюк со стропами: начало координат — центр тюка, X — поперёк дороги, Z — вдоль */
  group: THREE.Group;
  rope: THREE.Mesh;
  shadow: THREE.Mesh;
  yaw: THREE.Quaternion;
  /** Блок наверху, откуда идёт верёвка */
  px: number;
  py: number;
  pz: number;
  /** Половина пути качания по осям; высота дороги */
  hx: number;
  hz: number;
  y0: number;
}

/** Развёртка боковины тюка: соломинки — по кругу, полосы шпагата текстуры не попадают (зеркальные повторы) */
function baleSideUv(g: THREE.BufferGeometry, r: number): void {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const halves = 12;
  const vScale = (BALE_LEN / ((TAU * r) / halves)) * 0.28;
  for (let i = 0; i < (BALE_SEG + 1) * 2; i++) {
    const t = uv.getX(i) * halves;
    uv.setXY(i, 0.36 + 0.28 * Math.abs(((t + 1) % 2) - 1), uv.getY(i) * vScale);
  }
  uv.needsUpdate = true;
}

/** Две стропы вокруг тюка, от них к крюку над центром */
function slingGeometry(r: number): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  const top = r + HOOK_D;
  for (const z of [-0.45, 0.45]) {
    list.push(paint(new THREE.TorusGeometry(r + 0.03, 0.05, 6, 44).translate(0, 0, z), ROPE));
    const dy = top - (r + 0.04);
    list.push(paint(new THREE.CylinderGeometry(0.035, 0.035, Math.hypot(dy, z), 6).rotateX(Math.atan2(-z, dy)).translate(0, (top + r + 0.04) / 2, z / 2), ROPE));
  }
  list.push(paint(new THREE.TorusGeometry(0.11, 0.035, 6, 14).translate(0, top + 0.02, 0), IRON));
  return mergeGeometries(list)!;
}

/**
 * Круглый тюк сена (радиус — как у капсулы физики, ось вдоль дороги) на верёвке с деревянной П-рамы над улицей.
 * Центр ходит поперёк дороги ровно по swingU; верёвка всегда смотрит на блок, тюк наклонён вместе с ней — маятник:
 * у краёв замирает и приподнимается, внизу проносится быстрее всего. Под ним — мягкая тень на дороге.
 */
export class HaySwings {
  private readonly list: SwingVis[] = [];

  constructor(c: PropCtx, swings: readonly Mover[], hay: THREE.Texture) {
    const side = new THREE.MeshStandardMaterial({ map: hay, roughness: 0.93, color: 0xfff4dc });
    const end = new THREE.MeshStandardMaterial({ map: baleEndTexture(), roughness: 0.93 });
    const ropeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    // тень гуще общей: тюк — главная опасность улицы, его место на дороге видно издали
    const shadowMat = new THREE.MeshBasicMaterial({
      map: softDot('rgba(0,0,0,0.62)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
    });
    const loc = makeLoc();
    for (let i = 0; i < swings.length; i++) this.list.push(this.build(c, swings[i], loc, side, end, ropeMat, shadowMat));
  }

  private build(c: PropCtx, m: Mover, loc: TrackLoc, side: THREE.Material, end: THREE.Material, ropeMat: THREE.Material, shadowMat: THREE.Material): SwingVis {
    locateAny(c.tr, m.cx, m.cz, loc);
    const y0 = c.floor(m.cx, m.cz);
    const ry = Math.atan2(-m.uz, m.ux);
    // рама: столбы за обочинами по обе стороны улицы, балка с двускатной крышей, блок над серединой качания
    const rcx = m.cx - m.ux * loc.lat;
    const rcz = m.cz - m.uz * loc.lat;
    const put = framePut(c.solid, new THREE.Matrix4().makeRotationY(ry).setPosition(rcx, 0, rcz));
    const xl = -(loc.hw + loc.vl + FRAME_OUT);
    const xr = loc.hw + loc.vr + FRAME_OUT;
    const top = y0 + BEAM_H;
    for (const x of [xl, xr]) {
      const g = c.floor(rcx + m.ux * x, rcz + m.uz * x);
      const bot = Math.min(g, y0) - 0.4;
      put(new THREE.BoxGeometry(0.9, 0.5, 0.9), STONE, x, g + 0.05, 0);
      put(new THREE.BoxGeometry(0.44, top + 0.24 - bot, 0.44), WOOD, x, (top + 0.24 + bot) / 2, 0);
      const s = x < 0 ? 1 : -1;
      put(new THREE.BoxGeometry(2.0, 0.22, 0.22).rotateZ((s * Math.PI) / 4), WOOD_DARK, x + s * 0.75, top - 0.85, 0);
    }
    const mid = (xl + xr) / 2;
    const span = xr - xl;
    put(new THREE.BoxGeometry(span + 0.9, 0.48, 0.48), WOOD_DARK, mid, top, 0);
    for (const s of [-1, 1]) put(new THREE.BoxGeometry(span + 1.5, 0.07, 0.62).rotateX(s * 0.52), ROOF, mid, top + 0.39, s * 0.268);
    put(new THREE.BoxGeometry(span + 1.56, 0.1, 0.12), 0xa8442f, mid, top + 0.55, 0);
    put(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 18).rotateX(Math.PI / 2), IRON, loc.lat, top - PULLEY, 0);
    for (const z of [-0.1, 0.1]) put(new THREE.BoxGeometry(0.12, 0.44, 0.04), IRON, loc.lat, top - 0.43, z);

    const group = new THREE.Group();
    const geo = new THREE.CylinderGeometry(m.r, m.r, BALE_LEN, BALE_SEG, 1).rotateX(Math.PI / 2);
    baleSideUv(geo, m.r);
    const bale = new THREE.Mesh(geo, [side, end, end]);
    bale.receiveShadow = true;
    group.add(bale);
    const slings = new THREE.Mesh(slingGeometry(m.r), ropeMat);
    slings.receiveShadow = true;
    group.add(slings);
    c.scene.add(group);
    const rope = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), ROPE), ropeMat);
    c.scene.add(rope);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shadowMat);
    shadow.rotation.y = ry;
    shadow.renderOrder = 3;
    c.scene.add(shadow);
    return {
      m, group, rope, shadow, yaw: new THREE.Quaternion().setFromAxisAngle(AXIS_Y, ry),
      px: m.cx, py: top - PULLEY, pz: m.cz, hx: (m.bx - m.ax) / 2, hz: (m.bz - m.az) / 2, y0,
    };
  }

  /** Тюк, верёвка и тень на момент rt */
  set(rt: number): void {
    for (let i = 0; i < this.list.length; i++) {
      const s = this.list[i];
      const m = s.m;
      const u = swingU(m, rt);
      const x = m.cx + s.hx * u;
      const z = m.cz + s.hz * u;
      const y = s.y0 + BALE_LOW + m.r + BALE_RISE * u * u;
      // наклон — по верёвке от центра тюка к блоку; чуть закручен вокруг неё
      const tilt = Math.atan2((x - s.px) * m.ux + (z - s.pz) * m.uz, s.py - y);
      const tp = m.period * TWIST_K;
      const twist = TWIST * Math.sin((TAU * ((((rt + m.phase) % tp) + tp) % tp)) / tp);
      _q.setFromAxisAngle(AXIS_Z, tilt);
      _q2.setFromAxisAngle(AXIS_Y, twist);
      s.group.position.set(x, y, z);
      s.group.quaternion.copy(s.yaw).multiply(_q).multiply(_q2);
      // верёвка: от крюка до блока
      _d.set(s.px - x, s.py - y, s.pz - z);
      const l = _d.length();
      _d.multiplyScalar(1 / l);
      const hook = m.r + HOOK_D;
      const mid = (hook + l) / 2;
      s.rope.position.set(x + _d.x * mid, y + _d.y * mid, z + _d.z * mid);
      s.rope.scale.set(1, l - hook, 1);
      s.rope.quaternion.setFromUnitVectors(AXIS_Y, _d);
      // тень: чем выше тюк, тем она шире
      const hb = y - m.r - s.y0;
      s.shadow.position.set(x, s.y0 + 0.05, z);
      s.shadow.scale.set(2.7 + hb * 0.6, 1, 2.0 + hb * 0.4);
    }
  }
}

// ------------------------------------------------------------ тюки сена и стопки шин

/** Прямоугольный тюк: высота; тюки в нижнем ряду — примерно такой длины */
const BALE_H = 0.62;
const BALE_STEP = 1.5;
const BALE_GAP = 0.05;
const BALE_TINTS = [new THREE.Color(1, 1, 1), new THREE.Color(1.03, 0.98, 0.9), new THREE.Color(0.95, 1, 0.86), new THREE.Color(0.98, 0.93, 0.84)];

/**
 * Прямоугольный тюк: низ в (x, y, z), длина по (ex, ez). Развёртка сена: сверху и с торцов шпагат идёт вдоль тюка
 * (полосы текстуры на 0,3 и 0,7 ширины), с боков — только солома слоями.
 */
function bale(g: GeoParts, x: number, y: number, z: number, ex: number, ez: number, L: number, W: number, H: number, tint: THREE.Color): void {
  const wx = -ez;
  const wz = ex;
  const P = (a: number, b: number, h: number): V3 => [x + ex * a + wx * b, y + h, z + ez * a + wz * b];
  const low = tint.clone().multiplyScalar(0.7);
  const a0 = -L / 2;
  const a1 = L / 2;
  const b0 = -W / 2;
  const b1 = W / 2;
  const vl = L / W;
  const vh = H / W;
  face(g, P(a0, b0, H), P(a0, b1, H), P(a1, b1, H), P(a1, b0, H), [0, 1, 0], [0, 0, 1, 0, 1, vl, 0, vl], [tint, tint, tint, tint]);
  for (const s of [-1, 1]) {
    const a = s > 0 ? a1 : a0;
    face(g, P(a, b0, 0), P(a, b1, 0), P(a, b1, H), P(a, b0, H), [ex * s, 0, ez * s], [0, 0, 1, 0, 1, vh, 0, vh], [low, low, tint, tint]);
    const b = s > 0 ? b1 : b0;
    const u1 = 0.36 + 0.28;
    face(g, P(a0, b, 0), P(a1, b, 0), P(a1, b, H), P(a0, b, H), [wx * s, 0, wz * s], [0.36, 0, 0.36, L * 0.47, u1, L * 0.47, u1, 0], [low, low, tint, tint]);
  }
}

/** Тюки сена вместо блоков: нижний ряд по длине капсулы, сверху — вразбежку; всё одним мешем */
export function buildHayStacks(c: PropCtx, blocks: readonly Solid[], hay: THREE.Texture): void {
  if (!blocks.length) return;
  const g = parts();
  const loc = makeLoc();
  for (let i = 0; i < blocks.length; i++) {
    const s = blocks[i];
    const lx = s.bx - s.ax;
    const lz = s.bz - s.az;
    const l = Math.sqrt(lx * lx + lz * lz);
    let ex: number;
    let ez: number;
    if (l > 1e-6) {
      ex = lx / l;
      ez = lz / l;
    } else {
      const seg = locateAny(c.tr, s.cx, s.cz, loc).seg;
      ex = c.tr.tx[seg];
      ez = c.tr.tz[seg];
    }
    const L = l + s.r * 2;
    const W = s.r * 2;
    // низ — по самой низкой точке под тюками: на склоне не висят
    let y = Infinity;
    for (const [a, b] of [[0, 0], [-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]]) {
      y = Math.min(y, c.floor(s.cx + ex * a - ez * b, s.cz + ez * a + ex * b));
    }
    y -= 0.03;
    const rnd = makeRng(1009 + i * 17);
    const n = Math.max(1, Math.round(L / BALE_STEP));
    const bl = (L - BALE_GAP * (n - 1)) / n;
    const turn = (jit: number): [number, number] => {
      const a = (rnd() - 0.5) * jit;
      return [ex * Math.cos(a) - ez * Math.sin(a), ez * Math.cos(a) + ex * Math.sin(a)];
    };
    for (let k = 0; k < n; k++) {
      const a = -L / 2 + bl / 2 + k * (bl + BALE_GAP);
      const [qx, qz] = turn(0.05);
      bale(g, s.cx + ex * a, y, s.cz + ez * a, qx, qz, bl, W, BALE_H, BALE_TINTS[Math.floor(rnd() * BALE_TINTS.length)]);
    }
    const tops = n >= 2 ? n - 1 : 1;
    for (let k = 0; k < tops; k++) {
      const a = n >= 2 ? -L / 2 + (k + 1) * (bl + BALE_GAP) - BALE_GAP / 2 : 0;
      const [qx, qz] = turn(0.16);
      const len = n >= 2 ? bl * 0.94 : bl * 0.68;
      bale(g, s.cx + ex * a, y + BALE_H, s.cz + ez * a, qx, qz, len, W * 0.88, BALE_H * 0.95, BALE_TINTS[Math.floor(rnd() * BALE_TINTS.length)]);
    }
  }
  const mesh = staticMesh(buildGeo(g), new THREE.MeshStandardMaterial({ map: hay, vertexColors: true, roughness: 0.95 }), true);
  c.scene.add(mesh);
}

/** Стопка шин вместо бочки: столько шин, высота шины, шаг (чуть сжаты) */
const TIRES = 4;
const TIRE_H = 0.252;
const TIRE_STEP = 0.235;

/** Шина: бублик, сплюснутый по высоте; внутренний край темнее (цвет — у экземпляра) */
function tireGeometry(): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(0.385, 0.15, 10, 24).rotateX(Math.PI / 2).scale(1, TIRE_H / 0.3, 1);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    const k = Math.min(1, Math.max(0, (r - 0.26) / 0.13));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0.36 + 0.64 * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Красно-белые стопки шин вместо бочек: все шины — один инстансный меш */
export function buildTireStacks(c: PropCtx, barrels: readonly Solid[]): void {
  if (!barrels.length) return;
  const mesh = new THREE.InstancedMesh(tireGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }), barrels.length * TIRES);
  let k = 0;
  for (let i = 0; i < barrels.length; i++) {
    const s = barrels[i];
    const rnd = makeRng(503 + i * 31);
    const y0 = c.floor(s.ax, s.az);
    for (let t = 0; t < TIRES; t++) {
      _q.setFromAxisAngle(AXIS_Y, rnd() * TAU);
      _v.set(s.ax + (rnd() - 0.5) * 0.05, y0 + TIRE_H / 2 + t * TIRE_STEP, s.az + (rnd() - 0.5) * 0.05);
      _mat.compose(_v, _q, _s);
      mesh.setMatrixAt(k, _mat);
      mesh.setColorAt(k, _col.set(t % 2 === 0 ? RED : PAINT));
      k++;
    }
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  c.scene.add(mesh);
}
