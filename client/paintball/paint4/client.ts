// Четыре набора краскомётов на клиенте (флаг PAINT4: сервер шлёт p4 в welcome). Матч (match.ts) зовёт отсюда:
// шаг предсказания (обёртка оружия набора — shared/paint4.ts), свой выстрел, события сервера, карточки выбора,
// ведёрко на G (держишь — дуга, отпустил — бросок), наборы в руках у всех желеек и строку оружия в панели бойца.
// Без флага объект не создаётся — пейнтбол как раньше.
import * as THREE from 'three';
import { EYE_HEIGHT, HITBOX_CY, HITBOX_RX, HITBOX_RY, PHASE_END, PHASE_PLAY, PHASE_WARMUP, TEAM_COLORS, TICK_RATE } from '../../../shared/constants.ts';
import { tpsShotDir } from '../../../shared/aim.ts';
import type { GameEvent, RosterEntry } from '../../../shared/messages.ts';
import {
  BOW_DRAW_TICKS, BTN_PB_BUCKET, BUCKET_CD_TICKS, KITS, KIT_BOW, KIT_CAN, KIT_MARKER, KIT_SQUIRT, arrowSpeed, bucketLaunch, fanDir,
  kitOf, kitSpread, makeP4Step, p4After, p4Before,
} from '../../../shared/paint4.ts';
import { E_RELOAD } from '../../../shared/protocol.ts';
import { currentSpread, type Input, type PlayerState, type StepEvents } from '../../../shared/sim.ts';
import { makeGrenade } from '../../../shared/fortgren.ts';
import { makeRayHit, rayEllipsoid, type CollisionWorld } from '../../../shared/world.ts';
import type { Sound } from '../../audio.ts';
import type { StepHook } from '../../predict.ts';
import type { Avatar } from '../../render/avatar.ts';
import type { Effects } from '../../render/effects.ts';
import { KitCards } from './cards.ts';
import { P4Fx, bowArc, bucketArc } from './fx.ts';
import { KIT_ICON, KitRig } from './kits3d.ts';
import { P4Sfx } from './sfx.ts';

/** Что панель бойца (ui.ts) умеет для наборов — PaintballUi вешает это на Hud */
export interface P4Hud {
  p4Kit?(icon: string, name: string): void;
  p4Bucket?(ready: boolean, secLeft: number): void;
  p4Ammo?(html: string, frac: number, tone: '' | 'info' | 'bad' | 'gold'): void;
}

export interface P4Deps {
  scene: THREE.Scene;
  effects: Effects;
  collision: CollisionWorld;
  sound: Sound;
  /** Слот над панелью бойца — туда карточки */
  cardsParent: HTMLElement;
  send: (k: number) => void;
  /** Мышь захвачена игрой (Input.locked) */
  locked: () => boolean;
}

const _v = new THREE.Vector3();
const arcPts = new Float32Array(3 * 90);

export class P4Client {
  private readonly d: P4Deps;
  readonly fx: P4Fx;
  readonly sfx: P4Sfx;
  readonly cards: KitCards;
  /** Свой набор (по нему предсказание и панель) */
  kit = KIT_MARKER;
  /** Свой выбор ждёт ответа сервера до этого момента (мс) — пока не верим составу */
  private pickUntil = 0;
  private readonly step = makeP4Step();
  /** Натяжение выпущенной в этом тике стрелы (после шага предсказания) */
  charge = 0;
  readonly hook: StepHook;
  private readonly rigs = new Map<Avatar, KitRig>();
  private readonly kits = new Map<number, number>();
  private readonly hit = makeRayHit();
  private readonly dir = { dirX: 0, dirY: 0, dirZ: 0 };
  /** G: держу (дуга), отпустил — бит броска уйдёт с ближайшим входом */
  private gHeld = false;
  private throwLatch = false;
  /** Тик, когда ведёрко снова в руке (по своему событию 'bucket') */
  bucketReady = 0;
  /** Для отладки (__opus.state().p4): сколько событий какого вида пришло */
  readonly seen: Record<string, number> = {};
  private seed = 0;
  private drawPrev = 0;
  /** Чужие луки: когда начали тянуть (флаг E_RELOAD у лучника — «натягивает») */
  private readonly drawStart = new Map<number, number>();
  private wheelHandler: (e: WheelEvent) => void;
  private moveHandler: (e: MouseEvent) => void;
  myId = 0;
  myTeam: 0 | 1 = 0;

