// Павильоны новой набережной (флаг PLAZA3, пакет WP9): какой GLB где стоит и чистая математика по файлу GLB без three.js
// (узлы, их мировые матрицы, боксы col_*, пустышки anchor_*). Её берут игра (client/lobby/plaza3/pavilions.ts), тест
// test/plaza3-pavilions.test.ts и сверка коллайдеров с docs/plaza3/level/layout.json.
// Модели — concepts_blender/plaza3/pavilions/models (README.md, README-gq.md, README-pb.md, manifest*.json), в игре —
// client/assets/plaza3/*.glb. Оси GLB: +Y вверх, лицо павильона −Z; постановка — position = (x, 0, z), rotation.y = yaw.

/** Группа склейки: всё неподвижное группы — по одной сетке на семейство материала (p3_matte / p3_gloss / p3_glow) */
export type PavGroup = 'arenas' | 'cliffs' | 'farm' | 'games' | 'hub' | 'port' | 'beach' | 'pier';

/**
 * Чьё твёрдое у павильона: 'layout' — боксы col_* модели лежат в layout.json (colliders с полем pav = id, их рисует и
 * блокаут, пока модель не загрузилась); 'mode' — твёрдое задаёт режим в shared/<режим>.ts (WP3–WP8), модель только рисует.
 */
export type PavSolid = 'layout' | 'mode';

export interface PavPlace {
  /** id павильона: поле pav у боксов и декора блокаута в layout.json — их прячем, когда модель встала */
  id: string;
  file: string;
  x: number;
  z: number;
  yaw: number;
  /** Высота основания (y 0 модели) в мире; по умолчанию 0. Лавка Семёна стоит на помосте у мола — y −0,5 */
  y?: number;
  group: PavGroup;
  solid: PavSolid;
  /** Узлы live_*, которые игра двигает (остальные live — флажки и вымпелы — склеиваются с неподвижным) */
  live?: readonly string[];
}

const PI = Math.PI;

/**
 * Места — раскладка v5.1 (docs/plaza3/level/layout.json, pavilions/port; layout.md §14) и manifest*.json моделей.
 * Отличия от манифестов: Лавка Семёна — на помосте у сходней Маячного мола (11.10, отзыв владельца: «на пирсы после
 * маяка»; корень — port.semyon.root в layout.json), Рыбная витрина и доски у площади — по v5.1 (в манифестах их места временные).
 */
