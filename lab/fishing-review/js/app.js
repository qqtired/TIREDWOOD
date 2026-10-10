// Страница ревью рыбалки: острова «Последний свет», лодок и способностей.
// Все числа — из data/*.json; 3D (three.js) грузится только по нажатию «Запустить 3D» — см. js/viewers.js.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (n, d = 0) => Number(n).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
const nf1 = (n) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const icon = (id, cls = 'ico') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COIN = '<svg class="coin" viewBox="0 0 16 16" role="img" aria-label="жетонов"><circle cx="8" cy="8" r="6.6"/><circle cx="8" cy="8" r="3.8" fill="none"/></svg>';
// 🪙 в текстах → нарисованный жетон (эмодзи в разных системах выглядит по-разному)
// неразрывные пробелы: «60 %», «ур. 10», «3 мин»
const NB = [[/(\d) (%|м\/с|км\/ч|п\. п\.|🪙|(?:м|с|ч|мин|кг|г|т|уз|тыс\.)(?![а-яё]))/g, '$1\u00a0$2'], [/(ур\.|×) (\d)/g, '$1\u00a0$2'], [/ ([—–]) /g, '\u00a0$1 ']];
function typo(n) { let s = n.nodeValue; for (const [re, to] of NB) s = s.replace(re, to); if (s !== n.nodeValue) n.nodeValue = s; }
function coinify(root = document.body) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (!n.parentElement.closest('pre, title, script, style') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  const list = [];
  const digits = [];
  while (w.nextNode()) {
    const n = w.currentNode;
    typo(n);
    if (n.nodeValue.includes('🪙') && !n.parentElement.closest('svg')) list.push(n);
    // у Alegreya старостильные цифры: «0» похож на «о» — цифры в заголовках набираем Rubik
    else if (/\d/.test(n.nodeValue) && !n.parentElement.closest('svg, .dg') && /Alegreya/.test(getComputedStyle(n.parentElement).fontFamily)) digits.push(n);
  }
  for (const n of digits) {
    const span = document.createElement('span');
    span.innerHTML = esc(n.nodeValue).replace(/\d+(?:[,.\u00a0 ]\d+)*/g, (m) => `<span class="dg">${m}</span>`);
    n.replaceWith(...span.childNodes);
  }
  for (const n of list) {
    const span = document.createElement('span');
    span.innerHTML = esc(n.nodeValue).replace(/[\s\u00a0]?🪙/g, '&nbsp;' + COIN);
    n.replaceWith(...span.childNodes);
  }
}

const TIERS = {
  0: { one: 'обычная', many: 'обычные', css: '--t0' },
  1: { one: 'редкая', many: 'редкие', css: '--t1' },
  2: { one: 'эпическая', many: 'эпические', css: '--t2' },
  3: { one: 'легендарная', many: 'легенды', css: '--t3' },
  4: { one: 'мифическая', many: 'мифики', css: '--t4' },
  7: { one: 'божественная', many: 'божественная', css: '--t7' },
};
const tc = (t) => `var(${(TIERS[t] || TIERS[0]).css})`;
const PATTERN = {
  Dash: 'рывок', FakeDash: 'ложный рывок', Sawtooth: 'пила', HoverDash: 'зависание и рывок', SlowMigration: 'медленный уход',
  EdgeSnapback: 'к краю и назад', DoubleDash: 'двойной рывок', Wave: 'волна', Nervous: 'нервная', Ambush: 'засада',
  Breach: 'свечка', Sound: 'уход на глубину', Circle: 'круги', Zigzag: 'зигзаг', Jet: 'реактивный рывок',
};

async function getJSON(path, optional = false) {
  try {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return await r.json();
  } catch (e) {
    if (optional) return null;
    throw e;
  }
}
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватное окно */ } },
};

// ------------------------------------------------------------------------------------------------ загрузка
let D = {};
async function main() {
  const [review, abilities, island, reel, cosmetics, world, economy] = await Promise.all([
    getJSON('data/review.json'), getJSON('data/abilities.json'), getJSON('data/island.json'),
    getJSON('data/island-reel.json', true), getJSON('data/cosmetics.json'), getJSON('data/world.json'), getJSON('data/economy.json'),
  ]);
  D = { review, abilities, island, reel, cosmetics, world, economy };
  const steps = [renderHeader, renderFixes, renderAbilities, renderLevels, renderBoats, renderMap, renderIsland, renderFish, renderEconomy, renderCosmetics, renderQuestions];
  for (const f of steps) {
    try { f(); } catch (e) { console.error(f.name, e); }
  }
  setupCourse();
  setupViewers();
  setupLightbox();
  coinify();
}
main().catch((e) => {
  console.error(e);
  document.querySelectorAll('.skel').forEach((el) => { el.textContent = 'Не удалось загрузить данные: ' + e.message + '. Открой страницу через сервер, а не как файл.'; });
});

// ------------------------------------------------------------------------------------------------ шапка
function renderHeader() {
  const r = D.review;
  $('#h-kicker').textContent = r.kicker;
  const m = r.title.match(/^(.*?)(«.*»)$/);
  $('#h-title').innerHTML = m ? `${esc(m[1])}<em>${esc(m[2])}</em>` : esc(r.title);
  $('#h-lead').textContent = r.lead;
  $('#h-decide').textContent = r.decide;
  $('#h-decisions').innerHTML = r.decisions.map((d) => `<a href="${esc(d.href)}"${d.accent ? ' class="accent"' : ''}><b>${esc(d.title)}</b><span>${esc(d.sub)}</span></a>`).join('');
}

function renderFixes() {
  $('#fix-list').innerHTML = D.review.hotfixes.map((f) => `
    <article class="panel fix${f.pics ? ' wide' : ''}">
      ${icon(f.icon)}
      <b>${esc(f.title)}</b>
      <p>${esc(f.text)}</p>
      ${f.pics ? `<div class="pics">${f.pics.map((p) => `<figure><img src="${esc(p.src)}" alt="${esc(p.name)}" loading="lazy"><b>${esc(p.name)}</b>${esc(p.sub)}</figure>`).join('')}</div>` : ''}
    </article>`).join('');
}

// ------------------------------------------------------------------------------------------------ способности
const GLYPH = {
  breach: '<rect x="18" y="22" width="20" height="46" rx="3" class="g-bar"/><path d="M18 22 v-16 h20 v16" class="g-new"/><path d="M18 22 l5 -3 4 4 4 -4 3 3 4 -2" class="g-crack"/><rect x="18" y="44" width="20" height="10" class="g-zone"/>',
  ink: '<rect x="18" y="6" width="20" height="62" rx="3" class="g-bar"/><path d="M18 6 h20 v34 q-3 6 -5 0 q-2 8 -5 2 q-3 7 -5 0 q-3 5 -5 -2z" class="g-ink"/><rect x="18" y="48" width="20" height="12" class="g-zone"/>',
  wind: '<rect x="18" y="6" width="20" height="62" rx="3" class="g-bar"/><rect x="18" y="36" width="20" height="12" class="g-zone"/><path d="M4 20 h40 m-6 -5 l6 5 -6 5" class="g-line"/><path d="M8 30 h26" class="g-line" opacity=".5"/>',
  herring: '<rect x="4" y="6" width="16" height="62" rx="3" class="g-bar" opacity=".45"/><rect x="25" y="8" width="9" height="16" rx="2" class="g-bar"/><rect x="25" y="29" width="9" height="16" rx="2" class="g-bar"/><rect x="25" y="50" width="9" height="16" rx="2" class="g-bar"/><rect x="25" y="13" width="9" height="5" class="g-zone"/><path d="M40 16 l3 3 6 -7" class="g-line"/>',
  surge: '<rect x="8" y="58" width="40" height="7" rx="3" class="g-bar"/><rect x="8" y="58" width="27" height="7" rx="3" class="g-zone"/><path d="M40 46 c-6 -12 -18 -12 -22 -2 m0 0 l-2 -6 m2 6 l6 -1" class="g-line"/><circle cx="28" cy="22" r="7" class="g-ink" opacity=".35"/>',
  whip: '<rect x="18" y="6" width="20" height="62" rx="3" class="g-bar"/><rect x="18" y="24" width="20" height="12" class="g-zone"/><path d="M50 8 c-14 2 -8 14 -16 20" class="g-line"/><path d="M28 40 v16 m-5 -5 l5 5 5 -5" class="g-line"/>',
  fog: '<rect x="18" y="6" width="20" height="62" rx="3" class="g-bar"/><rect x="14" y="16" width="28" height="9" rx="4" class="g-fog"/><rect x="14" y="44" width="28" height="9" rx="4" class="g-fog"/><rect x="18" y="30" width="20" height="10" class="g-zone"/>',
  teeth: '<rect x="18" y="6" width="20" height="62" rx="3" class="g-bar"/><path d="M18 20 l9 3 -9 3z M38 46 l-9 3 9 3z" class="g-ink"/><rect x="18" y="30" width="20" height="10" class="g-zone"/>',
};
const glyph = (k) => `<svg class="glyph" viewBox="0 0 56 72" aria-hidden="true"><style>.g-bar{fill:var(--paper-2);stroke:var(--ink-3);stroke-width:1.5}.g-new{fill:none;stroke:var(--tc);stroke-width:2;stroke-dasharray:3 3}.g-crack{fill:none;stroke:var(--ink);stroke-width:1.6}.g-zone{fill:var(--tc);opacity:.75}.g-ink{fill:var(--ink)}.g-line{fill:none;stroke:var(--ink);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.g-fog{fill:var(--fog);opacity:.95}</style>${GLYPH[k] || ''}</svg>`;

function reelSpecies(id) { return D.reel?.species?.find((s) => s.id === id) || null; }
function reelChips(key) {
  const a = D.reel?.abilities?.[key] || reelSpecies(key)?.ability;
  if (!a) return null;
  const s = (t) => nf1(t / 60) + ' с';
  switch (a.id) {
    case 'surge': return [`вдох ${s(a.warn)}`, `улов −${a.drop} п. п., не ниже ${a.floor} %`, `скорость ×${nf1(a.spdMul / 100)}`, `зона ×${nf1(a.zoneMul / 100)}`];
    case 'whip': return [`замах ${s(a.swing)}`, `раз в ${nf1(a.every[0] / 60)}–${nf1(a.every[1] / 60)} с`, `удар ${a.kick} % шкалы`, a.down === 67 ? '2 из 3 — вниз' : `вниз ${a.down} %`];
    case 'fog': return [`2 полосы по ${a.band} %`, `плывут ${a.drift[0]}–${a.drift[1]} %/с`, `стена ${a.wall} % на ${s(a.wallDur)}`, `раз в ${s(a.wallEvery)}`];
    case 'teeth': return [`${a.count} зуба по ${a.size} %`, a.cycle ? `острые ${s(a.cycle[0])} → тупые ${s(a.cycle[1])} → мерцают ${s(a.cycle[2])}` : 'острые всегда', `задел — −${a.cut} % улова`, 'второй укус — обрыв'];
    default: return null;
  }
}

