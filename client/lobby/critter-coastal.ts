// Gull and crab: toy-like shore animals on the same kit as the cat and dog (critter-kit.ts) — one skinned mesh and one
// shared material each, a procedural skeleton rotated by hand: flapping and gliding wings, waddle, peck, head turns,
// a calling beak; a crab that scuttles sideways, snaps its claws and buries itself in the sand.
import * as THREE from 'three';
import { Leg, Pose, RigBuilder, clamp, clamp01, ease, ellipsoid, hash01, loft, mix, place, pulse, tube, type V3 } from './critter-kit.ts';
import type { CritterPose } from './crittersim.ts';

const EYE = 0x15141b, HILITE = 0xffffff;
const _gv = new THREE.Vector3(), _gq = new THREE.Quaternion(), _gs = new THREE.Vector3();
const lerpV = (out: THREE.Vector3, a: V3, b: V3, k: number): THREE.Vector3 => out.set(mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k));
const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

// ================================================================== gull

function buildGull(rig: RigBuilder): void {
  const WHITE = 0xf9f9f3, GREY = 0xa7b7c7, BLACK = 0x2e343e, YELLOW = 0xf6b93a, RED = 0xe4472f, ORANGE = 0xf4a23f, RING = 0xf1bb3c;
  rig.bone('body', [0, 0.2, 0]);
  rig.bone('neck', [0, 0.27, -0.12], 'body'); rig.bone('head', [0, 0.336, -0.2], 'neck'); rig.bone('jaw', [0, 0.326, -0.226], 'head');
  rig.bone('tail', [0, 0.215, 0.17], 'body');
  for (const side of [1, -1]) {
    const n = side > 0 ? 'R' : 'L';
    rig.bone(`wing${n}`, [0.075 * side, 0.262, -0.02], 'body'); rig.bone(`hand${n}`, [0.33 * side, 0.266, 0.035], `wing${n}`);
    rig.bone(`eye${n}`, [0.052 * side, 0.348, -0.218], 'head');
    rig.bone(`leg${n}u`, [0.05 * side, 0.165, 0.025], 'body'); rig.bone(`leg${n}l`, [0.052 * side, 0.095, 0.035], `leg${n}u`); rig.bone(`leg${n}p`, [0.052 * side, 0.012, 0.02], `leg${n}l`);
  }
  // plump body, grey saddle, white everywhere else
  const body = loft([
    [0.2, 0.215, 0.03, 0.035], [0.15, 0.215, 0.07, 0.08], [0.07, 0.212, 0.105, 0.108], [-0.01, 0.208, 0.114, 0.114],
    [-0.08, 0.212, 0.108, 0.108], [-0.13, 0.226, 0.085, 0.092], [-0.165, 0.25, 0.055, 0.065], [-0.18, 0.268, 0.035, 0.04],
  ].map(([z, cy, rx, ry]) => [z, 0, cy, rx, ry] as const), 'z', 18);
  rig.add(body, (x, y, z) => (y > 0.238 + 0.01 * Math.abs(x) * 8 && z > -0.1 && z < 0.19 ? GREY : WHITE), 'body');
  rig.add(tube([[0, 0.255, -0.125], [0, 0.3, -0.17], [0, 0.336, -0.2]], [0.062, 0.05, 0.043], { radial: 10, samples: 6 }), WHITE, 'body', rig.chain(['body', 'neck', 'head'], 'z', -0.1, -0.2));
  rig.add(ellipsoid(0.057, 0.055, 0.06, [0, 0.338, -0.2], [16, 11]), WHITE, 'head');
  // beak: hooked upper, lower jaw with the red spot (it opens for the cry)
  rig.add(loft([[-0.226, 0.332, 0.024, 0.027], [-0.262, 0.331, 0.0205, 0.0235], [-0.296, 0.326, 0.0145, 0.0165], [-0.324, 0.318, 0.0075, 0.009], [-0.338, 0.311, 0.003, 0.0035]]
    .map(([z, cy, rx, ry]) => [z, 0, cy, rx, ry] as const), 'z', 10), YELLOW, 'head');
  rig.add(loft([[-0.226, 0.316, 0.02, 0.0115], [-0.262, 0.317, 0.0145, 0.0095], [-0.294, 0.317, 0.0095, 0.0075], [-0.318, 0.317, 0.0035, 0.0035]]
    .map(([z, cy, rx, ry]) => [z, 0, cy, rx, ry] as const), 'z', 8), (_x, _y, z) => (z < -0.29 ? RED : YELLOW), 'jaw');
  for (const side of [1, -1]) {
    const n = side > 0 ? 'R' : 'L';
    rig.add(ellipsoid(0.011, 0.0205, 0.0205, [0.0505 * side, 0.348, -0.22], [10, 8]), RING, `eye${n}`);
    rig.add(ellipsoid(0.0115, 0.0155, 0.0155, [0.0545 * side, 0.348, -0.221], [10, 8]), EYE, `eye${n}`);
    rig.add(ellipsoid(0.0045, 0.0045, 0.0035, [0.062 * side, 0.355, -0.229], [6, 5]), HILITE, `eye${n}`);
  }
  // wings: flat airfoils, grey above and white below, a white trailing edge and fanned black primaries
  for (const side of [1, -1]) {
    const n = side > 0 ? 'R' : 'L', ring = (x: number, cz: number, ry: number, rz: number) => [x * side, 0.262, cz, ry, rz] as const;
    const wing = loft([ring(0.05, 0.01, 0.038, 0.075), ring(0.14, 0.035, 0.022, 0.1), ring(0.23, 0.06, 0.016, 0.108), ring(0.33, 0.085, 0.011, 0.098),
      ring(0.42, 0.11, 0.008, 0.072), ring(0.5, 0.13, 0.005, 0.045), ring(0.56, 0.15, 0.003, 0.02), ring(0.59, 0.16, 0.002, 0.006)], 'x', 10);
    rig.add(wing, (x, y, z) => {
      const ax = Math.abs(x);
      if (ax > 0.44) return BLACK;
      if (y < 0.2615) return z > 0.09 + (ax - 0.2) * 0.06 && ax > 0.36 ? BLACK : WHITE;
      return z > 0.14 + (ax - 0.2) * 0.02 ? WHITE : GREY;
    }, `wing${n}`, rig.chainAt([`wing${n}`, `hand${n}`], 'x', [0.2 * side, 0.4 * side]));
    for (let f = 0; f < 4; f++) {
      const r = (x: number, cz: number, ry: number, rz: number) => [x * side, 0.262, cz, ry, rz] as const;
      rig.add(loft([r(0.42 + 0.01 * f, 0.11 + 0.012 * f, 0.004, 0.02), r(0.52 + 0.015 * f, 0.135 + 0.03 * f, 0.003, 0.018), r(0.6 + 0.02 * f, 0.16 + 0.05 * f, 0.002, 0.008), r(0.625 + 0.02 * f, 0.168 + 0.055 * f, 0.0015, 0.0015)], 'x', 6), BLACK, `hand${n}`);
    }
  }
  rig.add(ellipsoid(0.05, 0.007, 0.085, [0, 0.212, 0.25], [12, 6]), WHITE, 'tail');
  // legs: feathered thigh, orange tarsus, webbed foot with three toes
  for (const side of [1, -1]) {
    const n = side > 0 ? 'R' : 'L', x = 0.052 * side;
    rig.add(ellipsoid(0.03, 0.045, 0.035, [0.05 * side, 0.14, 0.02], [8, 6]), WHITE, `leg${n}u`);
    rig.add(tube([[x, 0.1, 0.035], [x, 0.055, 0.028], [x, 0.016, 0.02]], [0.0105, 0.0085, 0.0075], { radial: 6, samples: 4 }), ORANGE, `leg${n}l`);
    rig.add(ellipsoid(0.03, 0.0035, 0.032, [x, 0.006, -0.012], [8, 4]), ORANGE, `leg${n}p`);
    for (const a of [-0.55, 0, 0.55]) rig.add(tube([[x, 0.008, 0.02], [x + Math.sin(a) * 0.052, 0.006, 0.02 - Math.cos(a) * 0.055]], 0.0046, { radial: 5, samples: 2 }), ORANGE, `leg${n}p`);
  }
}

