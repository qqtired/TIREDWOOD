// «Крепость 50», вид участков стены (С-1, оформление пролома С-2а): трещины → обрушенные зубцы → пролом до земли с
// рваными краями и горкой камней снаружи → леса и растущая свежая кладка при ремонте → светлая заплатка до конца
// забега. Стену замка (castle/masonry.ts — одна склеенная кладка) не перестраиваем: в её материалы добавлена «дыра» —
// фрагменты внутри открытого участка отбрасываются (и в тени тоже), на её месте рисуется своё. Камни со стены (К-1):
// штабели по три валуна на ходу по стене, падение, удар. Только вид: прочность, стадии и камни — с сервера.
import * as THREE from 'three';
import {
  STONE_FALL_TICKS, STONE_OUT, STONES_PER_STACK, WALL_SECTIONS, WS_BREACH, WS_CRACK, WS_OK, WS_RUIN, type F50State,
  wallStage,
} from '../../../shared/fort50.ts';
import { TICK_RATE } from '../../../shared/constants.ts';
import { PARAPET_H, PARAPET_T, WALL_H, buildFort } from '../../../shared/fortmap.ts';
import { makeRng } from '../../../shared/math.ts';
import { softDot } from '../../render/textures.ts';
import type { CastleDecor } from '../castle.ts';
import { PEBBLE } from '../castle/fx.ts';
import { Bucket } from '../castle/geo.ts';
import { BARTIZANS } from '../castle/layout.ts';
import { crackTexture, masonryTexture, plankTexture, trimTexture } from '../castle/textures.ts';

const N = WALL_SECTIONS.length;
/** Наружу дыра шире грани на столько: карниз, цоколь, плющ, знамёна выступают на сантиметры; внутрь — чуть-чуть */
const OUT_PAD = 0.16;
const IN_PAD = 0.03;
/** Край дыры чуть за границей участка: грань, лежащая ровно на краю, не мерцает (отброшена наверняка) */
const EDGE = 0.004;
/** Пролом — до земли, но не ниже: земля и брусчатка под стеной целы */
const Y_GROUND = 0.025;
/** Эркеры на углах бастионов не рушатся вместе с бруствером: квадрат вокруг каждого (±KEEP_R) — нетронут */
const KEEP: ReadonlyArray<readonly [number, number]> = BARTIZANS.map((b) => [b.x, b.z] as const);
const KEEP_R = 1.15;

type Rect = [number, number, number, number];

/** Прямоугольник [x0, x1, z0, z1] без квадратов эркеров: до четырёх полос вокруг каждого */
function minusKeep(r: Rect): Rect[] {
  let out: Rect[] = [r];
  for (const [kx, kz] of KEEP) {
    const k: Rect = [kx - KEEP_R, kx + KEEP_R, kz - KEEP_R, kz + KEEP_R];
    const next: Rect[] = [];
    for (const a of out) {
      if (a[1] <= k[0] || a[0] >= k[1] || a[3] <= k[2] || a[2] >= k[3]) { next.push(a); continue; }
      if (a[0] < k[0]) next.push([a[0], k[0], a[2], a[3]]);
      if (a[1] > k[1]) next.push([k[1], a[1], a[2], a[3]]);
      const x0 = Math.max(a[0], k[0]);
      const x1 = Math.min(a[1], k[1]);
      if (a[2] < k[2]) next.push([x0, x1, a[2], k[2]]);
      if (a[3] > k[3]) next.push([x0, x1, k[3], a[3]]);
    }
    out = next.filter((q) => q[1] - q[0] > 1e-3 && q[3] - q[2] > 1e-3);
  }
  return out;
}

/** Прямоугольник дыры [x0, x1, z0, z1]: наружу — с запасом, вдоль стены и внутрь — почти ровно по краю */
function clipRect(sec: number): [number, number, number, number] {
  const s = WALL_SECTIONS[sec];
  let [x0, x1, z0, z1] = s.hole;
  x0 -= EDGE;
  x1 += EDGE;
  z0 -= EDGE;
  z1 += EDGE;
  if (s.kind === 'passage') {
    if (s.nx < 0) [x0, x1] = [x0 - OUT_PAD, x1 + IN_PAD];
    else if (s.nx > 0) [x0, x1] = [x0 - IN_PAD, x1 + OUT_PAD];
    if (s.nz < 0) [z0, z1] = [z0 - OUT_PAD, z1 + IN_PAD];
    else if (s.nz > 0) [z0, z1] = [z0 - IN_PAD, z1 + OUT_PAD];
  } else {
    if (s.side < 0) x0 -= OUT_PAD;
    else if (s.side > 0) x1 += OUT_PAD;
    if (s.nz < 0) z0 -= OUT_PAD;
    else if (s.nz > 0) z1 += OUT_PAD;
  }
  return [x0, x1, z0, z1];
}

const C = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
const WALL = C(1, 0.98, 0.94);
const CORE = C(0.86, 0.8, 0.7);
/** заплатка — светлее старой кладки (С-2а) */
const FRESH = C(1.24, 1.2, 1.1);
const FRESH_TRIM = C(1.2, 1.17, 1.1);
const WOOD = C(0.86, 0.64, 0.42);
const WOOD_DK = C(0.7, 0.5, 0.32);
const ROCK = new THREE.Color(0xc8b896);
const DUST = new THREE.Color(0xd8c4a2);

