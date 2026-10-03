// Физика карта: разгон, детерминизм, руль, стены, трамплины, причал, круги, задний ход, турбо, подскок и занос, возврат на КТ.
// Физика — на трассе без помех (RING без hazards), чтобы бочка или ускоритель не мешали измерять карт; помехи — в hazards.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOOST_TURBO,
  FREEZE_TICKS,
  GHOST_TICKS,
  ITEM_TURBO,
  KART_R,
  RT_MAX,
  TURBO_TICKS,
  copyKart,
  kartsEqual,
  makeKartEvents,
  makeKartState,
  placeOnGrid,
  stepKart,
  type KartEvents,
  type KartState,
} from '../shared/kart.ts';
import { RING, buildRing } from '../shared/maps/ring.ts';
import { makeRng } from '../shared/math.ts';
import { BTN_BACK, BTN_FIRE, BTN_FORWARD, BTN_JUMP, BTN_LEFT, BTN_RELOAD, BTN_RIGHT, BTN_USE, makeInput } from '../shared/sim.ts';
import { buildTrack, locate, locateAny, makeLoc, progress, wrapSeg, type Track } from '../shared/track.ts';

const tr = buildTrack({ ...RING, hazards: undefined });
/** Последняя КТ — перед линией старта */
const LAST = tr.cpSeg.length - 1;
const inp = makeInput();
const ev = makeKartEvents();
const loc = makeLoc();

function step(k: KartState, buttons: number, canDrive = true, track: Track = tr): KartEvents {
  inp.buttons = buttons;
  stepKart(k, inp, track, ev, canDrive);
  return ev;
}

const speed = (k: KartState): number => k.vx * k.hx + k.vz * k.hz;

/** Карт у точки seg (lat — вправо от осевой, м), курс по дороге и ещё на ang рад вправо, скорость v вперёд */
function placeAt(seg: number, v: number, cp: number, lat = 0, ang = 0): KartState {
  const k = makeKartState();
  const rx = -tr.tz[seg];
  const rz = tr.tx[seg];
  k.x = tr.px[seg] + rx * lat;
  k.z = tr.pz[seg] + rz * lat;
  k.y = tr.h[seg];
  k.hx = tr.tx[seg] * Math.cos(ang) + rx * Math.sin(ang);
  k.hz = tr.tz[seg] * Math.cos(ang) + rz * Math.sin(ang);
  k.vx = k.hx * v;
  k.vz = k.hz * v;
  k.seg = seg;
  k.cp = cp;
  k.lap = 1;
  return k;
}

const segAt = (x: number, z: number): number => locateAny(tr, x, z, loc).seg;

/** Простой автопилот: цель на осевой в 8 м впереди, скорость — по кривизне ближайших 30 м. */
function autopilot(k: KartState): number {
  locate(tr, k.x, k.z, k.seg, loc);
  let j = loc.seg;
  let rem = 8 + loc.t * tr.len[j];
  while (rem > tr.len[j]) {
    rem -= tr.len[j];
    j = wrapSeg(tr, j + 1);
  }
  const dx = tr.px[j] + tr.tx[j] * rem - k.x;
  const dz = tr.pz[j] + tr.tz[j] * rem - k.z;
  const side = dx * k.hz - dz * k.hx;
  const dist = Math.hypot(dx, dz);
  let b = side > 0.04 * dist ? BTN_LEFT : side < -0.04 * dist ? BTN_RIGHT : 0;
  let c = 0;
  for (let m = 0, i = loc.seg; m < 30; m += tr.len[i], i = wrapSeg(tr, i + 1)) c = Math.max(c, Math.abs(tr.curv[i]));
  let vmax = 22;
  while (vmax > 4 && vmax * c > 0.85 * 2.3 * (0.5 + 0.5 * Math.min(1, vmax / 5)) * (1 - 0.36 * Math.min(1, vmax / 22))) vmax -= 0.25;
  const v = speed(k);
  if (v > vmax + 1) b |= BTN_BACK;
  else if (v < vmax) b |= BTN_FORWARD;
  return b;
}

test('газ по прямой: за 4 с — от 20 до 22 м/с, по ровной дороге', () => {
  const k = makeKartState();
  placeOnGrid(k, tr, 0);
  for (let i = 0; i < 240; i++) step(k, BTN_FORWARD);
  assert.ok(speed(k) >= 20 && speed(k) <= 22, `скорость ${speed(k)}`);
  assert.equal(k.y, 0);
  assert.equal(k.grounded, 1);
  assert.ok(Math.abs(k.z - tr.grid[0].z) < 1e-9, 'ехал прямо');
});

