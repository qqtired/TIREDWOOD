// «Крепость 50» на клиенте: участки стены (вид, коллизия, HUD и мини-карта), камни со стены, ремонт стены, лагерь
// Барона с катапультой и поджог. Матч (match.ts) создаёт это по первому {t:'f50'} и передаёт сюда состояние, события
// Ф50 из fev, нажатие и отпускание E, кадр. Решает сервер: здесь только вид, подсказки и отправка {t:'use'}.
import * as THREE from 'three';
import { TICK_RATE } from '../../../shared/constants.ts';
import { FT_END, FT_WAVE, type FortEvent } from '../../../shared/fort.ts';
import {
  CAMP_BURN_R, CAMP_BURN_TICKS, CATA_PLAYER_R, STONE_REACH, USE_CAMP_BURN, USE_CAMP_STOP, USE_STONE, USE_WALL_FIX, USE_WALL_STOP,
  WALL_FIX_BELOW, WALL_FIX_REACH, WALL_SECTIONS, WS_BREACH, WS_RUIN, holeCenter, sectionOfTower, wallFixPrice, wallFixTicks, wallStage,
  type F50Camp, type F50State, type Fort50Event,
} from '../../../shared/fort50.ts';
import { FT_BREAK, FT_GATHER } from '../../../shared/fort.ts';
import { WALL_H, outsideFort, type FortMap } from '../../../shared/fortmap.ts';
import type { CollisionWorld } from '../../../shared/world.ts';
import type { Sound } from '../../audio.ts';
import type { Net } from '../../net.ts';
import type { Avatar } from '../../render/avatar.ts';
import { softDot } from '../../render/textures.ts';
import type { FortHud } from '../hud.ts';
import type { FortWorld } from '../world.ts';
import { Camp3D } from './camp3d.ts';
import { F50Sfx } from './sfx.ts';
import { WallsView } from './walls3d.ts';
import { setLastWave } from '../ui/schedule.ts';
import { FORT_LAST_WAVE } from '../../../shared/fortwaves.ts';

const F50_KINDS = new Set(['whit', 'wstage', 'stone', 'camp', 'cata', 'catahit']);

export interface F50Deps {
  world: FortWorld;
  map: FortMap;
  collision: CollisionWorld;
  hud: FortHud;
  sound: Sound;
  net: Net;
  /** Оценка текущего тика сервера */
  est: () => number;
  myId: () => number;
  /** Желейка игрока (своя — тоже) или null */
  avatarOf: (pid: number) => Avatar | null;
}

/** Что сделает E здесь: камень, ремонт, поджог */
type Action =
  | { k: 'stone'; sec: number; left: number }
  | { k: 'fix'; sec: number; price: number; joined: boolean; breach: boolean; pct: number }
  | { k: 'camp'; busy: boolean };

interface Shot { sec: number; fireAt: number; landAt: number; to: THREE.Vector3; fired: boolean; ring: THREE.Mesh }

export class Fort50Client {
  readonly walls: WallsView;
  readonly camp: Camp3D;
  private readonly sfx: F50Sfx;
  private d: F50Deps;
  private st: F50State | null = null;
  /** Включены ли боксы участка в коллизии (пролом — выключены) */
  private readonly solid = WALL_SECTIONS.map(() => true);
  private action: Action | null = null;
  /** Что держим на E: ремонт стены или поджог */
  private holding: 'fix' | 'camp' | null = null;
  private torchPid = 0;
  private readonly hidden: THREE.Object3D[] = [];
  private readonly shots: Shot[] = [];
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly ringGeo = new THREE.PlaneGeometry(CATA_PLAYER_R * 2, CATA_PLAYER_R * 2);
  private t = 0;
  private first = true;

