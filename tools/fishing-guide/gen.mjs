// Генератор страницы /fishing (public/fishing/): все цифры — из кода игры (shared/*.ts). Запуск: node tools/fishing-guide/gen.mjs
// С островом «Последний свет» (флаг сервера ISLE): раздел острова, цены рыбы пристани и баркаса ×0,4. Без острова — ISLE=0 node …
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../../', import.meta.url)); // корень репозитория
const S = ROOT + 'shared/';
const OUT = ROOT + 'public/fishing/';
const fr = await import(S + 'fishrules.ts');
const fp = await import(S + 'fishprogress.ts');
const sh = await import(S + 'fishshop.ts');
const fi = await import(S + 'fishing.ts');
const bk = await import(S + 'barkas.ts');
const rl = await import(S + 'fishreel.ts');
const rel = await import(S + 'fishrelease.ts');
const cn = await import(S + 'constants.ts');
const isl = await import(S + 'fishisle.ts');
// страница выходит вместе с островом (флаг ISLE): цена рыбы пристани и баркаса ×0,4; ISLE=0 — прежняя страница без острова
const ISLE_ON = process.env.ISLE !== '0';
isl.setIsle(ISLE_ON);
/** Сколько ошибок у оценки вываживания i: «0», «2–3», «10 и больше» */
const gradeSpan = (i) => {
  const all = rl.REEL_GRADES, g = all[i], from = i === 0 ? 0 : all[i - 1].upTo + 1;
  return g.upTo === Infinity ? `${from} и больше` : from === g.upTo ? `${from}` : `${from}–${g.upTo}`;
};
const { FISH, HOOK_MS } = fi;
const { RULE, COLLECTION, tierRank, NEW_BONUS2, tierOdds, BAND, ZONE_BASE, CHEST_BANDS, fishPrice2 } = fr;

// ---------- данные
// база категорий (доли рыбы по рангам 0…5, ясно, без бонусов) — прямо из игры
const BASE = { pier: [...fr.TIER_BASE.pier], barkas: [...fr.TIER_BASE.barkas], ...(ISLE_ON ? { isle: [...fr.TIER_BASE.isle] } : {}) };
// самый высокий уровень рыбалки, до которого растёт шанс (15), и последний уровень таблицы опыта
const LMAX = fp.LEVEL_ODDS_MAX;
const XP_TOP = fp.FISH_XP_LEVELS.length - 1;
function mods({ level = 0, rod = 0, lure = 0, drink = 0, zone = 'pier' }) {
  const now = 1_000_000;
  const p = { ...fp.emptyFishProgress(), xp: fp.FISH_XP_LEVELS[Math.min(level, XP_TOP)], questsDone: [0, 1, 5, 10, 15][rod], rod, lure };
  if (drink === 1) p.beerUntil = now + 1000; if (drink === 2) p.aleUntil = now + 1000; if (drink === 3) p.lordUntil = now + 1000; if (drink === 4) p.vodkaUntil = now + 1000;
  const m = fp.fishCastMods(p, now, zone);
  // уровень выше таблицы опыта (пока её не продлили) — тот же снимок с этим уровнем и его множителем шанса
  return m.level === level ? m : { ...m, level, rareMultiplier: fp.levelOdds(level) * fp.rodOdds(rod) * (fp.drinkOf(drink)?.rare ?? 1) };
}
const W = { clear: 0, rain: 1, season: 2 };
function odds(o) { return tierOdds(o.weather === 1 || o.weather === 2, mods(o), o.weather === 2); }

// ---------- формат
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dec = (v, d) => v.toFixed(d).replace('.', ',');
const num = (v, d) => String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',');
const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return `${n} ${a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many}`; };
const vidov = (n) => plural(n, 'вид', 'вида', 'видов');
function pct(x) { const v = x * 100; if (v === 0) return '0 %'; if (Math.abs(v - 100) < 1e-9) return '100 %'; return (v >= 10 ? dec(v, 1) : v >= 0.1 ? dec(v, 2) : dec(v, 3)) + ' %'; }
function oneIn(x) { if (x <= 0) return '—'; const n = 1 / x; return n < 20 ? '≈ 1 из ' + dec(Math.round(n * 10) / 10, (Math.round(n * 10) % 10) ? 1 : 0) : '≈ 1 из ' + Math.round(n).toLocaleString('ru-RU').replace(/\s/g, ' '); }
const mul = (k) => '×' + String(Math.round(k * 1000) / 1000).replace('.', ',');
const coins = (a, b) => (a === b ? `${a}` : `${a}–${b}`) + ' 🪙';
const wt = (g) => fr.fmtCatch(g);
const wrange = (g) => `${wt(g[0])} – ${wt(g[1])}`;

// категории: номера tierOdds: 0..4 обычные…мифические, 5 хлам, 6 сундук, 7 божественная
const TN = ['Обычные', 'Редкие', 'Эпические', 'Легендарные', 'Мифические', 'Хлам', 'Сундук', 'Божественная'];
const TN1 = ['обычная', 'редкая', 'эпическая', 'легендарная', 'мифическая', 'хлам', 'сундук', 'божественная'];
const RANK_T = [0, 1, 2, 3, 4, 7]; // ранг → номер категории
const ORDER = [0, 1, 2, 3, 4, 7, 5, 6];

function bar(p, label = true) {
  const segs = ORDER.filter((k) => p[k] > 0).map((k) => `<span style="--c:var(--t${k});width:${(p[k] * 100).toFixed(4)}%" title="${TN[k]}: ${pct(p[k])}">${label && p[k] >= 0.06 ? `<b>${pct(p[k])}</b>` : ''}</span>`).join('');
  return `<div class="bar" role="img" aria-label="${ORDER.map((k) => `${TN[k]} ${pct(p[k])}`).join(', ')}">${segs}</div>`;
}
const legend = (p) => `<ul class="legend">${ORDER.map((k) => `<li><i class="dot" style="--c:var(--t${k})"></i>${TN[k]} <b class="num">${pct(p[k])}</b></li>`).join('')}</ul>`;

// виды места (виды острова — свой счётчик, но на странице — своим разделом)
const ALL = [...COLLECTION, ...fr.ISLE_COLLECTION];
function zoneList(zone) {
  const out = [];
  const share = (rain) => {
    const rankW = [0, 0, 0, 0, 0, 0];
    for (const sp of ALL) { const r = RULE[sp]; if (!r.zones.includes(zone) || (r.rain && !rain)) continue; rankW[tierRank(r.tier)] += r.bite; }
    return (sp) => { const r = RULE[sp]; if (!r.zones.includes(zone) || (r.rain && !rain)) return 0; return r.bite / rankW[tierRank(r.tier)]; };
  };
  const clear = share(false), rain = share(true);
  for (const sp of ALL) {
    const r = RULE[sp]; if (!r.zones.includes(zone)) continue;
    const f = FISH[sp];
    const m = { zone };
    out.push({ sp, id: f.id, name: f.name, rank: tierRank(r.tier), rain: r.rain, g: f.g, price: [fishPrice2(sp, f.g[0], 0, m), fishPrice2(sp, f.g[1], 0, m)], note: r.note, both: r.zones.length > 1, inClear: clear(sp), inRain: rain(sp) });
  }
  return out;
}
const ZL = { pier: zoneList('pier'), barkas: zoneList('barkas'), isle: zoneList('isle') };

