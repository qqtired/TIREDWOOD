// Сборка страницы-обзора: шапка (вид эстрады, звук) и разделы. Раздел — модуль js/<имя>.js с export mount(el);
// модуля нет или он упал — раздел показывает заглушку, страница живёт дальше.
import { setMuted, sfx } from './common.js';

const SECTIONS = ['venue', 'jeopardy', 'riddle', 'croc', 'whoofus', 'packs', 'chat'];

// вид эстрады в шапке: «Ракушка» или «Шатёр» (запоминается у смотрящего)
const arts = document.querySelectorAll('.pg-hero-art');
const vbtn = document.querySelectorAll('[data-variant]');
function variant(v) {
  arts.forEach((a) => { a.hidden = a.dataset.art !== v; });
  vbtn.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.variant === v)));
  try { localStorage.setItem('qz-variant', v); } catch { /* приватное окно */ }
}
vbtn.forEach((b) => b.addEventListener('click', () => { variant(b.dataset.variant); sfx.play('click'); }));
let saved = 'shell';
try { saved = localStorage.getItem('qz-variant') || 'shell'; } catch { /* приватное окно */ }
variant(saved === 'awning' ? 'awning' : 'shell');

// звук макетов
const mute = document.querySelector('.pg-mute');
mute?.addEventListener('click', () => {
  const on = mute.getAttribute('aria-pressed') !== 'true';
  mute.setAttribute('aria-pressed', String(on));
  mute.textContent = on ? 'Звук выключен' : 'Звук макетов';
  setMuted(on);
});

for (const name of SECTIONS) {
  const el = document.querySelector(`[data-mount="${name}"]`);
  if (!el) continue;
  import(`./${name}.js`)
    .then((m) => m.mount(el))
    .catch((e) => {
      console.warn(`раздел ${name}:`, e);
    });
}
