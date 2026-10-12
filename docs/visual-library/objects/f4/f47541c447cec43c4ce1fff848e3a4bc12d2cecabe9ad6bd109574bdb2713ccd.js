import { h, state, nf, iconImg, mdBlock, spanMd, table, acc, docAcc, GROUPS, noRule } from '../lib.js';

const chg = (s) => /изм\./i.test(s || '');
const clean = (s) => String(s || '').replace(/\s*изм\.[¹²³⁴⁵⁶⁷⁸⁹⁰:]*/gi, '').replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]/g, '').replace(/\(\s*изм[^)]*\)/gi, '').trim();

/** «15 Волокна, 8 Зёрен» → [{n, key, name}] по именам ресурсов из таблицы ресурсов */
function parseRes(text) {
  const RK = state.data.resKeys;
  const stems = { root: 'коре', fiber: 'воло', seeds: 'зёрн', spores: 'спор', crystal: 'крист', wood: 'древ', gold: 'золот', scale: 'чешу', star: 'звёзд' };
  const out = [];
  const t = String(text || '').replace(/\(было[^)]*\)/g, '');
  const re = /(\d+)\s+([А-Яа-яЁё.]+(?:\s+[а-яё]+)?)/g;
  let m;
  while ((m = re.exec(t))) {
    const w = m[2].toLowerCase();
    const rk = RK.find((r) => w.startsWith(stems[r.key] || '###'));
    if (rk) out.push({ n: +m[1], key: rk.key, name: rk.name });
  }
  return out;
}

