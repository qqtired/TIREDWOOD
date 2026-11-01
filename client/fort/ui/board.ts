// Tab в «Крепости» — окно кита (.k-scrim > .k-window, как на странице lab/ui «Крепость»): защитники со счётом боя
// (уровень, кто говорит, сбил, повален, золото, связь; твоя строка — золотом; в паузе — кто готов у колокола) и кто
// где ещё — остальные игроки не в крепости. Держишь Tab — окно, отпустил — закрылось.
import { FT_BREAK, FT_GATHER, type FortPlayerRow, type FortTowerRow } from '../../../shared/fort.ts';
import { TOWERS } from '../../../shared/fortarsenal.ts';
import { TOWER_SPOTS } from '../../../shared/fortmap.ts';
import type { OnlineEntry, RoomKind } from '../../../shared/messages.ts';
import { voiceTalkers } from '../../voice-prefs.ts';
import { socialState } from '../../ui/socialstate.ts';
import { el, escapeHtml, num } from './dom.ts';
import { fortImg } from './icons.ts';
import { CRAFT_ICON, cardById, cardIcon, craftName } from '../ideas/logic.ts';

/** Общак последней отбитой волны: сколько досталось каждому (событие pot) — до него общак не известен */
export interface PotInfo {
  wave: number;
  share: number;
}

const ROOM: Record<RoomKind, string> = {
  lobby: 'Набережная', paintball: 'Склад', race: 'Гонка', fort: 'Крепость', skill: 'Выше облаков', hide: 'Прятки',
  farm: 'Ферма', dungeon: 'Подземелье',
};

export class Board {
  readonly scrim: HTMLElement;
  private html = '';
  private towers: readonly FortTowerRow[] = [];
  /** «Т-идеи»: ремесло по номеру защитника и взятые карточки забега (client/fort/ideas) */
  private crafts: ReadonlyMap<number, number> = new Map();
  private taken: readonly string[] = [];

  constructor(parent: HTMLElement) {
    this.scrim = el('div', 'k-scrim ft-scrim ft-scrim-light ft-tab-scrim', parent);
    this.scrim.dataset.mode = 'fort';
    this.scrim.hidden = true;
  }

  setTowers(towers: readonly FortTowerRow[]): void {
    this.towers = towers;
  }

  setIdeas(crafts: ReadonlyMap<number, number>, taken: readonly string[]): void {
    this.crafts = crafts;
    this.taken = taken;
  }

