// Белый флаг на клиенте: голосование «сдаться» — плашкой события верх-центра кита (приоритет голосования: выше волны
// и босса; как на странице lab/ui «Крепость»): «Паша: сдаёмся?», «за 2 из 4, нужно 3 · 0:14», справа кнопки «За [Y]» и
// «Против [N]» (мышь свободна — кликом, мышь в игре — клавишами, на телефоне — касанием), полоса времени. После голоса —
// «ты: за». Не прошло — «Не прошло — держимся дальше» на несколько секунд. Подсказка у флага: «сдаться», «Сдаться? Нажми
// E ещё раз» (3 с), «Сдаться можно через N с». Клиент ничего не решает: состояние приходит от сервера ({t:'fsurr'},
// shared/fortsurrender.ts), голос уходит {t:'fortVote'}, свой голос на экране — только после ответа сервера.
// Без DOM-картинок кита (kit/icons.ts): модуль грузят тесты через match.ts — картинку флага даёт хозяин.
import { TICK_RATE } from '../../../shared/constants.ts';
import { FT_BREAK, FT_GATHER, FT_WAVE } from '../../../shared/fort.ts';
import { SURR_VOTE_TICKS, type FortSurrender } from '../../../shared/fortsurrender.ts';
import { TOUCH } from '../../touch.ts';
import { PRIO, escHtml, type TopCenter } from '../../ui/kit/topcenter.ts';

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
  /** Картинка белого флага (адрес) */
  flag?: string;
}

/** Сколько висит итог неудачного голосования, мс */
const RESULT_MS = 3200;
const VOTE_SECONDS = SURR_VOTE_TICKS / TICK_RATE;
const KEY = 'fort-surr';

export class SurrenderUi {
  private readonly host: SurrenderHost;
  private readonly top: TopCenter;
  /** Идущее голосование; итог неудачи — на RESULT_MS */
  private st: FortSurrender | null = null;
  private result: FortSurrender | null = null;
  private resultUntil = 0;
  /** Тик, до которого сдаться нельзя; тик, до которого второе E — подтверждение (от сервера) */
  private cd = 0;
  private askUntil = 0;
  /** Голос ушёл, ответа сервера ещё нет */
  private sent = false;
  private shown = false;
  private readonly onClick = (e: MouseEvent): void => {
    const b = (e.target as Element).closest?.<HTMLElement>('[data-fsurr]');
    if (!b) return;
    e.preventDefault();
    this.cast(b.dataset.fsurr === 'yes');
  };
  private readonly onDown = (e: MouseEvent): void => {
    if ((e.target as Element).closest?.('[data-fsurr]')) e.preventDefault();
  };

  constructor(top: TopCenter, host: SurrenderHost) {
    this.host = host;
    this.top = top;
    // кнопки живут в плашке: плашка обновляется на месте, клик ловим на слоте
    top.root.addEventListener('click', this.onClick);
    top.root.addEventListener('mousedown', this.onDown);
  }

  dispose(): void {
    this.top.root.removeEventListener('click', this.onClick);
    this.top.root.removeEventListener('mousedown', this.onDown);
    this.hide();
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
    return ['сдаться · белый флаг: голосуют все', 0, true];
  }

  /** Раз в кадр: отсчёт, полоса времени, итог неудачи уходит сам */
  frame(): void {
    if (this.result && performance.now() > this.resultUntil) {
      this.result = null;
      this.render();
      return;
    }
    if (this.st) this.render();
  }

  private hide(): void {
    if (this.shown) this.top.clear(KEY);
    this.shown = false;
  }

  private render(): void {
    const s = this.st ?? this.result;
    if (!s) {
      this.hide();
      return;
    }
    const open = this.st !== null;
    const me = this.host.myId();
    const voter = s.voters.includes(me);
    const mine = s.yes.includes(me) ? 'yes' : s.no.includes(me) ? 'no' : '';
    const flag = this.host.flag ? `<span class="k-event-ic"><img src="${this.host.flag}" alt=""></span>` : '<span class="k-event-ic"></span>';
    const count = `за ${s.yes.length} из ${s.voters.length}, нужно ${s.need}`;
    if (!open) {
      this.top.event({ key: KEY, prio: PRIO.vote, tone: 'good', html: `${flag}<div class="k-event-title">Не прошло — держимся дальше</div><div class="k-event-sub">${count}</div>` });
      this.shown = true;
      return;
    }
    const left = Math.max(0, (s.end - this.host.tick()) / TICK_RATE);
    const sec = Math.ceil(left);
    const time = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    const v = Math.round(Math.max(0, Math.min(1, left / VOTE_SECONDS)) * 100) / 100;
    let actions = '';
    if (this.canVote) {
      const key = (k: string): string => (TOUCH ? '' : `<kbd class="k-key k-key--sm k-key--tr">${k}</kbd>`);
      actions = `<div class="k-event-actions ft-vote-actions" role="group" aria-label="Голосование: сдаться"><button class="k-btn k-btn--go k-btn--sm" type="button" data-fsurr="yes">За${key('Y')}</button><button class="k-btn k-btn--stop k-btn--sm" type="button" data-fsurr="no">Против${key('N')}</button></div>`;
    }
    const you = !voter ? ' · ты зашёл позже — не голосуешь' : mine === 'yes' ? ' · ты: за' : mine === 'no' ? ' · ты: против' : this.sent ? ' · голос отправлен' : '';
    this.top.event({
      key: KEY, prio: PRIO.vote, tone: 'special', lamp: true,
      html: `${flag}<div class="k-event-title">${escHtml(s.name)}: сдаёмся?</div>`
        + `<div class="k-event-sub">${count} · <b class="${sec <= 5 ? 'k-bad' : ''}">${time}</b>${you}</div>`
        + actions
        + `<span class="k-meter k-meter--thin k-meter--special" style="--v:${v}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span>`,
    });
    this.shown = true;
  }
}
