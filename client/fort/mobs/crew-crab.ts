// Краб-абордажник — экипаж лодки (признак ZF_CREW): красный краб в треуголке и тельняшке, клешни наготове, глаза на
// стебельках светятся сиреневым. Прыгает из лодки на берег сальто (ZS_HOP), бежит к морской стене, лезет по ней
// (ZS_CLIMB → ZS_TOP → ZS_DROP), во дворе щиплет клешнями. Гибель — падает на спину, сучит ножками и уходит в землю.
// Вид у экипажа — шаркун или липучка, поэтому kinds = [Z_WALKER, Z_CLIMBER] и особый вариант when = ZF_CREW (договор
// mobs-a): обычных шаркунов краб не заменяет, а экипажу достаётся только он (красный — 2 из 3, скрипач — 1 из 3).
// Здесь же — сидячий краб для лодки (seatedCrab).
import * as THREE from 'three';
import { ZS_ATTACK, ZS_CLIMB, ZS_DROP, ZS_HOP, ZS_TOP, Z_CLIMBER, Z_WALKER } from '../../../shared/fort.ts';
import { ZF_CREW } from '../../../shared/fortnet.ts';
import { colored, merge, setBone, setBoneS, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import { blob, curve, jamDrop, mergeColored, paint, smooth, tricorn, tube } from './sea-shapes.ts';

/** Прыжок из лодки на берег, с (HOP_TICKS = 40 у крепости, shared/fortkinds.ts в rework/fort) */
const HOP_S = 40 / 60;
/** Центр панциря над ногами, плечи клешней и бёдра ножек (в осях корня) */
const BODY_Y = 0.86;
const SHOULDER = [0.4, 0.92, 0.1] as const;
const HIP = [0.33, 0.74, 0] as const;

const VEST_W = 0xf4efe4;
const VEST_B = 0x2f5fa8;
const JAM = 0x5e2479;
const EYE = 0x8f5cff;
const PUPIL = 0x24122e;
const FELT = 0x2b2230;
const GOLD = 0xe1b84a;

interface CrabLook {
  id: string;
  name: string;
  shell: number;
  belly: number;
  legs: number;
  /** Масштаб левой и правой клешни (скрипач: одна огромная) */
  clawL: number;
  clawR: number;
  /** Наклон треуголки набекрень, рад */
  hatTilt: number;
  weight: number;
}

/** Панцирь с тельняшкой спереди, шипы по краю, улыбка, стебельки, зрачки, треуголка — всё на кости body */
function bodyGeo(look: CrabLook): THREE.BufferGeometry {
  const shell = paint(blob(0.46, 0.34, 0.34, 12, 9), (p, n, o) => {
    // тельняшка: полосы по кольцам сферы — ровные, без «пилы»
    const band = Math.floor(Math.acos(Math.max(-1, Math.min(1, p.y / 0.34))) / (Math.PI / 9));
    if (n.z > 0.25 && band >= 4 && band <= 7) o.setHex(band % 2 ? VEST_B : VEST_W);
    else if (p.y < -0.22) o.setHex(look.belly);
    else o.setHex(look.shell);
  }, true);
  const parts: THREE.BufferGeometry[] = [shell];
  // пятна варенья на спине — круглые кляксы поверх панциря
  for (const [x, y, z, r] of [[-0.2, 0.2, -0.22, 0.13], [0.22, 0.24, -0.15, 0.1], [0.05, 0.02, -0.33, 0.11]] as const) {
    const nrm = new THREE.Vector3(x / 0.46, y / 0.34, z / 0.34).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
    parts.push(colored(blob(r, 0.025, r * 0.85, 7, 3).applyQuaternion(q).translate(x, y, z), JAM));
  }
  // шипы по переднему краю панциря
  for (const s of [-1, 1]) {
    for (const [x, z] of [[0.4, 0.12], [0.3, 0.24]] as const) {
      parts.push(colored(new THREE.ConeGeometry(0.045, 0.13, 5).rotateZ(-s * 1.2).rotateX(0.5).translate(s * x, 0.13, z), look.shell));
    }
  }
  // улыбка: тёмная дуга под тельняшкой не прячется — выше полос
  parts.push(colored(new THREE.TorusGeometry(0.085, 0.017, 3, 7, Math.PI).rotateZ(Math.PI).translate(0, 0.12, 0.318), 0x3a1426));
  // стебельки глаз и зрачки (сами глаза светятся — отдельная часть)
  for (const s of [-1, 1]) {
    parts.push(colored(new THREE.CylinderGeometry(0.03, 0.036, 0.3, 5, 1, true).rotateX(0.12).translate(s * 0.145, 0.4, 0.15), look.shell));
    parts.push(colored(new THREE.SphereGeometry(0.036, 6, 4).translate(s * 0.15, 0.57, 0.235), PUPIL));
  }
  // треуголка на макушке, угол вперёд — между стебельками
  parts.push(tricorn(0.37, 0.13, FELT, GOLD, 9, false).rotateX(-0.1).rotateZ(look.hatTilt).translate(0, 0.33, -0.02));
  // капли варенья по бокам панциря
  parts.push(jamDrop(0.035, 0.09, JAM).translate(0.36, -0.08, 0.16));
  parts.push(jamDrop(0.03, 0.07, JAM).translate(-0.3, 0.02, -0.2));
  return merge(parts.map((g) => (g.getAttribute('color') ? g : colored(g, look.shell))));
}

function eyesGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) parts.push(colored(new THREE.SphereGeometry(0.085, 8, 6).translate(s * 0.15, 0.56, 0.16), EYE));
  return merge(parts);
}

