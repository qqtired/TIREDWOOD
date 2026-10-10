// 04.10, «прогресс рыбака»: уровни рыбалки до 15, «Коллекция» на доске у пристани, сундук ×1,25 и «Сокровища Посейдона»,
// вес кальмара 700–3000 кг. Решает сервер; здесь — чистые правила (shared/) и доска (server/lobby/fishtop.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH } from '../shared/fishing.ts';
import {
  FISH_MAX_LEVEL, FISH_XP_LEVELS, emptyFishProgress, fishCastMods, fishLevel, fishLevelView, normalizeFishProgress,
} from '../shared/fishprogress.ts';
import {
  CHEST_ANNOUNCE, CHEST_BANDS, CHEST_MAX, CHEST_PER_10K, COIN_PER_POINT, COLLECTION, COLLECTION_SIZE, FISH_OTHER_PRICE_SCALE, FISH_PRICE_CUT, FISH_TOP_ROWS,
  POSEIDON_COINS, ZONE_SCALE_MAX, basePrice, biteShare, isPoseidon, priceRange, reelStyleFor, rollCatch2, rollWeight,
  SP_CHEST,
} from '../shared/fishrules.ts';
import { makeRng } from '../shared/math.ts';
import { FishBoard, buildFishTop } from '../server/lobby/fishtop.ts';
import { FISHING_RESET_VERSION } from '../shared/levels.ts';
import { normalizeProfile, type Profile, type Store } from '../server/store.ts';

const sp = (id: string): number => FISH.findIndex((f) => f.id === id);

// ------------------------------------------------------------ уровни

test('уровни рыбалки: 15-й — максимум, пороги 11–15 продолжают кривую плавно, без скачка', () => {
  assert.equal(FISH_MAX_LEVEL, 15);
  assert.equal(FISH_XP_LEVELS.length, 16);
  assert.deepEqual(FISH_XP_LEVELS.slice(10), [15_000, 22_000, 31_500, 44_000, 60_000, 80_000]);
  const inc = FISH_XP_LEVELS.slice(1).map((x, i) => x - FISH_XP_LEVELS[i]);
  assert.deepEqual(inc.slice(10), [7000, 9500, 12_500, 16_000, 20_000], 'опыт на 11–15-й уровни');
  // с 3-го уровня опыта на уровень всегда больше, чем на прежний, и не более чем в 1,7 раза: новые уровни не ломают кривую
  for (let i = 3; i < inc.length; i++) assert.ok(inc[i] > inc[i - 1] && inc[i] / inc[i - 1] <= 1.7, `уровень ${i + 1}: +${inc[i]} после +${inc[i - 1]}`);
  for (let level = 1; level <= FISH_MAX_LEVEL; level++) {
    assert.equal(fishLevel(FISH_XP_LEVELS[level] - 1), level - 1);
    assert.equal(fishLevel(FISH_XP_LEVELS[level]), level);
  }
  assert.equal(fishLevel(Number.MAX_SAFE_INTEGER), 15, 'выше пятнадцатого уровней нет');
  assert.deepEqual(fishLevelView(79_999), { level: 14, xp: 79_999, from: 60_000, next: 80_000 });
  assert.deepEqual(fishLevelView(80_000), { level: 15, xp: 80_000, from: 80_000, next: null });
  assert.deepEqual(fishLevelView(5_000_000), { level: 15, xp: 5_000_000, from: 80_000, next: null });
});

