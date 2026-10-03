// Прогон модели экономики «Крепости» (агент arsenal) против директора волн. Подробности — model.ts.
//   node tools/fort-balance/run.ts                        эталонный директор, трое
//   node tools/fort-balance/run.ts --players 4            другой состав
//   node tools/fort-balance/run.ts --director путь.ts     свой директор: модуль экспортирует director (или default)
//                                                         типа Director из model.ts — пример: currentDirector
//   node tools/fort-balance/run.ts --director current     нынешний директор из shared/fort.ts
//   --skill master  — подробная таблица одного; --waves 300; --rows 1,10,30
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { GUNS, TOWERS, killBounty } from '../../shared/fortarsenal.ts';
import {
  LOAD_TOLERANCE, SKILLS, TARGET_WALLS, baseLoad, checkLoad, currentDirector, fitHpScale, killsOf, loadOf, simulate, startCapital, targetDirector,
  type Director,
} from './model.ts';

const { values: opt } = parseArgs({
  options: {
    players: { type: 'string', default: '3' },
    director: { type: 'string', default: 'target' },
    waves: { type: 'string', default: '300' },
    skill: { type: 'string', default: 'all' },
    rows: { type: 'string', default: '1,2,3,5,10,15,20,25,30,40,50,60,80,100,150,200,250,300' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});
if (opt.help) {
  console.log('node tools/fort-balance/run.ts [--players 3] [--director target|current|путь.ts] [--skill all|newbie|experienced|master] [--waves 300] [--rows 1,10,30]');
  process.exit(0);
}

const n = Math.max(1, Math.round(Number(opt.players)));
const waves = Math.max(1, Math.round(Number(opt.waves)));
const rows = new Set(opt.rows.split(',').map(Number));
let director: Director = targetDirector;
if (opt.director === 'current') director = currentDirector;
else if (opt.director !== 'target') {
  const mod = (await import(pathToFileURL(resolve(opt.director)).href)) as { director?: Director; default?: Director };
  const d = mod.director ?? mod.default;
  if (typeof d !== 'function') throw new Error(`${opt.director}: нет экспорта director (или default) типа Director`);
  director = d;
}

const f0 = (v: number) => Math.round(v).toLocaleString('ru-RU');
const f2 = (v: number) => v.toFixed(2);
const range = (lo: number, hi: number) => (lo < hi ? `k ∈ (${f2(lo)}; ${f2(hi)}]` : 'k — нет');
const pad = (s: string | number, w: number) => String(s).padStart(w);

console.log(`\nКрепость: модель экономики · директор ${opt.director} · защитников ${n} · волн ${waves}\n`);

console.log(`Нагрузка (HP волны на защитника в секунду её выхода) в разах к 1-й волне — цель ±${LOAD_TOLERANCE * 100} %:`);
console.log(`${pad('волна', 6)} ${pad('цель', 7)} ${pad('директор', 9)} ${pad('убитых/чел', 11)}`);
for (const c of checkLoad(director, n)) {
  const w = director(c.wave, n);
  console.log(`${pad(c.wave, 6)} ${pad(c.want, 7)} ${pad(c.got.toFixed(1), 9)} ${pad(killsOf(w, c.wave, n).toFixed(1), 11)}  ${c.ok ? 'да' : 'НЕТ'}`);
}
const l1 = loadOf(director(1, n), n);
console.log(`\nАбсолют 1-й волны: ${l1.toFixed(1)} HP/с на защитника; модель ждёт ≈ ${baseLoad(n).toFixed(1)} (×${(baseLoad(n) / l1).toFixed(2)}).`);
const fit = fitHpScale(director, n, waves);
if (fit.lo < fit.hi) console.log(`Все стены в целях при HP врагов × k, k ∈ (${f2(fit.lo)}; ${f2(fit.hi)}] — середина ×${f2(Math.sqrt(Math.max(fit.lo, 1e-6) * fit.hi))}.`);
else console.log(`Одним множителем HP все стены в цели не уложить: k для каждого — ниже.`);

console.log('\nГде упираются (первая волна, которую не удержать; 301 — прошли все):');
for (const key of Object.keys(SKILLS) as (keyof typeof SKILLS)[]) {
  const e = fit.each[key];
  const [a, b] = TARGET_WALLS[key];
  const ok = e.wall >= a && e.wall <= b;
  console.log(`  ${SKILLS[key].name.padEnd(9)} ${pad(e.wall, 4)}   цель ${a}–${b > waves ? 'конец' : b}  ${ok ? 'да' : 'НЕТ'}   ${range(e.lo, e.hi)}`);
}

const towerName = (t: number) => (t < 0 ? '·' : TOWERS[t].name.slice(0, 4));
for (const key of Object.keys(SKILLS) as (keyof typeof SKILLS)[]) {
  if (opt.skill !== 'all' && opt.skill !== key) continue;
  const s = SKILLS[key];
  const run = simulate(director, n, s, waves);
  console.log(`\n${s.name}: меткость ${s.accuracy}, головы ${s.heads}, у прицела ${s.uptime}, толпа ${s.crowd}, тратит ${s.spend}, ${s.buyer === 'greedy' ? 'покупает лучшее' : 'покупает что дешевле'}`);
  console.log(`${pad('W', 4)} ${pad('+N', 4)} ${pad('доход', 8)} ${pad('всего', 10)} ${pad('урон/темп/маг/крит/подс', 24)} ${pad('ствол', 9)}  ${'башни'.padEnd(26)} ${pad('свой', 7)} ${pad('башни', 7)} ${pad('гран', 5)} ${pad('запас', 6)} покупок`);
  for (const r of run.rows) {
    if (!rows.has(r.wave)) continue;
    const gun = r.gun >= 0 ? GUNS[r.gun].name : '—';
    const towers = r.slots.map((t) => (t.type < 0 ? '·' : `${towerName(t.type)}${t.level}`)).join(' ');
    console.log(`${pad(r.wave, 4)} ${pad(r.popup, 4)} ${pad(f0(r.income), 8)} ${pad(f0(r.earned), 10)} ${pad(r.lv.join('/'), 24)} ${pad(gun, 9)}  ${towers.padEnd(26)} ${pad(f0(r.power.player), 7)} ${pad(f0(r.power.towers), 7)} ${pad(f0(r.power.grenades), 5)} ${pad(f2(r.margin), 6)} ${r.buys}`);
  }
}

console.log('\nСтартовый капитал, если начинать с волны W (контрольных точек нет, формула — на будущее): ');
console.log('  ' + [1, 10, 20, 30, 50, 80, 100, 150, 200, 300].filter((w) => w <= waves).map((w) => `W${w}: ${f0(startCapital(w, director, n))}`).join(' · '));
console.log(`\n«+N» стрелку за шаркуна: W1 ${killBounty(0, 1)}, W100 ${killBounty(0, 100)}, W300 ${killBounty(0, 300)}.\n`);
