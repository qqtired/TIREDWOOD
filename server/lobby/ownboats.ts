// Свои лодки на сервере (флаг ISLE, shared/ownboat.ts): вызов к берту стоянки или причала острова, кто где сидит,
// шаги лодки по входам штурмана (тот же бюджет шагов, что у регаты и самолёта), якорь и ловля с якоря (все трое —
// на места рыбалки в лодке), швартовка и высадка только у причала, деспавн: у причала стоят не больше 8 (на острове 4) —
// уходит та, что дольше всех стоит без хозяина на борту; хозяин вышел из игры — у причала через 30 мин, в море через 10 с
// (пассажиров Гоша отвозит к ближайшему причалу). Покупка — действие buyBoat у Семёна (server/lobby/fishnpc.ts).
// Позиции лодок на ходу — obPos ближним 30 раз в секунду, дальним — 2; штурману — точное состояние (obMe).
import { TICK_RATE } from '../../shared/constants.ts';
import { BOAT_FISH_FIRST, BOAT_FISH_SPOTS } from '../../shared/fishplaces.ts';
import { BOATS, boatById, boatBuyState, boatIndex, ownedBoats } from '../../shared/fishboat.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import {
  BERTHS, OB_ANCHORED, OB_DOCK, OB_DROP, OB_GONE_DOCK_TICKS, OB_GONE_SEA_TICKS, OB_KEEP_FREE, OB_MOOR, OB_NEAR, OB_PASSENGER_LEVEL, OB_RAISE, OB_SEA,
  OB_SEND_EVERY, OB_SEND_FAR, OB_SUMMON, OB_WORLD_MAX, berthLabel, berthLanding, canAnchorAt, dockBerths, isParkBerth, makeObState, nearDock, nearestLanding,
  anchorZone, obArg, obPosPush, seatCastYaw, seatWorld, startMove, stepOwnBoat, ISLE_DOCK_CENTER, PARK_CENTER, type ObState, type ObView,
} from '../../shared/ownboat.ts';
import { makeInput, type Input } from '../../shared/sim.ts';
import { StepBudget } from './regatta.ts';
import type { LobbyPlayer } from './room.ts';

export interface OwnBoatsHost {
  tick(): number;
  players(): Iterable<LobbyPlayer>;
  /** Есть профиль и это не проверочный вход */
  can(p: LobbyPlayer): boolean;
  fishLevel(p: LobbyPlayer): number;
  /** Посадить в лодку (действие ACT_OWNBOAT с аргументом arg) и держать на месте */
  board(p: LobbyPlayer, arg: number): void;
  /** Желейка на своём месте в лодке: x, y, z, куда смотрит */
  seat(p: LobbyPlayer, x: number, y: number, z: number, yaw: number): void;
  /** Высадить на берег (из рыбалки — тоже) */
  land(p: LobbyPlayer, at: { x: number; y: number; z: number; yaw: number }): void;
  /** Лодка на якоре: на место рыбалки в лодке (ACT_FISH, место spot) и обратно на сиденье (ACT_OWNBOAT, arg) */
  fish(p: LobbyPlayer, spot: number): void;
  unfish(p: LobbyPlayer, arg: number): void;
  /** На месте рыбалки идёт поклёвка или вываживание */
  reeling(spot: number): boolean;
  send(p: LobbyPlayer, msg: ServerMsg): void;
  broadcast(msg: ServerMsg): void;
  toast(p: LobbyPlayer, text: string): void;
  announce(text: string): void;
  /** «Продать улов» из меню своей лодки: текст для тоста */
  sell(p: LobbyPlayer): string;
  /** Своя лодка появилась (on) или исчезла — для радио на лодке (пакет радио) */
  boatChanged?(pid: number, i: number, on: boolean): void;
}

