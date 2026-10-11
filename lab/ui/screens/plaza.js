// Набережная (оболочка игры): обычный экран, чат, «Кто где», меню Esc → «Профиль», праздничные моменты.
// Образец для остальных групп: только компоненты кита, своё CSS — раскладка с префиксом .pz-.
import { stage, section, K } from '../page/page.js';

const host = section('plaza');
const C = K.coin();
const icon = K.icon;
/** круглая «марка» комнаты — кусок рисованной картинки экрана загрузки */
const room = (name, pos = '50% 50%', zoom = 260) => `<span class="pz-room" style="background-image:url('img/rooms/${name}.webp');background-position:${pos};background-size:${zoom}% auto"></span>`;
const LIGHTHOUSE = `<span class="pz-room pz-room--lg" style="background-image:url('img/rooms/isle.webp');background-position:64% 12%;background-size:700% auto"></span>`;

/* ------------------------------------------------------------------ общие куски HUD */
const badge = ({ lv = 12, p = 0.64, tokens = '1 250', pop = '', xp = '' } = {}) => `
  <div class="k-badge pz-badge"><span class="k-ring" style="--p:${p}"><b>${lv}</b></span>
    <span class="k-badge-body"><span class="k-badge-nick">Кракозябра</span><span class="k-badge-tokens${pop ? ' is-bump' : ''}">${C}${tokens}</span></span>
    ${pop ? `<span class="k-pop is-still">${pop}</span>` : ''}${xp ? `<span class="k-pop k-pop--xp is-still">${xp}</span>` : ''}</div>`;

const where = (place = 'Кафе «Чайка»') => `
  <div class="k-plate pz-where">${room('lobby', '50% 60%', 230)}<span class="pz-where-t"><b>Набережная</b><span>${place}</span></span>
    <span class="pz-where-on">${K.key('Tab')}<span>в игре 7</span></span></div>`;

/** шторм: заголовок и подстрока — каждая в одну строку (v2), таймер справа */
const stormEv = ({ title = 'Шторм скоро', sub = 'Беги к маяку — первому жетоны', timer = '1:20', v = 0.55 } = {}) => `
  <div class="k-event k-lamp" data-mode="fishing">
    <span class="k-event-ic"><img src="${icon('ui/rain.webp')}" alt=""></span>
    <div class="k-event-title">${title}</div>
    <div class="k-event-sub">${sub}</div>
    <div class="k-event-timer">${timer}</div>
    <div class="k-meter k-meter--thin k-meter--mode" style="--v:${v}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></div>
  </div>`;

const CHAT_LINES = [
  ['is-sys', '', 'Бочка зашла на набережную'],
  ['k-nick-1', 'Паша', 'кто в дурака? стол 1 свободен'],
  ['k-nick-3', 'Комета', 'иду, только рыбу Семёну сдам'],
  ['k-nick-2', 'Бочка', 'шторм скоро, бежим к маяку!'],
];
const chatLines = (lines) => lines.map(([cls, nick, text]) => `<div class="k-chat-line ${cls}">${nick ? `<b>${nick}</b>` : ''}${text}</div>`).join('');

const chatDock = ({ open = false, typed = '', speaking = false } = {}) => `
  <div class="k-chat pz-chat">
    <div class="k-chat-list">${chatLines(open ? [
      ['is-sys is-old', '', 'Паша зашёл на набережную'],
      ['k-nick-4 is-old', 'Лиса', 'кто-нибудь видел пиратов?'],
      ...CHAT_LINES,
      ['k-nick-1', 'Паша', 'Кракозябра, ты с нами?'],
    ] : CHAT_LINES)}</div>
    ${speaking ? `<div class="k-speaking"><span class="k-pill k-pill--sm"><span class="k-eq"><i></i><i></i><i></i></span>Паша</span><span class="k-pill k-pill--sm"><span class="k-eq"><i></i><i></i><i></i></span>Бочка</span></div>` : ''}
    <div class="k-chat-bar">
      <button class="k-voice pz-voice" aria-label="Голос"><img src="${icon('ui/voice.webp')}" alt=""><kbd class="k-key k-key--sm">V</kbd></button>
      ${open
        ? `<label class="k-chat-input is-typing"><span>Всем:</span><input value="${K.esc(typed)}" aria-label="Сообщение"><i class="k-caret pz-caret"></i>${K.key('Enter')}</label>`
        : `<div class="k-chat-closed">${K.key('Enter')}Написать в чат</div>`}
    </div>
    ${open ? '<span class="k-pill k-pill--plate k-pill--sm pz-chat-hint"><kbd class="k-key k-key--sm">Esc</kbd> не отправлять</span>' : ''}
  </div>`;