  constructor(d: P4Deps) {
    this.d = d;
    this.fx = new P4Fx(d.scene, d.effects, d.collision);
    this.sfx = new P4Sfx(d.sound);
    this.cards = new KitCards(d.cardsParent);
    this.cards.onPick = (k) => this.pick(k);
    this.fx.onImpact = (kind, x, y, z) => this.sfx.impact(kind, [x, y, z], this.camDist(x, y, z));
    const self = this;
    this.hook = {
      before(s: PlayerState, inp: Input): Input {
        return p4Before(self.step, s, inp, self.kit);
      },
      after(s: PlayerState, _inp: Input, ev: StepEvents, canFire?: boolean): void {
        p4After(self.step, s, ev, canFire ?? false, self.seed, self.kit);
        if (ev.fired) self.charge = self.step.charge;
      },
    };
    this.wheelHandler = (e) => {
      if (!this.cards.shown || !this.d.locked()) return;
      this.cards.wheel(e.deltaY);
    };
    this.moveHandler = (e) => {
      if (!this.d.locked()) return;
      this.cards.moveCursor(e.movementX, e.movementY);
    };
    window.addEventListener('wheel', this.wheelHandler, { passive: true });
    document.addEventListener('mousemove', this.moveHandler);
  }

  dispose(): void {
    window.removeEventListener('wheel', this.wheelHandler);
    document.removeEventListener('mousemove', this.moveHandler);
    for (const r of this.rigs.values()) r.dispose();
    this.rigs.clear();
    this.cards.show(null);
    this.cards.root.remove();
    this.fx.dispose();
  }

  setSeed(seed: number): void {
    this.seed = seed;
  }

  private camPos = new THREE.Vector3();
  setCamera(p: THREE.Vector3): void {
    this.camPos.copy(p);
  }

  private camDist(x: number, y: number, z: number): number {
    return this.camPos.distanceTo(_v.set(x, y, z));
  }

  // ------------------------------------------------------------ выбор набора

  private pick(k: number): void {
    this.kit = k;
    this.pickUntil = performance.now() + 1500;
    this.d.send(k);
  }

  /** Ответ сервера: такой набор действует (или будет при появлении) */
  onServerKit(k: number): void {
    this.pickUntil = 0;
    this.kit = kitOf(k);
    this.cards.setSelected(this.kit);
  }

  onRoster(list: readonly RosterEntry[]): void {
    for (const r of list) {
      const k = kitOf(r.kit);
      this.kits.set(r.id, k);
      if (r.id === this.myId && performance.now() > this.pickUntil && k !== this.kit) {
        this.kit = k;
        this.cards.setSelected(k);
      }
    }
  }

  kitOfPlayer(id: number): number {
    return id === this.myId ? this.kit : this.kits.get(id) ?? KIT_MARKER;
  }

  /** Клавиши: 1–4 — набор (пока видны карточки), G — ведёрко. true — съели */
  onKey(code: string, down: boolean, e: KeyboardEvent, canAct: boolean): boolean {
    if (code === 'KeyG') {
      if (e.repeat) return true;
      if (down && canAct) this.gHeld = true;
      else if (!down && this.gHeld) {
        this.gHeld = false;
        this.throwLatch = true;
      }
      return true;
    }
    if (down && this.cards.shown && /^Digit[1-4]$/.test(code)) {
      this.cards.pick(Number(code.slice(5)) - 1);
      return true;
    }
    return false;
  }