test('старый профиль: опыт цел, у кого было больше 15 000 — новые уровни сразу; прежние уровни не меняются', () => {
  const old = (xp: number) => ({ id: 3, nick: 'Ветеран', fishingResetVersion: FISHING_RESET_VERSION, stats: { fsFish: 400 }, album: { goby: [350, 9] }, fishing: { xp, questsDone: 15, questCaught: 4, rod: 4, beerUntil: 0 } });
  for (const [xp, level] of [[0, 0], [12_345, 9], [14_999, 9], [15_000, 10], [21_999, 10], [22_000, 11], [42_000, 12], [100_000, 15]] as const) {
    const p = normalizeProfile(old(xp))!;
    assert.equal(p.fishing.xp, xp, `${xp}: опыт не меняется при чтении сохранения`);
    assert.equal(fishLevel(p.fishing.xp), level, `${xp} опыта — ${level}-й уровень`);
    assert.equal(p.fishing.rod, 4, 'удочка, задания и альбом не тронуты');
    assert.equal(p.fishing.questsDone, 15);
    assert.deepEqual(p.album, { goby: [350, 9] });
  }
  assert.equal(normalizeFishProgress({ xp: 42_000.9 }).xp, 42_000);
  // уровень 11+ даёт то же, что и прежние: +2,5 % зоны за уровень (до 37,5 % на 15-м), потолок зоны — 15-й уровень с легендарной удочкой
  for (const level of [10, 11, 12, 13, 14, 15]) {
    const mods = fishCastMods({ ...emptyFishProgress(), xp: FISH_XP_LEVELS[level] }, 0);
    assert.equal(mods.level, level);
    assert.ok(Math.abs(mods.zoneScale - (1 + 0.025 * level)) < 1e-12, `ур. ${level}: зона`);
  }
  const best = fishCastMods({ ...emptyFishProgress(), xp: 80_000, questsDone: 15, rod: 4 }, 0);
  assert.equal(best.zoneScale, ZONE_SCALE_MAX);
  const z = (xp: number): number => reelStyleFor(sp('hamsa'), fishCastMods({ ...emptyFishProgress(), xp }, 0)).zone;
  assert.ok(z(FISH_XP_LEVELS[15]) > z(FISH_XP_LEVELS[10]) * 1.09, 'на 15-м зона на шкале заметно шире, чем на 10-м: потолок её не режет');
});

// ------------------------------------------------------------ сундук и «Сокровища Посейдона»

test('сундук ×1,25: суммы полос — прежние ×1,25, веса те же; порог чата и самый крупный обычный сундук пересчитаны', () => {
  const OLD = [[25, 50, 650], [51, 100, 250], [101, 150, 70], [151, 199, 25], [200, 200, 5]];
  assert.deepEqual(CHEST_BANDS.map((b) => [...b]), OLD.map(([lo, hi, w]) => [Math.round(lo * 1.25), Math.round(hi * 1.25), w]));
  const mean = (bands: ReadonlyArray<readonly number[]>): number => {
    const total = bands.reduce((s, b) => s + b[2], 0);
    return bands.reduce((s, [lo, hi, w]) => s + ((lo + hi) / 2) * (w / total), 0);
  };
  assert.ok(Math.abs(mean(CHEST_BANDS) / mean(OLD) - 1.25) < 0.003, `средний сундук ${mean(OLD).toFixed(2)} → ${mean(CHEST_BANDS).toFixed(2)}`);
  // чат — с тех же 3 % сундуков, что и раньше (две верхние полосы); самый крупный обычный сундук (не джекпот) — последняя полоса
  assert.equal(CHEST_ANNOUNCE, CHEST_BANDS[3][0]);
  assert.equal(CHEST_MAX, CHEST_BANDS[4][0]);
  assert.equal(CHEST_MAX, 250);
  assert.ok(CHEST_BANDS[4][0] < POSEIDON_COINS);
});

