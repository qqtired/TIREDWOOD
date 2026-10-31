// «Банан за катером» у себя (флаг BANANA, shared/banana.ts; сервер — server/lobby/banana.ts). Бананы у всех — по
// сообщениям bn (состав) и bnPos (где банан, толчок, крены седоков, кто сколько держится) — плавно на 3 тика позже
// часов отрисовки, как лодки. Модель и трос — client/boat/bananamodel.ts (две отрисовки на все бананы), позы седоков —
// client/boat/bananapose.ts. Всплеск — bnFx: дуга падения, брызги и звук в момент касания воды.
// Интерфейс: у банана — «E — сесть на банан»; верхом — плашка равновесия (A ◀ ● ▶ D) и «Держишься 0:23»; в воде —
// полоса «5 с» и «E — обратно»; хозяину за штурвалом — «B — банан» в подсказке лодки и строка «На банане: …».
// Сцена набережной (scene.ts) зовёт: welcome, onJson, frame, avatarPose, selfPose, onKey, onUse, boardHint, hint,
// boatHint, debug, reset.
import * as THREE from 'three';
import {
  ACT_BANANA, BN_BACK_TICKS, BN_BOARD_R, BN_BOARD_SPEED, BN_POS_N, BN_SEATS, bnArgOf, bnClock, type BnServerMsg, type BnView,
} from '../../shared/banana.ts';
import { TICK_RATE, WATER_Y } from '../../shared/constants.ts';
import { BOATS } from '../../shared/fishboat.ts';
import { isHeld } from '../../shared/lobby.ts';
import type { ClientMsg } from '../../shared/messages.ts';
import type { Sound } from '../audio.ts';
import type { Input } from '../input.ts';
import type { Avatar, AvatarPose } from '../render/avatar.ts';
import type { HudSlots } from '../ui/kit/slots.ts';
import { keyHtml, meterHtml } from '../ui/kit/dom.ts';
import { escHtml } from '../ui/kit/topcenter.ts';
import { setMeter } from '../ui/kit/modes.ts';
import { BananaFleet, bananaLook, makeLook, type BananaDraw, type BnLook } from './bananamodel.ts';
import { RiderAnim, riderClear, riderPose } from './bananapose.ts';
import type { FleetPose } from './models.ts';
import './banana.css';

const VIEW_DELAY = 3;
const EXTRAPOLATE = 8;

export interface BananaDeps {
  scene: THREE.Scene;
  sound: Sound;
  slots: HudSlots;
  input: Input;
  send: (msg: ClientMsg) => void;
  /** Номер своей желейки в снимке */
  myId: () => number;
  /** Ник по номеру в снимке ('' — нет) */
  nick: (slot: number) => string;
  /** Лодка i на экране (client/boat/ownboats.ts) и я ли за штурвалом своей */
  boatPose: (i: number) => Readonly<FleetPose> | null;
  boatOwner: (i: number) => string;
  myBoat: () => number;
  driving: () => boolean;
  /** Брызги на воде (Effects.waterSplash) */
  splash: (x: number, z: number, big: boolean) => void;
}

interface Sample {
  tick: number;
  x: number;
  z: number;
  yaw: number;
  lat: number;
  tilt: [number, number, number];
  held: [number, number, number];
}

interface Banana {
  v: BnView;
  track: Sample[];
  draw: BananaDraw;
  look: BnLook;
  speed: number;
  lat: number;
  tilt: [number, number, number];
  held: [number, number, number];
  /** Качок после падения: сторона и сколько секунд прошло */
  kick: number;
  kickT: number;
  press: number;
  seed: number;
  /** Прошлая поза (скорость на экране) */
  px: number;
  pz: number;
}

function wrap(a: number): number {
  return a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
}

const _seat = new THREE.Vector3();

