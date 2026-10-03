// Живые превью: одна общая сцена отрисовки на всю страницу. Внутри — один Renderer игры на невидимом холсте, кадр
// каждой живой карточки копируется в её холст. Живых карточек не больше двух (запуск третьей останавливает самую
// старую), всё замирает, когда вкладка скрыта или карточка ушла с экрана. Пока никто не нажал «Живое превью», three.js
// и код отрисовки не загружаются вовсе.
import { h } from './dom.ts';
import { LabSound } from './sound.ts';
import type { Experiment, LabContext, LiveScene, Meter, PanelApi } from './types.ts';

export interface LiveHost {
  entry: Experiment;
  media: HTMLElement;
  art: HTMLElement;
  btn: HTMLButtonElement;
  panel: HTMLElement;
}

/** Размер кадра: 16 : 10; живые карточки рисуются в один и тот же размер, поэтому буфер не пересоздаётся */
const RENDER_W = 720;
const RENDER_H = 450;
const MAX_LIVE = 2;

type Mods = {
  THREE: typeof import('three');
  kit: LabContext['kit'];
  Renderer: typeof import('../render/renderer.ts').Renderer;
};

interface Live {
  host: LiveHost;
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  scene: LiveScene;
  t: number;
  visible: boolean;
  /** камера вокруг точки: радиус, исходный угол по азимуту и по высоте, поправки от пальца */
  r: number;
  theta0: number;
  phi0: number;
  yaw: number;
  pitch: number;
  touched: boolean;
  target: import('three').Vector3;
  io: IntersectionObserver;
  off: Array<() => void>;
  label: string;
}

const sound = new LabSound();
const lives: Live[] = [];
const starting = new Set<LiveHost>();
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let modsPromise: Promise<Mods> | null = null;
let renderer: InstanceType<Mods['Renderer']> | null = null;
let raf = 0;
let last = 0;

function loadMods(): Promise<Mods> {
  modsPromise ??= Promise.all([import('three'), import('./kit3d.ts'), import('../render/renderer.ts')])
    .then(([THREE, k, r]) => ({ THREE, kit: k.kit, Renderer: r.Renderer }))
    .catch((e: unknown) => {
      modsPromise = null;
      throw e;
    });
  return modsPromise;
}

function getRenderer(m: Mods): InstanceType<Mods['Renderer']> {
  if (renderer) return renderer;
  const canvas = document.createElement('canvas');
  const r = new m.Renderer(canvas);
  r.resize(RENDER_W, RENDER_H, 1);
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    for (const l of [...lives]) stop(l, 'Видеокарта перезапустилась. Нажми ещё раз.');
  });
  renderer = r;
  return r;
}

// ---------------------------------------------------------------- панель под сценой

function makePanel(host: LiveHost): PanelApi {
  const panel = host.panel;
  panel.replaceChildren();
  panel.hidden = false;
  const hint = h('p', { class: 'lab-panel-note' }, host.entry.live.hint);
  const note = h('p', { class: 'lab-panel-note', hidden: true });
  panel.append(hint, note);
  const api: PanelApi = {
    button(label, on, primary = false) {
      const b = h('button', { class: 'lab-btn', type: 'button', 'data-primary': primary ? 'true' : undefined, onclick: () => on() }, label);
      panel.append(b);
      return b;
    },
    hold(label, down, up) {
      let on = false;
      const press = (): void => {
        if (on) return;
        on = true;
        b.dataset.down = 'true';
        down();
      };
      const release = (): void => {
        if (!on) return;
        on = false;
        delete b.dataset.down;
        up();
      };
      const b = h('button', { class: 'lab-btn', type: 'button', 'data-primary': 'true', 'data-hold': 'true' }, label);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.setPointerCapture?.(e.pointerId);
        press();
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, release);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      b.addEventListener('keydown', (e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          press();
        }
      });
      b.addEventListener('keyup', (e) => {
        if (e.key === ' ' || e.key === 'Enter') release();
      });
      b.addEventListener('blur', release);
      panel.append(b);
      return b;
    },
    meter(label): Meter {
      const zone = h('div', { class: 'lab-meter-zone' });
      const mark = h('div', { class: 'lab-meter-mark' });
      const el = h('div', { class: 'lab-meter' }, h('span', {}, label), h('div', { class: 'lab-meter-bar' }, zone, mark));
      panel.append(el);
      return {
        set(v) {
          mark.style.left = `${Math.max(0, Math.min(1, v)) * 100}%`;
        },
        zone(from, to) {
          zone.style.left = `${from * 100}%`;
          zone.style.width = `${(to - from) * 100}%`;
        },
      };
    },
    stat(label, value = '') {
      const b = h('b', {}, value);
      const el = h('span', { class: 'lab-stat' }, `${label}: `, b);
      panel.append(el);
      return {
        set(v) {
          b.textContent = v;
        },
      };
    },
    note(text) {
      note.hidden = !text;
      note.textContent = text;
    },
    input(label, value, max) {
      const input = h('input', { type: 'text', maxlength: max, autocomplete: 'off', spellcheck: 'false', 'aria-label': label });
      input.value = value;
      panel.append(h('label', { class: 'lab-field' }, h('span', {}, label), input));
      return input;
    },
  };
  return api;
}

