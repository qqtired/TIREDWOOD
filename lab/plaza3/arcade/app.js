// Страница лаборатории «Аркада у автоматов»: ряд автоматов с демо на экранах и окно игры за выбранным автоматом.
// Рекорды здесь — только в localStorage этой страницы; в игре их считает и хранит сервер (см. design.md).
import * as castle from './games/castle.js';
import { MEDALS, createSfx, medalOf } from './games/kit.js';
import * as tir from './games/tir.js';
import * as train from './games/train.js';

const GAMES = [
  { mod: train, theme: 'train' },
  { mod: tir, theme: 'tir', banner: 'Саня' },
  { mod: castle, theme: 'castle' },
];
const SLOTS = 6;

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* приватное окно — без рекордов */
    }
  },
};
const bestKey = (id) => `tw-arcade-best-${id}`;

const sfx = createSfx();
sfx.muted = store.get('tw-arcade-mute', false);

const $ = (id) => document.getElementById(id);
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
}

// ---------------------------------------------------------------- ряд автоматов

const hall = $('hall');
const minis = [];

GAMES.forEach((g, i) => {
  const m = g.mod.meta;
  const canvas = el('canvas', { width: 640, height: 480, 'aria-hidden': 'true' });
  const best = store.get(bestKey(m.id), 0);
  const cap = el('span', { class: 'bay-best' }, best ? `Твой рекорд ${best}` : 'Ещё не играл');
  const bay = el(
    'button',
    { type: 'button', class: `bay cab mini theme-${g.theme}`, 'aria-label': `${m.title} — играть`, onclick: () => open(i) },
    el('span', { class: 'cab-marquee' }, el('span', { class: 'cab-title' }, m.title)),
    el(
      'span',
      { class: 'cab-body' },
      el('span', { class: 'cab-bezel' }, el('span', { class: 'cab-screen' }, canvas)),
      el('span', { class: 'cab-deck deco' }, el('i', { class: 'stick' }), el('i', { class: 'knob a' }), el('i', { class: 'knob b' })),
    ),
    el('span', { class: 'cab-base' }, el('i', { class: 'coin' })),
    el('span', { class: 'bay-cap' }, el('b', {}, m.title), el('span', {}, m.like), cap, el('kbd', {}, String(i + 1))),
  );
  hall.append(bay);
  const game = g.mod.createGame(canvas, { interactive: false, startHint: 'НАЖМИ — ИГРАТЬ', best, banner: g.banner ?? '' });
  minis.push({ game, cap });
});
for (let i = GAMES.length; i < SLOTS; i++) {
  hall.append(el('div', { class: 'bay empty', 'aria-hidden': 'true' }, el('span', { class: 'empty-shape' }), el('span', { class: 'bay-cap' }, el('b', {}, 'Скоро'), el('span', {}, 'место под автомат'))));
}

// таблица медалей в «Наградах»
const mt = $('medal-table');
for (let md = 1; md <= 3; md++) {
  const tr = el('tr', {}, el('th', {}, el('i', { class: `dot m${md}` }), MEDALS[md].name));
  for (const g of GAMES) tr.append(el('td', {}, `${g.mod.meta.medals[md - 1]} `, el('b', { class: 'c' }, `+${g.mod.meta.coins[md - 1]}`)));
  mt.append(tr);
}

// ---------------------------------------------------------------- окно игры

const play = $('play');
const screen = $('screen');
const bigCab = $('big-cab');
const btn = { start: $('btn-start'), pause: $('btn-pause'), restart: $('btn-restart'), sound: $('btn-sound'), exit: $('btn-exit'), x: $('btn-x') };
let cur = null;

function soundLabel() {
  btn.sound.title = sfx.muted ? 'Звук выключен' : 'Звук включён';
  btn.sound.classList.toggle('off', sfx.muted);
}
soundLabel();

function setMode(mode) {
  if (!cur) return;
  const live = mode === 'play' || mode === 'count';
  btn.pause.disabled = !(live || mode === 'paused');
  btn.pause.querySelector('span').textContent = mode === 'paused' ? 'Дальше' : 'Пауза';
  btn.start.querySelector('span').textContent = mode === 'over' ? 'Ещё раз' : 'Играть';
  btn.start.disabled = live || mode === 'paused';
  screen.style.cursor = live ? cur.g.mod.meta.cursor : 'pointer';
}

function showBest(m) {
  const best = store.get(bestKey(m.id), 0);
  $('play-best').textContent = best ? String(best) : '—';
  const md = medalOf(best, m.medals);
  $('play-best-medal').textContent = best && md ? MEDALS[md].name : '';
  $('play-best-medal').className = `medal-name m${md}`;
}

