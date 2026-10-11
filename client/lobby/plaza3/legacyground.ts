// Принятые владельцем покрытия старой площади: исходные генераторы и те же пропорции мозаики.
// Кайма и звезда объединяются в одну карту для готового круга новой площади — без новых мешей/программ.
import * as THREE from 'three';
import { compassRoseTexture, paverTexture } from '../../render/textures.ts';
import { lookRingTexture } from '../looktex.ts';

export type LegacyGround = 'pavers' | 'mosaic';

export function legacyGroundTexture(kind: LegacyGround): THREE.CanvasTexture {
  if (kind === 'pavers') return paverTexture();
  const rose = compassRoseTexture();
  const ring = lookRingTexture(3, 4.5);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  // Светлое поле закрывает только субпиксельный зазор между двумя прежними картами.
  ctx.fillStyle = '#efe6d2';
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.drawImage(ring.image, 0, 0, 1024, 1024);
  const diameter = 1024 * (3 / 4.5);
  const inset = (1024 - diameter) / 2;
  ctx.drawImage(rose.image, inset, inset, diameter, diameter);
  rose.dispose();
  ring.dispose();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
