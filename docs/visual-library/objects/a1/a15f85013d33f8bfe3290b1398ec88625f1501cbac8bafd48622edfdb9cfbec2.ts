// Карта пряток «Рыбный двор»: компактный портовый двор 40×30 м. X — восток, Z — юг (море на юге и востоке).
// Отсюда берут и сервер (коллизия, слоты предметов, точки появления), и клиент (картинка ставится по тем же числам).
// Зоны: склад (север, внутри — стеллажи), погрузочный помост (северо-восток, 1,1 м), рынок с колодцем (центр),
// огородик с теплицей (запад), кафе-терраса (восток), лодочная с сараем смотрителя — базой ищущих (юг).
import type { GameMap, MapBox, Material } from './maps/types.ts';
import type { HideKind } from './hideprops.ts';

export const HIDE_BOUNDS = { minX: -20, maxX: 20, minZ: -15, maxZ: 15 } as const;

type Rect = { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number };
export interface Stall { readonly x: number; readonly z: number; /** +1 — покупатели с юга (+Z), −1 — с севера */ readonly face: 1 | -1 }

export const YARD = {
  warehouse: { x0: -17, x1: 3, z0: -15, z1: -7, h: 4.6, t: 0.3, doorH: 2.7, doors: [[-14.6, -12.6], [-1.6, 0.4]] as const },
  /** Стеллажи склада: низ полки на 0,45 м — под ней помещается ведро или лейка */
  shelves: [
    { x0: -15.6, x1: -11.2, z0: -12.7, z1: -12.0 }, { x0: -9.2, x1: -4.8, z0: -12.7, z1: -12.0 }, { x0: -2.8, x1: 1.6, z0: -12.7, z1: -12.0 },
    { x0: -13.4, x1: -9.0, z0: -10.3, z1: -9.6 }, { x0: -7.0, x1: -2.6, z0: -10.3, z1: -9.6 },
  ] as readonly Rect[],
  shelfLow: 0.45, shelfTop: 2.3,
  dock: { x0: 5, x1: 20, z0: -15, z1: -9.2, top: 1.1, stairX0: 8.6, stairX1: 10.6 },
  forklift: { x0: 12.4, x1: 13.6, z0: -14.6, z1: -12.6 },
  crane: { x: 18.7, z: -14.1 },
  kiosk: { x0: 16, x1: 20, z0: -8.2, z1: -5, h: 3 },
  shed: { x0: -19.6, x1: -14.8, z0: 9.6, z1: 14.6, h: 2.8, t: 0.2, doorZ0: 11.3, doorZ1: 12.9 },
  greenhouse: { x0: -19.6, x1: -15.2, z0: -4.6, z1: 1.6, h: 2.6, t: 0.06, doorZ0: -2.2, doorZ1: -0.8 },
  potting: { x0: -19.5, x1: -18.7, z0: -4.4, z1: 1.4, top: 0.8 },
  beds: [
    { x0: -14.6, x1: -12.2, z0: -4.2, z1: -2.6 }, { x0: -14.6, x1: -12.2, z0: -0.8, z1: 0.8 },
    { x0: -19.2, x1: -16.4, z0: 3.2, z1: 4.6 }, { x0: -14.6, x1: -12.2, z0: 3.6, z1: 5.2 },
  ] as readonly Rect[],
  bedH: 0.35,
  tree: { x: -17.6, z: 6.9 },
  /** Штакетник огородика по x = −10.6 с двумя калитками */
  fence: { x: -10.6, h: 0.9, parts: [[-5, -2.6], [-1, 3], [4.6, 8.6]] as const },
  stalls: [{ x: -5.8, z: -1.2, face: 1 }, { x: 2.6, z: -1.2, face: 1 }, { x: -5.8, z: 6, face: -1 }, { x: 2.6, z: 6, face: -1 }] as readonly Stall[],
  well: { x: -1.6, z: 2.4, half: 0.75, h: 0.85 },
  /** Столики кафе (неподвижные, под ними можно спрятаться маленьким) и какие из них с зонтом */
  tables: [[10.6, -2.6], [14, -2.6], [17.4, -2], [10.6, 1.2], [14, 1.2], [17.4, 2.6], [12, 5.4], [15.6, 6.2]] as readonly (readonly [number, number])[],
  umbrellas: [0, 1, 4, 6, 7],
  terrace: { x0: 8.4, x1: 19.85, z0: -4.6, z1: 8.8 },
  planters: [[19.2, -3], [19.2, 3], [19.2, 9.2]] as readonly (readonly [number, number])[],
  boat: { x0: -6.4, x1: -1.6, z0: 11.4, z1: 13, gap: 0.52, top: 1.25 },
  nets: { x0: 2.1, x1: 5.9, z: 13.9 },
  bollards: [-12, -8, 0, 7, 11, 16] as readonly number[],
  /** Сарай смотрителя: тут ищущие ждут конца подготовки и появляются снова */
  hunterSpawns: [[-18.2, 11], [-18.2, 12.2], [-18.2, 13.4], [-16.9, 11], [-16.9, 12.2], [-16.9, 13.4], [-15.8, 11.6], [-15.8, 12.8]] as readonly (readonly [number, number])[],
  /** Вокруг колодца: отсюда прячущиеся разбегаются */
  propSpawns: [0, 1, 2, 3, 4, 5, 6, 7].map(i => [Math.round((-1.6 + 2.7 * Math.cos(i * Math.PI / 4)) * 100) / 100, Math.round((2.4 + 2.7 * Math.sin(i * Math.PI / 4)) * 100) / 100] as const),
} as const;

