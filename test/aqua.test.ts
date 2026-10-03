// Аквапарк «Волна» 2.0: полоса длиннее и выше, с движением — паромы, лифт, тонущие подушки, вертушка, мешки, батуты
// разной силы. Проверяем геометрию и что каждый кусок достижим в своё окно времени; робота, который проходит всю полосу
// через хаб по настоящей физике сервера; время по шагам игрока (дрожание сети его не меняет); что на полосе сервер
// не додумывает шаги; что предсказание клиента на подвижных площадках совпадает с сервером; толчки и батуты; сброс
// доски при новой полосе; старт, финиш, рекорды.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Predictor, type StepHook } from '../client/predict.ts';
import {
  AQUA_BAGS, AQUA_BAG_H, AQUA_BAG_R, AQUA_COURSE, AQUA_FINISH, AQUA_JETTY, AQUA_MOVERS, AQUA_NEAR_X, AQUA_PAUSE, AQUA_PIECES, AQUA_RESPAWN, AQUA_SKEW,
  AQUA_SKEW_K, AQUA_SWEEPER, AQUA_TOP,
  addRecord, aquaMs, fmtAquaTime, onFinish, onJetty, slideSteps, type AquaMover, type AquaPiece, type AquaRecord,
} from '../shared/aqua.ts';
import {
  AQUA_LAG, AQUA_WAIT, AquaDyn, KNOCK_BAG, KNOCK_SPEED, KNOCK_SWEEP, KNOCK_UP, aquaClock, bagPose, makeBagPose, makeMoverBox, moverBox, moverPeriod,
  moverU, quantTick, sinkWarn, sweepAngle,
} from '../shared/aquadyn.ts';
import { BOAT_RIDE_TICKS, ridePose } from '../shared/boat.ts';
import { DROWN_Y, GRAVITY, JUMP_VELOCITY, PLAYER_HALF, STEP_HEIGHT, TICK_RATE, TRAMPOLINE_VELOCITY } from '../shared/constants.ts';
import { stepHeld } from '../shared/lobby.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { encodeInputs } from '../shared/protocol.ts';
import { BTN_FORWARD, BTN_JUMP, copyState, makeEvents, makeInput, makeState, statesEqual, type Input, type PlayerState } from '../shared/sim.ts';
import { CollisionWorld } from '../shared/world.ts';
import { Store } from '../server/store.ts';
import type { Client, Hub } from '../server/hub.ts';
import { allOf, lastOf, login, placeAt, setupHub, steps, type FakeSink } from './kit.ts';

const [PAD1, PAD2, PAD3, DECK1, DECK2, DECK3, TRAMP1, STEP, TRAMP2, TOWER, SLIDE, DECK4, DISC, PYLON, DECK5, BEAM, DECK6, TOWER2, PILLAR1, PILLAR2, DECK7, FINISH] =
  AQUA_PIECES;
const [FERRY, SINK1, SINK2, SINK3, SINK4, LIFT, FERRY_A, FERRY_B] = AQUA_MOVERS;
/** Смотреть на запад (+x — восток, yaw 0 — на −z) */
const WEST = Math.PI / 2;
/** Метка входа робота отстаёт от тика сервера на столько (задержка отрисовки и пинг) */
const LAGT = 10;

function lp(hub: Hub, c: Client) {
  const p = hub.lobby.playerOf(c);
  assert.ok(p, 'игрок на набережной');
  return p;
}

/** Входы игрока с меткой времени (как у клиента: номер по порядку, метка — его часы отрисовки). */
class Pad {
  seq = 0;
  /** Что ушло: кнопки, взгляд, метка — чтобы повторить тот же забег с другой доставкой */
  readonly log: Input[] = [];
  readonly hub: Hub;
  readonly c: Client;
  constructor(hub: Hub, c: Client) {
    this.hub = hub;
    this.c = c;
  }

  /** Метка для следующего входа: тик сервера минус задержка */
  vt(): number {
    return this.hub.lobby.tick - LAGT;
  }

  make(buttons: number, yaw: number, vt = this.vt()): Input {
    const inp = makeInput();
    inp.seq = ++this.seq;
    inp.buttons = buttons;
    // как у клиента: в протоколе взгляд — float32, предсказание считает с тем же числом
    inp.yaw = Math.fround(yaw);
    inp.viewTick = vt;
    this.log.push({ ...inp });
    return inp;
  }

  /** Один вход и шаг хаба. Возвращает номер входа. */
  send(buttons: number, yaw = WEST, vt = this.vt()): number {
    const inp = this.make(buttons, yaw, vt);
    this.hub.onBinary(this.c, encodeInputs([inp], 0, 1, this.c.epoch));
    this.hub.step();
    return inp.seq;
  }

  /** n тиков с этими кнопками */
  hold(buttons: number, n: number, yaw = WEST): void {
    for (let i = 0; i < n; i++) this.send(buttons, yaw);
  }
}

// ------------------------------------------------------------ робот

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number;
}

const tmpBox = makeMoverBox();

function boxAt(m: AquaMover, t: number): Rect {
  const b = moverBox(m, t, tmpBox);
  return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, top: b.top };
}

/** Где в своём цикле подвижная площадка в момент t, тиков. */
function cyc(m: AquaMover, t: number): number {
  const p = moverPeriod(m);
  return (((t - m.phase) % p) + p) % p;
}

/** Пол под точкой не выше y: мир и подвижные площадки в момент t (вне шага их боксов в мире нет). */
function groundAt(world: CollisionWorld, x: number, y: number, z: number, t: number): number {
  let g = world.groundBelow(x, y, z);
  for (const m of AQUA_MOVERS) {
    const b = moverBox(m, t, tmpBox);
    if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.top <= y + 1e-3 && b.top > g) g = b.top;
  }
  return g;
}

/** Стоит на прямоугольнике (хоть краем). */
function standsOn(s: PlayerState, r: Rect): boolean {
  return s.grounded === 1 && Math.abs(s.y - r.top) < 0.06 && s.x > r.x0 - 0.35 && s.x < r.x1 + 0.35 && s.z > r.z0 - 0.35 && s.z < r.z1 + 0.35;
}

interface Target {
  x: number;
  z: number;
  top: number;
}

/** Отрезок пути робота: куда, когда можно идти (до того — стоит у точки wait или на месте) и когда дошёл. */
interface Leg {
  name: string;
  to(t: number): Target;
  go?(t: number): boolean;
  wait?: { x: number; z: number };
  done(s: PlayerState, t: number): boolean;
}

function mid(r: Rect, at?: { x?: number; z?: number }): Target {
  return { x: at?.x ?? (r.x0 + r.x1) / 2, z: at?.z ?? (r.z0 + r.z1) / 2, top: r.top };
}

function onPiece(name: string, p: AquaPiece, o: Partial<Leg> & { at?: { x?: number; z?: number } } = {}): Leg {
  return { name, to: () => mid(p, o.at), done: (s) => standsOn(s, p), ...o };
}

/** Стоит на подвижной площадке серединой, не с краю (её везёт та, над которой середина) */
function standsMid(s: PlayerState, r: Rect): boolean {
  return s.grounded === 1 && Math.abs(s.y - r.top) < 0.06 && s.x > r.x0 + 0.3 && s.x < r.x1 - 0.3 && s.z > r.z0 + 0.3 && s.z < r.z1 - 0.3;
}

function onMover(name: string, m: AquaMover, o: Partial<Leg> = {}): Leg {
  return { name, to: (t) => mid(boxAt(m, t)), done: (s, t) => standsMid(s, boxAt(m, t)), ...o };
}

