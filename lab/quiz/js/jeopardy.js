// «Своя игра» — живой макет на ките UI 2.0: игра глазами игрока, ведущего, зрителя и с Затейником; окно «Ракушка»
// перед игрой; финал и итоги. Только детали кита (k-*, mo-*); своя раскладка — классы с префиксом jp-.
// Боты и таймеры идут по «часам сцены»: стоят, пока сцену не видно, сбрасываются при смене вида и «Начать заново».
import {
  esc, h, keyHtml, capHtml, iconImg, coinHtml, meterHtml, setMeter, placeHtml, PLAYERS, jellySvg, makeStage, segButtons,
  sfx, rnd, pick, checkAnswer,
} from './common.js';

// ------------------------------------------------------------------ демо-пак «Набережная»: 6 тем × 5 цен

const PACK = {
  name: 'Набережная',
  themes: [
    { name: 'Рыбы', qs: [
      { p: 100, q: 'Её не продашь Деду Семёну: старая, резиновая и вечно мокрая', a: 'старый сапог/сапог', say: 'Старый сапог', wrong: ['Калоша', 'Шина'], c: 'Самый частый «улов» новичка.' },
      { p: 200, q: 'Рыбка ровно за 50 жетонов. Говорят, исполняет желания', a: 'золотая рыбка/золотая рыба', say: 'Золотая рыбка', wrong: ['Карась', 'Осётр'], c: 'Легендарная, цена всегда 50.' },
      { p: 300, q: 'Маленькая акула Чёрного моря, которая клюёт у нас на удочку', a: 'катран', say: 'Катран', wrong: ['Скат', 'Сарган'], c: 'Он же черноморская колючая акула.' },
      { p: 400, q: 'Рыба с птичьим именем: плавники как крылья, по дну ходит на «пальчиках»', a: 'морской петух/петух/тригла', say: 'Морской петух', wrong: ['Морской ёрш', 'Ласточка'], c: 'Принимается и «тригла».' },
      { p: 500, q: 'Кого Дед Семён покупает дороже всех — до 60 жетонов за штуку?', a: 'осётр/осетр/осетра', say: 'Осётр', wrong: ['Катран', 'Золотая рыбка'], c: 'Осётр — до 60, золотая рыбка — ровно 50.' },
    ] },
    { name: 'Набережная', qs: [
      { p: 100, q: 'Как зовут деда, который скупает рыбу на причале?', a: 'семён/дед семён/семен', say: 'Дед Семён', wrong: ['Дед Мазай', 'Капитан'], c: 'Он же даёт задания на удочки.' },
      { p: 200, q: 'Кто это?', img: 'img/zatejnik.png', a: 'затейник/массовик/массовик затейник', say: 'Затейник', wrong: ['Капитан', 'Пломбир'], c: 'Новый житель: ведёт игры на «Ракушке».' },
      { p: 300, q: 'Как называется кафе на набережной, где играют в дурака и блэкджек?', a: 'чайка', say: '«Чайка»', wrong: ['«Альбатрос»', '«Волна»'], c: 'Кофе там варит бариста Тоня.' },
      { p: 400, q: 'Что нужно зажечь в шторм, чтобы спасти набережную?', a: 'маяк/огонь маяка/свет маяка', say: 'Маяк', wrong: ['Фонари', 'Костёр'], c: 'Свет погас — бегом к двери маяка.' },
      { p: 500, q: 'Сколько метров в каланче из режима «Выше облаков»?', a: '185/сто восемьдесят пять', say: '185 метров', wrong: ['150', '200'], c: 'Засчитываем только 185.' },
    ] },
    { name: 'Море и лодки', qs: [
      { p: 100, q: 'Как зовут баркас, на котором Саня катает рыбаков?', a: 'альбатрос', say: '«Альбатрос»', wrong: ['«Удалая»', '«Чайка»'], c: 'Саня ходит на нём к острову.' },
      { p: 200, q: 'Гидроплан набережной назван в честь быстрой птицы. Какой?', a: 'стриж', say: '«Стриж»', wrong: ['«Ласточка»', '«Сокол»'], c: '' },
      { p: 300, cat: true, q: 'Лодка, которая не боится волн. Как её зовут?', a: 'удалая', say: '«Удалая»', wrong: ['«Отважная»', '«Смелая»'], c: 'Кот в мешке: отвечает тот, кому отдали.' },
      { p: 400, q: 'Супер-босс крепости с щупальцами — кто он?', a: 'кракен', say: 'Кракен', wrong: ['Осьминог', 'Спрут'], c: 'Приходит на 25-й, 50-й, 75-й волне.' },
      { p: 500, q: 'Узел — это одна морская миля за…', a: 'час/один час/1 час', say: 'Час', wrong: ['Минуту', 'Сутки'], c: '' },
    ] },
    { name: 'Кино', qs: [
      { p: 100, q: 'Кто живёт в ананасе на дне океана?', a: 'губка боб/спанч боб/спанчбоб/губка', say: 'Губка Боб', wrong: ['Немо', 'Патрик'], c: '' },
      { p: 200, q: 'Рыбку-клоуна искал папа Марлин. Как её звали?', a: 'немо', say: 'Немо', wrong: ['Дори'], c: '' },
      { p: 300, q: 'Капитан «Чёрной жемчужины», который вечно без рома', a: 'джек воробей/воробей/джек спарроу/спарроу', say: 'Джек Воробей', wrong: ['Барбосса', 'Капитан Крюк'], c: 'Принимается и «Спарроу».' },
      { p: 400, q: 'Как назывался остров, где Джим Хокинс искал клад?', a: 'остров сокровищ/сокровищ', say: 'Остров сокровищ', wrong: ['Остров Робинзона'], c: '' },
      { p: 500, q: 'Фильм Спилберга 1975 года, после которого боялись купаться', a: 'челюсти', say: '«Челюсти»', wrong: ['«Акулья бухта»', '«Бездна»'], c: '' },
    ] },
    { name: 'Еда', qs: [
      { p: 100, q: 'Мороженое, у которого есть тёзка-желейка на нашей набережной', a: 'пломбир', say: 'Пломбир', wrong: ['Эскимо'], c: '' },
      { p: 200, q: 'Красный суп со свёклой и сметаной', a: 'борщ', say: 'Борщ', wrong: ['Щи'], c: '' },
      { p: 300, q: 'Плоский жареный пирожок-полумесяц с мясом — главный перекус на пляже', a: 'чебурек', say: 'Чебурек', wrong: ['Беляш', 'Пирожок'], c: '' },
      { p: 400, q: 'Что бариста Тоня делает из эспрессо и молочной пенки?', a: 'капучино/латте', say: 'Капучино', wrong: ['Какао', 'Чай'], c: 'Латте тоже засчитываем.' },
      { p: 500, q: 'Как называется рыба на рисовом комочке по-японски?', a: 'суши/нигири', say: 'Суши', wrong: ['Плов', 'Рамен'], c: '' },
    ] },
    { name: 'Звери', qs: [
      { p: 100, q: 'Сколько щупалец у осьминога?', a: '8/восемь', say: 'Восемь', wrong: ['Десять', 'Шесть'], c: '' },
      { p: 200, q: 'Птица, которая ворует чебуреки на набережной', a: 'чайка', say: 'Чайка', wrong: ['Голубь', 'Воробей'], c: '' },
      { p: 300, q: 'Кто спит вниз головой, зацепившись лапками?', a: 'летучая мышь/летучие мыши', say: 'Летучая мышь', wrong: ['Ленивец'], c: '' },
      { p: 400, q: 'Самый быстрый зверь на суше', a: 'гепард', say: 'Гепард', wrong: ['Лев', 'Антилопа'], c: '' },
      { p: 500, q: 'Самое большое животное на Земле', a: 'синий кит/голубой кит/кит', say: 'Синий кит', wrong: ['Слон', 'Кашалот'], c: '' },
    ] },
  ],
};
const CELLS = PACK.themes.length * 5;
/** клетки, уже сыгранные к началу макета (середина раунда) */
const PREPLAYED = ['0-0', '1-0', '2-0', '3-0', '3-1', '4-0', '5-0', '5-1'];
const VIEWS = ['Игрок', 'Ведущий', 'Зритель', 'Ведёт Затейник'];

// ------------------------------------------------------------------ мелочи

let armed = false; // звук — только после действия смотрящего в разделе
const snd = (n) => { if (armed) sfx.play(n); };
const fmt = (n) => (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('ru-RU');
const P = (nick) => PLAYERS.find((p) => p.nick === nick);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Часы сцены: идут, только пока сцену видно; at(ms, fn) — по времени сцены, clear() снимает всё */
function makeClock(frame) {
  let t = 0;
  let last = performance.now();
  let vis = false;
  let ratio = 0;
  let gen = 0;
  let jobs = [];
  const tickers = [];
  new IntersectionObserver((es) => { for (const e of es) { vis = e.isIntersecting; ratio = e.intersectionRatio; } }, { threshold: [0, 0.2, 0.35, 0.6, 0.9] }).observe(frame);
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(1000, now - last);
    last = now;
    if (!vis || document.hidden) return;
    t += dt;
    const due = jobs.filter((j) => j.at <= t).sort((a, b) => a.at - b.at);
    if (due.length) jobs = jobs.filter((j) => j.at > t);
    for (const j of due) if (j.g === gen) j.fn();
    for (const f of tickers) f(t);
  }, 50);
  return {
    get t() { return t; },
    get vis() { return vis; },
    get ratio() { return ratio; },
    at(ms, fn) { jobs.push({ at: t + ms, fn, g: gen }); },
    clear() { gen++; jobs = []; },
    tick(fn) { tickers.push(fn); },
  };
}

/** Клавиша для этой сцены: сцена видна хотя бы на треть и фокус не в поле ввода */
function onKeys(clk, fn) {
  document.addEventListener('keydown', (e) => {
    if (!clk.vis || clk.ratio < 0.3 || e.metaKey || e.ctrlKey || e.altKey) return;
    const tg = e.target;
    if (tg instanceof HTMLInputElement || tg instanceof HTMLTextAreaElement || tg?.isContentEditable) return;
    if (fn(e)) { e.preventDefault(); armed = true; }
  });
}

