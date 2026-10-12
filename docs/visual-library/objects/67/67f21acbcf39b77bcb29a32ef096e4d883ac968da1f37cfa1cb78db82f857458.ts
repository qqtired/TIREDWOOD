import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { validateGlb } from './glb.ts';

export async function parsePreviewGlb(buffer: ArrayBuffer): Promise<THREE.Group> {
  validateGlb(buffer);
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    if (!url.startsWith('data:') && !url.startsWith('blob:')) throw new Error('Сохрани все ресурсы внутри GLB');
    return url;
  });
  const gltf = await new GLTFLoader(manager).parseAsync(buffer, '');
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  let visibleMeshes = 0;
  gltf.scene.traverse(object => {
    if ((object as THREE.Mesh).isMesh && (object as THREE.Mesh).geometry.getAttribute('position')?.count >= 3) visibleMeshes++;
  });
  if (!visibleMeshes || ![size.x, size.y, size.z].every(Number.isFinite) || Math.max(size.x, size.y, size.z) <= 0) {
    disposePreviewGlb(gltf.scene);
    throw new Error('В модели нет видимой геометрии');
  }
  return gltf.scene;
}
export function disposePreviewGlb(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}