/** Участок в осях «вдоль стены / поперёк» → мир */
interface Frame {
  /** вдоль какой оси идёт стена */
  along: 'x' | 'z';
  /** дыра вдоль стены и тело стены поперёк */
  lo: number;
  hi: number;
  c0: number;
  c1: number;
  /** наружу: знак по оси «поперёк» и координата наружной грани */
  out: number;
  face: number;
}

function frameOf(sec: number): Frame {
  const s = WALL_SECTIONS[sec];
  const [x0, x1, z0, z1] = s.hole;
  return s.nx !== 0
    ? { along: 'z', lo: z0, hi: z1, c0: x0, c1: x1, out: s.nx, face: s.face }
    : { along: 'x', lo: x0, hi: x1, c0: z0, c1: z1, out: s.nz, face: s.face };
}

/** Точка в осях участка: a — вдоль, c — поперёк */
function P(f: Frame, a: number, y: number, c: number): THREE.Vector3 {
  return f.along === 'x' ? new THREE.Vector3(a, y, c) : new THREE.Vector3(c, y, a);
}

/** Коробка в осях участка */
function boxA(b: Bucket, f: Frame, a0: number, a1: number, y0: number, y1: number, c0: number, c1: number, color: THREE.Color, ao = 0.7, mask = -1): void {
  const [aa, ab] = a0 < a1 ? [a0, a1] : [a1, a0];
  const [ca, cb] = c0 < c1 ? [c0, c1] : [c1, c0];
  if (f.along === 'x') b.box(aa, y0, ca, ab, y1, cb, { color, ao, su: 4, sv: 4 }, mask);
  else b.box(ca, y0, aa, cb, y1, ab, { color, ao, su: 4, sv: 4 }, mask);
}

/** Повёрнутый камень (обломок) — готовая фигура */
function rock(b: Bucket, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx: number, ry: number, rz: number, color: THREE.Color): void {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
  b.geo(g, color, [0.35, 0.35], [x * 0.37, z * 0.29]);
}

/** Какая это часть стены: тело (кирпич от земли), бруствер, зубцы — или не стена */
function levelOf(b: { mat: string; min: readonly number[]; max: readonly number[] }): 'wall' | 'parapet' | 'top' | null {
  if (b.mat === 'brick' && b.min[1] < 0.01 && Math.abs(b.max[1] - WALL_H) < 0.01) return 'wall';
  if (b.mat !== 'concrete') return null;
  if (Math.abs(b.min[1] - WALL_H) < 0.01) return 'parapet';
  if (Math.abs(b.min[1] - WALL_H - PARAPET_H) < 0.01) return 'top';
  return null;
}

/** Дыра в материалах кладки замка: участки стены, фрагменты внутри которых не рисуются (и не бросают тень) */
class Clip {
  readonly hole = Array.from({ length: N }, () => new THREE.Vector4(1, 0, 0, 0));
  private readonly uniforms = { uF50Hole: { value: this.hole }, uF50Y: { value: new Array<number>(N).fill(99) } };

  /** Участок: дыра от высоты ymin до верха (99 — дыры нет) */
  set(sec: number, ymin: number): void {
    if (ymin >= 99) this.hole[sec].set(1, 0, 0, 0);
    else this.hole[sec].set(...clipRect(sec));
    this.uniforms.uF50Y.value[sec] = ymin;
  }

  patch(mat: THREE.Material): void {
    const prev = mat.onBeforeCompile;
    // ключ программы — прежний (у флагов свой ветер) плюс наша дыра
    const key = mat.customProgramCacheKey() + '|f50';
    const keep = KEEP.map(([x, z]) => `vec2(${x.toFixed(2)}, ${z.toFixed(2)})`).join(', ');
    mat.onBeforeCompile = (shader, r) => {
      prev.call(mat, shader, r);
      shader.uniforms.uF50Hole = this.uniforms.uF50Hole;
      shader.uniforms.uF50Y = this.uniforms.uF50Y;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vF50W;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vF50W = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vF50W;
uniform vec4 uF50Hole[${N}];
uniform float uF50Y[${N}];
const vec2 F50_KEEP[${KEEP.length}] = vec2[${KEEP.length}](${keep});`)
        .replace('#include <clipping_planes_fragment>', `{
    bool f50Cut = false;
    for (int i = 0; i < ${N}; i++) {
      vec4 h = uF50Hole[i];
      if (h.x < h.y && vF50W.x > h.x && vF50W.x < h.y && vF50W.z > h.z && vF50W.z < h.w && vF50W.y > uF50Y[i]) f50Cut = true;
    }
    if (f50Cut) {
      for (int k = 0; k < ${KEEP.length}; k++) if (all(lessThan(abs(vF50W.xz - F50_KEEP[k]), vec2(${KEEP_R.toFixed(2)})))) f50Cut = false;
      if (f50Cut) discard;
    }
  }
  #include <clipping_planes_fragment>`);
    };
    mat.customProgramCacheKey = () => key;
    mat.needsUpdate = true;
  }
}

