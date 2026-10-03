// Фон за набережной (выпуск 5, «чтобы смотреть на красивый фон за картой»).
// Дальний берег бухты на юге — настоящий рельеф, а не плоские «кулисы»: пляжи и скалы у воды, зелёные холмы с лесом
// и полянами, за ними горы со снежными вершинами в голубой дымке. На берегу — посёлки: белые домики под черепицей,
// церковь с куполом, вечером — огни; на скалистом мысу — маячок. На западе, в стороне от солнца, — острова с соснами,
// по заливу медленно ходят парусники.
// Солнце не двигается, поэтому свет «запечён» в цвета вершин, как и дымка: дальнее тонет в цвете неба у горизонта
// (у воды — тёплом, выше — голубом), как настоящая воздушная перспектива. Дёшево и одинаково на любой видеокарте;
// дымку дождя добавляет общий far из world.ts.
import * as THREE from 'three';
import { WATER_Y } from '../../shared/constants.ts';
import { makeRng } from '../../shared/math.ts';
import { glowTexture, mergeColored, paint, place, staticMesh } from '../render/kit.ts';
import { EVENING } from '../render/sky.ts';

type Far = <T extends THREE.Material>(m: T, glow?: boolean) => T;

/** Откуда смотрим (середина набережной): вокруг неё сетка берега, от неё считается дымка */
const EYE = new THREE.Vector3(0, 1.7, 10);
/**
 * Сетка берега — «веер» вокруг площади: ряды — дуги на равном расстоянии (чем дальше, тем реже), столбцы —
 * направления от запада-юго-запада до востока-юго-востока (угол от юга к востоку). Края веера смотрят прямо на
 * площадь, поэтому срез сетки не виден; дальний ряд — в пределах видимости камеры (1600 м).
 */
const R0 = 520;
const R1 = 1530;
const GROW = 1.011;
const TH0 = -1.0;
const TH1 = 1.12;
const DTH = 0.0105;

// свет: небо (рассеянный, голубоватый) и солнце (тёплое, низко на западе)
const SKY_LIGHT = new THREE.Color(0.62, 0.66, 0.76);
const SUN_LIGHT = new THREE.Color(1.0, 0.86, 0.68).multiplyScalar(0.85);
const SUN = EVENING.sunDir;
// дымка — цвет неба у горизонта: внизу тёплый, выше голубой, к солнцу — золотистый
const HZ_LOW = new THREE.Color(EVENING.horizon);
const HZ_HIGH = new THREE.Color(EVENING.mid);
const HZ_GLOW = new THREE.Color(EVENING.sunGlow);

const C = {
  wetSand: new THREE.Color(0xb39c70),
  sand: new THREE.Color(0xe2cd98),
  rock: new THREE.Color(0xa69a88),
  darkRock: new THREE.Color(0x857b6c),
  meadow: new THREE.Color(0xa4c05e),
  orchard: new THREE.Color(0x8fae4e),
  forest: new THREE.Color(0x52843f),
  darkForest: new THREE.Color(0x3b6636),
  alpine: new THREE.Color(0x889866),
  scree: new THREE.Color(0x9a9386),
  snow: new THREE.Color(0xf6f8fb),
};

const smooth = (t: number) => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

const hash = (i: number, j: number) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Где кончается вода на дальнем берегу (z по x): бухточки и два мыса; на западе берег уходит — там садится солнце. */
export function shoreZ(x: number): number {
  const west = smooth((x + 1180) / 300);
  return 655 + 32 * Math.sin(x * 0.0042 + 0.6) + 16 * Math.sin(x * 0.013 + 2.1)
    - 110 * Math.exp(-(((x + 520) / 60) ** 2)) - 55 * Math.exp(-(((x - 430) / 70) ** 2))
    + (1 - west) * 700;
}