export class BananaClient {
  /** Флаг сервера BANANA: пришло сообщение bn */
  enabled = false;
  private readonly d: BananaDeps;
  private readonly fleet: BananaFleet;
  private readonly bananas = new Map<number, Banana>();
  /** Анимация седока — по номеру желейки в снимке */
  private readonly anims = new Map<number, RiderAnim>();
  /** Желейки, которым мы ставили руки и наклон (снять, когда сошли) */
  private readonly posed = new Set<Avatar>();
  private readonly drawList: BananaDraw[] = [];
  private time = 0;
  private renderTick = 0;
  private serverTick = 0;
  private act = 0;
  private arg = 0;
  /** К какому банану относится «E — сесть» (−1 — нет) */
  private target = -1;
  private readonly hud: BananaHud;

  constructor(d: BananaDeps) {
    this.d = d;
    this.fleet = new BananaFleet(d.scene);
    this.hud = new BananaHud(d.slots);
  }

  welcome(): void {
    this.reset();
    this.bananas.clear();
    this.anims.clear();
    this.enabled = false;
    this.fleet.draw([]);
  }

  reset(): void {
    this.hud.hide();
    this.target = -1;
  }

  // ------------------------------------------------------------ сеть

  onJson(msg: BnServerMsg): void {
    if (msg.t === 'bn') this.onRoster(msg.k, msg.b, msg.pos);
    else if (msg.t === 'bnPos') this.onPos(msg.k, msg.p);
    else if (msg.t === 'bnFx') this.onFx(msg);
  }

  private onRoster(k: number, views: BnView[], pos: number[]): void {
    if (!this.enabled) {
      this.enabled = true;
      this.fleet.load();
    }
    this.serverTick = Math.max(this.serverTick, k);
    const seen = new Set<number>();
    for (const v of views) {
      seen.add(v.i);
      let b = this.bananas.get(v.i);
      if (!b) {
        b = {
          v, track: [], draw: { x: 0, y: WATER_Y, z: 0, yaw: 0, look: makeLook(), stern: null, rope: 9 }, look: makeLook(), speed: 0, lat: 0,
          tilt: [0, 0, 0], held: [0, 0, 0], kick: 0, kickT: 9, press: 0, seed: v.i * 1.37, px: NaN, pz: NaN,
        };
        b.draw.look = b.look;
        this.bananas.set(v.i, b);
      } else {
        // сел новый — банан «сминается»
        for (let s = 0; s < BN_SEATS; s++) if (v.s[s] && v.s[s] !== b.v.s[s] && !v.w[s]) b.press = 1;
      }
      b.v = v;
    }
    for (const i of [...this.bananas.keys()]) if (!seen.has(i)) this.bananas.delete(i);
    this.onPos(k, pos, true);
  }

  private onPos(k: number, p: unknown, full = false): void {
    if (!Array.isArray(p)) return;
    this.serverTick = Math.max(this.serverTick, k);
    for (let o = 0; o + BN_POS_N <= p.length; o += BN_POS_N) {
      const a = p.slice(o, o + BN_POS_N) as number[];
      if (a.some((x) => typeof x !== 'number' || !Number.isFinite(x))) continue;
      const b = this.bananas.get(a[0]);
      if (!b) continue;
      const tr = b.track;
      const last = tr[tr.length - 1];
      if (last && k <= last.tick) {
        if (!full && k >= last.tick - 600) continue;
        tr.length = 0;
      }
      tr.push({ tick: k, x: a[1], z: a[2], yaw: a[3], lat: a[4], tilt: [a[5], a[6], a[7]], held: [a[8], a[9], a[10]] });
      if (tr.length > 16) tr.shift();
    }
  }

