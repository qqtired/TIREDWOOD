// Группа «Вход в игру»: первая загрузка мира, вход (3 режима), загрузка между комнатами, экраны связи.
// Тексты, ники, правила ника, подсказки и названия — из игры: index.html + client/startup.ts (обложка),
// client/app.ts (вход, связь, Сейчас в игре), server/hub.ts (ошибки ника), client/ui/transition*.ts (загрузка).
// Картины — client/assets/loading/hd/ (PROVENANCE-hd.md), копии для страницы — img/entry/.
import { stage, section, K, sfx } from '../page/page.js';

const host = section('entry');
const IMG = (f) => `img/entry/${f}`;
/** Иконка кита; пока её нет в img/icons — тихо прячется (TODO icon: settings, warn, lighthouse, exit, lock, online рисуются сейчас). */
const ic = (name, cls = 'k-ic') => `<img class="${cls}" src="${K.icon(name)}" alt="" onerror="this.remove()">`;
/** Иконка с запасом: пока файла нет — показываем запасной кусок разметки (TODO icon). */
const icf = (name, fb, cls = 'k-ic') => `<img class="${cls}" src="${K.icon(name)}" alt="" onerror="this.nextElementSibling.hidden=false;this.remove()"><span class="en-fb" hidden>${fb}</span>`;
/** Портрет окна: иконка, а пока её нет — желейка с набережной. */
const portrait = (name) => `<span class="k-win-portrait"><img src="${K.icon(name)}" alt="" onerror="this.onerror=null;this.src='${IMG('lobby-jelly.webp')}'"></span>`;
const meter = (v, cls = '', label = '') => `<div class="k-meter ${cls}" style="--v:${v}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i>${label ? `<span class="k-meter-label">${label}</span>` : ''}</div>`;
const logo = (cls = '') => `<div class="en-logo ${cls}"><p class="en-logo-word">TIRED<b>WOOD</b></p></div>`;
const timers = new Map();
/** Таймеры сцены: при смене состояния старые гасим (никаких анимаций каждый кадр — только setTimeout). */
function later(key, fn, ms) { const t = timers.get(key) ?? []; t.push(setTimeout(fn, ms)); timers.set(key, t); }
function clear(key) { (timers.get(key) ?? []).forEach(clearTimeout); timers.set(key, []); }


/* ================================================================== 0. качество картинок */
function quality(root) {
  const CROPS = {
    fort: { label: 'Крепость' },
    lobby: { label: 'Набережная' },
  };
  let cur = 'fort';
  const box = document.createElement('div');
  box.className = 'en-qbox';
  box.innerHTML = `
    <div class="en-q-cap">
      <div><h3>Картинки загрузки — в полном качестве</h3>
        <p>Раньше картину ужимали до 1280×720 и сохраняли с качеством 15–35 % (≈60 КБ) — на 2K-мониторе её растягивают в 2 раза, отсюда «мыло» и квадраты. Теперь — полный размер оригинала 1536×864 и качество 82 % (190–310 КБ), желейки в 1,7 раза крупнее. Ниже — один и тот же кусок экрана 2560×1440 без увеличения.</p></div>
      <div class="k-seg" role="group" aria-label="Картина">${Object.entries(CROPS).map(([k, c]) => `<button type="button" data-crop="${k}" class="${k === cur ? 'is-on' : ''}">${c.label}</button>`).join('')}</div>
    </div>
    <div class="en-q">
      <figure><img data-side="old" src="${IMG(`zoom-${cur}-old.webp`)}" alt="Было"><figcaption><span class="k-pill k-pill--bad">Было</span><b>1280×720 · качество 15–35 %</b><span>≈ 60 КБ</span></figcaption></figure>
      <figure><img data-side="new" src="${IMG(`zoom-${cur}-new.webp`)}" alt="Стало"><figcaption><span class="k-pill k-pill--good">Стало</span><b>1536×864 · качество 82 %</b><span>190–310 КБ</span></figcaption></figure>
    </div>
    <div class="en-q-cap"><div><h3>Новые картины</h3><p>Нарисованы тем же стилем, что и прежние, — в духе новой набережной: светлая штукатурка, терракота, зелёные ставни, маркизы, кипарисы и павильоны с лампочками. У Фермы и Подземелья раньше картины не было — только цветное небо.</p></div></div>
    <div class="en-gallery">
      <figure class="en-gal"><img src="${IMG('hero-left.webp')}" alt=""><figcaption>Вход · вариант А<small>спокойное море слева — под карточку</small></figcaption></figure>
      <figure class="en-gal"><img src="${IMG('hero-center.webp')}" alt=""><figcaption>Вход · вариант Б<small>бухта и маяк по центру</small></figcaption></figure>
      <figure class="en-gal"><img src="${IMG('cover.webp')}" alt=""><figcaption>Первая загрузка<small>190 КБ + заглушка 1,4 КБ</small></figcaption></figure>
      <figure class="en-gal"><img src="${IMG('farm.webp')}" alt=""><img class="en-gal-jelly" src="${IMG('farm-jelly.webp')}" alt=""><figcaption>Ферма<small>картина + желейка-ведущая</small></figcaption></figure>
      <figure class="en-gal"><img src="${IMG('dungeon.webp')}" alt=""><img class="en-gal-jelly" src="${IMG('dungeon-jelly.webp')}" alt=""><figcaption>Подземелье<small>картина + желейка-ведущая</small></figcaption></figure>
    </div>`;
  root.append(box);
  box.querySelector('.k-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-crop]');
    if (!b) return;
    cur = b.dataset.crop;
    box.querySelectorAll('[data-crop]').forEach((x) => x.classList.toggle('is-on', x === b));
    box.querySelector('[data-side="old"]').src = IMG(`zoom-${cur}-old.webp`);
    box.querySelector('[data-side="new"]').src = IMG(`zoom-${cur}-new.webp`);
  });
}

