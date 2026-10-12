// Леший (Z_LESHY) — босс 42, 84, 126 … Ходячее дерево: кряжистый ствол в коре с витыми бороздами, глаза-дупла светятся
// сиреневым, нос-сучок, моховая борода и брови, на макушке — ветвистые рога с листвой и ягодами варенья, на плече —
// мухомор; руки-ветви с пальцами-прутиками (обе — одной частью), внизу — юбка корней, по ней и шагает. Варенье —
// пятнами по коре и потёками с макушки.
// Атаки (полное предупреждение — позой): корни (ZS_LS_ROOTS) — руки медленно поднимаются над головой, ствол
// откидывается, корни растопырены и дрожат; удар — руки вниз, в землю, ствол вперёд; целебная роща (ZS_LS_HEAL) —
// руки к небу, качается, крона дышит; прятки — уходит под землю винтом (ZS_LS_SINK), под землёй (ZS_LS_UNDER) ползёт
// холм корней, из него торчат кончики рогов (корень модели — на LS_UNDER_Y, холм — на поверхности), вылезает с
// подскоком (ZS_LS_RISE). Открыт (ZS_BOSS_OPEN) — обмяк, руки висят, глаза полузакрыты, на груди в дупле горит голубой
// сучок. Ярость — по коре красные трещины-угольки, глаза красные. Гибель — падает вперёд, как срубленное дерево, пень
// остаётся; подскок от удара о землю, потом всё уходит в землю.
import * as THREE from 'three';
import { TICK_RATE } from '../../../shared/constants.ts';
import {
  BOSS_WARN_TICKS, ZS_BOSS_OPEN, ZS_LS_HEAL, ZS_LS_RISE, ZS_LS_ROOTS, ZS_LS_SINK, ZS_LS_UNDER,
} from '../../../shared/fort.ts';
import { LS_RISE_TICKS, LS_SINK_TICKS, LS_UNDER_Y } from '../../../shared/fortbosses.ts';
import { Z_LESHY } from '../../../shared/fortkinds.ts';
import { ARMY, colored, merge, setChildS, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import {
  TAU, backOut, blob, clamp01, hide, jamDrip, jamSpot, jolt, lathe, mix, paint, ramp, ribbon, setPivot, tube, walkAmount,
} from './set-f-shapes.ts';

const BARK = 0x6f5a3c;
const BARK_LIGHT = 0x93795a;
const BARK_DARK = 0x4a3a26;
const ROOT = 0x5c4630;
const MOSS = 0x6e9b43;
const MOSS_LIGHT = 0x9cc463;
const MOSS_DARK = 0x4f7a30;
const LEAF = 0x5c9e3c;
const LEAF_LIGHT = 0x8fcc5c;
const CAP = 0xd8373a;
const STALK = 0xf3ead8;
const HOLLOW = 0x2a1c12;
const CORE = 0x63ecf7;
const EMBER = 0xff4a1c;

/** Ствол: профиль [радиус, высота] снизу вверх (плечи на SHOULDER_Y), борозды коры витые */
const TRUNK: ReadonlyArray<readonly [number, number]> = [
  [1.2, 0.8], [1.1, 1.5], [1.0, 2.4], [1.0, 3.2], [1.07, 3.9], [1.05, 4.5], [0.95, 5.0], [0.7, 5.45], [0.38, 5.72], [0.001, 5.8],
];
const SHOULDER_Y = 4.05;
const SHOULDER_X = 0.95;
const EYE_Y = 4.55;
const EYE_X = 0.37;
const KNOT_Y = 3.2;
/** Крона над макушкой — высота кончиков рогов (сколько торчит из земли, когда ползёт под ней) */
const CROWN_TOP = 7.1;
const WARN_S = BOSS_WARN_TICKS / TICK_RATE;
const SINK_S = LS_SINK_TICKS / TICK_RATE;
const RISE_S = LS_RISE_TICKS / TICK_RATE;
/** Под землёй корень модели на LS_UNDER_Y: холм — на столько выше корня */
const UNDER_UP = -LS_UNDER_Y;

function trunkR(y: number): number {
  for (let i = 0; i + 1 < TRUNK.length; i++) {
    const [r0, y0] = TRUNK[i];
    const [r1, y1] = TRUNK[i + 1];
    if (y <= y1) return r0 + ((r1 - r0) * Math.max(0, y - y0)) / (y1 - y0);
  }
  return 0;
}

/** Борозда коры: витая, по углу и высоте (−1 … 1) */
function groove(theta: number, y: number): number {
  return Math.sin(theta * 7 + y * 1.4);
}

/** Точка на коре: x — по дуге спереди (м), y — высота, наружу на off */
function onTrunk(off: number): (x: number, y: number, out: THREE.Vector3) => void {
  return (x, y, out) => {
    const r = trunkR(y) * 1.06 + off;
    const th = x / r;
    out.set(r * Math.sin(th), y, r * Math.cos(th));
  };
}

const cBark = new THREE.Color(BARK);
const cBarkLight = new THREE.Color(BARK_LIGHT);
const cBarkDark = new THREE.Color(BARK_DARK);

function bodyGeo(): THREE.BufferGeometry {
  const trunk = paint(lathe(TRUNK, 18, (p) => {
    const g = groove(Math.atan2(p.x, p.z), p.y);
    const k = 1 + 0.06 * g;
    p.x *= k;
    p.z *= k;
  }), (p, _n, o) => {
    const g = groove(Math.atan2(p.x, p.z), p.y);
    o.copy(cBark).lerp(g > 0 ? cBarkLight : cBarkDark, Math.abs(g) * 0.6);
  });
  const parts: THREE.BufferGeometry[] = [trunk];
  const at = onTrunk(0.02);
  const v = new THREE.Vector3();
  // глаза-дупла (тёмные кольца; сами глаза светятся отдельной частью), брови из мха, нос-сучок, рот-щель
  for (const s of [-1, 1]) {
    at(s * EYE_X, EYE_Y, v);
    parts.push(colored(new THREE.TorusGeometry(0.22, 0.075, 5, 10).translate(v.x, v.y, v.z - 0.02), BARK_DARK));
    parts.push(colored(new THREE.CircleGeometry(0.2, 10).translate(v.x, v.y, v.z - 0.04), HOLLOW));
    parts.push(colored(blob(0.32, 0.1, 0.12, 7, 4).rotateZ(-s * 0.3).translate(v.x + s * 0.03, v.y + 0.31, v.z + 0.02), MOSS_DARK));
  }
  at(0, 4.25, v);
  parts.push(colored(new THREE.ConeGeometry(0.17, 0.95, 6).rotateX(Math.PI / 2 + 0.45).translate(v.x, v.y - 0.14, v.z + 0.38), BARK_LIGHT));
  at(0, 3.88, v);
  parts.push(colored(blob(0.36, 0.07, 0.05, 8, 4).translate(v.x, v.y, v.z + 0.01), HOLLOW));
  // моховая борода: пряди от подбородка вниз, внахлёст
  for (let i = 0; i < 7; i++) {
    const x = -0.6 + (1.2 * i) / 6;
    const len = 0.85 + 0.4 * Math.sin(i * 2.1 + 0.4) - 0.25 * Math.abs(x);
    at(x, 3.72 - len * 0.5, v);
    const hex = i % 3 === 0 ? MOSS_LIGHT : i % 3 === 1 ? MOSS : MOSS_DARK;
    parts.push(colored(blob(0.2, len * 0.55, 0.13, 6, 5).rotateZ(x * 0.35).translate(v.x, v.y, v.z + 0.05), hex));
  }
  // дупло на груди: тёмное кольцо (сучок светится в окне отдельной частью)
  at(0, KNOT_Y, v);
  parts.push(colored(new THREE.TorusGeometry(0.42, 0.1, 5, 12).translate(v.x, v.y, v.z - 0.02), BARK_DARK));
  parts.push(colored(new THREE.CircleGeometry(0.39, 12).translate(v.x, v.y, v.z - 0.05), HOLLOW));
  // рога-ветви: главные ветви и отростки, на концах — листва и ягоды варенья
  const leaves: Array<[number, number, number, number]> = [];
  for (const s of [-1, 1]) {
    const main: Array<[number, number, number]> = [[s * 0.25, 5.45, 0], [s * 0.55, 5.95, 0.05], [s * 0.95, 6.35, 0.1], [s * 1.35, 6.6, 0.05]];
    parts.push(colored(tube(main, (u) => 0.16 - 0.1 * u, 6, 5, true), BARK));
    parts.push(colored(tube([[s * 0.6, 6.0, 0.05], [s * 0.55, 6.45, 0.2], [s * 0.42, 6.75, 0.25]], (u) => 0.08 - 0.04 * u, 4, 4, true), BARK));
    parts.push(colored(tube([[s * 1.0, 6.38, 0.1], [s * 1.3, 6.45, 0.45], [s * 1.45, 6.4, 0.7]], (u) => 0.07 - 0.04 * u, 4, 4, true), BARK));
    leaves.push([s * 1.38, 6.62, 0.05, 0.55], [s * 0.42, 6.8, 0.25, 0.42], [s * 1.45, 6.42, 0.7, 0.4]);
  }
  leaves.push([0, 5.9, -0.25, 0.5]);
  for (const [x, y, z, r] of leaves) {
    parts.push(paint(blob(r, r * 0.75, r, 7, 5).translate(x, y, z), (p, _n, o) => o.setHex(p.y > y + r * 0.2 ? LEAF_LIGHT : LEAF)));
  }
  for (const [x, y, z] of [[1.2, 6.45, 0.35], [-1.25, 6.4, 0.3], [0.5, 6.55, 0.38], [-0.45, 6.62, 0.4], [0.15, 6.0, 0.15]] as const) {
    parts.push(colored(new THREE.SphereGeometry(0.1, 6, 4).translate(x, y, z), ARMY.jam));
  }
  // мухомор растёт сбоку головы, торчит вбок-вверх
  const shroom: THREE.BufferGeometry[] = [
    colored(new THREE.CylinderGeometry(0.11, 0.14, 0.5, 7).translate(0, 0.2, 0), STALK),
    paint(new THREE.SphereGeometry(0.44, 10, 5, 0, TAU, 0, Math.PI / 2).scale(1, 0.72, 1), (p, _n, o) => o.setHex(p.y < 0.03 ? STALK : CAP)).translate(0, 0.42, 0),
  ];
  for (const [x, z] of [[0.17, 0.22], [-0.24, 0.12], [0.06, -0.26], [0.27, -0.08], [-0.12, -0.3]] as const) {
    const y = 0.72 * Math.sqrt(Math.max(0, 0.44 * 0.44 - x * x - z * z));
    shroom.push(colored(blob(0.06, 0.025, 0.06, 5, 3).translate(x, 0.42 + y, z), STALK));
  }
  const sr = trunkR(4.9) * 1.06 - 0.06;
  parts.push(merge(shroom).rotateZ(-0.75).translate(sr * Math.sin(1.1), 4.9, sr * Math.cos(1.1)));
  // варенье: пятна по коре и потёки с макушки
  for (const [x, y, r] of [[-0.55, 2.1, 0.22], [0.6, 1.35, 0.2], [0.35, 2.75, 0.16], [-0.3, 1.05, 0.18]] as const) {
    at(x, y, v);
    parts.push(jamSpot(v.x, v.y, v.z, r, v.x, 0, v.z, ARMY.jam));
  }
  for (const [th, len] of [[0.5, 0.7], [-0.9, 0.5], [2.4, 0.8]] as const) {
    const pts: Array<[number, number, number]> = [];
    for (let k = 0; k <= 3; k++) {
      const y = 5.3 - (len * k) / 3;
      const r = trunkR(y) * 1.05 + 0.02;
      pts.push([r * Math.sin(th), y, r * Math.cos(th)]);
    }
    parts.push(jamDrip(pts, 0.07));
  }
  return merge(parts);
}

/** Руки-ветви (обе одной частью) в осях кости: начало — середина плеч; пальцы-прутики, листики */
function armsGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const pts: Array<[number, number, number]> = [[s * SHOULDER_X, 0, 0], [s * 1.4, -0.25, 0.1], [s * 1.75, -0.95, 0.25], [s * 1.8, -1.75, 0.4], [s * 1.7, -2.2, 0.5]];
    parts.push(paint(tube(pts, (u) => 0.3 - 0.15 * u, 8, 6, true, true), (p, _n, o) => {
      o.copy(cBark).lerp(cBarkDark, 0.3 + 0.3 * Math.sin(p.y * 9 + p.x * 3));
    }));
    for (const [dx, dz, dy] of [[-0.3, 0.3, -0.6], [0.05, 0.45, -0.68], [0.35, 0.25, -0.55]] as const) {
      parts.push(colored(tube([[s * 1.7, -2.2, 0.5], [s * (1.7 + dx * 0.6), -2.2 + dy * 0.6, 0.5 + dz * 0.6], [s * (1.7 + dx), -2.2 + dy, 0.5 + dz]], (u) => 0.08 - 0.045 * u, 3, 4, true), BARK_LIGHT));
    }
    parts.push(paint(blob(0.3, 0.06, 0.2, 7, 4).rotateZ(s * 0.6).translate(s * 1.5, -0.35, 0.32), (_p, _n, o) => o.setHex(LEAF)));
    parts.push(paint(blob(0.25, 0.06, 0.16, 7, 4).rotateZ(-s * 0.3).translate(s * 1.9, -1.3, 0.45), (_p, _n, o) => o.setHex(LEAF_LIGHT)));
  }
  return merge(parts);
}

