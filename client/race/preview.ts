// ?track=hills — «Солнечный серпантин» (по умолчанию — «Портовое кольцо», harbor).
// Предпросмотр «Портового кольца» для разработки: открывается только сервером разработки (/tools/race-preview/),
// в сборку не входит. Гонка идёт прямо в браузере — тот же Race, что на сервере, с пятью ботами; свой карт —
// с клавиатуры: W/S — газ и тормоз, A/D — руль, Space — занос, E — бонус, R — назад на трассу. Камера — за картом.
// Параметры: ?cam=0…11 — неподвижные точки обзора для снимков (старт, трамплин через канал, мыс со срезкой, бухта,
// северный причал с краном, змейка, контейнеры, всё кольцо сверху); ?auto=1 — свой карт ведёт бот;
// ?skip=S — промотать S секунд; ?q=low|medium|high. Для снимков: racePreview.hazards(t) ставит подвижные помехи на момент t.
// Для снимков из headless Chrome: window.racePreview — ff(секунды), cam(n), chase(), hold(кнопки, секунды).
import { DEFAULT_TRACK, isRaceTrackId } from '../../shared/racecourse.ts';
import { DT } from '../../shared/constants.ts';
import { RC_GRID, RC_RACE } from '../../shared/kart.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import { DEFAULT_OUTFIT } from '../../shared/outfit.ts';
import { BTN_BACK, BTN_FORWARD, BTN_JUMP, BTN_LEFT, BTN_RELOAD, BTN_RIGHT, BTN_USE, makeInput } from '../../shared/sim.ts';
import { locate, makeLoc } from '../../shared/track.ts';
import { KartBot } from '../../server/race/bot.ts';
import { Race, type Kart } from '../../server/race/race.ts';
import type { LobbyQuality } from '../lobby/world.ts';
import { tickAvatarShared } from '../render/avatar.ts';
import { Renderer } from '../render/renderer.ts';
import { KART_COLORS, Kart3D, KartFx, makeKartPose, poseFromState, type KartPose } from './kart3d.ts';
import { RaceWorld } from './world.ts';

const params = new URLSearchParams(location.search);
const requestedTrack = params.get('track');
const trackId = isRaceTrackId(requestedTrack) ? requestedTrack : DEFAULT_TRACK;
const quality = (params.get('q') ?? 'high') as LobbyQuality;
const auto = params.get('auto') === '1';

/** Точки обзора для снимков: где камера и куда смотрит */
const VIEWS: Array<[number, number, number, number, number, number]> = [
  // 0 старт: решётка и портал с севера прямой
  [-84, 7, 98, -62, 1, 112],
  // 1 восточный причал: подъезд к трамплину через канал
  [135, 4.5, 66, 135, 1.5, 30],
  // 2 канал с моря: прыжок над водой
  [165, 7, 19, 135, 1, 19],
  // 3 мыс: настил срезки с восточного причала
  [124, 9, -34, 90, 0, -62],
  // 4 бухта с севера: настил и бухта
  [77, 14, -96, 77, 0, -36],
  // 5 северный причал: груз крана на дороге
  [24, 3.2, -60, 0, 3, -62],
  // 6 змейка: вертушка и шикана
  [-112, 9, 24, -105, 0, 12],
  // 7 южная прямая: контейнер на рельсах
  [22, 3, 110, 48, 1.5, 106],
  // 8 канал на северном причале
  [-34, 4, -61, -66, 1, -62],
  // 9 всё кольцо сверху
  [-8, 330, 140, -8, 0, 25],
  // 10 с воды: восточный причал и краны
  [190, 12, 40, 120, 8, 40],
  // 11 лужи и плиты: южная прямая вблизи
  [-20, 2.5, 112, 10, 0.5, 112],
];

const canvas = document.getElementById('c') as HTMLCanvasElement;
const info = document.getElementById('info') as HTMLDivElement;
const renderer = new Renderer(canvas);
const world = new RaceWorld(renderer, quality, trackId);
const fx = new KartFx(world.scene);
const camera = world.camera;
const track = world.track;

// --- гонка: я и пять ботов
const trapPos = new Map<number, { x: number; y: number; z: number }>();
const sink = {
  sendBinary(): void {},
  sendJson(m: ServerMsg): void {
    onMessage(m);
  },
  close(): void {},
};
const race = new Race({}, { seed: 7, minKarts: 6, track: trackId });
const me = race.addHuman({ pid: 1, nick: 'Я', outfit: { ...DEFAULT_OUTFIT, c: 3, h: 'crown' } }, sink)!;
race.start();
const pilot = auto ? new KartBot(track, 'hard', 99) : null;

