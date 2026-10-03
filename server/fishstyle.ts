// Выдача наград лестницы коллекции (shared/fishstyle.ts): при входе и после каждого улова. Решает сервер по альбому
// в профиле; выданное не отнимается. Новые снасти и значок сразу надеваются, одежда — только в примерочной.
import { collectionCount } from '../shared/fishrules.ts';
import { ALL, GEAR_SLOTS, LADDER, fishTotal, rewardLabel, stepNeed } from '../shared/fishstyle.ts';
import { itemById, type Outfit } from '../shared/outfit.ts';
import type { Profiles } from './profiles.ts';
import type { Profile } from './store.ts';

export interface LadderGrant {
  /** Выданные сейчас вещи по порядку лестницы */
  items: string[];
  /** Сеты, в которых что-то выдано сейчас: название, сколько видов, финал ли */
  sets: Array<{ name: string; need: number; master: boolean }>;
  /** Выдан финал — «Хозяин глубин» */
  master: boolean;
  /** Надетые сами снасти поменяли наряд — разослать всем */
  outfit: boolean;
}

/** Выдать всё положенное по числу видов в альбоме, чего ещё нет. */
export function grantLadder(profiles: Profiles, p: Profile): LadderGrant {
  const total = fishTotal();
  const got = collectionCount(p.album);
  const out: LadderGrant = { items: [], sets: [], master: false, outfit: false };
  let outfit: Outfit = p.outfit;
  for (const step of LADDER) {
    const need = stepNeed(step, total);
    if (got < need) break;
    let fresh = false;
    for (const id of step.items) {
      const it = itemById(id);
      if (!it || !profiles.grant(p, id)) continue;
      out.items.push(id);
      fresh = true;
      if (GEAR_SLOTS.includes(it.slot)) outfit = { ...outfit, [it.slot]: it.key };
    }
    if (fresh && step.set) out.sets.push({ name: step.set, need, master: step.need === ALL });
    if (fresh && step.need === ALL) out.master = true;
  }
  if (outfit !== p.outfit) {
    profiles.setOutfit(p, outfit);
    out.outfit = true;
  }
  return out;
}

/** Личный тост: «Награды коллекции: окно «Морская карта», удочка «Орешник»…» */
export function ladderToast(g: LadderGrant): string {
  const gear = g.items.filter((id) => GEAR_SLOTS.includes(itemById(id)!.slot));
  const wear = g.items.length - gear.length;
  const parts = gear.map(rewardLabel);
  if (wear > 0) parts.push(`одежда (${wear}) — в примерочной`);
  return `🎁 Награды коллекции рыб: ${parts.join(', ')}${gear.length ? '. Снасти уже на тебе — сменить в журнале (J)' : ''}`;
}

/** Строки в общий чат: сеты и финал */
export function ladderAnnounce(nick: string, g: LadderGrant): string[] {
  return g.sets.map((s) => (s.master
    ? `🏆 ${nick} собрал всю коллекцию — все ${s.need} видов рыб! Сет «${s.name}»: фуражка, китель, попугай и золотая удочка`
    : `🎣 ${nick} поймал ${s.need} видов рыб — сет «${s.name}»!`));
}
