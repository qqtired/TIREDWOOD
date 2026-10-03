// Улитка-плевун (Z_SPITTER, набор C). Раковина-башенка на спине — мортирка: в плевке (ZS_SPIT) она поворачивается
// дулом к цели, набухает и дрожит, из дула показывается комок варенья — выстрел (на 0,8 с, как бросок сервера) с отдачей.
// Ходит волной подошвы, глаза на стебельках пружинят и втягиваются от удара. Гибель — прячется в раковину, та падает
// набок и уходит в землю. Части: подошва с шеей, голова, стебельки, светящиеся глаза, раковина, комок варенья.
import * as THREE from 'three';
import { ZS_ATTACK, ZS_SPIT } from '../../../shared/fort.ts';
import { Z_SPITTER } from '../../../shared/fortkinds.ts';
import { merge, setBone, setBoneS, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import {
  JAM, JAM_DARK, JAM_LIGHT, attach, attachS, blink, drop, ellipsoid, eyeBalls, finish, lathe, limb, mix, paint, paintFaces,
  pupils, rnd, smooth, splat, spotted, spring,
} from './c-kit.ts';

interface Look {
  id: string;
  name: string;
  weight: number;
  skin: number;
  skinDark: number;
  sole: number;
  shellA: number;
  shellB: number;
  cheek: number;
}

const LOOKS: Look[] = [
  { id: 'spitter-snail', name: 'Улитка-плевун', weight: 2, skin: 0x8bcf5c, skinDark: 0x5d9a3c, sole: 0xd9ec8e, shellA: 0xe7a64c, shellB: 0x8c4f2b, cheek: 0xf4a2a0 },
  { id: 'spitter-snail-berry', name: 'Улитка-плевун (малиновая)', weight: 1, skin: 0xb3d256, skinDark: 0x7f9a35, sole: 0xeef2a6, shellA: 0xe85a7e, shellB: 0xfbe6c8, cheek: 0xff9a8a },
  { id: 'spitter-snail-sunny', name: 'Улитка-плевун (солнечная)', weight: 1, skin: 0x74c48a, skinDark: 0x4b8f62, sole: 0xcdeeb0, shellA: 0xf6cf4f, shellB: 0xd9662c, cheek: 0xf6a39a },
];

/** Где что в покое (м, модель смотрит по +Z) */
const NECK = new THREE.Vector3(0, 1.02, 0.31);
const STALK_Y = 0.4;
const SHELL_Y = 0.3;
const SHELL_Z = -0.13;
const SHELL_REST = -0.28;
const SHELL_AIM = 0.08;
const MUZZLE_Y = 0.8;
/** Плевок: выстрел на этой секунде состояния (72 тика замаха − 24 тика полёта) */
const FIRE_AT = 0.8;
const ATTACK_PERIOD = 0.5;

function footGeo(l: Look): THREE.BufferGeometry {
  const g = ellipsoid(0.3, 0.17, 0.62, 11, 8);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    // хвостик подошвы сзади сужается, низ плоский
    const k = 1 - 0.55 * smooth(-0.1, -0.62, z);
    p.setXYZ(i, p.getX(i) * k, (p.getY(i) + 0.17) * (0.55 + 0.45 * k) - 0.17, z);
  }
  g.computeVertexNormals();
  g.translate(0, 0.16, 0.02);
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.012) p.setY(i, 0.012);
  const spots = [[0.26, 0.2, -0.2, 0.14], [-0.27, 0.17, 0.16, 0.13], [0.05, 0.28, -0.45, 0.1], [0.1, 0.3, 0.5, 0.09]] as const;
  return paint(g, spotted((x, y) => (y < 0.07 ? l.sole : mix(l.skin, l.skinDark, smooth(0.15, 0.32, y) * 0.6)), spots, JAM));
}

function neckGeo(l: Look): THREE.BufferGeometry {
  const g = lathe([[0, 0.1], [0.28, 0.1], [0.26, 0.35], [0.215, 0.65], [0.185, 0.92], [0.16, 1.06], [0.06, 1.12], [0, 1.12]], 10);
  g.rotateX(0.07).translate(0, 0, 0.29);
  // живот (перед шеи) светлее; шлепки варенья — объёмные
  const neck = paint(g, (x, y, z) => mix(mix(l.skin, l.sole, smooth(0.36, 0.5, z) * 0.55), l.skinDark, smooth(0.3, 0.1, z) * 0.35));
  return merge([neck, splat([0.14, 0.72, 0.47], [0.55, 0.1, 0.8], 0.1), splat([-0.21, 0.45, 0.41], [-0.8, 0, 0.55], 0.11)]);
}

