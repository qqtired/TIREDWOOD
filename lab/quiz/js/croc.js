// «Крокодил» — живой макет раздела 04 страницы-обзора «Ракушка» (на ките UI 2.0, как в игре).
// Вид «Я рисую»: слово из трёх → большое окно с настоящим холстом (рисуй мышью), боты угадывают, лента догадок справа.
// Вид «Я угадываю»: мольберт на сцене + панель рисунка, который рисуется сам, строка «В игру» с проверкой ответа.
// Свои классы — cr-*, правила — css/croc.css под #croc. Таймеры и боты идут только пока раздел виден.
import { makeStage, segButtons, h, esc, keyHtml, iconImg, meterHtml, setMeter, jellySvg, PLAYERS, sfx, rnd, pick, checkAnswer, placeHtml } from './common.js';

const W = 800, H = 600;            // размер холста в точках (показывается в любом размере, 4:3)
const ROUND = 80;                  // секунд на рисунок
const PICK = 10;                   // секунд на выбор слова
const ME = 'Кракозябра';
const FEM = new Set(['Оля', 'Мурка', 'Ксю']);
const jelly = (nick, size = 30) => { const p = PLAYERS.find((x) => x.nick === nick) ?? PLAYERS[0]; return jellySvg(p.color, size, { hat: p.hat === 'straw' ? 'straw' : p.hat === 'bow' ? 'bow' : p.hat === 'cap' ? 'cap' : '' }); };
const nickTone = (nick) => { let x = 0; for (const ch of nick) x = (x * 31 + ch.codePointAt(0)) >>> 0; return (x % 6) + 1; };
const fmt = (s) => { const t = Math.max(0, Math.ceil(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const dot = (nick) => `<i class="cr-dot" style="--c:${(PLAYERS.find((x) => x.nick === nick) ?? PLAYERS[0]).color}"></i>`;
const guessed = (n) => `угадал${FEM.has(n) ? 'а' : ''}`;

/** Чернила: тёмный, белый, красный, оранжевый, жёлтый, зелёный, синий, коричневый (значения кита: текст HUD, --bad, --team1, --gold, --good, --team0) */
const INKS = [
  { c: '#16313a', n: 'Тёмный' }, { c: '#ffffff', n: 'Белый' }, { c: '#e5484d', n: 'Красный' }, { c: '#ff8a1c', n: 'Оранжевый' },
  { c: '#ffcd4a', n: 'Жёлтый' }, { c: '#56c07d', n: 'Зелёный' }, { c: '#4a63ff', n: 'Синий' }, { c: '#8b5a3c', n: 'Коричневый' },
];
const SIZES = [{ w: 6, d: 8, n: 'Тонкая' }, { w: 12, d: 14, n: 'Средняя' }, { w: 22, d: 22, n: 'Толстая' }];

/** Слова: три ступени (лёгкое ×1 · среднее ×1,5 · сложное ×2), у каждого — что боты скажут мимо */
const WORDS = [
  [{ w: 'кит', wrong: ['рыба', 'дельфин', 'акула'] }, { w: 'зонт', wrong: ['гриб', 'цветок', 'шляпа'] }, { w: 'яблоко', wrong: ['груша', 'мяч', 'помидор'] }],
  [{ w: 'крокодил', wrong: ['ящерица', 'дракон', 'динозавр', 'змея'] }, { w: 'маяк', wrong: ['башня', 'ракета', 'свеча'] }, { w: 'бабочка', wrong: ['цветок', 'мотылёк', 'птица'] }],
  [{ w: 'привидение', wrong: ['простыня', 'облако', 'медуза'] }, { w: 'рыбалка', wrong: ['пирс', 'удочка', 'озеро'] }, { w: 'рассвет', wrong: ['солнце', 'гора', 'море'] }],
];
const MULT = [1, 1.5, 2];
const DIFF = ['Лёгкое', 'Среднее', 'Сложное'];
const TONE = ['good', 'gold', 'special'];
const mulText = (m) => `×${String(m).replace('.', ',')}`;
const PTS = [5, 4, 3, 2];          // очки угадавшим по порядку (дальше по 2)
const ptsAt = (i, m = 1) => Math.round(PTS[Math.min(i, PTS.length - 1)] * m);

// ------------------------------------------------------------------ холст и штрихи

/** Штрих: { c: цвет, w: толщина, e: ластик?, pts: [[x, y], …] } */
function segment(ctx, s, a, b) {
  const p = s.pts;
  if (!p.length) return;
  ctx.save();
  ctx.globalCompositeOperation = s.e ? 'destination-out' : 'source-over';
  ctx.strokeStyle = ctx.fillStyle = s.e ? '#000' : s.c;
  ctx.lineWidth = s.w;
  ctx.lineCap = ctx.lineJoin = 'round';
  if (a >= b) {
    ctx.beginPath();
    ctx.arc(p[b][0], p[b][1], s.w / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(p[a][0], p[a][1]);
    for (let i = a + 1; i <= b; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.stroke();
  }
  ctx.restore();
}

/** Рисунок на одном или нескольких холстах сразу (панель + мольберт сцены) */
class Paper {
  constructor() { this.strokes = []; this.ctx = []; }
  add(canvas) { const c = canvas.getContext('2d'); this.ctx.push(c); return c; }
  seg(s, a, b) { for (const c of this.ctx) segment(c, s, a, b); }
  clear() { this.strokes.length = 0; for (const c of this.ctx) c.clearRect(0, 0, W, H); }
  redraw() {
    for (const c of this.ctx) {
      c.clearRect(0, 0, W, H);
      for (const s of this.strokes) if (s.pts.length) segment(c, s, 0, s.pts.length - 1);
    }
  }
}

// ------------------------------------------------------------------ записанный рисунок «парусник» (для вида угадывающего)

/** Уплотнить ломаную: точка каждые ~step */
const dens = (pts, step = 6) => {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 1; k <= n; k++) out.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
  }
  return out;
};
const circle = (cx, cy, r, n = 40) => Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos(i / n * 2 * Math.PI) * r, cy + Math.sin(i / n * 2 * Math.PI) * r]);
const wave = (x0, x1, y, amp, len, ph = 0) => { const p = []; for (let x = x0; x <= x1; x += 8) p.push([x, y + Math.sin((x - x0) / len * 2 * Math.PI + ph) * amp]); return p; };
const quad = (x0, y0, x1, y1, x2, y2, bend = 0) => { const p = []; for (let i = 0; i <= 16; i++) { const t = i / 16; p.push([(1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * x1 + t * t * x2, (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * y1 + t * t * y2 + bend]); } return p; };
/** Заливка штрихами «змейкой» внутри выпуклого многоугольника (как закрашивают карандашом) */
function hatch(poly, gap, ang = 0) {
  const cs = Math.cos(-ang), sn = Math.sin(-ang);
  const rot = ([x, y]) => [x * cs - y * sn, x * sn + y * cs];
  const back = ([x, y]) => [x * cs + y * sn, -x * sn + y * cs];
  const P = poly.map(rot);
  const ys = P.map((p) => p[1]);
  const out = [];
  let dir = 1;
  for (let y = Math.min(...ys) + gap * 0.55; y < Math.max(...ys); y += gap) {
    const xs = [];
    for (let i = 0; i < P.length; i++) {
      const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
      if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + (y - ay) / (by - ay) * (bx - ax));
    }
    if (xs.length < 2) continue;
    xs.sort((m, n) => m - n);
    const a = xs[0] + 4, b = xs[xs.length - 1] - 4;
    if (b <= a) continue;
    out.push(...(dir > 0 ? [[a, y], [b, y]] : [[b, y], [a, y]]));
    dir = -dir;
  }
  return out.map(back);
}

/** Записанные штрихи: [цвет, толщина, точки, скорость px/с, пауза «подумал»] — рисуются во времени, как рука */
function buildRec() {
  const DARK = '#16313a', RED = '#e5484d', ORANGE = '#ff8a1c', YELLOW = '#ffcd4a', BROWN = '#8b5a3c', BLUE = '#4a63ff';
  const rec = [];
  let t = 1.6, last = '';
  const add = (c, w, pts, spd = 380, think = 0.3) => {
    if (c !== last) { t += 0.55; last = c; }
    t += think;
    const p = dens(pts);
    let len = 0;
    for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    const d = Math.max(0.18, len / spd);
    rec.push({ c, w, pts: p, t0: t, d });
    t += d;
  };
  const hull = [[205, 372], [595, 372], [538, 458], [262, 458]];
  const main = [[414, 118], [414, 350], [592, 350]];
  const jib = [[388, 150], [388, 350], [250, 350]];
  // корпус и мачта
  add(DARK, 9, [...hull, hull[0]], 360, 0.4);
  add(DARK, 10, [[400, 374], [400, 104]], 420, 0.3);
  // паруса
  add(DARK, 8, [...main, main[0]], 380, 0.3);
  add(DARK, 8, [...jib, jib[0]], 380, 0.2);
  // раскраска
  add(RED, 9, hatch(main, 13, 0.5), 900, 0.2);
  add(ORANGE, 9, hatch(jib, 15, -0.5), 900, 0.1);
  add(BROWN, 10, hatch([[214, 378], [586, 378], [532, 452], [268, 452]], 12, 0.12), 950, 0.1);
  add(RED, 8, [[222, 388], [578, 388]], 520, 0.15);
  // флажок
  add(RED, 7, [[402, 76], [446, 90], [402, 104], [402, 76]], 300, 0.4);
  // солнце
  add(YELLOW, 9, circle(130, 118, 46), 520, 0.5);
  add(YELLOW, 9, hatch(circle(130, 118, 46, 20), 12, 0.3), 700, 0.1);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 + 0.2;
    add(YELLOW, 8, [[130 + Math.cos(a) * 64, 118 + Math.sin(a) * 64], [130 + Math.cos(a) * 90, 118 + Math.sin(a) * 90]], 420, 0.06);
  }
  // чайки
  add(DARK, 5, [...quad(560, 112, 580, 78, 602, 110), ...quad(602, 110, 626, 76, 650, 108)], 380, 0.45);
  add(DARK, 5, [...quad(690, 170, 704, 148, 720, 168), ...quad(720, 168, 736, 146, 752, 166)], 380, 0.2);
  // море: сначала лёгкая штриховка, потом волны
  add(BLUE, 8, hatch([[22, 462], [778, 462], [778, 584], [22, 584]], 24, -0.22), 1000, 0.5);
  add(BLUE, 7, wave(26, 774, 470, 9, 84), 460, 0.3);
  add(BLUE, 7, wave(26, 774, 514, 9, 84, 1.7), 460, 0.2);
  add(BLUE, 7, wave(26, 774, 556, 9, 84, 3.1), 460, 0.2);
  return { rec, end: t };
}
const RECORDED = buildRec();

/** CSS matrix3d: прямоугольник 0…w × 0…h → четырёхугольник q (левый верх, правый верх, правый низ, левый низ), перспектива мольберта */
function quadMatrix(w, hh, q) {
  const src = [[0, 0], [w, 0], [w, hh], [0, hh]];
  const A = [], B = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = q[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
  }
  const n = 8;
  const M = A.map((r, i) => [...r, B[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = i + 1; r < n; r++) {
      const f = M[r][i] / M[i][i];
      for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
    }
  }
  const s = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let v = M[i][n];
    for (let c = i + 1; c < n; c++) v -= M[i][c] * s[c];
    s[i] = v / M[i][i];
  }
  const [a, b, c, d, e, f, g, k] = s;
  return `matrix3d(${a},${d},0,${g},${b},${e},0,${k},0,0,1,0,${c},${f},0,1)`;
}
/** Мольберт сцены: холст в перспективе доски, внутри фона (затемнение сцены ложится и на доску) */
function mountEasel(st) {
  const el = h('div', 'cr-easel');
  el.innerHTML = `<canvas width="${W}" height="${H}"></canvas>`;
  el.style.transform = quadMatrix(W, H, EASEL);
  st.bg.append(el);
  return { el, ctx: el.firstElementChild.getContext('2d') };
}
/** Доска мольберта на картинке сцены (координаты 1440×900): левый верх, правый верх, правый низ, левый низ */
const EASEL = [[519, 138], [800, 151], [841, 393], [521, 389]];

// ------------------------------------------------------------------ раздел

export function mount(el) {
  const NOTE = [
    'Выбери слово и рисуй 80 секунд. Рисунок сразу появляется на мольберте сцены — его видно даже с набережной.',
    'Рисунок появляется на мольберте сцены сразу — его видно с набережной. Догадки — в строку чата слева внизу; попробуй «лодка», «парус» и «парусник».',
  ];
  const st = makeStage(el, { title: 'Живой макет: один раунд «Крокодила»', note: NOTE[0], bg: 'img/croc-easel.jpg', tag: 'Вид рисующего' });
  const noteEl = st.root.querySelector('.qz-cap-n');
  st.root.id = 'cr-stage';

  let touched = false;                                    // звук — только после действия смотрящего
  for (const ev of ['pointerdown', 'keydown']) st.root.addEventListener(ev, () => { touched = true; }, true);
  const snd = (name) => { if (touched) sfx.play(name); };

  let visible = false, speed = 1, view = null, last = performance.now();
  new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; }, { threshold: 0.2 }).observe(st.frame);
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(1000, now - last) / 1000;
    last = now;
    if (visible && !document.hidden && view) view.tick(dt * speed);
  }, 100);

  let which = 0;
  const ctxApi = { st, snd, again: () => setView(which), shown: () => visible };
  function setView(i) {
    view?.stop();
    which = i;
    noteEl.innerHTML = NOTE[i];
    st.setTag(i ? 'Вид угадывающего' : 'Вид рисующего');
    view = i ? guessView(ctxApi) : drawView(ctxApi);
  }

  segButtons(st.ctl, ['Я рисую', 'Я угадываю'], 0, (i) => setView(i));
  const fast = h('button', 'pg-btn', 'Ускорить ×3');
  fast.type = 'button';
  fast.setAttribute('aria-pressed', 'false');
  fast.addEventListener('click', () => {
    speed = speed === 1 ? 3 : 1;
    fast.setAttribute('aria-pressed', String(speed !== 1));
  });
  const again = h('button', 'pg-btn', 'Начать заново');
  again.type = 'button';
  again.addEventListener('click', () => setView(which));
  st.ctl.append(fast, again);
  setView(0);
}

