// Воспроизводимая модель по принятому концепту 02-chalk-kite: ткань, деревянная крестовина, катушка и банты.
// Геометрия и цвет вершин, без внешних текстур, ламп и теней. Одинаковые части рисуются инстансами.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CORAL = 0xd97361;
const MINT = 0x79b7a0;
const CREAM = 0xf0ddbb;
const WOOD = 0x9b6841;

function colored(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const a = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.index ? g.toNonIndexed() : g;
}

function join(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  return g;
}

function spar(a: THREE.Vector3, b: THREE.Vector3, r: number, color: number): THREE.BufferGeometry {
  const direction = b.clone().sub(a);
  return colored(new THREE.CylinderGeometry(r, r, direction.length(), 5)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()))
    .translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), color);
}

export function kiteGeometry(): THREE.BufferGeometry {
  const corners = [new THREE.Vector3(0, 0.77, 0), new THREE.Vector3(0.61, 0.1, 0), new THREE.Vector3(0, -0.89, 0), new THREE.Vector3(-0.61, 0.1, 0)];
  const middle = new THREE.Vector3(0, 0.1, 0.09);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...middle.toArray(), ...a.toArray(), ...b.toArray()], 3));
    g.computeVertexNormals();
    parts.push(colored(g, i % 2 ? MINT : CORAL));
    parts.push(spar(a, b, 0.012, CREAM));
    // Крупные швы вместо мелкой шумной текстуры: видны с игровой камеры и не белеют при загрузке.
    parts.push(spar(middle, a, 0.007, CREAM));
  }
  parts.push(spar(corners[0], corners[2], 0.019, WOOD), spar(corners[1], corners[3], 0.019, WOOD));
  parts.push(colored(new THREE.SphereGeometry(0.035, 8, 5).translate(0, 0.1, 0.095), CREAM));
  return join(parts);
}

export function spoolGeometry(): THREE.BufferGeometry {
  const parts = [colored(new THREE.CylinderGeometry(0.087, 0.087, 0.2, 14).rotateZ(Math.PI / 2), CREAM)];
  for (const x of [-0.12, 0.12]) parts.push(colored(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 14).rotateZ(Math.PI / 2).translate(x, 0, 0), WOOD));
  parts.push(colored(new THREE.CylinderGeometry(0.026, 0.026, 0.46, 8).rotateZ(Math.PI / 2), WOOD));
  for (let x = -0.08; x <= 0.081; x += 0.04) parts.push(colored(new THREE.TorusGeometry(0.088, 0.006, 3, 14).rotateY(Math.PI / 2).translate(x, 0, 0), 0xcfb78f));
  return join(parts);
}

export function bowGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, -0.18, -0.095, 0.025, -0.17, 0.095, -0.025,
    0, 0, 0, 0.17, 0.095, -0.025, 0.18, -0.095, 0.025,
  ], 3));
  g.computeVertexNormals();
  return join([colored(g, CREAM), colored(new THREE.SphereGeometry(0.027, 6, 4), CORAL)]);
}
