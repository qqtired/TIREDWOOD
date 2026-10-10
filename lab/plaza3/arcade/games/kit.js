// Аркада набережной — общее для мини-игр (прототип лаборатории: без сборки, без импорта из игры).
//
// Как устроена мини-игра (модуль games/<id>.js):
//   meta              — название, правила, управление, пороги медалей;
//   makeSim(seed)     — чистая логика: sim.step(events) раз в тик (60 Гц); sim.tick, sim.score, sim.over, sim.fx;
//   createGame(canvas, opts) — готовый «автомат»: цикл, демо с автопилотом, отсчёт, пауза, итог;
//   replay(seed, log, ticks) — переиграть партию по журналу без экрана: так сервер сам посчитает очки.
// Журнал ввода — массив [тик, тип, a, b] (целые числа). Событие применяется в начале своего тика.
// Детерминизм: в симуляции только + − × ÷ и Math.sqrt/floor/round/abs/min/max/ceil, случайность — только из
// rngFrom(seed). Тогда Chrome, Safari, Firefox и Node (сервер) получают один и тот же счёт.

export const W = 320;
export const H = 240;
export const HZ = 60;
export const FONT = 'Rubik, system-ui, -apple-system, "Segoe UI", sans-serif';

/** Генератор 0..1 по зерну (mulberry32) */
export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Целое 0..n−1 */
export const irand = (rng, n) => Math.floor(rng() * n);

