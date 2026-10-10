// Остров «Последний свет» (10.10, прототип): калибровка 20 видов острова на шкале по новым правилам и способности островных
// мификов и божественной. Режим острова — tools/fish/islestyle.ts (зона ×0,95, рывки ×1,3, сопротивление ×1,4 к базе;
// божественную место не трогает). Цель — «обычный» (test/fishbot.ts TYPICAL) 10-го уровня с удочкой 4 и платиной:
// обычные 98, редкие 90, эпические 80, легенды 70, мифики и божественная без способности 62 %; со способностью мифики ~55,
// божественная ~50 %. Ход вида (скорость, рывок, размах, цикл) — сосед, calEstimate; подбирается сопротивление, а если цель
// недостижима и при 1 %/с — ход спокойнее. У мификов и божественной сопротивление подбирается уже со способностью.
//
// node tools/fish/isle-reel.ts all [план острова .json] [выход .json] — всё (виды параллельно), по умолчанию
//   docs/superpowers/plans/2026-10-10-fishing-island.json → docs/superpowers/plans/2026-10-10-fishing-island-reel.json
// node tools/fish/isle-reel.ts species <id> [план острова .json] — один вид (строка JSON)
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { T_DIVINE, T_LEGEND, T_MYTH } from '../../shared/fishrules.ts';
import type { AbilitySpec } from '../../shared/fishreel.ts';
import { ISLE_ABILITY } from '../../shared/fishability.ts';
import { EXPERT, TYPICAL } from '../../test/fishbot.ts';
import { stats2 } from './abilitybot.ts';
import { ISLE_PLACE, ISLE_TUNE, ISLE_WARY, ISLE_WARY_HOLD, isleGear, isleMods, isleStyle, loadIsleSpecies, type IsleOpts, type IsleSpecies } from './islestyle.ts';

const root = resolve(import.meta.dirname, '../..');
const section = process.argv[2] ?? 'all';
/** Цель «обычного» 10-го уровня по категориям (без способности) и со способностью */
const TARGET = [0.98, 0.9, 0.8, 0.7, 0.62];
const TARGET_DIVINE = 0.62;
const TARGET_AB_MYTH = 0.55;
const TARGET_AB_DIVINE = 0.5;
const LV = [6, 8, 10, 15] as const;
const N_CAL = Number(process.env.N_CAL ?? 200);
const N = Number(process.env.N ?? 400);

const seedOf = (i: number) => 7 + (200 + i) * 7919;
const pc = (x: number) => Math.round(x * 100);

function rate(s: IsleSpecies, i: number, level: number, o: IsleOpts, n: number, skill = TYPICAL): number {
  return stats2(isleStyle(s, isleMods(level), o), skill, n, seedOf(i)).p;
}

/** Самое злое сопротивление (до места), при котором «обычный» 10-го уровня ещё держит цель */
function calDrain(s: IsleSpecies, i: number, target: number, o: IsleOpts): number | null {
  if (rate(s, i, 10, { ...o, drain: 1 }, N_CAL) < target) return null;
  let lo = 1, hi = 150;
  if (rate(s, i, 10, { ...o, drain: hi }, N_CAL) >= target) return hi;
  for (let k = 0; k < 10; k++) { const d = (lo + hi) / 2; if (rate(s, i, 10, { ...o, drain: d }, N_CAL) >= target) lo = d; else hi = d; }
  return Math.round(lo * 100) / 100;
}

