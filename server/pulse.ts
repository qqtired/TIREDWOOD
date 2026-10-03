// Пульс соединения: раз в PULSE_MS сервер шлёт пинг. Любое сообщение от клиента или ответ на пинг — «живой».
// Молчит PULSE_MISS пульсов подряд (6–8 с) — отключаем. Раньше хватало одного пропуска (2–4 с), и игроки
// с неровной связью вылетали на ровном месте.

export const PULSE_MS = 2000;
export const PULSE_MISS = 3;

export class Pulse {
  /** Пингов подряд без ответа */
  missed = 0;
  /** Номер последнего пинга: ответ на него даёт время туда-обратно */
  seq = 0;
  pingAt = 0;
  lastAlive: number;

  constructor(now: number) {
    this.lastAlive = now;
  }

  /** Пришло сообщение от клиента */
  alive(now: number): void {
    this.missed = 0;
    this.lastAlive = now;
  }

  /** Ответ на пинг. Время туда-обратно, мс, — если это ответ на последний пинг, иначе null. */
  pong(now: number, payload: string): number | null {
    this.alive(now);
    return payload === String(this.seq) && this.pingAt > 0 ? now - this.pingAt : null;
  }

  /** Очередной пульс: номер пинга, который надо отправить, или null — клиент молчит слишком долго. */
  beat(now: number): number | null {
    if (this.missed >= PULSE_MISS) return null;
    this.missed++;
    this.seq++;
    this.pingAt = now;
    return this.seq;
  }

  /** Сколько секунд клиент молчит */
  silentS(now: number): number {
    return Math.round((now - this.lastAlive) / 1000);
  }
}

// Ограничение частоты сообщений — «ведро»: запас FLOOD_BURST, пополняется FLOOD_RATE в секунду.
// Обычно клиент шлёт ~62 сообщения в секунду (ввод каждый тик и пинг). Если связь замирала, накопленное
// приходит пачкой — до ~500 за 8 с (дольше сервер не ждёт), это не флуд. Жёсткие «300 в секунду»
// выкидывали таких игроков, а клиент после кода 1008 не переподключается сам.
export const FLOOD_RATE = 150;
export const FLOOD_BURST = 900;

export class MsgBudget {
  private left = FLOOD_BURST;
  private at: number;

  constructor(now: number) {
    this.at = now;
  }

  /** Пришло сообщение. false — запас кончился: это флуд. */
  take(now: number): boolean {
    this.left = Math.min(FLOOD_BURST, this.left + ((now - this.at) * FLOOD_RATE) / 1000);
    this.at = now;
    if (this.left < 1) return false;
    this.left -= 1;
    return true;
  }
}
