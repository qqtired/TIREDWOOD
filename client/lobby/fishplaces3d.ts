// Небольшие пристройки рыбацкого причала. Сам настил рисует LobbyWorld из map.boxes;
// здесь — его нижняя обвязка, сваи и тумбы, совпадающие с общей физической геометрией.
import * as THREE from 'three';
import { FISH_DECKS, FISH_MOORINGS, FISH_SPOTS } from '../../shared/fishplaces.ts';
import { mergeColored, paint, place, staticMesh } from '../render/kit.ts';

export function addFishPlaces3d(parent: THREE.Object3D): void {
  const timber: THREE.BufferGeometry[] = [];
  const fittings: THREE.BufferGeometry[] = [];
  for (const d of FISH_DECKS) {
    const w = d.x1 - d.x0, depth = d.z1 - d.z0;
    const x = (d.x0 + d.x1) / 2, z = (d.z0 + d.z1) / 2;
    // Обвязка только ниже поверхности, без поперечного ограждения входов.
    for (const edgeX of [d.x0 + 0.04, d.x1 - 0.04]) {
      timber.push(place(paint(new THREE.BoxGeometry(0.08, 0.22, depth), 0x705035), edgeX, -0.19, z));
    }
    for (const edgeZ of [d.z0 + 0.04, d.z1 - 0.04]) {
      timber.push(place(paint(new THREE.BoxGeometry(w, 0.22, 0.08), 0x705035), x, -0.19, edgeZ));
    }
    // сваи по периметру: на углах и (у длинных настилов) не реже чем через 3,2 м
    const nz = Math.max(1, Math.ceil((depth - 0.44) / 3.2));
    const nx = Math.max(1, Math.ceil((w - 0.44) / 3.2));
    const posts = new Set<string>();
    const post = (px: number, pz: number): void => {
      const key = `${px.toFixed(2)},${pz.toFixed(2)}`;
      if (posts.has(key)) return;
      posts.add(key);
      timber.push(place(paint(new THREE.CylinderGeometry(0.1, 0.12, 1.9, 8), 0x5a4937), px, -1.25, pz));
    };
    for (let i = 0; i <= nz; i++) for (const edgeX of [d.x0 + 0.22, d.x1 - 0.22]) post(edgeX, d.z0 + 0.22 + ((depth - 0.44) * i) / nz);
    for (let i = 0; i <= nx; i++) for (const edgeZ of [d.z0 + 0.22, d.z1 - 0.22]) post(d.x0 + 0.22 + ((w - 0.44) * i) / nx, edgeZ);
  }
  // Every fishing station has the same flush timber inset and brass corner marks.
  // Identical local dimensions follow the cast direction; no rails/props interrupt seated exits.
  for (const s of FISH_SPOTS) {
    // места на моле острова (zone isle) — на камне мола, в 2,4 км: своих накладок там нет
    if (s.zone === 'isle') continue;
    const station: THREE.BufferGeometry[]=[];
    for (const side of [-1,1]) {
      station.push(place(paint(new THREE.BoxGeometry(1.64,.007,.032),0x9b8360),0,.006,side*.46));
      station.push(place(paint(new THREE.BoxGeometry(.032,.007,.92),0x9b8360),side*.82,.006,0));
      for(const x of [-.75,.75]) station.push(place(paint(new THREE.BoxGeometry(.115,.011,.07),0xb4a17a),x,.01,side*.4));
    }
    const inset=mergeColored(station).rotateY(s.yaw).translate(s.x,0,s.z);
    fittings.push(inset);
  }
  for (const m of FISH_MOORINGS) {
    timber.push(place(paint(new THREE.CylinderGeometry(m.r, m.r, m.h + 0.32, 10), 0x826044), m.x, (m.h - 0.32) / 2, m.z));
    fittings.push(place(paint(new THREE.CylinderGeometry(m.r * 0.94, m.r * 0.94, 0.03, 10), 0x525b61), m.x, m.h - 0.015, m.z));
    // Небольшая мотка каната не выступает за физический габарит тумбы.
    for (const dy of [0, 0.018, 0.036]) {
      fittings.push(place(paint(new THREE.TorusGeometry(m.r * 0.8, 0.013, 4, 12).rotateX(Math.PI / 2), 0xb9ab85), m.x, 0.43 + dy, m.z));
    }
  }
  const group = new THREE.Group();
  group.name = 'fishing-deck-moorings';
  group.add(staticMesh(mergeColored(timber), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 }), true));
  group.add(staticMesh(mergeColored(fittings), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.1 }), true));
  parent.add(group);
}
