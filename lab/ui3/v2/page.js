// Лаборатория UI 3.0, вторая версия: «Веранда v2» и «Причал v2» рядом с первыми версиями. Устройство — как ../page.js:
// экраны — ../scene.html в iframe, вариант меняется сообщением { hud } (вариант с перестройкой разметки сцена пересобирает сама).

const VARIANTS = [
  { id: 'light', name: 'Сейчас' },
  { id: 'veranda', name: 'Веранда' },
  { id: 'veranda2', name: 'Веранда v2' },
  { id: 'prichal', name: 'Причал' },
  { id: 'prichal2', name: 'Причал v2' },
];
const DIRS = [
  {
    id: 'veranda2', name: 'Веранда v2', v1: 'Веранда', refs: ['ref-veranda2a', 'ref-veranda2b'],
    kin: 'арт-деко кафе: палитра первой версии — слива, шоколад, золото, крем',
    what: [
      'таблички со скошенными углами и двойной золотой каймой, у крупных карточек — ступенчатые углы с ромбиками',
      'бейдж — медальон-портрет с кольцом опыта и монеткой уровня, жетоны — на стопке фишек',
      'плитки — круглые подставки: шкала по ободу, счёт на язычке',
      'событие — лента с «ласточкиными хвостами», тосты — кремовые билетики с перфорацией',
      'здоровье — капсула с медальоном-сердцем, патроны — фишки; мини-карты восьмиугольные',
    ],
    plus: 'HUD занимает ~82 % площади нынешнего, вид — «вещь», а не карточка', risk: 'кремовые билетики — единственные светлые плашки; может показаться пёстро',
  },
  {
    id: 'prichal2', name: 'Причал v2', v1: 'Причал', refs: ['ref-prichal2a', 'ref-prichal2b'],
    kin: 'морские приборы и бирки: дерево, латунь, канат и бумага',
    what: [
      'портрет, плитки, оружие и эмоции — латунные иллюминаторы; шкала плитки — цветное кольцо по краю стекла',
      'здоровье — спасательный круг с числом, скорость в картинге — циферблат',
      'событие и верх крепости — деревянные вывески на верёвках, тосты — бумажные бирки на верёвках',
      'карточки рыбалки, фермы и улова — бумага в деревянной рамке, части разделены канатом',
      'мини-карта крепости — круглый иллюминатор с розой ветров, клавиши — костяные кнопки в латунной оправе',
    ],
    plus: 'HUD занимает ~80 % площади нынешнего; светлее «Веранды», с ней уже не спутать', risk: 'деталей больше — издалека может показаться пёстро; круг здоровья мелкий',
  },
];
const SCENES = [
  { id: 'plaza', name: 'Площадь', look: 'бейдж с жетонами, чат и голос, эмоции, подсказка «E», тосты наград; ник и реплика над желейкой — макет' },
  { id: 'fishing-wait', name: 'Рыбалка', look: 'карточка рыбака с уровнем и «Шансами сейчас», плитки рюкзака и задания, подсказка внизу, плашка события' },
  { id: 'fishing-catch', name: 'Улов', look: 'карточка улова: редкость, рыба, кнопки и таймер; тосты наград' },
  { id: 'farm', name: 'Ферма', look: 'уровень и задание фермы, плашка Древа, плитки лейки, колодца и сумки' },
  { id: 'race', name: 'Картинг', look: 'место и круг, мини-карта, бонус, клавиши, скорость' },
  { id: 'paintball', name: 'Пейнтбол', look: 'табло команд и часы, панель бойца: здоровье, оружие, патроны, рывок' },
  { id: 'fort', name: 'Крепость', look: 'низ — панель бойца; верх и мини-карта — предложение (не понравится — оставим как сейчас)' },
];
const SIDE = ['veranda', 'veranda2', 'prichal', 'prichal2'];
const CROP = {
  tags: { x: 530, y: 236, w: 760, h: 240 },
  fort: { x: 0, y: 0, w: 1180, h: 156 },
  bl: { x: 150, y: 680, w: 1140, h: 220 },
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* приватное окно — без памяти */ } },
};
const cur = { v: store.get('tw-ui3v2-v'), s: store.get('tw-ui3v2-s') };
if (!VARIANTS.some((x) => x.id === cur.v)) cur.v = 'veranda2';
if (!SCENES.some((x) => x.id === cur.s)) cur.s = 'plaza';
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const nameOf = (v) => VARIANTS.find((x) => x.id === v)?.name ?? v;
const sceneUrl = (s, v) => `../scene.html#${s}&v=${v}`;

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
const toView = () => $('#view').scrollIntoView({ behavior: 'smooth', block: 'start' });

