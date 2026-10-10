// Крепость: бой с волной, сбор и передышка, лавка оружейника, ворота/кристалл/башни, босс, «повалили», Tab и итоги, новичку.
// Только компоненты кита (kit.css + боевые kit/combat.css), своё CSS — раскладка с префиксом .ft-.
// Числа и тексты — из игры: shared/fortkinds.ts (враги), server/fort/director.ts (названия волн), shared/fortarsenal.ts
// (цены и ступени), client/fort/ui/boss.ts и krakenfx.ts (что делает босс), client/fort/match.ts (тревоги, «повалили»).
import { stage, section, K, sfx } from '../page/page.js';

const host = section('fort');
const F = (n) => `img/fort/${n}`;

/* ------------------------------------------------------------------ картинки
   Иконки — client/assets/ui/icons/ (копии в img/fort/). Что нарисовано — в HAVE (сейчас все); без файла — эмодзи-заглушка. */
const HAVE = new Set(['zombie.webp', 'climber.webp', 'bat.webp', 'brute.webp', 'champion.webp', 'boss.webp', 'landing.webp',
  'supply.webp', 'bomb.webp', 'horn.webp', 'gold.webp', 'lock.webp', 'gate.webp', 'crystal.webp', 'bell.webp', 'warn.webp',
  'shield.webp', 'heart.webp', 'hammer.webp', 'ladder.webp', 'paintballs.webp',
  'runner.webp', 'medic.webp', 'kraken.webp', 'white-flag.webp', 'meteor.webp', 'marker.webp']);
const img = (file, emo, cls = '') => (HAVE.has(file)
  ? `<img class="${cls}" src="${F(file)}" alt="">`
  : `<span class="ft-emo ${cls}" aria-hidden="true">${emo}</span><!-- TODO icon: ${file} -->`);
/** Золото крепости — совок самородков (не путать с жетоном-монетой в бейдже) */
const NUG = (cls = '') => `<img class="ft-nug ${cls}" src="${F('gold.webp')}" alt="">`;
const HEART = () => F('heart.webp');
const C = K.coin();
const fmt = (n) => n.toLocaleString('ru-RU');

/** Враги (shared/fortkinds.ts ZK): имя, картинка, заглушка, подсказка — на «ты» */
const FOE = {
  walker: { name: 'Шаркун', file: 'zombie.webp', emo: '🧟', hint: 'идёт к воротам · в голову — вдвое больнее' },
  runner: { name: 'Шустрик', file: 'runner.webp', emo: '🏃', hint: 'быстрый и хлипкий · встречай на подходе' },
  brute: { name: 'Бугай', file: 'brute.webp', emo: '💪', hint: 'ломает ворота за троих · бей издалека' },
  climber: { name: 'Липучка', file: 'climber.webp', emo: '🧗', hint: 'лезет по стене в обход ворот' },
  flyer: { name: 'Крылатка', file: 'bat.webp', emo: '🦇', hint: 'замирает перед пикированием · сбей или уйди с метки' },
  shield: { name: 'Щитоносец', file: 'shield.webp', emo: '🛡', hint: 'щит держит удары спереди · бей в голову сверху' },
  medic: { name: 'Лекарь', file: 'medic.webp', emo: '⛑', hint: 'лечит соседей зелёной волной · убирай первым' },
  baron: { name: 'Барон Варенья', file: 'boss.webp', emo: '👑', hint: 'бьёт по воротам и меткам · после удара ядро открыто' },
  kraken: { name: 'Кракен', file: 'kraken.webp', emo: '🐙', hint: 'руби щупальца, пока лежат после удара · без них голова открыта' },
  boat: { name: 'Десант', file: 'landing.webp', emo: '⛵', hint: 'лодка с моря · потопи до берега' },
  champ: { name: 'Чемпион', file: 'champion.webp', emo: '✪', hint: '×6 здоровья, награда ×5' },
};
const foeIc = (k, cls = '') => img(FOE[k].file, FOE[k].emo, cls);

/* ------------------------------------------------------------------ мелочи */
const meter = (v, cls = '', g = v, label = '') => `<div class="k-meter ${cls}" style="--v:${v};--g:${g}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i>${label ? `<span class="k-meter-label">${label}</span>` : ''}</div>`;
const pill = (inner, cls = '') => `<span class="k-pill ${cls}">${inner}</span>`;

