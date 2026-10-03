// Король-Тыква (Z_PUMPKIN) — босс 28, 70, 112 … Огромная рыжая тыква-фонарь: рёбра, вырезанное лицо светится изнутри
// сиреневым, крышка-шапка с черешком, листьями и кривой золотой короной, вместо рук — две плети с листьями и усиками,
// пятна и потёки варенья. Скачет, как мяч: прыжок на шаг, сплющивается при приземлении, плети машут.
// Атаки (у каждой метка — полное предупреждение, позу видно со стены):
//   тыквята (ZS_PK_SUMMON) — трясётся, плети вверх и вьются, крышка подпрыгивает; в конце — хлоп;
//   перекат (ZS_PK_ROLL_WARN) — плети обнимают бока, раскачивается взад-вперёд всё сильнее, приседает;
//     ZS_PK_ROLL — катится колесом (поворот — по скорости переката, в ярости быстрее);
//   семечки (ZS_PK_SPIT) — надувается и откидывается, крышка приподнята; рывок вперёд — плевок (когда семечки
//     вылетают: за PK_SPIT_FLIGHT тиков до удара).
// Открыт (ZS_BOSS_OPEN) — крышка взлетает и висит над ним набекрень: видно голубое ядро в мякоти; тыква качается,
// плети висят. Ярость — лицо горит оранжевым, крышка дребезжит, как на кипящей кастрюле. Вздрагивает от попаданий.
// Гибель — крышка с короной улетает кувырком и падает за спиной вверх дном, тыква лопается в лепёшку и уходит в землю.
import * as THREE from 'three';
import { BOSS_WARN_TICKS, ZS_BOSS_OPEN, ZS_PK_ROLL, ZS_PK_ROLL_WARN, ZS_PK_SPIT, ZS_PK_SUMMON } from '../../../shared/fort.ts';
import { PK_ROLL_SPEED, PK_SPIT_FLIGHT } from '../../../shared/fortbosses.ts';
import { TICK_RATE } from '../../../shared/constants.ts';
import { Z_PUMPKIN } from '../../../shared/fortkinds.ts';
import { ARMY, colored, merge, setChild, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import {
  TAU, backOut, blob, clamp01, fan, hide, jamDrip, jamSpot, jolt, lathe, mirrorX, mix, paint, ramp, setPivot, strip, tube,
  walkAmount,
} from './set-f-shapes.ts';

const ORANGE = 0xec8a2f;
const ORANGE_LIGHT = 0xffb455;
const ORANGE_DARK = 0xb8561a;
const CARVE = 0x4a2410;
const FLESH = 0xf8c95e;
const FLESH_DARK = 0xd99a3c;
const SEED = 0xfff1cc;
const STEM = 0x7a8a34;
const STEM_DARK = 0x56621f;
const LEAF = 0x5e9c3a;
const LEAF_LIGHT = 0x9ccc62;
const GOLD = 0xf4c24c;
const GOLD_DARK = 0xc48f2a;
const CORE = 0x63ecf7;
const RAGE = 0xff7418;

/** Тыква — сплюснутый шар с рёбрами: экватор R, полувысота H, центр на высоте C; крышка срезана на Y_CUT */
const R = 2.15;
const H = 1.7;
const C = 1.75;
const Y_CUT = 3.1;
/** Глубина рёбер (доля радиуса) и их число — 8, ребро спереди по центру (там лицо); колонок сетки по кругу */
const RIB = 0.065;
const SEG = 40;
/** Катится: центр шара на этой высоте, радиус качения — по нему поворот */
const ROLL_C = 1.95;
const ROLL_R = 1.95;
/** Метка — полное предупреждение, с; семечки вылетают за PK_SPIT_FLIGHT тиков до удара */
const WARN_S = BOSS_WARN_TICKS / TICK_RATE;
const SPIT_AT = (BOSS_WARN_TICKS - PK_SPIT_FLIGHT) / TICK_RATE;
/** Плети растут из боков здесь (левая, +X; правая — зеркально) */
const VINE_X = 2.02;
const VINE_Y = 2.0;
const VINE_Z = 0.1;

function rib(theta: number): number {
  return 1 - RIB + RIB * Math.sqrt(Math.abs(Math.cos(4 * theta)));
}

/** Радиус шара (без рёбер) на высоте y */
function ringR(y: number): number {
  const c = (y - C) / H;
  return R * Math.sqrt(Math.max(0, 1 - c * c));
}

/** Точка поверхности тыквы под углом theta (0 — спереди, +X — слева у модели) на высоте y, наружу на off */
function surf(theta: number, y: number, off: number, out = new THREE.Vector3()): THREE.Vector3 {
  const r = ringR(y) * rib(theta) + off;
  return out.set(r * Math.sin(theta), y, r * Math.cos(theta));
}

/** Точка лица: (x, y) на передней поверхности с рёбрами, наружу на off */
function face(off: number): (x: number, y: number, out: THREE.Vector3) => void {
  return (x, y, out) => {
    const r0 = ringR(y);
    let th = Math.atan2(x, Math.max(0.05, r0));
    for (let i = 0; i < 4; i++) th = Math.asin(Math.max(-1, Math.min(1, x / Math.max(0.05, r0 * rib(th)))));
    surf(th, y, off, out);
  };
}

/** Рёбра тыквы: сжать к оси между рёбрами */
function ribbed(p: THREE.Vector3): void {
  const k = rib(Math.atan2(p.x, p.z));
  p.x *= k;
  p.z *= k;
}

/** Профиль шара по углу от низа: от phi0 до phi1, n рядов, с добавочными рядами у среза (резкая прорезь) */
function profile(phi0: number, phi1: number, n: number, extra: number[] = []): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const phis: number[] = [];
  for (let i = 0; i <= n; i++) phis.push(phi0 + ((phi1 - phi0) * i) / n);
  phis.push(...extra);
  phis.sort((a, b) => a - b);
  for (const phi of phis) out.push([R * Math.sin(phi), C - H * Math.cos(phi)]);
  return out;
}

