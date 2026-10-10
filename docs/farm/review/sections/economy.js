import { h, state, emit, nf, hrs, dur, seg, table, mdBlock, spanMd, acc, docAcc, loadChart, ARCH_COLORS, ARCH_ORDER, PRESET_INFO, GROUPS, priceFor, leverParams, scaleCoin, store, iconImg, resByKey, simPresetName, simFinalCrop, md } from '../lib.js';

const SRC_LABEL = { npc: 'Продажа Грибу', van: 'Фургон', orders: 'Заказы', pig: 'Свин (трюфели)', help: 'Помощь соседям' };
const SRC_COLOR = { npc: '#5f8f45', van: '#6f9e8e', orders: '#e2b13c', pig: '#c66f4c', help: '#8a6aa8' };
const PRESET_COLOR = { base: '#b9a46b', tweaked: '#6f9e8e', v11a: '#8a6aa8', v11b: '#e2b13c', v11: '#5f8f45' };

const bandPlugin = {
  id: 'targetBands',
  afterDatasetsDraw(chart, args, opts) {
    const bands = opts?.bands || [];
    const { ctx, scales } = chart;
    const x = scales.x;
    const y = scales.y;
    if (!x || !y) return;
    for (const b of bands) {
      const step = x.getPixelForValue(1) - x.getPixelForValue(0);
      const xc = x.getPixelForValue(b.index);
      const half = Math.abs(step) / 2 * 0.94;
      const y1 = y.getPixelForValue(b.max);
      const y2 = y.getPixelForValue(b.min);
      ctx.save();
      ctx.fillStyle = b.color + '2e';
      ctx.strokeStyle = b.color;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.fillRect(xc - half, y1, half * 2, y2 - y1);
      ctx.strokeRect(xc - half, y1, half * 2, y2 - y1);
      ctx.setLineDash([]);
      ctx.fillStyle = b.color;
      ctx.font = "600 11px Rubik, sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(b.label, xc, y1 - 5);
      ctx.restore();
    }
  },
};
const kMarkerPlugin = {
  id: 'kMarker',
  afterDatasetsDraw(chart, args, opts) {
    if (!opts || opts.value == null) return;
    const { ctx, chartArea, scales } = chart;
    const xp = scales.x.getPixelForValue(opts.value);
    if (xp < chartArea.left || xp > chartArea.right) return;
    ctx.save();
    ctx.strokeStyle = '#a77a0c';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(xp, chartArea.top); ctx.lineTo(xp, chartArea.bottom); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#a77a0c';
    ctx.font = "600 12px Rubik, sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('K = ' + String(opts.value).replace('.', ','), xp, chartArea.top - 6);
    ctx.restore();
  },
};

