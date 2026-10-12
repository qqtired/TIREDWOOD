// Плашка голосования «выгнать игрока» (votekick, shared/votekick.ts): сверху по центру, поверх игры и меню.
// «Выгнать <ник>?», кто предложил, счёт, таймер с полоской; кнопки «За [Y]» / «Против [N]» (и F1 / F2): мышь свободна —
// кликом, мышь в игре — клавишами, на телефоне — касанием. Проголосовал — «Ты: за». Того, кого выгоняют, и вошедших
// после начала — без кнопок. Итог — на несколько секунд. Клиент ничего не решает: всё приходит от сервера ({t:'kickVote'}).
import { KICK_BAN_MS, KICK_PERCENT, kickWait, type KickClientMsg, type KickResult, type KickServerMsg, type KickVoteView } from '../../shared/votekick.ts';
import { isTyping } from '../input.ts';
import { TOUCH } from '../touch.ts';
import './kickvote.css';

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

export class KickVoteUi {
  readonly root: HTMLElement;
  /** Голосование включено на сервере (пришло при входе) */
  enabled = false;
  private readonly host: KickVoteHost;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly btns: HTMLElement;
  private readonly meEl: HTMLElement;
  private v: KickVoteView | null = null;
  /** Когда кончится (performance.now) */
  private endAt = 0;
  private total = 0;
  private result: KickResult | null = null;
  private resultUntil = 0;
  /** Голос ушёл, ответа сервера ещё нет */
  private sent = false;
  private timer = 0;

  constructor(parent: HTMLElement, host: KickVoteHost) {
    this.host = host;
    this.root = el('div', 'kick-vote');
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', 'Голосование: выгнать игрока');
    const head = this.root.appendChild(el('div', 'kv-head'));
    head.appendChild(el('span', 'kv-icon', '👢'));
    const text = head.appendChild(el('div', 'kv-text'));
    this.title = text.appendChild(el('b', 'kv-title'));
    this.sub = text.appendChild(el('span', 'kv-sub'));
    this.timeEl = head.appendChild(el('span', 'kv-time'));
    const row = this.root.appendChild(el('div', 'kv-row'));
    row.appendChild(el('span', 'kv-rule', `кик — если «за» больше ${KICK_PERCENT} % голосов`));
    this.btns = row.appendChild(el('div', 'kv-btns'));
    this.button('За', 'Y', 'yes', true);
    this.button('Против', 'N', 'no', false);
    this.meEl = row.appendChild(el('span', 'kv-me'));
    this.bar = this.root.appendChild(el('i', 'kv-bar'));
    parent.appendChild(this.root);
  }

  private button(label: string, key: string, cls: string, yes: boolean): void {
    const b = this.btns.appendChild(el('button', `kv-btn ${cls}`)) as HTMLButtonElement;
    b.type = 'button';
    b.appendChild(el('span', '', label));
    if (!TOUCH) b.appendChild(el('kbd', '', key));
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.preventDefault();
      this.cast(yes);
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
    this.root.classList.toggle('show', show);
    this.root.classList.toggle('done', !!res);
    this.root.classList.toggle('kicked', !!res?.kicked);
    if (show && !this.timer) this.timer = window.setInterval(() => this.render(), 250);
    if (!show) {
      if (this.timer) window.clearInterval(this.timer);
      this.timer = 0;
      return;
    }
    if (res) {
      setText(this.title, res.kicked ? `${res.nick} выгнан` : `${res.nick} остаётся`);
      setText(this.sub, `за ${res.yes} · против ${res.no}${res.kicked ? ` · вернуться сможет через ${kickWait(KICK_BAN_MS)}` : ''}`);
      setText(this.timeEl, '');
      this.btns.hidden = true;
      this.meEl.hidden = true;
      return;
    }
    const mine = v!.pid === this.host.myPid();
    const left = Math.max(0, this.endAt - now);
    const s = Math.ceil(left / 1000);
    setText(this.title, mine ? 'Голосуют, выгнать ли тебя' : `Выгнать ${v!.nick}?`);
    const wait = Math.max(0, v!.voters - v!.yes - v!.no);
    setText(this.sub, `предложил ${v!.by} · за ${v!.yes} · против ${v!.no}${wait ? ` · ещё ${wait}` : ''}`);
    setText(this.timeEl, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    this.root.classList.toggle('urgent', s <= URGENT_S);
    this.bar.style.transform = `scaleX(${Math.min(1, left / this.total).toFixed(3)})`;
    const can = this.canVote;
    this.btns.hidden = !can;
    this.meEl.hidden = can;
    this.meEl.className = `kv-me${v!.me === 'yes' ? ' yes' : v!.me === 'no' ? ' no' : ''}`;
    setText(this.meEl, v!.me === 'yes' ? 'Ты: за' : v!.me === 'no' ? 'Ты: против' : this.sent ? 'Голос отправлен…' : mine ? 'Ты не голосуешь' : 'Голосуют те, кто был в игре на начало');
  }
}

function el(tag: string, cls: string, text = ''): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function setText(e: HTMLElement, value: string): void {
  if (e.textContent !== value) e.textContent = value;
}
