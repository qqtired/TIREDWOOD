import { h, state, nf, mdBlock, spanMd, table, acc, docAcc, seg, priceFor, scaleCoin, iconImg, GROUPS, noRule, mdBullets } from '../lib.js';
import { openDoc } from '../detail.js';

const SUBS = [
  ['help', '🤝 Помощь и репутация'], ['can', '💧 Лейка и мини-игра'], ['van', '🚚 Гриб и Фургон'], ['orders', '📜 Заказы'], ['boss', '🌳 Древо разлома'], ['ach', '🏅 Достижения'], ['ui', '🖥 Интерфейс и уведомления'],
];

export function mount(root, { data, go }) {
  root.appendChild(h('div.sec-head', h('div.eyebrow', 'Системы'), h('h2', 'Как это работает'), h('p', 'Помощь соседям, лейка и мини-игра, Фургон, заказы, мировой босс, достижения и интерфейс. Где можно что-то покрутить, там цифры живые.')));
  const nav = h('div.subnav', { role: 'tablist' });
  const panels = {};
  const built = {};
  const builders = { help, can, van, orders, boss, ach, ui };
  let cleanup = {};
  function select(id, scroll) {
    if (!panels[id]) id = 'help';
    for (const b of nav.children) b.setAttribute('aria-selected', String(b.dataset.sub === id));
    for (const [k, p] of Object.entries(panels)) p.classList.toggle('on', k === id);
    if (!built[id]) { built[id] = true; try { builders[id](panels[id]); } catch (e) { console.error('Системы ' + id, e); panels[id].appendChild(h('div.error', `Не собралось: ${e.message}`)); } }
    if (location.hash !== '#systems/' + id) history.replaceState(null, '', '#systems/' + id);
  }
  for (const [id, label] of SUBS) {
    nav.appendChild(h('button', { type: 'button', role: 'tab', dataset: { sub: id }, 'aria-selected': 'false', onclick: () => select(id) }, label));
    panels[id] = h('div.subpanel', { dataset: { sub: id } });
  }
  root.append(nav, ...Object.values(panels));

  // ═════════ помощь и репутация ═════════
  function help(p) {
    const hn = data.helpNums || {};
    p.append(
      h('div.block', h('h3', 'Помощь соседям'),
        h('p.lead', 'Полить чужую грядку: она растёт на 20 % быстрее оставшегося времени. Помощнику репутация и жетон, хозяину строка в ленте. Это социальная сторона режима: спящему другу можно помочь.'),
        h('div.card.flat', { style: 'padding:0' }, table(['Правило', 'Как работает', ''], data.help.map((r) => [h('b', r.rule), h('span', { html: spanMd(r.value) }), r.changed ? h('span.tag-chg', 'изм.') : null]))),
        h('div.kv', { style: 'margin-top:14px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))' },
          h('div', h('div.k', 'Репутации в сутки'), h('div.v', `до ${hn.repPerDay ?? '—'}`), h('div.s', 'за помощь')),
          h('div', h('div.k', 'Помощей на грядку за цикл'), h('div.v', `до ${hn.cycleMaxHelps ?? '—'}`)),
          h('div', h('div.k', 'Очков помощи'), h('div.v', `5 + (ур. − 1)`), h('div.s', 'ур. 1 → 5, ур. 13 → 17'))),
      ),
    );
    // репутация
    const R = data.rep;
    const maxRep = Math.max(...R.map((r) => r.rep), 1);
    const slider = h('input', { type: 'range', min: 0, max: maxRep, step: 10, value: 150, class: 'wide', 'aria-label': 'Очки репутации' });
    const readout = h('div');
    const rungs = R.map((r) => h('div.rung', { style: { '--w': (r.rep / maxRep) * 100 + '%' } },
      h('div.rno', String(r.level)),
      h('div', h('b', r.name), r.nameNote ? h('span.tag-chg', { style: 'margin-left:6px' }, 'изм.') : null, h('div.small.muted', [r.sell !== '—' ? `продажа ${r.sell}` : null, r.van !== '—' ? `Фургон ${r.van}` : null, r.cosmetic !== '—' ? r.cosmetic : null].filter(Boolean).join(' · ') || 'без бонусов')),
      h('div.num', { style: 'font-weight:600' }, `${nf(r.rep)} ★`)));
    function upd() {
      const v = +slider.value;
      let cur = R[0];
      for (const r of R) if (v >= r.rep) cur = r;
      const next = R.find((r) => r.rep > v);
      const days = next ? Math.ceil((next.rep - v) / (hn.repPerDay || 30)) : 0;
      readout.replaceChildren(
        h('div.row', { style: 'gap:18px;align-items:center' }, h('div', h('div.small.muted', 'Репутация'), h('div.k-big', nf(v))), h('div', h('b', `Ступень ${cur.level}: ${cur.name}`), h('div.small.muted', cur.sell !== '—' ? `к цене продажи ${cur.sell}` : 'бонуса к продаже нет'), next ? h('div.small.muted', `до «${next.name}» ещё ${nf(next.rep - v)} ★, при 30 в сутки это ${days} дн.`) : h('div.small.muted', 'высшая ступень'))));
      rungs.forEach((el, i) => { el.style.outline = R[i] === cur ? '3px solid var(--green)' : ''; });
    }
    slider.addEventListener('input', upd);
    p.append(h('div.block', h('h3', 'Лестница репутации'),
      h('p.lead', { html: spanMd(noRule(data.repOnly || '')) }),
      h('div.k-panel', readout, slider),
      h('div.ladder', { style: 'margin-top:14px' }, rungs),
      h('div.callout.sea', { style: 'margin-top:14px', html: spanMd(data.repSources || '') })));
    upd();
    p.append(h('div.block', h('h3', 'Подробнее из документа'), docAcc('8.1'), docAcc('8.2')));
  }

  // ═════════ лейка ═════════
  function can(p) {
    const M = data.minigame;
    const can = data.toolWhy.find((t) => /Лейка/.test(t.tool));
    const host = h('div');
    p.append(h('div.block', h('h3', 'Мини-игра «Набери лейку»'),
      h('p.lead', 'Прототип по разделу 7: ведро ходит за мышью и льёт в качающееся горлышко. Все числа взяты из документа. Мини-игра у каждого своя, очереди у колодца нет.'),
      host,
      h('p.small.muted', { style: 'margin-top:.8rem' }, 'Это не игровой код, а похожая модель на странице: в самой игре сервер переигрывает упрощённую одномерную модель по зерну и сам считает процент.')));
    import('../minigame.js').then(({ mountMinigame }) => { const api = mountMinigame(host, data); cleanup.can = api.dispose; renderTables(api.params); }).catch((e) => host.appendChild(h('div.error', 'Не собралось: ' + e.message)));
    const tblHost = h('div');
    p.append(tblHost);
    function renderTables(params) {
      tblHost.append(
        h('div.block', h('h3', 'Параметры из документа'),
          h('div.card.flat', { style: 'padding:0' }, table(['Параметр', 'Значение', 'Откуда'], params.map(([k, v, src]) => [k, v, src === 'default' ? h('span.chip.gold', 'принято по умолчанию') : h('span.chip.green', 'из документа')])))),
        h('div.block', h('h3', 'Ожидаемое заполнение'),
          h('div.card.flat', { style: 'padding:0' }, table(['Как играл', 'Заполнение'], M.skill.map((s) => [s.how, s.fill])))),
        h('div.grid.g-2',
          can ? h('div.card', h('h4', 'Зачем нужна лейка'), h('p.small', { html: spanMd(can.what) }), h('p.small.muted', { html: spanMd(can.why) }), can.balance ? h('div.callout.green', { style: 'font-size:.88rem', html: spanMd(can.balance) }) : null) : null,
          h('div.card', h('h4', 'Анти-AFK и честность'), mdBlock(noRule(M.anti || ''))),
        ),
        h('div.block', acc('Подробные правила (раздел 7)', mdBlock(noRule(M.how || '')), { chip: 'design-v11.md' }), acc('Звук', mdBlock(noRule(M.sound || '')), { chip: 'design-v11.md' }), acc('Общие правила воды', mdBlock(noRule(M.intro || '')), { chip: 'design-v11.md' })),
      );
    }
  }

  // ═════════ Гриб и Фургон ═════════
  function van(p) {
    const V = data.van;
    const msk = () => { const f = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()); return { h: +f.find((x) => x.type === 'hour').value % 24, m: +f.find((x) => x.type === 'minute').value }; };
    const now = msk();
    const open = now.h % 2 === 0;
    const hrsRow = h('div.day24', Array.from({ length: 24 }, (_, i) => h('i' + (i % 2 === 0 ? '.open' : '') + (i === now.h ? '.now' : ''), { title: `${String(i).padStart(2, '0')}:00–${String(i + 1).padStart(2, '0')}:00 МСК · ${i % 2 === 0 ? 'открыт' : 'закрыт'}` })));
    const hrsLab = h('div.day24-lab', Array.from({ length: 24 }, (_, i) => h('span', i % 3 === 0 ? String(i) : '')));
    p.append(
      h('div.block', h('h3', 'Дядюшка Гриб'), h('div.card.tint-gold', { html: spanMd(noRule(data.grib || '')) })),
      h('div.block', h('h3', 'Фургон'),
        h('p.lead', 'Раз в два часа подъезжает с гудком, час стоит. Для каждого игрока свой набор «ящиков»: сдал целиком из сумки, сразу получил жетоны и опыт. Сумка здесь становится ограничителем.'),
        h('div.card', h('div.row.between', h('b', 'Сутки по Москве'), h('span.chip' + (open ? '.green' : '.terra'), open ? `сейчас открыт до ${String((now.h + 1) % 24).padStart(2, '0')}:00` : `сейчас закрыт, откроется в ${String((now.h + 1) % 24).padStart(2, '0')}:00`)), hrsRow, hrsLab,
          h('p.small.muted', { style: 'margin:.5rem 0 0' }, 'Зелёные клетки — час, когда Фургон стоит. Рамка — текущий час.'))),
    );
    // слоты по уровню
    const S = V.slots;
    p.append(h('div.block', h('h3', 'Слоты по уровню'),
      h('div.grid.g-4', S.steps.map((s) => h('div.card', h('div.small.muted', `Ур. ${s.from}${s.to !== s.from ? '–' + s.to : ''}`), h('div.k-big', { style: 'font-size:2.2rem' }, String(s.n)), h('div.small', s.n === 1 ? 'слот' : 'слота')))),
      h('p.small.muted', { style: 'margin-top:.6rem' }, `Плюс по одному слоту за репутацию на ступенях ${S.repLevels.join(', ')}. Всего не больше ${S.max}. Закрытый слот показан с причиной.`)));
    // калькулятор ящика
    const crops = data.crops.filter((c) => c.vanLimit != null);
    const sel = h('select', { 'aria-label': 'Культура' }, crops.map((c) => h('option', { value: c.id }, `${c.name} (ур. ${c.level})`)));
    const uRange = h('input', { type: 'range', min: V.params.u[0], max: V.params.u[1], step: 0.01, value: (V.params.u[0] + V.params.u[1]) / 2, class: 'wide', 'aria-label': 'Доля u' });
    let mval = V.mults[1];
    const mSeg = seg(V.mults.map((m) => ({ value: m, label: '×' + String(m).replace('.', ',') })), V.mults[1], (v) => { mval = v; calc(); });
    const repSel = h('select', { 'aria-label': 'Ступень репутации' }, data.rep.map((r) => h('option', { value: r.sellPct }, `${r.level}. ${r.name} (${r.sell})`)));
    const out = h('div');
    const xpFrac = (() => { const m = String(V.text).match(/\*\*(\d+)\s*%\*\*\s*XP сбора/); return m ? +m[1] / 100 : V.params.xpFrac; })();
    function calc() {
      const c = crops.find((x) => x.id === sel.value);
      const price = priceFor(c, 'doc');
      const growH = c.minutes / 60;
      const Q = Math.max(1, Math.min(V.params.qCap, Math.ceil(V.params.qNum / growH)));
      const u = +uRange.value;
      const N = Math.max(1, Math.round(Q * u));
      const rep = (+repSel.value) / 100;
      const m = mval;
      const coins = Math.round(N * price.sell * m * (1 + rep));
      const xp = Math.max(5, Math.round(xpFrac * c.xp * N));
      const direct = Math.round(N * price.sell * (1 + rep));
      out.replaceChildren(h('div.kv', { style: 'grid-template-columns:repeat(auto-fit,minmax(170px,1fr))' },
        h('div', h('div.k', 'Лимит Q'), h('div.v', String(Q)), h('div.s', `по формуле: рост ${c.growText}`)),
        h('div', h('div.k', 'Ящик'), h('div.v', { style: 'display:flex;align-items:center;gap:6px' }, iconImg(c.icon), `${N} шт.`), h('div.s', `u = ${nf(u, 2)}; в документе «до ${c.vanLimit}»`)),
        h('div.good', h('div.k', 'Фургон платит'), h('div.v', `${nf(coins)} 🪙 + ${nf(xp)} XP`), h('div.s', `×${String(m).replace('.', ',')}`)),
        h('div', h('div.k', 'Если продать Грибу'), h('div.v', `${nf(direct)} 🪙`), h('div.s', 'тот же товар, без наценки'))));
    }
    for (const el of [sel, uRange, repSel]) el.addEventListener('input', calc);
    p.append(h('div.block', h('h3', 'Собери ящик'),
      h('p.lead', 'Калькулятор по формуле предложения: лимит Q от времени роста, количество N = Q × u, цена = N × продажа × наценка × (1 + репутация). Цены культур берутся из таблицы документа.'),
      h('div.card', h('div.toolbar', h('label', 'Культура', sel), h('label', 'Наценка', mSeg), h('label', 'Репутация', repSel)),
        h('div.toolbar', h('label', { style: 'flex:1;min-width:260px' }, 'Доля u (насколько «жирный» ящик)', uRange)), out),
      h('p.tiny.faint', 'Дневной потолок продаж (9.3) тут не учтён: Фургон тоже платит ×0,25 после 700 🪙 за сутки, кроме «Гурмана».')));
    calc();
    p.append(h('div.block', h('h3', 'Что берёт по уровню'), h('div.card.flat', { style: 'padding:0' }, table(['Ур.', 'Добавляется в ассортимент'], V.assortment.map((a) => [a.level, a.items]))),
      acc('Полное описание Фургона и формула предложения', mdBlock(noRule(V.text)), { chip: 'design-v11.md' })));
  }

  // ═════════ заказы ═════════
  function orders(p) {
    const O = data.orders;
    p.append(
      h('div.block', h('h3', 'Доска заказов'),
        h('ul', { style: 'padding-left:1.2rem' }, O.intro.map((t) => h('li', { style: 'margin:.3rem 0', html: spanMd(t) }))),
        h('div.card.flat', { style: 'padding:0;margin-top:12px' }, table(['Тип', 'Заказ', 'Что сделать', 'Жетоны (v10)', 'Жетоны (сейчас)', 'XP', 'Репутация'], O.templates.map((o) => [o.type, o.name, o.cond, o.coinsV10 != null ? nf(o.coinsV10) : '—', h('b', o.coins != null ? `${nf(o.coins)} 🪙` : '—'), o.xp != null ? nf(o.xp) : '—', o.rep ? '+' + o.rep : '—']), { right: [3, 4, 5, 6] }))),
      O.weights ? h('div.block', h('h3', 'Что попадается на разных уровнях'), h('p.lead', 'Вес типа заказа по уровню игрока. Долгие заказы получают только те, у кого открыты долгие культуры.'),
        h('div.card.flat', { style: 'padding:0' }, table(O.weights.header, O.weights.rows))) : null,
      O.formula ? h('div.block', acc('Как считается награда', mdBlock(noRule(typeof O.formula === 'string' ? O.formula : JSON.stringify(O.formula))), { chip: 'design-v11.md' }), docAcc('10.3')) : null,
    );
  }

  // ═════════ босс ═════════
  function boss(p) {
    const B = data.boss;
    const hp = B.health;
    const nRange = h('input', { type: 'range', min: hp.nMin, max: hp.nMax, step: 1, value: 8, class: 'wide', 'aria-label': 'Фермеров на ферме' });
    const bloom = h('input', { type: 'range', min: 0, max: 100, step: 1, value: 40, class: 'wide', 'aria-label': 'Цветение, %' });
    const hpOut = h('div');
    const bar = h('div.tree-bar', h('i'), h('span'));
    const cards = B.phases.map((ph) => h('div.phase-card', h('h4', ph.label || `${ph.no}. ${ph.name}`), h('p.small', ph.look), h('p.tiny.faint', { style: 'margin:0' }, '♪ ' + ph.sound)));
    function upd() {
      const n = +nRange.value; const v = +bloom.value;
      const total = hp.perN * n;
      const sf = data.crops.find((c) => c.id === 'star-flower') || data.crops[data.crops.length - 2];
      hpOut.replaceChildren(h('div.kv', { style: 'grid-template-columns:repeat(auto-fit,minmax(190px,1fr))' },
        h('div', h('div.k', 'Фермеров за 72 ч'), h('div.v', String(n)), h('div.s', `от ${hp.nMin} до ${hp.nMax}`)),
        h('div', h('div.k', 'Здоровье Древа'), h('div.v', nf(total)), h('div.s', `${nf(hp.perN)} × ${n}, 1 XP сбора = 1 очко`)),
        h('div', h('div.k', 'Это столько сборов'), h('div.v', nf(Math.ceil(total / sf.xp))), h('div.s', `${sf.name}, ${sf.xp} XP за сбор`)),
        h('div', h('div.k', 'На человека в среднем'), h('div.v', nf(Math.round(total / n))), h('div.s', 'очков за 6 часов'))));
      bar.firstChild.style.width = v + '%';
      bar.lastChild.textContent = `Цветение ${v} %`;
      B.phases.forEach((ph, i) => cards[i].classList.toggle('on', v >= ph.from && (v < ph.to || (ph.to === 100 && v <= 100))));
    }
    nRange.addEventListener('input', upd); bloom.addEventListener('input', upd);
    p.append(
      h('div.block', h('h3', 'Мировой босс «Древо разлома»'), h('div.card.tint-green', mdBlock(B.intro)),
        h('div.row', { style: 'margin-top:10px;gap:10px' }, h('span.chip.gold', `окно ${B.window[0]}–${B.window[1]} МСК`), h('span.chip', 'раз в сутки'))),
      h('div.block', h('h3', 'Сколько жизни у Древа'), h('div.card', hpOut, h('div.toolbar', { style: 'margin-top:10px' }, h('label', { style: 'flex:1;min-width:260px' }, 'Сколько фермеров было на ферме за 72 часа', nRange)))),
      h('div.block', h('h3', 'Четыре фазы цветения'), h('p.lead', 'Двигай ползунок «Цветение»: подсветится фаза и покажется, как выглядит Древо.'),
        h('div.card', bar, h('div.toolbar', { style: 'margin-top:10px' }, h('label', { style: 'flex:1;min-width:260px' }, 'Цветение', bloom))),
        h('div.grid.g-4', { style: 'margin-top:14px' }, cards)),
      h('div.block', h('h3', 'Правила'), h('div.card.flat', { style: 'padding:0' }, table(['Правило', 'Как работает', ''], B.rules.map((r) => [h('b', r.rule), h('span', { html: spanMd(r.value) }), r.changed ? h('span.tag-chg', 'изм.') : null])))),
      h('div.block', h('div.grid.g-2', h('div.card', h('h4', 'Как выглядит бой'), mdBlock(noRule(B.fight || ''))), h('div.card', h('h4', 'Победа'), mdBlock(noRule(B.win || ''))))),
    );
    upd();
  }

  // ═════════ достижения ═════════
  function ach(p) {
    const A = data.achievements;
    const cats = [...new Set(A.map((a) => a.category))];
    const st = { cat: 'all' };
    const grid = h('div.grid.g-auto', { style: 'grid-template-columns:repeat(auto-fill,minmax(250px,1fr))' });
    const cSeg = seg([{ value: 'all', label: `Все ${A.length}` }, ...cats.map((c) => ({ value: c, label: `${c} ${A.filter((a) => a.category === c).length}` }))], 'all', (v) => { st.cat = v; draw(); });
    function draw() {
      grid.replaceChildren(...A.filter((a) => st.cat === 'all' || a.category === st.cat).map((a) => h('div.card',
        h('div.row.between', h('h4', { style: 'font-size:1rem;margin:0' }, a.name), a.levelChanged ? h('span.tag-chg', 'изм.') : null),
        h('div.small.muted', { style: 'margin:.2rem 0 .5rem' }, a.cond, a.level ? ` · с ур. ${a.level}` : ''),
        h('div.rew', { style: 'background:var(--gold-l);border:1px solid #efd88a;border-radius:12px;padding:.4rem .7rem;font-size:.88rem' }, h('div.tiny.faint', 'НАГРАДА'), a.reward, a.coins ? h('span.chip.gold', { style: 'margin-left:6px' }, `${nf(a.coins)} 🪙`) : null),
        a.nameNote || a.levelNote ? h('p.tiny.faint', { style: 'margin:.5rem 0 0' }, [a.nameNote, a.levelNote].filter(Boolean).join(' · ')) : null)));
    }
    p.append(h('div.block', h('h3', 'Достижения'), h('p.lead', data.achievementsNote ? noRule(data.achievementsNote) : 'Награда за достижение — обычно вещь из каталога косметики.'), h('div.toolbar', cSeg), grid), h('div.block', docAcc('13')));
    draw();
  }

  // ═════════ интерфейс ═════════
  function ui(p) {
    const U = data.ui;
    p.append(
      h('div.block', h('h3', 'Общие правила окон'), h('div.card.tint-gold', mdBlock(noRule(U.rules)))),
      h('div.block', h('h3', 'Окна'), ...U.windows.map((w) => acc(`${w.name}${w.nameNote ? ' (изм.)' : ''} · ${w.open}`, mdBlock(w.md || w.inside), { chip: 'окно' }))),
      h('div.block', h('h3', 'Экран фермы (HUD)'), h('div.card', mdBlock(noRule(U.hud)))),
      h('div.block', h('h3', 'Уведомления'), h('div.card.flat', { style: 'padding:0' }, table(['Где', 'Что показываем'], U.notifications.map((n) => [h('b', n.where), h('span', { html: spanMd(n.what) })]))),
        U.notificationsNote?.length ? h('ul.small', { style: 'margin-top:.8rem' }, U.notificationsNote.filter((x) => !/^-+$/.test(x)).map((n) => h('li', { html: spanMd(n) }))) : null),
    );
  }

  return {
    show(sub) { select(sub || (location.hash.split('/')[1]) || 'help'); },
    hide() { cleanup.can?.(); },
  };
}