// ---------- примеры
const EX = [
  { key: 'a', title: 'Новичок', who: '0-й уровень, обычная удочка, без блесны и напитков, у пристани, ясно.', o: { level: 0, rod: 0, lure: 0, drink: 0, zone: 'pier', weather: 0 } },
  { key: 'b', title: 'Тот же новичок под дождём', who: 'Всё то же, но идёт дождь.', o: { level: 0, rod: 0, lure: 0, drink: 0, zone: 'pier', weather: 1 } },
  { key: 'c', title: 'Прокачанный рыбак в дождь', who: `${LMAX}-й уровень, легендарная удочка, платиновая блесна, рыбацкий эль, у пристани, дождь.`, o: { level: LMAX, rod: 4, lure: 4, drink: 2, zone: 'pier', weather: 1 } },
  { key: 'd', title: 'Он же в сезон рыбалки', who: 'Те же снасти и эль, но идёт сезон рыбалки (особый дождь раз в 2 часа).', o: { level: LMAX, rod: 4, lure: 4, drink: 2, zone: 'pier', weather: 2 } },
];
for (const e of EX) e.p = odds(e.o);

// разбор примера C по шагам: сверху вниз — старшие получают свою долю целиком, младшим — что осталось
function breakdown(o) {
  const m = mods(o);
  const b = BASE[o.zone];
  let left = 1 - fr.COMMON_FLOOR;
  const parts = [5, 4, 3, 2, 1].map((k) => {
    const wm = fr.weatherMul(k, o.weather), bm = fr.bonusMul(k, m);
    const v = b[k] * wm * bm, got = Math.min(left, v);
    left -= got;
    return { k, base: b[k], wm, bm, v, got };
  });
  return { parts, left, m };
}
const BC = breakdown(EX[2].o);
const BC_CUT = BC.parts.find((x) => x.got < x.v - 1e-12);

// ---------- категории: цены, бонусы, окна
function tierPrice(rank, zone) {
  const l = ZL[zone].filter((s) => s.rank === rank && (zone === 'pier' || !s.both || rank === 5 || rank === 4));
  return [Math.min(...l.map((s) => s.price[0])), Math.max(...l.map((s) => s.price[1]))];
}
const newbie = EX[0].p;
// числа, которые меняют соседние задачи (водка, сундук, пиво владыки), — из кода
const VZ = sh.VODKA.zone ?? 1;
const vodkaZone = VZ === 0.5 ? 'вдвое меньше' : `на ${Math.round((1 - VZ) * 100)} % меньше`;
// обновление 4 октября — тоже из кода: клад Посейдона, выбор после поимки, натяжение и край шкалы, оценки, кальмар
const sec = (ticks) => num(ticks / cn.TICK_RATE, 1);
const posPct = num(fr.POSEIDON_SHARE * 100, 1);
const posMinPct = num(fr.poseidonShare(1) * 100, 1);
const posCoins = fr.POSEIDON_COINS.toLocaleString('ru-RU').replace(/\s/g, ' ');
const relXp = mul(rel.RELEASE_XP);
const choiceSec = sec(rel.CHOICE_TICKS);
const slackSec = sec(rl.SLACK_TICKS), tautSec = sec(rl.TAUT_TICKS), drunkLag = sec(rl.DRUNK_LAG);
const edgePct = num((rl.FISH_EDGE / rl.REEL_BAR) * 100, 1), edgeTop = num(100 - (rl.FISH_EDGE / rl.REEL_BAR) * 100, 1);
const squid = FISH.find((f) => f.id === 'kalmar');
const G = rl.REEL_GRADES, gBest = G[0], gWorst = G[G.length - 1];
const gradeRows = G.map((g, i) => `<tr><td class="num">${gradeSpan(i)}</td><td class="l">«${g.name}»</td><td class="num">${mul(g.xp)}</td></tr>`).join('');
const lordIn = Math.round(1 / sh.LORD_CHEST_CHANCE);
const chestPct = num(fr.CHEST_PER_10K / 100, 1);
const junkPct = num(fr.JUNK_PER_10K / 100, 1);
const chestMin = Math.min(...CHEST_BANDS.map((b) => b[0])), chestMax = Math.max(...CHEST_BANDS.map((b) => b[1]));
const drinkLi = (d, where) => `<li>${d.name}${where}: <b>${mul(d.rare)}</b>, доход ${mul(d.income)}</li>`;
// сезон к дождю у прокачанного (примеры C и D)
const exC = EX[2].p, exD = EX[3].p;
const floorPct = `${num(fr.COMMON_FLOOR * 100, 1)} %`;
const exRatio = (k) => mul(Math.round((exD[k] / exC[k]) * 10) / 10);
const exTop = [3, 4, 7].every((k) => Math.abs(exD[k] / exC[k] - fr.SEASON_MUL) < 1e-9)
  ? `легендарных, мифических и кальмаров — ровно ${fr.SEASON_MUL === 2 ? 'вдвое' : mul(fr.SEASON_MUL)} больше`
  : `легендарных ${exRatio(3)}, мифических ${exRatio(4)}, кальмаров ${exRatio(7)}`;
const drainBy = {}; for (const sp of COLLECTION) { const r = RULE[sp]; const k = tierRank(r.tier); (drainBy[k] ??= []).push(r.style.drain); }
// замер 04.10 на модели «среднего» игрока (test/fishbot.ts, TYPICAL): 0-й уровень без бонусов, пристань, виды — по частоте
// поклёвки, бой — у вытащенных. Пересчитывать при правке шкалы (shared/fishreel.ts)
const SUCCESS = ['~99 %', '~93 %', '~78 %', '~48 %', '~20 %', '~4 %'];
const FIGHT = ['~7 с', '~10 с', '~17 с', '~16 с', '~23 с', 'дольше всех'];

