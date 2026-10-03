// Щитоносец «Черепаха-латник»: оливковая черепаха ходит на задних лапах и держит перед собой круглый щит-панцирь
// с шестигранными щитками и гербом Барона — каплей варенья. Над щитом торчит лысая голова (на макушке — клякса):
// сверху сразу видно, куда бить. От попадания голова ныряет за щит, атака — удар щитом с выпадом. Гибель — на
// спину, лапы болтаются в воздухе, щит плашмя падает вперёд.
import * as THREE from 'three';
import { Z_SHIELD } from '../../../shared/fortkinds.ts';
import { type MobAnim, type MobDef, type MobPose } from './kit.ts';
import { EYE, ball, hexPlate, jamOn, join, lathe, mix, onEllipsoid, paint, taper } from './b-parts.ts';
import { shieldPose, type ShieldRig } from './b-shield.ts';

const SKIN = 0x9fb86a;
const SKIN_DARK = 0x7d9550;
const PLASTRON = 0xe8d9a0;
const SHELL = 0x6b4524;
const SCUTE = 0xb98040;
const SCUTE_SHIELD = 0xcf9548;
const RIM = 0x8d5f2c;
const BEAK = 0x6e7a3e;
const SOCKET = 0x3a1650;

const RIG: ShieldRig = { hip: 0.36, hipX: 0.17, steps: 3, neckY: 0.8, neckZ: 0.04, eyeY: 0.31, shieldY: 0.37, shieldZ: 0.46, duck: 0.3 };

// ------------------------------------------------------------------ геометрия

function bodyGeo(): THREE.BufferGeometry {
  const torso = lathe([[0.001, -0.06], [0.2, -0.05], [0.31, 0.06], [0.34, 0.22], [0.33, 0.42], [0.28, 0.6], [0.2, 0.74], [0.1, 0.82], [0.001, 0.84]], (_x, y, z) => {
    if (z < 0.08 || y < 0.0 || y > 0.68) return SKIN;
    const seam = (y * 6.5) % 1 < 0.12;
    return seam ? mix(PLASTRON, SKIN_DARK, 0.5) : PLASTRON;
  }, 9);
  torso.scale(1, 1, 0.9);
  // панцирь на спине: тёмная основа и шестигранные щитки
  const C = [0, 0.38, -0.13] as const;
  const R = [0.36, 0.44, 0.27] as const;
  const shell = ball(1, C[0], C[1], C[2], SHELL, R[0], R[1], R[2], 8, 6);
  const plates: THREE.BufferGeometry[] = [];
  const spots: Array<[number, number, number]> = [[Math.PI / 2, Math.PI, 0.12], [Math.PI / 2 - 0.62, Math.PI, 0.1], [Math.PI / 2 + 0.62, Math.PI, 0.1],
    [Math.PI / 2 - 0.33, Math.PI - 0.72, 0.1], [Math.PI / 2 - 0.33, Math.PI + 0.72, 0.1], [Math.PI / 2 + 0.33, Math.PI - 0.72, 0.1], [Math.PI / 2 + 0.33, Math.PI + 0.72, 0.1]];
  for (const [u, v, r] of spots) {
    const [x, y, z, nx, ny, nz] = onEllipsoid(C[0], C[1], C[2], R[0], R[1], R[2], u, v);
    plates.push(hexPlate(r, 0.035, x, y, z, nx, ny, nz, SCUTE));
  }
  // руки держат щит за края
  const arms = [-1, 1].flatMap((sx) => [
    taper([[sx * 0.28, 0.6, 0.02], [sx * 0.37, 0.43, 0.16], [sx * 0.32, 0.38, 0.36]], 0.075, 0.062, SKIN, 5, 5, false),
    ball(0.075, sx * 0.32, 0.38, 0.38, SKIN_DARK, 1, 0.9, 1, 6, 4),
  ]);
  return join([torso, shell, ...plates, ...arms, jamOn(C[0], C[1], C[2], R[0], R[1], R[2], 0.75, 2.45, 0.09)]);
}

