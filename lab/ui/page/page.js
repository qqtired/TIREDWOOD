// Страница-обзор нового интерфейса: шкурки, звук, сцены (stage), разделы «Сетка» и «Детали».
// Группы экранов (screens/<группа>.js) импортируют отсюда:  import { stage, section, K, sfx } from '../page/page.js';
import { sfx } from '../kit/sfx.js';

export { sfx };

const SKINS = ['retro2', 'beach', 'dusk'];
const SKIN_KEY = 'tw-ui2-skin'; // свой ключ — не задевает первую версию на том же сайте
const FONTS = ['rubik', 'unbounded', 'dela', 'mono', 'russo'];
const FONT_KEY = 'tw-ui2-font';
const W = 1440;
const H = 900;

/* ------------------------------------------------------------------ мелкие помощники */
/** Пути к картинкам страницы (относительно index.html) и готовые куски разметки кита */
export const K = {
  icon: (name) => `img/icons/${name}`,
  coin: (cls = '') => `<img class="k-coin ${cls}" src="img/icons/coin.svg" alt="">`,
  key: (k, cls = '') => `<kbd class="k-key ${cls}">${k}</kbd>`,
  mouse: (b = 'l') => `<i class="k-mouse k-mouse--${b}" aria-hidden="true"></i>`,
  /** inline-SVG микрофона для кнопки голоса */
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8.5" y="3" width="7" height="11.5" rx="3.5" fill="currentColor" fill-opacity=".22"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/></svg>',
  esc: (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
};

/** Тело раздела группы экранов: section('plaza') → <div class="screens-body"> внутри #screens-plaza (или null) */
export function section(group) {
  const sec = document.querySelector(`.pg-screens[data-group="${group}"]`);
  if (!sec) return null;
  const body = sec.querySelector('.screens-body');
  const wait = body.querySelector('.pg-wait');
  if (wait) wait.remove();
  return body;
}

/* ------------------------------------------------------------------ шкурки */
function setSkin(skin, { sound = true } = {}) {
  if (!SKINS.includes(skin)) skin = 'retro2';
  document.documentElement.dataset.skin = skin;
  try { localStorage.setItem(SKIN_KEY, skin); } catch { /* без сохранения */ }
  document.querySelectorAll('.pg-skin').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.pick === skin)));
  document.querySelectorAll('.pg-cmp').forEach((b) => b.classList.toggle('is-on', b.dataset.pick === skin));
  if (sound) sfx.play('open');
  window.dispatchEvent(new CustomEvent('skin-change', { detail: skin }));
}

/* ------------------------------------------------------------------ шрифт заголовков: data-font на <html> (пусто — как в стиле) */
function setFont(font, { sound = true } = {}) {
  if (!FONTS.includes(font)) font = '';
  if (font) document.documentElement.dataset.font = font; else delete document.documentElement.dataset.font;
  try { if (font) localStorage.setItem(FONT_KEY, font); else localStorage.removeItem(FONT_KEY); } catch { /* без сохранения */ }
  document.querySelectorAll('.pg-fonts-seg > button').forEach((b) => b.classList.toggle('is-on', b.dataset.font === font));
  if (sound) sfx.play('click');
  // ширина заголовков поменялась — пересчитать сцены
  document.fonts?.ready.then(() => stages.forEach(fit));
  window.dispatchEvent(new CustomEvent('font-change', { detail: font }));
}

/* ------------------------------------------------------------------ сцена 1440×900 */
const stages = new Set();

function fit(st) {
  const w = st.frame.clientWidth || W;
  const k = w / W;
  st.frame.style.height = `${Math.round(H * k)}px`;
  st.scale.style.transform = `scale(${k})`;
}
let resizeT = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => stages.forEach(fit), 150);
});

/**
 * Сцена-мокап экрана 1440×900, масштаб под ширину колонки (пересчёт только при загрузке и ресайзе).
 * opts: { id, title, note?, bg, before?, mode?, states?: [{id,label}], state?, render(scene, stateId, api) }
 *  - scene — <div class="k-hud"> 1440×900 поверх фона; рисуй в него слоты .k-slot--tl … и окна.
 *  - before — снимок «как сейчас»: появляется переключатель «Стало / Было».
 *  - states — кнопки состояний над сценой; при нажатии render вызывается заново с новым stateId.
 * Возвращает { el, scene, setState(id), render() }.
 */
