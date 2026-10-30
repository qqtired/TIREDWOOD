// «Ракушка»: действие ACT_QUIZ и места (docs/quiz/tech.md §2). Аргумент действия — номер места площадки
// (shared/quiz/venue.ts: кресла, пульты, трибуна, точка загадывающего, мольберт).
import { QUIZ_VENUE, easelCamera, hostCamera, placeAt, seatCamera, stageCamera, tvCamera, type QuizCam, type QuizPlace } from '../../../shared/quiz/venue.ts';

import type { QzBoard } from '../../../shared/quiz/types.ts';

export { ACT_QUIZ } from '../../../shared/lobby.ts';

/** Место по аргументу ACT_QUIZ (null — нет такого) */
export function quizPlace(arg: number): QuizPlace | null {
  return placeAt(arg);
}

/** Сидит ли желейка на этом месте (кресло) — поза сидя (client/render/avatar.ts) */
export function quizSits(arg: number): boolean {
  return placeAt(arg)?.sit === true;
}

/** Ник над желейкой не рисуем: загадывающий на сцене (табло и так пишет, кто загадывает, а ник ложится на табло) */
export function quizNoTag(arg: number): boolean {
  return placeAt(arg)?.kind === 'riddler';
}

/** Камера места: кресло — зрительская (на табло); сцена — за спиной; пульт — «телекамера»; трибуна — ведущего; мольберт — холст */
export function quizCamera(p: QuizPlace): QuizCam {
  switch (p.kind) {
    case 'chair': return seatCamera(QUIZ_VENUE.chairs[p.n]);
    case 'pult': return tvCamera();
    case 'podium': return hostCamera();
    case 'drawer': return easelCamera();
    default: return stageCamera(p);
  }
}

/** Какие пульты наверху: у игроков «Своей игры» (пульт держится и у «отошедшего»); конец игры — все в люках */
export function pultsUp(b: QzBoard | null): boolean[] {
  const jp = b?.phase === 'game' && b.mode === 'jeopardy' ? (b.jp ?? null) : null;
  return QUIZ_VENUE.pults.map((_, i) => !!jp?.players.some((p) => p.pult === i));
}
