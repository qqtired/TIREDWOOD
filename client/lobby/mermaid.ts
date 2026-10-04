// Русалка у мостков к маяку — маленькая живая деталь набережной. Раз в ~5 минут она выныривает рядом с местами рыбалки,
// поворачивается к рыбакам, машет рукой, над ней всплывают сердечки, и ныряет: хвост мелькает над водой. Только у себя
// в браузере, без сообщений сервера: когда, с какого борта, где и что делает в каждую секунду считает shared/mermaid.ts по
// серверному тику лобби (он у всех один и тот же, поэтому видят все одно и то же), а позицию — по местам рыбалки и настилу.
// Тело — настоящая желейка (Avatar: то же желе, лицо, глаза и варежка-рука), к ней добавлены волосы с цветком, жемчужное
// ожерелье и рыбий хвост с плавником. Ни коллизий, ни своего света; модель одна на все появления, между ними скрыта, и
// пока её нет — на кадр уходит только проверка времени.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TICK_RATE, WATER_Y } from '../../shared/constants.ts';
import { ACT_NONE } from '../../shared/lobby.ts';
import { lerp } from '../../shared/math.ts';
import {
  MERMAID_CUE, MERMAID_HEARTS, MERMAID_SHOW_S, mermaidAt, mermaidFrame, mermaidHeart, mermaidShow, newMermaidFrame,
  type MermaidFrame, type MermaidHeart, type MermaidLayout, type MermaidShow,
} from '../../shared/mermaid.ts';
import { DEFAULT_OUTFIT, type Outfit } from '../../shared/outfit.ts';
import { E_ALIVE, E_GROUNDED } from '../../shared/protocol.ts';
import { Avatar, type AvatarPose } from '../render/avatar.ts';
import type { Effects } from '../render/effects.ts';
import { paint } from '../render/kit.ts';
import { BODY_H, bodyR } from '../render/outfit3d.ts';
import { metalEnvTexture } from '../render/textures.ts';

/** Номер желейки русалки (не пересекается с игроками и рыбаками-соседями) */
const MERMAID_ID = 960;
/** Во сколько раз она крупнее обычной желейки: заметна с мостков за 5–8 м */
const SCALE = 1.15;
/** Дальше этого от камеры её не рисуем и не слушаем, м */
const FAR = 110;
/** Капель всплеска одновременно */
const DROPS = 36;

const MINT = 0x5fd8a8;
const TEAL = 0x1fb5b0;
const FIN_TIP = 0xff9ec7;
const HAIR = 0xff6f9c;
const HAIR_LIGHT = 0xff93b6;
const HAIR_DARK = 0xe14f86;
const PETAL = 0xfff2dc;
const PETAL_PINK = 0xffd3e0;
const CENTER = 0xffc233;
const PEARL = 0xfff8f2;
const SHELL = 0xffa8c4;

const OUTFIT: Outfit = { ...DEFAULT_OUTFIT, c: 6, c2: 12, p: 'none', e: 'normal', h: 'none', a: 'none' };
const OUTFIT_HAPPY: Outfit = { ...OUTFIT, e: 'happy' };
const NO_GROUND = { groundBelow: (): number => -1000 };

const smooth = (x: number): number => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};

// ------------------------------------------------------------ геометрия (без DOM: проверяется в node)

/** Шар, вытянутый до эллипсоида, повёрнутый вокруг вертикали и поставленный на место; цвет — вершинный */
function blob(color: number, sx: number, sy: number, sz: number, x: number, y: number, z: number, rot = 0, seg = 12): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.max(5, seg - 4)).scale(sx, sy, sz);
  if (rot) g.rotateY(rot);
  g.translate(x, y, z);
  return paint(g, color);
}

/** Высота нижней кромки шапки волос по направлению phi (π — лицо): спереди над глазами, сзади — ниже */
const hairRim = (phi: number): number => lerp(1.0, 1.38, Math.pow(0.5 - 0.5 * Math.cos(phi), 1.3));