/** Клешня правой руки в осях плеча (левая — зеркально): рука трубкой, ладонь и два пальца буквой V */
function clawGeo(look: CrabLook, side: 1 | -1, k: number): THREE.BufferGeometry {
  const arm = tube(curve([[0, 0, 0], [0.12, 0.02, 0.14], [0.17, 0.1, 0.3]], 4), (_i, u) => 0.06 - u * 0.012, 5);
  const palm = blob(0.13, 0.15, 0.18, 8, 6).translate(0.17, 0.13, 0.42);
  const up = blob(0.06, 0.065, 0.2, 6, 4).rotateX(-0.45).translate(0.16, 0.24, 0.64);
  const low = blob(0.05, 0.055, 0.17, 6, 4).rotateX(0.4).translate(0.18, 0.04, 0.61);
  const tip = (p: THREE.Vector3, _n: THREE.Vector3, o: THREE.Color) => o.setHex(p.z > 0.7 ? 0xf6dcc0 : look.shell);
  const g = mergeColored([paint(arm, (_p, _n, o) => o.setHex(look.legs)), paint(palm, tip), paint(up, tip), paint(low, tip)]);
  g.scale(side * k, k, k);
  if (side < 0) flipWinding(g);
  return g;
}

/** Ножки одного бока: три коленчатые, кончики острые (в осях бедра; левый бок — зеркально) */
function legsGeo(look: CrabLook, side: 1 | -1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const dz of [-0.17, 0.02, 0.2]) {
    const pts = [new THREE.Vector3(0, 0, dz), new THREE.Vector3(0.24, 0.16, dz * 1.25), new THREE.Vector3(0.4, -0.34, dz * 1.45), new THREE.Vector3(0.44, -0.72, dz * 1.55)];
    parts.push(paint(tube(pts, (_i, u) => 0.048 - u * 0.026, 4, { capEnd: 1.6 }), (p, _n, o) => o.setHex(p.y < -0.5 ? 0x9c3a24 : look.legs)));
  }
  const g = mergeColored(parts);
  g.scale(side, 1, 1);
  if (side < 0) flipWinding(g);
  return g;
}

/** Зеркальная копия вывернута наизнанку — разворачиваем треугольники обратно */
export function flipWinding(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const col = g.getAttribute('color') as THREE.BufferAttribute | undefined;
  for (const a of [pos, nor, col]) {
    if (!a) continue;
    const arr = a.array as Float32Array;
    for (let i = 0; i + 2 < a.count; i += 3) {
      for (let c = 0; c < 3; c++) {
        const t = arr[(i + 1) * 3 + c];
        arr[(i + 1) * 3 + c] = arr[(i + 2) * 3 + c];
        arr[(i + 2) * 3 + c] = t;
      }
    }
    a.needsUpdate = true;
  }
}

const _root = new THREE.Matrix4();
const _loc = new THREE.Matrix4();
const _tmp = new THREE.Matrix4();

function fract(x: number): number {
  return x - Math.floor(x);
}

