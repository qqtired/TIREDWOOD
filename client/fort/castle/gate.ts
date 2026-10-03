// Ворота замка. Две створки из досок на петлях в нишах проезда — инстансы: доски и бруски, железные полосы и
// уголки, заклёпки и умбоны, шипы, трещины, щепа на изломах. Состояния:
//  • открыты/закрыты — плавно во двор, в ниши (проём не сужается), в конце — мягкий удар о стену;
//  • прочность — трещины, пробитые и выбитые доски (выбитые лежат на земле), створки подаются и провисают;
//  • удар — створки вздрагивают, с кромок сыплется пыль, летят щепки;
//  • пали — левая падает наружу плашмя, правая висит на одной петле;
//  • прорыв босса — остатки отрывает: правую швыряет во двор, левую отпихивает; арка трясётся, сыплются пыль и камешки;
//  • ремонт и новые ворота — доски и створки летят на свои места (всё «отматывается» назад);
//  • укрепление 0–8 — полосы, заклёпки, уголки, продольные полосы, оковка, шипы, золото — вскакивают на место.
// Вид по прочности и ступени детерминирован (gatestate.ts); удары, прорыв и полёты — только красота у каждого своя.
import * as THREE from 'three';
import { CastleFx, PEBBLE, PLANK, SPLINTER } from './fx.ts';
import {
  BAND_Y, CRACKS, IRON, IRON_BOSS, IRON_BOX, IRON_RIVET, IRON_SPIKE, PLANKS, PLANK_GONE, PLANK_HOLED, PLANK_WHOLE,
  crackShown, giveAngle, ironShown, plankState, sagAngle, type PlankSlot,
} from './gatestate.ts';
import { LEAF } from './layout.ts';
import { crackTexture, plankTexture } from './textures.ts';

type LeafMode = 'hinged' | 'fallen' | 'hanging' | 'thrown' | 'returning';

interface Leaf {
  /** +1 — левая (доски от петли к +x), −1 — правая */
  sgn: number;
  hinge: THREE.Vector3;
  mode: LeafMode;
  /** время в текущем режиме, с */
  t: number;
  /** угол на петлях (0 — закрыта, π/2 — в нише), скорость */
  angle: number;
  vel: number;
  /** дрожь от ударов: пружина (рад) и тряска */
  rattle: number;
  rattleV: number;
  jitter: number;
  /** куда смотрела створка, когда начался полёт (бросок, возврат) */
  from: THREE.Matrix4;
  /** куда летит (бросок) */
  to: THREE.Matrix4;
  /** отпихнули (левая, лёжа) 0…1 */
  shove: number;
  landed: boolean;
  m: THREE.Matrix4;
}

const M_WOOD = 0;
const M_IRON = 1;
const M_RIVET = 2;
const M_SPIKE = 3;
const M_CRACK = 4;
const M_SPLINTER = 5;

interface Part {
  mesh: number;
  index: number;
  /** к какой створке приделан (−1 — лежит сам по себе) */
  leaf: number;
  local: THREE.Matrix4;
  /** куда лечь, когда отвалится (мир) */
  loose: THREE.Matrix4 | null;
  attached: boolean;
  visible: boolean;
  /** полёт: 1 — нет; задержка перед стартом; откуда (мир) */
  fly: number;
  flyDur: number;
  flyArc: number;
  delay: number;
  from: THREE.Matrix4;
  color: THREE.Color;
}

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _s0 = new THREE.Vector3();
const _s1 = new THREE.Vector3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const IRON_C = new THREE.Color(0x44464e);
const IRON_KICK = new THREE.Color(0x55575f);
const GOLD_C = new THREE.Color(0xf2c24c);
const BATTEN_C = new THREE.Color(0.8, 0.74, 0.68);
const OPEN = Math.PI / 2;

/** Куда ложатся выбитые доски (мир): x, z, поворот — левые наружу в «горло», правые внутрь в проезд */
const DEBRIS: Record<number, readonly [number, number, number]> = {
  1: [-1.75, -17.6, 0.35],
  3: [-0.55, -19.3, -0.9],
  6: [1.35, -13.9, 1.2],
  7: [2.05, -12.0, 0.25],
};

/** Правая створка после прорыва — лежит во дворе (центр и поворот) */
const THROWN = { x: 3.4, z: -9.8, yaw: 0.85 };

const ease = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

export class CastleGate {
  readonly group = new THREE.Group();
  private readonly fx: CastleFx;
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly parts: Part[] = [];
  private readonly leaves: Leaf[];
  private readonly plankParts: Array<[Part, Part]> = [];
  private readonly splinters: Part[][] = [];
  private readonly crackParts: Part[] = [];
  private readonly ironParts: Array<{ part: Part; def: (typeof IRON)[number] }> = [];
  private plankCur: number[] = PLANKS.map(() => PLANK_WHOLE);
  private openTarget = 0;
  private hp = 1;
  private broken = false;
  private tier = 0;
  private breached = false;
  private press = 0;
  private pressT = 0;
  private dirty = true;
  private ready = false;
  /** матрицы уже записаны хотя бы раз (до этого «где часть сейчас» — её цель) */
  private written = false;
  /** насколько трясти перемычку над воротами (м) — читает castle.ts */
  archShake = 0;
  private archKick = 0;

