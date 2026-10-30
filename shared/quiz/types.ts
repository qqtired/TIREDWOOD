// «Ракушка»: числа части 1 и снимок состояния, который получает клиент (docs/quiz/tech.md §3–§7).
// Виды клиента (HUD, табло, вывеска, облачка, 3D) строятся ТОЛЬКО по этим снимкам; сервер — единственный судья.
// Числа — из docs/quiz/brief.md; помеченные «реш. арх.» — решение технического архитектора, бриф их не задаёт.
// Время в снимках — часы сервера в мс (Date.now() сервера); снимок несёт now, клиент считает отсчёт от него.

/** Режимы в порядке карточек голосования: клавиши 1–4 */
export type QuizMode = 'riddle' | 'jeopardy' | 'croc' | 'whoofus';

export interface QuizModeInfo {
  readonly id: QuizMode;
  readonly name: string;
  /** Значок кита (client/assets/ui/icons/<icon>.webp) */
  readonly icon: string;
  /** Меньше людей внутри ограды — карточка серая: «от N» */
  readonly min: number;
}

/** «Кто из нас?» — от 4 (решение ведущего 30.10 главнее строки «от 3» в «Роли и места») */
export const QZ_MODES: readonly QuizModeInfo[] = [
  { id: 'riddle', name: 'Загадка', icon: 'scroll', min: 2 },
  { id: 'jeopardy', name: 'Своя игра', icon: 'bell', min: 2 },
  { id: 'croc', name: 'Крокодил', icon: 'paint', min: 2 },
  { id: 'whoofus', name: 'Кто из нас?', icon: 'online', min: 4 },
];

/** Темы «Загадки» — одна кнопка в окне «Что загадал?» */
export const QZ_CATEGORIES = ['Предмет', 'Животное', 'Человек', 'Место', 'Фильм или книга', 'Еда', 'Другое'] as const;
export type QzCategory = (typeof QZ_CATEGORIES)[number];

/** Числа части 1 (мс, штуки). Правятся по игре — только здесь. */
export const QZ = {
  // --- сцена
  /** Внутри ограды сидят двое — через столько Затейник сам открывает голосование */
  AUTO_VOTE_SEATED: 2,
  AUTO_VOTE_DELAY_MS: 2000, // реш. арх.: чтобы второй севший увидел, как это происходит
  /** Голосование: 12 с; проголосовали все внутри — ещё 1 с (A4, «Ракушка» 1.1: было 20 с и 3 с) */
  VOTE_MS: 12_000,
  VOTE_ALL_MS: 1_000,
  /** Ничья: колесо крутится (только анимация), потом победитель на табло */
  SPIN_MS: 3_000, // реш. арх. (лаб: ~2,7 с)
  WIN_MS: 1_500, // реш. арх.: «Играем: Загадка» на табло до вызова ролей
  /** 0 голосов: «Никто не выбрал» — потом «Игры нет» */
  NOBODY_MS: 4_000,
  /** Вызов роли («Загадываю!»): 10 с на всех; лично (угадавшему, назначенному Затейником) — тоже 10 с */
  CALL_MS: 10_000,
  /** Итоги на табло, потом снова голосование */
  RESULTS_MS: 10_000,
  /** Меньше стольких людей в игре — без жетонов (надпись на карточке голосования) */
  TOKENS_MIN_PEOPLE: 3,
  /** Внутри меньше двух дольше этого — игра кончается (реш. арх.) */
  ALONE_MS: 10_000,
  /** Строки в общий чат («начали», «разгадали», «победил») — не чаще */
  ANNOUNCE_GAP_MS: 120_000,
  /** Счёт вечера обнуляется, когда внутри ограды никого столько времени (реш. арх.) */
  EVENING_IDLE_MS: 30 * 60_000,
  /** Снимки: не чаще раза в столько и только при изменении (табло перерисовывается ≤ 4 раз в секунду) */
  SNAP_MIN_MS: 250,
  /** Затейник у арки зовёт вошедшего не чаще (реш. арх.) */
  ZAT_GREET_GAP_MS: 20_000,
  /** «Садитесь — сыграем!», пока игры нет и сидит меньше двух (реш. арх.) */
  ZAT_IDLE_GAP_MS: 40_000,
  /** Строк «В игру» в снимке, не больше (старые отмеченные «мимо» и реплики уходят первыми) */
  LINES_KEEP: 60,
  /** Длина строки «В игру»; облачко над головой — первые 60 знаков (BUBBLE_CHARS) */
  LINE_MAX: 120,
  /** Реплика «В игру» вне догадок (загадывающий, между раундами) — не чаще раза в столько */
  SAY_GAP_MS: 2_000,

  // --- «Загадка»
  WORD_MIN: 2,
  WORD_MAX: 40,
  HINT_MAX: 40,
  /** Подсказок за раунд, вместе с первой из окна «Что загадал?» */
  HINTS: 3,
  /** На окно «Что загадал?» (реш. арх.): не успел — как «Пропустить» */
  ASK_MS: 45_000,
  /** Раунд — 5 минут; за минуту до конца табло мигает и Затейник говорит «Осталась минута!» */
  ROUND_MS: 5 * 60_000,
  HURRY_MS: 60_000,
  /** Игра: 5 загадок или 15 минут (проверка — на конце загадки) */
  RIDDLES: 5,
  GAME_MS: 15 * 60_000,
  /** Догадка — не чаще раза в 2 с; при 6+ угадывающих внутри — раз в 5 с (бриф: 4–6 с) */
  GUESS_GAP_MS: 2_000,
  GUESS_GAP_CROWD_MS: 5_000,
  GUESS_CROWD: 6,
  /** В доке загадывающего — не больше 5 неотмеченных, остальные «ещё N ждут отметки» */
  DOCK_UNMARKED: 5,
  /** Неотмеченная догадка гаснет через 90 с (считая с последнего «стала неотмеченной») */
  LINE_TTL_MS: 90_000,
  /** «Угадал» — 3 с барабанной дроби «Проверяем…», в них можно отменить */
  CHECK_MS: 3_000,
  /** «↩ Вернуть» у «мимо» в доке загадывающего — 5 с (сервер принимает правку весь раунд) */
  MISS_UNDO_MS: 5_000,
  /** Итог загадки на табло до вызова следующего загадывающего (реш. арх.) */
  REVEAL_MS: 4_000,
  /** Смена игры посреди загадки: ответ на табло столько, потом голосование (реш. арх.) */
  SWAP_REVEAL_MS: 3_000,
  /** «Мимо» на табло — последние 3 */
  BOARD_MISSES: 3,
  /** Очки раунда: угадавший, загадывающий (если отгадали), автор строки с «тепло» (не больше 3 за раунд) */
  PTS_SOLVER: 5,
  PTS_RIDDLER: 3,
  PTS_WARM: 1,
  PTS_WARM_CAP: 3,

  // --- «Ракушка» 1.1 (docs/quiz/brief.md «Ракушка 1.1»)
  /** C1 «Горячо!»: автору строки +2 вместо +1 «тепло»; общий предел на автора за раунд — тот же PTS_WARM_CAP */
  PTS_HOT: 2,
  /** A3: очередь «Хочу загадать» — не длиннее */
  QUEUE_MAX: 8,
  /** E1 «Браво!»: не чаще раза в 2 с на человека; в снимке хлопки держатся 3 с */
  BRAVO_GAP_MS: 2_000,
  BRAVO_SHOW_MS: 3_000,
  /** C9: титулов вечера на табло (по одному последнему на человека), не больше */
  TITLES_MAX: 12,
} as const;

