// Командная экипировка пейнтбола: жилет-манишка цвета команды с крупной эмблемой (ягода черники, долька мандарина),
// кайма цвета команды по контуру и значок-метка над своими. Всё это только когда у желейки есть команда (в пейнтболе);
// на набережной, в картинге и в примерочной аватары такие же, как были.
//
// Жилет — одна оболочка вокруг живота (шапки, лицо и очки не затронуты). Геометрия и текстуры общие на всех,
// материал свой у каждой желейки: он берёт те же uniforms, что и тело (качание, наклон, вспышка, кайма),
// поэтому жилет облегает желе при любых прыжках и попаданиях. На игрока выходит один вызов отрисовки — столько же,
// сколько стоял прежний тонкий пояс. Кайма (JELLY_RIM_GLSL) — общий кусок шейдера тела и жилета.
import * as THREE from 'three';
import { TEAM_COLORS } from '../../shared/constants.ts';
import { BODY_H, bodyR } from './outfit3d.ts';

// ------------------------------------------------------------ форма жилета

/** Нижний край жилета (м над ногами) и верх: сзади выше, спереди ниже — под бабочкой, цепью и хвостами шарфа */
export const VEST_Y0 = 0.09;
const TOP_BACK = 0.8;
const TOP_FRONT = 0.7;
/** Насколько жилет приподнят над телом посередине и по краям, м (стёганый, «надутый») */
const PUFF_MID = 0.032;
const PUFF_EDGE = 0.012;

const SEG = 64;
const ROWS = 7;

/** Верхний край жилета в направлении phi (0 — спина, π — лицо), м. */
export function vestTop(phi: number): number {
  return (TOP_FRONT + TOP_BACK) / 2 + ((TOP_BACK - TOP_FRONT) / 2) * Math.cos(phi);
}

