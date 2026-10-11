/** Один заброс после подтверждённого keep: общее правило для любой комнаты рыбалки. */
export interface QuickKeepContext {
  seat: number;
  fishing: boolean;
  canKeep: boolean;
  fresh: boolean;
  typing: boolean;
  blocked: boolean;
  locked: boolean;
  full: boolean;
  now: number;
}

export class FishNextCast {
  private seat = -1;
  private until = 0;
  get pending(): boolean { return this.seat >= 0; }

  request(c: QuickKeepContext): 'pass' | 'consume' | 'keep' {
    if (!c.fresh || c.typing || c.blocked || !c.fishing || c.seat < 0 || !c.canKeep) return 'pass';
    if (c.locked || (this.seat >= 0 && c.now <= this.until)) return 'consume';
    this.seat = c.seat;
    this.until = c.now + 2000;
    return 'keep';
  }

  /** FE_DONE=1 означает, что сервер подтвердил сохранение; consume-before-check не допускает дубли. */
  confirm(done: number, c: QuickKeepContext): boolean {
    const seat = this.seat, until = this.until;
    this.cancel();
    return done === 1 && seat >= 0 && seat === c.seat && c.fishing && !c.blocked && !c.typing && !c.full && c.now <= until;
  }

  cancel(): void { this.seat = -1; this.until = 0; }
}
