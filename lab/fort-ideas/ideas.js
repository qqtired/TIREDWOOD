// «Крепость 50» — новые идеи Т-1…Т-28 (01.11.2026). Текст — из docs/fort50/ideas.md, ничего не добавлено.
// Устройство — как lab/ideas: группы, карточки, фильтры (группа / цена / только топ-5), список «Беру» с копированием.
// Иконки — готовые client/assets/ui/icons/*.webp, новых картинок нет.

const IC = n => `../../client/assets/ui/icons/${n}.webp`;
// цена по файлу: S — до дня, M — 2–3 дня, L — неделя и больше; «S/M», «M/L» — между ними
const COST = { S: 'до дня', M: '2–3 дня', L: 'неделя и больше', 'S/M': 'до 3 дней', 'M/L': '2–3 дня — неделя' };

// c — цена; d — что видит игрок; s — источник вдохновения; r — минус (если в файле он назван)
const SECTIONS = [
  { id: 'А', name: 'Стены, двор, башни', short: 'Стены', icon: 'shield', ideas: [
    { id: 'Т-1', c: 'M', ic: 'kick', t: 'Батут-отбойник в проломе',
      d: 'За сквозным участком и воротами — батут с набережной; E — взвести за 60 + 5·w 💰. Трое врагов на батуте — «бойнг!»: дугой за стену на 8–12 м, −15 % HP; 6 срабатываний; боссов только качает. Связки с камнями К-1.',
      s: 'пружины и связки ловушек Orcs Must Die.', r: 'может обесценить проломы — заряды, цена.' },
    { id: 'Т-2', c: 'M', ic: 'livewell', t: 'Коптильня во дворе',
      d: '200 + 10·w 💰, три уровня, дым и рыба над крепостью. Волна отбита без урона коптильне — каждому 10/18/25 % бонуса волны; прорвавшиеся идут к ней первой.',
      s: 'фермы BTD6, Thronefall, Bad North.', r: 'сильные богатеют быстрее — доля и потолок.' },
    { id: 'Т-3', c: 'M', ic: 'bomb', t: 'Встать к пушке',
      d: 'В панели башни «Встать к орудию»: камера за стволом, урон ×1,5, цель — замок осадной башни, канат, голова босса. Shift и движение не выбрасывают.',
      s: '«машины войны» OMD3.', r: 'башня без человека не стреляет в это время; 20 с без выстрела — слезаешь.' },
  ] },
  { id: 'Б', name: 'Роли и кооператив', short: 'Роли', icon: 'online', ideas: [
    { id: 'Т-4', c: 'M', ic: 'wd-h-helmet', t: 'Ремесло на забег',
      d: 'Вешалка с 4 шапками в сборе: Каменщик (ремонт быстрее и дешевле), Канонир (башни +15 %), Подрывник (+1 граната, взрыв шире), Стрелок (крит, ×2 по креплениям осады). Смена в передышке; все четыре — «Полный расчёт», +10 % золота.',
      s: 'классы Dungeon Defenders, Gears Horde, перки Killing Floor 2.', r: 'баланс для одиночки.' },
    { id: 'Т-5', c: 'S', ic: 'gift', t: 'Подкинуть золото',
      d: 'В Tab у друга «+10 %» и «+25 %» своего золота, тост «Рома подкинул тебе 180 💰»; не больше половины за передышку.',
      s: 'KF2, Kingdom Two Crowns.' },
    { id: 'Т-6', c: 'L', ic: 'boss', t: 'Барон — живой игрок',
      d: 'Седьмой человек — Барон в шатре на холме: вид сверху, 5 карт («Шустрики на запад», «Катапульта по участку», «Туман 15 с»…), 30–40 % бюджета волны.',
      s: 'наёмники Legion TD 2.', r: 'L, риск обиды.' },
    { id: 'Т-7', c: 'L', ic: 'wd-s-chick', t: 'Юнга-чайка для одиночки',
      d: 'Один в крепости — на плечо садится чайка: сама клюёт крылаток, F — камень на участок или пике по врагу. Второй человек пришёл — улетает.',
      s: 'Боско из Deep Rock Galactic.', r: 'неделя работы.' },
  ] },
  { id: 'В', name: 'Решения между волнами', short: 'Решения', icon: 'scroll', ideas: [
    { id: 'Т-8', c: 'M', ic: 'cards', t: 'Карточки после босса',
      d: 'После каждого босса — 3 личные карточки (мышь или 1/2/3): болт пробивает двоих, камень вдвое, ремонт −30 %, граната оставляет смолу, щит 10 с… Раз в главу — золотая. Окно — как эволюции Подземелья.',
      s: 'Brotato, Thronefall, Rogue Card TD.', r: 'баланс сочетаний.' },
    { id: 'Т-9', c: 'M', ic: 'bell', t: 'Старт с главы',
      d: 'У колокола «Начать с главы 1…5» (открыта, если кто-то из команды доходил), золото «как у средней команды». Вариант «Босс недели» с таблицей времени. Общий рекорд — только с 1-й волны.',
      s: 'Bad North, BTD6.' },
  ] },
  { id: 'Г', name: 'Враги', short: 'Враги', icon: 'zombie', ideas: [
    { id: 'Т-10', c: 'M', ic: 'thief', t: 'Воришки осколков',
      d: 'С 11-й волны Шустрик с мешком отламывает осколок кристалла (−6 % максимума) и бежит к выходу; «Держи вора!»; сбитый осколок плывёт обратно, победа над боссом главы возвращает все.',
      s: 'Defense Grid.' },
    { id: 'Т-11', c: 'M/L', ic: 'garden-bed', t: 'Кроты-подкопщики',
      d: 'Холмик ползёт к участку, крот 6 с копает (−900·F), из пролома вылезает во двор; камень или граната на холмик — оглушён.',
      s: 'PvZ, Stronghold Crusader.' },
  ] },
  { id: 'Д', name: 'События', short: 'События', icon: 'storm',
    n: 'Одно особое событие за волну, не на боссе.', ideas: [
    { id: 'Т-12', c: 'M', ic: 'boat', t: 'Баркас у причала',
      d: '«Альбатрос» подходит к причалу, 25 с «Разгрузка», пока защитник в круге; награда — золото, камни, граната.',
      s: 'антенна Deep Rock Galactic, Fortnite Save the World.' },
    { id: 'Т-13', c: 'L', ic: 'buoy', t: 'Прилив и отлив',
      d: 'Отлив — песок с сундучками и четвёртый фронт вдоль берега; прилив — лодки у стены, подтопленный луг.',
      s: 'Splatoon Salmon Run, Kingdom Two Crowns, Dome Keeper.', r: 'дорого, вода может мерцать.' },
    { id: 'Т-14', c: 'M', ic: 'bucket', t: 'Кегельбан',
      d: 'Раз в главу: E у стойки — бочка огурцов катится по дороге с рикошетами, «×6!».',
      s: 'PvZ.' },
    { id: 'Т-15', c: 'S/M', ic: 'kart-jam', t: 'Варенье на голове',
      d: 'Банка Барона падает на голову защитнику — вся волна бежит к нему; ударили — банка прыгает на соседа; через 25 с лопается, золото тому, кто нёс дольше.',
      s: '«светлячки» Salmon Run.' },
    { id: 'Т-16', c: 'S/M', ic: 'bloater', t: 'Золотой краб',
      d: '20 с бежит к морю, с каждым попаданием сыплются монеты всем.',
      s: 'лутжуки DRG.' },
  ] },
  { id: 'Е', name: 'Движение', short: 'Движение', icon: 'kite',
    n: 'Shift и прыжок остаются, новых клавиш нет.', ideas: [
    { id: 'Т-17', c: 'M', ic: 'slide', t: 'Тросы между башнями',
      d: 'E у столба — съезжаешь к бастиону за 1,5–2 с, стрелять можно, пробел — спрыгнуть.',
      s: 'Fortnite, Warframe.' },
    { id: 'Т-18', c: 'S/M', ic: 'ladder', t: 'Батуты на ход стены',
      d: 'Батут во дворе подкидывает на ход стены (3,4 м); можно совместить с Т-1.' },
    { id: 'Т-19', c: 'M', ic: 'climber', t: 'Перемахнуть',
      d: 'Прыжок у края до 2,3 м — подтягиваешься (ящики, телега, терраса).',
      s: 'Fortnite.', r: 'трогает общий шаг — строго за флагом.' },
    { id: 'Т-20', c: 'S/M', ic: 'runner', t: 'Чистый уворот',
      d: 'Рывок в последние 0,25 с перед ударом — урона нет, «Увернулся!», следующий выстрел ×2.',
      s: 'Space Marine 2, Remnant 2.' },
    { id: 'Т-21', c: 'S/M', ic: 'meteor', t: 'Удар с высоты',
      d: 'Прыжок со стены в толпу — «бух», отброс и урон в 2,5 м; откат 8 с.',
      s: 'Warframe.' },
  ] },
  { id: 'Ж', name: 'Стрельба и импакт', short: 'Стрельба', icon: 'marker', ideas: [
    { id: 'Т-22', c: 'S/M', ic: 'paintballs', t: 'Ловкая перезарядка',
      d: 'Полоска у прицела: R в золотую метку — мгновенно и 5 патронов +25 %.',
      s: 'Gears.' },
    { id: 'Т-23', c: 'M', ic: 'headshot', t: 'Слабые места тяжёлых',
      d: 'Бочонок на спине Бугая, клапан Чугунка, ремень Щитоносца — ×2,5 и шатается.',
      s: 'Remnant 2, Helldivers 2.', r: 'модели М-* — v1 не перезаписывать.' },
    { id: 'Т-24', c: 'S/M', ic: 'awp', t: 'Сочное попадание',
      d: 'Стоп-кадр крита 40 мс, дробовик отбрасывает мелочь, болт пришпиливает крылатку, мобы приседают под пулемётом.',
      s: 'Helldivers 2, Gears, KF2.' },
    { id: 'Т-25', c: 'M', ic: 'cellar', t: 'Щелбан-добивание',
      d: 'Враг ≤15 % HP шатается, E вплотную — щелбан и конфетти, +15 HP.',
      s: 'Space Marine 2.' },
  ] },
  { id: 'З', name: 'Зрелищность и награды', short: 'Награды', icon: 'medal-gold', ideas: [
    { id: 'Т-26', c: 'S', ic: 'level', t: 'Комбо',
      d: '5+ врагов за 1,5 с — «Комбо ×7 · +35 💰», ×15 — «Разгром!»; лучшее комбо в итогах.',
      s: 'OMD.' },
    { id: 'Т-27', c: 'S/M', ic: 'stopwatch', t: 'Замедленный миг',
      d: 'Смерть босса или «Разгром!» — мир на 1,5 с замедляется.',
      s: '«зед-тайм» KF2.' },
    { id: 'Т-28', c: 'S/M', ic: 'heart', t: 'Второе дыхание кристалла',
      d: 'Первый раз за забег кристалл упал до 0 — 20 с «Последнего рубежа»: врагов внутри видно, урон +50 %; перебили всех — кристалл встаёт на 25 %, «Крепость выстояла!».',
      s: 'газонокосилка PvZ.' },
  ] },
];