const emotes = () => `<div class="k-pill k-pill--plate pz-emotes"><img class="k-ic" src="${icon('ui/emote.webp')}" alt=""><span class="k-keys">${K.key('1')}<span class="pz-dash">–</span>${K.key('6')}</span>Эмоции</div>`;

/* ------------------------------------------------------------------ 1. обычный экран */
if (host) {
  stage(host, {
    id: 'plaza-hud',
    title: 'Обычный экран на набережной',
    note: 'Справа сверху — ты: уровень с опытом и жетоны. Сверху по центру — одно событие в одну строку. Снизу — одна подсказка, слева — чат с голосом. v2: всё поверх игры меньше — бейдж 44, где ты 44, чат 360.',
    bg: 'img/bg-plaza-cards.jpg',
    before: 'img/03-plaza-default.jpg',
    states: [{ id: 'table', label: 'у стола' }, { id: 'storm', label: 'шторм у маяка' }],
    render(scene, state) {
      const storm = state === 'storm';
      scene.innerHTML = `
        <div class="k-slot k-slot--tl">${where(storm ? 'Мостки у маяка' : 'Кафе «Чайка»')}</div>
        <div class="k-slot k-slot--tc">${storm ? stormEv({ title: 'Зажги маяк!', sub: 'Волна каждые 6 с · площадь безопасна', timer: '0:42', v: 0.3 }) : stormEv()}</div>
        <div class="k-slot k-slot--tr">${badge()}</div>
        <div class="k-slot k-slot--bl">${chatDock()}</div>
        <div class="k-slot k-slot--bc">${storm
          ? `<div class="k-prompt k-prompt--urgent">${K.key('E')}Зажечь маяк<span class="k-prompt-sep"></span><span class="k-pill k-pill--gold k-pill--sm">${C}до 30</span></div>`
          : `<div class="k-prompt">${K.key('E')}Сесть за стол<span class="k-prompt-sep"></span><span class="k-prompt-note">Дурак · стол 1 · мест 0 из 6</span></div>`}</div>
        <div class="k-slot k-slot--br">${emotes()}</div>`;
    },
  });

  /* ------------------------------------------------------------------ 2. чат открыт */
  stage(host, {
    id: 'plaza-chat',
    title: 'Чат открыт — пишешь',
    note: 'Чат и голос — один док. Кнопка голоса прилеплена к строке ввода, кто говорит — видно прямо над ней.',
    bg: 'img/bg-plaza-cards.jpg',
    before: 'img/04-chat-open.jpg',
    render(scene) {
      scene.innerHTML = `
        <div class="k-slot k-slot--tr">${badge()}</div>
        <div class="k-slot k-slot--bl">${chatDock({ open: true, typed: 'да, сейчас сяду за стол', speaking: true })}</div>
        <div class="k-slot k-slot--br">${emotes()}</div>`;
    },
  });

  /* ------------------------------------------------------------------ 3. «Кто где» (Tab) */
  const PEOPLE = [
    { nick: 'Кракозябра', lv: 12, p: 0.64, room: ['lobby', 'Набережная'], me: true },
    { nick: 'Паша', lv: 27, p: 0.3, room: ['lobby', 'Набережная'], talk: true, vol: 100 },
    { nick: 'Бочка', lv: 8, p: 0.82, room: ['lobby', 'Набережная'], talk: true, vol: 80 },
    { nick: 'Комета', lv: 15, p: 0.12, room: ['race', 'Гонка'], vol: 100 },
    { nick: 'Лиса', lv: 33, p: 0.55, room: ['fort', 'Крепость'], vol: 60 },
    { nick: 'Nemo', lv: 4, p: 0.4, room: ['hide', 'Прятки'], vol: 100, muted: true },
    { nick: 'Ёжик', lv: 19, p: 0.7, room: ['skill', 'Выше облаков'], vol: 100 },
  ];
  const ROOM_POS = { lobby: '50% 60%', race: '50% 55%', fort: '50% 45%', hide: '50% 55%', skill: '50% 40%' };
  const row = (u) => `
    <div class="k-online-row${u.me ? ' is-me' : ''}${u.talk ? ' is-talk' : ''}">
      <span class="k-ring k-ring--sm" style="--p:${u.p}"><b>${u.lv}</b></span>
      <span class="k-online-nick">${u.nick}${u.me ? '<span class="k-pill k-pill--gold k-pill--sm">это ты</span>' : ''}</span>
      <span class="k-online-room">${room(u.room[0], ROOM_POS[u.room[0]], 260)}${u.room[1]}</span>
      <span class="k-online-act">${u.me ? '' : `
        <button class="k-btn k-btn--ghost k-btn--icon k-btn--sm pz-vol" aria-label="Тише">−</button>
        <span class="pz-vol-val${u.muted ? ' k-bad' : ''}">${u.muted ? 'тихо' : `${u.vol}%`}</span>
        <button class="k-btn k-btn--ghost k-btn--icon k-btn--sm pz-vol" aria-label="Громче">+</button>`}</span>
    </div>`;
  stage(host, {
    id: 'plaza-online',
    title: '«Кто где» — держишь Tab',
    note: 'Уровень кольцом, комната картинкой. Громкость каждого — прямо в строке; чтобы нажать, возьми мышь правой кнопкой.',
    bg: 'img/bg-plaza-cards.jpg',
    before: 'img/06-online-list.jpg',
    render(scene) {
      scene.innerHTML = `
        <div class="k-slot k-slot--tr">${badge()}</div>
        <div class="k-slot k-slot--bl">${chatDock()}</div>
        <div class="k-scrim pz-scrim-light">
          <section class="k-window k-window--sm pz-online">
            <header class="k-win-head">
              <span class="k-win-portrait"><img src="${icon('ui/online.webp')}" alt=""></span>
              <div class="k-win-titles"><p class="k-eyebrow">Отпусти Tab — закроется</p><h2 class="k-win-title">Кто где · 7</h2></div>
              <div class="k-win-tools"><span class="k-pill k-pill--good k-pill--sm"><span class="k-eq"><i></i><i></i><i></i></span>в голосе 2</span></div>
            </header>
            <div class="k-win-body">${PEOPLE.map(row).join('')}</div>
            <footer class="k-win-foot pz-online-foot"><span class="k-note"><span class="k-key k-key--sm">${K.mouse('r')}</span> — взять мышь: громкость и «выгнать»</span></footer>
          </section>
        </div>`;
    },
  });

  /* ------------------------------------------------------------------ 4. меню Esc → «Профиль» */
  // временные контурные значки настроек (TODO: заменить нарисованными иконками из client/assets/ui/icons/)
  const SV = (d) => `<svg class="pz-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const GL = {
    'Графика': SV('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.6"/>'),
    'Звук': SV('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
    'Голос': SV('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'),
    'Управление': SV('<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 3v6"/>'),
    'Интерфейс': SV('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
    'Клавиши': SV('<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'),
  };
  const NAV = [
    ['Профиль', [['Обзор', 'ui/level.webp', true], ['Рекорды', 'ui/records.webp'], ['Коллекция', 'ui/collection.webp'], ['Подарки и коды', 'ui/gift.webp']]],
    ['Настройки', [['Графика', 'ui/camera.webp'], ['Звук', 'ui/sound.webp'], ['Голос', 'ui/voice.webp'], ['Управление', 'ui/settings.webp'], ['Интерфейс', 'ui/chat.webp']]],
    ['Справка', [['Клавиши', 'ui/keys.webp']]],
  ];
  const nav = NAV.map(([h, items]) => `<p class="k-nav-h">${h}</p>${items.map(([n, ic, on]) => `<button class="k-nav-item${on ? ' is-on' : ''}">${ic ? `<img class="k-ic" src="${icon(ic)}" alt="">` : GL[n]}${n}</button>`).join('')}`).join('');
  const TIERS = [['Бронза', 5, '#bd854f', true], ['Серебро', 15, '#aebecf'], ['Золото', 30, '#deb54c'], ['Алмаз', 50, '#71cbe3']];
  const RECS = [
    ['fish-sturgeon.webp', '4,2<small>кг</small>', 'Рыбалка · самая тяжёлая рыба', true],
    ['', '0:41,2', 'Картинг · Портовое кольцо', false, room('race', '50% 55%', 220)],
    ['gate.webp', '7<small>волн</small>', 'Крепость · отбито волн'],
    ['ui/token.webp', '1 200', 'Автоматы · крупный выигрыш'],
  ];
  stage(host, {
    id: 'plaza-menu',
    title: 'Меню (Esc) → «Профиль»',
    note: 'Слева — одно меню и одна главная кнопка. Справа — ты: рамка ника, уровень кольцом, опыт полосой, рекорды крупными карточками.',
    bg: 'img/bg-plaza-cards.jpg',
    before: 'img/05-01-menu-overview.jpg',
    render(scene) {
      scene.innerHTML = `
        <div class="k-scrim">
          <div class="k-window k-window--lg k-window--split pz-menu">
            <aside class="k-win-side">
              <div class="pz-menu-head"><h2 class="k-win-title">Меню</h2><p class="pz-menu-sub">Набережная · кафе «Чайка»</p></div>
              <button class="k-btn k-btn--go k-btn--wide">Продолжить<kbd class="k-key k-key--tr">Esc</kbd></button>
              <nav class="k-nav">${nav}</nav>
              <button class="k-btn k-btn--ghost k-btn--sm k-btn--wide pz-leave"><span class="k-row-line"><img class="k-ic" src="${icon('ui/exit.webp')}" alt="">Выйти из игры</span></button>
            </aside>
            <section class="k-win-main">
              <header class="k-win-head">
                <div class="k-win-titles"><p class="k-eyebrow">Профиль</p><h2 class="k-win-title">Обзор</h2></div>
                <div class="k-win-tools"><button class="k-close" aria-label="Закрыть"><kbd class="k-key k-key--sm">Esc</kbd></button></div>
              </header>
              <div class="k-win-body pz-prof">
                <div class="k-cell pz-id">
                  <span class="k-ring k-ring--lg" style="--p:.64"><b>12</b><small>уровень</small></span>
                  <div class="pz-id-main">
                    <span class="pz-plate" style="--tc:#bd854f;--tl:#f4c697">Кракозябра</span>
                    <span class="k-faint">Так тебя видят другие игроки</span>
                    <div class="pz-xp"><div class="k-meter k-meter--lg" style="--v:.64"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i><span class="k-meter-label">372 / 580 опыта</span></div><span class="k-dim">до 13 уровня</span></div>
                  </div>
                  <div class="pz-id-side">
                    <span class="pz-tok">${C}<b>1 250</b></span><span class="k-faint">жетонов</span>
                    <button class="k-btn k-btn--ghost k-btn--sm">Сменить ник</button>
                  </div>
                </div>
                <div class="pz-tiers">${TIERS.map(([n, lv, c, got]) => `<span class="pz-tier${got ? ' is-got' : ''}" style="--tc:${c}"><i></i><b>${n}</b><span>с ${lv} уровня</span></span>`).join('')}</div>
                <h3 class="pz-h">Твои рекорды</h3>
                <div class="pz-recs">${RECS.map(([ic, num, cap, own, art]) => `<div class="k-stat${own ? ' k-stat--own' : ''}">${art ? `<span class="k-stat-ic pz-stat-art">${art}</span>` : `<img class="k-stat-ic" src="${icon(ic)}" alt="">`}<div class="k-stat-num">${num}</div><div class="k-stat-cap">${cap}</div></div>`).join('')}</div>
                <div class="k-cell pz-device"><img class="k-ic" src="${icon('jelly.webp')}" alt=""><span><b>Играешь и с телефона?</b><span class="k-dim">Одноразовый код: введи его там — «У меня есть код»</span></span><button class="k-btn k-btn--ghost k-btn--sm">Получить код для входа</button></div>
              </div>
            </section>
          </div>
        </div>`;
    },
  });

  /* ------------------------------------------------------------------ 5. праздник: уровень, награда, голосование */
  stage(host, {
    id: 'plaza-moment',
    title: 'Важный момент — праздник',
    note: 'Посередине на пару секунд — крупный баннер, сверху — тост, у бейджа всплывает +N. Голосование встаёт в ту же плашку события.',
    bg: 'img/bg-plaza-wide.jpg',
    states: [{ id: 'level', label: 'новый уровень' }, { id: 'storm', label: 'маяк зажжён' }, { id: 'vote', label: 'голосование' }],
    render(scene, state) {
      let tc = '';
      let center = '';
      let tr = badge();
      if (state === 'level') {
        center = `<div class="k-hero k-hero--gold is-pop"><p class="k-hero-title">Уровень 15!</p><span class="k-hero-sub"><span class="pz-tier-dot" style="--tc:#aebecf"></span>Новая рамка ника — Серебро</span></div>`;
        tc = `<div class="k-toasts"><div class="k-toast k-toast--reward is-new"><span class="k-toast-ic"><img src="${icon('ui/level.webp')}" alt=""></span><div class="k-toast-title">Уровень 15 · рамка Серебро</div><div class="k-toast-sub">Её видят все над твоей желейкой</div></div></div>`;
        tr = badge({ lv: 15, p: 0.06, xp: '+120 опыта' });
      } else if (state === 'storm') {
        center = `<div class="k-hero k-hero--win is-pop"><p class="k-hero-title">Маяк горит!</p><span class="k-hero-sub">Ты первый · +30 ${C}</span></div>`;
        tc = `<div class="k-event k-event--good k-lamp" data-mode="fishing"><span class="k-event-ic">${LIGHTHOUSE}</span><div class="k-event-title">Шторм стих</div><div class="k-event-sub">Кракозябра +30 · Бочка +20 · Паша +15</div><div class="k-event-timer">0:08</div></div>
          <div class="k-toasts"><div class="k-toast k-toast--reward is-new"><span class="k-toast-ic"><img src="${icon('ui/token.webp')}" alt=""></span><div class="k-toast-title">+30 жетонов</div><div class="k-toast-sub">Ты зажёг маяк первым</div></div>
          <div class="k-toast"><span class="k-toast-ic"><img src="${icon('jelly.webp')}" alt=""></span><div class="k-toast-title">Бочка зажгла маяк второй</div></div></div>`;
        tr = badge({ tokens: '1 280', pop: '+30' });
      } else {
        tc = `<div class="k-event k-event--danger k-lamp"><span class="k-event-ic"><img src="${icon('ui/warn.webp')}" alt=""></span><div class="k-event-title">Выгнать Nemo?</div><div class="k-event-sub">предложил Паша · за 2 · против 0 · ещё 3</div><div class="k-event-timer is-hurry">0:14</div>
          <div class="k-meter k-meter--thin k-meter--bad" style="--v:.35"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></div>
          <div class="k-event-actions"><button class="k-btn k-btn--go k-btn--sm">За<kbd class="k-key k-key--sm k-key--tr">Y</kbd></button><button class="k-btn k-btn--stop k-btn--sm">Против<kbd class="k-key k-key--sm k-key--tr">N</kbd></button></div></div>`;
      }
      scene.innerHTML = `
        <div class="k-slot k-slot--tc">${tc}</div>
        <div class="k-slot k-slot--tr">${tr}</div>
        <div class="k-slot k-slot--c">${center}</div>
        <div class="k-slot k-slot--bl">${chatDock()}</div>
        <div class="k-slot k-slot--br">${emotes()}</div>`;
    },
  });
}
