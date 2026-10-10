import { h, state, url, iconUrl, mdBlock, mdBullets, nf, acc, spanMd, cap } from '../lib.js';
import { readiness } from '../modelutil.js';

export function mount(root, { go, data }) {
  const ed = data.editorial || {};
  const sim = data.sim;
  const P = sim?.presets?.[sim.primary];
  const renderPlot = data.renders.find((r) => /^plot$/i.test(r.name)) || data.renders.find((r) => /plot|bed/i.test(r.name));

  // ───── герой ─────
  const floats = [
    ['radish', '6%', '8%', '-8deg'], ['pumpkin', '78%', '4%', '7deg'], ['strawberry', '2%', '66%', '5deg'], ['golden-apple', '82%', '70%', '-6deg'], ['sunflower-seeds', '44%', '-2%', '4deg'],
  ];
  const art = h('div.art',
    renderPlot ? h('img.main', { src: url(renderPlot.path), alt: 'Участок фермы — рендер модели' }) : null,
    floats.map(([ic, left, top, r], i) => (iconUrl(ic) ? h('img.float', { src: iconUrl(ic), alt: '', style: { left, top, '--r': r, animationDelay: i * 0.6 + 's' } }) : null)),
  );
  const hero = h('div.hero',
    h('div',
      h('div.eyebrow', 'Новый режим · обзор для владельца'),
      h('h1', 'Ферма', h('em', '.')),
      h('p.sub', 'Уютный участок на холме у моря: посадил, ушёл, вернулся — урожай ждёт. Здесь можно оценить геймдизайн, баланс, локацию и модели до того, как режим пойдёт в игру.'),
      h('div.row',
        h('button.btn.primary', { type: 'button', onclick: () => go('path') }, 'Путь игрока →'),
        h('button.btn', { type: 'button', onclick: () => go('questions') }, 'Что нужно решить'),
      ),
      h('div.row', { style: 'margin-top:1rem' },
        h('span.chip', data.cover.headerLine || 'геймдизайн v11'),
        h('span.chip.gold', 'без sci-fi и неона'),
      ),
    ),
    art,
  );

  // ───── цифры ─────
  const ready = readiness();
  const mFound = ready.reduce((a, r) => a + Math.min(r.found, r.expected), 0);
  const mExp = ready.reduce((a, r) => a + r.expected, 0);
  const K = P?.K ?? data.economy.kDoc;
  const stats = h('div.stats',
    [
      [data.crops.length, 'культур'],
      [data.levels.unlock.length, 'уровней фермы'],
      [data.location?.counts.plots ?? 20, 'участков в одной комнате'],
      [data.achievements.length, 'достижений'],
      [data.pets.length, 'ходячих питомцев'],
      [K != null ? nf(K, 2) : '—', 'K: цены v10 × K'],
      [`${nf(mFound)} / ${nf(mExp)}`, '3D-моделей готово'],
    ].map(([n, l]) => h('div.stat', h('b', n), h('span', l))),
  );

  // ───── что это ─────
  const about = mdBullets(data.cover.zero);
  const aboutBlock = h('div.block', h('h3', 'Что это'), h('div.about', about.map((a) => h('div.card', h('h4', a.title), h('p', { html: spanMd(a.text) })))));

  // ───── главные решения ─────
  const picks = ed.cover?.decisions || [];
  const decisionCards = picks.map((p) => {
    const items = p.ids.map((id) => data.decisions.find((d) => d.id === id)).filter(Boolean);
    if (!items.length) return null;
    return h('div.card.decision',
      h('div.ico', p.icon || '★'),
      h('div', h('div.no', 'Решение ' + p.ids.join(' + ')), h('h4', p.short || items[0].title)),
      h('div', items.map((it) => h('p', { html: spanMd(cap(it.text)) }))),
    );
  }).filter(Boolean);
  const decisionBlock = h('div.block',
    h('h3', 'Пять главных решений владельца'),
    h('p.lead', 'Ответы владельца на 20 вопросов — это рамка всего режима. Где документ v10 расходится с ними, прав список ответов.'),
    h('div.grid.g-auto-lg', decisionCards),
    h('details.acc', { style: 'margin-top:12px' }, h('summary', `Все ответы владельца (${data.decisions.length})`), h('div.acc-body', h('ol', { style: 'padding-left:1.2rem' }, data.decisions.map((d) => h('li', { style: 'margin:.3rem 0' }, h('b', d.title + ': '), d.text))))),
  );

  // ───── отличия от v10 ─────
  const diffCards = data.diffs.map((r) => h('div.card.diff',
    h('div.no', /^\d+$/.test(r.no) || /–/.test(r.no) ? 'Пункт ' + r.no : r.no),
    h('h4', r.topic),
    h('p.small', { style: 'margin:0', html: spanMd(r.decision) }),
    r.why ? h('div.why', h('b', 'Почему: '), h('span', { html: spanMd(r.why) })) : null,
  ));
  const picked = (ed.diffsPick || []).map((k) => ed.quotes?.find((q) => q.key === k)).filter(Boolean);
  const extra = picked.map((q) => h('div.card.diff', h('div.no', 'изм. против v10'), h('h4', q.title), h('p.small', { style: 'margin:0', html: spanMd(cap(q.text.replace(/^изм\.:?,?\s*/i, ''))) })));
  const diffBlock = h('div.block',
    h('h3', 'Ключевые отличия от v10 и почему'),
    h('p.lead', data.diffsNote ? data.diffsNote.replace(/Ещё одно решение.*$/, '').trim() : 'Решения ведущего по пунктам 7 и 9–17 и самые заметные «изм.» документа. Причина — рядом с каждым.'),
    h('div.grid.g-2', diffCards),
    extra.length ? h('h3', { style: 'margin-top:1.6rem' }, 'Ещё заметные изменения') : null,
    extra.length ? h('div.grid.g-2', extra) : null,
    data.diffsV10.length ? h('div', { style: 'margin-top:1.2rem' }, h('h3', { style: 'font-size:1.1rem' }, 'Сводка отличий'), data.diffsV10.map((g, i) => acc(g.title, h('ul', g.items.map((it) => h('li', { html: spanMd(it) }))), { open: false, chip: String(g.items.length) }))) : null,
  );

  // ───── готовность моделей ─────
  const readyBlock = h('div.block',
    h('h3', 'Готовность 3D'),
    h('p.lead', 'Художники сейчас добавляют модели в client/assets/farm/models. Пересоберите data.json — и они появятся на странице.'),
    h('div.ready-grid', ready.map((r) => {
      const pct = r.expected ? Math.min(100, Math.round((r.found / r.expected) * 100)) : 0;
      return h('button.ready-cell', { type: 'button', style: 'text-align:left;cursor:pointer', onclick: () => go('models') },
        h('div.row.between', h('span.small.muted', r.label), h('small', `${pct}%`)),
        h('b', `${nf(r.found)}`), h('small', ` из ${nf(r.expected)}`),
        h('div.ready-bar', { style: 'margin-top:6px' }, h('i', { style: { width: pct + '%' } })),
        h('div.tiny.faint', { style: 'margin-top:4px' }, r.note));
    })),
  );

  // ───── что смотреть ─────
  const look = h('div.block', h('h3', 'Что здесь можно потрогать'), h('div.grid.g-3', (ed.cover?.lookAt || []).map((l) => h('button.card', { type: 'button', onclick: () => go(l.tab) }, h('div', { style: 'font-size:2rem;line-height:1' }, l.icon), h('h4', { style: 'margin:.4rem 0 .2rem' }, l.title), h('p.small.muted', { style: 'margin:0' }, l.text)))));

  root.append(hero, stats, aboutBlock, decisionBlock, diffBlock, readyBlock, look);
  return {};
}
