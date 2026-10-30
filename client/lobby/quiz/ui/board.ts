// Табло «Ракушки» (холст 2048 × 1024 на задней стене): paintBoard(ctx, снимок, часы сервера) рисует то, что идёт на сцене,
// во всех шагах и режимах. Перенос lab/quiz/v2/js/world/board*.js на TypeScript: функция «снимок → холст», без DOM.
// Перерисовку вызывает интегратор (venue3d.ts): не чаще 4 раз в секунду, и только когда снимок поменялся или идёт отсчёт.
// boardAnimating(b) подсказывает, когда на табло что-то движется (колесо при ничьей, конфетти, вспышки) — тогда
// стоит перерисовывать все 4 раза в секунду, а не раз в секунду.
import { QZ_MODES, type QzBoard } from '../../../../shared/quiz/types.ts';
import { BOARD_H, BOARD_W, PAD, boardBase, boardUi } from './board-base.ts';
import { paintJeopardyBoard, paintCrocBoard, paintWhoBoard, jpCellRect, packRect, crocRect } from './board-modes.ts';
import { paintRiddleBoard, paintRoles } from './board-riddle.ts';
import { cardRect, paintIdle, paintResults, paintVote, spinPos } from './board-vote.ts';

export { BOARD_H, BOARD_W, PAD, boardUi, cardRect, crocRect, jpCellRect, packRect, spinPos };

/** Нарисовать табло по снимку; nowMs — часы сервера (state.serverNow()), по ним считаются отсчёты и вспышки */
export function paintBoard(ctx: CanvasRenderingContext2D, b: QzBoard, nowMs: number): void {
  const W = ctx.canvas?.width || BOARD_W;
  const H = ctx.canvas?.height || BOARD_H;
  boardBase(ctx, W, H);
  switch (b.phase) {
    case 'vote':
      if (b.vote) return paintVote(ctx, b, nowMs, W, H);
      return paintIdle(ctx, b, W, H);
    case 'results':
      if (b.results) return paintResults(ctx, b, nowMs, W, H);
      return paintIdle(ctx, b, W, H);
    case 'roles':
    case 'game':
      if (b.mode === 'riddle' && b.riddle) return paintRiddleBoard(ctx, b, nowMs, W, H);
      if (b.mode === 'jeopardy' && b.jp) return paintJeopardyBoard(ctx, b, nowMs, W, H);
      if (b.mode === 'croc' && b.croc) return paintCrocBoard(ctx, b, nowMs, W, H);
      if (b.mode === 'whoofus' && b.who) return paintWhoBoard(ctx, b, nowMs, W, H);
      return paintRoles(ctx, b, nowMs, W, H);
    default:
      return paintIdle(ctx, b, W, H);
  }
}

/** Двигается ли что-то на табло само по себе (кроме секундного отсчёта): тогда перерисовка — 4 раза в секунду */
export function boardAnimating(b: QzBoard): boolean {
  if (b.phase === 'vote' && b.vote) return !!b.vote.spin || b.vote.win >= 0 || b.vote.nobody;
  if (b.phase === 'results') return true;
  if (b.phase === 'game') {
    const r = b.riddle;
    if (r && (r.step === 'reveal' || r.step === 'check' || r.warm > 0)) return true;
    if (b.jp && (b.jp.step === 'buzz' || b.jp.step === 'reveal' || b.jp.step === 'pick')) return true;
    if (b.croc && (b.croc.step === 'draw' || b.croc.step === 'reveal')) return true;
    if (b.who?.step === 'reveal') return true;
  }
  return false;
}

/** Название режима по id — для заголовков и подписей */
export const modeTitle = (b: QzBoard): string => QZ_MODES.find((m) => m.id === b.mode)?.name ?? 'Игра';
