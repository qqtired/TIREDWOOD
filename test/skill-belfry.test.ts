// «Выше облаков», правки по жалобам владельца: колокольня (первые ступени не осыпаются, собравшаяся ступень не вырастает
// вокруг тела, на углах не цепляет) и шары (мешки достают реже — безопасная полоса на корзине шире).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLAYER_HALF, PLAYER_HEIGHT } from '../shared/constants.ts';
import { SKILL_STEP_THICK, makeSkillMap, type SkillRect, type SkillSack } from '../shared/skillmap.ts';
import { SkillDynamics, makeSackPose, moverAt, sackAt, stepHeldBy } from '../shared/skillphysics.ts';
import { BTN_FORWARD, BTN_JUMP, copyState, makeEvents, makeInput, makeState, statesEqual } from '../shared/sim.ts';
import { CRUMBLE_PERIOD, CRUMBLE_SAFE_S, crumbleState } from '../shared/skilltraps.ts';
import { CollisionWorld } from '../shared/world.ts';

const H = PLAYER_HALF;
const PARKED = -1e6;

test('belfry: the first four steps never crumble, every other step still falls, none of them can be over a head on the terrace', () => {
  const map = makeSkillMap();
  const safe = map.steps.filter((st) => st.s < CRUMBLE_SAFE_S);
  assert.deepEqual(safe.map((st) => st.rect.y), [47.5, 48, 48.5, 49], 'the corner plate and three steps at the foot');
  for (let t = 0; t < CRUMBLE_PERIOD; t += 3) for (const st of safe) assert.equal(crumbleState(st.s, t), 0, `step y=${st.rect.y} at ${t}`);
  const rest = map.steps.filter((st) => st.s >= CRUMBLE_SAFE_S);
  assert.equal(rest.length, map.steps.length - 4);
  for (const st of rest) assert.equal(crumbleState(st.s, CRUMBLE_PERIOD - 2), -1, `step y=${st.rect.y} falls by the end of the cycle`);
  // тело желейки на террасе (+47) не достаёт до низа ни одной осыпающейся ступени: над головой они не вырастут
  for (const st of rest) assert.ok(st.rect.y - SKILL_STEP_THICK >= 47 + PLAYER_HEIGHT, `step y=${st.rect.y} is above the head`);
});

test('belfry: a step that forms around the jelly stays away until it leaves; standing on it or pressing its riser is not touched', () => {
  const map = makeSkillMap(), world = new CollisionWorld(map), dyn = new SkillDynamics(map, world);
  const st = map.steps[8]; // угловая площадка у верха первого марша (y 52), осыпается
  assert.ok(st.s >= CRUMBLE_SAFE_S && st.corner);
  const t0 = CRUMBLE_PERIOD * 5; // начало цикла: вся лестница только что собралась
  const cx = (st.rect.x0 + st.rect.x1) / 2, cz = (st.rect.z0 + st.rect.z1) / 2;
  const at = (x: number, y: number, z: number, t = t0 + 10) => {
    const s = Object.assign(makeState(), { x, y, z, grounded: 1 });
    dyn.before(s, { ...makeInput(), viewTick: t }, t - 1);
    return world.maxY[st.box];
  };
  assert.ok(crumbleState(st.s, t0 + 10) >= 0);
  assert.equal(at(cx, st.rect.y - 0.3, cz), PARKED, 'inside the plate: it is not there yet');
  assert.equal(at(cx, st.rect.y - 1.2, cz), PARKED, 'body at plate height from below: same');
  assert.equal(at(st.rect.x0 - 0.1, st.rect.y - 0.3, cz), PARKED, 'right next to the edge, body in the plate');
  assert.equal(at(cx, st.rect.y, cz), st.rect.y, 'standing on it: it holds');
  assert.equal(at(cx, st.rect.y + 1, cz), st.rect.y, 'above it: it holds');
  assert.equal(at(st.rect.x0 - H - 0.01, st.rect.y - 0.5, cz), st.rect.y, 'pressing the side face with the body (0,42 m from the edge): untouched');
  assert.equal(at(cx, st.rect.y - 0.3, st.rect.z1 + 0.6), st.rect.y, 'walked away: it appears');
  // выросла бы над самой головой в первую секунду — ждёт, потом появляется (над головой не мешает ходить)
  const under = st.rect.y - SKILL_STEP_THICK - PLAYER_HEIGHT - 0.2;
  assert.equal(stepHeldBy(st, cx, under, cz, t0 + 10), true);
  assert.equal(stepHeldBy(st, cx, under, cz, t0 + 100), false);
  // тот же вопрос задаёт картинка: ступень собрана — но рисуется призраком, пока она «не появилась» для игрока
  assert.equal(stepHeldBy(st, cx, st.rect.y, cz, t0 + 10), false);
});

