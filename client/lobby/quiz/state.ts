// «Ракушка»: контроллер клиента (docs/quiz/tech.md §14). Хранит последние снимки qz (внутри ограды) и qzBoard (снаружи),
// считает производное (внутри ли я, моя роль, самая старая неотмеченная, карточка «Тепло», мои «мимо» последних 5 с) и по
// разнице снимков раздаёт события видам: облачкам, 3D, Затейнику, HUD. Виды ничего не знают о сети; намерения — send().
// diffQuiz — чистая функция без DOM и three.js (test/quiz-client.test.ts).
import type { QuizClientMsg } from '../../../shared/quiz/net.ts';
import {
  QZ, type QzBoard, type QzLine, type QzMark, type QzMe, type QzPhase, type QzRiddleEnd, type QzView, type QzWho, type QzZatSay,
} from '../../../shared/quiz/types.ts';

/** Что увидели виды по разнице двух снимков */
export type QuizEvent =
  /** вошёл за ограду (пришёл полный снимок) или вышел (пришло табло) */
  | { k: 'inside'; on: boolean }
  /** шаг сцены сменился */
  | { k: 'phase'; from: QzPhase | null; to: QzPhase }
  /** новая строка «В игру»: облачко над автором и «поп» */
  | { k: 'line'; line: QzLine }
  /** отметка строки сменилась (в том числе снята: mark '') — цвет облачка, полёт в «Тепло», звук */
  | { k: 'mark'; line: QzLine; was: QzMark }
  /** строка ушла из снимка: заменена новой догадкой или погасла */
  | { k: 'gone'; id: number; slot: number }
  /** началась проверка «угадал»: дробь и золотая рамка у облачка */
  | { k: 'check'; who: QzWho; line: number }
  /** проверка кончилась: solved — праздник, иначе отменили */
  | { k: 'checkEnd'; who: QzWho; solved: boolean }
  /** загадка кончилась (итог на табло) */
  | { k: 'end'; end: QzRiddleEnd; answer: string; riddler: QzWho; solver: QzWho | null }
  /** загадывающий встал на сцену (on) или вернулся в зал: хлопок на точке и на кресле */
  | { k: 'stage'; who: QzWho; on: boolean }
  /** человек проголосовал или передумал: значок выбора над головой на 2 с */
  | { k: 'vote'; slot: number; card: number }
  /** новая реплика Затейника: облачко 6 с и клип один раз */
  | { k: 'zat'; say: QzZatSay };

/** Снимок, как его видит клиент: внутри — v и me, снаружи — только табло */
export interface QuizSnap {
  board: QzBoard;
  view: QzView | null;
  me: QzMe | null;
}

/** Загадывающий стоит на сцене: идёт раунд или проверка */
export function stageRiddler(b: QzBoard | null): QzWho | null {
  const r = b?.riddle;
  return r && r.riddler && (r.step === 'round' || r.step === 'check') && b.phase === 'game' ? r.riddler : null;
}

const endKey = (b: QzBoard | null): string => {
  const l = b?.riddle?.last;
  return l ? `${l.end}|${l.answer}|${l.riddler.slot}|${l.solver?.slot ?? 0}` : '';
};

/** События по разнице снимков (prev — null: первый снимок, событий о строках нет — только вход и сцена) */
export function diffQuiz(prev: QuizSnap | null, next: QuizSnap): QuizEvent[] {
  const out: QuizEvent[] = [];
  const pb = prev?.board ?? null;
  const nb = next.board;
  const wasIn = !!prev?.view;
  const isIn = !!next.view;
  if (wasIn !== isIn) out.push({ k: 'inside', on: isIn });
  if (!pb || pb.phase !== nb.phase) out.push({ k: 'phase', from: pb?.phase ?? null, to: nb.phase });
  // Затейник: новая реплика (первый снимок — не повторяем старую)
  if (nb.zat && pb && nb.zat.id !== pb.zat?.id) out.push({ k: 'zat', say: nb.zat });
  // загадывающий на сцене
  const ps = stageRiddler(pb), ns = stageRiddler(nb);
  if (pb && (ps?.slot ?? -1) !== (ns?.slot ?? -1)) {
    if (ps) out.push({ k: 'stage', who: ps, on: false });
    if (ns) out.push({ k: 'stage', who: ns, on: true });
  }
  // проверка «угадал»
  const pc = pb?.riddle?.checking ?? null, nc = nb.riddle?.checking ?? null;
  if (pb && pc && (!nc || nc.line !== pc.line)) {
    const solved = nb.riddle?.last?.end === 'solved' && nb.riddle.last.solver?.slot === pc.slot && endKey(pb) !== endKey(nb);
    out.push({ k: 'checkEnd', who: { slot: pc.slot, nick: pc.nick }, solved });
  }
  if (pb && nc && (!pc || pc.line !== nc.line)) out.push({ k: 'check', who: { slot: nc.slot, nick: nc.nick }, line: nc.line });
  // итог загадки
  if (pb && endKey(pb) !== endKey(nb) && nb.riddle?.last) {
    const l = nb.riddle.last;
    out.push({ k: 'end', end: l.end, answer: l.answer, riddler: l.riddler, solver: l.solver });
  }
  // дальше — только внутри ограды, и только если внутри были и раньше (иначе это «вход», а не новые строки)
  const pv = wasIn ? prev!.view! : null;
  const nv = next.view;
  if (!nv) return out;
  if (pv) {
    // голоса
    const was = new Map(pv.people.map((p) => [p.slot, p.vote]));
    for (const p of nv.people) if (p.vote >= 0 && was.get(p.slot) !== p.vote && p.slot > 0) out.push({ k: 'vote', slot: p.slot, card: p.vote });
    // строки
    const old = new Map((pv.riddle?.lines ?? []).map((l) => [l.id, l]));
    const seen = new Set<number>();
    for (const l of nv.riddle?.lines ?? []) {
      seen.add(l.id);
      const o = old.get(l.id);
      if (!o) out.push({ k: 'line', line: l });
      else if (o.mark !== l.mark) out.push({ k: 'mark', line: l, was: o.mark });
    }
    for (const [id, l] of old) if (!seen.has(id)) out.push({ k: 'gone', id, slot: l.slot });
  }
  return out;
}