const PHI_CUT = Math.acos((C - Y_CUT) / H);
/** Угол шара на высоте y */
const phiAt = (y: number) => Math.acos(Math.max(-1, Math.min(1, (C - y) / H)));

const cOrange = new THREE.Color(ORANGE);
const cLight = new THREE.Color(ORANGE_LIGHT);
const cDark = new THREE.Color(ORANGE_DARK);
const cCarve = new THREE.Color(CARVE);

/** Рыжая кожура: светлее на рёбрах, темнее в бороздах и книзу; у прорези крышки — тёмный вырез */
function skin(p: THREE.Vector3, _n: THREE.Vector3, o: THREE.Color, cutY: number): void {
  const rf = Math.sqrt(Math.abs(Math.cos(4 * Math.atan2(p.x, p.z))));
  o.copy(cDark).lerp(cLight, 0.1 + 0.9 * rf).lerp(cOrange, 0.35);
  o.lerp(cDark, 0.55 * ramp(0.95, 0.1, p.y));
  if (Math.abs(p.y - cutY) < 0.075) o.copy(cCarve);
}

/** Вырезы лица: глаза-треугольники, нос, улыбка с зубами (контуры по (x, y) на передней поверхности) */
const EYE_L: ReadonlyArray<readonly [number, number]> = [[0.32, 2.4], [1.04, 2.4], [0.68, 3.0]];
const NOSE: ReadonlyArray<readonly [number, number]> = [[-0.18, 2.0], [0.18, 2.0], [0, 2.27]];
const MOUTH_X = 1.22;

function scaled(shape: ReadonlyArray<readonly [number, number]>, k: number): Array<[number, number]> {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of shape) {
    cx += x;
    cy += y;
  }
  cx /= shape.length;
  cy /= shape.length;
  return shape.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}