function onTramp(name: string, p: AquaPiece): Leg {
  return { name, to: () => mid(p), done: (s) => s.vy > 9 && s.x > p.x0 - 0.4 && s.x < p.x1 + 0.4 && s.z > p.z0 - 0.4 && s.z < p.z1 + 0.4 };
}

/** Мешок k: ждать у бревна перед ним, пока он не пролетит поперёк, и проскочить. */
function pastBag(k: number): Leg {
  const b = AQUA_BAGS[k];
  return {
    name: `мешок ${k + 1}`,
    to: () => ({ x: b.x + 1.0, z: b.z, top: BEAM.top }),
    wait: { x: b.x - 1.4, z: b.z },
    go: (t) => {
      const c = (((t - b.phase) % (b.period / 2)) + b.period / 2) % (b.period / 2);
      return c >= 8 && c <= 30;
    },
    done: (s) => s.grounded === 1 && s.x > b.x + 0.85,
  };
}

/** Перекладина вертушки (обе стороны) в момент t — угол в градусах по модулю 180. */
function sweepDeg(t: number): number {
  return ((sweepAngle(t) * 180) / Math.PI) % 180;
}

/** Вдоль вертушки — по восточной стороне от столба */
const DISC_X = -89.9;

/** Весь путь: где ждать паромов, лифта, подушек, перекладины и мешков. */
const WAY: Leg[] = [
  onPiece('подушка 1', PAD1),
  onPiece('подушка 2', PAD2),
  onPiece('подушка 3', PAD3),
  onPiece('причал парома', DECK1),
  onMover('паром', FERRY, { wait: { x: DECK1.x0 + 0.5, z: 9 }, go: (t) => cyc(FERRY, t) < 36 }),
  onPiece('причал за паромом', DECK2, { go: (t) => cyc(FERRY, t) >= 272 && cyc(FERRY, t) < 320 }),
  onMover('тонущая подушка 1', SINK1, { wait: { x: DECK2.x0 + 0.35, z: 9 }, go: (t) => cyc(SINK1, t) < 30 }),
  onMover('тонущая подушка 2', SINK2),
  onMover('тонущая подушка 3', SINK3),
  onMover('тонущая подушка 4', SINK4),
  onPiece('площадка за подушками', DECK3),
  onTramp('слабый батут', TRAMP1),
  onPiece('ступень', STEP),
  onTramp('сильный батут', TRAMP2),
  onPiece('башня', TOWER),
  onPiece('площадка под горкой', DECK4),
  onPiece('вертушка', DISC, { at: { x: DISC_X, z: 30.6 }, wait: { x: DISC_X, z: 25.4 }, go: (t) => sweepDeg(t) <= 8 }),
  onPiece('площадка за вертушкой', DECK5, { at: { x: DISC_X, z: 36.6 } }),
  onPiece('бревно', BEAM, { at: { x: -88.6 } }),
  pastBag(0),
  pastBag(1),
  pastBag(2),
  onPiece('площадка у лифта', DECK6, { at: { x: -74.6 } }),
  onMover('лифт', LIFT, { wait: { x: DECK6.x1 - 0.4, z: 36.6 }, go: (t) => cyc(LIFT, t) < 36 }),
  onPiece('верхняя палуба', TOWER2, { go: (t) => cyc(LIFT, t) >= 188 && cyc(LIFT, t) < 236 }),
  onPiece('тумба 1', PILLAR1),
  onPiece('тумба 2', PILLAR2),
  onPiece('причал паромов', DECK7),
  onMover('паром к встрече', FERRY_A, { wait: { x: DECK7.x1 - 0.4, z: 36.6 }, go: (t) => cyc(FERRY_A, t) < 30 }),
  onMover('встречный паром', FERRY_B, { go: (t) => cyc(FERRY_A, t) >= 182 && cyc(FERRY_A, t) < 212 }),
  onPiece('финиш', FINISH, { go: (t) => cyc(FERRY_B, t) >= 2 && cyc(FERRY_B, t) < 40 }),
];

/**
 * Робот: бежит к цели; на краю перед водой или перед стенкой прыгает; в воздухе правит скорость так, чтобы
 * приземлиться на цель (как человек, который отпускает «вперёд» над ней). Пока ждёт (waiting) — стоит у точки
 * ожидания или на месте.
 */
function pilot(world: CollisionWorld, s: PlayerState, leg: Leg, t: number, waiting: boolean): { buttons: number; yaw: number } {
  if (waiting && !leg.wait) return { buttons: 0, yaw: WEST };
  const to = waiting ? { ...leg.wait!, top: s.y } : leg.to(t);
  const dx = to.x - s.x;
  const dz = to.z - s.z;
  const dist = Math.hypot(dx, dz);
  let wx = dx;
  let wz = dz;
  let go = dist > (waiting ? 0.45 : 0.08);
  if (s.grounded !== 1) {
    // сколько ещё лететь до высоты цели — и какая нужна скорость, чтобы прилететь на неё
    const disc = s.vy * s.vy + 2 * GRAVITY * (s.y - to.top);
    if (disc >= 0) {
      const ft = Math.max(0.05, (s.vy + Math.sqrt(disc)) / GRAVITY);
      wx = dx / ft - s.vx;
      wz = dz / ft - s.vz;
      go = Math.hypot(wx, wz) > 0.4;
    }
  }
  const yaw = Math.atan2(-wx, -wz);
  let jump = false;
  if (!waiting && s.grounded === 1 && dist > 0.5) {
    const ux = dx / dist;
    const uz = dz / dist;
    const low = (k: number) => groundAt(world, s.x + ux * k, s.y + 0.3, s.z + uz * k, t) < s.y - 0.6;
    jump = (low(0.75) && low(1.05)) || groundAt(world, s.x + ux * 0.75, s.y + 3, s.z + uz * 0.75, t) > s.y + STEP_HEIGHT;
  }
  return { buttons: (go ? BTN_FORWARD : 0) | (jump ? BTN_JUMP : 0), yaw };
}

/** Пошёл — значит пошёл: окно «можно идти» запоминается до конца отрезка (в прыжке назад не поворачивает). */
class Gate {
  private open: Leg | null = null;
  waiting(leg: Leg, t: number): boolean {
    if (this.open === leg || !leg.go || leg.go(t)) {
      this.open = leg;
      return false;
    }
    return true;
  }
}

interface Run {
  ms: number;
  /** Номера входов: старт забега и вход, на котором финиш */
  at: number;
  fin: number;
  maxY: number;
  legs: Array<[string, number]>;
  log: Input[];
}

/** Робот проходит полосу от мостика; бросает, если упал, если толкнуло или если не дошёл за 3 минуты. */
function robotRun(hub: Hub, who: { c: Client; s: FakeSink }): Run {
  const { c, s: sink } = who;
  const pad = new Pad(hub, c);
  const p = lp(hub, c);
  placeAt(hub, c, AQUA_RESPAWN.x, AQUA_RESPAWN.z);
  pad.hold(0, 3);
  const world = hub.lobby.world;
  const legs: Array<[string, number]> = [];
  let seen = sink.msgs.length;
  let k = 0;
  let maxY = 0;
  let at = -1;
  const gate = new Gate();
  for (let n = 0; n < 180 * TICK_RATE; n++) {
    const s = p.state;
    const t = pad.vt();
    while (k < WAY.length && WAY[k].done(s, t)) legs.push([WAY[k++].name, n]);
    const leg = WAY[Math.min(k, WAY.length - 1)];
    const where = () => `«${leg.name}» из (${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)}), тик ${n}`;
    const { buttons, yaw } = pilot(world, s, leg, t, gate.waiting(leg, t));
    const seq = pad.send(buttons, yaw);
    maxY = Math.max(maxY, p.state.y);
    for (; seen < sink.msgs.length; seen++) {
      const m = sink.msgs[seen];
      if (m.t === 'lev') {
        for (const e of m.e) {
          assert.ok(e[0] !== 'splash', `упал в воду: ${where()}`);
          assert.ok(e[0] !== 'aqhit', `толкнуло: ${where()}`);
        }
      } else if (m.t === 'aquaRun') {
        if (m.a === 'start') at = m.at;
        else if (m.a === 'finish') return { ms: m.ms, at, fin: seq, maxY, legs, log: pad.log };
        else assert.fail(`забег снят: ${where()}`);
      }
    }
  }
  return assert.fail(`не дошёл: остановился у «${WAY[Math.min(k, WAY.length - 1)].name}» (${p.state.x.toFixed(1)}, ${p.state.y.toFixed(1)}, ${p.state.z.toFixed(1)})`);
}