// ------------------------------------------------------------------ тосты верх-центра (как TopCenter.toast)

function toaster(hud) {
  const slot = h('div', 'k-slot k-slot--tc');
  const box = h('div', 'k-toasts cr-toasts');
  slot.append(box);
  hud.append(slot);
  return ({ tone = 'info', icon = 'paint', title, sub = '', life = 3600 }) => {
    const t = h('div', `k-toast k-toast--${tone} is-new`);
    t.innerHTML = `<span class="k-toast-ic">${iconImg(icon, '')}</span><div class="k-toast-title">${esc(title)}</div>${sub ? `<div class="k-toast-sub">${esc(sub)}</div>` : ''}`;
    box.append(t);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => { t.classList.remove('is-new'); t.classList.add('is-out'); setTimeout(() => t.remove(), 320); }, life);
  };
}

/** Строка чата кита: ник цветом, текст — через textContent */
function chatLine(nick, text, cls = '') {
  const row = h('div', `k-chat-line${nick ? ` k-nick-${nickTone(nick)}` : ' is-sys'}${nick === ME ? ' is-own' : ''}${cls ? ` ${cls}` : ''}`);
  if (nick) { const b = h('b'); b.textContent = nick; row.append(b); }
  row.append(document.createTextNode(text));
  return row;
}