function renderAbilities() {
  const A = D.abilities;
  $('#ab-rules').innerHTML = A.rules.map((r) => `<div class="panel rule">${icon(r.icon)}<b>${esc(r.title)}</b><p>${esc(r.text)}</p></div>`).join('');
  const f = A.fillTime;
  // Обе полосы стартуют вместе (цикл 7,5 с): «было» заполняется за 5 с, «стало» — за 6 с.
  $('#ab-fill').innerHTML = `
    <span>Было <b class="num">${nf(f.before)} с</b></span><div class="bar"><i></i></div><span class="muted">${esc(f.label)}</span>
    <span>Стало <b class="num">${nf(f.after)} с</b></span><div class="bar now"><i></i></div><span class="muted">мификам и божественной: +${Math.round((f.after / f.before - 1) * 100)} % времени в зоне</span>`;
  $('#ab-cards').innerHTML = A.cards.map((c) => {
    let lv = '', chips = c.chips;
    if (c.isle) {
      const sp = reelSpecies(c.key);
      chips = reelChips(c.key) || chips;
      if (sp) {
        const w = sp.success.lvl10[0], wo = sp.lvl10NoAbility?.[0];
        lv = `<div class="lv"><span>ур. 10, «обычный», остров</span>
          ${wo != null ? `<div class="row"><span>без приёма</span><div class="track"><i style="width:${wo}%"></i></div><b>${wo} %</b></div>` : ''}
          <div class="row"><span>с приёмом</span><div class="track"><i class="now" style="width:${w}%"></i></div><b>${w} %</b></div></div>`;
      } else {
        const isp = D.island.species.find((s) => s.id === c.key);
        if (isp) lv = `<div class="lv"><span>ур. 10, «обычный», без приёма</span><div class="row"><span>успех</span><div class="track"><i class="now" style="width:${isp.successTypicalPct.lvl10}%"></i></div><b>${isp.successTypicalPct.lvl10} %</b></div></div>`;
      }
    } else if (c.lvl10) {
      lv = `<div class="lv"><span>ур. 10, «обычный» · ${esc(c.fight || '')}</span>
        <div class="row"><span>было</span><div class="track"><i style="width:${c.lvl10.was}%"></i></div><b>${c.lvl10.was} %</b></div>
        <div class="row"><span>стало</span><div class="track"><i class="now" style="width:${c.lvl10.now}%"></i></div><b>${c.lvl10.now} %</b></div></div>`;
    }
    return `<article class="panel ab" style="--tc:${tc(c.tier)}">
      <div class="top"><div><div class="who"><b>${esc(c.name)}</b>${esc(TIERS[c.tier].one)} · ${esc(c.place)}</div>
        <img class="fishpic" src="${esc(c.img)}" alt="" loading="lazy"></div>${glyph(c.glyph)}</div>
      <h4>«${esc(c.ability)}»</h4>
      <p>${esc(c.text)}</p>
      <div class="chips">${chips.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>
      ${lv}
      <button class="btn try" type="button" data-try="${esc(c.key)}">${icon('play')}Попробовать на шкале</button>
    </article>`;
  }).join('');
  $('#ab-cards').addEventListener('click', (e) => {
    const b = e.target.closest('[data-try]');
    if (!b) return;
    const fr = $('#ab-frame');
    fr.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
    try {
      const tab = fr.contentDocument?.querySelector(`.tab[data-k="${b.dataset.try}"]`);
      tab?.click();
    } catch { /* другой источник — просто прокрутили */ }
  });
  // высота iframe — по содержимому
  const fr = $('#ab-frame');
  const fit = () => {
    try {
      const doc = fr.contentDocument;
      if (!doc?.body) return;
      const h = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
      if (h > 200) fr.style.height = h + 'px';
    } catch { /* нет доступа */ }
  };
  // Без ResizeObserver: анимация шкалы внутри меняла высоту каждый кадр, и страница дёргалась при прокрутке.
  // Подгоняем высоту при загрузке и после кликов по вкладкам, и только в большую сторону.
  let fitH = 0;
  const fitOnce = () => {
    try {
      const doc = fr.contentDocument;
      if (!doc?.body) return;
      const h = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
      if (h > fitH + 8) { fitH = h; fr.style.height = h + 'px'; }
    } catch { /* нет доступа */ }
  };
  fr.addEventListener('load', () => {
    fitOnce();
    try { fr.contentDocument.addEventListener('click', () => setTimeout(fitOnce, 120)); } catch { /* ок */ }
  });

  // таблица успеха
  const T = A.successTable;
  $('#succ-gear').textContent = T.gear;
  let mode = 0;
  const draw = () => {
    const head = `<thead><tr><th>Группа</th>${T.levels.map((l) => `<th>Ур. ${l}<br><span class="muted">было → стало</span></th>`).join('')}</tr></thead>`;
    const body = T.rows.map((r) => `<tr style="--tc:${tc(r.tier)}"><th class="rowh" scope="row">${esc(r.name)}</th>${r.cells.map(([was, now]) => {
      const a = was[mode], b = now[mode], d = b - a;
      const cls = d <= -3 ? 'dn' : d >= 3 ? 'up' : '';
      return `<td><div class="cell"><span class="v"><s>${a}</s> → <b class="${cls}">${b}</b>${d ? ` <span class="muted small">(${d > 0 ? '+' : '−'}${Math.abs(d)})</span>` : ''}</span><span class="bars"><i style="width:${a}%"></i><i class="now" style="width:${b}%"></i></span></div></td>`;
    }).join('')}</tr>`).join('');
    $('#succ-table').innerHTML = head + `<tbody>${body}</tbody>`;
  };
  draw();
  $('#succ-mode').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-m]');
    if (!b) return;
    mode = +b.dataset.m;
    $$('#succ-mode button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });

  const C = A.camping;
  $('#camp-table').innerHTML = `<thead><tr><th>Вид</th>${C.levels.map((l) => `<th class="n">Ур. ${l}</th>`).join('')}</tr></thead><tbody>${C.rows.map((r) => `<tr><td>${r.flag ? '<b>' : ''}${esc(r.name)}${r.flag ? '</b>' : ''}</td>${r.was.map((w, i) => `<td class="n">${w === r.now[i] ? `<b style="color:var(--bad)">${w}</b>` : `<s class="muted">${w}</s> → <b>${r.now[i]}</b>`}</td>`).join('')}</tr>`).join('')}</tbody>`;
  $('#ab-decided').innerHTML = A.decided.map((x) => `<li>${esc(x)}</li>`).join('');
}

// ------------------------------------------------------------------------------------------------ уровни
function renderLevels() {
  const A = D.abilities;
  $('#perks-base').textContent = A.perksBase + ' Повтор имени — следующая ступень того же бонуса.';
  $('#ladder').innerHTML = A.perks.map((p) => `
    <div class="panel step${p.strong ? ' strong' : ''}" style="--p:${Math.round(p.lvl / 15 * 100)}%">
      <span class="rise"></span>
      <span class="lvn">${p.lvl}${icon(p.icon)}</span>
      <b>${esc(p.name)}</b>
      <p>${esc(p.what)}</p>
      <span class="chip eff${p.strong ? ' beam' : ''}">${esc(p.effect)}</span>
    </div>`).join('');
  const I = A.perksImpact;
  $('#perk-impact').innerHTML = `<thead><tr><th>Уровень</th>${I.cols.map((c) => `<th class="n">${esc(c)}</th>`).join('')}</tr></thead><tbody>${I.rows.map((r) => `<tr><td>${r.lvl}-й</td>${r.cells.map(([a, b]) => {
    const d = b - a;
    return `<td class="n">${a} → <b style="${d >= 3 ? 'color:var(--good)' : d <= -2 ? 'color:var(--bad)' : ''}">${b}</b></td>`;
  }).join('')}</tr>`).join('')}</tbody>`;
  $('#perk-summary').textContent = I.summary + ' Вычеркнуто после симуляций: ' + A.struck.join('; ') + '.';
}

// ------------------------------------------------------------------------------------------------ лодки
const boatState = { id: 'northsilver', viewer: null };
function renderBoats() {
  const B = D.island.boats;
  const maxTop = Math.max(...B.map((b) => b.top)), maxAcc = Math.max(...B.map((b) => b.accel)), maxTurn = Math.max(...B.map((b) => b.turn));
  $('#boat-cards').innerHTML = B.map((b) => `
    <button type="button" class="panel boat" data-b="${b.id}" aria-pressed="${b.id === boatState.id}">
      <img src="data/thumbs/${b.id}.jpg" alt="Лодка «${esc(b.name)}»" loading="lazy">
      <div class="bd">
        <h4>«${esc(b.name)}»</h4>
        <span class="proto">Прототип: ${esc(b.prototype)}, ${nf1(b.length)} м</span>
        <div class="meter"><span>скорость</span><span class="tr"><i style="width:${b.top / maxTop * 100}%"></i></span><b>${nf1(b.top)} м/с</b></div>
        <div class="meter"><span>разгон</span><span class="tr"><i style="width:${b.accel / maxAcc * 100}%"></i></span><b>${nf1(b.accelS)} с</b></div>
        <div class="meter"><span>поворот</span><span class="tr"><i style="width:${b.turn / maxTurn * 100}%"></i></span><b>R ${nf1(b.turnRadiusAtTop)} м</b></div>
        <div class="chips"><span class="chip beam">клёв с якоря +${Math.round(b.bonus.biteSpeedFromBoat * 100)} %</span><span class="chip">якорь ${nf1(b.anchorS)} с</span><span class="chip">${b.seats} места</span></div>
        <div class="trip"><span class="muted small">до вод острова</span><b class="num">${esc(b.toIsleWaters)}</b></div>
        <div class="price"><span>с ${b.level}-го уровня</span><span class="num">${nf(b.price)} 🪙</span></div>
      </div>
    </button>`).join('');
  $('#boat-cards').addEventListener('click', (e) => {
    const c = e.target.closest('.boat');
    if (c) selectBoat(c.dataset.b, true);
  });
  $('#boat-pick').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-b]');
    if (b) selectBoat(b.dataset.b, true);
  });

  const row = (label, f) => `<tr><th scope="row">${label}</th>${B.map((b) => `<td>${f(b)}</td>`).join('')}</tr>`;
  $('#boat-table').innerHTML = `<thead><tr><th></th>${B.map((b) => `<th>«${esc(b.name)}»</th>`).join('')}</tr></thead><tbody>
    ${row('С уровня рыбалки · цена', (b) => `<b>${b.level}</b> · <span class="num">${nf(b.price)} 🪙</span>`)}
    ${row('Прототип', (b) => `${esc(b.prototype)}<br><span class="muted">${nf1(b.real.length)} × ${nf1(b.real.beam)} м, ${esc(b.real.hull)}, ${esc(b.real.motor)}</span>`)}
    ${row('Длина × ширина в игре', (b) => `${nf1(b.length)} × ${nf1(b.beam)} м`)}
    ${row('Скорость', (b) => `<b>${nf1(b.top)} м/с</b> · ${b.topKmh} км/ч · ${b.topKn} уз`)}
    ${row('Разгон до полного', (b) => `${nf1(b.accelS)} с (${nf1(b.accel)} м/с²)`)}
    ${row('Назад', (b) => `${nf1(b.reverse)} м/с`)}
    ${row('Поворот на полном ходу', (b) => `${nf1(b.turn)} рад/с, радиус ${nf1(b.turnRadiusAtTop)} м`)}
    ${row('Места', (b) => `${b.seats}: штурвал + 2 сзади`)}
    ${row('Якорь', (b) => `${nf1(b.anchorS)} с`)}
    ${row('Эхолот: клёв с якоря', (b) => `на ${Math.round(b.bonus.biteSpeedFromBoat * 100)} % быстрее`)}
    ${row('Оборудование', (b) => `<span class="small">${b.equipment.map(esc).join('; ')}</span>`)}
    ${row('До вод острова / до причала', (b) => `<b class="num">${esc(b.toIsleWaters)}</b> / +${b.toDockExtraS} с`)}
    ${row('Треугольников, бюджет LOD0 / LOD1', (b) => `<span class="num">${nf(b.tris.lod0)} / ${nf(b.tris.lod1)}</span>`)}
  </tbody>`;

  const keys = [
    ['E', 'у берта: вызвать лодку, сесть за штурвал или пассажиром'],
    ['W / S', 'газ / назад (сначала тормоз)'],
    ['A / D', 'руль; на месте лодка медленно разворачивается'],
    ['Z', 'бросить / поднять якорь'],
    ['Пробел', 'гудок, слышно на 150 м'],
    ['E', 'в 25 м от причала: пришвартоваться, потом выйти'],
    ['Мышь', 'осмотреться'],
    ['ЛКМ', 'с якоря — заброс, как на мостках'],
  ];
  $('#boat-keys').innerHTML = keys.map(([k, t]) => `<div><kbd>${esc(k)}</kbd><span>${esc(t)}</span></div>`).join('');
  const R = D.island.boatRules;
  $('#boat-rules').textContent = `Пассажиры — с ${R.levels.passenger}-го уровня рыбалки, рыбалка у острова — с ${R.levels.isleFishing}-го. У игрока одна лодка, в мире — до ${R.worldMax}. Выйти можно только у стоянки или у причала острова. Якорь нельзя бросить ближе 12 м к причалам и баркасу.`;
  renderBoatSide();
}