// ------------------------------------------------------------ доска и время

test('аквапарк: время «0:21.35», доска — у каждого свой лучший, пять лучших, при равенстве — кто раньше', () => {
  assert.equal(fmtAquaTime(21_350), '0:21.35');
  assert.equal(fmtAquaTime(65_004), '1:05.00');
  assert.equal(fmtAquaTime(0), '0:00.00');
  assert.equal(aquaMs(TICK_RATE * 20 + 21), 20_350);
  let top: AquaRecord[] = [];
  const add = (pid: number, ms: number, at: number): number => {
    const r = addRecord(top, { pid, nick: `и${pid}`, ms, at });
    top = r.top;
    return r.place;
  };
  assert.equal(add(1, 30_000, 1), 0);
  assert.equal(add(2, 25_000, 2), 0, 'быстрее — первый');
  assert.equal(add(1, 31_000, 3), -1, 'свой лучший не побил — доска та же');
  assert.equal(add(1, 24_000, 4), 0, 'побил — одна строка, новое время');
  assert.deepEqual(top.map((r) => [r.pid, r.ms]), [[1, 24_000], [2, 25_000]]);
  assert.equal(add(3, 25_000, 5), 2, 'то же время — ниже того, кто раньше');
  for (let pid = 4; pid <= 8; pid++) add(pid, 26_000 + pid, pid);
  assert.equal(top.length, AQUA_TOP);
  assert.equal(add(9, 99_000, 9), -1, 'не попал в пятёрку');
  assert.ok(top.every((r, i) => i === 0 || top[i - 1].ms <= r.ms));
});

// ------------------------------------------------------------ геометрия и окна

/** Прямоугольник, который площадка заметает за весь цикл. */
function sweptRect(m: AquaMover): Rect {
  return {
    x0: Math.min(m.x0, m.x0 + m.dx), x1: Math.max(m.x1, m.x1 + m.dx), z0: Math.min(m.z0, m.z0 + m.dz), z1: Math.max(m.z1, m.z1 + m.dz),
    top: Math.max(m.top, m.top + m.dy),
  };
}

function overlap(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 - 1e-9 && a.x1 > b.x0 + 1e-9 && a.z0 < b.z1 - 1e-9 && a.z1 > b.z0 + 1e-9;
}

/** Промежуток воды между прямоугольниками по x (они на одной линии по z). */
function gapX(a: Rect, b: Rect): number {
  return a.x1 <= b.x0 ? b.x0 - a.x1 : a.x0 - b.x1;
}

function gapZ(a: Rect, b: Rect): number {
  return a.z1 <= b.z0 ? b.z0 - a.z1 : a.z0 - b.z1;
}

/** Дальность прыжка с разбега по ровному (край до края: ноги стоят, пока хоть краем над куском) */
const JUMP_GAP = 8.4 * ((2 * JUMP_VELOCITY) / GRAVITY) + 2 * PLAYER_HALF;
/** Высота прыжка */
const JUMP_UP = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);

test('аквапарк: полоса — на воде к западу от площади, внутри стен, не задевает лодки и буи; горка — ступеньками не выше шага', () => {
  const map = buildLobby();
  const world = new CollisionWorld(map);
  // мостик — вровень с настилом, проход в бордюре
  assert.equal(world.groundBelow((AQUA_JETTY.x0 + AQUA_JETTY.x1) / 2, 1, 9), 0);
  assert.equal(world.groundBelow(-29.85, 1, 9), 0, 'бордюр у мостика разобран');
  assert.equal(world.groundBelow(-29.85, 1, 3), 0.22, 'а рядом — на месте');
  const all: Array<[string, Rect]> = [...AQUA_PIECES.map((p, i): [string, Rect] => [`${p.kind} ${i}`, p]), ...AQUA_MOVERS.map((m, i): [string, Rect] => [`${m.kind} ${i}`, sweptRect(m)])];
  for (const [name, r] of all) {
    assert.ok(r.x1 < AQUA_NEAR_X && r.x0 > -96.5 && r.z0 > -25 && r.z1 < 47, `${name} — к западу от площади, внутри стен`);
    assert.ok(!overlap(r, { ...AQUA_JETTY, top: 0 }), `${name} не налезает на мостик`);
    // лодки и буи на воде — в стороне
    for (const d of map.deco) {
      if (d.kind !== 'boat' && d.kind !== 'buoy') continue;
      const ex = Math.max(r.x0 - d.x, 0, d.x - r.x1);
      const ez = Math.max(r.z0 - d.z, 0, d.z - r.z1);
      assert.ok(Math.hypot(ex, ez) > 5, `${name} — дальше 5 м от ${d.kind} (${d.x}, ${d.z})`);
    }
  }
  // катер с пассажирами ходит восточнее
  for (let t = 0; t < BOAT_RIDE_TICKS; t += 30) {
    const b = ridePose(t);
    for (const [name, r] of all) assert.ok(b.x - r.x1 > 10 || Math.max(r.z0 - b.z, b.z - r.z1) > 10, `катер у ${name}: (${b.x.toFixed(1)}, ${b.z.toFixed(1)})`);
  }
  // горка на юг: ступеньки не выше шага, верхняя — у башни, нижняя — вровень с площадкой под ней
  const st = slideSteps(SLIDE);
  assert.equal(SLIDE.down, '+z');
  assert.equal(st[0].z0, SLIDE.z0);
  assert.equal(st[st.length - 1].z1, SLIDE.z1);
  let prev = SLIDE.top;
  for (const s of st) {
    assert.ok(prev - s.top <= STEP_HEIGHT && prev - s.top > 0, 'ступенька не выше шага');
    prev = s.top;
  }
  assert.equal(prev, SLIDE.low);
  assert.equal(SLIDE.top, TOWER.top);
  assert.equal(SLIDE.low, DECK4.top);
  // неподвижные куски не налезают друг на друга (кроме столба на площадке вертушки и горки у башни)
  for (let i = 0; i < AQUA_PIECES.length; i++) {
    for (let j = i + 1; j < AQUA_PIECES.length; j++) {
      const a = AQUA_PIECES[i];
      const b = AQUA_PIECES[j];
      if ((a === DISC && b === PYLON) || (a === PYLON && b === DISC)) continue;
      assert.ok(!overlap(a, b), `${a.kind} ${i} и ${b.kind} ${j} не налезают`);
    }
  }
  // подвижные — ни в какой момент не въезжают в неподвижные и друг в друга
  for (let t = 0; t < 1080; t++) {
    const boxes = AQUA_MOVERS.map((m) => boxAt(m, t));
    boxes.forEach((b, i) => {
      for (const p of AQUA_PIECES) assert.ok(!overlap(b, p), `${AQUA_MOVERS[i].kind} ${i} въехал в ${p.kind} на тике ${t}`);
      for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlap(b, boxes[j]), `${i} и ${j} столкнулись на тике ${t}`);
    });
  }
  // между кусками — вода: мимо полосы не пройти посуху
  assert.equal(world.groundBelow(-35.3, 1, 9), -Infinity);
  assert.equal(world.groundBelow(-55, 1, 9), -Infinity, 'паромная переправа — вода');
  assert.equal(world.groundBelow(-45, 1, 36.6), -Infinity, 'переправа двух паромов — вода');
  // подвижные боксы вне шага игрока — далеко за картой (мяч, камера и тени их не видят)
  for (const k of map.aquaMovers) assert.ok(world.minX[k] > 1e5 && world.maxY[k] < -1e5);
  // старт и финиш
  assert.ok(onJetty(AQUA_RESPAWN.x, 0, AQUA_RESPAWN.z));
  assert.ok(!onJetty(-36.5, -0.45, 9));
  const fx = (AQUA_FINISH.x0 + AQUA_FINISH.x1) / 2;
  const fz = (AQUA_FINISH.z0 + AQUA_FINISH.z1) / 2;
  assert.ok(onFinish(fx, AQUA_FINISH.top, fz));
  assert.ok(!onFinish(fx, AQUA_FINISH.top + 0.6, fz), 'в прыжке над финишем — ещё не финиш');
});