/** Мини-карта: дороги с запада/севера/востока к воротам, двор с кристаллом, море на юге; ты — золотая стрелка */
function miniMap({ gate = 'ok', boss = false, sea = false } = {}) {
  const foes = [[14, 14], [24, 22], [33, 31], [64, 12], [64, 24], [64, 38], [112, 14], [101, 24]];
  const gateFill = gate === 'down' ? '#e0283a' : gate === 'hit' ? '#ff8a3a' : '#9a6a3a';
  return `<svg class="ft-map-svg" viewBox="0 0 128 128" aria-hidden="true">
    <rect width="128" height="128" fill="#7da866"/>
    <path d="M70 0 128 0 128 26Z" fill="#8cb873" opacity=".55"/>
    <g fill="none" stroke="#e8d7a8" stroke-width="7" stroke-linecap="round"><path d="M4 4 64 52"/><path d="M64 0v52"/><path d="M124 4 64 52"/></g>
    <rect x="36" y="56" width="56" height="50" rx="3" fill="#dccca4" stroke="#8a6b42" stroke-width="3"/>
    <rect x="57" y="51" width="14" height="9" rx="2" fill="${gateFill}" stroke="#4a2d14" stroke-width="2"/>
    <rect x="0" y="112" width="128" height="16" fill="#4aa6c8"/>
    ${sea ? '<path d="M98 120h10l-3 4h-5z" fill="#8a5a34" stroke="#3a2210" stroke-width="1.5"/>' : ''}
    <path d="M64 72 72 82 64 92 56 82Z" fill="#8fe8ff" stroke="#1b6d8a" stroke-width="2.2"/>
    <g fill="#e0283a" stroke="#3a0a10" stroke-width="1.5">${foes.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6"/>`).join('')}</g>
    <circle cx="37" cy="70" r="4.4" fill="#3db7ae" stroke="#0a3a36" stroke-width="1.6"/>
    <circle cx="96" cy="42" r="4.4" fill="#cf70d9" stroke="#3a0d40" stroke-width="1.6"/>
    ${boss ? '<circle cx="64" cy="34" r="8" fill="#8f5fc6" stroke="#ffd35a" stroke-width="3"/>' : ''}
    <g fill="#fff" stroke="#2a1f24" stroke-width="1.6"><circle cx="82" cy="60" r="3.6"/><circle cx="74" cy="96" r="3.6"/><circle cx="44" cy="62" r="3.6"/></g>
    <path d="M50 54 56 66 50 63 44 66Z" fill="#ffd35a" stroke="#3a2603" stroke-width="1.6" stroke-linejoin="round"/>
  </svg>`;
}

/** ВЛ «Режим»: мини-карта + прочность ворот и кристалла + щит колокола */
function fortCard({ gate = 0.86, gateG = gate, crystal = 1, crystalG = crystal, gateState = 'ok', bell = 'ready', boss = false, sea = false, spot = false } = {}) {
  const hp = (key, name, file, v, g, state) => {
    const pct = Math.round(v * 100);
    const low = state === 'down' || v < 0.35;
    return `<div class="ft-hp${low ? ' is-low' : ''}${state === 'hit' ? ' is-hit' : ''}">
      <img class="ft-hp-ic" src="${F(file)}" alt="">
      <span class="ft-hp-name">${name}</span>
      <b class="ft-hp-pct">${state === 'down' ? 'пали' : `${pct}%`}</b>
      ${meter(v, `k-meter--thin ${low ? 'k-meter--bad' : key === 'gate' ? 'k-meter--mode' : 'k-meter--info'}`, g)}
    </div>`;
  };
  const bellTxt = bell === 'ready' ? '<b class="k-good">Щит строений готов</b><small>E у колокола на террасе</small>' : '<b class="k-gold">Щит держит · 6 с</b><small>ворота и кристалл −50 % урона</small>';
  return `<div class="k-plate ft-fort${spot ? ' ft-spot' : ''}">
    <div class="ft-map">${miniMap({ gate: gateState, boss, sea })}</div>
    <div class="ft-hps">
      ${hp('gate', 'Ворота', 'gate.webp', gate, gateG, gateState)}
      ${hp('crys', 'Кристалл', 'crystal.webp', crystal, crystalG, 'ok')}
      <div class="ft-bell"><img src="${F('bell.webp')}" alt=""><span>${bellTxt}</span></div>
    </div>
  </div>`;
}

/** ВП «Игрок»: бейдж (уровень+жетоны) и под ним золото крепости, рекорд, команда */
const badge = ({ tokens = '1 250', pop = '' } = {}) => `
  <div class="k-badge"><span class="k-ring" style="--p:.64"><b>12</b></span>
    <span class="k-badge-body"><span class="k-badge-nick">Кракозябра</span><span class="k-badge-tokens">${C}${tokens}</span></span>
    ${pop ? `<span class="k-pop ft-still">${pop}</span>` : ''}</div>`;

const goldCard = (gold, { pop = '', spot = false } = {}) => `
  <div class="k-ctx ft-gold${spot ? ' ft-spot' : ''}">${NUG('k-ctx-ic')}
    <span class="k-ctx-title">Золото крепости</span>
    <span class="k-ctx-val">${fmt(gold)}${pop ? `<span class="ft-plus">${pop}</span>` : ''}</span></div>`;

const recordCard = ({ rec = 12, mine = 9, hot = false } = {}) => `
  <div class="k-ctx${hot ? ' k-ctx--own' : ''}"><img class="k-ctx-ic" src="${F('records.webp')}" alt="">
    <span class="k-ctx-title">Рекорд крепости</span>
    <span class="k-ctx-val">${hot ? 'Бьём рекорд!' : `${rec} волн`} <span class="ft-sub">${hot ? 'ещё 1 волна' : `твой ${mine}`}</span></span></div>`;

const TEAM = [
  { n: 'Ты', c: 'k-nick-6', me: true },
  { n: 'Паша', c: 'k-nick-1' },
  { n: 'Лиса', c: 'k-nick-4' },
  { n: 'Бочка', c: 'k-nick-2' },
];
const teamCard = ({ down = -1, ready = -1 } = {}) => `
  <div class="k-ctx ft-team-card"><img class="k-ctx-ic" src="${F('team.webp')}" alt="">
    <span class="k-ctx-title">${ready >= 0 ? `Готовы у колокола: ${ready} из 4` : `Команда · в бою ${down >= 0 ? 3 : 4} из 4`}</span>
    <span class="k-ctx-val ft-team">${TEAM.map((t, i) => `<span class="ft-mate ${t.c}${i === down ? ' is-down' : ''}${ready >= 0 && i < ready ? ' is-ready' : ''}${t.me ? ' is-me' : ''}">${t.n}${i === down ? ' <small>3 с</small>' : ''}</span>`).join('')}</span></div>`;

/** НЛ «Связь»: чат и голос одним доком */
const chat = (lines) => `
  <div class="k-chat ft-chat"><div class="k-chat-list">${lines.map(([cls, nick, text]) => `<div class="k-chat-line ${cls}">${nick ? `<b>${nick}</b>` : ''}${text}</div>`).join('')}</div>
    <div class="k-chat-bar"><button class="k-voice" aria-label="Голос">${K.mic}<kbd class="k-key k-key--sm">V</kbd></button>
      <div class="k-chat-closed">${K.key('Enter')}Написать в чат</div></div></div>`;
const CHAT_FIGHT = [['is-sys is-old', '', 'Лиса поднимается на стены'], ['k-nick-1', 'Паша', 'крылатки справа!'], ['k-nick-4', 'Лиса', 'держу запад']];
const CHAT_CALM = [['is-sys is-old', '', 'Бочка зашла в крепость'], ['k-nick-1', 'Паша', 'беру арбалет, кто на ворота?']];

/** НЦ: панель бойца (kit/combat.css) */
function vitals({ hp = 100, ammo = 24, mag = 30, gun = 0, gren = 2, low = false, down = false, spot = '' } = {}) {
  const arm = (i, file, name, key, extra = '') => `<div class="k-arm${gun === i ? ' is-on' : ''}${extra}${spot === key ? ' ft-spot' : ''}"><img src="${F(file)}" alt=""><span>${name}</span><kbd class="k-key k-key--sm k-key--tr">${key}</kbd></div>`;
  return `<div class="k-vitals${down ? ' is-down' : ''}">
    <div class="k-vitals-hp${low ? ' is-low' : ''}">
      <div class="k-vitals-row"><img class="k-vitals-ic" src="${HEART()}" alt=""><b class="k-vitals-num">${hp}</b></div>
      ${meter(hp / 100, 'k-meter--bad', low ? 0.62 : hp / 100)}
    </div>
    <div class="k-vitals-arms">
      ${arm(0, 'marker.webp', 'Маркер', '1')}
      ${arm(1, 'shotgun.webp', 'Дробовик', '2')}
      ${arm(9, 'gren.webp', `${gren} / 3`, 'G', gren ? '' : ' is-empty')}
    </div>
    <div class="k-vitals-ammo${ammo === 0 ? ' is-empty' : ''}">
      <div class="k-vitals-row"><kbd class="k-key k-key--sm">R</kbd><b class="k-vitals-num">${ammo}<small>/ ${mag}</small></b></div>
      ${meter(ammo / mag, 'k-meter--thin')}
      <div class="k-vitals-dash"><span class="k-vitals-cap">Рывок</span><kbd class="k-key k-key--sm">Shift</kbd>${meter(1, 'k-meter--thin k-meter--info')}</div>
    </div>
  </div>`;
}

const cross = (cls = '') => `<div class="k-cross ${cls}"><i></i><i></i><i></i><i></i></div>`;
const float = (x, y, html, cls = '') => `<span class="k-float ${cls}" style="left:${x}px;top:${y}px">${html}</span>`;
/** Стрелка угрозы у края (kit/combat.css) */
const edge = ({ x, y, a, foe, file, emo, label, tone = 'bad', side = '', hot = false, lg = false }) => {
  const pic = foe ? foeIc(foe) : img(file, emo);
  return `<div class="k-edge k-edge--${tone}${side ? ` k-edge--${side}` : ''}${hot ? ' is-hot' : ''}${lg ? ' k-edge--lg' : ''}" style="left:${x}px;top:${y}px;--a:${a}deg">
    <span class="k-edge-disc">${pic.replace('ft-emo', 'k-edge-emoji ft-emo')}</span><span class="k-edge-label">${label}</span></div>`;
};

/** Фишка врага в бою: картинка + ×N; новый враг — с именем */
const chip = (k, n, fresh = false) => pill(`${foeIc(k, 'k-ic')}${fresh ? `<b class="ft-new">${FOE[k].name}</b>` : ''}×${n}`, `ft-chip${fresh ? ' k-pill--gold' : ''}`);

/** ВЦ: плашка волны в бою */
function wavePlate({ w = 5, title = 'Крылатки', left = 23, total = 41, roads = 'с востока и севера', foes = [], boss = null }) {
  return `<div class="k-event k-lamp ft-wave" data-mode="fort">
    <span class="k-event-ic">${img('horn.webp', '📯')}</span>
    <div class="k-event-title">Волна ${w} <span class="ft-of">из 100</span> · ${title}</div>
    <div class="k-event-sub">Идут ${roads}</div>
    <div class="k-event-timer ft-left">${left}<small>осталось</small></div>
    ${meter(left / total, 'k-meter--thin k-meter--mode')}
    <div class="ft-foes">${foes.map(([k, n, f]) => chip(k, n, f)).join('')}${boss ?? ''}</div>
  </div>`;
}

const toast = (tone, icon, title, sub = '', extra = '') => `<div class="k-toast${tone ? ` k-toast--${tone}` : ''} ${extra}"><span class="k-toast-ic">${icon}</span><div class="k-toast-title">${title}</div>${sub ? `<div class="k-toast-sub">${sub}</div>` : ''}</div>`;

/* ================================================================== 1. бой с волной */
if (host) {
  const FIGHT_FOES = [['walker', 9], ['flyer', 6, true], ['climber', 4], ['runner', 4]];
  stage(host, {
    id: 'fort-fight',
    title: 'Бой: волна идёт',
    note: 'За секунду видно всё: какая волна и сколько осталось, целы ли ворота и кристалл, откуда лезут, твоё здоровье, патроны и золото. Тревоги и новости — одной стопкой под волной, а не в шести местах.',
    bg: F('bg-battle.jpg'),
    before: F('was-battle-courtyard.jpg'),
    mode: 'fort',
    states: [{ id: 'wave', label: 'волна' }, { id: 'alarm', label: 'ворота трещат' }, { id: 'vote', label: 'голосуют «сдаться»' }],
    render(scene, s) {
      const alarm = s === 'alarm';
      const vote = s === 'vote';
      const event = vote ? `
        <div class="k-event k-lamp k-event--special ft-wave" data-mode="fort">
          <span class="k-event-ic"><img src="${F('white-flag.webp')}" alt=""></span>
          <div class="k-event-title">Паша предлагает сдаться</div>
          <div class="k-event-sub">За 2 из 4 · нужно 3 · волна 5, осталось 23</div>
          <div class="k-event-timer">0:14</div>
          ${meter(0.7, 'k-meter--thin k-meter--special')}
          <div class="k-event-actions">
            <button class="k-btn k-btn--go k-btn--sm">За<kbd class="k-key k-key--sm k-key--tr">Y</kbd></button>
            <button class="k-btn k-btn--stop k-btn--sm">Против<kbd class="k-key k-key--sm k-key--tr">N</kbd></button>
          </div>
        </div>`
        : wavePlate({ foes: FIGHT_FOES });
      const toasts = vote ? '' : alarm
        ? toast('warn', `<img src="${F('warn.webp')}" alt="">`, 'Ворота вот-вот падут!', `Шаркуны у ворот · колокол даст щит на 8 с — <b>E у колокола</b>`, 'is-new')
          + toast('', foeIc('flyer'), 'Новый враг: Крылатка', FOE.flyer.hint)
        : toast('', foeIc('flyer'), 'Новый враг: Крылатка', FOE.flyer.hint)
          + toast('reward', NUG(), '+14 золота · Паша сбил крылатку', 'Часть награды — в общак, делим в конце волны');
      scene.innerHTML = `
        <div class="k-slot k-slot--tl">${fortCard(alarm ? { gate: 0.31, gateG: 0.44, gateState: 'hit' } : {})}</div>
        <div class="k-slot k-slot--tc">${event}<div class="k-toasts">${toasts}</div></div>
        <div class="k-slot k-slot--tr">${badge()}${goldCard(420, { pop: alarm ? '' : '+14' })}${recordCard()}${teamCard()}</div>
        <div class="k-slot k-slot--bl">${chat(CHAT_FIGHT)}</div>
        <div class="k-slot k-slot--bc">${vitals({ hp: alarm ? 38 : 100, low: alarm, ammo: alarm ? 7 : 24 })}</div>
        ${cross(alarm ? '' : 'is-head')}
        ${alarm ? '' : float(760, 392, '34', 'k-float--head') + float(500, 400, '20') + float(1040, 262, `${NUG()}+14`, 'k-float--gold')}
        ${edge({ x: 58, y: alarm ? 420 : 470, a: 180, foe: 'climber', label: 'Липучка на стене ×2 · <b>23 м</b>', tone: alarm ? 'mode' : 'bad', side: 'left' })}
        ${edge({ x: 1382, y: 470, a: 330, foe: 'flyer', label: 'Крылатка пикирует · <b>15 м</b>', tone: 'bad', side: 'right', hot: !vote })}
        ${s === 'wave' ? edge({ x: 1380, y: 640, a: 45, file: 'supply.webp', emo: '📦', label: 'Припасы · <b>31 м</b>', tone: 'gold', side: 'right' }) : ''}
        ${alarm ? edge({ x: 58, y: 590, a: 225, file: 'gate.webp', emo: '🚪', label: 'Ворота · <b>24 м</b>', tone: 'bad', side: 'left', hot: true }) : ''}`;
    },
  });

  /* ================================================================== 2. сбор и передышка */
  const legendRow = (k, n, { fresh = false, boss = false } = {}) => `
    <div class="ft-foe${fresh ? ' is-new' : ''}${boss ? ' is-boss' : ''}">
      ${foeIc(k, 'ft-foe-ic')}
      <div class="ft-foe-t"><b>${FOE[k].name}</b>${fresh ? '<span class="k-pill k-pill--gold k-pill--sm">новый</span>' : ''}${boss ? '<span class="k-pill k-pill--bad k-pill--sm">босс</span>' : ''}
        ${fresh || boss ? `<span class="ft-foe-hint">${FOE[k].hint}</span>` : ''}</div>
      <span class="ft-foe-n">${boss ? '' : `×${n}`}</span>
    </div>`;
  const ROADS = { w: '↖ запад', n: '↑ север', e: '↗ восток' };
  const roads = (on, extra = '') => `<div class="ft-roads"><span class="ft-roads-h">Откуда</span>${Object.entries(ROADS).map(([k, t]) => pill(t, `k-pill--sm ${on.includes(k) ? 'k-pill--bad' : 'ft-road-off'}`)).join('')}${extra}</div>`;

  const BREAKS = {
    gather: {
      w: 1, title: 'Первые гости', t: '0:20', v: 0.67, gold: 150,
      list: [['walker', 22]], roads: ['n'],
      bell: 'Все готовы — <b>E у колокола</b> на террасе: волна сразу',
      toasts: toast('reward', `<img src="${F('records.webp')}" alt="">`, 'Рекордов крепости ещё нет', 'Отбей первую волну — и рекорд ваш'),
      ready: 1,
    },
    break: {
      w: 7, title: 'Барон Варенья', t: '0:15', v: 0.8, gold: 340, boss: true,
      list: [['walker', 18], ['runner', 9], ['climber', 7], ['flyer', 7], ['shield', 4]], roads: ['w', 'e'],
      bell: 'Все готовы — <b>E у колокола</b>: волна через 3 с и <b class="k-gold">+10 % золота</b>',
      toasts: toast('reward', NUG(), 'Волна 6 отбита! +50 золота', 'Чистая волна — общак ×1,5'),
      ready: 2,
    },
    event: {
      w: 13, title: 'Лекари', t: '0:15', v: 0.4, gold: 1180,
      list: [['medic', 4, true], ['walker', 21], ['runner', 6], ['brute', 5], ['shield', 5], ['boat', 1]], roads: ['n', 'w'],
      extra: pill(`${foeIc('boat', 'k-ic')}море · 1 лодка`, 'k-pill--sm k-pill--bad') ,
      ev: { emo: '☄', file: 'meteor.webp', name: 'Метеоры', hint: 'красные круги бьют всех — не стой на месте' },
      bell: 'Все готовы — <b>E у колокола</b>: волна через 3 с и <b class="k-gold">+10 % золота</b>',
      toasts: toast('reward', NUG(), 'Волна 12 отбита! +80 золота', ''),
      ready: 3,
    },
  };
  stage(host, {
    id: 'fort-break',
    title: 'Сбор и передышка: кто идёт дальше',
    note: 'Новое: под карточкой «Дальше» — видимая легенда врагов картинками с названиями и числом, без подсказок под мышкой. Новичок и босс — с одной строкой «что делать». Откуда идут — словами.',
    bg: F('bg-battle.jpg'),
    before: F('was-hud.jpg'),
    mode: 'fort',
    states: [{ id: 'gather', label: 'сбор перед 1-й' }, { id: 'break', label: 'передышка, дальше босс' }, { id: 'event', label: 'с событием и десантом' }],
    render(scene, s) {
      const b = BREAKS[s];
      const bossRow = b.boss ? legendRow('baron', 1, { boss: true }) : '';
      scene.innerHTML = `
        <div class="k-slot k-slot--tl">${fortCard({ gate: s === 'gather' ? 1 : 0.62, crystal: s === 'event' ? 0.84 : 1, sea: s === 'event' })}</div>
        <div class="k-slot k-slot--tc">
          <div class="k-event k-lamp ft-wave ft-next${b.boss ? ' k-event--danger' : ''}" data-mode="fort">
            <span class="k-event-ic">${b.boss ? foeIc('baron') : foeIc('walker')}</span>
            <div class="k-event-title">Дальше: волна ${b.w} · ${b.title}</div>
            <div class="k-event-sub">${s === 'gather' ? 'Сбор — закупись у лавки и займи стену' : 'Передышка — почини ворота, закупись'}</div>
            <div class="k-event-timer">${b.t}</div>
            ${meter(b.v, `k-meter--thin ${b.boss ? 'k-meter--bad' : 'k-meter--mode'}`)}
            <div class="ft-legend">${bossRow}${b.list.map(([k, n, f]) => legendRow(k, n, { fresh: !!f })).join('')}</div>
            ${roads(b.roads, b.extra ?? '')}
            ${b.ev ? `<div class="ft-evline">${img(b.ev.file, b.ev.emo, 'k-ic')}<b>${b.ev.name}</b><span>${b.ev.hint}</span></div>` : ''}
            <div class="ft-bellline"><img src="${F('bell.webp')}" alt=""><span>${b.bell}</span></div>
          </div>
          <div class="k-toasts">${b.toasts}</div>
        </div>
        <div class="k-slot k-slot--tr">${badge()}${goldCard(b.gold)}${recordCard(s === 'gather' ? { rec: 0 } : {}).replace('0 волн', 'пока нет')}${teamCard({ ready: b.ready })}</div>
        <div class="k-slot k-slot--bl">${chat(CHAT_CALM)}</div>
        <div class="k-slot k-slot--bc">
          <div class="k-prompt">${K.key('E')}Лавка оружейника<span class="k-prompt-sep"></span><span class="k-prompt-note">прокачка, стволы, гранаты</span></div>
          ${vitals({ ammo: 30 })}
        </div>
        ${cross()}`;
    },
  });

  /* ================================================================== 3. лавка оружейника */
  // shared/fortarsenal.ts: UPGRADES base·1,6^ступень (nicePrice), гранаты 60+3·волна, стволы 500/650/800. Волна 7, золото 340.
  const nice = (v) => { const st = v < 100 ? 5 : v < 1000 ? 10 : 50; return Math.max(st, Math.round(v / st) * st); };
  const SHOP0 = () => ({
    gold: 340, msg: '', flash: -1, ok: false,
    rows: [
      { key: '1', file: 'dmg.webp', name: 'Урон', base: 150, t: 2, max: 60, det: (t) => `+20 % урона · ×${(1.2 ** t).toFixed(2).replace('.', ',')} → ×${(1.2 ** (t + 1)).toFixed(2).replace('.', ',')}` },
      { key: '2', file: 'rate.webp', name: 'Темп', base: 200, t: 1, max: 8, det: (t) => `быстрее · ×${(1.1 ** t).toFixed(2).replace('.', ',').replace(/0$/, '')} → ×${(1.1 ** (t + 1)).toFixed(2).replace('.', ',').replace(/0$/, '')}` },
      { key: '3', file: 'mag.webp', name: 'Магазин', base: 150, t: 0, max: 6, det: (t) => `маркер ${Math.round(30 * (1 + 0.25 * t))} → ${Math.round(30 * (1 + 0.25 * (t + 1)))} патронов` },
      { key: '4', file: 'crit.webp', name: 'Крит', base: 250, t: 1, max: 8, det: (t) => `шанс ×2,5 урона · ${5 * t} → ${5 * (t + 1)} %` },
      { key: '5', file: 'gren.webp', name: 'Гранаты +2', price: 81, det: () => 'в запасе 1 из 3 · бросок G' },
      { key: '6', file: 'pouch.webp', name: 'Подсумок', base: 250, t: 0, max: 3, det: (t) => `запас гранат ${3 + t} → ${4 + t}` },
      { key: '7', file: 'shotgun.webp', name: 'Дробовик', owned: true, det: () => 'толпа у ворот · 8×15' },
      { key: '8', file: 'crossbow.webp', name: 'Арбалет', price: 650, det: () => 'бугаи, головы, ядро босса' },
      { key: '9', file: 'mg.webp', name: 'Пулемёт', price: 800, det: () => 'поток, налёт · магазин 100' },
    ],
  });
  const priceOf = (r) => (r.owned ? 0 : r.price ?? nice(r.base * 1.6 ** r.t));
  /** ступени: число словами в строке имени, полоска делений — под картинкой */
  const tierTxt = (t, max) => (max == null ? '' : `<span class="ft-tier">${max > 10 ? `ступень ${t}` : `${t} из ${max}`}</span>`);
  const pipBar = (t, max) => (max == null || max > 10 ? '' : `<span class="ft-pips" aria-hidden="true">${Array.from({ length: max }, (_, i) => `<i${i < t ? ' class="on"' : ''}></i>`).join('')}</span>`);
  const icw = (file, t, max) => `<span class="ft-row-icw"><img class="ft-row-ic" src="${F(file)}" alt="">${pipBar(t, max)}</span>`;
  const shopRow = (r, i, st) => {
    const p = priceOf(r);
    const poor = !r.owned && p > st.gold;
    const buy = r.owned
      ? pill('Взять', 'k-pill--good')
      : poor
        ? `${pill(`${NUG()}${fmt(p)}`, 'k-pill--bad')}<span class="ft-why">не хватает ${fmt(p - st.gold)}</span>`
        : pill(`${NUG()}${fmt(p)}`, 'k-pill--gold');
    return `<button type="button" class="k-cell ft-row${poor ? ' is-poor' : ''}${st.flash === i ? (st.ok ? ' is-ok' : ' is-no') : ''}" data-row="${i}">
      <kbd class="k-key k-key--tl">${r.key}</kbd>
      ${icw(r.file, r.t, r.max)}
      <span class="ft-row-main"><span class="ft-row-name"><b>${r.name}</b>${tierTxt(r.t, r.max)}</span><span class="ft-row-det">${r.det(r.t ?? 0)}</span></span>
      <span class="ft-row-buy">${buy}</span>
    </button>`;
  };
  const stall = ({ title, eyebrow, gold, body, foot }) => `
    <section class="k-window ft-stall is-in" aria-label="${title}">
      <header class="k-win-head">
        <div class="k-win-titles"><h2 class="k-win-title">${title}</h2>${eyebrow ? `<p class="ft-stall-sub">${eyebrow}</p>` : ''}</div>
        <div class="k-win-tools">${pill(`${NUG()}${fmt(gold)}`, 'k-pill--gold ft-gold-pill')}<button class="k-close" aria-label="Закрыть"><kbd class="k-key k-key--sm">E</kbd></button></div>
      </header>
      <div class="k-win-body">${body}</div>
      <footer class="k-win-foot">${foot}</footer>
    </section>`;

  let shop = SHOP0();
  const shopHtml = (st) => stall({
    title: 'Лавка оружейника', eyebrow: '', gold: st.gold,
    body: `<div class="ft-rows">${st.rows.map((r, i) => shopRow(r, i, st)).join('')}</div>`,
    foot: `<span class="k-note ft-msg${st.msg && !st.ok ? ' k-bad' : st.msg ? ' k-good' : ''}">${st.msg || 'Покупки — до конца игры · 1–9 — купить'}</span>`,
  });
  stage(host, {
    id: 'fort-shop',
    title: 'Лавка оружейника — не закрывает бой',
    note: 'Прилавок справа, панель бойца снизу видна целиком. Крупные строки с картинками, клавиша 1–9 на углу, ступени прокачки видны, а «не хватает 40» — прямо у цены. Нажимай строки — покупка работает.',
    bg: F('bg-battle.jpg'),
    before: F('was-arsenal.jpg'),
    mode: 'fort',
    states: [{ id: 'open', label: 'лавка открыта' }, { id: 'poor', label: 'не хватает золота' }, { id: 'bought', label: 'купил' }],
    render(scene, s) {
      shop = SHOP0();
      if (s === 'poor') Object.assign(shop, { flash: 0, ok: false, msg: 'Не хватает 40 — «Урон» стоит 380, у тебя 340' });
      if (s === 'bought') { shop.rows[1].t = 2; Object.assign(shop, { gold: 20, flash: 1, ok: true, msg: 'Куплено: Темп — ступень 2 из 8' }); }
      scene.innerHTML = `
        <div class="k-slot k-slot--tl">${fortCard({ gate: 0.62 })}</div>
        <div class="k-slot k-slot--tc">
          <div class="k-event k-lamp ft-wave" data-mode="fort"><span class="k-event-ic">${foeIc('baron')}</span>
            <div class="k-event-title">Дальше: волна 7 · Барон Варенья</div><div class="k-event-sub">Передышка — почини ворота, закупись</div>
            <div class="k-event-timer">0:11</div>${meter(0.6, 'k-meter--thin k-meter--bad')}</div>
          <div class="k-toasts">${s === 'bought' ? toast('good', `<img src="${F('rate.webp')}" alt="">`, 'Темп: ступень 2', 'Стреляешь и перезаряжаешься быстрее') : ''}</div>
        </div>
        <div class="k-slot k-slot--tr">${badge()}</div>
        <div class="ft-stall-wrap">${shopHtml(shop)}</div>
        <div class="k-slot k-slot--bl">${chat(CHAT_CALM)}</div>
        <div class="k-slot k-slot--bc">${vitals({ ammo: 30 })}</div>
        ${cross()}`;
      const wrap = scene.querySelector('.ft-stall-wrap');
      wrap.addEventListener('click', (e) => {
        const b = e.target.closest('.ft-row');
        if (!b) return;
        const r = shop.rows[+b.dataset.row];
        const p = priceOf(r);
        if (r.owned) { Object.assign(shop, { flash: +b.dataset.row, ok: true, msg: 'Дробовик в руках — переключай на 1 и 2' }); sfx.play('pop'); }
        else if (p > shop.gold) { Object.assign(shop, { flash: +b.dataset.row, ok: false, msg: `Не хватает ${fmt(p - shop.gold)} — «${r.name}» стоит ${fmt(p)}, у тебя ${fmt(shop.gold)}` }); sfx.play('error'); }
        else {
          shop.gold -= p;
          if (r.t != null) r.t += 1; else if (r.price) r.owned = true;
          Object.assign(shop, { flash: +b.dataset.row, ok: true, msg: `Куплено: ${r.name}${r.max ? ` — ступень ${r.t}${r.max <= 10 ? ` из ${r.max}` : ''}` : ''}` });
          sfx.play('reward');
        }
        wrap.innerHTML = shopHtml(shop);
      });
    },
  });

  /* ================================================================== 4. ворота, кристалл, башня */
  const plainRow = (i, file, name, det, price, gold, { tier = null, max = null, locked = '' } = {}) => {
    const poor = !locked && price > gold;
    const buy = locked ? `<span class="ft-why ft-why--lock">${img('lock.webp', '🔒', 'ft-lock')}${locked}</span>`
      : poor ? `${pill(`${NUG()}${fmt(price)}`, 'k-pill--bad')}<span class="ft-why">не хватает ${fmt(price - gold)}</span>`
        : pill(`${NUG()}${fmt(price)}`, 'k-pill--gold');
    return `<div class="k-cell ft-row${poor ? ' is-poor' : ''}${locked ? ' is-locked' : ''}"><kbd class="k-key k-key--tl">${i}</kbd>
      ${icw(file, tier, max)}<span class="ft-row-main"><span class="ft-row-name"><b>${name}</b>${tierTxt(tier, max)}</span><span class="ft-row-det">${det}</span></span>
      <span class="ft-row-buy">${buy}</span></div>`;
  };
  const strength = (file, v, now, max, cls) => `<div class="k-stat ft-strength"><img class="k-stat-ic" src="${F(file)}" alt=""><div class="k-stat-num">${Math.round(v * 100)}%</div>
    <div class="k-stat-cap">Прочность ${fmt(now)} из ${fmt(max)}</div>${meter(v, cls)}</div>`;
  const REPAIR = {
    gate: () => stall({
      title: 'Ворота', eyebrow: 'Чинят и укрепляют здесь', gold: 340,
      body: `${strength('gate.webp', 0.62, 1240, 2000, 'k-meter--mode')}<div class="ft-rows">
        ${plainRow(1, 'hammer.webp', 'Ремонт ворот', '+25 % прочности сейчас', 68, 340)}
        ${plainRow(2, 'gate.webp', 'Укрепить ворота', `навсегда: ${fmt(2000)} → ${fmt(2400)}`, 320, 340, { tier: 1, max: 8 })}
        ${plainRow(3, 'gate.webp', 'Новые ворота', `прочность ${fmt(2000)}`, 176, 340, { locked: 'ворота стоят' })}</div>`,
      foot: '<span class="k-note">Ворота сломали — новые ставят в передышку</span>',
    }),
    crystal: () => stall({
      title: 'Кристалл', eyebrow: 'Разбили кристалл — игра окончена', gold: 340,
      body: `${strength('crystal.webp', 0.84, 2100, 2500, 'k-meter--info')}<div class="ft-rows">
        ${plainRow(1, 'crystal.webp', 'Подлечить кристалл', '+10 % прочности сейчас', 102, 340)}
        ${plainRow(2, 'crystal.webp', 'Укрепить кристалл', `навсегда: ${fmt(2500)} → ${fmt(3000)}`, 250, 340, { tier: 0, max: 5 })}</div>`,
      foot: '<span class="k-note">Лечить можно и в бою — не стой на месте</span>',
    }),
    tower: () => stall({
      title: 'Северо-западный бастион', eyebrow: 'Место для башни · пусто', gold: 340,
      body: `<p class="ft-tower-note">Башня общая: награда за сбитых — тем, кто вложился.</p><div class="ft-rows">
        ${plainRow(1, 'ballista.webp', 'Баллиста', 'одна цель · сначала крылатые', 300, 340)}
        ${plainRow(2, 'cannon.webp', 'Пушка', 'ядро по площади, отброс', 400, 340)}
        ${plainRow(3, 'tar.webp', 'Смоляной котёл', 'лужа смолы: −55 % скорости', 300, 340)}
        ${plainRow(4, 'brazier.webp', 'Жаровня', 'угли: поджог вблизи', 350, 340)}</div>`,
      foot: '<span class="k-note">Потом здесь же — улучшение до 10-го уровня</span>',
    }),
  };
  stage(host, {
    id: 'fort-repair',
    title: 'Ворота, кристалл и башни — то же окно',
    note: 'У ворот, кристалла и места для башни открывается тот же прилавок: сверху прочность крупно, ниже — что можно сделать. Почему нельзя («ворота стоят») — отдельной строкой, а не в тексте кнопки.',
    bg: F('bg-battle.jpg'),
    before: F('was-arsenal.jpg'),
    mode: 'fort',
    states: [{ id: 'gate', label: 'ворота' }, { id: 'crystal', label: 'кристалл' }, { id: 'tower', label: 'место для башни' }],
    render(scene, s) {
      scene.innerHTML = `
        <div class="k-slot k-slot--tl">${fortCard({ gate: 0.62, crystal: 0.84 })}</div>
        <div class="k-slot k-slot--tc">
          <div class="k-event k-lamp ft-wave" data-mode="fort"><span class="k-event-ic">${foeIc('baron')}</span>
            <div class="k-event-title">Дальше: волна 7 · Барон Варенья</div><div class="k-event-sub">Передышка — почини ворота, закупись</div>
            <div class="k-event-timer">0:09</div>${meter(0.5, 'k-meter--thin k-meter--bad')}</div>
        </div>
        <div class="k-slot k-slot--tr">${badge()}</div>
        <div class="ft-stall-wrap">${REPAIR[s]()}</div>
        <div class="k-slot k-slot--bl">${chat(CHAT_CALM)}</div>
        <div class="k-slot k-slot--bc">${vitals({ ammo: 30 })}</div>
        ${cross()}`;
    },
  });

  /* ================================================================== 5. босс */
  const BOSS = {
    armor: { hp: 0.74, g: 0.8, num: '1 628 / 2 200', rage: false, open: 0, act: 'Замах по воротам — уйди с красной метки', danger: true },
    open: { hp: 0.41, g: 0.55, num: '902 / 2 200', rage: true, open: 0.8, act: 'Бей в ядро', danger: false },
  };
  const bossPlate = (s) => {
    if (s === 'kraken') {
      const parts = [['Щупальце', 0], ['Щупальце', 0.35], ['Щупальце', 0.8], ['Щупальце', 1], ['Голова', 0.62]];
      return `<div class="k-event k-lamp k-event--special ft-wave ft-boss" data-mode="fort">
        <span class="k-event-ic">${foeIc('kraken')}</span>
        <div class="k-event-title">Кракен <span class="k-pill k-pill--special k-pill--sm">супер-босс</span></div>
        <div class="k-event-sub">Волна 25 из 100 · ещё 31 зомби на стенах</div>
        <div class="k-event-timer ft-left">62%<small>здоровья</small></div>
        ${meter(0.62, 'k-meter--lg k-meter--special', 0.7, '1 860 / 3 000')}
        <div class="ft-parts">${parts.map(([n, v]) => `<div class="ft-part${v === 0 ? ' is-off' : ''}"><span>${n}</span>${meter(v, `k-meter--thin ${n === 'Голова' ? 'k-meter--special' : 'k-meter--bad'}`)}</div>`).join('')}</div>
        <div class="ft-do"><img src="${F('warn.webp')}" alt=""><span><b>Руби щупальца, пока лежат после удара</b> — без них голова открыта</span></div>
      </div>`;
    }
    const b = BOSS[s];
    return `<div class="k-event k-lamp k-event--danger ft-wave ft-boss" data-mode="fort">
      <span class="k-event-ic">${foeIc('baron')}</span>
      <div class="k-event-title">Барон Варенья ${b.rage ? '<span class="k-pill k-pill--bad k-pill--sm">Ярость</span>' : ''}</div>
      <div class="k-event-sub">Волна 7 из 100 · ещё 12 зомби</div>
      <div class="k-event-timer ft-left">${Math.round(b.hp * 100)}%<small>здоровья</small></div>
      ${meter(b.hp, 'k-meter--lg k-meter--bad', b.g, b.num)}
      ${b.open ? `<div class="ft-window">${meter(b.open, 'k-meter--info k-meter--lg', b.open, 'Ядро открыто — огонь! 2,4 с')}</div>` : ''}
      <div class="ft-do${b.danger ? ' is-danger' : ' is-go'}"><img src="${F(b.danger ? 'warn.webp' : 'crossbow.webp')}" alt=""><span><b>${b.act}</b>${b.danger ? ' · после удара ядро откроется' : ' — арбалет и выстрел в голову больнее всего'}</span></div>
    </div>`;
  };
  stage(host, {
    id: 'fort-boss',
    title: 'Босс: полоса, окно уязвимости и что делать',
    note: 'Полоса босса — часть той же плашки сверху. Под ней одна строка: что он делает и что делать тебе. Когда ядро открыто, появляется бирюзовая полоса окна с секундами. У Кракена — щупальца отдельными полосками.',
    bg: F('bg-battle.jpg'),
    before: F('was-battle-spiders.jpg'),
    mode: 'fort',
    states: [{ id: 'armor', label: 'Барон в броне' }, { id: 'open', label: 'ядро открыто' }, { id: 'kraken', label: 'Кракен' }],
    render(scene, s) {
      const kraken = s === 'kraken';
      scene.innerHTML = `
        <div class="k-slot k-slot--tl">${fortCard({ gate: kraken ? 0.7 : 0.48, gateG: kraken ? 0.7 : 0.6, gateState: s === 'armor' ? 'hit' : 'ok', boss: !kraken, sea: kraken })}</div>
        <div class="k-slot k-slot--tc">${bossPlate(s)}<div class="k-toasts">${s === 'open' ? toast('warn', foeIc('flyer'), 'Барон в ярости — зовёт крылаток', 'Сбей их, пока не спикировали') : ''}</div></div>
        <div class="k-slot k-slot--tr">${badge()}${goldCard(kraken ? 4210 : 620)}${recordCard(kraken ? { rec: 24, hot: true } : {})}${teamCard()}</div>
        <div class="k-slot k-slot--bl">${chat(CHAT_FIGHT)}</div>
        <div class="k-slot k-slot--bc">${vitals({ gun: s === 'open' ? 1 : 0, ammo: s === 'open' ? 5 : 22, mag: s === 'open' ? 8 : 30, hp: 72 })}</div>
        ${cross(s === 'open' ? 'is-head' : '')}
        ${s === 'open' ? float(790, 392, '85<small>×2,5</small>', 'k-float--crit') + float(660, 372, '120', 'k-float--head') : ''}
        ${kraken
          ? edge({ x: 1372, y: 640, a: 60, foe: 'kraken', label: 'Кракен в бухте · <b>40 м</b>', tone: 'special', lg: true, side: 'right' })
          : edge({ x: 1370, y: 520, a: 0, foe: 'baron', label: 'Барон · <b>31 м</b>', tone: 'bad', side: 'right', lg: true, hot: s === 'armor' })}`;
    },
  });

  /* ================================================================== 6. повалили */
  stage(host, {
    id: 'fort-down',
    title: '«Тебя повалили!» — и когда обратно',
    note: 'По центру — крупно, почему повалили и через сколько встанешь. Остальное притихает, но волна и ворота видны: можно планировать, пока ждёшь.',
    bg: F('bg-battle.jpg'),
    before: F('was-battle-zombies.jpg'),
    mode: 'fort',
    render(scene) {
      scene.innerHTML = `
        <div class="k-slot k-slot--tl ft-hush">${fortCard({ gate: 0.55 })}</div>
        <div class="k-slot k-slot--tc">${wavePlate({ foes: [['walker', 9], ['flyer', 6], ['climber', 4], ['runner', 4]] })}</div>
        <div class="k-slot k-slot--tr ft-hush">${badge()}${goldCard(420)}${recordCard()}${teamCard({ down: 0 })}</div>
        <div class="k-slot k-slot--bl">${chat([...CHAT_FIGHT.slice(1), ['k-nick-4', 'Лиса', 'держись, прикрою']])}</div>
        <div class="k-slot k-slot--c ft-down">
          <div class="k-hero k-hero--lose is-pop"><p class="k-hero-title is-sm">Тебя повалили!</p>
            <span class="k-hero-sub">${foeIc('flyer', 'k-ic')}Крылатка спикировала — поглядывай в небо</span></div>
          <div class="k-plate ft-respawn"><span>Снова в бой через</span><b>3,4 с</b>${meter(0.32, 'k-meter--good')}<span class="ft-sub">встанешь на террасе</span></div>
        </div>
        <div class="k-slot k-slot--bc">${vitals({ hp: 0, ammo: 24, down: true })}</div>`;
    },
  });

  /* ================================================================== 7. Tab и итоги */
  const DEF = [
    { n: 'Лиса', lv: 33, k: 214, d: 1, g: 2860, w: 12, tok: 108, mvp: true },
    { n: 'Кракозябра', lv: 12, k: 146, d: 2, g: 2140, w: 12, tok: 112, me: true },
    { n: 'Паша', lv: 27, k: 131, d: 4, g: 1960, w: 12, tok: 97 },
    { n: 'Бочка', lv: 8, k: 58, d: 6, g: 940, w: 9, tok: 71 },
  ];
  const ring = (lv, p = 0.5) => `<span class="k-ring k-ring--sm" style="--p:${p}"><b>${lv}</b></span>`;
  const tabWin = () => `
    <div class="k-scrim ft-scrim-light"><section class="k-window ft-tab is-in">
      <header class="k-win-head"><div class="k-win-titles"><p class="k-eyebrow">Отпусти Tab — закроется</p><h2 class="k-win-title">Защитники · волна 5</h2></div>
        <div class="k-win-tools">${pill(`${NUG()}общак волны 64`, 'k-pill--gold')}</div></header>
      <div class="k-win-body">
        <table class="k-table"><thead><tr><th></th><th>Защитник</th><th class="k-r">Сбил</th><th class="k-r">Повален</th><th class="k-r">Золото</th><th class="k-r">Связь</th></tr></thead><tbody>
          ${DEF.map((d, i) => `<tr${d.me ? ' class="is-own"' : ''}><td>${ring(d.lv, 0.3 + i * 0.15)}</td><td><span class="k-who">${d.n}${i === 2 ? '<span class="k-pill k-pill--good k-pill--sm"><span class="k-eq"><i></i><i></i><i></i></span>говорит</span>' : ''}</span></td>
            <td class="k-r">${Math.round(d.k / 3)}</td><td class="k-r">${i === 3 ? 2 : i === 1 ? 1 : 0}</td><td class="k-r">${fmt(Math.round(d.g / 5))}</td><td class="k-r ft-ping">${[38, 24, 61, 45][i]} мс</td></tr>`).join('')}
        </tbody></table>
        <p class="ft-tab-h">Остальные — не в крепости</p>
        <div class="ft-others">${pill('Комета · Гонка', 'k-pill--sm')}${pill('Nemo · Прятки', 'k-pill--sm')}${pill('Ёжик · Набережная', 'k-pill--sm')}</div>
      </div>
      <footer class="k-win-foot"><span class="k-note">Золото со сбитых — 60 % стрелку, 40 % в общак: в конце волны делим поровну</span></footer>
    </section></div>`;
  const results = (rec) => `
    <div class="k-scrim"><section class="k-window ft-results is-in${rec ? ' k-lamp' : ''}">
      <div class="k-results-head">
        <p class="k-eyebrow">Крепость · ${rec ? 'новый рекорд!' : 'игра окончена'}</p>
        <h2 class="k-results-title${rec ? '' : ' ft-lose'}">${rec ? 'Новый рекорд крепости!' : 'Крепость пала на волне 13'}</h2>
        <p class="k-results-sub">${rec ? 'Отбито 12 волн — прежний рекорд 9. Кристалл разбит на 13-й' : 'Отбито волн: 12 · рекорд крепости — 14 (Паша, Лиса)'}</p>
      </div>
      <div class="k-win-body">
        <div class="ft-mvp">${ring(33, 0.55)}<span><b>Лиса</b> — лучший защитник · сбила 214 · добыла ${fmt(2860)} ${NUG()}</span><span class="k-pill k-pill--gold k-pill--sm">+10 жетонов</span></div>
        <table class="k-table"><thead><tr><th>Защитник</th><th class="k-r">Сбил</th><th class="k-r">Повален</th><th class="k-r">Золото</th><th class="k-r">Волн</th><th class="k-r">Жетоны</th></tr></thead><tbody>
          ${DEF.map((d) => `<tr${d.me ? ' class="is-own"' : ''}><td><span class="k-who">${d.n}${d.me ? ' <span class="k-pill k-pill--gold k-pill--sm">ты</span>' : ''}</span></td><td class="k-r">${d.k}</td><td class="k-r">${d.d}</td><td class="k-r">${fmt(d.g)}</td><td class="k-r">${d.w}</td><td class="k-r">+${rec ? d.tok : d.tok - 15}</td></tr>`).join('')}
          <tr class="ft-total"><td>Вся команда</td><td class="k-r">549</td><td class="k-r">13</td><td class="k-r">${fmt(7900)}</td><td class="k-r">12</td><td class="k-r"></td></tr>
        </tbody></table>
        <div class="k-reward">${C}<b>+${rec ? 112 : 97}</b> жетонов тебе${rec ? ' · из них +15 за рекорд' : ''}</div>
      </div>
      <div class="k-results-actions">
        <button class="k-btn k-btn--go">Ещё раз<small>новая игра через 14 с</small><kbd class="k-key k-key--tr">E</kbd></button>
        <button class="k-btn k-btn--ghost">На набережную<kbd class="k-key k-key--tr">Esc</kbd></button>
      </div>
    </section></div>`;
  stage(host, {
    id: 'fort-board',
    title: 'Tab в бою и итоги игры',
    note: 'Tab — твоя команда со счётом боя и кто где ещё. Итоги — с кнопками «Ещё раз» и «На набережную», твоя строка золотом, жетоны крупно, рекорд — праздником.',
    bg: F('bg-battle.jpg'),
    before: F('was-results-b.jpg'),
    mode: 'fort',
    states: [{ id: 'tab', label: 'Tab в бою' }, { id: 'lose', label: 'итоги' }, { id: 'rec', label: 'итоги с рекордом' }],
    render(scene, s) {
      scene.innerHTML = `
        <div class="k-slot k-slot--tr">${badge({ tokens: s === 'tab' ? '1 250' : s === 'rec' ? '1 362' : '1 347', pop: s === 'tab' ? '' : `+${s === 'rec' ? 112 : 97}` })}</div>
        ${s === 'tab' ? `<div class="k-slot k-slot--tl">${fortCard({ gate: 0.86 })}</div><div class="k-slot k-slot--bc">${vitals()}</div>${tabWin()}` : results(s === 'rec')}`;
    },
  });

  /* ================================================================== 8. новичку */
  const COACH = [
    { t: 'Защити кристалл', s: `Зомби ломают ворота и идут к кристаллу во дворе. Разбили кристалл — игра окончена. Стреляй со стены: к лестнице во дворе — ${K.key('W', 'k-key--sm')} лицом к ней.`, spot: 'fort', prompt: `${K.key('W')}<img class="k-ic" src="${F('ladder.webp')}" alt="">Лицом к лестнице — наверх, на стену` },
    { t: 'Целься в голову', s: `В голову — больше урона. За каждого сбитого — золото, часть идёт в общак. ${K.key('G', 'k-key--sm')} — граната в толпу у ворот.`, spot: 'G', prompt: '' },
    { t: 'Трать золото', s: `${K.key('E', 'k-key--sm')} у прилавка на террасе — урон, темп, второй ствол. На стене у флажков — места для башен. Ворота и кристалл чинят у них самих.`, spot: 'gold', prompt: `${K.key('E')}Лавка оружейника<span class="k-prompt-sep"></span><span class="k-prompt-note">прокачка, стволы, гранаты</span>` },
  ];
  stage(host, {
    id: 'fort-coach',
    title: 'Первая игра: три подсказки новичку',
    note: 'Подсказка новичку — та же карточка в той же стопке под волной, а не отдельная панель слева. Новое: то, о чём она говорит, подсвечено на экране золотой рамкой.',
    bg: F('bg-battle.jpg'),
    before: F('was-hud.jpg'),
    mode: 'fort',
    states: COACH.map((c, i) => ({ id: String(i), label: `${i + 1} из 3 · ${c.t.toLowerCase()}` })),
    render(scene, s) {
      const i = +s;
      const c = COACH[i];
      scene.innerHTML = `
        <div class="k-slot k-slot--tl">${fortCard({ spot: c.spot === 'fort' })}</div>
        <div class="k-slot k-slot--tc">
          ${i === 0
            ? `<div class="k-event k-lamp ft-wave" data-mode="fort"><span class="k-event-ic">${foeIc('walker')}</span><div class="k-event-title">Дальше: волна 1 · Первые гости</div>
                <div class="k-event-sub">Сбор — закупись у лавки и займи стену</div><div class="k-event-timer">0:20</div>${meter(0.67, 'k-meter--thin k-meter--mode')}</div>`
            : wavePlate({ w: 1, title: 'Первые гости', left: 15, total: 22, roads: 'с севера', foes: [['walker', 15]] })}
          <div class="k-toasts">
            <div class="k-toast ft-coach is-new"><span class="k-toast-ic"><img src="${F('scroll.webp')}" alt=""></span>
              <div class="k-toast-title"><span class="ft-coach-n">Новичку · ${i + 1} из 3</span>${c.t}</div>
              <div class="k-toast-sub">${c.s}</div>
              ${meter(0.7 - i * 0.15, 'k-meter--thin k-meter--mode ft-coach-time')}</div>
          </div>
        </div>
        <div class="k-slot k-slot--tr">${badge()}${goldCard(i === 2 ? 190 : 150, { spot: c.spot === 'gold', pop: i === 2 ? '+12' : '' })}${recordCard({ rec: 0 }).replace('0 волн', 'пока нет')}${teamCard()}</div>
        <div class="k-slot k-slot--bl">${chat(CHAT_CALM)}</div>
        <div class="k-slot k-slot--bc">${c.prompt ? `<div class="k-prompt">${c.prompt}</div>` : ''}${vitals({ ammo: i === 1 ? 26 : 30, spot: c.spot === 'G' ? 'G' : '' })}</div>
        ${cross(i === 1 ? 'is-head' : '')}
        ${i === 1 ? float(742, 318, '34', 'k-float--head') + float(800, 260, `${NUG()}+12`, 'k-float--gold') : ''}`;
    },
  });

  // живая стопка: в бою можно «прислать» тревогу — карточки встают под волной, максимум три
  const fight = document.querySelector('#stage-fort-fight');
  fight?.querySelector('.stage-ctl')?.insertAdjacentHTML('afterbegin', '<button type="button" class="k-btn k-btn--stop k-btn--sm ft-ping-btn">Прислать тревогу</button>');
  const ALARMS = [
    ['warn', `<img src="${F('warn.webp')}" alt="">`, 'Ворота трещат!', 'Шаркуны у ворот · 24 м'],
    ['warn', foeIc('climber'), 'Липучка лезет на стену!', 'Западная стена · 23 м'],
    ['reward', foeIc('brute'), '+50 · Бугай сбит!', 'Награда поделена с командой'],
    ['warn', `<img src="${F('bomb.webp')}" alt="">`, 'Бочка у ворот!', 'Фитиль 3 с — сбейте подрывника'],
    ['info', `<img src="${F('supply.webp')}" alt="">`, 'Сброс припасов', 'Ящик с жёлтым дымом — подбери: E'],
    ['reward', foeIc('champ'), 'Чемпион сбит: Шаркун!', 'Награда ×5'],
    ['info', `<img src="${F('bell.webp')}" alt="">`, 'Щит строений на 8 с', 'Паша ударил в колокол'],
  ];
  let ai = 0;
  fight?.querySelector('.ft-ping-btn')?.addEventListener('click', () => {
    const stack = fight.querySelector('.k-slot--tc .k-toasts');
    if (!stack) return;
    const [tone, icon, title, sub] = ALARMS[ai++ % ALARMS.length];
    const t = document.createElement('div');
    t.className = `k-toast k-toast--${tone} is-new`;
    t.innerHTML = `<span class="k-toast-ic">${icon}</span><div class="k-toast-title">${title}</div><div class="k-toast-sub">${sub}</div>`;
    stack.prepend(t);
    while (stack.children.length > 3) stack.lastElementChild.remove();
    sfx.play(tone === 'reward' ? 'reward' : tone === 'warn' ? 'error' : 'toast');
  });
}