/** Наборы, из которых слот каждый раунд берёт вид предмета. */
export const HIDE_POOLS: Readonly<Record<string, readonly HideKind[]>> = {
  barrel: ['barrel'], crate: ['crate'], sack: ['sack'], churn: ['churn'], pallet: ['pallet'], chair: ['chair'], pot: ['pot'],
  bench: ['bench'], cart: ['cart'], barrow: ['barrow'], buoy: ['buoy'], trap: ['trap'], gnome: ['gnome'],
  cargo: ['crate', 'sack', 'barrel', 'churn'],
  under: ['bucket', 'crate', 'sack', 'churn', 'can', 'trap'],
  low: ['bucket', 'can', 'trap'],
  garden: ['gnome', 'pot', 'can', 'gull', 'bucket'],
  sea: ['buoy', 'trap', 'bucket', 'crate'],
  small: ['bucket', 'pot', 'buoy', 'gnome', 'gull', 'can'],
  big: ['bench', 'barrow', 'cart', 'pallet'],
};

/** Слот предмета карты: где, как повёрнут (шаги по 15°), из какого набора и с какой высоты (грядка, помост). */
export interface HideSlot { readonly x: number; readonly z: number; readonly yaw: number; readonly pool: string; readonly y: number }
const slots: HideSlot[] = [];
const s = (x: number, z: number, yaw: number, pool: string, y = 0): void => { slots.push({ x, z, yaw, pool, y }); };

