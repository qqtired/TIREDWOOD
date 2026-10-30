// «Ракушка» 1.1, C9: титулы «Кто из нас?» этого вечера по нику — их читает список «Кто где» (Tab), пока титул есть в
// board.titles. Над никами желейки титулы рисует heads.ts; здесь только словарь, без DOM и three.js.
import type { QzTitle } from '../../../shared/quiz/types.ts';

let byNick = new Map<string, string>();

/** Табло прислало титулы вечера (null — «Ракушка» выключена или ушли с набережной): запомнить */
export function setQuizTitles(list: readonly QzTitle[] | null): void {
  byNick = new Map((list ?? []).map((t) => [t.nick, t.title]));
}

/** Титул вечера у ника или '' */
export function quizTitleOf(nick: string): string {
  return byNick.get(nick) ?? '';
}
