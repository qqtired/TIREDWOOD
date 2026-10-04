// Оформление площади (plaza2): вход в каждый режим читается издалека — вывеска, реквизит, зазывала и «дверь» вместо
// голого круга. Строится один раз при создании сцены набережной, до первого кадра (тени статики — в общей карте теней).
// Режимы за флагами сервера (крепость, Fight Club, «Выше облаков», регата, прятки) показываются, только когда
// сервер прислал их статус: без флага набережная такая же, как была.
import * as THREE from 'three';
import type { GroundQuery } from '../../render/avatar.ts';
import { REGATTA_BOAT_SIZE } from '../../../shared/plaza2.ts';
import { buildFight } from './east.ts';
import { setBulbPhase } from './gfx.ts';
import { buildHarbor, type HarborParts } from './harbor.ts';
import { boatPlateLine, liveLines, type LiveIn } from './live.ts';
import { buildNorth, type NorthParts } from './north.ts';
import { Tout } from './touts.ts';
import type { Venue, VenueCtx } from './venue.ts';

export type PlazaMode = 'fort' | 'sky' | 'fight' | 'regatta' | 'hide';
export const PLAZA_MODES: readonly PlazaMode[] = ['fort', 'sky', 'fight', 'regatta', 'hide'];

interface Listed {
  tout: Tout;
  venue: Venue;
}

export class PlazaDress {
  readonly north: NorthParts;
  readonly harbor: HarborParts;
  private readonly venues: Venue[] = [];
  private readonly modes = new Map<PlazaMode, Venue[]>();
  private readonly seen = new Set<PlazaMode>();
  private readonly touts: Listed[] = [];
  private fortText = '';
  private readonly refreshShadows: () => void;

  constructor(ctx: VenueCtx, ground: GroundQuery, refreshShadows: () => void) {
    this.refreshShadows = refreshShadows;
    this.north = buildNorth(ctx);
    const n = this.north;
    this.add(n.paint, null);
    this.add(n.kart, null);
    this.add(n.fort, 'fort');
    this.add(n.fortKeep, 'fort');
    this.add(n.sky, 'sky');
    this.add(n.skyTower, 'sky');
    this.harbor = buildHarbor(ctx);
    this.add(this.harbor.yard, 'hide');
    this.add(this.harbor.regatta, 'regatta');
    this.add(this.harbor.boat, null);
    this.add(buildFight(ctx), 'fight');
    for (const venue of this.venues) {
      for (const def of venue.touts) this.touts.push({ tout: new Tout(ctx.scene, def, ground), venue });
    }
  }

  private add(venue: Venue, mode: PlazaMode | null): void {
    this.venues.push(venue);
    if (!mode) return;
    const list = this.modes.get(mode) ?? [];
    list.push(venue);
    this.modes.set(mode, list);
  }

  /** Режим включён сервером (пришёл его статус) или нет. Первый раз — тени статики пересчитываются. */
  setMode(mode: PlazaMode, on: boolean): void {
    const list = this.modes.get(mode);
    if (!list) return;
    for (const v of list) v.group.visible = on;
    if (on && !this.seen.has(mode)) {
      this.seen.add(mode);
      this.refreshShadows();
    }
  }

  /** Строка статуса на табличке крепости */
  setFortLine(line: string): void {
    if (line === this.fortText) return;
    this.fortText = line;
    this.north.fortPlate.set(line);
  }

  /** Кадр: время мира, камера, своя желейка, статусы режимов, горит ли свет в сети. */
  update(dt: number, time: number, cam: THREE.Vector3, me: { x: number; z: number } | null, live: LiveIn, lampsOn: boolean): void {
    setBulbPhase(Math.floor(time * 2.6) % 2);
    for (const v of this.venues) {
      const b = v.bulbs.object;
      if (b) b.visible = lampsOn;
    }
    this.harbor.boatPlate.set(boatPlateLine(live));
    // лодки у стенки покачиваются: чуть вверх-вниз и с боку на бок, каждая в своём такте
    for (const b of this.harbor.bobs) {
      b.sway.position.y = REGATTA_BOAT_SIZE.h + Math.sin(time * 1.3 + b.phase) * 0.035;
      b.sway.rotation.x = Math.sin(time * 0.9 + b.phase * 1.3) * 0.012;
      b.sway.rotation.z = Math.sin(time * 1.1 + b.phase) * 0.018;
    }
    for (const { tout, venue } of this.touts) {
      tout.update(dt, time, cam, me, liveLines(tout.def.key, live), venue.group.visible);
    }
  }

  debug(): Record<string, unknown> {
    return { venues: this.venues.map((v) => [v.key, v.group.visible]), touts: this.touts.map((t) => [t.tout.def.key, +t.tout.dist.toFixed(1)]) };
  }
}