  private onFx(msg: Extract<BnServerMsg, { t: 'bnFx' }>): void {
    const b = this.bananas.get(msg.i);
    const mine = msg.slot === this.d.myId();
    let a = this.anims.get(msg.slot);
    if (!a) this.anims.set(msg.slot, (a = new RiderAnim()));
    if (msg.a === 'back') {
      const from = a.phase === 'swim' || a.phase === 'fall' ? a.to : null;
      a.back(from?.x ?? msg.x, from?.z ?? msg.z);
      this.d.splash(from?.x ?? msg.x, from?.z ?? msg.z, false);
      this.d.sound.mermaidSplash([from?.x ?? msg.x, WATER_Y, from?.z ?? msg.z]);
      if (b) b.press = 1;
      return;
    }
    // упал или спрыгнул: дуга от места на банане в воду; брызги и звук — когда коснётся воды (frame)
    if (b) {
      this.fleet.seatAt(b.draw, msg.seat, _seat);
      b.kick = msg.side >= 0 ? 0.9 : -0.9;
      b.kickT = 0;
    } else _seat.set(msg.x, WATER_Y + 0.6, msg.z);
    a.fall(_seat, msg.x, msg.z, msg.side);
    void mine;
  }

  /** Верхом на ходу камера сама плавно разворачивается по ходу банана (мышью — осмотреться), как у штурмана лодки */
  frameInput(dt: number, act: number, arg: number): void {
    if (!this.enabled || act !== ACT_BANANA) return;
    const at = bnArgOf(arg);
    const b = this.bananas.get(at.boat);
    if (!b || at.swim) return;
    const k = Math.min(1, b.speed / 6);
    if (k < 0.05) return;
    const inp = this.d.input;
    inp.yaw += wrap(b.draw.yaw - inp.yaw) * (1 - Math.exp(-dt * 1.2 * k));
  }

  // ------------------------------------------------------------ кадр

  frame(dt: number, renderTick: number, act: number, arg: number): void {
    this.act = act;
    this.arg = arg;
    if (!this.enabled) return;
    this.time += dt;
    this.renderTick = renderTick;
    for (const [slot, a] of this.anims) {
      const was = a.phase;
      a.step(dt);
      if (was === 'fall' && a.phase === 'swim' && !a.splashed) {
        a.splashed = true;
        this.d.splash(a.to.x, a.to.z, true);
        this.d.sound.splash(slot === this.d.myId() ? null : [a.to.x, WATER_Y, a.to.z]);
      }
    }
    const list = this.drawList;
    list.length = 0;
    for (const b of this.bananas.values()) {
      this.place(b, dt);
      list.push(b.draw);
    }
    this.fleet.draw(list);
    this.hudUpdate();
  }

  private place(b: Banana, dt: number): void {
    const s = this.sample(b, this.renderTick - VIEW_DELAY);
    const d = b.draw;
    if (s) {
      d.x = s.x;
      d.z = s.z;
      d.yaw = s.yaw;
      b.lat = s.lat;
      b.tilt = s.tilt;
      b.held = s.held;
    }
    if (Number.isFinite(b.px) && dt > 0) {
      const v = Math.hypot(d.x - b.px, d.z - b.pz) / dt;
      b.speed += (Math.min(30, v) - b.speed) * Math.min(1, dt * 4);
    }
    b.px = d.x;
    b.pz = d.z;
    b.kickT += dt;
    const kick = b.kick * Math.exp(-b.kickT * 3.2) * Math.cos(b.kickT * 9);
    b.press = Math.max(0, b.press - dt * 3);
    bananaLook(this.time, b.speed, b.lat, b.seed, kick, b.press, b.look);
    d.y = WATER_Y;
    // трос — от кормы лодки на экране
    const bp = this.d.boatPose(b.v.i);
    if (bp) {
      const kind = BOATS[bp.kind];
      const half = (kind?.length ?? 5) / 2;
      d.stern = d.stern ?? new THREE.Vector3();
      d.stern.set(bp.x + Math.sin(bp.yaw) * half, WATER_Y + 0.42, bp.z + Math.cos(bp.yaw) * half);
    } else d.stern = null;
  }

