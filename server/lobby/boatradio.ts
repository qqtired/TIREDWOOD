// Радио на лодках (shared/boatradio.ts): сервер хранит состояние радио каждого носителя (лодки), решает, кому можно
// им управлять (хозяин — всегда, остальные на борту — если хозяин разрешил), и рассылает все радио на воде.
// Музыку синтезирует клиент, место в эфире — по серверным часам (RADIO_EPOCH): сервер ничего не «проигрывает».
//
// Носители — через хозяина (room.ts): лодки пакета B (boat(id) — после слияния подключить свои лодки, см. ниже)
// и тестовый носитель для разработки: /radio в чате набережной (--dev или DEV_GO=1) — «переносное радио» у желейки,
// «на борту» — кто ближе RADIO_DEV_ABOARD_R к хозяину. Номер тестового носителя — минус id профиля хозяина.
import {
  RADIO_DEV_ABOARD_R, radioApply, radioDefault, radioRefusalText, radioWire,
  type RadioCarrier, type RadioPatch, type RadioServerMsg, type RadioState, type RadioWire,
} from '../../shared/boatradio.ts';

/** Игрок набережной так, как его видит радио: id профиля и где стоит */
export interface RadioPlayerLike {
  client: { profile: { id: number; nick: string } | null };
  state: { x: number; y: number; z: number };
}

export interface RadioHost {
  now(): number;
  /** Игроки набережной (тестовый носитель: хозяин и кто рядом) */
  players(): Iterable<RadioPlayerLike>;
  /**
   * Лодка игрока по номеру (пакет B): хозяин и кто на борту; null — нет такой лодки. Пока лодок нет — всегда null.
   * Подключить: (id) => ownBoats.radioCarrier(id), а при деспавне лодки звать BoatRadios.drop(id).
   */
  boat(id: number): (RadioCarrier & { nick: string }) | null;
  broadcast(msg: RadioServerMsg): void;
}

export class BoatRadios {
  private readonly host: RadioHost;
  private readonly states = new Map<number, RadioState>();
  /** Тестовые носители: хозяин (id профиля) → ник */
  private readonly dev = new Map<number, string>();

  constructor(host: RadioHost) {
    this.host = host;
  }

  /** Носитель по номеру: тестовый (отрицательный номер) или лодка */
  carrier(id: number): (RadioCarrier & { nick: string }) | null {
    if (id < 0) {
      const owner = -id;
      const nick = this.dev.get(owner);
      return nick === undefined ? null : { id, owner, nick, aboard: this.near(owner) };
    }
    return this.host.boat(id);
  }

  /** Кто ближе RADIO_DEV_ABOARD_R к хозяину тестового носителя (id профилей, с ним самим) */
  private near(owner: number): number[] {
    let me: RadioPlayerLike | null = null;
    for (const p of this.host.players()) if (p.client.profile?.id === owner) me = p;
    if (!me) return [];
    const out: number[] = [];
    for (const p of this.host.players()) {
      const prof = p.client.profile;
      if (!prof) continue;
      if (Math.hypot(p.state.x - me.state.x, p.state.z - me.state.z) <= RADIO_DEV_ABOARD_R && Math.abs(p.state.y - me.state.y) < 3) out.push(prof.id);
    }
    return out;
  }

  /** Все радио на воде (и выключенные: окно показывает станцию и разрешение) */
  wires(): RadioWire[] {
    const out: RadioWire[] = [];
    for (const [id, s] of this.states) {
      const c = this.carrier(id);
      if (c) out.push(radioWire(id, c.owner, c.nick, s, id < 0));
    }
    // тестовые носители без состояния — тоже (у хозяина появляется кнопка радио)
    for (const [owner, nick] of this.dev) if (!this.states.has(-owner)) out.push(radioWire(-owner, owner, nick, radioDefault(), true));
    return out;
  }

  private view(): RadioServerMsg {
    return { t: 'radio', now: this.host.now(), r: this.wires() };
  }

  /** Вошедшему на набережную — все радио */
  welcome(send: (m: RadioServerMsg) => void): void {
    send(this.view());
  }

  private changed(): void {
    this.host.broadcast(this.view());
  }

  /** Просьба игрока pid: решает сервер; отказ — текстом (тост), иначе всем — новые радио */
  act(pid: number, msg: { id?: unknown } & RadioPatch, reply: (m: RadioServerMsg) => void): void {
    const id = msg.id;
    const carrier = typeof id === 'number' && Number.isInteger(id) ? this.carrier(id) : null;
    if (!carrier) return reply({ t: 'radioRes', text: radioRefusalText('carrier', '') });
    const cur = this.states.get(carrier.id) ?? radioDefault();
    const patch: RadioPatch = {};
    for (const k of ['on', 'st', 'vol', 'all'] as const) if (msg[k] !== undefined) (patch as Record<string, unknown>)[k] = msg[k];
    const res = radioApply(cur, carrier, pid, patch);
    if (!res.ok) return reply({ t: 'radioRes', text: radioRefusalText(res.why, carrier.nick) });
    this.states.set(carrier.id, res.state);
    this.changed();
  }

  /** Лодка появилась (пакет B): у хозяина и пассажиров появляется кнопка радио (выключено) */
  boatUp(id: number): void {
    if (id < 0 || this.states.has(id) || !this.host.boat(id)) return;
    this.states.set(id, radioDefault());
    this.changed();
  }

  /** Носитель исчез (лодку убрали): его радио молчит у всех */
  drop(id: number): void {
    if (this.states.delete(id)) this.changed();
  }

  /** Игрок ушёл с набережной: его тестовый носитель пропадает */
  left(pid: number): void {
    if (!this.dev.delete(pid)) return;
    this.states.delete(-pid);
    this.changed();
  }

  /** /radio в чате (только --dev или DEV_GO=1 — проверяет комната): дать или убрать тестовое радио. true — съедено. */
  devCommand(pid: number, nick: string, text: string, toast: (text: string) => void): boolean {
    if (!/^\/radio(\s|$)/.test(text)) return false;
    if (this.dev.has(pid)) {
      this.left(pid);
      toast('📻 Тестовое радио убрано');
      return true;
    }
    this.dev.set(pid, nick);
    this.changed();
    toast('📻 Тестовое радио у тебя — R или кнопка справа внизу. Рядом (6 м) — «на борту»');
    return true;
  }
}
