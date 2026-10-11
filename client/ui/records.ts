// Рекорды и счёт профиля — данными, а не вёрсткой: профиль (client/ui/profile.ts) рисует эти списки карточками кита.
// icon — значок режима (client/assets/ui/icons/<id>.webp, client/ui/kit/icons.ts): эмодзи в названиях не нужны.
// Новая трасса, курс или режим — одна строка здесь. У каждой трассы картинга, курса «Выше облаков» и катеров — свой ID
// и своё поле в Stats (shared/economy.ts): старые рекорды не пропадают, новые встают рядом. Значения считает сервер.
import { fmtAquaTime } from '../../shared/aqua.ts';
import type { Stats } from '../../shared/economy.ts';
import { fmtWeight, type FishAlbum } from '../../shared/fishing.ts';
import type { FishProgress } from '../../shared/fishprogress.ts';
import { namesLine, recWhen, wavesText, type FortRecView } from '../../shared/fortrecord.ts';
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
  /** Режим — название и значок (id в client/assets/ui/icons) */
  mode: string;
  icon: string;
  /** Трасса или курс, если их в режиме несколько */
  course?: string;
  /** Что за рекорд; whatOf — подпись по данным (чей рекорд и когда) */
  what: string;
  whatOf?: (p: ProfileFacts) => string;
  /** Рекорд не твой (рекорд всей крепости): карточка без золотой каймы, в «Обзор» не попадает */
  theirs?: boolean;
  value: Get;
  /** Только тем, кто играл: тайные режимы и события */
  played?: (s: Stats, p: ProfileFacts) => boolean;
}

export interface ModeStats {
  mode: string;
  icon: string;
  rows: ReadonlyArray<readonly [label: string, value: Get]>;
  /** Только тем, кто играл: тайные режимы и события */
  played?: (s: Stats) => boolean;
}

const fmt = new Intl.NumberFormat('ru-RU');
const lap = (ms: number): StatValue => (ms > 0 ? fmtRaceTime(ms) : null);
const best = (n: number): StatValue => (n > 0 ? n : null);
const MEDALS = ['', 'бронза', 'серебро', 'золото'];
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