export function stage(host, opts) {
  const o = { states: [], ...opts };
  const el = document.createElement('figure');
  el.className = 'stage';
  if (o.id) el.id = `stage-${o.id}`;
  el.innerHTML = `
    <figcaption class="stage-cap">
      <div class="stage-titles">
        ${o.title ? `<h3 class="stage-title">${o.title}</h3>` : ''}
        ${o.note ? `<p class="stage-note">${o.note}</p>` : ''}
      </div>
      <div class="stage-ctl">
        ${o.states.length ? `<div class="k-seg stage-states" role="group" aria-label="Состояние">${o.states.map((s) => `<button type="button" data-state="${s.id}">${s.label}</button>`).join('')}</div>` : ''}
        ${o.before ? `<div class="k-seg stage-ab" role="group" aria-label="Было или стало"><button type="button" data-ab="after" class="is-on">Стало</button><button type="button" data-ab="before">Было</button></div>` : ''}
      </div>
    </figcaption>
    <div class="stage-frame">
      <div class="stage-scale">
        <div class="stage-bg"${o.bg ? ` style="background-image:url('${o.bg}')"` : ''}></div>
        <div class="k-hud stage-scene"${o.mode ? ` data-mode="${o.mode}"` : ''}></div>
        ${o.before ? `<img class="stage-before" src="${o.before}" alt="Как сейчас" loading="lazy" hidden>` : ''}
      </div>
      ${o.before ? '<span class="stage-badge" hidden>Сейчас в игре</span>' : ''}
    </div>`;
  host.append(el);

  const st = { frame: el.querySelector('.stage-frame'), scale: el.querySelector('.stage-scale') };
  const scene = el.querySelector('.stage-scene');
  let cur = o.state ?? o.states[0]?.id ?? null;

  const api = {
    el,
    scene,
    get state() { return cur; },
    render() { if (o.render) o.render(scene, cur, api); },
    setState(id) {
      cur = id;
      el.querySelectorAll('.stage-states button').forEach((b) => b.classList.toggle('is-on', b.dataset.state === id));
      api.render();
    },
  };

  el.querySelector('.stage-states')?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-state]');
    if (b) { sfx.play('click'); api.setState(b.dataset.state); }
  });
  el.querySelector('.stage-ab')?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-ab]');
    if (!b) return;
    const before = b.dataset.ab === 'before';
    el.querySelectorAll('.stage-ab button').forEach((x) => x.classList.toggle('is-on', x === b));
    el.querySelector('.stage-before').hidden = !before;
    el.querySelector('.stage-badge').hidden = !before;
    el.classList.toggle('is-before', before);
    sfx.play('click');
  });

  stages.add(st);
  fit(st);
  if (cur) api.setState(cur); else api.render();
  return api;
}

/* ------------------------------------------------------------------ тосты (живые, макс. 3) */
export function pushToast(stack, { tone = 'info', icon, title, sub }, { max = 3, life = 4200 } = {}) {
  const t = document.createElement('div');
  t.className = `k-toast k-toast--${tone} is-new`;
  t.innerHTML = `<span class="k-toast-ic">${icon ? `<img src="${icon}" alt="">` : ''}</span><div class="k-toast-title">${title}</div>${sub ? `<div class="k-toast-sub">${sub}</div>` : ''}`;
  stack.prepend(t);
  while (stack.children.length > max) stack.lastElementChild.remove();
  sfx.play(tone === 'reward' ? 'reward' : tone === 'warn' ? 'error' : 'toast');
  if (life) setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 320); }, life);
  return t;
}

/* ------------------------------------------------------------------ готовые куски компактного HUD (сетка, детали, сравнение) */
const meterH = (v, cls = '') => `<span class="k-meter ${cls}" style="--v:${v}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span>`;
const HUD = {
  badge: (id = '') => `<div class="k-badge"${id ? ` id="${id}"` : ''}><span class="k-ring" style="--p:.64"><b>12</b></span><span class="k-badge-body"><span class="k-badge-nick">Кракозябра</span><span class="k-badge-tokens">${K.coin()}<span class="dm-tok">1 250</span></span></span></div>`,
  /** плитки под бейджем: первая — у края экрана */
  tiles: (full = false) => `<div class="k-tiles">
      <div class="k-tile${full ? ' k-tile--warn' : ''}"><span class="k-tile-face"><img src="${K.icon('bag1.webp')}" alt=""><kbd class="k-key k-key--sm k-key--tr">I</kbd>${meterH(full ? 1 : 0.6, full ? 'k-meter--bad' : 'k-meter--good')}</span>
        <span class="k-tile-cap">${full ? '10 / 10' : '6 / 10'}<small>22 ${K.coin()}</small></span></div>
      <div class="k-tile"><span class="k-tile-face"><img src="${K.icon('beer.webp')}" alt="">${meterH(0.5)}</span>
        <span class="k-tile-cap">7:40<small>+10 %</small></span></div>
      <div class="k-tile"><span class="k-tile-face"><img src="${K.icon('quest-fish.webp')}" alt=""><kbd class="k-key k-key--sm k-key--tr">J</kbd></span>
        <span class="k-tile-cap">7 / 15<small>задание</small></span></div>
    </div>`,
  event: (o = {}) => `<div class="k-event k-lamp"${o.mode ? ` data-mode="${o.mode}"` : ''}><span class="k-event-ic"><img src="${o.icon || K.icon('ui/rain.webp')}" alt=""></span><div class="k-event-title">${o.title || 'Шторм через 1:20'}</div>${o.sub === '' ? '' : `<div class="k-event-sub">${o.sub || 'Беги к маяку по мосткам'}</div>`}<div class="k-event-timer"${o.timerId ? ` id="${o.timerId}"` : ''}>${o.timer || '1:20'}</div>${meterH(o.v ?? 0.62, 'k-meter--mode')}</div>`,
  toast: (tone, icon, title, sub) => `<div class="k-toast k-toast--${tone}"><span class="k-toast-ic"><img src="${icon}" alt=""></span><div class="k-toast-title">${title}</div>${sub ? `<div class="k-toast-sub">${sub}</div>` : ''}</div>`,
  prompt: () => `<div class="k-prompt">${K.key('E')}Сесть за стол<span class="k-prompt-sep"></span><span class="k-pill k-pill--gold k-pill--sm">${K.coin()}10</span></div>`,
  chat: () => `<div class="k-chat"><div class="k-chat-list">
      <div class="k-chat-line is-sys is-old">Бочка зашла на набережную</div>
      <div class="k-chat-line k-nick-1"><b>Паша</b>кто на рыбалку?</div>
      <div class="k-chat-line is-own k-nick-6"><b>Ты</b>иду!</div></div>
      <div class="k-chat-bar"><button class="k-voice" aria-label="Голос">${K.mic}<kbd class="k-key k-key--sm">V</kbd></button><div class="k-chat-closed">${K.key('Enter')}Написать в чат</div></div></div>`,
  /** панель бойца v2: отдельные блоки (рывок — отдельной пилюлей, прямым ребёнком .k-vitals) */
  vitals: ({ hp = 100, gun = 0, ammo = 24, low = false, gren = true, dash = true } = {}) => `<div class="k-vitals">
      <div class="k-vitals-hp${low ? ' is-low' : ''}"><div class="k-vitals-row"><img class="k-vitals-ic" src="img/fort/heart.webp" alt=""><b class="k-vitals-num">${hp}</b></div>${meterH(hp / 100, 'k-meter--bad')}</div>
      <div class="k-vitals-arms">
        <div class="k-arm${gun === 0 ? ' is-on' : ''}"><img src="img/fort/marker.webp" alt=""><span>Маркер</span><kbd class="k-key k-key--sm k-key--tr">1</kbd></div>
        <div class="k-arm${gun === 1 ? ' is-on' : ''}"><img src="img/fort/shotgun.webp" alt=""><span>Дробовик</span><kbd class="k-key k-key--sm k-key--tr">2</kbd></div>
        ${gren ? '<div class="k-arm k-arm--count"><img src="img/fort/gren.webp" alt=""><span>2</span><kbd class="k-key k-key--sm k-key--tr">G</kbd></div>' : ''}
      </div>
      <div class="k-vitals-ammo${ammo === 0 ? ' is-empty' : ''}"><div class="k-vitals-row"><kbd class="k-key k-key--sm">R</kbd><b class="k-vitals-num">${ammo}<small>/ 30</small></b></div>${meterH(ammo / 30, 'k-meter--thin')}</div>
      ${dash ? `<div class="k-vitals-dash"><kbd class="k-key k-key--sm">Shift</kbd><span class="k-vitals-cap">рывок</span>${meterH(1, 'k-meter--info')}</div>` : ''}
    </div>`,
  /** pos — координаты центра круга стилем: 'left:40px;top:470px' (или right:…) */
  edge: (pos, a, side, img, label, cls = '') => `<div class="k-edge k-edge--bad k-edge--${side} ${cls}" style="${pos};--a:${a}deg"><span class="k-edge-disc"><img src="${img}" alt=""></span><span class="k-edge-label">${label}</span></div>`,
};