interface Boat {
  i: number;
  s: ObState;
  pid: number;
  nick: string;
  /** Хозяин в игре (null — вышел) и с какого тика его нет */
  owner: LobbyPlayer | null;
  gone: number;
  seats: Array<LobbyPlayer | null>;
  /** С какого тика стоит у причала без хозяина на борту (0 — хозяин на борту или лодка не у причала) */
  idle: number;
  budget: StepBudget;
  /** С какого входа штурмана — бросить или поднять якорь (Infinity — не просил) */
  anchorAt: number;
  lastPh: number;
}

/** Тики → «12 мин» / «40 с» */
function ago(ticks: number): string {
  const s = Math.max(1, Math.round(ticks / TICK_RATE));
  return s < 90 ? `${s} с` : `${Math.round(s / 60)} мин`;
}

const IDLE: Input = makeInput();

export class OwnBoats {
  readonly boats: Array<Boat | null> = new Array<Boat | null>(OB_WORLD_MAX).fill(null);
  private readonly where = new Map<LobbyPlayer, { b: Boat; seat: number }>();
  private dirty = true;
  private readonly host: OwnBoatsHost;

  constructor(host: OwnBoatsHost) {
    this.host = host;
  }

  /** Сколько лодок в мире */
  get count(): number {
    let n = 0;
    for (const b of this.boats) if (b) n++;
    return n;
  }

  /** Сидит ли игрок в лодке (на сиденье или с удочкой на якоре) */
  aboard(p: LobbyPlayer): boolean {
    return this.where.has(p);
  }

  /** Лодка игрока (хозяин) */
  boatOf(pid: number): Boat | null {
    for (const b of this.boats) if (b && b.pid === pid) return b;
    return null;
  }

  /** Кто занял берт (у берта, швартуется или подходит по вызову) */
  private atBerth(berth: number): Boat | null {
    for (const b of this.boats) {
      if (b && b.s.b === berth && (b.s.ph === OB_DOCK || b.s.ph === OB_MOOR || b.s.ph === OB_SUMMON)) return b;
    }
    return null;
  }

  // ------------------------------------------------------------ вызов, посадка, высадка

  /** Вызвать свою лодку boat к свободному берту berth (игрок — у этого причала) */
  summon(p: LobbyPlayer, berth: unknown, boat: unknown): void {
    const h = this.host;
    if (!h.can(p) || this.where.has(p)) return;
    const prof = p.client.profile!;
    const kind = boatById(boat);
    if (!kind || !ownedBoats(prof.fishing).includes(kind.id)) {
      h.toast(p, 'Своя лодка продаётся у Деда Семёна — вкладка «⛵ Лодки»');
      return;
    }
    if (typeof berth !== 'number' || !Number.isInteger(berth) || berth < 0 || berth >= BERTHS.length) return;
    const dock = isParkBerth(berth) ? 'park' : 'isle';
    const c = dock === 'park' ? PARK_CENTER : ISLE_DOCK_CENTER;
    if (Math.hypot(p.state.x - c.x, p.state.z - c.z) > 45) {
      h.toast(p, dock === 'park' ? 'Лодку вызывают на стоянке за домом Семёна' : 'Подойди к причалу острова');
      return;
    }
    if (this.atBerth(berth)) {
      h.toast(p, 'Это место занято — выбери свободное');
      return;
    }
    const mine = this.boatOf(prof.id);
    if (!mine && this.count >= OB_WORLD_MAX) {
      h.toast(p, 'Все лодки в море — подожди, пока кто-то пришвартуется');
      return;
    }
    if (mine) this.dismiss(mine, 'recall');
    const i = this.boats.indexOf(null);
    const s = makeObState(boatIndex(kind.id));
    startMove(s, berth, true);
    const b: Boat = {
      i, s, pid: prof.id, nick: p.client.nick, owner: p, gone: 0, seats: [null, null, null], idle: h.tick(), budget: new StepBudget(),
      anchorAt: Infinity, lastPh: s.ph,
    };
    this.boats[i] = b;
    this.dirty = true;
    this.keepFree(dock, b);
    h.toast(p, `«${kind.name}» подходит к месту ${berthLabel(berth)} — E у таблички, чтобы сесть за штурвал`);
    h.boatChanged?.(b.pid, i, true);
  }

