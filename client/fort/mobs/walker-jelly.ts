// «Желейный зомби» — прежняя желейка, переосмысленная: глянцевый мармелад с переливом от тёмного низа к светлой
// макушке и бликом, сверху полито вареньем с потёками, повязка набекрень, один глаз сонный под веком, кривая улыбка
// с зубом, руки-варежки вперёд, ножки-капельки. Ходит вразвалку и трясётся, бьёт двумя варежками, гибнет — растекается
// лужей. Вес поменьше: для преемственности, не главный.
import * as THREE from 'three';
import { ZS_ATTACK, ZS_HOP } from '../../../shared/fort.ts';
import { Z_WALKER } from '../../../shared/fortkinds.ts';
import { ARMY, colored, merge, setBoneS, setChild, setChildS, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import { TAU, blob, drip, jolt, lathe, legAt, newLeg, paint, smooth, splat, stepLen, walkAmount } from './set-a-shapes.ts';

const HIP = 0.2;
const LEG = 0.2;
const LOW = new THREE.Color(0x3f8a45);
const HIGH = new THREE.Color(0xa6e07e);
const SHINE = new THREE.Color(0xeaffd8);
const MITT = 0x6fb35a;

/** Профиль мармеладки: широкий низ, круглая макушка (как у желейки игроков, но ниже и пузатее) */
const PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0, 0.16], [0.3, 0.18], [0.42, 0.3], [0.45, 0.5], [0.43, 0.75], [0.38, 0.99], [0.31, 1.19], [0.2, 1.35], [0.09, 1.43], [0, 1.46],
];
/** Глаза выше кольца «в голову» (1,1 м): лицо — верх мармеладки */
const EYE_Y = 1.17;

function bodyGeo(): THREE.BufferGeometry {
  const jelly = paint(new THREE.LatheGeometry(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 12), (x, y, z, c) => {
    c.copy(LOW).lerp(HIGH, Math.min(1, Math.max(0, (y - 0.15) / 1.15)));
    // блик слева сверху спереди
    const d = Math.hypot(x - 0.2, y - 1.0, z - 0.3);
    if (d < 0.2) c.lerp(SHINE, (1 - d / 0.2) * 0.75);
  });
  const parts: THREE.BufferGeometry[] = [
    jelly,
    // варенье на макушке: шапочка с потёками
    lathe([[0.25, 1.28], [0.22, 1.36], [0.15, 1.43], [0.07, 1.47], [0, 1.475]], 10, ARMY.jam),
    drip(0.19, 1.3, 0.17, 0.2, 0.035),
    drip(-0.24, 1.28, 0.08, 0.13, 0.032),
    drip(-0.1, 1.3, -0.23, 0.22, 0.034),
    // повязка набекрень с узелком
    colored(new THREE.TorusGeometry(0.31, 0.038, 3, 14).rotateX(Math.PI / 2 + 0.24).rotateZ(-0.12).translate(0, 1.255, 0), 0xf2ecd8),
    colored(new THREE.BoxGeometry(0.09, 0.13, 0.05).rotateZ(0.6).translate(-0.29, 1.2, 0.13), 0xf2ecd8),
    // сонное веко над правым глазом (глаз под ним светится)
    colored(new THREE.SphereGeometry(0.095, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 0.62).rotateX(0.3).translate(-0.12, EYE_Y, 0.275), 0x4f8f45),
    // рот: тёмная кривая щель, зуб и язык
    colored(new THREE.BoxGeometry(0.22, 0.045, 0.06).rotateZ(-0.14).translate(0.0, 0.97, 0.365), 0x2a1416),
    colored(new THREE.BoxGeometry(0.045, 0.05, 0.03).translate(0.05, 0.955, 0.39), 0xf6f2dc),
    blob(0.04, 0.02, 0.03, 0xd8537a, 5, 3).translate(-0.05, 0.945, 0.385),
    // пятна варенья на боках
    splat(0.4, 0.45, 0.18, 0.075, 0.9, 0, 0.4),
    splat(-0.31, 0.32, 0.31, 0.06, -0.7, -0.2, 0.7, ARMY.jamLight),
  ];
  return merge(parts).translate(0, -HIP, 0);
}

/** Глаза: левый круглый, правый (под веком) поменьше; начало — между глаз (моргают на месте) */
function eyesGeo(): THREE.BufferGeometry {
  return merge([
    colored(new THREE.SphereGeometry(0.095, 8, 6).scale(1, 1.1, 0.5).translate(0.12, 0, 0.0), ARMY.eye),
    colored(new THREE.SphereGeometry(0.077, 8, 6).scale(1, 0.95, 0.5).translate(-0.12, -0.02, -0.005), ARMY.eye),
  ]);
}

/** Рука-варежка вниз от плеча (вперёд её поднимает поворот) */
function armGeo(): THREE.BufferGeometry {
  return merge([
    colored(new THREE.CapsuleGeometry(0.075, 0.38, 2, 6).translate(0, -0.25, 0), MITT),
    blob(0.115, 0.13, 0.1, 0x7cc266, 7, 5).translate(0, -0.55, 0),
    blob(0.05, 0.06, 0.045, 0x7cc266, 5, 3).translate(0.09, -0.5, 0.02),
  ]);
}

