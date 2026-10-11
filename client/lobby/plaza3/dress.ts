// Оформление новой набережной (флаг PLAZA3, docs/plaza3/tech-foundation.md §1.6): входы-павильоны, вывески с живым
// статусом, жители, видимость режимов за флагами. Заменяет PlazaDress (client/lobby/plaza) с тем же внешним видом для
// сцены, когда в docs/plaza3/level/layout.json legacyStatic: false. Сейчас — заглушка каркаса WP0: ничего не рисует.
import type * as THREE from 'three';
import type { PlazaMode } from '../plaza/index.ts';
import type { LiveIn } from '../plaza/live.ts';
import type { VenueCtx } from '../plaza/venue.ts';

export class Plaza3Dress {
  readonly ctx: VenueCtx;
  private readonly modes = new Map<PlazaMode, boolean>();

  constructor(ctx: VenueCtx) {
    this.ctx = ctx;
  }

  /** Режим за флагом сервера включён или выключен (вход виден, твёрдое — у карты) */
  setMode(mode: PlazaMode, on: boolean): void {
    this.modes.set(mode, on);
  }

  /** Строка статуса крепости и её рекорд — на вывеску (WP10) */
  setFortLine(_line: string, _rec = ''): void {}

  /** Строка статуса «Выше облаков» — на вывеску (WP10) */
  setSkyLine(_line: string, _hot: boolean): void {}

  /** Кадр: время мира, камера, своя желейка, статусы режимов, горит ли свет в сети */
  update(_dt: number, _time: number, _cam: THREE.Vector3, _me: { x: number; z: number } | null, _live: LiveIn, _lampsOn: boolean): void {}

  debug(): Record<string, unknown> {
    return { plaza3: true, modes: [...this.modes] };
  }
}