  /** ЛКМ при захваченной мыши (пока сбит): выбрать карточку под своей стрелкой */
  onClick(): boolean {
    return this.cards.clickVirtual();
  }

  /** Биты набора в этот вход: бросок ведёрка — ровно один раз */
  extraButtons(): number {
    if (!this.throwLatch) return 0;
    this.throwLatch = false;
    return BTN_PB_BUCKET;
  }

  /** G отпустили не сами (чат, меню, сбит) — без броска */
  cancelHold(): void {
    this.gHeld = false;
    this.throwLatch = false;
  }

  // ------------------------------------------------------------ свой бой

  /** Свой выстрел набора (не маркер): тот же луч, что у сервера; рисуем сразу */
  localShot(s: PlayerState, ev: StepEvents, ads: boolean, shoulder: number, tg: number[], n: number, av: Avatar): void {
    const { collision } = this.d;
    const kit = this.kit;
    const rig = this.rigOf(av, this.myTeam);
    tpsShotDir(s, ev.aimYaw, ev.aimPitch, ev.spread, this.seed, s.shots, shoulder, ads, collision, tg, n, this.dir);
    const ox = s.x;
    const oy = s.y + EYE_HEIGHT;
    const oz = s.z;
    const m = rig.muzzle(_v) ?? av.muzzle(_v);
    const mx = m.x;
    const my = m.y;
    const mz = m.z;
    rig.fire();
    av.onShot();
    const color = TEAM_COLORS[this.myTeam];
    if (kit === KIT_BOW) {
      const sp = arrowSpeed(this.charge);
      this.fx.arrow(this.myId, s.shots, mx, my, mz, this.dir.dirX * sp, this.dir.dirY * sp, this.dir.dirZ * sp, this.myTeam);
      this.sfx.bow(null, 0, this.charge);
      return;
    }
    const spec = KITS[kit];
    if (kit === KIT_CAN) {
      const cx = this.dir.dirX;
      const cy = this.dir.dirY;
      const cz = this.dir.dirZ;
      const ends: number[] = [];
      for (let i = 0; i < spec.pellets; i++) {
        fanDir(cx, cy, cz, i, spec.pellets, spec.fan, this.seed, s.shots, this.dir);
        const r = this.ray(ox, oy, oz, this.dir.dirX, this.dir.dirY, this.dir.dirZ, spec.range, tg, n);
        ends.push(ox + this.dir.dirX * r.t, oy + this.dir.dirY * r.t, oz + this.dir.dirZ * r.t, r.kind);
      }
      this.fx.fan(mx, my, mz, ends, color);
      this.sfx.can(null);
      return;
    }
    const r = this.ray(ox, oy, oz, this.dir.dirX, this.dir.dirY, this.dir.dirZ, spec.range, tg, n);
    this.fx.squirt(mx, my, mz, ox + this.dir.dirX * r.t, oy + this.dir.dirY * r.t, oz + this.dir.dirZ * r.t, r.kind, r.nx, r.ny, r.nz, color);
    this.sfx.squirt(null);
  }

  private ray(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, range: number, tg: number[], n: number): { t: number; kind: number; nx: number; ny: number; nz: number } {
    let best = range;
    let kind = 2;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    if (this.d.collision.raycast(ox, oy, oz, dx, dy, dz, range, this.hit, true)) {
      best = this.hit.t;
      kind = 0;
      nx = this.hit.nx;
      ny = this.hit.ny;
      nz = this.hit.nz;
    }
    for (let i = 0; i < n; i++) {
      const t = rayEllipsoid(ox, oy, oz, dx, dy, dz, tg[i * 3], tg[i * 3 + 1] + HITBOX_CY, tg[i * 3 + 2], HITBOX_RX, HITBOX_RY);
      if (t >= 0 && t < best) {
        best = t;
        kind = 1;
      }
    }
    return { t: best, kind, nx, ny, nz };
  }