/** Рот: верх и низ по колонкам; teeth — зубы (сверху два, снизу один); grow — шире (контур, ярость) */
function mouth(grow: number, teeth: boolean): { top: Array<[number, number]>; bottom: Array<[number, number]> } {
  const top: Array<[number, number]> = [];
  const bottom: Array<[number, number]> = [];
  const half = MOUTH_X + grow;
  for (let i = 0; i <= 24; i++) {
    const x = -half + (2 * half * i) / 24;
    const u = x / half;
    let yt = 1.66 + 0.3 * u * u + grow;
    let yb = 1.22 + 0.74 * u * u - grow;
    if (teeth && Math.abs(Math.abs(x) - 0.45) < 0.14) yt -= 0.18;
    if (teeth && Math.abs(x) < 0.1) yb += 0.16;
    if (yb > yt) yb = yt;
    top.push([x, yt]);
    bottom.push([x, yb]);
  }
  return { top, bottom };
}

/** Лицо целиком (глаза, нос, рот): k — масштаб контуров, off — насколько над кожурой, grow — шире рот, div — дробление */
function faceGeo(k: number, off: number, grow: number, hex: number, div: number): THREE.BufferGeometry {
  const map = face(off);
  const eyeR = EYE_L.map(([x, y]) => [-x, y] as [number, number]).reverse();
  const m = mouth(grow, true);
  return merge([
    colored(fan(scaled(EYE_L, k), map, div), hex),
    colored(fan(scaled(eyeR, k), map, div), hex),
    colored(fan(scaled(NOSE, k), map, 2), hex),
    colored(strip(m.top, m.bottom, map), hex),
  ]);
}

function bodyGeo(): THREE.BufferGeometry {
  const pumpkin = paint(lathe([[0, C - H], ...profile(0.06, PHI_CUT, 14, [phiAt(Y_CUT - 0.07)])], SEG, ribbed), (p, n, o) => skin(p, n, o, Y_CUT));
  // мякоть под крышкой: срез с семечками (видно, когда крышка открыта)
  const flesh = paint(lathe([[ringR(Y_CUT) * 0.995, Y_CUT - 0.03], [0, Y_CUT - 0.03]], SEG, ribbed), (p, _n, o) => {
    o.setHex(FLESH).lerp(new THREE.Color(FLESH_DARK), ramp(0.5, 1.1, Math.hypot(p.x, p.z)));
  });
  const parts: THREE.BufferGeometry[] = [pumpkin, flesh];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    const r = 0.62 + 0.12 * (i % 2);
    const seed = blob(0.07, 0.03, 0.13, 5, 3);
    seed.rotateY(a);
    parts.push(colored(seed.translate(Math.sin(a) * r, Y_CUT - 0.01, Math.cos(a) * r), SEED));
  }
  // тёмные края вырезов лица (само свечение — отдельной частью)
  parts.push(faceGeo(1.14, 0.012, 0.06, CARVE, 3));
  // пятна и потёки варенья
  for (const [th, y, r] of [[1.15, 2.6, 0.26], [-1.45, 1.45, 0.3], [2.3, 2.1, 0.28], [-2.5, 2.75, 0.24], [0.98, 0.85, 0.2], [-0.92, 2.95, 0.16], [3.0, 1.2, 0.3]] as const) {
    const p = surf(th, y, 0.01);
    const n = new THREE.Vector3(p.x / (R * R), (p.y - C) / (H * H), p.z / (R * R));
    parts.push(jamSpot(p.x, p.y, p.z, r, n.x, n.y, n.z, th > 2 ? ARMY.jamDark : ARMY.jam));
  }
  for (const [th, len, r] of [[0.62, 0.55, 0.06], [-0.78, 0.4, 0.05], [1.9, 0.7, 0.065], [-2.2, 0.5, 0.055], [2.8, 0.45, 0.05]] as const) {
    const pts: Array<[number, number, number]> = [];
    for (let k = 0; k <= 3; k++) {
      const v = surf(th, Y_CUT - 0.05 - (len * k) / 3, 0.03);
      pts.push([v.x, v.y, v.z]);
    }
    parts.push(jamDrip(pts, r));
  }
  return merge(parts);
}

