// «Тролль-лесоруб» — бугай: сутулый лесной тролль, ручищи до колен, клетчатая рубаха, вязаная шапочка, картофельный нос,
// клыки снизу, мох на плечах. В правой — бревно-дубина в варенье. Ходит тяжело и вразвалку, бьёт бревном сверху по
// воротам, гибнет — валится лицом вперёд, как подрубленное дерево, и уходит в землю.
import * as THREE from 'three';
import { ZS_ATTACK, ZS_HOP } from '../../../shared/fort.ts';
import { Z_BRUTE } from '../../../shared/fortkinds.ts';
import { ARMY, colored, merge, setBone, setChild, setChildS, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import { TAU, blob, drip, eyePair, jolt, legAt, mirrorX, newLeg, paintFaces, smooth, splat, stepLen, walkAmount } from './set-a-shapes.ts';

const SKIN = 0x86a06c;
const SKIN_DARK = 0x5f7a4c;
const PLAID_A = new THREE.Color(0xc23a2e);
const PLAID_B = new THREE.Color(0x5c1f22);
const PLAID_C = new THREE.Color(0x8e2a27);
const PANTS = 0x4b5568;
const BOOT = 0x5a3a24;
const MOSS = 0x5f9a3c;
const HIP = 0.8;
const LEG = 0.8;
/** Плечи над бедром (в осях тела), шея */
const SHOULDER = 1.0;
const SHOULDER_X = 0.66;

/** Клетка по четырёхугольникам сетки: сектор по кругу и ряд по высоте — квадраты, а не треугольники */
function plaid(sector: number, row: number, c: THREE.Color): void {
  const a = sector % 2;
  const b = row % 2;
  c.copy(a && b ? PLAID_B : a || b ? PLAID_C : PLAID_A);
}

function sectorOf(x: number, z: number, segments: number): number {
  return Math.floor(((Math.atan2(x, z) + Math.PI) / (Math.PI * 2)) * segments) % segments;
}

const TORSO: ReadonlyArray<readonly [number, number]> = [[0, -0.08], [0.42, -0.04], [0.55, 0.2], [0.58, 0.46], [0.6, 0.72], [0.55, 0.95], [0.4, 1.1], [0, 1.2]];

function bodyGeo(): THREE.BufferGeometry {
  // бочка-туловище в клетку: плечи шире, грудь вперёд
  const torso = new THREE.LatheGeometry(TORSO.map(([r, y]) => new THREE.Vector2(r, y)), 10).scale(1.18, 1, 0.86);
  const parts: THREE.BufferGeometry[] = [
    paintFaces(torso, (x, y, z, c) => {
      if (y < 0.18) c.set(PANTS);
      else plaid(sectorOf(x, z, 10), TORSO.findIndex(([, ry]) => ry > y), c);
    }),
    // ремень с пряжкой
    colored(new THREE.CylinderGeometry(0.6, 0.62, 0.09, 12, 1, true).scale(1.18, 1, 0.86).translate(0, 0.2, 0), 0x3a2618),
    colored(new THREE.BoxGeometry(0.16, 0.12, 0.05).translate(0, 0.2, 0.52), 0xd9b25a),
    // голова вдавлена в плечи: лоб, нос картошкой, челюсть с клыками
    blob(0.27, 0.25, 0.26, SKIN, 9, 6).translate(0, 1.2, 0.3),
    blob(0.22, 0.06, 0.12, SKIN_DARK, 7, 3).translate(0, 1.31, 0.47),
    blob(0.1, 0.09, 0.11, 0x9fb07f, 6, 4).translate(0, 1.18, 0.56),
    blob(0.22, 0.12, 0.17, SKIN, 7, 4).translate(0, 1.05, 0.42),
    colored(new THREE.ConeGeometry(0.035, 0.11, 4).translate(0.1, 1.15, 0.56), 0xf4ecd6),
    colored(new THREE.ConeGeometry(0.035, 0.11, 4).translate(-0.1, 1.15, 0.56), 0xf4ecd6),
    // вязаная шапочка с помпоном
    colored(new THREE.SphereGeometry(0.255, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1).translate(0, 1.33, 0.27), 0xe07b2a),
    colored(new THREE.TorusGeometry(0.245, 0.04, 3, 9).rotateX(Math.PI / 2).translate(0, 1.33, 0.27), 0xc25f1c),
    blob(0.07, 0.07, 0.07, 0xf3e8d6, 5, 4).translate(0, 1.55, 0.26),
    // мох на плечах, варенье на рубахе
    blob(0.2, 0.08, 0.18, MOSS, 6, 3).translate(0.45, 1.02, 0.0),
    blob(0.16, 0.07, 0.15, MOSS, 6, 3).translate(-0.48, 0.98, -0.05),
    splat(0.25, 0.62, 0.48, 0.09, 0.4, 0, 0.9),
    splat(-0.36, 0.42, 0.43, 0.07, -0.6, 0, 0.8, ARMY.jamLight),
  ];
  return merge(parts);
}

/** Ручища от плеча вниз: плечо, предплечье, кулак; правая — с бревном */
function armGeo(log: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    paintFaces(new THREE.CapsuleGeometry(0.17, 0.3, 2, 8).translate(0, -0.2, 0), (x, y, z, c) => plaid(sectorOf(x, z, 8), Math.floor((y + 1) / 0.12), c)),
    colored(new THREE.CapsuleGeometry(0.15, 0.42, 1, 7).rotateX(-0.25).translate(0, -0.66, 0.08), SKIN),
    blob(0.2, 0.18, 0.2, SKIN_DARK, 7, 4).translate(0, -1.0, 0.16),
  ];
  if (log) {
    // бревно-дубина вперёд из кулака: кора, светлые торцы, сучки, конец в варенье
    parts.push(colored(new THREE.CylinderGeometry(0.15, 0.12, 1.25, 8, 1, true).rotateX(Math.PI / 2 - 0.35).translate(0, -1.2, 0.72), 0x7a5232));
    parts.push(colored(new THREE.CircleGeometry(0.15, 8).rotateX(-0.35).translate(0, -1.42, 1.31), 0xd9b98a));
    parts.push(colored(new THREE.ConeGeometry(0.05, 0.22, 5).rotateZ(1.2).translate(0.15, -1.15, 0.6), 0x6a4528));
    parts.push(colored(new THREE.ConeGeometry(0.04, 0.16, 5).rotateZ(-1.3).translate(-0.14, -1.32, 1.0), 0x6a4528));
    parts.push(splat(0, -1.27, 1.13, 0.13, 0, 0.94, 0.33));
    parts.push(drip(0.08, -1.36, 1.15, 0.12, 0.035));
  }
  return merge(parts);
}