  /** Свой шаг: бросок ведёрка (тот же бросок, что у сервера) */
  localThrow(s: PlayerState, inp: Input, tick: number, av: Avatar): void {
    if (tick < this.bucketReady) return;
    const g = makeGrenade();
    bucketLaunch(s.x, s.y, s.z, inp.yaw, inp.pitch, this.d.collision, this.hit, g);
    this.rigOf(av, this.myTeam).throwBucket();
    this.fx.bucket(this.myId, g.x, g.y, g.z, g.vx, g.vy, g.vz, this.myTeam, TEAM_COLORS[this.myTeam]);
    this.sfx.toss(null);
    this.bucketReady = tick + BUCKET_CD_TICKS;
  }

  // ------------------------------------------------------------ события сервера

  /**
   * События наборов. 'shot' Брызгалки рисуем струйкой (true — съели, маркер его не рисует). Свои выстрелы уже нарисованы
   * предсказанием; свои стрелы и ведёрки — тоже, от сервера берём только где кончились.
   */
  onEvent(e: GameEvent, k: number, team: (id: number) => 0 | 1, avatar: (id: number) => Avatar | undefined, onShove: (id: number) => void): boolean {
    const fx = this.fx;
    if (typeof e[0] === 'string') this.seen[e[0]] = (this.seen[e[0]] ?? 0) + 1;
    switch (e[0]) {
      case 'shot': {
        const pid = e[1];
        if (this.kitOfPlayer(pid) !== KIT_SQUIRT) return false;
        if (pid === this.myId) return true;
        const [, , ox, oy, oz, ex, ey, ez, kind, nx, ny, nz] = e;
        const av = avatar(pid);
        let sx = ox;
        let sy = oy;
        let sz = oz;
        if (av && av.shown) {
          const m = this.rigOf(av, team(pid)).muzzle(_v) ?? av.muzzle(_v);
          sx = m.x;
          sy = m.y;
          sz = m.z;
          this.rigOf(av, team(pid)).fire();
          av.onShot();
        }
        fx.squirt(sx, sy, sz, ex, ey, ez, kind, nx, ny, nz, TEAM_COLORS[team(pid)]);
        this.sfx.squirt([sx, sy, sz], this.camDist(sx, sy, sz));
        return true;
      }
      case 'fan': {
        const [, pid, ox, oy, oz, ends] = e;
        if (pid === this.myId) return true;
        const av = avatar(pid);
        let sx = ox;
        let sy = oy;
        let sz = oz;
        if (av && av.shown) {
          const rig = this.rigOf(av, team(pid));
          rig.fire();
          av.onShot();
          const m = rig.muzzle(_v) ?? av.muzzle(_v);
          sx = m.x;
          sy = m.y;
          sz = m.z;
        }
        fx.fan(sx, sy, sz, ends, TEAM_COLORS[team(pid)]);
        this.sfx.can([sx, sy, sz], this.camDist(sx, sy, sz));
        return true;
      }
      case 'shove': {
        const [, vid] = e;
        onShove(vid);
        if (vid === this.myId) this.sfx.shoved();
        return true;
      }
      case 'arrow': {
        const [, pid, shot, ox, oy, oz, vx, vy, vz, charge] = e;
        if (pid === this.myId) return true;
        const av = avatar(pid);
        let sx = ox;
        let sy = oy;
        let sz = oz;
        if (av && av.shown) {
          const rig = this.rigOf(av, team(pid));
          const m = rig.muzzle(_v);
          if (m) {
            sx = m.x;
            sy = m.y;
            sz = m.z;
          }
          rig.fire();
          av.onShot();
        }
        fx.arrow(pid, shot, sx, sy, sz, vx, vy, vz, team(pid));
        this.sfx.bow([sx, sy, sz], this.camDist(sx, sy, sz), charge);
        this.drawStart.delete(pid);
        return true;
      }
      case 'arrowEnd': {
        const [, pid, shot, x, y, z, kind, nx, ny, nz] = e;
        fx.arrowEnd(pid, shot, x, y, z, kind, nx, ny, nz, TEAM_COLORS[team(pid)]);
        if (kind === 1) this.sfx.impact('arrow', [x, y, z], this.camDist(x, y, z));
        return true;
      }
      case 'bucket': {
        const [, pid, ox, oy, oz, vx, vy, vz] = e;
        if (pid === this.myId) {
          this.bucketReady = k + BUCKET_CD_TICKS;
          return true;
        }
        const av = avatar(pid);
        if (av) this.rigOf(av, team(pid)).throwBucket();
        fx.bucket(pid, ox, oy, oz, vx, vy, vz, team(pid), TEAM_COLORS[team(pid)]);
        this.sfx.toss([ox, oy, oz], this.camDist(ox, oy, oz));
        return true;
      }
      case 'bsplash': {
        const [, pid, x, y, z] = e;
        fx.bucketSplash(pid, x, y, z, TEAM_COLORS[team(pid)]);
        return true;
      }
    }
    return false;
  }

