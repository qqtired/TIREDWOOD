// Белый флаг на клиенте: голосование «сдаться». Панель сверху по центру — в столбце FortUi сразу под полосой (волна,
// ворота, кристалл), поэтому карточку волны, босса и тревоги не перекрывает, а они встают ниже; кнопки «За [Y]» и
// «Против [N]» (клавиши — при захваченной мыши, кнопки — когда мышь свободна, на телефоне — касанием); после голоса —
// «Вы: за» или «Вы: против». Подсказка у флага: «сдаться», «Сдаться? Нажми E ещё раз» (3 с), «Сдаться можно через N с».
// Клиент ничего не решает: состояние приходит от сервера ({t:'fsurr'}, shared/fortsurrender.ts), голос уходит
// {t:'fortVote'}, свой голос на экране — только после ответа сервера.
import { TICK_RATE } from '../../../shared/constants.ts';
import { FT_BREAK, FT_GATHER, FT_WAVE } from '../../../shared/fort.ts';
import { SURR_VOTE_TICKS, type FortSurrender } from '../../../shared/fortsurrender.ts';
import { TOUCH } from '../../touch.ts';
import { el, setText } from './dom.ts';

export interface SurrenderHost {
  /** Свой номер защитника */
  myId(): number;
  /** Тик сервера по часам клиента (так же считаются остальные отсчёты) */
  tick(): number;
  /** Имя защитника по номеру */
  nameOf(id: number): string;
  /** Отправить голос на сервер */
  send(yes: boolean): void;
  /** Началось голосование (mine — его предложил сам игрок): короткий звук */
  opened?(mine: boolean): void;
}

/** Сколько висит итог неудачного голосования, мс */
const RESULT_MS = 3200;
const VOTE_SECONDS = SURR_VOTE_TICKS / TICK_RATE;

function shortName(name: string): string {
  return name.length > 12 ? `${name.slice(0, 11)}…` : name;
}

export class SurrenderUi {
  readonly root: HTMLElement;
  private readonly host: SurrenderHost;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly who: HTMLElement;
  private readonly buttons: HTMLElement;
  private readonly yesBtn: HTMLButtonElement;
  private readonly noBtn: HTMLButtonElement;
  private readonly meEl: HTMLElement;
  /** Идущее голосование; итог неудачи — на RESULT_MS */
  private st: FortSurrender | null = null;
  private result: FortSurrender | null = null;
  private resultUntil = 0;
  /** Тик, до которого сдаться нельзя; тик, до которого второе E — подтверждение (от сервера) */
  private cd = 0;
  private askUntil = 0;
  /** Голос ушёл, ответа сервера ещё нет */
  private sent = false;
  private whoKey = '';

  constructor(layer: HTMLElement, host: SurrenderHost) {
    this.host = host;
    this.root = el('div', 'fu-surr');
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', 'Голосование: сдаться');
    const head = el('div', 'fu-surr-head', this.root);
    el('span', 'fu-surr-flag', head, '🏳️');
    const text = el('div', 'fu-surr-text', head);
    this.title = el('b', 'fu-surr-title', text);
    this.sub = el('span', 'fu-surr-sub', text);
    this.timeEl = el('span', 'fu-surr-time', head);
    // вторая строка: кто как проголосовал и — справа — кнопки или «Вы: за»
    const row = el('div', 'fu-surr-row', this.root);
    this.who = el('div', 'fu-surr-who', row);
    const act = el('div', 'fu-surr-act', row);
    this.buttons = el('div', 'fu-surr-btns', act);
    this.yesBtn = this.button('За', 'Y', 'yes', true);
    this.noBtn = this.button('Против', 'N', 'no', false);
    this.meEl = el('span', 'fu-surr-me', act);
    this.bar = el('i', 'fu-surr-time-bar', this.root);
    // столбец сверху: сразу под полосой — ничего не перекрывает, всё остальное встаёт ниже
    const stack = layer.querySelector<HTMLElement>('.fu-stack') ?? layer;
    const top = stack.querySelector('.fu-top');
    stack.insertBefore(this.root, top ? top.nextSibling : stack.firstChild);
  }

  private button(label: string, key: string, cls: string, yes: boolean): HTMLButtonElement {
    const b = el('button', `fu-surr-btn ${cls}`, this.buttons);
    b.type = 'button';
    el('span', '', b, label);
    if (!TOUCH) el('kbd', '', b, key);
    // курсор свободен — кликом; мышь захвачена — клавиши (onKey)
    b.addEventListener('click', (e) => {
      e.preventDefault();
      this.cast(yes);
    });
    return b;
  }

  dispose(): void {
    this.root.remove();
  }

  /** Новая игра или итоги: всё сбросить */
  reset(): void {
    this.st = null;
    this.result = null;
    this.cd = 0;
    this.askUntil = 0;
    this.sent = false;
    this.render();
  }

  /** Идёт голосование */
  get open(): boolean {
    return this.st !== null;
  }

