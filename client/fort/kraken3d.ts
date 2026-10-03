// Кракен на экране — ВРЕМЕННАЯ отрисовка, пока помощник mobs-e не сделал модели (client/fort/mobs/kraken*.ts):
// голова — игрушечный купол с пятнами варенья и большими сиреневыми глазами (смотрит на крепость), щупальце — рука
// из «бусин» от корня в воде (tentacleRoot) к булаве (её положение — в снимке) с присосками. Цвет — по состоянию:
// замах темнеет и краснеет к удару, булава после удара светится голубым (окно), голова открыта — глаза голубые,
// ярость — красноватый отлив, попадание — вспышка. Круги на воде — где всплывёт голова и вынырнет щупальце. Позы —
// интерполяция орды (zombies3d.ts зовёт part() для каждой части Кракена и flush() в конце кадра). Без выделений в кадре.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y } from '../../shared/constants.ts';
import { ZK, ZS_BOSS_OPEN, ZS_KRAKEN_DIVE, ZS_KRAKEN_SPIT, ZS_TENT_REST, ZS_TENT_SLAM, Z_KRAKEN, Z_TENTACLE } from '../../shared/fort.ts';
import { KRAKEN_DIVE_R, KRAKEN_SPIT_TICKS, TENT_WARN_TICKS, tentacleRoot } from '../../shared/fortkraken.ts';
import { ZF_RAGE } from '../../shared/fortnet.ts';

/** Что нужно от позы орды (zombies3d.ts) */
export interface KrakenPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  st: number;
  wind: number;
  tx: number;
  ty: number;
  tz: number;
  stage: number;
  flags: number;
}

const ARMS = 8;
const BEADS = 18;
const SUCKERS = 9;
const RINGS = 10;

const PURPLE = 0x9a55a8;
const RED = 0xd8405a;
const OPEN = 0x5fe3f0;
const RAGE = 0xff5a46;
const WHITE = new THREE.Color(0xffffff);

const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);
const _root = { x: 0, y: 0, z: 0 };
const P0 = new THREE.Vector3();
const P1 = new THREE.Vector3();
const P2 = new THREE.Vector3();
const P3 = new THREE.Vector3();

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

function inst(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, colors: boolean): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (colors) {
    m.setColorAt(0, WHITE);
    m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  }
  m.count = 0;
  m.frustumCulled = false;
  return m;
}

/** Купол головы с пятнами варенья, бровями и ртом-щёлочкой; лицом в −Z, низ хитбокса — y = 0 */
function headGeometry(): THREE.BufferGeometry {
  const k = ZK[Z_KRAKEN];
  const parts: THREE.BufferGeometry[] = [];
  const dome = new THREE.SphereGeometry(1, 36, 24).scale(k.hrx, k.hry, k.hrx).translate(0, k.hcy, 0);
  // светлое брюшко к воде, тёмная макушка — вершинные цвета
  const pos = dome.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x6a2f7e);
  const low = new THREE.Color(0xb27ac0);
  for (let i = 0; i < pos.count; i++) {
    const u = THREE.MathUtils.clamp((pos.getY(i) - k.hcy) / k.hry, -1, 1);
    _c.copy(low).lerp(top, (u + 1) / 2);
    col.set([_c.r, _c.g, _c.b], i * 3);
  }
  dome.setAttribute('color', new THREE.BufferAttribute(col, 3));
  dome.deleteAttribute('uv');
  parts.push(dome.toNonIndexed());
  // пятна варенья на макушке и боках
  const spots: Array<[number, number, number]> = [[0.6, 0.85, 0.2], [-0.9, 0.7, 0.9], [1.4, 0.45, 1.6], [-1.6, 0.4, -0.2], [0.2, 0.55, 2.2], [-0.5, 0.95, -1.2]];
  for (const [sx, sy, sz] of spots) {
    const n = new THREE.Vector3(sx, sy * 2.2, sz).normalize();
    const p = new THREE.Vector3(n.x * k.hrx, k.hcy + n.y * k.hry, n.z * k.hrx);
    const g = new THREE.SphereGeometry(0.42 + Math.abs(sx) * 0.08, 12, 8).scale(1, 0.25, 1);
    g.lookAt(n);
    g.rotateX(Math.PI / 2);
    parts.push(colored(g.translate(p.x, p.y, p.z), 0x4a1f5c));
  }
  // брови-валики над глазами и рот
  for (const side of [-1, 1]) parts.push(colored(new THREE.CapsuleGeometry(0.16, 0.7, 4, 8).rotateZ(Math.PI / 2 + side * 0.35).translate(side * 1.3, k.hcy + 1.95, -3.05), 0x5a2468));
  parts.push(colored(new THREE.TorusGeometry(0.55, 0.11, 6, 16, Math.PI).rotateZ(Math.PI).translate(0, k.hcy + 0.55, -3.45), 0x3a1430));
  return mergeGeometries(parts, false)!;
}

