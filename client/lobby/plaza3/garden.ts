// Огородный закуток plaza3. Три отрисовки: грядки, существующие sunflower_clump и wattle_2m из библиотеки павильонов.
// Строится при входе вместе с площадью, без зависимой от расстояния загрузки и без новых коллизий/точек E.
import * as THREE from 'three';
import { P3 } from '../../../shared/plaza3/layout.ts';
import { mergeColored, paint, place } from '../../render/kit.ts';
import type { VenueCtx } from '../plaza/venue.ts';
import { gardenPlan, type GardenPlace } from './garden-data.ts';
import { loadPav, worldGeometry } from './models.ts';

/** Простой земляной короб с досками, бороздами и невысокими овощами — общая геометрия всех грядок. */
export function gardenBedGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number): void => {
    pieces.push(place(paint(new THREE.BoxGeometry(w, h, d), color), x, y, z));
  };
  box(4.2, 0.18, 6.6, 0, 0.09, 0, 0x795536);
  for (const x of [-2.1, 2.1]) box(0.1, 0.2, 6.75, x, 0.1, 0, 0xa78053);
  for (const z of [-3.35, 3.35]) box(4.3, 0.2, 0.1, 0, 0.1, z, 0xa78053);
  for (const x of [-1.3, 0, 1.3]) {
    box(0.58, 0.07, 6.3, x, 0.205, 0, 0x91623d);
    for (let z = -2.7; z <= 2.7; z += 0.9) {
      const leaf = paint(new THREE.IcosahedronGeometry(0.18, 0), z < 0 ? 0x6b903d : 0x739b45);
      leaf.scale(1.3, 0.8, 1.1);
      pieces.push(place(leaf, x, 0.32, z));
    }
  }
  return mergeColored(pieces);
}

function instances(geo: THREE.BufferGeometry, mat: THREE.Material, list: GardenPlace[], name: string): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  mesh.name = name;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.yaw);
    mesh.setMatrixAt(i, matrix.compose(position.set(p.x, p.y ?? P3.land.streetY + 0.035, p.z), rotation, scale.set(p.scale * (p.stretch ?? 1), p.scale, p.scale)));
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.matrixAutoUpdate = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.computeBoundingSphere();
  return mesh;
}

export function buildPlaza3Garden(ctx: VenueCtx): { group: THREE.Group; ready: Promise<void>; debug: () => Record<string, unknown> } {
  const group = new THREE.Group();
  group.name = 'plaza3-garden';
  const plan = gardenPlan();
  // Тот же матовый материал, что у павильонов. Цвета уже в геометрии библиотеки; новых текстур нет.
  const material = ctx.wet(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }));
  material.name = 'p3_matte';
  const beds = instances(gardenBedGeometry(), material, plan.beds, 'plaza3-garden-beds');
  group.add(beds);
  ctx.scene.add(group);
  const stats = { beds: plan.beds.length, sunflowers: 0, fences: 0, draws: 1, geometries: 1, tris: beds.geometry.getAttribute('position').count / 3 * plan.beds.length, ready: false, failed: false };
  const ready = loadPav('pav_props.glb').then((model) => {
    for (const [asset, placements, key] of [
      ['sunflower_clump', plan.sunflowers, 'sunflowers'],
      ['wattle_2m', plan.fences, 'fences'],
    ] as const) {
      const parts = model?.nodes.get(asset);
      if (!parts?.length) {
        stats.failed = true;
        continue;
      }
      const geos = parts.map((part) => worldGeometry(part.geo, part.matrix));
      const geo = mergeColored(geos);
      for (const part of geos) part.dispose();
      group.add(instances(geo, material, placements, `plaza3-garden-${key}`));
      stats[key] = placements.length;
      stats.draws++;
      stats.geometries++;
      stats.tris += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3 * placements.length;
    }
    stats.ready = true;
  }).catch((error: unknown) => {
    stats.failed = true;
    stats.ready = true;
    console.warn('[набережная] огородный декор', error);
  });
  return { group, ready, debug: () => ({ ...stats }) };
}
