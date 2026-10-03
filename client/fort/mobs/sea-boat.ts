// Пиратская шлюпка десанта (Z_BOAT): деревянный корпус с полосой у борта, вёсла гребут, на корме флажок с банкой
// варенья, на носу банка-фонарь светится сиреневым. На скамьях — крабы в треуголках: сколько экипажа ещё в лодке,
// столько и сидит (до шести; стоит шесть и больше — все шесть). Нос — +Z, корень — на уровне воды (y = 0), осадка
// ниже. Состояния: плывёт и гребёт (ZS_BOAT), у берега крабы прыгают за борт, вёсла подняты (ZS_BOAT_LAND), пустая
// отходит, вёсла волочатся (ZS_BOAT_LEAVE). Потопили — кренится, задирает нос и уходит под воду, крабы лопаются.
import * as THREE from 'three';
import { ZS_BOAT_LAND, ZS_BOAT_LEAVE, Z_BOAT } from '../../../shared/fort.ts';
import { colored, merge, setBone, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import { flipWinding, seatedCrab } from './crew-crab.ts';
import { blob, jamDrop, jamSpot, mergeColored, paint, smooth, tube } from './sea-shapes.ts';

/** Корма и нос, полуширина, пол внутри (выше воды — иначе море «нальётся» в лодку) */
const Z0 = -1.75;
const Z1 = 2.05;
const BEAM = 0.82;
const FLOOR = 0.17;
const BENCH_Y = 0.36;
/** Уключины: ось вёсел поперёк лодки на этой высоте и z */
const LOCK_Z = 0.35;
/** Высадка: первый прыгает через столько секунд, потом по одному через (HOP_EVERY 24 тика у крепости) */
const HOP_FIRST = 0.2;
const HOP_EVERY = 0.4;
/** Пока MobAnim не несёт stage (сколько экипажа в лодке) — считаем столько */
export const BOAT_STAGE_DEFAULT = 3;

const JAM = 0x5e2479;
const EYE = 0x9a63ff;

interface BoatLook {
  id: string;
  name: string;
  weight: number;
  wood: number;
  wood2: number;
  stripe: number;
  inner: number;
  flag: number;
  crab: number;
  belly: number;
}

function halfW(z: number): number {
  if (z >= 0) return BEAM * Math.pow(Math.max(0, 1 - Math.pow(z / Z1, 2.2)), 0.6);
  return BEAM * (1 - 0.3 * Math.pow(-z / -Z0, 2.5));
}
function gunwale(z: number): number {
  return 0.5 + 0.3 * Math.pow(Math.max(0, (z - 0.6) / (Z1 - 0.6)), 2) + 0.1 * Math.pow(Math.max(0, (-z - 0.4) / (-Z0 - 0.4)), 2);
}
function keel(z: number): number {
  return -0.3 + 0.25 * Math.pow(Math.max(0, (z - 0.9) / (Z1 - 0.9)), 1.5) + 0.12 * Math.pow(Math.max(0, (-z - 0.8) / (-Z0 - 0.8)), 1.5);
}

/** Сетка поверхности: станции по z × точки сечения; outward — наружу (иначе внутрь лодки) */
function shell(stations: number[], half: number[], point: (z: number, s: number, side: number, out: number[]) => void, outward: boolean): THREE.BufferGeometry {
  const sec: Array<[number, number]> = [];
  for (const s of half) sec.push([s, -1]);
  for (let k = half.length - 2; k >= 0; k--) sec.push([half[k], 1]);
  const pos: number[] = [];
  const tmp: number[] = [];
  for (const z of stations) {
    for (const [s, side] of sec) {
      tmp.length = 0;
      point(z, s, side, tmp);
      pos.push(tmp[0], tmp[1], tmp[2]);
    }
  }
  const na = sec.length;
  const idx: number[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < na - 1; j++) {
      const a = i * na + j;
      const b = a + 1;
      const c = a + na;
      const d = c + 1;
      if (outward) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Плоский многоугольник веером из центра (транец); flip — обратная сторона */
function fan(ring: THREE.Vector3[], flip: boolean): THREE.BufferGeometry {
  const c = new THREE.Vector3();
  for (const p of ring) c.add(p);
  c.multiplyScalar(1 / ring.length);
  const pos: number[] = [];
  for (let j = 0; j < ring.length; j++) {
    const a = ring[j];
    const b = ring[(j + 1) % ring.length];
    const tri = flip ? [c, a, b] : [c, b, a];
    for (const p of tri) pos.push(p.x, p.y, p.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const OUT_S = [0, 0.1, 0.25, 0.5, 0.78, 1];
const IN_S = [0, 0.55, 1];
const outerPt = (z: number, s: number, side: number, o: number[]) => {
  const g = gunwale(z);
  o.push(side * halfW(z) * Math.pow(Math.max(0, 1 - Math.pow(s, 2.2)), 0.55), g - (g - keel(z)) * Math.pow(s, 1.15), z);
};
const innerPt = (z: number, s: number, side: number, o: number[]) => {
  const g = gunwale(z);
  const w = Math.max(0.002, halfW(z) - 0.07);
  o.push(side * w * Math.sqrt(Math.max(0, 1 - s * s * s)), g - (g - FLOOR) * Math.pow(s, 0.8), z);
};

function hullGeo(look: BoatLook): THREE.BufferGeometry {
  const stations: number[] = [];
  for (let i = 0; i < 10; i++) stations.push(Z0 + (Z1 - Z0) * (i / 9));
  const stains = [0.62, 0.3, 1.25, 0.32, -0.7, 0.25, -0.6, 0.3, 0.75, 0.42, 0.9, 0.2];
  const outer = paint(shell(stations, OUT_S, outerPt, true), (p, _n, o) => {
    const g = gunwale(p.z);
    if (p.y > g - 0.09) o.setHex(look.stripe);
    else if (p.y < -0.02) o.setHex(0x4a3a2a);
    else o.setHex(Math.floor((g - p.y) / 0.16) % 2 ? look.wood2 : look.wood);
    if (jamSpot(p, stains) > 0.25) o.setHex(JAM);
  }, true);
  const inner = paint(shell(stations, IN_S, innerPt, false), (p, _n, o) => o.setHex(p.y < FLOOR + 0.05 ? look.wood2 : look.inner), true);
  // планширь: полоса сверху от внешней обшивки к внутренней
  const rimPos: number[] = [];
  const o1: number[] = [];
  const o2: number[] = [];
  const n1: number[] = [];
  const n2: number[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    for (const side of [-1, 1]) {
      o1.length = o2.length = n1.length = n2.length = 0;
      outerPt(stations[i], 0, side, o1);
      outerPt(stations[i + 1], 0, side, o2);
      innerPt(stations[i], 0, side, n1);
      innerPt(stations[i + 1], 0, side, n2);
      const tri = side > 0 ? [o1, n1, o2, n1, n2, o2] : [o1, o2, n1, n1, o2, n2];
      for (const p of tri) rimPos.push(p[0], p[1] + 0.012, p[2]);
    }
  }
  const rim = new THREE.BufferGeometry();
  rim.setAttribute('position', new THREE.Float32BufferAttribute(rimPos, 3));
  rim.computeVertexNormals();
  // транец: снаружи — по внешнему сечению, изнутри — по внутреннему
  const ringOf = (pt: typeof outerPt, half: number[]) => {
    const r: THREE.Vector3[] = [];
    const tmp: number[] = [];
    for (const s of half) {
      tmp.length = 0;
      pt(Z0, s, -1, tmp);
      r.push(new THREE.Vector3(tmp[0], tmp[1], tmp[2]));
    }
    for (let k = half.length - 2; k >= 0; k--) {
      tmp.length = 0;
      pt(Z0, half[k], 1, tmp);
      r.push(new THREE.Vector3(tmp[0], tmp[1], tmp[2]));
    }
    return r;
  };
  const parts: THREE.BufferGeometry[] = [
    outer,
    inner,
    colored(rim, 0xd9c29a),
    paint(fan(ringOf(outerPt, OUT_S), false), (p, _n, o) => o.setHex(p.y > gunwale(Z0) - 0.09 ? look.stripe : look.wood)),
    colored(fan(ringOf(innerPt, IN_S), true), look.inner),
  ];
  // скамьи
  for (const z of [0.78, -0.12, -1.05]) {
    const w = (halfW(z) - 0.06) * 2;
    parts.push(colored(new THREE.BoxGeometry(w, 0.06, 0.26).translate(0, BENCH_Y, z), 0xa57548));
  }
  // флагшток на корме и флажок по ветру: волна, на нём банка варенья
  parts.push(colored(new THREE.CylinderGeometry(0.03, 0.04, 2.15, 5, 1, true).translate(0, 1.4, -1.45), 0x5b3a22));
  parts.push(flagGeo(look));
  // крышка банки-фонаря на носу (сама банка светится — отдельная часть)
  parts.push(colored(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 7).translate(0, 1.12, 1.9), 0xe1b84a));
  parts.push(colored(new THREE.CylinderGeometry(0.035, 0.05, 0.3, 5, 1, true).translate(0, 0.83, 1.97), 0x5b3a22));
  // варенье стекает с борта
  parts.push(jamDrop(0.045, 0.18, JAM).translate(halfW(0.95) + 0.01, gunwale(0.95) - 0.02, 0.95));
  return merge(parts);
}

/** Флажок: две стороны с волной, по центру — банка варенья (кремовая с фиолетовым и крышкой) */
function flagGeo(look: BoatLook): THREE.BufferGeometry {
  const L = 0.85;
  const H = 0.56;
  const wave = (s: number) => 0.09 * Math.sin(s * Math.PI * 1.6) * s;
  const grid = (side: 1 | -1) => {
    const pos: number[] = [];
    const idx: number[] = [];
    const nu = 5;
    for (let i = 0; i <= nu; i++) {
      const s = i / nu;
      for (const v of [0, 1]) pos.push(wave(s) + side * 0.004, 1.95 + v * H - s * 0.06, -1.45 - s * L);
    }
    for (let i = 0; i < nu; i++) {
      const a = i * 2;
      if (side > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return colored(g, look.flag);
  };
  const s = 0.5;
  const x = wave(s);
  const y = 1.95 + H / 2 - s * 0.06;
  const z = -1.45 - s * L;
  const jar = colored(new THREE.BoxGeometry(0.04, 0.22, 0.19).translate(x, y - 0.03, z), 0xc23a72);
  const lid = colored(new THREE.BoxGeometry(0.05, 0.07, 0.23).translate(x, y + 0.11, z), 0xf3ead6);
  return mergeColored([grid(1), grid(-1), jar, lid]);
}

/** Банка-фонарь на носу: светится сиреневым (часть glow) */
function lampGeo(): THREE.BufferGeometry {
  const jar = new THREE.CylinderGeometry(0.13, 0.12, 0.2, 7).translate(0, 0.99, 1.9);
  return paint(jar, (p, _n, o) => o.setHex(p.y > 1.06 ? 0xe6d3ff : EYE));
}

/** Вёсла: оба на одной кости, ось — линия уключин (поворот вокруг X машет обеими лопастями одинаково) */
function oarsGeo(): THREE.BufferGeometry {
  const one = (side: 1 | -1) => {
    const x0 = halfW(LOCK_Z) + 0.02;
    const slope = -0.39;
    const at = (x: number) => new THREE.Vector3(x, slope * (x - x0), 0);
    const shaft = paint(tube([at(0.14), at(1.8)], () => 0.035, 5, { capStart: 0 }), (_p, _n, o) => o.setHex(0xc9a06a));
    const grip = paint(tube([at(0.06), at(0.3)], () => 0.045, 5, { capStart: 0.6 }), (_p, _n, o) => o.setHex(0x6b4426));
    const mid = at(2.05);
    const blade = paint(blob(0.3, 0.1, 0.025, 6, 3).rotateZ(Math.atan(slope)).translate(mid.x, mid.y, 0), (p, _n, o) => o.setHex(p.x > 2.2 ? 0x8a2f6e : 0xc9a06a));
    const g = mergeColored([shaft, grip, blade]);
    if (side < 0) {
      g.scale(-1, 1, 1);
      flipWinding(g);
    }
    return g;
  };
  return mergeColored([one(1), one(-1)]);
}

/** Места крабов: A — впередсмотрящий на носу (1), B — носовая скамья (2), C — гребцы и капитан на корме (3) */
const SEATS_A: ReadonlyArray<readonly [number, number, number]> = [[0, 0, 0]];
const SEATS_B: ReadonlyArray<readonly [number, number, number]> = [[-0.34, 0, 0], [0.34, 0, 0]];
const SEATS_C: ReadonlyArray<readonly [number, number, number]> = [[-0.34, 0, 0], [0.34, 0, 0], [0, 0, -0.93]];
const ORIGIN_A = [0, BENCH_Y + 0.03, 1.36] as const;
const ORIGIN_B = [0, BENCH_Y + 0.03, 0.78] as const;
const ORIGIN_C = [0, BENCH_Y + 0.03, -0.12] as const;

function crabsGeo(look: BoatLook, seats: ReadonlyArray<readonly [number, number, number]>): THREE.BufferGeometry {
  return mergeColored(seats.map(([x, y, z], i) => seatedCrab(look.crab, look.belly, x, y, z, (i % 2 ? -0.12 : 0.12) * (x === 0 ? 0 : 1), 0.86)));
}

/** Группы крабов: A (1 краб), B (2), C (3) — признаки в маске */
export const CREW_A = 1;
export const CREW_B = 2;
export const CREW_C = 4;
/** Какие группы видны при count крабах (маска): каждый прыжок убирает ровно одного, остальные «пересаживаются» к носу */
const GROUPS_BY_COUNT = [0, CREW_A, CREW_B, CREW_C, CREW_A | CREW_C, CREW_B | CREW_C, CREW_A | CREW_B | CREW_C];
export function crewGroups(count: number): number {
  return GROUPS_BY_COUNT[Math.max(0, Math.min(6, Math.round(count)))];
}

const _hull = new THREE.Matrix4();
const _loc = new THREE.Matrix4();

function boatPose(a: MobAnim, out: MobPose): void {
  const seed = a.seed;
  const t = a.t;
  const st = a.st;
  const stage = (a as MobAnim & { stage?: number }).stage;
  let crew: number;
  if (st === ZS_BOAT_LEAVE) crew = 0;
  else if (typeof stage === 'number' && Number.isFinite(stage)) crew = stage;
  else if (st === ZS_BOAT_LAND) crew = Math.max(0, BOAT_STAGE_DEFAULT - Math.max(0, Math.floor((a.stT - HOP_FIRST) / HOP_EVERY) + 1));
  else crew = BOAT_STAGE_DEFAULT;
  const groups = crewGroups(crew);
  const showA = (groups & CREW_A) !== 0;
  const showB = (groups & CREW_B) !== 0;
  const showC = (groups & CREW_C) !== 0;

  // качка на волне
  let heave = 0.06 * Math.sin(t * 1.6 + seed * 6);
  let pitch = 0.035 * Math.sin(t * 1.3 + seed * 4);
  let roll = 0.05 * Math.sin(t * 1.1 + seed * 9);
  // гребля: темп 1,25 гребка в секунду, размах — от скорости; гребут, пока на корме гребцы
  const rowing = st !== ZS_BOAT_LAND && st !== ZS_BOAT_LEAVE && showC ? Math.min(1, a.speed / 2) : 0;
  const phi = t * Math.PI * 2 * 1.25 + seed * 6;
  let oar = 0.42 * Math.sin(phi) * rowing;
  let lift = -0.12 * Math.cos(phi) * rowing;
  pitch += -0.02 * Math.sin(phi) * rowing;
  heave += 0.015 * Math.cos(phi) * rowing;
  if (st === ZS_BOAT_LAND) {
    oar = -0.05;
    lift = 0.2;
  } else if (st === ZS_BOAT_LEAVE || rowing === 0) {
    // пустая: вёсла волочатся лопастями назад
    oar = 0.32 + 0.06 * Math.sin(t * 1.4 + seed * 3);
    lift = -0.04;
  }
  // крабы подпрыгивают от нетерпения (у берега — сильнее), гребцы — в такт гребку
  const eager = st === ZS_BOAT_LAND ? 1.8 : 1;
  let jumpA = 0.05 * eager * Math.abs(Math.sin(t * 5.5 + seed * 3));
  let jumpB = 0.045 * eager * Math.abs(Math.sin(t * 4.9 + 1.3 + seed * 5));
  let jumpC = rowing > 0 ? 0.045 * Math.max(0, Math.cos(phi)) : 0.035 * eager * Math.abs(Math.sin(t * 4.3 + 2.1));
  let crabS = 1;
  // попадание: лодку дёргает, крабы подскакивают
  if (a.hit > 0) {
    roll += 0.12 * a.hit;
    pitch -= 0.04 * a.hit;
    jumpA += 0.12 * a.hit;
    jumpB += 0.12 * a.hit;
    jumpC += 0.12 * a.hit;
  }
  // тонет: крен, нос вверх, под воду; крабы лопаются, вёсла всплывают и уходят следом
  let s = 1 + (seed - 0.5) * 0.08;
  if (a.die > 0) {
    roll += 0.55 * smooth(0, 0.6, a.die);
    pitch -= 0.62 * smooth(0.12, 0.7, a.die);
    heave -= 3.4 * Math.pow(smooth(0.15, 1, a.die), 1.8);
    const pop = smooth(0, 0.3, a.die);
    crabS = 1 + 0.35 * Math.sin(Math.PI * Math.min(1, pop * 1.4)) - pop;
    jumpA += 0.45 * Math.sin(Math.PI * pop);
    jumpB += 0.4 * Math.sin(Math.PI * pop);
    jumpC += 0.38 * Math.sin(Math.PI * pop);
    lift += 0.25 * smooth(0, 0.3, a.die);
    oar += 0.6 * smooth(0, 0.5, a.die);
    s *= 1 - 0.15 * a.die;
  }
  setBone(_hull, 0, heave, 0, pitch, 0, roll, s);
  out.body.copy(_hull);
  setBone(_loc, 0, gunwale(LOCK_Z) + 0.03 + lift, LOCK_Z, oar, 0, 0);
  out.armL.multiplyMatrices(_hull, _loc);
  const sway = 0.08 * Math.sin(t * 2.7 + seed * 7);
  const hide = 1e-4;
  setBone(_loc, ORIGIN_A[0], ORIGIN_A[1] + jumpA, ORIGIN_A[2], 0.05, 0, sway, showA ? Math.max(hide, crabS) : hide);
  out.legL.multiplyMatrices(_hull, _loc);
  setBone(_loc, ORIGIN_B[0], ORIGIN_B[1] + jumpB, ORIGIN_B[2], 0, 0, -sway * 0.8, showB ? Math.max(hide, crabS) : hide);
  out.legR.multiplyMatrices(_hull, _loc);
  setBone(_loc, ORIGIN_C[0], ORIGIN_C[1] + jumpC, ORIGIN_C[2], 0.06 * Math.sin(phi) * rowing, 0, sway * 0.5, showC ? Math.max(hide, crabS) : hide);
  out.tail.multiplyMatrices(_hull, _loc);
}

function boatDef(look: BoatLook): MobDef {
  return {
    id: look.id,
    name: look.name,
    kinds: [Z_BOAT],
    weight: look.weight,
    height: 2.55,
    parts: [
      { bone: 'body', geo: hullGeo(look) },
      { bone: 'body', geo: lampGeo(), glow: true },
      { bone: 'armL', geo: oarsGeo() },
      { bone: 'legL', geo: crabsGeo(look, SEATS_A) },
      { bone: 'legR', geo: crabsGeo(look, SEATS_B) },
      { bone: 'tail', geo: crabsGeo(look, SEATS_C) },
    ],
    pose: boatPose,
  };
}

export const SEA_BOAT = boatDef({
  id: 'sea-boat', name: 'Шлюпка Барона', weight: 2, wood: 0x8a5a34, wood2: 0x7a4e2c, stripe: 0xe8c66a, inner: 0xb98a58,
  flag: 0x5a2a86, crab: 0xd9452f, belly: 0xf2a77c,
});
export const SEA_BOAT_RED = boatDef({
  id: 'sea-boat-red', name: 'Красная шлюпка', weight: 1, wood: 0xb0382c, wood2: 0x9c3127, stripe: 0xf2ece0, inner: 0xc79a68,
  flag: 0x26222b, crab: 0xe8742e, belly: 0xf6c08a,
});
