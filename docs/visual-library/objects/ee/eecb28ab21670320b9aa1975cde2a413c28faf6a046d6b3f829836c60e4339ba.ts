// «Грибник» — шаркун-мухомор: толстая ножка с юбочкой, красная шляпка в белых точках и каплях варенья, глазки
// из-под шляпки, ручки-коротышки и ножки-комочки земли. Семенит, бьёт шляпкой с разбега, гибнет — сплющился в лепёшку.
import * as THREE from 'three';
import { ZS_ATTACK, ZS_HOP } from '../../../shared/fort.ts';
import { Z_WALKER } from '../../../shared/fortkinds.ts';
import { ARMY, colored, merge, setBoneS, setChild, setChildS, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import { TAU, blob, drip, eyePair, jolt, lathe, legAt, newLeg, smooth, splat, stepLen, walkAmount } from './set-a-shapes.ts';

const HIP = 0.3;
const LEG = 0.3;
const CAP_RED = 0xd8322e;
const STEM = 0xf1e3c4;
const SOIL = 0x6b4a2e;
const WHITE = 0xfff4e2;

/** Шляпка — купол радиусом CAP_R и высотой CAP_H над основанием; точка на ней и нормаль наружу */
const CAP_R = 0.62;
const CAP_H = 0.44;
function capAt(a: number, r: number): [number, number, number, number, number, number] {
  const y = CAP_H * Math.sqrt(Math.max(0, 1 - (r / (CAP_R + 0.02)) ** 2));
  const x = Math.sin(a) * r;
  const z = Math.cos(a) * r;
  const n = new THREE.Vector3(x / CAP_R ** 2, y / CAP_H ** 2, z / CAP_R ** 2).normalize();
  return [x, y, z, n.x, n.y, n.z];
}

/** Шляпка в своих осях (основание — 0), сдвинута на затылок, чтобы глазки было видно со стены */
function capGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    lathe([[0, -0.05], [0.6, 0]], 12, 0xe8d2a8),
    lathe([[0.6, 0], [0.635, 0.06], [0.58, 0.19], [0.45, 0.31], [0.25, 0.4], [0, 0.44]], 12, CAP_RED),
  ];
  // белые точки — главное, что видно со стены
  for (const [a, r, size] of [[0.45, 0.47, 0.1], [2.1, 0.45, 0.095], [3.9, 0.5, 0.1], [5.25, 0.4, 0.09], [1.3, 0.22, 0.08], [-0.6, 0.18, 0.075]] as const) {
    const [x, y, z, nx, ny, nz] = capAt(a, r);
    parts.push(splat(x, y, z, size, nx, ny, nz, WHITE));
  }
  // варенье на шляпке: лужица на макушке и потёки с края
  const [px, py, pz, pnx, pny, pnz] = capAt(0.8, 0.1);
  parts.push(splat(px, py, pz, 0.17, pnx, pny, pnz, ARMY.jam));
  const [qx, qy, qz, qnx, qny, qnz] = capAt(-1.2, 0.36);
  parts.push(splat(qx, qy, qz, 0.1, qnx, qny, qnz, ARMY.jamLight));
  for (const [a, len] of [[0.35, 0.15], [-0.9, 0.1], [1.75, 0.13]] as const) {
    parts.push(drip(Math.sin(a) * 0.615, 0.04, Math.cos(a) * 0.615, len, 0.03));
  }
  return merge(parts).rotateX(-0.22).translate(0, 1.18, -0.03);
}

function bodyGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    // ножка: снизу пузатая, к шляпке уже
    lathe([[0, 0.25], [0.19, 0.26], [0.25, 0.38], [0.265, 0.56], [0.245, 0.76], [0.215, 0.96], [0.185, 1.14], [0.16, 1.24]], 10, STEM),
    // юбочка мухомора под личиком
    lathe([[0.225, 0.92], [0.29, 0.86], [0.305, 0.81]], 10, 0xfffaf0),
    capGeo(),
    // ротик-улыбка с зубом
    colored(new THREE.TorusGeometry(0.055, 0.016, 3, 7, Math.PI).rotateZ(Math.PI).translate(0, 1.035, 0.198), 0x3a1a1c),
    colored(new THREE.BoxGeometry(0.026, 0.028, 0.02).translate(0.02, 1.02, 0.206), WHITE),
    // пятно варенья на ножке (общая примета войска Барона)
    splat(-0.14, 0.5, 0.21, 0.07, -0.55, 0, 0.83),
  ];
  return merge(parts).translate(0, -HIP, 0);
}

function armGeo(): THREE.BufferGeometry {
  return merge([
    colored(new THREE.CapsuleGeometry(0.05, 0.16, 2, 6).translate(0, -0.11, 0), STEM),
    blob(0.065, 0.06, 0.06, 0xe9d9b6, 6, 4).translate(0, -0.24, 0.01),
  ]);
}