export async function mount(root, { data, go }) {
  const sim = data.sim;
  root.appendChild(h('div.sec-head', h('div.eyebrow', 'Экономика'), h('h2', 'Деньги, время и ползунок K'), h('p', 'Графики симуляции (results.json) и живой пересчёт цен. Сама симуляция в tools/farm-sim; здесь только чтение её результатов.')));
  if (!sim) {
    root.appendChild(h('div.empty', 'results.json не найден или не читается — графиков нет. Запустите node tools/farm-sim/sim.mjs и пересоберите страницу.'));
    root.append(...[docAcc('9.1'), docAcc('9.2'), docAcc('9.3')].filter(Boolean));
    return {};
  }
  let Chart = null;
  try { Chart = await loadChart(); } catch (e) { root.appendChild(h('div.error', 'Chart.js не загрузился с CDN: графики недоступны, таблицы работают. ' + e.message)); }

  const st = { preset: sim.primary, unit: 'real', log: false, metricInc: 'day', metricDaily: 'level', metricCrop: 'coinsH', kMetric: 'perActiveMin', showNoVan: false };
  const charts = {};
  const mk = (id, canvas, cfg, plugins = []) => {
    if (!Chart) return;
    charts[id]?.destroy();
    charts[id] = new Chart(canvas, { ...cfg, plugins });
  };
  const P = () => sim.presets[st.preset];
  const archs = () => ARCH_ORDER.filter((a) => P().archetypes[a] && (a !== 'fastNoVan' || st.showNoVan));
  const lab = (a) => data.archLabels[a] || a;
  const targets = data.economy.targets;
  const norm = data.economy.norm;

  // ───── выбор пресета ─────
  const presetSeg = seg(sim.presetOrder.map((p) => ({ value: p, label: (PRESET_INFO[p]?.label || p).replace(/ \(.*\)/, ''), title: PRESET_INFO[p]?.text })), st.preset, (v) => { st.preset = v; renderAll(); });
  const presetInfo = h('div.small.muted', { style: 'margin:8px 0 26px' });
  const noVanChk = h('input', { type: 'checkbox', onchange: () => { st.showNoVan = noVanChk.checked; renderAll(); } });
  root.appendChild(h('div.toolbar', h('label', 'Вариант симуляции', presetSeg), h('label', noVanChk, 'показать «только быстрые без Фургона»')));
  root.appendChild(presetInfo);

  // ───── итоговая сводка (таблица) ─────
  const summary = h('div.block');
  root.appendChild(summary);

  // ───── итоговые числа из RESULTS.md ─────
  const R = data.resultsMd;
  const finalBox = h('div.block');
  if (R?.final) {
    finalBox.append(h('h3', 'Итоговые числа v11'), h('p.lead', 'Раздел из tools/farm-sim/RESULTS.md. Если цифры там и в таблицах документа разойдутся, прав RESULTS.md.'), h('div.card.tint-gold', mdBlock(R.final.md.replace(/^## .*\n/, ''))));
  } else if (sim.hasFinal) {
    finalBox.append(h('div.callout.gold', h('b.t', 'Раздела «Итоговые числа v11» в RESULTS.md пока нет'), h('span', 'Цены ниже берутся из results.json (пресет v11). Как только раздел появится в RESULTS.md, страница подхватит его при пересборке data.json.')));
  }
  root.appendChild(finalBox);

  // ───── согласованность документа и симуляции ─────
  const cons = h('div.block');
  root.appendChild(cons);
  (function consistency() {
    const diffs = [];
    for (const c of data.crops) {
      const f = simFinalCrop(c);
      if (!f) continue;
      if (f.seed !== c.seed || f.sell !== c.sell) diffs.push(`${c.name}: документ ${c.seed} → ${c.sell}, симуляция ${f.seed} → ${f.sell}`);
    }
    const total = data.meta.upgradesTotal;
    const simGoals = sim.presets[simPresetName()]?.goals;
    const simTotal = simGoals ? simGoals.reduce((s, g) => s + (g.coins || 0), 0) : null;
    if (!diffs.length) cons.append(h('div.callout.green', h('b.t', 'Документ и симуляция совпадают'), h('span', `Цены посадки и продажи всех ${data.crops.length} культур в таблице раздела 4 равны итоговым ценам симуляции (пресет ${simPresetName()}).`, simTotal != null ? ` Улучшения: ${nf(total)} 🪙 в документе и ${nf(simTotal)} 🪙 в симуляции.` : '')));
    else cons.append(h('div.callout.terra', h('b.t', `Документ и симуляция расходятся по ${diffs.length} культурам`), h('ul', diffs.map((d) => h('li', d))), h('span.small', 'Прав RESULTS.md. Это сигнал ведущему: либо обновить таблицу раздела 4, либо перегнать симуляцию.')));
  })();

  // ───── время до уровней и грядок ─────
  const timeCtl = h('div.toolbar',
    seg([{ value: 'real', label: 'Реальные сутки' }, { value: 'active', label: 'Часы игры' }], st.unit, (v) => { st.unit = v; drawTime(); }),
    h('label', h('input', { type: 'checkbox', onchange: (e) => { st.log = e.target.checked; drawTime(); } }), 'логарифмическая шкала'),
  );
  const cLevels = h('canvas');
  const cBeds = h('canvas');
  const bedsNote = h('p.small.muted', { style: 'margin:.5rem 0 0' });
  root.appendChild(h('div.block',
    h('h3', 'Сколько ждать'),
    h('p.lead', 'Время прогресса от K не зависит: уровни и грядки ограничивают опыт и вторичные ресурсы, а не жетоны. «Реальные сутки» — сколько проходит на часах (растения растут без игрока), «часы игры» — сколько человек реально играет.'),
    timeCtl,
    h('div.grid.g-2',
      h('div.card.chart-card', h('h4', 'До уровня фермы'), h('div.chart-box', cLevels)),
      h('div.card.chart-card', h('h4', 'До грядки (в скобках — уровень-гейт)'), h('div.chart-box', cBeds), bedsNote),
    ),
    acc('Таблица: время до уровней (сутки / часы игры)', h('div', { id: 'lvl-table' }), { chip: 'данные' }),
  ));

  // ───── доход ─────
  const incSeg = seg([{ value: 'day', label: '🪙 в день' }, { value: 'min', label: '🪙 за минуту игры' }], st.metricInc, (v) => { st.metricInc = v; drawIncome(); });
  const cInc = h('canvas');
  const cSrc = h('canvas');
  const dailySeg = seg([{ value: 'level', label: 'Уровень' }, { value: 'beds', label: 'Грядки' }, { value: 'net', label: 'Накопленные 🪙' }], st.metricDaily, (v) => { st.metricDaily = v; drawDaily(); });
  const cDaily = h('canvas');
  root.appendChild(h('div.block',
    h('h3', 'Доход'),
    h('p.lead', 'Чистый доход: продажи, Фургон, заказы, свин и помощь минус семена. Офлайн-рост учтён. Рамки с пунктиром — цель ведущего на финале.'),
    h('div.grid.g-2',
      h('div.card.chart-card', h('div.row.between', h('h4', 'По этапам игры'), incSeg), h('div.chart-box.tall', cInc), h('div.small.muted', { id: 'inc-note', style: 'margin-top:.4rem' })),
      h('div.card.chart-card', h('h4', 'Откуда приходят деньги'), h('p.tiny.faint', { style: 'margin:0' }, 'Доля источников за весь путь до полного прохождения.'), h('div.chart-box.tall', cSrc)),
    ),
    h('div.card.chart-card', { style: 'margin-top:14px' }, h('div.row.between', h('h4', 'Как растёт фермер по дням'), dailySeg), h('div.chart-box', cDaily)),
  ));

  // ───── рычаги ─────
  const cLever = h('canvas');
  const lt = data.economy.leverTable;
  root.appendChild(h('div.block',
    h('h3', 'Второй рычаг: почему поздние культуры сжаты'),
    h('p.lead', 'Одним K поздний доход не исправить: без рычага финал даёт в 15–65 раз больше ранней игры. Ведущий сжал цены культур дольше 20 минут и добавил мягкий дневной потолок продаж. На графике — финальный доход по вариантам симуляции (логарифмическая шкала).'),
    h('div.grid.g-2',
      h('div.card.chart-card', h('h4', '🪙 в день на финале по вариантам'), h('div.chart-box.tall', cLever)),
      h('div.card', h('h4', 'Что делает рычаг'), mdBlock(data.economy.lever.split('\n').filter((l) => /^\d\.|^   -|^- /.test(l) || /^\s+/.test(l)).slice(0, 14).join('\n') || data.economy.lever)),
    ),
    lt ? h('div', { style: 'margin-top:12px' }, h('p.small.muted', 'Таблица из раздела 9.3:'), table(lt.header, lt.rows, { right: [1, 2, 3, 4, 5], rowClass: (r, i) => (i === lt.boldRow ? 'hl' : '') })) : null,
  ));

  // ───── ценность поздних культур (19.1) ─────
  if (data.late?.rows?.length) {
    root.appendChild(h('div.block',
      h('h3', data.late.title),
      h('div.callout.gold', mdBlock(data.late.intro)),
      h('div.grid.g-3', data.late.rows.map((r) => h('div.card', h('h4', { style: 'font-size:1.02rem;margin-bottom:.4rem' }, r.what), h('p.small', { html: spanMd(r.numbers) }), h('p.small.muted', { style: 'margin:0' }, h('b', 'Почему хочется: '), r.why)))),
      data.late.outro ? h('p.small.muted', { style: 'margin-top:.8rem', html: spanMd(data.late.outro) }) : null,
    ));
  }

  // ───── доходность культур ─────
  const cropSeg = seg([{ value: 'coinsH', label: '🪙 в час' }, { value: 'profit', label: 'Прибыль за сбор' }, { value: 'xpH', label: 'XP в час' }, { value: 'secH', label: 'Ресурс в час' }], st.metricCrop, (v) => { st.metricCrop = v; drawCrops(); });
  const cCrops = h('canvas');
  root.appendChild(h('div.block',
    h('h3', 'Доходность культур'),
    h('p.lead', 'С одной грядки, при поливе не учитывается. Зелёные столбики — цены документа, золотые — пересчёт по ползунку K ниже (двигайте, и они меняются на лету).'),
    h('div.card.chart-card', h('div.row.between', h('h4', 'Культуры в порядке открытия'), cropSeg), h('div.chart-box.tall', { style: 'height:620px' }, cCrops)),
  ));

  // ───── ползунок K ─────
  const kBox = h('div.block');
  root.appendChild(kBox);
  const kRange = h('input', { type: 'range', min: 0.05, max: 1, step: 0.05, value: state.K, class: 'wide', 'aria-label': 'Коэффициент K' });
  const kOut = h('div.k-big');
  const leverChk = h('input', { type: 'checkbox', checked: state.lever, onchange: () => { state.lever = leverChk.checked; store.set('lever', state.lever); kUpdate(); } });
  const kReset = h('button.btn.small', { type: 'button', onclick: () => { const base = sim.presets[sim.primary]?.K ?? data.economy.kDoc ?? 0.1; kRange.value = base; kUpdate(); } }, '↺ как в документе');
  const kChecks = h('div.kv', { style: 'grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:14px' });
  const kCrops = h('div');
  const kUp = h('div');
  const kOrders = h('div');
  const cK = h('canvas');
  const kMetricSeg = seg([{ value: 'perActiveMin', label: '🪙 за минуту (весь путь)' }, { value: 'endPerActiveMin', label: '🪙 за минуту (финал)' }, { value: 'perDay', label: '🪙 в день (весь путь)' }, { value: 'endPerDay', label: '🪙 в день (финал)' }], st.kMetric, (v) => { st.kMetric = v; drawK(); });
  const lp = leverParams();
  kBox.append(
    h('h3', 'Ползунок K'),
    h('p.lead', 'Все монетные числа v10 умножаются на K с округлением как в симуляции: цены культур, трюфель и помощь — до целого (не меньше 1), крупные суммы — до 10 и до 50. XP, ресурсы, шансы и время роста от K не зависят.'),
    h('div.k-panel',
      h('div.row', { style: 'gap:24px;align-items:flex-end' },
        h('div', h('div.small.muted', 'Коэффициент K'), kOut),
        h('div', { style: 'flex:1;min-width:260px' }, kRange, h('div.k-ticks', ['0,05', '0,25', '0,5', '0,75', '1'].map((t) => h('span', t)))),
        h('div.stack', kReset, lp ? h('label.small', leverChk, ` второй рычаг (сжатие культур дольше ${lp.fromMin} мин)`) : null),
      ),
    ),
    kChecks,
    h('div', { style: 'margin-top:18px' }, h('h4', { style: 'margin-bottom:.5rem' }, 'Культуры при выбранном K'), kCrops),
    h('div.grid.g-2', { style: 'margin-top:18px' },
      h('div', h('h4', { style: 'margin-bottom:.5rem' }, 'Улучшения, трюфель, помощь'), kUp),
      h('div', h('h4', { style: 'margin-bottom:.5rem' }, 'Награды заказов'), kOrders),
    ),
    h('div.card.chart-card', { style: 'margin-top:14px' }, h('div.row.between', h('h4', 'Что делает K с доходом (таблица K из симуляции)'), kMetricSeg), h('p.tiny.faint', { style: 'margin:.2rem 0 0' }, sim.kTable ? 'Пресет base (цены v10 × K, без рычагов), по 200 прогонов на точку. Зелёная полоса — норма режимов 8–15 🪙 в минуту игры. Золотая линия — текущий K.' : 'Таблицы K в results.json нет.'), h('div.chart-box', cK)),
  );

  // ───── подробности из документов ─────
  const more = h('div.block', h('h3', 'Подробнее из документов'));
  for (const sec of R?.sections || []) {
    if (/Итоговые числа/i.test(sec.title)) continue;
    more.appendChild(acc(sec.title, mdBlock(sec.md.replace(/^## .*\n/, '')), { chip: 'RESULTS.md' }));
  }
  for (const n of ['9.1', '9.2', '9.3', '9.4', '9.5']) { const a = docAcc(n); if (a) more.appendChild(a); }
  root.appendChild(more);

  // ═════════ отрисовка ═════════
  function renderAll() {
    const info = PRESET_INFO[st.preset];
    presetInfo.textContent = (info ? info.text + ' ' : '') + `K = ${nf(P().K, 2)}.`;
    drawSummary(); drawTime(); drawIncome(); drawDaily(); drawLever(); drawCrops(); drawK(); drawLevelTable();
  }

  function drawSummary() {
    const A = P().archetypes;
    const rows = archs().map((a) => {
      const X = A[a];
      const l13 = X.levels['13']?.real;
      const comp = X.complete?.real;
      const fin = X.finale;
      const t = a === 'casual' ? targets?.casual : a === 'active' ? targets?.active : null;
      let verdict = null;
      if (t && fin) verdict = fin.netPerDay >= t[0] && fin.netPerDay <= t[1] * 1.03 ? h('span.chip.green', '✓ в цели') : fin.netPerDay > t[1] ? h('span.chip.terra', 'выше цели') : h('span.chip.gold', 'ниже цели');
      const sched = R?.archetypes?.find((x) => x.label === lab(a));
      return [
        h('div', h('b', lab(a)), sched ? h('div.tiny.faint', sched.schedule) : null),
        l13?.reached >= 0.5 ? `${nf(l13.mean / 24, 1)} сут` : 'не достигается',
        comp?.reached >= 0.5 ? `${nf(comp.mean / 24, 1)} сут · ${nf(X.complete.active.mean, 0)} ч игры` : 'не достигается',
        fin ? nf(fin.netPerDay) : '—',
        fin ? nf(fin.perActiveMin, 1) : '—',
        t ? `${nf(t[0])}–${nf(t[1])}` : '—',
        verdict,
      ];
    });
    summary.replaceChildren(
      h('h3', 'Сводка по архетипам игроков'),
      h('p.lead', 'Четыре расписания игры: от казуала на 18 минут в день до нон-стопа. Доход — на финале, когда всё построено.'),
      table(['Архетип', 'До ур. 13', 'Всё построено', '🪙 в день, финал', '🪙 за минуту игры', 'Цель в день', ''], rows, { right: [3, 4] }),
    );
  }

  function seriesTime(kind) {
    return archs().map((a) => {
      const X = P().archetypes[a];
      const keys = kind === 'levels' ? Object.keys(X.levels).map(Number).sort((p, q) => p - q) : Object.keys(X.beds).map(Number).sort((p, q) => p - q);
      return { a, keys, X };
    });
  }
  function drawTime() {
    const unit = st.unit;
    const val = (s) => (s && s.reached >= 0.5 && s.mean != null ? (unit === 'real' ? s.mean / 24 : s.mean) : null);
    const ylab = unit === 'real' ? 'суток' : 'часов игры';
    const fmt = (v) => (unit === 'real' ? hrs(v * 24) : `${nf(v, 1)} ч игры`);
    const yScale = { type: st.log ? 'logarithmic' : 'linear', title: { display: true, text: ylab }, beginAtZero: !st.log, grid: { color: '#efe4c6' }, ticks: { callback: (v) => nf(v) } };
    // уровни
    const levelKeys = Object.keys(P().archetypes[archs()[0]].levels).map(Number).sort((a, b) => a - b);
    mk('levels', cLevels, {
      type: 'line',
      data: { labels: levelKeys.map((l) => 'ур. ' + l), datasets: archs().map((a) => ({ label: lab(a), data: levelKeys.map((L) => val(P().archetypes[a].levels[L]?.[unit])), borderColor: ARCH_COLORS[a], backgroundColor: ARCH_COLORS[a], tension: 0.25, pointRadius: 3.5, borderWidth: 2.5, spanGaps: false })) },
      options: { scales: { y: yScale, x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y == null ? 'не достигается' : fmt(c.parsed.y)}` } } }, interaction: { mode: 'index', intersect: false } },
    });
    // грядки
    const bedKeys = Object.keys(P().archetypes[archs()[0]].beds).map(Number).sort((a, b) => a - b);
    const gate = (n) => P().archetypes[archs()[0]].beds[n]?.gate;
    mk('beds', cBeds, {
      type: 'bar',
      data: { labels: bedKeys.map((n) => `№${n} (ур. ${gate(n)})`), datasets: archs().map((a) => ({ label: lab(a), data: bedKeys.map((n) => val(P().archetypes[a].beds[n]?.[unit])), backgroundColor: ARCH_COLORS[a], borderRadius: 5, maxBarThickness: 26 })) },
      options: { scales: { y: yScale, x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y == null ? 'недоступно' : fmt(c.parsed.y)}` } } } },
    });
    const never = [];
    for (const a of archs()) for (const n of bedKeys) { const s = P().archetypes[a].beds[n]?.real; if (!s || s.reached < 0.5) never.push([a, n]); }
    if (never.length) {
      const byA = {};
      never.forEach(([a, n]) => (byA[a] ||= []).push(n));
      bedsNote.textContent = Object.entries(byA).map(([a, ns]) => `«${lab(a)}»: грядки ${ns.join(', ')} недоступны`).join('; ') + '. Новые грядки покупаются за редкие ресурсы, а они падают только с долгих культур (см. «Поздние культуры» ниже), поэтому быстрыми культурами здесь не обойтись.';
    } else bedsNote.textContent = '';
  }

  function drawLevelTable() {
    const holder = root.querySelector('#lvl-table');
    if (!holder) return;
    const A = P().archetypes;
    const keys = Object.keys(A[archs()[0]].levels).map(Number).sort((a, b) => a - b);
    const rows = archs().map((a) => [lab(a), ...keys.map((L) => { const s = A[a].levels[L]; return s?.real?.reached >= 0.5 ? `${nf(s.real.mean / 24, 1)} / ${nf(s.active.mean, 1)}` : '—'; })]);
    holder.replaceChildren(table(['Архетип', ...keys.map((k) => 'ур. ' + k)], rows, { right: keys.map((_, i) => i + 1) }), h('p.tiny.faint', 'Ячейка: реальные сутки / часы игры (среднее по прогонам).'));
  }

  function drawIncome() {
    const A = P().archetypes;
    const first = A[archs()[0]];
    const phaseLabels = first.income.phases.map((p) => p.label);
    const labels = [...phaseLabels, 'финал'];
    const day = st.metricInc === 'day';
    const bands = [];
    if (day && targets) {
      const idx = labels.length - 1;
      if (archs().includes('casual')) bands.push({ index: idx, min: targets.casual[0], max: targets.casual[1], color: ARCH_COLORS.casual, label: 'цель казуала' });
      if (archs().includes('active')) bands.push({ index: idx, min: targets.active[0], max: targets.active[1], color: ARCH_COLORS.active, label: 'цель активного' });
    }
    mk('inc', cInc, {
      type: 'bar',
      data: { labels, datasets: archs().map((a) => ({ label: lab(a), data: [...A[a].income.phases.map((p) => (day ? p.netPerDay : p.netPerActiveMin)), A[a].finale ? (day ? A[a].finale.netPerDay : A[a].finale.perActiveMin) : null], backgroundColor: ARCH_COLORS[a], borderRadius: 5, maxBarThickness: 30 })) },
      options: { scales: { y: { beginAtZero: true, title: { display: true, text: day ? 'жетонов в день' : 'жетонов за минуту игры' }, grid: { color: '#efe4c6' }, ticks: { callback: (v) => nf(v) } }, x: { grid: { display: false } } }, plugins: { targetBands: { bands }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${nf(c.parsed.y, day ? 0 : 1)} жет.` } } } },
    }, [bandPlugin]);
    const note = root.querySelector('#inc-note');
    if (note) note.textContent = day ? 'Финал: 7 суток после полного прохождения (у «только быстрых» — на ур. 13).' : `Норма режимов: ${norm ? norm.join('–') : '8–15'} 🪙 в минуту игры. Казуал выше нормы — это свойство idle: урожай растёт без игрока.`;

    // источники
    const keys = ['npc', 'van', 'orders', 'pig', 'help'];
    const archList = archs();
    mk('src', cSrc, {
      type: 'bar',
      data: { labels: archList.map(lab), datasets: keys.map((k) => ({ label: SRC_LABEL[k], backgroundColor: SRC_COLOR[k], data: archList.map((a) => { const b = A[a].income.bySource; const tot = keys.reduce((s, kk) => s + (b[kk] || 0), 0); return tot ? ((b[k] || 0) / tot) * 100 : 0; }) })) },
      options: { indexAxis: 'y', scales: { x: { stacked: true, max: 100, ticks: { callback: (v) => v + ' %' }, grid: { color: '#efe4c6' } }, y: { stacked: true, grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${nf(c.parsed.x, 0)} %` } } } },
    });
  }

  function drawDaily() {
    const m = st.metricDaily;
    const idx = { level: 1, beds: 2, net: 3 }[m];
    mk('daily', cDaily, {
      type: 'line',
      data: { datasets: archs().map((a) => ({ label: lab(a), data: P().archetypes[a].daily.map((d) => ({ x: d[0], y: d[idx] })), borderColor: ARCH_COLORS[a], backgroundColor: ARCH_COLORS[a], pointRadius: 0, borderWidth: 2.5, tension: 0.2, parsing: false })) },
      options: { scales: { x: { type: 'linear', title: { display: true, text: 'сутки от начала' }, grid: { color: '#efe4c6' } }, y: { beginAtZero: true, title: { display: true, text: { level: 'уровень фермы', beds: 'открыто грядок', net: 'чистых жетонов накоплено' }[m] }, grid: { color: '#efe4c6' }, ticks: { callback: (v) => nf(v) } } }, interaction: { mode: 'nearest', axis: 'x', intersect: false }, plugins: { tooltip: { callbacks: { title: (it) => `сутки ${nf(it[0].parsed.x)}` } } } },
    });
  }

  function drawLever() {
    const order = sim.presetOrder;
    const archList = ['casual', 'active', 'fast', 'nonstop'].filter((a) => sim.presets[order[0]].archetypes[a]);
    const bands = [];
    if (targets) {
      const ci = archList.indexOf('casual');
      const ai = archList.indexOf('active');
      if (ci >= 0) bands.push({ index: ci, min: targets.casual[0], max: targets.casual[1], color: ARCH_COLORS.casual, label: 'цель' });
      if (ai >= 0) bands.push({ index: ai, min: targets.active[0], max: targets.active[1], color: ARCH_COLORS.active, label: 'цель' });
    }
    mk('lever', cLever, {
      type: 'bar',
      data: { labels: archList.map(lab), datasets: order.map((p) => ({ label: PRESET_INFO[p]?.label || p, backgroundColor: PRESET_COLOR[p] || '#999', borderRadius: 4, data: archList.map((a) => sim.presets[p].archetypes[a]?.finale?.netPerDay ?? null), maxBarThickness: 28 })) },
      options: { scales: { y: { type: 'logarithmic', title: { display: true, text: 'жетонов в день, лог. шкала' }, grid: { color: '#efe4c6' }, ticks: { callback: (v) => ([1, 10, 100, 1000, 10000, 100000].includes(v) ? nf(v) : '') } }, x: { grid: { display: false } } }, plugins: { targetBands: { bands }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${nf(c.parsed.y)} жетонов в день` } } } },
    }, [bandPlugin]);
  }

  function cropValue(c, mode) {
    const p = priceFor(c, mode);
    const row = P().cropRows?.find((r) => r.sim === c.sim);
    switch (st.metricCrop) {
      case 'coinsH': return p.coinsH;
      case 'profit': return p.profit;
      case 'xpH': return p.xpH;
      case 'secH': return row?.secPerH ?? +(((c.secChance || 0) / 100) * 60 / c.minutes).toFixed(2);
      default: return null;
    }
  }
  function drawCrops() {
    const dsDoc = data.crops.map((c) => cropValue(c, 'doc'));
    const dsK = data.crops.map((c) => cropValue(c, 'k'));
    const same = st.metricCrop === 'xpH' || st.metricCrop === 'secH';
    const ylab = { coinsH: 'жетонов в час', profit: 'прибыль за сбор, жетонов', xpH: 'XP в час', secH: 'ресурса в час' }[st.metricCrop];
    mk('crops', cCrops, {
      type: 'bar',
      data: { labels: data.crops.map((c) => `${c.name} (ур. ${c.level})`), datasets: [{ label: 'Документ', data: dsDoc, backgroundColor: '#8ab864', borderRadius: 4 }, ...(same ? [] : [{ label: `v10 × K = ${nf(state.K, 2)}`, data: dsK, backgroundColor: '#e2b13c', borderRadius: 4 }])] },
      options: { indexAxis: 'y', scales: { x: { beginAtZero: true, title: { display: true, text: ylab }, grid: { color: '#efe4c6' } }, y: { grid: { display: false }, ticks: { font: { size: 12 } } } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${nf(c.parsed.x, 1)}` } } } },
    });
  }

  // ───── K ─────
  function kUpdate() {
    state.K = +(+kRange.value).toFixed(2);
    store.set('K', state.K);
    kOut.textContent = String(state.K).replace('.', ',');
    const lever = state.lever && !!lp;
    // культуры
    const rows = data.crops.map((c) => {
      const p = priceFor(c, 'k', state.K, lever);
      const d = priceFor(c, 'doc');
      const lowCls = p.profit < 1;
      return { c, p, d, lowCls };
    });
    const maxH = Math.max(...rows.map((r) => r.p.coinsH), 1);
    kCrops.replaceChildren(h('div.tbl-wrap', h('table.tbl',
      h('thead', h('tr', h('th', 'Культура'), h('th.r', 'v10'), h('th.r', 'семя'), h('th.r', 'продажа'), h('th.r', 'прибыль'), h('th', '🪙 в час'))),
      h('tbody', rows.map(({ c, p, lowCls }) => h('tr', { class: lowCls ? 'hl' : '' },
        h('td.nowrap', h('span', { style: 'display:inline-flex;align-items:center;gap:6px' }, iconImg(c.icon, '', ''), h('span', c.name), h('span.tiny.faint', c.growText))),
        h('td.r.faint.small.nowrap', `${nf(c.seedV10)} → ${nf(c.sellV10)}`),
        h('td.r', nf(p.seed)), h('td.r', nf(p.sell)), h('td.r', nf(p.profit)),
        h('td', { style: 'min-width:120px' }, h('div', { style: 'display:flex;align-items:center;gap:6px' }, h('div', { style: `height:8px;border-radius:5px;background:${GROUPS[c.group].cls === 'green' ? '#8ab864' : GROUPS[c.group].cls === 'gold' ? '#e2b13c' : '#c66f4c'};width:${Math.max(2, (p.coinsH / maxH) * 70)}px` }), h('span.small.num', nf(p.coinsH, 1)))),
      ))),
    )));
    // проверки
    const minRow = rows.reduce((m, r) => (r.p.profit < m.p.profit ? r : m), rows[0]);
    const low = rows.filter((r) => r.lowCls).length;
    const sorted = [...rows].sort((a, b) => a.c.minutes - b.c.minutes || a.c.level - b.c.level);
    const long = sorted.filter((r) => r.c.minutes > (lp?.fromMin ?? 20));
    let mono = true;
    for (let i = 1; i < long.length; i++) if (long[i].p.coinsH > long[i - 1].p.coinsH + 1e-9 && long[i].c.minutes > long[i - 1].c.minutes) mono = false;
    // порядок относительно v10 (по 🪙/ч)
    let inv = 0; let pairs = 0;
    const v10h = (r) => ((r.c.sellV10 - r.c.seedV10) * 60) / r.c.minutes;
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const a = v10h(rows[i]); const b = v10h(rows[j]);
      if (Math.abs(a - b) < 1e-9) continue;
      pairs++;
      if ((a > b) !== (rows[i].p.coinsH > rows[j].p.coinsH) && rows[i].p.coinsH !== rows[j].p.coinsH) inv++;
    }
    const upTotal = data.upgrades.reduce((s, u) => s + (u.cost ? scaleCoin(u.costV10, state.K, 'cost') : 0), 0);
    kChecks.replaceChildren(...[
      h('div' + (low ? '.warn' : '.good'), h('div.k', 'Культур с прибылью < 1 🪙'), h('div.v', nf(low)), h('div.s', low ? `например ${minRow.c.name}: ${nf(minRow.p.profit)}` : `минимум: ${minRow.c.name} — ${nf(minRow.p.profit)}`)),
      h('div' + (lever ? '' : inv ? '.warn' : '.good'), h('div.k', 'Порядок 🪙/ч против v10'), h('div.v', lever ? '—' : `${nf(inv)} из ${nf(pairs)}`), h('div.s', lever ? 'со сжатием порядок намеренно меняется' : 'пар, поменявшихся местами из-за округления')),
      lever ? h('div' + (mono ? '.good' : '.warn'), h('div.k', '🪙/ч падает с ростом времени'), h('div.v', mono ? 'да' : 'нет'), h('div.s', `у культур дольше ${lp.fromMin} мин`)) : null,
      h('div', h('div.k', 'Все улучшения вместе'), h('div.v', `${nf(upTotal)} 🪙`), h('div.s', `в документе: ${nf(data.meta.upgradesTotal)} 🪙 при K = ${nf(sim.presets[sim.primary]?.K ?? data.economy.kDoc, 2)}`)),
    ].filter(Boolean));
    // улучшения и прочее
    const upRows = data.upgrades.filter((u) => u.costV10).map((u) => [u.name, `ур. ${u.level}`, nf(u.costV10), h('b', `${nf(scaleCoin(u.costV10, state.K, 'cost'))} 🪙`)]);
    const other = data.economy.coins.filter((c) => c.v10num != null).map((c) => {
      const small = /Помощь|Трюфель/.test(c.what);
      return [c.what, '', nf(c.v10num), h('b', `${nf(scaleCoin(c.v10num, state.K, small ? 'item' : 'cost'))} 🪙`)];
    });
    kUp.replaceChildren(table(['Что', 'Уровень', 'v10', 'при K'], [...upRows, ...other], { right: [2, 3] }));
    // заказы
    const ords = data.orders.templates.filter((o) => o.coinsV10).slice(0, 40).map((o) => [o.type, o.name, nf(o.coinsV10), h('b', `${nf(scaleCoin(o.coinsV10, state.K, 'cost'))} 🪙`)]);
    kOrders.replaceChildren(h('div', { style: 'max-height:360px;overflow:auto;border-radius:14px' }, table(['Тип', 'Заказ', 'v10', 'при K'], ords, { right: [2, 3] })));
    drawCrops();
    drawK();
    emit('K');
  }
  kRange.addEventListener('input', kUpdate);

  function drawK() {
    if (!Chart) return;
    if (!sim.kTable) { charts.k?.destroy(); return; }
    const m = st.kMetric;
    const Ks = sim.kTable.map((r) => r.K).sort((a, b) => a - b);
    const archList = ['casual', 'active', 'fast', 'nonstop'].filter((a) => sim.kTable[0].arch[a]);
    const ds = archList.map((a) => ({ label: lab(a), data: sim.kTable.slice().sort((p, q) => p.K - q.K).map((r) => ({ x: r.K, y: r.arch[a][m] })), borderColor: ARCH_COLORS[a], backgroundColor: ARCH_COLORS[a], tension: 0.2, pointRadius: 4, borderWidth: 2.5, parsing: false }));
    // точки v11 при K из пресета
    const pv = sim.presets.v11;
    if (pv) {
      const pts = archList.map((a) => {
        const X = pv.archetypes[a];
        if (!X) return null;
        const y = m === 'perActiveMin' ? X.income.netPerActiveMin : m === 'perDay' ? X.income.netPerDay : m === 'endPerActiveMin' ? X.finale?.perActiveMin : X.finale?.netPerDay;
        return y != null ? { x: pv.K, y, a } : null;
      }).filter(Boolean);
      ds.push({ label: 'v11 (K + рычаги)', data: pts, borderColor: '#3a2e22', backgroundColor: '#fff', pointStyle: 'rectRot', pointRadius: 6, pointBorderWidth: 2, showLine: false, parsing: false });
    }
    const isMin = m.endsWith('Min') || m.includes('Min');
    mk('k', cK, {
      type: 'line',
      data: { datasets: ds },
      options: {
        scales: {
          x: { type: 'logarithmic', min: 0.04, max: 1.3, title: { display: true, text: 'K' }, ticks: { callback: (v) => ([0.05, 0.1, 0.2, 0.5, 1].includes(+v.toFixed(2)) ? String(+v.toFixed(2)).replace('.', ',') : '') }, grid: { color: '#efe4c6' } },
          y: { type: 'logarithmic', title: { display: true, text: isMin ? 'жетонов за минуту игры' : 'жетонов в день' }, grid: { color: '#efe4c6' }, ticks: { callback: (v) => ([1, 10, 100, 1000, 10000, 100000].includes(v) ? nf(v) : '') } },
        },
        plugins: { kMarker: { value: state.K }, tooltip: { callbacks: { title: (it) => `K = ${String(it[0].parsed.x).replace('.', ',')}`, label: (c) => `${c.dataset.label}: ${nf(c.parsed.y, 1)}` } } },
      },
    }, [kMarkerPlugin, { id: 'normBand', beforeDatasetsDraw(chart) { if (!norm || !isMin) return; const { ctx, chartArea, scales } = chart; const y1 = scales.y.getPixelForValue(norm[1]); const y2 = scales.y.getPixelForValue(norm[0]); ctx.save(); ctx.fillStyle = 'rgba(95,143,69,0.14)'; ctx.fillRect(chartArea.left, y1, chartArea.right - chartArea.left, y2 - y1); ctx.fillStyle = '#3d6a33'; ctx.font = '600 11px Rubik'; ctx.fillText(`норма ${norm[0]}–${norm[1]}`, chartArea.left + 6, y1 + 12); ctx.restore(); } }]);
  }

  kRange.value = state.K;
  kUpdate();
  renderAll();
  return {};
}
