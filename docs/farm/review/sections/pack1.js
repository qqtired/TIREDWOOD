import { h, nf, esc, mdBlock } from '../lib.js';

const amount = (n) => nf(Number(n.toFixed(2)), 2);
const sourceSection = (d, name) => d.sections.find((s) => s.title.startsWith(name))?.text || '';
const metric = (value, label) => h('div.stat', h('b', value), h('span', label));
const section = (id, title, lead, ...kids) => h('section.block', { id: 'pack1-' + id }, h('h3', title), lead ? h('p.lead', lead) : null, ...kids);
const svg = (markup) => h('div.pack1-svg', { html: markup });

function table(headers, rows, caption) {
  return h('div.pack1-table', { tabindex: 0, 'aria-label': caption }, h('table.tbl', h('caption.sr', caption),
    h('thead', h('tr', headers.map((name) => h('th', { scope: 'col' }, name)))),
    h('tbody', rows.map((cells) => h('tr', cells.map((value, i) => h(i ? 'td.num' : 'th', i ? null : { scope: 'row' }, value))))),
  ));
}

function calculator(d) {
  const c = d.contract;
  const crop = h('select', { id: 'pack1-crop' }, d.balance.crops.map((x) => h('option', { value: x.id }, `${x.name} · ур. ${x.level}`)));
  const beds = h('select', { id: 'pack1-beds' }, Array.from({ length: c.maxBeds }, (_, i) => h('option', { value: i + 1 }, String(i + 1))));
  beds.value = String(c.startBeds);
  const reputation = h('select', { id: 'pack1-rep' }, [0, 2, 4, 6, 8, 10, 12, 15].map((v) => h('option', { value: v / 100 }, v + '%')));
  const buyer = h('select', { id: 'pack1-buyer' }, [[1, 'Дядюшка Гриб'], [1.3, 'Фургон ×1,3'], [1.4, 'Фургон ×1,4'], [1.5, 'Фургон ×1,5']].map(([v, text]) => h('option', { value: v }, text)));
  const double = h('input', { type: 'checkbox', id: 'pack1-double' });
  const price = h('input', { type: 'checkbox', id: 'pack1-price' });
  const free = h('input', { type: 'checkbox', id: 'pack1-free' });
  const field = (label, control) => h('label.pack1-field', { htmlFor: control.id }, h('span', label), control);
  const check = (label, control) => h('label.pack1-check', control, label);
  const output = h('div.pack1-results', { 'aria-live': 'polite', 'aria-atomic': 'true' });
  const explanation = h('p.small.pack1-calc-note');
  const form = h('form.card.pack1-calculator', { onsubmit: (e) => e.preventDefault() },
    h('div.pack1-controls', field('Культура', crop), field('Грядок', beds), field('Бонус репутации', reputation), field('Покупатель', buyer)),
    h('div.pack1-checks', check('Бонус цены +10%', price), check('Двойной урожай', double), check('Первое семя бесплатно на одной грядке', free)), output, explanation,
  );
  const render = () => {
    const plant = d.balance.crops.find((x) => x.id === crop.value) || d.balance.crops[0];
    const count = Number(beds.value), n = double.checked ? 2 : 1;
    const raw = plant.sale * (1 + Number(reputation.value)) * (price.checked ? 1.1 : 1) * Number(buyer.value);
    const unit = Math.min(c.unitCap, raw);
    const seedCost = plant.seed * (count - (free.checked ? 1 : 0));
    const netBed = unit * n - plant.seed;
    output.replaceChildren(
      metric(amount(unit) + ' 🪙', 'фактическая цена продукта'),
      metric(amount(netBed) + ' 🪙', 'чистыми с оплаченной грядки'),
      metric(amount(unit * n * count - seedCost) + ' 🪙', `чистыми с ${count} грядок за цикл`),
      metric(amount((plant.sale - plant.seed) * 60 / plant.min) + ' 🪙/ч', 'базовая ставка с одной грядки'),
    );
    const capped = raw > c.unitCap + 1e-9 ? `Цена до потолка ${amount(raw)}; применяется ${amount(unit)} за продукт. ` : 'Все выбранные бонусы помещаются в потолок. ';
    explanation.textContent = `${capped}Семена: ${amount(seedCost)} монет на выбранные грядки. ${free.checked ? `На первой бесплатной грядке чистыми ${amount(unit * n)}. ` : ''}Рост ${plant.min} мин. С выбранными бонусами ставка оплаченной грядки ${amount(netBed * 60 / plant.min)} монет/ч при своевременном сборе. Полив, ожидание, ресурсы и отдельные награды в этот расчёт не включены. Дробные монеты здесь показаны до округления выплаты.`;
  };
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  render();
  return form;
}

