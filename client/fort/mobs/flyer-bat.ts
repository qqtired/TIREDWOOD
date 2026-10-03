// Крылатка «Летучая мышь»: плюшевый шоколадный комок с огромными ушами, клычками и сиреневыми глазами,
// перепончатые крылья с «пальцами» и фестонами по краю. Машет по-настоящему: резкий взмах вниз, крыло
// подгибается на подъёме. Перед пике зависает, частит крыльями и клюёт носом в сторону метки (глаза
// разгораются), в конце — замах крыльями вверх; пике — крылья сложены назад, нос вниз; выход — тяжёлые
// взмахи вверх и мотает головой. Гибель — крылья захлопываются зонтиком, кувырком вниз.
import * as THREE from 'three';
import { Z_FLYER } from '../../../shared/fortkinds.ts';
import { ZS_ATTACK, ZS_FLY_DIVE, ZS_FLY_RECOVER, ZS_FLY_WARN } from '../../../shared/fort.ts';
import { type MobAnim, type MobDef, type MobPose } from './kit.ts';
import { EYE, ball, flyPose, jamOn, join, link, linkS, mirrorX, paint, pivotBone, taper } from './b-parts.ts';

const FUR = 0x6e4630;
const FUR_LIGHT = 0xc99c6c;
const MEMBRANE = 0xb067c4;
const MEMBRANE_DARK = 0x7f3f93;
const BONE = 0x4a2a3e;
const PINK = 0xf2a2b4;
const FANG = 0xfff4e4;
const SOCKET = 0x3a1650;

/** Центр тела над корнем (у крылатки корень — точка в воздухе, хитбокс — от неё вверх) */
const BODY_Y = 0.66;
const SHOULDER_X = 0.2;
const SHOULDER_Y = 0.16;
const NECK_Y = 0.24;

// ------------------------------------------------------------------ геометрия

function bodyGeo(): THREE.BufferGeometry {
  const torso = ball(0.3, 0, 0, 0, (_x, y, z) => (z > 0.12 && y < 0.18 ? FUR_LIGHT : FUR), 1, 1.12, 0.92, 11, 8);
  // пушистая манишка и лапки с коготками
  const tuft = ball(0.1, 0, 0.13, 0.25, FUR_LIGHT, 1.3, 0.8, 0.6, 6, 3);
  const feet = [-1, 1].flatMap((sx) => [
    taper([[sx * 0.1, -0.24, -0.02], [sx * 0.12, -0.36, -0.04]], 0.045, 0.035, FUR, 3, 5, false),
    ball(0.045, sx * 0.12, -0.39, -0.03, BONE, 1.2, 0.7, 1.1, 6, 3),
  ]);
  return join([
    torso, tuft, ...feet,
    jamOn(0, 0, 0, 0.3, 0.336, 0.276, 1.0, 2.7, 0.12, 0.12),
    jamOn(0, 0, 0, 0.3, 0.336, 0.276, 1.75, 0.9, 0.09),
  ]);
}

function headGeo(): THREE.BufferGeometry {
  const C = [0, 0.16, 0.04] as const;
  const skull = ball(0.24, C[0], C[1], C[2], (_x, y, z) => (z > 0.14 && y < 0.2 ? FUR_LIGHT : FUR), 1.08, 0.95, 1, 11, 8);
  const snout = ball(0.1, 0, 0.1, 0.25, FUR_LIGHT, 1.2, 0.8, 0.85, 7, 4);
  const nose = ball(0.035, 0, 0.14, 0.33, PINK, 1.3, 0.8, 0.8, 5, 3);
  // уши: тёмная раковина и розовое нутро, торчат вверх и в стороны
  const ears = [-1, 1].flatMap((sx) => {
    const outer = new THREE.SphereGeometry(0.12, 6, 4).scale(0.75, 1.6, 0.32).rotateZ(-sx * 0.42).translate(sx * 0.15, 0.4, 0.0);
    const inner = new THREE.SphereGeometry(0.09, 5, 3).scale(0.6, 1.35, 0.2).rotateZ(-sx * 0.42).translate(sx * 0.15, 0.39, 0.03);
    return [paint(outer, FUR), paint(inner, PINK)];
  });
  const fangs = [-1, 1].map((sx) => paint(new THREE.ConeGeometry(0.022, 0.08, 5).rotateX(Math.PI).translate(sx * 0.05, 0.03, 0.29), FANG));
  const sockets = [-1, 1].map((sx) => ball(0.085, sx * 0.1, 0.22, 0.2, SOCKET, 1, 1, 0.75, 6, 4));
  return join([skull, snout, nose, ...ears, ...fangs, ...sockets, jamOn(C[0], C[1], C[2], 0.259, 0.228, 0.24, 0.5, -0.8, 0.07)]);
}

