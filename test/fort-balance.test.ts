// Модель экономики «Крепости» (tools/fort-balance): цель нагрузки для директора волн агента fort, доход по настоящим
// наградам, цели стен (новички 25–40, опытные 60–100, мастера до 300) на эталонном директоре.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CLEAN_MULT, KILL_SHARE, START_GOLD, killBounty, waveBonus } from '../shared/fortarsenal.ts';
import {
  LOAD_TARGET, SKILLS, TARGET_WALLS, baseLoad, checkLoad, currentDirector, fitHpScale, killsOf, loadOf, scaleHp, simulate,
  startCapital, targetDirector, targetLoad, waveIncome, type Director,
} from '../tools/fort-balance/model.ts';

test('цель нагрузки: проходит через опорные точки, растёт, между ними — ровно в одно число раз за волну', () => {
  for (const [w, l] of LOAD_TARGET) assert.ok(Math.abs(targetLoad(w) - l) < 1e-9, `W${w}`);
  for (let w = 2; w <= 320; w++) assert.ok(targetLoad(w) > targetLoad(w - 1), `W${w}`);
  assert.ok(Math.abs(targetLoad(5.5) - Math.sqrt(10)) < 1e-9);
  assert.ok(Math.abs(targetLoad(20) / targetLoad(19) - targetLoad(29) / targetLoad(28)) < 1e-9);
});

test('эталонный директор: нагрузка по цели при любом составе, абсолют 1-й волны — baseLoad(n)', () => {
  for (let n = 1; n <= 6; n++) {
    for (const c of checkLoad(targetDirector, n)) assert.ok(c.ok && Math.abs(c.got - c.want) / c.want < 1e-6, `n${n} W${c.wave}`);
    assert.ok(Math.abs(loadOf(targetDirector(1, n), n) - baseLoad(n)) < 1e-6);
    assert.ok(Math.abs(killsOf(targetDirector(1, n), 1, n) - 14) < 0.5);
  }
  assert.ok(baseLoad(1) > baseLoad(3) && baseLoad(3) > baseLoad(6), 'на одного тем меньше, чем больше защитников');
});

test('сверка ловит директор, который уходит от цели больше чем на 15 %', () => {
  const hard: Director = (w, n) => scaleHp(targetDirector, w >= 50 ? 1.3 : 1.1)(w, n);
  const c = checkLoad(hard, 3);
  assert.deepEqual(c.map((x) => x.ok), LOAD_TARGET.map(([w]) => w < 50));
});

test('доход за волну — по настоящим наградам: доля стрелка, общак с чистой волной, бонус волны', () => {
  const w = currentDirector(1, 1);
  const shooter = 14 * killBounty(0, 1);
  const clean = 0.6;
  const want = (shooter / KILL_SHARE) * (KILL_SHARE + (1 - KILL_SHARE) * (clean * CLEAN_MULT + 1 - clean)) + waveBonus(1);
  assert.ok(Math.abs(waveIncome(w, 1, 1, clean) - want) < 1e-9);
  // лодка десанта — команде поровну; экипаж — половина своей
  const boat = waveIncome({ spawns: [{ kind: 0, count: 2, hp: 60, crew: true }], seconds: 10, boats: 1 }, 1, 2, 0);
  assert.ok(Math.abs(boat - ((2 * killBounty(0, 1, 0, true)) / KILL_SHARE / 2 + waveBonus(1) + 75)) < 1e-9);
});

test('цели стен на эталонном директоре: новички 25–40, опытные 60–100, мастера до 300', () => {
  for (const key of Object.keys(SKILLS) as (keyof typeof SKILLS)[]) {
    const { wall } = simulate(targetDirector, 3, SKILLS[key]);
    const [a, b] = TARGET_WALLS[key];
    assert.ok(wall >= a && wall <= b, `${key}: стена ${wall}, цель ${a}–${b}`);
  }
  const fit = fitHpScale(targetDirector, 3);
  assert.ok(fit.lo < 1 && fit.hi >= 1, `k ∈ (${fit.lo}, ${fit.hi}]`);
});

test('подбор множителя HP: стены там, где запас впервые меньше k; HP ×2 — множитель вдвое меньше', () => {
  const a = fitHpScale(targetDirector, 3);
  const b = fitHpScale(scaleHp(targetDirector, 2), 3);
  assert.ok(Math.abs(b.lo - a.lo / 2) < 1e-9 && Math.abs(b.hi - a.hi / 2) < 1e-9);
  const harder = simulate(scaleHp(targetDirector, a.hi * 1.2), 3, SKILLS.experienced).wall;
  assert.ok(harder < TARGET_WALLS.experienced[0], `опытный при HP ×${(a.hi * 1.2).toFixed(2)}: ${harder}`);
});

test('забег: золото не уходит в минус, у умных покупок сила не падает, до 60-й волны покупки почти каждую волну; повтор — тот же итог', () => {
  for (const s of Object.values(SKILLS)) {
    const run = simulate(targetDirector, 3, s);
    let prev = 0;
    for (const r of run.rows) {
      assert.ok(r.gold >= 0, `${s.name} W${r.wave}: золото ${r.gold}`);
      // новичок может взять ствол хуже маркера — у него не проверяем; гранаты делятся на длину волны — без них
      const own = r.power.player + r.power.towers;
      if (s.buyer === 'greedy') assert.ok(own >= prev - 1e-9, `${s.name} W${r.wave}`);
      prev = own;
    }
    const early = run.rows.slice(0, 60).reduce((n, r) => n + r.buys, 0);
    assert.ok(early >= 50, `${s.name}: покупок до 60-й ${early}`);
    assert.deepEqual(simulate(targetDirector, 3, s), run);
  }
});

test('стартовый капитал с волны W: с 1-й — START_GOLD, дальше растёт', () => {
  assert.equal(startCapital(1), START_GOLD);
  let prev = START_GOLD;
  for (const w of [2, 10, 30, 100, 300]) {
    const c = startCapital(w);
    assert.ok(c > prev, `W${w}`);
    prev = c;
  }
});