export class Gull {
  readonly group = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  private readonly bones: THREE.Bone[];
  private readonly rest: THREE.Vector3[];
  private readonly b: Record<string, number> = {};
  private readonly legs: Leg[] = [];
  private readonly P: Pose;
  private readonly foot = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly goal = new THREE.Vector3();
  private readonly pole = new THREE.Vector3();
  private readonly seed: number;
  private gait = 0; private lastDistance = NaN; private flap = 0; private spread = 0; private lastYaw = 0; private turn = 0; private tuck = 0; private initialized = false;

  constructor(coat = 0, seed = 0) {
    this.seed = seed + coat * 7;
    const rig = new RigBuilder(); buildGull(rig);
    this.mesh = rig.build(`gull-${coat}`); this.bones = rig.bones; this.rest = rig.localRest;
    rig.names.forEach((n, i) => { this.b[n] = i; });
    this.group.name = `gull-${coat}`; this.group.add(this.mesh);
    this.P = new Pose(this.bones.length);
    for (const n of ['R', 'L']) this.legs.push(new Leg(this.bones[this.b[`leg${n}u`]], this.bones[this.b[`leg${n}l`]], this.bones[this.b[`leg${n}p`]]));
  }

  update(p: CritterPose, t: number, dt: number, animate = true): void {
    this.group.position.set(p.x, p.y, p.z); this.group.rotation.set(0, p.yaw, 0);
    if (!animate && this.initialized) return;
    this.initialized = true; dt = clamp(dt, 0, 0.1);
    const B = this.b, P = this.P.reset(), fly = p.action === 'fly';
    // state: banking from the heading change, wings unfurl fast and fold slowly, gait from the travelled distance
    const dyaw = wrapPi(p.yaw - this.lastYaw); this.lastYaw = p.yaw;
    this.turn += (clamp(dt > 1e-4 ? dyaw / dt : 0, -2.5, 2.5) - this.turn) * (1 - Math.exp(-dt * 4));
    this.spread += ((fly ? 1 : 0) - this.spread) * (1 - Math.exp(-dt * (fly ? 11 : 5)));
    const spread = this.spread, fold = 1 - spread;
    if (Number.isFinite(this.lastDistance)) this.gait += clamp(p.distance - this.lastDistance, 0, 0.5) / 0.2;
    this.lastDistance = p.distance;
    const takeoff = fly ? clamp01(1 - p.age / 1.1) : 0, landing = fly ? clamp01(1 - p.remaining / 1.3) : 0;
    const climb = clamp01(p.pitch / 0.28), dive = clamp01(-p.pitch / 0.22);
    const burst = ease(Math.sin((t * 0.33 + this.seed * 1.7) * Math.PI * 2) * 1.6 + 0.45);
    const power = clamp01(Math.max(takeoff, landing * 0.85, climb, 0.7 * burst) * (1 - 0.8 * dive));
    this.flap += dt * (2.2 + 1.0 * takeoff + 0.4 * landing + 0.5 * power) * Math.PI * 2 * spread;
    const s = Math.sin(this.flap), up = s + 0.22 * Math.sin(this.flap * 2 + 0.6);

    // ---- wings
    const amp = 0.14 + 0.62 * power, base = 0.14 + 0.55 * landing * (1 - power * 0.4);
    for (const side of [1, -1]) {
      const n = side > 0 ? 'R' : 'L', iw = B[`wing${n}`], ih = B[`hand${n}`];
      const roll = (base + amp * up) * spread, handRoll = (-0.32 * (1 - power) + 0.62 * amp * Math.sin(this.flap - 1.05) - 0.12) * spread;
      P.r(iw, -0.1 * up * power * spread, -side * (1.43 * fold + 0.1 * spread), side * (roll - 0.3 * fold));
      P.r(ih, 0, -side * 0.25 * fold, side * (handRoll + 0.25 * fold)); P.s(ih, mix(0.5, 1, spread), mix(0.7, 1, spread), mix(0.4, 1, spread)); P.s(iw, mix(0.72, 1, spread), 1, 1);
      P.p(iw, side * 0.022 * fold, 0.006 * fold, 0);
    }
    // ---- body: pitch with the climb, bank into turns, bob with the beat; flare for landing
    const bodyPitch = (clamp(p.pitch, -0.45, 0.45) * 0.7 + 0.55 * landing - 0.1 * dive) * spread, bank = clamp(this.turn * 0.22, -0.55, 0.55) * spread;
    P.r(B.body, bodyPitch, 0, bank); P.p(B.body, 0, 0.02 * s * power * spread, 0);
    P.s(B.body, 1, 1 + 0.012 * Math.sin(t * 1.9 + this.seed), 1);
    P.r(B.tail, 0.5 * landing * spread - 0.1 * takeoff, -this.turn * 0.12 * spread, 0); P.s(B.tail, 1 + (0.45 * landing + 0.15) * spread, 1, 1);

    // ---- neck and head: level glance, thrust while walking, peck, cry
    const walk = fly ? 0 : ease(p.speed / 0.3), g = this.gait * Math.PI * 2;
    let neckX = -0.08 - 0.22 * spread + 0.07 * walk * Math.sin(g), headX = 0.06 + 0.1 * spread;
    let neckY = 0, headY = 0, bodyX = 0;
    if (p.action === 'peck') {
      const c = (p.age + this.seed * 0.9) % 5.4;                                   // three pecks, then a look around
      const depth = c < 1.6 ? Math.pow(Math.sin(Math.PI * ((c / 0.53) % 1)), 0.7) : 0;
      neckX -= 0.92 * depth; headX -= 0.42 * depth; bodyX = -0.2 * depth;
      P.padd(B.neck, 0, 0, -0.015 * depth);
      P.r(B.tail, 0.18 * depth, 0, 0);
    }
    if (!fly) {
      const per = 3.4 + (this.seed % 3), gl = pulse(t, per, this.seed, 0.9);
      if (gl >= 0) { const side = hash01(Math.floor(t / per) + this.seed) > 0.5 ? 1 : -1, a = Math.pow(Math.sin(gl * Math.PI), 0.6) * 0.95 * side; neckY += a * 0.5; headY += a * 0.55; }
    }
    if (p.look > 0.001) { neckY += clamp(p.lookYaw, -1.2, 1.2) * p.look * 0.5; headY += clamp(p.lookYaw, -1.2, 1.2) * p.look * 0.5; headX += clamp(p.lookPitch, -0.5, 0.5) * p.look * 0.4; }
    const cry = clamp01(p.cry);
    neckX += 0.22 * cry; headX += 0.38 * cry;
    P.r(B.neck, neckX, neckY, 0); P.r(B.head, headX, headY, 0); P.r(B.jaw, -0.62 * cry, 0, 0);
    if (bodyX !== 0) P.radd(B.body, bodyX, 0, 0);
    // blink
    const blink = pulse(t, 3.9 + (this.seed % 4) * 0.7, this.seed + 5, 0.16), lid = blink >= 0 ? 1 - Math.sin(blink * Math.PI) * 0.92 : 1;
    P.s(B.eyeR, 1, lid, 1); P.s(B.eyeL, 1, lid, 1);

    // ---- feet: alternate steps on the ground, tucked back in flight, reaching down to land
    const stand: V3 = [0.052, 0.012, 0.02], tucked: V3 = [0.045, 0.125, 0.12], reach: V3 = [0.052, 0.045, -0.035];
    this.tuck += ((fly ? ease(clamp01((p.age - 0.12) / 0.45)) * (1 - ease(landing * 1.2)) : 0) - this.tuck) * (1 - Math.exp(-dt * 14));
    for (let i = 0; i < 2; i++) {
      const side = i ? -1 : 1, psi = (((this.gait + i * 0.5) % 1) + 1) % 1, duty = 0.6, stride = 0.1;
      let fwd = 0, lift = 0;
      if (psi < duty) fwd = stride * (0.5 - psi / duty); else { const u = (psi - duty) / (1 - duty); fwd = stride * (-0.5 + ease(u)); lift = 0.035 * Math.sin(Math.PI * u); }
      const v = this.foot[i];
      lerpV(v, stand, tucked, this.tuck); v.x *= side;
      if (fly) { const r = ease(landing * 1.2) * (1 - this.tuck); v.set(mix(v.x, reach[0] * side, r), mix(v.y, reach[1], r), mix(v.z, reach[2], r)); }
      else { v.z -= fwd * walk; v.y += lift * walk; }
    }
    P.apply(this.bones, this.rest);
    this.group.updateMatrixWorld(true);
    this.group.matrixWorld.decompose(_gv, _gq, _gs);
    for (let i = 0; i < 2; i++) {
      this.goal.copy(this.foot[i]).applyMatrix4(this.group.matrixWorld);
      this.pole.set(0, 0.5, 1).transformDirection(this.group.matrixWorld);
      this.legs[i].solve(this.goal, this.pole);
      if (!fly || this.tuck < 0.2) this.legs[i].orientPaw(_gq);
    }
  }
}

