// Экран «Выше облаков» на ките 2.0 (как сцена «Выше облаков» на странице lab/ui «Режимы»): слева сверху — участок и его
// правило (живая подсказка лестницы — строкой там же); сверху по центру — плашка времени: медаль цели, «Золото — до 2:00»,
// рекорд и падения, секундомер, полоса; справа внизу — высотомер с соперниками и местом; снизу — ряд клавиш до старта,
// потом кнопки «К точке» R и «Сначала» N. Отсчёт — крупными цифрами кита, подсказки — тостами, финиш и итоги забега —
// общим окном итогов режимов (ModeResults) с кнопками «Ещё забег» E и «На набережную» Esc.
import { SKILL_CLEAN_REWARD, SKILL_DAILY_REWARD, SKILL_MEDAL_REWARD, SKILL_MEDALS, SKILL_RESULTS_TICKS, skillTime, type SkillFinish, type SkillRow } from '../../shared/skilltest.ts';
import type { Ui } from '../scene.ts';
import { TOUCH } from '../touch.ts';
import { h, iconImg } from '../ui/kit/dom.ts';
import { uiIcon } from '../ui/kit/icons.ts';
import { capHtml, esc, keysRow, ModeCount, ModeResults, placeHtml, type ResultsRow, type ResultsSpec } from '../ui/kit/modes.ts';
import { PRIO } from '../ui/kit/topcenter.ts';
import './skilltest.css';

export interface HudActions {
  respawn(): void;
  restart(): void;
  again(): void;
  leave(): void;
}

export interface MeterMark {
  id: number;
  h: number;
  nick: string;
  me: boolean;
  done: boolean;
  racer: boolean;
}

/** Плашка времени: секундомер, медаль цели (3 золото … 1 бронза, 0 — нет), заголовок, строка под ним, полоса 0…1 */
export interface SkillClock {
  time: string;
  medal: number;
  title: string;
  sub: string;
  frac: number;
  /** Подъём идёт (время пошло) — внизу кнопки «К точке» / «Сначала», иначе ряд клавиш */
  started: boolean;
}

const MEDAL_ICON = ['', 'medal-bronze', 'medal-silver', 'medal-gold'] as const;
const CARD_MS = 9000;
const RESULTS_SEC = SKILL_RESULTS_TICKS / 60;
const MODE = 'Выше облаков · Небесная каланча';