/** Юбка корней: клубень у земли и восемь корней в стороны (по ним шагает; под землёй — холм) */
function rootsGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    paint(lathe([[0.001, 0.0], [1.3, 0.08], [1.33, 0.45], [1.2, 0.95], [0.001, 1.05]], 14), (p, _n, o) => {
      o.setHex(ROOT).lerp(new THREE.Color(MOSS_DARK), p.y < 0.25 ? 0.35 : 0);
    }),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    const len = 2.05 + 0.35 * Math.sin(i * 1.9);
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    parts.push(paint(tube([[dx * 0.95, 0.6, dz * 0.95], [dx * 1.45, 0.45, dz * 1.45], [dx * (len - 0.2), 0.12, dz * (len - 0.2)], [dx * len + dz * 0.15, 0.04, dz * len - dx * 0.15]],
      (u) => 0.26 - 0.19 * u, 6, 5, true), (p, _n, o) => o.setHex(ROOT).lerp(new THREE.Color(BARK_DARK), 0.4 * Math.abs(Math.sin(p.x * 5 + p.z * 4)))));
  }
  parts.push(paint(blob(0.4, 0.14, 0.34, 7, 4).translate(-1.0, 0.55, 0.65), (_p, _n, o) => o.setHex(MOSS)));
  return merge(parts);
}

