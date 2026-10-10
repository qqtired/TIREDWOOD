// Плавный переход между комнатами (набережная ⇄ режимы).
// 1. Письмо `scene` → затемнение 0,35 с: старая сцена ещё рисуется, письма новой комнаты ждут в очереди,
//    номер перехода меняем только при стройке (старый ввод сервер выбросит).
// 2. Под непрозрачным экраном загрузки: выход из старой сцены, стройка новой, разбор очереди.
// 3. Прогрев без рисования: кадр сцены, в котором gl.render только запоминает пары «сцена + камера», — по ним
//    compileAsync (шейдеры компилируются параллельно, кадр не стоит), текстуры заливаются по нескольку за кадр;
//    второй проход ловит то, что появилось из первых снимков (игроки, зомби).
// 4. Пара настоящих кадров под экраном → {t:'ready'} серверу → проявление 0,4 с, сразу вид от игрока.
// Экран — картина режима на весь экран, желейка-ведущая с подсказками, название и полоса (вид — transition.css,
// картины и тексты — transition-art.ts). Анимируется только transform/opacity: эти анимации ведёт compositor,
// и они не замирают, пока строится мир.
// После проявления — плашка «Ждём: …», пока грузятся остальные, и крупный отсчёт 3-2-1 по письму сервера `go`.
// 15 с без готовности или ошибка стройки — сообщение и назад на набережную.
import type * as THREE from 'three';
import { LOAD_GIVEUP_MS, type LoadServerMsg, type LoadWho } from '../../shared/loading.ts';
import type { ClientMsg, RoomKind, ServerMsg } from '../../shared/messages.ts';
import { errorReport } from '../errors.ts';
import type { Renderer } from '../render/renderer.ts';
import type { Scene } from '../scene.ts';
import { MODE_CARDS, nextTips, preloadArt } from './transition-art.ts';
import './transition.css';

/** Затемнение до экрана загрузки и проявление мира, мс (такие же — в transition.css) */
const OUT_MS = 350;
const IN_MS = 400;
/** Экран загрузки виден хотя бы столько, мс: тёплый вход тоже успевают прочитать, а не мигает */
const HOLD_MS = 650;
const HOLD_LOBBY_MS = 250;
/** Прогрев шейдеров и текстур дольше этого — дальше просто рисуем (досчитается на первых кадрах) */
const WARM_MAX_MS = 6000;
/** Сцена грузит модели (Scene.modelsLoading, ферма): ждём их не дольше, потом показываем как есть */
const LOAD_MAX_MS = 15000;
/** Текстуры: сколько миллисекунд кадра на заливку */
const TEX_BUDGET_MS = 6;
/** Настоящих кадров под экраном перед «готов» */
const REAL_FRAMES = 2;
/** После провала: как часто просить сервер вернуть на набережную; первый раз — не раньше, чем сервер разрешит
 * новый переход (2 с после прошлого, server/hub.ts MOVE_COOLDOWN), иначе ответит «Не так быстро» */
const FAIL_RETRY_MS = 2500;
const FAIL_FIRST_MS = 2100;
/** Режимы со своим крупным отсчётом на старте */
const OWN_COUNT: ReadonlySet<RoomKind> = new Set(['race', 'skill']);
/** Картины режимов — в кэш через столько после входа в игру (не мешать загрузке самой набережной), мс */
const PRELOAD_MS = 4000;

type Phase = 'idle' | 'out' | 'build' | 'warm' | 'frames' | 'in' | 'fail';

interface Captured {
  scene: THREE.Object3D;
  camera: THREE.Camera;
  target: THREE.WebGLRenderTarget | null;
  toneMapping: THREE.ToneMapping;
}

