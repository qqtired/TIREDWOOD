// Т-8 «Карточки после босса»: общая карточка на команду, голосованием. Плашка голосования — верх-центр кита, как «Сдаться»
// (ui/surrender.ts): три карточки со значком, именем, строкой и числом голосов, свой выбор подсвечен, золотая — золотой
// рамкой, полоса времени. Мышь свободна — клик по карточке; мышь в игре — клавиши 1/2/3 (оружие при этом не меняется — так и
// подписано на плашке). Итог — тост «Команда берёт: …». Взятые карточки — ряд значков у плашки волны (подробности по
// наведению и по Alt) и в Tab (ui/board.ts). Клиент ничего не решает: голос уходит {t:'use', id: USE_CARD + n}, свой голос
// на экране — после ответа сервера (fideas.vote.mine).
import { USE_CARD } from '../../../shared/fortideas.ts';
import { PRIO, escHtml, type TopCenter } from '../../ui/kit/topcenter.ts';
import { TOUCH } from '../../touch.ts';
import { el } from '../ui/dom.ts';
import { fortIcon, fortImg } from '../ui/icons.ts';
import type { IdeasDeps } from './deps.ts';
import { cardById, cardIcon, clock, digitCard, voteView, type IdeasState, type VoteState } from './logic.ts';

const KEY = 'ft-cards';
/** Чуть ниже голосования «Сдаться»: оно важнее, пока открыто */
const PRIO_CARDS = PRIO.vote - 5;

export class CardsPart {
  private readonly d: IdeasDeps;
  private readonly strip: HTMLElement;
  private vote: VoteState | null = null;
  private taken: string[] = [];
  private shown = false;
  /** Голос ушёл, ответа сервера ещё нет */
  private sent = -1;
  private sentAt = 0;
  private stripKey = '';
  private readonly top: TopCenter;
  private readonly onClick = (e: MouseEvent): void => {
    const b = (e.target as Element).closest?.<HTMLElement>('[data-fcard]');
    if (!b) return;
    e.preventDefault();
    this.cast(Number(b.dataset.fcard));
  };
  private readonly onDown = (e: MouseEvent): void => {
    if ((e.target as Element).closest?.('[data-fcard]')) e.preventDefault();
  };

  constructor(d: IdeasDeps) {
    this.d = d;
    this.top = d.hud.ui.top;
    this.strip = el('div', 'ft-taken');
    this.strip.hidden = true;
    d.row.append(this.strip);
    this.top.root.addEventListener('click', this.onClick);
    this.top.root.addEventListener('mousedown', this.onDown);
  }

  setState(st: IdeasState): void {
    this.vote = st.vote;
    this.taken = st.taken;
    if (!st.vote || st.vote.mine >= 0) this.sent = -1;
    this.render();
    this.paintStrip();
  }

  /** 1/2/3 голосуют, пока плашка открыта и можно голосовать. true — клавишу забрали (оружие не меняется) */
  onKey(code: string, e: KeyboardEvent): boolean {
    const v = this.vote;
    if (!v) return false;
    const n = digitCard(code, v.ids.length);
    if (n < 0) return false;
    e.preventDefault();
    if (!e.repeat) this.cast(n);
    return true;
  }

  private cast(n: number): void {
    const v = this.vote;
    if (!v || n < 0 || n >= v.ids.length || v.mine === n || this.sent === n) return;
    this.sent = n;
    this.sentAt = performance.now();
    this.d.send({ t: 'use', id: USE_CARD + n });
    this.d.sound.once('card-vote', 0.1);
    this.render();
  }

  /** Раз в кадр: отсчёт и полоса времени; ответ, что не пришёл за 3 с, не держим */
  frame(): void {
    if (this.sent >= 0 && performance.now() - this.sentAt > 3000) this.sent = -1;
    if (this.vote) this.render();
  }

