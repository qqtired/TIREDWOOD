// Вывески «Сезон рыбалки» (сезон — server/lobby/fishseason.ts, часы на клиенте — FISH_SEASON): большая деревянная доска
// на столбах на коньке дома Семёна (лицом к мосткам, видна от маяка и с мостков) и такая же на крыше рубки баркаса
// (лицом к корме — к палубе и к подходящей лодке). Канаты на столбах, поплавки, вяленые рыбки на бечёвках, фонарь,
// флажки над доской; фон доски — картинка (client/assets/fishsign), надписи — на холсте шрифтом Rubik.
// До сезона — «Сезон рыбалки через 1:12:30», за 5 минут — «Скоро сезон!» и доска мигает, во время — «СЕЗОН РЫБАЛКИ!
// Все шансы ×2 — ещё 7:42»: по доске бежит блеск, флажки и рыбки трепещут. После — снова отсчёт.
// Бюджет: у каждой доски 3 отрисовки (дерево, лицо, флажки с рыбками); холст один на обе и перерисовывается, только
// когда меняется текст (раз в секунду); вдали (дальше FAR м) доска не рисуется. Ламп нет — свечение материалом.
import * as THREE from 'three';
import { BARKAS, BARKAS_HOUSE } from '../../shared/barkas.ts';
import { FISH_HOUSE } from '../../shared/fishplaces.ts';
import { SEASON_MUL } from '../../shared/fishrules.ts';
import { mergeColored, paint, place } from '../render/kit.ts';
import { FISH_SEASON, seasonLeft, type FishSeasonState } from './fishseason.ts';

/** «Скоро сезон!» — за столько до начала, мс */
export const SEASON_SOON_MS = 5 * 60_000;
/** Что даёт сезон (shared/fishrules.ts — множитель шансов) */
export const SEASON_SIGN_PERK = `Все шансы ×${String(SEASON_MUL).replace('.', ',')}`;
/** Сколько идёт сезон, мин (server/lobby/fishseason.ts — SEASON_MS) */
const SEASON_MIN = 10;

export type SeasonSignPhase = 'none' | 'wait' | 'soon' | 'on';
export interface SeasonSignView {
  phase: SeasonSignPhase;
  title: string;
  big: string;
  sub: string;
}

/** Что написано на вывеске сейчас (null — о сезоне ещё ничего не знаем) */
export function seasonSignView(st: FishSeasonState | null): SeasonSignView {
  const perk = `${SEASON_SIGN_PERK} · ${SEASON_MIN} минут`;
  if (!st) return { phase: 'none', title: 'СЕЗОН РЫБАЛКИ', big: 'скоро', sub: perk };
  if (st.on) return { phase: 'on', title: 'СЕЗОН РЫБАЛКИ!', big: SEASON_SIGN_PERK, sub: `ещё ${seasonLeft(st.left)} — беги к воде!` };
  if (st.left <= SEASON_SOON_MS) return { phase: 'soon', title: 'СКОРО СЕЗОН РЫБАЛКИ!', big: seasonLeft(st.left), sub: `${SEASON_SIGN_PERK} · готовь удочку!` };
  return { phase: 'wait', title: 'СЕЗОН РЫБАЛКИ ЧЕРЕЗ', big: seasonLeft(st.left), sub: perk };
}

const BG_URL = new URL('../assets/fishsign/season-board.webp', import.meta.url).href;
const CW = 1024;
const CH = 568;
const FONT = 'Rubik, system-ui, sans-serif';
/** Дальше — доска не рисуется, м */
const FAR = 120;

const WOOD = 0x6a4a30;
const WOOD_DARK = 0x4e3725;
const CAP = 0x8d3f2d;
const ROPE = 0xcdb98c;
const METAL = 0x3a3f42;
const FLAGS = [0xd8352b, 0xf4f1e8, 0x3aa35a, 0xe8642c];

type G = THREE.BufferGeometry;
const at = (g: G, color: number, x: number, y: number, z: number, ry = 0, rx = 0): G => place(paint(g, color), x, y, z, ry, rx);

/** Палка из a в b (столбы растяжек, бечёвки) */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, color: number): G {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), 5);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return paint(g, color);
}

