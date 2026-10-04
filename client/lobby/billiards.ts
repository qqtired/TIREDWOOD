// Бильярд на клиенте: стол с сервера → 3D и панель, удар с сервера → анимация тем же расчётом (shared/billiards.ts),
// прицел курсором у своего стола, сила — протяжкой мыши (или удержанием пробела), кий бьющего — зрителям рядом.
// Ничего не решает сам: шлёт только угол и силу, конечные позиции шаров — из стола, присланного сервером.
import * as THREE from 'three';
import {
  BL_R, BL_SURFACE_Y, BL_TABLES, BL_TABLE_COUNT, SIM_FRAME_STEPS, SIM_HZ, packBalls, simulate, unpackBalls, type BlShotWire, type BlTableView,
} from '../../shared/billiards.ts';
import type { ClientMsg, ServerMsg } from '../../shared/messages.ts';
import type { Sound } from '../audio.ts';
import { Billiards3D } from './billiards3d.ts';
import { BilliardsHud, type BlHudAction } from './billiardshud.ts';
import type { SignModel } from './tablesign.ts';

/** Кадров анимации в секунду (шагов физики на кадр — SIM_FRAME_STEPS) */
const FPS = SIM_HZ / SIM_FRAME_STEPS;
/** Сила по протяжке: столько пикселей — полный удар */
const DRAG_FULL_PX = 230;
/** Пробел: шкала туда и обратно за столько секунд */
const SWING_S = 1.6;
/** Дальше этого анимацию удара не считаем — сразу итог */
const ANIM_FAR = 45;
/** Кий бьющего — зрителям не чаще, мс */
const AIM_SEND_MS = 120;
const REMOTE_AIM_MS = 2500;

interface Anim {
  n: number;
  frames: Float32Array;
  masks: Uint16Array;
  count: number;
  t0: number;
  /** f — кадр, k: 0 — шар о шар, 1 — о борт, 2 — в лузу; v — сила; b — шар */
  events: Array<{ f: number; k: 0 | 1 | 2; v: number; b: number }>;
  ei: number;
  end: { pos: number[]; on: number };
}

export interface BilliardsDeps {
  scene: THREE.Scene;
  hudRoot: HTMLElement;
  canvas: HTMLCanvasElement;
  camera(): THREE.PerspectiveCamera;
  send(msg: ClientMsg): void;
  me(): { pid: number; tokens: number };
  sound: Sound;
  /** Столы и столбы навеса твёрдые (флаг сервера) */
  setSolid(on: boolean): void;
  /** Встать из-за стола */
  leave(): void;
  /** Мышь свободна и не занята чатом/меню */
  pointerFree(): boolean;
  /** Тени статичные: появился или пропал зал — пересчитать */
  refreshShadows(): void;
}

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(BL_SURFACE_Y + BL_R));
const _hit = new THREE.Vector3();

export class BilliardsClient {
  readonly view3d: Billiards3D;
  readonly hud: BilliardsHud;
  /** Бильярд есть на сервере (пришёл хоть один стол) */
  on = false;
  private readonly d: BilliardsDeps;
  private readonly views: Array<BlTableView | null> = Array.from({ length: BL_TABLE_COUNT }, () => null);
  private readonly anims: Array<Anim | null> = Array.from({ length: BL_TABLE_COUNT }, () => null);
  private readonly remoteAim: Array<{ ang: number; pw: number; at: number } | null> = Array.from({ length: BL_TABLE_COUNT }, () => null);
  private readonly recvAt: number[] = Array.from({ length: BL_TABLE_COUNT }, () => 0);
  private table = -1;
  private side = -1;
  private ang = 0;
  private aimValid = false;
  private charging: 'mouse' | 'key' | null = null;
  private power = 0;
  private dragX = 0;
  private dragY = 0;
  private keyT0 = 0;
  /** Отправленный удар (номер стола до него), пока сервер не ответил; −1 — нет */
  private pending = -1;
  private pendingAt = 0;
  /** Кий после удара: короткий тычок вперёд, мс */
  private strokeAt = 0;
  private aimSentAt = 0;
  private aimSent = '';
  private resultKey = '';
  private readonly camPos = new THREE.Vector3();