/** Шапка волос: оболочка вокруг головы, спереди кромка над глазами (лицо открыто), по бокам и сзади ниже */
function hairCap(): THREE.BufferGeometry {
  const segs = 44;
  const rows = 12;
  const top = BODY_H + 0.04;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= segs; j++) {
    const phi = (j / segs) * Math.PI * 2;
    const rim = hairRim(phi);
    for (let k = 0; k <= rows; k++) {
      const t = k / rows;
      const y = lerp(top, rim, t);
      const r = k === 0 ? 0 : bodyR(Math.min(y, BODY_H - 0.002)) + 0.035 + 0.04 * Math.sin(Math.PI * Math.min(1, t * 1.7));
      pos.push(r * Math.sin(phi), y, r * Math.cos(phi));
    }
  }
  for (let j = 0; j < segs; j++) {
    for (let k = 0; k < rows; k++) {
      const a = j * (rows + 1) + k;
      const b = (j + 1) * (rows + 1) + k;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Волосы: шапка, пять прядей чёлки, две длинные пряди по бокам лица, объём сзади */
export function mermaidHairGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [paint(hairCap(), HAIR)];
  for (const a of [-0.62, -0.31, 0, 0.31, 0.62]) {
    const phi = Math.PI + a;
    const rim = hairRim(phi);
    const r = bodyR(rim) + 0.05;
    parts.push(blob(a === 0 ? HAIR_LIGHT : HAIR, 0.095, 0.115, 0.07, r * Math.sin(phi), rim - 0.02, r * Math.cos(phi), phi));
  }
  for (const side of [-1, 1]) {
    const phi = Math.PI + side * 1.12;
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const y = lerp(1.26, 0.52, t);
      const r = bodyR(y) + 0.045 + 0.02 * Math.sin(t * Math.PI);
      const rad = lerp(0.115, 0.07, t);
      parts.push(blob(i % 2 ? HAIR : HAIR_LIGHT, rad, rad * 1.15, rad, r * Math.sin(phi), y, r * Math.cos(phi)));
    }
  }
  parts.push(blob(HAIR_DARK, 0.46, 0.5, 0.3, 0, 0.92, 0.2));
  return mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }), false)!;
}

/** Цветок в волосах: пять лепестков и сердцевина; центр, куда «смотрит» и размер */
function flower(cx: number, cy: number, cz: number, nx: number, ny: number, nz: number, size: number): THREE.BufferGeometry[] {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, ny, nz).normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), q, new THREE.Vector3(size, size, size));
  const out: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const g = new THREE.SphereGeometry(1, 10, 7).scale(0.115, 0.032, 0.075).translate(0.095, 0.01, 0).rotateY((k / 5) * Math.PI * 2).applyMatrix4(m);
    out.push(paint(g, k % 2 ? PETAL_PINK : PETAL));
  }
  out.push(paint(new THREE.SphereGeometry(0.05, 10, 8).translate(0, 0.028, 0).applyMatrix4(m), CENTER));
  return out;
}

/** Украшения: цветок слева в волосах, жемчужное ожерелье на теле и ракушка-подвеска посередине */
export function mermaidTrinketsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const phi = Math.PI + 1.0;
  const r = bodyR(1.4) + 0.075;
  parts.push(...flower(r * Math.sin(phi), 1.4, r * Math.cos(phi), Math.sin(phi), 0.55, Math.cos(phi), 1.15));
  const pearls = 22;
  for (let j = 0; j < pearls; j++) {
    const a = (j / pearls) * Math.PI * 2;
    const front = 0.5 - 0.5 * Math.cos(a);
    const y = 0.93 - 0.11 * front * front;
    const rr = bodyR(y) + 0.02;
    parts.push(blob(PEARL, 0.03, 0.03, 0.03, rr * Math.sin(a), y, rr * Math.cos(a), 0, 8));
  }
  const yShell = 0.93 - 0.11 - 0.06;
  const rShell = bodyR(yShell) + 0.034;
  parts.push(blob(SHELL, 0.075, 0.065, 0.032, 0, yShell, -rShell, 0, 10));
  parts.push(blob(PEARL, 0.026, 0.026, 0.026, 0, yShell, -rShell - 0.03, 0, 8));
  return mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }), false)!;
}