/** F3 «Разминка с Затейником»: один сидящий, вопросы из встроенных паков «Своей игры», без жетонов */
export const QZ_WARM = {
  /** На вопрос — 20 с, ответ на табло — 3 с, потом следующий */
  Q_MS: 20_000,
  REVEAL_MS: 3_000,
  /** Вопрос берём, только если он текстовый (без картинок и звука) и не длиннее */
  Q_MAX: 160,
} as const;

/** F4: вдвоём — половина минутных жетонов, без бонусов (QZ_TOKENS.MIN_PEOPLE = 3 — для бонусов, как раньше) */
export const QZ_HALF = {
  PEOPLE: 2,
  PER_MIN: 4,
} as const;

// ------------------------------------------------------------------ снимок

/** Шаг сцены: idle → vote → roles → game → results → vote … */
export type QzPhase = 'idle' | 'vote' | 'roles' | 'game' | 'results';

/** Человек внутри ограды. slot — номер в снимке набережной (облачко, значок над головой); 0 — не на набережной */
export interface QzWho {
  slot: number;
  nick: string;
}

export interface QzScoreRow extends QzWho {
  pts: number;
}

/** Карточка голосования */
export interface QzVoteOption {
  mode: QuizMode;
  /** Голосов */
  n: number;
  /** Ники проголосовавших — цветные точки (цвет ника считает клиент) */
  who: string[];
  /** Серая карточка: причина («от 4», «Скоро») или null */
  off: string | null;
}

export interface QzVote {
  options: QzVoteOption[];
  /** Сколько внутри ограды и сколько проголосовало */
  people: number;
  voted: number;
  /** Проголосовали все — идут последние 3 с */
  closing: boolean;
  /** Ничья: номера равных карточек и победитель (колесо крутится SPIN_MS, потом win) */
  spin: { tied: number[]; win: number } | null;
  /** Победившая карточка (−1 — ещё нет); nobody — 0 голосов, «Никто не выбрал» */
  win: number;
  nobody: boolean;
  /** Подпись под победителем: «2 голоса · дольше не играли» */
  why: string;
  /** «Ракушка» 1.1, A1: победитель выбран кнопкой «Ещё раз!» без голосования — табло «Играем снова: …» */
  again?: boolean;
}

/** Вызов роли: «Загадываю!» и т. п. На плашке снизу — кнопки, у назначенного — ещё «Пропустить» */
export interface QzCall {
  /** Какая роль (первая кнопка, F): riddler «Загадываю!», drawer «Хочу рисовать», host «Веду я», player «Играю» */
  role: QzRole;
  /** Часть 2: все кнопки вызова по порядку, если их больше одной («Своя игра»: ['host', 'player']) */
  roles?: QzRole[];
  /** Часть 2: кто уже записался — игроки «Своей игры» (до 6), очередь «Крокодила» */
  taken?: QzWho[];
  /** solver — угадавший загадывает следующим; open — кто первый нажмёт; zat — назначил Затейник */
  by: 'solver' | 'open' | 'zat';
  /** Кому лично (solver, zat); при open — null */
  to: QzWho | null;
  endsAt: number;
}

/** Отметка строки «Загадки»: '' — неотмеченная; check — идут 3 с «Проверяем…»; win — угадал;
 *  hot — «Горячо!» (C1, «Ракушка» 1.1): сильнее «тепло», в карточке «Тепло» — первой */
export type QzMark = '' | 'warm' | 'hot' | 'miss' | 'check' | 'win';

