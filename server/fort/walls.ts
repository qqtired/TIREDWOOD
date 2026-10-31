// Ф50: прочность участков, совместный ремонт и штабели камней. Числа и сообщения — shared/fort50.ts.
import { TICK_RATE } from '../../shared/constants.ts';
import { FT_BREAK, FT_END, FT_GATHER, FT_WAVE } from '../../shared/fort.ts';
import { NOPE_GOLD } from '../../shared/fortarsenal.ts';
import {
  type F50State, holeCenter, STONE_FALL_TICKS, STONE_GAP_TICKS, STONE_OUT, STONE_REACH, STONES_PER_STACK,
  USE_STONE, USE_WALL_FIX, USE_WALL_STOP, WALL_COUNT, WALL_FIX_ADD, WALL_FIX_BELOW, WALL_FIX_MOVE, WALL_FIX_REACH,
  WALL_PATCH, WALL_SECTIONS, wallFixPrice, wallFixTicks, wallMaxHp, wallStage,
} from '../../shared/fort50.ts';
import { WALL_H } from '../../shared/fortmap.ts';
import type { FortGame, FortPlayer } from './game.ts';
import { rectDist } from './nav.ts';
import { addRankCount } from './ranks.ts';

interface Worker { pid: number; x: number; y: number; z: number; hurt: number }
interface Repair { sec: number; payer: number; price: number; progress: number; workers: Map<number, Worker> }
interface FallingStone { sec: number; by: number; at: number }

export class Walls {
  readonly hp = WALL_SECTIONS.map((_, sec) => wallMaxHp(sec, 1));
  readonly max = [...this.hp];
  readonly stones = WALL_SECTIONS.map(() => STONES_PER_STACK);
  private readonly repairs = new Map<number, Repair>();
  private readonly stoneReady = WALL_SECTIONS.map(() => -Infinity);
  private readonly hitSent = WALL_SECTIONS.map(() => -Infinity);
  private readonly falling: FallingStone[] = [];
  private dirty = true;
  private sentTick = -Infinity;
  private readonly game: FortGame;

  constructor(game: FortGame) { this.game = game; }

  /** Лагерь меняется вместе со стенами в том же ограниченном по частоте сообщении. */
  touch(): void { this.dirty = true; }

  weakest(sections: readonly number[]): number {
    let best = -1;
    for (const sec of sections) if (this.hp[sec] > 0
      && (best < 0 || this.hp[sec] / this.max[sec] < this.hp[best] / this.max[best])) best = sec;
    return best;
  }

  reset(): void {
    this.repairs.clear();
    this.falling.length = 0;
    for (let sec = 0; sec < WALL_COUNT; sec++) {
      this.hp[sec] = this.max[sec] = wallMaxHp(sec, 1);
      this.stones[sec] = STONES_PER_STACK;
      this.stoneReady[sec] = this.hitSent[sec] = -Infinity;
      this.enable(sec, true);
    }
    this.game.horde.updateField(0);
    this.dirty = true;
  }

  startWave(wave: number): void {
    for (let sec = 0; sec < WALL_COUNT; sec++) {
      const max = wallMaxHp(sec, wave);
      this.hp[sec] = this.hp[sec] / this.max[sec] * max;
      this.max[sec] = max;
    }
    this.dirty = true;
  }

  refill(): void {
    for (let sec = 0; sec < WALL_COUNT; sec++) this.stones[sec] = this.hp[sec] > 0 ? STONES_PER_STACK : 0;
    this.dirty = true;
  }

  cancelRepairs(): void {
    if (this.repairs.size) { this.repairs.clear(); this.dirty = true; }
  }

  removePlayer(pid: number): void {
    this.stop(pid);
    for (const stone of this.falling) if (stone.by === pid) stone.by = 0;
  }

  private enable(sec: number, enabled: boolean): void {
    for (const box of this.game.map.sections?.[sec] ?? []) this.game.world.setEnabled(box, enabled);
  }

  private refreshPath(): void {
    let mask = 0;
    for (let sec = 0; sec < WALL_COUNT; sec++) if (this.hp[sec] <= 0 && WALL_SECTIONS[sec].kind === 'passage') mask |= 1 << sec;
    this.game.horde.updateField(mask);
  }

