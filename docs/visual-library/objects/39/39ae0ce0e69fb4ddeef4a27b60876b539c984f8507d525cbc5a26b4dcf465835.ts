// Ткачиха (Z_WEAVER) — босс 35, 77, 119 … Паучиха-бабушка: круглое брюшко в пятнах варенья с кремовым сердечком и
// катушкой ниток на спине, на голове — красный платочек в белый горошек, круглые очки на светящихся сиреневых глазах,
// клычки, восемь ног в полосатых чулках и тапочках. Ходит «четвёрками» (L1 R2 L3 R4 — кость legL, R1 L2 R3 L4 — legR):
// пока одна четвёрка стоит, другая переступает, стопы не скользят.
// На стене (признак ZF_WV_WALL в снимке) — висит на наружной грани северной стены брюхом к камню: брюшко внизу, голова
// и передние ноги — над краем бруствера. Лезет (ZS_WV_CLIMB) — поворачивается из стойки в «висит»; перелезает во двор
// (ZS_WV_OVER) — подтягивается на бруствер, переходит стену, прыгает вниз.
// Атаки (полное предупреждение — позой): хлёст (ZS_WV_SWEEP) — четвёрка ног замахивается назад-вверх и дрожит, удар
// через край; паутина (ZS_WV_WEB) — вяжет, перебирая ногами, брюшко качается, в конце — бросок клубка; кладка
// (ZS_WV_BROOD) — раздувается и пульсирует, в конце — сдувается; укус (ZS_WV_BITE, во дворе) — встаёт на дыбы и
// бросается вперёд. Открыта (ZS_BOSS_OPEN) — обмякла, тяжело дышит, горят голубые сердечки на платке и брюшке.
// Ярость — глаза красные, ноги дёргаются. Гибель — падает со стены, переворачивается на спину, поджимает и дрыгает
// ногами, уходит в землю.
import * as THREE from 'three';
import { TICK_RATE } from '../../../shared/constants.ts';
import {
  BOSS_WARN_TICKS, ZS_BOSS_OPEN, ZS_WV_BITE, ZS_WV_BROOD, ZS_WV_CLIMB, ZS_WV_OVER, ZS_WV_SWEEP, ZS_WV_WEB,
} from '../../../shared/fort.ts';
import { WV_CLIMB_TICKS, WV_HANG_Y, WV_HANG_Z, WV_OVER_TICKS, ZF_WV_WALL } from '../../../shared/fortbosses.ts';
import { Z_WEAVER } from '../../../shared/fortkinds.ts';
import { GATE } from '../../../shared/fortmap.ts';
import { ARMY, MOB_STRIDE, colored, merge, setBone, setChildS, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import {
  TAU, blob, clamp01, fan, hide, jamSpot, jolt, newStep, paint, ramp, setPivot, smooth, stepAt, tube, walkAmount,
} from './set-f-shapes.ts';

const PLUM = 0x7a3f86;
const PLUM_LIGHT = 0xa267ae;
const PLUM_DARK = 0x4f2558;
const CREAM = 0xf7e6cc;
const RED = 0xd8414b;
const RED_DARK = 0xa82c3a;
const WIRE = 0xd9b04c;
const WOOD = 0xc98d52;
const WOOD_DARK = 0x9a6334;
const SOCK = 0xc9a3e0;
const SLIPPER = 0xb33a55;
const FANG = 0xfff4e0;
const CORE = 0x63ecf7;
const RAGE_EYE = 0xff3b2f;

type P3 = readonly [number, number, number];
/** Головогрудь — центр (сюда же крепятся ноги), голова, брюшко (центр и полуоси; брюшко задрано назад) */
const CEPH: P3 = [0, 1.78, 0.45];
const HEAD: P3 = [0, 2.0, 1.25];
const ABD: P3 = [0, 2.15, -1.35];
const ABD_R = [1.25, 1.12, 1.35] as const;
const ABD_TILT = -0.25;
/** Где тело переламывается, вставая на дыбы (между головогрудью и брюшком) */
const WAIST: P3 = [0, 1.75, -0.25];
/** Ноги: бёдра на головогруди, стопы на земле (x — для левой, +X; правая — зеркально) */
const HIP_Z = [0.92, 0.62, 0.32, 0.02];
const FOOT: ReadonlyArray<readonly [number, number]> = [[2.2, 1.15], [2.6, 0.15], [2.5, -0.9], [2.1, -1.95]];
/** Висит: стена перед корнем на HANG_TZ, тело ближе к камню на HANG_BODY, ноги прижаты (по высоте × HANG_LEG) */
const HANG_TZ = GATE.face - WV_HANG_Z;
const HANG_TY = 2.25;
const HANG_BODY = -0.7;
const HANG_LEG = 0.6;
const WARN_S = BOSS_WARN_TICKS / TICK_RATE;
const CLIMB_S = WV_CLIMB_TICKS / TICK_RATE;
const OVER_S = WV_OVER_TICKS / TICK_RATE;
/** Клубок паутины летит 24 тика — бросок за столько до конца метки */
const THROW_AT = (BOSS_WARN_TICKS - 24) / TICK_RATE;

const cPlum = new THREE.Color(PLUM);
const cPlumLight = new THREE.Color(PLUM_LIGHT);
const cPlumDark = new THREE.Color(PLUM_DARK);

/** Сердечко (контур по (x, y), ширина ~2·w) */
function heartOutline(w: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    const x = 16 * Math.sin(a) ** 3;
    const y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
    out.push([(x / 16) * w, (y / 16) * w]);
  }
  return out;
}