export const PAVILIONS: readonly PavPlace[] = [
  // Арены: улица z −29…−23 (README.md)
  { id: 'skytower', file: 'pav_skytower.glb', x: -7, z: -39, yaw: PI, group: 'arenas', solid: 'layout' },
  { id: 'paintball', file: 'pav_paintball.glb', x: 8, z: -37, yaw: PI, group: 'arenas', solid: 'layout' },
  { id: 'fort', file: 'pav_fort.glb', x: 26, z: -32, yaw: PI, group: 'arenas', solid: 'layout', live: ['live_fort_door_l', 'live_fort_door_r'] },
  { id: 'karting', file: 'pav_karting.glb', x: 40.5, z: -37, yaw: PI, group: 'arenas', solid: 'layout', live: ['live_door'] },
  // Скалы: скала с пещерой, вход игры plaza_entrance.glb — по anchor_entrance (строит DungeonEntrance)
  { id: 'dungeon_cliff', file: 'pav_dungeon_cliff_v2.glb', x: -18, z: -41, yaw: PI, group: 'cliffs', solid: 'layout' },
  // Огороды: арка (yaw не кратен 90°: col_* внутри узла повёрнуты на −yaw — в мире они по осям) и мельница поля
  { id: 'farm_arch', file: 'pav_farm_arch.glb', x: 55.1, z: -21.5, yaw: 1.8495, group: 'farm', solid: 'layout' },
  { id: 'windmill', file: 'pav_windmill.glb', x: 84, z: -62, yaw: 2.2092, group: 'farm', solid: 'mode', live: ['live_sails'] },
  // Игровой квартал (README-gq.md)
  { id: 'kursaal', file: 'pav_kursaal.glb', x: 61, z: -6.5, yaw: PI / 2, group: 'games', solid: 'layout' },
  { id: 'cafe', file: 'pav_cafe.glb', x: 49, z: 0, yaw: PI / 2, group: 'games', solid: 'layout', live: ['live_vane'] },
  { id: 'cardveranda', file: 'pav_cardveranda.glb', x: 38.25, z: -2.2, yaw: 0, group: 'games', solid: 'layout' },
  { id: 'billiards', file: 'pav_billiards.glb', x: 40.7, z: 17.7, yaw: 0, group: 'games', solid: 'mode' },
  { id: 'regatta_lookout', file: 'pav_regatta_lookout.glb', x: 56.5, z: 17.6, yaw: PI, group: 'games', solid: 'layout' },
  // фонтан Бульварного сквера (≤ 2,4 м — в коридоре вида на TIREDWOOD), вода пульсирует
  { id: 'fountain', file: 'pav_fountain.glb', x: 38, z: 7.3, yaw: 0, group: 'games', solid: 'layout', live: ['live_water'] },
  // Центр: ротонда и доски у площади (лицом на юг, к точке появления)
  { id: 'rotunda', file: 'pav_rotunda.glb', x: 15, z: 8.5, yaw: 0, group: 'hub', solid: 'layout' },
  { id: 'honor', file: 'pav_honor.glb', x: 4, z: -16.8, yaw: PI, group: 'hub', solid: 'layout' },
  { id: 'online', file: 'pav_online.glb', x: 17, z: -16.8, yaw: PI, group: 'hub', solid: 'layout', live: ['live_clock_hour', 'live_clock_minute'] },
  // Порт B «Маячный мол» (README-pb.md)
  { id: 'lighthouse_arch', file: 'pav_lighthouse_arch.glb', x: -19, z: 21.3, yaw: 0, group: 'port', solid: 'layout' },
  { id: 'sunset', file: 'pav_sunset.glb', x: -23, z: 15, yaw: PI / 2, group: 'port', solid: 'layout' },
  { id: 'fishyard', file: 'pav_fishyard.glb', x: -4, z: 13.4, yaw: PI, group: 'port', solid: 'mode' },
  { id: 'rats', file: 'pav_rats.glb', x: -0.4, z: 24.4, yaw: 0, group: 'port', solid: 'mode' },
  { id: 'swallow_gate', file: 'pav_swallow_gate.glb', x: 7.9, z: 21.3, yaw: 0, group: 'port', solid: 'mode' },
  { id: 'fishshowcase', file: 'pav_fishshowcase.glb', x: -12, z: 20.15, yaw: 0, group: 'port', solid: 'mode' },
  // Пляж
  { id: 'lifeguard', file: 'pav_lifeguard.glb', x: -27, z: 4.25, yaw: -PI / 2, group: 'beach', solid: 'layout' },
  { id: 'cabins', file: 'pav_cabins.glb', x: -27.5, z: -3, yaw: -PI / 2, group: 'beach', solid: 'layout' },
  {
    id: 'aeroclub', file: 'pav_aeroclub.glb', x: -28.1, z: -18.75, yaw: -PI / 2, group: 'beach', solid: 'layout',
    live: ['live_aeroclub_propeller', 'live_aeroclub_windsock'],
  },
  // Маяк и Маячный мол (мол — твёрдое порта WP4: port.decks)
  { id: 'mole', file: 'pav_mole.glb', x: -43, z: 45, yaw: 0, group: 'pier', solid: 'mode', live: ['live_mole_red_light'] },
  // Лавка Семёна — на помосте у сходней мола (южная сторона, к стоянке): крыльцо на север, к молу (11.10)
  { id: 'semyon', file: 'pav_semyon.glb', x: -58.6, z: 50.8, yaw: 0, y: -0.5, group: 'pier', solid: 'mode' },
  { id: 'lighthouse', file: 'pav_lighthouse.glb', x: -19, z: 43, yaw: 0, group: 'pier', solid: 'mode', live: ['live_lamp'] },
];

/** Библиотеки предметов: пустышка anchor_prop__<деталь>__NN ставит узел <деталь> из одного из этих файлов */
export const PROP_FILES: readonly string[] = [
  'pav_props.glb', 'pav_gq_props.glb', 'pb_props.glb',
  'kit_lights.glb', 'kit_embankment.glb', 'kit_green.glb', 'kit_street.glb', 'kit_arcade.glb', 'kit_awnings.glb',
];

/** Поля под холсты игры: узел-заглушка live_* не рисуется, холст встаёт по пустышке поля (центр, масштаб — полуразмеры, +Z наружу) */
export const BOARD_FIELDS = {
  honor: { pav: 'honor', anchor: 'anchor_board_honor', live: 'live_board_honor' },
  online: { pav: 'online', anchor: 'anchor_board_online', live: 'live_board_online' },
  records: { pav: 'fishshowcase', anchor: 'anchor_board_records', live: 'live_board_records' },
  jackpot: { pav: 'kursaal', anchor: 'anchor_jackpot_face', live: '' },
  // табло гонки: поле 2,2×1,5, табло игры 3,3×1,85 — встаёт «вписанным» (пропорции целы, по бокам/сверху поле модели), WP14a
  kart: { pav: 'karting', anchor: 'anchor_kboard_face', live: '' },
} as const;

