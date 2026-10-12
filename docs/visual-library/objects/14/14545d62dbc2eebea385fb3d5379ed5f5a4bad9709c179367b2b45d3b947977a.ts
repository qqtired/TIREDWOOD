// Сцена «Fight Club»: подвал (стены, свет, толпа), цвет и зерно, интерфейс и звуки строятся при первом спуске
// и остаются в памяти; бой (предсказание, желейки, камера) — заново на каждый вход. Без флага FIGHT на сервере
// сюда никого не переводят — сцена не создаётся вовсе.
import type { ServerMsg } from '../../shared/messages.ts';
import { Effects } from '../render/effects.ts';
import type { Scene, SceneDeps } from '../scene.ts';
import type { Quality } from '../settings.ts';
import { TOUCH, type TouchMode } from '../touch.ts';
import { FightArena } from './arena.ts';
import { Grade } from './grade.ts';
import { FightHud } from './hud.ts';
import { FightMatch } from './match.ts';
import { FightSfx } from './sfx.ts';
import { fightVisualBudget } from './quality.ts';

export class FightScene implements Scene {
  readonly kind = 'fight' as const;
  readonly wantsPointer = true;
  private readonly d: SceneDeps;
  private readonly arena: FightArena;
  private readonly grade: Grade;
  private readonly hud: FightHud;
  private readonly sfx: FightSfx;
  private readonly effects: Effects;
  private match: FightMatch | null = null;

  constructor(d: SceneDeps) {
    this.d = d;
    this.arena = new FightArena();
    this.grade = new Grade(d.renderer.gl, 0);
    this.hud = new FightHud(d.hudRoot);
    this.sfx = new FightSfx(d.sound);
    this.effects = new Effects(this.arena.scene, this.arena.world);
    this.setQuality(d.settings.quality);
  }

  /** Только графические бюджеты: качество не меняет ввод, тики и правила ударов. */
  setQuality(q: Quality, slow = false): void {
    const budget = fightVisualBudget(q, slow, TOUCH, this.d.renderer.gl.capabilities.maxSamples);
    this.grade.setQuality(budget);
    this.arena.setQuality(budget);
  }

  /** Телефон: бойцу — стик и кнопки боя, зрителю и в итогах — только обзор пальцем и верхние кнопки. */
  get touchMode(): TouchMode {
    if (!this.match || this.match.resultsUp) return 'none';
    return this.match.spectator ? 'none' : 'fight';
  }

  enter(): void {
    this.match?.dispose();
    const { d } = this;
    this.effects.clearSplats();
    this.match = new FightMatch({
      arena: this.arena, hud: this.hud, grade: this.grade, sfx: this.sfx, effects: this.effects, sound: d.sound, input: d.input,
      settings: d.settings, net: d.net, chat: d.ui.chat, renderer: d.renderer.gl, me: d.ui.me,
    });
    this.hud.setVisible(true);
    d.ui.chat.setPlaceholder('Сообщение');
    // внизу прибоя не слышно; фон подвала включится, как только разрешён звук
    d.sound.setOutdoor(0);
    this.sfx.start();
  }

  exit(): void {
    this.match?.dispose();
    this.match = null;
    this.hud.setVisible(false);
    this.sfx.stop();
    this.d.sound.setOutdoor(1);
  }

  onJson(msg: ServerMsg): void {
    this.match?.onJson(msg);
  }

  onSnapshot(buf: ArrayBuffer, at: number): void {
    this.match?.onSnapshot(buf, at);
  }

  frame(now: number, dt: number): void {
    if (this.match) this.match.frame(now, dt);
    else this.grade.render(this.d.renderer.gl, this.arena.scene, this.arena.camera, now / 1000);
  }

  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    return this.match?.onKey(code, down, e) ?? false;
  }

  /** ЛКМ и E — удар и захват: уходят серверу кнопками ввода. */
  onUse(): void {}

  resize(w: number, h: number): void {
    this.arena.resize(w, h);
  }

  debugState(): Record<string, unknown> | null {
    return this.match?.debugState() ?? null;
  }
}
