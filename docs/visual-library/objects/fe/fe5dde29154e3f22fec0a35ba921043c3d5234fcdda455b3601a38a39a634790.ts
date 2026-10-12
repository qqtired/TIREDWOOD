// Итоги игры «Крепости» — окно кита (.k-scrim > .k-window, как на странице lab/ui «Крепость»): устояла или пала, на
// какой волне, рекорд крепости (новый — праздником с лампочками) и свой, лучший защитник, таблица (сбил, повален,
// золото, волн, жетоны) со строкой «вся команда», твоя строка — золотом, жетоны тебе — крупно (приходят чуть позже),
// лучшие забеги крепости одной строкой. Кнопки «Ещё раз» (E — закрыть итоги, новая игра начнётся сама) и
// «На набережную» (Esc). Мышью — кликом, без мыши — клавишами.
import type { FortResultRow, FortRunRec } from '../../../shared/fort.ts';
import { recWhen, wavesText } from '../../../shared/fortrecord.ts';
import { setCoinText } from '../../ui/coin.ts';
import { coinHtml } from '../../ui/kit/dom.ts';
import { el, escapeHtml, num, setText } from './dom.ts';
import { fortImg } from './icons.ts';

export interface ResultsData {
  win: boolean;
  /** Сколько волн отбито */
  wave: number;
  lastWave: number;
  mvp: FortResultRow | null;
  rows: readonly FortResultRow[];
  myId: number;
  /** Рекорд крепости: прежний лучший (0 — не было) и побит ли */
  record?: { best: number; isNew: boolean } | null;
  /** Лучшие забеги крепости: сколько волн, кто держал стены, когда; run — номер этой игры (её строка подсвечена) */
  top?: readonly FortRunRec[];
  run?: number;
  /** Сдались голосованием у белого флага (волна, на которой сдались, — не отбита и не считается) */
  surr?: boolean;
}

export interface ResultsHost {
  /** «Ещё раз»: закрыть итоги и остаться (новая игра начнётся сама) */
  again(): void;
  /** «На набережную» */
  leave(): void;
}

export class Results {
  readonly scrim: HTMLElement;
  host: ResultsHost = { again: () => {}, leave: () => {} };
  private timerEl: HTMLElement | null = null;
  private rewardEl: HTMLElement | null = null;
  private open = false;
  private closed = false;