  /** E у берта: своя лодка — за штурвал, чужая (хозяин за штурвалом) — пассажиром */
  use(p: LobbyPlayer, berth: number): void {
    const h = this.host;
    if (!h.can(p) || this.where.has(p)) return;
    const b = this.atBerth(berth);
    if (!b) return;
    if (b.s.ph !== OB_DOCK) {
      h.toast(p, 'Лодка подходит к месту — подожди пару секунд');
      return;
    }
    const kind = BOATS[b.s.kind];
    if (b.pid === p.client.pid) {
      this.board(b, p, 0);
      h.toast(p, isParkBerth(berth) ? `«${kind.name}» · S — отойти задним ходом, W — газ, A/D — руль, Z — якорь` : `«${kind.name}» · W — газ, A/D — руль, Z — якорь`);
      return;
    }
    if (h.fishLevel(p) < OB_PASSENGER_LEVEL) {
      h.toast(p, `Пассажиром — с ${OB_PASSENGER_LEVEL}-го уровня рыбалки`);
      return;
    }
    if (!b.owner || b.seats[0] !== b.owner) {
      h.toast(p, `Это лодка ${b.nick} — сесть можно, когда хозяин за штурвалом`);
      return;
    }
    const seat = b.seats[1] === null ? 1 : b.seats[2] === null ? 2 : -1;
    if (seat < 0) {
      h.toast(p, 'В лодке мест нет — их три');
      return;
    }
    this.board(b, p, seat);
    h.toast(p, `Ты в лодке ${b.nick} · с якоря ловят все трое · сойти — у стоянки или причала острова`);
    if (b.owner) h.toast(b.owner, `${p.client.nick} сел к тебе в лодку`);
  }

  private board(b: Boat, p: LobbyPlayer, seat: number): void {
    // сначала комната отпускает прежнее (лавку, удочку), потом игрок — в лодке
    this.host.board(p, obArg(b.i, seat));
    b.seats[seat] = p;
    this.where.set(p, { b, seat });
    if (p === b.owner) b.idle = 0;
    this.follow(b);
    this.dirty = true;
  }

  /** Встал с места: на берег у берта (или к ближайшему причалу), лодка остаётся */
  private unseat(p: LobbyPlayer, at: { x: number; y: number; z: number; yaw: number } | null): void {
    const w = this.where.get(p);
    if (!w) return;
    w.b.seats[w.seat] = null;
    this.where.delete(p);
    if (p === w.b.owner && w.b.s.ph === OB_DOCK) w.b.idle = this.host.tick();
    if (at) this.host.land(p, at);
    this.dirty = true;
  }

  /** Лодка уходит: всех на берег (у берта или к ближайшему причалу), хозяину — тост */
  private dismiss(b: Boat, why: 'park' | 'gone' | 'recall'): void {
    const h = this.host;
    const docked = b.s.ph === OB_DOCK && b.s.b >= 0;
    for (const p of b.seats) {
      if (!p) continue;
      const at = docked ? berthLanding(b.s.b) : nearestLanding(b.s.x, b.s.z);
      this.unseat(p, { x: at.x + (Math.random() - 0.5) * 0.6, y: at.y, z: at.z, yaw: at.yaw });
      if (!docked && p !== b.owner) h.toast(p, why === 'gone' ? 'Хозяин лодки ушёл — тебя подбросил Гоша' : 'Хозяин отозвал лодку — тебя подбросил Гоша');
    }
    if (why === 'park' && b.owner) {
      h.toast(b.owner, `Твоя «${BOATS[b.s.kind].name}» ушла со стоянки — стояла без хозяина ${ago(h.tick() - b.idle)}. Вызови снова у свободного места`);
    }
    this.boats[b.i] = null;
    this.dirty = true;
    h.boatChanged?.(b.pid, b.i, false);
  }

