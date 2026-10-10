// «Подземелье»: постройки с состоянием (алтари, жаровни, сундуки, родники, фонари-маяки, бочки, батуты, кузни,
// вагонетки) — инстансами по видам: на вид две отрисовки (непрозрачное с цветами вершин и свечение). Состояние —
// яркостью свечения на экземпляр (гасим яркостью, не видимостью), вариантом модели (жаровня стоит/опрокинута) и
// матрицей части (уровень воды в роднике). Рисуются только те, что рядом с камерой. Проклятый сундук открыт/рассыпался —
// второй вариант модели (крышка откинута, без цепей и замка, тусклый). Сундуки-подборы карты и островка — та же модель
// без проклятия, поменьше, покачиваются, под ними пятно света.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { D_RING, D_SOFT, type FloorDecals } from './fx.ts';
import type { BuildingKind, VBuilding } from './view.ts';

interface Baked {
  opaque: THREE.BufferGeometry | null;
  glow: THREE.BufferGeometry | null;
}

/** Перекраска материала при склейке: [цвет, светится] или undefined — как есть */
type Recolor = (mat: THREE.MeshStandardMaterial) => [THREE.Color, boolean] | undefined;

/**
 * Склеить узел (с детьми, кроме skip) в две геометрии в системе узла: цвет материала — в цвет вершин;
 * dim — множитель непрозрачных цветов, recolor — своя краска по материалу
 */
export function bakeNode(node: THREE.Object3D, skip: (o: THREE.Object3D) => boolean = () => false, dim = 1, recolor?: Recolor): Baked {
  node.updateMatrixWorld(true);
  const inv = node.matrixWorld.clone().invert();
  const op: THREE.BufferGeometry[] = [];
  const gl: THREE.BufferGeometry[] = [];
  const rel = new THREE.Matrix4();
  const visit = (o: THREE.Object3D): void => {
    if (o !== node && skip(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const mat = mats[0] as THREE.MeshStandardMaterial;
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      rel.copy(inv).multiply(m.matrixWorld);
      g.applyMatrix4(rel);
      const rc = recolor?.(mat);
      const glow = rc ? rc[1] : /glow/.test(mat.name) || (mat.emissive && mat.emissiveIntensity > 0 && mat.emissive.getHex() !== 0);
      const c = rc ? rc[0].clone() : glow && mat.emissive && mat.emissive.getHex() !== 0 ? mat.emissive.clone().multiplyScalar(Math.min(2.2, mat.emissiveIntensity || 1)) : mat.color.clone();
      if (!glow) c.multiplyScalar(dim);
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      (glow ? gl : op).push(g);
    }
    for (const c of o.children) visit(c);
  };
  visit(node);
  return { opaque: op.length ? mergeGeometries(op, false) : null, glow: gl.length ? mergeGeometries(gl, false) : null };
}

const OPAQUE = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true });

interface Part {
  op: THREE.InstancedMesh | null;
  gl: THREE.InstancedMesh | null;
  n: number;
}

const CAP: Record<string, number> = { altar: 6, brazier: 48, brazier_tipped: 48, chest: 4, chest_open: 4, pchest_map: 12, pchest_isle: 2, spring: 4, spring_water: 4, lamppost: 16, keg: 60, trampoline: 10, forge: 4, minecart: 4 };

const tmpM = new THREE.Matrix4();
const tmpM2 = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
/** верх песка островка озера (lake_island в kit_grotto) */
const ISLE_Y = 0.42;
/** откинутая крышка проклятого сундука — последний кадр клипа chest_open */
const LID_OPEN = new THREE.Quaternion(-0.799, 0, 0, 0.602).normalize();
const isMat = (o: THREE.Object3D, re: RegExp): boolean => {
  const m = o as THREE.Mesh;
  if (!m.isMesh) return false;
  const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;
  return re.test(mat.name);
};

export class BuildingRenderer {
  readonly root = new THREE.Group();
  private readonly parts = new Map<string, Part>();
  /** локальная матрица воды родника (относительно корня) */
  private readonly waterLocal = new THREE.Matrix4();