interface SecView {
  sec: number;
  f: Frame;
  /** что видно сейчас */
  stage: number;
  /** был пролом и его заделали — светлая кладка до конца забега */
  patched: boolean;
  /** ремонт: доля 0…1, −1 — нет */
  fix: number;
  breach: THREE.Group;
  patch: THREE.Group;
  rise: THREE.Group;
  scaffold: THREE.Group;
  cracks: THREE.Mesh;
  ruin: THREE.Mesh;
  /** зубцы заплатки — рушатся отдельно (обвал зубцов на заплатке) */
  patchTop: THREE.Mesh | null;
  /** торцы срезанной кладки по краю дыры: тело и бруствер (пролом), зубцы (обвал зубцов и пролом) */
  capLow: THREE.Mesh | null;
  capTop: THREE.Mesh | null;
}

interface Falling { sec: number; i: number; t0: number; t1: number; from: THREE.Vector3; to: THREE.Vector3; spin: THREE.Vector3; landed: boolean; until: number }

export class WallsView {
  readonly root = new THREE.Group();
  private readonly clip = new Clip();
  private readonly views: SecView[] = [];
  private readonly castle: CastleDecor;
  private readonly stoneMat: THREE.MeshStandardMaterial;
  private readonly trimMat: THREE.MeshStandardMaterial;
  private readonly woodMat: THREE.MeshStandardMaterial;
  private readonly crackMat: THREE.MeshStandardMaterial;
  private readonly moundMat: THREE.MeshStandardMaterial;
  private readonly stacks: THREE.InstancedMesh;
  private readonly flying: THREE.InstancedMesh;
  private readonly falls: Falling[] = [];
  private stones = WALL_SECTIONS.map(() => STONES_PER_STACK);
  private now = 0;
  /** Звук и тряска — у хозяина (match): удар по стене, пролом, камень упал, стук молотка */
  onSound?: (kind: 'hit' | 'breach' | 'stone' | 'fixed' | 'hammer', x: number, y: number, z: number) => void;

  constructor(scene: THREE.Scene, castle: CastleDecor) {
    this.castle = castle;
    // дыра — в материалах склеенной кладки (стена, тёсаный камень, щели, плющ, перемычка) и их тенях
    const fxParts = new Set<THREE.Object3D>([castle.fx.fire.mesh, castle.fx.dust.mesh, castle.fx.chunks]);
    // один материал бывает у нескольких мешей (кладка и перемычка) — дыру в него добавляем один раз
    const done = new Set<THREE.Material>();
    for (const o of castle.root.children) {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (o as THREE.InstancedMesh).isInstancedMesh || fxParts.has(o)) continue;
      const mat = m.material as THREE.Material;
      if (!(mat instanceof THREE.MeshStandardMaterial) && !(mat instanceof THREE.MeshBasicMaterial)) continue;
      if (!done.has(mat)) {
        done.add(mat);
        this.clip.patch(mat);
      }
      if (m.castShadow) {
        const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
        this.clip.patch(depth);
        m.customDepthMaterial = depth;
      }
    }

