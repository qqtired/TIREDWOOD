// Cat and dog: toy-proportioned quadrupeds built in code (see critter-kit.ts), one skinned mesh each. The skeleton
// is posed by hand: a gait driven by travelled distance with two-bone leg IK (feet stay planted), a bendy spine,
// a chain tail, ears, blinking bead eyes, breathing, and rest postures (sit, groom, sleep, ...) blended by restWeight.
import * as THREE from 'three';
import { Leg, Pose, RigBuilder, clamp, clamp01, ease, ellipsoid, loft, mix, place, pulse, tube, type Paint, type V3 } from './critter-kit.ts';
import type { CritterPose } from './crittersim.ts';

const LEG_NAMES = ['FR', 'FL', 'HR', 'HL'] as const;
const EYE = 0x15141b, HILITE = 0xffffff;

// ------------------------------------------------------------------ colours

interface Coat { base: number; dark: number; light: number; nose: number; ear: number; stripes: boolean; bib: number; socks: boolean; patches: boolean }
const CAT_COATS: readonly Coat[] = [
  { base: 0xf3a043, dark: 0xd1731f, light: 0xffe7bd, nose: 0xf59aa6, ear: 0xf7a79f, stripes: true, bib: 0.6, socks: false, patches: false },   // ginger tabby
  { base: 0xa3afc4, dark: 0x6b7894, light: 0xf6f2ea, nose: 0xf59aa6, ear: 0xf2b1b6, stripes: true, bib: 0.8, socks: false, patches: false },   // blue-grey tabby
  { base: 0x3a4058, dark: 0x3a4058, light: 0xfbf7ee, nose: 0xf08c9c, ear: 0xf2a0aa, stripes: false, bib: 1, socks: true, patches: false },    // tuxedo
  { base: 0xfbf6ec, dark: 0x3b3b4a, light: 0xfbf6ec, nose: 0xf59aa6, ear: 0xf7a79f, stripes: false, bib: 0, socks: false, patches: true },    // calico
];
const calico = (x: number, y: number, z: number): number => Math.sin(x * 21 + z * 9.5) + Math.sin(z * 14 - y * 12 + 1.7) + Math.sin(x * 8 + y * 19 + z * 5.5 + 0.6);

// ------------------------------------------------------------------ skeleton descriptions

interface Spec {
  kind: 'cat' | 'dog';
  scale: number;
  /** Rig-space joints. */
  hips: V3; mid: V3; chest: V3; neck: V3; head: V3;
  tail: readonly V3[];
  shoulder: V3; elbow: V3; wrist: V3; hip: V3; knee: V3; ankle: V3;
  /** Gait: body travel per cycle, step lift, speed at which the stride is full, stance fraction. */
  cycle: number; lift: number; fullSpeed: number; duty: number;
}
const CAT: Spec = {
  kind: 'cat', scale: 1.25,
  hips: [0, 0.215, 0.105], mid: [0, 0.215, -0.015], chest: [0, 0.22, -0.105], neck: [0, 0.255, -0.165], head: [0, 0.295, -0.21],
  tail: [[0, 0.235, 0.185], [0, 0.238, 0.255], [0, 0.241, 0.325], [0, 0.244, 0.395], [0, 0.247, 0.465]],
  shoulder: [0.062, 0.19, -0.125], elbow: [0.062, 0.105, -0.125], wrist: [0.062, 0.03, -0.125],
  hip: [0.068, 0.19, 0.12], knee: [0.068, 0.105, 0.12], ankle: [0.068, 0.03, 0.12],
  cycle: 0.26, lift: 0.04, fullSpeed: 0.5, duty: 0.62,
};
const DOG: Spec = {
  kind: 'dog', scale: 1.2,
  hips: [0, 0.33, 0.13], mid: [0, 0.335, 0.0], chest: [0, 0.34, -0.14], neck: [0, 0.4, -0.24], head: [0, 0.44, -0.3],
  tail: [[0, 0.4, 0.245], [0, 0.42, 0.305], [0, 0.45, 0.36], [0, 0.49, 0.405]],
  shoulder: [0.09, 0.28, -0.155], elbow: [0.09, 0.16, -0.155], wrist: [0.09, 0.045, -0.155],
  hip: [0.095, 0.28, 0.145], knee: [0.095, 0.16, 0.145], ankle: [0.095, 0.045, 0.145],
  cycle: 0.42, lift: 0.06, fullSpeed: 1.0, duty: 0.55,
};

function mirrored(v: V3, side: number): V3 { return [v[0] * side, v[1], v[2]]; }

// ------------------------------------------------------------------ the animator

const _pos = new THREE.Vector3(), _scl = new THREE.Vector3(), _p1 = new THREE.Vector3();

export class Quadruped {
  readonly group = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly kind: 'cat' | 'dog';
  private readonly spec: Spec;
  private readonly bones: THREE.Bone[];
  private readonly rest: THREE.Vector3[];
  private readonly b: Record<string, number> = {};
  private readonly legs: Leg[] = [];
  private readonly neutral: THREE.Vector3[] = [];
  private readonly tail: number[] = [];
  private readonly A: Pose; private readonly R: Pose; private readonly P: Pose;
  private readonly footA = [0, 1, 2, 3].map(() => new THREE.Vector3());
  private readonly footR = [0, 1, 2, 3].map(() => new THREE.Vector3());
  private readonly poleA = [0, 1, 2, 3].map(() => new THREE.Vector3());
  private readonly poleR = [0, 1, 2, 3].map(() => new THREE.Vector3());
  private readonly goal = new THREE.Vector3();
  private readonly pole = new THREE.Vector3();
  private readonly worldQ = new THREE.Quaternion();
  private readonly invGroup = new THREE.Matrix4();
  private readonly seed: number;
  /** +1/-1: which way the tail wraps and which paw washes. */
  private readonly side: number;
  private gait = 0; private lastDistance = NaN; private moveAmt = 0;
  private wagPhase = 0; private purrPhase = 0; private breathPhase = 0; private pantPhase = 0;
  private initialized = false;