/** Строка «В игру» */
export interface QzLine {
  /** Растёт в пределах сцены */
  id: number;
  /** Автор: номер в снимке набережной (0 — Затейник) и ник */
  slot: number;
  nick: string;
  text: string;
  /** Когда пришла (часы сервера) — порядок в доке и «на своё место по времени» после правки */
  at: number;
  /** guess — догадка (её отмечают); say — реплика (загадывающий, между раундами); zat — строка Затейника */
  kind: 'guess' | 'say' | 'zat' | 'got';
  /** Часть 2, «Крокодил»: строка уже угадавшего — её видят только угадавшие и рисующий (сервер не шлёт остальным) */
  only?: 'guessed';
  mark: QzMark;
  /** Когда поставлена отметка (0 — нет): порядок в карточке «Тепло» и в «мимо» на табло */
  markedAt: number;
}

/** Итог загадки: разгадали, время вышло, загадывающий ушёл, сменили игру, все ушли */
export type QzRiddleEnd = 'solved' | 'timeout' | 'left' | 'swap' | 'empty';

/** Шаг «Загадки»: call — кто загадывает (QzView.call); ask — загадывающий вводит слово; round — угадывают;
 *  check — 3 с «Проверяем…»; reveal — итог на табло (REVEAL_MS), дальше call или итоги игры */
export type QzRiddleStep = 'call' | 'ask' | 'round' | 'check' | 'reveal';

/** «Загадка» на табло — это видят все на набережной */
export interface QzRiddleBoard {
  step: QzRiddleStep;
  /** Номер загадки в игре: засчитанных (solved, timeout) + 1; и сколько всего */
  num: number;
  of: number;
  /** Загадывающий текущей (или только что сыгранной) загадки */
  riddler: QzWho | null;
  category: QzCategory | '';
  /** Подсказки по порядку (до 3) */
  hints: string[];
  /** Последние «мимо» (до 3, свежие последними) */
  misses: string[];
  /** Сколько строк с «тепло» */
  warm: number;
  /** Конец раунда (часы сервера) и длина — для времени и полоски на табло; 0 — не идёт */
  endsAt: number;
  total: number;
  /** Идёт проверка «угадал»: кого проверяем (золотая рамка у облачка), до какого момента */
  checking: (QzWho & { line: number; until: number }) | null;
  /** Итог прошлой загадки — пока step reveal / call / ask: слово, кто угадал */
  last: { end: QzRiddleEnd; answer: string; riddler: QzWho; solver: QzWho | null } | null;
  /** «Ракушка» 1.1, A3: очередь «Хочу загадать» по порядку (первый — следующий загадывающий) */
  queue?: QzWho[];
  /** C1: сколько строк «Горячо!» и текст последней такой строки (крупно на табло; '' — нет) */
  hot?: number;
  hotText?: string;
}

/** «Загадка» внутри ограды: плюс строки «В игру» */
export interface QzRiddleView extends QzRiddleBoard {
  /** Строки текущего раунда по времени (и реплики между раундами), не больше QZ.LINES_KEEP.
   *  Заменённые новой догадкой и погасшие (90 с) — удалены. Карточка «Тепло» — строки с mark 'warm' по markedAt. */
  lines: QzLine[];
}

/** Итоги игры на табло */
export interface QzResults {
  mode: QuizMode;
  /** Лучшие по очкам этой игры (до 3; равные очки — равное место). «Своя игра» — счёт игры */
  top: QzScoreRow[];
  endsAt: number;
  /** Часть 2: пак «Своей игры» (для «👍 паку» и строки в чат) */
  pack?: QzPackRef;
  /** Часть 2, «Кто из нас?»: все титулы игры */
  titles?: QzTitle[];
}

/** Реплика Затейника: облачко над ним и клип (жесты — concepts_blender/quiz/zatejnik) */
export type QzZatClip = 'talk' | 'greet' | 'announce' | 'point' | 'clap' | 'cheer' | 'shrug';
export interface QzZatSay {
  /** Растёт: новая реплика — новое облачко и клип */
  id: number;
  text: string;
  clip: QzZatClip;
  at: number;
}

/** Табло и вывеска: это получают ВСЕ на набережной (снаружи — сообщением qzBoard, внутри — в составе qz) */
export interface QzBoard {
  /** Номер снимка: растёт при каждом изменении */
  rev: number;
  /** Часы сервера в момент снимка */
  now: number;
  phase: QzPhase;
  /** Конец текущего шага сцены (голосование, вызов, итоги); 0 — без срока */
  endsAt: number;
  /** Режим, который выбран или идёт (на итогах — сыгранный); null — игры нет */
  mode: QuizMode | null;
  /** Сколько людей внутри ограды и сколько из них сидит */
  count: number;
  seated: number;
  vote: QzVote | null;
  riddle: QzRiddleBoard | null;
  /** Часть 2: «Своя игра», «Крокодил», «Кто из нас?» — то, что на табло (нет поля — режим не идёт) */
  jp?: QzJpBoard | null;
  croc?: QzCrocBoard | null;
  who?: QzWhoBoard | null;
  results: QzResults | null;
  /** Счёт вечера: очки раундов всех игр на «Ракушке» (не жетоны), по убыванию, до 8 строк */
  evening: QzScoreRow[];
  /** Меньше трёх людей — «без жетонов» */
  noTokens: boolean;
  zat: QzZatSay | null;
  /** «Ракушка» 1.1, F4: внутри ровно двое — половина минутных жетонов, без бонусов («Вдвоём — половина жетонов»).
   *  noTokens тогда false; один внутри — noTokens true */
  halfTokens?: boolean;
  /** C9: титулы «Кто из нас?» этого вечера — по последнему на человека (над ником на всей набережной и в Tab),
   *  до QZ.TITLES_MAX; живут, пока жив счёт вечера (EVENING_IDLE_MS) */
  titles?: QzTitle[];
  /** F3: идёт «Разминка с Затейником» (один сидящий, шаг idle); null / нет поля — не идёт */
  warm?: QzWarmBoard | null;
}

