// «Ракушка»: одна точка подключения интерфейса Sonnet (client/lobby/quiz/ui/: board.ts, sign.ts, hud.ts — договор в задании
// интегратора). Есть его файл — берём его; нет — заглушка с тем же видом вызова: табло и вывеска читаются, HUD пустой.
// Так 3D, кресла и камеры проверяются до его модулей, а подключение потом не меняется.
import type { QuizClientMsg } from '../../../shared/quiz/net.ts';
import { QZ_MODES, type QzBoard, type QzMe, type QzView } from '../../../shared/quiz/types.ts';
import { quizSignLine } from '../plaza3/status.ts';
import type { QuizFx } from './fx.ts';

/** Рисовалка холста по снимку (табло 2048 × 1024, вывеска 1024 × 256) */
export type QuizPaint = (ctx: CanvasRenderingContext2D, b: QzBoard, nowMs: number) => void;

/** HUD «Ракушки» (плашка, голосование, кнопки ролей, док, «Тепло», окна) — client/lobby/quiz/ui/hud.ts */
export interface QuizHudLike {
  update(v: QzView | null, me: QzMe | null, b: QzBoard | null, nowMs: number): void;
  fx(e: QuizFx): void;
  dispose(): void;
}
/** Что шлёт HUD: письма «Ракушки» и общее «встать» (кнопка «Встать» — то же, что E на кресле) */
export type QuizHudMsg = QuizClientMsg | { t: 'unuse' };
type HudCtor = new (send: (m: QuizHudMsg) => void) => QuizHudLike;

const MODS = import.meta.glob(['./ui/board.ts', './ui/sign.ts', './ui/hud.ts'], { eager: true }) as Record<string, Record<string, unknown>>;

const FONT = 'Rubik, system-ui, sans-serif';
const left = (at: number, now: number): string => {
  const s = Math.max(0, Math.ceil((at - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Заглушка табло: крупно, что сейчас идёт (пока нет ui/board.ts) */
const stubBoard: QuizPaint = (g, b, now) => {
  const W = g.canvas.width, H = g.canvas.height;
  g.fillStyle = '#1f4f55';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff4dc';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const title = (t: string): void => { g.font = `800 120px ${FONT}`; g.fillText(t, W / 2, 150); };
  const line = (t: string, y: number, size = 72, col = '#fff4dc'): void => { g.fillStyle = col; g.font = `700 ${size}px ${FONT}`; g.fillText(t, W / 2, y); };
  if (b.phase === 'idle') {
    title('Во что играем?');
    line('Садитесь на стулья — сыграем!', 470);
    line(b.seated ? `Сидят: ${b.seated}` : 'E у стула — сесть', 640, 60, '#ffd27a');
  } else if (b.phase === 'vote' && b.vote) {
    title('Во что играем?');
    const v = b.vote;
    const cw = 440, gap = 40, x0 = (W - (cw * 4 + gap * 3)) / 2;
    v.options.forEach((o, i) => {
      const x = x0 + i * (cw + gap);
      g.fillStyle = o.off ? '#5b6b6c' : v.win === i ? '#f2b544' : ['#2a9d8f', '#e0745a', '#e9b44c', '#8e6bbf'][i];
      g.fillRect(x, 300, cw, 520);
      g.fillStyle = '#fff4dc';
      g.font = `800 56px ${FONT}`;
      g.fillText(`${i + 1}. ${QZ_MODES[i]?.name ?? o.mode}`, x + cw / 2, 380);
      g.font = `800 220px ${FONT}`;
      g.fillText(o.off ?? String(o.n), x + cw / 2, 600);
    });
    line(v.nobody ? 'Никто не выбрал' : b.endsAt ? `${v.voted} из ${v.people} · ${left(b.endsAt, now)}` : v.why, 920, 64);
  } else if (b.phase === 'results' && b.results) {
    title('Итоги');
    b.results.top.forEach((r, i) => line(`${i + 1}. ${r.nick} — ${r.pts}`, 380 + i * 150, 90));
  } else if (b.riddle) {
    const r = b.riddle;
    title(r.step === 'reveal' && r.last ? r.last.answer : r.category || 'Загадка');
    line(r.riddler ? `Загадывает ${r.riddler.nick} · ${r.num} из ${r.of}` : 'Кто загадывает?', 330);
    r.hints.forEach((h, i) => line(`Подсказка: ${h}`, 460 + i * 90, 60, '#ffd27a'));
    if (r.misses.length) line(`Мимо: ${r.misses.join(', ')}`, 780, 54, '#b9c4c4');
    line(r.endsAt ? `Тепло: ${r.warm} · ${left(r.endsAt, now)}` : `Тепло: ${r.warm}`, 920, 64);
  } else {
    title('Ракушка');
  }
};

/** Заглушка вывески над аркой: «РАКУШКА» и строка статуса (status.ts) */
const stubSign: QuizPaint = (g, b, now) => {
  const W = g.canvas.width, H = g.canvas.height;
  g.fillStyle = '#1f6f6a';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff4dc';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 110px ${FONT}`;
  g.fillText('РАКУШКА', W / 2, H * 0.36);
  const st = quizSignLine(b, now);
  g.font = `700 48px ${FONT}`;
  g.fillStyle = st.tone === 'go' ? '#ffd27a' : '#c9f0dc';
  g.fillText(st.text, W / 2, H * 0.8);
};

class StubHud implements QuizHudLike {
  update(): void {}
  fx(): void {}
  dispose(): void {}
}

export const paintBoard: QuizPaint = (MODS['./ui/board.ts']?.paintBoard as QuizPaint | undefined) ?? stubBoard;
export const paintSign: QuizPaint = (MODS['./ui/sign.ts']?.paintSign as QuizPaint | undefined) ?? stubSign;
export const QuizHud: HudCtor = (MODS['./ui/hud.ts']?.QuizHud as HudCtor | undefined) ?? StubHud;
/** Какие модули интерфейса настоящие (для __opus и отчёта) */
export const uiReal = { board: !!MODS['./ui/board.ts'], sign: !!MODS['./ui/sign.ts'], hud: !!MODS['./ui/hud.ts'] };