test('детерминизм: два прогона (на трассе с помехами) совпадают, копия на середине продолжается так же', () => {
  const full = buildRing().track;
  const rng = makeRng(7);
  const combos = [
    BTN_FORWARD,
    BTN_FORWARD | BTN_LEFT,
    BTN_FORWARD | BTN_RIGHT,
    BTN_FORWARD | BTN_LEFT | BTN_JUMP,
    BTN_FORWARD | BTN_RIGHT | BTN_JUMP,
    BTN_BACK,
    BTN_BACK | BTN_LEFT,
    BTN_FORWARD | BTN_USE,
    BTN_RELOAD,
    0,
  ];
  const tape: number[] = [];
  while (tape.length < 3000) {
    const b = combos[Math.floor(rng() * combos.length)];
    for (let n = 10 + Math.floor(rng() * 50); n > 0; n--) tape.push(b);
  }
  const run = (from: KartState, a: number, z: number): KartState => {
    for (let i = a; i < z; i++) {
      if (i === 900) from.item = ITEM_TURBO;
      step(from, tape[i], true, full);
      for (const v of Object.values(from)) assert.ok(Number.isFinite(v), `тик ${i}`);
    }
    return from;
  };
  const a = makeKartState();
  placeOnGrid(a, full, 2);
  const b = copyKart(makeKartState(), a);
  run(a, 0, 3000);
  run(b, 0, 1500);
  const c = copyKart(makeKartState(), b);
  run(b, 1500, 3000);
  run(c, 1500, 3000);
  assert.ok(kartsEqual(a, b));
  assert.ok(kartsEqual(a, c));
});

test('стены держат: газ и руль вправо 10 с — карт не выходит за край, где есть стена', () => {
  const k = makeKartState();
  placeOnGrid(k, tr, 1);
  let hits = 0;
  for (let i = 0; i < 600; i++) {
    if (step(k, BTN_FORWARD | BTN_RIGHT).wall > 0) hits++;
    locate(tr, k.x, k.z, k.seg, loc);
    const lim = loc.hw - KART_R;
    if (Math.abs(loc.lat) > loc.hw + 1) continue;
    if (!tr.openR[loc.seg]) assert.ok(loc.lat <= lim + 1e-9, `тик ${i}: lat ${loc.lat}`);
    if (!tr.openL[loc.seg]) assert.ok(loc.lat >= -lim - 1e-9, `тик ${i}: lat ${loc.lat}`);
  }
  assert.ok(hits > 10, `ударов о стену ${hits}`);
});

test('руль: на полной скорости радиус 20–26 м (без заноса крутой поворот не взять), в заносе — круче; стоя — разворачивается, задним ходом — наоборот', () => {
  const k = placeAt(wrapSeg(tr, tr.cpSeg[0] + 5), 22, 0, -4);
  k.steer = 1;
  const h0 = [k.hx, k.hz];
  for (let i = 0; i < 12; i++) step(k, BTN_FORWARD | BTN_LEFT);
  const turned = Math.acos(h0[0] * k.hx + h0[1] * k.hz);
  const r = Math.hypot(k.vx, k.vz) / (turned / 0.2);
  assert.ok(r > 20 && r < 26, `радиус ${r.toFixed(1)} м`);
  // занос влево на той же скорости: нос поворачивает заметно быстрее
  const d = placeAt(wrapSeg(tr, tr.cpSeg[0] + 5), 20, 0, -4);
  d.steer = 1;
  d.drift = 1;
  const d0 = [d.hx, d.hz];
  for (let i = 0; i < 12; i++) step(d, BTN_FORWARD | BTN_LEFT | BTN_JUMP);
  const dTurned = Math.acos(d0[0] * d.hx + d0[1] * d.hz);
  assert.equal(d.drift, 1);
  assert.ok(dTurned > turned * 1.3, `в заносе ${dTurned.toFixed(3)} рад против ${turned.toFixed(3)}`);

  const s = placeAt(wrapSeg(tr, tr.cpSeg[0] + 5), 0, 0);
  s.steer = 1;
  const s0 = [s.hx, s.hz];
  for (let i = 0; i < 60; i++) step(s, BTN_LEFT);
  assert.ok(Math.acos(s0[0] * s.hx + s0[1] * s.hz) > 0.7, 'стоя за 1 с — меньше 40°');
  assert.ok(s0[0] * s.hz - s0[1] * s.hx < 0, 'стоя и руль влево — нос влево');
  assert.equal(speed(s), 0, 'на месте и стоит');

  const b = placeAt(wrapSeg(tr, tr.cpSeg[0] + 5), -5, 0);
  b.steer = 1;
  const b0 = [b.hx, b.hz];
  for (let i = 0; i < 20; i++) step(b, BTN_BACK | BTN_LEFT);
  assert.ok(b0[0] * b.hz - b0[1] * b.hx > 0.05, 'задним ходом руль влево — нос вправо');
});

