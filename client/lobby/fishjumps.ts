// Сезон рыбалки (сервер шлёт fishSeason всем на набережной): у мест рыбалки — пирс, площадка маяка, баркас — из воды то
// и дело выпрыгивают рыбки: дуга, всплеск, брызги, «плюх». Нечасто и понемногу (не больше трёх в воздухе, раз в
// 1,5–4 с и только рядом с камерой), разного размера, изредка — крупная. Вид — из улова этого места.
// Без сервера (проверка): адрес с ?fishseason или __opus.app.lobby.fishJumps.setDev(true).
import * as THREE from 'three';
import { WATER_Y } from '../../shared/constants.ts';
import { FISH } from '../../shared/fishing.ts';
import { FISH_SPOTS, spotZone } from '../../shared/fishplaces.ts';
import { RULE, zoneSpecies } from '../../shared/fishrules.ts';
import type { Sound } from '../audio.ts';
import type { Effects } from '../render/effects.ts';
import { makeFish3D } from './fishart.ts';

/** Одновременно в воздухе не больше */
const MAX_LIVE = 3;
/** Прыжки — только у мест ближе стольких метров к камере (из двух случайных — ближнее) */
const NEAR_M = 45;
/** Пауза между прыжками, с (на низкой графике — реже) */
const GAP_MIN = 1.4;
const GAP_MAX = 3.8;

interface Jump {
  fish: THREE.Group;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  h: number;
  dur: number;
  t: number;
  len: number;
  big: boolean;
  heading: number;
}

export class FishJumps {
  private season = false;
  private dev = false;
  private wait = 0.6;
  private readonly live: Jump[] = [];
  private readonly scene: THREE.Scene;
  private readonly effects: Effects;
  private readonly sound: Sound;
  private readonly isWater: (x: number, z: number) => boolean;

  constructor(scene: THREE.Scene, effects: Effects, sound: Sound, isWater: (x: number, z: number) => boolean) {
    this.scene = scene;
    this.effects = effects;
    this.sound = sound;
    this.isWater = isWater;
    this.dev = typeof location !== 'undefined' && new URLSearchParams(location.search).has('fishseason');
  }

  /** Идёт ли сезон (или включён для проверки) */
  get on(): boolean {
    return this.season || this.dev;
  }

  /** Сервер: сезон начался или кончился (летящие допрыгивают) */
  setSeason(on: boolean): void {
    this.season = on;
  }

  /** Проверка без сервера */
  setDev(on: boolean): void {
    this.dev = on;
  }

  /** Сколько рыб в воздухе (для проверок) */
  get flying(): number {
    return this.live.length;
  }

  update(dt: number, cam: THREE.Vector3, low: boolean): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const j = this.live[i];
      j.t += dt;
      const k = Math.min(1, j.t / j.dur);
      const f = j.fish;
      f.position.set(j.x0 + (j.x1 - j.x0) * k, WATER_Y - 0.12 + 4 * j.h * k * (1 - k), j.z0 + (j.z1 - j.z0) * k);
      // нос — по касательной к дуге, хвост виляет
      const run = Math.hypot(j.x1 - j.x0, j.z1 - j.z0);
      const pitch = Math.atan2(4 * j.h * (1 - 2 * k), run);
      f.rotation.set(Math.sin(j.t * 9) * 0.25, j.heading + Math.sin(j.t * 26) * 0.22, pitch);
      if (k >= 1) {
        this.splash(j.x1, j.z1, j.len, j.big, cam);
        f.removeFromParent();
        this.live.splice(i, 1);
      }
    }
    if (!this.on) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = (GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN)) * (low ? 1.7 : 1);
    if (this.live.length < MAX_LIVE) this.spawn(cam);
  }

  /** Ушли с набережной: убрать летящих */
  reset(): void {
    for (const j of this.live) j.fish.removeFromParent();
    this.live.length = 0;
    this.wait = 0.6;
  }

  private spawn(cam: THREE.Vector3): void {
    const near: number[] = [];
    for (let i = 0; i < FISH_SPOTS.length; i++) {
      const s = FISH_SPOTS[i];
      if (Math.hypot(s.x - cam.x, s.z - cam.z) < NEAR_M) near.push(i);
    }
    if (!near.length) return;
    const a = near[Math.floor(Math.random() * near.length)];
    const b = near[Math.floor(Math.random() * near.length)];
    const dist = (i: number) => Math.hypot(FISH_SPOTS[i].x - cam.x, FISH_SPOTS[i].z - cam.z);
    const spot = dist(a) <= dist(b) ? a : b;
    const s = FISH_SPOTS[spot];
    const sp = pickSpecies(spot);
    if (sp < 0) return;
    const f = FISH[sp];
    const u = Math.random();
    const g = Math.round(f.g[0] + (f.g[1] - f.g[0]) * u * u * u);
    const fish = makeFish3D(sp, g);
    const len = fish.userData.len as number;
    // перед местом (рыбак смотрит на −sin, −cos от yaw), в стороны до 4 м
    const fx = -Math.sin(s.yaw);
    const fz = -Math.cos(s.yaw);
    for (let tries = 0; tries < 6; tries++) {
      const d = 3 + Math.random() * 9;
      const o = (Math.random() - 0.5) * 8;
      const x0 = s.x + fx * d + fz * o;
      const z0 = s.z + fz * d - fx * o;
      const a = Math.random() * Math.PI * 2;
      const run = 0.8 + len * 1.5 + Math.random() * 0.8;
      const x1 = x0 + Math.cos(a) * run;
      const z1 = z0 + Math.sin(a) * run;
      if (!this.isWater(x0, z0) || !this.isWater(x1, z1) || !this.isWater((x0 + x1) / 2, (z0 + z1) / 2)) continue;
      const h = 0.45 + len * 0.8 + Math.random() * 0.45;
      const big = len > 0.75;
      fish.position.set(x0, WATER_Y - 0.12, z0);
      this.scene.add(fish);
      this.live.push({ fish, x0, z0, x1, z1, h, dur: 0.5 + 0.38 * Math.sqrt(h), t: 0, len, big, heading: Math.atan2(-(z1 - z0), x1 - x0) });
      this.splash(x0, z0, len * 0.7, false, cam);
      return;
    }
  }

  /** Всплеск: брызги и круги (крупная — большой «плюх»), звук — если близко. */
  private splash(x: number, z: number, len: number, big: boolean, cam: THREE.Vector3): void {
    if (big) this.effects.waterSplash(x, z, len > 1.2);
    else {
      this.effects.burst(x, WATER_Y + 0.06, z, 0xdff4ff, 6 + Math.round(len * 12), 2.6 + len * 2, 0, 1.1, 0, 0.03 + len * 0.02);
      this.effects.ripple(x, z, 0.9 + len * 1.6, 0.9);
    }
    if (Math.hypot(x - cam.x, z - cam.z) < 30) this.sound.fishPlop([x, WATER_Y, z]);
  }
}

/** Вид прыгуна: из улова этого места (пристань или баркас), чаще мелочь, изредка — крупная. */
function pickSpecies(spot: number): number {
  const pool = zoneSpecies(spotZone(spot)).filter((sp) => !RULE[sp]!.rain);
  if (!pool.length) return -1;
  const r = Math.random();
  const want = r < 0.62 ? [0] : r < 0.88 ? [1] : r < 0.97 ? [2] : [3, 4];
  const list = pool.filter((sp) => want.includes(RULE[sp]!.tier));
  const from = list.length ? list : pool;
  return from[Math.floor(Math.random() * from.length)];
}