/* ------------------------------------------------------------------ раздел 1: сетка экрана */
const SLOTS = [
  { id: 'tl', name: 'Режим', what: 'Уровень и шансы рыбалки, ферма, карта крепости — карточка до 300 px', x: 16, y: 16, w: 360, h: 170 },
  { id: 'tc', name: 'Событие', what: 'Одна строка: волна, шторм, голосование. Под ней до 3 тостов', x: 440, y: 16, w: 560, h: 170 },
  { id: 'tr', name: 'Игрок', what: 'Бейдж 44 px, под ним плитки: рюкзак, пиво, задание', x: 1124, y: 16, w: 300, h: 170 },
  { id: 'c', name: 'Центр', what: 'Свободно для игры. Только праздник, прицел, шкала вываживания', x: 470, y: 250, w: 500, h: 330 },
  { id: 'bl', name: 'Связь', what: 'Чат и голос, строки 14 px', x: 16, y: 650, w: 380, h: 234 },
  { id: 'bc', name: 'Действие', what: 'Подсказка «E — …» или панель бойца блоками', x: 440, y: 770, w: 560, h: 106 },
  { id: 'br', name: 'Улов / инструмент', what: 'Карточка улова, эмоции', x: 1104, y: 720, w: 320, h: 164 },
];

/** доля экрана под HUD: сумма площадей верхних блоков в слотах и стрелок (без окон) */
function hudShare(scene) {
  let a = 0;
  scene.querySelectorAll('.k-slot > *, .k-tiles > .k-tile, .k-edge-disc, .k-edge-label').forEach((el) => {
    if (el.classList.contains('k-tiles')) return; // считаем плитки по одной
    a += el.offsetWidth * el.offsetHeight;
  });
  return Math.round((a / (W * H)) * 1000) / 10;
}