test('стена: удар под 30–90° на газу без руля — через 1,2 с едет вдоль дороги, не стоит', () => {
  for (const deg of [30, 50, 75, 90]) {
    for (const v of [22, 10]) {
      const k = placeAt(wrapSeg(tr, tr.cpSeg[0] + 25), v, 0, 0, (deg * Math.PI) / 180);
      let hit = -1;
      let still = 0;
      let ok = -1;
      for (let i = 0; i < 150 && ok < 0; i++) {
        if (step(k, BTN_FORWARD).wall > 0 && hit < 0) hit = i;
        still = Math.hypot(k.vx, k.vz) < 1 ? still + 1 : 0;
        assert.ok(still < 30, `${deg}° ${v} м/с: стоит на тике ${i}`);
        const along = k.vx * tr.tx[k.seg] + k.vz * tr.tz[k.seg];
        if (hit >= 0 && along > 5 && k.hx * tr.tx[k.seg] + k.hz * tr.tz[k.seg] > 0.95) ok = i;
      }
      assert.ok(hit >= 0, `${deg}°: не доехал до стены`);
      assert.ok(ok >= 0 && ok - hit <= 72, `${deg}° ${v} м/с: вдоль дороги через ${ok < 0 ? '—' : ok - hit} тиков`);
    }
  }
});

test('стена: стоит носом в стену — на газу без руля через 1 с едет вдоль, вдоль стены — медленнее, чем по дороге', () => {
  const wallSeg = wrapSeg(tr, tr.cpSeg[0] + 25);
  const k = placeAt(wallSeg, 0, 0, tr.hw[wallSeg] - KART_R, Math.PI / 2);
  for (let i = 0; i < 60; i++) step(k, BTN_FORWARD);
  assert.ok(k.vx * tr.tx[k.seg] + k.vz * tr.tz[k.seg] > 5, `скорость вдоль ${speed(k).toFixed(1)}`);

  // жмёт руль в стену на прямой: трётся и едет, но медленнее
  const w = placeAt(wrapSeg(tr, tr.cpSeg[0] + 3), 22, 0, tr.hw[wrapSeg(tr, tr.cpSeg[0] + 3)] - KART_R);
  const free = placeAt(wrapSeg(tr, tr.cpSeg[0] + 3), 22, 0, 0);
  let rubs = 0;
  for (let i = 0; i < 60; i++) {
    if (step(w, BTN_FORWARD | BTN_RIGHT).wall > 0) rubs++;
    step(free, BTN_FORWARD);
  }
  assert.ok(rubs > 20, `касаний ${rubs}`);
  assert.ok(speed(w) > 8 && speed(w) < speed(free) - 4, `по стене ${speed(w).toFixed(1)}, по дороге ${speed(free).toFixed(1)}`);
});

/** Начала провалов (каналов под трамплинами) по ходу гонки и последняя КТ перед каждым */
const jumps = ((): Array<{ seg: number; cp: number }> => {
  const out: Array<{ seg: number; cp: number }> = [];
  for (let i = 0; i < tr.n; i++) {
    if (!tr.gap[i] || tr.gap[wrapSeg(tr, i - 1)]) continue;
    let cp = 0;
    while (cp + 1 < tr.cpSeg.length && tr.cpSeg[cp + 1] <= i) cp++;
    out.push({ seg: i, cp });
  }
  return out;
})();

