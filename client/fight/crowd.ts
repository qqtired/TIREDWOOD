// Толпа вокруг ринга «Fight Club»: плотные ряды желеек (инстансы: тело, глаза, варежки) лицом к рингу. Покачиваются,
// подпрыгивают на ударах, тянут руки вверх, когда жарко, подаются вперёд, когда в них влетел боец. Места первого ряда,
// где стоят настоящие зрители (их желейки рисует match.ts), пустуют. Кто вплотную к камере — прячется.
// Силуэты в полутьме читаются по светлой кайме (rim в шейдере материала).
import * as THREE from 'three';
import { FC_CROWD_SLOTS, FC_ROOM, crowdSpot } from '../../shared/fight.ts';
import { mergeColored, paint } from '../render/kit.ts';
import { bodyProfile } from '../render/outfit3d.ts';
import { seeded } from './paint.ts';
import type { FightVisualBudget } from './quality.ts';

const MAX = 340;
/** Приглушённые цвета: в подвале никто не наряжается */
const COLORS = [0x6b5a4a, 0x4f5a52, 0x7a4a3a, 0x5a5f6a, 0x8a7a5a, 0x3f4a44, 0x6a3f46, 0x7f7a6a, 0x4a4038, 0x5f6f5a, 0x8a5a4a, 0x46505a, 0x9a8a6a, 0x5a4a5f];
const GRAVITY = 11;
/** Варежки светлее тела: поднятые руки ловят свет и читаются как руки, а не тёмные шарики */
const MITT = new THREE.Color(0xd8ccb4);
/** Кто ближе к камере (квадрат расстояния) — прячется: камера бойца у края ринга заходит в первые ряды */
const HIDE_NEAR = 4.6;

interface Member {
  x: number;
  z: number;
  /** Направление к центру (единичное) */
  nx: number;
  nz: number;
  yaw: number;
  row: number;
  h: number;
  phase: number;
  /** Высота прыжка и скорость */
  jump: number;
  jv: number;
  squash: number;
  squashV: number;
  /** Руки вверх 0…1 */
  arms: number;
  /** Насколько заводной */
  temper: number;
  /** Подался вперёд (влетел боец) 0…1 */
  push: number;
  /** Место первого ряда (−1 — не место для зрителя) */
  slot: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _hand = new THREE.Vector3();
const _c = new THREE.Color();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _hm = new THREE.Matrix4();

export class Crowd {
  readonly group = new THREE.Group();
  private readonly body: THREE.InstancedMesh;
  private readonly eyes: THREE.InstancedMesh;
  private readonly mitts: THREE.InstancedMesh;
  private members: Member[] = [];
  /** Жар толпы: растёт от ударов и нокаутов, остывает сам */
  heat = 0.25;
  /** Места первого ряда, занятые настоящими зрителями (биты) */
  private taken = 0;
  private rows = 4;
  private hz = 60;
  private visibleCount = 0;
  private debt = 0;
  private forceUpdate = true;

