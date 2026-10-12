// Ферма: HUD, посадка без модалки (пояс семян), Семечкин, Дядюшка Гриб, Заказы (Фургон + доска), Хозяйство,
// Доска фермы с «Помочь», Древо разлома, новый уровень, мини-игра «Набери лейку».
// Только компоненты кита; своё CSS (screens/farm.css) — раскладка с префиксом .farm-.
// Числа и названия — из shared/farmdata.ts (культуры, улучшения, Фургон, заказы, репутация, Древо).
import { stage, section, K, sfx, pushToast } from '../page/page.js';

const host = section('farm');
const C = K.coin();
const ic = (n) => `img/farm/ic/${n}.webp`;
const ui = (n) => K.icon(n);
const im = (n, cls = 'k-ic') => `<img class="${cls}" src="${ic(n)}" alt="">`;
const BG = 'img/farm/bg-plot.jpg';
const WAS = (n) => `img/farm/was-${n}.jpg`;
const nf = (n) => Math.round(n).toLocaleString('ru-RU');
const meter = (v, cls = '', label = '', g) => `<div class="k-meter ${cls}" style="--v:${v}${g != null ? `;--g:${g}` : ''}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i>${label ? `<span class="k-meter-label">${label}</span>` : ''}</div>`;

/* ------------------------------------------------------------------ данные (shared/farmdata.ts) */
// [id, иконка, культура, продукт, ур., рост мин, опыт, ресурс, шанс %, семя 🪙, продажа 🪙]
const CROPS = [
  ['radish', 'radish', 'Редис', 'Редис', 1, 2, 5, 'root', 30, 1, 2],
  ['wheat', 'wheat', 'Пшеница', 'Колос', 1, 15, 25, 'fiber', 40, 2, 11],
  ['lettuce', 'lettuce', 'Салат', 'Лист салата', 2, 3, 6, 'fiber', 35, 1, 3],
  ['onion', 'onion', 'Лук', 'Луковица', 4, 3, 8, 'root', 30, 1, 3],
  ['pumpkin', 'pumpkin', 'Тыква', 'Тыква', 4, 20, 35, 'grain', 35, 3, 16],
  ['carrot', 'carrot', 'Морковь', 'Морковь', 5, 4, 10, 'root', 35, 1, 4],
  ['sunflower', 'sunflower-seeds', 'Подсолнух', 'Семечки', 5, 25, 30, 'grain', 35, 2, 16],
  ['strawberry', 'strawberry', 'Клубника', 'Ягода', 6, 30, 40, 'fiber', 35, 3, 17],
  ['giant-mushroom', 'giant-mushroom', 'Гриб-гигант', 'Шляпка гриба', 6, 45, 90, 'spores', 40, 3, 18],
  ['dill', 'dill', 'Укроп', 'Пучок укропа', 7, 5, 12, 'grain', 30, 1, 5],
  ['chili', 'chili', 'Перец чили', 'Стручок', 8, 30, 55, 'grain', 35, 4, 17],
  ['crystal', 'crystal', 'Кристальный цветок', 'Кристалл', 8, 60, 120, 'crystal-dust', 40, 4, 18],
  ['microgreens', 'microgreens', 'Микро-зелень', 'Ростки', 9, 5, 12, 'grain', 35, 2, 6],
  ['lotus', 'lotus', 'Лунный лотос', 'Лепесток', 9, 90, 150, 'crystal-dust', 40, 4, 19],
  ['life-tree', 'life-fruit', 'Древо жизни', 'Плод жизни', 10, 120, 180, 'wood', 40, 4, 20],
  ['golden-apple', 'golden-apple', 'Золотое яблоко', 'Золотое яблоко', 10, 360, 400, 'gold-leaf', 40, 4, 22],
  ['dragon-fruit', 'dragon-fruit', 'Драконий плод', 'Драконий плод', 11, 480, 500, 'scale', 35, 4, 22],
  ['star-flower', 'star', 'Звёздный цветок', 'Звезда', 12, 600, 650, 'star-dust', 35, 5, 23],
  ['mythic-mushroom', 'myth-mushroom', 'Мифический гриб', 'Мифическая шляпка', 13, 540, 800, 'spores', 40, 6, 24],
].map(([id, icon, name, product, level, min, xp, res, chance, seed, sale]) => ({ id, icon, name, product, level, min, xp, res, chance, seed, sale }));
const crop = (id) => CROPS.find((c) => c.id === id);
const ACC = { Пшеница: 'пшеницу', Тыква: 'тыкву', Клубника: 'клубнику' };
const acc = (name) => ACC[name] ?? name.toLowerCase();
const RES = {
  root: ['Корешок', 'rootlet', 2], fiber: ['Волокно', 'fiber', 3], grain: ['Зёрна', 'seeds', 3], spores: ['Споры', 'spores', 8],
  'crystal-dust': ['Кристаллическая пыль', 'crystal-dust', 12], wood: ['Древесина', 'wood', 8], 'gold-leaf': ['Золотой лист', 'golden-leaf', 15],
  scale: ['Чешуйка', 'scale', 20], 'star-dust': ['Звёздная пыль', 'star-dust', 25],
};
const grow = (min) => (min < 60 ? `${min} мин` : min % 60 ? `${Math.floor(min / 60)} ч ${min % 60} мин` : `${min / 60} ч`);

/** Игрок на всех экранах: ферма ур. 5 «Фермер», участок 7, репутация 3 «Опылитель» (+4 %) */
const FARM = { lvl: 5, name: 'Фермер', xp: 2140, need: 3000, plot: 7 };
const HAVE = { root: 14, fiber: 9, grain: 6, spores: 1, 'crystal-dust': 0, wood: 0, 'gold-leaf': 0, scale: 0, 'star-dust': 0 };

/* ------------------------------------------------------------------ общие куски HUD */
const badge = ({ tokens = '1 250', pop = '' } = {}) => `
  <div class="k-badge"><span class="k-ring" style="--p:.64"><b>12</b></span>
    <span class="k-badge-body"><span class="k-badge-nick">Кракозябра</span><span class="k-badge-tokens">${C}<span class="farm-tok">${tokens}</span></span></span>${pop}</div>`;

/** Карточка режима (ВЛ, v2 — 292 вместо 360, кольцо 40): уровень фермы кольцом опыта, что откроет следующий, Фургон, баффы Древа, «Хозяйство» (H) */
const farmCard = ({ lvl = FARM.lvl, name = FARM.name, xp = FARM.xp, need = FARM.need, next = true, van = 'open', buffs = [] } = {}) => `
  <div class="k-plate farm-card">
    <span class="k-ring k-ring--sm k-ring--mode" style="--p:${(xp / need).toFixed(3)}"><b>${lvl}</b></span>
    <div class="farm-card-main">
      <b class="farm-card-name">${name} · ур. ${lvl}</b>
      <span class="farm-card-xp"><b class="farm-xp">${nf(xp)}</b> / ${nf(need)} · участок ${FARM.plot}</span>
    </div>
    <button class="k-btn k-btn--icon k-btn--sm k-btn--ghost farm-card-estate" aria-label="Хозяйство" title="Хозяйство">${im('basket')}<kbd class="k-key k-key--sm k-key--br">H</kbd></button>
    ${next ? `<div class="farm-card-next"><span class="k-dim">Ур. ${lvl + 1} откроет</span>${im('strawberry')}${im('giant-mushroom')}<span class="k-dim">и 4-ю грядку</span></div>` : ''}
    <div class="farm-card-chips">
      ${van === 'open' ? `<span class="k-pill k-pill--good k-pill--sm">${im('van')}Фургон здесь · до 15:00</span>` : `<span class="k-pill k-pill--sm">${im('van')}Фургон в 16:00</span>`}
      ${buffs.map((b) => `<span class="k-pill k-pill--gold k-pill--sm">${im('life-fruit')}${b}</span>`).join('')}
    </div>
  </div>`;

