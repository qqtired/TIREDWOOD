// UI clocks use a server wall-clock sample plus monotonic elapsed time. Clock changes on the computer
// must not extend a buff; this is display only, while the server owns eligibility and cast modifiers.
export class FishClock {
  private server = Date.now();
  private local = performance.now();

  sync(serverNow: number, localNow = performance.now()): void {
    if (!Number.isFinite(serverNow) || serverNow <= 0) return;
    this.server = serverNow;
    this.local = localNow;
  }

  now(localNow = performance.now()): number {
    return this.server + Math.max(0, localNow - this.local);
  }
}

export function fishTimeLeft(until: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((until - now) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/** An initial profile/reconnect or a rejected purchase never causes a drinking animation. */
export function confirmedFishBeer(pending: string | null, before: number, after: number, serverNow: number): boolean {
  return pending === 'beer' && after > before && after > serverNow;
}
