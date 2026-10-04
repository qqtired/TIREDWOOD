// Оформление площади (plaza2, docs/plaza-redesign-2026-10-04.md): выбор оформления, зазывалы входов, живые строки статусов
// и твёрдые предметы в общей карте (их видят сервер и браузер одинаково): не перекрывают друг друга, круги сбора, точки
// взаимодействия и появления; лежат в самом конце списка боксов.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOAT_RIDE_TICKS, BOAT_SEATS, BP_BOARD, BP_RIDE } from '../shared/boat.ts';
import { TICK_RATE } from '../shared/constants.ts';
import { FORT_MAX_HUMANS, FT_BREAK, FT_END, FT_GATHER, FT_WAVE } from '../shared/fort.ts';
import { BUBBLE_CHARS } from '../shared/lobby.ts';
import { BOAT_RACE_CIRCLE, FORT_ARCH, HIDE_CIRCLE, KART_START, LAMP_FORT, SKILL_PORTAL, buildLobby } from '../shared/maps/lobby.ts';
import { itemOf } from '../shared/outfit.ts';
import { FIGHT_POSTS, PB_BARRELS, REGATTA_BOATS, REGATTA_MASTS, SIGNPOST, YARD_BARREL, YARD_CRATES, YARD_GATE, plazaSolids } from '../shared/plaza2.ts';
import { FC_CIRCLE } from '../shared/fight.ts';
import { TOUT_INFO, type ToutKey } from '../client/lobby/plaza/data.ts';
import { DEFAULT_PLAZA, pickPlaza } from '../client/lobby/plaza/flag.ts';
import { boatPlateLine, emptyLive, fillLive, liveLines, plural, type LiveIn, type LiveRaw } from '../client/lobby/plaza/live.ts';

const KEYS = Object.keys(TOUT_INFO) as ToutKey[];

test('оформление: ?plaza= в адресе сильнее запомненного выбора, мусор — по умолчанию', () => {
  assert.equal(pickPlaza('', null), DEFAULT_PLAZA);
  assert.equal(pickPlaza('?plaza=1', null), 1);
  assert.equal(pickPlaza('?plaza=2', '1'), 2);
  assert.equal(pickPlaza('?x=1', '1'), 1);
  assert.equal(pickPlaza('?plaza=7', '2'), 2);
  assert.equal(pickPlaza('?plaza=', 'oops', 1), 1);
  assert.equal(pickPlaza('?plaza=7', 'oops', 2), 2);
});

test('зазывалы: девять, номера от 960 и все разные, имена короткие, наряды из каталога, реплики влезают в облачко', () => {
  assert.equal(KEYS.length, 9);
  const ids = new Set<number>();
  for (const k of KEYS) {
    const t = TOUT_INFO[k];
    assert.ok(t.id >= 960, `${k}: номер ${t.id}`);
    assert.ok(!ids.has(t.id), `${k}: номер повторяется`);
    ids.add(t.id);
    assert.ok(t.name.length > 0 && t.name.length <= 22, `${k}: имя «${t.name}»`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(t.accent), `${k}: цвет точки`);
    for (const slot of ['p', 'e', 'h', 'a'] as const) assert.ok(itemOf(slot, t.outfit[slot]), `${k}: нет вещи ${slot}:${t.outfit[slot]}`);
    assert.ok(t.outfit.c >= 0 && t.outfit.c < 16 && t.outfit.c2 >= 0 && t.outfit.c2 < 16, `${k}: цвета`);
    assert.ok(t.lines.length >= 2, `${k}: реплик мало`);
    for (const line of t.lines) assert.ok(line.length > 0 && line.length <= BUBBLE_CHARS, `${k}: «${line}» ${line.length} знаков`);
  }
});