interface Vis {
  kart: Kart;
  k3d: Kart3D;
  prev: KartPose;
  cur: KartPose;
  pose: KartPose;
}

const vis: Vis[] = [];
for (const k of race.karts.values()) {
  const k3d = new Kart3D(k.id, KART_COLORS[k.color], k.id);
  k3d.setDriver(k.isBot ? `🤖 ${k.name}` : k.name, k.outfit);
  k3d.addTo(world.scene);
  const cur = poseFromState(k.state, true, false, makeKartPose());
  vis.push({ kart: k, k3d, prev: { ...cur }, cur, pose: { ...cur } });
}

// --- ввод
const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

function keyButtons(): number {
  let b = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) b |= BTN_FORWARD;
  if (keys.has('KeyS') || keys.has('ArrowDown')) b |= BTN_BACK;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) b |= BTN_LEFT;
  if (keys.has('KeyD') || keys.has('ArrowRight')) b |= BTN_RIGHT;
  if (keys.has('Space')) b |= BTN_JUMP;
  if (keys.has('KeyE')) b |= BTN_USE;
  if (keys.has('KeyR')) b |= BTN_RELOAD;
  return b;
}

// --- события гонки → эффекты
function onMessage(m: ServerMsg): void {
  if (m.t !== 'rev') return;
  for (const e of m.e) {
    switch (e[0]) {
      case 'crate': {
        const c = track.crates[e[1]];
        if (c) fx.cratePop(c.x, c.y + 0.85, c.z);
        break;
      }
      case 'jam': {
        const t = trapPos.get(e[1]);
        if (t && e[2]) fx.jamSplat(t.x, t.y, t.z);
        break;
      }
      case 'paint': {
        const k = e[2] ? race.karts.get(e[2]) : undefined;
        if (k) fx.paintSplat(k.state.x, k.state.y + 0.8, k.state.z);
        break;
      }
      case 'splash':
        fx.splash(e[2], e[3]);
        break;
      case 'bump':
        fx.wallHit(e[2], 0.45, e[3], 0, 0, e[1]);
        break;
      case 'finish':
        console.log(`финиш: карт ${e[1]}, место ${e[2]}, ${(e[3] / 1000).toFixed(2)} с`);
        break;
    }
  }
}

const input = makeInput();
const loc = makeLoc();
let seq = 0;
/** Время помех, заданное из консоли (null — по гонке): для снимков движущихся помех в нужном положении */
let hazardAt: number | null = null;
/** Кнопки, зажатые из консоли (BTN_*), и сколько ещё тиков */
let held = 0;
let heldT = 0;

function stepRace(): void {
  for (const v of vis) Object.assign(v.prev, v.cur);
  for (const t of race.traps) trapPos.set(t.id, { x: t.x, y: t.y, z: t.z });
  if (pilot) {
    pilot.update(me.state, {
      racing: race.phase === RC_RACE, gridLeft: race.phase === RC_RACE ? 0 : race.phaseEnd - race.tick, place: me.place, karts: race.karts.size,
      behind: Infinity, ahead: Infinity, near: Infinity, painted: me.paintT > 0, bubble: me.bubbleT > 0,
    }, race.tick, input);
  } else {
    input.buttons = keyButtons();
  }
  if (heldT > 0) {
    heldT--;
    input.buttons |= held;
  }
  input.seq = ++seq;
  race.onInputs(me, [input], 1);
  race.step();
  for (const v of vis) {
    const k = v.kart;
    poseFromState(k.state, k.hideT === 0, k.paintT > 0, v.cur);
    const ev = k.ev;
    if (ev.wall > 3) {
      // искры — с той стороны, где стена; веер — обратно к дороге
      locate(track, k.state.x, k.state.z, k.state.seg, loc);
      const sd = loc.lat > 0 ? 1 : -1;
      const s = k.state.seg;
      const rx = -track.tz[s] * sd;
      const rz = track.tx[s] * sd;
      fx.wallHit(k.state.x + rx * 0.7, k.state.y + 0.3, k.state.z + rz * 0.7, -rx, -rz, ev.wall);
    }
    if (ev.land > 4) fx.dust(k.state.x, k.state.y, k.state.z, Math.min(8, Math.round(ev.land / 2)));
  }
}

// --- камера: точка обзора или погоня
let view = params.has('cam') ? Number(params.get('cam')) : -1;
let chaseYaw = 0;
let chaseInit = false;

function setView(n: number): void {
  view = n;
  if (n < 0) {
    chaseInit = false;
    return;
  }
  const v = VIEWS[n] ?? VIEWS[0];
  camera.position.set(v[0], v[1], v[2]);
  camera.lookAt(v[3], v[4], v[5]);
  camera.fov = 60;
  camera.updateProjectionMatrix();
}