test('трамплины: на 22 м/с перелетают оба канала, на 11 м/с (варенье) падают и возвращаются на КТ перед ними', () => {
  assert.equal(jumps.length, 2);
  for (const { seg, cp } of jumps) {
    const fast = placeAt(seg - 8, 22, cp);
    let landed = 0;
    for (let i = 0; i < 240 && !landed; i++) {
      const e = step(fast, BTN_FORWARD);
      assert.ok(!e.splash, `упал в канал у отрезка ${seg}`);
      if (e.land > 0 && wrapSeg(tr, fast.seg - seg) < 60) landed = e.land;
    }
    assert.ok(landed > 0, `у отрезка ${seg} не приземлился`);
    assert.equal(fast.grounded, 1);
    assert.equal(fast.y, 0);
    assert.equal(fast.cp, cp);
    assert.ok(wrapSeg(tr, fast.seg - seg) >= 7, 'приземлился за каналом');

    const slow = placeAt(seg - 8, 11, cp);
    slow.slowT = 250;
    let fell = false;
    for (let i = 0; i < 300 && !fell; i++) fell = step(slow, BTN_FORWARD).splash;
    assert.ok(fell, `перелетел канал у отрезка ${seg} на 11 м/с`);
    assert.equal(slow.seg, tr.cpSeg[cp]);
    assert.equal(slow.x, tr.px[tr.cpSeg[cp]]);
    assert.equal(speed(slow), 0);
    assert.equal(slow.ghostT, GHOST_TICKS);
  }
});

test('трамплины требуют скорости: без газа на подлёте (16 м/с) карт падает в канал, с газом — нет', () => {
  for (const { seg, cp } of jumps) {
    const coast = placeAt(seg - 8, 16, cp);
    let fell = false;
    for (let i = 0; i < 300 && !fell; i++) fell = step(coast, 0).splash;
    assert.ok(fell, `на 16 м/с без газа перелетел канал у отрезка ${seg}`);
    assert.equal(coast.cp, cp);
  }
});

test('причал: руль вправо на причалах без стены — в воду и обратно на КТ', () => {
  const piers: number[] = [];
  for (let cp = 1; cp < tr.cpSeg.length; cp++) if (tr.openR[tr.cpSeg[cp] + 5]) piers.push(cp);
  assert.ok(piers.length >= 3, `КТ у причалов: ${piers}`);
  for (const cp of piers) {
    const k = placeAt(tr.cpSeg[cp] + 5, 15, cp);
    assert.equal(tr.openR[k.seg], 1, `КТ ${cp}: у причала`);
    let fell = false;
    for (let i = 0; i < 300 && !fell; i++) fell = step(k, BTN_FORWARD | BTN_RIGHT).splash;
    assert.ok(fell, `КТ ${cp}: не упал в воду`);
    assert.equal(k.seg, tr.cpSeg[cp]);
    assert.equal(k.cp, cp);
  }
});

test('три круга автопилотом: КТ по порядку, круг — на линии, финиш после третьего', () => {
  const k = makeKartState();
  placeOnGrid(k, tr, 0);
  const cps: number[] = [];
  const laps: number[] = [];
  let last = 0;
  let t = 0;
  for (; t < 60 * 60 * 3 && !k.done; t++) {
    const e = step(k, autopilot(k));
    assert.ok(!e.splash, `упал в воду на тике ${t}`);
    if (e.cp) cps.push(k.cp);
    if (e.lap) {
      laps.push((t - last) / 60);
      last = t;
    }
  }
  assert.equal(k.done, 1);
  assert.equal(k.lap, 4);
  const lapCps = [...Array.from({ length: tr.cpSeg.length - 1 }, (_, i) => i + 1), 0];
  assert.deepEqual(cps, [0, ...lapCps, ...lapCps, ...lapCps]);
  // круг ≈ 1100 м: без помех и ошибок осторожный автопилот (без заноса) едет его ~60 с
  for (const s of laps.slice(1)) assert.ok(s > 50 && s < 72, `круг ${s} с`);
  // после финиша катится и останавливается
  for (let i = 0; i < 300; i++) step(k, BTN_FORWARD | BTN_USE);
  assert.ok(Math.abs(speed(k)) < 1e-9);
});

