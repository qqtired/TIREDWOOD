// «Чат «В игру» и Затейник» — раздел 07 страницы-обзора «Ракушка» (на ките UI 2.0, как в игре).
// 1) «Строка чата на «Ракушке»»: подпись «Всем» ⇄ «В игру» (клик и Tab), зайти за ограду / выйти, свой голос, лента игры и облачка над желейками;
// 2) «Затейник»: портрет и реплики по ситуациям;
// 3) предложение «Викторина в общем чате»: вопрос раз в 25 минут, 60 секунд, +10 жетонов, выключатель в меню Esc → Интерфейс.
// Свои классы — ch-*, правила — css/chat.css под #chat. Боты и таймеры идут только пока сцена видна.
import { makeStage, segButtons, h, esc, keyHtml, iconImg, meterHtml, setMeter, coinText, jellySvg, PLAYERS, HOST, sfx, rnd, pick, checkAnswer } from './common.js';

const ME = 'Кракозябра';
const nickTone = (nick) => { let x = 0; for (const ch of nick) x = (x * 31 + ch.codePointAt(0)) >>> 0; return (x % 6) + 1; };
const fmt = (s) => { const t = Math.max(0, Math.ceil(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

/** Строка чата кита: ник цветом, текст — через textContent; 🪙 в тексте — монеткой кита */
function chatLine(nick, text, cls = '') {
  const row = h('div', `k-chat-line${nick ? ` k-nick-${nickTone(nick)}` : ' is-sys'}${nick === ME ? ' is-own' : ''}${cls ? ` ${cls}` : ''}`);
  if (nick) { const b = h('b'); b.textContent = nick; row.append(b); }
  if (text.includes('🪙')) row.insertAdjacentHTML('beforeend', coinText(text)); else row.append(document.createTextNode(text));
  return row;
}
/** Тосты верх-центра (как TopCenter.toast): до трёх, уходят сами */
function toaster(box) {
  return ({ tone = 'info', icon = 'chat', title, sub = '', life = 3800 }) => {
    const t = h('div', `k-toast k-toast--${tone} is-new`);
    t.innerHTML = `<span class="k-toast-ic">${iconImg(icon, '')}</span><div class="k-toast-title">${coinText(title)}</div>${sub ? `<div class="k-toast-sub">${coinText(sub)}</div>` : ''}`;
    box.append(t);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => { t.classList.remove('is-new'); t.classList.add('is-out'); setTimeout(() => t.remove(), 320); }, life);
  };
}
/** Часы сцены: fn(dt) раз в 0,1 с, пока сцена видна на экране; возвращает () => видна ли */
function clock(st, fn) {
  let vis = false, last = performance.now();
  new IntersectionObserver((es) => { vis = es[es.length - 1].isIntersecting; }, { threshold: 0.2 }).observe(st.frame);
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(1000, now - last) / 1000;
    last = now;
    if (vis && !document.hidden) fn(dt);
  }, 100);
  return () => vis;
}
const trim = (list, n) => {
  while (list.children.length > n) {
    const old = [...list.children].find((c) => !c.classList.contains('is-pin'));   // закреплённую строку не трогаем
    if (!old) break;
    old.remove();
  }
};

