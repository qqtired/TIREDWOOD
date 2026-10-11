import type { HudSlots } from '../../ui/kit/slots.ts';
// Древо разлома в HUD (lab/ui/screens/farm.js «Древо разлома: плашка события»): наверху по центру ОДНА плашка — «просыпается»
// (за 5 минут, с таймером) и «Цветение 62 %» (фаза, твой вклад, отметки фаз на полосе, «до 01:00» — час конца из b.end). Плашка живёт в верх-центре
// кита (ui.top.event, PRIO.boss) — отдельной разметки наверху нет. Тосты: проснулось, новая фаза, шишка-ворчунья на земле,
// шишку подобрал сам. Итог цветения — окно (bossend.ts). Модель — tree-model.ts (без DOM), 3D — client/farm/3d/boss.ts.
import { BOSS_CONE_POINTS } from '../../../shared/farmdata.ts';
import type { FarmBossView, FarmSysMsg } from '../../../shared/farmsys.ts';
import { PRIO, type TopCenter } from '../../ui/kit/topcenter.ts';
import { esc, meter, ui, type FarmToast } from './common.ts';
import { clockHour, mskHour } from './fmt.ts';
import { PHASE_NAMES, treeEvent } from './tree-model.ts';

const KEY = 'farm-tree';
/** Шишка-ворчунья на земле: подсказываем не чаще раза в минуту */
const CONE_HINT_MS = 60_000;

export interface TreeHost {
  boss(): FarmBossView | null;
  /** Серверное время */
  now(): number;
  /** pid владельца своего участка (кто подобрал шишку — farmBossFx.by) */
  mePid(): number;
  toast(t: FarmToast): void;
}

export class FarmTree {
  private readonly top: TopCenter;
  private readonly host: TreeHost;
  private st: FarmBossView['st'] | '' = '';
  private phase = 0;
  private cones = 0;
  private coneAt = 0;
  private on = false;
  private near = false;
  private readonly detail = document.createElement('div');
  private detailKey = '';

  constructor(top: TopCenter, host: TreeHost, slots: HudSlots) {
    this.top = top;
    this.host = host;
    this.detail.className = 'k-plate farm-tree-near'; this.detail.dataset.mode = 'farm'; this.detail.hidden = true; slots.tl.append(this.detail);
  }

  setNear(near: boolean): void { if (this.near === near) return; this.near = near; this.update(); }

  /** Раз в секунду и при каждом farmBoss: перерисовать плашку (DOM меняется, только если поменялась разметка) */
  update(): void {
    if (!this.on) return;
    const b = this.host.boss();
    this.detail.hidden = !(this.near && b);
    if (this.near && b) {
      const hp = Math.max(0, b.remaining ?? b.hp - b.bloom);
      const html = `<p class="k-eyebrow">Древо разлома</p>${b.st === 'awake' ? `<p><b>${b.hp > 0 ? `Здоровье: ${hp} из ${b.hp}` : 'Ждёт первого вклада'}</b></p>${meter(hp / Math.max(1, b.hp), 'k-meter--mode k-meter--thin')}<p class="k-gold">Твой вклад: ${b.mine} · цель ${b.quota}</p><div class="farm-tree-top">${b.top.map(r => `<div><span>${esc(r.nick)}</span><b>${r.pts}</b></div>`).join('')}</div><p>Собирай урожай и подбирай шишки</p><p class="k-dim">${b.rules === 'legacy' ? 'Этот заход сохраняет прежнюю цель' : 'Цель растёт только с участниками'}</p>` : b.st === 'bloom' ? '<p>Древо расцвело · спасибо за помощь!</p>' : '<p>Урожай помогает Древу, когда оно проснётся</p>'}`;
      if (html !== this.detailKey) { this.detailKey = html; this.detail.innerHTML = html; }
    }
    if (this.near && b?.st === 'awake') { this.top.clear(KEY); return; }
    const e = treeEvent(b, this.host.now());
    if (!e) { this.top.clear(KEY); return; }
    const icon = `<span class="k-event-ic">${ui('rift-tree', '')}</span>`;
    if (e.kind === 'soon') {
      this.top.event({
        key: KEY, prio: PRIO.boss, tone: 'good',
        html: `${icon}<div class="k-event-title">${e.title}</div><div class="k-event-sub">${e.sub}</div><div class="k-event-timer">${e.timer}</div>${meter(e.v, 'k-meter--thin k-meter--mode')}`,
      });
      return;
    }
    const marks = e.marks.map((m) => `<i style="left:${Math.round(m * 100)}%"></i>`).join('');
    this.top.event({
      key: KEY, prio: PRIO.boss, tone: 'good', lamp: true,
      html: `${icon}<div class="k-event-title">Цветение <span class="farm-bloom">${e.pct}</span> %</div><div class="k-event-sub">Фаза «${e.phaseName}» · <b class="k-gold">${esc(e.contrib)}</b></div><div class="k-event-timer farm-tree-left">${e.timer}</div><div class="farm-tree-bar">${meter(e.v, 'k-meter--mode farm-bloom-m', '', e.v)}${marks}</div>`,
    });
  }

  /** Состояние Древа пришло (farmBoss): плашка и тосты о смене */
  onBoss(b: FarmBossView): void {
    const was = this.st;
    const phase = this.phase;
    const cones = this.cones;
    this.st = b.st;
    this.phase = b.phase;
    this.cones = b.cones.length;
    // при входе в комнату состояние приходит уже готовым — не объявляем то, что идёт давно
    if (this.on && was !== '') {
      if (b.st === 'awake' && was !== 'awake') this.host.toast({ key: 'farm-tree', tone: 'good', icon: 'ui:rift-tree', title: 'Древо проснулось', sub: `Собирай урожай — цветение идёт до ${clockHour(mskHour(b.end))}` });
      else if (b.st === 'awake' && b.phase !== phase && phase > 0) this.host.toast({ key: 'farm-tree', tone: 'info', icon: 'ui:rift-tree', title: `Новая фаза: «${PHASE_NAMES[Math.min(3, Math.max(0, b.phase - 1))]}»` });
      if (b.st === 'awake' && this.cones > cones && this.host.now() > this.coneAt) {
        this.coneAt = this.host.now() + CONE_HINT_MS;
        this.host.toast({ key: 'farm-cone', tone: 'good', icon: 'ui:grumpy-cone', title: 'Шишка-ворчунья — у костра', sub: `Пробеги сквозь неё: +${BOSS_CONE_POINTS} к вкладу` });
      }
    }
    this.update();
  }

  /** Эффекты Древа: шишку подобрал сам — тост (чужие и чихи рисует 3D) */
  onFx(m: Extract<FarmSysMsg, { t: 'farmBossFx' }>): void {
    if (m.k === 'cone' && m.by !== undefined && m.by === this.host.mePid()) {
      this.host.toast({ key: 'farm-cone', tone: 'good', icon: 'ui:grumpy-cone', title: 'Шишка подобрана', sub: `+${BOSS_CONE_POINTS} к вкладу в цветение` });
    }
  }

  /** Вошли на ферму (true) или ушли: плашку убираем */
  setVisible(v: boolean): void {
    this.on = v;
    if (v) { this.st = ''; this.phase = 0; this.cones = 0; this.update(); }
    else { this.top.clear(KEY); this.detail.hidden = true; this.near = false; }
  }

}
