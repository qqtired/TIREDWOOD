// Помехи трассы картинга: раскладка на дороге, движущиеся помехи — функция времени гонки, ускорители, лужи, бочки и
// блоки (физика каждой — на трассе только с ней), контейнеры, груз и шлагбаум (бьют не всегда), срезка через бухту.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BARREL_R,
  MV_SLIDE,
  MV_SPIN,
  MV_SWING,
  NO_DECK,
  deckAt,
  makeCap,
  moverCap,
  padAt,
  slickAt,
  slideU,
  spinAngle,
  swingU,
  type HazardSpec,
  type Mover,
} from '../shared/hazards.ts';
import {
  GHOST_TICKS,
  HIT_SLOW_TICKS,
  HIT_SPIN_TICKS,
  KART_R,
  PAD_TICKS,
  makeKartEvents,
  makeKartState,
  stepKart,
  type KartEvents,
  type KartState,
} from '../shared/kart.ts';
import { RING, buildRing } from '../shared/maps/ring.ts';
import { BTN_FORWARD, BTN_LEFT, makeInput } from '../shared/sim.ts';
import { buildTrack, locateAny, makeLoc, type Track } from '../shared/track.ts';

const { track: tr } = buildRing();
const hz = tr.hz;
const inp = makeInput();
const ev = makeKartEvents();
const loc = makeLoc();

/** Трасса кольца только с этими помехами: физику каждой проверяем отдельно от раскладки */
function mini(spec: HazardSpec): Track {
  return buildTrack({ ...RING, hazards: spec });
}

/** Карт на ноге leg трассы t: курс по ноге, скорость v, время гонки rt; КТ — последняя перед ним */
function kartAt(t: Track, leg: number, at: number, lat: number, v: number, rt = 0): KartState {
  const g = t.legs[leg];
  const k = makeKartState();
  k.x = g.x + g.dx * at - g.dz * lat;
  k.z = g.z + g.dz * at + g.dx * lat;
  k.hx = g.dx;
  k.hz = g.dz;
  k.vx = g.dx * v;
  k.vz = g.dz * v;
  k.seg = locateAny(t, k.x, k.z, loc).seg;
  let cp = 0;
  while (cp + 1 < t.cpSeg.length && t.cpSeg[cp + 1] <= k.seg) cp++;
  k.cp = cp;
  k.lap = 1;
  k.rt = rt;
  return k;
}

function step(t: Track, k: KartState, buttons = BTN_FORWARD): KartEvents {
  inp.buttons = buttons;
  stepKart(k, inp, t, ev, true);
  return ev;
}

const speed = (k: KartState): number => k.vx * k.hx + k.vz * k.hz;
const side = (k: KartState): number => k.vx * -k.hz + k.vz * k.hx;

/** Расстояние от точки до отрезка */
function toSeg(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const ex = bx - ax;
  const ez = bz - az;
  const l2 = ex * ex + ez * ez;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)) : 0;
  return Math.hypot(x - ax - ex * t, z - az - ez * t);
}

// ------------------------------------------------------------ раскладка

test('раскладка: 5 ускорителей, 5 луж, 15 бочек и 3 блока, 2 настила, 4 движущиеся помехи', () => {
  assert.deepEqual([hz.pads.length, hz.slicks.length, hz.solids.length, hz.decks.length, hz.movers.length], [5, 5, 18, 2, 4]);
  assert.equal(hz.solids.filter((s) => s.kind === 0).length, 15);
  assert.deepEqual(hz.movers.map((m) => m.kind), [MV_SLIDE, MV_SWING, MV_SPIN, MV_SLIDE]);
  assert.equal(hz.slicks.filter((s) => s.kind === 1).length, 3, 'масло');
  assert.equal(hz.slicks.filter((s) => s.kind === 0).length, 2, 'вода');
});