export function mount(root, { data, go }) {
  const L = data.levels;
  const sim = data.sim;
  const P = sim?.presets?.[sim.primary];
  const arch = (a) => P?.archetypes?.[a];

  root.appendChild(h('div.sec-head', h('div.eyebrow', 'Прогрессия'), h('h2', '13 уровней фермы'), h('p', 'Что открывается на каждом уровне, сколько опыта нужно и сколько это занимает у казуала и активного игрока. Ниже — какая грядка и какое улучшение на каком уровне стоит.')));

  // ───── лесенка уровней ─────
  const maxXp = Math.max(...L.xp.map((x) => x.toReach), 1);
  const cards = L.unlock.map((u) => {
    const x = L.xp.find((v) => v.level === u.level);
    const casual = arch('casual')?.levels?.[u.level]?.real;
    const active = arch('active')?.levels?.[u.level]?.real;
    const crops = (u.crops || '').split(/,\s*/).filter((c) => c && c !== '—');
    const systems = (u.systems || '').split(/,\s*(?![^()]*\))/).filter((c) => c && c !== '—');
    const rewards = String(u.reward || '').split(/,\s*(?![^()«»]*[)»])/).filter(Boolean);
    return h('div.card.lv' + (u.level === 13 ? '.top13' : ''),
      h('div.row', { style: 'gap:12px;align-items:center' },
        h('div.num', String(u.level)),
        h('div', h('h4', u.stage, u.changed ? h('span.tag-chg', { style: 'margin-left:6px', title: 'изменено против v10' }, 'изм.') : null), h('div.xp', x && x.toReach ? `${nf(x.toReach)} XP до уровня · всего ${nf(x.total)}` : 'старт игры')),
      ),
      h('div.bar', h('i', { style: { width: Math.max(2, ((x?.toReach || 0) / maxXp) * 100) + '%' } })),
      crops.length ? h('div', h('div.tiny.faint', 'Культуры'), h('div.unl', crops.map((c) => { const cr = data.crops.find((k) => clean(c).startsWith(k.name)); return h('span.chip.' + (cr ? GROUPS[cr.group].cls : ''), cr ? iconImg(cr.icon) : null, clean(c) + (chg(c) ? ' ✱' : '')); }))) : null,
      systems.length ? h('div', h('div.tiny.faint', 'Открывается'), h('div.unl', systems.map((c) => h('span.chip.sea', clean(c) + (chg(c) ? ' ✱' : ''))))) : null,
      u.reward ? h('div.rew', h('b', 'Награда'), h('span', { html: spanMd(rewards.length ? rewards.map((r) => r.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]/g, '').trim()).join(' · ') : u.reward) })) : null,
      (casual || active) ? h('div.sim',
        casual?.reached >= 0.5 ? h('span.chip.green', `казуал ≈ ${nf(casual.mean / 24, 1)} сут`) : null,
        active?.reached >= 0.5 ? h('span.chip.terra', `активный ≈ ${nf(active.mean / 24, 1)} сут`) : null,
      ) : null,
    );
  });
  root.appendChild(h('div.block',
    h('h3', 'Лесенка уровней'),
    L.note ? h('div.callout.gold', { html: spanMd(L.note) }) : null,
    h('div.lv-grid', { style: 'margin-top:14px' }, cards),
    h('p.small.muted', { style: 'margin-top:.8rem' }, 'Полоска — сколько опыта нужно на этот уровень относительно самого дорогого. Время — среднее по прогонам симуляции (' + (P ? (sim.primary === 'v11' ? 'пресет v11' : 'пресет ' + sim.primary) : '—') + ').'),
  ));

  // ───── матрица гейтов ─────
  const lv = Array.from({ length: 13 }, (_, i) => i + 1);
  const gateRows = data.upgrades.map((u) => {
    const need = u.res?.length ? u.res : parseRes(u.resText);
    return { name: u.name, level: u.level, need, text: u.resText, cost: u.cost, coins: u.cost, what: u.what, changed: u.levelChanged || u.resChanged, kind: /^bed/.test(u.id) ? 'bed' : /^(rake|shovel|can|bag)/.test(u.id) ? 'tool' : 'build' };
  });
  const head = h('div.gate-row.head', h('div', { style: 'justify-content:flex-start;padding-left:.8rem' }, 'Что'), lv.map((n) => h('div', String(n))), h('div', { style: 'justify-content:flex-start;padding-left:.7rem' }, 'Цена: ресурсы и жетоны'));
  const rowEl = (r) => h('div.gate-row',
    h('div.name', r.name, r.changed ? h('span.tag-chg', { style: 'margin-left:6px' }, 'изм.') : null),
    lv.map((n) => h('div.cell' + (n === r.level ? '.gate' : n > r.level ? '.on' : ''), { title: n === r.level ? `${r.name}: открывается на ур. ${n}` : '' })),
    h('div.need',
      r.need.length ? r.need.map((x) => h('span.res-line', iconImg(data.resKeys.find((k) => k.key === x.key)?.icon, '', x.name), h('b', String(x.n)))) : (r.text ? clean(r.text) : null),
      r.coins ? h('span.chip.gold', `${nf(r.coins)} 🪙`) : null,
      r.what ? h('span.tiny.faint', r.what) : null,
    ),
  );
  const group = (title, kind) => [h('div.gate-row', { style: 'background:var(--bg-2)' }, h('div.name', { style: 'grid-column:1/-1;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-2)' }, title)), ...gateRows.filter((r) => r.kind === kind).map(rowEl)];
  root.appendChild(h('div.block',
    h('h3', 'Что на каком уровне'),
    h('p.lead', 'Золотая точка — уровень, с которого можно открыть. Зелёное поле правее — «уже можно». Уровень — минимум, дальше решают ресурсы с урожая и жетоны.'),
    h('div.card.flat', { style: 'padding:0;overflow:auto' }, h('div.gates', head, group('Грядки', 'bed'), group('Инструменты и сумка', 'tool'), group('Постройки участка', 'build'))),
    data.upgradesIntro ? h('div.callout.gold', { style: 'margin-top:14px', html: spanMd(data.upgradesIntro) }) : null,
  ));

  // ───── зачем инструменты ─────
  if (data.toolWhy?.length) {
    root.appendChild(h('div.block',
      h('h3', 'Зачем нужны инструменты'),
      data.toolWhyIntro ? h('p.lead', { html: spanMd(noRule(data.toolWhyIntro)) }) : null,
      h('div.grid.g-3', data.toolWhy.map((t) => h('div.card', h('h4', t.tool), h('p.small', { html: spanMd(t.what) }), h('p.small.muted', { html: spanMd(t.why) }), t.balance ? h('div.callout.green', { style: 'margin:.6rem 0 0;font-size:.86rem', html: spanMd(t.balance) }) : null))),
    ));
  }

  // ───── ресурсы ─────
  root.appendChild(h('div.block',
    h('h3', 'Девять ресурсов'),
    h('p.lead', 'Падают с урожая шансом. Нужны для грядок, инструментов и построек. Ресурсы не продаются: у Гриба их можно только обменять на XP.'),
    h('div.grid.g-auto', data.resources.map((r) => h('div.card', h('div.row', { style: 'gap:10px;align-items:center' }, iconImg(r.icon, '', r.name) && h('div', { style: 'width:46px;height:46px;flex:none' }, iconImg(r.icon, '', r.name)), h('div', h('h4', { style: 'font-size:1rem;margin:0' }, r.name), h('span.chip.' + (r.type === 'редкий' ? 'terra' : 'green'), r.type), r.changed ? h('span.tag-chg', { style: 'margin-left:5px' }, 'изм.') : null)), h('p.small', { style: 'margin:.6rem 0 .2rem' }, r.sources), h('p.tiny.faint', { style: 'margin:0' }, `при обмене у Гриба: ${r.xpPer} XP за штуку`)))),
    data.resourcesNote?.length ? h('ul.small', { style: 'margin-top:1rem' }, data.resourcesNote.map((n) => h('li', { html: spanMd(n) }))) : null,
  ));

  // ───── подробности ─────
  const more = h('div.block', h('h3', 'Подробнее из документа'));
  if (L.general) more.appendChild(acc('Общие правила уровней', mdBlock(L.general), { chip: 'из документа' }));
  if (L.afterMax) more.appendChild(acc('После 13 уровня', mdBlock(L.afterMax), { chip: 'из документа' }));
  for (const n of ['3.1', '3.3', '5', '6', '6.1']) { const a = docAcc(n); if (a) more.appendChild(a); }
  root.appendChild(more);
  return {};
}