/** v2: плитка под бейджем — иконка на подложке, клавиша в углу, подпись под ней (вместо широкой .k-ctx) */
const tile = ({ img, cap = '', sub = '', key = '', v = null, tone = '', cls = '', label = '' }) => `
  <div class="k-tile${cls ? ` ${cls}` : ''}" title="${label}"><span class="k-tile-face"><img src="${img}" alt="${label}">${key ? `<kbd class="k-key k-key--sm k-key--tr">${key}</kbd>` : ''}
    ${v !== null ? `<span class="k-meter${tone ? ` ${tone}` : ''}" style="--v:${v}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span>` : ''}</span>
    ${cap ? `<span class="k-tile-cap"><span>${cap}</span>${sub ? `<small>${sub}</small>` : ''}</span>` : ''}</div>`;
const tiles = (...list) => `<div class="k-tiles">${list.join('')}</div>`;

/** Вода — две плитки рядом: лейка (чем поливаешь) и колодец (откуда вода: вёдра и когда следующее) */
const waterCard = ({ w = 7, max = 10, sets = 3, next = '6:40', low = false, hot = false } = {}) => (low && (w = 0),
  tile({ img: ic('watering-can'), label: 'Лейка', cls: `farm-water${low ? ' k-tile--warn' : ''}`, cap: low ? 'Пусто' : `<span class="farm-w">${w}</span> / ${max}`, sub: low ? 'лейка' : 'зарядов', v: w / max, tone: 'k-meter--info farm-wmeter' })
  + tile({ img: ic('well'), label: 'Колодец', cls: `farm-well${hot ? ' k-tile--own' : ''}`, cap: `${sets} / 4`, sub: sets < 4 ? `+1 через ${next}` : 'вёдра полны', v: sets / 4, tone: 'k-meter--info' }));

const bagCard = (n = 34, cap = 50) => tile({ img: ic('bag'), label: 'Сумка', cls: 'farm-bag', cap: `<span class="farm-b">${n}</span> / ${cap}`, sub: 'сумка', v: n / cap, tone: 'k-meter--good farm-bmeter' });

const ripeCard = (n = 3) => tile({ img: ic('pumpkin'), label: 'Созрело — собирай', cls: 'k-tile--own farm-ripe', cap: `<span class="farm-r">${n}</span> ${n === 1 ? 'грядка' : 'грядки'}`, sub: 'созрело' });

const helpCard = (n = 9, max = 9) => tile({ img: ic('help-hands'), label: 'Помощь соседям', cls: 'farm-help', cap: `<span class="farm-h">${n}</span> / ${max}`, sub: 'помощь', v: n / max, tone: 'farm-hmeter' });

const chat = () => `
  <div class="k-chat">
    <div class="k-chat-list">
      <div class="k-chat-line is-sys is-old">Паша зашёл на ферму</div>
      <div class="k-chat-line k-nick-1"><b>Паша</b>у кого тыквы? Фургон даёт ×1,4</div>
    </div>
    <div class="k-chat-bar"><button class="k-voice" aria-label="Голос">${K.mic}<kbd class="k-key k-key--sm">V</kbd></button><div class="k-chat-closed">${K.key('Enter')}Написать в чат</div></div>
  </div>`;

/** «Было» под текущее состояние сцены (снимок как сейчас) */
const setBefore = (api, name) => { const b = api?.el?.querySelector('.stage-before'); if (b) b.src = WAS(name); };

const toastHtml = ({ tone = 'info', icon, title, sub }) => `<div class="k-toast k-toast--${tone}"><span class="k-toast-ic"><img src="${icon}" alt=""></span><div class="k-toast-title">${title}</div>${sub ? `<div class="k-toast-sub">${sub}</div>` : ''}</div>`;

/** Всплывающее число у бейджа/карточки: +N живёт 1,6 с */
function pop(el, text, cls = '') {
  if (!el) return;
  el.querySelector('.k-pop')?.remove();
  const p = document.createElement('span');
  p.className = `k-pop ${cls}`;
  p.textContent = text;
  el.append(p);
  setTimeout(() => p.remove(), 1700);
}

/** Вкладки во всех окнах сцены: .k-tab[data-tab] ↔ .farm-pane[data-pane] */
function wireTabs(scene) {
  scene.querySelectorAll('.k-window').forEach((win) => {
    const tabs = win.querySelector('.k-tabs');
    if (!tabs) return;
    tabs.addEventListener('click', (e) => {
      const t = e.target.closest('.k-tab');
      if (!t) return;
      tabs.querySelectorAll('.k-tab').forEach((x) => x.classList.toggle('is-on', x === t));
      win.querySelectorAll('.farm-pane').forEach((p) => { p.hidden = p.dataset.pane !== t.dataset.tab; });
      const body = win.querySelector('.k-win-body');
      if (body) body.scrollTop = 0;
    });
  });
}

/** Шапка окна */
const winHead = ({ portrait, eyebrow, title, line = '', coins = true }) => `
  <header class="k-win-head">
    <span class="k-win-portrait"><img src="${portrait}" alt=""></span>
    <div class="k-win-titles"><p class="k-eyebrow">${eyebrow}</p><h2 class="k-win-title">${title}</h2>${line ? `<p class="farm-npc">${line}</p>` : ''}</div>
    <div class="k-win-tools">${coins ? `<span class="k-pill k-pill--gold k-pill--lg">${C}1 250</span>` : ''}<button class="k-close" aria-label="Закрыть"><kbd class="k-key k-key--sm">Esc</kbd></button></div>
  </header>`;

/* ================================================================== 1. основной HUD */
function hudScreen(h) {
  stage(h, {
    id: 'farm-hud',
    title: 'Ферма: обычный экран',
    note: 'Слева одна карточка фермы: уровень кольцом, что откроется дальше и Фургон. Справа под бейджем — плитки: лейка и колодец рядом, сумка и «созрело»; цифры коротко под иконкой. Новое: строка «что откроет следующий уровень». v2: всё поверх игры меньше — карточка 292 вместо 360.',
    bg: BG, before: WAS('40-farm-hud'), mode: 'farm',
    states: [{ id: 'grow', label: 'у растущей грядки' }, { id: 'ripe', label: 'созрело' }, { id: 'tut', label: 'новичок, шаг 2' }],
    render(scene, st, api) {
      setBefore(api, st === 'tut' ? '42b-farm-planted' : '40-farm-hud');
      const ripe = st === 'ripe';
      const tut = st === 'tut';
      scene.innerHTML = `
        <div class="k-slot k-slot--tl">
          ${tut ? farmCard({ lvl: 1, name: 'Новичок', xp: 25, need: 200, next: false, van: 'none' }).replace(/<div class="farm-card-chips">[\s\S]*?<\/div>/, '<div class="farm-card-next"><span class="k-dim">Ур. 2 откроет</span>' + im('lettuce') + '<span class="k-dim">Салат и 2-ю грядку</span></div>') : farmCard()}
          ${tut ? `
          <div class="k-plate farm-quest">
            <p class="k-eyebrow">Семечкин · шаг 2 из 6</p>
            <div class="farm-quest-t">Набери лейку у колодца — встань у корыта и нажми ${K.key('E', 'k-key--sm')}</div>
            <div class="farm-quest-steps">${[0, 1, 2, 3, 4, 5].map((i) => `<i class="${i < 1 ? 'is-done' : i === 1 ? 'is-cur' : ''}"></i>`).join('')}</div>
            <span class="k-pill k-pill--gold k-pill--sm farm-quest-prize">+25 опыта</span>
          </div>` : ''}
        </div>
        <div class="k-slot k-slot--tc"><div class="k-toasts farm-toasts">${ripe ? toastHtml({ tone: 'reward', icon: ic('pumpkin'), title: 'Созрело: Тыква ×2, Редис ×1', sub: 'Участок 7 — подходи и собирай' }) : ''}</div></div>
        <div class="k-slot k-slot--tr">
          ${badge()}
          ${tiles(tut ? waterCard({ low: true, sets: 4, hot: true }) : waterCard(), bagCard(tut ? 0 : 34, tut ? 20 : 50), ripe ? ripeCard(3) : '')}
        </div>
        <div class="k-slot k-slot--bl">${chat()}</div>
        <div class="k-slot k-slot--bc">
          ${ripe
            ? `<button class="k-prompt farm-act">${K.key('E')}Собрать тыкву<span class="k-prompt-sep"></span><span class="k-pill k-pill--gold k-pill--sm">+35 опыта</span><span class="k-pill k-pill--sm">${im('bag')}+1</span></button>`
            : tut
              ? `<button class="k-prompt farm-act">${K.key('E')}Набрать лейку<span class="k-prompt-sep"></span><span class="k-pill k-pill--info k-pill--sm">${im('bucket')}ведро 1 из 4</span></button>`
              : `<button class="k-prompt farm-act">${K.key('E')}Полить тыкву<span class="k-prompt-sep"></span><span class="k-prompt-note">созреет <b>12:40 → 10:08</b></span><span class="k-pill k-pill--info k-pill--sm">${im('watering-can')}−1</span></button>`}
        </div>`;
      wireHudActs(scene, st);
    },
  });
}

function wireHudActs(scene, st) {
  const act = scene.querySelector('.farm-act');
  const toasts = scene.querySelector('.farm-toasts');
  let done = 0;
  act?.addEventListener('click', () => {
    if (st === 'grow') {
      if (done++) { pushToast(toasts, { tone: 'warn', icon: ic('watering-can'), title: 'Эта грядка уже полита', sub: 'Полить можно раз за рост' }); return; }
      const w = scene.querySelector('.farm-w');
      if (w) w.textContent = '6';
      scene.querySelector('.farm-wmeter')?.style.setProperty('--v', '.6');
      act.classList.add('k-prompt--off');
      act.innerHTML = `Тыква полита<span class="k-prompt-sep"></span><span class="k-prompt-note">созреет через <b>10:08</b></span>`;
      pushToast(toasts, { tone: 'good', icon: ic('watering-can'), title: 'Полито · −20 % времени', sub: 'Тыква созреет через 10:08' });
    } else if (st === 'ripe') {
      const r = scene.querySelector('.farm-r');
      const left = Math.max(0, Number(r?.textContent || 0) - 1);
      if (r) r.textContent = String(left);
      const b = scene.querySelector('.farm-b');
      if (b) b.textContent = String(Number(b.textContent) + 1);
      const xp = scene.querySelector('.farm-xp');
      if (xp) xp.textContent = nf(2140 + 35 * (++done));
      pop(scene.querySelector('.farm-card'), '+35', 'k-pop--xp');
      const res = done % 2 === 1;
      pushToast(toasts, res
        ? { tone: 'reward', icon: ic('seeds'), title: 'Тыква в сумке · +35 опыта', sub: 'И ещё Зёрна ×1 — шанс 35 %' }
        : { tone: 'reward', icon: ic('pumpkin'), title: 'Тыква в сумке · +35 опыта' });
      if (!left) { scene.querySelector('.farm-ripe')?.classList.add('k-tile--off'); act.classList.add('k-prompt--off'); act.innerHTML = 'Всё собрано<span class="k-prompt-sep"></span><span class="k-prompt-note">посади снова — 1–9 и E</span>'; }
    } else if (st === 'tut') {
      if (done++) return;
      act.classList.add('k-prompt--off');
      act.innerHTML = 'Наливаешь…';
      setTimeout(() => {
        const card = scene.querySelector('.farm-water');
        scene.querySelector('.farm-well')?.remove();
        card.outerHTML = waterCard({ w: 9, max: 10, sets: 3, next: '14:58' });
        const q = scene.querySelector('.farm-quest');
        q.querySelector('.k-eyebrow').textContent = 'Семечкин · шаг 3 из 6';
        q.querySelector('.farm-quest-t').innerHTML = `Полей грядку — ${K.key('E', 'k-key--sm')} у растущей грядки`;
        q.querySelectorAll('.farm-quest-steps i').forEach((d, i) => { d.className = i < 2 ? 'is-done' : i === 2 ? 'is-cur' : ''; });
        pushToast(toasts, { tone: 'reward', icon: ic('watering-can'), title: 'Лейка: +9 зарядов', sub: 'Шаг 2 пройден · +25 опыта' });
        act.innerHTML = 'Иди к грядке';
      }, 500);
    }
  });
}

/* ================================================================== 2. посадка без модалки — пояс семян */
const BELT = ['radish', 'wheat', 'lettuce', 'onion', 'pumpkin', 'carrot', 'sunflower', 'strawberry', 'giant-mushroom'].map(crop);

function beltScreen(h) {
  let sel = 4;
  const api = stage(h, {
    id: 'farm-plant',
    title: 'Посадка: пояс семян вместо окна',
    note: 'Самое частое действие — без окна на весь экран. Подошёл к пустой грядке — внизу пояс семян: 1–9 или колесо выбирают, E сажает. Над поясом — коротко о выбранном: рост, опыт, цена, ресурс. Закрытые — силуэт с уровнем. Новое: сам пояс и клавиша Q «по одной / граблями».',
    bg: BG, before: WAS('42-farm-planting-window'), mode: 'farm',
    states: [{ id: 'pick', label: 'выбираешь' }, { id: 'rake', label: 'с граблями' }, { id: 'lock', label: 'закрытая культура' }],
    render(scene, st) {
      if (st === 'lock') sel = 7;
      else if (sel >= 7) sel = 4;
      draw(scene, st);
    },
  });

  function draw(scene, st) {
    const c = BELT[sel];
    const locked = c.level > FARM.lvl;
    const rake = st === 'rake' && !locked;
    const r = RES[c.res];
    const gift = c.id === 'carrot' || c.id === 'sunflower';
    const cost = gift ? 0 : rake ? c.seed * 3 : c.seed;
    scene.innerHTML = `
      <div class="k-slot k-slot--tl">${farmCard()}</div>
      <div class="k-slot k-slot--tc"><div class="k-toasts farm-toasts"></div></div>
      <div class="k-slot k-slot--tr">${badge()}${tiles(waterCard(), bagCard())}</div>
      <div class="k-slot k-slot--bl">${chat()}</div>
      <div class="k-slot k-slot--bc farm-bc">
        <div class="k-plate farm-pick${locked ? ' is-locked' : ''}">
          <img class="farm-pick-ic${locked ? ' farm-sil' : ''}" src="${ic(c.icon)}" alt="">
          <div class="farm-pick-body">
            <div class="farm-pick-name">${c.name}${gift ? `<span class="k-pill k-pill--gold k-pill--sm">${`<img class="k-ic" src="${ui('gift.webp')}" alt="">`}первая — даром</span>` : ''}${sel === 4 && !locked ? '<span class="k-pill k-pill--sm">как в прошлый раз</span>' : ''}</div>
            ${locked
              ? `<div class="farm-pick-stats"><span>Откроется на <b>ур. ${c.level}</b> фермы</span><span class="k-dim">ещё ${nf(FARM.need - FARM.xp)} опыта</span></div>${meter(FARM.xp / FARM.need, 'k-meter--thin k-meter--mode farm-pick-meter')}`
              : `<div class="farm-pick-stats"><span><b>${grow(c.min)}</b></span><span class="k-gold"><b>+${c.xp}</b> опыта</span><span class="farm-price">${C}${c.seed} <i>→</i> ${C}${c.sale}</span><span>${im(r[1])}${r[0]} ${c.chance} %</span></div>`}
          </div>
        </div>
        <div class="k-plate farm-belt" role="listbox" aria-label="Пояс семян">
          ${BELT.map((b, i) => {
            const lk = b.level > FARM.lvl;
            return `<button class="k-btn k-btn--icon ${i === sel ? 'k-btn--gold is-on' : 'k-btn--ghost'} farm-slot${lk ? ' is-locked' : ''}" data-i="${i}" aria-label="${lk ? `ур. ${b.level}` : b.name}">
              <img class="k-ic${lk ? ' farm-sil' : ''}" src="${ic(b.icon)}" alt="">${lk ? `<span class="farm-slot-lv">ур. ${b.level}</span>` : ''}<kbd class="k-key k-key--sm k-key--tl">${i + 1}</kbd></button>`;
          }).join('')}
        </div>
        ${locked
          ? `<div class="k-prompt k-prompt--off farm-act">${K.key('E')}Посадить<span class="k-prompt-sep"></span><span class="k-prompt-note">${c.name} — с ур. ${c.level}</span></div>`
          : `<button class="k-prompt farm-act">${K.key('E')}${rake ? 'Посадить на 3 грядки' : `Посадить ${acc(c.name)}`}<span class="k-pill k-pill--gold k-pill--sm">${cost ? `${C}${cost}` : 'даром'}</span><span class="k-prompt-sep"></span>${rake ? `${K.key('Q')}<span class="k-prompt-note">по одной</span>` : `<span class="k-key"><i class="k-mouse k-mouse--wheel"></i></span><span class="k-prompt-note">выбрать</span>`}</button>`}
      </div>
      ${rake ? `<div class="k-pill k-pill--plate farm-rake-note">${im('rake')}Грабли 2 засеют все пустые грядки рядом: 3 из 3</div>` : ''}`;
    scene.querySelectorAll('.farm-slot').forEach((b) => b.addEventListener('click', () => { sel = Number(b.dataset.i); sfx.play('tick'); draw(scene, st === 'lock' ? 'pick' : st); }));
    scene.querySelector('.farm-belt').addEventListener('wheel', (e) => {
      e.preventDefault();
      sel = (sel + (e.deltaY > 0 ? 1 : -1) + BELT.length) % BELT.length;
      sfx.play('tick');
      draw(scene, st === 'lock' ? 'pick' : st);
    }, { passive: false });
    scene.querySelector('button.farm-act')?.addEventListener('click', () => {
      const t = scene.querySelector('.farm-toasts');
      pushToast(t, { tone: 'good', icon: ic(c.icon), title: rake ? `${c.name}: посажено на 3 грядки` : `${c.name} посажена`, sub: `Созреет через ${grow(Math.round(c.min))}` });
      if (cost) pop(scene.querySelector('.k-badge'), `−${cost}`, 'k-pop--bad');
    });
  }

  // клавиши 1–9, пока мышь над этой сценой
  document.addEventListener('keydown', (e) => {
    if (!/^[1-9]$/.test(e.key) || !api.el.matches(':hover')) return;
    sel = Number(e.key) - 1;
    sfx.play('tick');
    draw(api.scene, api.state === 'lock' ? 'pick' : api.state);
  });
}

/* ================================================================== 3. Семечкин */
function seedsScreen(h) {
  const card = (c) => {
    const open = c.level <= FARM.lvl;
    const soon = c.level === FARM.lvl + 1;
    const r = RES[c.res];
    const gift = c.id === 'carrot' || c.id === 'sunflower';
    if (!open) return `
      <div class="k-cell farm-crop is-locked">
        <img class="farm-crop-ic farm-sil" src="${ic(c.icon)}" alt="">
        <div class="farm-crop-name">${soon ? c.name : '???'}</div>
        <span class="k-pill k-pill--sm${soon ? ' k-pill--mode' : ''}">${soon ? `с ур. ${c.level} — скоро` : `ур. ${c.level}`}</span>
      </div>`;
    return `
      <div class="k-cell farm-crop">
        ${gift ? `<span class="k-pill k-pill--gold k-pill--sm farm-crop-gift"><img class="k-ic" src="${ui('gift.webp')}" alt="">даром</span>` : ''}
        <img class="farm-crop-ic" src="${ic(c.icon)}" alt="">
        <div class="farm-crop-name">${c.name}</div>
        <div class="farm-crop-row"><b>${grow(c.min)}</b><span class="k-gold">+${c.xp} опыта</span></div>
        <div class="farm-crop-row"><span class="farm-price">${C}${c.seed} <i>→</i> ${C}${c.sale}</span></div>
        <div class="farm-crop-row k-dim">${im(r[1])}${r[0]} ${c.chance} %</div>
      </div>`;
  };
  const steps = ['Посади редис — первый пакетик даром', 'Набери лейку у колодца', 'Полей грядку', 'Собери урожай', 'Отнеси урожай Дядюшке Грибу', 'Посади ещё и загляни на доску заказов'];
  stage(h, {
    id: 'farm-seeds',
    title: 'Семечкин: каталог семян',
    note: 'Окно остаётся для знакомства с культурами, а сажать теперь можно прямо у грядки. Карточки крупные: картинка, рост и опыт, «семя → продажа», какой ресурс падает. Следующий уровень подписан именами — видно, ради чего расти.',
    bg: BG, before: WAS('44-farm-semechkin-seeds'), mode: 'farm',
    render(scene) {
      scene.innerHTML = `
        <div class="k-scrim"><section class="k-window k-window--lg is-in farm-win">
          ${winHead({ portrait: ic('seeds'), eyebrow: 'Ферма · семена', title: 'Семечкин', line: '«Первая посадка новой культуры — от меня в подарок!»' })}
          <nav class="k-tabs">
            <button class="k-tab is-on" data-tab="all">${im('radish')}Культуры <span class="k-tab-count">7 из 19</span></button>
            <button class="k-tab" data-tab="new">${im('strawberry')}Скоро</button>
            <button class="k-tab" data-tab="learn"><img class="k-ic" src="${ui('scroll.webp')}" alt="">Обучение <span class="k-tab-count">6 из 6</span></button>
          </nav>
          <div class="k-win-body">
            <div class="farm-pane farm-crops" data-pane="all">${CROPS.map(card).join('')}</div>
            <div class="farm-pane" data-pane="new" hidden>
              <div class="k-cell farm-next">
                <span class="k-ring k-ring--lg k-ring--mode" style="--p:.713"><b>6</b></span>
                <div class="farm-next-body">
                  <p class="k-eyebrow">Уровень 6 · «Опытный садовник»</p>
                  <div class="farm-next-t">Ещё ${nf(FARM.need - FARM.xp)} опыта</div>
                  ${meter(FARM.xp / FARM.need, 'k-meter--mode', `${nf(FARM.xp)} / ${nf(FARM.need)}`)}
                </div>
              </div>
              <div class="farm-unlocks">
                <div class="k-stat">${im('strawberry', 'k-stat-ic')}<div class="k-stat-num">Клубника</div><div class="k-stat-cap">30 мин · +40 опыта · первая даром</div></div>
                <div class="k-stat">${im('giant-mushroom', 'k-stat-ic')}<div class="k-stat-num">Гриб-гигант</div><div class="k-stat-cap">45 мин · +90 опыта · даёт Споры</div></div>
                <div class="k-stat"><img class="k-stat-ic" src="${ui('ui/garden-bed.webp')}" alt=""><div class="k-stat-num">Грядка 4</div><div class="k-stat-cap">строится в Хозяйстве: 4 споры, 6 волокна</div></div>
                <div class="k-stat"><img class="k-stat-ic" src="${ui('ui/straw-hat.webp')}" alt=""><div class="k-stat-num">Шляпа-подсолнух</div><div class="k-stat-cap">награда за уровень — надеть сразу</div></div>
              </div>
            </div>
            <div class="farm-pane farm-steps" data-pane="learn" hidden>
              ${steps.map((s, i) => `<div class="k-cell farm-step is-done"><span class="k-place">${i + 1}</span><span class="farm-step-t">${s}</span><span class="k-pill k-pill--good k-pill--sm">готово · +${i === 5 ? '50 опыта и 20' : '25 опыта'}${i === 5 ? ` ${C}` : ''}</span></div>`).join('')}
            </div>
          </div>
          <footer class="k-win-foot"><span class="k-note">Сажать — прямо у грядки: ${K.key('1', 'k-key--sm')}–${K.key('9', 'k-key--sm')} выбрать, ${K.key('E', 'k-key--sm')} посадить</span><button class="k-btn k-btn--ghost k-btn--sm">Закрыть</button></footer>
        </section></div>`;
      wireTabs(scene);
    },
  });
}

/* ================================================================== 4. Дядюшка Гриб */
function gribScreen(h) {
  // [культура, шт, метка Фургона]; цена ряда = шт × продажа × 1,04 (репутация «Опылитель»)
  const BAG = [['pumpkin', 6, '×1,4'], ['radish', 18, '×1,3'], ['wheat', 4, ''], ['onion', 6, '']];
  const CONV = [['root', 14, 12, 'Лопатка 2'], ['fiber', 9, 6, 'Лопатка 2'], ['grain', 6, 5, 'Лопатка 2'], ['spores', 1, 4, 'Грядка 4']];
  stage(h, {
    id: 'farm-grib',
    title: 'Дядюшка Гриб: продать урожай',
    note: 'Дневная касса — одна полоса с понятной фразой «ещё 160 по полной цене». В строке одна кнопка «Продать», а то, что сейчас ждёт Фургон, помечено — не продашь по ошибке дёшево. Внизу — «Продать всё» одной суммой.',
    bg: BG, before: WAS('45-farm-grib-buyer'), mode: 'farm',
    states: [{ id: 'day', label: 'обычный день' }, { id: 'cap', label: 'касса полна' }],
    render(scene, st) {
      const cap = st === 'cap';
      const rows = BAG.map(([id, n, van]) => {
        const c = crop(id);
        let sum = Math.round(n * c.sale * 1.04);
        if (cap) sum = Math.max(n * c.seed, Math.round(sum * 0.25));
        return { c, n, van, sum };
      });
      const total = rows.reduce((a, r) => a + r.sum, 0);
      scene.innerHTML = `
        <div class="k-scrim"><section class="k-window is-in farm-win">
          ${winHead({ portrait: ic('giant-mushroom'), eyebrow: 'Ферма · скупка', title: 'Дядюшка Гриб', line: '«Всё возьму! Но что ждёт Фургон — неси ему, он щедрее»' })}
          <nav class="k-tabs">
            <button class="k-tab is-on" data-tab="sell">${im('basket')}Продать <span class="k-tab-count">4</span></button>
            <button class="k-tab" data-tab="xp">${im('xp-star')}Опыт за ресурсы</button>
          </nav>
          <div class="k-win-body">
            <div class="farm-pane" data-pane="sell">
              <div class="k-cell farm-cash">
                <div class="farm-cash-top"><b>Касса на сегодня</b><span class="${cap ? 'k-bad' : 'k-dim'}">${cap ? 'полна — дальше ×0,25 до 00:00' : `ещё <b class="k-gold">160</b> ${C} по полной цене`}</span></div>
                ${meter(cap ? 1 : 0.771, cap ? 'k-meter--bad k-meter--lg' : 'k-meter--lg', cap ? `700 из 700` : `540 из 700`)}
                <div class="farm-cash-pills"><span class="k-pill k-pill--good k-pill--sm">Репутация «Опылитель» +4 %</span>${cap ? '<span class="k-pill k-pill--sm">Заказы и трюфели — по полной цене</span>' : ''}</div>
              </div>
              <div class="farm-rows">
                ${rows.map((r) => `
                  <div class="k-cell farm-row">
                    <img class="farm-row-ic" src="${ic(r.c.icon)}" alt="">
                    <div class="farm-row-main"><div class="farm-row-t">${r.c.product} <b>× ${r.n}</b></div><div class="farm-row-s k-dim">${r.c.sale} ${C} за штуку${cap ? ' · сейчас ×0,25' : ''}</div></div>
                    ${r.van ? `<span class="k-pill k-pill--info k-pill--sm farm-row-van">${im('van')}Фургон даст ${r.van}</span>` : '<span></span>'}
                    <button class="k-btn k-btn--sm${r.van ? ' k-btn--ghost' : ''}" data-sfx="reward">Продать<small>${C}${r.sum}</small></button>
                  </div>`).join('')}
              </div>
            </div>
            <div class="farm-pane" data-pane="xp" hidden>
              <p class="farm-lead k-dim">Лишние ресурсы — в опыт фермы. «Свободно» — то, что не нужно на ближайшее улучшение.</p>
              <div class="farm-rows">
                ${CONV.map(([id, have, need, what]) => {
                  const r = RES[id];
                  const free = Math.max(0, have - need);
                  return `
                  <div class="k-cell farm-row farm-conv" data-xp="${r[2]}" data-max="${have}">
                    <img class="farm-row-ic" src="${ic(r[1])}" alt="">
                    <div class="farm-row-main"><div class="farm-row-t">${r[0]} <b>× ${have}</b></div><div class="farm-row-s k-dim">${need} нужно на «${what}» · ${r[2]} опыта за штуку</div></div>
                    <span class="farm-stepper"><button class="k-btn k-btn--icon k-btn--sm k-btn--ghost" data-d="-1" aria-label="Меньше">−</button><b class="farm-n">${free}</b><button class="k-btn k-btn--icon k-btn--sm k-btn--ghost" data-d="1" aria-label="Больше">+</button></span>
                    <span class="k-pill k-pill--sm k-pill--gold farm-conv-xp">+${free * r[2]}</span>
                  </div>`;
                }).join('')}
              </div>
            </div>
          </div>
          <footer class="k-win-foot farm-foot-sell"><span class="k-note">4 вида · 34 шт. в сумке</span><button class="k-btn k-btn--lg" data-sfx="reward">Продать всё<small>${C}${total}</small></button></footer>
          <footer class="k-win-foot farm-foot-xp" hidden><span class="k-note">Итог: <b class="k-gold farm-conv-total">+16 опыта</b></span><button class="k-btn k-btn--ghost">Отменить</button><button class="k-btn" data-sfx="reward">Превратить в опыт</button></footer>
        </section></div>`;
      wireTabs(scene);
      // подвал под вкладку
      scene.querySelector('.k-tabs').addEventListener('click', (e) => {
        const t = e.target.closest('.k-tab');
        if (!t) return;
        scene.querySelector('.farm-foot-sell').hidden = t.dataset.tab !== 'sell';
        scene.querySelector('.farm-foot-xp').hidden = t.dataset.tab !== 'xp';
      });
      // степперы
      const recount = () => {
        let sum = 0;
        scene.querySelectorAll('.farm-conv').forEach((row) => {
          const n = Number(row.querySelector('.farm-n').textContent);
          const x = n * Number(row.dataset.xp);
          row.querySelector('.farm-conv-xp').textContent = `+${x}`;
          sum += x;
        });
        scene.querySelector('.farm-conv-total').textContent = `+${sum} опыта`;
      };
      scene.querySelectorAll('.farm-stepper button').forEach((b) => b.addEventListener('click', () => {
        const row = b.closest('.farm-conv');
        const n = row.querySelector('.farm-n');
        n.textContent = String(Math.max(0, Math.min(Number(row.dataset.max), Number(n.textContent) + Number(b.dataset.d))));
        recount();
      }));
      recount();
    },
  });
}

/* ================================================================== 5. Заказы: Фургон + доска */
function ordersScreen(h) {
  const CRATES = [
    { slot: 'Ходовой', id: 'radish', n: 18, have: 18, m: '×1,3', coins: 49, xp: 14 },
    { slot: 'Сезонный', id: 'sunflower', n: 6, have: 2, m: '×1,5', coins: 150, xp: 27 },
    { slot: 'За репутацию', id: 'pumpkin', n: 6, have: 6, m: '×1,4', coins: 140, xp: 32 },
  ];
  const LOCKED = [['Слот 4', 'Откроется на репутации 4'], ['Слот 5', 'Откроется на ур. 10'], ['Слот 6', 'Откроется на репутации 6']];
  const ORDERS = [
    { kind: 'Вырасти', icon: ic('wheat'), name: 'Обычные', goal: 'Собрать 8 растений, растущих 15–30 мин', have: 5, need: 8, coins: 18, xp: 70, rep: 0 },
    { kind: 'Соседи', icon: ic('help-hands'), name: 'Лёгкий', goal: 'Полить грядки соседей 2 раза', have: 2, need: 2, coins: 6, xp: 20, rep: 0 },
    { kind: 'Особый', icon: ic('watering-can'), name: 'Поливальщик', goal: 'Полить 5 своих грядок за день', have: 3, need: 5, coins: 15, xp: 40, rep: 0 },
  ];
  stage(h, {
    id: 'farm-orders',
    title: 'Заказы: Фургон и доска заказов в одном окне',
    note: 'Два вида заказов — одно окно с двумя вкладками; открывается от Фургона или от доски, сразу на нужной вкладке. У ящика видно всё: сколько нужно, сколько уже в сумке, во сколько раз дороже Гриба. Почему нельзя — отдельной строкой, а не текстом на кнопке.',
    bg: BG, before: WAS('49-farm-van'), mode: 'farm',
    states: [{ id: 'van', label: 'у Фургона' }, { id: 'board', label: 'у доски' }],
    render(scene, st, api) {
      setBefore(api, st === 'van' ? '49-farm-van' : '46-farm-orders-board');
      const crate = (k) => {
        const c = crop(k.id);
        const ok = k.have >= k.n;
        return `
          <div class="k-cell farm-crate${ok ? ' is-ready' : ''}">
            <p class="k-eyebrow">${k.slot}</p>
            <img class="farm-crate-ic" src="${ic(c.icon)}" alt="">
            <div class="farm-crate-t">${c.product} <b>× ${k.n}</b></div>
            ${meter(Math.min(1, k.have / k.n), ok ? 'k-meter--good k-meter--lg' : 'k-meter--lg', `в сумке ${k.have} из ${k.n}`)}
            <div class="farm-crate-pay"><span class="k-pill k-pill--info k-pill--sm">${k.m} к цене Гриба</span><span class="k-gold"><b>${C}${k.coins}</b> · +${k.xp} опыта</span></div>
            ${ok ? `<button class="k-btn k-btn--go k-btn--wide" data-sfx="reward">Сдать ящик</button>` : `<div class="farm-why k-bad">Не хватает ${k.n - k.have} · вырасти до 15:00</div><button class="k-btn k-btn--ghost k-btn--wide" disabled>Сдать ящик</button>`}
          </div>`;
      };
      const order = (o) => {
        const ok = o.have >= o.need;
        return `
          <div class="k-cell farm-order${ok ? ' is-ready' : ''}">
            <p class="k-eyebrow farm-order-kind"><img class="k-ic" src="${o.icon}" alt="">${o.kind}</p>
            <div class="farm-order-name">${o.name}</div>
            <div class="farm-order-goal">${o.goal}</div>
            ${meter(o.have / o.need, ok ? 'k-meter--good k-meter--lg' : 'k-meter--mode k-meter--lg', `${o.have} из ${o.need}`)}
            <div class="farm-order-pay"><span class="k-gold"><b>${C}${o.coins}</b></span><span class="k-gold">+${o.xp} опыта</span></div>
            <div class="farm-order-btns">${ok ? '<button class="k-btn k-btn--go" data-sfx="reward">Забрать</button>' : ''}<button class="k-btn k-btn--ghost k-btn--sm">Заменить<small>осталось 2</small></button></div>
          </div>`;
      };
      scene.innerHTML = `
        <div class="k-scrim"><section class="k-window k-window--lg is-in farm-win">
          ${winHead({ portrait: st === 'van' ? ic('van') : ui('scroll.webp'), eyebrow: 'Ферма · заказы', title: 'Заказы' })}
          <nav class="k-tabs">
            <button class="k-tab${st === 'van' ? ' is-on' : ''}" data-tab="van">${im('van')}Фургон <span class="k-pill k-pill--good k-pill--sm">здесь до 15:00</span></button>
            <button class="k-tab${st === 'board' ? ' is-on' : ''}" data-tab="board"><img class="k-ic" src="${ui('scroll.webp')}" alt="">Доска заказов <span class="k-tab-count">1 готов</span></button>
          </nav>
          <div class="k-win-body">
            <div class="farm-pane" data-pane="van"${st === 'van' ? '' : ' hidden'}>
              <div class="k-cell farm-vanbar">
                <img class="farm-vanbar-ic" src="${ic('van')}" alt="">
                <div><div class="farm-vanbar-t">Фургон приехал — уедет в 15:00</div><div class="k-dim">Сдай ящик целиком из сумки — платит в 1,3–1,5 раза больше Гриба. Не успел — ничего не теряешь.</div></div>
                <div class="farm-vanbar-timer"><b class="k-gold">42:10</b><span class="k-dim">касса ${C}540 из 700</span></div>
              </div>
              <div class="farm-crates">
                ${CRATES.map(crate).join('')}
                ${LOCKED.map(([s, why]) => `<div class="k-cell farm-crate is-locked"><p class="k-eyebrow">${s}</p><img class="farm-crate-ic" src="${ui('lock.webp')}" alt=""><div class="farm-why k-dim">${why}</div></div>`).join('')}
              </div>
            </div>
            <div class="farm-pane" data-pane="board"${st === 'board' ? '' : ' hidden'}>
              <div class="farm-orders">${ORDERS.map(order).join('')}</div>
              <p class="farm-lead k-dim">Засчитывается то, что сделано после выдачи заказа. Новые заказы — через <b>5 ч 12 мин</b>, в 00:00.</p>
            </div>
          </div>
        </section></div>`;
      wireTabs(scene);
      scene.querySelectorAll('.farm-crate .k-btn--go, .farm-order .k-btn--go').forEach((b) => b.addEventListener('click', () => {
        b.disabled = true;
        b.textContent = 'Готово';
        pop(scene.querySelector('.k-pill--lg'), b.closest('.farm-crate') ? '+49' : '+6');
      }));
    },
  });
}

/* ================================================================== 6. Хозяйство */
function estateScreen(h) {
  const cost = (res, coins) => {
    const pills = [];
    if (coins) pills.push(`<span class="k-pill k-pill--sm ${coins <= 1250 ? 'k-pill--good' : 'k-pill--bad'}">${C}${coins}</span>`);
    for (const [id, n] of Object.entries(res)) {
      const r = RES[id];
      const ok = HAVE[id] >= n;
      pills.push(`<span class="k-pill k-pill--sm ${ok ? 'k-pill--good' : 'k-pill--bad'}">${im(r[1])}${HAVE[id]}/${n}</span>`);
    }
    return pills.join('');
  };
  const up = ({ icon, name, now, gives, lvl, coins = 0, res, compact = false }) => {
    const lvOk = lvl <= FARM.lvl;
        const lackShort = Object.entries(res).filter(([id, n]) => HAVE[id] < n).map(([id, n]) => `${RES[id][0].toLowerCase()} ×${n - HAVE[id]}`);
    const why = !lvOk ? `Откроется на ур. ${lvl}${lackShort.length === 1 ? ` · ещё ${lackShort[0]}` : ''}` : lackShort.length ? `Не хватает: ${lackShort.join(', ')}` : '';
    const ready = !why;
    return `
      <div class="k-cell farm-up${ready ? ' is-ready' : ''}${compact ? ' is-compact' : ''}">
        <img class="farm-up-ic" src="${icon.includes('/') ? ui(icon) : ic(icon)}" alt="">
        <div class="farm-up-head"><div class="farm-up-name">${name}</div><div class="farm-up-gives">${now ? `<span class="k-dim">${now} →</span> ` : ''}<b>${gives}</b></div></div>
        ${compact ? '' : `<div class="farm-up-cost">${cost(res, coins)}</div>`}
        ${ready ? '' : `<div class="farm-why ${lvOk ? 'k-bad' : 'k-dim'}"><img class="k-ic" src="${ui('lock.webp')}" alt="">${why}</div>`}
        ${compact ? '' : `<button class="k-btn ${ready ? 'k-btn--go' : 'k-btn--ghost'} k-btn--sm k-btn--wide farm-up-btn"${ready ? ' data-sfx="reward"' : ' disabled'}>Улучшить</button>`}
      </div>`;
  };
  const DECOR = [
    { icon: ic('basket'), kind: 'Эмоция · клавиша 7', name: 'Показать урожай', got: 'on' },
    { icon: ic('help-hands'), kind: 'Значок у ника', name: '«Добрый сосед»', got: 'yes' },
    { icon: ic('star'), kind: 'Титул', name: 'Опытный фермер', why: '«Фермерский стаж»: 164 из 250 сборов' },
    { icon: ui('ui/card-frame.webp'), kind: 'Рамка карточки', name: 'Гербарий', why: '«Палитра сезона»: 5 типов ресурсов, ур. 8' },
    { icon: ic('watering-can'), kind: 'Лейка', name: 'Золотая лейка', why: 'Репутация 5 «Мастер грядок»' },
    { icon: ic('van'), kind: 'На участок', name: 'Тележка «Сделка века»', why: '50 сделок Фургона: 12 из 50' },
  ];
  const ACH = [
    ['Первые шаги', 'Руки в земле', '25 сборов', 25, 25, '+25 жетонов и значок «Росток»', 'claim'],
    ['Первые шаги', 'Уверенный урожай', '100 сборов', 64, 100, 'Штаны с заплатками', ''],
    ['Коллекционер', 'Первое разнообразие', 'урожай с 5 разных культур', 5, 5, 'Панама «Исследователь»', 'done'],
    ['Урожай', 'Полная корзина', 'продать Грибу 200 шт. урожая', 140, 200, 'Фартук «Торгаш»', ''],
    ['Соседи', 'Вместе растём', 'помочь 5 разным соседям за день', 2, 5, 'Эмоция «Полить друга»', ''],
    ['Мастер времени', 'Всё по расписанию', 'собирать урожай в 7 разных дней', 4, 7, 'Будильник «Тик-так»', ''],
  ];
  stage(h, {
    id: 'farm-estate',
    title: 'Хозяйство: улучшения, кладовая, убранство, достижения',
    note: 'Каждая карточка отвечает на три вопроса: что даёт («было → станет»), что нужно (есть/нужно зелёным и красным) и почему пока нельзя — отдельной строкой, а не текстом внутри кнопки. Готовое к покупке — зелёной кнопкой, её видно сразу.',
    bg: BG, before: WAS('43-farm-estate-window'), mode: 'farm',
    render(scene) {
      scene.innerHTML = `
        <div class="k-scrim"><section class="k-window k-window--lg is-in farm-win">
          ${winHead({ portrait: ic('basket'), eyebrow: `Ферма · участок ${FARM.plot}`, title: 'Хозяйство' })}
          <nav class="k-tabs">
            <button class="k-tab is-on" data-tab="up">${im('rake')}Улучшения <span class="k-tab-count">1 можно</span></button>
            <button class="k-tab" data-tab="store">${im('rootlet')}Кладовая</button>
            <button class="k-tab" data-tab="decor"><img class="k-ic" src="${ui('wardrobe.webp')}" alt="">Убранство</button>
            <button class="k-tab" data-tab="ach">${im('star')}Достижения <span class="k-tab-count">1 готово</span></button>
          </nav>
          <div class="k-win-body">
            <div class="farm-pane" data-pane="up">
              <p class="k-eyebrow farm-h">Инструменты и грядки</p>
              <div class="farm-ups">
                ${up({ icon: 'trowel', name: 'Лопатка 2', now: 'без двойного урожая', gives: 'двойной урожай 15 %', lvl: 4, coins: 50, res: { root: 12, fiber: 6, grain: 5 } })}
                ${up({ icon: 'ui/garden-bed.webp', name: 'Грядка 4', now: '3 грядки', gives: '4 грядки', lvl: 6, res: { spores: 4, fiber: 6 } })}
                ${up({ icon: 'rake', name: 'Грабли 3', now: '4 грядки разом', gives: 'всё поле — 9', lvl: 8, coins: 250, res: { fiber: 40, grain: 20, 'crystal-dust': 8 } })}
                ${up({ icon: 'watering-can', name: 'Лейка 2', now: '10 зарядов', gives: '20 зарядов', lvl: 8, coins: 60, res: { 'crystal-dust': 12, grain: 5, root: 4 } })}
                ${up({ icon: 'bag', name: 'Сумка 3', now: '50 мест', gives: '100 мест', lvl: 10, coins: 150, res: { fiber: 40, wood: 20, 'crystal-dust': 8 } })}
                ${up({ icon: 'trowel', name: 'Лопатка 3', now: '15 %', gives: 'двойной урожай 25 %', lvl: 7, coins: 250, res: { root: 30, grain: 15, spores: 10 } })}
              </div>
              <p class="k-eyebrow farm-h">Постройки</p>
              <div class="farm-ups farm-ups--sm">
                ${up({ icon: 'truffle-pig', name: 'Трюфельный свин', gives: '1 трюфель за 3 ч', lvl: 10, res: {}, compact: true })}
                ${up({ icon: 'beehive', name: 'Пчёлы-опылители', gives: '+10 п.п. к шансу ресурса', lvl: 10, res: {}, compact: true })}
                ${up({ icon: 'compost', name: 'Компостная куча', gives: 'рост ×0,85', lvl: 12, res: {}, compact: true })}
              </div>
            </div>
            <div class="farm-pane" data-pane="store" hidden>
              <div class="k-cell farm-rep">
                <img class="farm-rep-ic" src="${ic('help-hands')}" alt="">
                <div class="farm-rep-main"><p class="k-eyebrow">Репутация 3 · «Опылитель»</p>
                  ${meter(210 / 350, 'k-meter--lg', '210 из 350')}
                  <div class="k-dim farm-rep-next">Дальше «Своя желейка»: <b>+1 ящик Фургона</b> и <b>+6 %</b> к цене. Репутация — за помощь соседям и вклад в Древо.</div></div>
              </div>
              <div class="farm-res">
                ${Object.entries(RES).map(([id, r]) => `<div class="k-stat${HAVE[id] ? '' : ' k-stat--empty'}">${im(r[1], 'k-stat-ic')}<div class="k-stat-num">${HAVE[id]}</div><div class="k-stat-cap">${r[0]}</div></div>`).join('')}
              </div>
              <p class="farm-lead k-dim">Ресурсы падают при сборе. Лишние можно превратить в опыт у Дядюшки Гриба.</p>
            </div>
            <div class="farm-pane farm-decor" data-pane="decor" hidden>
              ${DECOR.map((d) => `
                <div class="k-cell farm-dec${d.why ? ' is-locked' : ''}">
                  <img class="farm-dec-ic" src="${d.icon}" alt="">
                  <p class="k-eyebrow">${d.kind}</p>
                  <div class="farm-dec-name">${d.name}</div>
                  ${d.got === 'on' ? '<button class="k-btn k-btn--ghost k-btn--sm">Снять</button><span class="k-pill k-pill--gold k-pill--sm farm-dec-on">надето</span>' : d.got ? '<button class="k-btn k-btn--sm">Надеть</button>' : `<div class="farm-why k-dim"><img class="k-ic" src="${ui('lock.webp')}" alt="">${d.why}</div>`}
                </div>`).join('')}
            </div>
            <div class="farm-pane" data-pane="ach" hidden>
              <div class="farm-rows">
                ${ACH.map(([cat, name, goal, have, need, prize, st]) => `
                  <div class="k-cell farm-ach${st === 'claim' ? ' is-ready' : ''}">
                    <div class="farm-ach-main"><p class="k-eyebrow">${cat}</p><div class="farm-ach-name">${name} <span class="k-dim">· ${goal}</span></div>${meter(have / need, st ? 'k-meter--good k-meter--thin' : 'k-meter--thin')}</div>
                    <div class="farm-ach-side"><b>${have} из ${need}</b><span class="k-dim">${prize}</span></div>
                    ${st === 'claim' ? '<button class="k-btn k-btn--go k-btn--sm" data-sfx="reward">Забрать</button>' : st === 'done' ? '<span class="k-pill k-pill--good k-pill--sm">получено</span>' : '<span></span>'}
                  </div>`).join('')}
              </div>
            </div>
          </div>
        </section></div>`;
      wireTabs(scene);
      const b = scene.querySelector('.farm-up.is-ready .k-btn--go');
      b?.addEventListener('click', () => {
        b.disabled = true;
        b.textContent = 'Есть';
        b.closest('.farm-up').querySelector('.farm-up-gives').innerHTML = '<b>двойной урожай 15 % — уже работает</b>';
        pop(scene.querySelector('.k-pill--lg'), '−50', 'k-pop--bad');
      });
    },
  });
}

/* ================================================================== 7. Доска фермы + «Помочь» */
function boardScreen(h) {
  // участки по кругу у колодца; [№, ник, ур., сост.: me|here|sleep|free, можно полить]
  const PLOTS = { 3: ['Паша', 6, 'here', 3], 7: ['Кракозябра', 5, 'me', 0], 11: ['Бочка', 4, 'sleep', 2], 15: ['Лиса', 2, 'here', 0], 18: ['Сёма', 8, 'sleep', 0] };
  const map = () => {
    let s = '';
    for (let i = 1; i <= 20; i++) {
      const a = ((i - 1) / 20) * Math.PI * 2 - Math.PI / 2 - Math.PI / 20 * 3;
      const x = 210 + Math.cos(a) * 172;
      const y = 210 + Math.sin(a) * 172;
      const p = PLOTS[i];
      const cls = p ? `is-${p[2]}` : 'is-free';
      s += `<span class="farm-plot ${cls}" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px">${i}${p && p[3] ? `<img src="${ic('watering-can')}" alt="">` : ''}</span>`;
    }
    return `<div class="farm-map">${s}<img class="farm-map-well" src="${ic('well')}" alt=""><img class="farm-map-tree" src="${ui('ui/rift-tree.webp')}" alt=""><img class="farm-map-van" src="${ic('van')}" alt=""></div>`;
  };
  const row = (n, [nick, lv, st, can]) => `
    <div class="k-online-row${st === 'me' ? ' is-me' : ''}">
      <span class="k-ring k-ring--sm k-ring--mode" style="--p:.5"><b>${lv}</b></span>
      <span class="k-online-nick">${nick}${st === 'me' ? ' <span class="k-dim">— ты</span>' : ''}</span>
      <span class="k-online-room">Участок ${n} · ${st === 'sleep' ? 'спит' : 'здесь'}${can ? ` · <b class="k-good">можно полить ${can}</b>` : st === 'me' ? '' : ' · всё полито'}</span>
      <span class="k-online-act">${can ? `<button class="k-btn k-btn--go k-btn--sm farm-help-btn" data-plot="${n}"><span class="k-row-line">${im('watering-can')}Помочь</span></button>` : ''}</span>
    </div>`;
  const api = stage(h, {
    id: 'farm-board',
    title: 'Доска фермы: соседи и «Помочь»',
    note: 'Карта участков и список соседей. Новое: у тех, кому можно полить, — кнопка «Помочь». Она ведёт к участку, а у грядки соседа подсказка E сама предлагает полить: видно цену (заряд лейки и очко помощи) и награду. Фургон отсюда убран — он живёт в карточке фермы и в «Заказах».',
    bg: BG, before: WAS('47-farm-farmboard'), mode: 'farm',
    states: [{ id: 'board', label: 'доска' }, { id: 'bed', label: 'у грядки соседа' }],
    render(scene, st) {
      if (st === 'bed') {
        scene.innerHTML = `
          <div class="k-slot k-slot--tl">${farmCard()}</div>
          <div class="k-slot k-slot--tc"><div class="k-toasts farm-toasts"></div></div>
          <div class="k-slot k-slot--tr">${badge()}${tiles(waterCard(), helpCard(9, 9))}</div>
          <div class="k-slot k-slot--bl">${chat()}</div>
          <div class="k-slot k-slot--bc">
            <div class="k-pill k-pill--plate farm-whose">${im('pumpkin')}Тыква Паши · участок 3 · созреет через 14:20</div>
            <button class="k-prompt farm-act">${K.key('E')}Полить соседу<span class="k-prompt-sep"></span><span class="k-pill k-pill--info k-pill--sm">${im('watering-can')}−1</span><span class="k-pill k-pill--sm">${im('help-hands')}−1</span><span class="k-pill k-pill--good k-pill--sm">+1 репутация</span></button>
          </div>`;
        let left = 9;
        scene.querySelector('.farm-act').addEventListener('click', () => {
          if (left <= 6) return;
          left--;
          scene.querySelector('.farm-h').textContent = String(left);
          scene.querySelector('.farm-hmeter').style.setProperty('--v', String(left / 9));
          const w = scene.querySelector('.farm-w');
          w.textContent = String(Number(w.textContent) - 1);
          scene.querySelector('.farm-wmeter').style.setProperty('--v', String(Number(w.textContent) / 10));
          pushToast(scene.querySelector('.farm-toasts'), { tone: 'reward', icon: ic('help-hands'), title: 'Ты полил тыкву Паши', sub: '+1 репутация · +1 жетон · Паша увидит' });
          pop(scene.querySelector('.k-badge'), '+1');
        });
        return;
      }
      scene.innerHTML = `
        <div class="k-scrim"><section class="k-window k-window--lg is-in farm-win">
          ${winHead({ portrait: ic('help-hands'), eyebrow: 'Ферма · доска', title: 'Доска фермы', line: 'Кто где живёт, кто спит и кому можно помочь', coins: false })}
          <div class="k-win-body farm-board">
            <div class="farm-board-map">
              ${map()}
              <div class="farm-legend k-dim"><span><i class="farm-dot is-me"></i>твой</span><span><i class="farm-dot is-here"></i>фермер здесь</span><span><i class="farm-dot is-sleep"></i>спит</span><span><i class="farm-dot is-free"></i>свободно</span></div>
            </div>
            <div class="farm-board-side">
              <div class="k-cell farm-treebar"><img src="${ui('ui/rift-tree.webp')}" alt=""><div><b>Древо разлома проснётся в 19:00</b><div class="k-dim">через 2 ч 14 мин · собирай урожай — вырастишь Древо</div></div></div>
              <div class="farm-neigh">${Object.entries(PLOTS).map(([n, p]) => row(n, p)).join('')}</div>
              <div class="k-cell farm-helpline">${im('help-hands')}<span>Твоя помощь: <b>9 из 9</b> · каждая — 1 заряд лейки, соседу −20 % времени, тебе +1 репутация</span></div>
            </div>
          </div>
        </section></div>`;
      scene.querySelectorAll('.farm-help-btn').forEach((b) => b.addEventListener('click', () => { sfx.play('open'); api.setState('bed'); }));
    },
  });
}