/** Крышка в осях кости: начало — центр среза; черешок, листья, корона набекрень, потёк варенья */
function lidGeo(): THREE.BufferGeometry {
  const top = C + H - Y_CUT;
  const shell = lathe(profile(PHI_CUT, Math.PI, 5).map(([r, y]) => [r, y - Y_CUT] as [number, number]), SEG, (p) => {
    ribbed(p);
    // ямка у черешка
    p.y -= 0.09 * (1 - ramp(0, 0.45, Math.hypot(p.x, p.z)));
  });
  const parts: THREE.BufferGeometry[] = [
    paint(shell, (p, n, o) => skin(p, n, o, 0)),
    // изнанка крышки — мякоть (видно, когда крышка висит над ним)
    paint(lathe([[0, 0.004], [ringR(Y_CUT) * 0.995, 0.004]], SEG, ribbed), (_p, _n, o) => o.setHex(FLESH_DARK)),
  ];
  // черешок
  parts.push(paint(tube([[0, top - 0.12, 0], [0.02, top + 0.12, 0], [0.1, top + 0.36, -0.04], [0.26, top + 0.5, -0.12]], (u) => 0.21 - 0.08 * u, 6, 7, true), (p, _n, o) => {
    o.setHex(STEM).lerp(new THREE.Color(STEM_DARK), 0.5 + 0.5 * Math.sin(Math.atan2(p.x, p.z) * 5));
  }));
  // листья у черешка
  for (const [x, z, ry, rz] of [[-0.42, 0.3, 0.7, 0.18], [0.46, -0.28, -0.9, -0.2]] as const) {
    const leaf = paint(blob(0.46, 0.05, 0.3, 9, 5), (p, _n, o) => {
      o.setHex(LEAF).lerp(new THREE.Color(LEAF_LIGHT), Math.abs(p.z) < 0.04 ? 0.8 : 0.15 * (1 - Math.abs(p.x) / 0.46));
    });
    parts.push(leaf.rotateZ(rz).rotateY(ry).translate(x, top - 0.08, z));
  }
  // корона набекрень: обруч, пять зубцов с ягодками, камень спереди
  const crown: THREE.BufferGeometry[] = [
    paint(lathe([[0.6, 0], [0.68, 0.3], [0.62, 0.3], [0.56, 0]], 16), (p, _n, o) => o.setHex(p.y > 0.26 || p.y < 0.04 ? GOLD_DARK : GOLD)),
    colored(new THREE.SphereGeometry(0.12, 8, 5).scale(1, 1, 0.6).translate(0, 0.15, 0.65), ARMY.jam),
  ];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    crown.push(colored(new THREE.ConeGeometry(0.13, 0.42, 4).translate(Math.sin(a) * 0.64, 0.5, Math.cos(a) * 0.64), GOLD));
    crown.push(colored(new THREE.SphereGeometry(0.08, 6, 4).translate(Math.sin(a) * 0.64, 0.75, Math.cos(a) * 0.64), ARMY.jamLight));
  }
  parts.push(merge(crown).rotateX(-0.12).rotateZ(0.2).translate(0.06, top - 0.2, 0.04));
  // варенье стекает из-под короны по крышке
  const drip: Array<[number, number, number]> = [];
  for (let k = 0; k <= 3; k++) {
    const r = 0.5 + k * 0.17;
    const y = C + H * Math.sqrt(Math.max(0, 1 - (r / R) ** 2)) - Y_CUT - 0.05;
    drip.push([r * Math.sin(0.5), y + 0.03, r * Math.cos(0.5)]);
  }
  parts.push(jamDrip(drip, 0.06));
  return merge(parts);
}