  private render(): void {
    const v = this.vote;
    if (!v) {
      if (this.shown) this.top.clear(KEY);
      this.shown = false;
      return;
    }
    const view = voteView(v, this.d.tick());
    const key = (n: number): string => (TOUCH ? '' : `<kbd class="k-key k-key--sm">${n}</kbd>`);
    const cards = view.cards.map((c, i) => {
      const mine = c.mine || this.sent === i;
      const cls = `ft-card${c.def.gold ? ' is-gold' : ''}${mine ? ' is-mine' : ''}${c.lead && !mine ? ' is-lead' : ''}${this.sent === i && !c.mine ? ' is-wait' : ''}`;
      return `<button class="${cls}" type="button" data-fcard="${i}" aria-pressed="${mine}" aria-label="${i + 1}: ${escHtml(c.def.name)}, голосов ${c.votes}">`
        + `${key(i + 1)}<span class="ft-card-ic">${fortImg(cardIcon(c.def.id))}</span>`
        + `<b class="ft-card-name">${escHtml(c.def.name)}</b><span class="ft-card-text">${escHtml(c.def.text)}</span>`
        + `<span class="ft-card-votes k-pill k-pill--sm${mine ? ' k-pill--gold' : ''}">${c.votes}</span></button>`;
    }).join('');
    const gold = view.cards.some((c) => c.def.gold);
    const hint = TOUCH ? 'выбери карточку на весь забег' : 'клик или 1 / 2 / 3 — оружие не меняется';
    const html = `<span class="k-event-ic"><img src="${fortIcon('cards')}" alt=""></span>`
      + `<div class="k-event-title">${gold ? 'Золотая карточка команды' : 'Карточка команды'}</div>`
      + `<div class="k-event-sub">${hint}</div>`
      + `<div class="k-event-timer${view.sec <= 5 ? ' is-hurry' : ''}">${clock(view.sec)}</div>`
      + `<div class="ft-cards" role="group" aria-label="Голосование за карточку">${cards}</div>`
      + `<span class="k-meter k-meter--thin k-meter--special" style="--v:${view.frac}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span>`;
    this.top.event({ key: KEY, prio: PRIO_CARDS, tone: gold ? 'good' : 'special', lamp: true, html });
    this.shown = true;
  }

  // ------------------------------------------------------------ итог и ряд взятых

  /** ['card', id] — команда выбрала карточку */
  onEvent(e: readonly unknown[]): boolean {
    if (e[0] !== 'card') return false;
    const def = cardById(String(e[1]));
    if (!def) return true;
    this.sent = -1;
    this.d.hud.ui.push({ key: 'card-took', icon: cardIcon(def.id), tone: def.gold ? 'reward' : 'good', title: `Команда берёт: ${def.name}`, sub: def.text, ms: 5200 });
    this.d.bought(def.gold);
    return true;
  }

  private paintStrip(): void {
    const key = this.taken.join('|');
    if (key === this.stripKey) return;
    this.stripKey = key;
    this.strip.hidden = this.taken.length === 0;
    this.strip.innerHTML = this.taken.map((id) => {
      const c = cardById(id);
      if (!c) return '';
      return `<span class="ft-taken-card${c.gold ? ' is-gold' : ''}" title="${escHtml(c.name)} — ${escHtml(c.text)}">${fortImg(cardIcon(id), 'ft-taken-ic')}<span class="ft-taken-tip"><b>${escHtml(c.name)}</b><small>${escHtml(c.text)}</small></span></span>`;
    }).join('');
  }

  /** Alt зажат: подробности взятых карточек раскрыты */
  setAlt(on: boolean): void {
    this.strip.classList.toggle('is-alt', on);
  }

  dispose(): void {
    this.top.root.removeEventListener('click', this.onClick);
    this.top.root.removeEventListener('mousedown', this.onDown);
    if (this.shown) this.top.clear(KEY);
    this.shown = false;
    this.strip.remove();
  }
}
