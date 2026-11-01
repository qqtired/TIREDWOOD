// Состояние идей на забег. Цены, попадания и урон применяют существующие подсистемы крепости.
import { TICK_RATE } from '../../shared/constants.ts';
import { FORT_HP, FT_BREAK, FT_END, FT_GATHER, isBossKind, type FortEvent } from '../../shared/fort.ts';
import { f50Boss } from '../../shared/fort50.ts';
import {
  CARDS, CARD_VOTE_S, CRAFT_NONE, CRAFT_MASON, CRAFT_GUNNER, CRAFT_SAPPER, CRAFT_RIFLE, CRAFTS,
  FULL_CREW_GOLD, RACK, RACK_REACH, SLOW_GAP_S, SLOW_RATE, SLOW_S, TRAMP_REACH, TRAMP_SPOTS,
  USE_CARD, USE_CRAFT, USE_TRAMP, trampPrice, type FortIdeasMsg,
} from '../../shared/fortideas.ts';
import { NOPE_CRAFT_PHASE, NOPE_FAR, NOPE_GOLD, NOPE_LOCKED } from '../../shared/fortarsenal.ts';
import { syncFortTramps } from '../../shared/fortmap.ts';
import { hash32, makeRng } from '../../shared/math.ts';
import type { FortGame, FortPlayer } from './game.ts';
import type { Zombie } from './horde.ts';
import { GoldCrab } from './crab.ts';

export class FortIdeas {
  readonly taken: string[] = [];
  tramps = 0;
  vote: { ids: string[]; by: Map<number, number>; end: number; rng: () => number } | null = null;
  readonly crab: GoldCrab;
  slowUntil = 0;
  slowReadyAt = 0;
  private fraction = 0;
  private paused = 0;
  private readonly clockHistory = new Map<number, number>();
  private readonly game: FortGame;
  constructor(game: FortGame) { this.game = game; this.crab = new GoldCrab(game); }

  get enabled(): boolean { return this.game.ideasEnabled || this.game.eliteEnabled; }
  has(card: string): boolean { return this.game.ideasEnabled && this.taken.includes(card); }
  craft(p: FortPlayer): number { return this.game.ideasEnabled ? p.run.craft ?? CRAFT_NONE : CRAFT_NONE; }
  crew(craft: number): boolean { return [...this.game.players.values()].some((p) => this.craft(p) === craft); }
  get full(): boolean { return this.game.ideasEnabled && CRAFTS.every((c) => this.crew(c.id)); }
  get goldMul(): number { return this.full ? FULL_CREW_GOLD : 1; }
  repairMul(p: FortPlayer): number { return (this.craft(p) === CRAFT_MASON ? .7 : 1) * (this.has('repair') ? .7 : 1); }
  repairTime(p: FortPlayer): number { return this.craft(p) === CRAFT_MASON ? .6 : 1; }
  towerPrice(p: FortPlayer): number { return this.craft(p) === CRAFT_GUNNER ? .85 : 1; }
  get towerDamage(): number { return (this.crew(CRAFT_GUNNER) ? 1.15 : 1) * (this.has('goldtowers') ? 1.5 : 1); }
  grenadeExtra(p: FortPlayer): number { return (this.craft(p) === CRAFT_SAPPER ? 1 : 0) + (this.has('grenadebox') ? 2 : 0); }
  grenadeRadius(p: FortPlayer): number { return this.craft(p) === CRAFT_SAPPER ? 1.25 : 1; }
  critBonus(p: FortPlayer): number { return this.craft(p) === CRAFT_RIFLE ? .1 : 0; }

  outfit(p: FortPlayer): void {
    const def = this.game.phase !== FT_END ? CRAFTS.find((c) => c.id === this.craft(p)) : undefined;
    p.outfit = def ? { ...p.originalOutfit, h: def.hat } : p.originalOutfit;
    this.game.touchRoster();
  }

  state(pid: number): FortIdeasMsg {
    const vote = this.vote;
    const votes = vote ? vote.ids.map((_, i) => [...vote.by.values()].filter((v) => v === i).length) : [];
    return { t: 'fideas', ideas: this.game.ideasEnabled, elite: this.game.eliteEnabled,
      crafts: [...this.game.players.values()].flatMap((p) => this.craft(p) ? [[p.id, this.craft(p)] as [number, number]] : []),
      full: this.full, tramps: this.tramps, taken: [...this.taken],
      vote: vote ? { ids: [...vote.ids], votes, mine: vote.by.get(pid) ?? -1, end: vote.end } : null };
  }