/* ================================================================== 1. первая загрузка мира */
// Шаги и слова — client/startup.ts STAGE_TEXT; в игре экран рисуется ДО пакета игры: свой инлайн-CSS (~60 строк) в index.html,
// системный шрифт, картина cover.webp (190 КБ) поверх заглушки 48×27 (1,4 КБ data URL) — проявляется сразу.
const BOOT = [
  { id: 'modules', label: 'Игра', text: 'Загружаем игру…' },
  { id: 'fonts', label: 'Надписи', text: 'Готовим надписи…' },
  { id: 'world', label: 'Набережная', text: 'Собираем набережную…' },
  { id: 'frame', label: 'Первый кадр', text: 'Рисуем первый кадр…' },
];
const BOOT_TIPS = ['<b>Tab</b> — кто где и кто во что играет', '<b>Enter</b> — чат, <b>V</b> — голос', 'Жетоны тратятся на автоматы и наряды в примерочной'];

function bootCard(step, tip) {
  return `
    <div class="en-boot-head"><h2 class="en-boot-title">${BOOT[step].text}</h2><span class="k-pill k-pill--sm">Шаг ${step + 1} из 4</span></div>
    <div class="en-boot-steps">${BOOT.map((s, i) => {
      const st = i < step ? 'is-done' : i === step ? 'is-now' : '';
      const v = i < step ? 1 : i === step ? 0.55 : 0;
      return `<div class="en-boot-step ${st}">${meter(v, `k-meter--thin ${i < step ? 'k-meter--good' : ''} ${i === step ? 'en-meter-now' : ''}`)}<span><i class="en-tick">${i < step ? '✓' : i + 1}</i>${s.label}</span></div>`;
    }).join('')}</div>
    <div class="en-boot-tip"><span class="k-pill k-pill--gold k-pill--sm">Совет</span><span>${BOOT_TIPS[tip % BOOT_TIPS.length]}</span></div>`;
}