// топ-5 исследователя (из файла): 1 Т-8, 2 Т-28, 3 Т-1 + Т-18, 4 Т-4, 5 Т-9
const TOP5 = [
  { ids: ['Т-8'], ic: 'cards', t: 'Карточки после босса', why: 'Каждому забегу своё лицо.' },
  { ids: ['Т-28'], ic: 'heart', t: 'Второе дыхание', why: 'Дешёвая драма, час игры не пропадает.' },
  { ids: ['Т-1', 'Т-18'], ic: 'kick', t: 'Батуты', why: 'Физичный смешной импакт и второй ответ на пролом.' },
  { ids: ['Т-4'], ic: 'wd-h-helmet', t: 'Ремесло', why: 'У каждого своя работа.' },
  { ids: ['Т-9'], ic: 'bell', t: 'Старт с главы', why: 'Поздние главы за вечер.' },
];
const TOP_IDS = TOP5.flatMap(x => x.ids);
// «лучшая по…», «проще всего первой», «мелочи на день» — тоже из файла
const BEST = [
  { k: 'Лучшая по движению', id: 'Т-17' },
  { k: 'Лучшая по событиям', id: 'Т-15' },
  { k: 'Лучшая по стрельбе', id: 'Т-22' },
  { k: 'Проще всего первой', id: 'Т-28' },
  { k: 'Мелочь на день', id: 'Т-26' },
  { k: 'Мелочь на день', id: 'Т-5' },
];
const TAG = { 'Т-17': 'лучшая по движению', 'Т-15': 'лучшая по событиям', 'Т-22': 'лучшая по стрельбе', 'Т-28': 'проще всего первой', 'Т-26': 'мелочь на день', 'Т-5': 'мелочь на день' };