  constructor(kits: Map<string, THREE.Object3D>) {
    this.root.name = 'dg-buildings';
    const make = (key: string, node: THREE.Object3D | undefined, skip?: (o: THREE.Object3D) => boolean, dim = 1, recolor?: Recolor): void => {
      if (!node) return;
      const b = bakeNode(node, skip, dim, recolor);
      const cap = CAP[key] ?? 8;
      const mk = (g: THREE.BufferGeometry | null, mat: THREE.Material): THREE.InstancedMesh | null => {
        if (!g) return null;
        const m = new THREE.InstancedMesh(g, mat, cap);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.count = 0;
        m.frustumCulled = false;
        m.name = `dg-b-${key}`;
        if (mat === GLOW) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
        this.root.add(m);
        return m;
      };
      this.parts.set(key, { op: mk(b.opaque, OPAQUE), gl: mk(b.glow, GLOW), n: 0 });
    };
    make('altar', kits.get('altar'));
    make('brazier', kits.get('brazier'));
    make('brazier_tipped', kits.get('brazier_tipped'));
    const cursed = kits.get('cursed_chest');
    make('chest', cursed);
    if (cursed) {
      // открыт/рассыпался: крышка откинута, цепей, замка и золота внутри нет, тусклый
      const open = cursed.clone(true);
      open.getObjectByName('cursed_chest_lid')?.quaternion.copy(LID_OPEN);
      make('chest_open', open, (o) => /chain|lock/.test(o.name) || isMat(o, /brass/), 0.55);
      // сундуки карты: без цепей, замка и повидла; дерево светлее — видно на тёмном полу
      const plain = (o: THREE.Object3D): boolean => /chain|lock/.test(o.name) || isMat(o, /jam/);
      const wood = (m: THREE.MeshStandardMaterial): [THREE.Color, boolean] | undefined =>
        /wood/.test(m.name) ? [m.color.clone().multiplyScalar(/dark/.test(m.name) ? 2.6 : 2), false] : undefined;
      make('pchest_map', cursed, plain, 1, (m) => (/brass/.test(m.name) ? [m.color.clone().multiplyScalar(1.6), false] : wood(m)));
      // островок: оковки и замок светятся бирюзой
      make('pchest_isle', cursed, plain, 1, (m) => (/brass|iron/.test(m.name) ? [new THREE.Color(0.22, 0.85, 0.75), true] : wood(m)));
    }
    const spring = kits.get('healing_spring');
    const water = spring?.getObjectByName('healing_spring_water');
    make('spring', spring, (o) => o === water);
    if (water && spring) {
      spring.updateMatrixWorld(true);
      this.waterLocal.copy(spring.matrixWorld).invert().multiply(water.matrixWorld);
      make('spring_water', water);
    }
    make('lamppost', kits.get('lantern_post'));
    make('keg', kits.get('powder_keg'));
    make('trampoline', kits.get('mushroom_trampoline'));
    make('forge', kits.get('forgotten_forge'));
    make('minecart', kits.get('minecart'));
  }

  begin(): void {
    for (const p of this.parts.values()) p.n = 0;
  }

  private put(key: string, m: THREE.Matrix4, glow: number, tint?: THREE.Color): void {
    const p = this.parts.get(key);
    if (!p) return;
    const cap = (p.op ?? p.gl)!.instanceMatrix.count;
    if (p.n >= cap) return;
    const i = p.n++;
    p.op?.setMatrixAt(i, m);
    if (p.gl) {
      p.gl.setMatrixAt(i, m);
      tmpC.copy(tint ?? new THREE.Color(1, 1, 1)).multiplyScalar(glow);
      p.gl.setColorAt(i, tmpC);
    }
  }