  constructor() {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0 });
    const rim = { value: new THREE.Color(0x9fb8a0).multiplyScalar(0.55) };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRim = rim;
      shader.fragmentShader = 'uniform vec3 uRim;\n' + shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  float rimK = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);\n  totalEmissiveRadiance += uRim * pow(rimK, 2.6);',
      );
    };
    mat.customProgramCacheKey = () => 'fc-crowd-rim';
    this.body = new THREE.InstancedMesh(new THREE.LatheGeometry(bodyProfile(), 12), mat, MAX);
    this.body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.body.setColorAt(0, _c.set(0xffffff));
    this.body.frustumCulled = false;
    // глаза: белки с чёрными зрачками, чуть светятся в темноте
    const parts: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      const w = paint(new THREE.SphereGeometry(0.075, 10, 8), 0xf2eee2);
      w.scale(1, 1.15, 0.6);
      w.translate(sx * 0.13, 1.17, -0.37);
      parts.push(w);
      const p = paint(new THREE.SphereGeometry(0.036, 8, 6), 0x111111);
      p.translate(sx * 0.13, 1.16, -0.41);
      parts.push(p);
    }
    this.eyes = new THREE.InstancedMesh(mergeColored(parts), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x222222 }), MAX);
    this.eyes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eyes.frustumCulled = false;
    this.mitts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 10, 8), mat, MAX * 2);
    this.mitts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mitts.setColorAt(0, _c.set(0xffffff));
    this.mitts.frustumCulled = false;
    this.group.add(this.body, this.eyes, this.mitts);
    this.setRing(5);
  }

  /** Ряды вокруг ринга радиуса R: первый — 16 мест для зрителей и желейки между ними, дальше — плотнее и темнее. */
  setRing(R: number): void {
    const rnd = seeded(Math.round(R * 100));
    const list: Member[] = [];
    const add = (x: number, z: number, row: number, slot: number) => {
      if (list.length >= MAX) return;
      const d = Math.hypot(x, z) || 1;
      list.push({
        x, z, nx: -x / d, nz: -z / d, yaw: Math.atan2(x, z), row, h: 0.88 + rnd() * 0.24, phase: rnd() * 100, jump: 0, jv: 0,
        squash: 0, squashV: 0, arms: 0, temper: 0.35 + rnd() * 0.65, push: 0, slot,
      });
    };
    // первый ряд: места зрителей и желейки между ними
    const r0 = R + 0.75;
    for (let s = 0; s < FC_CROWD_SLOTS; s++) {
      const a = crowdSpot(s, R);
      add(a.x, a.z, 0, s);
      const b = crowdSpot((s + 1) % FC_CROWD_SLOTS, R);
      const a0 = Math.atan2(a.x, a.z);
      let a1 = Math.atan2(b.x, b.z);
      if (a1 <= a0) a1 += Math.PI * 2;
      const gap = (a1 - a0) * r0;
      const n = Math.max(0, Math.round(gap / 0.74) - 1);
      for (let k = 1; k <= n; k++) {
        const t = a0 + ((a1 - a0) * k) / (n + 1);
        add(Math.sin(t) * r0, Math.cos(t) * r0, 0, -1);
      }
    }
    // задние ряды: до стен подвала
    for (let row = 1; row < 4; row++) {
      const r = R + 0.75 + row * 0.72;
      if (r > FC_ROOM - 0.7) break;
      const n = Math.floor((Math.PI * 2 * r) / (0.7 + row * 0.04));
      const off = rnd() * 6;
      for (let k = 0; k < n; k++) {
        if (row === 3 && rnd() < 0.35) continue;
        const t = off + (k / n) * Math.PI * 2 + (rnd() - 0.5) * 0.04;
        const rr = r + (rnd() - 0.5) * 0.16;
        // у лестницы, у стойки бара — проход: там не стоят
        const x = Math.sin(t) * rr;
        const z = Math.cos(t) * rr;
        if (x > 3.7 && x < 6.7 && z < -6.8) continue;
        add(x, z, row, -1);
      }
    }
    this.members = list;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      _c.set(COLORS[Math.floor(rnd() * COLORS.length)]).multiplyScalar((0.85 + rnd() * 0.3) * (1 - m.row * 0.08));
      this.body.setColorAt(i, _c);
      _c.lerp(MITT, 0.45);
      this.mitts.setColorAt(i * 2, _c);
      this.mitts.setColorAt(i * 2 + 1, _c);
    }
    this.applyCounts();
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    if (this.mitts.instanceColor) this.mitts.instanceColor.needsUpdate = true;
  }

  /** Какие места первого ряда заняты настоящими зрителями (биты 0…15). */
  setTaken(mask: number): void {
    if (this.taken !== mask) this.forceUpdate = true;
    this.taken = mask;
  }

  setQuality(budget: FightVisualBudget): void {
    this.rows = budget.crowdRows;
    this.hz = budget.crowdHz;
    this.applyCounts();
  }

  private applyCounts(): void {
    const end = this.members.findIndex((m) => m.row >= this.rows);
    this.visibleCount = end < 0 ? this.members.length : end;
    this.body.count = this.eyes.count = this.visibleCount;
    this.mitts.count = this.visibleCount * 2;
    this.forceUpdate = true;
  }

  debugState(): Record<string, unknown> {
    return { rows: this.rows, hz: this.hz, visible: this.visibleCount, total: this.members.length };
  }

  /** Всплеск: k — сила (удар 0,2, тяжёлый 0,5, нокаут 1); рядом с (x, z) — сильнее и сразу. */
  excite(k: number, x?: number, z?: number): void {
    this.heat = Math.min(1.6, this.heat + k * 0.45);
    for (const m of this.members) {
      let p = k * m.temper * 0.5;
      if (x !== undefined && z !== undefined) {
        const d = Math.hypot(m.x - x, m.z - z);
        p += Math.max(0, 1 - d / 5) * k;
      }
      if (m.jump === 0 && Math.random() < p) m.jv = 2 + Math.random() * 1.6 * Math.min(1.4, k + 0.4);
    }
  }

  /** В толпу влетел боец у (x, z): ближние подаются вперёд и отпихивают. */
  shove(x: number, z: number): void {
    for (const m of this.members) {
      const d = Math.hypot(m.x - x, m.z - z);
      if (d < 2) m.push = Math.max(m.push, 1 - d / 2);
    }
    this.excite(0.3, x, z);
  }

  update(dt: number, time: number, cam: THREE.Vector3): void {
    this.heat = Math.max(0.2, this.heat - dt * 0.22);
    this.debt += dt;
    if (!this.forceUpdate && this.debt < 1 / this.hz) return;
    dt = Math.min(0.1, this.debt);
    this.debt = 0;
    this.forceUpdate = false;
    const heat = this.heat;
    for (let i = 0; i < this.visibleCount; i++) {
      const m = this.members[i];
      // прыжки: чем жарче, тем чаще
      if (m.jump === 0 && m.jv === 0 && Math.random() < dt * heat * heat * m.temper * 1.4) m.jv = 1.6 + Math.random() * 1.2;
      if (m.jv !== 0 || m.jump > 0) {
        m.jv -= GRAVITY * dt;
        m.jump += m.jv * dt;
        if (m.jump <= 0) {
          m.jump = 0;
          m.squashV -= Math.min(2.5, Math.abs(m.jv) * 0.5);
          m.jv = 0;
        }
      }
      m.squashV += (-m.squash * 160 - m.squashV * 10) * dt;
      m.squash += m.squashV * dt;
      m.arms += ((heat * m.temper > 0.5 ? 1 : 0) - m.arms) * Math.min(1, dt * 4);
      m.push = Math.max(0, m.push - dt * 1.8);
      let hide = m.slot >= 0 && (this.taken & (1 << m.slot)) !== 0;
      const cx = cam.x - m.x;
      const cz = cam.z - m.z;
      if (cx * cx + cz * cz < HIDE_NEAR) hide = true;
      if (hide) {
        this.body.setMatrixAt(i, _zero);
        this.eyes.setMatrixAt(i, _zero);
        this.mitts.setMatrixAt(i * 2, _zero);
        this.mitts.setMatrixAt(i * 2 + 1, _zero);
        continue;
      }
      const t = time + m.phase;
      const bob = Math.sin(t * (2.2 + m.temper)) * 0.025 * (0.5 + heat);
      const sway = Math.sin(t * 0.9) * 0.08;
      const lean = 0.18 * m.push;
      _p.set(m.x + m.nx * lean, m.jump + Math.max(0, bob), m.z + m.nz * lean);
      _e.set(-0.12 * m.push - 0.05 * heat * m.temper, m.yaw + sway, 0, 'YXZ');
      _q.setFromEuler(_e);
      const sq = m.squash + bob * 0.6;
      _s.set(m.h * (1 - sq * 0.5), m.h * (1 + sq), m.h * (1 - sq * 0.5));
      _m.compose(_p, _q, _s);
      this.body.setMatrixAt(i, _m);
      this.eyes.setMatrixAt(i, _m);
      // руки: внизу не видны (как у желеек на набережной), вверху — качают в такт
      if (m.arms < 0.05) {
        this.mitts.setMatrixAt(i * 2, _zero);
        this.mitts.setMatrixAt(i * 2 + 1, _zero);
        continue;
      }
      const pump = Math.sin(t * 8) * 0.1 * m.arms;
      for (let k = 0; k < 2; k++) {
        const sx = k === 0 ? -1 : 1;
        _hand.set(sx * (0.36 + 0.08 * m.arms), 0.8 + 0.75 * m.arms + (k === 0 ? pump : -pump), -0.18);
        _hand.applyMatrix4(_m);
        _q.identity();
        _s.setScalar(m.h * (0.6 + 0.4 * m.arms));
        this.mitts.setMatrixAt(i * 2 + k, _hm.compose(_hand, _q, _s));
      }
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.eyes.instanceMatrix.needsUpdate = true;
    this.mitts.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.body.geometry.dispose();
    this.eyes.geometry.dispose();
    this.mitts.geometry.dispose();
    (this.body.material as THREE.Material).dispose();
    (this.eyes.material as THREE.Material).dispose();
  }
}