  send(): void {
    if (this.enabled) for (const p of this.game.players.values()) p.sink.sendJson(this.state(p.id));
  }

  membersChanged(left?: number): void {
    if (left !== undefined) this.vote?.by.delete(left);
    this.resolveVote();
    this.send();
  }

  reset(): void {
    this.taken.length = 0; this.tramps = 0; this.vote = null;
    this.slowUntil = this.slowReadyAt = this.paused = this.fraction = 0;
    this.clockHistory.clear();
    syncFortTramps(this.game.world, this.game.map);
    if (this.game.ideasEnabled) this.crab.reset();
  }

  finish(): void {
    this.vote = null; this.crab.stop(); this.slowUntil = 0;
    for (const p of this.game.players.values()) { delete p.run.craft; this.outfit(p); }
    this.send();
  }

  use(p: FortPlayer, id: number): boolean {
    if (!this.game.ideasEnabled) return false;
    const g = this.game;
    if (id >= USE_CARD && id < USE_CARD + 3) {
      if (this.vote && g.phase === FT_BREAK && g.tick < this.vote.end && id - USE_CARD < this.vote.ids.length) {
        this.vote.by.set(p.id, id - USE_CARD);
        this.resolveVote(); this.send();
      }
      return true;
    }
    const isCraft = id >= USE_CRAFT && id <= USE_CRAFT + CRAFTS.length;
    const spot = id - USE_TRAMP;
    if (!isCraft && !(spot >= 0 && spot < TRAMP_SPOTS.length)) return false;
    const nope = (code: number) => g.event(['anope', p.id, id, code]);
    if (g.phase !== FT_GATHER && g.phase !== FT_BREAK) { nope(isCraft ? NOPE_CRAFT_PHASE : NOPE_LOCKED); return true; }
    const at = isCraft ? RACK : TRAMP_SPOTS[spot], reach = isCraft ? RACK_REACH : TRAMP_REACH;
    if (Math.abs(p.state.y) > .6 || Math.hypot(p.state.x - at.x, p.state.z - at.z) >= reach) { nope(NOPE_FAR); return true; }
    if (isCraft) {
      p.run.craft = id - USE_CRAFT;
      p.run.arsenal.gr = Math.min(p.run.arsenal.gr, g.arsenal.grenadeMax(p));
      this.outfit(p); g.event(['craft', p.id, this.craft(p)]);
    } else {
      if (this.tramps & (1 << spot)) { nope(NOPE_LOCKED); return true; }
      const price = trampPrice(g.wave);
      if (p.run.arsenal.gold < price) { nope(NOPE_GOLD); return true; }
      p.run.arsenal.gold -= price;
      this.tramps |= 1 << spot; syncFortTramps(g.world, g.map, this.tramps);
      g.event(['tramp', spot, p.id]);
    }
    this.send(); g.flushRoster(); return true;
  }

  startVote(): void {
    const g = this.game, boss = f50Boss(g.wave);
    if (!g.ideasEnabled || !boss || boss.final) return;
    const rng = makeRng(hash32(g.seed, g.wave ^ 0xca4d));
    const choose = (gold: boolean, count: number): string[] => {
      const pool = CARDS.filter((c) => c.gold === gold && !this.taken.includes(c.id)).map((c) => c.id);
      const ids: string[] = [];
      while (pool.length && ids.length < count) ids.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
      return ids;
    };
    const gold = g.wave % 10 === 0 ? choose(true, 1) : [];
    const ids = [...choose(false, 3 - gold.length), ...gold];
    // обычных не хватило (поздние боссы) — добираем оставшимися золотыми
    if (ids.length < 3) ids.push(...choose(true, 3).filter((id) => !ids.includes(id)).slice(0, 3 - ids.length));
    if (!ids.length) return;
    this.vote = { ids, by: new Map(), end: g.tick + CARD_VOTE_S * TICK_RATE, rng };
    const end = Math.max(g.phaseEnd, this.vote.end + 3 * TICK_RATE);
    if (end !== g.phaseEnd) {
      g.phaseEnd = end;
      g.broadcast({ t: 'fphase', phase: g.phase, end, wave: g.wave, ...(g.card ? { card: g.card } : {}) });
    }
    this.send();
  }