function boot(root) {
  stage(root, {
    id: 'entry-boot',
    title: 'Первая загрузка мира',
    note: 'Вместо тёмного экрана «Скоро на набережной» — картина городка, 4 понятных шага словами и один совет. Картинка проявляется сразу из крошечной заглушки и весит 190 КБ — загрузку не замедляет (в игре это ~60 строк CSS прямо в странице, без пакета игры).',
    bg: IMG('cover.webp'),
    before: IMG('was-startup.jpg'),
    states: [{ id: 'play', label: '▶ проиграть' }, { id: 'modules', label: 'шаг 1' }, { id: 'world', label: 'шаг 3' }, { id: 'fail', label: 'не получилось' }],
    state: 'world',
    render(scene, state) {
      clear('boot');
      const step = state === 'modules' ? 0 : state === 'play' ? 0 : 2;
      scene.innerHTML = `<div class="en-scr">
        <img class="en-art" src="${IMG('cover.webp')}" alt="">
        <div class="en-shade en-shade--boot"></div>
        <div class="en-boot-logo">${logo('en-logo--center')}</div>
        <div class="k-panel en-boot-card">${state === 'fail' ? `
          <div class="en-boot-fail">
            <h2 class="en-boot-title">Не получилось запуститься</h2>
            <p>Не удалось загрузить файлы игры. Проверь интернет и попробуй ещё раз.</p>
            <div class="en-actions"><button class="k-btn k-btn--gold">Попробовать ещё раз<kbd class="k-key k-key--tr">Enter</kbd></button><button class="k-btn k-btn--ghost k-btn--sm">Обновить страницу</button></div>
          </div>` : bootCard(step, step)}
        </div></div>`;
      if (state === 'play') {
        const card = scene.querySelector('.en-boot-card');
        [1, 2, 3].forEach((s) => later('boot', () => { card.innerHTML = bootCard(s, s); sfx.play('tick'); }, s * 1100));
        later('boot', () => { card.querySelectorAll('.k-meter').forEach((m) => { m.style.setProperty('--v', 1); m.classList.add('k-meter--good'); m.classList.remove('en-meter-now'); }); card.querySelector('.en-boot-title').textContent = 'Готово!'; sfx.play('level'); }, 4400);
      }
    },
  });
}

/* ================================================================== 2. вход */
const NICK_RE = /^[\p{L}\p{N} _.\-]{2,16}$/u;
const NICKS = ['Кругляш', 'Мармеладка', 'Боцман', 'Юнга', 'Шкипер', 'Клякса', 'Пончик', 'Бублик', 'Карамелька', 'Лоцман', 'Тюлька', 'Кок'];

function nickMsg(v, placeholder) {
  const n = v.replace(/\s+/g, ' ').trim();
  if (!n) return ['', `Оставишь пустым — будешь «${placeholder}»`];
  if (!NICK_RE.test(n)) return ['is-bad', 'Ник — от 2 до 16 символов: буквы, цифры, пробел, _ - .'];
  return ['is-ok', 'Подходит'];
}