/** Док чата кита: список строк, строка «голос + ввод». Подпись у ввода меняет сцена */
function dock({ label = 'Всем:', placeholder = 'Сообщение' } = {}) {
  const d = h('div', 'k-chat ch-chat');
  d.innerHTML = `
    <div class="k-chat-list ch-list"></div>
    <div class="ch-speak"><span class="k-pill k-pill--plate k-pill--sm ch-zone" hidden>${iconImg('voice')}<span>Ракушка — свой голос</span></span><div class="k-speaking ch-speaking"></div></div>
    <div class="k-chat-bar">
      <button class="k-voice ch-voice" type="button" aria-label="Голос"><img src="img/icons/voice.webp" alt="" draggable="false">${keyHtml('V', undefined, 'sm')}</button>
      <div class="k-chat-input is-typing ch-input"><span class="ch-lab">${label}</span><input type="text" maxlength="60" placeholder="${placeholder}" autocomplete="off" spellcheck="false" aria-label="Сообщение">${keyHtml('Enter')}</div>
    </div>
    <div class="ch-hints"></div>`;
  // поле — не <label>: внутри кнопка-переключатель, а label отдал бы ей клики по всей строке
  const field = d.querySelector('.ch-input');
  field.addEventListener('click', (e) => { if (!e.target.closest('.ch-mode')) field.querySelector('input').focus(); });
  return d;
}
const speaking = (nicks) => nicks.map((n) => `<span class="k-pill k-pill--sm ch-sp"><span class="k-eq"><i></i><i></i><i></i></span>${esc(n)}</span>`).join('');

// ------------------------------------------------------------------ 1. строка чата на «Ракушке»

const GENERAL = [
  ['Вася_рыбак', 'на пирсе клюёт осётр!'], ['Капитан', 'кто идёт на шторм к маяку?'], ['Ксю', 'на батутах очередь, занимайте'],
  ['Мурка', 'в дурака никто не хочет?'], ['Пломбир', 'а что за эстрада в саду?'], ['ОченьДлинныйНик', 'я тоже иду к «Ракушке»'],
  ['Дед Мороз', 'жетоны на автоматах тают…'], ['Тёма', 'новый рекорд в картинге!'],
];
// «Загадка»: загадал Барон, категория «Место»; догадки остальных (сам загадывающий в «В игру» не пишет)
const GAME_SAY = [
  ['Санёк', 'порт'], ['Оля', 'пирс'], ['Тёма', 'башня'], ['Мурка', 'высокая башня?'], ['Санёк', 'там горит огонь?'],
  ['ОченьДлинныйНик', 'это вышка на самом краю набережной?'], ['Оля', 'на берегу?'], ['Тёма', 'сторожевая башня'], ['Мурка', 'свет для кораблей'],
];
/** Где на картинке стоят игроки (координаты сцены 1440×900): над головой — подпись, выше — облачко */
const PODIUM = { 'Тёма': [482, 412], [ME]: [594, 400], 'Мурка': [694, 420], 'Барон': [826, 426], 'Оля': [946, 426], 'Санёк': [1060, 438] };