function plotDiagram(d) {
  const p = d.plot, scale = 39;
  const x = (v) => 150 + v * scale, y = (v) => 250 + v * scale;
  const rectangle = (x0, z0, w, l, cls, radius = 5) => `<rect x="${x(x0)}" y="${y(z0)}" width="${w * scale}" height="${l * scale}" rx="${radius}" class="${cls}"/>`;
  return svg(`<svg viewBox="0 0 300 520" role="img" aria-labelledby="pack1-plot-title pack1-plot-desc"><title id="pack1-plot-title">Проект участка: две колонки, пять рядов, десять грядок</title><desc id="pack1-plot-desc">Участок ${p.w} на ${p.l} метров, центральная дорожка. Три стартовые грядки отмечены золотом. Остальные открываются постепенно.</desc>
    ${rectangle(-p.w / 2, -p.l / 2, p.w, p.l, 'pack1-plot-ground', 12)}
    ${rectangle(p.path.x0, p.path.z0, p.path.x1 - p.path.x0, p.path.z1 - p.path.z0, 'pack1-path')}
    ${p.beds.map((b) => rectangle(b.x - p.bedSize / 2, b.z - p.bedSize / 2, p.bedSize, p.bedSize, b.n <= d.contract.startBeds ? 'pack1-bed pack1-bed-start' : 'pack1-bed') + `<text x="${x(b.x)}" y="${y(b.z) + 5}" class="pack1-plot-number">${b.n}</text>`).join('')}
    ${p.fixtures.map((f) => `<circle cx="${x(f.x)}" cy="${y(f.z)}" r="11" class="pack1-fixture"/><text x="${x(f.x)}" y="${y(f.z) + 4}" class="pack1-fixture-label">${{ pen: 'С', compost: 'К', hive: 'П' }[f.key]}</text>`).join('')}
    <text x="150" y="17" class="pack1-plot-label">Сооружения участка</text><text x="150" y="510" class="pack1-plot-label">Калитка и имя фермы</text>
  </svg>`);
}