function loginCard(mode, st) {
  const play = (label = 'Играть', dis = false) => `<div class="en-play"><button class="k-btn k-btn--gold k-btn--lg k-btn--wide" data-act="play"${dis ? ' disabled' : ''}>${dis ? `<span><i class="en-spin"></i>${label}</span>` : `${label}<kbd class="k-key k-key--tr">Enter</kbd>`}</button></div>`;
  const gear = `<button class="k-btn k-btn--ghost k-btn--icon k-btn--sm en-gear" data-act="settings" aria-label="Настройки">${icf('ui/settings.webp', '⚙︎')}</button>`;
  if (mode === 'saved' || mode === 'connecting' || mode === 'settings') {
    const c = mode === 'connecting';
    return `${gear}
      <p class="k-eyebrow">С возвращением</p>
      <h2 class="en-h">Привет, <b>${st.nick}</b>!</h2>
      <p class="en-lead">Набережная уже ждёт — заходи.</p>
      ${play(c ? 'Подключаемся…' : 'Играть', c)}
      <div class="en-alt"><button class="k-btn k-btn--ghost k-btn--sm" data-act="nick"${c ? ' disabled' : ''}>Другой профиль</button><button class="k-btn k-btn--ghost k-btn--sm" data-act="code"${c ? ' disabled' : ''}>У меня есть код</button></div>`;
  }
  if (mode === 'nick' || mode === 'taken') {
    const taken = mode === 'taken';
    const [cls, msg] = taken ? ['is-bad', 'Этот ник уже занят — придумай другой'] : nickMsg(st.typed, st.placeholder);
    return `${gear}
      <p class="k-eyebrow">Первый раз на набережной</p>
      <h2 class="en-h">Как тебя звать?</h2>
      <label class="en-field ${cls}"><span class="en-field-top"><span>Ник — его увидят все</span><span class="k-num en-count">${(taken ? 'Паша' : st.typed).length} / 16</span></span>
        <input class="k-input en-nick" type="text" maxlength="16" spellcheck="false" autocomplete="off" placeholder="${st.placeholder}" value="${K.esc(taken ? 'Паша' : st.typed)}"></label>
      <div class="en-msg ${cls}">${cls ? `<i class="en-tick">${cls === 'is-ok' ? '✓' : '!'}</i>` : ''}<span class="en-msg-text">${msg}</span></div>
      ${play()}
      <div class="en-alt">${st.saved ? '<button class="k-btn k-btn--ghost k-btn--sm" data-act="saved">Назад</button>' : ''}<button class="k-btn k-btn--ghost k-btn--sm" data-act="code">У меня есть код</button></div>`;
  }
  // code
  const cells = 'K7QM2'.padEnd(8, ' ').split('');
  const cell = (ch, i) => `<input class="k-input${i === 5 ? ' is-cur' : ''}" maxlength="1" value="${ch.trim()}" aria-label="Знак ${i + 1}">`;
  return `${gear}
    <p class="k-eyebrow">С другого устройства</p>
    <h2 class="en-h">Вход по коду</h2>
    <ol class="en-steps">
      <li><b>1</b><span>Там открой меню: ${K.key('Esc')} или ☰</span></li>
      <li><b>2</b><span>«Подарки и коды» → «Получить код для входа»</span></li>
      <li><b>3</b><span>Введи код здесь — он одноразовый, 10 минут</span></li>
    </ol>
    <div class="en-field"><span class="en-field-top"><span>Код</span><span>буквы и цифры</span></span>
      <div class="en-code">${cells.slice(0, 4).map(cell).join('')}<i class="en-code-dash"></i>${cells.slice(4).map((c, i) => cell(c, i + 4)).join('')}</div></div>
    <div class="en-msg ${st.codeBad ? 'is-bad' : ''}">${st.codeBad ? '<i class="en-tick">!</i><span>Код не подошёл или устарел</span>' : '<span>Дефис и регистр не важны</span>'}</div>
    ${play('Войти')}
    <div class="en-alt en-alt--one"><button class="k-btn k-btn--ghost k-btn--sm" data-act="back">Назад</button></div>`;
}

function settingsPop() {
  return `<div class="k-panel en-pop" role="dialog" aria-label="Быстрые настройки">
    <div class="en-pop-head"><p class="k-eyebrow">Быстрые настройки</p><button class="k-close" data-act="settings-close" aria-label="Закрыть"><kbd class="k-key k-key--sm">Esc</kbd></button></div>
    <div class="en-pop-row"><div class="k-row-title">Качество картинки</div><div class="k-seg en-seg"><button class="is-on">Авто</button><button>Высокое</button><button>Среднее</button><button>Низкое</button></div>
      <div class="k-row-hint">«Авто» само снизит разрешение, если игра тормозит</div></div>
    <div class="k-row"><div><div class="k-row-title">Общая громкость</div></div><div class="k-row-ctl"><input class="k-slider" type="range" min="0" max="100" value="70" style="--v:.7"><span class="k-row-val">70%</span></div></div>
    <div class="k-row"><div><div class="k-row-title">Без звука</div><div class="k-row-hint">${K.key('M', 'k-key--sm')} — в любой момент игры</div></div><div class="k-row-ctl"><label class="k-switch"><input type="checkbox"><span class="k-switch-track"></span></label></div></div>
    <div class="k-row"><div><div class="k-row-title">Чувствительность мыши</div></div><div class="k-row-ctl"><input class="k-slider" type="range" min="10" max="400" value="100" style="--v:.23"><span class="k-row-val">1,00</span></div></div>
    <p class="en-pop-note">Графика, голос и управление целиком — в игре: ${K.key('Esc', 'k-key--sm')} → «Настройки».</p>
  </div>`;
}

