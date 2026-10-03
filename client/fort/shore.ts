// Берег «Старой крепости» — статика юга. Луг карты обрывается к морю у z = 24 (земля сервера — до 24, невидимая
// стена — у 23,5): по кромке луга — песчаная полоса, к воде — пологий песчаный откос с пеной у кромки, к востоку от
// крепости — деревянный причал с Т-образной площадкой, по краям — скалистые мысы. Места высадки десанта у x = ±12,5:
// лодка встаёт носом к берегу у z ≈ 27,5, экипаж прыгает на луг (z ≈ 21–22,5) и идёт к точке лазанья на морской стене
// (x = ±12,5, z = 14). Полоса места высадки и путь к стене свободны: по бокам — пара швартовых столбиков, сети на
// шестах и куча сетей с поплавками, на песке — след килей, на траве — тропка к стене. Коллизий нет (сервер о береге не
// знает). Склеено по материалам (6 вызовов отрисовки), теней не отбрасывает.
import * as THREE from 'three';
import { WATER_Y } from '../../shared/constants.ts';
import { makeRng } from '../../shared/math.ts';
import { mergeColored, paint, place, staticMesh } from '../render/kit.ts';

/**
 * Места высадки (x). Совпадают с BOAT_LANE_X (лодка), SHORE_Z (куда прыгает экипаж) и морскими точками лазанья CLIMBS
 * в shared/fortkinds.ts и shared/fortmap.ts у агента fort.
 */
export const SHORE_LANDINGS: readonly number[] = [-12.5, 12.5];
/** Полуширина свободной полосы у места высадки: разброс лодки ±1 м, корпус ±0,7 м, прыжок экипажа ±1,5 м — с запасом */
export const SHORE_LANE_FREE = 3.2;
/** Свободно от стены (z = 14) до моря */
export const SHORE_LANE_Z = [14, 31] as const;
/** Причал: ось x, от берега до торца (z), ширина и верх настила, где начинается Т-площадка и её ширина */
export const SHORE_PIER = { x: 27, z0: 22.6, z1: 40.6, w: 2.4, top: 0.24, headZ: 37.4, headW: 6.6 } as const;

/** Край луга (дальше — откос к воде) и песок по x (дальше — скалистые мысы) */
const EDGE_Z = 24;
const SAND_X = 66;
/** Песок на лугу чуть выше травы (и смещение полигонов), чтобы не мерцал */
const SAND_Y = 0.02;

/** Кромка воды (z) — чуть волнистая */
function waterline(x: number): number {
  return 26.5 + 0.45 * Math.sin(x * 0.083 + 0.6) + 0.25 * Math.sin(x * 0.29 + 2.1);
}

/** Где на лугу начинается песок (z) */
function sandStart(x: number): number {
  return 19.9 + 0.55 * Math.sin(x * 0.07 + 1.1) + 0.3 * Math.sin(x * 0.23 + 0.3);
}

/** Строки профиля поперёк берега: u < 0 — ровный песок на лугу, 0…1 — откос до кромки воды, > 1 — под водой */
const PROFILE = [-1, -0.55, -0.2, 0, 0.12, 0.28, 0.45, 0.62, 0.78, 0.9, 1, 1.3, 1.9, 2.7];

function profileZ(x: number, u: number): number {
  const wl = waterline(x);
  if (u <= 0) return EDGE_Z + u * (EDGE_Z - sandStart(x));
  if (u <= 1) return EDGE_Z + u * (wl - EDGE_Z);
  return wl + (u - 1) * 2.8;
}

function profileY(u: number): number {
  if (u <= 0) return SAND_Y;
  if (u <= 1) return SAND_Y + (WATER_Y - SAND_Y) * (0.6 * u + 0.4 * u * u);
  return WATER_Y - (u - 1) * 0.75;
}

/** Берег целиком: вызывается один раз из FortWorld (вместо старого скалистого берега). */
export function buildShore(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fort-shore';
  const sand = sandTexture();
  group.add(sandBody(sand));
  group.add(sandEdges(sand));
  group.add(foam());
  group.add(rocks());
  group.add(woodwork());
  group.add(nets());
  scene.add(group);
  return group;
}

// ------------------------------------------------------------ песок

