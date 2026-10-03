// Сцена «Крепости»: мир «Старой крепости» строится при первом входе и остаётся в памяти (как склад пейнтбола),
// игра на клиенте (предсказание, орда, интерфейс) создаётся заново на каждый вход.
import { buildFort } from '../../shared/fortmap.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import { CollisionWorld } from '../../shared/world.ts';
import { Effects } from '../render/effects.ts';
import type { Scene, SceneDeps } from '../scene.ts';
import type { TouchMode } from '../touch.ts';
import type { Quality } from '../settings.ts';
import { FortHud } from './hud.ts';
import { FortMatch } from './match.ts';
import { FortWorld } from './world.ts';
import { Zombies3D } from './zombies3d.ts';
import { Projectiles } from './projectiles.ts';
import { EventMarks } from './marks.ts';
import { EventFx } from './eventfx.ts';

export class FortScene implements Scene {
  readonly kind = 'fort' as const;
  /**
   * Мышь нужна всегда, кроме открытой панели арсенала (лавка, ворота, кристалл, башня) и «свободного курсора» после Esc
   * у неё: Esc закрывает только панель, меню игры не встаёт; клик или любая клавиша возвращают мышь в игру.
   */
  get wantsPointer(): boolean { return !(this.hud.shopShown || this.match?.cursorFree); }
  private readonly d: SceneDeps;
  readonly map = buildFort();
  readonly collision: CollisionWorld;
  readonly world: FortWorld;
  private readonly effects: Effects;
  private readonly zombies: Zombies3D;
  private readonly projectiles: Projectiles;
  private readonly marks: EventMarks;
  /** Эффекты событий волны (fort-fx): метеор, ящик на парашюте, морской туман, золотая лихорадка */
  private readonly eventFx: EventFx;
  private readonly hud: FortHud;
  private match: FortMatch | null = null;

  constructor(d: SceneDeps) {
    this.d = d;
    this.collision = new CollisionWorld(this.map);
    this.world = new FortWorld(d.renderer, this.map);
    this.effects = new Effects(this.world.scene, this.collision);
    this.zombies = new Zombies3D(this.world.scene, this.collision);
    this.projectiles = new Projectiles(this.world.scene);
    this.marks = new EventMarks(this.world.scene);
    this.eventFx = new EventFx(this.world.scene, this.world.camera, this.collision);
    // простой ящик marks.ts больше не нужен: ящик рисует EventFx; маяк и круги остаются у marks
    this.marks.placeholder = false;
    const root = document.createElement('div');
    root.className = 'hud hidden';
    d.hudRoot.appendChild(root);
    this.hud = new FortHud(root);
  }

  /** Телефон: под итогами и у открытой панели (она снизу, на месте кнопок) стрелять незачем — только верхние кнопки */
  get touchMode(): TouchMode {
    return this.hud.endShown || this.hud.shopShown ? 'none' : 'shoot';
  }

  enter(): void {
    this.match?.dispose();
    const { d } = this;
    this.match = new FortMatch({
      map: this.map,
      collision: this.collision,
      world: this.world,
      effects: this.effects,
      zombies: this.zombies,
      projectiles: this.projectiles,
      marks: this.marks,
      eventFx: this.eventFx,
      hud: this.hud,
      chat: d.ui.chat,
      sound: d.sound,
      input: d.input,
      settings: d.settings,
      net: d.net,
      me: d.ui.me,
    });
    this.hud.setVisible(true);
    d.ui.chat.setPlaceholder('Сообщение или /help');
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
    else this.world.renderScene();
  }

  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    return this.match?.onKey(code, down, e) ?? false;
  }

  onUse(mouse: boolean): void {
    this.match?.onUse(mouse);
  }

  resize(w: number, h: number): void {
    this.world.resize(w, h);
  }

  setQuality(q: Quality, slow = false): void {
    this.world.setQuality(q, slow);
    this.zombies.setQuality(q, slow);
    this.eventFx.setQuality(q, slow);
  }

  debugState(): Record<string, unknown> | null {
    return this.match?.debugState() ?? null;
  }
}