test('раскладка: ускорители, лужи, бочки и блоки лежат на дороге (ускоритель срезки — на настиле), не на провале', () => {
  for (const p of hz.pads) {
    if (deckAt(hz, p.x, p.z) !== NO_DECK) continue;
    const l = locateAny(tr, p.x, p.z, loc);
    assert.equal(tr.gap[l.seg], 0, `ускоритель ${p.x},${p.z} над провалом`);
    assert.ok(Math.abs(l.lat) + p.hw <= l.hw, `ускоритель ${p.x},${p.z} выходит за край дороги`);
  }
  assert.equal(hz.pads.filter((p) => deckAt(hz, p.x, p.z) !== NO_DECK).length, 1, 'на настиле ровно один ускоритель');
  for (const s of hz.slicks) {
    const l = locateAny(tr, s.x, s.z, loc);
    assert.equal(tr.gap[l.seg], 0, `лужа ${s.x},${s.z} над провалом`);
    assert.ok(Math.abs(l.lat) + s.rw <= l.hw + 0.2, `лужа ${s.x},${s.z} за краем дороги`);
  }
  for (const s of hz.solids) {
    for (const [x, z] of [
      [s.ax, s.az],
      [s.bx, s.bz],
    ]) {
      const l = locateAny(tr, x, z, loc);
      assert.equal(tr.gap[l.seg], 0, `помеха ${x},${z} над провалом`);
      // блок шиканы может упираться в стену
      assert.ok(Math.abs(l.lat) + s.r <= l.hw + 0.05, `помеха ${x},${z} вылезла за стену`);
    }
  }
});

test('раскладка: у решётки и у точек возврата на КТ нет бочек и блоков, движущиеся и лужи не достают до решётки', () => {
  for (const s of hz.solids) {
    for (const g of tr.grid) assert.ok(Math.hypot(s.cx - g.x, s.cz - g.z) > 8, `помеха ${s.cx},${s.cz} у решётки`);
    // возвращённый карт (R или вода) стоит на КТ: рядом с ним не должно быть бочки или блока
    for (const c of tr.cpSeg) assert.ok(Math.hypot(s.cx - tr.px[c], s.cz - tr.pz[c]) > KART_R + BARREL_R + 1.5, `помеха ${s.cx},${s.cz} у КТ`);
  }
  for (const m of hz.movers) {
    for (const g of tr.grid) assert.ok(Math.hypot(m.cx - g.x, m.cz - g.z) - Math.sqrt(m.reach2) > 3, `движущаяся помеха ${m.cx},${m.cz} у решётки`);
  }
  for (const g of tr.grid) {
    assert.equal(padAt(hz, g.x, g.z), null, 'решётка на ускорителе');
    assert.equal(slickAt(hz, g.x, g.z), null, 'решётка в луже');
  }
});

// ------------------------------------------------------------ движущиеся помехи

test('движущиеся помехи — функция времени гонки: через период бит в бит, порядок вызовов не важен', () => {
  const a = makeCap();
  const b = makeCap();
  const c = makeCap();
  for (const m of hz.movers) {
    for (const rt of [1, 2, 37, 100, 211, 333, 999, 12345, 65535]) {
      moverCap(m, rt, a);
      const first = { ...a };
      moverCap(m, rt + 7 * m.period, b);
      assert.deepEqual({ ...b }, first, `мувер ${m.kind}: rt ${rt} и через 7 периодов`);
      moverCap(m, rt + 1, c);
      moverCap(m, rt, c);
      assert.deepEqual({ ...c }, first, `мувер ${m.kind}: rt ${rt} после другого вызова`);
    }
  }
});

