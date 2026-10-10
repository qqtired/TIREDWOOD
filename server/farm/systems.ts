// Ферма: части режима, которые достраиваются отдельно (часть B1): помощь соседям и репутация (§8), Фургон (§10.2),
// доска заказов (§10.3), Древо разлома (§11), свин/компост/пчёлы сверх фундамента, достижения. Один объект на комнату:
// здесь же живёт общее состояние (цикл Фургона, босс). Комната зовёт join/leave/second и обработчики сообщений;
// room.ts для этого трогать не нужно. Каждую часть лучше вынести в свой файл (help.ts, van.ts, orders.ts, boss.ts),
// а здесь оставить только вызовы. Пока всё — заглушки: действия отвечают «выключено».
import type { FarmClientMsg } from '../../shared/farmnet.ts';
import type { FarmCtx, FarmPlayer } from './room.ts';

type Msg<A extends FarmClientMsg['a']> = Extract<FarmClientMsg, { a: A }>;

export class FarmSystems {
  private readonly ctx: FarmCtx;

  constructor(ctx: FarmCtx) {
    this.ctx = ctx;
  }

  /** Игрок вошёл (после приветствия farm): прислать ему общее состояние (Фургон, босс) — через ctx.send */
  join(_p: FarmPlayer): void {}

  leave(_p: FarmPlayer): void {}

  /** Раз в секунду, пока на ферме кто-то есть: таймеры Фургона и босса */
  second(_now: number): void {}

  help(p: FarmPlayer, _m: Msg<'help'>): void {
    this.ctx.fail(p, 'help', 'off');
  }

  van(p: FarmPlayer, _m: Msg<'van'>): void {
    this.ctx.fail(p, 'van', 'off');
  }

  order(p: FarmPlayer, _m: Msg<'order'>): void {
    this.ctx.fail(p, 'order', 'off');
  }

  cone(p: FarmPlayer, _m: Msg<'cone'>): void {
    this.ctx.fail(p, 'cone', 'off');
  }
}