  private setHp(sec: number, hp: number, by = 0): void {
    const previous = this.hp[sec];
    const stage = wallStage(previous, this.max[sec]);
    this.hp[sec] = Math.max(0, Math.min(this.max[sec], hp));
    if ((previous > 0) !== (this.hp[sec] > 0)) {
      this.enable(sec, this.hp[sec] > 0);
      this.refreshPath();
      if (!this.hp[sec]) {
        this.stones[sec] = 0;
        const s = WALL_SECTIONS[sec];
        this.game.systemChat(`🧱 ${s.kind === 'passage' ? 'Пролом' : 'Обвал'}: ${s.name}!`);
      }
    }
    const next = wallStage(this.hp[sec], this.max[sec]);
    if (stage !== next || by) this.game.event(['wstage', sec, next, by]);
    this.dirty = true;
  }

  /** Отладка использует тот же путь коллизий и стадий, что удар / ремонт. */
  setPercent(sec: number, percent: number): void {
    if (!Number.isInteger(sec) || sec < 0 || sec >= WALL_COUNT || !Number.isFinite(percent)) return;
    this.setHp(sec, this.max[sec] * Math.max(0, Math.min(100, percent)) / 100);
  }

  hit(sec: number, dmg: number, x: number, y: number, z: number): void {
    if (!this.game.fort50Enabled || !Number.isInteger(sec) || !(this.hp[sec] > 0) || !(dmg > 0) || !Number.isFinite(dmg)) return;
    if (this.game.tick - this.hitSent[sec] >= Math.ceil(0.35 * TICK_RATE)) {
      this.hitSent[sec] = this.game.tick;
      this.game.event(['whit', sec, x, y, z]);
    }
    this.setHp(sec, this.hp[sec] - this.game.structureDamage(dmg));
  }

  hitAt(x: number, z: number, r: number, dmg: number, max = 1): void {
    const near = WALL_SECTIONS.map((s, sec) => ({ sec, d: rectDist(x, z, s.span[0], s.span[2], s.span[1], s.span[3]) }))
      .filter((s) => s.d < r && this.hp[s.sec] > 0).sort((a, b) => a.d - b.d || a.sec - b.sec);
    for (const s of near.slice(0, Math.max(0, Math.floor(max)))) this.hit(s.sec, dmg, x, 1.2, z);
  }

  use(p: FortPlayer, id: number): boolean {
    if (id === USE_WALL_STOP) { this.stop(p.id); return true; }
    if (id >= USE_WALL_FIX && id < USE_WALL_FIX + WALL_COUNT) { this.fix(p, id - USE_WALL_FIX); return true; }
    if (id >= USE_STONE && id < USE_STONE + WALL_COUNT) { this.dropStone(p, id - USE_STONE); return true; }
    return false;
  }

  private inReach(p: FortPlayer, sec: number): boolean {
    const c = holeCenter(sec);
    return p.state.y <= WALL_H + 1.2 && Math.hypot(p.state.x - c.x, p.state.z - c.z) <= WALL_FIX_REACH;
  }

  private fix(p: FortPlayer, sec: number): void {
    const g = this.game;
    if (!p.alive || g.phase === FT_END) return;
    if (!this.inReach(p, sec)) return g.toast(p, 'Подойди к пролому');
    if (this.hp[sec] >= this.max[sec] * WALL_FIX_BELOW) return g.toast(p, 'Участок цел');
    const existing = this.repairs.get(sec);
    if (existing?.workers.has(p.id)) return;
    const price = existing?.price ?? wallFixPrice(g.phase === FT_BREAK ? g.wave + 1 : g.wave);
    if (!existing && p.run.arsenal.gold < price) { g.event(['anope', p.id, USE_WALL_FIX + sec, NOPE_GOLD]); return; }
    this.stop(p.id);
    if (g.phase === FT_GATHER || g.phase === FT_BREAK) { this.complete(p, sec, price); return; }
    const repair = existing ?? { sec, payer: p.id, price, progress: 0, workers: new Map<number, Worker>() };
    repair.workers.set(p.id, { pid: p.id, x: p.state.x, y: p.state.y, z: p.state.z, hurt: p.hurtTick });
    this.repairs.set(sec, repair);
    this.dirty = true;
  }