function login(root) {
  let layout = 'left';
  const st = { nick: 'Кракозябра', typed: 'Tester61', placeholder: NICKS[1], saved: true, codeBad: false, online: 7 };
  const ref = {};
  const api = ref.api = stage(root, {
    id: 'entry-login',
    title: 'Вход в игру',
    note: 'Одна главная кнопка «Играть», всё остальное — тихо: шпаргалка клавиш ушла в меню (Esc → Клавиши), настройки — маленькой шестерёнкой, «Сейчас в игре» — живой плашкой. Ник проверяется сразу, пока печатаешь. Новое: плашка «Новое на набережной».',
    bg: IMG('hero-left.webp'),
    before: IMG('was-login.jpg'),
    states: [
      { id: 'saved', label: 'Привет, ник' }, { id: 'nick', label: 'Как тебя звать' }, { id: 'taken', label: 'ник занят' },
      { id: 'code', label: 'код' }, { id: 'connecting', label: 'подключаемся' }, { id: 'settings', label: 'настройки' },
    ],
    render(scene, mode) {
      clear('login');
      const center = layout === 'center';
      const people = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'человек' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'человека' : 'человек');
      scene.innerHTML = `<div class="en-scr en-login ${center ? 'en-login--center' : ''}">
        <img class="en-art" src="${IMG(center ? 'hero-center.webp' : 'hero-left.webp')}" alt="">
        <div class="en-shade ${center ? 'en-shade--center' : 'en-shade--left'}"></div>
        <div class="en-login-logo">${logo(center ? 'en-logo--center en-logo--md' : 'en-logo--md')}<span class="k-pill k-pill--plate en-tagline">мини игры, фарм сабжей, казино и safeplace</span></div>
        <div class="en-top"><span class="k-pill k-pill--plate k-pill--lg en-live"><i class="en-live-dot"></i>Сейчас в игре: <b class="k-num">${st.online}</b> ${people(st.online)}</span></div>
        <section class="k-panel en-card ${mode === 'code' ? 'en-card--code' : ''}">${loginCard(mode, st)}</section>
        ${mode === 'settings' ? settingsPop() : ''}
        <div class="k-plate en-keys" aria-label="Главные клавиши"><span><span class="k-keys">${K.key('W')}${K.key('A')}${K.key('S')}${K.key('D')}</span>бегать</span><span>${K.key('E')}действие</span><span>${K.key('Esc')}меню и все клавиши</span></div>
        ${center || mode === 'code' ? '' : `<div class="en-news"><span class="k-pill k-pill--plate k-pill--sm">Новое на набережной</span><div class="en-news-row">
          <figure class="k-plate en-news-card"><img src="${IMG('farm-sm.webp')}" alt=""><span>Ферма</span></figure>
          <figure class="k-plate en-news-card"><img src="${IMG('dungeon-sm.webp')}" alt=""><span>Подземелье</span></figure>
          <figure class="k-plate en-news-card"><img src="${IMG('isle-sm.webp')}" alt=""><span>Остров</span></figure></div></div>`}
      </div>`;
      wireLogin(scene, mode, st, ref);
    },
  });
  // второй переключатель над сценой: раскладка
  const seg = document.createElement('div');
  seg.className = 'k-seg';
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Раскладка');
  seg.innerHTML = '<button type="button" data-lay="left" class="is-on">карточка слева</button><button type="button" data-lay="center">по центру</button>';
  api.el.querySelector('.stage-ctl').prepend(seg);
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-lay]');
    if (!b) return;
    layout = b.dataset.lay;
    seg.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b));
    sfx.play('click');
    api.render();
  });
}

