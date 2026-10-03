// Возврат в ту же сессию после обрыва связи. Сервер держит игрока в его комнате 45 с (server/hub.ts, RESUME_MS):
// сцена остаётся на экране, ввод на паузе, сверху плашка; попытки — сразу, потом через 1–5 с. Сервер ответил
// «resumed» — играем дальше с того же места, он сам дошлёт пропущенное. Ответил обычным входом — сессия новая
// (сервер перезапускался или ждал слишком долго): сцену пришлёт он же. 40 с без успеха — прежний экран
// переподключения.

export const RELINK_MS = 40_000;
const STEPS = [0, 1000, 2000, 3000, 5000];
/** Попытка зависла (сокет не открылся или сервер не ответил на hello) — следующая */
const ATTEMPT_MS = 6000;

export interface RelinkHost {
  /** Открыть сокет; когда откроется — hello с просьбой вернуться с номера rs */
  connect(rs: number): void;
  /** Молча закрыть зависшую попытку */
  abort(): void;
  /** Сколько JSON-сообщений сессии принято */
  rx(): number;
  setRx(n: number): void;
  /** Связь пропала: ввод на паузу, голос без сигналов */
  down(): void;
  /** Связь вернулась: resumed — та же сессия; false — сервер начал новую */
  up(resumed: boolean): void;
  /** Не вышло за RELINK_MS — обычный экран переподключения */
  giveUp(): void;
  banner(text: string | null): void;
  now(): number;
  setTimer(fn: () => void, ms: number): number;
  clearTimer(id: number): void;
}

export class Relink {
  /** Сервер предупредил о перезапуске — другая надпись */
  restarting = false;
  private at = 0;
  private from = 0;
  private tries = 0;
  private timer = 0;
  private attemptAt = 0;
  private readonly host: RelinkHost;

  constructor(host: RelinkHost) {
    this.host = host;
  }

  get active(): boolean {
    return this.at > 0;
  }

  /** Сокет закрылся посреди игры, или очередная попытка не удалась. */
  lost(): void {
    const now = this.host.now();
    if (!this.at) {
      this.at = now;
      this.from = this.host.rx();
      this.tries = 0;
      this.host.down();
    }
    this.host.banner(this.restarting ? 'Сервер перезапускается — подожди немного…' : 'Связь пропала — восстанавливаем…');
    this.attemptAt = 0;
    if (now - this.at > RELINK_MS) {
      this.fail();
      return;
    }
    const delay = STEPS[Math.min(this.tries++, STEPS.length - 1)];
    this.host.clearTimer(this.timer);
    this.timer = this.host.setTimer(() => this.attempt(), delay);
  }

  /** Первое сообщение нового сокета. true — это «resumed», дальше его не разбирать. */
  message(t: string): boolean {
    if (!this.at) return false;
    const resumed = t === 'resumed';
    this.finish();
    if (resumed) this.host.setRx(this.from);
    this.host.up(resumed);
    return resumed;
  }

  /** Каждый кадр: зависшую попытку закрываем и пробуем снова. */
  frame(): void {
    if (this.at && this.attemptAt && this.host.now() - this.attemptAt > ATTEMPT_MS) {
      this.host.abort();
      this.lost();
    }
  }

  /** Сеть вернулась (событие online) — пробуем сразу, без паузы. */
  online(): void {
    if (!this.at || this.attemptAt) return;
    this.host.clearTimer(this.timer);
    this.attempt();
  }

  cancel(): void {
    if (this.at) this.finish();
  }

  private attempt(): void {
    if (!this.at) return;
    if (this.host.now() - this.at > RELINK_MS) {
      this.fail();
      return;
    }
    this.attemptAt = this.host.now();
    this.host.connect(this.from);
  }

  private finish(): void {
    this.host.clearTimer(this.timer);
    this.at = 0;
    this.attemptAt = 0;
    this.restarting = false;
    this.host.banner(null);
  }

  private fail(): void {
    this.finish();
    this.host.giveUp();
  }
}
