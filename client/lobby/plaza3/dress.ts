// Оформление новой набережной (флаг PLAZA3, docs/plaza3/tech-foundation.md §1.6): входы-павильоны, вывески с живым
// статусом, жители, видимость режимов за флагами. Заменяет PlazaDress (client/lobby/plaza) с тем же внешним видом для
// сцены, когда в docs/plaza3/level/layout.json legacyStatic: false. Сейчас: вывески и указатели (WP10); павильоны, жители — другие пакеты.
import type * as THREE from 'three';
import type { FerryStatus } from '../../../shared/messages.ts';
import { dgStatus } from '../dgstatus.ts';
import { DungeonEntrance } from '../plaza/dungeon.ts';
import type { PlazaMode } from '../plaza/index.ts';
import type { LiveIn } from '../plaza/live.ts';
import type { VenueCtx } from '../plaza/venue.ts';
import { plaza3Shadows } from './mounts.ts';
import { NpcCrowd } from './npc.ts';
import { Plaza3Signs } from './signs.ts';

export class Plaza3Dress {
  readonly ctx: VenueCtx;
  private readonly modes = new Map<PlazaMode, boolean>();
  /** Жители у входов (WP11): все 17 — одной сеткой с жёсткими костями */
  readonly npc: NpcCrowd;
  /** Вывески и столбы-указатели (WP10): два холста-атласа — две отрисовки на всю площадь */
  readonly signs: Plaza3Signs;
  /** Вход «Подземелья» (plaza_entrance.glb) у скалы pav_dungeon_cliff — по anchor_entrance (= DUNGEON_ROCK из P3.modes, WP9) */
  private readonly dungeon: DungeonEntrance;
  /** Чужие желейки: жители поворачиваются к ближайшему игроку, а не только к своей */
  private players: ReadonlyArray<{ x: number; z: number }> = [];

  /** myNick — ник игрока: его строка на доске рекордов «Подземелья» золотом (как в старой площади) */
  constructor(ctx: VenueCtx, myNick: () => string = () => '') {
    this.ctx = ctx;
    // вывеска входа — WP10 (signs.ts, живой статус): вывеску из plaza_entrance.glb не ставим, она лежала бы на ней
    this.dungeon = new DungeonEntrance(ctx, () => plaza3Shadows.refresh(), myNick, false);
    this.npc = new NpcCrowd(ctx.scene);
    this.signs = new Plaza3Signs(ctx.scene);
  }

  /** Режим за флагом сервера включён или выключен (вход виден, твёрдое — у карты) */
  setMode(mode: PlazaMode, on: boolean): void {
    this.modes.set(mode, on);
    if (mode === 'dungeon' && this.dungeon.venue.group.visible !== on) {
      this.dungeon.venue.group.visible = on;
      if (on) plaza3Shadows.refresh();
    }
    this.npc.setMode(mode, on);
    this.signs.setMode(mode, on);
  }

  /** Строка статуса крепости и её рекорд — на вывеску (WP10): вывеска считает статус по LiveIn, строка сцены — для отладки */
  setFortLine(line: string, _rec = ''): void {
    this.signs.setFortLine(line);
  }

  /** Строка статуса «Выше облаков» — на вывеску (WP10): так же, как у крепости */
  setSkyLine(line: string, _hot: boolean): void {
    this.signs.setSkyLine(line);
  }

  /** Занятые автоматы (биты 0…total−1 — по машинам): «свободно 4 автомата» на вывеске курзала */
  setSlotsBusy(mask: number, total: number): void {
    let busy = 0;
    for (let m = 0; m < total; m++) if (((mask >> m) & 1) === 1) busy++;
    this.signs.setExtras({ slots: { busy, total } });
  }
  /** Единственная вывеска «Удалой»: тот же статус рейса и те же часы, что у лодки. */
  setFerry(status: FerryStatus, tick: number): void {
    this.signs.setExtras({ ferry: { status, tick } });
  }

  /** Где сейчас чужие желейки (список обновляет сцена; хранится ссылка, копировать не нужно) */
  setPlayers(list: ReadonlyArray<{ x: number; z: number }>): void {
    this.players = list;
  }

  /** Кадр: время мира, камера, своя желейка, статусы режимов, горит ли свет в сети */
  update(dt: number, time: number, cam: THREE.Vector3, me: { x: number; z: number } | null, live: LiveIn, lampsOn: boolean): void {
    this.npc.update(dt, time, cam, me, live, this.players);
    this.dungeon.update(dt, time);
    const rec = dgStatus()?.top[0];
    this.signs.setExtras({ dungeon: rec ? { nick: rec.nick, waves: rec.waves } : null });
    this.signs.update(time, live, lampsOn);
  }

  debug(): Record<string, unknown> {
    return { plaza3: true, modes: [...this.modes], npc: this.npc.debug(), signs: this.signs.debug() };
  }
}
