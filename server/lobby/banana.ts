// Банан за своей лодкой (BANANA + ISLE): три седока, крен от троса и A/D, пять секунд на возврат из воды.
// Числа, физика и сообщения — shared/banana.ts; комната отвечает за действия и перемещение желеек.
import {
  BN_BACK_TICKS, BN_BOARD_R, BN_BOARD_SPEED, BN_CALL_EVERY, BN_HITCH_SPEED, BN_RUN_SPEED, BN_SEATS,
  bnArg, bnChatLine, bnDockPull, bnHitch, bnLean, bnPosPush, bnRiderStep, bnSeatWorld, bnSpeed, bnStep, bnSwimAt, bnWave,
  makeBnPose, makeBnRider, type BnPose, type BnResultRow, type BnRider, type BnServerMsg, type BnView,
} from '../../shared/banana.ts';
import { TICK_RATE, WATER_Y } from '../../shared/constants.ts';
import { BOATS } from '../../shared/fishboat.ts';
import { isHeld } from '../../shared/lobby.ts';
import {
  OB_DOCK, OB_NEAR, OB_SEND_EVERY, OB_SEND_FAR, OB_WORLD_MAX, berthLanding, isParkBerth, nearDock, nearestLanding, type ObState,
} from '../../shared/ownboat.ts';
import type { OwnBoats } from './ownboats.ts';
import type { LobbyPlayer } from './room.ts';

export interface BananasHost {
  tick(): number;
  players(): Iterable<LobbyPlayer>;
  can(p: LobbyPlayer): boolean;
  board(p: LobbyPlayer, arg: number): void;
  seat(p: LobbyPlayer, x: number, y: number, z: number, yaw: number): void;
  land(p: LobbyPlayer, at: { x: number; y: number; z: number; yaw: number }): void;
  send(p: LobbyPlayer, msg: BnServerMsg): void;
  broadcast(msg: BnServerMsg): void;
  toast(p: LobbyPlayer, text: string): void;
  announce(text: string): void;
}

interface Rider {
  p: LobbyPlayer;
  rider: BnRider;
  streak: number;
  swimUntil: number;
  swim: { x: number; z: number };
}

interface Banana {
  i: number;
  pid: number;
  nick: string;
  /** Ссылка отличает повторно вызванную лодку того же хозяина в том же слоте. */
  boat: ObState;
  attached: boolean;
  pose: BnPose;
  seats: Array<Rider | null>;
  active: boolean;
  falls: number;
  rows: Map<number, BnResultRow>;
  calledAt: number;
}

export class Bananas {
  private readonly boats: OwnBoats;
  private readonly host: BananasHost;
  private readonly bananas: Array<Banana | null> = new Array<Banana | null>(OB_WORLD_MAX).fill(null);
  private readonly where = new Map<LobbyPlayer, { b: Banana; seat: number }>();
  private dirty = true;

  constructor(boats: OwnBoats, host: BananasHost) {
    this.boats = boats;
    this.host = host;
  }

  aboard(p: LobbyPlayer): boolean {
    return this.where.has(p);
  }

  message(p: LobbyPlayer, msg: { a?: unknown; i?: unknown }): void {
    switch (msg.a) {
      case 'hitch': this.hitch(p); return;
      case 'board': this.board(p, msg.i); return;
      case 'e': this.onE(p); return;
    }
  }

  private boat(b: Banana) {
    const boat = this.boats.boatInfo(b.i);
    return boat && boat.pid === b.pid && boat.s === b.boat ? boat : null;
  }