function eyesGeo(hex: number, k: number, fwd: number): THREE.BufferGeometry {
  const at = onTrunk(0.02);
  const v = new THREE.Vector3();
  const list: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    at(s * EYE_X, EYE_Y, v);
    list.push(colored(blob(0.16 * k, 0.17 * k, 0.08, 9, 6).translate(v.x, v.y, v.z + fwd), hex));
  }
  return merge(list);
}

/** Ярость: красные трещины-угольки по коре и красные глаза поверх сиреневых */
function rageGeo(): THREE.BufferGeometry {
  const map = onTrunk(0.075);
  const cracks: Array<Array<[number, number]>> = [
    [[-0.35, 1.0], [-0.2, 1.45], [-0.42, 1.9], [-0.25, 2.4], [-0.38, 2.85]],
    [[0.42, 1.3], [0.55, 1.8], [0.38, 2.2], [0.5, 2.65]],
    [[0.15, 3.55], [0.28, 3.4], [0.2, 3.0], [0.35, 2.75]],
  ];
  const list: THREE.BufferGeometry[] = cracks.map((c) => colored(ribbon(c, 0.06, map), EMBER));
  // трещины и сбоку, и сзади: тот же узор, повёрнутый вокруг ствола
  const side = merge(cracks.slice(0, 2).map((c) => colored(ribbon(c, 0.06, map), EMBER)));
  list.push(side.clone().rotateY(Math.PI * 0.6), side.clone().rotateY(-Math.PI * 0.6), side.rotateY(Math.PI));
  list.push(eyesGeo(EMBER, 1.15, 0.03));
  return merge(list);
}

