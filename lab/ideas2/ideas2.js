// TIREDWOOD — большой ресерч 07.11: отрисовка страницы. Все тексты и числа — в data.js.
// Блоки: сводка, цифры (плитки + столбики с подсказкой), выводы, пакеты, разделы с идеями, новые режимы,
// отброшенное, фильтры и список «Беру» с копированием (как на lab/ideas/).
import { SUB, SUM, STATS, CHART, THEMES, PACKS, DIRS as RAW_DIRS, MODES, MODES_LEAD, DROP } from './data.js';

// Порядок разделов на странице: от мира к режимам, потом прогресс и ощущения.
const DIR_ORDER = 'МАЧБЗГУД';
const DIRS = [...RAW_DIRS].sort((a, b) => DIR_ORDER.indexOf(a.id) - DIR_ORDER.indexOf(b.id));

const IC = n => `../../client/assets/ui/icons/${n}.webp`;
const COST = { S: 'до пары часов', M: 'полдня–день', L: 'несколько дней' };

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

// ---------- данные для выбора
const MODE_SEC = { id: 'И', name: 'Новые режимы и события', short: 'Новые режимы', icon: 'compass' };
const ALL = [
  ...DIRS.flatMap(d => d.ideas.map(i => ({ ...i, sec: d.id }))),
  ...MODES.map(m => ({ ...m, sec: MODE_SEC.id, mode: true })),
];
const BY_ID = new Map(ALL.map(i => [i.id, i]));
const ORDER = ALL.map(i => i.id);
const REC = ALL.filter(i => i.rec).map(i => i.id);
const nodes = new Map(); // id → карточки, которые отмечаются «Беру»
const addNode = (id, n) => { if (!nodes.has(id)) nodes.set(id, []); nodes.get(id).push(n); };

// ---------- шапка и сводка
document.getElementById('sub').innerHTML = SUB;
const sum = document.getElementById('sum');
for (const c of SUM) {
  const card = el('div', 'ix-card');
  card.append(el('p', 'k-eyebrow', c.k), el('div', '', c.html));
  sum.append(card);
}

// ---------- цифры: плитки
const stats = document.getElementById('stats');
for (const s of STATS) {
  const t = el('div', 'ix-stat');
  t.append(el('p', 'ix-stat-n', s.n), el('p', 'ix-stat-t', s.t));
  stats.append(t);
}

// ---------- цифры: столбики (одна серия — без легенды, заголовок называет её)
const bars = document.getElementById('bars');
const tip = document.getElementById('tip');
const chartBox = document.getElementById('chart');
// Только «сколько человек пробовали»: у режимов разные единицы (прокруты, рыбы, забеги) — их столбики несравнимы,
// поэтому число игр — подписью и в подсказке, а не отдельной шкалой.
function drawBars() {
  const rows = [...CHART.rows].sort((a, b) => b.players - a.players);
  const max = Math.max(...rows.map(r => r.players));
  bars.textContent = '';
  for (const r of rows) {
    const row = el('div', `ix-bar${r.dim ? ' is-new' : ''}`);
    row.setAttribute('role', 'listitem');
    row.tabIndex = 0;
    const v = r.players;
    const label = `<b>${v}</b><span class="ix-bar-g"> · ${r.games.toLocaleString('ru-RU')} ${r.unit}</span>`;
    row.setAttribute('aria-label', `${r.name}: ${r.players} человек, ${r.games.toLocaleString('ru-RU')} ${r.unit}`);
    const fill = el('span', 'ix-bar-fill');
    fill.style.setProperty('--p', String(v / max)); // ширина — в CSS: место под подпись оставлено
    const track = el('span', 'ix-bar-track');
    track.append(fill, el('span', 'ix-bar-v', label));
    row.append(el('span', 'ix-bar-l', r.name), track);
    const show = ev => {
      tip.innerHTML = `<b>${r.name}</b><br>${r.players} человек пробовали · ${r.games.toLocaleString('ru-RU')} ${r.unit}${r.note ? `<br>${r.note}` : ''}`;
      tip.hidden = false;
      const box = chartBox.getBoundingClientRect();
      const rb = row.getBoundingClientRect();
      const x = ev && ev.clientX ? ev.clientX - box.left + 14 : rb.left - box.left + 170;
      tip.style.left = `${Math.min(x, box.width - 270)}px`;
      tip.style.top = `${rb.bottom - box.top + 4}px`;
    };
    row.addEventListener('mousemove', show);
    row.addEventListener('focus', () => show());
    row.addEventListener('mouseleave', () => { tip.hidden = true; });
    row.addEventListener('blur', () => { tip.hidden = true; });
    bars.append(row);
  }
}
document.getElementById('chartNote').innerHTML = CHART.note;
drawBars();

// ---------- переход к карточке по коду
function goTo(id) {
  const n = (nodes.get(id) || [])[0];
  if (!n) return;
  if (n.hidden || n.closest('[hidden]')) setFilter({ sec: 'all', cost: 'all', star: false });
  n.scrollIntoView({ behavior: 'smooth', block: 'center' });
  n.classList.add('is-flash');
  setTimeout(() => n.classList.remove('is-flash'), 1400);
}
const chip = id => {
  const it = BY_ID.get(id);
  const b = el('button', 'ix-chip', it ? `${id}<small>${it.t}</small>` : id);
  b.type = 'button';
  b.addEventListener('click', () => goTo(id));
  return b;
};