function wireLogin(scene, mode, st, ref) {
  scene.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const api = ref.api;
    const a = b.dataset.act;
    if (a === 'play') {
      if (mode === 'nick') {
        const [cls] = nickMsg(st.typed, st.placeholder);
        if (cls === 'is-bad') { sfx.play('error'); scene.querySelector('.en-nick')?.focus(); return; }
      }
      if (mode === 'code') { st.codeBad = true; sfx.play('error'); api.setState('code'); return; }
      api.setState('connecting');
      later('login', () => ref.api.setState('saved'), 2200);
    } else if (a === 'nick') { st.typed = ''; api.setState('nick'); }
    else if (a === 'code') { st.codeBad = false; api.setState('code'); }
    else if (a === 'back' || a === 'saved') api.setState('saved');
    else if (a === 'settings') { sfx.play('open'); api.setState(mode === 'settings' ? 'saved' : 'settings'); }
    else if (a === 'settings-close') api.setState('saved');
  }));
  const nick = scene.querySelector('.en-nick');
  if (nick && mode === 'nick') {
    nick.addEventListener('input', () => {
      st.typed = nick.value;
      const [cls, msg] = nickMsg(st.typed, st.placeholder);
      const field = scene.querySelector('.en-field');
      const m = scene.querySelector('.en-msg');
      field.className = `en-field ${cls}`;
      m.className = `en-msg ${cls}`;
      m.innerHTML = `${cls ? `<i class="en-tick">${cls === 'is-ok' ? '✓' : '!'}</i>` : ''}<span class="en-msg-text">${msg}</span>`;
      scene.querySelector('.en-count').textContent = `${st.typed.length} / 16`;
    });
    nick.addEventListener('keydown', (e) => { if (e.key === 'Enter') scene.querySelector('[data-act="play"]').click(); });
  }
  const cells = [...scene.querySelectorAll('.en-code .k-input')];
  cells.forEach((c, i) => c.addEventListener('input', () => {
    c.value = c.value.toUpperCase().slice(-1);
    cells.forEach((x) => x.classList.remove('is-cur'));
    const nx = cells[Math.min(i + 1, cells.length - 1)];
    nx.classList.add('is-cur');
    if (c.value) nx.focus();
  }));
  scene.querySelectorAll('.en-seg').forEach((s) => s.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) s.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b));
  }));
  scene.querySelectorAll('.k-slider').forEach((s) => s.addEventListener('input', () => {
    const v = (s.value - s.min) / (s.max - s.min);
    s.style.setProperty('--v', v);
    const out = s.parentElement.querySelector('.k-row-val');
    if (out) out.textContent = s.max === '400' ? (s.value / 100).toFixed(2).replace('.', ',') : `${s.value}%`;
  }));
}

/* ================================================================== 3. загрузка между комнатами */
// Названия, подписи, «что строим», слово старта и подсказки — client/ui/transition-art.ts MODE_CARDS.
const ROOMS = {
  fort: {
    title: 'Крепость', sub: 'Держим ворота и кристалл вместе', build: 'Поднимаем стены…', go: 'Волна!', art: 'fort.webp', jelly: 'fort-jelly.webp',
    line: `${ic('star.png')}Рекорд: 12 волн — Паша и Бочка · твой рекорд — 7 волн`,
    tip: 'Колокол — «готов»: если готовы все, волна начнётся раньше', v: 0.62,
    who: [['ты', 1], ['Паша', 1], ['Бочка', 0]],
  },
  farm: {
    title: 'Ферма', sub: 'Грядки за городом, у моря', build: 'Вскапываем грядки…', go: 'Привет, сосед!', art: 'farm.webp', jelly: 'farm-jelly.webp',
    tip: 'Лейку наполняют у колодца — у любого корыта', v: 0.86, status: 'Почти готово…',
  },
  dungeon: {
    title: 'Подземелье', sub: 'Один фонарь против армии Барона', build: 'Зажигаем факелы в пещере…', go: 'Волна!', art: 'dungeon.webp', jelly: 'dungeon-jelly.webp',
    tip: 'Оружие бьёт само — твоё дело ходить и уворачиваться', v: 0.34,
  },
};