export interface SeasonSignSpot {
  /** Основание столбов (середина между ними) и куда смотрит доска */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Ширина доски, м (высота — по холсту, 1024×568) */
  w: number;
  /** Низ доски над основанием столбов, м */
  lift: number;
  /** Насколько ниже основания уходят концы растяжек (скат крыши), м */
  guyDrop: number;
}

/**
 * Где стоят вывески — только от общих констант, чтобы ехали вместе с домом и баркасом:
 * у Семёна — столбы на коньке (FISH_HOUSE), доска лицом на север, к мосткам и маяку;
 * на баркасе — столбы у кормовой кромки крыши рубки (BARKAS_HOUSE.x1, .h) по оси корпуса (BARKAS.z), лицом на корму:
 * к палубе и к подходящей лодке.
 */
export const SEASON_SIGN_SPOTS: { readonly house: SeasonSignSpot; readonly barkas: SeasonSignSpot } = {
  house: { x: (FISH_HOUSE.x0 + FISH_HOUSE.x1) / 2, y: FISH_HOUSE.ridge + 0.18, z: (FISH_HOUSE.z0 + FISH_HOUSE.z1) / 2, yaw: Math.PI, w: 5.2, lift: 0.3, guyDrop: 0.8 },
  barkas: { x: BARKAS_HOUSE.x1 + 0.19, y: BARKAS_HOUSE.h + 0.12, z: BARKAS.z, yaw: Math.PI / 2, w: 4, lift: 0.4, guyDrop: 0 },
};

/** Одна доска: дерево, лицо (общий материал с холстом), флажки и рыбки (общий материал с ветром) */
class SignMesh {
  readonly group = new THREE.Group();

  constructor(spec: SeasonSignSpot, face: THREE.Material, wood: THREE.Material, flags: THREE.Material) {
    const { w, lift } = spec;
    const h = (w * CH) / CW;
    const top = lift + h;
    const postX = w / 2 - 0.16;
    const postTop = top + 0.8;
    const g: G[] = [];
    // столбы за доской (зазор 2 см), канатные обмотки, растяжки назад
    for (const s of [-1, 1]) {
      g.push(at(new THREE.BoxGeometry(0.15, postTop, 0.15), WOOD_DARK, s * postX, postTop / 2, -0.145));
      g.push(at(new THREE.ConeGeometry(0.12, 0.14, 4).rotateY(Math.PI / 4), WOOD_DARK, s * postX, postTop + 0.07, -0.145));
      for (const y of [0.18, lift + 0.12, top - 0.1, postTop - 0.18]) {
        g.push(at(new THREE.TorusGeometry(0.1, 0.028, 5, 10).rotateX(Math.PI / 2), ROPE, s * postX, y, -0.145));
      }
      g.push(rod(new THREE.Vector3(s * postX, postTop - 0.2, -0.2), new THREE.Vector3(s * (postX + 0.5), -spec.guyDrop + 0.05, -1.1), 0.014, ROPE));
    }
    // доска: рама-основа (лицо — на 1,6 см впереди), козырёк сверху
    g.push(at(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.1), WOOD, 0, lift + h / 2, 0));
    g.push(at(new THREE.BoxGeometry(w + 0.5, 0.08, 0.42), CAP, 0, top + 0.16, 0.06, 0, 0.22));
    // поплавки на верёвке вдоль низа
    const n = Math.max(5, Math.round(w / 0.62));
    const prev = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = new THREE.Vector3(-w / 2 + 0.1 + t * (w - 0.2), lift - 0.1 - Math.sin(t * Math.PI) * 0.12, 0.1);
      if (i > 0) g.push(rod(prev, p, 0.012, ROPE));
      prev.copy(p);
      if (i > 0 && i < n) g.push(at(new THREE.SphereGeometry(0.075, 10, 8), i % 2 ? 0xd8352b : 0xf4f1e8, p.x, p.y - 0.06, p.z));
    }
    // фонарь на кронштейне правого столба (ниже рыбки, что висит с козырька)
    const lx = postX + 0.32;
    const ly = lift + 0.45;
    g.push(at(new THREE.BoxGeometry(0.4, 0.04, 0.04), METAL, postX + 0.17, ly + 0.26, -0.145));
    g.push(at(new THREE.BoxGeometry(0.17, 0.03, 0.17), METAL, lx, ly + 0.13, -0.145));
    g.push(at(new THREE.ConeGeometry(0.12, 0.1, 4).rotateY(Math.PI / 4), METAL, lx, ly + 0.19, -0.145));
    g.push(at(new THREE.BoxGeometry(0.13, 0.2, 0.13), 0xffe3a6, lx, ly, -0.145));
    g.push(at(new THREE.BoxGeometry(0.17, 0.03, 0.17), METAL, lx, ly - 0.115, -0.145));
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.push(at(new THREE.BoxGeometry(0.02, 0.2, 0.02), METAL, lx + dx * 0.075, ly, -0.145 + dz * 0.075));
    const woodMesh = new THREE.Mesh(mergeColored(g), wood);
    woodMesh.castShadow = true;
    woodMesh.receiveShadow = true;

    const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), face);
    faceMesh.position.set(0, lift + h / 2, 0.066);

    const flagMesh = new THREE.Mesh(flagGeometry(w, postX, postTop, top), flags);
    this.group.add(woodMesh, faceMesh, flagMesh);
    this.group.position.set(spec.x, spec.y, spec.z);
    this.group.rotation.y = spec.yaw;
    for (const m of [woodMesh, faceMesh, flagMesh]) {
      m.matrixAutoUpdate = false;
      m.updateMatrix();
    }
  }
}