// ---------- выводы
const themeGrid = document.getElementById('themeGrid');
THEMES.forEach((th, i) => {
  const box = el('article', 'ix-theme');
  box.append(el('p', 'ix-theme-n', `Вывод ${i + 1}`), el('h3', 'ix-theme-t', th.t), el('p', 'ix-theme-d', th.d));
  const chips = el('div', 'ix-chips');
  for (const id of th.codes) chips.append(chip(id));
  box.append(chips);
  themeGrid.append(box);
});

// ---------- пакеты
const packGrid = document.getElementById('packGrid');
const packBtns = [];
for (const p of PACKS) {
  const box = el('article', 'ix-pack');
  const h = el('div', 'ix-pack-h');
  const img = el('img');
  img.src = IC(p.icon);
  img.alt = '';
  const ht = el('div');
  ht.append(el('h3', 'ix-pack-t', p.t), el('p', 'ix-pack-time', p.time));
  h.append(img, ht);
  const chips = el('div', 'ix-chips');
  for (const id of p.codes) chips.append(chip(id));
  const btn = el('button', 'k-btn k-btn--ghost k-btn--sm', 'Взять пакет');
  btn.type = 'button';
  btn.addEventListener('click', () => {
    const all = p.codes.every(id => pick.has(id));
    for (const id of p.codes) { if (all) pick.delete(id); else pick.add(id); }
    sync();
  });
  packBtns.push({ p, btn, box });
  box.append(h, el('p', 'ix-pack-d', p.d), chips, btn);
  packGrid.append(box);
}

// ---------- карточки идей
function costBadge(c) {
  return el('span', 'ix-cost', `<b>${c}</b> · ${COST[c]}`);
}
function ideaCard(it) {
  const c = el('button', 'ix-idea');
  c.type = 'button';
  c.dataset.id = it.id;
  const top = el('span', 'ix-idea-top');
  top.append(el('span', 'ix-id', it.id));
  if (it.rec) top.append(el('span', 'ix-rec', '★'));
  top.append(costBadge(it.c));
  c.append(top, el('span', 'ix-idea-t', it.t), el('span', 'ix-idea-d', it.see));
  if (it.why) c.append(el('span', 'ix-idea-w', `<b>Почему:</b> ${it.why}`));
  if (it.ref) c.append(el('span', 'ix-idea-ref', `<b>Как у других:</b> ${it.ref}`));
  if (it.on) c.append(el('span', 'ix-idea-on', `<b>Строится на:</b> ${it.on}`));
  if (it.sp) c.append(el('span', 'ix-idea-sp', `<b>Решить тебе:</b> ${it.sp}`));
  c.append(el('span', 'ix-take', '<span class="ix-check"></span>Беру'));
  c.addEventListener('click', () => toggle(it.id));
  addNode(it.id, c);
  return c;
}

const groups = document.getElementById('groups');
const groupBoxes = [];
for (const d of DIRS) {
  const box = el('section', 'ix-group');
  box.id = `sec-${d.id}`;
  box.dataset.sec = d.id;
  const h = el('h3', 'ix-group-h');
  const img = el('img');
  img.src = IC(d.icon);
  img.alt = '';
  h.append(el('span', 'ix-letter', d.id), img, document.createTextNode(d.name));
  box.append(h);
  if (d.lead) box.append(el('p', 'ix-group-n', d.lead));
  const now = el('div', `ix-now${d.shot ? '' : ' is-noshot'}`);
  if (d.shot) {
    const f = el('figure', 'ix-shot');
    const im = el('img');
    im.src = d.shot;
    im.alt = d.cap || '';
    im.loading = 'lazy';
    f.append(im, el('figcaption', '', d.cap || ''));
    now.append(f);
  }
  const diag = el('ul', 'ix-diag');
  diag.append(el('li', 'ix-diag-h', 'Диагноз — что сейчас мешает'));
  for (const line of d.diag) diag.append(el('li', '', line));
  now.append(diag);
  box.append(now);
  const list = el('div', 'ix-ideas');
  for (const it of d.ideas) list.append(ideaCard({ ...it, sec: d.id }));
  box.append(list);
  groups.append(box);
  groupBoxes.push(box);
}

// ---------- новые режимы
document.getElementById('modesLead').innerHTML = MODES_LEAD;
const modeGrid = document.getElementById('modeGrid');
for (const m of MODES) {
  const c = el('button', 'ix-mode');
  c.type = 'button';
  c.dataset.id = m.id;
  const top = el('span', 'ix-idea-top');
  top.append(el('span', 'ix-id', m.id));
  if (m.rec) top.append(el('span', 'ix-rec', '★'));
  top.append(costBadge(m.c));
  c.append(top, el('span', 'ix-mode-t', m.t), el('span', 'ix-mode-d', m.see));
  const dl = el('dl');
  const row = (k, v) => { if (v) dl.append(el('dt', '', k), el('dd', '', v)); };
  row('Где', m.where);
  row('Цикл', m.loop);
  row('Момент', m.moment);
  row('Сколько людей', m.people);
  row('Как у других', m.ref);
  row('Строится на', m.on);
  row('Первый шаг', m.first);
  c.append(dl);
  if (m.sp) c.append(el('span', 'ix-idea-sp', `<b>Решить тебе:</b> ${m.sp}`));
  c.append(el('span', 'ix-take', '<span class="ix-check"></span>Беру'));
  c.addEventListener('click', () => toggle(m.id));
  addNode(m.id, c);
  modeGrid.append(c);
}