function roomScreen(kind, fail = false) {
  const r = ROOMS[kind];
  const status = fail ? `«${r.title}» не загрузилась за 15 секунд — возвращаемся на набережную…` : r.status ?? r.build;
  return `<div class="en-scr en-tr" data-mode="${kind}">
    <img class="en-art" src="${IMG(r.art)}" alt="">
    <div class="en-shade en-shade--bottom"></div>
    <div class="en-tr-brand">${logo('en-logo--sm')}</div>
    <div class="en-tr-host">
      <div class="k-plate en-bubble"><p class="k-eyebrow">Совет</p><p>${r.tip}</p></div>
      <img class="en-tr-jelly" src="${IMG(r.jelly)}" alt="">
    </div>
    <div class="en-tr-info" role="status">
      <h2 class="en-tr-title">${r.title}</h2>
      <div class="k-plate en-tr-plate">
        <p class="en-tr-sub">${r.sub}</p>
        ${r.line ? `<p class="en-tr-line">${r.line}</p>` : ''}
        ${meter(fail ? 1 : r.v, `k-meter--lg ${fail ? 'k-meter--bad' : 'k-meter--mode'}`)}
        <div class="en-tr-status ${fail ? 'is-bad' : ''}"><span>${status}</span></div>
        ${r.who ? `<div class="en-tr-who"><span>Заходят вместе:</span>${r.who.map(([n, ok]) => `<span class="k-pill k-pill--sm ${ok ? 'k-pill--good' : ''}">${n}${ok ? ' ✓' : ' …'}</span>`).join('')}</div>` : ''}
      </div>
    </div>
  </div>`;
}

function rooms(root) {
  const BEFORE = { fort: 'was-fort-tr.jpg', farm: 'was-fort-tr.jpg', dungeon: 'was-dungeon-tr.jpg', wait: 'was-fort-tr.jpg', count: 'was-fort-tr.jpg', fail: 'was-fort-tr.jpg' };
  const ref = {};
  const api = ref.api = stage(root, {
    id: 'entry-rooms',
    title: 'Загрузка между комнатами',
    note: 'Идея та же — картина, желейка-ведущая с советом, крупное название, — но картинки чёткие, у Фермы и Подземелья появились свои. «Ждём …» и отсчёт 3-2-1 переехали в верхнюю плашку события и центр — больше не налезают на тосты.',
    bg: IMG('fort.webp'),
    before: IMG(BEFORE.fort),
    states: [
      { id: 'fort', label: 'Крепость' }, { id: 'farm', label: 'Ферма' }, { id: 'dungeon', label: 'Подземелье' },
      { id: 'wait', label: 'ждём остальных' }, { id: 'count', label: '3-2-1' }, { id: 'fail', label: 'не загрузилось' },
    ],
    render(scene, state) {
      clear('rooms');
      const before = ref.api?.el.querySelector('.stage-before');
      if (before) before.src = IMG(BEFORE[state]);
      if (state === 'wait' || state === 'count') {
        const wait = state === 'wait';
        scene.innerHTML = `<div class="en-scr" data-mode="fort">
          <img class="en-art" src="${IMG('bg-fort.jpg')}" alt="">
          <div class="k-slot k-slot--tc">${wait ? `
            <div class="k-event"><span class="k-event-ic">${icf('ui/online.webp', `<img src="${IMG('fort-jelly.webp')}" alt="">`)}</span>
              <div class="k-event-title">Ждём: Бочка</div><div class="k-event-sub">Остальные уже на месте — начнём, как только загрузится</div>
              <div class="k-event-timer">до 8 с</div>${meter(0.55, 'k-meter--thin k-meter--mode')}</div>` : ''}</div>
          <div class="k-slot k-slot--c"><div class="en-count-box"></div></div>
        </div>`;
        if (!wait) {
          const box = scene.querySelector('.en-count-box');
          const steps = ['3', '2', '1', ROOMS.fort.go];
          steps.forEach((s, i) => later('rooms', () => {
            const go = i === steps.length - 1;
            box.innerHTML = `<div class="k-count ${go ? 'k-count--go k-hero is-pop' : 'is-tick'}">${s}</div>`;
            sfx.play(go ? 'level' : 'tick');
          }, i * 900));
        }
        return;
      }
      scene.innerHTML = roomScreen(state === 'fail' ? 'fort' : state, state === 'fail');
    },
  });
  const before = api.el.querySelector('.stage-before');
  if (before) before.src = IMG(BEFORE[api.state] ?? BEFORE.fort);
}