/* ================================================================== 8. Древо разлома */
function treeScreen(h) {
  stage(h, {
    id: 'farm-tree',
    title: 'Древо разлома: плашка события',
    note: 'Новое: пока Древо проснулось, наверху одна плашка «Цветение 62 %» с фазой и твоим вкладом, отметки фаз на полосе. Сейчас этого нет совсем — Древо видно только в 3D и на доске. В конце — итог с баффом, местом и репутацией и кнопкой «Ура!».',
    bg: BG, before: WAS('40-farm-hud'), mode: 'farm',
    states: [{ id: 'soon', label: 'через 5 минут' }, { id: 'bloom', label: 'цветёт' }, { id: 'done', label: 'расцвело' }],
    render(scene, st) {
      const ev = st === 'soon'
        ? `<div class="k-event"><span class="k-event-ic"><img src="${ui('ui/rift-tree.webp')}" alt=""></span>
             <div class="k-event-title">Древо разлома просыпается</div>
             <div class="k-event-sub">Собирай урожай — растишь Древо</div>
             <div class="k-event-timer">4:59</div>${meter(0.98, 'k-meter--thin k-meter--mode')}</div>`
        : `<div class="k-event k-lamp farm-tree"><span class="k-event-ic"><img src="${ui('ui/rift-tree.webp')}" alt=""></span>
             <div class="k-event-title">Цветение <span class="farm-bloom">62</span> %</div>
             <div class="k-event-sub">Фаза «Щекотно» · <b class="k-gold">ты 3-й, вклад 8 %</b></div>
             <div class="k-event-timer farm-tree-left">до 01:00</div>
             <div class="farm-tree-bar">${meter(0.62, 'k-meter--mode farm-bloom-m', '', 0.62)}<i style="left:25%"></i><i style="left:50%"></i><i style="left:75%"></i></div></div>`;
      scene.innerHTML = `
        <div class="k-slot k-slot--tl">${farmCard(st === 'done' ? { buffs: ['+10 % к цене · 24 ч'] } : {})}</div>
        <div class="k-slot k-slot--tc">${st === 'done' ? '' : ev}<div class="k-toasts farm-toasts">${st === 'bloom' ? toastHtml({ tone: 'good', icon: ui('ui/grumpy-cone.webp'), title: 'Шишка-ворчунья — у костра', sub: 'Подбери: +10 к вкладу · ещё 22 из 30' }) : ''}</div></div>
        <div class="k-slot k-slot--tr">${badge()}${tiles(waterCard(), bagCard())}</div>
        <div class="k-slot k-slot--bl">${chat()}</div>
        <div class="k-slot k-slot--bc">${st === 'bloom'
          ? `<button class="k-prompt farm-act">${K.key('E')}Подобрать шишку<span class="k-prompt-sep"></span><span class="k-pill k-pill--gold k-pill--sm">+10 к вкладу</span></button>`
          : st === 'soon' ? `<div class="k-prompt">${K.key('E')}Собрать тыкву<span class="k-prompt-sep"></span><span class="k-pill k-pill--gold k-pill--sm">+35 опыта</span></div>` : ''}</div>
        ${st === 'done' ? `
        <div class="k-scrim"><section class="k-window k-window--sm is-in farm-treeend">
          <div class="k-results-head"><p class="k-eyebrow">Древо разлома</p><h2 class="k-results-title">Расцвело!</h2><p class="k-results-sub">Последнюю каплю добавил Паша</p></div>
          <div class="k-win-body">
            <div class="k-reward farm-buff">${im('life-fruit')}<span><b>+10 %</b> к цене продажи<br><span class="k-dim">на 24 часа — твой плод с Древа</span></span></div>
            <table class="k-table"><thead><tr><th></th><th>Вклад</th><th class="k-r">%</th></tr></thead><tbody>
              <tr><td><span class="k-place k-place--1">1</span></td><td>Паша</td><td class="k-r">21</td></tr>
              <tr><td><span class="k-place k-place--2">2</span></td><td>Лиса</td><td class="k-r">12</td></tr>
              <tr class="is-own"><td><span class="k-place k-place--3">3</span></td><td>Ты</td><td class="k-r">8</td></tr>
              <tr><td><span class="k-place">4</span></td><td>Бочка</td><td class="k-r">7</td></tr>
            </tbody></table>
            <div class="farm-treeend-rep"><span class="k-pill k-pill--good">+16 репутации · по 2 за каждый полный 1 %</span></div>
          </div>
          <div class="k-results-actions"><button class="k-btn k-btn--lg" data-sfx="reward">Ура!<kbd class="k-key k-key--tr">E</kbd></button></div>
        </section></div>` : ''}`;
      // цветение растёт от сбора — живая полоса
      const act = scene.querySelector('.farm-act');
      let bloom = 62;
      act?.addEventListener('click', () => {
        bloom = Math.min(99, bloom + 1);
        scene.querySelector('.farm-bloom').textContent = String(bloom);
        const m = scene.querySelector('.farm-bloom-m');
        m.style.setProperty('--v', String(bloom / 100));
        requestAnimationFrame(() => m.style.setProperty('--g', String(bloom / 100)));
        pushToast(scene.querySelector('.farm-toasts'), { tone: 'reward', icon: ui('ui/grumpy-cone.webp'), title: 'Шишка! +10 к вкладу', sub: 'Твой вклад 8 % → 9 %' });
      });
    },
  });
}