    this.stoneMat = new THREE.MeshStandardMaterial({ map: masonryTexture(), vertexColors: true, roughness: 0.92 });
    this.trimMat = new THREE.MeshStandardMaterial({ map: trimTexture(), vertexColors: true, roughness: 0.86 });
    this.woodMat = new THREE.MeshStandardMaterial({ map: plankTexture(), vertexColors: true, roughness: 0.82 });
    this.crackMat = new THREE.MeshStandardMaterial({
      map: crackTexture(), color: 0x7a6a58, alphaTest: 0.45, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    this.moundMat = new THREE.MeshStandardMaterial({
      map: softDot('rgba(196,170,128,0.95)', 'rgba(196,170,128,0)'), transparent: true, depthWrite: false, roughness: 1,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -3,
    });

    const plain = buildFort();
    for (let sec = 0; sec < N; sec++) this.views.push(this.buildSection(sec, plain));

    // штабели камней: по три валуна (два внизу, один сверху) на каждом участке — один меш на все
    const rockGeo = new THREE.DodecahedronGeometry(0.26, 0);
    rockGeo.scale(1, 0.82, 1.08);
    const rockMat = new THREE.MeshStandardMaterial({ color: ROCK, roughness: 0.9, flatShading: true });
    this.stacks = new THREE.InstancedMesh(rockGeo, rockMat, N * STONES_PER_STACK);
    this.stacks.castShadow = true;
    this.stacks.receiveShadow = true;
    this.flying = new THREE.InstancedMesh(rockGeo, rockMat, 8);
    this.flying.count = 0;
    this.flying.castShadow = true;
    this.flying.frustumCulled = false;
    this.flying.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(this.stacks, this.flying);
    this.layoutStacks();
    scene.add(this.root);
  }

  // ------------------------------------------------------------ постройка

  private buildSection(sec: number, plain: ReturnType<typeof buildFort>): SecView {
    const s = WALL_SECTIONS[sec];
    const f = frameOf(sec);
    const rng = makeRng(4100 + sec * 37);
    const group = (): THREE.Group => {
      const g = new THREE.Group();
      g.visible = false;
      this.root.add(g);
      return g;
    };
    const mesh = (b: Bucket, mat: THREE.Material, parent: THREE.Object3D, shadow = true): THREE.Mesh => {
      const m = new THREE.Mesh(b.build(), mat);
      m.castShadow = shadow;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      parent.add(m);
      return m;
    };
    const into = (edge: number) => (edge === f.lo ? 1 : -1);
    const inward = -f.out;
    // бруствер — с наружной стороны тела стены
    const pIn = f.face + inward * PARAPET_T;

    // --- пролом (С-2а): рваные края, торцы бруствера, горка камней наружу, немного внутрь, пыльная земля
    const breach = group();
    if (s.kind === 'passage') {
      const core = new Bucket();
      const trim = new Bucket();
      for (const edge of [f.lo, f.hi]) {
        const d = into(edge);
        // ступени обвала от края в дыру: каждая ниже и короче — не перекрываются
        const steps: Array<[number, number]> = [[0.22, WALL_H - 0.08 - rng() * 0.15], [0.48, 2.3 + rng() * 0.5], [0.72, 1.2 + rng() * 0.4], [0.9, 0.35 + rng() * 0.15]];
        let a = edge;
        for (const [len, h] of steps) {
          const b = edge + d * len;
          // поперёк чуть внутри граней — рваный край не вылезает из стены
          boxA(core, f, a, b, 0, h, f.c0 + 0.03 + rng() * 0.05, f.c1 - 0.03 - rng() * 0.05, CORE.clone().multiplyScalar(0.92 + rng() * 0.12));
          // камни-зубья на ступени
          for (let k = 0; k < 2; k++) {
            const aa = a + (b - a) * (0.2 + rng() * 0.6);
            const cc = f.c0 + 0.3 + rng() * (f.c1 - f.c0 - 0.6);
            const p = P(f, aa, h + 0.08, cc);
            rock(core, p.x, p.y, p.z, 0.3 + rng() * 0.25, 0.18 + rng() * 0.12, 0.3 + rng() * 0.25, rng() * 0.5, rng() * 3, rng() * 0.5, WALL.clone().multiplyScalar(0.95 + rng() * 0.1));
          }
          a = b;
        }
        // торец бруствера над краем и надломленный зубец
        boxA(trim, f, edge, edge + d * 0.14, WALL_H, WALL_H + PARAPET_H * (0.55 + rng() * 0.3), f.face + inward * 0.02, pIn, CORE, 1);
      }
      // горка камней наружу (по ней мобы заходят в пролом) и пара внутрь; посередине прохода — мелкие
      const mid = (f.lo + f.hi) / 2;
      const half = (f.hi - f.lo) / 2;
      for (let i = 0; i < 22; i++) {
        const outside = i < 16;
        const a = mid + (rng() * 2 - 1) * (half + 0.7);
        const centre = Math.abs(a - mid) < half * 0.55;
        const dist = outside ? 0.15 + rng() * 2.6 : 0.2 + rng() * 1.6;
        const c = outside ? f.face + f.out * dist : (f.out > 0 ? f.c0 : f.c1) + inward * dist;
        const size = centre ? 0.16 + rng() * 0.16 : 0.26 + rng() * 0.36;
        const p = P(f, a, size * 0.32, c);
        rock(core, p.x, p.y, p.z, size * (1 + rng() * 0.6), size * 0.7, size, rng() * 0.6, rng() * 3.1, rng() * 0.6, WALL.clone().multiplyScalar(0.88 + rng() * 0.18));
      }
      mesh(core, this.stoneMat, breach);
      mesh(trim, this.trimMat, breach);
      // пыльная земля под горкой
      const mound = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.moundMat);
      mound.rotation.x = -Math.PI / 2;
      const mp = P(f, mid, 0.02, f.face + f.out * 1.1);
      mound.position.copy(mp);
      const len = f.hi - f.lo + 2.6;
      mound.scale.set(f.along === 'x' ? len : 3.6, f.along === 'x' ? 3.6 : len, 1);
      mound.receiveShadow = true;
      breach.add(mound);
    } else {
      // обвал бастиона и морского центра: бруствер и зубцы внизу горкой
      const rub = new Bucket();
      const mid = (f.lo + f.hi) / 2;
      const half = (f.hi - f.lo) / 2;
      for (let i = 0; i < 14; i++) {
        const a = mid + (rng() * 2 - 1) * half;
        const c = f.face + f.out * (0.2 + rng() * 2.2);
        const size = 0.25 + rng() * 0.3;
        const p = P(f, a, size * 0.3, c);
        rock(rub, p.x, p.y, p.z, size * 1.4, size * 0.7, size, rng() * 0.6, rng() * 3.1, rng() * 0.6, WALL.clone().multiplyScalar(0.9 + rng() * 0.15));
      }
      mesh(rub, this.stoneMat, breach);
    }

    // --- заплатка: та же кладка (тело, бруствер, зубцы), что в дыре, только светлая, новая
    const patch = group();
    const rise = group();
    let patchTop: THREE.Mesh | null = null;
    if (s.kind === 'passage') {
      const body = new Bucket();
      const par = new Bucket();
      const top = new Bucket();
      const R = clipRect(sec);
      for (const b of plain.boxes) {
        const kind = levelOf(b);
        if (!kind) continue;
        const [h0, h1, h2, h3] = s.hole;
        if (b.max[0] <= h0 + 1e-6 || b.min[0] >= h1 - 1e-6 || b.max[2] <= h2 + 1e-6 || b.min[2] >= h3 - 1e-6) continue;
        // вдоль стены — до края дыры (с тем же запасом), поперёк — как сама кладка
        const x0 = f.along === 'x' ? Math.max(b.min[0], R[0]) : b.min[0];
        const x1 = f.along === 'x' ? Math.min(b.max[0], R[1]) : b.max[0];
        const z0 = f.along === 'z' ? Math.max(b.min[2], R[2]) : b.min[2];
        const z1 = f.along === 'z' ? Math.min(b.max[2], R[3]) : b.max[2];
        if (kind === 'wall') body.box(x0, 0, z0, x1, b.max[1], z1, { color: FRESH, ao: 0.66 }, 0b110111);
        else (kind === 'parapet' ? par : top).box(x0, b.min[1], z0, x1, b.max[1], z1, { color: FRESH_TRIM, su: 2, sv: 2 });
      }
      mesh(body, this.stoneMat, patch);
      mesh(par, this.trimMat, patch);
      patchTop = mesh(top, this.trimMat, patch);
      // растущая при ремонте кладка — то же тело, масштаб по высоте
      for (const m of patch.children) {
        const r = new THREE.Mesh((m as THREE.Mesh).geometry, (m as THREE.Mesh).material);
        r.castShadow = true;
        r.receiveShadow = true;
        rise.add(r);
      }
    } else {
      // обвал бастиона и морского центра: после ремонта — новый светлый бруствер и зубцы (без растущей кладки)
      const par = new Bucket();
      const top = new Bucket();
      const R = clipRect(sec);
      for (const b of plain.boxes) {
        const kind = levelOf(b);
        if (kind !== 'parapet' && kind !== 'top') continue;
        if (b.max[0] <= R[0] || b.min[0] >= R[1] || b.max[2] <= R[2] || b.min[2] >= R[3]) continue;
        // у эркеров кладка не рушилась — там новой не надо (иначе две грани в одном месте)
        const r: Rect = [Math.max(b.min[0], R[0]), Math.min(b.max[0], R[1]), Math.max(b.min[2], R[2]), Math.min(b.max[2], R[3])];
        for (const [x0, x1, z0, z1] of minusKeep(r)) (kind === 'parapet' ? par : top).box(x0, b.min[1], z0, x1, b.max[1], z1, { color: FRESH_TRIM, su: 2, sv: 2 });
      }
      mesh(par, this.trimMat, patch);
      patchTop = mesh(top, this.trimMat, patch);
    }

    // --- леса: столбы с обеих сторон дыры, доски-настилы, бадья с раствором
    const scaffold = group();
    {
      const w = new Bucket();
      const post = (a: number, c: number) => {
        const p = P(f, a, 0, c);
        w.box(p.x - 0.07, 0, p.z - 0.07, p.x + 0.07, WALL_H + 1.1, p.z + 0.07, { color: WOOD_DK, ao: 0.8, su: 1, sv: 2 });
      };
      const outC = f.face + f.out * 0.55;
      const inC = (f.out > 0 ? f.c0 : f.c1) + inward * 0.55;
      for (const c of s.kind === 'passage' ? [outC, inC] : [outC]) {
        post(f.lo - 0.15, c);
        post(f.hi + 0.15, c);
        for (const y of [1.15, 2.3, 3.45]) {
          const a0 = P(f, f.lo - 0.25, y, c - 0.28);
          const a1 = P(f, f.hi + 0.25, y + 0.07, c + 0.28);
          w.box(Math.min(a0.x, a1.x), y, Math.min(a0.z, a1.z), Math.max(a0.x, a1.x), y + 0.07, Math.max(a0.z, a1.z), { color: WOOD.clone().multiplyScalar(0.9 + rng() * 0.2), su: 2, sv: 1 });
        }
        // косая распорка
        const g = new THREE.BoxGeometry(0.08, 3.6, 0.08);
        const m = P(f, (f.lo + f.hi) / 2, 1.8, c);
        g.applyMatrix4(new THREE.Matrix4().compose(m, new THREE.Quaternion().setFromEuler(f.along === 'x' ? new THREE.Euler(0, 0, 0.75) : new THREE.Euler(0.75, 0, 0)), new THREE.Vector3(1, 1, 1)));
        w.geo(g, WOOD_DK);
      }
      mesh(w, this.woodMat, scaffold);
    }

    // --- трещины на наружной и внутренней грани (наклейки на 2 см от грани), обломки зубцов внизу
    const cracks = this.crackDecals(sec, f, rng);
    const ruin = new Bucket();
    for (let i = 0; i < 4; i++) {
      const a = f.lo + rng() * (f.hi - f.lo);
      const c = f.face + f.out * (0.3 + rng() * 1.4);
      const p = P(f, a, 0.18, c);
      rock(ruin, p.x, p.y, p.z, 0.75, 0.4, 0.42, rng() * 0.4, rng() * 3, rng() * 0.8, WALL);
    }
    const ruinMesh = mesh(ruin, this.trimMat, this.root);
    ruinMesh.visible = false;

    // торцы: где дыра режет кладку, закрываем срез гранью цвета нутра стены (иначе видно пустоту внутри)
    const R = clipRect(sec);
    const low = new Bucket();
    const topCap = new Bucket();
    // стороны дыры (грань смотрит в дыру) и стороны квадратов эркеров внутри неё (грань смотрит из квадрата);
    // у каждой — пределы по другой оси
    const sides: Array<['x' | 'z', number, number, number, number]> = [
      ['x', R[0], 1, R[2], R[3]], ['x', R[1], -1, R[2], R[3]], ['z', R[2], 1, R[0], R[1]], ['z', R[3], -1, R[0], R[1]],
    ];
    for (const [kx, kz] of KEEP) {
      const k = [kx - KEEP_R, kx + KEEP_R, kz - KEEP_R, kz + KEEP_R];
      if (k[1] <= R[0] || k[0] >= R[1] || k[3] <= R[2] || k[2] >= R[3]) continue;
      if (k[0] > R[0]) sides.push(['x', k[0], -1, Math.max(k[2], R[2]), Math.min(k[3], R[3])]);
      if (k[1] < R[1]) sides.push(['x', k[1], 1, Math.max(k[2], R[2]), Math.min(k[3], R[3])]);
      if (k[2] > R[2]) sides.push(['z', k[2], -1, Math.max(k[0], R[0]), Math.min(k[1], R[1])]);
      if (k[3] < R[3]) sides.push(['z', k[3], 1, Math.max(k[0], R[0]), Math.min(k[1], R[1])]);
    }
    for (const b of plain.boxes) {
      const kind = levelOf(b);
      if (!kind || (kind === 'wall' && s.kind !== 'passage')) continue;
      for (const [axis, v, sign, lo, hi] of sides) {
        const ax = axis === 'x' ? 0 : 2;
        const ox = axis === 'x' ? 2 : 0;
        if (!(b.min[ax] < v - 1e-4 && b.max[ax] > v + 1e-4)) continue;
        const a0 = Math.max(b.min[ox], lo);
        const a1 = Math.min(b.max[ox], hi);
        if (a1 - a0 < 1e-3) continue;
        const y0 = kind === 'top' ? WALL_H + PARAPET_H + 0.01 : Math.max(b.min[1], s.kind === 'passage' ? Y_GROUND : WALL_H + 0.01);
        (kind === 'top' ? topCap : low).face(axis, sign, v, a0, a1, y0, b.max[1], { color: CORE, su: 2, sv: 2, ao: kind === 'wall' ? 0.7 : 1 });
      }
    }
    const capMesh = (b: Bucket, mat: THREE.Material): THREE.Mesh | null => {
      if (!b.triangles) return null;
      const m = mesh(b, mat, this.root);
      m.visible = false;
      return m;
    };
    const capLow = capMesh(low, s.kind === 'passage' ? this.stoneMat : this.trimMat);
    const capTop = capMesh(topCap, this.trimMat);

    return { sec, f, stage: WS_OK, patched: false, fix: -1, breach, patch, rise, scaffold, cracks, ruin: ruinMesh, patchTop, capLow, capTop };
  }

