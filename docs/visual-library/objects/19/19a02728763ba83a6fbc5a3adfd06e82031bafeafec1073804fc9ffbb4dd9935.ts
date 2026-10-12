// Щитоносец «Бобр с дверью» (свой образ набора B): бобр утащил с набережной целую дверь — с окошком, петлями
// и латунной ручкой — и прёт её перед собой как щит. Над дверью — круглая голова с зубами-лопатами (бить туда),
// сзади торчит хвост-весло. Атака — стучит дверью в ворота («тук-тук»), от попадания прячется за дверь;
// гибель — на спину, дверь плашмя падает вперёд («бах!»). Хореография общая со щитоносцами — b-shield.ts.
import * as THREE from 'three';
import { Z_SHIELD } from '../../../shared/fortkinds.ts';
import { type MobAnim, type MobDef, type MobPose } from './kit.ts';
import { EYE, ball, jamOn, join, lathe, mix, paint, paintTris, taper } from './b-parts.ts';
import { shieldPose, type ShieldRig } from './b-shield.ts';

const FUR = 0x8b5a3a;
const FUR_DARK = 0x6e4429;
const FUR_LIGHT = 0xd2a072;
const TAIL = 0x4d3e36;
const NOSE = 0x2b1d1a;
const TEETH = 0xfff1cc;
const WOOD = 0xb57d47;
const WOOD_DARK = 0x9a6436;
const IRON = 0x4a4a52;
const BRASS = 0xe2b443;
const GLASS = 0x9fd6f0;
const SOCKET = 0x3a1650;

const RIG: ShieldRig = { hip: 0.38, hipX: 0.16, steps: 3, neckY: 0.77, neckZ: 0.05, eyeY: 0.29, shieldY: 0.34, shieldZ: 0.42, duck: 0.32 };

// ------------------------------------------------------------------ геометрия

function bodyGeo(): THREE.BufferGeometry {
  const torso = lathe([[0.001, -0.08], [0.22, -0.07], [0.33, 0.06], [0.36, 0.24], [0.33, 0.44], [0.26, 0.62], [0.18, 0.74], [0.08, 0.81], [0.001, 0.82]], (_x, y, z) =>
    mix(FUR, FUR_LIGHT, z > 0.12 && y > 0.0 && y < 0.62 ? 0.75 : 0), 10);
  torso.scale(1, 1, 0.92);
  // хвост-весло сзади, чуть вниз
  const tail = ball(0.17, 0, 0.02, -0.52, (x, _y, z) => ((Math.abs(x) * 9 + z * 9) % 1 < 0.18 ? mix(TAIL, NOSE, 0.5) : TAIL), 1, 0.2, 1.75, 9, 5);
  tail.rotateX(-0.25);
  const tailRoot = taper([[0, 0.06, -0.24], [0, 0.03, -0.34]], 0.09, 0.07, FUR_DARK, 2, 6, false);
  // руки держат дверь за края
  const arms = [-1, 1].flatMap((sx) => [
    taper([[sx * 0.29, 0.6, 0.02], [sx * 0.39, 0.42, 0.16], [sx * 0.36, 0.36, 0.34]], 0.075, 0.062, FUR, 5, 5, false),
    ball(0.072, sx * 0.36, 0.36, 0.36, FUR_DARK, 1, 0.9, 1, 6, 4),
  ]);
  return join([torso, tail, tailRoot, ...arms, jamOn(0, 0.3, 0, 0.36, 0.42, 0.33, 1.2, 2.4, 0.1, 0.12)]);
}

