import { h, state, mdBlock, spanMd, acc, store, copyText, noRule } from '../lib.js';
import { openDoc, openMd } from '../detail.js';

export function mount(root, { data, go }) {
  const Q = data.editorial?.questions || [];
  const key = (id) => 'q:' + id;
  const status = Object.fromEntries(Q.map((q) => [q.id, store.get(key(q.id), null)]));

  root.appendChild(h('div.sec-head', h('div.eyebrow', 'Вопросы владельцу'), h('h2', 'Что нужно решить'),
    h('p', 'Спорные места, где решение ведущего нужно подтвердить или поменять. У каждого вопроса рекомендация и ссылки на цифры. Отметки сохраняются в этом браузере, в документы ничего не пишется.')));

  const summary = h('div.row', { style: 'gap:10px;margin-bottom:14px' });
  const cards = h('div.grid.g-2');
  function renderSummary() {
    const ok = Q.filter((q) => status[q.id] === 'ok').length;
    const talk = Q.filter((q) => status[q.id] === 'talk').length;
    summary.replaceChildren(
      h('span.chip.green', `принято ${ok}`), h('span.chip.terra', `обсудить ${talk}`), h('span.chip', `без ответа ${Q.length - ok - talk}`),
      h('button.btn.small', { type: 'button', onclick: () => {
        const lines = Q.map((q) => `${status[q.id] === 'ok' ? '[принято]' : status[q.id] === 'talk' ? '[обсудить]' : '[нет ответа]'} ${q.title}`);
        copyText(lines.join('\n')).then(() => { const b = summary.querySelector('.btn'); const t = b.textContent; b.textContent = 'Скопировано'; setTimeout(() => (b.textContent = t), 1400); });
      } }, 'Скопировать ответы'),
      h('button.btn.small', { type: 'button', onclick: () => { Q.forEach((q) => { status[q.id] = null; store.set(key(q.id), null); }); renderAll(); } }, 'Сбросить'));
  }
  function refBtn(r) {
    return h('button.chip-btn', { type: 'button', onclick: () => {
      if (r.doc) openDoc(r.doc);
      else if (r.tab) go(r.tab, r.sub);
      else if (r.loc) { const md = data.location?.md?.[r.loc]; if (md) openMd(r.label, md, 'level.md'); else go('location'); }
    } }, r.label);
  }
  function cardOf(q) {
    const st = status[q.id];
    const set = (v) => { status[q.id] = status[q.id] === v ? null : v; store.set(key(q.id), status[q.id]); renderAll(); };
    return h('div.card.q-card', { dataset: { st: st || '' } },
      h('div.row.between', h('span.chip.' + ({ 'Деньги': 'gold', 'Правила': 'sea', 'Локация': 'green' }[q.tag] || ''), q.tag), st ? h('span.st', { style: { color: st === 'ok' ? 'var(--green-d)' : 'var(--terra-d)' } }, st === 'ok' ? '✓ принято' : '↺ обсудить') : null),
      h('h4', q.title),
      h('p.small', { html: spanMd(q.text) }),
      q.rec ? h('div.rec', h('b', 'Рекомендация: '), h('span', { html: spanMd(q.rec) })) : null,
      h('div.tools',
        ...(q.refs || []).map(refBtn),
        h('button.btn.small' + (st === 'ok' ? '.primary' : ''), { type: 'button', style: 'margin-left:auto', onclick: () => set('ok') }, 'Принять'),
        h('button.btn.small' + (st === 'talk' ? '.gold' : ''), { type: 'button', onclick: () => set('talk') }, 'Обсудить')));
  }
  function renderAll() { renderSummary(); cards.replaceChildren(...Q.map(cardOf)); }
  root.append(summary, cards);
  renderAll();

  if (!Q.length) root.appendChild(h('div.empty', 'Список вопросов пуст: проверьте editorial.json.'));

  // ───── отличия от v10 одним списком ─────
  const groups = {};
  for (const c of data.changes || []) (groups[`${c.section} · ${c.sectionTitle}`] ||= []).push(c.text);
  const gEntries = Object.entries(groups);
  root.appendChild(h('div.block', h('h3', `Все пометки «изм.» в документе (${data.changes?.length || 0})`),
    h('p.lead', 'Каждое место, где v11 не совпадает с v10, помечено «изм.» прямо в тексте. Здесь они собраны по разделам, чтобы пройтись глазами.'),
    ...gEntries.map(([title, items]) => acc(title, h('ul', items.map((t) => h('li', { style: 'margin:.3rem 0', html: spanMd(t) }))), { chip: String(items.length) }))));
  const d192 = data.docs['19.2'];
  const d19 = data.docs['19'];
  if (d19 || d192) root.appendChild(h('div.block', h('h3', 'Раздел 19 документа'), d192 ? acc('19.2 · Сводка отличий', mdBlock(noRule(d192.body)), { chip: 'design-v11.md' }) : null));
  return {};
}
