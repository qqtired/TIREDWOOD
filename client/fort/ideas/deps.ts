// Связи пакета «Т-идеи» с матчем крепости: всё, что нужно частям (ремесло, карточки, краб, батуты, слабые места, замедление).
// Матч (match.ts) собирает это один раз; части ничего не знают о матче, кроме этих функций. Только типы.
import type * as THREE from 'three';
import type { FortMap } from '../../../shared/fortmap.ts';
import type { ClientMsg } from '../../../shared/messages.ts';
import type { CollisionWorld } from '../../../shared/world.ts';
import type { Sound } from '../../audio.ts';
import type { Effects } from '../../render/effects.ts';
import type { FortHud } from '../hud.ts';
import type { EventFxApi } from '../marks.ts';
import type { Zombies3D } from '../zombies3d.ts';

export interface IdeasDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  hud: FortHud;
  sound: Sound;
  effects: Effects;
  zombies: Zombies3D;
  eventFx: EventFxApi | null | undefined;
  collision: CollisionWorld;
  map: FortMap;
  /** Слой HUD кита (.k-hud), куда класть окно ремёсел */
  hudLayer: HTMLElement;
  /** Ряд значков под плашкой команды: ремесло, «Полный расчёт», краб, взятые карточки (создаёт FortIdeasClient) */
  row: HTMLElement;
  input: { readonly locked: boolean; lock(): Promise<void>; unlock(): void };
  send(msg: ClientMsg): void;
  myId(): number;
  nameOf(id: number): string;
  /** Оценка тика сервера по часам клиента */
  tick(): number;
  phase(): number;
  wave(): number;
  alive(): boolean;
  /** Где я (ноги) */
  pos(): { x: number; y: number; z: number };
  /** Моё золото */
  gold(): number;
  /** Мышь свободна без паузы (окно открыто): подсказка «кликни — обратно в бой» */
  releaseCursor(): void;
  /** Звуки арсенала: отказ и покупка */
  deny(): void;
  bought(big: boolean): void;
}