/** Хвост — труба, сужающаяся от пояса к плавнику, и двухлопастный плавник; растёт вниз от низа тела (вершина — внутри тела) */
export function mermaidTailGeometry(): { geometry: THREE.BufferGeometry; tip: THREE.Vector3 } {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(0, -0.05, 0.02), new THREE.Vector3(0, -0.34, 0.07),
    new THREE.Vector3(0, -0.58, 0.15), new THREE.Vector3(0, -0.76, 0.22), new THREE.Vector3(0, -0.88, 0.22),
  ]);
  const rings = 28;
  const seg = 16;
  const len = path.getLength();
  const radius = (s: number): number => lerp(0.34, 0.075, Math.pow(s, 0.85));
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const cBody = new THREE.Color(MINT);
  const cTail = new THREE.Color(TEAL);
  const c = new THREE.Color();
  const B = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i <= rings; i++) {
    const s = i / rings;
    const p = path.getPointAt(s);
    const T = path.getTangentAt(s);
    const N = new THREE.Vector3().crossVectors(B, T).normalize();
    const r = radius(s);
    const slope = (radius(Math.min(1, s + 0.01)) - radius(Math.max(0, s - 0.01))) / (len * 0.02);
    c.copy(cBody).lerp(cTail, smooth(s * 1.2));
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const cx = Math.cos(a);
      const sy = Math.sin(a);
      const rx = B.x * cx + N.x * sy, ry = B.y * cx + N.y * sy, rz = B.z * cx + N.z * sy;
      pos.push(p.x + rx * r, p.y + ry * r, p.z + rz * r);
      const n = new THREE.Vector3(rx - T.x * slope, ry - T.y * slope, rz - T.z * slope).normalize();
      nor.push(n.x, n.y, n.z);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = a + seg + 1;
      // против часовой стрелки снаружи: лицевая сторона — наружу (иначе хвост с вывернутым светом, тёмный)
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const tube = new THREE.BufferGeometry();
  tube.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tube.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  tube.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  tube.setIndex(idx);

  // плавник: два серповидных лепестка по обе стороны от конца хвоста, плоскость — вправо-влево и вдоль хвоста
  const shape = new THREE.Shape();
  shape.moveTo(-0.05, 0);
  shape.bezierCurveTo(-0.2, -0.02, -0.44, -0.1, -0.5, -0.4);
  shape.bezierCurveTo(-0.34, -0.38, -0.14, -0.34, 0, -0.25);
  shape.bezierCurveTo(0.14, -0.34, 0.34, -0.38, 0.5, -0.4);
  shape.bezierCurveTo(0.44, -0.1, 0.2, -0.02, 0.05, 0);
  const fin = new THREE.ShapeGeometry(shape, 14);
  const end = path.getPointAt(1);
  const Te = path.getTangentAt(1);
  const fp = fin.getAttribute('position');
  const fc: number[] = [];
  const fn: number[] = [];
  const nf = new THREE.Vector3().crossVectors(B, Te).normalize();
  for (let i = 0; i < fp.count; i++) {
    const fx = fp.getX(i);
    const fy = fp.getY(i);
    fp.setXYZ(i, end.x + fx * B.x - fy * Te.x, end.y + fx * B.y - fy * Te.y, end.z + fx * B.z - fy * Te.z);
    c.copy(cTail).lerp(new THREE.Color(FIN_TIP), smooth(-fy / 0.4));
    fc.push(c.r, c.g, c.b);
    // сторона плавника, куда смотрит порядок вершин (ось Z формы после поворота: B × (−Te)), — нормаль туда же
    fn.push(-nf.x, -nf.y, -nf.z);
  }
  fin.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
  fin.setAttribute('normal', new THREE.Float32BufferAttribute(fn, 3));
  fin.deleteAttribute('uv');
  const geometry = mergeGeometries([tube, fin], false)!;
  geometry.computeBoundingSphere();
  return { geometry, tip: end.clone().addScaledVector(Te, 0.4) };
}