// ================================================================== crab

interface CrabColors { shell: number; claw: number; leg: number; belly: number; spot: number }
const CRAB_COLORS: readonly CrabColors[] = [
  { shell: 0xe4573a, claw: 0xf06f48, leg: 0xd44a31, belly: 0xf6dfb8, spot: 0xff9b73 },
  { shell: 0x78a83d, claw: 0xf2a443, leg: 0x5b9433, belly: 0xf6e6c0, spot: 0xd5ec86 },
];
const LEG_Z = [-0.05, -0.015, 0.02, 0.055];

function buildCrab(rig: RigBuilder, c: CrabColors): void {
  rig.bone('body', [0, 0.07, 0]);
  for (const side of [1, -1]) {
    const n = side > 0 ? 'R' : 'L';
    rig.bone(`eye${n}`, [0.045 * side, 0.115, -0.085], 'body');
    rig.bone(`arm${n}`, [0.09 * side, 0.072, -0.07], 'body'); rig.bone(`hand${n}`, [0.175 * side, 0.1, -0.14], `arm${n}`); rig.bone(`finger${n}`, [0.225 * side, 0.1, -0.215], `hand${n}`);
    LEG_Z.forEach((z, k) => {
      rig.bone(`leg${n}${k}u`, [0.115 * side, 0.07, z], 'body');
      rig.bone(`leg${n}${k}l`, [0.19 * side, 0.11, z + (k - 1.5) * 0.012], `leg${n}${k}u`);
    });
  }
  // shell, belly, spots, smile
  rig.add(ellipsoid(0.135, 0.058, 0.102, [0, 0.082, 0], [18, 10]), (_x, y) => (y < 0.058 ? c.belly : c.shell), 'body');
  rig.add(ellipsoid(0.126, 0.028, 0.095, [0, 0.056, 0], [14, 6]), c.belly, 'body');
  for (const [x, z] of [[-0.05, -0.01], [0.055, -0.02], [0, 0.045], [-0.075, 0.04], [0.08, 0.035]] as const) {
    const y = 0.082 + 0.058 * Math.sqrt(Math.max(0.05, 1 - (x / 0.135) ** 2 - (z / 0.102) ** 2));
    rig.add(ellipsoid(0.014, 0.0045, 0.012, [x, y - 0.0015, z], [8, 4]), c.spot, 'body');
  }
  rig.add(tube([[-0.024, 0.089, -0.1034], [0, 0.0805, -0.1052], [0.024, 0.089, -0.1034]], 0.0036, { radial: 5, samples: 6 }), 0x5a2418, 'body');
  for (const side of [1, -1]) {
    const n = side > 0 ? 'R' : 'L', x = (v: number): number => v * side;
    // eye stalk with a bead eye
    rig.add(tube([[x(0.045), 0.115, -0.085], [x(0.054), 0.158, -0.095]], [0.0095, 0.0075], { radial: 6, samples: 3 }), c.belly, `eye${n}`);
    rig.add(ellipsoid(0.0185, 0.0185, 0.0165, [x(0.056), 0.169, -0.098], [10, 8]), EYE, `eye${n}`);
    rig.add(ellipsoid(0.0062, 0.0062, 0.0045, [x(0.0625), 0.178, -0.1085], [6, 5]), HILITE, `eye${n}`);
    // claw: arm, palm, a fixed and a movable finger
    rig.add(tube([[x(0.09), 0.072, -0.07], [x(0.15), 0.09, -0.115], [x(0.175), 0.1, -0.14]], [0.017, 0.015, 0.015], { radial: 7, samples: 5 }), c.claw, `arm${n}`, () => [rig.index(`arm${n}`), rig.index(`hand${n}`), 0]);
    rig.add(ellipsoid(0.05, 0.038, 0.054, [x(0.2), 0.1, -0.185], [12, 8]), c.claw, `hand${n}`);
    rig.add(tube([[x(0.205), 0.1, -0.21], [x(0.213), 0.1, -0.255], [x(0.2), 0.1, -0.29]], [0.017, 0.012, 0.004], { radial: 6, samples: 4 }), (_x, _y, z) => (z < -0.268 ? 0xf8e6c8 : c.claw), `hand${n}`);
    rig.add(tube([[x(0.232), 0.1, -0.218], [x(0.246), 0.1, -0.258], [x(0.228), 0.1, -0.292]], [0.015, 0.011, 0.004], { radial: 6, samples: 4 }), (_x, _y, z) => (z < -0.268 ? 0xf8e6c8 : c.claw), `finger${n}`);
    LEG_Z.forEach((z, k) => {
      const dz = (k - 1.5) * 0.012, fz = z + (k - 1.5) * 0.03;
      rig.add(tube([[x(0.115), 0.07, z], [x(0.19), 0.11, z + dz]], [0.0165, 0.0135], { radial: 7, samples: 3 }), c.leg, `leg${n}${k}u`);
      rig.add(tube([[x(0.19), 0.11, z + dz], [x(0.23), 0.058, (z + dz + fz) / 2], [x(0.25), 0.006, fz]], [0.0135, 0.0105, 0.0055], { radial: 7, samples: 4 }), c.leg, `leg${n}${k}l`);
    });
  }
  void place;
}