function pondDiagram(d) {
  const m = d.map, p = d.pond, scale = 7.3;
  const x = (v) => 320 + v * scale, y = (v) => 320 + v * scale;
  const pts = (list) => list.map(([a, b]) => `${x(a)},${y(b)}`).join(' ');
  const deck = p.deck;
  const markerNames = { well: 'Колодец', cart: 'Телега', boss: 'Древо', campfire: 'Костёр', van: 'Фургон' };
  return svg(`<svg viewBox="0 0 640 650" role="img" aria-labelledby="pack1-map-title pack1-map-desc"><title id="pack1-map-title">Пруд на существующей карте двадцати участков</title><desc id="pack1-map-desc">Контуры всех двадцати участков взяты из layout.json. Проект пруда находится в северо-восточном углу: вода, помост и шесть пронумерованных мест.</desc>
    <rect x="${x(m.bounds.minX)}" y="${y(m.bounds.minZ)}" width="${(m.bounds.maxX - m.bounds.minX) * scale}" height="${(m.bounds.maxZ - m.bounds.minZ) * scale}" rx="22" class="pack1-map-ground"/>
    ${m.paths.radial.map((r) => `<polyline points="${pts([r.from, r.to])}" class="pack1-map-path"/>`).join('')}
    <polyline points="${pts(m.paths.road.points)}" class="pack1-map-path"/>
    ${m.plots.map((plot) => `<polygon points="${pts(plot.corners)}" class="pack1-map-plot"/><text x="${x(plot.x)}" y="${y(plot.z) + 4}" class="pack1-map-number">${plot.n}</text>`).join('')}
    ${m.objects.filter((o) => markerNames[o.id]).map((o) => `<circle cx="${x(o.x)}" cy="${y(o.z)}" r="6" class="pack1-map-marker"/><text x="${x(o.x) + 9}" y="${y(o.z) - 9}" class="pack1-map-label">${markerNames[o.id]}</text>`).join('')}
    <ellipse cx="${x(p.x)}" cy="${y(p.z)}" rx="${p.w * scale / 2}" ry="${p.l * scale / 2}" class="pack1-water"/>
    <rect x="${x(deck.x0)}" y="${y(deck.z0)}" width="${(deck.x1 - deck.x0) * scale}" height="${(deck.z1 - deck.z0) * scale}" rx="3" class="pack1-deck"/>
    ${p.seats.map((seat) => `<circle cx="${x(seat.x)}" cy="${y(seat.z)}" r="5.2" class="pack1-seat"/><text x="${x(seat.x)}" y="${y(seat.z) + 3}" class="pack1-seat-number">${seat.n}</text>`).join('')}
    <path d="M${x(17.2)},${y(-17.2)} L${x(23.7)},${y(-23.4)}" class="pack1-pond-path"/>
    <text x="${x(p.x)}" y="${y(p.z) - 33}" class="pack1-pond-label">Пруд · 6 мест</text><text x="35" y="33" class="pack1-map-label">Север ↑</text>
  </svg>`);
}

function progression(d) {
  const scenarios = d.balance.scenarios;
  const picker = h('select', { id: 'pack1-scenario' }, scenarios.map((s, i) => h('option', { value: i }, s.title)));
  picker.value = String(Math.min(1, scenarios.length - 1));
  const chart = h('div.pack1-progress-chart');
  const xpTable = h('div');
  const summary = h('p.small.pack1-calc-note');
  const render = () => {
    const s = scenarios[Number(picker.value)];
    const top = Math.ceil(Math.max(...scenarios.flatMap((r) => r.levelHours)) / 5) * 5;
    const x = (i) => 55 + i * 48, y = (hour) => 265 - hour / top * 220;
    const dots = s.levelHours.map((hour, i) => `${x(i)},${y(hour)}`).join(' ');
    chart.replaceChildren(svg(`<svg viewBox="0 0 670 310" role="img" aria-labelledby="pack1-chart-title pack1-chart-desc"><title id="pack1-chart-title">Расчёт среднего времени до каждого уровня</title><desc id="pack1-chart-desc">${esc(s.title)}. Среднее время до уровня 13: ${amount(s.levelHours.at(-1))} часа онлайна. Это модель предложения, а не данные игры.</desc>
      ${Array.from({ length: 7 }, (_, i) => { const hour = i * top / 6; return `<line x1="55" x2="635" y1="${y(hour)}" y2="${y(hour)}" class="pack1-chart-grid"/><text x="45" y="${y(hour) + 4}" class="pack1-chart-y">${amount(hour)}</text>`; }).join('')}
      <polyline points="${dots}" class="pack1-chart-line"/>
      ${s.levelHours.map((hour, i) => `<circle cx="${x(i)}" cy="${y(hour)}" r="4.5" class="pack1-chart-dot"><title>Уровень ${i + 1}: ${amount(hour)} ч</title></circle><text x="${x(i)}" y="285" class="pack1-chart-x">${i + 1}</text>`).join('')}
      <text x="55" y="20" class="pack1-map-label">Часы онлайна · среднее модели</text><text x="640" y="305" class="pack1-chart-y">Уровень фермы</text>
    </svg>`));
    summary.textContent = `${s.control ? 'Контроль с идеальным временем действий; это не обещание обычному игроку. ' : 'Оценка обычного ритма при расширении грядок. '}До уровня 13: медиана ${amount(s.p50)} ч, p90 ${amount(s.p90)} ч. ${s.runs} прогонов. На графике и в таблице ниже — среднее время до каждого уровня, а не медиана.`;
    xpTable.replaceChildren(table(['Уровень', 'XP всего', 'До следующего', 'Средние часы'], d.balance.total.map((total, i) => [String(i + 1), nf(total), d.balance.next[i] == null ? 'Дальше — звёзды' : nf(d.balance.next[i]), amount(s.levelHours[i])]), 'Пороги XP и среднее модельное время до уровня'));
  };
  picker.addEventListener('change', render);
  render();
  return [h('div.card', h('label.pack1-field', { htmlFor: picker.id }, h('span', 'Выбери ритм игры для графика и таблицы XP'), picker), chart, summary), xpTable,
    table(['Сценарий', 'p10, ч', 'Медиана, ч', 'p90, ч'], scenarios.map((s) => [s.title, amount(s.p10), amount(s.p50), amount(s.p90)]), 'Сравнение шести сценариев прогрессии'),
    h('p.small.muted', `p10 и p90 — границы результатов расчётных прогонов. Это не статистика реальных игроков. Цель ${d.contract.targetHours.join('–')} часов относится к обычному онлайну с управлением и расширением грядок; точный сбор и бонусы могут ускорить путь. После офлайна созревает один урожай, автоматических повторных циклов нет.`),
    h('details.acc', h('summary', 'Условия и ограничения расчёта'), h('div.acc-body', h('ul',
      h('li', 'Старт — 3 грядки, затем последовательное расширение до 10 с прежними ресурсными ценами. Игрок собирает материалы ближайшей грядки и смешивает подходящие культуры.'),
      h('li', 'Обычный сценарий: возврат каждые 12 или 25 минут, часть времени урожай ждёт созревшим. Полив, постоянный бонус XP и два часа игры в день выделены отдельно.'),
      h('li', 'Не моделируются время ходьбы и кликов, конкуренция ресурсов с покупкой всех инструментов, помощь соседей, компост, пчёлы, конвертация и XP заказов/Фургона. Поэтому это расчётный ориентир, который ещё проверяется в игре.'),
    ))),
  ];
}

