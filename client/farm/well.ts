// Мини-игра «Набери лейку» у корыта (design-v11 §5, часть B4). Сервер на fillStart тратит набор воды и шлёт зерно
// (событие fill); сцена зовёт start(seed, done), игра копит отсчёты (shared/farmwell.ts) и отдаёт их в done —
// сцена шлёт fillEnd, долю набранного считает сервер. Пока open — сцена не берёт ввод и отпускает мышь.
// Сейчас заглушка: сразу заканчивает попытку пустыми отсчётами (сервер даёт долю «стоял без движения»).
export class FarmWell {
  /** Мини-игра на экране */
  open = false;
  private readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  start(_seed: number, done: (samples: number[]) => void): void {
    void this.root;
    done([0, 0]);
  }
}
