// Страница обзора новой набережной (plaza3). Данные — data/*.json (assets.json и layout.json пишет tools/collect.mjs),
// 3D — js/viewers.js (грузится лениво, когда окно подлетает к экрану). Нет модели — показываем концепт и «модель в работе».
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// знак № в заголовочном шрифте (капитель) выглядит как «n°» — рисуем его шрифтом текста
const escN = (s) => esc(s).replace(/№/g, '<span class="nr">№</span>');
const nf = (n, d = 0) => Number(n).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
const RUN = 8.4; // бег, м/с
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

async function getJSON(u, fallback) {
  try {
    const r = await fetch(u, { cache: 'no-cache' });
    if (!r.ok) throw new Error(u + ': ' + r.status);
    return await r.json();
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
}

// ------------------------------------------------------------------------------------------------ подписи и смысл точек раскладки
const SHORT = {
  rose: 'Роза ветров', honor: 'Доска почёта', rotunda: 'Ротонда', cafe: 'Кафе «Чайка»', cards: 'Карточная веранда',
  kurzal: 'Курзал «Автоматы · Аркада»', billiards: 'Бильярд', wheel: 'Колесо обозрения', viewdeck: 'Смотровая на регату',
  kalancha: '«Выше облаков»', paintball: 'Пейнтбол «Склад №3»', fortress: 'Крепость', karting: 'Картинг', dungeon: 'Подземелье',
  aquapark: 'Аквапарк «Волна»', wardrobe: 'Примерочная', trampolines: 'Батуты', plane: 'Гидроплан «Стриж»',
  jettyarch: 'Арка «Маяк · Рыбалка»', semyon: 'Лавка Семёна', belvedere: 'Бельведер «Закат»', westmole: 'Маячный мол',
  marina: 'Свои лодки', udalaya: '«Удалая»', fishboard: 'Рекорды рыбаков', podium: 'Крупнейшие рыбы', hide: 'Рыбный двор',
  ratrace: 'Крысиные бега', lastochka: '«Ласточка»', regatta: 'Регата', eastmole: 'Восточный мол', farmarch: 'Арка «Огороды»', farmgate: 'Калитка фермы',
};
const WHAT = {
  rose: 'точка появления, мяч живёт в центре розы', honor: 'доска почёта и «Последние входы»', rotunda: 'музыкальный автомат',
  cafe: 'кафе, афиша «Сегодня в городе»', cards: 'дурак ×2 и блэкджек под перголой', kurzal: 'слоты и аркада: 3 игры с рекордами',
  billiards: 'бильярд, 3 стола', wheel: 'колесо обозрения', viewdeck: 'трибуна, отсюда смотрят старт регаты',
  kalancha: '«Выше облаков» — забег на каланчу', paintball: 'пейнтбол', fortress: 'крепость — оборона от волн зомби', karting: 'картинг, 3 круга',
  dungeon: '«Подземелье»', aquapark: 'аквапарк «Волна»', wardrobe: 'примерочная', trampolines: 'батуты', plane: 'полёт на гидроплане',
  jettyarch: 'вход к маяку и местам ловли', semyon: 'лавка Семёна: скупка рыбы и задания', belvedere: 'беседка с видом на маяк',
  westmole: 'мол: дальние места ловли, свои лодки', marina: 'стоянка своих лодок', udalaya: 'лодка к баркасу',
  fishboard: 'доска «Рекорды рыбаков»', podium: '«Крупнейшие рыбы сегодня»', hide: 'прятки', ratrace: 'крысиные бега, ставки у табло',
  lastochka: 'прогулка на катере по бухте', regatta: 'портовая регата', eastmole: 'мол с зелёным огнём, декор',
  farmarch: 'дорога на ферму', farmgate: 'калитка — переход на ферму',
};
const EXTRA_RESIDENT = { cards: 'Крупье (блэкджек)', semyon: 'Дед Семён' };
const NO_RUN = new Set(['rose', 'eastmole', 'fishboard', 'podium', 'trampolines', 'belvedere']);
function shortName(n) { return String(n || '').replace(/\s*\(.*?\)/g, '').split(' — ')[0].split(' + ')[0].replace(/:\s.*$/, '').trim(); }

// ------------------------------------------------------------------------------------------------ состояние
const D = {};
const S = { viewers: new Map(), V: null };

async function main() {
  const [assets, layout, pav, npcs, port, page, sceneCfg] = await Promise.all([
    getJSON('data/assets.json'), getJSON('data/layout.json'), getJSON('data/pavilions.json'), getJSON('data/npcs.json'),
    getJSON('data/port.json', { chosen: null }), getJSON('data/page.json'), getJSON('data/scene.json', {}),
  ]);
  Object.assign(D, { assets, layout, pav, npcs, port, page, sceneCfg });
  D.qColor = Object.fromEntries((layout.quarters || []).map((q) => [q.id, q.color]));
  D.pavById = new Map((layout.pavilions || []).map((p) => [p.id, p]));
  D.cardByLayout = new Map();
  for (const c of pav.cards) for (const id of c.layout) D.cardByLayout.set(id, c);
  D.npcById = new Map(npcs.list.map((n) => [n.id, n]));
  D.npcByPav = new Map(npcs.list.map((n) => [n.pav, n]));
  D.models = new Map();
  D.extras = []; // без своего павильона в раскладке (маяк) или вторая модель того же места (доска «онлайн» у почёта)
  for (const m of assets.pavilionModels || []) {
    if (m.layoutId && !m.role && !D.models.has(m.layoutId)) D.models.set(m.layoutId, m);
    else D.extras.push(m);
  }
  D.spawn = layout.spawn || { x: 8, z: -5.6 };
  const steps = [hero, concept, plan, plaza, portSec, pavilions, residents, signs, arcade, questions, release, footer];
  for (const f of steps) { try { f(); } catch (e) { console.error(f.name, e); } }
  setupLightbox();
  setupTheme();
  setupCourse();
  setupLazy3D();
}

const quarterName = (q) => D.pav.quarters[q]?.name || q;
const quarterShort = (q) => D.pav.quarters[q]?.short || q;
const labelFor = (id) => SHORT[id] || shortName(D.pavById.get(id)?.name) || id;
const residentOf = (id) => D.npcByPav.get(id)?.name || EXTRA_RESIDENT[id] || null;
function entranceOf(p) {
  const e = p.entrance;
  if (e && typeof e.x === 'number' && e.kind !== 'none') return e;
  if (p.center) return p.center;
  return null;
}
function runOf(p) {
  const e = entranceOf(p);
  if (!e) return null;
  const d = Math.hypot(e.x - D.spawn.x, e.z - D.spawn.z);
  return { d, s: d / RUN };
}
function signsFor(id) {
  const c = D.cardByLayout.get(id);
  const text = D.pavById.get(id)?.sign?.text;
  if (!c) return text ? [{ text, status: '', icon: '' }] : [];
  const own = c.signs.find((s) => s.text === text);
  return own ? [own] : c.signs.length ? [c.signs[Math.min(c.layout.indexOf(id), c.signs.length - 1)]] : text ? [{ text, status: '' }] : [];
}
const icon = (id) => D.assets.ui?.icons?.[id] || null;
const BALL = '<svg class="ball" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="#2a1f24"/><circle cx="21" cy="21" r="10" fill="#fff3de"/><text x="21" y="25.5" font-size="12" font-weight="900" text-anchor="middle" fill="#2a1f24" font-family="Rubik, sans-serif">8</text></svg>';
const iconHtml = (id, cls = '') => (id === 'ball' ? BALL : icon(id) ? `<img class="${cls}" src="${esc(icon(id))}" alt="" loading="lazy">` : '');

// ------------------------------------------------------------------------------------------------ шапка
function hero() {
  const { assets, layout } = D;
  const v1 = assets.concepts?.v1;
  if (v1) { $('#hero-img').src = v1.full; $('#hero-shot').dataset.full = v1.full; $('#hero-shot').dataset.cap = 'Концепт v1 «Ривьера»'; }
  const bb = layout.land?.bbox || { x0: -30, x1: 64, z0: -56, z1: 22 };
  const w = bb.x1 - bb.x0, d = bb.z1 - bb.z0;
  const old = layout.land?.oldPlaza || { x0: -30, x1: 30, z0: -26, z1: 22 };
  const ow = old.x1 - old.x0, od = old.z1 - old.z0;
  const k = (w * d) / (ow * od);
  const walk = layout.land?.walkableM2, oldA = layout.land?.oldPlaza?.areaM2 || ow * od;
  const quarters = (layout.quarters || []).filter((q) => q.id !== 'hub').length;
  const items = [
    [`×${nf(Math.floor(k * 10) / 10, 1)}`, `площадь: ${w}×${d} м суши, было ${ow}×${od}${walk ? `; пешком ${nf(walk / 1000, 1)} тыс. м² — вдвое больше` : ''}`],
    [String(quarters), 'кварталов вокруг круглой площади «Роза ветров»'],
    [String(D.pav.cards.length), 'павильонов — у каждого режима свой дом'],
    [String(D.npcs.list.length), 'жителей, у каждого входа свой'],
    ['3', 'игры в новой аркаде, с рекордами'],
    ['Fight Club', 'убран из игры совсем — места ему нет', 'x'],
  ];
  $('#stats').innerHTML = items.map(([b, s, c]) => `<li class="${c || ''}"><b>${esc(b)}</b><span>${esc(s)}</span></li>`).join('');
  const pm = D.pav.cards.filter((c) => c.layout.some((id) => D.models.has(id))).length, nm = Object.keys(assets.npcModels || {}).length;
  $('#ready').innerHTML = `Готово 3D-моделей: павильонов <b>${pm}</b> из ${D.pav.cards.length}, жителей <b>${nm}</b> из ${D.npcs.list.length}.` + (pm < D.pav.cards.length || nm < D.npcs.list.length ? ' Где модели ещё нет — показан концепт; новые модели страница подхватит сама.' : '');
}

// ------------------------------------------------------------------------------------------------ концепт
function concept() {
  const C = D.assets.concepts || {};
  const take = [
    ['v1', 'v1 «Ривьера»', 'дома и павильоны', 'Пастельная штукатурка, терракотовая черепица, зелёные ставни, полосатые маркизы, кованые фонари. У аркады — арки с лампочками, у каждого павильона свой силуэт.'],
    ['v2', 'v2 «Курорт 50-х»', 'набережная', 'Белая балюстрада вдоль воды, широкие каменные лестницы, ротонда, колоннады-связки, клумбы и пальмы.'],
    ['v3', 'v3 «Луна-парк у моря»', 'маяк и гавань', 'Маяк на каменном волнорезе с валунами, дощатый пирс с рыбацкой хижиной, доски рекордов и пьедестал с трофейной рыбой, гавань с лодками, катером и гидропланом.'],
  ];
  $('#concepts').innerHTML = take.map(([k, name, what, text]) => {
    const im = C[k];
    return `<figure class="cc"><button type="button" class="shot" data-full="${esc(im?.full)}" data-cap="Концепт ${esc(name)}"><img src="${esc(im?.thumb)}" alt="Концепт ${esc(name)}" loading="lazy" width="720" height="480"></button>
      <figcaption><span class="take">берём: ${esc(what)}</span><h3>${esc(name)}</h3><p>${esc(text)}</p></figcaption></figure>`;
  }).join('');
  const kit = D.assets.kit || {};
  if (kit.sheet) { const b = $('#kit-sheet'); b.dataset.full = kit.sheet.full; b.dataset.cap = 'Набор деталей: стены, крыши, арки, маркизы, фонари, вывески, зелень'; $('img', b).src = kit.sheet.thumb; }
  else $('#kit-sheet').hidden = true;
  const vk = $('#v-kit');
  if (kit.demo) { if (kit.demo34) vk.insertAdjacentHTML('beforeend', `<img class="poster" src="${esc(kit.demo34.thumb)}" alt="">`); }
  else vk.hidden = true;
}

// ------------------------------------------------------------------------------------------------ план
// Пересчёт метров в пиксели SVG: калибруем по многоугольнику суши, который есть в самом SVG (генератор может поменять вид)
async function calibrate(url) {
  const fallback = { sx: 8, ox: 44 + 78 * 8, oy: 44 + 64 * 8 };
  try {
    const txt = await (await fetch(url)).text();
    const land = D.layout.land?.polygon;
    if (!land) return fallback;
    for (const m of txt.matchAll(/<polygon points="([^"]+)"/g)) {
      const pts = m[1].trim().split(/\s+/).map((p) => p.split(',').map(Number));
      if (pts.length !== land.length) continue;
      let i0 = 0, i1 = 0;
      land.forEach((p, i) => { if (p[0] < land[i0][0]) i0 = i; if (p[0] > land[i1][0]) i1 = i; });
      const sx = (pts[i1][0] - pts[i0][0]) / (land[i1][0] - land[i0][0]);
      if (!(sx > 0)) continue;
      const ox = pts[i0][0] - land[i0][0] * sx, oy = pts[i0][1] - land[i0][1] * sx;
      const ok = land.every((p, i) => Math.abs(p[0] * sx + ox - pts[i][0]) < 1.5 && Math.abs(p[1] * sx + oy - pts[i][1]) < 1.5);
      if (ok) return { sx, ox, oy };
    }
  } catch { /* fallback */ }
  return fallback;
}
function plan() {
  const { assets, layout } = D;
  const A = assets.layout || {};
  if (!A.plan) { $('#plan-fig').innerHTML = '<p class="muted">План ещё не собран.</p>'; return; }
  const img = $('#plan-img'), hot = $('#plan-hot'), tip = $('#plan-tip'), wrap = $('#plan-wrap');
  let cur = 'plan';
  const cal = {};
  const vb = A.plan.viewBox || [0, 0, 1812, 1258];
  img.src = A.plan.svg;
  img.width = vb[2]; img.height = vb[3];
  hot.setAttribute('viewBox', vb.join(' '));
  async function draw(key) {
    cal[key] ||= await calibrate(A[key].svg);
    const { sx, ox, oy } = cal[key];
    const X = (x) => (x * sx + ox).toFixed(1), Y = (z) => (z * sx + oy).toFixed(1), Lm = (m) => (m * sx).toFixed(1);
    const out = [];
    for (const p of layout.pavilions || []) {
      if (p.id === 'rose') continue;
      const sh = [];
      if (p.box) sh.push(`<rect class="hs" x="${X(Math.min(p.box.x0, p.box.x1))}" y="${Y(Math.min(p.box.z0, p.box.z1))}" width="${Lm(Math.abs(p.box.x1 - p.box.x0))}" height="${Lm(Math.abs(p.box.z1 - p.box.z0))}"/>`);
      else if (p.circle) sh.push(`<circle class="hs" cx="${X(p.circle.x)}" cy="${Y(p.circle.z)}" r="${Lm(p.circle.r)}"/>`);
      if (p.points) for (const q of p.points) sh.push(`<circle class="hs" cx="${X(q.x)}" cy="${Y(q.z)}" r="${Lm(1.9)}"/>`);
      if (p.decks) for (const dk of p.decks) { const [x0, z0, x1, z1] = Array.isArray(dk) ? dk : dk.b; sh.push(`<rect class="hs" x="${X(x0)}" y="${Y(z0)}" width="${Lm(x1 - x0)}" height="${Lm(z1 - z0)}"/>`); }
      const e = entranceOf(p);
      if (!sh.length && e) sh.push(`<circle class="hs" cx="${X(e.x)}" cy="${Y(e.z)}" r="${Lm(2.2)}"/>`);
      if (!sh.length) continue;
      const dot = e ? `<circle class="hs-e" cx="${X(e.x)}" cy="${Y(e.z)}" r="${Lm(0.9)}"/>` : '';
      out.push(`<g class="hs-g" data-id="${esc(p.id)}" data-q="${esc(p.quarter)}" tabindex="0" role="button" aria-label="${esc(labelFor(p.id))}">${sh.join('')}${dot}</g>`);
    }
    out.push(`<circle class="hs-spawn" cx="${X(D.spawn.x)}" cy="${Y(D.spawn.z)}" r="${Lm(1.1)}"/>`);
    hot.innerHTML = out.join('');
  }
  draw('plan');
  function tipHtml(id) {
    const p = D.pavById.get(id);
    if (!p) return '';
    const card = D.cardByLayout.get(id);
    const res = residentOf(id);
    const run = runOf(p);
    const hasModel = D.models.has(id);
    return `<span class="chip" style="--q:${esc(D.qColor[p.quarter])}"><i></i>${esc(quarterShort(p.quarter))}</span>
      <h4>${escN(labelFor(id))}</h4>
      <dl><dt>Что</dt><dd>${esc(WHAT[id] || shortName(p.idea))}</dd>
      ${res ? `<dt>Встречает</dt><dd>${esc(res)}</dd>` : ''}
      ${card ? `<dt>Павильон</dt><dd>№${esc(card.n)} · ${hasModel ? 'модель готова' : 'модель в работе'}</dd>` : ''}</dl>
      ${run && !p.far && !NO_RUN.has(id) ? `<p class="sec-run">≈ ${nf(run.s, 1)} с бегом от точки появления (${nf(run.d)} м)</p>` : p.far ? '<p class="sec-run">на воде, к нему идут по молу</p>' : ''}`;
  }
  let pinned = null;
  function show(g, ev) {
    $$('.hs-g.on', hot).forEach((x) => x !== g && x.classList.remove('on'));
    g.classList.add('on');
    tip.innerHTML = tipHtml(g.dataset.id);
    tip.hidden = false;
    const rc = wrap.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x, y;
    if (ev && ev.clientX != null && ev.pointerType !== 'touch') { x = ev.clientX - rc.left + 18; y = ev.clientY - rc.top + 14; }
    else { const b = g.getBoundingClientRect(); x = b.left - rc.left + b.width / 2 - tw / 2; y = b.bottom - rc.top + 10; }
    if (x + tw > rc.width - 8) x = (ev && ev.clientX != null && ev.pointerType !== 'touch') ? ev.clientX - rc.left - tw - 18 : rc.width - tw - 8;
    if (y + th > rc.height - 8) y = Math.max(8, (ev && ev.clientY != null ? ev.clientY - rc.top : y) - th - 18);
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
  }
  function hide() { if (pinned) return; tip.hidden = true; $$('.hs-g.on', hot).forEach((x) => x.classList.remove('on')); }
  hot.addEventListener('pointermove', (e) => { const g = e.target.closest('.hs-g'); if (e.pointerType === 'touch') return; if (g) { pinned = null; show(g, e); } else hide(); });
  hot.addEventListener('pointerleave', () => { if (!pinned) hide(); });
  hot.addEventListener('click', (e) => {
    const g = e.target.closest('.hs-g');
    if (!g) { pinned = null; hide(); return; }
    pinned = pinned === g.dataset.id ? null : g.dataset.id;
    if (pinned) show(g, e); else hide();
  });
  hot.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.hs-g')) { e.preventDefault(); pinned = e.target.closest('.hs-g').dataset.id; show(e.target.closest('.hs-g')); } });
  hot.addEventListener('focusin', (e) => { const g = e.target.closest('.hs-g'); if (g) show(g); });
  // как сейчас / как будет
  $$('[data-plan]').forEach((b) => b.addEventListener('click', async () => {
    const key = b.dataset.plan;
    if (!A[key]) return;
    $$('[data-plan]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    cur = key;
    img.src = A[key].svg;
    $('#plan-cap').textContent = key === 'plan'
      ? 'Цвет — квартал, буква у павильона: Н — новое, С — переезжает, 0 — на месте.'
      : 'Пунктир — как сейчас, сплошное — как будет; стрелки — что куда переезжает.';
    pinned = null; hide();
    await draw(key);
  }));
  if (!A.planVsNow) $('[data-plan="planVsNow"]').hidden = true;
  $('#plan-big').addEventListener('click', () => openLightbox(A[cur].svg, cur === 'plan' ? 'План новой набережной' : 'Как сейчас → как будет', true));
  // кварталы
  const qs = (layout.quarters || []);
  $('#qchips').innerHTML = qs.map((q) => `<li><button type="button" class="chip" data-q="${esc(q.id)}" style="--q:${esc(q.color)}"><i></i>${esc(quarterShort(q.id))}</button></li>`).join('');
  let qOn = null;
  const markQ = (q) => $$('.hs-g', hot).forEach((g) => g.classList.toggle('on', !!q && g.dataset.q === q));
  $('#qchips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]'); if (!b) return;
    qOn = qOn === b.dataset.q ? null : b.dataset.q;
    $$('#qchips [data-q]').forEach((x) => x.classList.toggle('on', x.dataset.q === qOn));
    pinned = null; tip.hidden = true; markQ(qOn);
  });
  $('#qchips').addEventListener('pointerover', (e) => { const b = e.target.closest('[data-q]'); if (b && !qOn) markQ(b.dataset.q); });
  $('#qchips').addEventListener('pointerleave', () => markQ(qOn));
  // бегом от спавна
  const ids = [];
  for (const c of D.pav.cards) for (const id of c.layout) if (!ids.includes(id)) ids.push(id);
  for (const id of ['semyon', 'wheel', 'honor']) if (D.pavById.has(id) && !ids.includes(id)) ids.push(id);
  const rows = ids.map((id) => { const p = D.pavById.get(id); const r = p && !p.far && !NO_RUN.has(id) && runOf(p); return r ? { id, ...r } : null; })
    .filter(Boolean).sort((a, b) => a.s - b.s);
  const MAX = 8, GOAL = 6;
  $('#runbars').innerHTML = rows.map((r) => `<li title="${esc(labelFor(r.id))}: ${nf(r.d)} м, ${nf(r.s, 1)} с"><span class="nm">${esc(labelFor(r.id))}</span>
    <span class="tr" style="--goal:${(GOAL / MAX) * 100}%"><i class="br" style="--w:${Math.min(100, (r.s / MAX) * 100).toFixed(1)}%"></i></span><span class="v">${nf(r.s, 1)} с</span></li>`).join('');
  const worst = rows[rows.length - 1];
  if (worst) $('.run-head p').insertAdjacentHTML('afterend', `<p class="small">Дальше всех — ${esc(labelFor(worst.id))}: ${nf(worst.s, 1)} с. Пунктир — 6 секунд.</p>`);
}