/** Точка на верхушке брюшка (в его осях, без наклона): (x, z) → поверх эллипсоида на off */
function abdTop(off: number): (x: number, z: number, out: THREE.Vector3) => void {
  const [a, b, c] = ABD_R;
  return (x, z, out) => {
    const y = b * Math.sqrt(Math.max(0, 1 - (x / a) ** 2 - (z / c) ** 2));
    // наружу по нормали эллипсоида
    const nx = x / (a * a);
    const ny = y / (b * b);
    const nz = z / (c * c);
    const l = Math.hypot(nx, ny, nz) || 1;
    out.set(x + (nx / l) * off, y + (ny / l) * off, z + (nz / l) * off);
  };
}

/** Брюшко в своих осях (центр — 0): пятна варенья, кремовое сердце, катушка ниток, паутинные бородавки */
function abdomenGeo(): THREE.BufferGeometry {
  const [a, b, c] = ABD_R;
  const parts: THREE.BufferGeometry[] = [
    paint(blob(a, b, c, 18, 12), (p, _n, o) => {
      o.copy(cPlum).lerp(cPlumLight, 0.35 * ramp(0.2, 1, p.y / b)).lerp(cPlumDark, 0.45 * ramp(-0.1, -1, p.y / b));
    }),
    colored(fan(heartOutline(0.48).map(([x, y]) => [x, -y - 0.72] as [number, number]), (x, y, out) => abdTop(0.012)(x, y, out), 3, true), CREAM),
    colored(new THREE.ConeGeometry(0.18, 0.3, 6).rotateX(-Math.PI / 2).translate(0, -0.1, -c - 0.05), PLUM_DARK),
  ];
  for (const [x, y, z, r] of [[1.05, 0.2, 0.45, 0.22], [-1.0, -0.15, -0.55, 0.26], [0.7, 0.55, -0.85, 0.16], [-0.85, 0.5, 0.6, 0.18], [0.25, -0.75, -0.95, 0.2]] as const) {
    const n = new THREE.Vector3(x / (a * a), y / (b * b), z / (c * c)).normalize();
    const k = 1 / Math.sqrt((x / a) ** 2 + (y / b) ** 2 + (z / c) ** 2);
    parts.push(jamSpot(x * k, y * k, z * k, r, n.x, n.y, n.z, r > 0.2 ? ARMY.jam : ARMY.jamDark));
  }
  // катушка ниток поперёк спины: щёчки, сиреневая намотка, нитка свисает вбок
  const spool: THREE.BufferGeometry[] = [
    colored(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 12).rotateZ(Math.PI / 2).translate(0.3, 0, 0), WOOD),
    colored(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 12).rotateZ(Math.PI / 2).translate(-0.3, 0, 0), WOOD),
    paint(new THREE.CylinderGeometry(0.27, 0.27, 0.53, 12, 3).rotateZ(Math.PI / 2), (p, _n, o) => o.setHex(Math.abs(p.x) % 0.12 < 0.04 ? ARMY.jam : ARMY.jamLight)),
    colored(new THREE.CylinderGeometry(0.08, 0.08, 0.75, 6).rotateZ(Math.PI / 2), WOOD_DARK),
  ];
  parts.push(merge(spool).rotateY(0.25).translate(0, b + 0.2, 0.3));
  parts.push(colored(tube([[0.28, b + 0.05, 0.42], [0.75, b - 0.15, 0.55], [1.05, 0.5, 0.6], [1.15, 0.0, 0.5], [1.12, -0.45, 0.4]], () => 0.03, 12, 4, true), ARMY.jamLight));
  return merge(parts);
}