  /** Новый раунд: ведёрко снова в руке, следы прочь */
  onWarmup(): void {
    this.bucketReady = 0;
    this.fx.clear();
  }

  // ------------------------------------------------------------ кадр

  rigOf(av: Avatar, team: 0 | 1): KitRig {
    let r = this.rigs.get(av);
    if (!r) {
      r = new KitRig(av, team);
      this.rigs.set(av, r);
    }
    r.setTeam(team);
    return r;
  }

  forget(av: Avatar): void {
    const r = this.rigs.get(av);
    if (r) {
      r.dispose();
      this.rigs.delete(av);
    }
  }

  /** Чужая желейка: набор в руках, перезарядка и натяжение по флагам снимка */
  updateRemote(av: Avatar, id: number, team: 0 | 1, flags: number, dt: number): void {
    const rig = this.rigOf(av, team);
    const kit = this.kitOfPlayer(id);
    rig.setKit(kit);
    const busy = (flags & E_RELOAD) !== 0;
    if (kit === KIT_BOW) {
      // у лучника E_RELOAD — «натягивает» (сервер), тянем по времени, как он
      if (busy) {
        if (!this.drawStart.has(id)) this.drawStart.set(id, performance.now());
        rig.setDraw(Math.min(1, (performance.now() - this.drawStart.get(id)!) / (BOW_DRAW_TICKS * 1000 / TICK_RATE)));
      } else {
        this.drawStart.delete(id);
        rig.setDraw(0);
      }
      rig.setReload(null);
    } else {
      rig.setReload(busy ? ((performance.now() / 1600) % 1) : null);
    }
    rig.update(dt);
  }

  /** Флаги чужого лучника для аватара: «натягивает» — не перезарядка (у аватара своя анимация перезарядки) */
  avatarFlags(id: number, flags: number): number {
    return this.kitOfPlayer(id) === KIT_BOW ? flags & ~E_RELOAD : flags;
  }

