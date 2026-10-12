import { h, state, url, nf, mdBlock, table, acc, store, iconImg, seg } from '../lib.js';
import { readiness, budgetClass, budgetOf, cropModels } from '../modelutil.js';
import { thumb } from '../thumbs.js';

const CAT_ORDER = ['bed', 'prop', 'other', 'crop', 'pet', 'npc', 'boss', 'tool', 'cosmetic'];
const STAGE_NAMES = ['Стадия 1', 'Стадия 2', 'Стадия 3', 'Спелая'];
const catBudget = (m) => budgetOf(m.category === 'bed' || m.category === 'other' ? 'prop' : m.category);
const chipCls = (c) => (c === 'ok' ? '.green' : c === 'bad' ? '.terra' : c === 'mid' ? '.gold' : '');

export function mount(root, { data, go }) {
  const labels = data.meta.categoryLabels;
  const models = [...data.models].sort((a, b) => CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category) || a.name.localeCompare(b.name));
  // два файла на одну сущность (старое и новое имя): старший по времени помечаем
  const newest = new Map();
  for (const m of models) { if (!m.ref?.id) continue; const k = m.category + '|' + m.ref.id; if (!newest.has(k) || m.mtime > newest.get(k).mtime) newest.set(k, m); }
  const dupOf = (m) => { if (!m.ref?.id) return null; const n = newest.get(m.category + '|' + m.ref.id); return n && n !== m ? n : null; };
  const prevSeen = store.get('seenModels', null);
  const isNew = (m) => !!prevSeen && !prevSeen.includes(m.name);
  store.set('seenModels', data.models.map((m) => m.name));

  root.appendChild(h('div.sec-head', h('div.eyebrow', 'Модели'), h('h2', 'Галерея 3D'),
    h('p', `Все файлы из client/assets/farm/models (сейчас ${models.length}). Любую можно покрутить мышью, включить анимацию и стадии роста. Новые модели появляются после node docs/farm/review/build.mjs и обновления страницы.`)));

  // ───── готовность ─────
  const ready = readiness();
  root.appendChild(h('div.block', h('h3', 'Сколько готово'),
    h('div.ready-grid', ready.map((r) => {
      const pct = r.expected ? Math.min(100, Math.round((r.found / r.expected) * 100)) : 0;
      return h('div.ready-cell', h('div.row.between', h('span.small.muted', r.label), h('small', pct + '%')), h('b', nf(r.found)), h('small', ' из ' + nf(r.expected)), h('div.ready-bar', { style: 'margin-top:6px' }, h('i', { style: { width: pct + '%' } })), h('div.tiny.faint', { style: 'margin-top:4px' }, r.note));
    })),
    h('p.small.muted', { style: 'margin-top:.6rem' }, 'Ожидаемое количество взято из раздела 16 документа. У культур считаются стадии роста: 19 культур × 4.')));

  // ───── вьюер + галерея ─────
  let viewer = null;
  let viewerP = null;
  let cur = null;
  const vhost = h('div.viewer-host.tall');
  const detail = h('div.card', { style: 'margin-top:12px' });
  let filterCat = 'all';
  let query = '';
  const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px' });
  const cards = new Map();

  async function ensureViewer() {
    if (viewer) return viewer;
    if (!viewerP) {
      viewerP = (async () => {
        const { ModelViewer } = await import('../viewer.js');
        viewer = new ModelViewer(vhost, { tall: true });
        return viewer;
      })();
    }
    return viewerP;
  }

  function sourceOf(m) {
    return { url: url(m.path), label: m.name, variants: m.variants, budget: m.category === 'crop' ? null : catBudget(m), tris: m.tris };
  }

  async function select(m, stage) {
    cur = m;
    for (const [name, el] of cards) el.setAttribute('aria-pressed', String(name === m.name));
    renderDetail(m);
    try {
      const v = await ensureViewer();
      await v.setSources([sourceOf(m)], 0);
      if (stage != null && v.variantMode === 'stage') v._selectStage(stage);
    } catch (e) { console.warn(e); }
    if (location.hash !== '#models/' + m.name) history.replaceState(null, '', '#models/' + m.name);
  }

  function renderDetail(m) {
    const bud = catBudget(m);
    const cls = m.category === 'crop' ? '' : budgetClass(m.tris, bud);
    const stages = (m.variants || []).filter((v) => v.stageNo);
    const nm = m.note && typeof m.note === 'object' ? m.note : null;
    detail.replaceChildren(...[
      h('div.row.between', h('h4', { style: 'margin:0' }, m.name), h('div.row', h('span.chip', labels[m.category] || m.category), isNew(m) ? h('span.chip.terra', 'новое') : null, dupOf(m) ? h('span.chip.plum', 'есть свежее: ' + dupOf(m).name) : null)),
      h('div.tiny.faint', { style: 'margin:.2rem 0 .6rem;word-break:break-all' }, m.path),
      h('div.kv', { style: 'grid-template-columns:repeat(auto-fit,minmax(130px,1fr))' },
        h('div' + (cls === 'bad' ? '.warn' : cls === 'ok' ? '.good' : ''), h('div.k', 'Треугольники'), h('div.v', nf(m.tris)), h('div.s', bud && m.category !== 'crop' ? `ориентир ${nf(bud[0])}–${nf(bud[1])}` : m.category === 'crop' ? 'всего по 4 стадиям' : '')),
        h('div', h('div.k', 'Размер, м'), h('div.v', { style: 'font-size:1rem' }, (m.size || []).map((x) => x.toFixed(2)).join(' × '))),
        h('div', h('div.k', 'Меши / материалы'), h('div.v', `${m.meshes} / ${m.materials}`), h('div.s', m.textures ? `${m.textures} текстур` : 'без текстур')),
        m.anims?.length ? h('div', h('div.k', 'Анимации'), h('div.v', String(m.anims.length)), h('div.s', m.anims.map((a) => a.name || a).join(', '))) : null,
      ),
      stages.length ? h('div', { style: 'margin-top:.7rem' }, h('div.tiny.faint', 'Треугольники по стадиям, ориентир документа в скобках'), h('div.row', { style: 'gap:6px;margin-top:.3rem' }, stages.map((v) => h('span.chip' + chipCls(v.over ? 'bad' : budgetClass(v.tris, v.budget)), `${STAGE_NAMES[v.stageNo - 1]}: ${nf(v.tris)} (${nf(v.budget[0])}–${nf(v.budget[1])})`)))) : null,
      m.variants?.length && !stages.length && m.variants.length > 1 ? h('div', { style: 'margin-top:.7rem' }, h('div.tiny.faint', 'Узлы верхнего уровня'), h('div.row', { style: 'gap:6px;margin-top:.3rem' }, m.variants.map((v) => h('span.chip', `${v.name}: ${nf(v.tris)}`)))) : null,
      m.render ? h('details.acc', { style: 'margin-top:.7rem' }, h('summary', 'Рендер художника'), h('div.acc-body', h('img', { src: url(m.render), alt: m.name, style: 'width:100%;border-radius:12px' }))) : null,
      nm ? h('div.tiny.muted', { style: 'margin-top:.6rem' }, nm.cells.join(' · ')) : null,
      h('div.tiny.faint', { style: 'margin-top:.6rem' }, `${m.generator || ''} · обновлён ${new Date(m.mtime).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}`),
    ].filter(Boolean));
  }

  function cardFor(m) {
    const bud = catBudget(m);
    const cls = m.category === 'crop' ? '' : budgetClass(m.tris, bud);
    const thImg = h('div.th');
    if (m.render) thImg.appendChild(h('img', { src: url(m.render), alt: m.name, loading: 'lazy', decoding: 'async' }));
    else {
      thImg.appendChild(h('div.ph', '🧊'));
      const io = new IntersectionObserver((es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        io.disconnect();
        thumb(url(m.path), 256).then((u) => { if (u) { thImg.replaceChildren(h('img', { src: u, alt: m.name })); } });
      });
      io.observe(thImg);
    }
    if (isNew(m)) thImg.appendChild(h('span.new', 'новое'));
    const b = h('button.card.model-card', { type: 'button', 'aria-pressed': 'false', onclick: () => select(m), dataset: { cat: m.category, name: m.name } },
      thImg,
      h('div.bd', h('h4', m.name),
        h('div.row', h('span.chip' + chipCls(cls), `△ ${nf(m.tris)}`), m.anims?.length ? h('span.chip.sea', `${m.anims.length} анимаций`) : null, dupOf(m) ? h('span.chip.plum', { title: 'Есть более свежий файл для той же сущности: ' + dupOf(m).name }, 'старее') : null)));
    cards.set(m.name, b);
    return b;
  }
  for (const m of models) cardFor(m);

  const catCounts = {};
  models.forEach((m) => { catCounts[m.category] = (catCounts[m.category] || 0) + 1; });
  const catSeg = seg([{ value: 'all', label: `Все ${models.length}` }, ...CAT_ORDER.filter((c) => catCounts[c]).map((c) => ({ value: c, label: `${labels[c]} ${catCounts[c]}` }))], 'all', (v) => { filterCat = v; applyFilter(); });
  const search = h('input', { type: 'search', placeholder: 'Поиск по имени файла', oninput: () => { query = search.value.trim().toLowerCase(); applyFilter(); }, 'aria-label': 'Поиск модели' });
  const count = h('span.small.muted');
  function applyFilter() {
    let n = 0;
    for (const m of models) {
      const ok = (filterCat === 'all' || m.category === filterCat) && (!query || m.name.toLowerCase().includes(query));
      const el = cards.get(m.name);
      el.hidden = !ok;
      if (ok) n++;
    }
    count.textContent = `${n} из ${models.length}`;
    grid.replaceChildren(...models.filter((m) => !cards.get(m.name).hidden).map((m) => cards.get(m.name)));
    if (!n) grid.appendChild(h('div.empty', { style: 'grid-column:1/-1' }, 'Ничего не нашлось.'));
  }

  const left = h('div', { style: 'position:sticky;top:78px;align-self:start' },
    h('div.card', { style: 'padding:0;overflow:hidden' }, vhost),
    detail);
  const right = h('div', h('div.toolbar', catSeg), h('div.toolbar', search, count), grid);
  root.appendChild(h('div.block', h('h3', 'Просмотр'),
    h('p.lead', 'Выбери модель справа. В просмотрщике: вращать — левая кнопка, приблизить — колесо, ☀ — вечерний или нейтральный свет, ▦ — каркас. У культур внизу кнопки стадий роста, у питомцев и персонажей — анимации.'),
    h('div', { style: 'display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:18px;align-items:start' }, left, right)));
  const style = h('style', '@media (max-width: 980px) { .panel[data-tab="models"] .block > div[style*="grid-template-columns:minmax(0,1.1fr)"] { grid-template-columns: 1fr !important; } .panel[data-tab="models"] .block > div > div[style*="sticky"] { position: static !important; } }');
  root.appendChild(style);
  applyFilter();

  // ───── культуры: стадии × бюджет ─────
  const cropRows = data.crops.map((c) => {
    const m = cropModels(c.id)[0];
    return { c, m };
  });
  const matrix = h('table.cov',
    h('thead', h('tr', h('th', ''), STAGE_NAMES.map((s) => h('th', s)))),
    h('tbody', cropRows.map(({ c, m }) => h('tr',
      h('td.name', h('span', { style: 'display:inline-flex;align-items:center;gap:6px' }, iconImg(c.icon, '', ''), c.name)),
      [1, 2, 3, 4].map((i) => {
        const v = m?.variants?.find((x) => x.stageNo === i);
        if (!v) return h('td.no', m ? '?' : '—');
        const cls = v.over ? 'bad' : budgetClass(v.tris, v.budget);
        return h('td.' + cls, { title: `${nf(v.tris)} треуг.; ориентир ${nf(v.budget[0])}–${nf(v.budget[1])}`, onclick: () => { window.scrollTo({ top: root.getBoundingClientRect().top + scrollY + 300, behavior: 'smooth' }); select(m, i - 1); } }, nf(v.tris));
      }),
    ))));
  const have = cropRows.filter((r) => r.m).length;
  const over = cropRows.reduce((a, r) => a + (r.m?.variants || []).filter((v) => v.over).length, 0);
  root.appendChild(h('div.block', h('h3', 'Культуры: стадии и бюджет'),
    h('p.lead', `Готово ${have} из ${cropRows.length} культур. Цифра в клетке — треугольники стадии. Зелёный — в ориентире раздела 16, жёлтый — меньше нижней границы, красный — выше верхней (${nf(over)} стадий). Нажми на клетку, чтобы посмотреть стадию.`),
    h('div.card', { style: 'overflow:auto' }, matrix),
    h('p.small.muted', { style: 'margin-top:.6rem' }, 'Договорённость по файлам: одна культура — один файл crop_<имя>.glb с четырьмя корневыми узлами stage0…stage3 (stage3 — спелая). Просмотрщик находит их сам.')));

  // ───── сырая таблица ─────
  const raw = table(['Файл', 'Категория', 'Треуг.', 'Ориентир', 'Размер, м', 'Меши', 'Мат.', 'Анимаций', 'Рендер', 'Обновлён'],
    models.map((m) => {
      const b = catBudget(m);
      return [m.path.replace('client/assets/farm/models/', ''), labels[m.category] || m.category, nf(m.tris), m.category === 'crop' ? 'по стадиям' : b ? `${nf(b[0])}–${nf(b[1])}` : '—', (m.size || []).map((x) => x.toFixed(2)).join(' × '), String(m.meshes), String(m.materials), String(m.anims?.length || 0), m.render ? 'есть' : '—', new Date(m.mtime).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })];
    }), { right: [2, 5, 6, 7] });
  const mdSrc = data.modelsMd?.text || null;
  root.appendChild(h('div.block', h('h3', 'Сырая таблица файлов'),
    h('p.lead', 'Всё, что нашлось в папке, без сопоставления с культурами и питомцами. Если модели нет в галерее выше, проверь имя файла по таблице.'),
    h('div.card', { style: 'padding:0' }, raw),
    mdSrc ? acc('Заметки художников (art/farm/MODELS.md)', mdBlock(mdSrc), { chip: 'MODELS.md' }) : h('div.callout.gold', { style: 'margin-top:12px' }, h('b.t', 'art/farm/MODELS.md пока нет'), h('span', 'Когда художники его добавят, заметки появятся здесь после пересборки.'))));

  // ───── чего ещё ждём ─────
  const waiting = ready.filter((r) => r.found < r.expected);
  if (waiting.length) {
    root.appendChild(h('div.block', h('h3', 'Чего ещё нет'),
      h('div.grid.g-3', waiting.map((r) => h('div.card.flat', h('h4', { style: 'font-size:1rem' }, r.label), h('p.small', `Готово ${nf(r.found)} из ${nf(r.expected)}. ${r.note || ''}`))))));
  }
  root.appendChild(h('div.block', h('h3', 'Из документа'), ...['16', '16.1', '16.2', '16.3'].map((n) => { const d = data.docs[n]; return d ? acc(`§${n} · ${d.title}`, mdBlock(d.body), { chip: 'design-v11.md' }) : null; }).filter(Boolean)));

  // первый показ и глубокие ссылки
  const first = models.find((m) => m.name === 'plot') || models[0];
  let selected = false;
  const initial = () => {
    const sub = location.hash.split('/')[1];
    const m = (sub && models.find((x) => x.name === decodeURIComponent(sub))) || first;
    if (m) { selected = true; select(m); }
  };
  return {
    show(sub) {
      const m = sub && models.find((x) => x.name === decodeURIComponent(sub));
      if (m) select(m);
      else if (!selected) initial();
    },
  };
}