  private crackDecals(sec: number, f: Frame, rng: () => number): THREE.Mesh {
    const s = WALL_SECTIONS[sec];
    const pos: number[] = [];
    const uv: number[] = [];
    const nor: number[] = [];
    const idx: number[] = [];
    const mid = (f.lo + f.hi) / 2;
    const quad = (a: number, y: number, c: number, nOut: number, size: number, flip: boolean) => {
      const base = pos.length / 3;
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const da = (u - 0.5) * size * (flip ? -1 : 1) * (nOut > 0 ? 1 : -1);
        const p = P(f, a + da, y + (v - 0.5) * size * 1.3, c);
        pos.push(p.x, p.y, p.z);
        uv.push(u, v);
        if (f.along === 'x') nor.push(0, 0, nOut);
        else nor.push(nOut, 0, 0);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const faces = s.kind === 'passage' ? [f.face + f.out * 0.02, (f.out > 0 ? f.c0 : f.c1) - f.out * 0.02] : [f.face + f.out * 0.02];
    faces.forEach((c, i) => {
      const n = i === 0 ? f.out : -f.out;
      for (let k = 0; k < 3; k++) quad(mid + (rng() - 0.5) * (f.hi - f.lo) * 0.7, 1.1 + rng() * 1.1, c, n, 1.1 + rng() * 0.5, rng() < 0.5);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, this.crackMat);
    m.visible = false;
    m.renderOrder = 2;
    this.root.add(m);
    return m;
  }

  // ------------------------------------------------------------ состояние

  /** Новое состояние с сервера: прочность → стадии, камни, ремонты */
  setState(st: F50State): void {
    const fix = new Map<number, number>();
    for (const f of st.fix) fix.set(f[0], Math.max(0, Math.min(1, f[1] / 1000)));
    for (const v of this.views) {
      const stage = wallStage(st.hp[v.sec] ?? 1, st.max[v.sec] ?? 1);
      v.fix = fix.get(v.sec) ?? -1;
      if (stage !== v.stage) {
        if (v.stage === WS_BREACH && stage !== WS_BREACH) v.patched = true;
        v.stage = stage;
      }
      this.apply(v);
    }
    let changed = false;
    for (let i = 0; i < N; i++) {
      const n = st.stones[i] ?? 0;
      // камней стало меньше — один полетел вниз
      if (n < this.stones[i] && (st.hp[i] ?? 0) > 0) this.dropStone(i, this.stones[i] - 1);
      if (n !== this.stones[i]) changed = true;
      this.stones[i] = n;
    }
    // пролом и обвал: штабеля нет (сервер обнуляет камни, но и стадию сверяем — не висит над дырой)
    if (changed || this.views.some((v) => v.stage === WS_BREACH)) this.layoutStacks();
  }

  /** Новая игра: всё целое, заплаток нет */
  reset(): void {
    for (const v of this.views) {
      v.stage = WS_OK;
      v.patched = false;
      v.fix = -1;
      this.apply(v);
    }
    this.stones = WALL_SECTIONS.map(() => STONES_PER_STACK);
    this.falls.length = 0;
    this.layoutStacks();
  }

  private apply(v: SecView): void {
    const s = WALL_SECTIONS[v.sec];
    const open = v.stage === WS_BREACH;
    const passage = s.kind === 'passage';
    const ruin = v.stage === WS_RUIN;
    // дыра в кладке: пролом — до земли (у обвала — бруствер и зубцы); заплатка — тоже (её место заняла новая
    // кладка); обвал зубцов — только зубцы
    let ymin = 99;
    if (open) ymin = passage ? Y_GROUND : WALL_H + 0.01;
    else if (v.patched) ymin = passage ? Y_GROUND : WALL_H + 0.01;
    else if (ruin) ymin = WALL_H + PARAPET_H + 0.01;
    this.clip.set(v.sec, ymin);
    v.breach.visible = open;
    v.patch.visible = !open && v.patched;
    if (v.patchTop) v.patchTop.visible = !ruin;
    // ремонт пролома — растущая свежая кладка в лесах; ремонт повреждённого — только леса
    v.rise.visible = passage && open && v.fix >= 0;
    if (v.rise.visible) v.rise.scale.y = Math.max(0.03, v.fix);
    v.scaffold.visible = v.fix >= 0;
    if (v.capLow) v.capLow.visible = open;
    if (v.capTop) v.capTop.visible = open || ruin;
    // трещины — на старой кладке; на свежей заплатке их нет
    v.cracks.visible = !open && !v.patched && (v.stage === WS_CRACK || ruin);
    v.ruin.visible = ruin || (open && !passage);
  }

  /** Ремонт идёт: доля 0…1 по часам (между сообщениями сервера кладка растёт плавно) */
  fixProgress(sec: number, frac: number): void {
    const v = this.views[sec];
    if (!v || v.fix < 0) return;
    v.fix = Math.max(v.fix, Math.min(1, frac));
    if (v.rise.visible) v.rise.scale.y = Math.max(0.03, v.fix);
  }

  /** Удар по участку: пыль и камешки с грани */
  hit(sec: number, x: number, y: number, z: number): void {
    const fx = this.castle.fx;
    fx.puff(x, y, z, 3, 0.5, 0.7, 0.35, 1.1, DUST, 0.5);
    const s = WALL_SECTIONS[sec];
    fx.burst(x, y, z, 5, PEBBLE, [0.09, 0.07, 0.08], 2.4, s?.nx ?? 0, 0.6, s?.nz ?? 0, 1.2);
    this.onSound?.('hit', x, y, z);
  }

  /** Стадия с сервера (событие): пролом — облако и обломки по всей дыре; ремонт — пыль и стук */
  stage(sec: number, stage: number, by: number): void {
    const v = this.views[sec];
    if (!v) return;
    const fx = this.castle.fx;
    const f = v.f;
    const mid = (f.lo + f.hi) / 2;
    const c = P(f, mid, 1.6, f.face + f.out * 0.6);
    if (stage === WS_BREACH) {
      for (let k = 0; k < 5; k++) {
        const p = P(f, f.lo + (k + 0.5) * (f.hi - f.lo) / 5, 0.8 + Math.random() * 2, f.face + f.out * 0.4);
        fx.puff(p.x, p.y, p.z, 4, 0.8, 1.3, 0.5, 2.2, DUST, 0.6);
      }
      fx.burst(c.x, c.y + 1, c.z, 18, PEBBLE, [0.3, 0.22, 0.26], 3.4, WALL_SECTIONS[sec].nx, 0.8, WALL_SECTIONS[sec].nz, 1.4);
      this.onSound?.('breach', c.x, c.y, c.z);
    } else if (by) {
      fx.puff(c.x, 1.4, c.z, 6, 1.2, 1.1, 0.4, 1.6, DUST, 0.45);
      this.onSound?.('fixed', c.x, c.y, c.z);
    }
  }

  // ------------------------------------------------------------ камни

  private stackPos(sec: number, i: number, out: THREE.Vector3): THREE.Vector3 {
    const s = WALL_SECTIONS[sec];
    const [x, y, z] = s.stack;
    // вдоль стены — два внизу, один сверху
    const along = s.nx !== 0 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const k = i === 2 ? 0 : i === 0 ? -0.27 : 0.27;
    return out.set(x, y + (i === 2 ? 0.47 : 0.21), z).addScaledVector(along, k);
  }

  private layoutStacks(): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const zero = new THREE.Vector3(0, 0, 0);
    for (let sec = 0; sec < N; sec++) {
      for (let i = 0; i < STONES_PER_STACK; i++) {
        const show = i < this.stones[sec] && this.views[sec]?.stage !== WS_BREACH;
        q.setFromEuler(new THREE.Euler(sec * 0.7 + i, sec * 1.3 + i * 2.1, i * 0.4));
        m.compose(this.stackPos(sec, i, p), q, show ? one : zero);
        this.stacks.setMatrixAt(sec * STONES_PER_STACK + i, m);
      }
    }
    this.stacks.instanceMatrix.needsUpdate = true;
  }

  /** Камень i со штабеля sec летит через бруствер вниз (удар — в stoneLand по событию сервера) */
  private dropStone(sec: number, i: number): void {
    const s = WALL_SECTIONS[sec];
    const from = this.stackPos(sec, Math.max(0, Math.min(2, i)), new THREE.Vector3());
    const to = new THREE.Vector3(s.nx ? s.face + s.nx * STONE_OUT * 0.5 : s.stack[0], 0.22, s.nz ? s.face + s.nz * STONE_OUT * 0.5 : s.stack[2]);
    const t0 = this.now;
    this.falls.push({ sec, i: this.falls.length, t0, t1: t0 + STONE_FALL_TICKS / TICK_RATE, from, to, spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9), landed: false, until: t0 + 3.5 });
    if (this.falls.length > 8) this.falls.shift();
  }