test('контейнер на рельсах стоит у края dwell тиков и едет плавно туда и обратно; груз качается; шлагбаум вращается', () => {
  for (const m of hz.movers.filter((q) => q.kind === MV_SLIDE)) {
    const D = m.dwell;
    const M = m.period / 2 - D;
    /** rt, при котором фаза цикла равна t */
    const rt = (t: number): number => t - m.phase + m.period * 4;
    assert.equal(slideU(m, rt(0)), 0);
    assert.equal(slideU(m, rt(D - 1)), 0, 'стоит у А');
    assert.equal(slideU(m, rt(D + M)), 1);
    assert.equal(slideU(m, rt(2 * D + M - 1)), 1, 'стоит у Б');
    let prev = 0;
    for (let t = D; t <= D + M; t++) {
      const u = slideU(m, rt(t));
      assert.ok(u >= prev - 1e-12 && u - prev < 4 / M, `ход вперёд: u ${u} после ${prev}`);
      prev = u;
    }
    assert.equal(slideU(m, rt(m.period)), 0, 'цикл замкнут');
    const cap = makeCap();
    for (let t = 0; t < m.period; t++) {
      moverCap(m, rt(t) + 1, cap);
      assert.ok(Math.hypot(cap.vx, cap.vz) < 9, `контейнер едет быстрее 9 м/с: ${Math.hypot(cap.vx, cap.vz)}`);
    }
  }
  const swing = hz.movers.find((m) => m.kind === MV_SWING)!;
  assert.ok(Math.abs(swingU(swing, swing.period / 4 - swing.phase) - 1) < 1e-9, 'крайняя точка');
  assert.ok(Math.abs(swingU(swing, (3 * swing.period) / 4 - swing.phase) + 1) < 1e-9, 'другая крайняя точка');
  assert.ok(Math.abs(swingU(swing, -swing.phase)) < 1e-9, 'центр');
  const spin = hz.movers.find((m) => m.kind === MV_SPIN)!;
  const turn = spinAngle(spin, spin.period - 1 - spin.phase + spin.period) - spinAngle(spin, -spin.phase + spin.period);
  assert.ok(Math.abs(turn) > Math.PI * 1.9 && Math.abs(turn) < Math.PI * 2, `оборот за период: ${turn}`);
});

/** Поперёк дороги через центр мувера в момент rt: самый широкий проём подряд, м */
function freeWidth(m: Mover, rt: number): number {
  const cap = moverCap(m, rt, makeCap());
  const l = locateAny(tr, m.cx, m.cz, loc);
  const seg = l.seg;
  const rx = -tr.tz[seg];
  const rz = tr.tx[seg];
  let best = 0;
  let run = 0;
  for (let lat = -l.hw; lat <= l.hw; lat += 0.05) {
    const busy = toSeg(tr.px[seg] + rx * lat, tr.pz[seg] + rz * lat, cap.ax, cap.az, cap.bx, cap.bz) < cap.r;
    if (busy) run = 0;
    else {
      run += 0.05;
      if (run > best) best = run;
    }
  }
  return best;
}

test('на дороге всегда есть проезд: у контейнера, груза и шлагбаума свободно не меньше 2,3 м', () => {
  for (const m of hz.movers) {
    let worst = Infinity;
    for (let t = 1; t <= m.period; t += 3) worst = Math.min(worst, freeWidth(m, t));
    assert.ok(worst >= 2.3, `мувер ${m.kind} у (${m.cx.toFixed(0)}, ${m.cz.toFixed(0)}): проём ${worst.toFixed(2)} м`);
  }
});

test('контейнер у края рельсов — вне дороги: во дворе он не мешает проезду', () => {
  for (const m of hz.movers.filter((q) => q.kind === MV_SLIDE)) {
    const rt = m.period - m.phase + 1;
    assert.equal(slideU(m, rt), 0, 'во дворе');
    const cap = moverCap(m, rt, makeCap());
    for (let i = Math.max(0, m.seg - 8); i < Math.min(tr.n, m.seg + 8); i++) {
      const d = toSeg(tr.px[i], tr.pz[i], cap.ax, cap.az, cap.bx, cap.bz) - cap.r;
      assert.ok(d >= tr.hw[i] - 0.05, `контейнер во дворе влезает на дорогу у точки ${i}: ${d.toFixed(2)} м при полуширине ${tr.hw[i]}`);
    }
  }
});

/** Едем прямо по ноге через мувер с lat и временем гонки rt0 на старте за 40 м до него: что было */
function passMover(m: Mover, rt0: number, lat: number): { hit: boolean; spun: boolean; slowed: boolean } {
  const l = locateAny(tr, m.cx, m.cz, loc);
  const leg = tr.leg[l.seg];
  const g = tr.legs[leg];
  const along = (m.cx - g.x) * g.dx + (m.cz - g.z) * g.dz;
  const k = kartAt(tr, leg, along - 40, lat, 22, rt0);
  let hit = false;
  let spun = false;
  let slowed = false;
  for (let i = 0; i < 160; i++) {
    const e = step(tr, k);
    if (e.hit > 0 && e.hitKind === 2) hit = true;
    if (k.spinT > 0) spun = true;
    if (k.slowT > 0) slowed = true;
  }
  return { hit, spun, slowed };
}