function fence(el, snd) {
  const box = h('div', 'ch-block');
  el.append(box);
  const st = makeStage(box, {
    title: 'Строка чата на «Ракушке»',
    note: 'Зайди за ограду кнопкой справа или клавишей E: подпись у строки чата станет переключателем «В игру» ⇄ «Всем» (клик по ней или Tab). Напиши и туда и туда — и посмотри, куда попала строка.',
    bg: 'img/venue-shell.jpg', tag: 'Снаружи ограды',
  });
  let inside = false, mode = 'all';
  const gate = h('button', 'pg-btn', 'Зайти за ограду');
  gate.type = 'button';
  gate.setAttribute('aria-pressed', 'false');
  st.ctl.append(gate);

  // слой «над миром»: подписи над желейками и облачка-реплики
  const world = h('div', 'k-world ch-world');
  st.scale.insertBefore(world, st.hud);
  for (const [nick, [x, y]] of Object.entries(PODIUM)) {
    const p = h('div', 'ch-wpos');
    p.style.left = `${x}px`; p.style.top = `${y}px`;
    p.innerHTML = `<div class="k-world-in"><span class="k-plate ch-np${nick === ME ? ' is-own' : ''}">${esc(nick)}</span></div>`;
    world.append(p);
  }
  const bubbles = new Map();   // ник → { el, lift }
  const slots = Object.keys(PODIUM);
  function bubble(nick, text) {
    const pos = PODIUM[nick];
    if (!pos) return;
    bubbles.get(nick)?.el.remove();
    // соседние желейки стоят близко: если у соседа облачко низко — моё поднимаем выше, чтобы не наползали
    const i = slots.indexOf(nick);
    const near = [slots[i - 1], slots[i + 1]].map((k) => bubbles.get(k)).filter(Boolean);
    const lift = near.some((n) => n.lift === 34) ? 92 : 34;
    const b = h('div', 'ch-wpos ch-bubpos');
    b.style.left = `${pos[0]}px`; b.style.top = `${pos[1] - lift}px`;
    b.innerHTML = '<div class="k-world-in"><div class="k-plate ch-bub"></div></div>';
    const bb = b.querySelector('.ch-bub');
    bb.textContent = text;
    bb.classList.toggle('is-own', nick === ME);
    world.append(b);
    const rec = { el: b, lift };
    bubbles.set(nick, rec);
    setTimeout(() => { if (bubbles.get(nick) === rec) bubbles.delete(nick); b.classList.add('is-out'); setTimeout(() => b.remove(), 300); }, 4800);
  }

  // HUD: тосты, лента игры, док чата, подсказка у калитки
  st.hud.innerHTML = `
    <div class="k-slot k-slot--tc"><div class="k-toasts ch-toasts"></div></div>
    <div class="k-slot k-slot--tr"><section class="k-plate ch-feed" hidden aria-label="Лента игры">
      <header class="ch-feed-head">${iconImg('scroll')}<span class="ch-feed-t"><b>«Загадка» идёт</b><small>загадал Барон · Место</small></span><span class="k-pill k-pill--good k-pill--sm ch-feed-time">3:41</span></header>
      <div class="ch-feed-list"></div>
    </section></div>
    <div class="k-slot k-slot--bc"><button type="button" class="k-prompt ch-enter"></button></div>`;
  const d = dock();
  const bl = h('div', 'k-slot k-slot--bl');
  bl.append(d);
  st.hud.append(bl);
  const q = (s) => st.hud.querySelector(s);
  const toast = toaster(q('.ch-toasts'));
  const ui = {
    list: q('.ch-list'), feed: q('.ch-feed'), feedList: q('.ch-feed-list'), prompt: q('.ch-enter'), input: q('.ch-input input'), field: q('.ch-input'),
    zone: q('.ch-zone'), speak: q('.ch-speaking'), hints: q('.ch-hints'), voice: q('.ch-voice'), time: q('.ch-feed-time'),
  };
  const general = (nick, text) => { ui.list.append(chatLine(nick, text)); trim(ui.list, 5); };
  const feedLine = (nick, text) => {
    const r = h('div', `ch-fl${nick === ME ? ' is-own' : ''}`);
    const b = h('b', `k-nick-${nickTone(nick)}`);
    b.textContent = nick;
    r.append(b, document.createTextNode(` ${text}`));
    ui.feedList.append(r);
    trim(ui.feedList, 6);
  };
  general('Вася_рыбак', 'на пирсе клюёт осётр!');
  general('Капитан', 'кто идёт на шторм к маяку?');

  /** Подпись у ввода: снаружи — просто «Всем:», внутри — переключатель с ▾ */
  function paintLabel() {
    const old = ui.field.querySelector('.ch-lab, .ch-mode');
    let node;
    if (inside) {
      node = h('button', 'ch-mode', mode === 'game' ? 'В игру' : 'Всем');
      node.type = 'button';
      node.setAttribute('aria-label', 'Куда писать: сейчас «' + (mode === 'game' ? 'В игру' : 'Всем') + '». Нажми, чтобы переключить');
      node.addEventListener('mousedown', (e) => e.preventDefault());
      node.addEventListener('click', () => { snd('click'); flip(); ui.input.focus(); });
    } else {
      node = h('span', 'ch-lab', 'Всем:');
    }
    old.replaceWith(node);
    ui.field.classList.toggle('is-game', inside && mode === 'game');
    ui.input.placeholder = inside && mode === 'game' ? 'Догадка или вопрос' : 'Сообщение';
    ui.hints.innerHTML = (inside ? `<span class="k-pill k-pill--plate k-pill--sm">${keyHtml('Tab', undefined, 'sm')} ${mode === 'game' ? 'писать Всем' : 'писать В игру'}</span>` : '')
      + `<span class="k-pill k-pill--plate k-pill--sm">${keyHtml('Esc', undefined, 'sm')} не отправлять</span>`;
  }
  function flip() { mode = mode === 'game' ? 'all' : 'game'; paintLabel(); }

  let live = false;
  const paintSpeak = () => { ui.speak.innerHTML = speaking([...(live ? [ME] : []), ...(inside ? ['Затейник', 'Санёк'] : ['Вася_рыбак', 'Капитан'])]); };
  function setLive(v) { live = v; ui.voice.classList.toggle('is-live', live); ui.voice.setAttribute('aria-pressed', String(live)); paintSpeak(); snd('click'); }
  ui.voice.addEventListener('click', () => setLive(!live));
  function paint() {
    st.setTag(inside ? 'Внутри ограды' : 'Снаружи ограды');
    gate.textContent = inside ? 'Выйти из-за ограды' : 'Зайти за ограду';
    gate.setAttribute('aria-pressed', String(inside));
    ui.feed.hidden = !inside;
    ui.zone.hidden = !inside;
    paintSpeak();
    ui.prompt.innerHTML = `${keyHtml('E')}${inside ? 'Выйти за ограду' : 'Зайти за ограду'}<span class="k-prompt-sep"></span><span class="k-prompt-note">${inside ? 'снова общий голос и чат' : '«Ракушка» · свой голос и «В игру»'}</span>`;
    paintLabel();
  }
  function toggle() {
    inside = !inside;
    mode = inside ? 'game' : 'all';          // пока идёт «Загадка», угадывающим по умолчанию «В игру»
    if (inside) {
      toast({ tone: 'good', icon: 'voice', title: 'Ты на «Ракушке»', sub: 'Здесь свой голос' });
      snd('open');
      ui.feedList.replaceChildren();
      feedLine('Санёк', 'порт');
      feedLine('Оля', 'пирс');
      gi = 2;
      bt = 2;
    } else {
      toast({ tone: 'info', icon: 'exit', title: 'Ты вышел на набережную', sub: 'Голос и чат снова общие' });
      snd('close');
      for (const r of bubbles.values()) r.el.remove();
      bubbles.clear();
    }
    paint();
  }
  gate.addEventListener('click', toggle);
  ui.prompt.addEventListener('click', toggle);

  function send(text) {
    snd('pop');
    if (inside && mode === 'game') {
      feedLine(ME, text);
      bubble(ME, text);
    } else {
      general(ME, text);
    }
  }
  ui.input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); const v = ui.input.value.trim(); ui.input.value = ''; if (v) send(v); }
    else if (e.key === 'Tab' && inside) { e.preventDefault(); snd('click'); flip(); }
    else if (e.key === 'Escape') { ui.input.value = ''; ui.input.blur(); }
  });
  ui.input.addEventListener('keyup', (e) => e.stopPropagation());

  // клавиша E у сцены (как у калитки в игре): только пока сцена видна и не печатаешь
  let shown = () => false;
  document.addEventListener('keydown', (e) => {
    if (!shown() || e.repeat || e.target.closest?.('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyE') toggle();
    else if (e.code === 'KeyV') setLive(!live);
  });

  // боты: общий чат идёт всегда, лента игры — только внутри ограды
  let gt = rnd(3, 6), bt = 0, left = 221, gi = 2;
  shown = clock(st, (dt) => {
    left -= dt;
    if (left <= 0) left = 221;
    ui.time.textContent = fmt(left);
    gt -= dt;
    if (gt <= 0) { const [n, t] = pick(GENERAL); general(n, t); gt = rnd(9, 15); }
    if (!inside) return;
    bt -= dt;
    if (bt <= 0) {
      const [n, t] = GAME_SAY[gi++ % GAME_SAY.length];
      feedLine(n, t);
      bubble(n, t);
      bt = rnd(4.5, 7.5);
    }
  });
  paint();

  // пояснения — короткими подписями рядом
  const notes = h('div', 'pg-grid3 ch-notes');
  notes.innerHTML = `
    <div class="pg-card"><h3>«В игру»</h3><p>Строка уходит только игре: её видят все на «Ракушке» — лентой справа и облачком над желейкой. В общий чат она не попадает.</p></div>
    <div class="pg-card"><h3>«Всем»</h3><p>Как раньше: общий чат на всю набережную. Переключить — клик по подписи или Tab в поле ввода. Пока идёт «Загадка» или «Крокодил», угадывающим по умолчанию «В игру».</p></div>
    <div class="pg-card"><h3>Свой голос</h3><p>Внутри ограды слышишь только тех, кто тоже внутри; снаружи — набережную. Вход сопровождает тост, а плашка голоса называет комнату. Загадывающий и рисующий в «В игру» не пишут.</p></div>`;
  box.append(notes);
}