/**
 * Ступени колокольни — ходьбой с любого места на ступени до следующей: к середине следующей и «вдоль стены» (бежим прямо,
 * центр в 0,43…0,62 м от стены колокольни: раньше именно здесь на угловую площадку не подняться — ступень следующего марша
 * перекрывала тело). Проверка настоящей физикой SkillDynamics.
 */
test('belfry: from any spot on a step — hugging the wall too — walking forward climbs to the next step (no snagging on corners)', () => {
  const map = makeSkillMap(), world = new CollisionWorld(map), dyn = new SkillDynamics(map, world), ev = makeEvents();
  const steps = map.steps;
  const wall: SkillRect = { x0: -4, x1: 4, z0: -4, z1: 4, y: 0 };
  const overlap = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }, tol = 1e-6): boolean =>
    x - H < r.x1 - tol && x + H > r.x0 + tol && z - H < r.z1 - tol && z + H > r.z0 + tol;
  let tried = 0, hugging = 0;
  const failed: string[] = [];
  for (let i = 0; i + 1 < steps.length; i++) {
    const a = steps[i].rect, b = steps[i + 1].rect;
    if (b.y - a.y > 0.6 || steps[i].corner) continue; // дыра — это прыжок; с угла — поворот, он ниже
    const acrossX = a.x1 - a.x0 > a.z1 - a.z0; // марш вдоль z (восток/запад): от стены — по x
    const runs: Array<{ sx: number; sz: number; tx: number; tz: number; wall: boolean }> = [];
    const cxb = (b.x0 + b.x1) / 2, czb = (b.z0 + b.z1) / 2;
    for (let u = 0; u <= 6; u++) for (let v = 0; v <= 6; v++) {
      runs.push({ sx: a.x0 - H + 0.1 + (a.x1 - a.x0 + 2 * H - 0.2) * (u / 6), sz: a.z0 - H + 0.1 + (a.z1 - a.z0 + 2 * H - 0.2) * (v / 6), tx: cxb, tz: czb, wall: false });
    }
    // у стены: лента центров в 0,43…0,62 м от неё, бежим по этой ленте прямо вперёд
    for (const d of [0.43, 0.5, 0.58, 0.62]) for (let k = 0; k <= 4; k++) {
      if (acrossX) {
        const sx = Math.sign(a.x0 + a.x1) * (4 + d), sz = a.z0 + (a.z1 - a.z0) * (0.3 + 0.7 * (k / 4));
        runs.push({ sx, sz, tx: sx, tz: czb, wall: true });
      } else {
        const sz = Math.sign(a.z0 + a.z1) * (4 + d), sx = a.x0 + (a.x1 - a.x0) * (0.3 + 0.7 * (k / 4));
        runs.push({ sx, sz, tx: cxb, tz: sz, wall: true });
      }
    }
    for (const r of runs) {
      if (overlap(r.sx, r.sz, wall) || !overlap(r.sx, r.sz, a, 0.2) || overlap(r.sx, r.sz, b)) continue;
      if (steps.some((q, k) => k !== i && q.rect.y > a.y + 0.01 && q.rect.y - SKILL_STEP_THICK < a.y + PLAYER_HEIGHT && overlap(r.sx, r.sz, q.rect))) continue;
      const s = Object.assign(makeState(), { x: r.sx, y: a.y, z: r.sz, grounded: 1 });
      const inp = makeInput();
      let ok = false, prev = NaN;
      for (let n = 0; n < 100 && !ok; n++) {
        const dx = r.tx - s.x, dz = r.tz - s.z;
        inp.seq = n + 1;
        inp.viewTick = 10 + n;
        inp.yaw = Math.atan2(-dx, -dz);
        inp.buttons = Math.hypot(dx, dz) > 0.15 + 0.07 * Math.hypot(s.vx, s.vz) ? BTN_FORWARD : 0;
        dyn.step(s, inp, prev, ev);
        prev = inp.viewTick;
        ok = Math.abs(s.y - b.y) < 0.02 && s.grounded === 1 && Math.hypot(r.tx - s.x, r.tz - s.z) < 0.4;
        // шагнул ещё выше (на ступень за следующей) — тоже подъём, не зацепился
        if (!ok && s.y > b.y + 0.4 && s.grounded === 1) ok = true;
      }
      tried++;
      if (r.wall) hugging++;
      if (!ok) failed.push(`${i}->${i + 1} from (${r.sx.toFixed(2)}, ${r.sz.toFixed(2)}) ended (${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)})`);
    }
  }
  assert.ok(tried > 400 && hugging > 80, `tried ${tried} walks, ${hugging} along the wall`);
  assert.deepEqual(failed, []);
});