function headGeo(): THREE.BufferGeometry {
  const neck = taper([[0, -0.12, -0.02], [0, 0.04, 0.03], [0, 0.16, 0.06]], 0.12, 0.11, SKIN, 3, 6, false);
  const head = ball(0.2, 0, 0.27, 0.09, (_x, y, z) => (y < 0.2 && z > 0.1 ? mix(SKIN, PLASTRON, 0.5) : SKIN), 1, 0.9, 1.12, 10, 8);
  // клюв-верхняя челюсть и тяжёлые веки над глазами — серьёзный латник
  const beak = ball(0.12, 0, 0.22, 0.27, BEAK, 1.2, 0.55, 0.8, 6, 3);
  const lids = [-1, 1].map((sx) => ball(0.07, sx * 0.085, 0.355, 0.215, SKIN_DARK, 1.25, 0.55, 1, 6, 3));
  const sockets = [-1, 1].map((sx) => ball(0.062, sx * 0.085, 0.31, 0.205, SOCKET, 1, 1, 0.8, 6, 3));
  // клякса варенья на лысой макушке — метка «бей сюда»
  return join([neck, head, beak, ...lids, ...sockets, jamOn(0, 0.27, 0.09, 0.2, 0.18, 0.224, 0.25, 0.3, 0.09)]);
}

function eyesGeo(): THREE.BufferGeometry {
  return join([-1, 1].map((sx) => ball(0.055, sx * 0.085, 0, 0.225, EYE, 1, 1, 0.8, 7, 5)));
}

/** Щит-панцирь: выпуклая «тарелка» (выпуклостью вперёд, +Z), семь щитков и герб — капля варенья */
function shieldGeo(): THREE.BufferGeometry {
  // профиль — против часовой (от центра тыльной стороны к ободу и к макушке купола): нормали наружу
  const dish = lathe([[0.001, -0.045], [0.43, -0.07], [0.47, -0.04], [0.45, -0.005], [0.36, 0.05], [0.2, 0.1], [0.001, 0.12]], (x, y, z) =>
    Math.hypot(x, z) > 0.41 || y < -0.02 ? RIM : SHELL, 12).rotateX(Math.PI / 2);
  dish.scale(1, 1.06, 1);
  const SR = 0.904; // радиус сферы купола
  const list = [dish];
  const cells: Array<[number, number, number]> = [[0, 0, 0.13]];
  for (let i = 0; i < 6; i++) cells.push([Math.cos((i / 6) * Math.PI * 2 + Math.PI / 6) * 0.27, Math.sin((i / 6) * Math.PI * 2 + Math.PI / 6) * 0.27 * 1.06, 0.11]);
  for (const [x, y, r] of cells) {
    const z = -0.784 + Math.sqrt(SR * SR - x * x - y * y);
    list.push(hexPlate(r, 0.03, x, y, z, x / SR, y / SR, (z + 0.784) / SR, SCUTE_SHIELD, Math.PI / 6));
  }
  // герб: капля варенья на среднем щитке
  list.push(jamOn(0, 0.0, 0.0, 0.01, 0.01, 0.15, Math.PI / 2, 0, 0.075));
  list.push(paint(new THREE.ConeGeometry(0.05, 0.1, 6).translate(0, 0.07, 0.15), (_x, y) => (y > 0.1 ? 0x8f3fb5 : 0x6a2387)));
  return join(list);
}

/** Короткая толстая нога со ступнёй (от тазобедренного сустава, подошва на −0,36) */
function legGeo(): THREE.BufferGeometry {
  return join([
    taper([[0, 0.04, 0], [0, -0.15, 0.03], [0, -0.29, 0.01]], 0.11, 0.095, SKIN, 4, 7, false),
    ball(0.1, 0, -0.31, 0.05, SKIN_DARK, 1.15, 0.5, 1.35, 7, 4),
  ]);
}

// ------------------------------------------------------------------ поза

function pose(a: MobAnim, out: MobPose): void {
  shieldPose(RIG, a, out);
}

export const shieldTurtle: MobDef = {
  id: 'shield-turtle',
  name: 'Черепаха-латник',
  kinds: [Z_SHIELD],
  weight: 1.2,
  height: 1.62,
  parts: [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'head', geo: headGeo() },
    { bone: 'extra', geo: eyesGeo(), glow: true },
    { bone: 'prop', geo: shieldGeo() },
    { bone: 'legL', geo: legGeo() },
    { bone: 'legR', geo: legGeo() },
  ],
  pose,
};