function headGeo(): THREE.BufferGeometry {
  const head = ball(0.21, 0, 0.24, 0.05, FUR, 1.05, 0.95, 1, 10, 8);
  // щёки-подушки, чёрный нос, два зуба-лопаты, круглые ушки
  const cheeks = [-1, 1].map((sx) => ball(0.085, sx * 0.065, 0.17, 0.2, FUR_LIGHT, 1, 0.85, 0.8, 6, 3));
  const nose = ball(0.045, 0, 0.23, 0.265, NOSE, 1.25, 0.85, 0.9, 6, 4);
  const teeth = [-1, 1].map((sx) => paint(new THREE.BoxGeometry(0.048, 0.085, 0.025).translate(sx * 0.027, 0.105, 0.245), TEETH));
  const ears = [-1, 1].map((sx) => ball(0.055, sx * 0.16, 0.4, -0.02, FUR_DARK, 1, 1, 0.6, 5, 3));
  const sockets = [-1, 1].map((sx) => ball(0.058, sx * 0.085, 0.29, 0.195, SOCKET, 1, 1, 0.8, 6, 3));
  return join([head, ...cheeks, nose, ...teeth, ...ears, ...sockets, jamOn(0, 0.24, 0.05, 0.22, 0.2, 0.21, 0.3, -0.6, 0.075)]);
}

function eyesGeo(): THREE.BufferGeometry {
  return join([-1, 1].map((sx) => ball(0.052, sx * 0.085, 0, 0.215, EYE, 1, 1, 0.8, 7, 5)));
}

/** Дверь 0,8 × 0,92: доски двух оттенков, петли, ручка, окошко, клякса; сзади — перекладины-«зет» */
function doorGeo(): THREE.BufferGeometry {
  const W = 0.8;
  const H = 0.92;
  const T = 0.055;
  const slab = paintTris(new THREE.BoxGeometry(W, H, T, 4, 1, 1), (x) => (Math.floor((x + W / 2) / (W / 4)) % 2 ? WOOD_DARK : WOOD));
  const battens = [0.28, -0.28].map((y) => paint(new THREE.BoxGeometry(W * 0.92, 0.09, 0.03).translate(0, y, -T / 2 - 0.012), WOOD_DARK));
  const brace = paint(new THREE.BoxGeometry(0.08, 0.66, 0.025).rotateZ(-0.62).translate(0, 0, -T / 2 - 0.014), WOOD_DARK);
  const hinges = [0.3, -0.3].map((y) => paint(new THREE.BoxGeometry(0.22, 0.045, 0.012).translate(-W / 2 + 0.1, y, T / 2 + 0.005), IRON));
  const knob = ball(0.04, W / 2 - 0.1, -0.04, T / 2 + 0.03, BRASS, 1, 1, 0.8, 6, 4);
  const glass = paint(new THREE.BoxGeometry(0.22, 0.2, 0.01).translate(0.06, 0.25, T / 2 + 0.002), GLASS);
  const frame = [paint(new THREE.BoxGeometry(0.22, 0.025, 0.014).translate(0.06, 0.25, T / 2 + 0.006), WOOD_DARK), paint(new THREE.BoxGeometry(0.025, 0.2, 0.014).translate(0.06, 0.25, T / 2 + 0.006), WOOD_DARK)];
  const smear = jamOn(-0.12, -0.12, T / 2, 0.01, 0.01, 0.01, Math.PI / 2, 0, 0.11, 0.16);
  return join([slab, ...battens, brace, ...hinges, knob, glass, ...frame, smear]);
}

/** Короткая нога с большой перепончатой ступнёй */
function legGeo(): THREE.BufferGeometry {
  return join([
    taper([[0, 0.04, 0], [0, -0.16, 0.03], [0, -0.31, 0.01]], 0.1, 0.085, FUR, 4, 7, false),
    ball(0.11, 0, -0.335, 0.08, FUR_DARK, 1.15, 0.4, 1.55, 7, 4),
  ]);
}

// ------------------------------------------------------------------ поза

function pose(a: MobAnim, out: MobPose): void {
  shieldPose(RIG, a, out);
}

export const shieldBeaver: MobDef = {
  id: 'shield-beaver',
  name: 'Бобр с дверью',
  kinds: [Z_SHIELD],
  weight: 1,
  height: 1.6,
  parts: [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'head', geo: headGeo() },
    { bone: 'extra', geo: eyesGeo(), glow: true },
    { bone: 'prop', geo: doorGeo() },
    { bone: 'legL', geo: legGeo() },
    { bone: 'legR', geo: legGeo() },
  ],
  pose,
};