test('balloons: the sacks over the baskets leave a wide safe strip and one short hit on the dangerous half (still a trap, but fair)', () => {
  const map = makeSkillMap();
  const baskets = map.movers.filter((m) => m.look === 'basket');
  const sacks = map.sacks.filter((k) => k.sec === 8);
  assert.equal(baskets.length, 2);
  assert.equal(sacks.length, 2);
  const pose = makeSackPose(), pos = { x: 0, y: 0, z: 0 };
  const touches = (k: SkillSack, t: number, x: number, y: number, z: number): boolean => {
    const q = sackAt(k, t, pose);
    const cx = q.x < x - H ? x - H : q.x > x + H ? x + H : q.x, cy = q.y < y ? y : q.y > y + PLAYER_HEIGHT ? y + PLAYER_HEIGHT : q.y, cz = q.z < z - H ? z - H : q.z > z + H ? z + H : q.z;
    return (q.x - cx) ** 2 + (q.y - cy) ** 2 + (q.z - cz) ** 2 < k.r * k.r;
  };
  /** Едет по корзине bi, стоя на месте на расстоянии o от её середины поперёк: тиков касания, ударов, тик первого касания */
  const ride = (bi: number, o: number): { hit: number; events: number; first: number } => {
    const m = baskets[bi], t0 = m.sched.phase + m.sched.rest, t1 = t0 + m.sched.go;
    let hit = 0, events = 0, first = -1, prev = false;
    for (let t = t0; t <= t1; t++) {
      moverAt(m, t, pos);
      const h = sacks.some((k) => touches(k, t, pos.x, pos.y, m.z + o));
      if (h) { hit++; if (first < 0) first = t - t0; if (!prev) events++; }
      prev = h;
    }
    return { hit, events, first };
  };
  for (const [bi, sign] of [[0, 1], [1, -1]] as const) {
    // безопасная полоса: желейка целиком на корзине (центр не дальше 0,98 м от середины) и мешок её не достаёт за весь подъём
    let lo = 9, hi = -9;
    for (let o = -0.98; o <= 0.98001; o += 0.01) if (ride(bi, o).hit === 0) { lo = Math.min(lo, o); hi = Math.max(hi, o); }
    assert.ok(hi - lo >= 0.9, `basket ${bi}: safe strip ${(hi - lo).toFixed(2)} m (was 0,45)`);
    assert.ok(lo * sign <= 0 && hi * sign <= 0 || lo * sign >= 0, 'the strip is on one side');
    // на опасной половине мешок по-прежнему достаёт — но один раз и коротко (было: два удара, 63 тика, первый на 149-м)
    const bad = ride(bi, 0.5 * sign), badOuter = ride(bi, 0.9 * sign);
    for (const r of [bad, badOuter]) {
      assert.equal(r.events, 1, 'one hit per ride');
      assert.ok(r.hit >= 5 && r.hit <= 25, `contact ticks ${r.hit}`);
      assert.ok(r.first >= 190, `first contact at ${r.first} (was 149)`);
    }
  }
});

test('belfry: the held steps are a pure function of the jelly and the clock — two simulations across the stair reform stay bit-identical', () => {
  const ma = makeSkillMap(), mb = makeSkillMap();
  const a = new SkillDynamics(ma, new CollisionWorld(ma)), b = new SkillDynamics(mb, new CollisionWorld(mb));
  const ea = makeEvents(), eb = makeEvents();
  for (const [x, y, z] of [[5, 47, 8], [5, 47.5, 5], [5.5, 49, 3], [-5, 56.5, -5]]) {
    const sa = Object.assign(makeState(), { x, y, z, grounded: 1 }), sb = copyState(makeState(), sa);
    let seed = 777 + Math.round(x * 10 + z);
    for (let n = 1; n <= 700; n++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      // время идёт через начало цикла лестницы (t = 6000): сборка прямо на глазах
      const inp = { ...makeInput(), seq: n, viewTick: 5700 + n, buttons: seed % 5 === 0 ? BTN_JUMP | BTN_FORWARD : BTN_FORWARD, yaw: ((seed >> 8) % 628) / 100 };
      a.step(sa, inp, n === 1 ? NaN : 5700 + n - 1, ea);
      b.step(sb, inp, n === 1 ? NaN : 5700 + n - 1, eb);
      assert.ok(statesEqual(sa, sb), `diverged at ${n} from (${x}, ${y}, ${z})`);
    }
  }
});