function tierCard(k) {
  const rank = RANK_T.indexOf(k);
  const isFish = rank >= 0;
  let dl = '';
  if (isFish) {
    const pp = tierPrice(rank, 'pier');
    dl = `<dl><dt>Цена у пристани</dt><dd class="num">${coins(pp[0], pp[1])}</dd><dt>Новый вид в журнал</dt><dd class="num">+${NEW_BONUS2[k]} 🪙</dd><dt>Подсечь за</dt><dd class="num">${dec(HOOK_MS[k] / 1000, HOOK_MS[k] % 100 ? 2 : 1)} с</dd><dt>Зона на шкале</dt><dd class="num">${dec(BAND[rank].zone * ZONE_BASE, 1)} %</dd></dl>`;
  } else if (k === 5) {
    dl = `<dl><dt>Что это</dt><dd>сапог или бутылка</dd><dt>Цена</dt><dd>0 🪙</dd><dt>С уровнем</dt><dd>реже, на 10-м — нет</dd></dl>`;
  } else {
    dl = `<dl><dt>Внутри</dt><dd class="num">${chestMin}–${chestMax} 🪙</dd><dt>Клад Посейдона</dt><dd class="num">${posCoins} 🪙 · ${posMinPct}–${posPct} % сундуков по уровню</dd><dt>Пиво владыки</dt><dd>в 1 из ${lordIn}</dd><dt>Подсечь за</dt><dd class="num">1,0 с</dd></dl>`;
  }
  return `<div class="tier" style="--c:var(--t${k})"><div class="nm">${TN[k]}</div><div class="big num">${pct(newbie[k])}</div><div class="one">${oneIn(newbie[k])} поклёвок</div>${dl}</div>`;
}

// ---------- рыбы
function fishCard(s, zone) {
  const k = RANK_T[s.rank];
  const img = `/fishing/img/${s.id}.webp`;
  const tags = [];
  if (s.rain) tags.push(zone === 'isle' ? '<span class="tag fog">🌫 только в туман</span>' : '<span class="tag rain">🌧 только в дождь</span>');
  if (s.both) tags.push(`<span class="tag both">${zone === 'pier' ? 'и на баркасе' : 'и у пристани'}</span>`);
  const wet = zone === 'isle' ? 'в туман' : 'в дождь';
  const inCat = s.rain ? `<dt>В категории</dt><dd class="num">${wet} ${pct(s.inRain)}</dd>`
    : s.inClear === 1 && s.inRain === 1 ? `<dt>В категории</dt><dd class="num">единственная</dd>`
    : `<dt>В категории</dt><dd class="num">${pct(s.inClear)}${Math.abs(s.inRain - s.inClear) > 1e-9 ? ` · ${wet} ${pct(s.inRain)}` : ''}</dd>`;
  return `<div class="f" style="--c:var(--t${k})"><div class="pic"><img src="${img}" alt="${esc(s.name)}" loading="lazy" decoding="async"></div><div class="nm">${esc(s.name)}</div><div class="tags">${tags.join('')}</div><p class="say">${esc(s.note)}</p><dl><dt>Вес</dt><dd class="num">${wrange(s.g)}</dd><dt>Цена</dt><dd class="num">${coins(s.price[0], s.price[1])}</dd>${inCat}</dl></div>`;
}
function fishZone(zone) {
  let h = '';
  for (let rank = 0; rank <= 5; rank++) {
    const l = ZL[zone].filter((s) => s.rank === rank);
    if (!l.length) continue;
    const k = RANK_T[rank];
    h += `<div class="tier-h" style="--c:var(--t${k})">${TN[k]} · ${l.length}</div><div class="fish">${l.map((s) => fishCard(s, zone)).join('')}</div>`;
  }
  return h;
}

// ---------- таблицы
const baseRows = ORDER.map((k) => {
  const pier = newbie[k];
  const bark = odds({ level: 0, rod: 0, lure: 0, drink: 0, zone: 'barkas', weather: 0 })[k];
  const isle = ISLE_ON ? `<td class="num">${pct(odds({ level: 0, rod: 0, lure: 0, drink: 0, zone: 'isle', weather: 0 })[k])}</td>` : '';
  return `<tr><td><span class="tn"><i class="dot" style="--c:var(--t${k})"></i>${TN[k]}</span></td><td class="num">${pct(pier)}</td><td class="num">${oneIn(pier)}</td><td class="num">${pct(bark)}</td>${isle}</tr>`;
}).join('');
const exRows = ORDER.map((k) => `<tr><td><span class="tn"><i class="dot" style="--c:var(--t${k})"></i>${TN[k]}</span></td>${EX.map((e) => `<td class="num">${pct(e.p[k])}</td>`).join('')}</tr>`).join('');
const chestTotal = CHEST_BANDS.reduce((s, b) => s + b[2], 0);
// Доли всех сундуков на начальном и максимальном уровне; клад вытесняет обычные суммы.
const chestRows = CHEST_BANDS.map(([lo, hi, w]) => `<tr><td>${lo === hi ? `${lo} 🪙` : `${lo}–${hi} 🪙`}</td>${[1, 15].map(level => `<td class="num">${num(w / chestTotal * (1 - fr.poseidonShare(level)) * 100, 1)} %</td>`).join('')}</tr>`).join('')
  + `<tr class="pos"><td>${posCoins} 🪙 — «Сокровища Посейдона»</td><td class="num">${posMinPct} %</td><td class="num">${posPct} %</td></tr>`;
const junkRows = [0, 1, 2, 3, 5, 7, 10].map((l) => `<tr><td>${l}-й уровень</td><td class="num">${pct(fr.junkPer10k(l) / 10000)}</td></tr>`).join('');
const reelRows = [0, 1, 2, 3, 4, 5].map((rank) => {
  const k = RANK_T[rank]; const d = drainBy[rank];
  return `<tr><td><span class="tn"><i class="dot" style="--c:var(--t${k})"></i>${TN[k]}</span></td><td class="num">${dec(BAND[rank].zone * ZONE_BASE, 1)} %</td><td class="num">${dec(HOOK_MS[k] / 1000, HOOK_MS[k] % 100 ? 2 : 1)} с</td><td class="num">${Math.min(...d) === Math.max(...d) ? dec(d[0], 1) : `${dec(Math.min(...d), 1)}–${dec(Math.max(...d), 1)}`} %/с</td><td class="num">${FIGHT[rank]}</td><td class="num">${SUCCESS[rank]}</td></tr>`;
}).join('');
const lvlRows = fp.FISH_XP_LEVELS.slice(1).map((x, i) => `<td class="num">${x.toLocaleString('ru-RU').replace(/\s/g, ' ')}</td>`).join('');

