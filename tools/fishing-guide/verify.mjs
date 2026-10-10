// Сверка калькулятора (public/fishing/app.js) с кодом игры (tierOdds + fishCastMods) на всех сочетаниях.
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../../', import.meta.url)); // корень репозитория
const fr = await import(ROOT + 'shared/fishrules.ts');
const fp = await import(ROOT + 'shared/fishprogress.ts');
const calc = vm.runInNewContext(fs.readFileSync(ROOT + 'public/fishing/app.js', 'utf8') + '\nFishCalc', {});
let n = 0, maxd = 0, exact = 0;
// уровни — до последнего, на котором ещё растёт шанс (15); выше таблицы опыта — тот же снимок с этим уровнем
const XP_TOP = fp.FISH_XP_LEVELS.length - 1;
for (const zone of ['pier', 'barkas', 'isle']) for (let weather = 0; weather <= 2; weather++) for (let level = 0; level <= fp.LEVEL_ODDS_MAX; level++)
  for (let rod = 0; rod <= 4; rod++) for (let lure = 0; lure <= 4; lure++) for (let drink = 0; drink <= 4; drink++) {
    const now = 1_000_000;
    const p = { ...fp.emptyFishProgress(), xp: fp.FISH_XP_LEVELS[Math.min(level, XP_TOP)], questsDone: [0, 1, 5, 10, 15][rod], rod, lure };
    if (drink === 1) p.beerUntil = now + 1; if (drink === 2) p.aleUntil = now + 1; if (drink === 3) p.lordUntil = now + 1; if (drink === 4) p.vodkaUntil = now + 1;
    let m = fp.fishCastMods(p, now, zone);
    if (m.level !== level) m = { ...m, level, rareMultiplier: fp.levelOdds(level) * fp.rodOdds(rod) * (fp.drinkOf(drink)?.rare ?? 1) };
    if (m.level !== level || m.rod !== rod || m.drink !== drink || m.lure !== lure) throw new Error('mods mismatch');
    const want = fr.tierOdds(weather > 0, m, weather === 2);
    const got = calc.odds({ zone, weather, level, rod, lure, drink }).p;
    let same = true;
    for (let k = 0; k < 8; k++) { const d = Math.abs(want[k] - got[k]); maxd = Math.max(maxd, d); if (want[k] !== got[k]) same = false; }
    if (Math.abs(got.reduce((a, b) => a + b, 0) - 1) > 1e-12) throw new Error('sum != 1');
    n++; if (same) exact++;
  }
console.log(`сочетаний: ${n}, бит в бит: ${exact}, макс. расхождение: ${maxd}`);
process.exit(0);