const ID = new THREE.Matrix4();

/** Голубой сучок (окно) в дупле на груди */
function knotGeo(): THREE.BufferGeometry {
  const g = colored(blob(0.34, 0.37, 0.14, 10, 7).translate(0, KNOT_Y, trunkR(KNOT_Y) * 1.06 - 0.02), CORE);
  g.deleteAttribute('uv');
  return g;
}

export const BOSS_LESHY: MobDef = {
  id: 'boss-leshy',
  name: 'Леший',
  kinds: [Z_LESHY],
  height: 6.8,
  parts: [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'armL', geo: armsGeo() },
    { bone: 'legL', geo: rootsGeo() },
    { bone: 'head', geo: eyesGeo(ARMY.eye, 1, 0), glow: true },
    // окно: голубой сучок в дупле на груди
    { bone: 'extra', geo: knotGeo(), glow: true },
    { bone: 'wingL', geo: rageGeo(), glow: true },
  ],
  pose(a: MobAnim, out: MobPose) {
    const t = a.t;
    const s = a.stT;
    const w = walkAmount(a.speed, 0.7);
    const p = a.gait - Math.floor(a.gait);
    // тяжёлая поступь: ствол качается с боку на бок, приседает на каждый шаг, корни перебирают
    let y = -0.08 * Math.abs(Math.sin(TAU * p)) * w;
    let rx = 0.06 * w;
    let ry = 0.05 * Math.sin(TAU * p) * w;
    let rz = 0.055 * Math.sin(TAU * p) * w + 0.025 * Math.sin(t * 0.9 + a.seed * 5) * (1 - w);
    let armRx = 0.14 * Math.sin(TAU * p) * w + 0.04 * Math.sin(t * 1.3);
    let armRz = 0.05 * Math.sin(t * 1.1 + 1);
    let armRy = 0;
    let armSx = 1;
    let rootRy = 0.12 * Math.sin(TAU * p) * w;
    let rootSy = 1 - 0.06 * Math.abs(Math.cos(TAU * p)) * w;
    let rootSxz = 1;
    let rootY = 0;
    let eyeSy = (t + a.seed * 5) % 4.6 < 0.14 ? 0.2 : 1;
    let open = false;
    let under = false;
    let scale = 1;

    switch (a.st) {
      case ZS_LS_ROOTS: {
        // корни: руки медленно над головой, ствол откинут, корни растопырены и дрожат; удар — руки в землю
        const lift = ramp(0, 1.1, s) * (1 - ramp(WARN_S - 0.16, WARN_S - 0.06, s));
        const slam = ramp(WARN_S - 0.16, WARN_S - 0.04, s) * (1 - ramp(WARN_S + 0.15, WARN_S + 0.6, s));
        const shake = Math.sin(t * 29) * 0.02 * lift;
        armRx = -2.5 * lift + 0.55 * slam + shake * 3;
        rx = -0.14 * lift + 0.26 * slam;
        rz = shake;
        rootSxz = 1 + 0.16 * lift - 0.05 * slam;
        rootSy = 1 - 0.14 * lift;
        rootRy = Math.sin(t * 23) * 0.04 * lift;
        y = -0.12 * slam;
        break;
      }
      case ZS_LS_HEAL: {
        // целебная роща: руки вперёд и в стороны, ладонями к роще, медленно качается, крона дышит
        const up = ramp(0, 0.6, s);
        armRx = -1.45 * up + 0.12 * Math.sin(t * 2.2) * up;
        armSx = 1 + 0.4 * up;
        armRz = 0.1 * Math.sin(t * 1.6) * up;
        ry = 0.16 * Math.sin(t * 1.4) * up;
        rz = 0.05 * Math.sin(t * 2.2 + 1) * up;
        scale = 1 + 0.02 * Math.sin(t * 3) * up;
        break;
      }
      case ZS_LS_SINK: {
        // уходит под землю винтом
        const u = clamp01(s / SINK_S);
        y = -6.2 * u * u;
        ry = 2.2 * u * u;
        armRx = -0.6 * u;
        rootSy = 1 - 0.5 * u;
        rootSxz = 1 + 0.25 * u;
        rootY = -0.3 * u;
        break;
      }
      case ZS_LS_UNDER: {
        // под землёй: холм корней ползёт по поверхности, из него торчат кончики рогов
        under = true;
        y = UNDER_UP - CROWN_TOP + 0.7 + 0.06 * Math.sin(t * 9);
        ry = t * 1.3;
        rootY = UNDER_UP - 0.12;
        rootSy = 0.55 + 0.06 * Math.sin(t * 7);
        rootSxz = 1.15;
        rootRy = t * 0.8;
        break;
      }
      case ZS_LS_RISE: {
        // вылезает с подскоком
        const u = backOut(s / RISE_S);
        y = -5.5 * (1 - u);
        ry = 1.2 * (1 - clamp01(s / RISE_S));
        armRx = -1.2 * (1 - u) - 0.4 * Math.sin(Math.PI * clamp01(s / RISE_S));
        rootSxz = 1 + 0.2 * Math.sin(Math.PI * clamp01(s / RISE_S));
        break;
      }
      case ZS_BOSS_OPEN: {
        // открыт: обмяк, руки висят, глаза полузакрыты, в дупле горит голубой сучок
        open = true;
        rx = 0.16 + 0.03 * Math.sin(t * 1.7);
        rz = 0.06 * Math.sin(t * 1.3);
        armRx = 0.22;
        armRz = 0.12 * Math.sin(t * 1.3 + 0.5);
        eyeSy = 0.45;
        break;
      }
    }
    if (a.rage && !under) {
      // ярость: дрожит крона, качается быстрее
      rz += 0.02 * Math.sin(t * 13);
    }
    const j = jolt(a.hit);
    rx -= 0.12 * j;

    // гибель: падает вперёд, как срубленное дерево (пень с корнями остаётся), подскок от удара, всё уходит в землю
    const d = a.die;
    let fall = 0;
    let sink = 0;
    if (d > 0) {
      const u = clamp01(d / 0.5);
      fall = 1.5 * u * u - 0.1 * Math.sin(Math.PI * clamp01((d - 0.5) / 0.14));
      sink = 2.4 * ramp(0.68, 1, d);
      armRx = mix(armRx, 0.5, ramp(0, 0.5, d));
      armRz = 0;
      rx *= 1 - u;
      rz *= 1 - u;
      ry *= 1 - u;
    }
    if (fall !== 0) {
      // пень — на высоте 0,9 у переднего края: оттуда ствол и валится
      setPivot(out.body, ID, 0, 0.9, 0.7, 0, y - sink, 0, rx + fall, ry, rz, scale, scale, scale);
    } else {
      setPivot(out.body, ID, 0, 0.6, 0, 0, y, 0, rx, ry, rz, scale, scale, scale);
    }
    setChildS(out.armL, out.body, 0, SHOULDER_Y, 0, armRx, armRy, armRz, armSx, 1, 1);
    setPivot(out.legL, ID, 0, 0, 0, 0, rootY - sink, 0, 0, rootRy, 0, rootSxz, rootSy, rootSxz);
    setPivot(out.head, out.body, 0, EYE_Y, 0.9, 0, 0, 0, 0, 0, 0, 1, eyeSy, 1);
    if (open && d === 0) {
      const pulse = 1 + 0.08 * Math.sin(t * 5);
      setPivot(out.extra, out.body, 0, KNOT_Y, 0.8, 0, 0, 0, 0, 0, 0, pulse, pulse, pulse);
    } else hide(out.extra, out.body, 0, KNOT_Y, 0);
    if (a.rage && !under && d < 0.6) out.wingL.copy(out.body);
    else hide(out.wingL, out.body, 0, 2.5, 0);
  },
};