/** F3 «Разминка с Затейником» на табло */
export interface QzWarmBoard {
  /** Кто разминается */
  who: QzWho;
  /** q — вопрос идёт до endsAt; reveal — ответ на табло */
  step: 'q' | 'reveal';
  /** Вопрос по счёту (с 1) и сколько верных */
  num: number;
  ok: number;
  /** Тема и текст вопроса (из встроенных паков «Своей игры», только текстовые) */
  theme: string;
  q: string;
  endsAt: number;
  total: number;
  /** Итог прошлого вопроса (на reveal и до следующего ответа): ответ из пака и угадал ли */
  last: { answer: string; ok: boolean } | null;
}

/** Заказ пака кнопкой «Сыграть» в окне «Ракушки» (любой игрок; один заказ на вид пака, новый заменяет старый) */
export interface QzOrder extends QzPackRef {
  kind: QzPackKind;
  by: QzWho;
  at: number;
}

/** Человек внутри ограды — для облачков, значков голоса и ников по Alt */
export interface QzPerson extends QzWho {
  /** Номер кресла (не места) или −1 — стоит */
  chair: number;
  /** Роль сейчас */
  role: QzPersonRole;
  /** За какую карточку голосует (−1 — нет) */
  vote: number;
  /** Часть 2, «Кто из нас?»: титулы над ником до конца игры */
  titles?: string[];
}

/** Полный снимок для тех, кто внутри ограды */
export interface QzView extends QzBoard {
  people: QzPerson[];
  /** Вызов роли (шаг roles и между загадками) */
  call: QzCall | null;
  /** «Сменить игру?»: сколько нажало и сколько нужно (большинство сидящих); null — сейчас нельзя */
  swap: { n: number; need: number } | null;
  /** Перекрывает riddle из QzBoard: со строками */
  riddle: QzRiddleView | null;
  /** Часть 2: то же, что на табло, плюс строки «В игру» */
  jp?: QzJpView | null;
  croc?: QzCrocView | null;
  who?: QzWhoView | null;
  /** «Ракушка» 1.1, A1: «Ещё раз!» на итогах — сколько нажало и сколько нужно (большинство, как у swap); null — нельзя */
  again?: { n: number; need: number } | null;
  /** E1: свежие «Браво!» (не старше QZ.BRAVO_SHOW_MS) — кто хлопает и когда нажал */
  bravo?: Array<{ slot: number; at: number }>;
  /** Заказанные паки (кнопка «Сыграть»): по одному на вид */
  orders?: QzOrder[];
}

/** Своё — каждому внутри ограды отдельно */
export interface QzMe {
  slot: number;
  /** Номер места (аргумент ACT_QUIZ) или −1 — стоит */
  place: number;
  role: QzPersonRole;
  /** Мой голос (−1 — нет) и нажал ли «Сменить игру?» (и могу ли — сижу или загадываю) */
  vote: number;
  swap: boolean;
  canSwap: boolean;
  /** Могу ли нажать «Сыграем?» (сижу, игры нет, внутри ≥ 2) */
  canPlay: boolean;
  /** Вызов роли адресован мне (или открыт для всех и я могу взять) */
  canTake: boolean;
  /** Раньше этого момента строку «В игру» не примут (0 — можно) */
  gapUntil: number;
  /** Загадывающему: своё слово, номера строк «похоже на ответ» (одна-две опечатки) и подсказок осталось */
  word?: string;
  near?: number[];
  hintsLeft?: number;
  /** Итог: место (1…; 0 — ведущий/зритель без места, показывать только жетоны), очки, жетоны за игру (минуты + бонусы) */
  result?: { place: number; pts: number; tokens: number };
  /** Часть 2 — своё в режимах (нет поля — не участвую) */
  jp?: QzJpMe;
  croc?: QzCrocMe;
  who?: QzWhoMe;
  /** Жетоны квизов сегодня и потолок (для строки «сегодня 120 из 400 🪙» в окне «Ракушка») */
  dayCoins?: number;
  /** «Ракушка» 1.1, A1: я нажал «Ещё раз!» и могу ли нажать (итоги идут, я сижу или был в игре) */
  again?: boolean;
  canAgain?: boolean;
  /** A3: моё место в очереди «Хочу загадать» (1 — следующий; 0 — не в очереди) и заготовленное слово */
  queuePos?: number;
  prep?: { word: string; cat: QzCategory; hint: string } | null;
  /** F3: могу начать разминку (я один сижу, игры нет) */
  canWarm?: boolean;
  /** Паки: могу ли загружать (QUIZ_UPLOADERS) и почему нельзя — готовая строка для окна */
  canUpload?: boolean;
  uploadWhy?: string;
}

// ================================================================== часть 2 (docs/quiz/tech.md §18–§26)

/** Роли вызова: загадывающий, рисующий, ведущий «Своей игры», игрок за пультом */
export type QzRole = 'riddler' | 'drawer' | 'host' | 'player';
/** Роль человека сейчас ('' — гость в зале) */
export type QzPersonRole = '' | QzRole;

