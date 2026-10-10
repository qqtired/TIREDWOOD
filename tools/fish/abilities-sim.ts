// Симуляции к дизайну способностей рыбалки (10.10, прототип): node tools/fish/abilities-sim.ts <раздел> [N=…]
// Разделы: check (бот способностей без способности = старый бот бит в бит), table (до/после по уровням 0/5/10/15),
// kalmar (варианты против «жду внизу»), wind (сетка силы и длительности), herring (селёдки), breach (разлом),
// camp (кемперы у дна и верха), perks (что даёт каждый бонус уровня), teeth (пример каркаса). Цифры — в документе
// docs/superpowers/plans/2026-10-10-fishing-abilities.md. Модели игроков — test/fishbot.ts и tools/fish/abilitybot.ts.
import { FISH } from '../../shared/fishing.ts';
import { COLLECTION, RULE, T_COMMON, T_EPIC, T_LEGEND, T_RARE, reelStyleFor } from '../../shared/fishrules.ts';
import { FISH_XP_LEVELS, emptyFishProgress, fishCastMods, type FishCastMods, type FishProgress } from '../../shared/fishprogress.ts';
import { reelStart, reelRun, type AbilitySpec, type ReelStyle } from '../../shared/fishreel.ts';
import { HERRING, SPECIES_ABILITY, TEETH_EXAMPLE, levelBonus, reelStyle2, spById, type Style2Opts } from '../../shared/fishability.ts';
import { AFK, EXPERT, TYPICAL, playReel, type Skill } from '../../test/fishbot.ts';
import { playReel2, stats2, type Opts2 } from './abilitybot.ts';

const N = Number(process.env.N ?? 300);
const section = process.argv[2] ?? 'table';

/** Типичная экипировка уровня: ур. 0 — ничего; 5 — удочка 2 и серебро; 10 — удочка 3 и золото; 15 — легендарная и платина */
const LEVELS: ReadonlyArray<readonly [number, number, number]> = [[0, 0, 0], [5, 2, 2], [10, 3, 3], [15, 4, 4]];

function progress(level: number, rod: number, lure: number): FishProgress {
  return { ...emptyFishProgress(), xp: FISH_XP_LEVELS[level], questsDone: [0, 1, 5, 10, 15][rod], rod: rod as 0, lure: lure as 0 };
}

function modsFor(sp: number, level: number, rod: number, lure: number): FishCastMods {
  return fishCastMods(progress(level, rod, lure), 0, RULE[sp]!.zone);
}

const pct = (x: number) => `${Math.round(x * 100)}`;
const seedOf = (sp: number) => 11 + sp * 7919;

function rate(style: ReelStyle, skill: Skill, sp: number, n = N, o: Opts2 = {}): number {
  return stats2(style, skill, n, seedOf(sp), o).p;
}

// ------------------------------------------------------------ check
if (section === 'check') {
  let same = 0, all = 0;
  for (const sp of COLLECTION) {
    const st = reelStyleFor(sp, modsFor(sp, 5, 2, 2));
    for (let i = 0; i < 20; i++) {
      const seed = (sp * 7 + i * 2654435761) | 0;
      for (const sk of [TYPICAL, EXPERT]) {
        const a = playReel(st, seed, sk);
        const b = playReel2(st, seed, sk);
        all++;
        if (a.caught === b.caught && a.ticks === b.ticks && a.err === b.err && a.toggles.join() === b.toggles.join()) same++;
      }
    }
  }
  // и повтор сервера по нажатиям бота со способностями: тот же итог
  let replay = 0, rall = 0;
  for (const id of Object.keys(SPECIES_ABILITY)) {
    const sp = spById(id);
    const st = reelStyle2(sp, modsFor(sp, 10, 3, 3));
    for (let i = 0; i < 100; i++) {
      const seed = (sp * 13 + i * 2654435761) | 0;
      const pl = playReel2(st, seed, i % 2 ? EXPERT : TYPICAL);
      const r = reelStart(st, seed);
      reelRun(r, pl.toggles, 1e9);
      rall++;
      if ((r.done === 1) === pl.caught && r.t === pl.ticks && r.err === pl.err) replay++;
    }
  }
  console.log(`бот способностей = старый бот: ${same}/${all}; повтор по нажатиям = игра: ${replay}/${rall}`);
}

// ------------------------------------------------------------ table: до и после
interface Group { name: string; sps: number[] }

