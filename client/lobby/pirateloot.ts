// «Набег пиратов»: добыча на причале и ядро — ящик с рыбой (светлые доски, хвосты и головы рыб из-под колотого льда,
// ярлык), бочка (тёплое дерево, цветные обручи, белая рыбка-клеймо на боку), чугунное ядро с бликом. Геометрии с
// цветами вершин (атрибут color), подставка в y = 0, общий материал. Заготовки (crateGeo, barrelGeo, ballGeo) берут
// и пираты (несут ящик и бочку — облегчённые, lite), и шлюпка (груз), и пушка (пирамидка ядер).
import * as THREE from 'three';
import { colored, merge } from '../fort/mobs/kit.ts';
import { mergeColored, paint } from '../fort/mobs/sea-shapes.ts';

export interface LootKit {
  crate: THREE.BufferGeometry;
  barrel: THREE.BufferGeometry;
  ball: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}

/** Ящик: ширина (X), высота, глубина (Z) */
export const CRATE = { w: 0.7, h: 0.45, d: 0.5 } as const;
/** Бочка: наибольший радиус, высота */
export const BARREL = { r: 0.275, h: 0.75 } as const;
export const BALL_R = 0.15;

const WOOD = 0xe2b979;
const WOOD2 = 0xcf9f5e;
const POST = 0xa8743f;
const ICE = 0xeaf6ff;
const ICE2 = 0xc9e4f4;
/** Рыбы: серебристая, голубая, оранжевая (окунь) */
const FISH: ReadonlyArray<readonly [number, number]> = [[0xb9c8d6, 0x7f93a8], [0x5fa8e0, 0x3a73b0], [0xf08a3c, 0xc8602a]];

/** Рыба: тело-веретено, хвост, глаз (не у облегчённой); нос по +X, начало — середина тела */
function fishGeo(len: number, body: number, back: number, seg: number, eye = true): THREE.BufferGeometry {
  const r = len * 0.2;
  const b = paint(new THREE.SphereGeometry(1, seg, Math.max(3, seg - 2)).scale(len / 2, r, r * 0.62), (p, _n, o) => o.setHex(p.y > r * 0.25 ? back : body));
  const tail = colored(new THREE.ConeGeometry(r * 0.95, len * 0.32, 3, 1).rotateZ(Math.PI / 2).scale(1, 1, 0.3).translate(-len * 0.6, 0, 0), back);
  if (!eye) return mergeColored([b, tail]);
  const e = colored(new THREE.SphereGeometry(r * 0.28, 4, 3).translate(len * 0.33, r * 0.25, r * 0.5), 0x1d2230);
  return mergeColored([b, tail, e]);
}

/**
 * Ящик с рыбой ≈ 0,7 × 0,45 × 0,5 м. lite — облегчённый (≈ 140 треугольников): в руках у пирата и в шлюпке.
 */
export function crateGeo(lite = false): THREE.BufferGeometry {
  const { w, h, d } = CRATE;
  const rows = 2;
  // доски: ряды по высоте, щели темнее; цвет — по грани (чёткие полосы)
  const box = paint(new THREE.BoxGeometry(w, h, d, 1, rows, 1).translate(0, h / 2, 0), (p, n, o) => {
    if (Math.abs(n.y) > 0.5) o.setHex(WOOD2);
    else o.setHex(Math.floor((p.y / h) * rows) % 2 ? WOOD2 : WOOD);
  }, true);
  const parts: THREE.BufferGeometry[] = [box];
  if (!lite) {
    // угловые стойки и обвязка верха
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(colored(new THREE.BoxGeometry(0.06, h + 0.02, 0.06).translate(sx * (w / 2 - 0.02), h / 2, sz * (d / 2 - 0.02)), POST));
    parts.push(colored(new THREE.BoxGeometry(w + 0.03, 0.05, 0.05).translate(0, h - 0.01, d / 2), POST));
    parts.push(colored(new THREE.BoxGeometry(w + 0.03, 0.05, 0.05).translate(0, h - 0.01, -d / 2), POST));
    // ярлык спереди: кремовая карточка
    parts.push(colored(new THREE.BoxGeometry(0.22, 0.13, 0.012).translate(0.12, h * 0.48, d / 2 + 0.006), 0xf6efd8));
  }
  // колотый лёд горкой сверху
  const ice: Array<readonly [number, number, number, number]> = lite
    ? [[0.02, 0, 0.26, 0]]
    : [[-0.2, 0.06, 0.17, 0], [0.05, -0.08, 0.2, 1], [0.22, 0.08, 0.15, 0]];
  for (const [x, z, r, k] of ice) parts.push(colored(new THREE.SphereGeometry(r, 5, 3).scale(1, 0.38, 0.8).translate(x, h + 0.01, z), k ? ICE2 : ICE));
  // рыбы торчат из-подо льда: головы и хвосты
  const fish: Array<readonly [number, number, number, number, number, number]> = lite
    ? [[-0.05, 0.06, 0.05, 0.5, 0.25, 0], [0.12, 0.05, -0.08, -0.6, -0.3, 2]]
    : [[-0.12, 0.07, 0.1, 0.55, 0.2, 0], [0.18, 0.06, -0.06, -0.7, -0.35, 1], [0.0, 0.08, -0.12, 0.35, 2.6, 2], [-0.22, 0.05, -0.1, -0.5, 1.9, 1]];
  for (const [x, y, z, tilt, yaw, k] of fish) {
    const g = fishGeo(0.32, FISH[k][0], FISH[k][1], lite ? 5 : 6, !lite);
    g.rotateZ(tilt).rotateY(yaw).translate(x, h + y, z);
    parts.push(g);
  }
  return merge(parts);
}