test('«Сокровища Посейдона»: новичку 1500 🪙 в нижнем 1 % полосы сундука; граница и остальные сундуки — по полосам', () => {
  const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };
  const chestRoll = CHEST_PER_10K / 10_000;
  // 1 % от 3 % поклёвок — 0,03 %: при rand < 0,0003 новичок находит клад
  for (const r of [0, 0.0001, 0.000299]) {
    const c = rollCatch2(false, seq(r, 0.5, 0.5, 0.5));
    assert.equal(c.sp, SP_CHEST);
    assert.equal(c.coins, 1500, `r=${r}`);
    assert.ok(isPoseidon(c.coins));
  }
  // ровно на границе — уже обычный сундук
  for (const r of [0.0003, 0.0009, 0.001, 0.01, chestRoll - 0.00001]) {
    const c = rollCatch2(false, seq(r, 0.5, 0.5, 0.5));
    assert.equal(c.sp, SP_CHEST);
    assert.ok(c.coins >= CHEST_BANDS[0][0] && c.coins <= CHEST_MAX, `r=${r}: ${c.coins}`);
    assert.ok(!isPoseidon(c.coins));
  }
  // дальше сундука — рыба или хлам, не клад
  assert.notEqual(rollCatch2(false, seq(chestRoll + 0.001, 0.5, 0.5, 0.5)).sp, SP_CHEST);
  assert.ok(!isPoseidon(CHEST_MAX), 'самый крупный обычный сундук — не клад');
  // поток случайных чисел клад не сдвигает: те же вызовы rand у клада и у обычного сундука
  const count = (r: number): number => { let n = 0; rollCatch2(false, () => (n++ === 0 ? r : 0.5)); return n; };
  assert.equal(count(0.0001), count(0.01));
});

test('«Сокровища Посейдона»: 1 % сундуков на уровнях 0–1, 2 % на 8-м, 3 % на 15-м; погода, место и снасти шанс не множат', () => {
  const GRID = 10_000;
  for (const [level, want] of [[0, 100], [1, 100], [8, 200], [15, 300]] as const) {
    for (const boosted of [false, true]) {
      const mods = fishCastMods({ ...emptyFishProgress(), xp: FISH_XP_LEVELS[level],
        ...(boosted ? { questsDone: 15, rod: 4, lure: 4, vodkaUntil: 1e15 } : {}),
      }, 0, boosted ? 'barkas' : 'pier');
      let chests = 0;
      let treasure = 0;
      for (let i = 0; i < GRID; i++) {
        const r = (i + 0.5) / GRID * 0.03;
        let n = 0;
        const c = rollCatch2(boosted, () => (n++ === 0 ? r : 0.5), mods, boosted);
        if (c.sp !== SP_CHEST) continue;
        chests++;
        if (isPoseidon(c.coins)) treasure++;
      }
      assert.equal(chests, GRID, 'вся полоса сундука сохранена');
      assert.equal(treasure, want, `уровень ${level}, бонусы ${boosted}: ${treasure} из ${chests} сундуков`);
    }
  }
});

test('клад: точная граница на 1-м, 8-м и 15-м уровне, ниже 0 и выше 15 шанс ограничен', () => {
  const base = fishCastMods(emptyFishProgress(), 0);
  for (const [level, boundary] of [[-1, 0.0003], [0, 0.0003], [1, 0.0003], [8, 0.0006], [15, 0.0009], [99, 0.0009]]) {
    for (const [r, treasure] of [[boundary - 1e-10, true], [boundary, false]] as const) {
      let n = 0;
      const c = rollCatch2(false, () => n++ === 0 ? r : 0.5, { ...base, level });
      assert.equal(c.sp, SP_CHEST);
      assert.equal(c.coins === 1500, treasure, `уровень ${level}, бросок ${r}`);
    }
  }
});

// ------------------------------------------------------------ кальмар

