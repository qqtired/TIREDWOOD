// План 50 волн для страницы lab/fort-rework: таблица по главам, кривая сложности по минутам (сейчас и Ф50-1),
// время забега и жетоны. Нагрузку «сейчас» берём из настоящего кода (shared/fortwaves.ts), расписание «сейчас» —
// с осадой (FORTRESS_SIEGE=1, как на сайте): боссы каждые 5 волн, Кракен на 25/50/75/100.
import { releaseSeconds, waveHpPerDefender, waveTokens } from '../../shared/fortwaves.ts';
import { takeButton } from './page.ts';

interface Wave {
  w: number;
  /** что впервые */
  fresh: string[];
  /** состав / тема */
  mix: string;
  boss?: string;
  kind?: 'boss' | 'super' | 'final' | 'fly';
  /** событие, осада, десант */
  ev?: string;
}

const CHAPTERS: Array<[number, string, string]> = [
  [1, 'Глава I · Первые гости', 'знакомство: новый враг почти каждую волну, первый босс на 5-й'],
  [11, 'Глава II · Осада', 'машины и роли осады, первые проломы стен'],
  [21, 'Глава III · Море', 'десант и Кракен посередине забега'],
  [31, 'Глава IV · Небо', 'налёты крылаток и летающий босс'],
  [41, 'Глава V · Последний штурм', 'всё сразу, чемпионы, финальный босс'],
];

/** Ф50-1 по волнам. Боссы — каждый один раз; осадные роли и события — между ними, не на боссах. */
const PLAN: Wave[] = [
  { w: 1, fresh: ['Шаркун', 'Шустрик'], mix: 'сразу двое, на четверть плотнее нынешней 1-й' },
  { w: 2, fresh: ['Липучка'], mix: 'шаркуны, шустрики, липучки лезут по стенам' },
  { w: 3, fresh: ['Бугай'], mix: 'первый тяжёлый — бьёт ворота и стены' },
  { w: 4, fresh: ['Крылатка'], mix: 'налёт с пикированием на стену' },
  { w: 5, fresh: [], mix: 'шаркуны, шустрики, крылатки', boss: 'Барон Варенья', kind: 'boss' },
  { w: 6, fresh: ['Щитоносец', 'Осадная башня'], mix: 'стена щитов, мост на стену', ev: 'осада: башня' },
  { w: 7, fresh: ['Пузырь'], mix: 'пузыри у ворот', ev: 'десант: 1 лодка с якорем' },
  { w: 8, fresh: ['Канатник', 'элита'], mix: 'золотая окантовка — ×2,5 HP' },
  { w: 9, fresh: ['Плевальщик', 'Гриб-пружинка'], mix: 'обстрел стены и прыжки на неё' },
  { w: 10, fresh: ['пролом стены'], mix: 'шустрики и подрывники бегут к пролому', boss: 'Таран', kind: 'boss' },
  { w: 11, fresh: ['Подрывник'], mix: 'бочки к воротам', ev: 'десант' },
  { w: 12, fresh: ['Полевая батарея', 'события'], mix: 'залпы по участку стены', ev: 'метеоры / туман / лихорадка / припасы' },
  { w: 13, fresh: ['Лекарь'], mix: 'лазарет за спинами' },
  { w: 14, fresh: ['Смоливщик'], mix: 'смола под ноги', ev: 'десант' },
  { w: 15, fresh: [], mix: 'тяжёлая: бугаи и щиты', boss: 'Валун', kind: 'boss' },
  { w: 16, fresh: ['Чугунок'], mix: 'чугунная тема' },
  { w: 17, fresh: ['Зонтиковик'], mix: 'навесы над толпой', ev: 'событие' },
  { w: 18, fresh: ['Старшина осады'], mix: 'распорка у ворот', ev: 'десант' },
  { w: 19, fresh: [], mix: 'экзамен главы', ev: 'осада: башня и батарея разом' },
  { w: 20, fresh: ['чемпионы'], mix: 'чемпион ускоряет соседей', boss: 'Король-Тыква', kind: 'boss' },
  { w: 21, fresh: ['2 лодки'], mix: 'море — второй фронт', ev: 'десант: 2 лодки' },
  { w: 22, fresh: [], mix: 'натиск', ev: 'событие' },
  { w: 23, fresh: [], mix: 'тяжёлая', ev: 'осада: башня' },
  { w: 24, fresh: [], mix: 'через стены', ev: 'десант: 2 лодки' },
  { w: 25, fresh: [], mix: 'половина орды с севера', boss: 'Кракен', kind: 'super' },
  { w: 26, fresh: [], mix: 'шустрая (выдох после Кракена)' },
  { w: 27, fresh: [], mix: 'подрыв', ev: 'событие' },
  { w: 28, fresh: [], mix: 'крабы с моря', boss: 'Краб-Кран', kind: 'boss', ev: 'десант' },
  { w: 29, fresh: [], mix: 'обстрел', ev: 'осада: батарея' },
  { w: 30, fresh: [], mix: 'лазарет', boss: 'Ткачиха', kind: 'boss' },
  { w: 31, fresh: [], mix: 'налёт: вдвое больше крылаток' },
  { w: 32, fresh: [], mix: 'стена щитов', ev: 'событие' },
  { w: 33, fresh: [], mix: 'две роли осады вдвоём и больше', ev: 'осада: канатники' },
  { w: 34, fresh: [], mix: 'налёт и пузыри', ev: 'десант: 3 лодки' },
  { w: 35, fresh: ['летающий босс'], mix: 'крылатки сопровождения', boss: 'Пеликан-Бомбардир', kind: 'fly' },
  { w: 36, fresh: [], mix: 'чугунная', ev: 'событие' },
  { w: 37, fresh: [], mix: 'тяжёлая', ev: 'осада: башня и батарея' },
  { w: 38, fresh: [], mix: 'через стены', ev: 'десант: 3 лодки' },
  { w: 39, fresh: [], mix: 'натиск', ev: 'событие' },
  { w: 40, fresh: [], mix: 'лазарет и щиты', boss: 'Леший', kind: 'boss' },
  { w: 41, fresh: [], mix: 'всё вперемешку', ev: 'осада и десант разом' },
  { w: 42, fresh: [], mix: 'элита до 40 %', ev: 'событие' },
  { w: 43, fresh: [], mix: 'подрыв', ev: 'осада: батарея' },
  { w: 44, fresh: [], mix: 'налёт', ev: 'десант: 3 лодки' },
  { w: 45, fresh: [], mix: 'обстрел', boss: 'Мельничиха', kind: 'boss' },
  { w: 46, fresh: [], mix: 'парад: элита всех видов' },
  { w: 47, fresh: [], mix: 'тяжёлая', ev: 'событие' },
  { w: 48, fresh: [], mix: 'через стены', ev: 'осада: всё сразу' },
  { w: 49, fresh: [], mix: 'канун: чемпионы', ev: 'десант: 4 лодки' },
  { w: 50, fresh: ['финальный босс'], mix: 'вся армия Барона', boss: 'Избушка (финал)', kind: 'final' },
];