  /**
   * У причала (стоянка или остров) стоять могут все, кроме двух бертов: нужен берт, а свободных меньше двух — уходит
   * лодка, которая дольше всех стоит без хозяина на борту (кроме keep).
   */
  private keepFree(dock: 'park' | 'isle', keep: Boat | null): void {
    const berths = dockBerths(dock);
    for (;;) {
      let used = 0;
      let old: Boat | null = null;
      for (const b of this.boats) {
        if (!b || !berths.includes(b.s.b) || (b.s.ph !== OB_DOCK && b.s.ph !== OB_MOOR && b.s.ph !== OB_SUMMON)) continue;
        used++;
        if (b === keep || b.s.ph !== OB_DOCK || b.idle === 0 || (b.owner && b.seats.includes(b.owner))) continue;
        if (!old || b.idle < old.idle) old = b;
      }
      if (berths.length - used >= OB_KEEP_FREE || !old) return;
      this.dismiss(old, 'park');
    }
  }

  // ------------------------------------------------------------ сообщения

  message(p: LobbyPlayer, msg: { a?: unknown; b?: unknown; boat?: unknown; at?: unknown }): void {
    switch (msg.a) {
      case 'summon':
        this.summon(p, msg.b, msg.boat);
        return;
      case 'e':
        this.onE(p);
        return;
      case 'anchor':
        this.onAnchor(p, msg.at);
        return;
      case 'horn': {
        const w = this.where.get(p);
        if (w && w.seat === 0) this.host.broadcast({ t: 'obHorn', i: w.b.i });
        return;
      }
      case 'sell':
        this.onSell(p);
        return;
    }
  }

  /** E в лодке: у берта — сойти; штурман в 25 м от причала — пришвартоваться; в море — подсказка */
  private onE(p: LobbyPlayer): void {
    const h = this.host;
    const w = this.where.get(p);
    if (!w) return;
    const b = w.b;
    const s = b.s;
    if (s.ph === OB_DOCK) {
      this.unseat(p, berthLanding(s.b));
      return;
    }
    // на якоре встал с удочки — E, и снова с удочкой
    if (s.ph === OB_ANCHORED) {
      this.host.fish(p, BOAT_FISH_FIRST + b.i * 3 + w.seat);
      return;
    }
    if (w.seat !== 0 || p !== b.owner) {
      h.toast(p, 'Сойти можно только у стоянки или у причала острова');
      return;
    }
    if (s.ph === OB_DROP) {
      h.toast(p, 'Сначала подними якорь — Z');
      return;
    }
    if (s.ph !== OB_SEA) return;
    const dock = nearDock(s.x, s.z);
    if (!dock) {
      h.toast(p, 'Пришвартоваться — в 25 м от стоянки за домом Семёна или причала острова');
      return;
    }
    // ближайший свободный берт этого причала
    let best = -1;
    let bestD = Infinity;
    for (const k of dockBerths(dock)) {
      if (this.atBerth(k)) continue;
      const d = Math.hypot(BERTHS[k].x - s.x, BERTHS[k].z - s.z);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best < 0) {
      h.toast(p, 'Все места у причала заняты — подожди немного');
      return;
    }
    startMove(s, best, false);
    b.budget = new StepBudget();
    b.anchorAt = Infinity;
    this.dirty = true;
    this.keepFree(dock, b);
    h.toast(p, `Швартуемся к месту ${berthLabel(best)}…`);
  }

