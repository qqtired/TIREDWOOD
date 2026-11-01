// «Золотой краб» (Т-16, Z_GOLDCRAB в shared/fortideas.ts): не враг — раз в пять волн выбегает с северного луга и бежит
// вдоль стены к морю, каждое попадание — золото всем. Золотой панцирь с бликами, на спине прилипли монеты (светятся —
// это и есть блеск), глаза на стебельках с хитрыми веками, две большие клешни с тёмными кончиками, улыбка.
// Бежит боком, как настоящий краб: лицом к +X модели, ход — вдоль ±Z (знак скорости из крепости — куда именно).
// Попадание — подпрыгнул, клешни вверх, глаза вытянулись. Пойман (гибель) — подпрыгивает с разворотом и сжимается в
// искорку. У воды (ZS_CRAB_DIVE) — поворачивается к морю и заныривает носом вниз.
// Кости: body — панцирь (и монеты), tail — глаза на стебельках, armL/armR — клешни (левая — к −Z), head/extra — верхние
// пальцы клешней, legL/legR — две четвёрки ножек «через одну».
import * as THREE from 'three';
import { Z_GOLDCRAB, ZS_CRAB_DIVE } from '../../../shared/fortideas.ts';
import { colored, setBone, setBoneS, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import { flipWinding } from './crew-crab.ts';
import { blob, curve, mergeColored, paint, smooth, tube } from './sea-shapes.ts';

const TAU = Math.PI * 2;

const GOLD = 0xe0a020;
const GOLD_DEEP = 0x9c5c0c;
const GOLD_LIGHT = 0xffd24a;
const GLINT = 0xfff2c0;
const BELLY = 0xe8b860;
const TIP = 0x6a3a10;
const EYE_W = 0xfffaf0;
const PUPIL = 0x1e1410;
const MOUTH = 0x5a2a10;
const COIN = 0xffc43a;
const COIN_RIM = 0xe0901c;

/** Панцирь над ногами, бёдра ножек, плечи клешней и основание стебельков (в осях корня и тела) */
const BODY_Y = 0.42;
const HIP_Y = 0.4;
const SHOULDER = [0.25, -0.03, 0.27] as const;
const EYES_AT = [0.19, 0.13, 0] as const;
/** Шарнир верхнего пальца в осях плеча правой клешни (левая — зеркально по Z) */
const HINGE = [0.41, 0.13, 0.13] as const;
const RX = 0.36;
const RY = 0.2;
const RZ = 0.5;

const _c0 = new THREE.Color();
const _c1 = new THREE.Color();

function goldShade(p: THREE.Vector3, n: THREE.Vector3, o: THREE.Color): void {
  // снизу брюшко, по бокам тёмное золото, сверху светлое; косая полоса блика по верху
  if (n.y < -0.35) {
    o.setHex(BELLY);
    return;
  }
  const k = Math.min(1, Math.max(0, (n.y + 0.35) / 1.1));
  o.copy(_c0.setHex(GOLD_DEEP)).lerp(_c1.setHex(GOLD), Math.min(1, k * 1.5));
  if (k > 0.72) o.lerp(_c1.setHex(GOLD_LIGHT), ((k - 0.72) / 0.28) * 0.75);
  if (n.y > 0.45 && Math.abs(p.x * 0.8 + p.z * 0.45 - 0.06) < 0.024) o.setHex(GLINT);
}

/** Панцирь: сплюснутый, снизу плоский, спереди чуть срезан; бугорки, кант по краю, улыбка спереди */
function bodyGeo(): THREE.BufferGeometry {
  const shell = blob(RX, RY, RZ, 16, 10);
  const pos = shell.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0) pos.setY(i, y * 0.55);
    const x = pos.getX(i);
    if (x > 0) pos.setX(i, x * 0.9);
    // зубчики по краю панциря: чуть волнистый обод
    const a = Math.atan2(pos.getZ(i), x);
    const rim = 1 - Math.abs(y) / RY;
    pos.setX(i, pos.getX(i) * (1 + 0.04 * rim * Math.cos(a * 9)));
    pos.setZ(i, pos.getZ(i) * (1 + 0.04 * rim * Math.cos(a * 9)));
  }
  shell.computeVertexNormals();
  const parts: THREE.BufferGeometry[] = [paint(shell, goldShade)];
  // бугорки на спине
  for (const [x, z, r] of [[-0.05, -0.22, 0.05], [0.06, 0.2, 0.045], [-0.17, 0.05, 0.05], [0.12, -0.05, 0.04], [-0.12, 0.3, 0.04]] as const) {
    const y = RY * Math.sqrt(Math.max(0, 1 - (x / RX) ** 2 - (z / RZ) ** 2));
    parts.push(paint(blob(r, r * 0.55, r, 7, 4).translate(x, y - 0.005, z), goldShade));
  }
  // улыбка спереди (+X), под глазами
  parts.push(colored(new THREE.TorusGeometry(0.06, 0.014, 4, 9, Math.PI).rotateZ(Math.PI).rotateY(Math.PI / 2).translate(RX * 0.9 * 0.97 + 0.006, 0.06, 0), MOUTH));
  // тёмные усики-ротовые лапки под улыбкой
  for (const s of [-1, 1]) parts.push(colored(new THREE.ConeGeometry(0.02, 0.09, 4).rotateZ(-Math.PI / 2 - 0.5).translate(RX * 0.86, -0.04, s * 0.05), TIP));
  return mergeColored(parts);
}