function boss(d) {
  const starter = d.balance.crops.find((c) => c.id === 'radish');
  const firstQuota = d.contract.bossBase + d.contract.bossStep * (1 - d.contract.bossLevelOffset);
  const starterMinutes = Math.ceil(firstQuota / (d.contract.startBeds * starter.xp)) * starter.min;
  const veteranQuota = d.contract.bossBase + d.contract.bossStep * (d.contract.maxLevel - d.contract.bossLevelOffset);
  const veteranDamage = d.contract.maxBeds * Math.max(...d.balance.crops.map((c) => Math.round(c.xp * 1.1)));
  const level = h('select', { id: 'pack1-boss-level' }, Array.from({ length: d.contract.maxLevel }, (_, i) => h('option', { value: i + 1 }, 'Уровень ' + (i + 1))));
  const quota = h('strong.pack1-boss-quota', { 'aria-live': 'polite' });
  const render = () => { quota.textContent = nf(d.contract.bossBase + d.contract.bossStep * (Number(level.value) - d.contract.bossLevelOffset)) + ' HP'; };
  level.addEventListener('change', render); render();
  return h('div.card.tint-green', h('div.pack1-boss-example', h('label.pack1-field', { htmlFor: level.id }, 'Пример квоты первого участия', level), quota),
    h('p', `Квота участника: ${d.contract.bossBase} + ${d.contract.bossStep} × (уровень − ${d.contract.bossLevelOffset}). Общая сложность — сумма квот тех, кто действительно помог урожаем или шишкой. Зрители её не повышают.`),
    h('p.small', 'Уровень фиксируется до опыта первого вклада. Участник добавляется один раз; выход и повторный вход сохраняют его вклад и квоту. Урожай даёт урон по своему XP, двойной продукт его не удваивает; шишка даёт 10.'),
    h('p.small', `Событие: 19:00–01:00 МСК. Новичок с ${d.contract.startBeds} грядками редиса закрывает ${firstQuota} HP примерно за ${starterMinutes} минут даже без полива и шишек. Ветеран с ${d.contract.maxBeds} грядками и бонусом XP получает максимум ${veteranDamage} урона первым полным урожаем против ${veteranQuota} HP.`),
    h('p.small', 'Шишки появляются в средних фазах. До первого участника показывается только пример сложности; событие не побеждено при нулевом HP. Уже начатый старый бой сохраняет шкалу и прогресс до конца, новые правила — со следующего события.'),
  );
}

