// Броски «Крепости» на экране: плевок варенья, камень Валуна, чернила Кракена, метеор — летят дугой от A к B за
// заданное время (то же, что у сервера: метка на земле заполняется к моменту удара). Пулы инстансов, без аллокаций
// в кадре; по прилёте — onLand (брызги, кляксы, тряска — у match.ts).
import * as THREE from 'three';

export const PJ_GLOB = 0;
export const PJ_ROCK = 1;
export const PJ_INK = 2;
export const PJ_METEOR = 3;
const KINDS = 4;
const CAP = 24;

interface Shot {
  kind: number;
  fx: number;
  fy: number;
  fz: number;
  tx: number;
  ty: number;
  tz: number;
  t: number;
  dur: number;
  arc: number;
  spin: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class Projectiles {
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly shots: Shot[] = [];
  /** Прилетел (ставит match.ts: брызги, звук, тряска) и след в полёте (дым метеора, пыль камня) */
  onLand: (kind: number, x: number, y: number, z: number) => void = () => {};
  trail: (kind: number, x: number, y: number, z: number) => void = () => {};
  private trailT = 0;

  constructor(scene: THREE.Scene) {
    const geos: THREE.BufferGeometry[] = [
      new THREE.SphereGeometry(0.24, 10, 8).scale(1, 0.85, 1.25),
      new THREE.DodecahedronGeometry(0.75, 0),
      new THREE.SphereGeometry(0.3, 10, 8).scale(1, 0.8, 1.3),
      new THREE.IcosahedronGeometry(0.55, 0),
    ];
    const mats: THREE.Material[] = [
      new THREE.MeshStandardMaterial({ color: 0xb02a48, roughness: 0.25 }),
      new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.9, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x5a2f6e, roughness: 0.3 }),
      new THREE.MeshStandardMaterial({ color: 0xff7a2c, emissive: 0xff4a10, emissiveIntensity: 0.9, roughness: 0.6, flatShading: true }),
    ];
    for (let k = 0; k < KINDS; k++) {
      const m = new THREE.InstancedMesh(geos[k], mats[k], CAP);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      this.meshes.push(m);
      scene.add(m);
    }
  }

  /** Бросок: из (fx, fy, fz) в (tx, ty, tz) за seconds; arc — высота дуги в долях пути (не меньше 1,5 м) */
  launch(kind: number, fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, seconds: number, arc = 0.3): void {
    if (kind < 0 || kind >= KINDS || this.shots.length >= CAP * KINDS) return;
    const dist = Math.hypot(tx - fx, tz - fz);
    this.shots.push({ kind, fx, fy, fz, tx, ty, tz, t: 0, dur: Math.max(0.05, seconds), arc: Math.max(1.5, dist * arc), spin: Math.random() * 6 });
  }

  update(dt: number): void {
    const counts = [0, 0, 0, 0];
    this.trailT -= dt;
    const trail = this.trailT <= 0;
    if (trail) this.trailT = 0.05;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.t += dt;
      const u = s.t / s.dur;
      if (u >= 1) {
        this.shots.splice(i, 1);
        this.onLand(s.kind, s.tx, s.ty, s.tz);
        continue;
      }
      const x = s.fx + (s.tx - s.fx) * u;
      const y = s.fy + (s.ty - s.fy) * u + 4 * s.arc * u * (1 - u);
      const z = s.fz + (s.tz - s.fz) * u;
      const n = counts[s.kind];
      if (n >= CAP) continue;
      _e.set(s.spin + s.t * 5, s.spin * 0.7 + s.t * 3, 0);
      _q.setFromEuler(_e);
      const k = s.kind === PJ_METEOR ? 1 + 0.15 * Math.sin(s.t * 40) : 1;
      _m.compose(_p.set(x, y, z), _q, _s.set(k, k, k));
      this.meshes[s.kind].setMatrixAt(n, _m);
      counts[s.kind]++;
      if (trail && (s.kind === PJ_METEOR || s.kind === PJ_ROCK)) this.trail(s.kind, x, y, z);
    }
    for (let k = 0; k < KINDS; k++) {
      const m = this.meshes[k];
      m.count = counts[k];
      if (counts[k]) m.instanceMatrix.needsUpdate = true;
    }
  }

  clear(): void {
    this.shots.length = 0;
    for (const m of this.meshes) m.count = 0;
  }
}
