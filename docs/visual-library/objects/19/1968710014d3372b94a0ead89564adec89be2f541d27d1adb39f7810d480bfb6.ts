// Связь сессии с сокетом. Сокет может смениться (возврат после обрыва связи), сессия игрока — нет: комнаты держат
// ссылку на эту связь и шлют в неё как раньше. Все JSON-сообщения сессии нумеруются по порядку; клиент в пинге
// сообщает, сколько принял, и подтверждённое мы забываем. Неподтверждённое храним (с потолком), чтобы после
// возврата дослать ровно то, что не дошло, — даже если оно утонуло в умершем сокете. Снимки (binary) не храним:
// следующий снимок всё равно новее.
import { linkNumbered } from '../shared/link.ts';
import type { ServerMsg } from '../shared/messages.ts';

export interface LinkSocket {
  sendBinary(data: Uint8Array): void;
  sendJson(msg: ServerMsg): void;
  /** Готовая строка JSON (сокет игры шлёт её как есть, без второго JSON.stringify) */
  sendText?(text: string): void;
  close(code: number, reason: string): void;
}

/** Сколько неподтверждённых сообщений держим. Обычно их несколько десятков (подтверждение раз в 2 с). */
export const LINK_KEEP_MSGS = 4000;
export const LINK_KEEP_BYTES = 768 * 1024;

export class SessionLink implements LinkSocket {
  private socket: LinkSocket | null;
  /** Сколько JSON-сообщений отправлено за сессию (номер следующего) */
  sent = 0;
  /** Номер первого хранимого сообщения */
  private base = 0;
  private kept: string[] = [];
  private head = 0;
  private bytes = 0;

  constructor(socket: LinkSocket) {
    this.socket = socket;
  }

  /** Сокет сейчас этот (закрытие старого сокета после возврата — не в счёт) */
  has(socket: LinkSocket): boolean {
    return this.socket === socket;
  }

  get attached(): boolean {
    return this.socket !== null;
  }

  /** Сколько сообщений хранится неподтверждёнными (для тестов и журнала) */
  get pending(): number {
    return this.kept.length - this.head;
  }

  sendJson(msg: ServerMsg): void {
    const s = this.socket;
    // частое полное состояние режима (shared/link.ts) не храним: без связи оно просто пропадает, как снимок
    if (!linkNumbered(msg.t)) {
      s?.sendJson(msg);
      return;
    }
    const text = JSON.stringify(msg);
    this.keep(text);
    if (!s) return;
    if (s.sendText) s.sendText(text);
    else s.sendJson(msg);
  }

  sendBinary(data: Uint8Array): void {
    this.socket?.sendBinary(data);
  }

  close(code: number, reason: string): void {
    this.socket?.close(code, reason);
  }

  /** Клиент принял n сообщений сессии: всё до n можно забыть. */
  ack(n: unknown): void {
    if (!Number.isSafeInteger(n) || (n as number) <= this.base || (n as number) > this.sent) return;
    let drop = (n as number) - this.base;
    while (drop-- > 0) this.bytes -= this.kept[this.head++].length;
    this.base = n as number;
    this.compact();
  }

  /** Можно ли продолжить сессию с сообщения from (всё начиная с него ещё хранится). */
  canResume(from: unknown): from is number {
    return Number.isSafeInteger(from) && (from as number) >= this.base && (from as number) <= this.sent;
  }

  /** Сокет умер: сообщения копятся, снимки пропадают. */
  detach(): void {
    this.socket = null;
  }

  /** Забрать сокет у этой связи (его подхватывает прежняя сессия). */
  take(): LinkSocket | null {
    const s = this.socket;
    this.socket = null;
    return s;
  }

  /** Отцепить и закрыть текущий сокет (он ещё жив, а клиент уже пришёл с новым). */
  dropSocket(code: number, reason: string): void {
    const s = this.socket;
    this.socket = null;
    s?.close(code, reason);
  }

  /** Новый сокет той же сессии: дослать всё начиная с from и дальше слать в него. */
  attach(socket: LinkSocket, from: number): boolean {
    if (!this.canResume(from)) return false;
    this.socket = socket;
    for (let i = this.head + (from - this.base); i < this.kept.length; i++) deliver(socket, this.kept[i]);
    return true;
  }

  private keep(text: string): void {
    this.kept.push(text);
    this.bytes += text.length;
    this.sent++;
    // потолок: самое старое забываем — вернуться к нему уже нельзя (тогда вход заново, как раньше)
    while (this.kept.length - this.head > LINK_KEEP_MSGS || (this.bytes > LINK_KEEP_BYTES && this.kept.length - this.head > 1)) {
      this.bytes -= this.kept[this.head++].length;
      this.base++;
    }
    this.compact();
  }

  private compact(): void {
    if (this.head > 256 && this.head * 2 > this.kept.length) {
      this.kept = this.kept.slice(this.head);
      this.head = 0;
    }
  }
}

function deliver(socket: LinkSocket, text: string): void {
  if (socket.sendText) socket.sendText(text);
  else socket.sendJson(JSON.parse(text) as ServerMsg);
}
