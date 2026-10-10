// Остров «Последний свет» на сервере (флаг ISLE): погода острова и его сезон, «На большую землю» у Игната. Решает сервер,
// у всех одно: входящему на набережную — сообщение isle, остальным — при смене.
//  · «Туман наступает» — свой экземпляр погоды (server/lobby/weather.ts): те же сроки, что у дождя, с дождём площади не
//    связан. Начался — всем тост.
//  · Сезон острова — FishSeason со сдвигом на час (нечётные часы по Москве), 10 минут; держит «Туман наступает» (как сезон
//    набережной держит дождь — holdRain). Начался — всем строка в чат, у острова трижды ревун (клиент).
//  · Шансы рыб в туман и в сезон применяет рыбалка (shared/fishisle.ts): fogOn / seasonOn.
// Отладка — в чате набережной при DEV_GO=1 (или npm run dev): /isle — на причал острова, /isle fog — туман сразу,
// /isle season — сезон острова сразу.
import { ISLE_HOME_PRICE, ISLE_SEASON_SHIFT_MS, type IsleView } from '../../shared/isle.ts';
import { ISLE_IGNAT_USE, ISLE_LANDING_SPOTS, inIsleWaters } from '../../shared/maps/isle.ts';
import { FishSeason, mskClock } from './fishseason.ts';
import { Weather } from './weather.ts';

/** Что поменялось за тик */
export interface IsleStep {
  /** Пора всем на набережной сказать новое isle */
  changed: boolean;
  /** Туман только что наступил (не сезоном) */
  fogStart: boolean;
  season: 'start' | 'end' | null;
}

export class IsleState {
  /** «Туман наступает»: rain — идёт ли (так зовётся у погоды) */
  readonly fog: Weather;
  readonly season: FishSeason;
  private tick = 0;

  constructor(now: () => number = Date.now, rand: () => number = Math.random) {
    this.fog = new Weather(rand, 'auto', 0, now);
    this.season = new FishSeason(now, ISLE_SEASON_SHIFT_MS);
  }

  /** Идёт «Туман наступает» (сам или сезоном): шансы — как в дождь у набережной */
  get fogOn(): boolean {
    return this.fog.rain;
  }

  /** Идёт сезон острова («Великий туман»): шансы тумана ещё ×2 */
  get seasonOn(): boolean {
    return this.season.on;
  }

  view(): IsleView {
    return { fog: this.fog.rain, fogUntil: this.fog.rain ? this.fog.eventUntil : 0, season: this.season.view() };
  }

  /** Раз в тик хаба (вместе с погодой набережной). */
  step(): IsleStep {
    this.tick++;
    const was = this.fog.rain;
    let changed = this.fog.step(this.tick);
    const season = this.season.step();
    if (season) changed = true;
    const v = this.season.view();
    if (v.on && this.fog.holdRain(this.tick, v.endsAt)) changed = true;
    return { changed, fogStart: !was && this.fog.rain && !v.on, season };
  }

  /** Отладка: туман сразу (на обычный срок). false — уже идёт. */
  forceFog(): boolean {
    return this.fog.startRain(this.tick);
  }

  /** Отладка: сезон острова сразу. false — уже идёт. */
  forceSeason(): boolean {
    return this.season.force();
  }

  /** Строка в общий чат о сезоне острова */
  seasonLine(change: 'start' | 'end'): string {
    return change === 'start'
      ? '🗼 На острове «Последний свет» начался сезон — «Великий туман» на 10 минут: туманные виды клюют ещё вдвое чаще!'
      : `🗼 Сезон на острове «Последний свет» закончился. Следующий — в ${mskClock(this.season.view().nextAt)} по Москве.`;
  }
}

/** Тост всем: на острове наступает туман */
export const ISLE_FOG_TOAST = '🌫 На острове «Последний свет» наступает туман: клюют туманные виды';

/** Упал в воду в водах острова — выныривает на причале: точка k (по кругу) */
export function isleLanding(x: number, z: number, k: number): { x: number; y: number; z: number; yaw: number } | null {
  if (!inIsleWaters(x, z)) return null;
  return ISLE_LANDING_SPOTS[((k % ISLE_LANDING_SPOTS.length) + ISLE_LANDING_SPOTS.length) % ISLE_LANDING_SPOTS.length];
}

/** Что нужно для «На большую землю» */
export interface IsleHomeHost {
  /** Есть своя лодка: Игнат не возит (плыви сам) */
  hasBoat(): boolean;
  spend(n: number): boolean;
  move(): void;
}

/** Стоит ли у Игната */
export function nearIgnat(at: { x: number; y: number; z: number }): boolean {
  const u = ISLE_IGNAT_USE;
  return Math.hypot(at.x - u.x, at.z - u.z) <= u.r + 0.5 && Math.abs(at.y - u.y) < 2;
}

/** «На большую землю — 250 🪙»: к хижине Семёна на пристани. */
export function isleHome(at: { x: number; y: number; z: number }, host: IsleHomeHost): 'ok' | 'far' | 'boat' | 'poor' {
  if (!nearIgnat(at)) return 'far';
  if (host.hasBoat()) return 'boat';
  if (!host.spend(ISLE_HOME_PRICE)) return 'poor';
  host.move();
  return 'ok';
}

export function isleHomeText(r: 'ok' | 'far' | 'boat' | 'poor', tokens: number): string {
  return r === 'ok' ? 'Игнат завёл свой старый катерок — и ты уже у хижины Семёна'
    : r === 'far' ? 'Подойди к смотрителю Игнату на крыльце'
    : r === 'boat' ? 'У тебя своя лодка у причала — плыви сам, а я посвечу маяком'
    : `Игнат берёт ${ISLE_HOME_PRICE} 🪙 за рейс, а у тебя ${tokens}`;
}

/** Есть ли своя лодка (профиль fishing.boats — купленные, пакет B); пока лодок нет — нет */
export function ownsBoat(fishing: object): boolean {
  const boats = (fishing as { boats?: unknown }).boats;
  return Array.isArray(boats) && boats.length > 0;
}
