// Экран «Выше облаков»: таймер и «до золота», участок и его правило, высотомер с соперниками и местом, большой
// отсчёт старта, всплывающие подсказки, карточка финиша, табличка итогов забега и кнопки.
import { SKILL_MEDALS, skillTime, type SkillFinish, type SkillRow } from '../../shared/skilltest.ts';
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

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent?.appendChild(e);
  return e;
};

export class SkillHud {
  readonly root: HTMLDivElement;
  private readonly secNum: HTMLElement;
  private readonly secName: HTMLElement;
  private readonly secRule: HTMLElement;
  private readonly secLive: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly timerSub: HTMLElement;
  private readonly best: HTMLElement;
  private readonly meter: HTMLElement;
  private readonly meterFill: HTMLElement;
  private readonly place: HTMLElement;
  private readonly marks = new Map<number, HTMLElement>();
  private readonly count: HTMLElement;
  private readonly countSub: HTMLElement;
  private readonly note: HTMLElement;
  private readonly card: HTMLElement;
  private readonly results: HTMLElement;
  private readonly again: HTMLButtonElement;
  private noteUntil = 0;
  private tableKey = '';
  private lastCount = '';

  constructor(parent: HTMLElement, act: HudActions) {
    this.root = el('div', 'sky-hud');
    this.root.hidden = true;
    const sec = el('section', 'sky-sec', this.root);
    sec.setAttribute('aria-label', 'Участок');
    this.secNum = el('div', 'sky-sec-num', sec);
    this.secName = el('h2', 'sky-sec-name', sec);
    this.secRule = el('p', 'sky-sec-rule', sec);
    this.secLive = el('p', 'sky-sec-live', sec);
    const clock = el('div', 'sky-clock', this.root);
    this.timer = el('div', 'sky-time', clock, '0:00.00');
    this.timerSub = el('div', 'sky-time-sub', clock);
    this.best = el('div', 'sky-best', clock);
    this.meter = el('div', 'sky-meter', this.root);
    el('div', 'sky-meter-top', this.meter, '🔔');
    const track = el('div', 'sky-meter-track', this.meter);
    this.meterFill = el('div', 'sky-meter-fill', track);
    this.place = el('div', 'sky-place', this.meter);
    this.count = el('div', 'sky-count', this.root);
    this.countSub = el('div', 'sky-count-sub', this.root);
    this.note = el('div', 'sky-note', this.root);
    this.note.setAttribute('role', 'status');
    this.note.setAttribute('aria-live', 'polite');
    this.card = el('section', 'sky-card', this.root);
    this.card.hidden = true;
    this.results = el('section', 'sky-results', this.root);
    this.results.hidden = true;
    const controls = el('div', 'sky-controls', this.root);
    const btn = (label: string, fn: () => void, cls = ''): HTMLButtonElement => {
      const b = el('button', `sky-btn ${cls}`, controls, label);
      b.type = 'button';
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      return b;
    };
    btn('К точке · R', act.respawn);
    btn('Сначала · N', act.restart);
    this.again = btn('Ещё забег · E', act.again, 'sky-btn-again');
    btn('На набережную', act.leave, 'sky-btn-leave');
    el('p', 'sky-help', this.root, 'WASD — бег · Пробел — прыжок · Shift — рывок · колесо — камера · R — к точке · N — сначала');
    parent.appendChild(this.root);
  }

  show(on: boolean): void {
    this.root.hidden = !on;
    if (!on) {
      this.card.hidden = true;
      this.results.hidden = true;
      this.count.textContent = '';
      this.countSub.textContent = '';
    }
  }

  section(index: number, total: number, name: string, rule: string): void {
    this.secNum.textContent = `Участок ${index + 1} из ${total}`;
    if (this.secName.textContent !== name) {
      this.secName.textContent = name;
      this.secName.classList.remove('sky-pop');
      void this.secName.offsetWidth;
      this.secName.classList.add('sky-pop');
    }
    this.secRule.textContent = rule;
  }

  /** Живая подсказка участка (лестница: когда обвал и когда соберётся). */
  live(text: string): void {
    if (this.secLive.textContent !== text) this.secLive.textContent = text;
    this.secLive.hidden = !text;
  }

  clock(time: string, sub: string, subCls: string, best: string): void {
    this.timer.textContent = time;
    this.timerSub.textContent = sub;
    this.timerSub.className = `sky-time-sub ${subCls}`;
    this.best.textContent = best;
  }