/** Самая старая неотмеченная догадка (клавиши 1/2/3 загадывающего) */
export function oldestUnmarked(lines: readonly QzLine[]): QzLine | null {
  let best: QzLine | null = null;
  for (const l of lines) if (l.kind === 'guess' && l.mark === '' && (!best || l.at < best.at)) best = l;
  return best;
}

/** Карточка «Тепло»: строки с 👍 по времени отметки */
export function warmLines(lines: readonly QzLine[]): QzLine[] {
  return lines.filter((l) => l.mark === 'warm').sort((a, b) => a.markedAt - b.markedAt);
}

/** «Мимо», отмеченные за последние MISS_UNDO_MS (у них в доке загадывающего «↩ Вернуть») */
export function recentMisses(lines: readonly QzLine[], serverNow: number): QzLine[] {
  return lines.filter((l) => l.mark === 'miss' && serverNow - l.markedAt < QZ.MISS_UNDO_MS);
}

export class QuizState {
  board: QzBoard | null = null;
  view: QzView | null = null;
  me: QzMe | null = null;
  /** Часы сервера минус свои (по последнему снимку) */
  private offset = 0;
  private readonly listeners: Array<(e: QuizEvent) => void> = [];
  private readonly send0: (m: QuizClientMsg) => void;

  constructor(send: (m: QuizClientMsg) => void) {
    this.send0 = send;
  }

  /** Подписка вида на события */
  on(fn: (e: QuizEvent) => void): void {
    this.listeners.push(fn);
  }

  /** Полный снимок (внутри ограды) */
  onQz(v: QzView, me: QzMe): void {
    this.apply({ board: v, view: v, me });
  }

  /** Табло (снаружи ограды) */
  onBoard(b: QzBoard): void {
    this.apply({ board: b, view: null, me: null });
  }

  /** Флаг выключен или ушли с набережной: всё забыть без событий */
  reset(): void {
    this.board = this.view = this.me = null;
  }

  private apply(next: QuizSnap): void {
    const prev: QuizSnap | null = this.board ? { board: this.board, view: this.view, me: this.me } : null;
    // снимок не новее того, что есть (пришёл не по порядку), — пропускаем
    if (prev && next.board.rev < prev.board.rev && !!next.view === !!prev.view) return;
    this.offset = next.board.now - Date.now();
    this.board = next.board;
    this.view = next.view;
    this.me = next.me;
    for (const e of diffQuiz(prev, next)) for (const fn of this.listeners) fn(e);
  }

  send(m: QuizClientMsg): void {
    if (this.view) this.send0(m);
  }

  /** Часы сервера сейчас (мс) — для отсчётов */
  serverNow(): number {
    return Date.now() + this.offset;
  }

  get inside(): boolean {
    return !!this.view;
  }

  get phase(): QzPhase | null {
    return this.board?.phase ?? null;
  }

  /** Я загадываю (окно «Что загадал?», раунд или проверка) */
  get riddling(): boolean {
    return this.me?.role === 'riddler' && this.board?.phase === 'game';
  }

  get lines(): readonly QzLine[] {
    return this.view?.riddle?.lines ?? [];
  }

  oldest(): QzLine | null {
    return oldestUnmarked(this.lines);
  }

  warm(): QzLine[] {
    return warmLines(this.lines);
  }

  misses(): QzLine[] {
    return recentMisses(this.lines, this.serverNow());
  }

  /** Эмоции 1–7 выключены: у всех внутри — в голосовании, у загадывающего — пока он загадывает */
  get emotesBlocked(): boolean {
    return this.inside && (this.board?.phase === 'vote' || this.riddling);
  }

  /** Строка чата по умолчанию «В игру:» — внутри ограды, пока идёт игра */
  get gameChat(): boolean {
    return this.inside && this.board?.phase === 'game';
  }
}