const rods = fp.RODS.slice(1).map((r) => `<li>${r.name} (${r.quests}-е задание): <b>${mul(fp.rodOdds(r.rod))}</b></li>`).join('');
const lures = sh.LURES.map((l) => `<li>${l.name.replace(' блесна', '')}: <b>${mul(l.epic)}</b> <span class="muted">· ${l.price} 🪙, с ${l.level} ур.</span></li>`).join('');
const pierCount = ZL.pier.length, barkCount = ZL.barkas.length;
const pierRain = ZL.pier.filter((s) => s.rain).length, barkRain = ZL.barkas.filter((s) => s.rain).length;
const isleCount = ZL.isle.length, isleFog = ZL.isle.filter((s) => s.rain).length;
const cutPct = Math.round((1 - fr.fishPriceCut()) * 100);
const isleNews = ISLE_ON ? `
    <li><span class="k">🏝</span><p><b>Остров «Последний свет».</b> 2,4 км на запад, в тумане. Свои ${vidov(isleCount)} — ${isleCount - isleFog} всегда и ${isleFog} только когда «Туман наступает» (шансы и цена — как в дождь, ×1,5). Рыба там злее (зона ×${num(fr.ISLE_ZONE, 2)}, рывки ×${num(fr.ISLE_FIGHT, 1)}, сопротивление ×${num(fr.ISLE_DRAIN, 1)}), опыт ×${fr.ISLE_XP}. С ${isl.ISLE_MIN_LEVEL}-го уровня, на своей лодке. Свой счётчик в журнале — «Остров: N из ${isleCount}».</p></li>
    <li><span class="k">💸</span><p><b>Рыба пристани и баркаса — на ${cutPct} % дешевле</b> прежних цен. Сундуки, клад Посейдона и бонус за новый вид — как были. Самые дорогие рыбы теперь — у острова.</p></li>
    <li><span class="k">🛶</span><p><b>Лайвел в своей лодке.</b> Рюкзак полон — рыба ложится в лайвел: 25 / 50 / 75 мест у «Волжанки» / «Альбакора» / «Нортсильвера». Продать — у любого скупщика или из меню лодки.</p></li>` : '';

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Рыбалка в TIREDWOOD — справочник рыбака</title>
<meta name="description" content="Что клюёт, как часто и что влияет на шансы: категории рыб, удочки, блёсны, напитки, дождь и сезон рыбалки. Цифры из игры.">
<meta name="theme-color" content="#d7efff">
<link rel="preload" href="/fishing/fonts/rubik-cyrillic-800-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/fishing/style.css">
<script src="/fishing/app.js" defer></script>
</head>
<body>
<header class="hero">
  <div class="hero-img" role="img" aria-label="Деревянный пирс, лодка и море в солнечный день"></div>
  <div class="hero-card">
    <span class="kicker">Справочник рыбака</span>
    <h1>Рыбалка в TIREDWOOD</h1>
    <p class="lead">Что клюёт, как часто и что на это влияет. Удочки, блёсны, пиво, дождь и сезон рыбалки — с точными цифрами из игры. И что из слухов — миф.</p>
  </div>
</header>
<nav class="nav" aria-label="Разделы">
  <a href="#new">Что нового</a>${ISLE_ON ? '<a href="#isle">Остров</a>' : ''}<a href="#how">Как устроено</a><a href="#tiers">Категории</a><a href="#base">Шансы</a><a href="#factors">Что влияет</a><a href="#calc-s">Калькулятор</a><a href="#examples">Примеры</a><a href="#fish">Все рыбы</a><a href="#reel">Вываживание</a><a href="#chest">Сундуки и хлам</a>
</nav>
<main class="wrap">

<section id="new">
  <h2>Что нового</h2>
  <p class="sub">Патч рыбалки 5 октября 2026: водка больше не ускоряет рывки, зона остаётся ${vodkaZone}. Клад Посейдона — ${posCoins} жетонов, его шанс в сундуке растёт с ${posMinPct} % на 1-м уровне рыбалки до ${posPct} % на 15-м.</p>
  <div class="card"><ul class="keys news">${isleNews}
    <li><span class="k">📈</span><p><b>Крупная рыба — чаще.</b> У новичка мифическая — ${pct(newbie[4])} поклёвок, кальмар — ${pct(newbie[7])}. Удочки, блёсны, напитки, уровень и события поднимают шансы и цену всех категорий — вместе с кальмаром.</p></li>
    <li><span class="k">🌧</span><p><b>Дождь — и для кальмара.</b> В дождь все от редких до кальмара клюют ${mul(fr.RAIN_MUL)} — раньше кальмар в дождь, наоборот, попадался реже.</p></li>
    <li><span class="k">🎣</span><p><b>Сезон рыбалки — ${mul(fr.SEASON_MUL)} к дождю.</b> Каждые 2 часа на 10 минут все твои шансы в дождь удваиваются, со всеми бонусами. Сколько осталось — на вывесках у Деда Семёна и на баркасе.</p></li>
    <li><span class="k">⭐</span><p><b>Уровни до ${XP_TOP}-го.</b> Каждый уровень — +2,5 % к зоне на шкале и к шансам редких и выше; на ${LMAX}-м — ${mul(fp.levelOdds(LMAX))}.</p></li>
    <li><span class="k">🎯</span><p><b>Оценка вываживания.</b> Каждый выход рыбы из зоны — ошибка. Без ошибок — «${gBest.name}» ${mul(gBest.xp)} опыта, ${gradeSpan(G.length - 1)} — «${gWorst.name}» ${mul(gWorst.xp)}. Счёт ошибок — под шкалой.</p></li>
    <li><span class="k">🪢</span><p><b>Леска натянута.</b> Зона прижата к самому верху дольше ${tautSec} с — улов тает, игра предупредит в чате. Рыба больше не прячется у краёв: держится в ${edgePct}–${edgeTop} % шкалы.</p></li>
    <li><span class="k">🌊</span><p><b>Поймал — выбери.</b> «В рюкзак» (кнопка или 1) — жетоны при продаже. «Отпустить» (кнопка или F) — рыба в воду, жетонов нет, опыт ${relXp}. Пока не выбрал, ЛКМ не забрасывает (и первые 0,75 с после боя нажатия не принимаются), выбрал — ЛКМ снова забрасывает. Не выбрал за ${choiceSec} с — рыба остаётся в рюкзаке.</p></li>
    <li><span class="k">🍶</span><p><b>Водка мягче, но пьянит.</b> Зона ${vodkaZone}, ускорения рывков больше нет. На шкале ты пьян: зона ещё ${drunkLag} с едет по инерции, икота, шкала моргает.</p></li>
    <li><span class="k">💰</span><p><b>«Сокровища Посейдона» — ${posCoins} 🪙.</b> Шанс клада в сундуке плавно растёт с ${posMinPct} % на 1-м уровне рыбалки до ${posPct} % на 15-м. О находке узнаёт весь сервер.</p></li>
    <li><span class="k">🦑</span><p><b>Кальмар — ${wrange(squid.g)}.</b> На подиуме дня его почти никто не перевесит.</p></li>
    <li><span class="k">⚓</span><p><b>Баркас ушёл дальше в море.</b> Стоит у дальнего края регаты и стал длиннее: ${bk.BARKAS_FISH_SPOTS.length} мест, рядом рыбачит матрос Колян. Лодка «Удалая» отходит от хижины Деда Семёна.</p></li>
    <li><span class="k">📋</span><p><b>Доски.</b> На доске рекордов у пирса — колонка «Коллекция»: у кого больше видов в журнале. У рулетки на баркасе — табло последних 10 ставок.</p></li>
  </ul></div>
