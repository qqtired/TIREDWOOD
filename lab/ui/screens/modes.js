// Группа «Режимы»: картинг, регата, пейнтбол, прятки, «Выше облаков», пираты, шторм, аквапарк, крысиные бега,
// рулетка рыбака и «как есть» для столов, бильярда и Подземелья.
// Главная мысль: все режимы собраны из ОДНИХ деталей в ОДНИХ местах (карточка места, отсчёт, баннер, итоги,
// плашка события, панель бойца, окно ставки), а своё лицо режим берёт акцентом data-mode.
import { stage, section, K, sfx, pushToast } from '../page/page.js';

const host = section('modes');


/* ------------------------------------------------------------------ мелкие помощники */
const IMG = (n) => `img/modes/${n}`;
/** Иконки режимов — набор imagegen из client/assets/ui/icons (копии в img/icons/ui/). */
const IC = {
  turbo: K.icon('ui/kart-turbo.webp'), jam: K.icon('ui/kart-jam.webp'), paint: K.icon('ui/paint.webp'), bubble: K.icon('ui/kart-bubble.webp'), clap: K.icon('ui/kart-clap.webp'),
  flag: K.icon('ui/flag-finish.webp'), kart: K.icon('ui/kart.webp'), gold: K.icon('ui/medal-gold.webp'), silver: K.icon('ui/medal-silver.webp'),
  bronze: K.icon('ui/medal-bronze.webp'), heart: K.icon('ui/heart.webp'), shield: K.icon('ui/shield.webp'), pirate: K.icon('ui/pirate-flag.webp'),
  loot: K.icon('ui/loot.webp'), dinghy: K.icon('ui/boat.webp'), storm: K.icon('ui/storm.webp'), lighthouse: K.icon('ui/lighthouse.webp'),
  slide: K.icon('ui/slide.webp'), rat: K.icon('ui/rat.webp'), roulette: K.icon('ui/roulette.webp'), bell: K.icon('bell.webp'),
  box: K.icon('ui/hide-box.webp'), nuggets: K.icon('ui/gold.webp'), balls: K.icon('ui/paintballs.webp'),
  cannon: K.icon('cannon.webp'), watch: K.icon('stopwatch.webp'), lock: K.icon('lock.webp'), compass: K.icon('compass.webp'), emote: K.icon('emote.webp'), warn: K.icon('warn.webp'), boat: K.icon('boat.webp'), star: K.icon('star.png'), bag: K.icon('bag1.webp'), jelly: K.icon('jelly.webp'),
};
const img = (src, cls = 'k-ic') => `<img class="${cls}" src="${src}" alt="">`;
const coin = K.coin();
const NICK = 'Кракозябра';
const slot = (pos, html) => `<div class="k-slot k-slot--${pos}">${html}</div>`;
const esc = K.esc;

/** Бейдж игрока (ВП): один на всех режимах. */
function badge({ lvl = 12, p = 0.64, tokens = '1 250', pop = '' } = {}) {
  return `<div class="k-badge"><span class="k-ring" style="--p:${p}"><b>${lvl}</b></span>
    <span class="k-badge-body"><span class="k-badge-nick">${NICK}</span><span class="k-badge-tokens">${coin}${tokens}</span></span>
    ${pop ? `<span class="k-pop is-still">${pop}</span>` : ''}</div>`;
}
/** Чат-док (НЛ): закрытый чат с кнопкой голоса. Один и тот же во всех режимах. */
function chatDock(lines = []) {
  return slot('bl', `<div class="k-chat">
    ${lines.length ? `<div class="k-chat-list">${lines.map(([nick, cls, text]) => `<div class="k-chat-line ${cls}"><b>${nick}</b>${text}</div>`).join('')}</div>` : ''}
    <div class="k-chat-bar"><button class="k-voice" aria-label="Голос">${K.mic}<kbd class="k-key k-key--sm">V</kbd></button>
    <div class="k-chat-closed"><kbd class="k-key">Enter</kbd> Написать в чат</div></div></div>`);
}
const meter = (v, cls = '', label = '', g) => `<div class="k-meter ${cls}" style="--v:${v};--g:${g ?? v}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i>${label ? `<span class="k-meter-label">${label}</span>` : ''}</div>`;
const place = (n) => `<span class="k-place${n <= 3 ? ` k-place--${n}` : ''}">${n}</span>`;
const dot = (c) => `<i class="mo-dot" style="background:${c}"></i>`;
const bot = '<span class="k-pill k-pill--sm">бот</span>';

/** Смена «Было» под состояние: у каждого состояния свой снимок (или нет снимка — тогда переключатель скрыт). */
function setWas(api, src) {
  const fig = api.el;
  const ab = fig.querySelector('.stage-ab');
  const im = fig.querySelector('.stage-before');
  if (!ab || !im) return;
  if (src) { if (!im.src.endsWith(src)) im.src = src; ab.style.display = ''; }
  else {
    ab.style.display = 'none';
    ab.querySelector('[data-ab="after"]')?.click();
  }
}

/* ------------------------------------------------------------------ общие детали режимов (mo-*) */
/** Карточка места (ВЛ): место, круг, время — картинг и регата рисуют её одним и тем же кодом. */
function stand({ title, place: pl, total, lap, laps, time, best, own = true }) {
  return `<div class="k-plate mo-stand${own ? ' is-own' : ''}" title="${title}">
    <div class="mo-stand-main"><span class="mo-place">${pl}<small>/${total}</small></span>
      <div class="mo-stand-side"><span class="mo-lap">Круг <b>${lap}</b>/${laps}</span><span class="mo-time">${time}</span></div></div>
    ${best ? `<div class="mo-stand-foot">${img(IC.flag)}лучший <b>${best}</b></div>` : ''}</div>`;
}
/** Список гонщиков (под бейджем). rows: [место, ник, подпись, свой?, бот?] */
function racers(rows, head = '') {
  return `<div class="k-plate mo-list">${head ? `<p class="k-eyebrow">${head}</p>` : ''}${rows.map(([n, nick, side, own, isBot]) => `
    <div class="mo-row${own ? ' is-own' : ''}">${place(n)}<b>${nick}${isBot ? ` ${bot}` : ''}</b><span class="mo-row-side">${side}</span></div>`).join('')}</div>`;
}
/** Плитка под бейджем (kit .k-tile): картинка на подложке + подпись под ней. */
const tile = (icon, cap, small = '', cls = '') => `<div class="k-tiles"><div class="k-tile ${cls}"><span class="k-tile-face"><img src="${icon}" alt=""></span><span class="k-tile-cap">${cap}${small ? `<small>${small}</small>` : ''}</span></div></div>`;
/** Скорость (НП): крупное число. */
const speed = (n) => `<div class="k-plate mo-speed"><b>${n}</b><span>км/ч</span></div>`;
/** Подсказка клавиш одним рядом колпачков (показывается перед стартом, потом исчезает). */
function keyRow(items) {
  return `<div class="k-plate mo-keys">${items.map(([k, t]) => `<span class="mo-key">${k}<em>${t}</em></span>`).join('')}</div>`;
}
const kk = (k) => `<kbd class="k-key">${k}</kbd>`;
const kkm = (b) => `<span class="k-key">${K.mouse(b)}</span>`;

