// Страница «Крепость 50»: карточки мобов со стендом, план 50 волн, стены, механики и выбор кодами (как lab/ideas).
import { ANIM_NAMES, MOBS, type MobCard } from './mobs.ts';
import { attach, freezeAll, setBottomInset } from './stand.ts';
import { renderBossPlan, renderCompare, renderSummary, renderHow, renderIdeas, IDEAS } from './texts.ts';
import { renderWaves, WAVE_VARIANTS } from './waves.ts';
import { renderWalls, BREACH_LOOKS } from './walls.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  return el;
};

// ---------------------------------------------------------------- выбор кодами
const STORE = 'fort-rework-pick-v1';
const picked = new Set<string>();
const recommended = new Set<string>();
const pickListeners: Array<() => void> = [];
export function isPicked(id: string): boolean { return picked.has(id); }
export function togglePick(id: string): void {
  if (picked.has(id)) picked.delete(id); else picked.add(id);
  save();
  syncPick();
}
export function recommend(id: string): void { recommended.add(id); }
function save(): void { try { localStorage.setItem(STORE, JSON.stringify([...picked])); } catch { /* приватное окно */ } }
function load(): boolean {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return false;
    for (const id of JSON.parse(raw) as string[]) picked.add(id);
    return true;
  } catch { return false; }
}
const ORDER = (id: string): string => id.replace(/(\d+)/g, (m) => m.padStart(3, '0'));
function syncPick(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-pick]')) el.classList.toggle('is-on', picked.has(el.dataset.pick!));
  const ids = [...picked].sort((a, b) => ORDER(a).localeCompare(ORDER(b), 'ru'));
  $('pickN').textContent = String(ids.length);
  $('pickList').textContent = ids.length ? ids.join(', ') : 'нажимай карточки с кодами — список соберётся здесь';
  for (const f of pickListeners) f();
}
/** Кнопка «беру» с кодом для карточки */
export function takeButton(id: string, label = 'Беру'): HTMLButtonElement {
  const b = h('button', 'fr-take', `<span class="fr-check"></span><span class="id">${id}</span><span>${label}</span>`);
  b.type = 'button';
  b.dataset.pick = id;
  b.addEventListener('click', (e) => { e.stopPropagation(); togglePick(id); });
  return b;
}

// ---------------------------------------------------------------- мобы
const GROUPS: Array<[string, string]> = [['all', 'Все'], ['army', 'Армия Барона'], ['sea', 'Море'], ['boss', 'Боссы'], ['siege', 'Осада']];
const VERDICTS: Array<[string, string]> = [['all', 'Любой вердикт'], ['keep', 'Оставить'], ['polish', 'Доработать'], ['redo', 'Переделать']];
const VNAME: Record<string, string> = { keep: 'Оставить', polish: 'Доработать', redo: 'Переделать' };
let fGroup = 'all';
let fVerdict = 'all';

function mobCard(m: MobCard): HTMLElement {
  const card = h('article', `fr-mob v-${m.verdict}`);
  card.dataset.group = m.group;
  card.dataset.verdict = m.verdict;
  card.id = 'mob-' + m.id;
  const view = h('div', 'fr-view');
  const tag = h('span', 'fr-view-tag', 'По кругу');
  view.append(tag);
  const poses = h('div', 'fr-poses');
  const buttons = new Map<string, HTMLButtonElement>();
  const cyc = h('button', 'cyc on', 'По кругу');
  cyc.type = 'button';
  poses.append(cyc);
  const names = { ...ANIM_NAMES, ...(m.extra ?? {}) };
  const order = ['idle', 'walk', 'windup', 'attack', 'hit', 'die', ...Object.keys(m.extra ?? {}).filter((k) => !ANIM_NAMES[k])];
  for (const key of order) {
    if (!m.poses[key]) continue;
    const b = h('button', '', names[key] ?? key);
    b.type = 'button';
    b.dataset.pose = key;
    buttons.set(key, b);
    poses.append(b);
  }
  let auto = true;
  const stand = attach(view, m, (name) => {
    tag.textContent = (auto ? 'По кругу · ' : '') + (names[name] ?? name);
    for (const [k, b] of buttons) b.classList.toggle('on', k === name);
  });
  cyc.addEventListener('click', () => { auto = true; cyc.classList.add('on'); stand.setPose(null); });
  for (const [k, b] of buttons) b.addEventListener('click', () => { auto = false; cyc.classList.remove('on'); stand.setPose(k); });
  if (m.was) {
    // доработанные модели: «Было» — первый вариант (v1) со старыми позами, «Стало» — как сейчас в игре
    const was = h('div', 'k-seg fr-seg fr-was');
    for (const [on, label] of [[true, 'Было'], [false, 'Стало']] as const) {
      const b = h('button', on ? '' : 'is-active', label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(!on));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        for (const x of was.children) { x.classList.toggle('is-active', x === b); x.setAttribute('aria-pressed', String(x === b)); }
        card.classList.toggle('is-was', on);
        const poses = on ? m.was!.poses ?? m.poses : m.poses;
        for (const [k, pb] of buttons) pb.hidden = !poses[k];
        stand.setWas(on);
      });
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      was.append(b);
    }
    view.append(was);
  }

  const head = h('div', 'fr-mob-h', `<h3>${m.name}</h3><span class="role">${m.role}</span>`);
  const body = h('div', 'fr-mob-b');
  const who = m.who === 'codex' ? '<span class="fr-badge codex">Codex · 12.10</span>' : '<span class="fr-badge claude">Claude · 03.10</span>';
  body.append(h('div', 'fr-badges', `<span class="fr-badge ${m.verdict}">${VNAME[m.verdict]}</span>${who}<span class="fr-badge">${m.tris.toLocaleString('ru-RU')} треуг.</span><span class="fr-badge" title="коммит">${m.commit}</span>`));
  if (m.good) body.append(h('p', 'fr-good', m.good));
  if (m.todo) body.append(h('p', 'fr-todo', m.todo));
  if (m.code) {
    body.append(takeButton(m.code, m.verdict === 'redo' ? 'Переделать' : 'Доработать'));
    recommend(m.code);
  }
  card.append(view, poses, head, body);
  return card;
}