// ---------------------------------------------------------------- запуск и остановка

export const stage = {
  toggle(host: LiveHost): void {
    const live = lives.find((l) => l.host === host);
    if (live) stop(live);
    else if (!starting.has(host)) void start(host);
  },
  stopAll(): void {
    for (const l of [...lives]) stop(l);
  },
};

function setButton(host: LiveHost, on: boolean, text?: string): void {
  const label = host.btn.lastChild;
  if (on) {
    host.btn.dataset.on = 'true';
    if (label) label.textContent = text ?? 'Стоп';
  } else {
    delete host.btn.dataset.on;
    if (label) label.textContent = host.entry.live.cta ?? 'Живое превью';
  }
}

function showError(host: LiveHost, text: string): void {
  host.panel.hidden = false;
  host.panel.replaceChildren(h('p', { class: 'lab-panel-note', 'data-kind': 'bad' }, text));
}

async function start(host: LiveHost): Promise<void> {
  starting.add(host);
  setButton(host, true, 'Загружаем…');
  host.btn.disabled = true;
  sound.unlock();
  try {
    const mods = await loadMods();
    getRenderer(mods);
    while (lives.length >= MAX_LIVE) stop(lives[0]!);

    const canvas = h('canvas', { class: 'lab-live', width: RENDER_W, height: RENDER_H, role: 'img', 'aria-label': `Живое превью: ${host.entry.title}. Перетаскивание вращает камеру.` });
    const g = canvas.getContext('2d');
    if (!g) throw new Error('canvas');
    host.media.insertBefore(canvas, host.btn);

    const ctx: LabContext = { THREE: mods.THREE, kit: mods.kit, ui: makePanel(host), sound };
    let scene: LiveScene;
    try {
      scene = host.entry.live.create(ctx);
    } catch (e) {
      canvas.remove();
      throw e;
    }
    // под сценой: звук и остановка
    const soundBtn = h('button', { class: 'lab-btn', type: 'button' }, '');
    const paintSound = (): void => {
      soundBtn.textContent = sound.enabled ? 'Звук: вкл' : 'Звук: выкл';
    };
    soundBtn.addEventListener('click', () => {
      sound.setEnabled(!sound.enabled);
      sound.unlock();
      paintSound();
    });
    paintSound();
    host.panel.append(soundBtn);

    const target = (scene.target ?? new mods.THREE.Vector3(0, 1, 0)).clone();
    const off = scene.camera.position.clone().sub(target);
    const rad = Math.max(0.01, off.length());
    const live: Live = {
      host, canvas, g, scene, t: 0, visible: true,
      r: rad, theta0: Math.atan2(off.x, off.z), phi0: Math.acos(Math.max(-1, Math.min(1, off.y / rad))),
      yaw: 0, pitch: 0, touched: false, target,
      io: new IntersectionObserver((entries) => {
        for (const e of entries) live.visible = e.isIntersecting;
      }, { threshold: 0.05 }),
      off: [], label: host.btn.lastChild?.textContent ?? '',
    };
    live.io.observe(host.media);
    bindPointer(live);
    lives.push(live);
    setButton(host, true);
    host.btn.disabled = false;
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  } catch (e) {
    host.btn.disabled = false;
    setButton(host, false);
    const msg = e instanceof Error && /WebGL|context/i.test(e.message) ? 'Нет WebGL: живое превью не запустилось, остаётся картинка.' : 'Живое превью не запустилось. Попробуй обновить страницу.';
    showError(host, msg);
    console.error('lab: превью не запустилось', e instanceof Error ? e.message : e);
  } finally {
    starting.delete(host);
  }
}

