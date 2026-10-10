// «Подземелье»: грубая модель баланса. Не симулятор: урон героя по типичной сборке против суммарного HP и темпа волн.
// Числа берёт из docs/survivors/design-data.json. Запуск: node tools/survivors/balance.mjs [последняя_волна=15] [--json — строки таблицы JSON-ом]
import { readFileSync } from 'node:fs';
const D = JSON.parse(readFileSync(new URL('../../docs/survivors/design-data.json', import.meta.url), 'utf8'));
const ARGS = process.argv.slice(2), JSON_OUT = ARGS.includes('--json'), LAST = Number(ARGS.find((a) => /^\d+$/.test(a)) ?? 15);
const M = D.balanceModel, E = D.endless;
const log = JSON_OUT ? () => {} : console.log;
const mob = Object.fromEntries(D.mobs.map((m) => [m.id, m]));
const WP = Object.fromEntries(D.weapons.map((w) => [w.id, w])), PS = Object.fromEntries(D.passives.map((p) => [p.id, p]));
const EVO = Object.fromEntries(D.evolutions.map((e) => [e.id, e]));
// HP и опыт моба с потомками (слизень делится)
const full = (id) => { const m = mob[id], s = m.splitInto; return s ? { hp: m.hp + s.n * mob[s.id].hp, xp: m.xp + s.n * mob[s.id].xp } : { hp: m.hp, xp: m.xp }; };
const hpMul = (w) => w <= 10 ? D.waves[w - 1].hpMul : D.waves[9].hpMul * E.hpMul ** (w - 10);
const isBoss = (w) => w % 10 === 0;
const durOf = (w) => w <= 10 ? D.waves[w - 1].dur : [...E.durations].reverse().find((d) => w >= d.from).dur;

// Состав волны: {id: count} рядовых (с событиями) и {id: count} элит
function waveMobs(w) {
  if (w <= 10) {
    const W = D.waves[w - 1], mobs = { ...W.mobs };
    for (const e of W.events) if (['pack', 'swarm', 'ring'].includes(e.type)) mobs[e.mob] = (mobs[e.mob] ?? 0) + e.n;
    return { mobs, elites: W.elites };
  }
  // бюджет — очки HP 9-й волны × step11 на 11-й и ×countGrowth за волну дальше; смесь делит его по видам
  const budget = Object.entries(waveMobs(9).mobs).reduce((a, [id, n]) => a + n * full(id).hp, 0) * E.step11 * E.countGrowth ** (w - 10);
  const mix = E.mixes[(w - 11) % E.mixes.length], mobs = {};
  for (const [id, s] of Object.entries(mix.share)) mobs[id] = Math.round(budget * s / full(id).hp);
  const ne = isBoss(w) ? 0 : 1 + Math.floor((w - 10) / 4);
  return { mobs, elites: { barrel: Math.ceil(ne / 2), shaman: Math.floor(ne / 2) + (w % 5 === 0 ? 1 : 0) }, mix: mix.name };
}
function waveTotals(w) {
  const { mobs, elites, mix } = waveMobs(w); let hp = 0, xp = 0, count = 0, ne = 0;
  for (const [id, n] of Object.entries(mobs)) { const f = full(id); hp += n * f.hp; xp += n * f.xp; count += n; }
  for (const [id, n] of Object.entries(elites)) { hp += n * mob[id].hp; xp += n * mob[id].xp; ne += n; }
  const cap = w <= 10 ? 1e9 : w <= 20 ? E.bodyCap.upTo20 : E.bodyCap.after; // сверх предела — HP, а не тела
  return { hp: hp * hpMul(w), xp: xp * Math.min(1, cap / count), count: Math.min(count, cap), ne, mix };
}
const need = (L) => D.xp.base + (L < 30 ? D.xp.perLevel : D.xp.after30perLevel) * L;
function levelFor(xp) { let L = 1; while (xp >= need(L)) { xp -= need(L); L++; } return L; }