  constructor(kind: 'cat' | 'dog', coat = 0, seed = 0) {
    this.kind = kind; this.seed = seed + coat * 13 + (kind === 'dog' ? 5 : 0); this.side = this.seed % 2 ? -1 : 1;
    this.spec = kind === 'cat' ? CAT : DOG;
    const rig = new RigBuilder();
    if (kind === 'cat') buildCat(rig, CAT_COATS[coat % CAT_COATS.length]); else buildDog(rig);
    this.mesh = rig.build(`${kind}-${coat}`);
    this.bones = rig.bones; this.rest = rig.localRest;
    rig.names.forEach((n, i) => { this.b[n] = i; });
    for (let i = 0; this.b[`tail${i}`] !== undefined; i++) this.tail.push(this.b[`tail${i}`]);
    this.group.name = `${kind}-${coat}`; this.group.add(this.mesh); this.group.scale.setScalar(this.spec.scale);
    this.A = new Pose(this.bones.length); this.R = new Pose(this.bones.length); this.P = new Pose(this.bones.length);
    for (let i = 0; i < 4; i++) {
      const n = LEG_NAMES[i];
      this.legs.push(new Leg(this.bones[this.b[`${n}u`]], this.bones[this.b[`${n}l`]], this.bones[this.b[`${n}p`]]));
      const src = i < 2 ? this.spec.wrist : this.spec.ankle, side = i % 2 ? -1 : 1;
      this.neutral.push(new THREE.Vector3(src[0] * side, this.kind === 'cat' ? 0.026 : 0.04, src[2]));
    }
  }

  /** Pose the whole animal. `t` is the shared animation clock (seconds), `dt` the frame time. */
  update(p: CritterPose, t: number, dt: number, animate = true): void {
    this.group.position.set(p.x, p.y, p.z); this.group.rotation.set(0, p.yaw, 0);
    if (!animate && this.initialized) return;
    this.initialized = true;
    dt = clamp(dt, 0, 0.1);
    const s = this.spec;
    // the gait follows travelled distance, never the clock: feet stay planted at any speed
    if (Number.isFinite(this.lastDistance)) {
      const stride = s.cycle * s.scale * (1 + 0.35 * ease(p.speed / (s.fullSpeed * 2.4)));
      this.gait += clamp(p.distance - this.lastDistance, 0, 0.6) / stride;
    }
    this.lastDistance = p.distance;
    this.moveAmt = ease(p.speed / (s.fullSpeed * 0.55));
    this.wagPhase += dt * Math.PI * (3 + 9 * clamp01(p.excite) + (p.mood === 'greet' ? 3 : 0));
    this.purrPhase += dt * 25 * Math.PI * 2;
    this.breathPhase += dt * ((p.action === 'sleep' ? 0.3 : 0.5) + (p.mood === 'purr' ? 0.12 : 0) + 0.3 * this.moveAmt) * Math.PI * 2;
    this.pantPhase += dt * (3.4 + 2.2 * this.moveAmt) * Math.PI * 2;

    this.A.reset(); this.basePose(p, t);
    const w = clamp01(p.restWeight);
    this.R.copy(this.A);
    if (w > 0.001) this.restPose(p, t); else for (let i = 0; i < 4; i++) { this.footR[i].copy(this.footA[i]); this.poleR[i].copy(this.poleA[i]); }
    this.P.mixOf(this.A, this.R, w);
    this.layers(p, t, w);
    this.P.apply(this.bones, this.rest);
    this.group.updateMatrixWorld(true);
    this.invGroup.copy(this.group.matrixWorld).invert();
    if (w > 0.001) this.restFeet(p, t);
    this.group.matrixWorld.decompose(_pos, this.worldQ, _scl);
    for (let i = 0; i < 4; i++) {
      this.goal.copy(this.footA[i]).lerp(this.footR[i], w).applyMatrix4(this.group.matrixWorld);
      this.pole.copy(this.poleA[i]).lerp(this.poleR[i], w).transformDirection(this.group.matrixWorld);
      this.legs[i].solve(this.goal, this.pole);
      this.legs[i].orientPaw(this.worldQ);
    }
  }

  private rigPoint(bone: string, local: V3, out: THREE.Vector3): THREE.Vector3 {
    return out.set(local[0], local[1], local[2]).applyMatrix4(this.bones[this.b[bone]].matrixWorld).applyMatrix4(this.invGroup);
  }

  // ---------------------------------------------------------------- stand / walk / trot