function headGeo(l: Look): THREE.BufferGeometry {
  const head = paint(ellipsoid(0.275, 0.25, 0.26, 11, 8).translate(0, 0.24, 0.05),
    spotted((x, y, z) => mix(l.skin, l.sole, smooth(0.12, 0.3, z) * smooth(0.3, 0.12, y) * 0.65), [[-0.2, 0.36, -0.04, 0.1]]));
  // улыбка до ушей (нижняя половина бублика), надутые щёки плевальщика, капля варенья с губы
  const mouth = paint(new THREE.TorusGeometry(0.115, 0.03, 4, 6, Math.PI).rotateZ(Math.PI).rotateX(-0.25).translate(0, 0.19, 0.29), JAM_DARK);
  const cheeks = [-1, 1].map((s) => paint(ellipsoid(0.095, 0.08, 0.07, 6, 5).translate(s * 0.17, 0.16, 0.24), l.cheek));
  const drool = drop(0.038, 0.1, 0.07, 0.29, JAM);
  return merge([head, mouth, ...cheeks, drool, splat([0.13, 0.43, 0.21], [0.4, 0.75, 0.5], 0.085)]);
}

const EYES: Array<readonly [number, number, number]> = [[-0.16, 0.18, 0.06], [0.16, 0.18, 0.06]];

function stalkGeo(l: Look): THREE.BufferGeometry {
  const stalks = [-1, 1].map((s) => paint(limb([s * 0.06, -0.06, 0], [s * 0.155, 0.16, 0.055], 0.05, 0.034, 6, false), l.skin));
  return merge([...stalks, ...pupils(EYES.map(([x, y, z]) => [x * 1.02, y + 0.006, z + 0.058] as const), 0.034)]);
}

/** Раковина-башенка: три яруса (цвета через один), сверху дуло мортирки в варенье */
function shellGeo(l: Look): THREE.BufferGeometry {
  const g = lathe([
    [0, 0], [0.26, -0.01], [0.4, 0.05], [0.42, 0.15], [0.37, 0.25], [0.35, 0.29], [0.325, 0.39], [0.26, 0.47], [0.245, 0.5],
    [0.21, 0.6], [0.155, 0.66], [0.15, 0.76], [0.175, 0.82], [0.13, 0.86], [0.085, 0.8], [0, 0.79],
  ], 11);
  // ярусы по точкам профиля (без зубцов): 1-й — A, шов, 2-й — B, шов, 3-й — A; дуло мортирки — латунь, губа в варенье
  const shell = paintFaces(g, (x, y, z) => {
    const r = Math.hypot(x, z);
    if (y > 0.74 && r < 0.115) return 0x2a1030;
    const a = Math.atan2(x, z);
    const drip = Math.max(0, Math.cos(a * 3 + 1)) ** 4 * 0.14;
    if (y > 0.76 - drip) return y > 0.81 ? JAM_LIGHT : JAM;
    if (y > 0.6) return y > 0.66 ? 0xe2b84e : 0xb88a2c;
    if (y < 0.03) return mix(l.shellA, 0x000000, 0.2);
    if (y < 0.25) return l.shellA;
    if (y < 0.29 || (y > 0.47 && y < 0.5)) return mix(l.shellB, 0x000000, 0.35);
    if (y < 0.47) return l.shellB;
    return l.shellA;
  });
  return merge([shell, splat([0.31, 0.36, -0.13], [0.9, 0.25, -0.35], 0.11)]);
}

function globGeo(): THREE.BufferGeometry {
  return paint(ellipsoid(0.14, 0.14, 0.14, 7, 5), (x, y, z) => (y > 0.06 && z > -0.02 ? JAM_LIGHT : JAM));
}

const _shell = new THREE.Matrix4();
const _aim = new THREE.Matrix4();

function build(l: Look): MobDef {
  const def: MobDef = {
    id: l.id,
    name: l.name,
    kinds: [Z_SPITTER],
    weight: l.weight,
    height: 1.62,
    parts: [
      { bone: 'body', geo: merge([footGeo(l), neckGeo(l)]) },
      { bone: 'head', geo: headGeo(l) },
      { bone: 'extra', geo: stalkGeo(l) },
      { bone: 'extra', geo: merge(eyeBalls(EYES, 0.068)), glow: true },
      { bone: 'prop', geo: shellGeo(l) },
      { bone: 'tail', geo: globGeo() },
    ],
    pose: (a, out) => poseSnail(a, out),
  };
  return def;
}

const BONES_USED = ['body', 'head', 'extra', 'prop', 'tail'] as const;