  constructor(d: F50Deps) {
    this.d = d;
    const scene = d.world.scene;
    this.walls = new WallsView(scene, d.world.castle);
    this.camp = new Camp3D(scene);
    this.sfx = new F50Sfx(d.sound);
    this.walls.onSound = (kind, x, y, z) => this.sfx.wall(kind, x, y, z);
    this.camp.onSound = (kind, x, y, z) => this.sfx.camp(kind, x, y, z);
    this.ringMat = new THREE.MeshBasicMaterial({
      map: softDot('rgba(224,73,47,0.0)', 'rgba(224,73,47,0.75)'), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, toneMapped: false,
    });
  }

  private tAt(tick: number): number {
    return this.t + (tick - this.d.est()) / TICK_RATE;
  }

  // ------------------------------------------------------------ сеть

  onState(st: F50State): void {
    this.st = st;
    this.walls.setState(st);
    const { collision, map } = this.d;
    for (let sec = 0; sec < WALL_SECTIONS.length; sec++) {
      const on = (st.hp[sec] ?? 1) > 0;
      if (on === this.solid[sec]) continue;
      this.solid[sec] = on;
      for (const i of map.sections?.[sec] ?? []) collision.setEnabled(i, on);
    }
    this.setCamp(st.camp, this.first);
    this.first = false;
    this.d.hud.setWalls(st.hp, st.max, st.camp);
  }

  private setCamp(camp: F50Camp | null, instant: boolean): void {
    this.camp.set(camp, this.t, instant);
    if (instant && camp?.burn && !camp.burnt) {
      this.camp.burnStart(this.t, this.tAt(camp.burn[1]));
      this.holdTorch(camp.burn[0]);
    }
    if (!camp || camp.burnt || !camp.burn) this.holdTorch(0);
  }

