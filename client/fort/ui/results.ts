// Итоги игры «Крепости»: устояла или пала, на какой волне, рекорд крепости и твой лучший, лучший защитник, таблица
// (сбил, повален, золото, волн, жетоны) со строкой «вся команда», лучшие забеги крепости, жетоны тебе — когда
// придут, отсчёт до новой игры.
import type { FortResultRow, FortRunRec } from '../../../shared/fort.ts';
import { setCoinText } from '../../ui/coin.ts';
import { el, escapeHtml, num, setText } from './dom.ts';

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
  /** Лучшие забеги крепости: сколько волн, кто был в итогах */
  top?: readonly FortRunRec[];
}

export class Results {
  readonly root: HTMLElement;
  private timerEl: HTMLElement | null = null;
  private rewardEl: HTMLElement | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'fu-results', parent);
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Итоги игры');
  }

  show(d: ResultsData): void {
    const rows = [...d.rows].sort((a, b) => b.k - a.k || b.pts - a.pts || a.d - b.d);
    const kills = rows.reduce((n, r) => n + r.k, 0);
    const gold = rows.reduce((n, r) => n + r.pts, 0);
    const title = d.win ? 'Крепость выстояла!' : d.wave > 0 ? `Крепость пала на волне ${d.wave + 1}` : 'Крепость пала';
    const sub = d.win
      ? `Отбиты все ${d.lastWave} волн`
      : d.wave > 0 ? `Отбито волн: ${d.wave}` : 'Ни одной волны не отбили — в следующий раз получится';
    const r = d.record;
    const recText = !r ? '' : r.isNew && d.wave > 0 ? `🏆 Новый рекорд крепости!${r.best > 0 ? ` (был ${r.best})` : ''}`
      : r.best > 0 ? `Рекорд крепости — ${r.best} ${wavesWord(r.best)}` : '';
    // свой лучший результат до этого забега (best) — побит или нет
    const me = d.rows.find((x) => x.id === d.myId);
    const best = me?.best ?? 0;
    const mine = !me || d.wave <= 0 || best <= 0 ? '' : me.waves > best ? `твой лучший — ${me.waves}, новый!` : `твой лучший — ${Math.max(best, me.waves)}`;
    const rec = recText || mine
      ? `<div class="fu-res-record${r?.isNew && d.wave > 0 ? ' new' : ''}">${[recText, mine].filter(Boolean).join(' · ')}</div>`
      : '';
    const top = d.top?.length
      ? `<div class="fu-res-top"><b>Рекорды крепости</b><ol>${d.top.map((t) => `<li><b>${num(t.wave)}</b> <span>${escapeHtml(t.names.join(', '))}</span></li>`).join('')}</ol></div>`
      : '';
    const mvp = d.mvp
      ? `<div class="fu-res-mvp"><span class="fu-res-crown">👑</span><div><b>${escapeHtml(d.mvp.name)}</b><span>лучший защитник · сбил ${num(d.mvp.k)} · добыл ${num(d.mvp.pts)} 💰</span></div></div>`
      : '';
    const body = rows
      .map((r) => `<tr class="${r.id === d.myId ? 'me' : ''}"><td class="n">${escapeHtml(r.name)}</td><td>${num(r.k)}</td><td>${num(r.d)}</td><td>${num(r.pts)}</td><td>${num(r.waves)}</td><td class="tok">${r.tokens > 0 ? `+${num(r.tokens)}` : '—'}</td></tr>`)
      .join('');
    this.root.innerHTML = `<div class="fu-res-card ${d.win ? 'win' : 'lose'}">
      <div class="fu-res-head"><b class="fu-res-title">${title}</b><span class="fu-res-sub">${sub}</span>${rec}</div>
      ${mvp}
      <div class="fu-res-reward" hidden></div>
      <table class="fu-res-table"><thead><tr><th class="n">Защитник</th><th>Сбил</th><th>Повален</th><th>💰 золото</th><th>Волн</th><th>🪙 жетоны</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td class="n">Вся команда</td><td>${num(kills)}</td><td></td><td>${num(gold)}</td><td></td><td></td></tr></tfoot></table>
      ${top}
      <div class="fu-res-timer">Новая игра начнётся сама</div>
    </div>`;
    this.timerEl = this.root.querySelector('.fu-res-timer');
    this.rewardEl = this.root.querySelector('.fu-res-reward');
    this.root.classList.add('show');
  }

  /** Жетоны за игру — приходят сразу после итогов */
  reward(text: string): void {
    if (!this.rewardEl) return;
    this.rewardEl.hidden = false;
    setCoinText(this.rewardEl, `🪙 Тебе ${text}`);
  }

  timer(sec: number): void {
    if (this.timerEl) setText(this.timerEl, `Новая игра — через ${Math.max(0, Math.ceil(sec))} с · сбор у колокола`);
  }

  hide(): void {
    this.root.classList.remove('show');
  }

  get shown(): boolean {
    return this.root.classList.contains('show');
  }
}

/** «волна / волны / волн» по числу */
function wavesWord(n: number): string {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return 'волна';
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'волны';
  return 'волн';
}
