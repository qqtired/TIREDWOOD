// Сцена «Подземелье» (соло, флаг DUNGEON на сервере): модели, карта-тор и интерфейс строятся при первом спуске и
// остаются в памяти; забег (DungeonGame.start) — заново на каждый `dg_hello`. Мышь не захватываем: курсор нужен для
// карточек, паузы и итогов, движение — WASD/стрелки, Пробел — рывок, Q — удар, E — постройка, Enter — в бой.
// Подключение (делает сервер-помощник в client/app.ts): ленивый import этого файла, `new DungeonScene(deps)`,
// сообщения `dg_*` приходят в onJson (или напрямую в onDg).
import * as THREE from 'three';
import type { DgClientMsg, DgServerMsg } from '../../shared/dungeon/api.ts';
import type { ClientMsg, ServerMsg } from '../../shared/messages.ts';
import type { Scene, SceneDeps } from '../scene.ts';
import type { Quality } from '../settings.ts';
import { TOUCH, type TouchMode } from '../touch.ts';
import { loadDungeonAssets } from './assets.ts';
import { DungeonGame, type WorldLike } from './game.ts';
import { DungeonHud } from './hud.ts';
import { DungeonSfx } from './sfx.ts';
import { SimRun } from './simview.ts';
import type { RunSource } from './source.ts';
import { makeWorld } from './worldlink.ts';

export interface DungeonSceneOptions {
  /** забег по зерну (по умолчанию — настоящая симуляция, стенд может дать заглушку) */
  makeRun?: (seed: number) => RunSource;
  /** «На набережную» (по умолчанию — сообщение `leave` серверу) */
  leave?: () => void;
}

export class DungeonScene implements Scene {
  readonly kind = 'dungeon' as const;
  readonly wantsPointer = false;
  private readonly d: SceneDeps;
  private readonly o: DungeonSceneOptions;
  readonly hud: DungeonHud;
  private readonly sfx: DungeonSfx;
  game: DungeonGame | null = null;
  private loading: Promise<void> | null = null;
  private pendingSeed: number | null = null;
  private entered = false;
  /** паузу поставила оболочка (её меню), а не Esc в забеге */
  private shellPaused = false;
  private readonly blank = new THREE.Scene();
  private readonly blankCam = new THREE.PerspectiveCamera();
  private w = window.innerWidth;
  private h = window.innerHeight;
  private readonly onVis = (): void => {
    if (document.hidden) this.game?.setPaused(true);
  };
  private readonly onBlur = (): void => {
    this.game?.setPaused(true);
  };

  constructor(d: SceneDeps, o: DungeonSceneOptions = {}) {
    this.d = d;
    this.o = o;
    this.blank.background = new THREE.Color(0x120d0b);
    this.sfx = new DungeonSfx(d.sound);
    this.hud = new DungeonHud(d.hudRoot, {
      pick: (i) => this.game?.cardAction(i),
      reroll: () => this.game?.reroll(),
      ban: (i) => this.game?.ban(i),
      go: () => this.game?.go(),
      chestDone: () => this.game?.chestDone(),
      pause: () => this.game?.setPaused(true),
      resume: () => {
        d.sound.unlock();
        this.game?.setPaused(false);
      },
      quit: () => this.game?.quit(),
      again: () => this.game?.again(),
      toLobby: () => this.leave(),
    });
    this.hud.setVisible(false);
  }

  /** Телефон: джойстик и кнопки как на набережной (Пробел — рывок, E — постройка); в окнах — только верхние кнопки */
  get touchMode(): TouchMode {
    const g = this.game;
    if (!g?.active || g.isPaused) return 'none';
    return 'walk';
  }

  readonly touchUseIcon = 'E';

  /** Качество графики оболочки: карта и враги и так в бюджете — пока ничего не меняем */
  setQuality(_q: Exclude<Quality, 'auto'>): void {}