// ------------------------------------------------------------------------------------------------ площадь в 3D
function plaza() {
  const views = [['overview', 'Обзор'], ['spawn', 'Со спавна'], ['top', 'Сверху'], ...(D.layout.quarters || []).map((q) => [q.id, quarterShort(q.id)]), ...(D.sceneCfg?.tiredwood ? [['tiredwood', 'Надпись TIREDWOOD']] : [])];
  $('#pz-views').innerHTML = views.map(([id, t]) => `<button type="button" data-view="${esc(id)}">${esc(t)}</button>`).join('');
  $('#pz-views').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    $$('#pz-views button').forEach((x) => x.classList.toggle('on', x === b));
    const v = await startViewer($('#v-plaza'));
    v?.go(b.dataset.view);
  });
  $('#pz-labels').addEventListener('change', (e) => S.viewers.get($('#v-plaza'))?.setLabels(e.target.checked));
  $('#pz-orbit').addEventListener('change', (e) => S.viewers.get($('#v-plaza'))?.setOrbit(e.target.checked));
  const pz = $('#v-plaza');
  const v1 = D.assets.concepts?.v1;
  if (v1) pz.insertAdjacentHTML('beforeend', `<img class="poster" src="${esc(v1.thumb)}" alt="">`);
}
function pzInfo(id) {
  const p = D.pavById.get(id);
  if (!p) return;
  const card = D.cardByLayout.get(id);
  const im = card ? D.assets.pavilionConcepts?.[card.n] : null;
  const res = residentOf(id), run = runOf(p);
  $('#pz-info').innerHTML = `${im ? `<button type="button" class="shot" data-full="${esc(im.full)}" data-cap="${esc(card.title)}"><img src="${esc(im.thumb)}" alt=""></button>` : ''}
    <h4>${escN(labelFor(id))} <span class="chip" style="--q:${esc(D.qColor[p.quarter])}"><i></i>${esc(quarterShort(p.quarter))}</span></h4>
    <p>${esc(WHAT[id] || shortName(p.idea))}${res ? ` · встречает ${esc(res)}` : ''}</p>
    <p class="meta">${D.models.has(id) ? 'Модель павильона готова' : 'Пока заглушка — модель в работе'}${run && !p.far && !NO_RUN.has(id) ? ` · ≈ ${nf(run.s, 1)} с бегом от точки появления` : ''}${card ? ` · <a href="#pv-${esc(card.id)}">к павильону №${esc(card.n)}</a>` : ''}</p>`;
}

