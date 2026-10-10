// Доска фермы (design-v11 §14.2): карта 20 участков с номерами и список — кто здесь / спит, ник, уровень, репутация (своя),
// «можно полить: N». Свой участок — золотом. Свободный участок можно занять (claimPlot). Блок Древа и Фургона сверху.
// Древо — часть B1: пока их сообщения не пришли, показываем только время «проснётся в 19:00».
import { repLevel } from '../../../shared/farm.ts';
import { BOSS_END_HOUR, BOSS_START_HOUR, HELPS_PER_BED, HELP_MIN_LEFT_MS, REP_LEVELS } from '../../../shared/farmdata.ts';
import { FARM_PLOTS_GEO, farmUse } from '../../../shared/farmmap.ts';
import type { FarmPlotView } from '../../../shared/farmnet.ts';
import { FarmWin, btn, clockHour, el, fmtLeft, mskHour, msToNextHour } from './common.ts';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag: string, attrs: Record<string, string | number> = {}): SVGElement => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

/** Метки общих мест на карте */
const MARKS: readonly [id: Parameters<typeof farmUse>[0], emoji: string][] = [
  ['semechkin', '🌱'], ['grib', '🍄'], ['orders', '📋'], ['van', '🚚'], ['boss', '🌳'], ['cart', '🛒'], ['farmBoard', '🪧'], ['troughN', '💧'],
];

/** Сколько грядок на участке можно полить соседу: растёт, до созревания > 20 с, помощей меньше трёх */
function helpable(p: FarmPlotView, now: number): number {
  return p.beds.filter((b) => b.c && b.r - now > HELP_MIN_LEFT_MS && b.h < HELPS_PER_BED).length;
}

export class BoardWin extends FarmWin {
  private picked = -1;

  /** Каждый раз начинаем без выбранного участка */
  open(tab?: string): void {
    this.picked = -1;
    super.open(tab);
  }

  protected draw(body: HTMLElement): void {
    const plots = this.host.plots();
    const now = this.host.now;
    const f = this.host.f;
    const roster = this.host.roster();
    const rows = plots.map((p) => ({ p, online: p.pid > 0 && !p.sleeping, lvl: roster.find((r) => r.plot === p.i)?.level ?? p.level }));

    // верхняя полоска: Древо и Фургон
    const top = body.appendChild(el('div', 'fm-board-top'));
    top.append(this.treeBlock(), this.vanBlock());

    const cols = body.appendChild(el('div', 'fm-board'));
    // --- карта
    const left = cols.appendChild(el('div', 'fm-board-map'));
    const map = svg('svg', { viewBox: '-38 -38 76 76', class: 'fm-map', role: 'img', 'aria-label': 'Карта участков' });
    map.append(svg('rect', { x: -36, y: -36, width: 72, height: 72, rx: 4, class: 'fm-map-ground' }));
    map.append(svg('circle', { cx: 0, cy: 0, r: 4.5, class: 'fm-map-well' }));
    for (const [id, emoji] of MARKS) {
      const u = farmUse(id);
      if (!u) continue;
      const t = svg('text', { x: id === 'troughN' ? 0 : u.x, y: id === 'troughN' ? 0.6 : u.z + 1.1, class: 'fm-map-mark', 'text-anchor': 'middle' });
      t.textContent = emoji;
      map.append(t);
    }
    for (const { p, online } of rows) {
      const g = FARM_PLOTS_GEO[p.i];
      const mine = p.i === this.host.plot;
      const cls = `fm-plot ${mine ? 'mine' : p.pid === 0 ? 'free' : online ? 'on' : 'sleep'}${this.picked === p.i ? ' pick' : ''}`;
      const grp = svg('g', { class: cls, transform: `translate(${g.x} ${g.z}) rotate(${(-g.yaw * 180) / Math.PI})` });
      grp.append(svg('rect', { x: -3, y: -5, width: 6, height: 10, rx: 0.8 }));
      const t = svg('text', { x: 0, y: 1.6, 'text-anchor': 'middle', class: 'fm-plot-n', transform: `rotate(${(g.yaw * 180) / Math.PI})` });
      t.textContent = String(p.i + 1);
      grp.append(t);
      grp.addEventListener('click', () => { this.picked = p.i; this.refresh(); });
      map.append(grp);
    }
    left.append(map);
    const sel = this.picked >= 0 ? plots[this.picked] : undefined;
    const info = left.appendChild(el('div', 'fm-board-info'));
    if (sel) {
      info.append(el('b', '', `Участок ${sel.i + 1}${sel.i === this.host.plot ? ' · твой' : ''}`));
      info.append(el('small', '', sel.pid === 0 ? 'Свободен' : `${sel.nick} · ур. ${sel.level}${sel.sleeping ? ' · спит' : ''}`));
      if (sel.pid !== 0 && sel.i !== this.host.plot) info.append(el('small', '', `Можно полить грядок: ${helpable(sel, now)}`));
      if (sel.pid === 0) {
        info.append(el('small', 'fm-fine', 'Подойди к участку (до 12 м) и займи его.'));
        info.append(btn('fm-go', 'Занять участок', () => this.host.send({ t: 'farm', a: 'claimPlot', plot: sel.i })));
      }
    } else info.append(el('small', 'fm-fine', 'Нажми на участок на карте, чтобы увидеть, кто там живёт.'));
    info.append(el('small', 'fm-legend', '🟢 здесь · 💤 спит · пунктир — свободен · золото — твой'));

    // --- список
    const list = cols.appendChild(el('div', 'fm-board-list'));
    const free = rows.filter((r) => r.p.pid === 0).length;
    const taken = rows.filter((r) => r.p.pid !== 0);
    taken.sort((a, b) => Number(b.p.i === this.host.plot) - Number(a.p.i === this.host.plot) || Number(b.online) - Number(a.online) || b.lvl - a.lvl || a.p.i - b.p.i);
    for (const { p, online, lvl } of taken) {
      const mine = p.i === this.host.plot;
      const row = list.appendChild(el('button', `fm-prow${mine ? ' mine' : ''}${this.picked === p.i ? ' pick' : ''}`));
      row.type = 'button';
      row.append(el('span', 'fm-state', online ? '🟢' : '💤'), el('span', 'fm-prow-n', `№ ${p.i + 1}`));
      row.append(el('b', 'fm-prow-nick', p.nick || '—'), el('span', 'fm-prow-lv', `ур. ${lvl}`));
      row.append(el('small', 'fm-prow-x', mine ? `реп.: ${REP_LEVELS[repLevel(f.rep) - 1].name}` : `полить: ${helpable(p, now)}`));
      row.addEventListener('click', () => { this.picked = p.i; this.refresh(); });
    }
    if (!taken.length) list.append(el('p', 'fm-fine', 'Пока на ферме никого нет.'));
    list.append(el('small', 'fm-fine', `Свободных участков: ${free}`));
  }