test('аквапарк: каждый кусок достижим в своё окно — паромы и лифт причаливают, подушки идут волной, батуты добрасывают', () => {
  // прыжки между неподвижными кусками — не длиннее 1,6 м воды; длинные переправы — только на пароме (с рывком не допрыгнуть)
  const hops: Array<[Rect, Rect]> = [[PAD1, PAD2], [PAD2, PAD3], [PAD3, DECK1], [TOWER2, PILLAR1], [PILLAR1, PILLAR2], [PILLAR2, DECK7]];
  for (const [a, b] of hops) assert.ok(gapX(a, b) <= 1.6 + 1e-9 && gapX(a, b) > 0.5, `прыжок ${gapX(a, b).toFixed(2)} м`);
  assert.ok(gapZ(DECK4, DISC) <= 1.6 + 1e-9 && gapZ(DISC, DECK5) <= 1.6 + 1e-9, 'на площадку вертушки и с неё — прыжком');
  assert.ok(JUMP_GAP > 6.5 && JUMP_GAP < 7.2, `прыжок с разбега ≈ ${JUMP_GAP.toFixed(2)} м`);
  assert.ok(gapX(DECK1, DECK2) > 12.5, 'паромная переправа длиннее прыжка с рывком');
  assert.ok(gapX(DECK7, FINISH) > 12.5, 'переправа двух паромов длиннее прыжка с рывком');

  // паромы и лифт стоят у причалов дольше секунды, впритык (0,1 м) и вровень
  const dock = (m: AquaMover, u: number, r: Rect, name: string) => {
    const t = u === 0 ? m.phase + 1 : m.phase + m.rest + m.go + 1;
    assert.equal(moverU(m, t), u, `${name}: стоит`);
    const b = boxAt(m, t);
    const g = Math.max(gapX(b, r), 0);
    assert.ok(g <= 0.11 + 1e-9 && Math.abs(b.top - r.top) < 1e-9, `${name}: впритык и вровень (${g.toFixed(2)})`);
    assert.ok((u === 0 ? m.rest : m.stay) >= 60, `${name}: стоит не меньше секунды`);
  };
  dock(FERRY, 0, DECK1, 'паром у первого причала');
  dock(FERRY, 1, DECK2, 'паром у второго причала');
  dock(LIFT, 0, DECK6, 'лифт внизу');
  dock(LIFT, 1, TOWER2, 'лифт наверху');
  dock(FERRY_A, 0, DECK7, 'паром у причала');
  dock(FERRY_B, 0, FINISH, 'встречный паром у финиша');
  const meet = FERRY_A.rest + FERRY_A.go + 1;
  assert.ok(gapX(boxAt(FERRY_A, meet), boxAt(FERRY_B, meet)) <= 0.11, 'паромы сходятся впритык');
  assert.deepEqual([FERRY_A.rest, FERRY_A.go, FERRY_A.stay, FERRY_A.back, FERRY_A.phase], [FERRY_B.rest, FERRY_B.go, FERRY_B.stay, FERRY_B.back, FERRY_B.phase]);
  // со встречи до финиша и с причала до встречного парома — не допрыгнуть (только на пароме)
  assert.ok(gapX(boxAt(FERRY_B, meet), FINISH) > JUMP_GAP, 'со встречи до финиша — больше прыжка');
  assert.ok(gapX(DECK7, boxAt(FERRY_B, meet)) > JUMP_GAP, 'с причала до встречного — больше прыжка');
  // на верхнюю палубу без лифта не запрыгнуть
  assert.ok(DECK6.top + JUMP_UP < TOWER2.top - 1);

  // тонущие подушки: 2,5 с наверху, мигают последние 0,8 с; волна на запад — соседки вместе наверху не меньше секунды
  const sinks = [SINK1, SINK2, SINK3, SINK4];
  for (let i = 0; i < sinks.length; i++) {
    const m = sinks[i];
    assert.equal(moverPeriod(m), 240);
    assert.equal(sinkWarn(m, m.phase + m.rest - 49), 0, 'ещё не мигает');
    assert.ok(sinkWarn(m, m.phase + m.rest - 1) > 0.95, 'вот-вот уйдёт — мигает');
    assert.equal(sinkWarn(FERRY, 100), 0, 'паром не мигает');
    const sunk = boxAt(m, m.phase + m.rest + m.go + 5);
    assert.ok(sunk.top < DROWN_Y - 0.5, 'ушла под воду глубже, чем тонет желейка');
    if (i > 0) {
      let both = 0;
      for (let t = 0; t < 240; t++) if (moverU(m, t) === 0 && moverU(sinks[i - 1], t) === 0) both++;
      assert.ok(both >= 60, `подушки ${i} и ${i + 1} вместе наверху ${both} тиков`);
      assert.ok(gapX(boxAt(sinks[i - 1], 0), boxAt(m, 0)) <= 1.6, 'между подушками — прыжок');
    }
  }
  // за волну всех подушек не перепрыгнуть даже с рывком
  assert.ok(gapX(DECK2, DECK3) > 12.5);

  // батуты: со слабого — на ступень, но не на башню; с сильного — на башню; без батутов — никуда
  const apex = (p: AquaPiece) => p.top + (p.bounce! * p.bounce!) / (2 * GRAVITY);
  assert.ok(apex(TRAMP1) > STEP.top + 0.5 && apex(TRAMP1) < TOWER.top, 'слабый батут — на ступень');
  assert.ok(apex(TRAMP2) > TOWER.top + 1, 'сильный — на башню');
  assert.ok(DECK3.top + JUMP_UP < STEP.top, 'на ступень прыжком не залезть');
  assert.ok(STEP.top + JUMP_UP < TOWER.top, 'на башню со ступени не запрыгнуть');
  assert.ok(TRAMP1.bounce! < TRAMP2.bounce! && TRAMP2.bounce! < TRAMPOLINE_VELOCITY, 'батуты слабее батута на площади');

  // вертушка накрывает всю площадку, перепрыгнуть её можно; мешки не перепрыгнуть и под ними не пройти
  const half = Math.min(DISC.x1 - DISC.x0, DISC.z1 - DISC.z0) / 2;
  assert.ok(AQUA_SWEEPER.len >= Math.SQRT2 * half - 0.01, 'перекладина достаёт до углов площадки');
  assert.ok(AQUA_SWEEPER.y1 < JUMP_UP - 0.5, 'перекладину можно перепрыгнуть');
  const low = makeBagPose();
  for (const b of AQUA_BAGS) {
    bagPose(b, b.phase, low);
    assert.ok(Math.abs(low.z - b.z) < 1e-9, 'в середине качания мешок над бревном');
    assert.ok(low.y - AQUA_BAG_H / 2 < BEAM.top + 1.6 - 0.3, 'под мешком не пройти');
    assert.ok(low.y + AQUA_BAG_H / 2 > BEAM.top + JUMP_UP + 0.2, 'через мешок не перепрыгнуть');
    bagPose(b, b.phase + b.period / 4, low);
    assert.ok(Math.abs(low.z - b.z) > PLAYER_HALF + AQUA_BAG_R + (BEAM.z1 - BEAM.z0) / 2 + 0.5, 'на размахе мешок далеко от бревна');
  }
});