/** Флажки на верёвке между макушками столбов и две вяленые рыбки на бечёвках по краям козырька (aTip — насколько вершина качается) */
function flagGeometry(w: number, postX: number, postTop: number, top: number): G {
  const pos: number[] = [];
  const col: number[] = [];
  const tip: number[] = [];
  const phase: number[] = [];
  const c = new THREE.Color();
  const push = (x: number, y: number, z: number, k: number, ph: number): void => {
    pos.push(x, y, z);
    col.push(c.r, c.g, c.b);
    tip.push(k);
    phase.push(ph);
  };
  // верёвка с флажками: провисает на 0,16 м
  const ropeAt = (t: number): [number, number] => [-postX + t * 2 * postX, postTop - 0.12 - Math.sin(t * Math.PI) * 0.16];
  const n = Math.max(6, Math.round((2 * postX) / 0.42));
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ropeAt((i + 0.12) / n);
    const [x1, y1] = ropeAt((i + 0.88) / n);
    c.setHex(FLAGS[i % FLAGS.length]);
    const ph = i * 1.7;
    push(x0, y0, 0, 0, ph);
    push(x1, y1, 0, 0, ph);
    push((x0 + x1) / 2, (y0 + y1) / 2 - 0.34, 0, 1, ph);
  }
  // тонкая «верёвка» — узкая лента из треугольников (без отдельной отрисовки линиями), на 2 см за флажками
  c.setHex(0x3a2c20);
  for (let i = 0; i < n * 2; i++) {
    const [x0, y0] = ropeAt(i / (n * 2));
    const [x1, y1] = ropeAt((i + 1) / (n * 2));
    push(x0, y0 + 0.012, -0.02, 0, 0);
    push(x1, y1 + 0.012, -0.02, 0, 0);
    push(x1, y1 - 0.013, -0.02, 0, 0);
    push(x0, y0 + 0.012, -0.02, 0, 0);
    push(x1, y1 - 0.013, -0.02, 0, 0);
    push(x0, y0 - 0.013, -0.02, 0, 0);
  }
  // рыбки: бечёвка с конца козырька, рыба головой вверх
  const fishShape = new THREE.Shape();
  fishShape.moveTo(0, 0.3);
  fishShape.quadraticCurveTo(0.11, 0.16, 0.08, -0.06);
  fishShape.quadraticCurveTo(0.05, -0.14, 0, -0.17);
  fishShape.lineTo(0.1, -0.3);
  fishShape.lineTo(-0.1, -0.3);
  fishShape.lineTo(0, -0.17);
  fishShape.quadraticCurveTo(-0.05, -0.14, -0.08, -0.06);
  fishShape.quadraticCurveTo(-0.11, 0.16, 0, 0.3);
  const fish = new THREE.ShapeGeometry(fishShape, 4).toNonIndexed();
  const fp = fish.getAttribute('position');
  for (const [s, color] of [[-1, 0xe8642c], [1, 0xb9c6cc]] as const) {
    const hx = s * (w / 2 + 0.2);
    const hy = top + 0.14;
    const cy = hy - 0.28 - 0.3;
    c.setHex(color);
    for (let i = 0; i < fp.count; i++) {
      const y = cy + fp.getY(i);
      push(hx + fp.getX(i), y, 0.06, Math.min(1.4, (hy - y) / 0.6), s * 2.1);
    }
    // бечёвка
    c.setHex(0x3a2c20);
    const k = 0.5;
    push(hx - 0.008, hy, 0.06, 0, s * 2.1);
    push(hx + 0.008, hy, 0.06, 0, s * 2.1);
    push(hx + 0.008, cy + 0.3, 0.06, k, s * 2.1);
    push(hx - 0.008, hy, 0.06, 0, s * 2.1);
    push(hx + 0.008, cy + 0.3, 0.06, k, s * 2.1);
    push(hx - 0.008, cy + 0.3, 0.06, k, s * 2.1);
  }
  fish.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius += 0.4;
  return g;
}