  private basePose(p: CritterPose, t: number): void {
    const s = this.spec, A = this.A, B = this.b, cat = this.kind === 'cat';
    const walk = this.moveAmt, speedK = ease(p.speed / (s.fullSpeed * 2));
    const trot = ease((p.speed - s.fullSpeed * 0.9) / (s.fullSpeed * 0.8));
    const duty = mix(s.duty, 0.46, trot), stride = s.cycle * duty * (1 + 0.35 * ease(p.speed / (s.fullSpeed * 2.4)));
    const order = [0, 0.5, 0.25 + 0.25 * trot, 0.75 - 0.75 * trot]; // FR, FL, HR, HL: lateral walk becoming a diagonal trot
    for (let i = 0; i < 4; i++) {
      const psi = (((this.gait + order[i]) % 1) + 1) % 1;
      let fwd = 0, up = 0;
      if (psi < duty) fwd = stride * (0.5 - psi / duty);
      else { const u = (psi - duty) / (1 - duty); fwd = stride * (-0.5 + ease(u)); up = s.lift * Math.sin(Math.PI * u) * (0.6 + 0.4 * speedK); }
      this.footA[i].copy(this.neutral[i]); this.footA[i].z -= fwd * walk; this.footA[i].y += up * walk;
      this.poleA[i].set(0, 0.35, 1).normalize();
    }
    // body: bob twice per cycle, sway once, the spine wiggles against the shoulders, the head stays level-ish
    const g = this.gait * Math.PI * 2, bob = (cat ? 0.007 : 0.012) * walk * (0.5 + 0.5 * speedK), sway = (cat ? 0.035 : 0.025) * walk;
    A.p(B.hips, 0, (cat ? -0.026 : -0.02) - bob * (0.5 + 0.5 * Math.cos(2 * g)), 0);
    A.r(B.hips, 0, 0, sway * Math.sin(g));
    A.r(B.mid, 0, sway * 1.6 * Math.sin(g + Math.PI), 0);
    A.r(B.chest, 0, sway * 1.2 * Math.sin(g), -sway * 0.6 * Math.sin(g));
    A.r(B.neck, -0.12 + 0.06 * walk * Math.cos(2 * g), -sway * 1.4 * Math.sin(g), 0);
    A.r(B.head, 0.1 - 0.04 * walk * Math.cos(2 * g), 0, 0);
    this.tail.forEach((ti, k) => {
      if (cat) {
        const wave = Math.sin(this.wagPhase * 0.25 - k * 0.9) * (0.07 + 0.05 * walk) * (0.4 + k * 0.3);
        A.r(ti, [-0.7, -0.45, -0.25, 0.1, 0.5][k] + wave * 0.5, wave, 0);
      } else A.r(ti, -0.55 + k * 0.06, this.wagYaw(k, p.excite), 0);
    });
    void t;
  }

  /** Dog tail wag: a wave running down the chain, wider and quicker when excited. */
  private wagYaw(k: number, excite: number): number { return Math.sin(this.wagPhase - k * 0.7) * (0.28 + 0.4 * clamp01(excite)) * (1 - k * 0.12); }

  // ---------------------------------------------------------------- rest postures (sit, groom, sleep, sniff)

  private restPose(p: CritterPose, t: number): void {
    const R = this.R, B = this.b, cat = this.kind === 'cat', W = this.side;
    const age = p.age;
    if (p.action === 'sit' || p.action === 'groom') {
      // upright on the haunches, front legs straight down, tail wrapped round the feet
      R.p(B.hips, 0, cat ? -0.118 : -0.2, cat ? 0.015 : 0.01);
      R.r(B.hips, cat ? 0.78 : 0.72, 0, 0); R.r(B.mid, -0.08, 0, 0); R.r(B.chest, -0.2, 0, 0);
      R.r(B.neck, cat ? -0.28 : -0.34, 0, 0); R.r(B.head, cat ? -0.1 : -0.06, 0, 0);
      if (cat) this.tail.forEach((ti, k) => R.r(ti, k === 0 ? -0.75 : -0.04, W * 0.6, 0));
      else this.tail.forEach((ti, k) => R.r(ti, k === 0 ? 0.3 : -0.1, this.wagYaw(k, p.excite), 0));
      if (p.action === 'groom') this.groomPose(age, t);
    } else if (p.action === 'sleep') {
      // curled up: belly on the ground, the spine bends round, the head rests on the paws
      const stretch = cat || true ? ease(clamp01((1.7 - p.remaining) / 0.5)) * ease(clamp01(p.remaining / 0.7)) : 0;
      R.p(B.hips, 0, cat ? -0.108 : -0.17, 0);
      R.r(B.hips, 0, -0.12 * W, 0); R.r(B.mid, 0.04, 0.72 * W, 0); R.r(B.chest, 0.06, 0.86 * W, 0);
      R.r(B.neck, cat ? -0.5 : -0.4, 0.4 * W, 0); R.r(B.head, cat ? -0.3 : -0.32, 0.3 * W, 0);
      this.tail.forEach((ti, k) => R.r(ti, k === 0 ? 0.1 : 0.04, W * (cat ? 0.72 : 0.5), 0));
      if (stretch > 0) {
        // waking: a long cat stretch (front down, rump up, tail high)
        const tgt = (a: number, b: number): number => mix(a, b, stretch);
        R.p(B.hips, 0, tgt(cat ? -0.108 : -0.17, cat ? -0.03 : -0.05), 0);
        R.r(B.hips, tgt(0, -0.3), tgt(-0.1 * W, 0), 0); R.r(B.mid, tgt(0.04, 0.12), tgt(0.62 * W, 0), 0); R.r(B.chest, tgt(0.06, 0.45), tgt(0.74 * W, 0), 0);
        R.r(B.neck, tgt(cat ? -0.5 : -0.4, 0.25), tgt(0.4 * W, 0), 0); R.r(B.head, tgt(cat ? -0.3 : -0.32, 0.1), tgt(0.3 * W, 0), 0);
      }
    } else if (p.action === 'sniff') {
      // head to the ground, nose wobbling
      const nose = Math.sin(this.pantPhase * 2.2) * 0.05;
      R.r(B.chest, cat ? -0.12 : -0.16, 0, 0); R.r(B.neck, -(cat ? 0.5 : 0.62) + nose, Math.sin(t * 1.1) * 0.25, 0); R.r(B.head, -(cat ? 0.38 : 0.45) + nose, 0, 0);
      R.p(B.hips, 0, cat ? -0.036 : -0.03, 0);
    }
  }

