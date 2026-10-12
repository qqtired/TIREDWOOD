// Принятый Blender-набор «Волны» v3. В игре анимацию задаёт shared/aquadyn.ts,
// а не демонстрационные клипы GLB: видимый механизм и его коллизия используют одни часы.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AQUA_BAG_H, AQUA_BAG_R, AQUA_BAGS, type AquaMover, type AquaPiece, type AquaSweeper } from '../../shared/aqua.ts';
import { WATER_Y } from '../../shared/constants.ts';
import { mergeColored, paint, place } from '../render/kit.ts';

const MODEL_URL = new URL('../assets/aqua/v3/aqua-kit-v3.glb', import.meta.url).href;
const CREAM = 0xf7f1e5;
const MINT = 0x76b8a3;
const WOOD = 0x85562f;
export const AQUA_MODEL_PARTS = ['aqua_ferry', 'aqua_sink', 'aqua_slide', 'aqua_sweeper', 'aqua_sweeper_disc', 'aqua_pendulum_bag', 'aqua_trampoline', 'aqua_lift', 'aqua_lift_frame'] as const;

export class AquaKit {
  private readonly parts = new Map<string, THREE.BufferGeometry>();

  constructor(root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    for (const name of AQUA_MODEL_PARTS) {
      const node = root.getObjectByName(name);
      if (!node) throw new Error(`Аквапарк: нет узла ${name}`);
      const inverse = node.matrixWorld.clone().invert();
      const list: THREE.BufferGeometry[] = [];
      node.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
        const pos = g.getAttribute('position');
        const col = g.getAttribute('color');
        const rgb = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
          rgb[i * 3] = col?.getX(i) ?? 1;
          rgb[i * 3 + 1] = col?.getY(i) ?? 1;
          rgb[i * 3 + 2] = col?.getZ(i) ?? 1;
        }
        g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
        for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(key)) g.deleteAttribute(key);
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        list.push(g);
      });
      if (!list.length) throw new Error(`Аквапарк: пустая геометрия ${name}`);
      this.parts.set(name, mergeColored(list));
    }
  }

  part(name: typeof AQUA_MODEL_PARTS[number]): THREE.BufferGeometry {
    return this.parts.get(name)!.clone();
  }

  /** Модули плавают на общей воде: утолщается только низ, палуба и перила остаются на своих высотах. */
  floating(name: 'aqua_ferry' | 'aqua_sink' | 'aqua_lift', w: number, d: number, top: number): THREE.BufferGeometry {
    const size = name === 'aqua_sink' ? 1.8 : 2.4;
    const g = this.part(name).scale(w / size, 1, d / size);
    if (name !== 'aqua_lift') {
      const p = g.getAttribute('position');
      const k = Math.max(0.46, top - WATER_Y + 0.15) / 0.46;
      for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, p.getY(i) * k);
      g.computeVertexNormals();
    }
    return g;
  }

  mover(m: AquaMover): THREE.BufferGeometry {
    return this.floating(m.kind === 'ferry' ? 'aqua_ferry' : m.kind === 'sink' ? 'aqua_sink' : 'aqua_lift', m.x1 - m.x0, m.z1 - m.z0, m.top);
  }

  sweeper(sw: AquaSweeper): THREE.BufferGeometry {
    // Авторская труба 5.4 м; игровая длина и толщина точно соответствуют hit test.
    return this.part('aqua_sweeper').scale(sw.len / 2.7, (sw.y1 - sw.y0) / 0.38, sw.r / 0.19).translate(0, (sw.y0 + sw.y1) / 2, 0);
  }

  bag(): THREE.BufferGeometry {
    const g = this.part('aqua_pendulum_bag');
    const p = g.getAttribute('position');
    const len = AQUA_BAGS[0].len;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const newY = y < -1.55 ? -len + ((y + 2.1) / 1.1) * AQUA_BAG_H : y * (len - AQUA_BAG_H / 2) / 1.55;
      p.setXYZ(i, p.getX(i) * AQUA_BAG_R / 0.47, newY, p.getZ(i) * AQUA_BAG_R / 0.47);
    }
    g.computeVertexNormals();
    return g;
  }

  trampoline(p: AquaPiece): THREE.BufferGeometry {
    return this.part('aqua_trampoline').scale((p.x1 - p.x0) / 1.6, 1, (p.z1 - p.z0) / 1.8);
  }

  /** Пластика принятой горки с ровно тем же скатом, по которому идёт общая физика. */
  slide(piece: AquaPiece): THREE.BufferGeometry {
    const g = this.part('aqua_slide');
    const p = g.getAttribute('position');
    const profile = [[0, 4], [2, 3.8], [4, 2.8], [7, 1.3], [10.5, -0.1], [13.5, -0.35], [15, -0.4]];
    for (let i = 0; i < p.count; i++) {
      const z = Math.max(0, Math.min(15, p.getZ(i)));
      const k = Math.min(profile.length - 2, Math.max(0, profile.findIndex((q) => q[0] >= z) - 1));
      const a = profile[k]; const b = profile[k + 1];
      const old = a[1] + (b[1] - a[1]) * (z - a[0]) / (b[0] - a[0]);
      const top = piece.top + ((piece.low ?? piece.top) - piece.top) * z / 15;
      const y = p.getY(i);
      const yy = y < old - 0.55 ? WATER_Y - 0.2 + (top - WATER_Y + 0.2) * (y + 1) / (old + 1) : top + y - old - 0.1;
      p.setXYZ(i, p.getX(i) * (piece.x1 - piece.x0) / 3.1 + (piece.x0 + piece.x1) / 2, yy, piece.z0 + p.getZ(i) * (piece.z1 - piece.z0) / 15);
    }
    g.computeVertexNormals();
    return g;
  }
}

