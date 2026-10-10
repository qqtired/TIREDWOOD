// Рыбалка: подход, поклёвка, вываживание, улов, журнал, Дед Семён, рюкзак, своя лодка, остров.
// Только компоненты кита; своё CSS — раскладка и игровое поле шкалы (.fi-). Числа и названия — из shared/ игры:
// виды, цены и вес — shared/fishing.ts + fishrules.ts (цены с флагом острова ×0,4, как на сайте), шансы — tierOdds для
// рыбака 4-го уровня с продвинутой удочкой и пивом, перки — shared/fishability.ts, лавка — shared/fishshop.ts,
// удочки и уровни — shared/fishprogress.ts, лодки — shared/fishboat.ts, радио — shared/boatradio.ts.
import { stage, section, K, pushToast } from '../page/page.js';

const host = section('fishing');
const D = 'img/fishing/';
const C = K.coin();
const icon = K.icon;
/** рисованные иконки нового набора: client/assets/ui/icons/*.webp, копии — img/icons/ */
const ic = (n) => K.icon(`${n}.webp`);
const gear = (n) => `${D}gear/${n}`;
const PNG_FISH = new Set(['bluemarlin', 'greenlandshark']);
const fishSrc = (id) => `${D}fish/${id}.${PNG_FISH.has(id) ? 'png' : 'webp'}`;
const nf = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const pct = (x) => (x >= 10 ? Math.round(x) : x >= 1 ? x.toFixed(1) : x.toFixed(1)).toString().replace('.', ',');

/* ------------------------------------------------------------------ категории (shared/fishrules.ts TIER_NAMES / TIER_TITLES; цвета TIER_CSS — токены --tier-* кита) */
const T = [
  { n: 'обычная', t: 'Обычные', s: 'Обычные', c: 'var(--tier-common)' },
  { n: 'редкая', t: 'Редкие', s: 'Редкие', c: 'var(--tier-rare)' },
  { n: 'эпическая', t: 'Эпические', s: 'Эпические', c: 'var(--tier-epic)' },
  { n: 'легендарная', t: 'Легендарные', s: 'Легенды', c: 'var(--tier-legend)' },
  { n: 'мифическая', t: 'Мифические', s: 'Мифы', c: 'var(--tier-myth)' },
  { n: 'находка', t: 'Находки', s: 'Хлам', c: 'var(--tier-junk)' },
  { n: 'сундук', t: 'Сундук', s: 'Сундук', c: 'var(--tier-chest)' },
  { n: 'божественная', t: 'Божественные', s: 'Царь морей', c: 'var(--tier-divine)' },
];
const RANK = [0, 1, 2, 3, 4, 7]; // порядок ценности рыбы: обычная … мифическая, божественная

/* ------------------------------------------------------------------ виды: id | имя | категория | место | только в дождь/туман | цена, жетонов */
const FISH = `hamsa|Хамса|0|pier||2-2,goby|Бычок|0|pier||2-3,scad|Ставрида|0|pier||2-4,redmullet|Барабуля|0|pier||2-4,wrasse|Зеленушка|0|pier||2-3,karas|Ласкирь|0|pier||2-3,blenny|Морская собачка|0|pier||2-2,sardine|Сардина|0|pier||2-2,whiting|Мерланг|0|pier||2-4,picarel|Смарида|0|pier|1|2-3,sprat|Шпрот|0|barkas||3-4,flyingfish|Летучая рыба|0|barkas||3-5,haddock|Пикша|0|barkas||3-5,hake|Хек|0|barkas||3-5,mullet|Кефаль|1|pier||2-5,mackerel|Скумбрия|1|pier||2-4,garfish|Сарган|1|pier||2-4,scorpion|Морской ёрш|1|pier||2-5,flounder|Камбала|1|pier||2-6,gurnard|Морской петух|1|pier||2-5,eel|Угорь|1|pier|1|3-8,meagre|Горбыль|1|pier|1|3-8,shad|Черноморская сельдь|1|pier|1|2-6,redfish|Морской окунь|1|barkas||3-8,bonito|Пеламида|1|barkas||3-8,cod|Треска|1|barkas||3-8,barracuda|Барракуда|1|barkas||3-8,hairtail|Рыба-сабля|1|barkas|1|4-11,bluefish|Луфарь|2|pier||4-11,dogfish|Катран|2|pier||5-12,ray|Скат|2|pier||5-12,turbot|Калкан|2|pier||6-14,seabass|Лаврак|2|pier|1|7-18,leerfish|Лихия|2|pier|1|8-20,wolffish|Зубатка|2|barkas||6-15,mahi|Корифена|2|barkas||6-15,amberjack|Сериола|2|barkas||6-16,wahoo|Ваху|2|barkas|1|10-25,blueshark|Голубая акула|2|barkas|1|9-24,sturgeon|Осётр|3|pier||15-44,tuna|Голубой тунец|3|pier||17-47,swordfish|Меч-рыба|3|pier||17-47,angler|Морской чёрт|3|pier||14-40,bluemarlin|Синий марлин|3|pier|1|29-80,sunfish|Рыба-луна|3|barkas||16-48,halibut|Палтус|3|barkas||18-49,mako|Акула-мако|3|barkas||18-51,hammerhead|Большая белая акула|3|barkas|1|30-85,whiteshark|Рыба-молот|4|pier||85-170,greenlandshark|Гренландская акула|4|pier|1|140-305,oarfish|Сельдяной король|4|barkas||99-198,kalmar|Дальневосточный кальмар|7|pier||212-424,capelin|Мойва|0|isle||7-11,smelt|Корюшка|0|isle||7-14,navaga|Навага|0|isle||7-15,lanternfish|Светящийся анчоус|0|isle|1|11-18,lumpfish|Пинагор|1|isle||15-36,saithe|Сайда|1|isle||15-39,grenadier|Макрурус|1|isle|1|23-54,lamprey|Морская минога|1|isle|1|23-54,salmon|Сёмга|2|isle||31-77,ling|Мольва|2|isle||31-77,chimaera|Химера|2|isle|1|47-110,roughy|Большеголов|2|isle|1|47-110,opah|Опах|3|isle||77-220,albacore|Тунец-альбакор|3|isle||77-210,coelacanth|Латимерия|3|isle|1|116-330,goblinshark|Акула-домовой|3|isle|1|125-345,beluga|Белуга|4|isle||330-660,thresher|Лисья акула|4|isle||330-660,baskingshark|Гигантская акула|4|isle|1|525-1050,frilledshark|Плащеносная акула|7|isle||825-1650`
  .split(',').map((r) => { const [id, name, tier, zone, rain, price] = r.split('|'); return { id, name, tier: +tier, zone, rain: !!rain, price: price.replace('-', '–') }; });
const BY = Object.fromEntries(FISH.map((f) => [f.id, f]));

/** Журнал рыбака 4-го уровня: 24 вида из 52, рекорды */
const CAUGHT = {
  hamsa: '31 г', goby: '286 г', scad: '402 г', redmullet: '188 г', wrasse: '244 г', karas: '271 г', blenny: '96 г', sardine: '112 г', whiting: '415 г',
  mullet: '1,42 кг', mackerel: '612 г', garfish: '588 г', scorpion: '540 г', flounder: '3,10 кг', gurnard: '860 г', eel: '2,20 кг',
  bluefish: '2,10 кг', dogfish: '8,40 кг', sturgeon: '18,4 кг', sprat: '21 г', haddock: '1,80 кг', hake: '2,05 кг', redfish: '3,60 кг', cod: '6,90 кг',
};