// ------------------------------------------------------------ робот через хаб

test('аквапарк: робот проходит всю полосу через хаб — паромы, подушки, батуты, горка, вертушка, мешки, лифт, тумбы', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Пловец');
  const run = robotRun(hub, a);
  const names = run.legs.map(([n]) => n);
  for (const leg of WAY.slice(0, -1)) assert.ok(names.includes(leg.name), `прошёл «${leg.name}»`);
  assert.ok(run.maxY > TOWER.top - 0.05, 'сильный батут добросил до башни');
  assert.equal(run.ms, aquaMs(run.fin - run.at), 'время — по шагам: от входа старта до входа финиша');
  assert.ok(run.ms > 40_000 && run.ms < 120_000, `время разумное: ${fmtAquaTime(run.ms)}`);
  assert.equal(a.c.profile!.stats.aqRuns, 1);
  assert.equal(a.c.profile!.stats.aqBest, run.ms);
  assert.equal(lastOf(a.s, 'aquaTop')!.top[0].ms, run.ms);
});

test('аквапарк: время по шагам не зависит от дрожания сети — те же входы пачками и с паузами дают то же время и то же место', () => {
  const one = setupHub();
  const a = login(one.hub, 'Ровный');
  const run = robotRun(one.hub, a);
  const end = lp(one.hub, a.c).state;
  // те же входы, но доставка рваная: пачки до 12 входов, паузы до 50 тиков (на полосе сервер ждёт, не додумывая)
  const two = setupHub();
  const b = login(two.hub, 'Рваный');
  placeAt(two.hub, b.c, AQUA_RESPAWN.x, AQUA_RESPAWN.z);
  let rnd = 12345;
  const rand = (n: number) => {
    rnd = (rnd * 1103515245 + 12345) % 2147483648;
    return rnd % n;
  };
  const log = run.log;
  let i = 0;
  let pending: Input[] = [];
  let wait = 0;
  let finish: { ms: number } | null = null;
  // первые входы (на мостике) — ровно, как у первого: тот же тик сервера на старте
  while (i < 3) {
    two.hub.onBinary(b.c, encodeInputs([log[i++]], 0, 1, b.c.epoch));
    two.hub.step();
  }
  while (i < log.length || pending.length > 0) {
    if (i < log.length) pending.push(log[i++]);
    if (--wait <= 0 || i >= log.length) {
      for (let k = 0; k < pending.length; k += 12) two.hub.onBinary(b.c, encodeInputs(pending.slice(k, k + 12), 0, Math.min(12, pending.length - k), b.c.epoch));
      pending = [];
      wait = rand(4) === 0 ? 20 + rand(31) : 1 + rand(12);
    }
    two.hub.step();
    const f = lastOf(b.s, 'aquaRun');
    if (f?.a === 'finish') finish = f;
  }
  // дожать очередь
  for (let k = 0; k < 200 && lp(two.hub, b.c).inq.length > 0; k++) two.hub.step();
  const f = lastOf(b.s, 'aquaRun');
  if (f?.a === 'finish') finish = f;
  assert.ok(finish, 'тоже финишировал');
  assert.equal(finish.ms, run.ms, 'время то же');
  assert.ok(!allOf(b.s, 'lev').some((m) => m.e.some((e) => e[0] === 'splash')), 'не падал');
  assert.ok(statesEqual(lp(two.hub, b.c).state, end), 'и стоит там же, бит в бит');
});

test('аквапарк: на полосе сервер не додумывает шаги — ждёт входы до 1,5 с, потом как везде; на площади — как раньше', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Ждун');
  const p = lp(hub, a.c);
  const pad = new Pad(hub, a.c);
  // на причале парома идёт на запад, связь пропала на секунду — стоит, где был, а не бежит дальше в воду
  placeAt(hub, a.c, (DECK1.x0 + DECK1.x1) / 2 + 0.6, 9, DECK1.top);
  pad.hold(BTN_FORWARD, 6);
  const before = makeState();
  copyState(before, p.state);
  assert.ok(Math.hypot(before.vx, before.vz) > 2, 'шёл');
  steps(hub, 60);
  assert.ok(statesEqual(p.state, before), 'секунду без входов — ни шагу');
  // входы пришли — идёт дальше, как будто паузы не было
  pad.send(BTN_FORWARD);
  assert.ok(p.state.x < before.x, 'пошёл дальше');
  copyState(before, p.state);
  // дольше 1,5 с — как везде: стоит на месте (тормозит без кнопок), а не ждёт вечно
  steps(hub, AQUA_WAIT);
  assert.ok(statesEqual(p.state, before), 'до 1,5 с — ждёт');
  steps(hub, 10);
  assert.ok(!statesEqual(p.state, before), 'потом сервер шагает сам');
  assert.ok(Math.hypot(p.state.vx, p.state.vz) < Math.hypot(before.vx, before.vz), 'и без кнопок — тормозит');
  // на площади — как раньше: через 8 тиков без входов идёт по последнему
  placeAt(hub, a.c, 0, 6);
  pad.hold(BTN_FORWARD, 6);
  copyState(before, p.state);
  steps(hub, 20);
  assert.ok(Math.hypot(p.state.x - before.x, p.state.z - before.z) > 0.5, 'на площади додумывает шаги');
});

// ------------------------------------------------------------ предсказание клиента

/** Предсказание клиента с теми же препятствиями (как в client/lobby/scene.ts). */
function clientPredictor(): Predictor {
  const map = buildLobby();
  const world = new CollisionWorld(map);
  const dyn = new AquaDyn(world, map.aquaMovers);
  const hook: StepHook = {
    before: (s, inp, prev) => dyn.pre(s, inp.viewTick, Number.isNaN(prev) ? inp.viewTick : prev),
    after: (s, inp, ev) => dyn.post(s, ev, inp.viewTick),
  };
  return new Predictor(world, hook);
}