/** Монеты, прилипшие к спине, и искорки — светятся (свечение = блеск золота) */
function glowGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = new THREE.Vector3();
  const q = new THREE.Quaternion();
  for (const [x, z, tilt] of [[-0.1, -0.12, 0.3], [0.0, 0.14, -0.4], [-0.19, 0.26, 0.6]] as const) {
    const y = RY * Math.sqrt(Math.max(0, 1 - (x / RX) ** 2 - (z / RZ) ** 2));
    n.set(x / RX ** 2, y / RY ** 2, z / RZ ** 2).normalize();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    const coin = paint(new THREE.CylinderGeometry(0.085, 0.085, 0.022, 14).rotateY(tilt), (p, _nn, o) => o.setHex(Math.hypot(p.x, p.z) > 0.066 || Math.abs(p.y) < 0.006 ? COIN_RIM : COIN), true);
    parts.push(coin.applyQuaternion(q).translate(x + n.x * 0.012, y + n.y * 0.012, z + n.z * 0.012));
  }
  // две искорки: на панцире и над правой клешнёй
  for (const [x, y, z, s] of [[0.1, 0.22, -0.3, 0.05], [-0.02, 0.24, 0.36, 0.04]] as const) {
    parts.push(colored(new THREE.OctahedronGeometry(1, 0).scale(s * 0.35, s, s * 0.35).rotateX(0.3).translate(x, y, z), GLINT));
    parts.push(colored(new THREE.OctahedronGeometry(1, 0).scale(s, s * 0.35, s * 0.35).rotateX(0.3).translate(x, y, z), GLINT));
  }
  return mergeColored(parts);
}

/** Глаза на стебельках (в осях своей кости — основание стебельков на панцире): белки, зрачки к +X, веки */
function eyesGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const stalk = curve([[0, 0, s * 0.11], [0.02, 0.14, s * 0.125], [0.04, 0.26, s * 0.14]], 5);
    parts.push(paint(tube(stalk, (_i, u) => 0.035 - 0.01 * u, 6), (_p, _n, o) => o.setHex(GOLD)));
    parts.push(colored(blob(0.068, 0.072, 0.068, 10, 7).translate(0.045, 0.3, s * 0.14), EYE_W));
    parts.push(colored(blob(0.034, 0.04, 0.034, 8, 5).translate(0.1, 0.305, s * 0.14), PUPIL));
    parts.push(colored(blob(0.012, 0.012, 0.012, 4, 3).translate(0.125, 0.325, s * 0.14 - 0.012), 0xffffff));
    // веко: золотая шапочка сверху, чуть набок — хитрый прищур
    parts.push(paint(new THREE.SphereGeometry(0.076, 10, 4, 0, TAU, 0, Math.PI * 0.42).rotateZ(-0.35).rotateX(s * 0.18).translate(0.045, 0.302, s * 0.14), (_p, _n, o) => o.setHex(GOLD_DEEP)));
  }
  return mergeColored(parts);
}