/** Точки по x: шаг 1 м, у мест высадки — мельче (след килей) */
function sandColumns(): number[] {
  const xs: number[] = [];
  for (let x = -SAND_X; x <= SAND_X + 1e-6; x += 1) xs.push(x);
  for (const l of SHORE_LANDINGS) for (let x = l - 3; x <= l + 3 + 1e-6; x += 0.25) xs.push(x);
  xs.sort((a, b) => a - b);
  return xs.filter((x, i) => i === 0 || x - xs[i - 1] > 0.05);
}

/** Откос и ровный песок: цвет вершин — множитель к текстуре (сухой светлее, у воды — мокрый темнее, след килей) */
function sandBody(map: THREE.Texture): THREE.Mesh {
  const xs = sandColumns();
  const rows = PROFILE.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const rng = makeRng(911);
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const wl = waterline(x);
    for (let r = 0; r < rows; r++) {
      const u = PROFILE[r];
      const z = profileZ(x, u);
      const y = profileY(u);
      pos.push(x, y, z);
      uv.push(x / 6, -z / 6);
      // сухой → влажный у кромки → мокрый под водой; пятна
      let k = 1.02 + (rng() - 0.5) * 0.07;
      if (u > 0.55) k *= 1 - Math.min(1, (u - 0.55) / 0.45) * 0.2;
      if (u > 1) k *= 0.78;
      // полоса выброшенных водорослей и ракушек (линия прилива)
      const tide = Math.exp(-((u - 0.4) * (u - 0.4)) / 0.004);
      let cr = k * (1 - tide * 0.12);
      let cg = k * (1 - tide * 0.08);
      let cb = k * (1 - tide * 0.16);
      // места высадки: утоптано у тропы, по оси — борозда от киля (от воды до луга)
      for (const l of SHORE_LANDINGS) {
        const d = Math.abs(x - l);
        if (z > 21.2 && d < 2.6) {
          const trod = (1 - d / 2.6) * 0.07;
          cr -= trod; cg -= trod; cb -= trod;
        }
        if (z > 22.3 && z < wl + 0.6 && d < 0.7) {
          const keel = (1 - d / 0.7) * 0.28;
          cr -= keel; cg -= keel * 1.05; cb -= keel * 1.1;
        }
      }
      col.push(cr, cg, cb);
    }
  }
  for (let i = 0; i < xs.length - 1; i++) {
    for (let r = 0; r < rows - 1; r++) {
      const a = i * rows + r;
      const b = (i + 1) * rows + r;
      // лицом вверх: обход против часовой, если смотреть сверху
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({
    map, vertexColors: true, roughness: 0.97, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });
  const mesh = staticMesh(g, m, false);
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Прозрачные края: переход травы в песок (мягкая кромка) и тропки от мест высадки к морской стене — лентами, как
 * грунтовки мира крепости.
 */
function sandEdges(map: THREE.Texture): THREE.Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const y = SAND_Y + 0.004;
  // кромка травы: от (sandStart − 1,8) с прозрачностью 0 до sandStart с 1; у концов песка — тоже гаснет
  {
    const base = pos.length / 3;
    let n = 0;
    for (let x = -SAND_X; x <= SAND_X + 1e-6; x += 1) {
      const z1 = sandStart(x) + 0.05;
      const z0 = z1 - 1.8 - 0.4 * Math.sin(x * 0.53);
      const endFade = Math.min(1, (SAND_X - Math.abs(x)) / 6);
      pos.push(x, y, z0, x, y, z1);
      uv.push(x / 6, -z0 / 6, x / 6, -z1 / 6);
      col.push(1, 1, 1, 0, 1.02, 1.02, 1.02, endFade);
      n++;
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  // тропки: от песка к точке лазанья на стене, 1,6 м шириной с мягкими краями, концы гаснут
  for (const l of SHORE_LANDINGS) {
    const s = Math.sign(l);
    const pts: Array<[number, number]> = [[l, 21.6], [l + s * 0.35, 19.6], [l - s * 0.15, 17.2], [l, 14.25]];
    const dense: Array<[number, number]> = [];
    for (let i = 0; i < pts.length - 1; i++) {
      for (let k = 0; k < 5; k++) {
        const t = k / 5;
        dense.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
      }
    }
    dense.push(pts[pts.length - 1]);
    const across = [-1.2, -0.55, 0.55, 1.2];
    const alpha = [0, 0.8, 0.8, 0];
    const base = pos.length / 3;
    for (let i = 0; i < dense.length; i++) {
      const [x, z] = dense[i];
      const [px, pz] = dense[Math.max(0, i - 1)];
      const [nx, nz] = dense[Math.min(dense.length - 1, i + 1)];
      let tx = nx - px;
      let tz = nz - pz;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      // ближний к песку конец сливается с песком, у стены — гаснет
      const ends = Math.min(1, i / 3, (dense.length - 1 - i) / 2);
      for (let k = 0; k < 4; k++) {
        const o = across[k];
        const vx = x - tz * o;
        const vz = z + tx * o;
        pos.push(vx, y + 0.002, vz);
        uv.push(vx / 6, -vz / 6);
        col.push(0.96, 0.95, 0.93, alpha[k] * ends);
      }
      if (i > 0) {
        const a = base + (i - 1) * 4;
        const b = base + i * 4;
        for (let k = 0; k < 3; k++) idx.push(a + k, b + k + 1, b + k, a + k, a + k + 1, b + k + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  const m = new THREE.MeshStandardMaterial({
    map, vertexColors: true, transparent: true, depthWrite: false, roughness: 0.97, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -3,
  });
  const mesh = staticMesh(g, m, false);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}

/** Пена у кромки воды: белая полоса с рваным краем, чуть «дышит» (сдвиг и прозрачность — перед отрисовкой). */
function foam(): THREE.Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const across = [-0.35, 0.15, 0.7, 1.4];
  let n = 0;
  for (let x = -SAND_X + 2; x <= SAND_X - 2 + 1e-6; x += 1) {
    const wl = waterline(x);
    for (let k = 0; k < 4; k++) {
      pos.push(x, WATER_Y + 0.025, wl + across[k]);
      uv.push(x / 7, k / 3);
    }
    n++;
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 4;
    const b = a + 4;
    for (let k = 0; k < 3; k++) idx.push(a + k, a + k + 1, b + k, b + k, a + k + 1, b + k + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.MeshBasicMaterial({ map: foamTexture(), transparent: true, depthWrite: false, opacity: 0.85, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 1;
  // прибой: полоса чуть наползает на песок и отходит
  mesh.onBeforeRender = () => {
    const t = performance.now() / 1000;
    mesh.position.z = Math.sin(t * 0.55) * 0.22;
    m.opacity = 0.72 + 0.18 * Math.sin(t * 0.55 + 1.2);
    mesh.updateMatrixWorld();
  };
  return mesh;
}

// ------------------------------------------------------------ камни

/** Скалистые мысы на концах песка, редкие валуны на пляже и в воде, дальше — обрыв, как был. */
function rocks(): THREE.Mesh {
  const rng = makeRng(23);
  const list: THREE.BufferGeometry[] = [];
  const rock = (x: number, y: number, z: number, r: number, c: number) => {
    const g = new THREE.IcosahedronGeometry(r, 0);
    g.scale(1 + rng() * 0.6, 0.55 + rng() * 0.35, 1 + rng() * 0.5);
    g.rotateY(rng() * Math.PI);
    list.push(place(paint(g, new THREE.Color(c).multiplyScalar(0.85 + rng() * 0.25)), x, y, z));
  };
  // обрыв за мысами: стенка от края луга к воде, у кромки — валуны
  for (const s of [-1, 1]) {
    const cliff = new THREE.PlaneGeometry(400, 1.8);
    cliff.translate(s * 260, WATER_Y + 0.35, EDGE_Z);
    list.push(paint(cliff, 0x8f8574));
  }
  for (let x = -260; x < 260; x += 1.6 + rng() * 1.8) {
    if (Math.abs(x) < SAND_X - 6) continue;
    rock(x, -0.3 - rng() * 0.6, 24.4 + rng() * 1.6, 0.8 + rng() * 1.3, 0x9b917e);
    if (rng() < 0.35) rock(x + rng(), WATER_Y + 0.1, 26.5 + rng() * 4, 0.5 + rng() * 1.1, 0x857b6a);
  }
  // мысы: груда крупных камней от луга в воду закрывает конец песка
  for (const s of [-1, 1]) {
    for (let i = 0; i < 16; i++) {
      const x = s * (SAND_X - 7 + rng() * 11);
      const z = 22.6 + rng() * 9;
      const y = z < EDGE_Z ? -0.15 : profileY(Math.min(2.7, (z - EDGE_Z) / (waterline(x) - EDGE_Z))) + 0.2;
      rock(x, y, z, 0.9 + rng() * 1.7, i % 3 ? 0x9b917e : 0x8a806e);
    }
  }
  // редкие валуны на пляже и в бухте — в стороне от мест высадки и причала
  const spots: Array<[number, number, number]> = [[-36, 23.2, 0.7], [-31.5, 25.8, 0.55], [-44, 27.6, 0.9], [-5.6, 27.6, 0.6],
    [6.4, 28.3, 0.5], [36.5, 23.4, 0.6], [41, 27.2, 0.85], [47.5, 23.9, 0.5], [-52, 24.6, 0.75]];
  for (const [x, z, r] of spots) {
    const u = (z - EDGE_Z) / (waterline(x) - EDGE_Z);
    rock(x, (z < EDGE_Z ? SAND_Y : profileY(Math.min(2.7, u))) - r * 0.25, z, r, 0x9d937f);
  }
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  return staticMesh(mergeColored(list), m, false);
}

// ------------------------------------------------------------ дерево: причал, столбики, шесты, мелочи

/** Раскрасить по функции от положения вершины (части с полосами: спасательный круг) */
function paintBy(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number, out: THREE.Color) => void): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const p = src.getAttribute('position');
  const arr = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), c);
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  src.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return src;
}

function woodwork(): THREE.Mesh {
  const rng = makeRng(37);
  const list: THREE.BufferGeometry[] = [];
  const tone = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number | THREE.Color, ry = 0) => {
    list.push(place(paint(new THREE.BoxGeometry(w, h, d), c), x, y, z, ry));
  };
  const cyl = (r: number, y0: number, y1: number, x: number, z: number, c: number | THREE.Color, seg = 8) => {
    list.push(place(paint(new THREE.CylinderGeometry(r, r * 1.04, y1 - y0, seg), c), x, (y0 + y1) / 2, z));
  };
  /** Свая: под водой тёмная, у воды — зелёная полоса водорослей, выше — серое дерево */
  const pile = (x: number, z: number, top: number) => {
    cyl(0.15, -2.6, WATER_Y - 0.2, x, z, 0x4a3b2d);
    cyl(0.155, WATER_Y - 0.2, WATER_Y + 0.3, x, z, 0x66703f);
    cyl(0.15, WATER_Y + 0.3, top, x, z, tone(0x7e6143, 0.9 + rng() * 0.2));
    if (top > SHORE_PIER.top + 0.1) list.push(place(paint(new THREE.SphereGeometry(0.15, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0x6a5038), x, top, z));
  };

  // --- причал
  const P = SHORE_PIER;
  const th = 0.07;
  const plank = 0.22;
  const woods = [0x9c7650, 0x8d6a47, 0xa8835b, 0x86633f, 0x977049];
  const deckStart = P.z0 + 0.6;
  for (let z = deckStart; z < P.z1 - plank / 2; z += plank + 0.028) {
    const head = z > P.headZ;
    const w = (head ? P.headW : P.w) + (rng() - 0.5) * 0.08;
    box(w, th, plank, P.x + (rng() - 0.5) * 0.05, P.top - th / 2, z + plank / 2, tone(woods[Math.floor(rng() * woods.length)], 0.9 + rng() * 0.18), (rng() - 0.5) * 0.012);
  }
  const under = P.top - th;
  // продольные балки под настилом
  for (const dx of [-0.95, 0, 0.95]) box(0.14, 0.16, P.z1 - deckStart, P.x + dx, under - 0.08, (deckStart + P.z1) / 2, 0x6e5238);
  for (const dx of [-2.9, -1.9, 1.9, 2.9]) box(0.14, 0.16, P.z1 - P.headZ, P.x + dx, under - 0.08, (P.headZ + P.z1) / 2, 0x6e5238);
  // каменный порог на берегу
  box(P.w + 0.7, 0.62, 1.5, P.x, under - 0.31, P.z0 + 0.75, 0xa89c84);
  box(P.w + 1.0, 0.3, 0.5, P.x, under - 0.62, P.z0 + 0.25, 0x968a74);
  // ряды свай с ригелями; через ряд — косые связи
  const rows = [25.7, 28.4, 31.1, 33.8, 36.5];
  rows.forEach((z, i) => {
    for (const s of [-1, 1]) pile(P.x + s * (P.w / 2 - 0.05), z, i === 2 && s > 0 ? P.top + 0.7 : under - 0.16);
    box(P.w + 0.32, 0.16, 0.2, P.x, under - 0.24, z, 0x6a4e35);
    if (i % 2 === 1) {
      const dx = P.w - 0.2;
      const dy = 0.72;
      const len = Math.hypot(dx, dy);
      for (const s of [-1, 1]) {
        const g = paint(new THREE.BoxGeometry(len, 0.11, 0.08), 0x5f4630);
        g.rotateZ(s * Math.atan2(dy, dx));
        list.push(place(g, P.x, -0.68, z + s * 0.06));
      }
    }
  });
  for (const z of [38.3, 40.4]) {
    for (const dx of [-(P.headW / 2 - 0.05), -1.15, 1.15, P.headW / 2 - 0.05]) {
      const corner = Math.abs(dx) > 2 && z > 40;
      pile(P.x + dx, z, corner ? P.top + 0.7 : under - 0.16);
    }
    box(P.headW + 0.3, 0.16, 0.2, P.x, under - 0.24, z, 0x6a4e35);
  }
  // бортики по краям настила
  const curb = 0x7a5a3c;
  for (const s of [-1, 1]) box(0.12, 0.1, P.headZ - deckStart, P.x + s * (P.w / 2 - 0.06), P.top + 0.05, (deckStart + P.headZ) / 2, curb);
  box(P.headW, 0.1, 0.12, P.x, P.top + 0.05, P.z1 - 0.06, curb);
  for (const s of [-1, 1]) {
    box(0.12, 0.1, P.z1 - P.headZ, P.x + s * (P.headW / 2 - 0.06), P.top + 0.05, (P.headZ + P.z1) / 2, curb);
    box(P.headW / 2 - P.w / 2, 0.1, 0.12, P.x + s * (P.headW + P.w) / 4, P.top + 0.05, P.headZ + 0.06, curb);
  }
  // фонарь на торце
  const lx = P.x;
  const lz = P.z1 - 0.35;
  box(0.16, 2.4, 0.16, lx, P.top + 1.2, lz, 0x6b4a2c);
  box(0.5, 0.08, 0.08, lx, P.top + 2.3, lz, 0x6b4a2c);
  box(0.34, 0.08, 0.34, lx + 0.22, P.top + 2.18, lz, 0x2f2a26);
  box(0.26, 0.34, 0.26, lx + 0.22, P.top + 1.97, lz, 0xffdc8a);
  box(0.34, 0.06, 0.34, lx + 0.22, P.top + 1.78, lz, 0x2f2a26);
  list.push(place(paint(new THREE.ConeGeometry(0.24, 0.16, 4).rotateY(Math.PI / 4), 0x2f2a26), lx + 0.22, P.top + 2.3, lz));
  // чугунные кнехты по углам торца и бухта каната
  for (const s of [-1, 1]) {
    const bx = P.x + s * (P.headW / 2 - 0.55);
    const bz = P.z1 - 0.45;
    list.push(place(paint(new THREE.CylinderGeometry(0.15, 0.19, 0.36, 12), 0x3b3f45), bx, P.top + 0.18, bz));
    list.push(place(paint(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12), 0x34373c), bx, P.top + 0.39, bz));
  }
  for (let i = 0; i < 3; i++) {
    list.push(place(paint(new THREE.TorusGeometry(0.3 - i * 0.05, 0.045, 6, 18), 0xc9b183), P.x - 2.05, P.top + 0.05 + i * 0.08, P.z1 - 1.0, 0, Math.PI / 2));
  }
  // спасательный круг на столбике
  const rx = P.x - P.headW / 2 + 0.25;
  const rz = P.headZ + 1.1;
  box(0.14, 1.5, 0.14, rx, P.top + 0.75, rz, 0x6b4a2c);
  const ring = paintBy(new THREE.TorusGeometry(0.33, 0.085, 8, 24), (x, y, _z, c) => {
    const a = Math.atan2(y, x) + Math.PI;
    c.set(Math.floor(a / (Math.PI / 4)) % 2 ? 0xf4efe6 : 0xe0442f);
  });
  ring.rotateY(Math.PI / 2);
  list.push(place(ring, rx - 0.12, P.top + 1.02, rz));
  // бочки и ящики на восточной стороне площадки
  const barrel = (x: number, z: number, c: number) => {
    list.push(place(paint(new THREE.CylinderGeometry(0.3, 0.3, 0.86, 14), c), x, P.top + 0.43, z));
    for (const y of [0.18, 0.68]) list.push(place(paint(new THREE.TorusGeometry(0.305, 0.022, 5, 16), 0x2e2a26), x, P.top + y, z, 0, Math.PI / 2));
  };
  barrel(P.x + 2.25, P.headZ + 0.75, 0x8a5a34);
  barrel(P.x + 2.85, P.headZ + 1.25, 0x7d5230);
  box(0.66, 0.6, 0.66, P.x + 1.55, P.top + 0.3, P.headZ + 0.62, 0xa47a4a, 0.3);
  box(0.5, 0.42, 0.5, P.x + 1.6, P.top + 0.81, P.headZ + 0.6, 0x9a6f42, -0.2);
  // лесенка к воде с восточного края площадки
  const ladX = P.x + P.headW / 2 + 0.06;
  for (const dz of [-0.26, 0.26]) box(0.07, 1.95, 0.07, ladX, WATER_Y + 0.5 + 0.97 - 0.5, 39.4 + dz, 0x6b4a2c);
  for (let i = 0; i < 6; i++) box(0.06, 0.05, 0.56, ladX, WATER_Y + 0.05 + i * 0.27, 39.4, 0x7d6043);

  // --- места высадки: швартовые столбики по бокам полосы, куча сетей с поплавками, шесты для сетей
  for (const l of SHORE_LANDINGS) {
    const s = Math.sign(l);
    for (const side of [-1, 1]) {
      const x = l + side * 3.6;
      const z = 24.45 + (side === s ? 0.15 : -0.05);
      const g = paint(new THREE.CylinderGeometry(0.15, 0.18, 1.85, 9), tone(0x735638, 0.95 + rng() * 0.1));
      g.rotateZ(side * 0.06);
      g.rotateX(0.05);
      list.push(place(g, x, 0.18, z));
      list.push(place(paint(new THREE.SphereGeometry(0.155, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0x5f462f), x + side * 0.055, 1.08, z + 0.045));
      list.push(place(paint(new THREE.TorusGeometry(0.19, 0.035, 6, 16), 0xd2bd8f), x + side * 0.04, 0.82, z + 0.03, 0, Math.PI / 2 + 0.1));
    }
    // канат от внешнего столбика провисает в воду
    const ox = l + s * 3.6;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(ox + s * 0.05, 0.8, 24.6),
      new THREE.Vector3(ox + s * 0.35, -0.05, 25.6),
      new THREE.Vector3(ox + s * 0.6, WATER_Y - 0.1, 27.4),
    ]);
    list.push(paint(new THREE.TubeGeometry(curve, 14, 0.028, 5, false), 0xc9b183));
    // куча сетей с поплавками на песке у внешнего столбика
    const hx = l + s * 5.7;
    const hz = 22.7;
    const heap = new THREE.IcosahedronGeometry(1, 1);
    heap.scale(0.95, 0.34, 0.72);
    heap.rotateY(rng() * 3);
    list.push(place(paint(heap, 0x6f6b4c), hx, SAND_Y, hz));
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2;
      const rr = 0.25 + rng() * 0.45;
      list.push(place(paint(new THREE.SphereGeometry(0.075, 8, 6), 0xf08a2a), hx + Math.cos(a) * rr * 0.95, SAND_Y + 0.24 - rr * 0.16, hz + Math.sin(a) * rr * 0.72));
    }
    // шесты для сушки сетей (сама сеть — в nets())
    for (const px of [l + s * 7.6, l + s * 11]) {
      const g = paint(new THREE.CylinderGeometry(0.06, 0.075, 2.2, 7), 0x7a5c3d);
      g.rotateZ(-s * 0.03 * (px === l + s * 7.6 ? -1 : 1));
      list.push(place(g, px, 1.08, 20.9));
    }
  }
  // старый якорь в песке у западного места высадки, ближе к бухте
  {
    const ax = -7.4;
    const az = 23.1;
    const iron = 0x4b4d52;
    const shank = paint(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8), iron);
    shank.rotateZ(1.05);
    list.push(place(shank, ax, 0.28, az, 0.4));
    const arm = paint(new THREE.TorusGeometry(0.42, 0.05, 6, 14, Math.PI), iron);
    arm.rotateZ(Math.PI + 1.05);
    list.push(place(arm, ax - 0.38, 0.06, az + 0.16, 0.4));
    list.push(place(paint(new THREE.TorusGeometry(0.12, 0.03, 6, 12), iron), ax + 0.52, 0.62, az - 0.24, 0.4));
  }
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 });
  const mesh = staticMesh(mergeColored(list), m, false);
  mesh.receiveShadow = true;
  return mesh;
}