// ---------------------------------------------------------------- время и жетоны

/** Ф50-1: какой «нынешней» волне по силе равна волна w (1 → 2, 50 → 95): кривая та же, путь вдвое короче */
export function oldEquivalent(w: number): number {
  return Math.min(100, 2 + 1.9 * (w - 1));
}

/** Сколько длится волна, с: выход орды + добивание; босс, Кракен и финал — дольше (оценка, не замер) */
function waveSeconds(release: number, kind?: string): number {
  const tail = 22;
  return release + tail + (kind === 'final' ? 150 : kind === 'super' ? 90 : kind ? 55 : 0);
}

/** Сейчас (100 волн, осада): боссы на 5, 10 … кроме 25/50/75/100 (Кракен) */
function nowKind(w: number): string | undefined {
  if (w % 25 === 0) return w === 100 ? 'final' : 'super';
  return w % 5 === 0 ? 'boss' : undefined;
}

function breakAfter(kind: string | undefined, nextSuper: boolean): number {
  return nextSuper ? 30 : kind ? 20 : 15;
}

/** Жетоны Ф50-1 за волну: 7 + ⌊w/5⌋, босс +10, Кракен +25, финал +40 */
export function tokens50(w: number, kind?: string): number {
  return 7 + Math.floor(w / 5) + (kind === 'boss' || kind === 'fly' ? 10 : 0) + (kind === 'super' ? 25 : 0) + (kind === 'final' ? 40 : 0);
}