function renderBoatSide(info) {
  const side = $('#boat-side');
  if (boatState.id === 'pier') {
    const P = D.island.world.parking, R = D.island.boatRules;
    side.innerHTML = `<h4>${esc(P.name)}</h4>
      <p>Понтон ${esc(P.behind)}. ${P.berths} мест, лодки стоят ${esc(P.mooring)}.</p>
      <ul><li>Стоят не больше <b>${P.maxParked}</b> лодок — <b>${P.keepFree}</b> места всегда свободны, а пирс выглядит полным.</li>
      <li>Девятой лодке нужен берт — уходит та, что дольше всех стоит без хозяина на борту. Хозяину — тост.</li>
      <li>Хозяин ушёл из игры — его лодка у причала исчезает через 30 мин, в море — через 10 с (пассажиров отвозит Гоша).</li>
      <li>На острове — то же правило: ${R.islandDockBerths} бертов, стоят до 4.</li></ul>
      <p class="muted small">Нажми «Приплыла 9-я лодка», чтобы увидеть правило в 3D.</p>`;
    return;
  }
  const b = D.island.boats.find((x) => x.id === boatState.id);
  side.innerHTML = `<h4>«${esc(b.name)}»</h4><p>${esc(b.look)}</p>
    <ul>${b.equipment.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <p class="muted small" id="boat-model-info">${info ? esc(info) : 'Модель: запусти 3D, чтобы увидеть число треугольников.'}</p>`;
  coinify(side);
}

function selectBoat(id, start) {
  boatState.id = id;
  $$('#boat-pick button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.b === id)));
  $$('#boat-cards .boat').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.b === id)));
  const pier = id === 'pier';
  $('#bt-anchor').hidden = pier; $('#bt-seats').hidden = pier; $('#bt-lod').hidden = pier;
  $('#bt-ninth').hidden = !pier; $('#pier-slots').hidden = !pier;
  renderBoatSide();
  if (boatState.viewer) boatState.viewer.show(id);
  else if (start) startViewer('boats');
}

