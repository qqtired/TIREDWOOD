// Люди баркаса — в стиле Деда Семёна (client/lobby/fisherman.ts), не желейки: боцман Михалыч с трубкой, рыбак Толик
// с сетью, баянист Витёк, Саня (младший брат Семёна — то же лицо и нос, тёмные усы, плечистее) и моторист Гоша.
// Каждый — несколько склеенных сеток: ноги и всё неподвижное — одна, туловище, голова и руки — свои (их двигает
// анимация). Материал один на всех. Смотрят в −Z своей группы (yaw, как у игроков).
import * as THREE from 'three';
import { mergeColored, paint, place } from '../../render/kit.ts';

export interface PersonSpec {
  skin: number;
  /** Куртка, бушлат, роба или тельняшка */
  coat: number;
  /** Полосы тельняшки (null — без них) */
  stripes?: number | null;
  /** Рукава (по умолчанию — как куртка); закатаны — предплечья голые */
  sleeves?: number;
  rolled?: boolean;
  /** Пуговицы/кант бушлата */
  trim?: number;
  pants: number;
  boots: number;
  apron?: number;
  hat: 'captain' | 'souwester' | 'beret' | 'knit' | 'none';
  hatColor: number;
  hatBand?: number;
  hair: number;
  /** Седина на висках */
  temples?: number;
  brows: number;
  beard?: number;
  mustache?: number;
  /** Ширина плеч и рост (множители) */
  build?: number;
  height?: number;
  /** Сидит: высота сиденья (м от пола), иначе стоит */
  seat?: number;
  /** Молодой — без морщин, щёки румянее */
  young?: boolean;
}

/** Человек: части, которые двигает анимация. Точка группы — пол под ногами. */
export interface Person {
  readonly group: THREE.Group;
  readonly torso: THREE.Group;
  readonly head: THREE.Group;
  readonly armL: THREE.Group;
  readonly armR: THREE.Group;
  /** Высота таза над полом (сидя — сиденье) */
  readonly hip: number;
}

/** Общий материал людей баркаса (вершинные цвета) */
let personMat: THREE.MeshStandardMaterial | null = null;
export function crewMaterial(): THREE.MeshStandardMaterial {
  personMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02, side: THREE.DoubleSide });
  return personMat;
}

export function at(g: THREE.BufferGeometry, color: number, x: number, y: number, z: number, ry = 0, rx = 0): THREE.BufferGeometry {
  return place(paint(g, color), x, y, z, ry, rx);
}

