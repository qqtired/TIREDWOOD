// Золотой краб — в общем пуле для снимка и перемотки, вне счёта и поведения врагов.
import { TICK_RATE } from '../../shared/constants.ts';
import { F50_BOSSES, F50_LAST_WAVE, f50Wave } from '../../shared/fort50.ts';
import { CRAB_DELAY_S, CRAB_HITS, CRAB_JACKPOT, CRAB_RUN_S, crabGold, Z_GOLDCRAB, ZS_CRAB_DIVE } from '../../shared/fortideas.ts';
import { ZS_WALK } from '../../shared/fort.ts';
import { hash32, makeRng } from '../../shared/math.ts';
import type { FortGame } from './game.ts';
import type { Zombie } from './horde.ts';

export function crabWaves(seed: number): number[] {
  const rng = makeRng(hash32(seed, 0xc4ab));
  const waves: number[] = [];
  for (let first = 1; first <= F50_LAST_WAVE; first += 5) {
    const candidates = Array.from({ length: 5 }, (_, i) => first + i)
      .filter((w) => w !== 1 && !F50_BOSSES[w] && !f50Wave(w).event);
    waves.push(candidates[Math.floor(rng() * candidates.length)]);
  }
  return waves;
}

export class GoldCrab {
  waves: number[] = [];
  private pending = -1;
  private active: { zombie: Zombie; id: number; start: number; side: number; hits: number; gold: number } | null = null;
  private readonly game: FortGame;
  constructor(game: FortGame) { this.game = game; }

  reset(): void {
    this.stop();
    this.waves = crabWaves(this.game.seed);
  }

  stop(): void {
    if (this.active?.zombie.alive && this.active.zombie.id === this.active.id) this.game.horde.remove(this.active.zombie);
    this.active = null;
    this.pending = -1;
  }

  startWave(): void {
    if (this.waves.includes(this.game.wave)) this.pending = this.game.tick + CRAB_DELAY_S * TICK_RATE;
  }

  spawn(): void {
    const g = this.game;
    if (!g.ideasEnabled) return;
    if (this.active) this.stop();
    const z = g.horde.spawn(Z_GOLDCRAB, 1);
    if (!z) { this.pending = g.tick + 1; return; }
    const side = makeRng(hash32(g.seed, g.wave ^ 0xc4ab51))() < .5 ? -1 : 1;
    // 70 м: за бастионами (до x=21) и наружными лестницами (до x=22.4), к кромке моря z=24.
    Object.assign(z, { x: side * 25, y: 0, z: -45, yaw: Math.PI, state: ZS_WALK, vx: 0, vz: 70 / CRAB_RUN_S });
    this.active = { zombie: z, id: z.id, start: g.tick, side, hits: 0, gold: crabGold(g.wave, g.goldMul) };
    this.pending = -1;
    g.event(['crab', 'run', z.id]);
  }

  step(): void {
    const g = this.game;
    if (this.pending >= 0 && g.tick >= this.pending) this.spawn();
    const a = this.active;
    if (!a) return;
    const z = a.zombie;
    if (!z.alive || z.id !== a.id) { this.active = null; return; }
    const age = g.tick - a.start, total = CRAB_RUN_S * TICK_RATE;
    z.x = a.side * 25;
    z.z = -45 + 70 * Math.min(1, age / total);
    if (age >= total - TICK_RATE) {
      z.state = ZS_CRAB_DIVE;
      z.y = -.8 * (age - total + TICK_RATE) / TICK_RATE;
    }
    if (age >= total) {
      g.event(['crab', 'gone', z.id]);
      g.horde.remove(z); this.active = null;
    }
  }

  /** Вызывается один раз на цель за выстрел, после суммирования дроби. */
  hit(z: Zombie): void {
    const a = this.active, g = this.game;
    if (!a || a.zombie !== z || a.id !== z.id || !z.alive) return;
    a.hits++;
    let gold = a.gold;
    for (const p of g.players.values()) gold = g.arsenal.credit(p.run.arsenal, a.gold);
    g.event(['crabgold', z.id, gold, a.hits]);
    if (a.hits >= CRAB_HITS) {
      for (const p of g.players.values()) g.arsenal.giveGold(p, a.gold * CRAB_JACKPOT, z.x, z.y + .5, z.z);
      g.event(['crab', 'caught', z.id]);
      g.event(['zdie', z.id, 0, z.x, z.y, z.z, z.kind, z.tier]);
      g.horde.remove(z); this.active = null;
    }
    g.touchRoster();
  }
}