/** «Своя игра» (бриф «Режимы → 1», решения ведущего 30.10). Время — мс. */
export const QZ_JP = {
  PLAYERS_MIN: 2,
  PLAYERS_MAX: 6,
  /** Вызов «Веду я» / «Играю» — 10 с; игроков меньше двух — ещё раз 10 с, потом «Не набралось игроков» */
  CALL_MS: 10_000,
  /** Живой ведущий выбирает пак и темы у трибуны (реш. арх.): не успел — ведёт Затейник, пак выбирает зал */
  SETUP_MS: 90_000,
  /** Зал выбирает 1 из 3 паков, когда ведёт Затейник; все проголосовали — ещё 3 с */
  PACKVOTE_MS: 10_000,
  PACKVOTE_ALL_MS: 3_000,
  PACKVOTE_OPTIONS: 3,
  /** Тем в раунде игры: от 3 до 6 (табло); цен в теме — до 6 */
  THEMES_MIN: 3,
  THEMES_MAX: 6,
  PRICES_MAX: 6,
  /** Выбор клетки игроком с ходом; думает дольше — клетка случайная */
  PICK_MS: 15_000,
  /** «Кот в мешке»: кому отдать (реш. арх.); не выбрал — случайному */
  CAT_MS: 10_000,
  /** Чтение: кнопки откроются через 1,5 с + 50 мс на знак, от 2 до 8 с; со звуком — плюс длина звука (до 60 с) */
  READ_BASE_MS: 1_500,
  READ_PER_CHAR_MS: 50,
  READ_MIN_MS: 2_000,
  READ_MAX_MS: 8_000,
  /** Кнопки открыты: на первое нажатие 8 с; после неверного ответа остальным — 5 с */
  BUZZ_MS: 8_000,
  REBUZZ_MS: 5_000,
  /** Нажал раньше — «Рано!», кнопка заблокирована на 1 с */
  EARLY_LOCK_MS: 1_000,
  /** Честная кнопка: после первого нажатия ждём 150 мс; поправка — половина пинга, не больше 150 мс */
  BUZZ_WINDOW_MS: 150,
  HALF_PING_MAX_MS: 150,
  /** Ответ: живой ведущий — 10 с (+5 с кнопкой, до 2 раз); Затейник — только текстом, 15 с */
  ANSWER_MS: 10_000,
  ANSWER_ZAT_MS: 15_000,
  MORE_MS: 5_000,
  MORE_MAX: 2,
  /** После времени ответа живой ведущий судит до 10 с (реш. арх.); не судил — «не засчитано» без штрафа */
  JUDGE_MS: 10_000,
  /** Никто не ответил — ведущий открывает ответ сам или через 3 с открывается сам */
  SHOW_AUTO_MS: 3_000,
  /** Ответ и комментарий на табло (реш. арх.) */
  REVEAL_MS: 4_000,
  /** «Оспорить» (ведёт Затейник): 5 с на кнопку у ответившего, 6 с на голос остальных игроков */
  DISPUTE_OFFER_MS: 5_000,
  DISPUTE_VOTE_MS: 6_000,
  /** Ушёл посреди игры: пульт «отошёл», счёт держится 2 минуты */
  AWAY_MS: 120_000,
  /** Игроков у пультов (не «отошёл») меньше двух дольше этого — игра кончается (реш. арх.) */
  FEW_MS: 30_000,
  /** Финал: убрать тему — 10 с на ход; ставка — 20 с; ответ текстом — 30 с; живой ведущий судит до 60 с (реш. арх.);
   *  раскрытие — по 4 с на игрока (реш. арх.) */
  FINAL_REMOVE_MS: 10_000,
  FINAL_BET_MS: 20_000,
  FINAL_ANSWER_MS: 30_000,
  FINAL_JUDGE_MS: 60_000,
  FINAL_REVEAL_MS: 4_000,
  /** Длина ответа текстом */
  ANSWER_MAX: 120,
} as const;

/** «Крокодил» (бриф «Режимы → 3», решения ведущего 30.10: круг — каждый желающий рисует раз, до 6) */
export const QZ_CROC = {
  /** Рисунков в игре — до 6 */
  TURNS_MAX: 6,
  /** Выбор 1 из 3 слов (лёгкое, среднее, сложное); не выбрал — случайное */
  WORDS_MS: 10_000,
  DRAW_MS: 80_000,
  /** Буквы открываются, когда до конца осталось 40 с и 20 с — по одной */
  LETTERS_AT_MS: [40_000, 20_000],
  REVEAL_MS: 4_000,
  /** Холст 4:3 */
  W: 1024,
  H: 768,
  /** 8 цветов (номер в палитре кита) + ластик (номер 8); толщины — 3 (номер 0–2), ластик — своя */
  COLORS: ['#16313a', '#e5484d', '#ff7a5c', '#ffcd4a', '#56c07d', '#12958f', '#4b48c9', '#8a5a2b'],
  ERASER: 8,
  ERASER_COLOR: '#fffdf7',
  WIDTHS: [4, 10, 22],
  ERASER_WIDTH: 44,
  /** Мазки — пачками раз в 50 мс; в пачке до 64 точек; на рисунок — до 400 мазков и 20 000 точек */
  INK_BATCH_MS: 50,
  INK_PTS_MSG: 64,
  INK_STROKES: 400,
  INK_PTS: 20_000,
  /** Тем, кто снаружи ограды, мазки — склеенные, не чаще раза в 250 мс */
  INK_OUTSIDE_MS: 250,
  /** Очки по порядку угадывания: 5, 4, 3, дальше по 2; рисующему +2 за угадавшего, до +10; множитель сложности */
  PTS_ORDER: [5, 4, 3],
  PTS_REST: 2,
  PTS_DRAWER: 2,
  PTS_DRAWER_CAP: 10,
  MULT: [1, 1.5, 2],
} as const;

/** «Кто из нас?» (бриф «Режимы → 4»; от 4 человек — решение ведущего) */
export const QZ_WHO = {
  /** Участники — сидящие: от 4 до 12 (первые 12 севших) */
  MIN: 4,
  MAX: 12,
  /** Свои вопросы перед стартом: 30 с, до двух на человека, титул — через «=» */
  ASK_MS: 30_000,
  OWN_MAX: 2,
  Q_MAX: 120,
  TITLE_MAX: 30,
  ROUNDS: 10,
  /** Тайный голос кликом по желейке: 15 с; все проголосовали — ещё 3 с */
  VOTE_MS: 15_000,
  VOTE_ALL_MS: 3_000,
  /** Раскрытие на табло (реш. арх.) */
  REVEAL_MS: 6_000,
  /** Каждому, кто голосовал за лидера, +1 */
  PTS: 1,
} as const;