/** Где берег скалистый (0 — пляж, 1 — обрыв): кусками вдоль берега и всегда на мысах. */
function cliffK(x: number): number {
  const k = 0.9 * Math.sin(x * 0.0047 + 2.3) + 0.5 * Math.sin(x * 0.0131 + 0.4) - 0.25
    + 1.4 * Math.exp(-(((x + 520) / 75) ** 2)) + 1.2 * Math.exp(-(((x - 430) / 80) ** 2));
  return smooth(k * 1.6);
}

/** Хребты: 0…~1,3 — где горы выше */
function ridge(x: number, z: number): number {
  const r = 0.55 + 0.45 * Math.sin(x * 0.0057 + 1.7) * Math.cos(z * 0.0049 - 0.5) + 0.22 * Math.sin(x * 0.019 + z * 0.013) + 0.1 * Math.sin(x * 0.047 - z * 0.031);
  return Math.max(0, r);
}

function rawH(x: number, z: number): number {
  const d = z - shoreZ(x);
  if (d < 0) return Math.max(-24, d * 0.3);
  const ck = cliffK(x);
  const cliff = 13 + 9 * Math.sin(x * 0.021 + 1.1);
  const coast = (1 - ck) * Math.min(1, d / 16) * 2.5 + ck * cliff * smooth(d / 10);
  const hills = smooth((d - 10) / 210) * (58 + 34 * Math.sin(x * 0.0085 + 1.2) * Math.cos(z * 0.011 - 0.4) + 16 * Math.sin(x * 0.027 + z * 0.019));
  // горы с ущельями: острые гребни там, где |sin| мал
  const gully = 1 - 0.14 * Math.abs(Math.sin(x * 0.029 + Math.sin(z * 0.013) * 2));
  const mount = smooth((d - 240) / 330) * (82 + 100 * ridge(x, z)) * gully;
  const west = smooth((x + 1150) / 320);
  return (coast + Math.max(0, hills) + mount) * (0.15 + 0.85 * west);
}

/** Высота дальнего берега над водой; к восточному краю веера берег мысом уходит под воду. */
export function landH(x: number, z: number): number {
  const east = smooth((TH1 - 0.02 - Math.atan2(x - EYE.x, z - EYE.z)) / 0.26);
  return (rawH(x, z) + 6) * east - 6;
}

/** Крутизна склона (подъём на метр) — по соседним высотам */
function slopeAt(x: number, z: number, e = 6): number {
  return Math.hypot(landH(x + e, z) - landH(x - e, z), landH(x, z + e) - landH(x, z - e)) / (2 * e);
}

/** Пятна леса и полян: 0…1 */
function patch(x: number, z: number): number {
  return 0.5 + 0.25 * Math.sin(x * 0.021 + Math.sin(z * 0.017) * 2) + 0.17 * Math.sin(x * 0.061 - z * 0.047 + 1.3) + 0.08 * Math.sin(x * 0.15 + z * 0.11);
}

const _h = new THREE.Color();

/** Сколько дымки у точки (0…0,85); её цвет кладётся в _h — цвет неба в этом направлении (как у неба, без облаков). */
function hazeAt(x: number, y: number, z: number): number {
  const dx = x - EYE.x;
  const dy = y - EYE.y;
  const dz = z - EYE.z;
  const len = Math.hypot(dx, dy, dz);
  _h.copy(HZ_LOW).lerp(HZ_HIGH, smooth(dy / len / 0.22));
  const g = Math.pow(Math.max(0, (dx * SUN.x + dy * SUN.y + dz * SUN.z) / len), 5) * 0.3;
  _h.r += HZ_GLOW.r * g;
  _h.g += HZ_GLOW.g * g;
  _h.b += HZ_GLOW.b * g;
  return Math.min(0.85, Math.max(0, 1 - Math.exp(-(len - 150) / 1500)));
}

/** Дымка для других далёких мешей (город): цвет — в out, доля (0…0,85) — в ответе. */
export function skyHaze(out: THREE.Color, x: number, y: number, z: number): number {
  const k = hazeAt(x, y, z);
  out.copy(_h);
  return k;
}

