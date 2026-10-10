// Способности мификов и божественной, +20 % времени и награды уровней (10.10, shared/fishability.ts): срабатывают один раз за
// бой на 60–75 % улова; клиент (по тику, как fishgame.ts) и повтор сервера (кусками, как приходят сообщения) по одним
// нажатиям приходят бит в бит к одному состоянию; кемпер у дна не ловит; рыбы без способности — как прежде; осётр «чует
// ловушку» (кемпер — нет, честная игра — да). Модели игроков — test/fishbot.ts и tools/fish/abilitybot.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH } from '../shared/fishing.ts';
import { COLLECTION, RULE, T_DIVINE, T_MYTH, reelStyleFor } from '../shared/fishrules.ts';
import { FISH_XP_LEVELS, emptyFishProgress, fishCastMods, type FishCastMods } from '../shared/fishprogress.ts';
import { REEL_MAX_TICKS, REEL_P_MAX, abilityView, reelRun, reelStart, type AbilitySpec, type Reel } from '../shared/fishreel.ts';
import {
  BIG_FILL, ISLE_ABILITY, LEVEL_PERKS, SPECIES_ABILITY, WARY_HOLD, gradeErrors, hookBonusMs, levelBonus, reelStyle2, spById,
} from '../shared/fishability.ts';
import { EXPERT, TYPICAL, playReel } from './fishbot.ts';
import { playReel2, stats2 } from '../tools/fish/abilitybot.ts';

/** Снимок заброса уровня level с удочкой rod и блесной lure (как в tools/fish/abilities-sim.ts) */
function mods(sp: number, level: number, rod = 0, lure = 0): FishCastMods {
  return fishCastMods({ ...emptyFishProgress(), xp: FISH_XP_LEVELS[level], questsDone: [0, 1, 5, 10, 15][rod], rod: rod as 0, lure: lure as 0 }, 0, RULE[sp]!.zone);
}

/** Клиент — по тику (fishgame.ts update), сервер — кусками по 15 тиков (сообщения reel): то же состояние в конце */
function clientAndServer(style: ReturnType<typeof reelStyle2>, seed: number, toggles: readonly number[]): { client: Reel; server: Reel } {
  const client = reelStart(style, seed);
  let k = 0;
  while (client.done === 0 && client.t < REEL_MAX_TICKS) k = reelRun(client, toggles, client.t + 1, k);
  const server = reelStart(style, seed);
  let ks = 0;
  for (let u = 15; server.done === 0 && u < REEL_MAX_TICKS + 15; u += 15) ks = reelRun(server, toggles, u, ks);
  return { client, server };
}

test('способности: у мификов и божественной пристани и баркаса; +20 % времени; остров — по id, как только вид появится', () => {
  for (const id of Object.keys(SPECIES_ABILITY)) {
    const sp = spById(id);
    assert.ok(RULE[sp]!.tier === T_MYTH || RULE[sp]!.tier === T_DIVINE, id);
    const st = reelStyle2(sp, mods(sp, 10, 3, 3));
    assert.equal(st.ability, SPECIES_ABILITY[id], `${id}: способность`);
    assert.equal(st.fill, BIG_FILL, `${id}: 120 % времени`);
    assert.equal(st.lastStand, undefined, `${id}: способность вместо «последнего рывка»`);
    assert.equal(st.abilityResist, 20, `${id}: стойкость II на 10-м уровне`);
  }
  // остальные мифики (без способности) — тоже 120 %, но со старым рывком
  for (const sp of COLLECTION.filter((s) => RULE[s]!.tier === T_MYTH && !SPECIES_ABILITY[FISH[s].id])) {
    const st = reelStyle2(sp, mods(sp, 5));
    assert.equal(st.fill, BIG_FILL);
    assert.equal(st.ability, undefined);
  }
  // виды острова ещё не в FISH: их способности ждут по id
  for (const id of ['beluga', 'thresher', 'baskingshark', 'frilledshark']) {
    assert.ok(ISLE_ABILITY[id], id);
    assert.equal(WARY_HOLD[id], 240, `${id}: «АФК у дна» закрыт`);
  }
});

test('один раз за бой: точка срабатывания — 60–75 % улова (по сиду), фазы идут только вперёд', () => {
  const abilities: AbilitySpec[] = [...Object.values(SPECIES_ABILITY), ...Object.values(ISLE_ABILITY)];
  const sp = spById('greenlandshark');
  for (const ability of abilities) {
    const style = reelStyle2(sp, mods(sp, 10, 3, 3), { ability });
    let fired = 0;
    for (let i = 0; i < 12; i++) {
      const seed = 101 + i * 7919;
      const r = reelStart(style, seed);
      assert.ok(r.ab!.at >= 0.6 * REEL_P_MAX && r.ab!.at <= 0.75 * REEL_P_MAX, `${ability.id}: точка ${r.ab!.at}`);
      const play = playReel2(style, seed, EXPERT);
      const q = reelStart(style, seed);
      let k = 0;
      let phase = 0;
      let pAtWarn = -1;
      while (q.done === 0 && q.t < REEL_MAX_TICKS) {
        k = reelRun(q, play.toggles, q.t + 1, k);
        const v = abilityView(q)!;
        assert.ok(v.phase >= phase, `${ability.id}: фаза назад ${phase} → ${v.phase}`);
        if (v.phase === 1 && phase === 0) pAtWarn = q.p;
        phase = v.phase;
      }
      if (phase > 0) {
        fired++;
        assert.ok(pAtWarn >= q.ab!.at, `${ability.id}: сработала не раньше точки`);
      }
    }
    assert.ok(fired > 0, `${ability.id}: «опытный» хоть раз дошёл до способности`);
  }
});

