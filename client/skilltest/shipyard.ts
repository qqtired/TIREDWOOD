// Procedural harbour kit. Every landing top is exactly local y=0; hardware sits outside the walkable footprint.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint } from '../render/kit.ts';
import { brickTexture, concreteTexture, metalEnvTexture, metalTexture, plankTexture, rollerDoorTexture } from '../render/textures.ts';

type P = readonly [number, number, number];
export type YardMaterial = 'wood' | 'steel' | 'edge' | 'brass' | 'rubber' | 'paint' | 'concrete' | 'brick' | 'door';
export const YARD = { navy: 0x263f50, edge: 0x536775, brass: 0xbd955c, wood: 0xa28359, darkWood: 0x826542, teal: 0x408c88, orange: 0xcf763f, cream: 0xd7c99e, rubber: 0x30373b };
export function yardMaterials(): Record<YardMaterial, THREE.MeshStandardMaterial> {
  const wood = plankTexture(), steel = metalTexture(), env = metalEnvTexture(), brick = brickTexture(), concrete = concreteTexture(), door = rollerDoorTexture();
  for (const t of [wood, steel, brick, concrete, door]) t.anisotropy = 4;
  return {
    wood: new THREE.MeshStandardMaterial({ map: wood, bumpMap: wood, bumpScale: .035, roughness: .92, vertexColors: true }),
    steel: new THREE.MeshStandardMaterial({ map: steel, bumpMap: steel, bumpScale: .022, roughness: .7, metalness: .32, vertexColors: true }),
    edge: new THREE.MeshStandardMaterial({ roughness: .52, metalness: .55, envMap: env, envMapIntensity: .2, vertexColors: true }),
    brass: new THREE.MeshStandardMaterial({ roughness: .4, metalness: .7, envMap: env, envMapIntensity: .45, vertexColors: true }),
    rubber: new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true }),
    paint: new THREE.MeshStandardMaterial({ roughness: .82, vertexColors: true }),
    concrete: new THREE.MeshStandardMaterial({ map: concrete, bumpMap: concrete, bumpScale: .035, roughness: 1, vertexColors: true }),
    brick: new THREE.MeshStandardMaterial({ map: brick, bumpMap: brick, bumpScale: .022, roughness: .95, vertexColors: true }),
    door: new THREE.MeshStandardMaterial({ map: door, roughness: .72, metalness: .22, vertexColors: true }),
  };
}
/** Merge by material, including rivets/trusses/planks. No per-detail draw call. */
export class YardBatch {
  private readonly parts = new Map<YardMaterial, THREE.BufferGeometry[]>();
  add(key: YardMaterial, geometry: THREE.BufferGeometry, color: number, at: P = [0, 0, 0], rotation?: THREE.Quaternion): void {
    const g = paint(geometry, color); if (g !== geometry) geometry.dispose();
    if (rotation) g.applyQuaternion(rotation); g.translate(...at);
    if (key === 'steel' || key === 'brick' || key === 'concrete') {
      const scale = key === 'brick' ? .25 : .5;
      // Metre-scaled incumbent materials: 4m brick tiles, 2m concrete/steel tiles.
      const pos = g.getAttribute('position'), normal = g.getAttribute('normal'), uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) {
        const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
        uv.setXY(i, (nx > ny && nx > nz ? pos.getZ(i) : pos.getX(i)) * scale, (ny > nx && ny > nz ? pos.getZ(i) : pos.getY(i)) * scale);
      }
    }
    const list = this.parts.get(key) ?? []; list.push(g); this.parts.set(key, list);
  }
  box(key: YardMaterial, color: number, at: P, size: P, round = 0): void { this.add(key, round ? new RoundedBoxGeometry(...size, 1, round) : new THREE.BoxGeometry(...size), color, at); }
  beam(key: YardMaterial, color: number, a: P, b: P, width: number, depth = width): void {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.sub(start), len = delta.length();
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    this.add(key, new THREE.BoxGeometry(width, len, depth), color, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rotation);
  }
  cylinder(key: YardMaterial, color: number, at: P, radius: number, height: number, segments = 8, rotation?: THREE.Quaternion): void { this.add(key, new THREE.CylinderGeometry(radius, radius, height, segments), color, at, rotation); }
  flush(parent: THREE.Object3D, materials: Record<YardMaterial, THREE.Material>, shadows = true): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const [key, pieces] of this.parts) {
      const g = mergeGeometries(pieces, false)!; g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, materials[key]); mesh.castShadow = shadows; mesh.receiveShadow = true; parent.add(mesh); meshes.push(mesh);
      for (const p of pieces) p.dispose();
    }
    this.parts.clear(); return meshes;
  }
}

