// Общий чат на весь сайт: Enter — открыть, Enter — отправить, Esc — закрыть. Сообщения тают через несколько секунд.
// Строка из другой комнаты помечена значком: 🏠 — набережная, 🎯 — пейнтбол.
import { MAX_CHAT, TEAM_CSS } from '../shared/constants.ts';
import type { ChatLine, RoomKind } from '../shared/messages.ts';
import { appendCoinText } from './ui/coin.ts';

const ROOM_ICON: Record<RoomKind, string> = { lobby: '🏠', paintball: '🎯', race: '🏁', fort: '🏰', fight: '🥊', skill: '☁️', boatrace: '🚤', hide: '🔎' };

const KEEP = 40;
const FADE_MS = 9000;

export class Chat {
  readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly form: HTMLElement;
  private readonly input: HTMLInputElement;
  isOpen = false;
  onSend: (text: string) => void = () => {};
  onOpenChange: (open: boolean) => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'chat';
    this.list = document.createElement('div');
    this.list.className = 'chat-list';
    this.form = document.createElement('div');
    this.form.className = 'chat-form';
    const label = document.createElement('span');
    label.className = 'chat-label';
    label.textContent = 'Всем:';
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.maxLength = MAX_CHAT;
    this.input.placeholder = 'Сообщение';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.form.append(label, this.input);
    this.root.append(this.list, this.form);
    parent.appendChild(this.root);

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
    this.root.classList.add('open');
    this.input.value = prefill;
    this.onOpenChange(true);
    // с клавиатуры — фокус в следующем кадре, чтобы тот же Enter не попал в поле
    if (now) this.input.focus();
    else requestAnimationFrame(() => this.input.focus());
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('open');
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
    row.className = `msg${line.sys ? ' sys' : ''}${mine ? ' mine' : ''}`;
    if (!line.sys) {
      if (line.room && line.room !== myRoom) {
        const icon = document.createElement('span');
        icon.className = 'room';
        icon.textContent = `${ROOM_ICON[line.room]} `;
        row.appendChild(icon);
      }
      const n = document.createElement('b');
      n.textContent = `${line.from}: `;
      n.style.color = line.team >= 0 ? (TEAM_CSS[line.team] ?? '#fff') : '#ffd9a8';
      row.appendChild(n);
    }
    // жетоны в строке (свои и от сервера) — нарисованной монеткой: эмодзи 🪙 есть не во всех системах
    appendCoinText(row, line.text);
    this.list.appendChild(row);
    while (this.list.childElementCount > KEEP) this.list.firstElementChild?.remove();
    setTimeout(() => row.classList.add('old'), FADE_MS);
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