  stop(pid: number): void {
    for (const [sec, repair] of this.repairs) {
      if (repair.payer === pid) { this.repairs.delete(sec); this.dirty = true; }
      else if (repair.workers.delete(pid)) this.dirty = true;
    }
  }

  private complete(p: FortPlayer, sec: number, price: number): void {
    if (p.run.arsenal.gold < price) { this.game.event(['anope', p.id, USE_WALL_FIX + sec, NOPE_GOLD]); return; }
    p.run.arsenal.gold -= price;
    const breach = this.hp[sec] <= 0;
    this.setHp(sec, breach ? this.max[sec] * WALL_PATCH : this.hp[sec] + this.max[sec] * WALL_FIX_ADD, p.id);
    this.game.systemChat(`🧱 ${p.name} ${breach ? 'заделал пролом' : 'подлатал'}: ${WALL_SECTIONS[sec].name}`);
    this.game.flushRoster();
  }

  private dropStone(p: FortPlayer, sec: number): void {
    const g = this.game;
    const [x, y, z] = WALL_SECTIONS[sec].stack;
    if (!p.alive || g.phase === FT_END || this.hp[sec] <= 0 || this.stones[sec] <= 0 || g.tick < this.stoneReady[sec]
      || Math.hypot(p.state.x - x, p.state.z - z) > STONE_REACH || Math.abs(p.state.y - y) > 1.2) return;
    this.stones[sec]--;
    this.stoneReady[sec] = g.tick + STONE_GAP_TICKS;
    this.falling.push({ sec, by: p.id, at: g.tick + STONE_FALL_TICKS });
    this.dirty = true;
  }

  step(): void {
    const g = this.game;
    if (g.phase === FT_END) { this.cancelRepairs(); this.falling.length = 0; return; }
    for (const [sec, repair] of this.repairs) {
      for (const worker of repair.workers.values()) {
        const p = g.players.get(worker.pid);
        if (!p?.alive || g.phase !== FT_WAVE || p.hurtTick !== worker.hurt || p.firingUntil > g.tick || !this.inReach(p, sec)
          || Math.hypot(p.state.x - worker.x, p.state.y - worker.y, p.state.z - worker.z) > WALL_FIX_MOVE) this.stop(worker.pid);
      }
      if (!this.repairs.has(sec)) continue;
      repair.progress += 1000 / wallFixTicks(repair.workers.size);
      this.dirty = true;
      if (repair.progress < 1000 - 1e-7) continue;
      this.repairs.delete(sec);
      // звание «Ремонтник» (Ф-3): заделанный участок — каждому, кто чинил
      if (g.ranksEnabled) for (const id of repair.workers.keys()) { const w = g.players.get(id); if (w) addRankCount(w.run, 'fix'); }
      const payer = g.players.get(repair.payer);
      if (payer) this.complete(payer, sec, repair.price);
    }
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const stone = this.falling[i];
      if (g.tick < stone.at) continue;
      const s = WALL_SECTIONS[stone.sec];
      const x = s.nx ? s.face + s.nx * STONE_OUT / 2 : s.stack[0];
      const z = s.nz ? s.face + s.nz * STONE_OUT / 2 : s.stack[2];
      const killed = g.horde.stoneHit(stone.sec, stone.by);
      g.event(['stone', stone.sec, stone.by, x, z, killed]);
      this.falling.splice(i, 1);
    }
  }

  state(): F50State {
    return {
      hp: this.hp.map((hp) => hp > 0 ? Math.max(1, Math.round(hp)) : 0), max: this.max.map(Math.round), stones: [...this.stones], camp: this.game.camp.state(),
      fix: [...this.repairs.values()].map((r) => [r.sec, Math.floor(r.progress),
        this.game.tick + Math.ceil((1000 - r.progress) * wallFixTicks(r.workers.size) / 1000), r.price, r.payer, ...r.workers.keys()]),
    };
  }

  flush(): void {
    if (!this.dirty || this.game.tick - this.sentTick < 6) return;
    this.game.broadcast({ t: 'f50', ...this.state() });
    this.dirty = false;
    this.sentTick = this.game.tick;
  }
}
