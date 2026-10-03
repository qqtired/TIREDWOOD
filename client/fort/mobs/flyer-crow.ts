// Крылатка «Ворона-разбойница»: серая ворона в чёрной бандитской маске и красном платке на шее. Крылья с
// растопыренными маховыми перьями, хвост веером. Прицеливаясь, склоняет голову набок — смотрит на метку одним
// глазом, как настоящая птица; в пике выставляет когти вперёд. Гибель — та же, что у мыши: крылья
// захлопнулись, кувырком вниз (общая хореография крылаток набора — flyPose в b-parts.ts).
import * as THREE from 'three';
import { Z_FLYER } from '../../../shared/fortkinds.ts';
import { ZS_ATTACK, ZS_FLY_DIVE, ZS_FLY_RECOVER, ZS_FLY_WARN } from '../../../shared/fort.ts';
import { type MobAnim, type MobDef, type MobPose } from './kit.ts';
import { EYE, ball, flyPose, jamOn, join, lerp, link, linkS, mirrorX, paint, pivotBone, seg, smooth, taper } from './b-parts.ts';

const GREY = 0xa4a8ba;
const GREY_DARK = 0x7d8193;
const BLACK = 0x23252f;
const FEATHER = 0x3a3e50;
const BEAK = 0x3a3d4a;
const MASK = 0x17161d;
const RED = 0xd8333a;
const FOOT = 0x4b4b55;
const CLAW = 0xe8e2d4;

const BODY_Y = 0.68;
const SHOULDER_X = 0.2;
const SHOULDER_Y = 0.1;

// ------------------------------------------------------------------ геометрия

function bodyGeo(): THREE.BufferGeometry {
  const torso = ball(0.27, 0, 0, -0.02, (_x, y) => (y > 0.16 ? GREY_DARK : GREY), 1, 0.95, 1.3, 12, 9);
  // хвост веером
  const fan = new THREE.Shape();
  fan.moveTo(-0.08, -0.2);
  fan.lineTo(-0.21, -0.68);
  fan.lineTo(-0.13, -0.63);
  fan.lineTo(-0.08, -0.76);
  fan.lineTo(0, -0.68);
  fan.lineTo(0.08, -0.76);
  fan.lineTo(0.13, -0.63);
  fan.lineTo(0.21, -0.68);
  fan.lineTo(0.08, -0.2);
  fan.closePath();
  const tail = paint(new THREE.ExtrudeGeometry(fan, { depth: 0.03, bevelEnabled: false }).rotateX(Math.PI / 2 - 0.25).translate(0, 0.06, 0), BLACK);
  // красный платок на шее: обод и уголок спереди
  const scarf = paint(new THREE.TorusGeometry(0.13, 0.05, 5, 14).rotateX(Math.PI / 2 + 0.5).translate(0, 0.2, 0.23), RED);
  const flap = paint(new THREE.ConeGeometry(0.08, 0.16, 4).rotateX(Math.PI - 0.5).translate(0, 0.12, 0.35), RED);
  const neck = ball(0.13, 0, 0.2, 0.22, GREY, 1, 1.2, 1, 7, 4);
  return join([
    torso, neck, tail, scarf, flap,
    jamOn(0, 0, -0.02, 0.27, 0.257, 0.351, 0.7, 2.3, 0.11, 0.12),
    jamOn(0, 0, -0.02, 0.27, 0.257, 0.351, 1.9, -0.7, 0.09),
  ]);
}

function headGeo(): THREE.BufferGeometry {
  const skull = ball(0.19, 0, 0.1, 0.04, (_x, y) => (y > 0.22 ? GREY_DARK : GREY), 1, 1, 1.1, 11, 8);
  // клюв: верх длиннее, с крючком, низ короче
  const upper = paint(new THREE.ConeGeometry(0.075, 0.32, 7).rotateX(Math.PI / 2 + 0.12).scale(1, 0.75, 1).translate(0, 0.08, 0.33), BEAK);
  const lower = paint(new THREE.ConeGeometry(0.055, 0.2, 6).rotateX(Math.PI / 2 + 0.3).scale(1, 0.6, 1).translate(0, 0.02, 0.27), BEAK);
  // бандитская маска: чёрная полоса вокруг головы на уровне глаз и концы узла на затылке
  const mask = ball(0.2, 0, 0.14, 0.04, MASK, 1.06, 0.36, 1.12, 11, 6);
  const ribbons = [-1, 1].map((sx) => taper([[sx * 0.03, 0.14, -0.17], [sx * 0.09, 0.1, -0.3], [sx * 0.12, 0.02, -0.38]], 0.03, 0.018, MASK, 3, 4, false));
  return join([skull, upper, lower, mask, ...ribbons]);
}

