// Башни крепости — общий набор: палитра игрушечного замка, один материал на все детали (цвет — в вершинах, «металл» и
// «свечение» — во втором атрибуте вершины, отражения латуни и меди — от своего светлого неба), помощники геометрии и
// пулы инстансов. Геометрия строится без document (её проверяют тесты в node); текстуры — только в браузере.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Палитра: тёплое дерево, крашеные доски, латунь, медь, золото, светлый камень, ткань флажков */
export const C = {
  wood: 0xc98a4b,
  woodLight: 0xe4ae6a,
  woodDark: 0x8d5833,
  woodDeep: 0x5f3b22,
  red: 0xd9483b,
  redDark: 0xa83328,
  blue: 0x3f7fc4,
  blueDark: 0x2d5f99,
  royal: 0x6a3fa8,
  green: 0x4f9a52,
  cream: 0xfff1d8,
  yellow: 0xf2c230,
  brass: 0xe6b450,
  copper: 0xd9814c,
  bronze: 0xc98a4e,
  gold: 0xffcc45,
  silver: 0xe2e6ec,
  iron: 0x666d78,
  ironDark: 0x3f444c,
  stone: 0xe0d5bd,
  stoneDark: 0xbfb193,
  stoneLight: 0xf1e8d4,
  rope: 0xdcc391,
  leather: 0x9b5b34,
  sack: 0xd6bd8f,
  tar: 0x1b130d,
  coal: 0x2e2522,
  ember: 0xff7a2a,
  white: 0xfaf5ea,
  black: 0x1d1a1c,
  pink: 0xf0a0a0,
} as const;

/** Насколько деталь «металл» (0…1) и светится (0…1): второй атрибут вершины aMat */
export const METAL = 0.92;
export const IRONISH = 0.55;

/** Красит геометрию: цвет вершин и материал (металл, свечение); без uv; неиндексированная — чтобы склеивать всё */
export function tint(g: THREE.BufferGeometry, hex: number, metal = 0, glow = 0): THREE.BufferGeometry {
  const s = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(s.attributes)) if (name !== 'position' && name !== 'normal') s.deleteAttribute(name);
  if (!s.getAttribute('normal')) s.computeVertexNormals();
  const n = s.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const mat = new Float32Array(n * 2);
  const c = new THREE.Color(hex);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    mat[i * 2] = metal;
    mat[i * 2 + 1] = glow;
  }
  s.setAttribute('color', new THREE.BufferAttribute(col, 3));
  s.setAttribute('aMat', new THREE.BufferAttribute(mat, 2));
  s.clearGroups();
  return s;
}

/** Склеить окрашенные части в одну геометрию */
export function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list, false);
  if (!g) throw new Error('turrets: merge failed');
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------ примитивы (единицы — метры)

/** Скруглённый брусок; тоньше 4,5 см скругления не видно — там простой (12 треугольников вместо 108) */
export const rbox = (w: number, h: number, d: number, r = 0.025, seg = 1): THREE.BufferGeometry =>
  Math.min(w, h, d) < 0.045 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
export const box = (w: number, h: number, d: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt: number, rb: number, h: number, seg = 12, open = false): THREE.BufferGeometry =>
  new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
export const sphere = (r: number, ws = 12, hs = 9): THREE.BufferGeometry => new THREE.SphereGeometry(r, ws, hs);
export const torus = (R: number, r: number, rs = 6, ts = 18, arc = Math.PI * 2): THREE.BufferGeometry => new THREE.TorusGeometry(R, r, rs, ts, arc);
export const cone = (r: number, h: number, seg = 8): THREE.BufferGeometry => new THREE.ConeGeometry(r, h, seg);
export const ico = (r: number, detail = 0): THREE.BufferGeometry => new THREE.IcosahedronGeometry(r, detail);

/** Скруглённый брус от точки a до точки b (сечение w × d) */
export function beam(a: readonly [number, number, number], b: readonly [number, number, number], w: number, d = w, r = 0.02): THREE.BufferGeometry {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = dir.length();
  const g = rbox(w, len, d, r);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  return g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

/** Тело вращения по профилю [радиус, высота] снизу вверх */
export function lathe(pts: ReadonlyArray<readonly [number, number]>, seg = 16): THREE.BufferGeometry {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), seg);
}

/** Трубка по точкам (сглаженная кривая) */
export function tube(pts: ReadonlyArray<readonly [number, number, number]>, r: number, ts = 12, rs = 6): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return new THREE.TubeGeometry(curve, ts, r, rs, false);
}