/** Итоговое окно: заголовок, подзаголовок, таблица (своя строка золотом), награда, кнопки. Один код для всех режимов. */
function results({ eyebrow, title, sub, head, rightFrom = 99, rows, reward = '', note = '', noteMeter, actions, size = '', lose = false, extra = '', body = '' }) {
  return `<div class="k-scrim"><section class="k-window mo-results ${size} is-in">
    <div class="k-results-head"><p class="k-eyebrow">${eyebrow}</p><h2 class="k-results-title${lose ? ' is-lose' : ''}">${title}</h2>${sub ? `<p class="k-results-sub">${sub}</p>` : ''}</div>
    <div class="k-win-body">${extra}
      ${body}<table class="k-table"${body ? ' hidden' : ''}><thead><tr>${head.map((h, i) => `<th${i >= rightFrom ? ' class="k-r"' : ''}>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr${r.own ? ' class="is-own"' : ''}>${r.cells.map((c, i) => `<td${i >= rightFrom ? ' class="k-r"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>
      ${reward ? `<div class="k-reward">${reward}</div>` : ''}
      ${note ? `<div class="mo-note">${noteMeter != null ? meter(noteMeter, 'k-meter--thin k-meter--mode') : ''}<span>${note}</span></div>` : ''}
    </div>
    <div class="k-results-actions">${actions}</div></section></div>`;
}

/* ------------------------------------------------------------------ раздел */
function groupHead(h, id, title, text) {
  const d = document.createElement('div');
  d.className = 'mo-group';
  d.id = id;
  d.innerHTML = `<h3 class="mo-group-title">${title}</h3><p class="mo-group-text">${text}</p>`;
  h.append(d);
}

function build(h) {
  intro(h);
  groupHead(h, 'modes-races', 'Гонки: картинг и регата', 'Две разные гонки, но экран один: карточка места слева, мини-карта или список гонщиков под бейджем, отсчёт и баннер по центру, бонус и скорость внизу.');
  kart(h);
  regatta(h);
  groupHead(h, 'modes-fights', 'Бой и охота: пейнтбол и прятки', 'Одна панель бойца внизу, один счёт в верхнем центре, одна таблица итогов — в пейнтболе, прятках и крепости они выглядят и работают одинаково.');
  paintball(h);
  hide(h);
  groupHead(h, 'modes-sky', '«Выше облаков»', 'Забег по башне: участок, время до золота и высотомер на тех же местах, что и в остальных режимах.');
  sky(h);
  groupHead(h, 'modes-events', 'События набережной: пираты, шторм, аквапарк', 'Любое событие — одна плашка в верхнем центре. Пираты, шторм и аквапарк больше не толпятся в одной полосе.');
  pirates(h);
  storm(h);
  aqua(h);
  groupHead(h, 'modes-bets', 'Ставки: крысиные бега и рулетка рыбака', 'Одно окно ставки с фишками, как в блэкджеке, и одна плашка раунда — вместо двух разных окон с разными палитрами.');
  rats(h);
  roulette(h);
  groupHead(h, 'modes-keep', 'Что остаётся как есть', 'Блэкджек, дурак, бильярд и «Подземелье» владелец любит — их экраны не трогаем. Меняется только общий верх: бейдж игрока справа сверху и чат-док слева снизу.');
  keep(h);
}

/** Витрина «одни и те же детали»: показать, что режимы собраны из одного набора. */
function intro(h) {
  const el = document.createElement('div');
  el.className = 'mo-same';
  const card = (icon, title, text, modes) => `<div class="k-cell mo-same-card"><img class="k-ic" src="${icon}" alt=""><div><b>${title}</b><p>${text}</p><div class="mo-same-modes">${modes.map((m) => `<span class="k-pill k-pill--sm">${m}</span>`).join('')}</div></div></div>`;
  el.innerHTML = `
    <p class="mo-same-lead">Одни и те же детали во всех режимах — вот почему игра теперь выглядит как один продукт. Акцент режима (цвет полос, значков и подписей) меняется сам.</p>
    <div class="mo-same-grid">
      ${card(IC.flag, 'Карточка места', 'Место, круг и время слева сверху', ['картинг', 'регата', '«Выше облаков»'])}
      ${card(IC.bell, 'Плашка события', 'Одна наверху по центру: заголовок, подпись, таймер, полоса', ['пираты', 'шторм', 'аквапарк', 'прятки', 'рулетка', 'бега'])}
      ${card(IC.paint, 'Панель бойца', 'Здоровье, патроны и три клавиши внизу', ['пейнтбол', 'прятки', 'крепость'])}
      ${card(IC.gold, 'Итоги', 'Своя строка золотом, награда, две кнопки с клавишами', ['картинг', 'регата', 'пейнтбол', 'прятки', 'пираты', '«Выше облаков»'])}
      ${card(IC.roulette, 'Окно ставки', 'Фишки 10 / 50 / 100 / 500, сумма, «Поставить»', ['крысиные бега', 'рулетка', 'блэкджек'])}
      ${card(IC.watch, 'Отсчёт и баннер', 'Крупные цифры и герой-надпись по центру', ['картинг', 'регата', 'пейнтбол', '«Выше облаков»'])}
    </div>`;
  h.append(el);
}

/* ================================================================== КАРТИНГ */
const KART_ITEMS = [
  { id: 'paint', ic: IC.paint, name: 'Краска', hint: 'клякса тому, кто впереди' },
  { id: 'turbo', ic: IC.turbo, name: 'Турбо', hint: 'рывок на 1,5 с' },
  { id: 'jam', ic: IC.jam, name: 'Варенье', hint: 'банка позади: наехал — закрутило' },
  { id: 'bubble', ic: IC.bubble, name: 'Пузырь', hint: '8 с защиты, смывает краску' },
  { id: 'clap', ic: IC.clap, name: 'Хлопок', hint: 'волна 8 м — всех вокруг закрутит' },
];
const TRACK_MAP = `<svg class="mo-map-svg" viewBox="0 0 260 150" aria-hidden="true">
  <path class="mo-road-edge" d="M30 28H196Q226 28 226 56V70Q226 98 196 98H150V62H112V112Q112 128 96 128H46Q30 128 30 112V98H78V70H30Z"/>
  <path class="mo-road" d="M30 28H196Q226 28 226 56V70Q226 98 196 98H150V62H112V112Q112 128 96 128H46Q30 128 30 112V98H78V70H30Z"/>
  <path class="mo-road-pad" d="M120 28H140M226 52V62M150 90V84"/>
  <g class="mo-start"><rect x="64" y="21" width="5" height="5"/><rect x="64" y="31" width="5" height="5"/><rect x="69" y="26" width="5" height="5"/></g>
  <circle cx="190" cy="28" r="5.5" fill="#4a63ff"/><circle cx="104" cy="28" r="5.5" fill="#3ddc97"/><circle cx="226" cy="64" r="5.5" fill="#ffd23f"/>
  <circle cx="112" cy="96" r="5.5" fill="#c77dff"/><circle cx="62" cy="128" r="5.5" fill="#4cc9f0"/>
  <circle class="mo-me" cx="150" cy="78" r="8"/></svg>`;

function kart(h) {
  let itemIdx = 0;
  const RES = [
    ['1', 'Паша', '#4a63ff', '1:52,4', '0:36,2', '+60'],
    ['2', NICK, '#ff6b5b', '1:54,1', '0:36,8', '+40', true],
    ['3', 'Бочка', '#3ddc97', '1:57,9', '0:37,5', '+25'],
    ['4', 'Сухарик', '#ffd23f', '2:01,3', '0:38,9', '+15'],
    ['5', 'Лазурь', '#4cc9f0', '2:03,0', '0:39,4', '', false, true],
    ['6', 'Бриз', '#c77dff', 'не доехал', '—', '', false, true],
  ];
  stage(h, {
    id: 'kart', mode: 'race', bg: IMG('kart-driving.jpg'),
    title: 'Картинг: заезд',
    note: 'Место, круг и время теперь одной карточкой слева, мини-карта — под твоим бейджем, бонус — внизу по центру с видимой клавишей и названием. Нажми на бонус, чтобы выпал другой.',
    before: IMG('was-35-kart-driving.jpg'),
    states: [
      { id: 'race', label: 'Едем' }, { id: 'drift', label: 'Занос' }, { id: 'count', label: 'Отсчёт' },
      { id: 'last', label: 'Последний круг' }, { id: 'result', label: 'Итоги' },
    ],
    render(scene, st, api) {
      setWas(api, st === 'count' ? IMG('was-35-kart-hud.jpg') : st === 'result' ? null : IMG('was-35-kart-driving.jpg'));
      api.el.querySelector('.stage-bg').style.backgroundImage = `url('${st === 'count' ? IMG('kart-race.jpg') : IMG('kart-driving.jpg')}')`;
      const it = KART_ITEMS[itemIdx % KART_ITEMS.length];
      const count = st === 'count';
      const lastLap = st === 'last';
      let html = '';
      html += slot('tl', stand({ title: 'Портовое кольцо', place: count ? 4 : lastLap ? 2 : 4, total: 6, lap: count ? 1 : lastLap ? 3 : 1, laps: 3, time: count ? '0:00.0' : lastLap ? '1:21.7' : '0:21.0', best: lastLap ? '0:36,8' : '' }));
      html += slot('tr', badge() + `<div class="k-plate mo-map">${TRACK_MAP}</div>`);
      html += chatDock();
      html += slot('br', speed(count ? 0 : 79));
      if (count) {
        html += `<div class="k-slot k-slot--c"><div class="k-count is-tick">3</div></div>`;
        html += slot('bc', keyRow([[kk('W'), 'газ'], [kk('S'), 'тормоз'], [`${kk('A')}${kk('D')}`, 'руль'], [kk('Space'), 'занос'], [kk('R'), 'на трассу']]) + `<button class="k-plate mo-item is-empty" type="button"><span class="mo-item-ic">${img(IC.kart, 'mo-ghost')}</span><span class="mo-item-txt"><b>Пока пусто</b><small>проедь через ящик — бонус</small></span></button>`);
      } else {
        if (lastLap) html += `<div class="k-slot k-slot--c"><div class="k-hero k-hero--gold is-pop"><p class="k-hero-title is-sm">Последний круг!</p></div></div>`;
        const charge = st === 'drift' ? `<div class="mo-charge">${meter(0.5, 'k-meter--info k-meter--lg', 'Синее — можно отпускать')}<i class="mo-tick" style="left:33%"></i><i class="mo-tick" style="left:66%"></i></div>` : '';
        html += slot('bc', `${charge}<button class="k-plate mo-item is-ready" type="button" data-sfx="pop"><span class="mo-item-ic">${img(it.ic, 'mo-ic')}</span><span class="mo-item-txt"><b>${it.name}</b><small>${it.hint}</small></span><span class="mo-item-keys"><span class="k-keys">${kk('E')}${kkm('l')}</span></span></button>`);
      }
      if (st === 'result') {
        html += results({
          eyebrow: 'Картинг · Портовое кольцо · 3 круга', title: '2-е место', sub: 'Лучший круг 0:36,8 — твой рекорд на этой трассе',
          head: ['', 'Гонщик', 'Время', 'Лучший круг', coin], rightFrom: 2,
          rows: RES.map(([n, nick, c, t, b, tk, own, isBot]) => ({ own, cells: [place(+n), `<span class="k-who">${dot(c)}${nick}${isBot ? bot : ''}</span>`, t, b, tk || '—'] })),
          reward: `${coin}<b>+40</b> жетонов за второе место`,
          note: 'На набережную через 8 с', noteMeter: 0.8,
          actions: `<button class="k-btn k-btn--go">На набережную<kbd class="k-key k-key--tr">Esc</kbd></button>`,
        });
      }
      scene.innerHTML = html;
      scene.querySelector('.mo-item.is-ready')?.addEventListener('click', () => { itemIdx++; api.render(); });
      if (st === 'drift') requestAnimationFrame(() => scene.querySelector('.mo-charge .k-meter')?.style.setProperty('--v', 0.5));
    },
  });
}

/* ================================================================== РЕГАТА */
function regatta(h) {
  stage(h, {
    id: 'regatta', mode: 'regatta', bg: IMG('plaza-pier-regatta.jpg'),
    title: 'Регата: тот же набор деталей',
    note: 'Регата повторяет картинг деталь в деталь: та же карточка места, тот же отсчёт, те же итоги. Меняются только акцент (морская лазурь), список гонщиков вместо мини-карты и кнопка «Ещё заезд» — теперь с клавишей E на ней.',
    before: IMG('was-28d-regatta-racing-2.jpg'),
    states: [{ id: 'race', label: 'Заезд' }, { id: 'count', label: 'Отсчёт' }, { id: 'wrong', label: 'Не туда' }, { id: 'result', label: 'Итоги' }],
    render(scene, st, api) {
      setWas(api, st === 'count' ? IMG('was-28c-regatta-racing-1.jpg') : st === 'result' ? null : IMG('was-28d-regatta-racing-2.jpg'));
      const count = st === 'count';
      let html = '';
      html += slot('tl', stand({ title: 'Портовая регата', place: count ? 3 : 3, total: 5, lap: count ? 1 : 2, laps: 3, time: count ? '0:00.00' : '1:12.40', best: count ? '' : '0:34,95' }));
      html += slot('tr', badge() + racers([[1, 'Лазурь', '2/3', false, true], [2, 'Бриз', '2/3', false, true], [3, NICK, '2/3', true], [4, 'Прибой', '1/3', false, true], [5, 'Паша', '1/3']]));
      html += chatDock();
      html += slot('br', speed(count ? 0 : 54));
      if (count) {
        html += `<div class="k-slot k-slot--c"><div class="k-count is-tick">2</div></div>`;
        html += slot('bc', keyRow([[kk('W'), 'газ'], [kk('S'), 'тормоз'], [`${kk('A')}${kk('D')}`, 'руль'], [`${kk('Shift')}`, 'занос'], [kk('R'), 'к воротам']]));
      } else if (st === 'wrong') {
        html += `<div class="k-slot k-slot--c"><div class="k-hero k-hero--lose is-pop"><p class="k-hero-title is-sm">Не туда!</p><span class="k-hero-sub">Разворачивайся</span></div></div>`;
        html += slot('bc', keyRow([[kk('W'), 'газ'], [kk('S'), 'тормоз'], [`${kk('A')}${kk('D')}`, 'руль'], [kk('R'), 'к воротам']]));
      } else if (st === 'race') {
        html += slot('tc', `<div class="k-toasts"><div class="k-toast k-toast--good"><span class="k-toast-ic">${img(IC.flag, '')}</span><div class="k-toast-title">Жёлтые флажки — ускорение!</div><div class="k-toast-sub">Проходи между ними</div></div></div>`);
        html += slot('bc', keyRow([[kk('W'), 'газ'], [kk('S'), 'тормоз'], [`${kk('A')}${kk('D')}`, 'руль'], [kk('Shift'), 'занос'], [kk('R'), 'к воротам']]));
      }
      if (st === 'result') {
        html += results({
          eyebrow: 'Портовая регата · 3 круга', title: '3-е место', sub: 'Лучший круг 0:34,95',
          head: ['', 'Гонщик', 'Время', 'Лучший круг'], rightFrom: 2,
          rows: [
            { cells: [place(1), `Лазурь ${bot}`, '1:46,21', '0:34,10'] },
            { cells: [place(2), `Бриз ${bot}`, '1:48,07', '0:34,62'] },
            { own: true, cells: [place(3), NICK, '1:50,88', '0:34,95'] },
            { cells: [place(4), `Паша <span class="k-pill k-pill--good k-pill--sm">ещё!</span>`, '1:57,40', '0:36,31'] },
            { cells: [place(5), `Прибой ${bot}`, 'не доехал', '—'] },
          ],
          reward: `${coin}<b>+25</b> жетонов`,
          note: 'Ты в деле! Новый заезд через 4 с', noteMeter: 0.55,
          actions: `<button class="k-btn k-btn--go">Ещё заезд<kbd class="k-key k-key--tr">E</kbd></button><button class="k-btn k-btn--ghost">На площадь<kbd class="k-key k-key--tr">Esc</kbd></button>`,
        });
      }
      scene.innerHTML = html;
    },
  });
}


/* ================================================================== ПЕЙНТБОЛ */
/** Счёт команд (ВЦ): две команды и часы в одной плашке. Цвета команд — как в игре (shared/constants.ts). */
function scorePlate(a, b, phase, time, limit = 50) {
  return `<div class="k-plate mo-score">
    <div class="mo-team mo-t0"><div class="mo-team-top"><span class="mo-team-name">Черника</span><b>${a}</b></div>${meter(a / limit, 'k-meter--thin')}</div>
    <div class="mo-clock"><small>${phase}</small><b>${time}</b></div>
    <div class="mo-team mo-t1 is-right"><div class="mo-team-top"><b>${b}</b><span class="mo-team-name">Мандарин</span></div>${meter(b / limit, 'k-meter--thin')}</div></div>`;
}
const feedLine = (k, kt, v, vt, icon, own = false) => `<div class="k-plate mo-feed-line${own ? ' is-own' : ''}"><b class="mo-name t${kt}">${k}</b>${img(icon)}<b class="mo-name t${vt}">${v}</b></div>`;
const bars = (v, cls = '') => `<div class="k-meter ${cls}" style="--v:${v};--g:${v}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></div>`;

function paintball(h) {
  const T0 = [['Пудинг', 18, 14, 6], [NICK, 17, 15, 9, true], ['Мармелад', 15, 14, 5]];
  const T1 = [['Холодец', 16, 17, 4], ['Суфле', 15, 19, 3], ['Кисель', 12, 14, 2]];
  const teamTable = (name, t, rows, sc) => `<div class="mo-board-team t${t}"><div class="mo-board-head"><span class="mo-name t${t}">${name}</span><b>${sc}</b></div>
    <table class="k-table"><thead><tr><th>Игрок</th><th class="k-r">У</th><th class="k-r">С</th><th class="k-r">П</th></tr></thead><tbody>
    ${rows.map(([n, k, d, a, own]) => `<tr${own ? ' class="is-own"' : ''}><td><span class="k-who">${n}</span></td><td class="k-r">${k}</td><td class="k-r">${d}</td><td class="k-r">${a}</td></tr>`).join('')}</tbody></table></div>`;
  stage(h, {
    id: 'pb', mode: 'paintball', bg: IMG('paintball.jpg'),
    title: 'Пейнтбол: бой',
    note: 'Счёт обеих команд и время — маленькой плашкой сверху (≈260 px вместо 520). Здоровье со щитом, оружие, патроны и рывок — отдельными блоками внизу, как в крепости. Лента убийств — мелкими строками слева, бонус автомата — плиткой под бейджем.',
    before: IMG('was-30-paintball-battle.jpg'),
    states: [{ id: 'fight', label: 'Бой' }, { id: 'hit', label: 'Тебя залили' }, { id: 'board', label: 'Таблица (Tab)' }, { id: 'end', label: 'Итоги' }],
    render(scene, st, api) {
      const down = st === 'hit';
      let html = '';
      html += slot('tc', scorePlate(st === 'end' ? 50 : 5, st === 'end' ? 43 : 6, st === 'end' ? 'Конец' : 'Бой', st === 'end' ? '0:00' : '4:42') +
        (st === 'fight' ? `<div class="k-toasts"><div class="k-toast"><span class="k-toast-ic">${img(IC.paint, '')}</span><div class="k-toast-title">Мармелад разошёлся</div><div class="k-toast-sub">3 подряд — выбей его</div></div></div>` : ''));
      html += slot('tl', `<div class="mo-feed">${feedLine('Пудинг', 0, 'Холодец', 1, IC.paint)}${feedLine(NICK, 0, 'Зефир', 1, IC.paint, true)}${feedLine('Суфле', 1, 'Мармелад', 0, IC.paint)}</div>`);
      html += slot('tr', badge() + tile(IC.star, '+5 HP', '+25 щит · +9 %'));
      html += chatDock();
      html += slot('bc', `<div class="k-vitals${down ? ' is-down' : ''}">
        <div class="k-vitals-hp"><div class="k-vitals-row"><img class="k-vitals-ic" src="${IC.heart}" alt=""><b class="k-vitals-num">${down ? 0 : 105}</b></div>
          ${bars(down ? 0 : 1, 'k-meter--bad')}
          <div class="k-vitals-row mo-armor"><img class="k-vitals-ic" src="${IC.shield}" alt=""><span class="k-vitals-cap">щит ${down ? 0 : 25}</span>${bars(down ? 0 : 0.25, 'k-meter--thin k-meter--info')}</div></div>
        <div class="k-vitals-arms"><div class="k-arm is-on"><img src="${IC.balls}" alt=""><span>Маркер</span><kbd class="k-key k-key--sm k-key--tr">1</kbd></div><div class="k-arm is-off"><img src="${IC.cannon}" alt=""><span>AWP</span><kbd class="k-key k-key--sm k-key--tr">2</kbd></div></div>
        <div class="k-vitals-ammo"><div class="k-vitals-row"><kbd class="k-key k-key--sm">R</kbd><b class="k-vitals-num">30<small>/ 30</small></b></div>${bars(1, 'k-meter--thin')}</div>
        <div class="k-vitals-dash"><kbd class="k-key k-key--sm">Shift</kbd><span class="k-vitals-cap">рывок</span>${bars(1, 'k-meter--info')}</div></div>`);
      if (st === 'fight') html += `<div class="k-cross"><i></i><i></i><i></i><i></i></div>`;
      if (down) html += `<div class="k-slot k-slot--c"><div class="k-hero k-hero--lose is-pop"><p class="k-hero-title is-sm">Тебя залили краской!</p><span class="k-hero-sub">Попал <b class="mo-name t1">Холодец</b> · в бой через 2,4 с</span></div></div>`;
      if (st === 'board') {
        html += `<div class="k-scrim"><section class="k-window k-window--lg mo-board is-in">
          <header class="k-win-head"><span class="k-win-portrait">${img(IC.balls, '')}</span><div class="k-win-titles"><p class="k-eyebrow">Пейнтбол · Склад</p><h2 class="k-win-title">Таблица боя</h2></div>
          <div class="k-win-tools"><span class="k-pill k-pill--lg">${img(IC.watch)}4:42</span></div></header>
          <div class="k-win-body mo-board-grid">${teamTable('Черника', 0, [['Пудинг', 3, 2, 1], [NICK, 2, 3, 2, true], ['Мармелад', 0, 1, 0]], 5)}${teamTable('Мандарин', 1, [['Холодец', 3, 2, 0], ['Суфле', 2, 1, 1], ['Кисель', 1, 2, 0]], 6)}</div>
          <footer class="k-win-foot"><span class="k-note">У — убил · С — сбит · П — помог</span><span class="k-note">Отпусти ${kk('Tab')} — вернуться в бой</span></footer></section></div>`;
      }
      if (st === 'end') {
        html += results({
          eyebrow: 'Пейнтбол · Склад', title: 'Победа!', sub: 'Побеждает «Черника» · <b class="mo-name t0">50</b> : <b class="mo-name t1">43</b>',
          head: [], rows: [], size: 'k-window--lg',
          extra: `<div class="mo-mvp"><span class="k-pill k-pill--gold">${img(IC.star)}Лучший игрок: <b>Пудинг</b> — 18 / 14</span></div>`,
          body: `<div class="mo-board-grid">${teamTable('Черника', 0, T0, 50)}${teamTable('Мандарин', 1, T1, 43)}</div>`,
          reward: `${coin}<b>+45</b> жетонов за победу`,
          note: 'Новый раунд начнётся сам через 8 с', noteMeter: 0.7,
          actions: `<button class="k-btn k-btn--ghost">На набережную<kbd class="k-key k-key--tr">Esc</kbd></button>`,
        });
      }
      scene.innerHTML = html;
    },
  });
}

/* ================================================================== ПРЯТКИ */
function hide(h) {
  stage(h, {
    id: 'hide', mode: 'hide', bg: IMG('hide.jpg'),
    title: 'Прятки: «Рыбный двор»',
    note: 'Роль — маленькой плашкой слева сверху, раунд и таймер — одной строкой по центру. Внизу — те же отдельные блоки, что в пейнтболе: у предмета клякс до поимки и три умения с подписями и клавишами, у ловца — бак краски. Подсказка «ЛКМ — стать» — над ними.',
    before: IMG('was-36-hide-hud.jpg'),
    states: [{ id: 'prop', label: 'Ты — предмет' }, { id: 'hunter', label: 'Ты — ловец' }, { id: 'final', label: 'Итоги матча' }],
    render(scene, st, api) {
      setWas(api, st === 'final' ? null : IMG('was-36-hide-hud.jpg'));
      const prop = st === 'prop';
      let html = '';
      html += slot('tc', `<div class="k-event">
        <span class="k-event-ic">${img(IC.box, '')}</span><div class="k-event-title">${st === 'final' ? 'Матч окончен' : 'Раунд 2 из 3'}</div>
        <div class="k-event-sub">${st === 'final' ? 'Новый матч через 10 с' : prop ? 'Ловцы ищут: прячутся 4 из 5' : 'Прячутся: 4 из 5'}</div>
        ${st === 'final' ? '' : `<div class="k-event-timer">1:12</div>${meter(0.72, 'k-meter--thin k-meter--mode')}`}</div>`);
      html += slot('tl', `<div class="k-plate mo-role"><span class="mo-role-ic">${img(prop ? IC.box : IC.balls, '')}</span><div><b>${prop ? 'Ты — бочка' : 'Ты — ловец'}</b>
        <small>${prop ? '2 кляксы — и ты пойман' : 'крась подозрительное'}</small></div></div>
        <div class="mo-feed"><div class="k-plate mo-feed-line">Паша стал горшком с цветком</div><div class="k-plate mo-feed-line is-big">Ловец нашёл ведро</div></div>`);
      html += slot('tr', badge());
      html += chatDock();
      if (st !== 'final') {
        const hit = prop ? `<div class="k-prompt mo-noshrink">${kkm('l')}Стать: ведро<span class="k-prompt-sep"></span><span class="k-prompt-note">быстрое, 1 клякса</span></div>` : '';
        html += slot('bc', `${hit}<div class="k-vitals">
          <div class="k-vitals-hp">${prop
            ? `<div class="k-vitals-row"><img class="k-vitals-ic" src="${IC.paint}" alt=""><b class="k-vitals-num">2<small>клякс</small></b></div>${bars(1, 'k-meter--bad')}<span class="k-vitals-cap">до поимки</span>`
            : `<div class="k-vitals-row"><img class="k-vitals-ic" src="${IC.paint}" alt=""><b class="k-vitals-num">74<small>/ 100</small></b></div>${bars(0.74, 'k-meter--mode')}`}</div>
          <div class="k-vitals-arms${prop ? ' mo-acts3' : ''}">${prop
            ? `<div class="k-arm k-arm--label"><img src="${IC.lock}" alt=""><span>Замри</span><kbd class="k-key k-key--sm k-key--tr">F</kbd></div><div class="k-arm k-arm--label"><img src="${IC.compass}" alt=""><span>Поверни</span><kbd class="k-key k-key--sm k-key--tr">R</kbd></div><div class="k-arm k-arm--label"><img src="${IC.emote}" alt=""><span>Дразни</span><kbd class="k-key k-key--sm k-key--tr">Z</kbd></div>`
            : `<div class="k-arm is-on"><img src="${IC.balls}" alt=""><span>Краска</span>${kkm('l').replace('class="k-key"', 'class="k-key k-key--sm k-key--tr"')}</div>`}</div>
          <div class="k-vitals-ammo">${prop
            ? `<span class="k-vitals-cap">вздрогнешь через</span><div class="k-vitals-row"><b class="k-vitals-num">12<small>с</small></b></div>${bars(0.4, 'k-meter--thin')}`
            : `<span class="k-vitals-cap">мимо −20 · попал +30</span><div class="k-vitals-row"><b class="k-vitals-num">100<small>%</small></b></div>${bars(1, 'k-meter--thin')}`}</div></div>`);
        html += `<div class="k-cross"><i></i><i></i><i></i><i></i></div>`;
      } else {
        html += results({
          eyebrow: 'Прятки · Рыбный двор · 3 раунда', title: 'Итоги матча', sub: 'Раунд 3: ловцы нашли всех — Паша поймал четверых',
          head: ['', 'Игрок', 'За матч', coin], rightFrom: 2,
          rows: [
            { cells: [place(1), 'Паша', '94 очка', '+30'] },
            { own: true, cells: [place(2), NICK, '81 очко', '+20'] },
            { cells: [place(3), 'Бочка', '66 очков', '+12'] },
            { cells: [place(4), 'Сухарик', '40 очков', '+5'] },
          ],
          note: 'Новый матч через 10 с', noteMeter: 0.9,
          actions: `<button class="k-btn k-btn--ghost">На набережную<kbd class="k-key k-key--tr">Esc</kbd></button>`,
        });
      }
      scene.innerHTML = html;
    },
  });
}

/* ================================================================== ВЫШЕ ОБЛАКОВ */
function sky(h) {
  const marks = [['Паша', 0.74], ['Бочка', 0.5], [NICK, 0.42, true], ['Сухарик', 0.2]];
  stage(h, {
    id: 'sky', mode: 'skill', bg: IMG('skill.jpg'),
    title: '«Выше облаков»: подъём по каланче',
    note: 'Участок и его правило — слева сверху, время и «до золота» — плашкой события, высотомер — справа внизу. Кнопки «К точке» и «Сначала» стали клавишами на кнопках внизу, а не словами в подписи.',
    before: IMG('was-37-skill-hud.jpg'),
    states: [{ id: 'count', label: 'Отсчёт' }, { id: 'run', label: 'Подъём' }, { id: 'finish', label: 'Колокол' }],
    render(scene, st, api) {
      setWas(api, st === 'finish' ? null : IMG('was-37-skill-hud.jpg'));
      const run = st === 'run';
      let html = '';
      html += slot('tl', `<div class="k-plate mo-sec"><p class="k-eyebrow">Участок ${run ? 4 : 1} из 10</p><b class="mo-sec-name">${run ? 'Поршни' : 'Крыша'}</b>
        <p class="mo-sec-rule">${run ? 'таран отъехал — сейчас ударит' : 'разбег и прыжок · гриб подбросит'}</p></div>`);
      html += slot('tc', `<div class="k-event"><span class="k-event-ic">${img(IC.gold, '')}</span><div class="k-event-title">Золото — до 2:00</div>
        <div class="k-event-sub">${run ? 'Рекорд 2:31 · падений 1' : 'Рекорд 2:31'}</div><div class="k-event-timer">${run ? '1:12.40' : '0:00.00'}</div>${meter(run ? 0.6 : 0, 'k-meter--thin k-meter--mode')}</div>`);
      html += slot('tr', badge());
      html += chatDock();
      html += slot('br', `<div class="k-plate mo-alt"><img class="k-ic" src="${IC.bell}" alt=""><div class="mo-alt-track"><i class="mo-alt-fill" style="height:${run ? 42 : 4}%"></i>
        ${marks.map(([n, v, own]) => `<span class="mo-alt-mark${own ? ' is-own' : ''}" style="bottom:${run ? v * 100 : 4}%">${n}</span>`).join('')}</div><b class="mo-alt-place">${run ? '3 / 4' : '—'}</b></div>`);
      html += slot('bc', st === 'count'
        ? keyRow([[`${kk('W')}${kk('A')}${kk('S')}${kk('D')}`, 'бег'], [kk('Space'), 'прыжок'], [kk('Shift'), 'рывок']])
        : `<div class="mo-acts"><button class="k-btn k-btn--ghost k-btn--sm">К точке<kbd class="k-key k-key--sm k-key--tr">R</kbd></button><button class="k-btn k-btn--ghost k-btn--sm">Сначала<kbd class="k-key k-key--sm k-key--tr">N</kbd></button></div>`);
      if (st === 'count') html += `<div class="k-slot k-slot--c"><div class="k-count is-tick">3</div></div>`;
      if (st === 'finish') {
        html += results({
          eyebrow: 'Выше облаков · Небесная каланча', title: '2-е место!', sub: 'Без единого падения · новый личный рекорд!',
          head: ['', 'Игрок', 'Время', 'Медаль'], rightFrom: 2,
          rows: [
            { cells: [place(1), 'Паша', '1:51.30', `${img(IC.gold, 'mo-med')}Золото`] },
            { own: true, cells: [place(2), NICK, '1:58.20', `${img(IC.gold, 'mo-med')}Золото`] },
            { cells: [place(3), 'Бочка', '2:40.05', `${img(IC.silver, 'mo-med')}Серебро`] },
            { cells: [place(4), 'Сухарик', 'не успел', '—'] },
          ],
          reward: `${coin}<b>+120</b> жетонов`,
          extra: `<div class="mo-chips"><span class="k-pill k-pill--gold">${img(IC.gold)}медаль «Золото» +80</span><span class="k-pill k-pill--good">значок «Без падений» +30</span><span class="k-pill">первый подъём дня +10</span></div>`,
          note: 'Табличка закроется через 9 с', noteMeter: 0.75,
          actions: `<button class="k-btn k-btn--go">Ещё забег<kbd class="k-key k-key--tr">E</kbd></button><button class="k-btn k-btn--ghost">На набережную<kbd class="k-key k-key--tr">Esc</kbd></button>`,
        });
      }
      scene.innerHTML = html;
    },
  });
}

/* ================================================================== ПИРАТЫ */
const edge = (tone, x, y, a, side, ic, text, extra = '') => `<div class="k-edge k-edge--${tone} k-edge--${side}${extra}" style="left:${x}px;top:${y}px;--a:${a}deg"><span class="k-edge-disc"><img src="${ic}" alt=""></span><span class="k-edge-label">${text}</span></div>`;

function pirates(h) {
  stage(h, {
    id: 'pirates', mode: 'pirates', bg: IMG('pier-sun.jpg'),
    title: 'Пираты: набег',
    note: 'Пираты, шторм и аквапарк теперь делят одну плашку события сверху по центру — раньше три их плашки лезли друг на друга. Стрелки к угрозам у края — те же, что в крепости, с иконкой и метрами. Украденные ящики — плиткой под бейджем.',
    states: [{ id: 'warn', label: 'Пираты на горизонте' }, { id: 'raid', label: 'Набег' }, { id: 'result', label: 'Итоги' }],
    render(scene, st, api) {
      let html = '';
      if (st === 'warn') {
        html += slot('tc', `<div class="k-event k-event--danger k-lamp"><span class="k-event-ic">${img(IC.pirate, '')}</span><div class="k-event-title">Пираты на горизонте!</div><div class="k-event-sub">высадка через 24 с — к причалу</div><div class="k-event-timer is-hurry">0:24</div>${meter(0.8, 'k-meter--thin k-meter--bad')}</div>`);
        html += slot('tr', badge());
        html += slot('bc', `<div class="k-plate mo-tasks">
          <div class="mo-task"><span class="k-key">${K.mouse('l')}</span><span><b>Крась воров</b> с ящиками</span></div>
          <div class="mo-task"><span class="k-key k-key--wide">пушка ${K.mouse('l')}</span><span><b>Ядром</b> по шлюпкам</span></div>
          <div class="mo-task"><span class="k-key">${img(IC.loot, 'mo-task-ic')}</span><span><b>Коснись ящика</b> — спасёшь</span></div></div>`);
      } else if (st === 'raid') {
        html += slot('tc', `<div class="k-event k-event--danger"><span class="k-event-ic">${img(IC.pirate, '')}</span><div class="k-event-title">Волна 2 из 4</div><div class="k-event-sub">шлюпки к причалам · корабль <b>60 %</b></div><div class="k-event-timer">2:41</div>${meter(0.6, 'k-meter--thin k-meter--bad')}</div>`);
        html += slot('tr', badge() + tile(IC.loot, 'украли 3/6', '9 на причале', 'k-tile--warn'));
        html += slot('bc', `<div class="k-prompt mo-noshrink">${kkm('l')}Крась воров<span class="k-prompt-sep"></span><span class="k-prompt-note">у пушки — ядром</span></div>`);
        html += `<div class="k-cross"><i></i><i></i><i></i><i></i></div>`;
        html += edge('bad', 40, 410, 180, 'left', IC.pirate, 'вор с ящиком · <b>14 м</b>', ' is-hot');
        html += edge('info', 1400, 330, 0, 'right', IC.dinghy, 'шлюпка · <b>31 м</b>');
        html += edge('bad', 1400, 560, 0, 'right', IC.pirate, 'капитан · <b>22 м</b>', ' k-edge--lg');
        html += edge('gold', 40, 640, 180, 'left', IC.loot, 'ящик · <b>9 м</b>');
      }
      html += chatDock();
      if (st === 'result') {
        html += results({
          eyebrow: 'Набег пиратов', title: 'Набег отбит!', sub: 'Украдено 2 из 12. Корабль уходит ни с чем.',
          head: ['Защитник', 'Пираты', 'Шлюпки', 'Попадания', 'Ящики', coin], rightFrom: 1,
          rows: [
            { cells: ['Паша', '6', '2', '14', '1', '+20'] },
            { own: true, cells: [`${NICK} <span class="k-pill k-pill--gold k-pill--sm">лучший защитник</span>`, '9', '3', '21', '2', '+25'] },
            { cells: ['Бочка', '4', '1', '9', '0', '+12'] },
          ],
          reward: `${coin}<b>+25</b> жетонов · лучший защитник`,
          note: 'Табличка закроется через 14 с', noteMeter: 0.9,
          actions: `<button class="k-btn">Закрыть<kbd class="k-key k-key--tr">Esc</kbd></button>`,
        });
      }
      scene.innerHTML = html;
    },
  });
}

/* ================================================================== ШТОРМ */
function storm(h) {
  stage(h, {
    id: 'storm', mode: 'skill', bg: 'img/bg-plaza-wide.jpg',
    title: 'Шторм: зажги маяк',
    note: 'Раньше шторм рисовался отдельной тёмно-синей плашкой без своего файла стилей. Теперь это та же плашка события, что у пиратов, а подсказка у двери маяка — обычная плашка действия с клавишей E.',
    states: [{ id: 'warn', label: 'Шторм на подходе' }, { id: 'storm', label: 'Зажги маяк' }, { id: 'calm', label: 'Шторм стих' }],
    render(scene, st, api) {
      let html = '';
      if (st === 'warn') {
        html += slot('tc', `<div class="k-event k-lamp"><span class="k-event-ic">${img(IC.storm, '')}</span><div class="k-event-title">Шторм на подходе</div><div class="k-event-sub">иди к маяку: погаснет свет — E у двери</div><div class="k-event-timer">0:45</div>${meter(0.25, 'k-meter--thin k-meter--mode')}</div>`);
        html += slot('bc', `<div class="k-prompt k-prompt--off mo-noshrink">${kk('E')}Зажечь маяк<span class="k-prompt-sep"></span><span class="k-prompt-note">погаснет через 12 с</span></div>`);
      } else if (st === 'storm') {
        html += slot('tc', `<div class="k-event k-event--danger"><span class="k-event-ic">${img(IC.storm, '')}</span><div class="k-event-title">Зажги маяк</div><div class="k-event-sub">волна каждые 6 с · на площади безопасно</div><div class="k-event-timer">1:12</div>${meter(0.4, 'k-meter--thin k-meter--bad')}
          </div><div class="k-toasts"><div class="k-toast k-toast--warn"><span class="k-toast-ic">${img(IC.warn, '')}</span><div class="k-toast-title">Пена!</div><div class="k-toast-sub">через 3 с волна — прыгай или уйди</div></div></div>`);
        html += slot('bc', `<div class="k-prompt mo-noshrink">${kk('E')}Зажечь маяк<span class="k-prompt-sep"></span><span class="k-pill k-pill--gold k-pill--sm">${coin}30 первому</span></div>`);
      } else {
        html += slot('tc', `<div class="k-event k-event--good"><span class="k-event-ic">${img(IC.lighthouse, '')}</span><div class="k-event-title">Шторм стих</div><div class="k-event-sub">Первый: Паша · ещё 8 с на финиш</div></div>
          <div class="k-toasts"><div class="k-toast k-toast--reward"><span class="k-toast-ic">${img(IC.lighthouse, '')}</span><div class="k-toast-title">Ты третий: +15 жетонов</div><div class="k-toast-sub">1. Паша +30 · 2. Бочка +20 · 3. ${NICK} +15</div></div></div>`);
      }
      html += slot('tr', badge({ pop: st === 'calm' ? '+15' : '' }));
      html += chatDock();
      scene.innerHTML = html;
    },
  });
}

/* ================================================================== АКВАПАРК */
function aqua(h) {
  stage(h, {
    id: 'aqua', mode: 'regatta', bg: IMG('pier-fishing.jpg'),
    title: 'Аквапарк «Волна»: секундомер',
    note: 'Сине-коричневая плашка с секундомером стала тем же событием сверху по центру: время крупно справа, рекорд полосы под заголовком. На финише плашка получает рамку-«рекорд» (в «Ретро» — лампочки).',
    states: [{ id: 'hint', label: 'На мостике' }, { id: 'run', label: 'Заплыв' }, { id: 'done', label: 'Финиш' }],
    render(scene, st, api) {
      let html = '';
      if (st === 'run') html += slot('tc', `<div class="k-event"><span class="k-event-ic">${img(IC.slide, '')}</span><div class="k-event-title">Аквапарк «Волна»</div><div class="k-event-sub">рекорд 0:48,2 · упал — снова на мостик</div><div class="k-event-timer">0:23,4</div></div>`);
      if (st === 'done') html += slot('tc', `<div class="k-event k-event--good k-lamp"><span class="k-event-ic">${img(IC.flag, '')}</span><div class="k-event-title">Финиш!</div><div class="k-event-sub">рекорд полосы — на 1,3 с быстрее</div><div class="k-event-timer">0:46,9</div></div>
        <div class="k-toasts"><div class="k-toast k-toast--reward"><span class="k-toast-ic">${img(IC.watch, '')}</span><div class="k-toast-title">Твой рекорд: 0:46,9</div><div class="k-toast-sub">доска рекордов у мостика обновилась</div></div></div>`);
      if (st === 'hint') html += slot('bc', `<div class="k-prompt mo-noshrink">${img(IC.slide)}С мостика на запад — пойдёт время<span class="k-prompt-sep"></span><span class="k-pill k-pill--gold k-pill--sm">${img(IC.watch)}рекорд 0:48,2</span></div>`);
      html += slot('tr', badge({ pop: st === 'done' ? '+10' : '' }));
      html += chatDock();
      scene.innerHTML = html;
    },
  });
}

/* ================================================================== КРЫСИНЫЕ БЕГА */
const RATS = [
  { name: 'Пуля', sd: '#d64541', trait: 'рвёт со старта, к финишу выдыхается', x: 5, who: 'Паша 50' },
  { name: 'Соня', sd: '#3f7fd8', trait: 'медленно, но упорно — сильный финиш', x: 3, who: '' },
  { name: 'Барон', sd: '#e8b923', trait: 'старый чемпион, бежит ровно', x: 4, who: 'Бочка 30' },
  { name: 'Шнырь', sd: '#3fa65a', trait: 'петляет по дорожке, но шустрый', x: 12, who: '' },
  { name: 'Кексик', sd: '#8e5bd0', trait: 'толстый и вечно голодный — может отвлечься на крошку', x: 25, who: '' },
  { name: 'Ириска', sd: '#f08a2c', trait: 'бежит рывками: то стоит, то летит', x: 7, who: '' },
];
const chance = (x) => `${Math.round((2100 / x / 2204) * 100)}%`;
const saddle = (i) => `<span class="mo-saddle" style="--sd:${RATS[i].sd}">${i + 1}</span>`;
function ratList(order, { places = false, mine = 0, lead = -1 }) {
  return `<div class="k-plate mo-list mo-ratlist${places ? ' has-places' : ''}">${order.map((i, k) => `<div class="mo-row${i === mine ? ' is-own' : ''}">
    ${places ? `<span class="mo-pl${k === 0 ? ' is-lead' : ''}">${k + 1}</span>` : ''}${saddle(i)}<b>${RATS[i].name}<small>${i === mine ? `ты 100${RATS[i].who ? ' · ' + RATS[i].who : ''}` : RATS[i].who ? RATS[i].who : 'ставок нет'}</small></b><span class="mo-row-side">×${RATS[i].x}</span></div>`).join('')}</div>`;
}

function rats(h) {
  stage(h, {
    id: 'rats', mode: 'farm', bg: IMG('plaza-ratrace.jpg'),
    title: 'Крысиные бега: ставка и забег',
    note: 'Окно ставки теперь в том же стиле, что блэкджек: большие карточки крыс, фишки 10 / 50 / 100 / 500 и золотая кнопка «Поставить» с итогом «выиграешь». Идущий забег — обычная плашка события, а список крыс — под бейджем.',
    before: IMG('was-26b-ratrace-panel.jpg'),
    states: [{ id: 'bet', label: 'Окно ставки' }, { id: 'open', label: 'Приём ставок' }, { id: 'run', label: 'Забег' }, { id: 'win', label: 'Выигрыш' }],
    render(scene, st, api) {
      setWas(api, st === 'bet' ? IMG('was-26b-ratrace-panel.jpg') : st === 'open' ? IMG('was-26-ratrace-approach.jpg') : null);
      let html = '';
      if (st === 'bet') {
        html += slot('tr', badge());
        html += `<div class="k-scrim"><section class="k-window mo-bet-win is-in">
          <header class="k-win-head"><span class="k-win-portrait">${img(IC.rat, '')}</span><div class="k-win-titles"><p class="k-eyebrow">Ипподром · приём ставок · старт через 12 с</p><h2 class="k-win-title">Крысиные бега</h2></div>
            <div class="k-win-tools"><button class="k-close" aria-label="Закрыть"><kbd class="k-key k-key--sm">Esc</kbd></button></div></header>
          <div class="k-win-body">
            <p class="mo-step"><b>1</b>На кого ставишь</p>
            <div class="mo-rats">${RATS.map((r, i) => `<button type="button" class="k-cell mo-rat${i === 0 ? ' is-on' : ''}" data-rat="${i}">${saddle(i)}
              <span class="mo-rat-name">${r.name}</span><span class="mo-rat-x">×${r.x}</span><span class="mo-rat-trait">${r.trait}</span>
              <span class="mo-rat-foot">шанс ${chance(r.x)}${r.x === 3 ? ' · фаворит' : ''}</span><span class="mo-rat-who">${r.who ? `ставки: ${r.who}` : ''}</span></button>`).join('')}</div>
            <p class="mo-step"><b>2</b>Сколько</p>
            <div class="k-bet"><div class="k-bet-chips">${[10, 50, 100, 500].map((c) => `<button class="k-chip k-chip--${c}${c === 100 ? ' is-on' : ''}">${c}</button>`).join('')}</div>
              <div class="k-bet-row"><label class="k-bet-amount">Ставка <input class="k-input k-bet-input" inputmode="numeric" value="100"></label>
                <button class="k-btn k-btn--gold k-btn--lg">Поставить<small>на Пулю · выиграешь 500</small><kbd class="k-key k-key--tr">Enter</kbd></button>
                <span class="k-pill k-pill--gold k-pill--lg">${coin}1 250</span></div>
              <p class="k-bet-note">от 5 до 1 000 жетонов · одна ставка на забег · выплата до 25 000</p></div>
          </div></section></div>`;
        scene.innerHTML = html;
        scene.querySelectorAll('.mo-rat').forEach((b) => b.addEventListener('click', () => {
          scene.querySelectorAll('.mo-rat').forEach((x) => x.classList.toggle('is-on', x === b));
          const r = RATS[+b.dataset.rat];
          scene.querySelector('.k-btn.k-btn--lg small').textContent = `на ${r.name === 'Пуля' ? 'Пулю' : r.name === 'Соня' ? 'Соню' : r.name === 'Барон' ? 'Барона' : r.name === 'Шнырь' ? 'Шныря' : r.name === 'Кексик' ? 'Кексика' : 'Ириску'} · выиграешь ${100 * r.x}`;
          sfx.play('click');
        }));
        scene.querySelectorAll('.k-chip').forEach((b) => b.addEventListener('click', () => {
          scene.querySelectorAll('.k-chip').forEach((x) => x.classList.toggle('is-on', x === b));
          scene.querySelector('.k-bet-input').value = b.textContent;
          sfx.play('pop');
        }));
        return;
      }
      html += chatDock();
      html += slot('tr', badge({ pop: st === 'win' ? '+500' : '' }) + tile(IC.rat, st === 'win' ? 'сыграла!' : 'Пуля ×5', st === 'win' ? `${coin}+500` : `100 → ${coin}500`, 'k-tile--own')
        + ratList(st === 'open' ? [0, 1, 2, 3, 4, 5] : st === 'run' ? [1, 2, 0, 5, 3, 4] : [0, 2, 1, 5, 3, 4], { places: st !== 'open' }));
      if (st === 'open') html += slot('tc', `<div class="k-event"><span class="k-event-ic">${img(IC.rat, '')}</span><div class="k-event-title">Приём ставок</div><div class="k-event-sub">твоя — Пуля · банк 340 · 4 ставки</div><div class="k-event-timer is-hurry">0:05</div>${meter(0.3, 'k-meter--thin k-meter--mode')}</div>`);
      if (st === 'run') html += slot('tc', `<div class="k-event"><span class="k-event-ic">${img(IC.rat, '')}</span><div class="k-event-title">Забег! Впереди Соня</div><div class="k-event-sub">Твоя Пуля — 3-я · ставка 100</div></div>`);
      if (st === 'win') {
        html += slot('tc', `<div class="k-event k-event--good k-lamp"><span class="k-event-ic">${img(IC.rat, '')}</span><div class="k-event-title">Победила Пуля ×5!</div><div class="k-event-sub">Выплачено 640 · ставок было 4</div></div>`);
        html += `<div class="k-slot k-slot--c"><div class="k-hero k-hero--gold is-pop"><p class="k-hero-title">Ты выиграл!</p><span class="k-hero-sub">${coin}+500 жетонов</span></div></div>`;
      }
      html += slot('bc', st === 'win'
        ? `<div class="k-prompt mo-noshrink">${kk('E')}Ставка на следующий забег</div>`
        : keyRow([[kk('1–6'), 'болеть за крысу'], [kk('C'), 'вид на трассу']]));
      scene.innerHTML = html;
    },
  });
}

/* ================================================================== РУЛЕТКА РЫБАКА */
const ball = (n, c) => `<span class="mo-ball is-${c}">${n}</span>`;
function roulette(h) {
  stage(h, {
    id: 'roulette', mode: 'fishing', bg: IMG('barkas-roulette.jpg'),
    title: 'Рулетка рыбака на баркасе',
    note: 'Тот же каркас ставки, что у крыс: сверху — что ставишь (весь улов с ценой), ниже — три крупных поля с шансом и выигрышем. Результат ставки теперь говорит один герой-баннер по центру, а плашка сверху только сообщает, что выпало.',
    before: IMG('was-18d-roulette-panel.jpg'),
    states: [{ id: 'bet', label: 'Окно ставки' }, { id: 'open', label: 'Приём ставок' }, { id: 'spin', label: 'Колесо' }, { id: 'win', label: 'Выигрыш' }, { id: 'lose', label: 'Мимо' }],
    render(scene, st, api) {
      setWas(api, st === 'bet' ? IMG('was-18d-roulette-panel.jpg') : st === 'open' ? IMG('was-18c-roulette-approach.jpg') : null);
      let html = '';
      if (st === 'bet') {
        const FISH = [['fish-mackerel.webp', 'Скумбрия', 45], ['fish-goby.webp', 'Бычок', 18], ['fish-sturgeon.webp', 'Осётр', 190]];
        const field = (c, cls, name, x, ch, win, key, on) => `<button type="button" class="mo-field is-${cls}${on ? ' is-on' : ''}" data-f="${cls}"><kbd class="k-key k-key--sm k-key--tr">${key}</kbd><span class="mo-field-name">${name}</span><span class="mo-field-x">×${x}</span><span class="mo-field-ch">шанс ${ch}</span><span class="mo-field-win">выиграешь ${coin}${win}</span></button>`;
        html += slot('tr', badge());
        html += `<div class="k-scrim"><section class="k-window mo-bet-win is-in">
          <header class="k-win-head"><span class="k-win-portrait">${img(IC.roulette, '')}</span><div class="k-win-titles"><p class="k-eyebrow">Баркас · приём ставок · ещё 8 с</p><h2 class="k-win-title">Рулетка рыбака</h2></div>
            <div class="k-win-tools"><button class="k-close" aria-label="Закрыть"><kbd class="k-key k-key--sm">Esc</kbd></button></div></header>
          <div class="k-win-body">
            <p class="mo-step"><b>1</b>Твоя ставка — весь улов из рюкзака</p>
            <div class="mo-stake">${FISH.map(([f, n, p]) => `<span class="mo-fish"><img src="${K.icon(f)}" alt=""><b>${n}</b><span>${coin}${p}</span></span>`).join('')}<span class="mo-fish is-more"><b>+4 рыбы</b><span>${coin}159</span></span>
              <span class="mo-stake-sum">7 рыб на <b>${coin}412</b></span></div>
            <p class="mo-step"><b>2</b>На что ставишь</p>
            <div class="mo-fields">${field('r', 'red', 'Красное', 2, '48,6%', '824', '1', true)}${field('b', 'black', 'Чёрное', 2, '48,6%', '824', '2')}${field('g', 'green', 'Зеро', 36, '2,7%', '14 832', '3')}</div>
            <button class="k-btn k-btn--gold k-btn--lg k-btn--wide mo-go">Поставить весь улов на красное</button>
            <div class="k-well mo-last"><p class="k-eyebrow">Последние ставки</p>
              <div class="mo-last-row">${ball(17, 'black')}<b>Паша</b><span>чёрное · ${coin}120</span><span class="k-good">+240</span></div>
              <div class="mo-last-row">${ball(12, 'red')}<b>Бочка</b><span>зеро · ${coin}85</span><span class="k-bad">−85</span></div>
              <div class="mo-last-row">${ball(8, 'black')}<b>Сухарик</b><span>красное · ${coin}40</span><span class="k-bad">−40</span></div></div>
          </div>
          <footer class="k-win-foot"><span class="k-note">37 лунок: 18 красных, 18 чёрных и зеро · выплата — не больше 25 000</span></footer></section></div>`;
        scene.innerHTML = html;
        const go = scene.querySelector('.mo-go');
        scene.querySelectorAll('.mo-field').forEach((b) => b.addEventListener('click', () => {
          scene.querySelectorAll('.mo-field').forEach((x) => x.classList.toggle('is-on', x === b));
          go.textContent = `Поставить весь улов на ${{ red: 'красное', black: 'чёрное', green: 'зеро' }[b.dataset.f]}`;
          sfx.play('click');
        }));
        return;
      }
      html += chatDock();
      const bet = tile(IC.roulette, 'красное', `улов ${coin}412`, 'k-tile--own');
      html += slot('tr', badge({ pop: st === 'win' ? '+824' : '' }) + (st === 'win' || st === 'lose' ? '' : bet));
      const ev = {
        open: ['icon', 'Приём ставок', 'твоя — красное, 412 · ставок 2', '<div class="k-event-timer">0:08</div>' + meter(0.8, 'k-meter--thin k-meter--mode')],
        spin: ['icon', 'Колесо крутится…', 'твоя — красное, 412', ''],
        win: ['ball12', 'Выпало 12 — красное', 'Колесо остановилось', ''],
        lose: ['ball17', 'Выпало 17 — чёрное', 'Колесо остановилось', ''],
      }[st];
      const icon = ev[0] === 'icon' ? img(IC.roulette, '') : ev[0] === 'ball12' ? ball(12, 'red') : ball(17, 'black');
      html += slot('tc', `<div class="k-event${st === 'win' ? ' k-event--good k-lamp' : ''}"><span class="k-event-ic">${icon}</span><div class="k-event-title">${ev[1]}</div><div class="k-event-sub">${ev[2]}</div>${ev[3]}</div>`);
      if (st === 'win') html += `<div class="k-slot k-slot--c"><div class="k-hero k-hero--gold is-pop"><p class="k-hero-title">Выигрыш!</p><span class="k-hero-sub">${coin}+824 жетона за улов</span></div></div>`;
      if (st === 'lose') html += `<div class="k-slot k-slot--c"><div class="k-hero k-hero--lose is-pop"><p class="k-hero-title is-sm">Улов ушёл в море…</p><span class="k-hero-sub">${coin}412 — в следующий раз повезёт</span></div></div>`;
      html += slot('bc', st === 'open' ? `<div class="k-prompt mo-noshrink">${kk('E')}Поменять ставку<span class="k-prompt-sep"></span><span class="k-prompt-note">приём ставок ещё 8 с</span></div>` : st === 'spin' ? `<div class="k-prompt k-prompt--off mo-noshrink">${kk('E')}Поставить<span class="k-prompt-note">ставь в следующем раунде</span></div>` : `<div class="k-prompt mo-noshrink">${kk('E')}Играть ещё</div>`);
      scene.innerHTML = html;
    },
  });
}

/* ================================================================== КАК ЕСТЬ + ОБЩИЙ ВЕРХ */
function keep(h) {
  const SHOTS = {
    durak: ['was-22c-durak-game-2.jpg', 'Дурак'],
    bj: ['was-23d-blackjack-hand-2.jpg', 'Блэкджек'],
    bl: ['was-24-billiards-seated.jpg', 'Бильярд'],
    dg: ['was-39-dungeon-hud.jpg', 'Подземелье'],
  };
  const voice = `<div class="k-chat"><div class="k-chat-bar"><button class="k-voice" aria-label="Голос">${K.mic}<kbd class="k-key k-key--sm">V</kbd></button></div></div>`;
  const patch = (x, y, w, hh, sx, sy, file) => `<div class="mo-patch" style="left:${x}px;top:${y}px;width:${w}px;height:${hh}px;background-image:url('${IMG(file)}');background-position:-${sx}px -${sy}px"></div>`;
  stage(h, {
    id: 'keep', bg: IMG(SHOTS.durak[0]),
    title: 'Дурак, блэкджек, бильярд и «Подземелье»: как есть + общий верх',
    note: 'Эти экраны владелец любит — их вид и панели не трогаем. Меняется только то, что общее для всей игры: бейдж игрока справа сверху (уровень и жетоны — только в нём) и кнопка голоса слева снизу (чат открывается по Enter).',
    before: IMG(SHOTS.durak[0]),
    states: Object.entries(SHOTS).map(([id, [, label]]) => ({ id, label })),
    render(scene, st, api) {
      const [file] = SHOTS[st];
      api.el.querySelector('.stage-bg').style.backgroundImage = `url('${IMG(file)}')`;
      setWas(api, IMG(file));
      let html = '';
      if (st === 'dg') {
        // две кнопки Подземелья (счётчик и пауза) встают под бейдж, а их старое место и старая кнопка голоса закрыты куском того же пола
        // v2: бейдж ниже не 96, а 60 — кнопки встают сразу под ним (y 70)
        html += patch(1262, 56, 166, 16, 1262, 160, file) + patch(1262, 70, 166, 54, 1262, 56, file) + patch(1300, 6, 128, 16, 1300, 190, file);
      }
      html += slot('tr', badge());
      html += st === 'dg' ? `<div class="k-slot k-slot--bl" style="left:96px">${voice}</div>` : slot('bl', voice);
      scene.innerHTML = html;
    },
  });
}

/* запуск — в самом конце, когда все константы определены */
if (host) build(host);
