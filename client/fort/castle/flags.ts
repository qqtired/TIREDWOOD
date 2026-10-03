// Флаги, знамёна и гирлянды на ветру — один меш, один вызов отрисовки: всё полотно в общем атласе, колышется в
// вершинном шейдере (смещение по нормали растёт от древка к краю, нормаль наклоняется — складки ловят свет).
// Ветер дует на запад-юго-запад: флаги развёрнуты к тем, кто подходит к крепости с севера.
import * as THREE from 'three';
import { Bucket, catenary } from './geo.ts';
import { BANNERS, BUNTING, BUNTING_DROP, POLE_FLAGS } from './layout.ts';
import { FLAG_ATLAS, flagAtlas } from './textures.ts';

/** Куда вытягивает флаги ветер */
const WIND = new THREE.Vector3(-1, 0, 0.25).normalize();
const UP = new THREE.Vector3(0, 1, 0);

class FlagGeo {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  wave: number[] = [];
  wave2: number[] = [];
  tan: number[] = [];
  idx: number[] = [];

  /**
   * Сетка nu × nv: точка p(i, j) = o + du·(i/nu) + dv·(j/nv); u-параметр волны — вдоль «от крепления» (along: 'u' или
   * 'v'); n — нормаль лицевой стороны; uv — прямоугольник атласа (u0, v0, u1, v1) — по du и dv.
   */
  sheet(o: THREE.Vector3, du: THREE.Vector3, dv: THREE.Vector3, nu: number, nv: number, uvr: readonly number[], color: THREE.Color,
    along: 'u' | 'v', phase: number, amp: number, speed: number, k: number, droop = 0, shape?: (s: number, t: number) => number, flip = false): void {
    const n = new THREE.Vector3().crossVectors(du, dv).normalize();
    if (flip) n.negate();
    const lenU = du.length();
    const lenV = dv.length();
    const tan = (along === 'u' ? du : dv).clone().normalize();
    const base = this.pos.length / 3;
    const p = new THREE.Vector3();
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const s = i / nu;
        let t = j / nv;
        // форма (вымпел сужается к концу): t сжимается к середине
        if (shape) t = 0.5 + (t - 0.5) * shape(s, t);
        const w = along === 'u' ? s : t;
        p.copy(o).addScaledVector(du, s).addScaledVector(dv, t);
        p.y -= droop * w * w;
        this.pos.push(p.x, p.y, p.z);
        this.nor.push(n.x, n.y, n.z);
        this.uv.push(uvr[0] + (uvr[2] - uvr[0]) * s, uvr[1] + (uvr[3] - uvr[1]) * (j / nv));
        this.col.push(color.r, color.g, color.b);
        this.wave.push(w, phase, amp);
        this.wave2.push(speed, k, 1 / Math.max(0.2, along === 'u' ? lenU : lenV));
        this.tan.push(tan.x, tan.y, tan.z);
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i;
        const b = a + 1;
        const c = a + nu + 2;
        const d = a + nu + 1;
        if (flip) this.idx.push(a, c, b, a, d, c);
        else this.idx.push(a, b, c, a, c, d);
      }
    }
  }

  /** Треугольник (флажок гирлянды): a, b — на шнуре, c — кончик */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color, phase: number): void {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const tan = new THREE.Vector3().subVectors(c, a.clone().add(b).multiplyScalar(0.5)).normalize();
    const base = this.pos.length / 3;
    const W = FLAG_ATLAS.white;
    for (const [p, w] of [[a, 0], [b, 0], [c, 1]] as const) {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push((W[0] + W[2]) / 2, (W[1] + W[3]) / 2);
      this.col.push(color.r, color.g, color.b);
      this.wave.push(w, phase, 0.07);
      this.wave2.push(6.5, 1.2, 1 / 0.4);
      this.tan.push(tan.x, tan.y, tan.z);
    }
    this.idx.push(base, base + 1, base + 2);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aWave', new THREE.Float32BufferAttribute(this.wave, 3));
    g.setAttribute('aWave2', new THREE.Float32BufferAttribute(this.wave2, 3));
    g.setAttribute('aTan', new THREE.Float32BufferAttribute(this.tan, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Материал с ветром: смещение по нормали и наклон нормали в вершинном шейдере */
export function windMaterial(map: THREE.Texture, uTime: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map, vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.82 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aWave;
attribute vec3 aWave2;
attribute vec3 aTan;
uniform float uTime;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
float wPh = uTime * aWave2.x - aWave.x * aWave2.y * 6.2832 + aWave.y;
float wS = sin(wPh) + 0.35 * sin(wPh * 1.7 + 1.3);
float wD = aWave.z * aWave.x * wS;
float wdS = -aWave2.y * 6.2832 * (cos(wPh) + 0.595 * cos(wPh * 1.7 + 1.3));
float wSlope = aWave.z * (wS + aWave.x * wdS) * aWave2.z;
objectNormal = normalize(objectNormal - aTan * wSlope);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed += normal * wD;`);
  };
  m.customProgramCacheKey = () => 'castle-wind';
  return m;
}

const COLORS = [0xd8432f, 0xf2c230, 0x2f66c8, 0xf6f2e6, 0x3c9447].map((c) => new THREE.Color(c));
const PENNANT = [0xd8432f, 0x2f66c8, 0xf2c230, 0x3c9447].map((c) => new THREE.Color(c));
const WHITE = new THREE.Color(1, 1, 1);
const CORD = new THREE.Color(0x4a3a2a);
const ROD = new THREE.Color(0x5a3c22);
const GOLD = new THREE.Color(0xf0c04a);

export interface FlagsOut {
  mesh: THREE.Mesh;
  uTime: { value: number };
  /** древки знамён и навершия (в общий меш без текстуры) */
  dark: Bucket;
}

export function buildFlags(): FlagsOut {
  const fg = new FlagGeo();
  const dark = new Bucket();
  let phase = 0.7;
  // знамёна на стенах: крепление сверху, висят вниз, чуть отходят от стены
  for (const b of BANNERS) {
    const n = new THREE.Vector3(b.nx, 0, b.nz);
    // вправо, если смотреть на знамя снаружи
    const right = new THREE.Vector3(b.nz, 0, -b.nx);
    const o = new THREE.Vector3(b.x, b.top, b.z).addScaledVector(n, 0.07).addScaledVector(right, -b.w / 2);
    const r = FLAG_ATLAS.banner(b.look);
    // du — вправо, dv — вниз (лицо — наружу, поэтому обход перевёрнут); v атласа — сверху вниз
    fg.sheet(o, right.clone().multiplyScalar(b.w), new THREE.Vector3(0, -b.len, 0), 3, 8, [r[0], r[3], r[2], r[1]], WHITE, 'v', phase, 0.06, 1.6, 0.35, 0, undefined, true);
    phase += 1.9;
    // древко с золотыми шишечками и два крюка в стену
    const rod = new THREE.CylinderGeometry(0.03, 0.03, b.w + 0.18, 6).rotateZ(Math.PI / 2);
    rod.rotateY(Math.atan2(right.x, right.z) - Math.PI / 2);
    rod.translate(b.x + n.x * 0.07, b.top + 0.02, b.z + n.z * 0.07);
    dark.geo(rod, ROD);
    for (const s of [-1, 1]) {
      const kx = b.x + right.x * s * (b.w / 2 + 0.11) + n.x * 0.07;
      const kz = b.z + right.z * s * (b.w / 2 + 0.11) + n.z * 0.07;
      dark.geo(new THREE.SphereGeometry(0.05, 8, 6).translate(kx, b.top + 0.02, kz), GOLD);
    }
  }
  // флаги на шестах: от древка по ветру, чуть провисают к краю
  POLE_FLAGS.forEach((f, i) => {
    const top = f.y + f.pole;
    const o = new THREE.Vector3(f.x, top - f.h, f.z).addScaledVector(WIND, 0.05);
    const du = WIND.clone().multiplyScalar(f.w);
    const dv = UP.clone().multiplyScalar(f.h);
    if (f.look === 0) {
      fg.sheet(o, du, dv, 10, 5, FLAG_ATLAS.castle, WHITE, 'u', 0.4, 0.2, 5.2, 1.0, 0.12);
    } else {
      // вымпел: сужается к концу
      const W = FLAG_ATLAS.white;
      fg.sheet(o, du, dv, 8, 2, [W[0], W[1], W[2], W[3]], PENNANT[(f.look - 1) % PENNANT.length], 'u', i * 1.3, 0.09, 6.4, 1.1, 0.05, (s) => 1 - s * 0.92);
    }
  });
  // гирлянды флажков по цепной линии
  for (const s of BUNTING) {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]);
    const n = Math.max(4, Math.round(len / 0.55));
    const pts = catenary(s.a, s.b, s.sag, n * 2);
    for (let i = 0; i < pts.length - 1; i++) {
      // шнур — тонкая вертикальная ленточка
      const a = pts[i];
      const b = pts[i + 1];
      fg.sheet(a.clone().add(new THREE.Vector3(0, 0.012, 0)), b.clone().sub(a), new THREE.Vector3(0, -0.024, 0), 1, 1, [FLAG_ATLAS.white[0], FLAG_ATLAS.white[1], FLAG_ATLAS.white[2], FLAG_ATLAS.white[3]], CORD, 'v', 0, 0, 1, 1);
      if (i % 2 === 0) {
        const m = a.clone().lerp(b, 0.5);
        const dir = new THREE.Vector3().subVectors(b, a).normalize();
        const p0 = m.clone().addScaledVector(dir, -0.17);
        const p1 = m.clone().addScaledVector(dir, 0.17);
        const tip = m.clone().add(new THREE.Vector3(0, -BUNTING_DROP, 0));
        fg.tri(p0, p1, tip, COLORS[(i / 2) % COLORS.length], i * 0.7);
      }
    }
  }
  const uTime = { value: 0 };
  const mesh = new THREE.Mesh(fg.build(), windMaterial(flagAtlas(), uTime));
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  return { mesh, uTime, dark };
}