test('кальмар: 700–3000 кг; цена считается от доли веса в диапазоне, смена веса её не ломает; в топ-5 дня почти всегда', () => {
  const k = sp('kalmar');
  const [lo, hi] = FISH[k].g;
  assert.deepEqual([lo, hi], [700_000, 3_000_000]);
  // вес: по всему диапазону, ближе к лёгкому (как у всех), ни одного ниже 700 кг
  const rng = makeRng(7);
  const w = Array.from({ length: 20_000 }, () => rollWeight(k, rng));
  assert.ok(Math.min(...w) >= lo && Math.max(...w) <= hi);
  assert.ok(Math.min(...w) < lo * 1.05 && Math.max(...w) > hi * 0.9, 'бывают и почти минимальный, и почти максимальный');
  // цена: от доли веса — на тех же долях та же цена, что считалась бы для любого диапазона, а границы — как раньше (500 и 1000 очков)
  // хотфикс 10.10: цена рыбы ещё ×FISH_PRICE_CUT (−35 %)
  const price = (share: number): number => Math.max(1, Math.round(Math.max(1, Math.round((500 + 500 * share) * COIN_PER_POINT * FISH_OTHER_PRICE_SCALE)) * FISH_PRICE_CUT));
  for (const share of [0, 0.1, 0.25, 0.5, 0.75, 1]) assert.equal(basePrice(k, Math.round(lo + share * (hi - lo))), price(share), `доля ${share}`);
  assert.deepEqual(priceRange(k), [price(0), price(1)]);
  assert.ok(price(0) >= 520 * FISH_PRICE_CUT && price(1) <= 1070 * FISH_PRICE_CUT, 'в журнале и в рюкзаке цена кальмара — 345–690 🪙 (было 530–1060, хотфикс 10.10 −35 %)');
  // вес ближе к лёгкому (u²): средняя цена — на трети диапазона, как и у остальных видов и как было при прежних 500–2500 кг
  const mean = w.reduce((s, g) => s + basePrice(k, g), 0) / w.length;
  assert.ok(Math.abs(mean - price(1 / 3)) < 6, `средняя цена кальмара ${mean.toFixed(1)} 🪙 (на трети диапазона ${price(1 / 3)})`);
});

test('кальмар в подиуме дня: с 700 кг он тяжелее почти всех; тяжелее — лишь четыре вида-гиганта, и то редко', () => {
  const k = sp('kalmar');
  const SQUID_MIN = FISH[k].g[0];
  // кроме кальмара, выше 700 кг вырастают только эти виды
  // (10.10: виды острова «Последний свет» — свой подиум-гигант: белуга, гигантская и плащеносная акулы тяжелее; здесь — пристань и баркас)
  const giants = COLLECTION.filter((i) => i !== k && FISH[i].g[1] > SQUID_MIN).map((i) => FISH[i].id).sort();
  // 'hammerhead' — большая белая акула (обмен 10.10), 'whiteshark' — теперь рыба-молот до 400 кг
  assert.deepEqual(giants, ['greenlandshark', 'hammerhead', 'oarfish', 'sunfish']);
  // и тяжелее кальмара любого веса — никто: самый крупный из них 1,5 т, а кальмар до 3 т
  assert.ok(Math.max(...COLLECTION.filter((i) => i !== k).map((i) => FISH[i].g[1])) < FISH[k].g[1]);
  // шанс, что чужая поклёвка тяжелее самого лёгкого кальмара: меньше 1,5 % на любом месте и в любую погоду (до 10.10 было 1 %, см. ниже)
  // (04.10 мифики клюют чаще — у новичка на баркасе 0,67 %, в дождь 0,79 %)
  for (const zone of ['pier', 'barkas'] as const) for (const rain of [false, true]) {
    const mods = fishCastMods(emptyFishProgress(), 0, zone);
    let heavier = 0;
    for (const s of COLLECTION) {
      if (s === k) continue;
      const [a, b] = FISH[s].g;
      if (b <= SQUID_MIN) continue;
      heavier += biteShare(s, rain, mods) * 0.95 * (a >= SQUID_MIN ? 1 : 1 - Math.sqrt((SQUID_MIN - a) / (b - a)));
    }
    // 10.10: после обмена акул большая белая (до 900 кг) — легенда баркаса в дождь: там 1,21 %, потолок 1,5 % (было 1 %)
    assert.ok(heavier < 0.015, `${zone}${rain ? ', дождь' : ''}: ${(heavier * 100).toFixed(2)} % поклёвок тяжелее 700 кг`);
  }
  // подиум — пять самых тяжёлых отдельных уловов дня: кальмар в 700 кг входит, даже когда четыре гиганта дня — рекордные
  const store = { state: { fishPodium: { day: '', catches: [] as Array<{ pid: number; nick: string; sp: number; g: number; at: number }> }, profiles: [] as Profile[] }, markDirty() {} };
  const board = new FishBoard(store as unknown as Store, () => Date.UTC(2026, 9, 4, 12));
  const p = (id: number): Profile => normalizeProfile({ id, nick: `Ловец${id}`, album: {}, fishing: {} })!;
  [['sunfish', 1], ['greenlandshark', 2], ['oarfish', 3], ['hammerhead', 4]].forEach(([id, pid]) => board.record(p(pid as number), sp(id as string), FISH[sp(id as string)].g[1]));
  for (let i = 5; i < 12; i++) board.record(p(i), sp('sturgeon'), 30_000);
  board.record(p(20), k, SQUID_MIN);
  const podium = store.state.fishPodium.catches;
  assert.equal(podium.length, 5);
  assert.ok(podium.some((c) => c.sp === k && c.pid === 20), 'кальмар в 700 кг — в топ-5 дня');
  assert.equal(podium[podium.length - 1].sp, k, 'и он пятый, пока четверо гигантов в рекордном весе');
  board.record(p(21), k, 2_000_000);
  assert.equal(store.state.fishPodium.catches[0].sp, k, 'кальмар в 2 т — первый место: тяжелее всего остального');
});