  /** Z у штурмана: бросить (не у причалов и мостков) или поднять якорь (никто не вываживает рыбу) */
  private onAnchor(p: LobbyPlayer, at: unknown): void {
    const h = this.host;
    const w = this.where.get(p);
    if (!w || w.seat !== 0 || p !== w.b.owner) return;
    const b = w.b;
    const s = b.s;
    if (typeof at !== 'number' || !Number.isSafeInteger(at) || at <= 0 || b.anchorAt !== Infinity) return;
    if (s.ph === OB_SEA) {
      if (!canAnchorAt(s.x, s.z)) {
        h.toast(p, 'Здесь фарватер — отойди подальше');
        return;
      }
    } else if (s.ph === OB_ANCHORED || s.ph === OB_DROP) {
      for (let seat = 0; seat < 3; seat++) {
        const r = b.seats[seat];
        if (r && h.reeling(BOAT_FISH_FIRST + b.i * 3 + seat)) {
          h.toast(p, `Подожди — ${r === p ? 'у тебя' : r.client.nick + ' —'} рыба на крючке`);
          return;
        }
      }
    } else {
      if (s.ph === OB_DOCK) h.toast(p, 'У причала якорь не нужен — отойди в море');
      return;
    }
    b.anchorAt = at;
  }

  /** «Продать улов» из меню своей лодки: лодка у стоянки или у причала острова */
  private onSell(p: LobbyPlayer): void {
    const h = this.host;
    const b = this.boatOf(p.client.pid);
    const w = this.where.get(p);
    if (!b || !w || w.b !== b) return;
    if (b.s.ph !== OB_DOCK && !nearDock(b.s.x, b.s.z, 10)) {
      h.toast(p, 'Продать улов из лодки можно у стоянки или у причала острова');
      return;
    }
    h.toast(p, h.sell(p));
  }

  // ------------------------------------------------------------ тик

  /** Входы игрока в лодке (из обхода игроков комнаты): штурману — шаги лодки, остальным — просто съесть очередь. */
  consume(p: LobbyPlayer): void {
    const w = this.where.get(p);
    const q = p.inq;
    if (w && w.seat === 0 && p === w.b.owner) {
      const b = w.b;
      b.budget.run(q, p.lastInput, (inp) => {
        const a = inp.seq >= b.anchorAt;
        if (a) b.anchorAt = Infinity;
        p.state.prevButtons = inp.buttons;
        if (stepOwnBoat(b.s, inp, a)) this.departed(b);
      });
      return;
    }
    const n = q.due();
    for (let k = 0; k < n; k++) {
      const inp = q.shift();
      const last = p.lastInput;
      last.seq = inp.seq;
      last.buttons = inp.buttons;
      last.yaw = inp.yaw;
      last.pitch = inp.pitch;
      last.viewTick = inp.viewTick;
      p.state.prevButtons = inp.buttons;
    }
  }

  /** Лодка отошла от берта: место свободно */
  private departed(b: Boat): void {
    b.idle = 0;
    this.dirty = true;
  }

  /** Тик: лодки без штурмана, смена фаз, уход хозяина, места пассажиров, позиции. Вызывать после обхода игроков. */
  step(): void {
    const h = this.host;
    const tick = h.tick();
    for (const b of this.boats) {
      if (!b) continue;
      const s = b.s;
      const driven = b.owner !== null && b.seats[0] === b.owner;
      if (!driven && s.ph !== OB_DOCK && s.ph !== OB_ANCHORED) stepOwnBoat(s, IDLE, false);
      if (s.ph !== b.lastPh) {
        const was = b.lastPh;
        b.lastPh = s.ph;
        this.phase(b, was, s.ph);
      }
      if (b.gone && tick - b.gone >= (s.ph === OB_DOCK ? OB_GONE_DOCK_TICKS : OB_GONE_SEA_TICKS)) {
        this.dismiss(b, 'gone');
        continue;
      }
      this.follow(b);
    }
    this.send(tick);
  }

