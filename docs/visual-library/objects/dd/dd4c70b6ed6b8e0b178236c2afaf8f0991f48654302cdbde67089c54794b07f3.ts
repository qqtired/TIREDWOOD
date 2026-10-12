// Убранство набережной: мозаика «роза ветров» в центре площади, деревья в кадках, цветочные ящики
// (на подоконниках склада и на восточном парапете), флажки над площадью между фонарями.
// Кроны и флажки шевелит ветер — в вершинном шейдере, от общего времени `wind` (его двигает LobbyWorld.update).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLANTERS, PLANTER_H, PLANTER_R } from '../../shared/maps/lobby.ts';
import { makeRng } from '../../shared/math.ts';
import { paint, place, staticMesh } from '../render/kit.ts';
import * as tex from '../render/textures.ts';

/** Мозаика: центр и радиус (перед точкой появления, север — к складу) */
const MOSAIC = { x: 0, z: 3.6, r: 3 };
const FLOWERS = [0xe8403a, 0xf27aa8, 0xf6f1e6, 0xf7c840, 0xa070dc, 0xff8a3c];
const LEAVES = [0x4f9a3a, 0x5fae42, 0x3f8a36];
const CROWN = [0x62a83c, 0x58a040, 0x6cb444];
/**
 * Флажки: на тех же фонарях, что и гирлянды у моря и на западе, на 0,3 м ниже и с тем же провисом —
 * вдоль края площади, чтобы не заслонять экран склада и вывески (x0, z0, x1, z1, провис).
 */
const BUNTING: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [-14, 16, 2, 16, 1.1],
  [2, 16, 14, 16, 0.9],
  [-14, -2, -14, 16, 1.2],
];
const BUNTING_Y = 4.45;
const PENNANT_W = 0.3;
const PENNANT_H = 0.36;
const PENNANTS = [0xe8473a, 0xf5c542, 0x3f8fd0, 0xf4f1e8, 0x4cae5b, 0xf08a3a];

/**
 * Качание на ветру: вершина сдвигается вбок на aSway × amp (aSway — атрибут геометрии: 0 у основания, 1 у макушки).
 * Фаза — от места (у инстансов — от сдвига инстанса), чтобы деревья качались не в ногу.
 */
