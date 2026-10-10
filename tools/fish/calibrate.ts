// Калибровка манеры рыб (fisheco): для каждого вида подобрать «живость» (скорость в коридоре своей категории, а у трудных
// паттернов — спокойнее: медленнее, меньше размах, длиннее цикл) и сопротивление так, чтобы «обычный» игрок модели
// (test/fishbot.ts) 0-го уровня без бонусов вытаскивал его с вероятностью цели категории за время боя категории.
// Паттерн у видов разный и сильно меняет сложность, поэтому подбор — по каждому виду. Запуск:
// node tools/fish/calibrate.ts → таблица CAL для shared/fishrules.ts.
// Вид баркаса, которого море ломает сильнее соседей (махи-махи), подбирается уже в море, к успеху соседей по категории:
// SEA=0.63 GRID=-1.8,-1.6,-1.4,-1.2,-1,-0.7 node tools/fish/calibrate.ts mahi — в CAL идут цифры до моря. Меч-рыба —
// на спокойной сетке: GRID=-1.8,-1.6,-1.4,-1.2,-1,-0.7,-0.4 node tools/fish/calibrate.ts swordfish.
import { FISH } from '../../shared/fishing.ts';
import { BAND, COLLECTION, RULE, SEA_DRAIN, SEA_FIGHT, T_LEGEND } from '../../shared/fishrules.ts';
import { TYPICAL, EXPERT, reelStats } from '../../test/fishbot.ts';
import type { ReelStyle } from '../../shared/fishreel.ts';

/** Цель успеха обычного игрока 0-го уровня по категориям и коридор скорости, %/с */
export const CAL_TARGET = [0.99, 0.93, 0.8, 0.55, 0.36];
export const CAL_SPEED: ReadonlyArray<readonly [number, number]> = [[14, 24], [18, 30], [22, 36], [26, 42], [30, 48]];
/** Рывок к скорости по категориям */
export const CAL_DART = [3.5, 3.7, 3.9, 4.2, 4.4];
/** Цель длины боя (успешного), с */
export const CAL_TIME = [6, 9, 12, 15, 18];
const N = Number(process.env.N ?? 120);
/** «Живость»: −1…1; ниже нуля — спокойнее нижней границы коридора */
const GRID = process.env.GRID ? process.env.GRID.split(',').map(Number) : [-1, -0.7, -0.4, -0.15, 0, 0.25, 0.5, 0.75, 1];
/** Цель успеха в море (рывки и резкость ×SEA_FIGHT, сопротивление ×SEA_DRAIN) вместо цели категории */
const SEA = process.env.SEA ? Number(process.env.SEA) : 0;

function styled(base: ReelStyle, tier: number, s: number, drain: number): ReelStyle {
  const [lo, hi] = CAL_SPEED[tier];
  const spd = s >= 0 ? lo + (hi - lo) * s : lo * (1 + 0.5 * s);
  const amp = BAND[tier].amp * (s >= 0 ? 0.85 + 0.3 * s : 0.85 * (1 + 0.4 * s));
  const per = Math.round(BAND[tier].per * (s >= 0 ? 1 : 1 - 0.4 * s));
  return { ...base, spd, dartSpd: spd * CAL_DART[tier], patternAmplitude: amp, patternPeriod: per, drain };
}

function success(sp: number, st: ReelStyle, n = N, skill = TYPICAL): { p: number; s: number; perfect: number } {
  const sea = SEA ? { ...st, dartSpd: st.dartSpd * SEA_FIGHT, sharp: st.sharp * SEA_FIGHT, drain: st.drain * SEA_DRAIN } : st;
  const r = reelStats(sea, skill, n, 7 + sp * 104_729);
  // «Идеально» — первая оценка REEL_GRADES (perfectP заменён на gradeP 04.10)
  return { p: r.p, s: r.caughtTicks / 60, perfect: r.gradeP[0] ?? 0 };
}

const out: Record<string, [number, number, number, number, number]> = {};
const lines: string[] = [];
const only = process.argv.slice(2);
for (const sp of COLLECTION) {
  const rule = RULE[sp]!;
  if (only.length && !only.includes(FISH[sp].id)) continue;
  const tier = rule.tier;
  // у божественной своих целей здесь нет (кальмар подобран отдельно, см. CAL в shared/fishrules.ts); остров — tools/fish/isle-reel.ts
  if (CAL_TARGET[tier] === undefined) { console.error(`${FISH[sp].id}: категория ${tier} — пропуск`); continue; }
  const target = SEA || CAL_TARGET[tier];
  const base = rule.style;
  const ok = (p: number) => (target >= 0.99 ? p >= 0.99 : p > target);
  let best: { s: number; d: number; t: number; score: number } | null = null;
  for (const s of GRID) {
    // самое злое сопротивление, при котором ещё держится цель успеха
    let lo = 1, hi = 90;
    if (!ok(success(sp, styled(base, tier, s, lo)).p)) continue;
    for (let i = 0; i < 9; i++) { const d = (lo + hi) / 2; if (ok(success(sp, styled(base, tier, s, d)).p)) lo = d; else hi = d; }
    const t = success(sp, styled(base, tier, s, lo)).s;
    // ближе к нужной длине боя; при равенстве — живее
    const score = Math.abs(t - CAL_TIME[tier]) / CAL_TIME[tier] - s * 0.02;
    if (!best || score < best.score) best = { s, d: lo, t, score };
  }
  if (!best) throw new Error(`${FISH[sp].id}: цель недостижима`);
  const st = styled(base, tier, best.s, best.d);
  const typ = success(sp, st, 400);
  const exp = success(sp, st, 400, EXPERT);
  out[FISH[sp].id] = [+st.spd.toFixed(2), +st.dartSpd.toFixed(2), +st.patternAmplitude!.toFixed(2), +best.d.toFixed(2), st.patternPeriod!];
  lines.push(`${FISH[sp].id.padEnd(15)} t${tier}${tier >= T_LEGEND ? '*' : ' '} ${rule.zone.padEnd(6)} live ${best.s.toFixed(2).padStart(5)} spd ${st.spd.toFixed(1).padStart(5)} dart ${st.dartSpd.toFixed(0).padStart(4)} amp ${st.patternAmplitude!.toFixed(0).padStart(3)} per ${String(st.patternPeriod).padStart(3)} drain ${best.d.toFixed(1).padStart(5)} | typ ${(typ.p * 100).toFixed(0).padStart(3)}% ${typ.s.toFixed(1).padStart(5)}s perf ${(typ.perfect * 100).toFixed(0).padStart(3)}% | exp ${(exp.p * 100).toFixed(0).padStart(3)}% ${exp.s.toFixed(1).padStart(5)}s`);
  console.error(lines[lines.length - 1]);
}
console.log(lines.join('\n'));
console.log('\n/** Подобрано tools/fish/calibrate.ts: скорость %/с, рывок %/с, размах %, сопротивление %/с, цикл (тики) */');
console.log('const CAL: Record<string, readonly [number, number, number, number, number]> = {');
for (const [id, v] of Object.entries(out)) console.log(`  ${id}: [${v.join(', ')}],`);
console.log('};');