/** Рука: тонкая «сосиска» от плеча до кисти (длина 1 вдоль Y от начала координат — растягивается по руке) */
export function mermaidArmGeometry(): THREE.BufferGeometry {
  return paint(new THREE.CylinderGeometry(0.068, 0.058, 1, 10, 1, true).translate(0, 0.5, 0), MINT);
}

/** Кисть: круглая варежка покрупнее обычной желейкиной — издалека видно, что она машет */
export function mermaidHandGeometry(): THREE.BufferGeometry {
  return paint(new THREE.SphereGeometry(0.125, 14, 10).scale(1, 0.95, 0.85), MINT);
}

/** Плечо в осях желейки: рука растёт отсюда (внутри тела) */
const SHOULDER_X = 0.4;
const SHOULDER_Y = 0.95;

// ------------------------------------------------------------ текстуры (canvas)

/** Сердечко: розово-красное, блик слева сверху */
function heartTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const path = (): void => {
    g.beginPath();
    g.moveTo(64, 114);
    g.bezierCurveTo(18, 86, 6, 54, 22, 33);
    g.bezierCurveTo(37, 12, 60, 18, 64, 40);
    g.bezierCurveTo(68, 18, 91, 12, 106, 33);
    g.bezierCurveTo(122, 54, 110, 86, 64, 114);
    g.closePath();
  };
  const grad = g.createLinearGradient(28, 16, 100, 112);
  grad.addColorStop(0, '#ff8aa6');
  grad.addColorStop(0.5, '#ff4d74');
  grad.addColorStop(1, '#df2a56');
  path();
  g.fillStyle = grad;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(190,24,70,0.55)';
  g.stroke();
  g.save();
  path();
  g.clip();
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.beginPath();
  g.ellipse(41, 40, 12, 7, -0.7, 0, Math.PI * 2);
  g.fill();
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Пена вокруг тела на воде: светлое кольцо, мягко гаснет наружу */
function foamTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.3)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------ русалка

export interface MermaidOptions {
  /** Где можно всплыть: борта пирса и промежутки между местами (shared/mermaid.ts, lobbyMermaidLayout) */
  layout: MermaidLayout;
  /** Круги на воде */
  effects: Pick<Effects, 'ripple'>;
  /** Всплеск: куда и нырок ли это (иначе — вынырнула); звук ставит сцена */
  onSplash?: (x: number, y: number, z: number, dive: boolean) => void;
}

interface Drop {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  size: number;
}

