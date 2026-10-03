// «Заяц-хулиган» — шустрик: серо-бурый заяц в красной бандане с хвостиками, зубы торчат, одно ухо надорвано, глаза
// с прищуром. Несётся скачками обеими лапами разом, уши на бегу прижаты назад. Бьёт ворота дропкиком задними лапами,
// гибнет — сальто назад, плюх на спину лапами кверху, уходит в землю.
import * as THREE from 'three';
import { ZS_ATTACK, ZS_HOP } from '../../../shared/fort.ts';
import { Z_RUNNER } from '../../../shared/fortkinds.ts';
import { ARMY, colored, merge, setBone, setChild, setChildS, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import { blob, eyePair, jolt, lathe, legAt, newLeg, smooth, splat, stepLen, walkAmount } from './set-a-shapes.ts';

const FUR = 0xa98b6c;
const FUR_DARK = 0x8a6d52;
const CREAM = 0xf3e8d6;
const BANDANA = 0xd8352e;
/** Бедро задних лап и длина ноги до подошвы */
const HIP = 0.36;
const LEG = 0.36;
/** Шея (центр головы) над бедром, плечи */
const HEAD_Y = 0.93;
const SHOULDER_Y = 0.66;

function bodyGeo(): THREE.BufferGeometry {
  return merge([
    lathe([[0, 0.24], [0.16, 0.25], [0.215, 0.34], [0.225, 0.48], [0.19, 0.63], [0.13, 0.75], [0, 0.8]], 9, FUR),
    blob(0.14, 0.2, 0.06, CREAM, 7, 4).translate(0, 0.47, 0.17),
    blob(0.09, 0.085, 0.085, 0xffffff, 6, 4).translate(0, 0.33, -0.21),
    splat(0.16, 0.55, 0.12, 0.07, 0.8, 0, 0.55),
    splat(-0.19, 0.4, -0.08, 0.065, -0.9, 0, -0.3, ARMY.jamLight),
  ]).translate(0, -HIP, 0);
}

/** Голова с мордочкой, зубами, бровями «хулигана» и банданой; начало — центр головы */
function headGeo(): THREE.BufferGeometry {
  const parts = [
    blob(0.15, 0.142, 0.16, FUR, 9, 6),
    blob(0.1, 0.07, 0.08, CREAM, 7, 4).translate(0, -0.05, 0.12),
    blob(0.03, 0.022, 0.02, 0xe07a8e, 5, 3).translate(0, -0.015, 0.195),
    colored(new THREE.BoxGeometry(0.06, 0.055, 0.02).translate(0, -0.1, 0.178), 0xffffff),
    colored(new THREE.BoxGeometry(0.004, 0.056, 0.022).translate(0, -0.1, 0.18), 0xb9b0a0),
    // брови домиком наоборот — хмурый хулиган
    colored(new THREE.BoxGeometry(0.075, 0.018, 0.02).rotateZ(-0.38).translate(0.055, 0.075, 0.135), 0x4a3424),
    colored(new THREE.BoxGeometry(0.075, 0.018, 0.02).rotateZ(0.38).translate(-0.055, 0.075, 0.135), 0x4a3424),
    // бандана: обод, узел на затылке, хвостики назад
    colored(new THREE.TorusGeometry(0.152, 0.03, 3, 12).rotateX(Math.PI / 2 - 0.25).translate(0, 0.075, -0.005), BANDANA),
    blob(0.05, 0.04, 0.04, BANDANA, 6, 4).translate(0, 0.07, -0.16),
    colored(new THREE.BoxGeometry(0.05, 0.015, 0.17).rotateX(-0.5).rotateY(0.3).translate(0.03, 0.03, -0.24), BANDANA),
    colored(new THREE.BoxGeometry(0.045, 0.015, 0.14).rotateX(-0.25).rotateY(-0.35).translate(-0.04, 0.05, -0.23), BANDANA),
  ];
  return merge(parts);
}

/** Уши от макушки: левое целое, правое надорвано и согнуто; начало — макушка, уши вверх */
function earsGeo(): THREE.BufferGeometry {
  const ear = (x: number, len: number, rz: number) => merge([
    colored(new THREE.CapsuleGeometry(0.05, len, 2, 6).scale(1, 1, 0.45).translate(0, len / 2 + 0.04, 0), FUR),
    colored(new THREE.CapsuleGeometry(0.03, len * 0.8, 1, 4).scale(1, 1, 0.3).translate(0, len / 2 + 0.04, 0.012), 0xe8a6b0),
  ]).rotateZ(rz).translate(x, 0, 0);
  return merge([
    ear(0.055, 0.3, -0.18),
    ear(-0.055, 0.16, 0.2),
    // надорванный кончик правого уха — висит вбок
    colored(new THREE.CapsuleGeometry(0.045, 0.1, 2, 5).scale(1, 1, 0.45).rotateZ(1.2).translate(-0.14, 0.25, 0), FUR_DARK),
  ]);
}

/** Передние лапы (обе на одной кости): от плеч вниз, кулачки */
function pawsGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.13, 0.13]) {
    parts.push(colored(new THREE.CapsuleGeometry(0.04, 0.16, 2, 5).translate(x, -0.11, 0), FUR));
    parts.push(blob(0.05, 0.05, 0.05, CREAM, 6, 4).translate(x, -0.23, 0.01));
  }
  return merge(parts);
}

