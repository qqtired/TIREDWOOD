// Жетоны в бейдже игрока (верх-право, client/ui/kit/badge.ts): баланс и всплывающее «+N» / «−N».
// Выигрыш на автомате сервер присылает с задержкой — показываем, когда остановятся барабаны.

/** Куда рисовать: бейдж (Badge) — число и всплывающее у него */
export interface TokensView {
  setTokens(n: number): void;
  pop(text: string, tone?: 'bad'): void;
}

const fmt = new Intl.NumberFormat('ru-RU');

export class TokensHud {
  private readonly view: TokensView;
  private value = -1;
  private readonly pending = new Set<number>();
  private generation = 0;

  constructor(view: TokensView) {
    this.view = view;
  }

  get shown(): number {
    return this.value;
  }

  /** Новый баланс. delayMs — показать позже; новый баланс без задержки отменяет отложенные (он свежее). */
  set(n: number, delayMs = 0): void {
    if (delayMs > 0) {
      const generation = this.generation;
      const t = window.setTimeout(() => {
        if (generation !== this.generation) return;
        this.pending.delete(t);
        this.apply(n);
      }, delayMs);
      this.pending.add(t);
      return;
    }
    this.cancel();
    this.apply(n);
  }

  /** Баланс из профиля: не перебивает отложенный показ выигрыша. */
  sync(n: number): void {
    if (this.pending.size === 0 && n !== this.value) this.apply(n);
  }

  reset(): void {
    this.cancel();
    this.value = -1;
    this.view.setTokens(0);
  }

  private cancel(): void {
    this.generation++;
    for (const t of this.pending) clearTimeout(t);
    this.pending.clear();
  }

  private apply(n: number): void {
    const diff = this.value < 0 ? 0 : n - this.value;
    this.value = n;
    this.view.setTokens(n);
    if (diff !== 0) this.view.pop(`${diff > 0 ? '+' : '−'}${fmt.format(Math.abs(diff))}`, diff < 0 ? 'bad' : undefined);
  }
}
