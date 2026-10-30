// «Ракушка»: геометрия площадки из данных — одна точка правды для сервера, клиента и тестов (docs/quiz/tech.md §2).
// Данные — shared/quiz/venue-data.json в МЕСТНЫХ координатах (начало — корень quiz_venue.glb, оси — оси GLB) плюс поле
// world {x, y, z, yaw}: где и как площадка стоит на набережной. Сменить место или размер (v3) — заменить файл, код тот же.
// Здесь только данные и чистые функции: без three.js, DOM и состояния игры.
import RAW from './venue-data.json' with { type: 'json' };

export type V2 = readonly [number, number];
export type V3 = readonly [number, number, number];

/** Точка с направлением: yaw как в игре — вперёд = (−sin yaw, −cos yaw) */
export interface VenueSpot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

/** Твёрдый прямоугольник по осям */
export interface VenueBox {
  readonly name: string;
  readonly min: V3;
  readonly max: V3;
}

/** Пандус: прямоугольник x0…x1 × z0…z1, высота yLow → yHigh по направлению rise (без поля — к сцене) */
export interface VenueRamp {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly yLow: number;
  readonly yHigh: number;
  readonly rise?: '+x' | '-x' | '+z' | '-z';
}

export interface VenuePult extends VenueSpot {
  readonly id: string;
  /** Где стоит игрок за пультом */
  readonly player: VenueSpot;
  readonly lamp: V3;
  /** Табличка счёта: четырёхугольник TL, TR, BR, BL; клетка в атласе — plateCell [x, y, w, h] */
  readonly plate: readonly V3[];
  readonly plateCell: readonly number[];
  readonly up: number;
  readonly down: number;
  readonly lampDrop: number;
}

export interface VenueChair extends VenueSpot {
  readonly id: string;
  readonly row: number;
  readonly seat: number;
}

/** Форма venue-data.json (поля — как в concepts_blender/quiz/glb/placement.json, координаты местные) */
export interface VenueData {
  readonly version: number;
  readonly world: { readonly x: number; readonly y?: number; readonly z: number; readonly yaw: number };
  readonly glb: { readonly venue: string; readonly chair: string; readonly pult: string; readonly easel: string };
  readonly stage: { readonly top: number; readonly poly: readonly V2[]; readonly ramps: readonly VenueRamp[] };
  readonly board: { readonly face: readonly V3[]; readonly canvas: readonly number[] };
  readonly riddler: VenueSpot;
  /** Куда вернуть загадывающего, если он до сцены стоял (нет поля — 2,4 м от точки загадывающего к залу, на пол) */
  readonly back?: VenueSpot;
  readonly podium: VenueSpot & { readonly host: VenueSpot };
  readonly zatejnik: { readonly stand: VenueSpot };
  readonly pults: readonly VenuePult[];
  readonly easel: {
    readonly park: VenueSpot; readonly show: VenueSpot; readonly drawer: VenueSpot;
    /** Холст на мольберте: ширина, высота, высота центра над полом и вынос вперёд от точки мольберта, м */
    readonly faceLocal?: { readonly w: number; readonly h: number; readonly centerY: number; readonly forward: number };
  };
  /** Камеры части 2 (по желанию; нет — считаются от табло и мольберта): «телекамера» пультов, ведущий, рисующий */
  readonly tvCam?: { readonly pos: V3; readonly target: V3; readonly fovV: number };
  readonly hostCam?: { readonly pos: V3; readonly target: V3; readonly fovV: number };
  readonly easelCam?: { readonly dist: number; readonly side: number; readonly up: number; readonly fovV: number };
  readonly chairs: readonly VenueChair[];
  readonly chairSeatY: number;
  readonly chairColliders?: readonly VenueBox[];
  readonly seatCam: { readonly back: number; readonly pivotAboveSeat: number; readonly up: number; readonly fovV: number; readonly lookYawDeg: number; readonly target: V3 };
  readonly stageCam: { readonly back: number; readonly pivotY: number; readonly up: number; readonly pitch: number; readonly fovV: number };
  /** Граница зоны «Ракушки» (внутри — игрок у площадки) и ограда v2 с аркой. У v3 без ограды арки нет */
  readonly fence: { readonly poly: readonly V2[]; readonly height: number; readonly arch?: { readonly x: number; readonly z0: number; readonly z1: number; readonly top: number } };
  /** v3: ограду не строить — fence.poly только граница зоны (клумбы, бордюр, мощение) */
  readonly noFence?: boolean;
  /** Где клиент прячет декор площади под площадкой (местные координаты); нет — по fence.poly */
  readonly decorClear?: readonly V2[];
  /** Вывеска «РАКУШКА» над аркой (у v3 может не быть — тогда статус только на табло и афише) */
  readonly sign?: { readonly face: readonly V3[]; readonly canvas: readonly number[] };
  readonly colliders: readonly VenueBox[];
}

