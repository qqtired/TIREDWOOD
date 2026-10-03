// Замок «Старой крепости» — весь вид стен, башен, ворот и двора одним модулем. Коллизии не трогает: стены и
// бруствер лежат точно на боксах карты (shared/fortmap.ts), всё новое (надвратная башня, эркеры, знамёна, фонари,
// кузня) — только вид, в стороне от прохода, лестниц, бойниц башен и прилавка (castle/layout.ts, тест
// test/fort-castle.test.ts).
//  • стены: тёплый песчаник, светлый тёсаный камень бруствера и зубцов с шапками, цоколь, карниз на кронштейнах,
//    угловые камни, бойницы, плющ; ниши в стенах проезда — для открытых створок (castle/masonry.ts);
//  • надвратная башня на консолях и эркеры с шатрами-колпаками на северных бастионах (castle/towers.ts);
//  • флаги, знамёна и гирлянды на ветру — один меш с ветром в шейдере (castle/flags.ts);
//  • ворота: створки из досок с железом по ступени 0–8, повреждения по прочности, удары, падение, прорыв босса,
//    ремонт (castle/gate.ts); пыль, камешки и щепки (castle/fx.ts);
//  • двор: кузня, склад, стойка с оружием, поленница, цветы, фонари и факелы (castle/yard.ts);
//  • кольца над постаментом кристалла по ступени укрепления 0–5.
import * as THREE from 'three';
import { CRYSTAL, type FortMap } from '../../shared/fortmap.ts';
import { addBox, buildGeo, parts } from '../render/kit.ts';
import * as rtex from '../render/textures.ts';
import { CastleFx } from './castle/fx.ts';
import { buildFlags } from './castle/flags.ts';
import { CastleGate } from './castle/gate.ts';
import { Bucket } from './castle/geo.ts';
import { buildMasonry } from './castle/masonry.ts';
import { ivyTexture, masonryTexture, roofTexture, trimTexture } from './castle/textures.ts';
import { buildTowers } from './castle/towers.ts';
import { buildYard } from './castle/yard.ts';

export { gatePress } from './castle/layout.ts';

/** Кольца над кристаллом: радиусы, наклоны и скорости (по ступени укрепления кристалла) */
const RINGS = [
  { r: 1.22, tilt: 0.42, speed: 0.55, phase: 0 },
  { r: 1.36, tilt: -0.62, speed: -0.42, phase: 1.7 },
  { r: 1.5, tilt: 0.95, speed: 0.36, phase: 3.1 },
  { r: 1.64, tilt: -1.2, speed: -0.3, phase: 4.4 },
  { r: 1.78, tilt: 1.42, speed: 0.25, phase: 5.6 },
];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const SMOKE = new THREE.Color(0xb9b2a8);

export class CastleDecor {
  readonly gate: CastleGate;
  readonly fx: CastleFx;
  readonly root = new THREE.Group();
  private readonly arch: THREE.Mesh[] = [];
  private readonly ivy: THREE.Mesh;
  private readonly rings: THREE.InstancedMesh;
  private readonly ringScale = RINGS.map(() => 0);
  private readonly flagTime: { value: number };
  private readonly forge: THREE.Vector3;
  private readonly chimney: THREE.Vector3;
  private crystalTier = 0;
  private sparkAt = 0;
  private smokeAt = 0;
  /** треугольников в статике замка (для замеров на стенде) */
  readonly triangles: number;