/** Deep steel cassette, real separated timber planks, perimeter toe plates, bolts, and underslung girders. */
export function yardDeck(b: YardBatch, x: number, top: number, z: number, w: number, d: number, accent: number, checkpoint = false): void {
  b.box('steel', YARD.navy, [x, top - .58, z], [w, .84, d], .14);
  b.box('edge', YARD.edge, [x, top - .18, z], [w, .18, d], .05);
  const count = Math.max(3, Math.floor((d - .32) / .4)), plankD = (d - .32) / count;
  for (let j = 0; j < count; j++) {
    const zz = z - d / 2 + .16 + plankD * (j + .5);
    const grain = j % 4 === 0 ? YARD.darkWood : j % 3 === 0 ? 0xb19468 : YARD.wood;
    const board = new RoundedBoxGeometry(w - .28, .12, plankD - .025, 1, .025);
    const uv = board.getAttribute('uv');
    // One physical board samples one atlas row; fibres run along its real length.
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * .5, uv.getY(i) * .091 + (j % 10) * .1 + .004);
    b.add('wood', board, grain, [x, top - .06, zz]);
    for (const end of [-1, 1]) b.cylinder('brass', YARD.brass, [x + end * (w / 2 - .24), top + .002, zz], .027, .006, 6);
  }
  // Steel rim is flush, not an invisible obstacle above the collider.
  for (const side of [-1, 1]) {
    b.box('steel', accent, [x, top - .075, z + side * (d / 2 - .075)], [w, .15, .15]);
    b.box('steel', accent, [x + side * (w / 2 - .075), top - .075, z], [.15, .15, d]);
    b.box('steel', YARD.navy, [x, top - 1.12, z + side * d * .32], [w - .2, .45, .18]);
    b.box('edge', YARD.edge, [x, top - 1.36, z + side * d * .32], [w - .1, .075, .32]);
    for (let k = 0; k < Math.max(2, Math.floor(w)); k++) b.cylinder('brass', YARD.brass, [x - w / 2 + .3 + k * (w - .6) / Math.max(1, Math.floor(w) - 1), top - .57, z + side * (d / 2 + .007)], .044, .025, 6, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    b.beam('edge', YARD.edge, [x - w * .38, top - .9, z + side * d * .32], [x + w * .38, top - 2.05, z + side * d * .32], .095);
    b.beam('edge', YARD.edge, [x + w * .38, top - .9, z + side * d * .32], [x - w * .38, top - 2.05, z + side * d * .32], .095);
    b.box('steel', YARD.navy, [x, top - 2.05, z + side * d * .32], [w * .76 + .15, .15, .18]);
    for (const end of [-1, 1]) b.beam('edge', YARD.edge, [x + end * w * .38, top - .9, z + side * d * .32], [x + end * w * .38, top - 2.05, z + side * d * .32], .115);
  }
  // Alternating warning blocks sit on the outgoing steel lip, entirely inside its real footprint.
  for (let zz = -d / 2 + .25; zz < d / 2 - .15; zz += .55) b.box('paint', YARD.orange, [x + w / 2 - .08, top + .006, z + zz], [.11, .008, .27]);
  // Two broad paint bars identify the arrival edge, without covering the timber surface.
  for (const zz of [-1, 1]) b.box('paint', YARD.cream, [x - w / 2 + .27, top + .006, z + zz * d * .25], [.2, .008, d * .29]);
  if (checkpoint) {
    b.box('paint', YARD.teal, [x, top + .005, z], [Math.min(w - .8, 3.7), .008, .2]);
    const arrow = new THREE.Shape(); arrow.moveTo(-.55, -.19); arrow.lineTo(.12, -.19); arrow.lineTo(.12, -.47); arrow.lineTo(.68, 0); arrow.lineTo(.12, .47); arrow.lineTo(.12, .19); arrow.lineTo(-.55, .19); arrow.closePath();
    const geo = new THREE.ShapeGeometry(arrow); geo.rotateX(-Math.PI / 2); b.add('paint', geo, YARD.cream, [x + 1.15, top + .012, z + d * .28]);
  }
}