export function crewMesh(parts: THREE.BufferGeometry[]): THREE.Mesh {
  const m = new THREE.Mesh(mergeColored(parts), crewMaterial());
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

/** Собрать человека по описанию. Руки висят вдоль тела; плечо — точка поворота группы руки. */
export function makePerson(s: PersonSpec): Person {
  const group = new THREE.Group();
  const k = s.height ?? 1;
  const w = s.build ?? 1;
  const sitting = s.seat !== undefined;
  const hip = sitting ? s.seat! + 0.06 : 0.8 * k;
  const legs: THREE.BufferGeometry[] = [];
  for (const sx of [-0.13 * w, 0.13 * w]) {
    if (sitting) {
      // бедро вперёд, голень вниз, ботинок на полу
      const seat = s.seat!;
      legs.push(at(new THREE.CylinderGeometry(0.09, 0.085, 0.46, 9).rotateX(Math.PI / 2), s.pants, sx, hip - 0.02, -0.2));
      legs.push(at(new THREE.SphereGeometry(0.088, 9, 7), s.pants, sx, hip - 0.02, -0.43));
      const shin = Math.max(0.2, seat - 0.02);
      legs.push(at(new THREE.CylinderGeometry(0.082, 0.072, shin, 9), s.pants, sx, shin / 2 + 0.06, -0.45));
      legs.push(at(new THREE.CylinderGeometry(0.09, 0.096, 0.22, 10), s.boots, sx, 0.13, -0.45));
      legs.push(at(new THREE.BoxGeometry(0.19, 0.11, 0.3), s.boots, sx, 0.055, -0.5));
    } else {
      legs.push(at(new THREE.CylinderGeometry(0.088, 0.077, 0.55 * k, 9), s.pants, sx, hip - 0.27 * k, 0));
      legs.push(at(new THREE.CylinderGeometry(0.094, 0.1, 0.29, 10), s.boots, sx, 0.23, 0));
      legs.push(at(new THREE.BoxGeometry(0.2, 0.12, 0.32), s.boots, sx, 0.075, -0.065));
      legs.push(at(new THREE.BoxGeometry(0.205, 0.035, 0.325), darker(s.boots, 0.75), sx, 0.018, -0.065));
    }
  }
  legs.push(at(new THREE.CylinderGeometry(0.21 * w, 0.2 * w, 0.16, 12).scale(1, 1, 0.8), s.pants, 0, hip + 0.02, 0));
  group.add(crewMesh(legs));

  const torso = new THREE.Group();
  torso.position.set(0, hip, 0);
  const body: THREE.BufferGeometry[] = [];
  const tw = 0.23 * w;
  body.push(at(new THREE.CylinderGeometry(tw, tw * 0.92, 0.48, 12).scale(1, 1, 0.78), s.coat, 0, 0.25, 0));
  if (s.stripes != null) {
    for (let y = 0.05; y < 0.48; y += 0.06) body.push(at(new THREE.CylinderGeometry(tw + 0.004, tw * 0.95, 0.024, 12).scale(1, 1, 0.78), s.stripes, 0, y, 0));
  }
  if (s.trim !== undefined) {
    // бушлат: двубортный — два ряда пуговиц, воротник
    for (const sx of [-0.07, 0.07]) for (const y of [0.12, 0.24, 0.36]) body.push(at(new THREE.SphereGeometry(0.016, 6, 5), s.trim, sx * w, y, -0.178));
    body.push(at(new THREE.TorusGeometry(0.12, 0.035, 5, 14).rotateX(Math.PI / 2).scale(1, 1, 0.8), s.coat, 0, 0.47, -0.01));
  }
  if (s.apron !== undefined) {
    // рыбацкий фартук: грудка и полотно до колен, лямки
    body.push(at(new THREE.BoxGeometry(0.3 * w, 0.3, 0.02), s.apron, 0, 0.3, -0.188));
    body.push(at(new THREE.BoxGeometry(0.42 * w, 0.42, 0.02), s.apron, 0, -0.06, -0.19));
    for (const sx of [-0.12, 0.12]) body.push(at(new THREE.BoxGeometry(0.035, 0.2, 0.02), s.apron, sx * w, 0.5, -0.12, 0, -0.5));
  }
  body.push(at(new THREE.CylinderGeometry(0.075, 0.09, 0.14, 10), s.skin, 0, 0.55, 0));
  torso.add(crewMesh(body));
  group.add(torso);

  const head = new THREE.Group();
  head.position.set(0, 0.64, -0.02);
  head.add(crewMesh(face(s)));
  torso.add(head);

  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * (tw + 0.035), 0.42, 0);
    const sleeve = s.sleeves ?? s.coat;
    const geo: THREE.BufferGeometry[] = [at(new THREE.CapsuleGeometry(0.072, s.rolled ? 0.12 : 0.24, 3, 9), sleeve, 0, s.rolled ? -0.11 : -0.17, 0)];
    if (s.rolled) {
      geo.push(at(new THREE.CylinderGeometry(0.078, 0.078, 0.06, 9), s.stripes ?? sleeve, 0, -0.2, 0));
      geo.push(at(new THREE.CapsuleGeometry(0.062, 0.14, 3, 8), s.skin, 0, -0.29, 0));
    } else if (s.stripes != null) {
      for (const y of [-0.09, -0.15, -0.21, -0.27]) geo.push(at(new THREE.CylinderGeometry(0.075, 0.075, 0.022, 9), s.stripes, 0, y, 0));
    }
    geo.push(at(new THREE.SphereGeometry(0.068, 10, 8).scale(0.85, 1.1, 0.8), s.skin, 0, -0.38, -0.02));
    arm.add(crewMesh(geo));
    torso.add(arm);
    arms.push(arm);
  }
  return { group, torso, head, armL: arms[0], armR: arms[1], hip };
}