function buildGrid() {
  const host = document.getElementById('grid-body');
  if (!host) return;
  stage(host, {
    id: 'grid',
    title: 'Семь мест на экране 1440 × 900',
    note: 'Поля 16 px. Каждая система живёт в своём месте — плашки не наезжают друг на друга.',
    bg: 'img/bg-plaza-wide.jpg',
    before: 'img/03-plaza-default.jpg',
    render(scene) {
      scene.innerHTML = SLOTS.map((s) => `
        <div class="grid-slot grid-slot--${s.id}" style="left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px">
          <span class="grid-slot-tag">${s.name}</span><span class="grid-slot-dim">${s.id === 'c' ? 'по центру, 32% высоты' : `${s.x}, ${s.y} · ${s.w} px`}</span>
          <span class="grid-slot-what">${s.what}</span>
        </div>`).join('');
    },
  });
  // весь компактный HUD сразу — набережная и бой
  const all = stage(host, {
    id: 'grid-hud',
    title: 'Весь HUD сразу — версия 2.0',
    note: 'Бейдж с плитками, событие в одну строку, тост, чат, подсказка; в бою — панель бойца отдельными блоками и маленькие стрелки угроз.',
    bg: 'img/bg-plaza-wide.jpg',
    states: [{ id: 'plaza', label: 'набережная' }, { id: 'fight', label: 'бой в крепости' }],
    render(scene, st, api) {
      const fight = st === 'fight';
      api.el.querySelector('.stage-bg').style.backgroundImage = `url('${fight ? 'img/fort/bg-battle.jpg' : 'img/bg-plaza-wide.jpg'}')`;
      scene.dataset.mode = fight ? 'fort' : '';
      if (!fight) delete scene.dataset.mode;
      scene.innerHTML = `
        <div class="k-slot k-slot--tr">${HUD.badge()}${HUD.tiles()}</div>
        <div class="k-slot k-slot--tc">${fight
          ? HUD.event({ icon: 'img/fort/horn.webp', title: 'Волна 3 · 12 врагов', sub: 'Держи ворота до сундука', timer: '0:48', v: 0.4 })
          : HUD.event()}<div class="k-toasts">${fight
          ? HUD.toast('reward', 'img/fort/gold.webp', '+14 золота', 'Крылатка сбита')
          : HUD.toast('reward', K.icon('ui/token.webp'), '+45 жетонов', 'Скумбрия ушла Деду Семёну')}</div></div>
        <div class="k-slot k-slot--bl">${HUD.chat()}</div>
        <div class="k-slot k-slot--bc">${fight ? HUD.vitals({ hp: 72, ammo: 18 }) : HUD.prompt()}</div>
        ${fight ? `${HUD.edge('left:40px;top:470px', 180, 'left', 'img/fort/climber.webp', 'на стене ×2 · <b>23 м</b>', 'is-hot')}
          ${HUD.edge('left:1396px;top:430px', 0, 'right', 'img/fort/boss.webp', 'босс · <b>40 м</b>', 'k-edge--lg')}
          <div class="k-cross"><i></i><i></i><i></i><i></i></div>` : ''}`;
      requestAnimationFrame(() => {
        const n = api.el.querySelector('.pg-share');
        if (n) n.textContent = `HUD занимает ≈ ${String(hudShare(scene)).replace('.', ',')} % экрана`;
      });
    },
  });
  const cap = all.el.querySelector('.stage-ctl');
  cap?.insertAdjacentHTML('afterbegin', '<span class="pg-share"></span>');
  all.render();
  const legend = document.createElement('div');
  legend.className = 'grid-legend';
  legend.innerHTML = `
    <div class="k-cell"><b>Меньше и легче.</b> Бейдж — 44 px, событие — одна строка, тост — до 360 px, подсказка — 42 px. Рамки 1–2 px, мягкие тени.</div>
    <div class="k-cell"><b>Рюкзак и пиво — плитки.</b> Иконка на подложке, клавиша в углу, под ней коротко: «6 / 10», «22 жетона», «7:40».</div>
    <div class="k-cell"><b>Окна — как были.</b> Лавка, Хозяйство, журнал, меню Esc, «Кто где» и итоги — та же раскладка, только новый стиль.</div>`;
  host.append(legend);
}

/* ------------------------------------------------------------------ раздел 2: детали (живая витрина) */
function demo(title, html, cls = '') {
  return `<article class="dm ${cls}"><h3 class="dm-title">${title}</h3><div class="dm-body">${html}</div></article>`;
}