const COMMON = [
  'У каждого в компании своя работа.',
  'Короткое решение между волнами меняет следующий бой.',
  'Смешной физичный импакт, который видят все.',
  'Особые волны ломают ритм (правило «режиссёра» Left 4 Dead: не больше одного особого события в волну).',
  'Само движение по карте приятно.',
  'Поражение копится и даёт шанс отыграться.',
];

// источники: игры и сайты — как в файле (адреса — только сами сайты)
const SOURCES = [
  { g: 'Orcs Must Die 3', h: 'news.xbox.com', note: '2021-07-23' },
  { g: 'Kingdom Rush', h: 'kingdomrushtd.fandom.com' },
  { g: 'BTD6', h: 'bloonswiki.com' },
  { g: 'PvZ', h: 'plantsvszombies.wiki.gg' },
  { g: 'Thronefall', h: 'elliotcsmith.com/thronefall' },
  { g: 'Defense Grid, Bad North, Kingdom Two Crowns', h: 'en.wikipedia.org' },
  { g: 'Legion TD 2', h: 'legiontd2.wiki.gg' },
  { g: 'Deep Rock Galactic', h: 'deeprockgalactic.wiki.gg' },
  { g: 'Gears Horde', h: 'gearsofwar.fandom.com' },
  { g: 'Splatoon Salmon Run', h: 'splatoonwiki.org' },
  { g: 'Warframe', h: 'wiki.warframe.com' },
  { g: 'Helldivers 2', h: 'helldivers.wiki.gg' },
  { g: 'Left 4 Dead director', h: 'developer.valvesoftware.com' },
];