function chase(p: KartPose, dt: number, speed: number): void {
  if (!chaseInit) {
    chaseInit = true;
    chaseYaw = p.yaw;
  }
  let d = p.yaw - chaseYaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  chaseYaw += d * Math.min(1, dt * 5);
  const hx = -Math.sin(chaseYaw);
  const hz = -Math.cos(chaseYaw);
  camera.position.set(p.x - hx * 6.2, p.y + 2.4, p.z - hz * 6.2);
  camera.lookAt(p.x + hx * 4, p.y + 0.8, p.z + hz * 4);
  const fov = 70 + Math.min(1, speed / 26) * 8;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

function lerpPose(a: KartPose, b: KartPose, t: number, out: KartPose): void {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  let d = b.yaw - a.yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  out.yaw = a.yaw + d * t;
  out.steer = a.steer + (b.steer - a.steer) * t;
  out.flags = b.flags;
  out.misc = b.misc;
}

// --- кадр
function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.resize(w, h, Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.25));
  world.resize(w, h);
}
addEventListener('resize', resize);
resize();

let acc = 0;
let last = performance.now();
let fpsT = 0;
let fpsN = 0;
let fps = 0;

function frame(dt: number, alpha: number): void {
  world.update(dt);
  tickAvatarShared(world.time);
  world.setHazardTime(hazardAt ?? Math.max(0, me.state.rt - 1 + alpha));
  for (const v of vis) lerpPose(v.prev, v.cur, alpha, v.pose);
  const mine = vis.find((v) => v.kart === me)!;
  if (view < 0) chase(mine.pose, dt, mine.k3d.speed);
  for (const v of vis) v.k3d.update(v.pose, dt, world.time, world, fx, camera.position, v.kart === me);
  let crates = 0;
  for (let c = 0; c < race.crateBack.length; c++) if (race.crateBack[c] === 0) crates |= 1 << c;
  world.setCrates(crates);
  world.setTraps(race.traps, race.traps.length);
  fx.update(dt);
  world.render();
}

function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let steps = 0;
  while (acc >= DT && steps < 8) {
    stepRace();
    acc -= DT;
    steps++;
  }
  if (steps === 8) acc = 0;
  frame(dt, acc / DT);
  fpsN++;
  fpsT += dt;
  if (fpsT >= 0.5) {
    fps = Math.round(fpsN / fpsT);
    fpsN = 0;
    fpsT = 0;
  }
  const s = me.state;
  const phase = race.phase === RC_GRID ? `отсчёт ${Math.ceil((race.phaseEnd - race.tick) * DT)}` : race.phase === RC_RACE ? 'гонка' : 'итоги';
  info.textContent = `${phase} · круг ${Math.max(1, Math.min(3, s.lap))}/3 · место ${me.place || '—'}/${race.karts.size}\n` +
    `${Math.round(Math.hypot(s.vx, s.vz) * 3.6)} км/ч · бонус ${['—', 'турбо', 'варенье', 'краска'][s.item] ?? '—'}${s.itemT > 0 ? ' (крутится)' : ''} · ${fps} к/с`;
  requestAnimationFrame(loop);
}

/** Промотать гонку на seconds секунд (без отрисовки) */
function ff(seconds: number): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) stepRace();
  for (const v of vis) Object.assign(v.prev, v.cur);
}

const skip = Number(params.get('skip') ?? 0);
if (skip > 0) ff(skip);
setView(view);
requestAnimationFrame(loop);

(window as unknown as { racePreview: unknown }).racePreview = {
  race,
  world,
  ff,
  cam: setView,
  /** Камера в любую точку: откуда, куда, угол обзора */
  look: (x: number, y: number, z: number, tx: number, ty: number, tz: number, fov = 60) => {
    view = 99;
    camera.position.set(x, y, z);
    camera.lookAt(tx, ty, tz);
    camera.fov = fov;
    camera.updateProjectionMatrix();
  },
  chase: () => setView(-1),
  /** Зажать кнопки (BTN_*: 1 газ, 2 тормоз, 4 влево, 8 вправо, 16 занос, 512 бонус, 256 назад на трассу) */
  hold: (buttons: number, seconds: number) => {
    held = buttons;
    heldT = Math.round(seconds / DT);
  },
  /** Поставить подвижные помехи на момент t (тики гонки); null — снова по ходу гонки */
  hazards: (t: number | null) => {
    hazardAt = t;
  },
  /** Кадр без ожидания requestAnimationFrame (headless Chrome в фоне их не шлёт) */
  frame: (dt = 1 / 60) => frame(dt, 0),
};
