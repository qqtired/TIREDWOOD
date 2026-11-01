// Вешалка ремёсел во дворе крепости (Т-4, shared/fortideas.ts RACK): деревянная стойка-вешалка, как в прихожей, —
// на четырёх рожках «болванки» (верх желейки из дерева), на них те же шапки ремёсел, что надеваются на желейку
// (геометрия из client/render/outfit3d.ts, без копий). У ног — ящик с мелочами ремёсел и табуретка: тут берут шапку.
// Ноги в y = 0, лицом к +Z, высота ~1,9 м, след ~1,3 × 1,1 м. Три отрисовки: дерево и шапки (цвета в вершинах),
// латунь и золото шапок, светящееся (фонарь подрывника, фитиль) — параметры как у вещей желеек (client/render/avatar.ts),
// поэтому новых программ шейдеров нет.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BODY_H, bodyProfile, col, wearOf } from '../../../render/outfit3d.ts';
import { metalEnvTexture } from '../../../render/textures.ts';

type Geo = THREE.BufferGeometry;

const WOOD = 0x9a6a3e;
const WOOD_DARK = 0x6e4a2a;
const WOOD_LIGHT = 0xc08a55;
const IRON = 0x4a4a52;
/** Шапки на вешалке чуть меньше, чем на желейке */
const S = 0.78;
/** Рожки: шапка, x, высота низа болванки, z, поворот шапки (лицом к +Z — π) */
const PEGS: ReadonlyArray<readonly [string, number, number, number, number]> = [
  ['craft-mason', -0.47, 0.98, 0.3, Math.PI - 0.25],
  ['craft-sapper', 0.47, 0.98, 0.3, Math.PI + 0.25],
  ['craft-gunner', -0.44, 1.42, -0.24, Math.PI - 0.15],
  ['craft-rifle', 0.44, 1.42, -0.24, Math.PI + 0.35],
];
/** Болванка — верх желейки от этой высоты до макушки */
const FORM_FROM = 1.2;

function strip(g: Geo): Geo {
  const n = g.index ? g.toNonIndexed() : g;
  if (n.getAttribute('uv')) n.deleteAttribute('uv');
  if (!n.getAttribute('normal')) n.computeVertexNormals();
  return n;
}

function mergeAll(list: Geo[], withColor: boolean): Geo | null {
  if (!list.length) return null;
  const ready = list.map((g) => {
    const n = strip(g);
    if (!withColor && n.getAttribute('color')) n.deleteAttribute('color');
    return n;
  });
  const g = mergeGeometries(ready, false);
  if (!g) throw new Error('rack3d: не склеилось');
  g.computeBoundingSphere();
  return g;
}

/** Доска с прожилками: светлее по краям, темнее по середине (цвета по граням) */
function plank(w: number, h: number, d: number, hex: number): Geo {
  return col(new THREE.BoxGeometry(w, h, d), hex);
}

function legs(): Geo[] {
  const out: Geo[] = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    const pts = [new THREE.Vector3(0, 0.42, 0), new THREE.Vector3(sx * 0.16, 0.2, sz * 0.16), new THREE.Vector3(sx * 0.36, 0.05, sz * 0.36), new THREE.Vector3(sx * 0.44, 0.035, sz * 0.44)];
    out.push(col(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.035, 6, false), WOOD_DARK));
    out.push(col(new THREE.SphereGeometry(0.05, 8, 5).scale(1, 0.55, 1).translate(sx * 0.45, 0.028, sz * 0.45), WOOD_DARK));
  }
  return out;
}

/** Рожок: изогнутая ветка от стойки к блюдцу под болванкой */
function arm(x: number, y: number, z: number): Geo[] {
  const pts = [new THREE.Vector3(0, y - 0.22, 0), new THREE.Vector3(x * 0.45, y - 0.2, z * 0.45), new THREE.Vector3(x * 0.9, y - 0.12, z * 0.9), new THREE.Vector3(x, y - 0.02, z)];
  return [
    col(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.03, 6, false), WOOD),
    col(new THREE.CylinderGeometry(0.11, 0.08, 0.035, 12).translate(x, y - 0.012, z), WOOD_DARK),
  ];
}

/** Болванка под шапку: верх желейки из светлого дерева, чуть меньше тела — шапка садится, как на голову */
function form(x: number, y: number, z: number): Geo {
  const pts = bodyProfile().filter((p) => p.y >= FORM_FROM - 0.02).map((p) => new THREE.Vector2(Math.max(0.001, p.x * 0.97), p.y));
  pts.unshift(new THREE.Vector2(0.001, FORM_FROM - 0.02));
  return col(new THREE.LatheGeometry(pts, 14).translate(0, -(FORM_FROM - 0.02), 0).scale(S, S, S).translate(x, y, z), WOOD_LIGHT);
}