/** Голова в платочке: очки, клычки, узелок под подбородком (в осях модели) */
function headGeo(): THREE.BufferGeometry {
  const [hx, hy, hz] = HEAD;
  const parts: THREE.BufferGeometry[] = [
    paint(blob(0.6, 0.54, 0.56, 14, 10).translate(hx, hy, hz), (p, _n, o) => o.copy(cPlum).lerp(cPlumLight, 0.3 * ramp(hy - 0.2, hy + 0.5, p.y))),
  ];
  // платочек: шапочка поверх головы, откинута назад; горошек — кружочками
  const scarf = new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI * 0.56).scale(0.68, 0.64, 0.66).rotateX(-0.42);
  parts.push(paint(scarf, (p, _n, o) => o.setHex(p.y < 0.12 ? RED_DARK : RED)).translate(hx, hy + 0.06, hz - 0.05));
  const dots = [[0.3, 0.55, 0.35], [-0.3, 0.55, 0.35], [0, 0.66, 0.1], [0.55, 0.3, 0.05], [-0.55, 0.3, 0.05], [0.25, 0.45, -0.35], [-0.25, 0.45, -0.35], [0, 0.35, -0.55], [0.5, 0.05, -0.3], [-0.5, 0.05, -0.3]];
  for (const [x, y, z] of dots) {
    const n = new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(1, 0, 0), -0.42).normalize();
    const p = n.clone().multiply(new THREE.Vector3(0.72, 0.68, 0.7));
    parts.push(jamSpot(hx + p.x, hy + 0.06 + p.y, hz - 0.05 + p.z, 0.075, n.x, n.y, n.z, CREAM));
  }
  // узелок под подбородком и два хвостика
  parts.push(colored(blob(0.13, 0.1, 0.1, 7, 5).translate(hx, hy - 0.5, hz + 0.32), RED));
  for (const s of [-1, 1]) {
    parts.push(colored(new THREE.ConeGeometry(0.1, 0.32, 4).scale(1, 1, 0.35).rotateZ(s * 0.5).translate(hx + s * 0.13, hy - 0.68, hz + 0.34), RED));
  }
  // очки: две оправы и перемычка, дужки к платку
  for (const s of [-1, 1]) {
    parts.push(colored(new THREE.TorusGeometry(0.19, 0.03, 4, 14).translate(hx + s * 0.23, hy + 0.02, hz + 0.53), WIRE));
    parts.push(colored(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 4).rotateX(Math.PI / 2).translate(hx + s * 0.43, hy + 0.04, hz + 0.32), WIRE));
  }
  parts.push(colored(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 4).rotateZ(Math.PI / 2).translate(hx, hy + 0.06, hz + 0.55), WIRE));
  // клычки
  for (const s of [-1, 1]) {
    parts.push(colored(new THREE.ConeGeometry(0.065, 0.26, 5).rotateX(Math.PI + 0.35).translate(hx + s * 0.13, hy - 0.42, hz + 0.45), FANG));
  }
  // варенье на щеке
  parts.push(jamSpot(hx - 0.38, hy - 0.18, hz + 0.38, 0.1, -0.6, -0.2, 0.75));
  return merge(parts);
}