  private hitch(p: LobbyPlayer): void {
    const h = this.host;
    if (!h.can(p)) return;
    const owned = this.boats.boatOf(p.client.pid);
    if (!owned) return;
    const boat = this.boats.boatInfo(owned.i);
    if (!boat || boat.owner !== p || boat.driver !== p) return;
    const s = boat.s;
    if (Math.abs(s.v) > BN_HITCH_SPEED) {
      h.toast(p, 'Сбавь ход — банан цепляют на малом ходу');
      return;
    }
    if (s.ph === OB_DOCK && !isParkBerth(s.b)) {
      h.toast(p, 'Банан цепляют у стоянки за домом Семёна или в море');
      return;
    }
    let b = this.bananas[owned.i];
    if (b && !this.boat(b)) {
      this.gone(b);
      b = null;
    }
    if (!b) {
      b = {
        i: owned.i, pid: boat.pid, nick: boat.nick, boat: s, attached: false, pose: makeBnPose(),
        seats: new Array<Rider | null>(BN_SEATS).fill(null), active: false, falls: 0, rows: new Map(), calledAt: -BN_CALL_EVERY,
      };
      this.bananas[b.i] = b;
    }
    b.nick = boat.nick;
    if (b.attached) {
      if (b.seats.some(Boolean) && s.ph !== OB_DOCK) {
        h.toast(p, 'На банане сидят — сначала к причалу');
        return;
      }
      for (const r of b.seats) if (r) this.landing(b, r);
      this.finish(b);
      b.attached = false;
      h.toast(p, 'Банан отцеплен');
    } else {
      bnHitch(b.pose, { x: s.x, z: s.z, yaw: s.yaw, length: BOATS[s.kind].length });
      b.attached = true;
      h.toast(p, '🍌 Банан прицеплен — садятся E у банана. Стряхивай резкими поворотами!');
      if (nearDock(s.x, s.z) === 'park' && h.tick() - b.calledAt >= BN_CALL_EVERY) {
        b.calledAt = h.tick();
        h.announce(`🍌 ${boat.nick} прицепил банан к лодке «${BOATS[s.kind].name}» — садись у стоянки за домом Семёна, E у банана`);
      }
    }
    this.dirty = true;
  }

