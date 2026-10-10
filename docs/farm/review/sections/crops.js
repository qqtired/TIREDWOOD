import { h, state, url, iconImg, iconUrl, nf, dur, mdBlock, spanMd, seg, GROUPS, priceFor, simFinalCrop, simPresetName, resByKey, table, ARCH_ORDER, ARCH_COLORS } from '../lib.js';
import { openDialog, modelPane, placeholderPane } from '../detail.js';
import { cropModels, budgetClass } from '../modelutil.js';

export function mount(root, { go, data }) {
  const sim = data.sim;
  const st = { group: 'all', level: 13, sort: 'level', price: 'doc', hideLocked: false };

  root.appendChild(h('div.sec-head', h('div.eyebrow', 'Культуры'), h('h2', `${data.crops.length} культур от редиса до мифического гриба`), h('p', 'Фильтр по группе и уровню. Нажмите на карточку: цифры, ресурс и 3D-модель стадий роста, если художник её уже сделал.')));

  // ───── панель фильтров ─────
  const levelOut = h('b.num', '13');
  const levelRange = h('input', { type: 'range', min: 1, max: data.levels.unlock.length || 13, value: st.level, class: 'wide', 'aria-label': 'Уровень фермы', oninput: () => { st.level = +levelRange.value; levelOut.textContent = st.level; render(); } });
  const priceOpts = [{ value: 'doc', label: 'По документу', title: 'Цены из таблицы раздела 4 (design-v11.md)' }];
  if (sim) priceOpts.push({ value: 'sim', label: 'Итог симуляции', title: `results.json, пресет ${simPresetName()}` });
  priceOpts.push({ value: 'k', label: 'По K', title: 'Пересчёт v10 × K со сжатием поздних культур, ползунок на вкладке «Экономика»' });
  const priceSeg = seg(priceOpts, st.price, (v) => { st.price = v; render(); });
  const sortSel = h('select', { 'aria-label': 'Сортировка', onchange: () => { st.sort = sortSel.value; render(); } },
    [['level', 'по уровню'], ['coinsH', 'по 🪙 в час'], ['xpH', 'по XP в час'], ['minutes', 'по времени роста'], ['xp', 'по XP за сбор']].map(([v, l]) => h('option', { value: v }, l)));
  const groupSeg = seg([{ value: 'all', label: 'Все' }, ...Object.entries(GROUPS).map(([k, g]) => ({ value: k, label: `${g.emoji} ${g.label}`, title: g.sub }))], 'all', (v) => { st.group = v; render(); });
  const lockChk = h('input', { type: 'checkbox', onchange: () => { st.hideLocked = lockChk.checked; render(); } });
  root.appendChild(h('div.toolbar', groupSeg,
    h('label', 'Фермер уровня', levelRange, levelOut),
    h('label', 'Сортировка', sortSel),
    h('label', lockChk, 'скрыть закрытые'),
    h('label', 'Цены', priceSeg)));

  const info = h('div.small.muted', { style: 'margin:-0.3rem 0 1rem' });
  const grid = h('div.grid.g-auto');
  root.append(info, grid);

  function cardOf(c) {
    const p = priceFor(c, st.price);
    const m = cropModels(c.id);
    const g = GROUPS[c.group];
    const locked = c.level > st.level;
    const el = h('button.card.crop-card' + (locked ? '.locked' : ''), { type: 'button', onclick: () => openCrop(c) },
      m.length ? h('span.badge-3d', '3D') : null,
      h('div.chead',
        h('div.pic', iconImg(c.icon, '', c.name)),
        h('div', h('h4', c.name), h('div.prod', '→ ' + c.product)),
      ),
      h('div.meta', h('span.lvl-badge', { title: 'Уровень фермы' }, c.level), h('span.chip.' + g.cls, `${g.emoji} ${c.growText}`), c.secKey ? h('span.chip', iconImg(resByKey(c.secKey)?.icon), `${c.secChance}%`) : null),
      h('div.nums',
        h('div', 'семя → продажа', h('b', `${nf(p.seed)} → ${nf(p.sell)}`)),
        h('div', '🪙 в час', h('b', nf(p.coinsH, 1))),
        h('div', 'XP / сбор', h('b', nf(c.xp))),
      ),
    );
    return el;
  }

  function render() {
    let list = data.crops.filter((c) => (st.group === 'all' || c.group === st.group) && (!st.hideLocked || c.level <= st.level));
    const key = st.sort;
    const val = (c) => (key === 'coinsH' ? priceFor(c, st.price).coinsH : key === 'xpH' ? priceFor(c, st.price).xpH : c[key]);
    list = list.sort((a, b) => (key === 'level' ? a.level - b.level || a.minutes - b.minutes : key === 'minutes' ? a.minutes - b.minutes : val(b) - val(a)));
    grid.replaceChildren(...list.map(cardOf));
    const open = data.crops.filter((c) => c.level <= st.level).length;
    info.textContent = `На уровне ${st.level} открыто ${open} из ${data.crops.length} культур. Показано ${list.length}. ${st.price === 'k' ? `Цены пересчитаны: v10 × K = ${nf(state.K, 2)}${state.lever ? ', со сжатием поздних культур' : ''}.` : st.price === 'sim' ? `Цены из симуляции (пресет ${simPresetName()}).` : 'Цены из таблицы документа.'}`;
    if (!list.length) grid.appendChild(h('div.empty', 'Под такой фильтр культур нет.'));
  }
  render();

  // ───── карточка культуры ─────
  function openCrop(c) {
    const g = GROUPS[c.group];
    const models = cropModels(c.id);
    const spec = data.assets.crops.find((x) => x.id === c.id);
    const doc = priceFor(c, 'doc');
    const fin = sim ? priceFor(c, 'sim') : null;
    const kk = priceFor(c, 'k');
    const v10 = { seed: c.seedV10, sell: c.sellV10, profit: c.sellV10 - c.seedV10, coinsH: +(((c.sellV10 - c.seedV10) * 60) / c.minutes).toFixed(1) };
    const sec = c.secKey ? resByKey(c.secKey) : null;
    const rows = sim?.presets?.[sim.primary]?.cropRows?.find((r) => r.sim === c.sim);

    const kv = h('div.kv',
      h('div', h('div.k', 'Рост'), h('div.v', c.growText), h('div.s', dur(c.minutes))),
      h('div', h('div.k', 'XP за сбор'), h('div.v', nf(c.xp), c.xpChanged ? h('small', ' изм.') : null), h('div.s', `${nf(doc.xpH)} XP в час`)),
      h('div', h('div.k', 'Семя → продажа'), h('div.v', `${nf(doc.seed)} → ${nf(doc.sell)}`), h('div.s', `прибыль ${nf(doc.profit)} 🪙 за сбор`)),
      h('div.' + (doc.coinsH >= 30 ? 'good' : doc.coinsH < 5 ? 'warn' : ''), h('div.k', '🪙 в час с грядки'), h('div.v', nf(doc.coinsH, 1)), h('div.s', 'на одной грядке')),
      h('div', h('div.k', 'Вторичный ресурс'), h('div.v', { style: 'display:flex;align-items:center;gap:6px' }, sec ? iconImg(sec.icon, '', sec.name) : null, `${c.secChance} %`), h('div.s', sec ? sec.name : c.secName)),
      h('div', h('div.k', 'Открывается'), h('div.v', `ур. ${c.level}`), h('div.s', c.levelChanged ? 'изм. против v10' : GROUPS[c.group].sub)),
      h('div', h('div.k', 'Ящик Фургона'), h('div.v', c.vanLimit != null ? `до ${nf(c.vanLimit)} шт.` : '—'), h('div.s', 'лимит штук в ящике')),
      rows?.secPerH != null ? h('div', h('div.k', 'Ресурса в час'), h('div.v', nf(rows.secPerH, 1)), h('div.s', 'с одной грядки')) : null,
    );

    const cols = [['v10', v10], ['Документ v11', doc], sim ? [`Симуляция ${simPresetName()}`, fin] : null, [`v10 × K = ${nf(state.K, 2)}`, kk]].filter(Boolean);
    const spec2 = [['Посадка (семя)', (x) => x.seed, 0], ['Продажа', (x) => x.sell, 0], ['Прибыль за сбор', (x) => x.profit, 0], ['🪙 в час', (x) => x.coinsH, 1]];
    const priceTable = table(['', ...cols.map((c2) => c2[0])], spec2.map(([label, f, d]) => [label, ...cols.map(([name, x]) => {
      const v = f(x);
      return name.startsWith('Симуляция') || name.startsWith('v10 × K') ? (v !== f(doc) ? h('b', { style: 'color:var(--terra-d)', title: 'отличается от документа' }, nf(v, d)) : nf(v, d)) : nf(v, d);
    })]), { right: cols.map((_, i) => i + 1) });

    const notes = [];
    if (c.compressed) notes.push(h('div.callout.gold', h('b.t', 'Цена сжата вторым рычагом'), h('span', 'У культур дольше 20 минут прибыль за сбор почти не растёт со временем роста. Деньги за поздние культуры не главные — их держат опыт, редкие ресурсы, заказы и вид грядки.')));
    for (const n of c.notes) notes.push(h('div.callout.terra', h('div.md', { html: spanMd(n) })));

    // стадии роста
    const stageLabels = ['Стадия 1', 'Стадия 2', 'Стадия 3', 'Спелая'];
    const modelVariants = models[0]?.variants || [];
    const stageRows = spec
      ? [...spec.stages.slice(0, 3), spec.ripe].map((t, i) => {
          const v = modelVariants.find((x) => x.stageNo === i + 1);
          const cls = v ? budgetClass(v.tris, v.budget) : '';
          return h('tr', h('td.nowrap', h('b', stageLabels[i])), h('td', { html: spanMd(t) }), h('td.r', v ? h('span.chip' + (cls === 'ok' ? '.green' : cls === 'bad' ? '.terra' : cls === 'mid' ? '.gold' : ''), { title: v.budget ? `ориентир ${nf(v.budget[0])}–${nf(v.budget[1])}` : '' }, '△ ' + nf(v.tris)) : h('span.faint.small', 'нет модели')));
        })
      : [];
    const stageTable = stageRows.length ? h('div.tbl-wrap', h('table.tbl', h('thead', h('tr', h('th', 'Стадия'), h('th', 'Как выглядит (для моделлера)'), h('th.r', 'Треуг.'))), h('tbody', stageRows))) : null;

    const share = sim?.presets?.[sim.primary]?.archetypes;
    const shareChips = share ? ARCH_ORDER.filter((a) => share[a]?.harvestShare?.[c.sim] != null && a !== 'fastNoVan').map((a) => h('span.chip', { style: { borderColor: ARCH_COLORS[a] } }, `${data.archLabels[a] || a}: ${nf(share[a].harvestShare[c.sim] * 100, 1)} %`)) : [];

    const right = h('div',
      h('h4', 'Цифры'), kv,
      h('h4', 'Цены: документ, симуляция, ползунок K'), priceTable,
      h('p.tiny.faint', { style: 'margin:.4rem 0 0' }, 'Жирным отмечено то, что отличается от документа. «По K» считает v10 × K с округлением как в симуляции (вкладка «Экономика»).'),
      notes.length ? h('h4', 'Заметки документа') : null, ...notes,
      stageTable ? h('h4', `Что в грядке: ${spec?.inBed || ''}`) : null, stageTable,
      shareChips.length ? h('h4', 'Доля сборов этой культуры в симуляции') : null,
      shareChips.length ? h('div.row', shareChips) : null,
      h('div.row', { style: 'margin-top:1.1rem' }, h('button.btn.small', { type: 'button', onclick: () => { document.getElementById('dlg').close(); go('economy'); } }, '📈 На экономику')),
    );

    let left;
    let pane = null;
    if (models.length) {
      const sources = models.map((m) => ({ url: url(m.path), label: m.name, variants: m.variants, budget: data.assets.budgets.crop, tris: m.tris }));
      pane = modelPane(sources, {});
      left = pane.host;
    } else {
      left = placeholderPane({ img: iconUrl(c.icon), title: 'Модель в работе', text: 'Ожидается: три стадии роста и спелая. Описание каждой — справа. Как только .glb появится в client/assets/farm/models, пересоберите data.json.' });
    }
    const handle = openDialog({ title: c.name, chips: [h('span.chip.' + g.cls, `${g.emoji} ${g.label}`), h('span.lvl-badge', c.level), h('span.chip', '→ ' + c.product)], left, right });
    if (pane) handle.onClose(() => pane.dispose());
  }

  return {};
}