/** Место, куда сервер «ставит» игрока (действие ACT_QUIZ, аргумент — номер места) */
export type QuizPlaceKind = 'chair' | 'pult' | 'podium' | 'riddler' | 'drawer';

export interface QuizPlace extends VenueSpot {
  /** Номер места: аргумент ACT_QUIZ */
  readonly i: number;
  readonly kind: QuizPlaceKind;
  /** Номер внутри своего вида: кресло 0…, пульт 0…5; у остальных 0 */
  readonly n: number;
  /** Сидит (поза на стуле) или стоит */
  readonly sit: boolean;
}

/** Камера места: откуда, куда смотрит, вертикальный FOV (градусы), сколько можно повернуть мышью (радианы) */
export interface QuizCam {
  readonly pos: V3;
  readonly target: V3;
  readonly fovV: number;
  readonly look: number;
}

/** Площадка в МИРОВЫХ координатах — то, чем пользуются сервер и клиент */
export interface QuizVenue {
  readonly data: VenueData;
  readonly world: VenueData['world'];
  /** Граница зоны — многоугольник по земле; арка — отрезок a–b и высота (null — без ограды, v3) */
  readonly fence: readonly V2[];
  readonly arch: { readonly a: V2; readonly b: V2; readonly top: number } | null;
  /** Середина ограды — для «далеко ли от «Ракушки»» */
  readonly center: V2;
  readonly stage: { readonly top: number; readonly poly: readonly V2[] };
  readonly board: { readonly face: readonly V3[]; readonly center: V3; readonly canvas: readonly number[] };
  readonly sign: { readonly face: readonly V3[]; readonly canvas: readonly number[] } | null;
  readonly chairs: readonly VenueSpot[];
  readonly chairSeatY: number;
  readonly pults: ReadonlyArray<Omit<VenuePult, 'x' | 'y' | 'z' | 'yaw' | 'player'> & VenueSpot & { readonly player: VenueSpot }>;
  readonly riddler: VenueSpot;
  readonly back: VenueSpot;
  readonly podium: VenueSpot;
  readonly host: VenueSpot;
  readonly zatejnik: VenueSpot;
  readonly easel: { readonly park: VenueSpot; readonly show: VenueSpot; readonly drawer: VenueSpot };
  /** Все места подряд: кресла, пульты (места игроков), трибуна (ведущий), точка загадывающего, место рисующего */
  readonly places: readonly QuizPlace[];
  /** Номер первого места каждого вида */
  readonly first: Readonly<Record<QuizPlaceKind, number>>;
  /** Твёрдое части 1: сцена, ракушка, ограда, сад и ступени пандусов. Без пультов и кресел */
  readonly solid: readonly VenueBox[];
  /** Твёрдое пультов — включается, только пока пульты подняты («Своя игра», часть 2) */
  readonly pultSolid: readonly VenueBox[];
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Местная точка → мировая (поворот как rotation.y в three.js) */
export function toWorld(w: VenueData['world'], x: number, y: number, z: number): V3 {
  const c = Math.cos(w.yaw), s = Math.sin(w.yaw);
  return [r3(w.x + x * c + z * s), r3((w.y ?? 0) + y), r3(w.z - x * s + z * c)];
}

/** Мировая точка → местная */
export function toLocal(w: VenueData['world'], x: number, y: number, z: number): V3 {
  const c = Math.cos(w.yaw), s = Math.sin(w.yaw), dx = x - w.x, dz = z - w.z;
  return [r3(dx * c - dz * s), r3(y - (w.y ?? 0)), r3(dx * s + dz * c)];
}

function spotW(w: VenueData['world'], p: VenueSpot): VenueSpot {
  const [x, y, z] = toWorld(w, p.x, p.y, p.z);
  return { x, y, z, yaw: r3(normYaw(p.yaw + w.yaw)) };
}

function boxW(w: VenueData['world'], b: VenueBox): VenueBox {
  const a = toWorld(w, b.min[0], b.min[1], b.min[2]), c = toWorld(w, b.max[0], b.max[1], b.max[2]);
  return { name: b.name, min: [Math.min(a[0], c[0]), a[1], Math.min(a[2], c[2])], max: [Math.max(a[0], c[0]), c[1], Math.max(a[2], c[2])] };
}

/** Угол в (−π, π] */
export function normYaw(a: number): number {
  let v = a % (Math.PI * 2);
  if (v <= -Math.PI) v += Math.PI * 2;
  if (v > Math.PI) v -= Math.PI * 2;
  return v;
}

/** Ступени пандуса (местные): твёрдое игры — только прямоугольники, шаг 0,2 м ниже STEP_HEIGHT */
export const RAMP_STEP = 0.2;
function rampSteps(m: VenueRamp, stagePoly: readonly V2[]): VenueBox[] {
  let rise = m.rise;
  if (!rise) {
    // без поля: высокий край — тот, что ближе к середине сцены
    const cx = stagePoly.reduce((s, p) => s + p[0], 0) / stagePoly.length, cz = stagePoly.reduce((s, p) => s + p[1], 0) / stagePoly.length;
    const dx = cx - (m.x0 + m.x1) / 2, dz = cz - (m.z0 + m.z1) / 2;
    rise = Math.abs(dx) * (m.z1 - m.z0) >= Math.abs(dz) * (m.x1 - m.x0) ? (dx > 0 ? '+x' : '-x') : (dz > 0 ? '+z' : '-z');
  }
  const n = Math.max(1, Math.ceil((m.yHigh - m.yLow) / RAMP_STEP - 1e-6));
  const out: VenueBox[] = [];
  for (let k = 0; k < n; k++) {
    // ступень k: от своей доли длины до высокого края, высотой yLow + (k+1)·шаг
    const top = Math.min(m.yHigh, m.yLow + (k + 1) * (m.yHigh - m.yLow) / n), u = k / n;
    const [x0, x1, z0, z1] =
      rise === '+x' ? [m.x0 + (m.x1 - m.x0) * u, m.x1, m.z0, m.z1]
      : rise === '-x' ? [m.x0, m.x1 - (m.x1 - m.x0) * u, m.z0, m.z1]
      : rise === '+z' ? [m.x0, m.x1, m.z0 + (m.z1 - m.z0) * u, m.z1]
      : [m.x0, m.x1, m.z0, m.z1 - (m.z1 - m.z0) * u];
    out.push({ name: `ramp_step`, min: [x0, m.yLow, z0], max: [x1, top, z1] });
  }
  return out;
}

/** Проверка формы файла при загрузке: понятная ошибка вместо падения где-то в игре */
export function checkVenueData(d: VenueData): void {
  const need: Array<[string, unknown]> = [['world', d.world], ['stage.poly', d.stage?.poly], ['board.face', d.board?.face], ['riddler', d.riddler],
    ['podium.host', d.podium?.host], ['zatejnik.stand', d.zatejnik?.stand], ['pults', d.pults], ['easel', d.easel], ['chairs', d.chairs],
    ['seatCam', d.seatCam], ['stageCam', d.stageCam], ['fence.poly', d.fence?.poly], ['colliders', d.colliders]];
  for (const [k, v] of need) if (v === undefined || v === null) throw new Error(`quiz/venue-data.json: нет поля ${k}`);
  if (d.fence.poly.length < 3) throw new Error('quiz/venue-data.json: граница зоны — меньше трёх точек');
  if (d.decorClear && d.decorClear.length < 3) throw new Error('quiz/venue-data.json: decorClear — меньше трёх точек');
  if (d.board.face.length !== 4 || (d.sign && d.sign.face.length !== 4)) throw new Error('quiz/venue-data.json: табло и вывеска — по 4 угла');
  if (Math.abs(Math.sin(2 * d.world.yaw)) > 1e-3) {
    throw new Error('quiz/venue-data.json: world.yaw должен быть кратен 90° (твёрдое — прямоугольники по осям)');
  }
}

/** Собрать мировую площадку из данных (сервер и клиент зовут один раз при загрузке модуля) */
export function buildVenue(d: VenueData): QuizVenue {
  checkVenueData(d);
  const w = d.world;
  const p2 = (p: V2): V2 => { const v = toWorld(w, p[0], 0, p[1]); return [v[0], v[2]]; };
  const p3 = (p: V3): V3 => toWorld(w, p[0], p[1], p[2]);
  const fence = d.fence.poly.map(p2);
  const riddler = spotW(w, d.riddler);
  const fwd = (s: VenueSpot, k: number): VenueSpot => ({ x: r3(s.x - Math.sin(s.yaw) * k), y: w.y ?? 0, z: r3(s.z - Math.cos(s.yaw) * k), yaw: normYaw(s.yaw + Math.PI) });
  const back = d.back ? spotW(w, d.back) : fwd(riddler, 2.4);
  const chairs = d.chairs.map((c) => spotW(w, c));
  const pults = d.pults.map((u) => ({ ...u, ...spotW(w, u), player: spotW(w, u.player), lamp: p3(u.lamp), plate: u.plate.map(p3) }));
  const podium = spotW(w, d.podium), host = spotW(w, d.podium.host);
  const easel = { park: spotW(w, d.easel.park), show: spotW(w, d.easel.show), drawer: spotW(w, d.easel.drawer) };
  const places: QuizPlace[] = [];
  const first = { chair: 0, pult: 0, podium: 0, riddler: 0, drawer: 0 };
  const add = (kind: QuizPlaceKind, s: VenueSpot, n: number, sit: boolean): void => { places.push({ ...s, i: places.length, kind, n, sit }); };
  first.chair = places.length;
  chairs.forEach((c, n) => add('chair', c, n, true));
  first.pult = places.length;
  pults.forEach((u, n) => add('pult', u.player, n, false));
  first.podium = places.length;
  add('podium', host, 0, false);
  first.riddler = places.length;
  add('riddler', riddler, 0, false);
  first.drawer = places.length;
  add('drawer', easel.drawer, 0, false);
  const face = d.board.face.map(p3);
  const center: V3 = [r3((face[0][0] + face[2][0]) / 2), r3((face[0][1] + face[2][1]) / 2), r3((face[0][2] + face[2][2]) / 2)];
  const ramps = d.stage.ramps.flatMap((m) => rampSteps(m, d.stage.poly));
  const isPult = (b: VenueBox): boolean => b.name.startsWith('pult');
  const fx = fence.reduce((s, p) => s + p[0], 0) / fence.length, fz = fence.reduce((s, p) => s + p[1], 0) / fence.length;
  return {
    data: d,
    world: w,
    fence,
    arch: d.fence.arch && !d.noFence ? { a: p2([d.fence.arch.x, d.fence.arch.z0]), b: p2([d.fence.arch.x, d.fence.arch.z1]), top: d.fence.arch.top } : null,
    center: [r3(fx), r3(fz)],
    stage: { top: (w.y ?? 0) + d.stage.top, poly: d.stage.poly.map(p2) },
    board: { face, center, canvas: d.board.canvas },
    sign: d.sign ? { face: d.sign.face.map(p3), canvas: d.sign.canvas } : null,
    chairs,
    chairSeatY: d.chairSeatY,
    pults,
    riddler,
    back,
    podium,
    host,
    zatejnik: spotW(w, d.zatejnik.stand),
    easel,
    places,
    first,
    solid: [...d.colliders.filter((b) => !isPult(b)), ...ramps].map((b) => boxW(w, b)),
    pultSolid: d.colliders.filter(isPult).map((b) => boxW(w, b)),
  };
}

export const QUIZ_VENUE_DATA = RAW as unknown as VenueData;
/** Площадка в мире — одна на процесс */
export const QUIZ_VENUE: QuizVenue = buildVenue(QUIZ_VENUE_DATA);

// ------------------------------------------------------------------ вопросы к геометрии

/** Точка внутри многоугольника (по земле, x–z), правило чётности */
export function inPoly(poly: readonly V2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Расстояние от точки до границы многоугольника */
export function polyEdgeDist(poly: readonly V2[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + ex * t), z - (az + ez * t)));
  }
  return best;
}