  constructor(d: BilliardsDeps) {
    this.d = d;
    this.view3d = new Billiards3D(d.scene);
    this.hud = new BilliardsHud(d.hudRoot);
    this.hud.onAction = (act) => this.act(act);
    this.hud.onLeave = () => d.leave();
    d.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    d.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    d.canvas.addEventListener('contextmenu', (e) => {
      if (this.seated) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && this.charging === 'key') this.release();
    });
  }

  get seated(): boolean {
    return this.table >= 0;
  }

  /** В партии: шаги не поднимают из-за стола (выйти — Esc). */
  get locked(): boolean {
    const v = this.seated ? this.views[this.table] : null;
    return !!v && v.phase === 'match' && v.seats[this.side]?.pid === this.d.me().pid;
  }

  get myTable(): number {
    return this.table;
  }

  // ------------------------------------------------------------ сообщения

  onMessage(msg: ServerMsg): boolean {
    switch (msg.t) {
      case 'bl':
        this.onView(msg.v);
        return true;
      case 'blShot':
        this.onShot(msg.s);
        return true;
      case 'blAim':
        if (msg.table >= 0 && msg.table < BL_TABLE_COUNT && msg.table !== this.table) this.remoteAim[msg.table] = { ang: msg.ang, pw: msg.pw, at: performance.now() };
        return true;
      case 'blErr':
        if (msg.table === this.table || msg.table < 0) {
          this.hud.error(msg.text);
          this.pending = -1;
        }
        return true;
    }
    return false;
  }

  private onView(v: BlTableView): void {
    if (v.table < 0 || v.table >= BL_TABLE_COUNT) return;
    if (!this.on) {
      this.on = true;
      this.view3d.setVisible(true);
      this.d.setSolid(true);
      this.d.refreshShadows();
    }
    this.views[v.table] = v;
    this.recvAt[v.table] = performance.now();
    if (!this.anims[v.table]) this.view3d.setBalls(v.table, v.pos, v.on, true);
    if (this.pending >= 0 && v.table === this.table && v.shot !== this.pending) this.pending = -1;
    this.view3d.setSign(v.table, this.sign(v));
    if (v.table === this.table) {
      this.hud.setView(v);
      this.hud.setBalance(this.d.me().tokens);
      const mine = v.seats[this.side]?.pid === this.d.me().pid;
      const key = `${v.table}:${v.shot}:${v.winner}`;
      if (v.phase === 'result' && mine && key !== this.resultKey) {
        this.resultKey = key;
        if (v.winner === this.side) this.d.sound.tableWin(v.bet > 0);
        else this.d.sound.tableLose();
      }
    }
  }

  private onShot(s: BlShotWire): void {
    if (s.table < 0 || s.table >= BL_TABLE_COUNT) return;
    this.remoteAim[s.table] = null;
    if (s.table === this.table) {
      this.pending = -1;
      this.charging = null;
      this.hud.setPower(null);
    }
    const t = BL_TABLES[s.table];
    const far = Math.hypot(this.camPos.x - t.x, this.camPos.z - t.z) > ANIM_FAR;
    if (far || document.hidden) {
      this.anims[s.table] = null;
      return;
    }
    const balls = unpackBalls(s.pos, s.on);
    const frames: number[] = [];
    const masks: number[] = [];
    const push = () => {
      for (const b of balls) frames.push(b.x, b.z);
      let m = 0;
      balls.forEach((b, i) => { if (b.on) m |= 1 << i; });
      masks.push(m);
    };
    push();
    const events: Anim['events'] = [];
    const f = (step: number) => Math.ceil(step / SIM_FRAME_STEPS);
    const res = simulate(balls, s.vx, s.vz, {
      hit: (step, _a, b, v) => { if (v > 0.05) events.push({ f: f(step), k: 0, v, b }); },
      rail: (step, a, v) => { if (v > 0.08) events.push({ f: f(step), k: 1, v, b: a }); },
      pot: (step, a) => events.push({ f: f(step), k: 2, v: 1, b: a }),
    }, push);
    if (res.steps !== s.steps) console.warn(`[бильярд] стол ${s.table + 1}: удар ${s.n} — у сервера ${s.steps} шагов, у нас ${res.steps}`);
    this.anims[s.table] = {
      n: s.n, frames: new Float32Array(frames), masks: new Uint16Array(masks), count: masks.length, t0: performance.now(),
      events, ei: 0, end: packBalls(balls),
    };
    if (s.table === this.table) this.hud.setAnimating(true);
    // тычок кия и «тук» — у всех, кто рядом
    const cue = this.worldOf(s.table, s.pos[0], s.pos[1]);
    const pw = Math.min(1, Math.hypot(s.vx, s.vz) / 5);
    this.d.sound.blCue(s.table === this.table ? null : cue, pw);
    this.strokeAt = s.table === this.table ? performance.now() : this.strokeAt;
  }

  // ------------------------------------------------------------ свой стол

  /** Сцена: встал к столу (table, side) или отошёл (−1). */
  setSeat(table: number, side: number): void {
    if (table === this.table && side === this.side) return;
    this.charging = null;
    this.pending = -1;
    this.hud.setPower(null);
    if (this.table >= 0) {
      this.view3d.setCue(this.table, false, 0, 0);
      this.view3d.setAim(this.table, false, 0);
    }
    this.table = table;
    this.side = side;
    if (table < 0) {
      this.hud.hide();
      return;
    }
    // прицел по умолчанию — вдоль стола, к пирамиде
    this.ang = 0;
    this.aimValid = true;
    this.hud.show(table, side, this.d.me().pid);
    this.hud.setBalance(this.d.me().tokens);
    const v = this.views[table];
    if (v) this.hud.setView(v);
  }

  setBalance(n: number): void {
    this.hud.setBalance(n);
  }

  private act(a: BlHudAction): void {
    if (this.table < 0) return;
    this.d.send({ t: 'bl', table: this.table, ...a } as ClientMsg);
  }

  /** Можно бить: свой стол, шары стоят, не ждём ответа, в партии — свой ход. */
  private canShoot(now = performance.now()): boolean {
    const v = this.table >= 0 ? this.views[this.table] : null;
    if (!v || this.anims[this.table] || this.pending >= 0 || v.phase === 'result' || !(v.on & 1)) return false;
    if (v.rolling - (now - this.recvAt[this.table]) > 0) return false;
    return v.phase === 'open' || (v.phase === 'match' && v.turn === this.side);
  }

  private cueLocal(): { x: number; z: number } | null {
    const v = this.views[this.table];
    return v && (v.on & 1) ? { x: v.pos[0], z: v.pos[1] } : null;
  }

  private aimAt(clientX: number, clientY: number): void {
    const cue = this.cueLocal();
    if (!cue) return;
    const rect = this.d.canvas.getBoundingClientRect();
    _ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    _ray.setFromCamera(_ndc, this.d.camera());
    if (!_ray.ray.intersectPlane(_plane, _hit)) return;
    const t = BL_TABLES[this.table];
    const dx = _hit.x - t.x - cue.x, dz = _hit.z - t.z - cue.z;
    if (dx * dx + dz * dz < 1e-6) return;
    this.ang = Math.atan2(dx, dz);
    this.aimValid = true;
  }

  private onMove(e: PointerEvent): void {
    if (!this.seated || !this.d.pointerFree()) return;
    if (this.charging === 'mouse') {
      this.power = Math.min(1, Math.hypot(e.clientX - this.dragX, e.clientY - this.dragY) / DRAG_FULL_PX);
      return;
    }
    if (this.canShoot()) this.aimAt(e.clientX, e.clientY);
  }

  private onDown(e: PointerEvent): void {
    if (!this.seated || !this.d.pointerFree()) return;
    if (e.button === 2) {
      this.cancelCharge();
      return;
    }
    if (e.button !== 0 || !this.canShoot()) return;
    // касание пальцем: сначала прицел туда, где коснулся
    if (e.pointerType === 'touch') this.aimAt(e.clientX, e.clientY);
    if (!this.aimValid) return;
    this.charging = 'mouse';
    this.power = 0;
    this.dragX = e.clientX;
    this.dragY = e.clientY;
    // замах тянут вниз — через панель стола: без захвата холст перестаёт слышать мышь у её края и сила не растёт
    try {
      this.d.canvas.setPointerCapture(e.pointerId);
    } catch {
      // указатель уже отпущен — замах закончится на pointerup как обычно
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.button === 0 && this.charging === 'mouse') this.release();
  }

  private cancelCharge(): void {
    if (!this.charging) return;
    this.charging = null;
    this.power = 0;
    this.hud.setPower(null);
  }

  /** Отпустили: удар, если замахнулись хоть чуть-чуть. */
  private release(): void {
    const pw = this.power;
    this.charging = null;
    this.hud.setPower(null);
    if (pw < 0.03 || !this.canShoot()) return;
    const v = this.views[this.table]!;
    this.pending = v.shot;
    this.pendingAt = performance.now();
    this.d.send({ t: 'bl', a: 'shoot', table: this.table, n: v.shot, ang: this.ang, pw });
  }

  /** Клавиши у стола (сцена зовёт первой, пока стоишь у стола). true — съели. */
  onKey(code: string, e: KeyboardEvent): boolean {
    if (!this.seated) return false;
    if (this.hud.typing && code !== 'Escape') return false;
    if (code === 'Escape' && this.charging) {
      this.cancelCharge();
      return true;
    }
    if (code === 'Space') {
      e.preventDefault();
      if (!this.charging && this.canShoot() && this.aimValid) {
        this.charging = 'key';
        this.keyT0 = performance.now();
        this.power = 0;
      }
      return true;
    }
    return this.hud.onKey(code);
  }

  /** Камера у своего стола: высоко со своей стороны, весь стол — над панелью (подобрано под 16:9, стол до 72 % высоты).
   *  На узком экране телефона — с торца у битка, длинной стороной вдоль экрана. */
  cameraPose(): { px: number; py: number; pz: number; lx: number; ly: number; lz: number; fov: number } | null {
    if (!this.seated) return null;
    const t = BL_TABLES[this.table];
    if (this.d.camera().aspect < 0.9) return { px: t.x, py: 2.85, pz: t.z - 1.7, lx: t.x, ly: BL_SURFACE_Y, lz: t.z - 0.95, fov: 50 };
    const sx = this.side === 0 ? -1 : 1;
    return { px: t.x + sx * 1.05, py: 2.65, pz: t.z, lx: t.x + sx * 0.3, ly: BL_SURFACE_Y, lz: t.z, fov: 50 };
  }

  /** Подсказка у стола (E). */
  hint(table: number): string {
    const v = this.views[table];
    if (!v) return 'бильярд';
    const seated = v.seats.filter(Boolean).length;
    if (v.phase === 'match') return `идёт партия ${v.seats[0]?.nick ?? '?'} ${v.score[0]}:${v.score[1]} ${v.seats[1]?.nick ?? '?'}${v.seats.some((s) => s?.pid === this.d.me().pid) ? ' — вернуться' : ''}`;
    if (v.offer && seated < 2) return `принять партию ${v.offer.amount ? `на ${v.offer.amount} 🪙` : 'без ставки'} — ждёт ${v.seats[v.offer.by]?.nick ?? ''}`;
    if (seated >= 2) return 'бильярд — у стола двое';
    return seated ? `бильярд — встать напротив ${v.seats.find(Boolean)?.nick ?? ''}` : 'бильярд — тренировка или партия';
  }

  // ------------------------------------------------------------ кадр

  update(dt: number, time: number, camPos: THREE.Vector3): void {
    this.camPos.copy(camPos);
    const now = performance.now();
    for (let t = 0; t < BL_TABLE_COUNT; t++) this.stepAnim(t, now);
    // свой стол: прицел, кий, шкала
    if (this.seated) {
      if (this.pending >= 0 && now - this.pendingAt > 4000) this.pending = -1;
      if (this.charging === 'key') {
        const ph = ((now - this.keyT0) / 1000 / SWING_S) % 1;
        this.power = ph < 0.5 ? ph * 2 : 2 - ph * 2;
      }
      const can = this.canShoot(now);
      if (!can && this.charging) this.cancelCharge();
      if (this.charging) this.hud.setPower(this.power);
      const stroke = now - this.strokeAt < 160;
      this.view3d.setCue(this.table, (can && this.aimValid) || stroke, this.ang, stroke ? 0 : this.charging ? this.power : 0.08);
      this.view3d.setAim(this.table, can && this.aimValid, this.ang);
      this.hud.setAnimating(!!this.anims[this.table]);
      this.hud.tick(now);
      if (can && now - this.aimSentAt > AIM_SEND_MS) {
        const key = `${this.ang.toFixed(3)}:${this.charging ? this.power.toFixed(2) : '0'}`;
        if (key !== this.aimSent) {
          this.aimSent = key;
          this.aimSentAt = now;
          this.d.send({ t: 'bl', a: 'aim', table: this.table, ang: this.ang, pw: this.charging ? this.power : 0 });
        }
      }
    }
    // чужие столы: кий бьющего, пока он целится
    for (let t = 0; t < BL_TABLE_COUNT; t++) {
      if (t === this.table) continue;
      const a = this.remoteAim[t];
      const show = !!a && now - a.at < REMOTE_AIM_MS && !this.anims[t];
      this.view3d.setCue(t, show, a?.ang ?? 0, a ? Math.max(0.08, a.pw) : 0);
    }
    this.view3d.update(dt, time, camPos);
  }

  private stepAnim(t: number, now: number): void {
    const a = this.anims[t];
    if (!a) return;
    const idx = Math.floor(((now - a.t0) / 1000) * FPS);
    while (a.ei < a.events.length && a.events[a.ei].f <= idx) {
      const e = a.events[a.ei++];
      const k = e.f < a.count ? e.f : a.count - 1;
      const pos = this.worldOf(t, a.frames[k * 32 + e.b * 2], a.frames[k * 32 + e.b * 2 + 1]);
      if (e.k === 0) this.d.sound.blClack(pos, e.v);
      else if (e.k === 1) this.d.sound.blRail(pos, e.v);
      else this.d.sound.blPocket(pos);
    }
    if (idx >= a.count - 1) {
      this.anims[t] = null;
      const v = this.views[t];
      if (v && v.shot >= a.n) {
        if (v.shot === a.n && !samePos(v, a.end)) console.warn(`[бильярд] стол ${t + 1}: удар ${a.n} — позиции разошлись с сервером, берём серверные`);
        this.view3d.setBalls(t, v.pos, v.on, false);
      } else this.view3d.setBalls(t, a.end.pos, a.end.on, false);
      if (t === this.table) this.hud.setAnimating(false);
      return;
    }
    // между кадрами — плавно
    const f = ((now - a.t0) / 1000) * FPS - idx;
    const i0 = idx * 32, i1 = Math.min(a.count - 1, idx + 1) * 32;
    const pos = new Array<number>(32);
    for (let i = 0; i < 32; i++) pos[i] = a.frames[i0 + i] + (a.frames[i1 + i] - a.frames[i0 + i]) * f;
    this.view3d.setBalls(t, pos, a.masks[idx], false);
  }

  private worldOf(t: number, x: number, z: number): [number, number, number] {
    const tb = BL_TABLES[t];
    return [tb.x + x, BL_SURFACE_Y + BL_R, tb.z + z];
  }

  private sign(v: BlTableView): SignModel {
    const seated = v.seats.filter(Boolean).length;
    const names = v.seats.map((s) => s?.nick ?? '—');
    if (v.phase === 'match') {
      return { title: 'БИЛЬЯРД', sub: `${names[0]} — ${names[1]}`, stake: v.bet ? `банк ${v.bet * 2} 🪙` : 'без ставки', seated, seats: 2, state: `${v.score[0]} : ${v.score[1]}`, tone: 'busy' };
    }
    if (v.phase === 'result') {
      return { title: 'БИЛЬЯРД', sub: `${names[0]} — ${names[1]}`, stake: v.bet ? `банк ${v.bet * 2} 🪙` : 'без ставки', seated, seats: 2, state: `победа ${names[v.winner] ?? ''}`, tone: 'busy' };
    }
    if (v.offer) {
      return { title: 'БИЛЬЯРД', sub: `${names[v.offer.by]} ищет соперника`, stake: v.offer.amount ? `ставка ${v.offer.amount} 🪙` : 'без ставки', seated, seats: 2, state: seated < 2 ? 'ждёт' : 'вдвоём', tone: 'wait' };
    }
    return { title: 'БИЛЬЯРД', sub: 'американка · до 8 шаров', stake: seated ? `тренируется ${names.filter((n) => n !== '—').join(', ')}` : 'тренировка — бесплатно', seated, seats: 2, state: seated ? 'занят' : 'свободен', tone: seated ? 'wait' : 'free' };
  }

  /** Ушли с набережной: всё спрятать, кроме самих столов. */
  reset(): void {
    this.setSeat(-1, -1);
    for (let t = 0; t < BL_TABLE_COUNT; t++) {
      this.anims[t] = null;
      this.remoteAim[t] = null;
    }
  }

  /** Сервер выключил бильярд (или вошли туда, где его нет). */
  off(): void {
    if (this.on) this.d.refreshShadows();
    this.on = false;
    this.view3d.setVisible(false);
    this.d.setSolid(false);
    this.views.fill(null);
  }

  debug(): object {
    return {
      on: this.on, table: this.table, side: this.side, ang: +this.ang.toFixed(3), power: +this.power.toFixed(2), charging: this.charging,
      pending: this.pending, can: this.canShoot(), anims: this.anims.map((a) => (a ? a.n : 0)),
      views: this.views.map((v) => (v ? { phase: v.phase, shot: v.shot, score: v.score, turn: v.turn, offer: v.offer, seats: v.seats.map((s) => s?.nick ?? null), note: v.note, bet: v.bet } : null)),
    };
  }
}

function samePos(v: BlTableView, end: { pos: number[]; on: number }): boolean {
  if (v.on !== end.on) return false;
  for (let i = 0; i < 32; i++) if (Math.abs(v.pos[i] - end.pos[i]) > 1e-9) return false;
  return true;
}