function bodyGeo(): THREE.BufferGeometry {
  const [cx, cy, cz] = CEPH;
  const [ax, ay, az] = ABD;
  return merge([
    paint(blob(0.82, 0.62, 0.86, 14, 10).translate(cx, cy, cz), (p, _n, o) => o.copy(cPlum).lerp(cPlumLight, 0.3 * ramp(cy, cy + 0.6, p.y))),
    abdomenGeo().rotateX(ABD_TILT).translate(ax, ay, az),
    headGeo(),
  ]);
}

/** Одна нога: бедро от головогруди к колену, голень в полосатом чулке до тапочка (в осях модели) */
function legGeo(side: number, i: number): THREE.BufferGeometry {
  const hip = new THREE.Vector3(side * 0.62, CEPH[1] + 0.02, HIP_Z[i]);
  const foot = new THREE.Vector3(side * FOOT[i][0], 0.1, FOOT[i][1]);
  const knee = hip.clone().lerp(foot, 0.42).add(new THREE.Vector3(0, 1.62, 0));
  const femur = tube([hip.toArray(), hip.clone().lerp(knee, 0.5).add(new THREE.Vector3(0, 0.06, 0)).toArray(), knee.toArray()], (u) => 0.15 - 0.03 * u, 4, 5, false);
  const tibia = tube([knee.toArray(), knee.clone().lerp(foot, 0.5).add(new THREE.Vector3(side * 0.08, 0.05, 0)).toArray(), foot.toArray()], (u) => 0.11 - 0.04 * u, 5, 5, false);
  const len = knee.distanceTo(foot);
  return merge([
    paint(femur, (_p, _n, o) => o.setHex(PLUM)),
    paint(tibia, (p, _n, o) => {
      const d = p.distanceTo(knee) / len;
      o.setHex(Math.floor(d * 7) % 2 ? SOCK : CREAM);
    }),
    colored(new THREE.SphereGeometry(0.15, 6, 4).translate(knee.x, knee.y, knee.z), PLUM_DARK),
    colored(blob(0.13, 0.1, 0.2, 6, 4).translate(foot.x, 0.07, foot.z + 0.05), SLIPPER),
  ]);
}

/** Четвёрка ног: A — L1 R2 L3 R4, B — R1 L2 R3 L4 */
function legsGeo(first: number): THREE.BufferGeometry {
  return merge([0, 1, 2, 3].map((i) => legGeo((i % 2 === 0 ? 1 : -1) * first, i)));
}

/** Глаза (свечение): два больших за очками и четыре маленьких над ними */
function eyesGeo(hex: number, k: number, fwd: number): THREE.BufferGeometry {
  const [hx, hy, hz] = HEAD;
  const list: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    list.push(colored(blob(0.13 * k, 0.14 * k, 0.08 * k, 10, 7).translate(hx + s * 0.23, hy + 0.02, hz + 0.5 + fwd), hex));
    list.push(colored(blob(0.055 * k, 0.055 * k, 0.04 * k, 6, 4).translate(hx + s * 0.1, hy + 0.27, hz + 0.47 + fwd), hex));
    list.push(colored(blob(0.05 * k, 0.05 * k, 0.04 * k, 6, 4).translate(hx + s * 0.34, hy + 0.22, hz + 0.42 + fwd), hex));
  }
  return merge(list);
}