test('контейнер на рельсах: выехавший на дорогу — удар, закрутка и медленный ход; во дворе — проезд свободен', () => {
  const m = hz.movers[0];
  const D = m.dwell;
  const M = m.period / 2 - D;
  // карт подъезжает за ~1,8 с (108 тиков): подбираем rt0 так, чтобы к этому моменту контейнер стоял на дороге (u = 1) или во дворе
  const out = D + M + 20 - 108;
  const inn = m.period - 15 - 108;
  const hitOut = passMover(m, out, 0);
  assert.ok(hitOut.hit && hitOut.spun && hitOut.slowed, `выехавший контейнер: ${JSON.stringify(hitOut)}`);
  const hitIn = passMover(m, inn, 0);
  assert.ok(!hitIn.hit && !hitIn.spun, `контейнер во дворе: ${JSON.stringify(hitIn)}`);
  // удар даёт HIT_SPIN_TICKS закрутки и HIT_SLOW_TICKS медленного хода
  const l = locateAny(tr, m.cx, m.cz, loc);
  const g = tr.legs[tr.leg[l.seg]];
  const along = (m.cx - g.x) * g.dx + (m.cz - g.z) * g.dz;
  const k = kartAt(tr, tr.leg[l.seg], along - 8, 0, 20, out + 85);
  for (let i = 0; i < 40 && k.spinT === 0; i++) step(tr, k);
  assert.equal(k.spinT, HIT_SPIN_TICKS);
  assert.equal(k.slowT, HIT_SLOW_TICKS);
});

test('подвижные помехи бьют не всегда и не никогда: в одних фазах проезд свободен, в других — удар', () => {
  for (const m of hz.movers) {
    const l = locateAny(tr, m.cx, m.cz, loc);
    const lat = m.kind === MV_SPIN ? -0.3 : 0;
    let hits = 0;
    let total = 0;
    for (let rt0 = 0; rt0 < m.period; rt0 += Math.max(2, Math.round(m.period / 45))) {
      const a = passMover(m, rt0, lat);
      const b = passMover(m, rt0, lat);
      assert.deepEqual(a, b, `мувер ${m.kind}, rt0 ${rt0}: два прогона разные`);
      total++;
      if (a.hit) hits++;
    }
    const share = hits / total;
    assert.ok(share > 0.08 && share < 0.7, `мувер ${m.kind} у отрезка ${l.seg}: удар в ${(share * 100).toFixed(0)}% фаз`);
  }
});

// ------------------------------------------------------------ ускорители, лужи, бочки и блоки

test('ускоритель: наезд — событие dash и турбо на 50 тиков, разгон за обычный потолок; стоять на нём — одно событие', () => {
  const t = mini({ pads: [{ leg: 0, at: 100, len: 7, w: 4 }] });
  const pad = t.hz.pads[0];
  const k = kartAt(t, 0, 92, 0, 12);
  let dash = -1;
  for (let i = 0; i < 80 && dash < 0; i++) if (step(t, k).dash) dash = i;
  assert.ok(dash > 10 && dash < 40, `наехал на тике ${dash}`);
  assert.equal(k.boostT, PAD_TICKS);
  assert.equal(k.boostLvl, 3);
  assert.ok(Math.hypot(k.x - pad.x, k.z - pad.z) < 4.5);
  let top = 0;
  for (let i = 0; i < 60; i++) {
    assert.equal(step(t, k).dash, false, 'повторное событие на том же ускорителе');
    top = Math.max(top, speed(k));
  }
  assert.ok(top > 26 && top < 30.0001, `разгон до ${top}`);
  for (let i = 0; i < 120; i++) step(t, k);
  assert.equal(k.boostT, 0);
  assert.ok(speed(k) <= 22.0001 && speed(k) > 20, `после турбо скорость ${speed(k)}`);
  // стоит на пластине без газа — одно событие, дальше сам разгоняется
  const s = kartAt(t, 0, 100, 0, 0);
  let n = 0;
  for (let i = 0; i < 30; i++) if (step(t, s, 0).dash) n++;
  assert.equal(n, 1);
  assert.ok(speed(s) > 10, `без газа разгоняется на пластине: ${speed(s)}`);
  // мимо пластины — ничего
  const away = kartAt(t, 0, 80, 5, 12);
  for (let i = 0; i < 60; i++) assert.equal(step(t, away).dash, false);
  assert.ok(speed(away) <= 22.0001, 'без ускорителя потолок прежний');
});

