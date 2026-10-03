// Соединение с сервером (одно на всё время, умеет переподключаться) и синхронизация часов.
import { TICK_RATE } from '../shared/constants.ts';
import type { ClientMsg, ServerMsg } from '../shared/messages.ts';

export class Net {
  private ws: WebSocket | null = null;
  onJson: (msg: ServerMsg) => void = () => {};
  onBinary: (buf: ArrayBuffer, at: number) => void = () => {};
  onOpen: () => void = () => {};
  onClose: (code: number, reason: string) => void = () => {};
  /** Номер перехода между комнатами: идёт в каждом пакете ввода, старый ввод сервер выбрасывает */
  epoch = 0;
  /** Последний замер пинга, мс */
  pingMs = 0;
  /** Когда последний раз что-то пришло от сервера (performance.now) */
  lastRx = 0;

  /** Открыть новое соединение (старое, если было, закрывается молча). */
  connect(): void {
    this.close();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.lastRx = performance.now();
      this.onOpen();
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      const at = performance.now();
      this.lastRx = at;
      if (typeof e.data === 'string') {
        let msg: ServerMsg;
        try {
          msg = JSON.parse(e.data) as ServerMsg;
        } catch {
          return;
        }
        this.onJson(msg);
      } else {
        this.onBinary(e.data as ArrayBuffer, at);
      }
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.onClose(e.code, e.reason);
    };
    ws.onerror = () => {
      // подробности придут в onclose
    };
  }

  /** Связь молчит: закрыть с кодом code и сообщить, как будто закрыл сервер (onClose). */
  drop(code: number, reason: string): void {
    const ws = this.ws;
    if (!ws) return;
    this.ws = null;
    ws.close(code, reason);
    this.onClose(code, reason);
  }

  /** Закрыть без вызова onClose (выход в меню). */
  close(): void {
    const ws = this.ws;
    this.ws = null;
    if (ws) ws.close();
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  sendBinary(data: Uint8Array<ArrayBuffer>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Соединение открыто или открывается */
  get active(): boolean {
    return this.ws !== null;
  }

  get buffered(): number {
    return this.ws?.bufferedAmount ?? 0;
  }
}

const WINDOW = 240;
const RATE = TICK_RATE / 1000; // тиков в миллисекунду

/**
 * Часы сервера на клиенте. По времени прихода снимков оцениваем,
 * какой серверный тик «сейчас» (фильтр минимальной задержки), и ведём
 * плавные часы отрисовки чужих игроков чуть в прошлом — на величину джиттера.
 */
export class ClockSync {
  private readonly offsets = new Float64Array(WINDOW);
  private count = 0;
  private head = 0;
  private maxOffset = -Infinity;
  private sinceStats = 0;
  /** Наименьшая задержка интерполяции, тиков (на набережной снимки реже — задержка больше) */
  private readonly minDelay: number;
  /** Задержка интерполяции, тиков */
  delay: number;
  private targetDelay: number;
  jitter = 0;
  renderTick = 0;
  ready = false;
  lastTick = 0;

  constructor(minDelay = 1.6) {
    this.minDelay = minDelay;
    this.delay = Math.max(3, minDelay);
    this.targetDelay = this.delay;
  }

  addSample(tick: number, atMs: number): void {
    if (tick <= this.lastTick && this.ready) return;
    this.lastTick = tick;
    const off = tick - atMs * RATE;
    this.offsets[this.head] = off;
    this.head = (this.head + 1) % WINDOW;
    if (this.count < WINDOW) this.count++;
    if (off > this.maxOffset) this.maxOffset = off;
    if (++this.sinceStats >= 15 || !this.ready) {
      this.sinceStats = 0;
      this.recompute();
    }
    if (!this.ready) {
      this.ready = true;
      this.renderTick = this.estimate(atMs) - this.delay;
    }
  }

  private recompute(): void {
    // максимум по окну (старые выпадают — так учитывается дрейф часов)
    let max = -Infinity;
    for (let i = 0; i < this.count; i++) if (this.offsets[i] > max) max = this.offsets[i];
    this.maxOffset = max;
    // 95-й перцентиль «опоздания» снимков
    const lags: number[] = [];
    for (let i = 0; i < this.count; i++) lags.push(max - this.offsets[i]);
    lags.sort((a, b) => a - b);
    const p95 = lags[Math.min(lags.length - 1, Math.floor(lags.length * 0.95))] ?? 0;
    this.jitter = p95;
    this.targetDelay = Math.min(12, Math.max(this.minDelay, p95 + 1.2));
  }

  /** Самый свежий тик, который мог бы уже прийти (при минимальной задержке). */
  estimate(nowMs: number): number {
    return this.maxOffset + nowMs * RATE;
  }

  update(nowMs: number, dtMs: number): void {
    if (!this.ready) return;
    // задержку увеличиваем быстро, уменьшаем медленно — чтобы не дёргаться
    if (this.targetDelay > this.delay) this.delay = Math.min(this.targetDelay, this.delay + dtMs * 0.004);
    else this.delay = Math.max(this.targetDelay, this.delay - dtMs * 0.0012);
    const target = this.estimate(nowMs) - this.delay;
    this.renderTick += dtMs * RATE;
    const err = target - this.renderTick;
    if (Math.abs(err) > 12) this.renderTick = target;
    else this.renderTick += err * Math.min(1, dtMs * 0.004);
  }
}
