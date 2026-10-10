// Стенд «Подземелья» для разработки и снимков: /tools/survivors/stand/ на сервере разработки (в сборку не входит).
// Сцена режима целиком (DungeonScene: модели, карта, интерфейс, звук, журнал) без набережной: «сервер» в этой же
// вкладке отвечает `dg_hello`, подтверждает журнал (`dg_ack`) и в конце шлёт `dg_end`.
// ?seed=N — зерно, ?mock=1 — заглушка симуляции (по умолчанию: настоящая, если уже есть), ?wave=N — сразу на волну.
// Для headless Chrome — window.dgStand: state(), wave(n), level(n), give(id, lv), kill(), hold(клавиша, с), pause().
import '../styles.css';
import type { DgClientMsg } from '../../shared/dungeon/api.ts';
import type { ClientMsg } from '../../shared/messages.ts';
import { Sound } from '../audio.ts';
import { Chat } from '../chat.ts';
import { Input } from '../input.ts';
import type { Net } from '../net.ts';
import { Renderer } from '../render/renderer.ts';
import type { SceneDeps, Ui } from '../scene.ts';
import { DEFAULTS } from '../settings.ts';
import { TOUCH, TouchControls } from '../touch.ts';
import { MockRun } from './mock.ts';
import { DungeonScene } from './scene.ts';
import type { RunSource } from './source.ts';

const params = new URLSearchParams(location.search);
const seed0 = Number(params.get('seed') ?? 12345) || 12345;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const shell = document.getElementById('hud') as HTMLElement;
const renderer = new Renderer(canvas);
const input = new Input(canvas);
document.documentElement.classList.toggle('touch', TOUCH);
document.documentElement.dataset.room = 'dungeon';
const touch = TOUCH ? new TouchControls(shell, input) : null;
if (TOUCH) void input.lock();
const sound = new Sound();
const chat = new Chat(shell);
const log: DgClientMsg[] = [];
let received = 0;
let run: RunSource | null = null;

const scene: DungeonScene = new DungeonScene(
  {
    renderer,
    input,
    sound,
    settings: { ...DEFAULTS },
    net: {
      epoch: 0,
      send(m: ClientMsg): void {
        const msg = m as unknown as DgClientMsg | { t: 'leave' };
        if (msg.t === 'dg_log') {
          log.push(msg);
          received = Math.max(received, msg.from + msg.ev.length);
          setTimeout(() => scene.onDg({ t: 'dg_ack', n: received }), 40);
        } else if (msg.t === 'dg_again') {
          setTimeout(() => scene.onDg({ t: 'dg_hello', seed: Math.floor(Math.random() * 1e9), best: 0, bestMs: 0, weekBest: 0 }), 100);
        } else if (msg.t === 'leave') {
          location.reload();
        }
      },
    } as unknown as Net,
    ui: { chat, me: () => ({ nick: 'Tester7' }) } as unknown as Ui,
    hudRoot: shell,
    overlay: shell,
    wantPointer: () => {},
  } satisfies SceneDeps,
  {
    makeRun: (seed) => {
      run = new MockRun(seed);
      const w = Number(params.get('wave') ?? 0);
      if (w > 1) (run as MockRun).skipTo(w);
      return run;
    },
    leave: () => location.reload(),
  },
);

function resize(): void {
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.resize(window.innerWidth, window.innerHeight, ratio);
  scene.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();
input.blocked = false;
input.onKey = (code, down, e) => {
  if (scene.onKey(code, down, e)) e.preventDefault();
};
scene.enter();
scene.onDg({ t: 'dg_hello', seed: seed0, best: 0, bestMs: 0, weekBest: 0 });

// конец забега: «сервер» отвечает итогом
let endSent = false;
let last = performance.now();
function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  renderer.beginFrame(false);
  try {
    scene.frame(now, dt);
  } finally {
    renderer.endFrame();
  }
  touch?.sync(scene.touchMode, 'all', 'E');
  const st = scene.debugState()?.dungeon as { ended?: boolean } | undefined;
  if (st?.ended && !endSent && run) {
    endSent = true;
    const r = run.result();
    setTimeout(() => scene.onDg({ t: 'dg_end', result: { ...r, end: 'death' }, coins: Math.min(600, r.waves * 8 + 6), newBest: r.waves > 0, weekRank: 3 }), 600);
  }
  if (!st?.ended) endSent = false;
}
requestAnimationFrame(frame);

const mock = (): MockRun | null => (run instanceof MockRun ? run : null);
(window as unknown as Record<string, unknown>).dgStand = {
  scene,
  state: () => scene.debugState(),
  info: () => ({ ...renderer.gl.info.render, programs: renderer.gl.info.programs?.length ?? 0, memory: { ...renderer.gl.info.memory }, cpuMs: renderer.cpuMs }),
  log: () => log,
  wave: (n: number) => mock()?.skipTo(n),
  level: (n = 1) => mock()?.levelUp(n),
  give: (id: string, lv: number) => mock()?.give(id, lv),
  kill: () => mock()?.killHero(),
  crowd: (n = 300) => mock()?.crowd(n),
  pause: (on = true) => scene.game?.setPaused(on),
  /** держать клавишу (code) секунд */
  hold: (code: string, s: number) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code })), s * 1000);
  },
};
