// Выдача наград лестницы коллекции (shared/fishstyle.ts): при входе и после каждого улова. Решает сервер по альбому
// в профиле; выданное не отнимается. Новые снасти и значок сразу надеваются, одежда — только в примерочной.
// Остров «Последний свет»: та же выдача по своей лестнице ISLE_LADDER и своему счётчику видов острова (isleCaught):
// видов острова в альбоме нет (остров выключен флагом ISLE или ещё не доплыл) — ничего не выдаётся.
import { collectionCount } from '../shared/fishrules.ts';
import { ALL, GEAR_SLOTS, ISLE_ITEMS, ISLE_LADDER, LADDER, fishTotal, rewardLabel, stepNeed, type RewardStep } from '../shared/fishstyle.ts';
import { ISLE_SPECIES, ISLE_TOTAL, isleCaught } from '../shared/islestyle.ts';
import { itemById, type Outfit } from '../shared/outfit.ts';
import type { Client, Hub } from './hub.ts';
import type { Profiles } from './profiles.ts';
import type { Profile } from './store.ts';

export interface LadderGrant {
  /** Выданные сейчас вещи по порядку лестницы */
  items: string[];
  /** Сеты, в которых что-то выдано сейчас: название, сколько видов, финал ли, остров ли */
  sets: Array<{ name: string; need: number; master: boolean; isle?: boolean }>;
  /** Выдан финал — «Хозяин глубин» */
  master: boolean;
  /** Надетые сами снасти поменяли наряд — разослать всем */
  outfit: boolean;
}

/** Выдать всё положенное по числу видов в альбоме (коллекция и остров), чего ещё нет. */
export function grantLadder(profiles: Profiles, p: Profile): LadderGrant {
  const out: LadderGrant = { items: [], sets: [], master: false, outfit: false };
  let outfit: Outfit = p.outfit;
  const climb = (ladder: readonly RewardStep[], got: number, total: number, isle: boolean): void => {
    for (const step of ladder) {
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
      if (fresh && step.set) out.sets.push({ name: step.set, need, master: !isle && step.need === ALL, ...(isle ? { isle } : {}) });
      if (fresh && !isle && step.need === ALL) out.master = true;
    }
  };
  climb(LADDER, collectionCount(p.album), fishTotal(), false);
  climb(ISLE_LADDER, isleCaught(p), ISLE_TOTAL, true);
  if (outfit !== p.outfit) {
    profiles.setOutfit(p, outfit);
    out.outfit = true;
  }
  return out;
}

/** Личный тост: «Награды коллекции: окно «Морская карта», удочка «Орешник»…»; только остров — «Награды острова…» */
export function ladderToast(g: LadderGrant): string {
  const gear = g.items.filter((id) => GEAR_SLOTS.includes(itemById(id)!.slot));
  const wear = g.items.length - gear.length;
  const parts = gear.map(rewardLabel);
  if (wear > 0) parts.push(`одежда (${wear}) — в примерочной`);
  const head = g.items.every((id) => ISLE_ITEMS.has(id)) ? '🗼 Награды острова «Последний свет»' : '🎁 Награды коллекции рыб';
  return `${head}: ${parts.join(', ')}${gear.length ? '. Снасти уже на тебе — сменить в журнале (J)' : ''}`;
}

/** Строки в общий чат: сеты и финал */
export function ladderAnnounce(nick: string, g: LadderGrant): string[] {
  return g.sets.map((s) => (s.isle
    ? `🗼 ${nick} поймал все ${s.need} видов острова «Последний свет» — сет «${s.name}»: шапка, свитер с фонарём и маяк у ника!`
    : s.master
      ? `🏆 ${nick} собрал всю коллекцию — все ${s.need} видов рыб! Сет «${s.name}»: фуражка, китель, попугай и золотая удочка`
      : `🎣 ${nick} поймал ${s.need} видов рыб — сет «${s.name}»!`));
}

/**
 * Только для проверки (/isle N в чате при DEV_GO=1): в альбом — первые n видов острова (у кого их нет), выдать
 * положенное и надеть всё полученное с острова, одежду тоже — чтобы сразу посмотреть сет.
 */
export function devIsleAlbum(profiles: Profiles, p: Profile, n: number): LadderGrant {
  const k = Math.max(0, Math.min(ISLE_TOTAL, Math.floor(n)));
  for (const id of ISLE_SPECIES.slice(0, k)) if (!p.album[id]) p.album[id] = [1000, 1];
  const g = grantLadder(profiles, p);
  let outfit: Outfit = p.outfit;
  for (const id of ISLE_ITEMS) {
    const it = itemById(id);
    if (it && p.owned.includes(id)) outfit = { ...outfit, [it.slot]: it.key };
  }
  if (outfit !== p.outfit) {
    profiles.setOutfit(p, outfit);
    g.outfit = true;
  }
  return g;
}

/** Чат-команда /isle N (только DEV_GO=1, server/lobby/room.ts devCommand): тост, строка в чат и наряд — как у настоящей выдачи */
export function devIsleCommand(hub: Hub, c: Client, n: number, outfitChanged: () => void): boolean {
  const prof = c.profile;
  if (!prof || c.ephemeral) return true;
  if (!hub.isle) {
    hub.privateLine(c, 'Остров «Последний свет» выключен: нужен флаг ISLE (вместе с FISH2=1)');
    return true;
  }
  const g = devIsleAlbum(hub.profiles, prof, n);
  hub.sendMe(c);
  hub.toast(c, g.items.length ? ladderToast(g) : `Остров: ${isleCaught(prof)} из ${ISLE_TOTAL} — новых наград нет`);
  for (const line of ladderAnnounce(prof.nick, g)) hub.announce(line);
  if (g.outfit) outfitChanged();
  return true;
}