// ------------------------------------------------------------------ 2. Затейник

const SAY = {
  call: { eyebrow: 'Зазывает у входа', mood: 'talk', lines: ['Заходи на «Ракушку»! Сыграем в «Свою игру»?', 'Проходи, места на скамейках хватит всем!', 'Хочешь рисовать? «Крокодил» ждёт художника!', 'Загадай что-нибудь — мы угадаем!'] },
  host: { eyebrow: 'Ведёт игру', mood: 'talk', lines: ['Нет ведущего? Поведу я!', 'Тема «Рыбы», цена 300. Кто берёт?', 'Кнопки откроются через секунду…', 'Время пошло — отвечай голосом или в строку!'] },
  glad: { eyebrow: 'Радуется', mood: 'happy', lines: ['Вася жмёт первым!', 'Верно! Это был пароход.', 'Вот это рисунок! Браво!', 'Тепло, ещё теплее!'] },
  sad: { eyebrow: 'Утешает', mood: 'sad', lines: ['Ух, почти! Ещё разок?', 'Мимо — зато как смело!', 'Никто не знает? Ответ — Дед Семён.', 'Ничего, в следующий раз повезёт!'] },
};
const SAY_KEYS = ['call', 'host', 'glad', 'sad'];

function zatejnik(el, snd) {
  const box = h('div', 'ch-block');
  el.append(box);
  const st = makeStage(box, {
    title: 'Затейник',
    note: 'Житель-ведущий: зазывает у входа, ведёт «Свою игру», когда нет живого ведущего, радуется и утешает вместе с игроками. Выбери ситуацию и нажми «Что он скажет».',
    bg: 'img/venue-shell.jpg', tag: 'Затейник',
  });
  let cat = 'call', n = -1, lastClick = 0;
  st.hud.innerHTML = `
    <div class="ch-zat" data-mood="talk"><img src="img/zatejnik.png" alt="Затейник" draggable="false"><span class="k-plate ch-zname"><b>Затейник</b><span class="k-pill k-pill--info k-pill--sm">ведущий</span></span></div>
    <div class="k-plate ch-say" aria-live="polite"><p class="k-eyebrow ch-say-e"></p><p class="ch-say-t"></p></div>`;
  const zat = st.hud.querySelector('.ch-zat');
  const eb = st.hud.querySelector('.ch-say-e');
  const tx = st.hud.querySelector('.ch-say-t');
  const bub = st.hud.querySelector('.ch-say');
  let typing = 0;
  function speak(manual = false) {
    const set = SAY[cat];
    n = (n + 1) % set.lines.length;
    const line = set.lines[n];
    if (manual) lastClick = performance.now();
    eb.textContent = set.eyebrow;
    bub.classList.add('is-typing');
    tx.innerHTML = '<span class="ch-dots"><i></i><i></i><i></i></span>';
    zat.dataset.mood = set.mood;
    zat.classList.remove('is-say');
    void zat.offsetWidth;
    zat.classList.add('is-say');
    clearTimeout(typing);
    typing = setTimeout(() => { tx.textContent = line; bub.classList.remove('is-typing'); }, 420);
  }
  segButtons(st.ctl, ['Зазывает', 'Ведёт игру', 'Радуется', 'Утешает'], 0, (i) => { cat = SAY_KEYS[i]; n = -1; speak(true); snd('click'); });
  const btn = h('button', 'pg-btn', 'Что он скажет');
  btn.type = 'button';
  btn.addEventListener('click', () => { speak(true); snd('pop'); });
  st.ctl.append(btn);
  speak();
  let tick = 6;
  clock(st, (dt) => {
    tick -= dt;
    if (tick <= 0) { tick = 7; if (performance.now() - lastClick > 9000) speak(); }
  });
}