export interface TransitionHost {
  readonly renderer: Renderer;
  /** Текущая сцена (во время затемнения — ещё старая) */
  active(): Scene | null;
  /** Сменить сцену: номер перехода — наш, старую — прочь, новую — построить и войти. Вернуть новую. */
  build(kind: RoomKind, epoch: number): Scene;
  send(msg: ClientMsg): void;
  /** Свой ник: в списке «кто заходит» это «ты» */
  nick(): string;
  /** Подпись режима (например, трасса картинга); null — обычная */
  detail(kind: RoomKind): string | null;
  sound: { countBeep(go: boolean): void; whoosh(pos: null): void };
  /** Можно ли управлять — поменялось (экран загрузки ввод не пускает) */
  blockedChanged(): void;
  /** Отдать мышь (на экране ошибки нужна кнопка) */
  freePointer(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.appendChild(e);
  return e;
}

function report(where: string, e: unknown): void {
  console.error(e);
  const err = e as { message?: unknown; stack?: unknown } | null;
  errorReport.add(`переход (${where}): ${typeof err?.message === 'string' ? err.message : String(e)}`, '', typeof err?.stack === 'string' ? err.stack : '');
}

export class Transition {
  /** Экран загрузки (в #menus сразу над старым затемнением: пауза и экраны связи — поверх него) */
  readonly root: HTMLElement;
  /** Плашка «Ждём…» и крупный отсчёт — над экраном загрузки, мышь не ловят */
  readonly hud: HTMLElement;
  private readonly h: TransitionHost;
  private phase: Phase = 'idle';
  private kind: RoomKind = 'lobby';
  private epoch = 0;
  private queue: Array<{ m?: ServerMsg; buf?: ArrayBuffer; at?: number }> = [];
  private scene: Scene | null = null;
  /** Сколько писем дошло до новой сцены */
  private fed = 0;
  /** Мс видимых кадров с начала перехода (спрятанная вкладка не считается) — для 15 с */
  private elapsed = 0;
  private phaseAt = 0;
  private opaqueAt = 0;
  private compiled = false;
  private compiling: Promise<unknown> | null = null;
  private passes = 0;
  private readonly uploaded = new WeakSet<THREE.Texture>();
  private textures: THREE.Texture[] = [];
  private texTotal = 0;
  private rendered = 0;
  private failRetryAt = 0;
  /** Мгновенный вход (после входа в игру, переподключения): «готов» — после пары кадров */
  private instantEpoch = -1;
  private instantFrames = 0;
  private who: LoadWho[] = [];
  private waiting = 0;
  /** Плашка «не дождались» видна до (performance.now) */
  private missedUntil = 0;
  private goAt = 0;
  private goShown = -1;
  private goHideAt = 0;
  private goWord = '';

  private readonly artEl: HTMLElement;
  private readonly picEl: HTMLImageElement;
  private readonly jellyEl: HTMLImageElement;
  private readonly tipsEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly subEl: HTMLElement;
  private readonly barEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly whoEl: HTMLElement;
  private readonly retryEl: HTMLButtonElement;
  private readonly waitEl: HTMLElement;
  private readonly waitTextEl: HTMLElement;
  private readonly waitLeftEl: HTMLElement;
  private waitKey = '';
  private readonly countEl: HTMLElement;
  private readonly countNumEl: HTMLElement;
  private preloadAt = 0;

