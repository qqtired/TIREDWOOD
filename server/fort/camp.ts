// К-4: лагерь по главам, его стражи, поджог и катапульта. Состояние отправляет общий Walls.flush.
import { FT_END, FT_WAVE, type FortEvent } from '../../shared/fort.ts';
import {
  CAMP_BURN_R, CAMP_BURN_TICKS, CAMP_CHEST_SUPPLIES, CAMP_GUARDS, CAMP_HOME_R, CAMP_SPOTS, CAMP_WAVES,
  CATA_EVERY, CATA_FIRST, CATA_FLIGHT, CATA_PLAYER_DMG, CATA_PLAYER_R, CATA_WINDUP,
  USE_CAMP_BURN, USE_CAMP_STOP, WALL_DMG, WALL_FIX_MOVE, WALL_SECTIONS,
  campGuards, campSide, campStage, campUntil, wallOuterPoint, type F50Camp,
} from '../../shared/fort50.ts';
import { WALL_H, outsideFort } from '../../shared/fortmap.ts';
import { supplyGold, waveDmgMul } from '../../shared/fortwaves.ts';
import type { FortGame, FortPlayer } from './game.ts';

type Shot = Extract<FortEvent, ['cata', ...number[]]>;
interface BurnStart { x: number; y: number; z: number; hurt: number }

export class Camp {
  private readonly game: FortGame;
  private current: F50Camp | null = null;
  private readonly burnt = new Set<number>();
  private burnStart: BurnStart | null = null;
  private shot: Shot | null = null;
  private nextShot = 0;

  constructor(game: FortGame) { this.game = game; }

  state(): F50Camp | null {
    const camp = this.current;
    return camp ? { ...camp, guards: this.game.horde.guards, ...(camp.burn ? { burn: [...camp.burn] as [number, number] } : {}) } : null;
  }

  reset(): void { this.remove(); this.burnt.clear(); }

  private remove(): void {
    this.cancelShot();
    if (!this.current) return;
    this.stopBurn();
    for (const z of this.game.horde.zombies) if (z.alive && z.guard) this.game.horde.remove(z);
    this.current = null;
    this.game.event(['camp', 3, 0, 0]);
    this.game.walls.touch();
  }

  private place(placed: number, side: number, stage: number): void {
    const [x, z] = CAMP_SPOTS[side < 0 ? 0 : 1];
    this.current = { placed, until: campUntil(placed), side, x, z, stage, burnt: false, guards: 0 };
    this.game.event(['camp', 0, side, 0]);
    this.game.systemChat(`⛺ Барон ставит лагерь на ${side < 0 ? 'западном' : 'восточном'} лугу — за три волны соберёт катапульту. Вылазка: E у лагеря — поджечь`);
    if (stage === 3) this.ready();
    this.game.walls.touch();
  }

  private ready(): void { this.game.systemChat('⚠ Катапульта Барона готова — бьёт по стенам!'); }

  startWave(w: number): void {
    this.cancelShot();
    const placed = CAMP_WAVES.reduce((best, wave) => wave <= w && campUntil(wave) >= w ? Math.max(best, wave) : best, 0);
    if (this.current && this.current.placed !== placed) this.remove();
    if (!placed) return;
    if (!this.current) {
      if (this.burnt.has(placed)) return;
      this.place(placed, campSide(placed), campStage(placed, w));
    } else this.setStage(campStage(placed, w));
    this.reinforce();
    this.nextShot = this.game.tick + CATA_FIRST;
  }

  private setStage(stage: number): void {
    const camp = this.current;
    if (!camp || camp.stage === stage) return;
    const grew = stage > camp.stage;
    camp.stage = stage;
    if (grew) {
      this.game.event(['camp', 1, stage, 0]);
      if (stage === 3 && !camp.burnt) this.ready();
    }
    this.game.walls.touch();
  }

  private reinforce(): void {
    const camp = this.current, g = this.game;
    if (!camp || camp.burnt) return;
    const count = campGuards(g.horde.defenders);
    for (let slot = 0; slot < count; slot++) {
      if (g.horde.guards >= count) break;
      if (g.horde.zombies.some((z) => z.alive && z.guard && z.guardHome?.slot === slot)) continue;
      const z = g.horde.spawn(CAMP_GUARDS[slot], camp.side < 0 ? 0 : 2, g.horde.defenders, 0);
      if (!z) break;
      const angle = slot * 2 * Math.PI / count;
      z.guard = true;
      z.x = camp.x + Math.cos(angle) * CAMP_HOME_R;
      z.z = camp.z + Math.sin(angle) * CAMP_HOME_R;
      z.y = 0;
      z.wallSec = -1;
      z.guardHome = { x: z.x, z: z.z, cx: camp.x, cz: camp.z, slot };
    }
    this.updateGuards();
  }

  private updateGuards(): void {
    if (!this.current || this.current.guards === this.game.horde.guards) return;
    this.current.guards = this.game.horde.guards;
    this.game.walls.touch();
  }