test('аквапарк: предсказание клиента на пароме, встречных паромах и лифте совпадает с сервером бит в бит — и при неровной метке', () => {
  for (const jitter of [false, true]) {
    const { hub } = setupHub();
    const a = login(hub, jitter ? 'Качка' : 'Штиль');
    const p = lp(hub, a.c);
    const pad = new Pad(hub, a.c);
    const pred = clientPredictor();
    // часы клиента — не с нуля
    steps(hub, 200);
    let vt = hub.lobby.tick - 30;
    let rnd = 7;
    /** Следующая метка: ровно тик за тик или неровно (часы клиента подстраиваются), но вперёд и в среднем тик за тик */
    const next = () => {
      if (!jitter) return (vt += 1);
      rnd = (rnd * 48271) % 2147483647;
      vt = quantTick(vt + [0.5, 0.75, 1, 1.25, 1.5][rnd % 5]);
      if (vt > hub.lobby.tick - 5) vt = hub.lobby.tick - 5;
      return vt;
    };
    /** Шаг: клиент предсказал, сервер посчитал — то же самое */
    const step = (buttons: number, yaw: number, what: string) => {
      const inp = pad.make(buttons, yaw, next());
      pred.step(inp, false);
      hub.onBinary(a.c, encodeInputs([inp], 0, 1, a.c.epoch));
      hub.step();
      assert.ok(statesEqual(pred.at(inp.seq)!.after, p.state), `вход ${inp.seq} у «${what}»: клиент и сервер разошлись`);
      assert.equal(pred.reconcile(inp.seq, p.state), false);
    };
    /** Пройти отрезки пути, предсказывая каждый шаг и сверяя с сервером */
    const drive = (from: string, count: number, start: Rect, at: { x: number; z: number }) => {
      const i = WAY.findIndex((l) => l.name === from);
      const legs = WAY.slice(i, i + count);
      placeAt(hub, a.c, at.x, at.z, start.top);
      pred.reset(p.state, pad.seq);
      step(0, WEST, 'встал');
      step(0, WEST, 'встал');
      let k = 0;
      const gate = new Gate();
      for (let n = 0; n < 1500 && k < legs.length; n++) {
        while (k < legs.length && legs[k].done(p.state, vt)) k++;
        if (k >= legs.length) break;
        const { buttons, yaw } = pilot(hub.lobby.world, p.state, legs[k], vt + 1, gate.waiting(legs[k], vt + 1));
        step(buttons, yaw, legs[k].name);
      }
      assert.equal(k, legs.length, `дошёл (${legs.map((l) => l.name).join(', ')})`);
    };
    drive('паром', 2, DECK1, { x: DECK1.x0 + 0.6, z: 9 });
    drive('лифт', 2, DECK6, { x: DECK6.x1 - 0.6, z: 36.6 });
    drive('паром к встрече', 3, DECK7, { x: DECK7.x1 - 0.6, z: 36.6 });
    assert.equal(pred.corrections, 0, 'ни одной поправки');
  }
});

// ------------------------------------------------------------ физика препятствий

/** Шаг желейки с препятствиями аквапарка (как на сервере и у клиента). */
function aquaStep(world: CollisionWorld, dyn: AquaDyn, s: PlayerState, t: number, tPrev: number, buttons = 0, yaw = WEST): ReturnType<typeof makeEvents> {
  const ev = makeEvents();
  const inp = makeInput();
  inp.buttons = buttons;
  inp.yaw = yaw;
  inp.viewTick = t;
  dyn.pre(s, t, tPrev);
  stepHeld(s, 0, inp, world, false, 0, ev);
  dyn.post(s, ev, t);
  return ev;
}

function standing(x: number, y: number, z: number): PlayerState {
  const s = makeState();
  s.x = x;
  s.y = y;
  s.z = z;
  s.grounded = 1;
  return s;
}

test('аквапарк: паром и лифт везут стоящего ровно на свой сдвиг, тонущая подушка уносит под воду; вне шага боксов нет', () => {
  const map = buildLobby();
  const world = new CollisionWorld(map);
  const dyn = new AquaDyn(world, map.aquaMovers);
  // паром: стоит у края — после всей переправы там же относительно парома, вровень с верхом
  const f0 = boxAt(FERRY, 0);
  const s = standing(f0.x0 + 0.5, f0.top, 9.3);
  let tPrev = 0;
  for (let t = 1; t <= FERRY.rest + FERRY.go + 10; t++) {
    aquaStep(world, dyn, s, t, tPrev);
    tPrev = t;
    const b = boxAt(FERRY, t);
    assert.ok(Math.abs(s.x - (b.x0 + 0.5)) < 1e-9 && s.y === b.top && s.grounded === 1, `тик ${t}: на пароме`);
  }
  assert.ok(world.minX[map.aquaMovers[0]] > 1e5, 'после шага паром — снова за картой');
  // неровные метки: везёт ровно на сдвиг между метками входов
  const s2 = standing(f0.x0 + 1, f0.top, 9);
  let p2 = 60;
  for (const t of [61, 61.5, 61.5, 64, 70.25, 71, 90.75]) {
    aquaStep(world, dyn, s2, t, p2);
    p2 = t;
    assert.ok(Math.abs(s2.x - (boxAt(FERRY, t).x0 + 1)) < 1e-9);
  }
  // лифт: поднимает на верхнюю палубу и стоит вровень с ней
  const l0 = boxAt(LIFT, 0);
  const s3 = standing((l0.x0 + l0.x1) / 2, l0.top, 36.6);
  tPrev = 0;
  for (let t = 1; t <= LIFT.rest + LIFT.go + 5; t++) {
    aquaStep(world, dyn, s3, t, tPrev);
    tPrev = t;
  }
  assert.ok(Math.abs(s3.y - TOWER2.top) < 1e-9 && s3.grounded === 1, `лифт поднял (${s3.y})`);
  // тонущая подушка: стоял — ушёл под воду ниже, чем тонет желейка
  const k0 = boxAt(SINK1, 0);
  const s4 = standing((k0.x0 + k0.x1) / 2, k0.top, 9);
  tPrev = 0;
  for (let t = 1; t <= SINK1.rest + SINK1.go + 2; t++) {
    aquaStep(world, dyn, s4, t, tPrev);
    tPrev = t;
  }
  assert.ok(s4.y < DROWN_Y, `утонул (${s4.y.toFixed(2)})`);
  // далеко от полосы — ни боксов, ни толчков: на площади физика та же
  const a = standing(0, 0, 6);
  const b = standing(0, 0, 6);
  for (let t = 1; t < 30; t++) {
    aquaStep(world, dyn, a, t, t - 1, BTN_FORWARD | (t === 5 ? BTN_JUMP : 0), 0.3);
    const inp = makeInput();
    inp.buttons = BTN_FORWARD | (t === 5 ? BTN_JUMP : 0);
    inp.yaw = 0.3;
    stepHeld(b, 0, inp, world, false, 0, makeEvents());
    assert.ok(statesEqual(a, b), `тик ${t}: на площади как без аквапарка`);
  }
});

test('аквапарк: вертушка и мешки сбивают в воду, перекладину можно перепрыгнуть; батуты — своей силы, на площади — как был', () => {
  const map = buildLobby();
  const world = new CollisionWorld(map);
  const dyn = new AquaDyn(world, map.aquaMovers);
  const sw = AQUA_SWEEPER;
  // перекладина вдоль +x (t = 0) — стоящего на её пути в 2 м от оси сбивает
  const s = standing(sw.x + 2, sw.top, sw.z);
  aquaStep(world, dyn, s, 0, 0);
  assert.equal(dyn.knock, KNOCK_SWEEP);
  assert.ok(Math.abs(Math.hypot(s.vx, s.vz) - KNOCK_SPEED) < 1e-6 && s.vy >= KNOCK_UP - GRAVITY / TICK_RATE - 1e-9 && s.grounded === 0);
  assert.ok(s.vz > 0, 'туда, куда идёт перекладина (к +z)');
  // в прыжке над ней — пролетает под ногами
  const j = standing(sw.x + 2, sw.top + sw.y1 + 0.05, sw.z);
  j.grounded = 0;
  aquaStep(world, dyn, j, 0, 0);
  assert.equal(dyn.knock, 0);
  // в стороне от перекладины — ничего
  const side = standing(sw.x, sw.top, sw.z + 2);
  aquaStep(world, dyn, side, 0, 0);
  assert.equal(dyn.knock, 0);
  assert.ok(Math.abs(sweepAngle(sw.period / 4) - Math.PI / 2) < 1e-12, 'четверть оборота — вдоль +z');
  // мешок в середине качания над бревном — сбивает поперёк бревна, туда, куда летит
  const b0 = AQUA_BAGS[0];
  const m = standing(b0.x, BEAM.top, b0.z);
  aquaStep(world, dyn, m, b0.phase, b0.phase);
  assert.equal(dyn.knock, KNOCK_BAG);
  assert.ok(Math.abs(Math.abs(m.vz) - KNOCK_SPEED) < 1e-6 && Math.abs(m.vx) < 1e-9);
  // на размахе — мешок в стороне
  const m2 = standing(b0.x, BEAM.top, b0.z);
  aquaStep(world, dyn, m2, b0.phase + b0.period / 4, b0.phase + b0.period / 4);
  assert.equal(dyn.knock, 0);
  // батуты: слабый и сильный — своей силы
  for (const tr of [TRAMP1, TRAMP2]) {
    const st = standing((tr.x0 + tr.x1) / 2, tr.top + 0.3, (tr.z0 + tr.z1) / 2);
    st.grounded = 0;
    st.vy = -3;
    let ev = makeEvents();
    for (let t = 0; t < 30 && !ev.bounced; t++) ev = aquaStep(world, dyn, st, t, t);
    assert.ok(ev.bounced, 'отскочил');
    assert.equal(st.vy, tr.bounce, `батут ${tr.bounce} м/с`);
  }
  // а батут на площади — прежний
  const plaza = map.boxes.findIndex((bx, i) => world.tramp[i] === 1 && bx.max[0] > -30);
  assert.ok(plaza >= 0, 'батут на площади есть');
  const pb = map.boxes[plaza];
  const ps = standing((pb.min[0] + pb.max[0]) / 2, pb.max[1] + 0.3, (pb.min[2] + pb.max[2]) / 2);
  ps.grounded = 0;
  ps.vy = -3;
  let pev = makeEvents();
  for (let t = 0; t < 30 && !pev.bounced; t++) pev = aquaStep(world, dyn, ps, t, t);
  assert.ok(pev.bounced);
  assert.equal(ps.vy, TRAMPOLINE_VELOCITY);
});