/** Обе вывески сезона: у Семёна и на баркасе. Видимость — с рыбалкой 2.0 (как Семён). */
export class SeasonSigns {
  readonly group = new THREE.Group();
  private readonly signs: SignMesh[] = [];
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private readonly face: THREE.MeshStandardMaterial;
  private readonly uT = { value: 0 };
  private readonly uAmp = { value: 0.35 };
  private readonly uShine = { value: -9 };
  private bg: HTMLImageElement | null = null;
  private key = '';
  private phase: SeasonSignPhase = 'none';
  private t = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'season-signs';
    const canvas = document.createElement('canvas');
    canvas.width = CW;
    canvas.height = CH;
    this.ctx = canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.face = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.8, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.28 });
    const uShine = this.uShine;
    this.face.onBeforeCompile = (shader) => {
      shader.uniforms.uShine = uShine;
      shader.fragmentShader = 'uniform float uShine;\n' + shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float shineD = vMapUv.x * 0.85 + vMapUv.y * 0.3 - uShine;
        totalEmissiveRadiance += vec3(1.0, 0.92, 0.72) * exp(-shineD * shineD * 320.0) * 0.5;`,
      );
    };
    this.face.customProgramCacheKey = () => 'season-sign-face';
    const wood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02 });
    const flags = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    const { uT, uAmp } = this;
    flags.onBeforeCompile = (shader) => {
      shader.uniforms.uT = uT;
      shader.uniforms.uAmp = uAmp;
      shader.vertexShader = 'uniform float uT;\nuniform float uAmp;\nattribute float aTip;\nattribute float aPhase;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float sw = sin(uT * 4.6 + aPhase) * 0.11 + sin(uT * 7.9 + aPhase * 1.7) * 0.04;
        transformed.z += (sw * uAmp + 0.04) * aTip;
        transformed.x += sin(uT * 2.7 + aPhase * 0.6) * 0.07 * uAmp * aTip;`,
      );
    };
    flags.customProgramCacheKey = () => 'season-sign-flags';

    for (const spot of [SEASON_SIGN_SPOTS.house, SEASON_SIGN_SPOTS.barkas]) {
      const s = new SignMesh(spot, this.face, wood, flags);
      s.group.updateMatrixWorld(true);
      this.signs.push(s);
      this.group.add(s.group);
    }
    this.group.visible = false;
    scene.add(this.group);

    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      this.bg = img;
      this.key = '';
    };
    img.src = BG_URL;
    this.draw(seasonSignView(null));
  }

  /** Раз в кадр: camera — где камера (вдали доски не рисуются) */
  update(dt: number, camera: THREE.Vector3): void {
    if (!this.group.visible) return;
    let near = false;
    for (const s of this.signs) {
      const p = s.group.position;
      const vis = (camera.x - p.x) ** 2 + (camera.z - p.z) ** 2 < FAR * FAR;
      s.group.visible = vis;
      near ||= vis;
    }
    if (!near) return;
    this.t += Math.min(dt, 0.1);
    const v = seasonSignView(FISH_SEASON.state());
    const key = `${v.phase}|${v.title}|${v.big}|${v.sub}`;
    if (key !== this.key) {
      this.key = key;
      this.phase = v.phase;
      this.draw(v);
    }
    const t = this.t;
    this.uT.value = t;
    const on = this.phase === 'on';
    const soon = this.phase === 'soon';
    this.uAmp.value += ((on ? 1.25 : soon ? 0.7 : 0.35) - this.uAmp.value) * Math.min(1, dt * 2);
    // скоро — доска мигает; идёт — светится и по ней бежит блеск
    this.face.emissiveIntensity = soon ? 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2.4)) : on ? 0.48 + 0.08 * Math.sin(t * 3) : 0.28;
    this.uShine.value = on ? -0.4 + ((t % 3) / 1.3) * 1.9 : -9;
  }

  private draw(v: SeasonSignView): void {
    const c = this.ctx;
    c.clearRect(0, 0, CW, CH);
    if (this.bg) c.drawImage(this.bg, 0, 0, CW, CH);
    else {
      c.fillStyle = '#c99a62';
      c.fillRect(0, 0, CW, CH);
      c.fillStyle = 'rgba(80,50,25,.25)';
      for (let y = 70; y < CH; y += 96) c.fillRect(0, y, CW, 4);
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    const cream = 'rgba(255,247,228,.95)';
    if (v.phase === 'on') {
      // праздничная лента под заголовком
      c.fillStyle = '#c8321e';
      ribbon(c, 150, 52, CW - 300, 104);
      text(c, v.title, 104, 80, 900, '#fff7e6', 'rgba(90,20,10,.6)', 8, CW - 360);
      text(c, v.big, 292, 170, 900, '#c8321e', cream, 18, 800);
      text(c, v.sub, 462, 66, 800, '#3b2314', cream, 12, 790);
      // рыбки по бокам заголовка
      fishIcon(c, 118, 104, 1, '#f4f1e8');
      fishIcon(c, CW - 118, 104, -1, '#f4f1e8');
      return this.done();
    }
    const soon = v.phase === 'soon';
    text(c, v.title, 104, 80, 900, soon ? '#c0392b' : '#4a2a16', cream, 12, 790);
    text(c, v.big, 288, 214, 900, '#3b2314', cream, 18, 780);
    text(c, v.sub, 462, 66, 800, soon ? '#b03a2e' : '#2f5d3a', cream, 12, 790);
    this.done();
  }

  private done(): void {
    this.tex.needsUpdate = true;
  }
}