// ------------------------------------------------------------------------------------------------ карта
function renderMap() {
  const W = D.island.world, M = D.world;
  const isle = W.island.center;
  const x0 = -2700, z0 = -320, w = 3060, hgt = 1220;
  const s = [];
  s.push(`<svg viewBox="${x0} ${z0} ${w} ${hgt}" role="img" aria-label="Схема: площадь, стоянка, путь с буями F1–F6 и остров в 2,4 км">`);
  s.push(`<rect x="${x0}" y="${z0}" width="${w}" height="${hgt}" class="map-sea"/>`);
  // сетка 500 м
  for (let x = -2500; x <= 300; x += 500) s.push(`<line x1="${x}" y1="${z0}" x2="${x}" y2="${z0 + hgt}" class="map-grid"/><text x="${x + 8}" y="${z0 + hgt - 14}" class="map-txt s">${x === 0 ? '0' : nf(x) + ' м'}</text>`);
  for (let z = 0; z <= 800; z += 500) s.push(`<line x1="${x0}" y1="${z}" x2="${x0 + w}" y2="${z}" class="map-grid"/>`);
  // веер дальнего берега
  const B = M.backdrop, rad = (d) => d * Math.PI / 180;
  const P = (deg, r) => [Math.sin(rad(deg)) * r, Math.cos(rad(deg)) * r];
  const arc = [];
  for (let d = B.fromDeg; d <= B.toDeg; d += 4) arc.push(P(d, B.r1));
  const arcIn = [];
  for (let d = B.toDeg; d >= B.fromDeg; d -= 4) arcIn.push(P(d, B.r0));
  s.push(`<path d="M${[...arc, ...arcIn].map((p) => p.map((v) => v.toFixed(0)).join(' ')).join(' L')}Z" class="map-fan"/>`);
  const fl = P(12, 760);
  s.push(`<text x="${x0 + w - 24}" y="${fl[1]}" class="map-txt it" text-anchor="end">${esc(B.name)}</text>`);
  // площадь как суша
  s.push(`<path d="M-120 -160 Q-60 -230 60 -220 Q170 -200 210 -120 Q240 -10 160 50 Q60 60 20 40 Q-40 30 -80 10 Q-150 -40 -120 -160Z" class="map-land"/>`);
  // круги дальности
  const cen = (c) => (c === 'island' ? [isle.x, isle.z] : [M.plaza.x, M.plaza.z]);
  const legend = [];
  for (const r of M.ranges) {
    const [cx, cz] = cen(r.center);
    s.push(`<circle cx="${cx}" cy="${cz}" r="${r.r}" class="map-ring ${r.kind}"><title>${esc(r.label)}</title></circle>`);
    legend.push(`<span class="map-l-${r.kind}"><i style="color:${{ far: 'var(--ink-3)', haze: 'var(--ink-3)', light: 'var(--beam)', draw: 'var(--pl-barkas)', waters: 'var(--pl-isle)' }[r.kind]}"></i>${esc(r.label)}</span>`);
  }
  // остров
  s.push(`<ellipse cx="${isle.x}" cy="${isle.z}" rx="105" ry="75" class="map-land"/>`);
  const lh = W.islandLayout.lighthouse;
  s.push(`<circle cx="${lh.x}" cy="${lh.z}" r="16" fill="var(--beam)" stroke="var(--card)" stroke-width="5"/>`);
  s.push(`<text x="${isle.x - 190}" y="${isle.z + 190}" class="map-txt big">«${esc(W.island.name)}»</text>`);
  s.push(`<text x="${isle.x - 190}" y="${isle.z + 236}" class="map-txt s">(${nf(isle.x)}; ${nf(isle.z)}) · ${nf(W.island.fromPlazaM)} м от площади</text>`);
  // маршрут
  const R = W.route;
  const pts = [R.gate, R.F1, ...R.buoys, R.watersEdgeOnCourse];
  s.push(`<path id="route-line" d="M${pts.map((p) => `${p.x} ${p.z}`).join(' L')}" class="map-route"/>`);
  const ab = D.island.world.approachBuoys;
  const dock = W.islandLayout.dock;
  const tail = [R.watersEdgeOnCourse, { x: (ab[1].red.x + ab[1].green.x) / 2, z: (ab[1].red.z + ab[1].green.z) / 2 }, { x: (ab[2].red.x + ab[2].green.x) / 2, z: (ab[2].red.z + ab[2].green.z) / 2 }, { x: dock.to.x, z: dock.to.z + 4 }];
  s.push(`<path d="M${tail.map((p) => `${p.x} ${p.z}`).join(' L')}" class="map-route" style="stroke-dasharray:8 8;stroke-width:3"/>`);
  for (const a of ab) s.push(`<circle cx="${a.red.x}" cy="${a.red.z}" r="9" class="map-buoy"/><circle cx="${a.green.x}" cy="${a.green.z}" r="9" class="map-buoy g"/>`);
  for (const b of [{ id: 'F1', ...R.F1 }, ...R.buoys]) {
    s.push(`<circle cx="${b.x}" cy="${b.z}" r="15" class="map-buoy f"/><text x="${b.id === 'F1' ? b.x + 24 : b.x - 22}" y="${b.id === 'F1' ? b.z + 44 : b.z - 30}" class="map-txt">${b.id}</text>`);
  }
  // ориентиры
  for (const l of M.landmarks) {
    if (l.kind === 'house') continue; // во врезке
    const near = Math.hypot(l.x, l.z) < 200;
    s.push(`<rect x="${l.x - 14}" y="${l.z - 9}" width="28" height="18" rx="4" fill="var(--ink-2)"/><text x="${near ? l.x - 30 : l.x - 60}" y="${near ? l.z + 12 : l.z + 48}" class="map-txt s"${near ? ' text-anchor="end"' : ''}>${esc(l.name)}</text>`);
  }
  s.push(`<text x="40" y="-150" class="map-txt big" style="font-size:44px">площадь</text>`);
  s.push(`<text x="${(R.F1.x + R.watersEdgeOnCourse.x) / 2 - 300}" y="${(R.F1.z + R.watersEdgeOnCourse.z) / 2 + 80}" class="map-txt it" transform="rotate(-10 ${(R.F1.x + R.watersEdgeOnCourse.x) / 2} ${(R.F1.z + R.watersEdgeOnCourse.z) / 2})">курс ЗЮЗ · ${nf(R.lengthToWatersM)} м от ворот до вод острова</text>`);
  // закат и север
  const sun = P(M.sunDeg, 1);
  s.push(`<g transform="translate(-2560 -200)"><path d="M0 60 V-10 M-12 4 L0 -16 L12 4" stroke="var(--ink)" stroke-width="5" fill="none"/><text x="-14" y="94" class="map-txt">С</text></g>`);
  s.push(`<g transform="translate(-2380 -200)"><circle r="22" fill="var(--beam)"/><text x="34" y="10" class="map-txt s">закат: солнце на ${M.sunDeg}° от юга, остров — на ${W.island.bearingFromSouthDeg}°</text></g>`);
  // врезка: стоянка у дома Семёна крупно
  {
    const Pk = W.parking, rx0 = -50, rz0 = 44, rw = 76, rh = 56, sc = 8, iw = rw * sc, ih = rh * sc, ix = -1560, iz = -290;
    const fs1 = (32 / sc).toFixed(2), fs2 = (26 / sc).toFixed(2);
    const T = (x, y, t, o = {}) => `<text x="${x}" y="${y}" class="t${o.s ? ' s' : ''}" style="font-size:${o.s ? fs2 : fs1}px"${o.end ? ' text-anchor="end"' : ''}>${t}</text>`;
    s.push(`<rect x="${rx0}" y="${rz0}" width="${rw}" height="${rh}" fill="none" stroke="var(--ink)" stroke-width="5"/>`);
    s.push(`<line x1="${rx0}" y1="${rz0}" x2="${ix + iw}" y2="${iz + ih}" stroke="var(--ink-2)" stroke-width="3" stroke-dasharray="10 8"/>`);
    s.push(`<clipPath id="inset-clip"><rect x="${ix}" y="${iz}" width="${iw}" height="${ih}" rx="12"/></clipPath>`);
    s.push(`<rect x="${ix}" y="${iz}" width="${iw}" height="${ih}" rx="12" class="map-inset-bg"/>`);
    const g = [];
    g.push(`<rect x="${rx0}" y="${rz0}" width="${rw}" height="${62 - rz0}" fill="var(--land)"/>`);
    g.push(T(rx0 + 2, 49, 'набережная', { s: 1 }));
    g.push(`<rect x="-21" y="48" width="15" height="13" rx=".6" fill="var(--ink-3)" opacity=".5"/>`);
    g.push(T(-3.5, 55.5, 'дом Семёна'));
    g.push(`<rect x="${Pk.gangway.x0}" y="${Pk.gangway.z0 - 3}" width="${Pk.gangway.x1 - Pk.gangway.x0}" height="${Pk.gangway.z1 - Pk.gangway.z0 + 3}" fill="var(--land-ink)"/>`);
    g.push(`<rect x="${Pk.pontoon.x0}" y="${Pk.pontoon.z0}" width="${Pk.pontoon.x1 - Pk.pontoon.x0}" height="${Pk.pontoon.z1 - Pk.pontoon.z0}" fill="var(--land-ink)"/>`);
    const free = [3, 8];
    Pk.berthZ.forEach((z, i) => {
      for (const side of [0, 1]) {
        const n = side * 5 + i, d = side ? 1 : -1, st = side ? -12.1 : -15.1, bow = st + d * 7, mid = st + d * 5.4;
        if (free.includes(n)) g.push(`<rect x="${Math.min(st, bow)}" y="${z - 1}" width="7" height="2" rx=".5" fill="none" stroke="var(--beam)" stroke-width=".3" stroke-dasharray=".7 .5"/>`);
        else g.push(`<path d="M${st} ${z - 1} L${mid} ${z - 1} L${bow} ${z} L${mid} ${z + 1} L${st} ${z + 1}Z" fill="var(--ink-2)"/>`);
        g.push(T(side ? -4.2 : -23, z + 1.1, n + 1, { s: 1, end: !side }));
      }
    });
    g.push(T(-49, 72, '10 мест:'), T(-49, 76.5, '8 заняты,'), T(-49, 81, '2 свободны'));
    const dir = { x: R.F1.x - R.gate.x, z: R.F1.z - R.gate.z }, L = Math.hypot(dir.x, dir.z), k = 9 / L;
    g.push(`<path d="M${R.gate.x} ${R.gate.z} l${(dir.x * k).toFixed(2)} ${(dir.z * k).toFixed(2)}" fill="none" stroke="var(--ink)" stroke-width=".35" stroke-dasharray="1.2 .8"/>`);
    g.push(`<circle cx="${R.gate.x}" cy="${R.gate.z}" r=".9" fill="var(--beam)" stroke="var(--card)" stroke-width=".3"/>`);
    g.push(T(R.gate.x + 2.2, R.gate.z + 1, 'ворота'), T(R.gate.x + 2.2, R.gate.z + 6, `↓ к F1 и острову`, { s: 1 }));
    g.push(`<path d="M${rx0 + 3} ${rz0 + rh - 3} h10" stroke="var(--ink)" stroke-width=".35"/>`, T(rx0 + 3, rz0 + rh - 4.2, '10 м', { s: 1 }));
    s.push(`<g class="map-inset" clip-path="url(#inset-clip)"><g transform="translate(${ix} ${iz}) scale(${sc}) translate(${-rx0} ${-rz0})">${g.join('')}</g></g>`);
    s.push(`<text x="${ix + 6}" y="${iz + ih + 40}" class="map-txt s">стоянка «У Семёна» крупно</text>`);
  }
  // лодки для гонки
  const colors = ['var(--b-volzhanka)', 'var(--b-albakor)', 'var(--b-northsilver)'];
  D.island.boats.forEach((b, i) => s.push(`<circle id="race-${b.id}" cx="${R.gate.x}" cy="${R.gate.z}" r="20" fill="${colors[i]}" class="map-boat"/>`));
  s.push('</svg>');
  $('#map').innerHTML = s.join('');
  $('#map-legend').innerHTML = legend.join('');
  $('#world-fixes').innerHTML = M.worldFixes.map((f) => `<div class="panel" style="padding:12px 14px"><b>${esc(f.title)}</b><p class="small" style="color:var(--ink-2);margin-top:4px">${esc(f.text)}</p></div>`).join('');

  // гонка
  const raceBox = $('#race');
  raceBox.innerHTML = D.island.boats.map((b, i) => `<div><span><i style="background:${colors[i]}"></i>«${esc(b.name)}»</span><b id="rt-${b.id}">0:00</b></div>`).join('');
  const path = [...pts, ...tail.slice(1)];
  const segs = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) { const L = Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z); segs.push({ a: path[i - 1], b: path[i], L, s0: total }); total += L; }
  const edgeS = segs.slice(0, pts.length - 1).reduce((a, x) => a + x.L, 0);
  const at = (d) => {
    for (const g of segs) if (d <= g.s0 + g.L) { const k = (d - g.s0) / g.L; return [g.a.x + (g.b.x - g.a.x) * k, g.a.z + (g.b.z - g.a.z) * k]; }
    const g = segs[segs.length - 1]; return [g.b.x, g.b.z];
  };
  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  let raf = 0;
  $('#race-go').addEventListener('click', () => {
    cancelAnimationFrame(raf);
    const t0 = performance.now(), SPEED = 20;
    const tick = (now) => {
      const t = (now - t0) / 1000 * SPEED;
      let done = true;
      for (const b of D.island.boats) {
        const tA = b.top / b.accel;
        let d = t < tA ? 0.5 * b.accel * t * t : 0.5 * b.top * tA + b.top * (t - tA);
        let shown = t;
        if (d >= edgeS) {
          const tEdge = edgeS / b.top + b.top / (2 * b.accel);
          const k = Math.min(1, (t - tEdge) / b.toDockExtraS);
          d = edgeS + (total - edgeS) * k;
          shown = k >= 1 ? tEdge + b.toDockExtraS : t;
          $(`#rt-${b.id}`).innerHTML = k >= 1 ? `${mmss(tEdge)} <span class="muted small">+${b.toDockExtraS} с</span>` : mmss(Math.min(t, tEdge));
          if (k < 1) done = false;
        } else {
          done = false;
          $(`#rt-${b.id}`).textContent = mmss(shown);
        }
        const [x, z] = at(d);
        const c = document.getElementById(`race-${b.id}`);
        c?.setAttribute('cx', x.toFixed(1)); c?.setAttribute('cy', z.toFixed(1));
      }
      if (!done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}

// ------------------------------------------------------------------------------------------------ остров
function renderIsland() {
  const I = D.island, Wt = I.weather;
  $('#reveal').innerHTML = Wt.reveal.map((r) => `<li data-d="${r.distToCenter}"><b>${nf(r.distToCenter)} м</b><span>${esc(r.what)}</span></li>`).join('') +
    `<li class="muted" style="grid-template-columns:1fr">В «Туман наступает» всё то же, но вдвое ближе: остров выходит из тумана на ${Wt.fogEvent.fogFar} м.</li>`;
  const renders = [
    ['island-approach-fog', 'models/island/island-approach-fog.png', 'Подход с моря по курсу от F6, 235 м: сначала огонь маяка и буи'],
    ['island-overview', 'models/island/island-overview.png', 'Весь остров сверху, лёгкая дымка'],
    ['island-lighthouse', 'models/island/island-lighthouse.png', 'Маяк: облупленные полосы, пристройка с ревуном, лестница из деревни'],
    ['island-street', 'models/island/island-street.png', 'Заброшенная улица к дому смотрителя: тёплые окна, сети, цветы'],
  ].map(([t, full, cap]) => ({ thumb: `data/thumbs/${t}.jpg`, full, cap }));
  renders.push({ thumb: 'img/isle-loading.webp', full: 'img/isle-loading.webp', cap: 'Экран загрузки «Последний свет» (без надписей)' });
  renders.push({ thumb: 'img/isle-loading-alt.webp', full: 'img/isle-loading-alt.webp', cap: 'Экран загрузки — второй вариант' });
  renders.push({ thumb: 'img/isle-season-board.webp', full: 'img/isle-season-board.webp', cap: 'Фон доски сезона острова у Игната' });
  renders.push({ thumb: 'data/thumbs/contact-sheet.jpg', full: 'img/contact-sheet.png', cap: 'Все 20 рыб острова одним листом' });
  $('#renders').innerHTML = renders.map((r) => `<button type="button" class="shot" data-full="${esc(r.full)}" data-cap="${esc(r.cap)}"><img src="${esc(r.thumb)}" alt="${esc(r.cap)}" loading="lazy"><span>${esc(r.cap)}</span></button>`).join('');

  // расписание
  const sched = $('#sched');
  const draw = () => {
    const now = new Date();
    const msk = new Date(now.getTime() + (now.getTimezoneOffset() + 180) * 60000);
    const h = msk.getHours(), m = msk.getMinutes(), s = msk.getSeconds();
    const isleNow = h % 2 === 1 && m < 10;
    let next = (h % 2 === 1 ? (m < 10 ? 0 : 120) : 60) * 60 - (m * 60 + s);
    if (isleNow) next = (10 - m) * 60 - s;
    const mm = Math.floor(next / 60), ss = next % 60;
    sched.innerHTML = `
      <div class="countdown"><span>Москва сейчас <b>${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}</b></span>
        <span>${isleNow ? 'Сезон острова идёт, ещё' : 'Сезон острова через'} <b>${mm}:${String(ss).padStart(2, '0')}</b></span></div>
      <div class="hours" aria-label="Сезоны по часам: нечётные — остров, чётные — площадь">${Array.from({ length: 24 }, (_, i) => `<div class="${i % 2 ? 'isle' : 'plaza'}${i === h ? ' now' : ''}" title="${i}:00 — сезон ${i % 2 ? 'острова' : 'площади'}, 10 мин"><span>${i}</span></div>`).join('')}</div>
      <div class="legend"><span><i style="border-color:var(--pl-isle);border-top-style:solid;border-top-width:8px;width:14px"></i>сезон острова, ${esc(Wt.season.when)}</span><span><i style="border-color:var(--pl-pier);border-top-style:solid;border-top-width:8px;width:14px"></i>сезон площади — в чётные часы, как сейчас</span></div>
      <p class="small"><b>«${esc(Wt.fogEvent.name)}»</b> — ${esc(Wt.fogEvent.schedule)}. ${esc(Wt.fogEvent.odds)}.</p>
      <p class="small"><b>${esc(Wt.season.name)}</b>: ${esc(Wt.season.odds)}. На время сезона держит туман, ревун трижды.</p>`;
  };
  draw();
  setInterval(draw, 1000);

  const fogRows = [
    ...Wt.transit.map((t) => [t.from, t.fogNear, t.fogFar]),
    [`«${Wt.fogEvent.name}»`, Wt.fogEvent.fogNear, Wt.fogEvent.fogFar],
    ['Сезон острова', Wt.fogEvent.fogNear, Wt.fogEvent.fogFar],
  ];
  $('#fog-table').innerHTML = `<caption style="text-align:left;font:700 18px var(--f-display);padding-bottom:6px">Туман по дороге, м</caption><thead><tr><th>Где</th><th class="n">ближе — чисто</th><th class="n">дальше — не видно</th></tr></thead><tbody>${fogRows.map((r) => `<tr><td>${esc(r[0])}</td><td class="n">${esc(nfx(r[1]))}</td><td class="n"><b>${esc(nfx(r[2]))}</b></td></tr>`).join('')}</tbody>`;
  $('#fog-table-box').insertAdjacentHTML('beforeend', `<p class="note">Цвет тумана — жемчужный ${esc(Wt.normal.color)} с тёплым отсветом; в событие светлее и холоднее. Солнца на острове нет: свет мягкий, без теней. Переход — 20 с, как тучи дождя.</p>`);

  const ig = D.cosmetics.npc?.ignat;
  if (ig) {
    $('#npc-ignat').innerHTML = `<img src="${esc(ig.thumb)}" alt="${esc(ig.name)}" loading="lazy"><div><h4>${esc(ig.name)}</h4><p>${esc(ig.text)}</p><p class="small muted" style="margin-top:6px">В 3D он стоит на крыльце и смотрит в туман. Кнопка «К Игнату» — подлететь и помахать.</p></div>`;
  }
  const L = I.world.islandLayout;
  $('#isle-facts').innerHTML = `<h4>Что на острове</h4><ul>
    <li>Маяк: мыс +${L.lighthouse.ground} м, башня ${L.lighthouse.tower} м, огонь на ${L.lighthouse.lampY} м.</li>
    <li>Причал на ${L.dock.berths} лодок (стоят до 4), каменный мол — ${L.mole.fishSpots} мест рыбалки наружу.</li>
    <li>Лестница к маяку +${L.steps.climb} м, пять заброшенных домов (${L.collapsedRoofs} с провалившейся крышей), консервный завод за забором «Проход запрещён».</li>
    <li>Остов шхуны у западного берега, колокольный буй, тупики на скалах, кот у Игната.</li>
    <li>Упал в воду — выныриваешь на причале. Рыбалка острова — с ${I.boatRules.levels.isleFishing}-го уровня.</li>
    <li>Бюджет кадра у острова — до 150 отрисовок и 300 тыс. треугольников, новых ламп — 0.</li></ul>`;
}
function nfx(v) { return typeof v === 'number' ? nf(v) : String(v).replace(/(\d)(\d{3})\b/g, '$1 $2'); }

// ------------------------------------------------------------------------------------------------ рыбы
const fishFilter = { tier: 'all', when: 'all' };
function weight([a, b]) {
  if (a >= 1000) return `${nf1(a / 1000)}–${nf1(b / 1000)} кг`;
  if (b >= 1000) return `${nf(a)} г – ${nf1(b / 1000)} кг`;
  return `${nf(a)}–${nf(b)} г`;
}
function renderFish() {
  const S = D.island.species;
  $('#fish-src').textContent = D.reel ? 'успех — калибровка island-reel' : 'успех — прикидка дизайна';
  const tiers = [['all', 'Все'], ...[0, 1, 2, 3, 4, 7].map((t) => [String(t), TIERS[t].many])];
  $('#f-tier').innerHTML = tiers.map(([k, n]) => `<button type="button" data-t="${k}" aria-pressed="${k === 'all'}">${k !== 'all' ? `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${tc(+k)};margin-right:6px"></i>` : ''}${esc(n)}</button>`).join('');
  const cards = S.map((sp) => {
    const r = reelSpecies(sp.id);
    const card = D.abilities.cards.find((c) => c.key === sp.id);
    const fog = sp.when === 'туман';
    const price = `${sp.price[0]}–${sp.price[1]}${sp.priceFog ? ` <span class="muted">(в туман ${sp.priceFog[0]}–${sp.priceFog[1]})</span>` : ''}`;
    let succ;
    if (r) succ = { label: 'успех, %: «обычный», ниже — «опытный»', cells: [['6', r.success.lvl6], ['8', r.success.lvl8], ['10', r.success.lvl10], ['15', r.success.lvl15]].map(([l, v]) => [l, `${v[0]}`, `${v[1]}`]) };
    else succ = { label: 'успех «обычного», ур. 6 · 8 · 10, «опытного» 10', cells: [['6', sp.successTypicalPct.lvl6], ['8', sp.successTypicalPct.lvl8], ['10', sp.successTypicalPct.lvl10], ['10 оп.', sp.successTypicalPct.lvl10Expert]].map(([l, v]) => [l, `${v}`, null]) };
    const note = sp.ability ? sp.note.replace(/;[^;]*$/, '') : sp.note;
    let abil = '';
    if (sp.ability || card) {
      const name = card?.ability || sp.ability?.name;
      const text = card?.text || sp.ability?.text;
      const chips = reelChips(sp.id) || card?.chips || [];
      const w = r?.success?.lvl10?.[0], wo = r?.lvl10NoAbility?.[0];
      abil = `<div class="abil"><b>«${esc(name)}»</b><span>${esc(text)}</span><div class="chips">${chips.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>${w != null ? `<span>Ур. 10: с приёмом <b style="font:600 13px var(--f-body)">${w} %</b>${wo != null ? `, без — ${wo} %` : ''}</span>` : ''}</div>`;
    }
    const share = sp.sharePct;
    return `<article class="panel fish${fog ? ' fogonly' : ''}" data-tier="${sp.tier}" data-when="${esc(sp.when)}" style="--tc:${tc(sp.tier)}">
      <div class="pic"><img src="img/fish/${sp.id}.webp" alt="${esc(sp.name)}" loading="lazy"></div>
      <div><h4>${esc(sp.name)}</h4><span class="lat">${esc(sp.latin || '')}</span></div>
      <div class="chips"><span class="chip t">${esc(TIERS[sp.tier].one)}</span><span class="chip${fog ? ' fog' : ''}">${fog ? 'только в туман' : 'всегда'}</span></div>
      <dl>
        <dt>вес</dt><dd>${weight(sp.g)}</dd>
        <dt>цена</dt><dd>${price} 🪙</dd>
        <dt>шанс, ур. 10</dt><dd>${nf1(share.lvl10Clear)} % ясно · ${nf1(share.lvl10Fog)} % в туман</dd>
        <dt>ходы</dt><dd>${sp.pat.map((p) => PATTERN[p] || p).join(' + ')}</dd>
      </dl>
      <p class="manner">${esc(note.charAt(0).toUpperCase() + note.slice(1))}.</p>
      ${abil}
      <div><span class="muted" style="font-size:11px">${esc(succ.label)}</span>
      <div class="succ10">${succ.cells.map(([l, a, b]) => `<div>ур. ${l}<b>${a}</b>${b != null ? `<small>оп. ${b}</small>` : ''}</div>`).join('')}</div></div>
    </article>`;
  });
  $('#fish-grid').innerHTML = cards.join('');
  const apply = () => {
    let n = 0;
    $$('#fish-grid .fish').forEach((el) => {
      const ok = (fishFilter.tier === 'all' || el.dataset.tier === fishFilter.tier) && (fishFilter.when === 'all' || el.dataset.when === fishFilter.when);
      el.hidden = !ok;
      if (ok) n++;
    });
    $('#f-count').textContent = `показано ${n} из ${S.length}`;
  };
  apply();
  $('#f-tier').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-t]');
    if (!b) return;
    fishFilter.tier = b.dataset.t;
    $$('#f-tier button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    apply();
  });
  $('#f-when').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-w]');
    if (!b) return;
    fishFilter.when = b.dataset.w;
    $$('#f-when button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    apply();
  });
  const old = [
    ['img/old/hammerhead.webp', 'Рыба-молот', 'мифик пристани'],
    ['img/old/kalmar.webp', 'Кальмар', 'божественная, пристань'],
    ['img/old/greenlandshark.png', 'Гренландская акула', 'мифик, в ненастье'],
    ['img/old/oarfish.webp', 'Сельдяной король', 'мифик баркаса'],
    ['img/old/sturgeon.webp', 'Осётр', 'легенда пристани'],
  ];
  $('#old-row').innerHTML = old.map(([src, n, s]) => `<figure><img src="${src}" alt="${esc(n)}" loading="lazy"><b>${esc(n)}</b>${esc(s)}</figure>`).join('') +
    `<p class="small muted" style="grid-column:1/-1;margin-top:6px">Новые рыбы нарисованы по тому же промпт-шаблону: полевая живопись, строгий профиль головой влево, прозрачный фон. <button type="button" class="btn" style="margin-left:6px;cursor:zoom-in" data-full="img/contact-sheet.png" data-cap="Все 20 рыб острова одним листом">Все 20 одним листом</button></p>`;
}

