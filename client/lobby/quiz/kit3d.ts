// «Ракушка»: общее для 3D площадки — семейства материалов plaza3 и холст-текстура для квадов из GLB.
import * as THREE from 'three';

export type Family = 'matte' | 'gloss' | 'glow';
export type FamilyMats = Record<Family, THREE.Material>;

export function familyOf(m: THREE.Material): Family {
  if (m.name.startsWith('p3_glow')) return 'glow';
  if (m.name.startsWith('p3_gloss')) return 'gloss';
  return 'matte';
}

export interface CanvasTex {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
}

export function canvasTex(w: number, h: number): CanvasTex {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // UV квадов — по правилам glTF (v = 0 сверху), как у текстур, которые грузит GLTFLoader
  tex.flipY = false;
  return { canvas, ctx, tex };
}

/** Квад с холстом: MeshBasic без тонмаппинга (как у вывесок plaza3 — та же программа); p3keep — не гаснет по дальности */
export function canvasMesh(geo: THREE.BufferGeometry, t: CanvasTex, name: string): THREE.Mesh {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false }));
  m.name = name;
  m.userData.p3keep = true;
  m.castShadow = false;
  return m;
}

/** Плавно: 0 → 1 с разгоном и торможением */
export const ease = (k: number): number => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