// --- склад внутри: ряд у северной стены, проходы между стеллажами, под полками, у дверей
for (const [x, pool] of [[-16.1, 'barrel'], [-15.3, 'barrel'], [-14.5, 'cargo'], [-12.6, 'crate'], [-11.8, 'cargo'], [-9.8, 'sack'], [-9.1, 'sack'], [-3.6, 'churn'], [-3, 'churn'], [-0.4, 'barrel'], [0.4, 'cargo'], [2.05, 'crate']] as const) s(x, -14.25, 0, pool);
s(-6.4, -14.15, 0, 'pallet');
for (const [x, z] of [[-13.4, -12.35], [-7, -12.35], [-0.6, -12.35], [-11.2, -9.95], [-4.8, -9.95]] as const) s(x, z, 0, 'low');
s(-16.1, -8.3, 0, 'barrel'); s(-11.5, -7.85, 0, 'crate'); s(-10.8, -7.85, 0, 'cargo'); s(-5.4, -7.85, 3, 'sack'); s(-4.7, -7.85, 0, 'sack');
s(2, -8.4, 0, 'barrel'); s(2.1, -9.3, 0, 'churn'); s(-8, -11.15, 6, 'crate'); s(-16.2, -11.1, 0, 'cargo');
// --- закуток между складом и помостом
s(3.5, -14.3, 0, 'barrel'); s(4.35, -14.3, 0, 'barrel'); s(4, -13.4, 0, 'crate'); s(3.6, -12.4, 2, 'sack');
// --- помост (1,1 м): поддоны у стены, ящики, мешки, ловушки
const D = YARD.dock.top;
s(6.4, -14.15, 0, 'pallet', D); s(7.75, -14.15, 0, 'pallet', D); s(9.4, -14.3, 0, 'crate', D); s(10.2, -14.3, 0, 'cargo', D);
s(15.2, -14.3, 0, 'barrel', D); s(16, -14.3, 0, 'barrel', D); s(11.4, -10, 0, 'sack', D); s(12.1, -10, 0, 'cargo', D);
s(17.8, -10.2, 0, 'trap', D); s(18.65, -10.2, 6, 'trap', D); s(6.2, -10, 0, 'crate', D); s(14.4, -10, 0, 'churn', D); s(14.9, -10, 0, 'churn', D);
s(11.4, -14.3, 0, 'big', D);
s(16.6, -8.7, 0, 'crate');
// --- кафе: стулья вокруг столиков, горшки вдоль перил, тележка мороженщика, скамейки
const chairsAt: Record<number, readonly ('n' | 's' | 'w' | 'e')[]> = { 0: ['n', 'w', 's'], 1: ['n', 'e', 's'], 2: ['w', 'e'], 3: ['w', 's', 'n'], 4: ['e', 's', 'n'], 5: ['w', 'n'], 6: ['w', 'e', 's'], 7: ['w', 'e', 'n'] };
YARD.tables.forEach(([tx, tz], i) => {
  for (const side of chairsAt[i] ?? []) {
    if (side === 'n') s(tx, tz - 0.86, 0, 'chair');
    else if (side === 's') s(tx, tz + 0.86, 12, 'chair');
    else if (side === 'w') s(tx - 0.86, tz, 6, 'chair');
    else s(tx + 0.86, tz, 18, 'chair');
  }
});
for (const z of [-1.5, -0.3, 0.9, 4.3, 5.5, 6.7]) s(19.35, z, 0, z < 2 ? 'pot' : 'small');
s(9.6, 7.9, 6, 'cart'); s(16.9, 8.7, 0, 'bench'); s(15.4, -4.2, 0, 'small'); s(14.7, -4.2, 0, 'small'); s(9, -3.7, 0, 'pot');
// --- рынок: под прилавками, за прилавками у продавцов, скамейки у колодца, тачка и тележка
for (const st of YARD.stalls) {
  const zu = st.z - st.face * 0.04;
  s(st.x - 0.75, zu, 0, 'under'); s(st.x + 0.75, zu, 0, 'under');
  s(st.x - 0.9, st.z - st.face * 0.98, 0, 'cargo'); s(st.x + 0.9, st.z - st.face * 0.98, 0, 'cargo');
}
s(-1.6, 0.3, 12, 'bench'); s(-1.6, 4.5, 0, 'bench'); s(-0.55, 1.35, 0, 'small'); s(-2.75, 3.45, 0, 'small');
s(-8.4, 2.4, 6, 'cart'); s(4.9, 2.4, 6, 'barrow'); s(5.4, -2.4, 0, 'cargo'); s(-8.5, -1.3, 0, 'cargo'); s(-8.5, 6.8, 0, 'cargo'); s(5.2, 7.2, 0, 'big');
// --- огородик: гномы и горшки на грядках, теплица, тачка, под деревом
const B = YARD.bedH;
s(-13.9, -3.4, 0, 'garden', B); s(-12.9, -3.4, 2, 'gnome', B); s(-13.7, 0, 0, 'garden', B); s(-12.9, 0.2, 22, 'garden', B);
s(-17.9, 3.9, 0, 'garden', B); s(-16.95, 3.9, 0, 'gnome', B); s(-13.4, 4.4, 0, 'garden', B);
s(-19.1, -3, 0, 'low'); s(-19.1, 0, 0, 'low'); s(-18.1, -4.15, 0, 'garden'); s(-17.3, -4.15, 0, 'pot'); s(-16.5, -4.15, 0, 'garden');
s(-16, 0.9, 0, 'pot'); s(-15.7, 2.6, 0, 'small'); s(-11.4, -4.4, 0, 'garden'); s(-15.4, 7.7, 3, 'barrow');
s(-16.5, 6.2, 0, 'sack'); s(-18.7, 7.6, 0, 'cargo'); s(-17.1, 8, 0, 'gnome'); s(-11.6, 6.6, 0, 'garden');
// --- лодочная: буи и ловушки, под лодкой, скамейки к морю, бочки у сарая
s(-7.3, 14.1, 0, 'buoy'); s(-6.85, 14.35, 0, 'sea'); s(2.4, 14.35, 0, 'buoy'); s(2.85, 12.8, 0, 'trap'); s(3.65, 12.8, 0, 'trap'); s(4.45, 12.8, 0, 'sea');
s(-5.2, 12.2, 0, 'low'); s(-3, 12.2, 6, 'low');
s(-10.6, 14.05, 0, 'bench'); s(8.8, 13.9, 0, 'bench'); s(12.6, 13.9, 0, 'bench');
s(-14.35, 10.15, 0, 'barrel'); s(-14.35, 13.85, 0, 'cargo'); s(-10, 10, 0, 'crate'); s(-9.2, 10, 0, 'cargo'); s(-11.8, 12.4, 4, 'barrow');
s(17.8, 12.4, 0, 'buoy'); s(18.6, 12.95, 0, 'sea'); s(16.9, 14.1, 0, 'trap'); s(14.8, 14.3, 0, 'small'); s(15.2, 10.9, 0, 'big');
s(0.6, 9.8, 0, 'cargo'); s(6.6, 10.4, 0, 'sea'); s(-0.9, 14.25, 0, 'buoy');