interface Row { w: number; start: number; dur: number; load: number; tokens: number; kind?: string; name?: string }

function curveNow(): Row[] {
  const out: Row[] = [];
  let t = 25;
  for (let w = 1; w <= 100; w++) {
    const kind = nowKind(w);
    const dur = waveSeconds(releaseSeconds(w), kind);
    // жетоны «сейчас»: формула waveTokens (+8 за босса — по графику осады каждые 5 волн, +25 за Кракена)
    const tok = Math.min(14, 6 + Math.floor(w / 10)) + (kind === 'boss' ? 8 : 0) + (kind === 'super' || kind === 'final' ? 25 : 0);
    out.push({ w, start: t, dur, load: waveHpPerDefender(w) / releaseSeconds(w), tokens: tok, kind, name: kind === 'super' ? 'Кракен' : kind === 'final' ? 'Кракен IV и Барон' : kind ? 'босс' : undefined });
    t += dur + breakAfter(kind, nowKind(w + 1) === 'super');
  }
  void waveTokens;
  return out;
}

function curve50(): Row[] {
  const out: Row[] = [];
  let t = 25;
  for (const p of PLAN) {
    const wo = oldEquivalent(p.w);
    const rel = 14 + Math.min(16, 0.6 * (p.w - 1));
    const dur = waveSeconds(rel, p.kind);
    // старт с вызовом: первые 5 волн на 25 % плотнее
    const boost = p.w <= 5 ? 1.25 : 1;
    out.push({ w: p.w, start: t, dur, load: (waveHpPerDefender(wo) / releaseSeconds(wo)) * boost, tokens: tokens50(p.w, p.kind), kind: p.kind, name: p.boss });
    const next = PLAN[p.w];
    t += dur + breakAfter(p.kind, next?.kind === 'super' || next?.kind === 'final');
  }
  return out;
}