// Сборка: первые k выборов типичного порядка
function buildAfter(k) {
  const b = { w: { lantern: 1 }, p: {}, evo: new Set(), sum: 0 };
  for (let i = 0; i < Math.floor(k); i++) { const id = M.typicalPicks[i] ?? 'SUM'; // список кончился — «Закалка»
    if (id === 'SUM') b.sum = Math.min(D.levelUp.temper.max, b.sum + 1);
    else if (id.startsWith('EVO:')) { const e = EVO[id.slice(4)]; if (b.w[e.from] === 7 && b.p[e.with]) b.evo.add(e.from); }
    else if (WP[id]) b.w[id] = Math.min(7, (b.w[id] ?? 0) + 1);
    else b.p[id] = Math.min(PS[id].max, (b.p[id] ?? 0) + 1);
  }
  return b;
}
// DPS сборки: по толпе (с числом целей) и по одной цели (по боссу)
function dps(b, L) {
  const P = (id) => b.p[id] ?? 0, might = (1 + 0.1 * P('might')) * (1 + D.levelUp.temper.dmg * b.sum), cdMul = 1 - 0.08 * P('cooldown');
  const area = 1 + 0.06 * P('area'), amt = P('amount'); let crowd = 0, boss = 0;
  for (const [id, lv] of Object.entries(b.w)) {
    const W = WP[id], s = W.levels[lv - 1], md = W.model, evo = b.evo.has(id) && D.evolutions.find((e) => e.from === id);
    if (evo) {
      const m = evo.model, n = (m.n ?? 1) + (W.model.count ? amt : 0);
      if (m.orbit) { crowd += m.dmg * n * m.hps; boss += m.dmg * n * m.hps * m.boss; continue; }
      const per = m.dmg * n / (m.cd * cdMul), extra = m.extraDps ?? 0;
      crowd += per * m.t * area + extra; boss += per * m.boss + extra / 8; continue;
    }
    if (md.orbit) { const v = s.dmg * (s.n + amt) * md.hps[lv - 1] * s.on / (s.on + s.off); crowd += v; boss += v * md.boss; continue; }
    const n = md.count ? s[md.count] + amt : 1 + (md.amountMul ?? 0) * amt;
    const t = md.t[lv - 1] + (md.amountT ?? 0) * amt, per = s.dmg * n / (s.cd * cdMul);
    crowd += per * t * (md.areaWeapon ? area : 1); boss += per * md.boss;
  }
  const S = D.actives.strike, q = S.full.damage * (1 + S.levelScale * (L - 1)) * M.qUse / (S.cooldown + S.chargeTime);
  return { crowd: (crowd * might + q * M.qTargets * area) * M.efficiency, boss: (boss * might + q) * M.efficiency };
}
const tokens = (w) => Math.min(D.economy.waveCap, D.economy.waveBase + w) + (isBoss(w) ? D.economy.bossBase + D.economy.bossStep * (w / 10 - 1) : 0);
const bossHp = (w) => D.boss.hp * D.boss.endlessGrowth ** (w - 10) * (1 + 0.25 * Math.floor((w - 10) / 40)); // Близнецы на 30-й — 2 × 50 %
const short = (b) => Object.entries(b.w).map(([id, lv]) => (b.evo.has(id) ? '★' : '') + WP[id].name.slice(0, 4) + lv).join(' ')
  + ' | ' + Object.entries(b.p).map(([id, lv]) => PS[id].name.slice(0, 4) + lv).join(' ');

const rows = []; let xp = 0, chests = 0, t = 0, tok = 0;
const pad = (s, n) => String(s).padStart(n);
log('w  сек врагов  HP волны  нужно/с  ур. DPS толпа  давл.  🪙  мин  сборка (в начале волны)');
for (let w = 1; w <= LAST; w++) {
  const L = levelFor(xp), b = buildAfter(L - 1 + chests * M.chestLevels), d = dps(b, L), T = waveTotals(w);
  let dur = durOf(w), req, pres, note = '';
  if (isBoss(w)) {
    const hp = bossHp(w), fight = hp / (d.boss * D.boss.uptime);
    dur = Math.round(fight + 8); req = hp / fight; pres = req / d.boss;
    note = `  ← босс ${Math.round(hp)} HP, урон по цели ${Math.round(d.boss)}/с → бой ~${Math.round(fight)} с`;
  } else { req = T.hp / (dur * M.spawnShare); pres = req / d.crowd; }
  t += dur + M.breatherOverhead; tok += tokens(w);
  log(`${pad(w, 2)} ${pad(dur, 4)} ${pad(T.count, 5)} ${pad(Math.round(T.hp), 9)} ${pad(Math.round(req), 8)} ${pad(L, 4)} ${pad(Math.round(d.crowd), 9)} ${pad(pres.toFixed(2), 6)} ${pad(tokens(w), 3)} ${pad((t / 60).toFixed(1), 5)}  ${short(b)}${note}${T.mix ? '  [' + T.mix + ']' : ''}`);
  rows.push({ w, dur, bodies: T.count, hp: Math.round(T.hp), needDps: Math.round(req), level: L, heroDps: Math.round(d.crowd), bossDps: Math.round(d.boss), pressure: +pres.toFixed(2), tokens: tokens(w), minutes: +(t / 60).toFixed(1), ...(isBoss(w) ? { bossHp: Math.round(bossHp(w)) } : {}) });
  xp += T.xp * M.killShare * (1 + D.passives.find((p) => p.id === 'magnet').xp * (b.p.magnet ?? 0)) + (isBoss(w) ? D.boss.xp : 0);
  chests += T.ne + (isBoss(w) ? 2 : 0);
  if (w === 10) log(`   ↳ 10 волн: ~${(t / 60).toFixed(1)} мин, ${tok} 🪙 (${(tok / (t / 60)).toFixed(1)} в мин), уровень к концу ${levelFor(xp)}`);
}
log(`Итого до ${LAST}-й: ~${(t / 60).toFixed(1)} мин, ${Math.min(D.economy.runCap, tok)} 🪙 (${(tok / (t / 60)).toFixed(1)} в мин без бонуса за рекорд)`);
if (JSON_OUT) console.log(JSON.stringify(rows));
log('давл. = нужный урон в секунду, чтобы перебить волну за время спавна / урон героя (×эффективность). <0,8 — легко, 0,8–1,05 — напряжённо, >1,2 — толпа копится, смерть близко');