/** Правая клешня (+Z) в осях плеча; левая — зеркально. Рука, ладонь с бликом, нижний палец */
function clawGeo(side: 1 | -1): THREE.BufferGeometry {
  const arm = tube(curve([[0, 0, 0], [0.1, 0.03, 0.07], [0.2, 0.07, 0.12]], 5), (_i, u) => 0.055 - 0.012 * u, 6);
  const palm = blob(0.17, 0.14, 0.12, 10, 7).translate(0.3, 0.09, 0.13);
  const low = blob(0.15, 0.05, 0.065, 7, 4).rotateZ(-0.12).translate(0.48, 0.03, 0.13);
  const tip = (p: THREE.Vector3, n: THREE.Vector3, o: THREE.Color) => {
    if (p.x > 0.56) o.setHex(TIP);
    else goldShade(p.clone().setX(p.x - 0.3), n, o);
  };
  const g = mergeColored([paint(arm, (_p, _n, o) => o.setHex(GOLD_DEEP)), paint(palm, tip), paint(low, tip)]);
  if (side < 0) {
    g.scale(1, 1, -1);
    flipWinding(g);
  }
  return g;
}

/** Верхний палец клешни — подвижный, в осях шарнира */
function fingerGeo(side: 1 | -1): THREE.BufferGeometry {
  const up = blob(0.16, 0.055, 0.065, 7, 4).rotateZ(0.12).translate(0.11, 0.0, 0);
  const g = mergeColored([paint(up, (p, n, o) => (p.x > 0.17 ? o.setHex(TIP) : goldShade(p, n, o)))]);
  if (side < 0) {
    g.scale(1, 1, -1);
    flipWinding(g);
  }
  return g;
}

/** Ножки «через одну» в осях корня (стопы на земле): по четыре с боков ±Z, коленом вверх, острый тёмный кончик */
const LEG_X = [-0.2, -0.07, 0.06, 0.18];
function legsGeo(group: 0 | 1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      if ((i + (s > 0 ? 0 : 1) + group) % 2) continue;
      const x = LEG_X[i];
      const k = 1 - Math.abs(x) * 0.6;
      const pts = [new THREE.Vector3(x, HIP_Y - 0.02, s * 0.34), new THREE.Vector3(x * 1.1, 0.54, s * 0.52 * k), new THREE.Vector3(x * 1.18, 0.3, s * 0.63 * k), new THREE.Vector3(x * 1.24, 0.02, s * 0.68 * k)];
      const g = tube(pts, (_i, u) => 0.064 - 0.04 * u, 6, { capEnd: 1.6 });
      parts.push(paint(g, (p, n, o) => (p.y < 0.12 ? o.setHex(TIP) : goldShade(p, n, o))));
    }
  }
  return mergeColored(parts);
}

/** Стопа четвёрки: z — вдоль хода (в опоре едет назад со скоростью земли), lift — подъём 0…1 */
const LEG = { z: 0, lift: 0 };
function legPhase(phase: number, travel: number): typeof LEG {
  const p = phase - Math.floor(phase);
  if (p < 0.5) {
    LEG.z = (0.5 - p / 0.5) * travel;
    LEG.lift = 0;
  } else {
    const u = (p - 0.5) / 0.5;
    LEG.z = (-0.5 + smooth(0, 1, u)) * travel;
    LEG.lift = Math.sin(Math.PI * u);
  }
  return LEG;
}

/** «Щёлк-щёлк»: раз в period с два быстрых щелчка (0 — закрыта, 1 — раскрыта) */
function snaps(t: number, period: number): number {
  const p = ((t % period) + period) % period;
  if (p > 0.5) return 0;
  const k = p < 0.25 ? p / 0.25 : (p - 0.25) / 0.25;
  return k < 0.45 ? smooth(0, 0.45, k) : 1 - smooth(0.45, 0.62, k);
}

