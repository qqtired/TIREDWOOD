// «Люди собираются в круг»: строки в общий чат, чтобы остальные подтягивались. Здесь только логика — часы и «сказать
// в чат» приходят снаружи (server/lobby/room.ts зовёт её раз в проверку кругов), поэтому анти-спам проверяется
// тестом без сервера (test/circlechat.test.ts).
//
// Круг сбора (картинг, регата у пирса, прятки, Fight Club) пишет в чат, когда:
//  · человек простоял в круге не меньше CIRCLE_DWELL_MS — пробегающий мимо не в счёт;
//  · круг был пуст и в него встали («ждёт в круге — 1/6») или людей в нём стало больше («уже 2/6»);
//  · на этот круг с прошлой строки прошло не меньше CIRCLE_GAP_MS (кого строка не дождалась, тот попадёт в следующую,
//    если ещё стоит), а про этого игрока — не меньше PLAYER_GAP_MS: встал, вышел, встал снова — молчим. Счёт игрока
//    общий на все круги и входы.
// Круг ушёл в режим — одна строка «Картинг: поехали, 3 игрока». Вход в пейнтбол, крепость или «Выше облаков» (круг на
// 3 с или E) — одна строка «заходит в «Пейнтбол» — внутри 2/16» с теми же двумя ограничениями.
// Пустая набережная не повод молчать: одинокий игрок мог позвать друзей — строка нужна и для одного.
import { MAX_HUMANS } from '../../shared/constants.ts';
import { FORT_MAX_HUMANS } from '../../shared/fort.ts';
import { SKILL_CAPACITY } from '../../shared/skilltest.ts';

/** Игрок, про которого может быть строка */
export interface CircleFolk {
  pid: number;
  nick: string;
}

export type DoorKind = 'paintball' | 'fort' | 'skill';
export type CircleKind = 'kart' | 'boatrace' | 'hide' | 'fight' | DoorKind;

/** Сколько человек вмещает комната режима — для «внутри 2/16» */
const DOOR_MAX: Readonly<Record<DoorKind, number>> = { paintball: MAX_HUMANS, fort: FORT_MAX_HUMANS, skill: SKILL_CAPACITY };

/** Вход в режим, где собирать круг не нужно: игрок уходит в комнату сам (круг на 3 с или E) */
export function isDoor(kind: string): kind is DoorKind {
  return Object.hasOwn(DOOR_MAX, kind);
}

/** Что сказать про круг: значок, имя режима и глагол для строки «поехали» (у входов без сбора его нет) */
const LOOK: Readonly<Record<CircleKind, { icon: string; title: string; go?: string }>> = {
  kart: { icon: '🏁', title: 'Картинг', go: 'поехали' },
  boatrace: { icon: '🚤', title: 'Портовая регата', go: 'поехали' },
  hide: { icon: '🔎', title: 'Прятки', go: 'начинаем' },
  fight: { icon: '🥊', title: 'Fight Club', go: 'бой' },
  paintball: { icon: '🎯', title: 'Пейнтбол' },
  fort: { icon: '🏰', title: 'Крепость' },
  skill: { icon: '☁️', title: 'Выше облаков' },
};

/** Простоял в круге столько — тогда он «встал в круг», а не пробежал мимо */
export const CIRCLE_DWELL_MS = 2000;
/** Про один круг — не чаще раза в столько */
export const CIRCLE_GAP_MS = 20_000;
/** Про одного игрока — не чаще раза в столько (на все круги сразу) */
export const PLAYER_GAP_MS = 60_000;
/** Строка «поехали» про один круг — не чаще раза в столько (заезды и так идут дольше; это страховка) */
export const LAUNCH_GAP_MS = 10_000;

export interface CircleChatHost {
  now(): number;
  say(text: string): void;
}

interface Stand {
  nick: string;
  /** Когда встал (мс); сходит с места — запись пропадает, вернулся — запись новая */
  since: number;
  /** Про него уже сказали (он вошёл в число прошлой строки) */
  told: boolean;
}

interface Ring {
  stands: Map<number, Stand>;
  /** Сколько людей в круге уже названо в чат; людей стало меньше — столько же, чтобы рост считался от нового числа */
  base: number;
  lastLine: number;
  lastGo: number;
}

/** «1 игрок», «3 игрока», «5 игроков» */
export function playersWord(n: number): string {
  const m100 = n % 100;
  const m10 = n % 10;
  const w = m100 >= 11 && m100 <= 14 ? 'игроков' : m10 === 1 ? 'игрок' : m10 >= 2 && m10 <= 4 ? 'игрока' : 'игроков';
  return `${n} ${w}`;
}

