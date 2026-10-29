// «Загадка» — живой макет на ките UI 2.0 (раздел #riddle страницы-обзора «Ракушка»).
// Два вида: «Я загадываю» (окно «Что загадал?», лента догадок с 👍 👎 🎯, цепочка «Тепло») и «Я угадываю» (строка чата
// «В игру», бот-загадывающий отмечает догадки сам). Праздник 🎯, «Загадывай ты!», вариант «Данетка из пака».
// Разметка — классы кита (.k-plate, .k-event, .k-hero, .k-toast, .k-chat, .k-window…), свои классы — с префиксом rd-.
// Время раунда в макете идёт втрое быстрее; боты и таймеры стоят, пока раздел не виден; звук — после первого действия.
import {
  makeStage, segButtons, h, esc, keyHtml, iconImg, coinHtml, coinText, meterHtml, setMeter,
  PLAYERS, jellySvg, sfx, rnd, pick, checkAnswer,
} from './common.js';

const ME = PLAYERS[0];
const BARON = PLAYERS.find((p) => p.nick === 'Барон');
const BOTS = PLAYERS.slice(1);

const ROUND_MS = 5 * 60 * 1000; // раунд — 5 минут
const SPEED = 3; // в макете время раунда идёт втрое быстрее
const FADE_MS = 90 * 1000; // неотмеченные строки гаснут через 90 с (игрового времени)
const NEXT_MS = 10 * 1000; // «Загадывай ты!» — 10 с
const CATS = ['Предмет', 'Животное', 'Человек', 'Место', 'Фильм или книга', 'Еда', 'Другое'];
const fmt = new Intl.NumberFormat('ru-RU');

// «Я загадываю»: боты сходятся к слову (последние две строки собираются из слова, которое ввёл смотрящий)
const WORD = {
  answer: 'пароход',
  cat: 'Предмет',
  hints: ['ходит по воде', 'у него есть труба', 'раньше возил людей по рекам'],
  script: ['машина', 'оно плавает?', 'лодка', 'большое?', 'корабль', 'теплоход'],
};
// «Я угадываю»: загадывает Барон, догадки ботов подбираются к маяку, но верное слово за игрока не говорят
const LIGHT = {
  setter: BARON,
  answer: 'маяк',
  cat: 'Место',
  hints: ['стоит на берегу', 'светит кораблям', 'слово из 4 букв'],
  hintAt: [45000, 90000, 150000], // игровое время, мс
  script: ['порт', 'пирс', 'башня', 'это кафе «Чайка»?', 'высокая башня?', 'там горит огонь?', 'вышка', 'свет для кораблей', 'аквапарк', 'сторожевая башня', 'на берегу?'],
};
// догадки мимо, пока загадывающий не дал двух 👍
const MISS = ['чемодан', 'это едят?', 'самолёт', 'поезд', 'это дорогое?', 'плот', 'автобус', 'зонтик'];
// слова, на которые бот-загадывающий отвечает 👍
const WARM = /башн|свет|огон|огн|берег|высок|корабл|мор[еяюьи]|сигнал|ноч|ламп|вышк/;
// данетка из пака: историю видят все, разгадку — только загадывающий
const DAN = {
  title: 'Вода и «Бу!»',
  story: 'Мужчина зашёл в кафе «Чайка» и попросил стакан воды. Тоня за стойкой вдруг крикнула «Бу!». Мужчина сказал «Спасибо!» и ушёл, воды так и не выпив. Почему?',
  solution: 'У него была икота. Тоня напугала его — и икота прошла, вода уже не нужна.',
  short: 'икота',
  hints: ['Это про здоровье', 'Тоня сделала это нарочно, но от души', 'Воду просят не только от жажды'],
  script: [{ t: 'он хотел пить?' }, { t: 'Тоня хотела его обидеть?' }, { t: 'ему было плохо?' }, { t: 'это про здоровье?' }, { t: 'он чем-то болел?' }, { t: 'у него икота?' }, { t: 'Тоня напугала его, чтобы прошла икота', close: true }],
};

// примерные места зрителей на картинке сцены (сцена 1440×900, картинка 1440×960 по центру): низ облачка над головой желейки
const SPOTS = [
  { x: 225, y: 700 }, { x: 375, y: 722 }, { x: 470, y: 704 }, { x: 700, y: 756 }, { x: 870, y: 752 }, { x: 1000, y: 726 },
];
const MY_SPOT = { x: 585, y: 778 };

