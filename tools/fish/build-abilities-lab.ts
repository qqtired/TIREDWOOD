// Собирает самодостаточную страницу-прототип способностей мификов (10.10): модель шкалы — та же, что в игре
// (shared/fishreel.ts без типов), манеры рыб — reelStyle2 по уровням 0–15 с типичным снаряжением уровня; рыбы острова —
// isleStyle (tools/fish/islestyle.ts) с цифрами из docs/superpowers/plans/2026-10-10-fishing-island-reel.json.
// Запуск: node tools/fish/build-abilities-lab.ts [куда] (по умолчанию lab/fishing-abilities/index.html)
import { stripTypeScriptTypes } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BAND, RULE, T_DIVINE, ZONE_BASE, tierRank } from '../../shared/fishrules.ts';
import { FISH_XP_LEVELS, emptyFishProgress, fishCastMods, RODS } from '../../shared/fishprogress.ts';
import { LURES } from '../../shared/fishshop.ts';
import { LEVEL_PERKS, SPECIES_ABILITY, levelBonus, reelStyle2, spById, zoneScale2 } from '../../shared/fishability.ts';
import { ISLE_PLACE, isleGear, isleMods, isleStyle, type IsleSpecies } from './islestyle.ts';

const root = resolve(import.meta.dirname, '../..');
const out = resolve(process.argv[2] ?? resolve(root, 'lab/fishing-abilities/index.html'));
const reelJson = resolve(process.env.ISLE_REEL ?? resolve(root, 'docs/superpowers/plans/2026-10-10-fishing-island-reel.json'));

let engine = stripTypeScriptTypes(readFileSync(resolve(root, 'shared/fishreel.ts'), 'utf8'));
engine = engine.replace(/^export /gm, '');

/** Типичное снаряжение уровня (как в таблицах документа): удочка и блесна */
function gear(level: number): { rod: number; lure: number } {
  const g = level >= 15 ? 4 : level >= 10 ? 3 : level >= 5 ? 2 : level >= 1 ? 1 : 0;
  return { rod: g, lure: g };
}
const gearText = (g: { rod: number; lure: number }) => ({ rod: RODS[g.rod].name, lure: g.lure ? LURES[g.lure - 1].name : 'без блесны' });

const MAIN = [
  { key: 'whiteshark', name: 'Рыба-молот', tier: 'myth' },
  { key: 'greenlandshark', name: 'Гренландская акула', tier: 'myth' },
  { key: 'oarfish', name: 'Сельдяной король', tier: 'myth' },
  { key: 'kalmar', name: 'Кальмар', tier: 'divine' },
] as const;

const fish: Record<string, unknown> = {};
for (const f of MAIN) {
  const sp = spById(f.key);
  const styles = [];
  const gears = [];
  for (let level = 0; level <= 15; level++) {
    const { rod, lure } = gear(level);
    const mods = fishCastMods({ ...emptyFishProgress(), xp: FISH_XP_LEVELS[level], questsDone: [0, 1, 5, 10, 15][rod], rod: rod as 0, lure: lure as 0 }, 0, RULE[sp]!.zone);
    const st = reelStyle2(sp, mods);
    styles.push({ ...st, zoneBase: RULE[sp]!.style.zone, zoneMul: zoneScale2(mods) });
    gears.push(gearText({ rod, lure }));
  }
  fish[f.key] = { name: f.name, tier: f.tier, ability: SPECIES_ABILITY[f.key].id, styles, gears, sea: RULE[sp]!.zone === 'barkas' };
}

// остров: четыре рыбы со способностями
type IsleRow = IsleSpecies & { cal: { spd: number; dartSpd: number; amp: number; drain: number; per: number }; ability: { id: string }; success: Record<string, [number, number]>; lvl10NoAbility?: [number, number]; fightS10: number };
const isle = JSON.parse(readFileSync(reelJson, 'utf8')) as { species: IsleRow[] };
for (const id of ['beluga', 'thresher', 'baskingshark', 'frilledshark']) {
  const row = isle.species.find((s) => s.id === id);
  if (!row) throw new Error(`нет ${id} в ${reelJson}`);
  const spec: IsleSpecies = { ...row, cal: [row.cal.spd, row.cal.dartSpd, row.cal.amp, row.cal.drain, row.cal.per] };
  const styles = [];
  const gears = [];
  const divine = row.tier === T_DIVINE;
  for (let level = 0; level <= 15; level++) {
    const mods = isleMods(level);
    const st = isleStyle(spec, mods, { move: 1 });
    styles.push({ ...st, zoneBase: BAND[tierRank(row.tier)].zone * ZONE_BASE * (divine ? 1 : ISLE_PLACE.zone), zoneMul: zoneScale2(mods) });
    gears.push(gearText(isleGear(level)));
  }
  const s = row.success;
  const stats = [
    [6, '—', s.lvl6.join('/')], [8, '—', s.lvl8.join('/')], [10, row.lvl10NoAbility ? row.lvl10NoAbility.join('/') : '—', s.lvl10.join('/')], [15, '—', s.lvl15.join('/')],
  ];
  fish[id] = { name: row.name, tier: divine ? 'divine' : 'myth', ability: row.ability.id, styles, gears, isle: true, stats, fightS10: row.fightS10 };
}

const levels = [];
for (let level = 0; level <= 15; level++) levels.push({ level, ...gearText(gear(level)), bonus: levelBonus(level), xp: FISH_XP_LEVELS[level] });

const data = { fish, levels, perks: LEVEL_PERKS, built: new Date().toISOString().slice(0, 10) };
const tpl = readFileSync(resolve(import.meta.dirname, 'abilities-lab.template.html'), 'utf8');
const html = tpl.replace('/*__ENGINE__*/', () => engine).replace('/*__DATA__*/', () => `const DATA = ${JSON.stringify(data)};`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024).toFixed(0)} КБ`);