export function windSway(mat: THREE.Material, wind: THREE.IUniform<number>, amp: number, key: string): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = 'uniform float uWind;\nattribute float aSway;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 swayP = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      #else
        vec2 swayP = position.xz;
      #endif
      float swayT = uWind * 1.3 + swayP.x * 0.21 + swayP.y * 0.17;
      transformed.xz += vec2(sin(swayT) + 0.35 * sin(swayT * 2.3 + 1.7), 0.5 * cos(swayT * 0.8 + 0.5)) * aSway * ${amp.toFixed(3)};`,
    );
  };
  mat.customProgramCacheKey = () => key;
}

/** Атрибут aSway: доля высоты между y0 и y1 в квадрате — низ кроны почти неподвижен, макушка гуляет сильнее. */
export function swayAttr(g: THREE.BufferGeometry, y0: number, y1: number): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const a = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0)));
    a[i] = k * k;
  }
  g.setAttribute('aSway', new THREE.BufferAttribute(a, 1));
  return g;
}

/** Шар кроны с лёгкими буграми; цвет темнее книзу (тень внутри кроны). */
function crownBlob(r: number, x: number, y: number, z: number, color: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const base = new THREE.Color(color);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    // бугры — функция направления, чтобы одинаковые вершины соседних граней сдвинулись одинаково
    const k = r * (1 + 0.07 * Math.sin(px * 4 + seed) * Math.sin(py * 4 + seed * 2) * Math.sin(pz * 4 + seed * 3));
    pos.setXYZ(i, x + px * k, y + py * k * 0.92, z + pz * k);
    c.copy(base).multiplyScalar(0.62 + 0.38 * (py * 0.5 + 0.5));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export class LobbyDecor {
  private readonly rng = makeRng(515);
  private readonly solid: THREE.BufferGeometry[] = [];
  private readonly crowns: THREE.BufferGeometry[] = [];

  /** wet — материал мокнет в дождь (мозаика, кадки, ящики с цветами) */
  constructor(scene: THREE.Scene, wind: THREE.IUniform<number>, wet: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial = (m) => m) {
    this.mosaic(scene, wet);
    PLANTERS.forEach(([x, z], i) => this.planterTree(x, z, x > 0, i));
    // ящики с цветами на подоконниках склада (окна второго света) и на восточном парапете
    for (const x of [-7.5, -4.5, 4.5, 7.5]) this.flowerBox(x, 5.92, -15.78, 1.7, 0.26, true);
    for (let z = -15.9; z < -10.1; z += 2) this.flowerBox(29.8, 1.0, z + 0.95, 0.42, 1.8, false);
    for (let z = 4.1; z < 21.9; z += 2) this.flowerBox(29.8, 1.0, z + 0.95, 0.42, 1.8, false);

    scene.add(staticMesh(mergeGeometries(this.solid, false)!, wet(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 })), true));
    const crownMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    windSway(crownMat, wind, 0.09, 'decor-crown');
    const crowns = staticMesh(mergeGeometries(this.crowns, false)!, crownMat, true);
    scene.add(crowns);
    this.bunting(scene, wind);
  }

  /** Роза ветров из смальты перед точкой появления. */
  private mosaic(scene: THREE.Scene, wet: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial): void {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(MOSAIC.r, 72).rotateX(-Math.PI / 2),
      wet(new THREE.MeshStandardMaterial({ map: tex.compassRoseTexture(), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })),
    );
    m.position.set(MOSAIC.x, 0.006, MOSAIC.z);
    m.receiveShadow = true;
    m.renderOrder = 1;
    scene.add(m);
  }

  /** Цветы и листья на прямоугольнике (cx, cz, w × d) на высоте y: листья снизу, головки сверху. */
  private blooms(cx: number, y: number, cz: number, w: number, d: number, perM2: number): void {
    const rng = this.rng;
    const n = Math.max(4, Math.round(w * d * perM2));
    for (let i = 0; i < n; i++) {
      const x = cx + (rng() - 0.5) * w;
      const z = cz + (rng() - 0.5) * d;
      const leaf = new THREE.IcosahedronGeometry(0.075 + rng() * 0.03, 0).scale(1, 0.7, 1);
      this.solid.push(place(paint(leaf, LEAVES[(rng() * LEAVES.length) | 0]), x, y + 0.04, z, rng() * 6));
      if (rng() < 0.75) {
        const fx = x + (rng() - 0.5) * 0.06;
        const fz = z + (rng() - 0.5) * 0.06;
        const head = new THREE.IcosahedronGeometry(0.045 + rng() * 0.02, 0);
        this.solid.push(place(paint(head, FLOWERS[(rng() * FLOWERS.length) | 0]), fx, y + 0.1 + rng() * 0.07, fz, rng() * 6));
      }
    }
  }

  /** Ящик с цветами: (x, y, z) — середина дна. hang — со свисающей зеленью спереди (на подоконнике). */
  private flowerBox(x: number, y: number, z: number, w: number, d: number, hang: boolean): void {
    this.solid.push(place(paint(new THREE.BoxGeometry(w, 0.2, d), hang ? 0x3d6a4a : 0x8a5a3a), x, y + 0.1, z));
    this.solid.push(place(paint(new THREE.BoxGeometry(w - 0.06, 0.02, d - 0.06), 0x4a3424), x, y + 0.2, z));
    this.blooms(x, y + 0.2, z, w - 0.08, d - 0.06, 260);
    if (!hang) return;
    // зелень свисает через переднюю стенку
    for (let k = 0; k < 7; k++) {
      const vine = new THREE.IcosahedronGeometry(0.06, 0).scale(1, 2.4, 0.8);
      const lx = x - w / 2 + 0.12 + this.rng() * (w - 0.24);
      this.solid.push(place(paint(vine, LEAVES[k % LEAVES.length]), lx, y + 0.05 - this.rng() * 0.08, z + d / 2 + 0.03));
    }
  }

  /** Дерево в кадке: светлая каменная кадка, цветы вокруг ствола, крона из нескольких шаров; у восточных — апельсины. */
  private planterTree(x: number, z: number, citrus: boolean, seed: number): void {
    const rng = this.rng;
    const h = PLANTER_H;
    this.solid.push(place(paint(new THREE.CylinderGeometry(PLANTER_R, PLANTER_R * 0.84, h - 0.06, 20), 0xdccfb8), x, (h - 0.06) / 2, z));
    this.solid.push(place(paint(new THREE.TorusGeometry(PLANTER_R - 0.02, 0.05, 6, 28), 0xbfae94), x, h - 0.05, z, 0, Math.PI / 2));
    this.solid.push(place(paint(new THREE.CylinderGeometry(PLANTER_R - 0.05, PLANTER_R - 0.05, 0.03, 20), 0x4a3424), x, h - 0.06, z));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rng() * 0.3;
      const rr = 0.24 + rng() * 0.26;
      this.blooms(x + Math.cos(a) * rr, h - 0.05, z + Math.sin(a) * rr, 0.08, 0.08, 1);
    }
    this.solid.push(place(paint(new THREE.CylinderGeometry(0.09, 0.14, 2.5, 7), 0x6b4a32), x, h + 1.2, z));
    // крона: большой шар и четыре поменьше вокруг
    const top = 3.45;
    const blobs: Array<[number, number, number, number]> = [
      [1.22, 0, top, 0],
      [0.9, 0.78, top - 0.36, 0.26],
      [0.86, -0.62, top - 0.3, -0.52],
      [0.8, -0.3, top - 0.42, 0.72],
      [0.74, -0.18, top + 0.68, 0.3],
    ];
    const parts: THREE.BufferGeometry[] = [];
    blobs.forEach(([r, dx, y, dz], k) => parts.push(crownBlob(r, x + dx, y, z + dz, CROWN[(seed + k) % CROWN.length], seed * 4 + k)));
    if (citrus) {
      for (let i = 0; i < 11; i++) {
        const [r, dx, y, dz] = blobs[i % blobs.length];
        const a = rng() * Math.PI * 2;
        const up = -0.35 + rng() * 0.8;
        const s = Math.sqrt(1 - up * up);
        const fruit = new THREE.IcosahedronGeometry(0.075, 1);
        parts.push(place(paint(fruit, 0xf28a24), x + dx + Math.cos(a) * s * r * 0.97, y + up * r * 0.9, z + dz + Math.sin(a) * s * r * 0.97));
      }
    }
    for (const p of parts) this.crowns.push(swayAttr(p, top - 1.3, top + 1.5));
  }

  /** Флажки-треугольники на верёвке между фонарями; кончики трепещут на ветру. */
  private bunting(scene: THREE.Scene, wind: THREE.IUniform<number>): void {
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    const tip: number[] = [];
    const phase: number[] = [];
    const rope: number[] = [];
    const c = new THREE.Color();
    let k = 0;
    for (const [x0, z0, x1, z1, sag] of BUNTING) {
      const at = (t: number): [number, number, number] => [x0 + (x1 - x0) * t, BUNTING_Y - sag * 4 * t * (1 - t), z0 + (z1 - z0) * t];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const nx = (z1 - z0) / len;
      const nz = -(x1 - x0) / len;
      const steps = Math.round(len / 0.5);
      for (let i = 0; i < steps; i++) rope.push(...at(i / steps), ...at((i + 1) / steps));
      const n = Math.floor(len / 0.5);
      const dw = PENNANT_W / len;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const a = at(t - dw / 2);
        const b = at(t + dw / 2);
        const m = at(t);
        const tipP = [m[0], m[1] - PENNANT_H, m[2]];
        c.setHex(PENNANTS[k++ % PENNANTS.length]);
        const ph = t * 19 + x0;
        for (const [p, isTip] of [[a, 0], [b, 0], [tipP, 1]] as const) {
          pos.push(p[0], p[1], p[2]);
          nor.push(nx, 0, nz);
          col.push(c.r, c.g, c.b);
          tip.push(isTip);
          phase.push(ph);
        }
      }
    }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(rope, 3)), new THREE.LineBasicMaterial({ color: 0x2a2622 }));
    scene.add(lines);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = wind;
      shader.vertexShader = 'uniform float uWind;\nattribute float aTip;\nattribute float aPhase;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed += objectNormal * (sin(uWind * 5.2 + aPhase) * 0.09 + 0.04) * aTip;`,
      );
    };
    mat.customProgramCacheKey = () => 'decor-bunting';
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
}