/** Жетоны квизов (бриф «Жетоны и рекорды», анти-абуз — решения ведущего 30.10) */
export const QZ_TOKENS = {
  /** 8 🪙 за минуту активной игры: за последние 2 минуты было действие */
  PER_MIN: 8,
  ACTIVE_MS: 120_000,
  /** Потолок квизов — 400 🪙 в день на игрока (день по Москве, как у аркады) */
  DAY_CAP: 400,
  /** Меньше трёх людей внутри ограды — жетонов нет (и минутных, и бонусов) */
  MIN_PEOPLE: 3,
  /** «Своя игра»: места (если игроков от трёх) и ведущему-человеку за доигранную игру */
  JP_PLACES: [100, 50, 25],
  JP_PLACES_MIN: 3,
  JP_HOST: 50,
  /** «Загадка»: разгадал +15, загадывающему +10 — если раунд шёл ≥ 60 с, гадали ≥ 2 разных и паре «загадал–угадал»
   *  в этот час дали меньше 3 таких бонусов */
  RD_SOLVER: 15,
  RD_RIDDLER: 10,
  RD_MIN_MS: 60_000,
  RD_MIN_GUESSERS: 2,
  RD_PAIR_HOUR: 3,
  /** «Крокодил»: места по очкам игры */
  CR_PLACES: [60, 30, 15],
  /** «Кто из нас?»: самый «в теме» +40 — от 5 участников */
  WHO_BEST: 40,
  WHO_BEST_MIN: 5,
} as const;

/** Паки (бриф «Общие системы → Паки») */
export const QZ_PACK = {
  QUESTIONS: 600,
  /** Файлы пака вместе — до 30 МБ; картинка — до 2 МБ (после ужатия до 1280 px в WebP), звук — до 1,5 МБ и 60 с */
  BYTES: 30 * 1024 * 1024,
  IMAGE_BYTES: 2 * 1024 * 1024,
  AUDIO_BYTES: 1.5 * 1024 * 1024,
  AUDIO_SEC: 60,
  IMAGE_SIDE: 1280,
  /** JSON пака в POST — до 2 МБ */
  JSON_BYTES: 2 * 1024 * 1024,
  /** Паков в день на игрока, всего на сервере, с какого уровня можно загружать */
  DAY_UPLOADS: 5,
  TOTAL_BYTES: 2 * 1024 * 1024 * 1024,
  MIN_LEVEL: 3,
  /** Билет загрузки живёт 5 минут */
  TICKET_MS: 5 * 60_000,
  /** Длины строк */
  TITLE: 60,
  THEME: 60,
  TEXT: 500,
  ANSWER: 120,
  ANSWERS: 8,
  COMMENT: 300,
  WORD: 40,
  WORDS: 2000,
  /** Расширения файлов, которые принимает сервер (проверяет и сигнатуру) */
  IMAGE_EXT: ['webp', 'png', 'jpg', 'gif'],
  AUDIO_EXT: ['mp3', 'ogg', 'm4a'],
  /** «Ракушка» 1.1, F5: пак по ссылке из библиотеки SIGame — сервер скачивает .siq только с этих адресов
   *  (https, путь /sistorage/), не больше FETCH_BYTES, за FETCH_MS; дальше разбор в браузере, как у файла */
  FETCH_HOSTS: ['vladimirkhil.com'],
  FETCH_API: 'https://vladimirkhil.com/sistorage/api/v1/packages/',
  FETCH_BYTES: 100 * 1024 * 1024,
  FETCH_MS: 60_000,
} as const;

// ------------------------------------------------------------------ пак (JSON — одинаковый у разбора в браузере,
// у сервера и у встроенных паков; поля — как у lab/quiz/js/siq.js и packtext.js)

export type QzPackKind = 'jeopardy' | 'words' | 'whoofus' | 'riddles';
/** Тип вопроса SIGame: «Кот в мешке», «Ставка», «Без риска», «Для всех», прочие — играются как обычные, кроме cat и noRisk */
export type QzQType = 'simple' | 'cat' | 'auction' | 'noRisk' | 'forAll' | 'other';

/** Кусок вопроса: текст (say — «говорит ведущий», на табло не пишется) или файл пака (<sha256>.<ext>) */
export type QzContent =
  | { kind: 'text'; value: string; say?: boolean }
  | { kind: 'image'; file: string }
  | { kind: 'audio'; file: string; sec: number };

export interface QzQuestion {
  /** Цена; в финале — 0 */
  price: number;
  type: QzQType;
  content: QzContent[];
  /** Что показать вместе с ответом (картинка, текст) */
  reveal: QzContent[];
  /** Верные ответы (варианты «/» и «принимается: …» уже разобраны); первый — главный, его показывает табло */
  answers: string[];
  /** Заведомо неверные (SIGame wrong) — Затейник их не засчитает даже при совпадении букв */
  wrong: string[];
  comment: string;
  /** «Кот в мешке» в SIGame — со своей темой (показывается получившему) */
  catTheme?: string;
}

export interface QzTheme {
  name: string;
  questions: QzQuestion[];
}

export interface QzRound {
  name: string;
  /** Финал: по одному вопросу на тему */
  final: boolean;
  themes: QzTheme[];
}