const _root = new THREE.Matrix4();
const _loc = new THREE.Matrix4();
const _tmp = new THREE.Matrix4();
const _hip = new THREE.Matrix4().makeTranslation(0, -HIP_Y, 0);
/** Шагов на 1,25 м пути: краб семенит */
const CYCLES = 3;
const TRAVEL = (0.5 * 1.25) / CYCLES;

function crabPose(a: MobAnim, out: MobPose): void {
  const seed = a.seed;
  const sgn = a.speed < 0 ? -1 : 1;
  const w = smooth(0.1, 1.2, Math.abs(a.speed));
  const ph = a.gait * CYCLES;
  const run = TAU * ph;
  const t = a.t + seed * 7;

  let bodyY = BODY_Y + 0.03 * Math.abs(Math.cos(run)) * w + 0.008 * Math.sin(t * 2.4) * (1 - w);
  // покачивается вдоль хода, ведущий бок ниже; нос чуть вниз
  let rx = (0.07 * Math.sin(run) + 0.06 * sgn) * w;
  const ry = 0.05 * Math.sin(run * 0.5) * w;
  let rz = -0.05 * w;
  let sq = 1;
  let hop = 0;
  // клешни: подъём (+ — вверх), раскрыт ли верхний палец (0…1)
  let clawL = 0.3 + 0.16 * Math.sin(run + 1) * w + 0.08 * Math.sin(t * 1.6) * (1 - w);
  let clawR = 0.3 + 0.16 * Math.sin(run + 1 + Math.PI) * w + 0.08 * Math.sin(t * 1.9) * (1 - w);
  let openL = 0.08 + 0.7 * snaps(t, 2.4);
  let openR = 0.08 + 0.7 * snaps(t + 1.2, 2.8);
  // стебельки отстают от хода и дрожат на бегу; в покое — оглядываются
  let eyeRx = -sgn * 0.28 * w + 0.07 * Math.sin(t * 11) * w + 0.12 * Math.sin(t * 0.7) * (1 - w);
  let eyeRz = 0.06 * Math.sin(t * 1.3);
  let eyeS = 1;
  let stride = w;
  const lift = 0.09;
  let spread = 1;
  let onBody = false;
  let yaw = 0;
  let scale = 1 + (seed - 0.5) * 0.06;
  let sink = 0;
  let kick = 0;

  // попадание: подпрыгнул, клешни вверх и раскрыты, глаза вытянулись, откинулся носом вверх
  if (a.hit > 0) {
    const h = a.hit;
    const arc = Math.sin(Math.PI * Math.min(1, (1 - h) * 1.25));
    hop += 0.17 * arc;
    clawL += 1.15 * h;
    clawR += 1.15 * h;
    openL = Math.max(openL, 0.95 * h);
    openR = Math.max(openR, 0.95 * h);
    eyeS = 1 + 0.28 * h;
    eyeRz -= 0.25 * h;
    rz += 0.2 * h;
    sq = 1 + 0.1 * arc - 0.12 * h * (1 - arc);
    spread = 1 + 0.18 * h;
  }

  // у воды: поворачивается к морю (по ходу), подпрыгивает и ныряет носом вниз, исчезает
  if (a.st === ZS_CRAB_DIVE && a.die <= 0) {
    const k = a.stT;
    const turn = smooth(0, 0.25, k);
    const tip = smooth(0.2, 0.62, k);
    yaw = -sgn * (Math.PI / 2) * turn;
    rx *= 1 - turn;
    rz = rz * (1 - tip) - 1.3 * tip;
    hop = 0.24 * Math.sin(Math.PI * smooth(0.18, 0.6, k)) - 0.06 * smooth(0, 0.18, k) * (1 - tip);
    sink = 0.55 * smooth(0.45, 1, k);
    clawL = clawL * (1 - tip) - 0.25 * tip;
    clawR = clawR * (1 - tip) - 0.25 * tip;
    openL = openR = 0.15;
    eyeRx = 0;
    eyeRz = -0.7 * tip;
    eyeS = 1 - 0.25 * tip;
    stride = 0;
    spread = 1 - 0.3 * tip;
    onBody = tip > 0;
    kick = tip * (1 - smooth(0.7, 1, k));
    scale *= 1 - 0.92 * smooth(0.62, 1, k);
  }

  // пойман: подпрыгивает с разворотом (клешни вверх — «ура»), сжимается в искорку
  if (a.die > 0) {
    const d = a.die;
    hop = 0.6 * Math.sin(Math.PI * smooth(0, 0.62, d));
    yaw = TAU * 1.25 * smooth(0.02, 0.66, d);
    clawL = clawR = 1.45 + 0.25 * Math.sin(a.t * 22);
    openL = openR = 0.9;
    eyeS = 1.3;
    eyeRz = -0.3;
    eyeRx = 0;
    rx = 0;
    rz = 0.1;
    sq = 1 + 0.18 * Math.sin(Math.PI * smooth(0, 0.22, d));
    stride = 0;
    onBody = true;
    spread = 0.85;
    kick = 1;
    scale *= 1 - 0.97 * smooth(0.5, 1, d);
  }

  setBone(_root, 0, -sink, 0, 0, yaw, 0, Math.max(0.02, scale));
  setBoneS(_loc, 0, bodyY + hop, 0, rx, ry, rz, 1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  out.body.multiplyMatrices(_root, _loc);
  const b = out.body;
  setBoneS(_loc, EYES_AT[0], EYES_AT[1], EYES_AT[2], eyeRx, 0, eyeRz, 1, Math.max(0.05, eyeS), 1);
  out.tail.multiplyMatrices(b, _loc);
  setBone(_loc, SHOULDER[0], SHOULDER[1], -SHOULDER[2], 0, 0.14, clawL);
  out.armL.multiplyMatrices(b, _loc);
  setBone(_loc, SHOULDER[0], SHOULDER[1], SHOULDER[2], 0, -0.14, clawR);
  out.armR.multiplyMatrices(b, _loc);
  setBone(_loc, HINGE[0], HINGE[1], -HINGE[2], 0, 0, 0.85 * openL);
  out.head.multiplyMatrices(out.armL, _loc);
  setBone(_loc, HINGE[0], HINGE[1], HINGE[2], 0, 0, 0.85 * openR);
  out.extra.multiplyMatrices(out.armR, _loc);
  // ножки: на земле — от корня (опорная четвёрка стоит в мире), в прыжке и нырке — вместе с панцирем и сучат
  const A = legPhase(ph, TRAVEL * stride);
  const aZ = A.z;
  const aL = A.lift;
  const B = legPhase(ph + 0.5, TRAVEL * stride);
  const base = onBody ? _tmp.multiplyMatrices(b, _loc.makeTranslation(0, -BODY_Y, 0)) : _root;
  const wig = 0.45 * Math.sin(a.t * 28) * kick;
  for (let g = 0; g < 2; g++) {
    const z = sgn * (g === 0 ? aZ : B.z);
    const up = (g === 0 ? aL : B.lift) * lift;
    setBoneS(_loc, 0, HIP_Y + up, z, g === 0 ? wig : -wig, 0, 0, 1, 1, spread);
    _loc.multiply(_hip);
    (g === 0 ? out.legL : out.legR).multiplyMatrices(base, _loc);
  }
}

export const GOLD_CRAB: MobDef = {
  id: 'gold-crab',
  name: 'Золотой краб',
  kinds: [Z_GOLDCRAB],
  weight: 1,
  height: 0.9,
  parts: [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'body', geo: glowGeo(), glow: true },
    { bone: 'tail', geo: eyesGeo() },
    { bone: 'armL', geo: clawGeo(-1) },
    { bone: 'armR', geo: clawGeo(1) },
    { bone: 'head', geo: fingerGeo(-1) },
    { bone: 'extra', geo: fingerGeo(1) },
    { bone: 'legL', geo: legsGeo(0) },
    { bone: 'legR', geo: legsGeo(1) },
  ],
  pose: crabPose,
};