const nrm = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[«»"'.,!?;:()\-–—]/g, ' ').replace(/\s+/g, ' ').trim();
/** Верно ли: целиком или любым словом из строки */
function judge(text, answer) {
  const r = checkAnswer(text, answer);
  if (r === 'yes') return r;
  for (const w of nrm(text).split(' ')) if (w.length >= 3 && checkAnswer(w, answer) === 'yes') return 'yes';
  return r;
}
/** Подсказки по слову, которое ввёл смотрящий (для «пароход» — свои) */
function hintsFor(secret, cat) {
  if (nrm(secret) === WORD.answer) return WORD.hints;
  const s = secret.trim();
  return [`Это: ${cat.toLowerCase()}`, `Слово из ${s.length} ${s.length % 10 === 1 && s.length !== 11 ? 'буквы' : 'букв'}`, `Начинается на «${s[0]?.toUpperCase() ?? ''}»`];
}
const put = (e, t) => { if (e && e.textContent !== t) e.textContent = t; };
const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
/** Желейка с собственным id градиента — не конфликтует с другими разделами страницы */
const jelly = (color, size, o = {}) => jellySvg(color, size, o).replaceAll(`g${color.slice(1)}`, `rdg${color.slice(1)}`);

export function mount(el) {
  const stage = makeStage(el, { title: 'Живой макет', note: '…', bg: 'img/venue-shell.jpg' });
  stage.bg.style.setProperty('--qz-shade', 'linear-gradient(180deg, color-mix(in srgb, var(--w-surf-solid) 8%, transparent), color-mix(in srgb, var(--w-surf-solid) 30%, transparent))');
  const { scale, hud } = stage;
  const capT = stage.root.querySelector('.qz-cap-t');
  const capN = stage.root.querySelector('.qz-cap-n');

  // ---------------------------------------------------------------- состояние
  let GEN = 0;
  let S = null;
  let visible = false;
  let armed = false; // звук — только после первого действия смотрящего в разделе
  const play = (n) => { if (armed) sfx.play(n); };
  const later = (ms, fn) => { const g = S.gen; return setTimeout(() => { if (g === S.gen) fn(); }, ms); };
  const slot = (pos) => h('div', `k-slot k-slot--${pos}`);

  // части экрана (собираются в build)
  let world, flyLayer, conf, tl, tc, tr, bl, br, bc, cc, scrim;
  let card, timeEl, timeBar, hintN, hintBtn, hintList, chain, chainList, chainN, chainEmpty, cold, feed, feedList, feedN, feedEmpty;
  let evEl, toasts, input, modeLab, tabBtn, chatList, badgeTok, badgeEl;

  const view0 = { set: 0, guess: 1 };
  let seg;

  function fresh(view, dan) {
    const set = view === 'set';
    return {
      gen: ++GEN, view, dan,
      phase: set ? 'start' : 'play', // start | idle | play | win | next
      secret: WORD.answer, cat: WORD.cat, firstHint: '',
      setter: set ? ME : LIGHT.setter,
      answer: set ? WORD.answer : LIGHT.answer,
      hints: [], hintsAll: [], hintAt: [],
      left: ROUND_MS, elapsed: 0, botIn: set ? 2000 : 1400, nextLeft: NEXT_MS,
      lines: [], uid: 0, script: [], scriptI: 0, lastBot: null, lastSend: 0,
      warm: [], cold: [], tokens: 1250, points: 0,
      spots: SPOTS.map((s) => ({ ...s, used: false })), minuteShown: false, winner: null, chatAll: false,
    };
  }

  // ---------------------------------------------------------------- сборка экрана
  function build() {
    hud.replaceChildren();
    world = h('div', 'k-world rd-world');
    flyLayer = h('div', 'rd-fly-layer');
    conf = h('div', 'rd-conf');
    tl = slot('tl'); tc = slot('tc'); tr = slot('tr'); bl = slot('bl'); br = slot('br'); bc = slot('bc'); cc = slot('c');
    hud.append(world, tl, tc, tr, cc, bl, br, bc, flyLayer, conf);
    toasts = h('div', 'k-toasts');
    tc.append(toasts);
    evEl = null;
    buildBadge();
    buildCard();
    buildChain();
    buildFeed();
    buildChat();
    if (S.phase === 'play') goal();
  }

  function buildBadge() {
    badgeEl = h('div', 'k-badge');
    badgeEl.innerHTML = `<span class="k-badge-avatar" role="img" aria-label="Твой образ">${jelly(ME.color, 36, { hat: ME.hat })}</span>
      <span class="k-ring" style="--p:.64"><b>12</b></span>
      <span class="k-badge-tokens">${coinHtml()}<span>${fmt.format(S.tokens)}</span></span>`;
    badgeTok = badgeEl.querySelector('.k-badge-tokens');
    tr.append(badgeEl);
  }

  function buildCard() {
    const set = S.view === 'set';
    const who = S.setter;
    card = h('div', 'k-plate rd-card');
    card.innerHTML = `
      <div class="rd-card-head">
        <span class="rd-card-av">${set ? iconImg('scroll', 'k-ic') : jelly(who.color, 40, { hat: who.hat })}</span>
        <div class="rd-card-who"><p class="k-eyebrow">${set ? 'Ты загадал' : 'Загадывает'}</p>
          <b class="rd-word${set ? ' is-own' : ''}">${set ? (S.dan ? 'Данетку' : esc(S.secret)) : esc(who.nick)}</b></div>
        <span class="rd-time" data-time>${clock(S.left)}</span>
      </div>
      ${meterHtml(1, 'mode', 'k-meter--thin')}
      <div class="rd-card-meta">
        <span class="k-pill k-pill--sm">${esc(S.dan ? 'Данетка' : S.cat)}</span>
        <span class="rd-hint-n">подсказки <b data-hn>0</b>/3</span>
        ${set ? '<button class="k-btn k-btn--sm k-btn--ghost rd-hint-btn" type="button">Подсказка</button>' : ''}
      </div>
      ${S.dan ? `<p class="rd-story">${esc(DAN.story)}</p>` : ''}
      ${S.dan && set ? `<div class="rd-solution"><span class="k-faint">Разгадка — видишь только ты</span><p>${esc(DAN.solution)}</p></div>` : ''}
      <ol class="rd-hints"></ol>`;
    timeEl = card.querySelector('[data-time]');
    timeBar = card.querySelector('.k-meter');
    hintN = card.querySelector('[data-hn]');
    hintBtn = card.querySelector('.rd-hint-btn');
    hintList = card.querySelector('.rd-hints');
    hintBtn?.addEventListener('click', () => giveHint());
    tl.append(card);
  }

  function buildChain() {
    chain = h('div', 'k-plate rd-chain');
    chain.innerHTML = `<div class="rd-chain-head"><p class="k-eyebrow">${S.dan ? 'Известно' : 'Тепло'}</p><span class="k-pill k-pill--xs k-pill--gold" data-n>0</span></div>
      <ol class="rd-chain-list"></ol>
      <p class="rd-empty">${S.dan ? 'Сюда встанут ответы «Да»' : 'Сюда встанут догадки с 👍'}</p>`;
    chainList = chain.querySelector('.rd-chain-list');
    chainN = chain.querySelector('[data-n]');
    chainEmpty = chain.querySelector('.rd-empty');
    cold = h('div', 'k-plate rd-cold');
    cold.hidden = true;
    tl.append(chain, cold);
  }

  function buildFeed() {
    const set = S.view === 'set';
    feed = h('div', `k-plate rd-feed${set ? ' is-set' : ''}`);
    feed.innerHTML = `<div class="rd-feed-head"><p class="k-eyebrow">${set ? 'Догадки' : 'Лента игры'}</p><span class="k-pill k-pill--xs" data-n>0</span></div>
      <div class="rd-feed-list"></div>
      <p class="rd-empty">${set ? 'Пока тихо. Догадки появятся здесь.' : 'Здесь видно, что пишут все, и что отвечает Барон.'}</p>`;
    feedList = feed.querySelector('.rd-feed-list');
    feedN = feed.querySelector('[data-n]');
    feedEmpty = feed.querySelector('.rd-empty');
    feed.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const row = b.closest('.rd-line');
      const l = S.lines.find((x) => x.el === row);
      if (l) { armed = true; mark(l, b.dataset.act); }
    });
    br.append(feed);
  }

  function buildChat() {
    const set = S.view === 'set';
    const dock = h('div', 'k-chat rd-chat');
    chatList = h('div', 'k-chat-list');
    const bar = h('div', 'k-chat-bar');
    bar.innerHTML = `<button class="k-voice" type="button" aria-label="Голос">${iconImg('voice', '')}${keyHtml('V', '', 'sm')}</button>`;
    dock.append(chatList, bar);
    if (!set) chatList.insertAdjacentHTML('beforeend', '<div class="k-chat-line is-sys">Пока идёт «Загадка», строка пишет в игру. Tab — написать всем.</div>');
    S.chatAll = set;
    const lab = h('label', 'k-chat-input is-typing');
    lab.innerHTML = `<span class="rd-mode" role="button" tabindex="-1" title="Tab — переключить">${set ? 'Всем:' : 'В игру:'}</span><input type="text" maxlength="60" autocomplete="off" spellcheck="false" placeholder="${set ? 'Сообщение' : 'Твоя догадка…'}" aria-label="Сообщение"> ${keyHtml('Enter')}`;
    bar.append(lab);
    input = lab.querySelector('input');
    modeLab = lab.querySelector('.rd-mode');
    tabBtn = h('button', 'k-pill k-pill--plate k-pill--sm rd-tab', set ? '<span>Загадывающий пишет только всем</span>' : `${keyHtml('Tab', '', 'sm')} <span>написать всем</span>`);
    tabBtn.type = 'button';
    dock.append(tabBtn);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); armed = true; sendMine(); }
      else if (e.key === 'Tab' && !set) { e.preventDefault(); toggleChat(); }
      else if (e.key === 'Escape') input.blur();
    });
    if (set) { tabBtn.disabled = true; tabBtn.classList.add('is-static'); }
    else {
      modeLab.addEventListener('mousedown', (e) => e.preventDefault());
      modeLab.addEventListener('click', toggleChat);
      tabBtn.addEventListener('mousedown', (e) => e.preventDefault());
      tabBtn.addEventListener('click', () => { armed = true; toggleChat(); input.focus(); });
    }
    bl.append(dock);
  }

  // ---------------------------------------------------------------- верх-центр: цель, плашки, тосты
  function setEvent(html, cls = '') {
    evEl?.remove();
    evEl = null;
    if (!html) return;
    evEl = h('div', `k-event${cls ? ` ${cls}` : ''}`, html);
    evEl.setAttribute('role', 'status');
    tc.insertBefore(evEl, toasts);
  }
  const goalIc = (id) => `<span class="k-event-ic">${iconImg(id, '')}</span>`;
  function goal() {
    if (S.view === 'set') {
      setEvent(`${goalIc('scroll')}<div class="k-event-title">${S.dan ? 'Отвечай на вопросы' : 'Отмечай догадки'}</div><div class="k-event-sub">${S.dan ? 'Да, нет или неважно — разгадку знаешь только ты' : 'Тёплые встанут цепочкой для всех'}</div>`);
    } else {
      setEvent(`${goalIc('scroll')}<div class="k-event-title">Угадай, что загадал ${esc(S.setter.nick)}</div><div class="k-event-sub">Пиши в «В игру» — тёплые встанут в цепочку</div>`);
    }
  }
  function toast(o) {
    const t = h('div', `k-toast k-toast--${o.tone ?? 'info'} is-new`);
    t.innerHTML = `<span class="k-toast-ic"><img src="img/icons/${o.icon}.webp" alt=""></span><div class="k-toast-title">${coinText(o.title)}</div>${o.sub ? `<div class="k-toast-sub">${esc(o.sub)}</div>` : ''}`;
    toasts.prepend(t);
    while (toasts.children.length > 3) toasts.lastElementChild.remove();
    setTimeout(() => { t.classList.remove('is-new'); t.classList.add('is-out'); setTimeout(() => t.remove(), 320); }, o.life ?? 4800);
  }
  function hero(tone, title, subHtml) {
    cc.replaceChildren();
    const box = h('div', `k-hero k-hero--${tone} rd-hero is-play`);
    box.innerHTML = `<p class="k-hero-title">${esc(title)}</p><span class="k-hero-sub">${subHtml}</span>`;
    cc.append(box);
    setTimeout(() => box.remove(), 3400);
  }
  function confetti() {
    conf.replaceChildren();
    const cols = ['var(--gold)', 'var(--bad-hi)', 'var(--good)', 'var(--info)', 'var(--special)', 'var(--w-surf-text)'];
    for (let i = 0; i < 56; i++) {
      const p = h('i');
      p.style.cssText = `--x:${rnd(2, 98).toFixed(1)}%;--dx:${rnd(-90, 90).toFixed(0)}px;--d:${rnd(0, 0.9).toFixed(2)}s;--t:${rnd(1.8, 3.1).toFixed(2)}s;--r:${rnd(0, 180).toFixed(0)}deg;--c:${pick(cols)};--w:${rnd(7, 13).toFixed(0)}px`;
      conf.append(p);
    }
    setTimeout(() => conf.replaceChildren(), 4200);
  }
  function tokensPop(n) {
    S.tokens += n;
    put(badgeTok.lastElementChild, fmt.format(S.tokens));
    badgeTok.classList.remove('is-bump');
    void badgeTok.offsetWidth;
    badgeTok.classList.add('is-bump');
    const p = h('span', 'k-pop', `+${n}`);
    badgeEl.append(p);
    setTimeout(() => p.remove(), 1700);
  }

  // ---------------------------------------------------------------- начало: окно «Что загадал?»
  function openStart() {
    scrim?.remove();
    S.phase = 'start';
    build();
    tl.replaceChildren();
    br.replaceChildren();
    tc.replaceChildren();
    bc.replaceChildren();
    const dan = S.dan;
    scrim = h('div', 'k-scrim rd-scrim');
    scrim.innerHTML = `<section class="k-window k-window--sm is-in" role="dialog" aria-label="Что загадал?">
      <header class="k-win-head">
        <span class="k-win-portrait"><img src="img/icons/scroll.webp" alt=""></span>
        <div class="k-win-titles"><p class="k-eyebrow">Загадка</p><h2 class="k-win-title">Что загадал?</h2></div>
        <div class="k-win-tools"><button class="k-close" type="button" aria-label="Закрыть"><kbd class="k-key k-key--sm">Esc</kbd></button></div>
      </header>
      <div class="k-win-body">
        <div class="rd-plain"${dan ? ' hidden' : ''}>
          <div class="rd-field"><label class="rd-lab" for="rd-secret"><span>Загаданное</span><span class="k-faint">видишь только ты</span></label>
            <input class="k-input" id="rd-secret" type="text" maxlength="40" autocomplete="off" spellcheck="false" value="${esc(S.secret)}"></div>
          <div class="rd-field"><span class="rd-lab"><span>Категория</span></span><div class="rd-cats">${CATS.map((c) => `<button type="button" class="k-pill rd-cat${c === S.cat ? ' k-pill--gold is-on' : ''}" aria-pressed="${c === S.cat}">${c}</button>`).join('')}</div></div>
          <div class="rd-field"><label class="rd-lab" for="rd-hint1"><span>Первая подсказка</span><span class="k-faint">по желанию</span></label>
            <input class="k-input" id="rd-hint1" type="text" maxlength="60" autocomplete="off" placeholder="Например: ходит по воде" value="${esc(S.firstHint)}"></div>
        </div>
        <div class="k-cell rd-dan"${dan ? '' : ' hidden'}>
          ${iconImg('journal', 'k-ic rd-dan-ic')}
          <div><b>Данетка «${esc(DAN.title)}»</b><p class="k-dim">Историю увидят все, разгадку — только ты. Отвечай «Да», «Нет» или «Неважно».</p></div>
        </div>
        <label class="k-switch rd-sw"><input type="checkbox" ${dan ? 'checked' : ''}><span class="k-switch-track"></span>Данетка из пака</label>
        <p class="rd-err" hidden></p>
      </div>
      <footer class="k-win-foot"><button class="k-btn k-btn--go rd-go" type="button">Загадать${keyHtml('Enter', 'tr')}</button></footer>
    </section>`;
    scale.append(scrim);
    const q = (s) => scrim.querySelector(s);
    const secret = q('#rd-secret');
    const go = q('.rd-go');
    const err = q('.rd-err');
    const check = () => {
      const bad = !S.dan && secret.value.trim().length < 2;
      go.disabled = bad;
      err.hidden = !bad;
      err.textContent = bad ? 'Загадай хотя бы два знака' : '';
    };
    secret.addEventListener('input', () => { S.secret = secret.value; check(); });
    q('#rd-hint1').addEventListener('input', (e) => { S.firstHint = e.target.value; });
    scrim.querySelectorAll('.rd-cat').forEach((b) => b.addEventListener('click', () => {
      armed = true; play('click');
      S.cat = b.textContent;
      scrim.querySelectorAll('.rd-cat').forEach((x) => { const on = x === b; x.classList.toggle('k-pill--gold', on); x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', String(on)); });
    }));
    q('.rd-sw input').addEventListener('change', (e) => {
      armed = true; play('click');
      S.dan = e.target.checked;
      q('.rd-plain').hidden = S.dan;
      q('.rd-dan').hidden = !S.dan;
      check();
    });
    q('.k-close').addEventListener('click', () => { armed = true; closeStart(); });
    scrim.addEventListener('click', (e) => { if (e.target === scrim) { armed = true; closeStart(); } });
    scrim.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input[type="text"]')) { e.preventDefault(); if (!go.disabled) go.click(); } });
    go.addEventListener('click', () => { armed = true; startRound(); });
    check();
    play('open');
  }

  function closeStart() {
    play('close');
    scrim?.remove();
    scrim = null;
    S.phase = 'idle';
    bc.replaceChildren();
    const p = h('div', 'k-prompt', `${keyHtml('E')}Загадать<span class="k-prompt-sep"></span><span class="k-prompt-note">Трибуна · Ракушка</span>`);
    p.style.pointerEvents = 'auto';
    p.style.cursor = 'pointer';
    p.addEventListener('click', () => { armed = true; reopenStart(); });
    bc.append(p);
  }
  function reopenStart() { S.phase = 'start'; bc.replaceChildren(); openStart(); }

  function startRound() {
    scrim?.remove();
    scrim = null;
    const dan = S.dan;
    S.answer = dan ? DAN.solution : S.secret.trim();
    S.hintsAll = dan ? DAN.hints : hintsFor(S.answer, S.cat);
    S.script = dan ? DAN.script.map((x) => ({ ...x })) : [...WORD.script, `${S.answer}ик?`, `${S.answer}!`].map((t) => ({ t }));
    S.scriptI = 0;
    S.phase = 'play';
    S.botIn = 1800;
    build();
    if (S.firstHint.trim() && !dan) addHint(S.firstHint.trim());
    goal();
  }

  // ---------------------------------------------------------------- подсказки
  function addHint(text) {
    S.hints.push(text);
    put(hintN, String(S.hints.length));
    const li = h('li', 'rd-hint is-new', `<b>${S.hints.length}</b><span>${esc(text)}</span>`);
    hintList.append(li);
    if (hintBtn) {
      hintBtn.disabled = S.hints.length >= 3;
      hintBtn.textContent = S.hints.length >= 3 ? 'Подсказки кончились' : 'Подсказка';
    }
  }
  function giveHint() {
    if (S.phase !== 'play' || S.hints.length >= 3) return;
    const t = S.hintsAll.find((x) => !S.hints.includes(x));
    if (!t) return;
    addHint(t);
    play('pop');
  }

  // ---------------------------------------------------------------- догадки
  function botWho() {
    let b;
    do { b = pick(BOTS.filter((x) => x !== S.setter)); } while (b === S.lastBot);
    S.lastBot = b;
    return b;
  }
  function nextScript() {
    const set = S.view === 'set';
    // «Я загадываю»: к самому ответу боты подходят только по цепочке «тепло» — нужно хотя бы два 👍
    // (или долгое молчание), иначе гадают мимо: так видно, что лайки ведут к ответу
    if (set && !S.dan && S.scriptI >= WORD.script.length && S.warm.length < 2 && S.elapsed < 225000) {
      return { t: MISS[(S.missI = (S.missI ?? -1) + 1) % MISS.length] };
    }
    if (set || S.dan) return S.script[S.scriptI++] ?? null;
    const t = LIGHT.script[S.scriptI++];
    return t ? { t } : null;
  }
  function botGuess() {
    const n = nextScript();
    if (!n) { S.botIn = 99999; return; }
    addGuess(botWho(), n.t, false, n);
  }

  function addGuess(who, text, own, meta = {}) {
    const set = S.view === 'set';
    const l = { id: ++S.uid, who, text, own, state: 'new', age: 0, markIn: null, judge: S.dan ? (meta.close ? 'close' : 'no') : judge(text, S.answer) };
    S.lines.push(l);
    l.el = h('div', `rd-line is-new${own ? ' is-own' : ''}${l.judge === 'close' ? ' is-close' : ''}`, rowHtml(l));
    feedList.append(l.el);
    // в ленте помещается не больше строк, чем на экране: самая старая неотмеченная гаснет
    const cap = set ? (S.dan ? 4 : 5) : 8;
    const open = S.lines.filter((x) => x.state === 'new');
    if (open.length > cap) fadeOut(open[0], true);
    bubble(l);
    if (!S.dan && l.judge === 'yes') later(set ? 500 : 350, () => mark(l, 'hit', true));
    else if (!set) l.markIn = rnd(1000, 3000);
    refresh();
  }

  function rowHtml(l) {
    const set = S.view === 'set';
    const acts = S.dan
      ? [['yes', '👍 Да', 'go', '1'], ['no', '👎 Нет', 'stop', '2'], ['meh', 'Неважно', 'ghost', '3'], ['hit', '🎯 Разгадали', '', '4']]
      : [['warm', '👍 Тепло', 'go', '1'], ['cold', '👎 Мимо', 'stop', '2'], ['hit', '🎯 Угадал', '', '3']];
    const note = l.judge === 'close' ? `<span class="k-pill k-pill--xs k-pill--good rd-close">${S.dan ? 'похоже на разгадку' : 'похоже на ответ'}</span>` : '';
    return `<span class="rd-av">${jelly(l.who.color, 34, { hat: l.who.hat })}</span>
      <div class="rd-line-body"><span class="rd-nick">${esc(l.own ? `${l.who.nick} · ты` : l.who.nick)}</span><p class="rd-text">${esc(l.text)}</p></div>
      <span class="rd-mark" data-mark>${note}</span>
      ${set ? `<div class="rd-acts">${acts.map(([k, label, tone, key]) => `<button type="button" class="k-btn k-btn--sm${tone ? ` k-btn--${tone}` : ''} rd-act" data-act="${k}">${label}${keyHtml(key, 'tr', 'sm')}</button>`).join('')}</div>` : ''}`;
  }

  /** Облачко над желейкой-зрителем (слой .k-world) */
  function bubble(l) {
    let spot = l.own ? MY_SPOT : null;
    if (!spot) {
      const free = S.spots.filter((s) => !s.used);
      spot = pick(free.length ? free : S.spots);
      spot.used = true;
    }
    const b = h('div', 'rd-bub');
    b.style.setProperty('--x', `${spot.x}px`);
    b.style.setProperty('--y', `${spot.y}px`);
    b.innerHTML = `<div class="k-world-in"><div class="k-plate rd-bub-in${l.own ? ' is-own' : ''}">${esc(l.text)}</div></div>`;
    world.append(b);
    while (world.children.length > 6) world.firstElementChild.remove();
    l.bub = b;
    setTimeout(() => { b.classList.add('is-out'); setTimeout(() => { b.remove(); spot.used = false; }, 420); }, 4800);
  }

  /** Строка, на которую действуют клавиши: самая старая неотмеченная */
  function refresh() {
    const open = S.lines.filter((x) => x.state === 'new');
    S.lines.forEach((x) => x.el?.classList.toggle('is-next', S.view === 'set' && S.phase === 'play' && x === open[0]));
    put(feedN, String(open.length));
    feedEmpty.hidden = open.length > 0 || S.lines.some((x) => x.state === 'hit');
    feed.classList.toggle('is-empty', !feedEmpty.hidden);
  }

  function markNext(kind) {
    const l = S.lines.find((x) => x.state === 'new');
    if (l) mark(l, kind);
  }

  /** Загадывающий (ты или бот) отмечает строку */
  function mark(l, kind, auto = false) {
    if (S.phase !== 'play' || l.state !== 'new') return;
    // строка совпала с ответом — это всегда 🎯, даже если успели нажать 👍
    if (kind === 'hit' || (l.judge === 'yes' && !S.dan)) { win(l, auto); return; }
    const warm = kind === 'warm' || kind === 'yes';
    l.state = kind;
    l.markIn = null;
    l.el.classList.add(`is-${warm ? 'warm' : 'cold'}`);
    l.el.querySelector('.rd-acts')?.setAttribute('hidden', '');
    const badge = { warm: '👍', yes: '👍 Да', cold: '👎', no: '👎 Нет', meh: 'неважно' }[kind];
    l.el.querySelector('[data-mark]').innerHTML = `<span class="k-pill k-pill--sm ${warm ? 'k-pill--gold' : ''}">${badge}</span>`;
    l.bub?.classList.add(warm ? 'is-warm' : 'is-cold');
    play(warm ? 'warm' : 'cold');
    refresh();
    later(S.view === 'set' ? 0 : 750, () => sendOff(l, warm));
  }

  /** Строка «улетает» — в цепочку «Тепло» или в серый список «мимо» */
  function sendOff(l, warm) {
    const from = l.el.querySelector('.rd-text') ?? l.el;
    if (warm) {
      S.warm.push(l);
      const li = h('li', 'rd-link is-hid', `<span class="rd-link-av">${jelly(l.who.color, 24, { hat: l.who.hat })}</span><span class="rd-link-t">${esc(l.text)}</span><span class="rd-link-n">${esc(l.who.nick)}</span>`);
      chainList.append(li);
      while (chainList.children.length > 6) chainList.firstElementChild.remove();
      chainEmpty.hidden = true;
      put(chainN, String(S.warm.length));
      flyChip(from, li, l.text, true, () => { li.classList.remove('is-hid'); li.classList.add('is-new'); });
    } else {
      S.cold.push(l);
      cold.hidden = false;
      cold.innerHTML = `<span class="k-faint">${S.dan ? 'Нет' : 'Мимо'}:</span> ${S.cold.slice(-4).map((x) => `<s>${esc(x.text)}</s>`).join('')}`;
      flyChip(from, cold, l.text, false, () => {});
    }
    removeRow(l);
  }

  const kScale = () => stage.frame.getBoundingClientRect().width / 1440 || 1;
  function flyChip(fromEl, toEl, text, warm, done) {
    const k = kScale();
    const fr = stage.frame.getBoundingClientRect();
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    const chip = h('span', `k-pill ${warm ? 'k-pill--gold' : ''} rd-chip`, esc(text));
    chip.style.left = `${(a.left - fr.left) / k}px`;
    chip.style.top = `${(a.top - fr.top) / k}px`;
    flyLayer.append(chip);
    const dx = (b.left - a.left) / k + 12;
    const dy = (b.top - a.top) / k + (warm ? 2 : 8);
    const an = chip.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.35 - 40}px) scale(1.08)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(.8)`, opacity: warm ? 0.9 : 0.35 },
    ], { duration: warm ? 620 : 520, easing: 'cubic-bezier(.3,.7,.25,1)' });
    const fin = () => { chip.remove(); done(); };
    an.finished.then(fin, fin);
  }

  function removeRow(l) {
    const r = l.el;
    const hh = r.offsetHeight;
    r.style.pointerEvents = 'none';
    const an = r.animate([{ height: `${hh}px`, opacity: 1 }, { height: `${hh}px`, opacity: 0, offset: 0.35 }, { height: '0px', opacity: 0, margin: '0 0 -6px', padding: '0 10px' }], { duration: 320, easing: 'ease-in', fill: 'forwards' });
    const fin = () => { r.remove(); refresh(); };
    an.finished.then(fin, fin);
  }
  function fadeOut(l, quiet) {
    if (l.state !== 'new') return;
    l.state = 'fade';
    l.bub?.classList.add('is-cold');
    removeRow(l);
    if (!quiet) refresh();
  }

  // ---------------------------------------------------------------- ты пишешь «В игру» / «Всем»
  function toggleChat() {
    S.chatAll = !S.chatAll;
    put(modeLab, S.chatAll ? 'Всем:' : 'В игру:');
    input.placeholder = S.chatAll ? 'Сообщение' : 'Твоя догадка…';
    tabBtn.lastElementChild.textContent = S.chatAll ? 'писать в игру' : 'написать всем';
    chatList.parentElement.classList.toggle('is-all', S.chatAll);
    play('click');
  }
  function sendMine() {
    const text = input.value.trim();
    if (!text || S.phase === 'start' || (!S.chatAll && S.phase !== 'play')) return;
    const now = performance.now();
    if (!S.chatAll && now - S.lastSend < 2000) {
      tabBtn.lastElementChild.textContent = 'не чаще раза в 2 с';
      tabBtn.classList.add('is-warn');
      setTimeout(() => { tabBtn.classList.remove('is-warn'); tabBtn.lastElementChild.textContent = S.chatAll ? 'писать в игру' : 'написать всем'; }, 1300);
      return;
    }
    input.value = '';
    if (S.chatAll) {
      const row = h('div', 'k-chat-line is-own', `<b class="k-nick-1">${esc(ME.nick)}</b>${esc(text)}`);
      chatList.append(row);
      while (chatList.children.length > 4) chatList.firstElementChild.remove();
      play('pop');
      return;
    }
    S.lastSend = now;
    play('pop');
    addGuess(ME, text, true);
  }

  // ---------------------------------------------------------------- 🎯: праздник и «Загадывай ты!»
  function win(l, auto) {
    S.phase = 'win';
    feed.classList.add('is-over');
    S.winner = l.who;
    l.state = 'hit';
    l.markIn = null;
    l.el.classList.add('is-hit');
    l.el.classList.remove('is-next');
    l.el.querySelector('.rd-acts')?.setAttribute('hidden', '');
    l.el.querySelector('[data-mark]').innerHTML = '<span class="k-pill k-pill--sm k-pill--gold">🎯</span>';
    l.bub?.classList.add('is-hit');
    refresh();
    const set = S.view === 'set';
    const shown = S.dan ? DAN.short : S.answer;
    setEvent('');
    if (set) {
      hero('gold', 'Разгадали!', S.dan ? `Это была <b class="rd-ans">${esc(shown)}</b>` : `Ответ: <b class="rd-ans">${esc(shown)}</b> · ${esc(l.who.nick)}`);
      toast({ tone: 'reward', icon: 'scroll', title: '+3 очка · +10 🪙', sub: `Загадку разгадали: ${l.who.nick}` });
      tokensPop(10);
    } else {
      hero('gold', l.own ? 'Угадал!' : 'Разгадали!', `Это был <b class="rd-ans">${esc(shown)}</b>`);
      const bonus = Math.min(3, S.warm.filter((x) => x.own).length);
      toast({ tone: 'reward', icon: 'scroll', title: `+${5 + bonus} ${plural(5 + bonus)} · +15 🪙`, sub: bonus ? `5 за ответ и ${bonus} за тёплые догадки` : 'Ты разгадал загадку Барона' });
      tokensPop(15);
    }
    confetti();
    play('fanfare');
    later(3600, toNext);
  }
  const plural = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'очко' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'очка' : 'очков'));

  function timeUp() {
    S.phase = 'win';
    feed.classList.add('is-over');
    S.left = 0;
    put(timeEl, '0:00');
    const shown = S.dan ? DAN.short : S.answer;
    setEvent('');
    hero('info', 'Время вышло', `Не угадали. Ответ: <b class="rd-ans">${esc(shown)}</b>`);
    play('wrong');
    later(3600, toNext);
  }

  function toNext() {
    const set = S.view === 'set';
    S.phase = 'next';
    S.nextLeft = NEXT_MS;
    cc.replaceChildren();
    const mine = !set && S.winner === ME;
    if (mine) {
      setEvent(`${goalIc('scroll')}<div class="k-event-title">Загадывай ты!</div><div class="k-event-sub">Ты угадал — тебе и загадывать</div><div class="k-event-timer" data-nt>0:10</div>
        ${meterHtml(1, 'mode', 'k-meter--thin')}
        <div class="k-event-actions"><button class="k-btn k-btn--go k-btn--sm" type="button" data-nx="yes">Загадываю!${keyHtml('E', 'tr', 'sm')}</button><button class="k-btn k-btn--ghost k-btn--sm" type="button" data-nx="skip">Пропустить</button></div>`, 'k-lamp');
      evEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-nx]');
        if (!b) return;
        armed = true;
        if (b.dataset.nx === 'yes') iWillSet(); else skipTurn();
      });
    } else {
      afterTurn(S.winner && S.winner !== ME ? S.winner : pick(BOTS.filter((x) => x !== S.setter)));
    }
  }
  function iWillSet() {
    play('open');
    setView('set', true);
  }
  function skipTurn() {
    play('click');
    afterTurn(pick(BOTS.filter((x) => x !== S.setter && x !== S.winner)));
  }
  function afterTurn(next) {
    S.phase = 'over';
    setEvent(`${goalIc('scroll')}<div class="k-event-title">Дальше загадывает ${esc(next.nick)}</div><div class="k-event-sub">${S.winner ? 'Угадавший загадывает следующим' : 'Следующий по очереди'}</div>
      <div class="k-event-actions"><button class="k-btn k-btn--ghost k-btn--sm" type="button" data-nx="again">Ещё раз</button></div>`);
    evEl.querySelector('[data-nx]').addEventListener('click', () => { armed = true; reset(); });
  }

  // ---------------------------------------------------------------- ход времени
  function step(dt) {
    if (!S || S.phase === 'idle' || S.phase === 'start') return;
    if (S.phase === 'next') {
      if (!evEl?.querySelector('[data-nt]')) return;
      S.nextLeft -= dt;
      put(evEl.querySelector('[data-nt]'), clock(S.nextLeft));
      setMeter(evEl.querySelector('.k-meter'), S.nextLeft / NEXT_MS);
      if (S.nextLeft <= 0) skipTurn();
      return;
    }
    if (S.phase !== 'play') return;
    S.left -= dt * SPEED;
    S.elapsed += dt * SPEED;
    put(timeEl, clock(S.left));
    setMeter(timeBar, S.left / ROUND_MS);
    const hurry = S.left <= 60000;
    timeEl.classList.toggle('is-hurry', hurry);
    timeBar.classList.toggle('is-hurry', hurry);
    if (hurry && !S.minuteShown) {
      S.minuteShown = true;
      setEvent(`${goalIc('stopwatch')}<div class="k-event-title">Осталась минута</div><div class="k-event-sub">${S.view === 'set' ? 'Можно дать подсказку' : 'Пора угадывать'}</div>`, 'k-event--danger k-lamp');
      play('buzz');
      later(5000, () => { if (S.phase === 'play') goal(); });
    }
    if (S.left <= 0) { timeUp(); return; }
    // подсказки Барона
    if (S.view === 'guess' && !S.dan) {
      const i = S.hints.length;
      if (i < 3 && S.elapsed >= LIGHT.hintAt[i]) {
        addHint(LIGHT.hints[i]);
        toast({ icon: 'scroll', title: `Подсказка от ${S.setter.nick}`, sub: LIGHT.hints[i], life: 3600 });
        play('pop');
      }
    }
    // догадки ботов
    S.botIn -= dt;
    if (S.botIn <= 0) {
      botGuess();
      S.botIn = S.view === 'set' ? rnd(3000, 5500) : rnd(3000, 6000);
    }
    for (const l of S.lines) {
      if (l.state !== 'new') continue;
      if (l.markIn !== null) {
        l.markIn -= dt;
        if (l.markIn <= 0) { l.markIn = null; botMark(l); continue; }
      }
      l.age += dt * SPEED;
      if (l.age > FADE_MS * 0.7) l.el.classList.add('is-old');
      if (l.age > FADE_MS) fadeOut(l);
    }
  }
  /** Бот-загадывающий отвечает по словам: 👍 для «тёплых», 👎 для остальных */
  function botMark(l) {
    if (S.dan) return;
    mark(l, WARM.test(nrm(l.text)) ? 'warm' : 'cold');
  }

  // ---------------------------------------------------------------- вид, заголовки, перезапуск
  function texts() {
    const set = S.view === 'set';
    const kk = (k) => `<b>${k}</b>`;
    capT.textContent = set ? 'Живой макет · ты загадываешь' : 'Живой макет · ты угадываешь';
    if (set) {
      capN.innerHTML = S.dan
        ? `Данетка из пака: историю видят все, разгадку — только ты. Отвечай «Да», «Нет», «Неважно» мышью или клавишами ${kk(1)}–${kk(4)}; верную мысль отмечай «Разгадали».`
        : `Боты пишут догадки в строку «В игру». Отмечай мышью или клавишами ${kk(1)} ${kk(2)} ${kk(3)}: 👍 уводит строку в цепочку «Тепло», 👎 — в «Мимо». Верная догадка отмечается 🎯 сама. Время раунда в макете идёт втрое быстрее.`;
    } else {
      capN.innerHTML = `Барон загадал, но не говорит что. Смотри цепочку «Тепло» слева, пиши догадку в строку слева внизу (${kk('Enter')}; ${kk('Tab')} — «Всем:»). Верную Барон отметит 🎯 сам. Время раунда в макете идёт втрое быстрее.`;
    }
  }

  function setView(view, openWin) {
    const dan = openWin ? false : (S?.dan && view === 'set');
    scrim?.remove();
    scrim = null;
    S = fresh(view, !!dan);
    seg?.forEach((b, i) => b.setAttribute('aria-pressed', String(i === view0[view])));
    texts();
    if (view === 'set') openStart();
    else build();
  }
  function reset() { setView(S.view); }

  seg = segButtons(stage.ctl, ['Я загадываю', 'Я угадываю'], 0, (i) => { armed = true; setView(i === 0 ? 'set' : 'guess'); });
  const again = h('button', 'pg-btn', 'Начать заново');
  again.type = 'button';
  again.addEventListener('click', () => { armed = true; reset(); });
  stage.ctl.append(again);

  // клавиши: только пока раздел на экране и фокус не в поле
  document.addEventListener('keydown', (e) => {
    if (!visible || !S || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const typing = t instanceof HTMLElement && t.matches('input, textarea, select, [contenteditable="true"]');
    if (S.phase === 'start') {
      if (e.key === 'Escape') { e.preventDefault(); armed = true; closeStart(); }
      return;
    }
    if (typing) return;
    if (S.phase === 'idle' && e.key.toLowerCase() === 'e') { armed = true; reopenStart(); return; }
    if (S.phase === 'next' && S.view === 'guess' && e.key.toLowerCase() === 'e' && evEl?.querySelector('[data-nx="yes"]')) { armed = true; iWillSet(); return; }
    if (S.phase !== 'play') return;
    if (S.view === 'set') {
      const map = S.dan ? { 1: 'yes', 2: 'no', 3: 'meh', 4: 'hit' } : { 1: 'warm', 2: 'cold', 3: 'hit' };
      if (map[e.key]) { e.preventDefault(); armed = true; markNext(map[e.key]); }
    } else if (e.key === 'Enter') { e.preventDefault(); input?.focus(); }
  });
  scale.addEventListener('pointerdown', () => { armed = true; }, true);

  // раздел не на экране — боты и таймеры стоят
  new IntersectionObserver((es) => { visible = es[0].isIntersecting && es[0].intersectionRatio >= 0.35; }, { threshold: [0, 0.35, 0.6, 1] }).observe(stage.frame);
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const gap = now - last;
    const dt = gap > 1500 ? 100 : gap;
    last = now;
    if (visible && !document.hidden) step(dt);
  }, 100);

  el.__rd = { get S() { return S; }, get visible() { return visible; }, step };
  setView('set');
}