  private sample(b: Banana, t: number): Sample | null {
    const tr = b.track;
    if (!tr.length) return null;
    const last = tr[tr.length - 1];
    if (t >= last.tick || tr.length === 1) {
      const prev = tr.length > 1 ? tr[tr.length - 2] : last;
      const span = last.tick - prev.tick;
      if (span <= 0 || span > 12 || t <= last.tick) return last;
      const k = Math.min(t - last.tick, EXTRAPOLATE) / span;
      return { ...last, x: last.x + (last.x - prev.x) * k, z: last.z + (last.z - prev.z) * k, yaw: last.yaw + wrap(last.yaw - prev.yaw) * k };
    }
    let a = tr[0];
    let c = a;
    if (t > a.tick) {
      for (let i = 0; i < tr.length - 1; i++) {
        if (tr[i + 1].tick > t) {
          a = tr[i];
          c = tr[i + 1];
          break;
        }
      }
    }
    const k = c.tick > a.tick ? Math.max(0, Math.min(1, (t - a.tick) / (c.tick - a.tick))) : 0;
    const lerp = (x: number, y: number): number => x + (y - x) * k;
    return {
      tick: t, x: lerp(a.x, c.x), z: lerp(a.z, c.z), yaw: a.yaw + wrap(c.yaw - a.yaw) * k, lat: lerp(a.lat, c.lat),
      tilt: [lerp(a.tilt[0], c.tilt[0]), lerp(a.tilt[1], c.tilt[1]), lerp(a.tilt[2], c.tilt[2])], held: k < 0.5 ? a.held : c.held,
    };
  }

  // ------------------------------------------------------------ желейки

  /** Поза желейки на банане (или в воде рядом); не на банане — как пришла (руки и наклон снимаются). */
  avatarPose(av: Avatar, act: number, arg: number, pose: AvatarPose | null): AvatarPose | null {
    // своя желейка в сцене — Avatar(0), в сообщениях — свой номер в снимке
    const key = av.id === 0 ? this.d.myId() : av.id;
    if (!pose || act !== ACT_BANANA || !this.enabled) {
      if (this.posed.delete(av)) {
        riderClear(av);
        this.anims.delete(key);
      }
      return pose;
    }
    const at = bnArgOf(arg);
    const b = this.bananas.get(at.boat);
    if (!b) return pose;
    let a = this.anims.get(key);
    if (!a) {
      a = new RiderAnim();
      if (at.swim) {
        a.phase = 'swim';
        a.to.set(pose.x, WATER_Y, pose.z);
      }
      this.anims.set(key, a);
    }
    // сервер вернул на место, а всплеск «обратно» не дошёл — прыжок из воды; упал без всплеска — сразу в воде
    if (!at.swim && a.phase === 'swim') a.back(pose.x, pose.z);
    if (at.swim && a.phase === 'seat') {
      a.phase = 'swim';
      a.to.set(pose.x, WATER_Y, pose.z);
    }
    this.posed.add(av);
    this.fleet.seatAt(b.draw, at.seat, _seat);
    const swimAt = a.phase === 'swim' ? { x: pose.x, z: pose.z } : null;
    riderPose(av, a, pose, _seat, b.draw.yaw, b.look.roll, b.tilt[at.seat] ?? 0, swimAt, b.draw, this.time);
    return pose;
  }

  /** Своя желейка на банане: поза (для камеры) — true, если поставили */
  selfPose(act: number, arg: number, pose: AvatarPose, me: Avatar): boolean {
    if (act !== ACT_BANANA || !this.enabled) return false;
    return this.avatarPose(me, act, arg, pose) !== null;
  }

  // ------------------------------------------------------------ ввод и подсказки