  /** Событие Ф50 из fev: true — наше */
  onEvent(e: FortEvent): boolean {
    if (!F50_KINDS.has(e[0] as string)) return false;
    const ev = e as Fort50Event;
    const hud = this.d.hud;
    switch (ev[0]) {
      case 'whit':
        this.walls.hit(ev[1], ev[2], ev[3], ev[4]);
        hud.hurtWall(ev[1]);
        break;
      case 'wstage': {
        const [, sec, stage, by] = ev;
        this.walls.stage(sec, stage, by);
        const s = WALL_SECTIONS[sec];
        if (!s) break;
        if (stage === WS_BREACH && !by) hud.alert(s.kind === 'passage' ? `Пролом: ${s.name} — враги идут в дыру` : `Обвал: ${s.name} — башня молчит`, 3600);
        break;
      }
      case 'stone': {
        const [, sec, pid, x, z, kills] = ev;
        this.walls.stoneLand(sec, x, z, kills);
        if (pid === this.d.myId() && kills > 0) hud.alert(`Камень: сбито ${kills}`, 1400);
        break;
      }
      case 'camp': {
        const [, what, a, b] = ev;
        if (what === 0) hud.alert(`Барон ставит лагерь на ${a < 0 ? 'западе' : 'востоке'} — сожги, пока не собрал катапульту`, 4200);
        else if (what === 1 && a === 3) hud.alert('Катапульта Барона готова — бьёт по стенам', 3600);
        else if (what === 2) {
          this.camp.burnt(this.t);
          this.holdTorch(0);
          // сожгли до выстрела — метка с участка уходит (уже летящий камень долетит)
          for (let i = this.shots.length - 1; i >= 0; i--) if (!this.shots[i].fired) this.dropShot(i);
          hud.alert(b > 0 ? `Лагерь сожжён · сундук: +${b} 💰 каждому` : 'Лагерь сожжён', 3600);
        } else if (what === 3) {
          this.camp.set(null, this.t);
          this.holdTorch(0);
          this.clearShots();
        } else if (what === 4) {
          const av = this.d.avatarOf(a);
          const at = av ? { x: av.root.position.x, z: av.root.position.z } : undefined;
          this.camp.burnStart(this.t, this.tAt(b), at);
          this.holdTorch(a);
        } else if (what === 5) {
          this.camp.burnCancel();
          this.holdTorch(0);
        }
        break;
      }
      case 'cata': {
        const [, sec, fireTick, landTick, x, y, z] = ev;
        const to = new THREE.Vector3(x, y, z);
        const fireAt = this.tAt(fireTick);
        this.camp.windup(this.t, fireAt, to);
        // метка на земле под участком: сюда прилетит (40 урона тем, кто рядом)
        const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, 0.04, z);
        ring.renderOrder = 3;
        this.d.world.scene.add(ring);
        this.shots.push({ sec, fireAt, landAt: this.tAt(landTick), to, fired: false, ring });
        const s = WALL_SECTIONS[sec];
        if (s) hud.alert(`Катапульта целит: ${s.name}`, 2400);
        break;
      }
      case 'catahit': {
        const [, sec, x, y, z] = ev;
        this.walls.hit(sec, x, y, z);
        const fx = this.d.world.castle.fx;
        fx.puff(x, y, z, 7, 1.2, 1.4, 0.5, 1.8, new THREE.Color(0xd8c4a2), 0.6);
        this.sfx.wall('cata', x, y, z);
        const i = this.shots.findIndex((s) => s.sec === sec);
        if (i >= 0) this.dropShot(i);
        hud.hurtWall(sec);
        break;
      }
    }
    return true;
  }

  private dropShot(i: number): void {
    this.shots[i].ring.removeFromParent();
    this.shots.splice(i, 1);
  }

  private clearShots(): void {
    while (this.shots.length) this.dropShot(0);
  }

  // ------------------------------------------------------------ факел в руке у поджигающего

  private holdTorch(pid: number): void {
    if (pid === this.torchPid) return;
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
    const torch = this.camp.torch();
    torch.removeFromParent();
    this.torchPid = pid;
    if (!pid) return;
    const av = this.d.avatarOf(pid);
    const node = (av as unknown as { gun: { node: THREE.Object3D; marker: THREE.Object3D[] } | null } | null)?.gun?.node;
    if (!node) return;
    // ствол прячем, факел — в той же руке
    for (const c of node.children) {
      if (c.visible && (c as THREE.Mesh).isMesh !== true) {
        c.visible = false;
        this.hidden.push(c);
      }
    }
    for (const m of (av as unknown as { gun: { marker: THREE.Object3D[] } }).gun.marker) {
      if (m.visible) {
        m.visible = false;
        this.hidden.push(m);
      }
    }
    torch.position.set(0.02, -0.1, -0.05);
    torch.rotation.set(-0.5, 0, 0);
    node.add(torch);
  }

  // ------------------------------------------------------------ кадр, подсказки, E

  frame(dt: number, t: number, me: { x: number; y: number; z: number }, alive: boolean, phase: number, wave: number, cam: THREE.Vector3): void {
    this.t = t;
    this.sfx.listener(cam.x, cam.y, cam.z);
    this.walls.update(dt, t);
    this.camp.update(dt, t);
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      if (!s.fired && t >= s.fireAt) {
        s.fired = true;
        this.camp.fire(s.to, t, s.landAt);
      }
      const k = 0.75 + 0.25 * Math.sin(t * 9);
      s.ring.scale.setScalar(t < s.fireAt ? 0.6 + 0.4 * Math.min(1, (t - (s.fireAt - 2.5)) / 2.5) : 1);
      (s.ring.material as THREE.MeshBasicMaterial).opacity = k;
      if (t > s.landAt + 1.5) this.dropShot(i);
    }
    const est = this.d.est();
    for (const f of this.st?.fix ?? []) this.walls.fixProgress(f[0], 1 - (f[2] - est) / wallFixTicks(Math.max(1, f.length - 5)));
    this.action = alive && phase !== FT_END ? this.pick(me, phase, wave) : null;
    // держим E, а ремонт или поджог уже не наш — отпускаем
    if (this.holding === 'fix' && !this.myFix()) this.holding = null;
  }

  private pick(me: { x: number; y: number; z: number }, phase: number, wave: number): Action | null {
    const st = this.st;
    if (!st) return null;
    // камень: на ходу по стене у штабеля, в бою
    if (phase === FT_WAVE && me.y > WALL_H - 0.6) {
      for (let sec = 0; sec < WALL_SECTIONS.length; sec++) {
        const [x, y, z] = WALL_SECTIONS[sec].stack;
        if ((st.hp[sec] ?? 0) <= 0 || Math.hypot(me.x - x, me.z - z) > STONE_REACH || Math.abs(me.y - y) > 1.2) continue;
        return { k: 'stone', sec, left: st.stones[sec] ?? 0 };
      }
    }
    // ремонт: ближайший повреждённый участок в досягаемости (пролом — первым)
    let best: Action | null = null;
    let bd = Infinity;
    if (me.y <= WALL_H + 1.2) {
      for (let sec = 0; sec < WALL_SECTIONS.length; sec++) {
        const hp = st.hp[sec] ?? 0;
        const max = st.max[sec] ?? 1;
        if (hp >= max * WALL_FIX_BELOW) continue;
        const c = holeCenter(sec);
        const dist = Math.hypot(me.x - c.x, me.z - c.z);
        if (dist > WALL_FIX_REACH - 0.15) continue;
        const score = dist - (hp <= 0 ? 10 : 0);
        if (score >= bd) continue;
        const fix = st.fix.find((f) => f[0] === sec);
        bd = score;
        best = { k: 'fix', sec, price: fix ? 0 : wallFixPrice(phase === FT_BREAK ? wave + 1 : wave), joined: !!fix, breach: hp <= 0, pct: Math.round((hp / max) * 100) };
      }
    }
    if (best) return best;
    // лагерь: снаружи, рядом с центром, не сожжён
    const camp = st.camp;
    if (camp && !camp.burnt && outsideFort(me.x, me.y, me.z) && Math.hypot(me.x - camp.x, me.z - camp.z) <= CAMP_BURN_R - 0.15) {
      return { k: 'camp', busy: !!camp.burn && camp.burn[0] !== this.d.myId() };
    }
    return null;
  }

  /** Мой идущий ремонт: [участок, доля, тик конца] или null */
  private myFix(): [number, number, number] | null {
    const me = this.d.myId();
    for (const f of this.st?.fix ?? []) {
      if (f.slice(5).includes(me)) return [f[0], Math.max(f[1] / 1000, 1 - (f[2] - this.d.est()) / wallFixTicks(f.length - 5)), f[2]];
    }
    return null;
  }

  /** Подсказка: текст, цена (0 — без), сработает ли E; null — сказать нечего */
  hint(phase: number): [string, number, boolean] | null {
    const a = this.action;
    if (!a) return null;
    if (a.k === 'stone') {
      return a.left > 0 ? [`сбросить камень на врагов под стеной · ещё ${a.left}`, 0, true] : ['камни кончились — новые в передышке', 0, false];
    }
    if (a.k === 'camp') {
      if (a.busy) return ['лагерь уже поджигают', 0, false];
      return this.holding === 'camp' ? ['поджигаешь — стой рядом, не стреляй', 0, false] : ['поджечь лагерь Барона · держи E 3 с', 0, true];
    }
    const name = WALL_SECTIONS[a.sec].name;
    const mine = this.myFix();
    if (mine && mine[0] === a.sec) return ['чиним — стой, не стреляй', 0, false];
    const calm = phase === FT_BREAK || phase === FT_GATHER;
    const what = a.breach ? (WALL_SECTIONS[a.sec].kind === 'passage' ? 'заделать пролом' : 'отстроить бруствер') : `подлатать стену ${a.pct}%`;
    if (a.joined) return [`помочь: ${what} · держи E`, 0, true];
    return [`${what} · ${name}${calm ? '' : ' · держи E'}`, a.price, true];
  }

  /** E нажата: true — это наше действие (отправлено) */
  useDown(): boolean {
    const a = this.action;
    if (!a) return false;
    const net = this.d.net;
    if (a.k === 'stone') {
      if (a.left > 0) net.send({ t: 'use', id: USE_STONE + a.sec });
      return true;
    }
    if (a.k === 'camp') {
      if (!a.busy) {
        net.send({ t: 'use', id: USE_CAMP_BURN });
        this.holding = 'camp';
      }
      return true;
    }
    net.send({ t: 'use', id: USE_WALL_FIX + a.sec });
    this.holding = 'fix';
    return true;
  }

  /** E отпущена: держали ремонт или поджог — стоп */
  useUp(): void {
    if (this.holding === 'fix') this.d.net.send({ t: 'use', id: USE_WALL_STOP });
    else if (this.holding === 'camp') this.d.net.send({ t: 'use', id: USE_CAMP_STOP });
    this.holding = null;
  }

  /** Полоса работы: [секунд до конца, доля, подпись, значок] — свой ремонт стены или поджог; null — нет */
  progress(): [number, number, string, string] | null {
    const est = this.d.est();
    const fix = this.myFix();
    if (fix) return [Math.max(0, (fix[2] - est) / TICK_RATE), fix[1], 'Ремонт', 'hammer'];
    const burn = this.st?.camp?.burn;
    if (burn && burn[0] === this.d.myId()) {
      const left = Math.max(0, burn[1] - est);
      return [left / TICK_RATE, 1 - left / CAMP_BURN_TICKS, 'Поджог', 'brazier'];
    }
    return null;
  }

  /** Башня на месте spot молчит: её участок разрушен */
  towerLocked(spot: number): boolean {
    const sec = sectionOfTower(spot);
    return sec >= 0 && (this.st?.hp[sec] ?? 1) <= 0;
  }

  /** Стадия участка (для подписей) */
  stageOf(sec: number): number {
    return this.st ? wallStage(this.st.hp[sec] ?? 1, this.st.max[sec] ?? 1) : 0;
  }

  /** Есть ли обвал зубцов (для подсказок) */
  ruined(sec: number): boolean {
    return this.stageOf(sec) === WS_RUIN;
  }

  /** Для проверок (?debug → __opus.state().f50) */
  debug(phase: number): Record<string, unknown> {
    return {
      hp: this.st?.hp, stones: this.st?.stones, fix: this.st?.fix, camp: this.st?.camp, action: this.action, hint: this.hint(phase),
      holding: this.holding, progress: this.progress(), view: this.walls.info(), camp3d: this.camp.info(),
    };
  }

  /** Новое посещение крепости: та же сцена, новый матч */
  bind(d: F50Deps): void {
    this.d = d;
  }

  /** Ушли из крепости: всё целое к следующему разу, финал — снова как без флага, пока сервер не скажет */
  leave(): void {
    this.reset();
    this.first = true;
    this.st = null;
    this.d.hud.setWalls(WALL_SECTIONS.map(() => 1), WALL_SECTIONS.map(() => 1), null);
    setLastWave(FORT_LAST_WAVE);
  }

  /** Новая игра: стены целые, лагеря нет */
  reset(): void {
    this.walls.reset();
    this.camp.set(null, this.t, true);
    this.holdTorch(0);
    this.clearShots();
    this.holding = null;
    for (let sec = 0; sec < WALL_SECTIONS.length; sec++) {
      if (this.solid[sec]) continue;
      this.solid[sec] = true;
      for (const i of this.d.map.sections?.[sec] ?? []) this.d.collision.setEnabled(i, true);
    }
  }

  dispose(): void {
    this.reset();
    this.walls.dispose();
    this.camp.dispose();
    this.ringGeo.dispose();
    this.ringMat.map?.dispose();
    this.ringMat.dispose();
  }
}
