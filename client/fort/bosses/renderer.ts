// Боссы «Крепости 50» на экране — Избушка и Пеликан-Бомбардир (модели и клипы стенда lab/fort-rework/bosses.html, «как
// есть»): по одной группе на вид, одна отрисовка на часть (19 и 21). Состояние сервера (ZS_*, shared/fortbosses50.ts) →
// клип модели (HS / PS) и секунда клипа: из отсчёта снимка (wind), дальше — по часам кадра, чтобы не дёргалось.
import * as THREE from 'three';
import { TICK_RATE } from '../../../shared/constants.ts';
import { BOSS_OPEN_TICKS, ZS_BOSS_OPEN } from '../../../shared/fort.ts';
import {
  NEST_DZ, ZS_HUT_APPEAR, ZS_HUT_BOMBS, ZS_HUT_KICK, ZS_HUT_NEST, ZS_HUT_PHASE, ZS_HUT_STOMP, ZS_PL_BOMB, ZS_PL_CRASH, ZS_PL_DIVE,
  ZS_PL_GROUND, ZS_PL_GUST, ZS_PL_PECK, ZS_PL_PERCH, ZS_PL_PHASE, ZS_PL_SNAP, f50BossTicks, nestOnWall,
} from '../../../shared/fortbosses50.ts';
import { Z_HUT, Z_PELICAN } from '../../../shared/fortkinds.ts';
import { buildBoss, type BossDef, type MobAnim } from './bosskit.ts';
import { HS, HUT } from './hut.ts';
import { PELICAN, PS } from './pelican.ts';

/** Гибель доигрывается столько секунд (клип стенда — 4 с) */
export const BIG_BOSS_DIE_S = 4;

interface Slot {
  def: BossDef;
  model: ReturnType<typeof buildBoss>;
  used: boolean;
  anim: MobAnim;
  /** Состояние сервера и сдвиг секунды клипа (отсчёт снимка − часы трека) */
  st: number;
  offset: number;
  yaw: number;
  bank: number;
}

/** Снимок для выбора клипа: состояние, отсчёт, фаза, высота корня */
export interface BigBossSnap {
  st: number;
  wind: number;
  stage: number;
  y: number;
}

const HUT_ST: Readonly<Record<number, number>> = {
  [ZS_HUT_APPEAR]: HS.APPEAR, [ZS_HUT_KICK]: HS.KICK, [ZS_HUT_BOMBS]: HS.BOMBS, [ZS_HUT_STOMP]: HS.STOMP, [ZS_HUT_PHASE]: HS.PHASE,
  [ZS_HUT_NEST]: HS.NEST, [ZS_BOSS_OPEN]: HS.OPEN,
};
const PL_ST: Readonly<Record<number, number>> = {
  [ZS_PL_BOMB]: PS.BOMB, [ZS_PL_DIVE]: PS.DIVE, [ZS_PL_PHASE]: PS.PHASE, [ZS_PL_PERCH]: PS.PERCH, [ZS_PL_PECK]: PS.PECK,
  [ZS_PL_GUST]: PS.GUST, [ZS_PL_CRASH]: PS.CRASH, [ZS_PL_SNAP]: PS.SNAP, [ZS_PL_GROUND]: PS.GROUND,
};

const _m = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _e = new THREE.Euler();

/** Ровная подсветка Пеликана снизу (доля белого) */
const PELICAN_LIFT = 0.2;

export class BigBosses {
  private readonly slots = new Map<number, Slot>();

