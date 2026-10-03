// Директор волн агента fort (server/fort/director.ts, настройки игры FEATURES) для модели экономики arsenal
// (tools/fort-balance/model.ts, тип Director):
//   node tools/fort-balance/run.ts --director tools/fort-balance/fort-director.ts --players 3
// HP каждого — как в бюджете директора (budgetHp: тело, Чугунку ×1,5, 70 % щита); босс ×1,3 — броня вне окна
// уязвимости. Лодки — числом (награда команде), экипаж — со своей половиной награды. Зерно — FORT_SEED.
import { budgetHp, planWave } from '../../server/fort/director.ts';
import { isBossKind } from '../../shared/fortkinds.ts';
import { releaseSeconds } from '../../shared/fortwaves.ts';

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
  return { spawns, seconds: releaseSeconds(wave), boats: plan.boats.length };
}

export default director;