  constructor(fx: CastleFx) {
    this.fx = fx;
    const wood = new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.86 });
    const iron = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.35 });
    const rivet = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2);
    const spike = new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0).rotateX(-Math.PI / 2);
    const crack = new THREE.MeshStandardMaterial({ map: crackTexture(), alphaTest: 0.45, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const splinter = new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const counts = [PLANKS.length * 2 + 10, IRON.length * 2, IRON.length * 2, IRON.length * 2, CRACKS.length, PLANKS.length * 6];
    const geos = [box, box, rivet, spike, new THREE.PlaneGeometry(1, 1), splinter];
    const mats = [wood, iron, iron, iron, crack, wood];
    for (let i = 0; i < 6; i++) {
      const im = new THREE.InstancedMesh(geos[i], mats[i], counts[i]);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = false;
      im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, new THREE.Color(1, 1, 1));
      this.meshes.push(im);
      this.group.add(im);
    }
    const leaf = (sgn: number): Leaf => ({
      sgn, hinge: new THREE.Vector3(-sgn * LEAF.hx, LEAF.y0, LEAF.hz), mode: 'hinged', t: 0, angle: 0, vel: 0, rattle: 0, rattleV: 0, jitter: 0,
      from: new THREE.Matrix4(), to: new THREE.Matrix4(), shove: 0, landed: false, m: new THREE.Matrix4(),
    });
    this.leaves = [leaf(1), leaf(-1)];
    this.buildParts();
    for (const im of this.meshes) if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------ части

  private add(mesh: number, leafI: number, local: THREE.Matrix4, color: THREE.Color, visible = true): Part {
    const im = this.meshes[mesh];
    const p: Part = {
      mesh, index: im.count++, leaf: leafI, local, loose: null, attached: true, visible, fly: 1, flyDur: 0.4, flyArc: 0, delay: 0,
      from: new THREE.Matrix4(), color: color.clone(),
    };
    im.setColorAt(p.index, p.color);
    this.parts.push(p);
    return p;
  }

  private buildParts(): void {
    // доски: по две части на доску (низ и верх — между ними дыра)
    PLANKS.forEach((s, k) => {
      const c = new THREE.Color(1, 1, 1).multiplyScalar(s.tint);
      const lo = this.add(M_WOOD, s.leaf, this.plankLocal(s, 0, LEAF.h, new THREE.Matrix4()), c);
      const hi = this.add(M_WOOD, s.leaf, this.plankLocal(s, LEAF.h, LEAF.h, new THREE.Matrix4()), c, false);
      const d = DEBRIS[k];
      if (d) lo.loose = new THREE.Matrix4().compose(new THREE.Vector3(d[0], LEAF.plank / 2 + 0.005, d[1]), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, d[2], 0, 'YXZ')), new THREE.Vector3(s.u1 - s.u0, LEAF.h, LEAF.plank));
      this.plankParts.push([lo, hi]);
      // щепа на кромках дыры: снизу торчит вверх, сверху — вниз
      const sp: Part[] = [];
      for (let j = 0; j < 6; j++) {
        const up = j < 3;
        const lx = this.lx(s.leaf, (s.u0 + s.u1) / 2 + ((j % 3) - 1) * (s.u1 - s.u0) * 0.3);
        const len = 0.07 + (((k * 7 + j * 3) % 5) / 5) * 0.1;
        const y = up ? s.hole[0] : s.hole[1];
        const m = new THREE.Matrix4().compose(new THREE.Vector3(lx, y, LEAF.plank / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, up ? 0 : Math.PI)), new THREE.Vector3(0.04, len, 0.05));
        sp.push(this.add(M_SPLINTER, s.leaf, m, new THREE.Color(1.05, 0.95, 0.85), false));
      }
      this.splinters.push(sp);
    });
    // бруски с изнанки: три поперечины и две косые
    for (let leafI = 0; leafI < 2; leafI++) {
      const sgn = this.leaves[leafI].sgn;
      const w = LEAF.w;
      const z = LEAF.plank + LEAF.batten / 2;
      for (const y of BAND_Y) {
        const m = new THREE.Matrix4().compose(new THREE.Vector3(sgn * w / 2, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), new THREE.Vector3(0.22, w - 0.1, LEAF.batten));
        this.add(M_WOOD, leafI, m, BATTEN_C);
      }
      for (const [ya, yb] of [[BAND_Y[0] + 0.11, BAND_Y[1] - 0.11], [BAND_Y[1] + 0.11, BAND_Y[2] - 0.11]]) {
        const du = w - 0.3;
        const dy = yb - ya;
        const len = Math.hypot(du, dy);
        const rot = Math.atan2(-sgn * du, dy);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(sgn * w / 2, (ya + yb) / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rot)), new THREE.Vector3(0.18, len, LEAF.batten * 0.9));
        this.add(M_WOOD, leafI, m, BATTEN_C);
      }
    }
    // железо по ступеням
    for (let leafI = 0; leafI < 2; leafI++) {
      const sgn = this.leaves[leafI].sgn;
      for (const def of IRON) {
        const m = new THREE.Matrix4();
        let mesh = M_IRON;
        if (def.kind === IRON_BOX) {
          const knuckle = def.u < 0.01;
          m.compose(new THREE.Vector3(sgn * def.u, def.y, knuckle ? 0.05 : -def.sz / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, sgn * def.rot)), new THREE.Vector3(def.su, def.sy, def.sz));
        } else if (def.kind === IRON_RIVET || def.kind === IRON_BOSS) {
          mesh = M_RIVET;
          m.compose(new THREE.Vector3(sgn * def.u, def.y, -0.024), new THREE.Quaternion(), new THREE.Vector3(def.su, def.sy, def.sz));
        } else if (def.kind === IRON_SPIKE) {
          mesh = M_SPIKE;
          m.compose(new THREE.Vector3(sgn * def.u, def.y, -0.024), new THREE.Quaternion(), new THREE.Vector3(def.su, def.sy, def.sz));
        }
        const c = def.from >= 6 && def.kind === IRON_BOX && def.sy > 0.3 ? IRON_KICK : IRON_C;
        const part = this.add(mesh, leafI, m, c, ironShown(def, 0));
        this.ironParts.push({ part, def });
      }
    }
    // трещины
    for (const c of CRACKS) {
      const outer = c.side === 0;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(this.lx(c.leaf, c.u), c.y, outer ? -0.004 : LEAF.plank + 0.004),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, outer ? Math.PI : 0, c.rot)),
        new THREE.Vector3(c.size * 0.62, c.size, 1),
      );
      this.crackParts.push(this.add(M_CRACK, c.leaf, m, new THREE.Color(1, 1, 1), false));
    }
  }

  /** Поперёк створки от петли (u) → x в системе створки */
  private lx(leafI: number, u: number): number {
    return this.leaves[leafI].sgn * u;
  }

  private plankLocal(s: PlankSlot, y0: number, y1: number, out: THREE.Matrix4): THREE.Matrix4 {
    const len = Math.max(0.001, y1 - y0);
    return out.compose(_v.set(this.lx(s.leaf, (s.u0 + s.u1) / 2), (y0 + y1) / 2, LEAF.plank / 2), _q.identity(), _s0.set(s.u1 - s.u0, len, LEAF.plank));
  }

  // ------------------------------------------------------------ состояние

  /**
   * Открыты (0…1), прочность (0…1), пали ли. instant — без анимаций (первый снимок, вход в разгар волны).
   * Звать можно каждый снимок: меняется только то, что поменялось.
   */
  set(open01: number, hp01: number, broken: boolean, instant = false): void {
    const hp = Math.max(0, Math.min(1, hp01));
    instant ||= !this.ready;
    this.ready = true;
    this.openTarget = Math.max(0, Math.min(1, open01));
    let force = instant;
    if (broken !== this.broken) {
      this.broken = broken;
      force = true;
      if (broken) this.fall(instant);
      else this.rebuild(instant);
    }
    if (Math.abs(hp - this.hp) > 1e-4 || force) {
      this.hp = hp;
      this.applyDamage(instant);
    }
    if (instant) {
      for (const l of this.leaves) {
        if (l.mode === 'hinged') {
          l.angle = this.openTarget * OPEN;
          l.vel = 0;
        }
      }
    }
    this.dirty = true;
  }

  /** Ступень укрепления ворот 0–8: новое железо вскакивает на место */
  setTier(tier: number, instant = false): void {
    const t = Math.max(0, Math.min(8, Math.floor(tier)));
    if (t === this.tier && !instant) return;
    const up = t > this.tier;
    this.tier = t;
    let k = 0;
    for (const { part, def } of this.ironParts) {
      const vis = ironShown(def, t);
      const gold = t >= def.goldFrom;
      const c = gold ? GOLD_C : def.from >= 6 && def.kind === IRON_BOX && def.sy > 0.3 ? IRON_KICK : IRON_C;
      if (!part.color.equals(c)) {
        part.color.copy(c);
        this.meshes[part.mesh].setColorAt(part.index, c);
        this.meshes[part.mesh].instanceColor!.needsUpdate = true;
      }
      if (vis === part.visible) continue;
      part.visible = vis;
      if (vis && up && !instant) this.pop(part, 0.32, (k++ % 24) * 0.025);
    }
    this.dirty = true;
  }

  /** Удар по воротам: створки вздрагивают, пыль с кромок, щепки наружу */
  hit(power = 1): void {
    if (this.broken) return;
    const p = Math.max(0.2, Math.min(2, power));
    for (const l of this.leaves) {
      l.rattleV += 0.9 * p * (0.8 + Math.random() * 0.4);
      l.jitter = Math.min(1, l.jitter + 0.55 * p);
    }
    const x = (Math.random() - 0.5) * 4.4;
    this.fx.puff(x, 0.25, LEAF.hz - 0.25, 2 + p * 2, 0.8, 0.55, 0.25, 1.0);
    this.fx.puff((Math.random() - 0.5) * 4, LEAF.y0 + LEAF.h - 0.1, LEAF.hz - 0.15, 1 + p, 0.6, 0.4, -0.1, 1.1, undefined, 0.45, 0.4);
    this.fx.burst(x * 0.8, 0.8 + Math.random() * 1.6, LEAF.hz - 0.1, 1 + Math.round(p * 2), SPLINTER, [0.035, 0.035, 0.2], 2.6, 0, 0.5, -1, 1.2);
    if (p > 1.1) this.archKick = Math.max(this.archKick, 0.25 * p);
    this.dirty = true;
  }

  /** Прорыв: босс протиснулся (событие или сам, когда «сжатие» в проёме велико). Только когда ворота пали. */
  breach(): void {
    if (!this.broken || this.breached) return;
    this.breached = true;
    const R = this.leaves[1];
    R.from.copy(R.m);
    R.to.copy(this.thrownPose(new THREE.Matrix4()));
    R.mode = 'thrown';
    R.t = 0;
    R.landed = false;
    const L = this.leaves[0];
    L.shove = 0.0001;
    this.archKick = 1;
    // пыль занавесом из-под арки, клубы по проезду и во двор (вслед створке), камешки с кромок, щепа
    for (let i = 0; i < 8; i++) this.fx.puff(-2.2 + i * 0.63, 2.85, -16 + Math.random() * 3, 2, 0.5, 1.05, -0.35, 2.0, undefined, 0.7, 0.5);
    this.fx.puff(0, 0.5, -14.6, 10, 2.3, 1.4, 0.6, 1.8, undefined, 0.6);
    this.fx.puff(1.6, 0.6, -11.6, 6, 1.6, 1.2, 0.5, 1.6, undefined, 0.5);
    this.fx.burst(0, 3.0, -16.05, 8, PEBBLE, [0.09, 0.08, 0.1], 1.2, 0, -0.2, -0.6, 1.6);
    this.fx.burst(0, 3.0, -13.0, 5, PEBBLE, [0.08, 0.07, 0.09], 1.2, 0, -0.2, 0.6, 1.6);
    this.fx.burst(0, 5.9, -18.8, 4, PEBBLE, [0.07, 0.06, 0.08], 1, 0, -0.3, -0.5, 1.4);
    this.fx.burst(2.4, 1.4, -15.3, 10, SPLINTER, [0.04, 0.04, 0.24], 4, 0.3, 0.6, 1, 1.4);
    this.dirty = true;
  }

  /**
   * Гул (событие прорыва: ворота пали, босс ревёт и идёт к проёму): арка вздрагивает, с неё сыплются пыль и
   * камешки. Створки не трогает — остатки оторвёт сам босс, когда дойдёт до проёма (squeeze).
   */
  rumble(power = 1): void {
    const p = Math.max(0.3, Math.min(1.5, power));
    this.archKick = Math.max(this.archKick, 0.7 * p);
    for (let i = 0; i < 5; i++) this.fx.puff(-2.2 + i * 1.1, 2.9, -16 + Math.random() * 3, 1, 0.4, 0.6, -0.4, 1.6, undefined, 0.5, 0.45);
    this.fx.burst(0, 3.0, -16.05, Math.round(4 * p), PEBBLE, [0.08, 0.07, 0.09], 1, 0, -0.2, -0.5, 1.4);
    this.fx.burst(0, 3.0, -12.95, Math.round(3 * p), PEBBLE, [0.07, 0.06, 0.08], 1, 0, -0.2, 0.5, 1.4);
  }

  /** Босс в проёме (0…1, как gatePress): арка дрожит, сыплется пыль; сильно и ворота пали — прорыв */
  squeeze(k: number): void {
    this.press = Math.max(0, Math.min(1, k));
    if (this.press > 0.55 && this.broken && !this.breached) this.breach();
  }

  /** Подлатали (событие ремонта): стук молотка — пыль у досок */
  repair(): void {
    if (this.broken) return;
    const s = PLANKS[Math.floor(Math.random() * PLANKS.length)];
    const l = this.leaves[s.leaf];
    _v.set(this.lx(s.leaf, (s.u0 + s.u1) / 2), 1.2 + Math.random() * 1.2, LEAF.plank + 0.2).applyMatrix4(l.m);
    this.fx.puff(_v.x, _v.y, _v.z, 2, 0.2, 0.3, 0.3, 0.7);
  }

  // ------------------------------------------------------------ переходы

  private applyDamage(instant: boolean): void {
    const hp = this.broken ? 0 : this.hp;
    let k = 0;
    PLANKS.forEach((s, i) => {
      const st = plankState(s, hp);
      const was = this.plankCur[i];
      if (st === was && !instant) return;
      this.plankCur[i] = st;
      const [lo, hi] = this.plankParts[i];
      const sp = this.splinters[i];
      const leaf = this.leaves[s.leaf];
      // текущее положение в мире — откуда полетит
      if (!instant) {
        this.worldOf(lo, lo.from);
        this.worldOf(hi, hi.from);
      }
      if (st === PLANK_GONE) {
        lo.attached = false;
        lo.visible = true;
        hi.visible = false;
        if (!instant) {
          this.startFly(lo, 0.55, 0.5, 0);
          this.startFly(hi, 0.2, 0, 0);
          _v.setFromMatrixPosition(lo.from);
          this.fx.puff(_v.x, Math.max(0.3, _v.y), _v.z, 2, 0.4, 0.5, 0.2, 0.9);
          this.fx.burst(_v.x, _v.y, _v.z, 4, SPLINTER, [0.035, 0.035, 0.2], 2.4, 0, 0.6, -leaf.sgn * 0, 1.4);
        }
      } else {
        lo.attached = true;
        lo.visible = true;
        if (st === PLANK_HOLED) {
          this.plankLocal(s, 0, s.hole[0], lo.local);
          this.plankLocal(s, s.hole[1], LEAF.h, hi.local);
          hi.visible = true;
          if (!instant && was === PLANK_WHOLE) {
            // кусок вылетает, щепки, пыль
            _v.set(this.lx(s.leaf, (s.u0 + s.u1) / 2), (s.hole[0] + s.hole[1]) / 2, LEAF.plank / 2).applyMatrix4(leaf.m);
            this.fx.burst(_v.x, _v.y, _v.z, 1, PLANK, [s.u1 - s.u0, LEAF.plank, s.hole[1] - s.hole[0]], 2.2, 0, 0.4, 0.8, 0.6);
            this.fx.burst(_v.x, _v.y, _v.z, 5, SPLINTER, [0.035, 0.035, 0.22], 3, 0, 0.6, 0.5, 1.6);
            this.fx.puff(_v.x, _v.y, _v.z, 2, 0.3, 0.45, 0.1, 0.9);
          }
        } else {
          this.plankLocal(s, 0, LEAF.h, lo.local);
          hi.visible = false;
        }
        if (!instant) {
          if (was === PLANK_GONE) {
            // доска летит с земли на место
            this.startFly(lo, 0.55, 0.9, (k++ % 6) * 0.09);
            if (hi.visible) this.startFly(hi, 0.55, 0.9, (k % 6) * 0.09);
          } else if (was === PLANK_HOLED && st === PLANK_WHOLE) {
            // дыра зарастает доской снизу вверх
            this.startFly(lo, 0.32, 0, 0);
            this.startFly(hi, 0.25, 0, 0);
          }
        }
      }
      for (const p of sp) p.visible = st === PLANK_HOLED;
    });
    // трещины: по прочности; на пробитых и выбитых досках — те, что попали в дыру, прячем
    CRACKS.forEach((c, i) => {
      const part = this.crackParts[i];
      let vis = crackShown(c, hp);
      if (vis) {
        const slot = PLANKS.findIndex((s) => s.leaf === c.leaf && c.u >= s.u0 - 0.01 && c.u <= s.u1 + 0.01);
        const st = slot >= 0 ? this.plankCur[slot] : PLANK_WHOLE;
        if (st === PLANK_GONE) vis = false;
        else if (st === PLANK_HOLED) {
          const s = PLANKS[slot];
          if (c.y + c.size / 2 > s.hole[0] && c.y - c.size / 2 < s.hole[1]) vis = false;
        }
      }
      if (vis !== part.visible) {
        part.visible = vis;
        if (vis && !instant) this.pop(part, 0.18, 0);
      }
    });
    this.dirty = true;
  }

  private fall(instant: boolean): void {
    this.breached = false;
    const [L, R] = this.leaves;
    for (const l of this.leaves) {
      l.from.copy(l.m);
      l.t = instant ? 10 : 0;
      l.rattle = l.rattleV = l.jitter = 0;
      l.landed = instant;
      l.shove = 0;
    }
    L.mode = 'fallen';
    R.mode = 'hanging';
    if (!instant) {
      this.archKick = Math.max(this.archKick, 0.6);
      this.fx.puff(0, 1.2, LEAF.hz - 0.3, 5, 2.2, 0.8, 0.35, 1.5);
      this.fx.burst(0, 1.5, LEAF.hz, 10, SPLINTER, [0.04, 0.04, 0.24], 4.2, 0, 0.5, -0.7, 1.6);
      this.fx.burst(0, 3.0, -16.05, 5, PEBBLE, [0.08, 0.07, 0.09], 1, 0, -0.2, -0.5, 1.4);
    }
    this.dirty = true;
  }

  private rebuild(instant: boolean): void {
    this.breached = false;
    for (const l of this.leaves) {
      l.from.copy(l.m);
      l.mode = instant ? 'hinged' : 'returning';
      l.t = 0;
      l.angle = this.openTarget * OPEN;
      l.vel = 0;
      l.shove = 0;
    }
    if (!instant) this.fx.puff(0, 0.6, LEAF.hz + 0.6, 6, 2.2, 0.7, 0.5, 1.2);
    this.dirty = true;
  }

  /** Появиться: из нулевого размера с перелётом */
  private pop(p: Part, dur: number, delay: number): void {
    this.worldOf(p, p.from);
    // с нуля: размер 0 в той же точке
    p.from.decompose(_p0, _q0, _s0);
    p.from.compose(_p0, _q0, _s0.set(0.001, 0.001, 0.001));
    p.fly = 0;
    p.flyDur = dur;
    p.flyArc = 0;
    p.delay = delay;
  }

  private startFly(p: Part, dur: number, arc: number, delay: number): void {
    p.fly = 0;
    p.flyDur = dur;
    p.flyArc = arc;
    p.delay = delay;
  }

  /** Где часть сейчас (мир), без полёта */
  private target(p: Part, out: THREE.Matrix4): THREE.Matrix4 {
    if (!p.visible) {
      // прячется — в той же точке с нулевым размером
      const base = p.attached || !p.loose ? out.multiplyMatrices(this.leaves[p.leaf].m, p.local) : out.copy(p.loose);
      base.decompose(_p1, _q1, _s1);
      return out.compose(_p1, _q1, _s1.set(0.0001, 0.0001, 0.0001));
    }
    if (!p.attached && p.loose) return out.copy(p.loose);
    return out.multiplyMatrices(this.leaves[p.leaf].m, p.local);
  }

  /** Где часть видна сейчас (с учётом полёта) — для начала нового полёта */
  private worldOf(p: Part, out: THREE.Matrix4): THREE.Matrix4 {
    if (!this.written) return this.target(p, out);
    this.meshes[p.mesh].getMatrixAt(p.index, out);
    if (out.determinant() === 0 && p.visible) this.target(p, out);
    return out;
  }

  /** Лежащая во дворе правая створка (после прорыва) */
  private thrownPose(out: THREE.Matrix4): THREE.Matrix4 {
    // лицом (железом) вверх: высота створки — по z, ширина — по x; центр — в THROWN
    _q.setFromEuler(_e.set(Math.PI / 2, THROWN.yaw, 0, 'YXZ'));
    const local = _v.set(-LEAF.w / 2, LEAF.h / 2, 0).applyQuaternion(_q);
    return out.compose(_p0.set(THROWN.x - local.x, LEAF.plank + LEAF.batten + 0.03, THROWN.z - local.z), _q, _s0.set(1, 1, 1));
  }

  // ------------------------------------------------------------ кадр

  update(dt: number, t: number): void {
    // перемычка: толчки и «сжатие» босса (его подтверждают каждый кадр, иначе затихает)
    this.press = Math.max(0, this.press - dt * 2);
    this.archKick = Math.max(0, this.archKick - dt * 1.6);
    this.archShake = Math.max(this.archKick * 0.035, this.press * 0.022);
    if (this.press > 0.04) {
      this.pressT += dt * this.press;
      if (Math.random() < dt * 9 * this.press) this.fx.puff((Math.random() - 0.5) * 4.6, 2.9, -16 + Math.random() * 3, 1, 0.2, 0.45, -0.45, 1.6, undefined, 0.5, 0.4);
      if (Math.random() < dt * 1.8 * this.press) this.fx.burst((Math.random() - 0.5) * 4.6, 3.0, Math.random() < 0.5 ? -16.05 : -12.95, 1, PEBBLE, [0.07, 0.06, 0.08], 0.6, 0, -0.5, 0, 1);
    }
    let moving = this.dirty;
    for (let i = 0; i < 2; i++) moving = this.updateLeaf(this.leaves[i], i, dt, t) || moving;
    for (const p of this.parts) {
      if (p.fly < 1) {
        moving = true;
        if (p.delay > 0) p.delay -= dt;
        else {
          p.fly = Math.min(1, p.fly + dt / p.flyDur);
          // доска легла на место (или на землю) — облачко пыли
          if (p.fly >= 1 && p.flyArc > 0) {
            _v.setFromMatrixPosition(this.target(p, _m));
            this.fx.puff(_v.x, Math.max(0.15, _v.y), _v.z, 1, 0.2, 0.32, 0.2, 0.6);
          }
        }
      }
    }
    if (!moving) return;
    this.dirty = false;
    this.written = true;
    for (const p of this.parts) {
      const im = this.meshes[p.mesh];
      this.target(p, _m);
      if (p.fly < 1) {
        const k = p.delay > 0 ? 0 : ease(p.fly);
        p.from.decompose(_p0, _q0, _s0);
        _m.decompose(_p1, _q1, _s1);
        _p0.lerp(_p1, k);
        _p0.y += p.flyArc * Math.sin(Math.PI * Math.min(1, p.fly));
        _q0.slerp(_q1, k);
        _s0.lerp(_s1, k);
        // всплеск размера при появлении
        if (p.flyArc === 0 && p.visible && k > 0) _s0.multiplyScalar(1 + 0.18 * Math.sin(Math.PI * k));
        _m.compose(_p0, _q0, _s0);
      }
      im.setMatrixAt(p.index, p.visible || p.fly < 1 ? _m : ZERO);
    }
    for (const im of this.meshes) im.instanceMatrix.needsUpdate = true;
  }

  /** Положение створки по её режиму; true — двигается */
  private updateLeaf(l: Leaf, i: number, dt: number, t: number): boolean {
    l.t += dt;
    const m = l.m;
    let moving = false;
    if (l.mode === 'hinged') {
      // пружина к цели: чуть недодемпфирована, в конце — мягкий удар о нишу
      const target = this.openTarget * OPEN;
      const w = 4.2;
      const acc = w * w * (target - l.angle) - 2 * 0.72 * w * l.vel;
      l.vel += acc * dt;
      l.angle += l.vel * dt;
      if (l.angle > OPEN) {
        l.angle = OPEN;
        if (l.vel > 0.3) this.fx.puff(-l.sgn * (LEAF.hx + 0.1), 0.3, LEAF.hz + 1.3, 2, 0.6, 0.45, 0.3, 0.9);
        l.vel = -l.vel * 0.25;
      }
      if (l.angle < 0) {
        l.angle = 0;
        l.vel = -l.vel * 0.2;
      }
      // дрожь от ударов
      l.rattleV += (-l.rattle * 260 - l.rattleV * 9) * dt;
      l.rattle += l.rattleV * dt;
      l.jitter = Math.max(0, l.jitter - dt * 3);
      const closed = 1 - Math.min(1, l.angle / 0.3);
      const give = giveAngle(this.hp) * closed;
      const a = l.angle + give + Math.max(-0.01, l.rattle) * closed;
      const sag = sagAngle(this.hp) * closed;
      const j = l.jitter * l.jitter * 0.018;
      _p0.copy(l.hinge);
      _p0.x += Math.sin(t * 61 + i * 2) * j;
      _p0.z += Math.sin(t * 47 + i) * j * 0.6;
      _q0.setFromEuler(_e.set(0, -l.sgn * a, -l.sgn * sag, 'YXZ'));
      m.compose(_p0, _q0, _s0.set(1, 1, 1));
      moving = Math.abs(l.vel) > 1e-3 || Math.abs(target - l.angle) > 1e-3 || Math.abs(l.rattleV) > 1e-3 || Math.abs(l.rattle) > 1e-4 || l.jitter > 0;
      return moving;
    }
    if (l.mode === 'fallen') {
      // падает наружу плашмя (ускоряясь), два затухающих отскока; отодвинута от стены «горла»
      const T = 0.55;
      let psi: number;
      if (l.t < T) psi = OPEN * (l.t / T) * (l.t / T);
      else {
        const u = l.t - T;
        psi = OPEN - Math.abs(Math.sin(u * 9)) * 0.12 * Math.exp(-u * 5);
        if (!l.landed) {
          l.landed = true;
          this.fx.puff(-1.2, 0.2, -17.4, 7, 1.6, 0.8, 0.3, 1.5);
          this.fx.burst(-1.2, 0.2, -17.4, 6, SPLINTER, [0.04, 0.04, 0.22], 3, 0, 1, -0.4, 1.6);
          this.archKick = Math.max(this.archKick, 0.4);
        }
      }
      const done = l.t > T + 1.2;
      const lift = 0.03 * (psi / OPEN);
      _p0.copy(l.hinge).add(_v.set(0.2 * (psi / OPEN), lift, 0));
      _q0.setFromAxisAngle(_v.set(1, 0, 0), -psi);
      m.compose(_p0, _q0, _s0.set(1, 1, 1));
      // отпихнули при прорыве: съезжает наружу и чуть поворачивается
      if (l.shove > 0) {
        l.shove = Math.min(1, l.shove + dt / 0.4);
        const k = ease(l.shove);
        const cx = l.hinge.x + 0.2 + LEAF.w / 2;
        const cz = LEAF.hz - LEAF.h / 2;
        _m2.makeTranslation(-cx, 0, -cz);
        m.premultiply(_m2);
        _m2.makeRotationY(0.25 * k);
        m.premultiply(_m2);
        _m2.makeTranslation(cx, 0, cz - 1.6 * k);
        m.premultiply(_m2);
        if (l.shove < 1) return true;
      }
      return !done;
    }
    if (l.mode === 'hanging') {
      // повисла на верхней петле: распахнута, свободный край опустился до земли; качается и затихает
      const T = 0.7;
      const k = Math.min(1, l.t / T);
      const swing = l.t > T ? Math.sin((l.t - T) * 5) * 0.06 * Math.exp(-(l.t - T) * 2.2) : 0;
      const theta = (l.angle + (1.4 - l.angle) * ease(k)) + swing;
      const alpha = 0.16 * ease(k);
      const yp = BAND_Y[2];
      _q0.setFromAxisAngle(_v.set(0, 1, 0), -l.sgn * theta);
      m.makeRotationFromQuaternion(_q0);
      _m2.makeTranslation(0, yp, 0);
      m.multiply(_m2);
      _m2.makeRotationZ(-l.sgn * alpha);
      m.multiply(_m2);
      _m2.makeTranslation(0, -yp, 0);
      m.multiply(_m2);
      // приподнять так, чтобы нижний свободный угол стоял на земле
      _v.set(l.sgn * LEAF.w, 0, LEAF.plank).applyMatrix4(m);
      const lift = Math.max(0, -_v.y) * ease(k);
      _m2.makeTranslation(l.hinge.x, l.hinge.y + lift, l.hinge.z);
      m.premultiply(_m2);
      return l.t < T + 2.5;
    }
    if (l.mode === 'thrown') {
      // сорвало: летит во двор кувырком, падает плашмя, подпрыгивает
      const T = 0.95;
      const k = Math.min(1, l.t / T);
      l.from.decompose(_p0, _q0, _s0);
      l.to.decompose(_p1, _q1, _s1);
      _p0.lerp(_p1, k);
      _p0.y += 2.4 * 4 * k * (1 - k);
      _q0.slerp(_q1, ease(k));
      _q.setFromAxisAngle(_v.set(1, 0, 0), Math.PI * 2 * (1 - (1 - k) * (1 - k)));
      _q0.multiply(_q);
      if (k >= 1) {
        const u = l.t - T;
        _p0.y += Math.abs(Math.sin(u * 10)) * 0.18 * Math.exp(-u * 6);
        if (!l.landed) {
          l.landed = true;
          _v.set(THROWN.x, 0.2, THROWN.z);
          this.fx.puff(_v.x, _v.y, _v.z, 7, 1.4, 0.8, 0.3, 1.4);
          this.fx.burst(_v.x, _v.y, _v.z, 5, SPLINTER, [0.04, 0.04, 0.22], 3, 0, 1, 0, 1.6);
        }
      }
      m.compose(_p0, _q0, _s0.set(1, 1, 1));
      return l.t < T + 1;
    }
    // returning: всё летит обратно на петли, закрывается
    const T = 1.0 + i * 0.15;
    const k = Math.min(1, l.t / T);
    l.from.decompose(_p0, _q0, _s0);
    _q1.setFromEuler(_e.set(0, -l.sgn * this.openTarget * OPEN, 0, 'YXZ'));
    _p1.copy(l.hinge);
    const far = _p0.distanceTo(_p1);
    _p0.lerp(_p1, ease(k));
    _p0.y += Math.min(2, far * 0.35) * Math.sin(Math.PI * k);
    _q0.slerp(_q1, ease(k));
    m.compose(_p0, _q0, _s0.set(1, 1, 1));
    if (k >= 1) {
      l.mode = 'hinged';
      l.angle = this.openTarget * OPEN;
      l.vel = 0;
      l.rattleV = 0.6;
      this.fx.puff(l.hinge.x * 0.5, 0.4, LEAF.hz + 0.2, 2, 0.8, 0.5, 0.3, 0.9);
    }
    return true;
  }

  /** Сводка для стенда */
  info(): { modes: string; hp: number; tier: number; breached: boolean; planks: number[] } {
    return { modes: this.leaves.map((l) => l.mode).join('/'), hp: this.hp, tier: this.tier, breached: this.breached, planks: this.plankCur.slice() };
  }

  dispose(): void {
    for (const im of this.meshes) {
      im.geometry.dispose();
      (im.material as THREE.Material).dispose();
    }
  }
}
