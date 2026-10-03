// Мелкие помощники построения граней для мира гонки (world.ts, hazardvis.ts).
import * as THREE from 'three';
import { quad, type GeoParts, type V3 } from '../render/kit.ts';

const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _n = new THREE.Vector3();

export const WHITE = new THREE.Color(0xffffff);

/** Грань из 4 точек: порядок обхода поправляется так, чтобы грань смотрела по нормали nrm. */
export function face(p: GeoParts, a: V3, b: V3, c: V3, d: V3, nrm: V3, uvs: number[], cols: THREE.Color[]): void {
  _ab.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  _ac.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  _n.crossVectors(_ab, _ac);
  if (_n.x * nrm[0] + _n.y * nrm[1] + _n.z * nrm[2] >= 0) quad(p, a, b, c, d, nrm, uvs, cols);
  else quad(p, a, d, c, b, nrm, [uvs[0], uvs[1], uvs[6], uvs[7], uvs[4], uvs[5], uvs[2], uvs[3]], [cols[0], cols[3], cols[2], cols[1]]);
}

export const same = (c: THREE.Color): THREE.Color[] => [c, c, c, c];
