import { h, state, url, nf, mdBlock, spanMd, table, acc, docAcc, seg, noRule } from '../lib.js';
import { openDialog, modelPane, placeholderPane } from '../detail.js';
import { cosmeticModel, petModel, budgetClass, budgetOf } from '../modelutil.js';
import { thumb } from '../thumbs.js';

const SLOT_EMOJI = { h: '🎩', u: '👕', l: '👖', a: '🎒', f: '✨', em: '🙌', ti: '🏅', n: '🔰', fr: '🖼️', tl: '🪣', pl: '🌻', s: '🐾' };
const SLOT_LABEL = { h: 'Голова', u: 'Верх', l: 'Низ', a: 'Аксессуары', f: 'Эффекты', em: 'Эмоции', ti: 'Титулы', n: 'Значки у ника', fr: 'Рамки карточки', tl: 'Скины инструментов', pl: 'Декор участка' };
const SLOT_CLS = { h: 's-h', u: 's-u', l: 's-l', a: 's-a', f: 's-s', em: 's-s' };
const KIND_LABEL = { level: 'за уровень', achievement: 'за достижение', rep: 'за репутацию' };
const chipCls = (c) => (c === 'ok' ? '.green' : c === 'bad' ? '.terra' : c === 'mid' ? '.gold' : '');

