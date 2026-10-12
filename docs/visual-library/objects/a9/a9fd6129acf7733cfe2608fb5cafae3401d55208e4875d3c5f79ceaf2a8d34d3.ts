// Снайперская AWP: одна модель на всех — в руках желейки (вместо маркера) и на верху креста «Причала».
// Оси как у маркера (avatar.ts): ствол смотрит в −Z, приклад сзади (+Z), прицел сверху, начало — у рукояти,
// так что варежки маркера ложатся на рукоять и цевьё. Длина ≈ 1,35 м — силуэт видно издалека.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Дуло в осях модели — отсюда летит трассер */
export const AWP_MUZZLE = new THREE.Vector3(0, 0.015, -1.03);

const GREEN = 0x6b7d3f;
const GREEN_DARK = 0x56652f;
const BLACK = 0x1d1f22;
const STEEL = 0x3a3f45;

interface AwpShared {
  body: THREE.BufferGeometry;
  lens: THREE.BufferGeometry;
  bodyMat: THREE.MeshStandardMaterial;
  lensMat: THREE.MeshBasicMaterial;
}

let shared: AwpShared | null = null;

function colored(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = ng.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  ng.deleteAttribute('uv');
  return ng;
}

/** Цилиндр вдоль Z: от z0 до z1 (z0 < z1), радиусы у z0 и z1. */
function tube(r0: number, r1: number, z0: number, z1: number, y: number, seg = 12): THREE.BufferGeometry {
  // CylinderGeometry: radiusTop — у +Y; после rotateX(−π/2) +Y смотрит в −Z, то есть верх — у z0
  return new THREE.CylinderGeometry(r0, r1, z1 - z0, seg).rotateX(-Math.PI / 2).translate(0, y, (z0 + z1) / 2);
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

function build(): AwpShared {
  const parts = [
    // приклад с «дыркой для большого пальца»: верхняя планка, низ, перемычка у рукояти, затыльник
    colored(box(0.062, 0.045, 0.27, 0, 0.038, 0.17), GREEN),
    colored(box(0.062, 0.055, 0.24, 0, -0.078, 0.19), GREEN),
    colored(box(0.064, 0.17, 0.08, 0, -0.02, 0.03), GREEN),
    colored(box(0.068, 0.18, 0.035, 0, -0.022, 0.32), BLACK),
    // рукоять под правую варежку, спуск и скоба
    colored(new THREE.BoxGeometry(0.05, 0.13, 0.055).rotateX(-0.32).translate(0, -0.13, -0.09), GREEN_DARK),
    colored(box(0.012, 0.03, 0.06, 0, -0.065, -0.06), BLACK),
    // ствольная коробка, магазин, цевьё под левую варежку
    colored(box(0.07, 0.09, 0.32, 0, 0, -0.17), GREEN),
    colored(box(0.05, 0.085, 0.07, 0, -0.08, -0.22), BLACK),
    colored(box(0.076, 0.075, 0.27, 0, -0.004, -0.46), GREEN),
    // рукоять затвора — шариком вбок
    colored(new THREE.CylinderGeometry(0.008, 0.008, 0.055, 8).rotateZ(Math.PI / 2).translate(0.0625, 0.03, -0.03), BLACK),
    colored(new THREE.SphereGeometry(0.017, 10, 8).translate(0.095, 0.03, -0.03), BLACK),
    // ствол и дульный тормоз
    colored(tube(0.016, 0.019, -0.97, -0.58, 0.015), STEEL),
    colored(tube(0.026, 0.026, -1.03, -0.96, 0.015), BLACK),
    colored(box(0.056, 0.012, 0.04, 0, 0.015, -0.995), BLACK),
    // прицел: кольца, труба, объектив, окуляр, барабанчик сверху
    colored(box(0.03, 0.05, 0.03, 0, 0.065, -0.24), BLACK),
    colored(box(0.03, 0.05, 0.03, 0, 0.065, -0.05), BLACK),
    colored(tube(0.026, 0.026, -0.28, 0.05, 0.11), BLACK),
    colored(tube(0.042, 0.03, -0.38, -0.28, 0.11), BLACK),
    colored(tube(0.03, 0.034, 0.05, 0.11, 0.11), BLACK),
    colored(new THREE.CylinderGeometry(0.016, 0.016, 0.035, 10).translate(0, 0.148, -0.12), BLACK),
    colored(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 10).rotateZ(Math.PI / 2).translate(0.04, 0.11, -0.12), BLACK),
  ];
  const body = mergeGeometries(parts, false)!;
  // линза объектива — блик, видно издалека, у кого в руках AWP
  const lens = new THREE.CircleGeometry(0.036, 18).rotateY(Math.PI).translate(0, 0.11, -0.382);
  return {
    body,
    lens,
    bodyMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.28 }),
    lensMat: new THREE.MeshBasicMaterial({ color: 0x9fe6ff }),
  };
}

/** Новая AWP (геометрия и материалы общие — dispose не нужен). */
export function makeAwp(): THREE.Group {
  shared ??= build();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(shared.body, shared.bodyMat), new THREE.Mesh(shared.lens, shared.lensMat));
  return g;
}