function stop(l: Live, message?: string): void {
  const i = lives.indexOf(l);
  if (i >= 0) lives.splice(i, 1);
  l.io.disconnect();
  for (const f of l.off) f();
  try {
    l.scene.dispose();
  } catch {
    // сцена уже сломана: нам важно только освободить место
  }
  l.canvas.remove();
  l.host.panel.hidden = true;
  l.host.panel.replaceChildren();
  setButton(l.host, false);
  if (message) showError(l.host, message);
  if (!lives.length && raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
}

// ---------------------------------------------------------------- кадр и камера

function frame(now: number): void {
  raf = 0;
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  const r = renderer;
  if (r) {
    for (const l of [...lives]) {
      if (!l.visible) continue;
      try {
        l.t += dt;
        l.scene.update(dt, l.t);
        orbit(l);
        r.render(l.scene.scene, l.scene.camera, l.scene.exposure ?? 1);
        l.g.drawImage(r.canvas, 0, 0, RENDER_W, RENDER_H);
      } catch (e) {
        console.error('lab: сцена остановилась', e instanceof Error ? e.message : e);
        stop(l, 'Сцена остановилась из-за ошибки. Нажми ещё раз.');
      }
    }
  }
  if (lives.length) raf = requestAnimationFrame(frame);
}

function orbit(l: Live): void {
  const sway = l.touched || REDUCED ? 0 : Math.sin(l.t * 0.35) * 0.12;
  const theta = l.theta0 + l.yaw + sway;
  const phi = Math.max(0.3, Math.min(1.5, l.phi0 + l.pitch));
  const cam = l.scene.camera;
  cam.position.set(l.target.x + l.r * Math.sin(phi) * Math.sin(theta), l.target.y + l.r * Math.cos(phi), l.target.z + l.r * Math.sin(phi) * Math.cos(theta));
  cam.lookAt(l.target);
}

/** Тянешь по сцене — камера вращается; короткое касание — сцене (tap). Вертикальный свайп на телефоне листает страницу. */
function bindPointer(l: Live): void {
  const c = l.canvas;
  let down: { id: number; x: number; y: number; t: number; moved: number } | null = null;
  const onDown = (e: PointerEvent): void => {
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    c.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent): void => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down.x = e.clientX;
    down.y = e.clientY;
    down.moved += Math.abs(dx) + Math.abs(dy);
    if (down.moved > 6) l.touched = true;
    l.yaw -= dx * 0.008;
    if (e.pointerType === 'mouse') l.pitch = Math.max(-0.5, Math.min(0.6, l.pitch - dy * 0.005));
  };
  const onUp = (e: PointerEvent): void => {
    if (!down || e.pointerId !== down.id) return;
    const d = down;
    down = null;
    if (d.moved < 8 && performance.now() - d.t < 500 && l.scene.tap) {
      const rect = c.getBoundingClientRect();
      l.scene.tap(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
    }
  };
  const onCancel = (): void => {
    down = null;
  };
  c.addEventListener('pointerdown', onDown);
  c.addEventListener('pointermove', onMove);
  c.addEventListener('pointerup', onUp);
  c.addEventListener('pointercancel', onCancel);
  c.addEventListener('contextmenu', (e) => e.preventDefault());
  l.off.push(() => {
    c.removeEventListener('pointerdown', onDown);
    c.removeEventListener('pointermove', onMove);
    c.removeEventListener('pointerup', onUp);
    c.removeEventListener('pointercancel', onCancel);
  });
}