export async function mount(root) {
  const response = await fetch('pack1-data.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Не удалось загрузить проект пакета: ' + response.status);
  const d = await response.json(), c = d.contract;
  root.classList.add('pack1-panel');
  root.append(h('div.sec-head', h('div.eyebrow', 'Следующий пакет · обзор для решения'), h('h2', 'Ферма становится полезнее с первых минут'), h('p', d.meta.status)),
    h('div.stats.pack1-stats', metric(`${c.startBeds} → ${c.maxBeds}`, 'грядок: старт и максимум'), metric(`${Math.min(...d.balance.crops.map((x) => x.netHour))}–${Math.max(...d.balance.crops.map((x) => x.netHour))}`, 'чистыми / час / грядку'), metric(`≤ ${c.harvestCap}`, 'монет с грядки за сбор'), metric(`≤ ${c.maxMinutes} мин`, 'максимальный рост'), metric(nf(c.maxXp) + ' XP', 'до 13-го уровня')),
    h('nav.pack1-jumps', { 'aria-label': 'Разделы пакета 1' }, [['calculator', 'Проверить прибыль'], ['progress', 'Темп и XP'], ['plots', 'Участок и пруд'], ['requests', 'Все пункты'], ['waterfront', 'Набережная'], ['sources', 'Источники']].map(([id, label]) => h('a.chip', { href: '#pack1/' + id }, label))),
    section('calculator', 'Что принесёт один сбор', 'Цена продукта ограничена после репутации, баффа и бонуса Фургона. Дневного снижения после 700 в проекте больше нет.', calculator(d), h('p.small.muted', `Не больше ${c.unitCap} за продукт × максимум два продукта = не больше ${c.harvestCap} с грядки даже с бесплатным семенем. Для нескольких грядок предел считается по каждой, а не на весь ящик. Вторичные ресурсы дают материалы/XP, отдельные награды в эту прибыль не включены.`)),
    section('crops', '19 культур: новая таблица', 'Чистая базовая ставка = (продажа − семя) × 60 / минуты. Без бонусов и полива, при своевременном сборе.', table(['Культура', 'Ур.', 'Рост, мин', 'Семя', 'Продажа', 'XP', 'Вторичный ресурс', 'Шанс', 'Чистыми/ч'], d.balance.crops.map((x) => [x.name, x.level, x.min, x.seed, x.sale, x.xp, x.resourceName, amount(x.chance * 100) + '%', amount((x.sale - x.seed) * 60 / x.min)]), 'Новые числа всех девятнадцати культур')),
    section('progress', 'До легенды фермы — постепенно', `Цель обычной игры — ${c.targetHours.join('–')} часов. Офлайн, редкие визиты и бонусы показаны отдельно. Изменения ещё предстоит проверить в собранной игре.`, ...progression(d)),
    section('plots', 'Участок 2 × 5 и пруд на шесть мест', 'Схемы предложения: прежняя карта и размеры участка сохраняются; новые места нанесены из брифа.', h('div.pack1-diagrams',
      h('figure.card', h('figcaption', h('h4', 'Десять грядок и центральная дорожка'), h('p.small', `Участок ${d.plot.w} × ${d.plot.l} м. Золото — ${c.startBeds} стартовые грядки. С — свин, К — компост, П — пчёлы.`)), plotDiagram(d)),
      h('figure.card', h('figcaption', h('h4', 'Северо-восточный угол фермы'), h('p.small', '20 существующих участков, колодец, выход и Древо. Пруд и шесть мест — проект, а не готовая локация.')), pondDiagram(d), h('p.small.muted', 'Пруд: карась, плотва, окунь и карп; без суточного лимита. Помост на шесть рыбаков, NPC у подхода. Декор пасеки переносится внутри того же уголка; проход к участкам сохраняется.')))),
    section('boss', 'Босс для новичка и компании', 'Участники помогают росту Древа, а полоса показывает оставшуюся порчу. Расписание, анимации и награды сохраняются.', boss(d)),
    section('saves', 'Прогресс остаётся с игроком', 'Пакет добавляет возможности и сохраняет то, что уже заработано.', h('div.grid.g-2',
      h('div.card', h('h4', 'Две грядки в подарок'), h('p.small', 'Добавляются один раз. Прежние грядки, урожай и помощь соседей остаются; повторный вход не выдаёт подарок заново.')),
      h('div.card', h('h4', 'Уровень и награды сохраняются'), h('p.small', 'Новая шкала XP сохраняет уровень, долю прогресса и звёзды. Полученные вещи и награды остаются с игроком.')),
      h('div.card', h('h4', 'Растения не исчезают'), h('p.small', 'У посаженных культур сохраняется их время созревания. Новые сроки действуют для новых посадок. Старую пшеницу можно собрать.')),
      h('div.card', h('h4', 'Коллекции остаются целыми'), h('p.small', 'Пруд добавляет свою рыбу и отдельную коллекцию. Морские и островные рыбы, снасти, вещи, сумка и кладовая сохраняются.')),
    )),
  );
  let waterfrontSeen = false;
  for (const [i, group] of d.requirementGroups.entries()) {
    const isWaterfront = /набереж|HUD/i.test(group.title) || group.items.some((r) => /^V\d/.test(r.id));
    const id = isWaterfront ? waterfrontSeen ? 'waterfront-' + i : 'waterfront' : i === 0 ? 'requests' : 'requests-' + i;
    if (isWaterfront) waterfrontSeen = true;
    root.append(section(id, `${group.title} · ${group.items.length}`, 'Номера и условия взяты из брифа. Это состав проекта, а не отметки о выполнении.', h('div.pack1-requirements', group.items.map((r) => h('details.card.pack1-requirement', h('summary', h('span.pack1-request-id', r.id), h('span', r.title)), h('p', r.acceptance))))));
  }
  const waterfront = h('div.card.pack1-waterfront-slot', h('h4', 'Схема набережной'), h('p.small', 'Место для следующей согласованной схемы: кафе, автоматы, фонтан и крысиные бега. Сейчас расположение описано пунктами брифа; схема ещё не выбрана.'), h('a.btn.small', { href: '#pack1/waterfront' }, 'Посмотреть все просьбы'));
  if (d.waterfrontDiagram?.src) waterfront.append(h('img', { src: d.waterfrontDiagram.src, alt: d.waterfrontDiagram.alt || 'Согласованная схема набережной' }));
  root.append(section('waterfront-plan', 'Набережная: место для согласованного плана', '', waterfront),
    section('sources', 'Из чего собран обзор', 'Генератор перечитывает бриф, расчётную модель и layout.json. Прежние вкладки остаются историей v11.', h('div.card', h('ul.pack1-sources', d.meta.sources.map((s) => h('li', h('a', { href: s.href }, s.file), h('span.small.muted', ' · обновлено ' + new Date(s.mtime).toLocaleString('ru-RU'))))), h('p.small.muted', 'Этот экран подтверждает содержание предложения. Он не доказывает внедрение, проверку игры или выпуск.'), h('details', h('summary', 'Контракт сохранений и интеграции из брифа'), mdBlock(sourceSection(d, 'Сохранения и интеграция'))), h('details', h('summary', 'Сборка и отпечатки источников'), h('p.small', 'node docs/farm/review/pack1-build.mjs'), h('ul.small', d.meta.sources.map((s) => h('li', `${s.key}: ${s.sha256.slice(0, 16)}`)))))));
  return { show(sub) { if (sub) requestAnimationFrame(() => root.querySelector('#pack1-' + CSS.escape(sub))?.scrollIntoView({ behavior: 'auto', block: 'start' })); } };
}
