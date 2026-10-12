// Рыба в руках на набережной («Взять в руки» в рюкзаке рыбака): кто что держит. Сервер проверяет, что рыба правда
// лежит в рюкзаке игрока, и рассылает это всем в комнате JSON-сообщением fishHold. Продал, отпустил, поставил на
// рулетку — рыба из рук пропадает сама (room.ts сверяет рюкзаки несколько раз в секунду); ушёл с набережной — тоже.
import { FISH } from '../../shared/fishing.ts';
import type { BagFish } from '../../shared/fishprogress.ts';
import type { ServerMsg } from '../../shared/messages.ts';

export type FishHoldMsg = Extract<ServerMsg, { t: 'fishHold' }>;

interface Held {
  n: number;
  sp: number;
  g: number;
}

export class FishHolds {
  private readonly held = new Map<number, Held>();

  /**
   * Игрок slot берёт в руки рыбу n из своего рюкзака bag (n < 0 — убирает). Сообщение для всех — или null: такой рыбы
   * в рюкзаке нет, кривой номер, ничего не поменялось.
   */
  hold(slot: number, bag: readonly BagFish[] | null, n: unknown): FishHoldMsg | null {
    if (typeof n !== 'number' || !Number.isSafeInteger(n)) return null;
    if (n < 0) return this.drop(slot);
    const f = bag?.find((x) => x.n === n);
    const sp = f ? FISH.findIndex((x) => x.id === f.f) : -1;
    if (!f || sp < 0) return null;
    if (this.held.get(slot)?.n === n) return null;
    this.held.set(slot, { n, sp, g: f.g });
    return { t: 'fishHold', id: slot, n, sp, g: f.g };
  }

  /** Руки пустые (убрал, ушёл с набережной). null — и так ничего не держал. */
  drop(slot: number): FishHoldMsg | null {
    if (!this.held.delete(slot)) return null;
    return { t: 'fishHold', id: slot, n: -1, sp: -1, g: 0 };
  }

  /** Рыбы больше нет в рюкзаке (продал, отпустил, рулетка) — из рук. bagOf — рюкзак игрока (null — профиля нет). */
  sweep(bagOf: (slot: number) => readonly BagFish[] | null): FishHoldMsg[] {
    const out: FishHoldMsg[] = [];
    for (const [slot, h] of this.held) {
      if (bagOf(slot)?.some((f) => f.n === h.n)) continue;
      const m = this.drop(slot);
      if (m) out.push(m);
    }
    return out;
  }

  get size(): number {
    return this.held.size;
  }

  /** Вошедшему на набережную: кто что держит */
  views(): FishHoldMsg[] {
    return [...this.held].map(([id, h]) => ({ t: 'fishHold', id, n: h.n, sp: h.sp, g: h.g }));
  }
}