function renderMobs(): void {
  const grid = $('mobGrid');
  for (const m of MOBS) grid.append(mobCard(m));
  const n = { keep: 0, polish: 0, redo: 0 };
  for (const m of MOBS) n[m.verdict]++;
  const codex = MOBS.filter((m) => m.who === 'codex').length;
  $('mobsLead').innerHTML = `${MOBS.length} моделей — все, что сейчас ходят в крепости (цветные близнецы одной модели не дублирую). Код игры тот же, что в крепости: свет, поза и шаг считаются так же. `
    + `Итог: <b>оставить ${n.keep}</b>, <b>доработать ${n.polish}</b>, <b>переделать ${n.redo}</b>. `
    + `Кто делал — по истории git: армию, море и боссов 03.10 делали помощники Claude (русские коммиты «Крепость, мобы…»), ${codex} осадных — Codex 12.10 (коммит «feat: add active siege encounters…», английские сообщения, GLB из Blender).`;
  const seg = (id: string, items: Array<[string, string]>, set: (v: string) => void) => {
    const box = $(id);
    for (const [v, label] of items) {
      const b = h('button', v === 'all' ? 'is-active' : '', label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(v === 'all'));
      b.addEventListener('click', () => {
        for (const x of box.children) { x.classList.toggle('is-active', x === b); x.setAttribute('aria-pressed', String(x === b)); }
        set(v);
        filter();
      });
      box.append(b);
    }
  };
  seg('fGroup', GROUPS, (v) => { fGroup = v; });
  seg('fVerdict', VERDICTS, (v) => { fVerdict = v; });
}

function filter(): void {
  for (const el of document.querySelectorAll<HTMLElement>('.fr-mob')) {
    el.hidden = (fGroup !== 'all' && el.dataset.group !== fGroup) || (fVerdict !== 'all' && el.dataset.verdict !== fVerdict);
  }
}

// ---------------------------------------------------------------- сборка страницы
renderSummary($('summary'));
renderMobs();
renderBossPlan($('bossesLead'), $('bossPlan'));
renderWaves({ lead: $('wavesLead'), why: $('wavesWhy'), chart: $('chart'), legend: $('chartLegend'), variants: $('waveVariants'), table: $('waveTable'), note: $('tableNote') });
renderWalls({ lead: $('wallsLead'), map: $('wallMap'), mapInfo: $('wallMapInfo'), stages: $('wallStages'), stageSeg: $('stageSeg'), stageCap: $('stageCap'), rules: $('wallRules'), breakers: $('breakers'), looks: $('breachLooks'), hud: $('wallHud') });
renderIdeas($('ideaGrid'));
renderHow($('how'));
renderCompare($('compare'));
for (const id of [...WAVE_VARIANTS.filter((v) => v.star).map((v) => v.id), ...BREACH_LOOKS.filter((v) => v.star).map((v) => v.id), ...IDEAS.filter((v) => v.star).map((v) => v.id), 'С-1']) recommend(id);
if (!load()) for (const id of recommended) picked.add(id);
syncPick();

$('pickReset').addEventListener('click', () => { picked.clear(); for (const id of recommended) picked.add(id); save(); syncPick(); });
$('pickClear').addEventListener('click', () => { picked.clear(); save(); syncPick(); });
$('pickCopy').addEventListener('click', async () => {
  const text = 'Крепость 50: беру ' + [...picked].sort((a, b) => ORDER(a).localeCompare(ORDER(b), 'ru')).join(', ');
  try { await navigator.clipboard.writeText(text); $('pickCopy').textContent = 'Скопировано'; } catch { prompt('Скопируй:', text); }
  setTimeout(() => { $('pickCopy').textContent = 'Скопировать'; }, 1500);
});
const pickBar = $('pick');
const inset = () => setBottomInset(innerHeight - pickBar.getBoundingClientRect().top + 4);
inset();
addEventListener('resize', inset);

// для снимков: ?pose=walk&t=0.4 — все карточки замирают в этой позе
const q = new URLSearchParams(location.search);
if (q.get('compact')) document.body.classList.add('fr-compact');
if (q.get('group')) [...$('fGroup').children].find((b) => b.textContent === ({ siege: 'Осада', boss: 'Боссы', sea: 'Море', army: 'Армия Барона' } as Record<string, string>)[q.get('group')!])?.dispatchEvent(new MouseEvent('click'));
if (q.get('pose')) setTimeout(() => freezeAll(q.get('pose'), Number(q.get('t') ?? 0.5)), Number(q.get('wait') ?? 2500));
Object.assign(window, { __page: { picked, freezeAll } });