export interface QzPack {
  /** Версия формата */
  v: 1;
  title: string;
  author: string;
  kind: QzPackKind;
  /** 18+: Затейник такие сам не выбирает, в каталоге — пометка */
  adult: boolean;
  tags: string[];
  source: { format: 'text' | 'csv' | 'siq' | 'builtin'; name?: string };
  /** jeopardy */
  rounds: QzRound[];
  /** words — слова «Крокодила» по сложности */
  words?: { easy: string[]; mid: string[]; hard: string[] };
  /** whoofus — вопросы «Кто из нас?», титул по желанию */
  who?: Array<{ q: string; title?: string }>;
  /** riddles — данетки (после паков, в части 2 не играются) */
  riddles?: Array<{ story: string; answer: string }>;
}

/** Файл в загрузке: что браузер собирается прислать PUT-ом */
export interface QzUpFile {
  /** sha256 содержимого, 64 hex */
  sha256: string;
  ext: (typeof QZ_PACK.IMAGE_EXT)[number] | (typeof QZ_PACK.AUDIO_EXT)[number];
  kind: 'image' | 'audio';
  size: number;
  /** Звук — длина, с */
  sec?: number;
}

/** Строка каталога */
export interface QzPackInfo {
  /** 12 hex; встроенные — 'b-<имя>' */
  id: string;
  title: string;
  author: string;
  kind: QzPackKind;
  adult: boolean;
  rounds: number;
  themes: number;
  questions: number;
  bytes: number;
  /** Когда загружен (часы сервера; встроенные — 0) */
  at: number;
  /** Сколько раз сыграли, сколько 👍 */
  plays: number;
  likes: number;
  builtin: boolean;
  /** Каждому своё: могу ли удалить (автор или QUIZ_ADMINS), лайкал ли */
  canDel: boolean;
  liked: boolean;
}

/** Ссылка на пак в игре */
export interface QzPackRef {
  id: string;
  title: string;
}

/** Состав пака для выбора раунда и тем (без вопросов и ответов) */
export interface QzPackOutline {
  info: QzPackInfo;
  rounds: Array<{ name: string; final: boolean; themes: Array<{ name: string; prices: number[] }> }>;
}

// ------------------------------------------------------------------ «Своя игра»: снимок

/** Шаги «Своей игры»: setup — живой ведущий выбирает пак у трибуны; packvote — зал выбирает пак (ведёт Затейник);
 *  pick — игрок с ходом выбирает клетку; cat — «Кот в мешке»: кому отдать; read — вопрос, кнопки скоро откроются;
 *  buzz — кнопки открыты; answer — отвечает тот, кто нажал первым; judge — ведущий судит (время ответа вышло);
 *  wrong — «Неверно» (у ответившего «Оспорить», ведёт Затейник); dispute — игроки голосуют «засчитать?»;
 *  reveal — ответ на табло; fremove / fbet / fanswer / fjudge / freveal — финал */
export type QzJpStep =
  | 'setup' | 'packvote' | 'pick' | 'cat' | 'read' | 'buzz' | 'answer' | 'judge' | 'wrong' | 'dispute' | 'reveal'
  | 'fremove' | 'fbet' | 'fanswer' | 'fjudge' | 'freveal';

export interface QzJpPlayer extends QzWho {
  /** Номер пульта 0–5 */
  pult: number;
  score: number;
  /** «Отошёл» до этого момента (0 — у пульта): потом пульт свободен */
  away: number;
}

/** Вопрос на табло (без ответа) */
export interface QzJpQuestion {
  theme: string;
  price: number;
  type: QzQType;
  /** Номер темы и клетки на табло */
  th: number;
  cell: number;
  /** Содержимое без кусков say; файлы — /quiz/m/<pack.id>/<file> */
  content: QzContent[];
}

export interface QzJpBoard {
  step: QzJpStep;
  pack: QzPackRef | null;
  /** Название раунда, будет ли финал */
  round: string;
  final: boolean;
  /** Ведущий: человек у трибуны или null — Затейник */
  host: QzWho | null;
  players: QzJpPlayer[];
  /** Чей ход (slot; 0 — ничей) */
  turn: number;
  /** Табло: темы строками, цены столбцами; 0 — клетка сыграна */
  themes: Array<{ name: string; cells: number[] }>;
  /** packvote: три пака и голоса */
  /** «Ракушка» 1.1: by — ник заказавшего «Сыграть» (карточка первая), fresh — загружен и ещё не сыгран («новый») */
  packs: Array<QzPackRef & { sub: string; n: number; by?: string; fresh?: boolean }> | null;
  q: QzJpQuestion | null;
  /** Кнопки откроются / открылись (часы сервера; 0 — не открываются сейчас) */
  openAt: number;
  /** Кто отвечает (лампа на пульте горит) */
  buzz: QzWho | null;
  /** Ошиблись на этом вопросе — больше не жмут (slot) */
  out: number[];
  /** Текст ответа отвечающего, когда он его отправил (голосом — пусто) */
  said: string;
  /** Решение по последнему ответу */
  verdict: '' | 'yes' | 'no';
  /** Ответ и комментарий — только на reveal / freveal */
  answer: { text: string; comment: string; reveal: QzContent[] } | null;
  /** «Оспорить»: кто, голоса «засчитать» / «нет» */
  dispute: { by: QzWho; yes: number; no: number } | null;
  /** Финал: оставшиеся темы, кто убирает, кто уже поставил и ответил; раскрытые строки — по одной на freveal */
  fin: {
    themes: string[];
    remover: number;
    bet: number[];
    answered: number[];
    shown: Array<QzWho & { text: string; ok: boolean; bet: number }>;
  } | null;
  /** Конец текущего шага (часы сервера) и его длина */
  endsAt: number;
  total: number;
}

export interface QzJpView extends QzJpBoard {
  lines: QzLine[];
  /** «Посадить за пульт»: кто просится на свободный пульт (видит ведущий-человек) */
  asks: QzWho[];
}

