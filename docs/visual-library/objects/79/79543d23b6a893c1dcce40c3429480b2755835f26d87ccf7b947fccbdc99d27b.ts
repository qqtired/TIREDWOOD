// Стенд «Подземелья» для разработки и снимков: /tools/survivors/stand/ на сервере разработки (в сборку не входит).
// Сцена режима целиком (DungeonScene: модели, карта, интерфейс, звук, журнал) без набережной: «сервер» в этой же
// вкладке отвечает `dg_hello`, повторяет забег по журналу своей копией симуляции (как server/dungeon/room.ts), сверяет
// хеш (`desync` в state), шлёт `dg_ack`, `dg_wave` и в конце `dg_end`.
// ?seed=N — зерно, ?mock=1 — заглушка симуляции, ?wave=N — сразу на волну N.
// Для headless Chrome — window.dgStand: state(), wave(n), level(n), give(id, lv, evo), crowd(n), kill(), hold(клавиша, с),
// pause(). Отладочные правки забега (кроме ?wave) отключают сверку хеша.
import '../styles.css';
import { DG_RUN_CAP, dgBossCoins, dgWaveCoins, type DgClientMsg, type DgEvent } from '../../shared/dungeon/api.ts';
import { hurtHero } from '../../shared/dungeon/core.ts';
import { startWave } from '../../shared/dungeon/director.ts';
import { spawnMob } from '../../shared/dungeon/mobs.ts';
import { addXp, openChest } from '../../shared/dungeon/progress.ts';
import { applyEvent, createRun, dgHash, dgResult, step, type DgSim, type WeaponId } from '../../shared/dungeon/sim.ts';
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
import { SimRun } from './simview.ts';
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
const useMock = params.get('mock') === '1';
const wave0 = Number(params.get('wave') ?? 0);

/** «Сервер» стенда: своя копия забега по журналу (порядок шага — как у server/dungeon/room.ts) */
const srv = {
  sim: null as DgSim | null,
  events: [] as DgEvent[],
  head: 0,
  checks: 0,
  desync: 0,
  waves: 0,
  coins: 0,
  ended: false,
  debug: false,
  reset(seed: number): void {
    this.sim = useMock ? null : createRun(seed);
    if (this.sim && wave0 > 1) startWave(this.sim, wave0);
    this.events = [];
    this.head = 0;
    this.checks = 0;
    this.desync = 0;
    this.waves = 0;
    this.coins = 0;
    this.ended = false;
    this.debug = false;
  },
  onLog(m: Extract<DgClientMsg, { t: 'dg_log' }>): void {
    const sim = this.sim;
    // отладочные правки есть только у клиента — копия «сервера» разошлась бы: не шагаем
    if (!sim || this.ended || this.debug) return;
    for (let i = this.events.length - m.from; i < m.ev.length; i++) if (i >= 0) this.events.push(m.ev[i]);
    let guard = 0;
    while (sim.t < m.upto && guard++ < 20000) {
      while (this.head < this.events.length && this.events[this.head].t <= sim.t) applyEvent(sim, this.events[this.head++]);
      const t0 = sim.t;
      step(sim);
      if (sim.t === t0 && !(this.head < this.events.length && this.events[this.head].t <= sim.t)) break;
      if (sim.t === m.upto && !this.debug) {
        this.checks++;
        if (dgHash(sim) !== m.h >>> 0) this.desync++;
      }
      while (sim.stats.waves > this.waves) {
        this.waves++;
        const c = dgWaveCoins(this.waves) + (this.waves % 10 === 0 ? dgBossCoins(this.waves / 10) : 0);
        this.coins += c;
        setTimeout(() => scene.onDg({ t: 'dg_wave', wave: this.waves, coins: c }), 30);
      }
      if (sim.end === 'death') {
        this.ended = true;
        const r = dgResult(sim);
        const coins = Math.min(DG_RUN_CAP, this.coins);
        setTimeout(() => scene.onDg({ t: 'dg_end', result: r, coins, newBest: r.waves > 0, weekRank: 3, pay: { waves: coins, bosses: 0, record: 0 } }), 900);
        break;
      }
    }
  },
};

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
          srv.onLog(msg);
          received = Math.max(received, msg.from + msg.ev.length);
          setTimeout(() => scene.onDg({ t: 'dg_ack', n: received }), 40);
        } else if (msg.t === 'dg_again') {
          setTimeout(() => hello(Math.floor(Math.random() * 1e9)), 100);
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
      if (useMock) {
        const m = new MockRun(seed);
        if (wave0 > 1) m.skipTo(wave0);
        run = m;
        return m;
      }
      const r = new SimRun(seed);
      if (wave0 > 1) startWave(r.sim, wave0);
      run = r;
      return r;
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
function hello(seed: number): void {
  srv.reset(seed);
  scene.onDg({ t: 'dg_hello', seed, best: 0, bestMs: 0, weekBest: 0 });
}
scene.enter();
hello(seed0);

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
  if (st?.ended && !endSent && run && (useMock || srv.debug)) {
    endSent = true;
    const r = run.result();
    setTimeout(() => scene.onDg({ t: 'dg_end', result: { ...r, end: 'death' }, coins: Math.min(600, r.waves * 8 + 6), newBest: r.waves > 0, weekRank: 3 }), 600);
  }
  if (!st?.ended) endSent = false;
}
requestAnimationFrame(frame);