test('лужи: вода — боковая скорость гаснет медленнее (0,09), масло — почти не гаснет (0,02); событие slick 1 и 2', () => {
  const t = mini({
    slicks: [
      { leg: 0, at: 60, lat: 0, kind: 'oil', rl: 4.5, rw: 3 },
      { leg: 0, at: 160, lat: 0, kind: 'water', rl: 4.5, rw: 3 },
    ],
  });
  /** Боковая скорость после 10 тиков, начав с 5 м/с вбок: в центре лужи или (контроль) на чистом асфальте */
  const lateral = (at: number): { v: number; code: number } => {
    const k = kartAt(t, 0, at, 0, 14);
    k.vz += 5;
    let code = 0;
    for (let i = 0; i < 10; i++) code = Math.max(code, step(t, k).slick);
    return { v: Math.abs(side(k)), code };
  };
  const asphalt = lateral(110);
  const oil = lateral(60);
  const water = lateral(160);
  assert.equal(asphalt.code, 0);
  assert.equal(oil.code, 2, 'масло');
  assert.equal(water.code, 1, 'вода');
  assert.ok(Math.abs(asphalt.v / 5 - 0.75 ** 10) < 0.02, `асфальт: осталось ${asphalt.v / 5}`);
  assert.ok(Math.abs(water.v / 5 - 0.91 ** 10) < 0.04, `вода: осталось ${water.v / 5}`);
  assert.ok(Math.abs(oil.v / 5 - 0.98 ** 10) < 0.04, `масло: осталось ${oil.v / 5}`);
  assert.ok(asphalt.v < water.v && water.v < oil.v);
  // на масле руль почти не поворачивает скорость: за 1 с с рулём влево карт всё ещё едет почти прямо
  const k = kartAt(t, 0, 57, 0, 14);
  const z0 = k.z;
  for (let i = 0; i < 20; i++) step(t, k, BTN_FORWARD | BTN_LEFT);
  assert.ok(Math.abs(k.z - z0) < 2, `снос на масле ${Math.abs(k.z - z0)}`);
});

test('бочка и бетонный блок: сквозь не проехать, скорость падает, событие hit (hitKind 0 и 1), не закручивают; призрак проезжает', () => {
  const t = mini({
    barrels: [{ leg: 0, at: 100, lat: 0 }],
    blocks: [{ leg: 0, at: 200, lat: 0, len: 5, wid: 1.1, yaw: Math.PI / 2 }],
  });
  const barrel = t.hz.solids[0];
  const k = kartAt(t, 0, 88, 0, 20);
  const before = speed(k);
  let hit = 0;
  let minD = Infinity;
  for (let i = 0; i < 40; i++) {
    const e = step(t, k);
    if (e.hit > hit) hit = e.hit;
    if (e.hit > 0) assert.equal(e.hitKind, 0);
    minD = Math.min(minD, Math.hypot(k.x - barrel.ax, k.z - barrel.az));
  }
  assert.ok(hit > 5, `удар о бочку ${hit}`);
  assert.ok(minD >= KART_R + BARREL_R - 1e-6, `влез в бочку: ${minD}`);
  assert.equal(k.spinT, 0, 'бочка не закручивает');
  assert.ok(speed(k) < before - 3, `скорость после бочки ${speed(k)}`);

  const blk = t.hz.solids[1];
  assert.equal(blk.kind, 1);
  const b = kartAt(t, 0, 188, 0, 18);
  let bh = 0;
  for (let i = 0; i < 40; i++) {
    const e = step(t, b);
    if (e.hit > bh) bh = e.hit;
    if (e.hit > 0) assert.equal(e.hitKind, 1);
    assert.ok(toSeg(b.x, b.z, blk.ax, blk.az, blk.bx, blk.bz) >= KART_R + blk.r - 1e-6, 'влез в блок');
  }
  assert.ok(bh > 5, `удар о блок ${bh}`);
  assert.equal(b.spinT, 0);

  // призрак (после возврата на КТ, когда уже едет): тот же наезд на бочку — насквозь, без ударов
  const gh = kartAt(t, 0, 88, 0, 20);
  gh.ghostT = GHOST_TICKS - 40;
  for (let i = 0; i < 40; i++) assert.equal(step(t, gh).hit, 0);
  assert.ok(gh.x > barrel.ax, 'призрак проехал бочку');
});

