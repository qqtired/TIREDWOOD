// Ферма: Древо разлома на сервере (design-v11 §11, §18.5). Одно на ферму: просыпается в 19:00 МСК, N фермеров
// фиксируется на старте, очки — XP со сбора во время события и шишки-ворчуньи (фазы 2–3, 2 в минуту, ≤ 30 на игрока).
// Расцвело — баффы, репутация, «Последняя капля»; к 01:00 не успели — уходит спать без наград. Время — по серверным
// часам, тикает раз в секунду, пока на ферме кто-то есть (просрочку догоняет в первую же секунду).
import {
  applyBuff, bossPhase, bossRank, bossRewards, bossShare, bossTotal, bossWindow, newBoss, normalizeBoss, type FarmBossState,
} from '../../shared/farmboss.ts';
import {
  BOSS_ACTIVE_WINDOW_MS, BOSS_CONE_POINTS, BOSS_CONES_PER_MIN, BOSS_CONES_PER_PLAYER, BOSS_MIN_SHARE, BOSS_SNEEZE_MS, BUFFS,
  FARM_COUNTERS,
} from '../../shared/farmdata.ts';
import { FARM_LAYOUT } from '../../shared/farmlayout.ts';
import type { FarmClientMsg } from '../../shared/farmnet.ts';
import type { FarmBossResult, FarmBossView } from '../../shared/farmsys.ts';
import { checkFarm } from './achievements.ts';
import { orderEvent } from './orders.ts';
import { sendGot } from './rewards.ts';
import type { FarmCtx, FarmPlayer } from './room.ts';

/** Шишка лежит до подбора, но не дольше 90 с; подобрать — в 2 м (+1 м на сеть) */
const CONE_LIFE_MS = 90_000;
const CONE_RANGE = 3;
/** Пьедестал Древа и костёр: шишки падают между ними (level.md §5) */
const objAt = (id: string): { x: number; z: number } => FARM_LAYOUT.objects.find((o) => o.id === id) ?? { x: 0, z: 0 };
const TREE_AT = objAt('boss');
const FIRE_AT = objAt('campfire');

/** Хранение State.farmBoss и строки в общий чат — их подключает ведущий (room.ts → hub); без них Древо живёт в памяти */
export interface FarmBossStore {
  bossLoad?(): unknown;
  bossSave?(s: FarmBossState | null): void;
  announce?(text: string): void;
}

interface Cone {
  id: number;
  x: number;
  z: number;
  at: number;
}

export class FarmBoss {
  private readonly ctx: FarmCtx & FarmBossStore;
  st: FarmBossState | null;
  private cones: Cone[] = [];
  private coneId = 0;
  private nextCone = 0;
  private nextSneeze = 0;
  private announced = '';
  private dirtyView = true;
  private lastKey = '';

  constructor(ctx: FarmCtx & FarmBossStore) {
    this.ctx = ctx;
    this.st = normalizeBoss(ctx.bossLoad?.());
  }

  /** Идёт событие (для заказов на Древо) */
  awake(now: number): boolean {
    const s = this.st;
    return !!s && s.st === 'awake' && now >= s.start && now < s.end;
  }

  private save(): void {
    this.ctx.bossSave?.(this.st);
    this.ctx.dirty();
  }

  /** Активные фермеры для N: хозяева участков, которые были на ферме за 72 ч до старта, и те, кто здесь сейчас */
  private active(start: number): number {
    const plots = this.ctx.plots;
    return plots.seats.filter((s) => !!s && (plots.isPresent(s.pid) || s.seen >= start - BOSS_ACTIVE_WINDOW_MS)).length;
  }