function buildDetails() {
  const host = document.getElementById('details-body');
  if (!host) return;
  const c = K.coin();
  host.innerHTML = `<div class="dm-grid">
    ${demo('Бейдж и плитки — справа сверху', `
      <div class="dm-badgebox">
        ${HUD.badge('dm-badge')}
        ${HUD.tiles()}
        <div class="k-ctx"><img class="k-ctx-ic" src="${K.icon('quest-fish.webp')}" alt=""><span class="k-ctx-title">Задание 3 · Дед Семён</span><span class="k-ctx-val">7 из 15 рыб · +75 ${c}</span>${meterH(7 / 15, 'k-meter--good')}</div>
      </div>
      <div class="dm-row"><button class="k-btn k-btn--sm" id="dm-plus">Получить +25</button><button class="k-btn k-btn--stop k-btn--sm" id="dm-full">Рюкзак полон</button></div>
      <p class="dm-note">Плитка: иконка на подложке, клавиша в углу, подпись снизу. Длинная карточка — только если без текста никак (задание).</p>`)}
    ${demo('Событие, тост и подсказка', `
      <div class="dm-col dm-hudbox">
        ${HUD.event({ mode: 'fishing', timerId: 'dm-timer' })}
        ${HUD.toast('reward', K.icon('ui/token.webp'), '+45 жетонов', 'Скумбрия ушла Деду Семёну')}
        ${HUD.prompt()}
        <div class="k-prompt k-prompt--urgent">${K.key('Space')}ПОДСЕКАЙ!</div>
      </div>
      <p class="dm-note">Событие — одна строка: иконка, заголовок, таймер и тонкая полоса. Подстрока — только если нужна.</p>`)}
    ${demo('Панель бойца — отдельными блоками', `
      <div class="dm-fightbox" id="dm-fight">
        ${HUD.edge('left:34px;top:76px', 180, 'left', 'img/fort/climber.webp', 'на стене ×2 · <b>23 м</b>', 'is-hot')}
        ${HUD.edge('right:34px;top:76px', 0, 'right', 'img/fort/brute.webp', 'громила · <b>31 м</b>')}
        <div class="dm-fight-bc">${HUD.vitals({ hp: 100, ammo: 24 })}</div>
      </div>
      <div class="dm-row"><button class="k-btn k-btn--stop k-btn--sm" id="dm-f-hit">Попадание −15</button><button class="k-btn k-btn--sm" id="dm-f-gun">Сменить оружие<kbd class="k-key k-key--sm k-key--tr">2</kbd></button><button class="k-btn k-btn--info k-btn--sm" id="dm-f-shot">Выстрел</button><button class="k-btn k-btn--go k-btn--sm" id="dm-f-heal">Вылечить</button></div>
      <p class="dm-note">Здоровье, каждое оружие, граната, патроны и рывок — каждый на своей подложке. Подпись оружия — только у выбранного. Стрелки угроз — круг 42 px и маленькая подпись.</p>`, 'dm-wide')}
    ${demo('Тосты — максимум три', `
      <div class="dm-row">
        <button class="k-btn k-btn--info k-btn--sm" data-toast="info">Инфо</button>
        <button class="k-btn k-btn--sm" data-toast="reward">Награда</button>
        <button class="k-btn k-btn--stop k-btn--sm" data-toast="warn">Внимание</button>
      </div>
      <div class="dm-toastbox"><div class="k-toasts" id="dm-toasts"></div></div>`)}
    ${demo('Кнопки — цвет значит смысл', `
      <div class="dm-row">
        <button class="k-btn k-btn--gold">Поставить<kbd class="k-key k-key--tr">E</kbd></button>
        <button class="k-btn k-btn--go">Ещё<kbd class="k-key k-key--tr">Space</kbd></button>
        <button class="k-btn k-btn--stop">Хватит<kbd class="k-key k-key--tr">S</kbd></button>
        <button class="k-btn k-btn--special">Удвоить<kbd class="k-key k-key--tr">D</kbd></button>
      </div>
      <div class="dm-row">
        <button class="k-btn k-btn--ghost">Отмена</button>
        <button class="k-btn k-btn--go k-btn--sm">Да<kbd class="k-key k-key--sm k-key--tr">Y</kbd></button>
        <button class="k-btn k-btn--stop k-btn--sm">Нет<kbd class="k-key k-key--sm k-key--tr">N</kbd></button>
        <button class="k-btn k-btn--icon" aria-label="Рюкзак"><img class="k-ic" src="${K.icon('bag1.webp')}" alt=""><kbd class="k-key k-key--sm k-key--tr">I</kbd></button>
        <button class="k-close" aria-label="Закрыть"><kbd class="k-key k-key--sm">Esc</kbd></button>
      </div>
      <p class="dm-note">Золотая — подтвердить, зелёная — да/вперёд, красная — стоп, особая — особое. Клавиша — колпачком прямо на углу.</p>`)}
    ${demo('Клавиши и мышь', `
      <div class="dm-row dm-keys">
        <span class="dm-k">${K.key('E', 'k-key--lg')}<small>действие</small></span>
        <span class="dm-k">${K.key('Esc', 'k-key--lg')}<small>меню</small></span>
        <span class="dm-k">${K.key('Tab', 'k-key--lg')}<small>кто где</small></span>
        <span class="dm-k">${K.key('Enter', 'k-key--lg')}<small>чат</small></span>
        <span class="dm-k">${K.key('V', 'k-key--lg')}<small>голос</small></span>
      </div>
      <div class="dm-row dm-keys">
        <span class="dm-k"><span class="k-key k-key--lg">${K.mouse('l')}</span><small>забросить</small></span>
        <span class="dm-k"><span class="k-key k-key--lg">${K.mouse('r')}</span><small>прицел</small></span>
        <span class="dm-k"><span class="k-key k-key--lg">${K.mouse('wheel')}</span><small>камера</small></span>
        <span class="dm-k"><span class="k-keys">${K.key('1')}${K.key('2')}${K.key('3')}</span><small>эмоции 1–6</small></span>
      </div>`)}
    ${demo('Окно со вкладками — раскладка как в первой версии', `
      <div class="k-window dm-win" id="dm-win" data-mode="fishing">
        <header class="k-win-head">
          <span class="k-win-portrait"><img src="${K.icon('ui/journal.webp')}" alt=""></span>
          <div class="k-win-titles"><p class="k-eyebrow">Пирс · Дед Семён</p><h2 class="k-win-title">Журнал рыбака</h2></div>
          <div class="k-win-tools"><span class="k-pill k-pill--gold k-pill--lg">${c}1 250</span><button class="k-close" aria-label="Закрыть"><kbd class="k-key k-key--sm">Esc</kbd></button></div>
        </header>
        <nav class="k-tabs" role="tablist">
          <button class="k-tab is-on" data-tab="0"><img class="k-ic" src="${K.icon('fish-mackerel.webp')}" alt="">Рыбы <span class="k-tab-count">38</span></button>
          <button class="k-tab" data-tab="1"><img class="k-ic" src="${K.icon('fish-chest.webp')}" alt="">Находки <span class="k-tab-count">6</span></button>
          <button class="k-tab" data-tab="2"><img class="k-ic" src="${K.icon('ui/records.webp')}" alt="">Награды</button>
        </nav>
        <div class="k-win-body">
          <div class="dm-tabpane" data-pane="0">
            <div class="dm-stats3">
              <div class="k-stat k-stat--own"><img class="k-stat-ic" src="${K.icon('fish-sturgeon.webp')}" alt=""><div class="k-stat-num">4,2<small>кг</small></div><div class="k-stat-cap">Твой рекорд: осётр</div></div>
              <div class="k-stat"><img class="k-stat-ic" src="${K.icon('fish-mackerel.webp')}" alt=""><div class="k-stat-num">38<small>/ 74</small></div><div class="k-stat-cap">Видов поймано</div><div class="k-meter k-meter--good k-meter--thin" style="--v:.51"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></div></div>
            </div>
          </div>
          <div class="dm-tabpane" data-pane="1" hidden><div class="dm-stats3"><div class="k-stat"><img class="k-stat-ic" src="${K.icon('fish-chest.webp')}" alt=""><div class="k-stat-num">6</div><div class="k-stat-cap">Сундуков со дна</div></div><div class="k-stat k-stat--empty"><img class="k-stat-ic" src="${K.icon('fish-bottle.webp')}" alt=""><div class="k-stat-num">0</div><div class="k-stat-cap">Писем в бутылке</div></div></div></div>
          <div class="dm-tabpane" data-pane="2" hidden><div class="dm-stats3"><div class="k-stat"><img class="k-stat-ic" src="${K.icon('star.png')}" alt=""><div class="k-stat-num">3<small>/ 8</small></div><div class="k-stat-cap">Рамок шкалы открыто</div><div class="k-meter k-meter--thin" style="--v:.375"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></div></div></div></div>
        </div>
        <footer class="k-win-foot"><span class="k-note">Открыть журнал — ${K.key('J', 'k-key--sm')}</span><button class="k-btn k-btn--ghost k-btn--sm">Рюкзак<kbd class="k-key k-key--sm k-key--tr">I</kbd></button><button class="k-btn k-btn--sm">Продать улов</button></footer>
      </div>`, 'dm-wide')}
    ${demo('Полосы со «следом»', `
      <div class="dm-col">
        <div class="dm-meter"><span>Здоровье</span><div class="k-meter k-meter--lg k-meter--bad" id="dm-hp" style="--v:.8;--g:.8"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i><span class="k-meter-label">80 / 100</span></div></div>
        <div class="dm-meter"><span>Опыт</span><div class="k-meter" style="--v:.64"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></div></div>
        <div class="dm-meter"><span>Лейка</span><div class="k-meter k-meter--info" style="--v:.35"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></div></div>
        <div class="dm-row"><button class="k-btn k-btn--stop k-btn--sm" id="dm-hit">Удар −15</button><button class="k-btn k-btn--go k-btn--sm" id="dm-heal">Вылечить</button></div>
      </div>`)}
    ${demo('Итоги игры', `
      <div class="k-window k-window--sm dm-results" data-mode="race">
        <div class="k-results-head"><p class="k-eyebrow">Картинг · 3 круга</p><h2 class="k-results-title">Ты второй!</h2><p class="k-results-sub">Лучший круг 0:41,2 — твой рекорд</p></div>
        <div class="k-win-body">
          <table class="k-table"><thead><tr><th></th><th>Игрок</th><th class="k-r">Время</th><th class="k-r">${c}</th></tr></thead><tbody>
            <tr><td><span class="k-place k-place--1">1</span></td><td>Паша</td><td class="k-r">2:04,8</td><td class="k-r">+60</td></tr>
            <tr class="is-own"><td><span class="k-place k-place--2">2</span></td><td>Ты</td><td class="k-r">2:06,1</td><td class="k-r">+40</td></tr>
            <tr><td><span class="k-place k-place--3">3</span></td><td>Бочка</td><td class="k-r">2:11,5</td><td class="k-r">+25</td></tr>
          </tbody></table>
          <div class="k-reward">${K.coin()}<b>+40</b> жетонов и <b>+120</b> опыта</div>
        </div>
        <div class="k-results-actions"><button class="k-btn k-btn--go">Ещё раз<kbd class="k-key k-key--tr">R</kbd></button><button class="k-btn k-btn--ghost">На набережную<kbd class="k-key k-key--tr">Esc</kbd></button></div>
      </div>`)}
    ${demo('Праздник по центру', `
      <div class="dm-herobox" id="dm-herobox"><div class="k-hero k-hero--gold is-pop"><p class="k-hero-title">Отличный улов!</p><span class="k-hero-sub">Скумбрия · 1,2 кг · +45 ${c}</span></div></div>
      <div class="dm-row">
        <button class="k-btn k-btn--sm" data-hero="gold">Улов</button>
        <button class="k-btn k-btn--go k-btn--sm" data-hero="win">Победа</button>
        <button class="k-btn k-btn--stop k-btn--sm" data-hero="lose">Мимо</button>
        <button class="k-btn k-btn--info k-btn--sm" data-hero="info">Волна</button>
        <button class="k-btn k-btn--special k-btn--sm" data-hero="count">3-2-1</button>
      </div>`)}
    ${demo('Ставка фишками', `
      <div class="k-panel dm-bet"><div class="k-bet" id="dm-bet">
        <div class="k-bet-chips">${[10, 20, 50, 100, 500].map((v, i) => `<button class="k-chip k-chip--${v}" data-chip="${v}" data-sfx="pop"${v === 500 ? ' disabled' : ''}>${v}<kbd class="k-key k-key--sm k-key--br">${i + 1}</kbd></button>`).join('')}</div>
        <div class="k-bet-row"><label class="k-bet-amount">Ставка <input class="k-input k-bet-input" inputmode="numeric" value="30" aria-label="Ставка"></label>
          <button class="k-btn" data-sfx="reward">Поставить<kbd class="k-key k-key--tr">E</kbd></button>
          <span class="k-pill k-pill--gold k-pill--lg">${c}1 250</span></div>
        <p class="k-bet-note">Клик по фишке добавляет её к ставке · от 5 до 500 жетонов</p>
      </div></div>`)}
    ${demo('Настройки', `
      <div class="k-panel dm-set">
        <div class="k-row"><div><div class="k-row-title">Тени</div><div class="k-row-hint">Красивее, но тяжелее для слабых ноутбуков</div></div><div class="k-row-ctl"><label class="k-switch"><input type="checkbox" checked><span class="k-switch-track"></span></label></div></div>
        <div class="k-row"><div><div class="k-row-title">Качество</div></div><div class="k-row-ctl"><div class="k-seg"><button>Низкое</button><button class="is-on">Среднее</button><button>Высокое</button></div></div></div>
        <div class="k-row"><div><div class="k-row-title">Громкость голосов</div></div><div class="k-row-ctl"><input class="k-slider" type="range" min="0" max="100" value="70" style="--v:.7"><span class="k-row-val">70%</span></div></div>
      </div>`)}
  </div>`;
  wireDetails(host);
}

