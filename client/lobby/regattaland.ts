// Accepted R5.3 white cliffs/bridge/lighthouse, extracted reproducibly without the
// duplicate concept marina. The existing TIREDWOOD waterfront remains the start.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WATER_Y } from '../../shared/constants.ts';

const courseUrl = new URL('../assets/regatta/white-cliffs-v2.glb', import.meta.url).href;
const stoneUrl = new URL('../assets/regatta/chalk-limestone-v1.jpg', import.meta.url).href;

export async function regattaLand(parent: THREE.Group): Promise<{ textured: boolean }> {
  const [gltf, texture] = await Promise.all([
    new GLTFLoader().loadAsync(courseUrl), new THREE.TextureLoader().loadAsync(stoneUrl).catch(() => null),
  ]);
  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
  }
  const root = gltf.scene;
  root.name = 'regatta-white-cliffs';
  root.position.y = WATER_Y;
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      // ImageGen chalk albedo keeps close walls from looking like flat plastic.
      // The green ledges retain their accepted untextured vertex colours.
      if (m.name === 'stone') { m.map = texture; m.color.setHex(0xffffff); m.roughness = 0.9; }
    }
    o.castShadow = o.receiveShadow = true;
    o.matrixAutoUpdate = false;
    o.updateMatrix();
  });
  root.updateMatrixWorld(true);
  parent.add(root);
  // Losing a cosmetic texture must not make physically solid cliffs invisible.
  return { textured: texture !== null };
}