/** Насколько жилет над телом на доле высоты t (0 — низ, 1 — верх). */
function puff(t: number): number {
  return PUFF_EDGE + (PUFF_MID - PUFF_EDGE) * Math.pow(Math.sin(Math.PI * clamp01(t)), 0.7);
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Внешний радиус жилета на высоте y в направлении phi; null — здесь жилета нет (ниже нижнего или выше верхнего края).
 * Нужен кляксам краски: попадание в жилет ложится сверху, а не под него.
 */
export function vestRadius(y: number, phi: number): number | null {
  const top = vestTop(phi);
  if (y < VEST_Y0 || y > top) return null;
  return bodyR(y) + puff((y - VEST_Y0) / (top - VEST_Y0));
}

/**
 * Оболочка жилета: поверхность вращения вокруг оси тела, верхний край зависит от направления.
 * u по кругу (шов на левом боку: u = 0, спина — 0,25, правый бок — 0,5, лицо — 0,75), v снизу вверх.
 */
export function buildVestGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const ring = ROWS + 1;
  for (let i = 0; i <= SEG; i++) {
    const phi = -Math.PI / 2 + (i / SEG) * Math.PI * 2;
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    const top = vestTop(phi);
    const ys: number[] = [];
    const rs: number[] = [];
    for (let j = 0; j <= ROWS; j++) {
      const t = j / ROWS;
      const y = VEST_Y0 + t * (top - VEST_Y0);
      ys.push(y);
      rs.push(bodyR(y) + puff(t));
    }
    for (let j = 0; j <= ROWS; j++) {
      const a = Math.max(0, j - 1);
      const b = Math.min(ROWS, j + 1);
      const slope = (rs[b] - rs[a]) / (ys[b] - ys[a]);
      const nl = Math.hypot(1, slope);
      pos.push(rs[j] * sp, ys[j], rs[j] * cp);
      nor.push(sp / nl, -slope / nl, cp / nl);
      uv.push(i / SEG, j / ROWS);
    }
  }
  for (let i = 0; i < SEG; i++) {
    for (let j = 0; j < ROWS; j++) {
      const a = i * ring + j;
      const b = (i + 1) * ring + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

let vestGeo: THREE.BufferGeometry | null = null;

/** Оболочка жилета, общая для всех желеек и обеих команд (различаются только текстурой). */
export function vestGeometry(): THREE.BufferGeometry {
  vestGeo ??= buildVestGeometry();
  return vestGeo;
}

// ------------------------------------------------------------ шейдер: движение и подсветка края

/** Насколько ярче цвета команды красится кайма: чуть светится, чтобы не темнеть на фоне освещённого тела */
const RIM_TINT_GAIN = 1.7;

/** Качание, наклон макушки и «желейная» дрожь при попадании — как у тела (по высоте в осях тела). */
export const JELLY_SWAY_GLSL = /* glsl */ `
  float hh = clamp(position.y / ${BODY_H.toFixed(2)}, 0.0, 1.0);
  float wob = sin(uTime * 2.7 + hh * 2.5) * 0.014 + uWobble * sin(uTime * 23.0 - hh * 6.0) * hh * 0.17;
  transformed.xz *= 1.0 + wob;
  transformed.xz += uLean * (hh * hh);`;

/**
 * Край желейки: добавка цвета uRim силой uRimK (мягкий отсвет набережной) и окраска в цвет команды силой uRimMix
 * (пейнтбол: край не белеет, а становится синим или оранжевым — на любом теле). Чем дальше от камеры (uRimFar > 0),
 * тем шире кайма — иначе на десятках метров от неё остаётся пара пикселей. С uRimMix = 0 и uRimFar = 0 — прежняя
 * подсветка набережной. Потом вспышка попадания.
 */
export const JELLY_RIM_GLSL = /* glsl */ `
  float rimFar = uRimFar * smoothstep(6.0, 45.0, length(vViewPosition));
  float rimF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), mix(2.4, 1.5, rimFar));
  outgoingLight += uRim * rimF * uRimK;
  outgoingLight = mix(outgoingLight, uRim * ${RIM_TINT_GAIN.toFixed(2)}, saturate(rimF * uRimMix * (1.0 + rimFar)));
  outgoingLight = mix(outgoingLight, vec3(1.0), uFlash);`;

/** Uniforms, которые жилет делит с телом желейки. */
export interface GearUniforms {
  uTime: THREE.IUniform<number>;
  uWobble: THREE.IUniform<number>;
  uLean: THREE.IUniform<THREE.Vector2>;
  uFlash: THREE.IUniform<number>;
  uRim: THREE.IUniform<THREE.Color>;
  uRimK: THREE.IUniform<number>;
  uRimMix: THREE.IUniform<number>;
  uRimFar: THREE.IUniform<number>;
}

/** Материал жилета одной желейки: узор — из текстуры команды, цвет чуть светится сам, чтобы не тонул в тени. */
export function makeGearMaterial(u: GearUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = 'uniform float uTime;\nuniform float uWobble;\nuniform vec2 uLean;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>${JELLY_SWAY_GLSL}`,
    );
    shader.fragmentShader = 'uniform vec3 uRim;\nuniform float uFlash;\nuniform float uRimK;\nuniform float uRimMix;\nuniform float uRimFar;\n' + shader.fragmentShader
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.1;')
      .replace('#include <opaque_fragment>', `${JELLY_RIM_GLSL}\n  #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'team-gear-v2';
  return mat;
}

// ------------------------------------------------------------ рисунки (холст)

const TEX_W = 2048;
const TEX_H = 256;
/** По этому радиусу текстура развёрнута по кругу: пикселей на метр вдоль окружности */
const PX_X = TEX_W / (2 * Math.PI * 0.54);

const TEAM_DARK = ['#161d78', '#8c3d00'] as const;
/** Ткань жилета сверху и снизу: темнее и насыщеннее цвета команды в интерфейсе — под ярким солнцем краска выцветает */
const CLOTH = [['#3445ea', '#1d29b0'], ['#ff7a0a', '#e04c00']] as const;
const TEAM_LIGHT = ['#cfd6ff', '#ffe2b8'] as const;
const WHITE_CREAM = '#fff8ea';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function teamCss(team: 0 | 1, k = 1): string {
  const c = new THREE.Color(TEAM_COLORS[team]);
  if (k < 1) c.multiplyScalar(k);
  else if (k > 1) c.lerp(new THREE.Color(0xffffff), k - 1);
  return `#${c.getHexString(THREE.SRGBColorSpace)}`;
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** Звезда с n лучами: наружный радиус R, внутренний r, один луч вверх. */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, r: number, n: number): void {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r : R;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

/** Ягода черники: тёмно-синий шар, светлая звёздочка-«корона» на вершине, блик. Рисуется в метрах вокруг (0, 0). */
function drawBerry(ctx: CanvasRenderingContext2D, r: number): void {
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#7a85ff');
  g.addColorStop(0.55, '#2f3ccb');
  g.addColorStop(1, '#161d78');
  ctx.fillStyle = g;
  circle(ctx, 0, 0, r);
  ctx.fill();
  ctx.fillStyle = TEAM_LIGHT[0];
  star(ctx, 0, r * 0.06, r * 0.42, r * 0.18, 5);
  ctx.fill();
  ctx.fillStyle = TEAM_DARK[0];
  circle(ctx, 0, r * 0.06, r * 0.075);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.5, -r * 0.5, r * 0.2, r * 0.11, -0.8, 0, Math.PI * 2);
  ctx.fill();
}

/** Долька мандарина: оранжевый круг с белой шкуркой по краю и восемью дольками, листик сверху. */
function drawMandarin(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.fillStyle = WHITE_CREAM;
  circle(ctx, 0, 0, r);
  ctx.fill();
  const g = ctx.createRadialGradient(0, -r * 0.2, r * 0.1, 0, 0, r * 0.9);
  g.addColorStop(0, '#ffb552');
  g.addColorStop(1, '#f06a00');
  ctx.fillStyle = g;
  circle(ctx, 0, 0, r * 0.86);
  ctx.fill();
  ctx.strokeStyle = TEAM_LIGHT[1];
  ctx.lineWidth = r * 0.085;
  ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
    ctx.lineTo(Math.cos(a) * r * 0.76, Math.sin(a) * r * 0.76);
    ctx.stroke();
  }
  ctx.fillStyle = WHITE_CREAM;
  circle(ctx, 0, 0, r * 0.15);
  ctx.fill();
  // листик
  ctx.save();
  ctx.translate(r * 0.2, -r * 0.8);
  ctx.rotate(0.55);
  ctx.fillStyle = '#3f9d3a';
  ctx.strokeStyle = '#1f6a24';
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(r * 0.5, -r * 0.34, r * 0.82, -r * 0.04);
  ctx.quadraticCurveTo(r * 0.45, r * 0.3, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Круглый знак команды: белая подложка с тёмным кантом и фрукт внутри. Рисуется в метрах вокруг (0, 0). */
function drawBadge(ctx: CanvasRenderingContext2D, team: 0 | 1, R: number): void {
  ctx.fillStyle = TEAM_DARK[team];
  circle(ctx, 0, 0, R);
  ctx.fill();
  ctx.fillStyle = WHITE_CREAM;
  circle(ctx, 0, 0, R * 0.9);
  ctx.fill();
  if (team === 0) drawBerry(ctx, R * 0.72);
  else drawMandarin(ctx, R * 0.74);
}

/** Выкройка жилета: цвет команды, стёжка, белый кант сверху и снизу, знак на спине и на груди, шевроны на боках. */
function drawVest(team: 0 | 1): HTMLCanvasElement {
  const [cv, ctx] = canvas(TEX_W, TEX_H);
  // пикселей на метр по высоте в направлении u (верхний край зависит от направления)
  const pxY = (u: number) => TEX_H / (vestTop(u * Math.PI * 2 - Math.PI / 2) - VEST_Y0);
  const g = ctx.createLinearGradient(0, 0, 0, TEX_H);
  g.addColorStop(0, CLOTH[team][0]);
  g.addColorStop(1, CLOTH[team][1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  // стёжка: тонкие пояса по кругу
  ctx.strokeStyle = TEAM_DARK[team];
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 3;
  for (const v of [0.3, 0.52, 0.74]) {
    ctx.beginPath();
    ctx.moveTo(0, TEX_H * (1 - v));
    ctx.lineTo(TEX_W, TEX_H * (1 - v));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // кант: белая полоса сверху и снизу с тёмной строчкой
  const pipe = 13;
  ctx.fillStyle = WHITE_CREAM;
  ctx.fillRect(0, 0, TEX_W, pipe);
  ctx.fillRect(0, TEX_H - pipe, TEX_W, pipe);
  ctx.fillStyle = TEAM_DARK[team];
  ctx.fillRect(0, pipe, TEX_W, 3);
  ctx.fillRect(0, TEX_H - pipe - 3, TEX_W, 3);
  // знаки: спина (u = 0,25), лицо (0,75) — большие; бока (0 и 0,5) — поменьше
  const marks: Array<[number, number, number]> = [[0.25, 0.19, 0.5], [0.75, 0.19, 0.5], [0.5, 0.09, 0.56], [0, 0.09, 0.56], [1, 0.09, 0.56]];
  for (const [u, R, v] of marks) {
    ctx.save();
    ctx.translate(u * TEX_W, TEX_H * (1 - v));
    ctx.scale(PX_X, pxY(u));
    drawBadge(ctx, team, R);
    ctx.restore();
  }
  return cv;
}

function toTexture(cv: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

const vestTex: Array<THREE.CanvasTexture | null> = [null, null];

/** Текстура жилета команды (одна на всех желеек команды). */
export function vestTexture(team: 0 | 1): THREE.CanvasTexture {
  return (vestTex[team] ??= toTexture(drawVest(team)));
}

/** Значок над головой своего: круглая «пуговица» цвета команды со знаком (звёздочка черники, дольки мандарина) и остриём вниз. */
function drawPin(team: 0 | 1): HTMLCanvasElement {
  const S = 128;
  const [cv, ctx] = canvas(S, S);
  const cx = S / 2;
  const cy = 52;
  ctx.lineJoin = 'round';
  // остриё вниз
  ctx.beginPath();
  ctx.moveTo(cx - 22, cy + 30);
  ctx.lineTo(cx + 22, cy + 30);
  ctx.lineTo(cx, S - 8);
  ctx.closePath();
  ctx.fillStyle = teamCss(team);
  ctx.strokeStyle = WHITE_CREAM;
  ctx.lineWidth = 11;
  ctx.stroke();
  ctx.fill();
  // круг
  circle(ctx, cx, cy, 42);
  ctx.strokeStyle = WHITE_CREAM;
  ctx.lineWidth = 12;
  ctx.stroke();
  ctx.fillStyle = teamCss(team);
  ctx.fill();
  circle(ctx, cx, cy, 42);
  ctx.strokeStyle = TEAM_DARK[team];
  ctx.lineWidth = 3;
  ctx.stroke();
  // знак
  ctx.fillStyle = WHITE_CREAM;
  ctx.strokeStyle = WHITE_CREAM;
  if (team === 0) {
    star(ctx, cx, cy + 2, 25, 11, 5);
    ctx.fill();
  } else {
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9);
      ctx.lineTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26);
      ctx.stroke();
    }
  }
  return cv;
}

const pinTex: Array<THREE.CanvasTexture | null> = [null, null];

/** Текстура значка над своими (одна на команду). */
export function pinTexture(team: 0 | 1): THREE.CanvasTexture {
  if (!pinTex[team]) {
    const t = new THREE.CanvasTexture(drawPin(team));
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    pinTex[team] = t;
  }
  return pinTex[team]!;
}