/** Сети на шестах у мест высадки: провисают с верёвки, складки; поплавки по верхнему краю — в той же сетке цветом. */
function nets(): THREE.Mesh {
  const list: THREE.BufferGeometry[] = [];
  const floats: THREE.BufferGeometry[] = [];
  for (const l of SHORE_LANDINGS) {
    const s = Math.sign(l);
    const xa = l + s * 7.6;
    const xb = l + s * 11;
    const x0 = Math.min(xa, xb) + 0.08;
    const x1 = Math.max(xa, xb) - 0.08;
    const w = x1 - x0;
    const cols = 16;
    const rows = 6;
    const g = new THREE.PlaneGeometry(w, 1, cols, rows);
    const p = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i);
      const ly = p.getY(i) + 0.5; // 0 — низ, 1 — верх
      const t = (lx / w) * 2; // −1…1
      const top = 2.02 - 0.24 * (1 - t * t);
      const bottom = 0.42 + 0.1 * Math.sin(t * 5 + l);
      const y = bottom + (top - bottom) * ly;
      const fold = Math.sin(lx * 7.5) * 0.07 * (1 - ly * 0.7) + Math.sin(lx * 2.3 + 1) * 0.05;
      p.setXYZ(i, (x0 + x1) / 2 + lx, y, 20.9 + fold);
      uv.setXY(i, (lx + w / 2) / 0.6, (y - bottom) / 0.6);
    }
    g.computeVertexNormals();
    list.push(g);
    // верёвка и поплавки по верху
    for (let k = 0; k <= 9; k++) {
      const t = (k / 9) * 2 - 1;
      const fx = (x0 + x1) / 2 + (t * w) / 2;
      const fy = 2.02 - 0.24 * (1 - t * t);
      if (k > 0 && k < 9) floats.push(place(paint(new THREE.SphereGeometry(0.07, 8, 6), 0xf08a2a), fx, fy - 0.02, 20.9));
    }
  }
  const netGeo = mergeGeometriesKeepUv(list);
  const m = new THREE.MeshStandardMaterial({
    map: netTexture(), color: 0xf2e8d0, side: THREE.DoubleSide, roughness: 1, alphaTest: 0.35, alphaToCoverage: true,
  });
  const mesh = staticMesh(netGeo, m, false);
  // поплавки — отдельной склейкой в общий меш дерева не попадают (тут своя развёртка), их мало
  const fm = staticMesh(mergeColored(floats), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), false);
  mesh.add(fm);
  return mesh;
}

