// Ферма: части режима сверх фундамента (часть B1): помощь соседям и репутация (help.ts, §8), Фургон (van.ts, §10.2),
// доска заказов (orders.ts, §10.3), Древо разлома (boss.ts, §11), достижения и косметика репутации (achievements.ts,
// §13), награды уровня (rewards.ts, §3.2), сводка «Пока тебя не было» и находки свина (§14.4). Один объект на комнату:
// комната зовёт join/leave/second, обработчики своих действий и on() после действий фундамента (сбор, полив, продажа,
// улучшение, конвертация, свин) — чтобы двигать заказы, Древо и достижения. Сообщения — shared/farmsys.ts.
import { mskDay } from '../../shared/economy.ts';
import { pigTick, type HarvestItem } from '../../shared/farm.ts';
import { upgradeById } from '../../shared/farmdata.ts';
import { helpTick } from '../../shared/farmhelp.ts';
import type { FarmClientMsg } from '../../shared/farmnet.ts';
import type { FarmAway } from '../../shared/farmsys.ts';
import { vanTime } from '../../shared/farmvan.ts';
import { checkFarm } from './achievements.ts';
import { FarmBoss, type FarmBossStore } from './boss.ts';
import { helpAction } from './help.ts';
import { ensureOrders, orderAction, orderEvent } from './orders.ts';
import type { FarmCtx, FarmPlayer } from './room.ts';
import { sendVan, vanDeliver } from './van.ts';

type Msg<A extends FarmClientMsg['a']> = Extract<FarmClientMsg, { a: A }>;

/** Что сделал игрок в фундаменте (room.ts зовёт FarmSystems.on после успешного действия, до sendMe) */
export type FarmHook =
  | { k: 'harvest'; items: readonly HarvestItem[]; xp: number }
  | { k: 'water'; beds: readonly number[] }
  | { k: 'sold'; item: string; n: number; coins: number }
  | { k: 'upgrade'; id: string }
  | { k: 'convert' }
  | { k: 'pig' };

export class FarmSystems {
  private readonly ctx: FarmCtx & FarmBossStore;
  readonly boss: FarmBoss;
  /** Ники тех, кто заходил в эту сессию сервера: для «Tester7 полил 3 грядки» */
  private readonly nicks = new Map<number, string>();
  /** Сколько трюфелей было у свина в прошлую секунду: «Свин нашёл трюфель» */
  private readonly pigSeen = new Map<number, number>();
  private day = '';
  private vanKey = '';

  constructor(ctx: FarmCtx & FarmBossStore) {
    this.ctx = ctx;
    this.boss = new FarmBoss(ctx);
  }

  /** Игрок вошёл (после приветствия farm): доска на сегодня, награды, сводка, Фургон, Древо */
  join(p: FarmPlayer): void {
    const ctx = this.ctx;
    const now = ctx.now();
    const f = ctx.farm(p);
    if (p.c.profile) this.nicks.set(p.c.pid, p.c.profile.nick);
    helpTick(f, now);
    ensureOrders(ctx, p, this.boss.awake(now), now);
    checkFarm(ctx, p);
    const away: FarmAway = { ripe: 0, truffles: f.built.pig?.stored ?? 0, helped: 0, by: [] };
    const by = new Set<number>();
    for (const b of f.beds) {
      if (b.crop && now >= b.ripeAt) away.ripe++;
      away.helped += b.helpers.length;
      for (const pid of b.helpers) by.add(pid);
    }
    away.by = [...by].map((pid) => this.nicks.get(pid) ?? '').filter(Boolean);
    if (away.ripe || away.truffles || away.helped) ctx.send(p, { t: 'farmAway', a: away });
    this.pigSeen.set(p.c.pid, f.built.pig?.stored ?? 0);
    sendVan(ctx, p, now);
    this.boss.sendView(p, now);
    ctx.sendMe(p);
    ctx.dirty();
  }

  leave(p: FarmPlayer): void {
    this.pigSeen.delete(p.c.pid);
  }

  /** Раз в секунду, пока на ферме кто-то есть: Древо, смена суток (заказы), приезд и отъезд Фургона, свин */
  second(now: number): void {
    const ctx = this.ctx;
    this.boss.tick(now);
    const day = mskDay(now);
    const dayChanged = this.day !== '' && this.day !== day;
    this.day = day;
    const t = vanTime(now);
    const vanKey = `${t.cycle}:${t.open}`;
    const vanChanged = this.vanKey !== '' && this.vanKey !== vanKey;
    this.vanKey = vanKey;
    for (const p of ctx.players()) {
      const f = ctx.farm(p);
      let me = false;
      if (dayChanged && ensureOrders(ctx, p, this.boss.awake(now), now)) me = true;
      if (vanChanged) sendVan(ctx, p, now);
      if (f.built.pig) {
        pigTick(f, now);
        const was = this.pigSeen.get(p.c.pid) ?? 0;
        if (f.built.pig.stored > was) {
          ctx.ev(p, { k: 'note', text: '🐷 Свин нашёл трюфель — забери его в загоне' });
          me = true;
        }
        this.pigSeen.set(p.c.pid, f.built.pig.stored);
      }
      if (me) ctx.sendMe(p);
    }
  }

  /** После действия фундамента: заказы, очки Древа, достижения (sendMe делает комната) */
  on(p: FarmPlayer, e: FarmHook): void {
    const ctx = this.ctx;
    const now = ctx.now();
    switch (e.k) {
      case 'harvest':
        orderEvent(ctx, p, { k: 'harvest', items: e.items }, now);
        this.boss.harvest(p, e.xp, now);
        break;
      case 'water':
        orderEvent(ctx, p, { k: 'water', n: e.beds.length }, now);
        break;
      case 'sold':
        orderEvent(ctx, p, { k: 'sold', coins: e.coins }, now);
        break;
      case 'upgrade': {
        const u = upgradeById(e.id);
        if (u) orderEvent(ctx, p, { k: 'upgrade', kind: u.kind }, now);
        // сумка больше — ящики Фургона крупнее
        if (u?.kind === 'bag' || u?.kind === 'bed') sendVan(ctx, p, now);
        break;
      }
      case 'pig':
        this.pigSeen.set(p.c.pid, ctx.farm(p).built.pig?.stored ?? 0);
        break;
      case 'convert':
        break;
    }
    checkFarm(ctx, p);
  }

  help(p: FarmPlayer, m: Msg<'help'>): void {
    const now = this.ctx.now();
    const r = helpAction(this.ctx, p, m, now);
    if (!r) return;
    orderEvent(this.ctx, p, { k: 'help', n: r.beds.length }, now);
    this.after(p);
  }

  van(p: FarmPlayer, m: Msg<'van'>): void {
    const now = this.ctx.now();
    const r = vanDeliver(this.ctx, p, m, now);
    if (!r) return;
    orderEvent(this.ctx, p, { k: 'van' }, now);
    orderEvent(this.ctx, p, { k: 'sold', coins: r.coins }, now);
    sendVan(this.ctx, p, now);
    this.after(p);
  }

  order(p: FarmPlayer, m: Msg<'order'>): void {
    const now = this.ctx.now();
    if (orderAction(this.ctx, p, m, this.boss.awake(now), now)) this.after(p);
  }

  cone(p: FarmPlayer, m: Msg<'cone'>): void {
    this.boss.cone(p, m, this.ctx.now());
    this.ctx.sendMe(p);
  }

  private after(p: FarmPlayer): void {
    checkFarm(this.ctx, p);
    this.ctx.sendMe(p);
    this.ctx.dirty();
  }
}
