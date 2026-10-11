// Простая видимость по существующим стенам: консервативные ошибки оставляют предмет в кадре.
import * as THREE from 'three';

type Wall = { id?: string; q?: string; pav?: string; min: readonly number[]; max: readonly number[] };
const BUILDINGS = new Set(['cafe', 'kursaal', 'billiards', 'skytower', 'paintball', 'fort', 'karting', 'dungeon_cliff', 'cabins', 'aeroclub', 'semyon']);
export function buildOccluders(boxes: readonly Wall[]): THREE.Box3[] {
  return boxes.filter((b) => b.pav && BUILDINGS.has(b.pav) && b.q !== 'edge' &&
    b.max[1] - b.min[1] >= 1.5 && Math.min(b.max[0] - b.min[0], b.max[2] - b.min[2]) >= .25)
    .map((b) => new THREE.Box3(new THREE.Vector3(b.min[0], b.min[1], b.min[2]), new THREE.Vector3(b.max[0], b.max[1], b.max[2])));
}
const ray = new THREE.Ray(), dir = new THREE.Vector3(), hit = new THREE.Vector3(), sample = new THREE.Vector3(), sphere = new THREE.Sphere();
export function openSight(cam: THREE.Vector3, center: THREE.Vector3, radius: number, walls: readonly THREE.Box3[]): boolean {
  sphere.set(center, radius + .3);
  for (const y of [0, .65, -.35]) {
    sample.copy(center); sample.y += y * radius;
    dir.copy(sample).sub(cam); const length = dir.length();
    if (length < .01) return true;
    ray.set(cam, dir.multiplyScalar(1 / length));
    let blocked = false;
    for (const wall of walls) {
      if (wall.intersectsSphere(sphere) || wall.containsPoint(cam)) continue;
      if (ray.intersectBox(wall, hit) && hit.distanceToSquared(cam) < (length - radius) ** 2) { blocked = true; break; }
    }
    if (!blocked) return true;
  }
  return false;
}
/** У целого предмета один порог: мелкая струя/лампа/рука не гаснет раньше корпуса. */
export function semanticDistance(o: THREE.Object3D): number {
  let distance = 0;
  for (let n: THREE.Object3D | null = o; n; n = n.parent) {
    const v = n.userData.p3visibility;
    if (typeof v === 'number' && Number.isFinite(v)) distance = Math.max(distance, v);
    if (/^(pier-fisherman|ferry-udalaya|mythic-greenland-shark|showcase-fish|plaza3-fountain-live_water)$/.test(n.name)) distance = Math.max(distance, 110);
  }
  return distance;
}

export interface FadeState { value: number; target: 0 | 1; from: number; elapsed: number; outsideAt: number | null }
export function makeFade(value = 1): FadeState { return { value, target: value > 0 ? 1 : 0, from: value, elapsed: 0, outsideAt: null }; }
export function targetFade(f: FadeState, target: 0 | 1): void {
  if (target === f.target) return;
  f.target = target; f.from = f.value; f.elapsed = 0;
}
export function decideFade(f: FadeState, distance: number, limit: number, now: number): void {
  if (distance > limit) {
    f.outsideAt ??= now;
    if (now - f.outsideAt >= .2) targetFade(f, 0);
  } else {
    f.outsideAt = null;
    if (distance < limit - 6) targetFade(f, 1);
  }
}
export function stepFade(f: FadeState, dt: number): number {
  f.elapsed += Math.max(0, dt);
  const k = Math.min(1, f.elapsed / (f.target ? .28 : .22));
  f.value = f.from + (f.target - f.from) * k * k * (3 - 2 * k);
  return f.value;
}

export const DITHER_FUNCTION = `
float p3Dither(vec2 xy) {
  vec2 p = mod(floor(xy), 4.0);
  float lo = mod(2.0 * mod(p.x, 2.0) + 3.0 * mod(p.y, 2.0), 4.0);
  float hi = mod(2.0 * floor(p.x / 2.0) + 3.0 * floor(p.y / 2.0), 4.0);
  return (4.0 * lo + hi + 0.5) / 16.0;
}`;
export interface FadingMaterial { material: THREE.Material; fade: { value: number } }
type Before = THREE.Material['onBeforeCompile'];
const originals = new WeakMap<THREE.Material, { before: Before; key: string }>();
export function prepareFadeMaterial(material: THREE.Material): void {
  if (originals.has(material)) return;
  const base = { before: material.onBeforeCompile, key: material.customProgramCacheKey() };
  originals.set(material, base);
  installFade(material, { value: 1 }, base);
}
function installFade(material: THREE.Material, fade: { value: number }, base: { before: Before; key: string }): void {
  material.onBeforeCompile = (sh, renderer) => {
    base.before.call(material, sh, renderer);
    sh.uniforms.p3Fade = fade;
    sh.fragmentShader = `uniform float p3Fade;\n${DITHER_FUNCTION}\n` + sh.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/, 'void main() {\n if (p3Fade < p3Dither(gl_FragCoord.xy)) discard;');
  };
  material.customProgramCacheKey = () => base.key + '|p3fade1';
  material.needsUpdate = true;
}
/** Clone сохраняет общий program key, а uniform каждого предмета независим от соседей. */
export function fadingMaterial(source: THREE.Material): FadingMaterial {
  const material = source.clone();
  const fade = { value: 1 };
  installFade(material, fade, originals.get(source) ?? { before: source.onBeforeCompile, key: source.customProgramCacheKey() });
  return { material, fade };
}
