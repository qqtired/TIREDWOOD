import type { QuizClientMsg } from '../../../shared/quiz/net.ts';
import { PACK_ID_RE } from '../../../shared/quiz/pack.ts';
import { QZ, QZ_CATEGORIES, QZ_MODES, QZ_JP as JP, QZ_CROC as CR, QZ_WHO as WHO, QZ_PACK as PACK } from '../../../shared/quiz/types.ts';

/** Не допускаем лишних полей и не копируем большие/неверные пачки в машины режимов. */
export function readMessage(raw: unknown): QuizClientMsg | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  if (m.t !== 'qz' || typeof m.a !== 'string') return null;
  const exact = (...keys: string[]) => Object.keys(m).every(k => k === 't' || k === 'a' || keys.includes(k));
  const text = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;
  const int = (x: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): x is number => Number.isSafeInteger(x) && (x as number) >= min && (x as number) <= max;
  const pack = (x: unknown) => text(x, 120) && PACK_ID_RE.test(x);
  let ok = false;
  switch (m.a) {
    case 'vote': ok = exact('m') && int(m.m, 0, QZ_MODES.length - 1); break;
    case 'play': case 'undo': case 'giveup': case 'jpZat': case 'jpBuzz': case 'jpOpen': case 'jpMore': case 'jpShow':
    case 'jpEnd': case 'jpDispute': case 'upTicket': case 'recs': case 'bravo': ok = exact(); break;
    case 'swap': case 'whoSkip': case 'again': case 'warm': ok = exact('on') && typeof m.on === 'boolean'; break;
    case 'role': ok = exact('take', 'r') && typeof m.take === 'boolean' && (m.r === undefined || ['riddler', 'host', 'player', 'drawer'].includes(m.r as string)); break;
    case 'ask': case 'prep': ok = exact('word', 'cat', 'hint') && text(m.word, QZ.WORD_MAX) && QZ_CATEGORIES.some(c => c === m.cat) && (m.hint === undefined || text(m.hint, QZ.HINT_MAX)); break;
    case 'say': ok = exact('text') && text(m.text, QZ.LINE_MAX); break;
    case 'hint': ok = exact('text') && text(m.text, QZ.HINT_MAX); break;
    case 'mark': ok = exact('id', 'm') && int(m.id) && ['warm', 'hot', 'miss', 'win'].includes(m.m as string); break;
    case 'unmark': ok = exact('id') && int(m.id); break;
    case 'jpStart': ok = exact('pack', 'round', 'themes', 'final') && pack(m.pack) && int(m.round, 0, PACK.QUESTIONS - 1)
      && typeof m.final === 'boolean' && Array.isArray(m.themes) && m.themes.length >= JP.THEMES_MIN && m.themes.length <= JP.THEMES_MAX
      && m.themes.every(i => int(i, 0, PACK.QUESTIONS - 1)) && new Set(m.themes).size === m.themes.length; break;
    case 'jpPv': case 'crWord': ok = exact('i') && int(m.i, 0, 2); break;
    case 'jpPick': ok = exact('th', 'cell') && int(m.th, 0, JP.THEMES_MAX - 1) && int(m.cell, 0, JP.PRICES_MAX - 1); break;
    case 'jpGive': case 'whoVote': ok = exact('slot') && int(m.slot, 1); break;
    case 'jpSeat': case 'jpFjudge': ok = exact('slot', 'ok') && int(m.slot, 1) && typeof m.ok === 'boolean'; break;
    case 'jpJudge': case 'jpDv': ok = exact('ok') && typeof m.ok === 'boolean'; break;
    case 'jpDrop': ok = exact('th') && int(m.th, 0, PACK.QUESTIONS - 1); break;
    case 'jpBet': ok = exact('n') && int(m.n, 1); break;
    case 'jpAns': case 'jpFans': ok = exact('text') && text(m.text, JP.ANSWER_MAX); break;
    case 'whoAsk': ok = exact('text') && text(m.text, WHO.Q_MAX + WHO.TITLE_MAX + 3); break;
    case 'crInk': {
      let points = 0;
      ok = exact('ops') && Array.isArray(m.ops) && m.ops.length > 0 && m.ops.length <= CR.INK_STROKES + CR.INK_PTS_MSG && m.ops.every(op => {
        if (!Array.isArray(op)) return false;
        if (op[0] === 'x') return op.length === 1;
        if (op[0] === 'u') return op.length === 2 && int(op[1]);
        if (op[0] === 'f') return op.length === 5 && int(op[1]) && int(op[2], 0, CR.ERASER) && int(op[3], 0, CR.W - 1) && int(op[4], 0, CR.H - 1);
        if (op[0] !== 's' || op.length < 6 || op.length % 2 || !int(op[1]) || !int(op[2], 0, CR.ERASER) || !int(op[3], 0, CR.WIDTHS.length - 1)) return false;
        points += (op.length - 4) / 2;
        return points <= CR.INK_PTS_MSG && op.slice(4).every((n, i) => int(n, 0, (i % 2 ? CR.H : CR.W) - 1));
      }); break;
    }
    case 'packs': ok = exact('q', 'kind') && (m.q === undefined || text(m.q, PACK.TITLE * 2))
      && (m.kind === undefined || ['jeopardy', 'words', 'whoofus', 'riddles'].includes(m.kind as string)); break;
    case 'packOutline': case 'packDel': case 'packLike': case 'packPlay': ok = exact('id') && pack(m.id); break;
  }
  return ok ? raw as QuizClientMsg : null;
}