// ------------------------------------------------------------------------------------------------ графики
function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
function ticks(max, n = 5) {
  const raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw);
  const out = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}
function tipLayer(box) {
  let tt = box.querySelector('.tt');
  if (!tt) { tt = document.createElement('div'); tt.className = 'tt'; box.appendChild(tt); }
  const move = (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) { tt.classList.remove('on'); return; }
    tt.innerHTML = t.dataset.tip.replace(/\s?🪙/g, '&nbsp;' + COIN);
    const r = box.getBoundingClientRect();
    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
    if (x + 260 > r.width) x = Math.max(8, e.clientX - r.left - 270);
    tt.style.left = x + 'px'; tt.style.top = y + 'px';
    tt.classList.add('on');
  };
  box.addEventListener('pointermove', move);
  box.addEventListener('pointerleave', () => tt.classList.remove('on'));
  box.addEventListener('focusin', (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) return;
    tt.innerHTML = t.dataset.tip; tt.style.left = '16px'; tt.style.top = '8px'; tt.classList.add('on');
  });
  box.addEventListener('focusout', () => tt.classList.remove('on'));
}
const PL = { pier: 'var(--pl-pier)', barkas: 'var(--pl-barkas)', isle: 'var(--pl-isle)' };

function renderEconomy() {
  const E = D.island.economy, X = D.economy;
  $('#eco-lead').textContent = `Цены 52 старых рыб снижаются на 60 % от цен до хотфикса (×${nf1(E.oldPriceScale)}), сундуки не трогаем. Остров платит больше: на 10-м уровне — ${nf(E.isle.lvl10Northsilver.normal.totalPerHour)} 🪙/ч при цели ${nf(E.targetPerHour[0])}–${nf(E.targetPerHour[1])}. ${X.newbieNote}`;

  // 1. доход в час
  const box = $('#ch-income');
  let weather = 'normal';
  const islRows = [
    ['lvl6Volzhanka', 'Остров, ур. 6, «Волжанка»'],
    ['lvl8Albakor', 'Остров, ур. 8, «Альбакор»'],
    ['lvl10Northsilver', 'Остров, ур. 10, «Нортсильвер»'],
    ['lvl10OnFoot', 'Остров, ур. 10, с мола пешком'],
    ['lvl10NorthsilverExpert', 'Остров, ур. 10, «опытный»'],
  ];
  const draw = () => {
    const rows = [];
    for (const r of E.pierBarkas.rows) {
      const place = /баркас/.test(r.case) ? 'barkas' : 'pier';
      rows.push({ label: r.case.charAt(0).toUpperCase() + r.case.slice(1), place, fish: r.cut, chest: r.chest, ghost: r.now + r.chest, tip: `<b>${esc(r.case)}</b><br>рыба сейчас: ${nf(r.now)}<br>рыба после −60 %: <b>${nf(r.cut)}</b><br>сундуки: ${nf(r.chest)}<br>итого: <b>${nf(r.cut + r.chest)}</b> 🪙/ч · опыт ${nf1(r.xpMin)}/мин` });
    }
    rows.push({ sep: true });
    for (const [k, label] of islRows) {
      const v = E.isle[k]?.[weather];
      if (!v) continue;
      rows.push({ label, place: 'isle', fish: v.fishPerHour, chest: v.chestPerHour, total: v.totalPerHour, tip: `<b>${esc(label)}</b><br>рыба: ${nf(v.fishPerHour)}<br>сундуки: ${nf(v.chestPerHour)}<br>итого: <b>${nf(v.totalPerHour)}</b> 🪙/ч<br>рыб в минуту: ${nf1(v.fishPerMin)} · опыт ${nf1(v.xpPerMin)}/мин` });
    }
    const max = niceMax(Math.max(...rows.filter((r) => !r.sep).map((r) => Math.max(r.ghost || 0, r.fish + r.chest))));
    const W = 920, LW = 250, RW = 70, rowH = 26, gap = 8;
    const plotW = W - LW - RW;
    const H = 28 + rows.reduce((a, r) => a + (r.sep ? 18 : rowH + gap), 0) + 26;
    const x = (v) => LW + v / max * plotW;
    const o = [`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Доход жетонов в час по местам и уровням">`];
    const [t0, t1] = E.targetPerHour;
    let y = 28;
    const top = y;
    const tk = ticks(max, 5);
    const bottom = H - 26;
    o.push(`<rect x="${x(t0)}" y="${top - 6}" width="${x(t1) - x(t0)}" height="${bottom - top + 6}" class="band"/>`);
    o.push(`<text x="${(x(t0) + x(t1)) / 2}" y="16" text-anchor="middle" style="fill:var(--beam-ink);font-weight:600">цель острова ${nf(t0)}–${nf(t1)}</text>`);
    for (const t of tk) o.push(`<line x1="${x(t)}" y1="${top - 6}" x2="${x(t)}" y2="${bottom}" class="gl"/><text x="${x(t)}" y="${H - 8}" text-anchor="middle">${nf(t)}</text>`);
    for (const r of rows) {
      if (r.sep) { o.push(`<line x1="0" y1="${y + 8}" x2="${W}" y2="${y + 8}" class="ax"/>`); y += 18; continue; }
      const cy = y + rowH / 2;
      o.push(`<g tabindex="0" data-tip="${esc(r.tip)}"><rect x="0" y="${y - 3}" width="${W}" height="${rowH + 6}" fill="transparent"/>`);
      o.push(`<text x="${LW - 10}" y="${cy + 4}" text-anchor="end" class="k">${esc(r.label)}</text>`);
      if (r.ghost) o.push(`<rect x="${LW}" y="${y + 4}" width="${x(r.ghost) - LW}" height="${rowH - 8}" rx="4" fill="none" stroke="var(--ghost)" stroke-width="1.5" stroke-dasharray="4 3"/>`);
      const fw = x(r.fish) - LW;
      o.push(`<rect x="${LW}" y="${y + 4}" width="${Math.max(2, fw)}" height="${rowH - 8}" rx="4" fill="${PL[r.place]}"/>`);
      o.push(`<rect x="${LW + fw + 2}" y="${y + 4}" width="${Math.max(2, x(r.chest) - LW - 2)}" height="${rowH - 8}" rx="4" fill="${PL[r.place]}" opacity=".42"/>`);
      o.push(`<text x="${Math.max(x(r.fish + r.chest), r.ghost ? x(r.ghost) : 0) + 8}" y="${cy + 4}" class="v">${nf(r.total ?? r.fish + r.chest)}</text></g>`);
      y += rowH + gap;
    }
    o.push('</svg>');
    box.querySelector('.plot').innerHTML = o.join('');
  };
  box.innerHTML = `<div class="toolbar" style="justify-content:space-between;align-items:flex-start"><div><h4>Жетонов в час: старые места и остров</h4><p class="cap">«Обычный» игрок, без напитков. Пунктир — сколько старое место давало до −60 %.</p></div>
    <div class="seg" role="group" aria-label="Погода на острове" id="inc-w"><button type="button" data-w="normal" aria-pressed="true">Обычный туман</button><button type="button" data-w="fogEvent" aria-pressed="false">«Туман наступает»</button><button type="button" data-w="season" aria-pressed="false">Сезон острова</button></div></div>
    <div class="lg"><span><i style="background:var(--pl-pier)"></i>пристань</span><span><i style="background:var(--pl-barkas)"></i>баркас</span><span><i style="background:var(--pl-isle)"></i>остров</span><span><i style="background:var(--ink-3);opacity:.42"></i>светлая часть — сундуки</span><span><i style="border:1.5px dashed var(--ghost);background:none"></i>до −60 %</span></div>
    <div class="scrollx"><div class="plot" style="min-width:720px"></div></div>`;
  draw();
  tipLayer(box);
  box.querySelector('#inc-w').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-w]');
    if (!b) return;
    weather = b.dataset.w;
    $$('#inc-w button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });

  // 2. путь с нуля
  {
    const box2 = $('#ch-path');
    const rows = [...X.pathWithIsle.map((p) => ({ ...p, place: 'isle' })), ...X.pathBarkasOnly.map((p) => ({ ...p, label: p.label + ' без острова', place: 'barkas' }))];
    const max = niceMax(Math.max(...rows.map((r) => r.h)));
    const W = 560, LW = 170, rowH = 22, gap = 6, RW = 50;
    const H = 10 + rows.length * (rowH + gap) + 26;
    const x = (v) => LW + v / max * (W - LW - RW);
    const o = [`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Часы игры с нуля до уровней и лодок">`];
    for (const t of ticks(max, 5)) o.push(`<line x1="${x(t)}" y1="4" x2="${x(t)}" y2="${H - 24}" class="gl"/><text x="${x(t)}" y="${H - 8}" text-anchor="middle">${nf1(t)} ч</text>`);
    rows.forEach((r, i) => {
      const y = 8 + i * (rowH + gap);
      o.push(`<g tabindex="0" data-tip="<b>${esc(r.label)}</b><br>${nf1(r.h)} ч чистой игры с нуля${r.place === 'barkas' ? ', только баркас' : ', с островом'}"><rect x="0" y="${y - 2}" width="${W}" height="${rowH + 4}" fill="transparent"/>`);
      o.push(`<text x="${LW - 10}" y="${y + rowH / 2 + 4}" text-anchor="end" class="k"${r.boat ? ' style="font-weight:600"' : ''}>${esc(r.label)}</text>`);
      o.push(`<rect x="${LW}" y="${y + 5}" width="${x(r.h) - LW}" height="${rowH - 10}" rx="4" fill="${PL[r.place]}" opacity="${r.boat ? 1 : .55}"/>`);
      o.push(`<text x="${x(r.h) + 6}" y="${y + rowH / 2 + 4}" class="v">${nf1(r.h)}</text></g>`);
    });
    o.push('</svg>');
    box2.innerHTML = `<h4>Путь с нуля, часов игры</h4><p class="cap">«Обычный», ясно, с сундуками, без покупок блёсен и рюкзаков. Яркие — лодки.</p>
      <div class="lg"><span><i style="background:var(--pl-isle)"></i>с островом</span><span><i style="background:var(--pl-barkas)"></i>только баркас</span></div>${o.join('')}`;
    tipLayer(box2);
  }

  // 3. часы на каждую лодку
  {
    const box3 = $('#ch-boats');
    const H_ = E.boatsHours;
    const groups = [
      { name: '«Волжанка»', sub: '5 000 🪙, с 6-го', bars: [['barkas', H_.volzhanka.onBarkasLvl6, 'баркас, ур. 6']] },
      { name: '«Альбакор»', sub: '10 000 🪙, с 8-го', bars: [['isle', H_.albakor.onIsleVolzhankaLvl8, 'остров на «Волжанке», ур. 8'], ['barkas', H_.albakor.onBarkasLvl8, 'только баркас, ур. 8']] },
      { name: '«Нортсильвер»', sub: '15 000 🪙, с 10-го', bars: [['isle', H_.northsilver.onIsleAlbakorLvl10, 'остров на «Альбакоре», ур. 10'], ['barkas', H_.northsilver.onBarkasLvl10, 'только баркас, ур. 10']] },
    ];
    const max = niceMax(Math.max(...groups.flatMap((g) => g.bars.map((b) => b[1]))));
    const W = 460, LW = 120, bh = 16, RW = 40;
    let y = 6;
    const parts = [];
    for (const g of groups) {
      parts.push(`<text x="0" y="${y + 13}" class="k" style="font-weight:600">${esc(g.name)}</text><text x="0" y="${y + 29}">${esc(g.sub)}</text>`);
      g.bars.forEach(([pl, v, lab], i) => {
        const by = y + i * (bh + 6);
        const x1 = LW + v / max * (W - LW - RW);
        parts.push(`<g tabindex="0" data-tip="<b>${esc(g.name)}</b><br>${esc(lab)}: <b>${nf1(v)} ч</b>"><rect x="${LW}" y="${by}" width="${x1 - LW}" height="${bh}" rx="4" fill="${PL[pl]}"/><text x="${x1 + 6}" y="${by + 12}" class="v">${nf1(v)} ч</text></g>`);
      });
      y += Math.max(40, g.bars.length * (bh + 6)) + 16;
    }
    const H = y + 20;
    const tk = ticks(max, 4).map((t) => `<line x1="${LW + t / max * (W - LW - RW)}" y1="0" x2="${LW + t / max * (W - LW - RW)}" y2="${H - 22}" class="gl"/><text x="${LW + t / max * (W - LW - RW)}" y="${H - 6}" text-anchor="middle">${nf1(t)}</text>`);
    box3.innerHTML = `<h4>Сколько копить на каждую лодку</h4><p class="cap">Часов чистой игры от прошлой покупки. Первая лодка удваивает доход — следующие копятся быстрее.</p>
      <div class="lg"><span><i style="background:var(--pl-isle)"></i>там, где игрок будет (остров)</span><span><i style="background:var(--pl-barkas)"></i>только баркас</span></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Часы на каждую лодку">${tk.join('')}${parts.join('')}</svg>`;
    tipLayer(box3);
  }

  // 4. успех по категориям на 10-м: пристань → баркас → остров
  {
    const box4 = $('#ch-success');
    const S = E.difficulty.successLvl10Typical;
    const cats = ['обычные', 'редкие', 'эпические', 'легенды', 'мифики', 'божеств.'];
    const places = [['pier', 'Пристань'], ['barkas', 'Баркас'], ['isle', 'Остров']];
    const W = 560, H = 250, L = 34, B = 40, T = 10, R = 6;
    const gw = (W - L - R) / cats.length, bw = 14;
    const y = (v) => T + (1 - v / 100) * (H - T - B);
    const o = [`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Успех «обычного» на 10-м уровне по категориям и местам">`];
    for (const t of [0, 25, 50, 75, 100]) o.push(`<line x1="${L}" y1="${y(t)}" x2="${W - R}" y2="${y(t)}" class="gl"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`);
    cats.forEach((c, i) => {
      const gx = L + i * gw + gw / 2;
      places.forEach(([k, n], j) => {
        const v = S[k][i];
        const bx = gx + (j - 1) * (bw + 3) - bw / 2;
        o.push(`<g tabindex="0" data-tip="<b>${esc(c)}</b> · ${n}<br>успех ${v} %${i >= 4 && k === 'isle' ? '<br>без способностей' : ''}"><rect x="${bx - 2}" y="${T}" width="${bw + 4}" height="${H - T - B}" fill="transparent"/><path d="M${bx} ${y(0)} V${y(v) + 4} q0 -4 4 -4 h${bw - 8} q4 0 4 4 V${y(0)}Z" fill="${PL[k]}"/></g>`);
      });
      o.push(`<text x="${gx}" y="${H - B + 18}" text-anchor="middle" class="k">${c}</text>`);
    });
    o.push('</svg>');
    const at = E.difficulty.calTargetIsle;
    box4.innerHTML = `<h4>Успех «обычного» на 10-м уровне, %</h4><p class="cap">Легендарная удочка, платиновая блесна. На острове мифики и божественная — без способностей (со способностями цель ${Math.round(at.withAbility.myth * 100)} и ${Math.round(at.withAbility.divine * 100)} %).</p>
      <div class="lg">${places.map(([k, n]) => `<span><i style="background:${PL[k]}"></i>${n}</span>`).join('')}</div>${o.join('')}`;
    tipLayer(box4);
  }

  // 5. множители места
  {
    const box5 = $('#ch-mult');
    const Mu = E.difficulty.multipliers;
    const places = [['pier', 'Пристань'], ['barkas', 'Баркас'], ['isle', 'Остров']];
    const series = [
      ['drain', 'сопротивление', 'var(--ink)'],
      ['jerk', 'рывки и резкость', 'var(--beam)'],
      ['zone', 'ширина зоны', 'var(--ink-3)'],
    ];
    const W = 460, H = 230, L = 40, R = 140, T = 14, B = 34;
    const lo = 0.9, hi = 1.45;
    const x = (i) => L + i * (W - L - R) / 2;
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const o = [`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Множители сложности по местам">`];
    for (const t of [0.9, 1, 1.1, 1.2, 1.3, 1.4]) o.push(`<line x1="${L}" y1="${y(t)}" x2="${x(2)}" y2="${y(t)}" class="gl"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">×${nf1(t)}</text>`);
    places.forEach(([, n], i) => o.push(`<text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="k">${n}</text>`));
    for (const [k, n, col] of series) {
      const vals = places.map(([p]) => Mu[p][k]);
      o.push(`<path d="M${vals.map((v, i) => `${x(i)} ${y(v)}`).join(' L')}" fill="none" stroke="${col}" stroke-width="2.2"${k === 'zone' ? ' stroke-dasharray="5 4"' : ''}/>`);
      vals.forEach((v, i) => o.push(`<g tabindex="0" data-tip="<b>${esc(n)}</b> · ${places[i][1]}: ×${nf1(v)}"><circle cx="${x(i)}" cy="${y(v)}" r="9" fill="transparent"/><circle cx="${x(i)}" cy="${y(v)}" r="4.5" fill="${col}" stroke="var(--card)" stroke-width="2"/></g>`));
      o.push(`<text x="${x(2) + 10}" y="${y(vals[2]) + 4}" class="k">${esc(n)} ×${nf1(vals[2])}</text>`);
    }
    o.push('</svg>');
    const xp = X.xpPerMinLvl10;
    box5.innerHTML = `<h4>Сложность растёт от места к месту</h4><p class="cap">Множители места поверх манеры рыбы. Божественную место не трогает.</p>${o.join('')}
      <div class="lg" style="margin-top:6px"><span>Опыт в минуту на 10-м:</span>${Object.entries(X.places).map(([k, n]) => `<span><i style="background:${PL[k]}"></i>${n} <b class="num">${xp[k]}</b></span>`).join('')}</div>`;
    tipLayer(box5);
  }
}

