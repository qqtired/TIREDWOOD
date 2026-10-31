// «Позвать» на экране (флаг SOCIAL, shared/social.ts): плашка «Рома зовёт на картинг» с кнопкой «Иду» (плашка события
// верх-центра кита, как голосование «выгнать» — client/ui/kickvote.ts) и кнопка «Позвать [P]» рядом с подсказкой действия,
// пока стоишь в круге сбора или сидишь в «Ракушке», где людей мало. Мышь — кликом (мышь свободна), в игре — клавишами Y и P,
// на телефоне — касанием. Всё решает сервер: клиент шлёт {t:'call'} / {t:'callGo'} и показывает то, что пришло.
import { CALL_ASK_MS, CALL_INFO, type CallKind, type SocialClientMsg, type SocialServerMsg } from '../../shared/social.ts';
import { isTyping } from '../input.ts';
import { socialState } from './socialstate.ts';
import { TOUCH } from '../touch.ts';
import { iconImg } from './kit/dom.ts';
import { uiIcon } from './kit/icons.ts';
import type { HudSlots } from './kit/slots.ts';
import { escHtml, type TopCenter } from './kit/topcenter.ts';

/** Выше «режима» и ниже голосования и связи */
const CALL_PRIO = 65;
const KEY = 'call';

export { socialState };

export interface SocialUiHost {
  send(msg: SocialClientMsg): void;
  /** Тебя зовут: короткий звук */
  opened(): void;
  /** Метров до входа в место kind (null — не на набережной / неизвестно) */
  distTo(kind: CallKind): number | null;
  /** Выключатель викторины в чате сейчас (настройки) */
  quizPref(): boolean;
  /** Тост «Иду» */
  note(title: string, sub: string): void;
}

interface Ask { id: number; kind: CallKind; nick: string; until: number }

export class SocialUi {
  private readonly host: SocialUiHost;
  private readonly top: TopCenter;
  private readonly pill: HTMLElement;
  private ask: Ask | null = null;
  private timer = 0;
  private spot: CallKind | null = null;
  private spotText = '';
  /** Когда снова можно звать (performance.now): сервер сказал «раз в 2 минуты» — не дёргаем зря */
  private waitUntil = 0;
  private lastSentPref: boolean | null = null;

  constructor(top: TopCenter, slots: HudSlots, host: SocialUiHost) {
    this.host = host;
    this.top = top;
    this.pill = document.createElement('div');
    this.pill.className = 'k-prompt pz-call';
    this.pill.setAttribute('role', 'button');
    this.pill.hidden = true;
    this.pill.addEventListener('mousedown', (e) => e.preventDefault());
    this.pill.addEventListener('click', () => this.call());
    slots.bc.append(this.pill);
    // кнопка живёт в плашке: плашка обновляется на месте, клик ловим на слоте
    top.root.addEventListener('mousedown', (e) => {
      if ((e.target as Element).closest?.('[data-sc]')) e.preventDefault();
    });
    top.root.addEventListener('click', (e) => {
      const b = (e.target as Element).closest?.<HTMLElement>('[data-sc]');
      if (!b) return;
      e.preventDefault();
      this.go();
    });
  }

  /** Сообщение сервера; true — это письмо «Общего» и оно разобрано здесь */
  onMsg(m: SocialServerMsg): void {
    if (m.t === 'social') {
      socialState.on = true;
      socialState.quiz = m.quiz === 1;
      this.sendPref(true);
    } else if (m.t === 'callWait') {
      this.coolDown(m.sec);
    } else if (m.t === 'callAsk') {
      this.ask = { id: m.id, kind: m.kind, nick: m.nick, until: performance.now() + m.ms };
      this.host.opened();
      this.render();
    }
  }

  /** Выключатель викторины поменяли в меню (или только что вошли): сказать серверу */
  sendPref(force = false): void {
    if (!socialState.quiz) return;
    const on = this.host.quizPref();
    if (!force && on === this.lastSentPref) return;
    this.lastSentPref = on;
    this.host.send({ t: 'socPref', quiz: on });
  }

  /** Вышли из игры / связь начата заново */
  reset(): void {
    this.ask = null;
    this.spot = null;
    this.lastSentPref = null;
    this.render();
    this.paintPill();
  }

