// Кракен — супер-босс каждой 25-й волны (Z_KRAKEN): огромная голова-осьминог в капитанской треуголке с золотым кантом,
// банкой варенья и сиреневым пером; глаза-плошки светятся сиреневым, ухмылка с золотым зубом, в правом щупальце —
// подзорная труба. Корень — низ головы (как низ хитбокса у крепости), смотрит по +Z; веки «домиком» — хитрый и злой.
// В бухте крепость держит корень под водой (в засаде над водой купол и глаза, оглушён — всплывает по рот), нырок и
// всплытие — движением корня. Нырок (ZS_KRAKEN_DIVE) — зажмурился, вытянулся, шляпа подлетает; если крепость передаёт
// уровень воды (anim.water), шляпа остаётся плавать на волнах, пока голова под водой. Плевок (ZS_KRAKEN_SPIT) —
// раздувается, откидывается, щурится и плюёт вперёд. «Открыт» (ZS_BOSS_OPEN) — оглушён: глаза настежь, качается,
// шляпа набекрень, щупальца повисли. Ярость (ZF_RAGE) — шляпа подпрыгивает, как крышка на кипящей кастрюле, веки
// злее, щупальца молотят. Гибель — шляпа слетает и шлёпается в воду, голова кружится и уходит в глубину.
import * as THREE from 'three';
import { ZS_ATTACK, ZS_BOSS_OPEN, ZS_KRAKEN_DIVE, ZS_KRAKEN_SPIT, Z_KRAKEN } from '../../../shared/fort.ts';
import { colored, merge, setBone, setBoneS, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import { flipWinding } from './crew-crab.ts';
import { blob, curve, jamDrop, jamSpot, mergeColored, paint, smooth, tricorn, tube } from './sea-shapes.ts';

const SKIN = 0x7d3f8c;
const SKIN_LIGHT = 0xb06ac0;
const BELLY = 0xe8a3d6;
const JAM = 0x4b1d5e;
const EYE = 0x9a63ff;
const PUPIL = 0x22102c;
const FELT = 0x2b2230;
const GOLD = 0xe1b84a;

/** Глаза: центры (±EYE_X, EYE_Y, EYE_Z), радиус; ось век проходит через оба центра */
const EYE_X = 1.0;
const EYE_Y = 2.95;
const EYE_R = 0.62;
/** Голова откинута назад: вершина отъезжает к −Z */
const LEAN = 0.12;
const lean = (y: number) => -LEAN * Math.max(0, y - 1.5);
/** Профиль головы (радиус, высота) снизу вверх */
const PROFILE: ReadonlyArray<readonly [number, number]> = [
  [2.55, -1.3], [2.82, -0.45], [2.94, 0.45], [2.9, 1.35], [2.72, 2.25], [2.42, 3.05], [1.95, 3.72], [1.36, 4.18], [0.66, 4.47], [0.001, 4.57],
];
function radiusAt(y: number): number {
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [r0, y0] = PROFILE[i];
    const [r1, y1] = PROFILE[i + 1];
    if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 0;
}
/** Точка на передней поверхности головы при данных x, y (z — наружу) */
function front(x: number, y: number, out = 0): THREE.Vector3 {
  const r = radiusAt(y) + out;
  return new THREE.Vector3(x, y, Math.sqrt(Math.max(0, r * r - x * x)) + lean(y));
}
const EYE_C = front(EYE_X, EYE_Y, 0.12);
const EYE_Z = EYE_C.z;
/** Шляпа: точка посадки на макушке */
const HAT_Y = 4.36;
const HAT_Z = lean(HAT_Y) + 0.22;
/** Плавающая шляпа: поля чуть ниже уровня воды */
const FLOAT_Y = -0.1;
/** Корни больших щупалец (в воде по бокам, ближе к переду) */
const ARM_ROOT = [2.45, -0.45, 1.25] as const;

function mantleGeo(): THREE.BufferGeometry {
  const SEG = 26;
  const lathe = new THREE.LatheGeometry(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), SEG);
  const pos = lathe.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) + lean(pos.getY(i)));
  lathe.computeVertexNormals();
  // шов вращения проходит посередине лица (+Z): первый и последний столбцы — одни и те же точки, сглаживаем нормали
  const nor = lathe.getAttribute('normal');
  const v = new THREE.Vector3();
  for (let j = 0; j < PROFILE.length; j++) {
    const b = SEG * PROFILE.length + j;
    v.set(nor.getX(j) + nor.getX(b), nor.getY(j) + nor.getY(b), nor.getZ(j) + nor.getZ(b)).normalize();
    nor.setXYZ(j, v.x, v.y, v.z);
    nor.setXYZ(b, v.x, v.y, v.z);
  }
  const spots = [-1.6, 3.4, -1.2, 0.8, 1.4, 3.7, -0.9, 0.7, 2.3, 1.6, -1.2, 0.75, -2.0, 1.0, 1.6, 0.8, 0.4, 4.1, 0.5, 0.55, 2.4, 2.5, 0.8, 0.6,
    -1.35, 3.75, 1.25, 0.5, 1.75, 3.45, 1.25, 0.42, -2.45, 2.2, 0.9, 0.45];
  const light = new THREE.Color(SKIN_LIGHT);
  const belly = new THREE.Color(BELLY);
  const jam = new THREE.Color(JAM);
  const cheek = new THREE.Color(0xf08ccf);
  const head = paint(lathe, (p, n, o) => {
    o.setHex(SKIN);
    // светлее книзу и спереди, розовое «лицо» и щёки
    o.lerp(light, smooth(0.1, 0.8, n.z) * smooth(3.4, 1.2, p.y));
    if (p.y < 0.9) o.lerp(belly, smooth(0.9, -0.2, p.y) * smooth(0.0, 0.7, n.z));
    const ck = Math.min(1, Math.hypot(Math.abs(p.x) - 1.6, (p.y - 1.8) * 1.3) / 0.62);
    if (n.z > 0.2) o.lerp(cheek, (1 - ck * ck) * 0.95);
    const j = jamSpot(p, spots);
    if (j > 0) o.lerp(jam, smooth(0.05, 0.4, j));
  });
  const parts: THREE.BufferGeometry[] = [head];
  // ухмылка: тёмная дуга, уголки вверх; золотой зуб
  const smile: THREE.Vector3[] = [];
  for (let k = 0; k <= 12; k++) {
    const x = -1.0 + (2 * k) / 12;
    smile.push(front(x, 1.28 + 0.34 * (x / 1.0) ** 2, -0.04));
  }
  parts.push(paint(tube(smile, (_i, u) => 0.07 + 0.09 * Math.sin(Math.PI * u), 6, { capStart: 0.8, capEnd: 0.8 }), (_p, _n, o) => o.setHex(0x3a0f2e)));
  const tooth = front(0.36, 1.2, 0.04);
  parts.push(colored(new THREE.BoxGeometry(0.17, 0.2, 0.1).translate(tooth.x, tooth.y, tooth.z), GOLD));
  // клыки по верхней губе
  for (const x of [-0.62, -0.2, 0.7]) {
    const f = front(x, 1.32 + 0.34 * x * x + 0.07, 0.02);
    parts.push(colored(new THREE.ConeGeometry(0.12, 0.36, 4, 1, true).rotateX(Math.PI).translate(f.x, f.y - 0.14, f.z + 0.03), 0xfff4e0));
  }
  // зрачки и блики (сами глаза — светящаяся часть)
  for (const s of [-1, 1]) {
    const c = new THREE.Vector3(s * EYE_X * 0.93, EYE_Y - 0.06, EYE_Z + EYE_R * 0.86);
    parts.push(colored(blob(0.27, 0.31, 0.12, 10, 7).translate(c.x, c.y, c.z), PUPIL));
    // блик неглубоко: опущенное веко его закрывает
    parts.push(colored(new THREE.SphereGeometry(0.075, 6, 4).translate(c.x - 0.09, c.y + 0.1, c.z + 0.04), 0xffffff));
  }
  // короткие щупальца юбкой по воде (сзади и по бокам), кончики завиты кверху
  for (let k = 0; k < 6; k++) {
    const th = Math.PI * (0.42 + (1.16 * k) / 5) + (k % 2 ? 0.06 : -0.04);
    const dx = Math.sin(th);
    const dz = Math.cos(th);
    const p = (d: number, y: number, s: number): [number, number, number] => [dx * d + dz * s, y, dz * d - dx * s];
    const pts = curve([p(2.4, -0.45, 0), p(3.3, -0.05, 0.1), p(4.05, 0.3, 0.2), p(4.35, 0.75, 0.15), p(4.1, 1.0, 0.05), p(3.85, 0.85, 0)], 9);
    parts.push(paint(tube(pts, (_i, u) => 0.48 * (1 - u) + 0.06, 7, { capEnd: 1 }), (q, n, o) => {
      o.setHex(SKIN);
      if (n.y < -0.1 || q.y > 0.7) o.lerp(belly, 0.7);
    }));
  }
  // варенье стекает из-под шляпы
  for (const [x, len] of [[-0.75, 0.42], [0.55, 0.3], [1.05, 0.22]] as const) {
    const top = front(x, 4.08, -0.02);
    parts.push(jamDrop(0.09, len, 0x7a1f5c).translate(top.x, top.y, top.z));
  }
  return merge(parts.map((g) => (g.getAttribute('color') ? g : colored(g, SKIN))));
}

function eyesGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const g = new THREE.SphereGeometry(EYE_R, 16, 12).translate(s * EYE_X, EYE_Y, EYE_Z);
    parts.push(paint(g, (p, _n, o) => o.setHex(p.z > EYE_Z + EYE_R * 0.55 ? 0xc7a4ff : EYE)));
  }
  return merge(parts);
}

/**
 * Веки: полусферы над глазами, край — прямая через центр глаза с наклоном «домиком» (внутренние уголки ниже —
 * сердитый взгляд, а не грустные брови). В осях линии глаз: поворот вокруг X на lid — 0 закрывает верхнюю половину,
 * −0,9 — глаза настежь, π/2 — зажмурился.
 */
function lidsGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const lash = EYE_R * 1.1 * Math.cos(Math.PI * 0.44);
  for (const s of [-1, 1]) {
    // край века — тёмная «ресница», красим до поворота (по высоте шапочки)
    const cap = paint(new THREE.SphereGeometry(EYE_R * 1.1, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), (p, _n, o) => o.setHex(p.y < lash ? 0x3c1846 : SKIN));
    parts.push(cap.rotateZ(s * 0.42).translate(s * EYE_X, 0, 0));
  }
  return merge(parts);
}

/** Капитанская треуголка: золотой кант, банка варенья спереди, сиреневое перо сбоку; в осях точки посадки */
function hatGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [tricorn(1.85, 0.64, FELT, GOLD, 15, true)];
  // банка варенья на тулье над передним углом
  const jar = new THREE.CylinderGeometry(0.2, 0.19, 0.34, 8).translate(0, 0.5, 0.74);
  parts.push(paint(jar, (p, _n, o) => o.setHex(p.y < 0.57 ? 0xa0285c : 0xf3ead6)));
  parts.push(colored(new THREE.CylinderGeometry(0.23, 0.23, 0.08, 8).translate(0, 0.71, 0.74), GOLD));
  // перо: изогнутое, сиреневое
  const plume = curve([[-0.65, 0.5, -0.25], [-1.0, 0.95, -0.5], [-1.12, 1.4, -0.95], [-0.95, 1.65, -1.4]], 9);
  parts.push(paint(tube(plume, (_i, u) => 0.07 + 0.13 * Math.sin(Math.PI * Math.min(1, u * 1.15)), 5, { capEnd: 1.5, capStart: 0.5 }), (p, _n, o) => o.setHex(p.y > 1.2 ? 0xe6d3ff : 0xb98cf0)));
  return mergeColored(parts);
}

