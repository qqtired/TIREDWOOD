// Общий чат на весь сайт — док слева внизу (кит: .k-chat в .k-slot--bl, голос — кнопкой в той же строке, ui/voice.ts):
// Enter — открыть, Enter — отправить, Esc — закрыть; мышью — нажать «Написать в чат», убрать — клик мимо.
// Сообщения тают через несколько секунд (меню → Интерфейс: тают / остаются / прятать). Строка из другой комнаты
// помечена значком комнаты.
import { MAX_CHAT, TEAM_CSS } from '../shared/constants.ts';
import type { ChatLine, RoomKind } from '../shared/messages.ts';
import { appendCoinText } from './ui/coin.ts';
import { keyHtml, iconImg } from './ui/kit/dom.ts';

/** Значок комнаты у строки из другой комнаты */
const ROOM_ICON: Record<RoomKind, string> = {
  lobby: 'anchor', paintball: 'paintballs', race: 'kart', fort: 'shield', fight: 'champion', skill: 'climber', hide: 'hide-box', dungeon: 'dungeon', farm: 'farm-gate',
};

const KEEP = 40;
const FADE_MS = 9000;

/** Цвет ника без команды — один из шести кита, по нику: у каждого свой и всегда тот же */
function nickTone(nick: string): number {
  let h = 0;
  for (const ch of nick) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return (h % 6) + 1;
}

export class Chat {
  readonly root: HTMLElement;
  /** Строка дока: кнопка голоса (ui/voice.ts) и поле чата */
  readonly bar: HTMLElement;
  private readonly list: HTMLElement;
  private readonly closed: HTMLButtonElement;
  private readonly form: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly hint: HTMLElement;
  isOpen = false;
  onSend: (text: string) => void = () => {};
  onOpenChange: (open: boolean) => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'k-chat pz-dock';
    this.list = document.createElement('div');
    this.list.className = 'k-chat-list';
    this.bar = document.createElement('div');
    this.bar.className = 'k-chat-bar';
    this.closed = document.createElement('button');
    this.closed.type = 'button';
    this.closed.className = 'k-chat-closed';
    this.closed.innerHTML = `${keyHtml('Enter')}Написать в чат`;
    this.form = document.createElement('label');
    this.form.className = 'k-chat-input is-typing';
    this.form.hidden = true;
    const label = document.createElement('span');
    label.textContent = 'Всем:';
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.maxLength = MAX_CHAT;
    this.input.placeholder = 'Сообщение';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.form.append(label, this.input);
    this.form.insertAdjacentHTML('beforeend', keyHtml('Enter'));
    this.bar.append(this.closed, this.form);
    this.hint = document.createElement('span');
    this.hint.className = 'k-pill k-pill--plate k-pill--sm pz-chat-hint';
    this.hint.innerHTML = `${keyHtml('Esc', undefined, 'sm')} не отправлять`;
    this.hint.hidden = true;
    this.root.append(this.list, this.bar, this.hint);
    parent.appendChild(this.root);

    // мышь свободна (стол, примерочная): «Написать в чат» — открыть сразу, с фокусом
    this.closed.addEventListener('mousedown', (e) => e.preventDefault());
    this.closed.addEventListener('click', () => this.open('', true));
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = this.input.value.trim();
        this.input.value = '';
        if (text) this.onSend(text);
        this.close();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
    this.input.addEventListener('blur', () => {
      if (this.isOpen) this.close();
    });
  }

  /** now — фокус сразу (кнопка на телефоне: клавиатура откроется только внутри нажатия) */
  open(prefill = '', now = false): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.root.classList.add('is-open');
    this.closed.hidden = true;
    this.form.hidden = this.hint.hidden = false;
    this.input.value = prefill;
    this.onOpenChange(true);
    // с клавиатуры — фокус в следующем кадре, чтобы тот же Enter не попал в поле
    if (now) this.input.focus();
    else requestAnimationFrame(() => this.input.focus());
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('is-open');
    this.closed.hidden = false;
    this.form.hidden = this.hint.hidden = true;
    this.input.blur();
    this.onOpenChange(false);
  }

  /** Подсказка в поле ввода (в пейнтболе работают команды /help и другие). */
  setPlaceholder(text: string): void {
    this.input.placeholder = text;
  }

  /** Строка чата. myPid, myRoom — кто я и где: своё выделяется, чужая комната — значком. */
  add(line: ChatLine, myPid: number, myRoom: RoomKind | ''): void {
    const row = document.createElement('div');
    const mine = !line.sys && line.pid !== 0 && line.pid === myPid;
    row.className = `k-chat-line${line.sys ? ' is-sys' : ''}${mine ? ' is-own' : ''}`;
    if (!line.sys) {
      if (line.room && line.room !== myRoom) {
        row.insertAdjacentHTML('beforeend', iconImg(ROOM_ICON[line.room]));
      }
      const n = document.createElement('b');
      n.textContent = line.from;
      // команда (пейнтбол, крепость) — цветом команды, читаемым на плашке чата (kit/modes.css .k-team-N), остальные — одним из шести цветов кита
      if (line.team >= 0 && TEAM_CSS[line.team]) row.classList.add(`k-team-${line.team}`);
      else row.classList.add(`k-nick-${nickTone(line.from)}`);
      row.appendChild(n);
    }
    // жетоны в строке (свои и от сервера) — нарисованной монеткой: эмодзи 🪙 есть не во всех системах
    appendCoinText(row, line.text);
    for (const img of row.querySelectorAll('img.coin')) img.className = 'k-coin';
    this.list.appendChild(row);
    while (this.list.childElementCount > KEEP) this.list.firstElementChild?.remove();
    setTimeout(() => row.classList.add('is-old'), FADE_MS);
    this.list.scrollTop = this.list.scrollHeight;
  }

  /** Системная строка только для меня (подсказки сцены). */
  note(text: string): void {
    this.add({ from: '', pid: 0, room: '', team: -1, text, sys: true }, 0, '');
  }

  clear(): void {
    this.list.textContent = '';
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
    if (!v) this.close();
  }
}
