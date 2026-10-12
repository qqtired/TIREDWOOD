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

export class PaintballScene implements Scene {
  readonly kind = 'paintball' as const;
  readonly wantsPointer = true;
  private readonly d: SceneDeps;
  readonly map = buildPier();
  readonly collision: CollisionWorld;
  readonly world: World;
  private readonly effects: Effects;
  private readonly tracers: Tracers;
  private readonly hud: Hud;
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
    this.slot = new SlotMachine(root, d.sound);
  }

  /** Телефон: под итогами раунда стрелять и бегать незачем — только верхние кнопки */
  get touchMode(): TouchMode {
    return this.hud.endShown ? 'none' : 'shoot';
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