/** Освещённость грани: небо сверху и низкое солнце */
function light(out: THREE.Color, nx: number, ny: number, nz: number, sunK = 1): THREE.Color {
  const sun = Math.max(0, nx * SUN.x + ny * SUN.y + nz * SUN.z) * sunK;
  const sky = 0.55 + 0.45 * Math.max(0, ny);
  return out.setRGB(SKY_LIGHT.r * sky + SUN_LIGHT.r * sun, SKY_LIGHT.g * sky + SUN_LIGHT.g * sun, SKY_LIGHT.b * sky + SUN_LIGHT.b * sun);
}

const _l = new THREE.Color();
const _c = new THREE.Color();

/** Цвет поверхности под небом и солнцем, утопленный в дымку */
function shade(out: THREE.Color, albedo: THREE.Color, nx: number, ny: number, nz: number, x: number, y: number, z: number, sunK = 1): THREE.Color {
  light(_l, nx, ny, nz, sunK);
  out.setRGB(albedo.r * _l.r, albedo.g * _l.g, albedo.b * _l.b);
  return out.lerp(_h, hazeAt(x, y, z));
}

/** Раскрасить неиндексированную геометрию: цвет по нормали каждой вершины, свет и дымка — как у точки at. */
function bake(g: THREE.BufferGeometry, albedo: (v: number) => THREE.Color, at: THREE.Vector3, sunK = 1): THREE.BufferGeometry {
  const n = g.getAttribute('normal');
  const cols = new Float32Array(n.count * 3);
  for (let v = 0; v < n.count; v++) {
    shade(_c, albedo(v), n.getX(v), n.getY(v), n.getZ(v), at.x, at.y, at.z, sunK);
    cols[v * 3] = _c.r;
    cols[v * 3 + 1] = _c.g;
    cols[v * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  return g;
}

interface Sail {
  obj: THREE.Group;
  /** Корпус (с полосой) и паруса: дымка — множитель цвета (1 − k) плюс свечение цветом неба (k) */
  hull: THREE.MeshLambertMaterial;
  sail: THREE.MeshLambertMaterial;
  x0: number;
  z0: number;
  dx: number;
  dz: number;
  len: number;
  speed: number;
  phase: number;
}

const SAIL_WHITE = new THREE.Color(0xfbf8f0);

export class Backdrop {
  private readonly scene: THREE.Scene;
  private readonly far: Far;
  private readonly sails: Sail[] = [];
  /** Огонь маячка на мысу: мигает раз в 5 с */
  private readonly beacon = new THREE.PointsMaterial({
    color: 0xfff0c8, size: 9, map: glowTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });

  constructor(scene: THREE.Scene, far: Far) {
    this.scene = scene;
    this.far = far;
    this.buildShore();
    this.buildForest();
    this.buildVillages();
    this.buildIslands();
    this.buildSails();
  }

  /** Дальний берег одной сеткой: высоты, цвет по высоте и крутизне, свет и дымка — в вершинах. */
  private buildShore(): void {
    const rs: number[] = [];
    for (let r = R0; r < R1; r *= GROW) rs.push(r);
    rs.push(R1);
    const ths: number[] = [];
    for (let a = TH0; a < TH1; a += DTH) ths.push(a);
    ths.push(TH1);
    const nx = ths.length;
    const nz = rs.length;
    const pos = new Float32Array(nx * nz * 3);
    const hs = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = EYE.x + rs[j] * Math.sin(ths[i]);
        const z = EYE.z + rs[j] * Math.cos(ths[i]);
        const h = landH(x, z);
        const v = j * nx + i;
        hs[v] = h;
        pos[v * 3] = x;
        pos[v * 3 + 1] = WATER_Y + h;
        pos[v * 3 + 2] = z;
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        // целиком под водой — не рисуем
        if (hs[a] < -2 && hs[a + 1] < -2 && hs[a + nx] < -2 && hs[a + nx + 1] < -2) continue;
        idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const nrm = g.getAttribute('normal');
    const col = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const v = j * nx + i;
        const x = pos[v * 3];
        const z = pos[v * 3 + 2];
        const h = hs[v];
        const ny = nrm.getY(v);
        const slope = Math.sqrt(Math.max(0, 1 - ny * ny)) / Math.max(0.05, ny);
        const d = z - shoreZ(x);
        const p = patch(x, z);
        let a: THREE.Color;
        if (h < 0.7) a = C.wetSand;
        else if (d < 18 && slope < 0.4) a = C.sand;
        // на зелёных холмах скалы — только на обрывах, в горах — на любом крутом склоне
        else if (slope > (h < 110 ? 1.15 : 0.8)) a = slope > 1.4 ? C.darkRock : C.rock;
        else if (h < 125) a = p > 0.7 ? C.darkForest : p > 0.47 ? C.forest : d < 100 && p < 0.33 ? C.orchard : C.meadow;
        else if (h < 185) a = p > 0.56 ? C.forest : C.alpine;
        else if (h < 212 + 26 * p) a = C.scree;
        else a = C.snow;
        // пёстрость: кроны и камни не одного тона
        const veg = a !== C.wetSand && a !== C.sand && a !== C.snow;
        _c.copy(a).multiplyScalar(1 + (hash(i, j) - 0.5) * (veg ? 0.2 : 0.08));
        shade(_c, _c, nrm.getX(v), ny, nrm.getZ(v), x, pos[v * 3 + 1], z, a === C.snow ? 1.15 : 1);
        col[v * 3] = _c.r;
        col[v * 3 + 1] = _c.g;
        col[v * 3 + 2] = _c.b;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('normal');
    this.scene.add(staticMesh(g, this.far(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })), false));
  }

  /** Лес на ближних холмах — настоящие деревья (конусы елей): у склонов появляется «ворс», а не только цвет. */
  private buildForest(): void {
    const rng = makeRng(733);
    const cone = new THREE.ConeGeometry(1, 1, 6, 1, true).translate(0, 0.5, 0);
    // свет на гранях конуса одинаков для всех деревьев; цвет и дымка — у каждого дерева свои
    const cn = cone.getAttribute('normal');
    const lc = new Float32Array(cn.count * 3);
    for (let v = 0; v < cn.count; v++) {
      light(_l, cn.getX(v), cn.getY(v), cn.getZ(v));
      lc.set([_l.r, _l.g, _l.b], v * 3);
    }
    cone.setAttribute('color', new THREE.BufferAttribute(lc, 3));
    /** Средняя освещённость конуса: дымку делим на неё, чтобы после умножения на свет вышел её цвет */
    const AVG = 0.72;
    const max = 2600;
    const mesh = new THREE.InstancedMesh(cone, this.far(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })), max);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const tint = new THREE.Color();
    let n = 0;
    for (let tries = 0; tries < 60000 && n < max; tries++) {
      const th = TH0 + rng() * (TH1 - TH0);
      const r = R0 + 20 + rng() * 640;
      const x = EYE.x + r * Math.sin(th);
      const z = EYE.z + r * Math.cos(th);
      const h = landH(x, z);
      if (h < 4 || h > 175) continue;
      const pt = patch(x, z);
      if (pt < 0.47 && rng() > 0.04) continue;
      if (slopeAt(x, z) > 0.8) continue;
      const hgt = 8 + rng() * 7;
      const rad = hgt * (0.28 + rng() * 0.08);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rng() * Math.PI);
      mesh.setMatrixAt(n, m.compose(p.set(x, WATER_Y + h - 1, z), q, s.set(rad, hgt, rad)));
      tint.copy(pt > 0.7 ? C.darkForest : C.forest).multiplyScalar(0.85 + rng() * 0.25);
      const k = hazeAt(x, WATER_Y + h + hgt / 2, z);
      tint.multiplyScalar(1 - k);
      tint.r += (_h.r * k) / AVG;
      tint.g += (_h.g * k) / AVG;
      tint.b += (_h.b * k) / AVG;
      mesh.setColorAt(n++, tint);
    }
    mesh.count = n;
    mesh.matrixAutoUpdate = false;
    mesh.computeBoundingSphere();
    this.scene.add(mesh);
  }

  /** Посёлки у воды: домики на нижних склонах, церковь с куполом, маячок на мысу, огни в окнах и вдоль берега. */
  private buildVillages(): void {
    const rng = makeRng(515);
    const geos: THREE.BufferGeometry[] = [];
    const lights: number[] = [];
    const walls = [0xf6f1e6, 0xf3e3c3, 0xf1d4bd, 0xe9eef2, 0xf4e7b0, 0xf0d0c8];
    const roofs = [0xb4553a, 0xc4683f, 0xa04a32, 0xb86b45];
    const at = new THREE.Vector3();
    const one = (hex: number) => {
      const c = new THREE.Color(hex);
      return () => c;
    };
    /** Дом: стены и двускатная крыша (конёк — вдоль ширины w) */
    const house = (w: number, hh: number, dp: number, x: number, y: number, z: number, ry: number, wall: number, roof: number) => {
      at.set(x, y + hh / 2, z);
      geos.push(bake(place(new THREE.BoxGeometry(w, hh, dp).toNonIndexed(), x, y + hh / 2, z, ry), one(wall), at));
      const s = new THREE.Shape();
      s.moveTo(-dp / 2 - 0.4, 0);
      s.lineTo(dp / 2 + 0.4, 0);
      s.lineTo(0, dp * 0.4);
      s.closePath();
      const r = new THREE.ExtrudeGeometry(s, { depth: w + 0.6, bevelEnabled: false }).translate(0, 0, -(w + 0.6) / 2).rotateY(Math.PI / 2);
      geos.push(bake(place(r, x, y + hh, z, ry), one(roof), at));
    };
    const villages: Array<[number, number]> = [[-660, 30], [-130, 46], [290, 30], [690, 24]];
    for (const [vx, count] of villages) {
      let placed = 0;
      for (let tries = 0; tries < count * 8 && placed < count; tries++) {
        const x = vx + (rng() - 0.5) * 170;
        const z = shoreZ(x) + 12 + rng() * rng() * 120;
        const h = landH(x, z);
        if (h < 1.2 || slopeAt(x, z, 5) > 0.45) continue;
        const w = 7 + rng() * 6;
        const dp = 6 + rng() * 4;
        const hh = 3.2 * (1 + Math.floor(rng() * 3)) + 1;
        const ry = Math.round(rng() * 4) * (Math.PI / 2) + (rng() - 0.5) * 0.3;
        const y = WATER_Y + h - 0.6;
        house(w, hh, dp, x, y, z, ry, walls[Math.floor(rng() * walls.length)], roofs[Math.floor(rng() * roofs.length)]);
        if (rng() < 0.6) lights.push(x + (rng() - 0.5) * w * 0.5, y + 1.6 + rng() * (hh - 2.2), z - dp / 2 - 0.5);
        placed++;
      }
      // фонари вдоль воды
      for (let k = 0; k < 14; k++) {
        const x = vx + (k / 13 - 0.5) * 190;
        const z = shoreZ(x) + 7;
        lights.push(x, WATER_Y + Math.max(0, landH(x, z)) + 3.5, z);
      }
    }
    // церковь над средним посёлком: неф, колокольня, золотой купол
    {
      const x = -95;
      const z = shoreZ(x) + 75;
      const y = WATER_Y + landH(x, z) - 0.6;
      house(10, 9, 22, x, y, z, 0.1, 0xf7f3ea, 0x9e4a36);
      at.set(x, y + 11, z);
      geos.push(bake(place(new THREE.BoxGeometry(6, 22, 6).toNonIndexed(), x + 1.3, y + 11, z - 13), one(0xf7f3ea), at));
      const dome = new THREE.SphereGeometry(3.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
      geos.push(bake(place(dome, x + 1.3, y + 22, z - 13), one(0xe2b24c), at, 1.3));
    }
    // маячок на скалистом мысу (запад): белая башня с красным поясом и тёмной крышей
    {
      const x = -520;
      const z = shoreZ(x) + 16;
      const y = WATER_Y + landH(x, z) - 0.5;
      at.set(x, y + 6, z);
      geos.push(bake(place(new THREE.CylinderGeometry(1.5, 2.1, 12, 10).toNonIndexed(), x, y + 6, z), one(0xf4f1ea), at, 1.1));
      geos.push(bake(place(new THREE.CylinderGeometry(1.75, 1.75, 2, 10).toNonIndexed(), x, y + 12.5, z), one(0xc23a2e), at, 1.1));
      geos.push(bake(place(new THREE.ConeGeometry(1.9, 2.2, 10).toNonIndexed(), x, y + 14.6, z), one(0x3a3a3e), at, 1.1));
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute([x, y + 12.6, z - 1], 3));
      this.scene.add(new THREE.Points(bg, this.far(this.beacon, true)));
    }
    this.scene.add(staticMesh(mergeColored(geos), this.far(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })), false));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(lights, 3));
    this.scene.add(new THREE.Points(g, this.far(new THREE.PointsMaterial({
      color: 0xffc888, size: 3.2, map: glowTexture(), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }), true)));
  }

  /** Острова на западе-северо-западе (в стороне от солнца): скала, зелёная макушка, сосны. */
  private buildIslands(): void {
    const geos: THREE.BufferGeometry[] = [];
    const rng = makeRng(919);
    const at = new THREE.Vector3();
    const isle = (cx: number, cz: number, r: number, h: number, seed: number) => {
      at.set(cx, WATER_Y + h * 0.4, cz);
      const g = new THREE.IcosahedronGeometry(1, 7);
      const p = g.getAttribute('position');
      // сплющенный холм с неровным краем; низ уходит под воду
      for (let v = 0; v < p.count; v++) {
        const x = p.getX(v);
        const y = p.getY(v);
        const z = p.getZ(v);
        const a = Math.atan2(z, x);
        const wob = 1 + 0.16 * Math.sin(a * 3 + seed) + 0.09 * Math.sin(a * 7 + seed * 2) + 0.05 * Math.sin(y * 9 + a * 5);
        const yy = y < 0 ? y * 0.4 : Math.pow(y, 0.8);
        p.setXYZ(v, cx + x * r * wob, WATER_Y + yy * h - h * 0.12, cz + z * r * 0.82 * wob);
      }
      g.computeVertexNormals();
      const n = g.getAttribute('normal');
      // тон — по высоте и крутизне (пока нормали на месте), свет и дымка — в bake
      const tones = Array.from({ length: p.count }, (_, v) => {
        const y = p.getY(v) - WATER_Y;
        const steep = 1 - n.getY(v);
        if (y < 1.4) return C.wetSand;
        if (y > h * 0.3 && steep < 0.5) return patch(p.getX(v) * 4, p.getZ(v) * 4) > 0.5 ? C.forest : C.darkForest;
        return steep > 0.55 ? C.darkRock : C.rock;
      });
      geos.push(bake(g, (v) => tones[v], at));
      // сосны на макушке
      for (let k = 0; k < Math.round(r / 2); k++) {
        const a = rng() * Math.PI * 2;
        const rr = Math.sqrt(rng()) * r * 0.5;
        const th = 6 + rng() * 6;
        const top = WATER_Y + h * 0.84 * (1 - (rr / r) ** 2) - h * 0.12;
        const cone = place(new THREE.ConeGeometry(1.7 + rng(), th, 6).toNonIndexed(), cx + Math.cos(a) * rr, top + th / 2 - 0.8, cz + Math.sin(a) * rr * 0.8);
        geos.push(bake(cone, () => C.darkForest, at));
      }
    };
    // солнце — на западе-юго-западе (−72° от юга); острова севернее, в 30–45° от него
    isle(-470, -75, 48, 26, 1.3);
    isle(-585, -260, 32, 19, 2.9);
    isle(-395, -175, 14, 9, 4.4);
    this.scene.add(staticMesh(mergeColored(geos), this.far(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })), false));
  }

  /** Парусники: белые паруса, ходят по заливу туда и обратно; дымка на них — по расстоянию, каждый кадр. */
  private buildSails(): void {
    const routes: Array<[number, number, number, number, number, number, number, number]> = [
      // откуда (x, z), куда (x, z), размер, скорость (м/с), корпус, полоса
      [-950, 200, -280, 360, 1.1, 2.4, 0xf5f5f2, 0x2a5fa8],
      [-150, 430, 560, 380, 1.2, 1.7, 0xf2efe8, 0xb8322a],
      [-900, -420, -360, 160, 1, 2.8, 0x2a4f7a, 0xf2efe8],
      [250, 540, 950, 330, 1.1, 2, 0xf5f5f2, 0x2f8a4a],
    ];
    // мачта, грот и стаксель (два треугольника) — одной геометрией; нос — к −z
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.3, -0.5, 0, 11, -0.6, 0, 1.4, 3.3, 0, 1.3, -1, 0, 9.8, -0.75, 0, 1.1, -4.1], 3));
    tri.computeVertexNormals();
    const rig = mergeColored([new THREE.CylinderGeometry(0.07, 0.09, 10.5, 5).translate(0, 6, -0.6).toNonIndexed(), tri]);
    routes.forEach(([x0, z0, x1, z1, size, speed, hullHex, stripe], i) => {
      const body = mergeColored([
        paint(new THREE.BoxGeometry(2.2, 1, 8).translate(0, 0.5, 0), hullHex),
        paint(new THREE.BoxGeometry(2.26, 0.2, 8.06).translate(0, 0.85, 0), stripe),
      ]);
      const hull = this.far(new THREE.MeshLambertMaterial({ vertexColors: true, fog: false }));
      const sail = this.far(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, fog: false }));
      const obj = new THREE.Group();
      obj.add(new THREE.Mesh(body, hull), new THREE.Mesh(rig, sail));
      obj.scale.setScalar(size);
      this.scene.add(obj);
      const len = Math.hypot(x1 - x0, z1 - z0);
      this.sails.push({ obj, hull, sail, x0, z0, dx: (x1 - x0) / len, dz: (z1 - z0) / len, len, speed, phase: i * 0.37 });
    });
    this.update(0);
  }

  /** Кадр: парусники идут туда и обратно, чуть кренятся и покачиваются; маяк мигает. */
  update(t: number): void {
    for (const s of this.sails) {
      const run = (t * s.speed + s.phase * s.len) % (2 * s.len);
      const back = run > s.len;
      const along = back ? 2 * s.len - run : run;
      const x = s.x0 + s.dx * along;
      const z = s.z0 + s.dz * along;
      s.obj.position.set(x, WATER_Y - 0.35 + Math.sin(t * 0.9 + s.phase * 7) * 0.12, z);
      // нос (−z) — по ходу
      const yaw = back ? Math.atan2(s.dx, s.dz) : Math.atan2(-s.dx, -s.dz);
      s.obj.rotation.set(0, yaw, (back ? -0.12 : 0.12) + Math.sin(t * 0.7 + s.phase * 5) * 0.03, 'YXZ');
      const k = hazeAt(x, WATER_Y + 4, z);
      s.hull.color.setScalar(1 - k);
      s.hull.emissive.copy(_h).multiplyScalar(k);
      s.sail.color.copy(SAIL_WHITE).multiplyScalar(1 - k);
      s.sail.emissive.copy(s.hull.emissive);
    }
    // вспышка раз в 5 секунд: быстро загорается и гаснет
    const f = (t % 5) / 5;
    this.beacon.opacity = f < 0.12 ? Math.sin((f / 0.12) * Math.PI) * 0.95 : 0;
  }
}
