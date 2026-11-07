// «Выше облаков» v3 — «Город вверх» (бриф docs/skyclimb/brief.md): долгая трасса вверх серпантином через порт, крыши,
// колесо обозрения, стройку, провода, шары и облака к колоколу. 28 флагов (0 — старт на пирсе, 27 — вершина).
// Всё, что держит ноги, — прямоугольные боксы, как во всей игре; каждый бокс — свой предмет (look), клиент рисует его
// ровно в этот бокс. Север — −z. Под каждым участком на 6 м вниз пусто: падение возвращает к флагу.
// Переходы (links) проверяются настоящей физикой: test/skill-climb-route.test.ts.
import type { MapBox, Vec3 } from './maps/types.ts';
import type {
  SkillBar, SkillBox, SkillCheckpoint, SkillCloud, SkillDisc, SkillLink, SkillLook, SkillMap, SkillMover, SkillPad, SkillRam,
  SkillRect, SkillSack, SkillStep, SkillTarget, SkillUpdraft, SkillWind,
} from './skillmap.ts';
import { RAM_PERIOD, type LineSchedule } from './skilltraps.ts';

export const CLIMB_FLAGS = 28;
/** Шаг волны облаков (тики): следующее облако тает на столько позже предыдущего */
export const CLIMB_CLOUD_STEP = 54;

const NORTH = 0;
const WEST = Math.PI / 2;
const SOUTH = Math.PI;
const EAST = -Math.PI / 2;
/** Низ портовых опор: штабели стоят в воде (море на −2) */
const WATER = -2;

type Dir = 'n' | 's' | 'e' | 'w';

interface Go {
  how?: SkillLink['how'];
  /** Толщина бокса вниз от верха (или down — абсолютный низ) */
  h?: number;
  down?: number;
  /** Это площадка следующего флага; значение — куда смотреть после возврата */
  cp?: number;
  kill?: number;
  bounce?: number;
  /** Откуда переход (иначе — середина текущей опоры) */
  from?: Vec3;
  /** Сдвиг вбок для step() */
  side?: number;
  link?: Partial<SkillLink>;
}