// ------------------------------------------------------------------------------------------------ порт
function portSec() {
  const P = D.page.port, A = D.assets.layout || {};
  const chosen = D.port?.chosen && P[D.port.chosen] ? D.port.chosen : null;
  const keys = chosen ? [chosen] : ['A', 'B'].filter((k) => P[k]);
  $('#port-h').textContent = chosen ? `Выбран вариант ${chosen}` : 'Два варианта: A или B';
  $('#port-lead').textContent = chosen
    ? 'Ты попросил переделать всё, что за маяком. Маяк остаётся концом мостков, лодки уходят в нормальную гавань, лавка Семёна — на берег.'
    : 'Ты попросил переделать всё, что за маяком. Левел-дизайнер сделал два варианта, рекомендую A.';
  const body = $('#port-body');
  body.classList.toggle('two', keys.length > 1);
  body.style.setProperty('--cols', String(keys.length));
  body.innerHTML = keys.map((k) => {
    const v = P[k], svg = A[v.svg]?.svg;
    const badge = chosen ? '<span class="badge ok">выбран</span>' : k === 'A' ? '<span class="badge rec">рекомендую</span>' : '';
    return `<article class="pv-port">${svg ? `<button type="button" class="shot" data-full="${esc(svg)}" data-cap="${esc(v.title)}" data-zoom="1"><img src="${esc(svg)}" alt="${esc(v.title)}" loading="lazy"></button>` : ''}
      <div class="txt"><h3>${esc(v.title)} ${badge}</h3><ul class="pts">${v.points.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div></article>`;
  }).join('') + `<div class="port-common"><h3>${chosen ? 'И ещё у маяка' : 'Общее для A и B'}</h3><ul class="pts">${P.common.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
}

// ------------------------------------------------------------------------------------------------ павильоны
function pavilions() {
  const { pav, assets } = D;
  const counts = {};
  for (const c of pav.cards) counts[c.quarter] = (counts[c.quarter] || 0) + 1;
  const order = ['games', 'arenas', 'cliffs', 'beach', 'port', 'farm', 'hub'].filter((q) => counts[q]);
  $('#pv-filters').innerHTML = `<li><button type="button" class="on" data-f="">Все <small>${pav.cards.length}</small></button></li>` +
    order.map((q) => `<li><button type="button" data-f="${q}" style="--q:${esc(D.qColor[q])}"><i></i>${esc(quarterShort(q))} <small>${counts[q]}</small></button></li>`).join('');
  $('#pv-filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    $$('#pv-filters button').forEach((x) => x.classList.toggle('on', x === b));
    $$('.pv').forEach((c) => { c.hidden = !!b.dataset.f && c.dataset.q !== b.dataset.f; });
  });
  $('#pvs').innerHTML = pav.cards.map((c) => {
    const im = assets.pavilionConcepts?.[c.n];
    const models = c.layout.map((id) => D.models.get(id)).filter(Boolean);
    const conceptBtn = im ? `<button type="button" class="shot pv-concept" data-full="${esc(im.full)}" data-cap="Павильон ${esc(c.n)} · ${esc(c.title)}"><img src="${esc(im.thumb)}" alt="Концепт: ${esc(c.title)}" loading="lazy" width="720" height="480"></button>` : '';
    let media;
    if (models.length) {
      const poster = models[0].poster || im?.thumb;
      const tabs = models.length > 1 || c.layout.length > 1
        ? models.map((m, i) => `<button type="button" data-model="${i}" class="${i ? '' : 'on'}">${esc(labelFor(m.layoutId))}</button>`).join('')
        : '<button type="button" data-model="0" class="on">3D</button>';
      media = `<div class="viewer v3d" data-kind="pav" data-card="${esc(c.id)}">${poster ? `<img class="poster" src="${esc(poster)}" alt="">` : ''}<div class="tip">крути мышью</div></div>
        <div class="pv-tabs">${tabs}${im ? '<button type="button" data-concept="1">Концепт</button>' : ''}</div>
        <div class="pv-cover" hidden>${conceptBtn}</div>`;
    } else media = `${conceptBtn}<span class="badge wip">модель в работе</span>`;
    const res = c.npcs.map((id) => D.npcById.get(id)).filter(Boolean);
    return `<article class="pv" id="pv-${esc(c.id)}" data-q="${esc(c.quarter)}">
      <div class="pv-media">${media}</div>
      <div class="pv-body">
        <div class="pv-top"><span class="pv-n"><span class="nr">№</span>${esc(c.n)}</span><span class="chip" style="--q:${esc(D.qColor[c.quarter])}"><i></i>${esc(quarterName(c.quarter))}</span></div>
        <h3>${escN(c.title)}</h3>
        <p>${esc(c.inside)}</p>
        <dl>
          <dt>Силуэт</dt><dd><span class="sw" style="--c:${esc(c.accent)}" title="цвет-акцент"></span>${esc(c.silhouette)}</dd>
          ${res.length ? `<dt>${res.length > 1 ? 'Жители' : 'Житель'}</dt><dd>${res.map((n) => `<a href="#npc-${esc(n.id)}">${esc(n.name)}</a>`).join(', ')}</dd>` : ''}
          <dt>${c.signs.length > 1 ? 'Вывески' : 'Вывеска'}</dt><dd>${c.signs.length ? `<span class="minisigns">${c.signs.map((s) => `<span class="minisign">${iconHtml(s.icon)}<b>${esc(s.text)}</b></span>`).join('')}</span>` : 'нет — это набережная, а не здание'}</dd>
        </dl>
      </div></article>`;
  }).join('');
  // переключатель 3D / концепт и модели в карточке
  $('#pvs').addEventListener('click', async (e) => {
    const b = e.target.closest('.pv-tabs button'); if (!b) return;
    const media = b.closest('.pv-media'), cover = $('.pv-cover', media);
    $$('.pv-tabs button', media).forEach((x) => x.classList.toggle('on', x === b));
    if (b.dataset.concept) { cover.hidden = false; return; }
    cover.hidden = true;
    const host = $('.viewer', media);
    const v = await startViewer(host);
    if (v && +b.dataset.model !== v.current) v.show(+b.dataset.model);
  });
}
function pavModelsFor(card) {
  return card.layout.map((id) => {
    const m = D.models.get(id);
    const n = D.npcByPav.get(id);
    const npc = n && D.assets.npcModels?.[n.id] ? D.assets.npcModels[n.id] : null;
    return m ? { file: m.file, title: m.name || labelFor(id), signs: signsFor(id), layoutId: id, npc } : null;
  }).filter(Boolean);
}

// ------------------------------------------------------------------------------------------------ жители
function residents() {
  const { npcs, assets } = D;
  const nm = Object.keys(assets.npcModels || {}).length;
  $('#npc-h').textContent = `${npcs.list.length} жителей — кто встречает у входов`;
  if (assets.npcLineup) { const b = $('#npc-lineup'); b.dataset.full = assets.npcLineup.full; b.dataset.cap = 'Все жители рядом (концепты)'; $('img', b).src = assets.npcLineup.thumb; }
  else $('#npc-lineup').hidden = true;
  $('#npc-grid').innerHTML = npcs.list.map((n) => {
    const im = assets.npcConcepts?.[n.id];
    const model = assets.npcModels?.[n.id];
    const media = model
      ? `<div class="viewer v3d" data-kind="npc" data-npc="${esc(n.id)}">${(model.poster || im?.thumb) ? `<img class="poster" src="${esc(model.poster || im.thumb)}" alt="">` : ''}<span class="badge ok">3D</span></div>`
      : `${im ? `<button type="button" class="shot" data-full="${esc(im.full)}" data-cap="${esc(n.name)} — концепт"><img src="${esc(im.thumb)}" alt="${esc(n.name)}" loading="lazy" width="720" height="720"></button>` : ''}<span class="badge wip">модель в работе</span>`;
    return `<article class="npc" id="npc-${esc(n.id)}" style="--c:${esc(n.color)}">
      <div class="npc-media">${media}</div>
      <div class="npc-body">
        <h3><i aria-hidden="true"></i>${esc(n.name)}</h3>
        <p class="role">${esc(n.role)} · <span class="muted">${esc(quarterShort(n.quarter))}</span></p>
        <p class="hook">Узнаёшь по: ${esc(n.hook)}</p>
        <ul class="bubbles">${n.lines.slice(0, 3).map((t) => `<li>${esc(t)}</li>`).join('')}${n.live ? `<li class="live">${esc(n.live)}</li>` : ''}</ul>
      </div></article>`;
  }).join('');
  const all = nm >= npcs.list.length;
  $('#npc-note').textContent = (all
    ? `Все ${nm} моделей готовы — крути любого мышью, они дышат, моргают и машут. `
    : `Моделей готово ${nm} из ${npcs.list.length}, у остальных пока концепт. `) +
    'Бочку и Капитана Севу узнаваемо улучшили, Зуко стал настоящим зомби-желейкой: швы, заплатки, сонный глаз, один зуб.';
}

// ------------------------------------------------------------------------------------------------ таблички (скин «Ретро-парк 2.0»)
// Токены — game-opus-ui/docs/sign-tokens-retropark2.md: эмаль, кант, маркиза, иконка в круге, Rubik Mono One, точка статуса.
// main — главный вход в режим: у него лампочки (в игре — свечение, не лампы). st: go — идёт сейчас, open — свободно, bad — закрыто.
const SIGN_DEMO = [
  { t: 'КАРТИНГ', icon: 'kart', main: true, s: [['go', 'идёт заезд · 3 игрока'], ['open', 'старт через 0:12 · в круге 2'], ['open', 'свободно · заходи']] },
  { t: 'ПЕЙНТБОЛ', icon: 'paint', main: true, s: [['go', 'идёт бой · 6 игроков'], ['open', 'пусто — заходи первым']] },
  { t: 'ПОДЗЕМЕЛЬЕ', icon: 'dungeon', main: true, s: [['open', 'рекорд 12 волн · Саня'], ['go', 'внизу двое · волна 7']] },
  { t: 'РЫБНЫЙ ДВОР', icon: 'hide-box', main: true, s: [['open', 'сбор 1 из 6 · нужно двое'], ['go', 'прячутся · дождись раунда']] },
  { t: '«ЛАСТОЧКА»', icon: 'boat', s: [['open', 'отплытие через 0:25 · 2 места'], ['bad', 'катер в бухте · нет мест']] },
  { t: 'КРЫСИНЫЕ БЕГА', icon: 'rat', s: [['open', 'приём ставок · старт через 0:40'], ['go', 'бегут! болей за свою']] },
  { t: 'АРКАДА', icon: 'token', s: [['open', 'свободно 4 автомата'], ['go', 'играет Саня · 880 очков']] },
  { t: 'ОГОРОДЫ', icon: 'farm-gate', s: [['open', 'на ферме 3 из 8 · место есть'], ['go', 'сбор урожая · 2 игрока']] },
];
const NICK = ['#ffb36b', '#a2f0b8', '#c4ccff', '#ffa3b4', '#ffe58c', '#9fe3da'];
const BOARDS = [
  { t: 'ТОП НЕДЕЛИ', icon: 'records', sub: 'жетоны за неделю', rows: [['Саня', '12 480'], ['Кракозябра', '11 020'], ['Мармелад', '9 870'], ['Tester7', '8 400'], ['Желейка', '7 950', true]] },
  { t: 'КТО ОНЛАЙН', icon: 'online', sub: 'сейчас на набережной · 6', rows: [['Саня', 'картинг'], ['Кракозябра', 'рыбалка'], ['Мармелад', 'кафе'], ['Tester7', 'аркада'], ['Желейка', 'площадь', true]] },
];
const ARROW = { '↑': 0, '↗': 45, '→': 90, '↘': 135, '↓': 180, '↙': 225, '←': 270, '↖': 315 };
// числа в статусе — Rubik 800
const nums = (t) => esc(t).replace(/(\d+(?:[:\s]\d+)*)/g, '<b>$1</b>');
const lampsSvg = '<svg class="lamps" aria-hidden="true"><rect/></svg>';
function signHtml(g, i) {
  const [st, txt] = g.s[0];
  return `<div class="sg${g.main ? ' main' : ''}" data-i="${i}">${g.main ? lampsSvg : ''}<span class="sg-ic">${iconHtml(g.icon)}</span>
    <span class="sg-t">${esc(g.t)}</span><span class="sg-s"><span class="sg-x">${nums(txt)}</span><i class="${st}"></i></span></div>`;
}
function signs() {
  const demo = $('#signs-demo');
  const v1 = D.assets.concepts?.v1;
  if (v1) demo.style.setProperty('--bgimg', `url("${new URL(v1.full, location.href).href}")`); // полный адрес: относительный в CSS-переменной браузеры считают по-разному
  $('#signs-grid').innerHTML = SIGN_DEMO.map(signHtml).join('');
  $('#boards').innerHTML = BOARDS.map((b) => `<div class="board-big"><div class="sg bb-head"><span class="sg-ic">${iconHtml(b.icon)}</span><span class="sg-t">${esc(b.t)}</span><span class="sg-s"><span class="sg-x">${nums(b.sub)}</span></span></div>
    <ol>${b.rows.map(([n, v, me], k) => `<li class="${me ? 'me' : ''}"><span class="pl">${k + 1}</span><span class="nk" style="color:${me ? '#ffcd4a' : NICK[k % NICK.length]}">${esc(n)}${me ? ' · ты' : ''}</span><span class="vl">${nums(v)}</span></li>`).join('')}</ol></div>`).join('');
  // живой статус меняется сам, пока раздел на экране
  let tick = 0, vis = false;
  new IntersectionObserver(([e]) => { vis = e.isIntersecting; }).observe(demo);
  if (!REDUCED) setInterval(() => {
    if (!vis || document.hidden) return;
    tick++;
    $$('.sg[data-i]', demo).forEach((el) => {
      const g = SIGN_DEMO[+el.dataset.i];
      if (g.s.length < 2) return;
      const [st, txt] = g.s[(tick + +el.dataset.i) % g.s.length];
      const s = $('.sg-s', el);
      s.classList.add('fade');
      setTimeout(() => { $('i', s).className = st; $('.sg-x', s).innerHTML = nums(txt); s.classList.remove('fade'); }, 260);
    });
  }, 3400);
  // столбы-указатели
  const posts = D.layout.signposts || [];
  const drawPost = (i) => {
    const p = posts[i];
    if (!p) { $('#post').innerHTML = ''; return; }
    $('#post').innerHTML = p.arrows.map((a) => {
      const m = /\s*([↑↗→↘↓↙←↖])\s*$/.exec(a);
      const name = m ? a.slice(0, m.index) : a;
      const deg = m ? ARROW[m[1]] : 0;
      const side = deg === 0 || deg === 180 ? 'c' : deg < 180 ? 'r' : 'l';
      return `<div class="board ${side}"><svg viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(${deg}deg)"><path d="M12 3 5 11h4.5v10h5V11H19z" fill="currentColor"/></svg><span>${esc(name)}</span></div>`;
    }).join('');
    $$('#post-pick button').forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
  };
  $('#post-pick').innerHTML = posts.map((p, i) => `<li><button type="button" data-i="${i}" title="${esc(p.name)}">${esc(p.id)} · ${esc(shortPost(p.name))}</button></li>`).join('');
  $('#post-pick').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) drawPost(+b.dataset.i); });
  drawPost(0);
}
function shortPost(n) { return String(n).replace(/^Главный указатель.*/, 'у спавна').replace(/^Развилка /, '').replace(/^Корень мостков/, 'мостки').replace(/^Север пляжа/, 'пляж').replace(/^Юго-восток площади/, 'юго-восток'); }