test('аквапарк: метка времени — в 1/256 тика, как в протоколе; сервер зажимает её в окно и не даёт идти назад', () => {
  assert.equal(quantTick(100), 100);
  assert.equal(quantTick(100.5), 100.5);
  assert.equal(quantTick(100.999999), 100 + 255 / 256);
  assert.equal(quantTick(-3), 0);
  for (const v of [0.1, 7.3, 1234.567, 99999.9]) {
    const q = quantTick(v);
    assert.ok(q <= v && v - q < 1 / 256 + 1e-9);
    assert.equal(q * 256, Math.floor(q * 256), 'ровно в 1/256');
  }
  // протокол доносит метку как есть
  const inp = makeInput();
  inp.seq = 1;
  inp.viewTick = quantTick(54321.7);
  const { hub } = setupHub();
  const a = login(hub, 'Метка');
  hub.onBinary(a.c, encodeInputs([inp], 0, 1, a.c.epoch));
  assert.equal(lp(hub, a.c).inq.items[0].viewTick, inp.viewTick);
  // окно: не старее AQUA_LAG тиков, не новее тика сервера, не назад
  assert.equal(aquaClock(950, 900, 1000), 950);
  assert.equal(aquaClock(700, 0, 1000), 1000 - AQUA_LAG, 'старое — подтягивается');
  assert.equal(aquaClock(1200, 900, 1000), 1000, 'из будущего — нельзя');
  assert.equal(aquaClock(890, 900, 1000), 900, 'назад время не идёт');
});

// ------------------------------------------------------------ забег, пауза, рекорды

/** Встать на мостик, потом на первую подушку (сошёл с мостика на запад — старт). Возвращает номер входа старта. */
function startRun(hub: Hub, pad: Pad): number {
  placeAt(hub, pad.c, AQUA_RESPAWN.x, AQUA_RESPAWN.z);
  pad.hold(0, 2);
  placeAt(hub, pad.c, (PAD1.x0 + PAD1.x1) / 2, (PAD1.z0 + PAD1.z1) / 2, PAD1.top);
  return pad.send(0);
}

/** Встать на финишную площадку. Возвращает номер входа, на котором финиш. */
function finish(hub: Hub, pad: Pad): number {
  placeAt(hub, pad.c, (FINISH.x0 + FINISH.x1) / 2, (FINISH.z0 + FINISH.z1) / 2, FINISH.top);
  return pad.send(0);
}

test('аквапарк: старт — только с мостика на запад; упал — снова на мостике, забег снят; вернулся на мостик — снят', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Прыгун');
  const pad = new Pad(hub, a.c);
  // с площади на мостик и обратно на площадь — ничего
  placeAt(hub, a.c, AQUA_RESPAWN.x, AQUA_RESPAWN.z);
  pad.hold(0, 2);
  placeAt(hub, a.c, -25, 9);
  pad.hold(0, 2);
  assert.equal(lastOf(a.s, 'aquaRun'), undefined, 'ушёл на площадь — не старт');
  assert.equal(hub.lobby.aqua.startOf(lp(hub, a.c).slot), -1);
  // сошёл на запад — старт с номером своего входа
  const at = startRun(hub, pad);
  const st = lastOf(a.s, 'aquaRun');
  assert.equal(st?.a, 'start');
  assert.equal(st.a === 'start' ? st.at : -1, at);
  assert.equal(hub.lobby.aqua.startOf(lp(hub, a.c).slot), at);
  // упал в воду между подушками — плюх, на мостике лицом к полосе, забег снят
  placeAt(hub, a.c, -39.0, 9, -1.4);
  pad.hold(0, 10);
  assert.equal(lastOf(a.s, 'aquaRun')?.a, 'stop');
  const s = lp(hub, a.c).state;
  assert.ok(onJetty(s.x, s.y, s.z), `снова на мостике (${s.x.toFixed(2)}, ${s.z.toFixed(2)})`);
  assert.equal(hub.lobby.aqua.startOf(lp(hub, a.c).slot), -1);
  // снова старт, потом назад на мостик — снят
  startRun(hub, pad);
  assert.equal(lastOf(a.s, 'aquaRun')?.a, 'start');
  placeAt(hub, a.c, AQUA_RESPAWN.x, AQUA_RESPAWN.z);
  pad.hold(0, 2);
  assert.equal(lastOf(a.s, 'aquaRun')?.a, 'stop');
  // в прыжке над финишем — не финиш, на площадке — финиш
  startRun(hub, pad);
  placeAt(hub, a.c, (FINISH.x0 + FINISH.x1) / 2, 36.6, FINISH.top + 1.2);
  pad.hold(0, 3);
  assert.equal(lastOf(a.s, 'aquaRun')?.a, 'start', 'ещё летит');
  pad.hold(0, 40);
  assert.equal(lastOf(a.s, 'aquaRun')?.a, 'finish');
});

test('аквапарк: свернул игру посреди забега (метка прыгнула вперёд больше чем на секунду) — забег снят; короткая заминка — нет', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Соня');
  const pad = new Pad(hub, a.c);
  startRun(hub, pad);
  steps(hub, AQUA_PAUSE - 10);
  // заминка меньше секунды: метка прыгнула на 0,8 с — забег идёт
  pad.send(0, WEST, pad.vt());
  pad.hold(0, 5);
  assert.equal(lastOf(a.s, 'aquaRun')?.a, 'start');
  // вкладка была свёрнута 2 с: входов не было, метка прыгнула — снят, с подсказкой
  steps(hub, 2 * TICK_RATE);
  pad.send(0);
  const r = lastOf(a.s, 'aquaRun');
  assert.equal(r?.a, 'stop');
  assert.match(lastOf(a.s, 'toast')!.text, /пауз/);
  assert.equal(hub.lobby.aqua.startOf(lp(hub, a.c).slot), -1);
});