/** Выше этой высоты над землёй площадки — не «внутри» (самолёт, колесо обозрения над садом) */
export const QUIZ_AREA_TOP = 6;

/**
 * Внутри ограды? margin > 0 — с запасом наружу (граница голоса — 0,5 м, бриф «Голос»), margin < 0 — только глубже
 * границы на |margin|. Высоту проверяет inQuizArea.
 */
export function insideFence(x: number, z: number, margin = 0, v: QuizVenue = QUIZ_VENUE): boolean {
  const inside = inPoly(v.fence, x, z);
  if (margin === 0) return inside;
  const d = polyEdgeDist(v.fence, x, z);
  return margin > 0 ? inside || d <= margin : inside && d >= -margin;
}

/** Внутри «Ракушки» как игрок: внутри ограды и не выше QUIZ_AREA_TOP над её землёй */
export function inQuizArea(x: number, y: number, z: number, v: QuizVenue = QUIZ_VENUE): boolean {
  return y - (v.world.y ?? 0) < QUIZ_AREA_TOP && insideFence(x, z, 0, v);
}

/** На помосте сцены (в многоугольнике сцены и не ниже настила на 0,1 м) */
export function onStage(x: number, y: number, z: number, v: QuizVenue = QUIZ_VENUE): boolean {
  return y >= v.stage.top - 0.1 && inPoly(v.stage.poly, x, z);
}