// ------------------------------------------------------------------------------------------------ аркада
function arcade() {
  const fr = $('#arcade-if');
  const fit = () => {
    try {
      const doc = fr.contentDocument;
      if (!doc?.body) return;
      if (doc.body.classList.contains('playing')) return;
      // высота по содержимому, а не scrollHeight: у аркады body min-height 100vh, а 100vh внутри окна — это высота самого окна
      const wrap = doc.querySelector('.wrap') || doc.body;
      const h = Math.ceil(wrap.getBoundingClientRect().bottom + (doc.defaultView?.scrollY || 0) + 4);
      if (h > 200 && Math.abs(h - fr.offsetHeight) > 2) fr.style.height = h + 'px';
    } catch { /* другой домен — остаётся высота из CSS */ }
  };
  fr.addEventListener('load', () => {
    try {
      const doc = fr.contentDocument;
      const st = doc.createElement('style');
      // своя шапка у страницы уже есть — у встроенной аркады прячем заголовок и растяжку на весь экран
      st.textContent = '.top{display:none!important} .wrap{padding-top:14px!important;padding-bottom:20px!important} body{min-height:0!important;background-image:none!important}';
      doc.head.appendChild(st);
      new ResizeObserver(fit).observe(doc.querySelector('.wrap') || doc.body);
      // игра открыта — окно аркады во весь экран и сцена в кадре; закрыта — снова по содержимому
      new MutationObserver(() => {
        if (doc.body.classList.contains('playing')) {
          fr.style.height = Math.max(560, window.innerHeight - 64) + 'px';
          const top = fr.getBoundingClientRect().top + window.scrollY - 58;
          window.scrollTo({ top, behavior: REDUCED ? 'auto' : 'smooth' });
        } else fit();
      }).observe(doc.body, { attributes: true, attributeFilter: ['class'] });
      fit();
    } catch (e) { console.warn('аркада: высота по содержимому недоступна', e); }
  });
}