test('настил: высота по склону; на нём карт едет над водой и взлетает с края', () => {
  // настил после конца ноги 0 не бывает, поэтому ставим его на дорогу: подъём 0 → 1,5 м на 10 м, дальше дорога
  const t = mini({ decks: [{ leg: 0, at: 100, len: 10, w: 8, y0: 0, y1: 1.5 }] });
  const g = t.legs[0];
  assert.equal(deckAt(t.hz, g.x + 95, g.z), 0);
  assert.ok(Math.abs(deckAt(t.hz, g.x + 100, g.z) - 0.75) < 1e-9, 'середина настила');
  assert.equal(deckAt(t.hz, g.x + 105.5, g.z), NO_DECK);
  assert.equal(deckAt(t.hz, g.x + 100, g.z + 4.5), NO_DECK);
  const k = kartAt(t, 0, 85, 0, 20);
  let maxY = 0;
  for (let i = 0; i < 60; i++) {
    step(t, k);
    maxY = Math.max(maxY, k.y);
  }
  assert.ok(maxY > 1.4, `взлетел на ${maxY}`);
});

// ------------------------------------------------------------ срезка через бухту

test('срезка через бухту: прямо по настилу — ускоритель, прыжок, посадка на дорогу и КТ 5–7 по порядку; мимо ускорителя — вода', () => {
  const pad = hz.pads[3];
  assert.ok(deckAt(hz, pad.x, pad.z) !== NO_DECK, 'ускоритель срезки на настиле');
  // настил: сначала ровный, потом подъём на 2 м
  assert.equal(deckAt(hz, 100, -62), 0);
  assert.equal(deckAt(hz, 90, -62), 0);
  assert.ok(Math.abs(deckAt(hz, 76.1, -62) - 2) < 0.05, 'край настила на 2 м');
  assert.equal(deckAt(hz, 75.9, -62), NO_DECK, 'за краем — пусто');
  assert.equal(deckAt(hz, 100, -62 - 5.5), NO_DECK, 'сбоку от настила — пусто');

  const k = kartAt(tr, 2, 0, 0, 16);
  k.cp = 4;
  const cps: number[] = [];
  let dash = 0;
  let splash = false;
  let landed = false;
  let t = 0;
  for (; t < 400 && !splash && k.cp < 7; t++) {
    const e = step(tr, k);
    if (e.dash) dash++;
    if (e.splash) splash = true;
    if (e.land > 0.5) landed = true;
    if (e.cp) cps.push(k.cp);
    if (!landed && !splash) assert.equal(k.cp, 4, 'до приземления КТ срезки не засчитываются');
  }
  assert.ok(!splash, 'упал в бухту');
  assert.equal(dash, 1, 'ускоритель на настиле');
  assert.deepEqual(cps, [5, 6, 7]);
  assert.ok(landed);
  // срезка короче: по дороге от начала ноги 2 до КТ 7 — около 200 м, это дольше 9 с на полной скорости
  const leg2 = tr.leg.findIndex((l) => l === 2);
  const via = tr.s[tr.cpSeg[7]] - tr.s[leg2];
  assert.ok(via > 190, `по дороге до КТ 7 ${via} м`);
  assert.ok(t < ((via / 22) * 60) / 2, `по настилу КТ 7 за ${t} тиков, по дороге не быстрее ${Math.round((via / 22) * 60)}`);

  // тот же заезд, но правее ускорителя: недолёт, вода, возврат на КТ перед срезкой — а не на КТ 6 за бухтой
  const w = kartAt(tr, 2, 0, 3, 22);
  w.cp = 4;
  let fell = false;
  for (let i = 0; i < 400 && !fell; i++) fell = step(tr, w).splash;
  assert.ok(fell, 'правее ускорителя — упал в воду');
  assert.equal(w.cp, 4);
  assert.equal(w.seg, tr.cpSeg[4]);
});