test('клиент и сервер по одним нажатиям — бит в бит: способности пристани, баркаса и острова, ур. 0 / 7 / 15', () => {
  const cases: Array<[string, AbilitySpec | undefined]> = [
    ['whiteshark', undefined], ['kalmar', undefined], ['oarfish', undefined], ['greenlandshark', undefined],
    ...Object.values(ISLE_ABILITY).map((a): [string, AbilitySpec] => ['greenlandshark', a]),
  ];
  let fired = 0;
  for (const [id, ability] of cases) {
    const sp = spById(id);
    for (const [level, rod, lure] of [[0, 0, 0], [7, 2, 3], [15, 4, 4]] as const) {
      const style = reelStyle2(sp, mods(sp, level, rod, lure), ability ? { ability } : {});
      for (let i = 0; i < 4; i++) {
        const seed = (sp * 13 + i * 2654435761 + level) | 0;
        const play = playReel2(style, seed, i % 2 ? EXPERT : TYPICAL);
        const { client, server } = clientAndServer(style, seed, play.toggles);
        assert.deepEqual(server, client, `${id}${ability ? `/${ability.id}` : ''}, ур. ${level}, сид ${seed}`);
        assert.deepEqual([client.done === 1, client.err, client.t], [play.caught, play.err, play.ticks]);
        if (play.fired) fired++;
      }
    }
  }
  assert.ok(fired >= 20, `способность сработала в ${fired} боях`);
});

test('рыбы без способности — бит в бит как прежде (ур. 0 без снаряжения: reelStyle2 = reelStyleFor)', () => {
  const plain = COLLECTION.filter((sp) => RULE[sp]!.tier < T_MYTH && !WARY_HOLD[FISH[sp].id]);
  assert.ok(plain.length > 30);
  for (const sp of plain) {
    const m = mods(sp, 0);
    const a = reelStyle2(sp, m), b = reelStyleFor(sp, m);
    for (const seed of [5, 9001]) {
      const pa = playReel(a, seed, TYPICAL), pb = playReel(b, seed, TYPICAL);
      assert.deepEqual([pa.caught, pa.err, pa.ticks, pa.toggles.join()], [pb.caught, pb.err, pb.ticks, pb.toggles.join()], FISH[sp].id);
    }
  }
});

test('«жду у дна» больше не работает: мифики, кальмар и осётр; честная игра с осетром — как была', () => {
  for (const id of ['whiteshark', 'oarfish', 'kalmar', 'sturgeon']) {
    const sp = spById(id);
    const camp = stats2(reelStyle2(sp, mods(sp, 10, 3, 3)), EXPERT, 60, 11 + sp * 7919, { camp: 1 }).p;
    assert.ok(camp <= 0.05, `${id}: кемпер у дна ${camp}`);
  }
  // осётр: «обычный» 10-го уровня — не хуже прежних ~59 % (сопротивление ниже под «чует ловушку»)
  const st = spById('sturgeon');
  const fair = stats2(reelStyle2(st, mods(st, 10, 3, 3)), TYPICAL, 150, 11 + st * 7919).p;
  assert.ok(fair >= 0.6, `осётр, «обычный» ур. 10: ${fair}`);
});

test('награды уровней 1–15: по одной на уровень; подсечка, стойкость, «Спокойная рука», «Хватка», «Мастер»', () => {
  assert.deepEqual(LEVEL_PERKS.map((p) => p.level), Array.from({ length: 15 }, (_, i) => i + 1));
  assert.deepEqual([0, 1, 5, 6, 11, 15].map(hookBonusMs), [0, 100, 100, 200, 300, 300]);
  assert.deepEqual([0, 4, 5, 10, 15].map((l) => levelBonus(l).resist), [0, 0, 10, 20, 30]);
  assert.equal(gradeErrors(1, 8), 1);
  assert.equal(gradeErrors(1, 9), 0);
  assert.equal(gradeErrors(3, 15), 2);
  assert.equal(levelBonus(13).pStart, 25);
  assert.equal(levelBonus(14).pStart, 27);
  assert.ok(levelBonus(15).master && !levelBonus(14).master);
  // стойкость режет действие способности (ветер 5 с → 3,5 с на 15-м)
  const sp = spById('greenlandshark');
  assert.equal(reelStart(reelStyle2(sp, mods(sp, 0)), 1).ab!.dur, 300);
  assert.equal(reelStart(reelStyle2(sp, mods(sp, 15, 4, 4)), 1).ab!.dur, 210);
});