</section>

<section id="how">
  <h2>Как это устроено</h2>
  <p class="sub">Рыбачат у набережной — с мостков, у маяка и у дома Деда Семёна (20 мест) — и с баркаса в открытом море (${bk.BARKAS_FISH_SPOTS.length} мест). Одна рыбалка — четыре шага.</p>
  <div class="grid g4 steps">
    <div class="card step"><h3>Заброс</h3><p>Встаёшь на место и забрасываешь. В этот момент запоминаются твои бонусы: уровень, удочка, блесна и напиток.</p></div>
    <div class="card step"><h3>Поклёвка</h3><p>Через 6–18 секунд (с хорошей удочкой — быстрее) поплавок дёргается — это пробы, не подсекай. Ушёл под воду — подсекай, на это 0,6–1 секунды.</p></div>
    <div class="card step"><h3>Вываживание</h3><p>Появляется шкала: держи зелёную зону на рыбе. Рыба в зоне — улов подтягивается, вне — уходит. 100 % — поймал, 0 % — сорвалась. Во время боя персонаж стоит на месте; не выходит — «Прекратить» (X или кнопка на шкале): рыба сорвётся, можно забрасывать снова.</p></div>
    <div class="card step"><h3>Улов</h3><p>Поймал — выбирай: «В рюкзак» (1), чтобы продать Деду Семёну или Сане, или «Отпустить» (F) — без жетонов, зато опыт ${relXp}. Новый вид — в журнал с бонусом. Сундук — сразу жетонами.</p></div>
  </div>
  <div class="card" style="margin-top:16px">
    <h3>Как выбирается, что клюнет</h3>
    <p class="muted" style="margin:0 0 10px">В момент поклёвки игра тянет жребий в три шага:</p>
    <div class="grid g3">
      <div><span class="pill" style="--c:var(--t6)">1</span> <b>${chestPct} из 100</b> поклёвок — сундук с жетонами, у всех. Внутри него шанс клада Посейдона растёт с ${posMinPct} % на 1-м уровне рыбалки до ${posPct} % на 15-м.</div>
      <div><span class="pill" style="--c:var(--t5)">2</span> <b>${junkPct} из 100</b> — хлам (сапог или бутылка) у новичка. С каждым уровнем рыбалки хлама на десятую часть меньше, с 10-го — ни одного.</div>
      <div><span class="pill" style="--c:var(--t1)">3</span> Остальное — <b>рыба</b>. Сначала выбирается категория (обычная, редкая, …), потом вид внутри неё — у каждого вида своя частота.</div>
    </div>
  </div>
</section>

<section id="tiers">
  <h2>Категории редкости</h2>
  <p class="sub">Шесть категорий рыбы, хлам и сундук. Крупный процент в карточке — шанс у новичка у пристани в ясную погоду (доля от всех поклёвок). Чем реже рыба, тем она дороже, злее на шкале и тем быстрее надо подсечь.</p>
  <div class="tiers">${ORDER.map(tierCard).join('')}</div>
  <p class="muted small" style="margin-top:12px">На баркасе рыба платит ×1,25. Рыбы «только в дождь» платят в полтора раза больше. Пиво, эль и пиво владыки ещё поднимают цену улова (×1,1 / ×1,15 / ×1,2).</p>
</section>

<section id="base">
  <h2>Базовые шансы</h2>
  <p class="sub">Так клюёт у новичка: 0-й уровень, обычная удочка, без блесны и напитков, ясная погода. На баркасе доли категорий почти те же — меняется сама рыба.</p>
  <div class="card">
    <h3>У пристани</h3>
    ${bar(newbie)}
    ${legend(newbie)}
    <div class="scroll" style="margin-top:18px"><table class="tbl"><thead><tr><th>Категория</th><th>У пристани</th><th>Как часто</th><th>На баркасе</th>${ISLE_ON ? '<th>У острова*</th>' : ''}</tr></thead><tbody>${baseRows}</tbody></table></div>
    ${ISLE_ON ? `<p class="muted small" style="margin:10px 0 0">* У острова «Последний свет» — в обычном тумане без бонусов; рыбачить там можно только с ${isl.ISLE_MIN_LEVEL}-го уровня, так что новичку эти доли не достанутся.</p>` : ''}
  </div>
</section>