export function mount(root, { data, go }) {
  const cos = data.cosmetics;
  const labels = {};
  cos.forEach((c) => { labels[c.slotKey] ||= SLOT_LABEL[c.slotKey] || c.group; });
  const withModel = (c) => cosmeticModel(c.id);
  const nModels = cos.filter(withModel).length;

  root.appendChild(h('div.sec-head', h('div.eyebrow', 'Косметика и питомцы'), h('h2', 'Во что одевается ферма'),
    h('p', `В каталоге ${cos.length} вещей и ${data.pets.length} питомцев. Часть вещей с 3D (${nModels} из ${cos.filter((c) => /^[hula]$/.test(c.slotKey)).length} вещей со слотов «голова, верх, низ, аксессуар»): их можно покрутить. Остальное (эффекты, эмоции, значки, рамки) моделей не требует.`)));

  // ───── каталог ─────
  const st = { slot: 'all', kind: 'all', only3d: false, q: '' };
  const grid = h('div.grid.g-auto', { style: 'grid-template-columns:repeat(auto-fill,minmax(230px,1fr))' });
  const count = h('span.small.muted');
  const slotKeys = [...new Set(cos.map((c) => c.slotKey))];
  const slotSeg = seg([{ value: 'all', label: `Все ${cos.length}` }, ...slotKeys.map((k) => ({ value: k, label: `${SLOT_EMOJI[k] || ''} ${labels[k]} ${cos.filter((c) => c.slotKey === k).length}` }))], 'all', (v) => { st.slot = v; draw(); });
  const kindSeg = seg([{ value: 'all', label: 'Любой источник' }, ...Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))], 'all', (v) => { st.kind = v; draw(); });
  const only3d = h('input', { type: 'checkbox', onchange: () => { st.only3d = only3d.checked; draw(); } });
  const search = h('input', { type: 'search', placeholder: 'Поиск по названию', oninput: () => { st.q = search.value.trim().toLowerCase(); draw(); }, 'aria-label': 'Поиск вещи' });

  function cardOf(c) {
    const m = withModel(c);
    const th = h('div.th' + (SLOT_CLS[c.slotKey] ? '.' + SLOT_CLS[c.slotKey] : ''));
    if (m?.render) th.appendChild(h('img.r', { src: url(m.render), alt: c.name, loading: 'lazy', decoding: 'async' }));
    else if (m) {
      th.appendChild(h('div.big', SLOT_EMOJI[c.slotKey] || '🎁'));
      const io = new IntersectionObserver((es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        io.disconnect();
        thumb(url(m.path), 320).then((u) => { if (u) th.replaceChildren(h('img.r', { src: u, alt: c.name })); });
      });
      io.observe(th);
    } else th.appendChild(h('div.big', SLOT_EMOJI[c.slotKey] || '🎁'));
    const src = c.sourceKind === 'level' ? `ур. ${c.level}` : c.sourceKind === 'rep' ? `репутация ${c.rep ?? ''}` : c.sourceKind === 'achievement' ? 'достижение' : c.source;
    return h('button.card.cos-card', { type: 'button', onclick: () => open(c) },
      th,
      h('div.bd',
        h('div.row.between', h('h4', c.name), c.changed ? h('span.tag-chg', 'изм.') : null),
        h('div.row', { style: 'gap:5px;margin:.35rem 0' }, h('span.chip', labels[c.slotKey] || c.group), h('span.chip.gold', src), m ? h('span.chip.green', '3D') : null),
        h('p', c.look)));
  }

  function draw() {
    const list = cos.filter((c) => (st.slot === 'all' || c.slotKey === st.slot) && (st.kind === 'all' || c.sourceKind === st.kind) && (!st.only3d || withModel(c)) && (!st.q || c.name.toLowerCase().includes(st.q) || (c.look || '').toLowerCase().includes(st.q)));
    count.textContent = `${list.length} из ${cos.length}`;
    grid.replaceChildren(...list.map(cardOf));
    if (!list.length) grid.appendChild(h('div.empty', 'Ничего не нашлось.'));
  }

  function open(c) {
    const m = withModel(c);
    const bud = budgetOf('cosmetic');
    const slotInfo = data.slots.find((s) => s.code === c.slotKey);
    const right = h('div',
      h('h4', 'Как выглядит'), h('p', c.look),
      h('h4', 'Откуда берётся'),
      h('div.kv', { style: 'grid-template-columns:repeat(auto-fit,minmax(150px,1fr))' },
        h('div', h('div.k', 'Источник'), h('div.v', { style: 'font-size:1.05rem' }, c.source), h('div.s', KIND_LABEL[c.sourceKind] || '')),
        h('div', h('div.k', 'Слот'), h('div.v', { style: 'font-size:1.05rem' }, c.slot), h('div.s', slotInfo?.what || '')),
        h('div', h('div.k', 'Идентификатор'), h('div.v', { style: 'font-size:1rem' }, c.id))),
      c.changeNote ? h('div.callout.gold', { style: 'margin-top:12px' }, h('b.t', 'Изменено против v10'), h('span', c.changeNote)) : null,
      slotInfo?.draw && slotInfo.draw !== '—' ? h('div', h('h4', 'Как рисуется'), h('p.small', slotInfo.draw)) : null,
      m ? h('div', h('h4', 'Модель'), h('div.row', h('span.chip' + chipCls(budgetClass(m.tris, bud)), `△ ${nf(m.tris)}`), bud ? h('span.chip', `ориентир ${nf(bud[0])}–${nf(bud[1])}`) : null, h('span.chip', (m.size || []).map((x) => x.toFixed(2)).join(' × ') + ' м')), h('p.tiny.faint', m.path)) : h('div.callout.sea', { style: 'margin-top:12px' }, h('b.t', m ? '' : 'Модели нет'), h('span', /^[hula]$/.test(c.slotKey) ? 'Модель ещё не положили в client/assets/farm/models (ожидаемое имя: cos_' + c.id.replace(':', '_') + '.glb).' : 'Для этого слота сетка не нужна: эффект, значок, титул или эмоция рисуются без отдельной модели.')),
    );
    let left; let pane = null;
    if (m) {
      pane = modelPane([{ url: url(m.path), label: m.name, variants: m.variants, budget: bud, tris: m.tris }], {});
      left = pane.host;
    } else left = placeholderPane({ img: m?.render ? url(m.render) : null, title: c.name, text: SLOT_EMOJI[c.slotKey] ? `${SLOT_EMOJI[c.slotKey]} ${c.slot}` : c.slot });
    const dlg = openDialog({ title: c.name, chips: [h('span.chip', c.slot), m ? h('span.chip.green', '3D') : null].filter(Boolean), left, right });
    if (pane) dlg.onClose(() => pane.dispose());
  }

  root.appendChild(h('div.block', h('h3', 'Каталог'),
    h('div.toolbar', slotSeg),
    h('div.toolbar', kindSeg, h('label', only3d, 'только с 3D-моделью'), search, count),
    grid));
  draw();

  // ───── питомцы ─────
  const petCards = data.pets.map((p) => {
    const m = petModel(p.id);
    const th = h('div.th.s-a');
    if (m?.render) th.appendChild(h('img.r', { src: url(m.render), alt: p.name, loading: 'lazy' }));
    else th.appendChild(h('div.big', '🐾'));
    return h('button.card.cos-card', { type: 'button', onclick: () => openPet(p) },
      th,
      h('div.bd', h('div.row.between', h('h4', p.name), p.changed ? h('span.tag-chg', 'изм.') : null),
        h('div.row', { style: 'gap:5px;margin:.35rem 0' }, h('span.chip.gold', p.source), m ? h('span.chip.green', `3D · ${m.anims?.length || 0} анимаций`) : h('span.chip', 'модели нет')),
        h('p', p.look)));
  });
  function openPet(p) {
    const m = petModel(p.id);
    const bud = budgetOf('pet');
    const right = h('div',
      h('h4', 'Как выглядит'), h('p', p.look),
      h('h4', 'Поведение'),
      h('table.tbl', h('tbody',
        h('tr', h('td.nowrap', h('b', 'Стоит (idle)')), h('td', p.idle)),
        h('tr', h('td.nowrap', h('b', 'Идёт за хозяином (follow)')), h('td', p.follow)),
        h('tr', h('td.nowrap', h('b', 'Радуется (happy)')), h('td', p.happy)))),
      h('div.row', { style: 'margin-top:12px' }, h('span.chip.gold', 'Откуда: ' + p.source), m ? h('span.chip' + chipCls(budgetClass(m.tris, bud)), `△ ${nf(m.tris)} (ориентир ${nf(bud[0])}–${nf(bud[1])})`) : null),
      m ? h('p.small.muted', { style: 'margin-top:.7rem' }, 'Внизу окна переключатель анимаций. Список анимаций берётся из самого файла.') : h('div.callout.sea', { style: 'margin-top:12px' }, 'Модели пока нет. Ожидается файл pet-' + p.id.split(':')[1] + '.glb с анимациями idle, follow, happy.'),
    );
    let left; let pane = null;
    if (m) { pane = modelPane([{ url: url(m.path), label: m.name, variants: [], budget: bud, tris: m.tris }], {}); left = pane.host; } else left = placeholderPane({ title: p.name, text: p.look });
    const dlg = openDialog({ title: p.name, chips: [h('span.chip', 'питомец')], left, right });
    if (pane) dlg.onClose(() => pane.dispose());
  }
  root.appendChild(h('div.block', h('h3', 'Питомцы'),
    h('p.lead', { html: spanMd(noRule(data.petIntro || '')) }),
    h('div.grid.g-auto', { style: 'grid-template-columns:repeat(auto-fill,minmax(230px,1fr))' }, petCards),
    acc('Как питомец следует за игроком', mdBlock(noRule(data.petBehavior || '')), { chip: 'из документа' })));

  // ───── слоты ─────
  root.appendChild(h('div.block', h('h3', 'Слоты'),
    h('div.card.flat', { style: 'padding:0' }, table(['Код', 'Слот', 'Что входит', 'Как рисуется', ''], data.slots.map((s) => [s.code, s.slot, s.what, s.draw, s.changed ? h('span.tag-chg', 'изм.') : null]))),
    data.slotsNote?.length ? h('ul.small', { style: 'margin-top:1rem' }, data.slotsNote.map((n) => h('li', { html: spanMd(n) }))) : null));
  const more = h('div.block', h('h3', 'Подробнее из документа'));
  for (const n of ['12.1', '12.2', '12.3']) { const a = docAcc(n); if (a) more.appendChild(a); }
  root.appendChild(more);
  return {};
}
