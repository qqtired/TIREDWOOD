// Доска фермы (lab/ui/screens/farm.js «Доска фермы: соседи и „Помочь“»): карта 20 участков по настоящим местам (свой — золотом,
// здесь — зелёная рамка, спит — серый, свободный — пунктир) и список соседей. У тех, кому можно полить, — «Помочь»: окно
// закрывается и подсказывает дорогу к участку, а у грядки соседа подсказка E сама предлагает полить (сцена). Сверху — Древо
// разлома: когда проснётся, а пока цветёт — прогресс и твой вклад. Фургон отсюда убран: он в карточке фермы и в «Заказах».
// Свободный участок можно занять (claimPlot) — выбери его на карте.
import { farmLevel, repLevel } from '../../../shared/farm.ts';
import { helpView } from '../../../shared/farmhelp.ts';
import { BOSS_START_HOUR, HELPS_PER_BED, HELP_MIN_LEFT_MS, HELP_MIN_LEVEL, REP_LEVELS } from '../../../shared/farmdata.ts';
import { FARM_PLOTS_GEO } from '../../../shared/farmmap.ts';
import type { FarmPlotView } from '../../../shared/farmnet.ts';
import { treeLine } from './tree-model.ts';
import { FarmWin, clockHour, esc, fi, mskHour, msToNextHour, ui } from './common.ts';

/** Масштаб карты: 6 px на метр, центр — колодец (карта 420×420) */
const K = 6;
const MID = 210;

/** Сколько грядок на участке можно полить соседу: растёт, до созревания > 20 с, помощей меньше трёх */
export function helpable(p: FarmPlotView, now: number): number {
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
    const level = farmLevel(f.xp);
    const roster = this.host.roster();
    const rows = plots.map((p) => ({ p, online: p.pid > 0 && !p.sleeping, lvl: roster.find((r) => r.plot === p.i)?.level ?? p.level }));

    // --- карта
    const cells = rows.map(({ p, online }) => {
      const g = FARM_PLOTS_GEO[p.i];
      const mine = p.i === this.host.plot;
      const cls = mine ? 'is-me' : p.pid === 0 ? 'is-free' : online ? 'is-here' : 'is-sleep';
      const can = !mine && p.pid !== 0 && helpable(p, now) > 0 && level >= HELP_MIN_LEVEL;
      return `<button class="farm-plot ${cls}${this.picked === p.i ? ' is-pick' : ''}" type="button" data-plot="${p.i}" style="left:${(MID + g.x * K).toFixed(0)}px;top:${(MID + g.z * K).toFixed(0)}px" aria-label="Участок ${p.i + 1}">${p.i + 1}${can ? fi('watering-can', '') : ''}</button>`;
    }).join('');
    const map = `<div class="farm-map">${cells}${fi('well', 'farm-map-well')}${fi('ui:rift-tree', 'farm-map-tree')}${fi('van', 'farm-map-van')}</div>`;
    const sel = this.picked >= 0 ? plots[this.picked] : undefined;
    const info = sel && sel.pid === 0
      ? `<div class="k-cell farm-claim"><div><b>Участок ${sel.i + 1} свободен</b><div class="k-dim">Подойди к нему (до 12 м) — и занимай.</div></div><button class="k-btn k-btn--go k-btn--sm" type="button" data-claim="${sel.i}">Занять участок</button></div>`
      : '';

    // --- список
    const taken = rows.filter((r) => r.p.pid !== 0);
    taken.sort((a, b) => Number(b.p.i === this.host.plot) - Number(a.p.i === this.host.plot) || Number(b.online) - Number(a.online) || b.lvl - a.lvl || a.p.i - b.p.i);
    const free = rows.length - taken.length;
    const hv = helpView(f, now);
    const list = taken.map(({ p, online, lvl }) => {
      const mine = p.i === this.host.plot;
      const can = mine || level < HELP_MIN_LEVEL ? 0 : helpable(p, now);
      return `
        <div class="k-online-row${mine ? ' is-me' : ''}">
          <span class="k-ring k-ring--sm k-ring--mode" style="--p:1"><b>${lvl}</b></span>
          <span class="k-online-nick">${esc(p.nick || '—')}${mine ? ' <span class="k-dim">— ты</span>' : ''}</span>
          <span class="k-online-room">Участок ${p.i + 1} · ${online ? 'здесь' : 'спит'}${can ? ` · <b class="k-good">можно полить ${can}</b>` : mine ? ` · ${REP_LEVELS[repLevel(f.rep) - 1].name}` : ' · всё полито'}</span>
          <span class="k-online-act">${can ? `<button class="k-btn k-btn--go k-btn--sm farm-help-btn" type="button" data-help="${p.i}"><span class="k-row-line">${fi('watering-can')}Помочь</span></button>` : ''}</span>
        </div>`;
    }).join('');

    body.innerHTML = `
      <div class="farm-board">
        <div class="farm-board-map">
          ${map}
          <div class="farm-legend k-dim"><span><i class="farm-dot is-me"></i>твой</span><span><i class="farm-dot is-here"></i>фермер здесь</span><span><i class="farm-dot is-sleep"></i>спит</span><span><i class="farm-dot is-free"></i>свободно</span></div>
          ${info}
        </div>
        <div class="farm-board-side">
          <div class="k-cell farm-treebar">${ui('rift-tree', '')}<div><b data-live="treeT"></b><div class="k-dim" data-live="treeS"></div></div></div>
          <div class="farm-neigh">${list || '<p class="farm-lead k-dim">Пока на ферме никого нет.</p>'}</div>
          <div class="k-cell farm-helpline">${fi('help-hands')}<span>${level >= HELP_MIN_LEVEL ? `Твоя помощь: <b>${hv.points} из ${hv.max}</b> · каждая — 1 заряд лейки, соседу −20 % времени, тебе +1 репутация` : `Помогать соседям можно с ур. ${HELP_MIN_LEVEL} фермы.`}</span></div>
          <p class="k-faint">Свободных участков: ${free}</p>
        </div>
      </div>`;
    this.live('[data-live=treeT]', () => this.tree().title);
    this.live('[data-live=treeS]', () => this.tree().sub);
    this.onClick('[data-plot]', (b) => { this.picked = Number(b.dataset.plot); this.refresh(); });
    this.onClick('[data-claim]', (b) => this.host.send({ t: 'farm', a: 'claimPlot', plot: Number(b.dataset.claim) }));
    this.onClick('[data-help]', (b) => { const plot = Number(b.dataset.help); this.close(); this.host.goPlot(plot); });
  }

  private tree(): { title: string; sub: string } {
    const n = this.host.now;
    const last = this.host.bossLast();
    const wake = (): number => {
      const b = this.host.boss();
      return b && b.start > n ? b.start : n + (((BOSS_START_HOUR - mskHour(n) - 1 + 24) % 24) * 3_600_000 + msToNextHour(n));
    };
    const t = treeLine(this.host.boss(), n, wake(), clockHour(BOSS_START_HOUR));
    if (t.sleeping && last?.top.length) return { title: t.title, sub: `${t.sub} · прошлый раз: ${last.top.slice(0, 3).map((r) => `${esc(r.nick)} ${Math.round(r.share * 100)} %`).join(', ')}` };
    return t;
  }
}