  private phase(b: Boat, was: number, ph: number): void {
    const h = this.host;
    this.dirty = true;
    if (ph === OB_ANCHORED) {
      // якорь на дне: все трое — с удочкой на своём месте (заброс — ЛКМ)
      const kind = BOATS[b.s.kind];
      for (let seat = 0; seat < 3; seat++) {
        const at = seatWorld(b.s, kind, seat);
        const spot = BOAT_FISH_SPOTS[b.i * 3 + seat];
        spot.x = at.x;
        spot.z = at.z;
        spot.yaw = seatCastYaw(b.s.yaw, seat);
        spot.zone = anchorZone(at.x, at.z);
        spot.sonar = kind.sonar;
        const p = b.seats[seat];
        if (p) {
          h.fish(p, BOAT_FISH_FIRST + b.i * 3 + seat);
          h.toast(p, `⚓ Якорь на дне — ЛКМ, заброс! Эхолот: поклёвка на ${Math.round(kind.sonar * 100)} % быстрее`);
        }
      }
    } else if (was === OB_ANCHORED) {
      for (let seat = 0; seat < 3; seat++) {
        const p = b.seats[seat];
        if (p) h.unfish(p, obArg(b.i, seat));
      }
    }
    if (ph === OB_DOCK) {
      b.idle = b.owner && b.seats.includes(b.owner) ? 0 : h.tick();
      if (was === OB_MOOR && b.seats[0]) h.toast(b.seats[0], `Пришвартовались у места ${berthLabel(b.s.b)} — E, чтобы сойти на берег`);
      this.keepFree(isParkBerth(b.s.b) ? 'park' : 'isle', b);
    }
    if (was === OB_DOCK && ph === OB_SEA) b.idle = 0;
    if (ph === OB_SEA && was === OB_RAISE && b.seats[0]) h.toast(b.seats[0], 'Якорь поднят — полный вперёд!');
  }

  /** Пассажиры и штурман — на своих местах по позе лодки (на якоре с удочкой — тоже) */
  private follow(b: Boat): void {
    const kind = BOATS[b.s.kind];
    for (let seat = 0; seat < 3; seat++) {
      const p = b.seats[seat];
      if (!p) continue;
      const at = seatWorld(b.s, kind, seat);
      this.host.seat(p, at.x, at.y, at.z, b.s.ph === OB_ANCHORED ? seatCastYaw(b.s.yaw, seat) : b.s.yaw);
    }
  }

  /** Игрок ушёл из комнаты (или его подняли силой): с места; хозяин — лодка ждёт его 30 мин у причала, 10 с в море */
  drop(p: LobbyPlayer): void {
    if (this.where.has(p)) this.unseat(p, null);
    for (const b of this.boats) {
      if (!b || b.owner !== p) continue;
      b.owner = null;
      b.gone = this.host.tick();
      if (b.s.ph === OB_DOCK && !b.idle) b.idle = this.host.tick();
      this.dirty = true;
    }
  }

  /** Вернулся в игру: его лодка снова его (таймер ухода снят) */
  rejoin(p: LobbyPlayer): void {
    const b = p.client.profile ? this.boatOf(p.client.profile.id) : null;
    if (!b || b.owner) return;
    b.owner = p;
    b.gone = 0;
    b.nick = p.client.nick;
    this.dirty = true;
  }

  /** С удочки на якоре — обратно на сиденье (E у места рыбалки в лодке) */
  unfish(p: LobbyPlayer): void {
    const w = this.where.get(p);
    if (w) this.host.unfish(p, obArg(w.b.i, w.seat));
  }

  // ------------------------------------------------------------ рассылка

  views(): ObView[] {
    const out: ObView[] = [];
    for (const b of this.boats) {
      if (!b) continue;
      out.push({
        i: b.i, k: b.s.kind, pid: b.pid, slot: b.owner?.slot ?? 0, nick: b.nick, s: [b.seats[0]?.slot ?? 0, b.seats[1]?.slot ?? 0, b.seats[2]?.slot ?? 0],
        idle: b.idle,
      });
    }
    return out;
  }

