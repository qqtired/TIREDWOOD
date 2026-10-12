// Кракен на экране: события боя (метки, удары, плевки, нырки, окна, ярость, срубленные щупальца) — тревоги, брызги,
// звук, тряска; подсказка в полосе босса (krakenInfo). FortMatch отдаёт сюда каждое событие первым: true — разобрано
// здесь, false — пусть идёт обычным путём (гибель, бросок). Сами метки на земле и окна рисует zombies3d.ts по снимку
// (signals.ts), голову и щупальца — kraken3d.ts.
import * as THREE from 'three';
import { TICK_RATE } from '../../shared/constants.ts';
import { ZS_BOSS_APPROACH, ZS_BOSS_OPEN, ZS_KRAKEN_DIVE, ZS_KRAKEN_SPIT, ZS_TENT_SLAM, Z_KRAKEN, Z_TENTACLE, type FortEvent } from '../../shared/fort.ts';
import { KRAKEN_SPIT_R, TENT_SLAM_R, tentacleRoot } from '../../shared/fortkraken.ts';
import { CRYSTAL } from '../../shared/fortmap.ts';
import type { CollisionWorld } from '../../shared/world.ts';
import type { Sound } from '../audio.ts';
import type { Effects } from '../render/effects.ts';
import type { FortHud } from './hud.ts';
import type { Zombies3D } from './zombies3d.ts';

/** Что нужно от матча */
export interface KrakenFxHost {
  hud: FortHud;
  effects: Effects;
  sound: Sound;
  zombies: Zombies3D;
  collision: CollisionWorld;
  /** Камера — для расстояний до ударов */
  readonly camPos: THREE.Vector3;
  /** Где стою я (предсказание) и мой номер */
  me(): { x: number; y: number; z: number };
  myId(): number;
  /** Тряска камеры — не меньше v */
  shake(v: number): void;
  /** Тик сервера сейчас (оценка) */
  tick(): number;
}

/** Варенье Кракена — сиреневое */
const INK = 0x8a2f9e;
const _root = { x: 0, y: 0, z: 0 };
const _w = new THREE.Vector3();

/** Подсказка в полосе босса для головы Кракена: состояние и отсчёт (тиков) из снимка */
export function krakenInfo(state: number, wind: number): string {
  const s = Math.max(0, wind / TICK_RATE).toFixed(1);
  if (state === ZS_BOSS_APPROACH) return 'Поднимается из бухты';
  if (state === ZS_KRAKEN_DIVE) return `Под водой · всплывёт в другом месте через ${s} с`;
  if (state === ZS_KRAKEN_SPIT) return 'Плюётся вареньем · уйди с метки';
  if (state === ZS_BOSS_OPEN && wind > 0) return `Оглушён · ${s} с — огонь по голове!`;
  if (state === ZS_BOSS_OPEN) return 'Без щупалец голова открыта — огонь!';
  return 'Броня · руби щупальца, пока лежат после удара';
}

export class KrakenFx {
  /** Головы, о появлении которых уже сказали */
  private readonly heads = new Set<number>();
  private lastHead = 0;
  private crystalAlertAt = -1e9;
  /** Тик ярости: нырок сразу после неё — без своей тревоги (иначе затрёт «в ярости») */
  private rageAt = -1e9;

  private readonly h: KrakenFxHost;

  constructor(host: KrakenFxHost) {
    this.h = host;
  }

  /** Событие боя: true — разобрано (обычный путь пропустить) */
  onEvent(e: FortEvent): boolean {
    switch (e[0]) {
      case 'warn':
        return this.warn(e[1], e[2], e[3], e[5], e[7]);
      case 'blast':
        return this.blast(e[1], e[2], e[3], e[4], e[5]);
      case 'bossphase': {
        if (this.h.zombies.kindOf(e[1]) !== Z_KRAKEN) return false;
        const { hud, sound, zombies } = this.h;
        this.rageAt = this.h.tick();
        hud.alert('🐙 Кракен в ярости · щупальца отросли и бьют парами, плевки по два', 3600);
        const seen = zombies.where(e[1], _w);
        sound.roar(seen ? [_w.x, _w.y + 3, _w.z] : null, 0.55);
        sound.krakenScare(seen ? [_w.x, _w.y + 2, _w.z] : [0, 2, 38]);
        this.h.shake(0.7);
        return true;
      }
      case 'throw':
        // плевок Кракена: бросок рисует обычный путь, здесь — звук
        if (e[8] === ZS_KRAKEN_SPIT) this.h.sound.spit([e[1], e[2], e[3]]);
        return false;
      case 'zdie':
        return this.die(e[1], e[2], e[3], e[4], e[5], e[6]);
      default:
        return false;
    }
  }

  private warn(id: number, attack: number, tx: number, tz: number, end: number): boolean {
    const { hud, sound } = this.h;
    if (attack !== ZS_TENT_SLAM && attack !== ZS_KRAKEN_SPIT && attack !== ZS_KRAKEN_DIVE) return false;
    const ms = Math.max(1400, (end - this.h.tick()) / TICK_RATE * 1000);
    const me = this.h.me();
    const d = Math.hypot(tx - me.x, tz - me.z);
    if (attack === ZS_TENT_SLAM) {
      // ударов много — тревога только тому, у кого метка рядом
      if (d < TENT_SLAM_R + 3) {
        hud.alert('🐙 Щупальце замахнулось на тебя · уйди с красной метки', ms);
        sound.horn(0.14);
      }
      return true;
    }
    if (attack === ZS_KRAKEN_SPIT) {
      if (d < KRAKEN_SPIT_R + 3) hud.alert('🐙 Кракен плюёт в тебя вареньем · уйди с метки', ms);
      else if (Math.hypot(tx - CRYSTAL.x, tz - CRYSTAL.z) < 1 && this.h.tick() - this.crystalAlertAt > TICK_RATE * 8) {
        this.crystalAlertAt = this.h.tick();
        hud.alert('💎 Кракен плюёт в кристалл · крыша над ним спасает', 2600);
      }
      return true;
    }
    // нырок: первый — это появление из бухты
    this.lastHead = id;
    if (!this.heads.has(id)) {
      this.heads.add(id);
      hud.alert('🐙 Из бухты поднимается Кракен! Руби щупальца, пока лежат после удара — потом голову', 5200);
      sound.krakenScare([tx, 2, tz]);
      sound.horn(0.3);
      this.h.shake(0.5);
    } else if (this.h.tick() - this.rageAt > TICK_RATE) {
      hud.alert('🐙 Кракен нырнул · всплывёт в другом месте', 2000);
    }
    return true;
  }

