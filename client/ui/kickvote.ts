// Голосование «выгнать игрока» (votekick, shared/votekick.ts) — плашка события в верх-центре кита (самая важная,
// client/ui/kit/topcenter.ts): «Выгнать <ник>?», кто предложил, счёт, таймер с полоской; кнопки «За [Y]» / «Против [N]»
// (и F1 / F2) внутри плашки: мышь свободна — кликом, мышь в игре — клавишами, на телефоне — касанием. Проголосовал —
// «Ты: за». Того, кого выгоняют, и вошедших после начала — без кнопок. Итог — на несколько секунд. Клиент ничего не
// решает: всё приходит от сервера ({t:'kickVote'}).
import { KICK_BAN_MS, KICK_PERCENT, kickWait, type KickClientMsg, type KickResult, type KickServerMsg, type KickVoteView } from '../../shared/votekick.ts';
import { isTyping } from '../input.ts';
import { TOUCH } from '../touch.ts';
import { uiIcon } from './kit/icons.ts';
import { PRIO, escHtml, type TopCenter } from './kit/topcenter.ts';

export interface KickVoteHost {
  myPid(): number;
  send(msg: KickClientMsg): void;
  /** Началось голосование, в котором ты голосуешь: короткий звук */
  opened(): void;
}

/** Сколько висит итог, мс */
const RESULT_MS = 4500;
/** Меньше стольких секунд — таймер мигает */
const URGENT_S = 10;
const KEY = 'vote';

export class KickVoteUi {
  /** Голосование включено на сервере (пришло при входе) */
  enabled = false;
  private readonly host: KickVoteHost;
  private readonly top: TopCenter;
  private v: KickVoteView | null = null;
  /** Когда кончится (performance.now) */
  private endAt = 0;
  private total = 0;
  private result: KickResult | null = null;
  private resultUntil = 0;
  /** Голос ушёл, ответа сервера ещё нет */
  private sent = false;
  private timer = 0;

  constructor(top: TopCenter, host: KickVoteHost) {
    this.host = host;
    this.top = top;
    // кнопки живут в плашке: плашка обновляется на месте, клик ловим на слоте
    top.root.addEventListener('mousedown', (e) => {
      if ((e.target as Element).closest?.('[data-kv]')) e.preventDefault();
    });
    top.root.addEventListener('click', (e) => {
      const b = (e.target as Element).closest?.<HTMLElement>('[data-kv]');
      if (!b) return;
      e.preventDefault();
      this.cast(b.dataset.kv === 'yes');
    });
  }

  /** Идёт голосование */
  get active(): boolean {
    return this.v !== null;
  }

  /** Состояние от сервера */
  onState(m: KickServerMsg): void {
    if (m.on) this.enabled = true;
    const was = this.v;
    this.v = m.v;
    this.sent = false;
    if (m.v) {
      this.endAt = performance.now() + m.v.left;
      if (!was || was.id !== m.v.id) {
        this.total = Math.max(m.v.left, 1);
        this.result = null;
        if (m.v.me === 'can') this.host.opened();
      }
    }
    if (m.end) {
      this.result = m.end;
      this.resultUntil = performance.now() + RESULT_MS;
    }
    this.render();
  }

  /** Вышли из игры: всё убрать */
  reset(): void {
    this.v = null;
    this.result = null;
    this.sent = false;
    this.render();
  }

  /** Y / F1 — за, N / F2 — против; true — клавиша съедена голосованием */
  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    const yes = code === 'KeyY' || code === 'F1';
    if (!yes && code !== 'KeyN' && code !== 'F2') return false;
    if (!this.canVote || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target as HTMLElement | null)) return false;
    e.preventDefault();
    if (down && !e.repeat) this.cast(yes);
    return true;
  }

  private get canVote(): boolean {
    return !!this.v && this.v.me === 'can' && !this.sent;
  }

  private cast(yes: boolean): void {
    if (!this.canVote) return;
    this.sent = true;
    this.host.send({ t: 'kick', a: 'vote', yes });
    this.render();
  }

  private render(): void {
    const v = this.v;
    const now = performance.now();
    const res = !v && this.result && now < this.resultUntil ? this.result : null;
    const show = !!v || !!res;
    if (show && !this.timer) this.timer = window.setInterval(() => this.render(), 250);
    if (!show) {
      if (this.timer) window.clearInterval(this.timer);
      this.timer = 0;
      this.top.clear(KEY);
      return;
    }
    const icon = `<span class="k-event-ic"><img src="${uiIcon('warn')}" alt=""></span>`;
    if (res) {
      const sub = `за ${res.yes} · против ${res.no}${res.kicked ? ` · вернуться сможет через ${kickWait(KICK_BAN_MS)}` : ''}`;
      this.top.event({
        key: KEY, prio: PRIO.vote, tone: res.kicked ? 'danger' : 'good', lamp: true,
        html: `${icon}<div class="k-event-title">${escHtml(res.kicked ? `${res.nick} выгнан` : `${res.nick} остаётся`)}</div><div class="k-event-sub">${sub}</div>`,
      });
      return;
    }
    const mine = v!.pid === this.host.myPid();
    const left = Math.max(0, this.endAt - now);
    const s = Math.ceil(left / 1000);
    const wait = Math.max(0, v!.voters - v!.yes - v!.no);
    const title = mine ? 'Голосуют, выгнать ли тебя' : `Выгнать ${v!.nick}?`;
    const sub = `предложил ${v!.by} · за ${v!.yes} · против ${v!.no}${wait ? ` · ещё ${wait}` : ''}`;
    const rule = `кик — если «за» больше ${KICK_PERCENT} % голосов`;
    const share = Math.min(1, left / this.total).toFixed(2);
    let actions: string;
    if (this.canVote) {
      const key = (k: string): string => (TOUCH ? '' : `<kbd class="k-key k-key--sm k-key--tr">${k}</kbd>`);
      actions = `<button class="k-btn k-btn--go k-btn--sm" type="button" data-kv="yes">За${key('Y')}</button><button class="k-btn k-btn--stop k-btn--sm" type="button" data-kv="no">Против${key('N')}</button>`;
    } else {
      const me = v!.me === 'yes' ? ['good', 'Ты: за'] : v!.me === 'no' ? ['bad', 'Ты: против'] : ['plate', this.sent ? 'Голос отправлен…' : mine ? 'Ты не голосуешь' : 'Голосуют те, кто был в игре на начало'];
      actions = `<span class="k-pill k-pill--sm k-pill--${me[0]}">${me[1]}</span>`;
    }
    this.top.event({
      key: KEY, prio: PRIO.vote, tone: 'danger', lamp: true,
      html: `${icon}<div class="k-event-title" title="${rule}">${escHtml(title)}</div><div class="k-event-sub">${escHtml(sub)}</div>`
        + `<div class="k-event-timer${s <= URGENT_S ? ' is-hurry' : ''}">${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</div>`
        + `<div class="k-meter k-meter--thin k-meter--bad" style="--v:${share}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></div>`
        + `<div class="k-event-actions" role="group" aria-label="Голосование: выгнать игрока">${actions}</div>`,
    });
  }
}