/* ------------------------------------------------------------------ общие куски HUD */
const badge = ({ tokens = '1 250', pop = '' } = {}) => `
  <div class="k-badge"><span class="k-ring" style="--p:.64"><b>12</b></span>
    <span class="k-badge-body"><span class="k-badge-nick">Кракозябра</span><span class="k-badge-tokens${pop ? ' is-bump' : ''}">${C}${tokens}</span></span>
    ${pop ? `<span class="k-pop is-still fi-pop">${pop}</span>` : ''}</div>`;

const ctx = ({ img, title, val, side = '', v = null, own = false, cls = '' }) => `
  <div class="k-ctx${own ? ' k-ctx--own' : ''} ${cls}">${img.startsWith('<') ? img : `<img class="k-ctx-ic" src="${img}" alt="">`}
    <span class="k-ctx-title">${title}</span><span class="k-ctx-val">${val}</span>
    ${side ? `<span class="k-ctx-side">${side}</span>` : ''}
    ${v !== null ? `<div class="k-meter k-meter--thin${v < 0.2 ? ' is-hurry' : ''}" style="--v:${v}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></div>` : ''}</div>`;

const BAG = (n = 6, sum = 22) => ctx({ img: gear('bag1.webp'), title: 'Рюкзак', val: `${n} / 10 · ${sum} ${C}`, side: K.key('I'), v: n / 10 });
const BEER = ctx({ img: gear('beer.webp'), title: 'Рыбацкое пиво', val: 'цена +10 % · 7:40', v: 0.77 });
const QUEST = ctx({ img: ic('quest-fish'), title: 'Задание 3 · Дед Семён', val: `7 из 15 рыб · +75 ${C}`, v: 7 / 15 });

const chat = () => `
  <div class="k-chat">
    <div class="k-chat-list">
      <div class="k-chat-line is-sys is-old">Паша вытаскивает катрана · 8,40 кг</div>
      <div class="k-chat-line k-nick-3"><b>Комета</b>кто на баркас? Саня ждёт</div>
      <div class="k-chat-line k-nick-1"><b>Паша</b>я, только рюкзак сдам</div>
    </div>
    <div class="k-chat-bar"><button class="k-voice" aria-label="Голос">${K.mic}<kbd class="k-key k-key--sm">V</kbd></button>
      <div class="k-chat-closed">${K.key('Enter')}Написать в чат</div></div>
  </div>`;

const meter = (v, cls = '', label = '') => `<div class="k-meter ${cls}" style="--v:${v}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i>${label ? `<span class="k-meter-label">${label}</span>` : ''}</div>`;

/* --- плашки события (верх-центр, одна за раз) */
const EV = {
  soon: `<div class="k-event"><span class="k-event-ic"><img src="${ic('season')}" alt=""></span>
    <div class="k-event-title">Сезон рыбалки скоро</div><div class="k-event-sub">10 минут все шансы ×2 и клюют виды дождя</div><div class="k-event-timer">12:40</div></div>`,
  season: `<div class="k-event k-lamp"><span class="k-event-ic"><img src="${ic('season')}" alt=""></span>
    <div class="k-event-title">Сезон рыбалки!</div><div class="k-event-sub">Все шансы ×2 · клюют виды дождя</div><div class="k-event-timer">6:40</div>
    ${meter(0.67, 'k-meter--thin k-meter--mode')}</div>`,
  rain: `<div class="k-event"><span class="k-event-ic"><img src="${ic('rain')}" alt=""></span>
    <div class="k-event-title">Дождь — рыболовное событие</div><div class="k-event-sub">Клюют виды дождя · редкие и выше ×1,5</div><div class="k-event-timer">3:12</div>
    ${meter(0.4, 'k-meter--thin k-meter--mode')}</div>`,
  fog: `<div class="k-event"><span class="k-event-ic"><img src="${ic('fog')}" alt=""></span>
    <div class="k-event-title">Туман наступает</div><div class="k-event-sub">Клюют туманные виды · редкие и выше ×1,5</div><div class="k-event-timer">5:12</div>
    ${meter(0.65, 'k-meter--thin k-meter--mode')}</div>`,
  greatFog: `<div class="k-event k-event--special k-lamp"><span class="k-event-ic"><img src="${ic('fog')}" alt=""></span>
    <div class="k-event-title">Великий туман!</div><div class="k-event-sub">Сезон острова: шансы ещё ×2 · туманные виды клюют</div><div class="k-event-timer">6:40</div>
    ${meter(0.67, 'k-meter--thin k-meter--special')}</div>`,
};

/* --- ВЛ: карточка рыбалки — уровень кольцом, следующий перк одной строкой, «Шансы сейчас» полосой */
const ODDS = {
  // tierOdds(): рыбак 4-го уровня, продвинутая удочка, бронзовая блесна, пиво (доля всех поклёвок, %)
  clear: [37.2, 36.0, 14.3, 4.8, 1.4, 0.6],
  rain: [8.6, 53.9, 21.4, 7.3, 2.2, 0.9],
  // рыбак 8-го уровня на острове, туман («Туман наступает»)
  fog: [4.8, 40.2, 32.9, 13.9, 3.1, 1.2],
};
const oddsBlock = (o, why) => `
  <div class="fi-odds">
    <div class="fi-odds-h"><p class="k-eyebrow fi-odds-t"><img src="${ic('odds')}" alt="">Шансы сейчас</p>${why}</div>
    <div class="fi-odds-bar">${o.map((x, i) => `<i style="--w:${x};--c:${T[RANK[i]].c}"></i>`).join('')}</div>
    <div class="fi-odds-legend">${o.map((x, i) => `<span><i class="fi-dot" style="--c:${T[RANK[i]].c}"></i>${T[RANK[i]].s}<b>${pct(x)} %</b></span>`).join('')}</div>
  </div>`;
const BEER_WHY = `<span class="k-pill k-pill--gold k-pill--sm"><img class="k-ic" src="${gear('beer.webp')}" alt="">пиво ×1,2</span>`;
const modeCard = ({ lv = 4, p = 0.28, xp = '240 / 850', next = 'На 5-м — <b>Стойкость I</b>', odds = ODDS.clear, why = BEER_WHY, isle = '', pop = '' } = {}) => `
  <div class="k-plate fi-mode">
    <div class="fi-mode-head">
      <span class="k-ring k-ring--sm k-ring--mode" style="--p:${p}"><b>${lv}</b></span>
      <div class="fi-mode-t"><b>Рыбалка · ур. ${lv}</b><span>${xp}</span></div>
      <div class="fi-perk"><img class="fi-ic" src="${icon('star.png')}" alt="">${next}</div>
    </div>
    ${oddsBlock(odds, why)}
    ${isle}
    ${pop ? `<span class="k-pop k-pop--xp is-still">${pop}</span>` : ''}
  </div>`;