/** Лицо и шапка: голова Семёна (те же пропорции и нос), дальше — по описанию. */
function face(s: PersonSpec): THREE.BufferGeometry[] {
  const g: THREE.BufferGeometry[] = [];
  const cheek = s.young ? 0xd39a7e : darker(s.skin, 1.03);
  g.push(at(new THREE.SphereGeometry(0.19, 16, 12).scale(0.88, 1.14, 0.9), s.skin, 0, 0, 0));
  for (const sx of [-1, 1]) {
    g.push(at(new THREE.SphereGeometry(0.035, 8, 6).scale(0.65, 1.2, 0.7), darker(s.skin, 0.92), sx * 0.171, -0.003, 0));
    g.push(at(new THREE.SphereGeometry(0.018, 8, 6).scale(1, 0.55, 0.3), 0xebe4d5, sx * 0.067, 0.028, -0.161));
    g.push(at(new THREE.SphereGeometry(0.009, 7, 5).scale(1, 0.8, 0.5), 0x354842, sx * 0.067, 0.028, -0.169));
    g.push(at(new THREE.BoxGeometry(0.063, 0.017, 0.012).rotateZ(sx * 0.1), s.brows, sx * 0.067, 0.07, -0.153));
    if (!s.young) for (const y of [0.098, 0.122]) g.push(at(new THREE.BoxGeometry(0.058, 0.004, 0.008), darker(s.skin, 0.8), sx * 0.047, y, -0.146));
    g.push(at(new THREE.SphereGeometry(0.042, 8, 6).scale(1, 0.8, 0.4), cheek, sx * 0.095, -0.038, -0.139));
    // волосы на висках и затылке (из-под шапки), седина — поверх
    g.push(at(new THREE.SphereGeometry(0.07, 8, 6).scale(0.5, 1, 0.9), s.hair, sx * 0.158, 0.06, 0.03));
    if (s.temples !== undefined) g.push(at(new THREE.SphereGeometry(0.045, 8, 6).scale(0.5, 0.8, 0.8), s.temples, sx * 0.168, 0.05, -0.02));
  }
  g.push(at(new THREE.SphereGeometry(0.16, 12, 9).scale(1.05, 0.75, 0.9), s.hair, 0, 0.05, 0.05));
  g.push(at(new THREE.SphereGeometry(0.037, 10, 8).scale(0.75, 1.05, 1.1), darker(s.skin, 0.93), 0, -0.008, -0.173));
  g.push(at(new THREE.BoxGeometry(0.044, 0.005, 0.007), 0x715745, 0, -0.08, -0.168));
  if (s.beard !== undefined) {
    g.push(at(new THREE.SphereGeometry(0.11, 12, 9).scale(1, 0.94, 0.6), s.beard, 0, -0.125, -0.105));
    for (const sx of [-1, 1]) g.push(at(new THREE.SphereGeometry(0.07, 10, 7).scale(0.6, 1.05, 0.6), s.beard, sx * 0.111, -0.07, -0.104));
  }
  if (s.mustache !== undefined) {
    g.push(at(new THREE.SphereGeometry(0.055, 10, 6).scale(1.6, 0.42, 0.38), s.mustache, 0, -0.058, -0.174));
    for (const sx of [-1, 1]) g.push(at(new THREE.SphereGeometry(0.022, 7, 5).scale(1, 1.5, 0.6), s.mustache, sx * 0.075, -0.083, -0.16));
  }
  const hc = s.hatColor;
  switch (s.hat) {
    case 'captain':
      // капитанка: тулья, околыш, козырёк и «краб»
      g.push(at(new THREE.CylinderGeometry(0.205, 0.18, 0.1, 16).scale(1, 1, 0.98), hc, 0, 0.175, 0.005));
      g.push(at(new THREE.CylinderGeometry(0.182, 0.182, 0.05, 16), s.hatBand ?? 0x1d2228, 0, 0.13, 0));
      g.push(at(new THREE.SphereGeometry(0.15, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.2, 0.75), 0x15181c, 0, 0.115, -0.16));
      g.push(at(new THREE.BoxGeometry(0.06, 0.035, 0.01), 0xd9b75a, 0, 0.142, -0.183));
      break;
    case 'souwester':
      // зюйдвестка: купол и широкие поля, сзади длиннее
      g.push(at(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 1), hc, 0, 0.11, 0.01));
      g.push(at(new THREE.CylinderGeometry(0.29, 0.31, 0.02, 18).scale(1, 1, 1.05), hc, 0, 0.105, 0.04, 0, 0.12));
      break;
    case 'beret':
      g.push(at(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.08, 0.36, 1.05), hc, 0.02, 0.135, 0.01));
      g.push(at(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 6), hc, 0.02, 0.215, 0.01));
      break;
    case 'knit':
      g.push(at(new THREE.SphereGeometry(0.195, 14, 9, 0, Math.PI * 2, 0, Math.PI / 1.8).scale(1, 0.95, 0.97), hc, 0, 0.095, 0.01));
      g.push(at(new THREE.CylinderGeometry(0.196, 0.196, 0.075, 14).scale(1, 1, 0.97), s.hatBand ?? darker(hc, 0.85), 0, 0.08, 0.005));
      break;
    case 'none':
      break;
  }
  return g;
}

export function darker(hex: number, k: number): number {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return c.getHex();
}

/** Шапка выше головы на столько (для искры трубки и т. п. не нужно) — плавное к цели: x → y за время tau */
export function ease(cur: number, want: number, dt: number, tau: number): number {
  return cur + (want - cur) * Math.min(1, dt / tau);
}
