// Ожидание загрузки перед стартом раунда — общее для всех режимов.
// Хаб после перевода в комнату (move) записывает игрока в «загружается», клиент присылает {t:'ready', e} после
// первого кадра нового мира. Пока кто-то в комнате грузится (каждого ждём не дольше LOAD_WAIT_TICKS), отсчёт перед
// стартом раунда стоит: у комнаты есть геттер `prestart` (решётка, вступление, сбор, разминка), ему каждый тик
// сдвигаем phaseEnd. Всем в комнате — кто заходит и грузится ({t:'load'}), а когда дождались — за 3 с до старта
// {t:'go'} для крупного отсчёта. На набережной ждать нечего.
import { TICK_RATE } from '../shared/constants.ts';
import type { FcMode } from '../shared/fight.ts';
import { GO_TICKS, LOAD_WAIT_TICKS, stillLoading, type LoadServerMsg, type LoadWho } from '../shared/loading.ts';
import { isRaceTrackId } from '../shared/racecourse.ts';
import type { Client, Hub, Room } from './hub.ts';

interface Arrival {
  c: Client;
  /** Номер перехода, с которым вошёл: сменился — ушёл в другую комнату */
  epoch: number;
  /** Тик хаба, когда вошёл */
  at: number;
  ok: boolean;
}

interface RoomWait {
  arrivals: Arrival[];
  /** Что последним показали комнате (чтобы не слать одно и то же) */
  shown: string;
  /** Дождались: за GO_TICKS до старта раунда послать `go` */
  goArmed: boolean;
}

/** Что ворота берут у хаба: часы, соединения, переходы (и для проверочной команды — комнаты). */
type GateHub = Pick<Hub, 'tick' | 'clients' | 'lobby' | 'paintball' | 'race' | 'skill' | 'hide' | 'fort' | 'fight' | 'boatrace'
  | 'move' | 'startRace' | 'startFight' | 'startBoatRace' | 'privateLine'>;

const FC_MODES: readonly FcMode[] = ['duel', 'team', 'ffa'];

export class ReadyGate {
  /** Проверочная команда /go (сервер разработки или DEV_GO=1) */
  devGo = false;
  private readonly hub: GateHub;
  private readonly rooms = new Map<Room, RoomWait>();
  /** Клиенты, которые умеют сообщать «готов» (прислали его хоть раз — уже после первой набережной) */
  private readonly capable = new WeakSet<Client>();

  constructor(hub: GateHub) {
    this.hub = hub;
  }

  /** Хаб перевёл c в room (письмо `scene` уже ушло): ждём его «готов». */
  moved(c: Client, room: Room): void {
    // кто ни разу не сказал «готов» (старый клиент, проверка после выкладки), того не ждём — как раньше
    if (room.kind === 'lobby' || c.ephemeral || !this.capable.has(c)) return;
    let w = this.rooms.get(room);
    if (!w) this.rooms.set(room, (w = { arrivals: [], shown: '', goArmed: false }));
    w.arrivals = w.arrivals.filter((a) => a.c !== c);
    w.arrivals.push({ c, epoch: c.epoch, at: this.hub.tick, ok: false });
  }

  /** {t:'ready', e}: новый мир у игрока отрисован. Чужой или старый номер перехода — мимо. */
  ready(c: Client, e: unknown): void {
    if (e !== c.epoch || !c.room) return;
    this.capable.add(c);
    const a = this.rooms.get(c.room)?.arrivals.find((x) => x.c === c && x.epoch === e);
    if (a) a.ok = true;
  }

  /** Игрок ещё грузит свою комнату (его можно, например, не подставлять под выстрелы). */
  loading(c: Client): boolean {
    const a = c.room ? this.rooms.get(c.room)?.arrivals.find((x) => x.c === c) : undefined;
    return !!a && a.epoch === c.epoch && stillLoading(a.ok, a.at, this.hub.tick);
  }

  /** Каждый тик хаба, до шагов комнат. */
  step(): void {
    const tick = this.hub.tick;
    for (const [room, w] of this.rooms) {
      const before = w.arrivals.length;
      if (before) {
        w.arrivals = w.arrivals.filter((a) => !a.c.closed && a.c.room === room && a.c.epoch === a.epoch);
        let left = 0;
        for (const a of w.arrivals) if (stillLoading(a.ok, a.at, tick)) left = Math.max(left, a.at + LOAD_WAIT_TICKS - tick);
        // держим отсчёт перед стартом: он стоит, пока кто-то грузится
        const pre = room.prestart;
        if (left > 0 && pre) pre.phaseEnd++;
        const who: LoadWho[] = w.arrivals.map((a) => ({ nick: a.c.nick, ok: a.ok }));
        const wait = left > 0 ? Math.ceil(left / TICK_RATE) : 0;
        const key = JSON.stringify([who, wait]);
        if (key !== w.shown) {
          w.shown = key;
          this.send(room, { t: 'load', who, wait });
        }
        if (left === 0) {
          // дождались (или больше не ждём): дальше — отсчёт самой комнаты, за 3 с до старта — `go`
          w.arrivals = [];
          w.shown = '';
          w.goArmed = true;
        }
      }
      if (w.goArmed && w.arrivals.length === 0) {
        const pre = room.prestart;
        const ticks = pre ? pre.phaseEnd - room.tick : 0;
        if (!pre || ticks <= 0) w.goArmed = false;
        else if (ticks <= GO_TICKS) {
          w.goArmed = false;
          this.send(room, { t: 'go', ms: Math.round((ticks * 1000) / TICK_RATE) });
        }
      }
      if (w.arrivals.length === 0 && !w.goArmed) this.rooms.delete(room);
    }
  }

  private send(room: Room, msg: LoadServerMsg): void {
    for (const c of this.hub.clients) if (c.room === room && c.profile && !c.closed) c.sink.sendJson(msg);
  }

  /**
   * Проверка переходов без прогулки по набережной: `/go fort`, `/go race foundry`, `/go fight duel`, `/go lobby`…
   * Только на сервере разработки или с DEV_GO=1. true — команда съедена.
   */
  command(c: Client, text: string): boolean {
    if (!this.devGo || !/^\/go(\s|$)/.test(text)) return false;
    const [, kind = '', arg = ''] = text.trim().split(/\s+/);
    const h = this.hub;
    const say = (s: string): void => h.privateLine(c, s);
    switch (kind) {
      case 'lobby': h.move(c, h.lobby, true); break;
      case 'paintball': h.move(c, h.paintball, true); break;
      case 'fort': if (h.fort) h.move(c, h.fort, true); else say('Крепость выключена'); break;
      case 'skill': if (h.skill) h.move(c, h.skill, true); else say('Полоса выключена'); break;
      case 'hide': if (h.hide) h.move(c, h.hide, true); else say('Прятки выключены'); break;
      case 'race':
      case 'kart':
        if (!h.race.idle) say('Гонка уже идёт');
        else h.startRace([c], isRaceTrackId(arg) ? arg : 'port');
        break;
      case 'fight':
        if (!h.fight) say('Fight Club выключен');
        else if (!h.fight.idle) say('Бой уже идёт');
        else h.startFight([c], [], FC_MODES.includes(arg as FcMode) ? (arg as FcMode) : 'duel');
        break;
      case 'boatrace':
        if (h.boatrace?.idle) h.startBoatRace([c]); else say('Катера выключены или заняты');
        break;
      default:
        say('/go lobby | paintball | fort | skill | hide | race [port|foundry] | fight [duel|team|ffa] | boatrace');
    }
    return true;
  }
}