// ------------------------------------------------------------------------------------------------ косметика
const cosState = { key: 'set', viewer: null, exists: new Map() };
async function exists(url) {
  if (cosState.exists.has(url)) return cosState.exists.get(url);
  const p = fetch(url, { method: 'HEAD', cache: 'no-cache' }).then((r) => (r.ok ? true : r.status === 405 || r.status === 501 ? null : false)).catch(() => null);
  cosState.exists.set(url, p);
  return p;
}
function cosItem(key) { return key === 'set' ? { ...D.cosmetics.set, kind: 'сет', name: `Сет «${D.cosmetics.set.name}»` } : D.cosmetics.items[key]; }
function renderCosmetics() {
  const C = D.cosmetics;
  $('#cos-lead').textContent = C.counter + ' Светятся поплавок, кончик удочки, фонарь и значок — светящиеся вещи у игроков самые любимые.';
  const base = C.base;
  const tile = (key) => {
    const it = cosItem(key);
    if (!it) return '';
    const img = it.thumb ? `<img src="${esc(it.thumb)}" alt="" loading="lazy">` : it.svg ? `<img src="${esc(base + it.svg)}" alt="" loading="lazy" style="object-fit:contain;padding:18%">` : `<div class="wip">${it.html ? 'живой макет окна' : 'модель в работе'}</div>`;
    return `<button type="button" class="citem" data-key="${esc(key)}" aria-pressed="${key === cosState.key}">${img}<span class="k">${esc(it.kind)}</span><b>${esc(it.name)}</b><span class="st" data-st="${esc(key)}"><i></i>проверяю файл…</span></button>`;
  };
  const rungs = C.ladder.map((r) => `<div class="panel rung${r.set ? ' wide' : ''}"><div class="need"><b>${r.need}</b><span>видов острова${r.set ? ` — все · сет «${esc(r.set)}»` : ''}</span></div><div class="meter"><i style="width:${r.need / 20 * 100}%"></i></div>
    <div class="items">${(r.set ? ['set', ...r.items] : r.items).map(tile).join('')}</div></div>`);
  rungs.push(`<div class="panel rung"><div class="need"><b style="font-size:22px">Реворк</b></div><span class="small muted">старая награда, ключ тот же — обновится у всех</span><div class="items">${C.rework.map(tile).join('')}</div></div>`);
  $('#cos-ladder').innerHTML = rungs.join('');
  $('#cos-ladder').style.gridTemplateColumns = '';
  // статусы файлов
  for (const el of $$('#cos-ladder [data-st]')) {
    const it = cosItem(el.dataset.st);
    const files = it.glb || (it.html ? [it.html] : it.svg ? [it.svg] : []);
    Promise.all(files.map((f) => exists(base + f))).then((res) => {
      const ok = res.every((v) => v !== false);
      el.classList.toggle('ok', ok);
      el.innerHTML = `<i></i>${ok ? (it.glb ? '3D готово' : it.html ? 'живой макет' : 'значок готов') : 'модель в работе'}`;
      if (!ok) {
        const btn = el.closest('.citem');
        const img = btn.querySelector('img');
        if (img && it.glb && !it.thumb) img.outerHTML = '<div class="wip">модель в работе</div>';
      }
    });
  }
  $('#cos-ladder').addEventListener('click', (e) => {
    const b = e.target.closest('.citem');
    if (b) selectCos(b.dataset.key, true);
  });
  $('#lineups').innerHTML = (C.lineups || []).map((l) => `<button type="button" class="shot" data-full="${esc(base + l.png)}" data-cap="${esc(l.caption)}"><img src="${esc(l.thumb)}" alt="${esc(l.caption)}" loading="lazy"><span>${esc(l.caption)}</span></button>`).join('');
  selectCos(cosState.key, false);
}
async function selectCos(key, start) {
  cosState.key = key;
  const it = cosItem(key), base = D.cosmetics.base;
  $$('#cos-ladder .citem').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.key === key)));
  const need = key === 'set' ? 20 : (D.cosmetics.ladder.find((r) => r.items.includes(key))?.need);
  const files = it.glb || [];
  const st = await Promise.all(files.map((f) => exists(base + f)));
  const missing = files.filter((f, i) => st[i] === false);
  $('#cos-side').innerHTML = `<span class="small muted">${esc(it.kind)}${need ? ` · за ${need} видов острова` : ' · реворк'}</span><h4>${esc(it.name)}</h4><p>${esc(it.text)}</p>
    ${it.glow ? '<span class="chip beam" style="justify-self:start">светится</span>' : ''}
    ${files.length ? `<p class="small muted">Файлы: ${files.map((f, i) => `<code>${esc(f)}</code>${st[i] === false ? ' — нет' : ''}`).join(', ')}</p>` : ''}
    ${missing.length ? '<p class="small"><b>Модель в работе.</b> Как только файл появится в папке cosmetics, здесь будет 3D.</p>' : ''}
    ${it.png ? `<button type="button" class="btn" data-full="${esc(base + it.png)}" data-cap="${esc(it.name)}" style="justify-self:start">Рендер из Blender</button>` : ''}
    ${it.html ? `<a class="btn" href="${esc(base + it.html)}" target="_blank" rel="noopener" style="justify-self:start">${icon('open')}Открыть целиком</a>` : ''}`;
  coinify($('#cos-side'));
  const v3 = $('#v-cos'), frame = $('#cos-html'), badge = $('#cos-badge'), tools = $('#cos-tools');
  tools.innerHTML = '';
  if (it.html && !it.svg) {
    v3.hidden = true; badge.hidden = true; frame.hidden = false;
    frame.innerHTML = `<iframe src="${esc(base + it.html)}" title="${esc(it.name)}" loading="lazy"></iframe>`;
    return;
  }
  if (it.svg) {
    v3.hidden = true; frame.hidden = true; badge.hidden = false;
    badge.innerHTML = `<img src="${esc(base + it.svg)}" alt="Значок «${esc(it.name)}»"><span class="small muted">Значок у ника: огонь вспыхивает раз в 6 с</span>`;
    return;
  }
  frame.hidden = true; badge.hidden = true; v3.hidden = false;
  if (missing.length) {
    if (cosState.viewer) cosState.viewer.clear?.();
    tools.innerHTML = '<span class="muted small">Модель в работе — 3D появится, когда в cosmetics/ будет файл.</span>';
    return;
  }
  if (cosState.viewer) cosState.viewer.show(key, it);
  else if (start) startViewer('cos');
}

