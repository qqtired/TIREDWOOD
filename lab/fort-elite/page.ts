// Страница выбора ауры элиток: кнопки стенда (вариант, цвет, вид, моб, пауза), подписи и карточки вариантов.
import { AURA_VARIANTS, type AuraColorMode, type AuraVariant } from '../../client/fort/elite/aura.ts';
import { TYPES, onInfo, setColorMode, setMob, setPaused, setVariant, setView, state, type MobType, type View } from './stand.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function mark(seg: string, attr: string, value: string): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>(`#${seg} button`)) b.setAttribute('aria-pressed', String(b.dataset[attr] === value));
}

function sync(): void {
  const s = state();
  mark('segVariant', 'v', s.auraOn ? s.variant : 'off');
  mark('segMode', 'mode', s.colorMode);
  mark('segView', 'view', s.view);
  mark('segMob', 'mob', s.mob);
  $('segMob').hidden = s.view !== 'near';
  $('pause').textContent = s.paused ? 'Дальше' : 'Пауза';
  for (const c of document.querySelectorAll<HTMLElement>('[data-card]')) c.classList.toggle('is-on', s.auraOn && c.dataset.card === s.variant);
  const v = s.auraOn ? `${s.variant} · ${AURA_VARIANTS[s.variant].name}` : 'Без ауры';
  const who = s.view === 'near' ? `${TYPES[s.mob].name}: обычный · элита ×1,25 · чемпион ×1,5` : '20 обычных · 3 элиты · чемпион';
  $('tag').textContent = `${v} — ${who}`;
  $('hint').textContent = s.view === 'near' ? 'Тяни мышью — повернуть, колесо — ближе' : 'Вид игрока с хода стены. Тяни — осмотреться, колесо — камера';
}

for (const b of document.querySelectorAll<HTMLButtonElement>('#segVariant button')) b.addEventListener('click', () => { setVariant(b.dataset.v as AuraVariant | 'off'); sync(); });
for (const b of document.querySelectorAll<HTMLButtonElement>('#segMode button')) b.addEventListener('click', () => { setColorMode(b.dataset.mode as AuraColorMode); sync(); });
for (const b of document.querySelectorAll<HTMLButtonElement>('#segView button')) b.addEventListener('click', () => { setView(b.dataset.view as View); sync(); });
for (const b of document.querySelectorAll<HTMLButtonElement>('#segMob button')) b.addEventListener('click', () => { setMob(b.dataset.mob as MobType); sync(); });
for (const c of document.querySelectorAll<HTMLElement>('[data-card]')) c.addEventListener('click', () => { setVariant(c.dataset.card as AuraVariant); sync(); $('stage').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
$('pause').addEventListener('click', () => { setPaused(!state().paused); sync(); });

const meter = $('meter');
let shown = 0;
onInfo((i) => {
  const now = performance.now();
  if (now - shown < 500) return;
  shown = now;
  meter.textContent = `${Math.round(i.fps)} кадров/с · отрисовок ${i.calls} · программ ${i.programs} · частиц ${i.particles}`;
});
sync();