  /** Состояние от сервера ({t:'fsurr'}): началось, голос, кто-то вышел, итог; ask — только мне, после первого E */
  onState(m: FortSurrender): void {
    const was = this.st !== null;
    this.cd = m.cd;
    this.askUntil = m.ask ?? 0;
    this.sent = false;
    if (m.open) {
      this.st = m;
      this.result = null;
      if (!was) this.host.opened?.(m.by === this.host.myId());
    } else {
      this.st = null;
      this.result = m.fail ? m : null;
      this.resultUntil = performance.now() + RESULT_MS;
    }
    this.render();
  }

  /** Y — за, N — против (только при захваченной мыши: решает match.onKey); true — клавиша обработана */
  onKey(code: string, e: KeyboardEvent): boolean {
    if (e.repeat || !this.canVote || (code !== 'KeyY' && code !== 'KeyN')) return false;
    e.preventDefault();
    this.cast(code === 'KeyY');
    return true;
  }

  private get canVote(): boolean {
    const s = this.st;
    if (!s || this.sent) return false;
    const me = this.host.myId();
    return s.voters.includes(me) && !s.yes.includes(me) && !s.no.includes(me);
  }

  private cast(yes: boolean): void {
    if (!this.canVote) return;
    this.sent = true;
    this.host.send(yes);
    this.render();
  }

  /**
   * Подсказка у флага для match.stationHint: [текст, цена (0), сработает ли E]. Сбор — только объяснение; идёт
   * голосование — как голосовать; перезарядка — сколько ждать; первое E было — «нажми ещё раз».
   */
  hint(phase: number): [string, number, boolean] {
    const t = this.host.tick();
    if (phase === FT_GATHER) return ['сдаться можно, когда начнётся первая волна', 0, false];
    if (phase !== FT_WAVE && phase !== FT_BREAK) return ['сдаться можно во время волны и в передышке', 0, false];
    if (this.st) return [this.canVote && !TOUCH ? 'идёт голосование · Y — за, N — против' : 'идёт голосование', 0, false];
    if (this.cd > t) return [`Сдаться можно через ${Math.ceil((this.cd - t) / TICK_RATE)} с`, 0, false];
    if (this.askUntil >= t) return ['Сдаться? Нажми E ещё раз', 0, true];
    return ['сдаться', 0, true];
  }

  /** Раз в кадр: отсчёт, полоска времени, итог неудачи уходит сам */
  frame(): void {
    if (this.result && performance.now() > this.resultUntil) {
      this.result = null;
      this.render();
      return;
    }
    const s = this.st;
    if (!s) return;
    const left = Math.max(0, (s.end - this.host.tick()) / TICK_RATE);
    setText(this.timeEl, `${Math.ceil(left)} с`);
    this.bar.style.transform = `scaleX(${Math.max(0, Math.min(1, left / VOTE_SECONDS))})`;
    this.root.classList.toggle('urgent', left <= 5);
  }

  private render(): void {
    const s = this.st ?? this.result;
    this.root.classList.toggle('show', s !== null);
    if (!s) return;
    const open = this.st !== null;
    const me = this.host.myId();
    const voter = s.voters.includes(me);
    const mine = s.yes.includes(me) ? 'yes' : s.no.includes(me) ? 'no' : '';
    this.root.classList.toggle('done', !open);
    setText(this.title, open ? `${s.name} предлагает сдаться` : 'Не прошло — держимся дальше');
    setText(this.sub, `за ${s.yes.length} из ${s.voters.length} (нужно ${s.need})`);
    this.timeEl.hidden = !open;
    this.buttons.hidden = !(open && voter && !mine);
    this.yesBtn.disabled = this.sent;
    this.noBtn.disabled = this.sent;
    setText(this.meEl, !open ? '' : mine === 'yes' ? 'Вы: за' : mine === 'no' ? 'Вы: против' : voter ? '' : 'Вы зашли позже — голосуют те, кто был в начале');
    this.meEl.hidden = this.meEl.textContent === '';
    this.meEl.className = `fu-surr-me${mine ? ` ${mine}` : ''}`;
    this.renderWho(s, me);
    if (open) this.frame();
  }

  /** Кто как проголосовал: ✓ за, ✗ против, … ещё думает */
  private renderWho(s: FortSurrender, me: number): void {
    const key = s.voters.map((id) => `${id}${this.host.nameOf(id)}${s.yes.includes(id) ? 'y' : s.no.includes(id) ? 'n' : 'w'}`).join('|');
    if (key === this.whoKey) return;
    this.whoKey = key;
    this.who.replaceChildren(...s.voters.map((id) => {
      const v = s.yes.includes(id) ? 'yes' : s.no.includes(id) ? 'no' : 'wait';
      const chip = el('span', `fu-surr-chip ${v}${id === me ? ' me' : ''}`);
      el('i', '', chip, v === 'yes' ? '✓' : v === 'no' ? '✗' : '…');
      el('span', '', chip, shortName(this.host.nameOf(id)));
      return chip;
    }));
  }
}
