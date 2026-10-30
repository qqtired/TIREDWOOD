// «Ракушка»: действие ACT_QUIZ и места (docs/quiz/tech.md §2). Аргумент действия — номер места площадки
// (shared/quiz/venue.ts: кресла, пульты, трибуна, точка загадывающего, мольберт).
import { QUIZ_VENUE, placeAt, seatCamera, stageCamera, type QuizCam, type QuizPlace } from '../../../shared/quiz/venue.ts';

export { ACT_QUIZ } from '../../../shared/lobby.ts';

/** Место по аргументу ACT_QUIZ (null — нет такого) */
export function quizPlace(arg: number): QuizPlace | null {
  return placeAt(arg);
}

/** Сидит ли желейка на этом месте (кресло) — поза сидя (client/render/avatar.ts) */
export function quizSits(arg: number): boolean {
  return placeAt(arg)?.sit === true;
}

/** Камера места: кресло — зрительская (на табло), остальное — сценическая за спиной */
export function quizCamera(p: QuizPlace): QuizCam {
  return p.kind === 'chair' ? seatCamera(QUIZ_VENUE.chairs[p.n]) : stageCamera(p);
}