// ------------------------------------------------------------ «Коллекция» на доске

function fakeProfile(id: number, nick: string, species: number, extra: Partial<Profile['stats']> = {}): Profile {
  const album: Record<string, [number, number]> = {};
  for (const s of COLLECTION.slice(0, species)) album[FISH[s].id] = [500, 1];
  const p = normalizeProfile({ id, nick, album, stats: extra })!;
  return p;
}

test('«Коллекция» на доске: игроки по числу закрытых видов, при равенстве — старший профиль; пустые не попадают; не больше строк, чем в других списках', () => {
  const now = Date.UTC(2026, 9, 4, 12);
  const profiles = [
    fakeProfile(5, 'Эхо', 3),
    fakeProfile(2, 'Борис', 12),
    fakeProfile(9, 'Ян', COLLECTION_SIZE),
    fakeProfile(3, 'Дина', 12),
    fakeProfile(4, 'Новичок', 0),
  ];
  const top = buildFishTop(profiles, now);
  assert.deepEqual(top.cl, [
    { pid: 9, nick: 'Ян', v: COLLECTION_SIZE },
    { pid: 2, nick: 'Борис', v: 12 },
    { pid: 3, nick: 'Дина', v: 12 },
    { pid: 5, nick: 'Эхо', v: 3 },
  ]);
  // «N из M»: M — размер коллекции из кода игры; старые находки (золотая рыбка, хлам) в число не входят
  assert.equal(COLLECTION_SIZE, COLLECTION.length);
  const legacy = fakeProfile(11, 'Старожил', 2);
  legacy.album.goldfish = [300, 5];
  legacy.album.boot = [900, 7];
  assert.equal(buildFishTop([legacy], now).cl![0].v, 2);
  // не больше FISH_TOP_ROWS строк
  const crowd = Array.from({ length: 25 }, (_, i) => fakeProfile(100 + i, `Игрок${i}`, 1 + (i % 7)));
  const rows = buildFishTop(crowd, now).cl!;
  assert.equal(rows.length, FISH_TOP_ROWS);
  assert.ok(rows.every((r, i) => i === 0 || rows[i - 1].v > r.v || (rows[i - 1].v === r.v && rows[i - 1].pid < r.pid)), 'порядок: больше — выше, поровну — старший профиль');
  // прежние списки не тронуты
  assert.deepEqual(buildFishTop(profiles, now).dn, []);
  assert.equal(buildFishTop(profiles, now).day, '2026-10-04');
});