/** Пятиконечная звезда лицом к +Z (толщина depth), центр в нуле */
export function star(ro: number, ri: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 ? ri : ro;
    if (k === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.4, bevelSize: ro * 0.08, bevelSegments: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Геральдический щит (плоский верх, острый низ) лицом к +Z */
export function shield(w: number, h: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, h / 2);
  s.lineTo(w / 2, h / 2);
  s.lineTo(w / 2, 0);
  s.quadraticCurveTo(w / 2, -h * 0.32, 0, -h / 2);
  s.quadraticCurveTo(-w / 2, -h * 0.32, -w / 2, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Корона: обод с зубцами и шариками (золото) — вершина флагштока на 10-м уровне */
export function crown(r: number, color: number = C.gold): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [tint(cyl(r, r * 0.92, r * 0.55, 12, false), color, METAL)];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    parts.push(tint(cone(r * 0.32, r * 0.75, 5).translate(Math.cos(a) * r * 0.82, r * 0.62, Math.sin(a) * r * 0.82), color, METAL));
    parts.push(tint(sphere(r * 0.16, 6, 5).translate(Math.cos(a) * r * 0.82, r * 1.02, Math.sin(a) * r * 0.82), C.red, 0.2, 0.15));
  }
  return merge(parts);
}

// ------------------------------------------------------------ материал

/** Свет окружения для латуни и меди: светлое небо, тёплый горизонт, тёплая земля (без синевы — латунь не зеленеет) */
export function dayEnvTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#dfeaf3');
  g.addColorStop(0.36, '#f3f4ef');
  g.addColorStop(0.49, '#fff6e2');
  g.addColorStop(0.53, '#c9b48a');
  g.addColorStop(0.7, '#8f8158');
  g.addColorStop(1, '#5f5640');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  // облака и солнечное пятно — блики бегут по граням
  for (const [x, y, r, a] of [[52, 30, 26, 0.9], [150, 22, 34, 0.7], [210, 44, 20, 0.6], [96, 50, 16, 0.5]] as const) {
    const s = ctx.createRadialGradient(x, y, 0, x, y, r);
    s.addColorStop(0, `rgba(255,255,250,${a})`);
    s.addColorStop(1, 'rgba(255,255,250,0)');
    ctx.fillStyle = s;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

/** Окружение: свет неба в тени не добавляем (сцену и так светит небо-полусфера), отражения — по «металличности» */
const LIGHTS_MAPS = THREE.ShaderChunk.lights_fragment_maps
  .replace('iblIrradiance += getIBLIrradiance( geometryNormal );', '')
  .replace('radiance += iblRadiance;', 'radiance += iblRadiance * mix( 0.45, 1.0, vMat.x );');

/**
 * Один материал на все детали башен: цвет — из вершин (и инстанса: вспышка улучшения — цвет > 1), металл и свечение —
 * из aMat. Тени не отбрасывают (карта теней статична — повёрнутая башня оставляла бы старую тень): пятно-тень своё.
 */
export function turretMaterial(env: THREE.Texture | null): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0, envMap: env, envMapIntensity: 1.05 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aMat;\nvarying vec2 vMat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMat;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.3, vMat.x );')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vMat.x;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vMat.y * 1.6;')
      .replace('#include <lights_fragment_maps>', LIGHTS_MAPS);
  };
  m.customProgramCacheKey = () => 'fort-turret-v1';
  return m;
}

// ------------------------------------------------------------ инстансы

/** Деталь: геометрия и её InstancedMesh (создаётся при первом показе); n — сколько записано в этом кадре */
export class Part {
  mesh: THREE.InstancedMesh | null = null;
  n = 0;
  readonly geo: THREE.BufferGeometry;
  readonly cap: number;
  constructor(geo: THREE.BufferGeometry, cap: number) {
    this.geo = geo;
    this.cap = cap;
  }
}

/** Все детали всех башен: кадр — begin(), put(...) по деталям, end() */
export class PartPool {
  private readonly scene: THREE.Scene;
  private readonly mat: THREE.Material;
  private readonly live: Part[] = [];

  constructor(scene: THREE.Scene, mat: THREE.Material) {
    this.scene = scene;
    this.mat = mat;
  }

  begin(): void {
    for (const p of this.live) p.n = 0;
  }

  put(p: Part, m: THREE.Matrix4, c: THREE.Color): void {
    let mesh = p.mesh;
    if (!mesh) {
      mesh = new THREE.InstancedMesh(p.geo, this.mat, p.cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, c);
      mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.visible = false;
      p.mesh = mesh;
      this.live.push(p);
      this.scene.add(mesh);
    }
    if (p.n >= p.cap) return;
    mesh.setMatrixAt(p.n, m);
    mesh.setColorAt(p.n, c);
    p.n++;
  }

  end(): void {
    for (const p of this.live) {
      const mesh = p.mesh!;
      mesh.count = p.n;
      mesh.visible = p.n > 0;
      if (p.n > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor!.needsUpdate = true;
      }
    }
  }

  /** Сколько вызовов отрисовки сейчас (видимых деталей) */
  get draws(): number {
    let n = 0;
    for (const p of this.live) if (p.n > 0) n++;
    return n;
  }

  dispose(): void {
    for (const p of this.live) {
      if (!p.mesh) continue;
      this.scene.remove(p.mesh);
      p.mesh.dispose();
      p.mesh = null;
    }
    this.live.length = 0;
  }
}
