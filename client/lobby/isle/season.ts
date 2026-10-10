// Сезон острова «Последний свет» на клиенте: последнее письмо сервера isle (его часть season) — для окна Игната и доски
// сезона у его дома. Тот же счётчик, что у сезона набережной (client/lobby/fishseason.ts), без заглушки.
import { FishSeasonClock } from '../fishseason.ts';
import type { IsleSeasonView } from '../../../shared/isle.ts';

export const ISLE_SEASON = new FishSeasonClock();
ISLE_SEASON.stub = false;

/** Что даёт сезон острова — строка в окне Игната */
export const ISLE_SEASON_PERKS = 'туман держится, туманные виды клюют ещё вдвое чаще';

export function isleSeasonMsg(season: IsleSeasonView, serverNow: number): void {
  ISLE_SEASON.sync(serverNow);
  ISLE_SEASON.onMsg({ t: 'fishSeason', ...season });
}