  private board(p: LobbyPlayer, i: unknown): void {
    const h = this.host;
    if (!h.can(p) || isHeld(p.action) || this.boats.aboard(p) || this.aboard(p)) return;
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= OB_WORLD_MAX) return;
    const b = this.bananas[i];
    if (!b?.attached) return;
    const boat = this.boat(b);
    if (!boat) return;
    if (Math.hypot(p.state.x - b.pose.x, p.state.z - b.pose.z) > BN_BOARD_R || Math.abs(p.state.y - WATER_Y) >= 3) return;
    if (bnSpeed(b.pose) > BN_BOARD_SPEED) {
      h.toast(p, 'Банан на ходу — подожди, пока лодка встанет');
      return;
    }
    const seat = b.seats.indexOf(null);
    if (seat < 0) {
      h.toast(p, 'На банане мест нет — их три');
      return;
    }
    h.board(p, bnArg(i, seat));
    const r: Rider = { p, rider: makeBnRider(), streak: 0, swimUntil: 0, swim: { x: 0, z: 0 } };
    b.seats[seat] = r;
    this.where.set(p, { b, seat });
    this.record(b, r);
    this.follow(b, r, seat);
    this.dirty = true;
    h.toast(p, '🍌 Держись на A/D: клонит вправо — жми A, влево — D · E — спрыгнуть');
    if (boat.driver) h.toast(boat.driver, `${p.client.nick} сел на банан`);
  }

  private onE(p: LobbyPlayer): void {
    const w = this.where.get(p);
    if (!w) return;
    const { b, seat } = w;
    const boat = this.boat(b);
    if (!boat) { this.gone(b); return; }
    const r = b.seats[seat]!;
    if (r.swimUntil > 0) {
      if (this.host.tick() >= r.swimUntil) { this.rescue(b, r); return; }
      p.arg = bnArg(b.i, seat);
      p.selfReset = true;
      r.rider = makeBnRider();
      r.streak = 0;
      r.swimUntil = 0;
      this.record(b, r);
      this.follow(b, r, seat);
      const at = bnSeatWorld(b.pose, seat, WATER_Y);
      this.host.broadcast({ t: 'bnFx', i: b.i, a: 'back', seat, slot: p.slot, x: at.x, z: at.z, side: 0 });
      this.dirty = true;
    } else if (bnSpeed(b.pose) <= BN_BOARD_SPEED && (boat.s.ph === OB_DOCK || nearDock(boat.s.x, boat.s.z, 10) !== null)) {
      this.landing(b, r);
    } else {
      this.fall(b, r, seat, Math.sign(r.rider.tilt) || 1, true);
    }
  }

  /** Входы расходуются как у пассажира лодки; крен считается один раз за тик. */
  consume(p: LobbyPlayer): void {
    const n = p.inq.due();
    for (let k = 0; k < n; k++) {
      const inp = p.inq.shift();
      Object.assign(p.lastInput, inp);
      p.state.prevButtons = inp.buttons;
    }
  }

  step(): void {
    const tick = this.host.tick();
    for (const b of this.bananas) {
      if (!b) continue;
      const boat = this.boat(b);
      if (!boat) { this.gone(b); continue; }
      if (!b.attached) continue;
      b.nick = boat.nick;
      const s = boat.s;
      // у берта стоянки банан подтягивают к корме (с пальца до него дотягиваются), иначе — на тросе
      if (s.ph === OB_DOCK && isParkBerth(s.b)) bnDockPull(b.pose, { x: s.x, z: s.z, yaw: s.yaw, length: BOATS[s.kind].length }, 1 / TICK_RATE);
      else bnStep(b.pose, { x: s.x, z: s.z, yaw: s.yaw, length: BOATS[s.kind].length }, 1 / TICK_RATE);
      const speed = bnSpeed(b.pose);
      for (let seat = 0; seat < BN_SEATS; seat++) {
        const r = b.seats[seat];
        if (!r) continue;
        if (r.swimUntil > 0) {
          if (tick >= r.swimUntil) { this.rescue(b, r); continue; }
        } else {
          const fell = bnRiderStep(r.rider, b.pose.lat, bnLean(r.p.lastInput.buttons), bnWave(tick, b.i, seat, speed), seat, speed);
          if (speed >= BN_RUN_SPEED) { r.streak++; b.active = true; }
          if (fell) this.fall(b, r, seat, Math.sign(r.rider.tilt) || 1);
        }
        this.follow(b, r, seat);
      }
      if (b.active && (s.ph === OB_DOCK || !b.seats.some(Boolean))) this.finish(b);
    }
    this.send(tick);
  }

  private follow(b: Banana, r: Rider, seat: number): void {
    if (r.swimUntil > 0) {
      this.host.seat(r.p, r.swim.x, WATER_Y - 0.45, r.swim.z, r.p.heldYaw);
    } else {
      const at = bnSeatWorld(b.pose, seat, WATER_Y);
      this.host.seat(r.p, at.x, at.y, at.z, b.pose.yaw);
    }
  }

  private record(b: Banana, r: Rider): void {
    const pid = r.p.client.pid;
    const row = b.rows.get(pid);
    if (row) row.best = Math.max(row.best, r.streak);
    else b.rows.set(pid, { nick: r.p.client.nick, best: r.streak });
  }

  private fall(b: Banana, r: Rider, seat: number, side: number, jump = false): void {
    const h = this.host;
    this.record(b, r);
    r.streak = 0;
    bnSwimAt(b.pose, seat, side, r.swim);
    r.swimUntil = h.tick() + BN_BACK_TICKS;
    r.p.arg = bnArg(b.i, seat, true);
    r.p.selfReset = true;
    this.follow(b, r, seat);
    h.broadcast({ t: 'bnFx', i: b.i, a: jump ? 'jump' : 'fall', seat, slot: r.p.slot, x: r.swim.x, z: r.swim.z, side });
    if (!jump) {
      b.falls++;
      const driver = this.boat(b)?.driver;
      if (driver) h.toast(driver, `Стряхнул ${r.p.client.nick}!`);
    }
    // упавшему — без тоста: плашка «Плюх! Обратно — ещё N с» и подсказка «E — обратно» уже на экране
    this.dirty = true;
  }

  /** Ушёл из комнаты или его подняли силой: освободить место, сохранить лучший отрезок. */
  drop(p: LobbyPlayer): void {
    const w = this.where.get(p);
    if (!w) return;
    const r = w.b.seats[w.seat]!;
    this.record(w.b, r);
    w.b.seats[w.seat] = null;
    this.where.delete(p);
    this.dirty = true;
  }

  private landing(b: Banana, r: Rider, at?: { x: number; y: number; z: number; yaw: number }): void {
    const s = this.boat(b)?.s;
    const pos = r.swimUntil > 0 ? r.swim : b.pose;
    at ??= s?.ph === OB_DOCK && s.b >= 0 ? berthLanding(s.b) : nearestLanding(pos.x, pos.z);
    this.drop(r.p);
    this.host.land(r.p, { ...at, x: at.x + (Math.random() - 0.5) * 0.6 });
  }

  private rescue(b: Banana, r: Rider): void {
    this.landing(b, r, nearestLanding(r.swim.x, r.swim.z));
    this.host.toast(r.p, 'Не успел — тебя выловил Гоша и привёз на стоянку');
  }

  private gone(b: Banana): void {
    for (const r of b.seats) {
      if (!r) continue;
      const pos = r.swimUntil > 0 ? r.swim : b.pose;
      this.landing(b, r, nearestLanding(pos.x, pos.z));
      this.host.toast(r.p, 'Лодка ушла — тебя подбросил Гоша');
    }
    this.finish(b);
    this.bananas[b.i] = null;
    if (b.attached) this.dirty = true;
  }

  private finish(b: Banana): void {
    for (const r of b.seats) if (r) this.record(b, r);
    if (b.active) {
      const line = bnChatLine(BOATS[b.boat.kind].name, b.nick, [...b.rows.values()], b.falls);
      if (line) this.host.announce(line);
    }
    b.active = false;
    b.falls = 0;
    b.rows.clear();
    for (const r of b.seats) {
      if (!r || r.swimUntil > 0) continue;
      r.streak = 0;
      this.record(b, r);
    }
  }

  private pos(out: number[], b: Banana): void {
    bnPosPush(out, b.i, b.pose, b.seats.map(r => r && !r.swimUntil ? r.rider : null), b.seats.map(r => r && !r.swimUntil ? r.streak : 0));
  }

  full(): Extract<BnServerMsg, { t: 'bn' }> {
    const b: BnView[] = [];
    const pos: number[] = [];
    for (const banana of this.bananas) {
      if (!banana?.attached) continue;
      const s = banana.seats;
      b.push({ i: banana.i, s: [s[0]?.p.slot ?? 0, s[1]?.p.slot ?? 0, s[2]?.p.slot ?? 0], w: [s[0]?.swimUntil ?? 0, s[1]?.swimUntil ?? 0, s[2]?.swimUntil ?? 0] });
      this.pos(pos, banana);
    }
    return { t: 'bn', k: this.host.tick(), b, pos };
  }

  private send(tick: number): void {
    if (this.dirty) {
      this.dirty = false;
      this.host.broadcast(this.full());
    }
    if (tick % OB_SEND_EVERY !== 0) return;
    const moving = this.bananas.filter((b): b is Banana => !!b?.attached && (b.seats.some(Boolean) || bnSpeed(b.pose) > 0.05));
    if (!moving.length) return;
    const far = tick % OB_SEND_FAR === 0;
    for (const p of this.host.players()) {
      const pos: number[] = [];
      for (const b of moving) {
        if (!far && Math.hypot(b.pose.x - p.state.x, b.pose.z - p.state.z) > OB_NEAR) continue;
        this.pos(pos, b);
      }
      if (pos.length) this.host.send(p, { t: 'bnPos', k: tick, p: pos });
    }
  }
}