function crabPose(look: CrabLook, a: MobAnim, out: MobPose): void {
  const seed = a.seed;
  const size = 1 + (seed * 2 - 1) * 0.08;
  /** Шагов на 1,25 м: шустрые семенят чаще и мельче */
  const cycles = fract(seed * 7.31) < 0.3 ? 3 : 2;
  const amp = Math.asin(Math.min(0.9, 0.422 / cycles));
  const tilt = (fract(seed * 13.7) - 0.5) * 0.16;
  const rage = a.rage ? 1.4 : 1;
  const w = Math.min(1, a.speed / 0.6);
  const phi = a.gait * cycles * Math.PI * 2;
  const t = a.t * rage;

  let bodyY = BODY_Y + 0.025 * Math.cos(2 * phi) * w;
  let pitch = 0.07 * w;
  let roll = 0.06 * Math.sin(phi) * w + tilt;
  let yaw = 0;
  let sq = 1 + 0.02 * Math.sin(a.t * 2.2 + seed * 6) * (1 - w);
  // ножки: поворот у бедра (+ — ступня назад), подъём; клешни: наклон (− — вверх), разворот внутрь
  let legL = -amp * w * Math.cos(phi);
  let legR = -amp * w * Math.cos(phi + Math.PI);
  let liftL = Math.max(0, -Math.sin(phi)) * 0.09 * w;
  let liftR = Math.max(0, -Math.sin(phi + Math.PI)) * 0.09 * w;
  let splay = 0;
  let clawL = -0.28 + 0.14 * Math.sin(phi + 0.6) * w + 0.08 * Math.sin(t * 1.7 + seed * 9) * (1 - w);
  let clawR = -0.28 + 0.14 * Math.sin(phi + 0.6 + Math.PI) * w + 0.08 * Math.sin(t * 1.9 + seed * 5) * (1 - w);
  let inL = 0;
  let inR = 0;

  const st = a.st;
  if (st === ZS_ATTACK) {
    // крепость обнуляет stT на каждом ударе (ворота — раз в 0,5 с, человек — раз в 0,8 с): замах с 0, щипок к ~0,2 с,
    // дальше клешня возвращается наизготовку; клешни чередуются от удара к удару (по времени удара)
    const u = a.stT;
    const lead = Math.floor((a.t - a.stT) * 2 + seed * 2) & 1;
    const strike = u < 0.1 ? -1.15 * smooth(0, 0.1, u) : u < 0.2 ? -1.15 + 1.5 * smooth(0.1, 0.2, u) : 0.35 - 0.9 * smooth(0.2, 0.5, u);
    if (lead) clawR = strike;
    else clawL = strike;
    if (lead) clawL = -0.55;
    else clawR = -0.55;
    pitch = 0.05 + 0.2 * smooth(0.08, 0.18, u) * (1 - smooth(0.25, 0.45, u));
  } else if (st === ZS_CLIMB) {
    const c = a.t * 13;
    clawL = -2.3 + 0.5 * Math.sin(c);
    clawR = -2.3 - 0.5 * Math.sin(c);
    legL = -0.55 + 0.35 * Math.sin(c * 1.3);
    legR = -0.55 - 0.35 * Math.sin(c * 1.3);
    liftL = liftR = 0.05;
    roll = 0.12 * Math.sin(c) + tilt;
    pitch = -0.08;
    bodyY = BODY_Y + 0.04 * Math.abs(Math.sin(c));
  } else if (st === ZS_TOP) {
    clawL = -1.9 + 0.35 * Math.sin(a.t * 7);
    clawR = -1.9 + 0.35 * Math.cos(a.t * 7);
    inL = inR = -0.3;
    bodyY = BODY_Y - 0.08 + 0.05 * Math.abs(Math.sin(a.t * 7));
    roll = 0.08 * Math.sin(a.t * 3.5) + tilt;
  } else if (st === ZS_DROP) {
    clawL = clawR = -2.6;
    splay = 0.5;
    pitch = 0.3;
  } else if (st === ZS_HOP) {
    // сальто вперёд из лодки: ножки поджаты, клешни обнимают себя
    const u = Math.min(1, a.stT / HOP_S);
    pitch = Math.PI * 2 * smooth(0.05, 0.95, u);
    splay = -0.6 * Math.sin(Math.PI * u);
    legL = legR = 0.5 * Math.sin(Math.PI * u);
    clawL = clawR = 0.25;
    inL = inR = 0.35;
    bodyY = BODY_Y + 0.1 * Math.sin(Math.PI * u);
  }
  // вздрогнул: откинулся, клешни вверх, сплющился
  if (a.hit > 0) {
    pitch -= 0.35 * a.hit;
    clawL -= 0.8 * a.hit;
    clawR -= 0.8 * a.hit;
    sq *= 1 - 0.1 * a.hit;
  }
  // гибель: прыжок и на спину, ножки сучат, уходит в землю
  let sink = 0;
  let scale = size;
  if (a.die > 0) {
    const d1 = smooth(0, 0.35, a.die);
    const wig = smooth(0.25, 0.4, a.die) * (1 - smooth(0.8, 0.97, a.die));
    pitch = -Math.PI * d1;
    roll = 0.25 * Math.sin(Math.PI * d1);
    bodyY = BODY_Y - 0.5 * d1 + 0.35 * Math.sin(Math.PI * d1);
    legL = 0.55 * Math.sin(a.t * 30) * wig;
    legR = 0.55 * Math.sin(a.t * 30 + 2) * wig;
    liftL = liftR = 0;
    clawL = -0.6 + 0.6 * Math.sin(a.t * 24) * wig;
    clawR = -0.6 + 0.6 * Math.sin(a.t * 24 + 1.5) * wig;
    splay = 0.3 * wig;
    const gone = smooth(0.6, 1, a.die);
    scale = size * (1 - 0.9 * gone);
    sink = 0.35 * gone;
    yaw = 0.4 * d1;
  }

  setBone(_root, 0, -sink, 0, 0, 0, 0, scale);
  setBoneS(_loc, 0, bodyY, 0, pitch, yaw, roll, 1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  out.body.multiplyMatrices(_root, _loc);
  const b = out.body;
  setBone(_loc, -SHOULDER[0], SHOULDER[1] - BODY_Y, SHOULDER[2], clawL, inL, 0);
  out.armL.multiplyMatrices(b, _loc);
  setBone(_loc, SHOULDER[0], SHOULDER[1] - BODY_Y, SHOULDER[2], clawR, -inR, 0);
  out.armR.multiplyMatrices(b, _loc);
  setBone(_tmp, -HIP[0], HIP[1] - BODY_Y + liftL, HIP[2], legL, 0, -splay);
  out.legL.multiplyMatrices(b, _tmp);
  setBone(_tmp, HIP[0], HIP[1] - BODY_Y + liftR, HIP[2], legR, 0, splay);
  out.legR.multiplyMatrices(b, _tmp);
}

/** Особый вариант договора (MobDef.when у mobs-a): пока его нет в этой копии kit.ts — поле через пересечение типов */
export type CrewDef = MobDef & { when?: number };

function crabDef(look: CrabLook): CrewDef {
  return {
    id: look.id,
    name: look.name,
    kinds: [Z_WALKER, Z_CLIMBER],
    weight: look.weight,
    when: ZF_CREW,
    height: 1.52,
    parts: [
      { bone: 'body', geo: bodyGeo(look) },
      { bone: 'body', geo: eyesGeo(), glow: true },
      { bone: 'armL', geo: clawGeo(look, -1, look.clawL) },
      { bone: 'armR', geo: clawGeo(look, 1, look.clawR) },
      { bone: 'legL', geo: legsGeo(look, -1) },
      { bone: 'legR', geo: legsGeo(look, 1) },
    ],
    pose: (a, out) => crabPose(look, a, out),
  };
}

export const CREW_CRAB = crabDef({ id: 'crew-crab', name: 'Краб-абордажник', shell: 0xd9452f, belly: 0xf2a77c, legs: 0xd8573a, clawL: 1, clawR: 1, hatTilt: 0.08, weight: 2 });
export const CREW_FIDDLER = crabDef({ id: 'crew-fiddler', name: 'Краб-скрипач', shell: 0xe8742e, belly: 0xf6c08a, legs: 0xdf6a35, clawL: 0.72, clawR: 1.55, hatTilt: -0.16, weight: 1 });
export const CREW_CRABS: readonly CrewDef[] = [CREW_CRAB, CREW_FIDDLER];

// ------------------------------------------------------------ сидячий краб для лодки

/**
 * Краб на скамье лодки — дешёвый (≈150 треугольников): панцирь, поднятые клешни, глаза, маленькая треуголка.
 * Точка — середина сиденья, смотрит вперёд (+Z). Глаза тут не светятся (часть лодки), зато ярко-сиреневые.
 */
export function seatedCrab(shell: number, belly: number, x: number, y: number, z: number, yaw = 0, s = 1): THREE.BufferGeometry {
  const body = paint(blob(0.36, 0.28, 0.3, 6, 4).translate(0, 0.28, 0), (p, n, o) => o.setHex(n.z > 0.45 && p.y < 0.3 ? belly : shell));
  const parts: THREE.BufferGeometry[] = [body];
  for (const sd of [-1, 1]) {
    parts.push(colored(blob(0.13, 0.17, 0.12, 5, 3).rotateZ(-sd * 0.3).translate(sd * 0.37, 0.52, 0.13), shell));
    for (const f of [-1, 1]) parts.push(colored(new THREE.ConeGeometry(0.05, 0.2, 3, 1, true).rotateZ(-sd * 0.3 + f * 0.32).translate(sd * 0.42 + f * 0.05, 0.74, 0.13), 0xf6dcc0));
    parts.push(colored(new THREE.OctahedronGeometry(0.075).translate(sd * 0.13, 0.62, 0.17), EYE));
  }
  parts.push(tricorn(0.34, 0.12, FELT, GOLD, 6, false).rotateZ(0.08).translate(0, 0.5, -0.03));
  const g = mergeColored(parts.map((p) => (p.getAttribute('color') ? p : colored(p, shell))));
  g.scale(s, s, s).rotateY(yaw).translate(x, y, z);
  return g;
}