  /** Cat grooming: lick the raised paw, then wash the face, then a pause (cycle of 7.2 s). */
  private groomPose(age: number, t: number): void {
    const R = this.R, B = this.b, W = this.side, u = age % 7.2;
    const lick = ease(clamp01(u / 0.5)) * (1 - ease(clamp01((u - 2.7) / 0.4))), wash = ease(clamp01((u - 3) / 0.4)) * (1 - ease(clamp01((u - 5.8) / 0.4)));
    const nod = Math.sin(t * Math.PI * 2 * 1.8);
    R.radd(B.neck, -0.38 * lick - 0.3 * wash - 0.05 * nod * lick, -0.35 * W * lick - 0.15 * W * wash, 0); R.radd(B.head, -0.12 * lick - 0.22 * wash - 0.08 * nod * lick, -0.2 * W * lick, 0);
    R.radd(B.chest, -0.06 * (lick + wash), 0, 0);
  }

  // ---------------------------------------------------------------- feet for the rest postures (need the posed bones)

  private restFeet(p: CritterPose, t: number): void {
    const cat = this.kind === 'cat', y = this.neutral[0].y, W = this.side;
    const hips = this.rigPoint('hips', [0, 0, 0], _p1);
    const hx = hips.x, hz = hips.z;
    const set = (i: number, x: number, z: number, py = y, pole: V3 = [0, 0.3, 1]): void => { this.footR[i].set(x, py, z); this.poleR[i].set(pole[0], pole[1], pole[2]).normalize(); };
    if (p.action === 'sit' || p.action === 'groom') {
      for (let i = 0; i < 2; i++) { const side = i ? -1 : 1, sh = this.rigPoint(`${LEG_NAMES[i]}u`, [0, 0, 0], _p1); set(i, side * (cat ? 0.058 : 0.085), sh.z + (cat ? 0.012 : 0.015)); }
      set(2, hx + (cat ? 0.1 : 0.15), hz - (cat ? 0.085 : 0.1), y, [1, 1.1, -0.4]); set(3, hx - (cat ? 0.1 : 0.15), hz - (cat ? 0.085 : 0.1), y, [-1, 1.1, -0.4]);
      if (p.action === 'groom') {
        // the washing paw rises to the face and works it
        const u = p.age % 7.2, lick = ease(clamp01(u / 0.5)) * (1 - ease(clamp01((u - 2.7) / 0.4))), wash = ease(clamp01((u - 3) / 0.4)) * (1 - ease(clamp01((u - 5.8) / 0.4)));
        const i = W > 0 ? 0 : 1, side = W, head = this.rigPoint('head', [0, 0, 0], _p1);
        const k = lick + wash, c = Math.cos(t * Math.PI * 2 * 1.8), s = Math.sin(t * Math.PI * 2 * 1.8);
        const lx = head.x + side * (0.03 - 0.012 * wash * c), ly = head.y - 0.06 + 0.02 * (lick * c * 0.5 + wash * (1 + s)), lz = head.z - 0.07 + 0.012 * s * lick;
        this.footR[i].lerp(_p1.set(lx, ly, lz), ease(k)); this.poleR[i].set(side, 0.5, 0.8).normalize();
      }
    } else if (p.action === 'sleep') {
      const chest = this.rigPoint('chest', [0, 0, 0], _p1);
      const cx = chest.x, cz = chest.z;
      set(0, cx + 0.05, cz - 0.075, y, [1, 0.5, 0.3]); set(1, cx - 0.05, cz - 0.075, y, [-1, 0.5, 0.3]);
      set(2, hx + 0.085, hz - 0.03, y, [1, 0.6, 0]); set(3, hx - 0.085, hz - 0.03, y, [-1, 0.6, 0]);
    }
    // 'sniff': the base stance already puts the feet right
  }

  // ---------------------------------------------------------------- additive layers: breath, eyes, ears, tail, gaze, moods

