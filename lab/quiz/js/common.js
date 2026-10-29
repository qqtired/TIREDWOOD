// Общие детали страницы-обзора «Ракушка»: сцена 1440×900 в масштабе, разметка кита (клавиши, мышь, монетка, полоса),
// условные игроки-желейки, звуки-заглушки (WebAudio, без файлов). Разделы — модули js/<раздел>.js с export mount(el).
// Разметку кита повторяем из client/ui/kit/dom.ts и modes.ts — чтобы макет выглядел ровно как игра.

/** Экранирование чужого текста для строк разметки */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Элемент: h('div', 'k-plate', '<b>…</b>') */
export function h(tag, cls = '', html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

const classes = (...a) => a.filter(Boolean).join(' ');

/** Клавиша-колпачок кита: keyHtml('E'), keyHtml('Esc', 'tr', 'sm') */
export function keyHtml(k, corner, size) {
  return `<kbd class="${classes('k-key', size && `k-key--${size}`, corner && `k-key--${corner}`)}">${esc(k)}</kbd>`;
}

const MOUSE = { 'ЛКМ': 'l', 'ПКМ': 'r', 'Колесо': 'w' };
/** Клавиша или мышь: capHtml('ЛКМ') рисует мышь */
export function capHtml(k, cls = '') {
  const m = MOUSE[k];
  const c = `k-key${cls ? ` ${cls}` : ''}`;
  return m ? `<kbd class="${c}"><i class="k-mouse k-mouse--${m}" aria-label="${k}"></i></kbd>` : `<kbd class="${c}">${esc(k)}</kbd>`;
}

/** Иконка интерфейса из img/icons/<id>.webp (копии client/assets/ui/icons) */
export function iconImg(id, cls = 'k-ic') {
  return `<img class="${cls}" src="img/icons/${id}.webp" alt="" draggable="false">`;
}

/** Монетка-жетон */
export function coinHtml(cls) {
  return `<img class="${classes('k-coin', cls)}" src="img/icons/token.webp" alt="" draggable="false">`;
}

/** Текст «+15 🪙» → разметка с монеткой кита */
export function coinText(text) {
  return esc(text).replace(/🪙/gu, coinHtml());
}

/** Полоса 0…1 кита: meterHtml(.6, 'good') */
export function meterHtml(v, tone, cls) {
  const k = Math.round(Math.min(1, Math.max(0, v || 0)) * 1000) / 1000;
  return `<span class="${classes('k-meter', tone && `k-meter--${tone}`, cls)}" style="--v:${k}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span>`;
}
export function setMeter(el, v) {
  el.style.setProperty('--v', String(Math.round(Math.min(1, Math.max(0, v || 0)) * 1000) / 1000));
}

/** Место кружком; 1–3 — медалью */
export function placeHtml(n) {
  return `<span class="k-place${n >= 1 && n <= 3 ? ` k-place--${n}` : ''}">${n > 0 ? n : '—'}</span>`;
}

/** Условные игроки для макетов: ник, цвет желейки, шляпа */
export const PLAYERS = [
  { nick: 'Кракозябра', color: '#ff8a1c', hat: 'straw' },
  { nick: 'Барон', color: '#8b5cf6' },
  { nick: 'Оля', color: '#ff5fa2', hat: 'bow' },
  { nick: 'Санёк', color: '#2fbf71' },
  { nick: 'Пломбир', color: '#ffe3a3' },
  { nick: 'Тёма', color: '#ef4444', hat: 'cap' },
  { nick: 'Мурка', color: '#14b8a6' },
  { nick: 'Вася_рыбак', color: '#f97316', hat: 'straw' },
  { nick: 'Ксю', color: '#e879f9' },
  { nick: 'Дед Мороз', color: '#60a5fa' },
  { nick: 'Капитан', color: '#a3e635', hat: 'cap' },
  { nick: 'ОченьДлинныйНик', color: '#fb7185' },
];

/** Затейник — житель-ведущий */
export const HOST = { nick: 'Затейник', color: '#6ee7b7', hat: 'boater', img: 'img/zatejnik.png' };

/** Портрет-желейка SVG (для карточек, полосы счёта, ленты). size — px */
export function jellySvg(color, size = 40, opts = {}) {
  const { mood = 'happy', hat = '' } = opts;
  const mouth = mood === 'sad'
    ? '<path d="M23 41 q5 -4 10 0" stroke="#3b2430" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
    : mood === 'wow'
      ? '<ellipse cx="28" cy="41" rx="3.2" ry="4" fill="#3b2430"/>'
      : '<path d="M22.5 38.5 q5.5 6 11 0" stroke="#3b2430" stroke-width="2.4" fill="#ff8fa3" stroke-linecap="round"/>';
  const hats = {
    straw: '<ellipse cx="28" cy="13" rx="19" ry="4.6" fill="#e9c27a"/><path d="M17 13 q11 -14 22 0z" fill="#f2d08d"/><rect x="18" y="9.5" width="20" height="3.6" rx="1.6" fill="#e2483d"/>',
    boater: '<ellipse cx="28" cy="13.5" rx="18" ry="4" fill="#e9c27a"/><rect x="18" y="5" width="20" height="9" rx="2" fill="#f2d08d"/><rect x="18" y="9.6" width="20" height="3.4" fill="#e2483d"/>',
    cap: '<path d="M14 15 q14 -16 28 0z" fill="#e2483d"/><path d="M38 14 q8 0 10 3 l-12 0z" fill="#b8322a"/>',
    bow: '<path d="M30 10 l8 -5 v10z M30 10 l-8 -5 v10z" fill="#ff4f8b"/><circle cx="30" cy="10" r="2.6" fill="#e0306f"/>',
  };
  return `<svg class="qz-jelly" width="${size}" height="${size}" viewBox="0 0 56 56" aria-hidden="true">
    <defs><radialGradient id="g${color.slice(1)}" cx="35%" cy="28%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".25" stop-color="${color}" stop-opacity=".95"/><stop offset="1" stop-color="${color}"/></radialGradient></defs>
    <path d="M28 6 C14 6 9 19 9 31 C9 44 15 52 28 52 C41 52 47 44 47 31 C47 19 42 6 28 6 Z" fill="url(#g${color.slice(1)})" stroke="rgba(0,0,0,.18)" stroke-width="1.5"/>
    <ellipse cx="21" cy="17" rx="5" ry="3" fill="#fff" opacity=".55"/>
    <ellipse cx="22" cy="30" rx="3" ry="3.8" fill="#2b1d24"/><ellipse cx="34" cy="30" rx="3" ry="3.8" fill="#2b1d24"/>
    <circle cx="23" cy="28.6" r="1.1" fill="#fff"/><circle cx="35" cy="28.6" r="1.1" fill="#fff"/>
    <ellipse cx="16.5" cy="36" rx="3.4" ry="2.2" fill="#ff7a8a" opacity=".55"/><ellipse cx="39.5" cy="36" rx="3.4" ry="2.2" fill="#ff7a8a" opacity=".55"/>
    ${mouth}${hats[hat] ?? ''}
  </svg>`;
}

// ------------------------------------------------------------------ сцена 1440×900 в масштабе страницы

const stages = new Set();
function fit(st) {
  const w = st.frame.clientWidth;
  if (!w) return;
  st.scale.style.transform = `scale(${w / 1440})`;
}
let resizeT = 0;
addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => stages.forEach(fit), 120);
});