  /** Высотомер: h — доля пути 0…1, place — «2 / 4» или пусто. */
  meterUpdate(list: MeterMark[], myH: number, place: string): void {
    this.meterFill.style.height = `${Math.round(Math.max(0, Math.min(1, myH)) * 100)}%`;
    this.place.textContent = place;
    const seen = new Set<number>();
    for (const m of list) {
      seen.add(m.id);
      let e = this.marks.get(m.id);
      if (!e) {
        e = el('div', 'sky-mark', this.meter.querySelector('.sky-meter-track') as HTMLElement);
        this.marks.set(m.id, e);
      }
      e.textContent = m.done ? `✓ ${m.nick}` : m.nick;
      e.className = `sky-mark${m.me ? ' sky-mark-me' : ''}${m.racer ? '' : ' sky-mark-solo'}`;
      e.style.bottom = `${Math.round(Math.max(0, Math.min(1, m.h)) * 100)}%`;
    }
    for (const [id, e] of this.marks) if (!seen.has(id)) { e.remove(); this.marks.delete(id); }
  }

  /** Большой отсчёт: «3», «2», «1», «МАРШ!» или пусто. */
  countdown(text: string, sub: string): void {
    if (text !== this.lastCount) {
      this.lastCount = text;
      this.count.textContent = text;
      this.count.classList.remove('sky-pop');
      void this.count.offsetWidth;
      if (text) this.count.classList.add('sky-pop');
    }
    this.countSub.textContent = sub;
  }

  notice(text: string, ms = 2600): void {
    this.note.textContent = text;
    this.note.classList.add('on');
    this.noteUntil = performance.now() + ms;
  }

  tick(now: number): void {
    if (this.noteUntil && now > this.noteUntil) {
      this.note.classList.remove('on');
      this.noteUntil = 0;
    }
  }

  canAgain(on: boolean): void {
    this.again.classList.toggle('sky-btn-hot', on);
  }

  finish(card: SkillFinish, nick: string, chat: string): void {
    this.card.replaceChildren();
    const medal = SKILL_MEDALS[card.medal] ?? '';
    el('div', `sky-card-medal sky-medal-${card.medal}`, this.card, medal ? `${medal}` : '');
    el('h3', 'sky-card-title', this.card, card.place > 0 ? `${card.place}-е место!` : 'Колокол звонит!');
    el('div', 'sky-card-time', this.card, skillTime(card.ticks));
    const lines: string[] = [];
    lines.push(card.falls === 0 ? 'Без единого падения' : `Падений: ${card.falls}`);
    if (card.newBest) lines.push('Новый личный рекорд!');
    else if (card.best > 0) lines.push(`Рекорд: ${skillTime(Math.round((card.best * 60) / 1000))}`);
    for (const l of lines) el('p', 'sky-card-line', this.card, l);
    const prize: string[] = [];
    if (card.medalUp) prize.push(`медаль «${medal}»`);
    if (card.clean) prize.push('значок «Без падений»');
    if (card.daily) prize.push('первый подъём дня');
    if (card.tokens > 0) el('p', 'sky-card-prize', this.card, `+${card.tokens} жетонов · ${prize.join(', ')}`);
    el('p', 'sky-card-hint', this.card, chat || `${nick}, E — ещё забег, N — заново одному`);
    this.card.hidden = false;
    this.card.classList.remove('sky-pop');
    void this.card.offsetWidth;
    this.card.classList.add('sky-pop');
    this.layout();
  }

  hideFinish(): void {
    this.card.hidden = true;
    this.layout();
  }

  /** Карточка и итоги вместе — рядом, а не друг на друге. */
  private layout(): void {
    this.root.classList.toggle('sky-both', !this.card.hidden && !this.results.hidden);
  }

  table(rows: SkillRow[], myPid: number, left: number): void {
    const key = `${left}|${rows.map((r) => `${r.pid}:${r.place}:${r.ticks}`).join(',')}`;
    if (key === this.tableKey && !this.results.hidden) return;
    this.tableKey = key;
    this.results.replaceChildren();
    el('h3', 'sky-res-title', this.results, 'Итоги забега');
    const list = el('ol', 'sky-res-list', this.results);
    const sorted = [...rows].sort((a, b) => (a.place || 99) - (b.place || 99));
    for (const r of sorted) {
      const li = el('li', `sky-res-row${r.pid === myPid ? ' sky-res-me' : ''}`, list);
      el('span', 'sky-res-place', li, r.place > 0 ? String(r.place) : '—');
      el('span', 'sky-res-nick', li, r.nick);
      el('span', 'sky-res-time', li, r.ticks > 0 ? skillTime(r.ticks) : 'не успел');
      el('span', `sky-res-medal sky-medal-${r.medal}`, li, r.medal ? SKILL_MEDALS[r.medal] : '');
    }
    el('p', 'sky-res-hint', this.results, `E — ещё забег · табличка закроется через ${left} с`);
    this.results.hidden = false;
    this.layout();
  }

  hideTable(): void {
    if (this.results.hidden) return;
    this.results.hidden = true;
    this.layout();
  }
}