function oneSpecies(s: IsleSpecies, i: number): Record<string, unknown> {
  const divine = s.tier === T_DIVINE;
  const big = s.tier === T_MYTH || divine;
  // Мифик и божественная: сопротивление — под цель СО способностью (55 / 50 %), сила способности — по замыслу (ISLE_ABILITY).
  // Подобрать обе цели сразу (без способности 62 и с ней 55) не выходит: у хлыста и пелены уже снятый «последний рывок»
  // стоит 5–26 п. п. (для их паттернов он был передышкой) — ручка силы не опускается до цели. Без способности — для сравнения.
  const ability: AbilitySpec | undefined = big ? ISLE_ABILITY[s.id] : undefined;
  const target = ability ? (divine ? TARGET_AB_DIVINE : TARGET_AB_MYTH) : divine ? TARGET_DIVINE : TARGET[s.tier];
  // не достаёт цели и при 1 %/с — ход спокойнее
  let move = ISLE_TUNE[s.id]?.move ?? 1;
  let drain: number | null = null;
  for (let k = 0; k < 8 && drain === null; k++) {
    drain = calDrain(s, i, target, { move, ...(ability ? { ability } : { noAbility: true }) });
    if (drain === null) move = Math.round(move * 0.9 * 1000) / 1000;
  }
  if (drain === null) throw new Error(`${s.id}: цель недостижима`);
  const base: IsleOpts = { drain, move };
  const knobNote = '';
  const final: IsleOpts = { ...base, ...(ability ? { ability } : {}) };
  // 3. таблица: «обычный» / «опытный» на ур. 6/8/10/15 (снаряжение острова), длина боя, после способности, кемпер
  const succ: Record<string, [number, number]> = {};
  let fightS = 0, after = 0, fired = 0;
  for (const l of LV) {
    const st = isleStyle(s, isleMods(l), final);
    const t = stats2(st, TYPICAL, N, seedOf(i)), e = stats2(st, EXPERT, N, seedOf(i));
    succ[`lvl${l}`] = [pc(t.p), pc(e.p)];
    if (l === 10) { fightS = Math.round(t.caughtS * 10) / 10; after = pc(t.pAfter); fired = pc(t.fired); }
  }
  const st10 = isleStyle(s, isleMods(10), final);
  const noAb = big ? [pc(rate(s, i, 10, { ...base, noAbility: true }, N)), pc(rate(s, i, 10, { ...base, noAbility: true }, N, EXPERT))] : null;
  const campBottom = pc(stats2(st10, EXPERT, 200, seedOf(i), { camp: 1 }).p);
  const campTop = pc(stats2(st10, EXPERT, 200, seedOf(i), { camp: -1 }).p);
  return {
    id: s.id, name: s.name, tier: s.tier, when: s.when, pat: s.pat, lo: s.lo, hi: s.hi, up: s.up,
    cal: { spd: +(s.cal[0] * move).toFixed(2), dartSpd: +(s.cal[1] * move).toFixed(2), amp: +(s.cal[2] * move).toFixed(2), drain, per: s.cal[4] },
    calEstimateDrain: s.cal[3], move,
    ...(ability ? { ability, abilityNote: knobNote || undefined } : {}),
    success: succ, ...(noAb ? { lvl10NoAbility: noAb } : {}),
    fightS10: fightS, ...(ability ? { afterAbility10: after, fired10: fired } : {}),
    camp10: { bottom: campBottom, top: campTop },
    wary: s.tier >= T_LEGEND ? ISLE_TUNE[s.id]?.wary ?? ISLE_WARY : 0,
    waryHold: s.tier >= T_LEGEND ? ISLE_WARY_HOLD : 0,
  };
}

const islePath = (k: number) => resolve(process.argv[k] ?? resolve(root, 'docs/superpowers/plans/2026-10-10-fishing-island.json'));

if (section === 'species') {
  const all = loadIsleSpecies(islePath(4));
  const i = all.findIndex((s) => s.id === process.argv[3]);
  if (i < 0) throw new Error(`нет вида ${process.argv[3]}`);
  console.log(JSON.stringify(oneSpecies(all[i], i)));
}

