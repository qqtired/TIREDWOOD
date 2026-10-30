// «Ракушка»: сообщения части 1 (сцена, голосование, «Загадка»). Подробно — docs/quiz/tech.md §3–§6.
// Подключение в shared/messages.ts — по одной строке в union (как ArcadeClientMsg):
//   import type { QuizClientMsg, QuizServerMsg } from './quiz/net.ts';  … | QuizClientMsg …  | QuizServerMsg …
// и поле приветствия набережной `quiz?: QzBoard` (нет поля — флаг QUIZ выключен).
//
// Сесть и встать — НЕ здесь: общие use / unuse (точки карты вида 'quiz', аргумент — номер места, shared/quiz/venue.ts),
// действие игрока ACT_QUIZ (shared/lobby.ts). Строка «Всем:» — общий chat хаба, как раньше.
import type {
  QzBoard, QzCategory, QzInkOp, QzMe, QzMyRecs, QzPack, QzPackInfo, QzPackOutline, QzRole, QzTopRecs, QzUpFile, QzView,
} from './types.ts';

/** Клиент → сервер. Все — только изнутри ограды; не по шагу или не по роли — сервер молча игнорирует. */
export type QuizClientMsg =
  /** Голос за карточку m (0–3, порядок QZ_MODES; клавиши 1–4, клик по плашке или по табло). Другой — передумал. */
  | { t: 'qz'; a: 'vote'; m: number }
  /** «Сыграем?» — сидящий, шаг idle: открыть голосование */
  | { t: 'qz'; a: 'play' }
  /** «Сменить игру?» — нажал (on) или передумал; большинство сидящих — новое голосование */
  | { t: 'qz'; a: 'swap'; on: boolean }
  /** Ответ на вызов роли: take — «Загадываю!» (F или клик), иначе «Пропустить». r — какая роль, если кнопок
   *  несколько (часть 2: «Веду я» — host, «Играю» — player, «Хочу рисовать» — drawer); без r — первая */
  | { t: 'qz'; a: 'role'; take: boolean; r?: QzRole }
  /** Окно «Что загадал?»: слово 2–40 знаков, тема из QZ_CATEGORIES, первая подсказка по желанию (до 40) */
  | { t: 'qz'; a: 'ask'; word: string; cat: QzCategory; hint?: string }
  /** Строка «В игру» (до QZ.LINE_MAX): у угадывающих в раунде — догадка, иначе реплика */
  | { t: 'qz'; a: 'say'; text: string }
  /** Загадывающий: отметить строку id — тепло (1), мимо (2), угадал (3). Клавиши — на самую старую неотмеченную:
   *  её id клиент берёт из снимка */
  | { t: 'qz'; a: 'mark'; id: number; m: 'warm' | 'miss' | 'win' }
  /** Загадывающий: снять отметку со строки id — «✕» в «Тепло», «↩ Вернуть» у «мимо»; строка снова неотмеченная */
  | { t: 'qz'; a: 'unmark'; id: number }
  /** Загадывающий: Z или «Отменить» — идёт проверка «угадал» → отменить её; иначе снять последнюю свою отметку
   *  «тепло» / «мимо» (сколько угодно раз подряд) */
  | { t: 'qz'; a: 'undo' }
  /** Загадывающий: подсказка (H, кнопка «Подсказка»), до 40 знаков, всего до 3 */
  | { t: 'qz'; a: 'hint'; text: string }
  /** Загадывающий: «Открыть ответ» на плашке, шаг round (не во время проверки) — загадка кончается как timeout
   *  («Не угадали: это был …»), считается сыгранной (решение ведущего 30.10) */
  | { t: 'qz'; a: 'giveup' }
  | QuizClientMsg2;