function groups(): Group[] {
  const pier = (tier: number) => COLLECTION.filter((sp) => RULE[sp]!.tier === tier && RULE[sp]!.zones.includes('pier'));
  return [
    { name: 'обычные', sps: pier(T_COMMON) },
    { name: 'редкие', sps: pier(T_RARE) },
    { name: 'эпические', sps: pier(T_EPIC) },
    { name: 'легенды', sps: pier(T_LEGEND) },
    { name: 'акула-молот', sps: [spById('whiteshark')] },
    { name: 'гренл. акула', sps: [spById('greenlandshark')] },
    { name: 'сельд. король', sps: [spById('oarfish')] },
    { name: 'кальмар', sps: [spById('kalmar')] },
  ];
}

function groupRate(g: Group, level: number, rod: number, lure: number, skill: Skill, after: boolean, o: Style2Opts = {}, n = N): number {
  let s = 0;
  for (const sp of g.sps) {
    const m = modsFor(sp, level, rod, lure);
    const st = after ? reelStyle2(sp, m, o) : reelStyleFor(sp, m);
    s += rate(st, skill, sp, n);
  }
  return s / g.sps.length;
}

if (section === 'table') {
  const n = Number(process.env.N ?? 300);
  console.log(`успех «обычный» / «опытный», % (N=${n} на вид; ур. 0 — без снаряжения, 5 — удочка 2 + серебро, 10 — удочка 3 + золото, 15 — легендарная + платина)`);
  console.log('| группа | ' + LEVELS.map(([l]) => `ур. ${l} до → после`).join(' | ') + ' |');
  for (const g of groups()) {
    const n2 = g.sps.length > 1 ? Math.max(100, Math.round(n / 2)) : n * 2;
    const cells = LEVELS.map(([l, rod, lure]) => {
      const bt = groupRate(g, l, rod, lure, TYPICAL, false, {}, n2), be = groupRate(g, l, rod, lure, EXPERT, false, {}, n2);
      const at = groupRate(g, l, rod, lure, TYPICAL, true, {}, n2), ae = groupRate(g, l, rod, lure, EXPERT, true, {}, n2);
      return `${pct(bt)}/${pct(be)} → **${pct(at)}/${pct(ae)}**`;
    });
    console.log(`| ${g.name} | ${cells.join(' | ')} |`);
  }
}

// ------------------------------------------------------------ steps: из чего сложилось «после» (мифики и божественная)
if (section === 'steps') {
  const n = Number(process.env.N ?? 600);
  for (const g of groups().slice(4)) {
    const sp = g.sps[0];
    const rows: string[] = [];
    for (const [l, rod, lure] of LEVELS) {
      const m = modsFor(sp, l, rod, lure);
      const old = reelStyleFor(sp, m);
      const zoneOnly = reelStyle2(sp, m, { noPerks: true, noAbility: true });
      // без способности и без «последнего рывка»? — нет: зона +1,5 % и 120 % времени, рывок остаётся
      const time = { ...zoneOnly };
      const withAb = reelStyle2(sp, m, { noPerks: true });
      const full = reelStyle2(sp, m);
      const f = (st: ReelStyle) => `${pct(rate(st, TYPICAL, sp, n))}/${pct(rate(st, EXPERT, sp, n))}`;
      rows.push(`ур.${l}: было ${f(old)} · зона+время ${f(time)} · +способность ${f(withAb)} · +бонусы уровня ${f(full)}`);
    }
    console.log(g.name.padEnd(14), rows.join('\n               '));
  }
}

// ------------------------------------------------------------ kalmar: варианты против «жду внизу»
if (section === 'kalmar') {
  const sp = spById('kalmar');
  const n = Number(process.env.N ?? 400);
  const variants: Array<[string, Style2Opts]> = [
    ['0 сейчас (Jet, без способности)', { noAbility: true, wary: 0 }],
    ['А замирание наверху (JetHang)', { noAbility: true, wary: 0, kalmarPattern: 'JetHang' }],
    ['Б чует ловушку (Jet + wary 1 с)', { noAbility: true, wary: 60 }],
    ['А+Б', { noAbility: true, wary: 60, kalmarPattern: 'JetHang' }],
    ['Б + чернила (итог)', { wary: 60 }],
    ['Б + чернила без выстрела', { wary: 60, ability: { ...SPECIES_ABILITY.kalmar, jet: false } }],
  ];
  for (const [name, o] of variants) {
    const cells: string[] = [];
    for (const [l, rod, lure] of [LEVELS[0], LEVELS[2], LEVELS[3]]) {
      const st = reelStyle2(sp, modsFor(sp, l, rod, lure), { noPerks: true, ...o });
      const t = stats2(st, TYPICAL, n, seedOf(sp));
      const e = stats2(st, EXPERT, n, seedOf(sp));
      const cb = stats2(st, TYPICAL, n, seedOf(sp), { camp: 1 });
      const ct = stats2(st, TYPICAL, n, seedOf(sp), { camp: -1 });
      cells.push(`ур.${l}: ${pct(t.p)}/${pct(e.p)} (${t.caughtS.toFixed(0)} с) · дно ${pct(cb.p)}${cb.p ? ` (${cb.caughtS.toFixed(0)} с)` : ''} · верх ${pct(ct.p)}`);
    }
    console.log(name.padEnd(34), cells.join(' | '));
  }
}