/** Плеть (левая, +X) в осях кости: начало — место на боку; завиток на конце, два листа и усик */
function vineGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    paint(tube([[0, 0, 0], [0.5, 0.12, 0.1], [0.95, 0.42, 0.2], [1.22, 0.88, 0.2], [1.18, 1.3, 0.1], [0.92, 1.47, 0], [0.72, 1.32, 0.02], [0.78, 1.13, 0.05]],
      (u) => 0.14 - 0.09 * u, 26, 6, true), (p, _n, o) => {
      o.setHex(STEM).lerp(new THREE.Color(STEM_DARK), 0.35 + 0.35 * Math.sin((p.x + p.y) * 11));
    }),
    // усик — спиралька
    paint(tube(Array.from({ length: 9 }, (_, i) => {
      const a = i * 0.9;
      const r = 0.24 * (1 - i / 11);
      return [1.0 + 0.22 * Math.sin(i * 0.35) + r * Math.cos(a), 0.4 - i * 0.07, 0.42 + r * Math.sin(a)] as [number, number, number];
    }), () => 0.028, 14, 4, true), (_p, _n, o) => o.setHex(LEAF_LIGHT)),
  ];
  for (const [x, y, z, rx, ry, rz, k] of [[0.62, 0.05, 0.42, 0.5, 0.4, -0.5, 1], [1.42, 1.0, -0.12, -0.3, -0.6, 0.9, 0.85]] as const) {
    const leaf = paint(blob(0.52 * k, 0.05, 0.4 * k, 10, 5), (p, _n, o) => {
      // лист тыквы: светлые прожилки звездой, края темнее
      const a = Math.atan2(p.z, p.x);
      const vein = Math.abs(Math.sin(a * 2.5)) < 0.18 ? 0.7 : 0;
      o.setHex(LEAF).lerp(new THREE.Color(LEAF_LIGHT), Math.max(vein, 0.25 * (1 - Math.hypot(p.x / 0.52, p.z / 0.4))));
    });
    parts.push(leaf.rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z));
  }
  parts.push(jamSpot(0.62, 0.1, 0.44, 0.12, 0.3, 1, 0.2, ARMY.jamLight));
  return merge(parts);
}

/** Свечение: лицо сиреневым и голубое ядро в мякоти под крышкой (видно только при открытой крышке) */
function glowGeo(): THREE.BufferGeometry {
  return merge([
    faceGeo(1, 0.03, 0, ARMY.eye, 4),
    colored(new THREE.SphereGeometry(0.58, 14, 8).scale(1, 0.38, 1).translate(0, Y_CUT - 0.02, 0), CORE),
  ]);
}

const ID = new THREE.Matrix4();