/* ================================================================== 9. Новый уровень */
function levelScreen(h) {
  const SETS = {
    6: { name: 'Опытный садовник', items: [
      [ic('strawberry'), 'Клубника', 'новая культура · первая даром'],
      [ic('giant-mushroom'), 'Гриб-гигант', 'новая культура · даёт Споры'],
      [ui('ui/garden-bed.webp'), 'Грядка 4', 'можно построить в Хозяйстве'],
      [ui('ui/straw-hat.webp'), 'Шляпа-подсолнух', 'награда — надень сразу'],
    ] },
    10: { name: 'Хозяин фермы', items: [
      [ic('life-fruit'), 'Древо жизни', 'новая культура · 2 ч'],
      [ic('golden-apple'), 'Золотое яблоко', 'новая культура · 6 ч'],
      [ui('ui/garden-bed.webp'), 'Грядка 6', 'в Хозяйстве'],
      [ic('watering-can'), 'Лейка 3', '50 зарядов'],
      [ic('bag'), 'Сумка 3 и 4', 'до 200 мест'],
      [ic('truffle-pig'), 'Трюфельный свин', 'и пчёлы-опылители'],
      [ic('van'), 'Фургон', '3 ящика за раз'],
      [ui('wardrobe.webp'), 'Поросёнок «Желудь»', 'питомец — награда'],
    ] },
  };
  let shown = false;
  stage(h, {
    id: 'farm-level',
    title: 'Новый уровень фермы',
    note: 'Праздник по центру и сразу картинками — что открылось: культуры, грядки, инструменты, награда. «Надеть» — без похода в примерочную. На больших уровнях список длинный, но остаётся сеткой картинок, а не текстом.',
    bg: BG, mode: 'farm',
    states: [{ id: '6', label: 'уровень 6' }, { id: '10', label: 'уровень 10' }],
    render(scene, st) {
      const s = SETS[st];
      const lv = Number(st);
      scene.innerHTML = `
        <div class="k-slot k-slot--tr">${badge()}</div>
        <div class="k-slot k-slot--c farm-lvl-hero"><div class="k-hero k-hero--gold is-pop"><p class="k-hero-title">Уровень фермы ${lv}!</p><span class="k-hero-sub">${im('xp-star')}${s.name}</span></div></div>
        <div class="k-panel k-lamp farm-lvl${s.items.length > 4 ? ' is-wide' : ''}">
          <p class="k-eyebrow">Открылось</p>
          <div class="farm-lvl-grid">${s.items.map(([src, t, sub]) => `<div class="k-cell farm-lvl-item"><img src="${src}" alt=""><b>${t}</b><span class="k-dim">${sub}</span></div>`).join('')}</div>
          <div class="farm-lvl-btns"><button class="k-btn" data-sfx="reward">${lv === 6 ? 'Надеть шляпу' : 'Позвать поросёнка'}<kbd class="k-key k-key--tr">E</kbd></button><button class="k-btn k-btn--ghost">Позже<kbd class="k-key k-key--tr">Esc</kbd></button></div>
        </div>`;
      if (shown) sfx.play('level');
      shown = true;
    },
  });
}