const V = new THREE.Vector3();
const Q = new THREE.Quaternion();
const Q_ROLL = new THREE.Quaternion();
const Q2 = new THREE.Quaternion();
const S = new THREE.Vector3();
const M = new THREE.Matrix4();
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export class Mermaid3D {
  /** Всё в мире: стоит на воде там, где вынырнула, смотрит, куда повернулась */
  readonly group = new THREE.Group();
  private readonly layout: MermaidLayout;
  private readonly options: MermaidOptions;
  private readonly av: Avatar;
  private readonly pivot = new THREE.Group();
  private readonly tailPivot = new THREE.Group();
  private readonly finTip = new THREE.Object3D();
  private readonly foam: THREE.Mesh;
  private readonly hearts: THREE.InstancedMesh;
  private readonly heartAlpha: THREE.InstancedBufferAttribute;
  private readonly drops: THREE.InstancedMesh;
  private readonly dropList: Drop[] = [];
  private readonly pose: AvatarPose = { x: 0, y: -3, z: 0, yaw: 0, pitch: 0, flags: E_ALIVE | E_GROUNDED };
  /** Кисти в осях желейки [x, y, z, x, y, z]: левая и правая; в покое — опущены в воду по бокам */
  private readonly hands = [-0.7, 0.3, -0.05, 0.7, 0.3, -0.05];
  private readonly arms: [THREE.Mesh, THREE.Mesh];
  private readonly mitts: [THREE.Mesh, THREE.Mesh];
  private readonly frame: MermaidFrame = newMermaidFrame();
  private readonly heart: MermaidHeart = { ox: 0, oz: 0, oy: 0, size: 0, alpha: 0, roll: 0 };
  private readonly disposables: Array<{ dispose(): void }> = [];
  private active = false;
  private key = -1;
  private prevAge = 0;
  private nextRipple = 0;
  private happy = false;
  private tick = -1;
  private forced: { show: MermaidShow; start: number; key: number; hold: number | null } | null = null;
  private forcedCount = 0;
  private lastAge = -1;

  constructor(scene: THREE.Scene, options: MermaidOptions) {
    this.options = options;
    this.layout = options.layout;
    this.group.name = 'mermaid';
    this.group.visible = false;

    // тело — желейка: то же желе, лицо, глаза, варежка-рука
    this.av = new Avatar(MERMAID_ID, { gun: false, voice: false });
    this.av.setOutfit(OUTFIT);
    this.av.setInfo('', null, false);
    this.av.root.scale.setScalar(SCALE);
    const gloss = new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.36, clearcoat: 0.9, clearcoatRoughness: 0.12, envMap: metalEnvTexture(), envMapIntensity: 0.5,
      side: THREE.DoubleSide, emissive: 0x2a2030, emissiveIntensity: 0.35,
    });
    this.disposables.push(gloss);
    const hair = new THREE.Mesh(mermaidHairGeometry(), gloss);
    const trinkets = new THREE.Mesh(mermaidTrinketsGeometry(), gloss);
    const tail = mermaidTailGeometry();
    const tailMesh = new THREE.Mesh(tail.geometry, gloss);
    // руки — свои (варежки желейки без рук не машут заметно): сосиска от плеча и круглая кисть
    const armGeo = mermaidArmGeometry();
    const handGeo = mermaidHandGeometry();
    this.arms = [new THREE.Mesh(armGeo, gloss), new THREE.Mesh(armGeo, gloss)];
    this.mitts = [new THREE.Mesh(handGeo, gloss), new THREE.Mesh(handGeo, gloss)];
    this.disposables.push(hair.geometry, trinkets.geometry, tail.geometry, armGeo, handGeo);
    this.tailPivot.position.set(0, 0.3, 0);
    tailMesh.position.set(0, -0.3, 0);
    this.finTip.position.copy(tail.tip).add(V.set(0, -0.3, 0));
    this.tailPivot.add(tailMesh, this.finTip);
    // всё это — в узле «в руках» желейки: сжимается и качается вместе с телом
    this.av.held.add(hair, trinkets, this.tailPivot, ...this.arms, ...this.mitts);
    this.pivot.add(this.av.root);
    this.group.add(this.pivot);

    // пена вокруг тела на воде
    const foamTex = foamTexture();
    const foamMat = new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, depthWrite: false, opacity: 0, fog: false });
    this.disposables.push(foamTex, foamMat);
    this.foam = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2), foamMat);
    this.foam.position.y = 0.03;
    this.foam.renderOrder = 1;
    this.group.add(this.foam);

    // сердечки: один InstancedMesh, у каждого своя прозрачность
    const heartTex = heartTexture();
    const heartMat = new THREE.MeshBasicMaterial({ map: heartTex, transparent: true, depthWrite: false, fog: false, toneMapped: false });
    heartMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float instanceAlpha;\nvarying float vAlpha;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = instanceAlpha;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
        .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= vAlpha;');
    };
    heartMat.customProgramCacheKey = () => 'mermaid-hearts';
    const heartGeo = new THREE.PlaneGeometry(1, 1);
    this.heartAlpha = new THREE.InstancedBufferAttribute(new Float32Array(MERMAID_HEARTS), 1);
    heartGeo.setAttribute('instanceAlpha', this.heartAlpha);
    this.hearts = new THREE.InstancedMesh(heartGeo, heartMat, MERMAID_HEARTS);
    this.hearts.name = 'mermaid-hearts';
    this.hearts.frustumCulled = false;
    this.hearts.renderOrder = 4;
    this.hearts.visible = false;
    for (let i = 0; i < MERMAID_HEARTS; i++) this.hearts.setMatrixAt(i, M.makeScale(0, 0, 0));
    this.disposables.push(heartTex, heartMat, heartGeo);

    // капли всплеска
    const dropMat = new THREE.MeshStandardMaterial({ color: 0xeaf8ff, roughness: 0.2, emissive: 0x6fa3b8, emissiveIntensity: 0.3 });
    const dropGeo = new THREE.SphereGeometry(1, 6, 5);
    this.drops = new THREE.InstancedMesh(dropGeo, dropMat, DROPS);
    this.drops.name = 'mermaid-drops';
    this.drops.frustumCulled = false;
    this.drops.count = 0;
    this.disposables.push(dropMat, dropGeo);

    scene.add(this.group, this.hearts, this.drops);
  }

  /**
   * Кадр. tick — серверный тик лобби (renderTick; меньше нуля — часы ещё не пошли), time — секунды сцены.
   * Пока русалки нет, всё, что делает кадр, — одна проверка времени.
   */
  update(tick: number, dt: number, time: number, camera: THREE.Camera): void {
    dt = Math.min(0.1, Math.max(0, dt));
    this.tick = tick;
    if (this.dropList.length) this.stepDrops(dt);
    let show: MermaidShow | null = null;
    let age = 0;
    let key = 0;
    if (tick >= 0) {
      const f = this.forced;
      if (f) {
        // часы кадра могут чуть откатиться назад — не бросаем вызванное появление из-за этого
        age = f.hold ?? Math.max(0, (tick - f.start) / TICK_RATE);
        if (age >= 0 && age < MERMAID_SHOW_S) { show = f.show; key = f.key; } else this.forced = null;
      }
      if (!show) {
        const at = mermaidAt(tick, this.layout);
        if (at) { show = at.show; age = at.age; key = at.show.n; }
      }
    }
    if (!show) {
      if (this.active) this.stop();
      return;
    }
    const cam = camera.position;
    if (Math.hypot(cam.x - show.x, cam.z - show.z) > FAR) {
      if (this.active) this.stop();
      return;
    }
    if (!this.active || this.key !== key) this.begin(show, key, age);
    this.step(show, age, dt, time, camera);
  }

  /**
   * Отладка (только через __opus в debug-режиме): выплыть прямо сейчас с борта side (номер в layout.sides; без номера —
   * как повезёт). hold — застыть на этой секунде появления (для снимков), пока не позовут снова или не вызовут clear().
   */
  call(side?: number, hold?: number): MermaidShow | null {
    if (this.tick < 0) return null;
    const n = 900_000 + this.forcedCount++;
    const show = mermaidShow(n, this.layout, side ?? Math.floor(Math.random() * Math.max(1, this.layout.sides.length)));
    if (!show) return null;
    this.forced = { show, start: this.tick, key: -n, hold: hold ?? null };
    return show;
  }

  /** Отладка: убрать вызванное появление */
  clear(): void {
    this.forced = null;
  }

  debug(): Record<string, unknown> {
    return {
      active: this.active, age: +this.lastAge.toFixed(2), forced: this.forced !== null, key: this.key, hearts: this.hearts.visible, drops: this.dropList.length,
      at: this.active ? [+this.group.position.x.toFixed(2), +this.group.position.z.toFixed(2)] : null,
      sides: this.layout.sides.map((s) => ({ name: s.name, spots: s.spots, lanes: s.lanes.map((l) => [+l.x.toFixed(2), +l.z.toFixed(2)]) })),
    };
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group, this.hearts, this.drops);
    this.av.dispose(scene);
    this.drops.dispose();
    this.hearts.dispose();
    for (const d of this.disposables) d.dispose();
  }

  // ------------------------------------------------------------ появление

  private begin(show: MermaidShow, key: number, age: number): void {
    this.active = true;
    this.key = key;
    this.prevAge = age;
    this.nextRipple = Math.ceil(age / 1.4) * 1.4;
    this.happy = false;
    this.av.setOutfit(OUTFIT);
    this.av.setAction(ACT_NONE, 0);
    this.group.position.set(show.x, WATER_Y, show.z);
  }

  private stop(): void {
    this.active = false;
    this.key = -1;
    this.group.visible = false;
    this.hearts.visible = false;
    this.foam.visible = false;
    this.lastAge = -1;
  }

  private step(show: MermaidShow, age: number, dt: number, time: number, camera: THREE.Camera): void {
    const f = mermaidFrame(show, age, this.frame);
    this.lastAge = age;
    this.group.visible = f.shown;
    this.foam.visible = f.shown;
    if (f.shown) {
      this.group.rotation.y = f.yaw;
      this.pivot.rotation.x = -f.pitch;
      this.tailPivot.rotation.z = f.flick;
      if (f.happy !== this.happy) {
        this.happy = f.happy;
        this.av.setOutfit(f.happy ? OUTFIT_HAPPY : OUTFIT);
      }
      // правая рука: из воды вверх, снаружи от косички, и три взмаха; левая висит вдоль тела
      const h = this.hands;
      h[3] = lerp(0.7, 0.82 + f.swing * 0.2, f.hand);
      h[4] = lerp(0.3, 1.36 + Math.abs(f.swing) * 0.04, f.hand);
      h[5] = lerp(-0.05, -0.26, f.hand);
      this.limb(0, -1, h[0], h[1], h[2]);
      this.limb(1, 1, h[3], h[4], h[5]);
      const p = this.pose;
      p.y = f.lift;
      p.flags = E_ALIVE | (f.air ? 0 : E_GROUNDED);
      this.av.update(p, dt, time, NO_GROUND, camera.position, false);
      // пена по ватерлинии: появляется со всплеском и уходит с нырком
      const foamK = smooth((age - 0.1) / 0.4) * (1 - smooth((age - 7.4) / 0.6));
      const fm = this.foam.material as THREE.MeshBasicMaterial;
      fm.opacity = 0.75 * foamK;
      this.foam.scale.setScalar(1 + 0.035 * Math.sin(time * 2.4) + (f.pitch > 0 ? f.pitch * 0.12 : 0));
    }
    this.cues(show, age);
    this.ripples(show, age);
    this.updateHearts(show, age, camera);
    this.prevAge = age;
  }

  /** Рука от плеча (side: −1 левое, 1 правое) до кисти в точке (x, y, z) осей желейки */
  private limb(i: 0 | 1, side: number, x: number, y: number, z: number): void {
    const sx = side * SHOULDER_X;
    V.set(x - sx, y - SHOULDER_Y, z);
    const len = V.length() || 1;
    const arm = this.arms[i];
    arm.position.set(sx, SHOULDER_Y, 0);
    arm.quaternion.setFromUnitVectors(Y_AXIS, V.divideScalar(len));
    arm.scale.set(1, len, 1);
    this.mitts[i].position.set(x, y, z);
  }

  /** Всплеск со звуком: вынырнула — у тела, нырнула — там, где плавник уходит в воду; не догоняем старое после паузы вкладки */
  private cues(show: MermaidShow, age: number): void {
    const hit = (at: number): boolean => this.prevAge < at && age >= at && age - at < 0.6;
    if (hit(MERMAID_CUE.up)) this.splash(show.x, show.z, 20, 1, false);
    if (hit(MERMAID_CUE.down)) {
      this.finTip.updateWorldMatrix(true, false);
      this.finTip.getWorldPosition(V);
      this.splash(V.x, V.z, 14, 0.8, true);
    }
  }

  private ripples(show: MermaidShow, age: number): void {
    if (age < this.nextRipple || age > 7.4) return;
    this.nextRipple = age + 1.4;
    this.options.effects.ripple(show.x, show.z, age < 1 ? 3.4 : 2.1, age < 1 ? 1.9 : 1.5);
  }

  private splash(x: number, z: number, count: number, power: number, dive: boolean): void {
    this.options.effects.ripple(x, z, 3.6 * power + 0.6, 1.9);
    this.options.effects.ripple(x, z, 2.2 * power + 0.4, 1.3);
    for (let i = 0; i < count && this.dropList.length < DROPS; i++) {
      const a = Math.random() * Math.PI * 2;
      const out = (0.4 + Math.random() * 1.3) * power;
      this.dropList.push({
        x: x + Math.cos(a) * 0.35, y: WATER_Y + 0.05, z: z + Math.sin(a) * 0.35,
        vx: Math.cos(a) * out, vy: (2.4 + Math.random() * 2.4) * power, vz: Math.sin(a) * out,
        life: 1, size: (0.04 + Math.random() * 0.045) * (0.8 + power * 0.4),
      });
    }
    this.options.onSplash?.(x, WATER_Y, z, dive);
  }

  private stepDrops(dt: number): void {
    let n = 0;
    for (let i = 0; i < this.dropList.length; i++) {
      const d = this.dropList[i];
      d.vy -= 11 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      if (d.y < WATER_Y || d.life <= 0) continue;
      this.dropList[n++] = d;
      M.compose(V.set(d.x, d.y, d.z), Q.identity(), S.setScalar(d.size));
      this.drops.setMatrixAt(n - 1, M);
    }
    this.dropList.length = n;
    this.drops.count = n;
    if (n) this.drops.instanceMatrix.needsUpdate = true;
  }

  private updateHearts(show: MermaidShow, age: number, camera: THREE.Camera): void {
    const fwdX = -Math.sin(show.yaw);
    const fwdZ = -Math.cos(show.yaw);
    const rightX = Math.cos(show.yaw);
    const rightZ = -Math.sin(show.yaw);
    camera.getWorldQuaternion(Q);
    let any = false;
    for (let i = 0; i < MERMAID_HEARTS; i++) {
      const alive = mermaidHeart(show, i, age, this.heart);
      const hh = this.heart;
      if (alive) {
        any = true;
        Q_ROLL.setFromAxisAngle(Z_AXIS, hh.roll);
        V.set(show.x + rightX * hh.ox + fwdX * hh.oz, WATER_Y + hh.oy, show.z + rightZ * hh.ox + fwdZ * hh.oz);
        M.compose(V, Q2.copy(Q).multiply(Q_ROLL), S.setScalar(hh.size));
        this.heartAlpha.setX(i, hh.alpha);
      } else {
        M.makeScale(0, 0, 0);
        this.heartAlpha.setX(i, 0);
      }
      this.hearts.setMatrixAt(i, M);
    }
    this.hearts.visible = any;
    if (any) {
      this.hearts.instanceMatrix.needsUpdate = true;
      this.heartAlpha.needsUpdate = true;
    }
  }
}