  /**
   * Своя желейка и интерфейс набора: модель, перезарядка, натяжение, дуга ведёрка или стрелы, карточки.
   * s — предсказанное состояние, alive / phase — свои, hud — панель бойца.
   */
  updateLocal(av: Avatar, s: PlayerState, alive: boolean, shielded: boolean, phase: number, tick: number, blocked: boolean, endShown: boolean, hud: P4Hud, dt: number, aim: { yaw: number; pitch: number; ex: number; ey: number; ez: number; dx: number; dy: number; dz: number } | null): void {
    const rig = this.rigOf(av, this.myTeam);
    const kit = this.kit;
    rig.setKit(kit);
    const spec = KITS[kit];
    if (blocked || !alive) this.cancelHold();
    // перезарядка и натяжение
    const awp = s.awp > 0;
    if (kit === KIT_BOW) {
      const draw = Math.min(1, s.bloom / BOW_DRAW_TICKS);
      rig.setDraw(alive ? draw : 0);
      if (draw > 0 && this.drawPrev === 0) this.sfx.creak();
      this.drawPrev = draw;
    } else {
      rig.setReload(s.reloadT > 0 ? Math.max(0, Math.min(1, 1 - s.reloadT / spec.reload)) : null);
      rig.setLevel(spec.mag > 0 ? s.ammo / spec.mag : 1);
    }
    rig.holdBucket(this.gHeld && alive);
    rig.update(dt);

    // дуга: ведёрко (держу G) или стрела (тяну лук)
    const fx = this.fx;
    if (alive && this.gHeld && phase === PHASE_PLAY && aim) {
      const n = bucketArc(s.x, s.y, s.z, aim.yaw, aim.pitch, this.d.collision, arcPts);
      const ok = tick >= this.bucketReady;
      fx.setArc(arcPts, n, arcPts[(n - 1) * 3], arcPts[(n - 1) * 3 + 1], arcPts[(n - 1) * 3 + 2], ok, 3.2);
    } else if (alive && kit === KIT_BOW && !awp && s.bloom > 0 && aim) {
      const n = bowArc(aim.ex, aim.ey, aim.ez, aim.dx, aim.dy, aim.dz, arrowSpeed(Math.max(0.2, s.bloom / BOW_DRAW_TICKS)), this.d.collision, arcPts);
      fx.setArc(arcPts, n, arcPts[(n - 1) * 3], arcPts[(n - 1) * 3 + 1], arcPts[(n - 1) * 3 + 2], s.bloom >= BOW_DRAW_TICKS, 0);
    } else {
      fx.hideArc();
    }

    // карточки: разминка, пока сбит и сразу после появления (под защитой, до первого выстрела) — не в итогах
    const mode = endShown || phase === PHASE_END ? null : !alive ? 'down' : phase === PHASE_WARMUP ? 'warmup' : shielded && !blocked ? 'spawn' : null;
    this.cards.show(mode, this.d.locked());
    this.cards.setSelected(kit);

    // панель бойца: набор, ведёрко, патроны (у лука — сила натяжения)
    hud.p4Kit?.(KIT_ICON[kit], spec.name);
    const left = Math.max(0, Math.ceil((this.bucketReady - tick) / TICK_RATE));
    hud.p4Bucket?.(left === 0, left);
    if (!awp && kit === KIT_BOW) {
      const draw = Math.min(1, s.bloom / BOW_DRAW_TICKS);
      if (s.fireCd > 0) hud.p4Ammo?.('<small>стрела</small>…', 1 - s.fireCd / spec.interval, 'info');
      else if (draw > 0) hud.p4Ammo?.(`${Math.round(draw * 100)}<small>%</small>`, draw, draw >= 1 ? 'gold' : '');
      else hud.p4Ammo?.('<small>зажми</small>', 0, '');
    }
  }

  /** Разброс для прицела: у наборов свой (у лука сходится, пока тянешь) */
  spread(s: PlayerState, ads: boolean): number {
    return this.kit === KIT_MARKER || s.awp > 0 ? currentSpread(s, ads) : kitSpread(this.kit, s, ads);
  }

  /** Обёртка включена (набор не маркер и не AWP) */
  wrapped(s: PlayerState): boolean {
    return this.kit !== KIT_MARKER && s.awp === 0;
  }

  update(dt: number): void {
    this.fx.update(dt);
  }

  clear(): void {
    this.fx.clear();
  }
}

/** Патроны набора для панели (магазин и перезарядка) */
export function kitMag(kit: number): { mag: number; reload: number } {
  const s = KITS[kitOf(kit)];
  return { mag: s.mag, reload: s.reload };
}