/** Ближайшее кресло не дальше maxDist (номер кресла, не места; −1 — нет) */
export function nearestChair(x: number, z: number, maxDist = 1.2, v: QuizVenue = QUIZ_VENUE): number {
  let best = -1, bd = maxDist;
  v.chairs.forEach((c, i) => {
    const d = Math.hypot(c.x - x, c.z - z);
    if (d <= bd) { bd = d; best = i; }
  });
  return best;
}

/** Место по номеру (аргумент ACT_QUIZ) или null */
export function placeAt(i: number, v: QuizVenue = QUIZ_VENUE): QuizPlace | null {
  return Number.isInteger(i) && i >= 0 && i < v.places.length ? v.places[i] : null;
}

/** Номер места кресла n */
export function chairPlace(n: number, v: QuizVenue = QUIZ_VENUE): number {
  return v.first.chair + n;
}

/** Зрительская камера кресла (seatCam): со стула на центр табло, своя желейка не рисуется */
export function seatCamera(chair: VenueSpot, v: QuizVenue = QUIZ_VENUE): QuizCam {
  const c = v.data.seatCam, t = v.board.center;
  const hx = t[0] - chair.x, hz = t[2] - chair.z, hl = Math.hypot(hx, hz) || 1;
  const y = chair.y + v.chairSeatY + c.pivotAboveSeat + c.up;
  return { pos: [r3(chair.x - (hx / hl) * c.back), r3(y), r3(chair.z - (hz / hl) * c.back)], target: t, fovV: c.fovV, look: (c.lookYawDeg * Math.PI) / 180 };
}