  private layers(p: CritterPose, t: number, w: number): void {
    const P = this.P, B = this.b, cat = this.kind === 'cat', mood = p.mood;
    const sleeping = p.action === 'sleep' && w > 0.4;
    // breathing: slow when asleep, a little deeper when purring
    const br = Math.sin(this.breathPhase) * (sleeping ? 0.034 : 0.016 + (mood === 'purr' ? 0.01 : 0));
    P.s(B.chest, 1 + br * 0.5, 1 + br, 1 + br * 0.5); P.s(B.mid, 1 + br * 0.3, 1 + br * 0.6, 1);
    // eyes: a quick blink every few seconds, shut when asleep or happy
    let lid = 1;
    const blink = pulse(t, 3.4 + (this.seed % 5) * 0.8, this.seed, 0.17);
    if (blink >= 0) lid = 1 - Math.sin(blink * Math.PI) * 0.92;
    if (sleeping) lid = mix(lid, 0.08, ease((w - 0.4) / 0.4));
    if (mood === 'purr') lid = Math.min(lid, 0.14); else if (mood === 'hiss') lid = Math.min(lid, 0.38); else if (mood === 'alert') lid *= 1.12;
    // yawn (dogs while sitting)
    let yawn = 0;
    if (!cat && p.action === 'sit' && p.age > 2.3 && p.age < 4.1 && p.remaining > 1.5) { const u = (p.age - 2.3) / 1.8; yawn = Math.pow(Math.sin(u * Math.PI), 0.7); lid = Math.min(lid, 1 - 0.8 * yawn); }
    P.s(B.eyeR, 1, lid, 1); P.s(B.eyeL, 1, lid, 1);
    // ears: idle flicks, forward when alert, flat when frightened or hissing, loose when asleep
    const flick = pulse(t, 7.5 + (this.seed % 4), this.seed + 3, 0.28), flickSide = (this.seed % 2) ? B.earL : B.earR;
    const flat = clamp01(Math.max(p.alarm, mood === 'hiss' ? 1 : 0, mood === 'scare' ? 0.8 : 0));
    const fwd = mood === 'alert' || mood === 'greet' ? 1 : 0;
    for (const [ear, side] of [[B.earR, 1], [B.earL, -1]] as const) {
      const f = ear === flickSide && flick >= 0 ? Math.sin(flick * Math.PI * 2) * (cat ? 0.4 : 0.25) : 0;
      if (cat) P.r(ear, 0.6 * flat - 0.22 * fwd - 0.06 * ease(w) * (sleeping ? 1 : 0), 0, side * (1.1 * flat + 0.25 * (sleeping ? 1 : 0)) + f);
      else {
        const swing = Math.sin(this.gait * Math.PI * 2 * 2) * 0.18 * this.moveAmt;
        P.r(ear, 0.1 * flat - 0.18 * fwd + swing, 0, side * (0.1 + 0.45 * flat - 0.15 * fwd) + f);
      }
    }
    // tail by mood
    const tail = this.tail;
    if (cat) {
      if (mood === 'purr' || mood === 'greet') tail.forEach((ti, k) => P.r(ti, [-0.9, -0.3, -0.1, 0.1, 0.45][k] + Math.sin(this.wagPhase * 0.3 + k) * 0.03, Math.sin(this.wagPhase * 0.4 - k * 0.7) * 0.06 * (k + 1) * 0.5, 0));
      else if (mood === 'hiss') { tail.forEach((ti, k) => P.r(ti, [-0.8, -0.5, -0.3, -0.1, 0.35][k], 0, 0)); P.s(tail[0], 1.65, 1.65, 1); }
      else if (mood === 'scare') tail.forEach((ti, k) => P.r(ti, k === 0 ? 0.45 : 0.1, 0, 0));
    } else if (mood === 'scare') tail.forEach((ti, k) => P.r(ti, k === 0 ? 0.6 : 0.2, 0, 0));
    // gaze: the head turns toward whatever the animal is watching
    if (p.look > 0.001) {
      const k = clamp01(p.look), yaw = clamp(p.lookYaw, -1.2, 1.2), pitch = clamp(p.lookPitch, -0.5, 0.5);
      P.radd(B.neck, 0.4 * pitch * k, 0.45 * yaw * k, 0); P.radd(B.head, 0.5 * pitch * k, 0.55 * yaw * k, -0.15 * yaw * k);
    }
    // moods that change the body
    if (mood === 'purr') {
      P.radd(B.neck, 0.1, 0, 0); P.radd(B.head, -0.16, 0, 0);
      P.padd(B.hips, 0, 0.0016 * Math.sin(this.purrPhase), 0);
    } else if (mood === 'hiss') {
      P.s(B.hips, 1.1); P.s(B.mid, 1.08); P.s(B.chest, 1.12); P.padd(B.hips, 0, 0.03, 0);       // fluffed up (uniform: legs hang off these bones)
      P.radd(B.mid, -0.2, 0, 0); P.radd(B.chest, 0.18, 0, 0); P.radd(B.head, 0.1, 0, 0);
    } else if (mood === 'scare') {
      P.padd(B.hips, 0, -0.03, 0); P.radd(B.neck, -0.12, 0, 0);
    } else if (mood === 'alert') {
      P.radd(B.neck, 0.14, 0, 0); P.radd(B.head, 0.06, 0, 0);
    } else if (mood === 'greet') {
      const bounce = Math.abs(Math.sin(t * 5.2)) * (cat ? 0.01 : 0.03);
      P.padd(B.hips, 0, bounce, 0); P.radd(B.neck, 0.1, 0, 0);
    }
    // dogs: jaw and tongue (pant, yawn)
    if (!cat) {
      const calm = p.action === 'sit' ? 0.25 : 0, pant = clamp01(Math.max(this.moveAmt * 0.8, mood === 'greet' ? 1 : 0, calm));
      const open = pant * (0.1 + 0.09 * (0.5 + 0.5 * Math.sin(this.pantPhase))) + 0.75 * yawn;
      P.r(B.jaw, -open, 0, 0);
      P.p(B.tongue, 0, -0.004 - 0.014 * pant, -0.012 * pant); P.s(B.tongue, 1, 1, 1 + 0.5 * pant + 0.3 * yawn);
      P.radd(B.head, 0.3 * yawn, 0, 0);
    }
  }
}

// ------------------------------------------------------------------ cat geometry

