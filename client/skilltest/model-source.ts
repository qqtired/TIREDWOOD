// Принятый Blender v3 содержит планировочную трассу, склеенную вместе с архитектурой.
// Отбираем целые связные детали, а не отдельные треугольники: наружные настилы/подкосы не оставляют обрубков.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const TOWER_MODEL_URL = new URL('../assets/skilltest/tower-course-v3.glb', import.meta.url).href;
export const TOWER_ATLAS_URL = new URL('../assets/skilltest/material-atlas-v1.png', import.meta.url).href;
export const CORE_RADIUS = 9.32;

export function coreGeometry(input: THREE.BufferGeometry): THREE.BufferGeometry {
  const src = input.index ? input.toNonIndexed() : input.clone();
  const p = src.getAttribute('position');
  const parent = new Int32Array(p.count); for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const weld = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    const was = weld.get(key); if (was === undefined) weld.set(key, i); else parent[find(i)] = find(was);
    if (i % 3) parent[find(i)] = find(i - i % 3);
  }
  const outside = new Set<number>();
  for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i), p.getZ(i)) > CORE_RADIUS || p.getY(i) < -.1) outside.add(find(i));
  const keep: number[] = [];
  for (let i = 0; i < p.count; i += 3) if (!outside.has(find(i))) keep.push(i, i + 1, i + 2);
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) {
    const a = new Float32Array(keep.length * attr.itemSize);
    for (let i = 0; i < keep.length; i++) for (let k = 0; k < attr.itemSize; k++) a[i * attr.itemSize + k] = attr.getComponent(keep[i], k);
    out.setAttribute(name, new THREE.BufferAttribute(a, attr.itemSize));
  }
  src.dispose(); out.computeBoundingBox(); out.computeBoundingSphere(); return out;
}

export function towerCore(source: THREE.Object3D): THREE.Group {
  source.updateMatrixWorld(true);
  const tower = source.getObjectByName('tower_full_overview');
  const geometry = source.getObjectByName('tower_full_overview_geometry');
  if (!tower || !geometry) throw new Error('В принятом GLB отсутствует корпус башни');
  const inv = tower.matrixWorld.clone().invert(), out = new THREE.Group(); out.name = 'accepted_tower_architecture';
  geometry.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const geo = o.geometry.clone().applyMatrix4(inv.clone().multiply(o.matrixWorld));
    const core = coreGeometry(geo); geo.dispose();
    if (!core.getAttribute('position').count) return;
    const m = new THREE.Mesh(core, o.material); m.name = `accepted_core_${out.children.length}`; m.castShadow = true; m.receiveShadow = true; out.add(m);
  });
  return out;
}

let asset: Promise<THREE.Group> | null = null;
export function loadTowerSource(): Promise<THREE.Group> {
  return asset ??= new GLTFLoader().loadAsync(TOWER_MODEL_URL).then(g => g.scene);
}

/** Рigid part из того же принятого файла; масштаб/положение в игре задаются данными физики. */
export function sourcePart(source: THREE.Object3D, name: string): THREE.Group {
  const node = source.getObjectByName(name);
  if (!node) throw new Error(`В принятом GLB отсутствует ${name}`);
  const part = node.clone(true);
  part.position.set(0, 0, 0); part.rotation.set(0, 0, 0); part.scale.set(1, 1, 1);
  const root = new THREE.Group(); root.add(part); return root;
}