  constructor(parent: THREE.Object3D) {
    for (const [kind, def] of [[Z_HUT, HUT], [Z_PELICAN, PELICAN]] as const) {
      const model = buildBoss(def);
      model.group.name = `fort-boss:${def.id}`;
      // Пеликан почти всегда над головой: снизу брюхо освещает только отсвет травы, и белое выходит оливковым.
      // Лёгкая ровная подсветка (свечение — значение материала, шейдер тот же); светящиеся части не трогаем.
      if (kind === Z_PELICAN) model.group.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m?.emissive && m.emissive.getHex() === 0) m.emissive.setScalar(PELICAN_LIFT); });
      model.group.matrixAutoUpdate = false;
      model.group.visible = false;
      parent.add(model.group);
      this.slots.set(kind, {
        def, model, used: false, st: -1, offset: 0, yaw: 0, bank: 0,
        anim: { t: 0, gait: 0, path: 0, speed: 0, st: 0, stT: 0, hit: 0, die: 0, seed: 0, rage: false, flags: 0, stage: 1 },
      });
    }
  }

  has(kind: number): boolean {
    return this.slots.has(kind);
  }

  height(kind: number): number {
    return this.slots.get(kind)?.def.height ?? 4;
  }

  begin(): void {
    for (const s of this.slots.values()) s.used = false;
  }

  /** Особь в кадр: root — корень (ноги, курс), a — поза из часов трека, snap — снимок; false — вида нет или уже занят */
  add(kind: number, root: THREE.Matrix4, a: MobAnim, snap: BigBossSnap, dt: number, flash: number, tint: THREE.Color | null, mix: number): boolean {
    const s = this.slots.get(kind);
    if (!s || s.used) return false;
    s.used = true;
    const o = s.anim;
    Object.assign(o, a);
    o.stage = Math.max(1, snap.stage || 1);
    // секунда клипа: при новом состоянии — из отсчёта снимка (клиент мог увидеть его не с начала), дальше — по часам трека
    const total = snap.st === ZS_BOSS_OPEN ? BOSS_OPEN_TICKS : f50BossTicks(snap.st);
    if (snap.st !== s.st) {
      s.st = snap.st;
      s.offset = total > 0 ? Math.max(0, (total - snap.wind) / TICK_RATE - a.stT) : 0;
    }
    const T = a.stT + s.offset;
    o.stT = T;
    _m.copy(root);
    if (kind === Z_HUT) {
      o.st = a.die > 0 ? HS.WALK : HUT_ST[snap.st] ?? HS.WALK;
      // наседка: сервер уже подвинул корень к стене, поза двигает избу сама — корень возвращаем назад
      if (o.st === HS.NEST && a.die <= 0) _m.multiply(_t.makeTranslation(0, 0, -NEST_DZ * nestOnWall(T * TICK_RATE)));
    } else {
      const open = snap.st === ZS_BOSS_OPEN;
      if (a.die > 0) {
        o.st = PS.GROUND;
        o.stage = 3;
      } else if (open && o.stage >= 3) {
        o.st = PS.GROUND;
        o.speed = 0;
      } else if (open && o.stage === 2) {
        // открыт на насесте: балансирует на зубцах
        o.st = PS.PERCH;
        o.stT = 1.9 + (T % 2);
      } else if (open) o.st = PS.OPEN;
      else o.st = PL_ST[snap.st] ?? (snap.y > 1 ? PS.FLY : PS.GROUND);
      // вираж: крен внутрь поворота (как на стенде)
      if (o.st === PS.FLY) {
        const e = _e.setFromRotationMatrix(_m, 'YXZ');
        let dy = e.y - s.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        s.yaw = e.y;
        const want = dt > 0 ? Math.max(-0.4, Math.min(0.4, (dy / dt) * 0.45)) : 0;
        s.bank += (want - s.bank) * Math.min(1, dt * 3);
        _m.multiply(_t.makeRotationZ(-s.bank));
      } else s.bank = 0;
    }
    const g = s.model.group;
    g.matrix.copy(_m);
    g.matrixWorldNeedsUpdate = true;
    g.visible = true;
    s.model.update(o, flash, tint, mix);
    return true;
  }

  end(): void {
    for (const s of this.slots.values()) {
      s.model.group.visible = s.used;
      if (!s.used) s.st = -1;
    }
  }

  clear(): void {
    this.begin();
    this.end();
  }

  /** Замер: треугольники и части видимых боссов */
  inspect(): Array<{ id: string; parts: number; visible: boolean }> {
    return [...this.slots.values()].map((s) => ({ id: s.def.id, parts: s.def.parts.length, visible: s.model.group.visible }));
  }
}