// ---------- отброшенное
const dropList = document.getElementById('dropList');
for (const line of DROP) dropList.append(el('li', '', line));

// ---------- фильтры
const F = { sec: 'all', cost: 'all', star: false };
const fSec = document.getElementById('fSec');
const fCost = document.getElementById('fCost');
const fStar = document.getElementById('fStar');
const segBtn = (box, key, val, label, letter) => {
  const b = el('button');
  b.type = 'button';
  b.dataset.v = val;
  if (letter) b.append(el('b', '', letter));
  b.append(document.createTextNode(label));
  b.addEventListener('click', () => setFilter({ [key]: val }));
  box.append(b);
};
segBtn(fSec, 'sec', 'all', 'Все');
for (const d of [...DIRS, MODE_SEC]) segBtn(fSec, 'sec', d.id, d.short, d.id);
segBtn(fCost, 'cost', 'all', 'Любая');
for (const c of ['S', 'M', 'L']) segBtn(fCost, 'cost', c, c);
fStar.addEventListener('click', () => setFilter({ star: !F.star }));

function setFilter(p) {
  Object.assign(F, p);
  for (const b of fSec.children) b.setAttribute('aria-pressed', String(b.dataset.v === F.sec));
  for (const b of fCost.children) b.setAttribute('aria-pressed', String(b.dataset.v === F.cost));
  fStar.setAttribute('aria-pressed', String(F.star));
  const pass = c => {
    const it = BY_ID.get(c.dataset.id);
    const ok = (F.sec === 'all' || it.sec === F.sec) && (F.cost === 'all' || it.c === F.cost) && (!F.star || it.rec);
    c.hidden = !ok;
    return ok ? 1 : 0;
  };
  let shown = 0;
  let inGroups = 0;
  for (const box of groupBoxes) {
    let n = 0;
    for (const c of box.querySelectorAll('.ix-idea')) n += pass(c);
    box.hidden = n === 0;
    inGroups += n;
  }
  let inModes = 0;
  for (const c of modeGrid.querySelectorAll('.ix-mode')) inModes += pass(c);
  document.getElementById('modes').hidden = inModes === 0;
  shown = inGroups + inModes;
  document.getElementById('fCount').textContent = `показано ${shown} из ${ALL.length}`;
  const empty = document.getElementById('empty');
  empty.hidden = inGroups > 0;
  empty.innerHTML = inModes > 0 ? 'Подходящие идеи — ниже, в блоке <a href="#modes">«Новые режимы»</a>.' : 'Под эти фильтры ничего нет — сними один из них.';
}
setFilter({});

// ---------- выбор «Беру»
const KEY = 'tiredwood-ideas2-pick';
let pick = new Set(REC);
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (Array.isArray(saved)) pick = new Set(saved.filter(id => ORDER.includes(id)));
} catch { /* без хранилища — рекомендованное */ }

function toggle(id) {
  if (pick.has(id)) pick.delete(id); else pick.add(id);
  sync();
}
const listText = () => ORDER.filter(id => pick.has(id)).join(', ');
function sync() {
  for (const [id, list] of nodes) {
    const on = pick.has(id);
    for (const n of list) { n.classList.toggle('is-on', on); n.setAttribute('aria-pressed', String(on)); }
  }
  for (const { p, btn, box } of packBtns) {
    const all = p.codes.every(id => pick.has(id));
    btn.textContent = all ? 'Убрать пакет' : 'Взять пакет';
    box.classList.toggle('is-on', all);
  }
  document.getElementById('pickN').textContent = String(pick.size);
  document.getElementById('pickList').textContent = listText() || 'ничего';
  try { localStorage.setItem(KEY, JSON.stringify([...pick])); } catch { /* не страшно */ }
}
sync();

document.getElementById('pickReset').addEventListener('click', () => { pick = new Set(REC); sync(); });
document.getElementById('pickClear').addEventListener('click', () => { pick = new Set(); sync(); });
const copyBtn = document.getElementById('pickCopy');
copyBtn.addEventListener('click', async () => {
  const text = `TIREDWOOD, делаем: ${listText() || 'ничего'}`;
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch { /* ниже — запасной путь */ }
  if (!ok) {
    const t = el('textarea');
    t.value = text;
    document.body.append(t);
    t.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    t.remove();
  }
  copyBtn.textContent = ok ? 'Скопировано' : 'Не вышло — выдели список';
  setTimeout(() => { copyBtn.textContent = 'Скопировать'; }, 1600);
});