/** Ножка-капелька */
function legGeo(): THREE.BufferGeometry {
  return merge([
    colored(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 7, 1, true).translate(0, -0.08, 0), 0x4a9150),
    blob(0.11, 0.075, 0.14, 0x3f8a45, 7, 4).translate(0, -LEG + 0.075, 0.03),
  ]);
}

const _m0 = new THREE.Matrix4();
const legL = newLeg();
const legR = newLeg();

export const WALKER_JELLY: MobDef = {
  id: 'walker-jelly',
  name: 'Желейный зомби',
  kinds: [Z_WALKER],
  weight: 0.6,
  height: 1.48,
  parts: [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'head', geo: eyesGeo(), glow: true },
    { bone: 'armL', geo: armGeo() },
    { bone: 'armR', geo: armGeo() },
    { bone: 'legL', geo: legGeo() },
    { bone: 'legR', geo: legGeo() },
  ],
  pose(a: MobAnim, out: MobPose) {
    const seed = a.seed;
    const s = 0.93 + seed * 0.15;
    const w = walkAmount(a.speed, 0.6);
    const step = stepLen(2, 0.58, s);
    legAt(a.gait * 2, 0.58, step, LEG, 0.06, legL);
    legAt(a.gait * 2 + 0.5, 0.58, step, LEG, 0.06, legR);
    const ph = a.gait * 2 * TAU;
    const stance = legL.down && legR.down ? Math.min(legL.hip, legR.hip) : legL.down ? legL.hip : legR.hip;
    let hipY = HIP + (stance - LEG) * w;
    // вразвалку: крен в сторону опорной ноги и тряска мармелада
    let roll = Math.sin(ph) * (0.1 + 0.04 * ((seed * 5) % 1)) * w;
    let lean = 0.07 * w;
    const wob = Math.sin(a.t * 9 + seed * 20) * 0.02 + Math.sin(ph * 2) * 0.035 * w;
    // руки вперёд, как у прежней желейки (поворот вокруг X со знаком минус поднимает вперёд)
    let armL = -1.35 - Math.sin(ph) * 0.2 * w + Math.sin(a.t * 1.6 + seed * 3) * 0.06;
    let armR = -1.35 + Math.sin(ph) * 0.2 * w + Math.sin(a.t * 1.6 + seed * 3 + 1.3) * 0.06;
    let lx = legL.rx * w;
    let rx = legR.rx * w;
    let lsy = 1 + (legL.sy - 1) * w;
    let rsy = 1 + (legR.sy - 1) * w;
    let squash = wob;

    if (a.st === ZS_ATTACK) {
      // две варежки вверх — хлоп вниз — обратно
      const k = a.stT;
      const up = k < 0.16 ? smooth(k / 0.16) : k < 0.26 ? 1 - smooth((k - 0.16) / 0.1) : 0;
      const hit = k < 0.16 ? 0 : k < 0.26 ? smooth((k - 0.16) / 0.1) : 1 - smooth((k - 0.26) / 0.25);
      armL = armR = -1.35 - 1.25 * up + 0.65 * hit;
      lean = 0.05 - 0.15 * up + 0.32 * hit;
      squash = 0.08 * up - 0.12 * hit;
      roll *= 0.3;
    } else if (a.st === ZS_HOP) {
      armL = armR = -2.7;
      lx = rx = -0.5;
      lsy = rsy = 0.8;
      hipY = HIP;
      squash = 0.1;
    }
    const j = jolt(a.hit);
    lean -= 0.25 * j;
    squash -= 0.16 * j;

    // гибель: шлёп — растекается лужей и впитывается
    const d = a.die;
    const melt = smooth(d / 0.45);
    const sink = smooth((d - 0.6) / 0.4);
    const sy = s * Math.max(0.05, (1 + squash - 0.86 * melt) * (1 - 0.6 * sink));
    const sxz = s * (1 - squash * 0.5 + 0.75 * melt) * (1 - 0.3 * sink);
    setBoneS(_m0, 0, -0.03 * sink, 0, 0, 0, 0, sxz, sy, sxz);

    setChildS(out.body, _m0, 0, hipY, 0, lean, Math.sin(a.t * 0.5 + seed * 8) * 0.1 * (1 - w), roll + (seed - 0.5) * 0.1, 1, 1, 1);
    // сонный глаз моргает реже, но дольше
    const blink = (a.t + seed * 5) % 4.1 < 0.16 ? 0.15 : 1;
    setChildS(out.head, out.body, 0, EYE_Y - HIP, 0.3, 0, 0, 0, 1, blink, 1);
    setChild(out.armL, out.body, 0.41, 0.84 - HIP, 0.05, armL, 0, 0.12 - melt * 0.8);
    setChild(out.armR, out.body, -0.41, 0.84 - HIP, 0.05, armR, 0, -0.12 + melt * 0.8);
    const base = setBoneS(out.extra, 0, -0.03 * sink, 0, 0, 0, 0, s * (1 + 0.5 * melt), s * Math.max(0.05, 1 - 0.85 * melt), s * (1 + 0.5 * melt));
    setChildS(out.legL, base, 0.17, hipY, 0, lx, 0, 0, 1, lsy, 1);
    setChildS(out.legR, base, -0.17, hipY, 0, rx, 0, 0, 1, rsy, 1);
  },
};