  /** Сервер: камень упал (x, z — середина полосы), сбил n */
  stoneLand(sec: number, x: number, z: number, _n: number): void {
    const fx = this.castle.fx;
    fx.puff(x, 0.4, z, 6, 1.3, 1.2, 0.5, 1.6, DUST, 0.6);
    const s = WALL_SECTIONS[sec];
    fx.burst(x, 0.3, z, 10, PEBBLE, [0.14, 0.1, 0.12], 2.8, (s?.nx ?? 0) * 0.5, 1, (s?.nz ?? 0) * 0.5, 1.6);
    this.onSound?.('stone', x, 0.5, z);
    // если сервер опередил анимацию — камень сразу на земле
    for (const f of this.falls) if (f.sec === sec && !f.landed) { f.t1 = Math.min(f.t1, this.now); }
  }

  // ------------------------------------------------------------ кадр

  update(dt: number, t: number): void {
    this.now = t;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    let n = 0;
    for (let i = this.falls.length - 1; i >= 0; i--) if (t > this.falls[i].until) this.falls.splice(i, 1);
    for (const f of this.falls) {
      const u = Math.min(1, Math.max(0, (t - f.t0) / Math.max(0.05, f.t1 - f.t0)));
      if (u >= 1 && !f.landed) f.landed = true;
      // дуга: сначала через бруствер (вверх и наружу), потом вниз с ускорением
      p.lerpVectors(f.from, f.to, u);
      p.y = f.from.y + (f.to.y - f.from.y) * u * u + 0.9 * Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u);
      const spin = f.landed ? 1 : u;
      q.setFromEuler(new THREE.Euler(f.spin.x * spin, f.spin.y * spin, f.spin.z * spin));
      // лежит и уходит в землю в конце
      const sink = f.landed ? Math.max(0, (t - (f.until - 0.8)) / 0.8) : 0;
      p.y -= sink * 0.4;
      sc.setScalar(1.15);
      m.compose(p, q, sc);
      this.flying.setMatrixAt(n++, m);
      if (n >= 8) break;
    }
    this.flying.count = n;
    this.flying.visible = n > 0;
    if (n) this.flying.instanceMatrix.needsUpdate = true;
    // леса: молоток стучит, пока идёт ремонт
    for (const v of this.views) {
      if (v.fix < 0) continue;
      if (Math.floor(t * 2.6 + v.sec) !== Math.floor((t - dt) * 2.6 + v.sec)) {
        const c = P(v.f, (v.f.lo + v.f.hi) / 2, 1 + v.fix * 2, v.f.face + v.f.out * 0.5);
        this.castle.fx.puff(c.x, c.y, c.z, 1, 0.4, 0.4, 0.3, 0.8, DUST, 0.35);
        this.onSound?.('hammer', c.x, c.y, c.z);
      }
    }
  }

  /** Для стенда и замера: стадии участков, видимые меши */
  info(): { stages: number[]; patched: boolean[]; draws: number } {
    let draws = this.stacks.visible ? 1 : 0;
    this.root.traverseVisible((o) => { if ((o as THREE.Mesh).isMesh && o !== this.stacks) draws++; });
    return { stages: this.views.map((v) => v.stage), patched: this.views.map((v) => v.patched), draws };
  }

  /** Где сейчас пролом (для мини-карты и подсказок) */
  open(sec: number): boolean {
    return this.views[sec]?.stage === WS_BREACH;
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    for (const mat of [this.stoneMat, this.trimMat, this.woodMat, this.crackMat, this.moundMat]) {
      mat.map?.dispose();
      mat.dispose();
    }
    this.root.removeFromParent();
  }
}
