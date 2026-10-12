// Миниатюры моделей: один скрытый WebGL-рендерер, очередь, кэш. Нужны там, где у художника нет PNG-рендера.
import { THREE, makeLoader, Rig, visibleBox } from './viewer.js';

let R = null;
const cache = new Map();
let chain = Promise.resolve();

function ensure(size) {
  if (!R) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 400);
    const rig = new Rig(scene, renderer, { mapSize: 1024 });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ color: 0x5a3a14, opacity: 0.3 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.receiveShadow = true;
    scene.add(shadow);
    R = { renderer, scene, camera, rig, shadow };
  }
  R.renderer.setSize(size, size, false);
  return R;
}

async function render(url, size) {
  const { renderer, scene, camera, rig, shadow } = ensure(size);
  const gltf = await makeLoader().loadAsync(url);
  const root = gltf.scene;
  const nodes = root.children.filter((c) => c.name);
  const stages = nodes.filter((n) => /^stage[-_ ]?\d+$/i.test(n.name));
  if (stages.length >= 2 && stages.length === nodes.length) {
    stages.sort((a, b) => Number(a.name.match(/\d+/)[0]) - Number(b.name.match(/\d+/)[0]));
    stages.forEach((n, i) => { n.visible = i === stages.length - 1; });
  }
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(root);
  const box = visibleBox(root);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const r = Math.max(sphere.radius, 0.05);
  const dist = (r / Math.sin((camera.fov * Math.PI) / 360)) * 1.1;
  camera.position.copy(sphere.center).addScaledVector(new THREE.Vector3(0.78, 0.62, 1).normalize(), dist);
  camera.lookAt(sphere.center);
  camera.near = dist / 200;
  camera.far = dist * 40;
  camera.updateProjectionMatrix();
  rig.fit(sphere.center, r);
  shadow.position.set(sphere.center.x, box.min.y + 0.0008, sphere.center.z);
  shadow.scale.setScalar(r * 10);
  renderer.render(scene, camera);
  const out = renderer.domElement.toDataURL('image/png');
  scene.remove(root);
  root.traverse((o) => {
    if (o.isMesh) {
      o.geometry?.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const k of Object.keys(m)) if (m[k]?.isTexture) m[k].dispose();
        m.dispose();
      }
    }
  });
  return out;
}

export function thumb(url, size = 320) {
  const key = url + '|' + size;
  if (cache.has(key)) return cache.get(key);
  const p = (chain = chain.then(() => render(url, size)).catch((e) => { console.warn('thumb', url, e); return null; }));
  cache.set(key, p);
  return p;
}