  constructor(parent: HTMLElement) {
    this.scrim = el('div', 'k-scrim ft-scrim', parent);
    this.scrim.dataset.mode = 'fort';
    this.scrim.hidden = true;
    this.scrim.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-fres]');
      if (b) {
        e.preventDefault();
        if (b.dataset.fres === 'leave') this.host.leave();
        else this.host.again();
      }
    });
  }

  show(d: ResultsData): void {
    const rows = [...d.rows].sort((a, b) => b.k - a.k || b.pts - a.pts || a.d - b.d);
    const kills = rows.reduce((n, r) => n + r.k, 0);
    const deaths = rows.reduce((n, r) => n + r.d, 0);
    const gold = rows.reduce((n, r) => n + r.pts, 0);
    const r = d.record;
    const isNew = !!r?.isNew && d.wave > 0;
    const lose = !d.win;
    const title = isNew ? 'Новый рекорд крепости!' : d.win ? 'Крепость выстояла!'
      : d.surr ? `Сдались на волне ${d.wave + 1}` : d.wave > 0 ? `Крепость пала на волне ${d.wave + 1}` : 'Крепость пала';
    const holder = d.top?.[0];
    const recText = isNew ? (r && r.best > 0 ? `прежний рекорд ${r.best}` : 'первый рекорд крепости')
      : r && r.best > 0 ? `рекорд крепости — ${r.best}${holder && holder.wave === r.best ? ` (${holder.names.slice(0, 3).join(', ')})` : ''}` : '';
    const how = d.win ? `Отбиты все ${d.lastWave} волн` : d.wave > 0 ? `Отбито волн: ${d.wave}` : 'Ни одной волны не отбили';
    const lost = isNew && lose ? `${d.surr ? 'Сдались' : 'Кристалл разбит'} на ${d.wave + 1}-й` : d.surr && !isNew ? 'решили голосованием' : '';
    // свой рекорд: до этой игры — best, в ней — my
    const me = d.rows.find((x) => x.id === d.myId);
    const best = me?.best ?? 0;
    const my = me?.my ?? 0;
    const mine = my > best && my > 0 ? `твой рекорд — ${my}, новый!` : '';
    const sub = [how, recText, lost, mine].filter(Boolean).join(' · ');
    const mvp = d.mvp
      ? `<div class="ft-mvp">${fortImg('medal-gold', 'ft-mvp-ic')}<span><b>${escapeHtml(d.mvp.name)}</b> — лучший защитник · сбил ${num(d.mvp.k)} · добыл ${num(d.mvp.pts)} ${fortImg('gold', 'ft-nug')}</span></div>`
      : '';
    const body = rows.map((x) => `<tr${x.id === d.myId ? ' class="is-own"' : ''}><td><span class="k-who">${escapeHtml(x.name)}${x.id === d.myId ? ' <span class="k-pill k-pill--gold k-pill--sm">ты</span>' : ''}</span></td>`
      + `<td class="k-r">${num(x.k)}</td><td class="k-r">${num(x.d)}</td><td class="k-r">${num(x.pts)}</td><td class="k-r">${num(x.waves)}</td><td class="k-r">${x.tokens > 0 ? `+${num(x.tokens)}` : '—'}</td></tr>`).join('');
    const total = rows.length > 1 ? `<tr class="ft-total"><td>Вся команда</td><td class="k-r">${num(kills)}</td><td class="k-r">${num(deaths)}</td><td class="k-r">${num(gold)}</td><td class="k-r"></td><td class="k-r"></td></tr>` : '';
    const now = Date.now();
    const runs = d.top?.length
      ? `<p class="ft-runs"><b>Лучшие забеги:</b> ${d.top.slice(0, 3).map((t) => `<span${d.run && t.id === d.run ? ' class="is-this"' : ''}>${wavesText(t.wave)} — ${escapeHtml(t.names.slice(0, 3).join(', '))}${t.at ? `, ${recWhen(t.at, now)}` : ''}</span>`).join(' · ')}</p>`
      : '';
    this.scrim.innerHTML = `<section class="k-window ft-results is-in${isNew ? ' k-lamp' : ''}" role="dialog" aria-label="Итоги игры">
      <div class="k-results-head">
        <p class="k-eyebrow">Крепость · ${isNew ? 'новый рекорд!' : d.win ? 'победа!' : 'игра окончена'}</p>
        <h2 class="k-results-title${lose && !isNew ? ' ft-lose' : ''}">${title}</h2>
        <p class="k-results-sub">${escapeHtml(sub)}</p>
      </div>
      <div class="k-win-body">
        ${mvp}
        <table class="k-table"><thead><tr><th>Защитник</th><th class="k-r">Сбил</th><th class="k-r">Повален</th><th class="k-r">Золото</th><th class="k-r">Волн</th><th class="k-r">Жетоны</th></tr></thead>
        <tbody>${body}${total}</tbody></table>
        <div class="k-reward ft-reward" hidden></div>
        ${runs}
      </div>
      <div class="k-results-actions">
        <button class="k-btn k-btn--go" type="button" data-fres="again">Ещё раз<small class="ft-res-timer">новая игра начнётся сама</small><kbd class="k-key k-key--tr">E</kbd></button>
        <button class="k-btn k-btn--ghost" type="button" data-fres="leave">На набережную<kbd class="k-key k-key--tr">Esc</kbd></button>
      </div>
    </section>`;
    this.timerEl = this.scrim.querySelector('.ft-res-timer');
    this.rewardEl = this.scrim.querySelector('.ft-reward');
    this.open = true;
    this.closed = false;
    this.scrim.hidden = false;
  }

  /** Жетоны за игру — приходят сразу после итогов: «+58 жетонов: волны 8 · +40 · …» */
  reward(text: string): void {
    if (!this.rewardEl) return;
    this.rewardEl.hidden = false;
    const m = /^\+(\d+)\s+([^:]+):?\s*(.*)$/.exec(text);
    if (!m) {
      setCoinText(this.rewardEl, `🪙 ${text}`);
      return;
    }
    this.rewardEl.innerHTML = `${coinHtml()}<b>+${num(Number(m[1]))}</b><span></span>`;
    setText(this.rewardEl.querySelector('span')!, `${m[2]} тебе${m[3] ? ` · ${m[3]}` : ''}`);
  }

  timer(sec: number): void {
    if (this.timerEl) setText(this.timerEl, `новая игра через ${Math.max(0, Math.ceil(sec))} с`);
  }

  /** «Ещё раз»: окно закрыть, игра остаётся в итогах до новой */
  dismiss(): void {
    this.closed = true;
    this.scrim.hidden = true;
  }

  hide(): void {
    this.open = false;
    this.closed = false;
    this.scrim.hidden = true;
  }

  /** Окно на экране */
  get shown(): boolean {
    return this.open && !this.closed;
  }
}