  private resolveVote(): void {
    const v = this.vote, g = this.game;
    if (!v || (g.tick < v.end && (!g.players.size || [...g.players.keys()].some((id) => !v.by.has(id))))) return;
    const counts = v.ids.map((_, i) => [...v.by.values()].filter((value) => value === i).length);
    const max = Math.max(...counts), leaders = counts.flatMap((n, i) => n === max ? [i] : []);
    this.vote = null;
    this.take(v.ids[leaders[Math.floor(v.rng() * leaders.length)]]);
    g.finishReadiness();
  }

  /** Применение выбранной карточки, включая немедленные эффекты. */
  take(id: string): void {
    const g = this.game;
    if (!g.ideasEnabled || this.taken.includes(id) || !CARDS.some((c) => c.id === id)) return;
    const oldCrystal = g.arsenal.crystalMax;
    this.taken.push(id);
    if (id === 'crystal') g.crystal += g.arsenal.crystalMax - oldCrystal;
    if (id === 'stonewalls') g.walls.stonewalls();
    if (id === 'grenadebox') for (const p of g.players.values()) {
      p.run.arsenal.gr = g.arsenal.grenadeMax(p); g.event(['grens', p.id, p.run.arsenal.gr]);
    }
    if (id === 'mag' || id === 'squall') for (const p of g.players.values()) g.arsenal.rearm(p);
    g.event(['card', id]); this.send(); g.flushRoster();
  }

  startWave(): void {
    if (!this.game.ideasEnabled) return;
    if (this.has('bandage')) for (const p of this.game.players.values()) if (p.alive) p.hp = Math.min(FORT_HP, p.hp + FORT_HP * .5);
    this.crab.startWave();
  }

  killed(z: Zombie): void {
    const g = this.game;
    if (!g.ideasEnabled || (!isBossKind(z.kind) && z.tier !== 2) || g.tick < this.slowReadyAt) return;
    this.slowUntil = g.tick + SLOW_S * TICK_RATE;
    this.slowReadyAt = g.tick + SLOW_GAP_S * TICK_RATE;
    this.fraction = 0;
    g.event(['slow', this.slowUntil]);
  }

  get enemyTick(): number { return this.game.tick - this.paused; }
  enemyStep(): boolean {
    if (!this.game.ideasEnabled) return true;
    let step = true;
    if (this.game.ideasEnabled && this.game.tick <= this.slowUntil && this.slowUntil > 0) {
      this.fraction += SLOW_RATE;
      step = this.fraction >= 1 - 1e-9;
      if (step) this.fraction -= 1;
      else this.paused++;
    }
    this.clockHistory.set(this.game.tick, this.enemyTick);
    this.clockHistory.delete(this.game.tick - 64);
    return step;
  }

  rewindTick(real: number): number {
    const at = Math.floor(real), f = real - at;
    const a = this.clockHistory.get(at) ?? at - this.paused;
    return a + f * ((this.clockHistory.get(at + 1) ?? a + 1) - a);
  }

  /** Тики врагов во внешнем событии переводим обратно в общие тики сервера. */
  realTick(enemy: number): number {
    const d = enemy - this.enemyTick;
    if (d <= 0) {
      for (const [real, tick] of this.clockHistory) if (tick === enemy) return real;
      return this.game.tick + d;
    }
    const left = Math.max(0, this.slowUntil - this.game.tick);
    const steps = Math.floor(left * SLOW_RATE + this.fraction + 1e-9);
    return this.game.tick + (d <= steps ? Math.ceil((d - this.fraction) / SLOW_RATE) : left + d - steps);
  }

  enemyEvent(event: FortEvent): FortEvent {
    if (!this.game.ideasEnabled) return event;
    const e = [...event] as FortEvent;
    if (e[0] === 'warn') e[7] = this.realTick(e[7]);
    else if (e[0] === 'siegephase') { e[4] = this.realTick(e[4]); e[5] = this.realTick(e[5]); }
    else if (e[0] === 'meteor') { e[9] = this.realTick(e[9]); e[10] = this.realTick(e[10]); }
    else if (e[0] === 'siegepool' && e[6] > 0) e[6] = this.realTick(e[6]);
    else if (e[0] === 'throw') e[7] = this.realTick(this.enemyTick + e[7]) - this.game.tick;
    else if (e[0] === 'cata') { e[2] = this.realTick(e[2]); e[3] = this.realTick(e[3]); }
    return e;
  }

  step(): void {
    if (!this.game.ideasEnabled) return;
    this.resolveVote();
    if (this.game.phase !== FT_END) this.crab.step();
  }
}
