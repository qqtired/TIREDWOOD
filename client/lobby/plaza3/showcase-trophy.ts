import * as THREE from 'three';
import type { FishPodiumCatch } from '../../../shared/messages.ts';
import { FISH } from '../../../shared/fishing.ts';
import { mergeColored, paint, place } from '../../render/kit.ts';
import { makeFish3D } from '../fishart.ts';
import type { ShowcaseMount } from './mounts.ts';

const SUPPORT = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .55, roughness: .5 });
const EXHIBITION_MIN_HEIGHT = 1.2;

/** Every rank shares one exhibition floor and absolute-mass growth; caps keep neighbouring trophies clear. */
export function makeShowcaseTrophy(row: FishPodiumCatch, spot: ShowcaseMount['fish'][number], lengthOf: (sp: number, g: number) => number): THREE.Group {
  const holder = new THREE.Group();
  holder.name = 'showcase-trophy';
  holder.userData.p3keep = true;
  spot.matrix.decompose(holder.position, holder.quaternion, new THREE.Vector3());
  const model = makeFish3D(row.sp, row.g);
  model.name = 'showcase-trophy-fish';
  // The hand-held fish has a separate cap. Measure its actual species geometry at unit scale first.
  model.scale.setScalar(1);
  const unit = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  let scale = lengthOf(row.sp, row.g) * 1.15 / Math.max(unit.x, unit.z, .01);
  model.rotation.z = Math.PI / 2;
  // The ray's head is +Z, other fish heads are +X. Show the broad face of flat species to the viewer.
  if (FISH[row.sp]?.shape === 'ray') model.rotation.set(-Math.PI / 2, 0, 0);
  else if (FISH[row.sp]?.shape === 'flat') model.rotation.y = -Math.PI / 2;
  const upright = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  // One exhibition floor for every species and rank; the real mass remains written on its tag.
  scale = Math.max(scale, EXHIBITION_MIN_HEIGHT / Math.max(upright.y, .01));
  scale = Math.min(scale, spot.maxH / Math.max(upright.y, .01), (spot.maxW ?? 1.55) / Math.max(upright.x, .01));
  model.scale.setScalar(scale);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  holder.add(model);
  const height = box.max.y - box.min.y;
  const top = Math.max(.12, height * .72);
  const support = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry => place(paint(new THREE.BoxGeometry(w, h, d), 0x536357), x, y, z);
  const geometry = mergeColored([
    support(.34, .045, .30, 0, .0225, .36),
    support(.035, top, .035, 0, top / 2, .52),
    ...[.28, .68].map((part) => support(.10, .025, .54, 0, height * part, .27)),
  ]);
  const stand = new THREE.Mesh(geometry, SUPPORT);
  stand.name = 'showcase-trophy-support';
  stand.userData.showcaseSupport = true;
  stand.castShadow = true;
  holder.add(stand);
  return holder;
}

/** Fish resources are shared by species; only the merged stand belongs to this particular catch. */
export function disposeShowcaseTrophy(trophy: THREE.Object3D): void {
  trophy.traverse((child) => {
    if (child instanceof THREE.Mesh && child.userData.showcaseSupport) child.geometry.dispose();
  });
}