test('задом через линию: круг не засчитывается дважды, прогресс убывает', () => {
  const k = makeKartState();
  placeOnGrid(k, tr, 0);
  let crossed = 0;
  for (let i = 0; i < 300 && !crossed; i++) if (step(k, BTN_FORWARD).lap) crossed = i;
  assert.ok(crossed > 0);
  assert.equal(k.lap, 1);
  for (let i = 0; i < 20; i++) step(k, BTN_FORWARD);
  const prog = (): number => {
    locate(tr, k.x, k.z, k.seg, loc);
    return progress(tr, k.lap, k.cp, loc.seg, loc.t);
  };
  for (let i = 0; i < 40; i++) step(k, BTN_BACK);
  let prev = prog();
  for (let i = 0; i < 400; i++) {
    assert.equal(step(k, BTN_BACK).lap, false);
    const p = prog();
    assert.ok(p <= prev + 1e-9, `прогресс вырос на тике ${i}`);
    prev = p;
  }
  const line = tr.px[0];
  assert.ok(k.x < line, 'не сдал назад за линию');
  assert.ok(prev < tr.length);
  for (let i = 0; i < 400; i++) assert.equal(step(k, BTN_FORWARD).lap, false);
  assert.ok(k.x > line);
  assert.equal(k.lap, 1);
  assert.ok(k.cp <= 1, 'КТ после линии идут по порядку: не дальше первой');
});

test('турбо: срабатывает по ЛКМ, пока крутится рулетка — нет', () => {
  const k = placeAt(segAt(-100, 112), 0, LAST);
  for (let i = 0; i < 150; i++) step(k, BTN_FORWARD);
  assert.ok(speed(k) > 20.5, `разогнался до ${speed(k)}`);
  k.item = ITEM_TURBO;
  k.itemT = 5;
  assert.equal(step(k, BTN_FORWARD | BTN_FIRE).used, 0);
  assert.equal(k.item, ITEM_TURBO);
  for (let i = 0; i < 10; i++) step(k, BTN_FORWARD);
  assert.equal(step(k, BTN_FORWARD | BTN_FIRE).used, ITEM_TURBO);
  assert.equal(k.item, 0);
  assert.equal(k.boostT, TURBO_TICKS);
  assert.equal(k.boostLvl, BOOST_TURBO);
  for (let i = 0; i < 30; i++) step(k, BTN_FORWARD);
  assert.ok(speed(k) > 25, `скорость под турбо ${speed(k)}`);
  for (let i = 0; i < 60; i++) step(k, BTN_FORWARD);
  assert.equal(k.boostLvl, 0);
});

/** Подскок с пробела и полёт до земли: buttons — что держит в воздухе. Возвращает тиков в воздухе. */
function hop(k: KartState, buttons: number): number {
  const e = step(k, buttons | BTN_JUMP);
  assert.ok(e.hop, 'нет подскока');
  assert.equal(k.grounded, 0);
  let t = 1;
  for (; t < 60 && !k.grounded; t++) step(k, buttons | BTN_JUMP);
  assert.equal(k.grounded, 1, 'не приземлился');
  return t;
}

test('подскок: пробел — подскок; приземлился с рулём — занос в его сторону, без руля — нет', () => {
  const k = placeAt(segAt(-100, 112), 15, LAST);
  const air = hop(k, BTN_FORWARD | BTN_RIGHT);
  assert.ok(air >= 10 && air <= 22, `в воздухе ${air} тиков`);
  assert.equal(k.drift, 0, 'занос в воздухе');
  for (let i = 0; i < 3 && k.drift === 0; i++) step(k, BTN_FORWARD | BTN_RIGHT | BTN_JUMP);
  assert.equal(k.drift, -1, 'занос вправо');

  // прямо: подскок без заноса; руль чуть позже (в окне) — занос; позже окна — уже нет
  const s = placeAt(segAt(-100, 112), 15, LAST);
  hop(s, BTN_FORWARD);
  for (let i = 0; i < 4; i++) step(s, BTN_FORWARD | BTN_JUMP);
  assert.equal(s.drift, 0);
  for (let i = 0; i < 6 && s.drift === 0; i++) step(s, BTN_FORWARD | BTN_LEFT | BTN_JUMP);
  assert.equal(s.drift, 1, 'руль в окне — занос');
  const late = placeAt(segAt(-100, 112), 15, LAST);
  hop(late, BTN_FORWARD);
  for (let i = 0; i < 20; i++) step(late, BTN_FORWARD | BTN_JUMP);
  for (let i = 0; i < 10; i++) step(late, BTN_FORWARD | BTN_LEFT | BTN_JUMP);
  assert.equal(late.drift, 0, 'занос после окна');

  // держал пробел с прошлого раза (не нажал заново) — ни подскока, ни заноса
  const held = placeAt(segAt(-100, 112), 15, LAST);
  held.prevButtons = BTN_JUMP;
  for (let i = 0; i < 10; i++) assert.equal(step(held, BTN_FORWARD | BTN_LEFT | BTN_JUMP).hop, false);
  assert.equal(held.drift, 0);
  // медленно — подскок есть, заноса нет
  const slow = placeAt(segAt(-100, 112), 5, LAST);
  hop(slow, BTN_FORWARD | BTN_LEFT);
  for (let i = 0; i < 6; i++) step(slow, BTN_FORWARD | BTN_LEFT | BTN_JUMP);
  assert.equal(slow.drift, 0, 'занос на 5 м/с');
});

