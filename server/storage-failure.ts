import { StoreWriteError } from './store.ts';

interface StorageFailureOptions {
  flush(): void;
  stop(): void;
  finish(saved: boolean): void;
  log?(message: string): void;
}

/** A failed command may be half applied: save its pending state, then restart instead of resuming play. */
export class StorageFailure {
  private stopped = false;
  private readonly options: StorageFailureOptions;

  constructor(options: StorageFailureOptions) { this.options = options; }

  get failed(): boolean { return this.stopped; }

  run(action: () => void): boolean {
    if (this.stopped) return false;
    try {
      action();
      return !this.stopped;
    } catch (error) {
      if (!(error instanceof StoreWriteError)) throw error;
      this.fail();
      return false;
    }
  }

  fail(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.options.log?.('Хранилище недоступно: игра остановлена, повторяем сохранение перед завершением');
    this.options.stop();
    let attempts = 0;
    const retry = (): void => {
      attempts++;
      try {
        this.options.flush();
      } catch (error) {
        if (!(error instanceof StoreWriteError)) throw error;
        if (attempts < 3) { setTimeout(retry, 250); return; }
        this.options.log?.('Хранилище: повторная запись не удалась; завершение с последним сохранением на диске');
        this.options.finish(false);
        return;
      }
      this.options.log?.('Хранилище: ожидавшие изменения сохранены; завершение для безопасного перезапуска');
      this.options.finish(true);
    };
    // The failed call must unwind first (e.g. a gift grant rolls back its uncommitted items).
    setTimeout(retry, 250);
  }
}
