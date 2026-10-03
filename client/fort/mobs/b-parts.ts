// Набор B (mobs-b): общие кусочки моделей — пятна варенья, светящиеся глаза, сужающиеся трубки (лапы, хвосты),
// раскраска вершин по месту и маленькие помощники поз без выделений памяти. Кости в договоре не вложены, поэтому
// иерархию (голова на теле, лапа на теле) собираем сами: кость = родитель × своя поза (link / linkS).
import * as THREE from 'three';
import { colored, setBone, setBoneS } from './kit.ts';

/** Варенье Барона: тёмно-фиолетовое, с бликом посветлее — общая примета войска */
export const JAM = 0x6a2387;
export const JAM_HI = 0x8f3fb5;
/** Светящиеся сиреневые глаза (часть glow: к цвету добавляется белое свечение, поэтому цвет насыщенный) */
export const EYE = 0x8a3cff;

export type Paint = number | ((x: number, y: number, z: number) => number);

const _c = new THREE.Color();

/** Покрасить вершины: одним цветом или функцией от места вершины (полосы, светлое брюхо, пятна) */
export function paint(geo: THREE.BufferGeometry, col: Paint): THREE.BufferGeometry {
  if (typeof col === 'number') return colored(geo, col);
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute('position');
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    _c.set(col(pos.getX(i), pos.getY(i), pos.getZ(i)));
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

/** Смешать два цвета (для раскраски функцией) */
export function mix(a: number, b: number, t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const r = ((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k;
  const g = ((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k;
  const bl = (a & 255) * (1 - k) + (b & 255) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/** Шар (эллипсоид) в точке */
export function ball(r: number, x: number, y: number, z: number, col: Paint, sx = 1, sy = 1, sz = 1, w = 12, h = 8): THREE.BufferGeometry {
  return paint(new THREE.SphereGeometry(r, w, h).scale(sx, sy, sz).translate(x, y, z), col);
}

/** Тело вращения по профилю [радиус, высота] снизу вверх */
export function lathe(profile: Array<[number, number]>, col: Paint, segs = 16): THREE.BufferGeometry {
  return paint(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs), col);
}

/** Сужающаяся трубка по гладкой кривой через точки, с круглыми концами — лапа, хвост, шея */
export function taper(pts: Array<[number, number, number]>, r0: number, r1: number, col: Paint, segs = 10, radial = 7, caps = true): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    curve.getPointAt(u, p);
    const r = r0 + (r1 - r0) * u;
    const n = frames.normals[i];
    const b = frames.binormals[i];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(p.x + r * (c * n.x + s * b.x), p.y + r * (c * n.y + s * b.y), p.z + r * (c * n.z + s * b.z));
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const out = [paint(g, col)];
  if (caps) {
    const a = curve.getPointAt(0);
    const e = curve.getPointAt(1);
    out.push(ball(r0, a.x, a.y, a.z, col, 1, 1, 1, radial, 5), ball(r1, e.x, e.y, e.z, col, 1, 1, 1, radial, 5));
  }
  return join(out);
}

/** Склеить куски (все уже покрашены, без индекса) */
export function join(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    n.deleteAttribute('uv1');
    return n;
  });
  let count = 0;
  for (const g of parts) count += g.getAttribute('position').count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let o = 0;
  for (const g of parts) {
    const n = g.getAttribute('position').count;
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    col.set(g.getAttribute('color').array as Float32Array, o * 3);
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

/** Повернуть кусок так, чтобы его +Y смотрел вдоль (nx, ny, nz), и поставить в точку */
export function orient(geo: THREE.BufferGeometry, x: number, y: number, z: number, nx: number, ny: number, nz: number): THREE.BufferGeometry {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, ny, nz).normalize());
  return geo.applyQuaternion(q).translate(x, y, z);
}

/**
 * Пятно варенья на эллипсоиде (центр, полуоси): u — угол от верха (0…π), v — вокруг оси Y (0 — вперёд, +Z),
 * size — радиус кляксы, drip — длина капли, стекающей вниз (0 — без капли).
 */
export function jamOn(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, u: number, v: number, size: number, drip = 0): THREE.BufferGeometry {
  const sx = Math.sin(u) * Math.sin(v);
  const sy = Math.cos(u);
  const sz = Math.sin(u) * Math.cos(v);
  const x = cx + rx * sx;
  const y = cy + ry * sy;
  const z = cz + rz * sz;
  const n = new THREE.Vector3(sx / rx, sy / ry, sz / rz).normalize();
  const blob = orient(new THREE.SphereGeometry(size, 7, 4).scale(1, 0.32, 0.85), x, y, z, n.x, n.y, n.z);
  const list = [paint(blob, (_x, yy) => (yy > y + size * 0.12 ? JAM_HI : JAM))];
  if (drip > 0) {
    // капля стекает по поверхности вниз: продолговатая, с толстым концом
    const dy = -drip * 0.55;
    const ny = Math.max(-0.95, n.y);
    const d = orient(new THREE.SphereGeometry(size * 0.42, 5, 4).scale(1, drip / (size * 0.84), 0.7), x + n.x * size * 0.12, y + dy, z + n.z * size * 0.12, n.x * 0.15, 1 - Math.abs(ny) * 0.1, n.z * 0.15);
    list.push(paint(d, JAM), ball(size * 0.36, x + n.x * size * 0.18, y + dy * 2 + size * 0.1, z + n.z * size * 0.18, JAM, 1, 1.15, 1, 5, 4));
  }
  return join(list);
}

/** Пара глаз: шары в точках (x, y, z) и (−x, y, z) */
export function eyePair(r: number, x: number, y: number, z: number, col = EYE, sx = 1, sy = 1, sz = 1, w = 10, h = 8): THREE.BufferGeometry {
  return join([ball(r, x, y, z, col, sx, sy, sz, w, h), ball(r, -x, y, z, col, sx, sy, sz, w, h)]);
}

/** Отразить кусок по X (левое из правого): позиции и нормали, порядок вершин треугольников переворачиваем */
export function mirrorX(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = (geo.index ? geo.toNonIndexed() : geo).clone();
  g.scale(-1, 1, 1);
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const col = g.getAttribute('color');
  for (let i = 0; i < pos.count; i += 3) {
    for (const a of [pos, nor, col]) {
      if (!a) continue;
      for (let k = 0; k < a.itemSize; k++) {
        const t = a.getComponent(i + 1, k);
        a.setComponent(i + 1, k, a.getComponent(i + 2, k));
        a.setComponent(i + 2, k, t);
      }
    }
  }
  return g;
}

/** Треугольников в части */
export function triCount(geo: THREE.BufferGeometry): number {
  return (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
}

// ------------------------------------------------------------------ позы (без выделений памяти)

const _l = new THREE.Matrix4();
const _t = new THREE.Matrix4();

/**
 * Вся фигура: повернуть (YXZ) и отмасштабировать вокруг точки модели (px, py, pz), затем сдвинуть на (x, y, z).
 * out = T(x + p·s) · R · S(s) · T(−p). Без поворота и сдвига — просто рост s от земли.
 */
export function pivotBone(out: THREE.Matrix4, px: number, py: number, pz: number, x: number, y: number, z: number, rx: number, ry: number, rz: number, s: number): THREE.Matrix4 {
  setBone(out, x + px * s, y + py * s, z + pz * s, rx, ry, rz, s);
  return out.multiply(_t.makeTranslation(-px, -py, -pz));
}

/** out = родитель × (перенос, поворот YXZ, масштаб) — кость на кости */
export function link(out: THREE.Matrix4, parent: THREE.Matrix4, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1): THREE.Matrix4 {
  setBone(_l, x, y, z, rx, ry, rz, s);
  return out.multiplyMatrices(parent, _l);
}

/** То же с разным масштабом по осям */
export function linkS(out: THREE.Matrix4, parent: THREE.Matrix4, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number): THREE.Matrix4 {
  setBoneS(_l, x, y, z, rx, ry, rz, sx, sy, sz);
  return out.multiplyMatrices(parent, _l);
}

/** Спрятать часть (крошечный масштаб — у инстанса не бывает «выключить») */
export function hide(m: THREE.Matrix4): THREE.Matrix4 {
  return m.makeScale(1e-4, 1e-4, 1e-4);
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Доля пути по отрезку [a, b] */
export const seg = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));
export const smooth = (t: number): number => t * t * (3 - 2 * t);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Взлёт-падение 0 → 1 → 0 */
export const bump = (t: number): number => Math.sin(Math.PI * clamp01(t));
export const TAU = Math.PI * 2;

/**
 * Шаг одной ноги: фаза 0…1 → STEP.z (−0,5…0,5 — где стопа вдоль хода, доли пути в опоре) и STEP.lift (0…1).
 * В опоре (первые duty) стопа едет назад равномерно — ровно со скоростью земли, если умножить z на duty × длину шага.
 */
export const STEP = { z: 0, lift: 0 };
export function stepAt(phase: number, duty = 0.55): typeof STEP {
  const p = phase - Math.floor(phase);
  if (p < duty) {
    STEP.z = 0.5 - p / duty;
    STEP.lift = 0;
  } else {
    const u = (p - duty) / (1 - duty);
    STEP.z = -0.5 + smooth(u);
    STEP.lift = Math.sin(Math.PI * u);
  }
  return STEP;
}

/** Разброс особи по seed: рост ±8 %, свои доли для мелочей (0…1) */
export function seedScale(seed: number): number {
  return 0.92 + 0.16 * seed;
}
export function seedFrac(seed: number, k: number): number {
  const v = Math.sin((seed + 0.123) * 12.9898 * k) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Две ноги-маятника от таза: стопа в опоре стоит на земле (нога поворачивается ровно настолько, насколько уехал
 * корень), в переносе нога укорачивается (подъём стопы). Кости ног: начало — тазобедренный сустав, стопа на
 * расстоянии len вниз. travel — путь стопы в опоре в осях модели (длина шага × duty / рост особи).
 * Возвращает высоту таза: он опускается, когда опорная нога наклонена, — стопа не проваливается и не висит.
 */
export function biped(outL: THREE.Matrix4, outR: THREE.Matrix4, root: THREE.Matrix4, phase: number, duty: number, travel: number, hipX: number, hipY: number, hipZ: number, len: number, liftK: number, splay = 0): number {
  stepAt(phase, duty);
  const zl = STEP.z * travel;
  const ll = STEP.lift;
  stepAt(phase + 0.5, duty);
  const zr = STEP.z * travel;
  const lr = STEP.lift;
  const tl = Math.asin(Math.max(-0.95, Math.min(0.95, zl / len)));
  const tr = Math.asin(Math.max(-0.95, Math.min(0.95, zr / len)));
  let drop = 0;
  if (ll === 0) drop = Math.max(drop, len * (1 - Math.cos(tl)));
  if (lr === 0) drop = Math.max(drop, len * (1 - Math.cos(tr)));
  const hy = hipY - drop;
  linkS(outL, root, hipX, hy, hipZ, -tl, 0, splay, 1, 1 - liftK * ll, 1);
  linkS(outR, root, -hipX, hy, hipZ, -tr, 0, -splay, 1, 1 - liftK * lr, 1);
  return hy;
}

/** Моргание: 1 — открыт, ~0,1 — закрыт; раз в несколько секунд на 0,14 с, свой ритм у особи */
export function blink(t: number, seed: number): number {
  const period = 2.8 + seed * 2.4;
  const p = (t + seed * 5) % period;
  return p < 0.14 ? 0.12 + 0.88 * Math.abs(p / 0.07 - 1) : 1;
}

// ------------------------------------------------------------------ полёт (крылатки набора B)

/** Поза летуна за кадр: взмах крыла, тело, голова, глаза, когти (0 — поджаты, 1 — выставлены) */
export const FLY = {
  flap: 0, span: 1, sweep: 0, pitch: 0, yaw: 0, roll: 0, y: 0, sc: 1,
  headRx: 0, headRy: 0, headRz: 0, eyes: 1, eyeS: 1, talons: 0,
};

/**
 * Общая хореография крылатки (ZS_* из shared/fort.ts — передаются числами, чтобы не тянуть импорт сюда):
 * полёт — взмахи от времени, наклон от скорости; WARN (1,2 с) — зависает, частит, клюёт носом к метке и «замирает»,
 * в конце замах крыльями вверх; DIVE (0,6 с) — крылья сложены назад, нос вниз, когти вперёд; RECOVER (2 с) — тяжёлые
 * взмахи вверх, мотает головой; ATTACK — рывок-укус; удар и гибель (захлопнулся зонтиком и кувырком вниз).
 */
export function flyPose(a: { t: number; speed: number; st: number; stT: number; hit: number; die: number; seed: number }, st: { warn: number; dive: number; recover: number; attack: number }, hzBase = 3): typeof FLY {
  const s = seedScale(a.seed);
  const t = a.t + a.seed * 9;
  const hz = hzBase + seedFrac(a.seed, 2) * 0.8;
  const fly = smooth(clamp01(a.speed / 3));
  let ph = t * hz * TAU;
  let amp = 0.85;
  let bias = 0.12;
  let fold = 0.28;
  let span = -1;
  let sweep = 0.12;
  let pitch = 0.12 + fly * 0.3;
  let yaw = 0;
  let headRx = -pitch * 0.6;
  let headRy = 0;
  let headRz = (seedFrac(a.seed, 5) - 0.5) * 0.3;
  let eyes = blink(t, a.seed);
  let eyeS = 1;
  let rise = 0;
  let talons = 0;
  let sc = s;
  if (a.st === st.warn) {
    const u = a.stT;
    const lock = smooth(seg(u, 0.2, 0.8));
    const wind = smooth(seg(u, 0.85, 1.15));
    ph = t * 6.5 * TAU;
    amp = 0.55 * (1 - wind) + 0.08 * wind;
    bias = 0.15 + wind * 0.95;
    fold = 0.15;
    sweep = 0.05 - wind * 0.15;
    pitch = 0.55 * lock - 0.3 * wind;
    yaw = Math.sin(u * 9) * 0.14 * (1 - lock);
    headRx = 0.25 * lock + 0.25 * wind;
    eyes = 1;
    eyeS = 1 + 0.4 * lock;
    rise = 0.12 * wind;
    talons = 0.3 * wind;
  } else if (a.st === st.dive) {
    const u = clamp01(a.stT / 0.6);
    ph = t * 9 * TAU;
    amp = 0.05;
    bias = 0.05;
    span = 0.5;
    sweep = 1.05;
    pitch = 0.8 + 0.1 * u;
    headRx = -0.15;
    eyes = 1;
    eyeS = 1.3;
    talons = smooth(seg(u, 0.3, 0.9));
  } else if (a.st === st.recover) {
    const u = a.stT;
    ph = t * 2.6 * TAU;
    amp = 1.05;
    bias = 0.1;
    fold = 0.4;
    pitch = -0.45 * (1 - smooth(seg(u, 0, 2)));
    const dizzy = 1 - smooth(seg(u, 0, 1.2));
    headRy = Math.sin(u * 22) * 0.45 * dizzy;
    headRz = Math.sin(u * 17) * 0.3 * dizzy;
    eyes = 1 - 0.6 * dizzy * (Math.sin(u * 22) > 0.6 ? 1 : 0);
    talons = 0.5 * (1 - smooth(seg(u, 0, 0.6)));
  } else if (a.st === st.attack) {
    const q = (a.stT / 0.6) % 1;
    const lunge = q < 0.35 ? smooth(q / 0.35) : 1 - smooth((q - 0.35) / 0.65);
    ph = t * 4.5 * TAU;
    amp = 0.6;
    bias = 0.35 + lunge * 0.3;
    pitch = 0.1 + lunge * 0.45;
    headRx = lunge * 0.3;
    eyeS = 1 + lunge * 0.25;
    talons = lunge;
  }
  const h = a.hit;
  if (h > 0) {
    bias += 0.8 * h;
    pitch -= 0.45 * h;
    headRx -= 0.3 * h;
  }
  let dropY = 0;
  let spin = 0;
  const d = a.die;
  if (d > 0) {
    const shut = smooth(seg(d, 0, 0.2));
    amp *= 1 - shut;
    bias = bias * (1 - shut) + 1.35 * shut;
    fold = 0;
    span = -1;
    sweep = sweep * (1 - shut) + 0.35 * shut;
    spin = d * d * 9;
    dropY = -1.5 * smooth(seg(d, 0.15, 1)) + bump(seg(d, 0, 0.2)) * 0.15;
    sc = s * (1 - 0.85 * smooth(seg(d, 0.55, 1)));
    eyes = 1 - 0.85 * seg(d, 0.15, 0.3);
    talons = 1;
  }
  const w = Math.sin(ph);
  FLY.flap = bias + amp * (w + 0.22 * Math.sin(ph * 2));
  FLY.span = span > 0 ? span : 1 - fold * clamp01(Math.cos(ph));
  FLY.sweep = sweep;
  FLY.pitch = pitch;
  FLY.yaw = yaw;
  FLY.roll = spin;
  FLY.y = dropY + rise - Math.sin(ph + 0.6) * 0.05 * amp + Math.sin(t * 1.3) * 0.04;
  FLY.sc = sc;
  FLY.headRx = headRx;
  FLY.headRy = headRy;
  FLY.headRz = headRz;
  FLY.eyes = eyes;
  FLY.eyeS = eyeS;
  FLY.talons = talons;
  return FLY;
}

/** Точка и нормаль на эллипсоиде: u — от верха (0…π), v — вокруг Y (0 — вперёд, +Z) */
export function onEllipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, u: number, v: number): [number, number, number, number, number, number] {
  const sx = Math.sin(u) * Math.sin(v);
  const sy = Math.cos(u);
  const sz = Math.sin(u) * Math.cos(v);
  const n = new THREE.Vector3(sx / rx, sy / ry, sz / rz).normalize();
  return [cx + rx * sx, cy + ry * sy, cz + rz * sz, n.x, n.y, n.z];
}

/** Шестигранная пластинка (щиток панциря): сплюснутая шестигранная «линза» вдоль нормали — 12 треугольников */
export function hexPlate(r: number, h: number, x: number, y: number, z: number, nx: number, ny: number, nz: number, col: Paint, spin = 0): THREE.BufferGeometry {
  return paint(orient(new THREE.SphereGeometry(r, 6, 2).scale(1, h / r, 1).rotateY(spin + Math.PI / 6), x, y, z, nx, ny, nz), col);
}

/** Покрасить по треугольникам (цвет — по центру треугольника): доски, щитки, полосы на грубой сетке */
export function paintTris(geo: THREE.BufferGeometry, col: (x: number, y: number, z: number) => number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute('position');
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    _c.set(col(cx, cy, cz));
    for (let k = 0; k < 3; k++) {
      arr[(i + k) * 3] = _c.r;
      arr[(i + k) * 3 + 1] = _c.g;
      arr[(i + k) * 3 + 2] = _c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}
