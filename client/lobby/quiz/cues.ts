// «Ракушка» 1.1, E1 и E3: праздник на сцене по переходу снимка — у всех клиентов одинаково. Чистые функции без three.js
// (test/quiz-fill.test.ts): кто сейчас главный (пятно света под ним), когда зал хлопает и сколько бегут огни табло.
import type { QzBoard } from '../../../shared/quiz/types.ts';

/** Праздник: зал хлопает (E1) и сколько секунд бегут огни рамки табло (E3) */
export interface StageCue {
  applause: boolean;
  party: number;
}

/** Кто сейчас главный — пятно света под ним (slot; 0 — никто): загадывающий, отвечающий за пультом, рисующий,
 *  лидер голосования «Кто из нас?» на раскрытии */
export function spotSlot(b: QzBoard | null): number {
  if (!b || b.phase !== 'game') return 0;
  if (b.mode === 'riddle') {
    const r = b.riddle;
    return r?.riddler && (r.step === 'round' || r.step === 'check') ? r.riddler.slot : 0;
  }
  if (b.mode === 'jeopardy') {
    const j = b.jp;
    return j?.buzz && (j.step === 'answer' || j.step === 'judge') ? j.buzz.slot : 0;
  }
  if (b.mode === 'croc') {
    const c = b.croc;
    return c?.drawer && (c.step === 'words' || c.step === 'draw') ? c.drawer.slot : 0;
  }
  if (b.mode === 'whoofus') {
    const w = b.who;
    return w?.step === 'reveal' ? (w.leaders[0]?.slot ?? 0) : 0;
  }
  return 0;
}

/** Праздники, которые сейчас «горят» в снимке: ключ → что делать. Новый ключ в снимке — праздник один раз */
function marks(b: QzBoard): Map<string, StageCue> {
  const m = new Map<string, StageCue>();
  const r = b.riddle?.last;
  // «Загадка»: угадал
  if (b.mode === 'riddle' && r?.end === 'solved') m.set(`r:${b.riddle?.num}|${r.answer}|${r.solver?.slot ?? 0}`, { applause: true, party: 4 });
  const j = b.phase === 'game' && b.mode === 'jeopardy' ? b.jp : null;
  // «Своя игра»: верно
  if (j?.verdict === 'yes') m.set(`j:${j.round}|${j.q?.th}|${j.q?.cell}|${j.buzz?.slot ?? 0}`, { applause: true, party: 3 });
  const c = b.phase === 'game' && b.mode === 'croc' ? b.croc : null;
  // «Крокодил»: итог рисунка — все угадали (хлопают) или кто-то угадал (огни)
  if (c?.step === 'reveal' && c.last && (c.last.end === 'all' || c.last.guessed > 0)) {
    m.set(`c:${c.drawing}`, { applause: c.last.end === 'all', party: c.last.end === 'all' ? 4 : 2 });
  }
  const w = b.phase === 'game' && b.mode === 'whoofus' ? b.who : null;
  // «Кто из нас?»: титул
  if (w?.step === 'reveal' && w.leaders.length) m.set(`w:${w.num}|${w.q}`, { applause: true, party: 3 });
  // итоги игры
  if (b.phase === 'results') m.set('res', { applause: false, party: 5 });
  return m;
}

/** Праздник по переходу prev → next (первый снимок — ничего: вошёл посреди итога — не хлопаем задним числом) */
export function stageCue(prev: QzBoard | null, next: QzBoard | null): StageCue | null {
  if (!prev || !next) return null;
  const was = marks(prev);
  const out: StageCue = { applause: false, party: 0 };
  let hit = false;
  for (const [k, c] of marks(next)) {
    if (was.has(k)) continue;
    hit = true;
    out.applause ||= c.applause;
    out.party = Math.max(out.party, c.party);
  }
  return hit ? out : null;
}