function eyesGeo(): THREE.BufferGeometry {
  return join([-1, 1].map((sx) => ball(0.068, sx * 0.1, 0, 0.225, EYE, 1, 1, 0.8, 7, 5)));
}

/** Левое крыло (вдоль +X от плеча), плоскость XZ: перепонка с фестонами и «пальцы» */
function wingGeo(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0.13);
  s.lineTo(0.46, 0.22);
  s.lineTo(1.02, 0.05);
  s.quadraticCurveTo(0.82, -0.06, 0.88, -0.3);
  s.quadraticCurveTo(0.67, -0.24, 0.6, -0.47);
  s.quadraticCurveTo(0.44, -0.3, 0.25, -0.42);
  s.quadraticCurveTo(0.13, -0.24, 0, -0.15);
  s.closePath();
  const membrane = paint(new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: false, curveSegments: 5 }).rotateX(Math.PI / 2).translate(0, 0.011, 0), (x, _y, z) =>
    z > 0.1 - x * 0.1 ? MEMBRANE_DARK : MEMBRANE);
  const y = 0.02;
  const bones = [
    taper([[0.02, y, 0.13], [0.24, y + 0.01, 0.2], [0.46, y, 0.22]], 0.042, 0.03, FUR, 5, 5, false),
    taper([[0.46, y, 0.22], [1.0, y, 0.06]], 0.022, 0.012, BONE, 3, 4, false),
    taper([[0.46, y, 0.22], [0.86, y, -0.28]], 0.02, 0.011, BONE, 3, 4, false),
    taper([[0.46, y, 0.22], [0.59, y, -0.44]], 0.02, 0.011, BONE, 3, 4, false),
    paint(new THREE.ConeGeometry(0.025, 0.08, 5).rotateX(Math.PI / 2).translate(0.48, y, 0.27), FANG),
  ];
  return join([membrane, ...bones]);
}

// ------------------------------------------------------------------ поза

const _R = new THREE.Matrix4();
const ST = { warn: ZS_FLY_WARN, dive: ZS_FLY_DIVE, recover: ZS_FLY_RECOVER, attack: ZS_ATTACK };

function pose(a: MobAnim, out: MobPose): void {
  const f = flyPose(a, ST, 3);
  pivotBone(_R, 0, BODY_Y, 0, 0, f.y, 0, f.pitch, f.yaw, f.roll, f.sc);
  link(out.body, _R, 0, BODY_Y, 0, 0, 0, 0, 1);
  link(out.head, out.body, 0, NECK_Y, 0.03, f.headRx, f.headRy, f.headRz, 1);
  linkS(out.prop, out.head, 0, 0.22, 0, 0, 0, 0, f.eyeS, f.eyeS * f.eyes, f.eyeS);
  linkS(out.wingL, out.body, SHOULDER_X, SHOULDER_Y, 0, 0.05, f.sweep, f.flap, f.span, 1, 1);
  linkS(out.wingR, out.body, -SHOULDER_X, SHOULDER_Y, 0, 0.05, -f.sweep, -f.flap, f.span, 1, 1);
}

const WING = wingGeo();

export const flyerBat: MobDef = {
  id: 'flyer-bat',
  name: 'Летучая мышь',
  kinds: [Z_FLYER],
  weight: 1,
  height: 1.35,
  parts: [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'head', geo: headGeo() },
    { bone: 'prop', geo: eyesGeo(), glow: true },
    { bone: 'wingL', geo: WING },
    { bone: 'wingR', geo: mirrorX(WING) },
  ],
  pose,
};