// ------------------------------------------------------------------------------------------------ вопросы и выпуск
function questions() {
  const portOpen = !(D.port?.chosen && D.page.port[D.port.chosen]);
  const qs = D.page.questions.filter((q) => !q.onlyIfPortOpen || portOpen);
  const L = ['а', 'б', 'в', 'г'];
  const dec = D.page.decided;
  if (dec) {
    // владелец не ответил — берём рекомендованные; показываем как решение, без призыва отвечать
    $('#questions h2').textContent = dec.title;
    $('#questions .sec-head .lead').textContent = dec.lead;
    $('#qs').classList.add('decided');
  }
  $('#qs').innerHTML = qs.map((q) => `<li class="q"><h3>${esc(q.title)}</h3><ol>${q.options.map((o, i) => `<li class="${o.rec ? 'rec' : ''}"><b>${L[i]})</b><span>${esc(o.t)}</span>${o.rec ? (dec ? `<span class="badge ok">решено · ${esc(dec.date)}</span>` : '<span class="badge rec">рекомендую</span>') : ''}</li>`).join('')}</ol></li>`).join('');
}
function release() {
  const b = D.layout.budget;
  if (!b) return;
  const LIMIT = 300, total = b.totalDraws || b.perQuarter.reduce((a, x) => a + x.draws, 0);
  const qn = (q) => D.pav.quarters[q]?.short || (q === 'common' || q === 'общее' ? 'Общее' : q);
  const rows = [...b.perQuarter].sort((x, y) => y.draws - x.draws);
  const max = Math.max(...rows.map((r) => r.draws));
  $('#budget').innerHTML = `<h3>Бюджет отрисовки</h3>
    <p class="big">${total}<small>отрисовок в худшем кадре — видно всё и 8 игроков рядом</small></p>
    <div class="meter" role="img" aria-label="${total} из ${LIMIT} отрисовок, цель 250–270"><span class="fill" style="--v:${(total / LIMIT) * 100}%"></span><span class="band" style="--a:${(250 / LIMIT) * 100}%;--w:${(20 / LIMIT) * 100}%"></span><span class="lim"></span></div>
    <p class="meter-legend"><span>предел игры — ${LIMIT}</span><span>цель — 250–270</span><span>со спавна обычно 190–230</span></p>
    <ul class="bq">${rows.map((r) => `<li title="${esc(r.what || '')}"><span>${esc(qn(r.q))}</span><span class="tr"><i class="br" style="--w:${((r.draws / max) * 100).toFixed(1)}%"></i></span><span class="v">${r.draws}</span></li>`).join('')}</ul>
    <p class="small muted">Как держим: статика склеена по семействам материалов, повторы — инстансами, вывески — одним атласом, тени статичные, дальние кварталы прячутся.</p>`;
}
function footer() {
  const t = D.assets.generatedAt ? new Date(D.assets.generatedAt) : null;
  $('#gen-at').textContent = t ? `последняя сборка — ${t.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.` : '';
}