  /** Одна постройка в точке кадра (x, z); time — для мерцания */
  add(b: VBuilding, x: number, z: number, time: number): void {
    tmpP.set(x, 0, z);
    tmpQ.setFromAxisAngle(UP, b.yaw);
    tmpS.set(1, 1, 1);
    tmpM.compose(tmpP, tmpQ, tmpS);
    const flick = 0.85 + 0.15 * Math.sin(time * 11 + b.id * 1.7) * Math.sin(time * 7.3 + b.id);
    switch (b.kind as BuildingKind) {
      case 'altar':
        this.put('altar', tmpM, b.s >= 1 ? 1.4 + 0.3 * Math.sin(time * 3) : 0.15 + b.s * 0.6);
        break;
      case 'brazier':
        if (b.s > 0) this.put('brazier', tmpM, flick * 1.2);
        else this.put('brazier_tipped', tmpM, 0.5 * flick);
        break;
      case 'chest':
        if (b.s > 0) this.put('chest', tmpM, b.on ? 1 + 0.4 * Math.sin(time * 4 + b.id) : 0.3);
        else this.put('chest_open', tmpM, 0.08);
        break;
      case 'spring': {
        this.put('spring', tmpM, 1);
        const lvl = Math.max(0, Math.min(1, b.s));
        const sc = 0.46 + 0.54 * lvl;
        const water = new THREE.Matrix4().compose(new THREE.Vector3(0, -0.37 * (1 - lvl), 0), new THREE.Quaternion(), new THREE.Vector3(sc, 1, sc));
        tmpM2.copy(tmpM).multiply(this.waterLocal).multiply(water);
        this.put('spring_water', tmpM2, 0.6 + 0.6 * lvl);
        break;
      }
      case 'lamppost':
        this.put('lamppost', tmpM, b.on ? 1.3 * flick : 0.06);
        break;
      case 'keg':
        this.put('keg', tmpM, b.on ? 2 * flick : 0.25);
        break;
      case 'trampoline':
        this.put('trampoline', tmpM, 1);
        break;
      case 'forge':
        this.put('forge', tmpM, b.s > 0 ? flick : 0.08);
        break;
      case 'minecart':
        this.put('minecart', tmpM, 1);
        break;
    }
  }

  /**
   * Сундук-подбор на полу: 'map' — обычный деревянный, 'isle' — сундук островка с бирюзовым отливом. Чуть покачивается,
   * под ним пятно света и кольцо (декали пола — без настоящих ламп)
   */
  chest(src: 'map' | 'isle', x: number, z: number, id: number, time: number, decA: FloorDecals): void {
    const isle = src === 'isle';
    const ph = time * 2.3 + id * 1.7;
    tmpE.set(0.05 * Math.sin(ph * 0.8), (id * 2.399) % 6.283, 0.08 * Math.sin(ph));
    tmpQ.setFromEuler(tmpE);
    const sc = isle ? 0.9 : 0.75;
    // сундук островка стоит на песке островка (~0,4 м над водой)
    const y = isle ? ISLE_Y : 0;
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sc, sc, sc));
    const pulse = 0.5 + 0.5 * Math.sin(time * 3 + id);
    if (isle) {
      this.put('pchest_isle', tmpM, 1 + 0.5 * pulse);
      // песок островка неровный (до ~0,7 м) — пятно и кольцо чуть выше
      decA.add(x, 0.75, z, 3, 3, 0, D_SOFT, 1.4, 0, 0.3, 1, 0.88, 0.55 + 0.25 * pulse);
      decA.add(x, 0.76, z, 1.7, 1.7, 0, D_RING, 0.78, 0.12, 0.35, 1, 0.9, 0.5 + 0.35 * pulse);
    } else {
      this.put('pchest_map', tmpM, 1);
      decA.add(x, 0.05, z, 2.6, 2.6, 0, D_SOFT, 1.4, 0, 1, 0.72, 0.38, 0.42 + 0.18 * pulse);
      decA.add(x, 0.055, z, 1.3, 1.3, 0, D_RING, 0.78, 0.12, 1, 0.8, 0.45, 0.3 + 0.3 * pulse);
    }
  }

  end(): void {
    for (const p of this.parts.values()) {
      for (const m of [p.op, p.gl]) {
        if (!m) continue;
        m.count = p.n;
        m.visible = p.n > 0;
        if (p.n) {
          m.instanceMatrix.needsUpdate = true;
          if (m.instanceColor) m.instanceColor.needsUpdate = true;
        }
      }
    }
  }
}