const mock = (): MockRun | null => (run instanceof MockRun ? run : null);
const real = (): DgSim | null => {
  if (!(run instanceof SimRun)) return null;
  srv.debug = true;
  return run.sim;
};
(window as unknown as Record<string, unknown>).dgStand = {
  scene,
  state: () => ({ ...scene.debugState(), server: { tick: srv.sim?.t ?? -1, events: srv.events.length, checks: srv.checks, desync: srv.desync, waves: srv.waves, coins: srv.coins, debug: srv.debug } }),
  info: () => ({ ...renderer.gl.info.render, programs: renderer.gl.info.programs?.length ?? 0, memory: { ...renderer.gl.info.memory }, cpuMs: renderer.cpuMs }),
  log: () => log,
  wave: (n: number) => {
    mock()?.skipTo(n);
    const s = real();
    if (s) startWave(s, n);
  },
  level: (n = 1) => {
    mock()?.levelUp(n);
    const s = real();
    for (let i = 0; s && i < n; i++) {
      s.hero.xp = s.hero.xpNext;
      addXp(s, 0.01);
    }
  },
  give: (id: string, lv: number, evo = 0) => {
    mock()?.give(id, lv);
    const s = real();
    if (!s) return;
    const w = s.weapons.find((x) => x.id === id);
    if (w) {
      w.lv = lv;
      w.evo = evo ? 1 : 0;
    } else s.weapons.push({ id: id as WeaponId, lv, evo: evo ? 1 : 0, cd: 0, t2: 0 });
  },
  kill: () => {
    mock()?.killHero();
    const s = real();
    if (s) {
      s.hero.invT = 0;
      s.hero.dashT = 0;
      s.hero.hp = Math.min(s.hero.hp, 1);
      hurtHero(s, 99999, 'barrel');
    }
  },
  /** герой к постройке (altar, spring, chest, forge, lamp, cart, tramp, keg, brazier): i-я по близости, (ox, oz) — сдвиг */
  goto: (k: string, i = 0, ox = 0, oz = 3.5) => {
    const s = real();
    if (!s) return null;
    const h = s.hero;
    const ps = s.props.filter((p) => p.k === k && p.st !== 3).sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z));
    const p = ps[Math.min(i, ps.length - 1)];
    if (!p) return null;
    h.x = (p.x + ox + 240) % 240;
    h.z = (p.z + oz + 240) % 240;
    return { id: p.id, x: p.x, z: p.z, st: p.st };
  },
  /** подбор рядом с героем: stew, magnet, keg, hourglass, chest, bigchest */
  item: (k: string, dx = 2.5, dz = 0) => {
    const s = real();
    if (!s) return;
    s.items.push({ id: s.nextId++, k: k as DgSim['items'][number]['k'], x: (s.hero.x + dx + 240) % 240, z: (s.hero.z + dz + 240) % 240, t0: s.t });
  },
  /** снимок постройки по id */
  prop: (id: number) => (run instanceof SimRun ? run.sim.props.find((p) => p.id === id) ?? null : null),
  hero: () => (run instanceof SimRun ? { x: run.sim.hero.x, z: run.sim.hero.z, hp: run.sim.hero.hp, hpMax: run.sim.hero.hpMax, useId: run.sim.hero.useId, buffs: run.sim.hero.buffs, ride: run.sim.hero.ride, jump: run.sim.hero.jumpT1 > run.sim.t, xp: run.sim.hero.xp, level: run.sim.hero.level, chest: !!run.sim.chest, freeze: run.sim.freezeT > run.sim.t, items: run.sim.items.length } : null),
  /** озверение для снимка: столбцы врагов с уровнями 0…3 слева направо, стоят (песочные часы); flash — вспышка озверения */
  rageRow: (flash = false) => {
    const s = real();
    if (!s || !(run instanceof SimRun)) return;
    s.mobs.length = 0;
    s.hero.hp = s.hero.hpMax = 1e7;
    const kinds = ['rat', 'slime', 'shroom', 'beetle'] as const;
    for (let lv = 0; lv < 4; lv++) {
      kinds.forEach((k, ki) => {
        const m = spawnMob(s, k, s.hero.x + (lv - 1.5) * 5, s.hero.z - 6 + ki * 3, 0);
        m.rage = lv;
        m.hp = m.hpMax = 1e6;
        m.dx = 0;
        m.dz = 1;
      });
    }
    s.freezeT = s.t + 30 * 600;
    s.weapons.length = 0;
    if (flash) (run as unknown as { rageAt: number }).rageAt = s.t;
  },
  /** сундук-барабан (big — как у босса) */
  chest: (big = false) => {
    const s = real();
    if (s) openChest(s, big ? 'big' : 'small');
  },
  /** толпа из n врагов вокруг героя; герой не умирает и не растёт в уровне (замер) */
  crowd: (n = 300) => {
    mock()?.crowd(n);
    const s = real();
    if (!s) return;
    s.hero.hp = s.hero.hpMax = 1e7;
    s.hero.xpNext = 1e9;
    const kinds = ['rat', 'rat', 'rat', 'slime', 'shroom', 'beetle', 'spitter', 'bat'] as const;
    for (let i = 0; i < n; i++) {
      const a = (i * 2.399) % (Math.PI * 2);
      const r = 4 + Math.sqrt((i * 0.618) % 1) * 15;
      const m = spawnMob(s, kinds[i % kinds.length], s.hero.x + Math.sin(a) * r, s.hero.z + Math.cos(a) * r * 0.7, 0);
      m.hp = m.hpMax = m.hpMax * 40;
    }
  },
  pause: (on = true) => scene.game?.setPaused(on),
  /** держать клавишу (code) секунд */
  hold: (code: string, s: number) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code })), s * 1000);
  },
};