function eyesGeo(): THREE.BufferGeometry {
  return join([-1, 1].map((sx) => ball(0.055, sx * 0.09, 0, 0.18, EYE, 1, 0.9, 0.8, 7, 5)));
}

/** Левое крыло: кроющие и пять растопыренных маховых, по краю — фестоны второстепенных */
function wingGeo(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0.12);
  s.lineTo(0.4, 0.18);
  s.lineTo(0.95, 0.06);
  s.lineTo(0.85, 0.0);
  s.lineTo(1.0, -0.08);
  s.lineTo(0.87, -0.12);
  s.lineTo(0.98, -0.22);
  s.lineTo(0.84, -0.24);
  s.lineTo(0.9, -0.34);
  s.lineTo(0.75, -0.33);
  s.lineTo(0.76, -0.43);
  s.lineTo(0.62, -0.38);
  s.lineTo(0.52, -0.45);
  s.lineTo(0.4, -0.38);
  s.lineTo(0.27, -0.43);
  s.lineTo(0.13, -0.34);
  s.lineTo(0, -0.2);
  s.closePath();
  const wing = paint(new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.015, 0), (x, _y, z) =>
    x > 0.74 ? FEATHER : BLACK);
  return join([wing, jamOn(0.42, 0.02, -0.08, 0.2, 0.03, 0.2, 0.1, 0, 0.09)]);
}

/** Лапы с когтями: от «бедра» под брюхом вниз, по три пальца вперёд и один назад */
function talonsGeo(): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const x = sx * 0.09;
    list.push(taper([[x, 0, 0], [x, -0.16, 0.02]], 0.032, 0.022, FOOT, 2, 5, false));
    for (const [dx, dz] of [[-0.05, 0.1], [0, 0.12], [0.05, 0.1], [0, -0.08]] as const) {
      list.push(taper([[x, -0.16, 0.02], [x + dx, -0.18, 0.02 + dz]], 0.018, 0.014, FOOT, 2, 4, false));
      list.push(paint(new THREE.ConeGeometry(0.014, 0.05, 4).rotateX(dz > 0 ? Math.PI / 2 + 0.6 : -Math.PI / 2 - 0.6).translate(x + dx * 1.15, -0.19, 0.02 + dz * 1.2), CLAW));
    }
  }
  return join(list);
}

// ------------------------------------------------------------------ поза

const _R = new THREE.Matrix4();
const ST = { warn: ZS_FLY_WARN, dive: ZS_FLY_DIVE, recover: ZS_FLY_RECOVER, attack: ZS_ATTACK };

function pose(a: MobAnim, out: MobPose): void {
  const f = flyPose(a, ST, 2.6);
  // птичье: прицеливаясь, склоняет голову набок — смотрит на метку одним глазом
  let tilt = f.headRz;
  if (a.st === ZS_FLY_WARN && a.die === 0) tilt += 0.5 * smooth(seg(a.stT, 0.15, 0.6)) * (1 - smooth(seg(a.stT, 0.85, 1.1)));
  pivotBone(_R, 0, BODY_Y, 0, 0, f.y, 0, f.pitch, f.yaw, f.roll, f.sc);
  link(out.body, _R, 0, BODY_Y, 0, 0, 0, 0, 1);
  link(out.head, out.body, 0, 0.25, 0.26, f.headRx, f.headRy, tilt, 1);
  linkS(out.prop, out.head, 0, 0.14, 0, 0, 0, 0, f.eyeS, f.eyeS * f.eyes, f.eyeS);
  linkS(out.wingL, out.body, SHOULDER_X, SHOULDER_Y, 0, 0.05, f.sweep, f.flap, f.span, 1, 1);
  linkS(out.wingR, out.body, -SHOULDER_X, SHOULDER_Y, 0, 0.05, -f.sweep, -f.flap, f.span, 1, 1);
  // когти: в полёте поджаты назад, в пике и при ударе — вперёд и врастопырку
  const k = f.talons;
  link(out.legL, out.body, 0, -0.2, 0.02, lerp(1.35, -0.55, k), 0, 0, lerp(0.8, 1.25, k));
}

const WING = wingGeo();

export const flyerCrow: MobDef = {
  id: 'flyer-crow',
  name: 'Ворона-разбойница',
  kinds: [Z_FLYER],
  weight: 1,
  height: 1.3,
  parts: [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'head', geo: headGeo() },
    { bone: 'prop', geo: eyesGeo(), glow: true },
    { bone: 'wingL', geo: WING },
    { bone: 'wingR', geo: mirrorX(WING) },
    { bone: 'legL', geo: talonsGeo() },
  ],
  pose,
};
