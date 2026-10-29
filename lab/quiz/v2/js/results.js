// Общий шаг «Итоги» любого режима «Ракушки». Итоги показывает только 3D-табло: топ-3, «счёт вечера» и в подвале
// «дальше — голосование · 0:08». Плашка сверху — одна строка без кольца: значок режима, «Итоги · ты 3-й · +25» и монета.
// Через 10 с Затейник снова открывает голосование. Жетоны — только по брифу (docs/quiz/brief.md, «Жетоны»).
import { paintResults, BOARD_H, BOARD_W } from './world/board-vote.js';
import { coinHtml, esc } from './hud.js';

/**
 * o: { mode, name, icon, top: [{ nick, pts, own }], evening: [{ nick, pts, own }], reward: '+15' | '',
 *      noTokens: '' | 'в игре меньше 3 человек', total: 10 }
 */
export function results(x, o) {
  const { hud, stage, sfx } = x;
  hud.chat.setCanGame(false);
  const total = o.total ?? 10;
  let left = total;
  const board = x.frame.board ? stage.quad(x.frame.board, BOARD_W, BOARD_H, 'st-board') : null;
  const s = { name: o.name, top: o.top ?? [], evening: o.evening ?? [], left, total };
  const t0 = performance.now();
  const draw = () => { if (board) { paintResults(board.ctx, s, performance.now() - t0); board.flush(); } };
  draw();
  x.every(draw, 250);
  // плашка: место и жетоны одной строкой
  const place = (o.top ?? []).findIndex((p) => p.own);
  const parts = [`Итоги · ${esc(o.name)}`];
  if (place >= 0) parts[0] = `Итоги · ты <b>${place + 1}-й</b>`;
  const tokens = o.noTokens ? ' · без жетонов' : o.reward ? ` · <b class="k-gold">${esc(o.reward)}</b>${coinHtml()}` : '';
  hud.event({ icon: o.icon, title: parts[0] + tokens, noSwap: true });
  sfx.play('reward');
  if (o.reward && !o.noTokens) { const n = Number(String(o.reward).replace(/[^\d]/g, '')) || 0; if (n) { x.me.tokens += n; hud.tokens(x.me.tokens); hud.pop(o.reward); } }
  // отсчёт до голосования — только на табло
  x.every(() => {
    left = Math.max(0, left - 1);
    s.left = left;
    draw();
    if (left === 0) x.goMode('vote', 'vote');
  }, 1000);
  return {};
}