  /** Где сейчас можно позвать (null — нигде) и подпись «1/4» */
  setSpot(kind: CallKind | null, note = ''): void {
    if (kind === this.spot && note === this.spotText) return;
    this.spot = kind;
    this.spotText = note;
    this.paintPill();
  }

  /** Сервер ответил «слишком часто»: кнопка бледнеет до этого момента */
  coolDown(sec: number): void {
    this.waitUntil = performance.now() + sec * 1000;
    this.paintPill();
    if (sec > 0) window.setTimeout(() => this.paintPill(), sec * 1000 + 50);
  }

  /** Y — «Иду», P — «Позвать»; true — клавиша съедена */
  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target as HTMLElement | null)) return false;
    if (code === 'KeyY' && this.ask) {
      e.preventDefault();
      if (down && !e.repeat) this.go();
      return true;
    }
    if (code === 'KeyP' && this.spot) {
      e.preventDefault();
      if (down && !e.repeat) this.call();
      return true;
    }
    return false;
  }

  /** Ушёл с набережной: плашка «Иду» там уже ни к чему */
  clearAsk(): void {
    if (!this.ask) return;
    this.ask = null;
    this.render();
  }

  /** Есть ли у тебя приглашение «Иду» */
  get asking(): boolean {
    return this.ask !== null;
  }

  private call(): void {
    if (!this.spot) return;
    this.host.send({ t: 'call', kind: this.spot });
  }

  private go(): void {
    const a = this.ask;
    if (!a) return;
    this.host.send({ t: 'callGo', id: a.id });
    this.ask = null;
    this.render();
    const d = this.host.distTo(a.kind);
    this.host.note(`Иду ${CALL_INFO[a.kind].on}`, d !== null ? `столб света над входом · ${Math.round(d)} м` : 'столб света над входом');
  }

  private paintPill(): void {
    const on = this.spot !== null;
    this.pill.hidden = !on;
    if (!on) return;
    const wait = performance.now() < this.waitUntil;
    this.pill.classList.toggle('k-prompt--off', wait);
    this.pill.textContent = '';
    this.pill.insertAdjacentHTML('beforeend', iconImg('horn', 'k-ic'));
    const text = this.pill.appendChild(document.createElement('span'));
    text.textContent = wait ? 'Зов уже ушёл' : 'Позвать друзей';
    if (!TOUCH && !wait) {
      const cap = this.pill.appendChild(document.createElement('kbd'));
      cap.className = 'k-key';
      cap.textContent = 'P';
    }
    if (this.spotText) {
      this.pill.appendChild(document.createElement('span')).className = 'k-prompt-sep';
      const note = this.pill.appendChild(document.createElement('span'));
      note.className = 'k-prompt-note';
      note.textContent = this.spotText;
    }
  }

  private render(): void {
    const a = this.ask;
    const now = performance.now();
    if (a && now >= a.until) this.ask = null;
    if (!this.ask) {
      if (this.timer) window.clearInterval(this.timer);
      this.timer = 0;
      this.top.clear(KEY);
      return;
    }
    if (!this.timer) this.timer = window.setInterval(() => this.render(), 250);
    const ask = this.ask;
    const left = Math.max(0, ask.until - now);
    const share = Math.min(1, left / CALL_ASK_MS).toFixed(2);
    const d = this.host.distTo(ask.kind);
    const sub = d !== null ? `до входа ${Math.round(d)} м · над ним столб света` : 'над входом столб света';
    const key = TOUCH ? '' : '<kbd class="k-key k-key--sm k-key--tr">Y</kbd>';
    this.top.event({
      key: KEY, prio: CALL_PRIO, tone: 'good', lamp: true,
      html: `<span class="k-event-ic"><img src="${uiIcon('horn')}" alt=""></span>`
        + `<div class="k-event-title">${escHtml(ask.nick)} зовёт ${CALL_INFO[ask.kind].on}</div><div class="k-event-sub">${escHtml(sub)}</div>`
        + `<div class="k-meter k-meter--thin" style="--v:${share}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></div>`
        + `<div class="k-event-actions" role="group" aria-label="Приглашение"><button class="k-btn k-btn--go k-btn--sm" type="button" data-sc="go">Иду${key}</button></div>`,
    });
  }
}