/** Строка по центру: обводка светлым (читается издалека на дереве), шрифт ужимается под ширину */
function text(c: CanvasRenderingContext2D, s: string, y: number, size: number, weight: number, fill: string, stroke: string, lw: number, maxW: number): void {
  c.font = `${weight} ${size}px ${FONT}`;
  const w = c.measureText(s).width;
  if (w > maxW) c.font = `${weight} ${Math.floor((size * maxW) / w)}px ${FONT}`;
  c.strokeStyle = stroke;
  c.lineWidth = lw;
  c.strokeText(s, CW / 2, y);
  c.fillStyle = fill;
  c.fillText(s, CW / 2, y);
}

/** Лента с «ласточкиными хвостами» по краям */
function ribbon(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const n = 26;
  c.beginPath();
  c.moveTo(x - n, y);
  c.lineTo(x + w + n, y);
  c.lineTo(x + w + n - 18, y + h / 2);
  c.lineTo(x + w + n, y + h);
  c.lineTo(x - n, y + h);
  c.lineTo(x - n + 18, y + h / 2);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(255,240,220,.85)';
  c.lineWidth = 4;
  c.stroke();
}

/** Рыбка-значок (dir — куда смотрит) */
function fishIcon(c: CanvasRenderingContext2D, x: number, y: number, dir: number, color: string): void {
  c.save();
  c.translate(x, y);
  c.scale(dir, 1);
  c.fillStyle = color;
  c.strokeStyle = 'rgba(90,20,10,.7)';
  c.lineWidth = 4;
  c.beginPath();
  c.ellipse(8, 0, 30, 17, 0, 0, Math.PI * 2);
  c.moveTo(-18, 0);
  c.lineTo(-40, -16);
  c.lineTo(-40, 16);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#3b2314';
  c.beginPath();
  c.arc(24, -4, 4, 0, Math.PI * 2);
  c.fill();
  c.restore();
}