function legGeo(): THREE.BufferGeometry {
  return merge([
    colored(new THREE.CylinderGeometry(0.075, 0.085, 0.24, 7, 1, true).translate(0, -0.12, 0), STEM),
    blob(0.1, 0.065, 0.13, SOIL, 7, 5).translate(0, -LEG + 0.065, 0.03),
  ]);
}

const _m0 = new THREE.Matrix4();
const legL = newLeg();
const legR = newLeg();

export const WALKER_MUSHROOM: MobDef = {
  id: 'walker-mushroom',
  name: 'Грибник',
  kinds: [Z_WALKER],
  weight: 1,
  height: 1.6,
  parts: [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'head', geo: eyePair(0, 0, 0, 0.14, 0.058, 1.15), glow: true },
    { bone: 'armL', geo: armGeo() },
    { bone: 'armR', geo: armGeo() },
    { bone: 'legL', geo: legGeo() },
    { bone: 'legR', geo: legGeo() },
  ],
  pose(a: MobAnim, out: MobPose) {
    const seed = a.seed;
    const s = 0.92 + seed * 0.16;
    const w = walkAmount(a.speed, 0.6);
    // два шага-цикла на 1,25 м: ножки короткие — семенит
    const step = stepLen(2, 0.56, s);
    legAt(a.gait * 2, 0.56, step, LEG, 0.07, legL);
    legAt(a.gait * 2 + 0.5, 0.56, step, LEG, 0.07, legR);
    const ph = a.gait * 2 * TAU;
    const stance = legL.down && legR.down ? Math.min(legL.hip, legR.hip) : legL.down ? legL.hip : legR.hip;
    let hipY = HIP + (stance - LEG) * w;
    let lean = 0.08 * w;
    let roll = Math.sin(ph) * (0.06 + 0.05 * ((seed * 7) % 1)) * w;
    let turn = Math.sin(a.t * 0.6 + seed * 11) * 0.12 * (1 - w);
    let armX = Math.sin(ph) * (0.35 + seed * 0.25) * w;
    let armZ = 0.55;
    let lx = legL.rx * w;
    let rx = legR.rx * w;
    let lsy = 1 + (legL.sy - 1) * w;
    let rsy = 1 + (legR.sy - 1) * w;
    const breathe = Math.sin(a.t * 2.1 + seed * 9) * 0.018 * (1 - w * 0.5);

    if (a.st === ZS_ATTACK) {
      // бодается шляпкой: откинулся — рывок вперёд — назад
      const k = a.stT;
      const back = k < 0.12 ? smooth(k / 0.12) : k < 0.2 ? 1 - smooth((k - 0.12) / 0.08) : 0;
      const slam = k < 0.12 ? 0 : k < 0.2 ? smooth((k - 0.12) / 0.08) : 1 - smooth((k - 0.2) / 0.3);
      lean = 0.05 - 0.38 * back + 0.85 * slam;
      armX = -1.1 * back + 0.9 * slam;
      armZ = 0.55 + 0.5 * slam;
      roll *= 0.3;
      turn = 0;
      lx = -0.25 * slam;
      rx = 0.35 * slam;
    } else if (a.st === ZS_HOP) {
      // прыжок из лодки: ручки вверх, ножки поджал
      lean = -0.15;
      armX = -2.5;
      armZ = 0.35;
      lx = rx = -0.7;
      lsy = rsy = 0.8;
      hipY = HIP;
    }
    const j = jolt(a.hit);
    lean -= 0.3 * j;

    // гибель: подпрыгнул, сплющился в лепёшку, ушёл в землю
    const d = a.die;
    const boing = d > 0 ? Math.sin(Math.min(1, d / 0.18) * Math.PI) * 0.18 : 0;
    const flat = smooth((d - 0.12) / 0.2);
    const sink = smooth((d - 0.55) / 0.45);
    const sy = s * (1 - 0.8 * flat - 0.1 * j) * (1 - 0.6 * sink);
    const sxz = s * (1 + 0.5 * flat + 0.06 * j) * (1 - 0.35 * sink);
    setBoneS(_m0, 0, boing - 0.12 * sink, 0, 0, 0, 0, sxz, sy, sxz);

    setChildS(out.body, _m0, 0, hipY, 0, lean, turn, roll + (seed - 0.5) * 0.12, 1, 1 + breathe, 1);
    // глазки моргают раз в ~3,5 с
    const blink = (a.t + seed * 7) % 3.4 < 0.12 ? 0.12 : 1;
    setChildS(out.head, out.body, 0, 1.12 - HIP, 0.175, 0, 0, 0, 1, blink, 1);
    setChild(out.armL, out.body, 0.245, 0.66 - HIP, 0.02, armX, 0, armZ);
    setChild(out.armR, out.body, -0.245, 0.66 - HIP, 0.02, -armX * (a.st === ZS_ATTACK ? -1 : 1), 0, -armZ);
    setChildS(out.legL, _m0, 0.12, hipY, 0, lx, 0, 0, 1, lsy, 1);
    setChildS(out.legR, _m0, -0.12, hipY, 0, rx, 0, 0, 1, rsy, 1);
  },
};
