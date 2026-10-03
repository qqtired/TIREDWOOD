// ?track=foundry selects the second course for local acceptance. Default preview remains the legacy port.
// Песочница заезда для разработки: открывается только сервером разработки (/tools/race-sandbox/), в сборку не входит.
// Настоящий клиент гонки (RaceScene: предсказание, камера, интерфейс, звук) против той же гонки, что на сервере,
// прямо во вкладке — с задержкой сети в обе стороны. Свой карт — с клавиатуры (W/S, A/D, Space, E, R).
// Параметры: ?lat=МС — задержка в одну сторону (по умолчанию 40), ?jit=МС — разброс, ?auto=1 — свой карт ведёт бот,
// ?q=low|medium|high, ?touch=1 — кнопки телефона, как в игре. Часы виртуальные: для снимков из headless Chrome — window.raceSandbox:
// run(секунды) — прогнать время без рисования, frame() — нарисовать кадр, hold(кнопки, секунды), restart(), state().
import '../styles.css';
import { isRaceTrackId } from '../../shared/racecourse.ts';
import { TICK_MS } from '../../shared/constants.ts';
import { RC_RACE } from '../../shared/kart.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import { DEFAULT_OUTFIT } from '../../shared/outfit.ts';
import { decodeInputs } from '../../shared/protocol.ts';
import { makeInput, type Input as SimInput } from '../../shared/sim.ts';
import { KartBot } from '../../server/race/bot.ts';
import { Race, type Kart } from '../../server/race/race.ts';
import { Sound } from '../audio.ts';
import { Chat } from '../chat.ts';
import { Input } from '../input.ts';
import type { Net } from '../net.ts';
import { Renderer } from '../render/renderer.ts';
import type { SceneDeps, Ui } from '../scene.ts';
import { DEFAULTS, type Quality } from '../settings.ts';
import { TOUCH, TouchControls } from '../touch.ts';
import { RaceScene } from './scene.ts';

const params = new URLSearchParams(location.search);
const requestedTrack = params.get('track');
const trackId = isRaceTrackId(requestedTrack) ? requestedTrack : 'port';
const latency = Number(params.get('lat') ?? 40);
const jitter = Number(params.get('jit') ?? 0);
const auto = params.get('auto') === '1';
const settings = { ...DEFAULTS, quality: (params.get('q') ?? 'high') as Quality };

const canvas = document.getElementById('game') as HTMLCanvasElement;
const shell = document.getElementById('hud') as HTMLElement;
const renderer = new Renderer(canvas);
const input = new Input(canvas);
// телефон: кнопки на экране — как в игре (app.ts), под интерфейсом гонки; «захват» — просто включить пальцы
document.documentElement.classList.toggle('touch', TOUCH);
const touch = TOUCH ? new TouchControls(shell, input) : null;
if (TOUCH) void input.lock();
const sound = new Sound();
const chat = new Chat(shell);

// --- сеть с задержкой: пакеты не обгоняют друг друга, как в WebSocket
interface Packet {
  at: number;
  json?: string;
  bin?: ArrayBuffer;
  up?: Uint8Array;
}
let vnow = performance.now();
const down: Packet[] = [];
const up: Packet[] = [];
let lastDown = 0;
let lastUp = 0;
const delay = (): number => latency + Math.random() * jitter;

const net = {
  epoch: 0,
  pingMs: latency * 2 + jitter / 2,
  send(): void {},
  sendBinary(data: Uint8Array): void {
    lastUp = Math.max(lastUp, vnow + delay());
    up.push({ at: lastUp, up: data.slice() });
  },
} as unknown as Net;

const sink = {
  sendJson(m: ServerMsg): void {
    lastDown = Math.max(lastDown, vnow + delay());
    down.push({ at: lastDown, json: JSON.stringify(m) });
  },
  sendBinary(data: Uint8Array): void {
    lastDown = Math.max(lastDown, vnow + delay());
    down.push({ at: lastDown, bin: data.slice().buffer });
  },
  close(): void {},
};

const deps: SceneDeps = {
  renderer,
  input,
  sound,
  settings,
  net,
  ui: { chat } as unknown as Ui,
  hudRoot: shell,
  overlay: shell,
  wantPointer: () => {},
};
const scene = new RaceScene(deps, trackId);
const world = scene.world;