/** Окно: голубые сердечки — брошь на платке (видно сверху, когда висит) и поверх кремового на брюшке */
function heartsGeo(): THREE.BufferGeometry {
  const [hx, hy, hz] = HEAD;
  const brooch = colored(fan(heartOutline(0.3), (x, y, out) => out.set(x, y, 0), 3), CORE);
  brooch.rotateX(-0.75).translate(hx, hy + 0.55, hz + 0.42);
  const back = colored(fan(heartOutline(0.56).map(([x, y]) => [x, -y - 0.72] as [number, number]), (x, y, out) => abdTop(0.03)(x, y, out), 3, true), CORE);
  back.rotateX(ABD_TILT).translate(ABD[0], ABD[1], ABD[2]);
  return merge([brooch, back]);
}

const _frame = new THREE.Matrix4();
const _base = new THREE.Matrix4();
const _curl = new THREE.Matrix4();
const stepA = newStep();
const stepB = newStep();
const STEP = MOB_STRIDE * 0.5;

/** Рамка позы: u 0 — стоит на земле, 1 — висит на стене (поворот брюхом к камню, голова вверх); drop — вниз по миру */
function frameAt(u: number, drop: number, out: THREE.Matrix4): THREE.Matrix4 {
  return setBone(out, 0, HANG_TY * u - drop, HANG_TZ * u, (-Math.PI / 2) * u, 0, 0);
}