export function makeClimbMap(): SkillMap {
  const boxes: MapBox[] = [], pads: SkillPad[] = [], movers: SkillMover[] = [], clouds: SkillCloud[] = [], steps: SkillStep[] = [];
  const checkpoints: SkillCheckpoint[] = [], links: SkillLink[] = [], sacks: SkillSack[] = [], rams: SkillRam[] = [];
  const winds: SkillWind[] = [], shelters: SkillBox[] = [], updrafts: SkillUpdraft[] = [];
  const carousels: NonNullable<SkillMap['carousels']> = [];
  let sec = 0;
  let n = 0;
  let stairLength = 0;
  const addBox = (lo: Vec3, hi: Vec3): number => { boxes.push({ min: lo, max: hi, mat: 'deck', color: 0xffffff }); return boxes.length - 1; };
  const r6 = (v: number): number => Math.round(v * 1e6) / 1e6;
  const R = (x0: number, x1: number, z0: number, z1: number, y: number): SkillRect => ({ x0: r6(x0), x1: r6(x1), z0: r6(z0), z1: r6(z1), y: r6(y) });
  const C = (x: number, z: number, w: number, d: number, y: number): SkillRect => R(x - w / 2, x + w / 2, z - d / 2, z + d / 2, y);
  const mid = (r: SkillRect): Vec3 => [r6((r.x0 + r.x1) / 2), r.y, r6((r.z0 + r.z1) / 2)];
  const sub = (r: SkillRect, o: Partial<SkillRect>): SkillRect => ({ ...r, ...o });
  /** Прямоугольник рядом с base: ближний край в gap от дальнего края base по направлению dir, середина сдвинута вбок на side. */
  const rel = (dir: Dir, gap: number, w: number, d: number, y: number, side = 0, base: SkillRect = last): SkillRect => {
    const [cx, , cz] = mid(base);
    if (dir === 'n') return C(cx + side, base.z0 - gap - d / 2, w, d, y);
    if (dir === 's') return C(cx + side, base.z1 + gap + d / 2, w, d, y);
    if (dir === 'e') return C(base.x1 + gap + w / 2, cz + side, w, d, y);
    return C(base.x0 - gap - w / 2, cz + side, w, d, y);
  };
  const gapOf = (a: SkillRect, b: SkillRect): number => {
    const gx = Math.max(0, b.x0 - a.x1, a.x0 - b.x1), gz = Math.max(0, b.z0 - a.z1, a.z0 - b.z1);
    return Math.hypot(gx, gz);
  };
  const pad = (r: SkillRect, look: SkillLook, o: Go = {}, extra: Partial<SkillPad> = {}): SkillRect => {
    const lo = o.down ?? r.y - (o.h ?? .4);
    pads.push({ box: addBox([r.x0, lo, r.z0], [r.x1, r.y, r.z1]), look, sec, ...(o.bounce ? { bounce: o.bounce } : {}), ...extra });
    return r;
  };
  const solid = (lo: Vec3, hi: Vec3, look: SkillLook): void => { pads.push({ box: addBox(lo, hi), look, sec }); };

  let last: SkillRect = C(0, 0, 1, 1, 0);
  const link = (to: SkillTarget, how: SkillLink['how'], o: Partial<SkillLink> & { at3?: Vec3 } = {}): SkillLink => {
    const { at3, ...rest } = o;
    const p = at3 ?? mid(last);
    const l: SkillLink = { name: `${sec + 1}: ${++n} ${how}`, x: p[0], y: p[1], z: p[2], to, how, ...rest };
    links.push(l);
    return l;
  };
  /** Срезка для умелых: прыжок с a сразу на b мимо опор между ними (в пределах участка), разбег — с дальнего края a. */
  const cut = (name: string, a: SkillRect, b: SkillRect): void => {
    const [ax, , az] = mid(a), [bx, , bz] = mid(b);
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const x = Math.min(a.x1 - .45, Math.max(a.x0 + .45, ax - (bx - ax) / len * 9));
    const z = Math.min(a.z1 - .45, Math.max(a.z0 + .45, az - (bz - az) / len * 9));
    links.push({ name: `${sec + 1}: срезка ${name}`, x: r6(x), y: a.y, z: r6(z), to: b, how: 'jump', alt: true });
  };
  /** Флаг на площадке r: следующий участок начинается здесь. */
  const flag = (r: SkillRect, look: SkillLook, yaw: number, o: Go): void => {
    sec = checkpoints.length;
    n = 0;
    pad(r, look, o, { cp: checkpoints.length });
    const [px, , pz] = mid(r);
    checkpoints.push({ ...r, px, pz, yaw, kill: o.kill ?? r.y - 6, sec });
  };
  /** Следующая опора пути: переход с текущей, затем она — текущая. */
  const go = (r: SkillRect, look: SkillLook, o: Go = {}): SkillRect => {
    const how = o.how ?? (r.y - last.y > .55 || gapOf(last, r) > .7 ? 'jump' : 'walk');
    link(r, how, { ...(o.from ? { at3: o.from } : {}), ...o.link });
    if (o.cp !== undefined) flag(r, look, o.cp, o);
    else pad(r, look, o);
    last = r;
    return r;
  };
  const step = (dir: Dir, gap: number, dy: number, w: number, d: number, look: SkillLook, o: Go = {}): SkillRect =>
    go(rel(dir, gap, w, d, last.y + dy, o.side ?? 0), look, o);
  /** Подвижная опора по отрезку: top — середина верха в начале хода. */
  const line = (look: SkillLook, w: number, d: number, h: number, top: Vec3, by: Vec3, sched: LineSchedule, bounce?: number): number => {
    movers.push({
      box: addBox([top[0] - w / 2, top[1] - h, top[2] - d / 2], [top[0] + w / 2, top[1], top[2] + d / 2]), look, sec, kind: 'line', w, d, h,
      x: top[0], y: top[1], z: top[2], dx: by[0], dy: by[1], dz: by[2], sched, r: 0, period: 0, phase: 0, ...(bounce ? { bounce } : {}),
    });
    return movers.length - 1;
  };
  /** Борта кабины 0,89 м: 'x' — по бокам ±x (вход и выход по z), 'z' — по бокам ±z, 'xz' — со всех сторон. */
  const walls = (i: number, sides: 'x' | 'z' | 'xz'): void => {
    const m = movers[i], w = m.w / 2, d = m.d / 2, e = .055, hgt = .89;
    const out: Array<[Vec3, Vec3]> = [];
    if (sides !== 'x') out.push([[-w, 0, -d], [w, hgt, -d + e]], [[-w, 0, d - e], [w, hgt, d]]);
    if (sides !== 'z') out.push([[-w, 0, -d], [-w + e, hgt, d]], [[w - e, 0, -d], [w, hgt, d]]);
    m.bodies = out.map(([min, max]) => ({ box: addBox([...min], [...max]), min, max }));
  };
  const moverRect = (i: number, u: 0 | 1): SkillRect => {
    const m = movers[i];
    return C(m.x + m.dx * u, m.z + m.dz * u, m.w, m.d, m.y + m.dy * u);
  };
  /** С подвижной опоры i на r (в тики at её цикла). */
  const ride = (i: number, r: SkillRect, look: SkillLook, how: SkillLink['how'], at: number[], o: Go = {}): SkillRect => {
    links.push({ name: `${sec + 1}: ${++n} ${how} (с ${movers[i].look})`, x: 0, y: 0, z: 0, from: i, to: r, how, at, ...o.link });
    if (o.cp !== undefined) flag(r, look, o.cp, o);
    else pad(r, look, o);
    last = r;
    return r;
  };
  const sack = (x: number, top: number, z: number, axis: 'x' | 'z', phase: number, o: Partial<SkillSack> = {}): void => {
    const len = o.len ?? 6;
    sacks.push({ px: x, py: top + .85 + len, pz: z, len, amp: .75, period: 216, phase, axis, r: .72, sec, ...o });
  };
  const wind = (r: SkillRect, dx: number, dz: number, phase: number, above = 3): void => {
    winds.push({ x0: r.x0 - .6, x1: r.x1 + .6, z0: r.z0 - .6, z1: r.z1 + .6, y0: r.y - 1, y1: r.y + above, dx, dz, phase, sec });
  };
  const shelter = (r: SkillRect, above = 2.6): void => { shelters.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0: r.y - .2, y1: r.y + above }); };
  /** Осыпающаяся ступень: s — место на пути волны обвала (м), t0 — сдвиг цикла группы. */
  const crumble = (r: SkillRect, s: number, t0: number, look: SkillLook, how: SkillLink['how'], o: Partial<SkillLink> = {}): SkillRect => {
    // проверка перехода по отдельности — в начале цикла группы (все ступени на месте)
    link(r, how, { at: [t0, t0 + 60, t0 + 150], every: 600, ...o });
    steps.push({ box: addBox([r.x0, r.y - .45, r.z0], [r.x1, r.y, r.z1]), s, corner: false, rect: r, sec, look, t0 });
    stairLength = Math.max(stairLength, s);
    last = r;
    return r;
  };

  // ================================================================ 1. ПОРТ (0 → 13): юг, у воды, на север
  // ---------------------------------------------------------------- 0. Ящики: ящики и бочки, качающаяся лодка
  const start = C(0, 100, 10, 8, 0);
  flag(start, 'pier', NORTH, { down: WATER, kill: -6 });
  last = start;
  const crateA = step('n', 1.4, 1.0, 2, 2, 'crate', { side: -2, down: WATER });
  step('n', 1.5, .5, 1.1, 1.1, 'barrel', { side: -1.2, down: WATER });
  const crateD = step('w', 1.2, .5, 1.6, 1.6, 'crate', { down: WATER });
  cut('с ящика мимо бочки', crateA, crateD);
  // Лодка: палуба 2,6 × 6 качается на волне 0,4 ↔ 1,6. С ящика — вниз на неё; наверху волны — прыжок на ящик +1.
  const boat = line('boat', 2.6, 6, .5, [mid(crateD)[0], .4, crateD.z0 - .4 - 3], [0, 1.2, 0], { rest: 45, go: 75, stay: 45, back: 75, phase: 0 });
  link({ movers: [boat] }, 'walk', { at: [0, 60, 120, 180], every: 240 });
  ride(boat, rel('n', 1.6, 2, 2, 2.6, 0, moverRect(boat, 1)), 'crate', 'jump', [112, 122, 132, 142], { down: WATER });
  step('n', 1.3, 1.0, 1.1, 1.1, 'barrel', { side: 1.6, down: WATER });
  step('e', .3, .5, 1.8, 1.8, 'crate', { down: WATER });
  step('n', 1.6, 1.0, 2, 2, 'crate', { side: .5, down: WATER });
  step('n', 1.3, 1.0, 6, 2.5, 'container', { side: 1.5, down: WATER, cp: EAST });

  // ---------------------------------------------------------------- 1. Контейнеры: штабели разной высоты, ящики-ступени
  const b1 = step('e', 3.4, .9, 2.5, 6, 'container', { side: -1.5, down: WATER });
  go(C(mid(b1)[0], b1.z0 + .75, 1.2, 1.2, b1.y + 1), 'crate', { h: 1 });
  go(rel('n', 3.6, 6, 2.5, 8.5, -2, b1), 'container', { down: WATER });
  const d1 = step('w', 3.0, 1.0, 2.5, 6, 'container', { side: -2, down: WATER });
  go(C(mid(d1)[0], d1.z1 - 1.1, 1.4, 1.4, d1.y + 1), 'crate', { h: 1 });
  go(C(mid(d1)[0], d1.z0 + 1.5, 1.2, 1.2, d1.y + 2), 'crate', { h: 2 });
  const e1 = go(rel('n', 3.4, 6, 2.5, d1.y + 2.5, 2.5, d1), 'container', { down: WATER });
  // длинный прыжок на низкий штабель и ящик-ступень
  const lowStack = go(rel("e", 4.2, 2.5, 4, e1.y, -.5, e1), 'container', { down: WATER });
  go(C(mid(lowStack)[0], lowStack.z0 + .7, 1.2, 1.2, lowStack.y + 1), "crate", { h: 1 });
  const cp2 = go(rel("n", 2.0, 2.5, 6, lowStack.y + 1.5, 1.2, lowStack), 'container', { down: WATER, cp: WEST });

  // ---------------------------------------------------------------- 2. Сети: узкие трапы между штабелями, качаются сетки с рыбой
  const zNet = cp2.z0 + 1.05;
  pad(R(-.9, cp2.x0 - .05, zNet - .5, zNet + .5, cp2.y), 'gangway', { h: .3 });
  sack(2.6, cp2.y, zNet, 'z', 0);
  go(R(-5.45, -.95, zNet - 1.25, zNet + 1.25, cp2.y + .5), 'container', { down: WATER, from: [cp2.x0 + .5, cp2.y, zNet], how: 'walk' });
  pad(R(-12.5, -5.5, zNet - .5, zNet + .5, last.y), 'gangway', { h: .3 });
  sack(-7.4, last.y, zNet, 'z', 72);
  sack(-10.6, last.y, zNet, 'z', 144);
  const s2 = go(R(-17.05, -12.55, zNet - 1.25, zNet + 1.25, last.y + .5), 'container', { down: WATER, how: 'walk' });
  pad(R(-15.3, -14.3, s2.z0 - 6, s2.z0, s2.y), 'gangway', { h: .3 });
  sack(-14.8, s2.y, s2.z0 - 3, 'x', 40, { period: 200 });
  const s3 = go(R(-17.05, -12.55, s2.z0 - 8.5, s2.z0 - 6, s2.y + .5), 'container', { down: WATER, how: 'walk', from: [-14.8, s2.y, s2.z0 + .4] });
  const zK = mid(s3)[2];
  go(C(-16.2, zK, 1.4, 1.4, last.y + 1), 'crate', { h: 1 });
  go(C(-18.7, zK, 1.2, 1.2, last.y + 1), 'crate', { down: WATER });
  go(C(-20.4, zK + 1.9, 1.1, 1.1, last.y + 1), 'barrel', { down: WATER });
  const cp3 = go(R(-23.5, -20.5, last.z1 + .65, last.z1 + 2.85, last.y + 1), 'pier', { down: WATER, cp: SOUTH });

  // ---------------------------------------------------------------- 3. Портовый кран: перекладины ноги, кабина, стрела, челнок
  for (let k = 1; k <= 9; k++) go(C(k % 2 ? -23.3 : -20.7, cp3.z1 + 1.25 + 1.6 * (k - 1), 1.8, .7, cp3.y + 1.1 * k), 'rung', { h: .3 });
  const cab = go(R(-23.5, -20.5, last.z1 + .3, last.z1 + 2.3, last.y + 1), 'cab', { h: 2.4 });
  const boom = pad(R(-26, -25, 44, cab.z1, cab.y + 1), 'jib', { h: .6 });
  link(sub(boom, { z0: boom.z1 - 5 }), 'jump', { at3: [cab.x0 + .6, cab.y, mid(cab)[2]] });
  last = sub(boom, { z0: boom.z1 - 5 });
  sack(-25.5, boom.y, boom.z0 + 7, 'x', 0, { len: 5, amp: .7, period: 190, r: .7 });
  // по стреле к её концу (крюк качается поперёк)
  go(sub(boom, { z1: boom.z0 + 3 }), 'jib', { how: 'walk', from: [-25.5, boom.y, boom.z1 - 2] });
  pads.pop(); boxes.pop();
  const shuttle = line('shuttle', 2.5, 4, 1, [-25.5, boom.y - 1, boom.z0 - .2 - 2], [0, 6.1, -10], { rest: 120, go: 360, stay: 120, back: 360, phase: 0 });
  link({ movers: [shuttle] }, 'walk', { at3: [-25.5, boom.y, boom.z0 + 1], at: [10, 40, 70], every: 960 });
  const roof4 = R(-31, -20, 19.8, moverRect(shuttle, 1).z0 - .2, moverRect(shuttle, 1).y + 1);
  ride(shuttle, roof4, 'roof', 'jump', [480, 500, 520, 540], { h: 14, cp: EAST });

  // ================================================================ 2. КРЫШИ СТАРОГО ГОРОДА (36 → 53): на восток, потом вверх
  // ---------------------------------------------------------------- 4. Бельевые верёвки: узкие доски между крышами
  const H = 12;
  go(R(-20, -14.5, 23.65, 24.35, 36), 'plank', { h: .25, from: [-21, 36, 24] });
  step('e', 0, .5, 6, 6, 'roof', { h: H, side: -1 });
  go(R(last.x1, last.x1 + 7, 21.7, 22.3, last.y), 'plank', { h: .25 });
  step('e', 1.3, .5, 6, .7, 'plank', { h: .25 });
  step('e', 0, .5, 6, 7, 'roof', { h: H, side: 1 });
  go(R(last.x1, last.x1 + 6, 24.7, 25.3, last.y), 'plank', { h: .25 });
  step('e', 0, 1, 5, 6, 'roof', { h: H });
  step('e', 0, 0, 4.5, .7, 'plank', { h: .25 });
  step('e', 1.5, 1, 4, .8, 'plank', { h: .25 });
  const cp5 = go(R(last.x0 - 1, last.x1 + 3, 14, last.z0 - 1.4, last.y + 1), 'roof', { h: H, cp: WEST });

  // ---------------------------------------------------------------- 5. Маркизы: полосатые навесы-батуты на балконы выше
  // Высокий дом T5 к северу от флага 5: балконы и маркизы на его южной стене (над флагом), подъём — диагональю на запад.
  const zf = cp5.z0 - .1;
  const roof6y = cp5.y + 15;
  const t5 = R(cp5.x0 - 19, cp5.x1 + 1, 2, zf, roof6y);
  const awn = (x: number, y: number): SkillRect => C(x, zf + 1.05, 2.6, 2, y);
  const bal = (x: number, y: number): SkillRect => C(x, zf + 1.0, 3, 1.9, y);
  const a1 = go(awn(cp5.x1 - 1.5, cp5.y + .4), 'awning', { h: .4, bounce: 14.5, how: 'walk', link: { spring: true } });
  const b2 = go(bal(a1.x0 - 2.2, a1.y + 3.4), 'balcony', { h: .3, how: 'bounce', link: { flow: true } });
  const a2 = go(awn(b2.x0 - 1.5, b2.y + .4), 'awning', { h: .3, bounce: 14.5, how: 'walk', link: { spring: true } });
  const b3 = go(bal(a2.x0 - 1.7, a2.y + 3.4), 'balcony', { h: .3, how: 'bounce', link: { flow: true } });
  const a3 = go(awn(b3.x0 - 1.5, b3.y + .4), 'awning', { h: .3, bounce: 14.5, how: 'walk', link: { spring: true } });
  const b4 = go(bal(a3.x0 - 1.7, a3.y + 3.4), 'balcony', { h: .3, how: 'bounce', link: { flow: true } });
  const a4 = go(awn(b4.x0 - 1.5, b4.y + .4), 'awning', { h: .3, bounce: 14.5, how: 'walk', link: { spring: true } });
  // флаг 6 — крыша T5
  go(t5, 'roof', { h: 20, how: 'bounce', link: { flow: true }, cp: WEST });
  // срезка: маркиза → маркиза, не вставая на балконы
  links.push({ name: '6: срезка маркиза 1 → 2', ...xyz(a1), to: a2, how: 'bounce', alt: true, spring: true });
  links.push({ name: '6: срезка маркиза 2 → 3', ...xyz(a2), to: a3, how: 'bounce', alt: true, spring: true });
  links.push({ name: '6: срезка маркиза 3 → 4', ...xyz(a3), to: a4, how: 'bounce', alt: true, spring: true });

  // ---------------------------------------------------------------- 6. Ставни: карниз вдоль стены, ставни хлопают
  // Длинный дом B6 к западу от T5, карниз на его южной стене; ставни бьют от стены на юг (+z).
  const wallZ = 2.5;
  const b6x1 = t5.x0 - .5;
  const ledgeYs = [.6, 1.1, 2.1, 2.6, 3.6, 4.1, 5.1, 5.6, 6.6];
  const ledgeLens = [5.2, 4.6, 4.4, 5.0, 4.2, 4.6, 4.0, 4.4, 3.8];
  const ledgeRun = ledgeLens.reduce((a, b) => a + b, 0) + ledgeYs.reduce((a, y, i) => a + (i === 0 ? 0 : y - ledgeYs[i - 1] > .6 ? 1.4 : .1), 0);
  solid([b6x1 - .1 - ledgeRun - .4, t5.y - 10, -6], [b6x1, t5.y + 11, wallZ], 'roof');
  const ledge = (x0: number, x1: number, y: number): SkillRect => R(x0, x1, wallZ + .05, wallZ + .95, y);
  let lx = b6x1 - .1;
  for (const [i, dy] of ledgeYs.entries()) {
    const len = ledgeLens[i];
    const gap = i === 0 ? 0 : ledgeYs[i] - ledgeYs[i - 1] > .6 ? 1.4 : .1;
    const x1 = lx - gap, x0 = x1 - len;
    if (i > 0) rams.push({ fx: x1 + gap / 2, fz: wallZ, dx: 0, dz: 1, w: 1.6, y0: t5.y + dy + .2, y1: t5.y + dy + 1.45, stroke: 1.8, phase: i % 2 ? RAM_PERIOD / 2 : 0, sec });
    go(ledge(x0, x1, t5.y + dy), 'ledge', { h: .35, ...(i === 0 ? { from: [t5.x0 + .6, t5.y, wallZ + 1.2] } : {}) });
    lx = x0;
  }
  const cp7 = go(R(lx - 6.4, lx - .1, wallZ + .05, wallZ + 5.5, last.y + .5), 'roof', { h: 8, cp: NORTH });

  // ---------------------------------------------------------------- 7. Трубы: оголовки труб, тёплый поток на водонапорную башню
  // Трубы высокие: крыши домов под ними ниже линии падения флага 7.
  const pipes: Array<[number, number, number, number, number]> = [
    // x, z, ширина, глубина, +высота
    [cp7.x0 + 1.2, cp7.z0 - 1.9, 1.4, 1.4, 1.0], [cp7.x0 - 1.0, cp7.z0 - 4.4, 1.2, 1.2, 2.0], [cp7.x0 + 1.6, cp7.z0 - 6.4, 2.4, 1.1, 2.5],
    [cp7.x0 + 4.4, cp7.z0 - 8.6, 1.0, 1.0, 3.5], [cp7.x0 + 2.0, cp7.z0 - 11.0, 1.3, 1.3, 4.5], [cp7.x0 - .8, cp7.z0 - 12.8, 1.1, 1.1, 5.5],
    [cp7.x0 + 1.4, cp7.z0 - 15.4, 1.6, 1.6, 6.0], [cp7.x0 + 4.4, cp7.z0 - 17.2, 1.2, 1.2, 7.0],
    [cp7.x0 + 3.6, cp7.z0 - 20.6, 2.6, 1.0, 7.5], [cp7.x0 + 6.6, cp7.z0 - 22.0, .9, .9, 8.5],
  ];
  for (const [x, z, w, d, dy] of pipes) go(C(x, z, w, d, cp7.y + dy), 'chimney', { h: 9 });
  // горячая труба: стань на оголовок — тёплый поток поднимет
  // на неё не встать: поток ловит ещё в прыжке (и снизу, если сорвался с соседней трубы)
  const hot = pad(C(last.x1 + 2.0, mid(last)[2] - 1.0, 1.6, 1.6, last.y + .5), 'chimney', { h: 9 });
  const [hx, , hz] = mid(hot);
  const tank = R(hot.x1 + .55, hot.x1 + 4.0, hz - 1.7, hz + 1.7, hot.y + 8);
  updrafts.push({ x: hx, z: hz, r: 1.25, y0: hot.y - 3, y1: tank.y + .6, vmax: 7 });
  go(tank, 'watertower', { h: 3, how: 'lift', link: { via: [hx, hz] }, cp: EAST });

  // ---------------------------------------------------------------- 8. Карусель на крыше, затем лестница
  const e8 = step('e', .3, 0, 3.4, 1.2, 'plank', { h: .3 });
  const disc: SkillDisc = { cx: e8.x1 + .4 + 3.4, cz: mid(e8)[2], top: e8.y + .4, r: 3.4, period: 900, dir: 1, boxes: [] };
  for (const [a, b] of [[3.5, .42], [3.3, 1.2], [2.95, 1.85], [2.4, 2.4], [1.85, 2.95], [1.2, 3.3], [.42, 3.5]]) {
    const i = addBox([disc.cx - a, disc.top - .4, disc.cz - b], [disc.cx + a, disc.top, disc.cz + b]);
    pads.push({ box: i, look: 'disc', sec });
    disc.boxes.push(i);
  }
  const bar: SkillBar = { y0: disc.top + .2, y1: disc.top + .95, len: 3.1, r: .2, period: 300, dir: -1 };
  carousels.push({ disc, bar, bumpers: [] });
  link({ disc: true }, 'walk');
  last = R(disc.cx - .6, disc.cx + .6, disc.cz - .6, disc.cz + .6, disc.top);
  const far = R(disc.cx + 2.2, disc.cx + 3.1, disc.cz - .5, disc.cz + .5, disc.top);
  link(far, 'walk', { at3: [disc.cx - 2.6, disc.top, disc.cz], flow: true });
  last = far;
  step('e', 1.2 + (disc.cx + disc.r) - far.x1, .4, 3.0, 1.4, 'plank', { h: .3, how: 'jump', link: { flow: true } });
  // лестница: пожарная лестница на стене дома — площадки, перекладины, длинный шаг
  step('e', 1.4, 1, 1.6, 1.6, 'ladder', { h: .3 });
  step('n', 1.0, 1, 2.6, 1.0, 'ladder', { h: .3, side: .6 });
  step('e', 1.5, 1, 1.2, 1.2, 'ladder', { h: .3, side: -.5 });
  step('e', 0, .5, 3.4, 1.6, 'ladder', { h: .3 });
  step('n', 1.2, 1, 1.2, 1.4, 'ladder', { h: .3, side: 1 });
  step('w', 1.0, 1, 1.4, 1.2, 'ladder', { h: .3, side: -.4 });
  step('n', 1.3, 1, 2.0, 1.2, 'ladder', { h: .3 });
  step('e', 1.2, 1, 1.4, 1.4, 'ladder', { h: .3, side: -.3 });
  step('n', .2, .5, 1.6, 2.2, 'ladder', { h: .3 });
  step('e', 1.4, 1, 1.4, 1.2, 'ladder', { h: .3 });
  step('n', 1.0, 1, 1.6, 1.2, 'ladder', { h: .3, side: .2 });

  // ================================================================ 3. КОЛЕСО И КАНАТКА (86 → 121): север, на холме
  // ---------------------------------------------------------------- 9. Колесо обозрения: люлька от нижнего причала к верхнему
  const R9 = 12.5;
  const cp9 = step('n', 1.0, 1, 6, 3, 'station', { h: 1.2, cp: NORTH });
  const wheelX = mid(cp9)[0], wheelZ = cp9.z0 - 1.6;
  const cy = cp9.y + R9;
  const gondolas: number[] = [];
  for (let k = 0; k < 8; k++) {
    gondolas.push(movers.length);
    movers.push({
      box: addBox([0, 0, 0], [0, 0, 0]), look: 'gondola', sec, kind: 'orbit', w: 2.8, d: 2.8, h: .4, x: wheelX, y: cy, z: wheelZ, dx: 0, dy: 0, dz: 0,
      sched: { rest: 0, go: 1, stay: 0, back: 1, phase: 0 }, r: R9, period: 2400, phase: k * 300,
    });
    walls(gondolas[k], 'xz');
  }
  link({ movers: gondolas }, 'jump', { at: [2350, 2370, 2390, 10, 30], every: 300 });
  const cp10 = R(wheelX - 5, wheelX + 5, wheelZ - 8.1, wheelZ - 1.6, cy + R9);
  ride(gondolas[0], cp10, 'station', 'jump', [1170, 1190, 1210, 1230], { h: 1.2, cp: NORTH + .95 });

  // ---------------------------------------------------------------- 10. Канатная дорога: две кабины навстречу через пропасть
  const cableIn = cp10.z0 - .15 - 1.7, cableRise = 7, cableRun = 30;
  const cars = [wheelX - 2.2, wheelX + 2.2].map((x, i) => {
    const m = line('cablecar', 2.6, 3.4, .4, [x, cp10.y, cableIn], [0, cableRise, -cableRun], { rest: 150, go: 720, stay: 150, back: 720, phase: i * 870 });
    walls(m, 'x');
    return m;
  });
  link({ movers: cars }, 'walk', { at: [10, 50, 90, 880, 920, 960], every: 870 });
  const cp11 = R(wheelX - 5, wheelX + 9.5, cableIn - cableRun - 1.7 - .15 - 4.4, cableIn - cableRun - 1.7 - .15, cp10.y + cableRise);
  ride(cars[0], cp11, 'station', 'walk', [880, 910, 940], { h: 1.2, cp: EAST + .12 });

  // ================================================================ 4. СТРОЙКА (121 → 180): вертикально
  // Корпус строящегося дома: восточная стена — леса, северо-восток — подъёмник, крыша — флаг 13, запад — балки и обвал.
  const core = R(wheelX - 6, wheelX + 6, cp11.z0 - .1 - 12, cp11.z0 - .1, cp11.y + 26);
  // ---------------------------------------------------------------- 11. Леса: узкие доски, лестницы-прыжки, часть досок осыпается
  const ex11 = core.x1;
  const rowA = (z0: number, z1: number, y: number): SkillRect => R(ex11 + .15, ex11 + 1.15, z0, z1, y);
  const rowB = (z0: number, z1: number, y: number): SkillRect => R(ex11 + 1.6, ex11 + 2.8, z0, z1, y);
  const rowAB = (z0: number, z1: number, y: number): SkillRect => R(ex11 + .15, ex11 + 2.8, z0, z1, y);
  const zc = core.z1;
  const y11 = cp11.y;
  go(rowA(zc - 3.7, zc - .2, y11 + 1), 'scaffold', { h: .25, from: [ex11 + .65, y11, cp11.z0 + 1] });
  go(rowA(zc - 6.7, zc - 3.9, y11 + 1.5), 'scaffold', { h: .25 });
  crumble(rowA(zc - 10, zc - 8, y11 + 2.5), 30, 0, 'scaffold', 'jump');
  go(rowA(zc - 13.2, zc - 10.2, y11 + 3), 'scaffold', { h: .25 });
  go(rowAB(zc - 15.7, zc - 13.4, y11 + 4), 'scaffold', { h: .25 });
  go(rowB(zc - 13.2, zc - 10, y11 + 5), 'scaffold', { h: .25 });
  go(rowB(zc - 9.8, zc - 6.7, y11 + 5.5), 'scaffold', { h: .25 });
  crumble(rowB(zc - 5.4, zc - 3.2, y11 + 6.5), 30, 200, 'scaffold', 'jump');
  go(rowB(zc - 3.0, zc - .7, y11 + 7), 'scaffold', { h: .25 });
  go(rowAB(zc - .5, zc + 1.7, y11 + 8), 'scaffold', { h: .25 });
  go(rowA(zc - 3.7, zc - .7, y11 + 9), 'scaffold', { h: .25 });
  go(rowA(zc - 6.9, zc - 3.9, y11 + 9.5), 'scaffold', { h: .25 });
  crumble(rowA(zc - 10.2, zc - 8.2, y11 + 10.5), 30, 400, 'scaffold', 'jump');
  go(rowA(zc - 12.7, zc - 10.4, y11 + 11), 'scaffold', { h: .25 });
  const cp12 = go(R(ex11 + .15, ex11 + 4.5, zc - 16.3, zc - 12.9, y11 + 12), 'scaffold', { h: .3, cp: EAST });

  // ---------------------------------------------------------------- 12. Подъёмник: клеть вверх на 14 м, сойти вовремя
  const cage = line('cage', 2.6, cp12.z1 - cp12.z0, .4, [cp12.x1 + .15 + 1.3, cp12.y, mid(cp12)[2]], [0, core.y - cp12.y, 0], { rest: 90, go: 420, stay: 60, back: 420, phase: 0 });
  walls(cage, 'z');
  link({ movers: [cage] }, 'walk', { at: [10, 40, 70], every: 990 });
  ride(cage, R(ex11 + .2, cp12.x1, cp12.z0, core.z0 + .2, core.y), 'scaffold', 'walk', [510, 525, 540], { h: .3, cp: WEST });

  // ---------------------------------------------------------------- 13. Балки: двутавры ездят на тросах, прыжки с балки на балку
  go(sub(core, {}), 'core', { h: 26, how: 'walk' });
  const zg = mid(core)[2];
  const girder = (k: number, y: number, phase: number): number =>
    line('girder', 1.0, 4.0, .4, [core.x0 - 2.0 - 3.0 * k, y, zg - 4], [0, 0, 8], { rest: 30, go: 150, stay: 30, back: 150, phase });
  const gs = [girder(0, core.y + 1, 0), girder(1, core.y + 2, 120), girder(2, core.y + 3, 240)];
  link({ movers: [gs[0]] }, 'jump', { at3: [core.x0 + 1, core.y, zg], at: [0, 40, 80, 120, 160, 200, 240, 280, 320], every: 360 });
  links.push({ name: `${sec + 1}: ${++n} балка → балка`, x: 0, y: 0, z: 0, from: gs[0], to: { movers: [gs[1]] }, how: 'jump', at: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] });
  links.push({ name: `${sec + 1}: ${++n} балка → балка`, x: 0, y: 0, z: 0, from: gs[1], to: { movers: [gs[2]] }, how: 'jump', at: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] });
  const restBeam = C(core.x0 - 2.0 - 9.0, zg, 1.6, 3.0, core.y + 4);
  ride(gs[2], restBeam, 'girder', 'jump', [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330], { h: .4 });
  const gs2 = [girder(4, core.y + 5, 60), girder(5, core.y + 6, 180), girder(6, core.y + 7, 300), girder(7, core.y + 8, 90)];
  link({ movers: [gs2[0]] }, 'jump', { at: [0, 40, 80, 120, 160, 200, 240, 280, 320], every: 360 });
  links.push({ name: `${sec + 1}: ${++n} балка → балка`, x: 0, y: 0, z: 0, from: gs2[0], to: { movers: [gs2[1]] }, how: 'jump', at: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] });
  links.push({ name: `${sec + 1}: ${++n} балка → балка`, x: 0, y: 0, z: 0, from: gs2[1], to: { movers: [gs2[2]] }, how: 'jump', at: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] });
  links.push({ name: `${sec + 1}: ${++n} балка → балка`, x: 0, y: 0, z: 0, from: gs2[2], to: { movers: [gs2[3]] }, how: 'jump', at: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] });
  const g6x = core.x0 - 2.0 - 21.0;
  ride(gs2[3], R(g6x - 1.5 - 4.5, g6x - 1.5, zg - 3, zg + 3, core.y + 9), 'scaffold', 'jump', [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330], { h: .4, cp: SOUTH });

  // ---------------------------------------------------------------- 14. Обвал лесов: настил осыпается снизу вверх — бежать
  // путь обвала: s растёт по настоящей длине пути, волна (6 м/с) идёт за бегущим
  let sPath = 5;
  const run = (dir: Dir, gap: number, dy: number, w: number, d: number, t0: number, look: SkillLook, side = 0, first = false): SkillRect => {
    const r = rel(dir, gap, w, d, last.y + dy, side);
    const len = dir === 'n' || dir === 's' ? d : w;
    sPath += gap + len / 2;
    crumble(r, r6(sPath), t0, look, dy > .55 || gap > .7 ? 'jump' : 'walk', first ? {} : { flow: true });
    sPath += len / 2;
    return r;
  };
  const lens14 = [1.6, 1.3, 1.5, 1.2, 1.4, 1.6, 1.4, 1.2, 1.5, 1.3, 1.6, 1.2, 1.4, 1.5, 1.2, 1.4, 1.3, 1.6, 1.5, 1.2, 1.4];
  for (const [k, len] of lens14.entries()) {
    const jump = k === 6 || k === 12 || k === 18;
    run('s', jump ? 1.3 : 0, jump ? 1 : .5, 2.0, len, 0, 'scaffold', 0, k === 0);
  }
  const cp15 = step('s', .05, .5, 3.5, 3.75, 'scaffold', { h: .4, how: 'walk', link: { flow: true }, cp: EAST });

  // ---------------------------------------------------------------- 15. Башенный кран: зигзаг по мачте, затем стрела к флагу
  // Мачта к востоку от флага 15; полки на её южной стороне двумя рядами (A у мачты, B дальше), ряды меняются на площадках.
  const mx0 = cp15.x1 + 1.5, mz1 = cp15.z0 + 2.2;
  solid([mx0, core.y - 20, mz1 - 2], [mx0 + 2, cp15.y + 11.8, mz1], 'mast');
  const ra = (x0: number, x1: number, y: number): SkillRect => R(x0, x1, mz1 + .05, mz1 + 1.1, y);
  const rb = (x0: number, x1: number, y: number): SkillRect => R(x0, x1, mz1 + 1.5, mz1 + 2.7, y);
  const y15 = cp15.y;
  const xa = cp15.x1 + .2;
  go(ra(xa, xa + 1.5, y15 + 1), 'girder', { h: .3 });
  go(ra(xa + 2.6, xa + 4.6, y15 + 2), 'girder', { h: .3 });
  go(ra(xa + 5.8, xa + 7.0, y15 + 3), 'girder', { h: .3 });
  go(R(xa + 8.2, xa + 10.4, mz1 + .05, mz1 + 2.7, y15 + 4), 'girder', { h: .3 });
  go(rb(xa + 5.6, xa + 7.0, y15 + 5), 'girder', { h: .3 });
  go(rb(xa + 2.4, xa + 4.4, y15 + 6), 'girder', { h: .3 });
  go(rb(xa - .6, xa + 1.2, y15 + 7), 'girder', { h: .3 });
  go(R(xa - 3.4, xa - 1.8, mz1 + .05, mz1 + 2.7, y15 + 8), 'girder', { h: .3 });
  go(ra(xa - .6, xa + 1.0, y15 + 9), 'girder', { h: .3 });
  go(ra(xa + 2.2, xa + 4.2, y15 + 10), 'girder', { h: .3 });
  go(ra(xa + 5.6, xa + 6.8, y15 + 11), 'girder', { h: .3 });
  go(R(xa + 8.2, xa + 10.4, mz1 + .05, mz1 + 2.7, y15 + 12), 'girder', { h: .3 });
  go(rb(xa + 5.2, xa + 7.0, y15 + 13), 'girder', { h: .3 });
  // кабина на верху мачты и стрела на юг
  const top15 = go(R(mx0 - .5, mx0 + 2.5, mz1 - 3, mz1 - .05, y15 + 14), 'cab', { h: 2.2 });
  const jibX = mx0 + 1;
  const jib = go(R(jibX - .5, jibX + .5, top15.z1 + .05, top15.z1 + 22, top15.y + 1), 'jib', { h: .6, from: [mid(top15)[0], top15.y, top15.z1 - .8] });
  wind(jib, -1, 0, 0, 2.5);
  shelter(R(jib.x0, jib.x1, jib.z0, jib.z0 + 2, jib.y));
  shelter(R(jib.x0, jib.x1, jib.z0 + 10, jib.z0 + 12, jib.y));
  go(sub(jib, { z0: jib.z0 + 10, z1: jib.z0 + 12 }), 'jib', { how: 'walk', from: [jibX, jib.y, jib.z0 + 1] });
  pads.pop(); boxes.pop();
  const cp16 = go(R(jibX - 1.2, jibX + 1.2, jib.z1 + .05, jib.z1 + 2.4, jib.y + .5), 'cab', { h: 1.2, how: 'walk', cp: SOUTH });

  // ================================================================ 5. ПРОВОДА И МАЧТЫ (180 → 214): высоко над крышами, на юг
  // ---------------------------------------------------------------- 16. Провода: узкие балки между столбами, порывы ветра
  const xw = mid(cp16)[0];
  const w1 = go(R(xw - .3, xw + .3, cp16.z1, cp16.z1 + 7, cp16.y), 'wire', { h: .2 });
  const p1 = go(R(xw - .8, xw + .8, w1.z1, w1.z1 + 1.6, w1.y + .5), 'pole', { h: 1.0 });
  shelter(p1);
  const w2 = go(R(xw - .25, xw + .25, p1.z1, p1.z1 + 9, p1.y + .5), 'wire', { h: .2 });
  wind(w2, 1, 0, 0);
  const p2 = go(R(xw - .8, xw + .8, w2.z1, w2.z1 + 1.6, w2.y + 1), 'pole', { h: 1.0 });
  shelter(p2);
  const w3 = go(R(p2.x1, p2.x1 + 9, mid(p2)[2] - .3, mid(p2)[2] + .3, p2.y), 'wire', { h: .2 });
  wind(w3, 0, 1, 80);
  const p3 = go(R(w3.x1, w3.x1 + 1.6, p2.z0, p2.z1, w3.y + .5), 'pole', { h: 1.0 });
  shelter(p3);
  const xw4 = mid(p3)[0];
  const w4 = go(R(xw4 - .3, xw4 + .3, p3.z1, p3.z1 + 9, p3.y + .5), 'wire', { h: .2 });
  wind(w4, -1, 0, 160);
  const p4 = go(R(xw4 - .8, xw4 + .8, w4.z1, w4.z1 + 1.6, w4.y + 1), 'pole', { h: 1.0 });
  shelter(p4);
  const w5 = go(R(p4.x0 - 8, p4.x0, mid(p4)[2] - .25, mid(p4)[2] + .25, p4.y + .5), 'wire', { h: .2 });
  wind(w5, 0, -1, 40);
  const p5 = go(R(w5.x0 - 1.6, w5.x0, p4.z0, p4.z1, w5.y + .5), 'pole', { h: 1.0 });
  shelter(p5);
  const xw6 = mid(p5)[0];
  const w6 = go(R(xw6 - .3, xw6 + .3, p5.z1, p5.z1 + 8, p5.y + .5), 'wire', { h: .2 });
  wind(w6, 1, 0, 120);
  const p6 = go(R(xw6 - .8, xw6 + .8, w6.z1, w6.z1 + 1.6, w6.y + 1), 'pole', { h: 1.0 });
  shelter(p6);
  step('s', .7, 1, .8, .8, 'insulator', { h: .5, side: .2 });
  step('w', .6, 1, .8, .8, 'insulator', { h: .5, side: .6 });
  const cp17 = go(R(last.x0 - 4.5, last.x1 + 3.5, last.z1 + .8, last.z1 + 4.0, last.y + 1), 'station', { h: 1.2, cp: SOUTH });

  // ---------------------------------------------------------------- 17. Фуникулёр: вагончик по крутому тросу вверх
  const funi = [cp17.x0 + 2.2, cp17.x1 - 2.2].map((x, i) => {
    const m = line('cablecar', 2.6, 3.0, .4, [x, cp17.y, cp17.z1 + .15 + 1.5], [0, 12, 20], { rest: 120, go: 600, stay: 120, back: 600, phase: i * 720 });
    walls(m, 'x');
    return m;
  });
  link({ movers: funi }, 'walk', { at: [10, 50, 90, 730, 770, 810], every: 720 });
  const f1 = moverRect(funi[0], 1);
  const cp18 = R(cp17.x0, cp17.x1, f1.z1 + .15, f1.z1 + .15 + 4.2, f1.y);
  ride(funi[0], cp18, 'station', 'walk', [730, 760, 790], { h: 1.2, cp: SOUTH });

  // ---------------------------------------------------------------- 18. Радиомачта: растяжка-лесенка, полки на ветру
  const xm = mid(cp18)[0];
  const mz = cp18.z1 + 6.5;
  solid([xm - 1, cp18.y - 50, mz], [xm + 1, cp18.y + 12.5, mz + 2], 'mast');
  // растяжка: узкие ступени +0,5 к мачте (одним переходом; ждать штиля на флаге)
  for (let k = 0; k < 8; k++) pad(R(xm - .3, xm + .3, cp18.z1 + .1 + .65 * k, cp18.z1 + .75 + .65 * k, cp18.y + .5 + .5 * k), 'wire', { h: .2 });
  const guy = R(xm - .3, xm + .3, cp18.z1 + .1, cp18.z1 + .1 + 5.2, cp18.y + 4);
  wind(guy, 1, 0, 40, 4);
  const q1 = go(R(xm - 2, xm + 2, guy.z1 + .05, mz - .05, guy.y + .5), 'girder', { h: .3, how: 'walk', from: [xm, cp18.y, cp18.z1 - .6] });
  shelter(q1);
  const ex = xm + 1;
  go(R(ex + .05, ex + 1.05, mz, mz + 1.2, q1.y + 1), 'girder', { h: .3 });
  go(R(ex + .05, ex + 1.05, mz + 2.4, mz + 3.6, last.y + 1), 'girder', { h: .3 });
  const q2 = go(R(ex + .05, ex + 2.5, mz + 4.0, mz + 5.4, last.y + 1), 'girder', { h: .3 });
  shelter(q2);
  go(R(ex + 1.55, ex + 2.5, mz + 1.6, mz + 2.8, last.y + 1), 'girder', { h: .3 });
  go(R(ex + 1.55, ex + 2.5, mz - .8, mz + .4, last.y + 1), 'girder', { h: .3 });
  const q3 = go(R(ex + .05, ex + 2.5, mz - 2.6, mz - 1.2, last.y + 1), 'girder', { h: .3 });
  shelter(q3);
  winds.push({ x0: ex, x1: ex + 3.2, z0: mz - .2, z1: mz + 5.6, y0: q1.y + .5, y1: q3.y + .5, dx: 1, dz: 0, phase: 120, sec });
  go(R(xm - 1.3, xm - .1, mz - 3.2, mz - 2.2, last.y + 1), 'girder', { h: .3 });
  go(R(xm - 3.3, xm - 2.3, mz - 1.5, mz - .3, last.y + 1), 'girder', { h: .3 });
  go(R(xm - 2.5, xm + 2.5, mz, mz + 5, last.y + 1), 'cab', { h: 1.0, cp: SOUTH });

  // ---------------------------------------------------------------- 19. Флажки: гирлянды-балки, качаются мешки с песком
  const cp19 = last;
  const gx = mid(cp19)[0];
  // гирлянда: по ней — бегом под мешками от столба до её дальнего конца (там не задевает), затем прыжок на столб
  const garland = (r: SkillRect, dir: Dir): SkillRect => {
    pad(r, 'garland', { h: .25 });
    const end = dir === 's' ? sub(r, { z0: r.z1 - 1 }) : dir === 'n' ? sub(r, { z1: r.z0 + 1 }) : dir === 'e' ? sub(r, { x0: r.x1 - 1 }) : sub(r, { x1: r.x0 + 1 });
    link(end, 'walk');
    last = end;
    return r;
  };
  const g1 = garland(R(gx - .35, gx + .35, cp19.z1, cp19.z1 + 6, cp19.y), 's');
  sack(gx, g1.y, g1.z0 + 3, 'x', 0, { period: 200 });
  go(R(gx - .7, gx + .7, g1.z1, g1.z1 + 1.4, g1.y + 1), 'pole', { h: 1.2 });
  const g2 = garland(R(last.x0 - 6, last.x0, mid(last)[2] - .35, mid(last)[2] + .35, last.y), 'w');
  sack(g2.x0 + 3, g2.y, mid(g2)[2], 'z', 60, { period: 200 });
  step('w', 1.4, 1, 1.4, 1.4, 'pole', { h: 1.2 });
  const g3 = garland(R(mid(last)[0] - .35, mid(last)[0] + .35, last.z1, last.z1 + 6.5, last.y), 's');
  sack(mid(g3)[0], g3.y, g3.z0 + 2.2, 'x', 100, { period: 200 });
  sack(mid(g3)[0], g3.y, g3.z0 + 4.6, 'x', 0, { period: 200 });
  step('s', 1.5, 1, 1.4, 1.4, 'pole', { h: 1.2 });
  const g4 = garland(R(last.x1, last.x1 + 7, mid(last)[2] - .35, mid(last)[2] + .35, last.y), 'e');
  sack(g4.x0 + 2.5, g4.y, mid(g4)[2], 'z', 140, { period: 200 });
  sack(g4.x0 + 5.0, g4.y, mid(g4)[2], 'z', 40, { period: 200 });
  go(R(g4.x1, g4.x1 + 1.4, mid(g4)[2] - .7, mid(g4)[2] + .7, g4.y + 1), 'pole', { h: 1.2 });
  step('s', 1.2, 1, 1.0, 1.0, 'pole', { h: 1.2, side: .5 });
  const g5 = garland(R(mid(last)[0] - .35, mid(last)[0] + .35, last.z1, last.z1 + 6, last.y), 's');
  sack(mid(g5)[0], g5.y, g5.z0 + 3, 'x', 70, { period: 180 });
  go(R(mid(g5)[0] - .7, mid(g5)[0] + .7, g5.z1, g5.z1 + 1.4, g5.y + 1), 'pole', { h: 1.2 });
  const cp20 = step('s', 1.2, 1, 6, 5, 'pier', { h: .5, side: 1.5, cp: EAST });

  // ================================================================ 6. ШАРЫ И ЗМЕИ НАД МОРЕМ (222 → 268)
  // ---------------------------------------------------------------- 20. Корзины: шар поднимает, сойти на причал
  const bs = [cp20.z0 + 1.4, cp20.z0 + 4.6].map((z, i) => {
    const m = line('basket', 2.8, 2.8, .4, [cp20.x1 + .2 + 1.4, cp20.y, z], [0, 10, 0], { rest: 120, go: 660, stay: 120, back: 660, phase: i * 780 });
    walls(m, 'xz');
    return m;
  });
  link({ movers: bs }, 'jump', { at: [10, 40, 80, 790, 820, 860], every: 780 });
  const cp21 = R(cp20.x1 + .2 + 2.8 + .2, cp20.x1 + .2 + 2.8 + .2 + 6, cp20.z0 - .5, cp20.z1 + 1.5, cp20.y + 10);
  ride(bs[0], cp21, 'pier', 'jump', [790, 810, 830, 850], { h: .5, cp: SOUTH });

  // ---------------------------------------------------------------- 21. Купола: верхушки шаров — батуты цепочкой
  const dm = (x: number, z: number, y: number): SkillRect => C(x, z, 3, 3, y);
  const cx21 = mid(cp21)[0];
  const dd1 = go(dm(cx21, cp21.z1 + .1 + 1.5, cp21.y + .4), 'dome', { h: .5, bounce: 14.5, how: 'walk', link: { spring: true } });
  const d2 = go(dm(cx21 + 2.6, dd1.z1 + 1.2 + 1.5, dd1.y + 3.4), 'dome', { h: .5, bounce: 14.5, how: 'bounce', link: { flow: true, spring: true } });
  go(C(cx21 - .4, d2.z1 + 1.4 + 1.2, 2.4, 2.4, d2.y + 3.4), 'pier', { h: .4, how: 'bounce', link: { flow: true } });
  const d3 = step('s', .1, .4, 3, 3, 'dome', { h: .5, bounce: 14.5, side: 2.2, how: 'walk', link: { spring: true } });
  const d4 = go(dm(mid(d3)[0] - 3.0, d3.z1 + 1.3 + 1.5, d3.y + 3.4), 'dome', { h: .5, bounce: 14.5, how: 'bounce', link: { flow: true, spring: true } });
  go(C(mid(d4)[0] + 2.8, d4.z1 + 1.3 + 1.2, 2.4, 2.4, d4.y + 3.4), 'pier', { h: .4, how: 'bounce', link: { flow: true } });
  const d5 = step('e', .1, .4, 3, 3, 'dome', { h: .5, bounce: 14.5, side: -1.2, how: 'walk', link: { spring: true } });
  go(dm(mid(d5)[0] + 2.2, d5.z1 + 1.3 + 1.5, d5.y + 3.4), 'dome', { h: .5, bounce: 14.5, how: 'bounce', link: { flow: true, spring: true } });
  go(R(last.x1 + .6, last.x1 + 6.6, last.z0 - .5, last.z1 + 1.5, last.y + 3.4), 'pier', { h: .5, how: 'bounce', link: { flow: true }, cp: EAST });

  // ---------------------------------------------------------------- 22. Воздушные змеи: платформы ездят вбок
  const cp22 = last;
  const zk = mid(cp22)[2];
  const kites: number[] = [];
  for (let k = 0; k < 7; k++) {
    const sgn = k % 2 ? 1 : -1;
    kites.push(line('kite', 2.4, 2.4, .3, [cp22.x1 + 1.6 + 1.2 + 4.0 * k, cp22.y + 1 + k, zk - sgn * 3.5], [0, .6 * sgn, 7 * sgn], { rest: 30, go: 150, stay: 30, back: 150, phase: k * 90 }));
  }
  const kat = Array.from({ length: 12 }, (_, i) => i * 30);
  link({ movers: [kites[0]] }, 'jump', { at: kat, every: 360 });
  for (let k = 0; k + 1 < kites.length; k++) links.push({ name: `${sec + 1}: ${++n} змей → змей`, x: 0, y: 0, z: 0, from: kites[k], to: { movers: [kites[k + 1]] }, how: 'jump', at: kat });
  const lastKite = movers[kites[6]];
  const cp23 = R(lastKite.x + 1.2 + 1.6, lastKite.x + 1.2 + 1.6 + 5, zk - 3, zk + 3, lastKite.y + 1);
  ride(kites[6], cp23, 'pier', 'jump', kat, { h: .5, cp: SOUTH });

  // ---------------------------------------------------------------- 23. Тёплый поток: две колонны вверх и посадка
  const u1x = mid(cp23)[0], u1z = cp23.z1 + .1 + 1.3;
  const foot = go(C(u1x, u1z, 2.6, 2.6, cp23.y), 'cloud', { h: .6, how: 'walk', from: [u1x, cp23.y, cp23.z1 - .5] });
  // мешок с песком качается поперёк первой колонны на середине подъёма
  const land1 = C(u1x - 1.3 - .5 - 1.2, u1z, 2.4, 2.4, foot.y + 5);
  updrafts.push({ x: u1x, z: u1z, r: 1.3, y0: foot.y - .3, y1: land1.y + .6, vmax: 7 });
  sack(u1x, foot.y + 2.8, u1z, 'x', 0, { len: 6, amp: .7, period: 240, r: .8 });
  go(land1, 'cloud', { h: .6, how: 'lift', link: { via: [u1x, u1z] } });
  go(rel('n', 1.4, 1.8, 1.8, land1.y + .5, -.8, land1), 'cloud', { h: .6 });
  go(rel('w', 1.5, 2.0, 2.0, land1.y + .5, .6), 'cloud', { h: .6 });
  const hop = go(rel('s', 1.3, 2.2, 2.2, land1.y + 1, -.4), 'cloud', { h: .6 });
  cut('с посадки сразу на третье облако', land1, hop);
  const u2x = hop.x0 - .3 - 1.3, u2z = mid(hop)[2];
  const cp24 = C(u2x, u2z - 1.3 - .5 - 1.5, 3, 3, hop.y + 5);
  updrafts.push({ x: u2x, z: u2z, r: 1.3, y0: hop.y - 1.5, y1: cp24.y + .6, vmax: 7 });
  go(cp24, 'cloud', { h: .6, how: 'lift', link: { via: [u2x, u2z] }, cp: NORTH });

  // ================================================================ 7. ОБЛАКА И КОЛОКОЛ (268 → 292): назад к центру, на север
  // ---------------------------------------------------------------- 24. Облака: тают волной — прыгать в её темпе
  const cloudAt: Array<[number, number, number]> = [[-.5, -4.6, 1], [2.4, -8.6, 1], [-.6, -12.4, 1], [-3.4, -16.4, 1], [-.8, -20.4, 1], [2.2, -24.0, 1], [-.4, -27.8, 1], [-3.2, -31.6, 1], [-.6, -35.6, 0], [2.4, -39.4, 0], [-.2, -43.2, 0]];
  const [c24x, , c24z] = mid(cp24);
  let cy24 = cp24.y;
  for (const [k, [dx, dz, dy]] of cloudAt.entries()) {
    cy24 += dy;
    const r = C(c24x + dx, c24z + dz, 2.6, 2.6, cy24);
    const phase = k * CLIMB_CLOUD_STEP;
    clouds.push({ box: addBox([r.x0, r.y - .7, r.z0], [r.x1, r.y, r.z1]), sec, phase, rect: r });
    link(r, 'jump', { at: [phase + 10, phase + 30], ...(k > 0 ? { flow: true } : {}) });
    last = r;
  }
  go(C(mid(last)[0] + 1.5, last.z0 - 1.4 - 2, 5, 4, last.y + .5), 'cloud', { h: .8, how: 'jump', link: { at: [cloudAt.length * CLIMB_CLOUD_STEP + 10], flow: true }, cp: NORTH });

  // ---------------------------------------------------------------- 25. Ветер в облаках: порывы, укрытия за облачными валами
  const c1 = step('n', 2.0, 1, 3, 3, 'cloud', { h: .8, side: -1.5 });
  wind(c1, 1, 0, 0);
  const c2 = step('n', 1.6, 1, 2.4, 2.4, 'cloud', { h: .8, side: -2.5 });
  wind(c2, 1, 0, 0);
  const c3 = step('n', 1.8, .5, 4, 2.4, 'cloud', { h: .8, side: 1.5 });
  shelter(R(c3.x0, c3.x0 + 1.6, c3.z0, c3.z1, c3.y));
  wind(c3, 1, 0, 0);
  const c4 = step('w', 1.8, 1, 2.2, 2.2, 'cloud', { h: .8, side: -1 });
  wind(c4, 0, 1, 120);
  const c5 = step('n', 1.6, 1, 3, 3, 'cloud', { h: .8, side: -.5 });
  shelter(R(c5.x0, c5.x1, c5.z0, c5.z0 + 1.4, c5.y));
  wind(c5, 0, 1, 120);
  const c6 = step('e', 1.8, 1, 2, 2, 'cloud', { h: .8 });
  wind(c6, 0, 1, 120);
  const c7 = step('n', 1.7, .5, 3.4, 2.2, 'cloud', { h: .8, side: -.6 });
  shelter(R(c7.x0, c7.x1, c7.z0, c7.z0 + 1.2, c7.y));
  wind(c7, 1, 0, 0);
  const c8 = step('w', 2.0, .5, 2.2, 2.2, 'cloud', { h: .8 });
  wind(c8, 1, 0, 0);
  cut('мимо укрытия, в ветер', c6, c8);
  step('n', 1.6, 1, 5, 4, 'cloud', { h: .8, side: -1, cp: NORTH });

  // ---------------------------------------------------------------- 26. Последняя лестница: облачные ступени осыпаются
  sPath = 5;
  const stair26: Array<[Dir, number, number]> = [['n', 0, .5], ['n', 0, .5], ['n', 0, .5], ['w', 0, .5], ['w', 1.2, 1], ['w', 0, .5], ['n', 0, .5], ['n', 0, .5],
    ['n', 0, .5], ['n', 1.2, 1], ['e', 0, .5], ['e', 0, .5], ['n', 0, .5], ['n', 0, .5]];
  for (const [k, [dir, gap, dy]] of stair26.entries()) run(dir, gap, dy, dir === 'n' ? 1.8 : 1.2, dir === 'n' ? 1.1 : 1.8, 300, 'cloud', 0, k === 0);
  go(C(mid(last)[0], last.z0 - .05 - 1.5, 4, 3, last.y + .5), 'cloud', { h: .8, how: 'walk', link: { flow: true }, cp: NORTH });

  // ---------------------------------------------------------------- 27. Колокол: на галерею и прыжок в колокол
  step('n', 1.3, .5, 1.8, 1.8, 'cloud', { h: .8, side: -1.2 });
  step('n', 1.4, .5, 1.6, 1.6, 'cloud', { h: .8, side: 1.6 });
  const gallery = step('n', 1.2, 1, 4.4, 4.4, 'cloud', { h: 1.0, side: -.6 });
  const [bx, , bz] = mid(gallery);
  const bell: SkillBox = { x0: bx - .9, x1: bx + .9, z0: bz - .9, z1: bz + .9, y0: gallery.y + 1.8, y1: gallery.y + 4.0 };
  link({ bell: true }, 'jump');

  // ---------------------------------------------------------------- срезки для умелых (флаги — по порядку)

  const slots = [-4, -2, 0, 2, 4].map((x) => ({ x, y: start.y, z: mid(start)[2] + 1.5, yaw: NORTH }));
  const disc0 = carousels[0].disc;
  return {
    name: 'Выше облаков · Город вверх', boxes, pads, movers, clouds, steps, disc: disc0, carousels, sacks, rams,
    bar: carousels[0].bar, bumpers: [], winds, shelters, updrafts, checkpoints, bell, gallery, start, slots, links, stairLength,
    spawns: [{ x: checkpoints[0].px, y: checkpoints[0].y, z: checkpoints[0].pz, yaw: checkpoints[0].yaw, team: 0 }],
    trampolines: [], pickups: [], deco: [], bounds: { minX: -60, maxX: 60, minZ: -110, maxZ: 120 },
    limit: { minX: -75, maxX: 75, minZ: -125, maxZ: 135 },
  };
}

function xyz(r: SkillRect, dz = 0): { x: number; y: number; z: number } {
  return { x: (r.x0 + r.x1) / 2, y: r.y, z: (r.z0 + r.z1) / 2 + dz };
}