  constructor(host: TransitionHost, after: HTMLElement) {
    this.h = host;
    this.root = el('div', 'tr');
    this.root.setAttribute('aria-hidden', 'true');
    // картина режима (пока не пришла — небо в цвет режима) и облака, что плывут поверх неё
    this.artEl = el('div', 'tr-art', this.root);
    this.picEl = el('img', 'tr-pic', this.artEl);
    this.picEl.alt = '';
    this.picEl.decoding = 'async';
    this.picEl.draggable = false;
    this.picEl.addEventListener('load', () => this.artEl.classList.add('ready'));
    const clouds = el('div', 'tr-clouds', this.root);
    for (let i = 1; i <= 3; i++) el('i', `tr-cloud c${i}`, clouds);
    el('div', 'tr-shade', this.root);
    const brand = el('p', 'tr-brand', this.root);
    brand.innerHTML = 'TIRED<b>WOOD</b>';
    // желейка-ведущая: подпрыгивает и подсказывает (подсказки сменяются сами, CSS)
    const hostEl = el('div', 'tr-host', this.root);
    const bubble = el('div', 'tr-bubble', hostEl);
    el('b', 'tr-bubble-label', bubble).textContent = 'Совет';
    this.tipsEl = el('div', 'tr-tips', bubble);
    const jelly = el('div', 'tr-jelly', hostEl);
    el('i', 'tr-jelly-shadow', jelly);
    this.jellyEl = el('img', '', jelly);
    this.jellyEl.alt = '';
    this.jellyEl.decoding = 'async';
    this.jellyEl.draggable = false;
    const card = el('div', 'tr-card', this.root);
    card.setAttribute('role', 'status');
    this.titleEl = el('h2', 'tr-title', card);
    this.subEl = el('p', 'tr-sub', card);
    const bar = el('div', 'tr-bar', card);
    this.barEl = el('i', '', bar);
    this.statusEl = el('p', 'tr-status', card);
    this.whoEl = el('div', 'tr-who', card);
    this.retryEl = el('button', 'btn primary tr-retry', card);
    this.retryEl.textContent = 'Обновить страницу';
    this.retryEl.hidden = true;
    this.retryEl.addEventListener('click', () => location.reload());
    this.hud = el('div', 'tr-hud');
    this.waitEl = el('div', 'tr-wait', this.hud);
    el('i', 'tr-wait-ico', this.waitEl);
    this.waitTextEl = el('span', 'tr-wait-text', this.waitEl);
    this.waitLeftEl = el('b', 'tr-wait-left', this.waitEl);
    this.countEl = el('div', 'tr-count', this.hud);
    el('i', 'tr-count-burst', this.countEl);
    el('i', 'tr-count-ring', this.countEl);
    el('i', 'tr-count-disc', this.countEl);
    this.countNumEl = el('b', 'tr-count-num', this.countEl);
    after.after(this.root, this.hud);
  }

  /** Экран загрузки на месте: ввод не пускаем */
  get busy(): boolean {
    return this.phase !== 'idle' && this.phase !== 'in';
  }

  /** Письма новой комнаты ещё некому отдать — ждут в очереди */
  get queueing(): boolean {
    return this.phase === 'out' || this.phase === 'fail';
  }

  // ------------------------------------------------------------ письма

  /** Сервер перевёл в другую комнату. */
  begin(kind: RoomKind, epoch: number): void {
    const was = this.phase;
    this.instantEpoch = -1;
    this.kind = kind;
    this.epoch = epoch;
    this.queue = [];
    this.fed = 0;
    this.elapsed = 0;
    this.who = [];
    this.waiting = 0;
    this.missedUntil = 0;
    this.goAt = 0;
    this.hideCount();
    this.root.classList.remove('failed');
    this.retryEl.hidden = true;
    this.fill(kind);
    this.renderWho();
    this.syncWait();
    if (was === 'idle' || was === 'in' || was === 'out') {
      // экран ещё не (весь) тёмный: затемняем; уже затемнялись — досчитываем то же затемнение
      if (was !== 'out') this.phaseAt = performance.now();
      this.phase = 'out';
      this.progress(0.08, 0.35);
      this.status(kind === 'lobby' ? 'Возвращаемся…' : 'Идём…');
      this.root.classList.add('on');
      if (was !== 'out') this.h.sound.whoosh(null);
    } else {
      // экран уже тёмный (строили другое или был провал): сразу строить
      this.phase = 'build';
      this.opaqueAt = performance.now();
    }
    this.h.blockedChanged();
  }

  /** Сцену сменили сразу, без экрана загрузки (вход в игру): «готов» тоже нужен — по нему сервер знает, что нас стоит ждать. */
  instant(epoch: number): void {
    this.instantEpoch = epoch;
    this.instantFrames = 0;
    // вошли в игру: картины режимов — в кэш чуть позже, когда набережная уже грузится не будет
    if (!this.preloadAt) this.preloadAt = performance.now() + PRELOAD_MS;
  }