/** Сценическая камера (stageCam): за исполнителем на сцене, выше и с наклоном вниз — весь зал в кадре */
export function stageCamera(spot: VenueSpot = QUIZ_VENUE.riddler, v: QuizVenue = QUIZ_VENUE): QuizCam {
  const c = v.data.stageCam, cp = Math.cos(c.pitch);
  const f: V3 = [-Math.sin(spot.yaw) * cp, Math.sin(c.pitch), -Math.cos(spot.yaw) * cp];
  const pos: V3 = [r3(spot.x - f[0] * c.back), r3(spot.y + c.pivotY - f[1] * c.back + c.up), r3(spot.z - f[2] * c.back)];
  return { pos, target: [r3(pos[0] + f[0]), r3(pos[1] + f[1]), r3(pos[2] + f[2])], fovV: c.fovV, look: (25 * Math.PI) / 180 };
}

/** «Телекамера» перед пультами («Своя игра», игрок за пультом): видно себя, свой пульт и табло за спиной.
 *  Нет в данных — 10,2 м от центра табло к залу, на высоте 2,8 м, смотрит чуть ниже центра табло */
export function tvCamera(v: QuizVenue = QUIZ_VENUE): QuizCam {
  const c = v.data.tvCam;
  if (c) return { pos: toWorld(v.world, ...c.pos), target: toWorld(v.world, ...c.target), fovV: c.fovV, look: (15 * Math.PI) / 180 };
  const f = v.board.face, t = v.board.center;
  // нормаль табло к залу: перпендикуляр к верхней кромке, в сторону середины ограды
  let nx = -(f[1][2] - f[0][2]), nz = f[1][0] - f[0][0];
  const nl = Math.hypot(nx, nz) || 1;
  nx /= nl; nz /= nl;
  if (nx * (v.center[0] - t[0]) + nz * (v.center[1] - t[2]) < 0) { nx = -nx; nz = -nz; }
  return { pos: [r3(t[0] + nx * 10.2), 2.8 + (v.world.y ?? 0), r3(t[2] + nz * 10.2)], target: [t[0], r3(t[1] - 1.2), t[2]], fovV: 44, look: (15 * Math.PI) / 180 };
}