/* ================================================================== 4. связь */
// Тексты — client/app.ts (showLost, startReconnect, tickReconnect, replaced) и ui/linkbanner.ts.
const LINK = {
  lost: { icon: 'warn.webp', eyebrow: 'Связь', title: 'Связь потеряна', text: 'Сервер не отвечает.', main: 'Переподключиться' },
  reconnect: { icon: 'lighthouse.webp', eyebrow: 'Связь', title: 'Связь пропала', text: 'Переподключаемся через 3 с…', wait: 0.4 },
  restart: { icon: 'ui/settings.webp', eyebrow: 'Сервер', title: 'Сервер обновляется', text: 'Переподключаемся…', wait: 0.75, note: 'Прогресс сохранён.' },
  kicked: { icon: 'ui/exit.webp', eyebrow: 'Голосование', title: 'Тебя выгнали', text: 'Так решили игроки голосованием.', main: 'Войти снова' },
  replaced: { icon: 'lock.webp', eyebrow: 'Другое окно', title: 'Ты зашёл в другом окне', text: 'Играть можно в одном окне за раз — здесь игра остановлена.', main: 'Вернуться сюда' },
};

function link(root) {
  stage(root, {
    id: 'entry-link',
    title: 'Связь: нестабильно, пропала, потеряна',
    note: 'Пять разных экранов стали одним маленьким окном одного вида: картинка, что случилось, одна главная кнопка и «В меню». Нестабильная связь — плашкой сверху, игра при этом не прерывается.',
    bg: 'img/bg-plaza-wide.jpg',
    states: [
      { id: 'unstable', label: 'нестабильно' }, { id: 'reconnect', label: 'переподключаемся' }, { id: 'restart', label: 'сервер обновляется' },
      { id: 'lost', label: 'потеряна' }, { id: 'kicked', label: 'выгнали' }, { id: 'replaced', label: 'другое окно' },
    ],
    state: 'reconnect',
    render(scene, state) {
      clear('link');
      if (state === 'unstable') {
        scene.innerHTML = `<div class="en-scr"><div class="k-slot k-slot--tc">
          <div class="k-event k-event--danger"><span class="k-event-ic"><i class="en-spin en-ev-spin"></i></span>
            <div class="k-event-title">Связь нестабильна</div><div class="k-event-sub">Ждём сервер… Играть можно дальше</div></div></div></div>`;
        return;
      }
      const c = LINK[state];
      scene.innerHTML = `<div class="en-scr"><div class="en-dim-world"></div><div class="k-scrim">
        <section class="k-window k-window--sm is-in en-conn" role="alertdialog" aria-label="${c.title}">
          <header class="k-win-head">${portrait(c.icon)}<div class="k-win-titles"><p class="k-eyebrow">${c.eyebrow}</p><h2 class="k-win-title">${c.title}</h2></div></header>
          <div class="k-win-body"><p class="en-conn-text">${c.text}</p>
            ${c.wait !== undefined ? meter(c.wait, 'k-meter--info') : ''}
            ${c.note ? `<p class="en-conn-note"><span class="k-pill k-pill--good k-pill--sm">✓</span>${c.note}</p>` : ''}</div>
          <footer class="k-win-foot">${c.main ? `<button class="k-btn k-btn--gold">${c.main}<kbd class="k-key k-key--tr">Enter</kbd></button>` : ''}<button class="k-btn k-btn--ghost">В меню</button></footer>
        </section></div></div>`;
      if (state === 'reconnect') {
        const t = scene.querySelector('.en-conn-text');
        const m = scene.querySelector('.k-meter');
        [2, 1].forEach((n, i) => later('link', () => { t.textContent = `Переподключаемся через ${n} с…`; m.style.setProperty('--v', 0.4 + (i + 1) * 0.3); }, (i + 1) * 1000));
        later('link', () => { t.textContent = 'Переподключаемся…'; }, 3000);
      }
    },
  });
}

/* ================================================================== старт */
if (host) {
  quality(host);
  boot(host);
  login(host);
  rooms(host);
  link(host);
}