// ------------------------------------------------ карточки v2
for (const d of DIRS) {
  const b = el('button', 'pg-card');
  b.type = 'button';
  b.dataset.v = d.id;
  b.setAttribute('role', 'radio');
  b.innerHTML = `<span class="pg-card-refs">${d.refs.map((r) => `<img src="../img/${r}.jpg" alt="" loading="lazy">`).join('')}</span>
    <span class="pg-card-mark">На экранах</span>
    <span class="pg-card-name">${d.name}</span><span class="pg-card-kin">${d.kin}</span>
    <ul class="pg-card-what">${d.what.map((w) => `<li>${w}</li>`).join('')}</ul>
    ${d.plus || d.risk ? `<ul class="pg-card-pr">${d.plus ? `<li class="plus">${d.plus}</li>` : ''}${d.risk ? `<li class="risk">${d.risk}</li>` : ''}</ul>` : ''}
    <span class="pg-card-v1">Первая версия — «${d.v1}» в переключателе ниже</span>`;
  b.addEventListener('click', () => { setVariant(d.id); toView(); });
  $('.pg-cards').append(b);
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
main.firstElementChild.addEventListener('load', () => main.firstElementChild.contentWindow?.postMessage({ hud: cur.v }, '*'));

// ------------------------------------------------ v1 и v2 рядом (та же сцена)
const sideFrames = [];
for (const v of SIDE) {
  const t = el('div', 'pg-tile');
  t.tabIndex = 0;
  t.setAttribute('role', 'button');
  t.title = `Открыть «${nameOf(v)}» крупно`;
  const fr = frame(sceneUrl(cur.s, v), {}, { title: nameOf(v) });
  sideFrames.push({ fr, v });
  t.append(el('span', 'pg-tile-name', nameOf(v)), fr);
  const open = () => { setVariant(v); toView(); };
  t.addEventListener('click', open);
  t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  $('.pg-side').append(t);
}

// ------------------------------------------------ ники и верх крепости — все варианты сразу
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
const blNew = frame('../billiards.html#bal=115', CROP.bl, { live: true, title: 'Бильярд — предложение' });
$('.pg-bl-new').append(blNew);
const segBal = $('.pg-bal');
for (const o of [{ bal: 115, path: 'train', name: '115' }, { bal: 40, path: 'bet', name: '40' }, { bal: 0, path: 'free', name: 'нет' }]) {
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
  store.set('tw-ui3v2-v', v);
  for (const b of document.querySelectorAll('.pg-card, .pg-vars button')) b.setAttribute('aria-checked', String(b.dataset.v === v));
  main.firstElementChild.contentWindow?.postMessage({ hud: v }, '*');
}
function setScene(s) {
  cur.s = s;
  store.set('tw-ui3v2-s', s);
  for (const b of segScenes.querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.s === s));
  $('.pg-look').innerHTML = `<b>Смотри:</b> ${SCENES.find((x) => x.id === s).look}.`;
  const go = (f, url) => { if (f.getAttribute('src') !== url) f.src = url; };
  go(main.firstElementChild, sceneUrl(s, cur.v));
  for (const { fr, v } of sideFrames) go(fr.firstElementChild, sceneUrl(s, v));
}
setVariant(cur.v);
setScene(cur.s);