<section id="factors">
  <h2>Что влияет на шансы</h2>
  <p class="sub">Все бонусы <b>умножают</b> шанс категорий от редких до божественной — ни один не делает крупную рыбу реже. Обычным достаётся то, что осталось. Ниже — каждый фактор с точными множителями.</p>
  <div class="grid g2">
    <div class="card factor"><div class="ic">🌧</div><div><h3>Дождь</h3><p>Все от редких до божественного кальмара клюют в <b>${num(fr.RAIN_MUL, 1)} раза</b> чаще — вместе со всеми твоими бонусами. Приходят «дождевые» рыбы: ${vidov(pierRain)} у пристани и ${barkRain} на баркасе, они платят в полтора раза больше. Опыт в дождь ×1,15.</p><p class="small muted">Дождь идёт 5–8 минут, между дождями 15–30 минут ясно. Бубен дождя у Семёна (1000 🪙) зовёт дождь сразу для всех.</p></div></div>
    <div class="card factor"><div class="ic">🎣</div><div><h3>Сезон рыбалки — сильнее всего</h3><p>Каждые <b>2 часа, в чётный час по Москве</b> (…, 18:00, 20:00, 22:00), ровно на 10 минут. Это особый дождь: дождевые рыбы клюют, а <b>все твои шансы</b> от редких до кальмара — <b>${mul(fr.SEASON_MUL)} к дождю</b>, со всеми бонусами. Обычных в сезон у всех — только пол, ${floorPct} рыбы.</p><ul class="mults"><li>к дождю <b>${mul(fr.SEASON_MUL)}</b></li><li>к ясной погоде <b>${mul(fr.RAIN_MUL * fr.SEASON_MUL)}</b></li><li>кальмар — тоже</li></ul></div></div>
    <div class="card factor"><div class="ic">⭐</div><div><h3>Уровень рыбалки</h3><p><b>+${num(fp.LEVEL_ODDS * 100, 1)} %</b> к шансу всех от редких до кальмара за каждый уровень, до ${LMAX}-го (на 10-м — ${mul(fp.levelOdds(10))}, на ${LMAX}-м — ${mul(fp.levelOdds(LMAX))}). Хлама на десятую меньше за уровень, с 10-го его нет. Зона на шкале тоже +2,5 % за уровень.</p><ul class="mults"><li>5-й ур. <b>${mul(fp.levelOdds(5))}</b></li><li>10-й ур. <b>${mul(fp.levelOdds(10))}</b></li><li>${LMAX}-й ур. <b>${mul(fp.levelOdds(LMAX))}</b></li></ul></div></div>
    <div class="card factor"><div class="ic"><img src="/fishing/img/rod-legendary.webp" alt=""></div><div><h3>Удочка — за задания Деда Семёна</h3><p>Редкие и выше: ×1,05 за каждую ступень. Ещё удочка увеличивает зону на шкале и ускоряет поклёвку на 10 / 20 / 30 / 40 %. Каждое следующее задание — на 5 рыб больше.</p><ul class="mults">${rods}</ul></div></div>
    <div class="card factor"><div class="ic"><img src="/fishing/img/shop-lure4.webp" alt=""></div><div><h3>Блесна — покупается навсегда</h3><p>Только <b>эпические и выше</b> (и кальмар) — блесна для крупной рыбы, на редких не действует. Ещё делает рывки рыбы мягче на ${sh.LURES.map((l) => Math.round(l.calm * 100)).join(' / ')} %.</p><ul class="mults">${lures}</ul></div></div>
    <div class="card factor"><div class="ic"><img src="/fishing/img/shop-ale.webp" alt=""></div><div><h3>Напитки — на 10 минут</h3><p>Действует один — последний выпитый. Пиво, эль и пиво владыки поднимают все категории от редких до кальмара и цену улова.</p><ul class="mults">${drinkLi(sh.BEER, `, ${sh.BEER.price} 🪙`)}${drinkLi(sh.ALE, `, ${sh.ALE.price} 🪙`)}${drinkLi(sh.LORD, ` (в 1 из ${lordIn} сундуков)`)}</ul></div></div>
    <div class="card factor"><div class="ic"><img src="/fishing/img/shop-vodka.webp" alt=""></div><div><h3>Водка рыбацкая — на риск</h3><p>${sh.VODKA.price} 🪙, ${Math.round(sh.VODKA.ms / 60_000)} минут. Эпические и выше, вместе с кальмаром, — <b>${mul(sh.VODKA.top ?? 1)}</b>, опыт за них ${mul(sh.VODKA.topXp ?? 1)}. Но зона на шкале <b>${vodkaZone}</b>, и ты пьян: зона после отпускания ещё 0,1 с едет по инерции, икаешь, шкала моргает. На редких не действует, доход не меняет.</p></div></div>
    <div class="card factor"><div class="ic">⚓</div><div><h3>Место: пристань или баркас</h3><p>Все 20 мест у набережной одинаковые. Баркас (с 3-го уровня, туда везёт Семён): своя рыба — ${vidov(barkCount)}, доли категорий почти как у пристани. Доход и опыт <b>×1,25</b>, но рыба злее: рывки ×1,15, сопротивление ×1,2 (кальмара море не злит).</p></div></div>
  </div>
  <div class="card" style="margin-top:16px">
    <h3>Как бонусы складываются</h3>
    <p style="margin:0 0 8px">Шанс категории = <b>база</b> × погода × уровень × удочка × напиток × (блесна и водка — для эпических и выше). Обычные — остаток до 100 %.</p>
    <p class="note" style="margin:10px 0 0"><b>Потолок.</b> Редкие и выше вместе занимают не больше ${num((1 - fr.COMMON_FLOOR) * 100, 1)} % рыбы: ${floorPct} всегда остаётся обычным — так обычная пикарель в дождь ловится у всех. Если редких и выше набралось больше, всем места не хватает. Тогда старшие категории получают свою долю целиком — божественная, мифическая, легендарная, эпическая, — а нехватку отдают младшие: сначала обычные (до этих ${floorPct}), потом редкие. Поэтому любой бонус только поднимает шанс поймать «эту категорию или выше» и средний доход за поклёвку. В сезон рыбалки обычных у всех — только ${floorPct} рыбы, а у прокачанного рыбака${exD[1] > 0 ? ' и редких почти нет' : ' нет и редких: остальные поклёвки — эпические или лучше'}.</p>
    <p class="okno" style="margin:10px 0 0"><b>Когда что считается.</b> Бонусы (уровень, удочка, блесна, напиток) запоминаются в момент <b>заброса</b> — выпил эль, потом забрасывай. А погода и сезон берутся в момент <b>поклёвки</b>: начался дождь, пока поплавок в воде, — он уже работает.</p>
  </div>
  <h3 style="margin:28px 0 12px">Что на шансы НЕ влияет</h3>
  <div class="myths">
    <div class="myth"><h4>Счастливое место на пирсе</h4><p>Нет: все 20 мест у набережной одинаковые. Разница только между пристанью, баркасом${ISLE_ON ? ' и островом' : ''}.</p></div>
    <div class="myth"><h4>Время суток</h4><p>Ночью и днём клюёт одинаково. По часам идёт только сезон рыбалки — в чётные часы по Москве.</p></div>
    <div class="myth"><h4>Долгое ожидание</h4><p>Сколько ждал поклёвку — неважно. Что клюнет, решает только жребий в момент поклёвки.</p></div>
    <div class="myth"><h4>Удочки из наград за журнал</h4><p>Только для красоты. На шансы влияет лишь удочка за задания Деда Семёна.</p></div>
    <div class="myth"><h4>Рюкзак</h4><p>Влияет только на то, сколько рыбы помещается: 5 без рюкзака, 10 / 15 / 20 с рюкзаками.</p></div>
    <div class="myth"><h4>Пинг и лаги</h4><p>На то, что клюнет, не влияют. Пинг лишь немного растягивает окно подсечки (до +0,6 с), чтобы было честно.</p></div>
  </div>
</section>

<section id="calc-s">
  <h2>Калькулятор шансов</h2>
  <p class="sub">Выбери снасти, погоду и место — увидишь шансы на каждую поклёвку. Считает по той же формуле, что и игра.</p>
  <div class="calc">
    <form class="card" id="calc" autocomplete="off">
      <div class="fld"><span>Место</span><div class="seg"><label><input type="radio" name="zone" value="pier" checked><span>Пристань</span></label><label><input type="radio" name="zone" value="barkas"><span>Баркас</span></label>${ISLE_ON ? '<label><input type="radio" name="zone" value="isle"><span>Остров</span></label>' : ''}</div></div>
      <div class="fld"><span>Погода</span><div class="seg"><label><input type="radio" name="weather" value="0" checked><span>☀️ Ясно</span></label><label><input type="radio" name="weather" value="1"><span>🌧 Дождь</span></label><label><input type="radio" name="weather" value="2"><span>🎣 Сезон рыбалки</span></label></div></div>
      <div class="fld"><span>Уровень рыбалки: <b id="calc-level-v">0</b></span><input type="range" id="calc-level" name="level" min="0" max="${LMAX}" step="1" value="0"><div class="lvl">${[0, 5, 10, 15].filter((l) => l <= LMAX).map((l) => `<span>${l}</span>`).join('')}</div></div>
      <label class="fld"><span>Удочка</span><select name="rod">${fp.RODS.map((r) => `<option value="${r.rod}">${r.name}${r.rod ? ` — ${mul(fp.rodOdds(r.rod))}` : ''}</option>`).join('')}</select></label>
      <label class="fld"><span>Блесна</span><select name="lure"><option value="0">Без блесны</option>${sh.LURES.map((l) => `<option value="${l.tier}">${l.name} — ${mul(l.epic)} к эпическим+</option>`).join('')}</select></label>
      <label class="fld"><span>Напиток</span><select name="drink"><option value="0">Без напитка</option>${[sh.BEER, sh.ALE, sh.LORD].map((d, i) => `<option value="${i + 1}">${d.name} — ${mul(d.rare)}</option>`).join('')}<option value="4">${sh.VODKA.name} — ${mul(sh.VODKA.top ?? 1)} к эпическим и выше</option></select></label>
    </form>
    <div class="card res">
      <h3>Шансы на одну поклёвку</h3>
      <div class="bar" id="calc-bar">${bar(newbie).replace(/^<div class="bar"[^>]*>|<\/div>$/g, '')}</div>
      <div class="rows" id="calc-rows"></div>
      <div class="hint" id="calc-hint"></div>
    </div>
  </div>