// ---------- отрисовка
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const img = (name, cls) => { const i = el('img', cls); i.src = IC(name); i.alt = ''; i.loading = 'lazy'; return i; };
const ALL = SECTIONS.flatMap(s => s.ideas.map(i => ({ ...i, sec: s.id })));
const byId = id => ALL.find(a => a.id === id);
const ORDER = ALL.map(i => i.id);
const nodes = new Map(); // id → карточка, которая отмечается «Беру»

function costBadge(c) {
  const b = el('span', 'ix-cost');
  b.append(el('b', '', c), document.createTextNode(` · ${COST[c]}`));
  return b;
}

function ideaCard(it) {
  const c = el('button', 'ix-idea');
  c.type = 'button';
  c.dataset.id = it.id;
  c.dataset.sec = it.sec;

  const head = el('span', 'ix-idea-head');
  const name = el('span', 'ix-idea-name');
  name.append(el('b', 'ix-id', it.id), el('span', 'ix-idea-t', it.t));
  head.append(img(it.ic), name);
  c.append(head);

  const pills = el('span', 'ix-pills');
  pills.append(costBadge(it.c));
  if (TOP_IDS.includes(it.id)) pills.append(el('span', 'k-pill k-pill--xs k-pill--gold', '★ топ-5'));
  if (TAG[it.id]) pills.append(el('span', 'k-pill k-pill--xs k-pill--special', TAG[it.id]));
  c.append(pills);

  c.append(el('span', 'ix-idea-d', it.d));
  if (it.s) { const w = el('span', 'ix-idea-w'); w.append(el('b', '', 'Источник: '), document.createTextNode(it.s)); c.append(w); }
  if (it.r) { const r = el('span', 'ix-idea-r'); r.append(el('b', '', 'Минус: '), document.createTextNode(it.r)); c.append(r); }

  const take = el('span', 'ix-take');
  take.append(el('span', 'ix-check'), el('span', '', 'Беру'));
  c.append(take);
  c.addEventListener('click', () => toggle(it.id));
  nodes.set(it.id, c);
  return c;
}