/** Профиль бочки по высоте 0…1 (пузо посередине) */
function barrelR(u: number): number {
  return BARREL.r * (0.84 + 0.16 * Math.sin(Math.PI * u));
}

/** Бочка ≈ Ø 0,55 × 0,75 м: клёпки через одну темнее, обручи (красные и латунный), белая рыбка-клеймо на боку */
export function barrelGeo(lite = false): THREE.BufferGeometry {
  const { h } = BARREL;
  const seg = lite ? 8 : 12;
  const us = lite ? [0, 0.1, 0.5, 0.9, 1] : [0, 0.07, 0.13, 0.3, 0.5, 0.7, 0.87, 0.93, 1];
  const pts = us.map((u) => new THREE.Vector2(barrelR(u), u * h));
  const hoop = (u: number) => (u > 0.06 && u < 0.14) || (u > 0.86 && u < 0.94);
  const side = paint(new THREE.LatheGeometry(pts, seg), (p, _n, o) => {
    const u = p.y / h;
    const a = Math.atan2(p.x, p.z);
    const stave = Math.floor(((a + Math.PI) / (Math.PI * 2)) * seg) % 2;
    if (hoop(u)) o.setHex(0xc8402c);
    else if (Math.abs(u - 0.5) < 0.06) o.setHex(0xd9b04a);
    else o.setHex(stave ? 0xb87a44 : 0xa86c3a);
    // клеймо: светлое пятно-рыбка на боку (+Z)
    if (!lite && p.z > 0 && Math.abs(p.x) < 0.12 && u > 0.2 && u < 0.42) o.setHex(0xf3ead2);
  }, true);
  const lidR = barrelR(0) - 0.01;
  const lid = paint(new THREE.CircleGeometry(lidR, seg).rotateX(-Math.PI / 2).translate(0, h - 0.005, 0), (p, _n, o) => o.setHex(Math.hypot(p.x, p.z) > lidR * 0.75 ? 0x8a5530 : 0xc08a52), true);
  const bottom = colored(new THREE.CircleGeometry(lidR, seg).rotateX(Math.PI / 2).translate(0, 0.005, 0), 0x6e4426);
  return merge([side, lid, bottom]);
}

/** Ядро Ø 0,3 м: тёмный чугун и блик слева сверху (цветами вершин); подставка в y = 0 */
export function ballGeo(): THREE.BufferGeometry {
  const hi = new THREE.Vector3(-0.45, 0.75, 0.5).normalize();
  const dark = new THREE.Color(0x23272f);
  const lite = new THREE.Color(0x9aa6b8);
  return merge([paint(new THREE.SphereGeometry(BALL_R, 10, 7).translate(0, BALL_R, 0), (p, n, o) => {
    const k = Math.max(0, n.dot(hi));
    o.copy(dark).lerp(lite, Math.pow(k, 6) * 0.9);
    if (p.y < BALL_R * 0.3) o.multiplyScalar(0.8);
  })]);
}

/** Общий материал добычи: цвета вершин, мягкий блеск */
export function lootMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
}

/** Новый набор добычи (каждый вызов — свои геометрии и материал: освобождает тот, кто построил) */
export function buildLoot(): LootKit {
  return { crate: crateGeo(), barrel: barrelGeo(), ball: ballGeo(), material: lootMaterial() };
}