if (section === 'all') {
  const src = islePath(3);
  const out = resolve(process.argv[4] ?? resolve(root, 'docs/superpowers/plans/2026-10-10-fishing-island-reel.json'));
  const all = loadIsleSpecies(src);
  const rows: Record<string, unknown>[] = new Array(all.length);
  const pool = Math.max(2, Math.min(8, cpus().length - 2));
  let next = 0;
  const work = async () => {
    while (next < all.length) {
      const i = next++;
      rows[i] = await new Promise((res, rej) => {
        const p = spawn(process.execPath, [import.meta.filename, 'species', all[i].id, src], { stdio: ['ignore', 'pipe', 'inherit'] });
        let t = '';
        p.stdout.on('data', (d) => { t += d; });
        p.on('close', (code) => (code === 0 ? res(JSON.parse(t)) : rej(new Error(`${all[i].id}: ${code}`))));
      });
      console.error(`готово: ${all[i].id}`);
    }
  };
  await Promise.all(Array.from({ length: pool }, work));
  const abilities: Record<string, unknown> = {};
  for (const r of rows) if (r.ability) abilities[r.id as string] = r.ability;
  const json = {
    doc: 'docs/superpowers/plans/2026-10-10-fishing-abilities.md',
    source: '2026-10-10-fishing-island.json — species: паттерны, место на шкале, ход (calEstimate)',
    date: '2026-10-10',
    note: 'Шкала видов острова по новым правилам 10.10 (зона +1,5 %/ур., бонусы уровня, мифик и божественная — 120 % времени в зоне и способность вместо «последнего рывка»). cal — как CAL в shared/fishrules.ts: скорость %/с, рывок %/с, размах %, сопротивление %/с ДО места, цикл (тики). success — «обычный»/«опытный», %, N=400, снаряжение острова. Подобрано tools/fish/isle-reel.ts.',
    rules: {
      place: { ...ISLE_PLACE, divine: 'место не трогает' },
      gear: Object.fromEntries(LV.map((l) => [`lvl${l}`, isleGear(l)])),
      targetsTypicalLvl10: { common: 98, rare: 90, epic: 80, legend: 70, mythWithAbility: 55, divineWithAbility: 50, note: 'мифик и божественная — сопротивление под цель со способностью; «без способности 62 %» одновременно не выходит (снятый «последний рывок» у хлыста и пелены сам стоит 5–26 п. п.), lvl10NoAbility — для сравнения' },
      fillBig: 120, wary: `легенды, мифики и божественная: зона у края без рыбы ${ISLE_WARY} тиков (${Object.entries(ISLE_TUNE).filter(([, t]) => t.wary).map(([id, t]) => `${id} — ${t.wary}`).join(', ')}) или ${ISLE_WARY_HOLD} тиков подряд с рыбой или без (waryHold) — рыба обходит зону`, campBottomMax: 'легенды и выше: кемпер у дна ≤ 5 % (опытный, ур. 10, N=200)',
      tune: ISLE_TUNE, bot: 'test/fishbot.ts TYPICAL/EXPERT + tools/fish/abilitybot.ts',
    },
    abilities,
    species: rows,
  };
  writeFileSync(out, JSON.stringify(json, null, 1) + '\n');
  const line = (r: Record<string, unknown>) => {
    const s = r.success as Record<string, [number, number]>;
    const c = r.cal as Record<string, number>;
    return `${String(r.id).padEnd(13)} t${r.tier} drain ${String(c.drain).padStart(6)} (было ${r.calEstimateDrain}) ход ×${r.move} · ${LV.map((l) => `ур.${l} ${s[`lvl${l}`].join('/')}`).join(' · ')}` +
      `${r.lvl10NoAbility ? ` · без способности ${(r.lvl10NoAbility as number[]).join('/')}` : ''} · бой ${r.fightS10} с · кемпер ${(r.camp10 as { bottom: number; top: number }).bottom}/${(r.camp10 as { bottom: number; top: number }).top}` +
      `${r.ability ? ` · ${JSON.stringify(r.ability)}${r.abilityNote ? ' ' + r.abilityNote : ''}` : ''}`;
  };
  console.log(rows.map(line).join('\n'));
  console.log(`→ ${out}`);
}
