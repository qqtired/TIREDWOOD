// Город на холмах в новом виде (look v2): треть деревьев — кипарисы (на тех же местах: круглую крону убираем из
// инстансов, ставим веретено), фасады со ставнями, балкончиками и цветами (та же раскладка текстуры), на скатных крышах — ряды черепицы
// (узор в шейдере, вдали гаснет), на крыше кафе — глиняная черепица вместо профнастила. Меши мира находим по их
// материалам; не нашли — просто пропускаем.
import * as THREE from 'three';
import { skyHaze } from './backdrop.ts';
import { cypressGeometry } from './lookdecor.ts';
import { lookFacadeTextures, lookRoofTexture } from './looktex.ts';

/** Какая доля деревьев города — кипарисы */
const CYPRESS_SHARE = 0.36;
const CYPRESS = new THREE.Color(0x2f5a2e);
/** Ряд деревьев на набережной к востоку (z ≈ 17) — круглые, как были */
const PROMENADE_Z = 17;

const hash = (x: number, z: number) => {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** Узор черепицы на скатах (по нормали в мире), вдали — ровный тон, чтобы не рябило */
const ROOF_GLSL = /* glsl */ `
	{
		vec3 roofN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
		if ( roofN.y > 0.25 && roofN.y < 0.97 ) {
			vec2 roofD = normalize( roofN.xz );
			float roofRow = dot( vRoofW.xz, roofD ) * 1.7;
			float roofCol = dot( vRoofW.xz, vec2( -roofD.y, roofD.x ) ) * 2.0 + floor( roofRow ) * 0.5;
			float roofTile = 0.74 + 0.26 * smoothstep( 0.0, 0.32, fract( roofRow ) ) * ( 0.8 + 0.2 * sin( fract( roofCol ) * 3.14159 ) );
			diffuseColor.rgb *= mix( 0.9, roofTile, 1.0 - smoothstep( 45.0, 120.0, length( vRoofW - cameraPosition ) ) );
		}
	}
`;

function roofTiles(m: THREE.Material): void {
  const prev = m.onBeforeCompile;
  const key = m.customProgramCacheKey();
  m.onBeforeCompile = (s, r) => {
    prev.call(m, s, r);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoofW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvRoofW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoofW;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${ROOF_GLSL}`);
  };
  m.customProgramCacheKey = () => `${key}|roof`;
  m.needsUpdate = true;
}

/** Город и крыша кафе в новом виде. lite — телефон: кипарисы проще. */
export function lookTown(scene: THREE.Scene, lite: boolean): void {
  let houses: THREE.MeshLambertMaterial | null = null;
  let cafeRoof: THREE.MeshStandardMaterial | null = null;
  const crowns: THREE.InstancedMesh[] = [];
  const cylinders: THREE.InstancedMesh[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const m = mesh.material as THREE.Material;
    if (Array.isArray(m)) return;
    const lam = m as THREE.MeshLambertMaterial;
    const std = m as THREE.MeshStandardMaterial;
    if (lam.isMeshLambertMaterial && lam.emissiveMap && lam.map && lam.vertexColors) houses = lam;
    if (std.isMeshStandardMaterial && std.side === THREE.DoubleSide && std.map && std.vertexColors && std.roughness === 0.7 && std.metalness === 0.15) cafeRoof = std;
    const inst = o as THREE.InstancedMesh;
    if (inst.isInstancedMesh && m.customProgramCacheKey().includes('town-crown')) crowns.push(inst);
    if (inst.isInstancedMesh && inst.geometry.type === 'CylinderGeometry') cylinders.push(inst);
  });

  const h = houses as THREE.MeshLambertMaterial | null;
  if (h) {
    const f = lookFacadeTextures();
    h.map?.dispose();
    h.emissiveMap?.dispose();
    h.map = f.map;
    h.emissiveMap = f.emissive;
    roofTiles(h);
  }
  const roof = cafeRoof as THREE.MeshStandardMaterial | null;
  if (roof) {
    roof.map = lookRoofTexture();
    roof.needsUpdate = true;
  }
  // кроны: сначала ближние (подробные), потом дальние; стволы — в том же порядке подряд
  crowns.sort((a, b) => b.geometry.getAttribute('position').count - a.geometry.getAttribute('position').count);
  if (crowns.length !== 2) return;
  const tr = cylinders.find((c) => c.count === crowns[0].count + crowns[1].count);
  if (!tr) return;
  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const haze = new THREE.Color();
  const c = new THREE.Color();
  let base = 0;
  crowns.forEach((crown, li) => {
    const picked: Array<[number, number, number, number]> = [];
    const total = crown.count;
    // круглые кроны, что остаются, — подряд в начало, лишние не рисуем вовсе (count меньше)
    let keep = 0;
    for (let i = 0; i < total; i++) {
      crown.getMatrixAt(i, m4);
      m4.decompose(p, q, s);
      const r = s.x;
      const cypress = r > 0 && !(Math.abs(p.z - PROMENADE_Z) < 2 && p.x > 36) && hash(p.x, p.z) <= CYPRESS_SHARE;
      if (!cypress) {
        if (keep !== i) {
          crown.setMatrixAt(keep, m4);
          if (crown.instanceColor) crown.setColorAt(keep, crown.getColorAt(i, c));
        }
        keep++;
        continue;
      }
      picked.push([p.x, p.y - 1.2 - r * 1.25, p.z, r]);
      // ствол кипариса почти не виден
      tr.getMatrixAt(base + i, m4);
      m4.decompose(p, q, s);
      s.y = 1.0;
      tr.setMatrixAt(base + i, m4.compose(p, q, s));
    }
    base += total;
    crown.count = keep;
    crown.instanceMatrix.needsUpdate = true;
    if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
    crown.computeBoundingSphere();
    if (!picked.length) return;
    // ближние (до 260 м) — 6 граней по кругу, дальние — 4: город от площади не ближе 40 м
    const near = li === 0;
    const geo = near && !lite ? cypressGeometry(6, 5) : near ? cypressGeometry(5, 4) : cypressGeometry(4, 3);
    swayGeo(geo);
    const cyp = new THREE.InstancedMesh(geo, crown.material, picked.length);
    picked.forEach(([x, y, z, r], k) => {
      const height = 5.5 + r * 1.35;
      const w = 0.7 + height * 0.065;
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, hash(z, x) * Math.PI * 2);
      cyp.setMatrixAt(k, m4.compose(p.set(x, y + 0.5, z), q, s.set(w, height, w)));
      cyp.setColorAt(k, c.copy(CYPRESS).multiplyScalar(0.85 + hash(x + 3, z) * 0.3).lerp(haze, skyHaze(haze, x, y + 4, z)));
    });
    cyp.matrixAutoUpdate = false;
    cyp.computeBoundingSphere();
    scene.add(cyp);
  });
  tr.instanceMatrix.needsUpdate = true;
}

/** Атрибут качания (как swayAttr в decor.ts): у основания 0, к макушке — 1 */
function swayGeo(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute('position');
  const a = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = Math.min(1, Math.max(0, pos.getY(i)));
    a[i] = k * k * 0.5;
  }
  g.setAttribute('aSway', new THREE.BufferAttribute(a, 1));
}