  /** Письмо для сцены: во время затемнения — в очередь новой комнаты, иначе — текущей сцене. */
  toScene(m: ServerMsg): void {
    if (this.queueing) {
      this.queue.push({ m });
      return;
    }
    const s = this.h.active();
    if (!s) return;
    this.fed++;
    s.onJson(m);
  }

  snapshot(buf: ArrayBuffer, at: number): void {
    if (this.queueing) {
      this.queue.push({ buf, at });
      return;
    }
    const s = this.h.active();
    if (!s) return;
    this.fed++;
    s.onSnapshot(buf, at);
  }

  /** Письма ожидания: кто заходит и грузится, отсчёт до старта. */
  onJson(m: LoadServerMsg): void {
    if (m.t === 'load') {
      const missed = m.wait === 0 && m.who.some((w) => !w.ok) && this.waiting > 0;
      this.who = m.who;
      this.waiting = m.wait;
      if (m.wait > 0) this.hideCount();
      this.missedUntil = missed ? performance.now() + 2600 : 0;
      this.renderWho();
      this.syncWait();
      return;
    }
    if (OWN_COUNT.has(this.kind) || !(m.ms > 0)) return;
    this.goAt = performance.now() + m.ms;
    this.goShown = -1;
    this.goWord = MODE_CARDS[this.kind].go;
  }

  /** Связь пропала или ушли в меню: всё убрать сразу. */
  cancel(): void {
    this.phase = 'idle';
    this.queue = [];
    this.scene = null;
    this.textures = [];
    this.compiling = null;
    this.root.classList.remove('on', 'failed', 'play');
    this.goAt = 0;
    this.hideCount();
    this.who = [];
    this.waiting = 0;
    this.syncWait();
  }

  // ------------------------------------------------------------ кадр

  /**
   * Каждый кадр игры. true — кадр сцены уже сделан здесь (стройка, прогрев без рисования): оболочке не рисовать.
   * false — рисовать как обычно (затемнение поверх старой сцены, настоящие кадры под экраном, проявление).
   */
  frame(now: number, dt: number): boolean {
    this.tickCount(now);
    if (this.preloadAt > 0 && now > this.preloadAt) {
      this.preloadAt = -1;
      preloadArt();
    }
    if (this.missedUntil && now > this.missedUntil) {
      this.missedUntil = 0;
      this.syncWait();
    }
    if (this.instantEpoch >= 0 && ++this.instantFrames > REAL_FRAMES) {
      this.h.send({ t: 'ready', e: this.instantEpoch });
      this.instantEpoch = -1;
    }
    if (this.phase === 'idle') return false;
    this.elapsed += dt * 1000;
    if (this.busy && this.phase !== 'fail' && this.elapsed > LOAD_GIVEUP_MS) {
      this.fail(false);
      return true;
    }
    switch (this.phase) {
      case 'out':
        if (now - this.phaseAt >= OUT_MS) {
          // экран стал непрозрачным; строить — со следующего кадра, чтобы этот успел показаться
          this.phase = 'build';
          this.opaqueAt = now;
          this.status(MODE_CARDS[this.kind].build);
          // полоса ползёт сама (её ведёт compositor), пока главный поток занят стройкой
          this.progress(0.55, 1.6);
        }
        return false;
      case 'build':
        this.build(now, dt);
        return true;
      case 'warm':
        this.warm(now, dt);
        return true;
      case 'frames': {
        const hold = this.kind === 'lobby' ? HOLD_LOBBY_MS : HOLD_MS;
        if (this.rendered >= REAL_FRAMES && (this.fed > 0 || this.elapsed > 3000) && now - this.opaqueAt >= hold) {
          this.reveal(now);
          return false;
        }
        this.rendered++;
        return false;
      }
      case 'in':
        if (now - this.phaseAt >= IN_MS) {
          this.phase = 'idle';
          // экран растаял: его бесконечные анимации (облака, желейка, подсказки) — стоп
          this.root.classList.remove('play');
        }
        return false;
      case 'fail':
        if (this.kind !== 'lobby' && this.elapsed > this.failRetryAt) {
          this.failRetryAt = this.elapsed + FAIL_RETRY_MS;
          this.h.send({ t: 'leave' });
        }
        if (this.elapsed > 2 * LOAD_GIVEUP_MS) this.retryEl.hidden = false;
        return true;
    }
    return false;
  }