function legGeo(): THREE.BufferGeometry {
  return merge([
    colored(new THREE.CylinderGeometry(0.2, 0.17, 0.6, 8, 1, true).translate(0, -0.3, 0), PANTS),
    blob(0.2, 0.15, 0.3, BOOT, 8, 4).translate(0, -LEG + 0.15, 0.08),
    colored(new THREE.CylinderGeometry(0.21, 0.21, 0.06, 8).translate(0, -LEG + 0.03, 0.08).scale(1, 1, 1.4), 0x2e1e14),
  ]);
}

const _m0 = new THREE.Matrix4();
const legL = newLeg();
const legR = newLeg();

export const BRUTE_TROLL: MobDef = {
  id: 'brute-troll',
  name: 'Тролль-лесоруб',
  kinds: [Z_BRUTE],
  weight: 1,
  height: 2.3,
  parts: [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'head', geo: eyePair(0, 0, 0, 0.17, 0.052, 0.75), glow: true },
    { bone: 'armL', geo: mirrorX(armGeo(false)) },
    { bone: 'armR', geo: armGeo(true) },
    { bone: 'legL', geo: legGeo() },
    { bone: 'legR', geo: legGeo() },
  ],
  pose(a: MobAnim, out: MobPose) {
    const seed = a.seed;
    const s = 0.93 + seed * 0.15;
    const w = walkAmount(a.speed, 0.5);
    // тяжёлый шаг: опора 62 %, тело проседает на каждом шаге и переваливается
    const duty = 0.62;
    const step = stepLen(1, duty, s);
    legAt(a.gait, duty, step, LEG, 0.12, legL);
    legAt(a.gait + 0.5, duty, step, LEG, 0.12, legR);
    const ph = a.gait * TAU;
    const stance = legL.down && legR.down ? Math.min(legL.hip, legR.hip) : legL.down ? legL.hip : legR.hip;
    let hipY = HIP + (stance - LEG) * w;
    let lean = 0.32 + 0.06 * w + Math.sin(a.t * 1.1 + seed * 4) * 0.02;
    let roll = Math.sin(ph) * 0.09 * w;
    let turn = Math.sin(ph) * 0.06 * w;
    let armL = -0.15 - Math.sin(ph) * 0.35 * w;
    let armR = -0.3 + Math.sin(ph) * 0.18 * w;
    let armRz = 0;
    let lx = legL.rx * w;
    let rx = legR.rx * w;
    let lsy = 1 + (legL.sy - 1) * w;
    let rsy = 1 + (legR.sy - 1) * w;
    const breathe = Math.sin(a.t * 1.6 + seed * 7) * 0.012;

    if (a.st === ZS_ATTACK) {
      // бревном сверху: замах за спину — удар вниз перед собой — поднял
      const k = a.stT;
      const up = k < 0.2 ? smooth(k / 0.2) : k < 0.28 ? 1 - smooth((k - 0.2) / 0.08) : 0;
      const slam = k < 0.2 ? 0 : k < 0.28 ? smooth((k - 0.2) / 0.08) : 1 - smooth((k - 0.28) / 0.3);
      armR = -0.3 - 2.75 * up + 0.85 * slam;
      armRz = -0.25 * up;
      armL = -0.6 * up + 0.3 * slam;
      lean = 0.2 - 0.22 * up + 0.4 * slam;
      roll = 0.1 * up;
      turn = -0.25 * up + 0.15 * slam;
      lx = -0.15 * slam;
      rx = 0.2 * slam;
    } else if (a.st === ZS_HOP) {
      armL = armR = -2.2;
      lx = rx = -0.35;
      lsy = rsy = 0.88;
      lean = 0.1;
    }
    const j = jolt(a.hit);
    lean -= 0.18 * j;

    // гибель: «Бревно!» — падает вперёд с ускорением, подскок, уходит в землю
    const d = a.die;
    const fall = Math.min(1, (d / 0.45) ** 2);
    const bounce = d > 0.45 && d < 0.6 ? Math.sin(((d - 0.45) / 0.15) * Math.PI) * 0.06 : 0;
    const sink = smooth((d - 0.62) / 0.38);
    setBone(_m0, 0, bounce - 0.45 * sink, 0, fall * 1.42, 0, 0, s);

    setChildS(out.body, _m0, 0, hipY, 0, lean, turn, roll + (seed - 0.5) * 0.08, 1, 1 + breathe, 1);
    const blink = (a.t + seed * 9) % 3.8 < 0.13 ? 0.15 : 1;
    setChildS(out.head, out.body, 0, 1.24, 0.555, 0, 0, 0, 1, blink, 1);
    setChild(out.armL, out.body, SHOULDER_X, SHOULDER, 0.05, armL - 0.3 * j - fall * 1.4, 0, 0.12 + 0.3 * fall);
    setChild(out.armR, out.body, -SHOULDER_X, SHOULDER, 0.05, armR - 0.2 * j - fall * 1.2, 0, -0.1 + armRz - 0.3 * fall);
    setChildS(out.legL, _m0, 0.3, hipY, 0, lx, 0, 0, 1, lsy, 1);
    setChildS(out.legR, _m0, -0.3, hipY, 0, rx, 0, 0, 1, rsy, 1);
  },
};
