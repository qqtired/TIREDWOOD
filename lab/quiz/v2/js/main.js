// Страница-обзор v2: режимы вкладками, у каждого — кадры игры по шагам. Кадр = 1440×900 «экран игры»,
// который целиком масштабируется под окно (?shot — кадр на весь экран, для снимков).
import { Stage, SW, SH } from './stage.js';
import { Hud } from './hud.js';
import { sfx } from './sfx.js';
import { RIDDLE } from './riddle.js';
import { CROC, JEOPARDY, WHOOFUS } from './others.js';
import { VOTE } from './vote.js';

const MODES = [VOTE, RIDDLE, JEOPARDY, CROC, WHOOFUS];
const SOON = [];
const ICONS = { warm: 'img/q-warm.png', miss: 'img/q-miss.png', win: 'img/q-win.png', scroll: '../../../client/assets/ui/icons/scroll.webp', chat: '../../../client/assets/ui/icons/chat.webp', stopwatch: '../../../client/assets/ui/icons/stopwatch.webp', cat: '../../../client/assets/ui/icons/collection.webp' };

const q = new URLSearchParams(location.search);
const SHOT = q.has('shot');
document.documentElement.classList.toggle('is-shot', SHOT);

const root = document.querySelector('.st');
const inner = root.querySelector('.st-inner');
const stage = new Stage(inner);
const hudRoot = inner.querySelector('.k-hud');
const layer = inner.querySelector('.st-layer');
const capEl = document.querySelector('.pg-cap');
const stepsEl = document.querySelector('.pg-steps');
const tabsEl = document.querySelector('.pg-tabs');
const me = { nick: 'Тимофей', level: 9, tokens: 1250, color: '#ff7a5c' };

let mode = MODES[0];
let stepIdx = 0;
let run = null;
const data = {};

async function loadIcons() {
  const out = {};
  await Promise.all(Object.entries(ICONS).map(async ([k, src]) => { const i = new Image(); i.src = src; try { await i.decode(); } catch { /* нет — без значка */ } out[k] = i; }));
  return out;
}

function fit() {
  const pad = SHOT ? 0 : 0;
  const box = root.getBoundingClientRect();
  const k = Math.min((box.width - pad) / SW, (box.height - pad) / SH);
  inner.style.transform = `translate(-50%, -50%) scale(${k})`;
}
new ResizeObserver(fit).observe(root);

function tabs() {
  tabsEl.innerHTML = [...MODES.map((m) => `<button class="k-tab${m === mode ? ' is-on' : ''}" data-m="${m.id}" type="button">${m.title}</button>`),
    ...SOON.map((m) => `<button class="k-tab" data-m="${m.id}" type="button" disabled title="следующим шагом">${m.title} <span class="k-tab-count">скоро</span></button>`)].join('');
}
tabsEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-m]');
  const m = MODES.find((k) => k.id === b?.dataset.m);
  if (m && m !== mode) { mode = m; tabs(); go(0); }
});

function steps() {
  stepsEl.innerHTML = `<button class="k-btn k-btn--ghost k-btn--sm pg-prev" type="button" aria-label="Назад"${stepIdx === 0 ? ' disabled' : ''}>←</button>` +
    mode.steps.map((s, i) => `<button class="pg-step${i === stepIdx ? ' is-on' : ''}" data-i="${i}" type="button"><b>${i + 1}</b><span>${s.title}</span></button>`).join('') +
    `<button class="k-btn k-btn--ghost k-btn--sm pg-next" type="button" aria-label="Дальше"${stepIdx === mode.steps.length - 1 ? ' disabled' : ''}>→</button>` ;
}
stepsEl.addEventListener('click', (e) => {
  if (e.target.closest('.pg-prev')) go(stepIdx - 1);
  else if (e.target.closest('.pg-next')) go(stepIdx + 1);
  else { const b = e.target.closest('[data-i]'); if (b) go(Number(b.dataset.i)); }
});

let icons = null;
async function go(i) {
  if (typeof i === 'string') i = mode.steps.findIndex((s) => s.id === i);
  stepIdx = Math.max(0, Math.min(mode.steps.length - 1, i));
  const step = mode.steps[stepIdx];
  // убрать прошлый шаг
  if (run) { for (const t of run.timers) clearTimeout(t); for (const t of run.intervals) clearInterval(t); run.dead = true; }
  layer.replaceChildren();
  const my = { timers: [], intervals: [], dead: false };
  run = my;
  steps();
  capEl.innerHTML = step.caption.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]).replace(/\[(warm|miss|win)\]/g, (_, k) => `<img class="pg-ic" src="img/q-${k}.png" alt="">`);
  history.replaceState(null, '', `?${SHOT ? 'shot&' : ''}m=${mode.id}&s=${step.id}`);
  icons ??= await loadIcons();
  let frame;
  try { frame = await stage.load(step.frame); } catch { frame = await stage.load(step.fallback ?? 'riddle-seat'); }
  fit();
  if (my.dead) return;
  stage.icons = icons;
  const hud = new Hud(hudRoot, me);
  const x = {
    stage, hud, frame, icons, sfx, layer, me, data,
    later: (f, ms) => { const t = setTimeout(() => { if (!my.dead) f(); }, ms); my.timers.push(t); return t; },
    every: (f, ms) => { const t = setInterval(() => { if (!my.dead) f(); }, ms); my.intervals.push(t); return t; },
    go: (id) => go(id),
    goMode: (m, id) => { const k = MODES.find((o) => o.id === m); if (!k) return; mode = k; tabs(); go(Math.max(0, k.steps.findIndex((s) => s.id === id))); },
    key: null,
  };
  my.x = x;
  step.run(x);
}

// Alt — короткие ники над всеми сидящими (над собой — никогда)
document.addEventListener('keydown', (e) => { if (e.key === 'Alt') { e.preventDefault(); stage.showNicks(true); } });
document.addEventListener('keyup', (e) => { if (e.key === 'Alt') { e.preventDefault(); stage.showNicks(false); } });
window.addEventListener('blur', () => stage.showNicks(false));

document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  if (run?.x?.key?.(e)) { e.preventDefault(); return; }
  if (layer.querySelector('.qz-scrim')) return;
  if (e.key === 'ArrowRight') go(stepIdx + 1);
  else if (e.key === 'ArrowLeft') go(stepIdx - 1);
});

document.querySelector('.pg-again').addEventListener('click', () => go(stepIdx));
const snd = document.querySelector('.pg-sound');
snd?.addEventListener('click', () => { sfx.on = !sfx.on; snd.classList.toggle('is-off', !sfx.on); snd.querySelector('span').textContent = sfx.on ? 'Звук' : 'Без звука'; });

await document.fonts.load('800 40px Rubik');
await document.fonts.load('400 40px "Rubik Mono One"');
await document.fonts.ready;
const m0 = MODES.find((m) => m.id === q.get('m'));
if (m0) mode = m0;
tabs();
fit();
const s0 = mode.steps.findIndex((s) => s.id === q.get('s'));
go(s0 >= 0 ? s0 : 0);
window.__v2 = { go, stage, get run() { return run; } };