export const BOSS_WEAVER: MobDef = {
  id: 'boss-weaver',
  name: 'Ткачиха',
  kinds: [Z_WEAVER],
  height: 3.8,
  parts: [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'head', geo: eyesGeo(ARMY.eye, 1, 0), glow: true },
    { bone: 'legL', geo: legsGeo(1) },
    { bone: 'legR', geo: legsGeo(-1) },
    { bone: 'extra', geo: heartsGeo(), glow: true },
    // ярость: красные глаза поверх сиреневых
    { bone: 'wingL', geo: eyesGeo(RAGE_EYE, 1.12, 0.02), glow: true },
  ],
  pose(a: MobAnim, out: MobPose) {
    const t = a.t;
    const s = a.stT;
    const wall = ((a.flags ?? 0) & ZF_WV_WALL) !== 0;
    const w = walkAmount(a.speed, 0.8);
    // рамка: висит (на стене), лезет, перелезает; d — гибель
    let hang = wall ? 1 : 0;
    let legSy = 1;
    let bodyY = 0;
    let bodyZ = 0;
    let rx = 0;
    let ry = 0;
    let rz = 0;
    let sc = 1;
    let pivot: P3 = CEPH;
    // ноги: шаг четвёрок, подъём и поворот четвёрки вокруг бёдер (замах, вязание)
    let gaitP = a.gait;
    let stride = STEP;
    let lift = 0.22;
    let walkK = w;
    let aRx = 0;
    let aRy = 0;
    let bRx = 0;
    let bRy = 0;
    let open = false;

    switch (a.st) {
      case ZS_WV_CLIMB: {
        // лезет: из стойки поворачивается брюхом к стене, ноги перебирают
        const u = smooth(s / CLIMB_S);
        hang = u;
        gaitP = s * 1.4;
        walkK = 1 - 0.4 * u;
        lift = 0.18;
        break;
      }
      case ZS_WV_OVER: {
        // перелаз: подтянулась на бруствер (висит → стоит), прошла по стене, прыгнула во двор
        const u = s / OVER_S;
        hang = 1 - smooth(u / 0.45);
        gaitP = s * 1.6;
        walkK = u < 0.7 ? 1 : 0;
        if (u > 0.7) {
          const k = (u - 0.7) / 0.3;
          rx = 0.45 * Math.sin(Math.PI * Math.min(1, k * 1.2));
          legSy = 1 - 0.2 * Math.sin(Math.PI * k);
          aRx = bRx = -0.35 * Math.sin(Math.PI * k);
        }
        break;
      }
      case ZS_WV_SWEEP: {
        // хлёст: четвёрка A замахивается назад-вверх и дрожит; удар через край (или вокруг себя во дворе)
        const wind = ramp(0, 0.5, s) * (1 - ramp(WARN_S - 0.18, WARN_S - 0.08, s));
        const strike = ramp(WARN_S - 0.18, WARN_S - 0.06, s);
        aRx = -0.75 * wind + 0.8 * strike + Math.sin(t * 31) * 0.05 * wind;
        aRy = -0.35 * wind + 0.7 * strike;
        bRx = -0.2 * wind + 0.3 * strike;
        rx = -0.12 * wind + 0.12 * strike;
        ry = 0.12 * wind - 0.2 * strike;
        walkK = 0;
        break;
      }
      case ZS_WV_WEB: {
        // паутина: вяжет — четвёрки ног перебирают навстречу, брюшко качается; в конце — бросок клубка
        const knit = ramp(0, 0.3, s) * (1 - ramp(THROW_AT - 0.1, THROW_AT, s));
        const toss = ramp(THROW_AT - 0.06, THROW_AT + 0.04, s) * (1 - ramp(THROW_AT + 0.15, THROW_AT + 0.45, s));
        aRx = 0.16 * Math.sin(t * 14) * knit - 0.5 * toss;
        bRx = -0.16 * Math.sin(t * 14) * knit - 0.3 * toss;
        rz = 0.06 * Math.sin(t * 5) * knit;
        rx = -0.08 * knit + 0.28 * toss;
        bodyZ = 0.35 * toss;
        walkK = 0;
        break;
      }
      case ZS_WV_BROOD: {
        // кладка: раздувается и пульсирует всё чаще, в конце — сдувается
        const u = clamp01(s / WARN_S);
        const grow = ramp(0, WARN_S - 0.15, s) * (1 - ramp(WARN_S - 0.1, WARN_S + 0.1, s));
        sc = 1 + 0.22 * grow + 0.035 * Math.sin(s * (8 + 14 * u)) * grow;
        pivot = ABD;
        walkK = 0;
        break;
      }
      case ZS_WV_BITE: {
        // укус: встаёт на дыбы, передние ноги вверх, дрожит; бросок вперёд
        const rear = ramp(0, 1.2, s) * (1 - ramp(WARN_S - 0.16, WARN_S - 0.06, s));
        const lunge = ramp(WARN_S - 0.16, WARN_S - 0.04, s) * (1 - ramp(WARN_S + 0.1, WARN_S + 0.5, s));
        pivot = WAIST;
        rx = -0.55 * rear + 0.3 * lunge + Math.sin(t * 27) * 0.03 * rear;
        bodyZ = 0.6 * lunge;
        aRx = bRx = -0.4 * rear + 0.35 * lunge;
        walkK = 0;
        break;
      }
      case ZS_BOSS_OPEN: {
        // открыта: обмякла, тяжело дышит, горят сердечки
        open = true;
        bodyY = -0.18;
        sc = 1 + 0.03 * Math.sin(t * 4.4);
        pivot = ABD;
        legSy = 0.92;
        walkK = 0;
        break;
      }
    }
    if (a.rage) {
      // ярость: ноги дёргаются
      aRx += 0.06 * Math.sin(t * 23);
      bRx += 0.06 * Math.sin(t * 19 + 1);
    }
    const j = jolt(a.hit);
    rx -= 0.15 * j;
    bodyZ -= 0.12 * j;

    // гибель: падает со стены, переворачивается на спину, поджимает и дрыгает ногами, уходит в землю
    const d = a.die;
    let flip = 0;
    let curl = 0;
    let sink = 0;
    let drop = 0;
    if (d > 0) {
      const off = ramp(0, 0.25, d);
      drop = hang > 0 ? WV_HANG_Y * off : 0;
      hang *= 1 - off;
      flip = ramp(0.12, 0.5, d);
      curl = ramp(0.2, 0.55, d);
      sink = ramp(0.7, 1, d);
      rx *= 1 - flip;
      ry *= 1 - flip;
      walkK = 0;
    }

    // рамка и тело
    frameAt(hang, drop + 1.6 * sink, _frame);
    bodyY += HANG_BODY * hang;
    legSy *= 1 - (1 - HANG_LEG) * hang;
    const bob = 0.05 * Math.abs(Math.sin(TAU * gaitP)) * walkK;
    if (flip > 0) {
      // на спину: поворот вокруг оси вдоль тела, брюшко ложится на землю
      setPivot(out.body, _frame, CEPH[0], CEPH[1], CEPH[2], 0, bodyY - 0.55 * flip, bodyZ, rx, ry, Math.PI * flip, sc, sc, sc);
    } else {
      setPivot(out.body, _frame, pivot[0], pivot[1], pivot[2], 0, bodyY + bob, bodyZ, rx, ry, rz, sc, sc, sc);
    }
    // ноги: шаг четвёрок (стопы не скользят), в висе — шаг меньше
    const k = walkK * (1 - 0.6 * hang);
    stepAt(gaitP, 0.5, stride * k, lift * k, stepA);
    stepAt(gaitP + 0.5, 0.5, stride * k, lift * k, stepB);
    if (d > 0 && flip > 0) {
      // ноги вместе с телом, поджаты к бёдрам и дрыгаются
      const kick = Math.sin(t * 17) * 0.25 * ramp(0.45, 0.6, d) * (1 - ramp(0.8, 0.95, d));
      const sq = 1 - 0.55 * curl;
      setPivot(_curl, out.body, CEPH[0], CEPH[1], CEPH[2], 0, 0, 0, -0.5 * curl + kick, 0, 0, sq, sq, sq);
      out.legL.copy(_curl);
      setPivot(out.legR, out.body, CEPH[0], CEPH[1], CEPH[2], 0, 0, 0, -0.5 * curl - kick, 0, 0, sq, sq, sq);
    } else {
      setChildS(_base, _frame, 0, stepA.up, stepA.dz, 0, 0, 0, 1, legSy, 1);
      setPivot(out.legL, _base, CEPH[0], CEPH[1], CEPH[2], 0, 0, 0, aRx, aRy, 0);
      setChildS(_base, _frame, 0, stepB.up, stepB.dz, 0, 0, 0, 1, legSy, 1);
      setPivot(out.legR, _base, CEPH[0], CEPH[1], CEPH[2], 0, 0, 0, bRx, bRy, 0);
    }
    // глаза моргают; ярость — красные поверх; окно — голубые сердечки
    const blink = (t + a.seed * 7) % 3.7 < 0.12 ? 0.15 : 1;
    setPivot(out.head, out.body, HEAD[0], HEAD[1] + 0.1, HEAD[2] + 0.5, 0, 0, 0, 0, 0, 0, 1, blink, 1);
    if (a.rage && d < 0.5) setPivot(out.wingL, out.body, HEAD[0], HEAD[1] + 0.1, HEAD[2] + 0.5, 0, 0, 0, 0, 0, 0, 1, blink, 1);
    else hide(out.wingL, out.body, HEAD[0], HEAD[1], HEAD[2]);
    if (open && d === 0) {
      const pulse = 1 + 0.04 * Math.sin(t * 6);
      setPivot(out.extra, out.body, CEPH[0], CEPH[1], CEPH[2], 0, 0, 0, 0, 0, 0, pulse, pulse, pulse);
    } else hide(out.extra, out.body, CEPH[0], CEPH[1], CEPH[2]);
  },
};