function catColors(c: Coat): { body: Paint; head: Paint; tail: Paint; leg: Paint; paw: Paint } {
  const stripe = (x: number, y: number, z: number): boolean => c.stripes && y > 0.2 && Math.sin(z * 52 + Math.sin(x * 30) * 0.9) > 0.5;
  const base = (x: number, y: number, z: number): number => {
    if (c.patches) { const n = calico(x, y, z); return n > 1.15 ? 0xf0903a : n < -1.25 ? 0x3b3b4a : c.base; }
    return c.base;
  };
  const light = (x: number, y: number, z: number): boolean => y < 0.165 + 0.02 * Math.sin(z * 14) || (z < -0.09 && y < 0.17 + 0.07 * c.bib && Math.abs(x) < 0.075 * (0.5 + c.bib * 0.6));
  return {
    body: (x, y, z) => (light(x, y, z) ? c.light : stripe(x, y, z) ? c.dark : base(x, y, z)),
    head: (x, y, z) => {
      if (y < 0.268 && z < -0.23) return c.light;
      if (c.stripes && y > 0.335 && z > -0.26 && (Math.abs(x) < 0.007 || Math.abs(Math.abs(x) - 0.024) < 0.006)) return c.dark;
      if (c.socks && z < -0.25 && y < 0.3 && Math.abs(x) < 0.025) return c.light;
      return base(x, y, z);
    },
    tail: (x, y, z) => (c.stripes && Math.sin(z * 58) > 0.35 ? c.dark : c.patches ? base(x, y, z) : c.base),
    leg: (x, y, z) => (c.stripes && y > 0.09 && Math.sin(y * 90) > 0.55 ? c.dark : c.socks || c.patches ? (y < 0.1 ? c.light : base(x, y, z)) : c.base),
    paw: () => (c.socks ? c.light : c.patches ? c.light : c.stripes ? c.light : c.base),
  };
}

function buildCat(rig: RigBuilder, c: Coat): void {
  const s = CAT, col = catColors(c);
  rig.bone('hips', s.hips); rig.bone('mid', s.mid, 'hips'); rig.bone('chest', s.chest, 'mid');
  rig.bone('neck', s.neck, 'chest'); rig.bone('head', s.head, 'neck');
  for (const side of [1, -1]) {
    const n = side > 0 ? 'R' : 'L';
    rig.bone(`ear${n}`, [0.06 * side, 0.35, -0.2], 'head'); rig.bone(`eye${n}`, [0.046 * side, 0.305, -0.272], 'head');
  }
  s.tail.forEach((v, i) => rig.bone(`tail${i}`, v, i === 0 ? 'hips' : `tail${i - 1}`));
  LEG_NAMES.forEach((n, i) => {
    const side = i % 2 ? -1 : 1, front = i < 2, top = front ? s.shoulder : s.hip, mid = front ? s.elbow : s.knee, low = front ? s.wrist : s.ankle;
    rig.bone(`${n}u`, mirrored(top, side), front ? 'chest' : 'hips'); rig.bone(`${n}l`, mirrored(mid, side), `${n}u`); rig.bone(`${n}p`, mirrored(low, side), `${n}l`);
  });
  // torso: one lofted body skinned across hips / mid / chest
  const torso = loft([
    [-0.19, 0.205, 0.0, 0.03, 0.035], [-0.165, 0.21, 0.0, 0.065, 0.075], [-0.13, 0.215, 0.0, 0.088, 0.098], [-0.09, 0.218, 0.0, 0.095, 0.104],
    [-0.04, 0.214, 0.0, 0.088, 0.097], [0.0, 0.21, 0.0, 0.082, 0.09], [0.04, 0.21, 0.0, 0.085, 0.092], [0.08, 0.212, 0.0, 0.092, 0.098],
    [0.12, 0.212, 0.0, 0.095, 0.1], [0.16, 0.208, 0.0, 0.086, 0.09], [0.195, 0.205, 0.0, 0.062, 0.066], [0.215, 0.2, 0.0, 0.03, 0.03],
  ].map(([z, cy, , rx, ry]) => [z, 0, cy, rx, ry] as const), 'z', 18);
  rig.add(torso, col.body, 'hips', rig.chainAt(['chest', 'mid', 'hips'], 'z', [-0.11, 0.0, 0.1]));
  // head: skull, cheeks, whisker pads, nose, mouth, ears, eyes, whiskers
  const H = s.head;
  rig.add(ellipsoid(0.092, 0.083, 0.083, [0, 0.297, -0.213], [16, 11]), col.head, 'head');
  for (const side of [1, -1]) {
    rig.add(ellipsoid(0.042, 0.036, 0.04, [0.064 * side, 0.272, -0.238], [10, 7]), col.head, 'head');
    rig.add(ellipsoid(0.03, 0.026, 0.03, [0.017 * side, 0.265, -0.272], [10, 7]), c.light, 'head');
  }
  rig.add(ellipsoid(0.016, 0.012, 0.012, [0, 0.282, -0.303], [8, 6]), c.nose, 'head');
  const dark = 0x6a3b3f;
  rig.add(tube([[0, 0.277, -0.31], [0, 0.265, -0.31]], 0.0022, { radial: 5, samples: 2 }), dark, 'head');
  for (const side of [1, -1]) rig.add(tube([[0, 0.265, -0.31], [0.013 * side, 0.255, -0.305], [0.028 * side, 0.256, -0.296]], 0.0021, { radial: 5, samples: 4 }), dark, 'head');
  for (const side of [1, -1]) {
    const n = side > 0 ? 'R' : 'L', ear = rig.restOf(`ear${n}`);
    // outer ear (coat) and inner ear (pink), both tilted away from the head
    const outer = place(ellipsoid(0.042, 0.062, 0.02, [0, 0.03, 0], [10, 8]), [ear.x, ear.y, ear.z], [-0.12, 0, -0.32 * side]);
    const inner = place(ellipsoid(0.027, 0.045, 0.012, [0, 0.026, -0.011], [8, 6]), [ear.x, ear.y, ear.z], [-0.12, 0, -0.32 * side]);
    rig.add(outer, col.head, `ear${n}`); rig.add(inner, c.ear, `ear${n}`);
    const eye = rig.restOf(`eye${n}`);
    rig.add(place(ellipsoid(0.0185, 0.0205, 0.012, [0, 0, 0], [10, 8]), [eye.x, eye.y, eye.z], [0, -0.25 * side, 0]), EYE, `eye${n}`);
    rig.add(ellipsoid(0.0062, 0.0062, 0.004, [eye.x + 0.006 * side, eye.y + 0.008, eye.z - 0.0105], [6, 5]), HILITE, `eye${n}`);
    for (let k = -1; k <= 1; k++) rig.add(tube([[0.03 * side, 0.268 + k * 0.006, -0.292], [0.07 * side, 0.272 + k * 0.016, -0.286], [0.115 * side, 0.268 + k * 0.026, -0.27]], 0.0017, { radial: 4, samples: 3 }), 0xfaf6ee, 'head');
  }
  // tail
  const tp = s.tail.map((v) => [v[0], v[1], v[2]] as V3);
  rig.add(tube([[0, 0.235, 0.17], ...tp.slice(1), [0, 0.248, 0.505]], [0.034, 0.03, 0.026, 0.022, 0.019, 0.017], { radial: 9, samples: 12 }), col.tail, 'tail0',
    rig.chainAt(['tail0', 'tail1', 'tail2', 'tail3', 'tail4'], 'z', [0.185, 0.255, 0.325, 0.395, 0.465]));
  // legs: thigh / shoulder mass on the body, upper + lower limb capsules, paws
  LEG_NAMES.forEach((n, i) => {
    const side = i % 2 ? -1 : 1, front = i < 2, top = mirrored(front ? s.shoulder : s.hip, side), mid = mirrored(front ? s.elbow : s.knee, side), low = mirrored(front ? s.wrist : s.ankle, side);
    rig.add(ellipsoid(front ? 0.046 : 0.054, front ? 0.065 : 0.075, front ? 0.06 : 0.07, [top[0] * 1.04, top[1] + 0.005, top[2] + (front ? 0.0 : 0.005)], [10, 7]), col.leg, front ? 'chest' : 'hips');
    rig.add(tube([top, mid], [0.034, 0.027], { radial: 8, samples: 3 }), col.leg, `${n}u`);
    rig.add(tube([mid, low], [0.027, 0.023], { radial: 8, samples: 3 }), col.leg, `${n}l`);
    rig.add(ellipsoid(0.031, 0.026, 0.042, [low[0], 0.026, low[2] - 0.012], [10, 7]), col.paw, `${n}p`);
  });
  void H;
}