// ------------------------------------------------------------ wind: сила × длительность
if (section === 'wind') {
  const sp = spById('greenlandshark');
  const n = Number(process.env.N ?? 600);
  const base = SPECIES_ABILITY.greenlandshark;
  console.log('ветер: успех «обычный»/«опытный» %, и успех после срабатывания (обычный), ур. 0 / 10 / 15');
  const ref = [LEVELS[0], LEVELS[2], LEVELS[3]].map(([l, rod, lure]) => {
    const st = reelStyle2(sp, modsFor(sp, l, rod, lure), { noPerks: true, noAbility: true });
    return `${pct(rate(st, TYPICAL, sp, n))}/${pct(rate(st, EXPERT, sp, n))}`;
  });
  console.log(`без ветра (зона+время): ${ref.join(' | ')}`);
  for (const force of [25, 35, 45]) {
    for (const sec of [4, 5, 6]) {
      const ab: AbilitySpec = { ...base, force, dur: sec * 60 };
      const cells = [LEVELS[0], LEVELS[2], LEVELS[3]].map(([l, rod, lure]) => {
        const st = reelStyle2(sp, modsFor(sp, l, rod, lure), { noPerks: true, ability: ab });
        const t = stats2(st, TYPICAL, n, seedOf(sp));
        const e = stats2(st, EXPERT, n, seedOf(sp));
        return `${pct(t.p)}/${pct(e.p)} (после ${pct(t.pAfter)})`;
      });
      console.log(`${force} % · ${sec} с: ${cells.join(' | ')}`);
    }
  }
}

// ------------------------------------------------------------ herring: селёдки
if (section === 'herring') {
  const sp = spById('oarfish');
  const n = Number(process.env.N ?? 600);
  const base = SPECIES_ABILITY.oarfish;
  const tries: Array<[string, AbilitySpec]> = [
    ['need 0,5 с, −1,5 %/с (итог)', base],
    ['need 0,5 с, −1 %/с', { ...base, rollback: 10 }],
    ['need 0,5 с, −2,5 %/с', { ...base, rollback: 25 }],
    ['need 0,75 с, −1,5 %/с', { ...base, need: 45 }],
    ['зона мини 26 %', { ...base, minion: { ...HERRING, zone: 26 } }],
    ['селёдка быстрее ×1,3', { ...base, minion: { ...HERRING, spd: HERRING.spd * 1.3, dartSpd: HERRING.dartSpd * 1.3 } }],
  ];
  const ref = [LEVELS[0], LEVELS[2], LEVELS[3]].map(([l, rod, lure]) => {
    const st = reelStyle2(sp, modsFor(sp, l, rod, lure), { noPerks: true, noAbility: true });
    return `${pct(rate(st, TYPICAL, sp, n))}/${pct(rate(st, EXPERT, sp, n))}`;
  });
  console.log(`без селёдок (зона+время): ${ref.join(' | ')}`);
  for (const [name, ab] of tries) {
    const cells = [LEVELS[0], LEVELS[2], LEVELS[3]].map(([l, rod, lure]) => {
      const st = reelStyle2(sp, modsFor(sp, l, rod, lure), { noPerks: true, ability: ab });
      const t = stats2(st, TYPICAL, n, seedOf(sp));
      const e = stats2(st, EXPERT, n, seedOf(sp));
      return `${pct(t.p)}/${pct(e.p)} · селёдки ${t.minionS.toFixed(1)}/${e.minionS.toFixed(1)} с, улов ${pct(t.pAt)}→${pct(t.pEnd)}%`;
    });
    console.log(name.padEnd(30), cells.join(' | '));
  }
  // AFK во время селёдок: сколько улова теряет и сколько ловится
  const st = reelStyle2(sp, modsFor(sp, 10, 3, 3), { noPerks: true });
  const afk = stats2(st, AFK, 200, seedOf(sp));
  console.log(`без рук: ${pct(afk.p)} %`);
}