/** Большое щупальце (правое; левое — зеркально) в осях своего корня: дугой вверх, кончик завит внутрь; присоски
 * по внутренней стороне. Правое держит подзорную трубу. */
function armGeo(side: 1 | -1): THREE.BufferGeometry {
  const pts = curve([[0, 0, 0], [0.45, 1.3, 0.25], [0.85, 2.55, 0.35], [0.8, 3.55, 0.2], [0.4, 4.2, 0.12], [-0.02, 4.28, 0.32], [-0.12, 3.98, 0.52], [0.02, 3.8, 0.55]], 20);
  const arm = paint(tube(pts, (_i, u) => 0.55 * (1 - u) ** 0.9 + 0.06, 9, { capEnd: 1 }), (p, n, o) => {
    o.setHex(SKIN);
    if (n.x < -0.25) o.lerp(new THREE.Color(BELLY), smooth(-0.25, -0.7, n.x));
    if (jamSpot(p, [0.75, 2.4, 0.5, 0.35, 0.55, 1.2, 0.4, 0.3]) > 0.3) o.setHex(JAM);
  });
  const parts: THREE.BufferGeometry[] = [arm];
  for (let k = 0; k < 6; k++) {
    const i = 2 + k * 2;
    const a = pts[i];
    const b = pts[i + 1];
    const t = b.clone().sub(a).normalize();
    const inward = new THREE.Vector3(-1, 0, 0).addScaledVector(t, t.x).normalize();
    const r = (0.55 * (1 - i / 19) ** 0.9 + 0.06) * 0.95;
    const rs = Math.max(0.06, r * 0.36);
    const c = a.clone().addScaledVector(inward, r - 0.02);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), inward);
    const g = new THREE.CylinderGeometry(rs, rs * 1.1, 0.07, 8).applyQuaternion(q).translate(c.x, c.y, c.z);
    const tip = c.clone().addScaledVector(inward, 0.04);
    parts.push(paint(g, (p, _n, o) => o.setHex(p.distanceTo(tip) < rs * 0.55 ? 0xb0538f : 0xf6cde6)));
  }
  if (side > 0) {
    // подзорная труба в завитке: латунь с тёмными кольцами
    const dir = new THREE.Vector3(-0.55, -0.35, 0.76).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const base = new THREE.Vector3(0.05, 3.95, 0.5);
    const seg = (r: number, len: number, off: number, hex: number) => {
      const g = new THREE.CylinderGeometry(r, r, len, 8).translate(0, off + len / 2, 0).applyQuaternion(q).translate(base.x, base.y, base.z);
      parts.push(colored(g, hex));
    };
    seg(0.15, 0.55, -0.35, 0xc99a3c);
    seg(0.12, 0.45, 0.2, 0xe1b84a);
    seg(0.13, 0.08, 0.6, 0x3b2a1e);
    seg(0.1, 0.35, 0.65, 0xc99a3c);
  }
  const g = mergeColored(parts.map((p) => (p.getAttribute('color') ? p : colored(p, SKIN))));
  if (side < 0) {
    g.scale(-1, 1, 1);
    flipWinding(g);
  }
  return g;
}