/** Задние лапы (обе разом — скачет): ляжки и длинные ступни; начало — бедро, подошва на −LEG */
function legsGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.12, 0.12]) {
    parts.push(blob(0.095, 0.17, 0.13, FUR, 7, 5).translate(x, -0.12, 0));
    parts.push(colored(new THREE.CapsuleGeometry(0.04, 0.14, 1, 5).translate(x, -0.27, 0.01), FUR));
    parts.push(blob(0.065, 0.035, 0.15, CREAM, 6, 4).translate(x, -LEG + 0.035, 0.09));
  }
  return merge(parts);
}

const _m0 = new THREE.Matrix4();
const legs = newLeg();

export const RUNNER_HARE: MobDef = {
  id: 'runner-hare',
  name: 'Заяц-хулиган',
  kinds: [Z_RUNNER],
  weight: 1,
  height: 1.3,
  parts: [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'head', geo: headGeo() },
    { bone: 'head', geo: eyePair(0, 0.02, 0.135, 0.11, 0.042, 0.72), glow: true },
    { bone: 'extra', geo: earsGeo() },
    { bone: 'armL', geo: pawsGeo() },
    { bone: 'legL', geo: legsGeo() },
  ],
  pose(a: MobAnim, out: MobPose) {
    const seed = a.seed;
    const s = 0.92 + seed * 0.16;
    const w = walkAmount(a.speed, 1);
    // скачок за период походки: на земле 28 %, в полёте дуга
    const duty = 0.28;
    const p = a.gait;
    legAt(p, duty, stepLen(1, duty, s), LEG, 0, legs);
    const fly = p >= duty ? (p - duty) / (1 - duty) : 0;
    const land = p < duty ? Math.sin((p / duty) * Math.PI) : 0;
    const run = walkAmount(a.speed, 4);
    let hipY = HIP + (legs.hip - LEG) * w + 4 * fly * (1 - fly) * (0.06 + 0.12 * run) * w;
    // на бегу почти горизонтально, в полёте ещё вытягивается
    let lean = (0.12 + 0.72 * run) * w - land * 0.1 * w + fly * (1 - fly) * 0.5 * run;
    let legX = legs.rx * w;
    let lunge = 0;
    let paws = (0.25 - fly * (1 - fly) * 3.2 * run) * w + Math.sin(a.t * 2.6 + seed * 5) * 0.08 * (1 - w);
    let ears = -0.15 - 1.45 * run + land * 0.3 * w + Math.sin(a.t * 3.1 + seed * 7) * 0.08 * (1 - w);
    let headX = -lean * 0.6;
    let lift = 0;
    let flip = 0;
    const squash = land * 0.1 * w;
    // на месте: подёргивает носом и озирается
    const look = Math.sin(a.t * 0.9 + seed * 13) * 0.35 * (1 - w);

    if (a.st === ZS_ATTACK) {
      // дропкик: присел — прыжок с ударом обеими лапами вперёд — приземлился
      const k = a.stT;
      const crouch = k < 0.1 ? smooth(k / 0.1) : 0;
      const kick = k < 0.1 ? 0 : k < 0.2 ? smooth((k - 0.1) / 0.1) : 1 - smooth((k - 0.2) / 0.22);
      flip = -1.2 * kick;
      lift = 0.32 * kick;
      lunge = 0.25 * kick;
      legX = -1.95 * kick + 0.4 * crouch;
      hipY = HIP - 0.08 * crouch;
      lean = 0.25 * crouch;
      paws = 0.6 * kick - 0.3 * crouch;
      ears = -0.6 - 0.6 * kick;
      headX = 0.3 * kick;
    } else if (a.st === ZS_HOP) {
      legX = 0.5;
      paws = -1.6;
      ears = -1.3;
      lean = 0.2;
    }
    const j = jolt(a.hit);
    lean -= 0.35 * j;
    ears += 0.6 * j;

    // гибель: сальто назад и плюх на спину лапами вверх (−2,5π вокруг центра тела), дрыгнул и ушёл в землю
    const d = a.die;
    const spin = smooth(d / 0.4);
    const sink = smooth((d - 0.6) / 0.4);
    const kickD = d > 0.4 && d < 0.75 ? Math.sin(((d - 0.4) / 0.35) * Math.PI * 3) * 0.3 : 0;
    const air = Math.sin(Math.min(1, d / 0.4) * Math.PI) * 0.5;
    const pivot = 0.5 + (0.24 - 0.5) * spin;
    setBone(_m0, 0, (pivot + air) * s - 0.3 * sink, -0.45 * spin * s, -spin * Math.PI * 2.5, 0, 0, s);
    _m0.multiply(setBone(out.prop, 0, -0.5, 0));

    setChildS(out.body, _m0, 0, hipY + lift, lunge - 0.05, lean + flip, 0, (seed - 0.5) * 0.1, 1 - squash * 0.4, 1 - squash, 1);
    setChild(out.head, out.body, 0, HEAD_Y - HIP, 0.04, headX - 0.3 * j, look, (seed - 0.5) * 0.25);
    setChild(out.extra, out.head, 0, 0.12, -0.03, ears, 0, 0);
    setChild(out.armL, out.body, 0, SHOULDER_Y - HIP, 0.1, paws, 0, 0);
    setChildS(out.legL, _m0, 0, hipY + lift, lunge - 0.05, legX - kickD + (d > 0.4 ? -0.6 * (1 - sink) : 0), 0, 0, 1, 1, 1);
  },
};