function put(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const medalCell = (m: number) => (m > 0 ? `${iconImg(MEDAL_ICON[m], 'mo-med')}${SKILL_MEDALS[m]}` : '—');

export class SkillHud {
  private readonly ui: Ui;
  private readonly sec: HTMLElement;
  private readonly secNum: HTMLElement;
  private readonly secName: HTMLElement;
  private readonly secRule: HTMLElement;
  private readonly secLive: HTMLElement;
  private readonly alt: HTMLElement;
  private readonly altTrack: HTMLElement;
  private readonly altFill: HTMLElement;
  private readonly place: HTMLElement;
  private readonly marks = new Map<number, HTMLElement>();
  private readonly keys: HTMLElement;
  private readonly acts: HTMLElement;
  private readonly center: HTMLElement;
  private readonly count: ModeCount;
  private readonly countSub: HTMLElement;
  private readonly results: ModeResults;
  private card: SkillFinish | null = null;
  private cardAt = 0;
  private nick = '';
  private rows: SkillRow[] | null = null;
  private myPid = 0;
  private left = 0;
  private resKey = '';
  private again = false;
  /** Можно «Ещё забег» (не в пути) — только тогда итоги забега открываются окном (в пути не мешаем лезть) */
  private idle = true;
  private shown = false;
  private on = false;
  /** Окно итогов открылось / закрылось (сцена отпускает и снова просит мышь) */
  onOpen: (open: boolean) => void = () => {};

  constructor(parent: HTMLElement, ui: Ui, act: HudActions) {
    this.ui = ui;
    const s = ui.slots;
    // --- верх-лево: участок
    this.sec = h('div', 'k-plate mo-sec sk-sec sk-only');
    this.sec.setAttribute('aria-label', 'Участок');
    this.sec.innerHTML = '<p class="k-eyebrow"></p><b class="mo-sec-name"></b><p class="mo-sec-rule"></p><p class="mo-sec-rule sk-live" hidden></p>';
    [this.secNum, this.secName, this.secRule, this.secLive] = Array.from(this.sec.children) as HTMLElement[];
    s.tl.append(this.sec);
    // --- низ-право: высотомер
    this.alt = h('div', 'k-plate mo-alt sk-alt sk-only');
    this.alt.innerHTML = `${iconImg('bell')}<div class="mo-alt-track"><i class="mo-alt-fill" style="height:0%"></i></div><b class="mo-alt-place">—</b>`;
    this.altTrack = this.alt.querySelector('.mo-alt-track')!;
    this.altFill = this.alt.querySelector('.mo-alt-fill')!;
    this.place = this.alt.querySelector('.mo-alt-place')!;
    s.br.append(this.alt);
    // --- низ-центр: клавиши до старта, кнопки в пути
    this.keys = keysRow([[['W', 'A', 'S', 'D'], 'бег'], ['Space', 'прыжок'], ['Shift', 'рывок']]);
    this.keys.classList.add('sk-keys', 'sk-only');
    this.acts = h('div', 'mo-acts sk-acts sk-only');
    const btn = (label: string, key: string, fn: () => void): void => {
      const b = h('button', 'k-btn k-btn--ghost k-btn--sm', `${label}${TOUCH ? '' : capHtml(key, 'k-key--sm k-key--tr')}`);
      b.type = 'button';
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      this.acts.append(b);
    };
    btn('К точке', 'R', act.respawn);
    btn('Сначала', 'N', act.restart);
    this.acts.hidden = true;
    s.bc.append(this.keys, this.acts);
    // --- центр: крупный отсчёт и строка под ним
    this.center = h('div', 'sk-center sk-only');
    const countBox = h('div', 'sk-count');
    this.countSub = h('span', 'k-hero-sub sk-count-sub');
    this.countSub.hidden = true;
    this.center.append(countBox, this.countSub);
    this.count = new ModeCount(countBox);
    s.c.append(this.center);
    // --- окно итогов
    this.results = new ModeResults(parent);
    this.results.scrim.classList.add('sk-only');
    this.results.onAction = (id) => {
      if (id === 'again') act.again();
      else if (id === 'leave') act.leave();
    };
    this.show(false);
  }

  /** Окно итогов на экране (мышь свободна для кнопок) */
  get open(): boolean {
    return this.shown;
  }

  show(on: boolean): void {
    this.on = on;
    for (const e of [this.sec, this.alt, this.keys, this.center]) e.hidden = !on;
    this.acts.hidden = true;
    if (!on) {
      this.card = null;
      this.rows = null;
      this.count.set(null);
      this.countSub.hidden = true;
      this.ui.top.clear('sk-clock');
      this.ui.top.clearToasts('sk-');
      this.render();
    }
  }

  section(index: number, total: number, name: string, rule: string): void {
    put(this.secNum, `Участок ${index + 1} из ${total}`);
    put(this.secName, name);
    put(this.secRule, rule);
  }

  /** Живая подсказка участка (лестница: когда обвал и когда соберётся) — строкой в плашке участка */
  live(text: string): void {
    put(this.secLive, text);
    this.secLive.hidden = !text;
  }

  /** Плашка времени сверху по центру; внизу — ряд клавиш до старта, кнопки в пути */
  clock(c: SkillClock): void {
    if (!this.on) return;
    const icon = c.medal > 0 ? MEDAL_ICON[c.medal] : 'stopwatch';
    const html = `<span class="k-event-ic">${iconImg(icon, '')}</span><div class="k-event-title">${esc(c.title)}</div><div class="k-event-sub">${esc(c.sub)}</div>`
      + `<div class="k-event-timer">${esc(c.time)}</div>`
      + `<span class="k-meter k-meter--thin k-meter--mode" style="--v:${clamp01(c.frac).toFixed(2)};--g:${clamp01(c.frac).toFixed(2)}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span>`;
    this.ui.top.event({ key: 'sk-clock', prio: PRIO.mode, html });
    const keys = c.started || TOUCH;
    if (this.keys.hidden !== keys) this.keys.hidden = keys;
    if (this.acts.hidden !== !c.started) this.acts.hidden = !c.started;
  }

  /** Высотомер: h — доля пути 0…1, place — «2 / 4», «свой подъём» или пусто */
  meterUpdate(list: MeterMark[], myH: number, place: string): void {
    this.altFill.style.height = `${Math.round(clamp01(myH) * 100)}%`;
    put(this.place, place || '—');
    const seen = new Set<number>();
    for (const m of list) {
      seen.add(m.id);
      let e = this.marks.get(m.id);
      if (!e) {
        e = h('span', 'mo-alt-mark');
        this.altTrack.append(e);
        this.marks.set(m.id, e);
      }
      put(e, m.nick);
      const cls = `mo-alt-mark${m.me ? ' is-own' : ''}${m.racer ? '' : ' is-solo'}${m.done ? ' is-done' : ''}`;
      if (e.className !== cls) e.className = cls;
      const b = `${Math.round(clamp01(m.h) * 100)}%`;
      if (e.style.bottom !== b) e.style.bottom = b;
    }
    for (const [id, e] of this.marks) if (!seen.has(id)) { e.remove(); this.marks.delete(id); }
  }

  /** Большой отсчёт: «3», «2», «1», «МАРШ!» или пусто; sub — строка под ним («Забег! Старт через 6 с») */
  countdown(text: string, sub: string): void {
    this.count.set(text ? (text === 'МАРШ!' ? 'Марш!' : text) : null, text === 'МАРШ!');
    put(this.countSub, sub);
    this.countSub.hidden = !sub;
  }

  /** Подсказка — тостом сверху (одна за раз: новая заменяет прежнюю); при открытых итогах — не нужна (легла бы на окно) */
  notice(text: string, ms = 2600): void {
    if (this.shown) return;
    this.ui.top.toast({ key: 'sk-note', tone: 'info', icon: uiIcon('bell'), title: text, life: ms });
  }

  /** Каждый кадр: строка «закроется через N с» у карточки финиша */
  tick(now: number): void {
    if (!this.shown || !this.card || this.rows) return;
    const left = Math.max(0, Math.ceil((this.cardAt + CARD_MS - now) / 1000));
    this.results.note(`Табличка закроется через ${left} с`, (this.cardAt + CARD_MS - now) / CARD_MS);
  }

  canAgain(on: boolean): void {
    this.idle = on;
    if (on !== this.again) {
      this.again = on;
      this.results.action('again', on);
    }
    if (this.rows && !this.shown && on) this.render();
  }

  finish(card: SkillFinish, nick: string, _chat: string): void {
    this.card = card;
    this.cardAt = performance.now();
    this.nick = nick;
    this.resKey = '';
    this.render();
  }

  hideFinish(): void {
    if (!this.card) return;
    this.card = null;
    this.resKey = '';
    this.render();
  }

  table(rows: SkillRow[], myPid: number, left: number): void {
    this.rows = rows;
    this.myPid = myPid;
    this.left = left;
    this.render();
  }

  hideTable(): void {
    if (!this.rows) return;
    this.rows = null;
    this.resKey = '';
    this.render();
  }

  /** Одно окно: карточка финиша (своё время, медаль, награда) и/или итоги забега (таблица) */
  private render(): void {
    const card = this.card, rows = this.rows;
    const want = !!card || (!!rows && (this.idle || this.shown));
    if (!want) {
      if (this.shown) { this.results.hide(); this.shown = false; this.resKey = ''; this.onOpen(false); }
      return;
    }
    const key = `${card ? `${card.ticks}:${card.place}` : '-'}|${rows ? rows.map((r) => `${r.pid}:${r.place}:${r.ticks}:${r.medal}`).join(',') : ''}`;
    if (key !== this.resKey) {
      this.resKey = key;
      this.results.show(this.spec(card, rows));
      this.results.action('again', this.again);
      if (!this.shown) { this.shown = true; this.ui.top.clearToasts('sk-'); this.onOpen(true); }
    }
    if (rows) this.results.note(`Табличка закроется через ${this.left} с`, this.left / RESULTS_SEC);
  }

  private spec(card: SkillFinish | null, rows: SkillRow[] | null): ResultsSpec {
    let title = 'Итоги забега', sub = '', extra = '', reward = '';
    if (card) {
      title = card.place > 0 ? `${card.place}-е место!` : 'Колокол звонит!';
      const bits = [card.falls === 0 ? 'Без единого падения' : `Падений: ${card.falls}`];
      if (card.newBest) bits.push('новый личный рекорд!');
      else if (card.best > 0) bits.push(`рекорд ${skillTime(Math.round((card.best * 60) / 1000))}`);
      sub = esc(`${bits.join(' · ')}`);
      const chips: string[] = [];
      if (card.medalUp && card.medal > 0) chips.push(`<span class="k-pill k-pill--gold">${iconImg(MEDAL_ICON[card.medal])}медаль «${SKILL_MEDALS[card.medal]}» +${SKILL_MEDAL_REWARD[card.medal]}</span>`);
      if (card.clean) chips.push(`<span class="k-pill k-pill--good">значок «Без падений» +${SKILL_CLEAN_REWARD}</span>`);
      if (card.daily) chips.push(`<span class="k-pill">первый подъём дня +${SKILL_DAILY_REWARD}</span>`);
      if (chips.length) extra = `<div class="mo-chips">${chips.join('')}</div>`;
      if (card.tokens > 0) reward = `+${card.tokens} жетонов`;
    }
    let list: ResultsRow[];
    if (rows) {
      list = [...rows].sort((a, b) => (a.place || 99) - (b.place || 99)).map((r) => ({
        own: r.pid === this.myPid,
        dim: r.ticks <= 0,
        cells: [placeHtml(r.place), `<span class="k-who">${esc(r.nick)}</span>`, r.ticks > 0 ? skillTime(r.ticks) : 'не успел', medalCell(r.medal)],
      }));
    } else {
      // один на трассе: своя строка — время и медаль
      list = card ? [{ own: true, cells: [placeHtml(card.place), `<span class="k-who">${esc(this.nick)}</span>`, skillTime(card.ticks), medalCell(card.medal)] }] : [];
    }
    return {
      mode: 'skill', eyebrow: MODE, title, sub, extra, reward,
      head: ['', 'Игрок', 'Время', 'Медаль'], rightFrom: 2, rows: list,
      note: 'Табличка закроется через 9 с', noteFrac: 1,
      actions: [{ id: 'again', label: 'Ещё забег', key: 'E', tone: 'go' }, { id: 'leave', label: 'На набережную', key: 'Esc', tone: 'ghost' }],
    };
  }
}