/* --- НЦ: одна подсказка, клавиши — колпачками */
const key = (k, text) => `<span class="fi-k">${k}${text}</span>`;
const mouseKey = (b = 'l') => `<span class="k-key">${K.mouse(b)}</span>`;
const PROMPT = {
  approach: `<div class="k-prompt">${K.key('E')}Порыбачить<span class="k-prompt-sep"></span><span class="k-prompt-note">Пристань · свободное место</span></div>`,
  idle: `<div class="k-prompt fi-prompt">${key(mouseKey('l'), 'Забросить')}<span class="k-prompt-sep"></span>${key(K.key('J'), 'Журнал')}<span class="k-prompt-sep"></span>${key(K.key('I'), 'Рюкзак')}<span class="k-prompt-sep"></span>${key(K.key('E'), 'Встать')}</div>`,
  wait: `<div class="k-prompt fi-prompt"><span class="fi-wait"><img src="${ic('float')}" alt="">Ждём поклёвку…</span><span class="k-prompt-sep"></span>${key(K.key('J'), 'Журнал')}<span class="k-prompt-sep"></span>${key(K.key('I'), 'Рюкзак')}</div>`,
};

/* --- шкала вываживания: игровое поле как в игре + рамка кита вокруг */
const FISH_SVG = '<svg viewBox="0 0 40 24" width="40" height="24"><path d="M3 12c5-7 14-9 22-6l7-5-1 8 1 7-7-5c-8 3-17 1-22-6z" fill="currentColor" stroke="rgba(20,12,16,.75)" stroke-width="1.6" stroke-linejoin="round"/><circle cx="9" cy="10.5" r="1.7" fill="#1b1216"/></svg>';
const bar = ({ zone = [30, 34], fish = 44, prog = 0.62, theme = '' } = {}) => `
  <div class="fi-rbar"><div class="fi-rwater"></div><div class="fi-rzone" style="bottom:${zone[0]}%;height:${zone[1]}%"></div>
    <div class="fi-rfish" style="bottom:${fish}%">${FISH_SVG}</div></div>
  ${prog !== null ? `<div class="fi-rprog"><i style="width:${prog * 100}%"></i></div>` : ''}`;
const reel = ({ tier = 1, label = 'Редкая рыба!', zone, fish, prog, inZone = true, grade = '<span>без ошибок</span><b class="fi-g0">Идеально ×2,5</b>', hint = 'hold', theme = '', blink = false, low = false, res = '' } = {}) => `
  <div class="k-plate fi-reel${inZone ? ' is-in' : ''}${blink ? ' is-blink' : ''}${low ? ' is-low' : ''}${tier === 4 || tier === 7 ? ' is-myth' : ''}" ${theme ? `data-theme="${theme}"` : ''} style="--tc:${T[tier].c}">
    <div class="fi-reel-label"><span class="fi-tier fi-tier--lg">${label}</span></div>
    ${bar({ zone, fish, prog })}
    ${res || `<div class="fi-reel-grade">${grade}</div>
    ${hint === 'hold' ? `<div class="fi-reel-hint">Держи <span class="k-key">${K.mouse('l')}</span> — зона вверх</div>`
      : `<span class="k-pill k-pill--bad fi-reel-urgent">${hint}</span>`}`}
    ${res ? '' : `<div class="fi-reel-quit"><button class="k-btn k-btn--ghost k-btn--sm" data-quit>Прекратить<kbd class="k-key k-key--sm k-key--tr">X</kbd></button></div>`}
  </div>`;

/* --- НП: карточка улова, не больше 6 строк */
const catchCard = ({ id = 'gurnard', tier = 1, name = 'Морской петух', w = '860 г', price = 3, sell = 'у Семёна', badges = '', foot = '', lamp = false, buttons = true } = {}) => `
  <article class="k-panel fi-catch${lamp ? ' k-lamp' : ''}" style="--tc:${T[tier].c}">
    <header class="fi-catch-head"><span class="fi-tier">${T[tier].n}</span><span>${badges}</span></header>
    <div class="fi-catch-art"><img src="${fishSrc(id)}" alt=""></div>
    <div class="fi-catch-name"><b class="k-display">${name}</b><span>${w}</span></div>
    ${buttons ? `<div class="fi-catch-btns">
      <button class="k-btn k-btn--go k-btn--sm" data-keep>В рюкзак<small>+${price} ${C} ${sell}</small><kbd class="k-key k-key--tr">1</kbd></button>
      <button class="k-btn k-btn--info k-btn--sm" data-release>Отпустить<small>опыт ×1,5</small><kbd class="k-key k-key--tr">F</kbd></button>
      ${meter(0.62, 'k-meter--thin k-meter--good fi-catch-timer')}
    </div>` : ''}
    <p class="fi-catch-foot">${foot}</p>
  </article>`;
const journalFoot = (n, rest) => `<img src="${ic('journal')}" alt=""><span>Журнал <b>${n} из 52</b> · ${rest}</span>`;

/* --- окно: шапка */
const winHead = ({ portrait, eyebrow, title, say = '', tools = '' }) => `
  <header class="k-win-head">
    <span class="k-win-portrait">${portrait}</span>
    <div class="k-win-titles"><p class="k-eyebrow">${eyebrow}</p><h2 class="k-win-title">${title}</h2>${say ? `<p class="fi-say">${say}</p>` : ''}</div>
    <div class="k-win-tools">${tools}<button class="k-close" aria-label="Закрыть"><kbd class="k-key k-key--sm">Esc</kbd></button></div>
  </header>`;
const tabs = (list, on) => `<nav class="k-tabs" role="tablist">${list.map(([id, img, label, count]) => `<button class="k-tab${id === on ? ' is-on' : ''}" data-tab="${id}">${img ? `<img class="k-ic" src="${img}" alt="">` : ''}${label}${count != null ? ` <span class="k-tab-count">${count}</span>` : ''}</button>`).join('')}</nav>`;
/** вкладки окна переключают состояние сцены (кнопки над сценой — в такт) */
const wireTabs = (scene, api) => scene.querySelectorAll('.k-tab[data-tab]').forEach((b) => b.addEventListener('click', () => api.setState(b.dataset.tab)));

