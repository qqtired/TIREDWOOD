import { h, state, url, nf, mdBlock, spanMd, table, acc, docAcc, noRule, seg } from '../lib.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
// какая строка таблицы «где что» относится к объекту
const WHERE_KEY = { troughN: 'Корыта', troughE: 'Корыта', troughS: 'Корыта', troughW: 'Корыта', semechkin: 'Семечкин', grib: 'Дядюшка Гриб', orders: 'Доска заказов', farmBoard: 'Доска фермы', cart: 'Телега', van: 'Фургон', campfire: 'Костёр', boss: 'Пьедестал', lanternN: 'Фонари', lanternE: 'Фонари', lanternS: 'Фонари', lanternW: 'Фонари' };
// камера в 3D: куда смотреть
const CAM = {
  well: [0, 0, 16, 0.7, 0.85], semechkin: [6.6, -11, 11, 0.35, 0.95], grib: [11, -6.6, 11, -1.4, 0.95], orders: [10.3, -10.3, 10, -0.8, 0.9], farmBoard: [-11.5, -6.9, 10, 2.36, 0.9], cart: [-8.4, -15.4, 14, -1.5, 0.95], van: [9.9, 9.9, 13, -1.5, 0.95], campfire: [-6.4, 6.4, 12, 2.4, 0.95], boss: [-11.9, 11.9, 16, 2.36, 0.9],
};