/** Structural portal is far outside the walking rectangle; diagonal ties end below the landing top. */
export function yardTower(b: YardBatch, x: number, roof = 50): void {
  for (const z of [-9.5, 9.5]) {
    for (const dx of [-1.15, 1.15]) b.box('steel', YARD.navy, [x + dx, (roof + 1) / 2, z], [.38, roof - 1, .38]);
    for (let y = 3; y < roof - 3; y += 5) {
      b.box('edge', YARD.edge, [x, y, z], [2.7, .22, .45]);
      b.beam('steel', y % 2 ? YARD.teal : YARD.edge, [x - 1.15, y, z], [x + 1.15, y + 5, z], .13);
    }
    b.box('concrete', 0x8a8b7e, [x, .1, z], [4.6, 2.5, 4.2], .16);
  }
  b.box('steel', YARD.navy, [x, roof, 0], [2.85, .8, 19.7]);
  b.box('steel', YARD.teal, [x, roof + .5, 0], [3.1, .24, 20]);
  for (const side of [-1, 1]) b.beam('edge', YARD.edge, [x, roof - .4, side * 8.5], [x, roof - 4.5, side * 5], .19);
}

export interface YardMover { root: THREE.Group; cables: THREE.Mesh[]; lamps: THREE.MeshStandardMaterial[]; wheels: THREE.Group; wheelDiscs: THREE.Mesh[]; counterweight: THREE.Group | null; counterCable: THREE.Mesh | null; roof: number }
export function yardMover(w: number, d: number, accent: number, kind: 'ferry' | 'lift' | 'sink', roof: number, materials: Record<YardMaterial, THREE.Material>): YardMover {
  const root = new THREE.Group(), b = new YardBatch(); yardDeck(b, 0, 0, 0, w, d, accent);
  // Side outriggers suspend the deck, leaving all approach/exit edges open.
  for (const side of [-1, 1]) {
    b.box('steel', YARD.navy, [0, -.35, side * (d / 2 + .36)], [w + .5, .25, .34]);
    for (const x of [-w * .3, w * .3]) {
      b.beam('steel', YARD.navy, [x, -.35, side * (d / 2 - .15)], [x, -.35, side * (d / 2 + .98)], .16);
      b.cylinder('brass', YARD.orange, [x, -.085, side * (d / 2 + .98)], .11, .31, 8);
    }
    if (kind !== 'sink') {
      b.beam('steel', accent, [-w / 2 + .35, -.35, side * (d / 2 + .98)], [-w / 2 + .35, 2.8, side * (d / 2 + .98)], .12);
      b.beam('steel', accent, [w / 2 - .35, -.35, side * (d / 2 + .98)], [w / 2 - .35, 2.8, side * (d / 2 + .98)], .12);
      b.box('steel', YARD.navy, [0, 2.8, side * (d / 2 + .98)], [w - .45, .15, .2]);
    }
  }
  b.flush(root, materials, false);
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x4f5250, roughness: .65, metalness: .55 });
  const cableBatch = new YardBatch();
  for (const x of [-w * .3, w * .3]) for (const side of [-1, 1]) cableBatch.cylinder('edge', 0x4f5250, [x, 0, side * (d / 2 + .98)], .035, 1, 6);
  const cables = cableBatch.flush(root, materials, false);
  const wheels = new THREE.Group(); root.add(wheels);
  const carriage = new YardBatch();
  for (const side of [-1, 1]) carriage.box('steel', YARD.orange, [0, .02, side * (d / 2 + .98)], [w - .2, .38, .48], .07);
  const wheelDiscs: THREE.Mesh[] = [];
  const wheelMat = new THREE.MeshStandardMaterial({ color: YARD.brass, roughness: .42, metalness: .68 });
  for (const x of [-w * .3, w * .3]) for (const side of [-1, 1]) {
    const zz = side * (d / 2 + .98);
    carriage.add('brass', new THREE.TorusGeometry(.26, .045, 6, 14).rotateY(Math.PI / 2), YARD.brass, [x, -.09, zz]);
    carriage.cylinder('brass', YARD.brass, [x, -.09, zz], .1, .21, 8, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(.12, .44, .055), wheelMat); spoke.position.set(x, -.09, zz); wheels.add(spoke); wheelDiscs.push(spoke);
  }
  carriage.flush(wheels, materials, false);
  let counterweight: THREE.Group | null = null; let counterCable: THREE.Mesh | null = null;
  if (kind === 'lift') {
    counterweight = new THREE.Group(); const weights = new YardBatch();
    for (let i = 0; i < 3; i++) { weights.box('concrete', 0x9a9280, [0, (i - 1) * .44, d / 2 + 2.2], [1.25, .4, .5], .04); for (const x of [-.43, .43]) weights.cylinder('brass', YARD.brass, [x, (i - 1) * .44, d / 2 + 2.465], .045, .025, 6, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)); }
    weights.flush(counterweight, materials, false); root.add(counterweight);
    counterCable = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 1, 6), cableMat); counterCable.position.z = d / 2 + 2.2; root.add(counterCable);
  }
  const lamps: THREE.MeshStandardMaterial[] = [];
  for (const side of [-1, 1]) { const mat = new THREE.MeshStandardMaterial({ color: YARD.cream, emissive: YARD.teal, emissiveIntensity: .4 }); const lamp = new THREE.Mesh(new THREE.CylinderGeometry(.11, .13, .13, 8), mat); lamp.position.set(0, .13, side * (d / 2 + .36)); root.add(lamp); lamps.push(mat); }
  return { root, cables, lamps, wheels, wheelDiscs, counterweight, counterCable, roof };
}
export interface YardHazard { root: THREE.Group; rotor: THREE.Group; jets: THREE.Group; lights: THREE.MeshStandardMaterial[] }
export function yardSweeper(radius: number, materials: Record<YardMaterial, THREE.Material>): YardHazard {
  const root = new THREE.Group(), rotor = new THREE.Group(), base = new YardBatch(), arm = new YardBatch();
  base.cylinder('steel', YARD.navy, [0, -.35, 0], .65, .65, 12); base.cylinder('brass', YARD.brass, [0, .18, 0], .25, .54, 12); base.cylinder('steel', YARD.edge, [0, .44, 0], .38, .18, 12);
  base.flush(root, materials, false);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  arm.cylinder('rubber', YARD.orange, [0, .45, 0], .22, radius * 2, 12, q);
  for (const side of [-1, 1]) for (const at of [.65, 1.6, radius - .22]) arm.cylinder('rubber', at < 1 ? YARD.cream : YARD.rubber, [side * at, .45, 0], .236, .12, 12, q);
  arm.flush(rotor, materials, false); root.add(rotor); return { root, rotor, jets: new THREE.Group(), lights: [] };
}
export function yardPulse(radius: number, materials: Record<YardMaterial, THREE.Material>): YardHazard {
  const root = new THREE.Group(), rotor = new THREE.Group(), jets = new THREE.Group(), b = new YardBatch();
  b.box('steel', YARD.navy, [0, -.15, -4], [radius * 2 + .65, 1.12, 1.05], .12);
  b.box('steel', YARD.teal, [0, .48, -4.2], [radius * 2 + .55, .18, .75], .07);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  for (const x of [-radius * .65, 0, radius * .65]) {
    b.cylinder('edge', YARD.edge, [x, .43, -3.39], .29, .24, 12, q); b.cylinder('rubber', YARD.rubber, [x, .43, -3.22], .22, .09, 12, q);
    const fan = new THREE.Mesh(paint(new THREE.BoxGeometry(.36, .075, .06), YARD.brass), materials.brass); fan.position.set(x, .43, -3.15); rotor.add(fan);
    const jet = new THREE.Mesh(new THREE.ConeGeometry(.36, 5.75, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xf5e9c6, transparent: true, opacity: .19, depthWrite: false, side: THREE.DoubleSide })); jet.rotation.x = -Math.PI / 2; jet.position.set(x, .45, -.275); jets.add(jet);
  }
  // Embedded amber runway strips mark exactly the pulse lane.
  b.box('paint', YARD.orange, [0, .009, 0], [radius * 2, .008, .13]);
  for (const x of [-radius, radius]) for (let z = -2; z <= 2; z += .5) b.box('paint', YARD.cream, [x, .008, z], [.12, .006, .28]);
  b.flush(root, materials, false); root.add(rotor, jets); jets.visible = false;
  const mat = new THREE.MeshStandardMaterial({ color: YARD.cream, emissive: YARD.teal, emissiveIntensity: .5 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 8), mat); lamp.position.set(0, .88, -4.2); root.add(lamp);
  return { root, rotor, jets, lights: [mat] };
}