// ------------------------------------------------------------------ 3. Викторина в общем чате (предложение)

// вопросы про настоящих жителей набережной (Дед Семён, Мирон, Ася, Толик есть в игре)
const QUIZ = [
  { q: 'Как зовут скупщика рыбы на набережной?', a: ['Дед Семён', 'Семён'], show: 'Дед Семён', wrong: [['Мурка', 'Саня'], ['Тёма', 'Колян']] },
  { q: 'Кто присматривает за маяком?', a: ['Мирон', 'Смотритель Мирон'], show: 'Мирон', wrong: [['Мурка', 'Лёня'], ['Тёма', 'Толик']] },
  { q: 'Как зовут пилота, что катает на самолёте от пирса?', a: ['Ася', 'Пилот Ася'], show: 'Ася', wrong: [['Барон', 'Лиза'], ['Оля', 'Галя']] },
  { q: 'Кто принимает ставки на крысиных бегах?', a: ['Толик', 'Букмекер Толик'], show: 'Толик', wrong: [['Санёк', 'Жетоныч'], ['Мурка', 'Лёня']] },
];
const QUIZ_TIME = 60, QUIZ_COIN = 10, QUIZ_DAY = 50;

function quiz(el, snd) {
  const box = h('div', 'ch-block ch-quiz');
  el.append(box);
  const st = makeStage(box, {
    title: 'Викторина в общем чате',
    note: 'Раз в 25 минут, если на набережной от трёх человек, а на «Ракушке» пусто, Затейник задаёт вопрос прямо в общий чат. Первый верный ответ за минуту — жетоны.',
    bg: 'img/venue-shell.jpg', tag: 'Общий чат',
  });
  st.root.querySelector('.qz-cap-t').append(h('span', 'k-pill k-pill--gold k-pill--sm ch-offer', 'Предложение'));
  st.root.style.setProperty('--qz-shade', 'linear-gradient(180deg, rgba(8, 45, 43, .34), rgba(8, 45, 43, .56))');

  let on = true, round = -1, T = 0, active = false, earned = 0, bi = 0, auto = 3;
  let cur = null;

  // выключатель «Викторина в чате» — рядом со сценой; такой же — в карточке меню ниже
  const sw = h('label', 'k-switch ch-sw');
  sw.innerHTML = '<input type="checkbox" checked aria-label="Викторина в чате"><span class="k-switch-track"></span>Викторина в чате';
  const ask = h('button', 'pg-btn', 'Спросить сейчас');
  ask.type = 'button';
  st.ctl.append(sw, ask);

  st.hud.innerHTML = `
    <div class="k-slot k-slot--tc"><div class="ch-evslot"></div><div class="k-toasts ch-toasts"></div></div>`;
  const d = dock();
  d.querySelector('.ch-zone').remove();
  d.querySelector('.ch-speak').remove();
  const bl = h('div', 'k-slot k-slot--bl');
  bl.append(d);
  st.hud.append(bl);
  const toast = toaster(st.hud.querySelector('.ch-toasts'));
  const list = d.querySelector('.ch-list');
  const input = d.querySelector('.ch-input input');
  const evslot = st.hud.querySelector('.ch-evslot');
  d.querySelector('.ch-hints').innerHTML = `<span class="k-pill k-pill--plate k-pill--sm">${keyHtml('Esc', undefined, 'sm')} не отправлять</span>`;
  const line = (nick, text, cls = '') => { const row = chatLine(nick, text, cls); list.append(row); trim(list, 6); return row; };
  let pinned = null;   // строка с вопросом: закреплена, пока идёт минута
  const unpin = () => { pinned?.classList.remove('is-pin'); pinned = null; };
  line('Капитан', 'кто идёт на шторм к маяку?');
  line('Ксю', 'на батутах очередь, занимайте');
  line('', 'Затейник вышел на набережную', 'ch-sys');

  function plate() {
    evslot.innerHTML = `<div class="k-event ch-qplate"><span class="k-event-ic">${iconImg('horn', '')}</span><div class="k-event-title">Вопрос от Затейника</div><div class="k-event-sub">Отвечай в общий чат · ${coinText('+10 🪙')}</div><div class="k-event-timer">${fmt(QUIZ_TIME)}</div>${meterHtml(1, 'mode', 'k-meter--thin')}</div>`;
  }
  function start() {
    if (!on || active) return;
    round = (round + 1) % QUIZ.length;
    cur = QUIZ[round];
    T = 0; bi = 0; active = true;
    pinned = line('', `🎤 Затейник: вопрос на ${QUIZ_COIN} 🪙 — ${cur.q}`, 'ch-q is-pin');
    plate();
    snd('open');
    ask.disabled = true;
  }
  function stop(text, cls) {
    active = false;
    unpin();
    evslot.replaceChildren();
    if (text) line('', text, cls);
    ask.disabled = !on;
  }
  function paintDay() {
    setMeter(rules.querySelector('.ch-day .k-meter'), earned / QUIZ_DAY);
    rules.querySelector('.ch-day-n').innerHTML = coinText(`${earned} из ${QUIZ_DAY} 🪙`);
  }
  function answer(v) {
    snd('pop');
    if (!active) { line(ME, v); return; }
    const r = checkAnswer(v, cur.a);
    if (r === 'yes') {
      const gain = Math.min(QUIZ_COIN, QUIZ_DAY - earned);
      earned += gain;
      line(ME, v);
      line('', gain ? `🎤 Затейник: ${ME} первым — «${cur.show}»! +${gain} 🪙` : `🎤 Затейник: ${ME} первым — «${cur.show}»! Дневной лимит жетонов выбран`, 'ch-q is-win');
      toast(gain ? { tone: 'reward', icon: 'token', title: `+${gain} 🪙`, sub: 'Верный ответ Затейнику' } : { tone: 'info', icon: 'token', title: 'Лимит на сегодня', sub: `Уже ${QUIZ_DAY} 🪙 за викторину` });
      snd(gain ? 'reward' : 'click');
      paintDay();
      stop();
    } else if (r === 'close') {
      line(ME, v);
      line('', '🎤 Затейник шепчет тебе: «Почти!»', 'ch-q ch-whisper');
      snd('warm');
    } else {
      line(ME, v);
    }
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); const v = input.value.trim(); input.value = ''; if (v) answer(v); }
    else if (e.key === 'Escape') { input.value = ''; input.blur(); }
  });
  input.addEventListener('keyup', (e) => e.stopPropagation());
  ask.addEventListener('click', () => { snd('click'); start(); });

  // переключатель: выкл → строки викторины и плашка не видны
  const twins = [];
  function setOn(v) {
    on = v;
    if (!on && active) { active = false; unpin(); evslot.replaceChildren(); }   // выключил посреди вопроса — вопрос тихо закрывается
    st.root.classList.toggle('ch-qoff', !on);
    for (const i of twins) i.checked = on;
    ask.disabled = !on || active;
    ask.textContent = on ? 'Спросить сейчас' : 'Викторина выключена';
    st.setTag(on ? 'Общий чат' : 'Общий чат · викторина выключена');
    snd('click');
  }
  twins.push(sw.querySelector('input'));
  sw.querySelector('input').addEventListener('change', (e) => setOn(e.target.checked));

  // боты и таймер викторины
  clock(st, (dt) => {
    if (auto > 0) { auto -= dt; if (auto <= 0 && round < 0) start(); }
    if (!active) return;
    T += dt;
    while (bi < cur.wrong.length && T >= 9 + bi * 8) { const [n, t] = cur.wrong[bi++]; line(n, t, 'ch-q'); }
    const left = QUIZ_TIME - T;
    const t = evslot.querySelector('.k-event-timer');
    if (t) { t.textContent = fmt(left); t.classList.toggle('is-hurry', left <= 10); setMeter(evslot.querySelector('.k-meter'), left / QUIZ_TIME); }
    if (left <= 0) stop(`🎤 Затейник: Никто не знает? Ответ — ${cur.show}`, 'ch-q');
  });

  // карточки под сценой: «где это в меню» и условия
  const pair = h('div', 'pg-grid2 ch-pair');
  const set = h('section', 'k-panel ch-set');
  set.innerHTML = `
    <p class="k-eyebrow">Меню (Esc) → Интерфейс</p>
    <div class="k-row"><div class="k-row-text"><div class="k-row-title">Сообщения чата</div><div class="k-row-hint">Скрытые видно, пока чат открыт (Enter)</div></div>
      <div class="k-row-ctl"><div class="k-seg" role="group" aria-label="Сообщения чата"><button type="button" aria-pressed="true">Гаснут</button><button type="button" aria-pressed="false">Видны всегда</button><button type="button" aria-pressed="false">Скрыты</button></div></div></div>
    <label class="k-row"><div class="k-row-text"><div class="k-row-title">Викторина в чате <span class="k-pill k-pill--gold k-pill--sm">новое</span></div><div class="k-row-hint">Затейник иногда задаёт вопрос в общий чат. Выключишь — вопросов и ответов не увидишь</div></div>
      <div class="k-row-ctl"><span class="k-switch"><input type="checkbox" checked aria-label="Викторина в чате"><span class="k-switch-track"></span></span></div></label>`;
  const seg = set.querySelector('.k-seg');
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    snd('click');
  });
  const swInput = set.querySelector('.k-switch input');
  twins.push(swInput);
  swInput.addEventListener('change', (e) => setOn(e.target.checked));
  const rules = h('div', 'pg-card ch-rules');
  rules.innerHTML = `
    <h3>Когда и сколько</h3>
    <ul>
      <li>Раз в <b>25 минут</b>, если онлайн от трёх и на «Ракушке» пусто.</li>
      <li>Первый верный ответ за <b>60 секунд</b> — <b>+10 ${coinText('🪙').trim()}</b>, не больше <b>50</b> в день.</li>
      <li>Не ответил никто — Затейник скажет ответ сам.</li>
      <li>Выключатель — для себя, в меню Esc → Интерфейс; на сервере — отдельный флаг.</li>
    </ul>
    <div class="ch-day"><span class="k-faint">Твои жетоны за викторину сегодня</span><div class="ch-day-row">${meterHtml(0, 'good', 'k-meter--thin')}<b class="ch-day-n">${coinText(`0 из ${QUIZ_DAY} 🪙`)}</b></div></div>`;
  pair.append(set, rules);
  box.append(pair);
  paintDay();
}

export function mount(el) {
  let touched = false;
  for (const ev of ['pointerdown', 'keydown']) el.addEventListener(ev, () => { touched = true; }, true);   // звук — только после действия смотрящего
  const snd = (name) => { if (touched) sfx.play(name); };
  fence(el, snd);
  zatejnik(el, snd);
  quiz(el, snd);
}