// ------------------------------------------------------------------------------------------------ лайтбокс, тема, навигация
function openLightbox(src, cap, zoomable = false) {
  const dlg = $('#lightbox'), body = $('.lb-body', dlg), img = $('img', dlg), zb = $('.lb-zoom', dlg);
  img.src = src; img.alt = cap || '';
  $('.lb-cap', dlg).textContent = cap || '';
  body.classList.remove('full');
  zb.hidden = !zoomable; zb.textContent = 'Крупнее';
  try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
}
function setupLightbox() {
  const dlg = $('#lightbox'), body = $('.lb-body', dlg), zb = $('.lb-zoom', dlg);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-full]');
    if (!b || !b.dataset.full || b.dataset.full === 'undefined') return;
    openLightbox(b.dataset.full, b.dataset.cap, !!b.dataset.zoom || /\.svg$/.test(b.dataset.full));
  });
  const toggle = () => { body.classList.toggle('full'); zb.textContent = body.classList.contains('full') ? 'Вписать' : 'Крупнее'; };
  zb.addEventListener('click', toggle);
  $('img', dlg).addEventListener('click', toggle);
  $('#lb-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
}
function setupTheme() {
  const btn = $('#theme-btn');
  const names = { '': 'Авто', light: 'Светлая', dark: 'Тёмная' };
  const cur = () => document.documentElement.dataset.theme || '';
  const paint = () => { $('.lbl', btn).textContent = names[cur()]; btn.title = 'Тема: ' + names[cur()].toLowerCase(); };
  btn.addEventListener('click', () => {
    const next = { '': 'light', light: 'dark', dark: '' }[cur()];
    if (next) document.documentElement.dataset.theme = next; else delete document.documentElement.dataset.theme;
    try { if (next) localStorage.setItem('pz-theme', next); else localStorage.removeItem('pz-theme'); } catch { /* без памяти */ }
    paint();
  });
  paint();
}
function setupCourse() {
  const links = $$('#course a');
  const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver((ents) => {
    for (const e of ents) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => a.classList.remove('on'));
      const a = map.get(e.target.id);
      if (a) {
        a.classList.add('on');
        const ol = a.closest('ol');
        if (ol && (a.offsetLeft < ol.scrollLeft || a.offsetLeft + a.offsetWidth > ol.scrollLeft + ol.clientWidth)) ol.scrollLeft = a.offsetLeft - 16;
      }
    }
  }, { rootMargin: '-40% 0px -55% 0px' });
  for (const id of map.keys()) { const s = document.getElementById(id); if (s) io.observe(s); }
}