  private blast(attack: number, x: number, y: number, z: number, r: number): boolean {
    const { effects, sound } = this.h;
    const dist = this.h.camPos.distanceTo(_w.set(x, y, z));
    if (attack === ZS_TENT_SLAM) {
      // булава грохнула: пыль кольцом, щепки и камешки, клякса варенья
      const ground = this.h.collision.groundBelow(x, y + 0.3, z);
      const gy = ground > -100 && y - ground < 3 ? ground : y - 0.06;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        effects.puff(x + Math.cos(a) * r * 0.75, gy + 0.3, z + Math.sin(a) * r * 0.75, 1.2, 0xd9c7a0, 0.8, 0.6, 0.5);
      }
      effects.burst(x, gy + 0.3, z, 0x9a8a72, 22, 6, 0, 1, 0, 0.07);
      effects.burst(x, gy + 0.3, z, INK, 12, 4, 0, 1, 0, 0.05);
      effects.splat(x, gy, z, 0, 1, 0, r * 0.8, INK, -1, 14);
      sound.boom([x, y, z], 1.15);
      sound.rumble([x, y, z], 0.6);
      if (dist < r + 16) this.h.shake(Math.min(1, (r + 16 - dist) / 14));
      return true;
    }
    if (attack === ZS_KRAKEN_SPIT) {
      const ground = this.h.collision.groundBelow(x, y + 0.3, z);
      const gy = ground > -100 && y - ground < 3 ? ground : y - 0.75;
      effects.splat(x, gy, z, 0, 1, 0, r * 0.9, INK, -1, 14);
      effects.burst(x, gy + 0.4, z, INK, 18, 5, 0, 1, 0, 0.06);
      effects.puff(x, gy + 0.5, z, r * 0.8, 0xc58cff, 0.5, 0.5, 0.45);
      sound.jamHit([x, y, z]);
      if (dist < r + 6) this.h.shake(0.35);
      return true;
    }
    if (attack === ZS_KRAKEN_DIVE) {
      // всплыла голова (большой) или вынырнуло щупальце (малый)
      effects.waterSplash(x, z, r > 3);
      if (r > 3) {
        effects.ripple(x, z, r * 2.2, 2);
        sound.splash([x, y, z]);
        sound.rumble([x, y, z], 0.8);
      } else {
        sound.splash([x, y, z]);
      }
      return true;
    }
    if (attack === ZS_BOSS_OPEN && this.isHead(x, z)) {
      // срубили последнее щупальце: голова оглушена и открыта
      effects.burst(x, y, z, 0x69e7ef, 36, 8, 0, 1, 0, 0.08);
      effects.puff(x, y, z, r * 1.2, 0xbffcff, 0.8, 0.8, 0.45);
      effects.waterSplash(x, z, true);
      sound.roar([x, y, z], 0.6);
      this.h.hud.alert('🐙 Все щупальца срублены · голова оглушена — огонь по голове!', 3200);
      return true;
    }
    return false;
  }

  /** Гибель: щупальце ушло под воду (голова погибла) — только всплеск; срублено — надпись и обычный путь */
  private die(zid: number, killer: number, x: number, y: number, z: number, kind: number): boolean {
    const { effects, hud, sound, zombies } = this.h;
    if (kind === Z_TENTACLE) {
      const stage = this.laneOf(x);
      tentacleRoot(stage, _root);
      if (killer === 0) {
        zombies.kill(zid);
        effects.waterSplash(_root.x, _root.z, false);
        return true;
      }
      effects.waterSplash(_root.x, _root.z, true);
      sound.splash([_root.x, 0, _root.z]);
      sound.roar([x, y + 1, z], 1.4);
      hud.pb.bannerMessage(killer === this.h.myId() ? '🐙 Ты срубил щупальце!' : '🐙 Щупальце срублено', 1600);
      return false;
    }
    if (kind === Z_KRAKEN) {
      effects.waterSplash(x, z, true);
      effects.ripple(x, z, 14, 3);
      sound.krakenScare([x, y + 2, z]);
      this.heads.delete(zid);
      return false;
    }
    return false;
  }

  /** Полоса щупальца по x (корни стоят по полосам) */
  private laneOf(x: number): number {
    let best = 0;
    let d = Infinity;
    for (let i = 0; i < 4; i++) {
      tentacleRoot(i, _root);
      const di = Math.abs(_root.x - x);
      if (di < d) {
        d = di;
        best = i;
      }
    }
    return best;
  }

  /** Блик у головы Кракена (а не у другого босса) */
  private isHead(x: number, z: number): boolean {
    if (this.lastHead && this.h.zombies.where(this.lastHead, _w)) return Math.hypot(_w.x - x, _w.z - z) < 4;
    return z > 25;
  }
}
