// Стенд окна автомата: те же стили, что в игре, состояния — кнопками внизу или ?s=<состояние>.
import '../../client/styles.css';
import { JukeboxPanel, type JukeboxPanelState } from '../../client/ui/jukebox.ts';
import { songMs, type JukeView } from '../../shared/jukebox.ts';

const ME = 7;
const now0 = Date.now();
const panel = new JukeboxPanel(document.getElementById('hud')!, {
  play: (i) => { state.pending = i; state.note = null; render(); setTimeout(() => { state.pending = null; state.note = `«${i + 1}» в очереди: ${(state.view?.queue.length ?? 0) + 1}-я`; render(); }, 900); },
  close: () => { panel.close(); setTimeout(() => panel.open(), 600); },
});

let state: JukeboxPanelState;
function scenario(s: string): JukeboxPanelState {
  const t = Date.now();
  const cur = { song: 0, pid: 3, nick: 'Капитан Пена', start: t - 41_000 };
  const queue = [
    { song: 4, pid: 11, nick: 'Бриз' },
    { song: 2, pid: ME, nick: 'Tester7' },
    { song: 6, pid: 12, nick: 'Очень-длинный-ник-игрока' },
  ];
  const view: JukeView = { now: t, cur, queue };
  const base: JukeboxPanelState = { view, serverNow: t, myPid: ME, tokens: 134, pending: null, note: null };
  switch (s) {
    case 'idle': return { ...base, view: { now: t, cur: null, queue: [] } };
    case 'soon': return { ...base, view: { now: t, cur: { ...cur, start: t + 1400 }, queue: [] } };
    case 'mine': return { ...base, note: 'В очереди: 2-я, через 3:02' };
    case 'full': return { ...base, view: { ...view, queue: [...queue, { song: 7, pid: 13, nick: 'Лазурь' }, { song: 1, pid: 14, nick: 'Маяк' }] }, myPid: 99 };
    case 'poor': return { ...base, myPid: 99, tokens: 6 };
    case 'pending': return { ...base, myPid: 99, pending: 5 };
    default: return { ...base, myPid: 99 };
  }
}
function render(): void {
  state.serverNow = Date.now();
  panel.update(state);
}
function show(s: string): void {
  state = scenario(s);
  panel.open();
  render();
}
for (const b of document.querySelectorAll<HTMLButtonElement>('#ctl button')) b.onclick = () => show(b.dataset.s!);
addEventListener('keydown', (e) => { panel.onKey(e.code, e); });
show(new URLSearchParams(location.search).get('s') ?? 'playing');
setInterval(render, 250);
(window as unknown as { __jb: unknown }).__jb = { panel, show, songMs, now0 };