// ------------------------------------------------------------ breach: разлом
if (section === 'breach') {
  const sp = spById('whiteshark');
  const n = Number(process.env.N ?? 600);
  const base = SPECIES_ABILITY.whiteshark;
  const ref = [LEVELS[0], LEVELS[2], LEVELS[3]].map(([l, rod, lure]) => {
    const st = reelStyle2(sp, modsFor(sp, l, rod, lure), { noPerks: true, noAbility: true });
    return `${pct(rate(st, TYPICAL, sp, n))}/${pct(rate(st, EXPERT, sp, n))}`;
  });
  console.log(`без разлома (зона+время): ${ref.join(' | ')}`);
  const tries: Array<[string, AbilitySpec]> = [
    ['12 с, размах ×1,25 (итог)', base],
    ['до конца боя', { ...base, dur: 0 }],
    ['8 с', { ...base, dur: 480 }],
    ['12 с, размах ×1,5', { ...base, ampMul: 150 }],
    ['12 с, размах ×1', { ...base, ampMul: 100 }],
    ['только вверх', { ...base, side: 1 }],
    ['только вниз', { ...base, side: -1 }],
  ];
  for (const [name, ab] of tries) {
    const cells = [LEVELS[0], LEVELS[2], LEVELS[3]].map(([l, rod, lure]) => {
      const st = reelStyle2(sp, modsFor(sp, l, rod, lure), { noPerks: true, ability: ab });
      const t = stats2(st, TYPICAL, n, seedOf(sp));
      const e = stats2(st, EXPERT, n, seedOf(sp));
      return `${pct(t.p)}/${pct(e.p)} (после ${pct(t.pAfter)}, бой после ${t.afterS.toFixed(1)} с)`;
    });
    console.log(name.padEnd(26), cells.join(' | '));
  }
}

// ------------------------------------------------------------ camp: кемперы и «без рук» по новым правилам
if (section === 'camp') {
  const n = Number(process.env.N ?? 300);
  // кемпер — «опытный» (точно подматывает, редко отвлекается): это худший случай
  const CAMPER = process.env.CAMPER === 'typical' ? TYPICAL : EXPERT;
  for (const id of ['whiteshark', 'greenlandshark', 'oarfish', 'kalmar', 'sturgeon', 'angler']) {
    const sp = spById(id);
    const cells = [LEVELS[0], LEVELS[2], LEVELS[3]].map(([l, rod, lure]) => {
      const m = modsFor(sp, l, rod, lure);
      const old = reelStyleFor(sp, m);
      const now = reelStyle2(sp, m);
      const b0 = stats2(old, CAMPER, n, seedOf(sp), { camp: 1 }).p, b1 = stats2(now, CAMPER, n, seedOf(sp), { camp: 1 }).p;
      const t0 = stats2(old, CAMPER, n, seedOf(sp), { camp: -1 }).p, t1 = stats2(now, CAMPER, n, seedOf(sp), { camp: -1 }).p;
      const a1 = stats2(now, AFK, 100, seedOf(sp)).p;
      return `ур.${l}: дно ${pct(b0)}→${pct(b1)} · верх ${pct(t0)}→${pct(t1)} · без рук ${pct(a1)}`;
    });
    console.log(id.padEnd(15), cells.join(' | '));
  }
}

// ------------------------------------------------------------ perks: вклад бонусов уровня
if (section === 'perks') {
  const n = Number(process.env.N ?? 300);
  const gs = groups();
  for (const l of [5, 10, 15]) {
    const [, rod, lure] = LEVELS.find((x) => x[0] === l)!;
    const lb = levelBonus(l);
    const cells = gs.map((g) => {
      const n2 = g.sps.length > 1 ? Math.max(100, Math.round(n / 2)) : n;
      const a = groupRate(g, l, rod, lure, TYPICAL, true, { noPerks: true }, n2);
      const b = groupRate(g, l, rod, lure, TYPICAL, true, {}, n2);
      return `${g.name} ${pct(a)}→${pct(b)}`;
    });
    console.log(`ур.${l} (рывки −${lb.calm * 100}%, стойкость ${lb.resist}%, леска ${lb.slack} т, старт ${lb.pStart}%): ${cells.join(' · ')}`);
  }
}

// ------------------------------------------------------------ teeth: пример каркаса (зубы на кальмаре вместо чернил)
if (section === 'teeth') {
  const sp = spById('kalmar');
  const n = Number(process.env.N ?? 400);
  for (const [l, rod, lure] of [LEVELS[0], LEVELS[2], LEVELS[3]]) {
    const st = reelStyle2(sp, modsFor(sp, l, rod, lure), { noPerks: true, ability: TEETH_EXAMPLE });
    const t = stats2(st, TYPICAL, n, seedOf(sp));
    const e = stats2(st, EXPERT, n, seedOf(sp));
    console.log(`зубы на кальмаре, ур.${l}: ${pct(t.p)}/${pct(e.p)} (после срабатывания ${pct(t.pAfter)}/${pct(e.pAfter)})`);
  }
}