/** Часть 2 (docs/quiz/tech.md §18–§26). Те же правила: только изнутри ограды, не по шагу или роли — молча. */
export type QuizClientMsg2 =
  // --- «Своя игра»
  /** Ведущий-человек в setup: пак, номер раунда, номера тем (3–6), играть ли финал → «Начать» */
  | { t: 'qz'; a: 'jpStart'; pack: string; round: number; themes: number[]; final: boolean }
  /** Ведущий-человек в setup: «Пусть ведёт Затейник» — уйти с трибуны, пак выберет зал */
  | { t: 'qz'; a: 'jpZat' }
  /** packvote: голос за пак 0–2 (клавиши 1–3, клик по плашке или табло) */
  | { t: 'qz'; a: 'jpPv'; i: number }
  /** pick: игрок с ходом выбрал клетку (клик по 3D-табло) */
  | { t: 'qz'; a: 'jpPick'; th: number; cell: number }
  /** cat: «Кот в мешке» — отдать вопрос игроку slot */
  | { t: 'qz'; a: 'jpGive'; slot: number }
  /** Кнопка игрока (Пробел, клик по «Жму!»): время берёт сервер — приход минус половина пинга */
  | { t: 'qz'; a: 'jpBuzz' }
  /** Ответ текстом (Enter в поле ответа); answer, финал — fanswer */
  | { t: 'qz'; a: 'jpAns'; text: string }
  /** Ведущий-человек: открыть кнопки раньше (Пробел), ✓ / ✗ (1 / 2), +5 с, показать ответ (R), завершить раунд */
  | { t: 'qz'; a: 'jpOpen' }
  | { t: 'qz'; a: 'jpJudge'; ok: boolean }
  | { t: 'qz'; a: 'jpMore' }
  | { t: 'qz'; a: 'jpShow' }
  | { t: 'qz'; a: 'jpEnd' }
  /** Ведущий-человек: посадить просящегося за свободный пульт (или отказать) */
  | { t: 'qz'; a: 'jpSeat'; slot: number; ok: boolean }
  /** Ведёт Затейник: «Оспорить» (ответивший) и голос игроков «засчитать?» */
  | { t: 'qz'; a: 'jpDispute' }
  | { t: 'qz'; a: 'jpDv'; ok: boolean }
  /** Финал: убрать тему, тайная ставка (1…свой счёт), ответ, решение ведущего по игроку slot */
  | { t: 'qz'; a: 'jpDrop'; th: number }
  | { t: 'qz'; a: 'jpBet'; n: number }
  | { t: 'qz'; a: 'jpFans'; text: string }
  | { t: 'qz'; a: 'jpFjudge'; slot: number; ok: boolean }
  // --- «Крокодил»
  /** words: выбрать слово 0–2 (1–3 или клик) */
  | { t: 'qz'; a: 'crWord'; i: number }
  /** draw: пачка мазков (раз в 50 мс, до 64 точек) — только рисующий */
  | { t: 'qz'; a: 'crInk'; ops: QzInkOp[] }
  // --- «Кто из нас?»
  /** ask: свой вопрос (до 120, титул через «=»; до двух) */
  | { t: 'qz'; a: 'whoAsk'; text: string }
  /** vote: тайный голос за участника slot (клик по желейке; не за себя); другой — передумал */
  | { t: 'qz'; a: 'whoVote'; slot: number }
  /** vote: «Пропустить вопрос» — нажал или передумал */
  | { t: 'qz'; a: 'whoSkip'; on: boolean }
  // --- окно «Ракушка» (у трибуны): паки, загрузка, рекорды
  /** Каталог: поиск по названию и автору, вид пака */
  | { t: 'qz'; a: 'packs'; q?: string; kind?: QzPack['kind'] }
  /** Состав пака (раунды и темы) — для выбора тем */
  | { t: 'qz'; a: 'packOutline'; id: string }
  /** Удалить пак (автор или QUIZ_ADMINS) — в корзину DATA_DIR/quiz/trash */
  | { t: 'qz'; a: 'packDel'; id: string }
  /** 👍 паку после игры (один раз на игрока) */
  | { t: 'qz'; a: 'packLike'; id: string }
  /** Билет на загрузку: дальше HTTP (§20) */
  | { t: 'qz'; a: 'upTicket' }
  /** Вкладка «Рекорды» */
  | { t: 'qz'; a: 'recs' };