function poseSnail(a: MobAnim, out: MobPose): void {
  const sd = a.seed;
  const t = a.t;
  const w = smooth(0.1, 0.9, a.speed);
  const scale = 0.92 + 0.16 * rnd(sd, 1);
  const tilt = (rnd(sd, 2) - 0.5) * 0.26;
  const hit = a.hit * a.hit * (3 - 2 * a.hit);
  const breathe = Math.sin(t * 2.1 + sd * 6.3);
  // волна подошвы — два толчка на цикл шага
  const g2 = a.gait * Math.PI * 4;
  const pulse = Math.sin(g2) * w;
  const sway = Math.sin(a.gait * Math.PI * 2) * w;

  let bodyRx = 0.05 * w;
  let bodySy = 1 + 0.02 * breathe - 0.05 * pulse - 0.12 * hit;
  let bodySz = 1 + 0.08 * pulse + 0.05 * hit;
  let headRx = -0.06 + 0.04 * Math.sin(g2 - 0.6) * w - 0.28 * hit;
  let headZ = 0;
  let shellRx = SHELL_REST + 0.07 * Math.sin(g2 - 0.9) * w + 0.015 * breathe - 0.18 * hit;
  let shellS = 1 + 0.015 * breathe;
  let shellY = 0;
  let stalkRx = 0.08 * Math.sin(t * 1.7 + sd * 5) + 0.05 * Math.sin(g2 - 1.6) * w;
  let stalkRz = 0.1 * Math.sin(t * 1.1 + sd * 9);
  let stalkSy = 1 - 0.6 * hit - 0.5 * blink(t, sd);
  let globS = 0.001;
  let globUp = 0;
  let globFree = false;

  if (a.st === ZS_SPIT) {
    const u = a.stT;
    const aim = smooth(0, 0.35, u) * (1 - smooth(0.95, 1.25, u));
    const fired = u >= FIRE_AT;
    const recoil = fired ? Math.exp(-(u - FIRE_AT) * 9) : 0;
    const tremble = fired ? 0 : 0.03 * smooth(0.35, FIRE_AT, u) * Math.sin(u * 60);
    const swell = fired ? -0.1 * recoil + 0.06 * spring(u - FIRE_AT, 22, 7) : 0.28 * smooth(0.12, FIRE_AT, u);
    shellRx = shellRx + (SHELL_AIM - SHELL_REST) * aim - 0.55 * recoil + 0.1 * spring(u - FIRE_AT, 18, 6);
    shellS = 1 + swell + tremble;
    // мортирка поднимается над головой, голова пригибается вперёд-вниз — линия огня свободна
    shellY = 0.14 * aim - 0.06 * recoil;
    bodySy -= 0.07 * aim + 0.1 * recoil;
    bodySz += 0.04 * aim;
    bodyRx += 0.12 * aim - 0.16 * recoil;
    headRx += 0.5 * aim - 0.45 * recoil;
    headZ = 0.08 * aim;
    stalkRx += 0.35 * aim - 0.5 * spring(u - FIRE_AT, 20, 5);
    stalkSy = 1 - 0.25 * aim - 0.3 * recoil;
    if (!fired) {
      globS = smooth(0.2, FIRE_AT, u);
      globUp = -0.08 + 0.15 * globS;
    } else if (u < FIRE_AT + 0.16) {
      // комок летит по линии прицела, раковину откатывает отдачей отдельно
      const f = (u - FIRE_AT) / 0.16;
      globS = 1 - f * f;
      globUp = 0.07 + f * 1.4;
      globFree = true;
    }
  } else if (a.st === ZS_ATTACK) {
    // боднуть: откинуться назад и клюнуть головой вперёд, раковина подпрыгивает
    const q = (a.stT % ATTACK_PERIOD) / ATTACK_PERIOD;
    const back = smooth(0, 0.45, q) * (1 - smooth(0.45, 0.6, q));
    const strike = smooth(0.45, 0.6, q) * (1 - smooth(0.7, 1, q));
    bodyRx += -0.16 * back + 0.3 * strike;
    headRx += -0.25 * back + 0.45 * strike;
    headZ = 0.08 * strike;
    shellRx += -0.2 * back + 0.25 * strike;
    bodySy -= 0.06 * strike;
    stalkRx += -0.3 * back + 0.4 * strike;
  }

  // гибель: прячется в раковину, раковина падает набок, подпрыгивает и уходит в землю
  const d = a.die;
  const hide = smooth(0, 0.35, d);
  const fall = smooth(0.22, 0.55, d);
  const sink = smooth(0.55, 1, d);
  const bodyS = 1 - 0.88 * hide;

  setBoneS(out.body, 0, 0, -0.12 * hide, bodyRx, 0, 0.03 * sway, (1 + 0.03 * pulse) * bodyS, bodySy * bodyS, bodySz * bodyS);
  attach(out.head, out.body, NECK.x, NECK.y, NECK.z + headZ, headRx, 0.08 * sway, tilt + 0.07 * sway);
  attachS(out.extra, out.head, 0, STALK_Y, 0.03, stalkRx, 0, stalkRz - 0.5 * tilt, 1, Math.max(0.2, stalkSy), 1);

  const bounce = Math.abs(Math.sin(fall * Math.PI * 2)) * (1 - fall) * 0.25;
  setBone(_shell, 0, SHELL_Y + shellY + 0.1 * fall + bounce, SHELL_Z + 0.1 * fall, shellRx * (1 - fall), 0, 1.5 * fall, shellS);
  out.prop.copy(_shell);
  if (globFree) setBone(_aim, 0, SHELL_Y + 0.14, SHELL_Z, SHELL_AIM, 0, 0, 1.28);
  attach(out.tail, globFree ? _aim : out.prop, 0, MUZZLE_Y + globUp, 0, 0, 0, 0, Math.max(0.001, globS * (1 - hide)));

  finish(out, BONES_USED, scale * (1 - 0.45 * sink), -0.8 * sink);
}

export const SPITTER_SNAILS: MobDef[] = LOOKS.map(build);