// ------------------------------------------------------------------------------------------------ 3D: ленивый запуск
const pending = new Map();
function startViewer(host) {
  if (S.viewers.has(host)) return Promise.resolve(S.viewers.get(host));
  if (pending.has(host)) return pending.get(host);
  const p = (async () => {
    const bar = document.createElement('div'); bar.className = 'load'; bar.innerHTML = '<i></i>'; host.appendChild(bar);
    const progress = (k) => { bar.firstChild.style.width = Math.max(4, Math.round(k * 100)) + '%'; };
    try {
      S.V ||= await import('./viewers.js');
      const V = S.V, kind = host.dataset.kind;
      let v = null;
      if (kind === 'kit') v = await V.pavilionViewer(host, { assets: D.assets, models: [{ file: D.assets.kit.demo, title: 'Проба набора: аркада и набережная', signs: [], k: 0.8 }], progress });
      else if (kind === 'pav') {
        const card = D.pav.cards.find((c) => c.id === host.dataset.card);
        const models = pavModelsFor(card);
        v = await V.pavilionViewer(host, { assets: D.assets, models, progress });
      } else if (kind === 'npc') {
        const n = D.npcById.get(host.dataset.npc);
        v = await V.npcViewer(host, { file: D.assets.npcModels[n.id].file, name: n.name, progress });
      } else if (kind === 'plaza') {
        let ready = null;
        const say = () => v.stage.toast(`На площади: готовых павильонов ${ready.pavilions}, жителей ${ready.npcs}. Остальное — заглушки.`);
        const npcs = D.npcs.list.filter((n) => D.assets.npcModels?.[n.id]).map((n) => ({ ...n, file: D.assets.npcModels[n.id].file }));
        v = await V.plazaViewer(host, {
          assets: D.assets, layout: D.layout, models: D.models, npcs, signFor: signsFor, labelFor, quarterOf: quarterShort,
          extras: D.extras, tiredwood: D.sceneCfg?.tiredwood || null,
          gameModels: (D.assets.gameModels || []).map((g) => ({ ...g, pick: (D.assets.pavilionModels || []).find((m) => m.key === g.of)?.layoutId || null })),
          onPick: pzInfo, progress,
          onReady: (x) => { ready = x; if (v) say(); },
        });
        if (ready) say();
      }
      S.viewers.set(host, v);
      requestAnimationFrame(() => requestAnimationFrame(() => { const po = $('.poster', host); if (po) { po.style.opacity = '0'; setTimeout(() => po.remove(), 450); } }));
      return v;
    } catch (e) {
      console.error(e);
      const err = document.createElement('div'); err.className = 'err';
      err.textContent = 'Не удалось запустить 3D: ' + (e.message || e) + '. Обнови страницу — или смотри картинку.';
      host.appendChild(err);
      setTimeout(() => err.remove(), 6000);
      return null;
    } finally {
      bar.remove();
      pending.delete(host);
    }
  })();
  pending.set(host, p);
  return p;
}
function setupLazy3D() {
  const io = new IntersectionObserver((ents) => {
    for (const e of ents) if (e.isIntersecting) { io.unobserve(e.target); startViewer(e.target); }
  }, { rootMargin: '300px 0px' });
  $$('.v3d').forEach((h) => { if (!h.hidden) io.observe(h); });
}

main().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('afterbegin', `<p style="padding:16px;background:#c9643b;color:#fff">Страница не загрузилась: ${esc(e.message || e)}. Открой её через сервер (не как файл).</p>`);
});