function wireDetails(host) {
  // вкладки окна
  const win = host.querySelector('#dm-win');
  win?.querySelector('.k-tabs').addEventListener('click', (e) => {
    const t = e.target.closest('.k-tab');
    if (!t) return;
    win.querySelectorAll('.k-tab').forEach((x) => x.classList.toggle('is-on', x === t));
    win.querySelectorAll('.dm-tabpane').forEach((p) => { p.hidden = p.dataset.pane !== t.dataset.tab; });
  });
  // тосты
  const stack = host.querySelector('#dm-toasts');
  const TOASTS = {
    info: [{ icon: K.icon('ui/online.webp'), title: 'Паша зашёл на набережную' }, { icon: K.icon('ui/float.webp'), title: 'Комета поймала барракуду', sub: '3,1 кг — её лучшая рыба' }],
    reward: [{ icon: K.icon('ui/token.webp'), title: '+45 жетонов', sub: 'Скумбрия ушла Деду Семёну' }, { icon: K.icon('ui/records.webp'), title: 'Новый рекорд!', sub: 'Осётр 4,2 кг — больше всех' }],
    warn: [{ icon: K.icon('bag1.webp'), title: 'Рюкзак полон', sub: 'Продай улов Деду Семёну' }, { icon: K.icon('ui/rain.webp'), title: 'Шторм через 30 секунд', sub: 'Беги к маяку по мосткам' }],
  };
  const n = { info: 1, reward: 1, warn: 0 };
  if (stack) {
    pushToast(stack, { tone: 'info', ...TOASTS.info[0] }, { life: 0 });
    pushToast(stack, { tone: 'reward', ...TOASTS.reward[0] }, { life: 0 });
    stack.querySelectorAll('.is-new').forEach((t) => t.classList.remove('is-new'));
  }
  host.querySelectorAll('[data-toast]').forEach((b) => b.addEventListener('click', () => {
    const tone = b.dataset.toast;
    const list = TOASTS[tone];
    pushToast(stack, { tone, ...list[n[tone]++ % list.length] });
  }));
  // полосы со следом
  const hp = host.querySelector('#dm-hp');
  let v = 0.8;
  const setHp = (nv) => {
    v = Math.max(0, Math.min(1, nv));
    hp.style.setProperty('--v', v);
    hp.querySelector('.k-meter-label').textContent = `${Math.round(v * 100)} / 100`;
    requestAnimationFrame(() => hp.style.setProperty('--g', v));
  };
  host.querySelector('#dm-hit')?.addEventListener('click', () => setHp(v - 0.15));
  host.querySelector('#dm-heal')?.addEventListener('click', () => { hp.style.setProperty('--g', 1); setHp(1); });
  // +25 у бейджа, рюкзак полон
  const badge = host.querySelector('#dm-badge');
  const tok = badge?.querySelector('.dm-tok');
  let tokens = 1250;
  host.querySelector('#dm-plus')?.addEventListener('click', () => {
    tokens += 25;
    tok.textContent = tokens.toLocaleString('ru-RU');
    const box = badge.querySelector('.k-badge-tokens');
    box.classList.remove('is-bump'); void box.offsetWidth; box.classList.add('is-bump');
    badge.querySelector('.k-pop')?.remove();
    const p = document.createElement('span');
    p.className = 'k-pop';
    p.textContent = '+25';
    badge.append(p);
    setTimeout(() => p.remove(), 1700);
    sfx.play('reward');
  });
  let full = false;
  host.querySelector('#dm-full')?.addEventListener('click', (e) => {
    full = !full;
    const tiles = host.querySelector('.dm-badgebox .k-tiles');
    tiles.outerHTML = HUD.tiles(full);
    e.currentTarget.textContent = full ? 'Продать улов' : 'Рюкзак полон';
    e.currentTarget.className = `k-btn k-btn--sm ${full ? 'k-btn--go' : 'k-btn--stop'}`;
  });
  // панель бойца: попадание, смена оружия, выстрел, лечение
  const fight = host.querySelector('#dm-fight');
  if (fight) {
    const f = { hp: 100, gun: 0, ammo: 24 };
    const draw = () => {
      const old = fight.querySelector('.k-vitals');
      const prevG = old?.querySelector('.k-vitals-hp .k-meter')?.style.getPropertyValue('--v') || f.hp / 100;
      old.outerHTML = HUD.vitals({ ...f, low: f.hp <= 30 });
      const m = fight.querySelector('.k-vitals-hp .k-meter');
      m.style.setProperty('--g', prevG);
      requestAnimationFrame(() => requestAnimationFrame(() => m.style.setProperty('--g', f.hp / 100)));
    };
    host.querySelector('#dm-f-hit')?.addEventListener('click', () => { f.hp = Math.max(0, f.hp - 15); draw(); });
    host.querySelector('#dm-f-heal')?.addEventListener('click', () => { f.hp = 100; f.ammo = 30; draw(); });
    host.querySelector('#dm-f-gun')?.addEventListener('click', () => { f.gun = f.gun ? 0 : 1; draw(); });
    host.querySelector('#dm-f-shot')?.addEventListener('click', () => { f.ammo = f.ammo > 0 ? f.ammo - 1 : 30; draw(); });
  }
  // герой-баннер
  const hb = host.querySelector('#dm-herobox');
  const HEROES = {
    gold: ['Отличный улов!', `Скумбрия · 1,2 кг · +45 ${K.coin()}`],
    win: ['Победа!', `Ты первый · +60 ${K.coin()}`],
    lose: ['Сорвалась…', 'Леска не выдержала — попробуй ещё'],
    info: ['Волна 3', 'Держи ворота!'],
  };
  let countT = 0;
  host.querySelectorAll('[data-hero]').forEach((b) => b.addEventListener('click', () => {
    clearInterval(countT);
    const h = b.dataset.hero;
    if (h === 'count') {
      const steps = [3, 2, 1, 0];
      let i = 0;
      const show = () => {
        const k = steps[i++];
        hb.innerHTML = k ? `<div class="k-count is-tick">${k}</div>` : '<div class="k-count k-count--go is-tick">Старт!</div>';
        sfx.play(k ? 'tick' : 'level');
        if (i >= steps.length) clearInterval(countT);
      };
      show();
      countT = setInterval(show, 900);
      return;
    }
    const [t, s] = HEROES[h];
    hb.innerHTML = `<div class="k-hero k-hero--${h} is-pop"><p class="k-hero-title">${t}</p><span class="k-hero-sub">${s}</span></div>`;
    sfx.play(h === 'lose' ? 'error' : h === 'info' ? 'open' : 'reward');
  }));
  // сегменты и ползунки в демо
  host.querySelectorAll('.k-seg').forEach((seg) => seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || seg.closest('.stage-cap')) return;
    seg.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b));
  }));
  host.querySelectorAll('.k-slider').forEach((s) => s.addEventListener('input', () => {
    s.style.setProperty('--v', s.value / 100);
    const val = s.parentElement.querySelector('.k-row-val');
    if (val) val.textContent = `${s.value}%`;
  }));
  // фишки складываются в ставку
  const bet = host.querySelector('#dm-bet');
  bet?.addEventListener('click', (e) => {
    const ch = e.target.closest('[data-chip]');
    if (!ch || ch.disabled) return;
    const inp = bet.querySelector('.k-bet-input');
    inp.value = Math.min(500, (parseInt(inp.value, 10) || 0) + Number(ch.dataset.chip));
    bet.querySelectorAll('.k-chip').forEach((x) => x.classList.toggle('is-on', x === ch));
  });
  // таймер шторма тикает
  const tm = host.querySelector('#dm-timer');
  let sec = 80;
  setInterval(() => {
    sec = sec > 0 ? sec - 1 : 80;
    if (tm) {
      tm.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
      tm.classList.toggle('is-hurry', sec <= 15);
    }
  }, 1000);
}

