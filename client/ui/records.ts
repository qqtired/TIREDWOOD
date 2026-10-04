// Рекорды и счёт профиля — данными, а не вёрсткой: профиль (client/ui/profile.ts) рисует эти списки как есть.
// Новая трасса, курс или режим — одна строка здесь. У каждой трассы картинга, курса «Выше облаков» и катеров — свой ID
// и своё поле в Stats (shared/economy.ts): старые рекорды не пропадают, новые встают рядом. Значения считает сервер.
import { fmtAquaTime } from '../../shared/aqua.ts';
import type { Stats } from '../../shared/economy.ts';
import { fmtWeight, type FishAlbum } from '../../shared/fishing.ts';
import type { FishProgress } from '../../shared/fishprogress.ts';
import { namesLine, recWhen, type FortRecView } from '../../shared/fortrecord.ts';
import { COLLECTION_SIZE, collectionCount } from '../../shared/fishrules.ts';
import { fmtRaceTime } from '../race/hud.ts';

/** Что известно о игроке: счётчики сервера, альбом рыбака и прогресс рыбалки; крепость — есть ли она и её рекорд */
export interface ProfileFacts {
  stats: Stats;
  album: FishAlbum;
  fishing: FishProgress;
  fort?: { on: boolean; top: FortRecView | null };
}

/** Значение строки: число (покажем с разрядами), готовая строка (🪙 станет значком) или null — ещё нет («—») */
export type StatValue = number | string | null;
type Get = (s: Stats, p: ProfileFacts) => StatValue;

export interface RecordLine {
  /** Режим — значок и название */
  mode: string;
  /** Трасса или курс, если их в режиме несколько */
  course?: string;
  /** Что за рекорд; whatOf — подпись по данным (чей рекорд и когда) */
  what: string;
  whatOf?: (p: ProfileFacts) => string;
  value: Get;
  /** Только тем, кто играл: тайные режимы и события */
  played?: (s: Stats, p: ProfileFacts) => boolean;
}

export interface ModeStats {
  mode: string;
  rows: ReadonlyArray<readonly [label: string, value: Get]>;
  /** Только тем, кто играл: тайные режимы и события */
  played?: (s: Stats) => boolean;
}

const fmt = new Intl.NumberFormat('ru-RU');
const lap = (ms: number): StatValue => (ms > 0 ? fmtRaceTime(ms) : null);
const best = (n: number): StatValue => (n > 0 ? n : null);
const MEDALS = ['', '🥉 бронза', '🥈 серебро', '🥇 золото'];
const medal = (n: number): StatValue => MEDALS[n] || null;
/** Крепость в рекордах — тем, кто в ней играл, и всем, когда она открыта на сервере (зовёт побить рекорд) */
const fortShown = (s: Stats, p: ProfileFacts): boolean => s.ftGames > 0 || !!p.fort?.on;
/** Рекорд крепости: чей и когда */
function fortHolder(p: ProfileFacts): string {
  const t = p.fort?.top;
  if (!t) return 'рекорд крепости — ещё ничей';
  const when = recWhen(t.at, Date.now());
  return `рекорд крепости${t.live ? ' — бьют прямо сейчас' : ''} · ${namesLine(t.names)}${when && !t.live ? ` · ${when}` : ''}`;
}

/** «Рекорды по режимам»: лучший результат каждого режима, у трасс и курсов — по строке на каждую */
export const RECORDS: readonly RecordLine[] = [
  { mode: '🏁 Картинг', course: 'Портовое кольцо', what: 'лучший круг', value: (s) => lap(s.rcBestLapHarbor) },
  { mode: '🏁 Картинг', course: 'Солнечный серпантин', what: 'лучший круг', value: (s) => lap(s.rcBestLapHills) },
  // трассы до переделки: рекорды не пропадают, но показываем их только тем, у кого они есть
  { mode: '🏁 Картинг', course: 'Порт (старая трасса)', what: 'лучший круг', value: (s) => lap(s.rcBestLap), played: (s) => s.rcBestLap > 0 },
  { mode: '🏁 Картинг', course: 'Литейный вираж (старая трасса)', what: 'лучший круг', value: (s) => lap(s.rcBestLapFoundry), played: (s) => s.rcBestLapFoundry > 0 },
  // круг катера сервер считает в тиках (60 в секунду)
  { mode: '🚤 Портовая регата', what: 'лучший круг', value: (s) => lap((s.brBestLapHarbor * 1000) / 60) },
  { mode: '🚤 Катера', course: 'Лазурная бухта (старая трасса)', what: 'лучший круг', value: (s) => lap((s.brBestLap * 1000) / 60), played: (s) => s.brBestLap > 0 },
  { mode: '🌊 Аквапарк', what: 'лучшее время', value: (s) => (s.aqBest > 0 ? fmtAquaTime(s.aqBest) : null) },
  { mode: '☁️ Выше облаков', course: 'Небесная каланча', what: 'лучшее время', value: (s) => lap(s.skBest) },
  { mode: '🎣 Рыбалка', what: 'самая тяжёлая рыба', value: (s) => (s.fsMaxGrams > 0 ? fmtWeight(s.fsMaxGrams) : null) },
  { mode: '🎰 Автоматы', what: 'самый крупный выигрыш', value: (s) => (s.bestWin > 0 ? `${fmt.format(s.bestWin)} 🪙` : null) },
  // рекорд крепости — отбитые волны (последняя полностью отбитая): свой и всей крепости
  { mode: '🏰 Крепость', what: 'твой рекорд — отбито волн', value: (s) => best(s.ftBest), played: fortShown },
  { mode: '🏰 Крепость', what: 'рекорд крепости', whatOf: fortHolder, value: (_s, p) => p.fort?.top?.wave ?? null, played: fortShown },
];