/** Глаз: белок, сиреневая радужка (светится), зрачок; в осях глаза смотрит в −Z */
function eyeWhite(): THREE.BufferGeometry {
  return new THREE.SphereGeometry(0.78, 20, 14).scale(1, 1.08, 0.8);
}

export class Kraken3D {
  private readonly head = new THREE.Group();
  private readonly headMesh: THREE.Mesh;
  private readonly headMat: THREE.MeshStandardMaterial;
  private readonly irisMat: THREE.MeshStandardMaterial;
  private readonly eyes: THREE.Object3D[] = [];
  private readonly beads: THREE.InstancedMesh;
  private readonly suckers: THREE.InstancedMesh;
  private readonly clubs: THREE.InstancedMesh;
  private readonly glow: THREE.InstancedMesh;
  private readonly rings: THREE.InstancedMesh;
  private nArms = 0;
  private nBeads = 0;
  private nSuckers = 0;
  private nGlow = 0;
  private nRings = 0;
  private headSeen = false;
  /** Щупалец на экране в прошлом кадре (для подсказок) */
  arms = 0;

  constructor(scene: THREE.Scene) {
    this.headMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0 });
    this.headMesh = new THREE.Mesh(headGeometry(), this.headMat);
    this.head.add(this.headMesh);
    const white = new THREE.MeshStandardMaterial({ color: 0xf6f2e6, roughness: 0.3 });
    this.irisMat = new THREE.MeshStandardMaterial({ color: 0xc58cff, emissive: 0xb070ff, emissiveIntensity: 0.9, roughness: 0.3 });
    const pupil = new THREE.MeshStandardMaterial({ color: 0x1a0d22, roughness: 0.2 });
    const k = ZK[Z_KRAKEN];
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      eye.add(new THREE.Mesh(eyeWhite(), white));
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12).scale(1, 1, 0.5).translate(0, 0, -0.55), this.irisMat);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8).scale(1, 1.3, 0.5).translate(0, 0, -0.74), pupil);
      eye.add(iris, dot);
      // сонное веко сверху, как у всей армии Барона
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.82, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.9, 0.86).rotateX(-0.35), new THREE.MeshStandardMaterial({ color: 0x6a2f7e, roughness: 0.45 }));
      lid.name = 'lid';
      eye.add(lid);
      eye.position.set(side * 1.3, k.hcy + 1.35, -2.95);
      this.eyes.push(eye);
      this.head.add(eye);
    }
    this.head.visible = false;
    scene.add(this.head);

    this.beads = inst(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.4 }), ARMS * BEADS, true);
    this.suckers = inst(new THREE.SphereGeometry(1, 10, 6).scale(1, 0.45, 1), new THREE.MeshStandardMaterial({ color: 0xf3c4e6, roughness: 0.5 }), ARMS * SUCKERS, false);
    const tk = ZK[Z_TENTACLE];
    this.clubs = inst(new THREE.SphereGeometry(1, 22, 16).scale(tk.hrx, tk.hry, tk.hrx), new THREE.MeshStandardMaterial({ roughness: 0.38 }), ARMS, true);
    this.glow = inst(new THREE.SphereGeometry(0.2, 10, 8).scale(1, 0.55, 1), new THREE.MeshStandardMaterial({ color: 0xd2a0ff, emissive: 0xb070ff, emissiveIntensity: 1.1 }), ARMS * 3, true);
    this.rings = inst(new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }), RINGS, true);
    this.rings.renderOrder = 3;
    scene.add(this.beads, this.suckers, this.clubs, this.glow, this.rings);
  }

  /** Часть Кракена в этом кадре: id, тип, поза (интерполированная), вспышка попадания 0…1, время, с */
  part(kind: number, r: KrakenPose, flash: number, time: number): void {
    if (kind === Z_KRAKEN) this.drawHead(r, flash, time);
    else if (kind === Z_TENTACLE) this.drawArm(r, flash, time);
  }

  private drawHead(r: KrakenPose, flash: number, time: number): void {
    const k = ZK[Z_KRAKEN];
    // под водой — только круг, где всплывёт
    if (r.st === ZS_KRAKEN_DIVE) this.ring(r.tx, r.tz, KRAKEN_DIVE_R * (0.55 + 0.45 * Math.abs(Math.sin(time * 2.2))), 0xe8f6ff);
    if (r.y + k.hcy + k.hry < WATER_Y - 0.2) return;
    this.headSeen = true;
    const h = this.head;
    h.visible = true;
    h.position.set(r.x, r.y, r.z);
    h.rotation.set(0, r.yaw, 0);
    const open = r.st === ZS_BOSS_OPEN;
    const rage = (r.flags & ZF_RAGE) !== 0;
    // плевок: надувается к выстрелу; открыта — дышит
    let sx = 1;
    let sy = 1;
    if (r.st === ZS_KRAKEN_SPIT) {
      const u = 1 - Math.min(1, r.wind / KRAKEN_SPIT_TICKS);
      sx = 1 + 0.1 * u;
      sy = 1 + 0.06 * u;
    } else if (open) {
      sy = 1 + 0.03 * Math.sin(time * 5);
    } else {
      sy = 1 + 0.02 * Math.sin(time * 1.6);
    }
    h.scale.set(sx, sy, sx);
    _c.set(0xffffff);
    if (rage) _c.lerp(_c2.set(RAGE), 0.35 + 0.1 * Math.sin(time * 9));
    if (open) _c.lerp(_c2.set(0xcff8ff), 0.35);
    this.headMat.color.copy(_c).lerp(WHITE, flash * 0.6);
    this.headMat.emissive.set(flash > 0.05 ? 0x553355 : 0x000000);
    this.irisMat.color.set(open ? OPEN : rage ? 0xff8a5a : 0xc58cff);
    this.irisMat.emissive.set(open ? 0x40d8e8 : rage ? 0xff5a2a : 0xb070ff);
    // открыта — глаза навыкате (веко поднято), иначе сонные
    for (const eye of this.eyes) {
      const lid = eye.getObjectByName('lid')!;
      lid.rotation.x = open ? -1.2 : -0.1 - 0.15 * Math.sin(time * 0.7);
      eye.scale.setScalar(open ? 1.18 : 1);
    }
  }

  private drawArm(r: KrakenPose, flash: number, time: number): void {
    if (this.nArms >= ARMS) return;
    const tk = ZK[Z_TENTACLE];
    tentacleRoot(r.stage, _root);
    if (r.st === ZS_KRAKEN_DIVE) this.ring(_root.x, _root.z, 1.4 + 0.6 * Math.abs(Math.sin(time * 3 + r.stage)), 0xe8f6ff);
    // кривая руки: от корня вверх, дугой к булаве — подходит к ней сверху со стороны корня
    P0.set(_root.x, _root.y, _root.z);
    P3.set(r.x, r.y + tk.hcy, r.z);
    const rise = THREE.MathUtils.clamp(P3.y - P0.y, 2.5, 8) * 0.9;
    P1.set(P0.x, P0.y + rise, P0.z);
    _t.set(P0.x - P3.x, 0, P0.z - P3.z);
    const flat = _t.length();
    if (flat > 1e-3) _t.multiplyScalar(Math.min(3, flat * 0.35) / flat);
    P2.set(P3.x + _t.x, P3.y + 2.2, P3.z + _t.z);
    // цвет по состоянию
    _c.set(PURPLE);
    if (r.st === ZS_TENT_SLAM) {
      const u = 1 - Math.min(1, r.wind / TENT_WARN_TICKS);
      _c.lerp(_c2.set(RED), 0.15 + 0.35 * u);
    } else if (r.st === ZS_TENT_REST) {
      _c.lerp(_c2.set(OPEN), 0.35 + 0.2 * Math.sin(time * 8));
    }
    if (r.flags & ZF_RAGE) _c.lerp(_c2.set(RAGE), 0.2);
    _c.lerp(WHITE, flash * 0.7);
    for (let i = 0; i < BEADS; i++) {
      const u = (i + 0.5) / BEADS * 0.94;
      bezier(u, _p);
      bezierTangent(u, _t);
      const len = _t.length() / BEADS;
      _t.normalize();
      // лёгкая волна вдоль руки
      _n.set(-_t.z, 0, _t.x);
      if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0);
      _n.normalize();
      _p.addScaledVector(_n, Math.sin(time * 2.1 + u * 7 + r.stage) * 0.12 * (1 - u));
      const rad = 1.0 - 0.42 * u;
      _q.setFromUnitVectors(_z, _t);
      _s.set(rad, rad, Math.max(rad, len * 0.62));
      this.beads.setMatrixAt(this.nBeads, _m.compose(_p, _q, _s));
      this.beads.setColorAt(this.nBeads++, _c2.copy(_c).multiplyScalar(0.82 + 0.18 * u));
      // присоски — по брюшку (со стороны земли)
      if (i % 2 === 1 && this.nSuckers < ARMS * SUCKERS) {
        _n.set(0, -1, 0).addScaledVector(_t, _t.y);
        if (_n.lengthSq() < 1e-6) _n.set(0, 0, 1);
        _n.normalize();
        _p.addScaledVector(_n, rad * 0.86);
        _q.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, _n);
        const sr = rad * 0.32;
        _s.set(sr, sr, sr);
        this.suckers.setMatrixAt(this.nSuckers++, _m.compose(_p, _q, _s));
      }
    }
    // булава
    _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, r.yaw);
    _s.set(1, 1, 1);
    this.clubs.setMatrixAt(this.nArms, _m.compose(P3, _q, _s));
    this.clubs.setColorAt(this.nArms, _c);
    // три светящиеся присоски на булаве — смотрят на крепость
    for (let j = 0; j < 3 && this.nGlow < ARMS * 3; j++) {
      const a = (j - 1) * 0.55;
      _p.set(Math.sin(a) * tk.hrx * 0.82, -0.15 + (j === 1 ? 0.35 : 0), -Math.cos(a) * tk.hrx * 0.82).applyQuaternion(_q).add(P3);
      _m.compose(_p, _q, _s.set(1, 1, 1));
      this.glow.setMatrixAt(this.nGlow, _m);
      this.glow.setColorAt(this.nGlow++, _c2.set(r.st === ZS_TENT_REST ? 0xbffcff : 0xffffff));
    }
    this.nArms++;
  }

  private ring(x: number, z: number, rad: number, color: number): void {
    if (this.nRings >= RINGS) return;
    _m.compose(_p.set(x, WATER_Y + 0.05, z), _q.identity(), _s.set(rad, 1, rad));
    this.rings.setMatrixAt(this.nRings, _m);
    this.rings.setColorAt(this.nRings++, _c.set(color));
  }

  /** Конец кадра: сколько инстансов рисовать */
  flush(): void {
    this.head.visible = this.headSeen;
    this.arms = this.nArms;
    this.beads.count = this.nBeads;
    this.suckers.count = this.nSuckers;
    this.clubs.count = this.nArms;
    this.glow.count = this.nGlow;
    this.rings.count = this.nRings;
    for (const m of [this.beads, this.suckers, this.clubs, this.glow, this.rings]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.nArms = this.nBeads = this.nSuckers = this.nGlow = this.nRings = 0;
    this.headSeen = false;
  }

  clear(): void {
    this.nArms = this.nBeads = this.nSuckers = this.nGlow = this.nRings = 0;
    this.headSeen = false;
    this.flush();
  }
}

function bezier(u: number, out: THREE.Vector3): void {
  const a = (1 - u) * (1 - u) * (1 - u);
  const b = 3 * u * (1 - u) * (1 - u);
  const c = 3 * u * u * (1 - u);
  const d = u * u * u;
  out.set(
    a * P0.x + b * P1.x + c * P2.x + d * P3.x,
    a * P0.y + b * P1.y + c * P2.y + d * P3.y,
    a * P0.z + b * P1.z + c * P2.z + d * P3.z,
  );
}

function bezierTangent(u: number, out: THREE.Vector3): void {
  const a = 3 * (1 - u) * (1 - u);
  const b = 6 * u * (1 - u);
  const c = 3 * u * u;
  out.set(
    a * (P1.x - P0.x) + b * (P2.x - P1.x) + c * (P3.x - P2.x),
    a * (P1.y - P0.y) + b * (P2.y - P1.y) + c * (P3.y - P2.y),
    a * (P1.z - P0.z) + b * (P2.z - P1.z) + c * (P3.z - P2.z),
  );
}