// ------------------------------------------------------------------------------------------------ вопросы
function renderQuestions() {
  const Q = D.review.questions;
  const KEY = 'tw-isle-review-answers';
  const ans = store.get(KEY, {});
  $('#q-list').innerHTML = Q.map((q, i) => `
    <article class="panel q" id="q-${esc(q.id)}">
      <span class="qn">${i + 1}</span>
      <h4>${esc(q.title)}</h4>
      <p>${esc(q.text)} ${q.link ? `<a href="${esc(q.link)}">подробнее</a>` : ''}${q.action === 'house' ? ' · <a href="#island" data-act="house">показать в 3D</a>' : ''}</p>
      <div class="opts" role="radiogroup" aria-label="${esc(q.title)}">${q.options.map((o, j) => `
        <label class="opt"><input type="radio" name="q-${esc(q.id)}" value="${esc(o.id)}"${ans[q.id] === o.id ? ' checked' : ''}><b>${esc(o.label)}</b><span>${esc(o.why)}</span>${j === 0 ? '<span class="rec">рекомендую</span>' : ''}</label>`).join('')}
      </div>
    </article>`).join('');
  const text = () => {
    const a = store.get(KEY, {});
    const lines = Q.map((q, i) => {
      const o = q.options.find((x) => x.id === a[q.id]);
      return o ? `${i + 1}. ${q.title} — ${o.label}` : null;
    }).filter(Boolean);
    $('#q-text').textContent = lines.length ? `Ответы по острову «Последний свет»:\n${lines.join('\n')}${lines.length < Q.length ? `\n(ещё без ответа: ${Q.length - lines.length})` : ''}` : 'Пока ничего не отмечено.';
  };
  text();
  $('#q-list').addEventListener('change', (e) => {
    const r = e.target.closest('input[type=radio]');
    if (!r) return;
    const a = store.get(KEY, {});
    a[r.name.slice(2)] = r.value;
    store.set(KEY, a);
    // если localStorage недоступен — берём из формы
    if (!store.get(KEY, null)) {
      const f = {};
      $$('#q-list input:checked').forEach((x) => { f[x.name.slice(2)] = x.value; });
      $('#q-text').textContent = Object.keys(f).length ? Q.map((q, i) => { const o = q.options.find((x) => x.id === f[q.id]); return o ? `${i + 1}. ${q.title} — ${o.label}` : null; }).filter(Boolean).join('\n') : 'Пока ничего не отмечено.';
      return;
    }
    text();
  });
  $('#q-list').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act="house"]');
    if (!a) return;
    e.preventDefault();
    $('#island').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
    islandAction('house');
  });
  $('#q-copy').addEventListener('click', async () => {
    const t = $('#q-text').textContent;
    const b = $('#q-copy');
    try { await navigator.clipboard.writeText(t); b.lastChild.textContent = 'Скопировано'; }
    catch {
      const r = document.createRange(); r.selectNodeContents($('#q-text'));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      b.lastChild.textContent = 'Выделено — нажми Cmd+C';
    }
    setTimeout(() => { b.lastChild.textContent = 'Скопировать ответы'; }, 2500);
  });
  $('#accepted').innerHTML = D.review.accepted.map((a) => `<div class="panel acc">${icon('check')}<b>${esc(a.title)}</b><p>${esc(a.text)}</p></div>`).join('');
}