</section>

<section id="examples">
  <h2>Разобранные примеры</h2>
  <p class="sub">Посчитано по формуле игры. Проценты — доля от всех поклёвок, включая сундуки и хлам.</p>
  <div class="ex">
    ${EX.slice(0, 3).map((e) => `<div class="card"><h3>${esc(e.title)}</h3><p class="who">${esc(e.who)}</p>${bar(e.p)}${legend(e.p)}${e.key === 'c' ? `<div class="calcline"><b>Как посчитано — сверху вниз, в долях рыбы (без сундука и хлама).</b> ${BC.parts.map((x) => `${TN[RANK_T[x.k]]}: ${pct(x.base)} × ${num(x.wm, 2)} × ${num(x.bm, 3)} = <b>${pct(x.v)}</b>${x.got < x.v - 1e-12 ? ` — но места осталось только <b>${pct(x.got)}</b>` : ''}`).join('; ')}. ${BC.left > 1e-12 ? `Обычным — остаток ${pct(BC.left + fr.COMMON_FLOOR)}.` : `Обычным — только пол, ${floorPct}: меньше не бывает.`} Потом ×${dec(1 - (fr.CHEST_PER_10K + fr.junkPer10k(LMAX)) / 10_000, 2)}: ${chestPct} % поклёвок — сундук, хлама с 10-го уровня нет. <br>Здесь ${num(BC.parts[0].wm, 2)} — дождь, ${num(BC.parts[4].bm, 3)} — уровень ${mul(fp.levelOdds(LMAX))}, удочка ${mul(fp.rodOdds(4))} и эль ${mul(sh.ALE.rare)}; у эпических и выше ещё блесна ${mul(sh.LURE_MAX.epic)}.${BC_CUT ? ` ${TN[RANK_T[BC_CUT.k]]} — нижние под потолком: старшие взяли своё целиком.` : ''}</div>` : ''}</div>`).join('')}
    <div class="card"><h3>Все примеры рядом</h3><div class="scroll"><table class="tbl"><thead><tr><th>Категория</th>${EX.map((e) => `<th>${esc(e.title)}</th>`).join('')}</tr></thead><tbody>${exRows}</tbody></table></div>
    <p class="muted small" style="margin:12px 0 0">Вывод: у прокачанного рыбака в дождь обычных — только пол, остальные поклёвки не хуже редкой. Сезон рыбалки удваивает все шансы, пока хватает места: ${exTop}, эпических — ${exRatio(2)}, а ${exD[1] > 0 ? 'редких становится меньше' : 'редких не остаётся совсем'} — их место занимают эпические и выше.</p></div>
  </div>
</section>

<section id="fish">
  <h2>Все рыбы</h2>
  <p class="sub">«В категории» — как часто клюёт этот вид среди рыб своей категории. В дождь приходят дождевые виды и забирают часть поклёвок у остальных. Вес у крупных экземпляров выпадает реже, цена растёт с весом.</p>
  <div class="zone-h"><h3>У пристани</h3><span class="muted">${vidov(pierCount)}, из них ${pierRain} — только в дождь</span></div>
  ${fishZone('pier')}
  <div class="zone-h"><h3>На баркасе, в открытом море</h3><span class="muted">${vidov(barkCount)}, из них ${barkRain} — только в дождь · с 3-го уровня · цены ×1,25 уже учтены</span></div>
  ${fishZone('barkas')}
  ${ISLE_ON ? `<div class="zone-h" id="isle"><h3>🏝 У острова «Последний свет»</h3><span class="muted">${vidov(isleCount)}, из них ${isleFog} — только в туман («Туман наступает», цена ×1,5) · с ${isl.ISLE_MIN_LEVEL}-го уровня · свой счётчик в журнале · кальмар и гренландская акула здесь не клюют</span></div>
  ${fishZone('isle')}` : ''}
</section>

