// «Медведь в шлеме-кастрюле» — бугай: бурый медведь на задних лапах, на голове кастрюля донцем вверх (ручки торчат, как
// у шлема), морда и лапа в варенье — объелся. Переваливается с боку на бок, бьёт наотмашь то левой, то правой лапой,
// гибнет — плюхается на попу, потом на спину и уходит в землю.
import * as THREE from 'three';
import { ZS_ATTACK, ZS_HOP } from '../../../shared/fort.ts';
import { Z_BRUTE } from '../../../shared/fortkinds.ts';
import { ARMY, colored, merge, setBone, setChild, setChildS, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import { TAU, blob, drip, eyePair, jolt, legAt, mirrorX, newLeg, paint, smooth, splat, stepLen, walkAmount } from './set-a-shapes.ts';

const FUR = 0x8a5a3a;
const FUR_DARK = 0x6a4129;
const TAN = 0xd6a670;
const POT = 0xaab3bb;
const POT_DARK = 0x6f7880;
const HIP = 0.66;
const LEG = 0.66;
const SHOULDER = 0.9;
const SHOULDER_X = 0.5;
/** Центр головы над бедром */
const HEAD_Y = 1.26;

function bodyGeo(): THREE.BufferGeometry {
  const pot = paint(new THREE.CylinderGeometry(0.31, 0.33, 0.3, 12, 2, false), (x, y, _z, c) => {
    // блик полосой и вмятина сбоку
    c.set(POT);
    if (x > 0.12 && x < 0.22) c.set(0xdde3e8);
    if (y > 0.1) c.set(0x9aa3ab);
  });
  // туловище-груша, светлое брюхо — цветом вершин, без отдельной заплатки
  const fur = new THREE.Color(FUR);
  const tan = new THREE.Color(TAN);
  const torso = paint(new THREE.LatheGeometry([[0, -0.05], [0.42, 0], [0.56, 0.25], [0.585, 0.55], [0.52, 0.84], [0.38, 1.03], [0, 1.12]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 11), (x, y, z, c) => {
    const e = (x / 0.34) ** 2 + ((y - 0.42) / 0.4) ** 2;
    c.copy(fur).lerp(tan, z > 0.15 ? Math.max(0, Math.min(1, (1.15 - e) * 2.5)) : 0);
  });
  const parts: THREE.BufferGeometry[] = [
    torso,
    // голова: лоб, морда, нос, уши из-под кастрюли
    blob(0.31, 0.29, 0.3, FUR, 9, 6).translate(0, HEAD_Y, 0.06),
    blob(0.16, 0.12, 0.14, TAN, 7, 5).translate(0, HEAD_Y - 0.1, 0.3),
    blob(0.07, 0.05, 0.05, 0x2a1c16, 6, 4).translate(0, HEAD_Y - 0.04, 0.43),
    blob(0.1, 0.1, 0.06, FUR_DARK, 6, 4).translate(0.28, HEAD_Y + 0.12, 0.0),
    blob(0.1, 0.1, 0.06, FUR_DARK, 6, 4).translate(-0.28, HEAD_Y + 0.12, 0.0),
    // кастрюля донцем вверх, ободок, ручки-«рога»
    pot.rotateZ(0.1).rotateX(-0.08).translate(0.02, HEAD_Y + 0.24, 0.02),
    colored(new THREE.TorusGeometry(0.33, 0.03, 3, 12).rotateX(Math.PI / 2).rotateZ(0.1).translate(0.005, HEAD_Y + 0.1, 0.03), POT_DARK),
    colored(new THREE.TorusGeometry(0.075, 0.022, 3, 8).rotateY(Math.PI / 2).translate(0.38, HEAD_Y + 0.28, 0.02), POT_DARK),
    colored(new THREE.TorusGeometry(0.075, 0.022, 3, 8).rotateY(Math.PI / 2).translate(-0.33, HEAD_Y + 0.23, 0.02), POT_DARK),
    // морда в варенье, капли на грудь
    splat(0, HEAD_Y - 0.19, 0.36, 0.12, 0, -0.3, 1),
    drip(0.06, HEAD_Y - 0.24, 0.36, 0.16, 0.034),
    splat(0.18, 0.6, 0.53, 0.07, 0.3, 0, 1, ARMY.jamLight),
    splat(-0.36, 0.3, 0.42, 0.08, -0.6, 0, 0.8),
  ];
  return merge(parts);
}

/** Лапища от плеча вниз с когтями; правая — в варенье по локоть */
function armGeo(jam: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    colored(new THREE.CapsuleGeometry(0.16, 0.5, 1, 7).translate(0, -0.36, 0.02), FUR),
    blob(0.19, 0.16, 0.18, FUR_DARK, 7, 5).translate(0, -0.78, 0.06),
  ];
  if (jam) {
    parts.push(blob(0.2, 0.12, 0.19, ARMY.jam, 7, 4).translate(0, -0.72, 0.06));
    parts.push(drip(0.06, -0.86, 0.1, 0.12, 0.035));
  }
  return merge(parts);
}

function legGeo(): THREE.BufferGeometry {
  return merge([
    colored(new THREE.CapsuleGeometry(0.19, 0.3, 1, 7).translate(0, -0.27, 0), FUR),
    blob(0.19, 0.11, 0.27, FUR_DARK, 8, 4).translate(0, -LEG + 0.11, 0.07),
    blob(0.13, 0.03, 0.17, TAN, 6, 3).translate(0, -LEG + 0.035, 0.1),
  ]);
}

const _m0 = new THREE.Matrix4();
const legL = newLeg();
const legR = newLeg();

export const BRUTE_BEAR: MobDef = {
  id: 'brute-bear',
  name: 'Медведь в шлеме-кастрюле',
  kinds: [Z_BRUTE],
  weight: 1,
  height: 2.36,
  parts: [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'head', geo: eyePair(0, 0, 0, 0.2, 0.05, 0.9), glow: true },
    { bone: 'armL', geo: mirrorX(armGeo(false)) },
    { bone: 'armR', geo: armGeo(true) },
    { bone: 'legL', geo: legGeo() },
    { bone: 'legR', geo: legGeo() },
  ],
  pose(a: MobAnim, out: MobPose) {
    const seed = a.seed;
    const s = 0.93 + seed * 0.15;
    const w = walkAmount(a.speed, 0.5);
    const duty = 0.6;
    const step = stepLen(1, duty, s);
    legAt(a.gait, duty, step, LEG, 0.1, legL);
    legAt(a.gait + 0.5, duty, step, LEG, 0.1, legR);
    const ph = a.gait * TAU;
    const stance = legL.down && legR.down ? Math.min(legL.hip, legR.hip) : legL.down ? legL.hip : legR.hip;
    let hipY = HIP + (stance - LEG) * w;
    // переваливается: крен и поворот корпуса за шагом
    let lean = 0.08 + 0.06 * w + Math.sin(a.t * 1.3 + seed * 5) * 0.02;
    let roll = Math.sin(ph) * 0.13 * w + Math.sin(a.t * 0.9 + seed * 3) * 0.04 * (1 - w);
    let turn = -Math.sin(ph) * 0.1 * w;
    let armL = -0.2 - Math.sin(ph) * 0.4 * w;
    let armR = -0.2 + Math.sin(ph) * 0.4 * w;
    let armLz = 0.2;
    let armRz = -0.2;
    let lx = legL.rx * w;
    let rx = legR.rx * w;
    let lsy = 1 + (legL.sy - 1) * w;
    let rsy = 1 + (legR.sy - 1) * w;
    let headX = 0;

    if (a.st === ZS_ATTACK) {
      // наотмашь: лапа вверх-в сторону — удар поперёк — назад; какая лапа — по моменту удара
      const k = a.stT;
      const right = Math.floor((a.t - a.stT) * 1.7 + seed * 5) % 2 === 0;
      const up = k < 0.15 ? smooth(k / 0.15) : k < 0.25 ? 1 - smooth((k - 0.15) / 0.1) : 0;
      const swipe = k < 0.15 ? 0 : k < 0.25 ? smooth((k - 0.15) / 0.1) : 1 - smooth((k - 0.25) / 0.25);
      const x = -2.4 * up - 1.2 * swipe;
      const z = 0.9 * up - 0.5 * swipe;
      if (right) {
        armR = x;
        armRz = -z;
      } else {
        armL = x;
        armLz = z;
      }
      turn = (right ? 1 : -1) * (-0.25 * up + 0.4 * swipe);
      lean = 0.05 - 0.1 * up + 0.25 * swipe;
      roll = (right ? -1 : 1) * 0.08 * swipe;
      headX = 0.15 * swipe;
    } else if (a.st === ZS_HOP) {
      armL = armR = -2.3;
      lx = rx = -0.4;
      lsy = rsy = 0.85;
    }
    const j = jolt(a.hit);
    lean -= 0.2 * j;

    // гибель: плюх на попу (бедро вниз, лапы вперёд), потом на спину, уходит в землю
    const d = a.die;
    const sit = smooth(d / 0.3);
    const back = smooth((d - 0.32) / 0.25);
    const sink = smooth((d - 0.65) / 0.35);
    setBone(_m0, 0, -0.4 * sink, -0.3 * back * s, 0, 0, 0, s);
    hipY = hipY + (0.25 - hipY) * sit;
    lean = lean * (1 - sit) - 0.25 * sit - 1.25 * back;
    lx = lx * (1 - sit) - 1.4 * sit;
    rx = rx * (1 - sit) - 1.3 * sit;
    armL = armL * (1 - sit) - 0.9 * sit - 1.2 * back;
    armR = armR * (1 - sit) - 0.9 * sit - 1.2 * back;

    setChild(out.body, _m0, 0, hipY, 0, lean, turn, roll + (seed - 0.5) * 0.08);
    const blink = (a.t + seed * 6) % 4.2 < 0.13 ? 0.15 : 1;
    setChildS(out.head, out.body, 0, HEAD_Y + 0.02, 0.33, headX, 0, 0, 1, blink, 1);
    setChild(out.armL, out.body, SHOULDER_X, SHOULDER, 0.04, armL - 0.3 * j, 0, armLz);
    setChild(out.armR, out.body, -SHOULDER_X, SHOULDER, 0.04, armR - 0.3 * j, 0, armRz);
    setChildS(out.legL, _m0, 0.26, hipY, 0, lx, 0, 0, 1, lsy, 1);
    setChildS(out.legR, _m0, -0.26, hipY, 0, rx, 0, 0, 1, rsy, 1);
  },
};