/** Камера ведущего у трибуны: лица игроков за пультами и табло. Нет в данных — та же, что «телекамера» */
export function hostCamera(v: QuizVenue = QUIZ_VENUE): QuizCam {
  const c = v.data.hostCam;
  return c ? { pos: toWorld(v.world, ...c.pos), target: toWorld(v.world, ...c.target), fovV: c.fovV, look: (15 * Math.PI) / 180 } : tvCamera(v);
}

/** Камера рисующего: перед мольбертом на месте показа, холст крупно; своя желейка не рисуется */
export function easelCamera(v: QuizVenue = QUIZ_VENUE): QuizCam {
  const e = v.easel.show, fl = v.data.easel.faceLocal ?? { w: 1.52, h: 1.14, centerY: 1.62, forward: 0.125 };
  const c = v.data.easelCam ?? { dist: 2.3, side: 0.3, up: -0.2, fovV: 44 };
  const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw), rx = -Math.cos(e.yaw), rz = Math.sin(e.yaw);
  const cx = e.x + fx * fl.forward, cz = e.z + fz * fl.forward, cy = e.y + fl.centerY;
  const t: V3 = [r3(cx + rx * c.side), r3(cy), r3(cz + rz * c.side)];
  return { pos: [r3(t[0] + fx * c.dist), r3(cy + c.up), r3(t[2] + fz * c.dist)], target: t, fovV: c.fovV, look: 0 };
}