const fmtMin = (s: number) => `${Math.round(s / 60)}-й минуте`;
const fmtH = (s: number) => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`; };

// ---------------------------------------------------------------- варианты

export const WAVE_VARIANTS = [
  {
    id: 'Ф50-1', star: true, cost: 'M', title: 'Пять глав по 10 волн',
    text: '<b>Кривая та же, путь вдвое короче.</b> Каждый босс — один раз, без «Барона II»: 5 Барон · 10 Таран · 15 Валун · 20 Тыква · 25 Кракен · 28 Краб-Кран · 30 Ткачиха · 35 Пеликан-Бомбардир (летающий) · 40 Леший · 45 Мельничиха · 50 Избушка (финал). Новое — примерно каждые полторы волны до самого конца.',
    list: ['1-я волна сразу с шустриками и на 25 % плотнее — скучного разгона нет', 'проломы стен начинаются с Тарана на 10-й, батарея на 12-й', 'Кракен — середина забега, а не четверть', 'сила волны w = нынешняя волна 2+1,9(w−1); всё считает сервер, как сейчас'],
  },
  {
    id: 'Ф50-2', cost: 'S', title: 'Просто сжать 100 → 50',
    text: '<b>Дёшево, но скучнее.</b> Последняя волна 50, все пороги вдвое раньше. Финал — Кракен II и Барон (как нынешняя 100-я), новых боссов в плане нет, Краб-Кран и Мельничиха — на 20-й и 23-й.',
    list: ['пара часов работы, без новых моделей', 'повторов боссов меньше, но финал знакомый', 'летающему и финальному боссу места нет'],
  },
];

// ---------------------------------------------------------------- отрисовка

export function renderWaves(o: { lead: HTMLElement; why: HTMLElement; chart: HTMLElement; legend: HTMLElement; variants: HTMLElement; table: HTMLElement; note: HTMLElement }): void {
  const now = curveNow();
  const nu = curve50();
  // ×1 — нынешняя 1-я волна
  const base = now[0].load;
  for (const r of [...now, ...nu]) r.load /= base;
  const endNow = now[now.length - 1].start + now[now.length - 1].dur;
  const end50 = nu[nu.length - 1].start + nu[nu.length - 1].dur;
  const tokNow = now.reduce((s, r) => s + r.tokens, 0) + 40 + 100;
  const tok50 = nu.reduce((s, r) => s + r.tokens, 0) + 40 + 100;
  o.lead.innerHTML = `Сейчас полный забег — 100 волн, около <b>${fmtH(endNow)}</b> хорошей командой. Всё новое заканчивается на 45-й (Мельничиха): дальше 55 волн повторов — «Барон II», «Таран II», Кракен II–IV. `
    + `Предлагаю 50 волн за <b>${fmtH(end50)}</b>: та же кривая силы, но вдвое быстрее, каждый босс один раз и новый финал. Принцип «недобитые копятся» не трогаю: живых не больше 60, остальные ждут, волна не кончится, пока жив хоть один.`;

  const card = (title: string, items: string[]) => `<div class="fr-card"><h3>${title}</h3><ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
  o.why.innerHTML = card('Сейчас — 100 волн', [
    `полный забег ≈ <b>${fmtH(endNow)}</b>, Кракен — на ${fmtMin(now[24].start)}`,
    'боссов 16 + Кракен 4 раза; после 45-й нового нет',
    '1-я волна — одни шаркуны гуськом',
    `жетонов за полный забег ≈ <b>${tokNow}</b> (${(tokNow / (endNow / 60)).toFixed(1)} в минуту)`,
  ]) + card('Ф50-1 — 50 волн', [
    `полный забег ≈ <b>${fmtH(end50)}</b>, Кракен — на ${fmtMin(nu[24].start)}`,
    '8 боссов + Кракен + летающий + финальный, каждый один раз',
    'новое каждые 1–2 волны до 50-й: роли осады, проломы, главы',
    `жетонов ≈ <b>${tok50}</b> (${(tok50 / (end50 / 60)).toFixed(1)} в минуту, цель 8–15)`,
  ]) + card('Что не меняется', [
    'недобитые копятся: лимит 60 живых, лишние ждут у леса',
    'HP и урон считает сервер по тем же формулам — меняется только номер «силы»',
    'рекорды выше 50 сохраняются как есть; прогресс игроков не трогаем',
    'карточка волны, HUD, щит, мини-карта, TAB — как одобрено',
  ]);

  // кривая
  const W = 1160;
  const H = 300;
  const L = 52;
  const R = 16;
  const T = 14;
  const B = 34;
  const maxMin = Math.ceil(endNow / 60 / 15) * 15;
  const maxLoad = Math.max(...now.map((r) => r.load), ...nu.map((r) => r.load));
  const x = (s: number) => L + ((s / 60) / maxMin) * (W - L - R);
  const y = (v: number) => T + (1 - Math.log10(v) / Math.log10(maxLoad * 1.5)) * (H - T - B);
  const path = (rows: Row[]) => rows.map((r, i) => `${i ? 'L' : 'M'}${x(r.start).toFixed(1)},${y(r.load).toFixed(1)}`).join('');
  let grid = '';
  for (let m = 0; m <= maxMin; m += 15) grid += `<line x1="${x(m * 60)}" x2="${x(m * 60)}" y1="${T}" y2="${H - B}" stroke="rgba(255,236,205,.10)"/><text x="${x(m * 60)}" y="${H - 14}" fill="rgba(255,236,205,.6)" font-size="12" text-anchor="middle">${m === 0 ? '0' : m % 60 === 0 ? `${m / 60} ч` : `${m}′`}</text>`;
  for (const v of [1, 3, 10, 30, 100, 300, 1000]) if (v <= maxLoad) grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,236,205,.08)"/><text x="${L - 8}" y="${y(v) + 4}" fill="rgba(255,236,205,.55)" font-size="12" text-anchor="end">×${v}</text>`;
  const dots = (rows: Row[], color: string) => rows.filter((r) => r.kind).map((r) => `<circle cx="${x(r.start).toFixed(1)}" cy="${y(r.load).toFixed(1)}" r="${r.kind === 'final' || r.kind === 'super' ? 6 : 4}" fill="${r.kind === 'super' ? '#b06ad8' : r.kind === 'final' ? '#ffd35a' : color}" stroke="#072b28" stroke-width="1.5" data-tip="Волна ${r.w} · ${r.name ?? ''} · ${Math.round(r.start / 60)}-я минута"/>`).join('');
  const end = (s: number, c: string, label: string) => `<line x1="${x(s)}" x2="${x(s)}" y1="${T}" y2="${H - B}" stroke="${c}" stroke-dasharray="4 4" opacity=".7"/><text x="${x(s) - 6}" y="${H - B - 10}" fill="${c}" font-size="13" font-weight="800" text-anchor="end">${label}</text>`;
  o.chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Сложность по минутам">${grid}
    <text x="${W - R}" y="${H - 1}" fill="rgba(255,236,205,.45)" font-size="11" text-anchor="end">минуты забега →</text>
    <path d="${path(now)}" fill="none" stroke="#7fb6d6" stroke-width="2.5" opacity=".85"/>
    <path d="${path(nu)}" fill="none" stroke="#ffd35a" stroke-width="3.5"/>
    ${dots(now, '#7fb6d6')}${dots(nu, '#ff8a6a')}
    ${end(end50, '#ffd35a', `Ф50-1: финал ≈ ${fmtH(end50)}`)}${end(endNow, '#7fb6d6', `сейчас: 100-я ≈ ${fmtH(endNow)}`)}
  </svg>`;
  o.legend.innerHTML = '<span><i style="background:#ffd35a"></i>Ф50-1</span><span><i style="background:#7fb6d6"></i>сейчас, 100 волн</span><span><i style="background:#ff8a6a;height:8px;width:8px;border-radius:50%"></i>босс</span><span><i style="background:#b06ad8;height:8px;width:8px;border-radius:50%"></i>Кракен</span><span>по вертикали — HP орды в секунду на защитника (×1 — нынешняя 1-я волна), формулы директора</span>';
  const tip = document.createElement('div');
  tip.className = 'fr-tip';
  tip.hidden = true;
  document.body.append(tip);
  o.chart.addEventListener('mousemove', (e) => {
    const t = (e.target as Element).getAttribute?.('data-tip');
    tip.hidden = !t;
    if (t) { tip.textContent = t; tip.style.left = `${e.clientX + 12}px`; tip.style.top = `${e.clientY + 12}px`; }
  });
  o.chart.addEventListener('mouseleave', () => { tip.hidden = true; });

  // варианты
  for (const v of WAVE_VARIANTS) {
    const el = document.createElement('div');
    el.className = 'fr-var';
    el.dataset.pick = v.id;
    el.innerHTML = `<div class="fr-var-top"><span class="id">${v.id}</span>${v.star ? '<span class="star">★ советую</span>' : ''}<span class="cost">цена <b>${v.cost}</b></span></div><h4>${v.title}</h4><p>${v.text}</p><ul>${v.list.map((x) => `<li>${x}</li>`).join('')}</ul>`;
    el.append(takeButton(v.id, 'Беру этот план'));
    el.addEventListener('click', () => el.querySelector<HTMLButtonElement>('.fr-take')!.click());
    o.variants.append(el);
  }

  // таблица
  let html = '<table class="fr-waves"><thead><tr><th>№</th><th>Впервые</th><th>Состав / тема</th><th>Босс</th><th>Осада, десант, событие</th><th>Минута</th><th>Волна, с</th><th>Жетоны</th></tr></thead><tbody>';
  for (const p of PLAN) {
    const ch = CHAPTERS.find((c) => c[0] === p.w);
    if (ch) html += `<tr class="ch"><td colspan="8">${ch[1]} <span class="fr-note">— ${ch[2]}</span></td></tr>`;
    const r = nu[p.w - 1];
    const cls = p.kind === 'super' || p.kind === 'final' ? 'super' : p.kind ? 'boss' : '';
    html += `<tr class="${cls}"><td class="w">${p.w}</td><td>${p.fresh.map((f) => `<span class="fr-new">${f}</span>`).join(', ')}</td><td>${p.mix}</td><td>${p.boss ? `<span class="fr-bossname">${p.boss}</span>` : ''}</td><td class="fr-ev">${p.ev ?? ''}</td><td class="num">${Math.floor(r.start / 60)}</td><td class="num">${Math.round(r.dur)}</td><td class="num">${r.tokens}</td></tr>`;
  }
  html += '</tbody></table>';
  o.table.innerHTML = html;
  o.note.innerHTML = 'время — оценка: выход орды 14–30 с + добивание ~22 с, босс +55 с, Кракен +90 с, финал +150 с; передышка 15 / 20 / 30 с. Жетоны за волну: 7 + ⌊w/5⌋, босс +10, Кракен +25, финал +40; плюс до 40 за добивания, победа +100, лучший +10, рекорд +15.';
}