  private build(now: number, dt: number): void {
    let scene: Scene;
    try {
      scene = this.h.build(this.kind, this.epoch);
    } catch (e) {
      report('стройка', e);
      this.fail(true);
      return;
    }
    this.scene = scene;
    // очередь: письма — все по порядку, снимки — только последние (они полные, старые не нужны)
    const q = this.queue;
    this.queue = [];
    let skip = Math.max(0, q.filter((x) => x.buf).length - 3);
    try {
      for (const x of q) {
        if (x.m) scene.onJson(x.m);
        else if (skip > 0) skip--;
        else scene.onSnapshot(x.buf!, x.at!);
        this.fed++;
      }
    } catch (e) {
      report('очередь', e);
    }
    this.phase = 'warm';
    this.phaseAt = now;
    this.passes = 0;
    this.textures = [];
    this.texTotal = 0;
    this.status('Готовим краски…');
    this.progress(0.6, 0.3);
    this.pass(this.capture(scene, now, dt));
  }

  private warm(now: number, dt: number): void {
    const scene = this.scene!;
    // логика сцены идёт (ввод, снимки, предсказание), рисования нет
    const list = this.capture(scene, now, dt);
    // модели ещё грузятся: проходы прогрева — заново, когда появятся (новые сетки и шейдеры)
    const loading = !!scene.modelsLoading && now - this.phaseAt < LOAD_MAX_MS;
    if (loading) this.passes = 0;
    else if (this.compiled && this.passes < 2) this.pass(list);
    const t0 = performance.now();
    const gl = this.h.renderer.gl;
    while (this.textures.length && performance.now() - t0 < TEX_BUDGET_MS) {
      const t = this.textures.pop()!;
      try {
        gl.initTexture(t);
      } catch (e) {
        report('текстура', e);
      }
    }
    const texDone = this.texTotal ? 1 - this.textures.length / this.texTotal : 1;
    this.progress(0.6 + 0.3 * ((this.compiled ? 0.6 : 0.2) + 0.4 * texDone), 0.25);
    const ready = !loading && this.compiled && this.passes >= 2 && !this.textures.length;
    if (ready || (!scene.modelsLoading && now - this.phaseAt > WARM_MAX_MS) || now - this.phaseAt > LOAD_MAX_MS + WARM_MAX_MS) {
      this.phase = 'frames';
      this.rendered = 0;
      this.status('Почти готово…');
      this.progress(0.96, 0.3);
    }
  }

  /** Проход прогрева: компиляция того, что сцена рисует, и новые текстуры в очередь заливки. */
  private pass(list: Captured[]): void {
    this.passes++;
    this.compiled = false;
    const p = this.compile(list);
    this.compiling = p;
    p.then(
      () => { if (this.compiling === p) this.compiled = true; },
      (e) => { report('шейдеры', e); if (this.compiling === p) this.compiled = true; },
    );
    for (const t of this.collect(list)) {
      if (this.uploaded.has(t)) continue;
      this.uploaded.add(t);
      this.textures.push(t);
      this.texTotal++;
    }
  }

  /** Кадр сцены без рисования: gl.render только запоминает, что и чем рисуют. */
  private capture(scene: Scene, now: number, dt: number): Captured[] {
    const gl = this.h.renderer.gl;
    const list: Captured[] = [];
    const render = gl.render;
    gl.render = (s: THREE.Object3D, c: THREE.Camera): void => {
      list.push({ scene: s, camera: c, target: gl.getRenderTarget(), toneMapping: gl.toneMapping });
    };
    try {
      scene.frame(now, dt);
    } catch (e) {
      report('кадр', e);
    } finally {
      gl.render = render;
    }
    return list;
  }