function confetti(box) {
  if (still()) return;
  const tones = ['--gold', '--good', '--bad', '--info', '--special', '--mode', '--gold-hi'];
  for (let k = 0; k < 44; k++) {
    const i = document.createElement('i');
    i.className = 'jp-conf';
    i.style.background = `var(${pick(tones)})`;
    i.style.left = `${rnd(6, 94)}%`;
    box.append(i);
    const a = i.animate([
      { transform: 'translate(0, -24px) rotate(0deg)', opacity: 1 },
      { transform: `translate(${rnd(-90, 90)}px, ${rnd(360, 520)}px) rotate(${rnd(-600, 600)}deg)`, opacity: 0 },
    ], { duration: rnd(1100, 1900), easing: 'cubic-bezier(.2,.6,.4,1)', delay: rnd(0, 220), fill: 'both' });
    a.onfinish = () => i.remove();
  }
}

/** Плашка события сверху по центру (как TopCenter.event): иконка, заголовок, строка, таймер, полоса */
function makeEvent(slot) {
  const el = h('div', 'k-event');
  el.setAttribute('role', 'status');
  el.hidden = true;
  slot.append(el);
  let spec = null;
  return {
    el,
    set(s) {
      spec = s;
      if (!s) { el.hidden = true; return; }
      const fresh = el.hidden;
      el.hidden = false;
      el.className = `k-event${s.tone ? ` k-event--${s.tone}` : ''}`;
      el.innerHTML = `<span class="k-event-ic">${iconImg(s.ic ?? 'bell', '')}</span><div class="k-event-title">${esc(s.title)}</div>`
        + `<div class="k-event-sub">${esc(s.sub ?? '')}</div>${s.timer ? `<div class="k-event-timer"></div>${meterHtml(1, s.tone === 'danger' ? 'bad' : 'mode', 'k-meter--thin')}` : ''}`;
      if (fresh && !still()) el.animate([{ opacity: 0, transform: 'translateY(-10px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
    },
    /** таймер: left — сколько осталось, len — всего (мс) */
    time(left, len) {
      if (!spec?.timer) return;
      const tm = el.querySelector('.k-event-timer');
      const m = el.querySelector('.k-meter');
      if (tm) {
        const txt = mmss(left);
        if (tm.textContent !== txt) tm.textContent = txt;
        tm.classList.toggle('is-hurry', left <= 3000);
      }
      if (m) setMeter(m, len > 0 ? left / len : 0);
    },
  };
}

const badgeHtml = () => `<div class="k-badge"><span class="k-ring" style="--p:.64"><b>12</b></span><span class="k-badge-tokens">${coinHtml()}1 250</span></div>`;
const chatHtml = () => `<div class="k-chat-bar"><span class="k-voice jp-voice">${iconImg('voice', '')}<kbd class="k-key k-key--sm">V</kbd></span><div class="k-chat-closed">${keyHtml('Enter')}Написать в чат</div></div>`;
const roleHtml = (ic, title, sub) => `<div class="k-plate mo-role"><span class="mo-role-ic">${iconImg(ic, '')}</span><span><b>${esc(title)}</b><small>${esc(sub)}</small></span></div>`;

/** Полоса счёта: желейка, ник, счёт; ход — золотая рамка и «ход», своё — золотом */
function seatsHtml(players) {
  return players.map((p, i) => `<div class="k-plate jp-seat${p.me ? ' is-own' : ''}" data-i="${i}">`
    + `<span class="k-pill k-pill--solid k-pill--xs jp-seat-turn">ход</span>`
    + `<span class="jp-seat-jelly">${jellySvg(p.color, 40, { hat: p.hat })}</span>`
    + `<span class="jp-seat-t"><b class="jp-seat-nick">${esc(p.me ? `${p.nick}` : p.nick)}</b><span class="jp-seat-score"></span></span></div>`).join('');
}
function seatEl(strip, i) { return strip.querySelector(`.jp-seat[data-i="${i}"]`); }
function popAt(strip, i, text, bad) {
  const s = seatEl(strip, i);
  if (!s) return;
  const p = h('span', `k-pop jp-pop${bad ? ' k-pop--bad' : ''}`, esc(text));
  s.append(p);
  setTimeout(() => p.remove(), 1700);
}
function sayAt(strip, i, text, typed) {
  const s = seatEl(strip, i);
  if (!s) return;
  s.querySelector('.jp-say')?.remove();
  const b = h('div', `k-plate jp-say${typed ? ' is-typed' : ''}`, `${typed ? '' : iconImg('voice', 'jp-say-ic')}<span>${esc(text)}</span>`);
  s.append(b);
}
function flash(strip, i, cls, ms = 1400) {
  const s = seatEl(strip, i);
  if (!s) return;
  s.classList.remove(cls);
  void s.offsetWidth;
  s.classList.add(cls);
  setTimeout(() => s.classList.remove(cls), ms);
}

// ================================================================== 1. «Игра»

function gameStage(root) {
  const st = makeStage(root, {
    title: 'Игра на «Ракушке»',
    note: 'Табло — твой «стол», пока ты за пультом. Кнопки открываются, когда вопрос прочитан; первым считается тот, кто нажал раньше <b>с поправкой на пинг</b> — сервер вычитает половину задержки и ждёт 150 мс после первого нажатия.',
    bg: 'img/venue-shell.jpg',
  });
  st.bg.style.setProperty('--qz-shade', 'linear-gradient(180deg, rgba(6, 34, 31, .5), rgba(6, 34, 31, .66))');
  const clk = makeClock(st.frame);

  st.hud.classList.add('jp-hud');
  st.hud.innerHTML = `
    <div class="k-slot k-slot--tl jp-tl"></div>
    <div class="k-slot k-slot--tc jp-tc"></div>
    <div class="k-slot k-slot--tr">${badgeHtml()}</div>
    <div class="k-slot k-slot--bl">${chatHtml()}</div>
    <div class="jp-board">
      <span class="k-pill k-pill--solid k-pill--sm jp-board-cap">Раунд 1 · пак «${esc(PACK.name)}»</span>
      <div class="jp-grid"></div>
      <div class="jp-card" hidden>
        <div class="jp-card-head"><span class="jp-card-theme"></span><span class="jp-card-price"></span></div>
        <div class="jp-card-body"><img class="jp-card-img" alt="" hidden><p class="jp-card-q"></p></div>
        <div class="jp-card-ans" hidden></div>
        <div class="jp-card-foot"></div>
        <div class="jp-stamp" hidden></div>
      </div>
      <div class="jp-confetti"></div>
    </div>
    <div class="k-slot k-slot--bc jp-bc"><button type="button" class="k-prompt jp-buzz" hidden></button><div class="jp-strip"></div></div>
    <div class="k-slot k-slot--br jp-br"></div>`;
  const $ = (s) => st.hud.querySelector(s);
  const tl = $('.jp-tl');
  const ev = makeEvent($('.jp-tc'));
  const board = $('.jp-board');
  const grid = $('.jp-grid');
  const card = $('.jp-card');
  const cTheme = $('.jp-card-theme');
  const cPrice = $('.jp-card-price');
  const cImg = $('.jp-card-img');
  const cQ = $('.jp-card-q');
  const cAns = $('.jp-card-ans');
  const cFoot = $('.jp-card-foot');
  const cStamp = $('.jp-stamp');
  const conf = $('.jp-confetti');
  const buzzEl = $('.jp-buzz');
  const strip = $('.jp-strip');
  const br = $('.jp-br');

  grid.innerHTML = PACK.themes.map((th, r) => `<div class="jp-theme"><span>${esc(th.name)}</span></div>`
    + th.qs.map((q, c) => `<button type="button" class="jp-cell" data-r="${r}" data-c="${c}"><span>${q.p}</span></button>`).join('')).join('');

  const G = {
    view: 0, players: [], host: 'Барон', played: new Set(), turn: 0, phase: 'idle', ph: 0, q: null, theme: '', r: -1, c: -1,
    out: new Set(), buzzes: [], answerer: -1, said: '', end: 0, len: 0, onEnd: null, start: 0, readLen: 0, block: 0, cat: false,
    chooser: -1, votes: null,
  };
  const meIdx = () => G.players.findIndex((p) => p.me);
  const isMe = (i) => !!G.players[i]?.me;
  const plays = () => G.view === 0 || G.view === 3;
  const nick = (i) => G.players[i]?.nick ?? '';
  const hostName = () => (G.view === 1 ? 'Ты' : G.view === 3 ? 'Затейник' : G.host);

  function setPhase(name) { G.phase = name; G.ph++; G.onEnd = null; }
  function timer(ms, fn) { G.end = clk.t + ms; G.len = ms; G.onEnd = fn; }
  function later(ms, fn) { const ph = G.ph; clk.at(ms, () => { if (G.ph === ph) fn(); }); }

  // ---------------------------------------------------------------- отрисовка
  function updCells() {
    const mine = G.phase === 'pick' && isMe(G.turn);
    board.classList.toggle('is-pick', mine);
    grid.querySelectorAll('.jp-cell').forEach((b) => {
      const played = G.played.has(`${b.dataset.r}-${b.dataset.c}`);
      b.classList.toggle('is-played', played);
      b.disabled = played || !mine;
    });
  }
  function updSeats() {
    const inQ = !['pick', 'idle', 'end'].includes(G.phase);
    strip.querySelectorAll('.jp-seat').forEach((s) => {
      const i = Number(s.dataset.i);
      const p = G.players[i];
      s.classList.toggle('is-turn', (G.phase === 'pick' && G.turn === i) || (G.phase === 'cat' && G.chooser === i));
      s.classList.toggle('is-out', inQ && G.out.has(i) && G.answerer !== i);
      const sc = s.querySelector('.jp-seat-score');
      sc.textContent = fmt(p.score);
      sc.classList.toggle('is-neg', p.score < 0);
    });
  }
  function clearSays() { strip.querySelectorAll('.jp-say').forEach((b) => b.remove()); strip.querySelectorAll('.is-lamp').forEach((s) => s.classList.remove('is-lamp')); }
  function lamp(i) { strip.querySelectorAll('.is-lamp').forEach((s) => s.classList.remove('is-lamp')); seatEl(strip, i)?.classList.add('is-lamp'); }

  function buzzUI() {
    const i = meIdx();
    const show = plays() && i >= 0 && ['read', 'open'].includes(G.phase) && !G.cat;
    buzzEl.hidden = !show;
    if (!show) return;
    const out = G.out.has(i);
    const blocked = clk.t < G.block;
    let cls = 'k-prompt jp-buzz';
    let html;
    if (out) { cls += ' k-prompt--off'; html = '<span class="k-prompt-note">Ты уже отвечал — ждём остальных</span>'; }
    else if (blocked) { cls += ' k-prompt--off is-early'; html = `${keyHtml('Пробел', '', 'lg')}<b>Рано!</b><span class="k-prompt-note">кнопка ждёт 1 с</span>`; }
    else if (G.phase === 'read') { cls += ' k-prompt--off'; html = `${keyHtml('Пробел', '', 'lg')}Ответить<span class="k-prompt-sep"></span><span class="k-prompt-note">откроется, когда прочитают</span>`; }
    else { cls += ' k-prompt--urgent'; html = `${keyHtml('Пробел', '', 'lg')}Ответить!<span class="k-prompt-sep"></span>${capHtml('ЛКМ', 'k-key--lg')}`; }
    if (buzzEl.className !== cls) buzzEl.className = cls;
    if (buzzEl.innerHTML !== html) buzzEl.innerHTML = html;
  }

  // ---------------------------------------------------------------- панели справа внизу
  function brPanel() {
    if (G.view === 1) {
      br.innerHTML = `<div class="k-plate jp-host">
        <div class="jp-host-ans"><span class="jp-host-cap">Верный ответ — видишь только ты</span><b class="jp-host-say">—</b><span class="jp-host-c"></span></div>
        <div class="jp-host-said" hidden><span class="jp-host-cap"></span><b></b></div>
        <div class="jp-host-btns">
          <button type="button" class="k-btn k-btn--sm k-btn--go" data-h="right">✓ Верно${keyHtml('1', 'tr', 'sm')}</button>
          <button type="button" class="k-btn k-btn--sm k-btn--stop" data-h="wrong">✗ Неверно${keyHtml('2', 'tr', 'sm')}</button>
          <button type="button" class="k-btn k-btn--sm k-btn--info jp-wide" data-h="open">Открыть кнопки${keyHtml('Пробел', 'tr', 'sm')}</button>
          <button type="button" class="k-btn k-btn--sm k-btn--ghost" data-h="reveal">Показать ответ${keyHtml('R', 'tr', 'sm')}</button>
          <button type="button" class="k-btn k-btn--sm k-btn--ghost" data-h="plus">+5 с</button>
        </div></div>`;
    } else if (G.view === 2) {
      br.innerHTML = `<div class="k-plate jp-react">${iconImg('emote', 'k-ic')}<span class="jp-react-cap">Реакции</span>
        ${['Браво!', 'Ха-ха', 'Ого!', 'Эх…'].map((t, i) => `<button type="button" class="k-btn k-btn--sm k-btn--ghost" data-react="${i}">${esc(t)}${keyHtml(String(i + 1), 'tr', 'sm')}</button>`).join('')}</div>`;
    } else if (G.view === 3) {
      br.innerHTML = `<div class="jp-zat"><div class="k-plate jp-zat-say"><p class="k-eyebrow">Затейник</p><p class="jp-zat-line">Заходи, сыграем!</p></div><span class="jp-zat-face"><img src="img/zatejnik.png" alt="Затейник"></span></div>`;
    } else br.innerHTML = '';
  }
  function zsay(text) {
    if (G.view !== 3) return;
    const l = br.querySelector('.jp-zat-line');
    if (!l || l.textContent === text) return;
    l.textContent = text;
    if (!still()) br.querySelector('.jp-zat-say')?.animate([{ transform: 'scale(.94)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'ease-out' });
    if (!still()) br.querySelector('.jp-zat-face')?.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-8px)' }, { transform: 'translateY(0)' }], { duration: 360, easing: 'ease-out' });
  }
  function updHost() {
    if (G.view !== 1) return;
    const q = G.q;
    const hp = br.querySelector('.jp-host');
    hp.querySelector('.jp-host-say').textContent = q ? q.say : 'Ждём выбор вопроса';
    hp.querySelector('.jp-host-say').classList.toggle('is-idle', !q);
    hp.querySelector('.jp-host-c').textContent = q?.c ?? '';
    const said = hp.querySelector('.jp-host-said');
    said.hidden = !(G.said && ['judge', 'verdict'].includes(G.phase));
    if (!said.hidden) {
      said.querySelector('.jp-host-cap').textContent = `${nick(G.answerer)}, вслух:`;
      said.querySelector('b').textContent = `«${G.said}»`;
    }
    const on = {
      right: G.phase === 'judge', wrong: G.phase === 'judge', open: G.phase === 'read',
      reveal: ['read', 'open', 'answer', 'judge'].includes(G.phase), plus: G.phase === 'answer',
    };
    hp.querySelectorAll('[data-h]').forEach((b) => { b.disabled = !on[b.dataset.h]; b.classList.toggle('is-ready', !!on[b.dataset.h] && ['right', 'wrong', 'open'].includes(b.dataset.h)); });
  }
  function roleUpdate() {
    tl.innerHTML = [
      roleHtml('bell', 'Ты за пультом 1', 'ведёт Барон за трибуной'),
      roleHtml('voice', 'Ты ведёшь', 'игроки видят табло, ответ — только ты'),
      roleHtml('online', 'Ты смотришь со скамейки', 'играть — встань за свободный пульт'),
      roleHtml('straw-hat', 'Ты за пультом 1', 'ведёт Затейник: ответ — текстом'),
    ][G.view];
  }

  // ---------------------------------------------------------------- карточка вопроса
  function cellOf(r, c) { return grid.querySelector(`.jp-cell[data-r="${r}"][data-c="${c}"]`); }
  function showCard(r, c, cat) {
    const q = PACK.themes[r].qs[c];
    cTheme.textContent = cat ? 'Кот в мешке' : PACK.themes[r].name;
    cPrice.textContent = String(q.p);
    card.classList.toggle('is-cat', !!cat);
    cImg.hidden = true;
    cQ.textContent = cat ? 'Кот в мешке' : q.q;
    cQ.classList.toggle('is-big', !!cat);
    cAns.hidden = true;
    cStamp.hidden = true;
    cFoot.innerHTML = '';
    card.hidden = false;
    if (!cat && q.img) { cImg.src = q.img; cImg.hidden = false; cImg.classList.add('is-sil'); }
    const cell = cellOf(r, c);
    const kr = card.getBoundingClientRect();
    const cr = cell?.getBoundingClientRect();
    if (still() || !cr || !kr.width) return;
    const k = kr.width / card.offsetWidth;
    const dx = (cr.left - kr.left) / k;
    const dy = (cr.top - kr.top) / k;
    card.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${cr.width / kr.width}, ${cr.height / kr.height})`, opacity: 0.7 },
      { transform: 'none', opacity: 1 },
    ], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
  }
  function cardQuestion() {
    const q = G.q;
    cTheme.textContent = G.theme;
    card.classList.remove('is-cat');
    cQ.classList.remove('is-big');
    cQ.textContent = q.q;
    if (q.img) { cImg.src = q.img; cImg.hidden = false; cImg.classList.add('is-sil'); }
  }
  function hideCard() {
    if (card.hidden) return;
    if (still()) { card.hidden = true; return; }
    card.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }], { duration: 200, easing: 'ease-in' }).finished.then(() => { if (G.phase === 'pick' || G.phase === 'idle') card.hidden = true; });
  }
  function foot(html) { cFoot.innerHTML = html; }
  function footRead(cap = 'Кнопки откроются') { foot(`<div class="jp-read"><span class="jp-read-cap">${esc(cap)}</span>${meterHtml(0, 'mode', 'k-meter--lg jp-read-m')}</div>`); }
  function stamp(ok, text) {
    cStamp.hidden = false;
    cStamp.className = `jp-stamp ${ok ? 'is-ok' : 'is-no'}`;
    cStamp.innerHTML = `<b>${ok ? '✓' : '✗'}</b><span>${esc(text)}</span>`;
    if (!still()) cStamp.animate([{ transform: 'rotate(-8deg) scale(1.6)', opacity: 0 }, { transform: 'rotate(-8deg) scale(1)', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.2,1.6,.4,1)' });
  }
  function reveal(prefix) {
    cAns.hidden = false;
    cAns.innerHTML = `<b>${esc(prefix)} ${esc(G.q.say)}</b>${G.q.c ? `<span>${esc(G.q.c)}</span>` : ''}`;
    cImg.classList.remove('is-sil');
  }

  // ---------------------------------------------------------------- ход игры
  function reset(view) {
    clk.clear();
    G.view = view;
    setPhase('idle');
    const nicks = plays() ? ['Кракозябра', 'Оля', 'Санёк', 'ОченьДлинныйНик'] : ['Оля', 'Санёк', 'Тёма', 'ОченьДлинныйНик'];
    const scores = [700, 1200, -200, 300];
    G.players = nicks.map((n, i) => ({ ...P(n), score: scores[i], me: plays() && n === 'Кракозябра' }));
    G.played = new Set(PREPLAYED);
    G.turn = plays() ? 0 : 0;
    G.out = new Set();
    G.q = null;
    G.cat = false;
    G.said = '';
    G.block = 0;
    G.answerer = -1;
    card.hidden = true;
    conf.innerHTML = '';
    strip.innerHTML = seatsHtml(G.players);
    roleUpdate();
    brPanel();
    startPick();
  }

  function startPick() {
    setPhase('pick');
    G.q = null;
    G.cat = false;
    G.out = new Set();
    G.said = '';
    G.answerer = -1;
    clearSays();
    hideCard();
    updCells();
    updSeats();
    buzzUI();
    updHost();
    if (G.played.size >= CELLS) { roundEnd(); return; }
    const p = G.players[G.turn];
    if (p.me) {
      ev.set({ ic: 'bell', title: 'Твой ход — выбери вопрос', sub: 'клик по клетке табло', timer: true });
      zsay('Кракозябра, выбирай тему и цену!');
    } else {
      ev.set({ ic: 'bell', title: `Выбирает ${p.nick}`, sub: 'тема и цена — на табло', timer: true });
      zsay(`${p.nick} выбирает…`);
      later(rnd(1800, 3200), () => pickCell(...freeCell()));
    }
    timer(15000, () => pickCell(...freeCell()));
  }
  function freeCell() {
    const free = [];
    for (let r = 0; r < PACK.themes.length; r++) for (let c = 0; c < 5; c++) if (!G.played.has(`${r}-${c}`)) free.push([r, c]);
    return pick(free);
  }

  function pickCell(r, c) {
    if (G.phase !== 'pick' || G.played.has(`${r}-${c}`)) return;
    G.played.add(`${r}-${c}`);
    G.r = r;
    G.c = c;
    G.q = PACK.themes[r].qs[c];
    G.theme = PACK.themes[r].name;
    snd('pop');
    setPhase('show');
    updCells();
    if (G.q.cat) { catPhase(); return; }
    showCard(r, c, false);
    readPhase();
  }

  function readPhase() {
    setPhase('read');
    const len = clamp(1500 + 50 * G.q.q.length, 2000, 8000);
    G.start = clk.t;
    G.readLen = len;
    footRead();
    ev.set({ ic: 'scroll', title: `${G.theme} · ${G.q.p}`, sub: G.view === 1 ? 'читай вопрос вслух — или открой кнопки' : `${hostName()} читает вопрос` });
    timer(len, () => openButtons(8000));
    zsay('Внимание, вопрос!');
    buzzUI();
    updSeats();
    updHost();
  }

  function openButtons(ms) {
    setPhase('open');
    G.buzzes = [];
    G.said = '';
    cStamp.hidden = true;
    foot(`<div class="jp-read is-open"><span class="jp-read-cap">${G.out.size ? 'Кнопки снова открыты' : 'Кнопки открыты — жми!'}</span>${meterHtml(1, 'good', 'k-meter--lg jp-read-m')}</div>`);
    const again = G.out.size > 0;
    ev.set({ ic: 'stopwatch', title: again ? 'Мимо! Остальные — жмите' : 'Кнопки открыты!', sub: 'кто первый — тот отвечает', timer: true, tone: again ? 'danger' : undefined });
    snd('open');
    timer(ms, nobody);
    G.players.forEach((p, i) => {
      if (p.me || G.out.has(i)) return;
      if (Math.random() < (again ? 0.55 : 0.82)) later(rnd(400, 1600), () => buzz(i));
    });
    buzzUI();
    updSeats();
    updHost();
  }

  function buzz(i) {
    if (isMe(i) && G.phase === 'read' && !G.cat) {
      G.block = clk.t + 1000;
      snd('cold');
      flash(strip, i, 'is-early', 700);
      buzzUI();
      clk.at(1020, buzzUI);
      return;
    }
    if (G.phase !== 'open' || G.out.has(i) || G.buzzes.some((b) => b.i === i)) return;
    if (isMe(i) && clk.t < G.block) return;
    G.buzzes.push({ i, t: clk.t });
    if (G.buzzes.length === 1) later(150, () => answerPhase(G.buzzes.reduce((a, b) => (b.t < a.t ? b : a)).i));
  }

  function answerPhase(i) {
    setPhase('answer');
    G.answerer = i;
    G.said = '';
    G.lastTick = 0;
    lamp(i);
    snd('buzz');
    const p = G.players[i];
    const sec = G.view === 3 ? 15000 : 10000;
    if (p.me) {
      ev.set({ ic: 'voice', title: 'Отвечаешь ты!', sub: G.view === 3 ? 'напиши — Затейник сверит с паком' : 'скажи вслух или напиши', timer: true });
      foot(`<form class="jp-ans"><input class="k-input jp-ans-in" maxlength="40" placeholder="Твой ответ" autocomplete="off" aria-label="Твой ответ">`
        + `<button type="submit" class="k-btn k-btn--go">Ответить${keyHtml('Enter', 'tr', 'sm')}</button></form>`
        + `<p class="jp-hint">${G.view === 3 ? 'Затейник принимает ответ только текстом' : `Можно и голосом — ${esc(G.host)} слышит`}</p>`);
      const inp = cFoot.querySelector('input');
      cFoot.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); armed = true; submit(inp.value.trim()); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Escape') inp.blur(); });
      setTimeout(() => inp.focus({ preventScroll: true }), 30);
      timer(sec, () => submit(inp.value.trim()));
    } else {
      ev.set({ ic: 'voice', title: `Отвечает ${p.nick}`, sub: G.view === 3 ? 'пишет ответ' : 'говорит вслух', timer: true });
      foot(`<p class="jp-wait">${esc(p.nick)} думает<span class="jp-dots"><i></i><i></i><i></i></span></p>`);
      later(rnd(1300, 3000), () => botSay(i));
      timer(sec, () => judge(i, ''));
    }
    zsay(p.me ? 'Кракозябра жмёт первым! Пиши ответ.' : `${p.nick} жмёт первым!`);
    buzzUI();
    updSeats();
    updHost();
  }

  function botAnswer() {
    const q = G.q;
    const p = q.p <= 100 ? 0.8 : q.p <= 300 ? 0.6 : 0.42;
    if (Math.random() < p) return q.say.replace(/[«»]/g, '');
    return pick(q.wrong).replace(/[«»]/g, '');
  }
  function botSay(i) {
    const text = botAnswer();
    G.said = text;
    sayAt(strip, i, text, G.view === 3);
    snd('pop');
    judge(i, text);
  }
  function submit(text) {
    if (G.phase !== 'answer') return;
    const i = meIdx();
    G.said = text;
    sayAt(strip, i, text || '…', true);
    judge(i, text);
  }

  function judge(i, text) {
    setPhase('judge');
    G.said = text;
    const p = G.players[i];
    foot('');
    const res = text ? checkAnswer(text, G.q.a) : 'no';
    if (G.view === 1) {
      ev.set({ ic: 'voice', title: 'Верно или нет? Решай', sub: '1 — верно · 2 — неверно' });
      snd('tick');
      updHost();
      return;
    }
    if (G.view === 3) {
      ev.set({ ic: 'straw-hat', title: 'Затейник сверяет…', sub: `ответ: «${text || 'пусто'}»` });
      later(700, () => {
        if (res === 'yes') verdict(i, true);
        else if (p.me && text) contest(i, text, res);
        else verdict(i, false);
      });
      return;
    }
    ev.set({ ic: 'voice', title: `${G.host} решает…`, sub: `ответ: «${text || 'молчание'}»` });
    later(1200, () => verdict(i, res !== 'no'));
    updHost();
  }

  function verdict(i, ok) {
    setPhase('verdict');
    const p = G.players[i];
    const price = G.q.p;
    G.answerer = i;
    if (ok) {
      p.score += price;
      popAt(strip, i, `+${price}`);
      snd('right');
      confetti(conf);
      stamp(true, 'Верно!');
      reveal('Ответ:');
      G.turn = i;
      ev.set({ ic: 'medal-gold', title: `Верно! ${p.nick} +${price}`, sub: 'выбирает следующий вопрос', tone: 'good' });
      zsay(p.me ? 'Браво! Твой ход!' : `Верно, ${p.nick}! +${price}`);
      later(2800, startPick);
    } else {
      p.score -= price;
      popAt(strip, i, `−${price}`, true);
      snd('wrong');
      flash(strip, i, 'is-wrong');
      G.out.add(i);
      stamp(false, G.said ? 'Мимо' : 'Время вышло');
      const left = !G.cat && G.players.some((_, j) => !G.out.has(j));
      ev.set({ ic: 'warn', title: `Мимо! ${p.nick} −${price}`, sub: left ? 'остальные могут нажать' : 'больше никто не отвечает', tone: 'danger' });
      zsay(p.me ? 'Эх, не то!' : `Мимо, ${p.nick}!`);
      if (left) later(1500, () => { clearSays(); openButtons(5000); });
      else later(1300, () => nobody());
    }
    updSeats();
    updHost();
  }

  function nobody(byHost) {
    setPhase('nobody');
    foot('');
    cStamp.hidden = true;
    reveal(byHost ? 'Ответ:' : 'Никто не знает: это');
    ev.set({ ic: 'scroll', title: byHost ? 'Ведущий открыл ответ' : 'Никто не знает', sub: `это — ${G.q.say.replace(/[«»]/g, '')}` });
    zsay(`Никто? Это был ${G.q.say}!`);
    snd('cold');
    updSeats();
    updHost();
    later(3000, startPick);
  }

  // «Кот в мешке»: выбравший отдаёт вопрос другому, отвечает только он
  function catPhase() {
    setPhase('cat');
    G.cat = true;
    G.chooser = G.turn;
    showCard(G.r, G.c, true);
    snd('warm');
    const ch = G.chooser;
    const others = G.players.map((_, j) => j).filter((j) => j !== ch);
    if (isMe(ch)) {
      foot(`<p class="jp-wait">Отдай вопрос другому игроку — ответит только он</p><div class="jp-give">${others.map((j) => `<button type="button" class="k-btn k-btn--sm k-btn--ghost" data-give="${j}">${jellySvg(G.players[j].color, 26, { hat: G.players[j].hat })}<span>${esc(nick(j))}</span></button>`).join('')}</div>`);
      ev.set({ ic: 'gift', title: 'Кот в мешке!', sub: 'отдай вопрос другому игроку', timer: true });
      zsay('Кот в мешке! Кому отдашь?');
      timer(10000, () => give(pick(others)));
    } else {
      foot(`<p class="jp-wait">${esc(nick(ch))} решает, кому отдать<span class="jp-dots"><i></i><i></i><i></i></span></p>`);
      ev.set({ ic: 'gift', title: 'Кот в мешке!', sub: `${nick(ch)} отдаёт вопрос другому` });
      zsay('Кот в мешке! Сейчас узнаем, кому достанется.');
      const mine = meIdx();
      later(2400, () => give(mine >= 0 && mine !== ch && Math.random() < 0.65 ? mine : pick(others)));
    }
    updSeats();
  }
  function give(j) {
    if (G.phase !== 'cat') return;
    setPhase('catread');
    G.answerer = j;
    G.out = new Set(G.players.map((_, k) => k).filter((k) => k !== j));
    snd('pop');
    cardQuestion();
    footRead(`Отвечает ${isMe(j) ? 'ты' : nick(j)} — тема «${G.theme}»`);
    G.start = clk.t;
    G.readLen = clamp(1500 + 50 * G.q.q.length, 2000, 8000);
    ev.set({ ic: 'gift', title: `Кот в мешке — ${isMe(j) ? 'тебе' : nick(j)}`, sub: `тема «${G.theme}» · ${G.q.p}` });
    lamp(j);
    later(G.readLen, () => answerPhase(j));
    updSeats();
  }

  // Затейник не засчитал — отвечавший может оспорить, остальные голосуют 6 с
  function contest(i, text, res) {
    setPhase('contest');
    stamp(false, res === 'close' ? 'Почти…' : 'Не засчитано');
    foot(`<p class="jp-wait">Затейник: «${res === 'close' ? 'Почти, но не засчитываю' : 'Не то'}». Не согласен?</p>`
      + `<div class="jp-give"><button type="button" class="k-btn k-btn--special" data-act="dispute">Оспорить</button><button type="button" class="k-btn k-btn--ghost" data-act="agree">Согласен</button></div>`);
    ev.set({ ic: 'straw-hat', title: 'Не засчитано', sub: 'можно оспорить — решат игроки', timer: true, tone: 'danger' });
    zsay(res === 'close' ? 'Хм, почти… Не засчитываю!' : 'Увы, не то!');
    snd('cold');
    G.votes = { i, text, res };
    timer(6000, () => verdict(i, false));
  }
  function dispute() {
    if (G.phase !== 'contest') return;
    const { i, text, res } = G.votes;
    setPhase('vote');
    cStamp.hidden = true;
    const voters = G.players.map((_, j) => j).filter((j) => j !== i);
    const tally = { yes: 0, no: 0 };
    const draw = () => foot(`<div class="jp-vote"><span class="jp-vote-q">Засчитать «${esc(text)}»?</span>`
      + `<span class="k-pill k-pill--good">За <b>${tally.yes}</b></span><span class="k-pill k-pill--bad">Против <b>${tally.no}</b></span></div>`
      + `<div class="jp-voters">${voters.map((j) => `<span class="jp-voter" data-v="${j}">${jellySvg(G.players[j].color, 28, { hat: G.players[j].hat })}<span>${esc(nick(j))}</span><em>думает…</em></span>`).join('')}</div>`);
    draw();
    ev.set({ ic: 'online', title: 'Игроки голосуют', sub: `засчитать ответ «${text}»?`, timer: true, tone: 'special' });
    zsay('Спорим? Пусть решат остальные!');
    snd('open');
    const marks = {};
    const finish = () => {
      const ok = tally.yes > tally.no;
      zsay(ok ? 'Народ решил — засчитано!' : 'Народ решил — не засчитано.');
      verdict(i, ok);
    };
    voters.forEach((j) => later(rnd(800, 4600), () => {
      const yes = Math.random() < (res === 'close' ? 0.8 : 0.35);
      tally[yes ? 'yes' : 'no']++;
      marks[j] = yes;
      draw();
      for (const [k, v] of Object.entries(marks)) {
        const em = cFoot.querySelector(`.jp-voter[data-v="${k}"] em`);
        if (em) { em.textContent = v ? 'за' : 'против'; em.className = v ? 'k-good' : 'k-bad'; }
      }
      snd('tick');
      if (tally.yes + tally.no === voters.length) later(600, finish);
    }));
    timer(6000, finish);
  }

  function roundEnd() {
    setPhase('end');
    const lead = [...G.players].sort((a, b) => b.score - a.score)[0];
    card.hidden = false;
    card.classList.remove('is-cat');
    cTheme.textContent = 'Раунд 1';
    cPrice.textContent = '';
    cImg.hidden = true;
    cAns.hidden = true;
    cStamp.hidden = true;
    cQ.textContent = 'Раунд сыгран!';
    cQ.classList.add('is-big');
    foot(`<p class="jp-wait">Дальше — раунд 2 (цены ×2), потом финал</p><div class="jp-give"><button type="button" class="k-btn" data-act="again">Сыграть заново</button></div>`);
    ev.set({ ic: 'medal-gold', title: 'Раунд сыгран!', sub: `впереди ${lead.nick} — ${fmt(lead.score)}`, tone: 'good' });
    snd('fanfare');
    updSeats();
  }

  // ---------------------------------------------------------------- ввод
  function host(act) {
    if (G.view !== 1) return false;
    if (act === 'open' && G.phase === 'read') { openButtons(8000); return true; }
    if ((act === 'right' || act === 'wrong') && G.phase === 'judge') { verdict(G.answerer, act === 'right'); return true; }
    if (act === 'reveal' && ['read', 'open', 'answer', 'judge'].includes(G.phase)) { nobody(true); return true; }
    if (act === 'plus' && G.phase === 'answer') {
      G.end += 5000;
      G.len += 5000;
      snd('click');
      popAt(strip, G.answerer, '+5 с');
      return true;
    }
    return false;
  }
  function react(n) {
    if (G.view !== 2) return false;
    const t = ['Браво!', 'Ха-ха', 'Ого!', 'Эх…'][n];
    const r = h('div', 'k-pill k-pill--plate jp-float', esc(t));
    r.style.right = `${rnd(40, 240)}px`;
    st.hud.append(r);
    snd(n === 3 ? 'cold' : 'pop');
    if (still()) setTimeout(() => r.remove(), 1200);
    else r.animate([{ transform: 'translateY(0) scale(.8)', opacity: 0 }, { transform: 'translateY(-30px) scale(1.05)', opacity: 1, offset: 0.2 }, { transform: 'translateY(-170px)', opacity: 0 }], { duration: 1800, easing: 'ease-out' }).onfinish = () => r.remove();
    return true;
  }

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.jp-cell');
    if (!b || b.disabled || !isMe(G.turn)) return;
    pickCell(Number(b.dataset.r), Number(b.dataset.c));
  });
  card.addEventListener('click', (e) => {
    const g = e.target.closest('[data-give]');
    if (g && G.phase === 'cat' && isMe(G.chooser)) { give(Number(g.dataset.give)); return; }
    const a = e.target.closest('[data-act]');
    if (a?.dataset.act === 'dispute') { dispute(); return; }
    if (a?.dataset.act === 'agree' && G.phase === 'contest') { verdict(G.votes.i, false); return; }
    if (a?.dataset.act === 'again') { reset(G.view); return; }
    // по всей карточке можно кликнуть, чтобы нажать кнопку
    if (plays() && ['read', 'open'].includes(G.phase) && !e.target.closest('form, button')) buzz(meIdx());
  });
  buzzEl.addEventListener('click', () => buzz(meIdx()));
  br.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.h) host(b.dataset.h);
    if (b.dataset.react) react(Number(b.dataset.react));
  });
  onKeys(clk, (e) => {
    const c = e.code;
    if (c === 'Space') {
      if (plays() && ['read', 'open'].includes(G.phase) && !G.cat) { buzz(meIdx()); return true; }
      if (G.view === 1) return host('open');
      return false;
    }
    if (c === 'Enter' && G.phase === 'answer' && isMe(G.answerer)) { cFoot.querySelector('input')?.focus({ preventScroll: true }); return true; }
    if (G.view === 1) {
      if (c === 'Digit1' || c === 'Numpad1') return host('right');
      if (c === 'Digit2' || c === 'Numpad2') return host('wrong');
      if (c === 'KeyR') return host('reveal');
    }
    if (G.view === 2) {
      const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(c);
      if (n >= 0) return react(n);
    }
    return false;
  });

  clk.tick((t) => {
    if (G.onEnd && t >= G.end) { const f = G.onEnd; G.onEnd = null; f(); }
    ev.time(G.end - t, G.len);
    if (['read', 'catread'].includes(G.phase)) {
      const m = cFoot.querySelector('.jp-read-m');
      if (m) setMeter(m, (t - G.start) / G.readLen);
    }
    if (G.phase === 'answer' && isMe(G.answerer)) {
      const s = Math.ceil((G.end - t) / 1000);
      if (s <= 3 && s >= 1 && s !== G.lastTick) { G.lastTick = s; snd('tick'); }
    }
  });

  // переключатель вида и «Начать заново»
  segButtons(st.ctl, VIEWS, 0, (i) => { armed = true; reset(i); });
  const again = h('button', 'pg-btn', 'Начать заново');
  again.type = 'button';
  again.addEventListener('click', () => { armed = true; reset(G.view); });
  st.ctl.append(again);

  reset(0);
}

// ================================================================== 2. «Перед игрой»: окно «Ракушка» у трибуны

const MODES = [
  { id: 'jeopardy', ic: 'bell', name: 'Своя игра', who: '2–6 игроков + ведущий', time: '20–35 мин' },
  { id: 'riddle', ic: 'scroll', name: 'Загадка', who: 'от 2 человек', time: 'раунд до 5 мин' },
  { id: 'croc', ic: 'paint', name: 'Крокодил', who: 'от 3 человек', time: 'раунд 80 с' },
  { id: 'whoofus', ic: 'online', name: 'Кто из нас?', who: '3–12 человек', time: '10 раундов · ~8 мин' },
];
const PACKS = [
  { ic: 'lighthouse', name: 'Набережная', by: 'Затейник', info: '3 раунда · 17 тем · 80 вопросов', played: 41, like: 37 },
  { ic: 'camera', name: 'Кино 90-х', by: 'Оля', info: '2 раунда · 12 тем · 60 вопросов', played: 12, like: 9 },
  { ic: 'collection', name: 'Обо всём понемногу', by: 'SIGame · Санёк', info: '3 раунда · 18 тем · 90 вопросов', played: 7, like: 5, adult: true },
];
const ROUNDS = [
  { name: 'Раунд 1', note: 'цены 100–500', themes: PACK.themes.map((t) => t.name) },
  { name: 'Раунд 2', note: 'цены 200–1000', themes: ['Маяк и остров', 'Жители', 'Песни', 'География', 'Спорт', 'Мультфильмы'] },
  { name: 'Финал', note: 'тайная ставка', themes: ['Маяки', 'Пираты', 'Сладкое', 'Космос', 'Футбол'] },
];

function lobbyStage(root) {
  const st = makeStage(root, {
    title: 'Перед игрой: окно «Ракушка»',
    note: 'Ведущий подходит к трибуне — <b>E</b> — и выбирает игру, пак и темы. Игроки встают за пульты; «Начать» — когда их двое и больше.',
    bg: 'img/venue-shell.jpg',
    tag: 'Ты у трибуны',
  });
  const clk = makeClock(st.frame);
  st.hud.innerHTML = `<div class="k-slot k-slot--tc jp-tc"></div><div class="k-slot k-slot--tr">${badgeHtml()}</div><div class="k-slot k-slot--bl">${chatHtml()}</div>
    <div class="k-slot k-slot--c jp-c"></div><div class="k-slot k-slot--bc"><button type="button" class="k-prompt jp-reopen" hidden>${keyHtml('E')}Открыть «Ракушку»<span class="k-prompt-sep"></span><span class="k-prompt-note">трибуна ведущего</span></button></div>`;
  const ev = makeEvent(st.hud.querySelector('.jp-tc'));
  const center = st.hud.querySelector('.jp-c');
  const reopen = st.hud.querySelector('.jp-reopen');
  const scrim = h('div', 'k-scrim jp-scrim');
  st.scale.append(scrim);

  const L = { step: 'modes', pack: 0, off: new Set(['1:2', '2:4']), joined: [], open: true, note: '' };
  const JOIN = [['Оля', 900], ['Санёк', 2000], ['ОченьДлинныйНик', 3400], ['Тёма', 6500]];

  const steps = (n) => `<div class="jp-steps">${['Пак', 'Темы', 'Игроки'].map((s, i) => `<span class="${i + 1 === n ? 'is-on' : i + 1 < n ? 'is-done' : ''}"><b>${i + 1}</b>${s}</span>`).join('')}</div>`;

  function body() {
    if (L.step === 'modes') {
      return `<p class="jp-lead">Во что играем? Ведёшь ты — игроки встанут за пульты.</p><div class="jp-modes">${MODES.map((m) => `<button type="button" class="k-cell jp-mode${m.id === 'jeopardy' ? ' is-main' : ''}" data-mode="${m.id}">`
        + `${iconImg(m.ic, 'jp-mode-ic')}<span class="jp-mode-t"><b>«${esc(m.name)}»</b><span>${esc(m.who)}</span><span>${esc(m.time)}</span></span></button>`).join('')}</div>`
        + (L.note ? `<p class="jp-note-line">${L.note}</p>` : '');
    }
    if (L.step === 'pack') {
      return `${steps(1)}<div class="jp-packs">${PACKS.map((p, i) => `<button type="button" class="k-cell jp-pack${i === L.pack ? ' is-on' : ''}" data-pack="${i}">`
        + `${iconImg(p.ic, 'jp-pack-ic')}<span class="jp-pack-t"><b>«${esc(p.name)}»${p.adult ? ' <span class="k-pill k-pill--bad k-pill--xs">18+</span>' : ''}</b><span>${esc(p.info)}</span><span class="k-faint">автор — ${esc(p.by)}</span></span>`
        + `<span class="jp-pack-side"><span>сыграли ${p.played}</span><span class="k-good">нравится ${p.like}</span></span></button>`).join('')}</div>`;
    }
    if (L.step === 'themes') {
      return `${steps(2)}<p class="jp-lead">Пак «${esc(PACKS[L.pack].name)}» — сними лишние темы</p><div class="jp-rounds">${ROUNDS.map((r, ri) => `<div class="jp-round"><div class="jp-round-h"><b>${esc(r.name)}</b><span class="k-faint">${esc(r.note)}</span></div>`
        + `<div class="jp-tags">${r.themes.map((t, ti) => { const on = !L.off.has(`${ri}:${ti}`); return `<button type="button" class="k-pill${on ? ' k-pill--gold' : ''} jp-tag" data-th="${ri}:${ti}" aria-pressed="${on}">${on ? '✓ ' : ''}${esc(t)}</button>`; }).join('')}</div></div>`).join('')}</div>`;
    }
    // игроки
    const n = L.joined.length;
    return `${steps(3)}<p class="jp-lead">Позвали в общий чат. Игроки встают за пульты — <b>E</b> у пульта.</p><div class="jp-pults">${Array.from({ length: 6 }, (_, i) => {
      const p = L.joined[i];
      return p ? `<div class="k-cell jp-pult is-on">${jellySvg(p.color, 52, { hat: p.hat })}<b>${esc(p.nick)}</b><span class="k-faint">пульт ${i + 1}</span></div>`
        : `<div class="k-cell jp-pult"><span class="jp-pult-empty"></span><b class="k-dim">свободно</b><span class="k-faint">пульт ${i + 1}</span></div>`;
    }).join('')}</div><p class="jp-gather">${n ? `Встали <b>${n}</b> из 6` : 'Пока никого'}${n < 2 ? ' · <span class="k-bad">нужно хотя бы двое</span>' : ' · можно начинать'}</p>`;
  }
  function footHtml() {
    if (L.step === 'modes') return '<span class="k-note">Паки, загрузка и рекорды — в разделе «Паки» ниже</span>';
    const back = `<button type="button" class="k-btn k-btn--ghost" data-go="back">Назад</button>`;
    if (L.step === 'pack') return `<span class="k-note">Свой пак — вкладка «Загрузить»</span>${back}<button type="button" class="k-btn" data-go="themes">Дальше${keyHtml('Enter', 'tr', 'sm')}</button>`;
    if (L.step === 'themes') {
      const on = ROUNDS.reduce((s, r, ri) => s + r.themes.filter((_, ti) => !L.off.has(`${ri}:${ti}`)).length, 0);
      return `<span class="k-note">Тем ${on} · ~${Math.round(on * 1.9)} мин</span>${back}<button type="button" class="k-btn" data-go="gather"${on < 3 ? ' disabled' : ''}>Позвать игроков${keyHtml('Enter', 'tr', 'sm')}</button>`;
    }
    return `<span class="k-note">Пустые пульты можно занять и потом</span>${back}<button type="button" class="k-btn k-btn--go" data-go="start"${L.joined.length < 2 ? ' disabled' : ''}>Начать${keyHtml('Enter', 'tr', 'sm')}</button>`;
  }
  function render(anim) {
    if (!L.open) { scrim.hidden = true; scrim.innerHTML = ''; reopen.hidden = false; return; }
    reopen.hidden = true;
    scrim.hidden = false;
    const tabs = [['play', 'bell', 'Играть'], ['packs', 'collection', 'Паки'], ['up', 'release', 'Загрузить'], ['rec', 'records', 'Рекорды']];
    scrim.innerHTML = `<section class="k-window jp-win${anim ? ' is-in' : ''}" role="dialog" aria-label="Ракушка">
      <header class="k-win-head"><span class="k-win-portrait"><img src="img/zatejnik.png" alt=""></span><div class="k-win-titles"><p class="k-eyebrow">Приморский сад · трибуна</p><h2 class="k-win-title">Ракушка</h2></div>
        <div class="k-win-tools"><button type="button" class="k-close" aria-label="Закрыть">${keyHtml('Esc', undefined, 'sm')}</button></div></header>
      <nav class="k-tabs" role="tablist">${tabs.map(([id, ic, label], i) => `<button type="button" role="tab" class="k-tab${i === 0 ? ' is-on' : ''}" data-tab="${id}" aria-selected="${i === 0}"${i ? ' disabled' : ''}>${iconImg(ic)}${label}</button>`).join('')}<span class="jp-tabs-note">— в разделе «Паки» ниже</span></nav>
      <div class="k-win-body">${body()}</div>
      <footer class="k-win-foot">${footHtml()}</footer></section>`;
  }
  function go(step) {
    L.step = step;
    L.note = '';
    if (step === 'gather') {
      clk.clear();
      L.joined = [];
      for (const [n, ms] of JOIN) clk.at(ms, () => { L.joined.push(P(n)); snd('pop'); if (L.step === 'gather' && L.open) render(false); });
    }
    snd('click');
    render(false);
  }
  function close() {
    if (!L.open) return;
    L.open = false;
    snd('close');
    render();
  }
  function open() {
    L.open = true;
    snd('open');
    center.innerHTML = '';
    ev.set(null);
    render(true);
  }
  function start() {
    if (L.joined.length < 2) return;
    clk.clear();
    L.open = false;
    L.step = 'modes';
    render();
    snd('fanfare');
    center.innerHTML = `<div class="k-hero k-hero--gold is-pop"><p class="k-hero-title">Поехали!</p><span class="k-hero-sub">«Своя игра» · ${L.joined.length} ${L.joined.length < 5 ? 'игрока' : 'игроков'} · пак «${esc(PACKS[L.pack].name)}»</span></div>`;
    ev.set({ ic: 'bell', title: '«Своя игра» началась', sub: 'игра — в макете выше' });
  }

  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(); });
  scrim.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('.k-close')) { close(); return; }
    const m = t.closest('[data-mode]');
    if (m) {
      if (m.dataset.mode === 'jeopardy') go('pack');
      else { L.note = `«${esc(MODES.find((x) => x.id === m.dataset.mode).name)}» — смотри <a href="#${m.dataset.mode}">раздел ниже</a>`; snd('click'); render(false); }
      return;
    }
    const pk = t.closest('[data-pack]');
    if (pk) { L.pack = Number(pk.dataset.pack); snd('click'); render(false); return; }
    const th = t.closest('[data-th]');
    if (th) { const k = th.dataset.th; if (L.off.has(k)) L.off.delete(k); else L.off.add(k); snd('click'); render(false); return; }
    const g = t.closest('[data-go]');
    if (!g || g.disabled) return;
    const to = g.dataset.go;
    if (to === 'back') go({ pack: 'modes', themes: 'pack', gather: 'themes' }[L.step]);
    else if (to === 'start') start();
    else go(to);
  });
  reopen.addEventListener('click', open);
  onKeys(clk, (e) => {
    if (e.code === 'Escape' && L.open) { close(); return true; }
    if (e.code === 'KeyE' && !L.open) { open(); return true; }
    if (e.code === 'Enter' && L.open) {
      const b = scrim.querySelector('.k-win-foot .k-btn:not(.k-btn--ghost)');
      if (b && !b.disabled) { b.click(); return true; }
    }
    return false;
  });
  const reBtn = h('button', 'pg-btn', 'Открыть окно заново');
  reBtn.type = 'button';
  reBtn.addEventListener('click', () => { armed = true; clk.clear(); L.step = 'modes'; L.joined = []; open(); });
  st.ctl.append(reBtn);
  render(true);
}

// ================================================================== 3. «Финал» и итоги

const FINAL = [
  { name: 'Маяки', q: 'Какой маяк считался одним из семи чудес света?', a: 'александрийский/фаросский/фарос/маяк на фаросе', say: 'Александрийский (Фаросский)', wrong: ['Генуэзский', 'Воронцовский'] },
  { name: 'Пираты', q: 'Как называется пиратский флаг с черепом и костями?', a: 'веселый роджер/весёлый роджер/роджер', say: 'Весёлый Роджер', wrong: ['Чёрная метка', 'Чёрный флаг'] },
  { name: 'Сладкое', q: 'Из каких бобов делают шоколад?', a: 'какао/какао бобы/какао-бобы', say: 'Какао', wrong: ['Кофейных', 'Соевых'] },
  { name: 'Космос', q: 'Белка и… — как звали вторую собаку, вернувшуюся из космоса?', a: 'стрелка', say: 'Стрелка', wrong: ['Лайка', 'Звёздочка'] },
  { name: 'Футбол', q: 'Сколько игроков одной команды на поле в футболе?', a: '11/одиннадцать', say: '11', wrong: ['10', '12'] },
];

function finalStage(root) {
  const st = makeStage(root, {
    title: 'Финал и итоги',
    note: 'Играют те, у кого больше нуля. По очереди убирают темы, тайно ставят, отвечают текстом; ответы раскрывают от меньшего счёта к большему. Кнопка «Дальше» — быстрее к следующему шагу.',
    bg: 'img/venue-shell.jpg',
    tag: 'Вид игрока — финал',
  });
  st.bg.style.setProperty('--qz-shade', 'linear-gradient(180deg, rgba(6, 34, 31, .5), rgba(6, 34, 31, .66))');
  const clk = makeClock(st.frame);
  st.hud.classList.add('jp-hud');
  st.hud.innerHTML = `<div class="k-slot k-slot--tc jp-tc"></div><div class="k-slot k-slot--tr">${badgeHtml()}</div><div class="k-slot k-slot--bl">${chatHtml()}</div>
    <div class="jp-board"><span class="k-pill k-pill--solid k-pill--sm jp-board-cap">Финал · пак «${esc(PACK.name)}»</span><div class="jp-fin"></div><div class="jp-confetti"></div></div>
    <div class="k-slot k-slot--bc jp-bc"><div class="jp-strip"></div></div>`;
  const ev = makeEvent(st.hud.querySelector('.jp-tc'));
  const fin = st.hud.querySelector('.jp-fin');
  const conf = st.hud.querySelector('.jp-confetti');
  const strip = st.hud.querySelector('.jp-strip');
  const scrim = h('div', 'k-scrim mo-scrim jp-scrim');
  scrim.hidden = true;
  st.scale.append(scrim);

  const F = { step: '', ph: 0, players: [], themes: [], order: [], who: 0, bet: 500, bets: [], answers: [], theme: null, end: 0, len: 0, onEnd: null, shown: 0 };
  const later = (ms, fn) => { const ph = F.ph; clk.at(ms, () => { if (F.ph === ph) fn(); }); };
  const step = (s) => { F.step = s; F.ph++; F.onEnd = null; };
  const timer = (ms, fn) => { F.end = clk.t + ms; F.len = ms; F.onEnd = fn; };
  const me = () => F.players.find((p) => p.me);
  const finalists = () => F.players.filter((p) => p.score > 0);

  function seats() {
    strip.querySelectorAll('.jp-seat').forEach((s) => {
      const p = F.players[Number(s.dataset.i)];
      s.classList.toggle('is-out', p.score <= 0 && F.step !== 'results');
      s.classList.toggle('is-turn', F.step === 'themes' && F.order[F.who] === p);
      const sc = s.querySelector('.jp-seat-score');
      sc.textContent = fmt(p.score);
      sc.classList.toggle('is-neg', p.score < 0);
    });
  }

  function reset() {
    clk.clear();
    step('idle');
    scrim.hidden = true;
    scrim.innerHTML = '';
    conf.innerHTML = '';
    F.players = [['Кракозябра', 1400], ['Оля', 1900], ['Санёк', 600], ['ОченьДлинныйНик', -300]].map(([n, s]) => ({ ...P(n), score: s, me: n === 'Кракозябра' }));
    strip.innerHTML = seatsHtml(F.players);
    F.themes = FINAL.map((t) => ({ ...t, off: false }));
    const fl = finalists().sort((a, b) => a.score - b.score);
    F.order = Array.from({ length: F.themes.length - 1 }, (_, i) => fl[i % fl.length]);
    F.who = 0;
    F.bet = 500;
    themesStep();
  }

  // 1. убираем темы по очереди (меньший счёт — первым)
  function themesStep() {
    step('themes');
    drawThemes();
    turnThemes();
  }
  function drawThemes() {
    const mine = F.step === 'themes' && F.order[F.who]?.me;
    fin.className = `jp-fin is-themes${mine ? ' is-pick' : ''}`;
    fin.innerHTML = `<p class="jp-fin-h">${mine ? 'Твой ход — убери тему' : 'Темы финала'}</p><div class="jp-fin-themes">${F.themes.map((t, i) => `<button type="button" class="jp-fin-theme${t.off ? ' is-off' : ''}" data-ft="${i}"${t.off || !mine ? ' disabled' : ''}><span>${esc(t.name)}</span></button>`).join('')}</div>`;
    seats();
  }
  function turnThemes() {
    const left = F.themes.filter((t) => !t.off);
    if (left.length <= 1) { F.onEnd = null; F.theme = left[0]; drawThemes(); later(900, betStep); ev.set({ ic: 'scroll', title: `Тема финала — «${F.theme.name}»`, sub: 'сейчас тайная ставка', tone: 'good' }); snd('reward'); return; }
    const p = F.order[F.who];
    drawThemes();
    ev.set({ ic: 'scroll', title: p.me ? 'Убери тему — клик' : `Убирает ${p.nick}`, sub: `осталось тем: ${left.length}`, timer: true });
    if (!p.me) later(rnd(1100, 1900), () => removeTheme(pickBotTheme()));
    timer(10000, () => removeTheme(pickBotTheme()));
  }
  function pickBotTheme() {
    const left = F.themes.map((t, i) => [t, i]).filter(([t]) => !t.off);
    return pick(left)[1];
  }
  function removeTheme(i) {
    if (F.step !== 'themes' || F.themes[i]?.off) return;
    F.themes[i].off = true;
    F.who++;
    F.ph++;
    F.onEnd = null;
    snd('cold');
    const b = fin.querySelector(`[data-ft="${i}"]`);
    if (b && !still()) b.animate([{ transform: 'scale(1.04)' }, { transform: 'none' }], { duration: 240 });
    turnThemes();
  }

  // 2. тайная ставка
  function betStep() {
    step('bet');
    const max = me().score;
    F.bet = Math.min(F.bet, max);
    seats();
    fin.className = 'jp-fin is-bet';
    fin.innerHTML = `<p class="jp-fin-h">Финал · «${esc(F.theme.name)}»</p><div class="k-bet jp-bet">
      <p class="jp-lead-h">Сколько ставишь? От 1 до ${fmt(max)}</p>
      <div class="k-bet-row"><span class="k-bet-amount">Ставка<input class="k-input k-bet-input jp-bet-in" type="number" min="1" max="${max}" value="${F.bet}" aria-label="Ставка"></span>
        <input class="k-slider jp-bet-sl" type="range" min="1" max="${max}" value="${F.bet}" style="--v:${F.bet / max}" aria-label="Ставка ползунком"></div>
      <div class="k-bet-chips"><button type="button" class="k-chip k-chip--100" data-chip="100">100</button><button type="button" class="k-chip k-chip--500" data-chip="500">500</button><button type="button" class="k-btn k-btn--sm k-btn--ghost" data-chip="all">Ва-банк</button><button type="button" class="k-btn k-btn--sm k-btn--ghost" data-chip="0">Сбросить</button></div>
      <button type="button" class="k-btn k-btn--lg" data-fin="bet">Поставить${keyHtml('Enter', 'tr', 'sm')}</button>
      <p class="k-bet-note">Ставку видишь только ты — откроют в конце</p></div>`;
    ev.set({ ic: 'token', title: 'Тайная ставка', sub: 'Оля и Санёк думают…', timer: true });
    later(2600, () => ev.set({ ic: 'token', title: 'Тайная ставка', sub: 'Оля и Санёк уже поставили', timer: true }));
    timer(20000, placeBet);
  }
  function setBet(v) {
    const max = me().score;
    F.bet = clamp(Math.round(v) || 1, 1, max);
    const inp = fin.querySelector('.jp-bet-in');
    const sl = fin.querySelector('.jp-bet-sl');
    if (inp && Number(inp.value) !== F.bet) inp.value = String(F.bet);
    if (sl) { sl.value = String(F.bet); sl.style.setProperty('--v', String(F.bet / max)); }
  }
  function placeBet() {
    if (F.step !== 'bet') return;
    snd('reward');
    F.bets = F.players.map((p) => (p.score <= 0 ? 0 : p.me ? F.bet : p.nick === 'Оля' ? 900 : p.score));
    questionStep();
  }

  // 3. вопрос, ответ текстом 30 с
  function questionStep() {
    step('question');
    fin.className = 'jp-fin is-q';
    fin.innerHTML = `<div class="jp-card jp-card--fin"><div class="jp-card-head"><span class="jp-card-theme">Финал · ${esc(F.theme.name)}</span><span class="jp-card-price">ставка ${fmt(F.bet)}</span></div>
      <div class="jp-card-body"><p class="jp-card-q">${esc(F.theme.q)}</p></div>
      <div class="jp-card-foot"><form class="jp-ans"><input class="k-input jp-ans-in" maxlength="40" placeholder="Твой ответ" autocomplete="off" aria-label="Твой ответ"><button type="submit" class="k-btn k-btn--go">Ответить${keyHtml('Enter', 'tr', 'sm')}</button></form><p class="jp-hint">Ответ видит только ведущий — до раскрытия</p></div></div>`;
    const form = fin.querySelector('form');
    const inp = form.querySelector('input');
    form.addEventListener('submit', (e) => { e.preventDefault(); armed = true; answer(inp.value.trim()); });
    setTimeout(() => { if (clk.ratio > 0.3) inp.focus({ preventScroll: true }); }, 60);
    ev.set({ ic: 'voice', title: 'Пиши ответ', sub: 'Барон читает вопрос вслух', timer: true });
    later(4000, () => ev.set({ ic: 'voice', title: 'Пиши ответ', sub: 'Оля уже ответила', timer: true }));
    timer(30000, () => answer(inp.value.trim()));
  }
  function answer(text) {
    if (F.step !== 'question') return;
    const t = F.theme;
    F.answers = F.players.map((p) => {
      if (p.score <= 0) return null;
      if (p.me) return text;
      const right = p.nick === 'Оля' ? Math.random() < 0.65 : Math.random() < 0.3;
      return right ? t.say.split(' (')[0] : pick(t.wrong);
    });
    snd('pop');
    revealStep();
  }

  // 4. раскрытие: от меньшего счёта к большему
  function revealStep() {
    step('reveal');
    const order = F.players.map((p, i) => i).filter((i) => F.players[i].score > 0).sort((a, b) => F.players[a].score - F.players[b].score);
    F.order = order;
    F.shown = 0;
    fin.className = 'jp-fin is-reveal';
    fin.innerHTML = `<p class="jp-fin-h">«${esc(F.theme.name)}»: ${esc(F.theme.q)}</p><table class="k-table jp-rev"><thead><tr><th>Игрок</th><th>Ответ</th><th class="k-r">Ставка</th><th class="k-r">Счёт</th></tr></thead><tbody></tbody></table><p class="jp-fin-ans" hidden>Верный ответ — <b>${esc(F.theme.say)}</b></p>`;
    ev.set({ ic: 'medal-gold', title: 'Раскрываем ответы', sub: 'от меньшего счёта к большему' });
    snd('open');
    later(900, revealNext);
  }
  function revealNext() {
    if (F.step !== 'reveal') return;
    if (F.shown >= F.order.length) {
      fin.querySelector('.jp-fin-ans').hidden = false;
      later(2200, resultsStep);
      return;
    }
    revealRow();
    later(1600, revealNext);
  }
  function revealRow() {
    const i = F.order[F.shown++];
    const p = F.players[i];
    const text = F.answers[i] || '';
    const ok = !!text && checkAnswer(text, F.theme.a) !== 'no';
    const bet = F.bets[i];
    p.score += ok ? bet : -bet;
    const tr = document.createElement('tr');
    if (p.me) tr.className = 'is-own';
    tr.innerHTML = `<td><span class="k-who">${jellySvg(p.color, 28, { hat: p.hat })}<span class="jp-who-n">${esc(p.nick)}</span></span></td><td>«${esc(text || '…')}» <b class="${ok ? 'k-good' : 'k-bad'}">${ok ? '✓' : '✗'}</b></td>`
      + `<td class="k-r ${ok ? 'k-good' : 'k-bad'}">${ok ? '+' : '−'}${fmt(bet)}</td><td class="k-r">${fmt(p.score)}</td>`;
    fin.querySelector('tbody').append(tr);
    if (!still()) tr.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
    popAt(strip, i, `${ok ? '+' : '−'}${fmt(bet)}`, !ok);
    flash(strip, i, ok ? 'is-lamp' : 'is-wrong', 1300);
    snd(ok ? 'right' : 'wrong');
    seats();
  }

  // 5. итоги — окно режимов (ModeResults)
  function resultsStep() {
    step('results');
    const rows = [...F.players].sort((a, b) => b.score - a.score);
    const place = rows.findIndex((p) => p.me) + 1;
    const prize = [100, 50, 25];
    const mine = 200 + (prize[place - 1] ?? 0);
    const title = place === 1 ? 'Победа!' : `${place}-е место`;
    if (place === 1) confetti(conf);
    snd(place === 1 ? 'fanfare' : 'reward');
    ev.set(null);
    scrim.hidden = false;
    scrim.innerHTML = `<section class="k-window mo-results is-in" role="dialog" aria-label="${esc(title)}">
      <div class="k-results-head"><p class="k-eyebrow">Своя игра · пак «${esc(PACK.name)}»</p><h2 class="k-results-title">${esc(title)}</h2><p class="k-results-sub">Финал «${esc(F.theme.name)}» — ${esc(F.theme.say)}</p></div>
      <div class="k-win-body"><table class="k-table"><thead><tr><th></th><th>Игрок</th><th class="k-r">Счёт</th><th class="k-r">${coinHtml()}</th></tr></thead><tbody>${rows.map((p, i) => `<tr class="${p.me ? 'is-own' : ''}${p.score <= 0 ? ' is-dnf' : ''}">`
        + `<td>${placeHtml(i + 1)}</td><td><span class="k-who">${jellySvg(p.color, 30, { hat: p.hat })}<span>${esc(p.nick)}</span></span></td><td class="k-r">${fmt(p.score)}</td><td class="k-r">+${200 + (prize[i] ?? 0)}</td></tr>`).join('')}</tbody></table>
        <div class="k-reward">${coinHtml()}<b>+${mine}</b><span>жетонов: 25 мин игры +200${prize[place - 1] ? ` · ${place}-е место +${prize[place - 1]}` : ''}</span></div></div>
      <div class="k-results-actions"><button type="button" class="k-btn" data-res="again">Ещё раз${capHtml('Enter', 'k-key--tr')}</button><button type="button" class="k-btn k-btn--ghost" data-res="leave">На набережную${capHtml('Esc', 'k-key--tr')}</button></div></section>`;
  }
  function leave() {
    step('left');
    scrim.hidden = true;
    scrim.innerHTML = '';
    fin.className = 'jp-fin is-left';
    fin.innerHTML = '<p class="jp-fin-h">Ты на набережной</p><p class="jp-wait">Итоги ушли в общий чат, рекорд — в профиль.</p><div class="jp-give"><button type="button" class="k-btn" data-fin="again">Сыграть финал ещё раз</button></div>';
    ev.set({ ic: 'medal-gold', title: 'Кракозябра — на набережной', sub: 'жетоны уже в бейдже' });
    snd('close');
  }

  /** «Дальше»: досрочно закончить текущий шаг */
  function next() {
    armed = true;
    if (F.step === 'themes') {
      while (F.themes.filter((t) => !t.off).length > 1) F.themes[pickBotTheme()].off = true;
      F.ph++;
      drawThemes();
      turnThemes();
    } else if (F.step === 'bet') placeBet();
    else if (F.step === 'question') answer(fin.querySelector('.jp-ans-in')?.value.trim() ?? '');
    else if (F.step === 'reveal') { while (F.shown < F.order.length) revealRow(); resultsStep(); }
    else if (F.step === 'results') leave();
    else reset();
  }

  fin.addEventListener('click', (e) => {
    const t = e.target.closest('[data-ft]');
    if (t && !t.disabled && F.order[F.who]?.me) { removeTheme(Number(t.dataset.ft)); return; }
    const ch = e.target.closest('[data-chip]');
    if (ch) {
      const v = ch.dataset.chip;
      setBet(v === 'all' ? me().score : v === '0' ? 1 : F.bet + Number(v));
      snd('pop');
      return;
    }
    const f = e.target.closest('[data-fin]');
    if (f?.dataset.fin === 'bet') placeBet();
    if (f?.dataset.fin === 'again') reset();
  });
  fin.addEventListener('input', (e) => {
    if (e.target.classList.contains('jp-bet-sl') || e.target.classList.contains('jp-bet-in')) setBet(Number(e.target.value));
  });
  fin.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('jp-bet-in')) { e.preventDefault(); setBet(Number(e.target.value)); placeBet(); } });
  scrim.addEventListener('click', (e) => {
    const b = e.target.closest('[data-res]');
    if (!b) return;
    if (b.dataset.res === 'again') { snd('click'); reset(); } else leave();
  });
  onKeys(clk, (e) => {
    if (F.step === 'results' && e.code === 'Escape') { leave(); return true; }
    if (F.step === 'results' && e.code === 'Enter') { reset(); return true; }
    if (F.step === 'bet' && e.code === 'Enter') { placeBet(); return true; }
    return false;
  });
  clk.tick((t) => {
    if (F.onEnd && t >= F.end) { const f = F.onEnd; F.onEnd = null; f(); }
    ev.time(F.end - t, F.len);
  });

  const nb = h('button', 'pg-btn', 'Дальше');
  nb.type = 'button';
  nb.addEventListener('click', next);
  const rb = h('button', 'pg-btn', 'Сначала');
  rb.type = 'button';
  rb.addEventListener('click', () => { armed = true; reset(); });
  st.ctl.append(nb, rb);
  reset();
}

// ================================================================== раздел

export function mount(el) {
  const root = h('div', 'jp-root');
  el.append(root);
  // звук — только после действия смотрящего; кнопки не забирают фокус (Пробел не «нажмёт» их ещё раз)
  root.addEventListener('pointerdown', () => { armed = true; }, true);
  root.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  gameStage(root);
  lobbyStage(root);
  finalStage(root);
}
