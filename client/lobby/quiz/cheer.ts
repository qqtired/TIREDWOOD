// «Ракушка» 1.1, E1 + E3: праздник на сцене — одна точка для index.ts. По каждому снимку: кто главный (пятно света,
// spot.ts), праздник по переходу снимка (cues.ts: зал хлопает — applause.ts, огни рамки табло бегут — venue.party),
// свежие «Браво!» (view.bravo). Каждый кадр — руки и прыжки желеек, переезд пятна.
import type * as THREE from 'three';
import type { QzBoard, QzView } from '../../../shared/quiz/types.ts';
import type { Avatar } from '../../render/avatar.ts';
import { QuizApplause } from './applause.ts';
import { spotSlot, stageCue } from './cues.ts';
import { QuizSpot } from './spot.ts';
import { QuizSounds, type AudioKit } from './ui/hud-sound.ts';

export interface CheerDeps {
  /** Группа площадки в мире (координаты мира) — сюда ложится пятно света */
  group: THREE.Object3D;
  avatarOf: (slot: number) => Avatar | null;
  /** Шина звуков «Интерфейс» (d.hudKit.audio) — та же, что у звуков HUD «Ракушки» */
  audio?: () => unknown;
  /** Огни рамки табло бегут seconds секунд */
  party: (seconds: number) => void;
}

export class QuizCheer {
  private readonly d: CheerDeps;
  private readonly spot: QuizSpot;
  private readonly clap: QuizApplause;
  private prev: QzBoard | null = null;

  constructor(d: CheerDeps) {
    this.d = d;
    this.spot = new QuizSpot(d.group);
    const audio = d.audio as (() => AudioKit | null) | undefined;
    this.clap = new QuizApplause(d.avatarOf, new QuizSounds(audio));
  }

  /** Новый снимок (view — внутри ограды; снаружи только табло: пятно и огни есть, хлопков нет) */
  push(b: QzBoard | null, v: QzView | null, serverNow: number): void {
    this.spot.set(spotSlot(b));
    const cue = stageCue(this.prev, b);
    this.prev = b;
    if (cue) {
      if (cue.party) this.d.party(cue.party);
      if (cue.applause) this.clap.cheer(v);
    }
    if (v) this.clap.bravo(v.bravo, serverNow);
  }

  /** Кадр (после кадра желеек): пятно — к главному, руки и прыжки */
  frame(dt: number): void {
    this.spot.update(dt, this.d.avatarOf);
    this.clap.update(dt);
  }

  /** Ушли с набережной или флаг выключен */
  clear(): void {
    this.prev = null;
    this.spot.set(0);
    this.clap.clear();
  }

  debug(): Record<string, unknown> {
    return { spot: this.spot.on };
  }
}