/**
 * Сцена-рамка: заголовок, пояснение, кнопки и экран 1440×900, который масштабируется под ширину страницы.
 * makeStage(mount, { title, note, bg: 'img/venue-shell.jpg', tag: 'Вид игрока', controls: [{label, pressed, onClick}] })
 * → { root, frame, scale, bg, hud, ctl, setTag(text) }. В scale клади слои игры; hud — готовый .k-hud.
 */
export function makeStage(mount, opts = {}) {
  const root = h('div', 'qz-stage');
  const cap = h('div', 'qz-cap');
  const titles = h('div', 'qz-cap-titles');
  if (opts.title) titles.append(h('h3', 'qz-cap-t', esc(opts.title)));
  if (opts.note) titles.append(h('p', 'qz-cap-n', opts.note));
  const ctl = h('div', 'qz-ctl');
  cap.append(titles, ctl);
  const frame = h('div', 'qz-frame');
  const scale = h('div', 'qz-scale');
  const bg = h('div', 'qz-bg');
  if (opts.bg) bg.style.backgroundImage = `url(${opts.bg})`;
  const hud = h('div', 'k-hud');
  scale.append(bg, hud);
  frame.append(scale);
  const tag = h('div', 'qz-tag');
  if (opts.tag) tag.textContent = opts.tag;
  else tag.hidden = true;
  frame.append(tag);
  root.append(cap, frame);
  mount.append(root);
  for (const c of opts.controls ?? []) {
    const b = h('button', 'pg-btn', esc(c.label));
    b.type = 'button';
    if (c.pressed !== undefined) b.setAttribute('aria-pressed', String(!!c.pressed));
    b.addEventListener('click', () => c.onClick?.(b));
    ctl.append(b);
  }
  const st = { root, frame, scale, bg, hud, ctl, setTag(t) { tag.hidden = !t; tag.textContent = t ?? ''; } };
  stages.add(st);
  new ResizeObserver(() => fit(st)).observe(frame);
  fit(st);
  return st;
}

