// Сцена гонки: трасса «Портовое кольцо» строится при первом заезде и остаётся в памяти,
// заезд (карты, предсказание, интерфейс гонки) создаётся заново на каждый вход.
import { DEFAULT_TRACK, type RaceTrackId } from '../../shared/racecourse.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import { lobbyQuality } from '../lobby/scene.ts';
import type { Scene, SceneDeps } from '../scene.ts';
import type { Quality } from '../settings.ts';
import type { TouchMode } from '../touch.ts';
import { RaceHud } from './hud.ts';
import { KartFx } from './kart3d.ts';
import { RaceMatch } from './match.ts';
import { RaceWorld } from './world.ts';

export class RaceScene implements Scene {
  readonly kind = 'race' as const;
  /** Под итогами мышь свободна: кнопки окна нажимаются (как в крепости) */
  get wantsPointer(): boolean {
    return !this.hud.resultsShown;
  }
  private readonly d: SceneDeps;
  readonly world: RaceWorld;
  private readonly fx: KartFx;
  private readonly hud: RaceHud;
  private match: RaceMatch | null = null;

  readonly trackId: RaceTrackId;

  constructor(d: SceneDeps, trackId: RaceTrackId = DEFAULT_TRACK) {
    this.d = d;
    this.trackId = trackId;
    this.world = new RaceWorld(d.renderer, lobbyQuality(d.settings.quality), trackId);
    this.fx = new KartFx(this.world.scene);
    const root = document.createElement('div');
    root.className = 'hud hidden';
    d.hudRoot.appendChild(root);
    this.hud = new RaceHud(root, this.world.track, { ui: d.ui, shell: d.hudRoot });
    // телефон: нажали на значок бонуса — короткое E, как с клавиатуры
    this.hud.onTap = (code) => {
      d.input.tap(code, true);
      d.input.tap(code, false);
    };
    // итоги: мышь отпускаем — «На набережную» нажимается; клик — жест игрока: мышь сразу снова в игре
    this.hud.onResults = () => d.input.unlock();
    this.hud.onLeave = () => {
      void d.input.lock();
      d.net.send({ t: 'leave' });
    };
  }

  /** Телефон: под итогами руль и газ не нужны — только верхние кнопки */
  get touchMode(): TouchMode {
    return this.hud.resultsShown ? 'none' : 'kart';
  }

  setQuality(q: Quality, slow = false): void {
    this.world.setQuality(lobbyQuality(q, slow));
  }

  enter(): void {
    this.match?.dispose();
    this.fx.clear();
    const { d } = this;
    this.match = new RaceMatch({
      world: this.world,
      fx: this.fx,
      hud: this.hud,
      chat: d.ui.chat,
      toasts: d.ui.toasts,
      sound: d.sound,
      input: d.input,
      settings: d.settings,
      net: d.net,
    });
    this.hud.setVisible(true);
    d.ui.chat.setPlaceholder('Сообщение');
  }

  exit(): void {
    // ушли по таймеру итогов (мышь была свободна): просим её обратно (отпускали сами — браузер вернёт без клика),
    // не вышло — на набережной вуаль «Кликни, чтобы играть», а не меню
    if (this.hud.resultsShown && !this.d.input.locked) {
      this.d.quietPause?.();
      this.d.wantPointer();
    }
    this.match?.dispose();
    this.match = null;
    this.hud.setVisible(false);
  }

  onJson(msg: ServerMsg): void {
    this.match?.onJson(msg);
  }

  onSnapshot(buf: ArrayBuffer, at: number): void {
    this.match?.onSnapshot(buf, at);
  }

  frame(now: number, dt: number): void {
    if (this.match) this.match.frame(now, dt);
    else this.world.render();
  }

  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    // итоги: Esc — «На набережную» (мышью — кнопка окна)
    if (this.hud.resultsShown && code === 'Escape' && !this.d.ui.chat.isOpen) {
      e.preventDefault();
      if (down && !e.repeat) {
        this.d.quietPause?.();
        this.d.net.send({ t: 'leave' });
      }
      return true;
    }
    return this.match?.onKey(code, down, e) ?? false;
  }

  /** E и ЛКМ — бонус: уходят серверу кнопками ввода, отдельно делать нечего. */
  onUse(): void {}

  resize(w: number, h: number): void {
    this.world.resize(w, h);
  }

  debugState(): Record<string, unknown> | null {
    return this.match?.debugState() ?? null;
  }
}
