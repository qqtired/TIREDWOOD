// Жетоны в правом верхнем углу: баланс и всплывающее «+N» / «−N».
// Выигрыш на автомате сервер присылает с задержкой — показываем, когда остановятся барабаны.
import { COIN_HTML } from './coin.ts';

const fmt = new Intl.NumberFormat('ru-RU');

export class TokensHud {
  private readonly root: HTMLElement;
  private readonly num: HTMLElement;
  private value = -1;
  private readonly pending = new Set<number>();
  private generation = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'tokens';
    this.root.innerHTML = `${COIN_HTML}<b class="n">0</b>`;
    this.num = this.root.querySelector('.n')!;
    parent.appendChild(this.root);
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
    this.num.textContent = '0';
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  private cancel(): void {
    this.generation++;
    for (const t of this.pending) clearTimeout(t);
    this.pending.clear();
  }

  private apply(n: number): void {
    const diff = this.value < 0 ? 0 : n - this.value;
    this.value = n;
    this.num.textContent = fmt.format(n);
    if (diff === 0) return;
    const pop = document.createElement('span');
    pop.className = `tok-pop ${diff > 0 ? 'up' : 'down'}`;
    pop.textContent = `${diff > 0 ? '+' : '−'}${fmt.format(Math.abs(diff))}`;
    this.root.appendChild(pop);
    this.root.classList.remove('bump');
    void this.root.offsetWidth;
    this.root.classList.add('bump');
    setTimeout(() => pop.remove(), 1600);
  }
}