let kit: Promise<AquaKit> | undefined;
export function loadAquaKit(): Promise<AquaKit> {
  return kit ??= new GLTFLoader().loadAsync(MODEL_URL).then((gltf) => new AquaKit(gltf.scene));
}

/** Деревянная конструкция приподнятой опоры — видимые ноги и раскосы под светлой палубой. */
export function aquaSupports(out: THREE.BufferGeometry[], p: AquaPiece): void {
  const y0 = WATER_Y - 0.22;
  const y1 = p.top - 0.4;
  if (y1 - y0 < 1) return;
  const xa = p.x0 + 0.3; const xb = p.x1 - 0.3;
  const za = p.z0 + 0.3; const zb = p.z1 - 0.3;
  for (const x of [xa, xb]) for (const z of [za, zb]) out.push(place(paint(new THREE.CylinderGeometry(0.11, 0.15, y1 - y0, 10), WOOD), x, (y1 + y0) / 2, z));
  for (const z of [za, zb]) rod(out, [xa, y0 + 0.15, z], [xb, y1 - 0.1, z], 0.07, WOOD);
}

export function rod(out: THREE.BufferGeometry[], a: readonly number[], b: readonly number[], r: number, color: number): void {
  const start = new THREE.Vector3(a[0], a[1], a[2]); const end = new THREE.Vector3(b[0], b[1], b[2]);
  const axis = end.clone().sub(start);
  const g = paint(new THREE.CylinderGeometry(r, r, axis.length(), 8), color);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  out.push(g);
}

/** Округлая буйковая линия обозначает парк, не превращая воду в сухую площадку. */
export function aquaShore(out: THREE.BufferGeometry[]): void {
  const points: Array<[number, number]> = [[-30.8, 5.1], [-48, 2.2], [-66, 2.2], [-82, 4], [-95.8, 9], [-96, 28], [-95.8, 39.5], [-88, 44], [-73, 44], [-64, 40], [-56, 39.2], [-35, 39.5]];
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, WATER_Y + 0.075, z)));
  const samples = curve.getPoints(80);
  out.push(paint(new THREE.TubeGeometry(curve, 80, 0.022, 5, false), CREAM));
  for (let i = 0; i < samples.length; i += 2) {
    const v = samples[i];
    out.push(place(paint(new THREE.SphereGeometry(0.16, 8, 6), i % 4 ? CREAM : MINT), v.x, v.y + 0.035, v.z));
  }
  // Две небольшие группы камней у примыкания к набережной. Они ниже ног игрока,
  // за краем мостика; проход, рыбацкие причалы и открытая вода внутри подковы свободны.
  for (const [x, z, r] of [[-31.2, 5.1, 0.62], [-32.4, 5.4, 0.44], [-31.2, 12.1, 0.65], [-32.2, 12.8, 0.35]]) {
    const g = paint(new THREE.IcosahedronGeometry(r, 1), 0xcdbda2);
    g.scale(1.25, 0.72, 1).rotateY(x * 0.8);
    out.push(place(g, x, WATER_Y + 0.05, z));
  }
}