/** Отказ с причиной — тост у игрока. code — для клиента (что подсветить), text — готовая строка для игрока */
export type QzErrCode = 'rate' | 'answer' | 'word' | 'hints' | 'busy' | 'few'
  /** часть 2: «Почти!» (личная подсказка, не ошибка), рано нажал, уровень для загрузки, дневной предел, пак не найден
   *  или не твой, пульт занят или нужно согласие ведущего */
  | 'near' | 'early' | 'level' | 'limit' | 'pack' | 'seat';

/** Сервер → клиент */
export type QuizServerMsg =
  /** Внутри ограды: полный снимок + своё. При входе за ограду — сразу, дальше при изменении, не чаще QZ.SNAP_MIN_MS */
  | { t: 'qz'; v: QzView; me: QzMe }
  /** Снаружи ограды (вся остальная набережная): табло и вывеска. При выходе за ограду — сразу (клиент убирает
   *  интерфейс «Ракушки»), дальше при изменении, не чаще QZ.SNAP_MIN_MS */
  | { t: 'qzBoard'; b: QzBoard }
  /** Отказ: «Не так быстро — через 3 с», «Нельзя писать ответ — опиши иначе», «Место занято»… wait — через сколько мс можно */
  | { t: 'qzErr'; code: QzErrCode; text: string; wait?: number }
  | QuizServerMsg2;

/** Сервер → клиент, часть 2 */
export type QuizServerMsg2 =
  /** Мазки «Крокодила»: d — номер рисунка (QzCrocBoard.drawing). Внутри ограды — каждая пачка сразу, снаружи — склеенные
   *  раз в 250 мс. full — весь рисунок заново (вошёл в ограду, подключился, новый рисунок — пустой full) */
  | { t: 'qzInk'; d: number; ops: QzInkOp[]; full?: boolean }
  /** Каталог по запросу packs (до 50 строк) и после удаления; admin — я в QUIZ_ADMINS */
  | { t: 'qzPacks'; list: QzPackInfo[]; total: number; admin: boolean }
  | { t: 'qzPackOutline'; outline: QzPackOutline }
  /** Билет загрузки (5 минут, на один пак); left — сколько паков ещё можно сегодня */
  | { t: 'qzTicket'; ticket: string; exp: number; left: number }
  | { t: 'qzRecs'; me: QzMyRecs; top: QzTopRecs };

// ------------------------------------------------------------------ HTTP загрузки паков (server/lobby/quiz/http.ts)
// Заголовок билета у всех трёх запросов: X-Quiz-Ticket: <билет из qzTicket>. Ответы — JSON, ошибки — {ok: false, error}
// с готовой строкой для игрока. Пути:
//   POST /quiz/up                      тело QzUpBody (до 2 МБ)         → QzUpStart
//   PUT  /quiz/up/<id>/<sha256>.<ext>  тело — байты файла               → {ok: true, left: число ещё не присланных}
//   POST /quiz/up/<id>/done            без тела                         → {ok: true, info: QzPackInfo}
//   GET  /quiz/m/<packId>/<sha256>.<ext> — файл пака (картинка, звук), без билета
export const QZ_TICKET_HEADER = 'x-quiz-ticket';

export interface QzUpBody {
  pack: QzPack;
  files: QzUpFile[];
}

export interface QzUpStart {
  ok: true;
  /** Черновик пака (живёт, пока жив билет) */
  id: string;
  /** Какие файлы прислать PUT-ом: <sha256>.<ext> */
  need: string[];
}

/** Флаг QUIZ: явная 1 — включён, 0 — выключен, без переменной — только в npm run dev. Площадка есть только в plaza3. */
export function quizEnabled(raw: string | undefined, dev: boolean, plaza3: boolean): boolean {
  return plaza3 && (raw === '1' || (raw === undefined && dev));
}