/** «Подземелье»: подпись под рекордом — «18:32 · забегов 23 · боссов 2» (время — игровое до конца последней отбитой волны) */
function dungeonWhat(p: ProfileFacts): string {
  const s = p.stats;
  if (!(s.dgBest > 0)) return 'рекорд';
  const sec = Math.floor(s.dgBestMs / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} · забегов ${fmt.format(s.dgRuns)} · боссов ${fmt.format(s.dgBosses)}`;
}

/** «Рекорды по режимам»: лучший результат каждого режима, у трасс и курсов — по строке на каждую */
export const RECORDS: readonly RecordLine[] = [
  { icon: 'kart', mode: 'Картинг', course: 'Портовое кольцо', what: 'лучший круг', value: (s) => lap(s.rcBestLapHarbor) },
  { icon: 'kart', mode: 'Картинг', course: 'Солнечный серпантин', what: 'лучший круг', value: (s) => lap(s.rcBestLapHills) },
  // трассы до переделки: рекорды не пропадают, но показываем их только тем, у кого они есть
  { icon: 'kart', mode: 'Картинг', course: 'Порт (старая трасса)', what: 'лучший круг', value: (s) => lap(s.rcBestLap), played: (s) => s.rcBestLap > 0 },
  { icon: 'kart', mode: 'Картинг', course: 'Литейный вираж (старая трасса)', what: 'лучший круг', value: (s) => lap(s.rcBestLapFoundry), played: (s) => s.rcBestLapFoundry > 0 },
  // круг катера сервер считает в тиках (60 в секунду)
  { icon: 'regatta', mode: 'Портовая регата', what: 'лучший круг', value: (s) => lap((s.brBestLapHarbor * 1000) / 60) },
  { icon: 'regatta', mode: 'Катера', course: 'Лазурная бухта (старая трасса)', what: 'лучший круг', value: (s) => lap((s.brBestLap * 1000) / 60), played: (s) => s.brBestLap > 0 },
  { icon: 'slide', mode: 'Аквапарк', what: 'лучшее время', value: (s) => (s.aqBest > 0 ? fmtAquaTime(s.aqBest) : null) },
  { icon: 'bell-cloud', mode: 'Выше облаков', course: 'Небесная каланча', what: 'лучшее время', value: (s) => lap(s.skBest) },
  { icon: 'float', mode: 'Рыбалка', what: 'самая тяжёлая рыба', value: (s) => (s.fsMaxGrams > 0 ? fmtWeight(s.fsMaxGrams) : null) },
  { icon: 'roulette', mode: 'Автоматы', what: 'самый крупный выигрыш', value: (s) => (s.bestWin > 0 ? `${fmt.format(s.bestWin)} 🪙` : null) },
  // рекорд крепости — отбитые волны (последняя полностью отбитая): свой и всей крепости
  { icon: 'shield', mode: 'Крепость', what: 'твой рекорд — отбито волн', value: (s) => best(s.ftBest), played: fortShown },
  { icon: 'shield', mode: 'Крепость', what: 'рекорд крепости', whatOf: fortHolder, theirs: true, value: (_s, p) => p.fort?.top?.wave ?? null, played: fortShown },
  { icon: 'dungeon', mode: 'Подземелье', what: 'рекорд', whatOf: dungeonWhat, value: (s) => (s.dgBest > 0 ? wavesText(s.dgBest) : null), played: (s) => s.dgRuns > 0 },
];

/** Счёт по режимам: карточка на режим */
export const MODE_STATS: readonly ModeStats[] = [
  { icon: 'paint', mode: 'Пейнтбол', rows: [['раундов', (s) => s.pbRounds], ['побед', (s) => s.pbWins], ['сбитых', (s) => s.pbKills], ['лучший игрок', (s) => s.pbMvp]] },
  { icon: 'kart', mode: 'Картинг', rows: [['заездов', (s) => s.rcRaces], ['побед', (s) => s.rcWins], ['подиумов', (s) => s.rcPodiums]] },
  { icon: 'regatta', mode: 'Портовая регата', rows: [['заездов', (s) => s.brRaces], ['побед', (s) => s.brWins]] },
  { icon: 'hide-box', mode: 'Прятки', rows: [['игр', (s) => s.hiGames], ['побед', (s) => s.hiWins], ['найдено', (s) => s.hiFound], ['пережито раундов', (s) => s.hiSurvived]] },
  { icon: 'cards', mode: 'Дурак', rows: [['партий', (s) => s.dkGames], ['в дураках', (s) => s.dkFools], ['вышел первым', (s) => s.dkFirst]] },
  { icon: 'roulette', mode: 'Автоматы', rows: [['вращений', (s) => s.spins], ['выиграно', (s) => `${fmt.format(s.slotWon)} 🪙`], ['джекпотов', (s) => s.jackpots]] },
  { icon: 'slide', mode: 'Аквапарк', rows: [['пройдено', (s) => s.aqRuns]] },
  { icon: 'bell-cloud', mode: 'Выше облаков', rows: [['подъёмов', (s) => s.skRuns], ['медаль', (s) => medal(s.skMedal)], ['без падений', (s) => (s.skClean ? 'есть' : null)]] },
  { icon: 'shield', mode: 'Крепость', rows: [['игр', (s) => s.ftGames], ['побед', (s) => s.ftWins], ['сбито зомби', (s) => s.ftKills]], played: (s) => s.ftGames > 0 },
  // о клубе — никому: только тем, кто дрался
  { icon: 'lock', mode: 'Подвал', rows: [['боёв', (s) => s.fcFights], ['побед', (s) => s.fcWins], ['нокаутов', (s) => s.fcKos]], played: (s) => s.fcFights > 0 },
  { icon: 'storm', mode: 'Шторм', rows: [['штормов', (s) => s.stStorms], ['огней зажжено', (s) => s.stLights]], played: (s) => s.stStorms > 0 },
  { icon: 'pirate-flag', mode: 'Пираты', rows: [['налётов', (s) => s.prRaids], ['побед', (s) => s.prWins], ['сбито пиратов', (s) => s.prKos]], played: (s) => s.prRaids > 0 },
];

/** Рыбалка 2.0 — в разделе «Коллекция», рядом с альбомом */
export const FISHING_STATS: ModeStats = {
  icon: 'float', mode: 'Рыбалка',
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