// ------------------------------------------------------------------ вид «Я рисую»

function drawView({ st, snd, shown }) {
  const hud = st.hud;
  const paper = new Paper();
  const easel = mountEasel(st);       // пока нет рисунка, доска пустая; готовый рисунок остаётся на ней
  paper.ctx.push(easel.ctx);
  let phase = 'pick';                 // pick · draw · end · idle
  let t = 0;                          // секунд в фазе
  let triple = WORDS.map((g) => pick(g));
  let word = null, mult = 1, diff = 1;
  let ink = 0, size = 1, tool = 'brush', cur = null, asking = false;
  let plan = [], planI = 0, winners = [], shownSec = -1, bt = 0;   // bt — часы ботов: идут, пока есть рисунок
  let win = null;                     // узлы окна рисования
  const pickEls = {};

  const onKey = (e) => {
    if (!shown() || e.target.closest?.('input, textarea')) return;
    if (phase === 'pick' && ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].includes(e.code)) { choose(Number(e.code.slice(-1)) - 1); return; }
    if (phase === 'draw' && e.code === 'KeyZ') { undo(); e.preventDefault(); return; }
    if (phase === 'draw' && e.code === 'Escape') { ask(!asking); return; }
    if (phase === 'end' && e.code === 'Escape') { renderIdle(); return; }
    if (phase === 'idle' && e.code === 'KeyE') begin();
  };
  document.addEventListener('keydown', onKey);

  // ---- выбор слова
  function renderPick() {
    phase = 'pick';
    t = 0;
    paper.strokes.length = 0;
    paper.ctx.length = 0;
    easel.ctx.clearRect(0, 0, W, H);
    paper.ctx.push(easel.ctx);
    hud.replaceChildren();
    const scrim = h('div', 'k-scrim cr-scrim');
    scrim.innerHTML = `<section class="k-window cr-win cr-pick is-in" role="dialog" aria-label="Выбери слово">
      <header class="k-win-head">
        <span class="k-win-portrait">${iconImg('paint', '')}</span>
        <div class="k-win-titles"><p class="k-eyebrow">Крокодил · твоя очередь</p><h2 class="k-win-title">Выбери слово</h2></div>
        <div class="k-win-tools"><span class="k-pill k-pill--lg cr-pick-time">${iconImg('stopwatch')}<b>0:${PICK}</b></span></div>
      </header>
      <div class="k-win-body">
        <div class="cr-cards">${triple.map((w, i) => `
          <button type="button" class="k-cell cr-card" data-i="${i}">
            ${keyHtml(String(i + 1), 'tr')}
            <span class="k-eyebrow">${DIFF[i]}</span>
            <b class="cr-card-w" style="--len:${w.w.length}">${esc(w.w)}</b>
            <span class="k-pill k-pill--${TONE[i]}">очки ${mulText(MULT[i])}</span>
          </button>`).join('')}</div>
        <div class="cr-pick-bar">${meterHtml(1, 'mode', 'k-meter--thin')}<span class="k-dim">Не выберешь — слово выберется само</span></div>
      </div>
    </section>`;
    hud.append(scrim);
    pickEls.time = scrim.querySelector('.cr-pick-time b');
    pickEls.meter = scrim.querySelector('.k-meter');
    scrim.querySelectorAll('.cr-card').forEach((b) => b.addEventListener('click', () => { snd('click'); choose(Number(b.dataset.i)); }));
  }

  function choose(i) {
    diff = i;
    word = triple[i];
    mult = MULT[i];
    renderDraw();
  }

  // ---- окно рисования
  function renderDraw() {
    phase = 'draw';
    t = 0;
    shownSec = -1;
    asking = false;
    winners = [];
    planI = 0;
    bt = 0;
    ink = 0; size = 1; tool = 'brush'; cur = null;
    paper.ctx.length = 0;
    paper.strokes.length = 0;
    easel.ctx.clearRect(0, 0, W, H);
    paper.ctx.push(easel.ctx);
    plan = makePlan();
    hud.replaceChildren();
    const scrim = h('div', 'k-scrim cr-scrim');
    scrim.innerHTML = `<section class="k-window k-window--lg cr-win cr-draw is-in" role="dialog" aria-label="Рисуй">
      <header class="k-win-head">
        <span class="k-win-portrait">${iconImg('paint', '')}</span>
        <div class="k-win-titles"><p class="k-eyebrow">Крокодил · раунд 1 из 5</p><h2 class="k-win-title" title="${esc(word.w)}">Ты рисуешь: ${esc(word.w.toUpperCase())}</h2></div>
        <div class="k-win-tools"><span class="k-pill k-pill--${TONE[diff]}">${DIFF[diff]} ${mulText(mult)}</span>
          <button class="k-close cr-exit" type="button" aria-label="Закрыть">${keyHtml('Esc', undefined, 'sm')}</button></div>
      </header>
      <div class="k-win-body cr-body">
        <div class="cr-main">
          <div class="cr-timerow"><span class="cr-clock">${iconImg('stopwatch')}<b>${fmt(ROUND)}</b></span>${meterHtml(1, 'mode', 'k-meter--lg cr-meter')}</div>
          <div class="cr-paper cr-paper--big"><canvas class="cr-canvas" width="${W}" height="${H}" aria-label="Холст"></canvas><p class="cr-empty">Рисуй мышью — остальные угадывают</p></div>
          <div class="cr-tools">
            <div class="cr-inks" role="group" aria-label="Цвет">${INKS.map((x, i) => `<button type="button" class="cr-ink${i === 0 ? ' is-on' : ''}" data-i="${i}" style="--ink:${x.c}" aria-label="${x.n}" aria-pressed="${i === 0}"></button>`).join('')}</div>
            <div class="cr-sizes" role="group" aria-label="Толщина">${SIZES.map((x, i) => `<button type="button" class="cr-size${i === 1 ? ' is-on' : ''}" data-i="${i}" aria-label="${x.n}" aria-pressed="${i === 1}"><i style="--d:${x.d}px"></i></button>`).join('')}</div>
            <div class="cr-acts">
              <button type="button" class="k-btn k-btn--ghost k-btn--sm cr-eraser" aria-pressed="false">Ластик</button>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm cr-undo">Отменить${keyHtml('Z', 'tr', 'sm')}</button>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm cr-clear">Очистить</button>
            </div>
          </div>
        </div>
        <aside class="cr-side" aria-label="Догадки">
          <div class="cr-side-head"><span class="k-eyebrow">Догадки</span><span class="k-pill k-pill--sm cr-count">0 из 5 угадали</span></div>
          <div class="cr-feed"></div>
        </aside>
      </div>
      <footer class="k-win-foot cr-foot">
        <span class="k-note cr-rule">+2 за каждого угадавшего${mult > 1 ? ` · слово ${mulText(mult)}` : ''}</span>
        <span class="k-pill k-pill--gold cr-score">Очки за раунд: <b>0</b></span>
      </footer>
    </section>`;
    hud.append(scrim);
    const q = (s) => scrim.querySelector(s);
    win = { scrim, canvas: q('.cr-canvas'), feed: q('.cr-feed'), count: q('.cr-count'), score: q('.cr-score b'), clock: q('.cr-clock b'), meter: q('.cr-meter'), empty: q('.cr-empty'), foot: q('.cr-foot'), rule: q('.cr-rule') };
    win.ctx = paper.add(win.canvas);
    wireCanvas();
    scrim.querySelectorAll('.cr-ink').forEach((b) => b.addEventListener('click', () => {
      ink = Number(b.dataset.i);
      tool = 'brush';
      snd('click');
      syncTools();
    }));
    scrim.querySelectorAll('.cr-size').forEach((b) => b.addEventListener('click', () => { size = Number(b.dataset.i); snd('click'); syncTools(); }));
    q('.cr-eraser').addEventListener('click', () => { tool = tool === 'eraser' ? 'brush' : 'eraser'; snd('click'); syncTools(); });
    q('.cr-undo').addEventListener('click', () => { snd('click'); undo(); });
    q('.cr-clear').addEventListener('click', () => { snd('click'); paper.clear(); win.empty.hidden = false; });
    q('.cr-exit').addEventListener('click', () => ask(true));
    scrim.addEventListener('click', (e) => { if (e.target === scrim) ask(true); });
  }

  function syncTools() {
    const s = win.scrim;
    s.querySelectorAll('.cr-ink').forEach((b, i) => { const on = tool === 'brush' && i === ink; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
    s.querySelectorAll('.cr-size').forEach((b, i) => { const on = i === size; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
    const er = s.querySelector('.cr-eraser');
    er.setAttribute('aria-pressed', String(tool === 'eraser'));
    er.classList.toggle('is-on', tool === 'eraser');
  }

  /** Точка холста под курсором: через getBoundingClientRect — верно и при масштабе страницы, и при zoom окна */
  function point(e) {
    const r = win.canvas.getBoundingClientRect();
    return [Math.max(0, Math.min(W, (e.clientX - r.left) * W / r.width)), Math.max(0, Math.min(H, (e.clientY - r.top) * H / r.height))];
  }
  function wireCanvas() {
    const cv = win.canvas;
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (phase !== 'draw') return;
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch { /* нет захвата — рисуем и так */ }
      const w = tool === 'eraser' ? SIZES[size].w * 2.4 : SIZES[size].w;
      cur = { c: INKS[ink].c, w, e: tool === 'eraser', pts: [point(e)] };
      paper.strokes.push(cur);
      paper.seg(cur, 0, 0);
      win.empty.hidden = true;
    });
    cv.addEventListener('pointermove', (e) => {
      if (!cur) return;
      for (const ev of (e.getCoalescedEvents?.() ?? [e])) {
        cur.pts.push(point(ev));
        paper.seg(cur, cur.pts.length - 2, cur.pts.length - 1);
      }
    });
    const end = () => { cur = null; };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('lostpointercapture', end);
  }
  function undo() {
    if (!paper.strokes.length) return;
    paper.strokes.pop();
    paper.redraw();
    if (!paper.strokes.length) win.empty.hidden = false;
  }

  /** «Выйти из раунда?» — вопрос строкой в подвале окна */
  function ask(on) {
    if (phase !== 'draw') return;
    asking = on;
    const f = win.foot;
    if (on) {
      f.innerHTML = `<span class="k-note">Выйти из раунда? Рисунок пропадёт</span>
        <button type="button" class="k-btn k-btn--stop k-btn--sm cr-yes">Да, выйти</button><button type="button" class="k-btn k-btn--ghost k-btn--sm cr-no">Остаться</button>`;
      f.querySelector('.cr-yes').addEventListener('click', () => { snd('close'); renderIdle(); });
      f.querySelector('.cr-no').addEventListener('click', () => ask(false));
    } else {
      f.innerHTML = `<span class="k-note cr-rule">+2 за каждого угадавшего${mult > 1 ? ` · слово ${mulText(mult)}` : ''}</span><span class="k-pill k-pill--gold cr-score">Очки за раунд: <b>${scoreNow()}</b></span>`;
      win.score = f.querySelector('.cr-score b');
    }
  }

  // ---- боты-угадывающие: у рисующего видны все догадки
  function makePlan() {
    const bots = shuffle(['Барон', 'Оля', 'Санёк', 'Тёма', 'ОченьДлинныйНик']);
    const solvers = bots.slice(0, 3 + (Math.random() < 0.5 ? 1 : 0));
    const ev = [];
    let tt = rnd(14, 22);
    const winAt = new Map();
    for (const b of solvers) { ev.push({ t: tt, who: b, win: true }); winAt.set(b, tt); tt += rnd(9, 16); }
    for (const b of bots) {
      const words = shuffle(word.wrong).slice(0, 1 + Math.floor(Math.random() * 2));
      for (const w of words) {
        const at = rnd(4, 52);
        if (!winAt.has(b) || at < winAt.get(b)) ev.push({ t: at, who: b, say: w });
      }
    }
    return ev.sort((a, b) => a.t - b.t);
  }
  const scoreNow = () => Math.round(Math.min(10, 2 * winners.length) * mult);
  function feedLine(html, cls = '') {
    const row = h('div', `cr-g${cls ? ` ${cls}` : ''}`, html);
    win.feed.prepend(row);
    while (win.feed.children.length > 14) win.feed.lastElementChild.remove();
  }
  function run(ev) {
    if (ev.win) {
      winners.push(ev.who);
      feedLine(`${dot(ev.who)}<b>✓ ${esc(ev.who)} ${guessed(ev.who)}!</b>`, 'is-yes');
      snd('right');
      win.count.textContent = `${winners.length} из 5 угадали`;
      win.score.textContent = String(scoreNow());
      win.score.parentElement.classList.remove('is-bump');
      void win.score.offsetWidth;
      win.score.parentElement.classList.add('is-bump');
    } else {
      feedLine(`${dot(ev.who)}<b>${esc(ev.who)}</b><span>${esc(ev.say)}</span>`);
    }
  }

  // ---- итоги раунда
  function finish() {
    phase = 'end';
    cur = null;
    const rows = winners.map((who, i) => `<tr><td>${placeHtml(i + 1)}</td><td><span class="k-who">${jelly(who, 28)}${esc(who)}</span></td><td class="k-r">+${ptsAt(i, mult)}</td></tr>`).join('')
      || '<tr><td colspan="3" class="k-dim">Никто не угадал</td></tr>';
    const total = scoreNow();
    const scrim = h('div', 'k-scrim cr-scrim');
    scrim.innerHTML = `<section class="k-window mo-results is-in" role="dialog" aria-label="Итоги раунда">
      <div class="k-results-head"><p class="k-eyebrow">Крокодил · раунд 1 из 5</p><h2 class="k-results-title">Раунд окончен</h2><p class="k-results-sub">Слово: <b>${esc(word.w.toUpperCase())}</b> · рисунок угадали ${winners.length} из 5</p></div>
      <div class="k-win-body"><table class="k-table"><thead><tr><th>Место</th><th>Угадал</th><th class="k-r">Очки</th></tr></thead><tbody>${rows}
        <tr class="is-own"><td>${placeHtml(0)}</td><td><span class="k-who">${jelly(ME, 28)}${ME} · рисовал</span></td><td class="k-r">+${total}</td></tr></tbody></table></div>
      <div class="k-results-actions"><button type="button" class="k-btn k-btn--go cr-again">Выбрать слово ещё раз</button><button type="button" class="k-btn k-btn--ghost cr-leave">К сцене${keyHtml('Esc', 'tr', 'sm')}</button></div>
    </section>`;
    hud.replaceChildren(scrim);
    snd(winners.length ? 'fanfare' : 'close');
    scrim.querySelector('.cr-again').addEventListener('click', () => { snd('click'); triple = WORDS.map((g) => pick(g)); renderPick(); });
    scrim.querySelector('.cr-leave').addEventListener('click', () => { snd('close'); renderIdle(); });
  }

  // ---- ушёл из раунда: подсказка «Хочу рисовать» у мольберта
  function renderIdle() {
    phase = 'idle';
    cur = null;
    hud.replaceChildren();
    const slot = h('div', 'k-slot k-slot--bc');
    slot.innerHTML = `<button type="button" class="k-prompt cr-go">${keyHtml('E')}Хочу рисовать<span class="k-prompt-sep"></span><span class="k-prompt-note">перед тобой 1 человек</span></button>`;
    hud.append(slot);
    slot.querySelector('.cr-go').addEventListener('click', () => begin());
  }
  function begin() { snd('open'); triple = WORDS.map((g) => pick(g)); renderPick(); }

  renderPick();

  return {
    tick(dt) {
      if (phase === 'pick') {
        t += dt;
        const left = PICK - t;
        const sec = Math.ceil(left);
        if (pickEls.time && pickEls.time.dataset.s !== String(sec)) { pickEls.time.dataset.s = String(sec); pickEls.time.textContent = `0:${String(Math.max(0, sec)).padStart(2, '0')}`; }
        setMeter(pickEls.meter, left / PICK);
        if (left <= 0) choose(Math.floor(Math.random() * 3));
      } else if (phase === 'draw' && !asking) {
        t += dt;
        const left = ROUND - t;
        const sec = Math.ceil(left);
        if (sec !== shownSec) {
          shownSec = sec;
          win.clock.textContent = fmt(left);
          win.clock.parentElement.classList.toggle('is-hurry', left <= 10);
          win.meter.classList.toggle('is-hurry', left <= 10);
          if (left <= 3 && left > 0) snd('tick');
        }
        setMeter(win.meter, left / ROUND);
        // боты угадывают только то, что нарисовано: нет рисунка — часы ботов стоят, верный ответ ждёт хотя бы трёх штрихов
        if (paper.strokes.length) bt += dt;
        while (planI < plan.length && plan[planI].t <= bt && (!plan[planI].win || paper.strokes.length >= 3)) run(plan[planI++]);
        if (left <= 0 || winners.length >= 5) finish();
      }
    },
    stop() {
      document.removeEventListener('keydown', onKey);
      easel.el.remove();
      hud.replaceChildren();
    },
  };
}

// ------------------------------------------------------------------ вид «Я угадываю»

function guessView({ st, snd, again, shown: isShown }) {
  const WORD = 'парусник';
  const ANS = ['парусник', 'парусная лодка', 'парусная яхта'];
  const DRAWER = 'Барон';
  const HINTS = [{ at: 40, i: 0 }, { at: 60, i: 4 }];     // на 40-й и 20-й секунде до конца открывается по букве
  // что говорят боты-угадывающие: «мимо» видят все, верные — только отметкой «угадал» (слово не видно)
  const SCRIPT = [
    { t: 9, who: 'Санёк', say: 'корабль' }, { t: 16, who: 'Оля', say: 'пароход' }, { t: 24, who: 'Тёма', say: 'плот' },
    { t: 31, who: 'ОченьДлинныйНик', say: 'утка' }, { t: 38, who: 'Санёк', say: 'шхуна' }, { t: 47, who: 'Оля', win: true },
    { t: 52, who: 'Тёма', say: 'катер' }, { t: 58, who: 'Санёк', win: true }, { t: 66, who: 'ОченьДлинныйНик', win: true }, { t: 74, who: 'Тёма', win: true },
  ];
  const paper = new Paper();
  const shown = RECORDED.rec.map(() => 0);
  let T = 0, done = false, me = null, hi = 0, scriptI = 0, shownSec = -1;
  const order = [];                 // кто угадал, по порядку: { who, me? }
  const open = new Set();           // открытые буквы

  // мольберт на сцене: тот же рисунок, в перспективе доски (под HUD, над фоном)
  const easel = mountEasel(st);
  paper.ctx.push(easel.ctx);

  st.hud.replaceChildren();
  const toast = toaster(st.hud);
  st.hud.insertAdjacentHTML('beforeend', `
    <div class="k-slot k-slot--tr">
      <section class="k-plate cr-board" aria-label="Рисунок">
        <header class="cr-board-head">
          <span class="cr-av">${jelly(DRAWER, 34)}</span>
          <span class="cr-who">Рисует <b>${DRAWER}</b></span>
          <span class="cr-time">${iconImg('stopwatch')}<b>${fmt(ROUND)}</b></span>
        </header>
        <div class="cr-letters" role="img" aria-label="Слово из ${WORD.length} букв"></div>
        ${meterHtml(1, 'mode', 'k-meter--thin cr-meter')}
        <div class="cr-paper"><canvas class="cr-canvas" width="${W}" height="${H}" aria-label="Рисунок рисующего"></canvas></div>
      </section>
    </div>
    <div class="k-slot k-slot--bl">
      <div class="k-chat cr-chat">
        <div class="k-chat-list cr-list"></div>
        <div class="k-chat-bar">
          <button class="k-voice cr-voice" type="button" aria-label="Голос"><img src="img/icons/voice.webp" alt="" draggable="false">${keyHtml('V', undefined, 'sm')}</button>
          <label class="k-chat-input is-typing"><span>В игру:</span><input type="text" maxlength="40" placeholder="Что нарисовано?" autocomplete="off" spellcheck="false" aria-label="Догадка"><i class="k-caret cr-caret"></i>${keyHtml('Enter')}</label>
        </div>
      </div>
    </div>`);
  const q = (s) => st.hud.querySelector(s);
  const ui = { letters: q('.cr-letters'), time: q('.cr-time b'), board: q('.cr-board'), meter: q('.cr-meter'), list: q('.cr-list'), input: q('.k-chat-input input'), canvas: q('.cr-canvas') };
  paper.add(ui.canvas);

  function letters() {
    const all = done || !!me;                  // слово целиком — тому, кто угадал, и после раунда
    ui.letters.innerHTML = [...WORD].map((ch, i) => `<span class="cr-l${all || open.has(i) ? ' is-open' : ''}${all ? ' is-end' : ''}">${all || open.has(i) ? esc(ch.toUpperCase()) : ''}</span>`).join('');
  }
  letters();
  const say = (nick, text, cls = '') => {
    ui.list.append(chatLine(nick, text, cls));
    while (ui.list.children.length > 7) ui.list.firstElementChild.remove();
  };

  function giveUp() {
    // все угадали или время вышло
    done = true;
    letters();
    results();
  }
  function bot(ev) {
    if (ev.win) {
      order.push({ who: ev.who });
      toast({ tone: 'good', icon: 'paint', title: `✓ ${ev.who} ${guessed(ev.who)}!` });
      snd('right');
      if (order.length >= 5) giveUp();
    } else {
      say(ev.who, ev.say);
    }
  }
  function guess(v) {
    if (done) return;
    if (me) {                                                          // после своей отгадки — только угадавшим
      const row = chatLine(ME, v, 'cr-quiet');
      row.insertAdjacentHTML('beforeend', '<span class="cr-only">видят угадавшие</span>');
      ui.list.append(row);
      while (ui.list.children.length > 7) ui.list.firstElementChild.remove();
      return;
    }
    const r = checkAnswer(v, ANS);
    if (r === 'yes') {
      const i = order.length;
      me = { i, pts: ptsAt(i) };
      order.push({ who: ME, me: true });
      toast({ tone: 'reward', icon: 'medal-gold', title: `✓ Ты угадал! +${me.pts}`, sub: 'Слово открыто — дальше пиши угадавшим' });
      snd('right');
      ui.input.placeholder = 'Пиши угадавшим';
      letters();
      if (order.length >= 5) giveUp();
    } else if (r === 'close') {
      const row = chatLine(ME, v, 'cr-near');
      row.insertAdjacentHTML('beforeend', ' <span class="k-pill k-pill--gold k-pill--xs">Почти!</span><span class="cr-only">видишь только ты</span>');
      ui.list.append(row);
      while (ui.list.children.length > 7) ui.list.firstElementChild.remove();
      snd('warm');
    } else {
      say(ME, v);
    }
  }
  ui.input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); const v = ui.input.value.trim(); ui.input.value = ''; if (v) guess(v); }
    else if (e.key === 'Escape') { ui.input.value = ''; ui.input.blur(); }
  });
  ui.input.addEventListener('keyup', (e) => e.stopPropagation());

  // ---- итоги раунда
  let scrim = null;
  function results() {
    const rows = order.map((o, i) => `<tr${o.me ? ' class="is-own"' : ''}><td>${placeHtml(i + 1)}</td><td><span class="k-who">${jelly(o.who, 28)}${esc(o.who)}</span></td><td class="k-r">+${ptsAt(i)}</td></tr>`).join('');
    const drawerPts = Math.min(10, 2 * order.length);
    scrim = h('div', 'k-scrim cr-scrim');
    scrim.innerHTML = `<section class="k-window mo-results is-in" role="dialog" aria-label="Итоги раунда">
      <div class="k-results-head"><p class="k-eyebrow">Крокодил · рисовал ${DRAWER}</p><h2 class="k-results-title${me ? '' : ' is-lose'}">${me ? 'Ты угадал!' : 'Время вышло'}</h2><p class="k-results-sub">Это был <b>${WORD.toUpperCase()}</b></p></div>
      <div class="k-win-body"><table class="k-table"><thead><tr><th>Место</th><th>Угадал</th><th class="k-r">Очки</th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="k-dim">Никто не угадал</td></tr>'}
        <tr><td>${placeHtml(0)}</td><td><span class="k-who">${jelly(DRAWER, 28)}${DRAWER} · рисовал</span></td><td class="k-r">+${drawerPts}</td></tr></tbody></table></div>
      <div class="k-results-actions"><button type="button" class="k-btn k-btn--go cr-again">Ещё раунд</button><button type="button" class="k-btn k-btn--ghost cr-leave">К сцене${keyHtml('Esc', 'tr', 'sm')}</button></div>
    </section>`;
    st.hud.append(scrim);
    snd(me ? 'fanfare' : 'close');
    scrim.querySelector('.cr-again').addEventListener('click', () => { snd('click'); again(); });
    scrim.querySelector('.cr-leave').addEventListener('click', () => { snd('close'); scrim.remove(); });
  }
  const onKey = (e) => { if (e.code === 'Escape' && isShown() && scrim?.isConnected) { snd('close'); scrim.remove(); } };
  document.addEventListener('keydown', onKey);

  return {
    tick(dt) {
      if (done) return;
      T += dt;
      const left = ROUND - T;
      // рисунок рисуется сам
      RECORDED.rec.forEach((s, k) => {
        if (T < s.t0) return;
        const n = Math.min(s.pts.length, Math.floor(Math.min(1, (T - s.t0) / s.d) * s.pts.length) + 1);
        if (n <= shown[k]) return;
        let live = paper.strokes[k];
        if (!live) { live = paper.strokes[k] = { c: s.c, w: s.w, e: false, pts: [] }; }
        const from = shown[k];
        for (let i = from; i < n; i++) live.pts.push(s.pts[i]);
        paper.seg(live, Math.max(0, from - 1), n - 1);
        shown[k] = n;
      });
      // подсказки-буквы
      while (hi < HINTS.length && T >= HINTS[hi].at) { open.add(HINTS[hi].i); hi++; letters(); }
      // таймер
      const sec = Math.ceil(left);
      if (sec !== shownSec) {
        shownSec = sec;
        ui.time.textContent = fmt(left);
        ui.time.parentElement.classList.toggle('is-hurry', left <= 10);
        ui.meter.classList.toggle('is-hurry', left <= 10);
        if (left <= 3 && left > 0) snd('tick');
      }
      setMeter(ui.meter, left / ROUND);
      while (scriptI < SCRIPT.length && SCRIPT[scriptI].t <= T) bot(SCRIPT[scriptI++]);
      if (!done && left <= 0) giveUp();
    },
    stop() { document.removeEventListener('keydown', onKey); easel.el.remove(); st.hud.replaceChildren(); },
  };
}