  constructor(scene: THREE.Scene, map: FortMap) {
    this.fx = new CastleFx();
    const mas = buildMasonry(map);
    const tow = buildTowers();
    const flags = buildFlags();
    const yard = buildYard(this.fx);
    this.flagTime = flags.uTime;
    this.forge = yard.forge;
    this.chimney = yard.chimney;

    const stoneMat = new THREE.MeshStandardMaterial({ map: masonryTexture(), vertexColors: true, roughness: 0.92 });
    const trimMat = new THREE.MeshStandardMaterial({ map: trimTexture(), vertexColors: true, roughness: 0.86 });
    const roofMat = new THREE.MeshStandardMaterial({ map: roofTexture(), vertexColors: true, roughness: 0.72 });
    const darkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74 });
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const ivyMat = new THREE.MeshStandardMaterial({ map: ivyTexture(), vertexColors: true, alphaTest: 0.5, roughness: 0.9 });
    const crateMat = new THREE.MeshStandardMaterial({ map: rtex.crateTexture(), vertexColors: true, roughness: 0.85 });

    const stone = mas.stone.append(tow.stone).append(yard.stone);
    const trim = mas.trim.append(tow.trim).append(yard.trim);
    const dark = mas.dark.append(tow.dark).append(flags.dark).append(yard.dark);
    const glow = tow.glow.append(yard.glow);
    let tris = 0;
    const add = (b: Bucket, mat: THREE.Material, cast: boolean, receive = true): THREE.Mesh => {
      const mesh = new THREE.Mesh(b.build(), mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      tris += b.triangles;
      this.root.add(mesh);
      return mesh;
    };
    add(stone, stoneMat, true);
    add(trim, trimMat, true);
    add(tow.roof, roofMat, true);
    add(dark, darkMat, true);
    add(glow, glowMat, false, false);
    this.ivy = add(mas.ivy, ivyMat, false);
    // перемычка над воротами — отдельно: трясётся
    for (const [b, mat] of [[mas.archStone, stoneMat], [mas.archTrim, trimMat]] as const) {
      const mesh = add(b, mat, true);
      mesh.matrixAutoUpdate = true;
      this.arch.push(mesh);
    }
    // ящики: со двора карты (коллизия) и на складе (только вид)
    const crates = parts();
    for (const b of mas.crates) addBox(crates, b, 'wood', () => 0.5);
    yard.crates.forEach(([x0, y0, z0, x1, y1, z1], i) => addBox(crates, { min: [x0, y0, z0], max: [x1, y1, z1], color: 0xb88a55, variant: i + 5 }, 'wood', () => 0.4));
    const crateMesh = new THREE.Mesh(buildGeo(crates), crateMat);
    crateMesh.castShadow = crateMesh.receiveShadow = true;
    crateMesh.matrixAutoUpdate = false;
    crateMesh.updateMatrix();
    this.root.add(crateMesh);
    tris += crates.idx.length / 3;

    this.root.add(flags.mesh);
    tris += (flags.mesh.geometry.index?.count ?? 0) / 3;
    this.triangles = tris;

    this.gate = new CastleGate(this.fx);
    this.root.add(this.gate.group);
    this.root.add(this.fx.fire.mesh, this.fx.dust.mesh, this.fx.chunks);

    // кольца над постаментом: тор с двумя бусинами-кристаллами
    const paintAll = (g: THREE.BufferGeometry, c: THREE.Color) => {
      const arr = new Float32Array(g.getAttribute('position').count * 3);
      for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      g.deleteAttribute('uv');
      return g;
    };
    const ring = paintAll(new THREE.TorusGeometry(1, 0.026, 6, 64).toNonIndexed(), new THREE.Color(0xf2c24c));
    // октаэдр в three.js и так без индексов
    const beads = [0, Math.PI].map((a) => paintAll(new THREE.OctahedronGeometry(0.06, 0).translate(Math.cos(a), Math.sin(a), 0), new THREE.Color(0x8ff0ff)));
    const ringGeo = mergeAll([ring, ...beads]);
    this.rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x4a3410, emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.32 }), RINGS.length);
    this.rings.count = 0;
    this.rings.frustumCulled = false;
    this.rings.castShadow = false;
    this.root.add(this.rings);

    scene.add(this.root);
  }

  /** Ступени укрепления (с сервера, из хвоста арсенала): ворота 0–8 — железо, кристалл 0–5 — кольца */
  setTiers(gate: number, crystal: number): void {
    this.gate.setTier(gate);
    const c = Math.max(0, Math.min(RINGS.length, Math.floor(crystal)));
    if (c > this.crystalTier) this.fx.spark(CRYSTAL.x, CRYSTAL.y, CRYSTAL.z, 10);
    this.crystalTier = c;
  }

  /** Качество: на «низком» — без плюща и с меньшим числом частиц */
  setQuality(tier: 'low' | 'medium' | 'high'): void {
    this.fx.scale = tier === 'low' ? 0.45 : tier === 'medium' ? 0.7 : 1;
    this.ivy.visible = tier !== 'low';
  }

  update(dt: number, t: number): void {
    this.flagTime.value = t;
    this.gate.update(dt, t);
    // перемычка дрожит, когда бьют, падают ворота или протискивается босс
    const a = this.gate.archShake;
    for (const m of this.arch) {
      m.position.set(Math.sin(t * 53) * a, Math.sin(t * 41 + 1) * a * 0.5, Math.sin(t * 37 + 2) * a * 0.6);
    }
    // кузня: искры над углями, дымок из трубы
    if (t > this.sparkAt) {
      this.sparkAt = t + 0.35 + Math.random() * 0.9;
      this.fx.spark(this.forge.x + (Math.random() - 0.5) * 0.4, this.forge.y, this.forge.z + (Math.random() - 0.5) * 0.8, 2 + Math.floor(Math.random() * 4));
    }
    if (t > this.smokeAt) {
      this.smokeAt = t + 0.5 + Math.random() * 0.5;
      this.fx.puff(this.chimney.x, this.chimney.y, this.chimney.z, 1, 0.05, 0.35, 0.55, 2.4, SMOKE, 0.35);
    }
    this.fx.update(dt, t);
    // кольца над кристаллом: выросли до ступени, кружат вразнобой
    let n = 0;
    for (let i = 0; i < RINGS.length; i++) {
      const target = i < this.crystalTier ? 1 : 0;
      const s = this.ringScale[i];
      this.ringScale[i] = target > s ? Math.min(1, s + dt * 1.6) : Math.max(0, s - dt * 3);
      const k = this.ringScale[i];
      if (k <= 0) continue;
      const R = RINGS[i];
      const pop = k < 1 ? 1 + 0.25 * Math.sin(Math.PI * k) : 1;
      _q.setFromEuler(_e.set(R.tilt + Math.sin(t * 0.7 + R.phase) * 0.12, t * R.speed + R.phase, 0, 'YXZ'));
      _q2.setFromAxisAngle(_v.set(0, 0, 1), t * R.speed * 2.2);
      _q.multiply(_q2);
      _m.compose(_v.set(CRYSTAL.x, CRYSTAL.y + Math.sin(t * 1.6) * 0.08, CRYSTAL.z), _q, _s.setScalar(R.r * k * pop));
      this.rings.setMatrixAt(n++, _m);
    }
    this.rings.count = n;
    if (n) this.rings.instanceMatrix.needsUpdate = true;
    if (Math.random() < dt * 0.6 * this.crystalTier) this.fx.spark(CRYSTAL.x + (Math.random() - 0.5) * 2, CRYSTAL.y - 0.5 + Math.random(), CRYSTAL.z + (Math.random() - 0.5) * 2, 1);
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const map = (mat as THREE.MeshStandardMaterial).map;
        map?.dispose();
        mat.dispose();
      }
    });
    this.root.removeFromParent();
  }
}

/** Склеить неиндексированные фигуры с одинаковым набором атрибутов */
function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = Object.keys(list[0].attributes);
  const g = new THREE.BufferGeometry();
  for (const name of names) {
    const size = list[0].getAttribute(name).itemSize;
    const arr: number[] = [];
    for (const src of list) {
      const a = src.getAttribute(name);
      for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) arr.push(a.array[i * size + k] as number);
    }
    g.setAttribute(name, new THREE.Float32BufferAttribute(arr, size));
  }
  g.computeBoundingSphere();
  return g;
}