/** Сегмент-переключатель страницы: segButtons(ctl, ['Игрок','Ведущий'], 0, (i) => …) */
export function segButtons(parent, labels, on, cb) {
  const btns = labels.map((l, i) => {
    const b = h('button', 'pg-btn', esc(l));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(i === on));
    b.addEventListener('click', () => {
      btns.forEach((x, j) => x.setAttribute('aria-pressed', String(j === i)));
      cb(i);
    });
    parent.append(b);
    return b;
  });
  return btns;
}

// ------------------------------------------------------------------ звук-заглушка (как sfx кита, без файлов)

let ac = null;
let muted = false;
export function setMuted(v) { muted = v; }
function tone(freq, dur, type = 'sine', vol = 0.07, when = 0, slide = 0) {
  if (muted) return;
  try {
    ac ??= new AudioContext();
    const t = ac.currentTime + when;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { /* звук не обязателен */ }
}
/** sfx.play('click'|'buzz'|'right'|'wrong'|'tick'|'pop'|'warm'|'cold'|'fanfare'|'open'|'close'|'reward') */
export const sfx = {
  play(name) {
    switch (name) {
      case 'click': return tone(660, 0.05, 'triangle', 0.05);
      case 'open': return tone(520, 0.08, 'triangle', 0.05), tone(780, 0.08, 'triangle', 0.04, 0.06);
      case 'close': return tone(620, 0.07, 'triangle', 0.04), tone(420, 0.08, 'triangle', 0.035, 0.05);
      case 'buzz': return tone(880, 0.09, 'square', 0.05), tone(1320, 0.16, 'triangle', 0.05, 0.07);
      case 'right': return tone(660, 0.1, 'triangle', 0.06), tone(880, 0.1, 'triangle', 0.06, 0.09), tone(1100, 0.2, 'triangle', 0.06, 0.18);
      case 'wrong': return tone(180, 0.28, 'sawtooth', 0.035, 0, -40);
      case 'tick': return tone(1200, 0.03, 'square', 0.025);
      case 'pop': return tone(500, 0.06, 'sine', 0.06, 0, 300);
      case 'warm': return tone(740, 0.12, 'sine', 0.05), tone(990, 0.16, 'sine', 0.04, 0.08);
      case 'cold': return tone(220, 0.12, 'triangle', 0.045, 0, -60);
      case 'reward': return tone(990, 0.08, 'triangle', 0.05), tone(1320, 0.14, 'triangle', 0.05, 0.07);
      case 'fanfare': return [523, 659, 784, 1046].forEach((f, i) => tone(f, i === 3 ? 0.4 : 0.12, 'triangle', 0.06, i * 0.11));
      default: return undefined;
    }
  },
};

// ------------------------------------------------------------------ мелочи для ботов

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Проверка ответа как задумана в shared/quiz/answer.ts (упрощённо для макетов): 'yes' | 'close' | 'no' */
export function checkAnswer(guess, answers) {
  const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/\(.*?\)/g, ' ').replace(/[«»"'.,!?;:()\-–—]/g, ' ').replace(/\s+/g, ' ').trim();
  const g = norm(guess);
  if (!g) return 'no';
  let best = 'no';
  for (const raw of [].concat(answers).flatMap((a) => String(a).split('/'))) {
    const a = norm(raw);
    if (!a) continue;
    if (g === a) return 'yes';
    const d = lev(g, a);
    const lim = a.length >= 8 ? 2 : a.length >= 4 ? 1 : 0;
    if (d <= lim) return 'yes';
    if (d <= lim + 2 || (a.length >= 4 && (g.includes(a) || a.includes(g)) && g.length >= 3)) best = 'close';
  }
  return best;
}
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