export const HIDE_SLOTS: readonly HideSlot[] = slots;

// ------------------------------------------------------------ коллизия

/** Цвет стёкол теплицы: по нему клиент рисует эти коробки прозрачными (коллизии всё равно, что это стекло). */
export const HIDE_GLASS = 0xbfe3e6;
const WALL = 0xb86a50, WOOD = 0xb07a4a, DARK_WOOD = 0x7b5332, PLASTER = 0xf1dcb8, STONE = 0xcfc7b6, METAL = 0x5b6670;

/** Твёрдые коробки двора. Порядок важен только клиенту: он красит их по material. */
export function buildHideMap(): GameMap {
  const boxes: MapBox[] = [];
  const add = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: Material, color: number): void => {
    boxes.push({ min: [x0, y0, z0], max: [x1, y1, z1], mat, color });
  };
  const b = HIDE_BOUNDS;
  // земля (брусчатка) и высокие невидимые стенки по краю: держат и предметы, и прыжки, но не ловят краску
  add(b.minX, -1, b.minZ, b.maxX, 0, b.maxZ, 'concrete', STONE);
  add(b.minX - 1, -1, b.minZ - 1, b.minX, 30, b.maxZ + 1, 'invisible', 0);
  add(b.maxX, -1, b.minZ - 1, b.maxX + 1, 30, b.maxZ + 1, 'invisible', 0);
  add(b.minX - 1, -1, b.minZ - 1, b.maxX + 1, 30, b.minZ, 'invisible', 0);
  add(b.minX - 1, -1, b.maxZ, b.maxX + 1, 30, b.maxZ + 1, 'invisible', 0);
  // западный забор
  add(-20.2, 0, b.minZ, -20, 2.2, b.maxZ, 'wood', DARK_WOOD);
  // склад: стены, проёмы дверей с перемычками, крыша
  const w = YARD.warehouse;
  add(w.x0, 0, w.z0, w.x1, w.h, w.z0 + w.t, 'brick', WALL);
  add(w.x0, 0, w.z0 + w.t, w.x0 + w.t, w.h, w.z1, 'brick', WALL);
  add(w.x1 - w.t, 0, w.z0 + w.t, w.x1, w.h, w.z1, 'brick', WALL);
  let x: number = w.x0;
  for (const [d0, d1] of w.doors) {
    add(x, 0, w.z1 - w.t, d0, w.h, w.z1, 'brick', WALL);
    add(d0, w.doorH, w.z1 - w.t, d1, w.h, w.z1, 'brick', WALL);
    x = d1;
  }
  add(x, 0, w.z1 - w.t, w.x1, w.h, w.z1, 'brick', WALL);
  add(w.x0 - 0.2, w.h, w.z0 - 0.2, w.x1 + 0.2, w.h + 0.3, w.z1 + 0.2, 'concrete', 0x8a5444);
  // стеллажи: ножки по углам, полки — сплошной блок от 0,45 м
  for (const r of YARD.shelves) {
    for (const [lx, lz] of [[r.x0, r.z0], [r.x1 - 0.08, r.z0], [r.x0, r.z1 - 0.08], [r.x1 - 0.08, r.z1 - 0.08]]) add(lx, 0, lz, lx + 0.08, YARD.shelfLow, lz + 0.08, 'metal', METAL);
    add(r.x0, YARD.shelfLow, r.z0, r.x1, YARD.shelfTop, r.z1, 'wood', WOOD);
  }
  // помост, его задняя стена, стенка в закутке у склада, лестница, погрузчик и основание крана
  const dk = YARD.dock;
  add(dk.x0, 0, dk.z0, dk.x1, dk.top, dk.z1, 'deck', 0xa88a64);
  add(w.x1, 0, dk.z0 - 0.4, dk.x1, 4, dk.z0, 'brick', WALL);
  for (let k = 0; k < 4; k++) add(dk.stairX0, 0, dk.z1 + (3 - k) * 0.4, dk.stairX1, (k + 1) * 0.275, dk.z1 + (4 - k) * 0.4, 'wood', WOOD);
  const f = YARD.forklift;
  add(f.x0, dk.top, f.z0, f.x1, dk.top + 1.9, f.z1, 'metal', 0xd9a531);
  add(YARD.crane.x - 0.5, dk.top, YARD.crane.z - 0.5, YARD.crane.x + 0.5, dk.top + 0.9, YARD.crane.z + 0.5, 'metal', METAL);
  // киоск кафе
  const k = YARD.kiosk;
  add(k.x0, 0, k.z0, k.x1, k.h, k.z1, 'concrete', PLASTER);
  // сарай смотрителя: стены с дверным проёмом на восток, крыша
  const sh = YARD.shed;
  add(sh.x0, 0, sh.z0, sh.x1, sh.h, sh.z0 + sh.t, 'wood', DARK_WOOD);
  add(sh.x0, 0, sh.z1 - sh.t, sh.x1, sh.h, sh.z1, 'wood', DARK_WOOD);
  add(sh.x0, 0, sh.z0 + sh.t, sh.x0 + sh.t, sh.h, sh.z1 - sh.t, 'wood', DARK_WOOD);
  add(sh.x1 - sh.t, 0, sh.z0 + sh.t, sh.x1, sh.h, sh.doorZ0, 'wood', DARK_WOOD);
  add(sh.x1 - sh.t, 0, sh.doorZ1, sh.x1, sh.h, sh.z1 - sh.t, 'wood', DARK_WOOD);
  add(sh.x1 - sh.t, 2.2, sh.doorZ0, sh.x1, sh.h, sh.doorZ1, 'wood', DARK_WOOD);
  add(sh.x0 - 0.2, sh.h, sh.z0 - 0.2, sh.x1 + 0.2, sh.h + 0.2, sh.z1 + 0.2, 'wood', 0x6b4630);
  // теплица: стеклянные стенки, дверь на восток, крыша; стеллаж для рассады
  const g = YARD.greenhouse;
  add(g.x0, 0, g.z0, g.x1, g.h, g.z0 + g.t, 'metal', HIDE_GLASS);
  add(g.x0, 0, g.z1 - g.t, g.x1, g.h, g.z1, 'metal', HIDE_GLASS);
  add(g.x0, 0, g.z0 + g.t, g.x0 + g.t, g.h, g.z1 - g.t, 'metal', HIDE_GLASS);
  add(g.x1 - g.t, 0, g.z0 + g.t, g.x1, g.h, g.doorZ0, 'metal', HIDE_GLASS);
  add(g.x1 - g.t, 0, g.doorZ1, g.x1, g.h, g.z1 - g.t, 'metal', HIDE_GLASS);
  add(g.x1 - g.t, 2.1, g.doorZ0, g.x1, g.h, g.doorZ1, 'metal', HIDE_GLASS);
  add(g.x0, g.h, g.z0, g.x1, g.h + 0.06, g.z1, 'metal', HIDE_GLASS);
  const pt = YARD.potting;
  add(pt.x0, pt.top - 0.06, pt.z0, pt.x1, pt.top, pt.z1, 'wood', WOOD);
  for (const lz of [pt.z0, (pt.z0 + pt.z1) / 2, pt.z1 - 0.07]) add(pt.x0, 0, lz, pt.x0 + 0.07, pt.top - 0.06, lz + 0.07, 'wood', WOOD);
  // грядки, яблоня, штакетник
  for (const bd of YARD.beds) add(bd.x0, 0, bd.z0, bd.x1, YARD.bedH, bd.z1, 'wood', DARK_WOOD);
  add(YARD.tree.x - 0.18, 0, YARD.tree.z - 0.18, YARD.tree.x + 0.18, 2.4, YARD.tree.z + 0.18, 'wood', 0x6b4a30);
  for (const [z0, z1] of YARD.fence.parts) add(YARD.fence.x - 0.06, 0, z0, YARD.fence.x + 0.06, YARD.fence.h, z1, 'wood', 0xf3ead8);
  // прилавки рынка: столешница, передняя и боковые стенки (сзади открыто — под прилавок можно залезть), столбы и навес
  for (const st of YARD.stalls) {
    const x0 = st.x - 1.5, x1 = st.x + 1.5, z0 = st.z - 0.45, z1 = st.z + 0.45, fz = st.z + st.face * 0.41;
    add(x0, 0.86, z0, x1, 0.96, z1, 'wood', WOOD);
    add(x0, 0, fz - 0.04, x1, 0.86, fz + 0.04, 'wood', 0xd8c39a);
    add(x0, 0, z0, x0 + 0.08, 0.86, z1, 'wood', 0xd8c39a);
    add(x1 - 0.08, 0, z0, x1, 0.86, z1, 'wood', 0xd8c39a);
    const back = st.z - st.face * 1.4;
    for (const px of [x0 + 0.02, x1 - 0.12]) for (const pz of [fz, back]) add(px, 0, pz - 0.05, px + 0.1, 2.4, pz + 0.05, 'wood', 0xe9e2d0);
    add(x0 - 0.1, 2.36, Math.min(back, st.z + st.face * 0.95) - 0.05, x1 + 0.1, 2.44, Math.max(back, st.z + st.face * 0.95) + 0.05, 'invisible', 0);
  }
  // колодец со столбиками крыши
  const wl = YARD.well;
  add(wl.x - wl.half, 0, wl.z - wl.half, wl.x + wl.half, wl.h, wl.z + wl.half, 'concrete', STONE);
  for (const dx of [-0.66, 0.58]) add(wl.x + dx, wl.h, wl.z - 0.04, wl.x + dx + 0.08, 2.2, wl.z + 0.04, 'wood', DARK_WOOD);
  // столики кафе: столешница на одной ножке (под столом прячется маленький), зонты — шест
  YARD.tables.forEach(([tx, tz], i) => {
    add(tx - 0.42, 0.7, tz - 0.42, tx + 0.42, 0.76, tz + 0.42, 'wood', 0xf2efe6);
    add(tx - 0.06, 0, tz - 0.06, tx + 0.06, 0.7, tz + 0.06, 'metal', 0x3d4a52);
    if ((YARD.umbrellas as readonly number[]).includes(i)) add(tx - 0.035, 0.76, tz - 0.035, tx + 0.035, 2.35, tz + 0.035, 'metal', 0xe9e2d0);
  });
  for (const [px, pz] of YARD.planters) add(px - 0.35, 0, pz - 0.35, px + 0.35, 0.55, pz + 0.35, 'wood', 0x8a5a3a);
  add(8.85, 0, -4.35, 9.25, 1.05, -4.25, 'wood', DARK_WOOD);
  // лодка вверх дном на козлах (под ней щель 0,52 м), рамы для сетей, кнехты
  const bt = YARD.boat;
  add(bt.x0, bt.gap, bt.z0, bt.x1, bt.top, bt.z1, 'wood', 0x2f7f8f);
  for (const lx of [bt.x0 + 0.35, bt.x1 - 0.45]) for (const lz of [bt.z0 + 0.15, bt.z1 - 0.25]) add(lx, 0, lz, lx + 0.1, bt.gap, lz + 0.1, 'wood', DARK_WOOD);
  for (const nx of [YARD.nets.x0, YARD.nets.x1]) add(nx - 0.05, 0, YARD.nets.z - 0.05, nx + 0.05, 2, YARD.nets.z + 0.05, 'wood', DARK_WOOD);
  for (const bx of YARD.bollards) add(bx - 0.18, 0, 14.42, bx + 0.18, 0.5, 14.78, 'metal', 0x2e3338);
  return { name: 'Рыбный двор', boxes, spawns: [], trampolines: [], pickups: [], deco: [], bounds: { ...HIDE_BOUNDS } };
}