/** Счёт по режимам: карточка на режим */
export const MODE_STATS: readonly ModeStats[] = [
  { mode: '🎯 Пейнтбол', rows: [['раундов', (s) => s.pbRounds], ['побед', (s) => s.pbWins], ['сбитых', (s) => s.pbKills], ['лучший игрок', (s) => s.pbMvp]] },
  { mode: '🏁 Картинг', rows: [['заездов', (s) => s.rcRaces], ['побед', (s) => s.rcWins], ['подиумов', (s) => s.rcPodiums]] },
  { mode: '🚤 Портовая регата', rows: [['заездов', (s) => s.brRaces], ['побед', (s) => s.brWins]] },
  { mode: '🙈 Прятки', rows: [['игр', (s) => s.hiGames], ['побед', (s) => s.hiWins], ['найдено', (s) => s.hiFound], ['пережито раундов', (s) => s.hiSurvived]] },
  { mode: '🃏 Дурак', rows: [['партий', (s) => s.dkGames], ['в дураках', (s) => s.dkFools], ['вышел первым', (s) => s.dkFirst]] },
  { mode: '🎰 Автоматы', rows: [['вращений', (s) => s.spins], ['выиграно', (s) => `${fmt.format(s.slotWon)} 🪙`], ['джекпотов', (s) => s.jackpots]] },
  { mode: '🌊 Аквапарк', rows: [['пройдено', (s) => s.aqRuns]] },
  { mode: '☁️ Выше облаков', rows: [['подъёмов', (s) => s.skRuns], ['медаль', (s) => medal(s.skMedal)], ['без падений', (s) => (s.skClean ? 'есть' : null)]] },
  { mode: '🏰 Крепость', rows: [['игр', (s) => s.ftGames], ['побед', (s) => s.ftWins], ['сбито зомби', (s) => s.ftKills]], played: (s) => s.ftGames > 0 },
  // о клубе — никому: только тем, кто дрался
  { mode: '🥊 Подвал', rows: [['боёв', (s) => s.fcFights], ['побед', (s) => s.fcWins], ['нокаутов', (s) => s.fcKos]], played: (s) => s.fcFights > 0 },
  { mode: '⛈️ Шторм', rows: [['штормов', (s) => s.stStorms], ['огней зажжено', (s) => s.stLights]], played: (s) => s.stStorms > 0 },
  { mode: '🏴‍☠️ Пираты', rows: [['налётов', (s) => s.prRaids], ['побед', (s) => s.prWins], ['сбито пиратов', (s) => s.prKos]], played: (s) => s.prRaids > 0 },
];

/** Рыбалка 2.0 — в разделе «Коллекция», рядом с альбомом */
export const FISHING_STATS: ModeStats = {
  mode: '🎣 Рыбалка',
  rows: [
    ['забросов', (s) => s.fsCasts], ['поклёвок', (s) => s.fsBites], ['поймано рыб', (s) => s.fsFish], ['сорвано рыб', (s) => s.fsLost],
    ['общий вес', (s) => fmtWeight(s.fsGrams)], ['самая тяжёлая', (s) => (s.fsMaxGrams > 0 ? fmtWeight(s.fsMaxGrams) : null)],
    ['видов поймано', (_s, p) => `${collectionCount(p.album)} из ${COLLECTION_SIZE}`], ['сундуков', (s) => s.fsChests],
    ['жетонов заработано', (s) => s.fsEarned], ['опыт рыбалки', (_s, p) => `${fmt.format(p.fishing.xp)} XP`],
    ['заданий выполнено', (_s, p) => p.fishing.questsDone],
  ],
};

/** Текст значения: числа — с разрядами, нет значения — «—» */
export function statText(v: StatValue): string {
  if (v === null) return '—';
  return typeof v === 'number' ? fmt.format(v) : v;
}
