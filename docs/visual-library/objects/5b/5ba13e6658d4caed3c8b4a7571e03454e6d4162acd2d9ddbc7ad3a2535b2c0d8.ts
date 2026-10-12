// Сцена пейнтбола: мир «Причал» строится при первом входе на склад и остаётся в памяти,
// матч (игроки, предсказание, интерфейс боя) создаётся заново на каждый вход.
import { buildPier } from '../../shared/maps/pier.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import { CollisionWorld } from '../../shared/world.ts';
import { Effects } from '../render/effects.ts';
import { World } from '../render/world.ts';
import type { Scene, SceneDeps } from '../scene.ts';
import type { Quality } from '../settings.ts';
import type { TouchMode } from '../touch.ts';
import { Hud } from './hud.ts';
import { Match } from './match.ts';
import { SlotMachine } from './slot.ts';
import { Tracers } from './tracers.ts';
import { PaintballUi } from './ui.ts';

export class PaintballScene implements Scene {
  readonly kind = 'paintball' as const;
  /** В итогах раунда мышь свободна — кнопки окна нажимаются (как в крепости) */
  get wantsPointer(): boolean {
    return !this.ui.endShown;
  }
  private readonly d: SceneDeps;
  readonly map = buildPier();
  readonly collision: CollisionWorld;
  readonly world: World;
  private readonly effects: Effects;
  private readonly tracers: Tracers;
  private readonly hud: Hud;
  /** Интерфейс на ките 2.0 поверх Hud (ui.ts) */
  private readonly ui: PaintballUi;
  private readonly slot: SlotMachine;
  private match: Match | null = null;

  constructor(d: SceneDeps) {
    this.d = d;
    this.collision = new CollisionWorld(this.map);
    this.world = new World(d.renderer, this.map);
    this.effects = new Effects(this.world.scene, this.collision);
    this.tracers = new Tracers(this.world.scene);
    const root = document.createElement('div');
    root.className = 'hud hidden';
    d.hudRoot.appendChild(root);
    this.hud = new Hud(root);
    this.ui = new PaintballUi(this.hud, root, {
      slots: d.ui.slots, top: d.ui.top, hudRoot: d.hudRoot,
      // клик — жест игрока: мышь сразу в игру, на набережной не встанет меню
      leave: () => { void d.input.lock(); d.net.send({ t: 'leave' }); },
      freeMouse: () => d.input.unlock(),
      // итоги закрылись (новый раунд): захват вне жеста не удастся — тогда вуаль «Кликни, чтобы играть», а не меню
      wantMouse: () => { d.quietPause?.(); d.wantPointer(); },
    });
    this.slot = new SlotMachine(root, d.sound);
  }

  /** Телефон: под итогами раунда стрелять и бегать незачем — только верхние кнопки */
  get touchMode(): TouchMode {
    return this.ui.endShown ? 'none' : 'shoot';
  }

  setQuality(q: Quality): void {
    this.world.setQuality(q === 'auto' ? 'medium' : q);
  }

  enter(): void {
    this.match?.dispose();
    const { d } = this;
    this.match = new Match({
      map: this.map,
      collision: this.collision,
      world: this.world,
      effects: this.effects,
      tracers: this.tracers,
      hud: this.hud,
      chat: d.ui.chat,
      slot: this.slot,
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
    // свои плашка, тосты и окна — прочь до dispose: иначе закрытие итогов попросило бы мышь обратно уже на выходе
    this.ui.reset();
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
    // итоги раунда: Esc — «На набережную» (мышью — кнопка окна)
    if (this.ui.endShown && code === 'Escape' && !this.d.ui.chat.isOpen) {
      e.preventDefault();
      if (down && !e.repeat) {
        this.d.quietPause?.();
        this.d.net.send({ t: 'leave' });
      }
      return true;
    }
    return this.match?.onKey(code, down, e) ?? false;
  }

  onUse(): void {
    this.match?.onUse();
  }

  resize(w: number, h: number): void {
    this.world.resize(w, h);
  }

  debugState(): Record<string, unknown> | null {
    return this.match?.debugState() ?? null;
  }
}