/** Ящик из досок: каркас темнее, стенки светлее; внутри — ядро и моток шнура (мелочи ремёсел) */
function crate(x: number, z: number, yaw: number): Geo[] {
  const W = 0.5;
  const H = 0.36;
  const D = 0.38;
  const t = 0.025;
  const parts: Geo[] = [
    plank(W, 0.03, D, WOOD_DARK).translate(0, 0.015, 0),
    plank(W, H, t, WOOD).translate(0, H / 2, D / 2 - t / 2),
    plank(W, H, t, WOOD).translate(0, H / 2, -D / 2 + t / 2),
    plank(t, H, D - 2 * t, WOOD).translate(W / 2 - t / 2, H / 2, 0),
    plank(t, H, D - 2 * t, WOOD).translate(-W / 2 + t / 2, H / 2, 0),
  ];
  // планки поперёк и уголки — темнее (зазор 1,5 см от стенки, чтобы не мерцали)
  for (const s of [-1, 1]) {
    parts.push(plank(W + 0.004, 0.05, 0.02, WOOD_DARK).translate(0, H * (s > 0 ? 0.78 : 0.25), D / 2 + 0.012));
    parts.push(plank(0.05, H + 0.01, 0.02, WOOD_DARK).translate(s * (W / 2 - 0.025), H / 2, D / 2 + 0.013));
  }
  parts.push(col(new THREE.SphereGeometry(0.08, 10, 7).translate(-0.1, H - 0.03, -0.03), 0x2f2f34));
  parts.push(col(new THREE.TorusGeometry(0.075, 0.022, 6, 14).rotateX(Math.PI / 2 - 0.3).translate(0.11, H - 0.01, 0.02), 0xc9a66b));
  parts.push(col(new THREE.BoxGeometry(0.22, 0.04, 0.09).rotateZ(0.25).translate(0.02, H + 0.01, -0.08), 0xb8463a));
  return parts.map((g) => g.rotateY(yaw).translate(x, 0, z));
}

function stool(x: number, z: number): Geo[] {
  const parts: Geo[] = [col(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 14).translate(0, 0.47, 0), WOOD_LIGHT)];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    parts.push(col(new THREE.CylinderGeometry(0.022, 0.026, 0.47, 6).rotateZ(Math.cos(a) * 0.16).rotateX(-Math.sin(a) * 0.16).translate(Math.sin(a) * 0.14, 0.23, Math.cos(a) * 0.14), WOOD_DARK));
  }
  return parts.map((g) => g.translate(x, 0, z));
}

let shared: { main: Geo; metal: Geo | null; glow: Geo | null } | null = null;

function build(): { main: Geo; metal: Geo | null; glow: Geo | null } {
  const main: Geo[] = [];
  const metal: Geo[] = [];
  const glow: Geo[] = [];
  // стойка: восьмигранный столб, обручи, точёное навершие
  main.push(col(new THREE.CylinderGeometry(0.05, 0.065, 1.84, 8).translate(0, 0.92, 0), WOOD));
  for (const y of [0.42, 1.12, 1.58]) main.push(col(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 8).translate(0, y, 0), WOOD_DARK));
  main.push(col(new THREE.SphereGeometry(0.075, 10, 7).translate(0, 1.86, 0), WOOD_DARK));
  main.push(col(new THREE.ConeGeometry(0.03, 0.06, 8).translate(0, 1.95, 0), WOOD_DARK));
  main.push(...legs());
  // железные крючки повыше — для порядка (на них ничего не висит, просто вешалка)
  for (const a of [Math.PI / 2, -Math.PI / 2]) {
    const pts = [new THREE.Vector3(0, 1.74, 0), new THREE.Vector3(Math.sin(a) * 0.16, 1.73, Math.cos(a) * 0.16), new THREE.Vector3(Math.sin(a) * 0.2, 1.79, Math.cos(a) * 0.2)];
    main.push(col(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.012, 5, false), IRON));
  }
  for (const [key, x, y, z, yaw] of PEGS) {
    main.push(...arm(x, y, z));
    main.push(form(x, y, z));
    // шапка сидит на болванке, как на голове: макушка тела — на макушке болванки
    const top = y + (BODY_H - (FORM_FROM - 0.02)) * S;
    const w = wearOf('h', key);
    const place = (g: Geo) => g.clone().translate(0, w.y - BODY_H, 0).scale(S, S, S).rotateY(yaw).translate(x, top, z);
    if (w.geo) main.push(place(w.geo));
    if (w.metal) metal.push(place(w.metal));
    if (w.glow) glow.push(place(w.glow));
  }
  main.push(...crate(-0.5, 0.52, 0.2));
  main.push(...stool(0.52, 0.5));
  return { main: mergeAll(main, true)!, metal: mergeAll(metal, false), glow: mergeAll(glow, true) };
}

/** Новая вешалка (геометрия общая — строится один раз, материалы свои на каждую вешалку) */
export function createCraftRack(): THREE.Group {
  shared ??= build();
  const group = new THREE.Group();
  group.name = 'craft-rack';
  // как вещи желеек (client/render/avatar.ts): цвета в вершинах, двусторонний — поля шапок одной поверхностью
  const outfit = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.04, side: THREE.DoubleSide });
  const main = new THREE.Mesh(shared.main, outfit);
  main.castShadow = true;
  main.receiveShadow = true;
  group.add(main);
  if (shared.metal) {
    const m = new THREE.Mesh(shared.metal, new THREE.MeshStandardMaterial({ color: 0xd4a93a, metalness: 0.9, roughness: 0.3, envMap: metalEnvTexture(), envMapIntensity: 1.15, side: THREE.DoubleSide }));
    m.castShadow = true;
    group.add(m);
  }
  if (shared.glow) {
    const g = outfit.clone();
    g.emissive.set(0xffb43a);
    g.emissiveIntensity = 1.6;
    group.add(new THREE.Mesh(shared.glow, g));
  }
  return group;
}

/** Треугольников в вешалке (для стенда и отчёта) */
export function craftRackTris(): number {
  shared ??= build();
  let n = 0;
  for (const g of [shared.main, shared.metal, shared.glow]) if (g) n += g.getAttribute('position').count / 3;
  return n;
}