export const BOSS_PUMPKIN: MobDef = {
  id: 'boss-pumpkin',
  name: 'Король-Тыква',
  kinds: [Z_PUMPKIN],
  height: 4.0,
  parts: [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'head', geo: lidGeo() },
    { bone: 'armL', geo: vineGeo() },
    { bone: 'armR', geo: mirrorX(vineGeo()) },
    { bone: 'extra', geo: glowGeo(), glow: true },
    // ярость: лицо горит оранжевым поверх сиреневого (чуть больше и над ним)
    { bone: 'wingL', geo: faceGeo(1.08, 0.05, 0.03, RAGE, 3), glow: true },
  ],
  pose(a: MobAnim, out: MobPose) {
    const t = a.t;
    const w = walkAmount(a.speed, 0.6);
    const p = a.gait - Math.floor(a.gait);
    // прыжок на каждый шаг: в воздухе вытянут, при приземлении сплющен
    const air = Math.sin(Math.PI * p);
    const land = Math.pow(1 - air, 6) * w;
    let y = 0.34 * Math.pow(air, 0.8) * w;
    let sy = 1 - 0.12 * land + 0.07 * air * w + 0.018 * Math.sin(t * 2.2 + a.seed * 6) * (1 - w);
    let sxz = 1;
    let rx = (0.05 + 0.06 * Math.cos(TAU * p)) * w;
    let ry = 0;
    let rz = 0.035 * Math.sin(t * 1.4 + a.seed * 4) * (1 - w) + 0.05 * Math.sin(TAU * p) * w;
    let pivotY = 0;
    let lidUp = 0;
    let lidRx = 0;
    let lidRy = 0;
    let lidRz = 0;
    // плети: мах вперёд-назад навстречу друг другу, в прыжке взлетают
    const swing = 0.32 * Math.sin(TAU * p) * w;
    let vxL = swing + 0.05 * Math.sin(t * 1.9);
    let vxR = -swing + 0.05 * Math.sin(t * 1.7 + 1);
    let vzL = -0.25 + 0.4 * air * w + 0.06 * Math.sin(t * 1.6);
    let vzR = -0.25 + 0.4 * air * w + 0.06 * Math.sin(t * 1.5 + 2);
    let vy = 0;
    let vs = 1;
    const s = a.stT;

    switch (a.st) {
      case ZS_PK_SUMMON: {
        // тыквята: трясётся всё сильнее, плети вверх и вьются, крышка подпрыгивает; в конце — хлоп
        const u = clamp01(s / WARN_S);
        const up = ramp(0, 0.35, s);
        rz += Math.sin(t * 26) * 0.05 * u;
        ry += Math.sin(t * 19) * 0.035 * u;
        sy *= 1 - 0.07 * u + 0.045 * Math.sin(t * 13) * u;
        vzL = mix(vzL, 1.3, up) + Math.sin(t * 11) * 0.28 * u;
        vzR = mix(vzR, 1.3, up) + Math.sin(t * 11 + 1.6) * 0.28 * u;
        vxL = vxR = -0.35 * up + Math.sin(t * 8) * 0.2 * u;
        lidUp = 0.07 * Math.abs(Math.sin(t * 24)) * (0.3 + u);
        lidRz = Math.sin(t * 17) * 0.06 * u;
        const pop = ramp(WARN_S - 0.22, WARN_S - 0.06, s) * (1 - ramp(WARN_S - 0.06, WARN_S + 0.25, s));
        sy -= 0.14 * pop;
        sxz += 0.07 * pop;
        break;
      }
      case ZS_PK_ROLL_WARN: {
        // перекат: плети обнимают бока, раскачивается взад-вперёд всё сильнее, приседает перед рывком
        const u = clamp01(s / WARN_S);
        const k = ramp(0, 0.4, s);
        vzL = mix(vzL, -0.55, k);
        vzR = mix(vzR, -0.55, k);
        vxL = mix(vxL, 0.1, k);
        vxR = mix(vxR, 0.1, k);
        vy = 0.9 * k;
        vs = 1 - 0.5 * k;
        rx = -0.13 * Math.sin(s * (5 + 8 * u)) * (0.35 + u) - 0.08 * u;
        sy = mix(sy, 0.86, k * (0.4 + 0.6 * u));
        sxz = mix(1, 1.05, k * u);
        break;
      }
      case ZS_PK_ROLL: {
        // катится колесом вокруг центра шара (почти круглый — свернулся), плети прижаты
        const k = ramp(0, 0.15, s);
        pivotY = C;
        y = (ROLL_C - C) * k;
        rx = (s * PK_ROLL_SPEED * (a.rage ? 1.25 : 1)) / ROLL_R;
        sy = mix(0.86, 1.1, k);
        sxz = mix(1.05, 0.95, k);
        rz = 0;
        vzL = vzR = -0.55;
        vxL = vxR = 0.1;
        vy = 0.9;
        vs = 0.5;
        break;
      }
      case ZS_PK_SPIT: {
        // семечки: надувается и откидывается, потом рывок вперёд — плевок
        const inflate = ramp(0, SPIT_AT - 0.1, s) * (1 - ramp(SPIT_AT, SPIT_AT + 0.12, s));
        const lurch = ramp(SPIT_AT - 0.06, SPIT_AT + 0.04, s) * (1 - ramp(SPIT_AT + 0.12, SPIT_AT + 0.5, s));
        sy *= 1 + 0.1 * inflate - 0.07 * lurch;
        sxz = 1 + 0.08 * inflate;
        rx = -0.24 * inflate + 0.34 * lurch;
        lidUp = 0.12 * inflate;
        lidRx = -0.16 * inflate;
        vzL = mix(vzL, 0.75, inflate) - 0.7 * lurch;
        vzR = mix(vzR, 0.75, inflate) - 0.7 * lurch;
        vxL = vxR = -0.45 * inflate + 0.95 * lurch;
        break;
      }
      case ZS_BOSS_OPEN: {
        // открыт: крышка взлетела и висит набекрень (голубое ядро видно), тыква качается, плети висят
        const k = backOut(s / 0.45);
        lidUp = 1.1 * k + 0.08 * Math.sin(t * 3.1);
        lidRx = -0.55 * k + 0.08 * Math.sin(t * 2.3);
        lidRz = 0.25 * k + 0.1 * Math.sin(t * 1.7);
        lidRy = 0.6 * Math.sin(t * 0.9) * k;
        rz = 0.07 * Math.sin(t * 2.6);
        ry = 0.1 * Math.sin(t * 1.3);
        vzL = mix(vzL, -0.95, k);
        vzR = mix(vzR, -0.95, k);
        vxL = vxR = 0.25 * k;
        break;
      }
    }
    // ярость: крышка дребезжит, как на кипящей кастрюле
    if (a.rage && a.st !== ZS_BOSS_OPEN && a.st !== ZS_PK_ROLL && a.st !== ZS_PK_ROLL_WARN) {
      lidUp += 0.08 * Math.abs(Math.sin(t * 21));
      lidRz += 0.05 * Math.sin(t * 15);
    }
    const j = jolt(a.hit);
    rx -= 0.18 * j;
    sy -= 0.07 * j;

    // гибель: тыква лопается в лепёшку и уходит в землю, плети шлёпаются
    const d = a.die;
    if (d > 0) {
      const sq = ramp(0.04, 0.28, d);
      const bounce = Math.sin(ramp(0.28, 0.55, d) * Math.PI) * 0.12;
      sy = mix(sy, 0.2, sq) + bounce;
      sxz = mix(sxz, 1.5, sq) - bounce * 0.5;
      rx *= 1 - sq;
      rz *= 1 - sq;
      y = y * (1 - sq) - 1.15 * ramp(0.6, 1, d);
      pivotY *= 1 - sq;
      vzL = mix(vzL, -0.15, sq);
      vzR = mix(vzR, -0.15, sq);
      vxL = vxR = 0;
    }
    setPivot(out.body, ID, 0, pivotY, 0, 0, y, 0, rx, ry, rz, sxz, sy, sxz);
    out.extra.copy(out.body);
    if (d > 0.6) hide(out.extra, out.body, 0, C, 0);
    if (a.rage && d < 0.6) out.wingL.copy(out.body);
    else hide(out.wingL, out.body, 0, C, 0);
    if (d > 0) {
      // крышка с короной улетает кувырком назад-вверх и падает вверх дном за спиной
      const f = ramp(0, 0.82, d);
      const ly = Y_CUT * (1 - f) + 0.3 * f + 9 * f * (1 - f);
      setChild(out.head, ID, 0.9 * f, ly, -3.3 * f, -3 * Math.PI * f, 1.3 * f, 0.45 * f);
    } else {
      setChild(out.head, out.body, 0, Y_CUT + lidUp, 0, lidRx, lidRy, lidRz);
    }
    setChild(out.armL, out.body, VINE_X, VINE_Y, VINE_Z, vxL, vy, vzL, vs);
    setChild(out.armR, out.body, -VINE_X, VINE_Y, VINE_Z, vxR, -vy, -vzR, vs);
  },
};