export class Crab {
  readonly group = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  private readonly bones: THREE.Bone[];
  private readonly rest: THREE.Vector3[];
  private readonly b: Record<string, number> = {};
  private readonly P: Pose;
  private readonly seed: number;
  /** +1: the crab travels toward its right claw, -1: toward its left. */
  private readonly dir: number;
  private gait = 0; private lastDistance = NaN; private initialized = false; private snap = 0;

  constructor(coat = 0, seed = 0) {
    this.seed = seed + coat * 5; this.dir = this.seed % 2 ? -1 : 1;
    const rig = new RigBuilder(); buildCrab(rig, CRAB_COLORS[coat % CRAB_COLORS.length]);
    this.mesh = rig.build(`crab-${coat}`); this.bones = rig.bones; this.rest = rig.localRest;
    rig.names.forEach((n, i) => { this.b[n] = i; });
    this.group.name = `crab-${coat}`; this.group.add(this.mesh);
    this.P = new Pose(this.bones.length);
  }

  /** Travel direction in the crab's own frame: its body faces 90 degrees off the way it scuttles. */
  get facingOffset(): number { return this.dir * Math.PI / 2; }

  update(p: CritterPose, t: number, dt: number, animate = true): void {
    this.group.position.set(p.x, p.y, p.z); this.group.rotation.set(0, p.yaw + this.facingOffset, 0);
    if (!animate && this.initialized) return;
    this.initialized = true; dt = clamp(dt, 0, 0.1);
    const B = this.b, P = this.P.reset();
    if (Number.isFinite(this.lastDistance)) this.gait += clamp(p.distance - this.lastDistance, 0, 0.3) / 0.11;
    this.lastDistance = p.distance;
    const move = ease(p.speed / 0.15), burrow = p.action === 'burrow' ? clamp01(p.restWeight) : 0;
    const digging = burrow > 0.04 && burrow < 0.96 ? 1 : 0, alarm = clamp01(p.alarm), excite = clamp01(p.excite);
    const phaseG = this.gait * Math.PI * 2;

    // ---- legs: an alternating tetrapod wave; while digging they scrabble fast, when alarmed they brace high
    this.snap += dt * (digging ? 14 : 0);
    for (const side of [1, -1]) {
      const n = side > 0 ? 'R' : 'L';
      for (let k = 0; k < 4; k++) {
        const ph = (digging ? this.snap : phaseG) + (k % 2) * Math.PI + (side > 0 ? 0 : Math.PI) + k * 0.4;
        const lift = Math.max(0, Math.sin(ph)), a = Math.max(move, digging * 0.8);
        P.r(B[`leg${n}${k}u`], 0, (0.18 * Math.cos(ph) * a + (k - 1.5) * 0.06) * side * this.dir * (side * this.dir > 0 ? 1 : 1), side * (0.1 + 0.26 * lift * a + 0.2 * alarm - 0.55 * burrow));
        P.r(B[`leg${n}${k}l`], 0, 0, side * (-0.5 * lift * a - 0.12 * alarm + 0.5 * burrow + 0.12 * Math.cos(ph) * a));
      }
    }
    // ---- body: bounce on the steps, wobble while digging, sink into the sand
    const bob = 0.004 * Math.abs(Math.sin(phaseG)) * move;
    P.p(B.body, 0, bob + 0.012 * alarm - 0.128 * ease(burrow), 0);
    P.r(B.body, 0.2 * alarm, 0.08 * Math.sin(this.snap * 0.9) * digging + 0.03 * Math.sin(phaseG) * move, 0.06 * Math.sin(this.snap) * digging);
    // ---- claws: held up front, wave a little, snap now and then (or when excited / alarmed)
    const snapT = pulse(t, 4.6 + (this.seed % 3), this.seed, 1.3), snaps = snapT >= 0 ? Math.max(0, Math.sin(snapT * Math.PI * 6)) : 0;
    const wave = Math.sin(t * 1.4 + this.seed) * 0.08, hurry = Math.max(excite, alarm), chatter = hurry * Math.max(0, Math.sin(t * 17));
    for (const side of [1, -1]) {
      const n = side > 0 ? 'R' : 'L', ph = side > 0 ? 0 : 1.7;
      P.r(B[`arm${n}`], 0.2 + 0.7 * alarm + 0.35 * excite * Math.sin(t * 5 + ph) - 0.5 * burrow + wave * 0.5 * Math.sin(ph + 1), side * (0.34 - 0.1 * alarm - 0.3 * burrow + wave * Math.cos(ph + t)), 0);
      P.r(B[`hand${n}`], 0, side * (0.1 - 0.5 * burrow), 0);
      P.r(B[`finger${n}`], 0, -side * (0.12 + 0.55 * snaps * (side > 0 ? 1 : 0.8) + 0.5 * alarm + 0.45 * chatter), 0);
    }
    // ---- eyes: stalks wiggle, shoot up when alarmed; bead blink
    const eyeUp = 0.15 * alarm + 0.1 * digging;
    for (const side of [1, -1]) {
      const n = side > 0 ? 'R' : 'L';
      P.r(B[`eye${n}`], -0.1 * Math.sin(t * 1.7 + side) * 0.5 - eyeUp, 0, side * (0.1 + 0.08 * Math.sin(t * 2.1 + side * 2)));
      P.s(B[`eye${n}`], 1, 1 + 0.25 * (alarm + digging * 0.3), 1);
    }
    P.apply(this.bones, this.rest);
    this.group.updateMatrixWorld(true);
  }
}