// ------------------------------------------------------------------ dog geometry

function buildDog(rig: RigBuilder): void {
  const s = DOG;
  const FUR = 0xdc9a4c, FUR_DARK = 0xa9672c, CREAM = 0xfdecc8, NOSE = 0x2a2326, TONGUE = 0xf0728a, COLLAR = 0xe5483f, TAG = 0xf6c33d;
  rig.bone('hips', s.hips); rig.bone('mid', s.mid, 'hips'); rig.bone('chest', s.chest, 'mid');
  rig.bone('neck', s.neck, 'chest'); rig.bone('head', s.head, 'neck'); rig.bone('jaw', [0, 0.418, -0.345], 'head'); rig.bone('tongue', [0, 0.4, -0.43], 'jaw');
  for (const side of [1, -1]) {
    const n = side > 0 ? 'R' : 'L';
    rig.bone(`ear${n}`, [0.088 * side, 0.52, -0.3], 'head'); rig.bone(`eye${n}`, [0.058 * side, 0.487, -0.395], 'head');
  }
  s.tail.forEach((v, i) => rig.bone(`tail${i}`, v, i === 0 ? 'hips' : `tail${i - 1}`));
  LEG_NAMES.forEach((n, i) => {
    const side = i % 2 ? -1 : 1, front = i < 2, top = front ? s.shoulder : s.hip, mid = front ? s.elbow : s.knee, low = front ? s.wrist : s.ankle;
    rig.bone(`${n}u`, mirrored(top, side), front ? 'chest' : 'hips'); rig.bone(`${n}l`, mirrored(mid, side), `${n}u`); rig.bone(`${n}p`, mirrored(low, side), `${n}l`);
  });
  const coat = (x: number, y: number, z: number): number => {
    if (y < 0.3 && z < -0.1 && Math.abs(x) < 0.1) return CREAM;                         // white chest
    if (y < 0.255) return CREAM;                                                         // belly
    if (y > 0.42 && z > -0.1 && z < 0.2 && Math.abs(x) < 0.09) return FUR_DARK;          // darker saddle
    return FUR;
  };
  const torso = loft([
    [-0.25, 0.36, 0.07, 0.08], [-0.215, 0.355, 0.112, 0.128], [-0.15, 0.345, 0.138, 0.156], [-0.07, 0.34, 0.14, 0.158], [0.02, 0.335, 0.13, 0.148],
    [0.1, 0.335, 0.134, 0.152], [0.17, 0.335, 0.138, 0.152], [0.225, 0.33, 0.118, 0.13], [0.265, 0.325, 0.07, 0.074], [0.282, 0.322, 0.028, 0.028],
  ].map(([z, cy, rx, ry]) => [z, 0, cy, rx, ry] as const), 'z', 16);
  rig.add(torso, coat, 'hips', rig.chainAt(['chest', 'mid', 'hips'], 'z', [-0.14, 0.0, 0.15]));
  rig.add(ellipsoid(0.092, 0.1, 0.105, [0, 0.4, -0.255], [12, 9]), coat, 'neck');                     // neck
  // head: big round skull, short cream muzzle, nose, floppy ears, bead eyes with highlights
  rig.add(ellipsoid(0.114, 0.106, 0.11, [0, 0.455, -0.31], [18, 12]), FUR, 'head');
  rig.add(ellipsoid(0.053, 0.044, 0.062, [0, 0.428, -0.388], [12, 8]), CREAM, 'head');                // muzzle
  rig.add(ellipsoid(0.056, 0.036, 0.062, [0, 0.446, -0.384], [12, 8]), FUR, 'head');                  // brow over it
  rig.add(ellipsoid(0.031, 0.025, 0.026, [0, 0.453, -0.446], [10, 7]), NOSE, 'head');                 // nose
  rig.add(ellipsoid(0.036, 0.012, 0.055, [0, 0.41, -0.395], [10, 6]), 0x7a2f3e, 'head');              // mouth inside
  rig.add(tube([[0, 0.415, -0.345], [0, 0.4, -0.425]], [0.038, 0.03], { radial: 8, samples: 3 }), CREAM, 'jaw');
  rig.add(ellipsoid(0.025, 0.008, 0.05, [0, 0.396, -0.405], [8, 5]), TONGUE, 'tongue');
  for (const side of [1, -1]) {
    const n = side > 0 ? 'R' : 'L', ear = rig.restOf(`ear${n}`), eye = rig.restOf(`eye${n}`);
    rig.add(place(ellipsoid(0.03, 0.082, 0.05, [0.03 * side, -0.07, 0.01], [10, 8]), [ear.x, ear.y, ear.z], [0, 0, -0.28 * side]), FUR_DARK, `ear${n}`);
    rig.add(place(ellipsoid(0.0245, 0.0275, 0.016, [0, 0, 0], [10, 8]), [eye.x, eye.y, eye.z], [0, -0.28 * side, 0]), EYE, `eye${n}`);
    rig.add(ellipsoid(0.0085, 0.0085, 0.005, [eye.x + 0.008 * side, eye.y + 0.011, eye.z - 0.0125], [6, 5]), HILITE, `eye${n}`);
    rig.add(ellipsoid(0.021, 0.0075, 0.014, [0.056 * side, 0.532, -0.382], [8, 5]), FUR_DARK, 'head');   // brow dot
  }
  // collar and tag around the neck
  const ring: V3[] = [], cc: V3 = [0, 0.4, -0.245];
  for (let k = 0; k <= 14; k++) { const a = (k / 14) * Math.PI * 2; ring.push([cc[0] + Math.cos(a) * 0.097, cc[1] + Math.sin(a) * 0.108 * 0.85, cc[2] + Math.sin(a) * 0.108 * 0.53]); }
  rig.add(tube(ring, 0.012, { radial: 6, samples: 28 }), COLLAR, 'neck');
  rig.add(ellipsoid(0.017, 0.02, 0.006, [0, 0.305, -0.3], [8, 6]), TAG, 'neck');
  // tail: fluffy, cream tip
  rig.add(tube([[0, 0.385, 0.235], s.tail[0], s.tail[1], s.tail[2], s.tail[3]], [0.046, 0.04, 0.034, 0.028, 0.022], { radial: 9, samples: 10 }), FUR, 'tail0',
    rig.chainAt(['tail0', 'tail1', 'tail2', 'tail3'], 'z', [0.245, 0.305, 0.36, 0.405]));
  rig.add(ellipsoid(0.027, 0.027, 0.04, [0, s.tail[3][1], s.tail[3][2] + 0.01], [8, 6]), CREAM, 'tail3');
  // legs: stocky, cream socks and paws
  LEG_NAMES.forEach((n, i) => {
    const side = i % 2 ? -1 : 1, front = i < 2, top = mirrored(front ? s.shoulder : s.hip, side), mid = mirrored(front ? s.elbow : s.knee, side), low = mirrored(front ? s.wrist : s.ankle, side);
    rig.add(ellipsoid(front ? 0.058 : 0.07, front ? 0.095 : 0.11, front ? 0.082 : 0.098, [top[0] * 1.03, top[1] + 0.012, top[2] + (front ? 0 : 0.01)], [10, 7]), FUR, front ? 'chest' : 'hips');
    rig.add(tube([top, mid], [0.047, 0.04], { radial: 8, samples: 3 }), FUR, `${n}u`);
    rig.add(tube([mid, low], [0.04, 0.036], { radial: 8, samples: 3 }), (x, y) => (y < 0.11 ? CREAM : FUR), `${n}l`);
    rig.add(ellipsoid(0.042, 0.034, 0.056, [low[0], 0.036, low[2] - 0.014], [10, 7]), CREAM, `${n}p`);
  });
}
