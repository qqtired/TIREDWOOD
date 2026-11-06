// «Город вверх»: материалы трассы. Те же ключи, что у Batch (look.ts), плюс плитка крыш. Дерево, штукатурка, кирпич
// и ткань берут принятый атлас каланчи (material-atlas-v1.png) трипланарно в координатах объекта: у неподвижных
// склеек это мир, у подвижного — сам предмет, поэтому рисунок едет вместе с люлькой и не «плывёт».
import * as THREE from 'three';
import { makeMaterials, type MatKey } from '../look.ts';
import { TOWER_ATLAS_URL } from '../model-source.ts';

export type ClimbMats = Record<MatKey, THREE.Material> & { tile: THREE.Material; facade: THREE.Material };

/** Атлас: 0 — доски, 1 — штукатурка, 2 — кирпич, 3 — холст; scale — метров на плитку рисунка. */
function atlased(mat: THREE.MeshStandardMaterial, atlas: THREE.Texture, kind: number, scale: number, mix: number): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.climbAtlas = { value: atlas };
    shader.vertexShader = `varying vec3 vClimbP; varying vec3 vClimbN;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvClimbP = position; vClimbN = normal;',
    );
    shader.fragmentShader = `uniform sampler2D climbAtlas; varying vec3 vClimbP; varying vec3 vClimbN;\n${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
        vec3 tn = abs(normalize(vClimbN));
        vec2 uv = tn.y > .65 ? vClimbP.xz : tn.x > tn.z ? vClimbP.zy : vClimbP.xy;
        vec2 corner = ${['vec2(0.0,.5)', 'vec2(.5,.5)', 'vec2(0.0,0.0)', 'vec2(.5,0.0)'][kind]};
        vec2 sUv = corner + vec2(.002) + fract(uv / ${scale.toFixed(2)}) * .496;
        vec3 albedo = texture2D(climbAtlas, sUv).rgb;
        diffuseColor.rgb *= mix(vec3(1.0), albedo * ${[1.55, 1.28, 1.8, 1.3][kind].toFixed(2)}, ${mix.toFixed(2)});
      `,
    );
  };
  mat.customProgramCacheKey = () => `climb-atlas-${kind}-${scale}-${mix}`;
  mat.needsUpdate = true;
}

/** Плитка-терракота (крыши-террасы): квадраты с затиркой, UV в метрах. */
function tileTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d9b9a0';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) {
    const l = 0.9 + (((i * 7 + k * 13) % 9) / 9) * 0.16;
    g.fillStyle = `rgb(${Math.round(196 * l)},${Math.round(104 * l)},${Math.round(70 * l)})`;
    g.fillRect(i * 64 + 3, k * 64 + 3, 58, 58);
    g.fillStyle = 'rgba(255,230,200,0.10)';
    g.fillRect(i * 64 + 6, k * 64 + 6, 30, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.5, 0.5);
  t.anisotropy = 4;
  return t;
}

/** Фасад: клетка 1,7 × 2,6 м — окно с белым наличником, зелёные ставни, подоконник, тонкий пояс перекрытия. Белое — стена (её цвет в вершинах). */
function facadeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 384;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 384);
  // пояс перекрытия внизу клетки
  g.fillStyle = '#e4dccb';
  g.fillRect(0, 372, 256, 12);
  // ставни
  g.fillStyle = '#5d9a6c';
  g.fillRect(12, 96, 50, 196);
  g.fillRect(194, 96, 50, 196);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 104; y < 288; y += 14) { g.fillRect(16, y, 42, 3); g.fillRect(198, y, 42, 3); }
  // наличник и стекло
  g.fillStyle = '#fbf7ee';
  g.fillRect(62, 86, 132, 216);
  g.fillStyle = '#41586a';
  g.fillRect(72, 96, 112, 196);
  g.fillStyle = '#5b7488';
  g.fillRect(72, 96, 112, 60);
  g.fillStyle = '#fbf7ee';
  g.fillRect(124, 96, 8, 196);
  g.fillRect(72, 180, 112, 7);
  // подоконник
  g.fillStyle = '#efe7d6';
  g.fillRect(54, 300, 148, 14);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function makeClimbMaterials(): ClimbMats {
  const base = makeMaterials();
  const tile = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, map: tileTexture() });
  const facade = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, map: facadeTexture() });
  const mats = { ...base, tile, facade } as ClimbMats;
  const atlas = new THREE.TextureLoader().load(TOWER_ATLAS_URL);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  atlased(mats.wood as THREE.MeshStandardMaterial, atlas, 0, 2.4, 0.6);
  atlased(mats.plaster as THREE.MeshStandardMaterial, atlas, 1, 4, 0.7);
  atlased(mats.brick as THREE.MeshStandardMaterial, atlas, 2, 2.2, 0.75);
  atlased(mats.cloth as THREE.MeshStandardMaterial, atlas, 3, 1, 0.45);
  return mats;
}