  tick(now: number): void {
    const w = bossWindow(now);
    if (now >= w.announce && now < w.start && this.announced !== w.day) {
      this.announced = w.day;
      this.ctx.ev(null, { k: 'note', text: '🌳 Через 5 минут Древо разлома проснётся — готовь урожай!' });
      this.ctx.announce?.('🌳 Через 5 минут на ферме проснётся Древо разлома');
      this.dirtyView = true;
    }
    if (now >= w.start && now < w.end && (!this.st || this.st.day !== w.day)) {
      this.st = newBoss(w, this.active(w.start));
      this.cones = [];
      this.nextCone = now;
      this.nextSneeze = now + BOSS_SNEEZE_MS;
      this.ctx.ev(null, { k: 'note', text: '🌳 Древо разлома проснулось! Собирай урожай — каждый XP растит Древо' });
      this.ctx.announce?.(`🌳 На ферме проснулось Древо разлома: нужно ${this.st.hp} цветения`);
      this.save();
      this.dirtyView = true;
    }
    const s = this.st;
    if (s && s.st === 'awake') {
      if (now >= s.end) this.finish(now, false);
      else this.awakeTick(s, now);
    }
    // смена «спит / скоро» тоже меняет вид
    const key = `${w.day}:${now >= w.announce}:${s?.st ?? ''}`;
    if (key !== this.lastKey) { this.lastKey = key; this.dirtyView = true; }
    if (this.dirtyView) {
      this.dirtyView = false;
      for (const p of this.ctx.players()) this.sendView(p, now);
    }
  }

  private awakeTick(s: FarmBossState, now: number): void {
    const before = this.cones.length;
    this.cones = this.cones.filter((c) => now - c.at < CONE_LIFE_MS);
    if (this.cones.length !== before) this.dirtyView = true;
    const phase = bossPhase(s.bloom, s.hp);
    if ((phase === 2 || phase === 3) && now >= this.nextCone) {
      this.nextCone = now + 60_000 / BOSS_CONES_PER_MIN;
      const t = 0.3 + this.ctx.rng() * 0.4;
      const side = (this.ctx.rng() - 0.5) * 7;
      // по отрезку Древо → костёр и вбок от него (перпендикуляр к диагонали)
      const x = TREE_AT.x + (FIRE_AT.x - TREE_AT.x) * t + side * Math.SQRT1_2;
      const z = TREE_AT.z + (FIRE_AT.z - TREE_AT.z) * t + side * Math.SQRT1_2;
      this.cones.push({ id: ++this.coneId, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, at: now });
      this.dirtyView = true;
    }
    if (phase === 2 && now >= this.nextSneeze) {
      this.nextSneeze = now + BOSS_SNEEZE_MS;
      this.ctx.send(null, { t: 'farmBossFx', k: 'sneeze' });
    }
  }

  /** Очки за сбор во время события: 1 XP сбора = 1 очко */
  harvest(p: FarmPlayer, xp: number, now: number): void {
    if (!this.awake(now) || !(xp > 0)) return;
    this.add(p, Math.round(xp), now);
  }

  cone(p: FarmPlayer, m: Extract<FarmClientMsg, { a: 'cone' }>, now: number): void {
    const s = this.st;
    if (!s || !this.awake(now)) { this.ctx.fail(p, 'cone', 'off'); return; }
    const c = this.cones.find((x) => x.id === m.id);
    if (!c) { this.ctx.fail(p, 'cone', 'item'); return; }
    if (Math.hypot(c.x - p.state.x, c.z - p.state.z) > CONE_RANGE) { this.ctx.fail(p, 'cone', 'far'); return; }
    const key = String(p.c.pid);
    if ((s.cones[key] ?? 0) >= BOSS_CONES_PER_PLAYER) { this.ctx.fail(p, 'cone', 'max'); return; }
    this.cones = this.cones.filter((x) => x !== c);
    s.cones[key] = (s.cones[key] ?? 0) + 1;
    this.ctx.send(null, { t: 'farmBossFx', k: 'cone', id: c.id, by: p.c.pid });
    this.add(p, BOSS_CONE_POINTS, now);
  }

  private add(p: FarmPlayer, pts: number, now: number): void {
    const s = this.st!;
    const key = String(p.c.pid);
    const had = bossShare(s, p.c.pid) >= BOSS_MIN_SHARE;
    s.pts[key] = (s.pts[key] ?? 0) + pts;
    s.nicks[key] = p.c.profile?.nick ?? s.nicks[key] ?? '';
    s.bloom = Math.min(s.hp, s.bloom + pts);
    // «Росток для Древа»: вклад ≥ 1 %, пока Древо не спит
    if (!had && bossShare(s, p.c.pid) >= BOSS_MIN_SHARE) orderEvent(this.ctx, p, { k: 'boss' }, now);
    this.dirtyView = true;
    if (s.bloom >= s.hp) {
      s.last = p.c.pid;
      this.finish(now, true);
    } else {
      this.ctx.bossSave?.(s);
    }
  }