/** Склеить сетки с развёрткой (без цвета) */
function mergeGeometriesKeepUv(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  for (const g of list) count += (g.index ? g.index.count : g.getAttribute('position').count);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let o = 0;
  for (const src of list) {
    const g = src.index ? src.toNonIndexed() : src;
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++, o++) {
      pos[o * 3] = p.getX(i);
      pos[o * 3 + 1] = p.getY(i);
      pos[o * 3 + 2] = p.getZ(i);
      nor[o * 3] = n.getX(i);
      nor[o * 3 + 1] = n.getY(i);
      nor[o * 3 + 2] = n.getZ(i);
      uv[o * 2] = u.getX(i);
      uv[o * 2 + 1] = u.getY(i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------ текстуры (canvas при загрузке)

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** Мягкие пятна с переносом через края (тайлится без швов) */
function blotches(ctx: CanvasRenderingContext2D, S: number, count: number, rMin: number, rMax: number, color: string, alpha: number, rng: () => number): void {
  for (let i = 0; i < count; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const r = rMin + rng() * (rMax - rMin);
    ctx.globalAlpha = alpha * (0.4 + rng() * 0.6);
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
  ctx.globalAlpha = 1;
}

/** Песок: тёплый светлый, пятна, рябь от ветра, песчинки, ракушки и камешки. 512 px = 6 м. */
function sandTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(907);
  ctx.fillStyle = '#dcbe86';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, 26, 24, 96, 'rgba(240,218,170,1)', 0.4, rng);
  blotches(ctx, S, 20, 18, 70, 'rgba(186,150,96,1)', 0.28, rng);
  // рябь: волнистые светлые и тёмные гребешки (переносятся через край)
  for (let i = 0; i < 30; i++) {
    const y0 = rng() * S;
    const amp = 3 + rng() * 5;
    const ph = rng() * 6;
    for (const oy of [-S, 0, S]) {
      ctx.beginPath();
      for (let x = 0; x <= S; x += 8) {
        const y = y0 + oy + Math.sin((x / S) * Math.PI * 2 * 3 + ph) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = i % 2 ? 'rgba(250,236,200,0.16)' : 'rgba(150,118,70,0.13)';
      ctx.lineWidth = 2 + rng() * 2;
      ctx.stroke();
    }
  }
  for (let i = 0; i < 6000; i++) {
    const t = 140 + rng() * 110;
    ctx.fillStyle = `rgba(${t | 0},${(t * 0.86) | 0},${(t * 0.64) | 0},${(0.25 + rng() * 0.45).toFixed(2)})`;
    ctx.fillRect(rng() * S, rng() * S, 1 + (rng() < 0.1 ? 1 : 0), 1);
  }
  for (let i = 0; i < 70; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const shell = rng() < 0.45;
    ctx.fillStyle = shell ? (rng() < 0.5 ? '#fbf2e6' : '#f2cdbd') : `rgb(${130 + ((rng() * 50) | 0)},${120 + ((rng() * 40) | 0)},${100 + ((rng() * 30) | 0)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 1.5 + rng() * 2.5, 1 + rng() * 1.6, rng() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c);
}

/** Сеть: ромбы из бечёвки с узелками, прозрачная между нитями. 128 px = 0,6 м. */
function netTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  ctx.clearRect(0, 0, S, S);
  const step = 16;
  ctx.strokeStyle = 'rgba(206,192,150,1)';
  ctx.lineWidth = 2.2;
  for (let k = -S; k <= S * 2; k += step) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + S, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(k, S);
    ctx.lineTo(k + S, 0);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(150,134,96,1)';
  for (let x = 0; x <= S; x += step / 2) {
    for (let y = 0; y <= S; y += step / 2) {
      if (((x + y) / (step / 2)) % 2 !== 0) continue;
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return toTexture(c);
}

/** Пена: рваные белые клочья вдоль, поперёк — гуще у кромки (v ≈ 0,3), к морю тает. */
function foamTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  const rng = makeRng(919);
  ctx.clearRect(0, 0, W, H);
  for (let i = 0; i < 140; i++) {
    const x = rng() * W;
    const v = Math.min(1, Math.abs(rng() + rng() - 1) * 1.6);
    const y = H * (0.18 + v * 0.75);
    const r = 3 + rng() * 9 * (1 - v * 0.6);
    for (const ox of [-W, 0, W]) {
      const g = ctx.createRadialGradient(x + ox, y, 0, x + ox, y, r);
      g.addColorStop(0, `rgba(255,255,255,${(0.75 - v * 0.55).toFixed(2)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y - r, r * 2, r * 2);
    }
  }
  // сплошная тонкая линия наката у самой кромки
  const lg = ctx.createLinearGradient(0, 0, 0, H);
  lg.addColorStop(0, 'rgba(255,255,255,0)');
  lg.addColorStop(0.22, 'rgba(255,255,255,0.55)');
  lg.addColorStop(0.36, 'rgba(255,255,255,0.1)');
  lg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, W, H);
  const t = toTexture(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
