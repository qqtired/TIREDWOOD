// Ферма: помощь соседям на сервере (design-v11 §8.1, §18.5). Полить чужие грядки (в том числе спящего участка):
// заряд лейки + очко помощи на грядку, −20 % оставшегося времени. Грабли работают и здесь — до 1/4/9 грядок одного
// участка. Все лимиты — shared/farmhelp.ts; здесь — проверка места и рассылка.
import { cutRemaining, farmLevel } from '../../shared/farm.ts';
import { BED_CLICK_RANGE, FARM_COUNTERS, FARM_PLOTS, HELP_MIN_LEVEL, HELP_RESET_MS, RAKE_BEDS, cropById } from '../../shared/farmdata.ts';
import { helpBlock, helpReward, helpTick, markHelpTarget } from '../../shared/farmhelp.ts';
import { bedDist } from '../../shared/farmmap.ts';
import type { FarmClientMsg } from '../../shared/farmnet.ts';
import { sendGot } from './rewards.ts';
import type { FarmCtx, FarmPlayer } from './room.ts';

/** Полить соседу; вернёт хозяина и политые грядки или null (отказ уже отправлен) */
export function helpAction(ctx: FarmCtx, p: FarmPlayer, m: Extract<FarmClientMsg, { a: 'help' }>, now: number): { owner: number; beds: number[] } | null {
  const f = ctx.farm(p);
  const pid = p.c.pid;
  const fail = (why: Parameters<FarmCtx['fail']>[2]): null => { ctx.fail(p, 'help', why); return null; };
  if (farmLevel(f.xp) < HELP_MIN_LEVEL) return fail('level');
  const plot = m.plot;
  if (!Number.isInteger(plot) || plot < 0 || plot >= FARM_PLOTS) return fail('plot');
  const seat = ctx.plots.seats[plot];
  const owner = seat?.pid ?? 0;
  const t = owner && owner !== pid ? ctx.farmOfPid(owner) : undefined;
  if (!t) return fail('plot');
  const beds: number[] = [];
  if (!Array.isArray(m.beds) || m.beds.length === 0 || m.beds.length > RAKE_BEDS[f.tools.rake - 1]) return fail('bed');
  for (const b of m.beds) {
    if (!Number.isInteger(b) || b < 0 || b >= t.beds.length) return fail('bed');
    if (!beds.includes(b)) beds.push(b);
  }
  if (!beds.every((b) => bedDist(plot, b, p.state.x, p.state.z) <= BED_CLICK_RANGE + 1.5)) return fail('far');
  helpTick(f, now);
  if (f.help.points < 1) return fail('count');
  if (f.water < 100) return fail('water');
  const done: number[] = [];
  let block: ReturnType<typeof helpBlock> = null;
  for (const i of beds) {
    if (f.help.points < 1 || f.water < 100) break;
    const bed = t.beds[i];
    const why = helpBlock(bed, pid, now);
    if (why) { block ??= why; continue; }
    cutRemaining(bed, now);
    bed.helpers.push(pid);
    f.water -= 100;
    if (f.help.resetAt <= now) f.help.resetAt = now + HELP_RESET_MS;
    f.help.points--;
    done.push(i);
  }
  if (done.length === 0) return fail(block ?? 'empty');
  let rep = 0;
  let coins = 0;
  for (let k = 0; k < done.length; k++) {
    const r = helpReward(f, owner, now);
    rep += r.rep;
    coins += r.coins;
  }
  const K = FARM_COUNTERS;
  f.counters[K.helps] = (f.counters[K.helps] ?? 0) + done.length;
  f.counters[K.helpTargetsDay] = Math.max(f.counters[K.helpTargetsDay] ?? 0, markHelpTarget(f, owner, now));
  ctx.credit(p, coins);
  ctx.ev(null, { k: 'water', plot, beds: done, by: pid });
  ctx.plotChanged(plot);
  const host = ctx.byPid(owner);
  if (host) {
    const crop = cropById(t.beds[done[0]].crop)?.name ?? 'грядку';
    ctx.ev(host, { k: 'note', text: `${p.c.profile?.nick ?? 'Сосед'} полил твою грядку: ${crop}${done.length > 1 ? ` и ещё ${done.length - 1}` : ''}` });
    ctx.sendMe(host);
  }
  sendGot(ctx, p, { src: 'help', id: String(owner), coins, xp: 0, rep, items: [] });
  ctx.dirty();
  return { owner, beds: done };
}