/**
 * Заглушки, которые не рисуются: на экран крыши Склада №3 (live_screen, 8,4×3,7) встаёт холст Telegram (tgscreen.ts, свой
 * короб тогда прячется). Счёт матча — на вывеске пейнтбола (WP10); экран над воротами блокаута прячется, когда склад встал
 * (на его месте вывеска).
 */
export const SKIP_LIVE: readonly string[] = ['live_screen'];

/** Имя узла без суффикса повтора из Blender: «col_counter.001» → «col_counter» (в игре — исходное имя из userData.name) */
export function baseName(name: string): string {
  return name.replace(/\.\d{3}$/, '');
}

/** Пустышка предмета: «anchor_prop__lantern_wall__03» → «lantern_wall» */
export function propOf(name: string): string | null {
  const m = /^anchor_prop__(.+?)__\d+/.exec(name);
  return m ? m[1] : null;
}

// ------------------------------------------------------------ GLB без three.js (тесты и сверка)

export interface GltfNode {
  name?: string;
  children?: number[];
  mesh?: number;
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  extras?: Record<string, unknown>;
}

export interface GltfJson {
  scene?: number;
  scenes: Array<{ nodes: number[] }>;
  nodes: GltfNode[];
}

/** JSON-часть файла GLB (первый блок) */
export function glbJson(bytes: Uint8Array): GltfJson {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('не GLB');
  const len = dv.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len))) as GltfJson;
}

/** Матрица 4×4 по столбцам, как Matrix4.elements в three.js */
export type M4 = number[];

export function trs(t: readonly number[] = [0, 0, 0], q: readonly number[] = [0, 0, 0, 1], s: readonly number[] = [1, 1, 1]): M4 {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  const [sx, sy, sz] = s;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}

export function mul(a: M4, b: M4): M4 {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let v = 0;
      for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = v;
    }
  }
  return o;
}

export function apply(m: M4, p: readonly number[]): [number, number, number] {
  const [x, y, z] = p;
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}

/** Корень павильона в мире: сдвиг (x, y, z) (y по умолчанию 0) и поворот yaw вокруг вертикали */
export function rootMatrix(p: Pick<PavPlace, 'x' | 'z' | 'yaw' | 'y'>): M4 {
  return trs([p.x, p.y ?? 0, p.z], [0, Math.sin(p.yaw / 2), 0, Math.cos(p.yaw / 2)]);
}

export interface WorldNode {
  name: string;
  m: M4;
  node: GltfNode;
}

/** Все узлы файла с мировыми матрицами (root — матрица корня) */
export function worldNodes(j: GltfJson, root: M4): WorldNode[] {
  const out: WorldNode[] = [];
  const walk = (i: number, parent: M4): void => {
    const n = j.nodes[i];
    const m = mul(parent, n.matrix ? n.matrix.slice() : trs(n.translation, n.rotation, n.scale));
    out.push({ name: n.name ?? '', m, node: n });
    for (const c of n.children ?? []) walk(c, m);
  };
  for (const r of j.scenes[j.scene ?? 0].nodes) walk(r, root);
  return out;
}

export interface Aabb {
  name: string;
  min: [number, number, number];
  max: [number, number, number];
}

/** Бокс пустышки col_*: куб [−1; 1]³ в её матрице (центр + полуразмеры) — осевой бокс мира */
export function boxOf(name: string, m: M4): Aabb {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const p = apply(m, [sx, sy, sz]);
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k]);
      max[k] = Math.max(max[k], p[k]);
    }
  }
  return { name, min, max };
}

/** Боксы столкновений павильона в мире (col_*) */
export function pavColliders(j: GltfJson, p: PavPlace): Aabb[] {
  return worldNodes(j, rootMatrix(p)).filter((n) => n.name.startsWith('col_')).map((n) => boxOf(baseName(n.name), n.m));
}

/** Пустышка в мире: точка и yaw (0 — смотрит на −Z, как rotation.y) её локальной −Z; data — userData из Blender */
export interface AnchorAt {
  x: number;
  y: number;
  z: number;
  yaw: number;
  data: Record<string, unknown>;
}

export function pavAnchors(j: GltfJson, p: PavPlace): Map<string, AnchorAt> {
  const out = new Map<string, AnchorAt>();
  for (const n of worldNodes(j, rootMatrix(p))) {
    if (!n.name.startsWith('anchor_') || propOf(n.name) || n.name.startsWith('anchor_bulbs')) continue;
    const [x, y, z] = apply(n.m, [0, 0, 0]);
    // локальная −Z пустышки в мире → yaw как у rotation.y: направление (−sin yaw, −cos yaw)
    const d = apply(n.m, [0, 0, -1]);
    const yaw = Math.atan2(-(d[0] - x), -(d[2] - z));
    out.set(baseName(n.name), { x, y, z, yaw, data: n.node.extras ?? {} });
  }
  return out;
}