export class CircleChat {
  private readonly host: CircleChatHost;
  private readonly rings = new Map<CircleKind, Ring>();
  /** Когда про игрока (pid) писали в последний раз */
  private readonly said = new Map<number, number>();
  private pruneAt = 0;

  constructor(host: CircleChatHost) {
    this.host = host;
  }

  /**
   * Раз в проверку: кто стоит в круге сбора сейчас, max — сколько мест. Порядок не важен: кто раньше встал,
   * помнит сама запись. Пустой список тоже нужен — круг опустел, следующий вошедший снова «первый».
   */
  update(kind: CircleKind, max: number, folk: readonly CircleFolk[]): void {
    let ring = this.rings.get(kind);
    if (!ring) {
      if (!folk.length) return;
      ring = this.ringOf(kind);
    }
    const now = this.host.now();
    const here = new Set<number>();
    for (const f of folk) {
      here.add(f.pid);
      const s = ring.stands.get(f.pid);
      if (s) s.nick = f.nick;
      else ring.stands.set(f.pid, { nick: f.nick, since: now, told: false });
    }
    for (const pid of ring.stands.keys()) if (!here.has(pid)) ring.stands.delete(pid);
    const ripe: Array<[number, Stand]> = [];
    for (const e of ring.stands) if (now - e[1].since >= CIRCLE_DWELL_MS) ripe.push(e);
    const n = Math.min(ripe.length, max);
    if (n < ring.base) ring.base = n;
    if (n <= ring.base || now - ring.lastLine < CIRCLE_GAP_MS) return;
    // назвать того, кто встал последним из ещё не названных (и про кого можно: счёт игрока)
    let who: [number, Stand] | null = null;
    for (const e of ripe) if (!e[1].told && this.free(e[0], now) && (!who || e[1].since >= who[1].since)) who = e;
    if (!who) return;
    const look = LOOK[kind];
    const tail = n >= max ? 'круг полон!' : 'подходите!';
    this.host.say(`${look.icon} ${who[1].nick} ждёт в круге «${look.title}» — ${ring.base === 0 ? '' : 'уже '}${n}/${max}, ${tail}`);
    for (const e of ripe) e[1].told = true;
    ring.base = n;
    ring.lastLine = now;
    this.said.set(who[0], now);
    this.prune(now);
  }

  /** Круг ушёл в режим: одна строка, сколько человек поехало. */
  launched(kind: CircleKind, count: number): void {
    if (count < 1) return;
    const now = this.host.now();
    const ring = this.ringOf(kind);
    if (now - ring.lastGo < LAUNCH_GAP_MS) return;
    ring.lastGo = now;
    const look = LOOK[kind];
    this.host.say(`${look.icon} ${look.title}: ${look.go ?? 'поехали'}, ${playersWord(count)}`);
  }

  /** Игрок вошёл в режим (круг на 3 с или E): inside — сколько в комнате вместе с ним. */
  door(kind: DoorKind, who: CircleFolk, inside: number): void {
    const now = this.host.now();
    const max = DOOR_MAX[kind];
    const ring = this.ringOf(kind);
    if (now - ring.lastLine < CIRCLE_GAP_MS || !this.free(who.pid, now)) return;
    ring.lastLine = now;
    this.said.set(who.pid, now);
    const look = LOOK[kind];
    this.host.say(`${look.icon} ${who.nick} заходит в «${look.title}» — внутри ${inside}/${max}, ${inside >= max ? 'мест больше нет' : 'подходите'}!`);
    this.prune(now);
  }

  private ringOf(kind: CircleKind): Ring {
    let ring = this.rings.get(kind);
    if (!ring) {
      ring = { stands: new Map(), base: 0, lastLine: -Infinity, lastGo: -Infinity };
      this.rings.set(kind, ring);
    }
    return ring;
  }

  private free(pid: number, now: number): boolean {
    const t = this.said.get(pid);
    return t === undefined || now - t >= PLAYER_GAP_MS;
  }

  /** Старые записи про игроков не копим: раз в минуту выбрасываем те, что и так уже не мешают */
  private prune(now: number): void {
    if (now < this.pruneAt) return;
    this.pruneAt = now + PLAYER_GAP_MS;
    for (const [pid, t] of this.said) if (now - t >= PLAYER_GAP_MS) this.said.delete(pid);
  }
}
