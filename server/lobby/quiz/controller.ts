import type { QuizClientMsg, QuizServerMsg, QzErrCode } from '../../../shared/quiz/net.ts';
import type { RiddleWho } from '../../../shared/quiz/riddle.ts';
import type { QuizMode, QzBoard, QzCall, QzMe, QzPersonRole, QzResults, QzView, QzZatClip, QzPackKind, QzOrder } from '../../../shared/quiz/types.ts';
import type { VenueSpot } from '../../../shared/quiz/venue.ts';
import type { JeopardyPack } from '../../../shared/quiz/jeopardy.ts';
import type { QuizRewardEvent } from './tokens.ts';
import type { QuizPacks } from './packs.ts';

export interface ModePerson extends RiddleWho { chair: number; seatedAt: number }
export interface ModeError { code: QzErrCode; text: string; wait?: number }
export interface ModeResult {
  players: Array<RiddleWho & { pts: number }>;
  completed: boolean;
  pack?: QzResults['pack'];
  titles?: QzResults['titles'];
}
export interface ModeHost {
  people(): ModePerson[];
  rand(): number;
  hold(slot: number, place: number): void;
  release(slot: number, to?: VenueSpot): void;
  say(text: string, clip: QzZatClip, now: number): void;
  packs(kind: QzPackKind): JeopardyPack[];
  store?: QuizPacks;
  ping(slot: number): number;
  ink(msg: Extract<QuizServerMsg, { t: 'qzInk' }>): void;
  /** «Ракушка» 1.1: заказ кнопкой «Сыграть» на этот вид пака (null — нет). Режим снимает заказ orderUsed,
   *  когда пак действительно пошёл в игру (у «Своей игры» — выбран и сыгран вопрос) */
  order?(kind: QzPackKind): QzOrder | null;
  orderUsed?(kind: QzPackKind, id: string): void;
}

/** Общая граница сцены и режимов. У «Загадки» вызов и возврат в кресло остаются в сцене. */
export interface QuizController {
  readonly mode: QuizMode;
  nextId: number;
  accepted: boolean;
  message(who: RiddleWho, msg: QuizClientMsg, guessers: number, now: number): ModeError | undefined;
  tick(now: number): 'askTimeout' | 'next' | 'done' | null;
  gapUntil(pid: number): number;
  zat(text: string, now: number): void;
  boardFields(): Partial<QzBoard>;
  viewFields(slot: number): Partial<QzView>;
  meFields(slot: number, now: number): Partial<QzMe>;
  roleOf(slot: number): QzPersonRole;
  close(): void;
  phase?: 'roles' | 'game' | 'idle';
  call?: QzCall | null;
  deadline?: number;
  outcome?: ModeResult | null;
  presence?(now: number): void;
  canTake?(slot: number): boolean;
  use?(slot: number, place: number, now: number): ModeError | undefined;
  stood?(slot: number, now: number): boolean;
  stop?(now: number, end?: 'swap' | 'empty'): void;
  rewards?(): QuizRewardEvent[];
  fullInk?(): Extract<QuizServerMsg, { t: 'qzInk' }>;
  pults?(): number[];
  titles?(pid: number): string[];
}

export const publicWho = (p: RiddleWho) => ({ slot: p.slot, nick: p.nick });
