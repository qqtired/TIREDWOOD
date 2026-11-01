// Т-27 «Замедленный миг»: смерть босса или чемпиона — сервер на 1,5 с замедляет орду, её снаряды, кракена и осаду. Событие
// ['slow', endTick] видят все. Здесь только вид: анимации мобов идут медленнее (zombies.setTimeScale), звук мира глуше и
// тише (sound.slowMo), мягкая виньетка по краям (без размытия) и камера чуть приближается (+3° поля зрения). Своё
// управление, оружие и башни не замедляются. Вход и выход плавные, 0,15 с.
import { TICK_RATE } from '../../../shared/constants.ts';
import { el } from '../ui/dom.ts';
import type { IdeasDeps } from './deps.ts';
import { slowAmount, slowTimeScale } from './logic.ts';

/** На сколько градусов приближается камера в полную силу */
const FOV_NARROW = 3;

export class SlowPart {
  private readonly d: IdeasDeps;
  private readonly vig: HTMLElement;
  private endTick = 0;
  private startMs = 0;
  private k = 0;
  private shownK = -1;
  private soundK = -1;

  constructor(d: IdeasDeps) {
    this.d = d;
    this.vig = el('div', 'ft-slow-vig', d.hud.root);
    this.vig.setAttribute('aria-hidden', 'true');
  }

  /** ['slow', endTick] */
  onEvent(e: readonly unknown[]): boolean {
    if (e[0] !== 'slow') return false;
    const end = e[1] as number;
    if (!Number.isFinite(end) || end <= this.d.tick()) return true;
    this.endTick = end;
    this.startMs = performance.now();
    return true;
  }

  /** Поле зрения камеры: на сколько градусов уже обычного (плавно) */
  get fovNarrow(): number {
    return -FOV_NARROW * this.k;
  }

  frame(): void {
    const left = this.endTick > 0 ? (this.endTick - this.d.tick()) / TICK_RATE : 0;
    const spent = (performance.now() - this.startMs) / 1000;
    this.k = left > 0 ? slowAmount(left, spent) : 0;
    if (this.endTick > 0 && left <= 0) this.endTick = 0;
    const k = Math.round(this.k * 50) / 50;
    if (k !== this.shownK) {
      this.shownK = k;
      this.vig.style.opacity = String(k);
      this.d.zombies.setTimeScale(slowTimeScale(k));
    }
    if (Math.abs(k - this.soundK) >= 0.04 || (k === 0 && this.soundK !== 0)) {
      this.soundK = k;
      this.d.sound.slowMo(k);
    }
  }

  dispose(): void {
    this.endTick = 0;
    this.k = 0;
    this.d.zombies.setTimeScale(1);
    this.d.sound.slowMo(0);
    this.vig.remove();
  }
}