// ------------------------------------------------------------------------------------------------ навигация, лайтбокс
function setupCourse() {
  const links = $$('#course a');
  const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver((ents) => {
    for (const e of ents) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => a.classList.remove('on'));
      const a = map.get(e.target.id);
      // scrollIntoView здесь обрывал прокрутку страницы — двигаем только ленту навигации по горизонтали
      if (a) {
        a.classList.add('on');
        const ol = a.closest('ol');
        if (ol && (a.offsetLeft < ol.scrollLeft || a.offsetLeft + a.offsetWidth > ol.scrollLeft + ol.clientWidth)) ol.scrollLeft = a.offsetLeft - 16;
      }
    }
  }, { rootMargin: '-40% 0px -55% 0px' });
  for (const id of map.keys()) { const s = document.getElementById(id); if (s) io.observe(s); }
}
function setupLightbox() {
  const dlg = $('#lightbox');
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-full]');
    if (!b) return;
    dlg.querySelector('img').src = b.dataset.full;
    dlg.querySelector('img').alt = b.dataset.cap || '';
    dlg.querySelector('p').textContent = b.dataset.cap || '';
    try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
  });
  $('#lb-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
}

// ------------------------------------------------------------------------------------------------ 3D: запуск и лимит активных сцен
const MAX_ACTIVE = 2;
const active = []; // { name, viewer }
const viewerHosts = { boats: '#v-boats', isle: '#v-isle', cos: '#v-cos' };
let V = null;
const pending = {};
async function startViewer(name) {
  if (pending[name]) return pending[name];
  const host = $(viewerHosts[name]);
  if (active.find((a) => a.name === name)) return;
  pending[name] = (async () => {
    host.querySelector('.start')?.setAttribute('hidden', '');
    const bar = document.createElement('div'); bar.className = 'load'; bar.innerHTML = '<i></i>'; host.appendChild(bar);
    try {
      V = V || await import('./viewers.js');
      while (active.length >= MAX_ACTIVE) {
        const old = active.shift();
        old.viewer.dispose();
        resetHost(old.name);
      }
      const progress = (k) => { bar.firstChild.style.width = Math.round(k * 100) + '%'; };
      let viewer;
      if (name === 'boats') {
        viewer = await V.boats(host, { data: D.island, boat: boatState.id, progress, onInfo: (t) => { const el = $('#boat-model-info'); if (el) el.textContent = t; }, onSlots: renderSlots });
        boatState.viewer = viewer;
      } else if (name === 'isle') {
        viewer = await V.isle(host, { data: D.island, cos: D.cosmetics, progress, onDist: isleDist, fog: currentFog() });
        isleState.viewer = viewer;
      } else {
        viewer = await V.cos(host, { cos: D.cosmetics, key: cosState.key, item: cosItem(cosState.key), progress, tools: $('#cos-tools') });
        cosState.viewer = viewer;
      }
      host.querySelector('.poster')?.setAttribute('hidden', '');
      active.push({ name, viewer });
    } catch (e) {
      console.error(e);
      const err = document.createElement('div'); err.className = 'err';
      err.textContent = 'Не удалось запустить 3D: ' + (e.message || e) + '. Обнови страницу или посмотри превью.';
      host.appendChild(err);
      setTimeout(() => { err.remove(); resetHost(name); }, 6000);
    } finally {
      bar.remove();
      pending[name] = null;
    }
  })();
  return pending[name];
}
function resetHost(name) {
  const host = $(viewerHosts[name]);
  host.querySelector('.poster')?.removeAttribute('hidden');
  host.querySelector('.start')?.removeAttribute('hidden');
  if (name === 'boats') boatState.viewer = null;
  if (name === 'isle') isleState.viewer = null;
  if (name === 'cos') cosState.viewer = null;
}
function setupViewers() {
  for (const name of Object.keys(viewerHosts)) {
    $(viewerHosts[name]).querySelector('.start').addEventListener('click', () => startViewer(name));
  }
  // лодки
  $('#bt-anchor').addEventListener('click', (e) => {
    if (!boatState.viewer) { startViewer('boats'); return; }
    const on = boatState.viewer.anchor();
    e.currentTarget.setAttribute('aria-pressed', String(on));
    e.currentTarget.lastChild.textContent = on ? 'Поднять якорь' : 'Опустить якорь';
  });
  $('#bt-seats').addEventListener('click', (e) => {
    if (!boatState.viewer) { startViewer('boats'); return; }
    e.currentTarget.setAttribute('aria-pressed', String(boatState.viewer.seats()));
  });
  $('#bt-lod').addEventListener('click', (e) => {
    if (!boatState.viewer) { startViewer('boats'); return; }
    e.currentTarget.setAttribute('aria-pressed', String(boatState.viewer.lod()));
  });
  $('#bt-ninth').addEventListener('click', () => {
    if (!boatState.viewer) { startViewer('boats'); return; }
    boatState.viewer.ninth();
  });
  // остров
  const fr = $('#fog-range'), off = $('#fog-off');
  const fog = () => isleState.viewer?.setFog(currentFog());
  fr.addEventListener('input', fog);
  off.addEventListener('change', fog);
  for (const [id, act] of [['#is-approach', 'approach'], ['#is-boat', 'boat'], ['#is-top', 'top'], ['#is-ignat', 'ignat'], ['#is-house', 'house']]) {
    $(id).addEventListener('click', () => islandAction(act));
  }
  // при уходе сцены за экран — пауза делается внутри viewer (IntersectionObserver)
}
const isleState = { viewer: null };
function currentFog() { return { t: +$('#fog-range').value / 100, off: $('#fog-off').checked }; }
async function islandAction(act) {
  if (!isleState.viewer) await startViewer('isle');
  if (!isleState.viewer) return;
  if (act === 'top') { $('#fog-off').checked = true; isleState.viewer.setFog(currentFog()); }
  if (act === 'approach' || act === 'boat') { if ($('#fog-off').checked) { $('#fog-off').checked = false; isleState.viewer.setFog(currentFog()); } }
  const res = isleState.viewer.go(act);
  if (act === 'approach') $('#is-approach').lastChild.textContent = res === 'stopped' ? 'Подплыть с моря' : 'Стоп';
}
function isleDist(d, flying) {
  $('#isle-dist').innerHTML = `до центра острова: <b>${d == null ? '—' : nf(Math.round(d)) + ' м'}</b>`;
  $$('#reveal li[data-d]').forEach((li) => li.classList.toggle('on', d != null && d <= +li.dataset.d));
  if (flying === false) $('#is-approach').lastChild.textContent = 'Подплыть с моря';
}
function renderSlots(slots) {
  const el = $('#pier-slots');
  el.innerHTML = slots.map((s, i) => `<span class="${s ? 'busy' : ''}${s?.oldest ? ' old' : ''}" title="${s ? `${s.owner}: ${s.aboard ? 'хозяин на борту' : `без хозяина ${s.idle} мин`}` : 'свободно'}"><b>${i + 1}</b>${s ? `${esc(s.name)}<br>${s.aboard ? 'хозяин на борту' : `${s.idle} мин`}` : 'свободно'}</span>`).join('');
}