export interface QzJpMe {
  /** Мой пульт (−1 — не играю) */
  pult: number;
  /** Можно жать сейчас; «Рано!» — заблокирован до lockUntil */
  canBuzz: boolean;
  lockUntil: number;
  /** Я отдаю «Кота в мешке» */
  cat: boolean;
  /** Ведущему: ответ из пака (все варианты), неверные, комментарий, «говорит ведущий» — на read / answer / judge */
  host?: { answers: string[]; wrong: string[]; comment: string; say: string[]; catTheme?: string };
  /** Финал: моя ставка (0 — нет) и мой ответ отправлен */
  bet?: number;
  fanswered?: boolean;
  /** Ведущему в fjudge: ответы игроков */
  fanswers?: Array<QzWho & { text: string; ok: '' | 'yes' | 'no' }>;
  /** «Оспорить» доступно мне / мой голос в споре нужен */
  canDispute?: boolean;
  canJudgeDispute?: boolean;
  /** «Ракушка» 1.1, A2: в packvote могу стать ведущим («Веду я» — F или E у трибуны): ведущего нет, я не за пультом */
  canHost?: boolean;
}

// ------------------------------------------------------------------ «Крокодил»: снимок

/** Шаги: call — кто рисует (очередь, QzView.call); words — рисующий выбирает слово; draw — рисует; reveal — итог */
export type QzCrocStep = 'call' | 'words' | 'draw' | 'reveal';
export type QzCrocEnd = 'all' | 'timeout' | 'left' | 'swap' | 'empty';

export interface QzCrocBoard {
  step: QzCrocStep;
  /** Рисунок по счёту и сколько будет (очередь + сыгранные, до 6) */
  num: number;
  of: number;
  drawer: QzWho | null;
  /** Очередь «Хочу рисовать» */
  queue: QzWho[];
  /** Маска слова: «_ _ _ _», открытые буквы на местах, пробелы — как есть; сложность 0–2 */
  mask: string;
  level: number;
  /** Угадавшие по порядку с очками */
  guessed: QzScoreRow[];
  /** Номер рисунка для мазков (qzInk.d) */
  drawing: number;
  endsAt: number;
  total: number;
  last: { end: QzCrocEnd; word: string; drawer: QzWho; guessed: number } | null;
}

export interface QzCrocView extends QzCrocBoard {
  lines: QzLine[];
}

export interface QzCrocMe {
  /** Я в очереди / уже рисовал в этом круге */
  queued: boolean;
  drew: boolean;
  /** Рисующему: три слова на выбор (words) и выбранное (draw) */
  choices?: [string, string, string];
  word?: string;
  /** Я угадал этот рисунок */
  got: boolean;
}

/** Мазок: номер (растёт в рисунке), цвет 0–8 (8 — ластик), толщина 0–2, точки x, y подряд (целые в 1024 × 768) */
export type QzInkOp =
  /** Начать мазок или дописать точки в мазок id */
  | ['s', number, number, number, ...number[]]
  /** Убрать мазок id («отмена», Z) */
  | ['u', number]
  /** Очистить холст */
  | ['x']
  /** «Ракушка» 1.1, C6: заливка — номер (как у мазка, отменяется ['u', id]), цвет 0–8, точка x, y. Область считает
   *  каждый клиент сам и одинаково: по маске мазков (без сглаживания), заливки лежат слоем под мазками */
  | ['f', number, number, number, number];

// ------------------------------------------------------------------ «Кто из нас?»: снимок

/** Шаги: ask — 30 с на свои вопросы; vote — тайный голос; reveal — раскрытие */
export type QzWhoStep = 'ask' | 'vote' | 'reveal';

export interface QzTitle extends QzWho {
  title: string;
}

export interface QzWhoBoard {
  step: QzWhoStep;
  /** Вопрос по счёту и всего */
  num: number;
  of: number;
  /** Участники (сидящие, до 12) — карточки и цель голоса */
  players: QzWho[];
  /** Вопрос и титул (без титула — сервер берёт хвост вопроса: «первым уснёт на рыбалке») */
  q: string;
  title: string;
  /** Автор своего вопроса (null — из пака) */
  by: QzWho | null;
  /** ask: сколько своих вопросов набралось */
  asked: number;
  /** vote: сколько проголосовало из скольких; «Пропустить вопрос»: нажало и нужно */
  voted: number;
  skip: { n: number; need: number };
  /** reveal: голоса по участникам (кто за кого — не показываем) и лидеры */
  tally: Array<QzWho & { n: number }> | null;
  leaders: QzWho[];
  endsAt: number;
  total: number;
}

export interface QzWhoView extends QzWhoBoard {
  lines: QzLine[];
}

export interface QzWhoMe {
  /** Участвую (сижу и в числе первых 12) */
  in: boolean;
  /** За кого мой голос (slot, 0 — нет), нажал ли «Пропустить вопрос», сколько своих вопросов добавил */
  vote: number;
  skip: boolean;
  own: number;
  /** Мои очки «в теме» за игру */
  pts: number;
}

// ------------------------------------------------------------------ рекорды (вкладка «Рекорды» окна «Ракушка»)

/** Счётчики профиля (Stats в shared/economy.ts, поля qz*) — свои */
export interface QzMyRecs {
  jpGames: number;
  jpWins: number;
  jpBest: number;
  rdSolved: number;
  rdMade: number;
  crGuessed: number;
  crDrawn: number;
  whoTitles: number;
  dayCoins: number;
}

/** Лучшие по набережной: по 5 строк */
export interface QzTopRecs {
  jpWins: QzScoreRow[];
  rdSolved: QzScoreRow[];
  crGuessed: QzScoreRow[];
  whoTitles: QzScoreRow[];
}