export function newSeed() {
  const c = globalThis.crypto;
  if (c && c.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

/** Медаль по очкам: 0 — нет, 1 бронза, 2 серебро, 3 золото */
export function medalOf(score, thresholds) {
  let m = 0;
  for (let i = 0; i < thresholds.length; i++) if (score >= thresholds[i]) m = i + 1;
  return m;
}
export const MEDALS = [
  { name: 'Без медали', color: '#9a8a80', dark: '#5c4f49' },
  { name: 'Бронза', color: '#e0904e', dark: '#8a4a1c' },
  { name: 'Серебро', color: '#dfe6ee', dark: '#7d8a98' },
  { name: 'Золото', color: '#ffd35a', dark: '#a8620c' },
];

/** Партия по журналу, без экрана. ticks — сколько тиков шла (партию могли закончить раньше, через Esc). */
export function replayRun(makeSim, seed, log, ticks) {
  const sim = makeSim(seed >>> 0);
  const cap = Math.min(Number.isFinite(ticks) ? ticks : Infinity, 30 * 60 * HZ);
  let i = 0;
  while (!sim.over && sim.tick < cap) {
    while (i < log.length && log[i][0] < sim.tick) i++;
    const ev = [];
    while (i < log.length && log[i][0] === sim.tick) {
      const e = log[i++];
      ev.push([e[1] | 0, e[2] | 0, e[3] | 0]);
    }
    sim.step(ev);
    sim.fx.length = 0;
  }
  return { score: sim.score, ticks: sim.tick, over: sim.over };
}

// ------------------------------------------------------------------ звук

/** Тихие «пиканья» WebAudio. Контекст создаётся при первом звуке (после нажатия игрока). */
export function createSfx(volume = 0.14) {
  let ac = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;
  const lastAt = new Map();
  let voices = 0;

  function ensure() {
    if (!ac) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = volume;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function env(g, t0, vol, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  function tone(freq, dur, type = 'square', vol = 0.4, slide = 0, delay = 0) {
    if (voices > 14) return;
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    env(g, t0, vol, dur);
    o.connect(g).connect(master);
    voices++;
    o.onended = () => voices--;
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.4, freq = 1800, delay = 0) {
    if (voices > 14) return;
    const t0 = ac.currentTime + delay;
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(80, freq / 6), t0 + dur);
    const g = ac.createGain();
    env(g, t0, vol, dur);
    s.connect(f).connect(g).connect(master);
    voices++;
    s.onended = () => voices--;
    s.start(t0);
    s.stop(t0 + dur + 0.02);
  }

  const notes = (list, step, type = 'square', vol = 0.3, dur = 0.09) => list.forEach((f, i) => tone(f, dur, type, vol, 0, i * step));

  const PRESETS = {
    start: () => notes([523, 659, 784], 0.07, 'square', 0.25),
    go: () => notes([784, 1047], 0.08, 'square', 0.28),
    pick: () => notes([660, 990], 0.05, 'square', 0.28, 0.07),
    gold: () => notes([784, 988, 1175, 1568], 0.05, 'square', 0.25),
    goldin: () => tone(1320, 0.12, 'triangle', 0.2, 1760),
    leave: () => tone(392, 0.18, 'triangle', 0.3, 262),
    crash: () => { noise(0.35, 0.55, 1200); tone(196, 0.3, 'sawtooth', 0.18, 55); },
    shot: () => noise(0.07, 0.45, 3200),
    hit: () => { tone(1480, 0.05, 'square', 0.22); tone(1976, 0.07, 'triangle', 0.22, 0, 0.035); },
    miss: () => tone(150, 0.06, 'triangle', 0.25),
    bad: () => tone(233, 0.28, 'sawtooth', 0.22, 117),
    popup: () => tone(523, 0.1, 'triangle', 0.2, 1047),
    final: () => notes([880, 880], 0.12, 'square', 0.22, 0.07),
    bounce: () => tone(392, 0.04, 'square', 0.2),
    wall: () => tone(294, 0.03, 'square', 0.12),
    brick: () => tone(660, 0.05, 'triangle', 0.3, 880),
    crack: () => tone(330, 0.05, 'triangle', 0.25),
    stone: () => tone(180, 0.04, 'square', 0.16),
    power: () => notes([523, 659, 784, 1047], 0.045, 'triangle', 0.3),
    lose: () => notes([392, 330, 262], 0.11, 'triangle', 0.3, 0.14),
    clear: () => notes([523, 659, 784, 1047, 1319], 0.07, 'square', 0.22),
    over: () => notes([392, 330, 262, 196], 0.13, 'triangle', 0.3, 0.16),
    record: () => notes([523, 659, 784, 1047, 784, 1047, 1319], 0.08, 'square', 0.22, 0.1),
  };

  return {
    play(name) {
      if (muted || !PRESETS[name]) return;
      if (!ensure()) return;
      const now = performance.now();
      if (now - (lastAt.get(name) ?? -1e9) < 45) return; // не чаще 22 раз в секунду одного и того же
      lastAt.set(name, now);
      PRESETS[name]();
    },
    get muted() { return muted; },
    set muted(v) { muted = !!v; },
  };
}

// ------------------------------------------------------------------ рисование

/** Текст с жёсткой тенью: аркадный, но читаемый (Rubik). */
export function txt(ctx, s, x, y, size, color, align = 'left', shadow = 'rgba(30,14,18,.9)') {
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (shadow) {
    ctx.fillStyle = shadow;
    ctx.fillText(s, x + 1, y + 1);
  }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

/** Желейка: круглая, блестящая, с глазками. look: −1..1 — куда смотрит. */
export function jelly(ctx, cx, cy, r, color, look = 0, squash = 0) {
  const rx = r * (1 + squash * 0.15);
  const ry = r * (1 - squash * 0.15);
  ctx.fillStyle = 'rgba(42,31,36,.25)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.92, rx * 0.9, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.38, cy - ry * 0.45, rx * 0.28, ry * 0.18, -0.5, 0, Math.PI * 2);
  ctx.fill();
  const ex = r * 0.34;
  const ey = cy - r * 0.05;
  const er = Math.max(1, r * 0.24);
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx + sx * ex + look * r * 0.12, ey, er, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a1f24';
    ctx.beginPath();
    ctx.arc(cx + sx * ex + look * r * 0.2, ey + er * 0.15, er * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Медаль-кружок с лентой */
export function medalIcon(ctx, x, y, m, r = 7) {
  const c = MEDALS[m];
  ctx.fillStyle = '#d9483a';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.8, y - r * 1.9);
  ctx.lineTo(x - r * 0.1, y - r * 0.4);
  ctx.lineTo(x + r * 0.1, y - r * 0.4);
  ctx.lineTo(x + r * 0.8, y - r * 1.9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.arc(x, y + 1, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

/** Всплывающие «+10», искры и пыль: только для картинки, на счёт не влияют. */
export function makeFxLayer() {
  const items = [];
  return {
    items,
    text(x, y, s, color = '#ffd35a', size = 10, life = 50) {
      items.push({ k: 't', x, y, s, color, size, life, age: 0 });
    },
    burst(x, y, colors, n = 10, speed = 1.6, life = 30, size = 2) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.8);
        items.push({ k: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6, color: colors[i % colors.length], life, age: 0, size, g: 0.06 });
      }
    },
    puff(x, y, color = 'rgba(255,255,255,.8)', life = 40, r = 3) {
      items.push({ k: 'c', x, y, vx: (Math.random() - 0.5) * 0.3, vy: -0.35 - Math.random() * 0.2, color, life, age: 0, r });
    },
    clear() { items.length = 0; },
    step() {
      for (let i = items.length - 1; i >= 0; i--) {
        const p = items[i];
        p.age++;
        if (p.k === 'p') { p.x += p.vx; p.y += p.vy; p.vy += p.g; }
        else if (p.k === 'c') { p.x += p.vx; p.y += p.vy; }
        else p.y -= 0.45;
        if (p.age >= p.life) items.splice(i, 1);
      }
    },
    draw(ctx) {
      for (const p of items) {
        const k = 1 - p.age / p.life;
        ctx.globalAlpha = Math.min(1, k * 1.6);
        if (p.k === 't') txt(ctx, p.s, p.x, p.y, p.size, p.color, 'center');
        else if (p.k === 'p') { ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size); }
        else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.6 - k * 0.6), 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    },
  };
}

/** Тёмная плашка сверху экрана (16 px): счёт, середина, рекорд */
export function topBar(ctx, left, mid, right, midColor = '#fff3de') {
  ctx.fillStyle = '#2a1f24';
  ctx.fillRect(0, 0, W, 16);
  ctx.fillStyle = '#4a3238';
  ctx.fillRect(0, 15, W, 1);
  txt(ctx, left, 6, 8.5, 10, '#fff3de');
  if (mid) txt(ctx, mid, W / 2, 8.5, 10, midColor, 'center');
  txt(ctx, right, W - 6, 8.5, 10, '#ffd35a', 'right');
}

// ------------------------------------------------------------------ автомат: цикл, режимы, ввод

/**
 * Запускает мини-игру на canvas (логические 320×240, canvas.width кратен 320).
 * opts: interactive (мышь и клавиши), startHint ('ПРОБЕЛ — ИГРАТЬ'), best, banner ('Саня' — «играет Саня»),
 *       onScore(score), onEnd(result), onMode(mode), sfx(name).
 * Режимы: attract (демо с автопилотом) → count (Готов? Поехали!) → play ⇄ paused → over.
 */
export function runCabinet(canvas, def, opts = {}) {
  const o = { interactive: true, startHint: 'ПРОБЕЛ — ИГРАТЬ', best: 0, banner: '', ...opts };
  const ctx = canvas.getContext('2d');
  const scale = canvas.width / W;
  const m = def.meta;
  let mode = 'attract';
  let prevMode = 'play';
  let sim = null;
  let seed = 0;
  let log = [];
  let pending = [];
  let botMem = {};
  let botRng = rngFrom(1);
  let acc = 0;
  let last = 0;
  let raf = 0;
  let running = true;
  let clock = 0;
  let countdown = 0;
  let attractEnd = 0;
  let overAt = 0;
  let lastScore = -1;
  let best = o.best | 0;
  let newBest = false;
  let result = null;
  let banner = o.banner;
  const ui = def.makeUi ? def.makeUi() : {};
  const fx = makeFxLayer();
  const view = { fx, shake: 0, clock: 0 };

  const ctl = {
    push(type, a = 0, b = 0) { if (mode === 'play') pending.push([type | 0, a | 0, b | 0]); },
    get mode() { return mode; },
  };

  function setMode(next) {
    mode = next;
    o.onMode?.(mode);
  }

  function begin(s) {
    seed = s >>> 0;
    sim = def.makeSim(seed);
    log = [];
    pending = [];
    lastScore = -1;
    fx.clear();
    view.shake = 0;
    def.resetUi?.(ui);
  }

  function attract() {
    begin(newSeed());
    botRng = rngFrom(seed ^ 0x9e3779b9);
    botMem = {};
    attractEnd = 0;
    setMode('attract');
  }

  function start(s) {
    begin(s ?? newSeed());
    countdown = Math.round(1.3 * HZ);
    newBest = false;
    result = null;
    setMode('count');
    o.sfx?.('start');
  }

  function end(aborted) {
    if (!sim || (mode !== 'play' && mode !== 'paused' && mode !== 'count')) return null;
    const score = sim.score;
    newBest = score > best && score > 0;
    if (newBest) best = score;
    result = { game: m.id, seed, ticks: sim.tick, score, log: log.slice(), aborted: !!aborted, medal: medalOf(score, m.medals), newBest };
    overAt = clock;
    setMode('over');
    if (!aborted) o.sfx?.(newBest ? 'record' : 'over');
    o.onEnd?.(result);
    return result;
  }

  function apply(ev) {
    sim.step(ev);
    for (const f of sim.fx) {
      def.onFx?.(view, f, sim);
      if (mode === 'play') o.sfx?.(f.k);
    }
    sim.fx.length = 0;
    if (mode === 'play' && sim.score !== lastScore) {
      lastScore = sim.score;
      o.onScore?.(sim.score);
    }
  }

  function tick() {
    clock++;
    view.clock = clock;
    fx.step();
    if (view.shake > 0) view.shake--;
    if (mode === 'attract') {
      if (!sim.over) {
        def.uiTick?.(ui, sim, null);
        apply(def.bot(sim, botMem, botRng, ui));
        if (sim.tick > 75 * HZ) sim.over = true;
      }
      if (sim.over && !attractEnd) attractEnd = clock + 2 * HZ;
      if (attractEnd && clock >= attractEnd) attract();
    } else if (mode === 'count') {
      def.uiTick?.(ui, sim, ctl);
      if (--countdown <= 0) {
        setMode('play');
        o.sfx?.('go');
      }
    } else if (mode === 'play') {
      def.uiTick?.(ui, sim, ctl);
      const ev = pending;
      pending = [];
      for (const e of ev) log.push([sim.tick, e[0], e[1], e[2]]);
      apply(ev);
      if (sim.over) end(false);
    }
  }

  function frame(ts) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts;
    acc += dt;
    let n = 0;
    while (acc >= 1 / HZ && n < 6) {
      acc -= 1 / HZ;
      tick();
      n++;
    }
    if (n >= 6) acc = 0;
    draw();
  }

  function draw() {
    const stepping = mode === 'play' || (mode === 'attract' && !sim.over);
    const st = { mode, clock, alpha: stepping ? acc * HZ : 0, banner };
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (view.shake > 0) {
      const k = view.shake / 3;
      ctx.translate(Math.round((Math.random() - 0.5) * k), Math.round((Math.random() - 0.5) * k));
    }
    def.draw(ctx, sim, view, ui, st, best);
    fx.draw(ctx);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    overlay();
  }

  const blink = (period = 50) => Math.floor(clock / period) % 2 === 0;

  function dim(a = 0.62) {
    ctx.fillStyle = `rgba(28,16,20,${a})`;
    ctx.fillRect(0, 16, W, H - 16);
  }

  function medalsRow(y) {
    const xs = [W / 2 - 84, W / 2, W / 2 + 84];
    for (let i = 0; i < 3; i++) {
      medalIcon(ctx, xs[i] - 26, y, i + 1, 6);
      txt(ctx, String(m.medals[i]), xs[i] - 16, y + 1, 11, '#fff3de');
    }
  }

  function overlay() {
    if (mode === 'attract') {
      if (banner) {
        ctx.fillStyle = 'rgba(28,16,20,.82)';
        ctx.fillRect(0, H - 20, W, 20);
        txt(ctx, `ИГРАЕТ ${banner.toUpperCase()}`, W / 2, H - 10, 11, '#ffd35a', 'center');
        return;
      }
      const titlePage = Math.floor(clock / (4 * HZ)) % 2 === 0;
      if (titlePage) {
        dim(0.66);
        txt(ctx, m.title.toUpperCase(), W / 2, 74, m.title.length > 10 ? 26 : 32, '#ffd35a', 'center', '#7a2a1c');
        txt(ctx, m.like.toUpperCase(), W / 2, 102, 11, '#fff3de', 'center');
        medalsRow(136);
        if (best > 0) txt(ctx, `ТВОЙ РЕКОРД ${best}`, W / 2, 162, 11, '#ffd35a', 'center');
        if (blink(36)) txt(ctx, o.startHint, W / 2, 198, 14, '#fff3de', 'center');
      } else {
        ctx.fillStyle = 'rgba(28,16,20,.75)';
        ctx.fillRect(0, H - 20, W, 20);
        txt(ctx, 'ДЕМО', 8, H - 10, 10, '#ffb36b');
        if (blink(36)) txt(ctx, o.startHint, W / 2, H - 10, 11, '#fff3de', 'center');
      }
    } else if (mode === 'count') {
      dim(0.3);
      const first = countdown > 0.6 * HZ;
      txt(ctx, first ? 'ГОТОВ?' : m.go, W / 2, H / 2 + 4, first ? 28 : 34, first ? '#fff3de' : '#ffd35a', 'center', '#7a2a1c');
    } else if (mode === 'paused') {
      dim(0.6);
      txt(ctx, 'ПАУЗА', W / 2, H / 2 - 8, 30, '#fff3de', 'center');
      txt(ctx, 'P ИЛИ ПРОБЕЛ — ДАЛЬШЕ', W / 2, H / 2 + 24, 11, '#ffd35a', 'center');
    } else if (mode === 'over' && result) {
      dim(0.7);
      const md = result.medal;
      txt(ctx, result.aborted ? 'ИГРА ЗАКОНЧЕНА' : m.overTitle, W / 2, 54, 20, '#ff9a8a', 'center');
      txt(ctx, String(result.score), W / 2, 92, 34, '#fff3de', 'center');
      if (md > 0) {
        medalIcon(ctx, W / 2 - 40, 132, md, 8);
        txt(ctx, MEDALS[md].name.toUpperCase(), W / 2 - 26, 133, 14, MEDALS[md].color, 'left');
      } else {
        txt(ctx, `ДО БРОНЗЫ ЕЩЁ ${m.medals[0] - result.score}`, W / 2, 133, 12, '#ffb36b', 'center');
      }
      if (md > 0 && md < 3) txt(ctx, `ДО МЕДАЛИ «${MEDALS[md + 1].name.toUpperCase()}» — ${m.medals[md] - result.score}`, W / 2, 152, 9, '#d8c4b0', 'center');
      if (result.newBest && blink(20)) txt(ctx, 'НОВЫЙ РЕКОРД!', W / 2, 174, 16, '#ffd35a', 'center', '#a8620c');
      if (clock - overAt > 40 && o.interactive) txt(ctx, 'ПРОБЕЛ — ЕЩЁ РАЗ', W / 2, 210, 12, '#fff3de', 'center');
    }
  }

  // ---------------------------------------------------------------- ввод

  function logical(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  const onMove = (e) => {
    const p = logical(e);
    def.pointer?.('move', p.x, p.y, e.button, ctl, ui, sim);
  };
  const onDown = (e) => {
    e.preventDefault();
    canvas.focus?.({ preventScroll: true });
    const p = logical(e);
    if (e.button !== 0) return;
    if (mode === 'attract') return start();
    if (mode === 'over') { if (clock - overAt > 40) start(); return; }
    if (mode === 'paused') return resume();
    def.pointer?.('down', p.x, p.y, e.button, ctl, ui, sim);
  };
  const noMenu = (e) => e.preventDefault();
  if (o.interactive) {
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('contextmenu', noMenu);
  }

  function resume() {
    if (mode !== 'paused') return;
    setMode(prevMode);
  }

  attract();
  raf = requestAnimationFrame(frame);

  return {
    meta: m,
    get mode() { return mode; },
    get score() { return sim ? sim.score : 0; },
    get seed() { return seed; },
    get result() { return result; },
    /** Состояние партии — для отладки и проверок (только чтение) */
    get sim() { return sim; },
    start,
    restart() { start(); },
    pause() {
      if (mode !== 'play' && mode !== 'count') return;
      prevMode = mode;
      setMode('paused');
    },
    resume,
    togglePause() { if (mode === 'paused') resume(); else this.pause(); },
    /** Закончить партию сейчас (Esc): счёт засчитывается как есть */
    finish() { return end(true); },
    /** Вернуться в демо */
    idle() { attract(); },
    /** Клавиша: true — нажата. Возвращает true, если игра её съела. */
    key(code, down) {
      if (down && code === 'Space') {
        if (mode === 'attract') { start(); return true; }
        if (mode === 'over') { if (clock - overAt > 40) start(); return true; }
        if (mode === 'paused') { resume(); return true; }
      }
      if (mode === 'play' || mode === 'count') return !!def.key?.(code, down, ctl, ui, sim);
      return false;
    },
    setBest(v) { best = v | 0; },
    setBanner(v) { banner = v || ''; },
    /** Остановить/продолжить отрисовку (свёрнутый автомат не тратит кадр) */
    setRunning(v) {
      if (v && !running) { running = true; last = 0; raf = requestAnimationFrame(frame); }
      if (!v && running) { running = false; cancelAnimationFrame(raf); }
    },
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('contextmenu', noMenu);
    },
  };
}
