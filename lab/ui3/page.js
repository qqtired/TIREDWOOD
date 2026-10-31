// Лаборатория UI 3.0: карточки направлений, экраны игры (scene.html в iframe) с общим переключателем,
// «все четыре рядом», ники крупно, верх крепости, бильярд. Вариант в открытой сцене меняется без перезагрузки —
// postMessage({ hud }); другая сцена — новый адрес iframe.

const VARIANTS = [
  { id: 'light', name: 'Сейчас' },
  {
    id: 'veranda', name: 'Веранда', kin: 'родня: блэкджек, бильярд, дурак, верх крепости',
    idea: 'Слива и шоколад без размытия, тонкая золотая кайма, кремовые подписи, золотые числа — как бар блэкджека и бильярда.',
    plus: 'одна семья со столами кафе, спокойно читается на любом фоне', risk: 'темновато для солнечного городка; чат — самая тёмная часть',
    sw: ['#2e1d26', '#3a2631', '#d4a552', '#ffd35a', '#fff3de'],
  },
  {
    id: 'prichal', name: 'Причал', kin: 'родня: пирс, лодки, верх крепости',
    idea: 'Лакированное дерево с латунной каймой, латунные кружки уровня и клавиш, канат и заклёпки только у крупных карточек.',
    plus: 'самый «вещный», про приморский городок', risk: 'издалека похож на «Веранду»; фактура может показаться тяжёлой',
    sw: ['#4a2914', '#6b3f22', '#c99a4b', '#ffd56a', '#fff1d6'],
  },
  {
    id: 'light2', name: 'Светлый 2.0', kin: 'родня: нынешний HUD, курортные значки',
    idea: 'Плашки-наклейки: фарфор и бумага, чернильная обводка, цветная кромка режима, иконки в медальонах, тёмные жирные числа.',
    plus: 'ближе всего к привычному, самый светлый', risk: 'может остаться «сайтом»; ники с обводкой грубоваты',
    sw: ['#fdf6e9', '#1e2a31', '#14a19a', '#45a33a', '#c2502e'],
  },
  {
    id: 'vyveska', name: 'Вывеска', kin: 'родня: окна «Ретро-парк 2.0», вывески площади',
    idea: 'Бирюзовая эмаль с кремовым кантом и тёмной обводкой; числа и тексты — на кремовых табличках тёмным жирным.',
    plus: 'HUD и окна — одна семья', risk: 'в эмали 11.10 читалось хуже — здесь всё важное на кремовых вставках',
    sw: ['#105f58', '#f3e6c9', '#0a2e2b', '#ff7a5c', '#ffd665'],
  },
];
const DIRS = VARIANTS.slice(1);
const SCENES = [
  { id: 'plaza', name: 'Площадь', look: 'бейдж с жетонами, чат и голос, эмоции, подсказка «E», тосты наград; ник и реплика над желейкой — макет' },
  { id: 'fishing-wait', name: 'Рыбалка', look: 'карточка рыбака с уровнем и «Шансами сейчас», плитки рюкзака и задания, подсказка внизу, плашка события' },
  { id: 'fishing-catch', name: 'Улов', look: 'карточка улова: редкость, рыба, кнопки и таймер; тосты наград' },
  { id: 'farm', name: 'Ферма', look: 'уровень и задание фермы, плашка Древа, плитки лейки, колодца и сумки' },
  { id: 'race', name: 'Картинг', look: 'место и круг, мини-карта, бонус, клавиши, скорость' },
  { id: 'paintball', name: 'Пейнтбол', look: 'табло команд и часы, отсчёт, панель бойца: здоровье, оружие, патроны, рывок' },
  { id: 'fort', name: 'Крепость', look: 'низ — панель бойца; верх и мини-карта — предложение (не понравится — оставим как сейчас)' },
];
const CROP = {
  tags: { x: 530, y: 236, w: 760, h: 240 },
  fort: { x: 0, y: 0, w: 1180, h: 156 },
  bl: { x: 150, y: 680, w: 1140, h: 220 },
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* приватное окно — без памяти */ } },
};
const cur = { v: store.get('tw-ui3-v'), s: store.get('tw-ui3-s') };
if (!VARIANTS.some((x) => x.id === cur.v)) cur.v = 'veranda';
if (!SCENES.some((x) => x.id === cur.s)) cur.s = 'plaza';
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const sceneUrl = (s, v) => `scene.html#${s}&v=${v}`;

// iframe 1440×900 (или его вырезка x/y/w/h), вписанный в ширину рамки
const ro = new ResizeObserver((list) => { for (const e of list) fit(e.target); });
function fit(box) {
  const { x, y, w } = box.dataset;
  box.firstElementChild.style.transform = `scale(${box.clientWidth / w}) translate(${-x}px, ${-y}px)`;
}
function frame(src, { x = 0, y = 0, w = 1440, h = 900 } = {}, { lazy = true, live = false, title = 'Экран игры' } = {}) {
  const box = el('div', `pg-fr${live ? ' is-live' : ''}`);
  Object.assign(box.dataset, { x, y, w, h });
  box.style.aspectRatio = `${w} / ${h}`;
  const f = el('iframe');
  f.title = title;
  if (lazy) f.loading = 'lazy';
  if (!live) f.tabIndex = -1;
  f.src = src;
  box.append(f);
  ro.observe(box);
  return box;
}

