// Директор волн агента fort (server/fort/director.ts, настройки игры FEATURES) для модели экономики arsenal
// (tools/fort-balance/model.ts, тип Director):
//   node tools/fort-balance/run.ts --director tools/fort-balance/fort-director.ts --players 3
// HP каждого — как в бюджете директора (budgetHp: тело, Чугунку ×1,5, 70 % щита); босс ×1,3 — броня вне окна
// уязвимости. Лодки — числом (награда команде), экипаж — со своей половиной награды. Супер-волна — Кракен: четыре
// щупальца и голова (krakenHp), тоже ×1,3. Зерно — FORT_SEED.
import { budgetHp, planWave } from '../../server/fort/director.ts';
import { Z_KRAKEN, Z_TENTACLE, isBossKind } from '../../shared/fortkinds.ts';
import { TENT_COUNT } from '../../shared/fortkraken.ts';
import { KRAKEN_HEAD_BASE_HP, TENTACLE_BASE_HP, krakenHp, releaseSeconds } from '../../shared/fortwaves.ts';

interface Spawn {
  kind: number;
  count: number;
  hp: number;
  rank?: number;
  crew?: boolean;
}

const SEED = Number(process.env.FORT_SEED ?? 12345);
/** Броня босса вне окна уязвимости — HP «как снимают на деле» */
const BOSS_EFFECTIVE = 1.3;

export function director(wave: number, n: number): { spawns: Spawn[]; seconds: number; boats: number } {
  const plan = planWave(wave, n, SEED);
  const groups = new Map<string, Spawn>();
  const add = (kind: number, tier: number, crew: boolean) => {
    const key = `${kind}:${tier}:${crew ? 1 : 0}`;
    let g = groups.get(key);
    if (!g) {
      g = { kind, count: 0, hp: budgetHp(kind, tier, wave, plan.defenders, plan.hpScale), rank: tier, crew };
      groups.set(key, g);
    }
    g.count++;
  };
  for (const s of plan.spawns) add(s.kind, s.tier, false);
  for (const b of plan.boats) b.crew.forEach((k, i) => add(k, b.tiers[i] ?? 0, true));
  const spawns = [...groups.values()];
  if (plan.boss >= 0 && isBossKind(plan.boss)) spawns.push({ kind: plan.boss, count: 1, hp: plan.bossHp * BOSS_EFFECTIVE });
  if (plan.kraken) {
    spawns.push({ kind: Z_TENTACLE, count: TENT_COUNT, hp: krakenHp(TENTACLE_BASE_HP, wave, n) * BOSS_EFFECTIVE });
    spawns.push({ kind: Z_KRAKEN, count: 1, hp: krakenHp(KRAKEN_HEAD_BASE_HP, wave, n) * BOSS_EFFECTIVE });
  }
  return { spawns, seconds: releaseSeconds(wave), boats: plan.boats.length };
}

export default director;
