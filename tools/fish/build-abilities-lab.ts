// Собирает самодостаточную страницу-прототип способностей мификов (10.10): модель шкалы — та же, что в игре
// (shared/fishreel.ts без типов), манеры рыб — reelStyle2 по уровням 0–15 с типичным снаряжением уровня.
// Запуск: node tools/fish/build-abilities-lab.ts [куда] (по умолчанию lab/fishing-abilities/index.html)
import { stripTypeScriptTypes } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { FISH } from '../../shared/fishing.ts';
import { RULE } from '../../shared/fishrules.ts';
import { FISH_XP_LEVELS, emptyFishProgress, fishCastMods, RODS } from '../../shared/fishprogress.ts';
import { LURES } from '../../shared/fishshop.ts';
import { LEVEL_PERKS, SPECIES_ABILITY, TEETH_EXAMPLE, levelBonus, reelStyle2, spById, zoneScale2 } from '../../shared/fishability.ts';

const root = resolve(import.meta.dirname, '../..');
const out = resolve(process.argv[2] ?? resolve(root, 'lab/fishing-abilities/index.html'));

let engine = stripTypeScriptTypes(readFileSync(resolve(root, 'shared/fishreel.ts'), 'utf8'));
engine = engine.replace(/^export /gm, '');

/** Типичное снаряжение уровня (как в таблицах документа): удочка и блесна */
function gear(level: number): { rod: number; lure: number } {
  const g = level >= 15 ? 4 : level >= 10 ? 3 : level >= 5 ? 2 : level >= 1 ? 1 : 0;
  return { rod: g, lure: g };
}

const FISHES = [
  { key: 'whiteshark', id: 'whiteshark', name: 'Акула-молот', tier: 'myth' },
  { key: 'greenlandshark', id: 'greenlandshark', name: 'Гренландская акула', tier: 'myth' },
  { key: 'oarfish', id: 'oarfish', name: 'Сельдяной король', tier: 'myth' },
  { key: 'kalmar', id: 'kalmar', name: 'Кальмар', tier: 'divine' },
  { key: 'teeth', id: 'whiteshark', name: 'Острые зубы', tier: 'divine' },
] as const;

const fish: Record<string, unknown> = {};
for (const f of FISHES) {
  const sp = spById(f.id);
  const styles = [];
  for (let level = 0; level <= 15; level++) {
    const { rod, lure } = gear(level);
    const mods = fishCastMods({ ...emptyFishProgress(), xp: FISH_XP_LEVELS[level], questsDone: [0, 1, 5, 10, 15][rod], rod: rod as 0, lure: lure as 0 }, 0, RULE[sp]!.zone);
    const st = reelStyle2(sp, mods, f.key === 'teeth' ? { ability: TEETH_EXAMPLE } : {});
    styles.push({ ...st, zoneBase: RULE[sp]!.style.zone, zoneMul: zoneScale2(mods) });
  }
  fish[f.key] = { name: f.name, tier: f.tier, ability: f.key === 'teeth' ? 'teeth' : SPECIES_ABILITY[f.id].id, styles, sea: RULE[sp]!.zone === 'barkas' };
}

const levels = [];
for (let level = 0; level <= 15; level++) {
  const { rod, lure } = gear(level);
  levels.push({ level, rod: RODS[rod].name, lure: lure ? LURES[lure - 1].name : 'без блесны', bonus: levelBonus(level), xp: FISH_XP_LEVELS[level] });
}

const data = { fish, levels, perks: LEVEL_PERKS, built: new Date().toISOString().slice(0, 10) };
const tpl = readFileSync(resolve(import.meta.dirname, 'abilities-lab.template.html'), 'utf8');
const html = tpl.replace('/*__ENGINE__*/', () => engine).replace('/*__DATA__*/', () => `const DATA = ${JSON.stringify(data)};`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024).toFixed(0)} КБ`);
void FISH;