test('занос: мини-турбо по времени, отпустил рано или без скорости — без турбо', () => {
  const mt = (driftT: number, v: number, buttons: number): KartState => {
    const m = placeAt(segAt(-100, 112), v, LAST);
    m.drift = 1;
    m.driftT = driftT;
    step(m, buttons);
    return m;
  };
  let m = mt(60, 15, BTN_FORWARD);
  assert.equal(ev.mt, 1);
  assert.equal(ev.drift, 2);
  assert.deepEqual([m.drift, m.boostT, m.boostLvl], [0, 36, 1]);
  m = mt(120, 15, BTN_FORWARD);
  assert.deepEqual([ev.mt, m.boostT, m.boostLvl], [2, 66, 2]);
  m = mt(150, 15, BTN_FORWARD);
  assert.deepEqual([ev.mt, m.boostT, m.boostLvl], [3, 96, 3]);
  m = mt(30, 15, BTN_FORWARD);
  assert.deepEqual([ev.mt, m.boostT], [0, 0]);
  m = mt(120, 5, BTN_FORWARD | BTN_JUMP);
  assert.deepEqual([ev.drift, ev.mt, m.drift], [2, 0, 0]);
});

test('R — назад на КТ: призрак, первые 30 тиков стоит; повторно, пока призрак, — нельзя', () => {
  const k = makeKartState();
  placeOnGrid(k, tr, 0);
  for (let i = 0; i < 200; i++) step(k, BTN_FORWARD);
  assert.equal(k.cp, 0);
  assert.ok(step(k, BTN_RELOAD).respawn);
  assert.equal(k.x, tr.px[0]);
  assert.equal(k.ghostT, GHOST_TICKS);
  for (let i = 1; i < FREEZE_TICKS; i++) {
    step(k, BTN_FORWARD | (i === 5 ? BTN_RELOAD : 0));
    assert.equal(k.x, tr.px[0], `тик ${i}`);
    assert.equal(ev.respawn, false);
  }
  step(k, BTN_FORWARD);
  assert.ok(k.x > tr.px[0]);
});

test('пока нельзя ехать: карт стоит, руль поворачивается', () => {
  const k = makeKartState();
  placeOnGrid(k, tr, 3);
  const { x, z } = k;
  for (let i = 0; i < 60; i++) step(k, BTN_FORWARD | BTN_LEFT | BTN_FIRE | BTN_RELOAD, false);
  assert.equal(k.x, x);
  assert.equal(k.z, z);
  assert.equal(speed(k), 0);
  assert.equal(k.steer, 1);
});

test('время гонки rt: идёт по тику, пока можно ехать; на решётке стоит, у RT_MAX упирается, возврат на КТ его не сбрасывает', () => {
  const k = makeKartState();
  placeOnGrid(k, tr, 0);
  for (let i = 0; i < 90; i++) step(k, BTN_FORWARD, false);
  assert.equal(k.rt, 0, 'на решётке время не идёт');
  for (let i = 0; i < 100; i++) step(k, BTN_FORWARD);
  assert.equal(k.rt, 100);
  assert.ok(step(k, BTN_RELOAD).respawn);
  assert.equal(k.rt, 101, 'возврат на КТ — тоже тик гонки');
  for (let i = 0; i < 60; i++) step(k, BTN_FORWARD);
  assert.equal(k.rt, 161);
  k.rt = RT_MAX - 2;
  for (let i = 0; i < 6; i++) step(k, BTN_FORWARD);
  assert.equal(k.rt, RT_MAX);
});