/* ================================================================== 10. Набери лейку */
function wellScreen(h) {
  stage(h, {
    id: 'farm-well',
    title: 'Мини-игра «Набери лейку»',
    note: 'Само поле с ведром и лейкой не трогаем. Вокруг — окно кита: сверху бирка с процентом и зарядами, полоса времени, подсказка управления мышью внизу, «Esc — налитое останется». Итог — праздник в центре поля и сколько вёдер ещё в колодце.',
    bg: BG, before: WAS('48-farm-well-water'), mode: 'farm',
    states: [{ id: 'pour', label: 'наливаешь' }, { id: 'full', label: 'полная лейка' }, { id: 'part', label: 'итог 87 %' }],
    render(scene, st) {
      const res = st !== 'pour';
      scene.innerHTML = `
        <div class="k-scrim"><section class="k-window is-in farm-wellwin">
          ${winHead({ portrait: ic('well'), eyebrow: 'Колодец · ведро 3 из 4', title: 'Набери лейку', coins: false })}
          <div class="farm-field">
            ${res ? '' : `
            <div class="k-plate farm-tag"><b class="farm-tag-p">64 %</b><span class="farm-tag-c">${im('watering-can')}6 из 10 зарядов</span>${meter(0.64, 'k-meter--info k-meter--thin')}</div>
            <div class="k-pill k-pill--plate farm-time"><img class="k-ic" src="${ui('stopwatch.webp')}" alt="">${meter(0.4, 'k-meter--thin farm-time-m')}<b>4 с</b></div>`}
            ${res ? `
            <div class="farm-field-hero">
              <div class="k-hero k-hero--${st === 'full' ? 'gold' : 'win'} is-pop"><p class="k-hero-title is-sm">${st === 'full' ? 'Полная лейка!' : 'Отлично!'}</p><span class="k-hero-sub">${im('watering-can')}${st === 'full' ? '+10 зарядов · 100 %' : '+8 зарядов · 87 %'}</span></div>
              <span class="k-pill k-pill--plate">${im('bucket')}В колодце ещё 2 ведра · новое через 14:58</span>
            </div>` : ''}
          </div>
          <footer class="k-win-foot farm-well-foot">
            ${res
              ? '<span class="k-note">Окно закроется само через секунду</span><button class="k-btn k-btn--go">Готово<kbd class="k-key k-key--tr">E</kbd></button>'
              : `<span class="farm-ctl"><span class="k-key k-key--lg"><i class="k-mouse k-mouse--move"></i></span>Веди ведро</span>
                 <span class="farm-ctl">Зажми <span class="k-key k-key--lg"><i class="k-mouse k-mouse--l"></i></span>или ${K.key('Space', 'k-key--lg')} — лей в горлышко</span>
                 <span class="k-note farm-well-esc">${K.key('Esc', 'k-key--sm')} закончить — налитое останется</span>`}
          </footer>
        </section></div>`;
    },
  });
}

/* ------------------------------------------------------------------ сборка раздела */
if (host) {
  hudScreen(host);
  beltScreen(host);
  seedsScreen(host);
  gribScreen(host);
  ordersScreen(host);
  estateScreen(host);
  boardScreen(host);
  treeScreen(host);
  levelScreen(host);
  wellScreen(host);
}