  /** Конец события: расцвело (награды) или ушло спать */
  private finish(now: number, bloom: boolean): void {
    const s = this.st!;
    s.st = bloom ? 'bloom' : 'gone';
    this.cones = [];
    if (bloom) s.got = bossRewards(s, () => this.ctx.rng());
    const rank = bossRank(s);
    const nick = (pid: number): string => s.nicks[pid] ?? '';
    for (const [key, g] of Object.entries(s.got)) {
      const pid = Number(key);
      const f = this.ctx.farmOfPid(pid);
      if (!f) continue;
      if (g.buff) applyBuff(f, g.buff, now);
      f.rep += g.rep;
      const C = FARM_COUNTERS;
      if (g.buff) f.counters[C.bossShares] = (f.counters[C.bossShares] ?? 0) + 1;
      if (pid === s.last) f.counters[C.bossDrops] = (f.counters[C.bossDrops] ?? 0) + 1;
      const p = this.ctx.byPid(pid);
      if (!p) continue;
      if (g.buff) orderEvent(this.ctx, p, { k: 'bloom' }, now);
      sendGot(this.ctx, p, { src: 'boss', id: s.day, coins: 0, xp: 0, rep: g.rep, items: g.buff ? [`buff:${g.buff}`] : [] });
      checkFarm(this.ctx, p);
      this.ctx.sendMe(p);
    }
    const top = rank.slice(0, 5).map((r) => ({ pid: r.pid, nick: nick(r.pid), share: bossShare(s, r.pid) }));
    for (const p of this.ctx.players()) {
      const place = rank.findIndex((r) => r.pid === p.c.pid) + 1;
      const g = s.got[p.c.pid];
      const r: FarmBossResult = {
        bloom, last: bloom && s.last ? { pid: s.last, nick: nick(s.last) } : null, top,
        mine: { share: bossShare(s, p.c.pid), place, buff: g?.buff ?? null, rep: g?.rep ?? 0 },
      };
      this.ctx.send(p, { t: 'farmBossEnd', r });
    }
    if (bloom) {
      const best = top.slice(0, 3).map((r) => `${r.nick} ${Math.round(r.share * 100)} %`).join(', ');
      this.ctx.announce?.(`🌳 Древо расцвело! Последнюю каплю добавил ${nick(s.last)}. Лучший вклад: ${best}`);
      this.ctx.ev(null, { k: 'note', text: `🌳 Древо расцвело! Бафф на сутки: ${Object.values(BUFFS).map((b) => b.name).join(' / ')}` });
    } else {
      this.ctx.announce?.('🌳 Древо разлома зевнуло и ушло спать — завтра в 19:00 ещё попытка');
    }
    this.dirtyView = true;
    this.save();
  }

  view(p: FarmPlayer, now: number): FarmBossView {
    const w = bossWindow(now);
    const s = this.st && this.st.day === w.day ? this.st : null;
    const rank = s ? bossRank(s) : [];
    const place = rank.findIndex((r) => r.pid === p.c.pid) + 1;
    return {
      st: s ? s.st : now >= w.announce ? 'soon' : 'sleep',
      start: s?.start ?? w.start, end: s?.end ?? w.end, hp: s?.hp ?? 0, bloom: s?.bloom ?? 0, phase: s ? bossPhase(s.bloom, s.hp) : 1,
      n: s?.n ?? 0, top: rank.slice(0, 5).map((r) => ({ pid: r.pid, nick: s!.nicks[r.pid] ?? '', pts: r.pts })),
      mine: s?.pts[p.c.pid] ?? 0, place, cones: s && s.st === 'awake' ? this.cones.map(({ id, x, z }) => ({ id, x, z })) : [],
    };
  }

  sendView(p: FarmPlayer, now: number): void {
    this.ctx.send(p, { t: 'farmBoss', b: this.view(p, now) });
  }

  /** Для отладки и тестов: общий счёт события */
  total(): number {
    return this.st ? bossTotal(this.st) : 0;
  }
}