<section id="reel">
  <h2>Вываживание: почему рыба срывается</h2>
  <p class="sub">Подсёк вовремя — начинается шкала. Шансы решают, <i>кто</i> клюнет, а шкала — <i>вытащишь ли</i>.</p>
  <div class="card reel">
    <div class="meter" aria-hidden="true"><div class="scale"><div class="zone"></div><div class="fishmark">🐟</div></div><div class="prog"><i></i></div></div>
    <ul class="keys">
      <li><span class="k">⬆️</span><p><b>Держишь кнопку — зона идёт вверх, отпустил — опускается.</b> Зона с инерцией и отскакивает от краёв.</p></li>
      <li><span class="k">🟢</span><p><b>Рыба в зоне — улов подтягивается</b> на 15 % в секунду. Начинается с 25 %, так что чистых 5 секунд в зоне хватит.</p></li>
      <li><span class="k">🔻</span><p><b>Рыба вне зоны — улов тает</b> со скоростью её сопротивления (таблица ниже). Дошло до 0 % — сорвалась.</p></li>
      <li><span class="k">🪢</span><p><b>Леска провисла:</b> зона лежит на дне и ты не подматываешь дольше ${slackSec} с — улов тает, даже если рыба в зоне.</p></li>
      <li><span class="k">🎣</span><p><b>Леска натянута:</b> зона прижата к самому верху дольше ${tautSec} с — улов тоже тает, а в чат приходит «Леска слишком натянута, возможен обрыв!». Отпусти на миг.</p></li>
      <li><span class="k">↕️</span><p><b>Рыба не прячется в краях:</b> она держится в ${edgePct}–${edgeTop} % шкалы — зону всегда можно на неё навести.</p></li>
      <li><span class="k">⚡</span><p><b>Последний рывок:</b> легендарные и мифические на 70 % ускоряются в 1,3 раза, кальмар — в 1,5.</p></li>
      <li><span class="k">⏱</span><p>Бой дольше 90 секунд — леска устаёт, рыба сходит.</p></li>
    </ul>
  </div>
  <div class="card" style="margin-top:16px"><div class="scroll"><table class="tbl"><thead><tr><th>Категория</th><th>Зона</th><th>Подсечь за</th><th>Сопротивление</th><th>Бой</th><th>Вытаскивают*</th></tr></thead><tbody>${reelRows}</tbody></table></div>
  <p class="muted small" style="margin:12px 0 0">Зона — у новичка; растёт на 2,5 % за уровень и на 10–40 % от удочки (максимум в ${num(fr.ZONE_SCALE_MAX, 1)} раза), водка ${VZ === 0.5 ? 'делит её пополам' : `уменьшает её на ${Math.round((1 - VZ) * 100)} %`}. Подсечь — после того как поплавок ушёл под воду (плюс твой пинг, до 0,6 с). * Замер разработчиков на модели «среднего» игрока 0-го уровня без бонусов; кальмара на ${LMAX}-м уровне с легендарной удочкой и платиновой блесной вытаскивают в 69–89 % случаев.</p></div>
  <div class="card" style="margin-top:16px"><h3>Оценка вываживания</h3><p class="muted small" style="margin:0 0 8px">Ошибка — каждый выход рыбы из зоны. Счёт виден под шкалой, итог — крупно на шкале и в карточке улова. Оценка множит опыт за рыбу; отпустишь её — ещё ${relXp}.</p><div class="scroll"><table class="tbl"><thead><tr><th>Ошибок</th><th class="l">Оценка</th><th>Опыт</th></tr></thead><tbody>${gradeRows}</tbody></table></div></div>
  <h3 style="margin:28px 0 12px">Советы</h3>
  <ul class="tips">
    <li><b>Не подсекай на пробах.</b> Поплавок дёрнулся, но не ушёл под воду — это проба. Подсечёшь сейчас — рыба уйдёт.</li>
    <li><b>Подсекай сразу.</b> У мифических на это 0,65 с, у кальмара — 0,6 с.</li>
    <li><b>Не роняй зону на дно.</b> Рыба у дна? Держи зону внизу короткими нажатиями — иначе «леска провиснет».</li>
    <li><b>Не прижимай зону к верху.</b> Держишь её у самого верха дольше ${tautSec} с — «леска натянута», улов тает: отпусти на миг.</li>
    <li><b>Веди чисто — опыта больше.</b> Без единой ошибки — ${mul(gBest.xp)}, а ${gradeSpan(G.length - 1)} ошибок — всего ${mul(gWorst.xp)} (таблица выше).</li>
    <li><b>Жетоны не нужны — отпускай.</b> «Отпустить» (F) даёт опыт ${relXp} и не занимает рюкзак. Нужны жетоны — «В рюкзак» (1) и к Деду Семёну.</li>
    <li><b>Сорвалась крупная — не всё потеряно.</b> Эпическая и выше после 3 секунд боя даёт четверть опыта даже если ушла.</li>
    <li><b>Водку бери, только если уверенно держишь шкалу.</b> Крупных клюёт вдвое больше, но зона ${vodkaZone}, а рыбак пьян.</li>
  </ul>
</section>

<section id="chest">
  <h2>Сундуки, хлам и уровни</h2>
  <div class="grid g3">
    <div class="card"><h3>Что в сундуке</h3><p class="muted small" style="margin:0 0 8px">Сундук — ${chestPct} % всех поклёвок. Клад Посейдона — ${posCoins} 🪙: шанс внутри сундука линейно растёт с ${posMinPct} % на 1-м уровне рыбалки до ${posPct} % на 15-м (на 0-м тоже ${posMinPct} %). О находке узнаёт весь сервер. В 1 из ${lordIn} сундуков ещё и пиво подводного владыки: выпивается сразу.</p><table class="tbl"><thead><tr><th>Жетоны</th><th>Ур. 0–1</th><th>Ур. 15</th></tr></thead><tbody>${chestRows}</tbody></table></div>
    <div class="card"><h3>Сколько хлама</h3><p class="muted small" style="margin:0 0 8px">Сапог (7 из 10) или бутылка с запиской. Ничего не стоят.</p><table class="tbl"><thead><tr><th>Уровень</th><th>Хлам</th></tr></thead><tbody>${junkRows}</tbody></table></div>
    <div class="card"><h3>Уровни рыбалки</h3><p class="muted small" style="margin:0 0 8px">Опыт за каждую рыбу: чем реже, тем больше. Легендарные и выше — ×5, оценка вываживания — от ${mul(gWorst.xp)} до ${mul(gBest.xp)}, отпустить рыбу — ${relXp}, дождь — ×1,15, баркас — ×1,25. Каждый уровень — +2,5 % к зоне и к шансам редких и выше; ${XP_TOP}-й — высший.</p><table class="tbl"><thead><tr><th>Уровень</th><th>Опыта всего</th></tr></thead><tbody>${fp.FISH_XP_LEVELS.slice(1).map((x, i) => `<tr><td>${i + 1}${i + 1 === 3 ? ' · баркас' : ''}</td><td class="num">${x.toLocaleString('ru-RU').replace(/\s/g, ' ')}</td></tr>`).join('')}</tbody></table></div>
  </div>
</section>
</main>
<footer><div class="wrap">Все цифры взяты из кода игры TIREDWOOD с учётом патча рыбалки 5 октября 2026${ISLE_ON ? ' и острова «Последний свет» (октябрь 2026)' : ''}. Шансы категорий — доли всех поклёвок; шансы находок в сундуке — доли сундуков. Справочник обновляется вместе с игрой.</div></footer>
</body>
</html>
`;
fs.writeFileSync(OUT + 'index.html', html);

// ---------- app.js: данные калькулятора из кода
const DATA = {
  BASE, LEVEL_ODDS: fp.LEVEL_ODDS, LEVEL_MAX: LMAX, SEASON_MUL: fr.SEASON_MUL, RAIN_MUL: fr.RAIN_MUL, EPIC_MAX: sh.LURE_MAX.epic, COMMON_FLOOR: fr.COMMON_FLOOR,
  JUNK: fr.JUNK_PER_10K, CHEST: fr.CHEST_PER_10K, VODKA_ZONE: VZ, ISLE_LEVEL: isl.ISLE_MIN_LEVEL,
  lures: [null, ...sh.LURES.map((l) => ({ epic: l.epic }))],
  drinks: [null, ...[sh.BEER, sh.ALE, sh.LORD, sh.VODKA].map((d) => ({ rare: d.rare, ...(d.top ? { top: d.top } : {}) }))],
};
const src = fs.readFileSync(new URL('./app.src.js', import.meta.url), 'utf8').replace('__DATA__', JSON.stringify(DATA));
fs.writeFileSync(OUT + 'app.js', src);
console.log('ok', html.length, src.length);
process.exit(0);
