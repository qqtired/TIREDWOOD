// Tab в «Крепости» — окно кита (.k-scrim > .k-window, как на странице lab/ui «Крепость»): защитники со счётом боя
// (уровень, кто говорит, сбил, повален, золото, связь; твоя строка — золотом; в паузе — кто готов у колокола) и кто
// где ещё — остальные игроки не в крепости. Держишь Tab — окно, отпустил — закрылось.
import { FT_BREAK, FT_GATHER, type FortPlayerRow } from '../../../shared/fort.ts';
import type { OnlineEntry, RoomKind } from '../../../shared/messages.ts';
import { voiceTalkers } from '../../voice-prefs.ts';
import { el, escapeHtml, num } from './dom.ts';
import { fortImg } from './icons.ts';

/** Общак последней отбитой волны: сколько досталось каждому (событие pot) — до него общак не известен */
export interface PotInfo {
  wave: number;
  share: number;
}

const ROOM: Record<RoomKind, string> = {
  lobby: 'Набережная', paintball: 'Склад', race: 'Гонка', fort: 'Крепость', fight: 'Подвал', skill: 'Выше облаков', hide: 'Прятки',
  farm: 'Ферма', dungeon: 'Подземелье',
};

export class Board {
  readonly scrim: HTMLElement;
  private html = '';

  constructor(parent: HTMLElement) {
    this.scrim = el('div', 'k-scrim ft-scrim ft-scrim-light', parent);
    this.scrim.dataset.mode = 'fort';
    this.scrim.hidden = true;
  }

  show(on: boolean, rows: readonly FortPlayerRow[], myId: number, phase: number, wave: number, others: readonly OnlineEntry[], pot: PotInfo | null = null): void {
    this.scrim.hidden = !on;
    if (!on) {
      this.html = '';
      return;
    }
    const calm = phase === FT_GATHER || phase === FT_BREAK;
    const talk = new Set(voiceTalkers().filter((t) => t.talking).map((t) => t.pid));
    const body = [...rows].sort((a, b) => b.k - a.k || a.d - b.d).map((r) => {
      const lv = r.level ?? 1;
      const pills = `${talk.has(r.pid) ? '<span class="k-pill k-pill--good k-pill--sm"><span class="k-eq"><i></i><i></i><i></i></span>говорит</span>' : ''}${calm && r.ready ? '<span class="k-pill k-pill--good k-pill--sm">готов</span>' : ''}`;
      return `<tr${r.id === myId ? ' class="is-own"' : ''}><td><span class="k-ring k-ring--sm" style="--p:0"><b>${num(lv)}</b></span></td>`
        + `<td><span class="k-who">${escapeHtml(r.name)}${pills}</span></td><td class="k-r">${num(r.k)}</td><td class="k-r">${num(r.d)}</td>`
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
    const title = calm ? `Защитники · дальше волна ${num(wave + 1)}` : `Защитники · волна ${num(Math.max(1, wave))}`;
    const html = `<section class="k-window ft-tab" aria-label="Защитники">
      <header class="k-win-head"><div class="k-win-titles"><p class="k-eyebrow">Отпусти Tab — закроется</p><h2 class="k-win-title">${title}</h2></div>${potHtml}</header>
      <div class="k-win-body">
        <table class="k-table"><thead><tr><th></th><th>Защитник</th><th class="k-r">Сбил</th><th class="k-r">Повален</th><th class="k-r">Золото</th><th class="k-r">Связь</th></tr></thead>
        <tbody>${body}</tbody></table>${awayHtml}
      </div>
      <footer class="k-win-foot"><span class="k-note">Золото со сбитых — 60 % стрелку, 40 % в общак: в конце волны делим поровну</span></footer>
    </section>`;
    if (html === this.html) return;
    const first = this.html === '';
    this.html = html;
    this.scrim.innerHTML = html;
    if (first) this.scrim.querySelector('.k-window')?.classList.add('is-in');
  }

  hide(): void {
    this.scrim.hidden = true;
    this.html = '';
  }
}
