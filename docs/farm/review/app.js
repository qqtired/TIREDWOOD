// Страница-обзор «Ферма»: загрузка data.json, вкладки, ленивое построение разделов.
import { $, h, state, store, nf, startCoinDecorator } from './lib.js';

const TABS = [
  { id: 'cover', label: 'Обложка', em: '🌾', mod: './sections/cover.js' },
  { id: 'path', label: 'Путь игрока', em: '🧭', mod: './sections/path.js' },
  { id: 'crops', label: 'Культуры', em: '🥕', mod: './sections/crops.js' },
  { id: 'economy', label: 'Экономика', em: '📈', mod: './sections/economy.js' },
  { id: 'progress', label: 'Прогрессия', em: '🪜', mod: './sections/progress.js' },
  { id: 'location', label: 'Локация', em: '🗺️', mod: './sections/location.js' },
  { id: 'models', label: 'Модели', em: '🧊', mod: './sections/models.js' },
  { id: 'cosmetics', label: 'Косметика и питомцы', em: '👒', mod: './sections/cosmetics.js' },
  { id: 'systems', label: 'Системы', em: '⚙️', mod: './sections/systems.js' },
  { id: 'questions', label: 'Вопросы владельцу', em: '❓', mod: './sections/questions.js' },
];

const mounted = new Map();
let navEl;
let appEl;

export function go(tab, sub) {
  const hash = '#' + tab + (sub ? '/' + sub : '');
  if (location.hash !== hash) history.pushState(null, '', hash);
  show(tab, sub);
}

async function show(tab, sub) {
  const def = TABS.find((t) => t.id === tab) || TABS[0];
  state.tab = def.id;
  for (const b of navEl.children) b.setAttribute('aria-selected', String(b.dataset.tab === def.id));
  for (const p of appEl.querySelectorAll('.panel')) p.classList.toggle('on', p.dataset.tab === def.id);
  document.title = `${def.label} · Ферма · обзор TIREDWOOD`;
  const panel = appEl.querySelector(`.panel[data-tab="${def.id}"]`);
  let m = mounted.get(def.id);
  if (!m) {
    m = { api: null };
    mounted.set(def.id, m);
    panel.appendChild(h('div.empty', 'Собираю раздел…'));
    try {
      const mod = await import(def.mod);
      panel.innerHTML = '';
      m.api = (await mod.mount(panel, { go, data: state.data })) || {};
    } catch (e) {
      console.error('Раздел ' + def.id, e);
      panel.innerHTML = '';
      panel.appendChild(h('div.error', `Раздел «${def.label}» не собрался: ${e.message || e}`));
    }
  }
  m.api?.show?.(sub);
  if (!sub) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function route() {
  const [tab, sub] = location.hash.replace(/^#/, '').split('/');
  show(tab || 'cover', sub);
}

async function boot() {
  navEl = $('#nav');
  appEl = $('#app');
  let data;
  try {
    const r = await fetch('data.json', { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
    data = await r.json();
  } catch (e) {
    appEl.innerHTML = '';
    appEl.appendChild(h('div.error', h('b', 'Не удалось загрузить data.json. '), 'Страницу нужно открывать через сервер: ', h('code', 'node docs/farm/review/serve.mjs'), ', затем http://localhost:3104/docs/farm/review/. Если data.json нет, соберите его: ', h('code', 'node docs/farm/review/build.mjs'), '. (', String(e.message || e), ')'));
    return;
  }
  state.data = data;
  startCoinDecorator();
  const sim = data.sim;
  state.K = store.get('K', null) ?? sim?.presets?.[sim.primary]?.K ?? data.economy?.kDoc ?? 0.1;
  appEl.innerHTML = '';
  for (const t of TABS) {
    navEl.appendChild(h('button.tab', { type: 'button', role: 'tab', 'aria-selected': 'false', dataset: { tab: t.id }, onclick: () => go(t.id) }, h('span.em', t.em), t.label));
    appEl.appendChild(h('section.panel', { dataset: { tab: t.id }, role: 'tabpanel', 'aria-label': t.label }));
  }
  renderFooter(data);
  window.addEventListener('popstate', route);
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, select')) return;
    if (document.getElementById('dlg').open) return;
    const i = TABS.findIndex((t) => t.id === state.tab);
    if (e.key === 'ArrowRight' && e.altKey) go(TABS[(i + 1) % TABS.length].id);
    if (e.key === 'ArrowLeft' && e.altKey) go(TABS[(i + TABS.length - 1) % TABS.length].id);
  });
  route();
}

function renderFooter(d) {
  const f = $('#foot');
  const when = (iso) => (iso ? new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const m = d.meta;
  f.append(
    h('p', 'Страница собрана автоматически из документов проекта: ', h('code', 'node docs/farm/review/build.mjs'), ' перечитывает ', h('code', 'design-v11.md'), ', ', h('code', 'results.json'), ', ', h('code', 'RESULTS.md'), ', раскладку локации и папки с моделями. Числа в HTML не вписаны.'),
    h('div.src',
      h('span', 'data.json: ', when(m.builtAt)),
      h('span', 'design-v11.md: ', when(m.sources.design.mtime)),
      h('span', 'results.json: ', when(m.sources.results.generated || m.sources.results.mtime)),
      h('span', 'RESULTS.md: ', when(m.sources.resultsMd.mtime), m.sources.resultsMd.hasFinalSection ? ' (есть «Итоговые числа v11»)' : ' («Итоговых чисел v11» пока нет)'),
      h('span', 'моделей: ', nf(m.counts.models), ' · иконок: ', nf(m.counts.icons)),
    ),
    ...(m.warnings?.length ? [h('details', { style: 'margin-top:8px' }, h('summary', `Предупреждения сборки: ${m.warnings.length}`), h('ul', m.warnings.map((w) => h('li', w))))] : []),
  );
}

boot();
