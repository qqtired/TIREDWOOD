// Позы желейки на банане (флаг BANANA): сидит верхом и держится за ручку, клонится по крену (A/D), на краю «висит» —
// одна варежка отпускает ручку и машет, падает дугой в воду с кувырком, плывёт по-собачьи и смотрит на банан, по E —
// прыжок обратно на место. Всё кодом поверх настоящей желейки (client/render/avatar.ts: hands, bodyRoll, bodyPitch).
// Пользуются игра (client/boat/banana.ts) и стенд lab/banana (client/boat/bananalab.ts).
import * as THREE from 'three';
import { WATER_Y } from '../../shared/constants.ts';
import type { Avatar, AvatarPose } from '../render/avatar.ts';

/** Сколько длится падение дугой и прыжок обратно, с */
export const FALL_S = 0.55;
export const BACK_S = 0.4;
/** В воде желейка по грудь: низ тела ниже воды */
export const SWIM_DROP = 0.62;

export type RiderPhase = 'seat' | 'fall' | 'swim' | 'back';

/** Что сейчас с седоком на экране (своё у каждой желейки) */
export class RiderAnim {
  phase: RiderPhase = 'seat';
  /** Секунд в фазе */
  t = 0;
  /** Откуда и куда летит (падение, прыжок обратно), сторона падения (+1 — вправо) */
  readonly from = new THREE.Vector3();
  readonly to = new THREE.Vector3();
  side = 1;
  /** Только что упал в воду (сцене — всплеск и звук), только что вернулся */
  splashed = false;
  /** Крен на экране — плавно к серверному */
  tilt = 0;

  fall(from: THREE.Vector3, toX: number, toZ: number, side: number): void {
    this.phase = 'fall';
    this.t = 0;
    this.from.copy(from);
    this.to.set(toX, WATER_Y - SWIM_DROP, toZ);
    this.side = side >= 0 ? 1 : -1;
    this.splashed = false;
  }

  back(fromX: number, fromZ: number): void {
    this.phase = 'back';
    this.t = 0;
    this.from.set(fromX, WATER_Y - SWIM_DROP, fromZ);
  }

  step(dt: number): void {
    this.t += dt;
    if (this.phase === 'fall' && this.t >= FALL_S) {
      this.phase = 'swim';
      this.t = 0;
    } else if (this.phase === 'back' && this.t >= BACK_S) {
      this.phase = 'seat';
      this.t = 0;
    }
  }
}

const HOLD_Y = 0.5;
const HOLD_Z = -0.42;
const HOLD_X = 0.16;

const smooth = (k: number): number => k * k * (3 - 2 * k);

/**
 * Поставить желейку-седока: seat — верх сиденья в мире (по позе банана на экране), yaw — курс банана, roll — крен
 * банана (+ — влево), tilt — свой крен седока −1…1 (+ — вправо), swimAt — где он в воде (x, z), bananaAt — середина
 * банана (в воде смотрит на него), time — секунды (для взмахов). Меняет pose и руки/наклон аватара.
 */
export function riderPose(av: Avatar, a: RiderAnim, pose: AvatarPose, seat: THREE.Vector3, yaw: number, roll: number, tilt: number,
  swimAt: { x: number; z: number } | null, bananaAt: { x: number; z: number }, time: number): void {
  a.tilt += (tilt - a.tilt) * 0.35;
  const h = av.hands ?? (av.hands = [0, 0, 0, 0, 0, 0]);
  pose.pitch = 0;
  if (a.phase === 'seat') {
    pose.x = seat.x;
    pose.y = seat.y;
    pose.z = seat.z;
    pose.yaw = yaw;
    const lean = -a.tilt * 0.55;
    av.bodyRoll = roll + lean;
    av.bodyPitch = -0.08;
    // держится за ручку обеими; на краю (крен > 0,85) наружная варежка отпускает и машет
    const edge = Math.max(0, Math.abs(a.tilt) - 0.85) / 0.15;
    const out = a.tilt > 0 ? 1 : 0;
    h[0] = -HOLD_X; h[1] = HOLD_Y; h[2] = HOLD_Z;
    h[3] = HOLD_X; h[4] = HOLD_Y; h[5] = HOLD_Z;
    if (edge > 0) {
      const o = out * 3;
      const s = out ? 1 : -1;
      const wav = Math.sin(time * 18) * 0.08;
      h[o] = s * (HOLD_X + 0.34 * edge);
      h[o + 1] = HOLD_Y + 0.55 * edge + wav;
      h[o + 2] = HOLD_Z + 0.3 * edge;
    }
    return;
  }
  if (a.phase === 'fall') {
    // дугой вбок и вниз, с кувырком через бок
    const k = Math.min(1, a.t / FALL_S);
    pose.x = a.from.x + (a.to.x - a.from.x) * k;
    pose.z = a.from.z + (a.to.z - a.from.z) * k;
    pose.y = a.from.y + (a.to.y - a.from.y) * k + Math.sin(k * Math.PI) * 0.7;
    pose.yaw = yaw;
    av.bodyRoll = -a.side * smooth(k) * 1.9;
    av.bodyPitch = smooth(k) * 0.3;
    // руки вверх — «а-а-а!»
    const wav = Math.sin(time * 20) * 0.06;
    h[0] = -0.42; h[1] = 1.25 + wav; h[2] = -0.05;
    h[3] = 0.42; h[4] = 1.25 - wav; h[5] = -0.05;
    return;
  }
  if (a.phase === 'back') {
    // прыжок из воды на место
    const k = Math.min(1, a.t / BACK_S);
    const e = smooth(k);
    pose.x = a.from.x + (seat.x - a.from.x) * e;
    pose.z = a.from.z + (seat.z - a.from.z) * e;
    pose.y = a.from.y + (seat.y - a.from.y) * e + Math.sin(k * Math.PI) * 0.6;
    pose.yaw = yaw;
    av.bodyRoll = roll * e;
    av.bodyPitch = -0.25 * Math.sin(k * Math.PI);
    h[0] = -0.3; h[1] = 0.9; h[2] = -0.35;
    h[3] = 0.3; h[4] = 0.9; h[5] = -0.35;
    return;
  }
  // плывёт: по грудь в воде, качается на волне, гребёт по-собачьи, смотрит на банан
  const at = swimAt ?? { x: pose.x, z: pose.z };
  pose.x = at.x;
  pose.z = at.z;
  pose.y = WATER_Y - SWIM_DROP + Math.sin(time * 2.6 + av.id) * 0.06;
  const dx = bananaAt.x - at.x;
  const dz = bananaAt.z - at.z;
  if (dx * dx + dz * dz > 0.01) pose.yaw = Math.atan2(-dx, -dz);
  av.bodyRoll = Math.sin(time * 2.6 + av.id) * 0.08;
  av.bodyPitch = -0.18;
  const p = time * 6.5;
  h[0] = -0.3; h[1] = SWIM_DROP + 0.08 + Math.sin(p) * 0.12; h[2] = -0.35 - Math.cos(p) * 0.16;
  h[3] = 0.3; h[4] = SWIM_DROP + 0.08 - Math.sin(p) * 0.12; h[5] = -0.35 + Math.cos(p) * 0.16;
}

/** Седок сошёл с банана: руки и наклон — как были (по действию) */
export function riderClear(av: Avatar): void {
  av.hands = null;
  av.bodyRoll = 0;
  av.bodyPitch = 0;
}