  /** B у хозяина за штурвалом — прицепить или отцепить банан */
  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    if (!this.enabled || code !== 'KeyB' || !this.d.driving()) return false;
    if (down && !e.repeat) this.d.send({ t: 'bn', a: 'hitch' });
    return true;
  }

  /** E: на банане — спрыгнуть или на берег, в воде — обратно; у банана — сесть. true — съели. */
  onUse(act: number, _arg: number): boolean {
    if (!this.enabled) return false;
    if (act === ACT_BANANA) {
      this.d.send({ t: 'bn', a: 'e' });
      return true;
    }
    if (this.target >= 0 && !isHeld(act)) {
      this.d.send({ t: 'bn', a: 'board', i: this.target });
      return true;
    }
    return false;
  }

  /** У банана (стоишь рядом на причале): подсказка «E — сесть на банан» или null */
  boardHint(x: number, y: number, z: number, act: number): [string[], string] | null {
    this.target = -1;
    if (!this.enabled || isHeld(act) || Math.abs(y - WATER_Y) >= 3) return null;
    let best: Banana | null = null;
    let bestD = BN_BOARD_R;
    for (const b of this.bananas.values()) {
      const dd = Math.hypot(b.draw.x - x, b.draw.z - z);
      if (dd < bestD) {
        bestD = dd;
        best = b;
      }
    }
    if (!best) return null;
    const free = best.v.s.filter((s) => s === 0).length;
    const owner = this.d.boatOwner(best.v.i);
    if (best.speed > BN_BOARD_SPEED) return [[], 'Банан на ходу — подожди, пока лодка встанет'];
    if (!free) return [[], `На банане ${owner ? `за лодкой ${owner} ` : ''}мест нет — их три`];
    this.target = best.v.i;
    return [['E'], `сесть на банан${owner ? ` · лодка ${owner}` : ''} · мест ${free} из 3`];
  }

  /** Подсказка верхом и в воде */
  hint(): [string[], string] {
    const at = bnArgOf(this.arg);
    if (at.swim) return [['E'], 'обратно на банан'];
    const b = this.bananas.get(at.boat);
    const slow = !b || b.speed <= BN_BOARD_SPEED;
    return [['E'], slow ? 'спрыгнуть · у причала — на берег' : 'спрыгнуть в воду'];
  }

  /** В своей лодке за штурвалом: к подсказке лодки — «B — банан» */
  boatHint(h: [string[], string]): [string[], string] {
    if (!this.enabled || !this.d.driving()) return h;
    const i = this.d.myBoat();
    const has = i >= 0 && this.bananas.has(i);
    const text = has ? 'B — отцепить банан' : 'B — прицепить банан';
    return [h[0], h[1] ? `${h[1]} · ${text}` : text];
  }

  private hudUpdate(): void {
    const myId = this.d.myId();
    if (this.act === ACT_BANANA) {
      const at = bnArgOf(this.arg);
      const b = this.bananas.get(at.boat);
      if (!b) return this.hud.hide();
      if (at.swim) {
        const until = b.v.w[at.seat] ?? 0;
        const left = until > 0 ? Math.max(0, (until - this.renderTick) / TICK_RATE) : 0;
        this.hud.swim(left / (BN_BACK_TICKS / TICK_RATE), Math.ceil(left));
        return;
      }
      const a = this.anims.get(myId);
      this.hud.ride(a?.tilt ?? b.tilt[at.seat] ?? 0, b.held[at.seat] ?? 0, b.speed > BN_BOARD_SPEED);
      return;
    }
    // хозяин за штурвалом: кто на банане и сколько держится
    const i = this.d.driving() ? this.d.myBoat() : -1;
    const b = i >= 0 ? this.bananas.get(i) : undefined;
    if (b) {
      const rows: Array<{ nick: string; t: string; water: boolean }> = [];
      for (let s = 0; s < BN_SEATS; s++) {
        const slot = b.v.s[s];
        if (!slot) continue;
        rows.push({ nick: this.d.nick(slot) || '…', t: bnClock(b.held[s] ?? 0), water: (b.v.w[s] ?? 0) > 0 });
      }
      this.hud.driver(rows);
      return;
    }
    this.hud.hide();
  }

  debug(): object {
    return {
      enabled: this.enabled, ready: this.fleet.ready, drawn: this.fleet.drawn, target: this.target,
      bananas: [...this.bananas.values()].map((b) => ({ i: b.v.i, s: b.v.s, w: b.v.w, x: Math.round(b.draw.x * 10) / 10, z: Math.round(b.draw.z * 10) / 10, speed: Math.round(b.speed * 10) / 10, lat: b.lat, tilt: b.tilt, held: b.held })),
      anims: [...this.anims.entries()].map(([slot, a]) => ({ slot, phase: a.phase })),
    };
  }
}