function goTo(id) {
  setFilter({ sec: 'all', cost: 'all', star: false });
  const card = document.querySelector(`#groups .ix-idea[data-id="${id}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('is-flash');
  setTimeout(() => card.classList.remove('is-flash'), 1600);
}

// топ-5
const t5 = document.getElementById('t5');
TOP5.forEach((x, n) => {
  const box = el('article', 'ix-t5');
  const main = el('button', 'ix-t5-main');
  main.type = 'button';
  const pic = el('span', 'ix-t5-pic');
  pic.append(el('b', 'ix-num', String(n + 1)), img(x.ic));
  const txt = el('span', 'ix-t5-t', x.t);
  main.append(pic, txt, el('span', 'ix-t5-why', x.why));
  main.addEventListener('click', () => goTo(x.ids[0]));
  const chips = el('span', 'ix-chips');
  for (const id of x.ids) {
    const ch = el('button', 'ix-chip');
    ch.type = 'button';
    ch.append(el('b', 'ix-id', id), el('em', '', byId(id).c));
    ch.title = byId(id).t;
    ch.addEventListener('click', () => goTo(id));
    chips.append(ch);
  }
  box.append(main, chips);
  t5.append(box);
});

// лучшие по…
const best = document.getElementById('best');
for (const b of BEST) {
  const it = byId(b.id);
  const r = el('button', 'ix-best');
  r.type = 'button';
  const t = el('b', '');
  t.append(el('span', '', `${it.id} `), document.createTextNode(it.t));
  r.append(img(it.ic), el('small', '', b.k), t);
  r.addEventListener('click', () => goTo(b.id));
  best.append(r);
}

// что общего
const commonGrid = document.getElementById('commonGrid');
COMMON.forEach((t, n) => {
  const c = el('div', 'ix-card');
  c.append(el('b', 'ix-num', String(n + 1)), el('p', '', t));
  commonGrid.append(c);
});

// группы и карточки
const groups = document.getElementById('groups');
const groupBoxes = [];
for (const s of SECTIONS) {
  const box = el('div', 'ix-group');
  box.dataset.sec = s.id;
  const h = el('h3', 'ix-group-h');
  h.append(el('b', 'ix-letter', s.id), img(s.icon), el('span', '', s.name));
  box.append(h);
  if (s.n) box.append(el('p', 'ix-group-n', s.n));
  const grid = el('div', 'ix-ideas');
  for (const it of s.ideas) grid.append(ideaCard({ ...it, sec: s.id }));
  box.append(grid);
  groups.append(box);
  groupBoxes.push(box);
}

// источники
const srcList = document.getElementById('srcList');
for (const s of SOURCES) {
  const li = el('li', '');
  li.append(el('b', '', s.g));
  const a = el('a', '', s.h + (s.note ? ` (${s.note})` : ''));
  a.href = `https://${s.h}`;
  a.target = '_blank';
  a.rel = 'noopener';
  li.append(a);
  srcList.append(li);
}

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
for (const s of SECTIONS) segBtn(fSec, 'sec', s.id, s.short, s.id);
segBtn(fCost, 'cost', 'all', 'Любая');
for (const c of ['S', 'M', 'L']) segBtn(fCost, 'cost', c, c);
fStar.addEventListener('click', () => setFilter({ star: !F.star }));

function setFilter(p) {
  Object.assign(F, p);
  for (const b of fSec.children) b.setAttribute('aria-pressed', String(b.dataset.v === F.sec));
  for (const b of fCost.children) b.setAttribute('aria-pressed', String(b.dataset.v === F.cost));
  fStar.setAttribute('aria-pressed', String(F.star));
  let shown = 0;
  for (const box of groupBoxes) {
    let n = 0;
    for (const c of box.querySelectorAll('.ix-idea')) {
      const it = byId(c.dataset.id);
      // «S/M» подходит и под S, и под M
      const ok = (F.sec === 'all' || it.sec === F.sec) && (F.cost === 'all' || it.c.split('/').includes(F.cost)) && (!F.star || TOP_IDS.includes(it.id));
      c.hidden = !ok;
      n += ok ? 1 : 0;
    }
    box.hidden = n === 0;
    shown += n;
  }
  document.getElementById('fCount').textContent = `показано ${shown} из ${ALL.length}`;
  document.getElementById('empty').hidden = shown > 0;
}
setFilter({});

// ---------- выбор «Беру»
const KEY = 'tiredwood-fort-ideas-pick';
let pick = new Set(TOP_IDS);
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (Array.isArray(saved)) pick = new Set(saved.filter(id => ORDER.includes(id)));
} catch { /* без хранилища — топ-5 */ }

function toggle(id) {
  if (pick.has(id)) pick.delete(id); else pick.add(id);
  sync();
}
const listText = () => ORDER.filter(id => pick.has(id)).join(', ');
function sync() {
  for (const [id, n] of nodes) {
    const on = pick.has(id);
    n.classList.toggle('is-on', on);
    n.setAttribute('aria-pressed', String(on));
  }
  document.getElementById('pickN').textContent = String(pick.size);
  document.getElementById('pickList').textContent = listText() || 'ничего';
  try { localStorage.setItem(KEY, JSON.stringify([...pick])); } catch { /* не страшно */ }
}
sync();

document.getElementById('pickReset').addEventListener('click', () => { pick = new Set(TOP_IDS); sync(); });
document.getElementById('pickClear').addEventListener('click', () => { pick = new Set(); sync(); });
const copyBtn = document.getElementById('pickCopy');
copyBtn.addEventListener('click', async () => {
  const text = `Крепость 50, делаем: ${listText() || 'ничего'}`;
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
