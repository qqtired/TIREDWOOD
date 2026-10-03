// Сцена гонки: трасса «Портовое кольцо» строится при первом заезде и остаётся в памяти,
// заезд (карты, предсказание, интерфейс гонки) создаётся заново на каждый вход.
import type { RaceTrackId } from '../../shared/racecourse.ts';
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
  readonly wantsPointer = true;
  private readonly d: SceneDeps;
  readonly world: RaceWorld;
  private readonly fx: KartFx;
  private readonly hud: RaceHud;
  private match: RaceMatch | null = null;

  readonly trackId: RaceTrackId;

  constructor(d: SceneDeps, trackId: RaceTrackId = 'port') {
    this.d = d;
    this.trackId = trackId;
    this.world = new RaceWorld(d.renderer, lobbyQuality(d.settings.quality), trackId);
    this.fx = new KartFx(this.world.scene);
    const root = document.createElement('div');
    root.className = 'hud hidden';
    d.hudRoot.appendChild(root);
    this.hud = new RaceHud(root, this.world.track);
    // телефон: нажали на значок бонуса — короткое E, как с клавиатуры
    this.hud.onTap = (code) => {
      d.input.tap(code, true);
      d.input.tap(code, false);
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
