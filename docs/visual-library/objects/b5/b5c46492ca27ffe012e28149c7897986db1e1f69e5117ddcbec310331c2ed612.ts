// Reuse the accepted plaza3 bitmap materials, keeping the island's muted vertex-colour palette.
// UVs repeat in metres; the far silhouette is explicitly excluded.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bindGroundTexture, TEX, type TexId } from '../plaza3/ground.ts';
import { plankTexture } from '../../render/textures.ts';
import { isleProjectedUv, isleProjectionAxis } from './surfaceuv.ts';

type SurfaceId = 'lawn' | 'sand' | 'gravel' | 'quay' | 'wood';
const materials = new Map<string, THREE.MeshStandardMaterial>();
const averages = { lawn: new THREE.Color(TEX.lawn.avg), sand: new THREE.Color(TEX.sand.avg), gravel: new THREE.Color(TEX.gravel.avg), quay: new THREE.Color(TEX.quay.avg), wood: new THREE.Color(1, 1, 1) };
const _p = new THREE.Vector3(), _n = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
let woodMap: THREE.Texture | null = null;

function stairWoodMap(): THREE.Texture {
  if (woodMap) return woodMap;
  if (typeof document === 'undefined') {
    // The same white placeholder pattern as plaza3/ground, for source-only geometry tests.
    woodMap = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    woodMap.wrapS = woodMap.wrapT = THREE.RepeatWrapping; woodMap.needsUpdate = true;
    return woodMap;
  }
  woodMap = plankTexture();
  // Preserve the GLB's muted timber tint. Sample the existing bitmap once during loading, not in frames.
  const image = woodMap.image as HTMLCanvasElement;
  const pixels = image.getContext('2d')!.getImageData(0, 0, image.width, image.height).data;
  const sample = new THREE.Color(), avg = averages.wood; avg.setRGB(0, 0, 0);
  let count = 0;
  for (let y = 4; y < image.height; y += 8) for (let x = 4; x < image.width; x += 8) {
    const i = (y * image.width + x) * 4;
    avg.add(sample.setRGB(pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255, THREE.SRGBColorSpace)); count++;
  }
  avg.multiplyScalar(1 / count);
  return woodMap;
}

function material(src: THREE.MeshStandardMaterial, id: SurfaceId, stone: boolean): THREE.MeshStandardMaterial {
  const key = id === 'wood' ? 'wood_stairs' : `${stone ? 'stone' : 'ground'}_${id}`;
  let m = materials.get(key);
  if (!m) {
    m = src.clone(); m.name = `isle_${key}`; m.vertexColors = true; m.roughness = Math.max(0.88, src.roughness);
    if (id === 'wood') m.map = stairWoodMap(); else bindGroundTexture(id as TexId, m);
    materials.set(key, m);
  }
  return m;
}

interface Bucket { id: SurfaceId; p: number[]; n: number[]; c: number[]; uv: number[] }

/** Runs before the island's existing merge-by-material pass. Does not add lights or independent scene updates. */
export function dressIsleSurfaces(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const sources: THREE.Mesh[] = [], spots: THREE.Object3D[] = [];
  let markerMaterial: THREE.Material | null = null;
  root.traverse((o) => {
    if (/^fish_[0-7]$/.test(o.name)) spots.push(o);
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    if (m.material.name === 'fi_metal') markerMaterial ??= m.material;
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.name === 'hidden_with_full_island' || /silhouette/.test(p.name)) return;
    if (m.material instanceof THREE.MeshStandardMaterial && (/^(fi_ground|fi_stone)$/.test(m.material.name)
      || (m.material.name === 'fi_wood' && (/^(walk_lighthouse_stairs|lighthouse_rails_v2|lighthouse_structure_v3|walk_jetty_underlay|walk_pontoon_underlay|walk_landing_underlay|walk_landing_transition)$/.test(m.name)
        || (m.name === 'pier_1' && m.parent?.name === 'pier'))))) sources.push(m);
  });
  for (const mesh of sources) {
    const src = mesh.material as THREE.MeshStandardMaterial, stone = src.name === 'fi_stone', wood = src.name === 'fi_wood';
    if (wood) stairWoodMap();
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), col = g.getAttribute('color');
    if (!pos || !nor || !col || !mesh.parent) continue;
    const buckets = new Map<SurfaceId, Bucket>(), nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i < pos.count; i += 3) {
      _p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); _n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      _a.copy(_p); _b.fromBufferAttribute(pos, i + 1).applyMatrix4(mesh.matrixWorld).sub(_a);
      _c.fromBufferAttribute(pos, i + 2).applyMatrix4(mesh.matrixWorld).sub(_a); _b.cross(_c);
      const axis = isleProjectionAxis(_b.x, _b.y, _b.z);
      const r = col.getX(i), green = col.getY(i), blue = col.getZ(i);
      const id: SurfaceId = wood ? 'wood' : stone ? (/rocks/.test(mesh.name) ? 'gravel' : 'quay') :
        green >= r * 0.95 && green > blue * 1.15 && _n.y > 0.65 ? 'lawn' :
        _p.y < 2.5 && _n.y > 0.65 && r > green * 1.08 ? 'sand' : 'gravel';
      const b = buckets.get(id) ?? { id, p: [], n: [], c: [], uv: [] }; buckets.set(id, b);
      const avg = averages[id];
      for (let k = i; k < i + 3; k++) {
        b.p.push(pos.getX(k), pos.getY(k), pos.getZ(k)); b.n.push(nor.getX(k), nor.getY(k), nor.getZ(k));
        b.c.push(col.getX(k) / avg.r, col.getY(k) / avg.g, col.getZ(k) / avg.b);
        _p.fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld);
        b.uv.push(...isleProjectedUv(_p.x, _p.y, _p.z, axis, id === 'wood' ? 2 : TEX[id].tile));
      }
    }
    for (const b of buckets.values()) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      const out = new THREE.Mesh(geo, material(src, b.id, stone)); out.name = `${mesh.name}_surface_${b.id}`;
      out.position.copy(mesh.position); out.quaternion.copy(mesh.quaternion); out.scale.copy(mesh.scale); out.updateMatrix();
      mesh.parent.add(out);
    }
    mesh.removeFromParent();
  }
  // These are the existing anchors, not eight new interactables. Brass corners stay 18mm above the paving.
  if (spots.length && markerMaterial && !root.getObjectByName('mole_fishing_stations_v2')) {
    const parts: THREE.BufferGeometry[] = [], brass = new THREE.Color(0xb4a17a);
    for (const spot of spots) {
      const station: THREE.BufferGeometry[] = [];
      for (const side of [-1, 1]) for (const x of [-0.75, 0.75]) {
        station.push(new THREE.BoxGeometry(0.15, 0.012, 0.035).translate(x, 0.024, side * 0.4));
        station.push(new THREE.BoxGeometry(0.035, 0.012, 0.15).translate(x, 0.024, side * 0.34));
      }
      const geo = mergeGeometries(station, false)!;
      const color = new Float32Array(geo.getAttribute('position').count * 3);
      for (let i = 0; i < color.length; i += 3) { color[i] = brass.r; color[i + 1] = brass.g; color[i + 2] = brass.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(color, 3)); geo.applyMatrix4(spot.matrixWorld); parts.push(geo);
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts, false)!, markerMaterial);
    mesh.name = 'mole_fishing_stations_v2'; mesh.userData.spots = spots.length; mesh.matrixAutoUpdate = false; root.add(mesh);
  }
}