/* ------------------------------------------------------------------ три стиля рядом (одни и те же компактные детали) */
function buildCompare() {
  const host = document.getElementById('pg-compare');
  if (!host) return;
  const NAMES = { retro2: 'Ретро-парк 2.0', beach: 'Пляжный день', dusk: 'Закат' };
  host.innerHTML = `<p class="pg-compare-h">Одни и те же детали в трёх стилях — поверх настоящей сцены, в настоящем размере</p><div class="pg-compare-row">${SKINS.map((s) => `
    <button class="pg-cmp" data-pick="${s}" aria-label="Выбрать: ${NAMES[s]}">
      <span class="pg-cmp-scene" data-skin="${s}">
        <span class="pg-cmp-top">${HUD.badge()}${HUD.tiles()}</span>
        ${HUD.event({ mode: 'fishing' })}
        ${HUD.toast('reward', 'img/icons/ui/token.webp', '+45 жетонов', 'Скумбрия ушла Деду Семёну')}
        <span class="pg-cmp-btns"><span class="k-btn k-btn--sm">Поставить<kbd class="k-key k-key--sm k-key--tr">E</kbd></span><span class="k-btn k-btn--go k-btn--sm">Ещё<kbd class="k-key k-key--sm k-key--tr">R</kbd></span><span class="k-btn k-btn--stop k-btn--sm">Хватит</span></span>
        ${HUD.prompt()}
        ${HUD.vitals({ hp: 72, ammo: 18, gren: false, dash: false })}
      </span>
      <span class="pg-cmp-name">${NAMES[s]}</span>
    </button>`).join('')}</div>`;
  host.querySelectorAll('.pg-cmp').forEach((b) => { b.classList.toggle('is-on', b.dataset.pick === document.documentElement.dataset.skin); b.addEventListener('click', () => setSkin(b.dataset.pick)); });
}