  endWave(): void {
    this.cancelShot();
    if (this.current && this.game.wave >= this.current.until) this.remove();
  }

  cancelShot(): void { this.shot = null; }

  use(p: FortPlayer, id: number): boolean {
    if (id === USE_CAMP_STOP) { this.stopBurn(p.id); return true; }
    if (id !== USE_CAMP_BURN) return false;
    const g = this.game, camp = this.current;
    if (!p.alive || g.phase === FT_END || !camp || camp.burnt) return true;
    if (!outsideFort(p.state.x, p.state.y, p.state.z)) {
      g.toast(p, 'Лагерь поджигают снаружи — выйди за стены');
    } else if (Math.hypot(p.state.x - camp.x, p.state.z - camp.z) >= CAMP_BURN_R) {
      g.toast(p, 'Подойди к лагерю');
    } else if (camp.burn) {
      if (camp.burn[0] !== p.id) g.toast(p, 'Уже поджигают');
    } else {
      camp.burn = [p.id, g.tick + CAMP_BURN_TICKS];
      this.burnStart = { x: p.state.x, y: p.state.y, z: p.state.z, hurt: p.hurtTick };
      g.event(['camp', 4, p.id, camp.burn[1]]);
      g.walls.touch();
    }
    return true;
  }

  stopBurn(pid?: number): void {
    const camp = this.current;
    if (!camp?.burn || (pid !== undefined && camp.burn[0] !== pid)) return;
    this.game.event(['camp', 5, camp.burn[0], 0]);
    delete camp.burn;
    this.burnStart = null;
    this.game.walls.touch();
  }

  private burn(p?: FortPlayer): void {
    const camp = this.current, g = this.game;
    if (!camp || camp.burnt) return;
    camp.burnt = true;
    camp.by = p?.id ?? 0;
    delete camp.burn;
    this.burnStart = null;
    this.burnt.add(camp.placed);
    if (this.shot && g.tick < this.shot[2]) this.cancelShot();
    const gold = p ? CAMP_CHEST_SUPPLIES * supplyGold(g.force) : 0;
    if (p) for (const q of g.players.values()) g.arsenal.giveGold(q, gold, camp.x, 1, camp.z);
    g.event(['camp', 2, camp.by, gold]);
    if (p) g.systemChat(`🔥 ${p.name} сжёг лагерь Барона! Катапульта сломана · сундук: +${gold} 💰 каждому`);
    g.walls.touch();
  }

  step(): void {
    const g = this.game, camp = this.current;
    if (!g.fort50Enabled || !camp) return;
    if (g.phase === FT_END) { this.stopBurn(); this.cancelShot(); return; }
    this.updateGuards();
    if (g.phase !== FT_WAVE) this.cancelShot();
    if (this.shot && g.tick >= this.shot[3]) {
      const [, sec, , , x, y, z] = this.shot;
      this.shot = null;
      g.hitWall(sec, WALL_DMG.catapult * waveDmgMul(g.force), x, y, z);
      for (const p of g.players.values()) if (p.alive && Math.hypot(p.state.x - x, p.state.y + 0.8 - y, p.state.z - z) < CATA_PLAYER_R)
        g.hitPlayer(0, p.id, CATA_PLAYER_DMG);
      g.event(['catahit', sec, x, y, z]);
    }
    if (camp.burn && this.burnStart) {
      const p = g.players.get(camp.burn[0]), start = this.burnStart;
      if (!p?.alive || p.hurtTick !== start.hurt || p.firingUntil > g.tick
        || !outsideFort(p.state.x, p.state.y, p.state.z)
        || Math.hypot(p.state.x - start.x, p.state.y - start.y, p.state.z - start.z) > WALL_FIX_MOVE) this.stopBurn();
      else if (g.tick >= camp.burn[1]) this.burn(p);
    }
    if (g.phase !== FT_WAVE || camp.burnt || camp.stage !== 3 || g.tick < this.nextShot) return;
    this.nextShot = g.tick + CATA_EVERY;
    const sections = WALL_SECTIONS.map((s, sec) => s.side === camp.side ? sec : -1).filter((sec) => sec >= 0);
    const sec = g.weakestWall(sections);
    if (sec < 0) return;
    const { x, z } = wallOuterPoint(sec, 0.3), fire = g.tick + CATA_WINDUP;
    this.shot = ['cata', sec, fire, fire + CATA_FLIGHT, x, WALL_H * 0.7, z];
    g.event([...this.shot]);
  }

  replay(): FortEvent[] { return this.shot && this.game.phase === FT_WAVE ? [[...this.shot]] : []; }

  dev(arg = '3'): void {
    if (arg === 'burn') { this.burn(); return; }
    const stage = Number(arg);
    if (![1, 2, 3].includes(stage)) return;
    if (!this.current) this.place(Math.max(1, this.game.wave), -1, stage);
    else this.setStage(stage);
    this.cancelShot();
    this.nextShot = this.game.tick + CATA_FIRST;
    this.reinforce();
  }
}