test('аквапарк: часы препятствий и шаги идут вместе — «замедленная» игра или придержанная метка снимают забег, неровная — нет', () => {
  /** Забег стоя на первой подушке: метка следующего входа — next(прошлая) */
  const run = (start: number, next: (vt: number, i: number) => number, n: number) => {
    const { hub } = setupHub();
    const a = login(hub, 'Часы');
    const pad = new Pad(hub, a.c);
    steps(hub, 300);
    let vt = hub.lobby.tick - start;
    placeAt(hub, a.c, AQUA_RESPAWN.x, AQUA_RESPAWN.z);
    pad.send(0, WEST, vt++);
    pad.send(0, WEST, vt++);
    placeAt(hub, a.c, (PAD1.x0 + PAD1.x1) / 2, (PAD1.z0 + PAD1.z1) / 2, PAD1.top);
    pad.send(0, WEST, vt);
    assert.equal(lastOf(a.s, 'aquaRun')?.a, 'start');
    for (let i = 0; i < n && lastOf(a.s, 'aquaRun')?.a === 'start'; i++) {
      vt = next(vt, i);
      pad.send(0, WEST, vt);
    }
    return { a, steps: pad.seq };
  };
  // игра «замедлена» на четверть: препятствия едут быстрее шагов — снят примерно через 5 с
  const slow = run(140, (vt) => vt + 1.25, 2000);
  assert.equal(lastOf(slow.a.s, 'aquaRun')?.a, 'stop');
  assert.match(lastOf(slow.a.s, 'toast')!.text, /пауз/);
  assert.ok(slow.steps < 3 + Math.ceil((AQUA_SKEW + 1) / (0.25 - AQUA_SKEW_K)) + 2, `снят через ${slow.steps} шагов`);
  // метку придерживают (копят время на потом) — тоже
  const held = run(10, (vt) => vt + 0.5, 2000);
  assert.equal(lastOf(held.a.s, 'aquaRun')?.a, 'stop');
  // неровная, но честная метка (часы подстраиваются, сервер подстраивает темп на 3 %) — забег идёт
  let rnd = 3;
  const fair = run(30, (vt, i) => {
    rnd = (rnd * 48271) % 2147483647;
    return quantTick(vt + [0.5, 0.75, 1, 1.25, 1.5][rnd % 5] + (i % 33 === 0 ? 0.03 * 33 : 0));
  }, 1500);
  assert.equal(lastOf(fair.a.s, 'aquaRun')?.a, 'start', 'забег идёт');
});

test('аквапарк: финиш — в профиль и на доску рекордов, рекорд полосы — в чат; медленнее — без чата; доска хранится', () => {
  const { hub, store } = setupHub();
  const a = login(hub, 'Акула');
  const b = login(hub, 'Карась');
  const pa = new Pad(hub, a.c);
  const pb = new Pad(hub, b.c);
  assert.deepEqual(lastOf(b.s, 'lobby')!.aqua, []);
  const at = startRun(hub, pa);
  pa.hold(0, 20 * TICK_RATE - 1);
  const fin = finish(hub, pa);
  const fa = lastOf(a.s, 'aquaRun');
  assert.ok(fa?.a === 'finish');
  const ms = fa.ms;
  assert.equal(ms, aquaMs(fin - at), 'время — по шагам');
  assert.ok(Math.abs(ms - 20_000) < 100, `20 с шагов: ${ms}`);
  assert.equal(fa.place, 0);
  assert.equal(fa.best, ms);
  assert.equal(a.c.profile!.stats.aqRuns, 1);
  assert.equal(a.c.profile!.stats.aqBest, ms);
  assert.match(lastOf(a.s, 'toast')!.text, /Финиш: 0:20\.\d\d — рекорд полосы/);
  const chat = lastOf(b.s, 'chat')!;
  assert.ok(chat.sys);
  assert.match(chat.text, /Акула проходит аквапарк за 0:20\.\d\d — новый рекорд полосы!/);
  assert.deepEqual(lastOf(b.s, 'aquaTop')!.top, [{ pid: a.c.pid, nick: 'Акула', ms }]);

  // второй медленнее — второе место, без чата
  const chats = allOf(b.s, 'chat').length;
  startRun(hub, pb);
  pb.hold(0, 25 * TICK_RATE);
  finish(hub, pb);
  const fb = lastOf(b.s, 'aquaRun');
  assert.ok(fb?.a === 'finish');
  assert.equal(fb.place, 1);
  assert.match(lastOf(b.s, 'toast')!.text, /твой лучший результат/);
  assert.equal(allOf(b.s, 'chat').length, chats, 'не рекорд — в чат не пишем');
  assert.equal(lastOf(a.s, 'aquaTop')!.top.length, 2);

  // первый ещё раз, медленнее своего — доска та же, в тосте — его лучший
  const tops = allOf(a.s, 'aquaTop').length;
  startRun(hub, pa);
  pa.hold(0, 30 * TICK_RATE);
  finish(hub, pa);
  const fa2 = lastOf(a.s, 'aquaRun');
  assert.ok(fa2?.a === 'finish');
  assert.equal(fa2.place, -1);
  assert.equal(fa2.best, ms);
  assert.equal(a.c.profile!.stats.aqRuns, 2);
  assert.match(lastOf(a.s, 'toast')!.text, /твой лучший — 0:20\.\d\d/);
  assert.equal(allOf(a.s, 'aquaTop').length, tops, 'доска не менялась');

  // новый ник — и на доске; новичок видит доску при входе; доска переживает перезапуск
  hub.onJson(b.c, { t: 'rename', nick: 'Карасик' });
  assert.equal(lastOf(a.s, 'aquaTop')!.top[1].nick, 'Карасик');
  const c = login(hub, 'Новичок');
  assert.equal(lastOf(c.s, 'lobby')!.aqua.length, 2);
  store.flush();
  const again = new Store(store.dir, { log: () => {} });
  again.load();
  assert.deepEqual(again.state.aqua.map((r) => [r.nick, r.ms]), [['Акула', ms], ['Карасик', fb.ms]]);
});

test('аквапарк: новая полоса — новая доска: старые рекорды и личные лучшие сброшены, сколько раз проходил — осталось', () => {
  const { store, hub } = setupHub();
  const a = login(hub, 'Старожил');
  a.c.profile!.stats.aqBest = 31_000;
  a.c.profile!.stats.aqRuns = 7;
  store.state.aqua = [{ pid: a.c.pid, nick: 'Старожил', ms: 31_000, at: 1 }];
  store.markDirty();
  store.flush();
  const file = path.join(store.dir, 'state.json');
  const load = () => {
    const s = new Store(store.dir, { log: () => {} });
    s.load();
    return { state: s.state, me: s.state.profiles.find((p) => p.id === a.c.pid)! };
  };
  // та же полоса — всё на месте
  let got = load();
  assert.equal(got.state.aquaCourse, AQUA_COURSE);
  assert.equal(got.state.aqua.length, 1);
  assert.equal(got.me.stats.aqBest, 31_000);
  // файл старой полосы (без номера — выпуск 5, или с прежним номером) — доска пустая, лучшие — с нуля
  for (const old of [undefined, AQUA_COURSE - 1]) {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    raw.aqua = [{ pid: a.c.pid, nick: 'Старожил', ms: 31_000, at: 1 }];
    if (old === undefined) delete raw.aquaCourse;
    else raw.aquaCourse = old;
    for (const p of raw.profiles as Array<{ id: number; stats: { aqBest: number } }>) if (p.id === a.c.pid) p.stats.aqBest = 31_000;
    writeFileSync(file, JSON.stringify(raw));
    got = load();
    assert.deepEqual(got.state.aqua, [], 'доска новой полосы пустая');
    assert.equal(got.me.stats.aqBest, 0, 'личный лучший — с нуля');
    assert.equal(got.me.stats.aqRuns, 7, 'сколько раз проходил — осталось');
    assert.equal(got.state.aquaCourse, AQUA_COURSE);
  }
});
