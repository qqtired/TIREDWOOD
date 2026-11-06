// «Город вверх»: всё, что под трассой и вокруг неё, — море, берег с набережной, городок домами-инстансами, деревья,
// холмы, облака на высоте 140–270 м, чайки и дымки из труб. Всё дёшево: по одной отрисовке на вид предмета.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeSea, type SkyPalette } from '../../render/sky.ts';
import { hash, K, WALLS } from './kit.ts';

export const SEA_Y = -2;
/** Земля городка */
export const GROUND_Y = 0;

export interface EnvPlan {
  /** Береговая линия: севернее (z меньше) — земля */
  coast: number;
  /** Прямоугольники в плане, где нельзя ставить дома (под трассой), [x0, z0, x1, z1] */
  avoid: Array<[number, number, number, number]>;
  /** Пирсы-причалы порта (бетон, верх — y) */
  jetties: Array<{ x0: number; z0: number; x1: number; z1: number; y: number }>;
  /** Высоты, где кружат чайки, и центр трассы */
  center: [number, number];
  /** Трубы со стопок домов — из них идёт дымок */
  chimneys: Array<[number, number, number]>;
}

function windowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) {
    const x = i * 64 + 20, y = k * 64 + 16;
    g.fillStyle = '#f7f2e8';
    g.fillRect(x - 4, y - 4, 32, 42);
    g.fillStyle = (i + k) % 3 ? '#4a5f6c' : '#5d7380';
    g.fillRect(x, y, 24, 34);
    g.fillStyle = (i * 3 + k) % 2 ? '#5f9a6e' : '#c26a48';
    g.fillRect(x - 13, y, 9, 34);
    g.fillRect(x + 28, y, 9, 34);
  }
  // цоколь
  g.fillStyle = '#d9cbb3';
  g.fillRect(0, 248, 256, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Щипцовая крыша единичного размера: x, z ∈ [−0.5, 0.5], y ∈ [0, 1], конёк вдоль x. */
function gableGeometry(): THREE.BufferGeometry {
  const v = [
    // скаты
    -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0, -0.5, 0, -0.5, 0.5, 1, 0, 0.5, 0, -0.5,
    -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0, -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0,
    // щипцы
    -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 0, -0.5, 0.5, 1, 0, 0.5, 0, 0.5,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

interface Gull { cx: number; cz: number; y: number; r: number; speed: number; phase: number }
interface Smoke { x: number; y: number; z: number; phase: number }

export class ClimbEnv {
  readonly root = new THREE.Group();
  readonly sea: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly town: THREE.Group = new THREE.Group();
  private readonly clouds: THREE.InstancedMesh;
  private readonly gulls: THREE.InstancedMesh;
  private readonly gullList: Gull[] = [];
  private readonly smoke: THREE.InstancedMesh;
  private readonly smokes: Smoke[] = [];
  private readonly dummy = new THREE.Object3D();

  constructor(palette: SkyPalette, plan: EnvPlan) {
    this.sea = makeSea(palette);
    this.sea.position.y = SEA_Y;
    this.root.add(this.sea);
    this.buildLand(plan);
    this.buildTown(plan);
    this.root.add(this.town);
    this.clouds = this.buildClouds(plan);
    this.gulls = this.buildGulls(plan);
    this.smoke = this.buildSmoke(plan);
  }

  private buildLand(plan: EnvPlan): void {
    // земля: от берега на север, с лёгкими пятнами (мостовая у берега, трава дальше)
    const W = 2400, Dz = 1400 + plan.coast;
    const g = new THREE.PlaneGeometry(W, Dz, 48, 28);
    g.rotateX(-Math.PI / 2);
    g.translate(0, GROUND_Y, plan.coast - Dz / 2);
    const p = g.getAttribute('position');
    const col = new Float32Array(p.count * 3);
    const pave = new THREE.Color(0xd9c9a9), grass = new THREE.Color(0x9fbf7a), dry = new THREE.Color(0xc4c486), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const d = Math.hypot(x * 0.8, z - plan.coast + 60);
      const k = THREE.MathUtils.smoothstep(d, 160, 420);
      c.copy(pave).lerp(hash(i) < 0.5 ? grass : dry, k);
      // холмы на севере поднимаются
      const hill = Math.max(0, -z - 380) * 0.18 * (0.6 + 0.4 * Math.sin(x * 0.012));
      p.setY(i, GROUND_Y + hill);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const land = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    land.receiveShadow = true;
    land.matrixAutoUpdate = false;
    this.root.add(land);
    // набережная: каменная стенка по берегу и белый парапет; пирсы порта — бетонные причалы на сваях
    const parts: THREE.BufferGeometry[] = [];
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): void => {
      const b = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
      b.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      const nb = b.toNonIndexed();
      const cc = new THREE.Color(color), arr = new Float32Array(nb.getAttribute('position').count * 3);
      for (let i = 0; i < arr.length; i += 3) arr.set([cc.r, cc.g, cc.b], i);
      nb.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      nb.deleteAttribute('uv');
      parts.push(nb);
    };
    box(-W / 2, SEA_Y - 4, plan.coast - 3, W / 2, GROUND_Y - 0.02, plan.coast, 0xb8ab95);
    box(-W / 2, GROUND_Y - 0.02, plan.coast - 0.6, W / 2, GROUND_Y + 0.5, plan.coast, 0xf1e8d6);
    for (const j of plan.jetties) {
      box(j.x0, SEA_Y - 3, j.z0, j.x1, j.y - 0.02, j.z1, 0xb4ab9c);
      box(j.x0 - 0.1, j.y - 0.7, j.z0 - 0.1, j.x1 + 0.1, j.y - 0.12, j.z1 + 0.1, 0x8f877b);
      // кранцы-покрышки по краю
      for (let x = j.x0 + 2; x < j.x1 - 1; x += 4) box(x - 0.35, j.y - 1.4, j.z1 + 0.1, x + 0.35, j.y - 0.7, j.z1 + 0.35, 0x2f2f30);
    }
    // волнорез и маяк на мысу (видно с вершины)
    box(140, SEA_Y - 3, plan.coast, 152, GROUND_Y + 0.8, plan.coast + 160, 0xb7ad9c);
    const lh = new THREE.CylinderGeometry(3.2, 4.2, 26, 16);
    lh.translate(146, 13, plan.coast + 166);
    const lhc = lh.toNonIndexed(), lp = lhc.getAttribute('position'), larr = new Float32Array(lp.count * 3);
    for (let i = 0; i < lp.count; i++) { const cc = new THREE.Color(Math.floor(lp.getY(i) / 4.4) % 2 ? K.red : K.white); larr.set([cc.r, cc.g, cc.b], i * 3); }
    lhc.setAttribute('color', new THREE.BufferAttribute(larr, 3));
    lhc.deleteAttribute('uv');
    parts.push(lhc);
    // холмы с рощами — силуэт на горизонте
    for (let i = 0; i < 7; i++) {
      const s = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      s.scale(160 + hash(i) * 120, 60 + hash(i + 9) * 50, 90 + hash(i + 3) * 60);
      s.translate(-600 + i * 200 + hash(i + 5) * 60, GROUND_Y - 2, -520 - hash(i + 2) * 200);
      const ns = s.toNonIndexed(), sp = ns.getAttribute('position'), sarr = new Float32Array(sp.count * 3);
      for (let k = 0; k < sp.count; k++) { const cc = new THREE.Color(0x8fb070).lerp(new THREE.Color(0x6f9a5c), sp.getY(k) / 110); sarr.set([cc.r, cc.g, cc.b], k * 3); }
      ns.setAttribute('color', new THREE.BufferAttribute(sarr, 3));
      ns.deleteAttribute('uv');
      parts.push(ns);
    }
    const m = new THREE.Mesh(mergeGeometries(parts, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    this.root.add(m);
  }

  private buildTown(plan: EnvPlan): void {
    const free = (x: number, z: number, r: number): boolean => {
      for (const [x0, z0, x1, z1] of plan.avoid) if (x + r > x0 && x - r < x1 && z + r > z0 && z - r < z1) return false;
      return true;
    };
    const types = [
      { w: 6, h: 8, d: 6, rows: 3, cols: 2 },
      { w: 9, h: 12, d: 7, rows: 4, cols: 3 },
      { w: 5, h: 5.5, d: 5, rows: 2, cols: 2 },
    ];
    const tex = windowTexture();
    const bodyMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ roughness: 0.7, color: 0xffffff });
    const list: Array<Array<{ x: number; z: number; ry: number; s: number; col: number; roof: number }>> = [[], [], []];
    let n = 0;
    for (let gx = -300; gx <= 300; gx += 13) {
      for (let gz = -440; gz <= plan.coast - 10; gz += 13) {
        n++;
        if (hash(n * 3) < 0.22) continue;
        const x = gx + (hash(n) - 0.5) * 5, z = gz + (hash(n + 1) - 0.5) * 5;
        // улицы: каждая пятая полоса пустая
        if (Math.abs(((gx + 300) / 13) % 5) < 0.5 || Math.abs(((gz + 440) / 13) % 6) < 0.5) continue;
        const t = Math.floor(hash(n + 2) * 3);
        if (!free(x, z, 8)) continue;
        // дальше от центра и на холмах — реже и ниже
        const far = Math.hypot(x, z - plan.coast);
        if (far > 260 && hash(n + 4) < 0.5) continue;
        list[t].push({ x, z, ry: hash(n + 5) < 0.5 ? 0 : Math.PI / 2, s: 0.85 + hash(n + 6) * 0.35, col: WALLS[Math.floor(hash(n + 7) * WALLS.length)], roof: [0xc0643f, 0xb8553a, 0xa94b35, 0xcf7a52][Math.floor(hash(n + 8) * 4)] });
      }
    }
    const roofGeo = gableGeometry();
    for (let t = 0; t < 3; t++) {
      const T = types[t], L = list[t];
      if (!L.length) continue;
      const g = new THREE.BoxGeometry(1, 1, 1);
      g.translate(0, 0.5, 0);
      // окна по сторонам: UV — столбцов и этажей
      const uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * T.cols / 4 * 2, uv.getY(i) * T.rows / 4);
      const body = new THREE.InstancedMesh(g, bodyMat, L.length);
      const roof = new THREE.InstancedMesh(roofGeo, roofMat, L.length);
      const c = new THREE.Color();
      L.forEach((h, i) => {
        this.dummy.position.set(h.x, GROUND_Y, h.z);
        this.dummy.rotation.set(0, h.ry, 0);
        this.dummy.scale.set(T.w * h.s, T.h * h.s, T.d * h.s);
        this.dummy.updateMatrix();
        body.setMatrixAt(i, this.dummy.matrix);
        body.setColorAt(i, c.setHex(h.col));
        this.dummy.position.set(h.x, GROUND_Y + T.h * h.s, h.z);
        this.dummy.scale.set(T.w * h.s + 0.6, 2.6 * h.s, T.d * h.s + 0.6);
        this.dummy.updateMatrix();
        roof.setMatrixAt(i, this.dummy.matrix);
        roof.setColorAt(i, c.setHex(h.roof));
      });
      body.receiveShadow = true;
      roof.receiveShadow = true;
      this.town.add(body, roof);
    }
    // деревья: кипарисы и круглые кроны
    const trunk = new THREE.CylinderGeometry(0.18, 0.25, 2, 5);
    trunk.translate(0, 1, 0);
    const crown = new THREE.IcosahedronGeometry(1.8, 0);
    crown.translate(0, 3.4, 0);
    const paint = (geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
      const ng = geo.toNonIndexed(), cc = new THREE.Color(hex), arr = new Float32Array(ng.getAttribute('position').count * 3);
      for (let i = 0; i < arr.length; i += 3) arr.set([cc.r, cc.g, cc.b], i);
      ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      ng.deleteAttribute('uv');
      return ng;
    };
    const treeGeo = mergeGeometries([paint(trunk, 0x7a5a3c), paint(crown, 0x5f9a52)], false)!;
    const trees: Array<[number, number, number]> = [];
    for (let i = 0; i < 260; i++) {
      const x = (hash(i * 11) - 0.5) * 620, z = -460 + hash(i * 13) * (plan.coast + 440);
      if (!free(x, z, 3)) continue;
      trees.push([x, z, 0.8 + hash(i * 17) * 0.8]);
    }
    const tm = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), trees.length);
    trees.forEach(([x, z, s], i) => {
      this.dummy.position.set(x, GROUND_Y, z);
      this.dummy.rotation.set(0, i, 0);
      this.dummy.scale.set(s, s * (i % 3 ? 1 : 1.8), s);
      this.dummy.updateMatrix();
      tm.setMatrixAt(i, this.dummy.matrix);
    });
    this.town.add(tm);
  }

  private buildClouds(plan: EnvPlan): THREE.InstancedMesh {
    // облако из 8 шаров (икосаэдр 1-го уровня) — дёшево и издалека так же пышно
    const balls: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) {
      const g = new THREE.IcosahedronGeometry(i === 0 ? 0.62 : 0.32 + hash(i * 3) * 0.25, 1);
      const a = i * 2.1, d = i === 0 ? 0 : 0.35 + hash(i) * 0.45;
      g.scale(1, 0.55, 1);
      g.translate(Math.cos(a) * d, (hash(i + 4) - 0.3) * 0.18, Math.sin(a) * d * 0.8);
      const ng = g.toNonIndexed();
      ng.deleteAttribute('uv');
      const pos = ng.getAttribute('position'), col = new Float32Array(pos.count * 3);
      for (let k = 0; k < pos.count; k++) { const l = THREE.MathUtils.clamp(0.82 + pos.getY(k) * 0.5, 0.74, 1.04); col.set([l * 0.97, l * 0.985, Math.min(1.04, l * 1.03)], k * 3); }
      ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
      balls.push(ng);
    }
    const geo = mergeGeometries(balls, false)!;
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: 0x8a96a6, emissiveIntensity: 0.25 }), 40);
    let k = 0;
    for (let i = 0; k < 40 && i < 400; i++) {
      const a = i * 2.39996, r = 70 + hash(i * 5) * 420;
      const x = plan.center[0] + Math.cos(a) * r, z = plan.center[1] + Math.sin(a) * r * 0.8;
      if (!plan.avoid.every(([x0, z0, x1, z1]) => x + 30 < x0 - 20 || x - 30 > x1 + 20 || z + 25 < z0 - 20 || z - 25 > z1 + 20)) continue;
      const s = 18 + hash(i * 7) * 26;
      this.dummy.position.set(x, 120 + hash(i * 3) * 150, z);
      this.dummy.rotation.set(0, a, 0);
      this.dummy.scale.set(s, s * (0.7 + hash(i) * 0.4), s);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(k++, this.dummy.matrix);
    }
    mesh.count = k;
    this.root.add(mesh);
    return mesh;
  }

  private buildGulls(plan: EnvPlan): THREE.InstancedMesh {
    const body = new THREE.SphereGeometry(0.16, 6, 4);
    body.scale(1, 0.8, 2.2);
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, -0.18, 0.95, 0.12, 0.05, 0, 0, 0.2, 0.95, 0.12, 0.05, 0.55, 0.06, 0.22, 0, 0, 0.2,
      0, 0, -0.18, 0, 0, 0.2, -0.95, 0.12, 0.05, -0.95, 0.12, 0.05, 0, 0, 0.2, -0.55, 0.06, 0.22,
    ], 3));
    wing.computeVertexNormals();
    const bodyN = body.toNonIndexed();
    bodyN.deleteAttribute('uv');
    const geo = mergeGeometries([bodyN, wing], false)!;
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xf4f1ea, side: THREE.DoubleSide }), 26);
    for (let i = 0; i < 26; i++) {
      this.gullList.push({
        cx: plan.center[0] + (hash(i * 7) - 0.5) * 90, cz: plan.center[1] + (hash(i * 9) - 0.5) * 160,
        y: 8 + hash(i * 3) * 290, r: 12 + hash(i * 5) * 30, speed: (6 + hash(i) * 4) * (hash(i + 1) < 0.5 ? -1 : 1), phase: hash(i + 2) * 100,
      });
    }
    this.root.add(mesh);
    return mesh;
  }

  private buildSmoke(plan: EnvPlan): THREE.InstancedMesh {
    const geo = new THREE.IcosahedronGeometry(0.5, 1);
    const n = Math.min(plan.chimneys.length, 24) * 6;
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xf2efe8, transparent: true, opacity: 0.6, depthWrite: false }), Math.max(1, n));
    for (const [x, y, z] of plan.chimneys.slice(0, 24)) for (let k = 0; k < 6; k++) this.smokes.push({ x, y, z, phase: k / 6 + hash(x * 13 + z) * 0.2 });
    mesh.count = this.smokes.length;
    this.root.add(mesh);
    return mesh;
  }

  /** t — секунды */
  update(t: number): void {
    this.sea.material.uniforms.uTime.value = t;
    const d = this.dummy;
    this.gullList.forEach((g, i) => {
      const a = (t * g.speed) / g.r + g.phase;
      d.position.set(g.cx + Math.cos(a) * g.r, g.y + Math.sin(t * 0.4 + g.phase) * 1.5, g.cz + Math.sin(a) * g.r);
      const dir = g.speed > 0 ? 1 : -1;
      d.rotation.set(0, Math.atan2(Math.sin(a) * dir, -Math.cos(a) * dir), -0.25 * dir);
      const flap = Math.sin(t * 7 + g.phase) > -0.2 ? 0.6 + Math.sin(t * 9 + g.phase) * 0.6 : 0.4;
      d.scale.set(1.4, 1.4 * flap, 1.4);
      d.updateMatrix();
      this.gulls.setMatrixAt(i, d.matrix);
    });
    this.gulls.instanceMatrix.needsUpdate = true;
    this.smokes.forEach((s, i) => {
      const k = (t * 0.18 + s.phase) % 1;
      d.position.set(s.x + k * 1.6, s.y + k * 4.5, s.z + Math.sin(k * 5 + s.phase * 9) * 0.3);
      d.rotation.set(0, 0, 0);
      const sc = 0.5 + k * 1.6;
      d.scale.set(sc * (1 - k * 0.3), sc * (1 - k * 0.3), sc * (1 - k * 0.3));
      d.updateMatrix();
      this.smoke.setMatrixAt(i, d.matrix);
    });
    this.smoke.instanceMatrix.needsUpdate = true;
  }

  setQuality(low: boolean): void {
    this.clouds.visible = !low;
    this.smoke.visible = !low;
  }
}