function fillSide(m) {
  $('big-title').textContent = m.title;
  $('play-title').textContent = m.title;
  $('play-like').textContent = m.like;
  $('play-rules').replaceChildren(...m.rules.map((r) => el('li', {}, r)));
  $('play-ctrl').replaceChildren(...m.controls.map(([k, t]) => el('li', {}, el('kbd', {}, k), el('span', {}, t))));
  $('play-medals').replaceChildren(
    ...[1, 2, 3].map((md) => el('li', {}, el('i', { class: `dot m${md}` }), el('b', {}, MEDALS[md].name), el('span', {}, `от ${m.medals[md - 1]}`), el('em', {}, `+${m.coins[md - 1]} 🪙`))),
  );
  $('play-scoring').textContent = m.scoring;
  $('play-last').hidden = true;
  $('play-check').hidden = true;
  showBest(m);
}

function onEnd(g, r) {
  const m = g.mod.meta;
  const best = store.get(bestKey(m.id), 0);
  const record = r.score > best && r.score > 0;
  if (record) store.set(bestKey(m.id), r.score);
  showBest(m);
  const mini = minis[GAMES.indexOf(g)];
  const nb = Math.max(best, r.score);
  mini.game.setBest(nb);
  mini.cap.textContent = nb ? `Твой рекорд ${nb}` : 'Ещё не играл';
  const coins = (r.medal ? m.coins[r.medal - 1] : 0) + (record ? 10 : 0);
  const last = $('play-last');
  last.hidden = false;
  last.textContent = `Партия: ${r.score} · ${r.medal ? MEDALS[r.medal].name : 'без медали'}${record ? ' · новый рекорд!' : ''} — в игре было бы ${coins ? `+${coins} 🪙` : '0 🪙'}`;
  // Проверка, как на сервере: та же логика, то же зерно, журнал нажатий — и свой счёт
  const t0 = performance.now();
  const chk = g.mod.replay(r.seed, r.log, r.ticks);
  const ms = Math.max(1, Math.round(performance.now() - t0));
  const ok = chk.score === r.score;
  const check = $('play-check');
  check.hidden = false;
  check.classList.toggle('bad', !ok);
  check.textContent = ok
    ? `✓ Сервер переиграл бы партию по журналу (${r.log.length} нажатий, ${ms} мс) — тоже ${chk.score}`
    : `✗ Повтор дал ${chk.score}, а на экране ${r.score} — расхождение`;
  window.__arcade.checks.push({ game: m.id, score: r.score, replay: chk.score, events: r.log.length, ticks: r.ticks, aborted: r.aborted });
}

function open(i) {
  if (cur) close();
  const g = GAMES[i];
  const m = g.mod.meta;
  for (const x of minis) x.game.setRunning(false);
  bigCab.className = `cab big theme-${g.theme}`;
  fillSide(m);
  play.hidden = false;
  document.body.classList.add('playing');
  const game = g.mod.createGame(screen, {
    interactive: true,
    startHint: 'ПРОБЕЛ — ИГРАТЬ',
    best: store.get(bestKey(m.id), 0),
    sfx: (n) => sfx.play(n),
    onMode: (mode) => setMode(mode),
    onEnd: (r) => onEnd(g, r),
  });
  cur = { g, game, i };
  setMode(game.mode);
  screen.focus({ preventScroll: true });
}

function close() {
  if (!cur) return;
  cur.game.finish();
  cur.game.destroy();
  cur = null;
  play.hidden = true;
  document.body.classList.remove('playing');
  for (const x of minis) x.game.setRunning(true);
}

function toggleMute() {
  sfx.muted = !sfx.muted;
  store.set('tw-arcade-mute', sfx.muted);
  soundLabel();
}

btn.start.addEventListener('click', () => cur && cur.game.start());
btn.pause.addEventListener('click', () => cur && cur.game.togglePause());
btn.restart.addEventListener('click', () => cur && cur.game.restart());
btn.sound.addEventListener('click', toggleMute);
btn.exit.addEventListener('click', close);
btn.x.addEventListener('click', close);

const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!cur) {
    const n = Number(e.key);
    if (n >= 1 && n <= GAMES.length) open(n - 1);
    return;
  }
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Escape') return close();
  if (e.code === 'KeyM') return toggleMute();
  if (e.code === 'KeyP') return cur.game.togglePause();
  if (e.code === 'KeyR') return cur.game.restart();
  if (e.code === 'Space' && document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
  cur.game.key(e.code, true);
});
addEventListener('keyup', (e) => {
  if (cur) cur.game.key(e.code, false);
});
addEventListener('blur', () => cur && cur.game.pause());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && cur) cur.game.pause();
  for (const x of minis) x.game.setRunning(!document.hidden && !cur);
});

// Для проверки в headless Chrome
window.__arcade = { open, close, games: GAMES.map((g) => g.mod.meta.id), get current() { return cur && cur.game; }, checks: [] };