  /** Все лодки с позициями — вошедшему на набережную и всем при смене состава */
  full(): ServerMsg {
    const pos: number[] = [];
    for (const b of this.boats) if (b) obPosPush(pos, b.i, b.s);
    return { t: 'ob', k: this.host.tick(), boats: this.views(), pos };
  }

  private send(tick: number): void {
    const h = this.host;
    if (this.dirty) {
      this.dirty = false;
      h.broadcast(this.full());
    }
    if (tick % OB_SEND_EVERY !== 0) return;
    const far = tick % OB_SEND_FAR === 0;
    let moving = false;
    for (const b of this.boats) if (b && b.s.ph !== OB_DOCK && b.s.ph !== OB_ANCHORED) moving = true;
    if (!moving) return;
    for (const p of h.players()) {
      const pos: number[] = [];
      for (const b of this.boats) {
        if (!b || b.s.ph === OB_DOCK || b.s.ph === OB_ANCHORED) continue;
        if (!far && Math.hypot(b.s.x - p.state.x, b.s.z - p.state.z) > OB_NEAR) continue;
        obPosPush(pos, b.i, b.s);
      }
      if (pos.length) h.send(p, { t: 'obPos', k: tick, p: pos });
      const w = this.where.get(p);
      if (w && w.seat === 0 && p === w.b.owner) h.send(p, { t: 'obMe', i: w.b.i, ack: p.inq.ack, s: { ...w.b.s } });
    }
  }

  /** Носитель радио (server/lobby/boatradio.ts): лодка i — хозяин, ник, кто на борту (id профилей); нет лодки — null */
  radioCarrier(i: number): { id: number; owner: number; nick: string; aboard: number[] } | null {
    const b = Number.isInteger(i) && i >= 0 ? this.boats[i] : null;
    if (!b) return null;
    const aboard: number[] = [];
    for (const p of b.seats) if (p?.client.profile) aboard.push(p.client.profile.id);
    return { id: b.i, owner: b.pid, nick: b.nick, aboard };
  }

  /** Отладка и тесты */
  debug(): Array<{ i: number; kind: string; nick: string; ph: number; x: number; z: number; b: number; seats: string[]; idle: number; gone: number }> {
    return this.boats.filter((b): b is Boat => !!b).map((b) => ({
      i: b.i, kind: BOATS[b.s.kind].id, nick: b.nick, ph: b.s.ph, x: b.s.x, z: b.s.z, b: b.s.b, seats: b.seats.map((p) => p?.client.nick ?? ''), idle: b.idle, gone: b.gone,
    }));
  }
}

/** Купить лодку у Семёна: уровень рыбалки, жетоны; списывает сервер. Возвращает текст для окна. */
export function buyBoat(prof: { tokens: number; fishing: { boats?: string[] } }, id: unknown, fishLevel: number, spend: (n: number) => boolean): { ok: boolean; text: string } {
  const kind = boatById(id);
  if (!kind) return { ok: false, text: 'Такой лодки у Семёна нет' };
  const owned = ownedBoats(prof.fishing);
  const st = boatBuyState(kind, owned, fishLevel, prof.tokens);
  if (st === 'owned') return { ok: false, text: `«${kind.name}» уже твоя` };
  if (st === 'level') return { ok: false, text: `«${kind.name}» — с ${kind.level}-го уровня рыбалки (у тебя ${fishLevel}-й)` };
  if (st === 'tokens' || !spend(kind.price)) return { ok: false, text: `«${kind.name}» стоит ${kind.price} 🪙, а у тебя ${prof.tokens}` };
  prof.fishing.boats = [...owned, kind.id];
  return { ok: true, text: `«${kind.name}» — твоя! Лодку вызывают на стоянке за домом — E у свободного места` };
}

export { OB_SEA };