const _root = new THREE.Matrix4();
const _body = new THREE.Matrix4();
const _loc = new THREE.Matrix4();

/** Импульс 0→1→0 на отрезке [a, b] */
function bump(x: number, a: number, b: number): number {
  return x <= a || x >= b ? 0 : Math.sin((Math.PI * (x - a)) / (b - a));
}

function krakenPose(a: MobAnim, out: MobPose): void {
  const t = a.t;
  const st = a.st;
  const rage = a.rage ? 1 : 0;
  const fast = 1 + 0.8 * rage;
  // покой над водой: колышется, дышит, моргает, иногда смотрит в трубу
  let y = 0.15 * Math.sin(t * 0.9) + 0.03 * rage * Math.sin(t * 19);
  let pitch = 0.04 * Math.sin(t * 0.7) + 0.02 * rage * Math.sin(t * 23);
  let roll = 0.03 * Math.sin(t * 0.55);
  let yaw = 0;
  let sxz = 1 + 0.025 * Math.sin(t * 1.4);
  let sy = 1 - 0.015 * Math.sin(t * 1.4);
  const blink = bump((t + a.seed * 3) % 4.3, 0, 0.16);
  const look = st === 0 ? smooth(0, 0.6, bump((t % 9.5) / 9.5, 0.52, 0.8)) : 0;
  // в ярости веки опущены «домиком», но зрачки видно — сердитый взгляд, а не сонный
  // веки: спокойно — прикрыты на треть, в ярости — сердитый прищур (зрачки видно), моргает, щурится в трубу
  let lid = -0.2 + 0.24 * rage + 1.8 * blink + 0.4 * look;
  let hatLift = 0.18 * rage * Math.abs(Math.sin(t * 14));
  let hatRx = -0.04;
  let hatRz = 0.13 + 0.04 * Math.sin(t * 1.1) + 0.08 * rage * Math.sin(t * 17);
  let hatX = 0;
  const sw = 1 + 0.6 * rage;
  let lRx = -0.1 + 0.12 * sw * Math.sin(t * 1.1 * fast) - 0.25 * rage;
  let lRz = 0.1 * sw * Math.sin(t * 0.8 * fast + 1);
  let rRx = -0.05 + 0.1 * sw * Math.sin(t * 1.0 * fast + 1) + 0.38 * look - 0.25 * rage;
  let rRz = 0.08 * sw * Math.sin(t * 0.9 * fast) + 0.45 * look;
  let dive = 0;

  if (st === ZS_KRAKEN_DIVE) {
    // нырок: глубину ведёт крепость (корень уходит вниз, плывёт и всплывает в другом месте) — здесь поза: зажмурился,
    // вытянулся «торпедой», щупальца прижал, шляпа подлетает от рывка; за 0,6 с до всплытия (если есть wind) — открывает глаза
    const wind = (a as MobAnim & { wind?: number }).wind;
    const k = smooth(0, 0.35, a.stT);
    const open = typeof wind === 'number' && Number.isFinite(wind) ? smooth(0.6, 0, wind) : 0;
    lid = Math.max(lid, 1.65 * smooth(0, 0.25, a.stT) * (1 - open));
    sxz *= 1 - 0.1 * k * (1 - open);
    sy *= 1 + 0.08 * k * (1 - open);
    lRx += 0.5 * k * (1 - open);
    rRx += 0.5 * k * (1 - open);
    hatLift += 0.35 * bump(a.stT, 0, 0.55);
  } else if (st === ZS_KRAKEN_SPIT) {
    // плевок, как у крепости (метка 1,5 с, клякса срывается на 0,83 с): набрать варенья (раздулся, откинулся,
    // прищурился), плюнуть вперёд, отдышаться
    const P = 1.5;
    const u = (a.stT % P) / P;
    const wind = smooth(0, 0.5, u) * (1 - smooth(0.5, 0.57, u));
    const spit = bump(u, 0.48, 0.66);
    const rec = smooth(0.62, 0.9, u);
    sxz *= 1 + 0.12 * wind - 0.04 * spit;
    sy *= 1 + 0.06 * wind - 0.12 * spit;
    pitch += -0.13 * wind + 0.22 * spit;
    lid = 0.45 + 0.2 * rage - 0.3 * spit;
    hatLift += 0.25 * wind;
    lRx += -0.4 * wind + 0.6 * spit;
    rRx += -0.4 * wind + 0.6 * spit;
    lRz += 0.2 * wind * (1 - rec);
    rRz += 0.2 * wind * (1 - rec);
  } else if (st === ZS_BOSS_OPEN) {
    // оглушён — бей: глаза настежь, качается по кругу, шляпа съехала, щупальца повисли
    const d = smooth(0, 0.4, a.stT);
    lid = lid * (1 - d) - 0.95 * d;
    pitch += 0.09 * d * Math.sin(t * 3.1);
    roll += 0.09 * d * Math.cos(t * 3.1);
    y -= 0.4 * d;
    hatRz += 0.32 * d;
    hatRx -= 0.12 * d;
    hatX = 0.3 * d;
    lRx += 0.45 * d;
    rRx += 0.45 * d;
    lRz -= 0.4 * d;
    rRz -= 0.4 * d;
  } else if (st === ZS_ATTACK) {
    // шлепок левым щупальцем: крепость обнуляет stT на каждом ударе — замах с 0, шлепок к ~0,2 с
    const u = a.stT;
    lRx += -0.6 * smooth(0, 0.1, u) * (1 - smooth(0.1, 0.18, u)) + 1.5 * bump(u, 0.1, 0.45);
  }
  // только что появился — всплывает с волной
  if (a.t < 1.6 && a.die === 0 && st !== ZS_KRAKEN_DIVE) dive = Math.max(dive, 1 - smooth(0, 1.6, a.t) * (1 + 0.15 * Math.sin(smooth(0, 1.6, a.t) * Math.PI)));
  if (a.hit > 0) {
    sy *= 1 - 0.08 * a.hit;
    sxz *= 1 + 0.05 * a.hit;
    lid = Math.max(lid, 1.15 * a.hit);
    pitch -= 0.06 * a.hit;
    hatLift += 0.3 * a.hit;
  }
  // гибель: шляпа слетает, голова кружится и уходит в глубину
  let hatOff = 0;
  let scale = 1;
  if (a.die > 0) {
    const d = a.die;
    lid = d < 0.25 ? -0.95 * smooth(0, 0.1, d) : -0.95 + 1.65 * smooth(0.25, 0.5, d);
    yaw = 1.3 * smooth(0.2, 1, d);
    pitch += 0.12 * Math.sin(t * 5) * smooth(0.1, 0.4, d);
    roll += 0.1 * Math.cos(t * 5) * smooth(0.1, 0.4, d);
    dive = Math.max(dive, Math.pow(smooth(0.25, 1, d), 1.3) * 1.15);
    hatOff = d;
    lRx += 0.7 * smooth(0, 0.5, d);
    rRx += 0.7 * smooth(0, 0.5, d);
    lRz -= 0.5 * smooth(0, 0.5, d);
    rRz -= 0.5 * smooth(0, 0.5, d);
    scale = 1 - 0.25 * d;
  }
  const sink = 7.2 * dive;
  setBone(_root, 0, 0, 0, 0, yaw, 0, scale);
  setBoneS(_loc, 0, y - sink, 0, pitch, 0, roll, sxz, sy, sxz);
  _body.multiplyMatrices(_root, _loc);
  out.body.copy(_body);
  out.extra.copy(_body);
  setBone(_loc, 0, EYE_Y, EYE_Z, lid, 0, 0);
  out.tail.multiplyMatrices(_body, _loc);
  setBone(_loc, -ARM_ROOT[0], ARM_ROOT[1], ARM_ROOT[2], lRx, 0, -lRz);
  out.armL.multiplyMatrices(_body, _loc);
  setBone(_loc, ARM_ROOT[0], ARM_ROOT[1], ARM_ROOT[2], rRx, 0, rRz);
  out.armR.multiplyMatrices(_body, _loc);
  // шляпа: на макушке, пока макушка над водой; ушла под воду — шляпа плавает и крутится на волне. Уровень воды над
  // корнем — anim.water (м), если крепость его передаёт: голова Кракена стоит ниже воды (у крепости корень — низ
  // хитбокса, в бухте на 1,7 м под водой), а ныряет и всплывает она движением корня. Без water вода — на корне (стенд).
  const wl = (a as MobAnim & { water?: number }).water;
  const floatY = (typeof wl === 'number' && Number.isFinite(wl) ? wl : 0) + FLOAT_Y;
  const onHeadY = y - sink + HAT_Y * sy + hatLift;
  if (hatOff > 0) {
    const up = 3.4 * bump(hatOff, 0.08, 0.72);
    const fall = smooth(0.72, 1, hatOff);
    const hy = Math.max(HAT_Y + up - 7.2 * fall, floatY - 2.6 * fall);
    setBone(_loc, 0.6 * smooth(0.08, 0.8, hatOff), hy, HAT_Z + 1.2 * smooth(0.08, 0.8, hatOff), -0.3 - 2.2 * hatOff, 7 * hatOff, 0.5 * hatOff);
    out.head.multiplyMatrices(_root, _loc);
  } else if (onHeadY > floatY) {
    setBone(_loc, hatX, HAT_Y + hatLift / sy, HAT_Z, hatRx, 0, hatRz);
    out.head.multiplyMatrices(_body, _loc);
  } else {
    const spin = 0.6 * Math.max(0, a.stT - 0.45);
    setBone(_loc, 0, floatY + 0.05 * Math.sin(t * 1.8), HAT_Z, 0.08 * Math.sin(t * 1.3), spin, 0.06 * Math.cos(t * 1.1));
    out.head.multiplyMatrices(_root, _loc);
  }
}

export const KRAKEN: MobDef = {
  id: 'kraken',
  name: 'Кракен',
  kinds: [Z_KRAKEN],
  height: 5.2,
  parts: [
    { bone: 'body', geo: mantleGeo() },
    { bone: 'extra', geo: eyesGeo(), glow: true },
    { bone: 'tail', geo: lidsGeo() },
    { bone: 'head', geo: hatGeo() },
    { bone: 'armL', geo: armGeo(-1) },
    { bone: 'armR', geo: armGeo(1) },
  ],
  pose: krakenPose,
};