  /** Оболочка открыла своё меню (настройки голоса, обрыв мыши) — забег на паузу без своего окна; закрыла — дальше */
  setPaused(on: boolean): void {
    const g = this.game;
    if (!g) return;
    if (on && !g.isPaused) {
      this.shellPaused = true;
      g.setPaused(true, false);
    } else if (!on && this.shellPaused) {
      this.shellPaused = false;
      g.setPaused(false);
    }
  }

  enter(): void {
    this.entered = true;
    this.hud.setVisible(true);
    this.d.ui.chat.setPlaceholder('Сообщение');
    this.d.sound.setOutdoor(0);
    document.addEventListener('visibilitychange', this.onVis);
    window.addEventListener('blur', this.onBlur);
    if (!this.game) this.load();
    else if (this.pendingSeed !== null) this.startPending();
  }

  exit(): void {
    this.entered = false;
    this.game?.stop();
    this.hud.setVisible(false);
    this.hud.results(null);
    this.hud.pause(false, 0);
    this.hud.cards(null);
    this.hud.chest(null);
    this.sfx.stopAll();
    this.d.sound.setOutdoor(1);
    document.removeEventListener('visibilitychange', this.onVis);
    window.removeEventListener('blur', this.onBlur);
  }

  private load(): void {
    if (this.loading) return;
    this.hud.loading(0);
    this.loading = (async () => {
      const assets = await loadDungeonAssets((p) => this.hud.loading(p * 0.7));
      const world: WorldLike | null = await makeWorld(assets, (p) => this.hud.loading(0.7 + p * 0.25));
      const game = new DungeonGame({
        renderer: this.d.renderer,
        input: this.d.input,
        sfx: this.sfx,
        hud: this.hud,
        send: (m: DgClientMsg) => this.d.net.send(m as unknown as ClientMsg),
        leave: () => this.leave(),
        makeRun: this.o.makeRun ?? defaultRun,
      }, assets, world);
      game.resize(this.w, this.h);
      await game.warm();
      this.game = game;
      this.hud.loading(null);
      if (this.entered && this.pendingSeed !== null) this.startPending();
    })().catch((e: unknown) => {
      this.loading = null;
      console.error('dungeon: не загрузилось', e);
      this.hud.loading(null);
      this.hud.banner('Не загрузилось', 'Выйди и зайди снова', 'warn');
    });
  }

  private startPending(): void {
    if (!this.game || this.pendingSeed === null) return;
    const seed = this.pendingSeed;
    this.pendingSeed = null;
    this.game.start(seed);
  }

  private leave(): void {
    if (this.o.leave) this.o.leave();
    else this.d.net.send({ t: 'leave' });
  }

  onJson(msg: ServerMsg): void {
    const t = (msg as { t: string }).t;
    if (typeof t === 'string' && t.startsWith('dg_')) this.onDg(msg as unknown as DgServerMsg);
  }

  /** Сообщения режима от сервера */
  onDg(m: DgServerMsg): void {
    if (m.t === 'dg_hello') {
      this.pendingSeed = m.seed;
      if (this.game && this.entered) this.startPending();
      return;
    }
    this.game?.onServer(m);
  }

  onSnapshot(): void {}

  frame(now: number, dt: number): void {
    // мышь в забеге свободна (карточки, окна): захват с набережной отпускаем (на телефоне «захват» — это пальцы, не трогаем)
    if (!TOUCH && this.d.input.locked) this.d.input.unlock();
    if (this.game) {
      this.game.frame(now, dt);
      return;
    }
    this.d.renderer.render(this.blank, this.blankCam, 1);
  }

  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    if (down) this.d.sound.unlock();
    return this.game?.onKey(code, down, e) ?? false;
  }

  /** Кнопка E на телефоне (на компьютере E ловит onKey) */
  onUse(mouse: boolean): void {
    if (TOUCH && !mouse) this.game?.use();
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.game?.resize(w, h);
  }

  debugState(): Record<string, unknown> | null {
    return this.game?.debugState() ?? null;
  }
}

/** Забег по умолчанию — настоящая симуляция (та же, что у сервера) */
function defaultRun(seed: number): RunSource {
  return new SimRun(seed);
}

export { TOUCH };