/* ------------------------------------------------------------------ общий звук кликов */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-sfx], .k-btn, .k-tab, .k-close, .k-nav-item, .k-seg > button, .k-voice');
  if (!el) return;
  if (el.closest('.stage-cap')) return; // свои звуки
  if (el.dataset.toast || el.dataset.hero || el.id === 'dm-plus') return; // у демо свои звуки
  sfx.play(el.dataset.sfx || (el.classList.contains('k-close') ? 'close' : el.classList.contains('k-tab') ? 'tick' : 'click'));
});
document.addEventListener('change', (e) => {
  if (e.target.closest('.k-switch') && e.target.id !== 'pg-sound') sfx.play('pop');
});

/* ------------------------------------------------------------------ старт */
function init() {
  setSkin(document.documentElement.dataset.skin || 'retro2', { sound: false });
  setFont(document.documentElement.dataset.font || '', { sound: false });
  document.querySelector('.pg-fonts-seg')?.addEventListener('click', (e) => { const b = e.target.closest('button[data-font]'); if (b) setFont(b.dataset.font, { sound: false }); }); // щелчок звучит сам (общий звук .k-seg)
  document.querySelectorAll('.pg-skin').forEach((b) => b.addEventListener('click', () => setSkin(b.dataset.pick)));
  const snd = document.getElementById('pg-sound');
  if (snd) {
    snd.checked = sfx.enabled;
    snd.addEventListener('change', () => { sfx.setEnabled(snd.checked); if (snd.checked) sfx.play('pop'); });
  }
  buildCompare();
  buildGrid();
  buildDetails();
  window.addEventListener('load', () => stages.forEach(fit));
  document.fonts?.ready.then(() => stages.forEach(fit));
}
init();