export async function mount(root, { data, go }) {
  const L = data.location;
  root.appendChild(h('div.sec-head', h('div.eyebrow', 'Локация'), h('h2', 'Участок на холме'), h('p', 'Квадрат 72 × 72 м: колодец в центре, четыре угла лужайки и двадцать участков кольцом. Слева карта из docs/farm/level/map.svg: нажимай на участки и объекты. Ниже та же ферма в 3D, собранная из layout.json и готовых моделей.')));
  if (!L) { root.appendChild(h('div.empty', 'docs/farm/level/layout.json не найден: карты нет.')); return {}; }

  // ───── объекты карты ─────
  const objById = Object.fromEntries(L.objects.map((o) => [o.id, o]));
  const whereRow = (id) => { const k = WHERE_KEY[id]; return k ? L.where.find((w) => w.what.startsWith(k)) : null; };
  const centroid = (foot) => foot.reduce((a, p) => [a[0] + p[0] / foot.length, a[1] + p[1] / foot.length], [0, 0]);

  const pois = [];
  for (const p of L.plots) pois.push({ id: 'plot' + p.n, kind: 'plot', name: `Участок ${p.n}`, plot: p, shape: { poly: p.corners }, cam: [p.x, p.z, 26, p.yaw, 0.9] });
  for (const o of L.objects) {
    if (/^trough/.test(o.id) && o.id !== 'troughN') continue;
    const c = o.foot ? centroid(o.foot) : [o.x, o.z];
    const isTrough = /^trough/.test(o.id);
    pois.push({ id: o.id, kind: 'obj', name: isTrough ? 'Корыта (4 шт.)' : o.name, obj: o, shape: { circle: [isTrough ? 0 : c[0], isTrough ? 0 : c[1], isTrough ? 3.4 : Math.max(1.3, Math.max(...(o.foot || [[0, 0]]).map((q) => Math.hypot(q[0] - c[0], q[1] - c[1]))) + 0.3)] }, cam: CAM[o.id] || (/^lantern/.test(o.id) ? [o.x, o.z, 10, 0.6, 1] : null) });
  }
  for (const n of L.nooks) pois.push({ id: 'nook-' + n.id, kind: 'nook', name: n.name, nook: n, shape: { circle: [n.x, n.z, 4.2] }, cam: [n.x, n.z, 20, 0.7, 0.9] });
  pois.push({ id: 'spawns', kind: 'spawn', name: 'Точки появления', shape: { multi: L.spawns.map((s) => [s.x, s.z, 1.1]) }, cam: [-11, -11, 14, 0.6, 0.9] });

  // ───── карта ─────
  const mapHost = h('div.map-box', h('div.empty', 'Загружаю карту…'));
  const info = h('div.card.info-card');
  const selected = { id: null };
  const els = new Map();
  let scene3d = null;

  function showInfo(p) {
    selected.id = p.id;
    for (const [id, list] of els) list.forEach((e) => e.classList.toggle('sel', id === p.id));
    const rows = [];
    let title = p.name; let what = ''; let use = ''; let extra = [];
    if (p.kind === 'plot') {
      const q = p.plot;
      what = `Участок 6 × 10 м, 8 грядок в два ряда по четыре. Хозяин ставит здесь растения, свина, улей и компост по мере открытия.`;
      use = 'E у калитки: занять свободный участок. ЛКМ по грядке с 6 м или E перед ней.';
      extra = [['Корыто', `«${q.trough}»`], ['Калитка', `(${q.gate.x}; ${q.gate.z})`], ['Центр', `(${q.x}; ${q.z})`], ['Поворот', `${q.angleDeg}° по дуге`]];
    } else if (p.kind === 'obj') {
      const o = p.obj; const w = whereRow(o.id);
      what = /^trough/.test(o.id) ? 'Четыре корыта по сторонам света вокруг колодца. У каждого фермера своя мини-игра «Набери лейку», очереди нет.' : (o.note || w?.looks || '');
      use = o.use?.what || (w?.hint ? w.hint.replace(/[«»]/g, '') : '');
      extra = [['Координаты', /^trough/.test(o.id) ? 'у колодца, по 1,95 м' : `(${o.x}; ${o.z})`]];
      if (w) { if (w.at && !/^\(/.test(w.at)) extra.push(['Размер и место', w.at]); if (w.use) extra.push(['Где встать', w.use]); if (w.hint && !use) use = w.hint; if (w.hint) extra.push(['Подсказка на экране', w.hint]); }
    } else if (p.kind === 'nook') {
      what = p.nook.note;
      extra = [['Центр', `(${p.nook.x}; ${p.nook.z})`], ['Что стоит', p.nook.items.map((i) => ({ hiveDecor: 'улей-декор', bench: 'лавочка', vanGate: 'ворота Фургона' }[i.kind] || i.kind)).filter((v, i, a) => a.indexOf(v) === i).join(', ') || '—']];
    } else if (p.kind === 'spawn') {
      what = 'Шесть точек, куда встают новые игроки. Все смотрят на колодец: перед глазами вся ферма, солнце за спиной.';
      extra = [['Количество', String(L.spawns.length)]];
    }
    const cam = p.cam;
    info.replaceChildren(...[
      h('div.eyebrow', { style: 'margin:0' }, { plot: 'Участок', obj: 'Объект', nook: 'Уголок', spawn: 'Появление' }[p.kind]),
      h('h4', title),
      what ? h('p.what', what) : null,
      use ? h('div', h('div.lbl', 'Как пользоваться'), h('p', { style: 'margin:.2rem 0 0' }, use)) : null,
      extra.length ? h('div', h('div.lbl', 'Данные'), h('table.tbl', { style: 'margin-top:.3rem' }, h('tbody', extra.map(([k, v]) => h('tr', h('td.nowrap', { style: 'color:var(--ink-3)' }, k), h('td', v)))))) : null,
      cam ? h('div.row', { style: 'margin-top:12px' }, h('button.btn.small.primary', { type: 'button', onclick: () => viewIn3d(p) }, '🧊 Показать в 3D')) : null,
    ].filter(Boolean));
  }

  info.replaceChildren(h('h4', 'Нажми на объект'), h('p.small.muted', 'Участки, колодец, лавки, Фургон, костёр и угловые уголки подсвечиваются при наведении. Здесь появится описание: что это, как пользоваться, координаты.'), legend());
  function legend() {
    return h('div.pill-list', [['plot', 'участки'], ['obj', 'объекты'], ['nook', 'уголки'], ['spawn', 'появление']].map(([k, t]) => h('span.chip', t)));
  }

  fetch(url(L.svg)).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); }).then((txt) => {
    mapHost.innerHTML = txt;
    const svg = mapHost.querySelector('svg');
    if (!svg) throw new Error('в файле нет <svg>');
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.dataset.full = svg.getAttribute('viewBox');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Карта фермы');
    const g = svgEl('g', { class: 'hotspots' });
    const add = (p, node) => {
      node.classList.add('hs');
      node.setAttribute('tabindex', '0');
      node.setAttribute('role', 'button');
      node.setAttribute('aria-label', p.name);
      node.appendChild(Object.assign(svgEl('title'), { textContent: p.name }));
      node.addEventListener('click', () => showInfo(p));
      node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showInfo(p); } });
      g.appendChild(node);
      if (!els.has(p.id)) els.set(p.id, []);
      els.get(p.id).push(node);
    };
    for (const p of pois) {
      if (p.shape.poly) add(p, svgEl('polygon', { points: p.shape.poly.map((q) => q.join(',')).join(' ') }));
      else if (p.shape.circle) add(p, svgEl('circle', { cx: p.shape.circle[0], cy: p.shape.circle[1], r: p.shape.circle[2] }));
      else if (p.shape.multi) for (const c of p.shape.multi) add(p, svgEl('circle', { cx: c[0], cy: c[1], r: c[2] }));
    }
    // врезка с деталями одного участка (справа на карте): X = 53.5 + 2.15 x, Y = −26.55 + 2.15 z
    const PL = L.plotLocal;
    const ix = (x) => 53.5 + 2.15 * x; const iz = (z) => -26.55 + 2.15 * z;
    const selectSimple = (id, node) => { for (const [i2, list] of els) list.forEach((e) => e.classList.toggle('sel', i2 === id)); node && node.classList.add('sel'); };
    for (const b of PL.beds) {
      const half = (PL.bedSize / 2) * 2.15 * 0.96;
      const id = 'bed' + b.n;
      const doc = (L.bedsDoc || []).find((d) => String(d.bed) === String(b.n));
      const r = svgEl('rect', { x: ix(b.x) - half, y: iz(b.z) - half, width: half * 2, height: half * 2, rx: 0.4, class: 'hs', tabindex: 0, role: 'button', 'aria-label': 'Грядка ' + b.n });
      r.appendChild(Object.assign(svgEl('title'), { textContent: 'Грядка ' + b.n }));
      els.set(id, [r]);
      r.addEventListener('click', () => {
        selectSimple(id);
        info.replaceChildren(
          h('div.eyebrow', { style: 'margin:0' }, 'Грядка на участке'),
          h('h4', 'Грядка ' + b.n),
          h('p.what', 'Рамка 1,6 × 1,6 м. Открывается на уровне ' + b.level + (doc?.cost && doc.cost !== '—' ? ', цена: ' + doc.cost : '') + '.'),
          h('div', h('div.lbl', 'Положение на участке'), h('p', { style: 'margin:.2rem 0 0' }, '(' + b.x + '; ' + b.z + ') в координатах участка: начало в центре, +Z к калитке')),
          h('div.callout.gold', { style: 'margin-top:12px;font-size:.9rem' }, 'Закрытая грядка: рамка с дёрном и колышек с замком. Наведёшь мышь — видно, чего не хватает.'),
        );
      });
      g.appendChild(r);
    }
    for (const [key, label] of [['pen', 'Загон свина'], ['compost', 'Компост'], ['hive', 'Улей']]) {
      const o = PL[key];
      if (!o) continue;
      const w = (o.w || 1) * 2.15; const d = (o.d || 1) * 2.15;
      const r = svgEl('rect', { x: ix(o.x) - w / 2, y: iz(o.z) - d / 2, width: w, height: d, rx: 0.4, class: 'hs', tabindex: 0, role: 'button', 'aria-label': label });
      r.appendChild(Object.assign(svgEl('title'), { textContent: label }));
      const id = 'in-' + key;
      els.set(id, [r]);
      r.addEventListener('click', () => {
        for (const [i2, list] of els) list.forEach((e) => e.classList.toggle('sel', i2 === id));
        info.replaceChildren(h('div.eyebrow', { style: 'margin:0' }, 'Постройка участка'), h('h4', label), h('p.what', o.what), h('div.lbl', 'Открывается'), h('p', { style: 'margin:.2rem 0 0' }, `на уровне ${o.level}`));
      });
      g.appendChild(r);
    }
    svg.appendChild(g);
    setView('farm');
  }).catch((e) => { mapHost.replaceChildren(h('div.error', 'Не удалось загрузить map.svg: ' + e.message)); });

  const viewSeg = seg([{ value: 'farm', label: 'Только ферма' }, { value: 'all', label: 'С врезками: участок и вход с площади' }], 'farm', (v) => setView(v));
  function setView(v) {
    const svg = mapHost.querySelector('svg');
    if (!svg) return;
    svg.setAttribute('viewBox', v === 'farm' ? '-46 -50 92 98' : svg.dataset.full);
  }
  root.appendChild(h('div.block', h('div.toolbar', viewSeg), h('div.map-wrap', mapHost, info)));
  root.appendChild(h('p.small.muted', { style: 'margin:-.5rem 0 1.4rem' }, 'Карта и 3D строятся из layout.json: пересоберите страницу командой node docs/farm/review/build.mjs, если layout поменяется. Контур справа — один участок крупно, с грядками и постройками.'));

  // ───── 3D ─────
  const sceneHost = h('div.scene-host', h('div.empty', { style: 'position:absolute;inset:0;display:grid;place-items:center' }, 'Сцена соберётся, когда доскроллишь сюда…'));
  const sceneMsg = h('div.small.muted', { style: 'margin-top:.5rem' });
  const chipRow = h('div.row', { style: 'gap:8px;margin:12px 0 6px' });
  const bossRow = h('div.row', { style: 'gap:8px;margin:0 0 6px', hidden: true }, h('span.small.muted', 'Пень Древа разлома:'));
  const jumps = [
    ['Вся ферма', [0, 0, 112, 0.55, 0.78]], ['Колодец', CAM.well], ['Приезд, северо-запад', [-11, -11, 15, 0.7, 0.95]], ['Базар, северо-восток', [9.5, -9, 16, 0.5, 0.95]], ['Фургон, юго-восток', CAM.van], ['Костёр и Древо, юго-запад', [-9, 9, 17, -2.3, 0.95]], ['Участок 3', [0, -29, 24, 0, 0.9]], ['Участок 13', [0, 29, 24, 3.14, 0.9]],
  ];
  for (const [name, c] of jumps) chipRow.appendChild(h('button.chip-btn', { type: 'button', onclick: () => scene3d && scene3d.focus(...c) }, name));
  root.appendChild(h('div.block', h('h3', 'Ферма в 3D'),
    h('p.lead', 'Вращать — левая кнопка, двигать — правая, приблизить — колесо. Всё, для чего художники уже положили модель в client/assets/farm/models, стоит на месте: участки, грядки, колодец, лотки, NPC, Фургон, доски, деревья. Чего ещё нет, показано простой заглушкой.'),
    sceneHost, chipRow, bossRow, sceneMsg,
    h('div.callout.sea', h('b.t', 'Как читать сцену'), h('span', 'Номера над участками — как на карте. Калитка каждого участка смотрит на своё корыто у колодца. Все 160 грядок и 20 оград нарисованы инстансами, то есть почти бесплатно для видеокарты.'))));

  let startP = null;
  function start() { return (startP ||= startReal()); }
  async function startReal() {
    const sp = h('div.empty', { style: 'position:absolute;inset:0;display:grid;place-items:center;z-index:2' }, h('div', h('div.spin'), h('div.small.muted', 'Собираю ферму из моделей…')));
    sceneHost.replaceChildren(sp);
    try {
      const { createFarmScene } = await import('../scene.js');
      const names = new Map(data.models.map((m) => [m.name, m.path]));
      const modelUrl = (n) => (names.get(n) ? url(names.get(n)) : null);
      scene3d = await createFarmScene(sceneHost, { L, modelUrl });
      window.__farmScene = scene3d;
      sp.remove();
      if (scene3d.boss?.set) {
        const states = [['sleep', 'спит'], ['cracked', 'треснул'], ['bloom', 'расцвёл'], ...(scene3d.boss.hasTree ? [['tree', 'Древо проснулось']] : [])];
        for (const [st, label] of states) bossRow.appendChild(h('button.chip-btn', { type: 'button', onclick: () => { scene3d.boss.set(st); scene3d.focus(...CAM.boss); } }, label));
        bossRow.hidden = false;
      }
      sceneMsg.textContent = `Из моделей: ${scene3d.used.length ? scene3d.used.join(', ') : 'ничего (все заглушки)'}.`;
    } catch (e) {
      console.error('scene', e);
      sceneHost.replaceChildren(h('div.error', { style: 'margin:1rem' }, 'Не удалось собрать 3D-сцену: ' + (e.message || e)));
    }
  }
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '200px' });
  io.observe(sceneHost);

  async function viewIn3d(p) {
    sceneHost.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await start();
    const c = p.cam;
    if (c && scene3d) scene3d.focus(...c);
  }

  // ───── таблицы ─────
  const sec = (title, node) => h('div.block', h('h3', title), node);
  if (L.where?.length) root.appendChild(sec('Где что стоит', h('div.card.flat', { style: 'padding:0' }, table(['Что', 'Где', 'Как выглядит', 'Куда встать', 'Подсказка на экране'], L.where.map((w) => [w.what, w.at, w.looks, w.use, w.hint]), { md: true }))));
  if (L.corners?.length) root.appendChild(sec('Четыре угла лужайки', h('div.grid.g-auto-lg', L.corners.map((c) => h('div.card', h('h4', c.corner), h('p.small', c.what), h('p.small.muted', h('b', 'Почему так: '), c.why))))));
  if (L.states?.length) root.appendChild(sec('Свободный и занятый участок', h('div.grid.g-2', L.states.map((s, i) => h('div.card.tint-' + (i ? 'gold' : 'green'), h('h4', s.state), h('p.small', h('b', 'Табличка: '), s.sign), h('p.small', { style: 'margin:0' }, h('b', 'Что видно: '), s.seen))))));
  if (L.bedsDoc?.length) root.appendChild(sec('Грядки участка', h('div.card.flat', { style: 'padding:0' }, table(['Грядка', 'Место (x; z)', 'Открывается', 'Цена'], L.bedsDoc.map((b) => [b.bed, b.at, b.opens, b.cost])))));
  if (L.budgetTable) root.appendChild(sec('Бюджет отрисовки: до 300 за кадр', h('div.card.flat', { style: 'padding:0' }, table(L.budgetTable.header, L.budgetTable.rows, { right: [2], md: true }))));

  const more = h('div.block', h('h3', 'Подробнее из документов'));
  if (data.locationDoc) more.appendChild(acc('Что добавляет геймдизайн', mdBlock(noRule(data.locationDoc)), { chip: 'design-v11.md' }));
  const md = L.md || {};
  for (const [key, title] of [['short', 'Коротко'], ['layout', 'Раскладка'], ['plot', 'Участок'], ['paths', 'Дорожки'], ['noticeable', 'Что заметно издалека'], ['gate', 'Вход с площади'], ['collisions', 'Коллизии'], ['disputed', 'Спорные места']]) {
    if (md[key]) more.appendChild(acc(title, mdBlock(noRule(md[key])), { chip: 'level.md' }));
  }
  root.appendChild(more);
  return { show() { /* сцена сама пропускает кадры, пока вкладка скрыта */ } };
}