test('живые реплики: по каждому статусу — короткие строки, без статуса — пусто, «желейка» склоняется', () => {
  assert.equal(plural(1, 'желейка', 'желейки', 'желеек'), 'желейка');
  assert.equal(plural(3, 'желейка', 'желейки', 'желеек'), 'желейки');
  assert.equal(plural(5, 'желейка', 'желейки', 'желеек'), 'желеек');
  assert.equal(plural(11, 'желейка', 'желейки', 'желеек'), 'желеек');
  assert.equal(plural(21, 'желейка', 'желейки', 'желеек'), 'желейка');
  for (const k of KEYS) assert.deepEqual(liveLines(k, emptyLive()), [], `${k}: без статуса — свои реплики`);

  const states: LiveIn[] = [];
  const base = (): LiveIn => emptyLive();
  for (const humans of [0, 1, 3, FORT_MAX_HUMANS]) {
    for (const phase of [FT_GATHER, FT_WAVE, FT_BREAK, FT_END]) states.push({ ...base(), fort: { phase, wave: 123, humans, left: 25 } });
  }
  for (const n of [0, 2, 5]) for (const phase of ['pre', 'run', 'idle']) states.push({ ...base(), skill: { n, max: 5, phase, left: 12 } });
  for (const phase of ['count', 'race', 'results', 'idle']) states.push({ ...base(), kart: { phase, n: 4, left: 9, lap: 2, laps: 3 } });
  for (const phase of ['gather', 'hide', 'seek']) states.push({ ...base(), hide: { phase, n: 3, max: 8 } });
  states.push({ ...base(), pbHumans: 7 });
  states.push({ ...base(), regatta: { q: { phase: 'count', n: 4, left: 7 }, running: false } });
  states.push({ ...base(), regatta: { q: { phase: 'idle', n: 5 }, running: false } });
  states.push({ ...base(), regatta: { q: null, running: true } });
  for (const phase of ['count', 'fight', 'idle']) states.push({ ...base(), fight: { phase, left: 14, n: 2 } });
  for (const ph of [0, BP_BOARD, BP_RIDE]) for (const n of [0, 2, BOAT_SEATS]) states.push({ ...base(), boat: { ph, n, left: 22 } });
  let produced = 0;
  for (const s of states) {
    for (const k of KEYS) {
      for (const line of liveLines(k, s)) {
        produced++;
        assert.ok(line.length > 0 && line.length <= BUBBLE_CHARS, `${k}: «${line}» ${line.length} знаков`);
        assert.ok(!/undefined|NaN|\[object/.test(line), `${k}: «${line}»`);
      }
    }
  }
  assert.ok(produced >= 40, `живых реплик ${produced}`);
});

test('строка конторы порта: свободен / посадка (места) / в поездке', () => {
  const at = (ph: number, n: number, left: number): LiveIn => ({ ...emptyLive(), boat: { ph, n, left } });
  assert.equal(boatPlateLine(emptyLive()), 'Катер свободен · нажми E');
  assert.equal(boatPlateLine(at(0, 0, 0)), 'Катер свободен · нажми E');
  assert.equal(boatPlateLine(at(BP_BOARD, 1, 18)), 'Отплытие через 18 с · мест: 3');
  assert.equal(boatPlateLine(at(BP_BOARD, BOAT_SEATS, 5)), 'Мест нет · отплытие через 5 с');
  assert.equal(boatPlateLine(at(BP_RIDE, 2, 41)), 'В поездке · вернётся через 41 с');
  for (const s of [at(BP_BOARD, 0, 30), at(BP_RIDE, 4, 60)]) assert.ok(boatPlateLine(s).length <= 40);
});

test('fillLive: статусы сцены → строки, секунды считаются от тиков, повторный вызов не плодит объектов', () => {
  const out = emptyLive();
  const raw = (over: Partial<LiveRaw> = {}): LiveRaw => ({
    pbHumans: 2, fort: null, skill: null, kart: { phase: 'count', n: 3, lap: 0, laps: 3 }, kartLeft: 8, hide: { phase: 'idle', n: 1, max: 8 },
    boatrace: { phase: 'count', n: 2, left: 6 }, regattaRunning: false, fight: { phase: 'count', left: 10, names: ['a', 'b'] },
    boat: { ph: BP_BOARD, at: 1000 + 30 * TICK_RATE, n: 1 }, tick: 1000, tickRate: TICK_RATE, ...over,
  });
  fillLive(out, raw());
  assert.equal(out.pbHumans, 2);
  assert.equal(out.kart?.left, 8);
  assert.equal(out.hide?.phase, 'gather', 'круг сбора пряток — это сбор');
  assert.equal(out.regatta.q?.n, 2);
  assert.equal(out.fight?.n, 2);
  assert.equal(out.boat?.left, 30);
  const kart = out.kart;
  const boat = out.boat;
  fillLive(out, raw({ boat: { ph: BP_RIDE, at: 1000, n: 2 }, tick: 1000 + 15 * TICK_RATE }));
  assert.equal(out.kart, kart, 'объекты переиспользуются');
  assert.equal(out.boat, boat);
  assert.equal(out.boat?.left, BOAT_RIDE_TICKS / TICK_RATE - 15, 'поездка: её длина минус 15 с');
  fillLive(out, raw({ kart: null, hide: null, boatrace: null, fight: null }));
  assert.equal(out.kart, null);
  assert.equal(out.hide, null);
  assert.equal(out.regatta.q, null);
  assert.equal(out.fight, null);
});

// ------------------------------------------------------------ твёрдые предметы в карте

const lobby = buildLobby();
const solids = plazaSolids();

test('твёрдое оформление: боксы лежат в самом конце списка, число совпадает, размеры разумные', () => {
  assert.equal(lobby.plazaBoxes.length, solids.length);
  assert.deepEqual(lobby.plazaBoxes, [...Array(solids.length).keys()].map((i) => lobby.boxes.length - solids.length + i));
  const last = lobby.boxes.slice(-solids.length);
  last.forEach((b, i) => {
    const s = solids[i];
    assert.ok(Math.abs((b.min[0] + b.max[0]) / 2 - s.x) < 1e-9 && Math.abs((b.min[2] + b.max[2]) / 2 - s.z) < 1e-9, `бокс ${i} в своём месте`);
    assert.ok(b.max[1] - b.min[1] > 0.5 && b.max[0] - b.min[0] <= 3 && b.max[2] - b.min[2] <= 3, `бокс ${i} размер`);
  });
});

test('твёрдое оформление: не пересекает ни прежние боксы, ни друг друга (ящики — стопкой, касаясь)', () => {
  const n = lobby.boxes.length - solids.length;
  const inter = (a: number, b: number): number => {
    const A = lobby.boxes[a];
    const B = lobby.boxes[b];
    const dx = Math.min(A.max[0], B.max[0]) - Math.max(A.min[0], B.min[0]);
    const dy = Math.min(A.max[1], B.max[1]) - Math.max(A.min[1], B.min[1]);
    const dz = Math.min(A.max[2], B.max[2]) - Math.max(A.min[2], B.min[2]);
    return dx > 1e-6 && dy > 1e-6 && dz > 1e-6 ? dx * dy * dz : 0;
  };
  for (let i = n; i < lobby.boxes.length; i++) {
    for (let j = 0; j < i; j++) assert.equal(inter(i, j), 0, `бокс ${i - n} (${solids[i - n].x}; ${solids[i - n].z}) пересекает бокс ${j}`);
  }
  // батуты — тоже боксы карты: ни один не задевает оформление (арка «Рыбного двора» вплотную — раньше задевала)
  for (const t of lobby.trampolines) {
    for (const s of solids) {
      const dx = Math.max(Math.abs(t.x - s.x) - s.hx, 0);
      const dz = Math.max(Math.abs(t.z - s.z) - s.hz, 0);
      assert.ok(Math.hypot(dx, dz) > t.r, `батут (${t.x}; ${t.z}) задевает предмет (${s.x}; ${s.z})`);
    }
  }
});

/** Расстояние от точки до прямоугольника предмета на земле */
function gap(px: number, pz: number, s: { x: number; z: number; hx: number; hz: number }): number {
  return Math.hypot(Math.max(Math.abs(px - s.x) - s.hx, 0), Math.max(Math.abs(pz - s.z) - s.hz, 0));
}

test('твёрдое оформление: круги сбора и точки взаимодействия свободны, в круг можно встать целиком', () => {
  const circles = [
    { ...HIDE_CIRCLE }, { ...BOAT_RACE_CIRCLE }, { x: KART_START.x, z: KART_START.z, r: KART_START.r }, { ...SKILL_PORTAL },
    { x: FC_CIRCLE.x, z: FC_CIRCLE.z, r: FC_CIRCLE.r }, { x: 0, z: -15.2, r: 2.2 },
  ];
  for (const c of circles) for (const s of solids) assert.ok(gap(c.x, c.z, s) > c.r, `круг (${c.x}; ${c.z}) задевает предмет (${s.x}; ${s.z})`);
  for (const it of lobby.interact) for (const s of solids) assert.ok(gap(it.x, it.z, s) > 0.35, `точка ${it.kind} (${it.x}; ${it.z}) у предмета (${s.x}; ${s.z})`);
  for (const sp of [lobby.spawn, lobby.gateSpawn, lobby.garageSpawn, lobby.fortSpawn]) {
    for (const s of solids) assert.ok(gap(sp.x, sp.z, s) > 0.4, `место появления (${sp.x}; ${sp.z}) у предмета (${s.x}; ${s.z})`);
  }
});

test('оформление у входов: столбики и мачты стоят там, где их рисует клиент (общие константы)', () => {
  const at = (x: number, z: number): boolean => solids.some((s) => Math.abs(s.x - x) < 1e-9 && Math.abs(s.z - z) < 1e-9);
  for (const b of PB_BARRELS) assert.ok(at(b.x, b.z), 'бочка пейнтбола');
  for (const m of REGATTA_MASTS) assert.ok(at(m.x, m.z), 'мачта регаты');
  for (const p of FIGHT_POSTS) assert.ok(at(p.x, p.z), 'столбик у Fight Club');
  assert.ok(at(YARD_GATE.x - YARD_GATE.half, YARD_GATE.z) && at(YARD_GATE.x + YARD_GATE.half, YARD_GATE.z), 'стойки арки двора');
  assert.ok(at(YARD_BARREL.x, YARD_BARREL.z), 'бочка двора');
  for (const c of YARD_CRATES) assert.ok(at(c.x, c.z), 'ящик двора');
  // лодки регаты — на воде, у них коллизии нет: они не должны стоять на суше (z > 22 — за кромкой)
  for (const b of REGATTA_BOATS) assert.ok(b.z - 0.95 > 22, `лодка ${b.num} у стенки, не на настиле`);
});

test('улица: фонарь не стоит на оси проулка крепости, указатель у звезды твёрдый и не на месте появления', () => {
  const lamps = lobby.deco.filter((d) => d.kind === 'lamp');
  assert.ok(lamps.some((d) => d.x === LAMP_FORT.x && d.z === LAMP_FORT.z), 'фонарь на новом месте');
  assert.ok(!lamps.some((d) => d.x === 11 && d.z === -11), 'старого фонаря на оси арки нет');
  for (const l of lamps) assert.ok(Math.abs(l.x - FORT_ARCH.x) > FORT_ARCH.w / 2 + 0.5 || l.z > -5 || l.z < -16, `фонарь (${l.x}; ${l.z}) закрывает проулок крепости с площади`);
  assert.ok(solids.some((s) => s.x === SIGNPOST.x && s.z === SIGNPOST.z), 'столб указателя в карте');
  assert.ok(Math.hypot(SIGNPOST.x - lobby.spawn.x, SIGNPOST.z - lobby.spawn.z) > 3, 'указатель не на месте появления');
  assert.ok(Math.hypot(SIGNPOST.x - 0, SIGNPOST.z - 3.6) > 2, 'указатель не на самой звезде');
});