// --- гонка «сервера»
let race: Race;
let me: Kart;
let serverAcc = 0;

function newRace(): void {
  down.length = 0;
  up.length = 0;
  scene.exit();
  scene.enter();
  race = new Race({ announce: (text) => chat.note(text) }, { seed: Math.floor(Math.random() * 1e9), minKarts: 6, track: trackId });
  me = race.addHuman({ pid: 1, nick: 'Я', outfit: { ...DEFAULT_OUTFIT, c: 3, h: 'crown' } }, sink)!;
  race.start();
}
newRace();

// --- ввод: клавиатура, бот (?auto=1) и кнопки из консоли
const keys = input.sample.bind(input);
const pilot = auto ? new KartBot(world.track, 'hard', 99) : null;
const pilotInput: SimInput = makeInput();
let held = 0;
let heldT = 0;
input.sample = (): number => {
  let b = keys();
  if (pilot) {
    pilot.update(
      me.state,
      { racing: race.phase === RC_RACE, place: me.place, karts: race.karts.size, behind: Infinity, ahead: Infinity, painted: me.paintT > 0 },
      race.tick,
      pilotInput,
    );
    b |= pilotInput.buttons;
  }
  if (heldT > 0) {
    heldT--;
    b |= held;
  }
  return b;
};
addEventListener('keydown', () => sound.unlock());
addEventListener('pointerdown', () => sound.unlock());
sound.unlock();

// --- время: сеть → сервер → сеть → клиент, шагами по кадру
const inBuf: SimInput[] = [];
let drawing = true;
const render = world.render.bind(world);
world.render = () => {
  if (drawing) render();
};

function deliver(): void {
  while (up.length && up[0].at <= vnow) {
    const n = decodeInputs(up.shift()!.up!, inBuf);
    if (n > 0) race.onInputs(me, inBuf, n);
  }
  while (down.length && down[0].at <= vnow) {
    const p = down.shift()!;
    if (p.json) scene.onJson(JSON.parse(p.json) as ServerMsg);
    else scene.onSnapshot(p.bin!, p.at);
  }
}

function advance(ms: number): void {
  let left = ms;
  while (left > 1e-6) {
    const step = Math.min(TICK_MS, left);
    left -= step;
    vnow += step;
    deliver();
    serverAcc += step;
    while (serverAcc >= TICK_MS - 1e-9) {
      serverAcc -= TICK_MS;
      race.step();
    }
    deliver();
    scene.frame(vnow, step / 1000);
    touch?.sync(scene.touchMode, scene.touchMode === 'none' ? 'bar' : 'all');
  }
}

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.resize(w, h, Math.min(window.devicePixelRatio || 1, 2));
  scene.resize(w, h);
}
addEventListener('resize', resize);
resize();

let last = performance.now();
let paused = false;
function loop(t: number): void {
  const dt = Math.min(100, t - last);
  last = t;
  if (!paused) advance(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

(window as unknown as { raceSandbox: unknown }).raceSandbox = {
  get race() {
    return race;
  },
  scene,
  world,
  /** Ввод: что держат клавиши и кнопки на экране — input.isHeld(BTN_*) */
  input,
  /** Прогнать seconds секунд без рисования (последний кадр — с рисованием) */
  run(seconds: number): void {
    paused = true;
    drawing = false;
    advance(Math.max(0, seconds * 1000 - TICK_MS));
    drawing = true;
    advance(TICK_MS);
  },
  /** Нарисовать ещё один кадр (headless Chrome в фоне не шлёт requestAnimationFrame) */
  frame(): void {
    paused = true;
    advance(TICK_MS);
  },
  play(): void {
    paused = false;
    last = performance.now();
  },
  /** Зажать кнопки (BTN_*: 1 газ, 2 тормоз, 4 влево, 8 вправо, 16 занос, 512 бонус, 256 назад на трассу) */
  hold(buttons: number, seconds: number): void {
    held = buttons;
    heldT = Math.round((seconds * 1000) / TICK_MS);
  },
  restart: newRace,
  state: () => scene.debugState(),
  me: () => me,
};