  private treeBlock(): HTMLElement {
    const box = el('div', 'fm-tbox');
    box.append(el('span', 'fm-tico', '🌳'));
    const text = box.appendChild(el('div'));
    text.append(el('b', '', 'Древо разлома'));
    const sub = text.appendChild(el('small'));
    const boss = this.host.boss();
    this.live(sub, () => {
      const n = this.host.now;
      if (boss?.phase === 'awake') return `Цветение ${Math.round(boss.bloom * 100)} % · твой вклад ${Math.round(boss.share * 100)} %`;
      const h = mskHour(n);
      if (h >= BOSS_START_HOUR || h < BOSS_END_HOUR) return 'Древо проснулось — загляни к пьедесталу!';
      const wait = ((BOSS_START_HOUR - h - 1 + 24) % 24) * 3_600_000 + msToNextHour(n);
      return `Проснётся в ${clockHour(BOSS_START_HOUR)} · через ${fmtLeft(wait)}`;
    });
    if (boss?.top.length) {
      const top = box.appendChild(el('small', 'fm-tbox-top', `Прошлый раз: ${boss.top.slice(0, 3).map((t) => `${t.nick} ${Math.round(t.pct * 100)} %`).join(' · ')}`));
      top.title = 'Лучший вклад в прошлое событие';
    }
    return box;
  }

  private vanBlock(): HTMLElement {
    const box = el('div', 'fm-tbox');
    box.append(el('span', 'fm-tico', '🚚'));
    const text = box.appendChild(el('div'));
    text.append(el('b', '', 'Фургон'));
    const sub = text.appendChild(el('small'));
    this.live(sub, () => {
      const n = this.host.now;
      const open = mskHour(n) % 2 === 0;
      return open ? `Открыт до ${clockHour(mskHour(n) + 1)}` : `Приедет в ${clockHour(mskHour(n) + 1)} · через ${fmtLeft(msToNextHour(n))}`;
    });
    return box;
  }
}