  private compile(list: Captured[]): Promise<unknown> {
    const gl = this.h.renderer.gl;
    const target = gl.getRenderTarget();
    const tone = gl.toneMapping;
    const jobs: Array<Promise<unknown>> = [];
    const seen = new Set<string>();
    for (const c of list) {
      const key = `${c.scene.uuid}:${c.camera.uuid}:${c.target?.texture.uuid ?? ''}:${c.toneMapping}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        gl.setRenderTarget(c.target);
        gl.toneMapping = c.toneMapping;
        jobs.push(gl.compileAsync(c.scene, c.camera));
      } catch (e) {
        report('шейдеры', e);
      }
    }
    gl.setRenderTarget(target);
    gl.toneMapping = tone;
    return Promise.all(jobs);
  }

  private collect(list: Captured[]): THREE.Texture[] {
    const out = new Set<THREE.Texture>();
    const add = (v: unknown): void => {
      const t = v as THREE.Texture | null;
      if (t && t.isTexture && !(t as { isRenderTargetTexture?: boolean }).isRenderTargetTexture) out.add(t);
    };
    const seen = new Set<THREE.Object3D>();
    for (const c of list) {
      if (seen.has(c.scene)) continue;
      seen.add(c.scene);
      c.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (!m) return;
        for (const mat of Array.isArray(m) ? m : [m]) {
          const rec = mat as unknown as Record<string, unknown>;
          for (const k of Object.keys(rec)) add(rec[k]);
          const u = (mat as THREE.ShaderMaterial).uniforms;
          if (u) for (const k of Object.keys(u)) add(u[k]?.value);
        }
      });
    }
    return [...out];
  }

  private reveal(now: number): void {
    this.h.send({ t: 'ready', e: this.epoch });
    this.phase = 'in';
    this.phaseAt = now;
    this.scene = null;
    this.compiling = null;
    this.progress(1, 0.2);
    this.root.classList.remove('on');
    this.h.blockedChanged();
    this.syncWait();
  }

  /** Не вышло: сообщение, сервер — вернуть на набережную (а если не вышла сама набережная — обновить страницу). */
  private fail(build: boolean): void {
    this.phase = 'fail';
    this.scene = null;
    this.compiling = null;
    this.root.classList.add('on', 'failed');
    const name = MODE_CARDS[this.kind].title;
    if (this.kind === 'lobby') {
      this.status('Не получилось открыть набережную. Обнови страницу — прогресс сохранён.');
      this.retryEl.hidden = false;
    } else {
      this.status(build ? `Не получилось построить «${name}» — возвращаемся на набережную…` : `«${name}» не загрузился за 15 секунд — возвращаемся на набережную…`);
      this.failRetryAt = Math.max(this.elapsed, FAIL_FIRST_MS);
    }
    this.h.freePointer();
    this.h.blockedChanged();
  }

  // ------------------------------------------------------------ экран

  private fill(kind: RoomKind): void {
    const card = MODE_CARDS[kind];
    this.titleEl.textContent = card.title;
    this.subEl.textContent = this.h.detail(kind) ?? card.sub;
    this.root.dataset.kind = kind;
    this.root.style.setProperty('--tint', card.tint);
    this.root.style.setProperty('--focus', card.focus);
    this.hud.style.setProperty('--tint', card.tint);
    // картина: та же — уже на месте; новая — проявится, когда придёт (обычно она уже в кэше, см. preloadArt)
    if (this.picEl.getAttribute('src') !== card.art) {
      this.artEl.classList.remove('ready');
      if (card.art) this.picEl.src = card.art;
      else this.picEl.removeAttribute('src');
    }
    if (card.jelly) this.jellyEl.src = card.jelly;
    else this.jellyEl.removeAttribute('src');
    this.tipsEl.replaceChildren(...nextTips(kind).map((t) => {
      const p = document.createElement('p');
      p.textContent = t;
      return p;
    }));
    // бесконечные анимации экрана идут, пока он виден (снимаются, когда растает)
    this.root.classList.add('play');
  }

  private status(text: string): void {
    this.statusEl.textContent = text;
  }

  /** Полоса: transform с переходом — её дотягивает compositor, даже если кадр стоит. Сдвиг, а не растяжение: полоски заливки не мнутся. */
  private progress(p: number, seconds: number): void {
    this.barEl.style.transitionDuration = `${seconds}s`;
    this.barEl.style.transform = `translateX(${((Math.max(0.04, Math.min(1, p)) - 1) * 100).toFixed(1)}%)`;
  }

  private renderWho(): void {
    const me = this.h.nick();
    const others = this.who.filter((w) => w.nick !== me);
    this.whoEl.replaceChildren();
    if (!others.length) return;
    el('span', 'tr-who-label', this.whoEl).textContent = 'Заходят вместе:';
    for (const w of [...this.who].sort((a, b) => Number(b.nick === me) - Number(a.nick === me))) {
      const chip = el('span', `tr-chip${w.ok ? ' ok' : ''}`, this.whoEl);
      chip.textContent = w.nick === me ? 'ты' : w.nick;
    }
  }

  /** Плашка над миром: кого ждём (после проявления) или кого не дождались. */
  private syncWait(): void {
    const me = this.h.nick();
    const late = this.who.filter((w) => !w.ok && w.nick !== me).map((w) => w.nick);
    let text = '';
    let left = '';
    if (!this.busy && this.waiting > 0 && late.length) {
      text = `Ждём ${names(late)}`;
      left = `до ${this.waiting} с`;
    } else if (!this.busy && this.missedUntil && late.length) text = `Не дождались: ${names(late)} — начинаем`;
    const key = `${text}|${left}`;
    if (this.waitKey !== key) {
      this.waitKey = key;
      this.waitTextEl.textContent = text;
      this.waitLeftEl.textContent = left;
      this.waitEl.classList.toggle('missed', text !== '' && !left);
    }
    this.waitEl.classList.toggle('show', text !== '');
  }

  private tickCount(now: number): void {
    if (this.goHideAt && now > this.goHideAt) {
      this.goHideAt = 0;
      this.hideCount();
    }
    if (!this.goAt) return;
    const left = this.goAt - now;
    if (left > 0) {
      const n = Math.ceil(left / 1000);
      if (n <= 3 && n !== this.goShown) {
        this.goShown = n;
        this.showCount(String(n), false);
        this.h.sound.countBeep(false);
      }
      return;
    }
    this.goAt = 0;
    this.showCount(this.goWord, true);
    this.h.sound.countBeep(true);
    this.goHideAt = now + 1100;
  }

  private showCount(text: string, go: boolean): void {
    this.countNumEl.textContent = text;
    this.countEl.dataset.n = go ? 'go' : text;
    this.countEl.className = 'tr-count';
    void this.countEl.offsetWidth;
    this.countEl.className = `tr-count show${go ? ' go' : ''}`;
  }

  private hideCount(): void {
    this.goShown = -1;
    this.goHideAt = 0;
    this.countEl.className = 'tr-count';
  }

  /** Для window.__opus: где сейчас переход */
  debugState(): Record<string, unknown> {
    return { phase: this.phase, kind: this.kind, fed: this.fed, passes: this.passes, compiled: this.compiled, textures: this.textures.length, texTotal: this.texTotal, elapsed: Math.round(this.elapsed), who: this.who, waiting: this.waiting, go: this.goAt > 0 };
  }
}

function names(list: string[]): string {
  return list.length <= 2 ? list.join(' и ') : `${list.slice(0, 2).join(', ')} и ещё ${list.length - 2}`;
}