  show(on: boolean, rows: readonly FortPlayerRow[], myId: number, phase: number, wave: number, others: readonly OnlineEntry[], pot: PotInfo | null = null): void {
    this.scrim.hidden = !on;
    if (!on) {
      this.html = '';
      return;
    }
    const calm = phase === FT_GATHER || phase === FT_BREAK;
    const talk = new Set(voiceTalkers().filter((t) => t.talking).map((t) => t.pid));
    const body = [...rows].sort((a, b) => (b.damage ?? 0) - (a.damage ?? 0) || b.k - a.k || a.d - b.d).map((r) => {
      const lv = r.level ?? 1;
      const pills = `${talk.has(r.pid) ? '<span class="k-pill k-pill--good k-pill--sm"><span class="k-eq"><i></i><i></i><i></i></span>говорит</span>' : ''}${calm && r.ready ? '<span class="k-pill k-pill--good k-pill--sm">готов</span>' : ''}`;
      return `<tr${r.id === myId ? ' class="is-own"' : ''}><td><span class="k-ring k-ring--sm" style="--p:0"><b>${num(lv)}</b></span></td>`
        + `<td><span class="k-who">${escapeHtml(r.name)}${this.craftHtml(r.id)}${pills}</span></td><td class="k-r ft-damage">${num(r.damage ?? 0)}</td><td class="k-r">${num(r.k)}</td><td class="k-r">${num(r.d)}</td>`
        + `<td class="k-r">${num(r.pts)}</td><td class="k-r ft-ping">${num(r.ping)} мс</td></tr>`;
    }).join('');
    const away = others.filter((o) => o.room !== 'fort');
    const awayHtml = away.length
      ? `<p class="ft-tab-h">Остальные — не в крепости</p><div class="ft-others">${away.slice(0, 12).map((o) => `<span class="k-pill k-pill--sm">${escapeHtml(o.nick)} · ${ROOM[o.room] ?? ''}</span>`).join('')}</div>`
      : '';
    // общак — каким он вышел в последней отбитой волне (сколько каждому); в бою сервер его не присылает
    const potHtml = pot && pot.share > 0
      ? `<div class="k-win-tools"><span class="k-pill k-pill--gold">${fortImg('gold', 'ft-nug')}общак волны ${num(pot.wave)} · +${num(pot.share)}</span></div>`
      : '';
    // «Позвать» в крепость (флаг SOCIAL): клавиша P, пока держишь Tab
    const callHtml = socialState.on ? '<div class="ft-others"><span class="k-pill k-pill--gold k-pill--sm"><kbd class="k-key k-key--sm">P</kbd>позвать друзей в крепость</span></div>' : '';
    const title = calm ? `Защитники · дальше волна ${num(wave + 1)}` : `Защитники · волна ${num(Math.max(1, wave))}`;
    const icons = ['ballista', 'cannon', 'tar', 'brazier'];
    const towers = this.towers.filter(t => TOWERS[t.type] && TOWER_SPOTS[t.spot]);
    const towerBody = towers.map(t => `<tr data-tower-spot="${t.spot}"><td><span class="ft-tower-name">${fortImg(icons[t.type], 'ft-tower-ic')}<span><b>${TOWERS[t.type].name}</b><small>${TOWER_SPOTS[t.spot].name}</small></span></span></td><td class="k-r">${num(t.level)}</td><td class="k-r ft-damage">${num(t.damage)}</td><td class="k-r">${num(t.gold)}</td></tr>`).join('');
    const towerHtml = towers.length
      ? `<table class="k-table ft-tower-table"><thead><tr><th>Вышка</th><th class="k-r">Уровень</th><th class="k-r">Урон</th><th class="k-r">Золото</th></tr></thead><tbody>${towerBody}</tbody><tfoot><tr class="ft-total"><td colspan="2">Все вышки</td><td class="k-r">${num(towers.reduce((n, t) => n + t.damage, 0))}</td><td class="k-r">${num(towers.reduce((n, t) => n + t.gold, 0))}</td></tr></tfoot></table>`
      : '<p class="k-note">Пока нет построенных вышек</p>';
    const html = `<section class="k-window ft-tab" aria-label="Защитники">
      <header class="k-win-head"><div class="k-win-titles"><p class="k-eyebrow">Отпусти Tab — закроется</p><h2 class="k-win-title">${title}</h2></div>${potHtml}</header>
      <div class="k-win-body">
        <div class="ft-table-scroll"><table class="k-table ft-player-table"><thead><tr><th></th><th>Защитник</th><th class="k-r">Урон</th><th class="k-r">Сбил</th><th class="k-r">Повален</th><th class="k-r" title="Золото на руках">Золото</th><th class="k-r">Связь</th></tr></thead>
        <tbody>${body}</tbody></table></div><p class="ft-tab-h">Вышки · за этот забег</p><div class="ft-table-scroll">${towerHtml}</div>${this.cardsHtml()}${awayHtml}${callHtml}
      </div>
      <footer class="k-win-foot"><span class="k-note">Урон — снятые HP и щиты за забег; вышки считаются отдельно. Золото вышек — выплаты вкладчикам, без общака.</span></footer>
    </section>`;
    if (html === this.html) return;
    const first = this.html === '';
    this.html = html;
    this.scrim.innerHTML = html;
    if (first) this.scrim.querySelector('.k-window')?.classList.add('is-in');
  }

  /** Ремесло защитника: значок и имя у ника (если есть) */
  private craftHtml(id: number): string {
    const c = this.crafts.get(id) ?? 0;
    const name = craftName(c);
    return c && name ? `<span class="ft-craft-tag" title="${name}">${fortImg(CRAFT_ICON[c] ?? 'level', 'ft-craft-ic')}<small>${name}</small></span>` : '';
  }

  /** Карточки забега: что взяла команда */
  private cardsHtml(): string {
    const list = this.taken.map((id) => cardById(id)).filter((c) => !!c);
    if (!list.length) return '';
    return `<p class="ft-tab-h">Карточки команды · за этот забег</p><div class="ft-cardlist">${list.map((c) => `<div class="ft-cardrow${c!.gold ? ' is-gold' : ''}">${fortImg(cardIcon(c!.id), 'ft-cardrow-ic')}<span><b>${escapeHtml(c!.name)}</b><small>${escapeHtml(c!.text)}</small></span></div>`).join('')}</div>`;
  }

  hide(): void {
    this.scrim.hidden = true;
    this.html = '';
  }
}