// ------------------------------------------------ карточки направлений
const cards = $('.pg-cards');
for (const d of DIRS) {
  const b = el('button', 'pg-card');
  b.type = 'button';
  b.dataset.v = d.id;
  b.setAttribute('role', 'radio');
  b.innerHTML = `<img src="img/ref-${d.id}.jpg" alt="" loading="lazy"><span class="pg-card-mark">На экранах</span>
    <span class="pg-card-name">${d.name}</span><span class="pg-card-kin">${d.kin}</span><span class="pg-card-idea">${d.idea}</span>
    <span class="pg-card-sw" aria-hidden="true">${d.sw.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
    <ul class="pg-card-pr"><li class="plus">${d.plus}</li><li class="risk">${d.risk}</li></ul>`;
  b.addEventListener('click', () => { setVariant(d.id); $('#view').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  cards.append(b);
}

// ------------------------------------------------ экраны: вкладки сцены и варианта, крупный экран
const segScenes = $('.pg-scenes');
const segVars = $('.pg-vars');
for (const s of SCENES) {
  const b = el('button', '', s.name);
  b.type = 'button';
  b.dataset.s = s.id;
  b.setAttribute('role', 'radio');
  b.addEventListener('click', () => setScene(s.id));
  segScenes.append(b);
}
for (const v of VARIANTS) {
  const b = el('button', '', v.name);
  b.type = 'button';
  b.dataset.v = v.id;
  b.setAttribute('role', 'radio');
  b.addEventListener('click', () => setVariant(v.id));
  segVars.append(b);
}
const main = frame(sceneUrl(cur.s, cur.v), {}, { lazy: false });
$('.pg-main').append(main);
// сцена перезагрузилась (другая вкладка) — вариант мог смениться, пока она грузилась
main.firstElementChild.addEventListener('load', () => main.firstElementChild.contentWindow?.postMessage({ hud: cur.v }, '*'));

// ------------------------------------------------ все четыре рядом (та же сцена)
const side = $('.pg-side');
const sideFrames = [];
for (const d of DIRS) {
  const t = el('div', 'pg-tile');
  t.tabIndex = 0;
  t.setAttribute('role', 'button');
  t.title = `Открыть «${d.name}» крупно`;
  const fr = frame(sceneUrl(cur.s, d.id), {}, { title: d.name });
  sideFrames.push({ fr, v: d.id });
  t.append(el('span', 'pg-tile-name', d.name), fr);
  const open = () => { setVariant(d.id); $('#view').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  t.addEventListener('click', open);
  t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  side.append(t);
}

// ------------------------------------------------ ники крупно и верх крепости — все варианты сразу
for (const v of VARIANTS) {
  const t = el('div', 'pg-tile');
  t.append(el('span', 'pg-tile-name', v.name), frame(sceneUrl('plaza', v.id), CROP.tags, { title: `Ники — ${v.name}` }));
  $('.pg-tags').append(t);
  const f = el('div', 'pg-tile');
  f.append(el('span', 'pg-tile-name', v.id === 'light' ? 'Сейчас <small>как в игре</small>' : v.name), frame(sceneUrl('fort', v.id), CROP.fort, { title: `Верх крепости — ${v.name}` }));
  $('.pg-fort').append(f);
}

// ------------------------------------------------ бильярд: как сейчас и кликабельное предложение
$('.pg-bl-now').append(frame(sceneUrl('billiards', 'light'), CROP.bl, { title: 'Бильярд сейчас' }));
const blNew = frame('billiards.html#bal=115', CROP.bl, { live: true, title: 'Бильярд — предложение' });
$('.pg-bl-new').append(blNew);
const BAL = [
  { bal: 115, path: 'train', name: '115' },
  { bal: 40, path: 'bet', name: '40' },
  { bal: 0, path: 'free', name: 'нет' },
];
const segBal = $('.pg-bal');
for (const o of BAL) {
  const b = el('button', '', o.name);
  b.type = 'button';
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(o.bal === 115));
  b.addEventListener('click', () => {
    for (const x of segBal.querySelectorAll('button')) x.setAttribute('aria-checked', String(x === b));
    blNew.firstElementChild.contentWindow?.postMessage({ bal: o.bal, path: o.path }, '*');
  });
  segBal.append(b);
}

// ------------------------------------------------ состояние
function setVariant(v) {
  cur.v = v;
  store.set('tw-ui3-v', v);
  for (const b of document.querySelectorAll('.pg-card, .pg-vars button')) b.setAttribute('aria-checked', String(b.dataset.v === v));
  main.firstElementChild.contentWindow?.postMessage({ hud: v }, '*');
}
function setScene(s) {
  cur.s = s;
  store.set('tw-ui3-s', s);
  for (const b of segScenes.querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.s === s));
  const sc = SCENES.find((x) => x.id === s);
  $('.pg-look').innerHTML = `<b>Смотри:</b> ${sc.look}.`;
  const go = (f, url) => { if (f.getAttribute('src') !== url) f.src = url; };
  go(main.firstElementChild, sceneUrl(s, cur.v));
  for (const { fr, v } of sideFrames) go(fr.firstElementChild, sceneUrl(s, v));
}
setVariant(cur.v);
setScene(cur.s);