// ------------------------------------------------------------ плашка равновесия (слот bc, над подсказкой)

export class BananaHud {
  private readonly root: HTMLElement;
  private readonly keyA: HTMLElement;
  private readonly keyD: HTMLElement;
  private readonly mark: HTMLElement;
  private readonly cap: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly rows: HTMLElement;
  private mode = '';
  private rowsKey = '';

  constructor(slots: HudSlots) {
    this.root = document.createElement('div');
    this.root.className = 'k-plate bn-hud';
    this.root.dataset.mode = 'regatta';
    this.root.hidden = true;
    this.root.innerHTML = `<div class="bn-cap"></div><div class="bn-row">${keyHtml('A')}<div class="bn-track"><i class="bn-mid"></i><i class="bn-mark"></i></div>${keyHtml('D')}</div>`
      + `<div class="bn-swim">${meterHtml(1, 'info', 'k-meter--thin')}</div><div class="bn-rows"></div>`;
    const keys = this.root.querySelectorAll<HTMLElement>('.bn-row > .k-key');
    this.keyA = keys[0];
    this.keyD = keys[1];
    this.mark = this.root.querySelector<HTMLElement>('.bn-mark')!;
    this.cap = this.root.querySelector<HTMLElement>('.bn-cap')!;
    this.bar = this.root.querySelector<HTMLElement>('.bn-swim .k-meter')!;
    this.rows = this.root.querySelector<HTMLElement>('.bn-rows')!;
    slots.bc.prepend(this.root);
  }

  private setMode(m: string): void {
    if (this.mode === m) return;
    this.mode = m;
    this.root.dataset.bn = m;
    this.root.hidden = m === '';
  }

  hide(): void {
    this.setMode('');
  }

  /** Верхом: крен −1…1 (метка), «Держишься 0:23», какую клавишу жать — светится */
  ride(tilt: number, held: number, moving: boolean): void {
    this.setMode('ride');
    const t = Math.max(-1, Math.min(1, tilt));
    this.mark.style.left = `${50 + t * 50}%`;
    this.root.classList.toggle('is-edge', Math.abs(t) > 0.8);
    this.keyA.classList.toggle('is-hot', t > 0.15);
    this.keyD.classList.toggle('is-hot', t < -0.15);
    const text = moving ? `Держишься ${bnClock(held)}` : 'Держись крепче — сейчас поедем';
    if (this.cap.textContent !== text) this.cap.textContent = text;
  }

  /** В воде: сколько осталось на «E — обратно» */
  swim(frac: number, secs: number): void {
    this.setMode('swim');
    setMeter(this.bar, Math.max(0, Math.min(1, frac)));
    const text = `Плюх! Обратно — ещё ${secs} с`;
    if (this.cap.textContent !== text) this.cap.textContent = text;
  }

  /** Хозяину за штурвалом: кто на банане */
  driver(rows: Array<{ nick: string; t: string; water: boolean }>): void {
    this.setMode('drive');
    const text = rows.length ? 'На банане — стряхни их!' : 'Банан пустой — зови к стоянке';
    if (this.cap.textContent !== text) this.cap.textContent = text;
    const key = rows.map((r) => `${r.nick}|${r.t}|${r.water}`).join(';');
    if (key === this.rowsKey) return;
    this.rowsKey = key;
    this.rows.innerHTML = rows.map((r) => `<span class="bn-who${r.water ? ' is-water' : ''}">${escHtml(r.nick)} <b>${r.water ? 'в воде' : r.t}</b></span>`).join('');
  }
}
