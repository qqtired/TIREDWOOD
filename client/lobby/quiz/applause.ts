// «Ракушка» 1.1, E1: аплодисменты. На «Угадал», «Верно», «Все угадали» и титул (cues.ts, по переходу снимка — у всех
// одинаково) сидящие в креслах желейки подпрыгивают и хлопают над головой; «Браво!» (B у сидящего → view.bravo) — желейка
// этого места хлопает над головой (так видно и из задних рядов, и со сцены). Руки — через avatar.hands (варежки ставит
// сцена, как удочку в рыбалке), прыжок — сдвиг корня после кадра желейки (позу каждый кадр ставит сеть, сдвиг не копится).
// Звук — тихие хлопки на шине звуков «Ракушки» (ui/hud-sound.ts: общий выключатель и громкость).
import { QZ, type QzView } from '../../../shared/quiz/types.ts';
import type { Avatar } from '../../render/avatar.ts';
import type { QuizSounds } from './ui/hud-sound.ts';

/** Сколько хлопает: «Браво!» и зал */
const BRAVO_S = 1.3;
const CHEER_S = 1.8;
/** Хлопков в секунду (сведение рук), прыжок зала: высота, длина одного, сколько */
const CLAP_HZ = 4.4;
/** Высота хлопка: над макушкой (как руки вверх в танце, render/avatar.ts) */
const CLAP_Y = 1.48;
const HOP_H = 0.16;
const HOP_S = 0.42;
const HOPS = 2;

/** hand — свои варежки желейки [x, y, z] × 2 (у каждой свой массив: avatar.hands читает его на следующем кадре) */
interface Clap { t: number; dur: number; hop: boolean; delay: number; hand: number[] }

const smooth = (k: number): number => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

export class QuizApplause {
  private readonly avatarOf: (slot: number) => Avatar | null;
  private readonly sounds: QuizSounds | null;
  private readonly acts = new Map<number, Clap>();
  /** Чьи варежки сейчас держим (вернуть null по концу): slot → массив, который отдали желейке */
  private readonly held = new Map<number, number[]>();
  /** Уже показанные «Браво!»: slot|at → когда забыть (мс) */
  private readonly seen = new Map<string, number>();
  constructor(avatarOf: (slot: number) => Avatar | null, sounds: QuizSounds | null) {
    this.avatarOf = avatarOf;
    this.sounds = sounds;
  }

  /** Зал хлопает: все сидящие в креслах (свою желейку в кресле не видно — камера за спинкой; звук слышно) */
  cheer(v: QzView | null): void {
    if (!v) return;
    let n = 0;
    for (const p of v.people) {
      if (p.chair < 0) continue;
      // вразнобой, но у всех одинаково: задержка по номеру
      this.acts.set(p.slot, { t: 0, dur: CHEER_S, hop: true, delay: ((p.slot * 37) % 7) * 0.045, hand: this.held.get(p.slot) ?? [0, 0, 0, 0, 0, 0] });
      n++;
    }
    if (n) this.sounds?.clap(true);
  }

  /** Свежие «Браво!» из снимка: новые — желейка хлопает, тихий хлопок */
  bravo(list: QzView['bravo'], serverNow: number): void {
    for (const [k, until] of this.seen) if (until < serverNow) this.seen.delete(k);
    for (const b of list ?? []) {
      const key = `${b.slot}|${b.at}`;
      if (this.seen.has(key)) continue;
      this.seen.set(key, b.at + QZ.BRAVO_SHOW_MS + 1000);
      // старый (вошёл позже) — не хлопаем задним числом
      if (serverNow - b.at > 1500) continue;
      const cur = this.acts.get(b.slot);
      if (!cur || cur.t > cur.dur * 0.6) this.acts.set(b.slot, { t: 0, dur: BRAVO_S, hop: false, delay: 0, hand: this.held.get(b.slot) ?? [0, 0, 0, 0, 0, 0] });
      this.sounds?.clap(false);
    }
  }

  /** После кадра желеек (scene.ts: quiz.frame идёт после update желеек): варежки на следующий кадр и прыжок сейчас */
  update(dt: number): void {
    for (const [slot, a] of this.acts) {
      a.t += dt;
      const av = this.avatarOf(slot);
      const t = a.t - a.delay;
      if (!av || a.t >= a.dur + a.delay) {
        this.release(slot, av);
        this.acts.delete(slot);
        continue;
      }
      if (t < 0) continue;
      // руки: поднимаются над головой за 0,15 с, хлопают, опускаются за 0,2 с
      const k = smooth(Math.min(t / 0.15, (a.dur - t) / 0.2));
      const open = 0.5 + 0.5 * Math.cos(t * CLAP_HZ * Math.PI * 2);
      const x = 0.07 + 0.22 * open, y = CLAP_Y + 0.04 * open, z = -0.16;
      const h = a.hand;
      h[0] = -(0.45 + (x - 0.45) * k); h[1] = 0.62 + (y - 0.62) * k; h[2] = -0.1 + (z + 0.1) * k;
      h[3] = -h[0]; h[4] = h[1]; h[5] = h[2];
      av.hands = h;
      this.held.set(slot, h);
      if (a.hop && t < HOP_S * HOPS) av.root.position.y += HOP_H * Math.sin(((t % HOP_S) / HOP_S) * Math.PI);
    }
  }

  private release(slot: number, av: Avatar | null): void {
    const h = this.held.get(slot);
    if (!h) return;
    this.held.delete(slot);
    if (av && av.hands === h) av.hands = null;
  }

  /** Ушли из ограды: руки на место */
  clear(): void {
    for (const slot of this.acts.keys()) this.release(slot, this.avatarOf(slot));
    this.acts.clear();
  }
}