if (host) {
  /* ================================================================== 1. подход к месту */
  stage(host, {
    id: 'fish-approach',
    title: 'Подходишь к месту на пирсе',
    note: 'Внизу — одна подсказка «E — порыбачить». Сезон рыбалки — одной плашкой сверху: скоро он или уже идёт. Больше ничего, пока не сел с удочкой.',
    bg: `${D}bg-pier-fishing.jpg`,
    before: `${D}was-10-fish-approach.jpg`,
    mode: 'fishing',
    states: [{ id: 'soon', label: 'сезон скоро' }, { id: 'season', label: 'сезон идёт' }],
    render(scene, state) {
      scene.innerHTML = `
        <div class="k-slot k-slot--tc">${state === 'season' ? EV.season : EV.soon}</div>
        <div class="k-slot k-slot--tr">${badge()}</div>
        <div class="k-slot k-slot--bl">${chat()}</div>
        <div class="k-slot k-slot--bc">${PROMPT.approach}</div>`;
    },
  });

  /* ================================================================== 2. ждёшь поклёвку / поклёвка */
  stage(host, {
    id: 'fish-wait',
    title: 'С удочкой: ждёшь поклёвку',
    note: 'Слева — всё про рыбалку в одной карточке: уровень кольцом, следующий бонус, «Шансы сейчас» полосой с крупными подписями. Справа под тобой — рюкзак, пиво с таймером и задание Семёна. Поклёвка — крупное «Подсекай!» с кнопкой мыши.',
    bg: `${D}bg-pier-fishing.jpg`,
    before: `${D}was-11-fish-cast.jpg`,
    mode: 'fishing',
    states: [{ id: 'idle', label: 'перед забросом' }, { id: 'wait', label: 'ждёшь поклёвку' }, { id: 'rain', label: 'в дождь' }, { id: 'bite', label: 'поклёвка' }],
    state: 'wait',
    render(scene, state) {
      const rain = state === 'rain';
      const bite = state === 'bite';
      const why = rain ? `<span class="k-pill k-pill--info k-pill--sm"><img class="k-ic" src="${ic('rain')}" alt="">дождь ×1,5</span>`
        : `<span class="k-pill k-pill--gold k-pill--sm"><img class="k-ic" src="${gear('beer.webp')}" alt="">пиво ×1,2</span>`;
      scene.innerHTML = `
        ${rain ? `<div class="k-slot k-slot--tc">${EV.rain}</div>` : ''}
        <div class="k-slot k-slot--tl${bite ? ' fi-dim' : ''}">${modeCard({ odds: rain ? ODDS.rain : ODDS.clear, why })}</div>
        <div class="k-slot k-slot--tr${bite ? ' fi-dim' : ''}">${badge()}${BAG()}${BEER}${QUEST}</div>
        <div class="k-slot k-slot--bl${bite ? ' fi-dim' : ''}">${chat()}</div>
        ${bite
          ? `<div class="k-slot k-slot--c"><div class="k-hero k-hero--gold is-pop fi-bite"><p class="k-hero-title">Подсекай!</p><span class="k-hero-sub"><span class="k-key k-key--lg">${K.mouse('l')}</span>жми сейчас</span></div></div>`
          : `<div class="k-slot k-slot--bc">${state === 'idle' ? PROMPT.idle : PROMPT.wait}</div>`}`;
    },
  });

  /* ================================================================== 3. вываживание */
  stage(host, {
    id: 'fish-reel',
    title: 'Вываживание',
    note: 'Шкала — та же, что в игре. Вокруг неё теперь одна рамка: категория рыбы, живая оценка, одна подсказка и «Прекратить» с клавишей X прямо на рамке. Остальной экран притихает, подсказка внизу больше не повторяет шкалу.',
    bg: `${D}bg-pier-reel.jpg`,
    before: `${D}was-12-fish-reel-good.jpg`,
    mode: 'fishing',
    states: [{ id: 'fight', label: 'рыба в зоне' }, { id: 'last', label: 'последний рывок' }, { id: 'won', label: 'вытащил' }, { id: 'lost', label: 'сорвалась' }],
    render(scene, state, api) {
      let r;
      if (state === 'fight') r = reel({});
      else if (state === 'last') r = reel({ tier: 3, label: 'Легендарная рыба!!', zone: [8, 30], fish: 46, prog: 0.74, inZone: false, blink: true, grade: '<span>1 ошибка</span><b class="fi-g1">Хорошо ×1,5</b>', hint: 'Последний рывок!' });
      else if (state === 'won') r = reel({ zone: [40, 34], fish: 55, prog: 1, res: '<div class="fi-reel-res"><b class="k-good">Поймал!</b><span>Идеально · опыт ×2,5</span></div>' });
      else r = reel({ tier: 2, label: 'Эпическая рыба!', zone: [0, 28], fish: 88, prog: 0.03, inZone: false, low: true, res: '<div class="fi-reel-res"><b class="k-bad">Сорвалась…</b><span>+8 опыта за борьбу</span></div>' });
      scene.innerHTML = `
        <div class="k-slot k-slot--tl fi-dim">${modeCard({ why: `<span class="k-pill k-pill--gold k-pill--sm"><img class="k-ic" src="${gear('beer.webp')}" alt="">пиво ×1,2</span>` })}</div>
        <div class="k-slot k-slot--tr fi-dim">${badge()}${BAG()}${BEER}</div>
        <div class="k-slot k-slot--bl fi-dim">${chat()}</div>
        ${r}`;
      scene.querySelector('[data-quit]')?.addEventListener('click', () => api.setState('lost'));
    },
  });

  /* ================================================================== 4. улов */
  stage(host, {
    id: 'fish-catch',
    title: 'Улов',
    note: 'Новая карточка улова — шесть строк вместо девяти: крупная картинка рыбы, имя и вес, две кнопки с клавишами 1 и F, полоска времени на выбор и одна строка про журнал. Жетоны и опыт всплывают у бейджа и уровня рыбалки, а не в карточке. Нажми «В рюкзак» или «Отпустить».',
    bg: `${D}bg-pier-fishing.jpg`,
    before: `${D}was-13-fish-catch-card.jpg`,
    mode: 'fishing',
    states: [{ id: 'new', label: 'новый вид' }, { id: 'record', label: 'рекорд' }, { id: 'chest', label: 'сундук' }, { id: 'poseidon', label: 'клад Посейдона' }],
    render(scene, state) {
      let card;
      let tr = badge();
      let tl = modeCard();
      let center = '';
      let bag = BAG();
      if (state === 'new') {
        card = catchCard({ badges: '<span class="k-pill k-pill--gold k-pill--sm">Новый вид!</span>', foot: journalFoot(24, 'до удочки «Резная» ещё 1') });
        tr = badge({ tokens: '1 260', pop: '+10' });
        tl = modeCard({ p: 0.3, xp: '256 / 850', pop: '+16 опыта' });
      } else if (state === 'record') {
        card = catchCard({ id: 'sturgeon', tier: 3, name: 'Осётр', w: '18,4 кг', price: 26, lamp: true, badges: '<span class="k-pill k-pill--good k-pill--sm">Рекорд!</span>', foot: `<img src="${icon('star.png')}" alt=""><span>Прошлый рекорд — <b>12,6 кг</b></span>` });
        tl = modeCard({ p: 0.4, xp: '345 / 850', pop: '+105 опыта' });
      } else if (state === 'chest') {
        card = `<article class="k-panel fi-catch" style="--tc:${T[6].c}">
          <header class="fi-catch-head"><span class="fi-tier">Сундук</span></header>
          <div class="fi-catch-art is-chest"><img src="${fishSrc('chest')}" alt=""></div>
          <div class="fi-catch-coins">${C}+71</div>
          <p class="fi-catch-sub">Жетоны уже у тебя</p>
          <p class="fi-catch-foot"><img src="${gear('poseidon.webp')}" alt=""><span>В редком сундуке — клад Посейдона: <b>1 500</b></span></p></article>`;
        tr = badge({ tokens: '1 321', pop: '+71' });
        bag = BAG();
      } else {
        card = `<article class="k-panel fi-catch k-lamp" style="--tc:${T[6].c}">
          <header class="fi-catch-head"><span class="fi-tier">Сундук</span><span class="k-pill k-pill--gold k-pill--sm">Клад!</span></header>
          <div class="fi-catch-art is-chest"><img src="${gear('poseidon.webp')}" alt=""></div>
          <div class="fi-catch-coins">${C}+1 500</div>
          <p class="fi-catch-sub">Весь сервер уже знает!</p></article>`;
        tr = badge({ tokens: '2 750', pop: '+1 500' });
        center = `<div class="k-hero k-hero--gold is-pop"><p class="k-hero-title is-sm">Сокровища Посейдона!</p></div>`;
      }
      scene.innerHTML = `
        <div class="k-slot k-slot--tl">${tl}</div>
        <div class="k-slot k-slot--tc"><div class="k-toasts" data-toasts></div></div>
        <div class="k-slot k-slot--tr">${tr}${bag}${BEER}</div>
        <div class="k-slot k-slot--bl">${chat()}</div>
        ${center ? `<div class="k-slot k-slot--c">${center}</div>` : ''}
        <div class="k-slot k-slot--br">${card}</div>`;
      const toasts = scene.querySelector('[data-toasts]');
      scene.querySelector('[data-keep]')?.addEventListener('click', () => pushToast(toasts, { tone: 'good', icon: gear('bag1.webp'), title: state === 'record' ? 'Осётр в рюкзаке' : 'Морской петух в рюкзаке', sub: 'Рюкзак 7 / 10 · продать — у Деда Семёна' }));
      scene.querySelector('[data-release]')?.addEventListener('click', () => pushToast(toasts, { tone: 'info', icon: ic('release'), title: 'Отпустил — опыт ×1,5', sub: 'Рыба ушла в море, жетонов за неё нет' }));
    },
  });

  /* ================================================================== 5. журнал рыбака */
  const NEXT_STEPS = [
    [5, '<b>«Морская карта»</b> — окно шкалы'], [10, '<b>«Орешник»</b> удочка · <b>кукан</b>'], [15, '<b>«Гусиное перо»</b> и <b>«Уточка»</b> — поплавки'],
    [20, 'сет <b>«Бывалый рыбак»</b>'], [25, '<b>«Резная»</b> удочка'], [30, 'сет <b>«Капитан баркаса»</b>'], [35, '<b>«Сачок»</b>'],
    [40, '<b>«Ночной клёв»</b> — окно шкалы'], [45, '<b>«Светлячок»</b> поплавок'],
  ];
  const ISLE_STEPS = [[4, '<b>«Колокольный буй»</b> поплавок'], [8, '<b>«Маячная»</b> удочка'], [12, '<b>«Туман»</b> — окно шкалы'], [16, '<b>«Тупик»</b> на плечо'], [20, 'сет <b>«Смотритель маяка»</b>']];
  const fcard = (f) => {
    const got = CAUGHT[f.id];
    const tag = f.rain ? `<span class="fi-fcard-tag"><img src="${ic(f.zone === 'isle' ? 'fog' : 'rain')}" alt=""></span>` : f.zone === 'barkas' ? `<span class="fi-fcard-tag"><img src="${ic('anchor')}" alt=""></span>` : '';
    return `<div class="fi-fcard${got ? ' is-got' : ''}" style="--tc:${T[f.tier].c}">${tag}
      <div class="fi-fcard-art"><img src="${fishSrc(f.id)}" alt="" loading="lazy"></div>
      <b class="fi-fcard-name">${f.name}</b>
      <span class="fi-fcard-line">${got ? `рекорд <b>${got}</b>` : 'ещё не поймана'}</span>
      <span class="fi-fcard-line">${C} ${f.price}</span></div>`;
  };
  const bookBody = (tab) => {
    if (tab === 'rewards') {
      const steps = NEXT_STEPS.map(([n, what]) => `<div class="fi-step ${n <= 24 ? 'is-got' : n === 25 ? 'is-next' : 'is-lock'}"><span class="fi-step-n">${n}<small>видов</small></span><span class="fi-step-i">${what}</span>${n <= 24 ? '<span class="k-pill k-pill--good k-pill--sm">есть</span>' : `<span class="k-pill k-pill--sm${n === 25 ? ' k-pill--gold' : ''}">ещё ${n - 24}</span>`}</div>`).join('');
      const wins = [['', 'Дерево', 'is-on'], ['chart', 'Морская карта', ''], ['night', 'Ночной клёв', 'is-lock'], ['gold', 'Золото', 'is-lock'], ['fog', 'Туман', 'is-lock']]
        .map(([t, n, cls]) => `<div class="fi-winmini ${cls}" ${t ? `data-theme="${t}"` : ''} style="--tc:${T[1].c}">${bar({ zone: [34, 36], fish: 48, prog: null })}<span>${n}</span></div>`).join('');
      return `
        <h3 class="fi-h">Твои снасти <small>надеваются сами, поменять — здесь</small></h3>
        <div class="fi-gear">
          <div class="k-cell"><div class="fi-gear-art"><img src="${gear('rod-advanced.png')}" alt=""></div><b>Продвинутая</b><p>Удочка · зона и поклёвка +10 %</p></div>
          <div class="k-cell"><div class="fi-gear-art"><img src="${ic('float')}" alt=""></div><b>Обычный</b><p>Поплавок · «Гусиное перо» и «Уточка» уже твои</p></div>
          <div class="k-cell" style="grid-column:span 2"><div class="fi-gear-wins">${wins}</div><b>Окно шкалы — «Дерево»</b><p>Нажми, чтобы надеть «Морскую карту». Ночь, золото и туман — дальше по журналу.</p></div>
        </div>
        <h3 class="fi-h">Награды журнала <small>24 из 52 видов</small></h3>
        <div class="fi-steps">${steps}<div class="fi-step is-final is-lock"><span class="fi-step-n">Все 52<small>вида</small></span><span class="fi-step-i">сет <b>«Хозяин глубин»</b>, золотая удочка, окно «Золото», <b>золотой якорь</b> у ника</span><span class="k-pill k-pill--sm">ещё 28</span></div></div>
        <h3 class="fi-h"><img class="fi-ic" src="${ic('lighthouse')}" alt="">Остров «Последний свет» <small>0 из 20 · с 6-го уровня</small></h3>
        <div class="fi-steps">${ISLE_STEPS.map(([n, what]) => `<div class="fi-step is-lock"><span class="fi-step-n">${n}<small>видов</small></span><span class="fi-step-i">${what}</span></div>`).join('')}</div>`;
    }
    const zone = { all: null, pier: 'pier', barkas: 'barkas', isle: 'isle' }[tab];
    const list = FISH.filter((f) => (zone ? f.zone === zone : f.zone !== 'isle'));
    const secs = RANK.map((t) => {
      const fs = list.filter((f) => f.tier === t);
      if (!fs.length) return '';
      const got = fs.filter((f) => CAUGHT[f.id]).length;
      return `<h3 class="fi-h"><i class="fi-dot" style="--c:${T[t].c}"></i>${T[t].t} <small>${got} из ${fs.length}</small></h3><div class="fi-grid">${fs.map(fcard).join('')}</div>`;
    }).join('');
    const isle = tab === 'isle';
    return `
      <div class="k-cell fi-next">
        ${meter(isle ? 0 : 24 / 52, 'k-meter--lg k-meter--good', isle ? '0 из 20 видов острова' : '24 из 52 видов')}
        <div class="fi-next-r"><img src="${isle ? ic('lock') : gear('rod-master.png')}" alt=""><span>${isle ? 'Рыба острова — <b>с 6-го уровня</b>. Доплыть — на своей лодке или пассажиром' : 'Следующая награда — удочка <b>«Резная»</b>: ещё 1 вид'}</span></div>
      </div>
      <div class="fi-legend"><span><img src="${ic('rain')}" alt="">только в дождь, цена ×1,5</span><span><img src="${ic('anchor')}" alt="">с баркаса</span><span><img src="${ic('fog')}" alt="">только в туман</span><span>${C} цена при продаже</span></div>
      ${secs}`;
  };
  stage(host, {
    id: 'fish-book',
    title: 'Журнал рыбака (J)',
    note: 'Крупные карточки с картинками рыб. Места и награды — одна строка вкладок. Сколько поймано и что дальше — один раз, сверху. Где и когда клюёт — значком на карточке, легенда видна сразу.',
    bg: `${D}bg-pier-fishing.jpg`,
    before: `${D}was-15-fish-book.jpg`,
    mode: 'fishing',
    states: [{ id: 'all', label: 'все виды' }, { id: 'barkas', label: 'баркас' }, { id: 'isle', label: 'остров' }, { id: 'rewards', label: 'награды' }],
    render(scene, state, api) {
      scene.innerHTML = `
        <div class="k-scrim">
          <section class="k-window k-window--lg fi-win is-in">
            ${winHead({ portrait: `<img src="${ic('journal')}" alt="">`, eyebrow: 'Рыбалка · ур. 4', title: 'Журнал рыбака' })}
            ${tabs([['all', ic('journal'), 'Все', null], ['pier', ic('float'), 'Пристань', '19/32'], ['barkas', ic('anchor'), 'Баркас', '5/20'], ['isle', ic('lighthouse'), 'Остров', '0/20'], ['rewards', ic('season'), 'Награды', null]], state)}
            <div class="k-win-body">${bookBody(state)}</div>
          </section>
        </div>`;
      wireTabs(scene, api);
    },
  });

  /* ================================================================== 6. Дед Семён */
  const ROD_CARDS = [
    ['advanced', 'Продвинутая', 1, 'зона и поклёвка +10 % · редкие и выше ×1,05', 'own'],
    ['professional', 'Профессиональная', 5, 'зона и поклёвка +20 % · редкие и выше ×1,1', 'lock'],
    ['master', 'Мастерская', 10, 'зона и поклёвка +30 % · редкие и выше ×1,15', 'lock'],
    ['legendary', 'Легендарная', 15, 'зона и поклёвка +40 % · редкие и выше ×1,2', 'lock'],
  ];
  const item = ({ img, name, text, btn = '', why = '', own = false, lock = false, rod = false }) => `
    <div class="k-cell fi-item${own ? ' is-own' : ''}${lock ? ' is-lock' : ''}${rod ? ' is-rod' : ''}"><div class="fi-item-art"><img src="${img}" alt=""></div><b>${name}</b><p>${text}</p>${why ? `<p class="fi-why">${why}</p>` : ''}${btn}</div>`;
  const buy = (label, price, tone = '') => `<button class="k-btn k-btn--sm${tone}"><span class="k-row-line">${label} · ${nf(price)} ${C}</span></button>`;
  const have = (t = 'Есть') => `<span class="k-pill k-pill--gold">${t}</span>`;
  const lockBtn = (t) => `<button class="k-btn k-btn--sm" disabled>${t}</button>`;
  const BAG_ROWS = [
    ['garfish', 'Сарган', 1, '407 г', 3, 'пиво +10 %'], ['mackerel', 'Скумбрия', 1, '520 г', 3, 'пиво +10 %'], ['flounder', 'Камбала', 1, '2,30 кг', 4, 'пиво +10 %'],
    ['bluefish', 'Луфарь', 2, '2,10 кг', 7, ''], ['mullet', 'Кефаль', 1, '900 г', 3, ''], ['scad', 'Ставрида', 0, '210 г', 2, ''],
  ];
  const row = ([id, name, tier, w, p, mark], acts) => `
    <div class="fi-row" style="--tc:${T[tier].c}"><div class="fi-row-art"><img src="${fishSrc(id)}" alt=""></div>
      <div class="fi-row-t"><b>${name}</b><span><span class="fi-tier">${T[tier].n}</span>${w}${mark ? `<span class="k-pill k-pill--gold k-pill--sm">${mark}</span>` : ''}</span></div>
      <span class="fi-row-p">${C}${p}</span><div class="fi-row-a">${acts}</div></div>`;
  const semyonBody = (tab) => {
    if (tab === 'shop') {
      return `
        <h3 class="fi-h">Напитки и бубен <small>действует один напиток, 10 минут</small></h3>
        <div class="fi-cards">
          ${item({ img: gear('beer.webp'), name: 'Рыбацкое пиво', text: 'цена улова +10 % · редкие и выше ×1,2', btn: have('Пьёшь · 7:40'), own: true })}
          ${item({ img: gear('ale.webp'), name: 'Рыбацкий эль', text: 'цена +15 % · редкие и выше ×1,3 · заменит пиво', btn: buy('Выпить', 30) })}
          ${item({ img: gear('vodka.webp'), name: 'Водка рыбацкая', text: 'эпические и выше ×2, опыт за них ×2 — но зона −20 % и шатает', btn: buy('Выпить', 100) })}
          ${item({ img: gear('drum.webp'), name: 'Бубен дождя', text: 'сразу вызывает дождь для всех — рыболовное событие', btn: buy('Ударить', 1000) })}
        </div>
        <div class="fi-shop-h"><h3 class="fi-h">Рюкзаки <small>действует лучший купленный</small></h3></div>
        <div class="fi-cards">
          ${item({ img: gear('bag1.webp'), name: 'Рюкзак новичка', text: '10 мест для улова', btn: have(), own: true })}
          ${item({ img: gear('bag2.webp'), name: 'Рюкзак рыболова', text: '15 мест для улова', btn: buy('Купить', 500) })}
          ${item({ img: gear('bag3.webp'), name: 'Рюкзак профессионала', text: '20 мест для улова', why: 'С 5-го уровня', btn: lockBtn(`<span class="k-row-line">Купить · 1 000 ${C}</span>`), lock: true })}
          <div></div>
        </div>
        <h3 class="fi-h">Блёсны <small>навсегда; на леске — лучшая</small></h3>
        <div class="fi-cards">
          ${item({ img: gear('lure1.webp'), name: 'Бронзовая', text: 'рывки мягче на 3 % · эпические и выше ×1,03', btn: have('На леске'), own: true })}
          ${item({ img: gear('lure2.webp'), name: 'Серебряная', text: 'рывки мягче на 5 % · эпические и выше ×1,05', btn: buy('Купить', 1000) })}
          ${item({ img: gear('lure3.webp'), name: 'Золотая', text: 'рывки мягче на 10 % · эпические и выше ×1,1', why: 'С 6-го уровня', btn: lockBtn(`<span class="k-row-line">Купить · 3 000 ${C}</span>`), lock: true })}
          ${item({ img: gear('lure4.webp'), name: 'Платиновая', text: 'рывки мягче на 15 % · эпические и выше ×1,15', why: 'С 8-го уровня', btn: lockBtn(`<span class="k-row-line">Купить · 5 000 ${C}</span>`), lock: true })}
        </div>`;
    }
    if (tab === 'sell') {
      return `
        <div class="fi-shop-h"><h3 class="fi-h">Рюкзак <small>6 из 10 · цена записана при поимке</small></h3>
          <button class="k-btn k-btn--sm" data-sfx="reward"><span class="k-row-line">Продать всё · 22 ${C}</span></button></div>
        <div class="fi-rows">${BAG_ROWS.map((r) => row(r, '<button class="k-btn k-btn--ghost k-btn--sm" data-sfx="reward">Продать</button>')).join('')}</div>`;
    }
    if (tab === 'boats') {
      const B = [
        ['volzhanka.jpg', 'Волжанка', 'Волжанка 46 Fish, 4,7 м', [0.58, '43,2 км/ч'], [0.8, '5 с'], [0.9, 'круг 12,6 м'], 'клёв с якоря +5 %', 25, '3:00', 5000, 6],
        ['albakor.jpg', 'Альбакор', 'Albakore 560 Fish, 5,6 м', [0.75, '55,8 км/ч'], [0.8, '5 с'], [0.62, 'круг 18,2 м'], 'клёв с якоря +10 %', 50, '2:20', 10000, 8],
        ['northsilver.jpg', 'Нортсильвер', 'NorthSilver 700 Fish Sport, 7 м', [1, '74,9 км/ч'], [0.73, '5,5 с'], [0.41, 'круг 27,7 м'], 'клёв с якоря +15 %', 75, '1:45', 15000, 10],
      ];
      return `
        <p class="fi-say" style="font-style:normal">Своя лодка возит до острова «Последний свет» и рыбачит с якоря втроём. Вызвать — на стоянке за домом, E у таблички места.</p>
        <div class="fi-boats">${B.map(([ph, n, proto, sp, ac, tu, sonar, lw, trip, price, lv]) => `
          <div class="k-cell fi-boat"><div class="fi-boat-ph" style="background-image:url('${gear(ph)}')"></div><b>${n}</b><p>${proto}</p>
            <div class="fi-spec"><span>скорость</span>${meter(sp[0], 'k-meter--thin k-meter--mode')}<span>${sp[1]}</span><span>разгон</span>${meter(ac[0], 'k-meter--thin k-meter--mode')}<span>${ac[1]}</span><span>поворот</span>${meter(tu[0], 'k-meter--thin k-meter--mode')}<span>${tu[1]}</span></div>
            <div class="fi-chips"><span class="k-pill k-pill--good k-pill--sm">${sonar}</span><span class="k-pill k-pill--sm"><img class="k-ic" src="${ic('livewell')}" alt="">лайвел ${lw}</span><span class="k-pill k-pill--sm">до острова ${trip}</span></div>
            <p class="fi-why" style="color:var(--bad-text);font-weight:700">С ${lv}-го уровня рыбалки</p>
            <button class="k-btn k-btn--sm" disabled><span class="k-row-line">Купить · ${nf(price)} ${C}</span></button></div>`).join('')}</div>`;
    }
    // задания
    return `
      <div class="k-cell fi-quest"><img src="${ic('quest-fish')}" alt="">
        <div class="fi-quest-t">Задание 3 — поймай 15 рыб<small>Любую рыбу, на пристани или в море. Награда — 75 жетонов, а за 5-е задание — новая удочка.</small></div>
        ${meter(7 / 15, 'k-meter--lg k-meter--good', '7 из 15')}
        <button class="k-btn" disabled><span class="k-row-line">Получить · 75 ${C}</span><small>ещё 8 рыб</small></button></div>
      <h3 class="fi-h">Удочки за задания <small>берёшь любую открытую</small></h3>
      <div class="fi-cards">${ROD_CARDS.map(([img, name, q, text, st]) => item({ rod: true, img: gear(`rod-${img}.png`), name, text, own: st === 'own', lock: st === 'lock', why: st === 'lock' ? `После ${q}-го задания` : '', btn: st === 'own' ? have('В руках') : lockBtn('Взять') })).join('')}</div>`;
  };
  stage(host, {
    id: 'fish-semyon',
    title: 'Дед Семён (E у дома рыбака)',
    note: 'Одно окно кита вместо кофейного диалога: портрет, четыре вкладки, карточки с картинками удочек, рюкзаков, блёсен и лодок. Почему нельзя купить — отдельной красной строкой, а не в тексте кнопки. Уровень и сезон окно больше не повторяет.',
    bg: `${D}bg-semyon-area.jpg`,
    before: `${D}was-16-02-semyon-quests.jpg`,
    mode: 'fishing',
    states: [{ id: 'quests', label: 'задания' }, { id: 'shop', label: 'лавка' }, { id: 'sell', label: 'продать' }, { id: 'boats', label: 'лодки' }],
    render(scene, state, api) {
      scene.innerHTML = `
        <div class="k-scrim">
          <section class="k-window k-window--lg fi-win is-in">
            ${winHead({ portrait: `<img class="fi-port" src="${D}semyon.jpg" alt="">`, eyebrow: 'Пристань · лавка и задания', title: 'Дед Семён', say: '«Заходи, рыбак. Сдашь улов, возьмёшь снасти — и снова к воде.»', tools: `<span class="k-pill k-pill--gold k-pill--lg">${C}1 250</span>` })}
            ${tabs([['quests', ic('quest-fish'), 'Задания', null], ['shop', gear('bag2.webp'), 'Лавка', null], ['sell', ic('sell'), 'Продать', 6], ['boats', ic('boat'), 'Лодки', null]], state)}
            <div class="k-win-body">${semyonBody(state)}</div>
          </section>
        </div>`;
      wireTabs(scene, api);
    },
  });

  /* ================================================================== 7. рюкзак */
  stage(host, {
    id: 'fish-bag',
    title: 'Рюкзак (I)',
    note: 'Строки улова с картинками и цветом категории, цена — крупно справа. «В руки» и «Отпустить» — у каждой рыбы. Лайвел своей лодки — соседняя вкладка; пока лодки нет, там сказано, где её взять.',
    bg: `${D}bg-pier-fishing.jpg`,
    before: `${D}was-14-fish-bag.jpg`,
    mode: 'fishing',
    states: [{ id: 'bag', label: 'рюкзак' }, { id: 'well', label: 'лайвел' }],
    render(scene, state, api) {
      const body = state === 'well'
        ? `<div class="k-cell fi-empty"><img src="${ic('livewell')}" alt=""><div><b>Лайвел — у своей лодки</b><p>В лодке рыба живёт в садке: «Волжанка» — 25 рыб, «Альбакор» — 50, «Нортсильвер» — 75. Лодки продаёт Дед Семён, с 6-го уровня рыбалки.</p></div></div>`
        : `<div class="fi-rows">${BAG_ROWS.map((r) => row(r, '<button class="k-btn k-btn--ghost k-btn--sm">В руки</button><button class="k-btn k-btn--info k-btn--sm">Отпустить</button>')).join('')}</div>`;
      scene.innerHTML = `
        <div class="k-scrim">
          <section class="k-window is-in">
            ${winHead({ portrait: `<img src="${gear('bag1.webp')}" alt="">`, eyebrow: 'Рюкзак новичка · 10 мест', title: 'Рюкзак' })}
            ${tabs([['bag', gear('bag1.webp'), 'Рюкзак', '6/10'], ['well', ic('livewell'), 'Лайвел', null]], state)}
            <div class="k-win-body">${body}</div>
            <footer class="k-win-foot"><span class="k-note">Продать улов — у Деда Семёна или Сани на баркасе</span><span class="fi-sum">в рюкзаке на <b>${C}22</b></span></footer>
          </section>
        </div>`;
      wireTabs(scene, api);
    },
  });

  /* ================================================================== 8. своя лодка */
  const ARROW = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5 19.5 20 12 15.6 4.5 20z"/></svg>';
  const navCtx = (title, val, a) => ctx({ img: `<span class="k-ctx-ic fi-nav-ic" style="--a:${a}deg">${ARROW}</span>`, title, val });
  const STATIONS = [['Форсаж', 'драйв для гонки по волнам'], ['Тихая заводь', 'спокойно — для ловли с якоря'], ['Морской фанк', 'прогулка с друзьями на борту']];
  stage(host, {
    id: 'fish-boat',
    title: 'Своя лодка',
    note: 'Скорость и якорь — одной плашкой сверху. Куда плыть — карточками под бейджем: стрелка и метры. Справа внизу — три кнопки с клавишами Z, G, R; радио открывается над ними в том же стиле.',
    bg: `${D}bg-isle-dock.jpg`, // TODO: кадра из своей лодки нет — фон воды у острова
    before: `${D}was-18b-radio-panel-on.jpg`,
    mode: 'fishing',
    states: [{ id: 'helm', label: 'за штурвалом' }, { id: 'anchor', label: 'на якоре · радио' }],
    render(scene, state) {
      const anchor = state === 'anchor';
      const plate = `<div class="k-event"><span class="k-event-ic"><span class="fi-boat-ic" style="background-image:url('${gear('volzhanka.jpg')}')"></span></span>
        <div class="k-event-title">«Волжанка»${anchor ? ' на якоре' : ''}</div>
        <div class="k-event-sub">${anchor ? 'Рыбачьте втроём · клёв с якоря быстрее на 5 %' : 'Якорь поднят · эхолот: клёв с якоря +5 %'}</div>
        <div class="k-event-timer fi-speed">${anchor ? `<img src="${ic('anchor')}" alt="">` : '43<small>км/ч</small>'}</div></div>`;
      const radio = anchor ? `<div class="k-panel fi-radio">
          <div class="fi-radio-h"><img src="${ic('radio')}" alt=""><b>Радио лодки</b><label class="k-switch"><input type="checkbox" checked><span class="k-switch-track"></span></label></div>
          ${STATIONS.map(([t, m], i) => `<button class="fi-station${i === 1 ? ' is-on' : ''}" data-st="${i}"><b>${t}</b><span>${m}</span>${i === 1 ? '<span class="k-eq"><i></i><i></i><i></i></span>' : ''}<kbd class="k-key k-key--sm k-key--tl">${i + 1}</kbd></button>`).join('')}
          <div class="fi-radio-row">Громкость<input class="k-slider" type="range" value="70" style="--v:.7" aria-label="Громкость"></div>
          <label class="k-switch">Слышат все на борту<input type="checkbox" checked><span class="k-switch-track"></span></label>
        </div>` : '';
      scene.innerHTML = `
        <div class="k-slot k-slot--tc">${plate}</div>
        <div class="k-slot k-slot--tr">${badge()}${navCtx('Остров «Последний свет»', '2,1 км', -28)}${navCtx('Стоянка у Семёна', '640 м', 152)}
          ${ctx({ img: ic('livewell'), title: 'Лайвел', val: `12 / 25 · 96 ${C}`, v: 12 / 25 })}</div>
        <div class="k-slot k-slot--bl">${chat()}</div>
        <div class="k-slot k-slot--br">${radio}
          <div class="fi-boatbar">
            <button class="k-btn k-btn--sm${anchor ? ' k-btn--go' : ' k-btn--info'}"><img class="k-ic" src="${ic('anchor')}" alt="">${anchor ? 'Поднять' : 'Якорь'}<kbd class="k-key k-key--tr">Z</kbd></button>
            <button class="k-btn k-btn--sm" disabled><img class="k-ic" src="${ic('sell')}" alt="">Продать<small>у причала</small><kbd class="k-key k-key--tr">G</kbd></button>
            <button class="k-btn k-btn--sm k-btn--special${anchor ? ' is-pressed' : ''}"><img class="k-ic" src="${ic('radio')}" alt="">Радио<kbd class="k-key k-key--tr">R</kbd></button>
          </div></div>`;
      scene.querySelectorAll('.fi-station').forEach((b) => b.addEventListener('click', () => {
        scene.querySelectorAll('.fi-station').forEach((x) => { x.classList.toggle('is-on', x === b); x.querySelector('.k-eq')?.remove(); });
        b.querySelector('span').insertAdjacentHTML('afterend', '<span class="k-eq"><i></i><i></i><i></i></span>');
      }));
    },
  });

  /* ================================================================== 9. остров «Последний свет» */
  const ISLE_ROW = (n) => `<div class="fi-isle-row"><img src="${ic('lighthouse')}" alt=""><span>Виды острова</span><span>${n} из 20</span>${meter(n / 20, 'k-meter--thin k-meter--special')}</div>`;
  stage(host, {
    id: 'fish-isle',
    title: 'Остров «Последний свет»',
    note: 'Новое: у острова своя плашка события — «Туман наступает» и сезон «Великий туман» (раньше их в интерфейсе не было, а «Шансы» звали туман дождём). Счётчик видов острова — в карточке рыбалки. Шкала — в окне «Туман» из наград острова.',
    bg: `${D}bg-isle-fishing.jpg`,
    before: `${D}was-19e-isle-fish-cast.jpg`,
    mode: 'fishing',
    states: [{ id: 'fog', label: 'туман наступает' }, { id: 'season', label: 'Великий туман' }, { id: 'reel', label: 'вываживание' }, { id: 'catch', label: 'улов острова' }],
    render(scene, state) {
      const why = `<span class="k-pill k-pill--special k-pill--sm"><img class="k-ic" src="${ic('fog')}" alt="">${state === 'season' ? 'сезон ×2' : 'туман ×1,5'}</span>`;
      const mc = (extra = {}) => modeCard({ lv: 8, p: 0.16, xp: '500 / 3 100', next: 'На 9-м — <b>Спокойная рука</b>', odds: ODDS.fog, why, isle: ISLE_ROW(extra.n ?? 6), ...extra });
      let main = '';
      let tl = mc();
      let dimmed = '';
      if (state === 'reel') {
        main = reel({ tier: 2, label: 'Эпическая рыба!', theme: 'fog', zone: [24, 33], fish: 38, prog: 0.48, grade: '<span>без ошибок</span><b class="fi-g0">Идеально ×2,5</b>' });
        dimmed = ' fi-dim';
      } else if (state === 'catch') {
        main = `<div class="k-slot k-slot--br">${catchCard({ id: 'chimaera', tier: 2, name: 'Химера', w: '1,60 кг', price: 81, sell: 'у Игната', badges: '<span class="k-pill k-pill--gold k-pill--sm">Новый вид!</span>', foot: `<img src="${ic('lighthouse')}" alt=""><span>Остров <b>7 из 20</b> · до удочки «Маячная» ещё 1</span>` })}</div>`;
        tl = mc({ n: 7, p: 0.18, xp: '548 / 3 100', pop: '+48 опыта' });
      }
      scene.innerHTML = `
        <div class="k-slot k-slot--tc${dimmed}">${state === 'season' ? EV.greatFog : EV.fog}</div>
        <div class="k-slot k-slot--tl${dimmed}">${tl}</div>
        <div class="k-slot k-slot--tr${dimmed}">${badge({ tokens: '4 820', pop: state === 'catch' ? '+20' : '' })}${ctx({ img: gear('bag3.webp'), title: 'Рюкзак', val: `9 / 20 · 412 ${C}`, side: K.key('I'), v: 0.45 })}${ctx({ img: ic('livewell'), title: 'Лайвел «Альбакора»', val: `31 / 50`, v: 31 / 50 })}</div>
        <div class="k-slot k-slot--bl${dimmed}">${chat()}</div>
        ${state === 'fog' || state === 'season' ? `<div class="k-slot k-slot--bc">${PROMPT.wait}</div>` : ''}
        ${main}`;
    },
  });
}