// ------------------------------------------------------------ cal: сопротивление мификов и божественной под цель 10-го уровня
/** Цель «обычного» на 10-м уровне (удочка 3, золото) по новым правилам; было 99 / 87 / 79 / 65 % */
export const CAL_L10: Readonly<Record<string, number>> = { whiteshark: 0.7, greenlandshark: 0.7, oarfish: 0.7, kalmar: 0.55 };

/** Или цель «обычного» на 0-м уровне (CAL_AT=0): было 21 / 10 / 12 / 3 % */
export const CAL_L0: Readonly<Record<string, number>> = { whiteshark: 0.2, greenlandshark: 0.1, oarfish: 0.1, kalmar: 0.03 };

if (section === 'cal') {
  const n = Number(process.env.N ?? 300);
  const only = process.argv.slice(3);
  const calAt = Number(process.env.CAL_AT ?? 10);
  const [, cRod, cLure] = LEVELS.find((x) => x[0] === calAt)!;
  for (const [id, target] of Object.entries(calAt === 0 ? CAL_L0 : CAL_L10)) {
    if (only.length && !only.includes(id)) continue;
    const sp = spById(id);
    const m10 = modsFor(sp, calAt, cRod, cLure);
    const ab = process.env.NOAB ? { noAbility: true } : {};
    const at = (d: number) => rate(reelStyle2(sp, m10, { drain: d, ...ab }), TYPICAL, sp, n);
    let lo = 1, hi = 150;
    for (let i = 0; i < 10; i++) { const d = (lo + hi) / 2; if (at(d) >= target) lo = d; else hi = d; }
    const d = Math.round(lo * 100) / 100;
    const cells = LEVELS.map(([l, rod, lure]) => {
      const st = reelStyle2(sp, modsFor(sp, l, rod, lure), { drain: d, ...ab });
      const t = stats2(st, TYPICAL, n * 2, seedOf(sp)), e = stats2(st, EXPERT, n * 2, seedOf(sp));
      return `ур.${l} ${pct(t.p)}/${pct(e.p)} (${t.caughtS.toFixed(0)} с)`;
    });
    console.log(`${id.padEnd(15)} было ${RULE[sp]!.style.drain} → ${d} %/с · ${cells.join(' | ')}`);
  }
}

// ------------------------------------------------------------ one: один вид подробно — ур. 0/3/5/10/15, время боя, кемпер
if (section === 'one') {
  const n = Number(process.env.N ?? 600);
  const id = process.argv[3] ?? 'kalmar';
  const sp = spById(id);
  const d = process.argv[4] ? Number(process.argv[4]) : undefined;
  const lv: ReadonlyArray<readonly [number, number, number]> = [[0, 0, 0], [3, 1, 1], [5, 2, 2], [10, 3, 3], [15, 4, 4]];
  const rows = lv.map(([l, rod, lure]) => {
    const m = modsFor(sp, l, rod, lure);
    const old = reelStyleFor(sp, m);
    const st = reelStyle2(sp, m, d !== undefined ? { drain: d } : {});
    const ot = stats2(old, TYPICAL, n, seedOf(sp)), oe = stats2(old, EXPERT, n, seedOf(sp));
    const t = stats2(st, TYPICAL, n, seedOf(sp)), e = stats2(st, EXPERT, n, seedOf(sp));
    const camp = stats2(st, EXPERT, Math.min(n, 300), seedOf(sp), { camp: 1 }).p;
    return `ур.${l}: было ${pct(ot.p)}/${pct(oe.p)} (${ot.caughtS.toFixed(0)} с) → ${pct(t.p)}/${pct(e.p)} (${t.caughtS.toFixed(0)} с), после способности ${pct(t.pAfter)}/${pct(e.pAfter)}, кемпер ${pct(camp)}`;
  });
  console.log(`${id} (сопротивление ${d ?? 'из таблицы'}):\n  ${rows.join('\n  ')}`);
}

if (!['check', 'table', 'steps', 'kalmar', 'wind', 'herring', 'breach', 'camp', 'perks', 'teeth', 'cal', 'one'].includes(section)) {
  console.log('разделы: check table steps kalmar wind herring breach camp perks teeth cal one');
}
void FISH;
